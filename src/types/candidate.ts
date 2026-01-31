import type { AxiomState } from './session.js';
import type { AnswerRecord } from './answer.js';

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
}

export interface AxiomCandidate {
  candidateId: string;
  tenantId: string;

  identity: CandidateIdentity;

  session: CandidateSession;

  // DONNÉES PRIVÉES - JAMAIS EXPOSÉES
  answers: AnswerRecord[];
  blockSummaries: Record<string, unknown>;
  finalProfile?: Record<string, unknown>;
  finalProfileText?: string;
  matchingResult?: import('./matching.js').MatchingResult;
  tonePreference?: 'tutoiement' | 'vouvoiement';
}
