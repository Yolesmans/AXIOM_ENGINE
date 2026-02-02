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
import { executeProfilPrompt, executeMatchingPrompt } from '../services/axiomExecutor.js';
import { candidateToSession, updateCandidateFromSession } from '../utils/candidateAdapter.js';
import { IdentitySchema } from '../validators/identity.js';
import {
  candidateToLiveTrackingRow,
  googleSheetsLiveTrackingService,
} from '../services/googleSheetsService.js';
import type { AnswerRecord } from '../types/answer.js';
import { getPostConfig } from '../store/postRegistry.js';
import { sessions } from '../server.js';
import { executeAxiom, STEP_00_IDENTITY, STEP_01_TUTOVOU, STEP_02_PREAMBULE, STEP_03_BLOC1, STEP_99_MATCHING } from '../engine/axiomExecutor.js';

const AxiomBodySchema = z.object({
  tenantId: z.string().min(1),
  posteId: z.string().min(1),
  sessionId: z.string().min(8).optional(),
  message: z.string().min(1).optional(),
  userMessage: z.string().min(1).optional(),
  test: z.boolean().optional(),
  finish: z.boolean().optional(),
  identity: z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
    })
    .optional(),
});

// Fonction pour extraire la dernière question d'un texte
function extractLastQuestion(text: string): string | null {
  if (!text || text.trim() === '') {
    return null;
  }
  
  // Prendre les 400 derniers caractères
  const last400 = text.slice(-400);
  
  // Chercher la dernière ligne contenant "?"
  const lines = last400.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('?')) {
      return lines[i].trim();
    }
  }
  
  return null;
}

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

    const { tenantId, posteId, sessionId: providedSessionId, identity: providedIdentity, message: userMessage } = parsed.data;

    // Exiger sessionId (header ou body)
    const sessionId = (req.headers['x-session-id'] as string) || providedSessionId;
    if (!sessionId) {
      return reply.code(400).send({
        error: 'MISSING_SESSION_ID',
        message: 'sessionId requis (header x-session-id ou body)',
      });
    }

    // Charger ou initialiser session
    let sessionData = sessions.get(sessionId);
    if (!sessionData) {
      sessionData = {
        identityDone: false,
        vouvoiement: null,
        lastQuestion: null,
        lastAssistant: null,
      };
      sessions.set(sessionId, sessionData);
    }

    try {
      getPostConfig(tenantId, posteId);
    } catch (error) {
      return reply.code(400).send({
        error: 'INVALID_POSTE',
        message: error instanceof Error ? error.message : 'Invalid posteId',
      });
    }

    // Détecter si le message contient prénom + nom + email
    const messageText = userMessage || '';
    const prenomMatch = messageText.match(/Prénom:\s*(.+)/i);
    const nomMatch = messageText.match(/Nom:\s*(.+)/i);
    const emailMatch = messageText.match(/Email:\s*(.+)/i);

    if (prenomMatch && nomMatch && emailMatch) {
      // Message contient identité complète
      const firstName = prenomMatch[1].trim();
      const lastName = nomMatch[1].trim();
      const email = emailMatch[1].trim();

      // Valider l'identité
      const identityValidation = IdentitySchema.safeParse({ firstName, lastName, email });
      if (!identityValidation.success) {
        return reply.code(400).send({
          error: 'INVALID_IDENTITY',
          message: 'Avant de commencer AXIOM, j\'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email',
        });
      }

      // Charger ou créer le candidat
      let candidate = candidateStore.get(sessionId);
      if (!candidate) {
        candidate = candidateStore.create(sessionId, tenantId);
      }

      // Mettre à jour l'identité
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

      // Mettre à jour le state UI : identityDone = true, step = STEP_01_TUTOVOU
      candidateStore.updateUIState(candidate.candidateId, {
        identityDone: true,
        step: STEP_01_TUTOVOU,
      });
      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to update UI state',
        });
      }

      // Mettre à jour le suivi live
      try {
        const trackingRow = candidateToLiveTrackingRow(candidate);
        await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
      } catch (error) {
        app.log.error({
          tenantId,
          posteId,
          candidateId: candidate.candidateId,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          googleResponse: (error as any)?.response?.data,
        }, 'Failed to update live tracking');
      }

      // Utiliser l'orchestrateur pour obtenir la réponse
      const result = await executeAxiom(candidate, null);
      
      // Persister le state UI
      candidateStore.updateUIState(candidate.candidateId, {
        step: result.step,
        lastQuestion: result.lastQuestion,
        tutoiement: result.tutoiement,
      });
      
      // Mettre à jour le tone preference si défini
      if (result.tutoiement) {
        candidateStore.setTonePreference(candidate.candidateId, result.tutoiement);
      }

      // Déterminer le state pour la réponse
      let responseState: string = 'preamble';
      if (result.step === STEP_03_BLOC1) {
        responseState = 'collecting';
        candidateStore.updateSession(candidate.candidateId, { state: 'collecting', currentBlock: 1 });
      } else if (result.step === STEP_01_TUTOVOU) {
        responseState = 'preamble';
        candidateStore.updateSession(candidate.candidateId, { state: 'preamble' });
      }

      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to update session',
        });
      }

      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: responseState,
        response: result.response,
      });
    }

    // Charger le candidat existant
    let candidate = candidateStore.get(sessionId);
    if (!candidate) {
      app.log.warn(
        { candidateId: sessionId, tenantId },
        'Candidat non trouvé, création d\'un nouveau candidat',
      );
      candidate = candidateStore.create(sessionId, tenantId);
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
          identityDone: false,
          vouvoiement: null,
          lastQuestion: null,
          lastAssistant: null,
        });
        sessionData = sessions.get(sessionId)!;
      }
    } else {
      // Vérifier l'isolation tenant
      if (candidate.tenantId !== tenantId) {
        return reply.code(403).send({
          error: 'TENANT_MISMATCH',
          message: 'Candidate does not belong to this tenant',
        });
      }
      app.log.info(
        { candidateId: sessionId, tenantId, state: candidate.session.state, currentBlock: candidate.session.currentBlock },
        'Candidat chargé',
      );
    }

    // CAS 2 : Réception identité valide via providedIdentity
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

      // Mettre à jour le state UI : identityDone = true, step = STEP_01_TUTOVOU
      candidateStore.updateUIState(candidate.candidateId, {
        identityDone: true,
        step: STEP_01_TUTOVOU,
      });
      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to update UI state',
        });
      }

      // Mettre à jour le suivi live
      try {
        const trackingRow = candidateToLiveTrackingRow(candidate);
        await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
      } catch (error) {
        app.log.error({
          tenantId,
          posteId,
          candidateId: candidate.candidateId,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          googleResponse: (error as any)?.response?.data,
        }, 'Failed to update live tracking');
      }

      // Utiliser l'orchestrateur pour obtenir la réponse
      const result = await executeAxiom(candidate, null);
      
      // Persister le state UI
      candidateStore.updateUIState(candidate.candidateId, {
        step: result.step,
        lastQuestion: result.lastQuestion,
        tutoiement: result.tutoiement,
      });

      candidateStore.updateSession(candidate.candidateId, { state: 'preamble' });
      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to update session',
        });
      }

      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: 'preamble',
        response: result.response,
      });
    }

    // CAS 3 : Tentative AXIOM sans identité complète
    if (candidate.session.state === 'identity' || !candidate.identity.completedAt) {
      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: 'identity',
        response: 'Avant de commencer AXIOM, j\'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email',
      });
    }

    // Utiliser l'orchestrateur pour tous les autres cas (preamble, collecting, etc.)
    // S'assurer que le state UI existe
    if (!candidate.session.ui) {
      candidateStore.updateUIState(candidate.candidateId, {
        step: candidate.session.state === 'preamble' ? STEP_01_TUTOVOU : STEP_03_BLOC1,
        lastQuestion: null,
        identityDone: true,
      });
      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to initialize UI state',
        });
      }
    }

    // Gestion des messages en état preamble ou collecting - utiliser l'orchestrateur
    if (candidate.session.state === 'preamble' || candidate.session.state === 'collecting') {
      const userMessageText = userMessage || '';
      
      // Si on est en collecting, stocker la réponse comme AnswerRecord
      if (candidate.session.state === 'collecting' && userMessageText) {
        const answerRecord: AnswerRecord = {
          block: candidate.session.currentBlock,
          message: userMessageText,
          createdAt: new Date().toISOString(),
        };
        candidate = candidateStore.addAnswer(candidate.candidateId, answerRecord);
        if (!candidate) {
          return reply.code(500).send({
            error: 'INTERNAL_ERROR',
            message: 'Failed to store answer',
          });
        }
      }

      // Utiliser l'orchestrateur
      const result = await executeAxiom(candidate, userMessageText);
      
      // Persister le state UI
      candidateStore.updateUIState(candidate.candidateId, {
        step: result.step,
        lastQuestion: result.lastQuestion,
        tutoiement: result.tutoiement,
      });
      
      // Mettre à jour le tone preference si défini
      if (result.tutoiement) {
        candidateStore.setTonePreference(candidate.candidateId, result.tutoiement);
      }

      // Déterminer le state et currentBlock pour la réponse selon le step
      let responseState: string = candidate.session.state;
      let currentBlock = candidate.session.currentBlock;
      
      if (result.step === STEP_03_BLOC1) {
        // On passe en collecting avec le Bloc 1
        responseState = 'collecting';
        currentBlock = 1;
        candidateStore.updateSession(candidate.candidateId, { state: 'collecting', currentBlock: 1 });
      } else if (result.step === STEP_02_PREAMBULE) {
        // Préambule affiché, on reste en preamble mais le step va passer à BLOC_1_Q1 au prochain appel
        responseState = 'preamble';
      } else if (result.step === STEP_01_TUTOVOU) {
        // Question tutoiement/vouvoiement
        responseState = 'preamble';
      }

      // Stocker finalProfileText si on est en collecting
      if (responseState === 'collecting' && result.response) {
        candidateStore.setFinalProfileText(candidate.candidateId, result.response);
      }

      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to update candidate',
        });
      }

      // Mettre à jour le suivi live
      try {
        const trackingRow = candidateToLiveTrackingRow(candidate);
        await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
      } catch (error) {
        app.log.error({
          tenantId,
          posteId,
          candidateId: candidate.candidateId,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          googleResponse: (error as any)?.response?.data,
        }, 'Failed to update live tracking');
      }

      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: currentBlock,
        state: responseState,
        response: result.response,
        expectsAnswer: result.expectsAnswer,
        autoContinue: result.autoContinue,
      });
    }

    // Implémenter finish (basculement vers waiting_go)
    if (parsed.data.finish === true) {
      const isCollecting = (candidate.session.ui?.step === STEP_03_BLOC1) || (candidate.session.state as string) === 'collecting';
      if (isCollecting && candidate.session.currentBlock === AXIOM_BLOCKS.MAX) {
        candidateStore.updateSession(candidate.candidateId, { state: 'waiting_go' });
        candidate = candidateStore.get(candidate.candidateId);
        if (!candidate) {
          return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Failed to update session' });
        }

        try {
          const trackingRow = candidateToLiveTrackingRow(candidate);
          await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
        } catch (error) {
          app.log.error({
            tenantId,
            posteId,
            candidateId: candidate.candidateId,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            googleResponse: (error as any)?.response?.data,
          }, 'Failed to update live tracking');
        }

        const waitingGoResponse = 'AXIOM est prêt pour le matching final.\n\nQuand vous êtes prêt, écrivez exactement : GO';
        sessionData.lastAssistant = waitingGoResponse;
        sessionData.lastQuestion = waitingGoResponse;
        sessions.set(sessionId, sessionData);

        return reply.send({
          sessionId: candidate.candidateId,
          currentBlock: candidate.session.currentBlock,
          state: 'waiting_go',
          response: waitingGoResponse,
        });
      } else {
        return reply.code(403).send({
          error: 'FINISH_FORBIDDEN',
          message: 'finish not allowed in current state/block',
        });
      }
    }

    // GO LOCK + matching dans waiting_go
    if (candidate.session.state === 'waiting_go') {
      const message = (parsed.data.message || parsed.data.userMessage || '').trim();
      
      if (message !== 'GO') {
        const waitingGoResponse = sessionData.lastQuestion || 'AXIOM est prêt pour le matching final.\n\nQuand vous êtes prêt, écrivez exactement : GO';
        return reply.send({
          sessionId: candidate.candidateId,
          currentBlock: candidate.session.currentBlock,
          state: 'waiting_go',
          response: waitingGoResponse,
        });
      }

      const finalProfileText = candidate.finalProfileText ?? '';
      if (finalProfileText.trim() === '') {
        return reply.code(409).send({
          error: 'PROFILE_MISSING',
          message: 'Profil non disponible pour le matching (finalProfileText manquant).',
        });
      }

      // Directive système obligatoire
      const systemDirective = 'RÈGLE ABSOLUE: Tu exécutes STRICTEMENT le protocole AXIOM fourni. Tu ne produis JAMAIS de texte hors protocole. À chaque message, tu dois produire UNIQUEMENT la prochaine sortie autorisée par le protocole (question suivante, transition de bloc, miroir interprétatif autorisé, ou texte obligatoire). INTERDICTION d\'improviser, de résumer, de commenter le système, de sauter un bloc. Si l\'état est ambigu, tu rejoues la dernière question valide exactement.';

      let fullText: string;
      try {
        fullText = await executeMatchingPrompt({
          tenantId,
          posteId,
          sessionId: candidate.candidateId,
          answers: candidate.answers,
          finalProfileText,
          systemDirective,
        });
        // Si réponse vide, utiliser lastQuestion
        if (!fullText || fullText.trim() === '') {
          fullText = sessionData.lastQuestion || 'Très bien. Continuons.';
        }
      } catch (error) {
        app.log.error({
          candidateId: candidate.candidateId,
          errorMessage: error instanceof Error ? error.message : String(error),
        }, 'Error executing matching prompt');
        // Si erreur, utiliser lastQuestion
        fullText = sessionData.lastQuestion || 'Très bien. Continuons.';
      }
      
      // Mettre à jour lastAssistant
      sessionData.lastAssistant = fullText;
      sessions.set(sessionId, sessionData);

      const lignes = fullText.split('\n').map(l => l.trim()).filter(Boolean);
      const verdict = (lignes[0] ?? '').slice(0, 80);
      const summary = lignes.slice(0, 3).join(' ').slice(0, 240);
      const createdAt = new Date().toISOString();
      const result = { verdict, summary, fullText, createdAt };

      candidateStore.setMatchingResult(candidate.candidateId, result);
      candidateStore.updateSession(candidate.candidateId, { state: 'completed' });
      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Failed to update session' });
      }

      try {
        const trackingRow = candidateToLiveTrackingRow(candidate);
        await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
      } catch (error) {
        app.log.error({
          tenantId,
          posteId,
          candidateId: candidate.candidateId,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          googleResponse: (error as any)?.response?.data,
        }, 'Failed to update live tracking');
      }

      // VALIDATION FINALE : garantir que response n'est jamais vide
      const finalResponse = fullText && fullText.trim() !== '' ? fullText : (sessionData.lastQuestion || 'Très bien. Continuons.');
      
      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: 'completed',
        response: finalResponse,
      });
    }


    // FALLBACK : réponse obligatoire pour tout autre cas
    // Utiliser lastQuestion si disponible, sinon fallback générique
    const fallbackResponse = sessionData.lastQuestion || 'Très bien. Continuons.';
    return reply.send({
      sessionId: candidate.candidateId,
      currentBlock: candidate.session.currentBlock,
      state: candidate.session.state,
      response: fallbackResponse,
    });
  });
}