import type { AxiomCandidate, CandidateIdentity, NormalizedWork, NormalizedCharacter } from '../types/candidate.js';
import type { AxiomState } from '../types/session.js';
import type { AnswerRecord } from '../types/answer.js';
import type { MatchingResult } from '../types/matching.js';
import type { ConversationMessage, ConversationMessageKind } from '../types/conversation.js';
import type {
  QuestionQueue,
  AnswerMap,
  Block2BQuestionMeta,
  BlockStates,
  Block2AAnswers,
  Block2BAnswers,
} from '../types/blocks.js';
import * as fs from 'fs';
import * as path from 'path';

let redisClient: any = null;
let filePersistTimer: NodeJS.Timeout | null = null;
const FILE_PERSIST_PATH = process.env.AXIOM_PERSIST_PATH || '/tmp/axiom_store.json';

// Initialiser Redis si REDIS_URL existe
if (process.env.REDIS_URL) {
  try {
    // Dynamic import pour éviter erreur si ioredis n'est pas installé
    const Redis = require('ioredis');
    if (Redis && Redis.default) {
      redisClient = new Redis.default(process.env.REDIS_URL);
    } else {
      redisClient = new Redis(process.env.REDIS_URL);
    }
    console.log('[STORE] Redis initialized');
  } catch (e) {
    console.error('[STORE] Redis init failed:', e);
    redisClient = null;
  }
}

class CandidateStore {
  private candidates: Map<string, AxiomCandidate> = new Map();

  constructor() {
    this.loadFromFile();
  }

  private async persistCandidate(candidateId: string): Promise<void> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return;

    // Redis persistence
    if (redisClient) {
      try {
        await redisClient.set(
          `axiom:candidate:${candidateId}`,
          JSON.stringify(candidate),
        );
      } catch (e) {
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
  async persistAndFlush(candidateId: string): Promise<void> {
    await this.persistCandidate(candidateId);
    this.saveToFile();
  }

  private saveToFile(): void {
    try {
      const data: Record<string, AxiomCandidate> = {};
      this.candidates.forEach((candidate, id) => {
        data[id] = candidate;
      });
      fs.writeFileSync(FILE_PERSIST_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[STORE] File save error:', e);
    }
  }

  private loadFromFile(): void {
    if (redisClient) return; // Redis prioritaire

    try {
      if (fs.existsSync(FILE_PERSIST_PATH)) {
        const data = fs.readFileSync(FILE_PERSIST_PATH, 'utf-8');
        const parsed = JSON.parse(data) as Record<string, AxiomCandidate>;
        Object.entries(parsed).forEach(([id, candidate]) => {
          this.candidates.set(id, candidate);
        });
        console.log('[STORE] Loaded from file:', this.candidates.size, 'candidates');
      }
    } catch (e) {
      console.error('[STORE] File load error:', e);
    }
  }

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
      conversationHistory: [],
      blockSummaries: {},
      blockQueues: {},
      answerMaps: {},
    };

    this.candidates.set(candidateId, candidate);
    this.persistCandidate(candidateId);
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
    this.persistCandidate(candidateId);
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
    this.persistCandidate(candidateId);
    return updated;
  }

  get(candidateId: string): AxiomCandidate | undefined {
    // Si dans Map, retourner (synchrone pour compatibilité)
    return this.candidates.get(candidateId);
  }

  async getAsync(candidateId: string): Promise<AxiomCandidate | undefined> {
    // Si dans Map, retourner
    if (this.candidates.has(candidateId)) {
      return this.candidates.get(candidateId);
    }

    // Si Redis disponible, chercher
    if (redisClient) {
      try {
        const data = await redisClient.get(`axiom:candidate:${candidateId}`);
        if (data) {
          const candidate = JSON.parse(data) as AxiomCandidate;
          this.candidates.set(candidateId, candidate);
          return candidate;
        }
      } catch (e) {
        console.error('[STORE] Redis get error:', e);
      }
    }

    return undefined;
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
      normalizedWorks: NormalizedWork[];
      normalizedCharacters: NormalizedCharacter[][];
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
    this.persistCandidate(candidateId);
    return updated;
  }

  setNormalizedWorks(candidateId: string, works: NormalizedWork[]): AxiomCandidate | undefined {
    return this.updateSession(candidateId, { normalizedWorks: works });
  }

  setNormalizedCharacters(candidateId: string, workIndex: number, characters: NormalizedCharacter[]): AxiomCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return undefined;
    const prev = candidate.session.normalizedCharacters ?? [];
    const next = [...prev];
    next[workIndex] = characters;
    return this.updateSession(candidateId, { normalizedCharacters: next });
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
    this.persistCandidate(candidateId);
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
    this.persistCandidate(candidateId);
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
    this.persistCandidate(candidateId);
    return updated;
  }

  updateUIState(
    candidateId: string,
    uiUpdates: Partial<{
      step: string;
      lastQuestion: string | null;
      tutoiement: 'tutoiement' | 'vouvoiement';
      identityDone: boolean;
      mirrorValidated: boolean;
    }>,
  ): AxiomCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }

    const currentUI = candidate.session.ui || {
      step: candidate.identity.completedAt ? 'STEP_01_TUTOVOU' : 'STEP_00_IDENTITY',
      lastQuestion: null,
      identityDone: !!candidate.identity.completedAt,
    };

    const updated: AxiomCandidate = {
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

  appendConversationMessage(
    candidateId: string,
    message: ConversationMessage,
  ): AxiomCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return undefined;
    }

    const updated: AxiomCandidate = {
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

  appendUserMessage(
    candidateId: string,
    content: string,
    meta?: {
      block?: number;
      step?: string;
      kind?: ConversationMessageKind;
    },
  ): AxiomCandidate | undefined {
    const message: ConversationMessage = {
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      block: meta?.block,
      step: meta?.step,
      kind: meta?.kind || 'other',
    };
    return this.appendConversationMessage(candidateId, message);
  }

  appendAssistantMessage(
    candidateId: string,
    content: string,
    meta?: {
      block?: number;
      step?: string;
      kind?: ConversationMessageKind;
    },
  ): AxiomCandidate | undefined {
    const message: ConversationMessage = {
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      block: meta?.block,
      step: meta?.step,
      kind: meta?.kind || 'other',
    };
    return this.appendConversationMessage(candidateId, message);
  }

  appendMirrorValidation(
    candidateId: string,
    mirrorBlock: number,
    validationText: string
  ): AxiomCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    const message: ConversationMessage = {
      role: 'user',
      content: validationText,
      createdAt: new Date().toISOString(),
      block: mirrorBlock,
      step: `BLOC_${String(mirrorBlock).padStart(2, '0')}`,
      kind: 'mirror_validation',
    };

    const updated: AxiomCandidate = {
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

  initQuestionQueue(candidateId: string, blockNumber: number): QuestionQueue {
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
    const queue: QuestionQueue = {
      blockNumber,
      questions: [],
      cursorIndex: 0,
      isComplete: false,
      generatedAt: nowISO,
      completedAt: null,
    };

    const updated: AxiomCandidate = {
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

  setQuestionsForBlock(
    candidateId: string,
    blockNumber: number,
    questions: string[],
    meta?: Block2BQuestionMeta[],
  ): QuestionQueue {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    const queue = this.initQuestionQueue(candidateId, blockNumber);

    const updatedQueue: QuestionQueue = {
      ...queue,
      questions,
      cursorIndex: 0,
      isComplete: false,
      completedAt: null,
      ...(meta !== undefined && meta.length === questions.length ? { meta } : {}),
    };

    const blockQueues = candidate.blockQueues || {};
    const updated: AxiomCandidate = {
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
  insertQuestionsAt(
    candidateId: string,
    blockNumber: number,
    atIndex: number,
    newQuestions: string[],
    newMeta?: Block2BQuestionMeta[],
  ): QuestionQueue | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return undefined;
    const queue = candidate.blockQueues?.[blockNumber];
    if (!queue || atIndex < 0 || atIndex > queue.questions.length) return undefined;

    const questions = [
      ...queue.questions.slice(0, atIndex),
      ...newQuestions,
      ...queue.questions.slice(atIndex),
    ];
    const meta =
      queue.meta && newMeta && newMeta.length === newQuestions.length
        ? [...queue.meta.slice(0, atIndex), ...newMeta, ...queue.meta.slice(atIndex)]
        : queue.meta
          ? [...queue.meta.slice(0, atIndex), ...newQuestions.map((): Block2BQuestionMeta => ({ workIndex: 0, slot: 'trait' })), ...queue.meta.slice(atIndex)]
          : undefined;

    const updatedQueue: QuestionQueue = {
      ...queue,
      questions,
      ...(meta ? { meta } : {}),
    };

    const updated: AxiomCandidate = {
      ...candidate,
      blockQueues: { ...(candidate.blockQueues || {}), [blockNumber]: updatedQueue },
      session: { ...candidate.session, lastActivityAt: new Date() },
    };
    this.candidates.set(candidateId, updated);
    this.persistCandidate(candidateId);
    return updatedQueue;
  }

  advanceQuestionCursor(
    candidateId: string,
    blockNumber: number,
  ): QuestionQueue | undefined {
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
    const updatedQueue: QuestionQueue = {
      ...queue,
      cursorIndex: queue.cursorIndex + 1,
    };

    const updated: AxiomCandidate = {
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

  markBlockComplete(candidateId: string, blockNumber: number): void {
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
    const updatedQueue: QuestionQueue = {
      ...queue,
      isComplete: true,
      completedAt: nowISO,
    };

    const updated: AxiomCandidate = {
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

  private ensureBlock2State(candidate: AxiomCandidate): BlockStates {
    const existing = candidate.session.blockStates;
    if (existing?.['2A'] && existing?.['2B']) return existing;
    return {
      '2A': { status: 'NOT_STARTED' },
      '2B': { status: 'NOT_STARTED', currentQuestionIndex: 0 },
    };
  }

  /** Initialise blockStates pour le bloc 2 si absent ; met 2A IN_PROGRESS si encore NOT_STARTED. Retourne le candidat mis à jour. */
  async ensureBlock2AndStart2AIfNeeded(candidateId: string): Promise<AxiomCandidate | undefined> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return undefined;
    const blockStates = this.ensureBlock2State(candidate);
    const next2A = blockStates['2A'].status === 'NOT_STARTED'
      ? { ...blockStates['2A'], status: 'IN_PROGRESS' as const }
      : blockStates['2A'];
    const updated: AxiomCandidate = {
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

  getBlock2AAnswers(candidate: AxiomCandidate): Block2AAnswers | undefined {
    return candidate.block2Answers?.block2A;
  }

  getBlock2BAnswers(candidate: AxiomCandidate): Block2BAnswers | undefined {
    return candidate.block2Answers?.block2B;
  }

  async setBlock2AMedium(candidateId: string, value: string): Promise<AxiomCandidate | undefined> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return undefined;
    const block2A = { ...(candidate.block2Answers?.block2A ?? {}), medium: value };
    const updated: AxiomCandidate = {
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

  async setBlock2APreference(candidateId: string, value: string): Promise<AxiomCandidate | undefined> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return undefined;
    const block2A = { ...(candidate.block2Answers?.block2A ?? {}), preference: value };
    const updated: AxiomCandidate = {
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

  async setBlock2ACoreWork(candidateId: string, value: string): Promise<AxiomCandidate | undefined> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return undefined;
    const block2A = { ...(candidate.block2Answers?.block2A ?? {}), coreWork: value };
    const updated: AxiomCandidate = {
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
  async setBlock2ACompletedAndStart2B(candidateId: string): Promise<AxiomCandidate | undefined> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return undefined;
    const blockStates = this.ensureBlock2State(candidate);
    const updated: AxiomCandidate = {
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

  async appendBlock2BAnswer(candidateId: string, answer: string): Promise<AxiomCandidate | undefined> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return undefined;
    const prev = candidate.block2Answers?.block2B?.answers ?? [];
    const updated: AxiomCandidate = {
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

  async setBlock2BCurrentQuestionIndex(candidateId: string, index: number): Promise<AxiomCandidate | undefined> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return undefined;
    const blockStates = this.ensureBlock2State(candidate);
    const updated: AxiomCandidate = {
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

  async setBlock2BCompleted(candidateId: string): Promise<AxiomCandidate | undefined> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return undefined;
    const blockStates = this.ensureBlock2State(candidate);
    const updated: AxiomCandidate = {
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

  storeAnswerForBlock(
    candidateId: string,
    blockNumber: number,
    questionIndex: number,
    answer: string,
  ): AnswerMap {
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
    const updatedAnswerMap: AnswerMap = {
      ...answerMap,
      answers: {
        ...answerMap.answers,
        [questionIndex]: answer,
      },
      lastAnswerAt: new Date().toISOString(),
    };

    const updated: AxiomCandidate = {
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
