import type { AxiomCandidate } from '../types/candidate.js';
import type { AxiomSession } from '../types/session.js';

/**
 * Adaptateur temporaire pour convertir AxiomCandidate vers AxiomSession
 * (pour compatibilité avec le moteur existant)
 */
export function candidateToSession(candidate: AxiomCandidate): AxiomSession {
  return {
    sessionId: candidate.candidateId,
    currentBlock: candidate.session.currentBlock,
    state: candidate.session.state,
    answers: {} as Record<string, unknown>,
    blockSummaries: candidate.blockSummaries,
    createdAt: candidate.session.startedAt,
    updatedAt: candidate.session.lastActivityAt,
  };
}

/**
 * Met à jour un AxiomCandidate à partir d'un AxiomSession modifié
 */
export function updateCandidateFromSession(
  candidate: AxiomCandidate,
  session: AxiomSession,
): AxiomCandidate {
  return {
    ...candidate,
    session: {
      ...candidate.session,
      currentBlock: session.currentBlock,
      state: session.state,
      lastActivityAt: session.updatedAt,
    },
    blockSummaries: session.blockSummaries,
  };
}
