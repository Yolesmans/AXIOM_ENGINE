import type { AxiomCandidate, CandidateIdentity } from '../types/candidate.js';
import type { AxiomState } from '../types/session.js';
import type { AnswerRecord } from '../types/answer.js';
import type { MatchingResult } from '../types/matching.js';

class CandidateStore {
  private candidates: Map<string, AxiomCandidate> = new Map();

  create(
    candidateId: string,
    tenantId: string,
    identity?: Partial<CandidateIdentity>,
  ): AxiomCandidate {
    const now = new Date();
    const hasIdentity = identity?.firstName && identity?.lastName && identity?.email;
    
    const candidate: AxiomCandidate = {
      candidateId,
      tenantId,
      identity: {
        firstName: identity?.firstName || '',
        lastName: identity?.lastName || '',
        email: identity?.email || '',
        completedAt: hasIdentity ? now : null,
      },
      session: {
        currentBlock: 1,
        state: hasIdentity ? 'collecting' : 'identity',
        startedAt: now,
        lastActivityAt: now,
      },
      answers: [],
      blockSummaries: {},
    };

    this.candidates.set(candidateId, candidate);
    return candidate;
  }

  addAnswer(candidateId: string, record: AnswerRecord): AxiomCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }

    const updated: AxiomCandidate = {
      ...candidate,
      answers: [...candidate.answers, record],
      session: {
        ...candidate.session,
        lastActivityAt: new Date(),
      },
    };

    this.candidates.set(candidateId, updated);
    return updated;
  }

  updateIdentity(
    candidateId: string,
    identity: CandidateIdentity,
  ): AxiomCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }

    const updated: AxiomCandidate = {
      ...candidate,
      identity: {
        ...identity,
        completedAt: new Date(),
      },
      session: {
        ...candidate.session,
        state: candidate.session.state === 'identity' ? 'preamble' : candidate.session.state,
        lastActivityAt: new Date(),
      },
    };

    this.candidates.set(candidateId, updated);
    return updated;
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
      blockSummaries: Record<string, unknown>;
      finalProfile: Record<string, unknown>;
      matchingResult: MatchingResult | undefined;
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

  setFinalProfileText(candidateId: string, text: string): AxiomCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }

    const updated: AxiomCandidate = {
      ...candidate,
      finalProfileText: text,
      session: {
        ...candidate.session,
        lastActivityAt: new Date(),
      },
    };

    this.candidates.set(candidateId, updated);
    return updated;
  }

  setMatchingResult(candidateId: string, result: MatchingResult): AxiomCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }

    const updated: AxiomCandidate = {
      ...candidate,
      matchingResult: result,
      session: {
        ...candidate.session,
        lastActivityAt: new Date(),
      },
    };

    this.candidates.set(candidateId, updated);
    return updated;
  }

  setTonePreference(candidateId: string, preference: 'tutoiement' | 'vouvoiement'): AxiomCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }

    const updated: AxiomCandidate = {
      ...candidate,
      tonePreference: preference,
      session: {
        ...candidate.session,
        lastActivityAt: new Date(),
      },
    };

    this.candidates.set(candidateId, updated);
    return updated;
  }
}

export const candidateStore = new CandidateStore();
