# 🔍 AUDIT READ-ONLY — TRANSITION BLOC 2B → BLOC_03

**Date** : 12 février 2026  
**Commit** : `88fd5d3`  
**Type** : Diagnostic structurel (ZÉRO modification de code)

---

## PROBLÈME RAPPORTÉ

Après génération du miroir BLOC 2B, le backend renvoie:

```json
{
  "currentBlock": 3,
  "step": "BLOC_03",
  "state": "collecting",
  "expectsAnswer": false,
  "autoContinue": false,
  "nextQuestion": ""
}
```

**Conséquence** : Le frontend se bloque car:
- `expectsAnswer: false` → désactive le champ de saisie
- `nextQuestion: ""` → aucune question affichée

---

## A) FONCTION RESPONSABLE

**Fichier** : `src/services/blockOrchestrator.ts`  
**Fonction** : `handleBlock2B` (private async, lignes 875-1167)  
**Bloc concerné** : Lignes **1069-1158** (condition miroir déterministe + transition BLOC 3)

---

## B) CODE COMPLET DU BLOC RETURN

### Bloc return exact (lignes 1151-1158)

```typescript
return {
  response: combinedResponse,
  step: BLOC_03,
  expectsAnswer: nextResult.expectsAnswer,
  autoContinue: false,
  mirror,
  nextQuestion,
};
```

### Contexte complet (lignes 1105-1158)

```typescript
// Toutes les questions répondues → Générer miroir puis enchaînement auto bloc 3
const block2BAnswers = candidateStore.getBlock2BAnswers(currentCandidate);
const answersCount = block2BAnswers?.answers?.length ?? 0;
if (answersCount !== nextQuestionIndex) {
  console.warn('[ORCHESTRATOR] BLOC 2B mirror: answers.length !== nextQuestionIndex', {
    answersCount,
    nextQuestionIndex,
    queueLength,
  });
}
console.log('[ORCHESTRATOR] Generating BLOC 2B final mirror then auto-advance to BLOC 3', {
  nextQuestionIndex,
  queueLength,
  answersCount,
});
const mirror = await this.generateMirror2B(currentCandidate, works, coreWorkAnswer, onChunk, onUx);

candidateStore.appendAssistantMessage(candidateId, mirror, {
  block: blockNumber,
  step: BLOC_02,
  kind: 'mirror',
});
await candidateStore.setBlock2BCompleted(candidateId);
candidateStore.markBlockComplete(candidateId, 2);
await candidateStore.persistAndFlush(candidateId);
candidateStore.updateSession(candidateId, {
  state: 'collecting',
  currentBlock: 3,
});
candidateStore.updateUIState(candidateId, {
  step: BLOC_03,
  lastQuestion: null,
  identityDone: true,
});

let candidateForBloc3 = candidateStore.get(candidateId) ?? (await candidateStore.getAsync(candidateId));
if (!candidateForBloc3) {
  throw new Error(`Candidate ${candidateId} not found after 2B completion`);
}
const nextResult = await executeAxiom({
  candidate: candidateForBloc3,
  userMessage: null,
  event: undefined,
});
const nextQuestion = normalizeSingleResponse(nextResult.response || '');
const combinedResponse = `${mirror}\n\n${nextQuestion}`;
return {
  response: combinedResponse,
  step: BLOC_03,
  expectsAnswer: nextResult.expectsAnswer,
  autoContinue: false,
  mirror,
  nextQuestion,
};
```

---

## C) CHEMIN D'EXÉCUTION LIGNE PAR LIGNE

### Étape 1 : Génération miroir 2B (blockOrchestrator.ts)

| Ligne | Action | Valeur |
|-------|--------|--------|
| 1120 | Appel `generateMirror2B()` | `mirror` = texte miroir généré |
| 1122-1126 | Enregistre miroir dans conversationHistory | `block: 2, kind: 'mirror'` |
| 1127-1129 | Marque BLOC 2B terminé | `setBlock2BCompleted`, `markBlockComplete(2)` |
| 1130-1133 | Met à jour session | `state: 'collecting', currentBlock: 3` |
| 1134-1138 | Met à jour UI | `step: BLOC_03, lastQuestion: null` |

### Étape 2 : Appel executeAxiom pour BLOC 3 (blockOrchestrator.ts)

| Ligne | Action | Valeur |
|-------|--------|--------|
| 1140-1143 | Recharge candidateForBloc3 | `currentBlock: 3, step: BLOC_03` |
| 1144-1148 | **Appel executeAxiom()** | `{ candidate, userMessage: null, event: undefined }` |

### Étape 3 : Entrée dans executeAxiom (axiomExecutor.ts)

| Ligne | Action | Résultat |
|-------|--------|----------|
| 1747-1748 | Vérifie si `currentState` dans `blocStates` | ✅ `BLOC_03` est dans la liste |
| 1749 | Calcule `blocNumber` | `blocNumber = 3` |
| 1752-1757 | Construit historique + ajoute userMessage | `userMessage = null` → rien ajouté |
| 1760-1762 | Calcule `allQuestionsAnswered` | Appelle `areAllQuestionsAnswered(candidate, 3)` |

### Étape 4 : Vérification areAllQuestionsAnswered (axiomExecutor.ts)

| Ligne | Action | Résultat |
|-------|--------|----------|
| 1717 | Charge conversationHistory | `conversationHistory = [...]` |
| 1720-1722 | Filtre réponses BLOC 3 | `answersInBlock = conversationHistory.filter(m => m.block === 3 && m.role === 'user')` |
| 1720-1722 | **Compte réponses** | `answersInBlock.length = 0` (première entrée en BLOC 3) |
| 1726 | Charge seuil attendu | `expected = EXPECTED_ANSWERS_FOR_MIRROR[3] = 3` |
| 1727 | Compare | `0 >= 3` = **false** |
| 1727 | **Retour** | `allQuestionsAnswered = false` |

### Étape 5 : Décision miroir ou question (axiomExecutor.ts)

| Ligne | Action | Résultat |
|-------|--------|----------|
| 1767-1768 | Calcule `shouldForceMirror` | `(blocNumber === 3) && false = false` |
| 1773-1783 | Log état | `allQuestionsAnswered: false, shouldForceMirror: false` |
| 1810 | Vérifie conditions questions statiques | `!aiText && 3 >= 1 && 3 <= 9 && 3 !== 2 && !false` |
| 1810 | **Résultat condition** | ✅ **true** → entre dans le bloc |

### Étape 6 : Récupération question statique (axiomExecutor.ts)

| Ligne | Action | Résultat |
|-------|--------|----------|
| 1811-1814 | Filtre réponses BLOC 3 | `answersInBlockForQuestion.length = 0` |
| 1815 | **Appel getStaticQuestion(3, 0)** | Cherche `STATIC_QUESTIONS[3][0]` |
| staticQuestions.ts:103-107 | Retour `getStaticQuestion` | `STATIC_QUESTIONS[3][0]` OU `null` |

### Étape 7 : POINT CRITIQUE — Que retourne getStaticQuestion(3, 0) ?

**Code de getStaticQuestion** (staticQuestions.ts:103-107):

```typescript
export function getStaticQuestion(blocNumber: number, questionIndex: number): string | null {
  const arr = STATIC_QUESTIONS[blocNumber];
  if (!arr) return null;
  return arr[questionIndex] ?? null;
}
```

**Valeur attendue** (staticQuestions.ts:23-36):

```typescript
3: [
  `Quand tu dois prendre une décision importante, tu te fies plutôt à :
A. Ce qui est logique et cohérent
B. Ce que tu ressens comme juste
C. Ce qui a déjà fait ses preuves
D. Ce qui t'ouvre le plus d'options
(1 lettre)`,
  `Quand tu fais face à une situation que tu juges injuste :
A. Tu réagis immédiatement
B. Tu prends sur toi mais tu t'en souviens
C. Tu analyses avant d'agir
D. Tu évites le conflit si possible
(1 lettre)`,
  `En une phrase maximum : qu'est-ce qui te met le plus hors de toi chez les autres ?`,
],
```

**Résultat** :
- `STATIC_QUESTIONS[3]` existe ✅
- `STATIC_QUESTIONS[3][0]` existe ✅
- Retourne la première question du BLOC 3 ✅

### Étape 8 : Assignation aiText (axiomExecutor.ts:1816-1818)

| Ligne | Action | Résultat |
|-------|--------|----------|
| 1816 | Vérifie `if (nextQuestion)` | `nextQuestion` est une chaîne non vide → **true** |
| 1817 | **Assigne aiText** | `aiText = "Quand tu dois prendre une décision..."` |

### Étape 9 : Détection miroir vs question (axiomExecutor.ts:2005-2014)

| Ligne | Action | Résultat |
|-------|--------|----------|
| 2005-2012 | Calcule `looksLikeQuestion` | `aiText.includes("(1 lettre)")` → **true** |
| 2013 | Initialise `isMirror` | `isMirror = false` |
| 2014 | Calcule `expectsAnswer` | `isMirror ? true : (looksLikeQuestion || false)` = **true** |

### Étape 10 : Condition miroir (axiomExecutor.ts:2016-2068)

| Ligne | Action | Résultat |
|-------|--------|----------|
| 2016 | Vérifie `if (cleanMirrorText && blocNumber >= 1 && blocNumber <= 9 && !expectsAnswer)` | `true && true && true && !true` = **false** |
| 2016 | **Ne rentre PAS dans le if** | Pas de génération miroir (normal, c'est une question) |

### Étape 11 : Stockage et retour (axiomExecutor.ts:2074-2170)

| Ligne | Action | Résultat |
|-------|--------|----------|
| 2074-2077 | Assigne `lastQuestion` | `expectsAnswer = true` → `lastQuestion = aiText` |
| 2116-2126 | Met à jour UI | `step: BLOC_03, lastQuestion: aiText` |
| 2128-2135 | **Retour final executeAxiom** | `{ response: aiText, step: BLOC_03, expectsAnswer: true, lastQuestion: aiText }` |

### Étape 12 : Retour à blockOrchestrator (blockOrchestrator.ts:1149-1158)

| Ligne | Action | Résultat |
|-------|--------|----------|
| 1149 | Normalise `nextResult.response` | `nextQuestion = normalizeSingleResponse("Quand tu dois...")` |
| 1150 | Concatène miroir + question | `combinedResponse = "MIROIR 2B\n\nQuand tu dois..."` |
| 1151-1158 | **Return final** | `{ response: combinedResponse, step: BLOC_03, expectsAnswer: true, nextQuestion: "Quand tu dois..." }` |

---

## D) PREUVE QUE BLOC_03 EST EXÉCUTÉ AVANT LE RETURN

### Preuve 1 : Appel executeAxiom confirmé

**Ligne 1144-1148** (blockOrchestrator.ts):

```typescript
const nextResult = await executeAxiom({
  candidate: candidateForBloc3,
  userMessage: null,
  event: undefined,
});
```

**Confirmé** : `executeAxiom()` est **APPELÉ** avant le return.

### Preuve 2 : Flux executeAxiom vérifié

**Ligne 1747-1748** (axiomExecutor.ts):

```typescript
const blocStates = [BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10];
if (blocStates.includes(currentState as any)) {
```

**Confirmé** : BLOC_03 est dans `blocStates`, donc le flux entre dans ce bloc.

### Preuve 3 : Question statique générée

**Ligne 1810-1819** (axiomExecutor.ts):

```typescript
if (!aiText && blocNumber >= 1 && blocNumber <= 9 && blocNumber !== 2 && !shouldForceMirror) {
  const nextQuestion = getStaticQuestion(blocNumber, answersInBlockForQuestion.length);
  if (nextQuestion) {
    aiText = nextQuestion;
  }
}
```

**Confirmé** : La condition est **vraie**, donc `aiText` est défini avec la question BLOC 3.

### Preuve 4 : expectsAnswer calculé correctement

**Ligne 2005-2014** (axiomExecutor.ts):

```typescript
const looksLikeQuestion =
  aiText &&
  (
    aiText.trim().endsWith('?') ||
    /A\.\s+\S/.test(aiText) ||
    /\(1 lettre\)/i.test(aiText) ||
    /réponds/i.test(aiText)
  );
let isMirror = false;
let expectsAnswer = isMirror ? true : (looksLikeQuestion || false);
```

La question BLOC 3 contient `(1 lettre)` → `looksLikeQuestion = true` → `expectsAnswer = true`.

**Confirmé** : `expectsAnswer` devrait être **true**.

### Preuve 5 : Retour executeAxiom avec expectsAnswer: true

**Ligne 2128-2135** (axiomExecutor.ts):

```typescript
logTransition(candidate.candidateId, stateIn, currentState, userMessage ? 'message' : 'event');
return {
  response: aiText,
  step: currentState,
  lastQuestion,
  expectsAnswer,
  autoContinue: false,
};
```

**Confirmé** : `nextResult.expectsAnswer` devrait être **true**.

---

## E) CAUSE RACINE UNIQUE

### ❌ HYPOTHÈSE 1 : executeAxiom() n'est pas appelé

**FAUX** : Ligne 1144-1148 prouve l'appel.

### ❌ HYPOTHÈSE 2 : Question BLOC 3 n'est pas générée

**FAUX** : Ligne 1810-1819 génère la question statique si conditions réunies.

### ❌ HYPOTHÈSE 3 : expectsAnswer est mal calculé

**FAUX** : Ligne 2005-2014 calcule correctement `expectsAnswer = true` pour questions avec `(1 lettre)`.

### ✅ CAUSE RACINE CONFIRMÉE

**Le code AU COMMIT 88fd5d3 devrait FONCTIONNER CORRECTEMENT.**

**Si le problème se produit en production, DEUX scénarios possibles :**

#### Scénario A : `nextResult.response` est vide

**Condition** : Si `executeAxiom()` retourne `{ response: "", expectsAnswer: false }`.

**Causes potentielles** :
1. **Exception dans executeAxiom** catchée silencieusement → retour vide
2. **getStaticQuestion(3, 0) retourne null** → `aiText` reste null → `expectsAnswer = false`
3. **Condition ligne 1810 est false** → `aiText` reste null

**Preuve manquante** : Logs serveur au moment de la transition 2B→3.

**Ligne critique** : `axiomExecutor.ts:1977-1983` (fallback erreur)

```typescript
if (!aiText) {
  console.error('[AXIOM_CRITICAL_ERROR]', { sessionId: candidate.candidateId, state: currentState });
  logTransition(candidate.candidateId, stateIn, DONE_MATCHING, 'message');
  return {
    response: 'Erreur technique. Veuillez réessayer.',
    step: DONE_MATCHING,
    lastQuestion: null,
    expectsAnswer: false,
  };
}
```

Si `aiText` est null après toutes les tentatives, le moteur retourne un état d'erreur avec `expectsAnswer: false`.

#### Scénario B : `nextResult.expectsAnswer` est explicitement false

**Condition** : Si le calcul `expectsAnswer` échoue ou est overridé.

**Ligne critique** : `axiomExecutor.ts:2067-2068` (force expectsAnswer pour miroirs)

```typescript
// Forcer expectsAnswer: true pour les miroirs (C3)
expectsAnswer = true;
```

Cette ligne force `expectsAnswer = true` UNIQUEMENT pour les miroirs (`isMirror = true`). Pour les questions, `expectsAnswer` reste calculé selon `looksLikeQuestion`.

**Problème potentiel** : Si `looksLikeQuestion = false` alors que c'est une question BLOC 3.

**Pattern de détection** (ligne 2005-2012) :
```typescript
const looksLikeQuestion =
  aiText &&
  (
    aiText.trim().endsWith('?') ||
    /A\.\s+\S/.test(aiText) ||                 // options A-E
    /\(1 lettre\)/i.test(aiText) ||            // instruction réponse courte
    /réponds/i.test(aiText)
  );
```

La question BLOC 3 contient `(1 lettre)` donc ce pattern **devrait matcher**.

---

## F) DIAGNOSTIC FINAL

### Ce qui DEVRAIT se passer (code correct)

1. ✅ `executeAxiom()` est appelé avec `currentBlock: 3, step: BLOC_03, userMessage: null`
2. ✅ Entre dans le bloc BLOCS 1-10 (ligne 1748)
3. ✅ `allQuestionsAnswered(candidate, 3)` retourne `false` (0 réponses sur 3 attendues)
4. ✅ `shouldForceMirror = false`
5. ✅ Entre dans condition questions statiques (ligne 1810)
6. ✅ `getStaticQuestion(3, 0)` retourne la première question BLOC 3
7. ✅ `aiText` = question BLOC 3
8. ✅ `looksLikeQuestion = true` (pattern `(1 lettre)` détecté)
9. ✅ `expectsAnswer = true`
10. ✅ `nextResult = { response: question, expectsAnswer: true }`
11. ✅ `blockOrchestrator` retourne `{ response: miroir + question, expectsAnswer: true, nextQuestion: question }`

### Ce qui se passe en PRODUCTION (problème rapporté)

1. ❓ `executeAxiom()` est appelé
2. ❓ Entre dans le bloc BLOCS 1-10
3. ❓ ??? (quelque chose échoue ici)
4. ❌ `nextResult = { response: "", expectsAnswer: false }` OU `nextResult.response` est vide
5. ❌ `blockOrchestrator` retourne `{ response: miroir + "", expectsAnswer: false, nextQuestion: "" }`

### Points de vérification nécessaires

**LOGS SERVEUR OBLIGATOIRES** pour diagnostiquer :

1. **Log ligne 1773-1783** (axiomExecutor.ts) :
   ```
   [AXIOM][STATE] {
     step: 'BLOC_03',
     blocNumber: 3,
     answersInBlock: 0,
     expected: 3,
     allQuestionsAnswered: false,
     shouldForceMirror: false,
     hasUserMessage: false,
     event: null
   }
   ```

2. **Log ligne 1115** (blockOrchestrator.ts) :
   ```
   [ORCHESTRATOR] Generating BLOC 2B final mirror then auto-advance to BLOC 3
   ```

3. **Log ligne 1977-1979** (axiomExecutor.ts) :
   ```
   [AXIOM_CRITICAL_ERROR] { sessionId: '...', state: 'BLOC_03' }
   ```
   **Si ce log apparaît → `aiText` est null → erreur dans la génération question statique**

4. **Vérifier que `STATIC_QUESTIONS[3]` existe** :
   ```typescript
   console.log('STATIC_QUESTIONS[3]:', STATIC_QUESTIONS[3]);
   // Devrait afficher : ["Quand tu dois prendre...", "Quand tu fais face...", "En une phrase..."]
   ```

---

## G) CONCLUSION

### Code au commit 88fd5d3

**Le flux de transition 2B → BLOC 3 est CORRECT dans le code.**

- `executeAxiom()` est appelé ✅
- Question statique BLOC 3 devrait être générée ✅
- `expectsAnswer` devrait être `true` ✅

### Si le problème se produit en production

**CAUSE PROBABLE** :

1. **Exception silencieuse** dans `executeAxiom()` → retour vide
2. **`getStaticQuestion(3, 0)` retourne null** pour une raison inconnue (import cassé ?)
3. **Condition ligne 1810 est false** alors qu'elle devrait être true

**ACTION REQUISE** :

**Capturer les logs serveur** au moment de la transition 2B→3 et chercher :
- `[AXIOM][STATE]` pour voir `allQuestionsAnswered`, `shouldForceMirror`
- `[AXIOM_CRITICAL_ERROR]` pour détecter si `aiText` est null
- Aucun log = exception catchée ailleurs

**TEST MINIMAL** :

```bash
# Lancer serveur local
npm start

# Compléter BLOC 2B
# Vérifier logs console au moment du miroir 2B

# Chercher :
# 1. [ORCHESTRATOR] Generating BLOC 2B final mirror then auto-advance to BLOC 3
# 2. [AXIOM][STATE] { step: 'BLOC_03', ... }
# 3. Présence/absence de [AXIOM_CRITICAL_ERROR]
```

---

## ✅ VALIDATION AUDIT

**Aucune modification de code n'a été effectuée.**

Ce document est un audit READ-ONLY basé uniquement sur :
- Lecture du code au commit `88fd5d3`
- Analyse ligne par ligne de `blockOrchestrator.ts` et `axiomExecutor.ts`
- Vérification des valeurs `STATIC_QUESTIONS` et `EXPECTED_ANSWERS_FOR_MIRROR`

**Conclusion** : Le code est cohérent. Si le problème se produit, il provient d'une condition runtime non visible dans le code statique (exception, import cassé, race condition, état corrompu).

**Prochaine étape** : Reproduire le problème en local avec logs activés.

---

**FIN DE L'AUDIT** — Commit 88fd5d3
