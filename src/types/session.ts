export type AxiomState = 'identity' | 'collecting' | 'waiting_go' | 'matching';

export interface AxiomSession {
  sessionId: string;
  currentBlock: number;
  state: AxiomState;
  answers: Record<string, unknown>;
  blockSummaries: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
