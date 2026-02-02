import type { FastifyInstance } from 'fastify';
import { candidateStore } from '../store/sessionStore.js';
import { v4 as uuidv4 } from 'uuid';
import { getPostConfig } from '../store/postRegistry.js';
import { sessions } from '../server.js';

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
      sessions.set(finalSessionId, { identityDone: false });
    } else {
      // Session existante
      finalSessionId = sessionId;
      const sessionData = sessions.get(finalSessionId);
      
      if (!sessionData) {
        // Session inconnue, créer une nouvelle
        candidate = candidateStore.create(finalSessionId, tenant);
        sessions.set(finalSessionId, { identityDone: false });
      } else {
        // Charger le candidat existant
        candidate = candidateStore.get(finalSessionId);
        if (!candidate) {
          candidate = candidateStore.create(finalSessionId, tenant);
        }

        // Si identityDone === true, répondre avec state conversation
        if (sessionData.identityDone) {
          return reply.send({
            sessionId: finalSessionId,
            state: candidate.session.state === 'identity' ? 'preamble' : candidate.session.state,
            currentBlock: candidate.session.currentBlock,
            response: candidate.session.state === 'identity' 
              ? 'Avant de commencer AXIOM, une dernière chose.\n\nPréférez-vous que l\'on se tutoie ou que l\'on se vouvoie ?'
              : 'Bienvenue de retour !',
          });
        }
      }
    }

    return reply.send({
      sessionId: finalSessionId,
      state: 'identity',
      currentBlock: candidate.session.currentBlock,
      response: "Avant de commencer AXIOM, j'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email",
    });
  });
}
