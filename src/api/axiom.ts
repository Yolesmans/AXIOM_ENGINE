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

      // Marquer identityDone = true
      sessionData.identityDone = true;
      sessions.set(sessionId, sessionData);

      // Passer à preamble
      candidateStore.updateSession(candidate.candidateId, { state: 'preamble' });
      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to update session',
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

      // EXÉCUTER IMMÉDIATEMENT LE PROMPT AXIOM (sauter preamble)
      candidateStore.setTonePreference(candidate.candidateId, 'tutoiement');
      sessionData.vouvoiement = 'tutoiement';
      candidateStore.updateSession(candidate.candidateId, { state: 'collecting', currentBlock: 1 });
      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to update session',
        });
      }

      // Directive système obligatoire
      const systemDirective = 'RÈGLE ABSOLUE: Tu exécutes STRICTEMENT le protocole AXIOM fourni. Tu ne produis JAMAIS de texte hors protocole. À chaque message, tu dois produire UNIQUEMENT la prochaine sortie autorisée par le protocole (question suivante, transition de bloc, miroir interprétatif autorisé, ou texte obligatoire). INTERDICTION d\'improviser, de résumer, de commenter le système, de sauter un bloc. Si l\'état est ambigu, tu rejoues la dernière question valide exactement.';

      // Lancer AXIOM_PROFIL normalement (prompt complet relu à chaque appel)
      const sessionForProfil = candidateToSession(candidate);
      let aiResponse: string;
      try {
        aiResponse = await executeProfilPrompt(sessionForProfil, candidate.answers, systemDirective);
        // Si réponse vide, utiliser lastQuestion
        if (!aiResponse || aiResponse.trim() === '') {
          aiResponse = sessionData.lastQuestion || 'Très bien. Continuons.';
        }
      } catch (error) {
        app.log.error({
          candidateId: candidate.candidateId,
          errorMessage: error instanceof Error ? error.message : String(error),
        }, 'Error executing profil prompt');
        // Si erreur, utiliser lastQuestion
        aiResponse = sessionData.lastQuestion || 'Très bien. Continuons.';
      }
      
      // Extraire et sauvegarder lastQuestion
      const extractedQuestion = extractLastQuestion(aiResponse);
      if (extractedQuestion) {
        sessionData.lastQuestion = extractedQuestion;
      }
      sessionData.lastAssistant = aiResponse;
      sessions.set(sessionId, sessionData);
      
      candidateStore.setFinalProfileText(candidate.candidateId, aiResponse);
      candidateStore.updateSession(candidate.candidateId, {});

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
      const finalResponse = aiResponse && aiResponse.trim() !== '' ? aiResponse : 'Très bien. Continuons.';
      
      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: 1,
        state: 'collecting',
        response: finalResponse,
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
        'Identité candidat enregistrée, passage à preamble',
      );

      // Marquer identityDone = true
      sessionData.identityDone = true;
      sessions.set(sessionId, sessionData);

      candidateStore.updateSession(candidate.candidateId, { state: 'preamble' });
      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to update session',
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

      const preambleResponse = 'Avant de commencer AXIOM, une dernière chose.\n\nPréférez-vous que l\'on se tutoie ou que l\'on se vouvoie ?';
      sessionData.lastAssistant = preambleResponse;
      sessionData.lastQuestion = preambleResponse;
      sessions.set(sessionId, sessionData);

      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: 'preamble',
        response: preambleResponse,
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

    // Gestion des messages en état preamble
    if (candidate.session.state === 'preamble') {
      const message = (parsed.data.message || parsed.data.userMessage || '').toLowerCase();
      
      let mode: 'tutoiement' | 'vouvoiement' | null = null;
      
      if (message.includes('tuto')) {
        mode = 'tutoiement';
      } else if (message.includes('vouvoi')) {
        mode = 'vouvoiement';
      }
      
      if (!mode) {
        const fallbackResponse = sessionData.lastQuestion || 'Merci de répondre par « tutoiement » ou « vouvoiement ».';
        return reply.send({
          sessionId: candidate.candidateId,
          currentBlock: candidate.session.currentBlock,
          state: 'preamble',
          response: fallbackResponse,
        });
      }
      
      // Mettre à jour vouvoiement dans sessions
      sessionData.vouvoiement = mode;
      sessions.set(sessionId, sessionData);
      
      candidateStore.setTonePreference(candidate.candidateId, mode);
      candidateStore.updateSession(candidate.candidateId, { state: 'collecting', currentBlock: 1 });
      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to update session',
        });
      }

      // Directive système obligatoire
      const systemDirective = 'RÈGLE ABSOLUE: Tu exécutes STRICTEMENT le protocole AXIOM fourni. Tu ne produis JAMAIS de texte hors protocole. À chaque message, tu dois produire UNIQUEMENT la prochaine sortie autorisée par le protocole (question suivante, transition de bloc, miroir interprétatif autorisé, ou texte obligatoire). INTERDICTION d\'improviser, de résumer, de commenter le système, de sauter un bloc. Si l\'état est ambigu, tu rejoues la dernière question valide exactement.';

      // Lancer AXIOM_PROFIL normalement (prompt complet relu à chaque appel)
      const sessionForProfil = candidateToSession(candidate);
      let aiResponse: string;
      try {
        aiResponse = await executeProfilPrompt(sessionForProfil, candidate.answers, systemDirective);
        // Si réponse vide, utiliser lastQuestion
        if (!aiResponse || aiResponse.trim() === '') {
          aiResponse = sessionData.lastQuestion || 'Dis-moi simplement : tu préfères qu\'on se tutoie ou qu\'on se vouvoie ?';
        }
      } catch (error) {
        app.log.error({
          candidateId: candidate.candidateId,
          errorMessage: error instanceof Error ? error.message : String(error),
        }, 'Error executing profil prompt');
        // Si erreur, utiliser lastQuestion
        aiResponse = sessionData.lastQuestion || 'Dis-moi simplement : tu préfères qu\'on se tutoie ou qu\'on se vouvoie ?';
      }
      
      // Extraire et sauvegarder lastQuestion
      const extractedQuestion = extractLastQuestion(aiResponse);
      if (extractedQuestion) {
        sessionData.lastQuestion = extractedQuestion;
      }
      sessionData.lastAssistant = aiResponse;
      sessions.set(sessionId, sessionData);
      
      candidateStore.setFinalProfileText(candidate.candidateId, aiResponse);
      candidateStore.updateSession(candidate.candidateId, {});

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
      const finalResponse = aiResponse && aiResponse.trim() !== '' ? aiResponse : 'Très bien. Continuons.';
      
      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: 1,
        state: 'collecting',
        response: finalResponse,
      });
    }

    // Implémenter finish (basculement vers waiting_go)
    if (parsed.data.finish === true) {
      if (candidate.session.state === 'collecting' && candidate.session.currentBlock === AXIOM_BLOCKS.MAX) {
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

    // Exécuter le prompt PROFIL si state === collecting
    if (candidate.session.state === 'collecting') {
      const message = parsed.data.message || parsed.data.userMessage;
      
      if (message) {
        // Créer un AnswerRecord
        const answerRecord: AnswerRecord = {
          block: candidate.session.currentBlock,
          message,
          createdAt: new Date().toISOString(),
        };

        // Stocker la réponse
        const updatedCandidate = candidateStore.addAnswer(candidate.candidateId, answerRecord);
        if (!updatedCandidate) {
          return reply.code(500).send({
            error: 'INTERNAL_ERROR',
            message: 'Failed to store answer',
          });
        }
        candidate = updatedCandidate;
        // Mettre à jour la session pour refléter le candidat mis à jour
        const updatedSession = candidateToSession(candidate);
        session.currentBlock = updatedSession.currentBlock;
        session.state = updatedSession.state;
      }

      // Directive système obligatoire
      const systemDirective = 'RÈGLE ABSOLUE: Tu exécutes STRICTEMENT le protocole AXIOM fourni. Tu ne produis JAMAIS de texte hors protocole. À chaque message, tu dois produire UNIQUEMENT la prochaine sortie autorisée par le protocole (question suivante, transition de bloc, miroir interprétatif autorisé, ou texte obligatoire). INTERDICTION d\'improviser, de résumer, de commenter le système, de sauter un bloc. Si l\'état est ambigu, tu rejoues la dernière question valide exactement.';

      // Relancer l'exécution du prompt PROFIL avec toutes les réponses
      // Le prompt complet est relu à chaque appel (ChatGPT-like)
      let aiResponse: string;
      try {
        aiResponse = await executeProfilPrompt(session, candidate.answers, systemDirective);
        // Si réponse vide, utiliser lastQuestion
        if (!aiResponse || aiResponse.trim() === '') {
          aiResponse = sessionData.lastQuestion || 'Très bien. Continuons.';
        }
      } catch (error) {
        app.log.error({
          candidateId: candidate.candidateId,
          errorMessage: error instanceof Error ? error.message : String(error),
        }, 'Error executing profil prompt');
        // Si erreur, utiliser lastQuestion
        aiResponse = sessionData.lastQuestion || 'Très bien. Continuons.';
      }
      
      // Extraire et sauvegarder lastQuestion
      const extractedQuestion = extractLastQuestion(aiResponse);
      if (extractedQuestion) {
        sessionData.lastQuestion = extractedQuestion;
      }
      sessionData.lastAssistant = aiResponse;
      sessions.set(sessionId, sessionData);
      
      // Capturer le texte final du profil
      candidateStore.setFinalProfileText(candidate.candidateId, aiResponse);
      
      // Mettre à jour l'activité (session déjà mise à jour par addAnswer)
      candidateStore.updateSession(candidate.candidateId, {});

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

      // UN MESSAGE UTILISATEUR = UNE RÉPONSE AXIOM (toujours)
      // VALIDATION FINALE : garantir que response n'est jamais vide
      const finalResponse = aiResponse && aiResponse.trim() !== '' ? aiResponse : 'Très bien. Continuons.';
      
      return reply.send({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: candidate.session.state,
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