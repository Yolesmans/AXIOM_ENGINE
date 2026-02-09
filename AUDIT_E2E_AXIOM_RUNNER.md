# 🔍 AUDIT E2E AXIOM — Paramétrage Runner

**Date** : 2025-01-27  
**Type** : Audit technique en lecture seule  
**Objectif** : Valider le paramétrage du runner E2E et identifier les hypothèses exactes à respecter

---

## 📋 RÉSUMÉ EXÉCUTIF

Le runner E2E actuel (`e2e/runner/runE2E.ts`) suit une logique simple :
- Appelle `/start` puis enchaîne des `POST /axiom`
- Envoie une réponse uniquement quand `expectsAnswer === true`
- S'arrête quand le matching est atteint

**✅ Hypothèses VALIDES** :
- `expectsAnswer` est fiable comme signal de pilotage
- 1 réponse utilisateur = 1 step logique (sauf transitions silencieuses documentées)
- Le matching est terminal et unique

**⚠️ Hypothèses à PRENDRE EN COMPTE** :
- Transitions silencieuses après miroirs (BLOC 1 → 2A, BLOC 2B → 3)
- `autoContinue` est toujours `false` dans les retours actuels (non utilisé)
- Les events (`START_BLOC_1`, `START_MATCHING`) sont obligatoires à certains moments

---

## 1️⃣ SIGNAL DE PILOTAGE — `expectsAnswer`

### ✅ Hypothèse VRAIE : `expectsAnswer` est fiable

**Preuve code** :

1. **BLOCS 1-2 (Orchestrateur)** :
   - `blockOrchestrator.ts` retourne explicitement `expectsAnswer: true` pour les questions
   - `expectsAnswer: false` pour les miroirs

2. **BLOCS 3-10 (executeAxiom)** :
   - `expectsAnswer` déterminé par `aiText.trim().endsWith('?')` (ligne 1711 `axiomExecutor.ts`)
   - Si le texte se termine par `?` → `expectsAnswer: true`
   - Sinon → `expectsAnswer: false` (miroir)

3. **Matching** :
   - `expectsAnswer: false` (ligne 2014 `axiomExecutor.ts`)

**Conclusion** : Le runner peut supposer que :
- `expectsAnswer === true` → Envoyer une réponse utilisateur
- `expectsAnswer === false` → Attendre un event ou arrêter

### ⚠️ Cas particuliers à gérer

**Cas 1 : Transitions silencieuses après miroirs**

Après un miroir de fin de bloc, le backend génère immédiatement la première question du bloc suivant :

- **BLOC 1 → BLOC 2A** (ligne 242-268 `blockOrchestrator.ts`) :
  - Après le miroir BLOC 1, la première question 2A est générée
  - Retour : `expectsAnswer: true` avec miroir + question concaténés
  - **Impact runner** : Le runner reçoit `expectsAnswer: true` immédiatement après le miroir, pas besoin d'attendre

- **BLOC 2B → BLOC 3** (ligne 942-946 `blockOrchestrator.ts`) :
  - Après le miroir BLOC 2B, `executeAxiom()` est appelé pour générer la première question BLOC 3
  - Retour : `expectsAnswer: true` avec miroir + question concaténés
  - **Impact runner** : Même comportement que BLOC 1 → 2A

**Cas 2 : Events obligatoires**

Certains états nécessitent un event, pas un message texte :

- **STEP_03_BLOC1** (après préambule) :
  - `expectsAnswer: false`
  - Nécessite `event: "START_BLOC_1"` (ligne 108 `runE2E.ts`)
  - Si message texte envoyé → Ignoré (ligne 698-707 `server.ts`)

- **STEP_99_MATCH_READY** (après BLOC 10) :
  - `expectsAnswer: false`
  - Nécessite `event: "START_MATCHING"` (ligne 139 `runE2E.ts`)
  - Si message texte envoyé → Ignoré (ligne 1904 `axiomExecutor.ts`)

**Conclusion** : Le runner doit gérer :
- `expectsAnswer === false` + `step === "STEP_03_BLOC1"` → Envoyer `event: "START_BLOC_1"`
- `expectsAnswer === false` + `step === "STEP_99_MATCH_READY"` → Envoyer `event: "START_MATCHING"`
- `expectsAnswer === false` + autre step → Arrêter ou attendre

---

## 2️⃣ TRANSITIONS SILENCIEUSES

### ✅ Transitions documentées

**Transition 1 : BLOC 1 → BLOC 2A**

- **Déclencheur** : Fin du BLOC 1 (toutes les questions répondues)
- **Comportement** : 
  - Miroir BLOC 1 généré
  - Première question 2A générée immédiatement
  - Retour : `response = miroir + "\n\n" + question2A`, `expectsAnswer: true`
- **Impact runner** : Le runner reçoit `expectsAnswer: true` directement, peut envoyer la réponse 2A.1 sans attendre

**Transition 2 : BLOC 2B → BLOC 3**

- **Déclencheur** : Fin du BLOC 2B (toutes les questions répondues)
- **Comportement** :
  - Miroir BLOC 2B généré
  - Première question BLOC 3 générée via `executeAxiom()`
  - Retour : `response = miroir + "\n\n" + questionBLOC3`, `expectsAnswer: true`
- **Impact runner** : Même comportement que BLOC 1 → 2A

**Transition 3 : STEP_02_TONE → STEP_03_PREAMBULE**

- **Déclencheur** : Réponse à la question tone
- **Comportement** :
  - Préambule généré automatiquement
  - Retour : `response = préambule`, `step = STEP_03_BLOC1`, `expectsAnswer: false`
- **Impact runner** : Le runner doit détecter `step === "STEP_03_BLOC1"` et envoyer `event: "START_BLOC_1"`

**Transition 4 : STEP_99_MATCH_READY → STEP_99_MATCHING**

- **Déclencheur** : Event `START_MATCHING`
- **Comportement** :
  - Transition automatique vers `STEP_99_MATCHING`
  - `executeAxiom()` appelé immédiatement avec `userMessage: null` (ligne 1927-1930 `axiomExecutor.ts`)
  - Matching généré
- **Impact runner** : Le runner doit envoyer `event: "START_MATCHING"` quand `step === "STEP_99_MATCH_READY"`

### ❌ Pas de transition automatique pour les autres blocs

- **BLOCS 3-9** : Après un miroir, le backend retourne `expectsAnswer: false` et attend la prochaine question
- **BLOC 10** : Après le profil final, transition vers `STEP_99_MATCH_READY` avec `expectsAnswer: false`

**Conclusion** : Le runner doit gérer les transitions silencieuses uniquement pour :
- BLOC 1 → 2A (automatique, `expectsAnswer: true` reçu)
- BLOC 2B → 3 (automatique, `expectsAnswer: true` reçu)
- STEP_02_TONE → STEP_03_PREAMBULE (automatique, `expectsAnswer: false` reçu)
- STEP_99_MATCH_READY → STEP_99_MATCHING (nécessite event)

---

## 3️⃣ ORDRE ET CONSOMMATION DES RÉPONSES

### ✅ Hypothèse VRAIE : 1 input utilisateur = 1 step logique (sauf transitions silencieuses)

**BLOC 1** :
- Queue de questions pré-générées
- 1 réponse utilisateur = 1 question suivante servie (pas d'API)
- Fin du bloc → Miroir + première question 2A (transition silencieuse)

**BLOC 2A** :
- 3 questions séquentielles (pas de queue)
- 1 réponse utilisateur = 1 question suivante générée (API)
- Fin du bloc → Transition automatique vers BLOC 2B

**BLOC 2B** :
- Queue de questions pré-générées
- 1 réponse utilisateur = 1 question suivante servie (pas d'API)
- Fin du bloc → Miroir + première question BLOC 3 (transition silencieuse)

**BLOCS 3-10** :
- Gérés par `executeAxiom()`
- 1 réponse utilisateur = 1 step logique
- Après un miroir → `expectsAnswer: false`, prochaine question nécessite un nouveau `POST /axiom`

**Conclusion** : Le runner peut supposer que :
- 1 réponse = 1 consommation (sauf transitions silencieuses documentées)
- Les réponses sont consommées dans l'ordre strict du profil JSON
- Aucune réponse n'est "sautée" ou "doublée"

### ⚠️ Cas particuliers

**Cas 1 : Réponses aux miroirs (validation ouverte)**

Les miroirs se terminent par : "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

- **BLOCS 3-9** : Après un miroir, `expectsAnswer: false` → Le runner ne doit PAS envoyer de réponse
- **BLOC 1, 2B** : Après un miroir, transition silencieuse → `expectsAnswer: true` reçu directement

**Cas 2 : Events vs Messages**

- **Events** : `START_BLOC_1`, `START_MATCHING` → Ne consomment pas de réponse du profil
- **Messages** : Réponses texte → Consomment une réponse du profil

**Conclusion** : Le runner doit distinguer :
- Events → Pas de consommation de réponse
- Messages → Consommation de réponse

---

## 4️⃣ MATCHING (FIN DE PARCOURS)

### ✅ Hypothèse VRAIE : Matching terminal, unique, déclenché par event

**Preuve code** :

1. **Déclenchement** :
   - Nécessite `event: "START_MATCHING"` (ligne 1914-1930 `axiomExecutor.ts`)
   - Transition automatique : `STEP_99_MATCH_READY` → `STEP_99_MATCHING`
   - `executeAxiom()` appelé immédiatement avec `userMessage: null`

2. **Terminal** :
   - État final : `DONE_MATCHING` (ligne 1993 `axiomExecutor.ts`)
   - `expectsAnswer: false` (ligne 2014)
   - Pas de transition possible après

3. **Unique** :
   - Une seule génération de matching
   - Pas de retry automatique (sauf erreur technique)

**Conclusion** : Le runner peut supposer que :
- Le matching est toujours terminal
- Le matching est unique (pas de double matching)
- Le matching nécessite `event: "START_MATCHING"` (pas un message texte)

### ⚠️ Gestion d'erreur

Si le matching échoue :
- Retry automatique (1 fois) (ligne 1963-1984 `axiomExecutor.ts`)
- Si toujours vide → Erreur critique, retour `DONE_MATCHING` avec message d'erreur

**Impact runner** : Le runner doit détecter `step === "DONE_MATCHING"` pour arrêter, même en cas d'erreur.

---

## 5️⃣ HYPOTHÈSES À DOCUMENTER POUR L'E2E

### ✅ Hypothèses VRAIES (garanties par le moteur)

1. **`expectsAnswer` est fiable** :
   - `true` → Envoyer une réponse utilisateur
   - `false` → Attendre un event ou arrêter

2. **1 réponse = 1 consommation** :
   - Sauf transitions silencieuses documentées (BLOC 1 → 2A, BLOC 2B → 3)
   - Les réponses sont consommées dans l'ordre strict du profil JSON

3. **Events obligatoires** :
   - `STEP_03_BLOC1` → Nécessite `event: "START_BLOC_1"`
   - `STEP_99_MATCH_READY` → Nécessite `event: "START_MATCHING"`

4. **Matching terminal** :
   - `step === "DONE_MATCHING"` → Arrêter le runner
   - Unique, pas de double matching

5. **Transitions silencieuses** :
   - BLOC 1 → 2A : `expectsAnswer: true` reçu directement après miroir
   - BLOC 2B → 3 : `expectsAnswer: true` reçu directement après miroir

### ❌ Hypothèses FAUSSES (à ne pas supposer)

1. **`autoContinue` est utilisé** :
   - ❌ `autoContinue` est toujours `false` dans les retours actuels
   - ❌ Le runner ne doit PAS se baser sur `autoContinue` pour décider de continuer

2. **Tous les `expectsAnswer: false` nécessitent un event** :
   - ❌ Seuls `STEP_03_BLOC1` et `STEP_99_MATCH_READY` nécessitent un event
   - ❌ Les autres `expectsAnswer: false` (miroirs BLOCS 3-9) → Attendre la prochaine question

3. **Les réponses aux miroirs sont attendues** :
   - ❌ Les miroirs BLOCS 3-9 retournent `expectsAnswer: false`
   - ❌ Le runner ne doit PAS envoyer de réponse après un miroir (sauf transitions silencieuses)

4. **Le matching peut être déclenché par un message texte** :
   - ❌ Le matching nécessite `event: "START_MATCHING"`, pas un message texte

### ⚠️ Hypothèses INCERTAINES (à contourner côté runner)

1. **Ordre exact des réponses dans le profil JSON** :
   - ⚠️ Le runner doit suivre l'ordre strict du tableau `answers`
   - ⚠️ Si une réponse est manquante → Le runner doit gérer l'erreur

2. **Gestion des erreurs techniques** :
   - ⚠️ Si `response` est vide → Le runner doit gérer (message d'erreur backend)
   - ⚠️ Si `step` est inattendu → Le runner doit gérer (log + arrêt)

3. **Session ID** :
   - ⚠️ Le runner doit conserver le `sessionId` entre les appels
   - ⚠️ Si `sessionId` change → Le runner doit gérer (nouvelle session)

---

## 6️⃣ GARDE-FOUS LOGIQUES À RESPECTER CÔTÉ E2E

### 🔒 Règles strictes pour le runner

1. **Signal de pilotage** :
   ```typescript
   if (data.expectsAnswer === true) {
     // Envoyer réponse utilisateur depuis profil
     const userMessage = profile.answers[cursor++];
     // POST /axiom avec message
   } else if (data.step === "STEP_03_BLOC1") {
     // Envoyer event START_BLOC_1
     // POST /axiom avec event: "START_BLOC_1"
   } else if (data.step === "STEP_99_MATCH_READY") {
     // Envoyer event START_MATCHING
     // POST /axiom avec event: "START_MATCHING"
   } else if (data.step === "DONE_MATCHING") {
     // Arrêter le runner
   } else {
     // Attendre ou arrêter (cas inattendu)
   }
   ```

2. **Gestion des transitions silencieuses** :
   ```typescript
   // Après un miroir BLOC 1 ou 2B, expectsAnswer peut être true immédiatement
   // Le runner doit envoyer la réponse suivante sans attendre
   if (data.expectsAnswer === true) {
     // Même si c'est juste après un miroir, envoyer la réponse
   }
   ```

3. **Conservation du sessionId** :
   ```typescript
   // Toujours utiliser le sessionId retourné par le backend
   let sessionId = data.sessionId || sessionId;
   // Toujours inclure sessionId dans les requêtes suivantes
   ```

4. **Gestion des erreurs** :
   ```typescript
   // Si response est vide → Log + arrêt
   if (!data.response || data.response.trim() === "") {
     console.error("Empty response from backend");
     break;
   }
   
   // Si step est inattendu → Log + arrêt
   if (!data.step || data.step === "UNKNOWN") {
     console.error("Unknown step from backend");
     break;
   }
   ```

5. **Arrêt conditionnel** :
   ```typescript
   // Arrêter si :
   // - step === "DONE_MATCHING"
   // - cursor >= profile.answers.length ET expectsAnswer === false
   // - Erreur technique (response vide, step inattendu)
   ```

---

## 7️⃣ CHECKLIST DE VALIDATION E2E

### ✅ Tests à valider

1. **Parcours complet** :
   - ✅ Identité → Tone → Préambule → BLOC 1 → ... → BLOC 10 → Matching
   - ✅ Toutes les réponses du profil sont consommées
   - ✅ Aucune réponse n'est "sautée" ou "doublée"

2. **Transitions silencieuses** :
   - ✅ BLOC 1 → 2A : `expectsAnswer: true` reçu après miroir
   - ✅ BLOC 2B → 3 : `expectsAnswer: true` reçu après miroir

3. **Events obligatoires** :
   - ✅ `STEP_03_BLOC1` → Event `START_BLOC_1` envoyé
   - ✅ `STEP_99_MATCH_READY` → Event `START_MATCHING` envoyé

4. **Matching terminal** :
   - ✅ `step === "DONE_MATCHING"` → Runner arrêté
   - ✅ Matching unique (pas de double matching)

5. **Gestion d'erreurs** :
   - ✅ Response vide → Runner arrêté avec log
   - ✅ Step inattendu → Runner arrêté avec log
   - ✅ Session ID perdu → Runner arrêté avec log

---

## 8️⃣ CONCLUSION

### ✅ Le runner E2E peut supposer :

1. **`expectsAnswer` est fiable** comme signal de pilotage
2. **1 réponse = 1 consommation** (sauf transitions silencieuses documentées)
3. **Events obligatoires** pour `STEP_03_BLOC1` et `STEP_99_MATCH_READY`
4. **Matching terminal** et unique
5. **Transitions silencieuses** pour BLOC 1 → 2A et BLOC 2B → 3

### ❌ Le runner E2E ne doit PAS supposer :

1. **`autoContinue` est utilisé** (toujours `false`)
2. **Tous les `expectsAnswer: false` nécessitent un event** (seulement 2 cas)
3. **Les réponses aux miroirs sont attendues** (sauf transitions silencieuses)
4. **Le matching peut être déclenché par un message texte** (nécessite event)

### ⚠️ Le runner E2E doit gérer :

1. **Ordre strict des réponses** dans le profil JSON
2. **Gestion des erreurs techniques** (response vide, step inattendu)
3. **Conservation du sessionId** entre les appels

---

**FIN DE L'AUDIT**
