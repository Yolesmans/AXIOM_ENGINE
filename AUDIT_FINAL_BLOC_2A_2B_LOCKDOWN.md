# AUDIT FINAL — BLOC 2A/2B LOCKDOWN (Verrouillage prod)

**Objectif :** Diagnostiquer à 100 % l’origine du symptôme « après réponse 2B (ex. "A"), le front ré-affiche "FIN DU BLOC 2A — PROJECTIONS NARRATIVES" au lieu de la question suivante 2B ».  
**Contraintes :** Aucune modification de code. Toutes les affirmations sont prouvées par références (fichier + lignes) et déroulé de flux.

---

## 1. Contexte

| Élément | Valeur |
|--------|--------|
| Front prod | Vercel — `axiom-engine-shsk.vercel.app` |
| Back prod | Railway — `axiomengine-production.up.railway.app` |
| Symptôme | Transition + Q motif 2B s’affichent ; user répond "A" → le flux ne continue pas correctement et le front ré-affiche « FIN DU BLOC 2A — PROJECTIONS NARRATIVES » au lieu de la question personnages 2B. |

---

## 2. Repro steps exacts

1. Aller sur `https://axiom-engine-shsk.vercel.app/?tenant=elgaenergy&poste=commercial_b2b`.
2. Compléter identité, ton, préambule, puis cliquer « Je commence mon profil ».
3. Répondre aux 3 questions BLOC 2A (médium, préférences, œuvre noyau) jusqu’à voir la transition + 1ère question 2B (motif A–E).
4. Répondre **« A »** (ou B/C/D/E) et envoyer.
5. **Comportement observé (bug) :** ré-affichage du message « FIN DU BLOC 2A — PROJECTIONS NARRATIVES » (et éventuellement de la même question motif) au lieu de la question personnages suivante.

---

## 3. Diagramme de flux (front → back → affichage)

```
[Front]
  User envoie "A"
    → callAxiom("A") [app.js L820 : await callAxiom(message)]
    → POST /axiom/stream
        body: { tenantId, posteId, sessionId, message: "A" }
        headers: x-session-id: sessionId
    → readSSEStream(response, onToken, onDone, onError)

[Back — server.ts route POST /axiom/stream]
  L1309–1314 : candidate = get(sessionId) || getAsync(sessionId) || create(...)
  L1523     : if (candidate.session.ui?.step === BLOC_02 && candidate.session.currentBlock === 2)
  L1524–1543: appendUserMessage(candidateId, userMessageText, …)
  L1545–1549: candidate = get(candidateIdAfterExecution) || getAsync(...)
  L1548     : result = await orchestrator.handleMessage(candidate, userMessageText, null, onChunk, onUx)

[Orchestrator — blockOrchestrator.ts]
  L191–204  : handleMessage
    currentBlock === 2 && (currentStep === BLOC_02 || '')
    answerMap = candidate.answerMaps?.[2], answers = answerMap?.answers || {}
    answeredCount = Object.keys(answers).length
    → si answeredCount >= 3 : handleBlock2B(candidate, userMessage, …)
    → sinon              : handleBlock2A(candidate, userMessage, …)

[Si handleBlock2B avec userMessage = "A"]
  L1067–1089: queue présent, userMessage présent
    questionIndex = currentQueue.cursorIndex - 1  // ex. 0
    storeAnswerForBlock(candidateId, 2, questionIndex, "A")
    → puis selon meta/slot : pas normalizeCharactersLLM (réponse A–E motif)
    L1141 : finalQueue.cursorIndex >= length ? non
    L1246 : return serveNextQuestion2B(candidateId, blockNumber)
  serveNextQuestion2B L2071–2138
    question = queue.questions[queue.cursorIndex]  // Q1 personnages
    advanceQuestionCursor → cursorIndex++
    return { response: question, step: BLOC_02, expectsAnswer: true }

[Si handleBlock2A avec userMessage = "A" et answeredCount = 2]
  L643–662 : questionIndex = answeredCount (2) ; storeAnswerForBlock(..., 2, "A")
  L674–675 : updatedAnsweredCount = 3
  L747–756 : if (updatedAnsweredCount === 3) → transition + handleBlock2B(null) → return transition + Q0
  → Back envoie "FIN DU BLOC 2A …" + première question 2B (motif)
```

---

## 4. Preuve : requêtes, ordre, payload, affichage

### 4.1 Routes réellement consommées

- **Front (ui-test)** : `API_BASE_URL = "https://axiomengine-production.up.railway.app"` (L2 `ui-test/app.js`).  
  Aucune variable d’env type `NEXT_PUBLIC_API_URL` utilisée dans ce fichier ; l’URL est en dur.  
  Les appels vont vers `POST ${API_BASE_URL}/axiom/stream` (L311).  
  **Conclusion :** le front ui-test appelle uniquement `/axiom/stream` pour le chat (pas `/axiom` ni `/start` pour ce flux).

### 4.2 Condition de routage BLOC 2 (server)

- **Fichier :** `src/server.ts`  
- **Stream :** L1523–1524  
  `if (candidate.session.ui?.step === BLOC_02 && candidate.session.currentBlock === 2)`  
  → alors bloc 2A/2B délégué à `BlockOrchestrator.handleMessage` (L1548).  
- Aucun autre `if` ne cible `BLOC_02` + `currentBlock === 2` avant cette branche pour le flux « message utilisateur ».  
- **Preuve :** pendant 2A/2B, dès que `ui.step === BLOC_02` et `currentBlock === 2`, on passe **toujours** dans l’orchestrateur, jamais dans `executeAxiom` pour ce chemin.

### 4.3 État session/store à chaque message

- **sessionId :** fourni par le front (body + header `x-session-id`), utilisé tel quel (L1041, L1309).  
- **currentBlock :** reste à 2 pour le bloc 2 (non modifié par l’orchestrateur pour le bloc 2).  
- **ui.step :** mis à `BLOC_02` par `serveNextQuestion2B` (L2125) et par les retours 2A (L629, L636, etc.).  
- **queue.cursorIndex :**  
  - Juste après `setQuestionsForBlock` : 0 (`sessionStore.ts` L529).  
  - Après `serveNextQuestion2B` (première fois, transition) : `advanceQuestionCursor` → 1 (L613–616).  
  - Au message suivant (user "A") : on lit `currentQueue.cursorIndex - 1` = 0 pour `questionIndex` (L1074).  
  Donc pour la première réponse 2B ("A"), **questionIndex = 0**, **meta[0]** = slot motif (ordre canonique).

### 4.4 Contenu de l’événement `done` (backend)

- **Source :** `server.ts` L1603–1618 (route stream, branche BLOC 2).  
- **Payload :**  
  `response: finalResponse` avec `finalResponse = streamedText || result.response || "…"`.  
  Pour le bloc 2, l’orchestrateur ne fait pas de stream de tokens (pas d’appel à `onChunk` avec le texte de réponse), donc **streamedText** reste `''` (L1009, jamais incrémenté dans cette branche).  
  Donc **response** dans `done` = **result.response** exactement.  
- **step :** `result.step` (BLOC_02).  
- **currentBlock, state, expectsAnswer, autoContinue :** issus de `result` et de `candidate.session`.

**IMPORTANT — après réponse user "A" :**

- Si le backend a pris le chemin **handleBlock2B** (queue présente, cursorIndex 1) :  
  `result` = `serveNextQuestion2B()` → **result.response = Q1 (question personnages)**.  
  Donc `done.response` = Q1 → pas de « FIN DU BLOC 2A ».
- Si le backend a pris le chemin **handleBlock2A** avec **answeredCount = 2** puis `updatedAnsweredCount === 3` :  
  `result` = transition + Q0 (L751–755).  
  Donc **done.response = "FIN DU BLOC 2A …" + Q0** → le front affiche bien à nouveau la transition.

### 4.5 Unicité de la chaîne « FIN DU BLOC 2A »

- **Grep (code source) :**  
  La chaîne exacte `"🧠 FIN DU BLOC 2A — PROJECTIONS NARRATIVES\n\n…On passe maintenant au BLOC 2B…"` n’apparaît que dans :
  - **`src/services/blockOrchestrator.ts`** L751–752 (et équivalent compilé `dist/...`).
- Ailleurs : `src/engine/prompts.ts`, `src/prompts/metier/AXIOM_PROFIL.txt` — texte dans des prompts, **pas** renvoyé comme corps de réponse API.
- **Preuve :** le seul endroit où cette chaîne peut être **produite** comme réponse API est la branche **handleBlock2A** lorsque **updatedAnsweredCount === 3** (L747–756).

---

## 5. Cause exacte du « retour FIN BLOC 2A » après réponse 2B

**Conclusion (prouvée) :**

Le backend **renvoie une seconde fois** le message de transition (FIN BLOC 2A + On passe au BLOC 2B) **si et seulement si**, pour la requête où l’utilisateur envoie "A", le **candidat chargé** a **strictement 2 réponses** dans `answerMaps[2].answers` (au lieu de 3).

Dans ce cas :

1. **handleMessage** calcule `answeredCount = Object.keys(answers).length = 2` → **answeredCount >= 3** est faux → on appelle **handleBlock2A** (L203).  
2. Dans **handleBlock2A**, avec **userMessage = "A"** et **questionIndex = answeredCount = 2**, on enregistre "A" à l’index 2 (L660 ou L662).  
3. **updatedAnsweredCount** devient 3 → la condition L747 est vraie.  
4. On exécute la transition (L750–755) et on retourne **transition + Q0**.  
5. Le front reçoit donc `done.response` = texte de transition + première question motif → **ré-affichage de « FIN DU BLOC 2A »**.

**Pourquoi le candidat peut-il n’avoir que 2 réponses au moment où l’utilisateur envoie "A" ?**

- **Cause racine la plus plausible (multi-instance + persistance asynchrone) :**  
  - Requête 1 (3ᵉ réponse 2A) : instance A enregistre la 3ᵉ réponse, met à jour la queue 2B, envoie transition + Q0.  
  - `persistCandidate` est appelé mais **n’est pas await** (`sessionStore.ts` L38–59 : Redis `set` asynchrone, pas d’await).  
  - Requête 2 (user "A") : traitée par une **autre instance** (ex. B) ou après redémarrage.  
  - Instance B charge le candidat depuis **Redis** (`getAsync`, L179–199).  
  - Si la mise à jour Redis de l’instance A n’est pas encore visible (réplication, latence), le candidat chargé peut encore avoir **seulement 2 réponses** (indices 0 et 1).  
  - Donc **answeredCount = 2** → handleBlock2A → stockage de "A" en index 2 → updatedAnsweredCount = 3 → **transition renvoyée une seconde fois**.

- **Autre cause possible :** sessionId différent (autre onglet, ancien id) donnant un candidat qui n’a jamais eu la 3ᵉ réponse 2A enregistrée (2 réponses seulement). Même logique : handleBlock2A, transition à nouveau.

**Preuve que le backend peut bien renvoyer la transition :**  
Le chemin L747–756 est le **seul** qui produit cette chaîne ; il est exécuté dès que **handleBlock2A** est appelé avec **updatedAnsweredCount === 3**, ce qui arrive après avoir stocké une réponse à l’index 2 alors que **answeredCount** au début du traitement était 2.

---

## 6. Hypothèses listées — validées ou infirmées

| Hypothèse | Statut | Preuve |
|-----------|--------|--------|
| **H1 : Le backend renvoie vraiment "FIN BLOC 2A" une 2ᵉ fois après "A"** | **VALIDÉE** | Seul chemin = handleBlock2A avec updatedAnsweredCount === 3 (L747–756). Cela exige que le candidat ait eu 2 réponses au moment de l’entrée dans handleMessage. |
| **H2 : Le front duplique l’ancien done.response (stale closure / variable non reset)** | **INFIRMÉE** | `finalContent = (data.response && data.response.trim()) ? data.response.trim() : ''` (app.js L394) ; `data` = `finalData` = payload du dernier événement `done` (L369). Pas de réutilisation d’une réponse d’un appel précédent. |
| **H3 : Un second event done arrive (double requête / double stream)** | **Non prouvée comme cause principale** | Le front a un verrou : `isWaiting` (L274–276, L279, L466), `submitInProgress` (L801–806, L831). Un seul `done` par requête est traité. Si deux requêtes partaient (race), on pourrait voir le premier `done` (transition+Q0) après le second — possible mais pas nécessaire pour expliquer le bug ; la cause backend (candidat à 2 réponses) suffit. |
| **H4 : extractFirstQuestion / concat fait remonter un ancien segment** | **INFIRMÉE** | Pour le `done`, on n’utilise plus extractFirstQuestion : `finalContent = data.response.trim()` (L394). Donc pas de troncature ni de réinjection d’un ancien segment. |
| **H5 : Le front recharge / re-render et ré-injecte un état précédent** | **INFIRMÉE** | Aucune logique dans le code ui-test qui réinjecte un message « transition » ou un état précédent ; l’affichage vient uniquement de `data.response` du dernier `done` (L394–402). |

---

## 7. Checklist d’audit

### A) BACKEND (Railway)

| Point | Statut | Références |
|-------|--------|------------|
| Route consommée | Front appelle **/axiom/stream** uniquement pour le chat (pas /start ni /axiom dans ce flux). | `ui-test/app.js` L2, L311. |
| Condition de routage bloc 2 | `(candidate.session.ui?.step === BLOC_02 && candidate.session.currentBlock === 2)` → blockOrchestrator. Pendant 2A/2B on ne passe pas par executeAxiom pour ce flux. | `src/server.ts` L1523–1548. |
| sessionId / currentBlock / step | sessionId du body/header ; currentBlock = 2 ; ui.step = BLOC_02 après transition et après chaque question 2B. | `server.ts` L1041, L1309 ; `blockOrchestrator.ts` L2125, L629, etc. |
| queue.cursorIndex | Après setQuestionsForBlock : 0. Après premier serveNextQuestion2B (transition) : advanceQuestionCursor → 1. Pour la requête "A", questionIndex = cursorIndex - 1 = 0. | `sessionStore.ts` L529, L613–616 ; `blockOrchestrator.ts` L1074, L2130. |
| Contenu de `done` | response = streamedText \|\| result.response (streamedText vide pour bloc 2). step, currentBlock, expectsAnswer, autoContinue, state issus de result/candidate. | `server.ts` L1603–1618, L1009. |
| Production du texte « FIN BLOC 2A » | Un seul endroit : **handleBlock2A** lorsque **updatedAnsweredCount === 3** (L747–756). | `src/services/blockOrchestrator.ts` L747–756. |
| Chemin quand userMessage = "A" (queue déjà créée) | handleBlock2B → store answer at questionIndex 0 → pas personnages (slot motif) → pas normalizeCharactersLLM → return serveNextQuestion2B → Q1. | L1066–1076, L1091–1098, L1141, L1246 ; serveNextQuestion2B L2086, L2131–2136. |
| Ordre canonique 2B / meta / Q0 motif | Tri déterministe workOrder 2→1→0, slotOrder motif→personnages ; meta canonique 6 entrées ; première question = motif A–E. | `blockOrchestrator.ts` L1370–1410, L1390–1398, L1407–1409. |

### B) FRONTEND (Vercel ui-test)

| Point | Statut | Références |
|-------|--------|------------|
| API_BASE_URL | Hardcodé `https://axiomengine-production.up.railway.app`. Pas de NEXT_PUBLIC_API_URL dans ce fichier. | `ui-test/app.js` L2. |
| readSSEStream / done | Un seul `onDone(parsed)` par événement `done` ; finalData = dernier payload ; finalContent = data.response.trim() ; pas d’extractFirstQuestion sur le done. | L260–261, L367–369, L394. |
| Création message assistant | Si streamMessageDiv existe : streamTextP.textContent = finalContent. Sinon : addMessage('assistant', finalContent). Pas de double add pour le même done. | L396–403. |
| Double requête | Garde isWaiting (L274–276, L279, L466) ; submitInProgress + bouton disabled (L801–806, L831). Une seule requête par envoi utilisateur en conditions normales. | L269–279, L796–832. |

### C) INFRA / CACHE / DÉPLOIEMENT

| Point | Statut | Références / remarques |
|-------|--------|-------------------------|
| Backend Vercel | Aucune référence dans ui-test à un backend Vercel ou à des rewrites /api/axiom. | — |
| Cache | Pas de contrôle no-cache explicite côté front sur les POST ; les POST ne sont en général pas mis en cache par les navigateurs. | — |
| Versions | Build stamp (FRONT_VERSION, X-AXIOM-BUILD) présent pour corrélation ; pas de modification de code dans cet audit. | `ui-test/app.js` L4–6 ; `server.ts` L39–45. |

### D) Résultat attendu

- **Cause exacte :**  
  Le backend **renvoie** le message « FIN DU BLOC 2A — PROJECTIONS NARRATIVES » (et la première question 2B) une seconde fois lorsque la requête correspondant à la réponse "A" est traitée avec un **candidat qui n’a que 2 réponses** dans `answerMaps[2].answers`.  
  Dans ce cas, le routage va dans **handleBlock2A** au lieu de **handleBlock2B**, on enregistre "A" comme 3ᵉ réponse 2A, puis on exécute la branche transition (L747–756).  
  La cause racine la plus plausible est une **race de persistance multi-instance** (Redis non encore mis à jour quand une autre instance traite la requête "A"), ou un **sessionId** différent donnant un candidat à 2 réponses.

- **Correctifs possibles (sans implémenter) :**  
  1. **Persistance synchrone ou garantie avant réponse :** await la persistance Redis (ou équivalent) avant d’envoyer le `done` de la transition, pour que toute instance qui charge le candidat ensuite voie bien 3 réponses et la queue 2B.  
  2. **Découplage 2A / 2B dans le store :** ne pas réutiliser les mêmes indices `answerMaps[2].answers` pour les réponses 2A (0,1,2) et 2B (0,1,…) ; par exemple un sous-objet ou une clé dédiée (ex. `block2BAnswers`) pour éviter tout risque de confusion ou d’écrasement.  
  3. **Idempotence de la transition :** côté backend, ne renvoyer la transition + Q0 que si le candidat n’a **jamais** reçu la première question 2B (ex. flag ou queue vide) ; si la queue 2B existe déjà et cursorIndex > 0, traiter comme une réponse 2B (handleBlock2B) et ne jamais renvoyer la transition.  
  4. **Vérification côté front (diagnostic) :** logger dans le `done` (responsePreview, sessionId, currentBlock, step) et comparer avec la requête envoyée (message, sendId) pour confirmer en prod que le backend renvoie bien la transition lorsque le candidat a 2 réponses.

**Note (design existant) :** Les réponses 2A (indices 0, 1, 2) et la première réponse 2B (index 0) partagent le même `answerMaps[2].answers`. Lors du premier envoi "A" en 2B, on écrit à l’index 0 et on écrase la réponse 2A.1 (médium). Cela ne change pas le nombre de clés (toujours 3), donc ce n’est pas la cause du ré-affichage de la transition ; en revanche c’est un bug de données (perte du médium) à traiter à part (ex. découplage 2A/2B dans le store).

---

## 8. Références fichiers et lignes (résumé)

| Fichier | Lignes clés |
|---------|-------------|
| `src/server.ts` | 1009 (streamedText), 1309–1314 (chargement candidat), 1523–1620 (branche BLOC 2 stream), 1603–1618 (payload done). |
| `src/services/blockOrchestrator.ts` | 191–204 (routage 2A/2B selon answeredCount), 592–773 (handleBlock2A), 747–756 (transition), 965–1246 (handleBlock2B), 1074–1076 (questionIndex, storeAnswer), 1246 (return serveNextQuestion2B), 2071–2138 (serveNextQuestion2B). |
| `src/store/sessionStore.ts` | 38–59 (persistCandidate async), 514–551 (setQuestionsForBlock), 594–632 (advanceQuestionCursor), 672–721 (storeAnswerForBlock), 179–199 (getAsync Redis). |
| `ui-test/app.js` | 2 (API_BASE_URL), 269–279 (isWaiting, callAxiom), 311 (fetch /axiom/stream), 367–369 (onDone), 394–403 (finalContent, affichage), 796–832 (submit, submitInProgress). |

---

**Fin du rapport. Aucune modification de code n’a été effectuée.**
