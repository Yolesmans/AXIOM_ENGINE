import type { AxiomCandidate } from '../types/candidate.js';
import { candidateStore } from '../store/sessionStore.js';
import { callOpenAI } from './openaiClient.js';
import { BLOC_01, BLOC_02, BLOC_03, executeAxiom } from '../engine/axiomExecutor.js';
// getFullAxiomPrompt n'est pas exporté, on doit le reconstruire
import { PROMPT_AXIOM_ENGINE, PROMPT_AXIOM_PROFIL } from '../engine/prompts.js';
import {
  validateTraitsSpecificity,
  validateMotifsSpecificity,
  validateSynthesis2B,
  validateQuestion2A1,
  validateQuestion2A3,
  type ValidationResult
} from './validators.js';
import { validateMirrorREVELIOM, type MirrorValidationResult } from './validateMirrorReveliom.js';
import { parseMirrorSections } from './parseMirrorSections.js';

function getFullAxiomPrompt(): string {
  return `${PROMPT_AXIOM_ENGINE}\n\n${PROMPT_AXIOM_PROFIL}`;
}

// Helper pour construire l'historique conversationnel (copié depuis axiomExecutor)
const MAX_CONV_MESSAGES = 40;

function buildConversationHistory(candidate: AxiomCandidate): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  
  if (candidate.conversationHistory && candidate.conversationHistory.length > 0) {
    const history = candidate.conversationHistory;
    const recentHistory = history.slice(-MAX_CONV_MESSAGES);
    
    recentHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });
    return messages;
  }
  
  if (candidate.answers && candidate.answers.length > 0) {
    candidate.answers.forEach((answer) => {
      messages.push({
        role: 'user',
        content: answer.message,
      });
    });
  }
  
  return messages;
}

/**
 * Construit l'historique conversationnel avec injection FORCÉE des réponses BLOC 2A
 * 
 * Garantit que même si conversationHistory est tronqué, les réponses BLOC 2A
 * (médium, 3 œuvres, œuvre noyau) sont TOUJOURS injectées dans le contexte.
 * 
 * Utilisé pour BLOC 2B afin d'assurer la personnalisation des questions.
 */
function buildConversationHistoryForBlock2B(candidate: AxiomCandidate): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  
  // TOUJOURS inclure les réponses BLOC 2A dans le contexte (INJECTION FORCÉE)
  const answerMap = candidate.answerMaps?.[2];
  if (answerMap && answerMap.answers) {
    const answers = answerMap.answers;
    const mediumAnswer = answers[0] || 'N/A';
    const preferencesAnswer = answers[1] || 'N/A';
    const coreWorkAnswer = answers[2] || 'N/A';
    
    messages.push({
      role: 'system',
      content: `CONTEXTE BLOC 2A (OBLIGATOIRE — INJECTION FORCÉE) :
Médium choisi : ${mediumAnswer}
Préférences (3 œuvres) : ${preferencesAnswer}
Œuvre noyau : ${coreWorkAnswer}

Ces informations sont CRITIQUES pour personnaliser les questions BLOC 2B.
Chaque question doit être spécifique à ces œuvres.`
    });
    
    console.log('[ORCHESTRATOR] BLOC 2A context injected:', {
      medium: mediumAnswer,
      preferences: preferencesAnswer,
      coreWork: coreWorkAnswer
    });
  } else {
    console.warn('[ORCHESTRATOR] BLOC 2A answers not found in AnswerMap. BLOC 2B cannot be personalized.');
  }
  
  // Historique conversationnel standard
  if (candidate.conversationHistory && candidate.conversationHistory.length > 0) {
    const history = candidate.conversationHistory;
    const recentHistory = history.slice(-MAX_CONV_MESSAGES);
    
    recentHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });
  } else if (candidate.answers && candidate.answers.length > 0) {
    candidate.answers.forEach((answer) => {
      messages.push({
        role: 'user',
        content: answer.message,
      });
    });
  }
  
  return messages;
}

export interface OrchestratorResult {
  response: string;
  step: string;
  expectsAnswer: boolean;
  autoContinue: boolean;
  progressiveDisplay?: boolean;
  mirrorSections?: string[];
}

export class BlockOrchestrator {
  async handleMessage(
    candidate: AxiomCandidate,
    userMessage: string | null,
    event: string | null,
  ): Promise<OrchestratorResult> {
    // Déterminer le bloc en cours
    const currentBlock = candidate.session.currentBlock || 1;
    const currentStep = candidate.session.ui?.step || '';
    
    // Détecter BLOC 2A (première partie du BLOC 2)
    if (currentBlock === 2 && (currentStep === BLOC_02 || currentStep === '')) {
      // Vérifier si BLOC 2A est terminé (3 réponses stockées)
      const answerMap = candidate.answerMaps?.[2];
      const answers = answerMap?.answers || {};
      const answeredCount = Object.keys(answers).length;
      
      // Si BLOC 2A terminé (3 réponses) → passer à BLOC 2B
      if (answeredCount >= 3) {
        return this.handleBlock2B(candidate, userMessage, event);
      }
      
      // Sinon → continuer BLOC 2A
      return this.handleBlock2A(candidate, userMessage, event);
    }
    
    // BLOC 1 (logique existante)
    const blockNumber = 1;

    // Recharger candidate pour avoir l'état à jour
    const candidateId = candidate.candidateId;
    let currentCandidate = candidateStore.get(candidateId);
    if (!currentCandidate) {
      currentCandidate = await candidateStore.getAsync(candidateId);
    }
    if (!currentCandidate) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    const queue = currentCandidate.blockQueues?.[blockNumber];

    // Cas 1 : Event START_BLOC_1 ou début de bloc (pas de queue)
    if (event === 'START_BLOC_1' || !queue || queue.questions.length === 0) {
      console.log('[ORCHESTRATOR] generate questions bloc 1 (API)');
      const questions = await this.generateQuestionsForBlock1(currentCandidate);
      candidateStore.setQuestionsForBlock(currentCandidate.candidateId, blockNumber, questions);
      
      // Servir la première question
      return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
    }

    // Cas 2 : Réponse utilisateur reçue
    if (userMessage) {
      const currentQueue = currentCandidate.blockQueues?.[blockNumber];
      if (!currentQueue) {
        throw new Error(`Queue for block ${blockNumber} not found`);
      }

      // Le cursor pointe vers la question suivante (avancé dans serveNextQuestion)
      // Donc la question qui vient d'être posée est à l'index cursorIndex - 1
      const questionIndex = currentQueue.cursorIndex - 1;
      
      // Stocker la réponse dans AnswerMap
      candidateStore.storeAnswerForBlock(
        currentCandidate.candidateId,
        blockNumber,
        questionIndex,
        userMessage
      );

      // Recharger candidate après stockage
      const candidateId = currentCandidate.candidateId;
      currentCandidate = candidateStore.get(candidateId);
      if (!currentCandidate) {
        currentCandidate = await candidateStore.getAsync(candidateId);
      }
      if (!currentCandidate) {
        throw new Error(`Candidate ${candidateId} not found after storing answer`);
      }

      const finalQueue = currentCandidate.blockQueues?.[blockNumber];
      if (!finalQueue) {
        throw new Error(`Queue for block ${blockNumber} not found after reload`);
      }

      // Vérifier si toutes les questions ont été répondues
      if (finalQueue.cursorIndex >= finalQueue.questions.length) {
        // Toutes les questions répondues → Générer miroir
        console.log('[ORCHESTRATOR] generate mirror bloc 1 (API)');
        candidateStore.markBlockComplete(currentCandidate.candidateId, blockNumber);
        const mirror = await this.generateMirrorForBlock1(currentCandidate);
        
        // Enregistrer le miroir dans conversationHistory
        candidateStore.appendAssistantMessage(currentCandidate.candidateId, mirror, {
          block: blockNumber,
          step: BLOC_02, // Transition vers BLOC 2
          kind: 'mirror',
        });

        // Mettre à jour session (currentBlock) ET UI state
        candidateStore.updateSession(currentCandidate.candidateId, {
          state: "collecting",
          currentBlock: 2,
        });
        candidateStore.updateUIState(currentCandidate.candidateId, {
          step: BLOC_02,
          lastQuestion: null,
          identityDone: true,
        });

        // Recharger le candidate pour avoir l'état à jour
        const updatedCandidate = candidateStore.get(currentCandidate.candidateId);
        if (!updatedCandidate) {
          throw new Error(`Candidate ${currentCandidate.candidateId} not found after mirror`);
        }

        // Générer immédiatement la première question BLOC 2A
        console.log('[ORCHESTRATOR] generate question 2A.1 immediately after BLOC 1 mirror');
        const firstQuestion2A = await this.generateQuestion2A1(updatedCandidate, 0);
        
        // Enregistrer la question dans conversationHistory
        candidateStore.appendAssistantMessage(updatedCandidate.candidateId, firstQuestion2A, {
          block: 2,
          step: BLOC_02,
          kind: 'question',
        });

        // Mettre à jour UI state avec la question
        candidateStore.updateUIState(updatedCandidate.candidateId, {
          step: BLOC_02,
          lastQuestion: firstQuestion2A,
          identityDone: true,
        });

        // Parser le miroir en sections pour affichage progressif
        const mirrorSections = parseMirrorSections(mirror);
        
        return {
          response: mirror + '\n\n' + firstQuestion2A,
          step: BLOC_02,
          expectsAnswer: true,
          autoContinue: false,
          progressiveDisplay: mirrorSections.length > 0,
          mirrorSections: mirrorSections.length > 0 ? mirrorSections : undefined,
        };
      } else {
        // Il reste des questions → Servir la suivante (pas d'API)
        return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
      }
    }

    // Cas 3 : Pas de message utilisateur, pas d'event → Servir question suivante si disponible
    return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
  }

  private async generateQuestionsForBlock1(candidate: AxiomCandidate): Promise<string[]> {
    const messages = buildConversationHistory(candidate);
    const FULL_AXIOM_PROMPT = getFullAxiomPrompt();

    const completion = await callOpenAI({
      messages: [
        { role: 'system', content: FULL_AXIOM_PROMPT },
        {
          role: 'system',
          content: `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_01 (BLOC 1).
Génère TOUTES les questions du BLOC 1 en une seule fois.
Format : Questions séparées par '---QUESTION_SEPARATOR---'
Chaque question doit être complète et autonome.
Format questions à choix : A. / B. / C. / D. / E. sur lignes séparées.
Génère 3 à 5 questions maximum pour le BLOC 1.`,
        },
        ...messages,
      ],
    });

    // Parser les questions (split par délimiteur)
    const questions = completion
      .split('---QUESTION_SEPARATOR---')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    if (questions.length === 0) {
      // Fallback : utiliser une question par défaut
      return [
        'Tu te sens plus poussé par :\nA. Le fait de progresser, devenir meilleur\nB. Le fait d\'atteindre des objectifs concrets\nC. Le fait d\'être reconnu pour ce que tu fais ?',
      ];
    }

    return questions;
  }

  private serveNextQuestion(candidateId: string, blockNumber: number): OrchestratorResult {
    const candidate = candidateStore.get(candidateId);
    if (!candidate) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    const queue = candidate.blockQueues?.[blockNumber];
    if (!queue || queue.questions.length === 0) {
      throw new Error(`Queue for block ${blockNumber} is empty`);
    }

    if (queue.cursorIndex >= queue.questions.length) {
      throw new Error(`All questions for block ${blockNumber} have been served`);
    }

    const question = queue.questions[queue.cursorIndex];
    
    console.log('[ORCHESTRATOR] serve question from queue (NO API)', {
      blockNumber,
      questionIndex: queue.cursorIndex,
      totalQuestions: queue.questions.length,
    });

    // Enregistrer la question dans conversationHistory AVANT d'avancer le cursor
    candidateStore.appendAssistantMessage(candidateId, question, {
      block: blockNumber,
      step: BLOC_01,
      kind: 'question',
    });

    // Mettre à jour UI state
    candidateStore.updateUIState(candidateId, {
      step: BLOC_01,
      lastQuestion: question,
      identityDone: true,
    });

    // Avancer le cursor APRÈS avoir servi la question
    candidateStore.advanceQuestionCursor(candidateId, blockNumber);

    return {
      response: question,
      step: BLOC_01,
      expectsAnswer: true,
      autoContinue: false,
    };
  }


  private async generateMirrorForBlock1(candidate: AxiomCandidate): Promise<string> {
    const messages = buildConversationHistory(candidate);
    const FULL_AXIOM_PROMPT = getFullAxiomPrompt();

    // Récupérer toutes les réponses du BLOC 1 depuis AnswerMap
    const answerMap = candidate.answerMaps?.[1];
    const answers = answerMap?.answers || {};

    // Construire le contexte des réponses
    const answersContext = Object.entries(answers)
      .map(([index, answer]) => `Question ${index}: ${answer}`)
      .join('\n');

    let mirror = '';
    let retries = 0;
    const maxRetries = 1;
    let lastValidationErrors: string[] = [];

    while (retries <= maxRetries) {
      const completion = await callOpenAI({
        messages: [
          { role: 'system', content: FULL_AXIOM_PROMPT },
          {
            role: 'system',
            content: retries === 0
              ? `RÈGLE ABSOLUE AXIOM — MIROIR INTERPRÉTATIF ACTIF :

Tu es en fin de BLOC 1.
Toutes les questions du BLOC 1 ont été répondues.

Réponses du candidat :
${answersContext}

⚠️ FORMAT STRICT OBLIGATOIRE (NON NÉGOCIABLE) :

1️⃣ Lecture implicite
- 1 phrase UNIQUE
- MAXIMUM 20 MOTS EXACTEMENT
- Position interprétative claire (lecture en creux)
- Interdiction : paraphrase, reformulation, liste de faits, résumé descriptif

2️⃣ Déduction personnalisée
- 1 phrase UNIQUE
- MAXIMUM 25 MOTS EXACTEMENT
- Lecture en creux OBLIGATOIRE : « ce n'est probablement pas X, mais plutôt Y »
- Interdiction : neutralité, psychologie générique, diagnostic, projection métier

3️⃣ Validation ouverte
- Phrase STRICTEMENT IDENTIQUE :
« Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue. »

⚠️ INTERDICTIONS ABSOLUES :
- Plus de 2 phrases d'analyse au total
- Narration continue
- Ton explicatif ou pédagogique
- Synthèse globale
- Conclusion
- Cohérence globale implicite
- Projection vers un métier, un cadre ou une compatibilité

⚠️ PORTÉE DU MIROIR :
- STRICTEMENT local et provisoire
- JAMAIS une conclusion
- JAMAIS une lecture globale
- Peut contenir des tensions NON résolues
- Peut être contredit par les blocs suivants

Le miroir doit fonctionner comme un SIGNAL FAIBLE.
Toute sortie hors format = ERREUR.`
              : `RÈGLE ABSOLUE AXIOM — RETRY MIROIR BLOC 1 (FORMAT STRICT OBLIGATOIRE)

⚠️ ERREURS DÉTECTÉES DANS LE MIROIR PRÉCÉDENT :
${lastValidationErrors.map(e => `- ${e}`).join('\n')}

Miroir invalide précédent :
${mirror}

Tu es en fin de BLOC 1.
Réponses du candidat :
${answersContext}

Réécris en conformité STRICTE REVELIOM. 3 sections. 20/25 mots. Lecture en creux. Aucun mot interdit. Aucun texte additionnel.`,
          },
          ...messages,
        ],
      });

      mirror = completion.trim();
      const validation = validateMirrorREVELIOM(mirror);

      if (validation.valid) {
        return mirror;
      }

      lastValidationErrors = validation.errors;

      if (retries < maxRetries) {
        console.warn(`[ORCHESTRATOR] Miroir BLOC 1 non conforme, retry ${retries + 1}/${maxRetries}`, validation.errors);
        retries++;
      } else {
        // Fail-soft : servir quand même le miroir retry avec log d'erreur
        console.warn("[REVELIOM][BLOC1] Miroir invalide après retry :", validation.errors);
        return mirror;
      }
    }

    return mirror;
  }

  // ============================================
  // BLOC 2A — Gestion séquentielle adaptative
  // ============================================
  private async handleBlock2A(
    candidate: AxiomCandidate,
    userMessage: string | null,
    event: string | null,
  ): Promise<OrchestratorResult> {
    const blockNumber = 2;
    const candidateId = candidate.candidateId;

    // Recharger candidate pour avoir l'état à jour
    let currentCandidate = candidateStore.get(candidateId);
    if (!currentCandidate) {
      currentCandidate = await candidateStore.getAsync(candidateId);
    }
    if (!currentCandidate) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    // Récupérer les réponses existantes du BLOC 2A
    const answerMap = currentCandidate.answerMaps?.[blockNumber];
    const answers = answerMap?.answers || {};
    const answeredCount = Object.keys(answers).length;

    // Cas 1 : Aucune réponse encore → Générer question 2A.1 (Médium)
    if (answeredCount === 0) {
      console.log('[ORCHESTRATOR] generate question 2A.1 - Médium (API)');
      const question = await this.generateQuestion2A1(currentCandidate);
      
      // Enregistrer la question dans conversationHistory
      candidateStore.appendAssistantMessage(candidateId, question, {
        block: blockNumber,
        step: BLOC_02,
        kind: 'question',
      });

      // Mettre à jour UI state
      candidateStore.updateUIState(candidateId, {
        step: BLOC_02,
        lastQuestion: question,
        identityDone: true,
      });

      return {
        response: question,
        step: BLOC_02,
        expectsAnswer: true,
        autoContinue: false,
      };
    }

    // Cas 2 : Réponse utilisateur reçue
    if (userMessage) {
      // Stocker la réponse
      const questionIndex = answeredCount; // Index de la question qui vient d'être posée
      candidateStore.storeAnswerForBlock(candidateId, blockNumber, questionIndex, userMessage);

      // Recharger candidate après stockage
      currentCandidate = candidateStore.get(candidateId);
      if (!currentCandidate) {
        currentCandidate = await candidateStore.getAsync(candidateId);
      }
      if (!currentCandidate) {
        throw new Error(`Candidate ${candidateId} not found after storing answer`);
      }

      const updatedAnswerMap = currentCandidate.answerMaps?.[blockNumber];
      const updatedAnswers = updatedAnswerMap?.answers || {};
      const updatedAnsweredCount = Object.keys(updatedAnswers).length;

      // Si 1 réponse → Générer question 2A.2 (adaptée)
      if (updatedAnsweredCount === 1) {
        console.log('[ORCHESTRATOR] generate question 2A.2 - Préférences adaptées (API)');
        const mediumAnswer = updatedAnswers[0] || '';
        const question = await this.generateQuestion2A2(currentCandidate, mediumAnswer);
        
        candidateStore.appendAssistantMessage(candidateId, question, {
          block: blockNumber,
          step: BLOC_02,
          kind: 'question',
        });

        candidateStore.updateUIState(candidateId, {
          step: BLOC_02,
          lastQuestion: question,
          identityDone: true,
        });

        return {
          response: question,
          step: BLOC_02,
          expectsAnswer: true,
          autoContinue: false,
        };
      }

      // Si 2 réponses → Générer question 2A.3 (Œuvre noyau)
      if (updatedAnsweredCount === 2) {
        console.log('[ORCHESTRATOR] generate question 2A.3 - Œuvre noyau (API)');
        const question = await this.generateQuestion2A3(currentCandidate, updatedAnswers);
        
        candidateStore.appendAssistantMessage(candidateId, question, {
          block: blockNumber,
          step: BLOC_02,
          kind: 'question',
        });

        candidateStore.updateUIState(candidateId, {
          step: BLOC_02,
          lastQuestion: question,
          identityDone: true,
        });

        return {
          response: question,
          step: BLOC_02,
          expectsAnswer: true,
          autoContinue: false,
        };
      }

    }

    // Cas 3 : Pas de message utilisateur → Retourner la dernière question si disponible
    const lastQuestion = currentCandidate.session.ui?.lastQuestion;
    if (lastQuestion) {
      return {
        response: lastQuestion,
        step: BLOC_02,
        expectsAnswer: true,
        autoContinue: false,
      };
    }

    // Par défaut, générer la première question
    return this.handleBlock2A(currentCandidate, null, null);
  }

  private async generateQuestion2A1(candidate: AxiomCandidate, retryCount: number = 0): Promise<string> {
    const messages = buildConversationHistory(candidate);
    const FULL_AXIOM_PROMPT = getFullAxiomPrompt();

    const promptContent = retryCount > 0
      ? `RÈGLE ABSOLUE AXIOM (RETRY - FORMAT STRICT) :
Tu es en état BLOC_02 (BLOC 2A - Question 1).
Génère UNE question simple demandant au candidat son médium préféré (Série ou Film).
Format OBLIGATOIRE : Question à choix avec EXACTEMENT "A. Série" et "B. Film" sur lignes séparées.
La question doit être claire et directe.
IMPORTANT : La question DOIT contenir les deux options "A. Série" et "B. Film" explicitement.`
      : `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 1).
Génère UNE question simple demandant au candidat son médium préféré (Série ou Film).
Format : Question à choix avec A. Série / B. Film sur lignes séparées.
La question doit être claire et directe.`;

    const completion = await callOpenAI({
      messages: [
        { role: 'system', content: FULL_AXIOM_PROMPT },
        {
          role: 'system',
          content: promptContent,
        },
        ...messages,
      ],
    });

    const question = completion.trim();
    
    // Validation avec retry contrôlé
    const validation = validateQuestion2A1(question);
    if (!validation.valid && retryCount < 1) {
      console.warn('[ORCHESTRATOR] Question 2A.1 validation failed, retry:', validation.error);
      return this.generateQuestion2A1(candidate, retryCount + 1);
    }
    
    if (!validation.valid) {
      console.error('[ORCHESTRATOR] Question 2A.1 validation failed after retry:', validation.error);
      // Retourner quand même la question (avec warning)
    }
    
    return question;
  }

  private async generateQuestion2A2(candidate: AxiomCandidate, mediumAnswer: string): Promise<string> {
    const messages = buildConversationHistory(candidate);
    const FULL_AXIOM_PROMPT = getFullAxiomPrompt();

    // Déterminer le type de médium (Série ou Film)
    const isSeries = mediumAnswer.toLowerCase().includes('série') || 
                     mediumAnswer.toLowerCase().includes('serie') ||
                     mediumAnswer.toLowerCase().includes('a.') ||
                     mediumAnswer.toLowerCase().includes('a');

    const mediumType = isSeries ? 'série' : 'film';

    const completion = await callOpenAI({
      messages: [
        { role: 'system', content: FULL_AXIOM_PROMPT },
        {
          role: 'system',
          content: `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 2).
Le candidat a choisi : ${mediumType}.
Génère UNE question adaptée demandant ses préférences en ${mediumType}s.
La question doit être personnalisée selon le choix du candidat (séries ou films).
Format : Question ouverte ou à choix multiples (A/B/C/D/E si choix).
La question doit être pertinente pour explorer les préférences en ${mediumType}s.`,
        },
        ...messages,
      ],
    });

    return completion.trim();
  }

  private async generateQuestion2A3(candidate: AxiomCandidate, answers: Record<number, string>, retryCount: number = 0): Promise<string> {
    const messages = buildConversationHistory(candidate);
    const FULL_AXIOM_PROMPT = getFullAxiomPrompt();

    const mediumAnswer = answers[0] || '';
    const preferencesAnswer = answers[1] || '';

    const promptContent = retryCount > 0
      ? `RÈGLE ABSOLUE AXIOM (RETRY - FORMAT STRICT) :
Tu es en état BLOC_02 (BLOC 2A - Question 3).
Le candidat a choisi : ${mediumAnswer}
Ses préférences : ${preferencesAnswer}
Génère UNE question demandant au candidat de choisir UNE œuvre centrale (noyau) parmi ses préférences.
La question DOIT demander EXACTEMENT UNE œuvre (utilise les mots "une", "un", "seule", "unique").
La question DOIT mentionner explicitement "œuvre", "série" ou "film".
Format : Question ouverte demandant le nom de l'œuvre.
La question doit permettre d'identifier l'œuvre la plus significative pour le candidat.`
      : `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 3).
Le candidat a choisi : ${mediumAnswer}
Ses préférences : ${preferencesAnswer}
Génère UNE question demandant au candidat de choisir UNE œuvre centrale (noyau) parmi ses préférences.
La question doit être claire et demander une œuvre spécifique (nom d'une série ou d'un film).
Format : Question ouverte demandant le nom de l'œuvre.
La question doit permettre d'identifier l'œuvre la plus significative pour le candidat.`;

    const completion = await callOpenAI({
      messages: [
        { role: 'system', content: FULL_AXIOM_PROMPT },
        {
          role: 'system',
          content: promptContent,
        },
        ...messages,
      ],
    });

    const question = completion.trim();
    
    // Validation avec retry contrôlé
    const validation = validateQuestion2A3(question);
    if (!validation.valid && retryCount < 1) {
      console.warn('[ORCHESTRATOR] Question 2A.3 validation failed, retry:', validation.error);
      return this.generateQuestion2A3(candidate, answers, retryCount + 1);
    }
    
    if (!validation.valid) {
      console.error('[ORCHESTRATOR] Question 2A.3 validation failed after retry:', validation.error);
      // Retourner quand même la question (avec warning)
    }
    
    return question;
  }

  /**
   * MÉCANISME DE RETRY CONTRÔLÉ pour génération BLOC 2B
   * 
   * Retry max = 1
   * Retry déclenché UNIQUEMENT si validation échoue
   * Prompt renforcé au retry (sans changer la structure)
   * 
   * Cette fonction est un template pour les futures générations BLOC 2B.
   * Elle n'est pas utilisée actuellement (BLOC 2B non implémenté).
   */
  private async generateWithRetry<T>(
    generator: (retryCount: number) => Promise<T>,
    validator: (result: T) => ValidationResult,
    maxRetries: number = 1
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await generator(attempt);
      const validation = validator(result);
      
      if (validation.valid) {
        if (attempt > 0) {
          console.log(`[ORCHESTRATOR] Validation succeeded after ${attempt} retry(ies)`);
        }
        return result;
      }
      
      // Si dernière tentative, retourner quand même (avec warning)
      if (attempt === maxRetries) {
        console.error(`[ORCHESTRATOR] Validation failed after ${maxRetries} retry(ies):`, validation.error);
        if (validation.details) {
          console.error('[ORCHESTRATOR] Validation details:', validation.details);
        }
        return result; // Retourner quand même, mais loguer l'erreur
      }
      
      // Retry avec prompt renforcé
      console.warn(`[ORCHESTRATOR] Validation failed, retry ${attempt + 1}/${maxRetries}:`, validation.error);
    }
    
    throw new Error('Failed to generate valid result after retries');
  }

  /**
   * VALIDATEURS pour BLOC 2B (à utiliser lors de l'implémentation)
   * 
   * Ces fonctions sont des helpers pour valider les générations BLOC 2B.
   * Elles utilisent les validateurs de validators.ts.
   */
  private validateTraitsForBlock2B(traitsWork1: string[], traitsWork2: string[], traitsWork3: string[]): ValidationResult {
    return validateTraitsSpecificity(traitsWork1, traitsWork2, traitsWork3);
  }

  private validateMotifsForBlock2B(motifWork1: string, motifWork2: string, motifWork3: string): ValidationResult {
    return validateMotifsSpecificity(motifWork1, motifWork2, motifWork3);
  }

  private validateSynthesisForBlock2B(content: string): ValidationResult {
    return validateSynthesis2B(content);
  }

  // ============================================
  // BLOC 2B — CŒUR PROJECTIF AXIOM/REVELIOM
  // ============================================
  private async handleBlock2B(
    candidate: AxiomCandidate,
    userMessage: string | null,
    event: string | null,
  ): Promise<OrchestratorResult> {
    const blockNumber = 2;
    const candidateId = candidate.candidateId;

    // Recharger candidate pour avoir l'état à jour
    let currentCandidate = candidateStore.get(candidateId);
    if (!currentCandidate) {
      currentCandidate = await candidateStore.getAsync(candidateId);
    }
    if (!currentCandidate) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    // ÉTAPE 1 — CONTEXTE (injection forcée BLOC 2A)
    const messages = buildConversationHistoryForBlock2B(currentCandidate);
    
    // Vérifier que les données BLOC 2A sont présentes
    const answerMap = currentCandidate.answerMaps?.[2];
    if (!answerMap || !answerMap.answers) {
      console.error('[ORCHESTRATOR] [2B_CONTEXT_INJECTION] forced=false - BLOC 2A answers missing');
      throw new Error('BLOC 2A answers not found. Cannot proceed to BLOC 2B.');
    }

    const answers = answerMap.answers;
    const mediumAnswer = answers[0] || '';
    const preferencesAnswer = answers[1] || '';
    const coreWorkAnswer = answers[2] || '';

    if (!mediumAnswer || !preferencesAnswer || !coreWorkAnswer) {
      console.error('[ORCHESTRATOR] [2B_CONTEXT_INJECTION] forced=false - Incomplete BLOC 2A data');
      throw new Error('BLOC 2A data incomplete. Cannot proceed to BLOC 2B.');
    }

    console.log('[ORCHESTRATOR] [2B_CONTEXT_INJECTION] forced=true', {
      medium: mediumAnswer,
      preferences: preferencesAnswer,
      coreWork: coreWorkAnswer
    });

    // Parser les 3 œuvres depuis preferencesAnswer
    const works = this.parseWorks(preferencesAnswer);
    if (works.length < 3) {
      console.error('[ORCHESTRATOR] [2B_CONTEXT_INJECTION] forced=false - Less than 3 works found');
      throw new Error(`Expected 3 works, found ${works.length}. Cannot proceed to BLOC 2B.`);
    }

    const queue = currentCandidate.blockQueues?.[blockNumber];

    // ÉTAPE 2 — GÉNÉRATION DES QUESTIONS 2B (si pas encore générées)
    if (!queue || queue.questions.length === 0) {
      console.log('[ORCHESTRATOR] Generating BLOC 2B questions (API)');
      
      // Génération initiale
      let questions = await this.generateQuestions2B(currentCandidate, works, coreWorkAnswer);
      
      // Validation sémantique avec retry contrôlé (FAIL-FAST QUALITATIF)
      const validatedQuestions = await this.validateAndRetryQuestions2B(
        questions,
        works,
        currentCandidate,
        coreWorkAnswer
      );
      
      // Stocker UNIQUEMENT les questions validées
      candidateStore.setQuestionsForBlock(candidateId, blockNumber, validatedQuestions);
      
      // Servir la première question
      return this.serveNextQuestion2B(candidateId, blockNumber);
    }

    // ÉTAPE 3 — RÉPONSE UTILISATEUR REÇUE
    if (userMessage) {
      const currentQueue = currentCandidate.blockQueues?.[blockNumber];
      if (!currentQueue) {
        throw new Error(`Queue for block ${blockNumber} not found`);
      }

      // Stocker la réponse
      const questionIndex = currentQueue.cursorIndex - 1;
      candidateStore.storeAnswerForBlock(candidateId, blockNumber, questionIndex, userMessage);

      // Recharger candidate après stockage
      currentCandidate = candidateStore.get(candidateId);
      if (!currentCandidate) {
        currentCandidate = await candidateStore.getAsync(candidateId);
      }
      if (!currentCandidate) {
        throw new Error(`Candidate ${candidateId} not found after storing answer`);
      }

      const finalQueue = currentCandidate.blockQueues?.[blockNumber];
      if (!finalQueue) {
        throw new Error(`Queue for block ${blockNumber} not found after reload`);
      }

      // Vérifier si toutes les questions ont été répondues
      if (finalQueue.cursorIndex >= finalQueue.questions.length) {
        // Toutes les questions répondues → Générer miroir final
        console.log('[ORCHESTRATOR] Generating BLOC 2B final mirror (API)');
        candidateStore.markBlockComplete(candidateId, blockNumber);
        
        const mirror = await this.generateMirror2B(currentCandidate, works, coreWorkAnswer);
        
        // Enregistrer le miroir dans conversationHistory
        candidateStore.appendAssistantMessage(candidateId, mirror, {
          block: blockNumber,
          step: BLOC_03,
          kind: 'mirror',
        });

        // Mettre à jour session (currentBlock) ET UI state
        candidateStore.updateSession(candidateId, {
          state: "collecting",
          currentBlock: 3,
        });
        candidateStore.updateUIState(candidateId, {
          step: BLOC_03,
          lastQuestion: null,
          identityDone: true,
        });

        // Recharger le candidate pour avoir l'état à jour
        let updatedCandidate = candidateStore.get(candidateId);
        if (!updatedCandidate) {
          updatedCandidate = await candidateStore.getAsync(candidateId);
        }
        if (!updatedCandidate) {
          throw new Error(`Candidate ${candidateId} not found after mirror`);
        }

        // Appeler executeAxiom() pour générer la première question BLOC 3
        console.log('[ORCHESTRATOR] generate first question BLOC 3 immediately after BLOC 2B mirror');
        const nextResult = await executeAxiom({
          candidate: updatedCandidate,
          userMessage: null,
          event: undefined,
        });

        // Parser le miroir en sections pour affichage progressif (si format REVELIOM)
        const mirrorSections = parseMirrorSections(mirror);
        
        return {
          response: mirror + '\n\n' + nextResult.response,
          step: nextResult.step,
          expectsAnswer: nextResult.expectsAnswer,
          autoContinue: false,
          progressiveDisplay: mirrorSections.length > 0,
          mirrorSections: mirrorSections.length > 0 ? mirrorSections : undefined,
        };
      } else {
        // Il reste des questions → Servir la suivante (pas d'API)
        return this.serveNextQuestion2B(candidateId, blockNumber);
      }
    }

    // Cas 3 : Pas de message utilisateur → Servir question suivante si disponible
    return this.serveNextQuestion2B(candidateId, blockNumber);
  }

  /**
   * Parse les 3 œuvres depuis la réponse utilisateur (format libre)
   */
  private parseWorks(preferencesAnswer: string): string[] {
    // Essayer de parser : "Œuvre 1, Œuvre 2, Œuvre 3" ou "Œuvre 1\nŒuvre 2\nŒuvre 3"
    const works = preferencesAnswer
      .split(/[,\n]/)
      .map(w => w.trim())
      .filter(w => w.length > 0)
      .slice(0, 3); // Prendre les 3 premières
    
    return works;
  }

  /**
   * Génère toutes les questions BLOC 2B en une seule fois
   */
  private async generateQuestions2B(
    candidate: AxiomCandidate,
    works: string[],
    coreWork: string
  ): Promise<string[]> {
    const messages = buildConversationHistoryForBlock2B(candidate);
    const FULL_AXIOM_PROMPT = getFullAxiomPrompt();

    const completion = await callOpenAI({
      messages: [
        { role: 'system', content: FULL_AXIOM_PROMPT },
        {
          role: 'system',
          content: `RÈGLE ABSOLUE AXIOM — BLOC 2B (CRITIQUE) :

Tu es en état BLOC_02 (BLOC 2B - Analyse projective).

ŒUVRES DU CANDIDAT :
- Œuvre #3 : ${works[2] || 'N/A'}
- Œuvre #2 : ${works[1] || 'N/A'}
- Œuvre #1 : ${works[0] || 'N/A'}
- Œuvre noyau : ${coreWork}

⚠️ RÈGLES ABSOLUES (NON NÉGOCIABLES) :

1. AUCUNE question générique n'est autorisée.
2. Chaque série/film a ses propres MOTIFS, générés par AXIOM.
3. Chaque personnage a ses propres TRAITS, générés par AXIOM.
4. Les propositions doivent être :
   - spécifiques à l'œuvre ou au personnage,
   - crédibles,
   - distinctes entre elles.
5. AXIOM n'utilise JAMAIS une liste standard réutilisable.
6. 1 choix obligatoire par question (sauf "je passe" explicite).

🟦 DÉROULÉ STRICT (POUR CHAQUE ŒUVRE, dans l'ordre #3 → #2 → #1) :

ÉTAPE 1 — MOTIF PRINCIPAL :
Pour chaque œuvre, génère la question : "Qu'est-ce qui t'attire le PLUS dans [NOM DE L'ŒUVRE] ?"
Génère 5 propositions UNIQUES, spécifiques à cette œuvre.
Ces propositions doivent représenter réellement l'œuvre (ascension, décor, ambiance, relations, rythme, morale, stratégie, quotidien, chaos, etc.).
AXIOM choisit les axes pertinents, œuvre par œuvre.
Format : A / B / C / D / E (1 lettre attendue)

⚠️ CRITIQUE : Les 5 propositions pour l'Œuvre #3 doivent être DIFFÉRENTES des propositions pour l'Œuvre #2, qui doivent être DIFFÉRENTES de celles pour l'Œuvre #1.
Chaque œuvre a ses propres axes d'attraction.

ÉTAPE 2 — PERSONNAGES PRÉFÉRÉS (1 à 3) :
Pour chaque œuvre, génère la question : "Dans [NOM DE L'ŒUVRE], quels sont les 1 à 3 personnages qui te parlent le plus ?"
Format : Question ouverte (pas de choix multiples).

ÉTAPE 3 — TRAIT DOMINANT (PERSONNALISÉ À CHAQUE PERSONNAGE) :
Pour CHAQUE personnage cité (1 à 3 par œuvre), génère la question : "Chez [NOM DU PERSONNAGE], qu'est-ce que tu apprécies le PLUS ?"
Génère 5 TRAITS SPÉCIFIQUES À CE PERSONNAGE, qui :
- correspondent à son rôle réel dans l'œuvre,
- couvrent des dimensions différentes (émotionnelle, stratégique, relationnelle, morale, comportementale),
- ne sont PAS recyclables pour un autre personnage.

⚠️ CRITIQUE : Les traits pour le Personnage A de l'Œuvre #3 doivent être DIFFÉRENTS des traits pour le Personnage B de l'Œuvre #3, qui doivent être DIFFÉRENTS des traits pour le Personnage A de l'Œuvre #2.
Chaque personnage a ses propres traits uniques.

Format : A / B / C / D / E (1 seule réponse possible)

ÉTAPE 4 — MICRO-RÉCAP ŒUVRE (factuel, 1-2 lignes) :
Après motifs + personnages + traits pour une œuvre, génère un résumé factuel :
"Sur [ŒUVRE], tu es surtout attiré par [motif choisi], et par des personnages que tu valorises pour [traits dominants observés]."

Format de sortie OBLIGATOIRE :
---QUESTION_SEPARATOR---
[Question motif Œuvre #3]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #3]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #3]
---QUESTION_SEPARATOR---
[Question motif Œuvre #2]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #2]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #2]
---QUESTION_SEPARATOR---
[Question motif Œuvre #1]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #1]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #1]`
        },
        ...messages,
      ],
    });

    // Parser les questions
    let questions = completion
      .split('---QUESTION_SEPARATOR---')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    // Validation réconciliation personnages (C6)
    const characterValidation = this.validateCharacterNames(questions);
    if (!characterValidation.valid) {
      console.warn('[ORCHESTRATOR] Character names validation failed, retry with reinforced prompt');
      // Retry avec prompt renforcé mentionnant explicitement réconciliation
      questions = await this.generateQuestions2BWithReconciliation(candidate, works, coreWork);
    }

    return questions;
  }

  /**
   * Valide que les noms de personnages sont canoniques (pas de descriptions)
   */
  private validateCharacterNames(questions: string[]): ValidationResult {
    // Détecter descriptions au lieu de noms canoniques
    const descriptions = ['le chef', 'son associée', 'celui qui', 'l\'autre frère', 'l\'autre', 'celui', 'celle'];
    const hasDescriptions = questions.some(q => 
      descriptions.some(desc => q.toLowerCase().includes(desc))
    );
    
    if (hasDescriptions) {
      return {
        valid: false,
        error: 'Descriptions détectées au lieu de noms canoniques'
      };
    }
    
    return { valid: true };
  }

  /**
   * Génère les questions BLOC 2B avec prompt renforcé pour réconciliation personnages
   */
  private async generateQuestions2BWithReconciliation(
    candidate: AxiomCandidate,
    works: string[],
    coreWork: string
  ): Promise<string[]> {
    const messages = buildConversationHistoryForBlock2B(candidate);
    const FULL_AXIOM_PROMPT = getFullAxiomPrompt();

    const completion = await callOpenAI({
      messages: [
        { role: 'system', content: FULL_AXIOM_PROMPT },
        {
          role: 'system',
          content: `RÈGLE ABSOLUE AXIOM — BLOC 2B (CRITIQUE — RETRY RÉCONCILIATION) :

Tu es en état BLOC_02 (BLOC 2B - Analyse projective).

ŒUVRES DU CANDIDAT :
- Œuvre #3 : ${works[2] || 'N/A'}
- Œuvre #2 : ${works[1] || 'N/A'}
- Œuvre #1 : ${works[0] || 'N/A'}
- Œuvre noyau : ${coreWork}

⚠️ RÈGLE CRITIQUE — RÉCONCILIATION PERSONNAGES (NON NÉGOCIABLE) :

Si le candidat décrit un personnage (ex: "le chef", "son associée", "celui qui ne ment jamais"),
AXIOM DOIT :
- identifier sans ambiguïté le personnage correspondant dans l'œuvre,
- remplacer la description par le NOM CANONIQUE officiel du personnage,
- utiliser exclusivement ce nom canonique dans toutes les questions suivantes.

EXEMPLES :
- "le chef" → "Tommy Shelby" (Peaky Blinders)
- "son associée" → "Alicia Florrick" (The Good Wife)
- "celui qui ne ment jamais" → "Ned Stark" (Game of Thrones)

⚠️ INTERDICTIONS :
- JAMAIS utiliser de descriptions floues dans les questions
- JAMAIS utiliser "l'autre", "celui", "celle" sans nom
- TOUJOURS utiliser le nom complet et officiel du personnage

⚠️ RÈGLES ABSOLUES (NON NÉGOCIABLES) :

1. AUCUNE question générique n'est autorisée.
2. Chaque série/film a ses propres MOTIFS, générés par AXIOM.
3. Chaque personnage a ses propres TRAITS, générés par AXIOM.
4. Les propositions doivent être :
   - spécifiques à l'œuvre ou au personnage,
   - crédibles,
   - distinctes entre elles.
5. AXIOM n'utilise JAMAIS une liste standard réutilisable.
6. 1 choix obligatoire par question (sauf "je passe" explicite).

🟦 DÉROULÉ STRICT (POUR CHAQUE ŒUVRE, dans l'ordre #3 → #2 → #1) :

ÉTAPE 1 — MOTIF PRINCIPAL :
Pour chaque œuvre, génère la question : "Qu'est-ce qui t'attire le PLUS dans [NOM DE L'ŒUVRE] ?"
Génère 5 propositions UNIQUES, spécifiques à cette œuvre.
Ces propositions doivent représenter réellement l'œuvre (ascension, décor, ambiance, relations, rythme, morale, stratégie, quotidien, chaos, etc.).
AXIOM choisit les axes pertinents, œuvre par œuvre.
Format : A / B / C / D / E (1 lettre attendue)

⚠️ CRITIQUE : Les 5 propositions pour l'Œuvre #3 doivent être DIFFÉRENTES des propositions pour l'Œuvre #2, qui doivent être DIFFÉRENTES de celles pour l'Œuvre #1.
Chaque œuvre a ses propres axes d'attraction.

ÉTAPE 2 — PERSONNAGES PRÉFÉRÉS (1 à 3) :
Pour chaque œuvre, génère la question : "Dans [NOM DE L'ŒUVRE], quels sont les 1 à 3 personnages qui te parlent le plus ?"
Format : Question ouverte (pas de choix multiples).

ÉTAPE 3 — TRAIT DOMINANT (PERSONNALISÉ À CHAQUE PERSONNAGE) :
Pour CHAQUE personnage cité (1 à 3 par œuvre), génère la question : "Chez [NOM DU PERSONNAGE], qu'est-ce que tu apprécies le PLUS ?"
⚠️ IMPORTANT : Utilise TOUJOURS le NOM CANONIQUE du personnage, jamais une description.
Génère 5 TRAITS SPÉCIFIQUES À CE PERSONNAGE, qui :
- correspondent à son rôle réel dans l'œuvre,
- couvrent des dimensions différentes (émotionnelle, stratégique, relationnelle, morale, comportementale),
- ne sont PAS recyclables pour un autre personnage.

⚠️ CRITIQUE : Les traits pour le Personnage A de l'Œuvre #3 doivent être DIFFÉRENTS des traits pour le Personnage B de l'Œuvre #3, qui doivent être DIFFÉRENTS des traits pour le Personnage A de l'Œuvre #2.
Chaque personnage a ses propres traits uniques.

Format : A / B / C / D / E (1 seule réponse possible)

ÉTAPE 4 — MICRO-RÉCAP ŒUVRE (factuel, 1-2 lignes) :
Après motifs + personnages + traits pour une œuvre, génère un résumé factuel :
"Sur [ŒUVRE], tu es surtout attiré par [motif choisi], et par des personnages que tu valorises pour [traits dominants observés]."

Format de sortie OBLIGATOIRE :
---QUESTION_SEPARATOR---
[Question motif Œuvre #3]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #3]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #3]
---QUESTION_SEPARATOR---
[Question motif Œuvre #2]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #2]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #2]
---QUESTION_SEPARATOR---
[Question motif Œuvre #1]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #1]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #1]`
        },
        ...messages,
      ],
    });

    // Parser les questions
    const questions = completion
      .split('---QUESTION_SEPARATOR---')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    return questions;
  }

  /**
   * Valide et retry les questions BLOC 2B si nécessaire (FAIL-FAST QUALITATIF)
   * 
   * RÈGLE ABSOLUE : Aucune question générique ne peut être servie.
   * Si validation échoue → retry (max 1) → si échec → erreur assumée (pas de questions servies)
   */
  private async validateAndRetryQuestions2B(
    questions: string[],
    works: string[],
    candidate: AxiomCandidate,
    coreWork: string
  ): Promise<string[]> {
    // Extraire motifs et traits pour validation
    const motifs: string[] = [];
    const traits: string[] = [];
    
    // Parser questions pour extraire motifs (une par œuvre) et traits
    for (const question of questions) {
      if (question.includes('Qu\'est-ce qui t\'attire le PLUS dans')) {
        motifs.push(question);
      } else if (question.includes('Chez') && question.includes('qu\'est-ce que tu apprécies')) {
        traits.push(question);
      }
    }

    // Validation motifs (besoin de 3 motifs, un par œuvre)
    let motifsValid = true;
    if (motifs.length >= 3) {
      const motifsValidation = validateMotifsSpecificity(motifs[0], motifs[1], motifs[2]);
      if (!motifsValidation.valid) {
        console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] reason=motifs', motifsValidation.error);
        motifsValid = false;
      }
    } else {
      console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] reason=motifs - Less than 3 motifs found');
      motifsValid = false;
    }

    // Validation traits (si on a des traits)
    let traitsValid = true;
    if (traits.length >= 3) {
      // Grouper traits par œuvre (approximation)
      const traitsWork1 = traits.slice(0, Math.floor(traits.length / 3));
      const traitsWork2 = traits.slice(Math.floor(traits.length / 3), Math.floor(traits.length * 2 / 3));
      const traitsWork3 = traits.slice(Math.floor(traits.length * 2 / 3));
      
      const traitsValidation = validateTraitsSpecificity(traitsWork1, traitsWork2, traitsWork3);
      if (!traitsValidation.valid) {
        console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] reason=traits', traitsValidation.error);
        traitsValid = false;
      }
    } else if (traits.length > 0) {
      // Si on a des traits mais moins de 3, on considère que c'est valide (peut être normal selon nombre de personnages)
      traitsValid = true;
    }

    // Si validation réussit → retourner questions
    if (motifsValid && traitsValid) {
      return questions;
    }

    // Si validation échoue → RETRY (max 1)
    console.log('[ORCHESTRATOR] [2B_RETRY_TRIGGERED] retry=1');
    
    // Retry avec prompt renforcé
    const retryQuestions = await this.generateQuestions2BWithRetry(candidate, works, coreWork, {
      motifsFailed: !motifsValid,
      traitsFailed: !traitsValid
    });

    // Re-valider après retry
    const retryMotifs: string[] = [];
    const retryTraits: string[] = [];
    
    for (const question of retryQuestions) {
      if (question.includes('Qu\'est-ce qui t\'attire le PLUS dans')) {
        retryMotifs.push(question);
      } else if (question.includes('Chez') && question.includes('qu\'est-ce que tu apprécies')) {
        retryTraits.push(question);
      }
    }

    let retryMotifsValid = true;
    if (retryMotifs.length >= 3) {
      const retryMotifsValidation = validateMotifsSpecificity(retryMotifs[0], retryMotifs[1], retryMotifs[2]);
      if (!retryMotifsValidation.valid) {
        console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] fatal=true reason=motifs (after retry)', retryMotifsValidation.error);
        retryMotifsValid = false;
      }
    } else {
      console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] fatal=true reason=motifs (after retry) - Less than 3 motifs found');
      retryMotifsValid = false;
    }

    let retryTraitsValid = true;
    if (retryTraits.length >= 3) {
      const retryTraitsWork1 = retryTraits.slice(0, Math.floor(retryTraits.length / 3));
      const retryTraitsWork2 = retryTraits.slice(Math.floor(retryTraits.length / 3), Math.floor(retryTraits.length * 2 / 3));
      const retryTraitsWork3 = retryTraits.slice(Math.floor(retryTraits.length * 2 / 3));
      
      const retryTraitsValidation = validateTraitsSpecificity(retryTraitsWork1, retryTraitsWork2, retryTraitsWork3);
      if (!retryTraitsValidation.valid) {
        console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] fatal=true reason=traits (after retry)', retryTraitsValidation.error);
        retryTraitsValid = false;
      }
    }

    // Si retry échoue aussi → ERREUR ASSUMÉE (pas de questions servies)
    if (!retryMotifsValid || !retryTraitsValid) {
      const failedReasons: string[] = [];
      if (!retryMotifsValid) failedReasons.push('motifs');
      if (!retryTraitsValid) failedReasons.push('traits');
      
      throw new Error(`BLOC 2B validation failed after retry. Reasons: ${failedReasons.join(', ')}. Cannot serve generic questions.`);
    }

    // Si retry réussit → retourner questions retry
    return retryQuestions;
  }

  /**
   * Génère les questions BLOC 2B avec prompt renforcé (retry)
   */
  private async generateQuestions2BWithRetry(
    candidate: AxiomCandidate,
    works: string[],
    coreWork: string,
    failedValidations: { motifsFailed: boolean; traitsFailed: boolean }
  ): Promise<string[]> {
    const messages = buildConversationHistoryForBlock2B(candidate);
    const FULL_AXIOM_PROMPT = getFullAxiomPrompt();

    const failedReasons: string[] = [];
    if (failedValidations.motifsFailed) failedReasons.push('motifs trop similaires entre œuvres');
    if (failedValidations.traitsFailed) failedReasons.push('traits trop similaires entre personnages');

    const completion = await callOpenAI({
      messages: [
        { role: 'system', content: FULL_AXIOM_PROMPT },
        {
          role: 'system',
          content: `RÈGLE ABSOLUE AXIOM — BLOC 2B (RETRY - FORMAT STRICT) :

La génération précédente a échoué la validation sémantique.
Raisons : ${failedReasons.join(', ')}.

Tu es en état BLOC_02 (BLOC 2B - Analyse projective).

ŒUVRES DU CANDIDAT :
- Œuvre #3 : ${works[2] || 'N/A'}
- Œuvre #2 : ${works[1] || 'N/A'}
- Œuvre #1 : ${works[0] || 'N/A'}
- Œuvre noyau : ${coreWork}

⚠️ RÈGLES ABSOLUES (NON NÉGOCIABLES) :

1. AUCUNE question générique n'est autorisée.
2. Chaque série/film a ses propres MOTIFS, générés par AXIOM.
3. Chaque personnage a ses propres TRAITS, générés par AXIOM.
4. Les propositions doivent être :
   - spécifiques à l'œuvre ou au personnage,
   - crédibles,
   - distinctes entre elles.
5. AXIOM n'utilise JAMAIS une liste standard réutilisable.

⚠️ CRITIQUE — SPÉCIFICITÉ OBLIGATOIRE :

- Les 5 propositions de motifs pour l'Œuvre #3 DOIVENT être DIFFÉRENTES de celles pour l'Œuvre #2, qui DOIVENT être DIFFÉRENTES de celles pour l'Œuvre #1.
- Les traits pour le Personnage A de l'Œuvre #3 DOIVENT être DIFFÉRENTS des traits pour le Personnage B de l'Œuvre #3, qui DOIVENT être DIFFÉRENTS des traits pour le Personnage A de l'Œuvre #2.
- Chaque œuvre a ses propres axes d'attraction UNIQUES.
- Chaque personnage a ses propres traits UNIQUES, non recyclables.

🟦 DÉROULÉ STRICT (POUR CHAQUE ŒUVRE, dans l'ordre #3 → #2 → #1) :

ÉTAPE 1 — MOTIF PRINCIPAL :
Pour chaque œuvre, génère la question : "Qu'est-ce qui t'attire le PLUS dans [NOM DE L'ŒUVRE] ?"
Génère 5 propositions UNIQUES, spécifiques à cette œuvre.
Ces propositions doivent représenter réellement l'œuvre (ascension, décor, ambiance, relations, rythme, morale, stratégie, quotidien, chaos, etc.).
AXIOM choisit les axes pertinents, œuvre par œuvre.
Format : A / B / C / D / E (1 lettre attendue)

ÉTAPE 2 — PERSONNAGES PRÉFÉRÉS (1 à 3) :
Pour chaque œuvre, génère la question : "Dans [NOM DE L'ŒUVRE], quels sont les 1 à 3 personnages qui te parlent le plus ?"
Format : Question ouverte (pas de choix multiples).

ÉTAPE 3 — TRAIT DOMINANT (PERSONNALISÉ À CHAQUE PERSONNAGE) :
Pour CHAQUE personnage cité (1 à 3 par œuvre), génère la question : "Chez [NOM DU PERSONNAGE], qu'est-ce que tu apprécies le PLUS ?"
Génère 5 TRAITS SPÉCIFIQUES À CE PERSONNAGE, qui :
- correspondent à son rôle réel dans l'œuvre,
- couvrent des dimensions différentes (émotionnelle, stratégique, relationnelle, morale, comportementale),
- ne sont PAS recyclables pour un autre personnage.

Format : A / B / C / D / E (1 seule réponse possible)

ÉTAPE 4 — MICRO-RÉCAP ŒUVRE (factuel, 1-2 lignes) :
Après motifs + personnages + traits pour une œuvre, génère un résumé factuel :
"Sur [ŒUVRE], tu es surtout attiré par [motif choisi], et par des personnages que tu valorises pour [traits dominants observés]."

Format de sortie OBLIGATOIRE :
---QUESTION_SEPARATOR---
[Question motif Œuvre #3]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #3]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #3]
---QUESTION_SEPARATOR---
[Question motif Œuvre #2]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #2]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #2]
---QUESTION_SEPARATOR---
[Question motif Œuvre #1]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #1]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #1]`
        },
        ...messages,
      ],
    });

    // Parser les questions
    const questions = completion
      .split('---QUESTION_SEPARATOR---')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    return questions;
  }

  /**
   * Sert la prochaine question BLOC 2B depuis la queue
   */
  private serveNextQuestion2B(candidateId: string, blockNumber: number): OrchestratorResult {
    const candidate = candidateStore.get(candidateId);
    if (!candidate) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    const queue = candidate.blockQueues?.[blockNumber];
    if (!queue || queue.questions.length === 0) {
      throw new Error(`Queue for block ${blockNumber} is empty`);
    }

    if (queue.cursorIndex >= queue.questions.length) {
      throw new Error(`All questions for block ${blockNumber} have been served`);
    }

    const question = queue.questions[queue.cursorIndex];
    
    console.log('[ORCHESTRATOR] serve question BLOC 2B from queue (NO API)', {
      blockNumber,
      questionIndex: queue.cursorIndex,
      totalQuestions: queue.questions.length,
    });

    // Enregistrer la question dans conversationHistory AVANT d'avancer le cursor
    candidateStore.appendAssistantMessage(candidateId, question, {
      block: blockNumber,
      step: BLOC_02,
      kind: 'question',
    });

    // Mettre à jour UI state
    candidateStore.updateUIState(candidateId, {
      step: BLOC_02,
      lastQuestion: question,
      identityDone: true,
    });

    // Avancer le cursor APRÈS avoir servi la question
    candidateStore.advanceQuestionCursor(candidateId, blockNumber);

    return {
      response: question,
      step: BLOC_02,
      expectsAnswer: true,
      autoContinue: false,
    };
  }

  /**
   * Génère le miroir final BLOC 2B
   */
  private async generateMirror2B(
    candidate: AxiomCandidate,
    works: string[],
    coreWork: string
  ): Promise<string> {
    const messages = buildConversationHistoryForBlock2B(candidate);
    const FULL_AXIOM_PROMPT = getFullAxiomPrompt();

    // Récupérer toutes les réponses BLOC 2B depuis AnswerMap
    const answerMap = candidate.answerMaps?.[2];
    const answers = answerMap?.answers || {};

    // Construire le contexte des réponses (motifs + personnages + traits)
    const answersContext = Object.entries(answers)
      .map(([index, answer]) => {
        const questionIndex = parseInt(index, 10);
        const queue = candidate.blockQueues?.[2];
        const question = queue?.questions[questionIndex] || '';
        return `Question ${questionIndex} (${question.substring(0, 50)}...): ${answer}`;
      })
      .join('\n');

    const completion = await callOpenAI({
      messages: [
        { role: 'system', content: FULL_AXIOM_PROMPT },
        {
          role: 'system',
          content: `RÈGLE ABSOLUE AXIOM — SYNTHÈSE FINALE BLOC 2B :

Tu es en fin de BLOC 2B.
Toutes les questions projectives ont été répondues.

ŒUVRES DU CANDIDAT :
- Œuvre #3 : ${works[2] || 'N/A'}
- Œuvre #2 : ${works[1] || 'N/A'}
- Œuvre #1 : ${works[0] || 'N/A'}
- Œuvre noyau : ${coreWork}

RÉPONSES DU CANDIDAT :
${answersContext}

⚠️ RÈGLES ABSOLUES POUR LA SYNTHÈSE :

1. La synthèse DOIT être VRAIMENT PERSONNALISÉE (4 à 6 lignes max).
2. Elle DOIT croiser explicitement :
   - motifs choisis + personnages cités + traits valorisés
3. Elle DOIT faire ressortir des constantes claires :
   - rapport au pouvoir
   - rapport à la pression
   - rapport aux relations
   - posture face à la responsabilité
4. Elle DOIT inclure 1 point de vigilance réaliste, formulé sans jugement.
5. Elle DOIT citer explicitement les œuvres ET les personnages.
6. Elle DOIT être exploitable pour la suite du profil (management, ambition, environnements).

Format : Synthèse continue, dense, incarnée, structurante.
PAS de liste à puces. PAS de formatage excessif.
Une lecture projective, pas descriptive.`
        },
        ...messages,
      ],
    });

    let mirror = completion.trim();

    // Validation synthèse avec retry
    const validation = validateSynthesis2B(mirror);
    if (!validation.valid) {
      console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] type=synthesis', validation.error);
      console.log('[ORCHESTRATOR] [2B_RETRY_TRIGGERED] retry=1');
      
      // Retry avec prompt renforcé
      const retryCompletion = await callOpenAI({
        messages: [
          { role: 'system', content: FULL_AXIOM_PROMPT },
          {
            role: 'system',
            content: `RÈGLE ABSOLUE AXIOM — SYNTHÈSE FINALE BLOC 2B (RETRY - FORMAT STRICT) :

La synthèse précédente n'a pas respecté le format requis.

Tu es en fin de BLOC 2B.
Toutes les questions projectives ont été répondues.

ŒUVRES DU CANDIDAT :
- Œuvre #3 : ${works[2] || 'N/A'}
- Œuvre #2 : ${works[1] || 'N/A'}
- Œuvre #1 : ${works[0] || 'N/A'}
- Œuvre noyau : ${coreWork}

RÉPONSES DU CANDIDAT :
${answersContext}

⚠️ FORMAT STRICT OBLIGATOIRE :

1. La synthèse DOIT faire EXACTEMENT 4 à 6 lignes.
2. Elle DOIT mentionner explicitement :
   - au moins 2 œuvres par leur nom
   - au moins 2 personnages par leur nom
   - les motifs choisis
   - les traits valorisés
3. Elle DOIT croiser motifs + personnages + traits pour faire ressortir :
   - rapport au pouvoir (OBLIGATOIRE)
   - rapport à la pression (OBLIGATOIRE)
   - rapport aux relations (OBLIGATOIRE)
   - posture face à la responsabilité (OBLIGATOIRE)
4. Elle DOIT inclure 1 point de vigilance réaliste.

Format : Synthèse continue, dense, incarnée, structurante.`
          },
          ...messages,
        ],
      });
      
      mirror = retryCompletion.trim();
      const retryValidation = validateSynthesis2B(mirror);
      if (!retryValidation.valid) {
        console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] type=synthesis (after retry)', retryValidation.error);
      }
    }

    return mirror;
  }
}
