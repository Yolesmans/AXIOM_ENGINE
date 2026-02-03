import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { callOpenAI } from '../services/openaiClient.js';
import type { AxiomCandidate } from '../types/candidate.js';
import type { AnswerRecord } from '../types/answer.js';
import { candidateStore } from '../store/sessionStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger FULL_AXIOM_PROMPT
async function loadFullAxiomPrompt(): Promise<string> {
  const promptsDir = join(__dirname, '../prompts');
  const systemPrompt = await readFile(join(promptsDir, 'system/AXIOM_ENGINE.txt'), 'utf-8');
  const profilPrompt = await readFile(join(promptsDir, 'metier/AXIOM_PROFIL.txt'), 'utf-8');
  return `${systemPrompt}\n\n${profilPrompt}`;
}

// Charger PROMPT MATCHING
async function loadMatchingPrompt(): Promise<string> {
  const promptsDir = join(__dirname, '../prompts');
  return await readFile(join(promptsDir, 'metier/AXIOM_MATCHING.txt'), 'utf-8');
}

// ============================================
// ÉTATS STRICTS (ENUM)
// ============================================

export const STATE_0_COLLECT_IDENTITY = 'STATE_0_COLLECT_IDENTITY';
export const STATE_1_WELCOME_MESSAGE = 'STATE_1_WELCOME_MESSAGE';
export const STATE_2_TONE_CHOICE = 'STATE_2_TONE_CHOICE';
export const STATE_3_PREAMBULE = 'STATE_3_PREAMBULE';
export const STATE_4_WAIT_START_EVENT = 'STATE_4_WAIT_START_EVENT';
export const STATE_5_BLOC_1 = 'STATE_5_BLOC_1';
export const STATE_6_BLOC_2 = 'STATE_6_BLOC_2';
export const STATE_MATCHING_FINAL = 'STATE_MATCHING_FINAL';
export const STATE_END = 'STATE_END';

export interface ExecuteAxiomResult {
  response: string;
  step: string;
  lastQuestion: string | null;
  tutoiement?: 'tutoiement' | 'vouvoiement';
  expectsAnswer: boolean;
  autoContinue: boolean;
  showStartButton?: boolean;
}

export interface ExecuteAxiomInput {
  candidate: AxiomCandidate;
  userMessage: string | null;
  event?: string;
}

// ============================================
// LOGGING OBLIGATOIRE
// ============================================

function logTransition(
  sessionId: string,
  stateIn: string,
  stateOut: string,
  inputType: 'message' | 'event',
): void {
  console.log('[AXIOM_STATE_TRANSITION]', {
    sessionId,
    stateIn,
    stateOut,
    inputType,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// EXÉCUTEUR PRINCIPAL
// ============================================

export async function executeAxiom(
  input: ExecuteAxiomInput,
): Promise<ExecuteAxiomResult> {
  const { candidate, userMessage, event } = input;

  // INIT ÉTAT
  const ui = candidate.session.ui || {
    step: candidate.identity.completedAt ? STATE_1_WELCOME_MESSAGE : STATE_0_COLLECT_IDENTITY,
    lastQuestion: null,
    identityDone: !!candidate.identity.completedAt,
  };

  let currentState = ui.step as string;
  const stateIn = currentState;

  // ============================================
  // STATE_0_COLLECT_IDENTITY
  // ============================================
  if (currentState === STATE_0_COLLECT_IDENTITY) {
    // Affiche UNIQUEMENT le formulaire identité
    // N'envoie AUCUN prompt LLM
    // Transition automatique vers STATE_1 après validation (géré dans server.ts)
    logTransition(candidate.candidateId, stateIn, currentState, userMessage ? 'message' : 'event');
    return {
      response: '',
      step: currentState,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false,
    };
  }

  // ============================================
  // STATE_1_WELCOME_MESSAGE
  // ============================================
  if (currentState === STATE_1_WELCOME_MESSAGE) {
    const welcomeText =
      'Bienvenue dans AXIOM.\n' +
      'On va découvrir qui tu es vraiment — pas ce qu\'il y a sur ton CV.\n' +
      'Promis : je ne te juge pas. Je veux juste comprendre comment tu fonctionnes.';

    currentState = STATE_2_TONE_CHOICE;
    candidateStore.updateUIState(candidate.candidateId, {
      step: currentState,
      lastQuestion: null,
      identityDone: true,
    });

    logTransition(candidate.candidateId, stateIn, currentState, 'message');
    return {
      response: welcomeText,
      step: currentState,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: true,
    };
  }

  // ============================================
  // STATE_2_TONE_CHOICE
  // ============================================
  if (currentState === STATE_2_TONE_CHOICE) {
    // Si pas de message, afficher la question
    if (!userMessage) {
      const toneQuestion = 'On commence tranquille.\nDis-moi : tu préfères qu\'on se tutoie ou qu\'on se vouvoie pour cette discussion ?';
      logTransition(candidate.candidateId, stateIn, currentState, 'message');
      return {
        response: toneQuestion,
        step: currentState,
        lastQuestion: toneQuestion,
        expectsAnswer: true,
        autoContinue: false,
      };
    }

    // Validation tutoiement/vouvoiement
    const lower = userMessage.toLowerCase();
    let tutoiement: 'tutoiement' | 'vouvoiement' | undefined;

    if (lower.includes('tutoi') || lower.includes('tutoie') || lower.includes('tutoy')) {
      tutoiement = 'tutoiement';
    } else if (lower.includes('vouvoi') || lower.includes('vouvoie') || lower.includes('vouvoy')) {
      tutoiement = 'vouvoiement';
    }

    if (tutoiement) {
      // Stocker le ton et passer au préambule
      candidateStore.updateUIState(candidate.candidateId, {
        step: STATE_3_PREAMBULE,
        lastQuestion: null,
        tutoiement,
        identityDone: true,
      });
      candidateStore.setTonePreference(candidate.candidateId, tutoiement);

      currentState = STATE_3_PREAMBULE;
      logTransition(candidate.candidateId, stateIn, currentState, 'message');

      // Enchaîner immédiatement avec le préambule
      return await executeAxiom({
        candidate: candidateStore.get(candidate.candidateId)!,
        userMessage: null,
      });
    } else {
      // Réponse invalide, reposer la question
      const toneQuestion = 'On commence tranquille.\nDis-moi : tu préfères qu\'on se tutoie ou qu\'on se vouvoie pour cette discussion ?';
      logTransition(candidate.candidateId, stateIn, currentState, 'message');
      return {
        response: toneQuestion,
        step: currentState,
        lastQuestion: toneQuestion,
        expectsAnswer: true,
        autoContinue: false,
      };
    }
  }

  // ============================================
  // STATE_3_PREAMBULE
  // ============================================
  if (currentState === STATE_3_PREAMBULE) {
    // Envoyer LE PRÉAMBULE COMPLET (prompt figé)
    let aiText: string | null = null;

    try {
      const FULL_AXIOM_PROMPT = await loadFullAxiomPrompt();
      const completion = await callOpenAI({
        messages: [
          { role: 'system', content: FULL_AXIOM_PROMPT },
          {
            role: 'system',
            content: `RÈGLE ABSOLUE AXIOM :
Tu es en état STATE_3_PREAMBULE.
Tu dois afficher LE PRÉAMBULE MÉTIER COMPLET.
Tu NE POSES PAS de question.
Tu affiches uniquement le préambule tel que défini dans le prompt.`,
          },
        ],
      });

      if (typeof completion === 'string' && completion.trim()) {
        aiText = completion.trim();
      }
    } catch (e) {
      console.error('[AXIOM_EXECUTION_ERROR]', e);
    }

    // AUCUN FALLBACK AUTORISÉ
    if (!aiText) {
      logTransition(candidate.candidateId, stateIn, STATE_END, 'message');
      return {
        response: '',
        step: STATE_END,
        lastQuestion: null,
        expectsAnswer: false,
        autoContinue: false,
      };
    }

    // Transition vers STATE_4
    currentState = STATE_4_WAIT_START_EVENT;
    candidateStore.updateUIState(candidate.candidateId, {
      step: currentState,
      lastQuestion: null,
      tutoiement: ui.tutoiement,
      identityDone: true,
    });

    logTransition(candidate.candidateId, stateIn, currentState, 'message');
    return {
      response: aiText,
      step: currentState,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false,
    };
  }

  // ============================================
  // STATE_4_WAIT_START_EVENT
  // ============================================
  if (currentState === STATE_4_WAIT_START_EVENT) {
    // Si event START_BLOC_1, transition vers STATE_5
    if (event === 'START_BLOC_1') {
      currentState = STATE_5_BLOC_1;
      candidateStore.updateUIState(candidate.candidateId, {
        step: currentState,
        lastQuestion: null,
        tutoiement: ui.tutoiement,
        identityDone: true,
      });
      candidateStore.updateSession(candidate.candidateId, { state: 'collecting', currentBlock: 1 });

      logTransition(candidate.candidateId, stateIn, currentState, 'event');
      // Enchaîner immédiatement avec BLOC 1
      return await executeAxiom({
        candidate: candidateStore.get(candidate.candidateId)!,
        userMessage: null,
      });
    }

    // Si message texte reçu, refuser
    if (userMessage) {
      logTransition(candidate.candidateId, stateIn, currentState, 'message');
      return {
        response: '',
        step: currentState,
        lastQuestion: null,
        expectsAnswer: false,
        autoContinue: false,
        showStartButton: true,
      };
    }

    // Retourner l'état d'attente
    logTransition(candidate.candidateId, stateIn, currentState, 'message');
    return {
      response: '',
      step: currentState,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false,
      showStartButton: true,
    };
  }

  // ============================================
  // STATE_5_BLOC_1 et suivants
  // ============================================
  if (currentState === STATE_5_BLOC_1 || currentState === STATE_6_BLOC_2) {
    // Construire l'historique des messages
    const messages: Array<{ role: string; content: string }> = [];
    candidate.answers.forEach((answer: AnswerRecord) => {
      messages.push({ role: 'user', content: answer.message });
    });

    if (userMessage) {
      messages.push({ role: 'user', content: userMessage });
    }

    let aiText: string | null = null;

    try {
      const FULL_AXIOM_PROMPT = await loadFullAxiomPrompt();
      const completion = await callOpenAI({
        messages: [
          { role: 'system', content: FULL_AXIOM_PROMPT },
          {
            role: 'system',
            content: `RÈGLE ABSOLUE AXIOM :
Tu es en état ${currentState}.
Tu exécutes STRICTEMENT le protocole AXIOM pour ce bloc.
Tu produis UNIQUEMENT le texte autorisé à cette étape.
INTERDICTIONS : improviser, commenter le système, reformuler le prompt, revenir en arrière.`,
          },
          ...messages,
        ],
      });

      if (typeof completion === 'string' && completion.trim()) {
        aiText = completion.trim();
      }
    } catch (e) {
      console.error('[AXIOM_EXECUTION_ERROR]', e);
    }

    // AUCUN FALLBACK AUTORISÉ
    if (!aiText) {
      logTransition(candidate.candidateId, stateIn, STATE_END, 'message');
      return {
        response: '',
        step: STATE_END,
        lastQuestion: null,
        expectsAnswer: false,
        autoContinue: false,
      };
    }

    const expectsAnswer = aiText.trim().endsWith('?');

    // Stocker la réponse si en collecting
    if (userMessage && candidate.session.state === 'collecting') {
      const answerRecord: AnswerRecord = {
        block: candidate.session.currentBlock,
        message: userMessage,
        createdAt: new Date().toISOString(),
      };
      candidateStore.addAnswer(candidate.candidateId, answerRecord);
    }

    // Mémoriser la dernière question
    let lastQuestion: string | null = null;
    if (expectsAnswer) {
      lastQuestion = aiText;
    }

    candidateStore.updateUIState(candidate.candidateId, {
      step: currentState,
      lastQuestion,
      tutoiement: ui.tutoiement,
      identityDone: true,
    });

    logTransition(candidate.candidateId, stateIn, currentState, userMessage ? 'message' : 'event');
    return {
      response: aiText,
      step: currentState,
      lastQuestion,
      expectsAnswer,
      autoContinue: false,
    };
  }

  // ============================================
  // STATE_MATCHING_FINAL
  // ============================================
  if (currentState === STATE_MATCHING_FINAL) {
    let aiText: string | null = null;

    try {
      const MATCHING_PROMPT = await loadMatchingPrompt();
      const messages: Array<{ role: string; content: string }> = [];
      candidate.answers.forEach((answer: AnswerRecord) => {
        messages.push({ role: 'user', content: answer.message });
      });

      const completion = await callOpenAI({
        messages: [
          { role: 'system', content: MATCHING_PROMPT },
          ...messages,
        ],
      });

      if (typeof completion === 'string' && completion.trim()) {
        aiText = completion.trim();
      }
    } catch (e) {
      console.error('[AXIOM_EXECUTION_ERROR]', e);
    }

    // AUCUN FALLBACK AUTORISÉ
    if (!aiText) {
      logTransition(candidate.candidateId, stateIn, STATE_END, 'message');
      return {
        response: '',
        step: STATE_END,
        lastQuestion: null,
        expectsAnswer: false,
        autoContinue: false,
      };
    }

    currentState = STATE_END;
    candidateStore.updateUIState(candidate.candidateId, {
      step: currentState,
      lastQuestion: null,
      tutoiement: ui.tutoiement,
      identityDone: true,
    });

    logTransition(candidate.candidateId, stateIn, currentState, 'message');
    return {
      response: aiText,
      step: currentState,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false,
    };
  }

  // ============================================
  // STATE_END
  // ============================================
  if (currentState === STATE_END) {
    logTransition(candidate.candidateId, stateIn, currentState, userMessage ? 'message' : 'event');
    return {
      response: '',
      step: currentState,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false,
    };
  }

  // État inconnu
  console.error('[AXIOM_UNKNOWN_STATE]', { sessionId: candidate.candidateId, state: currentState });
  logTransition(candidate.candidateId, stateIn, STATE_END, 'message');
  return {
    response: '',
    step: STATE_END,
    lastQuestion: null,
    expectsAnswer: false,
    autoContinue: false,
  };
}
