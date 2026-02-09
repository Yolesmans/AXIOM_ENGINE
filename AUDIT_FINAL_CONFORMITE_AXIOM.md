# 🔍 AUDIT FINAL DE CONFORMITÉ — PARCOURS AXIOM

**Date** : 2025-01-27  
**Objectif** : Validation complète du parcours AXIOM avant mise en production  
**Type** : Audit technique exhaustif (aucune modification de code)

---

## 📋 MÉTHODOLOGIE

Cet audit explore volontairement les "coins sombres" du parcours :
- Transitions entre blocs
- États limites et cas limites
- Erreurs silencieuses potentielles
- Cohérence frontend ↔ backend
- Dépendances implicites fragiles

**Légende** :
- ✅ **Conforme** : Fonctionne comme prévu, robuste
- ⚠️ **Ambigu / à clarifier** : Fonctionne mais avec risques ou ambiguïtés
- ❌ **Non conforme** : Problème identifié, correction nécessaire

---

## 1️⃣ DÉMARRAGE DU PARCOURS — APRÈS PRÉAMBULE

### 1.1 Déclenchement BLOC 1 via bouton "Je commence mon profil"

**Référence** : `src/server.ts` (lignes 650-690), `ui-test/app.js` (lignes 109-111)

**Flux observé** :
1. Frontend détecte `step === 'PREAMBULE_DONE' || step === 'STEP_03_BLOC1'`
2. Frontend affiche bouton "Je commence mon profil"
3. Clic → `callAxiom(null, 'START_BLOC_1')`
4. Backend reçoit `event === 'START_BLOC_1'`
5. Backend délègue à `BlockOrchestrator.handleMessage(candidate, null, 'START_BLOC_1')`
6. Orchestrateur génère questions BLOC 1 (API)
7. Orchestrateur sert première question

**Vérifications** :
- ✅ `expectsAnswer` : Correctement renvoyé (`true` après génération questions)
- ✅ `step` : Correctement renvoyé (`BLOC_01`)
- ✅ `currentBlock` : Correctement mis à jour (`1`)
- ✅ `state` : Correctement mappé (`"collecting"`)

**État** : ✅ **CONFORME**

**Observation** : Le flux est clair et déterministe. L'orchestrateur gère correctement le démarrage.

---

### 1.2 États morts ou ambigus après préambule

**Référence** : `src/server.ts` (lignes 214-252), `src/engine/axiomExecutor.ts` (lignes 1427-1428)

**Scénarios testés** :

#### Scénario A : Refresh après préambule
- **Flux** : `/start` appelé après préambule
- **Comportement** : Dérivation depuis `conversationHistory` → `STEP_03_BLOC1`
- **Résultat** : Bouton affiché, pas de régression
- **État** : ✅ **CONFORME**

#### Scénario B : Double clic sur bouton "Je commence mon profil"
- **Flux** : `START_BLOC_1` envoyé deux fois rapidement
- **Comportement** : Orchestrateur vérifie `queue.questions.length === 0` avant génération
- **Résultat** : Si questions déjà générées → pas de double génération
- **État** : ✅ **CONFORME**

#### Scénario C : Message utilisateur reçu avant clic bouton
- **Flux** : Utilisateur envoie message texte alors que `step === 'STEP_03_BLOC1'`
- **Comportement** : `src/server.ts` ligne 696 vérifie `step === BLOC_01 || currentBlock === 1`
- **Résultat** : Si `step !== BLOC_01`, message traité par `executeWithAutoContinue` (ancien moteur)
- **Risque** : ⚠️ **AMBIGU** — Dépend de l'état exact de `step`

**Hypothèse de correctif** :
- Ajouter une garde explicite dans `POST /axiom` : Si `step === 'STEP_03_BLOC1'` ET `userMessage` présent ET `event !== 'START_BLOC_1'` → ignorer le message ou retourner erreur explicite.

**État global** : ⚠️ **AMBIGU** (scénario C non couvert)

---

## 2️⃣ ENCHAÎNEMENT DES BLOCS

### 2.1 Transition BLOC 1 → BLOC 2A

**Référence** : `src/services/blockOrchestrator.ts` (lignes 205-231)

**Flux observé** :
1. BLOC 1 : Toutes questions répondues (`cursorIndex >= questions.length`)
2. Orchestrateur génère miroir BLOC 1 (API)
3. Orchestrateur met à jour `step: BLOC_02`
4. Orchestrateur met à jour `currentBlock: 2` (implicite via `updateUIState` ?)
5. **PROBLÈME IDENTIFIÉ** : `currentBlock` n'est **PAS** mis à jour explicitement

**Vérification** :
```typescript
// src/services/blockOrchestrator.ts:220-224
candidateStore.updateUIState(currentCandidate.candidateId, {
  step: BLOC_02,
  lastQuestion: null,
  identityDone: true,
});
```

**Observation critique** : `candidateStore.updateUIState()` ne met **PAS** à jour `session.currentBlock`.

**Vérification dans `src/server.ts`** :
- Ligne 894 : `candidateStore.updateSession(candidate.candidateId, { state: "collecting", currentBlock: blocNumber });`
- Cette mise à jour se fait **uniquement** dans le mapping `/axiom`, **PAS** dans l'orchestrateur.

**Risque** : Si l'orchestrateur retourne `step: BLOC_02` mais que `currentBlock` reste à `1`, le routage suivant peut être incorrect.

**État** : ❌ **NON CONFORME**

**Hypothèse de correctif** :
- Dans `handleBlock1()` (orchestrateur), après génération miroir, appeler explicitement :
  ```typescript
  candidateStore.updateSession(candidateId, { state: "collecting", currentBlock: 2 });
  ```

---

### 2.2 Transition BLOC 2A → BLOC 2B

**Référence** : `src/services/blockOrchestrator.ts` (lignes 130-144, 487-505)

**Flux observé** :
1. BLOC 2A : Détection via `answeredCount >= 3` dans `handleMessage()`
2. Routage conditionnel : `handleBlock2B()` si `answeredCount >= 3`, sinon `handleBlock2A()`
3. Transition explicite : `handleBlock2A()` retourne message "BLOC 2A terminé. Transition vers BLOC 2B (non implémenté)." (ligne 500)
4. **PROBLÈME IDENTIFIÉ** : Ce message est obsolète (BLOC 2B est implémenté)

**Vérification** :
- Ligne 138-139 : `handleBlock2B()` est appelé si `answeredCount >= 3`
- Ligne 499-504 : Message obsolète dans `handleBlock2A()` (jamais atteint si `answeredCount >= 3`)

**État** : ✅ **CONFORME** (le message obsolète n'est jamais atteint, mais devrait être supprimé)

**Hypothèse de correctif** :
- Supprimer le message obsolète lignes 499-504 dans `handleBlock2A()`.

---

### 2.3 Transition BLOC 2B → BLOC 3

**Référence** : `src/services/blockOrchestrator.ts` (lignes 817-843)

**Flux observé** :
1. BLOC 2B : Toutes questions répondues (`cursorIndex >= questions.length`)
2. Orchestrateur génère miroir final BLOC 2B (API)
3. Orchestrateur met à jour `step: BLOC_02` (reste en BLOC_02)
4. **PROBLÈME IDENTIFIÉ** : Aucune transition vers BLOC 3

**Vérification** :
- Ligne 833 : `step: BLOC_02` (reste en BLOC_02)
- Aucune mise à jour de `currentBlock` vers `3`
- Aucune transition vers `BLOC_03`

**Risque** : Après BLOC 2B, le système reste bloqué en `BLOC_02`. Le routage suivant dans `POST /axiom` (ligne 762) vérifie `currentBlock === 2`, donc BLOC 2B sera rejoué indéfiniment.

**État** : ❌ **NON CONFORME**

**Hypothèse de correctif** :
- Dans `handleBlock2B()`, après génération miroir final :
  ```typescript
  candidateStore.updateSession(candidateId, { state: "collecting", currentBlock: 3 });
  candidateStore.updateUIState(candidateId, {
    step: BLOC_03,
    lastQuestion: null,
    identityDone: true,
  });
  ```

---

### 2.4 Transitions BLOC 3 → BLOC 10

**Référence** : `src/engine/axiomExecutor.ts` (lignes 1600-1700), `src/server.ts` (lignes 858-925)

**Flux observé** :
- BLOC 3 à 10 : Gérés par `executeWithAutoContinue()` (ancien moteur)
- Pas d'orchestrateur pour ces blocs
- Transitions automatiques via FSM

**Vérification** :
- Ligne 858 `src/server.ts` : Si `currentBlock !== 1 && currentBlock !== 2`, appel à `executeWithAutoContinue()`
- Ligne 1708 `axiomExecutor.ts` : Si `nextState === STEP_99_MATCH_READY`, transition automatique

**État** : ✅ **CONFORME** (pour les blocs 3-10, le système existant fonctionne)

**Observation** : Les blocs 3-10 ne sont pas encore migrés vers l'orchestrateur, mais le système actuel fonctionne.

---

### 2.5 Aucun bloc sauté, aucun double déclenchement

**Vérification** :
- ✅ BLOC 1 : Orchestrateur gère, pas de saut
- ✅ BLOC 2A : Orchestrateur gère, pas de saut
- ✅ BLOC 2B : Orchestrateur gère, pas de saut
- ⚠️ **PROBLÈME** : Transition BLOC 2B → BLOC 3 non implémentée (voir 2.3)
- ✅ BLOC 3-10 : FSM gère, pas de saut

**Double déclenchement** :
- ✅ BLOC 1 : Garde `queue.questions.length === 0` empêche double génération
- ✅ BLOC 2A : Génération séquentielle (1 question à la fois), pas de double
- ✅ BLOC 2B : Garde `queue.questions.length === 0` empêche double génération

**État global** : ⚠️ **AMBIGU** (transition BLOC 2B → BLOC 3 manquante)

---

## 3️⃣ BLOC 2A / 2B (ZONE CRITIQUE)

### 3.1 BLOC 2A — Adaptation question par question

**Référence** : `src/services/blockOrchestrator.ts` (lignes 368-521)

**Flux observé** :
1. Question 2A.1 (Médium) : Générée indépendamment
2. Question 2A.2 (Préférences) : Générée avec dépendance à la réponse 2A.1 (`mediumAnswer`)
3. Question 2A.3 (Œuvre noyau) : Générée avec dépendance aux réponses 2A.1 et 2A.2 (`answers`)

**Vérification** :
- ✅ Ligne 430 : `generateQuestion2A2(candidate, mediumAnswer)` — dépendance correcte
- ✅ Ligne 465 : `generateQuestion2A3(candidate, updatedAnswers)` — dépendance correcte
- ✅ Les réponses sont stockées dans `AnswerMap` avant génération question suivante

**État** : ✅ **CONFORME**

---

### 3.2 BLOC 2B — Projectif, non générique

**Référence** : `src/services/blockOrchestrator.ts` (lignes 717-852), `src/services/validators.ts`

**Vérification** :

#### 3.2.1 Génération questions BLOC 2B
- ✅ Injection forcée BLOC 2A : `buildConversationHistoryForBlock2B()` garantit présence des œuvres
- ✅ Prompt système : Contraintes de spécificité présentes (lignes 894-903)
- ✅ Validation sémantique : `validateMotifsSpecificity()` et `validateTraitsSpecificity()` appliquées

#### 3.2.2 Fail-fast qualitatif
- ✅ Validation AVANT serving : `validateAndRetryQuestions2B()` bloque si validation échoue
- ✅ Retry contrôlé : Max 1 retry avec prompt renforcé
- ⚠️ **PROBLÈME** : Gestion d'erreur API (voir 3.2.3)

**État** : ✅ **CONFORME** (validation fonctionne)

---

### 3.2.3 Gestion d'erreur fail-fast BLOC 2B

**Référence** : `src/services/blockOrchestrator.ts` (lignes 1096-1103), `src/server.ts` (lignes 785-786)

**Flux d'erreur** :
1. `validateAndRetryQuestions2B()` throw `Error` si validation échoue après retry
2. Erreur propagée : `handleBlock2B()` → `handleMessage()` → `POST /axiom`
3. `POST /axiom` ligne 786 : Pas de try/catch autour de `orchestrator.handleMessage()`
4. Express catch l'erreur non gérée
5. **Résultat** : Réponse HTTP 500 brute

**Vérification** :
- Ligne 1102 : `throw new Error(...)` dans `validateAndRetryQuestions2B()`
- Ligne 786 : `await orchestrator.handleMessage(...)` sans try/catch
- Ligne 926 : Try/catch global dans `POST /axiom`, mais retourne réponse générique

**Risque** : Si validation BLOC 2B échoue après retry, l'utilisateur reçoit une 500 brute, pas de message utilisateur-friendly.

**État** : ⚠️ **AMBIGU** (fail-fast fonctionne, mais gestion API non optimale)

**Hypothèse de correctif** :
- Ajouter try/catch spécifique autour de `orchestrator.handleMessage()` dans `POST /axiom` :
  ```typescript
  try {
    const result = await orchestrator.handleMessage(candidate, userMessageText, null);
    // ...
  } catch (error) {
    if (error.message.includes('BLOC 2B validation failed')) {
      return res.status(200).json({
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: "collecting",
        response: "Une erreur technique est survenue lors de la génération des questions. Veuillez réessayer.",
        step: BLOC_02,
        expectsAnswer: false,
        autoContinue: false,
      });
    }
    throw error; // Re-throw autres erreurs
  }
  ```

---

### 3.3 Cohérence œuvres / personnages / traits

**Référence** : `src/services/blockOrchestrator.ts` (lignes 857-866), `src/prompts/metier/AXIOM_PROFIL.txt` (lignes 594-600)

**Vérification** :

#### 3.3.1 Parsing œuvres
- ✅ `parseWorks()` : Parse depuis `preferencesAnswer` (virgule ou saut de ligne)
- ⚠️ **RISQUE** : Parsing naïf, peut échouer si format utilisateur non standard
- ✅ Garde : `works.length < 3` → throw Error (ligne 762-765)

#### 3.3.2 Réconciliation personnages
- ⚠️ **AMBIGU** : Aucune logique explicite de réconciliation dans le code
- ⚠️ **AMBIGU** : Déléguée à l'IA via prompt métier (non réinjectée dans prompt système BLOC 2B)
- ⚠️ **RISQUE** : Si l'IA ne suit pas le prompt, descriptions peuvent rester au lieu de noms canoniques

**État** : ⚠️ **AMBIGU** (réconciliation non garantie techniquement)

**Hypothèse de correctif** :
- Ajouter validation post-génération questions BLOC 2B : Vérifier que les noms de personnages dans les questions traits sont des noms canoniques (pas de descriptions comme "le chef", "son associée").
- Si validation échoue → retry avec prompt renforcé mentionnant explicitement la réconciliation.

---

### 3.4 Compression sémantique indésirable

**Référence** : `src/services/validators.ts` (lignes 62-169)

**Vérification** :
- ✅ `validateMotifsSpecificity()` : Détecte similarité > 70% entre propositions motifs
- ✅ `validateTraitsSpecificity()` : Détecte similarité > 80% entre propositions traits
- ✅ Fail-fast : Bloque serving si validation échoue après retry

**État** : ✅ **CONFORME** (les verrous qualitatifs sont effectifs)

---

## 4️⃣ DÉCLENCHEMENT DU MATCHING

### 4.1 Entrée "GO" (bouton "Je génère mon matching")

**Référence** : `ui-test/app.js` (lignes 173-205), `src/engine/axiomExecutor.ts` (lignes 1741-1770)

**Flux observé** :
1. Frontend détecte `step === 'STEP_99_MATCH_READY' && expectsAnswer === false`
2. Frontend affiche bouton "Je génère mon matching"
3. Clic → `callAxiom(null)` (pas d'event explicite)
4. Backend reçoit `userMessage: null, event: null`
5. `executeAxiom()` ligne 1743 : Si `currentState === STEP_99_MATCH_READY` ET `!userMessage && !event`, retourne message d'attente
6. **PROBLÈME IDENTIFIÉ** : Le bouton envoie `callAxiom(null)`, donc `userMessage: null`, donc la condition ligne 1743 est vraie → message d'attente au lieu de déclencher matching

**Vérification** :
- Ligne 200 `ui-test/app.js` : `await callAxiom(null)` (pas d'event)
- Ligne 1743 `axiomExecutor.ts` : `if (!userMessage && !event) { return { response: 'Profil terminé...' } }`
- Ligne 1754 : `currentState = STEP_99_MATCHING` uniquement si `userMessage || event` présent

**Risque** : Le bouton ne déclenche **PAS** le matching, il retourne un message d'attente.

**État** : ❌ **NON CONFORME**

**Hypothèse de correctif** :
- Option A : Frontend envoie un event explicite :
  ```javascript
  await callAxiom(null, 'START_MATCHING');
  ```
- Option B : Backend détecte `step === STEP_99_MATCH_READY` ET `userMessage === null` ET `event === null` → déclencher matching automatiquement (modifier ligne 1743).

---

### 4.2 Moment de proposition du bouton

**Référence** : `src/engine/axiomExecutor.ts` (lignes 1708-1727), `ui-test/app.js` (lignes 112-114)

**Flux observé** :
1. BLOC 10 terminé → `nextState === STEP_99_MATCH_READY`
2. `executeAxiom()` retourne `step: STEP_99_MATCH_READY, expectsAnswer: false`
3. Frontend détecte `step === 'STEP_99_MATCH_READY' && expectsAnswer === false`
4. Frontend affiche bouton

**Vérification** :
- ✅ Ligne 1709 : Transition automatique vers `STEP_99_MATCH_READY` après BLOC 10
- ✅ Ligne 1724 : `expectsAnswer: false` (correct)
- ✅ Frontend : Détection correcte (ligne 112)

**État** : ✅ **CONFORME** (le bouton apparaît au bon moment)

---

### 4.3 Aucune ambiguïté UX ou logique

**Vérification** :
- ⚠️ **PROBLÈME** : Le bouton ne déclenche pas réellement le matching (voir 4.1)
- ✅ Aucun autre bouton n'apparaît à ce moment
- ✅ Le champ de saisie est masqué (ligne 305 `ui-test/app.js`)

**État global** : ❌ **NON CONFORME** (bouton ne fonctionne pas)

---

## 5️⃣ UI / BOUTONS / ACTIONS UTILISATEUR

### 5.1 Bouton "Je commence mon profil"

**Référence** : `ui-test/app.js` (lignes 109-111, 139-171)

**Vérification** :
- ✅ Apparaît au bon moment : `step === 'PREAMBULE_DONE' || step === 'STEP_03_BLOC1'`
- ✅ Déclenche correctement : `callAxiom(null, 'START_BLOC_1')`
- ✅ Champ de saisie masqué (ligne 298)

**État** : ✅ **CONFORME**

---

### 5.2 Bouton "Je génère mon matching"

**Référence** : `ui-test/app.js` (lignes 173-205)

**Vérification** :
- ✅ Apparaît au bon moment : `step === 'STEP_99_MATCH_READY' && expectsAnswer === false`
- ❌ **PROBLÈME** : Ne déclenche pas réellement le matching (voir 4.1)
- ✅ Champ de saisie masqué (ligne 305)

**État** : ❌ **NON CONFORME** (bouton ne fonctionne pas)

---

### 5.3 États bloquants ou sans issue

**Scénarios testés** :

#### Scénario A : Utilisateur envoie message alors que bouton attendu
- **Flux** : `step === 'STEP_03_BLOC1'`, utilisateur envoie message texte
- **Comportement** : Message traité par `executeWithAutoContinue()` (ancien moteur)
- **Risque** : ⚠️ **AMBIGU** — Dépend de l'état exact (voir 1.2 Scénario C)

#### Scénario B : Refresh pendant BLOC 2B
- **Flux** : Utilisateur refresh pendant questions BLOC 2B
- **Comportement** : `/start` dérive état depuis `conversationHistory` → `BLOC_02`
- **Risque** : ⚠️ **AMBIGU** — `QuestionQueue` peut être perdue si store non persistant

#### Scénario C : Erreur validation BLOC 2B après retry
- **Flux** : Validation échoue après retry → Error throw
- **Comportement** : 500 brute (voir 3.2.3)
- **Risque** : ❌ **NON CONFORME** — Utilisateur bloqué sans message clair

**État global** : ⚠️ **AMBIGU** (plusieurs scénarios à risque)

---

### 5.4 Cohérence front ↔ backend sur les états

**Référence** : `src/server.ts` (lignes 877-901), `ui-test/app.js` (lignes 109-125)

**Vérification** :

#### Mapping `/start` et `/axiom`
- ✅ `/start` : Mapping cohérent (lignes 258-310)
- ✅ `/axiom` : Mapping cohérent (lignes 877-901)
- ✅ Frontend : Détection basée sur `step` (cohérent)

#### États attendus par frontend
- ✅ `PREAMBULE_DONE` / `STEP_03_BLOC1` → Bouton "Je commence"
- ✅ `STEP_99_MATCH_READY` → Bouton "Je génère mon matching"
- ✅ `expectsAnswer: true` → Champ de saisie affiché
- ✅ `expectsAnswer: false` → Champ de saisie masqué

**État** : ✅ **CONFORME** (cohérence front ↔ backend respectée)

---

## 6️⃣ SYNTHÈSE FINALE

### 6.1 Points conformes ✅

1. **Démarrage BLOC 1** : Fonctionne correctement
2. **BLOC 2A adaptation** : Dépendances correctes entre questions
3. **BLOC 2B validation** : Fail-fast qualitatif effectif
4. **Transitions BLOC 3-10** : FSM fonctionne
5. **Bouton "Je commence"** : Fonctionne correctement
6. **Cohérence front ↔ backend** : Mapping cohérent

### 6.2 Points ambigus ⚠️

1. **Message utilisateur avant clic bouton BLOC 1** : Dépend de l'état exact
2. **Gestion d'erreur fail-fast BLOC 2B** : 500 brute au lieu de message utilisateur-friendly
3. **Réconciliation personnages BLOC 2B** : Déléguée à l'IA, non garantie techniquement
4. **Refresh pendant BLOC 2B** : `QuestionQueue` peut être perdue si store non persistant

### 6.3 Points non conformes ❌

1. **Transition BLOC 1 → BLOC 2A** : `currentBlock` non mis à jour dans orchestrateur
2. **Transition BLOC 2B → BLOC 3** : Non implémentée, système reste bloqué en `BLOC_02`
3. **Déclenchement matching** : Bouton ne fonctionne pas (condition ligne 1743 bloque)

---

## 7️⃣ RECOMMANDATIONS PRIORITAIRES

### 🔴 PRIORITÉ CRITIQUE (Bloquant production)

1. **Corriger transition BLOC 2B → BLOC 3**
   - Ajouter mise à jour `currentBlock: 3` et `step: BLOC_03` après miroir final BLOC 2B
   - **Impact** : Sans cette correction, le parcours est bloqué après BLOC 2B

2. **Corriger déclenchement matching**
   - Option A : Frontend envoie `event: 'START_MATCHING'`
   - Option B : Backend détecte `STEP_99_MATCH_READY` + `userMessage === null` → déclencher automatiquement
   - **Impact** : Sans cette correction, le matching ne peut pas être déclenché

### 🟠 PRIORITÉ ÉLEVÉE (Risque utilisateur)

3. **Corriger transition BLOC 1 → BLOC 2A**
   - Ajouter `candidateStore.updateSession(candidateId, { currentBlock: 2 })` après miroir BLOC 1
   - **Impact** : Risque de routage incorrect si `currentBlock` reste à `1`

4. **Améliorer gestion d'erreur fail-fast BLOC 2B**
   - Ajouter try/catch spécifique dans `POST /axiom` avec message utilisateur-friendly
   - **Impact** : Amélioration UX en cas d'échec validation

### 🟡 PRIORITÉ MOYENNE (Amélioration)

5. **Ajouter garde message utilisateur avant clic bouton BLOC 1**
   - Ignorer ou retourner erreur explicite si message reçu alors que `step === 'STEP_03_BLOC1'`

6. **Améliorer réconciliation personnages BLOC 2B**
   - Ajouter validation post-génération + retry avec prompt renforcé

7. **Supprimer message obsolète BLOC 2A**
   - Lignes 499-504 dans `handleBlock2A()` (jamais atteint, mais confusion)

---

## 8️⃣ CONCLUSION

**Verdict global** : ⚠️ **NON PRÊT POUR PRODUCTION**

**Justification** :
- 3 points **non conformes critiques** identifiés (transition BLOC 2B → BLOC 3, déclenchement matching, transition BLOC 1 → BLOC 2A)
- Plusieurs points **ambigus** avec risques utilisateur
- Points **conformes** majoritaires, mais corrections critiques nécessaires avant production

**Recommandation** : Corriger les 3 points critiques (priorité 🔴) avant toute mise en production.

---

**Fin de l'audit**
