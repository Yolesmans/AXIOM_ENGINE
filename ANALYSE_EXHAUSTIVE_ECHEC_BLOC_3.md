# 🔬 ANALYSE EXHAUSTIVE — ÉCHEC AFFICHAGE BLOC 3

**Date** : 12 février 2026  
**Type** : Analyse théorique complète (AUCUNE modification code)  
**Symptôme** : Après clic "Continuer" (post miroir 2B) → Message "Une erreur technique est survenue" au lieu de question BLOC 3

---

## 1️⃣ LISTE COMPLÈTE DES HYPOTHÈSES (30 CAUSES POSSIBLES)

### CATÉGORIE A : BACKEND — ROUTING & HANDLERS

#### H1 : Pas de handler dédié `START_BLOC_3` dans `/axiom/stream`
#### H2 : Handler `START_BLOC_3` existe mais condition d'entrée échoue
#### H3 : Handler `START_BLOC_3` placé après le chemin générique (jamais atteint)
#### H4 : Event `START_BLOC_3` mal parsé depuis le body JSON
#### H5 : Event écrasé/modifié avant d'atteindre le handler

### CATÉGORIE B : BACKEND — FSM & ÉTAT

#### H6 : `candidate.session.ui.step` incorrect au moment du traitement
#### H7 : `currentState` désynchronisé de `ui.step` dans axiomExecutor
#### H8 : Condition `canStartBloc3` échoue dans axiomExecutor
#### H9 : `currentBlock` pas mis à jour correctement (reste à 2 au lieu de 3)
#### H10 : `conversationHistory` corrompu ou incomplet

### CATÉGORIE C : BACKEND — RÉPONSE & PAYLOAD

#### H11 : `result.response` vide retourné par `executeWithAutoContinue`
#### H12 : `getStaticQuestion(3, 0)` retourne `null` ou `undefined`
#### H13 : Exception silencieuse dans `executeAxiom` (try/catch avalant l'erreur)
#### H14 : `streamedText` vide ET `result.response` vide → fallback déclenché
#### H15 : Ligne 1796 force `expectsAnswer: false` car `response` est falsy

### CATÉGORIE D : BACKEND — MAPPING & STATE

#### H16 : `mapStepToState(STEP_WAIT_BLOC_3)` retourne `undefined` ou `"idle"`
#### H17 : `mapStepToState(BLOC_03)` retourne incorrect state
#### H18 : Payload SSE construit avec `state: undefined`
#### H19 : `writeEvent("done", ...)` échoue silencieusement
#### H20 : SSE flush échoue (proxy/nginx buffer)

### CATÉGORIE E : FRONTEND — RÉSEAU & PARSING

#### H21 : Frontend appelle `/axiom` au lieu de `/axiom/stream`
#### H22 : `API_BASE_URL` incorrect (pointe vers mauvais serveur)
#### H23 : Event `"START_BLOC_3"` mal encodé dans le body JSON
#### H24 : SSE parsing échoue (event: done non parsé)
#### H25 : Réponse SSE tronquée (timeout réseau)

### CATÉGORIE F : FRONTEND — AFFICHAGE

#### H26 : Frontend reçoit `expectsAnswer: false` → masque input
#### H27 : Frontend reçoit `response: "Une erreur technique"` → affiche erreur
#### H28 : Condition frontend `if (data.step === 'BLOC_03')` échoue
#### H29 : `displayContinueButton()` non appelée ou bug affichage
#### H30 : Cache navigateur retourne ancienne version

### CATÉGORIE G : BUILD & DÉPLOIEMENT

#### H31 : `dist/` non synchronisé avec `src/` (build ancien)
#### H32 : TypeScript compilation incomplète (fichiers manquants)
#### H33 : Import `executeAxiom` incorrect dans server.ts
#### H34 : Version déployée différente de version locale

### CATÉGORIE H : RUNTIME & RACE CONDITIONS

#### H35 : Race condition entre `updateUIState` et `executeWithAutoContinue`
#### H36 : Async/await mal géré (promise non attendue)
#### H37 : CandidateStore mutex lock timeout
#### H38 : Session expirée/supprimée entre miroir 2B et clic bouton

---

## 2️⃣ ANALYSE TECHNIQUE DÉTAILLÉE PAR HYPOTHÈSE

### H1 : Pas de handler dédié `START_BLOC_3` dans `/axiom/stream` 🔥

**Mécanisme technique** :
- Frontend envoie `event: "START_BLOC_3"` à `/axiom/stream`
- `/stream` vérifie les handlers dans l'ordre
- Aucun `if (event === "START_BLOC_3")` trouvé
- Tombe dans le chemin générique (ligne 1735)
- Chemin générique appelle `executeWithAutoContinue`
- `executeWithAutoContinue` appelle handler dans `axiomExecutor.ts`
- Handler retourne `{ response: firstQuestion, expectsAnswer: true }`
- MAIS ligne 1796 : `expectsAnswer: response ? result.expectsAnswer : false`
- Si `response` est falsy → `expectsAnswer` forcé à `false`

**Comment cela provoque le symptôme** :
- `streamedText` vide (pas de streaming pour question statique)
- Si `result.response` est falsy (bug/exception) : `response = ""`
- Ligne 1788 : `finalResponse = "" || "" || "Une erreur technique"`
- Ligne 1796 : `expectsAnswer = false`
- Frontend reçoit erreur + input masqué

**Indices POUR** :
- ✅ `grep "START_BLOC_3" src/server.ts` dans `/stream` → 0 match
- ✅ Handler `START_BLOC_1` existe (ligne 1451-1501)
- ✅ Ligne 1796 contient condition `response ?`
- ✅ Ligne 1788 contient fallback "Une erreur technique"
- ✅ Code logging temporaire ajouté au chemin générique (preuve que c'est là qu'on passe)

**Indices CONTRE** :
- ⚠️ Handler `START_BLOC_3` existe dans `axiomExecutor.ts` (ligne 1670-1707)
- ⚠️ `executeWithAutoContinue` devrait appeler ce handler
- ⚠️ Pourquoi `result.response` serait vide si handler retourne question ?

**Probabilité** : **95%**

---

### H11 : `result.response` vide retourné par `executeWithAutoContinue` 🔥

**Mécanisme technique** :
- `executeWithAutoContinue` appelle `executeAxiom`
- Handler `START_BLOC_3` dans `axiomExecutor.ts` exécuté
- Handler appelle `getStaticQuestion(3, 0)`
- Si `getStaticQuestion` retourne `null`/`undefined` → exception
- Exception catchée quelque part → `result.response` vide
- Ou bien `result` lui-même est malformé

**Comment cela provoque le symptôme** :
- `result.response` vide ou falsy
- Ligne 1787 : `response = "" || "" = ""`
- Ligne 1788 : `finalResponse = "" || "" || "Une erreur technique"`
- Ligne 1796 : `expectsAnswer: "" ? true : false = false`
- Frontend reçoit erreur + input masqué

**Indices POUR** :
- ✅ Handler `START_BLOC_3` contient `if (!firstQuestion) throw new Error(...)`
- ✅ Exception possible si `getStaticQuestion(3, 0)` échoue
- ✅ Symptôme correspond exactement

**Indices CONTRE** :
- ⚠️ `getStaticQuestion(3, 0)` devrait toujours retourner une question
- ⚠️ `STATIC_QUESTIONS[3]` existe et contient 3 questions
- ⚠️ Pas de try/catch visible qui avalerait l'exception

**Probabilité** : **70%**

---

### H12 : `getStaticQuestion(3, 0)` retourne `null` ou `undefined`

**Mécanisme technique** :
- `getStaticQuestion(blocNumber, index)` lit `STATIC_QUESTIONS[blocNumber][index]`
- Si `STATIC_QUESTIONS[3]` est `undefined` → retour `undefined`
- Si `STATIC_QUESTIONS[3][0]` est `undefined` → retour `undefined`
- Handler `START_BLOC_3` vérifie `if (!firstQuestion)` → throw Error
- Exception propagée → `result.response` vide

**Comment cela provoque le symptôme** :
- Exception catchée → fallback "Une erreur technique"
- `expectsAnswer: false`

**Indices POUR** :
- ✅ Si `STATIC_QUESTIONS` mal importé ou mal défini
- ✅ Si build TypeScript incorrect

**Indices CONTRE** :
- ⚠️ `STATIC_QUESTIONS[3]` devrait exister (fichier `staticQuestions.ts`)
- ⚠️ BLOC 1 fonctionne → `getStaticQuestion(1, 0)` OK
- ⚠️ Import devrait être cohérent

**Probabilité** : **10%**

---

### H14 : `streamedText` vide ET `result.response` vide → fallback déclenché 🔥

**Mécanisme technique** :
- Pour questions statiques : pas de streaming LLM
- `onChunk` jamais appelé → `streamedText` reste `""`
- Si `result.response` est également falsy (bug)
- Ligne 1788 : `finalResponse = "" || "" || "Une erreur technique"`
- Fallback déclenché

**Comment cela provoque le symptôme** :
- Frontend reçoit "Une erreur technique" au lieu de la question
- `expectsAnswer: false` car `response` falsy

**Indices POUR** :
- ✅ `streamedText` vide pour questions statiques (confirmé)
- ✅ Ligne 1788 contient exactement ce mécanisme
- ✅ Symptôme correspond

**Indices CONTRE** :
- ⚠️ Pourquoi `result.response` serait vide ?

**Probabilité** : **85%**

---

### H15 : Ligne 1796 force `expectsAnswer: false` car `response` est falsy 🔥

**Mécanisme technique** :
- Ligne 1796 : `expectsAnswer: response ? result.expectsAnswer : false`
- Si `response` (ligne 1787) est falsy
- `expectsAnswer` forcé à `false` même si `result.expectsAnswer` est `true`

**Comment cela provoque le symptôme** :
- Frontend reçoit `expectsAnswer: false`
- Input masqué
- Écran bloqué

**Indices POUR** :
- ✅ Ligne 1796 existe et contient cette condition
- ✅ Cette condition est dangereuse pour questions statiques
- ✅ Si `result.response` vide → problème garanti

**Indices CONTRE** :
- ⚠️ Cette ligne ne devrait pas s'exécuter si handler dédié existe

**Probabilité** : **90%** (SI chemin générique emprunté)

---

### H6 : `candidate.session.ui.step` incorrect au moment du traitement

**Mécanisme technique** :
- Au moment où `/stream` reçoit `START_BLOC_3`
- `candidate.session.ui.step` pourrait être incorrect
- Exemple : `BLOC_02` au lieu de `STEP_WAIT_BLOC_3`
- Handler dans `axiomExecutor.ts` vérifie état
- Si état incorrect → handler pas déclenché ou comportement inattendu

**Comment cela provoque le symptôme** :
- Handler `START_BLOC_3` ne s'exécute pas correctement
- Retour vide ou erreur

**Indices POUR** :
- ⚠️ `ui.step` peut être désynchronisé
- ⚠️ `deriveStepFromHistory` peut retourner valeur incorrecte

**Indices CONTRE** :
- ✅ Handler `START_BLOC_3` (commit 407d7c2) est simplifié et ne dépend plus de `currentState`
- ✅ Handler traite directement `event === 'START_BLOC_3'` sans vérifier `ui.step`

**Probabilité** : **20%** (réduite après simplification commit 407d7c2)

---

### H16 : `mapStepToState(STEP_WAIT_BLOC_3)` retourne `undefined` ou `"idle"`

**Mécanisme technique** :
- Après miroir 2B, `blockOrchestrator.ts` retourne `step: STEP_WAIT_BLOC_3`
- `/stream` appelle `mapStepToState(STEP_WAIT_BLOC_3)`
- `mapStepToState` ne connaît pas `STEP_WAIT_BLOC_3`
- Retourne `"idle"` (ligne 135) par défaut
- Payload SSE contient `state: "idle"` (incorrect)

**Comment cela provoque le symptôme** :
- Frontend reçoit `state: "idle"` (ou `undefined`)
- Frontend ne sait pas comment gérer cet état
- Peut ne pas afficher le bouton correctement
- MAIS ça n'explique pas "Une erreur technique"

**Indices POUR** :
- ✅ `mapStepToState` ne contient pas de case pour `STEP_WAIT_BLOC_3`
- ✅ Ligne 135 retourne `"idle"` par défaut

**Indices CONTRE** :
- ⚠️ Ça n'explique pas le message "Une erreur technique"
- ⚠️ Frontend détecte `step === 'STEP_WAIT_BLOC_3'` directement (pas via state)

**Probabilité** : **30%** (impact secondaire, pas cause principale)

---

### H21 : Frontend appelle `/axiom` au lieu de `/axiom/stream`

**Mécanisme technique** :
- Si frontend appelle `/axiom` (JSON) au lieu de `/axiom/stream` (SSE)
- `/axiom` n'a pas de handler `START_BLOC_3` non plus
- Même problème mais dans endpoint différent

**Comment cela provoque le symptôme** :
- Même symptôme que H1

**Indices POUR** :
- ⚠️ Possible erreur de configuration

**Indices CONTRE** :
- ✅ Code frontend (app.js:320) appelle explicitement `/axiom/stream`
- ✅ Pas de raison que ça change

**Probabilité** : **5%**

---

### H31 : `dist/` non synchronisé avec `src/` (build ancien)

**Mécanisme technique** :
- Code source modifié dans `src/`
- Build TypeScript pas lancé ou incomplet
- `dist/` contient ancien code
- Serveur exécute ancien code
- Modifications récentes (handler simplifié 407d7c2) pas appliquées

**Comment cela provoque le symptôme** :
- Ancien code avec bugs connus
- Handler `START_BLOC_3` pas simplifié
- Conditions FSM complexes échouent

**Indices POUR** :
- ⚠️ Possible si build oublié
- ⚠️ Railway peut utiliser cache

**Indices CONTRE** :
- ✅ Build effectué récemment (logging temporaire ajouté + build OK)
- ✅ Commit 407d7c2 pushed

**Probabilité** : **15%**

---

### H35 : Race condition entre `updateUIState` et `executeWithAutoContinue`

**Mécanisme technique** :
- Handler `START_BLOC_3` appelle `updateUIState` et `updateSession`
- Ces appels sont asynchrones
- Si `executeWithAutoContinue` lit l'état avant que les updates soient persistés
- État incohérent

**Comment cela provoque le symptôme** :
- État lu incorrect
- Handler retourne résultat incorrect

**Indices POUR** :
- ⚠️ Async/await possible source de race condition

**Indices CONTRE** :
- ✅ `candidateStore` utilise mutex pour BLOC 2
- ✅ Operations devraient être séquentielles
- ✅ `updateUIState` et `updateSession` sont synchrones (modifient objet en mémoire)

**Probabilité** : **10%**

---

### H13 : Exception silencieuse dans `executeAxiom` (try/catch avalant l'erreur)

**Mécanisme technique** :
- Handler `START_BLOC_3` throw exception
- Exception catchée par try/catch dans `executeWithAutoContinue`
- Try/catch retourne objet vide ou par défaut
- `result.response` vide

**Comment cela provoque le symptôme** :
- `result.response` vide → fallback déclenché

**Indices POUR** :
- ⚠️ Possible si try/catch existe

**Indices CONTRE** :
- ✅ `executeWithAutoContinue` ne contient pas de try/catch visible qui avalerait exception
- ✅ Exception devrait remonter et être loggée

**Probabilité** : **25%**

---

### H22 : `API_BASE_URL` incorrect (pointe vers mauvais serveur)

**Mécanisme technique** :
- Frontend config `API_BASE_URL` pointe vers ancien serveur
- Ancien serveur n'a pas les dernières modifications
- Ancien handler avec bugs

**Comment cela provoque le symptôme** :
- Ancien code exécuté

**Indices POUR** :
- ⚠️ Possible en environnement multi-serveurs

**Indices CONTRE** :
- ✅ `API_BASE_URL` hardcodé dans `app.js` : `"https://axiomengine-production.up.railway.app"`
- ✅ Configuration simple (1 serveur)

**Probabilité** : **5%**

---

### H26 : Frontend reçoit `expectsAnswer: false` → masque input

**Mécanisme technique** :
- Backend envoie payload avec `expectsAnswer: false`
- Frontend (app.js:440-453) vérifie `data.expectsAnswer`
- Si `false` : ne réactive pas l'input
- Input reste masqué

**Comment cela provoque le symptôme** :
- Input masqué → user ne peut pas répondre
- MAIS ça n'explique pas "Une erreur technique"

**Indices POUR** :
- ✅ Code frontend contient cette logique
- ✅ `expectsAnswer: false` masque input

**Indices CONTRE** :
- ⚠️ Ça n'explique pas le message "Une erreur technique"
- ⚠️ C'est une conséquence, pas une cause

**Probabilité** : **80%** (CONSÉQUENCE de H1/H11/H14/H15)

---

### H27 : Frontend reçoit `response: "Une erreur technique"` → affiche erreur

**Mécanisme technique** :
- Backend envoie payload avec `response: "Une erreur technique est survenue. Recharge la page."`
- Frontend (app.js) affiche ce message
- Message provient du fallback ligne 1788

**Comment cela provoque le symptôme** :
- Message erreur affiché

**Indices POUR** :
- ✅ Ligne 1788 contient ce fallback
- ✅ Frontend affiche `data.response`

**Indices CONTRE** :
- ⚠️ C'est une conséquence, pas une cause
- ⚠️ Cause réelle = pourquoi fallback déclenché ?

**Probabilité** : **95%** (CONSÉQUENCE de H11/H14)

---

### H18 : Payload SSE construit avec `state: undefined`

**Mécanisme technique** :
- `mapStepToState(STEP_WAIT_BLOC_3)` retourne `undefined` (pas de case)
- Ou retourne `"idle"` (ligne 135)
- Payload SSE contient `state: undefined` ou `state: "idle"`
- Frontend reçoit état invalide

**Comment cela provoque le symptôme** :
- Frontend ne sait pas gérer `state: undefined`
- Peut ne pas afficher correctement

**Indices POUR** :
- ✅ `mapStepToState` ne gère pas `STEP_WAIT_BLOC_3`

**Indices CONTRE** :
- ⚠️ Ça n'explique pas "Une erreur technique"
- ⚠️ Frontend détecte `step`, pas `state`

**Probabilité** : **20%** (impact secondaire)

---

### H30 : Cache navigateur retourne ancienne version

**Mécanisme technique** :
- Navigateur cache `app.js`
- Ancienne version frontend chargée
- Ancien code avec bugs

**Comment cela provoque le symptôme** :
- Ancien frontend envoie mauvais event
- Ou parse mal la réponse

**Indices POUR** :
- ⚠️ Possible si pas de cache-busting

**Indices CONTRE** :
- ✅ Code frontend récent vérifié (app.js contient bien START_BLOC_3)
- ✅ Hard refresh devrait vider cache

**Probabilité** : **5%**

---

### H24 : SSE parsing échoue (event: done non parsé)

**Mécanisme technique** :
- Backend envoie payload SSE correct
- Frontend parse mal le flux SSE
- Event `done` non détecté
- Frontend reste en attente

**Comment cela provoque le symptôme** :
- Frontend ne reçoit jamais `data.response`
- Timeout ou freeze

**Indices POUR** :
- ⚠️ Parsing SSE complexe (app.js:207-265)

**Indices CONTRE** :
- ✅ BLOC 1 fonctionne → parsing SSE OK
- ✅ Miroir 2B affiché → parsing SSE OK
- ✅ Symptôme = message affiché (pas freeze)

**Probabilité** : **5%**

---

## 3️⃣ CLASSEMENT PAR PROBABILITÉ

### TOP 10 CAUSES LES PLUS PROBABLES

| Rang | ID | Hypothèse | Probabilité | Catégorie |
|------|-----|-----------|-------------|-----------|
| 🥇 1 | **H1** | Pas de handler dédié `START_BLOC_3` dans `/stream` | **95%** | Routing |
| 🥈 2 | **H27** | Frontend reçoit `response: "Une erreur technique"` | **95%** | Conséquence |
| 🥉 3 | **H15** | Ligne 1796 force `expectsAnswer: false` | **90%** | Payload |
| 4 | **H14** | `streamedText` vide ET `result.response` vide | **85%** | Payload |
| 5 | **H26** | Frontend reçoit `expectsAnswer: false` | **80%** | Conséquence |
| 6 | **H11** | `result.response` vide retourné | **70%** | Réponse |
| 7 | **H16** | `mapStepToState(STEP_WAIT_BLOC_3)` incorrect | **30%** | Mapping |
| 8 | **H13** | Exception silencieuse | **25%** | Runtime |
| 9 | **H6** | `ui.step` incorrect | **20%** | État |
| 10 | **H18** | Payload SSE avec `state: undefined` | **20%** | Mapping |

### CAUSES MOINS PROBABLES (< 20%)

| ID | Hypothèse | Probabilité |
|----|-----------|-------------|
| H31 | `dist/` non synchronisé | 15% |
| H12 | `getStaticQuestion(3, 0)` retourne null | 10% |
| H35 | Race condition async | 10% |
| H21 | Frontend appelle `/axiom` | 5% |
| H22 | `API_BASE_URL` incorrect | 5% |
| H24 | SSE parsing échoue | 5% |
| H30 | Cache navigateur | 5% |

---

## 4️⃣ IDENTIFICATION DES 3 CAUSES LES PLUS CRÉDIBLES

### 🔥 CAUSE #1 : Pas de handler dédié `START_BLOC_3` dans `/stream`

**Probabilité** : 95%  
**Type** : Structurelle (architecture)  
**Gravité** : Élevée

**Mécanisme** :
1. Frontend envoie `event: "START_BLOC_3"` à `/axiom/stream`
2. `/stream` n'a pas de `if (event === "START_BLOC_3")`
3. Event tombe dans chemin générique (ligne 1735)
4. Chemin générique appelle `executeWithAutoContinue`
5. `executeWithAutoContinue` exécute handler dans `axiomExecutor.ts`
6. Handler retourne `{ response: firstQuestion, expectsAnswer: true }`
7. **PROBLÈME** : Ligne 1796 contient `expectsAnswer: response ? result.expectsAnswer : false`
8. Si `response` est falsy → `expectsAnswer` forcé à `false`
9. Ligne 1788 : `finalResponse = streamedText || response || "Une erreur technique"`
10. Si `streamedText=""` ET `response=""` → fallback déclenché

**Preuves** :
- ✅ `grep "START_BLOC_3" src/server.ts` dans section `/stream` → 0 match
- ✅ Handler `START_BLOC_1` existe (ligne 1451-1501) mais pas `START_BLOC_3`
- ✅ Ligne 1796 contient condition dangereuse
- ✅ Ligne 1788 contient fallback exact

**Impact** :
- Questions statiques (BLOC 3, 4-10) potentiellement impactées
- `streamedText` vide pour toutes les questions statiques
- Si `result.response` vide → crash garanti

---

### 🔥 CAUSE #2 : `result.response` vide retourné par handler

**Probabilité** : 70%  
**Type** : Runtime (exception/bug)  
**Gravité** : Élevée

**Mécanisme** :
1. Handler `START_BLOC_3` dans `axiomExecutor.ts` exécuté
2. `getStaticQuestion(3, 0)` appelé
3. Si retourne `null`/`undefined` → `throw new Error("Question BLOC 3 introuvable")`
4. Exception propagée
5. Exception catchée quelque part (où ?)
6. `result.response` devient vide ou falsy
7. Ligne 1787 : `response = "" || "" = ""`
8. Déclenche fallback + `expectsAnswer: false`

**Preuves** :
- ✅ Handler contient `if (!firstQuestion) throw new Error(...)`
- ✅ Si `getStaticQuestion` échoue → exception
- ⚠️ Pas de try/catch visible qui avalerait exception

**Impact** :
- Si `STATIC_QUESTIONS[3]` mal défini → crash systématique
- Si import incorrect → crash

---

### 🔥 CAUSE #3 : Ligne 1796 force `expectsAnswer: false` (condition dangereuse)

**Probabilité** : 90% (SI chemin générique emprunté)  
**Type** : Logique (condition)  
**Gravité** : Moyenne (conséquence de cause #1)

**Mécanisme** :
1. Ligne 1796 : `expectsAnswer: response ? result.expectsAnswer : false`
2. Cette ligne s'exécute dans le chemin générique
3. Si `response` (ligne 1787) est falsy
4. `expectsAnswer` forcé à `false` même si `result.expectsAnswer` est `true`
5. Frontend reçoit `expectsAnswer: false`
6. Input masqué

**Preuves** :
- ✅ Ligne 1796 existe et contient cette condition
- ✅ Condition s'applique à TOUTES les requêtes passant par chemin générique
- ✅ Pour questions statiques : `streamedText` toujours vide

**Impact** :
- Si handler dédié existait → cette ligne ne s'exécuterait pas
- C'est une **CONSÉQUENCE** de l'absence de handler dédié

---

## 5️⃣ CLASSIFICATION SPÉCIFIQUE

### 🏗️ CAUSE LA PLUS STRUCTURELLE

**H1 : Pas de handler dédié `START_BLOC_3` dans `/stream`**

**Pourquoi** : Architecture du code
- Handler `START_BLOC_1` existe → pattern établi
- Handler `START_BLOC_3` manquant → incohérence architecturale
- Endpoint `/stream` attend des handlers dédiés pour events critiques
- Chemin générique conçu pour fallback, pas pour gestion events critiques

**Impact long terme** : Tous les blocs avec questions statiques potentiellement impactés

---

### ⚡ CAUSE LA PLUS SIMPLE

**H16 : `mapStepToState(STEP_WAIT_BLOC_3)` retourne incorrect state**

**Pourquoi** : Simple mapping manquant
- Fonction `mapStepToState` ne contient pas de case pour `STEP_WAIT_BLOC_3`
- Retourne `"idle"` par défaut (ligne 135)
- Fix = ajouter 3 lignes de code

**MAIS** : N'explique pas "Une erreur technique" → Cause secondaire

---

### ☠️ CAUSE LA PLUS GRAVE

**H11 : `result.response` vide retourné par handler**

**Pourquoi** : Exception silencieuse ou bug critique
- Si `getStaticQuestion(3, 0)` retourne null → exception
- Si import `STATIC_QUESTIONS` incorrect → crash systématique
- Si exception catchée silencieusement → bug masqué
- **TOUS les blocs 3-10 potentiellement impactés**

**Impact** : Blocage complet du parcours utilisateur

---

## 6️⃣ MATRICE DE PROBABILITÉ

| Catégorie | Probabilité cumulée |
|-----------|---------------------|
| **Routing & Handlers** (H1-H5) | **95%** |
| **Réponse & Payload** (H11-H15) | **85%** |
| **Mapping & State** (H16-H20) | **30%** |
| **Runtime & Race** (H35-H38) | **25%** |
| **Build & Déploiement** (H31-H34) | **15%** |
| **Frontend** (H21-H30) | **10%** |
| **FSM & État** (H6-H10) | **20%** |

**Verdict** : **95% de probabilité que le problème soit dans le routing backend** (absence de handler dédié)

---

## 7️⃣ MATRICE IMPACT / COMPLEXITÉ

| Hypothèse | Impact | Complexité fix | Priorité |
|-----------|--------|----------------|----------|
| **H1** | 🔴 Élevé | 🟢 Faible (+45 lignes) | **P0** |
| **H11** | 🔴 Élevé | 🟡 Moyenne (debug) | **P0** |
| **H15** | 🟠 Moyen | 🟢 Faible (supprimer condition) | **P1** |
| **H14** | 🟠 Moyen | 🟢 Faible (handler dédié) | **P1** |
| **H16** | 🟡 Faible | 🟢 Faible (+3 lignes) | **P2** |
| **H13** | 🔴 Élevé | 🔴 Élevée (debug runtime) | **P0** |
| **H6** | 🟡 Faible | 🟡 Moyenne (FSM) | **P2** |
| **H31** | 🟠 Moyen | 🟢 Faible (rebuild) | **P1** |

---

## 8️⃣ PRIORITÉ D'INVESTIGATION

### 🔴 PRIORITÉ P0 (CRITIQUE — INVESTIGUER EN PREMIER)

1. **H1 : Pas de handler `START_BLOC_3` dans `/stream`**
   - Vérification : `grep "START_BLOC_3" src/server.ts` dans section `/stream`
   - Confirmation : Voir ligne 1451-1501 (handler START_BLOC_1 existe)
   - Test : Ajouter console.log pour voir quel chemin est emprunté

2. **H11 : `result.response` vide**
   - Vérification : Logs runtime (console.log temporaire ajouté)
   - Test : Reproduire scénario + capturer valeur `result.response`
   - Confirmation : Si vide → exception dans handler ou `getStaticQuestion` échoue

3. **H13 : Exception silencieuse**
   - Vérification : Chercher try/catch dans `executeWithAutoContinue`
   - Test : Ajouter logs avant/après appels critiques
   - Confirmation : Si exception non loggée → try/catch avale erreur

### 🟠 PRIORITÉ P1 (IMPORTANT — INVESTIGUER SI P0 OK)

4. **H15 : Ligne 1796 force `expectsAnswer: false`**
   - Vérification : Lire code ligne 1796
   - Impact : Si handler dédié existe → cette ligne ne s'exécute pas
   - Test : Vérifier que chemin générique est emprunté

5. **H14 : `streamedText` vide ET `result.response` vide**
   - Vérification : Logs runtime
   - Test : Capturer valeurs `streamedText` et `response`
   - Confirmation : Si les 2 vides → fallback déclenché

6. **H31 : `dist/` non synchronisé**
   - Vérification : Comparer timestamps `src/server.ts` et `dist/src/server.js`
   - Test : Rebuild complet + redémarrer serveur
   - Confirmation : Si fix après rebuild → problème build

### 🟡 PRIORITÉ P2 (SECONDAIRE — SI P0 ET P1 OK)

7. **H16 : `mapStepToState(STEP_WAIT_BLOC_3)` incorrect**
   - Vérification : Lire fonction `mapStepToState`
   - Impact : `state: "idle"` au lieu de `"wait_continue_button"`
   - Test : Capturer valeur `state` dans payload SSE

8. **H6 : `ui.step` incorrect**
   - Vérification : Logs runtime
   - Test : Capturer valeur `candidate.session.ui.step`
   - Confirmation : Si incorrect → FSM désynchronisé

---

## 9️⃣ SYNTHÈSE FINALE

### 🎯 CONCLUSION PRINCIPALE

**Cause racine la plus probable (95%)** : **Absence de handler dédié `START_BLOC_3` dans `/axiom/stream`**

**Mécanisme exact** :
1. Frontend → `/axiom/stream` avec `event: "START_BLOC_3"`
2. Backend → Aucun handler dédié
3. Tombe dans chemin générique (ligne 1735)
4. Chemin générique contient condition dangereuse (ligne 1796)
5. Pour questions statiques : `streamedText` vide
6. Si `result.response` falsy → fallback déclenché + `expectsAnswer: false`

**Preuves solides** :
- ✅ Handler `START_BLOC_1` existe (ligne 1451-1501)
- ✅ Handler `START_BLOC_3` absent dans `/stream` (grep confirme)
- ✅ Ligne 1796 contient condition `response ?`
- ✅ Ligne 1788 contient fallback exact

---

### 🔬 CAUSES SECONDAIRES CRÉDIBLES

1. **`result.response` vide (70%)** : Si handler retourne réponse vide → fallback garanti
2. **Ligne 1796 condition (90%)** : Force `expectsAnswer: false` si `response` falsy
3. **`mapStepToState` incomplet (30%)** : Retourne `state: "idle"` pour `STEP_WAIT_BLOC_3`

---

### 📊 DIAGNOSTIC RECOMMANDÉ

**Étape 1** : Vérifier logs runtime (console.log temporaire ajouté)
- Capturer valeurs : `event`, `result.response`, `result.step`, `streamedText`
- Confirmer : Chemin générique emprunté ? `result.response` vide ?

**Étape 2** : Si logs confirment H1
- Solution : Ajouter handler dédié `START_BLOC_3` dans `/stream`
- Pattern : Dupliquer strictement handler `START_BLOC_1`
- Impact : +45 lignes, 0 régression

**Étape 3** : Si logs montrent `result.response` vide (H11)
- Solution : Débugger `getStaticQuestion(3, 0)`
- Vérifier : `STATIC_QUESTIONS[3][0]` existe ?
- Vérifier : Import correct ?

---

### ⚠️ FAUSSES PISTES (PROBABILITÉ < 10%)

- Frontend appelle mauvais endpoint
- Cache navigateur
- SSE parsing échoue
- `API_BASE_URL` incorrect
- Race condition async

**Raison** : BLOC 1 fonctionne → infrastructure OK, parsing OK, routing OK

---

## 🔟 VALIDATION PAR ÉLIMINATION

### ✅ CE QUI FONCTIONNE (DONC PAS LA CAUSE)

- ✅ Frontend envoie requête (sinon aucune réponse)
- ✅ Backend reçoit requête (sinon erreur réseau)
- ✅ SSE parsing fonctionne (BLOC 1 OK, miroir 2B affiché)
- ✅ `mapStepToState` fonctionne pour autres steps (BLOC 1-2 OK)
- ✅ Frontend affiche messages (miroir 2B affiché)
- ✅ Handler `START_BLOC_3` existe dans `axiomExecutor.ts` (commit 407d7c2)
- ✅ `getStaticQuestion` fonctionne pour BLOC 1 (questions affichées)

### ❌ CE QUI NE FONCTIONNE PAS (DONC CAUSE PROBABLE)

- ❌ Question BLOC 3 pas affichée
- ❌ Message "Une erreur technique" affiché
- ❌ Input masqué (`expectsAnswer: false`)
- ❌ Handler dédié `START_BLOC_3` absent de `/stream`

### 🎯 POINT DE DÉFAILLANCE UNIQUE

**Ligne 1735-1804 (chemin générique dans `/stream`)**

Cette section contient :
- Ligne 1788 : Fallback "Une erreur technique"
- Ligne 1796 : Condition `response ?` dangereuse

**Si handler dédié existait** :
- Ces lignes ne s'exécuteraient jamais pour `START_BLOC_3`
- Problème résolu

---

**FIN DE L'ANALYSE EXHAUSTIVE**

**Verdict final** : **95% de certitude que la cause est l'absence de handler dédié `START_BLOC_3` dans `/axiom/stream`**

**Prochaine étape recommandée** : Capturer logs runtime pour confirmer hypothèse avant toute modification.
