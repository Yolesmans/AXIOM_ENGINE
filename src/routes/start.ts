import type { FastifyInstance } from 'fastify';
import { candidateStore } from '../store/sessionStore.js';
import { v4 as uuidv4 } from 'uuid';
import { getPostConfig } from '../store/postRegistry.js';
import { sessions } from '../server.js';
import { executeAxiom, STEP_00_IDENTITY, STEP_01_TUTOVOU, STEP_02_PREAMBULE, STEP_03_BLOC1 } from '../engine/axiomExecutor.js';

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
      // Initialiser le state UI
      candidateStore.updateUIState(finalSessionId, {
        step: STEP_00_IDENTITY,
        lastQuestion: null,
        identityDone: false,
      });
      candidate = candidateStore.get(finalSessionId);
      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to create candidate',
        });
      }
      // 🔒 GARANTIE ÉTAT UI — OBLIGATOIRE (TS + RUNTIME)
      if (!candidate.session.ui) {
        candidate.session.ui = {
          step: STEP_00_IDENTITY,
          lastQuestion: null,
          identityDone: false,
        };
      }
    } else {
      // Session existante
      finalSessionId = sessionId;
      candidate = candidateStore.get(finalSessionId);
      
      if (!candidate) {
        // Session inconnue, créer une nouvelle
        candidate = candidateStore.create(finalSessionId, tenant);
        candidateStore.updateUIState(finalSessionId, {
          step: STEP_00_IDENTITY,
          lastQuestion: null,
          identityDone: false,
        });
        candidate = candidateStore.get(finalSessionId);
        if (!candidate) {
          return reply.code(500).send({
            error: 'INTERNAL_ERROR',
            message: 'Failed to create candidate',
          });
        }
        // 🔒 GARANTIE ÉTAT UI — OBLIGATOIRE (TS + RUNTIME)
        if (!candidate.session.ui) {
          candidate.session.ui = {
            step: STEP_00_IDENTITY,
            lastQuestion: null,
            identityDone: false,
          };
        }
      }

      // S'assurer que le state UI existe
      if (!candidate.session.ui) {
        candidate.session.ui = {
          step: candidate.identity.completedAt ? STEP_01_TUTOVOU : STEP_00_IDENTITY,
          lastQuestion: null,
          identityDone: !!candidate.identity.completedAt,
        };
      }

      // Si identityDone === true, utiliser l'orchestrateur pour obtenir la réponse
      if (candidate.session.ui.identityDone) {
        const result = await executeAxiom(candidate, null);
        
        // Déterminer le state selon le step
        let responseState: string = 'chat';
        if (result.step === STEP_00_IDENTITY) {
          responseState = 'identity';
        } else if (result.step === STEP_01_TUTOVOU || result.step === STEP_02_PREAMBULE) {
          responseState = 'preamble';
        } else if (result.step === STEP_03_BLOC1) {
          responseState = 'collecting';
        }

        return reply.send({
          sessionId: finalSessionId,
          state: responseState,
          currentBlock: candidate.session.currentBlock,
          response: result.response,
        });
      }
    }

    // STEP_00_IDENTITY : demander l'identité
    return reply.send({
      sessionId: finalSessionId,
      state: 'identity',
      currentBlock: candidate.session.currentBlock,
      response: "Avant de commencer AXIOM, j'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email",
    });
  });
}
