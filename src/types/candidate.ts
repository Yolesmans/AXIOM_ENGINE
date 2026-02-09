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

export interface CandidateSession {
  currentBlock: number;
  state: AxiomState;
  startedAt: Date;
  lastActivityAt: Date;
  completedAt?: Date;
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
