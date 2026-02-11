# Audit stabilité globale — Multi-instance / Redis / Routage

**Date :** 2025-02-10  
**Objectif :** Répondre point par point (Railway, mutex bloc 2, Redis, server.ts, SSE, logs) et documenter les constats.

---

## 1. Railway (replicas / scaling)

| Question | Réponse |
|----------|---------|
| Combien de replicas tournent ? | **Non déterminable depuis le code.** Aucun fichier `railway.json`, `Dockerfile` ou config de déploiement dans le dépôt. |
| 1 seule instance ou plusieurs ? | **À vérifier dans le dashboard Railway** (Settings → Scaling / Replicas). |
| Scaling automatique actif ? | **À confirmer dans Railway.** Si "Auto-scale" ou "Min/Max replicas" > 1, alors plusieurs instances peuvent tourner. |

**Recommandation :** Dans Railway, vérifier **Settings → Replicas** (ou Scaling) et s’assurer que le nombre de replicas est fixé à **1** si l’on souhaite éviter tout problème multi-instance avec le mutex bloc 2 in-memory.

---

## 2. Mutex bloc 2

| Question | Réponse |
|----------|---------|
| Purement in-memory ? | **Oui.** `block2LockMap = new Map<string, Promise<void>>()` dans `server.ts` (L48). Aucune dépendance Redis ou autre store externe. |
| Distribué ? | **Non.** Le mutex est local au processus Node. Chaque instance a sa propre `Map`. |
| Si 2 instances Railway tournent, le mutex protège-il les deux ? | **Non.** Chaque instance a son propre mutex. Deux requêtes pour la même session sur deux instances différentes peuvent exécuter `handleMessage` en parallèle (une par instance). |

**Code concerné :** `src/server.ts` L45–60 (`block2LockMap`, `acquireBlock2Lock`).  
**Conclusion :** En multi-instance, le mutex bloc 2 ne protège qu’**une seule instance**. Pour une protection cross-instance, il faudrait un mutex distribué (ex. Redis `SET key NX EX` ou équivalent).

---

## 3. Redis

| Question | Réponse |
|----------|---------|
| `persistAndFlush` écrit bien en Redis ? | **Oui.** `persistAndFlush` appelle `await this.persistCandidate(candidateId)` puis `saveToFile()`. `persistCandidate` fait `await redisClient.set('axiom:candidate:' + candidateId, JSON.stringify(candidate))` si `redisClient` est défini. |
| `getAsync` lit bien depuis Redis et non depuis cache mémoire ? | **Pas uniquement.** `getAsync` lit **d’abord** depuis la Map mémoire (`if (this.candidates.has(candidateId)) return this.candidates.get(candidateId)`). **Si le candidat est déjà en mémoire, Redis n’est pas lu.** Si absent de la Map, alors lecture Redis puis mise en cache en mémoire. |
| Race entre `persistCandidate` et `persistAndFlush` ? | **Possible.** `persistCandidate` est souvent appelé sans `await` (fire-and-forget). `persistAndFlush` fait `await persistCandidate` + `saveToFile()`. Sur **une** instance : pas de lock entre les deux ; deux écritures concurrentes Redis pour le même `candidateId` → dernière écriture gagne. En **multi-instance** : deux instances peuvent charger le même candidat depuis Redis, modifier chacune, puis écrire → last-write-wins, pas de sérialisation. |

**Code concerné :** `src/store/sessionStore.ts` L45–73 (`persistCandidate`, `persistAndFlush`), L192–212 (`getAsync`).

---

## 4. server.ts — Reload et mutex

| Question | Réponse |
|----------|---------|
| Reload via `getAsync` avant `handleMessage` (stream bloc 2) ? | **Oui.** Dans la route **stream** (`/axiom/stream`), pour le bloc 2 (L1543) : on fait `acquireBlock2Lock`, puis `candidateBloc2 = await candidateStore.getAsync(sessionIdForBlock2)` (L1548, L1567, L1609), puis `orchestrator.handleMessage(candidateBloc2, ...)` (L1582). Le reload est bien fait **avant** `handleMessage`. |
| Une branche appelle-t-elle `handleMessage` (bloc 2) sans mutex ? | **Oui.** La route **non-stream** **POST /axiom** (JSON) : pour `candidate.session.ui?.step === BLOC_02 && candidate.session.currentBlock === 2` (L805), on appelle `orchestrator.handleMessage(candidate, userMessageText, null)` (L831) **sans** `acquireBlock2Lock`. Donc en multi-instance, la route JSON bloc 2 n’est pas protégée par le mutex (seul le **stream** bloc 2 l’est). |

**Recommandation :** Si le front n’utilise que le stream, le risque est limité au flux stream. Si une autre cliente utilise POST /axiom en JSON pour le bloc 2, envisager d’appliquer le même mutex (ou un mutex distribué) sur cette branche.

---

## 5. SSE — Double requête / double submit

| Question | Réponse |
|----------|---------|
| Le front envoie-t-il 2 requêtes POST avant réception de "done" ? | **Non, par construction.** `callAxiom` vérifie `if (isWaiting || !sessionId) { ... return; }` (L274–276) puis met `isWaiting = true` (L279). `isWaiting` n’est remis à `false` que dans `finally` après la fin du flux (L486). Tant que "done" n’a pas été traité et le `finally` exécuté, une nouvelle tentative d’appel est ignorée. |
| `isWaiting` et `submitInProgress` empêchent-ils le double submit ? | **Oui.** (1) Au submit du formulaire : `if (submitInProgress) return;` puis `submitInProgress = true` (L868–872). (2) Avant d’appeler l’API : `if (!message || isWaiting || !sessionId)` → on remet `submitInProgress = false` et on return (L876–879). Donc un seul submit en cours côté formulaire, et un seul appel API en attente côté `callAxiom`. |

**Code concerné :** `ui-test/app.js` L12, L274–279, L486, L861–872, L876–879.

---

## 6. Logs par requête (implémenté)

**Demande :** À chaque requête, logger : `sessionId`, `currentBlock`, `step`, `block2A.status`, `block2B.status`, `instanceId`.

**Implémentation :**

- **instanceId :** `process.pid` ou `process.env.RAILWAY_REPLICA_ID` / `process.env.INSTANCE_ID` si définis (pour distinguer les instances sur Railway).
- **Emplacements :**
  - **POST /axiom** (non-stream) : après chargement du candidat et initialisation UI (une fois le candidat stable).
  - **POST /axiom/stream** : après chargement/création du candidat et initialisation UI (avant le routage par event/step).
  - **Bloc 2 stream** : optionnellement une deuxième ligne après reload sous mutex (état juste avant `handleMessage`).

Ainsi on peut vérifier dans les logs si des requêtes pour la même session arrivent sur des `instanceId` différents (multi-instance).

---

## Résumé des risques

| Risque | Niveau | Mitigation |
|--------|--------|------------|
| 2 instances Railway sans mutex distribué | Élevé pour bloc 2 | 1 replica ou mutex Redis. |
| Route POST /axiom (JSON) bloc 2 sans mutex | Moyen si utilisée | Aligner sur le stream : mutex (ou même lock) avant `handleMessage` bloc 2. |
| getAsync retourne le cache mémoire | Moyen | Comportement voulu (performance). En multi-instance, le premier getAsync après arrivée sur l’instance charge depuis Redis. |
| Race persistCandidate / persistAndFlush | Faible (single instance) | Acceptable. En multi-instance, last-write-wins déjà identifié. |

---

## Fichiers modifiés pour les logs

- `src/server.ts` : ajout d’une fonction `logRequestState(candidate, label?)` et appels après chargement du candidat dans les deux routes (POST /axiom et POST /axiom/stream), plus un appel dans la branche bloc 2 stream après reload.
