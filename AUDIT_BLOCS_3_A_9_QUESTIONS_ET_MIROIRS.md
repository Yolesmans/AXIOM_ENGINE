# Audit technique — BLOCS 3 à 9 (questions + miroirs)

**Sans modification de code.** Preuves par fichiers et numéros de lignes.

---

## 1) QUESTIONS BLOCS 3–9 — Appel LLM OUI/NON

### Règle métier

- Questions BLOC 3 → 9 = **STATIQUES** (catalogue `staticQuestions.ts`).
- **ZÉRO** appel LLM autorisé pour ces questions.
- Temps attendu < 300 ms hors réseau.

### Chemins d’entrée (2 points d’entrée possibles)

| Entrée | Fichier | Comportement pour BLOC 3–9 |
|--------|---------|----------------------------|
| **POST /axiom** (Express) | `server.ts` | Lignes 713–738 : délégation orchestrator **uniquement** si `step === BLOC_01 && currentBlock === 1`. Lignes 776–802 : délégation orchestrator **uniquement** si `step === BLOC_02 && currentBlock === 2`. Sinon → ligne 885 : **`executeWithAutoContinue(candidate, userMessageText, event)`** → donc **executor** pour BLOC_03…BLOC_09. |
| **POST /axiom** (Fastify) | `api/axiom.ts` | Ligne 496 : **`executeAxiom({ candidate, userMessage: userMessageText })`** (pas d’orchestrator, pas de `executeWithAutoContinue`). Donc **executor** pour tout le collecting, dont BLOC 3–9. |

Donc, quel que soit l’entrée, les **questions** BLOC 3–9 sont censées être gérées par l’**executor** (`executeAxiom`).

### Chemin executor — questions BLOC 3–9

**Fichier** : `src/engine/axiomExecutor.ts`

1. **État dérivé** (l.1209, 1268)  
   - `currentState = deriveStateFromConversationHistory(candidate)`.  
   - Si dernier message assistant n’est pas `tone` / `preambule` / `question` (ex. miroir 2B) → fallback **deriveStepFromHistory** (l.1079) qui utilise **`candidate.session.currentBlock`** (l.1001–1003) : `BLOC_03` si `currentBlock === 3`, etc.  
   - Donc après passage en BLOC 3 (orchestrator ou exécution précédente), on doit bien avoir `currentState === BLOC_03` pour le bloc 3.

2. **Bloc 3–9** (l.1733–1735)  
   - `blocStates.includes(currentState)` → `blocNumber = 3` pour BLOC_03, etc.  
   - `shouldForceMirror` (l.1753–1755) = true **uniquement** si `allQuestionsAnswered` pour ce bloc.  
   - Pour les **questions** (pas toutes répondues) : `shouldForceMirror === false`.

3. **Questions statiques** (l.1795–1805)  
   - Condition :  
     `!aiText && blocNumber >= 1 && blocNumber <= 9 && blocNumber !== 2 && !shouldForceMirror`  
   - Alors :  
     - `answersInBlockForQuestion` = messages user dans `conversationHistory` pour ce bloc (l.1796–1799).  
     - `nextQuestion = getStaticQuestion(blocNumber, answersInBlockForQuestion.length)` (l.1800).  
     - Si `nextQuestion` → **`aiText = nextQuestion`** (l.1802–1803).  
   - **Aucun appel à `callOpenAI` / `callOpenAIStream`** dans ce bloc.

4. **Appel LLM** (l.1807–1912)  
   - **Uniquement** si `!aiText` (l.1808).  
   - Donc si `getStaticQuestion` a renvoyé une chaîne pour la question suivante, **on n’entre pas** dans ce bloc → **0 appel LLM** pour la question.

5. **Catalogue BLOC 3**  
   - **Fichier** : `src/engine/staticQuestions.ts`  
   - L.23–37 : `STATIC_QUESTIONS[3]` défini (3 questions).  
   - L.103–106 : `getStaticQuestion(3, index)` renvoie `STATIC_QUESTIONS[3][index]` si `index < length`.  
   - Donc pour BLOC 3, indices 0, 1, 2 → questions statiques bien définies.

### Verdict questions BLOC 3–9 (d’après le code)

- **Dans l’executor** : pour BLOC 3–9, tant qu’on n’est pas en “toutes réponses données”, le chemin prévu est :  
  **getStaticQuestion(blocNumber, answersInBlockForQuestion.length) → aiText → pas d’appel LLM.**
- **Preuve** :  
  - Questions statiques : `axiomExecutor.ts` 1795–1805, `staticQuestions.ts` 23–37, 103–106.  
  - Appel LLM seulement si `!aiText` : `axiomExecutor.ts` 1807–1912.

Donc **en théorie** : **questions BLOC 3–9 = 0 appel LLM** (à condition que l’état dérivé soit bien BLOC_03…BLOC_09 et que `getStaticQuestion` reçoive le bon index).

### Cause possible de latence / mauvais comportement (sans changer le code)

1. **Source de vérité des réponses**  
   - L’executor compte les réponses avec **`conversationHistory`** (l.1796–1799).  
   - **server.ts** (Express) : avant d’appeler l’executor, il fait **`appendUserMessage`** (l.864–870) → `conversationHistory` à jour.  
   - **api/axiom.ts** (Fastify) : en collecting il fait seulement **`addAnswer`** (l.480–494), **pas** `appendUserMessage`. Donc **`conversationHistory`** peut ne pas contenir les réponses BLOC 3.  
   - Conséquence possible (API Fastify) : `answersInBlockForQuestion.length` reste 0 ou incorrect → mauvais index passé à `getStaticQuestion` (ex. toujours 0 → toujours la même question) ou, si la dérivation d’état est fausse, on peut sortir du chemin “bloc 3–9” et tomber dans une branche qui appelle le LLM.

2. **Dérivation d’état**  
   - Si `deriveStateFromConversationHistory` ne renvoie pas BLOC_03 (ex. dernier message assistant = miroir, pas “question”), on utilise **deriveStepFromHistory** qui lit **`session.currentBlock`**.  
   - Si le client utilisé ne met pas à jour la session (ex. pas de mise à jour après réponse orchestrator), `currentBlock` peut rester à 2 → état dérivé BLOC_02 → on ne rentre pas dans la logique “questions statiques BLOC 3” et on peut passer dans un autre bloc qui appelle le LLM.

3. **Résumé**  
   - **Aucune modification de code** : le design prévoit bien **0 appel LLM** pour les questions BLOC 3–9 dans l’executor.  
   - Une latence ~30 s et des questions “longues” sont **compatibles** avec un chemin où **ce n’est pas** la branche “question statique” qui est prise (mauvais état dérivé ou mauvais index de question), ou avec un **autre point d’entrée** (ex. API qui ne remplit pas `conversationHistory` comme server.ts).  
   - Pour confirmer à 100 % en prod : il faut des **logs** montrant pour chaque requête “question BLOC 3” :  
     - `currentState` / `derivedState` = BLOC_03,  
     - `blocNumber === 3`,  
     - `shouldForceMirror === false`,  
     - `getStaticQuestion(3, …)` appelé et retour non null,  
     - et **aucun** `callOpenAI` / `callOpenAIStream` exécuté pour ce tour.

---

## 2) MIROIRS BLOCS 3–9 — Lecture en creux (prompt + branche)

### Comportement attendu

- Miroir final = **lecture en creux** (type “Ce n’est probablement pas X, mais Y…”).
- Même ADN que le miroir BLOC 1 (format REVELIOM, angle mentor).
- Le “double appel” (premier appel cadre + nouvelle architecture) est **voulu** ; ne pas le supprimer.

### Chemin réel du miroir affiché (executor)

**Fichier** : `src/engine/axiomExecutor.ts`

1. **Toutes les réponses du bloc** (l.1746–1755)  
   - `allQuestionsAnswered` via `areAllQuestionsAnswered(candidate, blocNumber)` (seuils `EXPECTED_ANSWERS_FOR_MIRROR`, alignés sur le catalogue, l.1711–1713).  
   - `shouldForceMirror === true` pour BLOC 3–9 quand toutes les questions du bloc sont répondues.

2. **Premier appel LLM (cadre miroir)** (l.1807–1912)  
   - Si `!aiText` (pas de synthèse BLOC 10), on appelle **callOpenAI / callOpenAIStream** avec le prompt “miroir REVELIOM” (l.1811–1885) : posture mentor, format 1️⃣2️⃣3️⃣, “Lecture en creux obligatoire (ce n’est probablement pas X, mais plutôt Y)”.  
   - Résultat mis dans **`aiText`**.

3. **Détection miroir et nouvelle architecture** (l.1993–2043)  
   - Si `cleanMirrorText && blocNumber 1–9 && !expectsAnswer` → **isMirror = true** (l.1993–1995).  
   - Pour BLOC 3 : **blockType = 'block3'** (l.2006–2017, 2019).  
   - **Appel** : **`generateMirrorWithNewArchitecture(userAnswersInBlock, blockType, …)`** (l.2025).  
   - **Si succès** : `cleanMirrorText = generatedMirror`, **`aiText = generatedMirror`** (l.2031–2032).  
   - **Si erreur** (catch l.2040–2043) : on log “Fallback : utiliser texte original” et **on ne réassigne pas `aiText`** → le texte final restant est celui du **premier** appel (l.1902–1910), pas celui de la nouvelle architecture.

4. **Texte final renvoyé** (l.2216–2222, 2275–2276)  
   - C’est **`aiText`** qui est enregistré et renvoyé (l.2217, 2275).  
   - Donc :  
   - Si **generateMirrorWithNewArchitecture** réussit → l’utilisateur voit le miroir **lecture en creux** (nouvelle architecture : interprétation + angle “Ce n’est probablement pas X, mais Y” + rendu mentor).  
   - Si **generateMirrorWithNewArchitecture** lance une exception → l’utilisateur voit le **premier** appel (prompt REVELIOM long), qui peut être plus descriptif / moins strict que l’angle mentor.

### Prompts utilisés pour le miroir final (quand la nouvelle architecture réussit)

- **Premier appel** (l.1811–1885) : prompt “RÈGLE ABSOLUE AXIOM — MIROIR INTERPRÉTATIF ACTIF (REVELIOM)”, format 1️⃣2️⃣3️⃣, “Lecture en creux obligatoire (ce n’est probablement pas X, mais plutôt Y)”. Ce texte peut être **écrasé** par la nouvelle architecture.
- **Nouvelle architecture** (`generateMirrorWithNewArchitecture`, l.42–132) :  
  - Étape 1 : **generateInterpretiveStructure** (structure JSON, gpt-4o-mini).  
  - Étape 2 : **selectMentorAngle** (gpt-4o-mini) — format **obligatoire** “Ce n’est probablement pas X, mais Y.” (voir `mentorAngleSelector.ts`).  
  - Étape 3 : **renderMentorStyle** (gpt-4o) — rendu mentor à partir de cet angle.  
- Donc le **rendu final conforme “lecture en creux”** vient de la **nouvelle architecture** ; le premier appel sert de cadre et de secours en cas d’erreur.

### Verdict miroirs BLOC 3–9 (d’après le code)

- **Branche utilisée pour le texte affiché** :  
  - Succès nouvelle architecture → **generateMirrorWithNewArchitecture** (interprétation + angle + rendu).  
  - Échec (exception) → **premier appel** (prompt REVELIOM l.1811–1885).  
- **Conformité “lecture en creux”** :  
  - **OUI** si la nouvelle architecture s’exécute sans erreur (angle + rendu mentor).  
  - **NON garanti** si on est en fallback (premier appel) : le prompt demande bien une lecture en creux, mais le modèle peut rendre un texte plus descriptif.

Donc un miroir “descriptif / plat / pas en creux” est **compatible** avec un **fallback** sur le premier appel parce que **generateMirrorWithNewArchitecture** a levé une exception (l.2040–2043). À vérifier en logs : présence de  
`[AXIOM_EXECUTOR] Erreur génération miroir BLOC 3 avec nouvelle architecture` (ou équivalent).

---

## 3) Tableau récapitulatif (preuves par bloc)

| Bloc | Questions → appel LLM ? | Preuve (fichier + ligne) | Miroir → prompt / branche |
|------|-------------------------|---------------------------|----------------------------|
| **3** | **NON** (design) | Executor : 1795–1805 `getStaticQuestion(blocNumber, …)` ; 1807 seulement si `!aiText`. Catalogue : `staticQuestions.ts` 23–37, 103–106. | Miroir : 1807–1910 (1er appel) puis 1993–2039 **generateMirrorWithNewArchitecture** (block3). Texte affiché = nouvelle arch. si pas d’erreur ; sinon 1er appel (fallback). |
| **4** | **NON** (design) | Même chemin que bloc 3 ; `STATIC_QUESTIONS[4]` défini. | Même schéma ; blockType = 'block4'. |
| **5** | **NON** (design) | Idem. | Idem ; 'block5'. |
| **6** | **NON** (design) | Idem. | Idem ; 'block6'. |
| **7** | **NON** (design) | Idem. | Idem ; 'block7'. |
| **8** | **NON** (design) | Idem. | Idem ; 'block8'. |
| **9** | **NON** (design) | Idem. | Idem ; 'block9'. |

---

## 4) Liste des appels LLM pendant un BLOC 3 complet (d’après le code)

Pour un BLOC 3 **complet** (3 questions + 1 miroir) :

- **Questions 1, 2, 3** :  
  - Aucun appel LLM si le chemin “question statique” est pris (l.1795–1805, `getStaticQuestion(3, 0/1/2)`).  
  - Donc **0 appel** pour les 3 questions, dans le design actuel.

- **Miroir BLOC 3** (une fois les 3 réponses données) :  
  1. **Premier appel** (l.1902–1910) : callOpenAI / callOpenAIStream avec prompt miroir REVELIOM (cadre).  
  2. **Nouvelle architecture** (l.2025) :  
     - generateInterpretiveStructure (call LLM dans `interpretiveStructureGenerator.ts`).  
     - selectMentorAngle (call LLM dans `mentorAngleSelector.ts`).  
     - renderMentorStyle (call LLM dans `mentorStyleRenderer.ts`).  

Donc pour le miroir seul : **4 appels LLM** (1 cadre + 3 nouvelle architecture). Le texte **affiché** est celui de la nouvelle architecture (ou du 1er appel en cas d’erreur).

---

## 5) Synthèse et recommandations de vérification

- **Questions BLOC 3–9**  
  - Dans le code : **0 appel LLM** prévu pour les questions (getStaticQuestion → aiText, pas d’entrée dans `if (!aiText)` pour la question suivante).  
  - Pour confirmer en prod : logs montrant `[AXIOM][STATE]` avec `blocNumber`, `shouldForceMirror`, et absence d’appel OpenAI sur les requêtes “question BLOC 3”.  
  - Si le client utilise **api/axiom.ts** : vérifier que les réponses sont bien reflétées dans **conversationHistory** (ou que la session/currentBlock est cohérente), sinon le bon index de question et le bon état dérivé ne sont pas garantis.

- **Miroirs BLOC 3–9**  
  - **Conformité lecture en creux** : oui si le texte vient de **generateMirrorWithNewArchitecture** (angle + rendu mentor).  
  - Si le miroir est descriptif / pas en creux : vérifier en logs si **generateMirrorWithNewArchitecture** a levé une exception (fallback sur le premier appel).  
  - Ne pas supprimer le double appel ; le rendu final “bon” est celui de la nouvelle architecture.

- **Aucune modification de code** dans le présent audit ; uniquement traçage et preuves par fichiers/lignes.
