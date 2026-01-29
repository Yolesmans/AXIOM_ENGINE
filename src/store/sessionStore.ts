import type { AxiomCandidate, CandidateIdentity } from '../types/candidate.js';
import type { AxiomState } from '../types/session.js';

class CandidateStore {
  private candidates: Map<string, AxiomCandidate> = new Map();

  create(
    candidateId: string,
    tenantId: string,
    identity: CandidateIdentity,
  ): AxiomCandidate {
    const now = new Date();
    const candidate: AxiomCandidate = {
      candidateId,
      tenantId,
      identity,
      session: {
        currentBlock: 1,
        state: 'collecting',
        startedAt: now,
        lastActivityAt: now,
      },
      answers: {},
      blockSummaries: {},
    };

    this.candidates.set(candidateId, candidate);
    return candidate;
  }

  get(candidateId: string): AxiomCandidate | undefined {
    return this.candidates.get(candidateId);
  }

  getByTenant(tenantId: string): AxiomCandidate[] {
    return Array.from(this.candidates.values()).filter(
      (candidate) => candidate.tenantId === tenantId,
    );
  }

  updateSession(
    candidateId: string,
    updates: Partial<{
      currentBlock: number;
      state: AxiomState;
      completedAt: Date;
    }>,
  ): AxiomCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }

    const updated: AxiomCandidate = {
      ...candidate,
      session: {
        ...candidate.session,
        ...updates,
        lastActivityAt: new Date(),
      },
    };

    this.candidates.set(candidateId, updated);
    return updated;
  }

  updatePrivateData(
    candidateId: string,
    updates: Partial<{
      answers: Record<string, unknown>;
      blockSummaries: Record<string, unknown>;
      finalProfile: Record<string, unknown>;
      matchingResult: Record<string, unknown>;
    }>,
  ): AxiomCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }

    const updated: AxiomCandidate = {
      ...candidate,
      ...updates,
      session: {
        ...candidate.session,
        lastActivityAt: new Date(),
      },
    };

    this.candidates.set(candidateId, updated);
    return updated;
  }

  exists(candidateId: string): boolean {
    return this.candidates.has(candidateId);
  }
}

export const candidateStore = new CandidateStore();
