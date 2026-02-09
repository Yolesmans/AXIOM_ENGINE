# 🏗️ AUDIT FINAL ARCHITECTURE — AXIOM ENGINE

**Date** : 2025-01-27  
**Type** : Audit exhaustif Backend + Frontend + Orchestration  
**Objectif** : Établir la feuille de route finale de finalisation AXIOM  
**Statut** : Code gelé — Analyse uniquement

---

## 📋 TABLE DES MATIÈRES

1. [État réel du moteur aujourd'hui](#1-état-réel-du-moteur-aujourdhui)
2. [Ce qui est définitivement corrigé](#2-ce-qui-est-définitivement-corrigé)
3. [Ce qui reste à corriger (P3, P4, P5)](#3-ce-qui-reste-à-corriger-p3-p4-p5)
4. [Analyse UX : Streaming, Ton, Perception humaine](#4-analyse-ux-streaming-ton-perception-humaine)
5. [Performance & Coût](#5-performance--coût)
6. [Feuille de route finale détaillée](#6-feuille-de-route-finale-détaillée)

---

## 1️⃣ ÉTAT RÉEL DU MOTEUR AUJOURD'HUI

### 1.1 Architecture fonctionnelle

**Backend — Orchestration** :
- ✅ **Routes** : `/start` (GET) et `/axiom` (POST) opérationnelles
- ✅ **Moteur FSM** : `executeAxiom()` + `executeWithAutoContinue()` fonctionnels
- ✅ **Orchestrateur** : `BlockOrchestrator` gère BLOC 1, 2A, 2B
- ✅ **Store** : `CandidateStore` persiste état, historique, queues, answers

**Frontend — Interface** :
- ✅ **Affichage** : Messages assistant/user via `addMessage()`
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

## 2️⃣ CE QUI EST DÉFINITIVEMENT CORRIGÉ

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

## 3️⃣ CE QUI RESTE À CORRIGER (P3, P4, P5)

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
1. Supprimer mise à jour `currentBlock` dans `server.ts:930` pour blocs gérés par orchestrateur
2. Vérifier que `executeAxiom()` met bien à jour `currentBlock` pour blocs 3-10

**⚠️ ATTENTION** : Vérifier que `executeAxiom()` met bien à jour `currentBlock` pour les blocs 3-10 (non gérés par orchestrateur). Si non, ajouter la mise à jour.

**Fichiers à modifier** :
- `src/server.ts` (ligne 930)

**Effort estimé** : **30 minutes** (+ vérification)

---

## 4️⃣ ANALYSE UX : STREAMING, TON, PERCEPTION HUMAINE

### 4.1 Écriture progressive (Streaming)

#### 4.1.1 Constat actuel

**Rendu frontend** :
- `ui-test/app.js:104-106` : `addMessage('assistant', data.response)` → Affichage d'un bloc
- Aucun streaming : Réponse complète affichée d'un coup
- Latence perçue : Temps d'attente complet de l'API (3-15 secondes) avant affichage

**Backend** :
- `src/services/openaiClient.ts:31-49` : `callOpenAI()` attend la réponse complète
- Pas de streaming : `response.choices[0]?.message?.content` récupéré après complétion
- Modèle : `gpt-4o-mini` (pas de streaming activé)

#### 4.1.2 Faisabilité technique

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

#### 4.1.3 Recommandation streaming

**Recommandation** : **OPTION C (Hybride)**

**Justification** :
- Amélioration UX significative sur réponses longues (miroirs, profil, matching)
- Questions courtes n'ont pas besoin de streaming (affichage immédiat suffit)
- Effort raisonnable (2-3 jours)

**Priorité** : **MOYENNE** (amélioration UX, pas bloquant)

---

### 4.2 Ton des analyses (Mentor, pas robot)

#### 4.2.1 Constat actuel

**Prompts** :
- `src/engine/prompts.ts` : Prompts corrects, ton défini ("mentor professionnel lucide et exigeant")
- Instructions claires : "chaleureux mais pro, direct mais respectueux"

**Rendu perçu** :
- Trop clinique
- Trop "rapport IA"
- Pas assez conversationnel

#### 4.2.2 Analyse des causes possibles

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

#### 4.2.3 Pistes techniques (sans toucher aux prompts)

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

#### 4.2.4 Recommandation ton

**Recommandation** : **COMBINAISON Piste 2 + Piste 3**

**Justification** :
- **Piste 2** : Améliore perception des miroirs (affichage progressif)
- **Piste 3** : Améliore fluidité entre questions (acknowledgments)
- **Piste 1** : Optionnelle (coût + latence, à évaluer après Piste 2+3)

**Priorité** : **MOYENNE** (amélioration UX, pas bloquant)

---

### 4.3 Perception humaine globale

#### 4.3.1 Constat

**Points positifs** :
- ✅ Parcours fonctionnel de bout en bout
- ✅ Transitions logiques
- ✅ Pas de blocages techniques

**Points d'amélioration** :
- ⚠️ Latence perçue élevée (3-15 secondes par réponse)
- ⚠️ Rendu "robot" (affichage d'un bloc)
- ⚠️ Absence de fluidité conversationnelle

#### 4.3.2 Impact des améliorations proposées

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

## 5️⃣ PERFORMANCE & COÛT

### 5.1 Temps de réponse actuel par bloc

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

### 5.2 Où se situent les vrais coûts API

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

### 5.3 Si un modèle plus performant DOIT être utilisé

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

### 5.4 Impression de lenteur : UX vs Performance réelle

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

## 6️⃣ FEUILLE DE ROUTE FINALE DÉTAILLÉE

### 6.1 Vue d'ensemble

**Total corrections identifiées** : 8
- **🔴 CRITIQUE** : 0 (tous corrigés)
- **🟠 IMPORTANT** : 3 (P3, P4, P5)
- **🟡 AMÉLIORATION UX** : 2 (Streaming, Ton)
- **🟢 OPTIONNEL** : 3 (Modèle performant, Optimisations)

**Ordre de correction** :
1. **P3** — Double valeur préambule (30 min)
2. **P4** — Mapping step → state unifié (1h)
3. **P5** — Double mise à jour currentBlock (30 min)
4. **Tests E2E** — Validation parcours complet (2h)
5. **Streaming (Option C)** — Écriture progressive (2-3 jours)
6. **Ton (Piste 2+3)** — Micro-transitions + découpage miroirs (1-2 jours)

**Estimation totale** : **4-5 jours** (corrections critiques + améliorations UX)

---

### 6.2 Détail par étape

#### ÉTAPE 1 — P3 : Double valeur préambule (30 min)

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

#### ÉTAPE 2 — P4 : Mapping step → state unifié (1h)

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

#### ÉTAPE 3 — P5 : Double mise à jour currentBlock (30 min)

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

#### ÉTAPE 4 — Tests E2E complets (2h)

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

**Critères de succès** :
- ✅ Tous les scénarios passent
- ✅ Aucun état bloquant
- ✅ Aucune régression

**Dépendances** : P3, P4, P5

**Risques** : **FAIBLE** (tests de validation)

---

#### ÉTAPE 5 — Streaming (Option C — Hybride) (2-3 jours)

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

**Dépendances** : Étape 4 (tests E2E)

**Risques** : **MOYEN** (complexité SSE, gestion erreurs, reconnexion)

---

#### ÉTAPE 6 — Ton (Piste 2 + Piste 3) (1-2 jours)

**Objectif** : Améliorer fluidité conversationnelle

**Modifications** :

**Piste 2 — Découpage miroirs en sections progressives** :
1. Parser miroirs en sections (1️⃣, 2️⃣, 3️⃣)
2. Envoyer sections progressivement (streaming ou faux streaming)
3. Afficher sections une par une

**Piste 3 — Acknowledgments après réponses** :
1. Créer templates d'acknowledgments pré-définis
2. Ajouter logique de sélection (aléatoire ou basée sur contexte)
3. Afficher acknowledgment après chaque réponse utilisateur

**Tests** :
- ✅ Miroirs : Sections affichées progressivement
- ✅ Réponses : Acknowledgments affichés
- ✅ Fluidité : Enchaînement plus naturel

**Dépendances** : Étape 5 (streaming)

**Risques** : **FAIBLE** (ajouts non bloquants)

---

### 6.3 Ordre strict d'exécution

**Phase 1 — Corrections critiques** (2h) :
1. P3 (30 min)
2. P4 (1h)
3. P5 (30 min)

**Phase 2 — Validation** (2h) :
4. Tests E2E (2h)

**Phase 3 — Améliorations UX** (3-5 jours) :
5. Streaming (2-3 jours)
6. Ton (1-2 jours)

**Total** : **5-7 jours** (corrections + améliorations)

---

### 6.4 Conditions de validation finale

**Avant tests utilisateurs** :
- [ ] P3, P4, P5 corrigés
- [ ] Tests E2E passent
- [ ] Parcours complet fonctionnel
- [ ] Aucun état bloquant
- [ ] Build Railway passe

**Avant production** :
- [ ] Streaming implémenté (Option C)
- [ ] Ton amélioré (Piste 2 + 3)
- [ ] Tests utilisateurs validés
- [ ] Performance acceptable (< 10s latence perçue)
- [ ] Coût maîtrisé (< 0,10€ par candidat)

---

## 7️⃣ CONCLUSION

### 7.1 État actuel

**Fonctionnel** : ✅ **OUI**
- Parcours complet de bout en bout
- Transitions logiques
- Pas de blocages techniques

**Cohérent** : ⚠️ **PARTIELLEMENT**
- P3, P4, P5 à corriger (incohérences mineures)
- Pas de problème bloquant

**UX** : ⚠️ **AMÉLIORABLE**
- Latence perçue élevée (streaming nécessaire)
- Rendu "robot" (micro-transitions nécessaires)

### 7.2 Feuille de route

**Immédiat** (2h) :
- P3, P4, P5 (corrections critiques)

**Court terme** (2h) :
- Tests E2E (validation)

**Moyen terme** (3-5 jours) :
- Streaming (amélioration UX)
- Ton (amélioration UX)

### 7.3 Recommandation finale

**Priorité 1** : **Corriger P3, P4, P5** (2h)
- Nécessaire pour cohérence
- Pas de risque
- Effort minimal

**Priorité 2** : **Tests E2E** (2h)
- Validation avant améliorations
- Nécessaire avant tests utilisateurs

**Priorité 3** : **Streaming + Ton** (3-5 jours)
- Amélioration UX significative
- Pas bloquant pour tests utilisateurs
- Peut être fait après tests utilisateurs initiaux

**FIN DE L'AUDIT**
