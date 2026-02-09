# 🚀 PLAN D'EXÉCUTION — CORRECTIFS AXIOM

**Date** : 2025-01-27  
**Objectif** : Rendre le parcours AXIOM 100% fonctionnel, robuste et cohérent  
**Type** : Plan d'exécution détaillé (validation avant implémentation)

---

## 1️⃣ CONFIRMATION DE COMPRÉHENSION

### ✅ Plan de route validé

**Correctifs identifiés** : 7 correctifs (C1 à C7)

**Priorités** :
- 🔴 **CRITIQUE** : C1, C2, C3 (bloquants production)
- 🟠 **ÉLEVÉE** : C4, C5 (risque utilisateur)
- 🟡 **MOYENNE** : C6, C7 (amélioration)

**Tests obligatoires** : Validés pour chaque correctif

**Périmètre** : Strictement limité aux correctifs identifiés, aucun refactor, aucune optimisation

---

## 2️⃣ PLAN D'EXÉCUTION PRÉCIS

### 2.1 Ordre exact des correctifs

**Ordre strict** (selon priorité + dépendances) :

1. **C1** — Transition BLOC 2B → BLOC 3 (CRITIQUE)
2. **C2** — Déclenchement matching (CRITIQUE)
3. **C3** — Transition BLOC 1 → BLOC 2A (CRITIQUE)
4. **C4** — Gestion d'erreur fail-fast BLOC 2B (ÉLEVÉ)
5. **C5** — Garde message utilisateur avant clic bouton BLOC 1 (ÉLEVÉ)
6. **C6** — Améliorer réconciliation personnages BLOC 2B (MOYEN)
7. **C7** — Supprimer message obsolète BLOC 2A (MOYEN)

**Justification de l'ordre** :
- C1, C2, C3 : Bloquants, corrigés en premier
- C4, C5 : Risques utilisateur, corrigés après les bloquants
- C6, C7 : Améliorations, corrigées en dernier

---

### 2.2 Nombre de commits prévus

**7 commits** (1 par correctif) + **1 commit final** (tests de validation globale)

**Total** : **8 commits**

**Stratégie** : 1 correctif = 1 commit atomique, traçable, rollback possible

---

### 2.3 Détail par commit

#### 🔴 COMMIT 1 — C1 : Transition BLOC 2B → BLOC 3

**Message** : `fix(critical): add transition from BLOC 2B to BLOC 3 after final mirror`

**Ce qui est corrigé** :
- Ajout mise à jour `currentBlock: 3` après miroir final BLOC 2B
- Changement `step: BLOC_03` au lieu de `BLOC_02`
- Transition explicite vers BLOC 3

**Fichiers touchés** :
- `src/services/blockOrchestrator.ts` (lignes 817-843)

**Modifications exactes** :
```typescript
// Ligne 832-836 : Modifier
candidateStore.updateSession(candidateId, { 
  state: "collecting", 
  currentBlock: 3  // ← Ajouter
});
candidateStore.updateUIState(candidateId, {
  step: BLOC_03, // ← Changer BLOC_02 → BLOC_03
  lastQuestion: null,
  identityDone: true,
});

// Ligne 840 : Modifier
return {
  response: mirror,
  step: BLOC_03, // ← Changer BLOC_02 → BLOC_03
  expectsAnswer: false,
  autoContinue: false,
};
```

**Tests à effectuer** :
1. ✅ Compléter BLOC 2B (toutes questions + miroir)
2. ✅ Vérifier : `currentBlock === 3` et `step === BLOC_03` après miroir
3. ✅ Envoyer message utilisateur
4. ✅ Vérifier : Routage vers BLOC 3 (pas rejouer BLOC 2B)

**Rollback possible** : Oui (git revert)

**Risque** : Faible (transition explicite, pas de dépendance)

---

#### 🔴 COMMIT 2 — C2 : Déclenchement matching

**Message** : `fix(critical): fix matching trigger by adding START_MATCHING event`

**Ce qui est corrigé** :
- Ajout event `START_MATCHING` dans frontend
- Backend accepte event pour déclencher matching

**Fichiers touchés** :
- `ui-test/app.js` (ligne 200)
- Potentiellement `src/engine/axiomExecutor.ts` (ligne 1743) si Option B choisie

**Modifications exactes** :
```javascript
// ui-test/app.js ligne 200 : Modifier
matchingButton.addEventListener('click', async () => {
  matchingButton.disabled = true;
  await callAxiom(null, 'START_MATCHING'); // ← Ajouter event
});
```

**Option B (si nécessaire)** :
```typescript
// src/engine/axiomExecutor.ts ligne 1743 : Modifier
if (currentState === STEP_99_MATCH_READY) {
  // Si event === 'START_MATCHING' → déclencher matching
  if (event === 'START_MATCHING' || (!userMessage && !event && firstTime)) {
    currentState = STEP_99_MATCHING;
    // ... suite
  }
  // ...
}
```

**Tests à effectuer** :
1. ✅ Compléter BLOC 10
2. ✅ Vérifier : Bouton "Je génère mon matching" apparaît
3. ✅ Cliquer sur le bouton
4. ✅ Vérifier : Matching déclenché (pas message d'attente)

**Rollback possible** : Oui (git revert)

**Risque** : Faible (ajout event explicite)

---

#### 🔴 COMMIT 3 — C3 : Transition BLOC 1 → BLOC 2A

**Message** : `fix(critical): add currentBlock update in BLOC 1 to BLOC 2A transition`

**Ce qui est corrigé** :
- Ajout mise à jour `currentBlock: 2` après miroir BLOC 1
- Cohérence `step` et `currentBlock` garantie

**Fichiers touchés** :
- `src/services/blockOrchestrator.ts` (lignes 205-231)

**Modifications exactes** :
```typescript
// Ligne 219-224 : Modifier
candidateStore.updateSession(currentCandidate.candidateId, { 
  state: "collecting", 
  currentBlock: 2  // ← Ajouter
});
candidateStore.updateUIState(currentCandidate.candidateId, {
  step: BLOC_02,
  lastQuestion: null,
  identityDone: true,
});
```

**Tests à effectuer** :
1. ✅ Compléter BLOC 1 (toutes questions + miroir)
2. ✅ Vérifier : `currentBlock === 2` et `step === BLOC_02` après miroir
3. ✅ Envoyer message utilisateur
4. ✅ Vérifier : Routage vers BLOC 2A (pas rejouer BLOC 1)

**Rollback possible** : Oui (git revert)

**Risque** : Faible (transition explicite)

---

#### 🟠 COMMIT 4 — C4 : Gestion d'erreur fail-fast BLOC 2B

**Message** : `fix(error-handling): add user-friendly error message for BLOC 2B validation failure`

**Ce qui est corrigé** :
- Ajout try/catch spécifique pour erreur validation BLOC 2B
- Message utilisateur-friendly au lieu de 500 brute

**Fichiers touchés** :
- `src/server.ts` (lignes 785-835)

**Modifications exactes** :
```typescript
// Ligne 785-786 : Modifier
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

**Tests à effectuer** :
1. ✅ Simuler échec validation BLOC 2B après retry (mock)
2. ✅ Vérifier : Message utilisateur-friendly renvoyé (pas 500)
3. ✅ Vérifier : Log `[2B_VALIDATION_FAIL] fatal=true` présent

**Rollback possible** : Oui (git revert)

**Risque** : Faible (ajout gestion d'erreur, pas de changement logique)

---

#### 🟠 COMMIT 5 — C5 : Garde message utilisateur avant clic bouton BLOC 1

**Message** : `fix(ux): add guard for user message before BLOC 1 start button click`

**Ce qui est corrigé** :
- Ajout garde explicite si message utilisateur reçu alors que `step === STEP_03_BLOC1`
- Message d'erreur explicite au lieu de traitement par ancien moteur

**Fichiers touchés** :
- `src/server.ts` (lignes 692-695)

**Modifications exactes** :
```typescript
// Ligne 692 : Ajouter après
const userMessageText = userMessage || null;

// Garde : Si step === STEP_03_BLOC1 ET userMessage présent ET event !== START_BLOC_1
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
```

**Tests à effectuer** :
1. ✅ Atteindre `step === STEP_03_BLOC1` (bouton affiché)
2. ✅ Envoyer message texte (sans cliquer bouton)
3. ✅ Vérifier : Message d'erreur explicite renvoyé (pas traitement par ancien moteur)

**Rollback possible** : Oui (git revert)

**Risque** : Faible (ajout garde, pas de changement logique)

---

#### 🟡 COMMIT 6 — C6 : Améliorer réconciliation personnages BLOC 2B

**Message** : `feat(quality): add character name reconciliation validation for BLOC 2B`

**Ce qui est corrigé** :
- Ajout validation post-génération pour détecter descriptions au lieu de noms canoniques
- Retry avec prompt renforcé si validation échoue

**Fichiers touchés** :
- `src/services/blockOrchestrator.ts` (méthode `generateQuestions2B`)

**Modifications exactes** :
```typescript
// Ajouter méthode privée
private validateCharacterNames(questions: string[]): ValidationResult {
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

// Dans generateQuestions2B(), après génération (ligne ~986)
const validation = this.validateCharacterNames(questions);
if (!validation.valid) {
  console.warn('[ORCHESTRATOR] Character names validation failed, retry with reinforced prompt');
  // Retry avec prompt renforcé mentionnant explicitement réconciliation
  questions = await this.generateQuestions2BWithReconciliation(candidate, works, coreWork);
}
```

**Tests à effectuer** :
1. ✅ Générer questions BLOC 2B
2. ✅ Vérifier : Noms de personnages sont canoniques (pas descriptions)
3. ✅ Si descriptions détectées → retry avec prompt renforcé

**Rollback possible** : Oui (git revert)

**Risque** : Faible (ajout validation, pas de changement logique)

---

#### 🟡 COMMIT 7 — C7 : Supprimer message obsolète BLOC 2A

**Message** : `chore(cleanup): remove obsolete BLOC 2A transition message`

**Ce qui est corrigé** :
- Suppression code obsolète jamais atteint dans `handleBlock2A()`

**Fichiers touchés** :
- `src/services/blockOrchestrator.ts` (lignes 487-505)

**Modifications exactes** :
```typescript
// Supprimer complètement le bloc lignes 487-505 :
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

**Tests à effectuer** :
1. ✅ Vérifier : Code supprimé
2. ✅ Vérifier : Transition BLOC 2A → BLOC 2B fonctionne toujours (via `handleMessage()`)

**Rollback possible** : Oui (git revert)

**Risque** : Aucun (code jamais atteint)

---

#### ✅ COMMIT 8 — Tests de validation globale

**Message** : `test(validation): add end-to-end validation tests for all corrections`

**Ce qui est testé** :
- Parcours complet fonctionnel
- Tous les correctifs validés
- Cas limites couverts

**Fichiers touchés** :
- `tests/e2e/validation_corrections.test.ts` (nouveau)

**Tests à effectuer** :
1. ✅ Test golden path complet (BLOC 1 → 2A → 2B → 3 → ... → 10 → Matching)
2. ✅ Test reprise session (refresh en plein bloc)
3. ✅ Test erreur validation BLOC 2B (message utilisateur-friendly)
4. ✅ Test déclenchement matching (bouton fonctionne)
5. ✅ Test garde message utilisateur avant clic bouton

**Rollback possible** : Oui (git revert)

**Risque** : Aucun (tests uniquement)

---

## 3️⃣ CONFIRMATION SPRINT CONTINU

### ✅ TOUT peut être fait dans un seul sprint continu

**Justification** :

1. **Temps total estimé** : 2h35-3h35 (corrections) + 1h (tests) = **3h35-4h35**
   - C1 : 15 min
   - C2 : 10-30 min
   - C3 : 10 min
   - C4 : 20 min
   - C5 : 15 min
   - C6 : 1-2h
   - C7 : 5 min
   - Tests : 1h

2. **Complexité** : Faible à moyenne
   - Pas de refactor global
   - Modifications ciblées et isolées
   - Pas de dépendances entre correctifs (sauf ordre logique)

3. **Risques** : Faibles
   - Chaque correctif est atomique
   - Rollback possible par commit
   - Tests associés à chaque correctif

4. **Pas de mise en prod intermédiaire nécessaire** :
   - Les correctifs critiques (C1, C2, C3) doivent être déployés ensemble
   - Les correctifs élevés (C4, C5) améliorent l'UX mais ne bloquent pas
   - Les correctifs moyens (C6, C7) sont des améliorations optionnelles

**Recommandation** : **SPRINT CONTINU RECOMMANDÉ**

**Avantages** :
- Cohérence garantie (tous les correctifs déployés ensemble)
- Pas de risque de désynchronisation entre correctifs
- Tests de validation globale possibles en fin de sprint

**Contraintes** :
- Nécessite validation complète avant déploiement
- Pas de rollback partiel possible (sauf par commit individuel)

---

## 4️⃣ CHECKLIST DE VALIDATION AVANT GO

### ✅ Pré-requis

- [ ] Plan de route validé et gelé
- [ ] Plan d'exécution validé
- [ ] Environnement de test disponible
- [ ] Accès aux fichiers à modifier confirmé
- [ ] Tests de validation définis

### ✅ Prêt pour implémentation

- [ ] Ordre des correctifs validé
- [ ] Commits prévus validés
- [ ] Tests associés validés
- [ ] Rollback possible confirmé
- [ ] Sprint continu validé

---

## 5️⃣ RÉSUMÉ EXÉCUTIF

### Plan d'exécution

- **7 correctifs** (C1 à C7)
- **8 commits** (7 correctifs + 1 tests)
- **Temps estimé** : 3h35-4h35
- **Sprint continu** : ✅ Recommandé

### Ordre d'exécution

1. C1 (BLOC 2B → BLOC 3) — 15 min
2. C2 (Déclenchement matching) — 10-30 min
3. C3 (BLOC 1 → BLOC 2A) — 10 min
4. C4 (Gestion erreur fail-fast) — 20 min
5. C5 (Garde message utilisateur) — 15 min
6. C6 (Réconciliation personnages) — 1-2h
7. C7 (Supprimer message obsolète) — 5 min
8. Tests validation globale — 1h

### Validation

**✅ PRÊT POUR IMPLÉMENTATION**

Tous les pré-requis sont remplis. Le plan d'exécution est détaillé, traçable et rollback possible.

---

**Fin du plan d'exécution**
