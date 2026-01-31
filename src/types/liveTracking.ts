export type LiveTrackingRow = {
  candidateId: string;
  tenantId: string;

  firstName: string;
  lastName: string;
  email: string;

  state: 'identity' | 'preamble' | 'collecting' | 'waiting_go' | 'matching' | 'completed';
  currentBlock: number | null;

  statusLabel: string;

  startedAt: string;
  lastActivityAt: string;
};
