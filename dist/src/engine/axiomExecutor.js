import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { callOpenAI } from '../services/openaiClient.js';
import { candidateStore } from '../store/sessionStore.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Charger FULL_AXIOM_PROMPT
async function loadFullAxiomPrompt() {
    const promptsDir = join(__dirname, '../prompts');
    const systemPrompt = await readFile(join(promptsDir, 'system/AXIOM_ENGINE.txt'), 'utf-8');
    const profilPrompt = await readFile(join(promptsDir, 'metier/AXIOM_PROFIL.txt'), 'utf-8');
    return `${systemPrompt}\n\n${profilPrompt}`;
}
// Charger PROMPT MATCHING
async function loadMatchingPrompt() {
    const promptsDir = join(__dirname, '../prompts');
    return await readFile(join(promptsDir, 'metier/AXIOM_MATCHING.txt'), 'utf-8');
}
// ============================================
// ÉTATS STRICTS (FSM)
// ============================================
export const STEP_01_IDENTITY = 'STEP_01_IDENTITY';
export const STEP_02_TONE = 'STEP_02_TONE';
export const STEP_03_PREAMBULE = 'STEP_03_PREAMBULE';
export const STEP_03_BLOC1 = 'STEP_03_BLOC1'; // wait_start_button
export const BLOC_01 = 'BLOC_01';
export const BLOC_02 = 'BLOC_02';
export const BLOC_03 = 'BLOC_03';
export const BLOC_04 = 'BLOC_04';
export const BLOC_05 = 'BLOC_05';
export const BLOC_06 = 'BLOC_06';
export const BLOC_07 = 'BLOC_07';
export const BLOC_08 = 'BLOC_08';
export const BLOC_09 = 'BLOC_09';
export const BLOC_10 = 'BLOC_10';
export const STEP_99_MATCH_READY = 'STEP_99_MATCH_READY';
export const STEP_99_MATCHING = 'STEP_99_MATCHING';
export const DONE_MATCHING = 'DONE_MATCHING';
// ============================================
// NORMALISATION INPUTS
// ============================================
function normalizeInput(text) {
    return text
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // Supprimer accents
}
function extractIdentity(message) {
    const normalized = normalizeInput(message);
    const prenomMatch = normalized.match(/pr[ée]nom[:\s]+([^\n,]+)/i) || normalized.match(/prenom[:\s]+([^\n,]+)/i);
    const nomMatch = normalized.match(/nom[:\s]+([^\n,]+)/i);
    const emailMatch = normalized.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
    if (prenomMatch && nomMatch && emailMatch) {
        return {
            firstName: prenomMatch[1].trim(),
            lastName: nomMatch[1].trim(),
            email: emailMatch[1].trim(),
        };
    }
    return null;
}
function detectTone(message) {
    const normalized = normalizeInput(message);
    const tutoiementPatterns = [
        'tutoie', 'tutoi', 'tutoy', 'tu ', 'on se tutoie', 'tutoiement',
    ];
    const vouvoiementPatterns = [
        'vouvoie', 'vouvoi', 'vouvoy', 'vous ', 'on se vouvoie', 'vouvoiement',
    ];
    for (const pattern of tutoiementPatterns) {
        if (normalized.includes(pattern)) {
            return 'tutoiement';
        }
    }
    for (const pattern of vouvoiementPatterns) {
        if (normalized.includes(pattern)) {
            return 'vouvoiement';
        }
    }
    return null;
}
// ============================================
// LOGGING OBLIGATOIRE
// ============================================
function logTransition(sessionId, stateIn, stateOut, inputType) {
    console.log('[AXIOM_STATE_TRANSITION]', {
        sessionId,
        stateIn,
        stateOut,
        inputType,
        timestamp: new Date().toISOString(),
    });
}
// ============================================
// RÈGLE CRITIQUE PROMPTS
// ============================================
// Le moteur AXIOM n'interprète pas les prompts.
// Il les exécute STRICTEMENT.
// Toute sortie LLM hors règles = invalide → rejouer le prompt.
// ============================================
// EXÉCUTEUR PRINCIPAL (FSM STRICTE)
// ============================================
export async function executeAxiom(input) {
    const { candidate, userMessage, event } = input;
    // INIT ÉTAT
    const ui = candidate.session.ui || {
        step: candidate.identity.completedAt ? STEP_02_TONE : STEP_01_IDENTITY,
        lastQuestion: null,
        identityDone: !!candidate.identity.completedAt,
    };
    let currentState = ui.step;
    const stateIn = currentState;
    // ============================================
    // STEP_01_IDENTITY
    // ============================================
    if (currentState === STEP_01_IDENTITY) {
        if (!userMessage) {
            // Première demande identité
            // Le front gère l'UI formulaire, on ne renvoie pas de message ici
            logTransition(candidate.candidateId, stateIn, currentState, 'message');
            return {
                response: '',
                step: 'IDENTITY',
                lastQuestion: null,
                expectsAnswer: true,
                autoContinue: false,
            };
        }
        // Parser identité
        const identity = extractIdentity(userMessage);
        if (!identity || !identity.firstName || !identity.lastName || !identity.email) {
            // Invalide → rester en identity
            logTransition(candidate.candidateId, stateIn, currentState, 'message');
            return {
                response: '',
                step: 'IDENTITY',
                lastQuestion: null,
                expectsAnswer: true,
                autoContinue: false,
            };
        }
        // Valide → stocker et passer à tone_choice
        candidateStore.updateIdentity(candidate.candidateId, {
            firstName: identity.firstName,
            lastName: identity.lastName,
            email: identity.email,
            completedAt: new Date(),
        });
        currentState = STEP_02_TONE;
        candidateStore.updateUIState(candidate.candidateId, {
            step: currentState,
            lastQuestion: null,
            identityDone: true,
        });
        logTransition(candidate.candidateId, stateIn, currentState, 'message');
        // Enchaîner immédiatement avec question tone
        return await executeAxiom({
            candidate: candidateStore.get(candidate.candidateId),
            userMessage: null,
        });
    }
    // ============================================
    // STEP_02_TONE
    // ============================================
    if (currentState === STEP_02_TONE) {
        if (!userMessage) {
            // Première question tone
            const toneQuestion = 'Bienvenue dans AXIOM.\n' +
                'On va découvrir qui tu es vraiment — pas ce qu\'il y a sur ton CV.\n' +
                'Promis : je ne te juge pas. Je veux juste comprendre comment tu fonctionnes.\n\n' +
                'On commence tranquille.\n' +
                'Dis-moi : tu préfères qu\'on se tutoie ou qu\'on se vouvoie pour cette discussion ?';
            logTransition(candidate.candidateId, stateIn, currentState, 'message');
            return {
                response: toneQuestion,
                step: currentState,
                lastQuestion: toneQuestion,
                expectsAnswer: true,
                autoContinue: false,
            };
        }
        // Détecter tone
        const tone = detectTone(userMessage);
        if (!tone) {
            // Indécidable → répéter
            const toneQuestion = 'On commence tranquille.\n' +
                'Dis-moi : tu préfères qu\'on se tutoie ou qu\'on se vouvoie pour cette discussion ?';
            logTransition(candidate.candidateId, stateIn, currentState, 'message');
            return {
                response: toneQuestion,
                step: currentState,
                lastQuestion: toneQuestion,
                expectsAnswer: true,
                autoContinue: false,
            };
        }
        // PARTIE 4 — tone_choice → preambule → wait_start_button
        // SI VALIDE : En UN SEUL RETURN :
        // - envoyer le PRÉAMBULE COMPLET
        // - expectsAnswer = false
        // - step = "STEP_03_BLOC1"
        // - state = "wait_start_button"
        // Stocker tone
        candidateStore.setTonePreference(candidate.candidateId, tone);
        // Charger et exécuter le préambule STRICTEMENT
        let aiText = null;
        try {
            const FULL_AXIOM_PROMPT = await loadFullAxiomPrompt();
            const completion = await callOpenAI({
                messages: [
                    { role: 'system', content: FULL_AXIOM_PROMPT },
                    {
                        role: 'system',
                        content: `RÈGLE ABSOLUE AXIOM :
Le moteur AXIOM n'interprète pas les prompts. Il les exécute STRICTEMENT.
Tu es en état STEP_03_PREAMBULE.
Tu dois afficher LE PRÉAMBULE MÉTIER COMPLET tel que défini dans le prompt.
Tu NE POSES PAS de question.
Tu affiches uniquement le préambule, mot pour mot selon les instructions.
AUCUNE reformulation, AUCUNE improvisation, AUCUNE question.
Toute sortie hors règles = invalide.`,
                    },
                ],
            });
            if (typeof completion === 'string' && completion.trim()) {
                aiText = completion.trim();
            }
        }
        catch (e) {
            console.error('[AXIOM_EXECUTION_ERROR]', e);
        }
        // Si échec → réessayer une fois
        if (!aiText) {
            try {
                const FULL_AXIOM_PROMPT = await loadFullAxiomPrompt();
                const completion = await callOpenAI({
                    messages: [
                        { role: 'system', content: FULL_AXIOM_PROMPT },
                        {
                            role: 'system',
                            content: `RÈGLE ABSOLUE AXIOM :
Le moteur AXIOM n'interprète pas les prompts. Il les exécute STRICTEMENT.
Tu es en état STEP_03_PREAMBULE.
Tu dois afficher LE PRÉAMBULE MÉTIER COMPLET tel que défini dans le prompt.
Tu NE POSES PAS de question.
Tu affiches uniquement le préambule, mot pour mot selon les instructions.
AUCUNE reformulation, AUCUNE improvisation, AUCUNE question.
Toute sortie hors règles = invalide.`,
                        },
                    ],
                });
                if (typeof completion === 'string' && completion.trim()) {
                    aiText = completion.trim();
                }
            }
            catch (e) {
                console.error('[AXIOM_EXECUTION_ERROR_RETRY]', e);
            }
        }
        // Si toujours vide → utiliser le texte du prompt directement (pas de fallback générique)
        if (!aiText) {
            const FULL_AXIOM_PROMPT = await loadFullAxiomPrompt();
            const preambuleMatch = FULL_AXIOM_PROMPT.match(/PRÉAMBULE MÉTIER[^]*?(?=🔒|🟢|$)/i);
            if (preambuleMatch) {
                aiText = preambuleMatch[0]
                    .replace(/PRÉAMBULE MÉTIER[^]*?AFFICHAGE OBLIGATOIRE[^]*?CANDIDAT\)[^]*?/i, '')
                    .trim();
            }
            else {
                // Texte du prompt (pas de fallback générique)
                aiText =
                    'Avant de commencer vraiment, je te pose simplement le cadre.\n\n' +
                        'Le métier concerné est celui de courtier en énergie.\n\n' +
                        'Il consiste à accompagner des entreprises dans la gestion de leurs contrats d\'électricité et de gaz :\n' +
                        '• analyse de l\'existant,\n' +
                        '• renégociation auprès des fournisseurs,\n' +
                        '• sécurisation des prix,\n' +
                        '• suivi dans la durée.\n\n' +
                        'Le client final ne paie rien directement.\n' +
                        'La rémunération est versée par les fournisseurs, à la signature et sur la durée du contrat.\n\n' +
                        'Il n\'y a aucune garantie.\n' +
                        'Certains gagnent peu. D\'autres gagnent très bien.\n\n' +
                        'La différence ne vient ni du marché, ni du produit, ni de la chance,\n' +
                        'mais de la constance, de l\'autonomie, et de la capacité à tenir dans un cadre exigeant.\n\n' +
                        'C\'est précisément pour ça qu\'AXIOM existe.\n\n' +
                        'AXIOM n\'est ni un test, ni un jugement, ni une sélection déguisée.\n\n' +
                        'Il n\'est pas là pour te vendre ce métier, ni pour te faire entrer dans une case.\n\n' +
                        'Son rôle est simple :\n' +
                        'prendre le temps de comprendre comment tu fonctionnes réellement dans le travail,\n' +
                        'et te donner une lecture lucide de ce que ce cadre exige au quotidien.\n\n' +
                        'Pour certains profils, c\'est un terrain d\'expression très fort.\n' +
                        'Pour d\'autres, tout aussi solides, d\'autres environnements sont simplement plus cohérents.\n\n' +
                        'AXIOM est là pour apporter de la clarté :\n' +
                        '• sans pression,\n' +
                        '• sans promesse,\n' +
                        '• sans te pousser dans une direction.';
            }
        }
        // ⛔ INTERDICTION : réponse vide, "On continue.", attendre un input utilisateur, return partiel
        if (!aiText) {
            console.error('[AXIOM_CRITICAL_ERROR]', { sessionId: candidate.candidateId, state: currentState });
            throw new Error('Failed to generate preamble');
        }
        // Transition immédiate vers wait_start_button dans le MÊME return
        currentState = STEP_03_BLOC1;
        candidateStore.updateUIState(candidate.candidateId, {
            step: currentState,
            lastQuestion: null,
            tutoiement: tone,
            identityDone: true,
        });
        logTransition(candidate.candidateId, stateIn, currentState, 'message');
        // PARTIE 4 — En UN SEUL RETURN
        return {
            response: aiText,
            step: "STEP_03_BLOC1",
            lastQuestion: null,
            expectsAnswer: false,
            autoContinue: false,
        };
    }
    // ============================================
    // STEP_03_PREAMBULE
    // ============================================
    if (currentState === STEP_03_PREAMBULE) {
        // Charger et exécuter le préambule STRICTEMENT
        let aiText = null;
        try {
            const FULL_AXIOM_PROMPT = await loadFullAxiomPrompt();
            const completion = await callOpenAI({
                messages: [
                    { role: 'system', content: FULL_AXIOM_PROMPT },
                    {
                        role: 'system',
                        content: `RÈGLE ABSOLUE AXIOM :
Tu es en état STEP_03_PREAMBULE.
Tu dois afficher LE PRÉAMBULE MÉTIER COMPLET tel que défini dans le prompt.
Tu NE POSES PAS de question.
Tu affiches uniquement le préambule, mot pour mot selon les instructions.
AUCUNE reformulation, AUCUNE improvisation, AUCUNE question.`,
                    },
                ],
            });
            if (typeof completion === 'string' && completion.trim()) {
                aiText = completion.trim();
            }
        }
        catch (e) {
            console.error('[AXIOM_EXECUTION_ERROR]', e);
        }
        // Si échec → réessayer une fois
        if (!aiText) {
            try {
                const FULL_AXIOM_PROMPT = await loadFullAxiomPrompt();
                const completion = await callOpenAI({
                    messages: [
                        { role: 'system', content: FULL_AXIOM_PROMPT },
                        {
                            role: 'system',
                            content: `RÈGLE ABSOLUE AXIOM :
Tu es en état STEP_03_PREAMBULE.
Tu dois afficher LE PRÉAMBULE MÉTIER COMPLET tel que défini dans le prompt.
Tu NE POSES PAS de question.
Tu affiches uniquement le préambule, mot pour mot selon les instructions.
AUCUNE reformulation, AUCUNE improvisation, AUCUNE question.`,
                        },
                    ],
                });
                if (typeof completion === 'string' && completion.trim()) {
                    aiText = completion.trim();
                }
            }
            catch (e) {
                console.error('[AXIOM_EXECUTION_ERROR_RETRY]', e);
            }
        }
        // Si toujours vide → utiliser le texte du prompt directement
        if (!aiText) {
            const FULL_AXIOM_PROMPT = await loadFullAxiomPrompt();
            const preambuleMatch = FULL_AXIOM_PROMPT.match(/PRÉAMBULE MÉTIER[^]*?(?=🔒|🟢|$)/i);
            if (preambuleMatch) {
                aiText = preambuleMatch[0]
                    .replace(/PRÉAMBULE MÉTIER[^]*?AFFICHAGE OBLIGATOIRE[^]*?CANDIDAT\)[^]*?/i, '')
                    .trim();
            }
            else {
                // Fallback minimal (texte du prompt)
                aiText =
                    'Avant de commencer vraiment, je te pose simplement le cadre.\n\n' +
                        'Le métier concerné est celui de courtier en énergie.\n\n' +
                        'Il consiste à accompagner des entreprises dans la gestion de leurs contrats d\'électricité et de gaz :\n' +
                        '• analyse de l\'existant,\n' +
                        '• renégociation auprès des fournisseurs,\n' +
                        '• sécurisation des prix,\n' +
                        '• suivi dans la durée.\n\n' +
                        'Le client final ne paie rien directement.\n' +
                        'La rémunération est versée par les fournisseurs, à la signature et sur la durée du contrat.\n\n' +
                        'Il n\'y a aucune garantie.\n' +
                        'Certains gagnent peu. D\'autres gagnent très bien.\n\n' +
                        'La différence ne vient ni du marché, ni du produit, ni de la chance,\n' +
                        'mais de la constance, de l\'autonomie, et de la capacité à tenir dans un cadre exigeant.\n\n' +
                        'C\'est précisément pour ça qu\'AXIOM existe.\n\n' +
                        'AXIOM n\'est ni un test, ni un jugement, ni une sélection déguisée.\n\n' +
                        'Il n\'est pas là pour te vendre ce métier, ni pour te faire entrer dans une case.\n\n' +
                        'Son rôle est simple :\n' +
                        'prendre le temps de comprendre comment tu fonctionnes réellement dans le travail,\n' +
                        'et te donner une lecture lucide de ce que ce cadre exige au quotidien.\n\n' +
                        'Pour certains profils, c\'est un terrain d\'expression très fort.\n' +
                        'Pour d\'autres, tout aussi solides, d\'autres environnements sont simplement plus cohérents.\n\n' +
                        'AXIOM est là pour apporter de la clarté :\n' +
                        '• sans pression,\n' +
                        '• sans promesse,\n' +
                        '• sans te pousser dans une direction.';
            }
        }
        // Transition immédiate vers wait_start_button
        currentState = STEP_03_BLOC1;
        candidateStore.updateUIState(candidate.candidateId, {
            step: currentState,
            lastQuestion: null,
            tutoiement: ui.tutoiement,
            identityDone: true,
        });
        logTransition(candidate.candidateId, stateIn, currentState, 'message');
        return {
            response: aiText,
            step: currentState,
            lastQuestion: null,
            expectsAnswer: false,
            autoContinue: false,
        };
    }
    // ============================================
    // STEP_03_BLOC1 (wait_start_button)
    // ============================================
    if (currentState === STEP_03_BLOC1) {
        // PARTIE 5 — Bouton "Je commence mon profil"
        // Si POST /axiom avec message == null ET state == "wait_start_button"
        if (event === 'START_BLOC_1' || userMessage === '__SYSTEM_START__' || userMessage === null) {
            // state = "bloc_01"
            currentState = BLOC_01;
            candidateStore.updateUIState(candidate.candidateId, {
                step: currentState,
                lastQuestion: null,
                tutoiement: ui.tutoiement,
                identityDone: true,
            });
            candidateStore.updateSession(candidate.candidateId, { state: 'collecting', currentBlock: 1 });
            logTransition(candidate.candidateId, stateIn, currentState, event ? 'event' : 'message');
            // Enchaîner immédiatement avec première question BLOC_01
            return await executeAxiom({
                candidate: candidateStore.get(candidate.candidateId),
                userMessage: null,
            });
        }
        // Si message texte reçu → ignorer (on attend le bouton)
        logTransition(candidate.candidateId, stateIn, currentState, 'message');
        return {
            response: '',
            step: "STEP_03_BLOC1",
            lastQuestion: null,
            expectsAnswer: false,
            autoContinue: false,
        };
    }
    // ============================================
    // BLOCS 1 à 10
    // ============================================
    const blocStates = [BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10];
    if (blocStates.includes(currentState)) {
        const blocNumber = blocStates.indexOf(currentState) + 1;
        // Construire l'historique
        const messages = [];
        candidate.answers.forEach((answer) => {
            messages.push({ role: 'user', content: answer.message });
        });
        if (userMessage) {
            messages.push({ role: 'user', content: userMessage });
        }
        let aiText = null;
        try {
            const FULL_AXIOM_PROMPT = await loadFullAxiomPrompt();
            const completion = await callOpenAI({
                messages: [
                    { role: 'system', content: FULL_AXIOM_PROMPT },
                    {
                        role: 'system',
                        content: `RÈGLE ABSOLUE AXIOM :
Le moteur AXIOM n'interprète pas les prompts. Il les exécute STRICTEMENT.
Tu es en état ${currentState} (BLOC ${blocNumber}).
Tu exécutes STRICTEMENT le protocole AXIOM pour ce bloc.
Tu produis UNIQUEMENT le texte autorisé à cette étape.
INTERDICTIONS : improviser, commenter le système, reformuler le prompt, revenir en arrière.
Si tu dois poser une question, pose-la. Si tu dois afficher un miroir, affiche-le.
AUCUNE sortie générique type "On continue", "D'accord", etc.
Toute sortie hors règles = invalide.`,
                    },
                    ...messages,
                ],
            });
            if (typeof completion === 'string' && completion.trim()) {
                aiText = completion.trim();
            }
        }
        catch (e) {
            console.error('[AXIOM_EXECUTION_ERROR]', e);
        }
        // Si échec → réessayer une fois
        if (!aiText) {
            try {
                const FULL_AXIOM_PROMPT = await loadFullAxiomPrompt();
                const completion = await callOpenAI({
                    messages: [
                        { role: 'system', content: FULL_AXIOM_PROMPT },
                        {
                            role: 'system',
                            content: `RÈGLE ABSOLUE AXIOM :
Le moteur AXIOM n'interprète pas les prompts. Il les exécute STRICTEMENT.
Tu es en état ${currentState} (BLOC ${blocNumber}).
Tu exécutes STRICTEMENT le protocole AXIOM pour ce bloc.
Tu produis UNIQUEMENT le texte autorisé à cette étape.
INTERDICTIONS : improviser, commenter le système, reformuler le prompt, revenir en arrière.
Si tu dois poser une question, pose-la. Si tu dois afficher un miroir, affiche-le.
AUCUNE sortie générique type "On continue", "D'accord", etc.
Toute sortie hors règles = invalide.`,
                        },
                        ...messages,
                    ],
                });
                if (typeof completion === 'string' && completion.trim()) {
                    aiText = completion.trim();
                }
            }
            catch (e) {
                console.error('[AXIOM_EXECUTION_ERROR_RETRY]', e);
            }
        }
        // Si toujours vide → utiliser lastQuestion
        if (!aiText) {
            aiText = ui.lastQuestion || '';
        }
        // Si toujours vide → erreur critique
        if (!aiText) {
            console.error('[AXIOM_CRITICAL_ERROR]', { sessionId: candidate.candidateId, state: currentState });
            logTransition(candidate.candidateId, stateIn, DONE_MATCHING, 'message');
            return {
                response: 'Erreur technique. Veuillez réessayer.',
                step: DONE_MATCHING,
                lastQuestion: null,
                expectsAnswer: false,
                autoContinue: false,
            };
        }
        const expectsAnswer = aiText.trim().endsWith('?');
        let lastQuestion = null;
        if (expectsAnswer) {
            lastQuestion = aiText;
        }
        // Stocker la réponse si message utilisateur
        if (userMessage) {
            const answerRecord = {
                block: blocNumber,
                message: userMessage,
                createdAt: new Date().toISOString(),
            };
            candidateStore.addAnswer(candidate.candidateId, answerRecord);
        }
        // Déterminer l'état suivant
        let nextState = currentState;
        if (!expectsAnswer && blocNumber < 10) {
            // Fin du bloc → passer au suivant
            nextState = blocStates[blocNumber];
        }
        else if (!expectsAnswer && blocNumber === 10) {
            // Fin du bloc 10 → générer synthèse et passer à match_ready
            // TODO: Générer synthèse finale
            nextState = STEP_99_MATCH_READY;
            candidateStore.setFinalProfileText(candidate.candidateId, aiText);
        }
        candidateStore.updateUIState(candidate.candidateId, {
            step: nextState,
            lastQuestion,
            tutoiement: ui.tutoiement,
            identityDone: true,
        });
        logTransition(candidate.candidateId, stateIn, nextState, userMessage ? 'message' : 'event');
        // Si fin du bloc 10 → transition automatique
        if (nextState === STEP_99_MATCH_READY) {
            return {
                response: aiText + '\n\nProfil terminé. Quand tu es prêt, génère ton matching.',
                step: nextState,
                lastQuestion: null,
                expectsAnswer: false,
                autoContinue: false,
            };
        }
        return {
            response: aiText,
            step: nextState,
            lastQuestion,
            expectsAnswer,
            autoContinue: false,
        };
    }
    // ============================================
    // STEP_99_MATCH_READY
    // ============================================
    if (currentState === STEP_99_MATCH_READY) {
        // Attendre le bouton "Je génère mon matching"
        if (!userMessage && !event) {
            logTransition(candidate.candidateId, stateIn, currentState, 'message');
            return {
                response: 'Profil terminé. Quand tu es prêt, génère ton matching.',
                step: currentState,
                lastQuestion: null,
                expectsAnswer: false,
                autoContinue: false,
            };
        }
        // Passer à matching
        currentState = STEP_99_MATCHING;
        candidateStore.updateUIState(candidate.candidateId, {
            step: currentState,
            lastQuestion: null,
            tutoiement: ui.tutoiement,
            identityDone: true,
        });
        logTransition(candidate.candidateId, stateIn, currentState, 'message');
        // Enchaîner immédiatement avec matching
        return await executeAxiom({
            candidate: candidateStore.get(candidate.candidateId),
            userMessage: null,
        });
    }
    // ============================================
    // STEP_99_MATCHING
    // ============================================
    if (currentState === STEP_99_MATCHING) {
        let aiText = null;
        try {
            const MATCHING_PROMPT = await loadMatchingPrompt();
            const messages = [];
            candidate.answers.forEach((answer) => {
                messages.push({ role: 'user', content: answer.message });
            });
            // Ajouter la synthèse finale si disponible
            if (candidate.finalProfileText) {
                messages.push({ role: 'system', content: `SYNTHÈSE FINALE AXIOM:\n${candidate.finalProfileText}` });
            }
            const completion = await callOpenAI({
                messages: [
                    { role: 'system', content: MATCHING_PROMPT },
                    ...messages,
                ],
            });
            if (typeof completion === 'string' && completion.trim()) {
                aiText = completion.trim();
            }
        }
        catch (e) {
            console.error('[AXIOM_EXECUTION_ERROR]', e);
        }
        // Si échec → réessayer une fois
        if (!aiText) {
            try {
                const MATCHING_PROMPT = await loadMatchingPrompt();
                const messages = [];
                candidate.answers.forEach((answer) => {
                    messages.push({ role: 'user', content: answer.message });
                });
                if (candidate.finalProfileText) {
                    messages.push({ role: 'system', content: `SYNTHÈSE FINALE AXIOM:\n${candidate.finalProfileText}` });
                }
                const completion = await callOpenAI({
                    messages: [
                        { role: 'system', content: MATCHING_PROMPT },
                        ...messages,
                    ],
                });
                if (typeof completion === 'string' && completion.trim()) {
                    aiText = completion.trim();
                }
            }
            catch (e) {
                console.error('[AXIOM_EXECUTION_ERROR_RETRY]', e);
            }
        }
        // Si toujours vide → erreur
        if (!aiText) {
            console.error('[AXIOM_CRITICAL_ERROR]', { sessionId: candidate.candidateId, state: currentState });
            aiText = 'Erreur lors de la génération du matching. Veuillez réessayer.';
        }
        currentState = DONE_MATCHING;
        candidateStore.updateUIState(candidate.candidateId, {
            step: currentState,
            lastQuestion: null,
            tutoiement: ui.tutoiement,
            identityDone: true,
        });
        logTransition(candidate.candidateId, stateIn, currentState, 'message');
        return {
            response: aiText,
            step: currentState,
            lastQuestion: null,
            expectsAnswer: false,
            autoContinue: false,
        };
    }
    // ============================================
    // DONE_MATCHING
    // ============================================
    if (currentState === DONE_MATCHING) {
        logTransition(candidate.candidateId, stateIn, currentState, userMessage ? 'message' : 'event');
        return {
            response: '',
            step: currentState,
            lastQuestion: null,
            expectsAnswer: false,
            autoContinue: false,
        };
    }
    // État inconnu
    console.error('[AXIOM_UNKNOWN_STATE]', { sessionId: candidate.candidateId, state: currentState });
    logTransition(candidate.candidateId, stateIn, DONE_MATCHING, 'message');
    return {
        response: 'Erreur technique. Veuillez réessayer.',
        step: DONE_MATCHING,
        lastQuestion: null,
        expectsAnswer: false,
        autoContinue: false,
    };
}
