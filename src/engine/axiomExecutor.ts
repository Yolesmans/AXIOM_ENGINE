import type { AxiomCandidate } from '../types/candidate.js';
import type { AnswerRecord } from '../types/answer.js';
import { executeProfilPrompt } from '../services/axiomExecutor.js';
import { candidateToSession } from '../utils/candidateAdapter.js';

// Steps minimaux
export const STEP_00_IDENTITY = 'STEP_00_IDENTITY';
export const STEP_01_TUTOVOU = 'STEP_01_TUTOVOU';
export const STEP_02_PREAMBULE = 'STEP_02_PREAMBULE';
export const STEP_03_BLOC1 = 'STEP_03_BLOC1';
export const STEP_99_MATCHING = 'STEP_99_MATCHING';

// Texte fixe pour tutoiement/vouvoiement (doit correspondre au prompt)
const TUTOVOU_QUESTION = 'Avant de commencer AXIOM, une dernière chose.\n\nPréférez-vous que l\'on se tutoie ou que l\'on se vouvoie ?';

// Directive système obligatoire
const SYSTEM_DIRECTIVE = 'RÈGLE ABSOLUE: Tu exécutes STRICTEMENT le protocole AXIOM fourni. Tu ne produis JAMAIS de texte hors protocole. À chaque message, tu dois produire UNIQUEMENT la prochaine sortie autorisée par le protocole (question suivante, transition de bloc, miroir interprétatif autorisé, ou texte obligatoire). INTERDICTION d\'improviser, de résumer, de commenter le système, de sauter un bloc. Si l\'état est ambigu, tu rejoues la dernière question valide exactement. Si la réponse utilisateur est invalide, tu reposes la même question sans avancer.';

// Validation sémantique minimale
function validateTutoiementVouvoiement(message: string): 'tutoiement' | 'vouvoiement' | null {
  const lower = message.toLowerCase();
  if (lower.includes('tutoi') || lower.includes('tutoie')) {
    return 'tutoiement';
  }
  if (lower.includes('vouvoi') || lower.includes('vouvoie')) {
    return 'vouvoiement';
  }
  return null;
}

// Extraire la dernière question d'un texte
function extractLastQuestion(text: string): string | null {
  if (!text || text.trim() === '') {
    return null;
  }
  const last400 = text.slice(-400);
  const lines = last400.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('?')) {
      return lines[i].trim();
    }
  }
  return null;
}

// Initialiser le state UI si absent
function ensureUIState(candidate: AxiomCandidate): AxiomCandidate {
  if (!candidate.session.ui) {
    const hasIdentity = candidate.identity.completedAt !== null;
    return {
      ...candidate,
      session: {
        ...candidate.session,
        ui: {
          step: hasIdentity ? STEP_01_TUTOVOU : STEP_00_IDENTITY,
          lastQuestion: null,
          identityDone: hasIdentity,
        },
      },
    };
  }
  return candidate;
}

// Construire la directive d'exécution selon le step
function buildExecutionDirective(step: string, lastQuestion: string | null): string {
  let directive = SYSTEM_DIRECTIVE;
  
  if (step === STEP_01_TUTOVOU) {
    directive += '\n\nÉTAT ACTUEL: Tu dois poser la question tutoiement/vouvoiement. Si la réponse utilisateur est valide (contient "tutoi" ou "vouvoi"), tu passes au préambule métier complet. Si invalide, tu reposes la même question.';
  } else if (step === STEP_02_PREAMBULE) {
    directive += '\n\nÉTAT ACTUEL: Tu dois afficher le préambule métier complet (une seule fois). Après l\'avoir affiché, tu passes à la première question du Bloc 1.';
  } else if (step === STEP_03_BLOC1) {
    directive += `\n\nÉTAT ACTUEL: Tu es dans les blocs AXIOM. Tu dois produire la prochaine sortie autorisée par le protocole.${lastQuestion ? ` Si la réponse utilisateur est invalide, tu reposes cette question: "${lastQuestion}"` : ''}`;
  }
  
  return directive;
}

export interface ExecuteAxiomResult {
  response: string;
  step: string;
  lastQuestion: string | null;
  tutoiement?: 'tutoiement' | 'vouvoiement';
}

export async function executeAxiom(
  candidate: AxiomCandidate,
  userMessage: string | null,
): Promise<ExecuteAxiomResult> {
  // S'assurer que le state UI existe
  let updatedCandidate = ensureUIState(candidate);
  const ui = updatedCandidate.session.ui!;
  let currentStep = ui.step;
  let lastQuestion = ui.lastQuestion;
  let tutoiement = ui.tutoiement;

  // STEP_00_IDENTITY : géré par l'API, on ne devrait pas arriver ici
  if (currentStep === STEP_00_IDENTITY) {
    return {
      response: "Avant de commencer AXIOM, j'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email",
      step: STEP_00_IDENTITY,
      lastQuestion: null,
    };
  }

  // STEP_01_TUTOVOU : validation tutoiement/vouvoiement
  if (currentStep === STEP_01_TUTOVOU) {
    if (!userMessage) {
      return {
        response: TUTOVOU_QUESTION,
        step: STEP_01_TUTOVOU,
        lastQuestion: TUTOVOU_QUESTION,
      };
    }

    const validation = validateTutoiementVouvoiement(userMessage);
    if (!validation) {
      // Réponse invalide, reposer la question
      return {
        response: 'Merci de répondre par « tutoiement » ou « vouvoiement ».',
        step: STEP_01_TUTOVOU,
        lastQuestion: TUTOVOU_QUESTION,
      };
    }

    // Réponse valide, passer au préambule
    tutoiement = validation;
    currentStep = STEP_02_PREAMBULE;
    lastQuestion = null;
  }

  // STEP_02_PREAMBULE : afficher le préambule métier (une seule fois)
  if (currentStep === STEP_02_PREAMBULE) {
    // Le préambule sera généré par OpenAI avec le prompt complet
    // On passe directement à STEP_03_BLOC1 après
    const directive = buildExecutionDirective(STEP_02_PREAMBULE, null);
    const session = candidateToSession(updatedCandidate);
    
    let aiResponse: string;
    try {
      aiResponse = await executeProfilPrompt(session, updatedCandidate.answers, directive);
      if (!aiResponse || aiResponse.trim() === '') {
        // Fallback : utiliser le texte de démarrage du prompt
        aiResponse = TUTOVOU_QUESTION;
      }
    } catch (error) {
      // En cas d'erreur, rejouer lastQuestion ou texte de démarrage
      aiResponse = lastQuestion || TUTOVOU_QUESTION;
    }

    // Extraire la dernière question si présente
    const extractedQuestion = extractLastQuestion(aiResponse);
    if (extractedQuestion) {
      lastQuestion = extractedQuestion;
    }

    // Passer à STEP_03_BLOC1 après affichage du préambule
    currentStep = STEP_03_BLOC1;

    return {
      response: aiResponse,
      step: currentStep,
      lastQuestion,
      tutoiement,
    };
  }

  // STEP_03_BLOC1+ : laisser le LLM dérouler avec le prompt complet
  if (currentStep === STEP_03_BLOC1) {
    if (!userMessage) {
      // Pas de message utilisateur, rejouer lastQuestion
      return {
        response: lastQuestion || 'Très bien. Continuons.',
        step: currentStep,
        lastQuestion,
        tutoiement,
      };
    }

    const directive = buildExecutionDirective(STEP_03_BLOC1, lastQuestion);
    const session = candidateToSession(updatedCandidate);
    
    let aiResponse: string;
    try {
      aiResponse = await executeProfilPrompt(session, updatedCandidate.answers, directive);
      if (!aiResponse || aiResponse.trim() === '') {
        // Fallback : rejouer lastQuestion
        aiResponse = lastQuestion || 'Très bien. Continuons.';
      }
    } catch (error) {
      // En cas d'erreur, rejouer lastQuestion
      aiResponse = lastQuestion || 'Très bien. Continuons.';
    }

    // Extraire la dernière question si présente
    const extractedQuestion = extractLastQuestion(aiResponse);
    if (extractedQuestion) {
      lastQuestion = extractedQuestion;
    }

    return {
      response: aiResponse,
      step: currentStep,
      lastQuestion,
      tutoiement,
    };
  }

  // STEP_99_MATCHING : géré séparément dans l'API
  if (currentStep === STEP_99_MATCHING) {
    return {
      response: lastQuestion || 'Matching en cours...',
      step: currentStep,
      lastQuestion,
      tutoiement,
    };
  }

  // Fallback par défaut
  return {
    response: lastQuestion || 'Très bien. Continuons.',
    step: currentStep,
    lastQuestion,
    tutoiement,
  };
}
