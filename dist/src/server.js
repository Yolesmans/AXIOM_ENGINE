import './env.js';
import express from "express";
import cors from "cors";
import { candidateStore } from "./store/sessionStore.js";
import { v4 as uuidv4 } from "uuid";
import { getPostConfig } from "./store/postRegistry.js";
import { executeWithAutoContinue, STEP_01_IDENTITY, STEP_02_TONE, STEP_03_PREAMBULE, STEP_03_BLOC1, BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10, STEP_99_MATCH_READY, STEP_99_MATCHING, DONE_MATCHING, } from "./engine/axiomExecutor.js";
import { BlockOrchestrator } from "./services/blockOrchestrator.js";
import { z } from "zod";
import { IdentitySchema } from "./validators/identity.js";
import { candidateToLiveTrackingRow, googleSheetsLiveTrackingService } from "./services/googleSheetsService.js";
console.log("BOOT SERVER START");
// ============================================
// HELPER : Dérivation d'état depuis l'historique
// ============================================
// PRIORITÉ A : Empêcher les retours en arrière
// Dérive l'état depuis l'historique du candidat si UI est null
function deriveStepFromHistory(candidate) {
    // Règle 1 : Si currentBlock > 0 → candidat est dans un bloc
    if (candidate.session.currentBlock > 0) {
        return `BLOC_${String(candidate.session.currentBlock).padStart(2, '0')}`;
    }
    // Règle 2 : Si réponses présentes → candidat a dépassé le préambule
    if (candidate.answers.length > 0) {
        return STEP_03_BLOC1;
    }
    // Règle 3 : Si tone choisi → candidat est au préambule ou après
    if (candidate.tonePreference) {
        return STEP_03_BLOC1;
    }
    // Règle 4 : Si identité complétée → candidat est au tone
    if (candidate.identity.completedAt) {
        return STEP_02_TONE;
    }
    // Règle 5 : Sinon → nouveau candidat, identité
    return STEP_01_IDENTITY;
}
// ============================================
// HELPER : Mapping step → state (source unique de vérité)
// ============================================
function mapStepToState(step) {
    if (step === STEP_03_BLOC1) {
        return "wait_start_button";
    }
    if ([BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(step)) {
        return "collecting";
    }
    if (step === STEP_99_MATCH_READY) {
        return "match_ready";
    }
    if (step === STEP_99_MATCHING || step === DONE_MATCHING) {
        return "matching";
    }
    return "idle";
}
const app = express();
// BODY PARSER
app.use(express.json());
// CORS — AUTORISER VERCEL
app.use(cors({
    origin: [
        "https://axiom-engine-shsk.vercel.app"
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-session-id"],
}));
// PREFLIGHT
app.options("*", cors());
const AxiomBodySchema = z.object({
    tenantId: z.string().min(1),
    posteId: z.string().min(1),
    sessionId: z.string().min(8).optional().nullable(),
    message: z.string().min(1).optional().nullable(),
    userMessage: z.string().min(1).optional().nullable(),
    event: z.string().optional().nullable(),
    test: z.boolean().optional().nullable(),
    finish: z.boolean().optional().nullable(),
    identity: z
        .object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
    })
        .optional()
        .nullable(),
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
app.get("/start", async (req, res) => {
    try {
        const { tenant, poste, sessionId: querySessionId } = req.query;
        if (!tenant || !poste) {
            return res.status(400).json({
                error: "MISSING_PARAMS",
                message: "tenant et poste requis",
            });
        }
        try {
            getPostConfig(tenant, poste);
        }
        catch (e) {
            return res.status(400).json({
                error: "UNKNOWN_TENANT_OR_POSTE",
                message: "Entreprise ou poste inconnu",
            });
        }
        // Normaliser la lecture sessionId
        const sessionIdHeader = req.headers["x-session-id"] || "";
        const sessionIdHeaderTrim = sessionIdHeader.trim();
        const querySessionIdTrim = querySessionId ? querySessionId.trim() : "";
        let finalSessionId;
        if (sessionIdHeaderTrim !== "") {
            finalSessionId = sessionIdHeaderTrim;
        }
        else if (querySessionIdTrim !== "") {
            finalSessionId = querySessionIdTrim;
        }
        else {
            finalSessionId = uuidv4();
        }
        let candidate = candidateStore.get(finalSessionId);
        if (!candidate) {
            candidate = await candidateStore.getAsync(finalSessionId);
        }
        let sessionReset = false;
        // Ne jamais créer silencieusement une nouvelle session quand le client en a déjà une
        if (sessionIdHeaderTrim !== "" && !candidate) {
            // Store perdu (redémarrage) OU session invalide
            finalSessionId = uuidv4();
            candidate = candidateStore.create(finalSessionId, tenant);
            sessionReset = true;
        }
        else if (!candidate) {
            candidate = candidateStore.create(finalSessionId, tenant);
        }
        if (!candidate) {
            return res.status(500).json({
                error: "INTERNAL_ERROR",
                message: "Failed to create candidate",
            });
        }
        // RÈGLE 5 — /start DOIT ÊTRE IDÉMPOTENT
        // Si aucune identité n'est stockée → FORCER state = identity
        if (!candidate.identity.completedAt || !candidate.identity.firstName || !candidate.identity.lastName || !candidate.identity.email) {
            // Forcer l'état identity
            candidateStore.updateUIState(candidate.candidateId, {
                step: STEP_01_IDENTITY,
                lastQuestion: null,
                identityDone: false,
            });
            const candidateIdBeforeReload = candidate.candidateId;
            candidate = candidateStore.get(candidateIdBeforeReload);
            if (!candidate) {
                candidate = await candidateStore.getAsync(candidateIdBeforeReload);
            }
            if (!candidate) {
                return res.status(500).json({
                    error: "INTERNAL_ERROR",
                    message: "Failed to update UI state",
                });
            }
            return res.status(200).json({
                sessionId: finalSessionId,
                state: "identity",
                currentBlock: candidate.session.currentBlock,
                response: "Avant de commencer AXIOM, j'ai besoin de ton prénom, nom et email.",
                step: "STEP_01_IDENTITY",
                expectsAnswer: true,
                autoContinue: false,
                ...(sessionReset ? { sessionReset: true } : {}),
            });
        }
        // PRIORITÉ A2 : Empêcher /start de relancer le moteur si l'utilisateur est déjà avancé
        // Dériver l'état depuis l'historique si UI est null
        const currentStep = candidate.session.ui?.step;
        const derivedStep = currentStep || deriveStepFromHistory(candidate);
        // Si candidat est avancé (préambule ou bloc) → retourner immédiatement SANS appeler le moteur
        if (derivedStep === STEP_03_BLOC1 ||
            derivedStep === "PREAMBULE_DONE" ||
            (derivedStep && derivedStep.startsWith('BLOC_'))) {
            // Persister l'état dérivé si UI était null
            if (!candidate.session.ui && currentStep !== derivedStep) {
                const candidateIdForReload5 = candidate.candidateId;
                candidateStore.updateUIState(candidateIdForReload5, {
                    step: derivedStep,
                    lastQuestion: null,
                    identityDone: !!candidate.identity.completedAt,
                });
                candidate = candidateStore.get(candidateIdForReload5);
                if (!candidate) {
                    candidate = await candidateStore.getAsync(candidateIdForReload5);
                }
                if (!candidate) {
                    return res.status(500).json({
                        error: "INTERNAL_ERROR",
                        message: "Failed to update UI state",
                    });
                }
            }
            return res.status(200).json({
                sessionId: finalSessionId,
                step: derivedStep,
                state: derivedStep.startsWith('BLOC_') ? "collecting" : "wait_start_button",
                response: "",
                expectsAnswer: false,
                autoContinue: false,
                currentBlock: candidate.session.currentBlock,
                ...(sessionReset ? { sessionReset: true } : {}),
            });
        }
        // Si identité complétée, continuer normalement avec auto-enchaînement
        const result = await executeWithAutoContinue(candidate);
        // Utiliser la fonction unique de mapping
        const responseState = mapStepToState(result.step);
        const responseStep = result.step;
        // C) CONTRAT DE SÉCURITÉ — Toujours renvoyer data.response non vide
        const response = result.response || '';
        const finalResponse = response || "Une erreur technique est survenue. Recharge la page.";
        return res.status(200).json({
            sessionId: finalSessionId,
            state: responseState,
            currentBlock: candidate.session.currentBlock,
            response: finalResponse,
            step: responseStep,
            expectsAnswer: response ? result.expectsAnswer : false,
            autoContinue: result.autoContinue,
            ...(sessionReset ? { sessionReset: true } : {}),
        });
    }
    catch (error) {
        console.error("[start] error:", error);
        // C) CONTRAT DE SÉCURITÉ — Si erreur interne
        const errorSessionId = req.query?.sessionId || req.headers['x-session-id'] || '';
        return res.status(200).json({
            sessionId: errorSessionId,
            state: "identity",
            currentBlock: null,
            response: "Une erreur technique est survenue. Recharge la page.",
            step: "STEP_01_IDENTITY",
            expectsAnswer: false,
            autoContinue: false,
        });
    }
});
// POST /axiom
app.post("/axiom", async (req, res) => {
    try {
        const parsed = AxiomBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: "BAD_REQUEST",
                details: parsed.error.flatten(),
            });
        }
        const { tenantId, posteId, sessionId: providedSessionId, identity: providedIdentity, message: userMessage, event, } = parsed.data;
        const sessionId = req.headers["x-session-id"] || providedSessionId;
        if (!sessionId) {
            return res.status(400).json({
                error: "MISSING_SESSION_ID",
                message: "sessionId requis (header x-session-id ou body)",
            });
        }
        try {
            getPostConfig(tenantId, posteId);
        }
        catch (error) {
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
            // Enregistrer le message utilisateur (identité) dans conversationHistory
            candidateStore.appendUserMessage(candidate.candidateId, messageText, {
                step: STEP_01_IDENTITY,
                kind: 'other',
            });
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
            // RÈGLE 2 — ÉCRITURE GOOGLE SHEET OBLIGATOIRE
            // DÈS QUE l'identité est valide → ÉCRIRE / METTRE À JOUR la ligne Google Sheet
            try {
                const trackingRow = candidateToLiveTrackingRow(candidate);
                console.log("[SHEET] INSERT/UPDATE", {
                    sessionId: candidate.candidateId,
                    email: candidate.identity.email,
                    firstName: candidate.identity.firstName,
                    lastName: candidate.identity.lastName,
                    tenantId,
                    posteId,
                });
                await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
                console.log("[SHEET] SUCCESS", {
                    sessionId: candidate.candidateId,
                    email: candidate.identity.email,
                });
            }
            catch (error) {
                // PARTIE 3 — Si l'écriture Sheet échoue → LOG + throw (pas silencieux)
                console.error("[SHEET] ERROR", {
                    sessionId: candidate.candidateId,
                    email: candidate.identity.email,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                });
                // B) GOOGLE SHEETS = NON BLOQUANT
                // Supprimer TOUS les throw liés à Google Sheets
                // Le moteur DOIT répondre, changer d'état, continuer le flux AXIOM
                // Pas de return ici, on continue le flux normalement
            }
            // Passer à tone_choice après écriture Sheet
            candidateStore.updateUIState(candidate.candidateId, {
                identityDone: true,
                step: STEP_02_TONE,
            });
            const candidateIdBeforeReload = candidate.candidateId;
            candidate = candidateStore.get(candidateIdBeforeReload);
            if (!candidate) {
                candidate = await candidateStore.getAsync(candidateIdBeforeReload);
            }
            if (!candidate) {
                return res.status(500).json({
                    error: "INTERNAL_ERROR",
                    message: "Failed to update UI state",
                });
            }
            const result = await executeWithAutoContinue(candidate);
            // Mapper les états correctement
            let responseState = "collecting";
            if (result.step === STEP_01_IDENTITY) {
                responseState = "identity";
            }
            else if (result.step === STEP_02_TONE) {
                responseState = "tone_choice";
            }
            else if (result.step === STEP_03_PREAMBULE) {
                responseState = "preambule";
            }
            else if (result.step === STEP_03_BLOC1) {
                responseState = "wait_start_button";
            }
            else if (result.step === BLOC_01) {
                responseState = "collecting";
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
                // Enregistrer le message utilisateur (identité) dans conversationHistory
                candidateStore.appendUserMessage(candidate.candidateId, `Prénom: ${identityValidation.data.firstName}\nNom: ${identityValidation.data.lastName}\nEmail: ${identityValidation.data.email}`, {
                    step: STEP_01_IDENTITY,
                    kind: 'other',
                });
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
                // RÈGLE 2 — ÉCRITURE GOOGLE SHEET OBLIGATOIRE
                try {
                    const trackingRow = candidateToLiveTrackingRow(candidate);
                    console.log("[SHEET] INSERT/UPDATE", {
                        sessionId: candidate.candidateId,
                        email: candidate.identity.email,
                        firstName: candidate.identity.firstName,
                        lastName: candidate.identity.lastName,
                        tenantId,
                        posteId,
                    });
                    await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
                    console.log("[SHEET] SUCCESS", {
                        sessionId: candidate.candidateId,
                        email: candidate.identity.email,
                    });
                }
                catch (error) {
                    // PARTIE 3 — Si l'écriture Sheet échoue → LOG + throw (pas silencieux)
                    console.error("[SHEET] ERROR", {
                        sessionId: candidate.candidateId,
                        email: candidate.identity.email,
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                    });
                    // B) GOOGLE SHEETS = NON BLOQUANT
                    // Supprimer TOUS les throw liés à Google Sheets
                    // Le moteur DOIT répondre, changer d'état, continuer le flux AXIOM
                    // Pas de return ici, on continue le flux normalement
                }
                const candidateIdForReload2 = candidate.candidateId;
                candidateStore.updateUIState(candidateIdForReload2, {
                    identityDone: true,
                    step: STEP_02_TONE,
                });
                candidate = candidateStore.get(candidateIdForReload2);
                if (!candidate) {
                    candidate = await candidateStore.getAsync(candidateIdForReload2);
                }
                if (!candidate) {
                    return res.status(500).json({
                        error: "INTERNAL_ERROR",
                        message: "Failed to update UI state",
                    });
                }
                const result = await executeWithAutoContinue(candidate);
                let responseState = "preamble";
                if (result.step === STEP_03_BLOC1) {
                    responseState = "preamble_done";
                }
                const candidateIdForReload3 = candidate.candidateId;
                candidateStore.updateSession(candidateIdForReload3, { state: "preamble" });
                candidate = candidateStore.get(candidateIdForReload3);
                if (!candidate) {
                    candidate = await candidateStore.getAsync(candidateIdForReload3);
                }
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
            candidate = await candidateStore.getAsync(sessionId);
        }
        if (!candidate) {
            candidate = candidateStore.create(sessionId, tenantId);
        }
        else {
            if (candidate.tenantId !== tenantId) {
                return res.status(403).json({
                    error: "TENANT_MISMATCH",
                    message: "Candidate does not belong to this tenant",
                });
            }
        }
        // RÈGLE 1 — CONTRAT FRONT / BACK
        // Si identité absente → forcer state = identity
        if (candidate.session.state === "identity" || !candidate.identity.completedAt || !candidate.identity.firstName || !candidate.identity.lastName || !candidate.identity.email) {
            candidateStore.updateUIState(candidate.candidateId, {
                step: STEP_01_IDENTITY,
                lastQuestion: null,
                identityDone: false,
            });
            return res.status(200).json({
                sessionId: candidate.candidateId,
                currentBlock: candidate.session.currentBlock,
                state: "identity",
                response: '',
                step: "STEP_01_IDENTITY",
                expectsAnswer: true,
            });
        }
        // PRIORITÉ A1 : Initialiser l'état UI avec dérivation depuis l'historique
        // INTERDICTION : Ne jamais forcer STEP_02_TONE sans analyser l'historique
        if (!candidate.session.ui) {
            const initialState = deriveStepFromHistory(candidate);
            candidateStore.updateUIState(candidate.candidateId, {
                step: initialState,
                lastQuestion: null,
                identityDone: !!candidate.identity.completedAt,
            });
            const candidateIdBeforeReload = candidate.candidateId;
            candidate = candidateStore.get(candidateIdBeforeReload);
            if (!candidate) {
                candidate = await candidateStore.getAsync(candidateIdBeforeReload);
            }
            if (!candidate) {
                return res.status(500).json({
                    error: "INTERNAL_ERROR",
                    message: "Failed to initialize UI state",
                });
            }
        }
        // PARTIE 5 — Gérer les events techniques (boutons)
        if (event === "START_BLOC_1") {
            // START_BLOC_1 → Déléguer à l'orchestrateur pour BLOC 1
            const orchestrator = new BlockOrchestrator();
            const result = await orchestrator.handleMessage(candidate, null, "START_BLOC_1");
            const candidateId = candidate.candidateId;
            candidate = candidateStore.get(candidateId);
            if (!candidate) {
                candidate = await candidateStore.getAsync(candidateId);
            }
            if (!candidate) {
                return res.status(500).json({
                    error: "INTERNAL_ERROR",
                    message: "Failed to get candidate",
                });
            }
            try {
                const trackingRow = candidateToLiveTrackingRow(candidate);
                await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
            }
            catch (error) {
                console.error("[axiom] live tracking error:", error);
            }
            // Mapper les états
            let responseState = "collecting";
            if ([BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(result.step)) {
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
        // Garde : Si step === STEP_03_BLOC1 ET userMessage présent ET event !== START_BLOC_1
        // → Ignorer le message ou retourner erreur explicite
        if (candidate.session.ui?.step === STEP_03_BLOC1 && userMessageText && event !== 'START_BLOC_1') {
            return res.status(200).json({
                sessionId: candidate.candidateId,
                currentBlock: candidate.session.currentBlock,
                state: "wait_start_button",
                response: "Pour commencer le profil, clique sur le bouton 'Je commence mon profil' ci-dessus.",
                step: STEP_03_BLOC1,
                expectsAnswer: false,
                autoContinue: false,
            });
        }
        // PHASE 2 : Déléguer BLOC 1 à l'orchestrateur (LOT 1 : uniquement si BLOC 1 déjà démarré)
        // IMPORTANT : Ne pas déléguer si step === STEP_03_BLOC1 (attente bouton START_BLOC_1)
        if (candidate.session.ui?.step === BLOC_01 && candidate.session.currentBlock === 1) {
            // BLOC 1 déjà démarré → déléguer à l'orchestrateur
            // Enregistrer le message utilisateur dans conversationHistory AVANT d'appeler l'orchestrateur
            if (userMessageText) {
                const candidateIdForUserMessage = candidate.candidateId;
                candidateStore.appendUserMessage(candidateIdForUserMessage, userMessageText, {
                    block: 1,
                    step: BLOC_01,
                    kind: 'other',
                });
                // Recharger candidate après enregistrement
                candidate = candidateStore.get(candidateIdForUserMessage);
                if (!candidate) {
                    candidate = await candidateStore.getAsync(candidateIdForUserMessage);
                }
                if (!candidate) {
                    return res.status(500).json({
                        error: "INTERNAL_ERROR",
                        message: "Failed to store user message",
                    });
                }
            }
            const orchestrator = new BlockOrchestrator();
            // LOT 1 : Ne pas passer d'event (null) car le BLOC 1 est déjà démarré
            const result = await orchestrator.handleMessage(candidate, userMessageText, null);
            // Recharger le candidate AVANT le mapping pour avoir l'état à jour
            const candidateIdAfterExecution = candidate.candidateId;
            candidate = candidateStore.get(candidateIdAfterExecution);
            if (!candidate) {
                candidate = await candidateStore.getAsync(candidateIdAfterExecution);
            }
            if (!candidate) {
                return res.status(500).json({
                    error: "INTERNAL_ERROR",
                    message: "Failed to get candidate",
                });
            }
            // Utiliser la fonction unique de mapping
            const responseState = mapStepToState(result.step);
            const responseStep = result.step;
            try {
                const trackingRow = candidateToLiveTrackingRow(candidate);
                await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
            }
            catch (error) {
                console.error("Error updating live tracking:", error);
            }
            return res.status(200).json({
                sessionId: candidate.candidateId,
                currentBlock: candidate.session.currentBlock,
                state: responseState,
                response: result.response || '',
                step: responseStep,
                expectsAnswer: result.expectsAnswer,
                autoContinue: result.autoContinue,
            });
        }
        // PHASE 2A : Déléguer BLOC 2A à l'orchestrateur
        if (candidate.session.ui?.step === BLOC_02 && candidate.session.currentBlock === 2) {
            // Enregistrer le message utilisateur dans conversationHistory AVANT d'appeler l'orchestrateur
            if (userMessageText) {
                const candidateIdForUserMessage = candidate.candidateId;
                candidateStore.appendUserMessage(candidateIdForUserMessage, userMessageText, {
                    block: 2,
                    step: BLOC_02,
                    kind: 'other',
                });
                // Recharger candidate après enregistrement
                candidate = candidateStore.get(candidateIdForUserMessage);
                if (!candidate) {
                    candidate = await candidateStore.getAsync(candidateIdForUserMessage);
                }
                if (!candidate) {
                    return res.status(500).json({
                        error: "INTERNAL_ERROR",
                        message: "Failed to store user message",
                    });
                }
            }
            const orchestrator = new BlockOrchestrator();
            let result;
            try {
                result = await orchestrator.handleMessage(candidate, userMessageText, null);
            }
            catch (error) {
                // Gérer spécifiquement erreur validation BLOC 2B
                if (error instanceof Error && error.message.includes('BLOC 2B validation failed')) {
                    console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] fatal=true', error.message);
                    return res.status(200).json({
                        sessionId: candidate.candidateId,
                        currentBlock: candidate.session.currentBlock,
                        state: "collecting",
                        response: "Une erreur technique est survenue lors de la génération des questions. Veuillez réessayer ou contacter le support.",
                        step: BLOC_02,
                        expectsAnswer: false,
                        autoContinue: false,
                    });
                }
                // Re-throw autres erreurs
                throw error;
            }
            // Recharger le candidate AVANT le mapping pour avoir l'état à jour
            const candidateIdAfterExecution = candidate.candidateId;
            candidate = candidateStore.get(candidateIdAfterExecution);
            if (!candidate) {
                candidate = await candidateStore.getAsync(candidateIdAfterExecution);
            }
            if (!candidate) {
                return res.status(500).json({
                    error: "INTERNAL_ERROR",
                    message: "Failed to get candidate",
                });
            }
            // Utiliser la fonction unique de mapping
            const responseState = mapStepToState(result.step);
            const responseStep = result.step;
            // Mise à jour Google Sheet
            if (candidate.identity.completedAt) {
                try {
                    const trackingRow = candidateToLiveTrackingRow(candidate);
                    await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
                }
                catch (error) {
                    console.error("[axiom] live tracking error:", error);
                }
            }
            const response = result.response || '';
            const finalResponse = response || "Une erreur technique est survenue. Recharge la page.";
            return res.status(200).json({
                sessionId: candidate.candidateId,
                currentBlock: candidate.session.currentBlock,
                state: responseState,
                response: finalResponse,
                step: responseStep,
                expectsAnswer: response ? result.expectsAnswer : false,
                autoContinue: result.autoContinue,
            });
        }
        // Enregistrer le message utilisateur dans conversationHistory AVANT d'appeler le moteur
        if (userMessageText) {
            const candidateIdForUserMessage = candidate.candidateId;
            candidateStore.appendUserMessage(candidateIdForUserMessage, userMessageText, {
                block: candidate.session.currentBlock,
                step: candidate.session.ui?.step,
                kind: 'other',
            });
            // Recharger candidate après enregistrement
            candidate = candidateStore.get(candidateIdForUserMessage);
            if (!candidate) {
                candidate = await candidateStore.getAsync(candidateIdForUserMessage);
            }
            if (!candidate) {
                return res.status(500).json({
                    error: "INTERNAL_ERROR",
                    message: "Failed to store user message",
                });
            }
        }
        const result = await executeWithAutoContinue(candidate, userMessageText, event || null);
        // Recharger le candidate AVANT le mapping pour avoir l'état à jour
        const candidateIdAfterExecution = candidate.candidateId;
        candidate = candidateStore.get(candidateIdAfterExecution);
        if (!candidate) {
            candidate = await candidateStore.getAsync(candidateIdAfterExecution);
        }
        if (!candidate) {
            return res.status(500).json({
                error: "INTERNAL_ERROR",
                message: "Failed to get candidate",
            });
        }
        // Utiliser la fonction unique de mapping
        const responseState = mapStepToState(result.step);
        const responseStep = result.step;
        // Mise à jour Google Sheet (sauf si on est en identity)
        if (responseState !== "identity" && candidate.identity.completedAt) {
            try {
                const trackingRow = candidateToLiveTrackingRow(candidate);
                await googleSheetsLiveTrackingService.upsertLiveTracking(tenantId, posteId, trackingRow);
            }
            catch (error) {
                console.error("[axiom] live tracking error:", error);
            }
        }
        // C) CONTRAT DE SÉCURITÉ — Toujours renvoyer data.response non vide
        const response = result.response || '';
        const finalResponse = response || "Une erreur technique est survenue. Recharge la page.";
        return res.status(200).json({
            sessionId: candidate.candidateId,
            currentBlock: candidate.session.currentBlock,
            state: responseState,
            response: finalResponse,
            step: responseStep,
            expectsAnswer: response ? result.expectsAnswer : false,
            autoContinue: result.autoContinue,
        });
    }
    catch (error) {
        console.error("[axiom] error:", error);
        // C) CONTRAT DE SÉCURITÉ — Si erreur interne
        const errorSessionId = req.body?.sessionId || req.headers['x-session-id'] || '';
        return res.status(200).json({
            sessionId: errorSessionId,
            state: "identity",
            currentBlock: null,
            response: "Une erreur technique est survenue. Recharge la page.",
            step: "STEP_01_IDENTITY",
            expectsAnswer: false,
            autoContinue: false,
        });
    }
});
// POST /axiom/stream — SSE hybrid streaming (mirrors, final profile, matching only)
app.post("/axiom/stream", async (req, res) => {
    // Headers SSE obligatoires
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    try {
        const parsed = AxiomBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.write(`event: error\n`);
            res.write(`data: ${JSON.stringify({ error: "BAD_REQUEST", details: parsed.error.flatten() })}\n\n`);
            res.end();
            return;
        }
        const { tenantId, posteId, sessionId: providedSessionId, identity: providedIdentity, message: userMessage, event, } = parsed.data;
        const sessionId = req.headers["x-session-id"] || providedSessionId;
        if (!sessionId) {
            res.write(`event: error\n`);
            res.write(`data: ${JSON.stringify({ error: "MISSING_SESSION_ID", message: "sessionId requis" })}\n\n`);
            res.end();
            return;
        }
        try {
            getPostConfig(tenantId, posteId);
        }
        catch (error) {
            res.write(`event: error\n`);
            res.write(`data: ${JSON.stringify({ error: "INVALID_POSTE", message: error instanceof Error ? error.message : "Invalid posteId" })}\n\n`);
            res.end();
            return;
        }
        // Pour l'instant, cette route refuse le streaming pour tous les types
        // L'implémentation complète nécessitera de modifier executeAxiom et blockOrchestrator
        // pour accepter un paramètre "stream: boolean" et utiliser callOpenAIStream
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ error: "NOT_IMPLEMENTED", message: "Streaming route not yet fully implemented. Use /axiom for now." })}\n\n`);
        res.end();
    }
    catch (error) {
        console.error("[axiom/stream] error:", error);
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ error: "INTERNAL_ERROR", message: "Streaming error" })}\n\n`);
        res.end();
    }
});
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`SERVER LISTENING ON ${PORT}`);
});
