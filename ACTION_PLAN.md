# 📋 PLAN D'ACTION — CORRECTIFS AXIOM / REVELIOM

**Date** : 2025-01-27  
**Basé sur** : AUDIT_FULL_COMPLIANCE_REVELIOM.md  
**Objectif** : Plan d'action concret, découpé en lots, avec risques, tests et critères GO/NO-GO

---

## 🎯 VERDICT AUDIT

**Statut global** : 🟡 **GO CONDITIONNEL**

**Blocages identifiés** :
1. ❌ Validation structurelle profil final manquante (GO-blocker qualité)
2. ❌ Validation structurelle matching manquante (GO-blocker qualité)
3. ❌ Réaffichage matching après refresh (GO-blocker UX)
4. ⚠️ Ton mentor "froid" vs attendu (écart qualitatif majeur)
5. ⚠️ Idempotence serveur incomplète (sécurité)

---

## LOT 1 — VALIDATORS PROFIL FINAL + MATCHING (PRIORITÉ HAUTE)

### Objectif

Ajouter des validators structurels pour garantir la conformité du profil final et du matching aux formats attendus.

### Scope exact

**Fichier 1** : `src/services/validators.ts` (créer ou étendre)

**Ajouter fonction `validateFinalProfile()`** :
- Vérifier présence 7 sections obligatoires (emoji + nom)
- Vérifier ordre sections (section i avant section i+1)
- Vérifier texte fixe obligatoire (2 textes)
- Vérifier absence question en fin de profil
- Retourner `ValidationResult { valid: boolean, errors: string[] }`

**Ajouter fonction `validateMatching()`** :
- Vérifier bandeau exact : `🟢 / 🔵 / 🟠 MATCHING AXIOM — [ISSUE]`
- Vérifier sections obligatoires (Lecture de compatibilité, 3 sous-sections)
- Vérifier sections conditionnelles selon ISSUE (PROJECTION CONCRÈTE, LE CADRE si 🟢 ou 🔵)
- Retourner `ValidationResult { valid: boolean, errors: string[] }`

**Fichier 2** : `src/engine/axiomExecutor.ts`

**Point d'insertion profil final** (ligne ~1862) :
```typescript
// Après setFinalProfileText()
if (blocNumber === 10 && !expectsAnswer) {
  const validation = validateFinalProfile(aiText || '');
  if (!validation.valid) {
    console.warn('[AXIOM_EXECUTOR] Profil final non conforme:', validation.errors);
    // Retry avec prompt renforcé (1 seule fois)
    // ... (logique retry)
  }
}
```

**Point d'insertion matching** (ligne ~2073, avant transition DONE_MATCHING) :
```typescript
// Avant currentState = DONE_MATCHING
const validation = validateMatching(aiText || '');
if (!validation.valid) {
  console.warn('[AXIOM_EXECUTOR] Matching non conforme:', validation.errors);
  // Retry avec prompt renforcé (1 seule fois)
  // ... (logique retry)
}
```

### Risques

- **Faible** : Ajout logique de validation, pas de modification prompts
- **Mitigation** : Retry limité à 1 fois, fallback sur réponse non validée si retry échoue

### Temps estimé

**6-8 heures** :
- 2h : Création `validateFinalProfile()`
- 2h : Création `validateMatching()`
- 2h : Intégration dans `axiomExecutor.ts` + retry
- 2h : Tests

### Tests obligatoires

1. **Profil final avec toutes sections** → Validation OK
2. **Profil final avec section manquante** → Validation KO + retry
3. **Profil final avec ordre incorrect** → Validation KO + retry
4. **Profil final sans texte fixe** → Validation KO + retry
5. **Profil final avec question** → Validation KO + retry
6. **Matching avec bandeau correct** → Validation OK
7. **Matching avec structure incorrecte** → Validation KO + retry
8. **Matching 🟢 sans sections conditionnelles** → Validation KO + retry
9. **Matching 🟠 avec sections conditionnelles** → Validation KO + retry

### Critère GO/NO-GO

- ✅ Validators fonctionnels (détection erreurs)
- ✅ Retry opérationnel (1 seule fois)
- ✅ Logs de validation pour monitoring
- ✅ Aucune régression (profil/matching toujours générés même si validation KO)

**GO si** : Validators fonctionnels + retry opérationnel + tests passés

---

## LOT 2 — RENFORCEMENT IDEMPOTENCE SERVEUR (PRIORITÉ MOYENNE)

### Objectif

Renforcer l'idempotence des endpoints critiques (START_BLOC_1, START_MATCHING) pour éviter les race conditions et doubles générations.

### Scope exact

**Fichier 1** : `src/services/blockOrchestrator.ts`

**Point d'insertion START_BLOC_1** (ligne ~196) :
```typescript
// Ajouter verrou transactionnel
if (event === 'START_BLOC_1') {
  // Vérifier si génération en cours (lock)
  if (candidate.session.ui?.step === BLOC_01 && queue && queue.questions.length > 0) {
    // Déjà généré → servir depuis queue
    return this.serveNextQuestion(currentCandidate.candidateId, blockNumber);
  }
  
  // Vérifier si génération en cours (race condition)
  // ... (logique verrou transactionnel)
  
  // Générer questions
  // ...
}
```

**Fichier 2** : `src/engine/axiomExecutor.ts`

**Point d'insertion START_MATCHING** (ligne ~1996) :
```typescript
if (currentState === STEP_99_MATCH_READY) {
  // Vérifier si matching déjà généré
  if (candidate.matchingResult) {
    // Matching déjà généré → retourner résultat existant
    return {
      response: candidate.matchingResult.content || '',
      step: DONE_MATCHING,
      // ...
    };
  }
  
  // Générer matching
  // ...
}
```

### Risques

- **Faible** : Ajout verrous, pas de modification logique métier
- **Mitigation** : Verrous avec timeout, logs pour monitoring

### Temps estimé

**3-4 heures** :
- 1h : Verrou transactionnel START_BLOC_1
- 1h : Vérification matching déjà généré
- 1h : Logs monitoring
- 1h : Tests

### Tests obligatoires

1. **Double START_BLOC_1 simultané** → Une seule génération
2. **Double START_MATCHING après DONE_MATCHING** → Pas de re-génération
3. **Appels concurrents (race condition)** → Pas de double génération

### Critère GO/NO-GO

- ✅ Verrous transactionnels fonctionnels
- ✅ Pas de double génération dans tests
- ✅ Logs de monitoring idempotence

**GO si** : Verrous fonctionnels + tests passés

---

## LOT 3 — AMÉLIORATION TON MENTOR MIROIRS (PRIORITÉ MOYENNE)

### Objectif

Améliorer le ton "mentor chaleureux" des miroirs sans modifier les prompts (orchestration uniquement).

### Scope exact

**Fichier 1** : `src/services/openaiClient.ts`

**Modification température pour miroirs** :
```typescript
// Créer fonction callOpenAIForMirror() avec température 0.8
export async function callOpenAIForMirror(params: {
  messages: Array<{ role: string; content: string }>;
}): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: params.messages.map((msg) => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    })),
    temperature: 0.8, // Plus élevé pour créativité/ton
  });
  // ...
}
```

**Fichier 2** : `src/services/blockOrchestrator.ts` (génération miroir BLOC 1)

**Point d'insertion** (ligne ~520) :
```typescript
// Utiliser callOpenAIForMirror() au lieu de callOpenAI()
const completion = await callOpenAIForMirror({
  messages: [
    // ...
  ],
});
```

**Fichier 3** : `src/engine/axiomExecutor.ts` (génération miroir BLOCS 3-9)

**Point d'insertion** (ligne ~1570) :
```typescript
// Utiliser callOpenAIForMirror() au lieu de callOpenAI()
const completion = await callOpenAIForMirror({
  messages: [
    // ...
  ],
});
```

**Fichier 4** : `src/services/blockOrchestrator.ts` (génération miroir BLOC 2B)

**Point d'insertion** (ligne ~1150) :
```typescript
// Utiliser callOpenAIForMirror() au lieu de callOpenAI()
const completion = await callOpenAIForMirror({
  messages: [
    // ...
  ],
});
```

**Fichier 5** : `src/services/blockOrchestrator.ts` (génération miroir BLOC 1)

**Réinjection explicite validations miroir** (ligne ~480) :
```typescript
// Ajouter validations miroir précédentes dans contexte
const mirrorValidations = conversationHistory
  .filter(m => m.kind === 'mirror_validation' && m.block < blockNumber)
  .map(m => `Validation BLOC ${m.block}: ${m.content}`)
  .join('\n');

// Injecter dans prompt
const mirrorContext = `VALIDATIONS MIROIRS PRÉCÉDENTS:\n${mirrorValidations}\n\n`;
```

### Risques

- **Moyen** : Température 0.8 peut affecter cohérence (mais acceptable pour miroirs)
- **Mitigation** : Température uniquement pour miroirs, pas pour questions

### Temps estimé

**4-6 heures** :
- 1h : Création `callOpenAIForMirror()`
- 2h : Remplacement dans 3 endroits (BLOC 1, 2B, 3-9)
- 1h : Réinjection validations miroir
- 1-2h : Tests manuels (vérifier ton plus chaleureux)

### Tests obligatoires

1. **Génération miroir BLOC 1 avec température 0.8** → Vérifier ton plus chaleureux
2. **Génération miroir BLOC 2B avec température 0.8** → Vérifier ton plus chaleureux
3. **Génération miroir BLOCS 3-9 avec température 0.8** → Vérifier ton plus chaleureux
4. **Validation miroir réinjectée dans miroir suivant** → Vérifier impact

### Critère GO/NO-GO

- ✅ Ton mentor amélioré (test manuel)
- ✅ Aucune régression format (sections REVELIOM toujours respectées)
- ✅ Température uniquement pour miroirs (pas pour questions)

**GO si** : Ton mentor amélioré + tests format passés

---

## LOT 4 — RÉAFFICHAGE MATCHING APRÈS REFRESH (PRIORITÉ HAUTE)

### Objectif

Garantir que le matching est réaffiché après refresh (actuellement perdu car `response: ''`).

### Scope exact

**Fichier 1** : `src/engine/axiomExecutor.ts`

**Point d'insertion DONE_MATCHING** (ligne ~2102) :
```typescript
if (currentState === DONE_MATCHING) {
  // Si pas de userMessage et pas d'event → réaffichage matching
  if (!userMessage && !event) {
    // Récupérer matching depuis conversationHistory
    const conversationHistory = candidate.conversationHistory || [];
    const matchingMessage = [...conversationHistory]
      .reverse()
      .find(m => m.role === 'assistant' && m.kind === 'matching');
    
    if (matchingMessage) {
      return {
        response: matchingMessage.content,
        step: currentState,
        lastQuestion: null,
        expectsAnswer: false,
        autoContinue: false,
      };
    }
  }
  
  // Sinon, retourner vide (comportement actuel)
  return {
    response: '',
    step: currentState,
    // ...
  };
}
```

### Risques

- **Faible** : Ajout logique de réaffichage, pas de modification prompts

### Temps estimé

**2-3 heures** :
- 1h : Logique réaffichage matching
- 1h : Tests refresh
- 1h : Vérification edge-cases

### Tests obligatoires

1. **Générer matching** → Matching affiché
2. **Refresh la page** → Matching réaffiché
3. **Refresh après clic FIN** → Matching toujours réaffiché

### Critère GO/NO-GO

- ✅ Matching réaffiché après refresh
- ✅ Aucune régression (matching toujours généré)

**GO si** : Matching réaffiché + tests passés

---

## LOT 5 — STREAMING SSE (PRIORITÉ BASSE)

### Objectif

Implémenter le streaming SSE pour miroirs, profil final et matching (actuellement route coquille).

### Scope exact

**Fichier 1** : `src/server.ts`

**Modification route /axiom/stream** (ligne ~943) :
```typescript
app.post("/axiom/stream", async (req: Request, res: Response) => {
  // Headers SSE (déjà présents)
  
  // Déterminer état final AVANT streaming
  const result = await executeAxiom({ candidate, userMessage, event }, { stream: true });
  
  // Envoyer message state figé
  res.write(`event: state\n`);
  res.write(`data: ${JSON.stringify({ step: result.step, expectsAnswer: result.expectsAnswer })}\n\n`);
  
  // Streamer contenu
  const messageId = `${candidate.candidateId}-${result.step}-${Date.now()}`;
  for await (const chunk of result.stream) {
    res.write(`id: ${messageId}\n`);
    res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
  }
  
  res.end();
});
```

**Fichier 2** : `src/engine/axiomExecutor.ts`

**Modification executeAxiom()** :
```typescript
export async function executeAxiom(
  input: ExecuteAxiomInput,
  options?: { stream?: boolean }
): Promise<ExecuteAxiomResult | { stream: AsyncGenerator<string> }> {
  // Si stream === true et contenu streamable (miroir, profil, matching)
  if (options?.stream && isStreamableContent(currentState)) {
    // Utiliser callOpenAIStream()
    const stream = callOpenAIStream({ messages: [...] });
    return { stream };
  }
  // Sinon, comportement normal
}
```

**Fichier 3** : `ui-test/app.js`

**Ajout consommation SSE** :
```javascript
// Fonction callAxiomStream()
async function callAxiomStream(message, event = null) {
  const eventSource = new EventSource(`${API_BASE_URL}/axiom/stream`, {
    method: 'POST',
    body: JSON.stringify({ ... }),
  });
  
  eventSource.addEventListener('state', (e) => {
    const data = JSON.parse(e.data);
    // Figer état
  });
  
  eventSource.addEventListener('message', (e) => {
    const data = JSON.parse(e.data);
    // Afficher chunk progressivement
  });
}
```

### Risques

- **Élevé** : Modification architecture, complexité
- **Mitigation** : Implémentation progressive, tests exhaustifs

### Temps estimé

**20-30 heures** :
- 8h : Backend streaming (route + executeAxiom)
- 8h : Frontend consommation SSE
- 4h : Déduplication chunks
- 6h : Tests complets

### Tests obligatoires

1. **Streaming miroir BLOC 3-9** → Chunks reçus, affichage progressif
2. **Streaming profil final** → Chunks reçus, affichage progressif
3. **Streaming matching** → Chunks reçus, affichage progressif
4. **Déduplication chunks** → Pas de doublons
5. **État figé avant chunks** → Step/expectsAnswer corrects

### Critère GO/NO-GO

- ✅ Streaming fonctionnel pour miroirs + profil + matching
- ✅ Déduplication chunks opérationnelle
- ✅ Aucune régression (comportement normal si streaming désactivé)

**GO si** : Streaming fonctionnel + tests passés

---

## LOT 6 — NETTOYAGE TECH DEBT (PRIORITÉ BASSE)

### Objectif

Nettoyer la dette technique identifiée (mapping, cohérence currentBlock/step).

### Scope exact

**Fichier 1** : `src/server.ts`

**Vérification mapping step → state** :
- Unifier tous les mappings via `mapStepToState()` (déjà fait partiellement)
- Vérifier cohérence partout

**Fichier 2** : `src/engine/axiomExecutor.ts`

**Vérification cohérence currentBlock vs ui.step** :
- S'assurer que `currentBlock` et `ui.step` sont toujours cohérents
- Ajouter logs si incohérence détectée

**Fichier 3** : Recherche `PREAMBULE_DONE`

**Suppression si inutilisé** :
- Rechercher toutes occurrences `PREAMBULE_DONE`
- Supprimer si non utilisé

### Risques

- **Faible** : Nettoyage, pas de modification fonctionnelle
- **Mitigation** : Tests de régression

### Temps estimé

**2-3 heures** :
- 1h : Vérification mapping
- 1h : Vérification cohérence currentBlock/step
- 1h : Suppression code mort

### Tests obligatoires

1. **Tests de régression** : Aucune régression détectée

### Critère GO/NO-GO

- ✅ Aucune régression détectée
- ✅ Code mort supprimé

**GO si** : Tests régression passés

---

## ORDRE D'EXÉCUTION RECOMMANDÉ

1. **LOT 1** : Validators (GO-blocker qualité)
2. **LOT 4** : Réaffichage matching (GO-blocker UX)
3. **LOT 2** : Idempotence (sécurité)
4. **LOT 3** : Ton mentor (qualité)
5. **LOT 5** : Streaming (feature)
6. **LOT 6** : Nettoyage (maintenance)

---

## RÉSUMÉ PAR PRIORITÉ

### 🔴 GO-BLOCKER (avant production)
- **LOT 1** : Validators profil + matching
- **LOT 4** : Réaffichage matching après refresh

### 🟡 WARN (à corriger rapidement)
- **LOT 2** : Renforcement idempotence
- **LOT 3** : Amélioration ton mentor

### 🟢 OPTIONNEL (amélioration continue)
- **LOT 5** : Streaming SSE
- **LOT 6** : Nettoyage tech debt

---

**FIN DU PLAN D'ACTION**
