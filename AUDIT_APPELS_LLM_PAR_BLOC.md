# Audit technique — Appels API / LLM par bloc (questions + miroirs)

**Rôle** : Audit strict, aucune modification de code. Lecture du code et traçage des chemins d’exécution réels.  
**Règle en cas de doute** : considéré comme OUI (appel LLM).

---

## Règle métier (référence)

| Autorisé LLM | Interdit LLM |
|--------------|---------------|
| Toutes les questions BLOC 2B | Questions BLOC 1 |
| Analyses miroir de chaque bloc concerné | Questions BLOC 2A |
| Analyse finale BLOC 10 | Questions BLOCS 3 à 9 |
| Matching final | |

---

## Tableau de verdict (preuves par chemin de code)

| Bloc | Questions LLM | Miroir LLM | Preuve (fichier + ligne) |
|------|---------------|------------|---------------------------|
| **1** | **NON** | **OUI** | Questions : `blockOrchestrator.ts` 211–217 — `STATIC_QUESTIONS[1]`, `setQuestionsForBlock`, `serveNextQuestion` (aucun `callOpenAI`). Miroir : `blockOrchestrator.ts` 338 — `generateMirrorForBlock1` → 508 `generateInterpretiveStructure`, 518 `selectMentorAngle`, 538 `renderMentorStyle` (tous LLM : `interpretiveStructureGenerator.ts` 84, `mentorAngleSelector.ts` 36, `mentorStyleRenderer.ts` 160). |
| **2A** | **OUI** ⚠️ | N/A | Questions : `blockOrchestrator.ts` 601 `generateQuestion2A1`, 646 `generateQuestion2A2`, 671 `generateQuestion2A3` ; chaque fonction appelle `callOpenAI` (734, 774, 820). Pas de miroir 2A (transition vers 2B). |
| **2B** | **OUI** | **OUI** | Questions : `blockOrchestrator.ts` 970 `generateQuestions2B` → 1138+ (callOpenAI 1146, 1295, 1560 selon sous-chemin). Miroir : 1081 `generateMirror2B` → 1734+ (generateInterpretiveStructure, selectMentorAngle, renderMentorStyle). |
| **3** | **NON** | **OUI** | Questions : `server.ts` 885 envoie à `executeWithAutoContinue` (hors BLOC_01/BLOC_02). `axiomExecutor.ts` 1796–1804 : `blocNumber` 3–9, `!shouldForceMirror` → `getStaticQuestion(blocNumber, index)` → pas d’appel LLM. Miroir : 1747–1756 `shouldForceMirror` si `areAllQuestionsAnswered` (seuil `EXPECTED_ANSWERS_FOR_MIRROR[3]`), puis 1907–1910 (callOpenAI/callOpenAIStream) et 2024 `generateMirrorWithNewArchitecture` (3 sous-appels LLM). |
| **4** | **NON** | **OUI** | Même chemin que BLOC 3 ; seuil `EXPECTED_ANSWERS_FOR_MIRROR[4]` (`staticQuestions.ts` 95). |
| **5** | **NON** | **OUI** | Idem ; seuil `EXPECTED_ANSWERS_FOR_MIRROR[5]`. |
| **6** | **NON** | **OUI** | Idem ; seuil `EXPECTED_ANSWERS_FOR_MIRROR[6]`. |
| **7** | **NON** | **OUI** | Idem ; seuil `EXPECTED_ANSWERS_FOR_MIRROR[7]`. |
| **8** | **NON** | **OUI** | Idem ; seuil `EXPECTED_ANSWERS_FOR_MIRROR[8]`. |
| **9** | **NON** | **OUI** | Idem ; seuil `EXPECTED_ANSWERS_FOR_MIRROR[9]`. |
| **10** | N/A | **OUI** | Synthèse finale : `axiomExecutor.ts` 1776–1789 `shouldForceSynthesis` → `generateMirrorWithNewArchitecture(..., 'synthesis', ...)` (interprétation + rendu, pas d’angle). Un seul chemin, pas de double appel pour la synthèse. |
| **Matching** | N/A | **OUI** | `axiomExecutor.ts` 2313–2332 : `currentState === STEP_99_MATCHING` → `generateMirrorWithNewArchitecture(allUserAnswers, 'matching', additionalContext, ...)`. Un seul appel par entrée en STEP_99_MATCHING. Aucun autre chemin ne génère le matching pour ce tour. |

---

## Chemins réels (résumé)

### Routage serveur (`server.ts`)

- **POST /axiom**  
  - `event === "START_BLOC_1"` → **orchestrator** (656).  
  - `step === BLOC_01 && currentBlock === 1` → **orchestrator** (738).  
  - `step === BLOC_02 && currentBlock === 2` → **orchestrator** (802).  
  - Sinon → **executeWithAutoContinue** (885) → executor (BLOC 3–10, matching).

- **POST /axiom/stream**  
  - Même logique : START_BLOC_1 → orchestrator (1373), BLOC_01+block 1 → orchestrator (1468), BLOC_02+block 2 → orchestrator (1539), sinon → executeWithAutoContinue (1636).

Conséquence : **BLOC 1 et BLOC 2 (2A/2B) ne passent jamais par l’executor pour les questions/miroirs en production** ; BLOC 3–10 et matching passent par l’executor.

### Déclenchement des miroirs (executor, BLOCS 3–9)

- **Condition** : `shouldForceMirror = (blocNumber === 1 || (blocNumber >= 3 && blocNumber <= 9)) && allQuestionsAnswered` (`axiomExecutor.ts` 1753–1755).  
- **allQuestionsAnswered** : pour blocs 1 et 3–9, `answersInBlock.length >= EXPECTED_ANSWERS_FOR_MIRROR[blocNumber]` (1702–1715).  
- **EXPECTED_ANSWERS_FOR_MIRROR** : aligné sur `STATIC_QUESTIONS[bloc].length` (`staticQuestions.ts` 92–100).  

Donc **miroir BLOC 3–9 déclenché à 100 %** lorsque le nombre de réponses utilisateur dans le bloc atteint le nombre de questions du catalogue (3 pour bloc 3, 5 pour 4–9).

---

## Anomalies et points d’attention

### 1) BLOC 2A — Appels LLM sur les questions (violation de la règle métier)

- **Règle** : ZÉRO appel LLM pour les questions du BLOC 2A.  
- **Code** : Les questions 2A.1, 2A.2, 2A.3 sont générées par `generateQuestion2A1`, `generateQuestion2A2`, `generateQuestion2A3`, chacune appelant `callOpenAI` (`blockOrchestrator.ts` 734, 774, 820).  
- **Verdict** : **Un appel LLM est exécuté pour chaque question BLOC 2A** → violation de la règle, tokens et latence supplémentaires.

### 2) BLOCS 3–9 — Double génération pour un même miroir (gaspillage)

- **Chemin** : En fin de bloc 3–9, lorsque `shouldForceMirror` est true :  
  1. `aiText` reste vide (pas de synthèse pour 3–9), donc exécution de `if (!aiText)` → **premier appel LLM** (prompt miroir générique, `callOpenAI` / `callOpenAIStream` 1902–1909).  
  2. Ensuite, si `cleanMirrorText && blocNumber 1–9 && !expectsAnswer` → **deuxième génération** via `generateMirrorWithNewArchitecture` (2024) → 3 appels LLM (interprétation + angle + rendu).  
- **Résultat** : Le premier miroir (générique) est **écrasé** par le second (nouvelle architecture). Donc **4 appels LLM par miroir 3–9**, dont 1 inutile (premier appel générique).  
- **Impact** : Tokens et latence inutiles ; les miroirs 3–9 sont bien déclenchés et conformes (nouvelle architecture), mais avec un appel redondant.

### 3) BLOC 1 — Conformité

- Questions : statiques (catalogue), pas d’appel LLM.  
- Miroir : une seule génération (orchestrator, `generateMirrorForBlock1`), conforme.

### 4) Matching — Pas de double appel

- Un seul chemin : `STEP_99_MATCHING` → `generateMirrorWithNewArchitecture(..., 'matching', ...)`. Aucune autre branche ne régénère le matching pour ce tour.

---

## Synthèse finale

| Critère | Statut |
|--------|--------|
| Questions BLOC 1 sans LLM | ✅ Conforme |
| Questions BLOC 2A sans LLM | ❌ **Non conforme** (3 appels LLM) |
| Questions BLOCS 3–9 sans LLM | ✅ Conforme |
| Miroirs déclenchés (1, 3–9, 2B) | ✅ Oui, avec seuils alignés sur le catalogue |
| BLOC 10 synthèse + matching | ✅ Un appel LLM chacun, pas de double |
| Matching unique | ✅ Un seul appel par entrée en STEP_99_MATCHING |
| Appel LLM inutile détecté | ⚠️ BLOC 2A questions (3 appels) ; BLOCS 3–9 miroir (1 appel générique redondant par miroir) |

---

*Audit par lecture de code : `server.ts`, `blockOrchestrator.ts`, `axiomExecutor.ts`, `interpretiveStructureGenerator.ts`, `mentorAngleSelector.ts`, `mentorStyleRenderer.ts`, `staticQuestions.ts`. Aucune modification de code.*
