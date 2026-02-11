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
