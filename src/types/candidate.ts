import type { AxiomState } from './session.js';

export interface CandidateIdentity {
  firstName: string;
  lastName: string;
  email: string;
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
  answers: Record<string, unknown>;
  blockSummaries: Record<string, unknown>;
  finalProfile?: Record<string, unknown>;
  matchingResult?: Record<string, unknown>;
}
