# 🔍 AUDIT FRONTEND / BACKEND — CONTRAT BLOC 1 (LECTURE SEULE)

**Date** : Audit en lecture seule, aucune modification  
**Objectif** : Identifier pourquoi le BLOC 1 s'affiche en entier côté UI alors que le backend ne sert qu'une question à la fois

---

## 1️⃣ FRONTEND — AFFICHAGE DU CHAT

### Fichier principal
**`ui-test/app.js`** — Fichier JavaScript unique pour toute l'UI

### Fonction d'affichage des messages
**`addMessage(role, text)`** — Lignes 18-55

```javascript
function addMessage(role, text) {
  const messagesContainer = document.getElementById('messages');
  if (!messagesContainer) return;

  // Protection anti-doublon (LOT 1)
  if (role === 'assistant') {
    const lastMessage = messagesContainer.lastElementChild;
    if (lastMessage && lastMessage.classList.contains('message-reveliom')) {
      const lastText = lastMessage.querySelector('p')?.textContent || '';
      const textTrimmed = (text || '').trim();
      
      if (lastText === textTrimmed) {
        console.warn('[FRONTEND] [LOT1] Duplicate message detected, skipping');
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
```

**Comportement** :
- Crée un `<div>` avec classe `message-bubble message-reveliom` (assistant) ou `message-user` (user)
- Ajoute un `<p>` avec le texte
- Ajoute au conteneur `#messages` (DOM direct, pas de state)
- **Aucune logique de réaffichage d'historique**

### Composants enfants
**Aucun composant React/Vue** — Architecture vanilla JavaScript  
**Structure HTML** : `ui-test/index.html` ligne 19
```html
<main id="messages" class="messages"></main>
```

---

## 2️⃣ SOURCE DE DONNÉES UTILISÉE PAR LE FRONTEND

### Source unique : `data.response` de l'API

**Fichier** : `ui-test/app.js` lignes 113-150

```javascript
// Afficher la réponse (toujours présente)
// LOT 1 : Afficher UNIQUEMENT la question/miroir courant, jamais plusieurs questions
if (data.response) {
  // Affichage progressif des miroirs REVELIOM
  if (data.progressiveDisplay === true && Array.isArray(data.mirrorSections) && data.mirrorSections.length === 3) {
    // Afficher section 1️⃣
    addMessage('assistant', data.mirrorSections[0]);
    setTimeout(() => {
      addMessage('assistant', data.mirrorSections[1]);
      setTimeout(() => {
        addMessage('assistant', data.mirrorSections[2]);
      }, 900);
    }, 900);
  } else {
    // Affichage normal (pas de découpage progressif)
    const responseText = data.response.trim();
    
    // Protection LOT 1 : Détecter et isoler une seule question/miroir
    if (responseText.includes('---QUESTION_SEPARATOR---')) {
      // Plusieurs questions détectées → n'afficher que la première
      const firstQuestion = responseText.split('---QUESTION_SEPARATOR---')[0].trim();
      console.warn('[FRONTEND] [LOT1] Multiple questions detected in response, displaying only first question');
      addMessage('assistant', firstQuestion);
    } else {
      // Une seule question/miroir → afficher normalement
      addMessage('assistant', responseText);
    }
  }
}
```

**Mapping** :
- **Aucun `messages.map()` ou `conversation.map()`**
- **Aucun state local de messages**
- **Aucun store global (Redux, Zustand, etc.)**
- **Affichage direct depuis `data.response` uniquement**

### Gestion de l'historique côté frontend
**Aucune gestion d'historique** :
- Pas de `localStorage` pour les messages
- Pas de `sessionStorage` pour les messages
- Pas de state JavaScript pour les messages
- **Les messages sont uniquement dans le DOM** (`#messages`)

---

## 3️⃣ PAYLOAD REÇU DU BACKEND

### Structure de réponse API `/axiom`

**Fichier backend** : `src/server.ts` lignes 682-690

```typescript
return res.status(200).json({
  sessionId: candidate.candidateId,
  currentBlock: candidate.session.currentBlock,
  state: responseState,
  response: result.response || '',  // ← UNE SEULE QUESTION
  step: result.step,
  expectsAnswer: result.expectsAnswer,
  autoContinue: result.autoContinue,
});
```

### Cas 1 : Clic sur START_BLOC_1

**Fichier backend** : `src/server.ts` lignes 652-655
```typescript
if (event === "START_BLOC_1") {
  const orchestrator = new BlockOrchestrator();
  const result = await orchestrator.handleMessage(candidate, null, "START_BLOC_1");
  // ...
}
```

**Fichier orchestrateur** : `src/services/blockOrchestrator.ts` lignes 165-181
```typescript
if (event === 'START_BLOC_1') {
  // Vérifier si les questions ont déjà été générées
  if (queue && queue.questions.length > 0) {
    return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
  }
  
  // Générer toutes les questions BLOC 1 (génération interne, pas affichage)
  const questions = await this.generateQuestionsForBlock1(currentCandidate);
  candidateStore.setQuestionsForBlock(currentCandidate.candidateId, blockNumber, questions);
  
  // Servir UNIQUEMENT la première question (LOT 1 : séquentiel strict)
  return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
}
```

**Méthode `serveNextQuestion`** : `src/services/blockOrchestrator.ts` lignes 358-404
```typescript
private serveNextQuestion(candidateId: string, blockNumber: number): OrchestratorResult {
  const queue = candidate.blockQueues?.[blockNumber];
  const question = queue.questions[queue.cursorIndex];  // ← UNE SEULE QUESTION
  
  // Enregistrer la question dans conversationHistory
  candidateStore.appendAssistantMessage(candidateId, question, {
    block: blockNumber,
    step: BLOC_01,
    kind: 'question',
  });
  
  // Avancer le cursor APRÈS avoir servi la question
  candidateStore.advanceQuestionCursor(candidateId, blockNumber);
  
  return {
    response: question,  // ← UNE SEULE QUESTION
    step: BLOC_01,
    expectsAnswer: true,
    autoContinue: false,
  };
}
```

**Conclusion** : Le backend retourne **une seule question** dans `response`.

### Cas 2 : Réponse utilisateur

**Fichier orchestrateur** : `src/services/blockOrchestrator.ts` lignes 312-314
```typescript
} else {
  // Il reste des questions → Servir la suivante
  return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
}
```

**Conclusion** : Le backend retourne **une seule question** à la fois.

### Exemple de payload brut (START_BLOC_1)

```json
{
  "sessionId": "abc123...",
  "currentBlock": 1,
  "state": "collecting",
  "response": "Tu te sens plus poussé par :\nA. Progresser / devenir meilleur\nB. Atteindre des objectifs concrets\nC. Être reconnu pour ce que tu fais ?",
  "step": "BLOC_01",
  "expectsAnswer": true,
  "autoContinue": false
}
```

**Note** : `response` contient **une seule question**, pas plusieurs.

---

## 4️⃣ GESTION DE L'HISTORIQUE

### Côté frontend

**Stockage** : **Aucun stockage d'historique**
- Pas de `state` local
- Pas de `store` global
- Pas de `localStorage` pour messages
- **Les messages existent uniquement dans le DOM** (`#messages`)

**Réaffichage** : **Aucune logique de réaffichage**
- Pas de `messages.map()` au chargement
- Pas de restauration depuis `localStorage`
- Pas de récupération depuis le backend

**Comportement au refresh** :
1. Frontend appelle `GET /start` (ligne 319 `ui-test/app.js`)
2. Backend retourne `data.response` (peut être vide si candidat avancé)
3. Frontend affiche `data.response` si présent (ligne 333-335)
4. **Aucun réaffichage de l'historique complet**

### Côté backend

**Stockage** : `candidate.conversationHistory` (type `ConversationMessage[]`)

**Fichier** : `src/types/conversation.ts` lignes 5-12
```typescript
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  block?: number;
  step?: string;
  kind?: ConversationMessageKind;
}
```

**Stockage** : `src/store/sessionStore.ts` — Méthode `appendAssistantMessage()`

**Important** : Le backend **ne renvoie jamais** `conversationHistory` au frontend dans la réponse API.

---

## 5️⃣ CONTRAT IMPLICITE FRONTEND/BACKEND

### Contrat actuel (observé dans le code)

**Le frontend doit afficher uniquement le dernier message serveur**

**Preuve** :
1. Frontend n'a pas de state d'historique
2. Frontend affiche uniquement `data.response` à chaque appel API
3. Backend ne renvoie jamais `conversationHistory` dans la réponse
4. Les messages sont cumulatifs dans le DOM (pas de nettoyage)

**Comportement attendu** :
- 1 appel API = 1 message affiché
- Les messages précédents restent dans le DOM (cumulatif)
- Pas de réaffichage de l'historique au refresh

### Contrat non respecté (si problème observé)

**Si toutes les questions du BLOC 1 s'affichent d'un coup** :

**Hypothèse 1** : Le backend envoie plusieurs questions dans `data.response`
- **Vérification** : Logs Railway doivent montrer `response` contenant plusieurs questions séparées par `---QUESTION_SEPARATOR---`
- **Protection frontend** : Ligne 139-143 `ui-test/app.js` — Détecte et n'affiche que la première

**Hypothèse 2** : Le frontend réaffiche l'historique au refresh
- **Vérification** : Aucune logique de réaffichage dans `ui-test/app.js`
- **Protection** : Pas de récupération d'historique depuis le backend

**Hypothèse 3** : Le DOM contient déjà les questions (double appel API)
- **Vérification** : Protection anti-doublon ligne 24-45 `ui-test/app.js`
- **Risque** : Si `addMessage()` est appelé plusieurs fois avec le même texte

**Hypothèse 4** : Le backend génère toutes les questions en une fois et les envoie
- **Vérification** : `generateQuestionsForBlock1()` génère toutes les questions (ligne 321-360 `blockOrchestrator.ts`)
- **Mais** : `serveNextQuestion()` ne retourne qu'une seule question (ligne 373)
- **Risque** : Si `serveNextQuestion()` n'est pas appelé et que `generateQuestionsForBlock1()` est retourné directement

---

## 6️⃣ POINT DE RUPTURE IDENTIFIÉ

### Scénario probable

**Lors du clic sur START_BLOC_1** :

1. Frontend appelle `/axiom` avec `event: "START_BLOC_1"`
2. Backend appelle `orchestrator.handleMessage(candidate, null, "START_BLOC_1")`
3. Orchestrateur génère toutes les questions via `generateQuestionsForBlock1()`
4. **PROBLÈME POTENTIEL** : Si `generateQuestionsForBlock1()` retourne un string avec toutes les questions séparées par `---QUESTION_SEPARATOR---` et que ce string est retourné directement au lieu de passer par `serveNextQuestion()`

**Vérification nécessaire** :
- Logs Railway au moment du clic START_BLOC_1
- Contenu exact de `data.response` dans la console frontend
- Vérifier si `serveNextQuestion()` est bien appelé

### Code suspect

**Fichier** : `src/services/blockOrchestrator.ts` lignes 174-180
```typescript
// Générer toutes les questions BLOC 1 (génération interne, pas affichage)
console.log('[ORCHESTRATOR] generate questions bloc 1 (API)');
const questions = await this.generateQuestionsForBlock1(currentCandidate);
candidateStore.setQuestionsForBlock(currentCandidate.candidateId, blockNumber, questions);

// Servir UNIQUEMENT la première question (LOT 1 : séquentiel strict)
return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
```

**Si `generateQuestionsForBlock1()` échoue ou retourne un format inattendu**, le code peut retourner toutes les questions au lieu d'une seule.

---

## 7️⃣ RECOMMANDATIONS DE DIAGNOSTIC

### À vérifier immédiatement

1. **Logs Railway** au moment du clic START_BLOC_1
   - Vérifier le contenu de `result.response` dans `src/server.ts:686`
   - Vérifier si `serveNextQuestion()` est bien appelé

2. **Console frontend** (F12)
   - Logger `data.response` dans `ui-test/app.js:100` (après `await response.json()`)
   - Vérifier si `data.response` contient plusieurs questions

3. **DOM inspecteur**
   - Vérifier le nombre de `<div class="message-bubble message-reveliom">` dans `#messages`
   - Vérifier si plusieurs questions sont présentes d'un coup

4. **Protection frontend existante**
   - La ligne 139-143 `ui-test/app.js` devrait déjà filtrer plusieurs questions
   - Vérifier si cette protection fonctionne

### Test de reproduction

1. Ouvrir la console (F12)
2. Cliquer sur "Je commence mon profil"
3. Logger `data.response` dans `callAxiom()` ligne 100
4. Vérifier le contenu exact

---

## 8️⃣ CONCLUSION

### État actuel

- **Frontend** : Affiche uniquement `data.response` (une seule question attendue)
- **Backend** : Retourne une seule question via `serveNextQuestion()`
- **Protection frontend** : Filtre plusieurs questions si présentes (ligne 139-143)

### Problème probable

**Le backend envoie plusieurs questions dans `data.response`** malgré `serveNextQuestion()`, ou **le frontend appelle plusieurs fois `addMessage()`** avec différentes questions.

### Action immédiate

**Vérifier les logs Railway et la console frontend** pour identifier le point de rupture exact.

---

**FIN DE L'AUDIT — AUCUNE MODIFICATION EFFECTUÉE**
