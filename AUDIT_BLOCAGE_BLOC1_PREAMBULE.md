# 🔍 AUDIT TECHNIQUE — BLOCAGE TRANSITION BLOC 1 APRÈS PRÉAMBULE
**Date** : 2025-01-27  
**Objectif** : Identifier pourquoi AXIOM bloque la transition vers BLOC 1 alors que le préambule est présent dans l'historique conversationnel

---

## ✅ CONFIRMATION DE L'HYPOTHÈSE

**HYPOTHÈSE VALIDÉE** : Le droit d'entrer en BLOC 1 est encore dérivé de la FSM / UI state et **NON** de l'historique conversationnel, alors que le préambule est déjà présent dans `conversationHistory`.

**Cause racine** : `deriveStepFromHistory()` et la logique de transition vers BLOC 1 **IGNORENT** complètement `conversationHistory`, même si le préambule y est stocké avec `kind: 'preambule'`.

---

## 1️⃣ VÉRIFICATION DES SOURCES DE VÉRITÉ ACTUELLES

### 1.1 Variables / États qui décident "préambule terminé"

#### **Source n°1 : `session.ui.step`**

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1329-1456` (STEP_03_BLOC1)

```typescript
if (currentState === STEP_03_BLOC1) {
  if (event === 'START_BLOC_1') {
    // Démarrer BLOC 1
  }
  // Si message texte reçu → ignorer (on attend le bouton)
  return {
    step: "PREAMBULE_DONE",
    // ...
  };
}
```

**Logique** : Le BLOC 1 ne démarre **QUE si** :
- `currentState === STEP_03_BLOC1` **ET** `event === 'START_BLOC_1'`
- OU si `currentState` est déjà un `BLOC_XX`

**Problème** : Si `session.ui.step` n'est **PAS** `STEP_03_BLOC1`, le BLOC 1 ne peut **JAMAIS** démarrer, même si le préambule existe dans l'historique.

#### **Source n°2 : `event === 'START_BLOC_1'`**

**Fichier** : `src/server.ts`  
**Lignes** : `650-687` (POST /axiom)

```typescript
if (event === "START_BLOC_1") {
  const result = await executeAxiom({ candidate, userMessage: null, event: "START_BLOC_1" });
  // ...
}
```

**Logique** : Le BLOC 1 démarre uniquement si l'event `START_BLOC_1` est reçu.

**Problème** : Cet event dépend du frontend. Si le frontend ne l'envoie pas (ou si `session.ui.step` n'est pas `STEP_03_BLOC1`), le BLOC 1 ne démarre pas.

#### **Source n°3 : `deriveStepFromHistory()`**

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `896-919`

```typescript
function deriveStepFromHistory(candidate: AxiomCandidate): string {
  // Règle 1 : Si currentBlock > 0 → candidat est dans un bloc
  if (candidate.session.currentBlock > 0) {
    return `BLOC_${String(candidate.session.currentBlock).padStart(2, '0')}`;
  }
  
  // Règle 2 : Si réponses présentes → candidat a dépassé le préambule
  if (candidate.answers.length > 0) {
    return STEP_03_BLOC1;
  }
  
  // Règle 3 : Si tone choisi → candidat est au préambule ou après
  if (candidate.tonePreference) {
    return STEP_03_BLOC1;
  }
  
  // Règle 4 : Si identité complétée → candidat est au tone
  if (candidate.identity.completedAt) {
    return STEP_02_TONE;
  }
  
  // Règle 5 : Sinon → nouveau candidat, identité
  return STEP_01_IDENTITY;
}
```

**PROBLÈME CRITIQUE** : Cette fonction **NE VÉRIFIE JAMAIS** `conversationHistory` pour savoir si un préambule existe.

**Logique actuelle** :
- Si `tonePreference` existe → `STEP_03_BLOC1` (mais le préambule n'est peut-être pas encore généré)
- Si `answers.length > 0` → `STEP_03_BLOC1` (mais le préambule n'est peut-être pas encore généré)

**Résultat** : La fonction peut retourner `STEP_03_BLOC1` **AVANT** que le préambule soit généré, ou **APRÈS** sans le vérifier.

### 1.2 Où la condition est évaluée

#### **Point d'évaluation n°1 : `executeAxiom()` — Bloc STEP_03_BLOC1**

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1329-1456`

```typescript
if (currentState === STEP_03_BLOC1) {
  if (event === 'START_BLOC_1') {
    // Démarrer BLOC 1
  }
  // Si message texte reçu → ignorer
  return {
    step: "PREAMBULE_DONE",
    // ...
  };
}
```

**Condition** : `currentState === STEP_03_BLOC1` **ET** `event === 'START_BLOC_1'`

**Problème** : Si `currentState !== STEP_03_BLOC1`, ce bloc ne s'exécute **JAMAIS**, même si le préambule existe dans l'historique.

#### **Point d'évaluation n°2 : `deriveStepFromHistory()` — Dérivation d'état**

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `896-919`

**Condition** : Vérifie `currentBlock`, `answers.length`, `tonePreference`, `identity.completedAt`

**Problème** : **NE VÉRIFIE PAS** `conversationHistory` pour savoir si un préambule existe.

#### **Point d'évaluation n°3 : Guards serveur — `/start` et `/axiom`**

**Fichier** : `src/server.ts`  
**Lignes** : `216-250` (GET /start), `650-687` (POST /axiom)

**Condition** : Utilise `deriveStepFromHistory()` ou `session.ui.step`

**Problème** : **NE VÉRIFIE PAS** `conversationHistory` pour savoir si un préambule existe.

### 1.3 Flags implicites

#### **Flag n°1 : `expectsAnswer: false`**

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1321`

```typescript
return {
  response: aiText || '',
  step: STEP_03_BLOC1,
  lastQuestion: null,
  expectsAnswer: false,  // ← Indique qu'aucune réponse n'est attendue
  autoContinue: false,
};
```

**Logique** : Après génération du préambule, `expectsAnswer: false` indique qu'on attend un event (bouton), pas un message texte.

**Problème** : Ce flag n'est **PAS** utilisé pour déterminer si le préambule est terminé. Il est uniquement utilisé pour le mapping frontend.

#### **Flag n°2 : `autoContinue: false`**

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1322`

```typescript
autoContinue: false, // déclenchement explicite requis
```

**Logique** : Indique qu'un déclenchement explicite (bouton) est requis pour continuer.

**Problème** : Ce flag n'est **PAS** utilisé pour déterminer si le préambule est terminé. Il est uniquement utilisé pour l'auto-enchaînement.

---

## 2️⃣ ANALYSE DE LA DÉSYNCHRONISATION FSM ↔ HISTORIQUE

### 2.1 Vérification factuelle : Préambule dans `conversationHistory`

#### **Stockage du préambule**

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1308-1314`

```typescript
// Enregistrer la réponse assistant (préambule)
if (aiText) {
  candidateStore.appendAssistantMessage(candidate.candidateId, aiText, {
    step: STEP_03_BLOC1,
    kind: 'preambule',  // ← Préambule stocké avec kind: 'preambule'
  });
}
```

**Résultat** : Le préambule est **BIEN** stocké dans `conversationHistory` avec :
- `role: 'assistant'`
- `kind: 'preambule'`
- `content: aiText` (texte du préambule)

#### **Vérification dans `deriveStepFromHistory()`**

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `896-919`

**Résultat** : `deriveStepFromHistory()` **NE VÉRIFIE JAMAIS** `conversationHistory` pour savoir si un préambule existe.

**Preuve** : Aucune ligne de code ne fait :
```typescript
const preambuleMessage = candidate.conversationHistory?.find(m => m.kind === 'preambule');
if (preambuleMessage) {
  return STEP_03_BLOC1;
}
```

### 2.2 Désynchronisation `session.ui.step` ↔ Historique

#### **Scénario de désynchronisation**

**Séquence** :

1. **Préambule généré** → Stocké dans `conversationHistory` avec `kind: 'preambule'`
2. **Transition FSM** → `session.ui.step = STEP_03_BLOC1` (ligne 1300)
3. **Refresh / Perte store** → `session.ui` peut être `null` ou désynchronisé
4. **Dérivation d'état** → `deriveStepFromHistory()` utilise `tonePreference` → Retourne `STEP_03_BLOC1`
5. **MAIS** : Si `session.ui.step` est `STEP_02_TONE` ou `STEP_01_IDENTITY` (désynchronisé), le BLOC 1 ne peut pas démarrer

**Preuve** : `executeAxiom()` utilise `currentState = ui.step` (ligne 1057), pas l'historique.

#### **Impact de la désynchronisation**

**Si `session.ui.step !== STEP_03_BLOC1`** :
- Le bloc `if (currentState === STEP_03_BLOC1)` ne s'exécute **JAMAIS**
- L'event `START_BLOC_1` ne peut pas démarrer le BLOC 1
- Le préambule existe dans l'historique, mais AXIOM ne le reconnaît pas

**Résultat** : AXIOM affiche "Le BLOC 1 commence uniquement après l'affichage complet du PRÉAMBULE", alors que le préambule est déjà présent dans l'historique.

---

## 3️⃣ IDENTIFICATION DU POINT EXACT DE BLOCAGE

### 3.1 Point de blocage n°1 : `deriveStepFromHistory()` ignore l'historique

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `896-919`

**Problème** : La fonction utilise uniquement :
- `currentBlock`
- `answers.length`
- `tonePreference`
- `identity.completedAt`

**Elle n'utilise JAMAIS** :
- `conversationHistory` pour vérifier si un préambule existe
- `conversationHistory` pour vérifier si une question tone a été posée
- `conversationHistory` pour vérifier l'état réel de la conversation

**Impact** : La dérivation d'état peut être incorrecte si `session.ui` est désynchronisé.

### 3.2 Point de blocage n°2 : `executeAxiom()` utilise uniquement FSM

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1057-1780`

**Problème** : `executeAxiom()` utilise `currentState = ui.step` comme source de vérité unique.

**Logique** :
```typescript
let currentState = ui.step as string;  // ← Source de vérité = FSM uniquement

if (currentState === STEP_03_BLOC1) {
  // Gère uniquement si currentState est STEP_03_BLOC1
}
```

**Impact** : Si `session.ui.step` est désynchronisé, aucun bloc FSM ne peut traiter la transition vers BLOC 1, même si le préambule existe dans l'historique.

### 3.3 Point de blocage n°3 : Condition de transition dépend uniquement de l'event

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1331-1445`

**Problème** : Le BLOC 1 ne démarre **QUE si** `event === 'START_BLOC_1'` **ET** `currentState === STEP_03_BLOC1`.

**Logique** :
```typescript
if (currentState === STEP_03_BLOC1) {
  if (event === 'START_BLOC_1') {
    // Démarrer BLOC 1
  }
}
```

**Impact** : Si `currentState !== STEP_03_BLOC1`, l'event `START_BLOC_1` ne peut pas démarrer le BLOC 1, même si le préambule existe dans l'historique.

### 3.4 Point de blocage n°4 : Aucune vérification de l'historique avant transition

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1331-1445`

**Problème** : Avant de démarrer le BLOC 1, le code ne vérifie **JAMAIS** si un préambule existe dans `conversationHistory`.

**Logique actuelle** :
```typescript
if (event === 'START_BLOC_1') {
  // Démarrer BLOC 1 directement
  // SANS vérifier si préambule existe dans conversationHistory
}
```

**Impact** : Le BLOC 1 peut démarrer même si le préambule n'existe pas dans l'historique, ou ne pas démarrer même s'il existe.

---

## 4️⃣ TEST DE L'HYPOTHÈSE

### 4.1 Hypothèse à valider

**Hypothèse** : "Le droit d'entrer en BLOC 1 est encore dérivé de la FSM / UI state et non de l'historique conversationnel, alors que le préambule est déjà présent dans conversationHistory."

### 4.2 Validation factuelle

#### **Test n°1 : `deriveStepFromHistory()` vérifie-t-elle l'historique ?**

**Réponse** : **NON**

**Preuve** : `src/engine/axiomExecutor.ts:896-919` — Aucune ligne ne vérifie `conversationHistory`.

#### **Test n°2 : `executeAxiom()` vérifie-t-elle l'historique avant transition ?**

**Réponse** : **NON**

**Preuve** : `src/engine/axiomExecutor.ts:1331-1445` — Aucune ligne ne vérifie `conversationHistory` avant de démarrer le BLOC 1.

#### **Test n°3 : La condition de transition dépend-elle de l'historique ?**

**Réponse** : **NON**

**Preuve** : `src/engine/axiomExecutor.ts:1331` — La condition est uniquement `currentState === STEP_03_BLOC1` **ET** `event === 'START_BLOC_1'`.

### 4.3 Conclusion du test

**HYPOTHÈSE VALIDÉE** : Le droit d'entrer en BLOC 1 est **EXCLUSIVEMENT** dérivé de la FSM (`session.ui.step`) et de l'event (`START_BLOC_1`), **SANS** vérification de l'historique conversationnel.

**Preuve** :
- `deriveStepFromHistory()` n'utilise pas `conversationHistory`
- `executeAxiom()` n'utilise pas `conversationHistory` pour déterminer si le préambule est terminé
- La condition de transition vers BLOC 1 ne vérifie pas `conversationHistory`

---

## 5️⃣ PROPOSITION DE SOLUTION THÉORIQUE

### 5.1 Principe fondamental

**Règle métier** : Un message assistant effectivement généré et affiché est un événement métier accompli. AXIOM ne doit jamais afficher un contenu puis refuser d'en reconnaître les conséquences logiques.

**Source de vérité n°1** : `conversationHistory` doit être la source de vérité pour déterminer :
- Si un préambule a été généré
- Si une question tone a été posée
- Si une réponse utilisateur a été donnée
- Quel est l'état réel de la conversation

**FSM** : La FSM (`session.ui.step`) doit être **DÉRIVÉE** de l'historique, pas l'inverse.

### 5.2 Architecture logique proposée

#### **Étape 1 : Dérivation d'état depuis l'historique**

**Fonction** : `deriveStateFromConversationHistory()`

**Logique** :
1. **Analyser `conversationHistory`** pour trouver le dernier message assistant
2. **Déterminer le type de message** (tone, preambule, question, mirror, matching)
3. **Dériver l'état FSM** selon le type de message et l'état de la conversation

**Exemple théorique** :
```typescript
function deriveStateFromConversationHistory(candidate: AxiomCandidate): string {
  const history = candidate.conversationHistory || [];
  
  // Si historique vide → STEP_01_IDENTITY
  if (history.length === 0) {
    return STEP_01_IDENTITY;
  }
  
  // Trouver le dernier message assistant
  const lastAssistant = history.filter(m => m.role === 'assistant').pop();
  
  if (!lastAssistant) {
    // Aucun message assistant → STEP_01_IDENTITY
    return STEP_01_IDENTITY;
  }
  
  // Dériver selon le type de message
  if (lastAssistant.kind === 'tone') {
    // Question tone posée → Vérifier si réponse utilisateur existe
    const toneResponse = history.find(m => 
      m.role === 'user' && 
      m.createdAt > lastAssistant.createdAt
    );
    if (toneResponse) {
      // Réponse tone donnée → Préambule ou STEP_03_BLOC1
      const preambule = history.find(m => m.kind === 'preambule');
      if (preambule) {
        return STEP_03_BLOC1;  // Préambule généré → Attente bouton
      }
      return STEP_03_PREAMBULE;  // Préambule pas encore généré
    }
    return STEP_02_TONE;  // Question tone posée, réponse attendue
  }
  
  if (lastAssistant.kind === 'preambule') {
    // Préambule généré → STEP_03_BLOC1 (attente bouton)
    return STEP_03_BLOC1;
  }
  
  if (lastAssistant.kind === 'question') {
    // Question bloc posée → Vérifier dans quel bloc
    const lastUserMessage = history.filter(m => m.role === 'user').pop();
    if (lastUserMessage?.block) {
      return `BLOC_${String(lastUserMessage.block).padStart(2, '0')}`;
    }
    return BLOC_01;
  }
  
  // Fallback : utiliser deriveStepFromHistory existant
  return deriveStepFromHistory(candidate);
}
```

#### **Étape 2 : Synchronisation FSM ← Historique**

**Principe** : Avant d'utiliser `session.ui.step`, **D'ABORD** dériver l'état depuis l'historique, **PUIS** synchroniser `session.ui.step` avec l'état dérivé.

**Exemple théorique** :
```typescript
// Dans executeAxiom()
let ui = candidate.session.ui;
if (!ui) {
  // Dériver depuis l'historique
  const derivedState = deriveStateFromConversationHistory(candidate);
  ui = {
    step: derivedState,
    lastQuestion: getLastAssistantMessage(candidate.conversationHistory)?.content || null,
    identityDone: !!candidate.identity.completedAt,
  };
  candidateStore.updateUIState(candidate.candidateId, ui);
  candidate = candidateStore.get(candidate.candidateId);
}

// SI ui existe, vérifier si elle est synchronisée avec l'historique
const derivedState = deriveStateFromConversationHistory(candidate);
if (ui.step !== derivedState) {
  // Désynchronisation détectée → Synchroniser
  candidateStore.updateUIState(candidate.candidateId, {
    step: derivedState,
    lastQuestion: getLastAssistantMessage(candidate.conversationHistory)?.content || null,
  });
  candidate = candidateStore.get(candidate.candidateId);
  ui = candidate.session.ui;
}

// Utiliser l'état dérivé (pas ui.step directement)
let currentState = derivedState;
```

#### **Étape 3 : Condition de transition depuis l'historique**

**Principe** : Avant de démarrer le BLOC 1, **VÉRIFIER** si un préambule existe dans `conversationHistory`.

**Exemple théorique** :
```typescript
// Dans executeAxiom(), bloc STEP_03_BLOC1
if (currentState === STEP_03_BLOC1) {
  if (event === 'START_BLOC_1') {
    // VÉRIFIER que le préambule existe dans l'historique
    const preambule = candidate.conversationHistory?.find(m => m.kind === 'preambule');
    if (!preambule) {
      // Préambule absent → Générer d'abord
      return await executeAxiom({
        candidate,
        userMessage: null,
      });
    }
    
    // Préambule présent → Démarrer BLOC 1
    // ...
  }
}
```

**Alternative** : Dériver l'état depuis l'historique **AVANT** de vérifier la condition :
```typescript
// Dériver l'état depuis l'historique
const derivedState = deriveStateFromConversationHistory(candidate);

// Si l'historique montre qu'un préambule existe, permettre la transition
if (derivedState === STEP_03_BLOC1 || event === 'START_BLOC_1') {
  const preambule = candidate.conversationHistory?.find(m => m.kind === 'preambule');
  if (preambule) {
    // Préambule présent → Démarrer BLOC 1
    // ...
  }
}
```

### 5.3 Règles métier explicites

#### **Règle n°1 : "Si un préambule existe, la transition est acquise"**

**Formulation** : Si `conversationHistory` contient un message assistant avec `kind: 'preambule'`, alors :
- L'état FSM doit être `STEP_03_BLOC1`
- La transition vers BLOC 1 est **AUTORISÉE**
- Aucune condition supplémentaire n'est requise

**Application** : Avant de bloquer la transition vers BLOC 1, vérifier si un préambule existe dans l'historique.

#### **Règle n°2 : "L'historique est la source de vérité n°1"**

**Formulation** : Pour déterminer l'état réel de la conversation, **TOUJOURS** vérifier `conversationHistory` en premier, puis dériver l'état FSM depuis l'historique.

**Application** : `deriveStepFromHistory()` doit être remplacée par `deriveStateFromConversationHistory()` qui utilise `conversationHistory`.

#### **Règle n°3 : "Synchronisation automatique FSM ← Historique"**

**Formulation** : Si `session.ui.step` est désynchronisé avec l'historique, **AUTOMATIQUEMENT** synchroniser `session.ui.step` avec l'état dérivé depuis l'historique.

**Application** : Avant d'utiliser `session.ui.step`, vérifier si elle est synchronisée avec l'historique, et la corriger si nécessaire.

### 5.4 Abandon de certaines guards bloquantes

#### **Guard à abandonner n°1 : Vérification exclusive de `session.ui.step`**

**Actuel** :
```typescript
if (currentState === STEP_03_BLOC1) {
  // Gère uniquement si currentState est STEP_03_BLOC1
}
```

**Proposé** :
```typescript
// Dériver l'état depuis l'historique
const derivedState = deriveStateFromConversationHistory(candidate);

// Utiliser l'état dérivé (pas session.ui.step directement)
if (derivedState === STEP_03_BLOC1 || currentState === STEP_03_BLOC1) {
  // Gère si l'historique OU la FSM indique STEP_03_BLOC1
}
```

#### **Guard à abandonner n°2 : Condition de transition dépendant uniquement de l'event**

**Actuel** :
```typescript
if (currentState === STEP_03_BLOC1 && event === 'START_BLOC_1') {
  // Démarrer BLOC 1
}
```

**Proposé** :
```typescript
// Vérifier si préambule existe dans l'historique
const preambule = candidate.conversationHistory?.find(m => m.kind === 'preambule');

if (preambule && (event === 'START_BLOC_1' || derivedState === STEP_03_BLOC1)) {
  // Préambule présent → Démarrer BLOC 1
}
```

---

## 6️⃣ CONCLUSION

### 6.1 Constats factuels

1. ✅ **Le préambule est bien stocké** dans `conversationHistory` avec `kind: 'preambule'`
2. ❌ **`deriveStepFromHistory()` ignore complètement** `conversationHistory`
3. ❌ **`executeAxiom()` utilise uniquement FSM** (`session.ui.step`) comme source de vérité
4. ❌ **La condition de transition vers BLOC 1** ne vérifie pas si un préambule existe dans l'historique
5. ❌ **La FSM peut être désynchronisée** avec l'historique, bloquant la transition vers BLOC 1

### 6.2 Hypothèse confirmée

**OUI**, l'hypothèse est **VALIDÉE** :

- ✅ Le droit d'entrer en BLOC 1 est encore dérivé de la FSM / UI state
- ✅ L'historique conversationnel n'est **PAS** utilisé pour déterminer si le préambule est terminé
- ✅ Le préambule peut exister dans l'historique sans que la FSM le reconnaisse

### 6.3 Solution théorique

**Architecture proposée** :
1. **Historique = Source de vérité n°1** : Dériver l'état depuis `conversationHistory`
2. **Synchronisation automatique** : Mettre à jour `session.ui.step` pour refléter l'état dérivé
3. **Condition de transition depuis l'historique** : Vérifier si un préambule existe avant de bloquer la transition
4. **Abandon des guards bloquantes** : Ne plus dépendre exclusivement de `session.ui.step` ou de l'event

**Résultat attendu** : AXIOM reconnaîtra qu'un préambule existe dans l'historique et autorisera la transition vers BLOC 1, même si la FSM est désynchronisée.

---

**FIN DE L'AUDIT**
