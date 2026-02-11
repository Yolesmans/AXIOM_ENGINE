// ============================================
// CONSTANTES ET HELPERS EXISTANTS (PRÉ-PHASE 1)
// ============================================

export const AXIOM_BLOCKS = {
  MIN: 1,
  MAX: 10,
};

export function isValidBlockNumber(block: number): boolean {
  return block >= AXIOM_BLOCKS.MIN && block <= AXIOM_BLOCKS.MAX;
}

// ============================================
// TYPES PHASE 1 (NOUVEAUX)
// ============================================

/** Métadonnée par question BLOC 2B premium (ordre fixe : motif, personnages, traits…, récap par œuvre) */
export interface Block2BQuestionMeta {
  workIndex: number;
  slot: 'motif' | 'personnages' | 'trait' | 'recap';
}

export interface QuestionQueue {
  blockNumber: number;
  questions: string[];
  cursorIndex: number;
  isComplete: boolean;
  generatedAt: string;
  completedAt: string | null;
  /** BLOC 2B premium uniquement : même longueur que questions, pour savoir slot/workIndex */
  meta?: Block2BQuestionMeta[];
}

export interface AnswerMap {
  blockNumber: number;
  answers: Record<number, string>;
  lastAnswerAt: string;
}

// ============================================
// BLOC 2 — STATE MACHINE (refonte structurelle)
// ============================================

export type Block2AStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type Block2BStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface Block2AState {
  status: Block2AStatus;
}

export interface Block2BState {
  status: Block2BStatus;
  currentQuestionIndex: number;
}

export interface BlockStates {
  '2A': Block2AState;
  '2B': Block2BState;
}

/** Réponses BLOC 2A — champs nommés, aucun index partagé avec 2B */
export interface Block2AAnswers {
  medium?: string;
  preference?: string;
  coreWork?: string;
}

/** Réponses BLOC 2B — liste ordonnée (index = question) */
export interface Block2BAnswers {
  answers: string[];
}

export interface Block2Answers {
  block2A?: Block2AAnswers;
  block2B?: Block2BAnswers;
}
