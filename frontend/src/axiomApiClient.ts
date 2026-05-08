/**
 * AXIOM ENGINE API Client
 * Remplace les appels directs à Gemini/GoogleGenAI dans DiagnosticChat.
 * Connecte le frontend React au moteur Express AXIOM ENGINE.
 */

const TENANT_ID = 'reveliom';
const POSTE_ID = 'diagnostic';

export interface AxiomDoneEvent {
  type: 'done';
  sessionId: string;
  currentBlock: number;
  state: string;
  response: string;
  step: string;
  expectsAnswer: boolean;
  autoContinue: boolean;
}

export interface AxiomStreamCallbacks {
  onToken: (chunk: string) => void;
  onDone: (event: AxiomDoneEvent) => void;
  onError: (message: string) => void;
}

/**
 * Initialise une session AXIOM ENGINE avec l'identité Firebase.
 *
 * Stratégie en 2 temps :
 * 1. GET /start pour détecter l'état courant de la session (nouvelle ou reprise)
 * 2A. Si STEP_01_IDENTITY → POST /axiom avec les données d'identité (session fraîche)
 * 2B. Sinon → retourner la réponse de /start directement
 *    - STEP_02_TONE : /start a appelé executeWithAutoContinue → retourne la question tutoiement
 *    - STEP_03_BLOC1+ : /start retourne response="" → isReconnect=true → le frontend charge l'historique
 */
export async function initAxiomSession(params: {
  sessionId: string;
  firstName: string;
  lastName: string;
  email: string;
}): Promise<{ response: string; step: string; isReconnect?: boolean; currentBlock?: number }> {

  // Étape 1 : GET /start pour voir l'état courant de la session
  const startRes = await fetch(
    `/start?tenant=${TENANT_ID}&poste=${POSTE_ID}`,
    {
      headers: {
        'x-session-id': params.sessionId,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!startRes.ok) {
    // Fallback vers le comportement legacy si /start échoue
    throw new Error(`GET /start failed: HTTP ${startRes.status}`);
  }

  const startData = await startRes.json();

  // Étape 2A : Nouvelle session (identité pas encore soumise)
  if (!startData.step || startData.step === 'STEP_01_IDENTITY') {
    const identityMessage = `Prénom: ${params.firstName}\nNom: ${params.lastName}\nEmail: ${params.email}`;
    const axiomRes = await fetch('/axiom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: TENANT_ID,
        posteId: POSTE_ID,
        sessionId: params.sessionId,
        message: identityMessage,
      }),
    });
    if (!axiomRes.ok) {
      const err = await axiomRes.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${axiomRes.status}`);
    }
    const data = await axiomRes.json();
    return { response: data.response ?? '', step: data.step ?? '' };
  }

  // Étape 2B : Session existante (tutoiement non fait, ou session avancée)
  // - STEP_02_TONE : /start a retourné la question tutoiement via executeWithAutoContinue
  // - STEP_03_BLOC1 / BLOC_* : /start retourne response="" → reconnect
  const isReconnect = !startData.response || startData.response === '';
  return {
    response: startData.response ?? '',
    step: startData.step ?? '',
    isReconnect,
    currentBlock: startData.currentBlock,
  };
}

/**
 * Envoie un message via SSE streaming.
 * Appelle onToken pour chaque chunk, onDone quand le moteur termine.
 * Retourne une fonction d'annulation.
 */
export function sendAxiomMessage(
  sessionId: string,
  message: string,
  callbacks: AxiomStreamCallbacks,
  eventOverride?: string   // si fourni, envoie `event` au lieu de `message`
): AbortController {
  const controller = new AbortController();

  const body: Record<string, string> = {
    tenantId: TENANT_ID,
    posteId: POSTE_ID,
    sessionId,
  };
  if (eventOverride) {
    body.event = eventOverride;
  } else {
    body.message = message;
  }

  fetch('/axiom/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        callbacks.onError(`HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let eventType: string | null = null;

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (!raw) continue;

            try {
              const parsed = JSON.parse(raw);

              if (eventType === 'error' || parsed.error) {
                callbacks.onError(parsed.message || parsed.error || 'Erreur serveur');
                return;
              }

              if (eventType === 'done' || parsed.type === 'done') {
                callbacks.onDone(parsed as AxiomDoneEvent);
                return;
              }

              if (parsed.type === 'token' && parsed.content) {
                callbacks.onToken(parsed.content);
              }
            } catch {
              // chunk non-JSON — ignorer
            }

            eventType = null;
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        callbacks.onError(err.message || 'Erreur réseau');
      }
    });

  return controller;
}

/**
 * Parse le texte de synthèse final (Bloc 10) en champs structurés
 * pour alimenter les vues ADN / Prisme / Horizon.
 */
export function parseSynthesisText(text: string): Record<string, string> {
  const extract = (markers: string[]): string => {
    for (const marker of markers) {
      const idx = text.indexOf(marker);
      if (idx === -1) continue;
      const start = idx + marker.length;
      // Next section starts with ** or end of string
      const nextMatch = text.slice(start).search(/\*\*[🔥🧱⚖️🧩🛠️🎯🧠]/u);
      const end = nextMatch === -1 ? text.length : start + nextMatch;
      return text.slice(start, end).replace(/\*\*/g, '').trim();
    }
    return '';
  };

  return {
    mouvement: extract(['Ce qui te met vraiment en mouvement', '🔥']),
    temps: extract(['Comment tu tiens dans le temps', '🧱']),
    valeurs: extract(['Tes valeurs quand il faut agir', '⚖️']),
    projections: extract(['Ce que révèlent tes projections', '🧩']),
    forces: extract(['Tes vraies forces', '🛠️']),
    limites: extract(['Tes vraies limites', '🛠️']),
    positionnement: extract(['Ton positionnement professionnel naturel', '🎯']),
    lecture_globale: extract(['Lecture globale', '🧠']),
    raw: text,
  };
}

/**
 * Détermine si le step AXIOM ENGINE signale la fin du diagnostic.
 */
export function isDiagnosticComplete(step: string): boolean {
  return ['DONE_MATCHING', 'done_matching', 'STEP_99_MATCHING', 'STEP_99_MATCH_READY'].some(
    (s) => step.toUpperCase().includes(s.replace('STEP_', ''))
  ) || step.toUpperCase().includes('DONE') || step.toUpperCase().includes('MATCHING');
}
