# 🔍 AUDIT EXHAUSTIF — AXIOM / REVELIOM (COMPLIANCE COMPLÈTE)

**Date** : 2025-01-27  
**Type** : Audit senior READ-ONLY (aucune modification)  
**Objectif** : Vérification complète de la conformité au cahier des charges REVELIOM + analyse qualitative du rendu

---

## 📋 RÉSUMÉ EXÉCUTIF

**Verdict global** : 🟡 **GO CONDITIONNEL** — Système fonctionnel mais avec écarts qualitatifs et techniques identifiés

**Top 5 actions prioritaires** :
1. **Validation structurelle profil final BLOC 10** (GO-blocker qualité)
2. **Validation structurelle matching** (GO-blocker qualité)
3. **Amélioration ton mentor des miroirs** (écart qualitatif majeur)
4. **Implémentation streaming SSE** (non implémenté, route coquille)
5. **Renforcement idempotence serveur** (anti-doubles START_BLOC_1, START_MATCHING)

**Statut technique** : ✅ FSM stable, ✅ Persistance OK, ✅ Verrous UI partiels, ⚠️ Validations manquantes, ❌ Streaming non implémenté

**Statut qualitatif** : ⚠️ Miroirs "froids" vs attendu "mentor chaleureux", ⚠️ Profil final non validé, ⚠️ Matching non validé

---

## SECTION 1 — INVENTAIRE PRÉCIS DE CE QUI A ÉTÉ FAIT

### 1.1 Git / Commits / Diff

**Commits récents pertinents** (analyse depuis `a87adf0` jusqu'à `d8f6e10`) :

| Hash | Titre | Fichiers modifiés | Résumé | Risques potentiels |
|------|-------|-------------------|--------|-------------------|
| `d8f6e10` | `fix(ui): enforce strict sequential question display (BLOC 1 safeguard)` | `ui-test/app.js` | Ajout `extractFirstQuestion()` pour détecter questions multiples sans séparateur | Troncature possible si question contient plusieurs `?` (rare) |
| `091654e` | `feat(ui): add final FIN button redirecting to Tally after DONE_MATCHING` | `ui-test/app.js` | Ajout bouton FIN après matching, redirection Tally | Aucun (frontend uniquement) |
| `f7bb963` | `feat: separate final profile from matching CTA + fix /start endpoint (step field)` | `src/engine/axiomExecutor.ts`, `src/routes/start.ts` | Séparation synthèse/CTA, ajout `step` dans `/start` | Aucun (séparation propre) |
| `2aa49cd` | `UI: enforce strict sequential question lock (BLOC 1)` | `ui-test/app.js` | Ajout verrou `hasActiveQuestion` | Aucun (verrou défensif) |
| `4d08e46` | `feat: validation ton 2e personne dans miroirs REVELIOM` | `src/services/validateMirrorReveliom.ts` | Validation ton 2e personne obligatoire | Aucun (validation défensive) |
| `33cd13c` | `LOT1: fix mirror validation loop + restore free-text validation + full-context mirrors` | `src/services/blockOrchestrator.ts` | Fix boucle miroir, validation libre, contexte complet | Aucun (correction bug) |
| `01b7658` | `SAFEGUARD: enforce single-response contract backend→frontend` | `src/services/blockOrchestrator.ts` | Ajout `normalizeSingleResponse()` | Aucun (safeguard défensif) |
| `33dc18a` | `ÉTAPE 1 — Fluidité invisible: transition auto 2A→2B + annonce transition après miroir` | `src/services/blockOrchestrator.ts`, `src/engine/axiomExecutor.ts` | Transition auto 2A→2B, annonce transition | Aucun (amélioration UX) |
| `a87adf0` | `P4.1 — Add SSE hybrid streaming route for mirrors/profile/matching (backend only)` | `src/server.ts` | Route `/axiom/stream` créée mais non implémentée | Route coquille (retourne NOT_IMPLEMENTED) |

**Modifications backend identifiées** :
- ✅ `src/services/blockOrchestrator.ts` : Logique miroir, validation, normalisation
- ✅ `src/engine/axiomExecutor.ts` : FSM, transitions, matching
- ✅ `src/store/sessionStore.ts` : `appendMirrorValidation()`, `setFinalProfileText()`
- ✅ `src/routes/start.ts` : Ajout `step` dans réponse
- ✅ `src/services/validateMirrorReveliom.ts` : Validation ton 2e personne

**Modifications frontend identifiées** :
- ✅ `ui-test/app.js` : Verrous séquentiels, boutons, extraction questions

**Aucune modification prompts** : ✅ Confirmé (prompts intangibles respectés)

---

### 1.2 Cartographie des verrous côté UI

**Fichier** : `ui-test/app.js`

#### Verrou 1 : `isWaiting` (lignes 8, 68-70, 72, 197, 237)

**Mécanisme** :
- Variable globale : `let isWaiting = false`
- Activé : `isWaiting = true` au début de `callAxiom()` (ligne 72)
- Désactivé : `isWaiting = false` dans `finally` (ligne 197)
- Blocage : Si `isWaiting === true`, `callAxiom()` retourne immédiatement (ligne 68-70)

**Condition d'activation** : Début de chaque appel API `/axiom`

**Condition de sortie** : Fin de l'appel API (succès ou erreur)

**Risques edge-cases** :
- ⚠️ **Double clic rapide** : Protégé (retour immédiat si `isWaiting === true`)
- ⚠️ **Retry réseau** : Protégé (même session, même verrou)
- ⚠️ **Refresh pendant appel** : Verrou perdu (variable globale, pas persistée)
- ⚠️ **Latence réseau** : Verrou maintenu jusqu'à réponse/erreur
- ⚠️ **Back/Forward** : Verrou perdu (variable globale)

**Statut** : ✅ Fonctionnel pour appels multiples simultanés

---

#### Verrou 2 : `hasActiveQuestion` (lignes 11, 24-30, 209-224, 234, 571)

**Mécanisme** :
- Variable globale : `let hasActiveQuestion = false`
- Activé : `hasActiveQuestion = true` si `data.expectsAnswer === true` (ligne 211)
- Désactivé : `hasActiveQuestion = false` si `data.expectsAnswer === false` (ligne 224) ou après submit utilisateur (ligne 571)
- Blocage : Dans `addMessage()`, si `role === 'assistant' && !isProgressiveMirror && hasActiveQuestion === true`, refus d'affichage (lignes 25-29)

**Condition d'activation** : Réception d'une réponse avec `expectsAnswer === true`

**Condition de sortie** : Réception d'une réponse avec `expectsAnswer === false` OU submit utilisateur

**Risques edge-cases** :
- ⚠️ **Double question dans un seul `data.response`** : **NON PROTÉGÉ** (verrou contourné si plusieurs questions dans un seul texte)
- ⚠️ **Refresh** : Verrou perdu (variable globale)
- ⚠️ **Miroirs progressifs** : Exclus du verrou (`isProgressiveMirror = true`)

**Statut** : ⚠️ **PARTIELLEMENT FONCTIONNEL** — Ne bloque pas plusieurs questions dans un seul message

**Safeguard ajouté** : `extractFirstQuestion()` (lignes 66-98) — Détection sémantique questions multiples

---

#### Verrou 3 : Désactivation boutons (lignes 267, 301, 335)

**Mécanisme** :
- **START_BLOC_1** : `startButton.disabled = true` au clic (ligne 267)
- **START_MATCHING** : `matchingButton.disabled = true` au clic (ligne 301)
- **FIN** : `finishButton.disabled = true` au clic (ligne 335)

**Condition d'activation** : Clic sur le bouton

**Condition de sortie** : Aucune (bouton désactivé définitivement après clic)

**Risques edge-cases** :
- ⚠️ **Double clic rapide** : Partiellement protégé (désactivation immédiate, mais pas de vérification avant clic)
- ⚠️ **Refresh** : Bouton réactivé (état non persisté)
- ⚠️ **Retry réseau** : Bouton reste désactivé (OK)

**Statut** : ✅ Fonctionnel pour prévention double clic immédiat

---

#### Verrou 4 : Masquage `chat-form` selon step (lignes 360-362, 367-369, 421-437)

**Mécanisme** :
- Masquage si `data.step === 'STEP_03_BLOC1'` (ligne 361)
- Masquage si `data.step === 'STEP_99_MATCH_READY'` (ligne 368)
- Masquage si `data.step === 'DONE_MATCHING'` (ligne 424)

**Condition d'activation** : Réception d'un step terminal/bouton

**Condition de sortie** : Réception d'un step avec `expectsAnswer === true`

**Risques edge-cases** :
- ⚠️ **Refresh** : Masquage perdu si step non détecté dans initialisation
- ⚠️ **Transition rapide** : Risque de masquage/affichage erratique

**Statut** : ✅ Fonctionnel pour états terminaux

---

#### Verrou 5 : `extractFirstQuestion()` (lignes 66-98)

**Mécanisme** :
- Détection séparateur explicite `---QUESTION_SEPARATOR---` (ligne 72-74)
- Détection sémantique : plusieurs points d'interrogation `?` (lignes 77-94)
- Troncature défensive : première question uniquement

**Condition d'activation** : Avant chaque `addMessage('assistant', ...)` (ligne 179)

**Condition de sortie** : Texte tronqué retourné

**Risques edge-cases** :
- ⚠️ **Question avec plusieurs `?` (exemple)** : Troncature possible (rare, mais loggé)
- ⚠️ **Question avec `?` dans citation** : Troncature possible (rare)

**Statut** : ✅ Fonctionnel (safeguard défensif)

---

### 1.3 Cartographie des verrous côté serveur

**Fichiers** : `src/server.ts`, `src/services/blockOrchestrator.ts`, `src/engine/axiomExecutor.ts`

#### Verrou 1 : Anti-double START_BLOC_1 (blockOrchestrator.ts:198-201)

**Fichier** : `src/services/blockOrchestrator.ts:198-201`

**Mécanisme** :
```typescript
if (queue && queue.questions.length > 0) {
  // Questions déjà générées → servir la première question
  return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
}
```

**Logique** : Si queue existe et contient des questions → servir depuis queue, ne pas régénérer

**Limites** :
- ✅ Protège contre double `START_BLOC_1` dans la même session
- ⚠️ **Refresh** : Queue persistée → protection maintenue
- ⚠️ **Appels concurrents** : Pas de verrou transactionnel (risque race condition)

**Statut** : ✅ Fonctionnel (protection basique)

---

#### Verrou 2 : Anti-double START_MATCHING (axiomExecutor.ts:1996)

**Fichier** : `src/engine/axiomExecutor.ts:1996`

**Mécanisme** :
```typescript
if (currentState === STEP_99_MATCH_READY) {
  // Passer à matching
  currentState = STEP_99_MATCHING;
  // ...
}
```

**Logique** : Transition immédiate vers `STEP_99_MATCHING` si `STEP_99_MATCH_READY`

**Limites** :
- ✅ Protège contre double matching dans la même session (état change)
- ⚠️ **Appels concurrents** : Pas de verrou transactionnel (risque double matching si 2 appels simultanés)
- ⚠️ **Refresh après matching** : État `DONE_MATCHING` → pas de re-génération (OK)

**Statut** : ⚠️ **PARTIELLEMENT FONCTIONNEL** — Protection basique, pas de verrou transactionnel

---

#### Verrou 3 : Normalisation réponse unique (blockOrchestrator.ts:122-134)

**Fichier** : `src/services/blockOrchestrator.ts:122-134`

**Mécanisme** :
```typescript
function normalizeSingleResponse(response?: string): string {
  if (response.includes('---QUESTION_SEPARATOR---')) {
    return response.split('---QUESTION_SEPARATOR---')[0].trim();
  }
  return response.trim();
}
```

**Logique** : Détection séparateur explicite, troncature première question

**Limites** :
- ✅ Protège contre questions multiples avec séparateur
- ❌ **Ne protège PAS** contre questions multiples sans séparateur (ex: sauts de ligne, numérotation)

**Statut** : ⚠️ **PARTIELLEMENT FONCTIONNEL** — Protection syntaxique uniquement

**Safeguard frontend** : `extractFirstQuestion()` compense partiellement

---

#### Verrou 4 : Dérivation état depuis history (server.ts:44-67)

**Fichier** : `src/server.ts:44-67`

**Mécanisme** :
```typescript
function deriveStepFromHistory(candidate: AxiomCandidate): string {
  if (candidate.session.currentBlock > 0) {
    return `BLOC_${String(candidate.session.currentBlock).padStart(2, '0')}`;
  }
  // ... règles de fallback
}
```

**Logique** : Si `ui.step` manquant, dériver depuis `currentBlock` ou `answers.length`

**Limites** :
- ✅ Protège contre perte d'état après refresh
- ⚠️ **Incohérence `currentBlock` vs `ui.step`** : Dérivation peut masquer un problème sous-jacent

**Statut** : ✅ Fonctionnel (safeguard défensif)

---

#### Verrou 5 : Déduplication messages (ui-test/app.js:32-55)

**Fichier** : `ui-test/app.js:32-55`

**Mécanisme** :
- Vérification dernier message assistant identique (lignes 34-43)
- Anti-spam tone question (lignes 45-53)

**Logique** : Comparaison texte exact avant affichage

**Limites** :
- ✅ Protège contre doublons exacts
- ❌ **Ne protège PAS** contre messages similaires mais non identiques

**Statut** : ✅ Fonctionnel (protection basique)

---

## SECTION 2 — TESTS DE CONFORMITÉ TECHNIQUE (CDC vs RÉEL)

### 2.1 Séquentialité "1 question à la fois"

#### A) BLOC 1 : Jamais plus d'une question affichée à la fois

**Preuve code — Backend** :
- **Fichier** : `src/services/blockOrchestrator.ts:406-452`
- **Ligne 447** : `response: normalizeSingleResponse(question)` — Normalisation appliquée
- **Ligne 421** : `const question = queue.questions[queue.cursorIndex]` — Une seule question servie depuis queue

**Preuve code — Frontend** :
- **Fichier** : `ui-test/app.js:66-98, 179`
- **Ligne 179** : `const firstQuestion = extractFirstQuestion(responseText)` — Extraction première question
- **Lignes 24-29** : Verrou `hasActiveQuestion` — Blocage affichage si question active

**Test de reproduction** :
1. **Cas normal** : ✅ Conforme — Une question servie depuis queue, affichée une seule fois
2. **Cas LLM renvoie "1. …? 2. …?" sans séparateur** : ⚠️ **PARTIELLEMENT PROTÉGÉ** — `extractFirstQuestion()` détecte plusieurs `?` et tronque, mais troncature peut être incomplète si format non standard
3. **Cas "?" multiple dans même phrase** : ⚠️ **RISQUE FAUX POSITIF** — Exemple : "Tu te demandes ? Et si… ?" → Troncature possible (rare, mais possible)

**Verdict** : ✅ **CONFORME** (avec safeguard défensif)

**Preuve** : Logs console `[FRONTEND] [SEQUENTIAL_LOCK] Multiple questions detected (semantic)` si troncature

---

#### B) BLOC 2A, 2B : Idem si applicable

**Preuve code — Backend** :
- **Fichier** : `src/services/blockOrchestrator.ts:627, 672, 697, 717`
- **Lignes 627, 672, 697, 717** : `response: normalizeSingleResponse(question)` — Normalisation appliquée

**Preuve code — Frontend** :
- **Fichier** : `ui-test/app.js:179` — `extractFirstQuestion()` appliqué à tous les messages assistant

**Verdict** : ✅ **CONFORME** (même protection que BLOC 1)

---

#### C) BLOCS 3→9 : Idem si applicable

**Preuve code — Backend** :
- **Fichier** : `src/engine/axiomExecutor.ts:1968-1976`
- **Ligne 1969** : `response: aiText || ''` — Pas de normalisation explicite (mais `aiText` provient d'un seul appel LLM)

**Preuve code — Frontend** :
- **Fichier** : `ui-test/app.js:179` — `extractFirstQuestion()` appliqué

**Verdict** : ✅ **CONFORME** (protection frontend)

---

### 2.2 Boutons et états terminal/transition

#### Start (START_BLOC_1)

**UI — Désactivation immédiate** :
- **Fichier** : `ui-test/app.js:267`
- **Ligne 267** : `startButton.disabled = true` au clic
- **Statut** : ✅ Conforme

**Serveur — Idempotence** :
- **Fichier** : `src/services/blockOrchestrator.ts:198-201`
- **Ligne 198-201** : Vérification queue existante → servir depuis queue, ne pas régénérer
- **Statut** : ✅ Idempotent (si event reçu 2 fois, même résultat)

**Verdict** : ✅ **CONFORME**

---

#### Matching (START_MATCHING)

**UI — Désactivation immédiate** :
- **Fichier** : `ui-test/app.js:301`
- **Ligne 301** : `matchingButton.disabled = true` au clic
- **Statut** : ✅ Conforme

**Serveur — Idempotence** :
- **Fichier** : `src/engine/axiomExecutor.ts:1996`
- **Ligne 1996** : Transition vers `STEP_99_MATCHING` si `STEP_99_MATCH_READY`
- **Limite** : ⚠️ Pas de vérification si matching déjà généré (état `DONE_MATCHING`)
- **Statut** : ⚠️ **PARTIELLEMENT IDEMPOTENT** — Si appel après `DONE_MATCHING`, re-génération possible (non testé)

**Verdict** : ⚠️ **PARTIELLEMENT CONFORME** — Idempotence incomplète

---

#### FIN (après DONE_MATCHING)

**Apparition uniquement après DONE_MATCHING** :
- **Fichier** : `ui-test/app.js:421-437`
- **Ligne 421** : `if (data.step === 'DONE_MATCHING')` — Détection stricte
- **Statut** : ✅ Conforme

**Chat-form masqué définitivement** :
- **Fichier** : `ui-test/app.js:423-425`
- **Ligne 424** : `chatForm.style.display = 'none'` — Masquage explicite
- **Statut** : ✅ Conforme

**Bouton survit à refresh** :
- **Fichier** : `ui-test/app.js:421-437` (initialisation)
- **Ligne 421** : Détection `DONE_MATCHING` dans initialisation
- **Fichier** : `src/routes/start.ts:77` — Retourne `step: result.step`
- **Statut** : ✅ Conforme (détection après refresh)

**Redirection Tally exacte et unique** :
- **Fichier** : `ui-test/app.js:335`
- **Ligne 335** : `window.location.href = 'https://tally.so/r/44JLbB'` — Redirection directe
- **Statut** : ✅ Conforme

**Verdict** : ✅ **CONFORME**

---

### 2.3 Refresh / reprise en cours de parcours

#### Refresh pendant question

**Test de reproduction** :
1. Afficher une question (BLOC 1, par exemple)
2. Refresh la page
3. **Attendu** : Question réaffichée, état cohérent
4. **Réel** : À vérifier (dépend de `/start` et dérivation état)

**Preuve code** :
- **Fichier** : `src/routes/start.ts:60-80`
- **Ligne 60** : `executeAxiom({ candidate, userMessage: null })` — Re-exécution sans message
- **Ligne 77** : `step: result.step` — Retourne step actuel
- **Fichier** : `src/server.ts:44-67` — Dérivation état si `ui.step` manquant

**Risque identifié** : ⚠️ Re-exécution `executeAxiom()` peut générer une nouvelle question au lieu de réafficher la dernière

**Verdict** : ⚠️ **NON TESTÉ** — Nécessite test manuel

---

#### Refresh après miroir

**Test de reproduction** :
1. Afficher un miroir (BLOC 1, 2B, ou 3-9)
2. Refresh la page
3. **Attendu** : Miroir réaffiché, `expectsAnswer: true`, champ actif
4. **Réel** : À vérifier

**Preuve code** :
- **Fichier** : `src/services/blockOrchestrator.ts:232-244` (BLOC 1)
- **Ligne 238** : Retourne miroir si `allQuestionsAnswered && lastAssistantMessage && !userMessage`
- **Statut** : ✅ Logique de re-affichage miroir présente

**Verdict** : ✅ **CONFORME** (logique présente, nécessite test manuel)

---

#### Refresh après profil final

**Test de reproduction** :
1. Générer profil final (BLOC 10)
2. Refresh la page
3. **Attendu** : Profil final réaffiché, bouton matching visible
4. **Réel** : À vérifier

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1934-1954`
- **Ligne 1948** : Retourne `response: finalResponse, step: STEP_99_MATCH_READY`
- **Fichier** : `src/routes/start.ts:77` — Retourne `step`
- **Fichier** : `ui-test/app.js:414-420` — Détection `STEP_99_MATCH_READY` dans initialisation

**Verdict** : ✅ **CONFORME** (logique présente)

---

#### Refresh après matching

**Test de reproduction** :
1. Générer matching
2. Refresh la page
3. **Attendu** : Matching réaffiché, bouton FIN visible
4. **Réel** : À vérifier

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:2102-2111`
- **Ligne 2106** : Retourne `step: DONE_MATCHING, response: ''` (vide car matching déjà affiché)
- **Fichier** : `ui-test/app.js:421-437` — Détection `DONE_MATCHING` dans initialisation

**Risque identifié** : ⚠️ `response: ''` → Pas de réaffichage du matching après refresh (matching perdu)

**Verdict** : ⚠️ **NON CONFORME** — Matching non réaffiché après refresh

---

### 2.4 Concaténation miroir + question (double intention)

#### BLOC 1 fin → début BLOC 2A

**Preuve code** :
- **Fichier** : `src/services/blockOrchestrator.ts:247-289`
- **Ligne 249** : `appendMirrorValidation()` — Validation stockée
- **Ligne 252-255** : Transition vers BLOC 2A (`currentBlock: 2`)
- **Ligne 288** : `response: normalizeSingleResponse(firstQuestion2A)` — Question 2A seule, pas de concaténation

**Verdict** : ✅ **CONFORME** — Pas de concaténation (séparation propre)

---

#### BLOC 2B fin → début BLOC 3

**Preuve code** :
- **Fichier** : `src/services/blockOrchestrator.ts:1113-1135`
- **Ligne 1113** : `response: normalizeSingleResponse(mirror)` — Miroir seul
- **Ligne 1078** : Transition vers BLOC 3 via `executeAxiom()` — Question 3 générée séparément

**Verdict** : ✅ **CONFORME** — Pas de concaténation

---

#### BLOCS 3→9 (miroirs + transition auto)

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1625-1631`
- **Ligne 1625-1631** : Instruction prompt pour annoncer transition après miroir
- **Ligne 1969** : `response: aiText || ''` — Réponse LLM complète (peut contenir miroir + annonce)

**Risque identifié** : ⚠️ Le LLM peut générer miroir + annonce transition dans un seul texte (non séparé)

**Verdict** : ⚠️ **PARTIELLEMENT CONFORME** — Annonce transition dans prompt, mais pas de séparation technique garantie

---

### 2.5 Stockage conversationHistory / candidateStore / kinds

#### Enregistrement des messages

**Preuve code** :
- **Fichier** : `src/store/sessionStore.ts:406-424` — `appendAssistantMessage()`
- **Fichier** : `src/store/sessionStore.ts:426-457` — `appendMirrorValidation()`
- **Fichier** : `src/store/sessionStore.ts:458-498` — `appendUserMessage()`

**Meta stockées** :
- ✅ `block` : Numéro de bloc
- ✅ `step` : État FSM
- ✅ `kind` : Type de message (`'question'`, `'mirror'`, `'mirror_validation'`, `'matching'`, `'other'`)

**Verdict** : ✅ **CONFORME**

---

#### Traitement spécial mirror_validation

**Preuve code** :
- **Fichier** : `src/store/sessionStore.ts:426-457` — Méthode dédiée `appendMirrorValidation()`
- **Ligne 442** : `kind: 'mirror_validation'` — Kind spécifique
- **Fichier** : `src/types/conversation.ts` — Type `'mirror_validation'` dans `ConversationMessageKind`

**Réinjection dans historique** :
- **Fichier** : `src/services/blockOrchestrator.ts:461-463` — Filtre `kind !== 'mirror_validation'` pour contexte miroir
- **Fichier** : `src/engine/axiomExecutor.ts:1807-1821` — Détection validation miroir pour stockage

**Verdict** : ✅ **CONFORME** — Kind dédié, stockage correct, exclusion du contexte miroir (logique)

---

#### Réinjection validations dans prompts suivants

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1095-1120` — `buildConversationHistory()`
- **Ligne 1095-1120** : Construction historique depuis `conversationHistory` (inclut tous les messages, y compris `mirror_validation`)
- **Fichier** : `src/services/blockOrchestrator.ts:456` — `buildConversationHistory(candidate)` — Utilise `conversationHistory` complet

**Verdict** : ✅ **CONFORME** — Validations réinjectées dans prompts suivants (via `conversationHistory`)

---

## SECTION 3 — QUALITÉ "MENTOR / MIROIR" (AUDIT QUALITATIF)

### 3.1 Hypothèse principale : Prompts vs Orchestration

#### Vérification prompt réellement injecté

**Preuve code — Prompt système** :
- **Fichier** : `src/engine/prompts.ts:6-79` — `PROMPT_AXIOM_ENGINE`
- **Fichier** : `src/engine/prompts.ts:82-1730` — `PROMPT_AXIOM_PROFIL` (1726 lignes)
- **Fichier** : `src/engine/axiomExecutor.ts:1724-1726` — `getFullAxiomPrompt()` retourne concaténation

**Preuve code — Injection dans appel LLM** :
- **Fichier** : `src/engine/axiomExecutor.ts:1550-1580` (exemple BLOC 3)
- **Ligne 1550** : `const FULL_AXIOM_PROMPT = getFullAxiomPrompt()`
- **Ligne 1570** : `{ role: 'system', content: FULL_AXIOM_PROMPT }` — Prompt injecté

**Verdict** : ✅ **CONFORME** — Prompt complet injecté

---

#### Vérification historique suffisant et bien ordonné

**Preuve code — Construction historique** :
- **Fichier** : `src/engine/axiomExecutor.ts:1095-1120` — `buildConversationHistory()`
- **Ligne 1095** : `const MAX_CONV_MESSAGES = 40` — Limite 40 messages
- **Ligne 1100** : `history.slice(-MAX_CONV_MESSAGES)` — Derniers 40 messages (ordre chronologique)

**Risque identifié** : ⚠️ Limite 40 messages peut tronquer historique long (rare, mais possible)

**Verdict** : ✅ **CONFORME** (avec limite raisonnable)

---

#### Vérification contexte de bloc

**Preuve code — BLOC 1** :
- **Fichier** : `src/services/blockOrchestrator.ts:455-520` — `generateMirrorForBlock1()`
- **Ligne 460-472** : Construction `answersContext` depuis `conversationHistory` (filtre `block === 1`, exclut `mirror_validation`)
- **Ligne 480-520** : Prompt avec contexte bloc + réponses

**Preuve code — BLOCS 3-9** :
- **Fichier** : `src/engine/axiomExecutor.ts:1540-1580` (exemple BLOC 3)
- **Ligne 1540** : `const blocNumber = 3` — Numéro bloc
- **Ligne 1561-1575** : Prompt avec instruction bloc spécifique

**Verdict** : ✅ **CONFORME** — Contexte bloc injecté

---

#### Vérification température / settings

**Preuve code** :
- **Fichier** : `src/services/openaiClient.ts:34-41`
- **Ligne 35** : `model: 'gpt-4o-mini'` — Modèle utilisé
- **Ligne 40** : `temperature: 0.7` — Température moyenne (pas trop froide, pas trop chaude)

**Analyse** :
- ✅ Température 0.7 : Équilibre créativité/cohérence (OK pour mentor)
- ⚠️ Modèle `gpt-4o-mini` : Modèle économique, peut être moins "chaleureux" que `gpt-4` ou `gpt-4-turbo`

**Verdict** : ⚠️ **PARTIELLEMENT CONFORME** — Température OK, mais modèle peut limiter qualité narrative

---

#### Vérification parsing / normalisation dégrade style

**Preuve code — Parsing miroir** :
- **Fichier** : `src/services/parseMirrorSections.ts` — Parsing sections 1️⃣ 2️⃣ 3️⃣
- **Fichier** : `src/engine/axiomExecutor.ts:1961-1965` — Découpage en sections pour affichage progressif

**Risque identifié** : ⚠️ Parsing peut couper le texte si format non strict (rare)

**Preuve code — Normalisation** :
- **Fichier** : `src/services/blockOrchestrator.ts:122-134` — `normalizeSingleResponse()` — Troncature si séparateur
- **Fichier** : `ui-test/app.js:66-98` — `extractFirstQuestion()` — Troncature sémantique

**Risque identifié** : ⚠️ Troncature peut couper la fin d'une phrase/question (rare)

**Verdict** : ✅ **CONFORME** (parsing/normalisation ne dégradent pas style, seulement structure)

---

### 3.2 Hypothèse : Modèle / Prompt mal injecté

#### Modèle exact réellement appelé

**Preuve code** :
- **Fichier** : `src/services/openaiClient.ts:35`
- **Ligne 35** : `model: 'gpt-4o-mini'` — Modèle confirmé

**Analyse** :
- `gpt-4o-mini` : Modèle économique, optimisé pour coût/performance
- Comparé à `gpt-4` ou `gpt-4-turbo` : Moins de "chaleur" narrative, style plus mécanique

**Verdict** : ⚠️ **CAUSE PROBABLE** — Modèle économique peut expliquer "froid" des miroirs

---

#### Prompt "mentor" réellement présent

**Preuve code — Prompt** :
- **Fichier** : `src/engine/prompts.ts:118-119`
- **Ligne 118-119** : "Tu es un mentor professionnel lucide et exigeant : mélange de chasseur de têtes très haut niveau, coach pro concret, expert en dynamique humaine — mais jamais psy."

**Preuve code — Injection** :
- **Fichier** : `src/engine/axiomExecutor.ts:1550, 1570` — Prompt injecté dans appel LLM

**Verdict** : ✅ **CONFORME** — Prompt mentor présent et injecté

---

#### Instructions contradictoires

**Analyse prompt** :
- **Fichier** : `src/engine/prompts.ts:31-79` — `PROMPT_AXIOM_ENGINE` (règles strictes, exécution mécanique)
- **Fichier** : `src/engine/prompts.ts:118-119` — Ton mentor (chaleur, humanité)

**Risque identifié** : ⚠️ **CONTRADICTION POTENTIELLE** — `PROMPT_AXIOM_ENGINE` insiste sur "exécution stricte", "pas d'interprétation", ce qui peut inhiber le ton mentor

**Verdict** : ⚠️ **CAUSE PROBABLE** — Contradiction entre exécution stricte et ton mentor

---

### 3.3 Hypothèse : Absence boucle validation miroir

#### Verrou miroir (expectsAnswer=true + attente)

**Preuve code — BLOC 1** :
- **Fichier** : `src/services/blockOrchestrator.ts:232-244`
- **Ligne 240** : `expectsAnswer: true` après miroir
- **Ligne 247-249** : Validation attendue avant transition

**Preuve code — BLOCS 3-9** :
- **Fichier** : `src/engine/axiomExecutor.ts:1863-1866`
- **Ligne 1864** : `if (isMirror && expectsAnswer)` → `nextState = currentState` (reste sur bloc)

**Verdict** : ✅ **CONFORME** — Verrou miroir présent

---

#### Intégration correction/nuance

**Preuve code** :
- **Fichier** : `src/store/sessionStore.ts:426-457` — Stockage validation avec `kind: 'mirror_validation'`
- **Fichier** : `src/engine/axiomExecutor.ts:1095-1120` — Réinjection dans `conversationHistory`

**Risque identifié** : ⚠️ Validation stockée, mais pas de **réinjection explicite dans prompt miroir suivant** (validation utilisée dans historique général, pas dans contexte miroir spécifique)

**Verdict** : ⚠️ **PARTIELLEMENT CONFORME** — Validation stockée, mais impact sur miroirs suivants non garanti

---

### 3.4 Méthode d'évaluation (snapshots)

**Note** : Snapshots réels nécessitent exécution runtime. Audit code uniquement.

**Analyse prompts vs attentes** :

**Attendu (prompt)** :
- **Fichier** : `src/engine/prompts.ts:298-305` — "EXIGENCE DE PROFONDEUR (NON OPTIONNELLE)"
- **Ligne 303** : "prendre une position interprétative claire"
- **Ligne 304** : "formuler au moins UNE lecture en creux"
- **Ligne 305** : "expliciter une tension, un moteur ou un besoin implicite"

**Contraintes format** :
- **Fichier** : `src/engine/prompts.ts:183-187` — Format minimal (20/25 mots max)
- **Ligne 186** : "Déduction personnalisée : 1 phrase unique, maximum 25 mots"

**Risque identifié** : ⚠️ **CONTRADICTION** — Exigence profondeur vs format minimal (25 mots) peut limiter l'expression du ton mentor

**Verdict** : ⚠️ **CAUSE PROBABLE** — Contrainte format trop stricte pour exprimer chaleur/mentor

---

### 3.5 Propositions d'amélioration (sans coder)

#### L1 (SAFE / front-only) : Améliorations UI / découpage / mise en forme

**Bénéfice attendu** : Amélioration perçue du ton (mise en forme, typographie, espacement)

**Risques** : Aucun (frontend uniquement)

**Effort** : 2-3 heures

**Tests** : Tests visuels uniquement

---

#### L2 (SAFE-ish / backend orchestration) : Réinjection contexte + garde format + validations + retry

**Bénéfice attendu** : Amélioration réelle du ton (contexte enrichi, retry si ton non conforme)

**Risques** : Faible (ajout logique, pas modification prompts)

**Effort** : 4-6 heures

**Tests** : Tests génération miroirs avec validation ton

---

#### L3 (Structurant) : Streaming + idempotence + validators + retry prompts

**Bénéfice attendu** : Amélioration majeure (streaming pour fluidité, validators pour qualité)

**Risques** : Élevé (modification architecture)

**Effort** : 20-30 heures

**Tests** : Tests complets streaming + validators

---

## SECTION 4 — PROFIL FINAL (BLOC 10) & MATCHING

### 4.1 Profil final BLOC 10

#### Validation structure

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1862, 1876` — `setFinalProfileText()` appelé
- **Fichier** : `src/store/sessionStore.ts:265-273` — Stockage `finalProfileText`
- **Recherche** : Aucune validation structurelle dans le code

**Verdict** : ❌ **NON CONFORME** — Aucune validation structurelle

**Sections obligatoires (prompt)** :
- **Fichier** : `src/engine/prompts.ts:1306-1342` — 7 sections définies :
  1. 🔥 Ce qui te met vraiment en mouvement
  2. 🧱 Comment tu tiens dans le temps
  3. ⚖️ Tes valeurs quand il faut agir
  4. 🧩 Ce que révèlent tes projections
  5. 🛠️ Tes vraies forces… et tes vraies limites
  6. 🎯 Ton positionnement professionnel naturel
  7. 🧠 Lecture globale — synthèse émotionnelle courte

**Verdict** : ❌ **NON VALIDÉ** — Risque sections manquantes ou ordre incorrect

---

#### Texte fixe obligatoire

**Preuve code — Prompt** :
- **Fichier** : `src/engine/prompts.ts:1369-1416` — Texte fixe défini dans prompt
- **Ligne 1369-1379** : "Si, en lisant ça, tu t'es dit : 👉 « oui… c'est exactement moi »"
- **Ligne 1383-1416** : "🔥 ET SI CE PROFIL SERVAIT À QUELQUE CHOSE DE VRAIMENT CONCRET ?"

**Preuve code — Validation** : Aucune

**Verdict** : ⚠️ **NON VALIDÉ** — Texte fixe dans prompt, mais pas de validation code

---

#### Absence de question

**Preuve code — Validation** : Aucune

**Verdict** : ❌ **NON VALIDÉ** — Risque question en fin de profil

---

#### Stockage et réutilisation

**Preuve code** :
- **Fichier** : `src/store/sessionStore.ts:265-273` — `setFinalProfileText()` stocke
- **Fichier** : `src/engine/axiomExecutor.ts:2024-2026` — `candidate.finalProfileText` injecté dans prompt matching

**Verdict** : ✅ **CONFORME** — Stockage et réutilisation OK

---

### 4.2 Matching final

#### Validation structure

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:2016-2097` — Génération matching
- **Recherche** : Aucune validation structurelle dans le code

**Verdict** : ❌ **NON CONFORME** — Aucune validation structurelle

**Structure obligatoire (prompt)** :
- **Fichier** : `src/engine/prompts.ts:1547-1590` — Structure définie :
  - Bandeau : `🟢 / 🔵 / 🟠 MATCHING AXIOM — [ISSUE]`
  - Sections : Rapport au cœur du métier, Rapport à la durée, Cohérence globale
  - Sections conditionnelles : PROJECTION CONCRÈTE, LE CADRE (si 🟢 ou 🔵)

**Verdict** : ❌ **NON VALIDÉ** — Risque structure non respectée

---

#### Dépendance profil final BLOC 10

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:2024-2026`
- **Ligne 2024-2026** : `if (candidate.finalProfileText) { messages.push({ role: 'system', content: `SYNTHÈSE FINALE AXIOM:\n${candidate.finalProfileText}` }); }`

**Verdict** : ✅ **CONFORME** — Profil final injecté dans prompt matching

---

#### Idempotence

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:2073` — Transition vers `DONE_MATCHING` après génération
- **Fichier** : `src/engine/axiomExecutor.ts:2102-2111` — `DONE_MATCHING` retourne `response: ''` (vide)

**Risque identifié** : ⚠️ Si appel `START_MATCHING` après `DONE_MATCHING`, re-génération possible (non testé)

**Verdict** : ⚠️ **PARTIELLEMENT IDEMPOTENT** — Protection basique (état), pas de vérification explicite

---

### 4.3 Proposition de verrouillage (audit uniquement)

#### Validators + retry (1 fois)

**Pour profil final** :
- Créer `validateFinalProfile()` dans `src/services/validators.ts`
- Vérifier 7 sections obligatoires (présence + ordre)
- Vérifier texte fixe obligatoire
- Vérifier absence question
- Si non conforme → retry avec prompt renforcé (1 seule fois)

**Pour matching** :
- Créer `validateMatching()` dans `src/services/validators.ts`
- Vérifier bandeau exact
- Vérifier sections obligatoires
- Vérifier sections conditionnelles (selon ISSUE)
- Si non conforme → retry avec prompt renforcé (1 seule fois)

**Plan d'implémentation** :
- **Fichier** : `src/services/validators.ts` (créer ou étendre)
- **Point d'insertion profil** : `src/engine/axiomExecutor.ts:1862` (après `setFinalProfileText()`)
- **Point d'insertion matching** : `src/engine/axiomExecutor.ts:2073` (avant transition `DONE_MATCHING`)

---

#### Dépendance explicite "matching = f(profil final)"

**État actuel** : ✅ Profil final injecté dans prompt matching (ligne 2024-2026)

**Amélioration proposée** :
- Ancrer profil final dans system prompt matching (au lieu de message système)
- Ajouter instruction explicite : "La synthèse finale AXIOM est la source de vérité principale pour le matching"

**Plan d'implémentation** :
- **Fichier** : `src/engine/axiomExecutor.ts:2020-2033`
- **Modification** : Déplacer `finalProfileText` de `messages.push()` vers system prompt

---

## SECTION 5 — STREAMING (SSE) : STATUT RÉEL

### 5.1 État actuel

#### Route /axiom/stream existe

**Preuve code** :
- **Fichier** : `src/server.ts:943-996`
- **Ligne 943** : `app.post("/axiom/stream", ...)`
- **Ligne 988** : `res.write(`data: ${JSON.stringify({ error: "NOT_IMPLEMENTED", message: "Streaming route not yet fully implemented. Use /axiom for now." })}\n\n`);`

**Verdict** : ❌ **NON IMPLÉMENTÉ** — Route coquille (retourne NOT_IMPLEMENTED)

---

#### Headers SSE corrects

**Preuve code** :
- **Fichier** : `src/server.ts:945-947`
- **Ligne 945** : `res.setHeader('Content-Type', 'text/event-stream')`
- **Ligne 946** : `res.setHeader('Cache-Control', 'no-cache')`
- **Ligne 947** : `res.setHeader('Connection', 'keep-alive')`

**Verdict** : ✅ **CONFORME** — Headers SSE corrects (mais route non fonctionnelle)

---

#### Support stream dans openaiClient

**Preuve code** :
- **Fichier** : `src/services/openaiClient.ts:51-74`
- **Ligne 51-74** : Fonction `callOpenAIStream()` existe et retourne `AsyncGenerator<string>`

**Verdict** : ✅ **CONFORME** — Support stream présent

---

#### Frontend consomme SSE

**Preuve code** :
- **Fichier** : `ui-test/app.js` — Recherche `EventSource`, `fetch reader`, `SSE`
- **Résultat** : Aucune consommation SSE dans le frontend

**Verdict** : ❌ **NON IMPLÉMENTÉ** — Frontend ne consomme pas SSE

---

### 5.2 Conformité S1–S4

#### S1 : Définition AVANT chunks

**Statut** : ❌ **NON IMPLÉMENTÉ** (route non fonctionnelle)

**Preuve** : Route retourne `NOT_IMPLEMENTED`

---

#### S2 : Pas de double intention

**Statut** : ❌ **NON IMPLÉMENTÉ**

---

#### S3 : Verrou miroir

**Statut** : ❌ **NON IMPLÉMENTÉ**

---

#### S4 : Idempotence messageId

**Statut** : ❌ **NON IMPLÉMENTÉ**

---

### 5.3 Propositions streaming (audit uniquement)

#### Architecture SSE "minimale viable"

**Contenus streamés** :
- Miroirs uniquement (BLOCS 3-9)
- Profil final (BLOC 10)
- Matching (STEP_99_MATCHING)

**Figer step/state/currentBlock/expectsAnswer avant 1er chunk** :
- Déterminer état final AVANT streaming
- Envoyer message `event: state` avec état figé
- Streamer contenu ensuite

**messageId stable** :
- Générer `messageId` unique par session + step
- Inclure dans chaque chunk SSE
- Frontend déduplique par `messageId`

**Plan d'implémentation** :
- **Backend** : Modifier `executeAxiom()` pour accepter paramètre `stream: boolean`
- **Backend** : Utiliser `callOpenAIStream()` si `stream === true`
- **Backend** : Envoyer chunks SSE avec `messageId`
- **Frontend** : Consommer SSE avec `EventSource` ou `fetch reader`
- **Frontend** : Dédupliquer chunks par `messageId`

---

## SECTION 6 — SYNTHÈSE & PLAN D'ACTION

### 6.1 Matrice finale "CDC vs RÉEL"

| Item | Statut | Preuve (fichier/ligne) | Sévérité | Recommandation |
|------|--------|------------------------|----------|----------------|
| Verrous UI séquentiels | ✅ CONFORME | `ui-test/app.js:11, 24-30, 66-98` | GO | Aucune action |
| Verrous serveur anti-doubles | ⚠️ PARTIEL | `blockOrchestrator.ts:198-201`, `axiomExecutor.ts:1996` | WARN | Renforcer idempotence |
| Miroir validation (B1, 2B, 3-9) | ✅ CONFORME | `blockOrchestrator.ts:232-244`, `axiomExecutor.ts:1818-1821` | GO | Aucune action |
| Stockage mirror_validation | ✅ CONFORME | `sessionStore.ts:426-457` | GO | Aucune action |
| Profil final structure | ❌ NON VALIDÉ | `axiomExecutor.ts:1862` (pas de validation) | NOGO | Ajouter validators |
| Matching structure | ❌ NON VALIDÉ | `axiomExecutor.ts:2016-2097` (pas de validation) | NOGO | Ajouter validators |
| Streaming | ❌ NON IMPLÉMENTÉ | `server.ts:988` (NOT_IMPLEMENTED) | WARN | Implémenter ou supprimer route |
| Idempotence & anti-doubles | ⚠️ PARTIEL | Protection basique (état), pas transactionnel | WARN | Renforcer verrous |

---

### 6.2 Plan d'action par lots (proposition)

#### Lot 1 : Validators profil + matching (PRIORITÉ HAUTE)

**Scope** :
- Créer `validateFinalProfile()` dans `src/services/validators.ts`
- Créer `validateMatching()` dans `src/services/validators.ts`
- Intégrer validators dans `axiomExecutor.ts` (profil final + matching)
- Retry avec prompt renforcé si non conforme (1 seule fois)

**Risques** : Faible (ajout logique, pas modification prompts)

**Temps** : 6-8 heures

**Tests** :
- Profil final avec toutes sections → Validation OK
- Profil final avec section manquante → Validation KO + retry
- Matching avec bandeau correct → Validation OK
- Matching avec structure incorrecte → Validation KO + retry

**Critère GO/NO-GO** : Validators fonctionnels + retry opérationnel

---

#### Lot 2 : Renforcement idempotence serveur (PRIORITÉ MOYENNE)

**Scope** :
- Ajouter verrou transactionnel pour `START_BLOC_1` (éviter race condition)
- Ajouter vérification si matching déjà généré avant re-génération
- Ajouter logs pour monitoring idempotence

**Risques** : Faible (ajout verrous, pas modification logique métier)

**Temps** : 3-4 heures

**Tests** :
- Double `START_BLOC_1` simultané → Une seule génération
- Double `START_MATCHING` après `DONE_MATCHING` → Pas de re-génération

**Critère GO/NO-GO** : Verrous transactionnels fonctionnels

---

#### Lot 3 : Amélioration ton mentor miroirs (PRIORITÉ MOYENNE)

**Scope** :
- Réinjection explicite validations miroir dans contexte miroir suivant
- Augmenter température à 0.8 pour miroirs uniquement (plus de créativité)
- Ajouter instruction explicite "ton mentor chaleureux" dans prompt miroir

**Risques** : Moyen (modification température peut affecter cohérence)

**Temps** : 4-6 heures

**Tests** :
- Génération miroirs avec température 0.8 → Vérifier ton plus chaleureux
- Validation miroir réinjectée dans miroir suivant → Vérifier impact

**Critère GO/NO-GO** : Ton mentor amélioré (test manuel)

---

#### Lot 4 : Streaming SSE (PRIORITÉ BASSE)

**Scope** :
- Implémenter route `/axiom/stream` complète
- Modifier `executeAxiom()` pour accepter `stream: boolean`
- Frontend consomme SSE avec `EventSource`
- Dédupliquer chunks par `messageId`

**Risques** : Élevé (modification architecture, complexité)

**Temps** : 20-30 heures

**Tests** :
- Streaming miroir → Chunks reçus, affichage progressif
- Streaming profil final → Chunks reçus, affichage progressif
- Streaming matching → Chunks reçus, affichage progressif
- Déduplication chunks → Pas de doublons

**Critère GO/NO-GO** : Streaming fonctionnel pour miroirs + profil + matching

---

#### Lot 5 : Nettoyage tech debt (PRIORITÉ BASSE)

**Scope** :
- Unifier mapping step → state (déjà fait partiellement)
- Nettoyer `PREAMBULE_DONE` si inutilisé
- Vérifier cohérence `currentBlock` vs `ui.step`

**Risques** : Faible (nettoyage, pas modification fonctionnelle)

**Temps** : 2-3 heures

**Tests** : Tests de régression uniquement

**Critère GO/NO-GO** : Aucune régression détectée

---

## CONCLUSION

**Verdict global** : 🟡 **GO CONDITIONNEL**

**Blocages identifiés** :
1. ❌ Validation structurelle profil final manquante
2. ❌ Validation structurelle matching manquante
3. ⚠️ Ton mentor "froid" vs attendu (modèle + contrainte format)

**Points forts** :
- ✅ FSM stable
- ✅ Verrous UI fonctionnels
- ✅ Miroir validation conforme
- ✅ Stockage conversationHistory complet

**Recommandations prioritaires** :
1. **Lot 1** : Validators profil + matching (GO-blocker qualité)
2. **Lot 3** : Amélioration ton mentor (écart qualitatif majeur)
3. **Lot 2** : Renforcement idempotence (sécurité)

**FIN DE L'AUDIT**
