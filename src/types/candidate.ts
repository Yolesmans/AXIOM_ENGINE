import type { AxiomState } from './session.js';
import type { AnswerRecord } from './answer.js';
import type { ConversationMessage } from './conversation.js';
import type { QuestionQueue, AnswerMap } from './blocks.js';

export interface CandidateIdentity {
  firstName: string;
  lastName: string;
  email: string;
  completedAt: Date | null;
}

/** Œuvre normalisée par LLM (BLOC 2A.2 premium) */
export interface NormalizedWork {
  canonicalTitle: string;
  type: 'series' | 'film';
  confidence: number;
}

/** Personnage normalisé par LLM (BLOC 2B premium) */
export interface NormalizedCharacter {
  canonicalName: string;
  confidence: number;
}

export interface CandidateSession {
  currentBlock: number;
  state: AxiomState;
  startedAt: Date;
  lastActivityAt: Date;
  completedAt?: Date;
  /** BLOC 2A/2B premium : œuvres normalisées (source de vérité pour 2B) */
  normalizedWorks?: NormalizedWork[];
  /** BLOC 2B premium : personnages normalisés par œuvre (index = workIndex) */
  normalizedCharacters?: NormalizedCharacter[][];
  ui?: {
    step: string;
    lastQuestion: string | null;
    tutoiement?: 'tutoiement' | 'vouvoiement';
    identityDone?: boolean;
    mirrorValidated?: boolean;
  };
}

export interface AxiomCandidate {
  candidateId: string;
  tenantId: string;

  identity: CandidateIdentity;

  session: CandidateSession;

  // DONNÉES PRIVÉES - JAMAIS EXPOSÉES
  answers: AnswerRecord[];
  conversationHistory: ConversationMessage[];
  blockSummaries: Record<string, unknown>;
  finalProfile?: Record<string, unknown>;
  finalProfileText?: string;
  matchingResult?: import('./matching.js').MatchingResult;
  tonePreference?: 'tutoiement' | 'vouvoiement';
  blockQueues?: Record<number, QuestionQueue>;
  answerMaps?: Record<number, AnswerMap>;
}
