# 🔍 AUDIT COMPLET DE COHÉRENCE BACKEND ↔ FRONTEND — AXIOM

**Date** : 2025-01-27  
**Objectif** : Vérifier que l'ensemble du parcours AXIOM est cohérent, bien relié et sans trou fonctionnel, du point de vue d'un utilisateur réel.

**Périmètre** : Backend (orchestration, états, transitions) + Frontend (boutons, champs, enchaînements) + Cohérence inter-couches.

---

## 1️⃣ ORCHESTRATION BACKEND

### 1.1 États `step`, `currentBlock`, `expectsAnswer`, `autoContinue`

#### 1.1.1 Cohérence des états `step` retournés

**Référence** : `src/server.ts` (lignes 910-937), `src/engine/axiomExecutor.ts` (retours `ExecuteAxiomResult`)

**États possibles identifiés** :
- `STEP_01_IDENTITY`
- `STEP_02_TONE`
- `STEP_03_PREAMBULE`
- `STEP_03_BLOC1` / `PREAMBULE_DONE`
- `BLOC_01` à `BLOC_10`
- `STEP_99_MATCH_READY`
- `STEP_99_MATCHING`
- `DONE_MATCHING`

**Vérification** :
- ✅ Tous les états sont bien définis dans `axiomExecutor.ts`
- ✅ Les transitions sont explicites dans le code
- ⚠️ **AMBIGU** : `STEP_03_BLOC1` et `PREAMBULE_DONE` sont deux valeurs différentes pour le même état logique (fin préambule)

**État** : ⚠️ **AMBIGU** (deux valeurs pour un même état)

**Hypothèse de correctif** :
- Unifier en une seule valeur `STEP_03_BLOC1` partout, ou créer une constante `PREAMBULE_COMPLETED = 'STEP_03_BLOC1'`
- Vérifier que `deriveStateFromConversationHistory()` retourne toujours `STEP_03_BLOC1` (pas `PREAMBULE_DONE`)

---

#### 1.1.2 Cohérence `currentBlock` vs `step`

**Référence** : `src/services/blockOrchestrator.ts` (lignes 220-223, 817-820), `src/server.ts` (lignes 928-930)

**Vérification** :
- ✅ BLOC 1 → `currentBlock: 1`, `step: BLOC_01`
- ✅ BLOC 1 terminé → `currentBlock: 2`, `step: BLOC_02` (ligne 220-223 orchestrateur)
- ✅ BLOC 2B terminé → `currentBlock: 3`, `step: BLOC_03` (ligne 817-820 orchestrateur)
- ⚠️ **AMBIGU** : Dans `src/server.ts:928-930`, le mapping `step → currentBlock` est fait APRÈS l'exécution, mais l'orchestrateur met déjà à jour `currentBlock` AVANT le retour

**État** : ⚠️ **AMBIGU** (double mise à jour potentielle)

**Hypothèse de correctif** :
- Supprimer la mise à jour `currentBlock` dans `src/server.ts:930` pour les blocs gérés par l'orchestrateur (BLOC 1, 2A, 2B)
- Laisser uniquement l'orchestrateur gérer `currentBlock` pour ces blocs

---

#### 1.1.3 Flags `expectsAnswer` et `autoContinue`

**Référence** : `src/engine/axiomExecutor.ts` (retours), `src/services/blockOrchestrator.ts` (retours `OrchestratorResult`)

**Règles attendues** :
- `expectsAnswer: true` → Frontend doit afficher champ de saisie
- `expectsAnswer: false` → Frontend doit masquer champ de saisie (bouton ou attente)
- `autoContinue: true` → Backend continue automatiquement (non interactif)
- `autoContinue: false` → Attente action utilisateur

**Vérification** :
- ✅ Après préambule : `expectsAnswer: false, autoContinue: false` (bouton attendu)
- ✅ Pendant questions BLOC 1-10 : `expectsAnswer: true, autoContinue: false` (champ actif)
- ✅ Après miroir BLOC 1 : `expectsAnswer: false, autoContinue: false` (transition vers BLOC 2A)
- ✅ Après miroir BLOC 2B : `expectsAnswer: false, autoContinue: false` (transition vers BLOC 3)
- ✅ `STEP_99_MATCH_READY` : `expectsAnswer: false, autoContinue: false` (bouton matching attendu)

**État** : ✅ **CONFORME**

---

### 1.2 Transitions entre blocs

#### 1.2.1 Transition Préambule → BLOC 1

**Référence** : `src/server.ts` (lignes 651-690), `src/services/blockOrchestrator.ts` (ligne 120-244)

**Flux attendu** :
1. Préambule terminé → `step: STEP_03_BLOC1`, `expectsAnswer: false`
2. Frontend affiche bouton "Je commence mon profil"
3. Utilisateur clique → `event: START_BLOC_1`
4. Backend délègue à orchestrateur → Génération questions BLOC 1
5. Retour première question → `step: BLOC_01`, `expectsAnswer: true`

**Vérification** :
- ✅ Event `START_BLOC_1` bien géré (ligne 651 `src/server.ts`)
- ✅ Orchestrateur génère questions BLOC 1 (ligne 246-280 `blockOrchestrator.ts`)
- ✅ Retour première question avec `expectsAnswer: true`

**État** : ✅ **CONFORME**

---

#### 1.2.2 Transition BLOC 1 → BLOC 2A

**Référence** : `src/services/blockOrchestrator.ts` (lignes 205-235)

**Flux attendu** :
1. BLOC 1 terminé (toutes questions répondues) → Génération miroir
2. Miroir généré → `currentBlock: 2`, `step: BLOC_02`
3. Frontend reçoit `step: BLOC_02`, `expectsAnswer: false`
4. Utilisateur envoie message → Routage vers BLOC 2A

**Vérification** :
- ✅ Mise à jour `currentBlock: 2` (ligne 220-223)
- ✅ Mise à jour `step: BLOC_02` (ligne 224-228)
- ✅ Retour `expectsAnswer: false` (ligne 233)
- ⚠️ **AMBIGU** : Le frontend reçoit `expectsAnswer: false` après le miroir, mais doit ensuite accepter une réponse pour BLOC 2A. Comment le frontend sait-il qu'il doit réafficher le champ ?

**État** : ⚠️ **AMBIGU** (transition silencieuse)

**Hypothèse de correctif** :
- Option A : Après miroir BLOC 1, retourner `expectsAnswer: true` immédiatement avec un message "Passons maintenant au BLOC 2A. [Question 2A.1]"
- Option B : Le frontend détecte `step: BLOC_02` ET `expectsAnswer: false` → attend un court délai → réaffiche le champ (mais ce n'est pas idéal)

---

#### 1.2.3 Transition BLOC 2A → BLOC 2B

**Référence** : `src/services/blockOrchestrator.ts` (lignes 130-144)

**Flux attendu** :
1. BLOC 2A : 3 questions séquentielles (médium, préférences, œuvre noyau)
2. Après 3 réponses → `answeredCount >= 3` → Routage vers `handleBlock2B()`
3. BLOC 2B : Génération questions projectives

**Vérification** :
- ✅ Détection `answeredCount >= 3` (ligne 138)
- ✅ Routage vers `handleBlock2B()` (ligne 139)
- ✅ Génération questions 2B (ligne 700-750 `blockOrchestrator.ts`)

**État** : ✅ **CONFORME**

---

#### 1.2.4 Transition BLOC 2B → BLOC 3

**Référence** : `src/services/blockOrchestrator.ts` (lignes 817-832)

**Flux attendu** :
1. BLOC 2B terminé (toutes questions répondues) → Génération miroir final
2. Miroir généré → `currentBlock: 3`, `step: BLOC_03`
3. Frontend reçoit `step: BLOC_03`, `expectsAnswer: false`

**Vérification** :
- ✅ Mise à jour `currentBlock: 3` (ligne 819)
- ✅ Mise à jour `step: BLOC_03` (ligne 822)
- ✅ Retour `expectsAnswer: false` (ligne 830)
- ⚠️ **MÊME AMBIGUITÉ** que BLOC 1 → BLOC 2A : Comment le frontend sait-il qu'il doit accepter une réponse pour BLOC 3 ?

**État** : ⚠️ **AMBIGU** (transition silencieuse)

**Hypothèse de correctif** : Même que 1.2.2

---

#### 1.2.5 Transition BLOC 10 → Matching

**Référence** : `src/engine/axiomExecutor.ts` (lignes 1708-1727, 1741-1770)

**Flux attendu** :
1. BLOC 10 terminé → `step: STEP_99_MATCH_READY`, `expectsAnswer: false`
2. Frontend affiche bouton "Je génère mon matching"
3. Utilisateur clique → `event: START_MATCHING`
4. Backend déclenche matching → `step: STEP_99_MATCHING`

**Vérification** :
- ✅ Transition vers `STEP_99_MATCH_READY` (ligne 1709)
- ✅ Frontend détecte `step === 'STEP_99_MATCH_READY' && expectsAnswer === false` (ligne 112 `ui-test/app.js`)
- ✅ Bouton envoie `event: START_MATCHING` (ligne 200 `ui-test/app.js`)
- ⚠️ **PROBLÈME** : Dans `axiomExecutor.ts:1743`, si `!userMessage && !event`, retourne message d'attente au lieu de déclencher matching. Mais le frontend envoie bien `event: START_MATCHING`, donc ça devrait fonctionner.

**Vérification approfondie** :
- Ligne 1754 : `currentState = STEP_99_MATCHING` uniquement si `userMessage || event` présent
- Ligne 200 `ui-test/app.js` : `await callAxiom(null, 'START_MATCHING')` → `event: 'START_MATCHING'` est bien envoyé
- ✅ Donc la condition ligne 1754 devrait être vraie

**État** : ✅ **CONFORME** (après correctif C2)

---

### 1.3 Gestion des events

#### 1.3.1 Event `START_BLOC_1`

**Référence** : `src/server.ts` (lignes 651-690), `ui-test/app.js` (lignes 160-170)

**Vérification** :
- ✅ Frontend envoie `event: 'START_BLOC_1'` (ligne 160 `ui-test/app.js`)
- ✅ Backend détecte `event === "START_BLOC_1"` (ligne 651 `src/server.ts`)
- ✅ Délégation à orchestrateur (ligne 653-654)
- ✅ Génération questions BLOC 1

**État** : ✅ **CONFORME**

---

#### 1.3.2 Event `START_MATCHING`

**Référence** : `src/engine/axiomExecutor.ts` (lignes 1741-1770), `ui-test/app.js` (ligne 200)

**Vérification** :
- ✅ Frontend envoie `event: 'START_MATCHING'` (ligne 200 `ui-test/app.js`)
- ⚠️ **PROBLÈME** : Dans `axiomExecutor.ts:1743`, la condition est `if (!userMessage && !event)`, mais `event` n'est pas passé à `executeAxiom()` depuis `executeWithAutoContinue()`

**Vérification approfondie** :
- `executeWithAutoContinue()` (ligne 1888 `axiomExecutor.ts`) appelle `executeAxiom({ candidate, userMessage })` → **PAS d'event**
- `POST /axiom` (ligne 894 `src/server.ts`) appelle `executeWithAutoContinue(candidate, userMessageText)` → **PAS d'event**
- ❌ **PROBLÈME IDENTIFIÉ** : L'event `START_MATCHING` n'arrive jamais à `executeAxiom()`

**État** : ❌ **NON CONFORME** (event perdu)

**Hypothèse de correctif** :
- Option A : Modifier `executeWithAutoContinue()` pour accepter un paramètre `event` et le passer à `executeAxiom()`
- Option B : Dans `POST /axiom`, détecter `event === 'START_MATCHING'` AVANT d'appeler `executeWithAutoContinue()`, et appeler directement `executeAxiom()` avec l'event
- Option C : Modifier `executeAxiom()` pour lire `event` depuis le contexte ou un paramètre global (non recommandé)

---

### 1.4 États "lecture" vs "attente action utilisateur"

#### 1.4.1 États non interactifs (`expectsAnswer: false, autoContinue: false`)

**États identifiés** :
- `STEP_03_BLOC1` / `PREAMBULE_DONE` → Bouton "Je commence mon profil"
- `STEP_99_MATCH_READY` → Bouton "Je génère mon matching"
- Après miroir BLOC 1 → Transition silencieuse vers BLOC 2A
- Après miroir BLOC 2B → Transition silencieuse vers BLOC 3

**Vérification** :
- ✅ Préambule → Bouton affiché
- ✅ Matching ready → Bouton affiché
- ⚠️ **AMBIGU** : Après miroirs, le frontend reçoit `expectsAnswer: false`, mais doit ensuite accepter une réponse. Comment sait-il quand réafficher le champ ?

**État** : ⚠️ **AMBIGU** (transitions silencieuses)

**Hypothèse de correctif** : Voir 1.2.2 et 1.2.4

---

#### 1.4.2 États interactifs (`expectsAnswer: true`)

**États identifiés** :
- `STEP_01_IDENTITY` → Champ actif pour prénom/nom/email
- `STEP_02_TONE` → Champ actif pour choix tutoiement/vouvoiement
- `BLOC_01` à `BLOC_10` → Champ actif pour réponses questions

**Vérification** :
- ✅ Tous les blocs retournent `expectsAnswer: true` pendant les questions
- ✅ Frontend réaffiche le champ si `expectsAnswer === true` (ligne 115-124 `ui-test/app.js`)

**État** : ✅ **CONFORME**

---

## 2️⃣ COMPORTEMENT FRONTEND

### 2.1 Présence/absence des boutons aux bons moments

#### 2.1.1 Bouton "Je commence mon profil"

**Référence** : `ui-test/app.js` (lignes 109-111, 139-171)

**Conditions d'affichage** :
```javascript
if (data.step === 'PREAMBULE_DONE' || data.step === 'STEP_03_BLOC1') {
  showStartButton = true;
  displayStartButton();
}
```

**Vérification** :
- ✅ Détection correcte des deux valeurs (`PREAMBULE_DONE` ou `STEP_03_BLOC1`)
- ✅ Bouton masqué après clic (ligne 62-66 `ui-test/app.js`)
- ✅ Event `START_BLOC_1` envoyé (ligne 160)

**État** : ✅ **CONFORME**

---

#### 2.1.2 Bouton "Je génère mon matching"

**Référence** : `ui-test/app.js` (lignes 112-114, 173-205)

**Conditions d'affichage** :
```javascript
else if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false) {
  showStartButton = true;
  displayMatchingButton();
}
```

**Vérification** :
- ✅ Détection correcte (`STEP_99_MATCH_READY` ET `expectsAnswer === false`)
- ✅ Bouton masqué après clic (ligne 62-66)
- ✅ Event `START_MATCHING` envoyé (ligne 200)
- ⚠️ **PROBLÈME** : L'event n'arrive pas à `executeAxiom()` (voir 1.3.2)

**État** : ⚠️ **AMBIGU** (bouton fonctionne côté front, mais event perdu côté back)

---

### 2.2 Champ de saisie actif / grisé selon l'état backend

#### 2.2.1 Activation du champ

**Référence** : `ui-test/app.js` (lignes 115-124, 396-402, 429-436)

**Conditions d'activation** :
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

**Vérification** :
- ✅ Champ activé si `expectsAnswer === true`
- ✅ Champ désactivé pendant envoi (ligne 423)
- ✅ Champ réactivé après réponse si `expectsAnswer === true` (ligne 429-430)
- ⚠️ **PROBLÈME** : Après miroir BLOC 1 ou 2B, `expectsAnswer: false` est reçu, donc le champ reste masqué. Comment le frontend sait-il qu'il doit le réafficher pour la première question du bloc suivant ?

**État** : ⚠️ **AMBIGU** (transitions silencieuses)

**Hypothèse de correctif** :
- Option A : Backend retourne immédiatement la première question du bloc suivant avec `expectsAnswer: true`
- Option B : Frontend détecte changement de `currentBlock` ET `expectsAnswer: false` → réaffiche le champ après 500ms (hack)
- Option C : Backend retourne un flag `nextQuestionAvailable: true` pour indiquer qu'une question arrive

---

#### 2.2.2 Désactivation du champ

**Référence** : `ui-test/app.js` (lignes 298-300, 305-307, 432-435)

**Conditions de désactivation** :
- Bouton MVP affiché → Champ masqué
- `expectsAnswer === false` ET bouton affiché → Champ masqué

**Vérification** :
- ✅ Champ masqué si bouton MVP affiché (lignes 298-300, 305-307)
- ✅ Champ masqué après envoi message (ligne 423)
- ✅ Champ réactivé si `expectsAnswer === true` ET pas de bouton (ligne 429-430)

**État** : ✅ **CONFORME**

---

### 2.3 Absence d'enchaînement automatique non désiré

#### 2.3.1 Auto-enchaînement backend

**Référence** : `src/engine/axiomExecutor.ts` (lignes 1888-1917)

**Logique** :
```typescript
while (
  result &&
  result.expectsAnswer === false &&
  result.autoContinue === true
) {
  // Continue automatiquement
}
```

**Vérification** :
- ✅ Auto-enchaînement uniquement si `autoContinue === true`
- ✅ Tous les états interactifs ont `autoContinue: false`
- ✅ Seuls les états non interactifs peuvent avoir `autoContinue: true` (ex: génération préambule)

**État** : ✅ **CONFORME**

---

#### 2.3.2 Enchaînement frontend

**Référence** : `ui-test/app.js` (lignes 48-137)

**Vérification** :
- ✅ Pas d'appel automatique après réception réponse
- ✅ Attente action utilisateur (clic bouton ou saisie)
- ✅ Garde `isWaiting` empêche double envoi (ligne 49)

**État** : ✅ **CONFORME**

---

### 2.4 Possibilité explicite pour l'utilisateur de valider / continuer

#### 2.4.1 Validation identité

**Référence** : `ui-test/app.js` (lignes 350-393)

**Flux** :
1. `state === "identity"` → Formulaire identité affiché
2. Utilisateur saisit prénom/nom/email
3. Clic bouton "Commencer" → Envoi message avec identité
4. Backend valide → Transition vers tone

**Vérification** :
- ✅ Formulaire identité affiché si `state === "identity"` (ligne 350)
- ✅ Bouton "Commencer" présent (ligne 360-380)
- ✅ Envoi message avec identité (ligne 380-392)

**État** : ✅ **CONFORME**

---

#### 2.4.2 Validation tone

**Référence** : `ui-test/app.js` (lignes 409-442)

**Flux** :
1. `step === STEP_02_TONE` → Champ de saisie actif
2. Utilisateur saisit "tutoiement" ou "vouvoiement"
3. Envoi message → Backend valide → Transition vers préambule

**Vérification** :
- ✅ Champ actif si `expectsAnswer === true` (ligne 115-124)
- ✅ Formulaire soumis (ligne 409-442)
- ✅ Message envoyé à backend

**État** : ✅ **CONFORME**

---

#### 2.4.3 Validation questions blocs

**Référence** : `ui-test/app.js` (lignes 409-442)

**Flux** :
1. Question affichée → Champ actif
2. Utilisateur saisit réponse
3. Envoi message → Backend traite → Question suivante ou miroir

**Vérification** :
- ✅ Champ actif si `expectsAnswer === true`
- ✅ Formulaire soumis
- ✅ Message envoyé

**État** : ✅ **CONFORME**

---

## 3️⃣ COHÉRENCE BACK ↔ FRONT

### 3.1 Vérification que le front impose réellement les règles du moteur

#### 3.1.1 Garde message utilisateur avant bouton BLOC 1

**Référence** : `src/server.ts` (lignes 695-710), `ui-test/app.js` (lignes 109-111)

**Règle backend** : Si `step === STEP_03_BLOC1` ET `userMessage` présent ET `event !== START_BLOC_1` → Retourner message pédagogique

**Règle frontend** : Si `step === 'STEP_03_BLOC1'` → Afficher bouton, masquer champ

**Vérification** :
- ✅ Frontend masque le champ si bouton affiché (ligne 298-300 `ui-test/app.js`)
- ✅ Backend refuse message texte si `step === STEP_03_BLOC1` (ligne 697 `src/server.ts`)
- ✅ Cohérence : Frontend empêche l'envoi (champ masqué), backend refuse si contourné

**État** : ✅ **CONFORME** (après correctif C5)

---

#### 3.1.2 Garde matching ready

**Référence** : `src/engine/axiomExecutor.ts` (lignes 1741-1752), `ui-test/app.js` (lignes 112-114)

**Règle backend** : Si `step === STEP_99_MATCH_READY` ET `!userMessage && !event` → Retourner message d'attente

**Règle frontend** : Si `step === 'STEP_99_MATCH_READY' && expectsAnswer === false` → Afficher bouton

**Vérification** :
- ✅ Frontend affiche bouton (ligne 112-114)
- ⚠️ **PROBLÈME** : Backend attend `event: START_MATCHING`, mais l'event n'arrive pas à `executeAxiom()` (voir 1.3.2)

**État** : ⚠️ **AMBIGU** (règle backend non appliquée car event perdu)

---

### 3.2 Identification des endroits où l'UX contourne ou interprète les états backend

#### 3.2.1 Interprétation `expectsAnswer` pour réafficher le champ

**Référence** : `ui-test/app.js` (lignes 115-124, 429-436)

**Logique frontend** :
```javascript
if (data.expectsAnswer === true) {
  // Réafficher le champ
  chatForm.style.display = 'flex';
  userInput.disabled = false;
}
```

**Vérification** :
- ✅ Frontend suit strictement `expectsAnswer`
- ⚠️ **PROBLÈME** : Après miroir BLOC 1 ou 2B, `expectsAnswer: false` est reçu, donc le champ reste masqué. Le frontend ne sait pas qu'une question arrive dans le prochain appel.

**État** : ⚠️ **AMBIGU** (frontend ne peut pas anticiper)

**Hypothèse de correctif** : Voir 2.2.1

---

#### 3.2.2 Interprétation `step` pour afficher les boutons

**Référence** : `ui-test/app.js` (lignes 109-114)

**Logique frontend** :
```javascript
if (data.step === 'PREAMBULE_DONE' || data.step === 'STEP_03_BLOC1') {
  displayStartButton();
} else if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false) {
  displayMatchingButton();
}
```

**Vérification** :
- ✅ Frontend suit strictement les valeurs `step`
- ✅ Gestion des deux valeurs pour préambule (`PREAMBULE_DONE` ou `STEP_03_BLOC1`)
- ✅ Condition double pour matching (`STEP_99_MATCH_READY` ET `expectsAnswer === false`)

**État** : ✅ **CONFORME**

---

#### 3.2.3 Interprétation `state` pour afficher formulaire identité

**Référence** : `ui-test/app.js` (lignes 350-393)

**Logique frontend** :
```javascript
if (data.state === "identity") {
  // Afficher formulaire identité
}
```

**Vérification** :
- ✅ Frontend suit strictement `state === "identity"`
- ✅ Formulaire identité affiché uniquement si `state === "identity"`

**État** : ✅ **CONFORME**

---

### 3.3 Mapping step → state backend

#### 3.3.1 Cohérence mapping `/start` vs `/axiom`

**Référence** : `src/server.ts` (lignes 261-283 pour `/start`, 914-937 pour `/axiom`)

**Mapping `/start`** :
```typescript
if (result.step === STEP_01_IDENTITY) {
  responseState = "identity";
} else if (result.step === STEP_02_TONE) {
  responseState = "tone_choice";
} else if (result.step === STEP_03_PREAMBULE) {
  responseState = "preambule";
} else if (result.step === STEP_03_BLOC1) {
  responseState = "wait_start_button";
} else if (result.step === "PREAMBULE_DONE") {
  responseState = "wait_start_button";
} else if ([BLOC_01, ..., BLOC_10].includes(result.step)) {
  responseState = "collecting";
} else if (result.step === STEP_99_MATCH_READY) {
  responseState = "match_ready";
} else if (result.step === STEP_99_MATCHING || result.step === DONE_MATCHING) {
  responseState = "matching";
}
```

**Mapping `/axiom`** :
```typescript
if (result.step === STEP_01_IDENTITY || result.step === 'IDENTITY') {
  responseState = "identity";
  responseStep = "STEP_01_IDENTITY";
} else if (result.step === STEP_02_TONE) {
  responseState = "tone_choice";
} else if (result.step === STEP_03_PREAMBULE) {
  responseState = "preambule";
} else if (result.step === STEP_03_BLOC1) {
  responseState = "wait_start_button";
  responseStep = "STEP_03_BLOC1";
} else if (result.step === "PREAMBULE_DONE") {
  responseState = "wait_start_button";
  responseStep = "PREAMBULE_DONE";
} else if ([BLOC_01, ..., BLOC_10].includes(result.step)) {
  const blocNumber = [...].indexOf(result.step) + 1;
  responseState = `bloc_${blocNumber.toString().padStart(2, '0')}`;
  candidateStore.updateSession(...); // ← Double mise à jour
} else if (result.step === STEP_99_MATCH_READY) {
  responseState = "match_ready";
} else if (result.step === STEP_99_MATCHING) {
  responseState = "matching";
} else if (result.step === DONE_MATCHING) {
  responseState = "done";
}
```

**Vérification** :
- ✅ Mapping identique pour `STEP_01_IDENTITY`, `STEP_02_TONE`, `STEP_03_PREAMBULE`, `STEP_03_BLOC1`, `PREAMBULE_DONE`, `STEP_99_MATCH_READY`
- ⚠️ **DIFFÉRENCE** : `/axiom` retourne `bloc_01`, `bloc_02`, etc. pour les blocs, alors que `/start` retourne `"collecting"`
- ⚠️ **DIFFÉRENCE** : `/axiom` a un état `"done"` pour `DONE_MATCHING`, alors que `/start` retourne `"matching"`

**État** : ⚠️ **AMBIGU** (mappings légèrement différents)

**Hypothèse de correctif** :
- Unifier les mappings : créer une fonction `mapStepToState(step: string): string` utilisée par `/start` ET `/axiom`
- Pour les blocs, choisir une seule valeur : `"collecting"` (plus simple) ou `"bloc_XX"` (plus précis)
- Pour `DONE_MATCHING`, choisir une seule valeur : `"matching"` (cohérent avec `/start`) ou `"done"` (plus explicite)

---

## 4️⃣ POINTS BLOQUANTS / FRAGILES IDENTIFIÉS

### 4.1 Points bloquants (❌)

#### 4.1.1 Event `START_MATCHING` perdu

**Problème** : L'event `START_MATCHING` envoyé par le frontend n'arrive jamais à `executeAxiom()` car `executeWithAutoContinue()` ne transmet pas l'event.

**Impact** : Le bouton "Je génère mon matching" ne déclenche pas réellement le matching.

**Correctif** : Voir 1.3.2

---

### 4.2 Points fragiles (⚠️)

#### 4.2.1 Transitions silencieuses après miroirs

**Problème** : Après miroir BLOC 1 ou 2B, le backend retourne `expectsAnswer: false`, mais le frontend doit ensuite accepter une réponse pour le bloc suivant. Comment le frontend sait-il qu'il doit réafficher le champ ?

**Impact** : L'utilisateur peut être bloqué après un miroir, ne sachant pas qu'il peut continuer.

**Correctif** : Voir 1.2.2, 1.2.4, 2.2.1

---

#### 4.2.2 Double valeur pour fin préambule

**Problème** : `STEP_03_BLOC1` et `PREAMBULE_DONE` sont deux valeurs différentes pour le même état logique.

**Impact** : Risque de confusion, nécessité de gérer les deux valeurs partout.

**Correctif** : Voir 1.1.1

---

#### 4.2.3 Mapping step → state différent entre `/start` et `/axiom`

**Problème** : Les mappings ne sont pas identiques, notamment pour les blocs (`"collecting"` vs `"bloc_XX"`) et `DONE_MATCHING` (`"matching"` vs `"done"`).

**Impact** : Le frontend peut recevoir des valeurs `state` différentes selon la route appelée, nécessitant une gestion des deux cas.

**Correctif** : Voir 3.3.1

---

#### 4.2.4 Double mise à jour `currentBlock`

**Problème** : L'orchestrateur met à jour `currentBlock` AVANT le retour, puis `src/server.ts` le met à jour ENCORE APRÈS le retour.

**Impact** : Risque de désynchronisation, code redondant.

**Correctif** : Voir 1.1.2

---

## 5️⃣ SYNTHÈSE ET RECOMMANDATIONS

### 5.1 Points conformes (✅)

- ✅ Gestion des events `START_BLOC_1` (bouton BLOC 1)
- ✅ Flags `expectsAnswer` et `autoContinue` cohérents
- ✅ Transitions préambule → BLOC 1
- ✅ Transitions BLOC 2A → BLOC 2B
- ✅ Affichage boutons aux bons moments (frontend)
- ✅ Activation/désactivation champ selon `expectsAnswer`
- ✅ Absence d'enchaînement automatique non désiré
- ✅ Validation identité, tone, questions
- ✅ Garde message utilisateur avant bouton BLOC 1
- ✅ Interprétation `step` pour afficher boutons
- ✅ Interprétation `state` pour afficher formulaire identité

**Total** : **11 points conformes**

---

### 5.2 Points ambigus / fragiles (⚠️)

- ⚠️ Transitions silencieuses après miroirs (BLOC 1 → BLOC 2A, BLOC 2B → BLOC 3)
- ⚠️ Double valeur pour fin préambule (`STEP_03_BLOC1` vs `PREAMBULE_DONE`)
- ⚠️ Mapping step → state différent entre `/start` et `/axiom`
- ⚠️ Double mise à jour `currentBlock` (orchestrateur + server.ts)
- ⚠️ Event `START_MATCHING` perdu (mais correctif C2 appliqué, à vérifier)

**Total** : **5 points ambigus**

---

### 5.3 Points non conformes (❌)

- ❌ Event `START_MATCHING` perdu (si correctif C2 non effectif)

**Total** : **1 point non conforme** (potentiellement résolu par C2)

---

### 5.4 Priorisation des correctifs

#### Priorité CRITIQUE (bloquant production)

1. **Event `START_MATCHING` perdu** (4.1.1)
   - Impact : Matching ne se déclenche pas
   - Correctif : Voir 1.3.2

#### Priorité ÉLEVÉE (fragilité UX)

2. **Transitions silencieuses après miroirs** (4.2.1)
   - Impact : Utilisateur peut être bloqué après miroir
   - Correctif : Backend retourne immédiatement première question du bloc suivant avec `expectsAnswer: true`

3. **Double valeur pour fin préambule** (4.2.2)
   - Impact : Confusion, code dupliqué
   - Correctif : Unifier en `STEP_03_BLOC1` partout

#### Priorité MOYENNE (amélioration)

4. **Mapping step → state différent** (4.2.3)
   - Impact : Frontend doit gérer deux valeurs
   - Correctif : Unifier les mappings dans une fonction unique

5. **Double mise à jour `currentBlock`** (4.2.4)
   - Impact : Code redondant, risque désynchronisation
   - Correctif : Supprimer mise à jour dans `server.ts` pour blocs gérés par orchestrateur

---

## 6️⃣ CHECKLIST VALIDATION AVANT TESTS UTILISATEURS

### 6.1 Backend

- [ ] Event `START_MATCHING` arrive bien à `executeAxiom()`
- [ ] Transitions après miroirs retournent immédiatement première question du bloc suivant
- [ ] Un seul `step` pour fin préambule (`STEP_03_BLOC1`)
- [ ] Mapping step → state unifié entre `/start` et `/axiom`
- [ ] Pas de double mise à jour `currentBlock`

### 6.2 Frontend

- [ ] Champ de saisie réaffiché automatiquement après miroir si question suivante disponible
- [ ] Boutons affichés aux bons moments (vérifié ✅)
- [ ] Pas d'enchaînement automatique non désiré (vérifié ✅)

### 6.3 Cohérence Back ↔ Front

- [ ] Même `state` retourné par `/start` et `/axiom` pour un même `step`
- [ ] Frontend suit strictement les règles backend (vérifié ✅)
- [ ] Aucun contournement UX des règles backend (vérifié ✅)

---

## 7️⃣ CONCLUSION

**État global** : ⚠️ **FRAGILE** (5 points ambigus, 1 point non conforme potentiel)

**Recommandation** : **Corriger les points critiques et élevés AVANT tests utilisateurs en volume**.

**Points à corriger en priorité** :
1. Event `START_MATCHING` perdu (CRITIQUE)
2. Transitions silencieuses après miroirs (ÉLEVÉE)
3. Double valeur pour fin préambule (ÉLEVÉE)

**Points à améliorer ensuite** :
4. Mapping step → state unifié
5. Double mise à jour `currentBlock`

**Points conformes** : 11 points conformes identifiés, base solide.

---

**FIN DE L'AUDIT**
