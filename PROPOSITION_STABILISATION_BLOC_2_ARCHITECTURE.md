# STABILISATION DÉFINITIVE BLOC 2A / 2B — ARCHITECTURE CIBLE

**Objectif :** Rendre le bloc 2 déterministe, transactionnel, idempotent, stable multi-device et multi-instance, sans impact sur les blocs 3 → 10.

---

## 1. ARCHITECTURE CIBLE PROPOSÉE

### 1.1 Principes

| Principe | Implémentation |
|----------|----------------|
| **Une seule source de vérité** | Le store (Map + Redis). Toute décision de routage ou condition miroir s’appuie sur un état **rechargé** après toute mutation susceptible de le modifier. |
| **Série par session** | Un **mutex par `sessionId`** (ou `candidateId`) pour le bloc 2 : une seule requête traite le bloc 2 à la fois pour une session donnée. Les requêtes concurrentes attendent leur tour puis lisent l’état à jour. |
| **Pas de lecture stale** | Rechargement obligatoire du candidat **avant** le routage 2A/2B et **après** toute opération qui modifie la queue (insertQuestionsAt) ou les réponses (append). |
| **Persistance bloquante** | Toute mutation bloc 2 (blockStates, block2Answers, blockQueues[2]) est suivie de `await persistAndFlush(candidateId)` avant de considérer l’état “stable” pour les comparaisons ou pour une autre requête. |
| **Idempotence 2B** | Avant d’enregistrer une réponse 2B, vérifier `block2B.answers.length < currentQuestionIndex`. Si déjà ≥ currentQuestionIndex, considérer la requête comme doublon : retourner la prochaine question **sans** append ni incrément. |

### 1.2 Schéma de flux (haut niveau)

```
[Requête POST /axiom/stream, body avec sessionId + message]
         │
         ▼
   sessionId valide ?
         │ oui
         ▼
   ┌─────────────────────────────────────────────────────────┐
   │  currentBlock === 2 && step === BLOC_02 ?               │
   └─────────────────────────────────────────────────────────┘
         │ non → flux existant (identité, bloc 1, 3…10)
         │ oui
         ▼
   ┌─────────────────────────────────────────────────────────┐
   │  ACQUIRE block2Mutex(sessionId)                          │  ← Nouveau
   │  await lock;                                            │
   └─────────────────────────────────────────────────────────┘
         ▼
   ┌─────────────────────────────────────────────────────────┐
   │  RELOAD candidate = getAsync(sessionId)                 │  ← Nouveau (obligatoire)
   └─────────────────────────────────────────────────────────┘
         ▼
   appendUserMessage si message présent
         ▼
   candidate = get(candidateId)  // déjà en place
         ▼
   handleMessage(candidate, userMessage, ...)
         │
         ├─ [Routage] utilise candidate rechargé → blockStates à jour
         ├─ [2B réponse] idempotency: si answers.length >= currentQuestionIndex → return next question sans muter
         ├─ [2B après insert] persistAndFlush puis RELOAD → queueLength à jour pour condition miroir
         └─ [Miroir] condition: currentQuestionIndex >= queueLength (queue lue après reload)
         ▼
   RELEASE block2Mutex(sessionId)
         ▼
   Réponse SSE (done)
```

### 1.3 Garanties visées

- **Même enchaînement mobile/desktop** : une seule requête à la fois par session en bloc 2 + état toujours rechargé avant décision.
- **Jamais router en 2A si 2B IN_PROGRESS** : le candidat passé à `handleMessage` est celui rechargé sous mutex après un éventuel append ; il reflète la dernière persistance.
- **Miroir jamais avant toutes les questions** : la longueur utilisée pour la condition est celle de la queue **après** insertQuestionsAt + persistAndFlush + reload.
- **Pas de double incrément** : mutex + idempotency (si déjà traité, on ne ré-append pas et on ne ré-incrémente pas).
- **Pas de queue stale** : après chaque insertQuestionsAt, flush puis reload ; toute comparaison utilise la queue du candidat rechargé.
- **Indépendance au timing Redis** : toutes les mutations bloc 2 sont await persistAndFlush ; le mutex évite qu’une autre requête lise avant la fin d’écriture.

---

## 2. STRATÉGIE ANTI-RACE

### 2.1 Mutex par session (bloc 2 uniquement)

- **Où** : Côté serveur, dans la route POST `/axiom/stream`, uniquement lorsque `currentBlock === 2` et `step === BLOC_02`.
- **Implémentation proposée** : File d’attente par `sessionId` (pas de lock distribué Redis pour rester simple ; suffisant pour une instance et pour éviter double traitement sur mobile).
  - Structure : `Map<string, Promise<void>>` : pour chaque `sessionId`, on enchaîne les “tours” : chaque entrant attend que le `Promise` précédent soit résolu, puis exécute son tour et résout le sien à la fin.
  - API : `acquireBlock2Lock(sessionId): Promise<() => void>` → retourne une fonction `release` à appeler en `finally` après traitement (y compris en cas d’erreur).
- **Effet** : Deux requêtes avec le même `sessionId` en bloc 2 ne s’exécutent pas en parallèle ; la seconde voit l’état après persistance de la première.

### 2.2 Idempotence 2B (après mutex)

- **Où** : Dans `handleBlock2B`, au tout début du bloc “ÉTAPE 3 — RÉPONSE UTILISATEUR REÇUE”, **avant** `appendBlock2BAnswer`.
- **Règle** :  
  - Lire `currentQuestionIndex` et `block2B.answers.length` depuis le candidat (déjà rechargé côté serveur + éventuellement après append dans handleMessage).  
  - Si `block2B.answers.length >= currentQuestionIndex` → cette “position” a déjà une réponse (requête doublon).  
  - **Action** : Ne pas appeler `appendBlock2BAnswer` ni incrémenter. Retourner le contenu de la **prochaine** question (celle à l’index `currentQuestionIndex`) sans modifier l’état → besoin d’une petite helper du type `getNextQuestion2BContentOnly(candidateId, blockNumber)` qui retourne `{ response: questionText, step, expectsAnswer }` sans écrire dans le store.
- **Effet** : Une deuxième requête identique (même message, même session) renvoie la même “prochaine question” sans dupliquer la réponse ni avancer deux fois le curseur.

---

## 3. STRATÉGIE ANTI-STALE

### 3.1 Routage 2A / 2B

- **Problème** : Le routage utilisait un candidat chargé au début du handler (ou après append) qui pouvait être antérieur à la persistance d’une autre requête (ex. transition 2A→2B).
- **Solution** :
  1. **Reload obligatoire avant handleMessage pour le bloc 2**  
     Dans la route stream, une fois le mutex acquis, **toujours** recharger le candidat avec `candidate = await candidateStore.getAsync(sessionId)` (ou au minimum `get` si on est sûr qu’une seule instance écrit). Puis faire l’append user message si besoin, puis **re**-recharger `candidate` (déjà en place), et passer ce `candidate` à `handleMessage`.
  2. **Pas de re-routage dans l’orchestrateur** : L’orchestrateur reçoit déjà un candidat “frais”. Il peut en début de branche bloc 2 refaire un `get(candidateId)` pour s’assurer d’utiliser la dernière version en mémoire (optionnel si le serveur a déjà fait getAsync juste avant).
- **Garantie** : Avec mutex + reload avant handleMessage, on ne routera jamais en 2A avec un état où 2B est déjà IN_PROGRESS.

### 3.2 Queue après insertQuestionsAt

- **Problème** : Après `insertQuestionsAt`, la variable `finalQueue` en mémoire (dérivée de `currentCandidate`) gardait l’ancienne longueur ; la condition miroir utilisait cette longueur → déclenchement prématuré.
- **Solution** :
  1. **Immédiatement après** `candidateStore.insertQuestionsAt(...)` (orchestrateur), appeler `await candidateStore.persistAndFlush(candidateId)`.
  2. **Recharger** le candidat : `currentCandidate = candidateStore.get(candidateId) ?? await candidateStore.getAsync(candidateId)`.
  3. **Reprendre** la queue depuis ce candidat : `finalQueue = currentCandidate.blockQueues?.[blockNumber]` (avec garde null).
  4. Utiliser **uniquement** `finalQueue.questions.length` (et éventuellement `currentQuestionIndex` depuis `currentCandidate.session.blockStates?.['2B']`) pour la condition miroir.
- **Garantie** : La longueur utilisée pour “toutes les questions répondues” est toujours celle de la queue réelle (y compris les questions insérées).

### 3.3 Condition miroir déterministe

- **Formulation cible** :  
  Le miroir 2B ne doit être déclenché **que si** :
  - `blockStates['2B'].status === 'IN_PROGRESS'`
  - `block2B.answers.length === currentQuestionIndex` (on vient d’ajouter la réponse pour la question `currentQuestionIndex - 1`)
  - `currentQuestionIndex >= queue.questions.length` (il n’y a plus de question à servir)
  - La queue utilisée est celle **après** tout insert et reload (donc “aucune insertion pending” = on a flush + reload).

- **En pratique** : Après le bloc personnages éventuel (normalisation + insertQuestionsAt), faire flush + reload, puis :
  - `queueLength = currentCandidate.blockQueues?.[blockNumber]?.questions.length ?? 0`
  - `nextQuestionIndex = currentCandidate.session.blockStates?.['2B']?.currentQuestionIndex ?? (currentQuestionIndex + 1)` (en cohérence avec le code actuel qui utilise soit la valeur rechargée soit currentQuestionIndex + 1)
  - Condition : `nextQuestionIndex >= queueLength`.  
  Optionnel : en plus, vérifier `block2B.answers.length === nextQuestionIndex` pour cohérence (après append, answers.length devrait être égal à nextQuestionIndex).

---

## 4. PERSISTANCE ET MULTI-INSTANCE

### 4.1 Règle pour le bloc 2

- **Toute** modification qui touche à `blockStates`, `block2Answers`, ou `blockQueues[2]` doit être suivie de **`await candidateStore.persistAndFlush(candidateId)`** avant que :
  - une autre requête (même instance, après release du mutex) lise l’état, ou
  - une comparaison (ex. condition miroir) soit faite avec cet état.
- Méthodes concernées côté store déjà avec `persistAndFlush` : `setBlock2AMedium`, `setBlock2APreference`, `setBlock2ACoreWork`, `setBlock2ACompletedAndStart2B`, `appendBlock2BAnswer`, `setBlock2BCurrentQuestionIndex`, `setBlock2BCompleted`, etc.
- **À corriger** :
  - **insertQuestionsAt** : aujourd’hui appelle seulement `persistCandidate` (non awaité). **Option A** : faire de `insertQuestionsAt` une méthode async qui appelle `await this.persistAndFlush(candidateId)` avant de retourner. **Option B** (recommandé pour impact minimal) : ne pas changer la signature de `insertQuestionsAt` ; dans l’orchestrateur, **après** chaque appel à `insertQuestionsAt`, appeler `await candidateStore.persistAndFlush(candidateId)` puis recharger le candidat.
  - **setQuestionsForBlock** (bloc 2) : idem, aujourd’hui `persistCandidate` seul. Après `setQuestionsForBlock(candidateId, 2, ...)` dans l’orchestrateur, appeler `await candidateStore.persistAndFlush(candidateId)`.

### 4.2 Pas de “transaction” globale

- On ne propose pas une transaction Redis multi/exec pour tout le bloc 2 : la sérialisation par mutex + flush après chaque mutation suffit pour une instance et améliore fortement la stabilité. Pour un vrai multi-instance (plusieurs serveurs), un lock distribué Redis (ex. Redlock) pourrait être ajouté plus tard sur le même `sessionId` ; l’architecture (reload après lock, idempotency, flush après insert) reste valable.

### 4.3 Résumé “aucune dépendance au timing Redis”

- Les écritures bloc 2 sont **toutes** suivies de `await persistAndFlush` avant de considérer l’état “visible”.
- Le mutex garantit qu’aucune autre requête bloc 2 pour cette session ne lit tant que la requête en cours n’a pas fini (y compris les flush).
- Donc une requête qui reprend après le mutex ne lit jamais un état “à moitié écrit”.

---

## 5. POINTS À TRAITER — RÉCAP

### 5.1 Routage 2A / 2B

- **Reload obligatoire** : Oui — dans la route stream, après acquisition du mutex bloc 2, **recharger le candidat avec `getAsync(sessionId)`** avant d’appeler handleMessage (et avant append user message si on veut que le routage voie l’état “avant” ce message ; en pratique on peut reload → append → get → handleMessage, le reload initial suffit pour éviter le retour en 2A si une autre requête vient de passer en 2B).
- **Lock distribué** : Optionnel pour V1 ; mutex in-memory par session suffit pour une instance et évite déjà les races observées (double tap mobile, requêtes rapprochées).
- **Transaction logique** : Pas de transaction Redis ; “transaction logique” = une seule requête à la fois par session (mutex) + flush après chaque mutation.
- **Versioning d’état** : Non nécessaire si mutex + reload sont en place.

### 5.2 Insertions dynamiques (insertQuestionsAt)

- **Rechargement candidat après insert** : Oui — après `insertQuestionsAt`, appeler `await persistAndFlush(candidateId)`, puis recharger le candidat et reprendre `finalQueue` depuis ce candidat.
- **Lecture queue uniquement depuis store** : En pratique oui pour la condition miroir — après tout insert, on ne réutilise plus l’ancienne référence ; on lit toujours `currentCandidate.blockQueues[blockNumber]` après reload.
- **Snapshot recalculé** : Équivalent — le “snapshot” est le candidat rechargé après flush.

### 5.3 Double requêtes / Idempotence

- **Idempotency key client** : Non requis si on a mutex + garde “answers.length >= currentQuestionIndex”.
- **Lock optimiste sur currentQuestionIndex** : Oui — le mutex est le “lock” ; la garde idempotence évite de ré-écrire si la position est déjà remplie.
- **Vérification “cette réponse correspond déjà à l’index traité”** : Oui — `block2B.answers.length >= currentQuestionIndex` signifie qu’on a déjà une réponse pour la question courante (ou au-delà) → on ne ré-append pas, on retourne la prochaine question sans muter (via une helper qui ne fait pas d’incrément).
- **Mutex par sessionId** : Oui — au niveau serveur, avant toute logique bloc 2.

### 5.4 Persistance

- **Toutes les mutations bloc 2 awaitées** : Oui — soit la méthode du store fait `await this.persistAndFlush`, soit l’appelant (orchestrateur) appelle `await candidateStore.persistAndFlush(candidateId)` juste après (insertQuestionsAt, setQuestionsForBlock pour bloc 2).
- **Mode transactionnel** : Non (pas de multi/exec Redis).
- **Centraliser mutations dans un handler atomique** : En pratique oui pour une requête — le handler bloc 2 s’exécute sous un seul mutex et enchaîne les mutations + flush ; pas de “half-update” visible par une autre requête.

### 5.5 Déclenchement du miroir

- Condition **béton** :
  - `blockStates['2B'].status === 'IN_PROGRESS'` (déjà garanti par le routage).
  - Queue lue **après** reload (post-insert si besoin) : `queueLength = currentCandidate.blockQueues?.[blockNumber]?.questions.length ?? 0`.
  - `nextQuestionIndex` = `currentCandidate.session.blockStates?.['2B']?.currentQuestionIndex` (après append, valeur “prochaine question à servir”).
  - Condition : `nextQuestionIndex >= queueLength`.
  - Optionnel : `block2B.answers.length === nextQuestionIndex` (invariant après append).

---

## 6. LISTE PRÉCISE DES FICHIERS À MODIFIER

| Fichier | Modifications |
|---------|----------------|
| **src/server.ts** | 1) Introduire un module ou Map pour le mutex bloc 2 (`acquireBlock2Lock(sessionId)` / release). 2) Dans la branche “BLOC 2” (step === BLOC_02 && currentBlock === 2) : avant append / handleMessage, acquérir le lock, **recharger** le candidat avec `getAsync(sessionId)`, puis exécuter le flux actuel (append si message, handleMessage), et en `finally` release le lock. |
| **src/services/blockOrchestrator.ts** | 1) **Idempotence 2B** : au début du bloc “userMessage présent” (avant appendBlock2BAnswer), lire `block2B.answers.length` et `currentQuestionIndex` ; si `answers.length >= currentQuestionIndex`, appeler une nouvelle méthode `getNextQuestion2BContentOnly(candidateId, blockNumber)` et retourner son résultat (sans append ni setBlock2BCurrentQuestionIndex). 2) **Après insertQuestionsAt** : appeler `await candidateStore.persistAndFlush(candidateId)`, puis recharger `currentCandidate` (get/getAsync), reprendre `finalQueue` depuis ce candidat. 3) **Condition miroir** : utiliser uniquement la `finalQueue` ainsi mise à jour (longueur après reload). 4) Implémenter `getNextQuestion2BContentOnly` : lit la queue et currentQuestionIndex, retourne `{ response: questionText, step: BLOC_02, expectsAnswer: true, autoContinue: false }` sans aucune mutation. |
| **src/store/sessionStore.ts** | Optionnel : après `setQuestionsForBlock` et `insertQuestionsAt`, appeler `persistAndFlush` en interne (en async) pour que tout appelant bénéficie de la persistance. Si on préfère garder le store “bas niveau”, on laisse l’orchestrateur appeler `persistAndFlush` après ces deux méthodes pour le bloc 2 (voir ci-dessus). Pour **setQuestionsForBlock** utilisé pour le bloc 2, l’orchestrateur appellera `await persistAndFlush` après coup. |

Aucun changement dans les blocs 3 → 10 (pas de modification de `axiomExecutor` pour les blocs suivants, pas de changement de contrat API).

---

## 7. NIVEAU D’IMPACT

- **Bloc 2 uniquement** : Oui. Les changements sont :
  - **Serveur** : une nouvelle branche “si bloc 2 alors mutex + reload” et le module mutex ; le reste du flux (identité, bloc 1, 3…10) est inchangé.
  - **Orchestrateur** : uniquement dans `handleMessage` (routage bloc 2) et `handleBlock2B` (idempotence, post-insert flush+reload, condition miroir). Aucune modification de handleBlock2A sauf si on veut un reload optionnel en entrée (non nécessaire si le serveur a déjà rechargé).
  - **Store** : soit ajout de `await persistAndFlush` dans `insertQuestionsAt` / `setQuestionsForBlock` pour le bloc 2, soit appels explicites depuis l’orchestrateur (recommandé pour limiter les changements dans le store).
- **Blocs 3 → 10** : **Aucun impact**. Aucun appel au mutex bloc 2, aucun changement de signature ou de comportement des fonctions utilisées par les blocs suivants.

---

## 8. GARANTIE BLOCS 3 → 10 NON IMPACTÉS

- Le mutex et le reload ne s’appliquent **que** lorsque `candidate.session.ui?.step === BLOC_02 && candidate.session.currentBlock === 2` (condition déjà utilisée pour déléguer à l’orchestrateur bloc 2). Les autres branches (event START_BLOC_1, bloc 1, blocs 3 à 10) ne passent pas par ce mutex.
- Les méthodes du store utilisées par les blocs 3+ (`appendUserMessage`, `updateSession`, etc.) ne sont pas modifiées dans leur sémantique.
- Aucune modification de `executeAxiom` ni des chemins “executeWithAutoContinue” pour les blocs 3–10.
- Les types (AxiomCandidate, blockStates, block2Answers) restent les mêmes ; seules les **règles d’utilisation** (reload après insert, idempotency, mutex) changent pour le bloc 2.

---

## 9. SCHÉMA D’EXÉCUTION SÉQUENTIEL (DÉTAILLÉ)

```
Requête R1 (sessionId=S, message="A")  |  Requête R2 (sessionId=S, message="A" doublon)
----------------------------------------|----------------------------------------------
R1: POST /axiom/stream                  |  R2: POST /axiom/stream
R1: load candidate (getAsync)           |  R2: load candidate
R1: step=BLOC_02, block=2 → mutex       |  R2: step=BLOC_02, block=2 → attend mutex
R1: acquireBlock2Lock(S) → ok           |
R1: reload candidate = getAsync(S)      |
R1: appendUserMessage(S, "A")           |
R1: candidate = get(S)                  |
R1: handleMessage(candidate, "A")       |
   → blockStates['2B'] IN_PROGRESS      |
   → handleBlock2B                      |
   → answers.length 0, currentIndex 1    |
   → 0 >= 1 ? non → append, reload      |
   → insert? non (motif)                |
   → nextQuestionIndex 1, queueLen 6    |
   → 1 >= 6 ? non → serveNextQuestion2B |
   → setBlock2BCurrentQuestionIndex(2)   |
   → persistAndFlush                     |
R1: release(S)                          |  R2: acquireBlock2Lock(S) → ok
R1: writeEvent("done", response=Q1)     |  R2: reload candidate = getAsync(S)
                                        |  R2: appendUserMessage(S, "A") [no-op ou idem]
                                        |  R2: candidate = get(S)
                                        |  R2: handleMessage(candidate, "A")
                                        |     → handleBlock2B
                                        |     → answers.length 1, currentIndex 1
                                        |     → 1 >= 1 ? oui → idempotent
                                        |     → getNextQuestion2BContentOnly → Q1 (index 1)
                                        |     → return { response: Q1 } sans muter
                                        |  R2: release(S)
                                        |  R2: writeEvent("done", response=Q1)
```

Résultat : même réponse “prochaine question” pour R1 et R2, un seul append et un seul incrément.

---

## 10. RÉSUMÉ OBJECTIF FINAL

| Critère | Moyen |
|---------|--------|
| **Déterministe** | Mutex + reload avant routage et après insert ; condition miroir sur queue rechargée. |
| **Transactionnel** | Une requête à la fois par session (mutex) ; flush après chaque mutation. |
| **Idempotent** | Garde `answers.length >= currentQuestionIndex` + retour de la prochaine question sans muter. |
| **Multi-device stable** | Même code, même état ; pas de dépendance au timing côté client au-delà du respect du “un envoi après réception de done”. |
| **Multi-instance stable** | Sur une instance : oui. Multi-instance pur (plusieurs serveurs) : mutex in-memory ne suffit pas ; ajout possible d’un lock Redis sur sessionId (même schéma reload + idempotency). |
| **Production-ready** | Oui pour une instance ; déploiement multi-instance à accompagner d’un lock distribué si besoin. |

---

**Document de proposition uniquement.** Implémentation à réaliser selon cette architecture dans les fichiers listés section 6.

---

## 11. CHECKLIST VALIDATION MANUELLE (post-implémentation)

À exécuter après merge pour valider la stabilisation bloc 2.

### Scénario 1 — Mobile double tap / latence

| Étape | Action | Résultat attendu |
|-------|--------|------------------|
| 1 | Nouvelle session, aller jusqu’à la première question 2B (motif A–E). | Une seule question motif affichée. |
| 2 | Répondre « A » en double-tap rapide (ou simuler 2 requêtes rapprochées). | Une seule réponse enregistrée, une seule question suivante (personnages) affichée. Aucune duplication de réponse, aucun saut de question. |
| 3 | Vérifier en log (si possible) : `block2B.answers.length` et `currentQuestionIndex` après les deux requêtes. | answers.length = 1, currentQuestionIndex = 2. Pas de double incrément. |

### Scénario 2 — Parcours 3 œuvres : questions traits + récap servies

| Étape | Action | Résultat attendu |
|-------|--------|------------------|
| 1 | Compléter 2A (médium, préférences, œuvre noyau) puis 2B jusqu’à la 3e question personnages (œuvre #1). | Question personnages pour la 3e œuvre affichée. |
| 2 | Saisir 1 à 3 noms de personnages et envoyer. | Les questions **traits** (par personnage) puis la question **récap** (« Sur [œuvre], dis-moi en une phrase… ») sont **servies** une par une. |
| 3 | Ne pas déclencher le miroir avant d’avoir répondu à toutes ces questions insérées. | Aucun passage direct au miroir après la réponse personnages. Le miroir n’apparaît qu’après la dernière question (récap) de la dernière œuvre. |

### Scénario 3 — 2A→2B : « A » au motif ne doit jamais être interprété comme 3e réponse 2A

| Étape | Action | Résultat attendu |
|-------|--------|------------------|
| 1 | Nouvelle session, compléter 2A (3 réponses), recevoir la transition + première question 2B (motif). | Message type « FIN DU BLOC 2A » + question motif affiché. |
| 2 | Répondre **uniquement** « A » (choix motif) et envoyer. | La **question personnages** (œuvre #3) s’affiche. Le message « FIN DU BLOC 2A » ne réapparaît **pas**. |
| 3 | Vérifier que le backend n’a pas routé en handleBlock2A pour ce message. | En log : pas de traitement 2A (œuvre noyau) pour le message « A » ; bloc 2B IN_PROGRESS conservé. |

---

## 12. CHOIX PERSISTANCE (2.4) — OPTION B

**Option retenue : B — l’orchestrateur appelle `persistAndFlush` après `insertQuestionsAt` et après `setQuestionsForBlock` (bloc 2), sans modifier les signatures du store.**

- **Impact :** Aucun changement dans `sessionStore.ts` ; responsabilité du « bon moment » pour flush reste dans l’orchestrateur, qui connaît le flux bloc 2.
- **Risque :** Un futur appelant à `setQuestionsForBlock` ou `insertQuestionsAt` pour le bloc 2 doit penser à appeler `persistAndFlush` ; documenté dans ce doc et dans les commentaires du code.

---

## 13. CONFIRMATIONS AVANT MERGE (Q1–Q4)

**Q1. Est-ce que ce patch garantit que « FIN DU BLOC 2A » ne peut plus apparaître après une réponse « A » au motif (2B), même si double tap mobile ?**  
**Oui.** Le mutex assure qu’une seule requête bloc 2 est traitée à la fois. La requête qui traite « A » charge toujours le candidat **après** reload sous mutex : si la transition 2A→2B a déjà été persistée (par la requête précédente qui a renvoyé transition + question motif), le candidat a `blockStates['2B'].status === 'IN_PROGRESS'` et le routage va en handleBlock2B. « A » est alors traité comme réponse motif, pas comme œuvre noyau. En cas de double tap, la seconde requête attend le mutex puis voit l’état à jour (2B IN_PROGRESS, currentQuestionIndex déjà incrémenté) ; l’idempotence évite un second append/incrément et renvoie la même prochaine question.

**Q2. Est-ce que ce patch garantit que les questions traits + récap ne peuvent plus être sautées (plus de queue stale) ?**  
**Oui.** Après chaque `insertQuestionsAt`, on appelle `await persistAndFlush(candidateId)`, on recharge le candidat et on reprend `finalQueue` depuis ce candidat. La condition miroir utilise `queueLength = finalQueue.questions.length` (queue à jour). Donc `nextQuestionIndex >= queueLength` n’est vrai qu’une fois toutes les questions (y compris insérées) effectivement servies et répondues.

**Q3. Est-ce que ce patch garantit zéro double incrément de currentQuestionIndex sur une même session, même avec 2 requêtes quasi simultanées ?**  
**Oui.** Le mutex sérialise les requêtes bloc 2 pour une même session : la seconde requête ne lit et n’écrit qu’après que la première ait terminé (et persistAndFlush). En outre, l’idempotence 2B (si `answers.length >= currentQuestionIndex`, on ne fait ni append ni incrément, on renvoie la prochaine question en lecture seule) protège contre tout doublon résiduel.

**Q4. Est-ce que ce patch n’impacte vraiment rien sur blocs 3→10 (routage, boutons, miroirs, synthèse) ?**  
**Oui.** Le mutex et le reload ne s’appliquent que lorsque `candidate.session.ui?.step === BLOC_02 && candidate.session.currentBlock === 2`. Les branches identité, bloc 1, START_BLOC_1, blocs 3 à 10 ne passent pas par ce bloc. Aucune modification des handlers, prompts ou UX des blocs 3→10.
