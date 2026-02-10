# Audit technique — BLOC 1 (latence anormale)

**Constat** : Les questions du BLOC 1 mettent encore ~6–7 s à s’afficher alors qu’elles sont statiques (0 token attendu).

---

## 1) Cause racine (prouvée par le code)

Le flux réel exécuté n’est **pas** celui de l’executor (où `getStaticQuestion(1, 0)` et le return immédiat sont bien présents).

### Chemin réel côté serveur

- **POST /axiom** (l.653-656) :  
  `if (event === "START_BLOC_1") { const result = await orchestrator.handleMessage(candidate, null, "START_BLOC_1"); ... }`  
  → **START_BLOC_1 est envoyé à l’orchestrator, pas à executeWithAutoContinue.**

- **POST /axiom/stream** (l.1370-1373) :  
  `if (event === "START_BLOC_1") { const result = await orchestrator.handleMessage(candidate, null, "START_BLOC_1", onChunk, onUx); ... }`  
  → Idem : **orchestrator uniquement.**

Donc **aucun appel à l’executor** pour START_BLOC_1. Le return précoce avec `q0` dans l’executor n’est jamais exécuté.

### Chemin dans l’orchestrator

**Fichier** : `src/services/blockOrchestrator.ts`  
**Lignes** : 200-215.

```ts
if (event === 'START_BLOC_1') {
  if (queue && queue.questions.length > 0) {
    return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
  }
  // Générer toutes les questions BLOC 1 (génération interne, pas affichage)
  console.log('[ORCHESTRATOR] generate questions bloc 1 (API)');
  const questions = await this.generateQuestionsForBlock1(currentCandidate);  // ← APPEL LLM
  candidateStore.setQuestionsForBlock(currentCandidate.candidateId, blockNumber, questions);
  return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
}
```

Quand la queue est vide (premier clic sur « Je commence »), le code appelle **`generateQuestionsForBlock1(currentCandidate)`**, qui fait un appel LLM (voir l.374+). D’où la latence ~6–7 s.

---

## 2) Points audités (réponse courte)

| Point | Statut | Preuve |
|-------|--------|--------|
| 1) START_BLOC_1 → return précoce executor | **Hors flux** | Le serveur ne appelle pas l’executor pour START_BLOC_1 ; il appelle l’orchestrator. Donc le return avec `q0` dans l’executor n’est jamais pris. |
| 2) Écrasement de aiText | N/A | Le flux BLOC 1 utilisé est l’orchestrator, pas la branche executor qui pose aiText. |
| 3) Chemin runtime | **Orchestrator** | server.ts 653-656 (POST /axiom) et 1370-1373 (POST /axiom/stream) → orchestrator.handleMessage(..., "START_BLOC_1") → generateQuestionsForBlock1() → LLM. |
| 4) Branche parallèle | **Oui** | La branche “event START_BLOC_1” du serveur est dédiée et envoie systématiquement à l’orchestrator ; elle ne passe jamais par executeWithAutoContinue. |

---

## 3) Correction minimale appliquée

**Fichier** : `src/services/blockOrchestrator.ts`

- **Import** : ajout de `STATIC_QUESTIONS` depuis `../engine/staticQuestions.js`.
- **Lors de `event === 'START_BLOC_1'` et queue vide** : au lieu d’appeler `generateQuestionsForBlock1(currentCandidate)` (LLM), utiliser le catalogue statique `STATIC_QUESTIONS[1]`, appeler `candidateStore.setQuestionsForBlock(..., 1, STATIC_QUESTIONS[1])`, puis `return this.serveNextQuestion(...)` comme avant.

Résultat : plus d’appel LLM au démarrage du BLOC 1 ; la première question (et les suivantes) viennent du catalogue, affichage quasi instantané.

---

## 4) Critère de validation

- BLOC 1 s’affiche instantanément après déploiement.
- Aucun appel OpenAI pour la génération des questions BLOC 1 (les logs “[ORCHESTRATOR] generate questions bloc 1 (API)” ne doivent plus déclencher d’appel LLM).
- Le flux s’arrête après avoir servi la question statique (plus d’attente de `generateQuestionsForBlock1`).

---

*Audit par lecture de code : server.ts (routes), blockOrchestrator.ts (START_BLOC_1).*
