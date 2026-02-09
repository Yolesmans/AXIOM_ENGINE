# 🔍 AUDIT DE FIN DE CHANTIER EXHAUSTIF — AXIOM / REVELIOM

**Date** : 2025-01-27  
**Type** : Audit de conformité produit (niveau senior)  
**Objectif** : Certification complète avant ouverture aux candidats  
**Statut** : Code gelé — Analyse uniquement

---

## 📋 RÉSUMÉ EXÉCUTIF

### 🟢 CONFORMITÉS CONFIRMÉES

1. **Architecture FSM** : Fonctionnelle, transitions linéaires, pas de retour en arrière
2. **Contrats API** : `/start` et `/axiom` stables, validation des paramètres
3. **Persistance** : `conversationHistory` et `candidateStore` fonctionnels
4. **Events** : `START_BLOC_1` et `START_MATCHING` propagés correctement
5. **Format miroir REVELIOM** : Validation structurelle présente (sections, longueur)

### 🟡 FRAGILITÉS IDENTIFIÉES

1. **Mapping step → state** : Logique dupliquée (P4 non corrigé)
2. **Double valeur préambule** : `PREAMBULE_DONE` existe encore (P3 non corrigé)
3. **currentBlock** : Mis à jour à plusieurs endroits (P5 non corrigé)
4. **Protection double clic** : UI uniquement, pas de garde serveur explicite
5. **Déduplication messages** : Aucune protection contre doublons

### 🔴 NON CONFORMITÉS CRITIQUES (BLOQUANTES)

1. **Validation miroir court-circuitée** : BLOC 1, BLOC 2B, BLOCS 3-9 — **VIOLATION CONTRAT REVELIOM**
2. **Nuances validation non stockées** : Pas de méthode dédiée, perte d'information
3. **Concaténation miroir + question** : Frontend affiche les deux dans le même message
4. **Ton 3e personne possible** : Pas de validation explicite dans le code
5. **Profil final** : Pas de validation structurelle (sections obligatoires)
6. **Matching final** : Pas de validation structurelle (format strict)

**VERDICT GO/NO-GO** : **🔴 NO-GO** — La validation des miroirs est impossible, ce qui viole le contrat REVELIOM et rend l'expérience incomplète.

---

## 1️⃣ AUDIT GLOBAL DU FLUX UTILISATEUR (END-TO-END)

### 1.1 Parcours nominal complet

#### ✅ CONFORME — Ordre des étapes

**Parcours attendu** :
1. Identité → Tone → Préambule → Event START_BLOC_1
2. BLOC 1 → MIROIR BLOC 1 → **VALIDATION** → BLOC 2A
3. BLOC 2A → BLOC 2B → MIROIR BLOC 2B → **VALIDATION** → BLOC 3
4. BLOC 3 → MIROIR → **VALIDATION** → BLOC 4 → ... → BLOC 10
5. BLOC 10 → Profil final → MATCH_READY → Event START_MATCHING → MATCHING → DONE

**Preuve code — FSM** :
- `src/engine/axiomExecutor.ts:1086-2043` : Gestion complète de tous les états
- `src/services/blockOrchestrator.ts:124-1698` : Gestion BLOC 1, 2A, 2B
- Transitions linéaires, pas de saut, pas de retour en arrière

**Impact** : ✅ Parcours fonctionnel sur le plan technique

---

#### 🔴 NON CONFORME — Validation miroir absente

**Problème** : Les validations miroir sont court-circuitées à 3 endroits.

**Preuve code — BLOC 1** :
- `src/services/blockOrchestrator.ts:240-268` : Après miroir BLOC 1, génération immédiate question BLOC 2A
- Ligne 262 : `response: mirror + '\n\n' + firstQuestion2A` avec `expectsAnswer: true`
- **Résultat** : Le miroir et la question sont concaténés, validation impossible

**Preuve code — BLOC 2B** :
- `src/services/blockOrchestrator.ts:940-958` : Après miroir BLOC 2B, appel `executeAxiom()` immédiat
- Ligne 952 : `response: mirror + '\n\n' + nextResult.response`
- **Résultat** : Même problème de concaténation

**Preuve code — BLOCS 3-9** :
- `src/engine/axiomExecutor.ts:1795-1797` : Transition automatique si `!expectsAnswer && blocNumber < 10`
- Ligne 1768 : `expectsAnswer = aiText.trim().endsWith('?')` → Un miroir ne se termine pas par `?`, donc `expectsAnswer = false`
- **Résultat** : Le système passe au bloc suivant sans attendre de validation

**Violation prompt** :
- `src/engine/prompts.ts:286-292` : Section 3️⃣ doit contenir "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."
- Cette phrase est une **question ouverte** qui attend une réponse utilisateur
- Le système DOIT attendre cette validation avant de continuer

**Impact utilisateur** : 🔴 **BLOQUANT** — Le candidat ne peut pas valider ou nuancer les miroirs, ce qui viole le contrat REVELIOM.

---

### 1.2 Enchaînements automatiques

#### ⚠️ FRAGILE — Transition automatique préambule → BLOC 1

**Preuve code** :
- `src/engine/prompts.ts:470-475` : "Dès que le PRÉAMBULE MÉTIER a été affiché en totalité, AXIOM ENCHAÎNE AUTOMATIQUEMENT sur le BLOC 1"
- `src/engine/axiomExecutor.ts:1410-1417` : Après réponse tone, génération automatique du préambule
- `src/engine/axiomExecutor.ts:1422-1554` : Gestion STEP_03_BLOC1 (attente bouton START_BLOC_1)

**Impact** : ⚠️ Fonctionnel mais peut surprendre l'utilisateur (pas de pause après préambule)

---

## 2️⃣ AUDIT DES BOUTONS (CRITIQUE)

### 2.1 Bouton "Je commence mon profil"

#### ✅ CONFORME — Protection UI

**Fichier frontend** : `ui-test/app.js:167-199`

**Preuve code** :
- Ligne 193 : `startButton.disabled = true` avant l'appel API
- Ligne 194 : `await callAxiom(null, "START_BLOC_1")`
- Ligne 48-51 : `isWaiting` empêche les appels simultanés

**Impact** : ✅ Protection UI fonctionnelle

---

#### ⚠️ FRAGILE — Pas de garde serveur explicite

**Fichier backend** : `src/server.ts:652-691`

**Preuve code** :
- Ligne 652 : Détection event `START_BLOC_1`
- Aucune vérification de double clic côté serveur
- Si le bouton est cliqué deux fois rapidement (bug réseau), deux events peuvent être envoyés

**Impact** : ⚠️ Risque de double génération si protection UI échoue

---

### 2.2 Bouton "Je génère mon matching"

#### ✅ CONFORME — Protection UI

**Fichier frontend** : `ui-test/app.js:201-233`

**Preuve code** :
- Ligne 227 : `matchingButton.disabled = true` avant l'appel API
- Ligne 228 : `await callAxiom(null, 'START_MATCHING')`
- Ligne 48-51 : `isWaiting` empêche les appels simultanés

**Impact** : ✅ Protection UI fonctionnelle

---

#### ⚠️ FRAGILE — Pas de garde serveur explicite

**Fichier backend** : `src/engine/axiomExecutor.ts:1902-1931`

**Preuve code** :
- Ligne 1903 : Détection `STEP_99_MATCH_READY`
- Ligne 1904 : `if (!userMessage && !event)` → Attente event
- Aucune vérification si le matching a déjà été généré

**Impact** : ⚠️ Risque de double matching si protection UI échoue

---

### 2.3 Bouton d'envoi des réponses

#### ✅ CONFORME — Protection UI

**Fichier frontend** : `ui-test/app.js:437-470`

**Preuve code** :
- Ligne 442 : `if (!message || isWaiting || !sessionId) { return; }`
- Ligne 451 : `userInput.disabled = true` avant l'appel API
- Ligne 448 : `userInput.value = ''` (vidage immédiat)

**Impact** : ✅ Protection UI fonctionnelle

---

#### ⚠️ FRAGILE — Pas de déduplication serveur

**Fichier backend** : `src/store/sessionStore.ts:370-420`

**Preuve code** :
- `appendUserMessage()` fait un `push()` sans vérification de doublon
- Si un message est envoyé deux fois (bug réseau), il sera stocké deux fois

**Impact** : ⚠️ Doublons possibles dans l'historique

---

## 3️⃣ AUDIT DES TRANSITIONS ENTRE BLOCS

### 3.1 Préambule → BLOC 1

#### ✅ CONFORME

**Preuve code** :
- `src/engine/axiomExecutor.ts:1422-1554` : Gestion STEP_03_BLOC1
- Event `START_BLOC_1` déclenche le BLOC 1
- `src/services/blockOrchestrator.ts:124-277` : Gestion BLOC 1

**Impact** : ✅ Transition fonctionnelle

---

### 3.2 BLOC 1 → Miroir → Validation → BLOC 2A

#### 🔴 NON CONFORME — Validation court-circuitée

**Preuve code** :
- `src/services/blockOrchestrator.ts:240-268` : Après miroir BLOC 1, génération immédiate question BLOC 2A
- Ligne 262 : `response: mirror + '\n\n' + firstQuestion2A` avec `expectsAnswer: true`
- **Résultat** : Le miroir et la question sont concaténés, validation impossible

**Violation prompt** :
- `src/engine/prompts.ts:286-292` : Section 3️⃣ doit se terminer par "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."
- Le système DOIT attendre une réponse utilisateur avant de continuer

**Impact utilisateur** : 🔴 **BLOQUANT** — Validation impossible

---

### 3.3 BLOC 2A → BLOC 2B

#### ✅ CONFORME

**Preuve code** :
- `src/services/blockOrchestrator.ts:476-723` : Gestion BLOC 2A
- Transition automatique vers BLOC 2B après 3 questions
- Aucun miroir après BLOC 2A (conforme aux prompts)

**Impact** : ✅ Transition fonctionnelle

---

### 3.4 BLOC 2B → Miroir → Validation → BLOC 3

#### 🔴 NON CONFORME — Validation court-circuitée

**Preuve code** :
- `src/services/blockOrchestrator.ts:940-958` : Après miroir BLOC 2B, appel `executeAxiom()` immédiat
- Ligne 952 : `response: mirror + '\n\n' + nextResult.response`
- **Résultat** : Le miroir et la question BLOC 3 sont concaténés, validation impossible

**Impact utilisateur** : 🔴 **BLOQUANT** — Validation impossible

---

### 3.5 BLOCS 3-9 → Miroir → Validation → Bloc suivant

#### 🔴 NON CONFORME — Transition automatique sans validation

**Preuve code** :
- `src/engine/axiomExecutor.ts:1795-1797` : Transition automatique si `!expectsAnswer && blocNumber < 10`
- Ligne 1768 : `expectsAnswer = aiText.trim().endsWith('?')` → Un miroir ne se termine pas par `?`, donc `expectsAnswer = false`
- **Résultat** : Le système passe au bloc suivant sans attendre de validation

**Violation prompt** :
- `src/engine/prompts.ts:286-292` : Section 3️⃣ se termine par "Dis-moi si ça te parle...", qui est une question ouverte
- Le système DOIT forcer `expectsAnswer: true` après un miroir

**Impact utilisateur** : 🔴 **BLOQUANT** — Validation impossible

---

### 3.6 BLOC 10 → Profil final → MATCH_READY

#### ✅ CONFORME

**Preuve code** :
- `src/engine/axiomExecutor.ts:1798-1803` : Fin BLOC 10 → `STEP_99_MATCH_READY`
- Ligne 1802 : `candidateStore.setFinalProfileText(candidate.candidateId, aiText)`
- Ligne 1857 : `finalResponse = (aiText || '') + '\n\nProfil terminé. Quand tu es prêt, génère ton matching.'`

**Impact** : ✅ Transition fonctionnelle

---

### 3.7 MATCH_READY → Event START_MATCHING → MATCHING

#### ✅ CONFORME

**Preuve code** :
- `src/engine/axiomExecutor.ts:1902-1931` : Gestion STEP_99_MATCH_READY
- Ligne 1904 : `if (!userMessage && !event)` → Attente event
- `src/engine/axiomExecutor.ts:1933-2017` : Gestion STEP_99_MATCHING avec event `START_MATCHING`

**Impact** : ✅ Transition fonctionnelle

---

## 4️⃣ AUDIT DES MIROIRS (CONFORMITÉ REVELIOM)

### 4.1 Format exact (3 sections)

#### ✅ CONFORME — Validation structurelle

**Fichier** : `src/services/validateMirrorReveliom.ts:6-55`

**Preuve code** :
- Ligne 10-16 : Détection sections obligatoires (1️⃣, 2️⃣, 3️⃣)
- Ligne 22-34 : Validation longueur (20 mots section 1, 25 mots section 2)
- Ligne 36-44 : Validation lecture en creux
- Ligne 46-49 : Interdictions (synthèse, conclusion, global, métier, compatibilité)

**Intégration** :
- `src/services/blockOrchestrator.ts:452` : Validation BLOC 1
- `src/engine/axiomExecutor.ts:1720` : Validation BLOCS 3-9

**Impact** : ✅ Format validé, retry si non conforme

---

### 4.2 Lecture en creux présente

#### ✅ CONFORME — Validation explicite

**Preuve code** :
- `src/services/validateMirrorReveliom.ts:36-44` : Détection "probablement pas X, mais plutôt Y"
- Si absente, erreur : "Lecture en creux absente"

**Impact** : ✅ Lecture en creux validée

---

### 4.3 Signal faible (pas de synthèse, pas de conclusion)

#### ✅ CONFORME — Interdictions validées

**Preuve code** :
- `src/services/validateMirrorReveliom.ts:46-49` : Détection mots interdits (synthèse, conclusion, global, métier, compatibilité)
- Si détecté, erreur : "Formulation interdite détectée"

**Impact** : ✅ Interdictions validées

---

### 4.4 Ton mentor

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Les prompts contiennent cette règle, mais la vérification nécessite un test runtime.

**Impact** : ⚠️ Nécessite test manuel pour confirmer

---

### 4.5 Adresse directe au candidat (2e personne)

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Les prompts contiennent cette règle, mais la vérification nécessite un test runtime.

**Impact** : ⚠️ Nécessite test manuel pour confirmer

---

### 4.6 AUCUNE 3e personne

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Aucune validation explicite dans le code pour détecter "il", "ce profil", prénom en 3e personne.

**Impact** : ⚠️ Risque de 3e personne non détectée

---

### 4.7 Validation utilisateur après miroir

#### 🔴 NON CONFORME — Court-circuitée à 3 endroits

**Preuve code — BLOC 1** :
- `src/services/blockOrchestrator.ts:262` : `response: mirror + '\n\n' + firstQuestion2A`
- Le miroir et la question sont concaténés

**Preuve code — BLOC 2B** :
- `src/services/blockOrchestrator.ts:952` : `response: mirror + '\n\n' + nextResult.response`
- Même problème

**Preuve code — BLOCS 3-9** :
- `src/engine/axiomExecutor.ts:1795-1797` : Transition automatique si `!expectsAnswer`
- `expectsAnswer = false` après un miroir (car ne se termine pas par `?`)

**Impact utilisateur** : 🔴 **BLOQUANT** — Validation impossible

---

### 4.8 Champ de saisie actif après miroir

#### 🔴 NON CONFORME — Question affichée avant validation

**Preuve code frontend** :
- `ui-test/app.js:106-129` : Affichage progressif miroir + extraction question suivante
- Ligne 123-126 : Affichage de la question immédiatement après la section 3️⃣ du miroir

**Impact utilisateur** : 🔴 **BLOQUANT** — Validation impossible

---

### 4.9 Nuances stockées et réutilisables

#### 🔴 NON CONFORME — Pas de méthode dédiée

**Preuve code** :
- `src/store/sessionStore.ts` : Aucune méthode `appendMirrorValidation()` ou équivalent
- Les validations sont stockées via `appendUserMessage()` avec `kind: 'other'`
- Pas de réinjection dans les prompts des blocs suivants

**Impact** : 🔴 **BLOQUANT** — Nuances non réutilisables, perte d'information

---

## 5️⃣ AUDIT DES QUESTIONS (ANTI-DOUBLE QUESTION)

### 5.1 Questions concaténées

#### 🔴 NON CONFORME — Miroir + question dans même message

**Preuve code — BLOC 1** :
- `src/services/blockOrchestrator.ts:262` : `response: mirror + '\n\n' + firstQuestion2A`
- Le miroir et la question sont concaténés

**Preuve code — BLOC 2B** :
- `src/services/blockOrchestrator.ts:952` : `response: mirror + '\n\n' + nextResult.response`
- Même problème

**Preuve code frontend** :
- `ui-test/app.js:109` : Extraction de la question après le miroir et affichage immédiat

**Impact utilisateur** : 🔴 **BLOQUANT** — Deux intentions cognitives dans un même message

---

### 5.2 Question affichée alors que expectsAnswer=false

#### ⚠️ FRAGILE — Cas limite possible

**Preuve code** :
- `src/engine/axiomExecutor.ts:1711` : `expectsAnswer = aiText.trim().endsWith('?')`
- Si une question ne se termine pas par `?`, `expectsAnswer = false`
- Mais la question peut quand même être affichée

**Impact** : ⚠️ Risque de question affichée avec champ désactivé

---

## 6️⃣ AUDIT DU TON ET DE L'ADRESSE AU CANDIDAT

### 6.1 Adresse directe (tu / toi)

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Les prompts contiennent cette règle, mais la vérification nécessite un test runtime.

**Impact** : ⚠️ Nécessite test manuel pour confirmer

---

### 6.2 Aucune 3e personne

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Aucune validation explicite dans le code pour détecter "il", "ce profil", prénom en 3e personne.

**Impact** : ⚠️ Risque de 3e personne non détectée

---

### 6.3 Ton mentor (ni RH, ni narrateur externe)

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Les prompts contiennent cette règle, mais la vérification nécessite un test runtime.

**Impact** : ⚠️ Nécessite test manuel pour confirmer

---

## 7️⃣ AUDIT DE LA SORTIE PROFIL FINAL (BLOC 10)

### 7.1 Structure respectée à 100%

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code — Prompt** :
- `src/engine/prompts.ts:1300-1347` : Structure obligatoire avec sections :
  - 🔥 Ce qui te met vraiment en mouvement
  - 🧱 Comment tu tiens dans le temps
  - ⚖️ Tes valeurs quand il faut agir
  - 🧩 Ce que révèlent tes projections
  - 🛠️ Tes vraies forces… et tes vraies limites
  - 🎯 Ton positionnement professionnel naturel
  - 🧠 Lecture globale — synthèse émotionnelle courte

**Preuve code — Génération** :
- `src/engine/axiomExecutor.ts:1798-1803` : Fin BLOC 10 → `setFinalProfileText()`
- Aucune validation structurelle dans le code

**Impact** : ⚠️ Risque de structure non respectée non détectée

---

### 7.2 Ordre des sections

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Les prompts définissent l'ordre, mais aucune validation dans le code.

**Impact** : ⚠️ Risque d'ordre incorrect non détecté

---

### 7.3 Ton

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Les prompts définissent le ton, mais aucune validation dans le code.

**Impact** : ⚠️ Nécessite test manuel pour confirmer

---

### 7.4 Absence de synthèse prématurée

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Les prompts interdisent la synthèse avant BLOC 10, mais aucune validation dans le code.

**Impact** : ⚠️ Risque de synthèse prématurée non détectée

---

### 7.5 Texte fixe obligatoire

#### ✅ CONFORME — Texte fixe présent dans prompt

**Preuve code** :
- `src/engine/prompts.ts:1362-1416` : Texte fixe obligatoire défini dans le prompt
- "Si, en lisant ça, tu t'es dit : 👉 « oui… c'est exactement moi »" (ligne 1369-1379)
- "🔥 ET SI CE PROFIL SERVAIT À QUELQUE CHOSE DE VRAIMENT CONCRET ?" (ligne 1383-1416)

**Impact** : ✅ Texte fixe défini, mais pas de validation dans le code

---

## 8️⃣ AUDIT DE LA SORTIE MATCHING FINAL

### 8.1 Format identique au prompt

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code — Prompt** :
- `src/engine/prompts.ts:1543-1721` : Structure obligatoire :
  - `━━━━━━━━━━━━━━━━━━`
  - `🟢 / 🔵 / 🟠 MATCHING AXIOM — [ISSUE]`
  - `━━━━━━━━━━━━━━━━━━`
  - 1 phrase de verdict clair
  - 1 paragraphe explicatif maximum
  - 🔎 Lecture de compatibilité (3 points)
  - 🧭 Cadrage humain
  - 💼 PROJECTION CONCRÈTE (si aligné/conditionnel)
  - 🧭 LE CADRE (si aligné/conditionnel)
  - 🚀 POUR ALLER PLUS LOIN (bloc figé)

**Preuve code — Génération** :
- `src/engine/axiomExecutor.ts:1933-2017` : Génération matching
- Aucune validation structurelle dans le code

**Impact** : ⚠️ Risque de format incorrect non détecté

---

### 8.2 Ton mentor

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Les prompts définissent le ton, mais aucune validation dans le code.

**Impact** : ⚠️ Nécessite test manuel pour confirmer

---

### 8.3 Pas de double question

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Les prompts interdisent les questions après matching, mais aucune validation dans le code.

**Impact** : ⚠️ Risque de question non détectée

---

### 8.4 Pas de suggestions parasites

#### ⚠️ NON CERTIFIABLE PAR LECTURE SEULE

**Preuve code** : Les prompts interdisent les suggestions, mais aucune validation dans le code.

**Impact** : ⚠️ Risque de suggestions non détectées

---

### 8.5 Texte fixe obligatoire

#### ✅ CONFORME — Texte fixe présent dans prompt

**Preuve code** :
- `src/engine/prompts.ts:1647-1648` : Exemple chiffré obligatoire
- `src/engine/prompts.ts:1682-1711` : Bloc "POUR ALLER PLUS LOIN" figé

**Impact** : ✅ Texte fixe défini, mais pas de validation dans le code

---

## 9️⃣ AUDIT FRONT / BACK DE SYNCHRONISATION

### 9.1 Désynchronisations possibles

#### ⚠️ FRAGILE — Mapping step → state dupliqué

**Preuve code** :
- `src/server.ts:72-90` : Fonction `mapStepToState()`
- `src/server.ts:284` : Utilisation dans `/start`
- `src/server.ts:897` : Utilisation dans `/axiom`
- `src/server.ts:271` : Logique locale pour états avancés dans `/start`

**Impact** : ⚠️ Risque d'incohérence si la logique locale diverge

---

### 9.2 Refresh à chaque étape

#### ✅ CONFORME — Dérivation d'état depuis historique

**Preuve code** :
- `src/engine/axiomExecutor.ts:1096-1120` : `deriveStateFromConversationHistory()`
- `src/server.ts:44-67` : `deriveStepFromHistory()`
- Dérivation basée sur `currentBlock`, `answers.length`, `tonePreference`, `identity.completedAt`

**Impact** : ✅ Refresh fonctionne, état correctement restauré

---

### 9.3 Reprise après miroir non validé

#### 🔴 NON CONFORME — Question affichée après refresh

**Preuve code** :
- `src/services/blockOrchestrator.ts:262` : Miroir + question concaténés
- Après refresh, le système peut afficher la question même si le miroir n'a pas été validé

**Impact** : 🔴 **BLOQUANT** — Validation impossible après refresh

---

### 9.4 Cas edge (session invalide, message dupliqué)

#### ⚠️ FRAGILE — Pas de protection explicite

**Preuve code** :
- `src/server.ts:188-195` : Création nouvelle session si sessionId fourni mais candidat introuvable
- `src/store/sessionStore.ts:370-420` : Pas de déduplication dans `appendUserMessage()`

**Impact** : ⚠️ Risque de perte de session ou doublons

---

## 🔟 AUDIT STREAMING / UX PERÇUE

### 10.1 Où le streaming est pertinent

#### ⚠️ ANALYSE UNIQUEMENT (SANS IMPLÉMENTATION)

**Miroirs** : ✅ Pertinent — Affichage progressif des 3 sections (déjà implémenté partiellement)
- `ui-test/app.js:106-129` : Affichage progressif avec délais 900ms
- `src/services/parseMirrorSections.ts` : Parsing des sections

**Profil final** : ✅ Pertinent — Texte long, impression de lenteur
- Pas encore implémenté

**Matching** : ✅ Pertinent — Texte long, impression de lenteur
- Pas encore implémenté

**Questions courtes** : ❌ Non pertinent — Texte court, pas de valeur ajoutée

---

### 10.2 Impacts sur FSM / expectsAnswer

#### ⚠️ ANALYSE UNIQUEMENT

**Risques** :
- Si streaming activé, `expectsAnswer` doit être déterminé avant le début du streaming
- Le frontend doit attendre la fin du streaming avant d'activer le champ de saisie
- Risque de désynchronisation si le streaming échoue

**Impact** : ⚠️ Nécessite une architecture spécifique

---

### 10.3 Hypothèses d'implémentation

#### ⚠️ ANALYSE UNIQUEMENT

**Option 1 — SSE (Server-Sent Events)** :
- Route `/axiom/stream` déjà créée (`src/server.ts:940-994`)
- Nécessite modification de `callOpenAI()` pour supporter streaming
- Frontend doit gérer les chunks

**Option 2 — Faux streaming (découpage backend)** :
- Découpage du texte en chunks côté backend
- Envoi progressif avec délais
- Plus simple mais moins "vrai"

**Option 3 — Hybride** :
- Streaming réel pour miroirs/profil/matching
- Affichage normal pour questions

**Impact** : ⚠️ Nécessite développement spécifique

---

## 📊 MATRICE DE CONFORMITÉ EXHAUSTIVE

| Catégorie | Élément | Statut | Fichier | Ligne | Impact |
|-----------|---------|--------|---------|-------|--------|
| **FLUX** | Parcours nominal | ✅ OK | `axiomExecutor.ts` | 1086-2043 | Fonctionnel |
| **FLUX** | Validation miroir BLOC 1 | 🔴 NON CONFORME | `blockOrchestrator.ts` | 262 | Court-circuitée |
| **FLUX** | Validation miroir BLOC 2B | 🔴 NON CONFORME | `blockOrchestrator.ts` | 952 | Court-circuitée |
| **FLUX** | Validation miroir BLOCS 3-9 | 🔴 NON CONFORME | `axiomExecutor.ts` | 1795-1797 | Transition automatique |
| **BOUTONS** | Protection UI START_BLOC_1 | ✅ OK | `ui-test/app.js` | 193 | Fonctionnel |
| **BOUTONS** | Protection serveur START_BLOC_1 | ⚠️ FRAGILE | `server.ts` | 652-691 | Pas de garde explicite |
| **BOUTONS** | Protection UI START_MATCHING | ✅ OK | `ui-test/app.js` | 227 | Fonctionnel |
| **BOUTONS** | Protection serveur START_MATCHING | ⚠️ FRAGILE | `axiomExecutor.ts` | 1902-1931 | Pas de garde explicite |
| **TRANSITIONS** | Préambule → BLOC 1 | ✅ OK | `axiomExecutor.ts` | 1422-1554 | Fonctionnel |
| **TRANSITIONS** | BLOC 1 → Miroir → Validation | 🔴 NON CONFORME | `blockOrchestrator.ts` | 262 | Court-circuitée |
| **TRANSITIONS** | BLOC 2B → Miroir → Validation | 🔴 NON CONFORME | `blockOrchestrator.ts` | 952 | Court-circuitée |
| **TRANSITIONS** | BLOCS 3-9 → Miroir → Validation | 🔴 NON CONFORME | `axiomExecutor.ts` | 1795-1797 | Transition automatique |
| **MIROIRS** | Format (3 sections) | ✅ OK | `validateMirrorReveliom.ts` | 6-55 | Validé |
| **MIROIRS** | Lecture en creux | ✅ OK | `validateMirrorReveliom.ts` | 36-44 | Validé |
| **MIROIRS** | Signal faible | ✅ OK | `validateMirrorReveliom.ts` | 46-49 | Validé |
| **MIROIRS** | Ton mentor | ⚠️ NON CERTIFIABLE | - | - | Test manuel |
| **MIROIRS** | Adresse 2e personne | ⚠️ NON CERTIFIABLE | - | - | Test manuel |
| **MIROIRS** | Aucune 3e personne | ⚠️ NON CERTIFIABLE | - | - | Pas de validation |
| **MIROIRS** | Validation utilisateur | 🔴 NON CONFORME | Multiple | - | Court-circuitée |
| **MIROIRS** | Nuances stockées | 🔴 NON CONFORME | `sessionStore.ts` | - | Non stockées |
| **QUESTIONS** | Concaténation miroir+question | 🔴 NON CONFORME | `blockOrchestrator.ts` | 262, 952 | Double intention |
| **QUESTIONS** | Question si expectsAnswer=false | ⚠️ FRAGILE | `axiomExecutor.ts` | 1711 | Cas limite |
| **TON** | Adresse directe | ⚠️ NON CERTIFIABLE | - | - | Test manuel |
| **TON** | Aucune 3e personne | ⚠️ NON CERTIFIABLE | - | - | Pas de validation |
| **TON** | Ton mentor | ⚠️ NON CERTIFIABLE | - | - | Test manuel |
| **PROFIL FINAL** | Structure respectée | ⚠️ NON CERTIFIABLE | - | - | Pas de validation |
| **PROFIL FINAL** | Ordre sections | ⚠️ NON CERTIFIABLE | - | - | Pas de validation |
| **PROFIL FINAL** | Ton | ⚠️ NON CERTIFIABLE | - | - | Test manuel |
| **PROFIL FINAL** | Texte fixe | ✅ OK | `prompts.ts` | 1362-1416 | Défini |
| **MATCHING** | Format respecté | ⚠️ NON CERTIFIABLE | - | - | Pas de validation |
| **MATCHING** | Ton mentor | ⚠️ NON CERTIFIABLE | - | - | Test manuel |
| **MATCHING** | Pas de double question | ⚠️ NON CERTIFIABLE | - | - | Pas de validation |
| **MATCHING** | Texte fixe | ✅ OK | `prompts.ts` | 1647-1648, 1682-1711 | Défini |
| **SYNC** | Mapping step→state | ⚠️ FRAGILE | `server.ts` | 72-90, 271 | Dupliqué |
| **SYNC** | Refresh | ✅ OK | `axiomExecutor.ts` | 1096-1120 | Fonctionnel |
| **SYNC** | Reprise après miroir | 🔴 NON CONFORME | `blockOrchestrator.ts` | 262 | Question affichée |
| **SYNC** | Cas edge | ⚠️ FRAGILE | Multiple | - | Pas de protection |

---

## 🎯 VERDICT GO/NO-GO FINAL

### 🔴 NO-GO — VALIDATION MIROIR IMPOSSIBLE

**Raison principale** : La validation des miroirs est court-circuitée à 3 endroits :

1. **BLOC 1** : Miroir + question BLOC 2A concaténés (ligne 262 `blockOrchestrator.ts`)
2. **BLOC 2B** : Miroir + question BLOC 3 concaténés (ligne 952 `blockOrchestrator.ts`)
3. **BLOCS 3-9** : Transition automatique sans validation (ligne 1795 `axiomExecutor.ts`)

**Impact produit** : Le candidat ne peut pas valider ou nuancer les miroirs, ce qui viole le contrat REVELIOM et rend l'expérience incomplète.

**Corrections nécessaires** :
1. Après chaque miroir, retourner `expectsAnswer: true` et attendre une réponse utilisateur
2. Stocker les nuances de validation dans `conversationHistory` avec `kind: 'mirror_validation'`
3. Ne pas concaténer le miroir et la question suivante
4. Ne pas passer au bloc suivant tant que la validation n'est pas reçue
5. Forcer `expectsAnswer: true` après un miroir même si le texte ne se termine pas par `?`

**Effort estimé** : 2-3 jours pour corriger les 3 points de validation + stockage des nuances

---

## 📋 PLAN D'ACTION FINAL

### Priorité 1 (BLOQUANT — Avant production)

1. **Validation miroir BLOC 1** : Retourner uniquement le miroir avec `expectsAnswer: true`, attendre validation, puis générer question BLOC 2A
2. **Validation miroir BLOC 2B** : Même logique que BLOC 1
3. **Validation miroir BLOCS 3-9** : Forcer `expectsAnswer: true` après miroir, attendre validation, puis passer au bloc suivant
4. **Stockage nuances** : Ajouter méthode `appendMirrorValidation()` et réinjection dans prompts

### Priorité 2 (FRAGILE — Amélioration qualité)

1. Unifier mapping step → state
2. Supprimer `PREAMBULE_DONE`
3. Centraliser mise à jour `currentBlock`
4. Ajouter déduplication messages
5. Ajouter gardes serveur pour double clic boutons

### Priorité 3 (NON CERTIFIABLE — Tests manuels)

1. Valider ton mentor (questions, miroirs, profil, matching)
2. Valider adresse 2e personne (pas de 3e personne)
3. Valider structure profil final (sections, ordre)
4. Valider format matching (structure, texte fixe)

---

**FIN DE L'AUDIT EXHAUSTIF**
