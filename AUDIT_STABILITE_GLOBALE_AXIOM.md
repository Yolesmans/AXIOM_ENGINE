# Audit stabilité globale AXIOM/REVELIOM

**Objectif :** Rendre le moteur strictement stable, déterministe et identique sur mobile/desktop/tablette, quelle que soit la latence, la route appelée ou le nombre d’instances. Stopper les rustines au coup par coup.

**Contraintes :** Pas de refactor « artistique ». Pas d’amélioration produit. Stabilité uniquement. Audit → plan unique → exécution patchée bloc par bloc. Zéro régression sur les blocs déjà stabilisés.

---

## A) MULTI-INSTANCE / ROUTING / CACHE

### Problème A1 — Mutex bloc 2 non distribué

| Champ | Contenu |
|-------|---------|
| **Symptôme** | En multi-instance, deux requêtes pour la même session (bloc 2) peuvent être traitées en parallèle sur deux instances ; désync state, double incrément currentQuestionIndex, ou incohérence 2A/2B. |
| **Root cause mécanique** | `block2LockMap` est une `Map` in-memory par processus. Chaque replica Railway a sa propre Map. Le mutex ne sérialise que les requêtes arrivant sur la **même** instance. |
| **Où** | `src/server.ts` L48–60, `acquireBlock2Lock`, `block2LockMap`. |
| **Repro** | (1) Railway avec 2 replicas. (2) Même sessionId : requête 1 sur instance A (bloc 2), requête 2 sur instance B (bloc 2) avant que A ait fini. (3) Observer logs : deux `[AXIOM_REQ]` avec même sessionId, instanceId différents. (4) Risque : currentQuestionIndex ou block2Answers incohérents. |
| **Impact** | Bloc 2 uniquement (2A + 2B). Transitions 2→3, idempotence 2B, queue 2B. |
| **Fix minimal** | **Décision (voir section Décision finale) :** soit 1 replica obligatoire (pas de scaling), soit lock distribué Redis (SET axiom:lock:session:{sessionId} NX EX 30) avant toute entrée bloc 2, release après réponse. |
| **Criticité** | **P0** si replicas > 1. |
| **Risque de régression** | Lock Redis : délai si Redis lent ; timeout à définir. |
| **Garde-fou** | Logs structurés avec instanceId + sessionId ; vérifier qu’une même session ne voit qu’un seul instanceId pendant une fenêtre bloc 2. |

---

### Problème A2 — getAsync priorité cache mémoire → stale read multi-instance

| Champ | Contenu |
|-------|---------|
| **Symptôme** | Une instance a en cache une ancienne version du candidat ; après modification par une autre instance (ou par la même après reload Redis), la lecture suivante sur cette instance peut rester sur le cache (get retourne la Map) et ignorer Redis. |
| **Root cause mécanique** | `getAsync` retourne d’abord `this.candidates.get(candidateId)` si présent (L192–195 sessionStore). Aucune invalidation de cache. En multi-instance, instance B écrit en Redis ; instance A garde l’ancien en Map et ne relit pas Redis tant qu’elle n’a pas perdu le candidat de sa Map. |
| **Où** | `src/store/sessionStore.ts` L192–212, `getAsync`. |
| **Repro** | (1) Deux instances. (2) Instance A charge session X (bloc 2, index 3). (3) Instance B traite un message pour X, met à jour Redis (index 4, persistAndFlush). (4) Instance A reçoit la requête suivante pour X, appelle getAsync : candidat déjà en Map → retourne ancien état (index 3). |
| **Impact** | Tous blocs ; particulièrement critique pour bloc 2 (currentQuestionIndex, block2Answers), transitions, miroirs. |
| **Fix minimal** | Avec **1 replica** : pas de fix nécessaire. Avec **multi-instance** : soit toujours lire depuis Redis pour les chemins critiques (nouvelle méthode `getFromRedis` utilisée avant handleMessage / executeAxiom), soit invalidation cache après chaque écriture externe (complexe). La recommandation du plan est 1 replica OU lock distribué + lecture Redis avant prise de décision (voir plan). |
| **Criticité** | **P0** en multi-instance. |
| **Risque de régression** | Lecture Redis systématique : latence. |
| **Garde-fou** | Logs avec currentBlock, step, block2B currentQuestionIndex ; comparer avec Redis (script de vérification optionnel). |

---

### Problème A3 — Railway : nombre de replicas et sticky sessions non imposés par le code

| Champ | Contenu |
|-------|---------|
| **Symptôme** | Impossible de garantir depuis le dépôt qu’une seule instance sert une session ou que les requêtes d’une session sont collées à la même instance. |
| **Root cause mécanique** | Aucun fichier railway.json, Dockerfile ou config de déploiement dans le repo ; pas de sticky session configurée dans le code. |
| **Où** | N/A (configuration infra). |
| **Repro** | Vérifier dans Railway dashboard : Settings → Replicas / Scaling. Si replicas > 1 ou autoscaling activé, une même session peut toucher plusieurs instanceId. |
| **Impact** | Tous les risques A1 et A2. |
| **Fix minimal** | **Décision unique (voir fin du doc) :** fixer 1 replica et désactiver l’autoscaling, OU introduire lock distribué + règle de lecture Redis avant décision. |
| **Criticité** | **P0**. |
| **Risque de régression** | Aucun si on ne change que la config. |
| **Garde-fou** | Logs [AXIOM_REQ] avec instanceId ; alerting si même sessionId sur plusieurs instanceId dans une fenêtre courte. |

---

## B) COHÉRENCE DES ROUTES

### Problème B1 — POST /axiom (JSON) bloc 2 sans mutex ni reload systématique

| Champ | Contenu |
|-------|---------|
| **Symptôme** | Sur la route JSON, le bloc 2 peut être traité sans mutex et avec un reload qui dépend du chemin (appendUserMessage puis get) ; une autre requête (stream ou JSON) sur une autre instance peut modifier l’état entre-temps. |
| **Root cause mécanique** | Pour `candidate.session.ui?.step === BLOC_02 && candidate.session.currentBlock === 2`, server.ts appelle directement `orchestrator.handleMessage(candidate, userMessageText, null)` (L815–849) sans `acquireBlock2Lock`. Le candidat a été rechargé après appendUserMessage (get/getAsync L833–835) mais pas après un getAsync « froid » depuis Redis. |
| **Où** | `src/server.ts` L815–849 (bloc « PHASE 2A : Déléguer BLOC 2A à l’orchestrateur »). |
| **Repro** | (1) Cliente qui envoie du JSON sur POST /axiom en bloc 2. (2) Deux requêtes rapides (double tap ou retry). (3) Si deux instances : chacune peut exécuter handleMessage en parallèle. |
| **Impact** | Bloc 2 (2A/2B), transitions 2→3. |
| **Fix minimal** | Aligner sur la route stream : avant toute entrée bloc 2 (step BLOC_02, currentBlock 2), acquérir le **même** lock (in-memory si 1 instance, Redis si multi-instance), puis `candidate = await candidateStore.getAsync(sessionId)` (ou getFromRedis si multi-instance), puis handleMessage. |
| **Criticité** | **P1** (P0 si POST /axiom utilisé en prod pour bloc 2). |
| **Risque de régression** | Aucun si le lock est le même que pour /axiom/stream. |
| **Garde-fou** | Même log [AXIOM_REQ] avec label `axiom` sur cette branche ; vérifier présence du lock en log (à ajouter dans le plan d’instrumentation). |

---

### Problème B2 — Ordre des branches et single entrypoint

| Champ | Contenu |
|-------|---------|
| **Symptôme** | Plusieurs chemins mènent au moteur (GET /start, POST /axiom, POST /axiom/stream avec sous-branches identité, START_BLOC_1, BLOC_01, BLOC_02, chemin générique). Une même décision métier (ex. « prochaine question 2B ») peut être prise dans blockOrchestrator ou dans axiomExecutor selon le bloc ; pas une seule « porte d’entrée » documentée. |
| **Root cause mécanique** | Historique d’évolution : bloc 1 et 2 délégués à BlockOrchestrator, blocs 3–10 à executeWithAutoContinue → axiomExecutor. Les protections (mutex, reload) ne sont pas uniformes sur toutes les branches. |
| **Où** | `src/server.ts` : GET /start (L188), POST /axiom (L363), POST /axiom/stream (L1015) ; sous-branches par step/event. |
| **Repro** | Parcourir le code : pour chaque (route, step, event), noter si mutex/reload est appliqué. Tableau de vérification dans le plan. |
| **Impact** | Maintenance, risque d’oublier un lock ou un reload sur une branche. |
| **Fix minimal** | Documenter une règle unique : « Pour toute requête modifiant ou lisant state critique (blockStates, currentBlock, step, queue, answers), on applique : (1) lock session si bloc 2, (2) reload candidat depuis source de vérité (Redis si multi-instance), (3) décision, (4) persistAndFlush si mutation, (5) release lock. » Appliquer cette règle sur toutes les branches qui touchent au state. |
| **Criticité** | **P2** (organisationnel). |
| **Risque de régression** | Aucun si on n’ajoute que des gardes et de la doc. |
| **Garde-fou** | Checklist de revue : chaque branche qui appelle handleMessage ou executeWithAutoContinue doit avoir reload + lock (si bloc 2) avant appel. |

---

## C) IDEMPOTENCE / CONCURRENCY / ORDERING

### Problème C1 — Double submit et retries réseau

| Champ | Contenu |
|-------|---------|
| **Symptôme** | Double tap ou retry HTTP peut envoyer deux fois le même message ; sans idempotence côté back, risque de double incrément (currentQuestionIndex) ou double enregistrement de réponse. |
| **Root cause mécanique** | Côté front : isWaiting et submitInProgress limitent bien le double envoi (ui-test/app.js L274–279, L868–872, L876–879). Côté back : bloc 2B a une idempotence explicite (answersLength >= currentQuestionIndex → retourner la prochaine question sans muter, blockOrchestrator L982–991). Blocs 3–10 : pas de clé de déduplication (requestId/dedupe key) ; un même message reçu deux fois peut être traité deux fois. |
| **Où** | Front : `ui-test/app.js`. Back bloc 2B : `src/services/blockOrchestrator.ts` L979–991. Back blocs 3–10 : `src/engine/axiomExecutor.ts` (pas de dedupe). |
| **Repro** | (1) En bloc 3, envoyer un message. (2) Avant réception de « done », retry (réseau lent) ou double tap. (3) Deux POST partent. (4) Front : le second peut être ignoré (isWaiting). Si le premier timeout et l’utilisateur renvoie, deux traitements possibles. |
| **Impact** | Blocs 3–10 : possible double réponse, double addAnswer, ou double transition. |
| **Fix minimal** | Option 1 : conserver le garde-front (isWaiting) et accepter le risque retry. Option 2 (recommandée dans le plan) : introduire un requestId/dedupe key par message côté front ; back stocke les requestId traités par session et ignore les doublons. Fix minimal sans refactor : s’assurer que tous les chemins critiques (bloc 2) sont déjà protégés par mutex + idempotence 2B ; pour 3–10, documenter le risque et ajouter requestId dans un second temps. |
| **Criticité** | **P2** (P1 si retries fréquents en prod). |
| **Risque de régression** | Gestion requestId : ne pas rejeter à tort des messages légitimes (TTL ou fenêtre). |
| **Garde-fou** | Log chaque message entrant avec sessionId + hash(message) ou requestId ; détecter doublons en log. |

---

### Problème C2 — Refresh / back-forward : état rechargé peut être stale

| Champ | Contenu |
|-------|---------|
| **Symptôme** | Utilisateur en bloc 2 ou 3, refresh ou back/forward ; le front rappelle /start ou envoie un message. Le back charge le candidat depuis Redis (ou cache). Si une requête précédente n’a pas encore flush ou si le cache est stale, l’état affiché ou utilisé peut être en retard. |
| **Root cause mécanique** | getAsync donne priorité au cache mémoire ; après refresh, une nouvelle requête peut atterrir sur une instance qui n’a jamais vu la session et charge depuis Redis (état à jour). Mais si la même instance a servi la session avant avec un état pas encore flush, ou si loadFromFile est utilisé (single instance sans Redis), l’état peut être ancien. |
| **Où** | `sessionStore.ts` getAsync, loadFromFile ; routes /start et POST /axiom/stream qui rechargent le candidat. |
| **Repro** | (1) Répondre à une question bloc 2B. (2) Immédiatement refresh. (3) /start ou prochain POST : vérifier que step/currentBlock/currentQuestionIndex correspondent à la dernière action. Avec Redis + 1 instance, en général OK ; avec file ou multi-instance, risque. |
| **Impact** | Tous blocs ; utilisateur peut revoir une question déjà répondue ou sauter une question. |
| **Fix minimal** | Garantir que toute mutation critique est suivie de persistAndFlush avant de renvoyer la réponse (déjà partiellement fait). Pour refresh/back, s’assurer que la route utilisée au « retour » (ex. /start) fait bien getAsync (et non seulement get) pour repartir de la source de vérité. Vérifier /start : il fait get puis getAsync si absent (L644–648 server.ts pour POST /axiom ; équivalent stream L1348). |
| **Criticité** | **P1**. |
| **Risque de régression** | Aucun si on ne fait que relire depuis Redis après mutation. |
| **Garde-fou** | Checklist manuelle : refresh à mi-bloc, vérifier que la prochaine question est la bonne (pas de retour en arrière). |

---

## D) TRANSITIONS + VALIDATIONS MIROIR (BLOCS 1→10)

### Problème D1 — Miroirs 3–9 enregistrés avec kind='mirror' (déjà corrigé)

| Champ | Contenu |
|-------|---------|
| **Symptôme** | (Historique.) Les miroirs blocs 3–9 étaient enregistrés avec kind 'question' car on utilisait expectsAnswer ? 'question' : 'mirror' alors que expectsAnswer est forcé à true pour les miroirs → la validation miroir (lastAssistantMessage.kind === 'mirror') ne reconnaissait jamais le miroir. |
| **Root cause mécanique** | Dans axiomExecutor, appendAssistantMessage utilisait kind: expectsAnswer ? 'question' : 'mirror'. Pour les miroirs 3–9, expectsAnswer est true → kind devenait 'question'. |
| **Où** | `src/engine/axiomExecutor.ts` (correction déjà en place : kind: isMirror ? 'mirror' : 'question'). |
| **Repro** | Parcours bloc 3 → miroir → vérifier en base/log que le dernier message assistant a kind='mirror'. Transition vers bloc 4 doit se déclencher après envoi d’un message utilisateur. |
| **Impact** | Transitions 3→4, …, 9→10. |
| **Fix minimal** | Déjà appliqué. Aucune action sauf vérification. |
| **Criticité** | **P0** (résolu). |
| **Risque de régression** | Ne pas réintroduire expectsAnswer pour déterminer kind. |
| **Garde-fou** | Test manuel : après chaque miroir 3–9, lastAssistantMessage.kind === 'mirror' ; après message utilisateur, transition au bloc suivant. |

---

### Problème D2 — Stratégie unique validation miroir (1, 2B, 3–9)

| Champ | Contenu |
|-------|---------|
| **Symptôme** | Aujourd’hui : bloc 1 et 2B attendent un message utilisateur « validation » après le miroir (expectsAnswer: true) ; blocs 3–9 idem (validation miroir dans axiomExecutor). Aucun bouton « Continuer » ni auto-enchaînement backend après miroir. Si l’utilisateur n’envoie rien, le flux reste bloqué. |
| **Root cause mécanique** | Design actuel : après miroir, le back renvoie expectsAnswer: true et reste sur le même step ; la transition au bloc suivant n’a lieu que lorsqu’une **requête avec message utilisateur** arrive (validation miroir). Pas de mécanisme unique côté front (bouton générique ou autoContinue) ; pas d’auto-enchaînement backend (pas de « après miroir, appeler executeAxiom pour la première question du bloc suivant » sans message utilisateur). |
| **Où** | blockOrchestrator (bloc 1, 2B) : retour miroir + expectsAnswer true ; axiomExecutor (3–9) : détection validation miroir puis nextState = bloc suivant. server.ts : pas d’auto-enchaînement après miroir pour 3–9. |
| **Repro** | Après miroir 2B ou 3 : ne rien envoyer → l’utilisateur reste sur la même bulle ; envoyer « ok » → transition. Vérifier que le comportement est le même pour 1, 2B, 3–9 (tous attendent un message). |
| **Impact** | UX et cohérence ; risque de blocage si l’utilisateur ne comprend pas qu’il doit taper. |
| **Fix minimal** | **Décision (plan unique) :** on choisit **une** stratégie. (1) **Option A — Auto-enchaînement backend :** après génération du miroir (1, 2B, 3–9), le back enchaîne dans la même réponse (ou un appel interne) avec la première question du bloc suivant ; le front ne fait rien de spécial. (2) **Option B — Validation explicite générique :** le front affiche un bouton « Continuer » (ou champ pré-rempli) dès que le back indique « miroir venant d’être affiché » (flag dédié par bloc, pas seulement 2B) et envoie un message prédéfini. Le présent audit ne change pas le produit ; le plan impose **une** stratégie et l’applique partout (pas de « spécial 2B » vs « spécial 3 »). |
| **Criticité** | **P1** (cohérence). |
| **Risque de régression** | Changer la stratégie peut casser un flux déjà stabilisé (ex. 2B). |
| **Garde-fou** | Checklist : pour chaque bloc 1, 2, 3…9, après miroir, soit auto-enchaînement soit un seul mécanisme front (bouton/flag) ; pas de mélange. |

---

## E) PERSISTENCE / FLUSH / RELOAD

### Problème E1 — Mutations sans await persistAndFlush

| Champ | Contenu |
|-------|---------|
| **Symptôme** | Plusieurs fonctions du store appellent `this.persistCandidate(candidateId)` sans await (fire-and-forget). Si la requête se termine ou qu’une autre lecture a lieu avant la fin de l’écriture Redis, l’état peut être lu avant flush. |
| **Root cause mécanique** | persistCandidate est async mais appelé sans await dans create, addAnswer, updateIdentity, updateSession, appendUserMessage, setQuestionsForBlock, insertQuestionsAt, advanceQuestionCursor, markBlockComplete, appendMirrorValidation, updateUIState, etc. (sessionStore : nombreuses lignes avec this.persistCandidate(candidateId)). |
| **Où** | `src/store/sessionStore.ts` : L136, 156, 183, 246, 309, 329, 349, 387, 410, 483, 524, 564, 605, 645, 682, 906 ; appendMirrorValidation L483. Les seuls await persistAndFlush sont dans ensureBlock2AndStart2AIfNeeded, setBlock2AMedium, setBlock2APreference, setBlock2ACoreWork, setBlock2BAnswers, setBlock2BCompleted, setBlock2BCurrentQuestionIndex, et dans blockOrchestrator après setQuestionsForBlock, insertQuestionsAt. |
| **Repro** | Après une mutation (ex. updateUIState ou appendUserMessage), immédiatement une autre requête lit le candidat (getAsync) : si Redis write n’a pas fini, l’autre instance (ou le prochain getAsync) peut lire l’ancien état. |
| **Impact** | Tous blocs ; stale read après mutation. |
| **Fix minimal** | Règle imposée : « Toute mutation critique (blockStates, currentBlock, step, block2Answers, conversationHistory pour validation miroir, queue) doit être suivie de await persistAndFlush(candidateId) avant de considérer la mutation terminée. » Identifier les chemins critiques (bloc 2 : updateUIState 2B, setBlock2BCurrentQuestionIndex, appendMirrorValidation, insertQuestionsAt, setQuestionsForBlock ; blocs 3–10 : updateSession, updateUIState après transition). Ajouter persistAndFlush après appendMirrorValidation (au moins pour bloc 2B) et après les updateSession/updateUIState de transition. |
| **Criticité** | **P0** pour bloc 2 ; **P1** pour transitions 3–10. |
| **Risque de régression** | Augmenter le nombre d’await peut ralentir légèrement ; s’assurer de ne pas deadlock (pas de lock qui attend un flush qui attend un lock). |
| **Garde-fou** | Après chaque patch, vérifier que la prochaine lecture (même requête ou requête suivante) voit le bon état (log ou test manuel). |

---

### Problème E2 — insertQuestionsAt puis persistAndFlush : déjà correct dans blockOrchestrator

| Champ | Contenu |
|-------|---------|
| **Symptôme** | (Vérification.) insertQuestionsAt ne fait que persistCandidate (fire-and-forget). Dans blockOrchestrator, juste après insertQuestionsAt on appelle bien await persistAndFlush puis reload (L1049–1054). Donc la queue est bien flushée avant la condition miroir. |
| **Root cause mécanique** | N/A — comportement correct dans le flux 2B. |
| **Où** | `src/services/blockOrchestrator.ts` L1047–1054. `sessionStore.insertQuestionsAt` L569–605 (persistCandidate seulement). |
| **Repro** | Après insertion de questions traits/recap, la condition nextQuestionIndex >= queueLength doit voir la queue à jour ; c’est le cas grâce au persistAndFlush + reload. |
| **Impact** | Bloc 2B uniquement. |
| **Fix minimal** | Aucun. Garder la règle : après insertQuestionsAt dans tout autre contexte, appeler persistAndFlush + reload si la suite lit la queue. |
| **Criticité** | N/A. |
| **Risque de régression** | Ne pas supprimer le persistAndFlush après insertQuestionsAt. |
| **Garde-fou** | Log queueLength après reload ; vérifier cohérence avec nombre de questions attendu. |

---

### Problème E3 — setQuestionsForBlock : seul persistCandidate

| Champ | Contenu |
|-------|---------|
| **Symptôme** | setQuestionsForBlock modifie blockQueues et appelle this.persistCandidate(candidateId) (L564). Pas de await persistAndFlush. Juste après, blockOrchestrator appelle await persistAndFlush(candidateId) (L950, L963). Donc dans le flux actuel c’est OK. Mais si setQuestionsForBlock est appelé ailleurs sans persistAndFlush, risque de stale read. |
| **Root cause mécanique** | setQuestionsForBlock est utilisé uniquement dans blockOrchestrator et à chaque fois suivi de persistAndFlush (L949, L962). Aucun autre appel trouvé. |
| **Où** | `src/store/sessionStore.ts` L528–565 ; `src/services/blockOrchestrator.ts` L949, L962. |
| **Repro** | N/A. |
| **Impact** | Limité ; flux actuel correct. |
| **Fix minimal** | Documenter la règle : tout appel à setQuestionsForBlock doit être suivi de await persistAndFlush + reload si la suite lit la queue. Pas de changement de code immédiat. |
| **Criticité** | **P2**. |
| **Risque de régression** | Aucun. |
| **Garde-fou** | Grep pour tout appel à setQuestionsForBlock ; vérifier persistAndFlush après. |

---

## F) DÉTERMINISME PROMPT / QUALITÉ VARIABLE

### Problème F1 — Prouver que la variabilité vient de l’état et pas du modèle

| Champ | Contenu |
|-------|---------|
| **Symptôme** | « Qualité variable » des questions ou des miroirs : l’utilisateur peut voir des incohérences (même question deux fois, question sautée, miroir différent). Il faut distinguer : (1) état incorrect (mauvais bloc, mauvais index, mauvaise queue) vs (2) modèle (température, prompt). |
| **Root cause mécanique** | Sans logs suffisants, on ne peut pas savoir si au moment de la génération le back était bien dans le bon bloc/step/currentQuestionIndex. Les logs actuels (logRequestState) donnent currentBlock, step, block2A/2B status mais pas queueLength, answersLength, lastAssistant.kind/block, ni la « décision » prise (routedTo=2A, generatedMirror=true, transitionedTo=3, etc.). |
| **Où** | Partout où une question ou un miroir est généré : blockOrchestrator, axiomExecutor. |
| **Repro** | Reproduire un bug « qualité variable » ; regarder les logs : si currentBlock/step/currentQuestionIndex sont corrects et que la question générée est quand même incohérente, alors le problème est plutôt prompt/modèle. Si les logs montrent un mauvais index ou un mauvais bloc, alors c’est l’état. |
| **Impact** | Diagnostic des bugs ; priorisation des correctifs (état d’abord, puis prompt). |
| **Fix minimal** | Instrumentation obligatoire (voir section Instrumentation) : logs structurés avec queueLength, answersLength, lastAssistant.kind+block, decisionTaken. Ensuite, rejouer un bug et trancher. |
| **Criticité** | **P1** (diagnostic). |
| **Risque de régression** | Aucun (ajout de logs). |
| **Garde-fou** | Un bug « qualité variable » doit être rejouable à partir des logs en 1 lecture. |

---

## INSTRUMENTATION (OBLIGATOIRE)

Une seule fonction utilitaire (ou un petit module) doit logger, sur **toutes** les requêtes moteur (après chargement du candidat et avant/après décision), les champs suivants :

- **timestamp** (ISO)
- **route** : `axiom` | `axiom_stream` | `start`
- **sessionId** / **candidateId**
- **instanceId** (RAILWAY_REPLICA_ID ou INSTANCE_ID ou process.pid)
- **currentBlock**, **step**
- **blockStates** : status 2A, status 2B, currentQuestionIndex (bloc 2)
- **queueLength** (bloc courant, si applicable)
- **answersLength** (bloc courant, si applicable)
- **lastAssistant.kind**, **lastAssistant.block** (dernier message assistant dans conversationHistory)
- **decisionTaken** : chaîne ou objet (ex. `routedTo=2A`, `generatedMirror=true`, `transitionedTo=3`, `servedQuestionIndex=2`, `idempotentSkip=true`, etc.)

**But :** pouvoir rejouer un bug à partir des logs en une lecture.  
**Emplacements :** au moins un log en entrée de chaque branche qui appelle handleMessage ou executeWithAutoContinue (avec candidat rechargé) ; un log en sortie ou dans l’orchestrateur/executor avec decisionTaken.

**État actuel :** logRequestState(candidate, label) existe (server.ts L69–82) avec sessionId, currentBlock, step, block2A_status, block2B_status, instanceId. Il manque : route, queueLength, answersLength, lastAssistant.kind/block, decisionTaken. À étendre ou à compléter par un second log (orchestrator/executor) avec les champs manquants.

---

## DÉCISION FINALE ET PLAN UNIQUE DE STABILISATION

### Décision retenue (une seule stratégie)

- **Multi-instance :** on choisit **1 replica obligatoire** (pas d’autoscaling, pas de scaling manuel > 1) tant qu’aucun lock distribué Redis n’est en place. Alternative validée plus tard : lock distribué Redis (SET NX EX) + lecture Redis avant toute décision pour la session (getFromRedis ou invalidation cache) pour permettre multi-instance.
- **Routes :** même protection sur POST /axiom et POST /axiom/stream pour le bloc 2 (mutex + reload avant handleMessage). Single entrypoint documenté : « Toute requête qui lit/écrit state critique : lock session si bloc 2, reload candidat, décision, persistAndFlush si mutation, release. »
- **Transitions miroir :** une seule stratégie pour tous les blocs (1, 2B, 3–9) : soit **auto-enchaînement backend** après miroir (le back enchaîne avec la première question du bloc suivant), soit **validation explicite** (message utilisateur requis ; front peut proposer un bouton « Continuer » générique avec flag dédié par réponse). Le plan n’implémente pas le changement produit ; il impose de **documenter** la stratégie choisie et de l’appliquer de façon cohérente (pas de spécial 2B vs 3).

### Ordre de patch (à exécuter dans cet ordre)

1. **P0 — Multi-instance + routes + locks**
   - Config Railway : 1 replica, pas d’autoscaling (ou alors implémenter lock Redis + getFromRedis et garder 1 replica jusqu’à validation).
   - POST /axiom : appliquer le même mutex (acquireBlock2Lock) + reload (getAsync) avant handleMessage pour la branche BLOC_02 / currentBlock 2 (alignement avec /axiom/stream).
   - Vérifier que toutes les branches qui touchent au bloc 2 passent par ce mutex + reload.

2. **P0 — Persistance**
   - Après appendMirrorValidation : await persistAndFlush(candidateId) (au moins pour le flux 2B utilisé par blockOrchestrator).
   - Après updateSession / updateUIState de transition (2→3, 3→4, …) dans blockOrchestrator et axiomExecutor : s’assurer que persistAndFlush est appelé avant de retourner la réponse (ou que le flux existant le fait déjà ; auditer et compléter si besoin).

3. **P1 — Instrumentation**
   - Étendre logRequestState (ou ajouter un log dédié) avec : route, queueLength, answersLength, lastAssistant.kind, lastAssistant.block, decisionTaken.
   - Appeler ce log à chaque entrée moteur (après reload) et, si possible, après décision (orchestrator/executor).

4. **P1 — Transitions miroir**
   - Documenter la stratégie retenue (auto-enchaînement vs validation explicite) et vérifier que les blocs 1, 2B, 3–9 sont alignés. Aucun patch produit dans ce ticket si la stratégie n’est pas changée ; sinon, implémenter la stratégie choisie de façon uniforme.

5. **P2 — Idempotence / requestId**
   - Optionnel pour ce cycle : introduire requestId (ou dedupe key) côté front et back pour ignorer les doublons de message ; à faire après stabilisation P0/P1.

6. **UI / Front**
   - Vérifier que isWaiting et submitInProgress restent en place ; pas de régression. Checklist manuelle (voir CHECKLIST_STABILITE_E2E.md) pour refresh, double tap, back/forward, latence.

### Règle de non-régression

- Avant chaque déploiement de patch : exécuter la checklist manuelle sur au moins un parcours bloc 1→10 (idéalement sur un device + desktop).
- Toute modification de lock ou de persistance doit être vérifiée par un scénario « deux requêtes rapides » (ou deux instances si on repasse en multi-instance plus tard).

---

## Résumé des problèmes par criticité

| Id | Problème | Criticité |
|----|----------|-----------|
| A1 | Mutex bloc 2 non distribué | P0 (si replicas > 1) |
| A2 | getAsync priorité cache → stale read | P0 (multi-instance) |
| A3 | Railway replicas / sticky non imposés | P0 |
| B1 | POST /axiom bloc 2 sans mutex | P1 |
| B2 | Single entrypoint non formalisé | P2 |
| C1 | Double submit / retry (blocs 3–10) | P2 |
| C2 | Refresh / back-forward stale | P1 |
| D1 | kind='mirror' 3–9 | Résolu |
| D2 | Stratégie unique validation miroir | P1 |
| E1 | Mutations sans persistAndFlush | P0/P1 |
| E2 | insertQuestionsAt + flush | OK |
| E3 | setQuestionsForBlock | P2 |
| F1 | Logs pour prouver état vs modèle | P1 |

---

*Document généré pour audit one-shot ; aucun patch appliqué avant validation du plan.*
