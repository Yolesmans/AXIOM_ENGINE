# 🔍 AUDIT DIAGNOSTIC — DISPARITION MIROIRS BLOC 4 → 10

**Date** : 2025-01-27  
**Type** : Audit senior READ-ONLY (aucune modification)  
**Objectif** : Identifier précisément pourquoi les mini-analyses miroir disparaissent après BLOC 4

---

## 📋 RÉSUMÉ EXÉCUTIF

**Problème observé** : Les miroirs interprétatifs s'affichent sur les premiers blocs (BLOC 1, 2B, 3) puis disparaissent partiellement ou totalement à partir de BLOC 4.

**Cause racine identifiée** : 🔴 **ANNONCE DE TRANSITION POLLUE LE TEXTE MIROIR**

**Diagnostic technique** :
1. ✅ Miroirs **générés** par l'IA (prompt injecté, appel OpenAI)
2. ✅ Miroirs **stockés** dans `conversationHistory` avec `kind: 'mirror'`
3. ⚠️ **Annonce de transition incluse dans `aiText`** après le miroir (pollution)
4. ⚠️ **Parsing `parseMirrorSections()` peut échouer** si annonce pollue le texte
5. ⚠️ **Si parsing échoue** → `progressiveDisplay = false` → affichage normal (miroir + annonce)
6. ⚠️ **Frontend affiche texte complet** (miroir + annonce) au lieu du miroir seul

**Impact** : Les miroirs sont générés et stockés, mais l'affichage est pollué par l'annonce de transition.

---

## 🔍 AXE 1 — AUDIT TECHNIQUE MIRRORS (BLOC 4 → 10)

### 1.1 Génération IA

#### Le texte miroir est-il bien généré par l'IA ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1601-1652`
- **Ligne 1601** : Condition `blocNumber >= 3 && blocNumber <= 9` → Prompt miroir injecté
- **Ligne 1646-1652** : Instruction annonce transition **APRÈS le miroir** dans le prompt
- **Ligne 1667** : Appel `callOpenAI()` → Génération miroir + annonce dans un seul texte

**Verdict** : ✅ **CONFORME** — Miroir généré par l'IA

**Problème identifié** : ⚠️ **ANNONCE DE TRANSITION INCLUSE DANS LE TEXTE** — Le LLM génère miroir + annonce dans un seul `aiText`

**Preuve** :
- **Ligne 1648** : `"Fin du BLOC ${blocNumber}. On passe au BLOC ${blocNumber + 1} — ${getBlockName(blocNumber + 1)}."`
- **Ligne 1650** : "Cette annonce doit être SÉPARÉE du miroir par un saut de ligne"
- **Ligne 1667** : `aiText = completion.trim()` → **Texte complet (miroir + annonce) stocké dans `aiText`**

---

#### Est-il présent dans la réponse brute du modèle ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1667`
- **Ligne 1667** : `aiText = completion.trim()` → Réponse brute du modèle stockée

**Verdict** : ✅ **CONFORME** — Miroir présent dans réponse brute

**Problème identifié** : ⚠️ **ANNONCE DE TRANSITION INCLUSE** — La réponse brute contient miroir + annonce

---

#### Est-il généré mais ignoré ensuite ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1741-1798`
- **Ligne 1741** : Détection miroir : `if (aiText && blocNumber >= 3 && blocNumber <= 9 && !expectsAnswer)`
- **Ligne 1744** : `mirror = aiText` → **Texte complet (miroir + annonce) stocké dans `mirror`**
- **Ligne 1749** : Validation `validateMirrorREVELIOM(mirror)` → **Validation sur texte complet (miroir + annonce)**

**Verdict** : ⚠️ **PARTIELLEMENT CONFORME** — Miroir généré mais **annonce incluse dans validation**

**Problème identifié** : ⚠️ **VALIDATION SUR TEXTE POLLUÉ** — `validateMirrorREVELIOM()` valide le texte complet (miroir + annonce), ce qui peut faire échouer la validation si l'annonce pollue les sections

---

### 1.2 Stockage

#### Le miroir est-il bien enregistré dans conversationHistory ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1922-1929`
- **Ligne 1924** : `appendAssistantMessage(candidate.candidateId, aiText, { kind: expectsAnswer ? 'question' : 'mirror' })`
- **Ligne 1927** : `kind: expectsAnswer ? 'question' : 'mirror'` → **Si `!expectsAnswer` → `kind: 'mirror'`**

**Verdict** : ✅ **CONFORME** — Miroir stocké avec `kind: 'mirror'`

**Problème identifié** : ⚠️ **TEXTE COMPLET STOCKÉ** — `aiText` contient miroir + annonce, donc l'annonce est stockée avec le miroir

---

#### Avec quel `kind` ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1927`
- **Ligne 1927** : `kind: expectsAnswer ? 'question' : 'mirror'` → **`kind: 'mirror'` si `!expectsAnswer`**

**Verdict** : ✅ **CONFORME** — `kind: 'mirror'` correct

---

#### Avec quel `step` ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1924-1929`
- **Ligne 1925** : `block: blocNumber` → Bloc courant
- **Ligne 1926** : `step: nextState` → **`nextState` déterminé avant stockage (ligne 1841-1881)**

**Analyse `nextState` pour miroir** :
- **Ligne 1863-1866** : `if (isMirror && expectsAnswer) { nextState = currentState }` → **Reste sur bloc courant**
- **Ligne 1877-1880** : Même logique si pas de `userMessage`

**Verdict** : ✅ **CONFORME** — `step` = bloc courant (ex: `BLOC_04`)

---

#### Est-il écrasé par un message suivant ?

**Preuve code** :
- **Fichier** : `src/store/sessionStore.ts:406-424` — `appendAssistantMessage()`
- **Ligne 422** : `conversationHistory: [...(candidate.conversationHistory || []), message]` → **Ajout, pas écrasement**

**Verdict** : ✅ **CONFORME** — Miroir non écrasé (ajout à l'historique)

---

### 1.3 Orchestration FSM

#### Le miroir est-il suivi immédiatement d'un changement d'état ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1863-1866, 1877-1880`
- **Ligne 1864** : `if (isMirror && expectsAnswer) { nextState = currentState }` → **Reste sur bloc courant**
- **Ligne 1926** : `step: nextState` → **`step` = bloc courant (pas de changement)**

**Verdict** : ✅ **CONFORME** — Pas de changement d'état immédiat (reste sur bloc courant)

---

#### `expectsAnswer` est-il à `false` après le miroir ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1738, 1797`
- **Ligne 1738** : `let expectsAnswer = aiText ? aiText.trim().endsWith('?') : false` → **Détection basée sur "?"**
- **Ligne 1797** : `expectsAnswer = true` → **Forcé à `true` pour les miroirs (C3)**

**Verdict** : ✅ **CONFORME** — `expectsAnswer: true` après miroir (attente validation)

---

#### Une transition automatique est-elle déclenchée ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1863-1866`
- **Ligne 1864** : `if (isMirror && expectsAnswer) { nextState = currentState }` → **Pas de transition automatique**

**Verdict** : ✅ **CONFORME** — Pas de transition automatique (attente validation)

---

#### Le moteur considère-t-il le miroir comme un "message terminal" ou non ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1863-1866`
- **Ligne 1864** : `if (isMirror && expectsAnswer)` → **Miroir = message avec `expectsAnswer: true` (non terminal)**

**Verdict** : ✅ **CONFORME** — Miroir = message non terminal (attente validation)

---

### 1.4 Transmission API

#### Le miroir est-il bien envoyé dans la réponse API ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1968-1976`
- **Ligne 1969** : `response: aiText || ''` → **Texte complet (miroir + annonce) envoyé**

**Verdict** : ✅ **CONFORME** — Miroir envoyé dans réponse API

**Problème identifié** : ⚠️ **ANNONCE DE TRANSITION INCLUSE** — `aiText` contient miroir + annonce

---

#### Est-il concaténé avec autre chose ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1969`
- **Ligne 1969** : `response: aiText || ''` → **Pas de concaténation explicite**

**Verdict** : ✅ **CONFORME** — Pas de concaténation explicite

**Problème identifié** : ⚠️ **ANNONCE DÉJÀ INCLUSE DANS `aiText`** — Le LLM génère miroir + annonce dans un seul texte

---

#### Est-il remplacé par une autre réponse ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1968-1976`
- **Ligne 1969** : `response: aiText || ''` → **Pas de remplacement**

**Verdict** : ✅ **CONFORME** — Pas de remplacement

---

### 1.5 Frontend

#### Le front filtre-t-il certains messages ?

**Preuve code** :
- **Fichier** : `ui-test/app.js:158-183`
- **Ligne 160** : Condition `if (data.progressiveDisplay === true && Array.isArray(data.mirrorSections) && data.mirrorSections.length === 3)`
- **Ligne 176** : Sinon → affichage normal avec `extractFirstQuestion()`

**Verdict** : ⚠️ **PARTIELLEMENT FILTRÉ** — Affichage progressif si parsing réussit, sinon affichage normal

---

#### Condition d'affichage basée sur `expectsAnswer` ?

**Preuve code** :
- **Fichier** : `ui-test/app.js:209-224`
- **Ligne 211** : `hasActiveQuestion = true` si `data.expectsAnswer === true`
- **Ligne 224** : `hasActiveQuestion = false` si `data.expectsAnswer === false`

**Verdict** : ✅ **CONFORME** — Affichage basé sur `expectsAnswer`

---

#### Condition d'affichage basée sur `kind` ?

**Preuve code** :
- **Fichier** : `ui-test/app.js` — Recherche `kind`
- **Résultat** : Aucune condition basée sur `kind` dans le frontend

**Verdict** : ✅ **CONFORME** — Pas de filtrage par `kind`

---

#### Condition d'affichage basée sur `step` ?

**Preuve code** :
- **Fichier** : `ui-test/app.js:186-224`
- **Ligne 186** : `if (data.step === 'STEP_03_BLOC1')` → Affichage bouton
- **Ligne 189** : `else if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false)` → Affichage bouton matching
- **Ligne 192** : `else if (data.step === 'DONE_MATCHING')` → Affichage bouton FIN

**Verdict** : ✅ **CONFORME** — Affichage basé sur `step` pour boutons uniquement

---

#### Le miroir est-il reçu mais non affiché ?

**Analyse** :
- **Fichier** : `ui-test/app.js:158-183`
- **Ligne 160** : Si `progressiveDisplay === true` → Affichage progressif (sections)
- **Ligne 176** : Sinon → Affichage normal (texte complet)

**Problème identifié** : ⚠️ **AFFICHAGE NORMAL SI PARSING ÉCHOUE** — Si `parseMirrorSections()` ne trouve pas 3 sections, `progressiveDisplay = false` → affichage normal (texte complet = miroir + annonce)

**Verdict** : ⚠️ **PARTIELLEMENT AFFICHÉ** — Miroir affiché mais avec annonce de transition

---

#### Est-il affiché puis remplacé par une autre réponse ?

**Preuve code** :
- **Fichier** : `ui-test/app.js:32-55` — Déduplication messages
- **Ligne 40** : Vérification dernier message identique → Skip si doublon

**Verdict** : ✅ **CONFORME** — Pas de remplacement (déduplication uniquement)

---

## 🔍 DIAGNOSTIC PRÉCIS — CAUSE RACINE

### Problème identifié 1 : Décision LLM (pas de vérification système)

**Flux actuel (BLOCS 3-10)** :

**Fichier** : `src/engine/axiomExecutor.ts:1580-1667`

**Logique actuelle** :
- **Ligne 1601** : Condition `blocNumber >= 3 && blocNumber <= 9` → Prompt miroir injecté
- **Ligne 1604-1605** : "Tu es en FIN DE BLOC ${blocNumber}. Toutes les questions de ce bloc ont été répondues."
- **Ligne 1596** : Appel `callOpenAI()` → **LLM décide** : question suivante OU miroir

**Problème identifié** : ⚠️ **DÉCISION LLM, PAS VÉRIFICATION SYSTÈME** — Le système ne vérifie pas explicitement si toutes les questions sont répondues. Le LLM décide basé sur le prompt et l'historique.

**Impact** : Si le LLM décide de continuer à poser des questions au lieu de générer un miroir, le système suit cette décision → **Miroir non généré**

**Preuve** :
- **BLOC 1-2** : Utilise `blockOrchestrator` avec `blockQueues` → Vérification explicite "toutes questions répondues" (ligne 324)
- **BLOCS 3-10** : Utilise `executeAxiom()` → Pas de vérification explicite, décision LLM uniquement

---

### Problème identifié 2 : Annonce de transition pollue le texte miroir

**Flux actuel (BLOCS 3-9)** :

1. **Génération** (`axiomExecutor.ts:1601-1667`) :
   - Prompt injecté avec instruction : "Annonce transition APRÈS le miroir" (ligne 1646-1652)
   - LLM génère : `miroir (3 sections) + "\n\n" + "Fin du BLOC X. On passe au BLOC Y."`
   - `aiText = completion.trim()` → **Texte complet (miroir + annonce)**

2. **Validation** (`axiomExecutor.ts:1749`) :
   - `validateMirrorREVELIOM(mirror)` → **Validation sur texte complet (miroir + annonce)**
   - Validation peut échouer si annonce pollue les sections

3. **Parsing** (`axiomExecutor.ts:1960-1965`) :
   - `parseMirrorSections(aiText)` → **Parsing sur texte complet (miroir + annonce)**
   - Si annonce incluse après section 3️⃣, parsing peut échouer ou inclure annonce dans section 3️⃣

4. **Transmission** (`axiomExecutor.ts:1969`) :
   - `response: aiText || ''` → **Texte complet (miroir + annonce) envoyé au frontend**

5. **Affichage** (`ui-test/app.js:160-181`) :
   - Si `progressiveDisplay === true` → Affichage progressif (sections)
   - Si `progressiveDisplay === false` → Affichage normal (texte complet = miroir + annonce)

**Cause racine principale** : 🔴 **DÉCISION LLM (pas de vérification système)** — Le système ne vérifie pas explicitement si toutes les questions sont répondues pour BLOCS 3-10. Le LLM décide basé sur le prompt, ce qui peut conduire à continuer les questions au lieu de générer un miroir.

**Cause racine secondaire** : 🔴 **ANNONCE DE TRANSITION INCLUSE DANS `aiText`** — Si miroir généré, le LLM inclut l'annonce de transition dans le texte, ce qui pollue le parsing et l'affichage.

---

### Vérification parsing `parseMirrorSections()`

**Fichier** : `src/services/parseMirrorSections.ts:1-13`

**Logique** :
- Regex `1️⃣[^\n]*\n([^2️⃣]*)` → Section 1️⃣ jusqu'à 2️⃣
- Regex `2️⃣[^\n]*\n([^3️⃣]*)` → Section 2️⃣ jusqu'à 3️⃣
- Regex `3️⃣[^\n]*\n(.*)` → Section 3️⃣ jusqu'à la fin

**Problème identifié** : ⚠️ **Section 3️⃣ capture tout jusqu'à la fin** — Si annonce de transition est après section 3️⃣, elle est incluse dans `s3[1]`

**Exemple** :
```
1️⃣ Lecture implicite
Texte section 1

2️⃣ Déduction personnalisée
Texte section 2

3️⃣ Validation ouverte
Dis-moi si ça te parle...

Fin du BLOC 4. On passe au BLOC 5 — Ambition & trajectoire future.
```

**Résultat parsing** :
- `s1[1]` = "Texte section 1" ✅
- `s2[1]` = "Texte section 2" ✅
- `s3[1]` = "Dis-moi si ça te parle...\n\nFin du BLOC 4. On passe au BLOC 5 — Ambition & trajectoire future." ⚠️ **Annonce incluse**

**Impact** : Section 3️⃣ polluée par annonce → Affichage progressif fonctionne mais section 3️⃣ contient l'annonce

---

### Vérification condition `progressiveDisplay`

**Fichier** : `src/engine/axiomExecutor.ts:1960-1965`

**Logique** :
```typescript
if (aiText && !expectsAnswer && blocNumber >= 3 && blocNumber <= 9) {
  const sections = parseMirrorSections(aiText);
  if (sections.length === 3) {
    progressiveDisplay = true;
    mirrorSections = sections;
  }
}
```

**Problème identifié** : ⚠️ **Si parsing échoue (sections.length !== 3)** → `progressiveDisplay = false` → Affichage normal (texte complet)

**Scénarios d'échec** :
1. Annonce pollue section 3️⃣ → Parsing réussit mais section 3️⃣ polluée
2. Format miroir non strict → Parsing échoue → `progressiveDisplay = false`
3. Annonce avant section 1️⃣ → Parsing échoue → `progressiveDisplay = false`

---

## 🔍 AXE 2 — QUALITÉ DES ANALYSES MIRROR

### 2.1 Modèle utilisé actuellement par bloc

**Preuve code** :
- **Fichier** : `src/services/openaiClient.ts:35`
- **Ligne 35** : `model: 'gpt-4o-mini'` → **Modèle unique pour tous les blocs**

**Verdict** : ✅ **CONFORME** — Modèle identique pour tous les blocs (`gpt-4o-mini`)

---

### 2.2 Température actuelle

**Preuve code** :
- **Fichier** : `src/services/openaiClient.ts:40`
- **Ligne 40** : `temperature: 0.7` → **Température unique pour tous les contenus**

**Verdict** : ✅ **CONFORME** — Température identique (0.7) pour :
- Questions
- Miroirs
- Synthèse finale (BLOC 10)
- Matching

---

### 2.3 Hypothèses d'amélioration SANS modifier les prompts

#### Effet attendu d'un passage sur GPT-5.2

**Analyse** :
- **Modèle actuel** : `gpt-4o-mini` (économique, optimisé coût/performance)
- **Modèle proposé** : `gpt-5.2` (si disponible, plus puissant)

**Impact attendu** :
- ✅ **Amélioration majeure du ton** (modèle plus puissant = plus de "chaleur" narrative)
- ✅ **Meilleure compréhension contexte** (capacité narrative supérieure)
- ⚠️ **Coût augmenté** (mais limité aux miroirs si appliqué uniquement aux miroirs)

**Recommandation** : ✅ **RECOMMANDÉ** — Impact majeur sur qualité narrative

---

#### Effet attendu d'un ajustement de température

**Analyse** :
- **Température actuelle** : 0.7 (équilibre créativité/cohérence)
- **Température proposée miroirs** : 0.8-0.9 (plus de créativité)

**Impact attendu** :
- ✅ **Plus de "chaleur" narrative** (température plus élevée = plus de créativité)
- ⚠️ **Moins de cohérence** (mais acceptable pour miroirs)
- ⚠️ **Format REVELIOM peut être moins strict** (mitigé par validators)

**Recommandation** : ✅ **RECOMMANDÉ** — Impact moyen, effort très faible

---

#### Différence qualitative attendue sur les miroirs uniquement

**Analyse** :
- **Modèle + température** : Impact combiné majeur
- **Application uniquement miroirs** : Coût limité, impact ciblé

**Recommandation** : ✅ **RECOMMANDÉ** — Application uniquement aux miroirs (pas aux questions)

---

## 🔧 AXE 3 — PARAMÉTRAGE PROPOSÉ (ANALYSE)

### 3.1 Modèle GPT-5.2 pour l'ensemble du parcours

**Analyse technique** :
- **Modèle actuel** : `gpt-4o-mini`
- **Modèle proposé** : `gpt-5.2` (à vérifier disponibilité)

**Impact réel sur qualité perçue** :
- 🔴 **ÉLEVÉ** — Modèle plus puissant = meilleure qualité narrative
- ✅ **Amélioration majeure** du ton "mentor chaleureux"

**Impact sur cohérence** :
- ✅ **Positif** — Modèle plus puissant = meilleure compréhension contexte
- ✅ **Cohérence améliorée** (meilleure compréhension historique)

**Risque éventuel** :
- ⚠️ **Coût augmenté** (modèle plus cher)
- ⚠️ **Latence légèrement augmentée** (mais négligeable)

**Impact tokens** :
- ⚠️ **À confirmer** — Modèle différent peut avoir pricing différent
- ⚠️ **Recommandation** : Vérifier pricing avant implémentation

**Recommandation** : ✅ **RECOMMANDÉ** (si disponible et pricing acceptable)

---

### 3.2 Température cible

#### Questions : 0.6

**Analyse** :
- **Température actuelle** : 0.7
- **Température proposée** : 0.6

**Impact réel** :
- ✅ **Cohérence améliorée** (température plus basse = plus de cohérence)
- ⚠️ **Moins de créativité** (mais acceptable pour questions factuelles)

**Recommandation** : ✅ **RECOMMANDÉ** — Questions plus cohérentes

---

#### Miroirs : 0.8

**Analyse** :
- **Température actuelle** : 0.7
- **Température proposée** : 0.8

**Impact réel** :
- ✅ **Plus de "chaleur" narrative** (température plus élevée = plus de créativité)
- ⚠️ **Moins de cohérence** (mais acceptable pour miroirs interprétatifs)

**Recommandation** : ✅ **RECOMMANDÉ** — Miroirs plus chaleureux

---

#### Synthèse finale (BLOC 10) : 0.75

**Analyse** :
- **Température actuelle** : 0.7
- **Température proposée** : 0.75

**Impact réel** :
- ✅ **Équilibre créativité/cohérence** (température intermédiaire)
- ✅ **Synthèse plus humaine** (sans perdre cohérence)

**Recommandation** : ✅ **RECOMMANDÉ** — Synthèse plus humaine

---

#### Matching : 0.7

**Analyse** :
- **Température actuelle** : 0.7
- **Température proposée** : 0.7

**Impact réel** :
- ✅ **Aucun changement** (température identique)

**Recommandation** : ✅ **CONFORME** — Pas de modification nécessaire

---

### 3.3 Synthèse paramétrage proposé

**Modèle** : GPT-5.2 (si disponible) → Impact majeur qualité

**Températures** :
- Questions : 0.6 → Cohérence améliorée
- Miroirs : 0.8 → Chaleur narrative améliorée
- Synthèse : 0.75 → Humanité améliorée
- Matching : 0.7 → Inchangé

**Impact global** : 🔴 **ÉLEVÉ** — Amélioration majeure qualité narrative

**Risques** : ⚠️ Coût (modèle), cohérence (température miroirs)

**Recommandation** : ✅ **RECOMMANDÉ** — Application progressive (miroirs d'abord)

---

## 🔍 AXE 4 — BLOC 10 / MATCHING / FIN DE PARCOURS

### 4.1 BLOC 10

#### La synthèse finale est-elle toujours générée ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1858-1862, 1872-1876`
- **Ligne 1858-1862** : `if (!expectsAnswer && blocNumber === 10) { nextState = STEP_99_MATCH_READY; setFinalProfileText(aiText); }`
- **Ligne 1872-1876** : Même logique si pas de `userMessage`

**Verdict** : ✅ **CONFORME** — Synthèse générée si `blocNumber === 10 && !expectsAnswer`

**Problème identifié** : ⚠️ **DÉTECTION BASÉE SUR `!expectsAnswer`** — Si LLM génère une question en fin de BLOC 10, synthèse non générée

---

#### Est-elle affichée systématiquement ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1934-1954`
- **Ligne 1934** : `if (nextState === STEP_99_MATCH_READY) { return { response: finalResponse, ... } }`
- **Ligne 1948** : `response: finalResponse` → **Synthèse retournée**

**Verdict** : ✅ **CONFORME** — Synthèse affichée si `nextState === STEP_99_MATCH_READY`

---

#### Respecte-t-elle bien le prompt (structure, ton, profondeur) ?

**Preuve code** :
- **Fichier** : `src/engine/prompts.ts:1300-1416` — Structure obligatoire définie
- **Fichier** : `src/engine/axiomExecutor.ts:1862` — Pas de validation structurelle

**Verdict** : ⚠️ **NON VALIDÉ** — Aucune validation structurelle dans le code

**Recommandation** : ⚠️ **AJOUTER VALIDATORS** (voir ACTION_PLAN.md Lot 1)

---

### 4.2 Bouton MATCHING

#### Est-il bien déclenché après BLOC 10 ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1934-1954`
- **Ligne 1934** : `if (nextState === STEP_99_MATCH_READY)` → Transition vers `STEP_99_MATCH_READY`
- **Fichier** : `ui-test/app.js:189-191`
- **Ligne 189** : `if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false)` → Affichage bouton matching

**Verdict** : ✅ **CONFORME** — Bouton matching affiché après BLOC 10

---

#### Dans quels cas n'apparaît-il pas ?

**Scénarios d'absence** :
1. **Si `expectsAnswer === true`** → Bouton non affiché (ligne 189)
2. **Si `step !== 'STEP_99_MATCH_READY'`** → Bouton non affiché

**Verdict** : ✅ **CONFORME** — Bouton affiché uniquement si `STEP_99_MATCH_READY && expectsAnswer === false`

---

#### Dépend-il d'un flag, d'un step, d'un état non atteint ?

**Preuve code** :
- **Fichier** : `ui-test/app.js:189-191`
- **Ligne 189** : Condition `data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false`

**Verdict** : ✅ **CONFORME** — Dépend uniquement de `step` et `expectsAnswer`

---

### 4.3 Bouton FIN (Tally)

#### Est-il bien affiché uniquement après DONE_MATCHING ?

**Preuve code** :
- **Fichier** : `ui-test/app.js:192-224`
- **Ligne 192** : `if (data.step === 'DONE_MATCHING')` → Affichage bouton FIN

**Verdict** : ✅ **CONFORME** — Bouton FIN affiché uniquement après `DONE_MATCHING`

---

#### Est-il masqué si le matching n'est pas généré ?

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:2073`
- **Ligne 2073** : `currentState = DONE_MATCHING` → Transition vers `DONE_MATCHING` après génération matching

**Verdict** : ✅ **CONFORME** — Bouton FIN affiché uniquement si matching généré (`DONE_MATCHING`)

---

#### Y a-t-il un scénario où le candidat reste bloqué sans CTA final ?

**Scénarios de blocage** :
1. **Matching non généré** → `step` reste `STEP_99_MATCHING` → Bouton FIN non affiché
2. **Erreur génération matching** → `step` reste `STEP_99_MATCHING` → Bouton FIN non affiché

**Verdict** : ⚠️ **RISQUE DE BLOCAGE** — Si matching échoue, candidat bloqué sans CTA final

**Recommandation** : ⚠️ **AJOUTER FALLBACK** — Afficher bouton FIN même si matching échoue (après timeout)

---

## 📊 ÉTAT DES LIEUX PRÉCIS

### Ce qui fonctionne

1. ✅ **Génération miroirs** : Miroirs générés par l'IA pour BLOCS 3-9
2. ✅ **Stockage miroirs** : Miroirs stockés dans `conversationHistory` avec `kind: 'mirror'`
3. ✅ **Transmission API** : Miroirs transmis au frontend dans `response`
4. ✅ **Verrous FSM** : Miroirs bloquent transition jusqu'à validation
5. ✅ **Validation REVELIOM** : Format miroir validé (sections, mots, ton 2e personne)
6. ✅ **Affichage progressif** : Si parsing réussit, affichage progressif fonctionne

---

### Ce qui ne fonctionne pas

1. ❌ **Annonce de transition pollue le texte** : Miroir + annonce dans un seul `aiText`
2. ❌ **Parsing peut échouer** : Si annonce pollue sections, `progressiveDisplay = false`
3. ❌ **Affichage normal si parsing échoue** : Texte complet (miroir + annonce) affiché au lieu du miroir seul
4. ❌ **Section 3️⃣ polluée** : Si annonce après section 3️⃣, elle est incluse dans section 3️⃣
5. ❌ **Validation sur texte pollué** : `validateMirrorREVELIOM()` valide texte complet (miroir + annonce)

---

### Ce qui fonctionne "par hasard"

1. ⚠️ **Affichage progressif si format strict** : Si LLM respecte format strict, parsing réussit
2. ⚠️ **Miroirs BLOC 1-3 affichés** : Format peut être plus strict sur premiers blocs
3. ⚠️ **Miroirs BLOC 4-10 partiellement affichés** : Si parsing réussit mais section 3️⃣ polluée, affichage progressif fonctionne mais section 3️⃣ contient annonce

---

## 🔍 CAUSES RACINES PROBABLES

### Cause racine principale : Décision LLM (pas de vérification système)

**Flux actuel (BLOCS 3-10)** :
1. Appel `executeAxiom()` pour chaque interaction
2. Prompt injecté : "Tu es en FIN DE BLOC X. Toutes les questions de ce bloc ont été répondues."
3. **LLM décide** : question suivante OU miroir (basé sur prompt + historique)
4. Si LLM décide question → Miroir non généré
5. Si LLM décide miroir → Miroir généré (mais avec annonce)

**Problème** : ⚠️ **PAS DE VÉRIFICATION SYSTÈME** — Le système ne compte pas les questions/réponses pour BLOCS 3-10. Il fait confiance au LLM pour décider.

**Comparaison BLOC 1-2** :
- **BLOC 1-2** : `blockOrchestrator` avec `blockQueues` → Vérification explicite `cursorIndex >= questions.length` (ligne 324)
- **BLOCS 3-10** : `executeAxiom()` → Pas de vérification, décision LLM uniquement

**Impact** : Les miroirs peuvent ne pas être générés si le LLM décide de continuer les questions.

---

### Cause racine secondaire : Annonce de transition pollue le texte miroir

**Flux actuel** :
1. Prompt demande : "Annonce transition APRÈS le miroir"
2. LLM génère : `miroir (3 sections) + "\n\n" + "Fin du BLOC X. On passe au BLOC Y."`
3. `aiText` contient : **Texte complet (miroir + annonce)**
4. Validation sur texte complet → **Peut échouer si annonce pollue**
5. Parsing sur texte complet → **Section 3️⃣ peut inclure annonce**
6. Affichage progressif si parsing réussit → **Section 3️⃣ polluée**
7. Affichage normal si parsing échoue → **Texte complet affiché**

**Impact** : Les miroirs sont générés et stockés, mais l'affichage est pollué par l'annonce de transition.

---

### Cause secondaire : Parsing strict peut échouer

**Logique parsing** :
- Regex strictes pour sections 1️⃣ 2️⃣ 3️⃣
- Si format non strict → Parsing échoue → `progressiveDisplay = false`

**Impact** : Si format miroir non strict, affichage normal (texte complet) au lieu d'affichage progressif.

---

### Cause tertiaire : Validation sur texte pollué

**Logique validation** :
- `validateMirrorREVELIOM(mirror)` valide texte complet (miroir + annonce)
- Si annonce pollue sections → Validation peut échouer

**Impact** : Miroirs peuvent être rejetés si annonce pollue le format.

---

## 💡 PROPOSITIONS DE CORRECTION

### Proposition 0 : Vérification explicite "toutes questions répondues" (SAFE)

**Principe** : Ajouter vérification explicite avant génération miroir (comme BLOC 1-2)

**Fichier** : `src/engine/axiomExecutor.ts:1580-1667`

**Modification** :
```typescript
// Avant appel OpenAI, vérifier si toutes questions répondues
const conversationHistory = candidate.conversationHistory || [];
const userMessagesInBlock = conversationHistory.filter(
  m => m.role === 'user' && m.block === blocNumber && m.kind !== 'mirror_validation'
);
const assistantQuestionsInBlock = conversationHistory.filter(
  m => m.role === 'assistant' && m.block === blocNumber && m.kind === 'question'
);

// Si toutes questions répondues (même nombre user/assistant) → Forcer prompt miroir
const allQuestionsAnswered = userMessagesInBlock.length >= assistantQuestionsInBlock.length;

if (allQuestionsAnswered && blocNumber >= 3 && blocNumber <= 9) {
  // Forcer prompt miroir (pas de décision LLM)
  content = `RÈGLE ABSOLUE AXIOM — MIROIR INTERPRÉTATIF ACTIF (REVELIOM)
  
Tu es en FIN DE BLOC ${blocNumber}.
Toutes les questions de ce bloc ont été répondues.
// ... (prompt miroir)
`;
} else {
  // Prompt normal (question ou miroir selon LLM)
  content = `RÈGLE ABSOLUE AXIOM :
// ... (prompt normal)
`;
}
```

**Avantages** :
- ✅ Vérification explicite (comme BLOC 1-2)
- ✅ Miroir généré systématiquement si toutes questions répondues
- ✅ Aucune modification prompt

**Risques** : Faible (ajout vérification, pas modification logique)

**Effort** : 3-4 heures

**Recommandation** : ✅ **RECOMMANDÉ** — Correction safe, impact majeur

---

### Proposition 1 : Séparer annonce de transition AVANT parsing (SAFE)

**Principe** : Extraire l'annonce de transition du texte miroir avant parsing et validation

**Fichier** : `src/engine/axiomExecutor.ts:1741-1798`

**Modification** :
```typescript
if (aiText && blocNumber >= 3 && blocNumber <= 9 && !expectsAnswer) {
  isMirror = true;
  
  // SÉPARER annonce de transition du miroir
  const transitionPattern = /Fin du BLOC \d+\. On passe au BLOC \d+ — .*$/m;
  const transitionMatch = aiText.match(transitionPattern);
  const mirrorText = transitionMatch 
    ? aiText.replace(transitionPattern, '').trim()
    : aiText;
  const transitionText = transitionMatch ? transitionMatch[0] : null;
  
  // Valider et parser uniquement le miroir (sans annonce)
  let mirror = mirrorText;
  // ... (validation et retry sur mirror uniquement)
  
  // Stocker miroir seul
  aiText = mirror;
  // Stocker annonce séparément si présente
  if (transitionText) {
    // Optionnel : stocker annonce comme message séparé
  }
}
```

**Avantages** :
- ✅ Miroir propre (sans annonce) pour validation et parsing
- ✅ Affichage progressif fonctionne correctement
- ✅ Aucune modification prompt

**Risques** : Faible (extraction texte, pas modification logique)

**Effort** : 2-3 heures

**Recommandation** : ✅ **RECOMMANDÉ** — Correction safe, impact majeur

---

### Proposition 2 : Parser et valider uniquement le miroir (SAFE)

**Principe** : Extraire sections 1️⃣ 2️⃣ 3️⃣ avant validation et parsing

**Fichier** : `src/engine/axiomExecutor.ts:1960-1965`

**Modification** :
```typescript
// Parser le miroir AVANT validation (extraction sections)
if (aiText && !expectsAnswer && blocNumber >= 3 && blocNumber <= 9) {
  // Extraire sections 1️⃣ 2️⃣ 3️⃣ (ignorer texte après)
  const sections = parseMirrorSections(aiText);
  if (sections.length === 3) {
    // Reconstruire miroir propre (sections uniquement)
    const cleanMirror = sections.join('\n\n');
    
    // Valider miroir propre
    const validation = validateMirrorREVELIOM(cleanMirror);
    if (validation.valid) {
      progressiveDisplay = true;
      mirrorSections = sections;
      // Utiliser miroir propre pour stockage
      aiText = cleanMirror;
    }
  }
}
```

**Avantages** :
- ✅ Miroir propre pour validation et affichage
- ✅ Annonce ignorée automatiquement

**Risques** : Faible (parsing défensif)

**Effort** : 1-2 heures

**Recommandation** : ✅ **RECOMMANDÉ** — Correction safe, impact majeur

---

### Proposition 3 : Modifier prompt pour séparation explicite (MODÉRÉE)

**Principe** : Demander séparation explicite avec marqueur (ex: `---TRANSITION---`)

**Fichier** : `src/engine/prompts.ts` (⚠️ **INTERDIT** — Prompts intangibles)

**Recommandation** : ❌ **NON APPLICABLE** — Prompts intangibles

---

### Proposition 4 : Stocker annonce séparément (STRUCTURANTE)

**Principe** : Stocker miroir et annonce comme messages séparés

**Fichier** : `src/engine/axiomExecutor.ts:1922-1929`

**Modification** :
```typescript
// Stocker miroir seul
if (aiText && isMirror) {
  candidateStore.appendAssistantMessage(candidate.candidateId, mirrorText, {
    block: blocNumber,
    step: nextState,
    kind: 'mirror',
  });
  
  // Stocker annonce séparément si présente
  if (transitionText) {
    candidateStore.appendAssistantMessage(candidate.candidateId, transitionText, {
      block: blocNumber,
      step: nextState,
      kind: 'transition_announcement',
    });
  }
}
```

**Avantages** :
- ✅ Séparation propre (miroir vs annonce)
- ✅ Affichage progressif fonctionne
- ✅ Annonce affichée séparément

**Risques** : Moyen (modification structure stockage)

**Effort** : 3-4 heures

**Recommandation** : ⚠️ **ALTERNATIVE** — Si Proposition 1+2 insuffisantes

---

## 📋 PLAN D'ACTION RECOMMANDÉ

### Étape 0 — Vérification explicite "toutes questions répondues" (SAFE)

**Proposition 0** : Ajouter vérification explicite avant génération miroir

**Scope** :
- Compter questions/réponses pour BLOCS 3-10
- Forcer prompt miroir si toutes questions répondues
- Garantir génération miroir systématique

**Risques** : Faible (ajout vérification)

**Temps** : 3-4 heures

**Tests** :
1. BLOC 4 : Répondre à toutes questions → Miroir généré systématiquement
2. BLOC 5-9 : Idem → Miroirs générés systématiquement

**Critère GO/NO-GO** : Miroirs générés systématiquement pour BLOCS 4-9

---

### Étape 1 — Correction immédiate (SAFE)

**Proposition 1 + 2** : Séparer annonce AVANT parsing + Parser uniquement sections

**Scope** :
- Extraire annonce de transition du texte miroir
- Parser et valider uniquement le miroir (sections 1️⃣ 2️⃣ 3️⃣)
- Stocker miroir propre

**Risques** : Faible (extraction texte, pas modification logique)

**Temps** : 3-4 heures

**Tests** :
1. Miroir BLOC 4 avec annonce → Miroir propre affiché, annonce ignorée
2. Miroir BLOC 5 avec annonce → Miroir propre affiché, annonce ignorée
3. Miroir BLOC 6-9 avec annonce → Miroir propre affiché, annonce ignorée
4. Affichage progressif fonctionne (sections propres)

**Critère GO/NO-GO** : Miroirs affichés proprement (sans annonce) pour BLOCS 4-9

---

### Étape 2 — Amélioration qualité (MODÉRÉE)

**Paramétrage proposé** :
- Modèle `gpt-4` ou `gpt-5.2` pour miroirs uniquement
- Température 0.8 pour miroirs

**Scope** :
- Créer `callOpenAIForMirror()` avec modèle/température différents
- Appliquer uniquement aux miroirs (BLOCS 3-9)

**Risques** : Moyen (coût, cohérence)

**Temps** : 2-3 heures

**Tests** :
- Génération miroirs avec nouveau modèle/température → Vérifier ton plus chaleureux

**Critère GO/NO-GO** : Ton mentor amélioré (test manuel)

---

### Étape 3 — Validation structurelle (SAFE)

**Validators profil final + matching** (voir ACTION_PLAN.md Lot 1)

**Temps** : 6-8 heures

---

## 🎯 RECOMMANDATION FINALE

**Correction immédiate** : **Proposition 0 + 1 + 2** (vérification explicite + séparation annonce AVANT parsing)

**Ordre d'exécution** :
1. **Proposition 0** : Vérification explicite "toutes questions répondues" → Garantir génération miroir
2. **Proposition 1 + 2** : Séparation annonce AVANT parsing → Garantir affichage propre

**Justification** :
- ✅ Correction safe (extraction texte, pas modification logique)
- ✅ Impact majeur (miroirs affichés proprement)
- ✅ Aucune modification prompt
- ✅ Effort faible (3-4 heures)

**Amélioration qualité** : **Paramétrage proposé** (modèle + température miroirs)

**Justification** :
- ✅ Impact majeur sur ton mentor
- ✅ Application ciblée (miroirs uniquement)
- ✅ Coût limité

---

**FIN DE L'AUDIT**
