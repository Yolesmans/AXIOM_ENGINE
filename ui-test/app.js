// Configuration API
const API_BASE_URL = "https://axiom-engine-eight.vercel.app";

// État de l'application
let sessionId = null;
let tenantId = null;
let posteId = null;
let isWaiting = false;
let currentState = null;

// Éléments DOM
const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const chatForm = document.getElementById('chat-form');
const typingIndicator = document.getElementById('typing-indicator');

// Initialisation au chargement
window.addEventListener('DOMContentLoaded', async () => {
  // Récupérer tenant et poste depuis l'URL
  const urlParams = new URLSearchParams(window.location.search);
  tenantId = urlParams.get('tenant');
  posteId = urlParams.get('poste');

  if (!tenantId || !posteId) {
    return;
  }

  // Masquer le chat par défaut
  disableChat();

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
        currentState = data.state;

        // Afficher IMMEDIATEMENT le message de l'API
        if (data.response) {
          showMessage(data.response, 'reveliom');
        }

        // Si state === "identity", afficher le formulaire d'identité
        if (data.state === 'identity') {
          showIdentityForm();
          return;
        }

        // Sinon, activer le chat
        enableChat();
        enableInput();
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  } else {
    // Session existante : activer le chat directement
    enableChat();
    enableInput();
  }
});

// Désactiver le chat (masquer le formulaire)
function disableChat() {
  if (chatForm) {
    chatForm.style.display = 'none';
  }
}

// Activer le chat (afficher le formulaire)
function enableChat() {
  if (chatForm) {
    chatForm.style.display = 'flex';
  }
}

// Afficher le formulaire d'identité
function showIdentityForm() {
  // Vérifier si le formulaire existe déjà
  if (document.getElementById('identity-form-container')) {
    return;
  }

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
  scrollToBottom();

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

      // Masquer le formulaire d'identité
      formDiv.style.display = 'none';

      // Afficher le message utilisateur
      showMessage(identityMessage, 'user');

      // Désactiver l'input
      disableInput();

      // Afficher l'indicateur de réflexion
      showTyping();

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
        hideTyping();

        // Mettre à jour sessionId et state si fournis
        if (data.sessionId && data.sessionId !== sessionId) {
          sessionId = data.sessionId;
          localStorage.setItem('reveliom_sessionId', sessionId);
        }
        if (data.state) {
          currentState = data.state;
        }

        // Afficher UNIQUEMENT la réponse du moteur
        if (data.response) {
          showMessage(data.response, 'reveliom');
        }

        // Si on n'est plus en state "identity", activer le chat normal
        if (data.state !== 'identity') {
          enableChat();
          enableInput();
        } else {
          // Si toujours en identity, réafficher le formulaire
          formDiv.style.display = 'block';
        }
      } catch (error) {
        hideTyping();
        console.error('Erreur:', error);
        enableInput();
      }
    });
  }
}

// Afficher un message dans la zone de chat
function showMessage(text, type) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message-bubble message-${type}`;
  
  const textP = document.createElement('p');
  textP.textContent = text;
  messageDiv.appendChild(textP);

  messagesContainer.appendChild(messageDiv);
  scrollToBottom();
}

// Scroll automatique vers le bas
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Afficher/masquer l'indicateur de frappe
function showTyping() {
  if (typingIndicator) {
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
  }
}

function hideTyping() {
  if (typingIndicator) {
    typingIndicator.classList.add('hidden');
  }
}

// Activer/désactiver l'input
function enableInput() {
  if (userInput) {
    userInput.disabled = false;
  }
  isWaiting = false;
}

function disableInput() {
  if (userInput) {
    userInput.disabled = true;
  }
  isWaiting = true;
}

// Envoyer un message
async function sendMessage(e) {
  e.preventDefault();
  
  const message = userInput.value.trim();
  
  if (!message || isWaiting || !sessionId) {
    return;
  }

  // Afficher le message de l'utilisateur
  showMessage(message, 'user');
  userInput.value = '';

  // Désactiver l'input
  disableInput();

  // Afficher l'indicateur de réflexion
  showTyping();

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
    hideTyping();

    if (data.response) {
      showMessage(data.response, 'reveliom');
    }

    // Mettre à jour sessionId si fourni
    if (data.sessionId && data.sessionId !== sessionId) {
      sessionId = data.sessionId;
      localStorage.setItem('reveliom_sessionId', sessionId);
    }
    if (data.state) {
      currentState = data.state;
    }
  } catch (error) {
    hideTyping();
    console.error('Erreur:', error);
  }

  // Réactiver l'input
  enableInput();
}

// Gestionnaire d'événement pour le formulaire
if (chatForm) {
  chatForm.addEventListener('submit', sendMessage);
}
