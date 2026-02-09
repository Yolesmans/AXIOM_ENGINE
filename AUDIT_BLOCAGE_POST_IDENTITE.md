# 🔍 AUDIT — BLOCAGE POST-IDENTITÉ (PAS DE QUESTION TONE)
**Date** : 2025-01-27  
**Objectif** : Identifier pourquoi AXIOM n'enchaîne pas vers la question tone après validation de l'identité

---

## ✅ CONFIRMATION DE L'HYPOTHÈSE

**HYPOTHÈSE VALIDÉE** : Il manque une règle métier explicite pour déclencher la génération de la question tone après validation de l'identité si elle n'existe pas encore dans `conversationHistory`.

**Cause racine** : `deriveStateFromConversationHistory()` peut retourner `STEP_01_IDENTITY` même si `identity.completedAt` est défini, si `conversationHistory` contient uniquement des messages utilisateur (identité) sans message assistant.

---

## 1️⃣ CHEMIN EXACT APRÈS VALIDATION IDENTITÉ

### 1.1 Séquence dans `executeAxiom()`

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1147-1197` (STEP_01_IDENTITY)

#### **Étape 1 : Validation identité**

```typescript
if (currentState === STEP_01_IDENTITY) {
  // ... validation identité ...
  
  // Valide → stocker et passer à tone_choice
  candidateStore.updateIdentity(candidate.candidateId, {
    firstName: identity.firstName,
    lastName: identity.lastName,
    email: identity.email,
    completedAt: new Date(),  // ← Identité complétée
  });

  currentState = STEP_02_TONE;
  candidateStore.updateUIState(candidate.candidateId, {
    step: currentState,
    lastQuestion: null,
    identityDone: true,
  });

  // Enchaîner immédiatement avec question tone
  return await executeAxiom({
    candidate: candidateStore.get(candidate.candidateId)!,
    userMessage: null,  // ← Appel récursif avec userMessage = null
  });
}
```

**État après cette étape** :
- ✅ `candidate.identity.completedAt` est défini
- ✅ `candidate.session.ui.step = STEP_02_TONE`
- ⚠️ `conversationHistory` peut contenir uniquement le message utilisateur (identité), **SANS** message assistant de type 'tone'

#### **Étape 2 : Appel récursif `executeAxiom()`**

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1085-1142`

```typescript
export async function executeAxiom(input: ExecuteAxiomInput): Promise<ExecuteAxiomResult> {
  let candidate = inputCandidate;
  
  // Dériver l'état depuis conversationHistory
  const derivedState = deriveStateFromConversationHistory(candidate);
  
  // ... synchronisation FSM ...
  
  let currentState = derivedState;  // ← Utilise derivedState, pas ui.step
  const stateIn = currentState;
```

**PROBLÈME** : `deriveStateFromConversationHistory()` est appelé **AVANT** que la question tone soit générée.

### 1.2 Analyse de `deriveStateFromConversationHistory()`

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `924-974`

```typescript
function deriveStateFromConversationHistory(candidate: AxiomCandidate): string {
  const history = candidate.conversationHistory || [];
  
  // Si aucun historique → STEP_01_IDENTITY
  if (history.length === 0) {
    return STEP_01_IDENTITY;
  }
  
  // Trouver le dernier message assistant
  const lastAssistant = history.filter(m => m.role === 'assistant').pop();
  
  if (!lastAssistant) {
    // Aucun message assistant → STEP_01_IDENTITY
    return STEP_01_IDENTITY;  // ← PROBLÈME ICI
  }
  
  // Dériver selon le type de message
  if (lastAssistant.kind === 'tone') {
    // ...
  }
  
  // Fallback : utiliser deriveStepFromHistory existant
  return deriveStepFromHistory(candidate);
}
```

**PROBLÈME CRITIQUE** : Si `conversationHistory` contient uniquement le message utilisateur (identité) mais **AUCUN** message assistant, alors :
- `lastAssistant` est `null`
- La fonction retourne `STEP_01_IDENTITY` (ligne 937)
- **MÊME SI** `identity.completedAt` est défini

**Résultat** : `derivedState = STEP_01_IDENTITY`, donc `currentState = STEP_01_IDENTITY`, donc le bloc `STEP_02_TONE` ne s'exécute **JAMAIS**.

### 1.3 Scénario de blocage

**Séquence exacte** :

1. **Validation identité** → `identity.completedAt` défini, `conversationHistory` contient message user (identité)
2. **Appel récursif** → `executeAxiom({ candidate, userMessage: null })`
3. **Dérivation état** → `deriveStateFromConversationHistory(candidate)`
   - `history.length > 0` (contient message identité)
   - `lastAssistant = null` (pas de message assistant encore)
   - **Retourne `STEP_01_IDENTITY`** (ligne 937)
4. **État dérivé** → `currentState = STEP_01_IDENTITY`
5. **Bloc FSM** → `if (currentState === STEP_01_IDENTITY)` s'exécute
   - `userMessage = null`
   - **Retourne** `{ response: '', step: 'IDENTITY', expectsAnswer: true, autoContinue: false }`
6. **Résultat** : Aucune question tone générée, état neutre

---

## 2️⃣ VÉRIFICATION DES RÈGLES MÉTIER

### 2.1 Règle manquante : Déclenchement question tone après identité

**Règle attendue** : Si `identity.completedAt` est défini ET qu'aucun message assistant de type 'tone' n'existe dans `conversationHistory`, ALORS générer la question tone.

**État actuel** : Cette règle n'existe **PAS** dans le code.

**Preuve** :
- `deriveStateFromConversationHistory()` ne vérifie **JAMAIS** `identity.completedAt` si `lastAssistant` est `null`
- Le bloc `STEP_01_IDENTITY` ne génère **JAMAIS** la question tone, même si `identity.completedAt` est défini
- Le bloc `STEP_02_TONE` ne s'exécute **JAMAIS** si `currentState !== STEP_02_TONE`

### 2.2 Règle existante : `deriveStepFromHistory()`

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `896-919`

```typescript
function deriveStepFromHistory(candidate: AxiomCandidate): string {
  // ...
  
  // Règle 4 : Si identité complétée → candidat est au tone
  if (candidate.identity.completedAt) {
    return STEP_02_TONE;  // ← Cette règle existe
  }
  
  return STEP_01_IDENTITY;
}
```

**Problème** : Cette règle existe dans `deriveStepFromHistory()`, mais `deriveStateFromConversationHistory()` ne l'utilise **QUE** en fallback (ligne 973), et seulement si `lastAssistant` existe mais n'a pas de `kind` reconnu.

**Si `lastAssistant` est `null`**, le fallback n'est **JAMAIS** atteint.

---

## 3️⃣ POINT EXACT DE BLOCAGE

### 3.1 Point de blocage n°1 : `deriveStateFromConversationHistory()` retourne `STEP_01_IDENTITY` trop tôt

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `935-937`

```typescript
if (!lastAssistant) {
  // Aucun message assistant → STEP_01_IDENTITY
  return STEP_01_IDENTITY;  // ← BLOQUE ICI
}
```

**Problème** : Si `lastAssistant` est `null`, la fonction retourne `STEP_01_IDENTITY` **SANS** vérifier si `identity.completedAt` est défini.

**Impact** : Même si l'identité est complétée, `derivedState = STEP_01_IDENTITY`, donc le bloc `STEP_02_TONE` ne s'exécute jamais.

### 3.2 Point de blocage n°2 : Bloc `STEP_01_IDENTITY` ne génère pas la question tone

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1147-1159`

```typescript
if (currentState === STEP_01_IDENTITY) {
  if (!userMessage) {
    // Première demande identité
    return {
      response: '',
      step: 'IDENTITY',
      expectsAnswer: true,
      autoContinue: false,
    };
  }
  // ...
}
```

**Problème** : Si `currentState === STEP_01_IDENTITY` et `!userMessage`, le bloc retourne un état neutre **SANS** vérifier si `identity.completedAt` est défini.

**Impact** : Même si l'identité est complétée, le bloc retourne `step: 'IDENTITY'` au lieu de générer la question tone.

### 3.3 Point de blocage n°3 : Bloc `STEP_02_TONE` ne s'exécute jamais

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : `1202-1228`

```typescript
if (currentState === STEP_02_TONE) {
  if (!userMessage) {
    // Première question tone
    const toneQuestion = 'Bienvenue dans AXIOM...';
    // ...
  }
}
```

**Problème** : Ce bloc ne s'exécute **QUE si** `currentState === STEP_02_TONE`.

**Impact** : Si `derivedState = STEP_01_IDENTITY`, ce bloc ne s'exécute **JAMAIS**, donc la question tone n'est **JAMAIS** générée.

---

## 4️⃣ LOGS THÉORIQUES (État actuel)

### 4.1 Après validation identité, avant appel récursif

```
conversationHistory: [
  { role: 'user', content: 'Prénom: John\nNom: Doe\nEmail: john@example.com', kind: 'other', createdAt: '...' }
]

identity.completedAt: 2025-01-27T10:00:00.000Z

currentState (avant récursion): STEP_02_TONE (défini manuellement ligne 1183)
```

### 4.2 Dans l'appel récursif `executeAxiom()`

```
conversationHistory: [
  { role: 'user', content: 'Prénom: John\nNom: Doe\nEmail: john@example.com', kind: 'other', createdAt: '...' }
]

identity.completedAt: 2025-01-27T10:00:00.000Z

deriveStateFromConversationHistory():
  - history.length = 1
  - lastAssistant = null (pas de message assistant)
  - RETOURNE STEP_01_IDENTITY (ligne 937)

derivedState: STEP_01_IDENTITY

currentState: STEP_01_IDENTITY

Bloc exécuté: STEP_01_IDENTITY
  - userMessage = null
  - RETOURNE { response: '', step: 'IDENTITY', expectsAnswer: true, autoContinue: false }
```

### 4.3 Décision finale

**Résultat** : `{ response: '', step: 'IDENTITY', expectsAnswer: true, autoContinue: false }`

**Problème** : Aucune question tone générée, état neutre.

---

## 5️⃣ CORRECTION THÉORIQUE PROPOSÉE

### 5.1 Correction n°1 : Modifier `deriveStateFromConversationHistory()`

**Principe** : Si `lastAssistant` est `null` mais `identity.completedAt` est défini, retourner `STEP_02_TONE` au lieu de `STEP_01_IDENTITY`.

**Modification proposée** :

```typescript
function deriveStateFromConversationHistory(candidate: AxiomCandidate): string {
  const history = candidate.conversationHistory || [];
  
  // Si aucun historique → STEP_01_IDENTITY
  if (history.length === 0) {
    return STEP_01_IDENTITY;
  }
  
  // Trouver le dernier message assistant
  const lastAssistant = history.filter(m => m.role === 'assistant').pop();
  
  if (!lastAssistant) {
    // Aucun message assistant → Vérifier si identité complétée
    if (candidate.identity.completedAt) {
      // Identité complétée mais pas de question tone → STEP_02_TONE
      return STEP_02_TONE;
    }
    return STEP_01_IDENTITY;
  }
  
  // ... reste du code ...
}
```

**Avantage** : Si l'identité est complétée mais qu'aucun message assistant n'existe, `derivedState = STEP_02_TONE`, donc le bloc `STEP_02_TONE` s'exécutera et générera la question tone.

### 5.2 Correction n°2 : Ajouter une règle dans le bloc `STEP_01_IDENTITY`

**Principe** : Si `identity.completedAt` est défini mais qu'aucun message assistant de type 'tone' n'existe, générer la question tone directement.

**Modification proposée** :

```typescript
if (currentState === STEP_01_IDENTITY) {
  if (!userMessage) {
    // Vérifier si identité complétée mais question tone pas encore générée
    if (candidate.identity.completedAt) {
      const toneInHistory = candidate.conversationHistory?.find(m => m.kind === 'tone');
      if (!toneInHistory) {
        // Identité complétée mais pas de question tone → Générer
        currentState = STEP_02_TONE;
        // Continuer vers bloc STEP_02_TONE
        // (ne pas return ici, laisser le flux continuer)
      }
    }
    
    // Première demande identité
    return {
      response: '',
      step: 'IDENTITY',
      expectsAnswer: true,
      autoContinue: false,
    };
  }
  // ...
}
```

**Avantage** : Détecte explicitement le cas où l'identité est complétée mais la question tone n'existe pas encore.

### 5.3 Correction n°3 : Règle métier explicite avant dérivation

**Principe** : Avant de dériver l'état, vérifier si une règle métier explicite doit s'appliquer.

**Modification proposée** :

```typescript
export async function executeAxiom(input: ExecuteAxiomInput): Promise<ExecuteAxiomResult> {
  let candidate = inputCandidate;
  
  // RÈGLE MÉTIER EXPLICITE : Si identité complétée mais pas de question tone → STEP_02_TONE
  if (candidate.identity.completedAt) {
    const toneInHistory = candidate.conversationHistory?.find(m => m.kind === 'tone');
    if (!toneInHistory) {
      // Forcer STEP_02_TONE pour déclencher la génération
      const derivedState = STEP_02_TONE;
      // ... continuer avec derivedState ...
    }
  }
  
  // Dériver l'état depuis conversationHistory
  const derivedState = deriveStateFromConversationHistory(candidate);
  // ...
}
```

**Avantage** : Règle métier explicite et claire, appliquée avant toute dérivation.

---

## 6️⃣ RECOMMANDATION

### 6.1 Correction la plus propre

**Recommandation** : **Correction n°1** — Modifier `deriveStateFromConversationHistory()` pour vérifier `identity.completedAt` si `lastAssistant` est `null`.

**Justification** :
- ✅ Minimal : Une seule modification dans une fonction
- ✅ Cohérent : `deriveStateFromConversationHistory()` devient la source de vérité complète
- ✅ Pas de duplication : Ne nécessite pas de règles supplémentaires dans d'autres blocs
- ✅ Prévisible : Si identité complétée, l'état dérivé sera toujours `STEP_02_TONE` (ou plus avancé)

### 6.2 Alternative : Correction n°3

**Si** on veut une règle métier plus explicite et visible, **Correction n°3** est également valable.

**Justification** :
- ✅ Explicite : Règle métier claire et visible au début de `executeAxiom()`
- ✅ Débogage : Plus facile à tracer et comprendre
- ⚠️ Moins élégant : Ajoute une condition supplémentaire avant la dérivation

---

## 7️⃣ CONCLUSION

### 7.1 Hypothèse confirmée

**OUI**, l'hypothèse est **VALIDÉE** :

- ✅ Il manque une règle métier explicite pour déclencher la question tone après validation identité
- ✅ `deriveStateFromConversationHistory()` retourne `STEP_01_IDENTITY` si `lastAssistant` est `null`, même si `identity.completedAt` est défini
- ✅ Le bloc `STEP_02_TONE` ne s'exécute jamais si `currentState !== STEP_02_TONE`
- ✅ Le moteur entre dans un état neutre sans action suivante autorisée

### 7.2 Point exact de blocage

**Point de blocage** : `src/engine/axiomExecutor.ts:935-937`

```typescript
if (!lastAssistant) {
  return STEP_01_IDENTITY;  // ← BLOQUE ICI
}
```

**Impact** : Même si `identity.completedAt` est défini, `derivedState = STEP_01_IDENTITY`, donc le bloc `STEP_02_TONE` ne s'exécute jamais.

### 7.3 Correction recommandée

**Correction** : Modifier `deriveStateFromConversationHistory()` pour vérifier `identity.completedAt` si `lastAssistant` est `null` :

```typescript
if (!lastAssistant) {
  // Aucun message assistant → Vérifier si identité complétée
  if (candidate.identity.completedAt) {
    return STEP_02_TONE;  // Identité complétée → Générer question tone
  }
  return STEP_01_IDENTITY;
}
```

**Résultat attendu** : Si l'identité est complétée mais qu'aucun message assistant n'existe, `derivedState = STEP_02_TONE`, donc le bloc `STEP_02_TONE` s'exécutera et générera la question tone.

---

**FIN DE L'AUDIT**
