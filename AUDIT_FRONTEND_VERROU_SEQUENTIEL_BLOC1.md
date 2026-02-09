# 🔍 AUDIT FRONTEND — VERROU SÉQUENTIEL STRICT (BLOC 1)
## LECTURE SEULE — AUCUNE MODIFICATION DE CODE

**Date** : 2025-01-27  
**Version** : Frontend actuel (ui-test/app.js)  
**Objectif** : Identifier pourquoi le BLOC 1 affiche toutes les questions d'un coup alors que le backend ne renvoie qu'une seule question par appel

---

## 1. FLUX EXACT D'AFFICHAGE DES MESSAGES ASSISTANT

### 1.1 Point d'entrée : `callAxiom()`

**Fichier** : `ui-test/app.js` (lignes 58-181)

**Déclencheurs** :
1. Clic sur bouton "Je commence mon profil" → `callAxiom(null, "START_BLOC_1")` (ligne 210)
2. Soumission formulaire chat → `callAxiom(message)` (ligne 470)
3. Soumission formulaire identité → `callAxiom(identityMessage)` (ligne 415)
4. Initialisation page → `/start` endpoint (ligne 319), puis `addMessage()` direct (ligne 334)

**Verrou anti-parallèle** :
```javascript
if (isWaiting || !sessionId) {
  return;
}
isWaiting = true;
// ... appel API ...
finally {
  isWaiting = false;
}
```

**✅ CONCLUSION** : Un seul appel API à la fois est possible grâce à `isWaiting`.

### 1.2 Traitement de la réponse API

**Fichier** : `ui-test/app.js` (lignes 113-150)

**Flux observé** :
```javascript
if (data.response) {
  if (data.progressiveDisplay === true && Array.isArray(data.mirrorSections) && data.mirrorSections.length === 3) {
    // Miroir progressif : 3 appels addMessage() avec setTimeout
    addMessage('assistant', data.mirrorSections[0]);
    setTimeout(() => addMessage('assistant', data.mirrorSections[1]), 900);
    setTimeout(() => addMessage('assistant', data.mirrorSections[2]), 900);
  } else {
    // Affichage normal : 1 seul appel addMessage()
    const responseText = data.response.trim();
    if (responseText.includes('---QUESTION_SEPARATOR---')) {
      const firstQuestion = responseText.split('---QUESTION_SEPARATOR---')[0].trim();
      addMessage('assistant', firstQuestion);
    } else {
      addMessage('assistant', responseText);
    }
  }
}
```

**⚠️ PROBLÈME IDENTIFIÉ #1** : Si `data.response` contient plusieurs questions SANS séparateur `---QUESTION_SEPARATOR---`, elles seront affichées en une seule fois.

**Exemple** :
```
data.response = "Question 1: ...\n\nQuestion 2: ...\n\nQuestion 3: ..."
→ addMessage('assistant', data.response) → Toutes les questions affichées d'un coup
```

### 1.3 Fonction `addMessage()`

**Fichier** : `ui-test/app.js` (lignes 19-55)

**Comportement** :
```javascript
function addMessage(role, text) {
  const messagesContainer = document.getElementById('messages');
  
  // Protection anti-doublon (uniquement égalité exacte)
  if (role === 'assistant') {
    const lastMessage = messagesContainer.lastElementChild;
    if (lastMessage && lastMessage.classList.contains('message-reveliom')) {
      const lastText = lastMessage.querySelector('p')?.textContent || '';
      if (lastText === text.trim()) {
        return; // Skip duplicate
      }
    }
  }
  
  // Création et ajout du message
  const messageDiv = document.createElement('div');
  messageDiv.className = `message-bubble message-${role === 'assistant' ? 'reveliom' : 'user'}`;
  const textP = document.createElement('p');
  textP.textContent = text || '';
  messageDiv.appendChild(textP);
  messagesContainer.appendChild(messageDiv);
}
```

**⚠️ PROBLÈME IDENTIFIÉ #2** : La protection anti-doublon vérifie uniquement l'égalité exacte du texte. Si deux questions différentes arrivent rapidement, elles seront toutes deux affichées.

**⚠️ PROBLÈME IDENTIFIÉ #3** : Aucune vérification de l'état "question active non répondue". Rien n'empêche d'afficher une nouvelle question si une question est déjà affichée.

---

## 2. SOURCE DE VÉRITÉ UI

### 2.1 État local JavaScript

**Variables d'état** :
- `isWaiting` : Verrou anti-parallèle pour les appels API (ligne 8)
- `showStartButton` : Flag pour afficher le bouton MVP (ligne 9)
- `sessionId`, `tenantId`, `posteId` : Identifiants de session (lignes 5-7)

**❌ ABSENCE** : Aucune variable d'état pour :
- "Question active actuellement affichée"
- "En attente de réponse utilisateur"
- "Nombre de questions affichées"

### 2.2 Source de vérité : DOM uniquement

**Structure HTML** :
```html
<main id="messages" class="messages"></main>
```

**Comportement** :
- Les messages sont ajoutés directement dans le DOM (`messagesContainer.appendChild(messageDiv)`)
- Aucun state JavaScript pour les messages
- Aucun localStorage pour les messages
- Aucun rejeu d'historique

**✅ CONCLUSION** : Le DOM est la source de vérité unique. Pas de state JavaScript pour les messages.

### 2.3 Détection de "question active"

**Code actuel** : Aucune détection explicite.

**Hypothèse** : Pour détecter une "question active", il faudrait :
1. Parcourir le DOM pour trouver le dernier message assistant
2. Vérifier si `data.expectsAnswer === true` (mais cette info n'est pas stockée dans le DOM)
3. Vérifier si l'input utilisateur est activé (mais pas fiable si plusieurs questions sont affichées)

**❌ PROBLÈME** : Aucune logique pour distinguer "question active" vs "question déjà répondue".

---

## 3. GESTION DU CYCLE

### 3.1 Cycle attendu (séquentiel strict)

**Comportement attendu** :
1. Backend envoie 1 question → Frontend affiche 1 question
2. Utilisateur répond → Frontend envoie réponse
3. Backend envoie 1 nouvelle question → Frontend affiche 1 nouvelle question
4. Répéter jusqu'à fin du bloc

### 3.2 Cycle réel observé

**Problème** : Si le backend envoie plusieurs questions dans `data.response` (sans séparateur), elles sont toutes affichées en une fois.

**Exemple de scénario problématique** :
```
1. Utilisateur clique "Je commence mon profil"
2. Backend répond avec data.response = "Q1\n\nQ2\n\nQ3" (sans séparateur)
3. Frontend appelle addMessage('assistant', "Q1\n\nQ2\n\nQ3")
4. Toutes les questions s'affichent d'un coup
```

### 3.3 État "en attente de réponse utilisateur"

**Code actuel** :
```javascript
if (data.expectsAnswer === true) {
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.style.display = 'flex';
  }
  const userInput = document.getElementById('user-input');
  if (userInput) {
    userInput.disabled = false;
  }
}
```

**✅ CONCLUSION** : Le frontend active l'input si `expectsAnswer === true`, mais ne vérifie pas si une question est déjà affichée.

**⚠️ PROBLÈME** : Si plusieurs questions sont affichées, l'input est activé pour toutes, sans distinction.

---

## 4. REJEU / ACCUMULATION

### 4.1 Rejeu d'historique

**Recherche effectuée** : Aucun rejeu d'historique détecté.

**Code vérifié** :
- Aucun `localStorage.getItem('messages')`
- Aucun `sessionStorage.getItem('messages')`
- Aucun state JavaScript pour les messages
- Aucun `messages.map()` ou `conversation.map()`

**✅ CONCLUSION** : Pas de rejeu d'historique. Les messages sont uniquement dans le DOM.

### 4.2 Accumulation dans le DOM

**Comportement** :
- Chaque appel à `addMessage()` ajoute un nouveau `<div>` dans `#messages`
- Les messages précédents restent dans le DOM (pas de suppression)
- Scroll automatique vers le bas (`messagesContainer.scrollTop = messagesContainer.scrollHeight`)

**✅ CONCLUSION** : Les messages s'accumulent dans le DOM, mais c'est le comportement attendu (historique conversationnel).

**⚠️ PROBLÈME POTENTIEL** : Si plusieurs questions sont affichées en une fois, elles restent toutes visibles dans le DOM, créant l'impression d'un affichage "en bloc".

---

## 5. ABSENCE DE VERROU SÉQUENTIEL

### 5.1 Verrou actuel : `isWaiting`

**Code** :
```javascript
let isWaiting = false;

async function callAxiom(message, event = null) {
  if (isWaiting || !sessionId) {
    return;
  }
  isWaiting = true;
  // ... appel API ...
  finally {
    isWaiting = false;
  }
}
```

**Fonction** : Empêche les appels API multiples en parallèle.

**Limite** : Ne vérifie pas l'état UI (nombre de questions affichées, question active non répondue).

### 5.2 Verrou manquant : "1 question active maximum"

**Conceptuellement, le verrou devrait être** :
```javascript
function hasActiveQuestion() {
  const messagesContainer = document.getElementById('messages');
  const lastMessage = messagesContainer.lastElementChild;
  
  if (!lastMessage || !lastMessage.classList.contains('message-reveliom')) {
    return false;
  }
  
  // Vérifier si expectsAnswer est true (nécessite de stocker cette info)
  // OU vérifier si l'input est activé
  const userInput = document.getElementById('user-input');
  return userInput && !userInput.disabled;
}

function addMessage(role, text) {
  if (role === 'assistant' && hasActiveQuestion()) {
    console.warn('[FRONTEND] Question active déjà affichée, refus d\'affichage');
    return; // Refuser d'afficher une nouvelle question
  }
  // ... affichage normal ...
}
```

**❌ PROBLÈME** : Cette logique n'existe pas actuellement.

### 5.3 Verrou manquant : "Refus d'affichage si question non validée"

**Conceptuellement, le verrou devrait être** :
```javascript
function shouldDisplayNewQuestion(data) {
  // Si expectsAnswer === true, vérifier qu'aucune question n'est déjà affichée
  if (data.expectsAnswer === true) {
    const activeQuestionCount = getActiveQuestionCount();
    if (activeQuestionCount > 0) {
      console.warn('[FRONTEND] Question active non répondue, refus d\'affichage');
      return false;
    }
  }
  return true;
}

if (data.response && shouldDisplayNewQuestion(data)) {
  addMessage('assistant', data.response);
}
```

**❌ PROBLÈME** : Cette logique n'existe pas actuellement.

---

## 6. DIAGNOSTIC DE LA CAUSE EXACTE

### 6.1 Hypothèse principale : Backend envoie plusieurs questions sans séparateur

**Scénario** :
1. Backend génère plusieurs questions dans `data.response` (sans `---QUESTION_SEPARATOR---`)
2. Frontend reçoit `data.response = "Q1\n\nQ2\n\nQ3"`
3. Frontend appelle `addMessage('assistant', "Q1\n\nQ2\n\nQ3")`
4. Toutes les questions s'affichent en une seule bulle de message

**Probabilité** : **FAIBLE** (le backend a un safeguard `normalizeSingleResponse()` qui devrait empêcher cela)

### 6.2 Hypothèse secondaire : Appels API multiples (race condition)

**Scénario** :
1. Utilisateur double-clic sur "Je commence mon profil"
2. Premier appel API → `isWaiting = true`
3. Deuxième appel API → bloqué par `isWaiting`
4. **MAIS** : Si le premier appel échoue ou prend du temps, le deuxième peut passer

**Probabilité** : **FAIBLE** (le verrou `isWaiting` devrait empêcher cela)

### 6.3 Hypothèse tertiaire : Absence de verrou UI séquentiel

**Scénario** :
1. Backend envoie 1 question → Frontend affiche 1 question
2. Utilisateur répond rapidement
3. Backend envoie 1 nouvelle question → Frontend affiche 1 nouvelle question
4. **MAIS** : Si le backend envoie plusieurs questions dans la même réponse (cas edge), elles sont toutes affichées

**Probabilité** : **MOYENNE** (le safeguard backend peut échouer dans certains cas)

### 6.4 Hypothèse quaternaire : Formatage de `data.response` non détecté

**Scénario** :
1. Backend envoie `data.response = "Q1\n\n---QUESTION_SEPARATOR---\n\nQ2"`
2. Frontend détecte le séparateur et ne garde que Q1
3. **MAIS** : Si le backend envoie `data.response = "Q1\n\nQ2"` (sans séparateur), les deux sont affichées

**Probabilité** : **MOYENNE** (le safeguard frontend ne détecte que le séparateur explicite)

---

## 7. HYPOTHÈSES DE CORRECTION UI POSSIBLES

### 7.1 Hypothèse 1 : Verrou "1 question active maximum"

**Concept** :
- Ajouter une variable d'état `hasActiveQuestion = false`
- Avant d'afficher une nouvelle question, vérifier `hasActiveQuestion === false`
- Si `hasActiveQuestion === true`, refuser l'affichage et logger un warning
- Mettre à jour `hasActiveQuestion = true` après affichage d'une question
- Mettre à jour `hasActiveQuestion = false` après réception d'une réponse utilisateur

**Avantages** :
- Simple à implémenter
- Garantit qu'une seule question est affichée à la fois
- Pas de modification backend nécessaire

**Risques** :
- Peut bloquer l'affichage de questions légitimes si le flag n'est pas réinitialisé correctement
- Nécessite de gérer les cas edge (erreur API, timeout, etc.)

**Effort** : **2h**

**Fichiers concernés** :
- `ui-test/app.js` (ajout variable d'état + logique de verrou)

---

### 7.2 Hypothèse 2 : Détection de plusieurs questions dans `data.response`

**Concept** :
- Améliorer la détection de plusieurs questions dans `data.response`
- Détecter les patterns : "Question 1:", "Question 2:", "1.", "2.", etc.
- Si plusieurs questions détectées, ne garder que la première

**Avantages** :
- Protection défensive supplémentaire
- Fonctionne même si le backend envoie plusieurs questions

**Risques** :
- Peut tronquer des questions légitimes si elles contiennent des patterns similaires
- Complexité de la regex/parsing

**Effort** : **3h**

**Fichiers concernés** :
- `ui-test/app.js` (amélioration de la détection dans `callAxiom()`)

---

### 7.3 Hypothèse 3 : Vérification DOM avant affichage

**Concept** :
- Avant d'afficher une nouvelle question, vérifier le DOM pour compter les messages assistant
- Si le dernier message assistant est une question (pas un miroir), refuser l'affichage
- Distinguer "question" vs "miroir" via le contenu ou un attribut data

**Avantages** :
- Source de vérité = DOM (cohérent avec l'architecture actuelle)
- Pas besoin de state JavaScript supplémentaire

**Risques** :
- Difficile de distinguer "question" vs "miroir" sans attribut data
- Peut bloquer l'affichage de questions légitimes si la détection échoue

**Effort** : **2h**

**Fichiers concernés** :
- `ui-test/app.js` (ajout logique de vérification DOM dans `addMessage()`)

---

### 7.4 Hypothèse 4 : Stockage de `expectsAnswer` dans le DOM

**Concept** :
- Ajouter un attribut `data-expects-answer="true"` sur les messages assistant qui sont des questions
- Avant d'afficher une nouvelle question, vérifier si un message avec `data-expects-answer="true"` existe déjà
- Si oui, refuser l'affichage

**Avantages** :
- Source de vérité = DOM
- Distinction claire entre "question" et "miroir"
- Pas besoin de state JavaScript

**Risques** :
- Nécessite de modifier la structure HTML (ajout attribut)
- Peut nécessiter une migration des messages existants

**Effort** : **2h**

**Fichiers concernés** :
- `ui-test/app.js` (ajout attribut dans `addMessage()`, vérification avant affichage)

---

## 8. RECOMMANDATION SAFE (FRONTEND UNIQUEMENT)

### 8.1 Approche recommandée : Combinaison Hypothèses 1 + 4

**Pourquoi** :
1. **Hypothèse 1** : Verrou simple et efficace avec state JavaScript
2. **Hypothèse 4** : Source de vérité DOM pour validation supplémentaire

**Avantages** :
- Double sécurité (state + DOM)
- Simple à implémenter
- Pas de modification backend nécessaire
- Compatible avec l'architecture actuelle

**Risques** :
- Peut nécessiter une gestion des cas edge (erreur API, timeout)
- Nécessite de maintenir la cohérence entre state et DOM

**Effort total** : **3h**

**Ordre d'implémentation** :
1. Hypothèse 1 (verrou state) — 2h
2. Hypothèse 4 (attribut DOM) — 1h

### 8.2 Approche alternative : Hypothèse 1 seule

**Si l'effort doit être minimal** :
- Implémenter uniquement l'Hypothèse 1 (verrou state).
- **Effort** : **2h**
- **Risque** : Le verrou peut échouer si le state n'est pas réinitialisé correctement.

---

## 9. TESTS DE NON-RÉGRESSION

### 9.1 Tests fonctionnels

1. **Test BLOC 1 — Affichage séquentiel**
   - Clic "Je commence mon profil"
   - Vérifier qu'une seule question s'affiche
   - Répondre à la question
   - Vérifier qu'une seule nouvelle question s'affiche

2. **Test BLOC 1 — Protection double-clic**
   - Double-clic rapide sur "Je commence mon profil"
   - Vérifier qu'une seule question s'affiche (pas de doublon)

3. **Test BLOC 1 — Protection réponse rapide**
   - Afficher une question
   - Répondre rapidement avant que le backend réponde
   - Vérifier qu'une seule nouvelle question s'affiche

### 9.2 Tests de non-régression

1. **Test miroir progressif**
   - Vérifier que les miroirs REVELIOM s'affichent toujours en 3 sections progressives

2. **Test affichage normal**
   - Vérifier que les questions normales (non-BLOC 1) s'affichent toujours correctement

3. **Test erreur API**
   - Simuler une erreur API
   - Vérifier que le verrou est réinitialisé correctement

---

## 10. CONCLUSION

### 10.1 Causes identifiées

1. **Absence de verrou UI séquentiel** : Rien n'empêche d'afficher une nouvelle question si une question est déjà affichée
2. **Détection incomplète de plusieurs questions** : Le safeguard frontend ne détecte que le séparateur explicite `---QUESTION_SEPARATOR---`
3. **Pas de distinction "question active" vs "question répondue"** : Le frontend ne distingue pas les questions actives des questions déjà répondues

### 10.2 Corrections recommandées

**Approche SAFE** : Hypothèses 1 + 4 (verrou state + attribut DOM)
- **Effort** : 3h
- **Risque** : Faible
- **Impact** : Fort (garantit l'affichage séquentiel strict)

**Approche MINIMALE** : Hypothèse 1 seule (verrou state)
- **Effort** : 2h
- **Risque** : Moyen (peut échouer si le state n'est pas réinitialisé)
- **Impact** : Moyen (améliore la protection mais pas aussi robuste)

### 10.3 Fichiers à modifier (approche SAFE)

1. `ui-test/app.js` :
   - Ajout variable d'état `hasActiveQuestion` (ligne ~8)
   - Ajout logique de verrou dans `addMessage()` (lignes 19-55)
   - Ajout attribut `data-expects-answer` dans `addMessage()` (ligne ~49)
   - Mise à jour du verrou dans `callAxiom()` (lignes 113-150)
   - Réinitialisation du verrou après réception réponse utilisateur (ligne ~463)

**Aucune modification backend nécessaire.**

---

**FIN DE L'AUDIT**
