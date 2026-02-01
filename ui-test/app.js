// Configuration API
const API_BASE_URL = "https://axiom-engine-eight.vercel.app";

// État de l'application
let sessionId = null;
let tenantId = null;
let posteId = null;
let isWaiting = false;

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

        if (data.response) {
          showMessage(data.response, 'reveliom');
        }
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  }

  enableInput();
});

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
  typingIndicator.classList.remove('hidden');
  scrollToBottom();
}

function hideTyping() {
  typingIndicator.classList.add('hidden');
}

// Activer/désactiver l'input
function enableInput() {
  userInput.disabled = false;
  isWaiting = false;
}

function disableInput() {
  userInput.disabled = true;
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
  } catch (error) {
    hideTyping();
    console.error('Erreur:', error);
  }

  // Réactiver l'input
  enableInput();
}

// Gestionnaire d'événement pour le formulaire
chatForm.addEventListener('submit', sendMessage);
