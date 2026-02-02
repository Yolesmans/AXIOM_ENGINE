class CandidateStore {
    candidates = new Map();
    create(candidateId, tenantId, identity) {
        const now = new Date();
        const hasIdentity = identity?.firstName && identity?.lastName && identity?.email;
        const candidate = {
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
    addAnswer(candidateId, record) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            return undefined;
        }
        const updated = {
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
    updateIdentity(candidateId, identity) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            return undefined;
        }
        const updated = {
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
    get(candidateId) {
        return this.candidates.get(candidateId);
    }
    getByTenant(tenantId) {
        return Array.from(this.candidates.values()).filter((candidate) => candidate.tenantId === tenantId);
    }
    updateSession(candidateId, updates) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            return undefined;
        }
        const updated = {
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
    updatePrivateData(candidateId, updates) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            return undefined;
        }
        const updated = {
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
    exists(candidateId) {
        return this.candidates.has(candidateId);
    }
    setFinalProfileText(candidateId, text) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            return undefined;
        }
        const updated = {
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
    setMatchingResult(candidateId, result) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            return undefined;
        }
        const updated = {
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
    setTonePreference(candidateId, preference) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            return undefined;
        }
        const updated = {
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
    updateUIState(candidateId, uiUpdates) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            return undefined;
        }
        const currentUI = candidate.session.ui || {
            step: candidate.identity.completedAt ? 'STEP_01_TUTOVOU' : 'STEP_00_IDENTITY',
            lastQuestion: null,
            identityDone: !!candidate.identity.completedAt,
        };
        const updated = {
            ...candidate,
            session: {
                ...candidate.session,
                ui: {
                    ...currentUI,
                    ...uiUpdates,
                },
                lastActivityAt: new Date(),
            },
        };
        this.candidates.set(candidateId, updated);
        return updated;
    }
}
export const candidateStore = new CandidateStore();
