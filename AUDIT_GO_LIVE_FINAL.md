# AUDIT GO LIVE — AXIOM (FINAL)

**Date** : 2025-02-10  
**Objectif** : Certification binaire OK/KO de bout en bout, 0 surprise en prod.  
**Méthode** : Lecture de code, traçage des chemins, preuves par extraits (fichier:ligne), pas de parcours complets sauf si indispensable.

---

## 1) CARTOGRAPHIE DU PARCOURS CANDIDAT

### 1.1 Étapes et state machine

| Étape | step (UI) | state (réponse) | currentBlock | expectsAnswer | autoContinue | Trigger |
|-------|-----------|-----------------|--------------|---------------|-------------|---------|
| Identité | STEP_01_IDENTITY | identity | null | true | false | /start ou POST /axiom avec identité manquante |
| Choix ton | STEP_02_TONE | tone_choice / preamble | 0 | true | false | Réponse identité validée → executeAxiom enchaîne |
| Préambule | STEP_03_PREAMBULE | preambule | 0 | false | true | Réponse tone → auto-enchaîne |
| Attente bouton | STEP_03_BLOC1 | wait_start_button | 0 | false | false | Préambule affiché |
| Bloc 1 | BLOC_01 | collecting | 1 | true/false | false | event START_BLOC_1 puis questions/miroir |
| Bloc 2A | BLOC_02 | collecting | 2 | true | false | Fin bloc 1 → orchestrator BLOC 2A |
| Bloc 2B | BLOC_02 | collecting | 2 | true/false | false | 3 réponses 2A → handleBlock2B, miroir 2B |
| Blocs 3–9 | BLOC_03..BLOC_09 | collecting | 3..9 | true/false | false | axiomExecutor blocStates, miroirs REVELIOM |
| Synthèse | BLOC_10 | collecting | 10 | false | - | Fin bloc 10 → synthèse generateMirrorWithNewArchitecture(., 'synthesis') |
| Match ready | STEP_99_MATCH_READY | match_ready | - | false | false | Synthèse terminée, nextState = STEP_99_MATCH_READY |
| Matching | STEP_99_MATCHING → DONE_MATCHING | matching | - | false | false | event START_MATCHING (bouton) |
| Fin | DONE_MATCHING | matching | - | false | false | Bouton FIN → Tally |

**Source** : `src/engine/axiomExecutor.ts` (deriveStateFromConversationHistory, blocStates, STEP_99_*, DONE_MATCHING), `src/server.ts` (mapStepToState).

### 1.2 Routes et propagation event

- **POST /axiom** (Express) : `src/server.ts` ~319. Body : tenantId, posteId, sessionId, message, event. event transmis à `executeWithAutoContinue(candidate, userMessageText, event || null)` (l. ~885). Aucune branche dédiée `event === 'START_MATCHING'` : le chemin générique appelle bien `executeWithAutoContinue(..., event)`.
- **POST /axiom/stream** : idem, même body, même `event` passé à `executeWithAutoContinue(..., onChunk, onUx)` (l. ~1615) et à `orchestrator.handleMessage(..., onChunk, onUx)` dans les branches bloc 1 / 2.
- **Bouton Matching** : `ui-test/app.js` l.493 `await callAxiom(null, 'START_MATCHING')` → body.event = 'START_MATCHING'. Clic désactive le bouton (l.492).

**Preuve event START_MATCHING** : server ne filtre pas event ; executeWithAutoContinue reçoit event ; axiomExecutor STEP_99_MATCH_READY (l.2256) : si `!userMessage && !event` retourne CTA, sinon currentState = STEP_99_MATCHING et return await executeAxiom(candidate, null) — donc même requête exécute deux fois executeAxiom (une fois transition, une fois génération matching). **OK (prouvé par code).**

### 1.3 Transitions critiques

- **B1 → B2A** : blockOrchestrator BLOC 1, validation miroir → updateSession currentBlock 2, updateUIState step BLOC_02 ; handleMessage pour block 2 appelle handleBlock2A. **Preuve** : `blockOrchestrator.ts` ~256–260, ~181.
- **B2A → B2B** : handleBlock2A, quand updatedAnsweredCount === 3 → return this.handleBlock2B(currentCandidate, null, null, onChunk, onUx). **Preuve** : `blockOrchestrator.ts` ~693–695.

---

## 2) TABLEAU CERTIFICATION

| # | Point | Statut | Preuve / remarque |
|---|--------|--------|--------------------|
| **A.1** | Tous les blocs (identity → 1 → 2A → 2B → 3..10) sans bug UI / step incohérent / réponse vide / double / boucle | **INCONNU** | Non prouvable sans run E2E. Proposition : 1 run E2E tronqué (identity + tone + préambule + START_BLOC_1 + 1 question bloc 1 + 1 réponse) avec logs step/state/currentBlock à chaque réponse ; si cohérent → étendre à 2A→2B puis 3→4. |
| **A.2** | /axiom et /axiom/stream payload cohérents (SSE token/done/error, JSON /axiom) | **OK** | SSE : writeEvent(null, { type: "token", content }) pour tokens, writeEvent("done", { type: "done", ...payload }) en fin. /axiom : res.status(200).json({ sessionId, currentBlock, state, response, step, expectsAnswer, autoContinue }). Même payload métier. `server.ts` 974–979 (onChunk), 1652–1656 (done stream), 918–926 (json /axiom). |
| **A.3** | Streaming effectif (questions, miroirs 1/2B/3–9, synthèse, matching) + thinking-loop stop au 1er token + pas d’injection UX dans response | **OK** | onChunk branché partout (executeWithAutoContinue, orchestrator.handleMessage). streamedText accumule uniquement onChunk ; onUx non ajouté à streamedText. Front : onToken → hasReceivedFirstToken = true, stopThinkingLoop(). `server.ts` 974–979, 981–985 ; `ui-test/app.js` 329–332. |
| **B.4** | Synthèse BLOC 10 : format défini et validé | **OK** | Format : `mentorStyleRenderer.ts` getFormatInstructions('synthesis') l.509–526 (structure, sections, ton, interdictions). Validation : validateMentorStyle(mentorText) après rendu (l.195, 351). Pas de regex dédiée “synthèse” ; validation = style mentor (déclaratif / expérientiel). |
| **B.5** | Matching : bon prompt, format, trigger | **OK** | Trigger : event START_MATCHING (ci-dessus). Chemin : executeAxiom → STEP_99_MATCHING → generateMirrorWithNewArchitecture(., 'matching', additionalContext, onChunk, onUx). Prompt/format : renderMentorStyle(., 'matching') → getFormatInstructions('matching') l.528–565 (bandeau 🟢/🔵/🟠, structure). Pas d’appel à getMatchingPrompt() dans ce chemin ; le contenu “matching” est porté par blockType 'matching' et le systemContent du renderer. **Preuve** : `axiomExecutor.ts` 2306, 2316 ; `mentorStyleRenderer.ts` 528–565. |
| **C.6** | Bouton Matching visible, cliquable, bon event, état mis à jour, pas de double requête | **OK** | Affiché si data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false (l.384–386). Clic → callAxiom(null, 'START_MATCHING'), matchingButton.disabled = true. Pas de garde serveur anti-double ; seul le disabled évite le double clic. **Preuve** : `ui-test/app.js` 467–496. |
| **C.7** | Bouton Fin visible, cliquable, lien Tally exact, pas de popup bloquée | **OK** | displayFinishButton() si data.step === 'DONE_MATCHING'. window.location.href = 'https://tally.so/r/44JLbB'. Pas d’ouverture dans popup ; navigation directe, pas de blocage iOS attendu. **Preuve** : `ui-test/app.js` 501–533, 527. |
| **C.8** | Bouton “Avis” (si distinct) | **N/A** | Aucun bouton “Avis” dans ui-test/app.js. |
| **D.9** | Résultat matching écrit dans Google Sheet (spreadsheetId, feuille, colonnes, pas d’écrasement/duplication, gestion erreur) | **KO** | **Prouvé cassé** : setMatchingResult() n’est jamais appelé dans `src/server.ts`. Seul `src/api/axiom.ts` (Fastify) appelle setMatchingResult (l.666). En production Express, après matching, candidate.matchingResult reste undefined → candidateToLiveTrackingRow → verdict = ''. Upsert Sheet : spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID, sheetName = post.label (getPostConfig), colonnes A–I (startedAt, firstName, lastName, email, statusAxiom, blocAtteint, verdict, lastActivityAt, ''). Recherche ligne : r[9] === row.candidateId \|\| r[3] === row.email ; range A4:I n’a que 9 colonnes donc r[9] toujours undefined → match uniquement par email. Erreur : log + throw (l.554–565), pas de retry/queue. **Preuve** : `server.ts` aucun “setMatchingResult” ; `googleSheetsService.ts` 464–567, 515–517 ; `googleSheetsService.ts` 33–49 (candidateToLiveTrackingRow). |
| **D.10** | Preuve Sheet sans parcours complet (test isolé / dry-run / assertion) | **KO** | Aucun test ni script de dry-run pour upsertLiveTracking dans le dépôt. La correction D.9 (setMatchingResult côté Express) doit précéder ; ensuite on peut ajouter un test unitaire : mock candidate avec matchingResult.verdict, appeler candidateToLiveTrackingRow, vérifier verdict dans l’objet row. |

---

## 3) POINTS FRAGILES ET CONTREMESURES

| Risque | Contremesure |
|--------|---------------|
| Timeout Railway / cold start | Garder timeout client front suffisant (fetch sans timeout court) ; health check /keepalive si besoin. |
| SSE buffering (proxy / Vercel) | Headers X-Accel-Buffering: no déjà posés sur /axiom/stream ; pas de compression sur cette route si possible. |
| iOS Safari (popup, CORS, cookies) | Bouton Fin utilise location.href (pas window.open) → pas de popup. CORS serveur limité à une origin ; session par sessionId body/header, pas de cookie obligatoire. |
| Double START_MATCHING (ré-envoi event) | UI : bouton désactivé au clic. Serveur : pas d’idempotence ; si besoin, vérifier step === DONE_MATCHING avant de régénérer. |
| Google API en échec | Actuellement log + throw ; politique “non bloquant” documentée ailleurs — le moteur répond même si Sheet échoue. À confirmer en prod (log [GS] upsertLiveTracking error). |
| Recherche Sheet par email uniquement | r[9] inutilisable (colonne J non écrite). Doublon email → même ligne mise à jour. Si besoin d’unicité par session, ajouter candidateId en colonne J et inclure dans values. |

---

## 4) PLAN D’ACTION ONE SHOT (CORRECTION KO)

**Objectif** : Rendre la persistance Google Sheet cohérente avec le matching en production (Express).

### 4.1 Cause unique

En `server.ts`, après le chemin générique qui appelle `executeWithAutoContinue`, lorsque `result.step === 'DONE_MATCHING'` et `result.response` non vide, le code ne construit pas l’objet `MatchingResult` ni n’appelle `candidateStore.setMatchingResult`. Donc `candidateToLiveTrackingRow(candidate)` utilise un `candidate` sans `matchingResult` → verdict vide dans le Sheet.

### 4.2 Modifications EXACTES (ordre)

1. **Fichier** : `src/server.ts`  
   - **Import** : ajouter l’import de type ou rien (MatchingResult déjà utilisé via candidate.matchingResult). Vérifier si setMatchingResult est utilisé : non. Donc ajouter l’usage de `candidateStore.setMatchingResult` après réception du résultat matching.
   - **Emplacement** : après le bloc qui appelle `executeWithAutoContinue(candidate, userMessageText, event || null, onChunk, onUx)` dans la branche générique (celle qui fait ensuite mapStepToState, tracking, writeEvent done). Idem pour la branche **non-stream** /axiom (après executeWithAutoContinue, avant ou après le reload candidate et l’appel upsertLiveTracking).

2. **Logique à insérer** (après avoir `result` et avoir rechargé `candidate` une première fois) :
   - Si `result.step === 'DONE_MATCHING'` (ou `'STEP_99_MATCH_READY'` selon ce que renvoie vraiment l’executor — en fait c’est `DONE_MATCHING`) et `result.response` non vide :
     - Extraire verdict/summary comme dans api/axiom.ts :  
       `const fullText = result.response.trim();`  
       `const lignes = fullText.split('\n').map(l => l.trim()).filter(Boolean);`  
       `const verdict = (lignes[0] ?? '').slice(0, 80);`  
       `const summary = lignes.slice(0, 3).join(' ').slice(0, 240);`  
       `candidateStore.setMatchingResult(candidate.candidateId, { verdict, summary, fullText, createdAt: new Date().toISOString() });`
     - Recharger `candidate` depuis le store (get/getAsync).
   - Ensuite, faire comme aujourd’hui : `trackingRow = candidateToLiveTrackingRow(candidate)` puis `upsertLiveTracking(...)`.

3. **Où l’insérer exactement** :
   - **Route POST /axiom** (non-stream) : après `const result = await executeWithAutoContinue(candidate, userMessageText, event || null);` (l. ~885), après le rechargement du candidate (l. ~887–892), et avant le bloc qui fait `if (responseState !== "identity" && candidate.identity.completedAt) { ... trackingRow = candidateToLiveTrackingRow(candidate); ... }`. Donc : si result.step === DONE_MATCHING && result.response, alors setMatchingResult, puis recharger candidate, puis continuer avec le même bloc tracking existant.
   - **Route POST /axiom/stream** : même chose après `const result = await executeWithAutoContinue(...)` (l. ~1615), après rechargement candidate (l. ~1617–1622), avant le bloc `if (responseState !== "identity" && candidate.identity.completedAt) { trackingRow = candidateToLiveTrackingRow(candidate); ... }`. Insérer la même logique setMatchingResult + rechargement.

4. **Tests de validation** :
   - Après correction : 1 run manuel ou E2E jusqu’à “Je génère mon matching” → clic → vérifier en base (ou log) que candidate.matchingResult est rempli, puis que la ligne Sheet contient un verdict non vide (ou log [GS] values.update avec verdict).
   - Optionnel : test unitaire qui mime un result { step: 'DONE_MATCHING', response: '...' }, appelle la logique setMatchingResult + candidateToLiveTrackingRow, assert row.verdict non vide.

### 4.3 Fichiers / lignes concernés (résumé)

- `src/server.ts` (DONE_MATCHING déjà importé l.26) :
  - **POST /axiom** : insérer immédiatement après `const responseStep = result.step;` (l.902), avant `if (responseState !== "identity" && candidate.identity.completedAt)` (l.904), le bloc :
    - si `result.step === DONE_MATCHING && result.response`, alors parser `result.response` (lignes, verdict, summary comme api/axiom l.660–664), appeler `candidateStore.setMatchingResult(candidate.candidateId, { verdict, summary, fullText, createdAt })`, puis recharger `candidate` (get/getAsync avec `candidateIdAfterExecution`).
  - **POST /axiom/stream** : insérer immédiatement après `const responseStep = result.step;` (l.1629), avant `if (responseState !== "identity" && candidate.identity.completedAt)` (l.1631), le même bloc conditionnel setMatchingResult + rechargement.

Aucune autre modification (pas de refacto, pas de changement de prompts, pipelines, streaming, UI).

---

## 5) DÉCISION GO / NO-GO

- **NO-GO** : au moins un point est **KO** (persistance matching → Google Sheet en production Express).
- **GO** : après application du plan d’action 4 (setMatchingResult dans server.ts pour les deux routes), et après validation par 1 run jusqu’au matching + vérification Sheet ou logs, la certification peut passer en **GO**.

---

## 6) RÉSUMÉ PREUVES (EXTRAITS)

- **SSE done payload** : `server.ts` 1640–1656 (stream), 918–926 (axiom json).
- **onChunk / streamedText** : `server.ts` 974–979 (streamedText += chunk uniquement dans onChunk).
- **Thinking-loop stop** : `ui-test/app.js` 329–332 (hasReceivedFirstToken, stopThinkingLoop dans onToken).
- **Bouton Matching** : `ui-test/app.js` 384–386 (affichage), 491–494 (clic → callAxiom(null, 'START_MATCHING')).
- **Bouton Fin / Tally** : `ui-test/app.js` 524–528 (window.location.href = 'https://tally.so/r/44JLbB').
- **Synthèse format** : `mentorStyleRenderer.ts` 509–526 (getFormatInstructions('synthesis')).
- **Matching format** : `mentorStyleRenderer.ts` 528–565 (getFormatInstructions('matching')).
- **setMatchingResult absent** : `grep setMatchingResult src/server.ts` → 0 résultat.
- **Sheet verdict** : `googleSheetsService.ts` 33–49 (candidateToLiveTrackingRow : verdict = candidate.matchingResult?.verdict ?? '').

---

*Audit réalisé sans modification du code. Plan d’action à appliquer tel quel pour passage en GO.*
