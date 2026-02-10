# AUDIT — STREAMING NON VISIBLE (AXIOM)

**Date** : 2025-02-10  
**Contexte** : Backend streaming SSE implémenté (commit 8467623 — onChunk dans openaiClient, renderer, executor, orchestrator). Aucun streaming visible côté utilisateur.  
**Objectif** : Identifier avec certitude pourquoi le streaming n’est pas perçu. Aucune modification de code.

---

## A) ROUTE EFFECTIVEMENT APPELÉE

**Vérification** : Quelle route est réellement appelée par le front ?

- **Fichier** : `ui-test/app.js` (seul front identifié dans le dépôt).
- **Ligne 137** :  
  `const response = await fetch(\`${API_BASE_URL}/axiom\`, { method: 'POST', ... });`
- **Preuve** : Une seule occurrence de l’appel à l’API Axiom dans ce fichier ; l’URL est **`/axiom`**, pas `/axiom/stream`.

**Conclusion A** : Le front appelle **uniquement** `POST /axiom`. La route `POST /axiom/stream` n’est jamais appelée par le client présent dans le dépôt. Le streaming ne peut pas être visible tant que le front continue d’appeler `/axiom`.

---

## B) ROUTE /axiom/stream — COMPORTEMENT RÉEL

**Vérification** : La route `/axiom/stream` est-elle branchée sur la logique avec `onChunk` ?

- **Fichier** : `src/server.ts`, lignes 943-996.
- **Comportement observé** :  
  Après validation du body (parsed, sessionId, getPostConfig), le handler exécute **uniquement** :
  - `res.write('event: error\n');`
  - `res.write('data: ' + JSON.stringify({ error: "NOT_IMPLEMENTED", message: "Streaming route not yet fully implemented. Use /axiom for now." }) + '\n\n');`
  - `res.end();`
- Aucun appel à `executeWithAutoContinue(..., onChunk)` ni à `BlockOrchestrator.handleMessage(..., onChunk)`. Aucun `res.write()` de type `data: {"type":"token","content":"..."}`.

**Conclusion B** : Même si le front appelait `/axiom/stream`, il recevrait une **erreur** (NOT_IMPLEMENTED), pas un flux SSE. Aucun token n’est jamais écrit sur cette route. Les headers SSE (Content-Type, Cache-Control, Connection) sont bien positionnés, mais le corps est uniquement l’événement d’erreur. **X-Accel-Buffering** n’est pas défini dans le code (non vériable côté proxy sans déploiement).

---

## C) HEADERS DE LA RÉPONSE

**Route réellement utilisée** : `POST /axiom`.

- Réponse : `res.status(200).json({ sessionId, currentBlock, state, response, step, expectsAnswer, autoContinue })`.
- Express envoie donc un body JSON complet en une fois, avec `Content-Type: application/json`. Pas de stream, pas de `text/event-stream`.

**Route non utilisée** : `POST /axiom/stream`.

- Headers définis dans le code : `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. Pas de `X-Accel-Buffering` dans le code.
- Comme le corps est uniquement l’événement d’erreur puis `res.end()`, il n’y a pas de flux à bufferiser côté proxy pour cette route.

**Conclusion C** : Pour l’usage actuel (/axiom), les headers sont ceux d’une réponse JSON classique. Aucun flux SSE n’est émis, donc la question du buffering proxy ne se pose pas pour le flux de production actuel.

---

## D) CONSOMMATION DU STREAM CÔTÉ FRONT

**Vérification** : Comment le front consomme-t-il la réponse ?

- **Fichier** : `ui-test/app.js`, ligne 143 :  
  `const data = await response.json();`
- **Effet** : `response.json()` attend la **réception complète** du body HTTP avant de parser. Aucune lecture progressive (ReadableStream, getReader(), ou parsing ligne à ligne de SSE).

**Conclusion D** : Le front **bufferise entièrement** la réponse puis affiche `data.response` en une fois. Même si le backend envoyait un flux SSE, ce code ne pourrait pas afficher les tokens au fil de l’eau. Aucune référence à `ReadableStream`, `getReader()`, ou `EventSource` pour l’endpoint Axiom dans ce fichier.

---

## E) FLUX SSE ET MOMENT D’AFFICHAGE

**Vérification** : Les `res.write()` de tokens sont-ils appelés quelque part ?

- Dans `src/server.ts`, la route `/axiom/stream` ne contient **aucun** `res.write()` avec `type: "token"`. Aucun callback `onChunk` n’est passé à la logique métier depuis cette route.
- Les couches basses (openaiClient, mentorStyleRenderer, axiomExecutor, blockOrchestrator) acceptent bien un `onChunk` et peuvent streamer, mais **aucune route ne les appelle avec ce callback**.

**Conclusion E** : Les tokens ne sont jamais envoyés en SSE. La connexion sur `/axiom/stream` est fermée après l’envoi de l’événement d’erreur. Il n’y a donc pas de “tokens qui arrivent mais ne sont pas affichés” : ils ne sont pas émis.

---

## F) DISTINCTION TEMPS RÉEL vs TEMPS PERÇU

**Rappel** : En cas de streaming implémenté côté route, seraient streamés uniquement les tokens de la **dernière** étape (rendu 4o). Les étapes analyse et angle (4o-mini) restent en `await` et ne produiraient des tokens qu’après leur fin.

**Situation actuelle** :  
- La route appelée est `/axiom`, qui renvoie un JSON unique après toute la génération.  
- Aucun flux n’est émis.  
- Donc : pas de “streaming qui démarre tard” ; **le streaming ne démarre jamais** côté réponse HTTP, et le client ne tente pas de le consommer.

**Conclusion F** : Le délai perçu par l’utilisateur correspond à l’attente de la réponse **complète** de `POST /axiom`. Aucun premier token n’est envoyé avant la fin, car la route utilisée ne fait pas de stream.

---

## 1) TABLEAU RÉCAPITULATIF

| Point audité | Constat factuel |
|--------------|------------------|
| **Route** | Le front appelle **POST /axiom** (ui-test/app.js:137). **POST /axiom/stream** n’est jamais appelé. |
| **Headers** | Pour /axiom : réponse JSON classique. Pour /axiom/stream : headers SSE sont définis mais le corps est uniquement une erreur ; pas de flux. |
| **Front** | Consommation par **`response.json()`** (ui-test/app.js:143) : attente de tout le body, affichage en une fois. Aucune lecture de stream. |
| **SSE** | Aucun `res.write()` de tokens dans server.ts. La route /axiom/stream renvoie uniquement `event: error` (NOT_IMPLEMENTED) puis `res.end()`. |
| **Buffering** | Non en cause : aucun flux n’est émis. La route /axiom renvoie un JSON bufferisé en une fois. |

---

## 2) CONCLUSION UNIQUE

**Le streaming n’est pas visible parce que :**

1. **Le front appelle uniquement `POST /axiom`** et non `POST /axiom/stream`, donc il ne demande jamais de flux SSE.
2. **La route `POST /axiom/stream` n’est pas implémentée** : elle ne fait pas appel à la logique métier avec `onChunk` et renvoie immédiatement une erreur `NOT_IMPLEMENTED`, donc aucun token n’est jamais envoyé en SSE.
3. **Le front consomme la réponse avec `response.json()`**, ce qui attend la fin complète du body ; même un flux SSE ne serait pas affiché progressivement avec ce code.

En résumé : **le streaming est techniquement absent côté route** (aucun flux émis), **et le client ne l’utilise pas** (route non appelée, consommation non streamée).

---

## 3) CORRECTION NÉCESSAIRE (UNE CAUSE)

**Cause unique** : La route `POST /axiom/stream` dans `src/server.ts` n’a jamais été branchée sur la logique métier (executeWithAutoContinue / BlockOrchestrator avec `onChunk`) et le front n’appelle pas cette route ni ne consomme un flux (pas de lecture SSE, pas d’utilisation de `/axiom/stream`).

Aucune modification de code n’a été effectuée dans le cadre de cet audit.
