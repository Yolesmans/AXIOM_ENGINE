import type { FastifyInstance } from 'fastify';
import { candidateStore } from '../store/sessionStore.js';
import { v4 as uuidv4 } from 'uuid';
import { getPostConfig } from '../store/postRegistry.js';
import { executeAxiom, STEP_01_IDENTITY, STEP_02_TONE, STEP_03_PREAMBULE, STEP_03_BLOC1, BLOC_01, STEP_99_MATCH_READY } from '../engine/axiomExecutor.js';

export async function registerStartRoute(app: FastifyInstance) {
  app.get('/start', async (req, reply) => {
    const { tenant, poste, sessionId: querySessionId } = req.query as {
      tenant?: string;
      poste?: string;
      sessionId?: string;
    };

    if (!tenant || !poste) {
      return reply.code(400).send({
        error: 'MISSING_PARAMS',
        message: 'tenant et poste requis',
      });
    }

    try {
      getPostConfig(tenant, poste);
    } catch (e) {
      return reply.code(400).send({
        error: 'UNKNOWN_TENANT_OR_POSTE',
        message: 'Entreprise ou poste inconnu',
      });
    }

    // Lire sessionId depuis header ou query param
    const sessionId = (req.headers['x-session-id'] as string) || querySessionId;

    let candidate;
    let finalSessionId: string;

    if (!sessionId) {
      // Nouvelle session
      finalSessionId = uuidv4();
      candidate = candidateStore.create(finalSessionId, tenant);
    } else {
      // Session existante
      finalSessionId = sessionId;
      candidate = candidateStore.get(finalSessionId);
      
      if (!candidate) {
        // Session inconnue, créer une nouvelle
        candidate = candidateStore.create(finalSessionId, tenant);
      }
    }

    if (!candidate) {
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to create candidate',
      });
    }

    // Pass-through vers executeAxiom
    const result = await executeAxiom({ candidate, userMessage: null });

    // Déterminer le state selon le step (mapping simple, pas de logique métier)
    let responseState: string = 'collecting';
    if (result.step === 'STEP_00_IDENTITY') {
      responseState = 'identity';
    } else if (result.step === 'STEP_01_TUTOVOU' || result.step === 'STEP_02_PREAMBULE') {
      responseState = 'preamble';
    } else if (result.step === 'STEP_03_BLOC1') {
      responseState = 'collecting';
    }

    return reply.send({
      sessionId: finalSessionId,
      state: responseState,
      currentBlock: candidate.session.currentBlock,
      response: result.response,
      expectsAnswer: result.expectsAnswer,
      autoContinue: result.autoContinue,
    });
  });
}
