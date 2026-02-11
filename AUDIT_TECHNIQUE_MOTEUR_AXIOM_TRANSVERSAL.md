# Audit technique complet et transversal — Moteur AXIOM

**Date** : 2025-02-10  
**Périmètre** : Architecture du moteur, traitement des messages utilisateur, cohérence des blocs.  
**Contrainte** : Aucune modification de code ; analyse et recommandations uniquement.

---

## Objectif de l’audit

Comprendre pourquoi certains blocs (ex. 2A) ont pu ignorer une réponse utilisateur ou se comporter différemment du Bloc 1, alors que les réponses sont libres et devraient être traitées de manière homogène. Produire une analyse structurelle et des principes pour une architecture stable et prédictible.

---

## 1. Pattern général de traitement d’un message utilisateur

### 1.1 Ordre au niveau serveur (POST /axiom/stream)

Pour **toutes** les branches qui traitent un message utilisateur, l’ordre côté serveur est le même :

1. **appendUserMessage** (candidateId, userMessageText, { block, step, kind })
2. **Rechargement** du candidat depuis le store
3. **Appel** du handler (orchestrator.handleMessage **ou** executeWithAutoContinue)

Donc : le message est **toujours** enregistré dans `conversationHistory` **avant** toute logique métier (orchestrateur ou exécuteur). La source de vérité « historique » est à jour au moment de l’appel.

**Références** :
- BLOC 1 : `server.ts` ~1446–1468 (append → reload → orchestrator.handleMessage)
- BLOC 2A/2B : ~1514–1539 (append → reload → orchestrator.handleMessage)
- Blocs 3+ (chemin générique) : ~1613–1636 (append → reload → executeWithAutoContinue)

### 1.2 Ordre à l’intérieur de chaque handler

#### BLOC 1 (BlockOrchestrator.handleMessage, blockNumber === 1)

- **Entrée** : `currentBlock = 1`, `queue = blockQueues[1]`.
- **Cas 1** : `event === 'START_BLOC_1'` → génération/servir première question (pas de message utilisateur).
- **Cas 2** : `if (userMessage)` →  
  - sous-cas miroir : validation miroir → stockage → transition 2A ;  
  - sous-cas réponse question : `questionIndex = cursorIndex - 1` → **storeAnswerForBlock** → rechargement → soit miroir, soit **serveNextQuestion**.
- **Cas 3** : pas de message → serveNextQuestion.

**Conclusion** : Aucune branche ne retourne une question **sans** avoir d’abord traité le message lorsqu’il est présent. Le test `if (userMessage)` précède toute décision de « servir une question ». Pas de lecture d’un « état avant message » qui court-circuiterait le traitement.

#### BLOC 2A (BlockOrchestrator.handleBlock2A) — après correctif

- **Entrée** : rechargement candidat, `answeredCount = Object.keys(answerMaps[2]?.answers || {}).length`.
- **Cas 1** : `if (answeredCount === 0 && !userMessage)` → retour question 2A.1 statique.
- **Cas 2** : `if (userMessage)` → normalisation 2A.1 / **storeAnswerForBlock** → rechargement → 2A.2 / 2A.3 / 2B.
- **Cas 3** : pas de message → lastQuestion ou rappel handleBlock2A.

**Cause racine du bug 2A (historique)** : Avant correctif, la condition était `if (answeredCount === 0)` sans `&& !userMessage`. Donc pour la requête portant la **première** réponse (ex. "A"), `answeredCount` valait encore 0 (le stockage se fait dans le Cas 2). Le code entrait dans le Cas 1, renvoyait 2A.1 et **ne traitait jamais** le message. Le Cas 2 (stockage + 2A.2) n’était jamais exécuté pour cette requête.

**Fragilité logique** : Une branche basée uniquement sur un **compteur d’état** (answeredCount) a été évaluée **avant** la branche « message utilisateur présent ». Dès qu’un message était présent avec compteur encore à zéro, le traitement du message était court-circuité.

#### BLOC 2B (BlockOrchestrator.handleBlock2B)

- **Entrée** : vérification contexte 2A (answerMaps[2] complet), `queue = blockQueues[2]`.
- **Étape 2** : `if (!queue || queue.questions.length === 0)` → génération questions 2B → **serveNextQuestion2B** (pas de message à traiter).
- **Étape 3** : `if (userMessage)` → **storeAnswerForBlock** → rechargement → miroir ou validation miroir ou **serveNextQuestion2B**.
- **Cas 3** : pas de message → serveNextQuestion2B.

**Conclusion** : Pas de branche du type « answeredCount === 0 → retour question » avant le `if (userMessage)`. Quand un message est présent, on entre toujours dans l’étape 3 et on stocke avant de décider. Pas de fragilité du même type que 2A.

#### Blocs 3 à 10 (axiomExecutor.executeAxiom)

- **Entrée** : état dérivé de `deriveStateFromConversationHistory(candidate)`. Le candidat a **déjà** le message utilisateur dans `conversationHistory` (ajouté par le serveur).
- **Blocs 1 et 3–10** :  
  - `allQuestionsAnswered = areAllQuestionsAnswered(candidate, blocNumber)` : compte les messages **user** dans `conversationHistory` pour ce bloc → le message courant est **déjà** inclus.  
  - `shouldForceMirror` / `shouldForceSynthesis` dérivent de cet état.  
  - Question suivante : `getStaticQuestion(blocNumber, answersInBlockForQuestion.length)` avec `answersInBlockForQuestion` filtré depuis `conversationHistory` → le message courant est inclus → on obtient bien la **prochaine** question.
- **Ensuite** (l.2056–2088) : `if (userMessage)` → stockage (addAnswer + appendUserMessage).

**Conclusion** : La décision (quelle question / miroir renvoyer) est prise à partir d’un état qui **inclut déjà** le message utilisateur (car append côté serveur avant l’appel). Il n’y a pas de branche « état avant message → retour question » qui ignorerait le message. En revanche, **double enregistrement** : le serveur fait déjà `appendUserMessage`, et `executeAxiom` refait `appendUserMessage` (l.2083) → risque de doublon dans `conversationHistory` pour les blocs 3+.

### 1.3 Synthèse du pattern

| Bloc      | Où est le message avant décision ? | Branche « retour question sans traiter message » ? | Risque identifié |
|-----------|-------------------------------------|-----------------------------------------------------|-------------------|
| 1         | conversationHistory (append serveur) | Non : `if (userMessage)` puis store puis suite     | Aucun            |
| 2A        | conversationHistory (append serveur) ; answerMaps **pas** encore à jour | **Oui avant correctif** : Cas 1 (answeredCount === 0) avant Cas 2 (userMessage) | Corrigé par `&& !userMessage` |
| 2B        | conversationHistory (append serveur) | Non : userMessage → toujours Étape 3, store d’abord | Aucun            |
| 3–10      | conversationHistory (append serveur) ; état dérivé inclut le message | Non : état dérivé déjà à jour                       | Double append (store + executor) |

**Règle violée dans 2A (avant correctif)** : une branche basée sur un **compteur** (answeredCount) a été évaluée **avant** la branche « message utilisateur présent », et a provoqué un retour (2A.1) sans jamais appeler le chemin qui stocke la réponse et renvoie 2A.2.

---

## 2. Architecture des blocs — différences structurelles

### 2.1 Comparaison schématique

| Aspect              | BLOC 1        | BLOC 2A              | BLOC 2B        | BLOC 3+ (executeAxiom)   |
|---------------------|---------------|----------------------|----------------|--------------------------|
| Source de vérité    | blockQueues[1], cursorIndex | answerMaps[2].answers  | blockQueues[2], cursorIndex | conversationHistory (+ answers) |
| Décision « prochaine étape » | queue + cursor + lastAssistant (miroir) | answeredCount + userMessage | queue + cursor + lastAssistant | deriveState + areAllQuestionsAnswered |
| Stockage réponse    | storeAnswerForBlock(blockNumber, questionIndex, …) | storeAnswerForBlock(2, questionIndex, …) | storeAnswerForBlock(2, questionIndex, …) | addAnswer + appendUserMessage |
| Logique             | Linéaire (queue de questions + miroir) | Machine à états (0→1→2→3 réponses) | Linéaire (queue + miroir) | Dérivation depuis historique + catalogue statique / LLM |

### 2.2 Points de divergence

- **BLOC 1 et 2B** : même schéma « queue + cursor + miroir ». Le message utilisateur est toujours géré dans une branche explicite `if (userMessage)` qui stocke puis avance (question suivante ou miroir). Pas de compteur évalué avant cette branche.
- **BLOC 2A** : pas de queue ; un **compteur** (`answeredCount`) pilote les cas. La fragilité venait du fait que le cas « 0 réponse » était traité comme « afficher 2A.1 » sans exclure le cas « l’utilisateur envoie justement sa première réponse ». D’où la nécessité de `answeredCount === 0 && !userMessage`.
- **BLOC 3+** : pas de compteur « avant / après » message dans le même sens : l’état (dont dépend la prochaine question) est dérivé de `conversationHistory`, **déjà** mis à jour par le serveur. Le message est donc pris en compte avant la décision. Le risque restant est la **double écriture** (append côté serveur + append dans executeAxiom).

### 2.3 Risque systémique

Le risque systémique identifié est : **une branche décidée uniquement sur l’état (compteur, flag, queue vide) et exécutée avant la branche « message utilisateur présent » peut renvoyer une question (ou un miroir) sans jamais stocker ni traiter le message.**

- **2A** : seul cas avéré (et corrigé) dans le code actuel.
- **2B** : pas de telle branche ; la génération initiale (queue vide) ne s’applique que lorsqu’il n’y a pas encore de questions, donc pas de « première réponse » à ignorer.
- **1** : idem ; pas de « answeredCount === 0 → return question » avant le `if (userMessage)`.
- **3+** : état dérivé après append serveur → pas de court-circuit du même type.

---

## 3. Contrat moteur idéal (pattern standard et universel)

### 3.1 Principe unique

**Aucune décision de « quelle question ou quel miroir renvoyer » ne doit être prise à partir d’un état (compteur, cursor, queue) sans que le message utilisateur courant, s’il est présent, ait été pris en compte (idéalement : stocké) avant cette décision.**

Formulation équivalente : **toujours traiter le message utilisateur (présence + stockage) avant toute décision basée sur answeredCount / cursor / queue / état dérivé.**

### 3.2 Règles opérationnelles proposées

1. **Règle « message d’abord »**  
   Si la requête contient un `userMessage` non vide :
   - Ne **jamais** avoir une branche du type « si état == X alors retourner question Q » qui soit évaluée **avant** une branche « si userMessage alors stocker puis décider ».
   - En pratique : soit on branche d’abord sur `userMessage` et on stocke, puis on détermine la réponse ; soit l’état utilisé pour la décision inclut déjà le message (ex. conversationHistory mis à jour avant l’appel).

2. **Règle « une seule écriture message »**  
   Chaque message utilisateur ne doit être enregistré qu’**une fois** dans la source de vérité (conversationHistory et/ou answerMaps/queue). Aujourd’hui : append côté serveur + éventuellement append ou store dans le handler. Pour les blocs 3+, éviter le double append (soit le serveur append et l’exécuteur ne fait que addAnswer, soit l’exécuteur est la seule entité qui append, avec contrat clair).

3. **Règle « état cohérent après décision »**  
   Après avoir décidé de la réponse (question ou miroir), les structures (answerMaps, blockQueues, session.ui, currentBlock) doivent être mises à jour de façon cohérente avec cette décision et avec le message qui vient d’être traité.

### 3.3 Application au code actuel

- **BLOC 1, 2B** : déjà conformes (branche `userMessage` explicite, stockage avant suite).
- **BLOC 2A** : conforme après correctif (`answeredCount === 0 && !userMessage`).
- **BLOC 3+** : logique conforme (état dérivé inclut le message) ; à clarifier : qui est responsable de l’écriture dans conversationHistory (serveur seul ou exécuteur seul) pour éviter le doublon.

---

## 4. Cohérence store / session / UI

### 4.1 Sources de vérité par bloc

- **answerMaps** : utilisée pour 2A (réponses 2A.1/2A.2/2A.3) et pour 2B (contexte 2A injecté). Mis à jour par `storeAnswerForBlock` dans l’orchestrateur.
- **blockQueues** : utilisée pour BLOC 1 et BLOC 2B (questions, cursorIndex). Mis à jour par `setQuestionsForBlock`, `serveNextQuestion`, `storeAnswerForBlock` (cursor avancé ailleurs).
- **conversationHistory** : utilisée partout (orchestrateur et executeAxiom) ; mise à jour par `appendUserMessage`, `appendAssistantMessage`, `appendMirrorValidation`.
- **session.ui** (step, lastQuestion, identityDone, mirrorValidated) : mise à jour par `updateUIState` dans chaque handler.
- **session.currentBlock** : mis à jour par `updateSession` (transitions 1→2, 2→3, etc.).

Pour les blocs 1 et 2, le serveur fait **uniquement** `appendUserMessage` (conversationHistory) avant d’appeler l’orchestrateur ; le stockage « métier » (answerMaps, queue) est fait **dans** l’orchestrateur. Pour 2A, le bug venait du fait que, avec `answeredCount === 0`, on ne rentrait jamais dans la branche qui appelle `storeAnswerForBlock`, donc answerMaps restait vide et l’UI semblait « ignorer » la réponse.

### 4.2 Risque « retour question sans analyser le message »

- **BLOC 1** : non ; toute réponse utilisateur passe par le `if (userMessage)` qui stocke puis sert la suite.
- **BLOC 2A** : non après correctif ; avec `&& !userMessage` on ne renvoie plus 2A.1 quand un message est présent.
- **BLOC 2B** : non ; le seul retour « question » sans message est la génération initiale (queue vide), qui ne correspond pas à une réponse utilisateur.
- **BLOC 3+** : non ; la décision est basée sur un historique déjà mis à jour avec le message.

### 4.3 Incohérence potentielle : double append (blocs 3+)

Pour le chemin générique (blocs 3+) :
- Le serveur appelle `appendUserMessage` (l.1616) puis `executeWithAutoContinue`.
- Dans `executeAxiom`, si `userMessage` est présent, on appelle à nouveau `appendUserMessage` (l.2083) en plus de `addAnswer`.

Résultat : le même message peut apparaître **deux fois** dans `conversationHistory`. Cela ne change pas la logique de décision (areAllQuestionsAnswered compte des messages, un doublon peut fausser les comptes ou les dérivations à la marge). Recommandation : définir un responsable unique pour l’écriture dans conversationHistory (soit le serveur, soit l’exécuteur) et supprimer l’autre écriture pour les blocs 3+.

---

## 5. Propositions concrètes

### 5.1 Diagnostic cause racine (problème 2A)

- **Cause racine** : Dans `handleBlock2A`, le **Cas 1** (`answeredCount === 0`) était évalué **avant** le **Cas 2** (`userMessage`). Pour la requête contenant la première réponse à 2A.1, `answeredCount` valait encore 0 (le stockage se fait dans le Cas 2). Le code renvoyait donc 2A.1 et ne traitait jamais le message → la réponse n’était jamais stockée ni suivie de 2A.2.
- **Correctif appliqué** : Remplacer `if (answeredCount === 0)` par `if (answeredCount === 0 && !userMessage)` pour que l’affichage de 2A.1 ne s’applique que lorsqu’il n’y a **pas** de message à traiter.

### 5.2 Risques similaires potentiels ailleurs

- **BLOC 2B** : Aucun. La branche « queue vide → générer questions et servir première » ne s’exécute pas lorsqu’un message utilisateur est présent ; la branche `if (userMessage)` fait toujours le store puis la suite.
- **BLOC 1** : Aucun. Même logique : pas de retour question sans passer par le traitement du message quand il est présent.
- **executeAxiom (3+)** : Pas de risque du type « état avant message » ; risque limité au double append dans conversationHistory (à traiter pour cohérence et évolution future).

### 5.3 Architecture robuste et uniforme recommandée

1. **Entrée unique** : Le serveur continue à faire **appendUserMessage** puis rechargement, puis appel du handler. Aucun handler ne doit **réécrire** le même message dans conversationHistory sauf si c’est le seul responsable (voir point 3).
2. **Dans chaque handler** :  
   - Soit on branche **en premier** sur `userMessage` : si présent → stockage (answerMaps / queue / addAnswer) puis décision (prochaine question / miroir).  
   - Soit la décision est basée sur un état **déjà mis à jour** avec le message (ex. conversationHistory mis à jour par le serveur avant l’appel).  
   - Aucune branche du type « si compteur/état == X alors retour question » ne doit être évaluée **avant** la prise en compte du message lorsqu’il est présent.
3. **Écriture conversationHistory** : Pour tous les blocs, clarifier qui écrit : soit le serveur uniquement (et les handlers ne font que storeAnswerForBlock / addAnswer), soit un seul endroit dans le handler. Supprimer le double append pour les blocs 3+.
4. **Tests / revues** : Pour tout nouveau bloc ou refactor, vérifier explicitement : « Si une requête contient un userMessage, existe-t-il un chemin où l’on retourne une question (ou un miroir) sans avoir d’abord stocké ou pris en compte ce message ? » Si oui, corriger l’ordre des branches ou la définition de l’état.

### 5.4 Principes pour sécuriser tous les blocs

- **Principe 1** : Message utilisateur présent ⇒ jamais de retour (question ou miroir) sans que le message ait été pris en compte (idéalement stocké) avant la décision.
- **Principe 2** : Aucune branche basée uniquement sur un compteur ou un état (answeredCount, cursor, queue vide) ne doit court-circuiter la branche « message présent → traiter ».
- **Principe 3** : Une seule écriture du message utilisateur dans la (les) source(s) de vérité (conversationHistory, answerMaps, etc.).
- **Principe 4** : Après toute décision de réponse, mettre à jour de façon cohérente : answerMaps / blockQueues, session.ui, session.currentBlock, et conversationHistory si ce handler en est responsable.

---

## 6. Résumé

| Élément | Résultat |
|--------|----------|
| **Cause racine 2A** | Cas 1 (`answeredCount === 0`) exécuté avant Cas 2 (`userMessage`) → retour 2A.1 sans jamais stocker la réponse ni renvoyer 2A.2. Corrigé par `answeredCount === 0 && !userMessage`. |
| **Risques similaires** | Aucun autre bloc ne présente la même fragilité (branche état avant branche message). 2B et 1 sont sains ; 3+ s’appuient sur un état déjà mis à jour. |
| **Double append** | Blocs 3+ : append côté serveur + append dans executeAxiom → doublon potentiel dans conversationHistory ; à supprimer d’un des deux côtés. |
| **Contrat idéal** | Toujours traiter (présence + stockage) le message utilisateur avant toute décision basée sur answeredCount / cursor / queue / état. |
| **Principes** | (1) Pas de retour question/miroir sans prise en compte du message ; (2) pas de branche état qui court-circuite la branche message ; (3) une seule écriture du message ; (4) mise à jour cohérente du store/session/UI après décision. |

**Aucune modification de code n’a été effectuée dans le cadre de cet audit.** Ce document sert de référence pour les évolutions et les refactors du moteur AXIOM.
