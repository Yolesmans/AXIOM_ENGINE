// Configuration API
const API_BASE_URL = "https://axiomengine-production.up.railway.app";

// État de l'application
let sessionId = null;
let tenantId = null;
let posteId = null;
let isWaiting = false;
let showStartButton = false;
let isInitializing = false;
let hasActiveQuestion = false; // Verrou UI séquentiel : empêche l'affichage de plusieurs questions simultanément

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

  // LOT 1 : Protection anti-doublon - ne pas afficher le même message deux fois
  if (role === 'assistant') {
    const lastMessage = messagesContainer.lastElementChild;
    if (lastMessage && lastMessage.classList.contains('message-reveliom')) {
      const lastText = lastMessage.querySelector('p')?.textContent || '';
      const textTrimmed = (text || '').trim();
      
      // Vérifier si le dernier message assistant est identique au nouveau
      if (lastText === textTrimmed) {
        console.warn('[FRONTEND] [LOT1] Duplicate message detected, skipping');
        return; // Skip duplicate
      }
      
      // Anti-spam UI : ne pas empiler des cartes tone identiques
      const toneQuestion = 'Bienvenue dans AXIOM.\n' +
        'On va découvrir qui tu es vraiment — pas ce qu\'il y a sur ton CV.\n' +
        'Promis : je ne te juge pas. Je veux juste comprendre comment tu fonctionnes.\n\n' +
        'On commence tranquille.\n' +
        'Dis-moi : tu préfères qu\'on se tutoie ou qu\'on se vouvoie pour cette discussion ?';
      if (lastText === toneQuestion && textTrimmed === toneQuestion) {
        return; // Skip duplicate
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

// Fonction pour appeler l'API /axiom
async function callAxiom(message, event = null) {
  if (isWaiting || !sessionId) {
    return;
  }

  isWaiting = true;

  // Afficher l'indicateur de réflexion
  const typingIndicator = document.getElementById('typing-indicator');
  if (typingIndicator) {
    typingIndicator.classList.remove('hidden');
  }

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

    const response = await fetch(`${API_BASE_URL}/axiom`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // Masquer l'indicateur de réflexion
    if (typingIndicator) {
      typingIndicator.classList.add('hidden');
    }

    // Verrouiller sessionId : adopter immédiatement si fourni
    if (data.sessionId && typeof data.sessionId === 'string' && data.sessionId.trim() !== '') {
      sessionId = data.sessionId;
      localStorage.setItem(getStorageKey(), sessionId);
    }

    // Afficher la réponse (toujours présente)
    // LOT 1 : Afficher UNIQUEMENT la question/miroir courant, jamais plusieurs questions
    if (data.response) {
      // Affichage progressif des miroirs REVELIOM
      if (data.progressiveDisplay === true && Array.isArray(data.mirrorSections) && data.mirrorSections.length === 3) {
        // LOT 1 : Miroir seul, aucune question suivante dans le même message
        // Les miroirs progressifs NE verrouillent JAMAIS (isProgressiveMirror = true)
        // Afficher section 1️⃣
        addMessage('assistant', data.mirrorSections[0], true);
        
        // Attendre 900ms puis afficher section 2️⃣
        setTimeout(() => {
          addMessage('assistant', data.mirrorSections[1], true);
          
          // Attendre 900ms puis afficher section 3️⃣
          setTimeout(() => {
            addMessage('assistant', data.mirrorSections[2], true);
            // LOT 1 : Pas de question suivante affichée ici - le backend retourne uniquement le miroir
          }, 900);
        }, 900);
      } else {
        // Affichage normal (pas de découpage progressif)
        // LOT 1 : data.response doit contenir UNIQUEMENT une question ou UNIQUEMENT un miroir
        const responseText = data.response.trim();
        
        // Protection LOT 1 : Détecter et isoler une seule question/miroir
        // Si plusieurs questions sont présentes (séparateur ---QUESTION_SEPARATOR---), n'afficher que la première
        if (responseText.includes('---QUESTION_SEPARATOR---')) {
          // Plusieurs questions détectées → n'afficher que la première (LOT 1 : séquentiel strict)
          const firstQuestion = responseText.split('---QUESTION_SEPARATOR---')[0].trim();
          console.warn('[FRONTEND] [LOT1] Multiple questions detected in response, displaying only first question');
          addMessage('assistant', firstQuestion);
        } else {
          // Une seule question/miroir → afficher normalement
          // LOT 1 : Garantir qu'on n'affiche qu'un seul message assistant à la fois
          addMessage('assistant', responseText);
        }
      }
    }

    // Détection fin préambule → affichage bouton MVP
    if (data.step === 'STEP_03_BLOC1') {
      showStartButton = true;
      displayStartButton();
    } else if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false) {
      showStartButton = true;
      displayMatchingButton();
    } else if (data.expectsAnswer === true) {
      // Activer le verrou UI séquentiel : une question est maintenant active
      hasActiveQuestion = true;
      
      // Réafficher le champ de saisie si on attend une réponse
      const chatForm = document.getElementById('chat-form');
      if (chatForm) {
        chatForm.style.display = 'flex';
      }
      const userInput = document.getElementById('user-input');
      if (userInput) {
        userInput.disabled = false;
      }
    } else {
      // expectsAnswer === false : pas de question active (miroir, bouton, etc.)
      hasActiveQuestion = false;
    }

    return data;
  } catch (error) {
    if (typingIndicator) {
      typingIndicator.classList.add('hidden');
    }
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

// Initialisation au chargement
window.addEventListener('DOMContentLoaded', async () => {
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

    // Initialiser le gestionnaire de formulaire de chat
    const userInput = document.getElementById('user-input');
    if (chatForm && userInput) {
      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = userInput.value.trim();
        
        if (!message || isWaiting || !sessionId) {
          return;
        }

        // Désactiver le verrou UI séquentiel : l'utilisateur a répondu
        hasActiveQuestion = false;

        // Afficher le message de l'utilisateur
        addMessage('user', message);
        userInput.value = '';

        // Désactiver l'input
        userInput.disabled = true;

        try {
          const data = await callAxiom(message);

          // Réafficher l'input seulement si on attend une réponse et pas de bouton MVP
          if (data.expectsAnswer === true && !showStartButton) {
            userInput.disabled = false;
          } else if (showStartButton) {
            // Masquer le champ de saisie si le bouton MVP doit être affiché
            if (chatForm) {
              chatForm.style.display = 'none';
            }
          }
        } catch (error) {
          console.error('Erreur:', error);
          // Réactiver l'input en cas d'erreur
          userInput.disabled = false;
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
