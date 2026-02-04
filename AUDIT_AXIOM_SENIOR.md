# 🔍 AUDIT SENIOR EXHAUSTIF — AXIOM ENGINE
**Date** : 2025-01-27  
**Objectif** : Cartographie complète de l'état actuel, identification des causes racines, priorisation stricte des corrections

---

## 1) ÉTAT ACTUEL — Cartographie

### 1.1 Schéma des routes

#### **GET `/start`** (`src/server.ts:85-252`)
**Rôle** : Point d'entrée initial, lecture d'état + auto-enchaînement si nécessaire

**Flux d'exécution** :
1. **Lecture sessionId** (lignes 109-121)
   - Header `x-session-id` (prioritaire)
   - Query param `sessionId` (fallback)
   - Génération `uuidv4()` si aucun

2. **Récupération candidate** (lignes 123-137)
   - `candidateStore.get(finalSessionId)` (synchrone)
   - `candidateStore.getAsync(finalSessionId)` (asynchrone, Redis/file)
   - **CRÉATION NOUVELLE SESSION** si :
     - `sessionIdHeaderTrim !== "" && !candidate` → **sessionReset = true** (ligne 130-134)
     - `!candidate` → création normale (ligne 136)

3. **Vérification identité** (lignes 148-176)
   - Si identité incomplète → **FORCE** `STEP_01_IDENTITY` (ligne 150)
   - **MUTATION** : `updateUIState(STEP_01_IDENTITY)` (ligne 150)

4. **Garde anti-régression** (lignes 179-191)
   - Si `currentStep === STEP_03_BLOC1 || currentStep === "PREAMBULE_DONE"` → **RETURN IMMÉDIAT**
   - **LECTURE SEULE** : ne modifie pas l'état

5. **Auto-enchaînement** (ligne 194)
   - Appelle `executeWithAutoContinue(candidate)` **SANS userMessage**
   - **RISQUE** : peut réinitialiser si `candidate.session.ui` est null

6. **Mapping réponse** (lignes 196-222)
   - Convertit `result.step` → `responseState` + `responseStep`
   - **INCOHÉRENCE** : ligne 183 retourne `STEP_03_BLOC1` mais ligne 211 peut retourner `"PREAMBULE_DONE"`

#### **POST `/axiom`** (`src/server.ts:255-692`)
**Rôle** : Traitement des messages utilisateur + événements

**Flux d'exécution** :

1. **Parsing identité depuis message** (lignes 291-409)
   - Si format "Prénom: X\nNom: Y\nEmail: Z" → **MUTATION** identité
   - **MUTATION** : `updateUIState(STEP_02_TONE)` (ligne 360)
   - Appelle `executeWithAutoContinue(candidate)` (ligne 375)

2. **Parsing identité depuis body.identity** (lignes 412-516)
   - **MUTATION** : `updateUIState(STEP_02_TONE)` (ligne 472)
   - Appelle `executeWithAutoContinue(candidate)` (ligne 487)
   - **MUTATION** : `updateSession({ state: "preamble" })` (ligne 494)

3. **Récupération candidate générique** (lignes 519-532)
   - `candidateStore.get(sessionId)` → `getAsync(sessionId)` → `create(sessionId, tenantId)`
   - **CRÉATION NOUVELLE SESSION** si candidate absent (ligne 524)

4. **Vérification identité** (lignes 536-550)
   - Si identité incomplète → **FORCE** `STEP_01_IDENTITY` (ligne 537)
   - **MUTATION** : `updateUIState(STEP_01_IDENTITY)` (ligne 537)

5. **Initialisation UI si null** (lignes 553-570)
   - **RISQUE CRITIQUE** : Si `!candidate.session.ui` → **MUTATION** vers `STEP_02_TONE` ou `STEP_01_IDENTITY` (ligne 554)
   - **RÉGRESSION POSSIBLE** : Un candidat avancé peut être réinitialisé ici

6. **Handler START_BLOC_1** (lignes 573-610)
   - Appelle `executeAxiom({ candidate, userMessage: null, event: "START_BLOC_1" })` (ligne 575)
   - **LECTURE** : Recharge candidate après (lignes 577-580)

7. **Traitement message utilisateur** (lignes 613-677)
   - Appelle `executeWithAutoContinue(candidate, userMessageText)` (ligne 614)
   - **MUTATION** : `updateSession({ state: "collecting", currentBlock: blocNumber })` (ligne 646)

### 1.2 Sources de vérité de l'état

#### **`candidate.session.ui.step`** (source primaire)
- **Définition** : `src/types/candidate.ts` (interface `CandidateSession`)
- **Lecture** :
  - `src/server.ts:179` (`/start`)
  - `src/server.ts:553` (`/axiom`)
  - `src/engine/axiomExecutor.ts:969` (init dans `executeAxiom`)
- **Écriture** :
  - `src/store/sessionStore.ts:320-355` (`updateUIState`)
  - `src/engine/axiomExecutor.ts:1018` (STEP_01_IDENTITY → STEP_02_TONE)
  - `src/engine/axiomExecutor.ts:1084` (STEP_02_TONE → STEP_03_PREAMBULE)
  - `src/engine/axiomExecutor.ts:1198` (STEP_03_PREAMBULE → STEP_03_BLOC1)
  - `src/engine/axiomExecutor.ts:1222` (STEP_03_BLOC1 → BLOC_01)
  - `src/server.ts:150, 360, 472, 537` (forçage depuis routes)

#### **`result.step`** (source secondaire, retour du moteur)
- **Définition** : `src/engine/axiomExecutor.ts` (interface `ExecuteAxiomResult`)
- **Génération** : `executeAxiom()` retourne `step` selon l'état FSM
- **Utilisation** :
  - `src/server.ts:198` (`/start` mapping)
  - `src/server.ts:405, 511, 606, 674` (`/axiom` retour)

#### **`state` renvoyé au frontend** (source dérivée)
- **Génération** : Mapping depuis `result.step` dans les routes
- **Mapping `/start`** : lignes 200-222
- **Mapping `/axiom`** : lignes 377-390, 489-492, 596-599, 630-653
- **INCOHÉRENCE** : Les mappings ne sont pas identiques entre `/start` et `/axiom`

### 1.3 Endroits où l'état peut être initialisé

1. **`src/store/sessionStore.ts:90-120`** (`create`)
   - Initialise `session.state = hasIdentity ? 'collecting' : 'identity'`
   - **PAS d'initialisation de `session.ui`** → sera null

2. **`src/server.ts:553-570`** (`/axiom` — initialisation UI)
   - Si `!candidate.session.ui` → `updateUIState(STEP_02_TONE | STEP_01_IDENTITY)`
   - **RISQUE** : Peut réinitialiser un candidat avancé si `ui` est null

3. **`src/engine/axiomExecutor.ts:969-973`** (`executeAxiom` — fallback)
   - Si `!candidate.session.ui` → crée un objet temporaire (non persisté)
   - `step: candidate.identity.completedAt ? STEP_02_TONE : STEP_01_IDENTITY`

### 1.4 Endroits où l'état peut être modifié

1. **`src/store/sessionStore.ts:320-355`** (`updateUIState`)
   - **TOUS les appels** modifient `candidate.session.ui.step`
   - Appels depuis :
     - `src/server.ts:150, 360, 472, 537` (forçage routes)
     - `src/engine/axiomExecutor.ts:1018, 1084, 1198, 1222` (transitions FSM)

2. **`src/store/sessionStore.ts:203-228`** (`updateSession`)
   - Modifie `candidate.session.state` et `candidate.session.currentBlock`
   - Appels depuis :
     - `src/server.ts:389, 494, 646` (`/axiom`)
     - `src/engine/axiomExecutor.ts:1230` (START_BLOC_1)

### 1.5 Endroits où l'état peut être réinitialisé/overwrité

1. **`src/server.ts:148-176`** (`/start` — forçage identity)
   - **OVERWRITE** : `updateUIState(STEP_01_IDENTITY)` si identité incomplète
   - **RÉGRESSION** : Peut réinitialiser même si candidat était avancé

2. **`src/server.ts:536-550`** (`/axiom` — forçage identity)
   - **OVERWRITE** : `updateUIState(STEP_01_IDENTITY)` si identité incomplète
   - **RÉGRESSION** : Même problème

3. **`src/server.ts:553-570`** (`/axiom` — initialisation UI)
   - **OVERWRITE** : `updateUIState(STEP_02_TONE | STEP_01_IDENTITY)` si `!candidate.session.ui`
   - **RÉGRESSION CRITIQUE** : Un candidat en `BLOC_01` peut être réinitialisé à `STEP_02_TONE`

4. **`src/server.ts:130-134`** (`/start` — sessionReset)
   - **CRÉATION NOUVELLE SESSION** si `sessionIdHeaderTrim !== "" && !candidate`
   - **PERD TOUT L'ÉTAT** : Nouveau `finalSessionId`, nouveau candidate

---

## 2) REPRODUCTION FIABLE — "Comment je peux le casser à coup sûr"

### 2.1 Scénario 1 : Boucle tutoie/vouvoie après refresh

**Procédure** :
1. Utilisateur complète identité → répond "tutoiement" → préambule affiché → bouton "Je commence mon profil" visible
2. **Refresh de la page** (F5)
3. Frontend appelle `GET /start` avec `x-session-id: <sessionId>`
4. Backend :
   - Récupère candidate (ligne 123-126)
   - Vérifie identité (OK, ligne 148)
   - Vérifie `currentStep` (ligne 179) : Si `STEP_03_BLOC1` → return immédiat (ligne 181-190) ✅
   - **MAIS** : Si `candidate.session.ui` est **null** (perte store) → passe ligne 179
   - Appelle `executeWithAutoContinue(candidate)` (ligne 194)
   - Dans `executeAxiom`, ligne 969 : `const ui = candidate.session.ui || { step: STEP_02_TONE, ... }`
   - **RÉSULTAT** : Retourne à `STEP_02_TONE` → question tone réaffichée

**Preuve code** :
- `src/server.ts:194` : Appelle `executeWithAutoContinue` même si UI null
- `src/engine/axiomExecutor.ts:969-973` : Fallback vers `STEP_02_TONE` si `ui` null

**Observation Network** :
- `GET /start` → `step: "STEP_02_TONE"`, `state: "tone_choice"`
- Frontend affiche question tone (ligne 294 `ui-test/app.js`)

### 2.2 Scénario 2 : Retour arrière depuis BLOC_01 vers STEP_02_TONE

**Procédure** :
1. Utilisateur est en `BLOC_01` (répondu à plusieurs questions)
2. **Perte store** (Redis/file) → `candidate.session.ui` devient `null`
3. Utilisateur envoie un message → `POST /axiom`
4. Backend :
   - Récupère candidate (ligne 519-524)
   - Vérifie identité (OK, ligne 536)
   - **LIGNE 553** : `if (!candidate.session.ui)` → **TRUE**
   - **LIGNE 554** : `const initialState = candidate.identity.completedAt ? STEP_02_TONE : STEP_01_IDENTITY`
   - **LIGNE 555** : `updateUIState(STEP_02_TONE)` → **OVERWRITE**
   - Appelle `executeWithAutoContinue(candidate, userMessageText)` (ligne 614)
   - Dans `executeAxiom`, ligne 1036 : `if (currentState === STEP_02_TONE)` → **TRUE**
   - **RÉSULTAT** : Question tone réaffichée

**Preuve code** :
- `src/server.ts:553-570` : Initialisation UI peut overwrite un état avancé

**Observation Network** :
- `POST /axiom` → `step: "STEP_02_TONE"`, `state: "tone_choice"`
- Frontend affiche question tone

### 2.3 Scénario 3 : Double appel `/start` crée nouvelle session

**Procédure** :
1. Utilisateur a un `sessionId` valide en localStorage
2. **Premier appel** `GET /start?tenant=X&poste=Y` avec `x-session-id: <sessionId>`
   - Candidate trouvé → retourne état actuel
3. **Deuxième appel** `GET /start?tenant=X&poste=Y` avec `x-session-id: <sessionId>` (rapide, double-click)
   - Si store perdu entre les deux appels → ligne 130 : `sessionIdHeaderTrim !== "" && !candidate` → **TRUE**
   - **LIGNE 132** : `finalSessionId = uuidv4()` → **NOUVEAU SESSIONID**
   - **LIGNE 133** : `candidateStore.create(finalSessionId, tenant)` → **NOUVEAU CANDIDATE**
   - **RÉSULTAT** : Perte de l'état, nouveau candidat créé

**Preuve code** :
- `src/server.ts:130-134` : Création nouvelle session si header présent mais candidate absent

**Observation Network** :
- `GET /start` → `sessionId: <nouveau>`, `sessionReset: true`
- Frontend adopte nouveau `sessionId` (ligne 281 `ui-test/app.js`)

### 2.4 Scénario 4 : `/start` après préambule relance le moteur

**Procédure** :
1. Utilisateur est en `STEP_03_BLOC1` (bouton visible)
2. Utilisateur refresh → `GET /start`
3. Backend :
   - Ligne 179 : `const currentStep = candidate.session.ui?.step`
   - Si `currentStep === STEP_03_BLOC1` → return immédiat (ligne 181) ✅
   - **MAIS** : Si `currentStep === "PREAMBULE_DONE"` (ancien format) → return immédiat (ligne 181) ✅
   - **MAIS** : Si `currentStep` est `null` ou `undefined` → passe ligne 179
   - Appelle `executeWithAutoContinue(candidate)` (ligne 194)
   - Dans `executeAxiom`, ligne 969 : fallback vers `STEP_02_TONE`
   - **RÉSULTAT** : Retour à tone

**Preuve code** :
- `src/server.ts:179-191` : Garde incomplète (ne couvre pas `null`)

---

## 3) RACINES — Causes classées par probabilité

### 🔴 Cause racine #1 : Initialisation UI peut overwrite un état avancé
**Probabilité** : **TRÈS ÉLEVÉE** (se produit à chaque perte store)

**Preuve code** :
```typescript
// src/server.ts:553-570
if (!candidate.session.ui) {
  const initialState = candidate.identity.completedAt ? STEP_02_TONE : STEP_01_IDENTITY;
  candidateStore.updateUIState(candidate.candidateId, {
    step: initialState, // ← OVERWRITE SANS VÉRIFIER L'ÉTAT ACTUEL
    lastQuestion: null,
    identityDone: !!candidate.identity.completedAt,
  });
}
```

**Scénario qui l'active** :
- Perte store (Redis/file) → `candidate.session.ui` devient `null`
- Appel `/axiom` ou `/start` → initialisation UI déclenchée
- **Impact** : Candidat en `BLOC_01` → réinitialisé à `STEP_02_TONE`

**Impact exact** :
- `candidate.session.ui.step` passe de `BLOC_01` à `STEP_02_TONE`
- Question tone réaffichée
- Réponses aux blocs perdues (mais `candidate.answers` peut être préservé si store partiel)

**Symptôme** : Boucle tone, retour arrière

---

### 🔴 Cause racine #2 : `/start` appelle `executeWithAutoContinue` même si UI null
**Probabilité** : **ÉLEVÉE** (se produit après refresh si store perdu)

**Preuve code** :
```typescript
// src/server.ts:193-194
// Si identité complétée, continuer normalement avec auto-enchaînement
const result = await executeWithAutoContinue(candidate);
```

**Scénario qui l'active** :
- Refresh après préambule
- Store perdu → `candidate.session.ui` est `null`
- Ligne 179 : `currentStep` est `undefined` → passe la garde
- Ligne 194 : Appelle `executeWithAutoContinue`
- Dans `executeAxiom`, ligne 969 : fallback vers `STEP_02_TONE`

**Impact exact** :
- Retour à `STEP_02_TONE`
- Question tone réaffichée

**Symptôme** : Boucle tone après refresh

---

### 🟡 Cause racine #3 : Garde anti-régression `/start` incomplète
**Probabilité** : **MOYENNE** (se produit si `currentStep` est `null` ou valeur inattendue)

**Preuve code** :
```typescript
// src/server.ts:179-191
const currentStep = candidate.session.ui?.step;
if (currentStep === STEP_03_BLOC1 || currentStep === "PREAMBULE_DONE") {
  return res.status(200).json({ ... });
}
// ← PAS DE ELSE : continue même si currentStep est null/undefined
```

**Scénario qui l'active** :
- `candidate.session.ui` est `null` → `currentStep` est `undefined`
- Garde ne match pas → continue ligne 194
- Appelle `executeWithAutoContinue` → réinitialise

**Impact exact** :
- Retour à un état antérieur (tone ou identity)

**Symptôme** : Retour arrière après refresh

---

### 🟡 Cause racine #4 : `sessionReset` crée nouvelle session sans vérifier l'historique
**Probabilité** : **MOYENNE** (se produit si store perdu mais header présent)

**Preuve code** :
```typescript
// src/server.ts:130-134
if (sessionIdHeaderTrim !== "" && !candidate) {
  finalSessionId = uuidv4(); // ← NOUVEAU SESSIONID
  candidate = candidateStore.create(finalSessionId, tenant as string);
  sessionReset = true;
}
```

**Scénario qui l'active** :
- Utilisateur a un `sessionId` valide
- Store perdu (redémarrage Railway, scaling)
- Appel `/start` avec header → candidate absent
- **CRÉATION NOUVELLE SESSION** au lieu de restaurer depuis Redis/file

**Impact exact** :
- Perte totale de l'état
- Nouveau `sessionId` → frontend adopte (ligne 281 `ui-test/app.js`)
- Candidat doit recommencer depuis identity

**Symptôme** : Perte de session, retour à identity

---

### 🟢 Cause racine #5 : Mapping `/start` et `/axiom` incohérent
**Probabilité** : **FAIBLE** (impact UX, pas de régression d'état)

**Preuve code** :
```typescript
// src/server.ts:209-214 (/start)
} else if (result.step === STEP_03_BLOC1) {
  responseState = "wait_start_button";
  responseStep = "STEP_03_BLOC1";
} else if (result.step === "PREAMBULE_DONE") {
  responseState = "wait_start_button";
  responseStep = "PREAMBULE_DONE";
}

// src/server.ts:637-642 (/axiom)
} else if (result.step === STEP_03_BLOC1) {
  responseState = "wait_start_button";
  responseStep = "STEP_03_BLOC1";
} else if (result.step === "PREAMBULE_DONE") {
  responseState = "wait_start_button";
  responseStep = "PREAMBULE_DONE";
}
```

**Scénario qui l'active** :
- Même `result.step` peut être mappé différemment selon la route
- Frontend reçoit `step` différent pour le même état

**Impact exact** :
- Frontend peut ne pas reconnaître l'état
- Bouton peut ne pas s'afficher

**Symptôme** : Bouton disparaît, UI incohérente

---

## 4) PRIORITÉS NON NÉGOCIABLES — Ordre de stabilisation

### 🎯 Priorité A (BLOQUANTE) : Empêcher les retours en arrière

**Question** : Une fois atteint un état avancé (ex: `STEP_03_BLOC1` / bouton), aucune route ne doit pouvoir revenir en arrière. Est-ce vrai aujourd'hui ?

**Réponse** : **NON**. Voici où ça casse :

1. **`src/server.ts:553-570`** (`/axiom` — initialisation UI)
   - **PROBLÈME** : Overwrite `STEP_02_TONE` même si candidat était en `BLOC_01`
   - **CORRECTION** : Vérifier `candidate.answers.length > 0` ou `candidate.session.currentBlock > 0` avant d'initialiser

2. **`src/server.ts:194`** (`/start` — auto-enchaînement)
   - **PROBLÈME** : Appelle `executeWithAutoContinue` même si `candidate.session.ui` est null
   - **CORRECTION** : Vérifier `candidate.session.ui?.step` avant d'appeler, ou initialiser depuis `candidate.answers`

3. **`src/engine/axiomExecutor.ts:969-973`** (`executeAxiom` — fallback)
   - **PROBLÈME** : Fallback vers `STEP_02_TONE` si `ui` null, sans vérifier l'historique
   - **CORRECTION** : Dériver l'état depuis `candidate.answers` ou `candidate.session.currentBlock`

**Qu'est-ce qui peut "rejouer" le tone ?**
- Initialisation UI (`src/server.ts:553-570`)
- Fallback dans `executeAxiom` (`src/engine/axiomExecutor.ts:969-973`)
- Appel `/start` après perte store (`src/server.ts:194`)

**Ordre de correction** :
1. **Corriger initialisation UI** (`src/server.ts:553-570`) → **PRIORITÉ ABSOLUE**
2. **Corriger garde `/start`** (`src/server.ts:179-191`) → Ajouter vérification `null`
3. **Corriger fallback `executeAxiom`** (`src/engine/axiomExecutor.ts:969-973`) → Dériver depuis historique

---

### 🎯 Priorité B : SessionId stable — Pas de nouveau candidat involontaire

**Tous les cas où `finalSessionId` peut changer** :

1. **`src/server.ts:130-134`** (`/start` — sessionReset)
   - **Condition** : `sessionIdHeaderTrim !== "" && !candidate`
   - **Action** : `finalSessionId = uuidv4()`
   - **PROBLÈME** : Crée nouvelle session même si candidate existe dans Redis/file mais pas encore chargé
   - **CORRECTION** : Attendre `getAsync()` avant de décider de créer

2. **`src/server.ts:120`** (`/start` — génération initiale)
   - **Condition** : Aucun `sessionId` fourni
   - **Action** : `finalSessionId = uuidv4()`
   - **OK** : Comportement attendu pour nouvelle session

**Tous les cas où un candidate est recréé** :

1. **`src/server.ts:524`** (`/axiom` — création si absent)
   - **Condition** : `!candidate` après `get()` et `getAsync()`
   - **Action** : `candidateStore.create(sessionId, tenantId)`
   - **RISQUE** : Si `sessionId` est invalide/corrompu, crée nouveau candidate avec même ID
   - **CORRECTION** : Vérifier validité `sessionId` avant création

2. **`src/server.ts:133, 136`** (`/start` — création)
   - **Condition** : `!candidate` après `get()` et `getAsync()`
   - **Action** : `candidateStore.create(finalSessionId, tenant)`
   - **OK** : Comportement attendu si vraiment nouvelle session

**Ordre de correction** :
1. **Corriger sessionReset** (`src/server.ts:130-134`) → Attendre `getAsync()` avant décision
2. **Valider sessionId** (`src/server.ts:524`) → Vérifier format avant création

---

### 🎯 Priorité C : Cohérence `/start` et `/axiom`

**Mappings actuels** :

| `result.step` | `/start` → `responseState` | `/axiom` → `responseState` | Cohérence |
|---------------|---------------------------|----------------------------|-----------|
| `STEP_01_IDENTITY` | `"identity"` (ligne 201) | `"identity"` (ligne 631) | ✅ |
| `STEP_02_TONE` | `"tone_choice"` (ligne 204) | `"tone_choice"` (ligne 634) | ✅ |
| `STEP_03_PREAMBULE` | `"preambule"` (ligne 207) | `"preambule"` (ligne 636) | ✅ |
| `STEP_03_BLOC1` | `"wait_start_button"` (ligne 210) | `"wait_start_button"` (ligne 638) | ✅ |
| `"PREAMBULE_DONE"` | `"wait_start_button"` (ligne 213) | `"wait_start_button"` (ligne 641) | ✅ |
| `BLOC_01` à `BLOC_10` | `"collecting"` (ligne 216) | `"bloc_XX"` (ligne 644-645) | ❌ **INCOHÉRENT** |
| `STEP_99_MATCH_READY` | `"match_ready"` (ligne 219) | `"match_ready"` (ligne 648) | ✅ |
| `STEP_99_MATCHING` | `"matching"` (ligne 221) | `"matching"` (ligne 650) | ✅ |

**Problème** :
- `/start` retourne `state: "collecting"` pour tous les blocs
- `/axiom` retourne `state: "bloc_01"`, `"bloc_02"`, etc.
- **Impact** : Frontend peut ne pas reconnaître l'état après refresh

**Ordre de correction** :
1. **Unifier mapping blocs** → Utiliser même format (`"bloc_XX"` ou `"collecting"`)
2. **Extraire fonction commune** → Éviter duplication

---

### 🎯 Priorité D : Persistance du store

**État actuel** :
- Redis si `REDIS_URL` présent (`src/store/sessionStore.ts:13-27`)
- File fallback (`/tmp/axiom_store.json`) si pas Redis (`src/store/sessionStore.ts:61-88`)
- Persistance après chaque mutation (`persistCandidate()` appelé partout)

**Est-ce réellement indispensable maintenant ?**
- **OUI** pour Railway (redémarrage, scaling, cold start)
- **MAIS** : La persistance ne résout pas les bugs d'initialisation UI

**Risques Railway** :
- **Redémarrage** : Store perdu si pas Redis → file `/tmp` peut être effacé
- **Scaling** : Multi-instances → file local ne partage pas entre instances
- **Cold start** : File peut être absent au démarrage

**Ordre de correction** :
1. **Stabiliser initialisation UI** (Priorité A) → **AVANT** d'optimiser persistance
2. **Valider Redis/file** → Tester scénarios Railway
3. **Ajouter fallback** → Si persistance échoue, ne pas perdre l'état en mémoire

---

## 5) CHECKLIST "ÇA MARCHE À 100%" — Critères de sortie

### ✅ Test 1 : Parcours complet sans refresh

**Requêtes attendues** :
1. `GET /start?tenant=X&poste=Y` (sans `x-session-id`)
2. `POST /axiom` avec identité (format "Prénom: X\nNom: Y\nEmail: Z")
3. `POST /axiom` avec réponse tone ("tutoiement")
4. `POST /axiom` avec `event: "START_BLOC_1"`
5. `POST /axiom` avec réponses blocs (10+ messages)

**Step/state attendus** :
- 1 → `step: "STEP_01_IDENTITY"`, `state: "identity"`
- 2 → `step: "STEP_02_TONE"`, `state: "tone_choice"`
- 3 → `step: "STEP_03_PREAMBULE"` → `"STEP_03_BLOC1"`, `state: "preambule"` → `"wait_start_button"`
- 4 → `step: "BLOC_01"`, `state: "collecting"` (ou `"bloc_01"`)
- 5 → `step: "BLOC_02"` à `"BLOC_10"`, `state: "collecting"` (ou `"bloc_XX"`)

**Condition de succès** :
- Aucun retour à un état antérieur
- Aucune question tone répétée
- Bouton "Je commence mon profil" apparaît après préambule
- Progression linéaire sans saut

---

### ✅ Test 2 : Refresh après préambule

**Requêtes attendues** :
1. Parcours jusqu'à préambule (bouton visible)
2. **Refresh page** (F5)
3. `GET /start?tenant=X&poste=Y` avec `x-session-id: <sessionId>`

**Step/state attendus** :
- 3 → `step: "STEP_03_BLOC1"` (ou `"PREAMBULE_DONE"`), `state: "wait_start_button"`, `response: ""`

**Condition de succès** :
- **PAS** de retour à `STEP_02_TONE`
- **PAS** de question tone réaffichée
- Bouton "Je commence mon profil" reste visible
- `sessionId` identique

---

### ✅ Test 3 : Double chargement / double call `/start`

**Requêtes attendues** :
1. `GET /start?tenant=X&poste=Y` avec `x-session-id: <sessionId>`
2. **Immédiatement** : `GET /start?tenant=X&poste=Y` avec `x-session-id: <sessionId>` (double-click)

**Step/state attendus** :
- 1 et 2 → Même `step`, même `state`, même `sessionId`

**Condition de succès** :
- **PAS** de création nouvelle session
- **PAS** de `sessionReset: true`
- État identique entre les deux appels

---

### ✅ Test 4 : Session perdue (simulateur : redémarrage process)

**Procédure** :
1. Parcours jusqu'à `BLOC_03` (3 réponses)
2. **Simuler perte store** : Vider Redis/file, redémarrer process
3. `GET /start?tenant=X&poste=Y` avec `x-session-id: <sessionId>`

**Step/state attendus** :
- 3 → `step: "BLOC_03"` (ou état dérivé depuis `candidate.answers`), `state: "collecting"`

**Condition de succès** :
- **PAS** de retour à `STEP_02_TONE` ou `STEP_01_IDENTITY`
- État dérivé depuis `candidate.answers.length` ou `candidate.session.currentBlock`
- **OU** : Si vraiment perdu → `sessionReset: true` avec nouveau `sessionId` (acceptable)

---

### ✅ Test 5 : Cohérence step/state entre `/start` et `/axiom`

**Requêtes attendues** :
1. `GET /start?tenant=X&poste=Y` avec `x-session-id: <sessionId>` → `step: "BLOC_03"`, `state: "collecting"`
2. `POST /axiom` avec message → `step: "BLOC_03"`, `state: "collecting"` (ou `"bloc_03"`)

**Step/state attendus** :
- Même format `state` pour même `step`

**Condition de succès** :
- Format `state` identique entre `/start` et `/axiom`
- Frontend reconnaît l'état de manière cohérente

---

## 6) PISTES DE SOLUTION (sans implémenter)

### 🔧 Piste 1 : Corriger initialisation UI avec garde anti-régression

**Fichier(s) concerné(s)** :
- `src/server.ts:553-570`

**Principe de la modif** :
```typescript
// AVANT
if (!candidate.session.ui) {
  const initialState = candidate.identity.completedAt ? STEP_02_TONE : STEP_01_IDENTITY;
  candidateStore.updateUIState(candidate.candidateId, { step: initialState, ... });
}

// APRÈS
if (!candidate.session.ui) {
  // Dériver l'état depuis l'historique
  let initialState: string;
  if (candidate.session.currentBlock > 0) {
    // Candidat avancé → dériver depuis currentBlock
    initialState = `BLOC_${String(candidate.session.currentBlock).padStart(2, '0')}`;
  } else if (candidate.answers.length > 0) {
    // Réponses présentes → dériver depuis dernier bloc
    initialState = STEP_03_BLOC1; // ou dériver depuis answers
  } else if (candidate.tonePreference) {
    // Tone choisi → préambule ou bouton
    initialState = STEP_03_BLOC1;
  } else if (candidate.identity.completedAt) {
    initialState = STEP_02_TONE;
  } else {
    initialState = STEP_01_IDENTITY;
  }
  candidateStore.updateUIState(candidate.candidateId, { step: initialState, ... });
}
```

**Risque de régression** :
- **FAIBLE** : Logique additive, ne casse pas les cas existants
- **TEST** : Vérifier que nouveau candidat démarre toujours à `STEP_01_IDENTITY`

**Pourquoi prioritaire** :
- **PRIORITÉ A** : Bloque les retours en arrière
- **Impact** : Résout scénarios 1, 2, 4

---

### 🔧 Piste 2 : Améliorer garde anti-régression `/start`

**Fichier(s) concerné(s)** :
- `src/server.ts:179-191`

**Principe de la modif** :
```typescript
// AVANT
const currentStep = candidate.session.ui?.step;
if (currentStep === STEP_03_BLOC1 || currentStep === "PREAMBULE_DONE") {
  return res.status(200).json({ ... });
}

// APRÈS
const currentStep = candidate.session.ui?.step;
// Vérifier aussi depuis l'historique si UI null
const derivedStep = candidate.session.ui?.step || 
  (candidate.session.currentBlock > 0 ? `BLOC_${String(candidate.session.currentBlock).padStart(2, '0')}` : null) ||
  (candidate.answers.length > 0 ? STEP_03_BLOC1 : null);

if (derivedStep === STEP_03_BLOC1 || derivedStep === "PREAMBULE_DONE" || 
    (derivedStep && derivedStep.startsWith('BLOC_'))) {
  // Candidat avancé → ne pas relancer le moteur
  return res.status(200).json({
    sessionId: finalSessionId,
    step: derivedStep,
    state: derivedStep.startsWith('BLOC_') ? "collecting" : "wait_start_button",
    response: "",
    expectsAnswer: false,
    autoContinue: false,
    currentBlock: candidate.session.currentBlock,
    ...(sessionReset ? { sessionReset: true } : {}),
  });
}
```

**Risque de régression** :
- **FAIBLE** : Logique additive, garde existante préservée
- **TEST** : Vérifier que nouveau candidat peut toujours progresser

**Pourquoi prioritaire** :
- **PRIORITÉ A** : Bloque les retours en arrière après refresh
- **Impact** : Résout scénario 1

---

### 🔧 Piste 3 : Corriger fallback `executeAxiom` avec dérivation depuis historique

**Fichier(s) concerné(s)** :
- `src/engine/axiomExecutor.ts:969-973`

**Principe de la modif** :
```typescript
// AVANT
const ui = candidate.session.ui || {
  step: candidate.identity.completedAt ? STEP_02_TONE : STEP_01_IDENTITY,
  lastQuestion: null,
  identityDone: !!candidate.identity.completedAt,
};

// APRÈS
let ui = candidate.session.ui;
if (!ui) {
  // Dériver depuis l'historique
  let derivedStep: string;
  if (candidate.session.currentBlock > 0) {
    derivedStep = `BLOC_${String(candidate.session.currentBlock).padStart(2, '0')}`;
  } else if (candidate.answers.length > 0) {
    derivedStep = STEP_03_BLOC1;
  } else if (candidate.tonePreference) {
    derivedStep = STEP_03_BLOC1;
  } else if (candidate.identity.completedAt) {
    derivedStep = STEP_02_TONE;
  } else {
    derivedStep = STEP_01_IDENTITY;
  }
  
  ui = {
    step: derivedStep,
    lastQuestion: null,
    identityDone: !!candidate.identity.completedAt,
  };
  
  // Persister la dérivation
  candidateStore.updateUIState(candidate.candidateId, ui);
}
```

**Risque de régression** :
- **MOYEN** : Modifie la logique de fallback, peut impacter les nouveaux candidats
- **TEST** : Vérifier que nouveau candidat démarre toujours à `STEP_01_IDENTITY`

**Pourquoi prioritaire** :
- **PRIORITÉ A** : Bloque les retours en arrière dans le moteur
- **Impact** : Résout scénarios 1, 2

---

### 🔧 Piste 4 : Corriger sessionReset avec attente `getAsync()`

**Fichier(s) concerné(s)** :
- `src/server.ts:123-137`

**Principe de la modif** :
```typescript
// AVANT
let candidate = candidateStore.get(finalSessionId);
if (!candidate) {
  candidate = await candidateStore.getAsync(finalSessionId);
}
let sessionReset = false;

if (sessionIdHeaderTrim !== "" && !candidate) {
  finalSessionId = uuidv4();
  candidate = candidateStore.create(finalSessionId, tenant as string);
  sessionReset = true;
}

// APRÈS
let candidate = candidateStore.get(finalSessionId);
if (!candidate) {
  candidate = await candidateStore.getAsync(finalSessionId);
}
let sessionReset = false;

// Ne créer nouvelle session QUE si vraiment absent après getAsync()
if (sessionIdHeaderTrim !== "" && !candidate) {
  // Vérifier une dernière fois si candidate existe (race condition)
  candidate = await candidateStore.getAsync(finalSessionId);
  if (!candidate) {
    // Vraiment absent → créer nouvelle session
    finalSessionId = uuidv4();
    candidate = candidateStore.create(finalSessionId, tenant as string);
    sessionReset = true;
  }
}
```

**Risque de régression** :
- **FAIBLE** : Logique défensive, ne casse pas les cas existants
- **TEST** : Vérifier que nouvelle session est toujours créée si vraiment absent

**Pourquoi prioritaire** :
- **PRIORITÉ B** : Évite création involontaire de nouvelle session
- **Impact** : Résout scénario 3

---

### 🔧 Piste 5 : Unifier mapping `/start` et `/axiom`

**Fichier(s) concerné(s)** :
- `src/server.ts:196-222` (`/start`)
- `src/server.ts:626-653` (`/axiom`)

**Principe de la modif** :
```typescript
// Extraire fonction commune
function mapStepToState(step: string, candidate: AxiomCandidate): { state: string; step: string } {
  let responseState: string = "collecting";
  let responseStep = step;
  
  if (step === STEP_01_IDENTITY || step === 'IDENTITY') {
    responseState = "identity";
    responseStep = "STEP_01_IDENTITY";
  } else if (step === STEP_02_TONE) {
    responseState = "tone_choice";
    responseStep = "STEP_02_TONE";
  } else if (step === STEP_03_PREAMBULE) {
    responseState = "preambule";
    responseStep = "STEP_03_PREAMBULE";
  } else if (step === STEP_03_BLOC1) {
    responseState = "wait_start_button";
    responseStep = "STEP_03_BLOC1";
  } else if (step === "PREAMBULE_DONE") {
    responseState = "wait_start_button";
    responseStep = "PREAMBULE_DONE";
  } else if ([BLOC_01, BLOC_02, ..., BLOC_10].includes(step as any)) {
    const blocNumber = [BLOC_01, ..., BLOC_10].indexOf(step as any) + 1;
    responseState = `bloc_${blocNumber.toString().padStart(2, '0')}`; // ← UNIFIER ICI
    if (candidate) {
      candidateStore.updateSession(candidate.candidateId, { state: "collecting", currentBlock: blocNumber });
    }
  } else if (step === STEP_99_MATCH_READY) {
    responseState = "match_ready";
  } else if (step === STEP_99_MATCHING || step === DONE_MATCHING) {
    responseState = step === DONE_MATCHING ? "done" : "matching";
  }
  
  return { state: responseState, step: responseStep };
}

// Utiliser dans /start et /axiom
const { state: responseState, step: responseStep } = mapStepToState(result.step, candidate);
```

**Risque de régression** :
- **FAIBLE** : Refactoring, logique préservée
- **TEST** : Vérifier que tous les états sont mappés correctement

**Pourquoi secondaire** :
- **PRIORITÉ C** : Impact UX, pas de régression d'état
- **Impact** : Améliore cohérence, résout test 5

---

### 🔧 Piste 6 : Valider sessionId avant création

**Fichier(s) concerné(s)** :
- `src/server.ts:519-524` (`/axiom`)

**Principe de la modif** :
```typescript
// AVANT
let candidate = candidateStore.get(sessionId);
if (!candidate) {
  candidate = await candidateStore.getAsync(sessionId);
}
if (!candidate) {
  candidate = candidateStore.create(sessionId, tenantId);
}

// APRÈS
let candidate = candidateStore.get(sessionId);
if (!candidate) {
  candidate = await candidateStore.getAsync(sessionId);
}
if (!candidate) {
  // Valider format sessionId (UUID v4)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sessionId)) {
    return res.status(400).json({
      error: "INVALID_SESSION_ID",
      message: "sessionId invalide",
    });
  }
  candidate = candidateStore.create(sessionId, tenantId);
}
```

**Risque de régression** :
- **FAIBLE** : Validation défensive
- **TEST** : Vérifier que nouveau candidat peut toujours être créé avec UUID valide

**Pourquoi secondaire** :
- **PRIORITÉ B** : Évite corruption, mais cas rare
- **Impact** : Sécurité, pas de régression d'état

---

## 📊 RÉSUMÉ EXÉCUTIF

### Ordre de correction non négociable

1. **PRIORITÉ A** : Corriger initialisation UI (Piste 1) → **IMMÉDIAT**
2. **PRIORITÉ A** : Améliorer garde `/start` (Piste 2) → **IMMÉDIAT**
3. **PRIORITÉ A** : Corriger fallback `executeAxiom` (Piste 3) → **IMMÉDIAT**
4. **PRIORITÉ B** : Corriger sessionReset (Piste 4) → **RAPIDE**
5. **PRIORITÉ C** : Unifier mapping (Piste 5) → **MOYEN TERME**
6. **PRIORITÉ B** : Valider sessionId (Piste 6) → **MOYEN TERME**

### Causes racines identifiées

1. 🔴 **Initialisation UI overwrite état avancé** → Piste 1
2. 🔴 **`/start` appelle moteur même si UI null** → Piste 2
3. 🟡 **Garde anti-régression incomplète** → Piste 2
4. 🟡 **sessionReset crée nouvelle session** → Piste 4
5. 🟢 **Mapping incohérent** → Piste 5

### Tests de validation

- ✅ Test 1 : Parcours complet → **BLOQUÉ** par Pistes 1, 2, 3
- ✅ Test 2 : Refresh après préambule → **BLOQUÉ** par Pistes 1, 2, 3
- ✅ Test 3 : Double `/start` → **BLOQUÉ** par Piste 4
- ✅ Test 4 : Session perdue → **BLOQUÉ** par Pistes 1, 2, 3
- ✅ Test 5 : Cohérence step/state → **BLOQUÉ** par Piste 5

---

**FIN DE L'AUDIT**
