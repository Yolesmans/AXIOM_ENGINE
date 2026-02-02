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
const TUTOVOU_QUESTION = 'Bienvenue dans AXIOM.\nOn va découvrir qui tu es vraiment — pas ce qu\'il y a sur ton CV.\nPromis : je ne te juge pas. Je veux juste comprendre comment tu fonctionnes.\n\nOn commence tranquille.\nDis-moi : tu préfères qu\'on se tutoie ou qu\'on se vouvoie pour cette discussion ?';

// Préambule métier (texte fixe, tiré du prompt)
const PREAMBULE_METIER = `Avant de commencer vraiment, je te pose simplement le cadre.

Le métier concerné est celui de courtier en énergie.

Il consiste à accompagner des entreprises dans la gestion de leurs contrats d'électricité et de gaz :
	•	analyse de l'existant,
	•	renégociation auprès des fournisseurs,
	•	sécurisation des prix,
	•	suivi dans la durée.

Le client final ne paie rien directement.
La rémunération est versée par les fournisseurs, à la signature et sur la durée du contrat.

Il n'y a aucune garantie.
Certains gagnent peu. D'autres gagnent très bien.

La différence ne vient :
	•	ni du marché,
	•	ni du produit,
	•	ni de la chance,
mais de la constance, de l'autonomie, et de la capacité à tenir dans un cadre exigeant.

⸻

C'est précisément pour ça qu'AXIOM existe.

AXIOM n'est :
	•	ni un test,
	•	ni un jugement,
	•	ni une sélection déguisée.

Il n'est pas là pour te vendre ce métier, ni pour te faire entrer dans une case.

Son rôle est simple :
prendre le temps de comprendre comment tu fonctionnes réellement dans le travail,
et te donner une lecture lucide de ce que ce cadre exige au quotidien.

Pour certains profils, c'est un terrain d'expression très fort.
Pour d'autres, tout aussi solides, d'autres environnements sont simplement plus cohérents.

AXIOM est là pour apporter de la clarté :
	•	sans pression,
	•	sans promesse,
	•	sans te pousser dans une direction.`;

// Directive système obligatoire
const SYSTEM_DIRECTIVE = 'RÈGLE ABSOLUE: Tu exécutes STRICTEMENT le protocole AXIOM fourni. Tu ne produis JAMAIS de texte hors protocole. À chaque message, tu dois produire UNIQUEMENT la prochaine sortie autorisée par le protocole (question suivante, transition de bloc, miroir interprétatif autorisé, ou texte obligatoire). INTERDICTION d\'improviser, de résumer, de commenter le système, de sauter un bloc. Si l\'état est ambigu, tu rejoues la dernière question valide exactement. Si la réponse utilisateur est invalide, tu reposes la même question sans avancer. INTERDICTION de reposer une étape déjà validée.';

// Validation sémantique minimale (accepte orthographe imparfaite, synonymes, formulations naturelles)
function validateTutoiementVouvoiement(message: string): 'tutoiement' | 'vouvoiement' | null {
  const lower = message.toLowerCase();
  // Tutoiement : accepter tutoi, tutoie, tutoyer, tutoiement, on se tutoie, etc.
  if (lower.includes('tutoi') || lower.includes('tutoie') || lower.includes('tutoy')) {
    return 'tutoiement';
  }
  // Vouvoiement : accepter vouvoi, vouvoie, vouvoyer, vouvoiement, on se vouvoie, etc.
  if (lower.includes('vouvoi') || lower.includes('vouvoie') || lower.includes('vouvoy')) {
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
  
  if (step === STEP_03_BLOC1) {
    directive += `\n\nÉTAT ACTUEL: state.step = BLOC_1_Q1. Tu dois produire UNIQUEMENT la première question du Bloc 1 (Énergie & moteurs internes) au format A/B/C sur lignes séparées, selon le protocole AXIOM.${lastQuestion ? ` Si la réponse utilisateur est invalide, tu reposes cette question: "${lastQuestion}"` : ' C\'est la première question du Bloc 1, donc tu dois la poser maintenant.'}`;
    directive += '\n\nINTERDICTION de reposer la question tutoiement/vouvoiement ou le préambule métier. Ces étapes sont déjà validées.';
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
      // Pas de message utilisateur, poser la question tutoiement/vouvoiement
      return {
        response: TUTOVOU_QUESTION,
        step: STEP_01_TUTOVOU,
        lastQuestion: TUTOVOU_QUESTION,
      };
    }

    const validation = validateTutoiementVouvoiement(userMessage);
    if (!validation) {
      // Réponse invalide, reposer EXACTEMENT la même question
      return {
        response: TUTOVOU_QUESTION,
        step: STEP_01_TUTOVOU,
        lastQuestion: TUTOVOU_QUESTION,
      };
    }

    // Réponse valide, AVANCER au préambule métier
    tutoiement = validation;
    currentStep = STEP_02_PREAMBULE;
    lastQuestion = null;
    
    // Retourner immédiatement le préambule métier (texte fixe, pas besoin d'OpenAI)
    return {
      response: PREAMBULE_METIER,
      step: STEP_02_PREAMBULE,
      lastQuestion: null,
      tutoiement,
    };
  }

  // STEP_02_PREAMBULE : afficher le préambule métier (une seule fois, déjà fait)
  // Si on arrive ici, c'est qu'on vient de l'afficher, on passe à BLOC_1_Q1
  if (currentStep === STEP_02_PREAMBULE) {
    // Le préambule a déjà été affiché, passer à BLOC_1_Q1
    currentStep = STEP_03_BLOC1;
    lastQuestion = null;
    
    // Utiliser OpenAI pour générer la première question du Bloc 1
    const directive = buildExecutionDirective(STEP_03_BLOC1, null);
    const session = candidateToSession(updatedCandidate);
    
    let aiResponse: string;
    try {
      aiResponse = await executeProfilPrompt(session, updatedCandidate.answers, directive);
      if (!aiResponse || aiResponse.trim() === '') {
        // Fallback : rejouer la question attendue
        aiResponse = 'Très bien. Commençons par le Bloc 1 : Énergie & moteurs internes.';
      }
    } catch (error) {
      // En cas d'erreur, rejouer la question attendue
      aiResponse = 'Très bien. Commençons par le Bloc 1 : Énergie & moteurs internes.';
    }

    // Extraire la dernière question si présente
    const extractedQuestion = extractLastQuestion(aiResponse);
    if (extractedQuestion) {
      lastQuestion = extractedQuestion;
    }

    return {
      response: aiResponse,
      step: STEP_03_BLOC1,
      lastQuestion,
      tutoiement,
    };
  }

  // STEP_03_BLOC1+ : laisser le LLM dérouler avec le prompt complet
  if (currentStep === STEP_03_BLOC1) {
    if (!userMessage) {
      // Pas de message utilisateur, rejouer lastQuestion ou poser la première question du Bloc 1
      if (lastQuestion) {
        return {
          response: lastQuestion,
          step: STEP_03_BLOC1,
          lastQuestion,
          tutoiement,
        };
      }
      
      // Pas de lastQuestion, générer la première question du Bloc 1
      const directive = buildExecutionDirective(STEP_03_BLOC1, null);
      const session = candidateToSession(updatedCandidate);
      
      let aiResponse: string;
      try {
        aiResponse = await executeProfilPrompt(session, updatedCandidate.answers, directive);
        if (!aiResponse || aiResponse.trim() === '') {
          aiResponse = 'Très bien. Commençons par le Bloc 1 : Énergie & moteurs internes.';
        }
      } catch (error) {
        aiResponse = 'Très bien. Commençons par le Bloc 1 : Énergie & moteurs internes.';
      }

      const extractedQuestion = extractLastQuestion(aiResponse);
      return {
        response: aiResponse,
        step: STEP_03_BLOC1,
        lastQuestion: extractedQuestion,
        tutoiement,
      };
    }

    // Message utilisateur présent, analyser et avancer dans le protocole
    const directive = buildExecutionDirective(STEP_03_BLOC1, lastQuestion);
    const session = candidateToSession(updatedCandidate);
    
    let aiResponse: string;
    try {
      aiResponse = await executeProfilPrompt(session, updatedCandidate.answers, directive);
      if (!aiResponse || aiResponse.trim() === '') {
        // Fallback : rejouer lastQuestion si existe, sinon question par défaut
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
      step: STEP_03_BLOC1,
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
