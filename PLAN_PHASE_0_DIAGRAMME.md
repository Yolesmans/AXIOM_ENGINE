# PHASE 0 — CADRAGE / INVENTAIRE
**Date** : 2025-01-27  
**Objectif** : Cartographier le flux actuel sans modification

---

## 1️⃣ SCHÉMA TEXTE DU FLUX ACTUEL

### Flux principal : Front → POST /axiom → OpenAI → Store → Front

```
FRONTEND
  ↓ (POST /axiom)
  { sessionId, userMessage?, event?, identity? }
  ↓
src/server.ts:POST /axiom (ligne 315)
  ↓
  ├─ Validation identité (lignes 356-477, 479-591)
  │   └─ candidateStore.updateIdentity()
  │   └─ candidateStore.appendUserMessage() (ligne 375, 496)
  │   └─ executeWithAutoContinue(candidate) (ligne 442, 561)
  │
  ├─ Event START_BLOC_1 (ligne 650)
  │   └─ executeAxiom({ candidate, userMessage: null, event: "START_BLOC_1" }) (ligne 653)
  │
  └─ Message utilisateur (ligne 691)
      └─ candidateStore.appendUserMessage() (ligne 696)
      └─ executeWithAutoContinue(candidate, userMessageText) (ligne 714)
          ↓
          executeAxiom() (appelé depuis executeWithAutoContinue)
            ↓
            deriveStateFromConversationHistory(candidate) (ligne 1100)
            ↓
            Synchronisation FSM ← Historique (lignes 1111-1151)
            ↓
            Switch sur currentState (dérivé) :
              ├─ STEP_01_IDENTITY (ligne 1160)
              ├─ STEP_02_TONE (ligne 1215)
              ├─ STEP_03_PREAMBULE (ligne 1300)
              ├─ STEP_03_BLOC1 (ligne 1426)
              ├─ BLOCS 1-10 (ligne 1564)
              ├─ STEP_99_MATCH_READY (ligne 1741)
              └─ STEP_99_MATCHING (ligne 1775)
            ↓
            Pour chaque état :
              ├─ buildConversationHistory(candidate) (ligne 860)
              ├─ callOpenAI({ messages: [...] }) (ligne 1580, 1307, etc.)
              ├─ candidateStore.appendAssistantMessage() (ligne 1227, 1407, 1699, etc.)
              └─ return { response, step, expectsAnswer, autoContinue }
            ↓
          executeWithAutoContinue() (boucle auto-enchaînement si autoContinue=true)
            ↓
          return result
  ↓
src/server.ts:POST /axiom (mapping état → responseState)
  ↓ (lignes 729-757)
  Mapping step → state frontend :
    - STEP_01_IDENTITY → "identity"
    - STEP_02_TONE → "tone_choice"
    - STEP_03_PREAMBULE → "preambule"
    - STEP_03_BLOC1 → "wait_start_button"
    - BLOC_01 à BLOC_10 → "collecting" / "bloc_XX"
    - STEP_99_MATCH_READY → "match_ready"
    - STEP_99_MATCHING → "matching"
  ↓
  return res.status(200).json({
    sessionId,
    currentBlock,
    state: responseState,
    response: result.response,
    step: result.step,
    expectsAnswer: result.expectsAnswer,
    autoContinue: result.autoContinue
  })
  ↓
FRONTEND
```

### Points d'appel OpenAI identifiés

1. **STEP_03_PREAMBULE** (ligne 1307) :
   - Prompt : `FULL_AXIOM_PROMPT` (≈20k tokens)
   - Output : Préambule métier complet
   - Stockage : `appendAssistantMessage(..., kind: 'preambule')` (ligne 1407)

2. **Event START_BLOC_1** (ligne 1458) :
   - Prompt : `FULL_AXIOM_PROMPT` (≈20k tokens)
   - Output : Première question BLOC 1
   - Stockage : `appendAssistantMessage(..., kind: 'question', block: 1)` (ligne 1699)

3. **BLOCS 1-10** (ligne 1580) :
   - Prompt : `FULL_AXIOM_PROMPT` (≈20k tokens)
   - Output : Question suivante OU miroir fin de bloc
   - Stockage : `appendAssistantMessage(..., kind: 'question'|'mirror', block: N)` (ligne 1699)

4. **STEP_99_MATCHING** (ligne 1787) :
   - Prompt : `PROMPT_AXIOM_MATCHING` (≈3k tokens)
   - Output : Matching (🟢/🔵/🟠)
   - Stockage : `appendAssistantMessage(..., kind: 'matching')` (ligne 1842)

---

## 2️⃣ OÙ VIT L'ÉTAT (SOURCES DE VÉRITÉ)

### Source de vérité n°1 : `conversationHistory`

**Fichier** : `src/types/candidate.ts` (ligne 36)

**Structure** :
```typescript
conversationHistory: ConversationMessage[]
```

**Contenu** :
- Messages `role: 'user'` : Réponses utilisateur
- Messages `role: 'assistant'` : Questions, miroirs, préambule, matching
- Métadonnées : `block`, `step`, `kind` (tone/preambule/question/mirror/matching/other)

**Utilisation** :
- `buildConversationHistory(candidate)` (ligne 860) : Construit historique pour OpenAI
- `deriveStateFromConversationHistory(candidate)` (ligne 924) : Dérive état depuis historique

**Stockage** :
- `candidateStore.appendUserMessage()` (ligne 382)
- `candidateStore.appendAssistantMessage()` (ligne 402)
- Persistance : Redis/file (via `persistCandidate()`)

### Source de vérité n°2 : `session.ui.step` (FSM synchronisée)

**Fichier** : `src/types/candidate.ts` (ligne 18-23)

**Structure** :
```typescript
session: {
  ui?: {
    step: string;              // STEP_01_IDENTITY, BLOC_01, etc.
    lastQuestion: string | null;
    tutoiement?: 'tutoiement' | 'vouvoiement';
    identityDone?: boolean;
  }
}
```

**Synchronisation** :
- Dérivé depuis `conversationHistory` dans `executeAxiom()` (ligne 1100)
- Mis à jour via `candidateStore.updateUIState()` (ligne 322)
- Synchronisé automatiquement si désynchronisé (lignes 1134-1150)

**Utilisation** :
- Décision de transition dans `executeAxiom()` (switch sur `currentState`)
- Mapping vers `responseState` frontend (lignes 729-757)

### Autres sources d'état

**`session.currentBlock`** (ligne 13) :
- Numéro bloc courant (1-10)
- Mis à jour via `candidateStore.updateSession()` (ligne 205)

**`identity.completedAt`** (ligne 9) :
- Date complétion identité
- Utilisé pour dérivation état (ligne 938)

**`tonePreference`** (ligne 41) :
- 'tutoiement' | 'vouvoiement'
- Stocké via `candidateStore.setTonePreference()` (ligne 302)

**`answers[]`** (ligne 35) :
- Legacy : Réponses utilisateur (rétrocompatibilité)
- Utilisé par `buildConversationHistory()` si `conversationHistory` vide (ligne 879)

---

## 3️⃣ COMMENT LE SYSTÈME DÉCIDE ACTUELLEMENT

### Dérivation d'état (source de vérité n°1)

**Fonction** : `deriveStateFromConversationHistory(candidate)` (ligne 924)

**Logique** :
1. Si `conversationHistory` vide → `STEP_01_IDENTITY`
2. Si dernier assistant `kind: 'tone'` :
   - Si réponse utilisateur après → `STEP_03_PREAMBULE` ou `STEP_03_BLOC1`
   - Sinon → `STEP_02_TONE`
3. Si dernier assistant `kind: 'preambule'` → `STEP_03_BLOC1`
4. Si dernier assistant `kind: 'question'` → `BLOC_XX` (selon `block`)
5. Fallback : `deriveStepFromHistory(candidate)` (ligne 896)

**Appel** : Dans `executeAxiom()` ligne 1100, AVANT toute logique FSM

### Décision "quand poser une question"

**Logique actuelle** (dans `executeAxiom()`, section BLOCS 1-10, ligne 1564) :

1. **Si `userMessage` existe** :
   - Stocker réponse utilisateur (ligne 1662-1676)
   - Appeler OpenAI avec historique complet (ligne 1580)
   - OpenAI décide : question suivante OU miroir fin de bloc
   - Détection : `expectsAnswer = aiText.trim().endsWith('?')` (ligne 1655)

2. **Si `userMessage` null** (début bloc, event START_BLOC_1) :
   - Appeler OpenAI avec historique (ligne 1458)
   - Générer première question du bloc

**Règle actuelle** : OpenAI décide à chaque appel si c'est une question ou un miroir, basé sur le prompt et l'historique.

### Décision "quand produire miroir/profil/matching"

**Miroir fin de bloc** :
- Détection : `!expectsAnswer` (ligne 1680)
- Si `blocNumber < 10` → Transition bloc suivant (ligne 1682)
- Si `blocNumber === 10` → `STEP_99_MATCH_READY` (ligne 1686)

**Profil final (BLOC 10)** :
- TODO actuel (ligne 1685) : "Générer synthèse finale"
- Transition : `STEP_99_MATCH_READY` (ligne 1686)
- Stockage : `candidateStore.setFinalProfileText()` (ligne 1687)

**Matching** :
- Trigger : Event ou message utilisateur en `STEP_99_MATCH_READY` (ligne 1741)
- Appel OpenAI avec `PROMPT_AXIOM_MATCHING` (ligne 1787)
- Stockage : `appendAssistantMessage(..., kind: 'matching')` (ligne 1842)

### Rôle de `executeWithAutoContinue`

**Fichier** : `src/engine/axiomExecutor.ts` (ligne 1888)

**Fonction** :
```typescript
export async function executeWithAutoContinue(
  candidate: AxiomCandidate,
  userMessage: string | null = null,
): Promise<ExecuteAxiomResult>
```

**Logique** :
1. Appelle `executeAxiom()` une première fois
2. Si `result.autoContinue === true` ET `result.expectsAnswer === false` :
   - Boucle : Recharge candidate → Appelle `executeAxiom()` à nouveau
   - Continue tant que `autoContinue === true`

**Utilisation** :
- `src/server.ts:POST /axiom` (ligne 714) : Après stockage message utilisateur
- `src/server.ts:GET /start` (ligne 254) : Initialisation session
- `src/server.ts:POST /axiom` (ligne 442, 561) : Après validation identité

**États auto-enchaînés** :
- `STEP_01_IDENTITY` → `STEP_02_TONE` (ligne 1206)
- `STEP_02_TONE` → `STEP_03_PREAMBULE` (ligne 1291)
- `STEP_99_MATCH_READY` → `STEP_99_MATCHING` (ligne 1766)

### Rôle de `deriveStateFromConversationHistory`

**Fichier** : `src/engine/axiomExecutor.ts` (ligne 924)

**Fonction** :
```typescript
function deriveStateFromConversationHistory(candidate: AxiomCandidate): string
```

**Utilisation** :
- Dans `executeAxiom()` ligne 1100 : AVANT toute logique FSM
- Synchronisation automatique FSM ← Historique (lignes 1111-1151)

**Résultat** :
- `derivedState` devient `currentState` (ligne 1154)
- Utilisé pour décider quelle branche du switch exécuter

---

## 4️⃣ POINTS D'INTÉGRATION EXACTS POUR ORCHESTRATEUR

### Point d'entrée principal : POST /axiom

**Fichier** : `src/server.ts`  
**Ligne** : 315 (début route)  
**Ligne critique** : 714 (appel `executeWithAutoContinue`)

**Code actuel** :
```typescript
// Ligne 714
const result = await executeWithAutoContinue(candidate, userMessageText);
```

**Point d'intégration** :
- **AVANT** ligne 714 : Décider si déléguer à orchestrateur ou à `executeWithAutoContinue`
- **Condition** : Si `candidate.session.ui?.step` est un BLOC (BLOC_01 à BLOC_10) → Orchestrateur
- **Sinon** : États spéciaux (STEP_01_IDENTITY, STEP_02_TONE, STEP_03_PREAMBULE, STEP_99_MATCHING) → `executeWithAutoContinue`

### États spéciaux à préserver (PAS d'orchestrateur)

**Fichier** : `src/engine/axiomExecutor.ts`

1. **STEP_01_IDENTITY** (ligne 1160) :
   - Gestion identité (parsing, validation)
   - Transition automatique vers STEP_02_TONE

2. **STEP_02_TONE** (ligne 1215) :
   - Question tone (texte fixe)
   - Détection tutoiement/vouvoiement
   - Transition automatique vers STEP_03_PREAMBULE

3. **STEP_03_PREAMBULE** (ligne 1300) :
   - Génération préambule (appel OpenAI)
   - Transition vers STEP_03_BLOC1

4. **STEP_03_BLOC1** (ligne 1426) :
   - Attente event `START_BLOC_1`
   - Génération première question BLOC 1 (ligne 1458)

5. **STEP_99_MATCH_READY** (ligne 1741) :
   - Attente bouton matching
   - Transition vers STEP_99_MATCHING

6. **STEP_99_MATCHING** (ligne 1775) :
   - Génération matching (appel OpenAI avec prompt matching)
   - Transition vers DONE_MATCHING

### États à déléguer à l'orchestrateur

**Fichier** : `src/engine/axiomExecutor.ts`  
**Section** : BLOCS 1 à 10 (ligne 1564)

**Code actuel** :
```typescript
// Ligne 1564
const blocStates = [BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10];
if (blocStates.includes(currentState as any)) {
  const blocNumber = blocStates.indexOf(currentState as any) + 1;
  
  // ... logique actuelle (lignes 1568-1735)
}
```

**Point d'intégration** :
- **REMPLACER** la logique lignes 1568-1735 par un appel à l'orchestrateur
- **GARDER** la détection `blocStates.includes(currentState)` pour router vers orchestrateur

### Fonctions helpers à réutiliser

**Fichier** : `src/engine/axiomExecutor.ts`

1. **`buildConversationHistory(candidate)`** (ligne 860) :
   - Construit historique depuis `conversationHistory`
   - Troncature à 40 messages max
   - **Réutilisable** : OUI (déjà utilisé par orchestrateur)

2. **`callOpenAI({ messages })`** :
   - Import depuis `src/services/openaiClient.ts`
   - **Réutilisable** : OUI (appel API standard)

3. **`deriveStateFromConversationHistory(candidate)`** (ligne 924) :
   - Dérive état depuis historique
   - **Réutilisable** : OUI (orchestrateur peut l'utiliser pour validation)

4. **`logTransition(...)`** (ligne 1063) :
   - Logging transitions FSM
   - **Réutilisable** : OUI (orchestrateur peut logger ses transitions)

### Méthodes store à réutiliser

**Fichier** : `src/store/sessionStore.ts`

1. **`appendUserMessage(candidateId, content, meta?)`** (ligne 382) :
   - Stocke message utilisateur dans `conversationHistory`
   - **Réutilisable** : OUI

2. **`appendAssistantMessage(candidateId, content, meta?)`** (ligne 402) :
   - Stocke message assistant dans `conversationHistory`
   - **Réutilisable** : OUI

3. **`updateUIState(candidateId, uiUpdates)`** (ligne 322) :
   - Met à jour `session.ui.step`
   - **Réutilisable** : OUI

4. **`updateSession(candidateId, updates)`** (ligne 205) :
   - Met à jour `session.currentBlock`
   - **Réutilisable** : OUI

5. **`get(candidateId)`** / **`getAsync(candidateId)`** (lignes 171, 176) :
   - Récupère candidate depuis store
   - **Réutilisable** : OUI

### Structure de données à étendre

**Fichier** : `src/types/candidate.ts`

**Extension nécessaire** :
```typescript
export interface AxiomCandidate {
  // ... existant
  blockQueues?: Map<number, QuestionQueue>;  // NOUVEAU
  answerMaps?: Map<number, AnswerMap>;       // NOUVEAU
}
```

**Point d'initialisation** :
- `src/store/sessionStore.ts:create()` (ligne 91)
- Ajouter initialisation `blockQueues: new Map()`, `answerMaps: new Map()`

---

## 5️⃣ RÉSUMÉ DES POINTS D'INTERVENTION

### Point d'intégration principal

**Fichier** : `src/server.ts`  
**Ligne** : 714  
**Code actuel** :
```typescript
const result = await executeWithAutoContinue(candidate, userMessageText);
```

**Modification proposée** (théorique) :
```typescript
let result: ExecuteAxiomResult;

// États spéciaux → executeWithAutoContinue (inchangé)
if ([STEP_01_IDENTITY, STEP_02_TONE, STEP_03_PREAMBULE, STEP_99_MATCHING].includes(candidate.session.ui?.step)) {
  result = await executeWithAutoContinue(candidate, userMessageText);
} else {
  // BLOCS 1-10 → Orchestrateur
  const orchestrator = new BlockOrchestrator(candidateStore);
  result = await orchestrator.handleMessage(candidate, userMessageText, event);
}
```

### Point d'intégration secondaire (dans executeAxiom)

**Fichier** : `src/engine/axiomExecutor.ts`  
**Ligne** : 1564 (section BLOCS 1-10)

**Code actuel** :
```typescript
if (blocStates.includes(currentState as any)) {
  // ... logique actuelle (lignes 1568-1735)
}
```

**Alternative** : Déléguer cette section entière à l'orchestrateur (si intégration dans `executeAxiom` plutôt que dans `server.ts`)

### Fonctions à créer (nouveau service)

**Fichier** : `src/services/blockOrchestrator.ts` (à créer)

**Méthodes nécessaires** :
- `handleMessage(candidate, userMessage, event): Promise<OrchestratorResult>`
- `generateQuestionsForBlock(candidate, blockNumber): Promise<string[]>`
- `serveNextQuestion(candidate, blockNumber): Promise<string | null>`
- `generateMirrorForBlock(candidate, blockNumber): Promise<string>`
- `shouldGenerateQuestions(...): boolean`
- `shouldServeNextQuestion(...): boolean`
- `shouldGenerateMirror(...): boolean`

### Méthodes store à ajouter

**Fichier** : `src/store/sessionStore.ts`

**Méthodes nécessaires** :
- `initQuestionQueue(candidateId, blockNumber): QuestionQueue`
- `setQuestionsForBlock(candidateId, blockNumber, questions): QuestionQueue`
- `advanceQuestionCursor(candidateId, blockNumber): QuestionQueue | undefined`
- `markBlockComplete(candidateId, blockNumber): void`
- `storeAnswerForBlock(candidateId, blockNumber, questionIndex, answer): AnswerMap`

---

## 6️⃣ SORTIES ATTENDUES PAR LE FRONT

### Format réponse backend

**Fichier** : `src/server.ts:POST /axiom` (ligne 773)

**Structure** :
```typescript
{
  sessionId: string,
  currentBlock: number,
  state: string,              // "identity" | "tone_choice" | "preambule" | "wait_start_button" | "collecting" | "match_ready" | "matching" | "done"
  response: string,            // Message assistant à afficher
  step: string,                // État FSM (STEP_01_IDENTITY, BLOC_01, etc.)
  expectsAnswer: boolean,      // Front doit afficher input
  autoContinue: boolean        // Front doit auto-enchaîner
}
```

### Types de messages assistant (depuis conversationHistory)

**Fichier** : `src/types/conversation.ts` (ligne 3)

**Types** :
- `kind: 'tone'` : Question tutoiement/vouvoiement
- `kind: 'preambule'` : Préambule métier complet
- `kind: 'question'` : Question posée (1 seule à la fois actuellement)
- `kind: 'mirror'` : Mini-analyse fin de bloc
- `kind: 'matching'` : Résultat matching
- `kind: 'other'` : Profil final, autres

**Règle stricte actuelle** :
- `kind: 'question'` : **UNIQUEMENT** 1 question (pas un paquet)
- Chaque question est stockée séparément dans `conversationHistory`

---

## 7️⃣ DIAGRAMME COMPLET (1 PAGE)

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  POST /axiom { sessionId, userMessage?, event?, identity? }    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              src/server.ts:POST /axiom (ligne 315)              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Validation identité (lignes 356-477, 479-591)           │  │
│  │  └─ candidateStore.updateIdentity()                      │  │
│  │  └─ candidateStore.appendUserMessage()                  │  │
│  │  └─ executeWithAutoContinue()                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Event START_BLOC_1 (ligne 650)                          │  │
│  │  └─ executeAxiom({ event: "START_BLOC_1" })            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Message utilisateur (ligne 691)                         │  │
│  │  └─ candidateStore.appendUserMessage() (ligne 696)      │  │
│  │  └─ executeWithAutoContinue() (ligne 714)               │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│    src/engine/axiomExecutor.ts:executeWithAutoContinue()        │
│                         (ligne 1888)                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Boucle auto-enchaînement si autoContinue=true            │  │
│  │  └─ executeAxiom() (appel récursif)                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│        src/engine/axiomExecutor.ts:executeAxiom()              │
│                         (ligne 1089)                           │
│                                                                 │
│  1. deriveStateFromConversationHistory(candidate) (ligne 1100)  │
│  2. Synchronisation FSM ← Historique (lignes 1111-1151)       │
│  3. Switch sur currentState (dérivé) :                         │
│     ├─ STEP_01_IDENTITY (ligne 1160)                          │
│     ├─ STEP_02_TONE (ligne 1215)                              │
│     ├─ STEP_03_PREAMBULE (ligne 1300)                         │
│     ├─ STEP_03_BLOC1 (ligne 1426)                              │
│     ├─ BLOCS 1-10 (ligne 1564) ← POINT D'INTÉGRATION          │
│     ├─ STEP_99_MATCH_READY (ligne 1741)                       │
│     └─ STEP_99_MATCHING (ligne 1775)                           │
│                                                                 │
│  Pour chaque état :                                            │
│    └─ buildConversationHistory(candidate) (ligne 860)          │
│    └─ callOpenAI({ messages: [...] })                          │
│    └─ candidateStore.appendAssistantMessage()                  │
│    └─ return { response, step, expectsAnswer, autoContinue }   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              src/services/openaiClient.ts:callOpenAI()          │
│                    (import depuis axiomExecutor)                │
│                                                                 │
│  Appel API OpenAI avec messages[]                               │
│  Retourne : string (completion)                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│         src/store/sessionStore.ts:CandidateStore                │
│                                                                 │
│  Méthodes utilisées :                                          │
│  - appendUserMessage() (ligne 382)                             │
│  - appendAssistantMessage() (ligne 402)                        │
│  - updateUIState() (ligne 322)                                 │
│  - updateSession() (ligne 205)                                 │
│  - get() / getAsync() (lignes 171, 176)                        │
│                                                                 │
│  Persistance : Redis (si REDIS_URL) ou File (/tmp/axiom_store) │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              src/server.ts:POST /axiom (mapping)                │
│                         (lignes 729-757)                        │
│                                                                 │
│  Mapping step → state frontend :                                 │
│  - STEP_01_IDENTITY → "identity"                                │
│  - STEP_02_TONE → "tone_choice"                                 │
│  - STEP_03_PREAMBULE → "preambule"                              │
│  - STEP_03_BLOC1 → "wait_start_button"                          │
│  - BLOC_01 à BLOC_10 → "collecting" / "bloc_XX"                 │
│  - STEP_99_MATCH_READY → "match_ready"                          │
│  - STEP_99_MATCHING → "matching"                                │
│                                                                 │
│  return res.status(200).json({ ... })                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                 │
│  Reçoit { sessionId, state, response, step, expectsAnswer }     │
│  Affiche response (1 question à la fois)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8️⃣ SOURCES DE VÉRITÉ RÉSUMÉES

### conversationHistory (source de vérité n°1)

**Où** : `candidate.conversationHistory: ConversationMessage[]`  
**Contenu** : Historique complet user + assistant  
**Utilisation** : Dérivation état, construction messages OpenAI  
**Modification** : `appendUserMessage()`, `appendAssistantMessage()`

### session.ui.step (source de vérité n°2, synchronisée)

**Où** : `candidate.session.ui.step: string`  
**Contenu** : État FSM (STEP_01_IDENTITY, BLOC_01, etc.)  
**Utilisation** : Décision switch dans `executeAxiom()`  
**Modification** : `updateUIState()`  
**Synchronisation** : Automatique depuis `conversationHistory` dans `executeAxiom()`

### session.currentBlock

**Où** : `candidate.session.currentBlock: number`  
**Contenu** : Numéro bloc courant (1-10)  
**Utilisation** : Tracking progression  
**Modification** : `updateSession()`

---

## 9️⃣ LOGIQUE DE DÉCISION ACTUELLE

### Quand poser une question

**Actuellement** :
- À chaque appel OpenAI dans section BLOCS 1-10 (ligne 1580)
- OpenAI décide : question suivante OU miroir fin de bloc
- Détection : `expectsAnswer = aiText.trim().endsWith('?')` (ligne 1655)

**Pas de logique explicite** :
- Pas de comptage questions par bloc
- Pas de queue de questions pré-générées
- Pas de détection "toutes réponses reçues"

### Quand produire miroir

**Actuellement** :
- Détection : `!expectsAnswer` (pas de "?") (ligne 1680)
- Si `blocNumber < 10` → Transition bloc suivant
- Si `blocNumber === 10` → Transition STEP_99_MATCH_READY

**Pas de logique explicite** :
- Pas de vérification "toutes questions répondues"
- OpenAI décide basé sur prompt et historique

### Quand produire profil final

**Actuellement** :
- TODO (ligne 1685) : "Générer synthèse finale"
- Transition automatique vers STEP_99_MATCH_READY après BLOC 10

**Pas implémenté** : Génération profil final (BLOC 10)

### Quand produire matching

**Actuellement** :
- Trigger : Event ou message utilisateur en STEP_99_MATCH_READY (ligne 1741)
- Appel OpenAI avec prompt matching (ligne 1787)
- Transition vers DONE_MATCHING

---

## 🔟 POINTS D'INTÉGRATION EXACTS (RÉCAPITULATIF)

### Point principal : src/server.ts ligne 714

**Code actuel** :
```typescript
const result = await executeWithAutoContinue(candidate, userMessageText);
```

**Condition d'intégration** :
- Si `candidate.session.ui?.step` est dans `[BLOC_01, BLOC_02, ..., BLOC_10]` → Orchestrateur
- Sinon → `executeWithAutoContinue()` (états spéciaux)

### Point secondaire : src/engine/axiomExecutor.ts ligne 1564

**Code actuel** :
```typescript
if (blocStates.includes(currentState as any)) {
  // ... logique actuelle (lignes 1568-1735)
}
```

**Alternative** : Déléguer cette section à l'orchestrateur (si intégration dans `executeAxiom`)

### États à préserver (PAS d'orchestrateur)

- STEP_01_IDENTITY
- STEP_02_TONE
- STEP_03_PREAMBULE
- STEP_03_BLOC1 (génération première question)
- STEP_99_MATCH_READY
- STEP_99_MATCHING

### États à déléguer (orchestrateur)

- BLOC_01
- BLOC_02
- BLOC_03
- BLOC_04
- BLOC_05
- BLOC_06
- BLOC_07
- BLOC_08
- BLOC_09
- BLOC_10

---

**FIN DE L'INVENTAIRE PHASE 0**
