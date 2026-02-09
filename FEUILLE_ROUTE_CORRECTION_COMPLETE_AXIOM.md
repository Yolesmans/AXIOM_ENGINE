# 🗺️ FEUILLE DE ROUTE DE CORRECTION COMPLÈTE — AXIOM

**Date** : 2025-01-27  
**Objectif** : Rendre le parcours AXIOM 100% cohérent, fluide et testable  
**Type** : Audit exhaustif + Plan de correction priorisé  
**Statut** : Code gelé — Analyse uniquement

---

## 📋 TABLE DES MATIÈRES

1. [Audit global BACK + FRONT](#1-audit-global-back--front)
2. [Identification précise des problèmes](#2-identification-précise-des-problèmes)
3. [Feuille de route de correction](#3-feuille-de-route-de-correction)
4. [Conditions de validation](#4-conditions-de-validation)

---

## 1️⃣ AUDIT GLOBAL BACK + FRONT

### 1.1 Architecture actuelle

#### Backend — Orchestration

**Fichiers clés** :
- `src/server.ts` : Routes `/start` (GET) et `/axiom` (POST)
- `src/engine/axiomExecutor.ts` : Moteur FSM principal (`executeAxiom`, `executeWithAutoContinue`)
- `src/services/blockOrchestrator.ts` : Orchestrateur séquentiel pour BLOC 1, 2A, 2B
- `src/store/sessionStore.ts` : Gestion des candidats et état

**États FSM identifiés** :
```
STEP_01_IDENTITY → STEP_02_TONE → STEP_03_PREAMBULE → STEP_03_BLOC1
  ↓
BLOC_01 → BLOC_02 → BLOC_03 → ... → BLOC_10
  ↓
STEP_99_MATCH_READY → STEP_99_MATCHING → DONE_MATCHING
```

**Events gérés** :
- `START_BLOC_1` : Déclenchement BLOC 1 (bouton "Je commence mon profil")
- `START_MATCHING` : Déclenchement matching (bouton "Je génère mon matching")

**Flags utilisés** :
- `expectsAnswer: boolean` : Indique si une réponse utilisateur est attendue
- `autoContinue: boolean` : Indique si le backend continue automatiquement (non interactif)
- `currentBlock: number` : Numéro du bloc en cours (1-10)
- `step: string` : État FSM actuel

---

#### Frontend — Interface utilisateur

**Fichier clé** : `ui-test/app.js`

**États visibles** :
- Formulaire identité (`state === "identity"`)
- Question tone (`state === "tone_choice"`)
- Préambule (`state === "preambule"`)
- Bouton "Je commence mon profil" (`step === 'PREAMBULE_DONE' || step === 'STEP_03_BLOC1'`)
- Questions blocs (`expectsAnswer === true`)
- Bouton "Je génère mon matching" (`step === 'STEP_99_MATCH_READY' && expectsAnswer === false`)

**Actions utilisateur** :
- Saisie identité → Envoi message avec format "Prénom: X, Nom: Y, Email: Z"
- Choix tone → Envoi message "tutoiement" ou "vouvoiement"
- Clic bouton BLOC 1 → `callAxiom(null, 'START_BLOC_1')`
- Réponses questions → Envoi message texte
- Clic bouton matching → `callAxiom(null, 'START_MATCHING')`

---

### 1.2 Flux utilisateur réel (bout en bout)

#### Phase 1 : Initialisation
1. **Chargement page** → Appel `/start` avec `x-session-id` (localStorage)
2. **Backend** : Dérive état depuis `conversationHistory` ou crée nouveau candidat
3. **Frontend** : Affiche formulaire identité OU message selon état

#### Phase 2 : Identité
1. **Utilisateur** : Saisit prénom, nom, email
2. **Frontend** : Envoie message formaté "Prénom: X, Nom: Y, Email: Z"
3. **Backend** : Valide identité → Transition `STEP_01_IDENTITY` → `STEP_02_TONE`
4. **Frontend** : Affiche question tone

#### Phase 3 : Tone
1. **Utilisateur** : Répond "tutoiement" ou "vouvoiement"
2. **Backend** : Détecte tone → Transition `STEP_02_TONE` → `STEP_03_PREAMBULE` → Auto-enchaînement → Génération préambule → `STEP_03_BLOC1`
3. **Frontend** : Affiche préambule + bouton "Je commence mon profil"

#### Phase 4 : BLOC 1
1. **Utilisateur** : Clique bouton "Je commence mon profil"
2. **Backend** : Reçoit `event: START_BLOC_1` → Délègue à orchestrateur → Génère toutes questions BLOC 1 (API) → Sert première question
3. **Frontend** : Affiche première question, active champ de saisie
4. **Utilisateur** : Répond → Backend stocke réponse → Sert question suivante (pas d'API)
5. **Répétition** : Questions 2, 3, ... jusqu'à fin
6. **Fin BLOC 1** : Backend génère miroir (API) → Transition `BLOC_01` → `BLOC_02`, `currentBlock: 2`

#### Phase 5 : BLOC 2A
1. **Backend** : Après miroir BLOC 1, retourne `step: BLOC_02`, `expectsAnswer: false`
2. **⚠️ PROBLÈME** : Frontend reçoit `expectsAnswer: false` → Masque champ → Utilisateur ne sait pas qu'il peut continuer
3. **Utilisateur** : Envoie message (si champ réaffiché) → Backend détecte `currentBlock === 2` → Routage vers orchestrateur BLOC 2A
4. **BLOC 2A** : 3 questions séquentielles (médium, préférences adaptées, œuvre noyau) → 3 appels API

#### Phase 6 : BLOC 2B
1. **Backend** : Après 3 réponses BLOC 2A, détecte `answeredCount >= 3` → Routage vers `handleBlock2B()`
2. **BLOC 2B** : Génère toutes questions projectives (API) → Sert une par une → Stocke réponses
3. **Fin BLOC 2B** : Génère miroir final (API) → Transition `BLOC_02` → `BLOC_03`, `currentBlock: 3`
4. **⚠️ MÊME PROBLÈME** : Frontend reçoit `expectsAnswer: false` → Masque champ

#### Phase 7 : BLOCS 3-10
1. **Backend** : Géré par `executeAxiom()` (ancien moteur, pas orchestrateur)
2. **Flux** : Question → Réponse → Question → ... → Miroir → Transition bloc suivant

#### Phase 8 : Matching
1. **Backend** : Après BLOC 10, transition `BLOC_10` → `STEP_99_MATCH_READY`
2. **Frontend** : Affiche bouton "Je génère mon matching"
3. **Utilisateur** : Clique bouton → `callAxiom(null, 'START_MATCHING')`
4. **⚠️ PROBLÈME** : Event `START_MATCHING` n'arrive pas à `executeAxiom()` car `executeWithAutoContinue()` ne transmet pas l'event

---

## 2️⃣ IDENTIFICATION PRÉCISE DES PROBLÈMES

### 2.1 Problèmes bloquants (🔴 CRITIQUE)

#### P1 — Event `START_MATCHING` perdu

**📍 Où** : Backend — `src/engine/axiomExecutor.ts` (ligne 1743), `src/server.ts` (ligne 894)

**❓ Pourquoi** :
- `POST /axiom` appelle `executeWithAutoContinue(candidate, userMessageText)` (ligne 894)
- `executeWithAutoContinue()` appelle `executeAxiom({ candidate, userMessage })` (ligne 1892)
- **L'event n'est jamais passé** à `executeAxiom()`
- `executeAxiom()` vérifie `if (!userMessage && !event)` (ligne 1743) → Toujours vrai si event non transmis

**🚨 Impact** :
- Le bouton "Je génère mon matching" ne déclenche **PAS** le matching
- L'utilisateur reste bloqué après BLOC 10
- **BLOQUANT PRODUCTION**

**🔁 Traitement** :
- Correctif C2 partiellement appliqué (frontend envoie event)
- Mais backend ne le reçoit pas → **NON RÉSOLU**

---

#### P2 — Transitions silencieuses après miroirs

**📍 Où** : Backend — `src/services/blockOrchestrator.ts` (lignes 230-235, 827-832), Frontend — `ui-test/app.js` (lignes 115-124)

**❓ Pourquoi** :
- Après miroir BLOC 1 ou 2B, orchestrateur retourne `expectsAnswer: false`
- Frontend reçoit `expectsAnswer: false` → Masque champ de saisie (ligne 115-124)
- Backend ne retourne **PAS** immédiatement la première question du bloc suivant
- L'utilisateur ne sait pas qu'il peut continuer

**🚨 Impact** :
- Utilisateur bloqué après miroir, ne sait pas qu'il peut envoyer un message
- **DÉGRADANT UX** (mais pas bloquant technique)

**🔁 Traitement** :
- Correctifs C1 et C3 appliqués (transitions `currentBlock` et `step`)
- Mais problème UX reste → **PARTIELLEMENT RÉSOLU**

---

### 2.2 Problèmes importants (🟠 ÉLEVÉ)

#### P3 — Double valeur pour fin préambule

**📍 Où** : Backend — `src/engine/axiomExecutor.ts` (ligne 852), `src/server.ts` (lignes 273-275, 924-926)

**❓ Pourquoi** :
- Deux constantes définies : `STEP_03_BLOC1` et `PREAMBULE_DONE`
- `deriveStateFromConversationHistory()` retourne `STEP_03_BLOC1` (ligne 964)
- Mais certains endroits utilisent encore `PREAMBULE_DONE`
- Frontend doit gérer les deux valeurs (ligne 109 `ui-test/app.js`)

**🚨 Impact** :
- Code dupliqué, confusion, risque d'incohérence
- **DÉGRADANT MAINTENABILITÉ**

**🔁 Traitement** : **NON RÉSOLU**

---

#### P4 — Mapping step → state différent entre `/start` et `/axiom`

**📍 Où** : Backend — `src/server.ts` (lignes 261-283 pour `/start`, 914-937 pour `/axiom`)

**❓ Pourquoi** :
- `/start` retourne `state: "collecting"` pour tous les blocs (ligne 277)
- `/axiom` retourne `state: "bloc_01"`, `"bloc_02"`, etc. pour les blocs (ligne 929)
- `/start` retourne `state: "matching"` pour `DONE_MATCHING` (ligne 282)
- `/axiom` retourne `state: "done"` pour `DONE_MATCHING` (ligne 936)

**🚨 Impact** :
- Frontend peut recevoir des valeurs `state` différentes selon la route
- Nécessite gestion des deux cas → **DÉGRADANT ROBUSTESSE**

**🔁 Traitement** : **NON RÉSOLU**

---

#### P5 — Double mise à jour `currentBlock`

**📍 Où** : Backend — `src/services/blockOrchestrator.ts` (lignes 220-223, 817-820), `src/server.ts` (ligne 930)

**❓ Pourquoi** :
- Orchestrateur met à jour `currentBlock` AVANT le retour (lignes 220-223, 817-820)
- `src/server.ts` met à jour `currentBlock` ENCORE APRÈS le retour (ligne 930)
- Code redondant, risque de désynchronisation

**🚨 Impact** :
- Code redondant, risque de bug si valeurs différentes
- **DÉGRADANT MAINTENABILITÉ**

**🔁 Traitement** : **NON RÉSOLU**

---

### 2.3 Problèmes d'amélioration (🟡 MOYEN)

#### P6 — Garde message utilisateur avant bouton BLOC 1

**📍 Où** : Backend — `src/server.ts` (lignes 695-710)

**❓ Pourquoi** :
- Si `step === STEP_03_BLOC1` ET `userMessage` présent ET `event !== START_BLOC_1` → Retourne message pédagogique
- Mais frontend masque déjà le champ (ligne 298 `ui-test/app.js`)
- Garde backend est redondante mais sécurisante

**🚨 Impact** :
- **COSMÉTIQUE** (défense en profondeur)

**🔁 Traitement** :
- Correctif C5 appliqué → **RÉSOLU**

---

#### P7 — Gestion d'erreur fail-fast BLOC 2B

**📍 Où** : Backend — `src/server.ts` (lignes 802-822)

**❓ Pourquoi** :
- Si validation BLOC 2B échoue après retry → Error throw
- Backend catch l'erreur et retourne message utilisateur-friendly
- **COSMÉTIQUE** (améliore UX en cas d'erreur)

**🚨 Impact** :
- **COSMÉTIQUE** (améliore UX)

**🔁 Traitement** :
- Correctif C4 appliqué → **RÉSOLU**

---

#### P8 — Réconciliation personnages BLOC 2B

**📍 Où** : Backend — `src/services/blockOrchestrator.ts` (lignes 989-1003)

**❓ Pourquoi** :
- Validation `validateCharacterNames()` détecte descriptions au lieu de noms canoniques
- Retry si validation échoue
- **AMÉLIORATION QUALITÉ**

**🚨 Impact** :
- **COSMÉTIQUE** (améliore qualité questions BLOC 2B)

**🔁 Traitement** :
- Correctif C6 appliqué → **RÉSOLU**

---

#### P9 — Code obsolète BLOC 2A

**📍 Où** : Backend — `src/services/blockOrchestrator.ts` (lignes 487-505 supprimées)

**❓ Pourquoi** :
- Message obsolète "BLOC 2A terminé. Transition vers BLOC 2B (non implémenté)" supprimé
- **NETTOYAGE CODE**

**🚨 Impact** :
- **COSMÉTIQUE** (nettoyage)

**🔁 Traitement** :
- Correctif C7 appliqué → **RÉSOLU**

---

## 3️⃣ FEUILLE DE ROUTE DE CORRECTION

### 3.1 Vue d'ensemble

**Total problèmes identifiés** : 9  
**Problèmes bloquants** : 2 (P1, P2)  
**Problèmes importants** : 3 (P3, P4, P5)  
**Problèmes d'amélioration** : 4 (P6, P7, P8, P9 — déjà résolus)

**Ordre de correction** (selon priorité + dépendances) :

1. **P1** — Event `START_MATCHING` perdu (🔴 CRITIQUE)
2. **P2** — Transitions silencieuses après miroirs (🔴 CRITIQUE)
3. **P3** — Double valeur pour fin préambule (🟠 ÉLEVÉ)
4. **P4** — Mapping step → state différent (🟠 ÉLEVÉ)
5. **P5** — Double mise à jour `currentBlock` (🟠 ÉLEVÉ)

---

### 3.2 Détail par correction

#### 🔴 CORRECTION 1 — Event `START_MATCHING` perdu

**Problème** : L'event `START_MATCHING` envoyé par le frontend n'arrive jamais à `executeAxiom()`.

**Fichiers à modifier** :
- `src/server.ts` (ligne 894)
- `src/engine/axiomExecutor.ts` (lignes 1888-1917, 1741-1770)

**Modifications exactes** :

1. **Modifier `executeWithAutoContinue()` pour accepter `event`** :
```typescript
// src/engine/axiomExecutor.ts:1888-1917
export async function executeWithAutoContinue(
  candidate: AxiomCandidate,
  userMessage: string | null = null,
  event: string | null = null,  // ← Ajouter paramètre
): Promise<ExecuteAxiomResult> {
  let result = await executeAxiom({
    candidate,
    userMessage: userMessage,
    event: event,  // ← Passer l'event
  });
  // ... reste identique
}
```

2. **Modifier `POST /axiom` pour passer l'event** :
```typescript
// src/server.ts:894
const result = await executeWithAutoContinue(candidate, userMessageText, event);  // ← Passer event
```

**Tests à effectuer** :
1. ✅ Compléter BLOC 10
2. ✅ Vérifier : Bouton "Je génère mon matching" apparaît
3. ✅ Cliquer sur le bouton
4. ✅ Vérifier : Matching déclenché (pas message d'attente)

**Dépendances** : Aucune

**Ce que ça débloque** : Matching fonctionnel après BLOC 10

---

#### 🔴 CORRECTION 2 — Transitions silencieuses après miroirs

**Problème** : Après miroir BLOC 1 ou 2B, le frontend reçoit `expectsAnswer: false` et masque le champ, mais l'utilisateur ne sait pas qu'il peut continuer.

**Fichiers à modifier** :
- `src/services/blockOrchestrator.ts` (lignes 230-235, 827-832)

**Modifications exactes** :

1. **Après miroir BLOC 1, retourner immédiatement première question BLOC 2A** :
```typescript
// src/services/blockOrchestrator.ts:230-235
// AVANT
return {
  response: mirror,
  step: BLOC_02,
  expectsAnswer: false,  // ← Problème
  autoContinue: false,
};

// APRÈS
// Générer immédiatement première question BLOC 2A
const firstQuestion2A = await this.generateQuestion2A1(currentCandidate, 0);
candidateStore.appendAssistantMessage(currentCandidate.candidateId, firstQuestion2A, {
  block: 2,
  step: BLOC_02,
  kind: 'question',
});

return {
  response: mirror + '\n\n' + firstQuestion2A,  // ← Miroir + première question
  step: BLOC_02,
  expectsAnswer: true,  // ← Corriger
  autoContinue: false,
};
```

2. **Après miroir BLOC 2B, retourner immédiatement première question BLOC 3** :
```typescript
// src/services/blockOrchestrator.ts:827-832
// AVANT
return {
  response: mirror,
  step: BLOC_03,
  expectsAnswer: false,  // ← Problème
  autoContinue: false,
};

// APRÈS
// Déléguer à executeAxiom() pour générer première question BLOC 3
const updatedCandidate = candidateStore.get(candidateId);
if (!updatedCandidate) {
  throw new Error(`Candidate ${candidateId} not found`);
}

// Appeler executeAxiom() pour générer première question BLOC 3
const { executeAxiom } = await import('../engine/axiomExecutor.js');
const nextResult = await executeAxiom({
  candidate: updatedCandidate,
  userMessage: null,
  event: null,
});

return {
  response: mirror + '\n\n' + nextResult.response,  // ← Miroir + première question
  step: nextResult.step,
  expectsAnswer: nextResult.expectsAnswer,  // ← Utiliser expectsAnswer du résultat
  autoContinue: false,
};
```

**Tests à effectuer** :
1. ✅ Compléter BLOC 1 (toutes questions + miroir)
2. ✅ Vérifier : Première question BLOC 2A affichée immédiatement après miroir
3. ✅ Vérifier : Champ de saisie actif (`expectsAnswer: true`)
4. ✅ Compléter BLOC 2B (toutes questions + miroir)
5. ✅ Vérifier : Première question BLOC 3 affichée immédiatement après miroir
6. ✅ Vérifier : Champ de saisie actif

**Dépendances** : Aucune

**Ce que ça débloque** : Transitions fluides, utilisateur ne reste jamais bloqué

---

#### 🟠 CORRECTION 3 — Double valeur pour fin préambule

**Problème** : Deux valeurs (`STEP_03_BLOC1` et `PREAMBULE_DONE`) pour le même état logique.

**Fichiers à modifier** :
- `src/engine/axiomExecutor.ts` (ligne 852)
- `src/server.ts` (lignes 273-275, 924-926)
- `ui-test/app.js` (ligne 109)

**Modifications exactes** :

1. **Supprimer constante `PREAMBULE_DONE`** :
```typescript
// src/engine/axiomExecutor.ts:852
// SUPPRIMER
export const PREAMBULE_DONE = 'PREAMBULE_DONE';
```

2. **Remplacer toutes les occurrences de `PREAMBULE_DONE` par `STEP_03_BLOC1`** :
```typescript
// src/server.ts:273-275
// AVANT
} else if (result.step === "PREAMBULE_DONE") {
  responseState = "wait_start_button";
  responseStep = "PREAMBULE_DONE";

// APRÈS
// SUPPRIMER (déjà géré par STEP_03_BLOC1)
```

```typescript
// src/server.ts:924-926
// AVANT
} else if (result.step === "PREAMBULE_DONE") {
  responseState = "wait_start_button";
  responseStep = "PREAMBULE_DONE";

// APRÈS
// SUPPRIMER (déjà géré par STEP_03_BLOC1)
```

```typescript
// src/server.ts:218-219
// AVANT
if (
  derivedStep === STEP_03_BLOC1 ||
  derivedStep === "PREAMBULE_DONE" ||

// APRÈS
if (
  derivedStep === STEP_03_BLOC1 ||

```

```javascript
// ui-test/app.js:109
// AVANT
if (data.step === 'PREAMBULE_DONE' || data.step === 'STEP_03_BLOC1') {

// APRÈS
if (data.step === 'STEP_03_BLOC1') {
```

**Tests à effectuer** :
1. ✅ Compléter préambule
2. ✅ Vérifier : `step === 'STEP_03_BLOC1'` (pas `PREAMBULE_DONE`)
3. ✅ Vérifier : Bouton "Je commence mon profil" affiché
4. ✅ Refresh page
5. ✅ Vérifier : `step === 'STEP_03_BLOC1'` après refresh

**Dépendances** : Aucune

**Ce que ça débloque** : Code unifié, moins de confusion

---

#### 🟠 CORRECTION 4 — Mapping step → state différent

**Problème** : `/start` et `/axiom` retournent des valeurs `state` différentes pour les mêmes `step`.

**Fichiers à modifier** :
- `src/server.ts` (créer fonction `mapStepToState()`)

**Modifications exactes** :

1. **Créer fonction unique `mapStepToState()`** :
```typescript
// src/server.ts (avant les routes)
function mapStepToState(step: string): string {
  if (step === STEP_01_IDENTITY || step === 'IDENTITY') {
    return "identity";
  } else if (step === STEP_02_TONE) {
    return "tone_choice";
  } else if (step === STEP_03_PREAMBULE) {
    return "preambule";
  } else if (step === STEP_03_BLOC1) {
    return "wait_start_button";
  } else if ([BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(step as any)) {
    return "collecting";  // ← Unifier en "collecting" pour tous les blocs
  } else if (step === STEP_99_MATCH_READY) {
    return "match_ready";
  } else if (step === STEP_99_MATCHING || step === DONE_MATCHING) {
    return "matching";  // ← Unifier en "matching" pour DONE_MATCHING
  }
  return "collecting";  // Fallback
}
```

2. **Utiliser cette fonction dans `/start`** :
```typescript
// src/server.ts:261-283
// AVANT
let responseState: string = "collecting";
let responseStep = result.step;

if (result.step === STEP_01_IDENTITY || result.step === 'IDENTITY') {
  responseState = "identity";
  responseStep = "STEP_01_IDENTITY";
} else if (result.step === STEP_02_TONE) {
  responseState = "tone_choice";
  responseStep = "STEP_02_TONE";
} // ... etc

// APRÈS
const responseState = mapStepToState(result.step);
let responseStep = result.step;
if (result.step === STEP_01_IDENTITY || result.step === 'IDENTITY') {
  responseStep = "STEP_01_IDENTITY";
} else if (result.step === STEP_02_TONE) {
  responseStep = "STEP_02_TONE";
} // ... etc (garder uniquement les normalisations de step)
```

3. **Utiliser cette fonction dans `/axiom`** :
```typescript
// src/server.ts:910-937
// AVANT
let responseState: string = "collecting";
let responseStep = result.step;

if (result.step === STEP_01_IDENTITY || result.step === 'IDENTITY') {
  responseState = "identity";
  responseStep = "STEP_01_IDENTITY";
} // ... etc

// APRÈS
const responseState = mapStepToState(result.step);
let responseStep = result.step;
if (result.step === STEP_01_IDENTITY || result.step === 'IDENTITY') {
  responseStep = "STEP_01_IDENTITY";
} // ... etc (garder uniquement les normalisations de step)
```

**Tests à effectuer** :
1. ✅ Appeler `/start` avec `step: BLOC_01` → Vérifier `state: "collecting"`
2. ✅ Appeler `/axiom` avec `step: BLOC_01` → Vérifier `state: "collecting"`
3. ✅ Appeler `/start` avec `step: DONE_MATCHING` → Vérifier `state: "matching"`
4. ✅ Appeler `/axiom` avec `step: DONE_MATCHING` → Vérifier `state: "matching"`

**Dépendances** : Aucune

**Ce que ça débloque** : Cohérence backend, frontend peut faire confiance à `state`

---

#### 🟠 CORRECTION 5 — Double mise à jour `currentBlock`

**Problème** : `currentBlock` est mis à jour deux fois (orchestrateur + server.ts).

**Fichiers à modifier** :
- `src/server.ts` (ligne 930)

**Modifications exactes** :

1. **Supprimer mise à jour `currentBlock` dans `server.ts` pour blocs gérés par orchestrateur** :
```typescript
// src/server.ts:927-930
// AVANT
} else if ([BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(result.step as any)) {
  const blocNumber = [BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].indexOf(result.step as any) + 1;
  responseState = `bloc_${blocNumber.toString().padStart(2, '0')}`;
  candidateStore.updateSession(candidate.candidateId, { state: "collecting", currentBlock: blocNumber });  // ← Supprimer
}

// APRÈS
} else if ([BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(result.step as any)) {
  const blocNumber = [BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].indexOf(result.step as any) + 1;
  responseState = mapStepToState(result.step);  // ← Utiliser fonction unifiée
  // currentBlock déjà mis à jour par orchestrateur ou executeAxiom()
}
```

**⚠️ ATTENTION** : Vérifier que `executeAxiom()` met bien à jour `currentBlock` pour les blocs 3-10 (non gérés par orchestrateur).

**Tests à effectuer** :
1. ✅ Compléter BLOC 1 → Vérifier `currentBlock: 2` (mis à jour par orchestrateur uniquement)
2. ✅ Compléter BLOC 2B → Vérifier `currentBlock: 3` (mis à jour par orchestrateur uniquement)
3. ✅ Compléter BLOC 3 → Vérifier `currentBlock: 4` (mis à jour par executeAxiom() uniquement)

**Dépendances** : Correction 4 (utilise `mapStepToState()`)

**Ce que ça débloque** : Code plus propre, moins de redondance

---

## 4️⃣ CONDITIONS DE VALIDATION

### 4.1 État attendu du produit après corrections

**Parcours utilisateur complet** :
1. ✅ Identité → Tone → Préambule → Bouton BLOC 1
2. ✅ BLOC 1 : Questions séquentielles → Miroir → **Première question BLOC 2A affichée immédiatement**
3. ✅ BLOC 2A : 3 questions adaptatives → **Transition automatique vers BLOC 2B**
4. ✅ BLOC 2B : Questions projectives → Miroir → **Première question BLOC 3 affichée immédiatement**
5. ✅ BLOCS 3-10 : Questions → Miroirs → Transitions
6. ✅ BLOC 10 terminé → Bouton matching → **Matching déclenché**

**Cohérence backend** :
- ✅ Un seul `step` pour fin préambule (`STEP_03_BLOC1`)
- ✅ Même `state` retourné par `/start` et `/axiom` pour un même `step`
- ✅ `currentBlock` mis à jour une seule fois (par orchestrateur ou executeAxiom())

**Cohérence frontend** :
- ✅ Champ de saisie toujours actif quand question disponible
- ✅ Boutons affichés aux bons moments
- ✅ Aucun état bloquant pour l'utilisateur

---

### 4.2 Conditions pour lancer tests automatiques

**Prérequis** :
- [ ] Toutes les corrections P1-P5 appliquées
- [ ] `npm run typecheck` passe sans erreur
- [ ] `npm run build` passe sans erreur
- [ ] Tests unitaires existants passent

**Tests automatiques à créer** :
1. Test event `START_MATCHING` arrive à `executeAxiom()`
2. Test transition BLOC 1 → BLOC 2A retourne première question
3. Test transition BLOC 2B → BLOC 3 retourne première question
4. Test `mapStepToState()` retourne même valeur pour `/start` et `/axiom`
5. Test `currentBlock` mis à jour une seule fois

---

### 4.3 Conditions pour lancer tests utilisateurs

**Prérequis** :
- [ ] Toutes les corrections P1-P5 appliquées
- [ ] Tests automatiques passent
- [ ] Parcours complet testé manuellement (identité → matching)
- [ ] Aucun état bloquant identifié
- [ ] Logs de debug activés pour traçabilité

**Scénarios de test utilisateur** :
1. **Parcours complet** : Identité → Tone → Préambule → BLOC 1 → ... → BLOC 10 → Matching
2. **Refresh après préambule** : Vérifier bouton toujours affiché
3. **Refresh pendant BLOC 2A** : Vérifier reprise correcte
4. **Refresh pendant BLOC 2B** : Vérifier reprise correcte
5. **Double clic bouton BLOC 1** : Vérifier pas de double génération
6. **Double clic bouton matching** : Vérifier pas de double matching

---

## 5️⃣ RÉSUMÉ EXÉCUTIF

### 5.1 Problèmes identifiés

- **🔴 BLOQUANTS** : 2 (P1, P2)
- **🟠 IMPORTANTS** : 3 (P3, P4, P5)
- **🟡 AMÉLIORATIONS** : 4 (P6-P9, déjà résolus)

### 5.2 Ordre de correction

1. **P1** — Event `START_MATCHING` perdu (🔴)
2. **P2** — Transitions silencieuses après miroirs (🔴)
3. **P3** — Double valeur pour fin préambule (🟠)
4. **P4** — Mapping step → state différent (🟠)
5. **P5** — Double mise à jour `currentBlock` (🟠)

### 5.3 Estimation

- **P1** : 30 minutes (modification simple, test direct)
- **P2** : 1-2 heures (modification orchestrateur, tests transitions)
- **P3** : 30 minutes (recherche/remplacement, tests)
- **P4** : 1 heure (création fonction, tests mapping)
- **P5** : 30 minutes (suppression ligne, vérification)

**Total estimé** : **3-4 heures** pour toutes les corrections

### 5.4 Risques

- **P2** : Risque de régression si génération question BLOC 2A/3 échoue
- **P4** : Risque de régression si frontend utilise `state: "bloc_XX"` (à vérifier)
- **P5** : Risque si `executeAxiom()` ne met pas à jour `currentBlock` pour blocs 3-10

**Mitigation** : Tests après chaque correction, rollback possible (git)

---

## 6️⃣ CONCLUSION

**État actuel** : Code fonctionnel mais avec **2 problèmes bloquants** et **3 problèmes importants**.

**Après corrections** : Parcours 100% cohérent, fluide, testable.

**Prochaines étapes** :
1. Appliquer corrections P1-P5 dans l'ordre
2. Lancer tests automatiques
3. Tester manuellement parcours complet
4. Lancer tests utilisateurs

**FIN DE LA FEUILLE DE ROUTE**
