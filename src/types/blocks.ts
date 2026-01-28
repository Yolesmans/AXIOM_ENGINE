export const AXIOM_BLOCKS = {
  MIN: 1,
  MAX: 10,
} as const;

export type AxiomBlockNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export function isValidBlockNumber(block: number): block is AxiomBlockNumber {
  return block >= AXIOM_BLOCKS.MIN && block <= AXIOM_BLOCKS.MAX;
}
