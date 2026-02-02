// Configuration API
const API_BASE_URL = "https://axiom-engine-eight.vercel.app";

// État de l'application
let sessionId = null;
let tenantId = null;
let posteId = null;
let isWaiting = false;

// Fonction pour obtenir la clé localStorage
function getStorageKey() {
  return `axiom_sessionId_${tenantId}_${posteId}`;
}

// Fonction pour ajouter un message
function addMessage(role, text) {
  const messagesContainer = document.getElementById('messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `message-bubble message-${role === 'assistant' ? 'reveliom' : 'user'}`;
  const textP = document.createElement('p');
  textP.textContent = text || '';
  messageDiv.appendChild(textP);
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Initialisation au chargement
window.addEventListener('DOMContentLoaded', async () => {
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

  // Si tenant ou poste manquent, afficher erreur claire
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

  // Récupérer sessionId depuis localStorage avec clé tenant+poste
  const storageKey = getStorageKey();
  sessionId = localStorage.getItem(storageKey);

  // Appeler /start avec header x-session-id si présent
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (sessionId) {
      headers['x-session-id'] = sessionId;
    }

    const response = await fetch(`${API_BASE_URL}/start?tenant=${tenantId}&poste=${posteId}`, {
      headers: headers,
    });
    const data = await response.json();

    if (data.sessionId) {
      sessionId = data.sessionId;
      localStorage.setItem(storageKey, sessionId);

      // AFFICHER IMMÉDIATEMENT le message AVANT toute condition
      if (data.response) {
        addMessage('assistant', data.response);
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

              // Afficher l'indicateur de réflexion
              const typingIndicator = document.getElementById('typing-indicator');
              if (typingIndicator) {
                typingIndicator.classList.remove('hidden');
              }

              try {
                const response = await fetch(`${API_BASE_URL}/axiom`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-session-id': sessionId,
                  },
                  body: JSON.stringify({
                    tenantId: tenantId,
                    posteId: posteId,
                    sessionId: sessionId,
                    message: identityMessage,
                  }),
                });

                const data = await response.json();

                // Masquer l'indicateur de réflexion
                if (typingIndicator) {
                  typingIndicator.classList.add('hidden');
                }

                // Mettre à jour sessionId si fourni
                if (data.sessionId && data.sessionId !== sessionId) {
                  sessionId = data.sessionId;
                  localStorage.setItem(storageKey, sessionId);
                }

                // Afficher la réponse du moteur (toujours présente)
                if (data.response) {
                  addMessage('assistant', data.response);
                }

                // Si on n'est plus en state "identity", activer le chat normal
                if (data.state !== 'identity') {
                  if (chatForm) {
                    chatForm.style.display = 'flex';
                  }
                  const userInput = document.getElementById('user-input');
                  if (userInput) {
                    userInput.disabled = false;
                  }
                }
              } catch (error) {
                if (typingIndicator) {
                  typingIndicator.classList.add('hidden');
                }
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

      // Afficher le message de l'utilisateur
      addMessage('user', message);
      userInput.value = '';

      // Désactiver l'input
      userInput.disabled = true;
      isWaiting = true;

      // Afficher l'indicateur de réflexion
      const typingIndicator = document.getElementById('typing-indicator');
      if (typingIndicator) {
        typingIndicator.classList.remove('hidden');
      }

      try {
        const response = await fetch(`${API_BASE_URL}/axiom`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId,
          },
          body: JSON.stringify({
            tenantId: tenantId,
            posteId: posteId,
            sessionId: sessionId,
            message: message,
          }),
        });

        const data = await response.json();

        // Masquer l'indicateur de réflexion
        if (typingIndicator) {
          typingIndicator.classList.add('hidden');
        }

        // Afficher la réponse (toujours présente)
        if (data.response) {
          addMessage('assistant', data.response);
        }

        // Mettre à jour sessionId si fourni
        if (data.sessionId && data.sessionId !== sessionId) {
          sessionId = data.sessionId;
          localStorage.setItem(getStorageKey(), sessionId);
        }
      } catch (error) {
        if (typingIndicator) {
          typingIndicator.classList.add('hidden');
        }
        console.error('Erreur:', error);
      }

      // Réactiver l'input
      userInput.disabled = false;
      isWaiting = false;
    });
  }
});
