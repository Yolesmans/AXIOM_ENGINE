# AUDIT COMPLET REVELIOM — BLOC 2A / 2B — CONFORMITÉ PROMPT V8.9

**Objectif :** Diagnostic structurel et cartographie des violations par rapport au prompt officiel REVELIOM_ELGAENERGY V8 / V8.9.  
**Aucune modification demandée — audit uniquement.**

---

## 1️⃣ BLOC 2A — RÈGLES ABSOLUES

### Règles à vérifier (prompt V8.9)

| Règle | Attendu |
|-------|--------|
| Pas de miroir | BLOC 2A ne produit **AUCUN** miroir |
| Pas d’analyse | Aucune analyse, aucune interprétation |
| Pas de validation "ok" | Pas de demande de type "dis ok pour continuer" |
| Transition automatique | Passage direct vers BLOC 2B après 3 réponses |
| Affichage obligatoire | "🧠 FIN DU BLOC 2A — PROJECTIONS NARRATIVES" puis "On passe maintenant au BLOC 2B" |

---

### A) Ce qui est conforme

- **Aucun miroir en fin de 2A**  
  - **Où :** Tout le flux BLOC 2 (step BLOC_02, currentBlock 2) est géré par `blockOrchestrator.handleMessage` ; `executeAxiom` n’est **jamais** appelé pour le bloc 2.  
  - **Preuve :** `server.ts` L776 : `if (candidate.session.ui?.step === BLOC_02 && candidate.session.currentBlock === 2)` → délégation à l’orchestrateur uniquement.  
  - **Preuve :** `axiomExecutor.ts` L1796 : `blocNumber !== 2` exclut le bloc 2 des questions statiques et du chemin miroir.  
  - Aucun appel à `generateMirrorBlock` / `generateMirrorForBlock1` / `generateMirror2B` n’est fait après la 3ᵉ réponse 2A ; le code enchaîne directement avec `handleBlock2B(currentCandidate, null, null, ...)` (`blockOrchestrator.ts` L747–751).

- **Pas de demande de validation "ok"**  
  - Après la 3ᵉ réponse 2A, le moteur ne pose pas de question intermédiaire ; il appelle immédiatement `handleBlock2B`. La transition est automatique côté logique.

- **Bloc 2A non traité comme interprétatif dans l’executor**  
  - Le bloc 2 est explicitement exclu du flux "questions statiques + miroir" dans `axiomExecutor` (L1796 : `blocNumber !== 2`). Aucun `setCurrentBlock` n’existe dans le code ; le bloc courant vient de `candidate.session.currentBlock`, mis à jour par le store (ex. après validation miroir 2B → passage au bloc 3).

- **Pas d’analyse ni d’interprétation pendant 2A**  
  - Les réponses 2A sont stockées ; les seuls appels LLM en 2A sont : génération des 3 questions (2A.1, 2A.2, 2A.3) et `normalizeWorksLLM` après la 2ᵉ réponse. Aucune génération de miroir ni de texte interprétatif.

---

### B) Violations — BLOC 2A

| # | Violation | Où | Pourquoi |
|---|-----------|-----|----------|
| **V-2A-1** | **Texte de transition jamais affiché** | `blockOrchestrator.ts` L747–751 | Le prompt exige l’affichage de "🧠 FIN DU BLOC 2A — PROJECTIONS NARRATIVES" puis "On passe maintenant au BLOC 2B". Après la 3ᵉ réponse, le code fait uniquement `return this.handleBlock2B(...)`, qui génère (si besoin) les questions 2B et retourne la **première question 2B**. Aucune concaténation ni retour intermédiaire avec les deux lignes ci-dessus. L’utilisateur ne voit donc jamais ces libellés. |
| **V-2A-2** | **Risque de miroir si routage incorrect** | `server.ts` L776 vs L884 | Si une requête arrivait avec `step !== BLOC_02` ou `currentBlock !== 2` alors que la session est encore en 2A, elle pourrait passer dans `executeAxiom`. Dans `axiomExecutor`, le bloc 2 est exclu du miroir (L1796), mais le chemin "pas de question statique pour bloc 2" pourrait aboutir à un autre comportement. En l’état, tant que le front envoie bien (step=BLOC_02, currentBlock=2), aucun miroir 2A. À vérifier en prod si un miroir apparaît malgré tout. |

---

### C) Où est appelée la logique miroir (référence)

- **Miroir BLOC 1 :** `blockOrchestrator.ts` L354–358 — lorsque `finalQueue.cursorIndex >= finalQueue.questions.length` pour `blockNumber === 1` → `generateMirrorForBlock1`.
- **Miroir BLOC 2B :** `blockOrchestrator.ts` L1186–1193 — lorsque toutes les questions 2B sont répondues → `generateMirror2B`.
- **Miroirs blocs 3–9 :** `axiomExecutor.ts` (ex. L2024) — `generateMirrorWithNewArchitecture` pour blocs 3 à 9 ; le bloc 2 est exclu par `blocNumber !== 2` (L1796).
- **Aucun appel** à une fonction de type "generateMirror" n’est fait après la 3ᵉ réponse 2A ; `setCurrentBlock` n’existe pas dans le code (la mise à jour de bloc se fait via `candidateStore.updateSession` / `updateUIState`).

---

## 2️⃣ TRANSITION BLOC 2A → 2B

### Règle prompt

Transition **automatique** ; aucune attente de "ok" ; aucune validation utilisateur.

### A) Conforme

- **Pas d’attente explicite de "ok"**  
  - Après la 3ᵉ réponse 2A, le serveur a déjà enregistré le message (L777–784), puis appelle `orchestrator.handleMessage(candidate, userMessageText, null)`. Dans `handleBlock2A`, dès que `updatedAnsweredCount === 3`, le retour est `this.handleBlock2B(currentCandidate, null, null, ...)` (L747–751). Aucune étape supplémentaire ni question "Tu veux passer au 2B ?".

- **blockNumber ne change pas à la transition 2A→2B**  
  - C’est voulu : on reste en `currentBlock: 2` pour tout le bloc 2 (2A + 2B). Le changement de bloc (2 → 3) n’a lieu qu’après **validation du miroir 2B** (`blockOrchestrator.ts` L1150–1154).

- **serveNextQuestion / curseur**  
  - En 2A il n’y a pas de queue à curseur ; les 3 réponses sont dans `answerMaps[2].answers`. La "prochaine étape" est déterminée par `updatedAnsweredCount` (1 → question 2A.2, 2 → normalisation + question 2A.3, 3 → handleBlock2B). Rien n’est bloqué par un curseur en 2A.

### B) Comportement à noter

- **Une requête utilisateur est nécessaire pour avancer**  
  - La transition 2A→2B ne se fait que lorsque l’utilisateur envoie sa **3ᵉ réponse**. Il n’y a pas d’"auto-continue" sans message (pas d’appel côté serveur sans nouveau message). Conformément au prompt : on n’attend pas de "ok" en plus de la 3ᵉ réponse ; la 3ᵉ réponse suffit pour déclencher le passage au 2B.

---

## 3️⃣ BLOC 2B — VÉRIFICATIONS CRITIQUES

### Règles prompt V8.9

- Œuvres traitées dans l’ordre **#3 → #2 → #1**
- Une seule question à la fois
- Format A/B/C/D/E sur lignes séparées, 1 seule réponse possible
- Aucune analyse avant synthèse finale 2B
- Micro-récap factuel par œuvre ; synthèse finale personnalisée (4–6 lignes max)

---

### A) Conforme

- **6 questions initiales (motif + personnages)**  
  - `generateMotifAndPersonnagesQuestions2B` retourne 6 questions (motif + personnages pour chaque œuvre), meta dérivée du JSON ; `setQuestionsForBlock(..., questions.slice(0, 6), meta.slice(0, 6))` (`blockOrchestrator.ts` L1053–1054).

- **Une question à la fois**  
  - Servie via `serveNextQuestion2B` ; le curseur est avancé après envoi de la question (`advanceQuestionCursor`).

- **Pas de miroir prématuré en 2B**  
  - Le miroir 2B n’est généré que lorsque `finalQueue.cursorIndex >= finalQueue.questions.length` (L1125), après toutes les questions (y compris traits/recap insérés dynamiquement).

- **Aucune fonction generateMirrorBlock appelée pendant le flux 2A**  
  - Confirmé : seul le flux 2B en fin de bloc appelle `generateMirror2B`.

- **normalizeWorksLLM et normalizeCharactersLLM — même modèle**  
  - Les deux utilisent `callOpenAI` sans paramètre `model` → `openaiClient.ts` `DEFAULT_MODEL` = **gpt-4o** (L13, L40). Donc même modèle pour les deux.

- **Format A/B/C/D/E et garde A–E**  
  - Le prompt 2B demande des options A à E ; une garde empêche d’envoyer une réponse type "D" à `normalizeCharactersLLM` (`looksLikeChoiceAE`, L1094–1098).

---

### B) Violations — BLOC 2B

| # | Violation | Où | Pourquoi |
|---|-----------|-----|----------|
| **V-2B-1** | **Ordre des œuvres inversé par rapport au prompt** | `blockOrchestrator.ts` L1328–1341 | Le prompt V8.9 impose : "AXIOM traite les œuvres dans cet ordre obligatoire : **Œuvre #3 → Œuvre #2 → Œuvre #1**". Dans le code, les œuvres sont labellisées "**#1** ${w0}, **#2** ${w1}, **#3** ${w2}" et les questions sont générées dans l’ordre workIndex 0, 1, 2 (donc **#1 puis #2 puis #3**). La première question posée est donc pour l’œuvre #1, alors que le prompt exige de traiter **#3 en premier**. Même incohérence dans l’ordre par rapport à `generateMirror2B` (L2115–2117), où l’affichage est "Œuvre #3 : works[2], #2 : works[1], #1 : works[0]" : le miroir suppose works[0]=#1, works[1]=#2, works[2]=#3, alors que le déroulé des questions traite d’abord works[0] (#1). Pour être conforme, il faudrait que la **première** question soit sur l’œuvre #3 (ex. works[2] si on garde cette convention). |
| **V-2B-2** | **Modèle non uniforme sur toute la chaîne 2B** | Voir § 4 | Les étapes "structure" et "angle" du miroir 2B utilisent **gpt-4o-mini** (interpretiveStructureGenerator, mentorAngleSelector) ; le rendu final utilise **gpt-4o**. Pour les **questions** 2B (génération, normalisation), c’est bien **gpt-4o** partout via `callOpenAI`. La demande d’audit ("vérifier que le modèle utilisé est bien gpt-4o") est donc respectée pour la partie questions/normalisation ; pour le miroir 2B, seules les étapes "structure" et "angle" sont en 4o-mini (choix de coût/qualité). |

---

## 4️⃣ ANALYSE DES APPELS API (2A / 2B)

### BLOC 2A — Appels LLM

| Ordre | Fonction | Fichier (approx.) | Modèle | Rôle |
|-------|----------|-------------------|--------|------|
| 1 | `generateQuestion2A1` | blockOrchestrator L788 | gpt-4o (DEFAULT) | Question 1 (médium Série/Film) |
| 2 | `generateQuestion2A2` | blockOrchestrator L828 | gpt-4o | Question 2 (préférences) |
| 3 | `normalizeWorksLLM` | blockOrchestrator L1258 | gpt-4o | Normalisation des œuvres après réponse 2 |
| 4 | `generateQuestion2A3` | blockOrchestrator L874 | gpt-4o | Question 3 (œuvre noyau) |

**Total 2A : 4 appels** (ou 3 si pas de normalisation / pas de retry). Aucun appel legacy redondant identifié pour 2A.

---

### BLOC 2B — Appels LLM (questions + miroir)

**Génération des questions (premium) :**

| Ordre | Fonction | Fichier | Modèle | Rôle |
|-------|----------|---------|--------|------|
| 1 | `generateMotifAndPersonnagesQuestions2B` | blockOrchestrator L1324 | gpt-4o | 6 questions motif + personnages (1 appel) |

**Par réponse utilisateur (personnages) :**

| Ordre | Fonction | Modèle | Rôle |
|-------|----------|--------|------|
| - | `normalizeCharactersLLM` | gpt-4o | Si réponse "personnages" (et pas choix A–E) |
| - | `generateTraitsForCharacterLLM` | gpt-4o | Une fois par personnage normalisé (1 question traits + options) |

**Miroir final 2B (nouvelle architecture) :**

| Ordre | Fonction | Fichier | Modèle | Rôle |
|-------|----------|---------|--------|------|
| 1 | `generateInterpretiveStructure` | interpretiveStructureGenerator | **gpt-4o-mini** | Structure interprétative |
| 2 | `selectMentorAngle` | mentorAngleSelector | **gpt-4o-mini** | Angle mentor |
| 3 | `renderMentorStyle` | mentorStyleRenderer | **gpt-4o** | Rendu synthèse 4–6 lignes |

- **callOpenAI** (blockOrchestrator) : pas de paramètre `model` → toujours **gpt-4o** (openaiClient DEFAULT_MODEL).
- **callOpenAIStream** : idem par défaut (openaiClient L93).
- **Fallback** (openaiClient L56–59, L122–124) : si modèle non disponible, fallback **gpt-4o-mini**.

### Doubles exécutions / legacy

- En 2A/2B **orchestrateur** : pas de double génération de questions ni de miroir. Le flux legacy 2B (`generateQuestions2B` + `validateAndRetryQuestions2B`) n’est utilisé que si `!normalizedWorks` (L1056–1058).
- Aucun appel à `executeAxiom` pour le bloc 2 ; donc aucun chemin "miroir legacy" de l’executor pour le bloc 2.

---

## 5️⃣ ALIGNEMENT STRICT AVEC PROMPT V8

### "⚠️ Bloc NON interprétatif" / "Aucune analyse avant le Bloc 2B"

- **Conforme :** Aucune analyse ni interprétation n’est produite pendant le 2A. Les seuls textes renvoyés sont les 3 questions et éventuellement un message de clarification (normalisation œuvres). Aucun miroir, aucun commentaire interprétatif.

### "Aucune interprétation avant synthèse finale 2B"

- **Conforme :** Pendant le déroulé des questions 2B, le moteur ne renvoie que des questions (et éventuellement des messages de clarification pour personnages). La seule interprétation (synthèse) est produite à la fin, via `generateMirror2B`, après que toutes les questions soient répondues.

### Violations déjà listées

- V-2A-1 : texte de transition 2A non affiché.  
- V-2B-1 : ordre des œuvres #3 → #2 → #1 non respecté (code en #1 → #2 → #3).

---

## 6️⃣ SYNTHÈSE LIVRABLE

### A) Ce qui est conforme

- BLOC 2A ne produit aucun miroir ; bloc 2 entièrement géré par l’orchestrateur ; pas d’analyse ni d’interprétation pendant 2A.
- Pas de demande de validation "ok" ; transition automatique vers 2B après la 3ᵉ réponse.
- Une question 2B à la fois ; 6 questions initiales motif + personnages ; pas de miroir prématuré en 2B.
- normalizeWorksLLM et normalizeCharactersLLM utilisent le même modèle (gpt-4o via callOpenAI).
- Tous les appels 2A/2B dans blockOrchestrator passent par callOpenAI → gpt-4o (sauf fallback modèle indisponible).
- Garde A–E en place ; pas d’appel à normalizeCharactersLLM avec une réponse type A–E.

### B) Ce qui viole le prompt

| Id | Règle | Violation |
|----|-------|-----------|
| V-2A-1 | Affichage obligatoire | "🧠 FIN DU BLOC 2A — PROJECTIONS NARRATIVES" et "On passe maintenant au BLOC 2B" jamais renvoyés au client. |
| V-2B-1 | Ordre #3 → #2 → #1 | Questions 2B posées dans l’ordre #1 → #2 → #3 (works[0] puis works[1] puis works[2]). |

### C) Où ça se produit dans le code

- **V-2A-1 :** `blockOrchestrator.ts` L747–751 — retour direct `handleBlock2B(...)` sans construire de réponse contenant les deux lignes de transition.
- **V-2B-1 :** `blockOrchestrator.ts` L1328–1341 — libellé "#1 w0, #2 w1, #3 w2" et ordre des entrées JSON (workIndex 0, 1, 2) ; premier traitement = #1 au lieu de #3.

### D) Pourquoi ça se produit

- **V-2A-1 :** La spécification d’affichage de la transition n’a pas été implémentée dans la réponse serveur ; seul le passage à la première question 2B a été codé.
- **V-2B-1 :** La convention d’indices (workIndex 0 = première œuvre traitée) a été alignée sur l’ordre du tableau `works[]` sans inverser pour respecter "traiter #3 en premier". La sémantique #1/#2/#3 (ex. #1 = noyau) n’est pas reflétée dans l’ordre de traitement.

### E) Recommandations structurelles (sans implémentation)

1. **Transition 2A → 2B**  
   - Avant d’appeler `handleBlock2B` (ou avant de retourner la première question 2B), renvoyer une réponse dont le corps contient exactement les deux lignes demandées par le prompt ("🧠 FIN DU BLOC 2A — PROJECTIONS NARRATIVES" puis "On passe maintenant au BLOC 2B"), soit seules, soit suivies de la première question 2B, selon le choix produit/UX. Garantir que ce texte est bien celui affiché côté client.

2. **Ordre des œuvres 2B**  
   - Définir explicitement dans le code quelle œuvre est #1, #2, #3 (ex. #1 = noyau, #2/#3 = goûts actuels). Puis faire en sorte que la **première** question posée soit pour l’œuvre #3, la suivante pour #2, la dernière pour #1 (ex. ordre des questions = [works[2], works[1], works[0]] si works = [#1, #2, #3], ou réordonner `works` pour que works[0]=#3, works[1]=#2, works[2]=#1). Aligner `generateMotifAndPersonnagesQuestions2B` et `generateMirror2B` sur cette convention.

3. **Miroir en fin de 2A**  
   - Si en production un miroir apparaît malgré tout en fin de 2A : vérifier le routage (step, currentBlock) et s’assurer qu’aucune requête "bloc 2" ne passe par `executeAxiom`. Ajouter un log côté serveur lorsque la route 2A/2B est prise pour tracer les requêtes.

4. **Modèle gpt-4o**  
   - Conserver gpt-4o pour toutes les sorties narratives et questions 2A/2B. Les étapes structure/angle du miroir 2B en gpt-4o-mini restent un choix de coût ; documenter clairement cette répartition pour REVELIOM.

---

*Audit réalisé sur la base du code source (blockOrchestrator, axiomExecutor, server, openaiClient, prompts, mentorStyleRenderer, interpretiveStructureGenerator, mentorAngleSelector) — aucune modification appliquée.*
