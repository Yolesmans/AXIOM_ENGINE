import type { AxiomSession } from '../types/session.js';
import { AXIOM_BLOCKS, isValidBlockNumber } from '../types/blocks.js';
import { sessionStore } from '../store/sessionStore.js';

export class AxiomEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AxiomEngineError';
  }
}

/**
 * Vérifie si une session peut avancer au bloc suivant
 */
export function canAdvance(session: AxiomSession): boolean {
  // Ne peut avancer que si on est en état "waiting_go"
  if (session.state !== 'waiting_go') {
    return false;
  }

  // Ne peut pas avancer au-delà du dernier bloc
  if (session.currentBlock >= AXIOM_BLOCKS.MAX) {
    return false;
  }

  return true;
}

/**
 * Fait avancer une session au bloc suivant
 * @throws {AxiomEngineError} Si la transition n'est pas autorisée
 */
export function advanceBlock(session: AxiomSession): AxiomSession {
  if (!canAdvance(session)) {
    throw new AxiomEngineError(
      `Impossible d'avancer : état=${session.state}, bloc=${session.currentBlock}`,
      'TRANSITION_FORBIDDEN',
    );
  }

  const nextBlock = session.currentBlock + 1;

  if (!isValidBlockNumber(nextBlock)) {
    throw new AxiomEngineError(
      `Bloc invalide : ${nextBlock}`,
      'INVALID_BLOCK',
    );
  }

  const updated = sessionStore.update(session.sessionId, {
    currentBlock: nextBlock,
    state: 'collecting',
  });

  if (!updated) {
    throw new AxiomEngineError(
      'Session introuvable lors de la mise à jour',
      'SESSION_NOT_FOUND',
    );
  }

  return updated;
}

/**
 * Passe une session en état "waiting_go"
 * @throws {AxiomEngineError} Si la transition n'est pas autorisée
 */
export function setWaitingGo(session: AxiomSession): AxiomSession {
  // Ne peut passer en "waiting_go" que depuis "collecting"
  if (session.state !== 'collecting') {
    throw new AxiomEngineError(
      `Impossible de passer en waiting_go depuis l'état ${session.state}`,
      'TRANSITION_FORBIDDEN',
    );
  }

  const updated = sessionStore.update(session.sessionId, {
    state: 'waiting_go',
  });

  if (!updated) {
    throw new AxiomEngineError(
      'Session introuvable lors de la mise à jour',
      'SESSION_NOT_FOUND',
    );
  }

  return updated;
}

/**
 * Démarre le matching (bloc 10 terminé)
 * @throws {AxiomEngineError} Si la transition n'est pas autorisée
 */
export function startMatching(session: AxiomSession): AxiomSession {
  // Doit être en "waiting_go" et au dernier bloc
  if (session.state !== 'waiting_go') {
    throw new AxiomEngineError(
      `Impossible de démarrer le matching depuis l'état ${session.state}`,
      'TRANSITION_FORBIDDEN',
    );
  }

  if (session.currentBlock !== AXIOM_BLOCKS.MAX) {
    throw new AxiomEngineError(
      `Le matching ne peut démarrer qu'au bloc ${AXIOM_BLOCKS.MAX}, actuellement au bloc ${session.currentBlock}`,
      'TRANSITION_FORBIDDEN',
    );
  }

  const updated = sessionStore.update(session.sessionId, {
    state: 'matching',
  });

  if (!updated) {
    throw new AxiomEngineError(
      'Session introuvable lors de la mise à jour',
      'SESSION_NOT_FOUND',
    );
  }

  return updated;
}
