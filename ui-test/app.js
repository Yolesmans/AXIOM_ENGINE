// Configuration API
const API_BASE_URL = "https://axiomengine-production.up.railway.app";

// Build stamp UI (diagnostic prod)
const FRONT_VERSION = "ui-test-2026-02-11a";
const GIT_SHA_UI = typeof window !== "undefined" && window.__AXIOM_GIT_SHA__ ? window.__AXIOM_GIT_SHA__ : "—";

// État de l'application
let sessionId = null;
let tenantId = null;
let posteId = null;
let isWaiting = false;
let showStartButton = false;
let isInitializing = false;
let hasActiveQuestion = false; // Verrou UI séquentiel : empêche l'affichage de plusieurs questions simultanément
let sendCounter = 0; // Compteur d'envoi pour id unique (diagnostic double requête)

// Phrases UX d'attente (processus, neutres, sans promesse)
const THINKING_PHRASES = [
  "Les réponses sont actuellement croisées afin d’identifier les constantes, les nuances et les points de tension qui structurent le fonctionnement professionnel global.",
  "Les éléments exprimés sont mis en relation pour comprendre ce qui fait sens ensemble, ce qui se renforce et ce qui mérite d’être clarifié avant d’aller plus loin.",
  "Une lecture transversale est en cours afin de dégager les logiques dominantes, les moteurs implicites et les équilibres qui émergent à travers les choix effectués.",
  "Les informations recueillies sont organisées pour transformer des réponses isolées en une vision cohérente et exploitable du profil professionnel.",
  "L’analyse se poursuit afin d’éviter toute interprétation hâtive et de respecter la complexité réelle des éléments exprimés jusqu’ici.",
  "Les données sont consolidées pour s’assurer que les conclusions reposent sur des liens solides plutôt que sur des impressions superficielles.",
  "Les réponses sont mises en perspective pour vérifier leur cohérence interne et identifier les axes qui se dégagent de manière récurrente.",
  "Une attention particulière est portée aux détails afin de ne pas lisser les spécificités et de préserver ce qui rend le profil singulier.",
  "Le contenu est en cours de structuration afin d’être restitué de manière claire, lisible et fidèle à ce qui a été exprimé.",
  "La formulation finale est préparée avec soin pour que chaque élément trouve sa place sans surinterprétation ni simplification excessive."
];

let lastPhraseIndex = -1;
let typingTimeoutId = null;
let thinkingLoopActive = false;
let hasReceivedFirstToken = false;

function getNextThinkingPhrase() {
  let index;
  do {
    index = Math.floor(Math.random() * THINKING_PHRASES.length);
  } while (index === lastPhraseIndex);
  lastPhraseIndex = index;
  return THINKING_PHRASES[index];
}

function typeSentence(sentence, onComplete) {
  const el = document.getElementById('thinking-text');
  if (!el) return;
  el.textContent = '';
  let i = 0;

  function typeNextChar() {
    if (hasReceivedFirstToken) return;
    if (i >= sentence.length) {
      onComplete && onComplete();
      return;
    }

    el.textContent += sentence[i];
    i++;

    // Vitesse humaine : variable + respiration
    let delay = 55 + Math.random() * 45; // 55–100 ms

    // Micro-pause naturelle après ponctuation
    if (/[.,;:!?]/.test(sentence[i - 1])) {
      delay += 200 + Math.random() * 200; // respiration
    }

    typingTimeoutId = setTimeout(typeNextChar, delay);
  }

  typeNextChar();
}

function startThinkingLoop() {
  const typingIndicator = document.getElementById('typing-indicator');
  const thinkingTextSpan = document.getElementById('thinking-text');
  if (!typingIndicator || !thinkingTextSpan) return;

  if (thinkingLoopActive) return;
  thinkingLoopActive = true;
  typingIndicator.classList.remove('hidden');

  const loop = () => {
    if (!thinkingLoopActive || hasReceivedFirstToken) return;

    const phrase = getNextThinkingPhrase();
    typeSentence(phrase, () => {
      if (!hasReceivedFirstToken) {
        setTimeout(loop, 800);
      }
    });
  };

  loop();
}

function stopThinkingLoop() {
  if (typingTimeoutId !== null) {
    clearTimeout(typingTimeoutId);
    typingTimeoutId = null;
  }
  thinkingLoopActive = false;
  const thinkingTextSpan = document.getElementById('thinking-text');
  if (thinkingTextSpan) {
    thinkingTextSpan.textContent = '';
  }
  const typingIndicator = document.getElementById('typing-indicator');
  if (typingIndicator) {
    typingIndicator.classList.add('hidden');
  }
}

// Fonction pour obtenir la clé localStorage
function getStorageKey() {
  return `axiom_sessionId_${tenantId}_${posteId}`;
}

// Fonction pour ajouter un message
// LOT 1 : Protection anti-doublon pour garantir séquentialité stricte
function addMessage(role, text, isProgressiveMirror = false) {
  const messagesContainer = document.getElementById('messages');
  if (!messagesContainer) return;

  // Verrou UI séquentiel : refuser d'afficher une nouvelle question si une question est déjà active
  if (role === 'assistant' && !isProgressiveMirror) {
    if (hasActiveQuestion) {
      console.warn('[FRONTEND] [SEQUENTIAL_LOCK] Question active déjà affichée, refus d\'affichage de nouvelle question');
      return; // Refuser d'afficher une nouvelle question
    }
  }

  // LOT 1 : Protection anti-doublon — comparer au dernier message ASSISTANT (pas au dernier nœud).
  // Sinon, après addMessage('user', …), lastElementChild est la bulle user → le doublon assistant n'est pas détecté → double rendu.
  if (role === 'assistant') {
    const textTrimmed = (text || '').trim();
    let lastAssistant = null;
    for (let i = messagesContainer.children.length - 1; i >= 0; i--) {
      const el = messagesContainer.children[i];
      if (el.classList.contains('message-reveliom')) {
        lastAssistant = el;
        break;
      }
    }
    if (lastAssistant) {
      const lastText = (lastAssistant.querySelector('p')?.textContent || '').trim();
      if (lastText === textTrimmed) {
        console.warn('[FRONTEND] [LOT1] Duplicate assistant message detected (idempotent display), skipping');
        return;
      }
      const toneQuestion = 'Bienvenue dans AXIOM.\n' +
        'On va découvrir qui tu es vraiment — pas ce qu\'il y a sur ton CV.\n' +
        'Promis : je ne te juge pas. Je veux juste comprendre comment tu fonctionnes.\n\n' +
        'On commence tranquille.\n' +
        'Dis-moi : tu préfères qu\'on se tutoie ou qu\'on se vouvoie pour cette discussion ?';
      if (lastText === toneQuestion && textTrimmed === toneQuestion) {
        return;
      }
    }
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `message-bubble message-${role === 'assistant' ? 'reveliom' : 'user'}`;
  const textP = document.createElement('p');
  textP.textContent = text || '';
  messageDiv.appendChild(textP);
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// SAFEGUARD : Extraire uniquement la première question d'un texte
// Garantit qu'une seule question est affichée même si le backend en envoie plusieurs
function extractFirstQuestion(text) {
  if (!text) return text;
  
  // Cas 1 : Détection séparateur explicite (déjà géré)
  if (text.includes('---QUESTION_SEPARATOR---')) {
    return text.split('---QUESTION_SEPARATOR---')[0].trim();
  }
  
  // Cas 2 : Détection sémantique — plusieurs points d'interrogation
  const questionMarks = (text.match(/\?/g) || []).length;
  if (questionMarks > 1) {
    // Chercher le premier point d'interrogation
    const firstQuestionEnd = text.indexOf('?');
    if (firstQuestionEnd !== -1) {
      const afterQuestionMark = text.substring(firstQuestionEnd + 1);
      // Chercher un double saut de ligne (fin de question probable)
      const nextDoubleLineBreak = afterQuestionMark.search(/\n\s*\n/);
      if (nextDoubleLineBreak !== -1) {
        const truncated = text.substring(0, firstQuestionEnd + 1 + nextDoubleLineBreak).trim();
        console.warn('[FRONTEND] [SEQUENTIAL_LOCK] Multiple questions detected (semantic) — displaying only first');
        return truncated;
      }
      // Sinon, prendre jusqu'au premier point d'interrogation inclus
      const truncated = text.substring(0, firstQuestionEnd + 1).trim();
      console.warn('[FRONTEND] [SEQUENTIAL_LOCK] Multiple questions detected (semantic) — displaying only first');
      return truncated;
    }
  }
  
  return text.trim();
}

// Fonction pour parser un flux SSE (text/event-stream)
async function readSSEStream(response, onToken, onDone, onError) {
  if (!response.body) {
    throw new Error('Streaming non supporté par ce navigateur');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let sepIndex;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);

      const lines = rawEvent.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;

      let eventName = 'message';
      let dataStr = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          // Autoriser plusieurs lignes data: en concaténant
          dataStr += payload;
        }
      }

      if (!dataStr) continue;

      let parsed;
      try {
        parsed = JSON.parse(dataStr);
      } catch (e) {
        console.error('[FRONTEND][SSE] JSON parse error:', e, dataStr);
        continue;
      }

      if (eventName === 'error' || parsed.type === 'error') {
        if (onError) onError(parsed);
        continue;
      }

      if (parsed.type === 'token') {
        if (onToken) onToken(parsed.content || '');
      } else if (parsed.type === 'done' || eventName === 'done') {
        if (onDone) onDone(parsed);
      }
    }
  }
}

// Fonction pour appeler l'API /axiom en mode streaming SSE
async function callAxiom(message, event = null) {
  sendCounter += 1;
  const sendId = `${Date.now()}-${sendCounter}`;
  const messagePreview = message != null ? String(message).trim().slice(0, 40) : (event ? `event=${event}` : '');
  console.log('[SEND]', sendId, { messagePreview, event: event || null });

  if (isWaiting || !sessionId) {
    console.warn('[SEND]', sendId, 'ignoré (isWaiting ou !sessionId)');
    return;
  }

  isWaiting = true;

  // Afficher l'indicateur de réflexion
  const typingIndicator = document.getElementById('typing-indicator');
  if (typingIndicator) {
    typingIndicator.classList.remove('hidden');
  }
  hasReceivedFirstToken = false;
  startThinkingLoop();

  // Masquer le bouton MVP s'il est visible
  const startButtonContainer = document.getElementById('mvp-start-button-container');
  if (startButtonContainer) {
    startButtonContainer.classList.add('hidden');
  }
  showStartButton = false;

  try {
    const body = {
      tenantId: tenantId,
      posteId: posteId,
      sessionId: sessionId,
      message: message,
    };
    if (event) {
      body.event = event;
    }

    const headers = {
      'Content-Type': 'application/json',
      'x-session-id': sessionId || '',
    };

    const response = await fetch(`${API_BASE_URL}/axiom/stream`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    const axiomBuildHeader = response.headers.get('X-AXIOM-BUILD') || '';
    if (axiomBuildHeader) {
      const backEl = document.getElementById('back-build');
      if (backEl) backEl.textContent = axiomBuildHeader.slice(0, 12);
    }

    let fullText = '';
    let finalData = null;

    // Élément de message streaming (une seule bulle, texte mis à jour au fil des tokens)
    let streamMessageDiv = null;
    let streamTextP = null;

    function ensureStreamMessageElement() {
      if (streamMessageDiv) return;
      const messagesContainer = document.getElementById('messages');
      if (!messagesContainer) return;

      streamMessageDiv = document.createElement('div');
      streamMessageDiv.className = 'message-bubble message-reveliom';
      streamTextP = document.createElement('p');
      streamTextP.textContent = '';
      streamMessageDiv.appendChild(streamTextP);
      messagesContainer.appendChild(streamMessageDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    await readSSEStream(
      response,
      (chunk) => {
        if (!chunk) return;

        // Premier token SSE réel → arrêter immédiatement la boucle UX et masquer le placeholder
        if (!hasReceivedFirstToken) {
          hasReceivedFirstToken = true;
          stopThinkingLoop();
        }

        fullText += chunk;
        // Affichage progressif en respectant le contrat « une seule question »
        const firstQuestion = extractFirstQuestion(fullText);
        ensureStreamMessageElement();
        if (streamTextP) {
          streamTextP.textContent = firstQuestion;
          const messagesContainer = document.getElementById('messages');
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }
      },
      (donePayload) => {
        finalData = donePayload;
      },
      (errPayload) => {
        console.error('[FRONTEND][SSE] error event:', errPayload);
      }
    );

    // Si aucun event done reçu, erreur
    if (!finalData) {
      throw new Error('Flux SSE terminé sans event done');
    }

    const data = finalData;

    // Masquer l'indicateur de réflexion (si encore visible)
    stopThinkingLoop();

    // Verrouiller sessionId : adopter immédiatement si fourni
    if (data.sessionId && typeof data.sessionId === 'string' && data.sessionId.trim() !== '') {
      sessionId = data.sessionId;
      localStorage.setItem(getStorageKey(), sessionId);
    }

    // Règle unique : ce que le serveur renvoie dans done.response = ce que l'utilisateur voit (transition + question en une seule réponse, pas d'extraction)
    // Toujours créer un message assistant si finalContent non vide (même si aucun token n'a été streamé)
    const finalContent = (data.response && data.response.trim()) ? data.response.trim() : '';
    if (streamMessageDiv && streamTextP) {
      streamTextP.textContent = finalContent;
      const messagesContainer = document.getElementById('messages');
      if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    if (finalContent && !streamMessageDiv) {
      addMessage('assistant', finalContent);
    }

    // Instrumentation (preuve) : corrélation sendId ↔ done + build
    const axiomBuild = response.headers.get('X-AXIOM-BUILD') || '';
    console.log('[UI] done', {
      sendId,
      step: data.step,
      currentBlock: data.currentBlock,
      responseLength: (data.response || '').length,
      responsePreview: (data.response || '').trim().slice(0, 80),
      sessionId: data.sessionId || sessionId,
      X_AXIOM_BUILD: axiomBuild,
    });

    // Détection fin préambule → affichage bouton MVP
    if (data.step === 'STEP_03_BLOC1') {
      showStartButton = true;
      displayStartButton();
    } else if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false) {
      showStartButton = true;
      displayMatchingButton();
    } else if (data.step === 'DONE_MATCHING') {
      // État terminal : masquer tout sauf le bouton FIN
      const chatForm = document.getElementById('chat-form');
      if (chatForm) {
        chatForm.style.display = 'none';
      }
      // Masquer les autres boutons (matching, start)
      const matchingButtonContainer = document.getElementById('mvp-matching-button-container');
      if (matchingButtonContainer) {
        matchingButtonContainer.classList.add('hidden');
      }
      const startButtonContainer = document.getElementById('mvp-start-button-container');
      if (startButtonContainer) {
        startButtonContainer.classList.add('hidden');
      }
      // Afficher uniquement le bouton FIN
      displayFinishButton();
    } else if (data.expectsAnswer === true) {
      // Question active : réafficher le champ de saisie
      hasActiveQuestion = true;
      const chatForm = document.getElementById('chat-form');
      if (chatForm) {
        chatForm.style.display = 'flex';
      }
      const userInput = document.getElementById('user-input');
      if (userInput) {
        userInput.disabled = false;
      }
    } else {
      hasActiveQuestion = false;
    }

    return data;
  } catch (error) {
    stopThinkingLoop();
    console.error('Erreur:', error);
    // En cas d'erreur API, relâcher le verrou pour permettre une nouvelle tentative
    hasActiveQuestion = false;
    throw error;
  } finally {
    isWaiting = false;
  }
}

// Fonction pour afficher le bouton MVP
function displayStartButton() {
  const messagesContainer = document.getElementById('messages');
  if (!messagesContainer) return;

  // Vérifier si le bouton existe déjà
  let buttonContainer = document.getElementById('mvp-start-button-container');
  if (!buttonContainer) {
    buttonContainer = document.createElement('div');
    buttonContainer.id = 'mvp-start-button-container';
    buttonContainer.className = 'mvp-start-button';
    messagesContainer.appendChild(buttonContainer);
  }

  buttonContainer.innerHTML = `
    <button id="mvp-start-button" type="button">
      Je commence mon profil
    </button>
  `;

  buttonContainer.classList.remove('hidden');

  // Gestionnaire de clic
  const startButton = document.getElementById('mvp-start-button');
  if (startButton) {
    startButton.addEventListener('click', async () => {
      startButton.disabled = true;
      await callAxiom(null, "START_BLOC_1");
    });
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Fonction pour afficher le bouton Matching
function displayMatchingButton() {
  const messagesContainer = document.getElementById('messages');
  if (!messagesContainer) return;

  // Vérifier si le bouton existe déjà
  let buttonContainer = document.getElementById('mvp-matching-button-container');
  if (!buttonContainer) {
    buttonContainer = document.createElement('div');
    buttonContainer.id = 'mvp-matching-button-container';
    buttonContainer.className = 'mvp-start-button';
    messagesContainer.appendChild(buttonContainer);
  }

  buttonContainer.innerHTML = `
    <button id="mvp-matching-button" type="button">
      👉 Je génère mon matching
    </button>
  `;

  buttonContainer.classList.remove('hidden');

  // Gestionnaire de clic
  const matchingButton = document.getElementById('mvp-matching-button');
  if (matchingButton) {
    matchingButton.addEventListener('click', async () => {
      matchingButton.disabled = true;
      await callAxiom(null, 'START_MATCHING');
    });
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Fonction pour afficher le bouton FIN
function displayFinishButton() {
  const messagesContainer = document.getElementById('messages');
  if (!messagesContainer) return;

  // Vérifier si le bouton existe déjà (éviter les doublons)
  let buttonContainer = document.getElementById('mvp-finish-button-container');
  if (!buttonContainer) {
    buttonContainer = document.createElement('div');
    buttonContainer.id = 'mvp-finish-button-container';
    buttonContainer.className = 'mvp-start-button';
    messagesContainer.appendChild(buttonContainer);
  }

  buttonContainer.innerHTML = `
    <button id="mvp-finish-button" type="button">
      FIN
    </button>
  `;

  buttonContainer.classList.remove('hidden');

  // Gestionnaire de clic : redirection vers Tally
  const finishButton = document.getElementById('mvp-finish-button');
  if (finishButton) {
    finishButton.addEventListener('click', () => {
      finishButton.disabled = true;
      window.location.href = 'https://tally.so/r/44JLbB';
    });
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Initialisation au chargement
window.addEventListener('DOMContentLoaded', async () => {
  // Build stamp footer (diagnostic prod)
  const frontVersionEl = document.getElementById('front-version');
  if (frontVersionEl) frontVersionEl.textContent = FRONT_VERSION;
  console.log('[AXIOM] FRONT_VERSION=', FRONT_VERSION, 'GIT_SHA_UI=', GIT_SHA_UI);

  // Garde anti-double initialisation
  if (isInitializing) {
    return;
  }
  isInitializing = true;

  try {
    // Vérifier que #app existe
    const app = document.getElementById('app');
    if (!app) {
      throw new Error('Element #app not found');
    }

  // Masquer le chat input au départ
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.style.display = 'none';
  }

  // Récupérer tenant et poste depuis l'URL
  const urlParams = new URLSearchParams(window.location.search);
  tenantId = urlParams.get('tenant');
  posteId = urlParams.get('poste');

  // Si tenant ou poste manquent dans l'URL, essayer de les récupérer depuis localStorage
  if (!tenantId || !posteId) {
    const savedTenant = localStorage.getItem('axiom_tenant');
    const savedPoste = localStorage.getItem('axiom_poste');
    if (savedTenant && savedPoste) {
      tenantId = savedTenant;
      posteId = savedPoste;
      // Réinjecter les paramètres dans l'URL sans recharger
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('tenant', tenantId);
      newUrl.searchParams.set('poste', posteId);
      window.history.replaceState({}, '', newUrl.toString());
    }
  }

  // Si tenant ou poste manquent toujours, afficher erreur claire
  if (!tenantId || !posteId) {
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'message-bubble message-reveliom';
      const errorP = document.createElement('p');
      errorP.textContent = 'Erreur : les paramètres tenant et poste sont requis dans l\'URL.';
      errorDiv.appendChild(errorP);
      messagesContainer.appendChild(errorDiv);
    }
    return;
  }

  // Sauvegarder tenant et poste dans localStorage
  localStorage.setItem('axiom_tenant', tenantId);
  localStorage.setItem('axiom_poste', posteId);

  // Récupérer sessionId depuis localStorage avec clé tenant+poste
  const storageKey = getStorageKey();
  sessionId = localStorage.getItem(storageKey);

  // Appeler /start avec header x-session-id (toujours envoyé)
    const headers = {
      'x-session-id': sessionId || '',
    };

    const response = await fetch(`${API_BASE_URL}/start?tenant=${tenantId}&poste=${posteId}`, {
      headers: headers,
    });
    const data = await response.json();

    // Verrouiller sessionId : adopter immédiatement si fourni
    if (data.sessionId && typeof data.sessionId === 'string' && data.sessionId.trim() !== '') {
      sessionId = data.sessionId;
      localStorage.setItem(storageKey, sessionId);
    }

    if (data.sessionId) {

      // AFFICHER IMMÉDIATEMENT le message AVANT toute condition
      if (data.response) {
        addMessage('assistant', data.response);
      }

      // Détection fin préambule → affichage bouton MVP
      if (data.step === 'STEP_03_BLOC1') {
        showStartButton = true;
        displayStartButton();
        // Masquer le champ de saisie
        if (chatForm) {
          chatForm.style.display = 'none';
        }
      } else if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false) {
        showStartButton = true;
        displayMatchingButton();
        // Masquer le champ de saisie
        if (chatForm) {
          chatForm.style.display = 'none';
        }
      } else if (data.step === 'DONE_MATCHING') {
        // État terminal : masquer tout sauf le bouton FIN
        if (chatForm) {
          chatForm.style.display = 'none';
        }
        // Masquer les autres boutons (matching, start)
        const matchingButtonContainer = document.getElementById('mvp-matching-button-container');
        if (matchingButtonContainer) {
          matchingButtonContainer.classList.add('hidden');
        }
        const startButtonContainer = document.getElementById('mvp-start-button-container');
        if (startButtonContainer) {
          startButtonContainer.classList.add('hidden');
        }
        // Afficher uniquement le bouton FIN
        displayFinishButton();
      }

      // ENSUITE SEULEMENT, gérer le state
      if (data.state === 'identity') {
        // Afficher le formulaire d'identité SOUS le message
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
          const formDiv = document.createElement('div');
          formDiv.className = 'identity-form-container';
          formDiv.id = 'identity-form-container';
          formDiv.innerHTML = `
            <form id="identity-form" class="identity-form">
              <input
                type="text"
                id="identity-firstname"
                placeholder="Prénom"
                required
                autocomplete="given-name"
              />
              <input
                type="text"
                id="identity-lastname"
                placeholder="Nom"
                required
                autocomplete="family-name"
              />
              <input
                type="email"
                id="identity-email"
                placeholder="Email"
                required
                autocomplete="email"
              />
              <button type="submit">Continuer</button>
            </form>
          `;
          messagesContainer.appendChild(formDiv);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;

          // Gestionnaire pour le formulaire d'identité
          const identityForm = document.getElementById('identity-form');
          if (identityForm) {
            identityForm.addEventListener('submit', async (e) => {
              e.preventDefault();

              const firstName = document.getElementById('identity-firstname').value.trim();
              const lastName = document.getElementById('identity-lastname').value.trim();
              const email = document.getElementById('identity-email').value.trim();

              if (!firstName || !lastName || !email) {
                return;
              }

              // Construire le message au format demandé
              const identityMessage = `Prénom: ${firstName}\nNom: ${lastName}\nEmail: ${email}`;

              // Afficher le message utilisateur
              addMessage('user', identityMessage);

              // Masquer le formulaire d'identité
              formDiv.style.display = 'none';

              try {
                const data = await callAxiom(identityMessage);

                // Si on n'est plus en state "identity", activer le chat normal
                if (data.state !== 'identity' && !showStartButton) {
                  if (chatForm) {
                    chatForm.style.display = 'flex';
                  }
                  const userInput = document.getElementById('user-input');
                  if (userInput) {
                    userInput.disabled = false;
                  }
                } else if (showStartButton) {
                  // Masquer le champ de saisie si le bouton MVP doit être affiché
                  if (chatForm) {
                    chatForm.style.display = 'none';
                  }
                }
              } catch (error) {
                console.error('Erreur:', error);
              }
            });
          }
        }
      } else {
        // Si pas en state "identity", activer le chat
        if (chatForm) {
          chatForm.style.display = 'flex';
        }
        const userInput = document.getElementById('user-input');
        if (userInput) {
          userInput.disabled = false;
        }
      }
    }

    // Un seul point d'envoi : submit du formulaire (Enter ou clic Envoyer). Verrou strict = 1 submit → 1 requête.
    const userInput = document.getElementById('user-input');
    let submitInProgress = false;
    if (chatForm && userInput) {
      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const submitButton = chatForm.querySelector('button[type="submit"]');
        if (submitInProgress) {
          console.warn('[SEND] submit ignoré (double soumission)');
          return;
        }
        submitInProgress = true;
        if (submitButton) submitButton.disabled = true;

        const message = userInput.value.trim();
        if (!message || isWaiting || !sessionId) {
          submitInProgress = false;
          if (submitButton) submitButton.disabled = false;
          return;
        }

        hasActiveQuestion = false;
        addMessage('user', message);
        userInput.value = '';
        userInput.disabled = true;

        try {
          const data = await callAxiom(message);
          if (data && data.expectsAnswer === true && !showStartButton) {
            userInput.disabled = false;
          } else if (data && showStartButton) {
            if (chatForm) chatForm.style.display = 'none';
          }
        } catch (error) {
          console.error('Erreur:', error);
          userInput.disabled = false;
        } finally {
          submitInProgress = false;
          if (submitButton) submitButton.disabled = false;
        }
      });
    }
  } catch (error) {
    console.error('Erreur:', error);
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'message-bubble message-reveliom';
      const errorP = document.createElement('p');
      errorP.textContent = 'Erreur de connexion au serveur.';
      errorDiv.appendChild(errorP);
      messagesContainer.appendChild(errorDiv);
    }
  } finally {
    isInitializing = false;
  }
});
