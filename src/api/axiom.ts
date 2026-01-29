import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { candidateStore } from '../store/sessionStore.js';
import { v4 as uuidv4 } from 'uuid';
import {
  advanceBlock,
  startMatching,
  AxiomEngineError,
} from '../engine/axiomEngine.js';
import { AXIOM_BLOCKS } from '../types/blocks.js';
import { testOpenAI } from '../services/openaiClient.js';
import { executeProfilPrompt } from '../services/axiomExecutor.js';
import { candidateToSession, updateCandidateFromSession } from '../utils/candidateAdapter.js';
import { IdentitySchema } from '../validators/identity.js';
import { toLiveTrackingRow } from '../services/exportService.js';

const AxiomBodySchema = z.object({
  tenantId: z.string().min(1),
  sessionId: z.string().min(8).optional(),
  userMessage: z.string().min(1).optional(),
  test: z.boolean().optional(),
  identity: z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
    })
    .optional(),
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

    const { tenantId, sessionId: providedSessionId, identity: providedIdentity } = parsed.data;

    let candidate;
    if (!providedSessionId) {
      // CAS 1 : Nouvelle session
      const candidateId = uuidv4();
      candidate = candidateStore.create(candidateId, tenantId);
      app.log.info({ candidateId, tenantId }, 'Nouveau candidat AXIOM créé');
    } else {
      // Charger le candidat existant
      candidate = candidateStore.get(providedSessionId);
      if (!candidate) {
        app.log.warn(
          { candidateId: providedSessionId, tenantId },
          'Candidat non trouvé, création d\'un nouveau candidat',
        );
        const candidateId = uuidv4();
        candidate = candidateStore.create(candidateId, tenantId);
      } else {
        // Vérifier l'isolation tenant
        if (candidate.tenantId !== tenantId) {
          return reply.code(403).send({
            error: 'TENANT_MISMATCH',
            message: 'Candidate does not belong to this tenant',
          });
        }
        app.log.info(
          { candidateId: providedSessionId, tenantId, state: candidate.session.state, currentBlock: candidate.session.currentBlock },
          'Candidat chargé',
        );
      }
    }

    // CAS 2 : Réception identité valide
    if (providedIdentity && candidate.session.state === 'identity') {
      const identityValidation = IdentitySchema.safeParse(providedIdentity);
      if (!identityValidation.success) {
        return reply.code(400).send({
          error: 'INVALID_IDENTITY',
          message: 'Avant de commencer AXIOM, j\'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email',
          details: identityValidation.error.flatten(),
        });
      }

      candidate = candidateStore.updateIdentity(candidate.candidateId, {
        firstName: identityValidation.data.firstName,
        lastName: identityValidation.data.lastName,
        email: identityValidation.data.email,
        completedAt: new Date(),
      });

      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to update identity',
        });
      }

      app.log.info(
        { candidateId: candidate.candidateId, tenantId },
        'Identité candidat enregistrée, passage à collecting',
      );

      // Mettre à jour le suivi live
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const trackingRow = toLiveTrackingRow(candidate);
        // TODO: Appeler googleSheetsService.updateLiveTracking(tenantId, trackingRow)
      } catch (error) {
        app.log.warn({ error }, 'Failed to update live tracking');
      }

      // Lancer AXIOM_PROFIL normalement
      const session = candidateToSession(candidate);
      const aiResponse = await executeProfilPrompt(session, undefined);
      
      candidateStore.updateSession(candidate.candidateId, {});

      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: candidate.session.state,
        response: aiResponse,
      });
    }

    // CAS 3 : Tentative AXIOM sans identité complète
    if (candidate.session.state === 'identity') {
      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: candidate.session.state,
        response: 'Avant de commencer AXIOM, j\'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email',
      });
    }

    // Convertir en session pour compatibilité avec le moteur existant
    const session = candidateToSession(candidate);

    // Vérifier que l'identité est complète avant toute exécution AXIOM
    if (!candidate.identity.completedAt) {
      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: 'identity',
        response: 'Avant de commencer AXIOM, j\'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email',
      });
    }

    // Exécuter le prompt PROFIL si state === collecting
    if (candidate.session.state === 'collecting') {
      const aiResponse = await executeProfilPrompt(session, parsed.data.userMessage);
      
      // Mettre à jour l'activité
      candidateStore.updateSession(candidate.candidateId, {});

      // Mettre à jour le suivi live
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const trackingRow = toLiveTrackingRow(candidate);
        // TODO: Appeler googleSheetsService.updateLiveTracking(tenantId, trackingRow)
      } catch (error) {
        app.log.warn({ error }, 'Failed to update live tracking');
      }

      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: candidate.session.state,
        response: aiResponse,
      });
    }

    // Appliquer les transitions selon l'état actuel
    try {
      if (candidate.session.state === 'waiting_go') {
        if (candidate.session.currentBlock < AXIOM_BLOCKS.MAX) {
          // Avancer au bloc suivant
          const updatedSession = advanceBlock(session);
          candidate = updateCandidateFromSession(candidate, updatedSession);
          candidateStore.updateSession(candidate.candidateId, {
            currentBlock: updatedSession.currentBlock,
            state: updatedSession.state,
          });
          app.log.info(
            { candidateId: candidate.candidateId, currentBlock: candidate.session.currentBlock },
            'Transition: waiting_go → collecting (bloc suivant)',
          );
        } else {
          // Démarrer le matching (dernier bloc terminé)
          const updatedSession = startMatching(session);
          candidate = updateCandidateFromSession(candidate, updatedSession);
          candidateStore.updateSession(candidate.candidateId, {
            state: updatedSession.state,
          });
          app.log.info(
            { candidateId: candidate.candidateId },
            'Transition: waiting_go → matching',
          );
        }
      } else if (candidate.session.state === 'matching') {
        // État final, aucune transition possible
        app.log.info(
          { candidateId: candidate.candidateId },
          'Candidat en état matching (final)',
        );
      }
    } catch (error) {
      if (error instanceof AxiomEngineError) {
        app.log.warn(
          {
            candidateId: candidate.candidateId,
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
            sessionId: candidate.candidateId,
            currentBlock: candidate.session.currentBlock,
            state: candidate.session.state,
          },
        });
      }
      throw error;
    }

    return reply.send({
      sessionId: candidate.candidateId,
      currentBlock: candidate.session.currentBlock,
      state: candidate.session.state,
    });
  });
}
