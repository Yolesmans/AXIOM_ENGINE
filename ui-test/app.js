// Configuration API
const API_BASE_URL = "https://axiom-engine-eight.vercel.app";

// État de l'application
let sessionId = null;
let tenantId = null;
let posteId = null;
let isWaiting = false;

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

  if (!tenantId || !posteId) {
    return;
  }

  // Récupérer sessionId depuis localStorage ou créer une nouvelle session
  sessionId = localStorage.getItem('reveliom_sessionId');

  if (!sessionId) {
    // Créer une nouvelle session
    try {
      const response = await fetch(`${API_BASE_URL}/start?tenant=${tenantId}&poste=${posteId}`);
      const data = await response.json();

      if (data.sessionId) {
        sessionId = data.sessionId;
        localStorage.setItem('reveliom_sessionId', sessionId);

        // Récupérer le message de l'API
        const responseText = data.response || '';
        
        // Injecter IMMEDIATEMENT le message dans la zone messages
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer && responseText) {
          // Afficher le message REVELIOM AVANT toute interaction
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message-bubble message-reveliom';
          const textP = document.createElement('p');
          textP.textContent = responseText;
          messageDiv.appendChild(textP);
          messagesContainer.appendChild(messageDiv);

          // Scroll vers le bas pour voir le message
          messagesContainer.scrollTop = messagesContainer.scrollHeight;

          // Si state === "identity", afficher le formulaire d'identité APRÈS le message
          if (data.state === 'identity') {
            // Injecter explicitement le formulaire d'identité
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
                const userMessageDiv = document.createElement('div');
                userMessageDiv.className = 'message-bubble message-user';
                const userTextP = document.createElement('p');
                userTextP.textContent = identityMessage;
                userMessageDiv.appendChild(userTextP);
                messagesContainer.appendChild(userMessageDiv);

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
                    localStorage.setItem('reveliom_sessionId', sessionId);
                  }

                  // Afficher la réponse du moteur
                  if (data.response) {
                    const responseDiv = document.createElement('div');
                    responseDiv.className = 'message-bubble message-reveliom';
                    const responseTextP = document.createElement('p');
                    responseTextP.textContent = data.response;
                    responseDiv.appendChild(responseTextP);
                    messagesContainer.appendChild(responseDiv);
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
          } else {
            // Si pas en state "identity", activer le chat après affichage du message
            if (chatForm) {
              chatForm.style.display = 'flex';
            }
            const userInput = document.getElementById('user-input');
            if (userInput) {
              userInput.disabled = false;
            }
          }
        }
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  } else {
    // Session existante : activer le chat directement
    if (chatForm) {
      chatForm.style.display = 'flex';
    }
    const userInput = document.getElementById('user-input');
    if (userInput) {
      userInput.disabled = false;
    }
    
    if (chatForm && userInput) {
      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = userInput.value.trim();
        
        if (!message || isWaiting || !sessionId) {
          return;
        }

        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
          // Afficher le message de l'utilisateur
          const msgDiv = document.createElement('div');
          msgDiv.className = 'message-bubble message-user';
          const msgTextP = document.createElement('p');
          msgTextP.textContent = message;
          msgDiv.appendChild(msgTextP);
          messagesContainer.appendChild(msgDiv);
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

            if (data.response) {
              const responseDiv = document.createElement('div');
              responseDiv.className = 'message-bubble message-reveliom';
              const responseTextP = document.createElement('p');
              responseTextP.textContent = data.response;
              responseDiv.appendChild(responseTextP);
              messagesContainer.appendChild(responseDiv);
            }

            // Mettre à jour sessionId si fourni
            if (data.sessionId && data.sessionId !== sessionId) {
              sessionId = data.sessionId;
              localStorage.setItem('reveliom_sessionId', sessionId);
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
        }
      });
    }
  }
});
