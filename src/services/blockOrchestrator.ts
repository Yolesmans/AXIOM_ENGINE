import type { AxiomCandidate } from '../types/candidate.js';
import { candidateStore } from '../store/sessionStore.js';
import { callOpenAI } from './openaiClient.js';
import { BLOC_01, BLOC_02 } from '../engine/axiomExecutor.js';
// getFullAxiomPrompt n'est pas exporté, on doit le reconstruire
import { PROMPT_AXIOM_ENGINE, PROMPT_AXIOM_PROFIL } from '../engine/prompts.js';

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

export interface OrchestratorResult {
  response: string;
  step: string;
  expectsAnswer: boolean;
  autoContinue: boolean;
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

        // Mettre à jour UI state
        candidateStore.updateUIState(currentCandidate.candidateId, {
          step: BLOC_02,
          lastQuestion: null,
          identityDone: true,
        });

        return {
          response: mirror,
          step: BLOC_02,
          expectsAnswer: false,
          autoContinue: false,
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

    const completion = await callOpenAI({
      messages: [
        { role: 'system', content: FULL_AXIOM_PROMPT },
        {
          role: 'system',
          content: `RÈGLE ABSOLUE AXIOM :
Tu es en fin de BLOC 1.
Toutes les questions du BLOC 1 ont été répondues.
Réponses du candidat :
${answersContext}

Produis le MIROIR INTERPRÉTATIF ACTIF de fin de bloc, conforme au format strict :
1️⃣ Lecture implicite (20 mots max) : ce que les réponses révèlent du fonctionnement réel.
2️⃣ Déduction personnalisée (25 mots max) : manière probable d'agir en situation réelle.
3️⃣ Validation ouverte : "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

Format strict : 3 sections séparées, pas de narration continue.`,
        },
        ...messages,
      ],
    });

    return completion.trim();
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

      // Si 3 réponses → Fin du BLOC 2A, transition vers BLOC 2B
      if (updatedAnsweredCount === 3) {
        console.log('[ORCHESTRATOR] BLOC 2A terminé, transition vers BLOC 2B');
        candidateStore.markBlockComplete(candidateId, blockNumber);

        // Mettre à jour UI state pour BLOC 2B (sans l'implémenter)
        candidateStore.updateUIState(candidateId, {
          step: BLOC_02, // Reste en BLOC_02 pour l'instant
          lastQuestion: null,
          identityDone: true,
        });

        return {
          response: 'BLOC 2A terminé. Transition vers BLOC 2B (non implémenté).',
          step: BLOC_02,
          expectsAnswer: false,
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

  private async generateQuestion2A1(candidate: AxiomCandidate): Promise<string> {
    const messages = buildConversationHistory(candidate);
    const FULL_AXIOM_PROMPT = getFullAxiomPrompt();

    const completion = await callOpenAI({
      messages: [
        { role: 'system', content: FULL_AXIOM_PROMPT },
        {
          role: 'system',
          content: `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 1).
Génère UNE question simple demandant au candidat son médium préféré (Série ou Film).
Format : Question à choix avec A. Série / B. Film sur lignes séparées.
La question doit être claire et directe.`,
        },
        ...messages,
      ],
    });

    return completion.trim();
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

  private async generateQuestion2A3(candidate: AxiomCandidate, answers: Record<number, string>): Promise<string> {
    const messages = buildConversationHistory(candidate);
    const FULL_AXIOM_PROMPT = getFullAxiomPrompt();

    const mediumAnswer = answers[0] || '';
    const preferencesAnswer = answers[1] || '';

    const completion = await callOpenAI({
      messages: [
        { role: 'system', content: FULL_AXIOM_PROMPT },
        {
          role: 'system',
          content: `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 3).
Le candidat a choisi : ${mediumAnswer}
Ses préférences : ${preferencesAnswer}
Génère UNE question demandant au candidat de choisir UNE œuvre centrale (noyau) parmi ses préférences.
La question doit être claire et demander une œuvre spécifique (nom d'une série ou d'un film).
Format : Question ouverte demandant le nom de l'œuvre.
La question doit permettre d'identifier l'œuvre la plus significative pour le candidat.`,
        },
        ...messages,
      ],
    });

    return completion.trim();
  }
}
