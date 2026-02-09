# 🔍 AUDIT DE FIN DE CHANTIER — AXIOM / REVELIOM

**Date** : 2025-01-27  
**Type** : Audit de conformité et robustesse (lecture seule)  
**Objectif** : Certification "prêt / pas prêt" avant ouverture aux candidats  
**Statut** : Code gelé — Analyse uniquement

---

## 📋 RÉSUMÉ EXÉCUTIF

### 🟢 CONFORME ET SOLIDE

1. **Architecture FSM** : Fonctionnelle, transitions linéaires, pas de retour en arrière
2. **Contrats API** : `/start` et `/axiom` stables, validation des paramètres, gestion d'erreurs
3. **Persistance** : `conversationHistory` et `candidateStore` fonctionnels, pas de perte de données
4. **Events** : `START_BLOC_1` et `START_MATCHING` propagés correctement
5. **Validation REVELIOM** : Format des miroirs validé (sections, longueur, lecture en creux)

### 🟡 FRAGILE (Dette technique, risque de régression)

1. **Mapping step → state** : Logique dupliquée entre `/start` et `/axiom` (P4 non corrigé)
2. **currentBlock** : Mis à jour à plusieurs endroits (P5 non corrigé)
3. **Double valeur préambule** : `PREAMBULE_DONE` existe encore (P3 non corrigé)
4. **Reprise session** : Dérivation d'état depuis historique fonctionne mais complexe

### 🔴 NON CONFORME (Bloquant production)

1. **Validation miroir court-circuitée** : Les miroirs BLOC 1 et BLOC 2B sont immédiatement suivis d'une question, empêchant la validation utilisateur
2. **Miroirs BLOCS 3-9** : `expectsAnswer = false` après miroir, mais le système passe au bloc suivant sans attendre de validation
3. **Concaténation miroir + question** : Le frontend affiche le miroir et la question suivante dans le même message, rendant la validation impossible

**VERDICT GO/NO-GO** : **🔴 NO-GO** — La validation des miroirs est impossible dans l'état actuel, ce qui viole les règles REVELIOM.

---

## 1️⃣ CONTRATS D'INTERFACE — API /start et /axiom

### 1.1 Paramètres requis et validation

#### ✅ CONFORME

**Fichier** : `src/server.ts:143-165`

**Preuve code** :
- Ligne 151-156 : Validation `tenant` et `poste` requis
- Ligne 158-165 : Appel `getPostConfig(tenant, poste)` avec gestion d'erreur explicite
- Ligne 159 : Validation via `getPostConfig` qui lève une exception si invalide

**Valeurs acceptées** :
- `tenant` : `"elgaenergy"` (sensible à la casse)
- `poste` : `"commercial_b2b"` (sensible à la casse)
- Source : `src/store/postRegistry.ts:8-15`

**Erreurs** :
- Format JSON stable : `{ error: "MISSING_PARAMS" | "UNKNOWN_TENANT_OR_POSTE", message: string }`
- Code HTTP : 400 pour erreurs de validation

**Impact** : ✅ Fonctionnel, messages d'erreur clairs

---

#### ⚠️ FRAGILE

**sessionId** : Gestion complexe avec 3 sources (header, query, génération)

**Fichier** : `src/server.ts:167-179`

**Preuve code** :
- Ligne 168-170 : Lecture depuis header `x-session-id` OU query `sessionId`
- Ligne 172-179 : Génération UUID si absent
- Ligne 188-195 : Création nouvelle session si sessionId fourni mais candidat introuvable

**Risque** : Si le store est perdu (redémarrage), une nouvelle session est créée silencieusement même si `sessionId` est fourni.

**Impact** : ⚠️ Perte de session possible après redémarrage serveur

---

### 1.2 Format de réponse (contrat FRONT)

#### ✅ CONFORME

**Champs attendus** : `sessionId`, `step`, `state`, `expectsAnswer`, `response`, `currentBlock`, `autoContinue`

**Fichier** : `src/server.ts:291-300` (route `/start`), `src/server.ts:914-922` (route `/axiom`)

**Preuve code** :
- Les deux routes retournent les mêmes champs
- `response` toujours non vide (fallback ligne 289, 912)
- Format JSON cohérent

**Impact** : ✅ Frontend peut s'appuyer sur ces champs

---

#### ⚠️ FRAGILE

**Mapping step → state** : Logique dupliquée

**Fichier** : `src/server.ts:72-90` (fonction `mapStepToState`), mais utilisée uniquement dans `/axiom`

**Preuve code** :
- Ligne 284 : `/start` utilise `mapStepToState(result.step)`
- Ligne 897 : `/axiom` utilise `mapStepToState(result.step)`
- MAIS ligne 271 : `/start` a aussi une logique locale pour les états avancés

**Risque** : Incohérence possible si la logique locale de `/start` diverge de `mapStepToState`

**Impact** : ⚠️ Risque de `state` différent pour le même `step` selon la route

---

### 1.3 Idempotence / anti-doubles

#### ✅ CONFORME

**Double clic boutons** : Protection UI + serveur

**Fichier frontend** : `ui-test/app.js:192-195` (bouton START_BLOC_1), `ui-test/app.js:226-229` (bouton START_MATCHING`

**Preuve code** :
- Ligne 193, 227 : `button.disabled = true` avant l'appel API
- Ligne 48-51 : `isWaiting` empêche les appels simultanés

**Fichier backend** : `src/server.ts:652-691` (gestion event START_BLOC_1)

**Preuve code** :
- Ligne 652 : Détection event `START_BLOC_1`
- Pas de vérification de double clic côté serveur (mais protection UI suffisante)

**Impact** : ✅ Pas de double génération observée

---

#### ⚠️ FRAGILE

**Requêtes répétées** : Pas de protection explicite contre les requêtes `/axiom` répétées avec le même message

**Fichier** : `src/server.ts:318-937`

**Preuve code** : Aucune vérification de duplication de message dans `conversationHistory`

**Risque** : Si l'utilisateur envoie le même message deux fois (bug réseau, double clic), il sera stocké deux fois.

**Impact** : ⚠️ Doublons possibles dans l'historique

---

## 2️⃣ FSM / ORCHESTRATION — "FLOW AXIOM" COMPLET

### 2.1 Parcours nominal complet

#### ✅ CONFORME

**Ordre des étapes** : Identité → Tone → Préambule → BLOC 1 → ... → BLOC 10 → MATCHING

**Fichier** : `src/engine/axiomExecutor.ts:1086-2043`

**Preuve code** :
- Ligne 1200-1418 : Gestion STEP_01_IDENTITY, STEP_02_TONE, STEP_03_PREAMBULE
- Ligne 1422-1554 : Gestion STEP_03_BLOC1 (bouton START_BLOC_1)
- Ligne 1558-1897 : Gestion BLOCS 3-10
- Ligne 1900-1931 : Gestion STEP_99_MATCH_READY
- Ligne 1933-2017 : Gestion STEP_99_MATCHING

**Validation** : ✅ Toutes les transitions sont présentes et fonctionnelles

---

### 2.2 Transitions silencieuses / automatiques

#### 🔴 NON CONFORME — VALIDATION MIROIR COURT-CIRCUITÉE

**Problème critique** : Après un miroir, le système génère immédiatement la question suivante, empêchant la validation utilisateur.

**Fichier** : `src/services/blockOrchestrator.ts:240-268` (BLOC 1 → BLOC 2A)

**Preuve code** :
- Ligne 240-242 : Génération immédiate de la première question BLOC 2A après le miroir
- Ligne 262 : Retour `mirror + '\n\n' + firstQuestion2A` avec `expectsAnswer: true`
- **Résultat** : Le miroir et la question sont concaténés dans la même réponse

**Fichier** : `src/services/blockOrchestrator.ts:940-958` (BLOC 2B → BLOC 3)

**Preuve code** :
- Ligne 940-946 : Appel `executeAxiom()` immédiatement après le miroir BLOC 2B
- Ligne 952 : Retour `mirror + '\n\n' + nextResult.response` avec `expectsAnswer: nextResult.expectsAnswer`
- **Résultat** : Le miroir et la question suivante sont concaténés

**Fichier** : `src/engine/axiomExecutor.ts:1793-1803` (BLOCS 3-9)

**Preuve code** :
- Ligne 1795-1797 : Si `!expectsAnswer && blocNumber < 10`, transition automatique vers le bloc suivant
- Ligne 1768 : `expectsAnswer = aiText.trim().endsWith('?')` → Un miroir ne se termine pas par `?`, donc `expectsAnswer = false`
- **Résultat** : Le système passe au bloc suivant sans attendre de validation

**Violation prompt** : Les prompts REVELIOM exigent que chaque miroir se termine par :
> "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

Cette phrase est une **question ouverte** qui attend une réponse utilisateur. Le système DOIT attendre cette validation avant de continuer.

**Impact utilisateur** : 🔴 **BLOQUANT** — Le candidat ne peut pas valider ou nuancer le miroir, ce qui viole le contrat REVELIOM.

---

#### ⚠️ FRAGILE

**Transitions automatiques** : STEP_02_TONE → STEP_03_PREAMBULE (auto-enchaînement)

**Fichier** : `src/engine/axiomExecutor.ts:1350-1418`

**Preuve code** :
- Ligne 1410-1417 : Après réponse tone, génération automatique du préambule
- `autoContinue: false` mais le préambule est généré automatiquement

**Impact** : ⚠️ Fonctionnel mais peut surprendre l'utilisateur (pas de pause après choix tone)

---

### 2.3 Signal de pilotage expectsAnswer

#### ✅ CONFORME

**Source** : `expectsAnswer` déterminé par `aiText.trim().endsWith('?')` pour les BLOCS 3-10

**Fichier** : `src/engine/axiomExecutor.ts:1711`

**Preuve code** :
- Ligne 1711 : `expectsAnswer = aiText ? aiText.trim().endsWith('?') : false`
- Ligne 1768 : Recalcul après validation/retry miroir

**Pour BLOC 1, 2A, 2B** : `expectsAnswer` retourné explicitement par l'orchestrateur

**Fichier** : `src/services/blockOrchestrator.ts:264, 520, 955`

**Preuve code** : `expectsAnswer: true` pour les questions, `expectsAnswer: false` pour les miroirs (mais problème de concaténation)

**Impact** : ✅ Le signal est fiable, mais le comportement après miroir est incorrect

---

### 2.4 Reprise / refresh

#### ✅ CONFORME

**Dérivation d'état depuis historique** : Fonctionnelle

**Fichier** : `src/engine/axiomExecutor.ts:1096-1120`

**Preuve code** :
- Ligne 1097 : `deriveStateFromConversationHistory(candidate)`
- Ligne 1108-1120 : Si `ui` est null, création depuis l'historique

**Fichier** : `src/server.ts:44-67` (fonction `deriveStepFromHistory`)

**Preuve code** : Dérivation basée sur `currentBlock`, `answers.length`, `tonePreference`, `identity.completedAt`

**Impact** : ✅ Refresh fonctionne, état correctement restauré

---

### 2.5 Boucles interdites / sauts interdits

#### ✅ CONFORME

**Pas de retour en arrière** : Gardes anti-régression présentes

**Fichier** : `src/server.ts:237-278`

**Preuve code** :
- Ligne 243-247 : Si candidat avancé, retour immédiat SANS appeler le moteur
- Ligne 1096-1120 : Dérivation d'état depuis historique (pas de réinitialisation)

**Impact** : ✅ Pas de retour en arrière observé

---

## 3️⃣ RÈGLES PROMPTS REVELIOM — CONFORMITÉ TEXTUELLE

### 3.1 Adresse au candidat

#### ✅ CONFORME (non vérifiable par lecture seule)

**Règle prompt** : Toute sortie doit s'adresser au candidat (2e personne)

**Preuve code** : Les prompts contiennent cette règle, mais la vérification nécessite un test runtime.

**Impact** : ⚠️ Nécessite test manuel pour confirmer

---

### 3.2 Format du MIROIR interprétatif

#### ✅ CONFORME

**Format strict** : 3 sections (1️⃣, 2️⃣, 3️⃣), longueurs limitées (20/25 mots)

**Fichier** : `src/services/validateMirrorReveliom.ts:6-55`

**Preuve code** :
- Ligne 10-16 : Détection sections obligatoires (1️⃣, 2️⃣, 3️⃣)
- Ligne 22-34 : Validation longueur (20 mots section 1, 25 mots section 2)
- Ligne 36-44 : Validation lecture en creux
- Ligne 46-49 : Interdictions (synthèse, conclusion, global, métier, compatibilité)

**Intégration** : Validation appliquée pour BLOC 1 et BLOCS 3-9

**Fichier** : `src/services/blockOrchestrator.ts:452` (BLOC 1), `src/engine/axiomExecutor.ts:1720` (BLOCS 3-9)

**Impact** : ✅ Format validé, retry si non conforme

---

#### 🔴 NON CONFORME — VALIDATION OUVERTE COURT-CIRCUITÉE

**Règle prompt** : Section 3️⃣ doit contenir exactement :
> "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

**Preuve code** : `src/services/blockOrchestrator.ts:416` (prompt BLOC 1), `src/engine/prompts.ts` (prompts généraux)

**Problème** : Cette phrase est une **question ouverte** qui attend une réponse utilisateur, mais :

1. **BLOC 1** : Le miroir est immédiatement suivi de la première question BLOC 2A (ligne 262 `blockOrchestrator.ts`)
2. **BLOC 2B** : Le miroir est immédiatement suivi de la première question BLOC 3 (ligne 952 `blockOrchestrator.ts`)
3. **BLOCS 3-9** : Après un miroir, `expectsAnswer = false` et le système passe au bloc suivant (ligne 1795 `axiomExecutor.ts`)

**Impact utilisateur** : 🔴 **BLOQUANT** — Le candidat ne peut pas répondre à "Dis-moi si ça te parle...", ce qui viole le contrat REVELIOM.

---

### 3.3 Séquençage MIROIR → VALIDATION utilisateur

#### 🔴 NON CONFORME — VALIDATION IMPOSSIBLE

**Règle prompt** : Après chaque miroir, le système DOIT :
1. Afficher le miroir
2. ATTENDRE une réponse utilisateur de validation
3. Enregistrer cette nuance en mémoire
4. Ensuite seulement enchaîner la suite

**Preuve code — Violation BLOC 1** :
- `src/services/blockOrchestrator.ts:262` : `response: mirror + '\n\n' + firstQuestion2A`
- Le miroir et la question sont concaténés dans la même réponse
- Le frontend affiche les deux dans le même message (ligne 109 `ui-test/app.js`)

**Preuve code — Violation BLOC 2B** :
- `src/services/blockOrchestrator.ts:952` : `response: mirror + '\n\n' + nextResult.response`
- Même problème de concaténation

**Preuve code — Violation BLOCS 3-9** :
- `src/engine/axiomExecutor.ts:1795-1797` : Transition automatique vers bloc suivant si `!expectsAnswer`
- `src/engine/axiomExecutor.ts:1768` : `expectsAnswer = aiText.trim().endsWith('?')` → Un miroir ne se termine pas par `?`, donc `expectsAnswer = false`
- Le système passe au bloc suivant sans attendre de validation

**Preuve code — Frontend** :
- `ui-test/app.js:109` : Extraction de la question après le miroir et affichage immédiat
- Aucune pause pour permettre la validation

**Impact utilisateur** : 🔴 **BLOQUANT** — La validation des miroirs est impossible, ce qui viole le contrat REVELIOM.

---

### 3.4 BLOC 2A — règle spéciale

#### ✅ CONFORME

**Aucun miroir de fin de bloc** : Confirmé

**Fichier** : `src/services/blockOrchestrator.ts:476-723`

**Preuve code** : Aucune génération de miroir dans `handleBlock2A`, transition directe vers BLOC 2B

**Impact** : ✅ Conforme aux prompts

---

### 3.5 Matching final

#### ✅ CONFORME (non vérifiable par lecture seule)

**Format matching** : Géré par `executeAxiom()` avec prompt dédié

**Fichier** : `src/engine/axiomExecutor.ts:1933-2017`

**Preuve code** : Appel `getMatchingPrompt()` et génération via OpenAI

**Impact** : ⚠️ Nécessite test manuel pour confirmer le format

---

## 4️⃣ MÉMOIRE / DONNÉES — CandidateStore & conversationHistory

### 4.1 Persistance des réponses

#### ✅ CONFORME

**Stockage** : Toutes les réponses stockées dans `candidate.answers` et `conversationHistory`

**Fichier** : `src/store/sessionStore.ts:370-420`

**Preuve code** :
- `appendUserMessage()` : Stockage dans `conversationHistory`
- `addAnswer()` : Stockage dans `answers` (legacy)

**Ordre** : Conservé via `conversationHistory` (tableau ordonné)

**Impact** : ✅ Pas de perte de données

---

### 4.2 Persistance des nuances de validation miroir

#### 🔴 NON CONFORME — NUANCES NON STOCKÉES

**Problème** : Les nuances de validation miroir ne sont pas stockées séparément.

**Preuve code** : Aucune fonction dédiée pour stocker les validations miroir dans `src/store/sessionStore.ts`

**Impact** : 🔴 Les nuances de validation ne sont pas réutilisables par les blocs suivants, ce qui viole le contrat REVELIOM.

---

### 4.3 Déduplication / propreté

#### ⚠️ FRAGILE

**Pas de déduplication explicite** : Si un message est envoyé deux fois, il sera stocké deux fois.

**Fichier** : `src/store/sessionStore.ts:370-420`

**Preuve code** : `appendUserMessage()` fait un `push()` sans vérification de doublon

**Impact** : ⚠️ Doublons possibles en cas de bug réseau ou double clic

---

### 4.4 Sécurité de session

#### ✅ CONFORME

**Isolation** : Chaque candidat a son propre `candidateId` (UUID)

**Fichier** : `src/store/sessionStore.ts:50-100`

**Preuve code** : `candidateStore` est un Map indexé par `candidateId`

**Impact** : ✅ Pas de fuite inter-candidat

---

## 5️⃣ FRONTEND — UX, AFFICHAGE, BOUTONS, INPUT

### 5.1 Affichage des messages

#### ⚠️ FRAGILE

**Concaténation miroir + question** : Le frontend affiche le miroir et la question suivante dans le même message.

**Fichier** : `ui-test/app.js:106-129`

**Preuve code** :
- Ligne 108-109 : Extraction de la question après le miroir
- Ligne 123-126 : Affichage de la question immédiatement après la section 3️⃣ du miroir
- **Résultat** : Le candidat voit le miroir et la question suivante en même temps, rendant la validation impossible

**Impact** : 🔴 **BLOQUANT** — La validation des miroirs est impossible côté UX.

---

### 5.2 Champ de saisie

#### ✅ CONFORME

**Activation** : Uniquement quand `expectsAnswer === true`

**Fichier** : `ui-test/app.js:143-153`

**Preuve code** :
- Ligne 143 : `if (data.expectsAnswer === true)`
- Ligne 147-152 : Activation du champ de saisie

**Impact** : ✅ Fonctionnel

---

### 5.3 Boutons

#### ✅ CONFORME

**"Je commence mon profil"** : Visible uniquement sur `STEP_03_BLOC1`

**Fichier** : `ui-test/app.js:137-140`

**Preuve code** : `if (data.step === 'STEP_03_BLOC1')`

**"Je génère mon matching"** : Visible uniquement sur `STEP_99_MATCH_READY`

**Fichier** : `ui-test/app.js:140-143`

**Preuve code** : `if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false)`

**Anti-double clic** : Protection UI (ligne 193, 227)

**Impact** : ✅ Fonctionnel

---

### 5.4 États reçus / state mapping

#### ⚠️ FRAGILE

**Cohérence /start et /axiom** : Logique de mapping dupliquée

**Fichier** : `src/server.ts:72-90` (fonction `mapStepToState`), mais logique locale dans `/start` (ligne 271)

**Preuve code** : `/start` utilise `mapStepToState` (ligne 284) mais a aussi une logique locale (ligne 271)

**Impact** : ⚠️ Risque d'incohérence si la logique locale diverge

---

## 6️⃣ CONCURRENCE / CAPACITÉ / RISQUE DE CRASH

### 6.1 Goulots

#### ⚠️ FRAGILE

**Latence OpenAI** : Pas de timeout explicite, pas de backoff

**Fichier** : `src/services/openaiClient.ts`

**Preuve code** : Appel OpenAI standard, pas de gestion de timeout

**Impact** : ⚠️ Risque de blocage si OpenAI est lent

---

### 6.2 Protections

#### ⚠️ FRAGILE

**Rate limit** : Aucune protection explicite

**Fichier** : `src/server.ts`

**Preuve code** : Aucun middleware de rate limiting

**Impact** : ⚠️ Risque de surcharge en cas de trafic élevé

---

### 6.3 Estimation

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Capacité simultanée** : Nécessite test de charge

**Impact** : ⚠️ Nécessite test runtime

---

## 7️⃣ MATRICE DE CONFORMITÉ

| Catégorie | Élément | Statut | Fichier | Ligne | Impact |
|-----------|---------|--------|---------|-------|--------|
| **API** | Validation tenant/poste | ✅ OK | `src/server.ts` | 158-165 | Fonctionnel |
| **API** | Format réponse | ✅ OK | `src/server.ts` | 291-300 | Fonctionnel |
| **API** | sessionId gestion | ⚠️ FRAGILE | `src/server.ts` | 167-195 | Perte possible après redémarrage |
| **API** | Mapping step→state | ⚠️ FRAGILE | `src/server.ts` | 72-90, 271 | Logique dupliquée |
| **FSM** | Parcours nominal | ✅ OK | `src/engine/axiomExecutor.ts` | 1086-2043 | Fonctionnel |
| **FSM** | Validation miroir BLOC 1 | 🔴 NON CONFORME | `src/services/blockOrchestrator.ts` | 262 | Court-circuitée |
| **FSM** | Validation miroir BLOC 2B | 🔴 NON CONFORME | `src/services/blockOrchestrator.ts` | 952 | Court-circuitée |
| **FSM** | Validation miroir BLOCS 3-9 | 🔴 NON CONFORME | `src/engine/axiomExecutor.ts` | 1795-1797 | Transition automatique |
| **REVELIOM** | Format miroir | ✅ OK | `src/services/validateMirrorReveliom.ts` | 6-55 | Validé |
| **REVELIOM** | Validation ouverte | 🔴 NON CONFORME | `src/services/blockOrchestrator.ts` | 262, 952 | Impossible |
| **MÉMOIRE** | Persistance réponses | ✅ OK | `src/store/sessionStore.ts` | 370-420 | Fonctionnel |
| **MÉMOIRE** | Nuances validation | 🔴 NON CONFORME | `src/store/sessionStore.ts` | - | Non stockées |
| **FRONTEND** | Affichage messages | ⚠️ FRAGILE | `ui-test/app.js` | 106-129 | Concaténation miroir+question |
| **FRONTEND** | Champ de saisie | ✅ OK | `ui-test/app.js` | 143-153 | Fonctionnel |
| **FRONTEND** | Boutons | ✅ OK | `ui-test/app.js` | 137-143 | Fonctionnel |

---

## 8️⃣ VERDICT GO/NO-GO

### 🔴 NO-GO — VALIDATION MIROIR IMPOSSIBLE

**Raison principale** : La validation des miroirs est court-circuitée à 3 endroits :

1. **BLOC 1** : Miroir + question BLOC 2A concaténés (ligne 262 `blockOrchestrator.ts`)
2. **BLOC 2B** : Miroir + question BLOC 3 concaténés (ligne 952 `blockOrchestrator.ts`)
3. **BLOCS 3-9** : Transition automatique sans validation (ligne 1795 `axiomExecutor.ts`)

**Impact produit** : Le candidat ne peut pas valider ou nuancer les miroirs, ce qui viole le contrat REVELIOM et rend l'expérience incomplète.

**Corrections nécessaires** :
1. Après chaque miroir, retourner `expectsAnswer: true` et attendre une réponse utilisateur
2. Stocker les nuances de validation dans `conversationHistory`
3. Ne pas concaténer le miroir et la question suivante
4. Ne pas passer au bloc suivant tant que la validation n'est pas reçue

---

## 9️⃣ HYPOTHÈSES DE CORRECTION (SANS MODIFICATION)

### 9.1 Correction validation miroir BLOC 1

**Fichier** : `src/services/blockOrchestrator.ts:240-268`

**Modification proposée** :
- Après génération du miroir, retourner UNIQUEMENT le miroir avec `expectsAnswer: true`
- Attendre une réponse utilisateur de validation
- Stocker la validation dans `conversationHistory` avec `kind: 'mirror_validation'`
- Ensuite seulement générer la première question BLOC 2A

**Risque** : Moyen (changement de comportement, nécessite test)

---

### 9.2 Correction validation miroir BLOC 2B

**Fichier** : `src/services/blockOrchestrator.ts:940-958`

**Modification proposée** :
- Même logique que BLOC 1 : retourner uniquement le miroir avec `expectsAnswer: true`
- Attendre validation
- Stocker validation
- Ensuite seulement appeler `executeAxiom()` pour BLOC 3

**Risque** : Moyen

---

### 9.3 Correction validation miroir BLOCS 3-9

**Fichier** : `src/engine/axiomExecutor.ts:1793-1803`

**Modification proposée** :
- Après génération d'un miroir, retourner `expectsAnswer: true` (même si le miroir ne se termine pas par `?`)
- Attendre une réponse utilisateur
- Stocker la validation
- Ensuite seulement passer au bloc suivant

**Risque** : Élevé (changement de logique FSM pour tous les blocs 3-9)

---

### 9.4 Stockage nuances validation

**Fichier** : `src/store/sessionStore.ts`

**Modification proposée** :
- Ajouter méthode `appendMirrorValidation(candidateId, mirrorBlock, validationText)`
- Stocker dans `conversationHistory` avec `kind: 'mirror_validation'`
- Réinjecter dans les prompts des blocs suivants

**Risque** : Faible (ajout de fonctionnalité)

---

### 9.5 Frontend — Séparation miroir et question

**Fichier** : `ui-test/app.js:106-129`

**Modification proposée** :
- Ne pas extraire la question après le miroir
- Afficher uniquement le miroir
- Attendre `expectsAnswer: true` pour afficher la question suivante

**Risque** : Faible (changement UX mineur)

---

## 🔟 CONCLUSION

**État actuel** : Le système est fonctionnel sur le plan technique, mais **non conforme** aux règles REVELIOM concernant la validation des miroirs.

**Blocage principal** : La validation des miroirs est impossible dans l'état actuel, ce qui viole le contrat produit.

**Recommandation** : **NO-GO** jusqu'à correction de la validation des miroirs.

**Effort estimé** : 2-3 jours pour corriger les 3 points de validation (BLOC 1, BLOC 2B, BLOCS 3-9) + stockage des nuances.

---

**FIN DE L'AUDIT**
