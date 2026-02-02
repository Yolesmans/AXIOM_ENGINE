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

        // AFFICHER TOUJOURS la réponse API dans le DOM
        const responseText = data.response || '';
        
        // Injecter explicitement le message et le formulaire
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
          // Afficher le message REVELIOM
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message-bubble message-reveliom';
          const textP = document.createElement('p');
          textP.textContent = responseText;
          messageDiv.appendChild(textP);
          messagesContainer.appendChild(messageDiv);

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

                // Remplacer le contenu de #app par l'UI chat complète
                app.innerHTML = `
                  <header class="header">
                    <h1>REVELIOM</h1>
                    <p class="subtitle">Analyse de votre fonctionnement professionnel</p>
                  </header>
                  <main id="messages" class="messages"></main>
                  <div id="typing-indicator" class="typing hidden">
                    <span>REVELIOM réfléchit</span>
                    <span class="dots">
                      <span>.</span><span>.</span><span>.</span>
                    </span>
                  </div>
                  <form id="chat-form" class="input-area">
                    <input
                      id="user-input"
                      type="text"
                      placeholder="Tapez votre message…"
                      autocomplete="off"
                      required
                    />
                    <button type="submit">Envoyer</button>
                  </form>
                `;

                // Réinjecter tous les messages précédents
                const newMessagesContainer = document.getElementById('messages');
                if (newMessagesContainer) {
                  // Réafficher le message initial
                  const initialMessageDiv = document.createElement('div');
                  initialMessageDiv.className = 'message-bubble message-reveliom';
                  const initialTextP = document.createElement('p');
                  initialTextP.textContent = responseText;
                  initialMessageDiv.appendChild(initialTextP);
                  newMessagesContainer.appendChild(initialMessageDiv);

                  // Réafficher le message utilisateur
                  const userMsgDiv = document.createElement('div');
                  userMsgDiv.className = 'message-bubble message-user';
                  const userMsgTextP = document.createElement('p');
                  userMsgTextP.textContent = identityMessage;
                  userMsgDiv.appendChild(userMsgTextP);
                  newMessagesContainer.appendChild(userMsgDiv);

                  // Réafficher la réponse du moteur
                  if (data.response) {
                    const respDiv = document.createElement('div');
                    respDiv.className = 'message-bubble message-reveliom';
                    const respTextP = document.createElement('p');
                    respTextP.textContent = data.response;
                    respDiv.appendChild(respTextP);
                    newMessagesContainer.appendChild(respDiv);
                  }
                }

                // Réinitialiser les gestionnaires d'événements
                const chatForm = document.getElementById('chat-form');
                const userInput = document.getElementById('user-input');
                
                if (chatForm && userInput) {
                  chatForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const message = userInput.value.trim();
                    
                    if (!message || isWaiting || !sessionId) {
                      return;
                    }

                    // Afficher le message de l'utilisateur
                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'message-bubble message-user';
                    const msgTextP = document.createElement('p');
                    msgTextP.textContent = message;
                    msgDiv.appendChild(msgTextP);
                    newMessagesContainer.appendChild(msgDiv);
                    userInput.value = '';

                    // Désactiver l'input
                    userInput.disabled = true;
                    isWaiting = true;

                    // Afficher l'indicateur de réflexion
                    const typing = document.getElementById('typing-indicator');
                    if (typing) {
                      typing.classList.remove('hidden');
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
                      if (typing) {
                        typing.classList.add('hidden');
                      }

                      if (data.response) {
                        const responseDiv = document.createElement('div');
                        responseDiv.className = 'message-bubble message-reveliom';
                        const responseTextP = document.createElement('p');
                        responseTextP.textContent = data.response;
                        responseDiv.appendChild(responseTextP);
                        newMessagesContainer.appendChild(responseDiv);
                      }

                      // Mettre à jour sessionId si fourni
                      if (data.sessionId && data.sessionId !== sessionId) {
                        sessionId = data.sessionId;
                        localStorage.setItem('reveliom_sessionId', sessionId);
                      }
                    } catch (error) {
                      if (typing) {
                        typing.classList.add('hidden');
                      }
                      console.error('Erreur:', error);
                    }

                    // Réactiver l'input
                    userInput.disabled = false;
                    isWaiting = false;
                  });
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
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  } else {
    // Session existante : activer le chat directement
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    
    if (chatForm && userInput) {
      userInput.disabled = false;
      
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
