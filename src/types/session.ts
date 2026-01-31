export type AxiomState = 'identity' | 'preamble' | 'collecting' | 'waiting_go' | 'matching' | 'completed';

export interface AxiomSession {
  sessionId: string;
  currentBlock: number;
  state: AxiomState;
  answers: Record<string, unknown>;
  blockSummaries: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
