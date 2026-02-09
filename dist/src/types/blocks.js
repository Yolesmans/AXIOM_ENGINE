// ============================================
// CONSTANTES ET HELPERS EXISTANTS (PRÉ-PHASE 1)
// ============================================
export const AXIOM_BLOCKS = {
    MIN: 1,
    MAX: 10,
};
export function isValidBlockNumber(block) {
    return block >= AXIOM_BLOCKS.MIN && block <= AXIOM_BLOCKS.MAX;
}
