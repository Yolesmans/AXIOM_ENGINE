# 🔍 AUDIT — DÉSYNCHRONISATION FSM / HISTORIQUE CONVERSATIONNEL
**Date** : 2025-01-27  
**Objectif** : Vérifier l'hypothèse que la FSM bloque les messages utilisateur alors que l'historique conversationnel devrait être la source de vérité n°1

---

## ✅ CONFIRMATION DE L'HYPOTHÈSE

**HYPOTHÈSE VALIDÉE** : La FSM bloque effectivement les messages utilisateur alors que l'historique conversationnel devrait être la source de vérité n°1.

**Cause racine** : La FSM (`session.ui.step`) est utilisée comme garde exclusive pour accepter/rejeter les messages, sans vérifier si l'historique conversationnel indique qu'une réponse utilisateur est attendue.

---

## 1️⃣ POINT DE BLOCAGE IDENTIFIÉ

### 1.1 Localisation exacte

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1118-1141` (STEP_02_TONE)

```typescript
if (currentState === STEP_02_TONE) {
  if (!userMessage) {
    // Première question tone
    const toneQuestion = 'Bienvenue dans AXIOM... Dis-moi : tu préfères... ?';
    // ... enregistrement assistant ...
    return {
      response: toneQuestion,
      step: currentState,
      lastQuestion: toneQuestion,
      expectsAnswer: true,  // ← Indique qu'une réponse est attendue
      autoContinue: false,
    };
  }
  
  // Si userMessage existe, détecter tone et passer à préambule
  const tone = detectTone(userMessage);
  // ...
}
```

**PROBLÈME** : Si `currentState !== STEP_02_TONE` (par exemple, si `session.ui.step` est `STEP_01_IDENTITY` ou `null`), le code ne rentre **JAMAIS** dans ce bloc, même si :
- L'historique conversationnel contient une question tone de l'assistant
- Le dernier message assistant est une question valide
- L'utilisateur répond légitimement à cette question

### 1.2 Scénario de blocage

**Séquence exacte** :

1. **Identité complétée** → `candidate.identity.completedAt` est défini
2. **Question tone générée** → Stockée dans `conversationHistory` avec `role: 'assistant'`, `kind: 'tone'`
3. **État FSM** : `candidate.session.ui.step` peut être :
   - `STEP_01_IDENTITY` (si UI n'a pas été mise à jour)
   - `null` (si UI n'existe pas encore)
   - `STEP_02_TONE` (si UI est à jour)
4. **Message utilisateur** : "tutoie" ou "vouvoie"
5. **Appel `/axiom`** → `executeWithAutoContinue(candidate, "tutoie")`
6. **Dans `executeAxiom`** :
   - `currentState = ui.step` → `STEP_01_IDENTITY` ou `null`
   - Le code vérifie `if (currentState === STEP_01_IDENTITY)` → **PAS de userMessage attendu**
   - Le code vérifie `if (currentState === STEP_02_TONE)` → **NE RENTRE PAS** si `currentState !== STEP_02_TONE`
   - **Résultat** : Le message utilisateur n'est **JAMAIS traité** dans aucun bloc FSM

### 1.3 Logique de rejet

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1063-1075` (STEP_01_IDENTITY)

```typescript
if (currentState === STEP_01_IDENTITY) {
  if (!userMessage) {
    // Première demande identité
    return {
      response: '',
      step: 'IDENTITY',
      lastQuestion: null,
      expectsAnswer: true,
      autoContinue: false,
    };
  }
  
  // Parser identité
  const identity = extractIdentity(userMessage);
  if (!identity || !identity.firstName || !identity.lastName || !identity.email) {
    // ← Si userMessage n'est PAS une identité, cette condition est vraie
    // ← Mais le code ne retourne rien ici, il continue...
  }
}
```

**PROBLÈME** : Si `currentState === STEP_01_IDENTITY` et que `userMessage` n'est **PAS** une identité (ex: "tutoie"), le code :
- Ne valide pas l'identité
- Ne retourne **RIEN** dans ce bloc
- Continue vers les autres blocs FSM
- **Aucun bloc ne gère le message "tutoie"** si `currentState !== STEP_02_TONE`

**Résultat** : Le message utilisateur est **IGNORÉ** ou **REJETÉ** silencieusement.

---

## 2️⃣ POURQUOI LE MESSAGE USER EST REJETÉ

### 2.1 Architecture FSM stricte

**Principe actuel** : La FSM est **EXCLUSIVE** — chaque état (`STEP_01_IDENTITY`, `STEP_02_TONE`, etc.) gère uniquement les messages qui correspondent à cet état.

**Problème** : Si `session.ui.step` est désynchronisé avec l'historique conversationnel, aucun bloc FSM ne peut traiter le message utilisateur.

**Exemple concret** :

```
Historique conversationnel :
[
  { role: 'assistant', content: 'Dis-moi : tu préfères qu'on se tutoie ou qu'on se vouvoie ?', kind: 'tone' }
]

session.ui.step = 'STEP_01_IDENTITY'  // ← DÉSYNCHRONISÉ

Message utilisateur : "tutoie"

Dans executeAxiom :
- currentState = 'STEP_01_IDENTITY'
- if (currentState === STEP_01_IDENTITY) → userMessage n'est pas une identité → IGNORÉ
- if (currentState === STEP_02_TONE) → NE RENTRE PAS
- Résultat : Message non traité
```

### 2.2 Absence de dérivation depuis l'historique

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1034-1058`

```typescript
let ui = candidate.session.ui;
if (!ui) {
  // Dériver l'état depuis l'historique
  const derivedStep = deriveStepFromHistory(candidate);
  // ...
}

let currentState = ui.step as string;  // ← Utilise TOUJOURS ui.step, même si désynchronisé
```

**PROBLÈME** : La dérivation depuis l'historique n'est faite **QUE si `ui` est `null`**. Si `ui` existe mais est désynchronisé (ex: `ui.step = 'STEP_01_IDENTITY'` alors que l'historique montre une question tone), le code utilise quand même `ui.step` comme source de vérité.

**Résultat** : La FSM ignore l'historique conversationnel si `ui` existe mais est incorrect.

### 2.3 Guards basés uniquement sur FSM

**Fichier** : `src/server.ts`  
**Lignes** : `611-625`

```typescript
// RÈGLE 1 — CONTRAT FRONT / BACK
// Si identité absente → forcer state = identity
if (candidate.session.state === "identity" || !candidate.identity.completedAt || ...) {
  candidateStore.updateUIState(candidate.candidateId, {
    step: STEP_01_IDENTITY,  // ← FORCE STEP_01_IDENTITY
    lastQuestion: null,
    identityDone: false,
  });
  return res.status(200).json({
    // ...
    step: "STEP_01_IDENTITY",
    expectsAnswer: true,  // ← Mais quelle question est attendue ?
  });
}
```

**PROBLÈME** : Ce guard force `STEP_01_IDENTITY` **SANS vérifier** si l'historique conversationnel contient déjà une question tone ou un préambule. Si l'identité est complétée mais que `session.state` est encore `"identity"`, le guard **OVERWRITE** l'état UI, même si l'historique montre qu'on est plus loin.

---

## 3️⃣ IDENTIFICATION EXACTE DU POINT DE BLOCAGE

### 3.1 Point de blocage n°1 : FSM exclusive

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1057-1780`

**Logique** :
```typescript
let currentState = ui.step as string;  // ← Source de vérité = FSM uniquement

if (currentState === STEP_01_IDENTITY) {
  // Gère uniquement les messages identité
}
if (currentState === STEP_02_TONE) {
  // Gère uniquement les messages tone
}
// ... autres états ...
```

**Problème** : Aucun bloc ne vérifie **D'ABORD** l'historique conversationnel pour déterminer quel type de message est attendu.

**Impact** : Si `currentState` est désynchronisé, aucun bloc ne peut traiter le message utilisateur.

### 3.2 Point de blocage n°2 : Dérivation conditionnelle

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1036-1055`

**Logique** :
```typescript
let ui = candidate.session.ui;
if (!ui) {
  // Dérivation depuis l'historique UNIQUEMENT si ui est null
  const derivedStep = deriveStepFromHistory(candidate);
  // ...
}
// Si ui existe mais est désynchronisé, on l'utilise quand même
let currentState = ui.step as string;
```

**Problème** : La dérivation depuis l'historique n'est faite **QUE si `ui` est `null`**. Si `ui` existe mais est incorrect, elle n'est **JAMAIS** corrigée.

**Impact** : Une fois `ui` créé avec un état incorrect, il reste incorrect jusqu'à ce qu'il soit explicitement mis à jour.

### 3.3 Point de blocage n°3 : Guards serveur

**Fichier** : `src/server.ts`  
**Lignes** : `611-625`

**Logique** :
```typescript
if (candidate.session.state === "identity" || !candidate.identity.completedAt || ...) {
  // Force STEP_01_IDENTITY SANS vérifier l'historique
  candidateStore.updateUIState(candidate.candidateId, {
    step: STEP_01_IDENTITY,
  });
  return res.status(200).json({
    step: "STEP_01_IDENTITY",
    expectsAnswer: true,  // ← Mais quelle question ?
  });
}
```

**Problème** : Ce guard force `STEP_01_IDENTITY` **SANS vérifier** si l'historique conversationnel montre qu'on est plus loin (ex: question tone déjà posée).

**Impact** : Même si l'historique montre qu'une question tone a été posée, le guard **OVERWRITE** l'état UI à `STEP_01_IDENTITY`, ce qui bloque les réponses tone.

---

## 4️⃣ DESCRIPTION THÉORIQUE DE LA BONNE DÉRIVATION D'ÉTAT

### 4.1 Principe : Historique = Source de vérité n°1

**Règle fondamentale** : L'historique conversationnel (`conversationHistory`) doit être la **source de vérité n°1** pour déterminer :
- Quel type de message est attendu
- Quel état FSM devrait être actif
- Si un message utilisateur est valide

**FSM** : La FSM (`session.ui.step`) doit être **DÉRIVÉE** de l'historique, pas l'inverse.

### 4.2 Algorithme de dérivation depuis l'historique

**Étape 1 : Analyser le dernier message assistant**

```typescript
function getLastAssistantMessage(history: ConversationMessage[]): ConversationMessage | null {
  // Parcourir l'historique de la fin vers le début
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'assistant') {
      return history[i];
    }
  }
  return null;
}
```

**Étape 2 : Déterminer le type de message attendu**

```typescript
function getExpectedMessageType(lastAssistant: ConversationMessage | null): 'identity' | 'tone' | 'answer' | 'none' {
  if (!lastAssistant) {
    // Aucun message assistant → attente identité
    return 'identity';
  }
  
  if (lastAssistant.kind === 'tone') {
    // Dernier message = question tone → attente réponse tone
    return 'tone';
  }
  
  if (lastAssistant.kind === 'question' || lastAssistant.content.endsWith('?')) {
    // Dernier message = question → attente réponse utilisateur
    return 'answer';
  }
  
  if (lastAssistant.kind === 'preambule') {
    // Dernier message = préambule → attente event START_BLOC_1
    return 'none';
  }
  
  // Par défaut, aucune réponse attendue
  return 'none';
}
```

**Étape 3 : Dériver l'état FSM depuis l'historique**

```typescript
function deriveStateFromHistory(candidate: AxiomCandidate): string {
  const history = candidate.conversationHistory || [];
  
  // Si historique vide → STEP_01_IDENTITY
  if (history.length === 0) {
    return STEP_01_IDENTITY;
  }
  
  // Analyser le dernier message assistant
  const lastAssistant = getLastAssistantMessage(history);
  const expectedType = getExpectedMessageType(lastAssistant);
  
  // Dériver l'état selon le type attendu
  if (expectedType === 'identity') {
    return STEP_01_IDENTITY;
  }
  
  if (expectedType === 'tone') {
    return STEP_02_TONE;
  }
  
  if (expectedType === 'answer') {
    // Vérifier dans quel bloc on est
    const lastUserMessage = history.filter(m => m.role === 'user').pop();
    if (lastUserMessage?.block) {
      return `BLOC_${String(lastUserMessage.block).padStart(2, '0')}`;
    }
    // Si pas de bloc, on est probablement dans BLOC_01
    return BLOC_01;
  }
  
  if (expectedType === 'none') {
    // Vérifier si préambule affiché
    const preambuleMessage = history.find(m => m.kind === 'preambule');
    if (preambuleMessage) {
      return STEP_03_BLOC1;  // Attente bouton START_BLOC_1
    }
  }
  
  // Fallback : utiliser deriveStepFromHistory existant
  return deriveStepFromHistory(candidate);
}
```

**Étape 4 : Valider le message utilisateur depuis l'historique**

```typescript
function isUserMessageValid(
  userMessage: string,
  history: ConversationMessage[],
  currentState: string
): boolean {
  // Analyser le dernier message assistant
  const lastAssistant = getLastAssistantMessage(history);
  const expectedType = getExpectedMessageType(lastAssistant);
  
  // Valider selon le type attendu
  if (expectedType === 'identity') {
    // Vérifier si userMessage contient identité
    const identity = extractIdentity(userMessage);
    return !!(identity?.firstName && identity?.lastName && identity?.email);
  }
  
  if (expectedType === 'tone') {
    // Vérifier si userMessage est une réponse tone
    const tone = detectTone(userMessage);
    return tone !== null;
  }
  
  if (expectedType === 'answer') {
    // Toute réponse non vide est valide
    return userMessage.trim().length > 0;
  }
  
  // Si aucun type attendu, le message n'est pas valide
  return false;
}
```

### 4.3 Intégration dans executeAxiom

**Principe** : Avant de traiter un message utilisateur, **D'ABORD** dériver l'état depuis l'historique, **PUIS** valider le message, **ENSUITE** traiter selon l'état dérivé.

**Pseudo-code** :

```typescript
export async function executeAxiom(input: ExecuteAxiomInput): Promise<ExecuteAxiomResult> {
  const { candidate, userMessage } = input;
  
  // ÉTAPE 1 : Dériver l'état depuis l'historique (source de vérité n°1)
  const derivedState = deriveStateFromHistory(candidate);
  
  // ÉTAPE 2 : Si userMessage existe, valider depuis l'historique
  if (userMessage) {
    const isValid = isUserMessageValid(userMessage, candidate.conversationHistory || [], derivedState);
    if (!isValid) {
      // Message invalide → retourner erreur ou ignorer
      return {
        response: 'Je ne comprends pas ta réponse. Peux-tu reformuler ?',
        step: derivedState,
        expectsAnswer: true,
        autoContinue: false,
      };
    }
  }
  
  // ÉTAPE 3 : Synchroniser session.ui.step avec l'état dérivé
  if (!candidate.session.ui || candidate.session.ui.step !== derivedState) {
    candidateStore.updateUIState(candidate.candidateId, {
      step: derivedState,
      lastQuestion: getLastAssistantMessage(candidate.conversationHistory || [])?.content || null,
    });
    // Recharger candidate
    candidate = candidateStore.get(candidate.candidateId);
  }
  
  // ÉTAPE 4 : Traiter selon l'état dérivé (pas selon session.ui.step)
  let currentState = derivedState;
  
  // ... logique FSM normale avec currentState ...
}
```

---

## 5️⃣ COMPARAISON AVEC CHATGPT

### 5.1 ChatGPT : Pas de FSM stricte

**ChatGPT** :
- N'a **PAS** de FSM stricte
- Accepte **TOUJOURS** les messages utilisateur
- Détermine le contexte depuis l'historique conversationnel
- Ne bloque **JAMAIS** un message basé sur un état interne

**Résultat** : ChatGPT fonctionne comme une conversation continue, sans gardes basés sur un état FSM.

### 5.2 AXIOM : FSM exclusive

**AXIOM** :
- A une **FSM stricte** avec des états exclusifs
- Bloque les messages si `session.ui.step` ne correspond pas
- Ignore l'historique conversationnel si la FSM est désynchronisée
- Rejette les messages valides si l'état FSM est incorrect

**Résultat** : AXIOM bloque les messages utilisateur si la FSM est désynchronisée, même si l'historique montre qu'une réponse est attendue.

---

## 6️⃣ CONCLUSION

### 6.1 Confirmation de l'hypothèse

**OUI**, l'hypothèse est **VALIDÉE** :

- ✅ La FSM bloque effectivement les messages utilisateur
- ✅ L'historique conversationnel n'est **PAS** utilisé comme source de vérité n°1
- ✅ La FSM (`session.ui.step`) est utilisée comme garde exclusive
- ✅ Si la FSM est désynchronisée, les messages utilisateur sont rejetés

### 6.2 Cause racine identifiée

**Cause racine** : **Architecture FSM exclusive** — La FSM est utilisée comme garde exclusive pour accepter/rejeter les messages, sans vérifier d'abord l'historique conversationnel.

**Preuve** :
- `executeAxiom` utilise `ui.step` comme source de vérité unique
- Aucun bloc FSM ne vérifie l'historique conversationnel avant de traiter un message
- Les guards serveur forcent des états FSM sans vérifier l'historique

### 6.3 Solution théorique

**Solution** : Inverser la logique — **D'ABORD** dériver l'état depuis l'historique conversationnel, **PUIS** valider le message, **ENSUITE** traiter selon l'état dérivé.

**Architecture proposée** :
1. **Historique = Source de vérité n°1** : Dériver l'état depuis `conversationHistory`
2. **Validation depuis l'historique** : Vérifier si le message utilisateur est valide selon le dernier message assistant
3. **Synchronisation FSM** : Mettre à jour `session.ui.step` pour refléter l'état dérivé
4. **Traitement FSM** : Traiter le message selon l'état dérivé (pas selon `session.ui.step`)

**Résultat attendu** : AXIOM acceptera les messages utilisateur si l'historique montre qu'une réponse est attendue, même si la FSM est désynchronisée.

---

**FIN DE L'AUDIT**
