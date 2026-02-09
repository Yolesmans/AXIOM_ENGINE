# 🗺️ PLAN DE ROUTE DE CORRECTION — AXIOM ENGINE

**Date** : 2025-01-27  
**Objectif** : Document de référence unique pour correction complète du parcours AXIOM  
**Type** : Planification exhaustive (aucune modification de code)

---

## 📋 TABLE DES MATIÈRES

1. [État des lieux complet](#1-état-des-lieux-complet)
2. [Liste exhaustive des correctifs](#2-liste-exhaustive-des-correctifs)
3. [Ordre de correction recommandé](#3-ordre-de-correction-recommandé)
4. [Checklist finale de validation](#4-checklist-finale-de-validation)
5. [Référence feuille de route initiale](#5-référence-feuille-de-route-initiale)

---

## 1️⃣ ÉTAT DES LIEUX COMPLET

### 1.1 Démarrer le parcours — Après préambule

#### ✅ Conforme

**Bouton "Je commence mon profil"** :
- ✅ Déclenchement correct : `event === 'START_BLOC_1'` → `BlockOrchestrator.handleMessage()`
- ✅ États renvoyés corrects : `step: BLOC_01`, `currentBlock: 1`, `expectsAnswer: true`
- ✅ Double clic protégé : Garde `queue.questions.length === 0` empêche double génération
- ✅ Refresh après préambule : Dérivation depuis `conversationHistory` → `STEP_03_BLOC1` → bouton affiché

**Références** :
- `src/server.ts` (lignes 650-690)
- `src/services/blockOrchestrator.ts` (lignes 161-169)
- `ui-test/app.js` (lignes 109-111)

#### ⚠️ Ambigu / Fragile

**Message utilisateur avant clic bouton** :
- **Scénario** : Utilisateur envoie message texte alors que `step === 'STEP_03_BLOC1'`
- **Comportement actuel** : Message traité par `executeWithAutoContinue()` (ancien moteur) si `step !== BLOC_01`
- **Risque** : Dépend de l'état exact de `step`, peut créer confusion
- **Impact utilisateur** : Message ignoré ou traité incorrectement

**Référence** : `src/server.ts` (ligne 696)

---

### 1.2 Enchaînement complet des blocs

#### ❌ Non conforme (3 points critiques)

**1. Transition BLOC 1 → BLOC 2A** :
- **Problème** : `currentBlock` n'est **PAS** mis à jour dans l'orchestrateur après miroir BLOC 1
- **Référence** : `src/services/blockOrchestrator.ts` (lignes 219-224)
- **Impact** : Risque de routage incorrect si `currentBlock` reste à `1` alors que `step === BLOC_02`
- **État** : ❌ **NON CONFORME**

**2. Transition BLOC 2B → BLOC 3** :
- **Problème** : Aucune transition vers BLOC 3 après miroir final BLOC 2B
- **Référence** : `src/services/blockOrchestrator.ts` (lignes 832-843)
- **Impact** : Système reste bloqué en `BLOC_02`, parcours bloqué
- **État** : ❌ **NON CONFORME** (BLOQUANT)

**3. Cohérence step / currentBlock / state** :
- **Problème** : `currentBlock` mis à jour uniquement dans mapping `/axiom`, pas dans orchestrateur
- **Référence** : `src/server.ts` (ligne 894) vs `src/services/blockOrchestrator.ts` (ligne 220)
- **Impact** : Désynchronisation possible entre `step` et `currentBlock`
- **État** : ❌ **NON CONFORME**

#### ✅ Conforme

**Transitions BLOC 2A → BLOC 2B** :
- ✅ Détection correcte : `answeredCount >= 3` dans `handleMessage()`
- ✅ Routage conditionnel : `handleBlock2B()` si terminé, sinon `handleBlock2A()`
- ✅ Transition explicite : Message obsolète présent mais jamais atteint (à supprimer)

**Transitions BLOC 3 → BLOC 10** :
- ✅ Gérées par FSM existante (`executeWithAutoContinue`)
- ✅ Transitions automatiques fonctionnelles
- ✅ Pas de bloc sauté ou rejoué

**Références** :
- `src/services/blockOrchestrator.ts` (lignes 130-144)
- `src/engine/axiomExecutor.ts` (lignes 1678-1688)

---

### 1.3 BLOC 2A / 2B (Zone critique)

#### ✅ Conforme

**BLOC 2A — Adaptation question par question** :
- ✅ Dépendances respectées : Question 2A.2 dépend de réponse 2A.1, Question 2A.3 dépend de réponses 2A.1 et 2A.2
- ✅ Génération séquentielle : 3 appels API distincts, 1 question à la fois
- ✅ Stockage correct : Réponses stockées dans `AnswerMap` avant génération question suivante

**BLOC 2B — Validation sémantique** :
- ✅ Fail-fast qualitatif : Validation AVANT serving, retry contrôlé (max 1)
- ✅ Injection forcée BLOC 2A : `buildConversationHistoryForBlock2B()` garantit présence des œuvres
- ✅ Verrous effectifs : `validateMotifsSpecificity()` et `validateTraitsSpecificity()` appliquées

**Références** :
- `src/services/blockOrchestrator.ts` (lignes 430, 465, 776-782)
- `src/services/validators.ts` (lignes 62-169)

#### ⚠️ Ambigu / Fragile

**Gestion d'erreur fail-fast BLOC 2B** :
- **Problème** : Erreur throw → 500 brute, pas de message utilisateur-friendly
- **Référence** : `src/services/blockOrchestrator.ts` (lignes 1096-1103), `src/server.ts` (ligne 786)
- **Impact** : Utilisateur bloqué sans message clair en cas d'échec validation après retry
- **État** : ⚠️ **AMBIGU**

**Réconciliation personnages BLOC 2B** :
- **Problème** : Aucune logique explicite de réconciliation (descriptions → noms canoniques)
- **Référence** : `src/prompts/metier/AXIOM_PROFIL.txt` (lignes 594-600) vs code
- **Impact** : Dépend de la fidélité de l'IA au prompt, non garantie techniquement
- **État** : ⚠️ **AMBIGU**

**Refresh pendant BLOC 2B** :
- **Problème** : `QuestionQueue` peut être perdue si store non persistant
- **Référence** : `src/services/blockOrchestrator.ts` (ligne 767)
- **Impact** : Re-génération des questions si queue perdue
- **État** : ⚠️ **AMBIGU**

---

### 1.4 Déclenchement du matching

#### ❌ Non conforme (BLOQUANT)

**Bouton "Je génère mon matching"** :
- **Problème** : Le bouton envoie `callAxiom(null)` (pas d'event), condition ligne 1743 bloque le déclenchement
- **Référence** : `ui-test/app.js` (ligne 200), `src/engine/axiomExecutor.ts` (lignes 1741-1752)
- **Impact** : Le matching ne peut **PAS** être déclenché, parcours bloqué
- **État** : ❌ **NON CONFORME** (BLOQUANT)

**Moment de proposition du bouton** :
- ✅ Correct : Bouton apparaît au bon moment (`step === 'STEP_99_MATCH_READY' && expectsAnswer === false`)
- ✅ Champ de saisie masqué correctement

**Références** :
- `src/engine/axiomExecutor.ts` (lignes 1708-1727)
- `ui-test/app.js` (lignes 112-114, 301-307)

---

### 1.5 UI / Boutons / Actions utilisateur

#### ✅ Conforme

**Bouton "Je commence mon profil"** :
- ✅ Apparaît au bon moment
- ✅ Déclenche correctement
- ✅ Champ de saisie masqué

**Cohérence front ↔ backend** :
- ✅ Mapping `/start` et `/axiom` cohérents
- ✅ Détection frontend basée sur `step` (cohérent)

#### ⚠️ Ambigu / Fragile

**États bloquants ou sans issue** :
- **Scénario A** : Message utilisateur alors que bouton attendu → Dépend de l'état exact
- **Scénario B** : Refresh pendant BLOC 2B → `QuestionQueue` peut être perdue
- **Scénario C** : Erreur validation BLOC 2B après retry → 500 brute

**Références** : Voir sections 1.1, 1.3

---

## 2️⃣ LISTE EXHAUSTIVE DES CORRECTIFS

### 🔴 CORRECTIF 1 — Transition BLOC 2B → BLOC 3 (CRITIQUE)

**Description du problème** :
Après génération du miroir final BLOC 2B, le système reste bloqué en `BLOC_02`. Aucune transition vers BLOC 3 n'est effectuée.

**Cause technique probable** :
Dans `handleBlock2B()`, après génération du miroir (ligne 822), seule la mise à jour de `step: BLOC_02` est effectuée (ligne 833). Aucune mise à jour de `currentBlock` vers `3` ni de `step` vers `BLOC_03`.

**Impact utilisateur** :
- **BLOQUANT** : Le parcours s'arrête après BLOC 2B
- L'utilisateur ne peut pas continuer vers BLOC 3
- Le routage suivant dans `POST /axiom` (ligne 762) vérifie `currentBlock === 2`, donc BLOC 2B sera rejoué indéfiniment

**Hypothèse(s) de correction** :

**Option A — Dans `handleBlock2B()` (recommandé)** :
```typescript
// Après génération miroir final (ligne 822)
candidateStore.markBlockComplete(candidateId, blockNumber);

const mirror = await this.generateMirror2B(currentCandidate, works, coreWorkAnswer);

// Enregistrer le miroir dans conversationHistory
candidateStore.appendAssistantMessage(candidateId, mirror, {
  block: blockNumber,
  step: BLOC_03, // ← Changer vers BLOC_03
  kind: 'mirror',
});

// Mettre à jour UI state ET currentBlock
candidateStore.updateSession(candidateId, { 
  state: "collecting", 
  currentBlock: 3  // ← Ajouter mise à jour currentBlock
});
candidateStore.updateUIState(candidateId, {
  step: BLOC_03, // ← Changer vers BLOC_03
  lastQuestion: null,
  identityDone: true,
});

return {
  response: mirror,
  step: BLOC_03, // ← Changer vers BLOC_03
  expectsAnswer: false,
  autoContinue: false,
};
```

**Fichier à modifier** : `src/services/blockOrchestrator.ts` (lignes 817-843)

**Risque de régression** : Faible (transition explicite, pas de dépendance implicite)

**Tests à effectuer** :
1. Compléter BLOC 2B (toutes questions + miroir)
2. Vérifier : `currentBlock === 3` et `step === BLOC_03`
3. Envoyer message utilisateur
4. Vérifier : Routage vers BLOC 3 (pas rejouer BLOC 2B)

---

### 🔴 CORRECTIF 2 — Déclenchement matching (CRITIQUE)

**Description du problème** :
Le bouton "Je génère mon matching" envoie `callAxiom(null)` (pas d'event), mais la condition ligne 1743 dans `axiomExecutor.ts` bloque le déclenchement si `!userMessage && !event`.

**Cause technique probable** :
- Frontend : `ui-test/app.js` ligne 200 envoie `await callAxiom(null)` (pas d'event)
- Backend : `src/engine/axiomExecutor.ts` ligne 1743 vérifie `if (!userMessage && !event)` → retourne message d'attente au lieu de déclencher matching

**Impact utilisateur** :
- **BLOQUANT** : Le matching ne peut **PAS** être déclenché
- L'utilisateur reste bloqué après BLOC 10
- Le parcours ne peut pas se terminer

**Hypothèse(s) de correction** :

**Option A — Frontend envoie event explicite (recommandé)** :
```javascript
// ui-test/app.js ligne 200
matchingButton.addEventListener('click', async () => {
  matchingButton.disabled = true;
  await callAxiom(null, 'START_MATCHING'); // ← Ajouter event
});
```

**Option B — Backend détecte automatiquement** :
```typescript
// src/engine/axiomExecutor.ts ligne 1743
if (currentState === STEP_99_MATCH_READY) {
  // Si userMessage === null ET event === null ET step === STEP_99_MATCH_READY
  // → Déclencher matching automatiquement (première fois)
  if (!userMessage && !event) {
    // Première fois → déclencher matching
    currentState = STEP_99_MATCHING;
    // ... suite du code
  }
  // Si déjà en attente → retourner message d'attente
  // ...
}
```

**Recommandation** : **Option A** (plus explicite, moins ambigu)

**Fichiers à modifier** :
- `ui-test/app.js` (ligne 200)
- Potentiellement `src/engine/axiomExecutor.ts` (ligne 1743) si Option B

**Risque de régression** : Faible (ajout d'event explicite)

**Tests à effectuer** :
1. Compléter BLOC 10
2. Vérifier : Bouton "Je génère mon matching" apparaît
3. Cliquer sur le bouton
4. Vérifier : Matching déclenché (pas message d'attente)

---

### 🔴 CORRECTIF 3 — Transition BLOC 1 → BLOC 2A (CRITIQUE)

**Description du problème** :
Après génération du miroir BLOC 1, `currentBlock` n'est **PAS** mis à jour dans l'orchestrateur. Seul `step: BLOC_02` est mis à jour.

**Cause technique probable** :
Dans `handleBlock1()` (orchestrateur), après génération du miroir (ligne 210), seule la mise à jour de `step: BLOC_02` est effectuée (ligne 220). Aucune mise à jour de `currentBlock` vers `2`.

**Impact utilisateur** :
- Risque de routage incorrect si `currentBlock` reste à `1` alors que `step === BLOC_02`
- Désynchronisation entre `step` et `currentBlock`

**Hypothèse(s) de correction** :

**Option A — Dans `handleBlock1()` (recommandé)** :
```typescript
// Après génération miroir (ligne 210)
candidateStore.markBlockComplete(currentCandidate.candidateId, blockNumber);
const mirror = await this.generateMirrorForBlock1(currentCandidate);

// Enregistrer le miroir dans conversationHistory
candidateStore.appendAssistantMessage(currentCandidate.candidateId, mirror, {
  block: blockNumber,
  step: BLOC_02,
  kind: 'mirror',
});

// Mettre à jour UI state ET currentBlock
candidateStore.updateSession(currentCandidate.candidateId, { 
  state: "collecting", 
  currentBlock: 2  // ← Ajouter mise à jour currentBlock
});
candidateStore.updateUIState(currentCandidate.candidateId, {
  step: BLOC_02,
  lastQuestion: null,
  identityDone: true,
});

return {
  response: mirror,
  step: BLOC_02,
  expectsAnswer: false,
  autoContinue: false,
};
```

**Fichier à modifier** : `src/services/blockOrchestrator.ts` (lignes 205-231)

**Risque de régression** : Faible (transition explicite)

**Tests à effectuer** :
1. Compléter BLOC 1 (toutes questions + miroir)
2. Vérifier : `currentBlock === 2` et `step === BLOC_02`
3. Envoyer message utilisateur
4. Vérifier : Routage vers BLOC 2A (pas rejouer BLOC 1)

---

### 🟠 CORRECTIF 4 — Gestion d'erreur fail-fast BLOC 2B (ÉLEVÉ)

**Description du problème** :
Si la validation BLOC 2B échoue après retry, une `Error` est throw, mais elle n'est pas catchée dans `POST /axiom`, ce qui provoque une 500 brute.

**Cause technique probable** :
- `validateAndRetryQuestions2B()` throw `Error` (ligne 1102)
- `handleBlock2B()` propage l'erreur (pas de try/catch)
- `POST /axiom` ligne 786 appelle `orchestrator.handleMessage()` sans try/catch spécifique
- Express catch l'erreur non gérée → 500 brute

**Impact utilisateur** :
- Message utilisateur non friendly en cas d'échec validation
- Pas de fallback ou message d'erreur clair
- Utilisateur bloqué sans comprendre pourquoi

**Hypothèse(s) de correction** :

**Option A — Try/catch spécifique dans `POST /axiom` (recommandé)** :
```typescript
// src/server.ts ligne 786
const orchestrator = new BlockOrchestrator();
let result: OrchestratorResult;

try {
  result = await orchestrator.handleMessage(candidate, userMessageText, null);
} catch (error) {
  // Gérer spécifiquement erreur validation BLOC 2B
  if (error instanceof Error && error.message.includes('BLOC 2B validation failed')) {
    console.error('[ORCHESTRATOR] [2B_VALIDATION_FAIL] fatal=true', error.message);
    
    return res.status(200).json({
      sessionId: candidate.candidateId,
      currentBlock: candidate.session.currentBlock,
      state: "collecting",
      response: "Une erreur technique est survenue lors de la génération des questions. Veuillez réessayer ou contacter le support.",
      step: BLOC_02,
      expectsAnswer: false,
      autoContinue: false,
    });
  }
  
  // Re-throw autres erreurs
  throw error;
}

// Suite du code normal...
```

**Fichier à modifier** : `src/server.ts` (lignes 785-835)

**Risque de régression** : Faible (ajout gestion d'erreur, pas de changement logique)

**Tests à effectuer** :
1. Simuler échec validation BLOC 2B après retry (mock)
2. Vérifier : Message utilisateur-friendly renvoyé (pas 500)
3. Vérifier : Log `[2B_VALIDATION_FAIL] fatal=true` présent

---

### 🟠 CORRECTIF 5 — Garde message utilisateur avant clic bouton BLOC 1 (ÉLEVÉ)

**Description du problème** :
Si un utilisateur envoie un message texte alors que `step === 'STEP_03_BLOC1'` (bouton attendu), le message est traité par `executeWithAutoContinue()` (ancien moteur), ce qui peut créer confusion.

**Cause technique probable** :
Dans `POST /axiom`, la vérification `candidate.session.ui?.step === BLOC_01 || candidate.session.currentBlock === 1` (ligne 696) ne couvre pas le cas `step === 'STEP_03_BLOC1'`.

**Impact utilisateur** :
- Message ignoré ou traité incorrectement
- Confusion utilisateur (bouton attendu mais message envoyé)

**Hypothèse(s) de correction** :

**Option A — Ajouter garde explicite (recommandé)** :
```typescript
// src/server.ts ligne 692
const userMessageText = userMessage || null;

// Garde : Si step === STEP_03_BLOC1 ET userMessage présent ET event !== START_BLOC_1
// → Ignorer le message ou retourner erreur explicite
if (candidate.session.ui?.step === STEP_03_BLOC1 && userMessageText && event !== 'START_BLOC_1') {
  return res.status(200).json({
    sessionId: candidate.candidateId,
    currentBlock: candidate.session.currentBlock,
    state: "wait_start_button",
    response: "Pour commencer le profil, clique sur le bouton 'Je commence mon profil' ci-dessus.",
    step: STEP_03_BLOC1,
    expectsAnswer: false,
    autoContinue: false,
  });
}

// Suite du code normal...
```

**Fichier à modifier** : `src/server.ts` (lignes 692-695)

**Risque de régression** : Faible (ajout garde, pas de changement logique)

**Tests à effectuer** :
1. Atteindre `step === STEP_03_BLOC1` (bouton affiché)
2. Envoyer message texte (sans cliquer bouton)
3. Vérifier : Message d'erreur explicite renvoyé (pas traitement par ancien moteur)

---

### 🟡 CORRECTIF 6 — Améliorer réconciliation personnages BLOC 2B (MOYEN)

**Description du problème** :
La réconciliation des personnages (descriptions → noms canoniques) est déléguée entièrement à l'IA via le prompt, sans validation post-génération.

**Cause technique probable** :
- Aucune logique explicite de réconciliation dans le code
- Le prompt métier contient l'instruction (lignes 594-600), mais elle n'est pas réinjectée dans le prompt système BLOC 2B
- Aucune validation post-génération pour vérifier que les noms sont canoniques

**Impact utilisateur** :
- Si l'IA ne suit pas le prompt, descriptions peuvent rester au lieu de noms canoniques
- Questions traits peuvent contenir "le chef" au lieu de "Tommy Shelby"
- Impact limité mais qualité dégradée

**Hypothèse(s) de correction** :

**Option A — Validation post-génération + retry (recommandé)** :
```typescript
// src/services/blockOrchestrator.ts
private validateCharacterNames(questions: string[]): ValidationResult {
  // Détecter descriptions au lieu de noms canoniques
  const descriptions = ['le chef', 'son associée', 'celui qui', 'l\'autre frère'];
  const hasDescriptions = questions.some(q => 
    descriptions.some(desc => q.toLowerCase().includes(desc))
  );
  
  if (hasDescriptions) {
    return {
      valid: false,
      error: 'Descriptions détectées au lieu de noms canoniques'
    };
  }
  
  return { valid: true };
}

// Dans generateQuestions2B(), après génération
const validation = this.validateCharacterNames(questions);
if (!validation.valid) {
  // Retry avec prompt renforcé mentionnant explicitement réconciliation
  questions = await this.generateQuestions2BWithReconciliation(candidate, works, coreWork);
}
```

**Fichier à modifier** : `src/services/blockOrchestrator.ts` (méthode `generateQuestions2B`)

**Risque de régression** : Faible (ajout validation, pas de changement logique)

**Tests à effectuer** :
1. Générer questions BLOC 2B
2. Vérifier : Noms de personnages sont canoniques (pas descriptions)
3. Si descriptions détectées → retry avec prompt renforcé

---

### 🟡 CORRECTIF 7 — Supprimer message obsolète BLOC 2A (MOYEN)

**Description du problème** :
Dans `handleBlock2A()`, lignes 499-504, un message obsolète "BLOC 2A terminé. Transition vers BLOC 2B (non implémenté)." est présent mais jamais atteint (car `answeredCount >= 3` route vers `handleBlock2B()`).

**Cause technique probable** :
Message laissé lors de l'implémentation, jamais supprimé après implémentation BLOC 2B.

**Impact utilisateur** :
- Aucun (message jamais atteint)
- Mais confusion potentielle si code modifié

**Hypothèse(s) de correction** :

**Option A — Supprimer le code obsolète (recommandé)** :
```typescript
// src/services/blockOrchestrator.ts lignes 487-505
// Supprimer complètement le bloc :
// if (updatedAnsweredCount === 3) {
//   console.log('[ORCHESTRATOR] BLOC 2A terminé, transition vers BLOC 2B');
//   candidateStore.markBlockComplete(candidateId, blockNumber);
//   candidateStore.updateUIState(candidateId, {
//     step: BLOC_02,
//     lastQuestion: null,
//     identityDone: true,
//   });
//   return {
//     response: 'BLOC 2A terminé. Transition vers BLOC 2B (non implémenté).',
//     step: BLOC_02,
//     expectsAnswer: false,
//     autoContinue: false,
//   };
// }
```

**Fichier à modifier** : `src/services/blockOrchestrator.ts` (lignes 487-505)

**Risque de régression** : Aucun (code jamais atteint)

**Tests à effectuer** :
1. Vérifier : Code supprimé
2. Vérifier : Transition BLOC 2A → BLOC 2B fonctionne toujours (via `handleMessage()`)

---

## 3️⃣ ORDRE DE CORRECTION RECOMMANDÉ

### 🔴 PRIORITÉ CRITIQUE (BLOQUANT PRODUCTION)

**Ordre strict** :

1. **CORRECTIF 1 — Transition BLOC 2B → BLOC 3**
   - **Raison** : Bloque complètement le parcours après BLOC 2B
   - **Temps estimé** : 15 minutes
   - **Dépendances** : Aucune

2. **CORRECTIF 2 — Déclenchement matching**
   - **Raison** : Bloque complètement la fin du parcours
   - **Temps estimé** : 10 minutes (Option A) ou 30 minutes (Option B)
   - **Dépendances** : Aucune

3. **CORRECTIF 3 — Transition BLOC 1 → BLOC 2A**
   - **Raison** : Risque de routage incorrect, désynchronisation
   - **Temps estimé** : 10 minutes
   - **Dépendances** : Aucune

**Validation après priorité critique** :
- ✅ Parcours complet fonctionnel (BLOC 1 → 2A → 2B → 3 → ... → 10 → Matching)
- ✅ Aucun bloc bloqué
- ✅ Transitions explicites et effectives

---

### 🟠 PRIORITÉ ÉLEVÉE (RISQUE UTILISATEUR)

**Ordre recommandé** :

4. **CORRECTIF 4 — Gestion d'erreur fail-fast BLOC 2B**
   - **Raison** : Amélioration UX en cas d'échec validation
   - **Temps estimé** : 20 minutes
   - **Dépendances** : Aucune

5. **CORRECTIF 5 — Garde message utilisateur avant clic bouton BLOC 1**
   - **Raison** : Éviter confusion utilisateur
   - **Temps estimé** : 15 minutes
   - **Dépendances** : Aucune

**Validation après priorité élevée** :
- ✅ Messages d'erreur utilisateur-friendly
- ✅ Aucun état bloquant sans message clair

---

### 🟡 PRIORITÉ MOYENNE (AMÉLIORATION)

**Ordre recommandé** :

6. **CORRECTIF 6 — Améliorer réconciliation personnages BLOC 2B**
   - **Raison** : Amélioration qualité (non bloquant)
   - **Temps estimé** : 1-2 heures
   - **Dépendances** : Aucune

7. **CORRECTIF 7 — Supprimer message obsolète BLOC 2A**
   - **Raison** : Nettoyage code (non bloquant)
   - **Temps estimé** : 5 minutes
   - **Dépendances** : Aucune

**Validation après priorité moyenne** :
- ✅ Code propre, pas de confusion
- ✅ Qualité améliorée (réconciliation personnages)

---

## 4️⃣ CHECKLIST FINALE DE VALIDATION

### 4.1 Parcours complet fonctionnel

- [ ] **Démarrage** : Bouton "Je commence mon profil" déclenche BLOC 1
- [ ] **BLOC 1** : Toutes questions servies séquentiellement → Miroir généré → Transition BLOC 2A
- [ ] **BLOC 2A** : 3 questions adaptatives → Transition BLOC 2B
- [ ] **BLOC 2B** : Questions projectives servies séquentiellement → Miroir généré → Transition BLOC 3
- [ ] **BLOC 3-10** : Parcours complet sans bloc sauté ou rejoué
- [ ] **Matching** : Bouton "Je génère mon matching" déclenche le matching

### 4.2 Cohérence états

- [ ] **step / currentBlock / state** : Cohérents à chaque transition
- [ ] **expectsAnswer** : Correctement renvoyé (true pour questions, false pour miroirs)
- [ ] **Front ↔ Backend** : Mapping cohérent entre `/start` et `/axiom`

### 4.3 Cas limites

- [ ] **Refresh après préambule** : Bouton affiché, pas de régression
- [ ] **Double clic bouton BLOC 1** : Pas de double génération
- [ ] **Message utilisateur avant clic bouton** : Message d'erreur explicite
- [ ] **Refresh pendant BLOC 2B** : Reprise correcte (queue conservée)
- [ ] **Erreur validation BLOC 2B** : Message utilisateur-friendly (pas 500 brute)

### 4.4 Qualité BLOC 2A / 2B

- [ ] **BLOC 2A adaptation** : Question 2A.2 adaptée au médium choisi
- [ ] **BLOC 2B personnalisation** : Noms d'œuvres et personnages présents
- [ ] **BLOC 2B spécificité** : Traits non génériques, spécifiques à chaque personnage
- [ ] **BLOC 2B miroir** : Croise motifs + personnages + traits, cite explicitement œuvres

### 4.5 Robustesse

- [ ] **Fail-fast BLOC 2B** : Validation effectuée, retry contrôlé (max 1)
- [ ] **Gestion d'erreur** : Toutes erreurs catchées, messages utilisateur-friendly
- [ ] **Logs** : Tous les événements critiques logués (`[ORCHESTRATOR]`, `[2B_VALIDATION_FAIL]`, etc.)

### 4.6 Tests de validation

- [ ] **Test golden path** : Parcours complet sans erreur
- [ ] **Test reprise session** : Refresh en plein bloc → reprise correcte
- [ ] **Test erreur validation** : Simuler échec validation → message utilisateur-friendly
- [ ] **Test déclenchement matching** : Bouton fonctionne, matching déclenché

---

## 5️⃣ RÉFÉrence FEUILLE DE ROUTE INITIALE

### 📍 Emplacement recommandé

**Fichier** : `FEUILLE_ROUTE_AXIOM_INITIALE.md` (à créer à la racine du projet)

**Format** : Markdown (cohérent avec les autres documents d'audit)

**Structure suggérée** :
```markdown
# 🧭 FEUILLE DE ROUTE AXIOM — VERSION INITIALE

**Date** : [Date de création]
**Objectif** : [Objectif de la feuille de route]

---

## [Contenu de la feuille de route initiale]

...
```

### 🔗 Intégration dans ce document

Une fois la feuille de route initiale fournie, elle sera référencée dans ce document comme suit :

**Section à ajouter** :
```markdown
## 5.1 Référence feuille de route initiale

Voir : `FEUILLE_ROUTE_AXIOM_INITIALE.md`

**Points de conformité vérifiés** :
- [ ] [Point 1 de la feuille de route]
- [ ] [Point 2 de la feuille de route]
- ...

**Points manquants identifiés** :
- [ ] [Point manquant 1]
- [ ] [Point manquant 2]
- ...
```

---

## 📊 RÉSUMÉ EXÉCUTIF

### État global

- ✅ **Conforme** : 6 points (démarrage, BLOC 2A adaptation, BLOC 2B validation, transitions BLOC 3-10, bouton "Je commence", cohérence front ↔ backend)
- ⚠️ **Ambigu / Fragile** : 4 points (message utilisateur avant clic, gestion erreur fail-fast, réconciliation personnages, refresh BLOC 2B)
- ❌ **Non conforme** : 3 points critiques (transition BLOC 2B → BLOC 3, déclenchement matching, transition BLOC 1 → BLOC 2A)

### Temps de correction estimé

- **Priorité critique** : 35-55 minutes (3 correctifs)
- **Priorité élevée** : 35 minutes (2 correctifs)
- **Priorité moyenne** : 1h25-2h05 (2 correctifs)
- **TOTAL** : **2h35-3h35** (corrections uniquement, sans tests)

### Verdict

**⚠️ NON PRÊT POUR PRODUCTION** (3 points critiques bloquants)

**Recommandation** : Corriger les 3 points critiques (🔴) avant toute mise en production. Les points élevés (🟠) et moyens (🟡) peuvent être corrigés après mise en production si nécessaire, mais sont recommandés pour une meilleure UX.

---

**Fin du plan de route**
