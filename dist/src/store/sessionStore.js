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
    setQuestionsForBlock(candidateId, blockNumber, questions) {
        const candidate = this.candidates.get(candidateId);
        if (!candidate) {
            throw new Error(`Candidate ${candidateId} not found`);
        }
        // Appeler initQuestionQueue si nécessaire
        const queue = this.initQuestionQueue(candidateId, blockNumber);
        // Remplacer questions par le tableau fourni
        const updatedQueue = {
            ...queue,
            questions,
            cursorIndex: 0,
            isComplete: false,
            completedAt: null,
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
