import type { AxiomSession } from '../types/session.js';

class SessionStore {
  private sessions: Map<string, AxiomSession> = new Map();

  create(sessionId: string): AxiomSession {
    const now = new Date();
    const session: AxiomSession = {
      sessionId,
      currentBlock: 1,
      state: 'collecting',
      answers: {},
      blockSummaries: {},
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): AxiomSession | undefined {
    return this.sessions.get(sessionId);
  }

  update(
    sessionId: string,
    updates: Partial<Pick<AxiomSession, 'currentBlock' | 'state' | 'answers' | 'blockSummaries'>>,
  ): AxiomSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const updated: AxiomSession = {
      ...session,
      ...updates,
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, updated);
    return updated;
  }

  exists(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}

export const sessionStore = new SessionStore();
