/**
 * Types pour les exports vers Google Sheets
 * Ces types représentent UNIQUEMENT les données non sensibles
 */

export type MatchingVerdict = '🟢 ALIGNÉ' | '🔵 ALIGNEMENT CONDITIONNEL' | '🟠 PAS ALIGNÉ';

export interface LiveTrackingRow {
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  axiomStarted: 'oui' | 'non';
  currentBlock: number;
  axiomState: 'collecting' | 'waiting_go' | 'matching';
  axiomCompleted: 'oui' | 'non';
  matchingAvailable: 'oui' | 'non';
  lastActivity: Date;
}

export interface RhExportRow {
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  completedAt: Date;
  matchingVerdict: MatchingVerdict;
}
