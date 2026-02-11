import * as fs from 'fs';
let redisClient = null;
let filePersistTimer = null;
const FILE_PERSIST_PATH = process.env.AXIOM_PERSIST_PATH || '/tmp/axiom_store.json';
// Initialiser Redis si REDIS_URL existe
if (process.env.REDIS_URL) {
    try {
        // Dynamic import pour éviter erreur si ioredis n'est pas installé
        const Redis = require('ioredis');
        if (Redis && Redis.default) {
            redisClient = new Redis.default(process.env.REDIS_URL);
        }
        else {
            redisClient = new Redis(process.env.REDIS_URL);
        }
        console.log('[STORE] Redis initialized');
    }
    catch (e) {
        console.error('[STORE] Redis init failed:', e);
        redisClient = null;
    }
}
class CandidateStore {
    candidates = new Map();
    constructor() {
        this.loadFromFile();
    }
    async persistCandidate(candidateId) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate)
            return;
        // Redis persistence
        if (redisClient) {
            try {
                await redisClient.set(`axiom:candidate:${candidateId}`, JSON.stringify(candidate));
            }
            catch (e) {
                console.error('[STORE] Redis persist error:', e);
            }
        }
        // File persistence (debounced)
        if (filePersistTimer) {
            clearTimeout(filePersistTimer);
        }
        filePersistTimer = setTimeout(() => {
            this.saveToFile();
        }, 200);
    }
    /** Persistance garantie avant retour API (Redis + file immédiat). À appeler après toute modification blockStates / block2Answers. */
    async persistAndFlush(candidateId) {
        await this.persistCandidate(candidateId);
        this.saveToFile();
    }
    saveToFile() {
        try {
            const data = {};
            this.candidates.forEach((candidate, id) => {
                data[id] = candidate;
            });
            fs.writeFileSync(FILE_PERSIST_PATH, JSON.stringify(data, null, 2));
        }
        catch (e) {
            console.error('[STORE] File save error:', e);
        }
    }
    loadFromFile() {
        if (redisClient)
            return; // Redis prioritaire
        try {
            if (fs.existsSync(FILE_PERSIST_PATH)) {
                const data = fs.readFileSync(FILE_PERSIST_PATH, 'utf-8');
                const parsed = JSON.parse(data);
                Object.entries(parsed).forEach(([id, candidate]) => {
                    this.candidates.set(id, candidate);
                });
                console.log('[STORE] Loaded from file:', this.candidates.size, 'candidates');
            }
        }
        catch (e) {
            console.error('[STORE] File load error:', e);
        }
    }
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
            conversationHistory: [],
            blockSummaries: {},
            blockQueues: {},
            answerMaps: {},
        };
        this.candidates.set(candidateId, candidate);
        this.persistCandidate(candidateId);
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
        this.persistCandidate(candidateId);
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
        this.persistCandidate(candidateId);
        return updated;
    }
    get(candidateId) {
        // Si dans Map, retourner (synchrone pour compatibilité)
        return this.candidates.get(candidateId);
    }
    async getAsync(candidateId) {
        // Si dans Map, retourner
        if (this.candidates.has(candidateId)) {
            return this.candidates.get(candidateId);
        }
        // Si Redis disponible, chercher
        if (redisClient) {
            try {
                const data = await redisClient.get(`axiom:candidate:${candidateId}`);
                if (data) {
                    const candidate = JSON.parse(data);
                    this.candidates.set(candidateId, candidate);
                    return candidate;
                }
            }
            catch (e) {
                console.error('[STORE] Redis get error:', e);
            }
        }
        return undefined;
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
        this.persistCandidate(candidateId);
        return updated;
    }
    setNormalizedWorks(candidateId, works) {
        return this.updateSession(candidateId, { normalizedWorks: works });
    }
    setNormalizedCharacters(candidateId, workIndex, characters) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate)
            return undefined;
        const prev = candidate.session.normalizedCharacters ?? [];
        const next = [...prev];
        next[workIndex] = characters;
        return this.updateSession(candidateId, { normalizedCharacters: next });
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
        this.persistCandidate(candidateId);
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
        this.persistCandidate(candidateId);
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
        this.persistCandidate(candidateId);
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
        this.persistCandidate(candidateId);
        return updated;
    }
    appendConversationMessage(candidateId, message) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            return undefined;
        }
        const updated = {
            ...candidate,
            conversationHistory: [...(candidate.conversationHistory || []), message],
            session: {
                ...candidate.session,
                lastActivityAt: new Date(),
            },
        };
        this.candidates.set(candidateId, updated);
        this.persistCandidate(candidateId);
        return updated;
    }
    appendUserMessage(candidateId, content, meta) {
        const message = {
            role: 'user',
            content,
            createdAt: new Date().toISOString(),
            block: meta?.block,
            step: meta?.step,
            kind: meta?.kind || 'other',
        };
        return this.appendConversationMessage(candidateId, message);
    }
    appendAssistantMessage(candidateId, content, meta) {
        const message = {
            role: 'assistant',
            content,
            createdAt: new Date().toISOString(),
            block: meta?.block,
            step: meta?.step,
            kind: meta?.kind || 'other',
        };
        return this.appendConversationMessage(candidateId, message);
    }
    appendMirrorValidation(candidateId, mirrorBlock, validationText) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            throw new Error(`Candidate ${candidateId} not found`);
        }
        const message = {
            role: 'user',
            content: validationText,
            createdAt: new Date().toISOString(),
            block: mirrorBlock,
            step: `BLOC_${String(mirrorBlock).padStart(2, '0')}`,
            kind: 'mirror_validation',
        };
        const updated = {
            ...candidate,
            conversationHistory: [...(candidate.conversationHistory || []), message],
            session: {
                ...candidate.session,
                lastActivityAt: new Date(),
            },
        };
        this.candidates.set(candidateId, updated);
        this.persistCandidate(candidateId);
        return updated;
    }
    initQuestionQueue(candidateId, blockNumber) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            throw new Error(`Candidate ${candidateId} not found`);
        }
        const blockQueues = candidate.blockQueues || {};
        // Si la queue existe déjà, la retourner
        if (blockQueues[blockNumber]) {
            return blockQueues[blockNumber];
        }
        // Sinon créer une queue vide
        const nowISO = new Date().toISOString();
        const queue = {
            blockNumber,
            questions: [],
            cursorIndex: 0,
            isComplete: false,
            generatedAt: nowISO,
            completedAt: null,
        };
        const updated = {
            ...candidate,
            blockQueues: {
                ...blockQueues,
                [blockNumber]: queue,
            },
            session: {
                ...candidate.session,
                lastActivityAt: new Date(),
            },
        };
        this.candidates.set(candidateId, updated);
        this.persistCandidate(candidateId);
        return queue;
    }
    setQuestionsForBlock(candidateId, blockNumber, questions, meta) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            throw new Error(`Candidate ${candidateId} not found`);
        }
        const queue = this.initQuestionQueue(candidateId, blockNumber);
        const updatedQueue = {
            ...queue,
            questions,
            cursorIndex: 0,
            isComplete: false,
            completedAt: null,
            ...(meta !== undefined && meta.length === questions.length ? { meta } : {}),
        };
        const blockQueues = candidate.blockQueues || {};
        const updated = {
            ...candidate,
            blockQueues: {
                ...blockQueues,
                [blockNumber]: updatedQueue,
            },
            session: {
                ...candidate.session,
                lastActivityAt: new Date(),
            },
        };
        this.candidates.set(candidateId, updated);
        this.persistCandidate(candidateId);
        return updatedQueue;
    }
    /** Insère des questions à un index donné (BLOC 2B premium : traits + récap après personnages). Ne modifie pas cursorIndex. */
    insertQuestionsAt(candidateId, blockNumber, atIndex, newQuestions, newMeta) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate)
            return undefined;
        const queue = candidate.blockQueues?.[blockNumber];
        if (!queue || atIndex < 0 || atIndex > queue.questions.length)
            return undefined;
        const questions = [
            ...queue.questions.slice(0, atIndex),
            ...newQuestions,
            ...queue.questions.slice(atIndex),
        ];
        const meta = queue.meta && newMeta && newMeta.length === newQuestions.length
            ? [...queue.meta.slice(0, atIndex), ...newMeta, ...queue.meta.slice(atIndex)]
            : queue.meta
                ? [...queue.meta.slice(0, atIndex), ...newQuestions.map(() => ({ workIndex: 0, slot: 'trait' })), ...queue.meta.slice(atIndex)]
                : undefined;
        const updatedQueue = {
            ...queue,
            questions,
            ...(meta ? { meta } : {}),
        };
        const updated = {
            ...candidate,
            blockQueues: { ...(candidate.blockQueues || {}), [blockNumber]: updatedQueue },
            session: { ...candidate.session, lastActivityAt: new Date() },
        };
        this.candidates.set(candidateId, updated);
        this.persistCandidate(candidateId);
        return updatedQueue;
    }
    advanceQuestionCursor(candidateId, blockNumber) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            return undefined;
        }
        const blockQueues = candidate.blockQueues || {};
        const queue = blockQueues[blockNumber];
        // Si queue absente -> undefined
        if (!queue) {
            return undefined;
        }
        // cursorIndex++
        const updatedQueue = {
            ...queue,
            cursorIndex: queue.cursorIndex + 1,
        };
        const updated = {
            ...candidate,
            blockQueues: {
                ...blockQueues,
                [blockNumber]: updatedQueue,
            },
            session: {
                ...candidate.session,
                lastActivityAt: new Date(),
            },
        };
        this.candidates.set(candidateId, updated);
        this.persistCandidate(candidateId);
        return updatedQueue;
    }
    markBlockComplete(candidateId, blockNumber) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            return;
        }
        const blockQueues = candidate.blockQueues || {};
        const queue = blockQueues[blockNumber];
        if (!queue) {
            return;
        }
        const nowISO = new Date().toISOString();
        const updatedQueue = {
            ...queue,
            isComplete: true,
            completedAt: nowISO,
        };
        const updated = {
            ...candidate,
            blockQueues: {
                ...blockQueues,
                [blockNumber]: updatedQueue,
            },
            session: {
                ...candidate.session,
                lastActivityAt: new Date(),
            },
        };
        this.candidates.set(candidateId, updated);
        this.persistCandidate(candidateId);
    }
    // ========== BLOC 2 — STATE MACHINE & RÉPONSES SÉPARÉES ==========
    ensureBlock2State(candidate) {
        const existing = candidate.session.blockStates;
        if (existing?.['2A'] && existing?.['2B'])
            return existing;
        return {
            '2A': { status: 'NOT_STARTED' },
            '2B': { status: 'NOT_STARTED', currentQuestionIndex: 0 },
        };
    }
    /** Initialise blockStates pour le bloc 2 si absent ; met 2A IN_PROGRESS si encore NOT_STARTED. Retourne le candidat mis à jour. */
    async ensureBlock2AndStart2AIfNeeded(candidateId) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate)
            return undefined;
        const blockStates = this.ensureBlock2State(candidate);
        const next2A = blockStates['2A'].status === 'NOT_STARTED'
            ? { ...blockStates['2A'], status: 'IN_PROGRESS' }
            : blockStates['2A'];
        const updated = {
            ...candidate,
            session: {
                ...candidate.session,
                blockStates: { ...blockStates, '2A': next2A },
                lastActivityAt: new Date(),
            },
            block2Answers: candidate.block2Answers ?? { block2A: {}, block2B: { answers: [] } },
        };
        this.candidates.set(candidateId, updated);
        await this.persistAndFlush(candidateId);
        return updated;
    }
    getBlock2AAnswers(candidate) {
        return candidate.block2Answers?.block2A;
    }
    getBlock2BAnswers(candidate) {
        return candidate.block2Answers?.block2B;
    }
    async setBlock2AMedium(candidateId, value) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate)
            return undefined;
        const block2A = { ...(candidate.block2Answers?.block2A ?? {}), medium: value };
        const updated = {
            ...candidate,
            block2Answers: {
                ...(candidate.block2Answers ?? {}),
                block2A,
                block2B: candidate.block2Answers?.block2B ?? { answers: [] },
            },
            session: { ...candidate.session, lastActivityAt: new Date() },
        };
        this.candidates.set(candidateId, updated);
        await this.persistAndFlush(candidateId);
        return updated;
    }
    async setBlock2APreference(candidateId, value) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate)
            return undefined;
        const block2A = { ...(candidate.block2Answers?.block2A ?? {}), preference: value };
        const updated = {
            ...candidate,
            block2Answers: {
                ...(candidate.block2Answers ?? {}),
                block2A,
                block2B: candidate.block2Answers?.block2B ?? { answers: [] },
            },
            session: { ...candidate.session, lastActivityAt: new Date() },
        };
        this.candidates.set(candidateId, updated);
        await this.persistAndFlush(candidateId);
        return updated;
    }
    async setBlock2ACoreWork(candidateId, value) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate)
            return undefined;
        const block2A = { ...(candidate.block2Answers?.block2A ?? {}), coreWork: value };
        const updated = {
            ...candidate,
            block2Answers: {
                ...(candidate.block2Answers ?? {}),
                block2A,
                block2B: candidate.block2Answers?.block2B ?? { answers: [] },
            },
            session: { ...candidate.session, lastActivityAt: new Date() },
        };
        this.candidates.set(candidateId, updated);
        await this.persistAndFlush(candidateId);
        return updated;
    }
    /** 2A COMPLETED, 2B IN_PROGRESS, currentQuestionIndex = 0. À appeler une seule fois après stockage coreWork. */
    async setBlock2ACompletedAndStart2B(candidateId) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate)
            return undefined;
        const blockStates = this.ensureBlock2State(candidate);
        const updated = {
            ...candidate,
            session: {
                ...candidate.session,
                blockStates: {
                    '2A': { status: 'COMPLETED' },
                    '2B': { status: 'IN_PROGRESS', currentQuestionIndex: 0 },
                },
                lastActivityAt: new Date(),
            },
        };
        this.candidates.set(candidateId, updated);
        await this.persistAndFlush(candidateId);
        return updated;
    }
    async appendBlock2BAnswer(candidateId, answer) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate)
            return undefined;
        const prev = candidate.block2Answers?.block2B?.answers ?? [];
        const updated = {
            ...candidate,
            block2Answers: {
                ...(candidate.block2Answers ?? {}),
                block2A: candidate.block2Answers?.block2A,
                block2B: { answers: [...prev, answer] },
            },
            session: { ...candidate.session, lastActivityAt: new Date() },
        };
        this.candidates.set(candidateId, updated);
        await this.persistAndFlush(candidateId);
        return updated;
    }
    async setBlock2BCurrentQuestionIndex(candidateId, index) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate)
            return undefined;
        const blockStates = this.ensureBlock2State(candidate);
        const updated = {
            ...candidate,
            session: {
                ...candidate.session,
                blockStates: {
                    ...blockStates,
                    '2B': { ...blockStates['2B'], status: 'IN_PROGRESS', currentQuestionIndex: index },
                },
                lastActivityAt: new Date(),
            },
        };
        this.candidates.set(candidateId, updated);
        await this.persistAndFlush(candidateId);
        return updated;
    }
    async setBlock2BCompleted(candidateId) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate)
            return undefined;
        const blockStates = this.ensureBlock2State(candidate);
        const updated = {
            ...candidate,
            session: {
                ...candidate.session,
                blockStates: {
                    ...blockStates,
                    '2B': { ...blockStates['2B'], status: 'COMPLETED' },
                },
                lastActivityAt: new Date(),
            },
        };
        this.candidates.set(candidateId, updated);
        await this.persistAndFlush(candidateId);
        return updated;
    }
    storeAnswerForBlock(candidateId, blockNumber, questionIndex, answer) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            throw new Error(`Candidate ${candidateId} not found`);
        }
        const answerMaps = candidate.answerMaps || {};
        let answerMap = answerMaps[blockNumber];
        // Créer answerMaps[blockNumber] si absent
        if (!answerMap) {
            const nowISO = new Date().toISOString();
            answerMap = {
                blockNumber,
                answers: {},
                lastAnswerAt: nowISO,
            };
        }
        // answers[questionIndex] = answer
        const updatedAnswerMap = {
            ...answerMap,
            answers: {
                ...answerMap.answers,
                [questionIndex]: answer,
            },
            lastAnswerAt: new Date().toISOString(),
        };
        const updated = {
            ...candidate,
            answerMaps: {
                ...answerMaps,
                [blockNumber]: updatedAnswerMap,
            },
            session: {
                ...candidate.session,
                lastActivityAt: new Date(),
            },
        };
        this.candidates.set(candidateId, updated);
        this.persistCandidate(candidateId);
        return updatedAnswerMap;
    }
}
export const candidateStore = new CandidateStore();
