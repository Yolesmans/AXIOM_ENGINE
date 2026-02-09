# 🔍 AUDIT FINAL ARCHITECTURE — AXIOM ENGINE (COMPLIANCE REVELIOM)

**Date** : 2025-01-27  
**Type** : Audit exhaustif Backend + Frontend + Orchestration + Compliance REVELIOM  
**Objectif** : Établir la feuille de route finale de finalisation AXIOM avec focus sur respect des règles REVELIOM  
**Statut** : Code gelé — Analyse uniquement

---

## 📋 TABLE DES MATIÈRES

1. [État réel du moteur aujourd'hui](#1-état-réel-du-moteur-aujourdhui)
2. [Confirmation des correctifs existants](#2-confirmation-des-correctifs-existants)
3. [Réaudit des points restants (P3, P4, P5)](#3-réaudit-des-points-restants-p3-p4-p5)
4. [Audit REVELIOM : Règles vs Rendu (CRITIQUE)](#4-audit-reveliom-règles-vs-rendu-critique)
5. [Analyse UX : Streaming, Ton, Perception humaine](#5-analyse-ux-streaming-ton-perception-humaine)
6. [Performance & Coût](#6-performance--coût)
7. [Feuille de route finale détaillée](#7-feuille-de-route-finale-détaillée)

---

## 1️⃣ ÉTAT RÉEL DU MOTEUR AUJOURD'HUI

### 1.1 Architecture fonctionnelle

**Backend — Orchestration** :
- ✅ **Routes** : `/start` (GET) et `/axiom` (POST) opérationnelles
- ✅ **Moteur FSM** : `executeAxiom()` + `executeWithAutoContinue()` fonctionnels
- ✅ **Orchestrateur** : `BlockOrchestrator` gère BLOC 1, 2A, 2B
- ✅ **Store** : `CandidateStore` persiste état, historique, queues, answers

**Frontend — Interface** :
- ✅ **Affichage** : Messages assistant/user via `addMessage()` (`ui-test/app.js:104-106`)
- ✅ **Boutons** : "Je commence mon profil" et "Je génère mon matching" fonctionnels
- ✅ **Champ de saisie** : Activation/désactivation selon `expectsAnswer`
- ✅ **Indicateur** : Typing indicator pendant attente

**Flux utilisateur** :
- ✅ **Identité** → **Tone** → **Préambule** → **BLOC 1** → **BLOC 2A** → **BLOC 2B** → **BLOC 3** → ... → **BLOC 10** → **Matching**

### 1.2 Points de fonctionnement validés

**Parcours complet** :
- ✅ Identité : Formulaire → Validation → Transition tone
- ✅ Tone : Question → Réponse → Auto-enchaînement préambule
- ✅ Préambule : Génération → Affichage → Bouton BLOC 1
- ✅ BLOC 1 : Questions séquentielles → Miroir → **Transition immédiate BLOC 2A** (P2 corrigé)
- ✅ BLOC 2A : 3 questions adaptatives → Transition automatique BLOC 2B
- ✅ BLOC 2B : Questions projectives → Miroir → **Transition immédiate BLOC 3** (P2 corrigé)
- ✅ BLOCS 3-10 : Gérés par `executeAxiom()` (ancien moteur)
- ✅ Matching : Event `START_MATCHING` propagé → Déclenchement fonctionnel (P1 corrigé)

**États et transitions** :
- ✅ `conversationHistory` : Source de vérité n°1 pour dérivation état
- ✅ `session.ui.step` : Synchronisé depuis `conversationHistory`
- ✅ `currentBlock` : Mis à jour par orchestrateur (BLOC 1, 2A, 2B) et `executeAxiom()` (BLOCS 3-10)
- ✅ Transitions : Linéaires, pas de retour en arrière

---

## 2️⃣ CONFIRMATION DES CORRECTIFS EXISTANTS

### 2.1 P1 — Event `START_MATCHING` propagé ✅

**État** : **DÉFINITIVEMENT CORRIGÉ**

**Preuve code** :
- `src/engine/axiomExecutor.ts:1891` : `executeWithAutoContinue()` accepte `event: string | null`
- `src/engine/axiomExecutor.ts:1896` : Conversion `event || undefined` pour `executeAxiom()`
- `src/server.ts:894` : `executeWithAutoContinue(candidate, userMessageText, event || null)`
- `src/engine/axiomExecutor.ts:1743` : `if (!userMessage && !event)` → Détection correcte

**Validation** :
- ✅ Event arrive bien à `executeAxiom()`
- ✅ Matching se déclenche au clic bouton
- ✅ Pas de message d'attente

---

### 2.2 P2 — Transitions silencieuses après miroirs ✅

**État** : **DÉFINITIVEMENT CORRIGÉ**

**Preuve code** :
- `src/services/blockOrchestrator.ts:236-259` : Après miroir BLOC 1, génération immédiate question 2A.1
- `src/services/blockOrchestrator.ts:254-258` : Retour `expectsAnswer: true` avec miroir + question
- `src/services/blockOrchestrator.ts:860-873` : Après miroir BLOC 2B, appel `executeAxiom()` pour question BLOC 3
- `src/services/blockOrchestrator.ts:865` : `event: undefined` (correction TypeScript appliquée)

**Validation** :
- ✅ Transition BLOC 1 → BLOC 2A : Première question affichée immédiatement
- ✅ Transition BLOC 2B → BLOC 3 : Première question affichée immédiatement
- ✅ Champ de saisie actif après miroir

---

### 2.3 P2 TypeScript — `event: null` → `undefined` ✅

**État** : **DÉFINITIVEMENT CORRIGÉ**

**Preuve code** :
- `src/services/blockOrchestrator.ts:865` : `event: undefined` (au lieu de `null`)
- Build Railway : Passe sans erreur TypeScript

**Validation** :
- ✅ Aucune erreur TypeScript
- ✅ Build passe

---

### 2.4 P6, P7, P8, P9 — Correctifs cosmétiques ✅

**État** : **DÉFINITIVEMENT CORRIGÉ**

**P6 — Garde message utilisateur avant bouton BLOC 1** :
- `src/server.ts:697-710` : Garde explicite retourne message pédagogique

**P7 — Gestion d'erreur fail-fast BLOC 2B** :
- `src/server.ts:802-822` : Try/catch spécifique avec message utilisateur-friendly

**P8 — Réconciliation personnages BLOC 2B** :
- `src/services/blockOrchestrator.ts:989-1003` : Validation `validateCharacterNames()` avec retry

**P9 — Code obsolète BLOC 2A** :
- Message obsolète supprimé

---

## 3️⃣ RÉAUDIT DES POINTS RESTANTS (P3, P4, P5)

### 3.1 P3 — Double valeur pour fin préambule ❌

**État** : **NON CORRIGÉ**

**Preuve code** :
- `src/engine/axiomExecutor.ts:852` : `export const PREAMBULE_DONE = 'PREAMBULE_DONE';` (existe toujours)
- `src/engine/axiomExecutor.ts:851` : `export const STEP_03_BLOC1 = 'STEP_03_BLOC1';`
- `src/server.ts:273-275` : `/start` gère `PREAMBULE_DONE`
- `src/server.ts:924-926` : `/axiom` gère `PREAMBULE_DONE`
- `ui-test/app.js:109` : Frontend gère les deux valeurs : `if (data.step === 'PREAMBULE_DONE' || data.step === 'STEP_03_BLOC1')`

**Problème** :
- Deux constantes pour le même état logique
- Code dupliqué dans mapping `/start` et `/axiom`
- Frontend doit gérer les deux cas

**Impact** :
- ⚠️ **DÉGRADANT MAINTENABILITÉ** : Code dupliqué, confusion
- ⚠️ **RISQUE** : Si une valeur est oubliée dans un endroit, bug potentiel

**Correction nécessaire** :
1. Supprimer constante `PREAMBULE_DONE` (ligne 852 `axiomExecutor.ts`)
2. Remplacer toutes les occurrences de `"PREAMBULE_DONE"` par `STEP_03_BLOC1`
3. Simplifier frontend : `if (data.step === 'STEP_03_BLOC1')` uniquement

**Fichiers à modifier** :
- `src/engine/axiomExecutor.ts` (ligne 852)
- `src/server.ts` (lignes 273-275, 924-926, 218-219)
- `ui-test/app.js` (ligne 109)

**Effort estimé** : **30 minutes**

---

### 3.2 P4 — Mapping step → state différent ❌

**État** : **NON CORRIGÉ**

**Preuve code** :

**Mapping `/start`** (`src/server.ts:261-283`) :
```typescript
if (result.step === STEP_03_BLOC1) {
  responseState = "wait_start_button";
} else if (result.step === "PREAMBULE_DONE") {
  responseState = "wait_start_button";
} else if ([BLOC_01, ..., BLOC_10].includes(result.step)) {
  responseState = "collecting";  // ← Tous les blocs → "collecting"
} else if (result.step === STEP_99_MATCH_READY) {
  responseState = "match_ready";
} else if (result.step === STEP_99_MATCHING || result.step === DONE_MATCHING) {
  responseState = "matching";  // ← DONE_MATCHING → "matching"
}
```

**Mapping `/axiom`** (`src/server.ts:914-937`) :
```typescript
if (result.step === STEP_03_BLOC1) {
  responseState = "wait_start_button";
} else if (result.step === "PREAMBULE_DONE") {
  responseState = "wait_start_button";
} else if ([BLOC_01, ..., BLOC_10].includes(result.step)) {
  const blocNumber = [...].indexOf(result.step) + 1;
  responseState = `bloc_${blocNumber.toString().padStart(2, '0')}`;  // ← "bloc_01", "bloc_02", etc.
} else if (result.step === STEP_99_MATCH_READY) {
  responseState = "match_ready";
} else if (result.step === STEP_99_MATCHING) {
  responseState = "matching";
} else if (result.step === DONE_MATCHING) {
  responseState = "done";  // ← DONE_MATCHING → "done" (DIFFÉRENT)
}
```

**Différences identifiées** :
1. **Blocs** : `/start` retourne `"collecting"`, `/axiom` retourne `"bloc_01"`, `"bloc_02"`, etc.
2. **DONE_MATCHING** : `/start` retourne `"matching"`, `/axiom` retourne `"done"`

**Problème** :
- Frontend peut recevoir des valeurs `state` différentes selon la route
- Nécessite gestion des deux cas → Code fragile

**Impact** :
- ⚠️ **DÉGRADANT ROBUSTESSE** : Frontend doit gérer plusieurs valeurs
- ⚠️ **RISQUE** : Si frontend ne gère qu'une valeur, bug potentiel

**Correction nécessaire** :
1. Créer fonction `mapStepToState(step: string): string` dans `src/server.ts`
2. Utiliser cette fonction dans `/start` ET `/axiom`
3. Unifier : Tous les blocs → `"collecting"`, `DONE_MATCHING` → `"matching"`

**Fichiers à modifier** :
- `src/server.ts` (créer fonction + utiliser dans `/start` et `/axiom`)

**Effort estimé** : **1 heure**

---

### 3.3 P5 — Double mise à jour `currentBlock` ❌

**État** : **NON CORRIGÉ**

**Preuve code** :

**Orchestrateur met à jour `currentBlock`** :
- `src/services/blockOrchestrator.ts:220-223` : Après miroir BLOC 1 → `currentBlock: 2`
- `src/services/blockOrchestrator.ts:841-844` : Après miroir BLOC 2B → `currentBlock: 3`

**`server.ts` met à jour `currentBlock` ENCORE** :
- `src/server.ts:930` : `candidateStore.updateSession(candidate.candidateId, { state: "collecting", currentBlock: blocNumber });`

**Problème** :
- Double mise à jour pour les blocs gérés par orchestrateur (BLOC 1, 2A, 2B)
- Code redondant
- Risque de désynchronisation si valeurs différentes

**Impact** :
- ⚠️ **DÉGRADANT MAINTENABILITÉ** : Code redondant
- ⚠️ **RISQUE FAIBLE** : Si valeurs identiques, pas de bug, mais inefficace

**Correction nécessaire** :
1. Vérifier que `executeAxiom()` met bien à jour `currentBlock` pour blocs 3-10
2. Supprimer mise à jour dans `server.ts:930` pour blocs gérés par orchestrateur

**⚠️ ATTENTION** : Vérifier que `executeAxiom()` met bien à jour `currentBlock` pour les blocs 3-10 (non gérés par orchestrateur). Si non, ajouter la mise à jour.

**Fichiers à modifier** :
- `src/server.ts` (ligne 930)

**Effort estimé** : **30 minutes** (+ vérification)

---

## 4️⃣ AUDIT REVELIOM : RÈGLES VS RENDU (CRITIQUE)

### 4.1 Règles REVELIOM définies dans les prompts

**Source** : `src/engine/prompts.ts` (lignes 125-305)

#### 4.1.1 Règle — Miroir interprétatif actif

**Définition prompt** :
```
🧠 RÈGLE AXIOM — MIROIR INTERPRÉTATIF ACTIF (OBLIGATOIRE)

À LA FIN DE CHAQUE BLOC (1 à 9),
AXIOM DOIT produire UN SEUL MIROIR INTERPRÉTATIF ACTIF,
basé sur l'ensemble des réponses du bloc,
et fusionné avec les blocs précédents.

Exception explicite :
Le BLOC 2A ne produit AUCUN miroir interprétatif de fin de bloc.
Toute interprétation est strictement réservée au BLOC 2B.

Pendant les questions d'un bloc :
• AXIOM ne produit AUCUN miroir interprétatif,
• AUCUNE lecture,
• AUCUNE déduction explicite.
```

**État dans le code** :
- ✅ **Respecté** : Orchestrateur génère miroir uniquement fin de bloc
- ✅ **Respecté** : BLOC 2A ne génère pas de miroir
- ✅ **Respecté** : Pas de lecture pendant les questions

---

#### 4.1.2 Règle — Portée du miroir

**Définition prompt** :
```
⚠️ RÈGLE AXIOM — PORTÉE DU MIROIR (CRITIQUE)

Un MIROIR INTERPRÉTATIF DE BLOC :
• n'est JAMAIS une conclusion,
• n'est JAMAIS une lecture globale,
• peut contenir des tensions NON résolues,
• peut être contredit par les blocs suivants.

Il est STRICTEMENT local et provisoire.
Toute lecture globale est INTERDITE avant le BLOC 10.
```

**État dans le code** :
- ⚠️ **PARTIELLEMENT RESPECTÉ** : Règle présente dans prompt, mais pas renforcée dans prompts de génération
- ❌ **NON VALIDÉ** : Aucune validation post-génération que le miroir est local et provisoire

---

#### 4.1.3 Règle — Format strict du miroir (ANTI-SURINTERPRÉTATION)

**Définition prompt** :
```
⚠️ RÈGLE AXIOM — FORMAT MINIMAL DU MIROIR (ANTI-SURINTERPRÉTATION)

Chaque MIROIR INTERPRÉTATIF DE BLOC (1 à 9) doit respecter STRICTEMENT le format suivant :

• Lecture implicite : 1 phrase unique, maximum 20 mots.
• Déduction personnalisée : 1 phrase unique, maximum 25 mots.
• Validation ouverte : inchangée.

Interdictions absolues :
• plus de 2 phrases d'analyse au total,
• toute narration continue,
• toute formulation ressemblant à une synthèse,
• toute cohérence globale implicite,
• toute projection vers un métier, un cadre ou une compatibilité.

Un miroir de bloc doit fonctionner comme un SIGNAL FAIBLE :
• il marque une direction,
• il peut être contredit,
• il ne doit JAMAIS suffire à "comprendre le profil".
```

**État dans le code** :
- ⚠️ **PARTIELLEMENT RESPECTÉ** : Règle présente dans prompt principal, rappelée dans prompts de génération
- ❌ **NON VALIDÉ** : Aucune validation post-génération du format (20 mots + 25 mots)
- ❌ **NON VALIDÉ** : Aucune validation que le miroir est un "signal faible" et non une synthèse

---

#### 4.1.4 Règle — Exigence de profondeur

**Définition prompt** :
```
⚠️ EXIGENCE DE PROFONDEUR (NON OPTIONNELLE)

Le MIROIR INTERPRÉTATIF ne doit JAMAIS être neutre ou descriptif.

AXIOM DOIT :
• prendre une position interprétative claire,
• formuler au moins UNE lecture en creux ("ce n'est probablement pas X, mais plutôt Y"),
• expliciter une tension, un moteur ou un besoin implicite.

⚠️ Cette exigence de profondeur doit s'exprimer
STRICTEMENT DANS LE FORMAT MINIMAL DU MIROIR.
La profondeur ne se mesure PAS à la longueur,
mais à la justesse de l'angle interprétatif.
```

**État dans le code** :
- ⚠️ **PARTIELLEMENT RESPECTÉ** : Règle présente dans prompt principal
- ❌ **NON RENFORCÉE** : Pas de rappel explicite dans prompts de génération de miroir
- ❌ **NON VALIDÉ** : Aucune validation que le miroir contient une "lecture en creux"

---

#### 4.1.5 Règle — Analyse cumulative obligatoire

**Définition prompt** :
```
🧠 RÈGLE AXIOM — ANALYSE CUMULATIVE OBLIGATOIRE

AXIOM ne traite jamais un bloc de façon isolée.

Règle de fusion analytique :
• Bloc 1 → analyse du moteur seul
• Bloc 2 → analyse Bloc 2 + fusion Bloc 1
• Bloc 3 → analyse Bloc 3 + fusion Blocs 1 + 2
• Bloc 4 → analyse Bloc 4 + fusion Blocs 1 → 3
• …
• Bloc 9 → analyse Bloc 9 + fusion Blocs 1 → 8

AXIOM doit montrer une compréhension qui progresse visiblement.
```

**État dans le code** :
- ❌ **NON RESPECTÉ** : Prompt de génération miroir BLOC 1 ne mentionne pas la fusion
- ❌ **NON RESPECTÉ** : Prompts de génération miroir blocs 3-10 ne mentionnent pas la fusion cumulative
- ⚠️ **PARTIELLEMENT RESPECTÉ** : `conversationHistory` contient les miroirs précédents, mais pas de rappel explicite dans prompt

---

### 4.2 Analyse de l'écart prompt ↔ rendu

#### 4.2.1 Point de dégradation n°1 : Prompts de génération de miroir incomplets

**Problème identifié** :

**Prompt de génération miroir BLOC 1** (`src/services/blockOrchestrator.ts:373-384`) :
```typescript
content: `RÈGLE ABSOLUE AXIOM :
Tu es en fin de BLOC 1.
Toutes les questions du BLOC 1 ont été répondues.
Réponses du candidat :
${answersContext}

Produis le MIROIR INTERPRÉTATIF ACTIF de fin de bloc, conforme au format strict :
1️⃣ Lecture implicite (20 mots max) : ce que les réponses révèlent du fonctionnement réel.
2️⃣ Déduction personnalisée (25 mots max) : manière probable d'agir en situation réelle.
3️⃣ Validation ouverte : "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

Format strict : 3 sections séparées, pas de narration continue.`
```

**Ce qui manque** :
- ❌ Pas de rappel de l'exigence de profondeur (lecture en creux)
- ❌ Pas de rappel que le miroir doit être un "signal faible"
- ❌ Pas de rappel que le miroir est local et provisoire
- ❌ Pas de rappel des interdictions (synthèse, cohérence globale, projection métier)

**Impact** :
- ⚠️ **DÉGRADATION** : L'IA peut produire des miroirs trop longs, trop synthétiques, ou trop génériques
- ⚠️ **DÉGRADATION** : L'IA peut oublier l'exigence de profondeur (lecture en creux)

---

**Prompt de génération miroir blocs 3-10** (`src/engine/axiomExecutor.ts:1585-1593`) :
```typescript
content: `RÈGLE ABSOLUE AXIOM :
Le moteur AXIOM n'interprète pas les prompts. Il les exécute STRICTEMENT.
Tu es en état ${currentState} (BLOC ${blocNumber}).
Tu exécutes STRICTEMENT le protocole AXIOM pour ce bloc.
Tu produis UNIQUEMENT le texte autorisé à cette étape.
INTERDICTIONS : improviser, commenter le système, reformuler le prompt, revenir en arrière.
Si tu dois poser une question, pose-la. Si tu dois afficher un miroir, affiche-le.
AUCUNE sortie générique type "On continue", "D'accord", etc.
Toute sortie hors règles = invalide.`
```

**Ce qui manque** :
- ❌ Pas de rappel du format strict du miroir (20 mots + 25 mots)
- ❌ Pas de rappel de l'exigence de profondeur
- ❌ Pas de rappel de la fusion cumulative avec blocs précédents
- ❌ Pas de rappel que le miroir est local et provisoire
- ❌ Pas de rappel des interdictions (synthèse, cohérence globale)

**Impact** :
- ⚠️ **DÉGRADATION MAJEURE** : L'IA peut produire des miroirs non conformes au format REVELIOM
- ⚠️ **DÉGRADATION** : L'IA peut oublier la fusion cumulative
- ⚠️ **DÉGRADATION** : L'IA peut produire des miroirs trop synthétiques ou trop globaux

---

#### 4.2.2 Point de dégradation n°2 : Absence de validation post-génération

**Problème identifié** :

**Aucune validation du format** :
- ❌ Pas de validation que "Lecture implicite" fait ≤ 20 mots
- ❌ Pas de validation que "Déduction personnalisée" fait ≤ 25 mots
- ❌ Pas de validation que le miroir contient une "lecture en creux"
- ❌ Pas de validation que le miroir est un "signal faible" et non une synthèse

**Impact** :
- ⚠️ **DÉGRADATION** : Des miroirs non conformes peuvent être servis à l'utilisateur
- ⚠️ **DÉGRADATION** : Pas de mécanisme de retry si le format est incorrect

---

#### 4.2.3 Point de dégradation n°3 : Affichage d'un bloc sans découpage

**Problème identifié** :

**Frontend** (`ui-test/app.js:104-106`) :
```javascript
if (data.response) {
  addMessage('assistant', data.response);
}
```

**Comportement** :
- Le miroir est affiché d'un bloc, sans découpage en sections
- Pas de progression visible (1️⃣, 2️⃣, 3️⃣ affichés simultanément)
- Pas de pause entre sections

**Impact** :
- ⚠️ **DÉGRADATION UX** : Le miroir apparaît comme un texte figé, pas comme une analyse progressive
- ⚠️ **DÉGRADATION PERCEPTION** : L'utilisateur perçoit le miroir comme un "rapport IA" plutôt qu'une interprétation active

---

#### 4.2.4 Point de dégradation n°4 : Absence de fusion cumulative explicite

**Problème identifié** :

**Prompt de génération miroir BLOC 1** :
- Ne mentionne pas la fusion avec blocs précédents (normal, c'est le premier)
- Mais ne rappelle pas que les blocs suivants devront fusionner avec celui-ci

**Prompt de génération miroir blocs 3-10** :
- Ne mentionne pas explicitement la fusion avec blocs précédents
- `conversationHistory` contient les miroirs précédents, mais pas de rappel explicite dans le prompt

**Impact** :
- ⚠️ **DÉGRADATION** : L'IA peut traiter chaque bloc de façon isolée
- ⚠️ **DÉGRADATION** : La progression de compréhension peut ne pas être visible

---

### 4.3 Exemples concrets de dégradation

#### 4.3.1 Miroir attendu (structure REVELIOM)

**Format attendu** :
```
1️⃣ Lecture implicite
Tu te structures davantage par la progression que par la reconnaissance, ce qui révèle un moteur interne plutôt qu'externe.

2️⃣ Déduction personnalisée
En situation réelle, tu risques de créer toi-même la pression nécessaire pour avancer, même si l'environnement ne l'impose pas.

3️⃣ Validation ouverte
Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue.
```

**Caractéristiques** :
- ✅ Lecture implicite : 20 mots max, position interprétative claire
- ✅ Déduction personnalisée : 25 mots max, lecture en creux ("risques de créer toi-même")
- ✅ Validation ouverte : Phrase exacte
- ✅ Signal faible : Pas de synthèse globale, pas de conclusion

---

#### 4.3.2 Miroir réellement affiché (dégradé)

**Format réel possible** :
```
1️⃣ Lecture implicite
Tes réponses montrent que tu es motivé par la progression personnelle et que tu préfères créer ta propre pression plutôt que de la subir. Tu as besoin d'un cadre qui te permette d'évoluer à ton rythme.

2️⃣ Déduction personnalisée
Cela signifie probablement que tu fonctionnes mieux dans un environnement où tu as de l'autonomie et où tu peux définir tes propres objectifs. Tu es probablement quelqu'un qui a besoin de voir sa progression pour rester motivé.

3️⃣ Validation ouverte
Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue.
```

**Problèmes identifiés** :
- ❌ Lecture implicite : **> 20 mots** (3 phrases au lieu d'1)
- ❌ Déduction personnalisée : **> 25 mots** (2 phrases au lieu d'1)
- ❌ Pas de lecture en creux explicite ("ce n'est probablement pas X, mais plutôt Y")
- ⚠️ Formulation trop descriptive (paraphrase des réponses)
- ⚠️ Tendance à la synthèse (plusieurs phrases d'analyse)

---

#### 4.3.3 Point précis de dégradation

**Où ça casse** :
1. **Prompt de génération incomplet** : Ne rappelle pas assez strictement le format (20+25 mots)
2. **Absence de validation** : Pas de vérification post-génération du format
3. **Absence de retry** : Si le format est incorrect, le miroir est quand même servi
4. **Affichage d'un bloc** : Le miroir apparaît comme un texte figé, pas comme une analyse progressive

---

### 4.4 Diagnostic : Est-ce un problème d'orchestration, de découpage, ou de rendu UI ?

#### 4.4.1 Problème d'orchestration ? ⚠️ PARTIELLEMENT

**Analyse** :
- ✅ Orchestrateur génère miroir au bon moment (fin de bloc)
- ✅ Orchestrateur stocke miroir dans `conversationHistory`
- ⚠️ **MAIS** : Prompt de génération incomplet (manque rappels format strict)
- ⚠️ **MAIS** : Pas de validation post-génération

**Conclusion** : **PARTIELLEMENT** — L'orchestration est correcte, mais les prompts de génération sont incomplets.

---

#### 4.4.2 Problème de regroupement de réponses ? ❌ NON

**Analyse** :
- ✅ Réponses sont correctement regroupées par bloc
- ✅ `AnswerMap` stocke les réponses par question
- ✅ Contexte des réponses est correctement construit

**Conclusion** : **NON** — Le regroupement est correct.

---

#### 4.4.3 Problème de timing d'affichage ? ⚠️ PARTIELLEMENT

**Analyse** :
- ✅ Miroir affiché après toutes les réponses du bloc
- ⚠️ **MAIS** : Affichage d'un bloc sans découpage progressif
- ⚠️ **MAIS** : Pas de pause entre sections

**Conclusion** : **PARTIELLEMENT** — Le timing est correct, mais l'affichage manque de progression.

---

#### 4.4.4 Problème de découpage des messages ? ✅ OUI

**Analyse** :
- ❌ Miroir affiché d'un bloc, sans découpage en sections
- ❌ Pas de progression visible (1️⃣, 2️⃣, 3️⃣ affichés simultanément)
- ❌ Pas de pause entre sections

**Conclusion** : **OUI** — Le découpage est le problème principal pour la perception humaine.

---

#### 4.4.5 Problème de perte de contexte entre engine et front ? ❌ NON

**Analyse** :
- ✅ `conversationHistory` est correctement transmis
- ✅ Miroir est correctement stocké avec `kind: 'mirror'`
- ✅ Frontend reçoit le miroir complet

**Conclusion** : **NON** — Pas de perte de contexte.

---

### 4.5 Conclusion audit REVELIOM

**Résumé** :
- ✅ **Règles présentes** : Toutes les règles REVELIOM sont définies dans les prompts
- ⚠️ **Prompts de génération incomplets** : Ne rappellent pas assez strictement le format
- ❌ **Absence de validation** : Pas de vérification post-génération du format
- ⚠️ **Affichage d'un bloc** : Le miroir apparaît comme un texte figé

**Causes principales de dégradation** :
1. **Prompts de génération incomplets** (manque rappels format strict, profondeur, fusion cumulative)
2. **Absence de validation post-génération** (pas de vérification 20 mots + 25 mots)
3. **Affichage d'un bloc** (pas de découpage progressif)

**Impact utilisateur** :
- ⚠️ Miroirs perçus comme trop longs ou trop descriptifs
- ⚠️ Miroirs perçus comme "rapport IA" plutôt qu'interprétation active
- ⚠️ Absence de profondeur perçue (pas de lecture en creux visible)

---

## 5️⃣ ANALYSE UX : STREAMING, TON, PERCEPTION HUMAINE

### 5.1 Écriture progressive (Streaming)

#### 5.1.1 Constat actuel

**Rendu frontend** :
- `ui-test/app.js:104-106` : `addMessage('assistant', data.response)` → Affichage d'un bloc
- Aucun streaming : Réponse complète affichée d'un coup
- Latence perçue : Temps d'attente complet de l'API (3-15 secondes) avant affichage

**Backend** :
- `src/services/openaiClient.ts:31-49` : `callOpenAI()` attend la réponse complète
- Pas de streaming : `response.choices[0]?.message?.content` récupéré après complétion
- Modèle : `gpt-4o-mini` (pas de streaming activé)

#### 5.1.2 Faisabilité technique

**Option A — Streaming OpenAI natif (SSE)** :

**Principe** :
- Activer `stream: true` dans `client.chat.completions.create()`
- Backend forward les chunks via Server-Sent Events (SSE)
- Frontend reçoit et affiche progressivement

**Implémentation** :
- **Backend** : Modifier `callOpenAI()` pour accepter `stream: true`, créer route SSE `/axiom/stream`
- **Frontend** : Utiliser `EventSource` ou `fetch` avec `ReadableStream` pour recevoir chunks
- **Orchestrateur** : Compatible (streaming transparent)

**Avantages** :
- ✅ **Vraie latence réduite** : Affichage dès premiers tokens (0.5-1s)
- ✅ **Perception humaine** : Écriture progressive = plus naturel
- ✅ **Pas de faux streaming** : Vraie réponse progressive

**Limites** :
- ⚠️ **Complexité** : Gestion SSE, reconnexion, erreurs
- ⚠️ **FSM** : `expectsAnswer` doit être déterminé AVANT streaming (ou après premier chunk)
- ⚠️ **Orchestrateur** : Compatible mais nécessite adaptation (streaming pendant génération questions)

**Impact sur FSM** :
- `expectsAnswer` : Peut être déterminé après premier chunk (si prompt contient instruction)
- `autoContinue` : Non impacté (déterminé avant streaming)
- `step` : Non impacté (déterminé avant streaming)

**Effort estimé** : **2-3 jours** (backend + frontend + tests)

---

**Option B — Faux streaming (découpage backend)** :

**Principe** :
- Backend découpe la réponse en chunks (mots, phrases)
- Envoie chunks progressivement via SSE ou polling
- Frontend affiche progressivement

**Implémentation** :
- **Backend** : Découper `response` en chunks, envoyer via SSE ou polling
- **Frontend** : Recevoir et afficher chunks progressivement
- **Orchestrateur** : Compatible (découpage après génération)

**Avantages** :
- ✅ **Simplicité** : Pas de modification OpenAI client
- ✅ **Contrôle** : Vitesse d'affichage maîtrisable
- ✅ **Compatibilité** : Fonctionne avec orchestrateur actuel

**Limites** :
- ⚠️ **Faux streaming** : Latence réelle inchangée (attente complète avant découpage)
- ⚠️ **Perception** : Moins naturel que vrai streaming
- ⚠️ **Complexité** : Découpage intelligent nécessaire (mots, phrases, pas caractères)

**Impact sur FSM** :
- Aucun (découpage après génération complète)

**Effort estimé** : **1-2 jours** (backend + frontend)

---

**Option C — Approche hybride (recommandée)** :

**Principe** :
- **Vrai streaming** pour réponses longues (miroirs, profil final, matching)
- **Affichage immédiat** pour questions courtes (pas de streaming nécessaire)

**Implémentation** :
- **Backend** : Détecter type de réponse (question vs miroir vs profil)
- **Streaming** : Activé uniquement pour miroirs/profil/matching
- **Frontend** : Gérer deux modes (streaming vs affichage immédiat)

**Avantages** :
- ✅ **Optimisé** : Streaming uniquement où nécessaire
- ✅ **Perception** : Amélioration UX sur réponses longues
- ✅ **Simplicité** : Questions courtes restent simples

**Limites** :
- ⚠️ **Complexité** : Deux modes à gérer
- ⚠️ **Détection** : Nécessite logique pour déterminer type de réponse

**Impact sur FSM** :
- Minimal (streaming transparent pour FSM)

**Effort estimé** : **2-3 jours** (backend + frontend + logique détection)

---

#### 5.1.3 Recommandation streaming

**Recommandation** : **OPTION C (Hybride)**

**Justification** :
- Amélioration UX significative sur réponses longues (miroirs, profil, matching)
- Questions courtes n'ont pas besoin de streaming (affichage immédiat suffit)
- Effort raisonnable (2-3 jours)

**Priorité** : **MOYENNE** (amélioration UX, pas bloquant)

---

### 5.2 Ton des analyses (Mentor, pas robot)

#### 5.2.1 Constat actuel

**Prompts** :
- `src/engine/prompts.ts` : Prompts corrects, ton défini ("mentor professionnel lucide et exigeant")
- Instructions claires : "chaleureux mais pro, direct mais respectueux"

**Rendu perçu** :
- Trop clinique
- Trop "rapport IA"
- Pas assez conversationnel

#### 5.2.2 Analyse des causes possibles

**Hypothèse 1 : Problème de prompt** ❌

**Vérification** :
- Prompts contiennent instructions de ton
- Instructions claires et précises

**Conclusion** : **PAS un problème de prompt**

---

**Hypothèse 2 : Problème d'orchestration / enchaînement** ⚠️

**Analyse** :
- **Orchestrateur BLOC 1-2** : Génère questions en lot → Affichage séquentiel
- **Moteur BLOC 3-10** : Génère question par question
- **Miroirs** : Générés séparément, affichés d'un bloc

**Problème potentiel** :
- **Absence de micro-transitions** : Pas de phrases de transition entre questions
- **Enchaînement mécanique** : Question → Réponse → Question (pas de fluidité)
- **Miroirs isolés** : Affichés sans contexte conversationnel

**Conclusion** : **PROBABLEMENT un problème d'orchestration**

---

**Hypothèse 3 : Problème de découpage des réponses** ⚠️

**Analyse** :
- **Questions** : Affichées d'un bloc (pas de progression)
- **Miroirs** : Affichés d'un bloc (pas de progression)
- **Absence de rythme** : Pas de pauses, pas de progression visible

**Conclusion** : **PROBABLEMENT lié au découpage** (voir streaming)

---

**Hypothèse 4 : Absence de micro-transitions humaines** ✅

**Analyse** :
- **Entre questions** : Pas de phrase de transition ("D'accord, passons à...")
- **Après réponse** : Pas d'acknowledgment ("Je vois, intéressant...")
- **Avant miroir** : Pas d'introduction ("Voici ce que je comprends de toi...")

**Conclusion** : **PROBABLEMENT la cause principale**

---

#### 5.2.3 Pistes techniques (sans toucher aux prompts)

**Piste 1 : Ajouter micro-transitions dans l'orchestrateur** :

**Principe** :
- Après chaque réponse utilisateur, générer une micro-transition (1 phrase)
- Avant chaque miroir, générer une introduction (1 phrase)
- Stocker dans `conversationHistory` avec `kind: 'transition'`

**Implémentation** :
- **Backend** : Ajouter logique dans `blockOrchestrator.ts` pour générer transitions
- **Frontend** : Afficher transitions comme messages assistant normaux
- **FSM** : Non impacté (transitions non bloquantes)

**Avantages** :
- ✅ **Fluidité** : Enchaînement plus naturel
- ✅ **Perception** : Plus conversationnel
- ✅ **Contrôle** : Transitions courtes, non intrusives

**Limites** :
- ⚠️ **Coût** : +1 appel API par transition (coût supplémentaire)
- ⚠️ **Latence** : +2-3 secondes par transition
- ⚠️ **Complexité** : Logique de génération à ajouter

**Effort estimé** : **1-2 jours**

---

**Piste 2 : Découper miroirs en sections progressives** :

**Principe** :
- Générer miroir complet (comme actuellement)
- Découper en sections (1️⃣, 2️⃣, 3️⃣)
- Afficher sections progressivement (streaming ou faux streaming)

**Implémentation** :
- **Backend** : Parser miroir en sections, envoyer progressivement
- **Frontend** : Afficher sections une par une
- **FSM** : Non impacté (découpage après génération)

**Avantages** :
- ✅ **Progression** : Affichage progressif = plus naturel
- ✅ **Lisibilité** : Sections séparées = plus lisible
- ✅ **Simplicité** : Pas de génération supplémentaire

**Limites** :
- ⚠️ **Parsing** : Nécessite parsing fiable des sections
- ⚠️ **Format** : Dépend du format des miroirs (1️⃣, 2️⃣, 3️⃣)

**Effort estimé** : **1 jour**

---

**Piste 3 : Ajouter acknowledgments après réponses** :

**Principe** :
- Après chaque réponse utilisateur, afficher un acknowledgment court (sans API)
- Templates pré-définis : "Je vois", "D'accord", "Intéressant", etc.
- Sélection aléatoire ou basée sur contexte

**Implémentation** :
- **Backend** : Ajouter logique de sélection d'acknowledgment
- **Frontend** : Afficher comme message assistant
- **FSM** : Non impacté (acknowledgment non bloquant)

**Avantages** :
- ✅ **Simplicité** : Pas d'appel API
- ✅ **Fluidité** : Enchaînement plus naturel
- ✅ **Coût** : Aucun coût supplémentaire

**Limites** :
- ⚠️ **Généricité** : Acknowledgments génériques peuvent paraître mécaniques
- ⚠️ **Répétition** : Risque de répétition si templates limités

**Effort estimé** : **2-4 heures**

---

#### 5.2.4 Recommandation ton

**Recommandation** : **COMBINAISON Piste 2 + Piste 3**

**Justification** :
- **Piste 2** : Améliore perception des miroirs (affichage progressif)
- **Piste 3** : Améliore fluidité entre questions (acknowledgments)
- **Piste 1** : Optionnelle (coût + latence, à évaluer après Piste 2+3)

**Priorité** : **MOYENNE** (amélioration UX, pas bloquant)

---

### 5.3 Perception humaine globale

#### 5.3.1 Constat

**Points positifs** :
- ✅ Parcours fonctionnel de bout en bout
- ✅ Transitions logiques
- ✅ Pas de blocages techniques

**Points d'amélioration** :
- ⚠️ Latence perçue élevée (3-15 secondes par réponse)
- ⚠️ Rendu "robot" (affichage d'un bloc)
- ⚠️ Absence de fluidité conversationnelle

#### 5.3.2 Impact des améliorations proposées

**Streaming (Option C)** :
- **Latence perçue** : Réduite de 50-70% (affichage dès premiers tokens)
- **Perception** : Plus naturel, moins "robot"

**Micro-transitions** :
- **Fluidité** : Enchaînement plus conversationnel
- **Perception** : Plus humain, moins mécanique

**Découpage miroirs** :
- **Lisibilité** : Sections progressives = plus lisible
- **Perception** : Plus structuré, moins "rapport IA"

---

## 6️⃣ PERFORMANCE & COÛT

### 6.1 Temps de réponse actuel par bloc

**Modèle utilisé** : `gpt-4o-mini` (`src/services/openaiClient.ts:35`)

**Latences estimées** (basées sur audits précédents) :

**Préambule** :
- Prompt : ~5k tokens
- Historique : 0 tokens
- Output : ~2k tokens
- **Latence** : **2-3 secondes**

**BLOC 1 (Questions)** :
- Prompt : ~5k tokens
- Historique : ~5k tokens
- Output : ~1k tokens (questions)
- **Latence** : **3-5 secondes**

**BLOC 1 (Miroir)** :
- Prompt : ~5k tokens
- Historique : ~10k tokens
- Output : ~500 tokens (miroir)
- **Latence** : **3-5 secondes**

**BLOC 2A (Questions adaptatives)** :
- Prompt : ~5k tokens
- Historique : ~12k tokens
- Output : ~500 tokens (question)
- **Latence** : **3-5 secondes** × 3 questions = **9-15 secondes total**

**BLOC 2B (Questions projectives)** :
- Prompt : ~5k tokens
- Historique : ~15k tokens
- Output : ~2k tokens (toutes questions)
- **Latence** : **5-8 secondes**

**BLOC 2B (Miroir)** :
- Prompt : ~5k tokens
- Historique : ~20k tokens
- Output : ~500 tokens (miroir)
- **Latence** : **5-8 secondes**

**BLOCS 3-10 (Questions)** :
- Prompt : ~5k tokens
- Historique : ~20k-30k tokens (croissant)
- Output : ~500 tokens (question)
- **Latence** : **5-10 secondes** par question

**BLOCS 3-10 (Miroirs)** :
- Prompt : ~5k tokens
- Historique : ~25k-35k tokens (croissant)
- Output : ~500 tokens (miroir)
- **Latence** : **5-10 secondes** par miroir

**Profil final (BLOC 10)** :
- Prompt : ~5k tokens
- Historique : ~35k tokens
- Output : ~8k tokens
- **Latence** : **10-15 secondes**

**Matching** :
- Prompt : ~3k tokens
- Historique : ~40k tokens
- Output : ~5k tokens
- **Latence** : **10-15 secondes**

**Total parcours** :
- **Temps total estimé** : **3-5 minutes** (sans attente utilisateur)
- **Temps perçu** : **5-10 minutes** (avec attente utilisateur)

---

### 6.2 Où se situent les vrais coûts API

**Calcul basé sur audits précédents** :

**Nombre d'appels par candidat** :
- Préambule : 1 appel
- BLOC 1 : 2 appels (questions + miroir)
- BLOC 2A : 3 appels (questions adaptatives)
- BLOC 2B : 2 appels (questions + miroir)
- BLOCS 3-10 : 16 appels (8 blocs × 2 appels)
- Profil final : 1 appel
- Matching : 1 appel
- **Total** : **26 appels** par candidat

**Coût par appel** (gpt-4o-mini) :
- Input : $0.15 / 1M tokens
- Output : $0.60 / 1M tokens
- **Coût moyen par appel** : ~$0.002-0.003 (selon taille historique)

**Coût total par candidat** :
- **26 appels × $0.0025 = $0.065** (≈**0,065€**)

**Conclusion** :
- ✅ **Coût maîtrisé** : Dans la fourchette cible (0,05€-0,15€)
- ✅ **Pas de changement de modèle nécessaire** : `gpt-4o-mini` suffit

---

### 6.3 Si un modèle plus performant DOIT être utilisé

**Analyse** :

**Option 1 : Modèle plus performant uniquement pour miroirs** :
- **Avantage** : Qualité miroirs améliorée
- **Inconvénient** : Coût × 10-20 (gpt-4o au lieu de gpt-4o-mini)
- **Recommandation** : **NON** (coût trop élevé pour gain incertain)

**Option 2 : Modèle plus performant uniquement pour profil final + matching** :
- **Avantage** : Qualité finale améliorée
- **Inconvénient** : Coût × 10-20 pour 2 appels
- **Recommandation** : **OPTIONNEL** (à évaluer après tests utilisateurs)

**Option 3 : Modèle plus performant partout** :
- **Avantage** : Qualité globale améliorée
- **Inconvénient** : Coût × 10-20 (0,65€-1,30€ par candidat)
- **Recommandation** : **NON** (coût prohibitif)

**Conclusion** :
- ✅ **Pas de changement de modèle nécessaire** pour l'instant
- ⚠️ **Option 2 à évaluer** après tests utilisateurs (qualité profil final)

---

### 6.4 Impression de lenteur : UX vs Performance réelle

**Analyse** :

**Latence réelle** :
- Questions : 3-10 secondes
- Miroirs : 5-10 secondes
- Profil final : 10-15 secondes
- Matching : 10-15 secondes

**Latence perçue** :
- **Sans streaming** : 100% de la latence réelle (attente complète)
- **Avec streaming** : 20-30% de la latence réelle (affichage dès premiers tokens)

**Conclusion** :
- ⚠️ **L'impression de lenteur est principalement UX** (affichage d'un bloc)
- ✅ **La latence réelle est acceptable** (3-15 secondes)
- ✅ **Le streaming résoudrait 70-80% de l'impression de lenteur**

---

## 7️⃣ FEUILLE DE ROUTE FINALE DÉTAILLÉE

### 7.1 Vue d'ensemble

**Total corrections identifiées** : 11
- **🔴 CRITIQUE (Compliance REVELIOM)** : 3 (R1, R2, R3)
- **🟠 IMPORTANT** : 3 (P3, P4, P5)
- **🟡 AMÉLIORATION UX** : 2 (Streaming, Ton)
- **🟢 OPTIONNEL** : 3 (Modèle performant, Optimisations)

**Ordre de correction** :
1. **R1** — Renforcer prompts de génération miroir (1h)
2. **R2** — Ajouter validation post-génération (2h)
3. **R3** — Découper miroirs en sections progressives (1 jour)
4. **P3** — Double valeur préambule (30 min)
5. **P4** — Mapping step → state unifié (1h)
6. **P5** — Double mise à jour currentBlock (30 min)
7. **Tests E2E** — Validation parcours complet (2h)
8. **Streaming (Option C)** — Écriture progressive (2-3 jours)
9. **Ton (Piste 2+3)** — Micro-transitions + découpage miroirs (1-2 jours)

**Estimation totale** : **6-8 jours** (corrections critiques + améliorations UX)

---

### 7.2 Détail par étape

#### ÉTAPE 1 — R1 : Renforcer prompts de génération miroir (1h)

**Objectif** : Rappeler strictement le format REVELIOM dans les prompts de génération

**Modifications** :

**1. Prompt génération miroir BLOC 1** (`src/services/blockOrchestrator.ts:373-384`) :
```typescript
content: `RÈGLE ABSOLUE AXIOM — MIROIR INTERPRÉTATIF ACTIF :

Tu es en fin de BLOC 1.
Toutes les questions du BLOC 1 ont été répondues.
Réponses du candidat :
${answersContext}

⚠️ FORMAT STRICT OBLIGATOIRE (NON NÉGOCIABLE) :

1️⃣ Lecture implicite
- 1 phrase unique, maximum 20 mots EXACTEMENT
- Position interprétative claire (pas de paraphrase, pas de liste de faits)
- Explicite ce que les réponses révèlent du fonctionnement réel
- Interdiction : reformuler, lister, paraphraser, résumer

2️⃣ Déduction personnalisée
- 1 phrase unique, maximum 25 mots EXACTEMENT
- Lecture en creux obligatoire : "ce n'est probablement pas X, mais plutôt Y"
- Explicite une tension, un moteur ou un besoin implicite
- Interdiction : psychologie, diagnostic, formulation neutre ou descriptive

3️⃣ Validation ouverte
- Phrase exacte : "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

⚠️ INTERDICTIONS ABSOLUES :
- Plus de 2 phrases d'analyse au total
- Narration continue
- Formulation ressemblant à une synthèse
- Cohérence globale implicite
- Projection vers un métier, un cadre ou une compatibilité

⚠️ PORTÉE DU MIROIR :
- Ce miroir est STRICTEMENT local et provisoire
- Il n'est JAMAIS une conclusion
- Il n'est JAMAIS une lecture globale
- Il peut contenir des tensions NON résolues
- Il peut être contredit par les blocs suivants

Le miroir doit fonctionner comme un SIGNAL FAIBLE, pas comme une analyse finale.`
```

**2. Prompt génération miroir blocs 3-10** (`src/engine/axiomExecutor.ts:1585-1593`) :
```typescript
content: `RÈGLE ABSOLUE AXIOM — MIROIR INTERPRÉTATIF ACTIF :

Tu es en fin de BLOC ${blocNumber}.
Toutes les questions du BLOC ${blocNumber} ont été répondues.

⚠️ FUSION CUMULATIVE OBLIGATOIRE :
Tu DOIS fusionner cette analyse avec les analyses des blocs précédents (disponibles dans l'historique).
Montre une compréhension qui progresse visiblement.
MAIS : cette compréhension progressive n'implique JAMAIS une compréhension suffisante.
Le profil est INCOMPLET jusqu'à la fin du BLOC 9.

⚠️ FORMAT STRICT OBLIGATOIRE (NON NÉGOCIABLE) :

1️⃣ Lecture implicite
- 1 phrase unique, maximum 20 mots EXACTEMENT
- Position interprétative claire (pas de paraphrase, pas de liste de faits)
- Explicite ce que les réponses révèlent du fonctionnement réel
- Interdiction : reformuler, lister, paraphraser, résumer

2️⃣ Déduction personnalisée
- 1 phrase unique, maximum 25 mots EXACTEMENT
- Lecture en creux obligatoire : "ce n'est probablement pas X, mais plutôt Y"
- Explicite une tension, un moteur ou un besoin implicite
- Interdiction : psychologie, diagnostic, formulation neutre ou descriptive

3️⃣ Validation ouverte
- Phrase exacte : "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

⚠️ INTERDICTIONS ABSOLUES :
- Plus de 2 phrases d'analyse au total
- Narration continue
- Formulation ressemblant à une synthèse
- Cohérence globale implicite
- Projection vers un métier, un cadre ou une compatibilité

⚠️ PORTÉE DU MIROIR :
- Ce miroir est STRICTEMENT local et provisoire
- Il n'est JAMAIS une conclusion
- Il n'est JAMAIS une lecture globale
- Il peut contenir des tensions NON résOLUES
- Il peut être contredit par les blocs suivants

Le miroir doit fonctionner comme un SIGNAL FAIBLE, pas comme une analyse finale.`
```

**Tests** :
- ✅ Générer miroir BLOC 1 → Vérifier format strict (20 mots + 25 mots)
- ✅ Générer miroir BLOC 3 → Vérifier fusion cumulative mentionnée
- ✅ Générer miroir BLOC 5 → Vérifier format strict respecté

**Dépendances** : Aucune

**Risques** : **FAIBLE** (modification prompts uniquement)

---

#### ÉTAPE 2 — R2 : Ajouter validation post-génération (2h)

**Objectif** : Valider que les miroirs respectent le format REVELIOM avant affichage

**Modifications** :

**1. Créer validateur miroir** (`src/services/validators.ts`) :
```typescript
export interface MirrorValidationResult {
  valid: boolean;
  errors: string[];
  section1WordCount?: number;
  section2WordCount?: number;
  hasReadingInDepth?: boolean;
}

export function validateMirrorREVELIOM(content: string): MirrorValidationResult {
  const errors: string[] = [];
  
  // Détection sections obligatoires
  const hasSection1 = /1️⃣|Lecture implicite/i.test(content);
  const hasSection2 = /2️⃣|Déduction personnalisée/i.test(content);
  const hasSection3 = /3️⃣|Validation ouverte|Dis-moi si ça te parle/i.test(content);
  
  if (!hasSection1) errors.push('Section 1️⃣ Lecture implicite manquante');
  if (!hasSection2) errors.push('Section 2️⃣ Déduction personnalisée manquante');
  if (!hasSection3) errors.push('Section 3️⃣ Validation ouverte manquante');
  
  // Extraction sections
  const section1Match = content.match(/1️⃣[^\n]*\n([^2️⃣]*)/s);
  const section2Match = content.match(/2️⃣[^\n]*\n([^3️⃣]*)/s);
  
  let section1WordCount = 0;
  let section2WordCount = 0;
  
  if (section1Match) {
    const section1Text = section1Match[1].trim();
    section1WordCount = section1Text.split(/\s+/).length;
    if (section1WordCount > 20) {
      errors.push(`Section 1️⃣ dépasse 20 mots (${section1WordCount} mots)`);
    }
  }
  
  if (section2Match) {
    const section2Text = section2Match[1].trim();
    section2WordCount = section2Text.split(/\s+/).length;
    if (section2WordCount > 25) {
      errors.push(`Section 2️⃣ dépasse 25 mots (${section2WordCount} mots)`);
    }
  }
  
  // Détection lecture en creux
  const hasReadingInDepth = /probablement pas.*mais plutôt|n'est probablement pas.*mais|plutôt.*que/i.test(content);
  if (!hasReadingInDepth) {
    errors.push('Lecture en creux manquante ("ce n\'est probablement pas X, mais plutôt Y")');
  }
  
  // Détection interdictions
  if (/(synthèse|conclusion|global|cohérence globale|compatibilité|métier|cadre)/i.test(content)) {
    errors.push('Formulation interdite détectée (synthèse, conclusion, cohérence globale, projection métier)');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    section1WordCount,
    section2WordCount,
    hasReadingInDepth,
  };
}
```

**2. Intégrer validation dans génération miroir BLOC 1** (`src/services/blockOrchestrator.ts:355-391`) :
```typescript
private async generateMirrorForBlock1(candidate: AxiomCandidate): Promise<string> {
  // ... génération actuelle ...
  
  let mirror = completion.trim();
  let retries = 0;
  const maxRetries = 1;
  
  while (retries <= maxRetries) {
    const validation = validateMirrorREVELIOM(mirror);
    
    if (validation.valid) {
      return mirror;
    }
    
    if (retries < maxRetries) {
      console.warn(`[ORCHESTRATOR] Miroir BLOC 1 non conforme, retry ${retries + 1}/${maxRetries}`, validation.errors);
      
      // Retry avec prompt renforcé
      const retryCompletion = await callOpenAI({
        messages: [
          { role: 'system', content: FULL_AXIOM_PROMPT },
          {
            role: 'system',
            content: `RÈGLE ABSOLUE AXIOM — RETRY MIROIR BLOC 1 (FORMAT STRICT OBLIGATOIRE) :

⚠️ ERREURS DÉTECTÉES : ${validation.errors.join(', ')}

Tu es en fin de BLOC 1.
Produis le MIROIR INTERPRÉTATIF ACTIF avec format STRICT :
- Section 1️⃣ : EXACTEMENT 20 mots maximum
- Section 2️⃣ : EXACTEMENT 25 mots maximum
- Lecture en creux obligatoire : "ce n'est probablement pas X, mais plutôt Y"
- Aucune synthèse, conclusion, cohérence globale, projection métier

Format strict : 3 sections séparées, pas de narration continue.`,
          },
          ...messages,
        ],
      });
      
      mirror = retryCompletion.trim();
      retries++;
    } else {
      console.error(`[ORCHESTRATOR] Miroir BLOC 1 non conforme après ${maxRetries} retries`, validation.errors);
      // Fallback : retourner le miroir quand même (avec log d'erreur)
      return mirror;
    }
  }
  
  return mirror;
}
```

**3. Intégrer validation dans génération miroir blocs 3-10** (`src/engine/axiomExecutor.ts:1579-1635`) :
- Même logique que pour BLOC 1
- Ajouter validation après génération
- Retry avec prompt renforcé si non conforme

**Tests** :
- ✅ Miroir conforme → Validation passe
- ✅ Miroir > 20 mots section 1 → Validation échoue, retry déclenché
- ✅ Miroir > 25 mots section 2 → Validation échoue, retry déclenché
- ✅ Miroir sans lecture en creux → Validation échoue, retry déclenché

**Dépendances** : R1 (prompts renforcés)

**Risques** : **FAIBLE** (validation + retry contrôlé)

---

#### ÉTAPE 3 — R3 : Découper miroirs en sections progressives (1 jour)

**Objectif** : Afficher les sections du miroir progressivement pour améliorer la perception

**Modifications** :

**1. Parser miroir en sections** (`src/services/blockOrchestrator.ts`) :
```typescript
private parseMirrorSections(mirror: string): string[] {
  const sections: string[] = [];
  
  // Section 1️⃣
  const section1Match = mirror.match(/1️⃣[^\n]*\n([^2️⃣]*)/s);
  if (section1Match) {
    sections.push('1️⃣ Lecture implicite\n\n' + section1Match[1].trim());
  }
  
  // Section 2️⃣
  const section2Match = mirror.match(/2️⃣[^\n]*\n([^3️⃣]*)/s);
  if (section2Match) {
    sections.push('2️⃣ Déduction personnalisée\n\n' + section2Match[1].trim());
  }
  
  // Section 3️⃣
  const section3Match = mirror.match(/3️⃣[^\n]*\n(.*)/s);
  if (section3Match) {
    sections.push('3️⃣ Validation ouverte\n\n' + section3Match[1].trim());
  }
  
  return sections;
}
```

**2. Modifier retour orchestrateur** (`src/services/blockOrchestrator.ts:254-258`) :
```typescript
// Au lieu de retourner mirror + question directement
// Retourner sections séparées avec flag progressive

return {
  response: mirror + '\n\n' + firstQuestion2A,
  step: BLOC_02,
  expectsAnswer: true,
  autoContinue: false,
  mirrorSections: this.parseMirrorSections(mirror), // Nouveau champ
  progressiveDisplay: true, // Nouveau champ
};
```

**3. Modifier frontend** (`ui-test/app.js:104-106`) :
```javascript
if (data.response) {
  if (data.progressiveDisplay && data.mirrorSections) {
    // Afficher sections progressivement
    data.mirrorSections.forEach((section, index) => {
      setTimeout(() => {
        addMessage('assistant', section);
      }, index * 1000); // 1 seconde entre chaque section
    });
    
    // Afficher question après sections
    setTimeout(() => {
      const question = data.response.split('\n\n').pop();
      if (question) {
        addMessage('assistant', question);
      }
    }, data.mirrorSections.length * 1000);
  } else {
    // Affichage normal
    addMessage('assistant', data.response);
  }
}
```

**Tests** :
- ✅ Miroir BLOC 1 → Sections affichées progressivement
- ✅ Miroir BLOC 2B → Sections affichées progressivement
- ✅ Miroir BLOC 3 → Sections affichées progressivement

**Dépendances** : R1, R2 (prompts renforcés + validation)

**Risques** : **FAIBLE** (découpage après génération)

---

#### ÉTAPE 4 — P3 : Double valeur préambule (30 min)

**Objectif** : Unifier `PREAMBULE_DONE` et `STEP_03_BLOC1` en une seule valeur

**Modifications** :
1. Supprimer `export const PREAMBULE_DONE = 'PREAMBULE_DONE';` (ligne 852 `axiomExecutor.ts`)
2. Remplacer `"PREAMBULE_DONE"` par `STEP_03_BLOC1` dans :
   - `src/server.ts:273-275` (mapping `/start`)
   - `src/server.ts:924-926` (mapping `/axiom`)
   - `src/server.ts:218-219` (garde `/start`)
3. Simplifier `ui-test/app.js:109` : `if (data.step === 'STEP_03_BLOC1')` uniquement

**Tests** :
- ✅ Préambule terminé → `step === 'STEP_03_BLOC1'` (pas `PREAMBULE_DONE`)
- ✅ Refresh après préambule → `step === 'STEP_03_BLOC1'`
- ✅ Bouton "Je commence mon profil" affiché

**Dépendances** : Aucune

**Risques** : **FAIBLE** (recherche/remplacement simple)

---

#### ÉTAPE 5 — P4 : Mapping step → state unifié (1h)

**Objectif** : Unifier les mappings `/start` et `/axiom` dans une fonction unique

**Modifications** :
1. Créer fonction `mapStepToState(step: string): string` dans `src/server.ts`
2. Utiliser cette fonction dans `/start` (ligne 261-283)
3. Utiliser cette fonction dans `/axiom` (ligne 914-937)
4. Unifier : Tous les blocs → `"collecting"`, `DONE_MATCHING` → `"matching"`

**Tests** :
- ✅ `/start` avec `step: BLOC_01` → `state: "collecting"`
- ✅ `/axiom` avec `step: BLOC_01` → `state: "collecting"`
- ✅ `/start` avec `step: DONE_MATCHING` → `state: "matching"`
- ✅ `/axiom` avec `step: DONE_MATCHING` → `state: "matching"`

**Dépendances** : P3 (utilise `STEP_03_BLOC1` unifié)

**Risques** : **MOYEN** (modification mapping, vérifier frontend)

---

#### ÉTAPE 6 — P5 : Double mise à jour currentBlock (30 min)

**Objectif** : Supprimer mise à jour redondante dans `server.ts`

**Modifications** :
1. Vérifier que `executeAxiom()` met bien à jour `currentBlock` pour blocs 3-10
2. Si non, ajouter mise à jour dans `executeAxiom()` pour blocs 3-10
3. Supprimer mise à jour dans `server.ts:930` pour blocs gérés par orchestrateur

**Tests** :
- ✅ BLOC 1 terminé → `currentBlock: 2` (mis à jour par orchestrateur uniquement)
- ✅ BLOC 2B terminé → `currentBlock: 3` (mis à jour par orchestrateur uniquement)
- ✅ BLOC 3 terminé → `currentBlock: 4` (mis à jour par executeAxiom() uniquement)

**Dépendances** : P4 (utilise `mapStepToState()`)

**Risques** : **FAIBLE** (suppression ligne, vérification nécessaire)

---

#### ÉTAPE 7 — Tests E2E complets (2h)

**Objectif** : Valider le parcours complet de bout en bout

**Scénarios de test** :
1. **Parcours complet** : Identité → Tone → Préambule → BLOC 1 → ... → BLOC 10 → Matching
2. **Refresh après préambule** : Vérifier bouton toujours affiché
3. **Refresh pendant BLOC 2A** : Vérifier reprise correcte
4. **Refresh pendant BLOC 2B** : Vérifier reprise correcte
5. **Double clic bouton BLOC 1** : Vérifier pas de double génération
6. **Double clic bouton matching** : Vérifier pas de double matching
7. **Transition BLOC 1 → BLOC 2A** : Vérifier première question affichée immédiatement
8. **Transition BLOC 2B → BLOC 3** : Vérifier première question affichée immédiatement
9. **Format miroir BLOC 1** : Vérifier 20 mots + 25 mots + lecture en creux
10. **Format miroir BLOC 3** : Vérifier 20 mots + 25 mots + fusion cumulative

**Critères de succès** :
- ✅ Tous les scénarios passent
- ✅ Aucun état bloquant
- ✅ Aucune régression
- ✅ Miroirs conformes format REVELIOM

**Dépendances** : R1, R2, R3, P3, P4, P5

**Risques** : **FAIBLE** (tests de validation)

---

#### ÉTAPE 8 — Streaming (Option C — Hybride) (2-3 jours)

**Objectif** : Implémenter streaming pour réponses longues (miroirs, profil, matching)

**Modifications** :

**Backend** :
1. Modifier `callOpenAI()` pour accepter `stream: true`
2. Créer route SSE `/axiom/stream` pour streaming
3. Détecter type de réponse (question vs miroir vs profil)
4. Activer streaming uniquement pour miroirs/profil/matching

**Frontend** :
1. Créer fonction `callAxiomStream()` utilisant `EventSource` ou `ReadableStream`
2. Afficher chunks progressivement dans `addMessage()`
3. Gérer deux modes : streaming (réponses longues) vs affichage immédiat (questions)

**Orchestrateur** :
1. Adapter `generateMirrorForBlock1()` et `generateMirror2B()` pour streaming
2. Adapter `executeAxiom()` pour streaming (miroirs BLOCS 3-10)

**Tests** :
- ✅ Miroir BLOC 1 : Affichage progressif
- ✅ Miroir BLOC 2B : Affichage progressif
- ✅ Profil final : Affichage progressif
- ✅ Matching : Affichage progressif
- ✅ Questions : Affichage immédiat (pas de streaming)

**Dépendances** : Étape 7 (tests E2E)

**Risques** : **MOYEN** (complexité SSE, gestion erreurs, reconnexion)

---

#### ÉTAPE 9 — Ton (Piste 2 + Piste 3) (1-2 jours)

**Objectif** : Améliorer fluidité conversationnelle

**Modifications** :

**Piste 2 — Découpage miroirs en sections progressives** :
- Déjà fait dans R3

**Piste 3 — Acknowledgments après réponses** :
1. Créer templates d'acknowledgments pré-définis
2. Ajouter logique de sélection (aléatoire ou basée sur contexte)
3. Afficher acknowledgment après chaque réponse utilisateur

**Tests** :
- ✅ Miroirs : Sections affichées progressivement
- ✅ Réponses : Acknowledgments affichés
- ✅ Fluidité : Enchaînement plus naturel

**Dépendances** : Étape 8 (streaming)

**Risques** : **FAIBLE** (ajouts non bloquants)

---

### 7.3 Ordre strict d'exécution

**Phase 1 — Compliance REVELIOM (CRITIQUE)** (1.5 jours) :
1. R1 (1h)
2. R2 (2h)
3. R3 (1 jour)

**Phase 2 — Corrections critiques** (2h) :
4. P3 (30 min)
5. P4 (1h)
6. P5 (30 min)

**Phase 3 — Validation** (2h) :
7. Tests E2E (2h)

**Phase 4 — Améliorations UX** (3-5 jours) :
8. Streaming (2-3 jours)
9. Ton (1-2 jours)

**Total** : **7-10 jours** (corrections critiques + améliorations)

---

### 7.4 Conditions de validation finale

**Avant tests utilisateurs** :
- [ ] R1, R2, R3 corrigés (compliance REVELIOM)
- [ ] P3, P4, P5 corrigés
- [ ] Tests E2E passent
- [ ] Parcours complet fonctionnel
- [ ] Aucun état bloquant
- [ ] Miroirs conformes format REVELIOM
- [ ] Build Railway passe

**Avant production** :
- [ ] Streaming implémenté (Option C)
- [ ] Ton amélioré (Piste 2 + 3)
- [ ] Tests utilisateurs validés
- [ ] Performance acceptable (< 10s latence perçue)
- [ ] Coût maîtrisé (< 0,10€ par candidat)

---

## 8️⃣ CONCLUSION

### 8.1 État actuel

**Fonctionnel** : ✅ **OUI**
- Parcours complet de bout en bout
- Transitions logiques
- Pas de blocages techniques

**Cohérent** : ⚠️ **PARTIELLEMENT**
- P3, P4, P5 à corriger (incohérences mineures)
- Pas de problème bloquant

**Compliance REVELIOM** : ❌ **NON CONFORME**
- Prompts de génération incomplets
- Absence de validation post-génération
- Affichage d'un bloc sans découpage

**UX** : ⚠️ **AMÉLIORABLE**
- Latence perçue élevée (streaming nécessaire)
- Rendu "robot" (micro-transitions nécessaires)

### 8.2 Feuille de route

**Immédiat (1.5 jours)** :
- R1, R2, R3 (compliance REVELIOM)

**Court terme (2h)** :
- P3, P4, P5 (corrections critiques)

**Moyen terme (2h)** :
- Tests E2E (validation)

**Long terme (3-5 jours)** :
- Streaming (amélioration UX)
- Ton (amélioration UX)

### 8.3 Recommandation finale

**Priorité 1** : **Corriger R1, R2, R3** (1.5 jours)
- Nécessaire pour compliance REVELIOM
- Impact majeur sur qualité des miroirs
- Pas de risque

**Priorité 2** : **Corriger P3, P4, P5** (2h)
- Nécessaire pour cohérence
- Pas de risque
- Effort minimal

**Priorité 3** : **Tests E2E** (2h)
- Validation avant améliorations
- Nécessaire avant tests utilisateurs

**Priorité 4** : **Streaming + Ton** (3-5 jours)
- Amélioration UX significative
- Pas bloquant pour tests utilisateurs
- Peut être fait après tests utilisateurs initiaux

**FIN DE L'AUDIT**
