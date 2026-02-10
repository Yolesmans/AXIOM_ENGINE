# AUDIT TECHNIQUE — STREAMING END-TO-END AXIOM

**Date** : 2025-02-10  
**Périmètre** : Audit uniquement — aucune modification de code.  
**Objectif** : Permettre une implémentation ONE SHOT du streaming sur 100 % des réponses textuelles, sans casser l’existant.

---

## A) CARTOGRAPHIE DES ENDPOINTS / FLUX

### A.1 Point d’entrée unique (production)

- **Fichier** : `src/server.ts` (Express, ESM). Point d’entrée : `node dist/src/server.js` (package.json `start`).
- **Route unique qui renvoie du texte au front** : **`POST /axiom`** (ligne ~319). Aucune autre route ne renvoie de contenu conversationnel ; `/axiom/stream` existe mais renvoie actuellement `NOT_IMPLEMENTED`.

Toutes les réponses textuelles (questions, miroirs, synthèse, matching) passent par **un seul contrat** :  
`res.status(200).json({ sessionId, currentBlock, state, response, step, expectsAnswer, autoContinue, ... })`  
où **`response`** est la chaîne affichée à l’utilisateur.

### A.2 Branches de POST /axiom et origine de `response`

| Branche | Condition | Qui produit le texte | Où c’est bufferisé |
|--------|-----------|----------------------|--------------------|
| Identité (après envoi identité) | `prenomMatch && nomMatch && emailMatch` | `executeWithAutoContinue` → `executeAxiom` | `axiomExecutor.ts` : tone / préambule via `callOpenAI` → `completion` → `result.response` |
| Identité JSON (providedIdentity) | `providedIdentity` + state identity | Idem | Idem |
| Dérivation état / identity requis | `!candidate.identity.completedAt` | Pas de texte (response: '') | — |
| Init UI (deriveStepFromHistory) | `!candidate.session.ui` | Pas de texte (response: '') | — |
| **START_BLOC_1** | `event === "START_BLOC_1"` | `BlockOrchestrator.handleMessage(candidate, null, "START_BLOC_1")` | `blockOrchestrator.ts` : questions BLOC 1 ou miroir BLOC 1 → `result.response` |
| **BLOC 1** (step BLOC_01, block 1) | `candidate.session.ui?.step === BLOC_01 && currentBlock === 1` | `BlockOrchestrator.handleMessage(candidate, userMessageText, null)` | Idem : questions (callOpenAI) ou miroir (generateMirrorForBlock1 → structure → angle → renderMentorStyle) |
| **BLOC 2** (step BLOC_02, block 2) | `step === BLOC_02 && currentBlock === 2` | `BlockOrchestrator.handleMessage(candidate, userMessageText, null)` | Idem : questions 2A ou miroir 2B (generateMirror2B → structure → angle → renderMentorStyle) |
| **Blocs 3–9, 10, matching** | Toutes les autres requêtes avec `userMessage` ou non | `executeWithAutoContinue(candidate, userMessageText, event)` → `executeAxiom` | `axiomExecutor.ts` : questions (callOpenAI), miroirs 3–9 (generateMirrorWithNewArchitecture), synthèse BLOC 10 (idem), matching (idem) |

Donc **deux producteurs de `response`** :

1. **BlockOrchestrator.handleMessage** → pour BLOC 1 et BLOC 2 (questions + miroirs).
2. **executeWithAutoContinue** → pour tout le reste (préambule, blocs 3–9, synthèse, matching).

### A.3 Appels OpenAI par type de sortie (où est le blocage)

#### Questions (tous blocs)

- **Où** : `axiomExecutor.ts` (plusieurs sites) et `blockOrchestrator.ts` (BLOC 1/2).
- **Appel** : `callOpenAI({ messages })` → `openaiClient.ts` : `client.chat.completions.create` **sans** `stream: true`.
- **Blocage** : la réponse complète est attendue puis `completion.trim()` est assignée à `aiText` / `result.response`. Aucun flush avant la fin.

#### Miroir BLOC 1

- **Chaîne** : `generateInterpretiveStructure(userAnswers, 'block1')` → `selectMentorAngle(structure)` → `renderMentorStyle(mentorAngle, 'block1')`.
- **Appels** : 1× 4o-mini (structure), 1× 4o-mini (angle), 1× 4o (rendu REVELIOM : déduction seule).
- **Blocage** : chaque appel est `await` ; le texte final est assemblé (1️⃣ + angle + 2️⃣ + déduction + 3️⃣) puis retourné en une fois. **Streamable** : uniquement l’appel 4o “déduction” dans `renderReveliomWithRawAngle`.

#### Miroir BLOC 2B

- **Chaîne** : `generateInterpretiveStructure(block2BAnswers, 'block2b', ctx)` → `selectMentorAngle(structure)` → `renderMentorStyle(mentorAngle, 'block2b')`.
- **Appels** : 1× 4o-mini, 1× 4o-mini, 1× 4o (rendu 4–6 lignes).
- **Blocage** : idem, tout bufferisé. **Streamable** : l’appel 4o dans `renderMentorStyle` (chemin non-REVELIOM).

#### Miroirs BLOCS 3–9

- **Chaîne** : `generateMirrorWithNewArchitecture(userAnswersInBlock, blockType)` → structure → angle → `renderMentorStyle(inputForRenderer, blockType)` (REVELIOM).
- **Appels** : 1× 4o-mini (structure), 1× 4o-mini (angle), 1× 4o (déduction).
- **Blocage** : comme BLOC 1. **Streamable** : l’appel 4o “déduction” dans `renderReveliomWithRawAngle`.

#### Synthèse BLOC 10

- **Chaîne** : `generateMirrorWithNewArchitecture(allUserAnswers, 'synthesis')` → structure → pas d’angle → `renderMentorStyle(structure.hypothese_centrale, 'synthesis')`.
- **Appels** : 1× 4o-mini (structure), 1× 4o (rendu synthèse, max_tokens 800).
- **Blocage** : tout bufferisé. **Streamable** : l’appel 4o dans `renderMentorStyle` (chemin non-REVELIOM).

#### Matching

- **Chaîne** : `generateMirrorWithNewArchitecture(allUserAnswers, 'matching', additionalContext)` → structure → pas d’angle → `renderMentorStyle(hypothese_centrale, 'matching')`.
- **Appels** : 1× 4o-mini, 1× 4o (rendu matching, max_tokens 800).
- **Blocage** : idem. **Streamable** : l’appel 4o dans `renderMentorStyle`.

### A.4 Synthèse des “chemins” et points de stream

| Chemin | Fichiers concernés | Appel(s) OpenAI streamable(s) | Remarque |
|--------|--------------------|-------------------------------|----------|
| Questions (préambule, blocs 1–9) | `axiomExecutor.ts`, `blockOrchestrator.ts`, `openaiClient.ts` | 1 appel par réponse : `callOpenAI` → à remplacer par stream | Un seul appel, tout le texte en une fois |
| Miroir BLOC 1 | `blockOrchestrator.ts` → `mentorStyleRenderer.ts` | Dernier appel uniquement : déduction dans `renderReveliomWithRawAngle` | Préfixe (1️⃣ + angle) + stream déduction + suffixe (3️⃣) |
| Miroir BLOC 2B | `blockOrchestrator.ts` → `mentorStyleRenderer.ts` | Dernier appel : rendu 4–6 lignes dans `renderMentorStyle` (non-REVELIOM) | Stream du corps complet |
| Miroirs BLOCS 3–9 | `axiomExecutor.ts` → `mentorStyleRenderer.ts` | Dernier appel : déduction dans `renderReveliomWithRawAngle` | Idem BLOC 1 |
| Synthèse BLOC 10 | `axiomExecutor.ts` → `mentorStyleRenderer.ts` | Dernier appel : rendu synthèse | Stream du corps complet |
| Matching | `axiomExecutor.ts` → `mentorStyleRenderer.ts` | Dernier appel : rendu matching | Stream du corps complet |

---

## B) STRATÉGIE TECHNIQUE STREAMING “ONE SHOT”

### B.1 Protocole retenu : **SSE (Server-Sent Events)**

- **Choix** : **SSE** pour le transport des chunks vers le front.
- **Raisons** :
  - Une seule direction (serveur → client), pas besoin de WebSocket.
  - Support natif navigateurs (EventSource) et iOS Safari ; possible en fetch + ReadableStream côté front.
  - Express : pas de support natif Web Streams dans les anciennes versions ; avec `res.write` + `res.flushHeaders()` on contrôle bien le flush (avec middleware `flush` si besoin).
  - Vercel : les fonctions serverless ont un timeout (10–60 s) ; le streaming SSE est supporté en renvoyant une Response avec body stream. En Node (Express) sur Vercel ou Railway, `res.write` + flush convient.
  - Contrat simple : événements `message` avec `data` = chunk texte ou JSON ; un événement `done` avec payload final (sessionId, state, step, etc.) pour que le front ferme et mette à jour l’état.

### B.2 Règle d’or : streamer uniquement la “sortie visible”, pas les étapes internes

- **Analyse (4o-mini)** et **angle (4o-mini)** : **non streamés**. Ils restent en `await` ; seuls les tokens de la **dernière** réponse affichée à l’utilisateur sont streamés.
- **Questions** : un seul appel → on stream cet appel ; le front affiche les chunks au fil de l’eau.
- **Miroirs REVELIOM (1, 3–9)** : après calcul de la structure et de l’angle, on envoie immédiatement au client le **préfixe** (1️⃣ Lecture implicite + angle transposé + 2️⃣ Déduction personnalisée + saut de ligne), puis on stream **uniquement les tokens de la déduction** (appel 4o), puis on envoie le **suffixe** (3️⃣ Validation ouverte + phrase fixe). Ainsi le rendu final (concat) est **identique** au non-stream.
- **Miroir 2B, Synthèse, Matching** : un seul appel 4o produit tout le texte → on stream cet appel de bout en bout.

Aucun changement de prompts, de pipeline (analyse → angle → rendu), ni de modèles/paramètres (sauf `stream: true` sur les appels qu’on stream).

### B.3 Extraction token-by-token et flush

- Côté OpenAI : `client.chat.completions.create({ ... , stream: true })` → async iterable de chunks.
- Pour chaque chunk : `chunk.choices[0]?.delta?.content` ; si présent, l’envoyer immédiatement au client (SSE : `res.write('data: ' + JSON.stringify({ type: 'token', content }) + '\n\n')` ou équivalent) et appeler `res.flush()` si disponible pour éviter buffering intermédiaire.
- En fin de stream : envoyer un événement `done` avec le payload JSON identique au contrat actuel (sessionId, currentBlock, state, response: fullText, step, expectsAnswer, autoContinue) pour que le front concatène une dernière fois (ou utilise déjà la concat côté front), mette à jour l’état et ferme la connexion.

### B.4 Multi-appels séquentiels (analyse → angle → rendu)

- **Scénario** : miroir / synthèse / matching (structure + angle éventuel + rendu).
- **Comportement** :
  - Les appels “analyse” et “angle” restent **non streamés** (comme aujourd’hui). Pendant ce temps, le front peut afficher un indicateur de chargement (optionnel) ou rien ; on peut envoyer un SSE `event: status` / `data: { phase: 'analysis' }` puis `phase: 'angle'` pour le front qui voudrait afficher “Analyse en cours…” (strictement optionnel, pas obligatoire pour l’audit).
  - Dès que l’appel “rendu” (4o) démarre : **premier chunk envoyé au client** = début du texte visible. Pour REVELIOM, on envoie d’abord le préfixe (texte statique), puis les chunks de la déduction, puis le suffixe.
- **Garantie** : le contenu final (concat de tout ce qui est envoyé en `data`) est **identique** à ce que renverrait la version non-stream (même ordre, même chaîne). La validation existante (style, format REVELIOM) s’applique sur ce contenu final côté serveur avant ou après envoi (selon implémentation), sans changer les règles.

---

## C) CONTRATS FRONT / BACK

### C.1 Format des chunks (SSE)

- **Content-Type** : `text/event-stream`.
- **Headers recommandés** :  
  `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` (si derrière nginx), et CORS inchangés pour le front.
- **Forme des événements** :
  - **Token** : `event: message` (ou pas d’event, défaut `message`) et `data: {"type":"token","content":"<un morceau de texte>"}`. Le front concatène `content` dans l’ordre.
  - **Done** : `event: done` et `data: {"type":"done","sessionId":"...","currentBlock":...,"state":"...","response":"<texte complet>","step":"...","expectsAnswer":...,"autoContinue":...}`. Le `response` doit être égal à la concaténation de tous les `content` reçus (pour cohérence et fallback).
  - **Erreur** : `event: error` et `data: {"type":"error","message":"..."}`. Puis fermeture du flux.

Alternative plus légère : `data` en texte brut pour les tokens (une ligne par chunk) et un événement final `done` en JSON. Pour éviter ambiguïté et échappement, **JSON pour chaque `data`** est recommandé.

### C.2 Côté front : reconstruction et affichage

- Ouvrir la connexion : `fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ... } })` puis `response.body.getReader()` pour lire le stream, ou EventSource si le backend expose un GET avec query params (moins adapté au POST Axiom). Donc **fetch + ReadableStream** pour POST.
- Parser les lignes `data: ...` ; pour chaque `data`, `JSON.parse` et si `type === 'token'` alors ajouter `payload.content` à un buffer et mettre à jour l’UI (affichage progressif). Si `type === 'done'`, prendre `payload.response` (ou le buffer concaténé), mettre à jour l’état (sessionId, step, state, etc.) et fermer.
- **Safari iOS** : vérifier que le fetch avec stream est supporté (supporté à partir de versions récentes). Si besoin, fallback : consommer le stream en chunks et mettre à jour le DOM par micro-tasks pour éviter blocage UI.

### C.3 Erreurs

- Si OpenAI renvoie une erreur **avant** tout envoi de token : envoyer `event: error` avec message, puis `res.end()`. Le front affiche un message d’erreur et ne considère pas la réponse comme valide.
- Si l’erreur survient **au milieu** du stream : dès réception de l’exception, envoyer `event: error` avec message (et éventuellement le buffer partiel en `partialResponse`), puis fermer. Le front affiche l’erreur et peut optionnellement afficher le partiel.
- Timeout côté serveur (ex. Vercel 60 s) : si le stream dépasse, la connexion se ferme ; le front doit gérer `close` sans `done` comme erreur ou timeout.

### C.4 CORS et Safari

- Garder les mêmes en-têtes CORS que pour `POST /axiom`. Pour SSE, ne pas bloquer les requêtes preflight. Si le front est en HTTPS et le back en HTTPS, pas de problème spécifique Safari pour fetch + stream.

---

## D) VÉRIFICATION “NE RIEN CASSER”

### D.1 Points de risque

- **Timeouts Vercel** : en mode serverless, la limite (ex. 60 s) s’applique à la durée totale de la requête. Le streaming ne réduit pas la durée totale de génération ; il peut même l’augmenter légèrement (flush, I/O). Il faut que la génération la plus longue (ex. synthèse / matching) reste sous le timeout.
- **Buffering** : reverse proxies (y compris Vercel) ou nginx peuvent bufferiser la réponse. Utiliser `X-Accel-Buffering: no` (nginx), et côté Vercel s’assurer que la réponse est bien envoyée en stream (voir doc Vercel pour Node streaming).
- **Compression** : désactiver la compression gzip pour la route de stream (ou utiliser chunked encoding sans compression) pour que les petits chunks partent immédiatement.
- **Keep-alive** : garder `Connection: keep-alive` pour que le client ne ferme pas avant la fin du stream.

### D.2 Identité contenu stream vs non-stream

- **Méthode** : pour une même entrée (même session, même message, même seed si applicable), comparer le `response` final du mode stream (concat de tous les `token` ou champ `response` de `done`) avec le `response` du mode non-stream (actuel). Les tokens OpenAI en mode stream sont les mêmes que en non-stream pour les mêmes messages/temp ; la concaténation doit donc être identique. Faire quelques runs de test (questions, miroir bloc 1, bloc 3, synthèse, matching) et comparer.
- **Validation** : les validations existantes (validateMentorStyle, validateMirrorREVELIOM, etc.) s’appliquent sur le **texte complet** produit (côté serveur). Soit on valide après avoir accumulé tout le stream (recommandé), soit on valide le `response` dans l’événement `done`. Aucun changement des règles de validation.

### D.3 Coût tokens

- **Streaming n’augmente pas le nombre de tokens** : les mêmes messages sont envoyés à l’API, avec la même option de génération ; seul le mode de réception (stream vs buffer) change. Coût inchangé.

---

## E) PERF / LATENCE (EXPLICATION DU 20–30 s)

### E.1 Décomposition de la latence actuelle

- **TTFB (Time To First Byte)** : actuellement = temps jusqu’à la fin de toute la génération (analyse + angle + rendu pour les miroirs, ou un seul appel pour les questions), car rien n’est envoyé avant `res.json`.
- **Durée modèle** : selon la longueur de la sortie (question courte vs synthèse longue), un ou plusieurs appels séquentiels (4o-mini puis 4o). Chaque appel = latence réseau + génération.
- **Cold start** : en serverless (Vercel), premier appel après inactivité peut ajouter 1–3 s.
- **Séquentialité** : analyse → angle → rendu ne peut pas être parallélisé (chaîne de dépendances). Le streaming ne réduit pas cette séquence.

### E.2 Ce que le streaming améliore vs ce qu’il n’améliore pas

- **Améliore** : la **perception** (premier token visible rapidement après le début du dernier appel ; l’utilisateur voit du texte au lieu d’un écran blanc).
- **N’améliore pas** : la **durée totale** (même nombre d’appels, même ordre). Pour les miroirs/synthèse/matching, le “début d’affichage” n’arrive qu’après analyse + angle (ou analyse seule pour synthèse/matching).

### E.3 Recos (audit only)

- **Keep-warm** : si hébergement le permet, ping périodique pour réduire cold start.
- **Runtime Node** : garder une version Node supportée (18+), pas de changement requis pour le streaming.
- **Compression** : désactiver pour la route SSE (voir D.1).
- **Optionnel** : envoyer des événements `status` (phase analysis/angle) pour que le front affiche “Analyse…” puis “Rédaction…” afin de donner un retour avant le premier token de contenu.

---

## F) PLAN D’IMPLÉMENTATION “ONE SHOT” (SANS CODER)

### Étape 1 — Backend : client OpenAI stream

- **Fichier** : `src/services/openaiClient.ts`.
- **Changement** : ajouter (ou réutiliser) une fonction du type `callOpenAIStream` qui fait `stream: true` et **yield** les `chunk.choices[0]?.delta?.content` (déjà présente partiellement ; vérifier qu’elle renvoie bien un AsyncGenerator et accumule le fullContent pour retour final). Ne pas modifier les signatures des appels existants non-stream.

### Étape 2 — Backend : renderer option stream (REVELIOM)

- **Fichier** : `src/services/mentorStyleRenderer.ts`.
- **Changement** : dans `renderReveliomWithRawAngle`, pour l’appel 4o qui génère la déduction : si un paramètre optionnel `onToken?: (chunk: string) => void` (ou un WritableStream/ callback) est fourni, appeler `client.chat.completions.create` avec `stream: true`, itérer sur les chunks, appeler `onToken(delta.content)` et accumuler le texte ; à la fin, assembler mentorText comme aujourd’hui (1️⃣ + angle + 2️⃣ + déduction + 3️⃣), valider, transposer, retourner. Sinon (comportement par défaut), garder l’appel actuel non-stream pour ne rien casser.

### Étape 3 — Backend : renderer option stream (non-REVELIOM)

- **Fichier** : `src/services/mentorStyleRenderer.ts`.
- **Changement** : dans le chemin `renderMentorStyle` pour block2b / synthesis / matching, idem : paramètre optionnel pour streamer les tokens du seul appel 4o (itération sur le stream, callback ou yield), tout en accumulant pour retour final et validation. Comportement par défaut = actuel (non-stream).

### Étape 4 — Backend : axiomExecutor — questions

- **Fichier** : `src/engine/axiomExecutor.ts`.
- **Changement** : partout où `callOpenAI` est utilisé pour produire du texte affiché (questions, préambule, retry), introduire un chemin conditionnel “si stream demandé” : utiliser `callOpenAIStream`, et au lieu d’assigner `completion` à `aiText` en une fois, passer un callback (ou async generator) qui sera utilisé par la couche au-dessus pour envoyer les chunks au client. Pour garder l’existant, la signature de `executeAxiom` peut prendre un option `streamCallback?: (chunk: string) => void` ; quand absent, comportement actuel (await full completion puis return). Ne pas modifier les prompts ni la logique de choix d’appel.

### Étape 5 — Backend : axiomExecutor — miroirs / synthèse / matching

- **Fichier** : `src/engine/axiomExecutor.ts`.
- **Changement** : dans les branches qui appellent `generateMirrorWithNewArchitecture`, passer un option “stream” / callback jusqu’à `renderMentorStyle`. Pour REVELIOM, le callback reçoit d’abord le préfixe (1️⃣ + angle transposé + 2️⃣ + \n), puis les tokens de la déduction, puis le suffixe (3️⃣ + validation). Pour synthèse/matching, le callback reçoit uniquement les tokens du rendu 4o. La fonction `generateMirrorWithNewArchitecture` et `renderMentorStyle` doivent accepter un paramètre optionnel (ex. `onChunk?: (text: string) => void`) sans changer le comportement par défaut.

### Étape 6 — Backend : blockOrchestrator

- **Fichier** : `src/services/blockOrchestrator.ts`.
- **Changement** : dans `handleMessage`, quand on appelle `renderMentorStyle` (BLOC 1 miroir) ou la chaîne qui mène au miroir 2B, passer le même type d’option `onChunk` si le mode stream est activé. Pour les questions BLOC 1/2, si un chemin utilise `callOpenAI`, le faire passer par un équivalent “stream” (callback) comme en étape 4. Ne pas changer la logique métier ni les prompts.

### Étape 7 — Backend : route POST /axiom vs POST /axiom/stream

- **Fichier** : `src/server.ts`.
- **Changement** :  
  - **POST /axiom** : garder tel quel (pas de stream) ; tous les `executeWithAutoContinue` et `BlockOrchestrator.handleMessage` restent appelés sans option stream, puis `res.status(200).json({ ... response: result.response ... })`.  
  - **POST /axiom/stream** : pour le même body que `/axiom`, appeler la même logique (même branches, mêmes appels) mais en passant une option “stream” et un callback qui fait `res.write('data: ' + JSON.stringify({ type: 'token', content }) + '\n\n')` et flush. À la fin, envoyer `event: done` avec le payload JSON complet (sessionId, currentBlock, state, response: fullText, step, expectsAnswer, autoContinue), puis `res.end()`. En cas d’erreur, envoyer `event: error` puis `res.end()`. Ne pas dupliquer la logique métier : un seul chemin d’exécution (executeWithAutoContinue / orchestrator) avec un paramètre “stream” et un callback.

### Étape 8 — Contrat et headers

- **Fichier** : `src/server.ts` (route `/axiom/stream`).
- **Changement** : s’assurer des headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, et si besoin `X-Accel-Buffering: no`. CORS inchangé par rapport à `/axiom`.

### Étape 9 — Tests manuels

- Après implémentation unique (une PR) :  
  - **Bloc 1** : une question, puis fin de bloc 1 (miroir) → vérifier affichage progressif et conformité du texte final.  
  - **Bloc 2B** : fin de bloc 2B (miroir 4–6 lignes) → idem.  
  - **Bloc 3** (ou 4–9) : une question, puis miroir → idem.  
  - **Bloc 10** : synthèse → idem.  
  - **Matching** : après synthèse, lancer matching → idem.  
- Vérifier que **POST /axiom** (sans stream) produit toujours les mêmes réponses pour les mêmes entrées (régression).

### Étape 10 — Validation et coût

- Lancer quelques parcours complets en stream et en non-stream ; comparer `response` final (identique attendu). Confirmer que les validations (REVELIOM, style) passent. Confirmer qu’aucun nouvel appel API ni nouveau prompt n’a été ajouté (coût tokens inchangé).

---

## G) CHECKLIST “READY TO IMPLEMENT”

- [ ] **Toutes les routes sont couvertes** : la seule route de contenu est `POST /axiom` ; le streaming sera ajouté via `POST /axiom/stream` en réutilisant la même logique avec un callback de chunks. Toutes les branches (identité, tone, préambule, START_BLOC_1, BLOC_01, BLOC_02, blocs 3–9, synthèse, matching) passent par ces deux chemins (orchestrator ou executeWithAutoContinue), donc une seule stratégie (paramètre stream + callback) couvre 100 % des réponses textuelles.
- [ ] **Tous les flux sont streamables** : questions (1 appel), miroirs REVELIOM (préfixe + stream déduction + suffixe), miroir 2B / synthèse / matching (stream du corps 4o). Les étapes analyse et angle restent non streamées (pas d’affichage utilisateur).
- [ ] **Aucun impact sur prompts / pipeline / coûts** : aucun changement de prompts, pas de nouveau pipeline, pas de nouvel appel API ; seul `stream: true` est ajouté sur les appels dont la sortie est affichée. Coût tokens identique.
- [ ] **Implémentation en une seule PR/commit** : le plan ci-dessus peut être réalisé en une seule passe : openaiClient (déjà partiellement prêt) → mentorStyleRenderer (option onChunk) → axiomExecutor (option stream/callback) → blockOrchestrator (option onChunk) → server.ts (route /axiom/stream + callback SSE). La route `POST /axiom` reste inchangée en comportement.

---

**Fin de l’audit. Aucune modification de code n’a été effectuée.**
