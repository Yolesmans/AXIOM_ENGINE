# Audit senior — Désynchronisation persistante BLOC 2A

**Date** : 2025-02-10  
**Type** : Analyse technique indépendante, sans modification de code.  
**Périmètre** : Flux complet BLOC 2A (envoi front → stream → done → moteur → session → rendu UI).

---

## 1. Contexte factuel

- Question 2A.1 rendue statique (0 LLM, 0 validation, 0 retry).
- Normalisation de la réponse 2A.1 en place (Série/Film, `normalize2A1Response`).
- Logs back mentionnés : `[DEBUG] block=2A answeredCount=1 next=2A.2`.
- Flux SSE : `data.response` utilisé comme source de vérité en fin de tour côté front.
- Verrou anti double submit + instrumentation sendId côté front.

**Symptôme persistant** : après réponse à 2A.1 (ex. "A"), la même question 2A.1 peut réapparaître visuellement.

---

## 2. Vérification exhaustive du cycle

### 2.1 Envoi front

- **Fichier** : `ui-test/app.js`
- **Point d’envoi unique** : `chat-form` submit → `addMessage('user', message)` puis `callAxiom(message)`.
- **Verrous** : `submitInProgress = true` en tête du handler ; `isWaiting = true` au début de `callAxiom` ; relâchés en `finally` / fin de handler.
- **Conclusion** : Un seul envoi par action utilisateur pour le flux considéré. Pas de double requête côté front pour un même clic.

### 2.2 Réception et routage côté back (`POST /axiom/stream`)

- **Fichier** : `src/server.ts` (à partir d’environ 967).
- **Chargement candidat** (l.1298–1303) : `candidate = candidateStore.get(sessionId)` puis `getAsync` ou `create`.
- **Identité / état** : contrats identité (l.1315–1345), initialisation UI si `!candidate.session.ui` via `deriveStepFromHistory` (l.1347–1367).
- **Branche BLOC 2A** (l.1512–1610) : condition `candidate.session.ui?.step === BLOC_02 && candidate.session.currentBlock === 2`. Aucune utilisation de `deriveStateFromConversationHistory` pour cette branche ; on s’appuie uniquement sur `session.ui.step` et `session.currentBlock`.
- **Avant appel orchestrateur** (l.1514–1532) : si `userMessageText` présent, `candidateStore.appendUserMessage(..., userMessageText)` puis rechargement `candidate = candidateStore.get(...)`. Aucun appel à `storeAnswerForBlock` à ce stade : **answerMaps[2] n’est pas encore mis à jour**.

### 2.3 Orchestrateur BLOC 2A (`handleBlock2A`)

- **Fichier** : `src/services/blockOrchestrator.ts`, méthode `handleBlock2A` (à partir d’environ 592).

**Ordre des traitements** (extrait pertinent) :

```text
1) Rechargement candidat (l.602–609) : currentCandidate = candidateStore.get(candidateId)
2) Réponses existantes (l.611–614) :
   answerMap = currentCandidate.answerMaps?.[2]
   answers = answerMap?.answers || {}
   answeredCount = Object.keys(answers).length

3) Cas 1 (l.616–640) : if (answeredCount === 0) {
     → Enregistrer question 2A.1 dans conversationHistory
     → updateUIState
     → return { response: normalizeSingleResponse(STATIC_QUESTION_2A1), ... }
   }

4) Cas 2 (l.642–729) : if (userMessage) {
     → normalisation 2A.1 / stockage (storeAnswerForBlock)
     → rechargement currentCandidate
     → updatedAnsweredCount = 1 → génération 2A.2, return 2A.2
     → log [DEBUG] block=2A answeredCount=1 next=2A.2 (l.677–679)
   }
```

**Point critique** : le **Cas 1** est évalué avant le **Cas 2**. Dès que `answeredCount === 0`, le code retourne la question 2A.1 et ne passe jamais au Cas 2.

Lors de la requête qui transporte la **première** réponse utilisateur à 2A.1 (ex. "A") :

- Le serveur a fait `appendUserMessage` puis rechargé le candidat.
- `storeAnswerForBlock` n’a encore **jamais** été appelé pour le bloc 2 : `answerMaps[2].answers` reste vide.
- Donc dans `handleBlock2A` : `answeredCount === 0`.
- La condition `if (answeredCount === 0)` est vraie → exécution du Cas 1 → **retour systématique de la question 2A.1**.
- Le Cas 2 (stockage de la réponse + génération 2A.2) n’est **jamais** exécuté pour cette requête.

Conséquence : pour la requête où l’utilisateur envoie "A", le back renvoie **toujours** 2A.1 dans `done.response`, et ne peut pas renvoyer 2A.2 ni écrire le log `[DEBUG] block=2A answeredCount=1 next=2A.2` pour ce même appel.

### 2.4 Stream / done / état moteur

- Un seul `writeEvent("done", payload)` puis `res.end()` par requête (l.1614–1610 server.ts).
- `payload.response` est celui retourné par l’orchestrateur : dans le scénario ci‑dessus, toujours la question 2A.1 pour la requête “réponse à 2A.1”.
- Pas de race SSE côté back : un seul flux, un seul done.
- **session.currentBlock** : pour la branche BLOC 2A, il n’est pas modifié dans ce chemin avant l’envoi du done ; la désynchronisation ne vient pas d’une mise à jour asynchrone de `currentBlock` après le done.

### 2.5 Dérivation d’état (deriveStateFromConversationHistory / deriveStepFromHistory)

- **Branche BLOC 2A** de `/axiom/stream` : elle ne s’appuie **pas** sur `deriveStateFromConversationHistory`.
- Elle utilise uniquement `candidate.session.ui?.step` et `candidate.session.currentBlock`.
- `deriveStepFromHistory` n’est utilisé que lorsque `!candidate.session.ui` (initialisation de l’état UI). Aucun impact sur le chemin “réponse à 2A.1” une fois en BLOC_02.

### 2.6 Rendu UI

- **Fichier** : `ui-test/app.js`.
- Après réception du done : `finalContent = extractFirstQuestion(data.response.trim())` ; soit mise à jour de la bulle stream existante, soit `addMessage('assistant', finalContent)`.
- Le front affiche donc strictement ce que le back envoie dans `data.response`. Si le back renvoie 2A.1, l’UI affiche 2A.1.

---

## 3. Vérification des points demandés (sans présupposer la cause)

| Point | Conclusion |
|-------|------------|
| **Double requête réelle** | Non. Un seul submit → un seul `callAxiom` ; verrous `submitInProgress` et `isWaiting` en place. |
| **Race condition SSE** | Non. Un seul flux par requête, un seul événement `done`. |
| **Désynchronisation session / candidateStore** | Oui, mais de **logique**, pas de concurrence : pour la requête “réponse à 2A.1”, le store n’a pas encore `answerMaps[2]` rempli car le stockage est fait dans le Cas 2, qui n’est jamais atteint. |
| **Ordre des événements stream / done** | Ordre cohérent : tokens (si présents) puis un seul done. Pas de double done. |
| **Mutation d’état asynchrone** | Le problème n’est pas une mutation asynchrone après coup : c’est que la branche qui met à jour l’état (Cas 2) n’est pas exécutée. |
| **Dérivation de bloc** | La branche BLOC 2A ne dépend pas de la dérivation depuis l’historique ; le bloc 2 est déjà fixé. Le souci est l’ordre des cas dans `handleBlock2A`. |
| **Effet de bord des modifications précédentes** | L’ordre “Cas 1 puis Cas 2” fait que, dès qu’il n’y a aucune réponse stockée, on renvoie 2A.1 sans tenir compte du fait qu’un message utilisateur est présent. |
| **Re-render UI indépendant du done** | Non. L’UI ne fait qu’afficher `data.response` du done. Pas de source secondaire pour le texte assistant. |

---

## 4. Cause racine (root cause)

**Cause racine unique** : dans `handleBlock2A` (`blockOrchestrator.ts`), la condition **Cas 1** (`answeredCount === 0`) est évaluée **avant** la condition **Cas 2** (`userMessage`). Aucune prise en compte du fait qu’un message utilisateur puisse être présent alors qu’aucune réponse n’est encore stockée dans `answerMaps[2]`.

- Pour la requête où l’utilisateur envoie sa première réponse à 2A.1 (ex. "A"), `answeredCount` vaut 0 (le stockage n’a lieu que dans le Cas 2).
- Le code entre donc dans le Cas 1, renvoie la question 2A.1 et sort sans jamais exécuter le Cas 2.
- Le Cas 2 (normalisation, `storeAnswerForBlock`, génération 2A.2, log `[DEBUG] block=2A answeredCount=1 next=2A.2`) n’est jamais atteint pour cette requête.

**Preuve dans le code** :

- **Fichier** : `src/services/blockOrchestrator.ts`
- **Lignes** : 616–640 (Cas 1) puis 642–729 (Cas 2).
- **Ligne 617** : `if (answeredCount === 0)` sans condition sur `userMessage`.
- **Ligne 644** : `if (userMessage)` : ce bloc ne peut être exécuté que si on n’a pas déjà quitté la fonction au Cas 1 ; avec `answeredCount === 0` on quitte toujours au Cas 1.

**Pourquoi le phénomène se produit** : l’intention “aucune réponse encore → afficher 2A.1” est correcte pour le **premier** affichage de la question (pas de message utilisateur). Elle devient incorrecte lorsqu’il y a **déjà** un message utilisateur (la réponse à 2A.1) : dans ce cas, il faut stocker la réponse et renvoyer 2A.2, ce que fait le Cas 2. L’ordre actuel des tests empêche d’atteindre le Cas 2 dès que `answeredCount === 0`.

**À propos du log `[DEBUG] block=2A answeredCount=1 next=2A.2`** : ce log se trouve dans le Cas 2 (l.677–679). Dans le flux décrit ci‑dessus (une requête avec réponse "A" et `answeredCount === 0`), ce Cas 2 n’est pas exécuté. Si ce log apparaît en production, il peut correspondre à un autre scénario (autre chemin, autre environnement ou ancienne version). Dans la version de code analysée, la cause de la réapparition de 2A.1 est bien l’ordre Cas 1 / Cas 2.

---

## 5. Correctif recommandé (structurel)

**Principe** : ne renvoyer la question 2A.1 “initiale” que lorsqu’il n’y a **ni** réponse déjà stockée **ni** message utilisateur en cours de traitement. Si un message utilisateur est présent, traiter la réponse (Cas 2) même quand `answeredCount === 0`.

**Modification recommandée** (dans `src/services/blockOrchestrator.ts`, méthode `handleBlock2A`) :

- Remplacer la condition du Cas 1 :
  - **Actuel** : `if (answeredCount === 0)`
  - **Recommandé** : `if (answeredCount === 0 && !userMessage)`

Ainsi :

- `answeredCount === 0` et pas de message utilisateur → premier affichage de 2A.1 (comportement actuel conservé).
- `answeredCount === 0` et message utilisateur présent → on n’entre pas dans le Cas 1, on entre dans le Cas 2 → stockage de la réponse 2A.1, génération et retour de 2A.2.

Aucun autre changement nécessaire pour ce flux : pas de modification du store, ni des contrats SSE, ni du front.

---

## 6. Validation des impacts transverses

- **BLOC 2B** : Aucun impact. Le passage à 2B reste conditionné par `updatedAnsweredCount >= 3` dans le Cas 2 (l.724–727). Le correctif ne fait qu’autoriser l’entrée dans le Cas 2 lorsque la première réponse arrive avec `answeredCount === 0`.
- **BLOC 3 à 9** : Non concernés ; la logique modifiée est limitée à `handleBlock2A` (bloc 2, 2A).
- **Matching** : Non concerné ; pas d’utilisation de cette branche dans le flux matching.
- **Flux SSE / done** : Inchangé (un seul done, même payload).
- **Session / currentBlock** : Inchangé ; le correctif ne touche pas à la mise à jour de `session` ou `currentBlock`.
- **Front** : Aucune modification requise ; il continuera à afficher `data.response` (2A.2 au lieu de 2A.1 pour la requête “réponse à 2A.1”).

---

## 7. Résumé

| Élément | Résultat |
|--------|----------|
| **Diagnostic** | Pour la requête contenant la première réponse à 2A.1, le back renvoie toujours 2A.1 car le Cas 1 (`answeredCount === 0`) est exécuté avant le Cas 2 (`userMessage`) et fait un return sans jamais stocker la réponse ni générer 2A.2. |
| **Preuve** | `blockOrchestrator.ts` : ordre des branches 616–640 (Cas 1) puis 642–729 (Cas 2) ; `answeredCount === 0` sans `&& !userMessage`. |
| **Cause racine** | Ordre des conditions dans `handleBlock2A` : Cas 1 prioritaire sur Cas 2 lorsque aucune réponse n’est encore stockée, sans prise en compte du message utilisateur. |
| **Correctif recommandé** | Conditionner le Cas 1 par `answeredCount === 0 && !userMessage`. |
| **Impacts transverses** | Aucun sur 2B, 3–9, matching, SSE, session, front. |

Ce rapport est strictement une analyse ; aucune modification du code n’a été appliquée.
