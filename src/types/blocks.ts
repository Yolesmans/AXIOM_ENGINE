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

export interface QuestionQueue {
  blockNumber: number;
  questions: string[];
  cursorIndex: number;
  isComplete: boolean;
  generatedAt: string;
  completedAt: string | null;
}

export interface AnswerMap {
  blockNumber: number;
  answers: Record<number, string>;
  lastAnswerAt: string;
}
