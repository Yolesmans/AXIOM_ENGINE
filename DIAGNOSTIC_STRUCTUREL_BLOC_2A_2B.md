# Diagnostic structurel BLOC 2A / 2B — Sans correctif

**Date** : 2025-02-10  
**Demande** : Explication de ce qui est cassé, cartographie du flux réel, cause racine, stratégie de retour à un état stable. Aucune modification de code.

---

## Contexte des régressions constatées

- **Avant** (validation renforcée 2A / refonte premium) : appels API dynamiques, questions pertinentes, options cohérentes, réponses prises en compte, pas de « demande trop vague » incohérente, pas de placeholder mal injecté.
- **Depuis** : réponses utilisateur mal prises en compte, traits génériques, clarifications alors que la question est claire, comportement type fallback ou dégradé, perte de contexte.

Scénario type observé (capture) :
1. Question affichée : « Qu'est-ce qui t'attire le PLUS dans **[Suits]** ? » (options A–E).
2. Utilisateur répond « D ».
3. Réponse moteur : « La demande est trop vague. Peux-tu préciser le personnage ou donner plus de détails ? »

---

# Réponses aux 10 points d’analyse

## 1) Est-ce que le bon modèle est appelé ?

**Oui.** Les appels passent par `callOpenAI` / `callOpenAIStream` (openaiClient) avec le modèle par défaut (gpt-4o ou fallback gpt-4o-mini). Aucune branche 2A/2B n’utilise un modèle différent ou désactivé.

## 2) Est-ce que les appels LLM sont réellement exécutés ?

**Oui.** En premium : `normalizeWorksLLM`, `normalizeCharactersLLM`, `generateMotifAndPersonnagesQuestions2B`, `generateTraitsForCharacterLLM` sont bien appelés. En legacy : `generateQuestions2B` (et éventuellement `generateQuestions2BWithReconciliation`). Aucune branche ne court-circuite ces appels par un retour statique.

## 3) Est-ce que le contexte complet est bien injecté dans les prompts ?

**Partiellement.**  
- Pour 2B : `buildConversationHistoryForBlock2B` injecte les réponses 2A (médium, préférences, œuvre noyau) en système. Les `works` utilisés viennent de `session.normalizedWorks` (premium) ou de `parseWorks(preferencesAnswer)` (legacy).  
- **Problème** : Le prompt de `generateMotifAndPersonnagesQuestions2B` contient des **chaînes littérales avec crochets** :  
  `Qu'est-ce qui t'attire le PLUS dans [${works[2] || 'N/A'}] ?`  
  Donc en sortie LLM on obtient des questions avec **« dans [Suits] »** au lieu de **« dans Suits »**. Ce n’est pas un placeholder non remplacé côté code, mais une **consigne de format donnée au LLM** qui reproduit les crochets. Le contexte œuvres est bien passé ; la forme de la question est dégradée par ce choix de template.

## 4) Est-ce qu’il existe des branches où le moteur passe en mode simplifié ?

**Oui, de façon conditionnelle.**  
- Si `session.normalizedWorks` est absent à l’entrée 2B → fallback **legacy** : `parseWorks` + `generateQuestions2B` (génération globale) + pas de meta, injection des noms par index fixe (QUESTIONS_PER_WORK = 6), avec risque « E de Suits » déjà identifié.  
- Si `normalizeWorksLLM` ou `normalizeCharactersLLM` renvoie `needsClarification` → on retourne **uniquement** le message de clarification (sans servir de question suivante ni réutiliser la réponse). Donc une branche « simplifiée » existe : pas de suite de flux, juste un message.

Aucune autre branche type « mode dégradé » n’a été trouvée (pas de désactivation silencieuse des appels).

## 5) Est-ce que normalizedWorks / normalizedCharacters perturbent le flux ?

**Ils ne perturbent pas par leur présence** : en premium, ils sont la source de vérité et permettent la génération dynamique des traits.  
**En revanche, deux choses perturbent le flux :**  
- **Détection « personnages »** : on considère qu’une réponse est « personnages » si `meta[questionIndex].slot === 'personnages'`. Si **meta et l’ordre réel des questions ne correspondent pas** (voir point 6), une réponse à une question **motif** (ex. « D ») peut être traitée comme réponse **personnages** et envoyée à `normalizeCharactersLLM`, qui renvoie alors une clarification (« demande trop vague », « préciser le personnage »).  
- **Clarification bloquante** : dès que `normalizeCharactersLLM` renvoie `needsClarification`, on retourne ce message et on **n’avance pas** le curseur. L’utilisateur a l’impression que sa réponse valide (ex. « D » pour une question motif) est ignorée.

## 6) Est-ce qu’un ancien flux et le nouveau flux coexistent ?

**Oui.**  
- **Premium** : `normalizedWorks` présent → 6 questions (motif + personnages) + meta, puis après chaque réponse « personnages » → normalisation personnages + génération traits + insertion.  
- **Legacy** : pas de `normalizedWorks` → `parseWorks` + `generateQuestions2B` (tout le bloc) + pas de meta, injection par index 6 par œuvre dans `serveNextQuestion2B`.  

Les deux flux ne se mélangent pas dans la même session (une session a soit normalizedWorks, soit non), mais **le code contient les deux logiques** et le legacy reste fragile (index fixe, placeholders).

## 7) Est-ce que la queue 2B est cohérente du début à la fin ?

**Pas toujours.**  
- **Meta fixe** : on impose `meta = [motif, personnages, motif, personnages, motif, personnages]` **par index** (0, 1, 2, 3, 4, 5).  
- **Contenu réel de la queue** : il vient du **LLM** via `generateMotifAndPersonnagesQuestions2B`, qui fait un `split('---QUESTION_SEPARATOR---')` puis `slice(0, 6)`. L’ordre des blocs dans la réponse du LLM **n’est pas garanti** identique à celui du prompt (motif #3, personnages #3, motif #2, …). Le LLM peut par exemple renvoyer : motif #3, motif #2, motif #1, personnages #3, personnages #2, personnages #1.  
- **Conséquence** : `questions[0]` peut être une question **personnages** alors que `meta[0]` est `slot: 'motif'`, ou l’inverse : `questions[1]` = motif, `meta[1]` = personnages. On affiche alors une question (ex. motif avec A–E) mais on **interprète** la réponse comme étant pour l’autre type (personnages), d’où appel à `normalizeCharactersLLM` avec « D » et retour « demande trop vague / préciser le personnage ».

**Cause racine directe du scénario de la capture** : désalignement entre l’**ordre des questions** dans la queue (déterminé par le LLM) et l’**ordre fixe du meta** (motif / personnages par index). Une réponse valide à une question motif est traitée comme réponse personnages → clarification inadaptée.

## 8) Est-ce que des réponses sont mal indexées ou écrasées ?

**Indexation** : Les réponses sont stockées à `questionIndex = currentQueue.cursorIndex - 1`. L’indexation est cohérente **si** le type de question à cet index (motif vs personnages) correspond au meta. Comme le meta peut être désaligné avec le contenu réel de la queue (point 7), on peut **stocker** la réponse au bon index mais **interpréter** ce type de question à tort (ex. considérer une réponse motif comme une réponse personnages).  
**Écrasement** : Pas d’écrasement explicite d’une réponse par une autre. Le risque est l’**interprétation** erronée (branche personnages prise à la place de la continuation normale « servir question suivante »).

## 9) Est-ce que le miroir et les analyses sont toujours déclenchés ?

**Oui.** En 2B, quand `cursorIndex >= questions.length` et qu’aucun miroir n’est encore en base, on appelle `generateMirror2B` et on enregistre le miroir. Les analyses (structure interprétative, angle, rendu) sont utilisées dans cette génération. Rien dans le flux 2A/2B ne désactive le miroir ou les analyses.

## 10) Est-ce qu’il existe un endroit où le moteur ignore une réponse utilisateur ?

**Oui, de façon indirecte.**  
- Quand on entre dans la branche **personnages** alors que la question servie était en réalité une **motif** (à cause du désalignement meta / queue), on appelle `normalizeCharactersLLM(work, userMessage)`. Pour une réponse comme « D », le LLM renvoie `needsClarification` avec un message du type « La demande est trop vague. Peux-tu préciser le personnage… ».  
- On retourne **ce message** et on **ne sert pas** la question suivante, et on **n’enregistre pas** la réponse comme réponse à la question motif. Du point de vue utilisateur : il a répondu « D » à une question claire (motif avec A–E), et le moteur répond par une demande de clarification personnage. **La réponse « D » est donc effectivement ignorée** (non traitée comme choix motif) et remplacée par un message inadapté.

Aucun autre endroit n’a été trouvé où une réponse valide serait volontairement ignorée ; le problème est ce **mauvais routage** vers la branche personnages.

---

# Cartographie du flux réel actuel (2B premium)

1. **Entrée 2B** : Lecture `session.normalizedWorks` → `works = titres canoniques`. Si pas de queue → `generateMotifAndPersonnagesQuestions2B(candidate, works, coreWork)` → 6 blocs texte (ordre dépend du LLM) → `setQuestionsForBlock(questions.slice(0, 6), meta)` avec **meta fixe** [motif, personnages, motif, personnages, motif, personnages].  
2. **Service d’une question** : `serveNextQuestion2B` → `question = queue.questions[cursorIndex]` → safety net `[NOM DU PERSONNAGE]` → envoi, puis `advanceQuestionCursor`.  
3. **Réception d’une réponse** : `userMessage` reçu → `questionIndex = cursorIndex - 1` → `storeAnswerForBlock(..., questionIndex, userMessage)` → `isPersonnagesAnswer = (meta && meta[questionIndex]?.slot === 'personnages')`.  
4. **Si isPersonnagesAnswer** : `normalizeCharactersLLM(work, userMessage)` → si `needsClarification` → **return** `normChars.message` (fin de traitement pour ce tour). Sinon → setNormalizedCharacters, génération des questions traits, `insertQuestionsAt`, puis plus bas on sert la suivante.  
5. **Si !isPersonnagesAnswer** : on ne fait pas la normalisation personnages ; on enchaîne avec « toutes les questions répondues ? » ou **serveNextQuestion2B**.  
6. **Point de défaillance** : à l’étape 3–4, si `meta[questionIndex].slot === 'personnages'` alors que la question réellement servie à l’écran était une **motif** (à cause de l’ordre des blocs LLM), on entre dans la branche personnages et on « ignore » la réponse motif en renvoyant une clarification.

---

# Cause racine précise

1. **Ordre des questions vs meta fixe**  
   Le meta est défini **par position** (0=motif, 1=personnages, 2=motif, …) alors que le **contenu** de `questions[]` dépend de l’**ordre des blocs** renvoyés par le LLM dans `generateMotifAndPersonnagesQuestions2B`. Si le LLM change l’ordre (ex. tous les motifs puis tous les personnages), alors à un même index on affiche un type de question et on interprète l’autre type → réponses motif traitées comme personnages → clarification « trop vague / préciser le personnage ».

2. **Template avec crochets pour les œuvres**  
   Le prompt demande explicitement des questions de la forme « dans [Suits] » (avec crochets). Le LLM reproduit cela → affichage « dans [Suits] » au lieu de « dans Suits ». C’est un choix de prompt, pas un oubli d’injection.

3. **Clarification personnages sans garde sur le type de réponse**  
   Dès que la branche personnages est prise, on envoie `userMessage` (ex. « D ») à `normalizeCharactersLLM`. Aucune vérification que la réponse ressemble à des noms (et pas à un choix A–E). Le LLM renvoie alors `needsClarification` et ce message est renvoyé tel quel à l’utilisateur.

---

# Stratégie pour revenir à un état stable et performant

**Principe** : Un seul flux clair, une seule source de vérité pour le **type** de chaque question, et pas de dépendance à l’ordre arbitraire du LLM.

1. **Garantir l’alignement question / type**  
   - Soit **ne pas faire confiance** à l’ordre du LLM : après `generateMotifAndPersonnagesQuestions2B`, **détecter** pour chaque bloc s’il contient une question motif (ex. « Qu'est-ce qui t'attire ») ou personnages (ex. « quels sont les 1 à 3 personnages ») et construire **meta** en conséquence (ou ranger les questions dans un ordre fixe motif/personnages avant de les stocker).  
   - Soit **contraindre fortement** le LLM : un seul bloc de sortie par séparateur, dans un ordre strict (ex. JSON ou format étiqueté « MOTIF: » / « PERSONNAGES: ») et parser cet ordre pour construire meta.  
   Objectif : **meta[i] reflète toujours le type réel de questions[i]**.

2. **Supprimer les crochets autour du nom d’œuvre**  
   Dans le prompt de `generateMotifAndPersonnagesQuestions2B`, utiliser par exemple « dans ${works[i]} » (sans crochets) pour que les questions générées soient « dans Suits » et non « dans [Suits] ». Si un placeholder doit rester côté moteur, le remplacer après génération (ex. remplacer `[${work}]` par `work` dans la chaîne finale).

3. **Éviter de traiter un choix A–E comme réponse personnages**  
   Avant d’appeler `normalizeCharactersLLM` pour une réponse considérée comme « personnages », ajouter une garde : si la réponse est une seule lettre A–E (éventuellement avec point), ne pas appeler le LLM de normalisation personnages ; soit servir la question suivante (et éventuellement logger une incohérence), soit conserver la réponse comme réponse libre et ne pas demander de clarification « personnage ». Cela évite le message « demande trop vague » pour une réponse motif envoyée à tort dans la branche personnages.

4. **Optionnel : un seul flux (premium only)**  
   À terme, supprimer le chemin legacy (sans normalizedWorks) pour 2B ou le réserver à une migration explicite, afin d’éviter la coexistence de deux logiques (index fixe vs meta) et les confusions.

5. **Tests de non-régression**  
   - Scénario : entrée 2B premium, réponse « D » à la **première** question (motif). Vérifier que la réponse suivante est la **deuxième question** (personnages), et non un message de clarification.  
   - Scénario : vérifier que les questions affichées ne contiennent pas de chaîne du type « [Suits] » mais « Suits ».

---

# Synthèse

- **Ce qui est cassé** : (1) désalignement entre l’ordre des questions renvoyées par le LLM et le meta fixe, ce qui fait traiter des réponses motif (ex. « D ») comme des réponses personnages et renvoyer une clarification inadaptée ; (2) affichage « [Suits] » à cause du template avec crochets dans le prompt ; (3) absence de garde pour ne pas envoyer un choix A–E à la normalisation personnages.  
- **Flux réel** : décrit ci-dessus ; le point critique est l’étape où `isPersonnagesAnswer` est évalué à partir de `meta[questionIndex]` alors que le contenu de `questions[questionIndex]` peut être une question motif.  
- **Cause racine** : meta fixe par index alors que l’ordre des questions est variable (dépend du LLM), plus template avec crochets et absence de garde sur le type de réponse.  
- **Stratégie** : aligner meta (ou ordre des questions) sur le type réel de chaque question, enlever les crochets du template (ou post-traitement), et ne pas appeler la normalisation personnages pour une réponse qui est clairement un choix A–E.

**Aucune modification de code n’a été effectuée dans ce diagnostic.**
