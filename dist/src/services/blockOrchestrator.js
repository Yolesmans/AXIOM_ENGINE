import { candidateStore } from '../store/sessionStore.js';
import { callOpenAI } from './openaiClient.js';
import { BLOC_01, BLOC_02, BLOC_03, STEP_WAIT_BLOC_3, executeAxiom } from '../engine/axiomExecutor.js';
import { STATIC_QUESTIONS } from '../engine/staticQuestions.js';
// getFullAxiomPrompt n'est pas exporté, on doit le reconstruire
import { PROMPT_AXIOM_ENGINE, PROMPT_AXIOM_PROFIL } from '../engine/prompts.js';
import { validateTraitsSpecificity, validateMotifsSpecificity, validateSynthesis2B, validateQuestion2A1, validateQuestion2A3 } from './validators.js';
import { validateMirrorREVELIOM } from './validateMirrorReveliom.js';
import { parseMirrorSections } from './parseMirrorSections.js';
import { generateInterpretiveStructure } from './interpretiveStructureGenerator.js';
import { selectMentorAngle } from './mentorAngleSelector.js';
import { renderMentorStyle, transposeToSecondPerson } from './mentorStyleRenderer.js';
function getFullAxiomPrompt() {
    return `${PROMPT_AXIOM_ENGINE}\n\n${PROMPT_AXIOM_PROFIL}`;
}
/** Question 2A.1 statique (0 token, pas d'appel LLM, pas de validation/retry) — modèle BLOC 1 */
const STATIC_QUESTION_2A1 = `Tu préfères qu'on parle de séries ou de films ?
A. Série
B. Film`;
/**
 * Normalise la réponse 2A.1 (Médium) en valeur canonique.
 * Tolérant : A/a/A./Série/série → SERIE ; B/b/B./Film/film → FILM.
 * Retourne null si la réponse n'est pas reconnue.
 */
function normalize2A1Response(raw) {
    if (!raw || typeof raw !== 'string')
        return null;
    const s = raw.trim().toLowerCase();
    if (s === 'a' || s === 'a.' || s === 'série' || s === 'serie' || s.startsWith('a.') || s.startsWith('a '))
        return 'SERIE';
    if (s === 'b' || s === 'b.' || s === 'film' || s.startsWith('b.') || s.startsWith('b '))
        return 'FILM';
    return null;
}
// Helper pour construire l'historique conversationnel (copié depuis axiomExecutor)
const MAX_CONV_MESSAGES = 40;
function buildConversationHistory(candidate) {
    const messages = [];
    if (candidate.conversationHistory && candidate.conversationHistory.length > 0) {
        const history = candidate.conversationHistory;
        const recentHistory = history.slice(-MAX_CONV_MESSAGES);
        recentHistory.forEach((msg) => {
            messages.push({
                role: msg.role,
                content: msg.content,
            });
        });
        return messages;
    }
    if (candidate.answers && candidate.answers.length > 0) {
        candidate.answers.forEach((answer) => {
            messages.push({
                role: 'user',
                content: answer.message,
            });
        });
    }
    return messages;
}
/**
 * Construit l'historique conversationnel avec injection FORCÉE des réponses BLOC 2A
 *
 * Garantit que même si conversationHistory est tronqué, les réponses BLOC 2A
 * (médium, 3 œuvres, œuvre noyau) sont TOUJOURS injectées dans le contexte.
 *
 * Utilisé pour BLOC 2B afin d'assurer la personnalisation des questions.
 */
function buildConversationHistoryForBlock2B(candidate) {
    const messages = [];
    const block2A = candidate.block2Answers?.block2A;
    if (block2A?.medium != null || block2A?.preference != null || block2A?.coreWork != null) {
        const mediumAnswer = block2A.medium ?? 'N/A';
        const preferencesAnswer = block2A.preference ?? 'N/A';
        const coreWorkAnswer = block2A.coreWork ?? 'N/A';
        messages.push({
            role: 'system',
            content: `CONTEXTE BLOC 2A (OBLIGATOIRE — INJECTION FORCÉE) :
Médium choisi : ${mediumAnswer}
Préférences (3 œuvres) : ${preferencesAnswer}
Œuvre noyau : ${coreWorkAnswer}

Ces informations sont CRITIQUES pour personnaliser les questions BLOC 2B.
Chaque question doit être spécifique à ces œuvres.`
        });
        console.log('[ORCHESTRATOR] BLOC 2A context injected:', { medium: mediumAnswer, preferences: preferencesAnswer, coreWork: coreWorkAnswer });
    }
    else {
        console.warn('[ORCHESTRATOR] BLOC 2A answers not found (block2A). BLOC 2B cannot be personalized.');
    }
    // Historique conversationnel standard
    if (candidate.conversationHistory && candidate.conversationHistory.length > 0) {
        const history = candidate.conversationHistory;
        const recentHistory = history.slice(-MAX_CONV_MESSAGES);
        recentHistory.forEach((msg) => {
            messages.push({
                role: msg.role,
                content: msg.content,
            });
        });
    }
    else if (candidate.answers && candidate.answers.length > 0) {
        candidate.answers.forEach((answer) => {
            messages.push({
                role: 'user',
                content: answer.message,
            });
        });
    }
    return messages;
}
/**
 * SAFEGUARD — Normalise la réponse pour garantir le contrat backend→frontend
 * 1 requête API = 1 message affichable maximum côté UI
 *
 * Si plusieurs questions sont concaténées (séparées par ---QUESTION_SEPARATOR---),
 * ne retourne que la première pour respecter l'affichage séquentiel strict.
 */
function normalizeSingleResponse(response) {
    if (!response)
        return '';
    // SAFEGUARD — ne jamais exposer plus d'un message affichable
    if (response.includes('---QUESTION_SEPARATOR---')) {
        console.warn('[AXIOM][SAFEGUARD] Multiple questions detected in response — truncating to first');
        return response.split('---QUESTION_SEPARATOR---')[0].trim();
    }
    return response.trim();
}
/**
 * LOT1 — Vérifie si un message utilisateur est une validation de miroir
 * Validation miroir = toute réponse non vide (validation "humaine")
 */
function isMirrorValidation(input) {
    if (!input)
        return false;
    return input.trim().length > 0;
}
export class BlockOrchestrator {
    async handleMessage(candidate, userMessage, event, onChunk, onUx) {
        // Déterminer le bloc en cours
        const currentBlock = candidate.session.currentBlock || 1;
        const currentStep = candidate.session.ui?.step || '';
        // BLOC 2 — routage strict par state machine (aucun answeredCount)
        if (currentBlock === 2 && (currentStep === BLOC_02 || currentStep === '')) {
            const blockStates = candidate.session.blockStates ?? {
                '2A': { status: 'NOT_STARTED' },
                '2B': { status: 'NOT_STARTED', currentQuestionIndex: 0 },
            };
            if (blockStates['2B'].status === 'IN_PROGRESS') {
                return this.handleBlock2B(candidate, userMessage, event, onChunk, onUx);
            }
            if (blockStates['2A'].status === 'IN_PROGRESS' || blockStates['2A'].status === 'NOT_STARTED') {
                return this.handleBlock2A(candidate, userMessage, event, onChunk, onUx);
            }
            return this.handleBlock2B(candidate, userMessage, event, onChunk, onUx);
        }
        // BLOC 1 (logique existante)
        const blockNumber = 1;
        // Recharger candidate pour avoir l'état à jour
        const candidateId = candidate.candidateId;
        let currentCandidate = candidateStore.get(candidateId);
        if (!currentCandidate) {
            currentCandidate = await candidateStore.getAsync(candidateId);
        }
        if (!currentCandidate) {
            throw new Error(`Candidate ${candidateId} not found`);
        }
        const queue = currentCandidate.blockQueues?.[blockNumber];
        // Cas 1 : Event START_BLOC_1 UNIQUEMENT (LOT 1 : démarrage volontaire obligatoire)
        if (event === 'START_BLOC_1') {
            // Vérifier si les questions ont déjà été générées (anti-double)
            if (queue && queue.questions.length > 0) {
                // Questions déjà générées → servir la première question
                console.log('[ORCHESTRATOR] BLOC 1 déjà démarré, servir question depuis queue');
                return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
            }
            // BLOC 1 : questions statiques (0 token, pas d'appel LLM)
            const questions = STATIC_QUESTIONS[1] ?? [];
            if (questions.length === 0) {
                throw new Error('BLOC 1 static questions not found');
            }
            console.log('[ORCHESTRATOR] BLOC 1 questions from static catalog (no API)');
            candidateStore.setQuestionsForBlock(currentCandidate.candidateId, blockNumber, questions);
            // Servir UNIQUEMENT la première question (LOT 1 : séquentiel strict)
            return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
        }
        // Si pas d'event START_BLOC_1 et queue vide → erreur (BLOC 1 ne doit pas démarrer automatiquement)
        if (!queue || queue.questions.length === 0) {
            throw new Error('BLOC 1 cannot start without START_BLOC_1 event. Queue is empty.');
        }
        // Cas 2 : Réponse utilisateur reçue
        if (userMessage) {
            const currentQueue = currentCandidate.blockQueues?.[blockNumber];
            if (!currentQueue) {
                throw new Error(`Queue for block ${blockNumber} not found`);
            }
            // LOT1 — Vérifier si on est en attente de validation miroir (toutes questions répondues + miroir déjà généré)
            const allQuestionsAnswered = currentQueue.cursorIndex >= currentQueue.questions.length;
            const conversationHistory = currentCandidate.conversationHistory || [];
            const lastAssistantMessage = [...conversationHistory]
                .reverse()
                .find(m => m.role === 'assistant' && m.kind === 'mirror' && m.block === blockNumber);
            if (allQuestionsAnswered && lastAssistantMessage) {
                // Miroir présent → vérifier si c'est une validation ou juste l'affichage
                if (!userMessage || userMessage.trim().length === 0) {
                    // Pas de message utilisateur → renvoyer le miroir et attendre validation
                    const mirrorSections = parseMirrorSections(lastAssistantMessage.content);
                    return {
                        response: normalizeSingleResponse(lastAssistantMessage.content),
                        step: BLOC_01,
                        expectsAnswer: true,
                        autoContinue: false,
                        progressiveDisplay: mirrorSections.length === 3,
                        mirrorSections: mirrorSections.length === 3 ? mirrorSections : undefined,
                    };
                }
                // Message utilisateur présent → validation miroir BLOC 1
                console.log('[ORCHESTRATOR] Validation miroir BLOC 1 reçue');
                candidateStore.appendMirrorValidation(currentCandidate.candidateId, blockNumber, userMessage);
                // Passer au BLOC 2A
                candidateStore.updateSession(currentCandidate.candidateId, {
                    state: "collecting",
                    currentBlock: 2,
                });
                candidateStore.updateUIState(currentCandidate.candidateId, {
                    step: BLOC_02,
                    lastQuestion: null,
                    identityDone: true,
                    mirrorValidated: true,
                });
                // Recharger le candidate pour avoir l'état à jour
                const updatedCandidate = candidateStore.get(currentCandidate.candidateId);
                if (!updatedCandidate) {
                    throw new Error(`Candidate ${currentCandidate.candidateId} not found after validation`);
                }
                // Générer la première question BLOC 2A
                console.log('[ORCHESTRATOR] generate question 2A.1 after BLOC 1 mirror validation');
                const firstQuestion2A = await this.generateQuestion2A1(updatedCandidate, 0);
                // Enregistrer la question dans conversationHistory
                candidateStore.appendAssistantMessage(updatedCandidate.candidateId, firstQuestion2A, {
                    block: 2,
                    step: BLOC_02,
                    kind: 'question',
                });
                // Mettre à jour UI state avec la question
                candidateStore.updateUIState(updatedCandidate.candidateId, {
                    step: BLOC_02,
                    lastQuestion: firstQuestion2A,
                    identityDone: true,
                });
                return {
                    response: normalizeSingleResponse(firstQuestion2A),
                    step: BLOC_02,
                    expectsAnswer: true,
                    autoContinue: false,
                };
            }
            // Réponse à une question (pas une validation miroir)
            // Le cursor pointe vers la question suivante (avancé dans serveNextQuestion)
            // Donc la question qui vient d'être posée est à l'index cursorIndex - 1
            const questionIndex = currentQueue.cursorIndex - 1;
            // Stocker la réponse dans AnswerMap
            candidateStore.storeAnswerForBlock(currentCandidate.candidateId, blockNumber, questionIndex, userMessage);
            // Recharger candidate après stockage
            const candidateId = currentCandidate.candidateId;
            currentCandidate = candidateStore.get(candidateId);
            if (!currentCandidate) {
                currentCandidate = await candidateStore.getAsync(candidateId);
            }
            if (!currentCandidate) {
                throw new Error(`Candidate ${candidateId} not found after storing answer`);
            }
            const finalQueue = currentCandidate.blockQueues?.[blockNumber];
            if (!finalQueue) {
                throw new Error(`Queue for block ${blockNumber} not found after reload`);
            }
            // Vérifier si toutes les questions ont été répondues
            if (finalQueue.cursorIndex >= finalQueue.questions.length) {
                // Toutes les questions répondues → Générer miroir (sans question 2A)
                console.log('[ORCHESTRATOR] generate mirror bloc 1 (API)');
                console.log('[LOT1] Mirror generated — awaiting validation');
                candidateStore.markBlockComplete(currentCandidate.candidateId, blockNumber);
                const mirror = await this.generateMirrorForBlock1(currentCandidate, onChunk, onUx);
                // Enregistrer le miroir dans conversationHistory
                candidateStore.appendAssistantMessage(currentCandidate.candidateId, mirror, {
                    block: blockNumber,
                    step: BLOC_01, // Rester sur BLOC_01 jusqu'à validation
                    kind: 'mirror',
                });
                // Mettre à jour UI state (currentBlock reste 1 jusqu'à validation)
                // LOT1 — Activer le verrou de validation miroir
                candidateStore.updateUIState(currentCandidate.candidateId, {
                    step: BLOC_01, // Rester sur BLOC_01
                    lastQuestion: null,
                    identityDone: true,
                    mirrorValidated: false, // Verrou activé
                });
                // Parser le miroir en sections pour affichage progressif
                const mirrorSections = parseMirrorSections(mirror);
                // Retourner UNIQUEMENT le miroir avec expectsAnswer: true
                return {
                    response: normalizeSingleResponse(mirror),
                    step: BLOC_01, // Rester sur BLOC_01 jusqu'à validation
                    expectsAnswer: true, // Forcer true pour validation
                    autoContinue: false,
                    progressiveDisplay: mirrorSections.length === 3,
                    mirrorSections: mirrorSections.length === 3 ? mirrorSections : undefined,
                };
            }
            else {
                // Il reste des questions → Servir la suivante (pas d'API)
                return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
            }
        }
        // Cas 3 : Pas de message utilisateur, pas d'event → Servir question suivante si disponible
        return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
    }
    async generateQuestionsForBlock1(candidate) {
        const messages = buildConversationHistory(candidate);
        const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
        const completion = await callOpenAI({
            messages: [
                { role: 'system', content: FULL_AXIOM_PROMPT },
                {
                    role: 'system',
                    content: `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_01 (BLOC 1).
Génère TOUTES les questions du BLOC 1 en une seule fois.
Format : Questions séparées par '---QUESTION_SEPARATOR---'
Chaque question doit être complète et autonome.
Format questions à choix : A. / B. / C. / D. / E. sur lignes séparées.
Génère 3 à 5 questions maximum pour le BLOC 1.`,
                },
                ...messages,
            ],
        });
        // Parser les questions (split par délimiteur)
        const questions = completion
            .split('---QUESTION_SEPARATOR---')
            .map(q => q.trim())
            .filter(q => q.length > 0);
        if (questions.length === 0) {
            // Fallback : utiliser une question par défaut
            return [
                'Tu te sens plus poussé par :\nA. Le fait de progresser, devenir meilleur\nB. Le fait d\'atteindre des objectifs concrets\nC. Le fait d\'être reconnu pour ce que tu fais ?',
            ];
        }
        return questions;
    }
    serveNextQuestion(candidateId, blockNumber) {
        const candidate = candidateStore.get(candidateId);
        if (!candidate) {
            throw new Error(`Candidate ${candidateId} not found`);
        }
        const queue = candidate.blockQueues?.[blockNumber];
        if (!queue || queue.questions.length === 0) {
            throw new Error(`Queue for block ${blockNumber} is empty`);
        }
        if (queue.cursorIndex >= queue.questions.length) {
            throw new Error(`All questions for block ${blockNumber} have been served`);
        }
        const question = queue.questions[queue.cursorIndex];
        console.log('[ORCHESTRATOR] serve question from queue (NO API)', {
            blockNumber,
            questionIndex: queue.cursorIndex,
            totalQuestions: queue.questions.length,
        });
        // Enregistrer la question dans conversationHistory AVANT d'avancer le cursor
        candidateStore.appendAssistantMessage(candidateId, question, {
            block: blockNumber,
            step: BLOC_01,
            kind: 'question',
        });
        // Mettre à jour UI state
        candidateStore.updateUIState(candidateId, {
            step: BLOC_01,
            lastQuestion: question,
            identityDone: true,
        });
        // Avancer le cursor APRÈS avoir servi la question
        candidateStore.advanceQuestionCursor(candidateId, blockNumber);
        return {
            response: normalizeSingleResponse(question),
            step: BLOC_01,
            expectsAnswer: true,
            autoContinue: false,
        };
    }
    /**
     * Génère un miroir BLOC 1 en deux étapes distinctes :
     * 1. INTERPRÉTATION : Structure JSON froide et logique (gpt-4o-mini, temp 0.3)
     * 2. RENDU MENTOR : Texte incarné et vécu (gpt-4o, temp 0.8)
     *
     * ⚠️ ARCHITECTURE NOUVELLE — BLOC 1 UNIQUEMENT
     * - Séparation analyse/rendu pour stabilité et qualité
     * - Suppression validations heuristiques complexes (validateInterpretiveAnalysis)
     * - Validation simple : structure JSON + marqueurs expérientiels
     */
    async generateMirrorForBlock1(candidate, onChunk, onUx) {
        // Construire le contexte des réponses depuis conversationHistory (source robuste)
        const conversationHistory = candidate.conversationHistory || [];
        const block1UserMessages = conversationHistory
            .filter(m => m.role === 'user' && m.block === 1 && m.kind !== 'mirror_validation')
            .map(m => m.content);
        // Fallback : answerMaps si conversationHistory vide
        let userAnswers = block1UserMessages;
        if (userAnswers.length === 0) {
            const answerMap = candidate.answerMaps?.[1];
            const answers = answerMap?.answers || {};
            const sortedEntries = Object.entries(answers)
                .sort(([a], [b]) => parseInt(a) - parseInt(b));
            userAnswers = sortedEntries.map(([, answer]) => answer);
        }
        console.log('[BLOC1][NEW_ARCHITECTURE] Génération miroir en 3 étapes (interprétation + angle + rendu)');
        console.log('[BLOC1] Réponses utilisateur:', userAnswers.length);
        // UX FAST — occupation pendant analyse (1 message statique max)
        let occupationTimer = null;
        if (onUx) {
            occupationTimer = setTimeout(() => {
                onUx('⏳ Je cherche ce qui relie vraiment tes réponses.\n\n');
            }, 1500);
        }
        try {
            // ============================================
            // ÉTAPE 1 — INTERPRÉTATION (FROIDE, LOGIQUE)
            // ============================================
            console.log('[BLOC1][ETAPE1] Génération structure interprétative...');
            const structure = await generateInterpretiveStructure(userAnswers, 'block1');
            console.log('[BLOC1][ETAPE1] Structure générée:', {
                hypothese_centrale: structure.hypothese_centrale.substring(0, 80) + '...',
                mecanisme: structure.mecanisme.substring(0, 50) + '...',
            });
            // ============================================
            // ÉTAPE 2 — DÉCISION D'ANGLE (OBLIGATOIRE)
            // ============================================
            console.log('[BLOC1][ETAPE2] Sélection angle mentor...');
            const mentorAngle = await selectMentorAngle(structure);
            if (occupationTimer) {
                clearTimeout(occupationTimer);
                occupationTimer = null;
            }
            console.log('[BLOC1][ETAPE2] Angle mentor sélectionné:', mentorAngle.substring(0, 80) + '...');
            // UX FAST — révélation anticipée : 1️⃣ Lecture implicite AVANT rendu 4o
            if (onChunk) {
                const earlyPrefix = '1️⃣ Lecture implicite\n\n' + transposeToSecondPerson(mentorAngle) + '\n\n2️⃣ Déduction personnalisée\n\n';
                onChunk(earlyPrefix);
            }
            // ============================================
            // ÉTAPE 3 — RENDU MENTOR INCARNÉ (prefix déjà envoyé si onChunk)
            // ============================================
            console.log('[BLOC1][ETAPE3] Rendu mentor incarné...');
            const mentorText = await renderMentorStyle(mentorAngle, 'block1', onChunk, { prefixAlreadySent: !!onChunk });
            console.log('[BLOC1][ETAPE3] Texte mentor généré');
            // ============================================
            // VALIDATION FINALE (FORMAT REVELIOM)
            // ============================================
            const validation = validateMirrorREVELIOM(mentorText);
            if (validation.valid) {
                console.log('[BLOC1][SUCCESS] Miroir généré avec succès (nouvelle architecture)');
                return mentorText;
            }
            else {
                // Format invalide → log d'erreur mais servir quand même (fail-soft)
                console.warn('[BLOC1][WARN] Format REVELIOM invalide, mais texte servi (fail-soft):', validation.errors);
                return mentorText;
            }
        }
        catch (error) {
            if (occupationTimer)
                clearTimeout(occupationTimer);
            // Erreur dans la nouvelle architecture → fallback sur ancienne méthode (temporaire)
            console.error('[BLOC1][ERROR] Erreur nouvelle architecture, fallback ancienne méthode:', error);
            // TODO: Supprimer ce fallback une fois la nouvelle architecture validée
            // Pour l'instant, on garde un fallback minimal pour éviter de casser le flux
            throw new Error(`Failed to generate mirror with new architecture: ${error}`);
        }
    }
    // ============================================
    // BLOC 2A — Gestion séquentielle adaptative
    // ============================================
    async handleBlock2A(candidate, userMessage, event, onChunk, onUx) {
        const blockNumber = 2;
        const candidateId = candidate.candidateId;
        let currentCandidate = candidateStore.get(candidateId) ?? await candidateStore.getAsync(candidateId);
        if (!currentCandidate)
            throw new Error(`Candidate ${candidateId} not found`);
        const block2A = candidateStore.getBlock2AAnswers(currentCandidate);
        const hasMedium = block2A?.medium != null && block2A.medium !== '';
        const hasPreference = block2A?.preference != null && block2A.preference !== '';
        const hasCoreWork = block2A?.coreWork != null && block2A.coreWork !== '';
        if (!userMessage) {
            if (!hasMedium) {
                currentCandidate = await candidateStore.ensureBlock2AndStart2AIfNeeded(candidateId);
                if (!currentCandidate)
                    throw new Error(`Candidate ${candidateId} not found`);
                candidateStore.appendAssistantMessage(candidateId, STATIC_QUESTION_2A1, { block: blockNumber, step: BLOC_02, kind: 'question' });
                candidateStore.updateUIState(candidateId, { step: BLOC_02, lastQuestion: STATIC_QUESTION_2A1, identityDone: true });
                return { response: normalizeSingleResponse(STATIC_QUESTION_2A1), step: BLOC_02, expectsAnswer: true, autoContinue: false };
            }
            if (!hasPreference) {
                const mediumAnswer = block2A.medium;
                const question = await this.generateQuestion2A2(currentCandidate, mediumAnswer);
                candidateStore.appendAssistantMessage(candidateId, question, { block: blockNumber, step: BLOC_02, kind: 'question' });
                candidateStore.updateUIState(candidateId, { step: BLOC_02, lastQuestion: question, identityDone: true });
                return { response: normalizeSingleResponse(question), step: BLOC_02, expectsAnswer: true, autoContinue: false };
            }
            if (!hasCoreWork) {
                currentCandidate = candidateStore.get(candidateId) ?? await candidateStore.getAsync(candidateId);
                const answersFor2A3 = { 0: block2A.medium, 1: block2A.preference };
                const question = await this.generateQuestion2A3(currentCandidate, answersFor2A3);
                candidateStore.appendAssistantMessage(candidateId, question, { block: blockNumber, step: BLOC_02, kind: 'question' });
                candidateStore.updateUIState(candidateId, { step: BLOC_02, lastQuestion: question, identityDone: true });
                return { response: normalizeSingleResponse(question), step: BLOC_02, expectsAnswer: true, autoContinue: false };
            }
            const lastQuestion = currentCandidate.session.ui?.lastQuestion;
            if (lastQuestion)
                return { response: normalizeSingleResponse(lastQuestion), step: BLOC_02, expectsAnswer: true, autoContinue: false };
            return { response: normalizeSingleResponse(STATIC_QUESTION_2A1), step: BLOC_02, expectsAnswer: true, autoContinue: false };
        }
        if (!hasMedium) {
            const canonical = normalize2A1Response(userMessage);
            if (canonical === null) {
                return { response: normalizeSingleResponse(STATIC_QUESTION_2A1), step: BLOC_02, expectsAnswer: true, autoContinue: false };
            }
            const valueToStore = canonical === 'SERIE' ? 'Série' : 'Film';
            currentCandidate = await candidateStore.setBlock2AMedium(candidateId, valueToStore);
            if (!currentCandidate)
                throw new Error(`Candidate ${candidateId} not found`);
            const question = await this.generateQuestion2A2(currentCandidate, valueToStore);
            candidateStore.appendAssistantMessage(candidateId, question, { block: blockNumber, step: BLOC_02, kind: 'question' });
            candidateStore.updateUIState(candidateId, { step: BLOC_02, lastQuestion: question, identityDone: true });
            return { response: normalizeSingleResponse(question), step: BLOC_02, expectsAnswer: true, autoContinue: false };
        }
        if (!hasPreference) {
            const normResult = await this.normalizeWorksLLM(userMessage);
            if (normResult.needsClarification && normResult.message) {
                return { response: normalizeSingleResponse(normResult.message), step: BLOC_02, expectsAnswer: true, autoContinue: false };
            }
            if (normResult.works && normResult.works.length >= 1) {
                candidateStore.setNormalizedWorks(candidateId, normResult.works);
            }
            currentCandidate = await candidateStore.setBlock2APreference(candidateId, userMessage);
            if (!currentCandidate)
                throw new Error(`Candidate ${candidateId} not found`);
            const block2AAfter = candidateStore.getBlock2AAnswers(currentCandidate);
            const answersFor2A3 = { 0: block2AAfter.medium, 1: block2AAfter.preference };
            const question = await this.generateQuestion2A3(currentCandidate, answersFor2A3);
            candidateStore.appendAssistantMessage(candidateId, question, { block: blockNumber, step: BLOC_02, kind: 'question' });
            candidateStore.updateUIState(candidateId, { step: BLOC_02, lastQuestion: question, identityDone: true });
            return { response: normalizeSingleResponse(question), step: BLOC_02, expectsAnswer: true, autoContinue: false };
        }
        if (!hasCoreWork) {
            currentCandidate = await candidateStore.setBlock2ACoreWork(candidateId, userMessage);
            if (!currentCandidate)
                throw new Error(`Candidate ${candidateId} not found`);
            await candidateStore.setBlock2ACompletedAndStart2B(candidateId);
            currentCandidate = candidateStore.get(candidateId) ?? await candidateStore.getAsync(candidateId);
            if (!currentCandidate)
                throw new Error(`Candidate ${candidateId} not found`);
            const result = await this.handleBlock2B(currentCandidate, null, null, onChunk, onUx);
            const transitionText = "🧠 FIN DU BLOC 2A — PROJECTIONS NARRATIVES\n\nLes préférences sont collectées.\nAucune analyse n'a été produite.\n\nOn passe maintenant au BLOC 2B — Analyse projective des œuvres retenues.\n\n";
            return { ...result, response: normalizeSingleResponse(transitionText + (result.response || '')) };
        }
        const lastQuestion = currentCandidate.session.ui?.lastQuestion;
        if (lastQuestion)
            return { response: normalizeSingleResponse(lastQuestion), step: BLOC_02, expectsAnswer: true, autoContinue: false };
        return { response: normalizeSingleResponse(STATIC_QUESTION_2A1), step: BLOC_02, expectsAnswer: true, autoContinue: false };
    }
    async generateQuestion2A1(candidate, retryCount = 0) {
        const messages = buildConversationHistory(candidate);
        const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
        const promptContent = retryCount > 0
            ? `RÈGLE ABSOLUE AXIOM (RETRY - FORMAT STRICT) :
Tu es en état BLOC_02 (BLOC 2A - Question 1).
Génère UNE question simple demandant au candidat son médium préféré (Série ou Film).
Format OBLIGATOIRE : Question à choix avec EXACTEMENT "A. Série" et "B. Film" sur lignes séparées.
La question doit être claire et directe.
IMPORTANT : La question DOIT contenir les deux options "A. Série" et "B. Film" explicitement.`
            : `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 1).
Génère UNE question simple demandant au candidat son médium préféré (Série ou Film).
Format : Question à choix avec A. Série / B. Film sur lignes séparées.
La question doit être claire et directe.`;
        const completion = await callOpenAI({
            messages: [
                { role: 'system', content: FULL_AXIOM_PROMPT },
                {
                    role: 'system',
                    content: promptContent,
                },
                ...messages,
            ],
        });
        const question = completion.trim();
        // Validation avec retry contrôlé
        const validation = validateQuestion2A1(question);
        if (!validation.valid && retryCount < 1) {
            console.warn('[ORCHESTRATOR] Question 2A.1 validation failed, retry:', validation.error);
            return this.generateQuestion2A1(candidate, retryCount + 1);
        }
        if (!validation.valid) {
            console.warn('[ORCHESTRATOR] Question 2A.1 validation failed after retry, fallback déterministe');
            return "Tu préfères les séries ou les films ?\n\nA. Série\nB. Film";
        }
        return question;
    }
    async generateQuestion2A2(candidate, mediumAnswer) {
        const messages = buildConversationHistory(candidate);
        const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
        // Déterminer le type de médium (Série ou Film)
        const isSeries = mediumAnswer.toLowerCase().includes('série') ||
            mediumAnswer.toLowerCase().includes('serie') ||
            mediumAnswer.toLowerCase().includes('a.') ||
            mediumAnswer.toLowerCase().includes('a');
        const mediumType = isSeries ? 'série' : 'film';
        const completion = await callOpenAI({
            messages: [
                { role: 'system', content: FULL_AXIOM_PROMPT },
                {
                    role: 'system',
                    content: `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 2).
Le candidat a choisi : ${mediumType}.
Génère UNE question adaptée demandant ses préférences en ${mediumType}s.
La question doit être personnalisée selon le choix du candidat (séries ou films).
Format : Question ouverte ou à choix multiples (A/B/C/D/E si choix).
La question doit être pertinente pour explorer les préférences en ${mediumType}s.`,
                },
                ...messages,
            ],
        });
        return completion.trim();
    }
    async generateQuestion2A3(candidate, answers, retryCount = 0) {
        const messages = buildConversationHistory(candidate);
        const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
        const mediumAnswer = answers[0] || '';
        const preferencesAnswer = answers[1] || '';
        const promptContent = retryCount > 0
            ? `RÈGLE ABSOLUE AXIOM (RETRY - FORMAT STRICT) :
Tu es en état BLOC_02 (BLOC 2A - Question 3).
Le candidat a choisi : ${mediumAnswer}
Ses préférences : ${preferencesAnswer}
Génère UNE question demandant au candidat de choisir UNE œuvre centrale (noyau) parmi ses préférences.
La question DOIT demander EXACTEMENT UNE œuvre (utilise les mots "une", "un", "seule", "unique").
La question DOIT mentionner explicitement "œuvre", "série" ou "film".
Format : Question ouverte demandant le nom de l'œuvre.
La question doit permettre d'identifier l'œuvre la plus significative pour le candidat.`
            : `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 3).
Le candidat a choisi : ${mediumAnswer}
Ses préférences : ${preferencesAnswer}
Génère UNE question demandant au candidat de choisir UNE œuvre centrale (noyau) parmi ses préférences.
La question doit être claire et demander une œuvre spécifique (nom d'une série ou d'un film).
Format : Question ouverte demandant le nom de l'œuvre.
La question doit permettre d'identifier l'œuvre la plus significative pour le candidat.`;
        const completion = await callOpenAI({
            messages: [
                { role: 'system', content: FULL_AXIOM_PROMPT },
                {
                    role: 'system',
                    content: promptContent,
                },
                ...messages,
            ],
        });
        const question = completion.trim();
        // Validation avec retry contrôlé
        const validation = validateQuestion2A3(question);
        if (!validation.valid && retryCount < 1) {
            console.warn('[ORCHESTRATOR] Question 2A.3 validation failed, retry:', validation.error);
            return this.generateQuestion2A3(candidate, answers, retryCount + 1);
        }
        if (!validation.valid) {
            console.error('[ORCHESTRATOR] Question 2A.3 validation failed after retry:', validation.error);
            // Retourner quand même la question (avec warning)
        }
        return question;
    }
    /**
     * MÉCANISME DE RETRY CONTRÔLÉ pour génération BLOC 2B
     *
     * Retry max = 1
     * Retry déclenché UNIQUEMENT si validation échoue
     * Prompt renforcé au retry (sans changer la structure)
     *
     * Cette fonction est un template pour les futures générations BLOC 2B.
     * Elle n'est pas utilisée actuellement (BLOC 2B non implémenté).
     */
    async generateWithRetry(generator, validator, maxRetries = 1) {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const result = await generator(attempt);
            const validation = validator(result);
            if (validation.valid) {
                if (attempt > 0) {
                    console.log(`[ORCHESTRATOR] Validation succeeded after ${attempt} retry(ies)`);
                }
                return result;
            }
            // Si dernière tentative, retourner quand même (avec warning)
            if (attempt === maxRetries) {
                console.error(`[ORCHESTRATOR] Validation failed after ${maxRetries} retry(ies):`, validation.error);
                if (validation.details) {
                    console.error('[ORCHESTRATOR] Validation details:', validation.details);
                }
                return result; // Retourner quand même, mais loguer l'erreur
            }
            // Retry avec prompt renforcé
            console.warn(`[ORCHESTRATOR] Validation failed, retry ${attempt + 1}/${maxRetries}:`, validation.error);
        }
        throw new Error('Failed to generate valid result after retries');
    }
    /**
     * VALIDATEURS pour BLOC 2B (à utiliser lors de l'implémentation)
     *
     * Ces fonctions sont des helpers pour valider les générations BLOC 2B.
     * Elles utilisent les validateurs de validators.ts.
     */
    validateTraitsForBlock2B(traitsWork1, traitsWork2, traitsWork3) {
        return validateTraitsSpecificity(traitsWork1, traitsWork2, traitsWork3);
    }
    validateMotifsForBlock2B(motifWork1, motifWork2, motifWork3) {
        return validateMotifsSpecificity(motifWork1, motifWork2, motifWork3);
    }
    validateSynthesisForBlock2B(content) {
        return validateSynthesis2B(content);
    }
    // ============================================
    // BLOC 2B — CŒUR PROJECTIF AXIOM/REVELIOM
    // ============================================
    async handleBlock2B(candidate, userMessage, event, onChunk, onUx) {
        const blockNumber = 2;
        const candidateId = candidate.candidateId;
        // Recharger candidate pour avoir l'état à jour
        let currentCandidate = candidateStore.get(candidateId);
        if (!currentCandidate) {
            currentCandidate = await candidateStore.getAsync(candidateId);
        }
        if (!currentCandidate) {
            throw new Error(`Candidate ${candidateId} not found`);
        }
        // ÉTAPE 1 — CONTEXTE (injection forcée BLOC 2A)
        const messages = buildConversationHistoryForBlock2B(currentCandidate);
        const safeReturnMessage = (message, logContext) => {
            console.warn('[ORCHESTRATOR] [2B_SAFE_RETURN]', logContext, message);
            return {
                response: normalizeSingleResponse(message),
                step: BLOC_02,
                expectsAnswer: true,
                autoContinue: false,
            };
        };
        const blockStates = currentCandidate.session.blockStates;
        const block2A = candidateStore.getBlock2AAnswers(currentCandidate);
        if (!block2A?.medium || !block2A?.preference || !block2A?.coreWork) {
            return safeReturnMessage("Les réponses de la phase précédente sont absentes. Recharge la page ou reprends depuis le début du bloc.", 'BLOC 2A answers missing (block2A)');
        }
        const mediumAnswer = block2A.medium;
        const preferencesAnswer = block2A.preference;
        const coreWorkAnswer = block2A.coreWork;
        if (blockStates?.['2B']?.status !== 'IN_PROGRESS' && userMessage) {
            return safeReturnMessage("L'état du bloc 2B est incohérent. Recharge la page.", 'BLOC 2B status not IN_PROGRESS');
        }
        // PREMIUM : source de vérité = normalizedWorks (plus de parseWorks pour décider des œuvres)
        const normalizedWorks = currentCandidate.session.normalizedWorks;
        const works = normalizedWorks && normalizedWorks.length >= 1
            ? normalizedWorks.map((w) => w.canonicalTitle)
            : this.parseWorks(preferencesAnswer);
        if (works.length === 0) {
            return safeReturnMessage("Tu n'as pas indiqué d'œuvre dans ta réponse précédente. Peux-tu me donner au moins une série ou un film qui te parle (ex. : Breaking Bad, Dark, Suits) ?", 'No works for 2B');
        }
        console.log('[ORCHESTRATOR] [2B] works source=', normalizedWorks ? 'normalizedWorks' : 'parseWorks', { worksCount: works.length });
        const queue = currentCandidate.blockQueues?.[blockNumber];
        // ÉTAPE 2 — GÉNÉRATION DES QUESTIONS 2B (si pas encore générées)
        if (!queue || queue.questions.length === 0) {
            // PREMIUM : un seul mode — motif + personnages (6 questions) avec meta ; pas de génération globale traits
            if (normalizedWorks && normalizedWorks.length >= 1) {
                console.log('[ORCHESTRATOR] Generating BLOC 2B premium (motif + personnages only)');
                const { questions, meta } = await this.generateMotifAndPersonnagesQuestions2B(currentCandidate, works, coreWorkAnswer);
                candidateStore.setQuestionsForBlock(candidateId, blockNumber, questions.slice(0, 6), meta.slice(0, 6));
                await candidateStore.persistAndFlush(candidateId);
                return await this.serveNextQuestion2B(candidateId, blockNumber);
            }
            // LEGACY : queue sans meta (ancien flux)
            console.log('[ORCHESTRATOR] Generating BLOC 2B legacy (full block)');
            let questions = await this.generateQuestions2B(currentCandidate, works, coreWorkAnswer);
            const validatedQuestions = await this.validateAndRetryQuestions2B(questions, works, currentCandidate, coreWorkAnswer);
            candidateStore.setQuestionsForBlock(candidateId, blockNumber, validatedQuestions);
            await candidateStore.persistAndFlush(candidateId);
            return await this.serveNextQuestion2B(candidateId, blockNumber);
        }
        // ÉTAPE 3 — RÉPONSE UTILISATEUR REÇUE (state machine : currentQuestionIndex, block2B.answers)
        if (userMessage) {
            const currentQueue = currentCandidate.blockQueues?.[blockNumber];
            if (!currentQueue) {
                throw new Error(`Queue for block ${blockNumber} not found`);
            }
            const currentQuestionIndex = currentCandidate.session.blockStates?.['2B']?.currentQuestionIndex ?? 0;
            const questionIndex = currentQuestionIndex - 1;
            if (questionIndex < 0) {
                return safeReturnMessage("Aucune question en cours. Recharge la page.", 'BLOC 2B questionIndex < 0');
            }
            // Idempotence 2B : requête doublon (ex. double tap) → retourner la prochaine question sans muter (sauf en fin de 2B où on enchaîne miroir → bloc 3)
            const queueLengthForIdem = currentQueue.questions.length;
            const block2B = candidateStore.getBlock2BAnswers(currentCandidate);
            const answersLength = block2B?.answers?.length ?? 0;
            const atEndOf2B = currentQuestionIndex >= queueLengthForIdem;
            if (!atEndOf2B && answersLength >= currentQuestionIndex) {
                console.log('[ORCHESTRATOR] BLOC 2B idempotent: answers.length >= currentQuestionIndex', {
                    answersLength,
                    currentQuestionIndex,
                });
                return await this.getNextQuestion2BContentOnly(candidateId, blockNumber);
            }
            await candidateStore.appendBlock2BAnswer(candidateId, userMessage);
            currentCandidate = candidateStore.get(candidateId) ?? await candidateStore.getAsync(candidateId);
            if (!currentCandidate) {
                throw new Error(`Candidate ${candidateId} not found after storing answer`);
            }
            let finalQueue = currentCandidate.blockQueues?.[blockNumber];
            if (!finalQueue) {
                throw new Error(`Queue for block ${blockNumber} not found after reload`);
            }
            const meta = finalQueue.meta;
            const looksLikeChoiceAE = /^[A-Ea-e]\s*[\.\)]?\s*$/.test((userMessage || '').trim());
            // P0-3 : GARDE A-E PRIORITAIRE — Détecter AVANT toute logique isPersonnagesAnswer
            if (looksLikeChoiceAE) {
                console.log('[ORCHESTRATOR] BLOC 2B: réponse A–E détectée — pas de normalisation personnages, on sert la suite');
                // Une réponse A-E ne peut JAMAIS déclencher normalisation personnages
                // → passer directement à serveNextQuestion2B
            }
            else {
                // Seulement si réponse != A-E, on vérifie si c'est une question personnages
                const isPersonnagesAnswer = meta && meta[questionIndex]?.slot === 'personnages';
                // PREMIUM : après réponse "personnages" (et pas choix A–E) → normalisation LLM + génération traits par personnage + insertion
                if (isPersonnagesAnswer && meta && currentCandidate.session.normalizedWorks) {
                    const workIndex = meta[questionIndex].workIndex;
                    const work = currentCandidate.session.normalizedWorks[workIndex]?.canonicalTitle ?? works[workIndex] ?? '';
                    const trimmed = (userMessage || '').trim().toLowerCase();
                    const okLike = ['ok', 'd\'accord', 'dac', 'oui'].includes(trimmed);
                    if (okLike) {
                        const personnagesQuestion = finalQueue.questions[questionIndex] || `Quels personnages retiennent ton attention dans « ${work} » ? Donne 1 à 3 noms ou descriptions courtes.`;
                        return {
                            response: normalizeSingleResponse(`Pour cette question, j'ai besoin des personnages : ${work}. ${personnagesQuestion}`),
                            step: BLOC_02,
                            expectsAnswer: true,
                            autoContinue: false,
                        };
                    }
                    const normChars = await this.normalizeCharactersLLM(work, userMessage);
                    if (normChars.needsClarification && normChars.message) {
                        return {
                            response: normalizeSingleResponse(normChars.message),
                            step: BLOC_02,
                            expectsAnswer: true,
                            autoContinue: false,
                        };
                    }
                    if (normChars.characters && normChars.characters.length >= 1) {
                        candidateStore.setNormalizedCharacters(candidateId, workIndex, normChars.characters);
                        const newQuestions = [];
                        const newMeta = [];
                        for (const ch of normChars.characters) {
                            const { question: q } = await this.generateTraitsForCharacterLLM(work, ch.canonicalName);
                            newQuestions.push(q);
                            newMeta.push({ workIndex, slot: 'trait' });
                        }
                        const recapLine = `Sur ${work}, dis-moi en une phrase ce qui t'a le plus marqué dans tes réponses ci-dessus.`;
                        newQuestions.push(recapLine);
                        newMeta.push({ workIndex, slot: 'recap' });
                        const nextIndex = currentCandidate.session.blockStates?.['2B']?.currentQuestionIndex ?? currentQuestionIndex + 1;
                        candidateStore.insertQuestionsAt(candidateId, blockNumber, nextIndex, newQuestions, newMeta);
                        // Stabilité : flush + reload pour que la condition miroir utilise la queue à jour (pas de queue stale)
                        await candidateStore.persistAndFlush(candidateId);
                        const reloaded = candidateStore.get(candidateId) ?? (await candidateStore.getAsync(candidateId));
                        if (!reloaded) {
                            throw new Error(`Candidate ${candidateId} not found after insertQuestionsAt`);
                        }
                        currentCandidate = reloaded;
                        finalQueue = currentCandidate.blockQueues?.[blockNumber] ?? finalQueue;
                    }
                }
            }
            // Condition miroir déterministe : queue et index depuis l'état rechargé (post-insert si besoin)
            const nextQuestionIndex = currentCandidate.session.blockStates?.['2B']?.currentQuestionIndex ?? currentQuestionIndex + 1;
            const queueLength = finalQueue.questions.length;
            if (nextQuestionIndex >= queueLength) {
                // Fin des questions 2B : miroir 2B puis enchaînement automatique vers bloc 3 (plus de validation utilisateur)
                const conversationHistory = currentCandidate.conversationHistory || [];
                const lastAssistantMessage = [...conversationHistory]
                    .reverse()
                    .find(m => m.role === 'assistant' && m.kind === 'mirror' && m.block === blockNumber);
                if (lastAssistantMessage) {
                    // Miroir déjà généré (ex. requête doublon) → idempotent : renvoyer uniquement la première question bloc 3
                    let updatedCandidate = candidateStore.get(candidateId) ?? (await candidateStore.getAsync(candidateId));
                    if (!updatedCandidate) {
                        throw new Error(`Candidate ${candidateId} not found`);
                    }
                    if (updatedCandidate.session.currentBlock !== 3) {
                        await candidateStore.setBlock2BCompleted(candidateId);
                        candidateStore.markBlockComplete(candidateId, 2);
                        candidateStore.updateSession(candidateId, { state: 'collecting', currentBlock: 3 });
                        candidateStore.updateUIState(candidateId, { step: BLOC_03, lastQuestion: null, identityDone: true });
                        await candidateStore.persistAndFlush(candidateId);
                        updatedCandidate = candidateStore.get(candidateId) ?? (await candidateStore.getAsync(candidateId));
                    }
                    if (!updatedCandidate) {
                        throw new Error(`Candidate ${candidateId} not found after advance`);
                    }
                    const nextResult = await executeAxiom({ candidate: updatedCandidate, userMessage: null, event: undefined });
                    return {
                        response: normalizeSingleResponse(nextResult.response),
                        step: nextResult.step,
                        expectsAnswer: nextResult.expectsAnswer,
                        autoContinue: false,
                    };
                }
                // Toutes les questions répondues → Générer miroir puis enchaînement auto bloc 3
                const block2BAnswers = candidateStore.getBlock2BAnswers(currentCandidate);
                const answersCount = block2BAnswers?.answers?.length ?? 0;
                if (answersCount !== nextQuestionIndex) {
                    console.warn('[ORCHESTRATOR] BLOC 2B mirror: answers.length !== nextQuestionIndex', {
                        answersCount,
                        nextQuestionIndex,
                        queueLength,
                    });
                }
                console.log('[ORCHESTRATOR] Generating BLOC 2B final mirror then auto-advance to BLOC 3', {
                    nextQuestionIndex,
                    queueLength,
                    answersCount,
                });
                const mirror = await this.generateMirror2B(currentCandidate, works, coreWorkAnswer, onChunk, onUx);
                candidateStore.appendAssistantMessage(candidateId, mirror, {
                    block: blockNumber,
                    step: BLOC_02,
                    kind: 'mirror',
                });
                await candidateStore.setBlock2BCompleted(candidateId);
                candidateStore.markBlockComplete(candidateId, 2);
                await candidateStore.persistAndFlush(candidateId);
                candidateStore.updateSession(candidateId, {
                    state: 'collecting',
                    currentBlock: 3,
                });
                candidateStore.updateUIState(candidateId, {
                    step: BLOC_03,
                    lastQuestion: null,
                    identityDone: true,
                });
                // 🔒 Transition 2B → 3 via bouton user-trigger (pattern préambule)
                console.log('[ORCHESTRATOR] Miroir 2B généré — attente bouton user pour BLOC 3');
                return {
                    response: mirror,
                    step: STEP_WAIT_BLOC_3,
                    expectsAnswer: false,
                    autoContinue: false,
                    mirror,
                };
            }
            else {
                // Il reste des questions → Servir la suivante (pas d'API)
                return await this.serveNextQuestion2B(candidateId, blockNumber);
            }
        }
        // Cas 3 : Pas de message utilisateur → Servir question suivante si disponible
        return await this.serveNextQuestion2B(candidateId, blockNumber);
    }
    /**
     * Parse les œuvres depuis la réponse utilisateur (format libre, tolérant).
     * Accepte virgules, retours ligne, points-virgules. Nettoie les espaces.
     * Retourne 1, 2 ou 3 œuvres selon le contenu (jamais de throw).
     */
    parseWorks(preferencesAnswer) {
        if (!preferencesAnswer || typeof preferencesAnswer !== 'string') {
            return [];
        }
        const raw = preferencesAnswer.trim().replace(/\s+/g, ' ');
        if (raw.length === 0) {
            return [];
        }
        const parts = raw
            .split(/[,;\n]+/)
            .map((w) => w.trim())
            .filter((w) => w.length > 0);
        if (parts.length === 0) {
            return [raw];
        }
        return parts.slice(0, 3);
    }
    /** BLOC 2A/2B PREMIUM — Normalisation LLM des œuvres (source de vérité pour 2B). */
    async normalizeWorksLLM(raw) {
        const completion = await callOpenAI({
            messages: [
                {
                    role: 'system',
                    content: `Tu es un assistant qui normalise des noms d'œuvres (séries/films) à partir d'une réponse utilisateur libre.
RÈGLES : Corrige les fautes d'orthographe. Sépare les œuvres collées ("viking suits" → Vikings + Suits si pertinent). Maximum 3 œuvres.
Réponds UNIQUEMENT par un objet JSON valide, sans markdown, sans texte autour.
Si le texte ne permet pas d'identifier 1 à 3 œuvres sans ambiguïté majeure, réponds : {"needsClarification":true,"message":"Message court et bienveillant pour demander de préciser."}
Sinon : {"works":[{"canonicalTitle":"Titre officiel","type":"series" ou "film","confidence":0.95},...]} (1 à 3 œuvres).`,
                },
                { role: 'user', content: raw || '(vide)' },
            ],
        });
        try {
            const parsed = JSON.parse(completion.replace(/^```\w*\n?|\n?```$/g, '').trim());
            if (parsed.needsClarification && parsed.message)
                return { needsClarification: true, message: parsed.message };
            if (Array.isArray(parsed.works) && parsed.works.length >= 1 && parsed.works.length <= 3) {
                return { works: parsed.works.slice(0, 3) };
            }
        }
        catch {
            /* ignore */
        }
        return { needsClarification: true, message: "Je n'ai pas bien saisi tes œuvres. Peux-tu me donner 1 à 3 séries ou films (ex. : Breaking Bad, Dark, Suits) ?" };
    }
    /** BLOC 2B PREMIUM — Normalisation LLM des personnages (résolution descriptions indirectes). Réponses et messages de clarification en français uniquement. */
    async normalizeCharactersLLM(work, rawAnswer) {
        const completion = await callOpenAI({
            messages: [
                {
                    role: 'system',
                    content: `Tu es un assistant francophone. Tu identifies les personnages d'une œuvre à partir d'une réponse utilisateur (noms partiels, descriptions comme "le fils de X").
Œuvre : ${work}
RÈGLES : Résous les descriptions en noms canoniques. Corrige les fautes. Maximum 3 personnages.
Réponds UNIQUEMENT en français par un objet JSON valide : {"characters":[{"canonicalName":"Nom complet","confidence":0.9},...]}
Si ambiguïté ou réponse insuffisante : {"needsClarification":true,"message":"Message court EN FRANÇAIS pour demander les noms des personnages (ex. : Peux-tu me donner 1 à 3 noms de personnages ?)"}`,
                },
                { role: 'user', content: rawAnswer || '(vide)' },
            ],
        });
        const fixMessageFR = (msg) => {
            if (!msg || typeof msg !== 'string')
                return "Peux-tu me donner les noms des personnages (1 à 3) pour cette œuvre ?";
            if (/please|provide|describe|character|name/i.test(msg))
                return "Peux-tu me donner les noms des personnages (1 à 3) pour cette œuvre ?";
            return msg;
        };
        try {
            const parsed = JSON.parse(completion.replace(/^```\w*\n?|\n?```$/g, '').trim());
            if (parsed.needsClarification && parsed.message)
                return { needsClarification: true, message: fixMessageFR(parsed.message) };
            if (Array.isArray(parsed.characters) && parsed.characters.length >= 1 && parsed.characters.length <= 3) {
                return { characters: parsed.characters.slice(0, 3) };
            }
        }
        catch {
            /* ignore */
        }
        return { needsClarification: true, message: "Peux-tu me donner les noms des personnages (ex. : Harvey, Mike, Donna) ?" };
    }
    /** Extrait le premier tableau JSON [...] du texte (ignore préambule markdown/commentaire). */
    extractFirstJsonArray(raw) {
        const start = raw.indexOf('[');
        if (start === -1)
            return raw;
        let depth = 0;
        for (let i = start; i < raw.length; i++) {
            if (raw[i] === '[')
                depth++;
            else if (raw[i] === ']') {
                depth--;
                if (depth === 0)
                    return raw.slice(start, i + 1);
            }
        }
        return raw;
    }
    /**
     * BLOC 2B PREMIUM — Génère les 6 questions motif + personnages avec sortie structurée.
     * Température basse, prompt JSON strict, extraction du premier [...], retry si parse échoue.
     * Fallback : génération motif personnalisée par œuvre (LLM) + personnages avec titre.
     */
    async generateMotifAndPersonnagesQuestions2B(candidate, works, coreWork) {
        const w0 = works[0] || 'N/A';
        const w1 = works[1] || 'N/A';
        const w2 = works[2] || 'N/A';
        const canonicalMeta = [
            { workIndex: 2, slot: 'motif' },
            { workIndex: 2, slot: 'personnages' },
            { workIndex: 1, slot: 'motif' },
            { workIndex: 1, slot: 'personnages' },
            { workIndex: 0, slot: 'motif' },
            { workIndex: 0, slot: 'personnages' },
        ];
        const workOrder = { 2: 0, 1: 1, 0: 2 };
        const slotOrder = { motif: 0, personnages: 1 };
        const systemPrompt = `BLOC 2B — Génère UNIQUEMENT 6 questions (motif + personnages).
Œuvres (écris les titres SANS crochets dans les questions) : #1 ${w0}, #2 ${w1}, #3 ${w2}. Œuvre noyau : ${coreWork}

RÈGLE : Dans le texte des questions, écris toujours le titre de l'œuvre SANS crochets (ex: "dans ${w0}" pas "dans [${w0}]").
PERSONNALISATION OBLIGATOIRE : Les 5 options A à E des questions motif doivent être SPÉCIFIQUES à chaque œuvre (thème, univers, intrigue selon la série/film). Interdit de mettre les mêmes 5 options pour les 3 œuvres. Chaque question personnages doit citer explicitement le titre (ex: "Dans ${w0}, quels sont...").

Réponds UNIQUEMENT par le tableau JSON. Aucun texte avant ou après. Aucun markdown.
Format exact : un tableau de 6 objets avec "slot" ("motif" ou "personnages"), "workIndex" (0, 1 ou 2), "text" (question complète ; motif = question + 5 options A à E).
Ordre : motif #1, personnages #1, motif #2, personnages #2, motif #3, personnages #3.`;
        const messages = buildConversationHistoryForBlock2B(candidate);
        let completion = await callOpenAI({
            messages: [
                { role: 'system', content: getFullAxiomPrompt() },
                { role: 'system', content: systemPrompt },
                ...messages,
            ],
            temperature: 0.6,
        });
        let raw = completion.replace(/^```\w*\n?|\n?```$/g, '').trim();
        raw = this.extractFirstJsonArray(raw);
        const tryParse = () => {
            try {
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed) || parsed.length < 6)
                    return null;
                const items = parsed.slice(0, 6).map((item) => ({
                    workIndex: typeof item.workIndex === 'number' && item.workIndex >= 0 && item.workIndex <= 2 ? item.workIndex : 0,
                    slot: item.slot === 'personnages' ? 'personnages' : 'motif',
                    text: (item.text || '').trim(),
                }));
                items.sort((a, b) => {
                    const orderA = workOrder[a.workIndex] ?? 0;
                    const orderB = workOrder[b.workIndex] ?? 0;
                    if (orderA !== orderB)
                        return orderA - orderB;
                    return (slotOrder[a.slot] ?? 0) - (slotOrder[b.slot] ?? 0);
                });
                const questions = items.map((i) => i.text).filter((t) => t.length > 0);
                const metaFromLLM = items.map((i) => ({ workIndex: i.workIndex, slot: i.slot }));
                if (questions.length < 6 || metaFromLLM.length < 6)
                    return null;
                const q6 = questions.slice(0, 6);
                const m6 = metaFromLLM.slice(0, 6);
                const questionsSansCrochets = this.stripWorkBracketsFromQuestions(q6, works);
                // P0-1 : ALIGNEMENT META / ORDRE RÉEL QUESTIONS
                // Ne PAS faire confiance au meta LLM, détecter dynamiquement le type de chaque question
                const detectedMeta = [];
                for (let i = 0; i < questionsSansCrochets.length; i++) {
                    const q = questionsSansCrochets[i];
                    const isMotif = /Qu'est-ce qui t'attire.*\n.*A\./i.test(q) || /A\.\s*\S/i.test(q);
                    const isPersonnages = /quels sont les.*personnages/i.test(q) || /personnages qui te parlent/i.test(q);
                    if (isMotif) {
                        // Déduire workIndex depuis titre œuvre mentionné dans question
                        let detectedWorkIndex = m6[i]?.workIndex ?? 0;
                        for (let wIdx = 0; wIdx < works.length; wIdx++) {
                            const workTitle = works[wIdx];
                            if (workTitle && q.includes(workTitle)) {
                                detectedWorkIndex = wIdx;
                                break;
                            }
                        }
                        detectedMeta.push({ workIndex: detectedWorkIndex, slot: 'motif' });
                    }
                    else if (isPersonnages) {
                        // Déduire workIndex depuis titre œuvre mentionné
                        let detectedWorkIndex = m6[i]?.workIndex ?? 0;
                        for (let wIdx = 0; wIdx < works.length; wIdx++) {
                            const workTitle = works[wIdx];
                            if (workTitle && q.includes(workTitle)) {
                                detectedWorkIndex = wIdx;
                                break;
                            }
                        }
                        detectedMeta.push({ workIndex: detectedWorkIndex, slot: 'personnages' });
                    }
                    else {
                        // Fallback : conserver meta LLM
                        detectedMeta.push(m6[i] || { workIndex: 0, slot: 'motif' });
                    }
                }
                const firstQ = questionsSansCrochets[0] || '';
                if (!this.hasMotifAE(firstQ)) {
                    questionsSansCrochets[0] = this.ensureMotifAEFormat(firstQ, works[detectedMeta[0]?.workIndex ?? 0]);
                }
                console.log('[ORCHESTRATOR] P0-1: Meta aligné dynamiquement avec ordre réel questions', {
                    detectedMeta: detectedMeta.map(m => m.slot)
                });
                return { questions: questionsSansCrochets, meta: detectedMeta };
            }
            catch {
                return null;
            }
        };
        let result = tryParse();
        if (result)
            return result;
        // Retry unique avec prompt simplifié + température 0.2
        console.warn('[ORCHESTRATOR] BLOC 2B premium: retry JSON après échec parse');
        const retryPrompt = `Réponds UNIQUEMENT par un tableau JSON de 6 objets. Chaque objet : {"slot":"motif" ou "personnages","workIndex":0|1|2,"text":"question complète"}.
Œuvres : 1=${w0}, 2=${w1}, 3=${w2}. Ordre : motif1, personnages1, motif2, personnages2, motif3, personnages3. Aucun texte avant ou après le tableau.`;
        completion = await callOpenAI({
            messages: [
                { role: 'system', content: getFullAxiomPrompt() },
                { role: 'system', content: retryPrompt },
                ...messages,
            ],
            temperature: 0.6,
        });
        raw = completion.replace(/^```\w*\n?|\n?```$/g, '').trim();
        raw = this.extractFirstJsonArray(raw);
        result = tryParse();
        if (result)
            return result;
        // P0-2 : FALLBACK 2B ROBUSTE — Validation spécificité motifs obligatoire
        console.warn('[ORCHESTRATOR] BLOC 2B premium: fallback personnalisé (motif LLM + personnages titre)');
        // Générer motifs avec retry individuel si validation échoue
        const motifQuestions = [];
        for (const [idx, workTitle] of [works[2] ?? w2, works[1] ?? w1, works[0] ?? w0].entries()) {
            let motifQ = await this.generateOneMotifQuestionForWork(workTitle);
            // Retry individuel si motif ne contient pas 5 options A-E
            if (!this.hasMotifAE(motifQ)) {
                console.warn(`[ORCHESTRATOR] P0-2: Motif œuvre ${workTitle} invalide, retry`);
                motifQ = await this.generateOneMotifQuestionForWork(workTitle);
                if (!this.hasMotifAE(motifQ)) {
                    console.error(`[ORCHESTRATOR] P0-2: Motif œuvre ${workTitle} invalide après retry, fallback déterministe`);
                    motifQ = this.ensureMotifAEFormat('', workTitle);
                }
            }
            motifQuestions.push(motifQ);
        }
        // Validation spécificité motifs (similarité < 70%)
        const motifsValidation = validateMotifsSpecificity(motifQuestions[0], motifQuestions[1], motifQuestions[2]);
        if (!motifsValidation.valid) {
            console.error('[ORCHESTRATOR] P0-2: Fallback motifs validation échouée (FAIL-HARD)', motifsValidation.error);
            throw new Error(`BLOC 2B fallback échoué: motifs non spécifiques. ${motifsValidation.error}`);
        }
        console.log('[ORCHESTRATOR] P0-2: Fallback motifs validés avec succès (spécificité garantie)');
        const persoQuestions = [
            `Dans « ${works[2] ?? w2} », quels sont les 1 à 3 personnages qui te parlent le plus ?`,
            `Dans « ${works[1] ?? w1} », quels sont les 1 à 3 personnages qui te parlent le plus ?`,
            `Dans « ${works[0] ?? w0} », quels sont les 1 à 3 personnages qui te parlent le plus ?`,
        ];
        const fallbackQuestions = [
            motifQuestions[0],
            persoQuestions[0],
            motifQuestions[1],
            persoQuestions[1],
            motifQuestions[2],
            persoQuestions[2],
        ];
        // P0-1 : Construire meta dynamiquement (fallback connaît l'ordre)
        const fallbackMeta = [
            { workIndex: 2, slot: 'motif' },
            { workIndex: 2, slot: 'personnages' },
            { workIndex: 1, slot: 'motif' },
            { workIndex: 1, slot: 'personnages' },
            { workIndex: 0, slot: 'motif' },
            { workIndex: 0, slot: 'personnages' },
        ];
        return { questions: this.stripWorkBracketsFromQuestions(fallbackQuestions, works), meta: fallbackMeta };
    }
    /** Génère une seule question motif (avec 5 options A–E) personnalisée pour une œuvre. */
    async generateOneMotifQuestionForWork(work) {
        const title = work || 'N/A';
        try {
            const completion = await callOpenAI({
                messages: [
                    {
                        role: 'system',
                        content: `Tu génères UNE question pour le bloc 2B : "Qu'est-ce qui t'attire le PLUS dans « ${title} » ?" avec exactement 5 options A, B, C, D, E spécifiques à cette œuvre (thème, personnages, univers, intrigue, émotion). Réponds UNIQUEMENT par la question suivie des 5 lignes A. ... B. ... C. ... D. ... E. ... Sans préambule.`,
                    },
                    { role: 'user', content: `Œuvre : ${title}.` },
                ],
                temperature: 0.35,
            });
            const text = completion.trim();
            if (this.hasMotifAE(text))
                return text;
        }
        catch {
            /* ignore */
        }
        return this.ensureMotifAEFormat('', title);
    }
    /** Enlève les crochets autour des titres d'œuvre dans le texte des questions (ex: [Suits] → Suits). */
    stripWorkBracketsFromQuestions(questions, works) {
        return questions.map((q) => {
            let out = q;
            for (const w of works) {
                if (w && w !== 'N/A')
                    out = out.replace(new RegExp(`\\[${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'g'), w);
            }
            return out;
        });
    }
    defaultMetaForSixQuestions() {
        return [
            { workIndex: 2, slot: 'motif' },
            { workIndex: 2, slot: 'personnages' },
            { workIndex: 1, slot: 'motif' },
            { workIndex: 1, slot: 'personnages' },
            { workIndex: 0, slot: 'motif' },
            { workIndex: 0, slot: 'personnages' },
        ];
    }
    hasMotifAE(text) {
        const t = text || '';
        return /A\s*[\.\)]\s*\S/.test(t) && /B\s*[\.\)]\s*\S/.test(t) && /[CDE]\s*[\.\)]\s*\S/.test(t);
    }
    ensureMotifAEFormat(question, work) {
        if (this.hasMotifAE(question))
            return question;
        const intro = `Qu'est-ce qui t'attire le PLUS dans « ${work} » ?`;
        const lines = ['A. Le thème central', 'B. Les personnages', 'C. L\'univers', 'D. L\'intrigue', 'E. L\'émotion'];
        return `${intro}\n\n${lines.join('\n')}`;
    }
    rebuildQuestionsCanonical(questions, canonicalMeta, works) {
        const motifRe = /Qu'est-ce qui t'attire|attire le PLUS dans|A\s*[\.\)]\s*\S/i;
        const motifQs = questions.filter((q) => motifRe.test(q));
        const persoQs = questions.filter((q) => !motifRe.test(q));
        const m = [motifQs[0], motifQs[1], motifQs[2]].filter(Boolean);
        const p = [persoQs[0], persoQs[1], persoQs[2]].filter(Boolean);
        const out = [];
        for (const entry of canonicalMeta) {
            if (entry.slot === 'motif')
                out.push(m[2 - entry.workIndex] || this.ensureMotifAEFormat('', works[entry.workIndex] ?? ''));
            else
                out.push(p[2 - entry.workIndex] || `Quels personnages retiennent ton attention dans « ${works[entry.workIndex] ?? ''} » ? Décris-les brièvement.`);
        }
        return out.slice(0, 6);
    }
    /** BLOC 2B PREMIUM — Génère une question traits + 5 options pour un personnage (nom canonique déjà connu). */
    async generateTraitsForCharacterLLM(work, character, _context) {
        const defaultQuestion = `Qu'est-ce que tu apprécies le PLUS chez ${character} dans « ${work} » ?\n\nA. Sa présence\nB. Son rôle\nC. Ses choix\nD. Son impact\nE. Son parcours`;
        const defaultOpts = ['Sa présence', 'Son rôle', 'Ses choix', 'Son impact', 'Son parcours'];
        const parseResponse = (raw) => {
            try {
                const cleaned = raw.replace(/^```\w*\n?|\n?```$/g, '').trim();
                const start = cleaned.indexOf('{');
                if (start === -1)
                    return null;
                const end = cleaned.lastIndexOf('}');
                if (end < start)
                    return null;
                const parsed = JSON.parse(cleaned.slice(start, end + 1));
                const q = typeof parsed.question === 'string' ? parsed.question : `Qu'est-ce que tu apprécies le PLUS chez ${character} dans « ${work} » ?`;
                const opts = Array.isArray(parsed.options) && parsed.options.length >= 5 ? parsed.options.slice(0, 5) : defaultOpts;
                const lines = opts.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`);
                return { question: `${q}\n\n${lines.join('\n')}`, options: opts };
            }
            catch {
                return null;
            }
        };
        let completion = await callOpenAI({
            messages: [
                {
                    role: 'system',
                    content: `Tu génères une question de type "traits" pour un personnage d'une œuvre. La question doit mentionner explicitement l'œuvre et le personnage (ex: "chez ${character} dans « ${work} »"). Réponds UNIQUEMENT en JSON : {"question":"...","options":["A","B","C","D","E"]}. Les 5 options doivent être spécifiques à ${character} dans ${work}. Pas de markdown.`,
                },
                { role: 'user', content: `Œuvre : ${work}. Personnage : ${character}.` },
            ],
            temperature: 0.4,
        });
        let out = parseResponse(completion);
        if (out)
            return out;
        completion = await callOpenAI({
            messages: [
                { role: 'system', content: `Réponds UNIQUEMENT en JSON : {"question":"Qu'est-ce que tu apprécies chez ${character} dans ${work} ?","options":["opt1","opt2","opt3","opt4","opt5"]}. 5 options spécifiques au personnage.` },
                { role: 'user', content: `Œuvre : ${work}. Personnage : ${character}.` },
            ],
            temperature: 0.2,
        });
        out = parseResponse(completion);
        if (out)
            return out;
        return { question: defaultQuestion, options: defaultOpts };
    }
    /**
     * Génère toutes les questions BLOC 2B en une seule fois (LEGACY — utilisé seulement si queue sans meta)
     */
    async generateQuestions2B(candidate, works, coreWork) {
        const messages = buildConversationHistoryForBlock2B(candidate);
        const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
        const completion = await callOpenAI({
            messages: [
                { role: 'system', content: FULL_AXIOM_PROMPT },
                {
                    role: 'system',
                    content: `RÈGLE ABSOLUE AXIOM — BLOC 2B (CRITIQUE) :

Tu es en état BLOC_02 (BLOC 2B - Analyse projective).

ŒUVRES DU CANDIDAT :
- Œuvre #3 : ${works[2] || 'N/A'}
- Œuvre #2 : ${works[1] || 'N/A'}
- Œuvre #1 : ${works[0] || 'N/A'}
- Œuvre noyau : ${coreWork}

⚠️ RÈGLES ABSOLUES (NON NÉGOCIABLES) :

1. AUCUNE question générique n'est autorisée.
2. Chaque série/film a ses propres MOTIFS, générés par AXIOM.
3. Chaque personnage a ses propres TRAITS, générés par AXIOM.
4. Les propositions doivent être :
   - spécifiques à l'œuvre ou au personnage,
   - crédibles,
   - distinctes entre elles.
5. AXIOM n'utilise JAMAIS une liste standard réutilisable.
6. 1 choix obligatoire par question (sauf "je passe" explicite).

🟦 DÉROULÉ STRICT (POUR CHAQUE ŒUVRE, dans l'ordre #3 → #2 → #1) :

ÉTAPE 1 — MOTIF PRINCIPAL :
Pour chaque œuvre, génère la question : "Qu'est-ce qui t'attire le PLUS dans [NOM DE L'ŒUVRE] ?"
Génère 5 propositions UNIQUES, spécifiques à cette œuvre.
Ces propositions doivent représenter réellement l'œuvre (ascension, décor, ambiance, relations, rythme, morale, stratégie, quotidien, chaos, etc.).
AXIOM choisit les axes pertinents, œuvre par œuvre.
Format : A / B / C / D / E (1 lettre attendue)

⚠️ CRITIQUE : Les 5 propositions pour l'Œuvre #3 doivent être DIFFÉRENTES des propositions pour l'Œuvre #2, qui doivent être DIFFÉRENTES de celles pour l'Œuvre #1.
Chaque œuvre a ses propres axes d'attraction.

ÉTAPE 2 — PERSONNAGES PRÉFÉRÉS (1 à 3) :
Pour chaque œuvre, génère la question : "Dans [NOM DE L'ŒUVRE], quels sont les 1 à 3 personnages qui te parlent le plus ?"
Format : Question ouverte (pas de choix multiples).

ÉTAPE 3 — TRAIT DOMINANT (PERSONNALISÉ À CHAQUE PERSONNAGE) :
Pour CHAQUE personnage cité (1 à 3 par œuvre), génère la question : "Chez [NOM DU PERSONNAGE], qu'est-ce que tu apprécies le PLUS ?"
Génère 5 TRAITS SPÉCIFIQUES À CE PERSONNAGE, qui :
- correspondent à son rôle réel dans l'œuvre,
- couvrent des dimensions différentes (émotionnelle, stratégique, relationnelle, morale, comportementale),
- ne sont PAS recyclables pour un autre personnage.

⚠️ CRITIQUE : Les traits pour le Personnage A de l'Œuvre #3 doivent être DIFFÉRENTS des traits pour le Personnage B de l'Œuvre #3, qui doivent être DIFFÉRENTS des traits pour le Personnage A de l'Œuvre #2.
Chaque personnage a ses propres traits uniques.

Format : A / B / C / D / E (1 seule réponse possible)

ÉTAPE 4 — MICRO-RÉCAP ŒUVRE (factuel, 1-2 lignes) :
Après motifs + personnages + traits pour une œuvre, génère un résumé factuel :
"Sur [ŒUVRE], tu es surtout attiré par [motif choisi], et par des personnages que tu valorises pour [traits dominants observés]."

Format de sortie OBLIGATOIRE :
---QUESTION_SEPARATOR---
[Question motif Œuvre #3]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #3]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #3]
---QUESTION_SEPARATOR---
[Question motif Œuvre #2]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #2]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #2]
---QUESTION_SEPARATOR---
[Question motif Œuvre #1]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #1]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #1]`
                },
                ...messages,
            ],
        });
        // Parser les questions
        let questions = completion
            .split('---QUESTION_SEPARATOR---')
            .map(q => q.trim())
            .filter(q => q.length > 0);
        // Validation réconciliation personnages (C6)
        const characterValidation = this.validateCharacterNames(questions);
        if (!characterValidation.valid) {
            console.warn('[ORCHESTRATOR] Character names validation failed, retry with reinforced prompt');
            // Retry avec prompt renforcé mentionnant explicitement réconciliation
            questions = await this.generateQuestions2BWithReconciliation(candidate, works, coreWork);
        }
        return questions;
    }
    /**
     * Valide que les noms de personnages sont canoniques (pas de descriptions)
     */
    validateCharacterNames(questions) {
        // Détecter descriptions au lieu de noms canoniques
        const descriptions = ['le chef', 'son associée', 'celui qui', 'l\'autre frère', 'l\'autre', 'celui', 'celle'];
        const hasDescriptions = questions.some(q => descriptions.some(desc => q.toLowerCase().includes(desc)));
        if (hasDescriptions) {
            return {
                valid: false,
                error: 'Descriptions détectées au lieu de noms canoniques'
            };
        }
        return { valid: true };
    }
    /**
     * Génère les questions BLOC 2B avec prompt renforcé pour réconciliation personnages
     */
    async generateQuestions2BWithReconciliation(candidate, works, coreWork) {
        const messages = buildConversationHistoryForBlock2B(candidate);
        const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
        const completion = await callOpenAI({
            messages: [
                { role: 'system', content: FULL_AXIOM_PROMPT },
                {
                    role: 'system',
                    content: `RÈGLE ABSOLUE AXIOM — BLOC 2B (CRITIQUE — RETRY RÉCONCILIATION) :

Tu es en état BLOC_02 (BLOC 2B - Analyse projective).

ŒUVRES DU CANDIDAT :
- Œuvre #3 : ${works[2] || 'N/A'}
- Œuvre #2 : ${works[1] || 'N/A'}
- Œuvre #1 : ${works[0] || 'N/A'}
- Œuvre noyau : ${coreWork}

⚠️ RÈGLE CRITIQUE — RÉCONCILIATION PERSONNAGES (NON NÉGOCIABLE) :

Si le candidat décrit un personnage (ex: "le chef", "son associée", "celui qui ne ment jamais"),
AXIOM DOIT :
- identifier sans ambiguïté le personnage correspondant dans l'œuvre,
- remplacer la description par le NOM CANONIQUE officiel du personnage,
- utiliser exclusivement ce nom canonique dans toutes les questions suivantes.

EXEMPLES :
- "le chef" → "Tommy Shelby" (Peaky Blinders)
- "son associée" → "Alicia Florrick" (The Good Wife)
- "celui qui ne ment jamais" → "Ned Stark" (Game of Thrones)

⚠️ INTERDICTIONS :
- JAMAIS utiliser de descriptions floues dans les questions
- JAMAIS utiliser "l'autre", "celui", "celle" sans nom
- TOUJOURS utiliser le nom complet et officiel du personnage

⚠️ RÈGLES ABSOLUES (NON NÉGOCIABLES) :

1. AUCUNE question générique n'est autorisée.
2. Chaque série/film a ses propres MOTIFS, générés par AXIOM.
3. Chaque personnage a ses propres TRAITS, générés par AXIOM.
4. Les propositions doivent être :
   - spécifiques à l'œuvre ou au personnage,
   - crédibles,
   - distinctes entre elles.
5. AXIOM n'utilise JAMAIS une liste standard réutilisable.
6. 1 choix obligatoire par question (sauf "je passe" explicite).

🟦 DÉROULÉ STRICT (POUR CHAQUE ŒUVRE, dans l'ordre #3 → #2 → #1) :

ÉTAPE 1 — MOTIF PRINCIPAL :
Pour chaque œuvre, génère la question : "Qu'est-ce qui t'attire le PLUS dans [NOM DE L'ŒUVRE] ?"
Génère 5 propositions UNIQUES, spécifiques à cette œuvre.
Ces propositions doivent représenter réellement l'œuvre (ascension, décor, ambiance, relations, rythme, morale, stratégie, quotidien, chaos, etc.).
AXIOM choisit les axes pertinents, œuvre par œuvre.
Format : A / B / C / D / E (1 lettre attendue)

⚠️ CRITIQUE : Les 5 propositions pour l'Œuvre #3 doivent être DIFFÉRENTES des propositions pour l'Œuvre #2, qui doivent être DIFFÉRENTES de celles pour l'Œuvre #1.
Chaque œuvre a ses propres axes d'attraction.

ÉTAPE 2 — PERSONNAGES PRÉFÉRÉS (1 à 3) :
Pour chaque œuvre, génère la question : "Dans [NOM DE L'ŒUVRE], quels sont les 1 à 3 personnages qui te parlent le plus ?"
Format : Question ouverte (pas de choix multiples).

ÉTAPE 3 — TRAIT DOMINANT (PERSONNALISÉ À CHAQUE PERSONNAGE) :
Pour CHAQUE personnage cité (1 à 3 par œuvre), génère la question : "Chez [NOM DU PERSONNAGE], qu'est-ce que tu apprécies le PLUS ?"
⚠️ IMPORTANT : Utilise TOUJOURS le NOM CANONIQUE du personnage, jamais une description.
Génère 5 TRAITS SPÉCIFIQUES À CE PERSONNAGE, qui :
- correspondent à son rôle réel dans l'œuvre,
- couvrent des dimensions différentes (émotionnelle, stratégique, relationnelle, morale, comportementale),
- ne sont PAS recyclables pour un autre personnage.

⚠️ CRITIQUE : Les traits pour le Personnage A de l'Œuvre #3 doivent être DIFFÉRENTS des traits pour le Personnage B de l'Œuvre #3, qui doivent être DIFFÉRENTS des traits pour le Personnage A de l'Œuvre #2.
Chaque personnage a ses propres traits uniques.

Format : A / B / C / D / E (1 seule réponse possible)

ÉTAPE 4 — MICRO-RÉCAP ŒUVRE (factuel, 1-2 lignes) :
Après motifs + personnages + traits pour une œuvre, génère un résumé factuel :
"Sur [ŒUVRE], tu es surtout attiré par [motif choisi], et par des personnages que tu valorises pour [traits dominants observés]."

Format de sortie OBLIGATOIRE :
---QUESTION_SEPARATOR---
[Question motif Œuvre #3]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #3]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #3]
---QUESTION_SEPARATOR---
[Question motif Œuvre #2]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #2]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #2]
---QUESTION_SEPARATOR---
[Question motif Œuvre #1]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #1]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #1]`
                },
                ...messages,
            ],
        });
        // Parser les questions
        const questions = completion
            .split('---QUESTION_SEPARATOR---')
            .map(q => q.trim())
            .filter(q => q.length > 0);
        return questions;
    }
    /**
     * Valide et retry les questions BLOC 2B si nécessaire (FAIL-FAST QUALITATIF)
     *
     * RÈGLE ABSOLUE : Aucune question générique ne peut être servie.
     * Si validation échoue → retry (max 1) → si échec → erreur assumée (pas de questions servies)
     */
    async validateAndRetryQuestions2B(questions, works, candidate, coreWork) {
        // Extraire motifs et traits pour validation
        const motifs = [];
        const traits = [];
        // Parser questions pour extraire motifs (une par œuvre) et traits
        for (const question of questions) {
            if (question.includes('Qu\'est-ce qui t\'attire le PLUS dans')) {
                motifs.push(question);
            }
            else if (question.includes('Chez') && question.includes('qu\'est-ce que tu apprécies')) {
                traits.push(question);
            }
        }
        // Validation motifs (besoin de 3 motifs, un par œuvre)
        let motifsValid = true;
        if (motifs.length >= 3) {
            const motifsValidation = validateMotifsSpecificity(motifs[0], motifs[1], motifs[2]);
            if (!motifsValidation.valid) {
                console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] reason=motifs', motifsValidation.error);
                motifsValid = false;
            }
        }
        else {
            console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] reason=motifs - Less than 3 motifs found');
            motifsValid = false;
        }
        // Validation traits (si on a des traits)
        let traitsValid = true;
        if (traits.length >= 3) {
            // Grouper traits par œuvre (approximation)
            const traitsWork1 = traits.slice(0, Math.floor(traits.length / 3));
            const traitsWork2 = traits.slice(Math.floor(traits.length / 3), Math.floor(traits.length * 2 / 3));
            const traitsWork3 = traits.slice(Math.floor(traits.length * 2 / 3));
            const traitsValidation = validateTraitsSpecificity(traitsWork1, traitsWork2, traitsWork3);
            if (!traitsValidation.valid) {
                console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] reason=traits', traitsValidation.error);
                traitsValid = false;
            }
        }
        else if (traits.length > 0) {
            // Si on a des traits mais moins de 3, on considère que c'est valide (peut être normal selon nombre de personnages)
            traitsValid = true;
        }
        // Si validation réussit → retourner questions
        if (motifsValid && traitsValid) {
            return questions;
        }
        // Si validation échoue → RETRY (max 1)
        console.log('[ORCHESTRATOR] [2B_RETRY_TRIGGERED] retry=1');
        // Retry avec prompt renforcé
        const retryQuestions = await this.generateQuestions2BWithRetry(candidate, works, coreWork, {
            motifsFailed: !motifsValid,
            traitsFailed: !traitsValid
        });
        // Re-valider après retry
        const retryMotifs = [];
        const retryTraits = [];
        for (const question of retryQuestions) {
            if (question.includes('Qu\'est-ce qui t\'attire le PLUS dans')) {
                retryMotifs.push(question);
            }
            else if (question.includes('Chez') && question.includes('qu\'est-ce que tu apprécies')) {
                retryTraits.push(question);
            }
        }
        let retryMotifsValid = true;
        if (retryMotifs.length >= 3) {
            const retryMotifsValidation = validateMotifsSpecificity(retryMotifs[0], retryMotifs[1], retryMotifs[2]);
            if (!retryMotifsValidation.valid) {
                console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] fatal=true reason=motifs (after retry)', retryMotifsValidation.error);
                retryMotifsValid = false;
            }
        }
        else {
            console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] fatal=true reason=motifs (after retry) - Less than 3 motifs found');
            retryMotifsValid = false;
        }
        let retryTraitsValid = true;
        if (retryTraits.length >= 3) {
            const retryTraitsWork1 = retryTraits.slice(0, Math.floor(retryTraits.length / 3));
            const retryTraitsWork2 = retryTraits.slice(Math.floor(retryTraits.length / 3), Math.floor(retryTraits.length * 2 / 3));
            const retryTraitsWork3 = retryTraits.slice(Math.floor(retryTraits.length * 2 / 3));
            const retryTraitsValidation = validateTraitsSpecificity(retryTraitsWork1, retryTraitsWork2, retryTraitsWork3);
            if (!retryTraitsValidation.valid) {
                console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] fatal=true reason=traits (after retry)', retryTraitsValidation.error);
                retryTraitsValid = false;
            }
        }
        // Si retry échoue aussi → ERREUR ASSUMÉE (pas de questions servies)
        if (!retryMotifsValid || !retryTraitsValid) {
            const failedReasons = [];
            if (!retryMotifsValid)
                failedReasons.push('motifs');
            if (!retryTraitsValid)
                failedReasons.push('traits');
            throw new Error(`BLOC 2B validation failed after retry. Reasons: ${failedReasons.join(', ')}. Cannot serve generic questions.`);
        }
        // Si retry réussit → retourner questions retry
        return retryQuestions;
    }
    /**
     * Génère les questions BLOC 2B avec prompt renforcé (retry)
     */
    async generateQuestions2BWithRetry(candidate, works, coreWork, failedValidations) {
        const messages = buildConversationHistoryForBlock2B(candidate);
        const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
        const failedReasons = [];
        if (failedValidations.motifsFailed)
            failedReasons.push('motifs trop similaires entre œuvres');
        if (failedValidations.traitsFailed)
            failedReasons.push('traits trop similaires entre personnages');
        const completion = await callOpenAI({
            messages: [
                { role: 'system', content: FULL_AXIOM_PROMPT },
                {
                    role: 'system',
                    content: `RÈGLE ABSOLUE AXIOM — BLOC 2B (RETRY - FORMAT STRICT) :

La génération précédente a échoué la validation sémantique.
Raisons : ${failedReasons.join(', ')}.

Tu es en état BLOC_02 (BLOC 2B - Analyse projective).

ŒUVRES DU CANDIDAT :
- Œuvre #3 : ${works[2] || 'N/A'}
- Œuvre #2 : ${works[1] || 'N/A'}
- Œuvre #1 : ${works[0] || 'N/A'}
- Œuvre noyau : ${coreWork}

⚠️ RÈGLES ABSOLUES (NON NÉGOCIABLES) :

1. AUCUNE question générique n'est autorisée.
2. Chaque série/film a ses propres MOTIFS, générés par AXIOM.
3. Chaque personnage a ses propres TRAITS, générés par AXIOM.
4. Les propositions doivent être :
   - spécifiques à l'œuvre ou au personnage,
   - crédibles,
   - distinctes entre elles.
5. AXIOM n'utilise JAMAIS une liste standard réutilisable.

⚠️ CRITIQUE — SPÉCIFICITÉ OBLIGATOIRE :

- Les 5 propositions de motifs pour l'Œuvre #3 DOIVENT être DIFFÉRENTES de celles pour l'Œuvre #2, qui DOIVENT être DIFFÉRENTES de celles pour l'Œuvre #1.
- Les traits pour le Personnage A de l'Œuvre #3 DOIVENT être DIFFÉRENTS des traits pour le Personnage B de l'Œuvre #3, qui DOIVENT être DIFFÉRENTS des traits pour le Personnage A de l'Œuvre #2.
- Chaque œuvre a ses propres axes d'attraction UNIQUES.
- Chaque personnage a ses propres traits UNIQUES, non recyclables.

🟦 DÉROULÉ STRICT (POUR CHAQUE ŒUVRE, dans l'ordre #3 → #2 → #1) :

ÉTAPE 1 — MOTIF PRINCIPAL :
Pour chaque œuvre, génère la question : "Qu'est-ce qui t'attire le PLUS dans [NOM DE L'ŒUVRE] ?"
Génère 5 propositions UNIQUES, spécifiques à cette œuvre.
Ces propositions doivent représenter réellement l'œuvre (ascension, décor, ambiance, relations, rythme, morale, stratégie, quotidien, chaos, etc.).
AXIOM choisit les axes pertinents, œuvre par œuvre.
Format : A / B / C / D / E (1 lettre attendue)

ÉTAPE 2 — PERSONNAGES PRÉFÉRÉS (1 à 3) :
Pour chaque œuvre, génère la question : "Dans [NOM DE L'ŒUVRE], quels sont les 1 à 3 personnages qui te parlent le plus ?"
Format : Question ouverte (pas de choix multiples).

ÉTAPE 3 — TRAIT DOMINANT (PERSONNALISÉ À CHAQUE PERSONNAGE) :
Pour CHAQUE personnage cité (1 à 3 par œuvre), génère la question : "Chez [NOM DU PERSONNAGE], qu'est-ce que tu apprécies le PLUS ?"
Génère 5 TRAITS SPÉCIFIQUES À CE PERSONNAGE, qui :
- correspondent à son rôle réel dans l'œuvre,
- couvrent des dimensions différentes (émotionnelle, stratégique, relationnelle, morale, comportementale),
- ne sont PAS recyclables pour un autre personnage.

Format : A / B / C / D / E (1 seule réponse possible)

ÉTAPE 4 — MICRO-RÉCAP ŒUVRE (factuel, 1-2 lignes) :
Après motifs + personnages + traits pour une œuvre, génère un résumé factuel :
"Sur [ŒUVRE], tu es surtout attiré par [motif choisi], et par des personnages que tu valorises pour [traits dominants observés]."

Format de sortie OBLIGATOIRE :
---QUESTION_SEPARATOR---
[Question motif Œuvre #3]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #3]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #3]
---QUESTION_SEPARATOR---
[Question motif Œuvre #2]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #2]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #2] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #2]
---QUESTION_SEPARATOR---
[Question motif Œuvre #1]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #1]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #1] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #1]`
                },
                ...messages,
            ],
        });
        // Parser les questions
        const questions = completion
            .split('---QUESTION_SEPARATOR---')
            .map(q => q.trim())
            .filter(q => q.length > 0);
        return questions;
    }
    /**
     * Parse une réponse "personnages" (ex. "Arthur, Tommy et John") en liste de noms.
     * Tolérant : virgules, " et ", retours ligne, point-virgules.
     */
    parseCharacterNames(text) {
        if (!text || typeof text !== 'string')
            return [];
        const raw = text.trim().replace(/\s+/g, ' ');
        if (raw.length === 0)
            return [];
        const parts = raw
            .split(/,|;\s*|\n|\s+et\s+/i)
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
        return parts.length > 0 ? parts : [raw];
    }
    /**
     * Retourne le contenu de la prochaine question 2B en lecture seule (aucune mutation).
     * Utilisé pour l'idempotence : requête doublon → même réponse sans append ni incrément.
     */
    async getNextQuestion2BContentOnly(candidateId, blockNumber) {
        const candidate = candidateStore.get(candidateId) ?? (await candidateStore.getAsync(candidateId));
        if (!candidate)
            throw new Error(`Candidate ${candidateId} not found`);
        const queue = candidate.blockQueues?.[blockNumber];
        if (!queue || queue.questions.length === 0) {
            return {
                response: normalizeSingleResponse("Aucune question disponible. Recharge la page."),
                step: BLOC_02,
                expectsAnswer: true,
                autoContinue: false,
            };
        }
        const currentQuestionIndex = candidate.session.blockStates?.['2B']?.currentQuestionIndex ?? 0;
        if (currentQuestionIndex >= queue.questions.length) {
            return {
                response: normalizeSingleResponse("Toutes les questions ont été posées."),
                step: BLOC_02,
                expectsAnswer: true,
                autoContinue: false,
            };
        }
        let question = queue.questions[currentQuestionIndex];
        if (!queue.meta && question.includes('[NOM DU PERSONNAGE]')) {
            const block2B = candidateStore.getBlock2BAnswers(candidate);
            const answers = block2B?.answers ?? [];
            const QUESTIONS_PER_WORK = 6;
            const workIndex = Math.floor(currentQuestionIndex / QUESTIONS_PER_WORK);
            const slotInWork = currentQuestionIndex % QUESTIONS_PER_WORK;
            if (slotInWork >= 2 && slotInWork <= 4) {
                const characterIndex = slotInWork - 2;
                const personnagesQuestionIndex = 1 + workIndex * QUESTIONS_PER_WORK;
                const personnagesAnswer = answers[personnagesQuestionIndex] ?? '';
                const characterNames = this.parseCharacterNames(personnagesAnswer);
                const name = characterNames[characterIndex] ?? characterNames[0] ?? 'ce personnage';
                question = question.replace(/\[NOM DU PERSONNAGE\]/g, name);
            }
            else {
                question = question.replace(/\[NOM DU PERSONNAGE\]/g, 'ce personnage');
            }
        }
        if (question.includes('[NOM DU PERSONNAGE]')) {
            question = question.replace(/\[NOM DU PERSONNAGE\]/g, 'ce personnage');
        }
        return {
            response: normalizeSingleResponse(question),
            step: BLOC_02,
            expectsAnswer: true,
            autoContinue: false,
        };
    }
    /**
     * Sert la prochaine question BLOC 2B depuis la queue (state machine : currentQuestionIndex).
     * Incrémente currentQuestionIndex après envoi (persistance garantie).
     */
    async serveNextQuestion2B(candidateId, blockNumber) {
        const candidate = candidateStore.get(candidateId);
        if (!candidate)
            throw new Error(`Candidate ${candidateId} not found`);
        const queue = candidate.blockQueues?.[blockNumber];
        if (!queue || queue.questions.length === 0)
            throw new Error(`Queue for block ${blockNumber} is empty`);
        const currentQuestionIndex = candidate.session.blockStates?.['2B']?.currentQuestionIndex ?? 0;
        if (currentQuestionIndex >= queue.questions.length) {
            throw new Error(`All questions for block ${blockNumber} have been served`);
        }
        let question = queue.questions[currentQuestionIndex];
        if (!queue.meta && question.includes('[NOM DU PERSONNAGE]')) {
            const block2B = candidateStore.getBlock2BAnswers(candidate);
            const answers = block2B?.answers ?? [];
            const QUESTIONS_PER_WORK = 6;
            const workIndex = Math.floor(currentQuestionIndex / QUESTIONS_PER_WORK);
            const slotInWork = currentQuestionIndex % QUESTIONS_PER_WORK;
            if (slotInWork >= 2 && slotInWork <= 4) {
                const characterIndex = slotInWork - 2;
                const personnagesQuestionIndex = 1 + workIndex * QUESTIONS_PER_WORK;
                const personnagesAnswer = answers[personnagesQuestionIndex] ?? '';
                const characterNames = this.parseCharacterNames(personnagesAnswer);
                const name = characterNames[characterIndex] ?? characterNames[0] ?? 'ce personnage';
                question = question.replace(/\[NOM DU PERSONNAGE\]/g, name);
            }
            else {
                question = question.replace(/\[NOM DU PERSONNAGE\]/g, 'ce personnage');
            }
        }
        if (question.includes('[NOM DU PERSONNAGE]')) {
            question = question.replace(/\[NOM DU PERSONNAGE\]/g, 'ce personnage');
        }
        console.log('[ORCHESTRATOR] serve question BLOC 2B from queue (state machine)', {
            blockNumber,
            questionIndex: currentQuestionIndex,
            totalQuestions: queue.questions.length,
        });
        candidateStore.appendAssistantMessage(candidateId, question, { block: blockNumber, step: BLOC_02, kind: 'question' });
        candidateStore.updateUIState(candidateId, { step: BLOC_02, lastQuestion: question, identityDone: true });
        await candidateStore.setBlock2BCurrentQuestionIndex(candidateId, currentQuestionIndex + 1);
        return {
            response: normalizeSingleResponse(question),
            step: BLOC_02,
            expectsAnswer: true,
            autoContinue: false,
        };
    }
    /**
     * Génère le miroir final BLOC 2B
     *
     * ⚠️ ARCHITECTURE NOUVELLE — SÉPARATION ANALYSE/RENDU
     * 1. INTERPRÉTATION : Structure JSON froide et logique (gpt-4o-mini, temp 0.3)
     * 2. RENDU MENTOR : Texte incarné et vécu (gpt-4o, temp 0.8)
     *
     * - Suppression validations heuristiques complexes (validateInterpretiveAnalysis, validateInterpretiveDepth)
     * - Validation simple : structure JSON + marqueurs expérientiels
     */
    async generateMirror2B(candidate, works, coreWork, onChunk, onUx) {
        const block2B = candidateStore.getBlock2BAnswers(candidate);
        const block2BAnswers = (block2B?.answers ?? []).map(a => (a || '').trim()).filter(a => a.length > 0);
        console.log('[BLOC2B][NEW_ARCHITECTURE] Génération miroir en 3 étapes (interprétation + angle + rendu)');
        console.log('[BLOC2B] Réponses utilisateur:', block2BAnswers.length);
        // UX FAST — occupation pendant analyse (1 message statique max)
        let occupationTimer = null;
        if (onUx) {
            occupationTimer = setTimeout(() => {
                onUx('⏳ Je cherche ce qui relie vraiment tes réponses.\n\n');
            }, 1500);
        }
        try {
            // ÉTAPE 1 — INTERPRÉTATION (FROIDE, LOGIQUE)
            console.log('[BLOC2B][ETAPE1] Génération structure interprétative...');
            const additionalContext = `ŒUVRES DU CANDIDAT :
- Œuvre #3 : ${works[2] || 'N/A'}
- Œuvre #2 : ${works[1] || 'N/A'}
- Œuvre #1 : ${works[0] || 'N/A'}
- Œuvre noyau : ${coreWork}`;
            const structure = await generateInterpretiveStructure(block2BAnswers, 'block2b', additionalContext);
            console.log('[BLOC2B][ETAPE1] Structure générée:', {
                hypothese_centrale: structure.hypothese_centrale.substring(0, 50) + '...',
                mecanisme: structure.mecanisme.substring(0, 50) + '...',
            });
            // ÉTAPE 2 — DÉCISION D'ANGLE (OBLIGATOIRE)
            console.log('[BLOC2B][ETAPE2] Sélection angle mentor...');
            const mentorAngle = await selectMentorAngle(structure);
            if (occupationTimer) {
                clearTimeout(occupationTimer);
                occupationTimer = null;
            }
            console.log('[BLOC2B][ETAPE2] Angle mentor sélectionné:', mentorAngle.substring(0, 80) + '...');
            // ÉTAPE 3 — RENDU MENTOR INCARNÉ (BLOC 2B : pas de format 1️⃣2️⃣3️⃣, pas de révélation anticipée)
            console.log('[BLOC2B][ETAPE3] Rendu mentor incarné...');
            const mentorText = await renderMentorStyle(mentorAngle, 'block2b', onChunk);
            console.log('[BLOC2B][ETAPE3] Texte mentor généré');
            // VALIDATION FINALE (FORMAT SYNTHÈSE 2B)
            const validation = validateSynthesis2B(mentorText);
            if (validation.valid) {
                console.log('[BLOC2B][SUCCESS] Miroir généré avec succès (nouvelle architecture)');
                return mentorText;
            }
            else {
                console.warn('[BLOC2B][WARN] Format synthèse invalide, mais texte servi (fail-soft):', validation.error);
                return mentorText;
            }
        }
        catch (error) {
            if (occupationTimer)
                clearTimeout(occupationTimer);
            console.error('[BLOC2B][ERROR] Erreur nouvelle architecture, fallback ancienne méthode:', error);
            throw new Error(`Failed to generate mirror with new architecture: ${error}`);
        }
    }
}
