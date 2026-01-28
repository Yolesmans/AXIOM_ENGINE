import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { sessionStore } from '../store/sessionStore.js';
import { v4 as uuidv4 } from 'uuid';
import {
  advanceBlock,
  startMatching,
  AxiomEngineError,
} from '../engine/axiomEngine.js';
import { AXIOM_BLOCKS } from '../types/blocks.js';
import { testOpenAI } from '../services/openaiClient.js';
import { executeProfilPrompt } from '../services/axiomExecutor.js';

const AxiomBodySchema = z.object({
  sessionId: z.string().min(8).optional(),
  userMessage: z.string().min(1).optional(),
  test: z.boolean().optional(),
});

export async function registerAxiomRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return { ok: true };
  });

  app.post('/axiom', async (req, reply) => {
    const parsed = AxiomBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        details: parsed.error.flatten(),
      });
    }

    // Test OpenAI temporaire
    if (parsed.data.test === true) {
      const openaiResponse = await testOpenAI();
      return reply.send({
        ok: true,
        openaiResponse,
      });
    }

    const { sessionId: providedSessionId } = parsed.data;

    let session;
    if (!providedSessionId) {
      // Créer une nouvelle session
      const newSessionId = uuidv4();
      session = sessionStore.create(newSessionId);
      app.log.info(
        { sessionId: newSessionId },
        'Nouvelle session AXIOM créée',
      );
    } else {
      // Charger la session existante
      session = sessionStore.get(providedSessionId);
      if (!session) {
        app.log.warn(
          { sessionId: providedSessionId },
          'Session non trouvée, création d\'une nouvelle session',
        );
        session = sessionStore.create(providedSessionId);
      } else {
        app.log.info(
          { sessionId: providedSessionId, state: session.state, currentBlock: session.currentBlock },
          'Session chargée',
        );
      }
    }

    // Exécuter le prompt PROFIL si state === collecting
    if (session.state === 'collecting') {
      const aiResponse = await executeProfilPrompt(session, parsed.data.userMessage);
      return reply.send({
        sessionId: session.sessionId,
        currentBlock: session.currentBlock,
        state: session.state,
        response: aiResponse,
      });
    }

    // Appliquer les transitions selon l'état actuel
    try {
      if (session.state === 'waiting_go') {
        if (session.currentBlock < AXIOM_BLOCKS.MAX) {
          // Avancer au bloc suivant
          session = advanceBlock(session);
          app.log.info(
            { sessionId: session.sessionId, currentBlock: session.currentBlock },
            'Transition: waiting_go → collecting (bloc suivant)',
          );
        } else {
          // Démarrer le matching (dernier bloc terminé)
          session = startMatching(session);
          app.log.info(
            { sessionId: session.sessionId },
            'Transition: waiting_go → matching',
          );
        }
      } else if (session.state === 'matching') {
        // État final, aucune transition possible
        app.log.info(
          { sessionId: session.sessionId },
          'Session en état matching (final)',
        );
      }
    } catch (error) {
      if (error instanceof AxiomEngineError) {
        app.log.warn(
          {
            sessionId: session.sessionId,
            error: error.code,
            message: error.message,
          },
          'Transition refusée par le moteur',
        );
        return reply.code(403).send({
          error: 'TRANSITION_FORBIDDEN',
          code: error.code,
          message: error.message,
          session: {
            sessionId: session.sessionId,
            currentBlock: session.currentBlock,
            state: session.state,
          },
        });
      }
      throw error;
    }

    return reply.send({
      sessionId: session.sessionId,
      currentBlock: session.currentBlock,
      state: session.state,
    });
  });
}
