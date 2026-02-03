import express, { type Request, type Response } from "express";
import cors from "cors";
import { candidateStore } from "./store/sessionStore.js";
import { v4 as uuidv4 } from "uuid";
import { getPostConfig } from "./store/postRegistry.js";
import {
  executeAxiom,
  STEP_01_IDENTITY,
  STEP_02_TONE,
  STEP_03_PREAMBULE,
  STEP_03_BLOC1,
  BLOC_01,
  BLOC_02,
  BLOC_03,
  BLOC_04,
  BLOC_05,
  BLOC_06,
  BLOC_07,
  BLOC_08,
  BLOC_09,
  BLOC_10,
  STEP_99_MATCH_READY,
  STEP_99_MATCHING,
  DONE_MATCHING,
} from "./engine/axiomExecutor.js";
import { z } from "zod";
import { IdentitySchema } from "./validators/identity.js";
import { candidateToLiveTrackingRow, googleSheetsLiveTrackingService } from "./services/googleSheetsService.js";
import type { AnswerRecord } from "./types/answer.js";

console.log("BOOT SERVER START");

const app = express();

// BODY PARSER
app.use(express.json());

// CORS — AUTORISER VERCEL
app.use(
  cors({
    origin: [
      "https://axiom-engine-shsk.vercel.app"
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-session-id"],
  })
);

// PREFLIGHT
app.options("*", cors());

const AxiomBodySchema = z.object({
  tenantId: z.string().min(1),
  posteId: z.string().min(1),
  sessionId: z.string().min(8).optional(),
  message: z.string().min(1).optional(),
  userMessage: z.string().min(1).optional(),
  event: z.string().optional(),
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

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/", (_req, res) => {
  res.status(200).json({ status: "alive" });
});

app.get("/favicon.ico", (_req, res) => {
  res.status(204).send();
});

// GET /start
app.get("/start", async (req: Request, res: Response) => {
  try {
    const { tenant, poste, sessionId: querySessionId } = req.query as {
      tenant?: string;
      poste?: string;
      sessionId?: string;
    };

    if (!tenant || !poste) {
      return res.status(400).json({
        error: "MISSING_PARAMS",
        message: "tenant et poste requis",
      });
    }

    try {
      getPostConfig(tenant as string, poste as string);
    } catch (e) {
      return res.status(400).json({
        error: "UNKNOWN_TENANT_OR_POSTE",
        message: "Entreprise ou poste inconnu",
      });
    }

    const sessionId = (req.headers["x-session-id"] as string) || querySessionId;

    let candidate;
    let finalSessionId: string;

    if (!sessionId) {
      finalSessionId = uuidv4();
      candidate = candidateStore.create(finalSessionId, tenant as string);
    } else {
      finalSessionId = sessionId;
      candidate = candidateStore.get(finalSessionId);
      if (!candidate) {
        candidate = candidateStore.create(finalSessionId, tenant as string);
      }
    }

    if (!candidate) {
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Failed to create candidate",
      });
    }

    const result = await executeAxiom({ candidate, userMessage: null });

    // Mapper les états vers les states de réponse
    let responseState: string = "collecting";
    if (result.step === STEP_01_IDENTITY) {
      responseState = "identity";
    } else if (result.step === STEP_02_TONE || result.step === STEP_03_PREAMBULE) {
      responseState = "preamble";
    } else if (result.step === STEP_03_BLOC1) {
      responseState = "preamble_done";
    } else if ([BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(result.step as any)) {
      responseState = "collecting";
    } else if (result.step === STEP_99_MATCH_READY) {
      responseState = "match_ready";
    } else if (result.step === STEP_99_MATCHING || result.step === DONE_MATCHING) {
      responseState = "completed";
    }

    return res.status(200).json({
      sessionId: finalSessionId,
      state: responseState,
      currentBlock: candidate.session.currentBlock,
      response: result.response || '',
      step: result.step,
      expectsAnswer: result.expectsAnswer,
      autoContinue: result.autoContinue,
    });
  } catch (error) {
    console.error("[start] error:", error);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /axiom
app.post("/axiom", async (req: Request, res: Response) => {
  try {
    const parsed = AxiomBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        details: parsed.error.flatten(),
      });
    }

    const {
      tenantId,
      posteId,
      sessionId: providedSessionId,
      identity: providedIdentity,
      message: userMessage,
      event,
    } = parsed.data;

    const sessionId = (req.headers["x-session-id"] as string) || providedSessionId;
    if (!sessionId) {
      return res.status(400).json({
        error: "MISSING_SESSION_ID",
        message: "sessionId requis (header x-session-id ou body)",
      });
    }

    try {
      getPostConfig(tenantId, posteId);
    } catch (error) {
      return res.status(400).json({
        error: "INVALID_POSTE",
        message: error instanceof Error ? error.message : "Invalid posteId",
      });
    }

    const messageText = userMessage || "";
    const prenomMatch = messageText.match(/Prénom:\s*(.+)/i);
    const nomMatch = messageText.match(/Nom:\s*(.+)/i);
    const emailMatch = messageText.match(/Email:\s*(.+)/i);

    if (prenomMatch && nomMatch && emailMatch) {
      const firstName = prenomMatch[1].trim();
      const lastName = nomMatch[1].trim();
      const email = emailMatch[1].trim();

      const identityValidation = IdentitySchema.safeParse({ firstName, lastName, email });
      if (!identityValidation.success) {
        return res.status(400).json({
          error: "INVALID_IDENTITY",
          message: "Avant de commencer AXIOM, j'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email",
        });
      }

      let candidate = candidateStore.get(sessionId);
      if (!candidate) {
        candidate = candidateStore.create(sessionId, tenantId);
      }

      candidate = candidateStore.updateIdentity(candidate.candidateId, {
        firstName: identityValidation.data.firstName,
        lastName: identityValidation.data.lastName,
        email: identityValidation.data.email,
        completedAt: new Date(),
      });

      if (!candidate) {
        return res.status(500).json({
          error: "INTERNAL_ERROR",
          message: "Failed to update identity",
        });
      }

      candidateStore.updateUIState(candidate.candidateId, {
        identityDone: true,
        step: STEP_02_TONE,
      });
      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return res.status(500).json({
          error: "INTERNAL_ERROR",
          message: "Failed to update UI state",
        });
      }

      try {
        const trackingRow = candidateToLiveTrackingRow(candidate);
        await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
      } catch (error) {
        console.error("[axiom] live tracking error:", error);
      }

      const result = await executeAxiom({ candidate, userMessage: null });

      // Mapper les états
      let responseState: string = "preamble";
      if (result.step === STEP_03_BLOC1) {
        responseState = "preamble_done";
      } else if (result.step === BLOC_01) {
        responseState = "collecting";
        candidateStore.updateSession(candidate.candidateId, { state: "collecting", currentBlock: 1 });
      }

      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return res.status(500).json({
          error: "INTERNAL_ERROR",
          message: "Failed to update session",
        });
      }

      return res.status(200).json({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: responseState,
        response: result.response,
        step: result.step,
        expectsAnswer: result.expectsAnswer,
        autoContinue: result.autoContinue,
        showStartButton: result.showStartButton,
      });
    }

    if (providedIdentity) {
      let candidate = candidateStore.get(sessionId);
      if (!candidate) {
        candidate = candidateStore.create(sessionId, tenantId);
      }

      if (candidate && (candidate.session.state === "identity" || !candidate.identity.completedAt)) {
        const identityValidation = IdentitySchema.safeParse(providedIdentity);
        if (!identityValidation.success) {
          return res.status(400).json({
            error: "INVALID_IDENTITY",
            message: "Avant de commencer AXIOM, j'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email",
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
          return res.status(500).json({
            error: "INTERNAL_ERROR",
            message: "Failed to update identity",
          });
        }

        candidateStore.updateUIState(candidate.candidateId, {
          identityDone: true,
          step: STEP_02_TONE,
        });
        candidate = candidateStore.get(candidate.candidateId);
        if (!candidate) {
          return res.status(500).json({
            error: "INTERNAL_ERROR",
            message: "Failed to update UI state",
          });
        }

        try {
          const trackingRow = candidateToLiveTrackingRow(candidate);
          await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
        } catch (error) {
          console.error("[axiom] live tracking error:", error);
        }

        const result = await executeAxiom({ candidate, userMessage: null });

        let responseState: string = "preamble";
        if (result.step === STEP_03_BLOC1) {
          responseState = "preamble_done";
        }

        candidateStore.updateSession(candidate.candidateId, { state: "preamble" });
        candidate = candidateStore.get(candidate.candidateId);
        if (!candidate) {
          return res.status(500).json({
            error: "INTERNAL_ERROR",
            message: "Failed to update session",
          });
        }

        return res.status(200).json({
          sessionId: candidate.candidateId,
          currentBlock: candidate.session.currentBlock,
          state: responseState,
          response: result.response,
          step: result.step,
          expectsAnswer: result.expectsAnswer,
          autoContinue: result.autoContinue,
          showStartButton: result.showStartButton,
        });
      }
    }

    let candidate = candidateStore.get(sessionId);
    if (!candidate) {
      candidate = candidateStore.create(sessionId, tenantId);
    } else {
      if (candidate.tenantId !== tenantId) {
        return res.status(403).json({
          error: "TENANT_MISMATCH",
          message: "Candidate does not belong to this tenant",
        });
      }
    }

    if (candidate.session.state === "identity" || !candidate.identity.completedAt) {
      return res.status(200).json({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: "identity",
        response: "Avant de commencer AXIOM, j'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email",
      });
    }

    // Initialiser l'état UI si nécessaire
    if (!candidate.session.ui) {
      const initialState = candidate.identity.completedAt ? STEP_02_TONE : STEP_01_IDENTITY;
      candidateStore.updateUIState(candidate.candidateId, {
        step: initialState,
        lastQuestion: null,
        identityDone: !!candidate.identity.completedAt,
      });
      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return res.status(500).json({
          error: "INTERNAL_ERROR",
          message: "Failed to initialize UI state",
        });
      }
    }

    // Gérer les events techniques (boutons)
    if (event === "START_BLOC_1" || (!userMessage && !event && candidate.session.ui?.step === STEP_03_BLOC1)) {
      const result = await executeAxiom({ candidate, userMessage: null, event: "START_BLOC_1" });

      candidate = candidateStore.get(candidate.candidateId);
      if (!candidate) {
        return res.status(500).json({
          error: "INTERNAL_ERROR",
          message: "Failed to get candidate",
        });
      }

      try {
        const trackingRow = candidateToLiveTrackingRow(candidate);
        await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
      } catch (error) {
        console.error("[axiom] live tracking error:", error);
      }

      // Mapper les états
      let responseState: string = "collecting";
      if ([BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(result.step as any)) {
        responseState = "collecting";
      }

      return res.status(200).json({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: responseState,
        response: result.response || '',
        step: result.step,
        expectsAnswer: result.expectsAnswer,
        autoContinue: result.autoContinue,
      });
    }

    // Gérer les messages utilisateur
    const userMessageText = userMessage || null;
    const result = await executeAxiom({ candidate, userMessage: userMessageText });

    // Mapper les états
    let responseState: string = "collecting";
    if (result.step === STEP_01_IDENTITY) {
      responseState = "identity";
    } else if (result.step === STEP_02_TONE || result.step === STEP_03_PREAMBULE) {
      responseState = "preamble";
    } else if (result.step === STEP_03_BLOC1) {
      responseState = "preamble_done";
    } else if ([BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(result.step as any)) {
      responseState = "collecting";
      const blocNumber = [BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].indexOf(result.step as any) + 1;
      candidateStore.updateSession(candidate.candidateId, { state: "collecting", currentBlock: blocNumber });
    } else if (result.step === STEP_99_MATCH_READY) {
      responseState = "match_ready";
    } else if (result.step === STEP_99_MATCHING || result.step === DONE_MATCHING) {
      responseState = "completed";
    }

    candidate = candidateStore.get(candidate.candidateId);
    if (!candidate) {
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Failed to get candidate",
      });
    }

    try {
      const trackingRow = candidateToLiveTrackingRow(candidate);
      await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
    } catch (error) {
      console.error("[axiom] live tracking error:", error);
    }

    return res.status(200).json({
      sessionId: candidate.candidateId,
      currentBlock: candidate.session.currentBlock,
      state: responseState,
      response: result.response || '',
      step: result.step,
      expectsAnswer: result.expectsAnswer,
      autoContinue: result.autoContinue,
    });
  } catch (error) {
    console.error("[axiom] error:", error);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SERVER LISTENING ON ${PORT}`);
});
