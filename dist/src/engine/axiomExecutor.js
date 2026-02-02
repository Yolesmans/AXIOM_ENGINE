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
// Steps minimaux
export const STEP_00_IDENTITY = 'STEP_00_IDENTITY';
export const STEP_01_TUTOVOU = 'STEP_01_TUTOVOU';
export const STEP_02_PREAMBULE = 'STEP_02_PREAMBULE';
export const STEP_03_BLOC1 = 'STEP_03_BLOC1';
export const STEP_99_MATCHING = 'STEP_99_MATCHING';
export async function executeAxiom(candidate, userMessage) {
    // INIT ÉTAT
    const ui = candidate.session.ui || {
        step: candidate.identity.completedAt ? STEP_01_TUTOVOU : STEP_00_IDENTITY,
        lastQuestion: null,
        identityDone: !!candidate.identity.completedAt,
    };
    let state = {
        step: ui.step,
        lastQuestion: ui.lastQuestion,
        tutoiement: ui.tutoiement,
    };
    // 🔒 TRANSITION TUTOIEMENT / VOUVOIEMENT — DOIT ÊTRE AVANT callOpenAI
    if (state.step === STEP_01_TUTOVOU && userMessage) {
        const lower = userMessage.toLowerCase();
        if (lower.includes('tutoi') ||
            lower.includes('tutoie') ||
            lower.includes('tutoy')) {
            state.tutoiement = 'tutoiement';
            state.step = STEP_02_PREAMBULE;
            state.lastQuestion = null;
        }
        if (lower.includes('vouvoi') ||
            lower.includes('vouvoie') ||
            lower.includes('vouvoy')) {
            state.tutoiement = 'vouvoiement';
            state.step = STEP_02_PREAMBULE;
            state.lastQuestion = null;
        }
    }
    // Construire l'historique des messages
    const messages = [];
    // Ajouter les réponses précédentes
    candidate.answers.forEach((answer) => {
        messages.push({ role: 'user', content: answer.message });
    });
    // Ajouter le message utilisateur actuel si présent
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
                    content: buildExecutionDirective(state),
                },
                ...messages,
            ],
        });
        if (typeof completion === 'string' && completion.trim()) {
            aiText = completion.trim();
        }
    }
    catch (e) {
        console.error('AXIOM_EXECUTION_ERROR', e);
    }
    // ANTI SILENCE
    if (!aiText) {
        aiText = fallbackByStep(state);
    }
    const expectsAnswer = endsWithQuestion(aiText);
    // MÉMO DERNIÈRE QUESTION
    if (expectsAnswer) {
        state.lastQuestion = aiText;
    }
    // 🔒 ÉTAPE 1 — FIN DU PRÉAMBULE → PASSAGE AU BLOC 1
    // Le front relance /axiom quand expectsAnswer === false
    if (state.step === STEP_02_PREAMBULE && !expectsAnswer) {
        state.step = STEP_03_BLOC1;
        state.lastQuestion = null;
    }
    let autoContinue = false;
    // 🔒 ÉTAPE 2 — PERSISTENCE DE L'ÉTAT AXIOM (OBLIGATOIRE)
    // L'état de la discussion DOIT être sauvegardé à CHAQUE appel
    if (candidate?.session) {
        candidateStore.updateUIState(candidate.candidateId, {
            step: state.step,
            lastQuestion: state.lastQuestion,
            tutoiement: state.tutoiement,
            identityDone: ui.identityDone,
        });
    }
    return {
        response: aiText,
        expectsAnswer,
        step: state.step,
        lastQuestion: state.lastQuestion,
        tutoiement: state.tutoiement,
        autoContinue,
    };
}
function buildExecutionDirective(state) {
    return `
RÈGLE ABSOLUE AXIOM :

Tu exécutes STRICTEMENT le protocole AXIOM.

ÉTAT COURANT :
- step = ${state.step}

Tu produis UNIQUEMENT le texte autorisé à cette étape.

Si le bloc est INFORMATIF :
- tu l'affiches intégralement
- tu NE POSES PAS de question

Si le bloc ATTEND une réponse :
- tu poses UNE question claire

INTERDICTIONS :
- improviser
- commenter le système
- reformuler le prompt
- revenir en arrière
`;
}
function endsWithQuestion(text) {
    return text.trim().endsWith('?');
}
function fallbackByStep(state) {
    if (state.step === STEP_00_IDENTITY || state.step === STEP_01_TUTOVOU) {
        return ('Bienvenue dans AXIOM.\n' +
            'On va découvrir qui tu es vraiment — pas ce qu\'il y a sur ton CV.\n' +
            'Promis : je ne te juge pas. Je veux juste comprendre comment tu fonctionnes.\n\n' +
            'Dis-moi : tu préfères qu\'on se tutoie ou qu\'on se vouvoie pour cette discussion ?');
    }
    return state.lastQuestion || 'On continue.';
}
