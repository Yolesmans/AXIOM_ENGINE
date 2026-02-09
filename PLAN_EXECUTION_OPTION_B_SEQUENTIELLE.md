# 🟧 PLAN D'EXÉCUTION — OPTION B (VERSION SÉQUENTIELLE STRICTE)
**Date** : 2025-01-27  
**Objectif** : Rendre l'OPTION B opérationnelle avec contrainte UX stricte (1 question = 1 réponse)

---

## ✅ RÉSUMÉ EXÉCUTIF

**Estimation totale** : **18-26 demi-journées** (MVP solide)

**Répartition** :
- Phase 0 (Cadrage) : 1 demi-journée
- Phase 1 (Contrat données) : 1-2 demi-journées
- Phase 2 (Orchestrateur) : 2-3 demi-journées
- Phase 3 (BLOC 2A/2B) : 2-3 demi-journées
- Phase 4 (Prompts) : 1-2 demi-journées
- Phase 5 (Garde-fous) : 1.5-2.5 demi-journées
- Phase 6 (Tests) : 1.5-3 demi-journées

**Risques techniques** :
- 🔴 **ÉLEVÉ** : Orchestrateur séquentiel (Phase 2) — Complexité état + queue
- 🟡 **MOYEN** : BLOC 2A/2B (Phase 3) — Adaptation + personnalisation
- 🟢 **FAIBLE** : Prompts, garde-fous, tests — Exécution standard

**Architecture cible** :
- **Orchestrateur** : Nouveau service `src/services/blockOrchestrator.ts`
- **Queue questions** : Extension `AxiomCandidate` → `blockQueues: Map<number, QuestionQueue>`
- **Point d'entrée** : `src/server.ts:POST /axiom` → `blockOrchestrator.handleMessage()`

---

## PHASE 0 — CADRAGE / INVENTAIRE (1 demi-journée)

### Objectif
Cartographier le flux actuel pour identifier les points d'intervention exacts.

### Actions

#### 1.1 Cartographier le flux backend actuel

**Fichiers à analyser** :
- `src/server.ts` : Route `POST /axiom` (ligne ~650)
- `src/engine/axiomExecutor.ts` : Fonction `executeAxiom()` (ligne ~1089)
- `src/store/sessionStore.ts` : Méthodes `appendUserMessage()`, `appendAssistantMessage()` (ligne ~370)

**Points d'entrée identifiés** :
```
POST /axiom
  ↓
executeWithAutoContinue(candidate, userMessage)
  ↓
executeAxiom({ candidate, userMessage, event })
  ↓
callOpenAI({ messages: [...] })
  ↓
candidateStore.appendAssistantMessage(...)
  ↓
return { response, step, expectsAnswer, ... }
```

**État actuel** :
- `candidate.session.ui.step` : État FSM (STEP_01_IDENTITY, BLOC_01, etc.)
- `candidate.conversationHistory` : Historique complet (user + assistant)
- `candidate.answers` : Réponses utilisateur (legacy, à conserver)

#### 1.2 Identifier où vit l'état

**Fichiers clés** :
- `src/engine/axiomExecutor.ts` : `deriveStateFromConversationHistory()` (ligne ~924)
- `src/store/sessionStore.ts` : `updateUIState()` (ligne ~200)
- `src/types/candidate.ts` : Interface `AxiomCandidate`

**État identifié** :
- **Source de vérité n°1** : `candidate.conversationHistory` (dérivation état)
- **Source de vérité n°2** : `candidate.session.ui.step` (FSM, synchronisée depuis history)
- **État bloc** : `candidate.session.currentBlock` (1-10)

#### 1.3 Lister les sorties attendues par le front

**Types de messages assistant** (depuis `src/types/conversation.ts`) :
- `kind: 'question'` : Question posée (1 seule à la fois)
- `kind: 'mirror'` : Mini-analyse fin de bloc
- `kind: 'preambule'` : Préambule métier
- `kind: 'matching'` : Résultat matching
- `kind: 'other'` : Profil final, autres

**Format réponse backend** (depuis `src/server.ts:POST /axiom`) :
```typescript
{
  sessionId: string,
  currentBlock: number,
  state: 'collecting' | 'waiting_go' | 'matching',
  response: string,  // ← Message assistant à afficher
  step: string,      // ← État FSM
  expectsAnswer: boolean,
  autoContinue: boolean
}
```

### Critère de fin Phase 0

**Livrable** : Diagramme 1 page "backend route -> orchestrateur -> openai -> store -> front"

**Format** :
```
POST /axiom
  ↓
blockOrchestrator.handleMessage(candidate, userMessage, event)
  ↓
  ├─ Si début bloc → generateQuestionsBlock(blockNumber)
  ├─ Si réponse utilisateur → storeAnswer() + serveNextQuestion()
  └─ Si fin bloc → generateMirror(blockNumber)
  ↓
callOpenAI({ messages: [prompt_compressé, ...conversationHistory] })
  ↓
candidateStore.appendAssistantMessage(...)
  ↓
return { response, step, expectsAnswer }
```

**Validation** : Diagramme validé par équipe, points d'intervention identifiés.

---

## PHASE 1 — CONTRAT DE DONNÉES (1-2 demi-journées)

### Objectif
Rendre la séquentialité impossible à casser via structures de données strictes.

### Actions

#### 1.1 Définir structure `QuestionQueue` par bloc

**Fichier** : `src/types/blocks.ts` (nouveau)

**Structure** :
```typescript
export interface QuestionQueue {
  blockNumber: number;
  questions: string[];           // Questions pré-générées (stockées)
  cursorIndex: number;           // Index question actuellement affichée (0-based)
  isComplete: boolean;           // Toutes les réponses reçues
  generatedAt: string;           // ISO timestamp génération
  completedAt: string | null;    // ISO timestamp complétion
}

export interface AnswerMap {
  blockNumber: number;
  answers: Map<number, string>;  // questionIndex -> userAnswer
  lastAnswerAt: string;           // ISO timestamp dernière réponse
}
```

**Stockage** : Extension `AxiomCandidate` dans `src/types/candidate.ts`

```typescript
export interface AxiomCandidate {
  // ... existant
  blockQueues?: Map<number, QuestionQueue>;  // blockNumber -> queue
  answerMaps?: Map<number, AnswerMap>;       // blockNumber -> answers
}
```

**Initialisation** : Dans `src/store/sessionStore.ts:create()`

```typescript
blockQueues: new Map(),
answerMaps: new Map(),
```

#### 1.2 Définir types/flags de messages dans `conversationHistory`

**Fichier** : `src/types/conversation.ts` (existant, à étendre)

**Types existants** :
```typescript
export type ConversationMessageKind = 
  | "tone" 
  | "preambule" 
  | "question"    // ← 1 question unique (pas un paquet)
  | "mirror" 
  | "matching" 
  | "other";
```

**Règle stricte** :
- `kind: 'question'` : **UNIQUEMENT** 1 question (pas un paquet)
- Si génération lot : Stocker dans `QuestionQueue.questions[]`, mais pousser 1 par 1 dans `conversationHistory`

**Format message question** :
```typescript
{
  role: 'assistant',
  content: 'Tu te sens plus poussé par :\nA. Le fait de progresser\nB. Le fait d\'atteindre des objectifs\nC. Le fait d\'être reconnu ?',
  kind: 'question',
  block: 1,
  questionIndex: 0,  // ← Index dans QuestionQueue.questions[]
  step: 'BLOC_01'
}
```

#### 1.3 Méthodes store pour QuestionQueue

**Fichier** : `src/store/sessionStore.ts` (extension)

**Méthodes à ajouter** :
```typescript
// Initialiser queue pour un bloc
initQuestionQueue(candidateId: string, blockNumber: number): QuestionQueue

// Ajouter questions pré-générées
setQuestionsForBlock(candidateId: string, blockNumber: number, questions: string[]): QuestionQueue

// Avancer cursor (question suivante)
advanceQuestionCursor(candidateId: string, blockNumber: number): QuestionQueue | undefined

// Marquer bloc complet
markBlockComplete(candidateId: string, blockNumber: number): void

// Stocker réponse utilisateur
storeAnswerForBlock(candidateId: string, blockNumber: number, questionIndex: number, answer: string): AnswerMap
```

### Critère d'acceptance Phase 1

**Test de reprise session** :
1. Créer candidat, générer questions BLOC 1, afficher Question 0
2. Recharger page
3. Vérifier : `blockQueues.get(1).cursorIndex === 0` (reprise exacte)
4. Répondre Question 0
5. Vérifier : `blockQueues.get(1).cursorIndex === 1` (question suivante)

**Validation** : Test unitaire `testQuestionQueuePersistence()` passe.

---

## PHASE 2 — ORCHESTRATEUR SÉQUENTIEL STRICT (2-3 demi-journées)

### Objectif
Le backend décide automatiquement : générer question, servir queue, ou produire miroir.

### Actions

#### 2.1 Créer service `blockOrchestrator.ts`

**Fichier** : `src/services/blockOrchestrator.ts` (nouveau)

**Structure** :
```typescript
export class BlockOrchestrator {
  async handleMessage(
    candidate: AxiomCandidate,
    userMessage: string | null,
    event: string | null
  ): Promise<OrchestratorResult>
  
  private async generateQuestionsForBlock(
    candidate: AxiomCandidate,
    blockNumber: number
  ): Promise<string[]>
  
  private async serveNextQuestion(
    candidate: AxiomCandidate,
    blockNumber: number
  ): Promise<string | null>
  
  private async generateMirrorForBlock(
    candidate: AxiomCandidate,
    blockNumber: number
  ): Promise<string>
  
  private shouldGenerateQuestions(
    candidate: AxiomCandidate,
    blockNumber: number
  ): boolean
  
  private shouldServeNextQuestion(
    candidate: AxiomCandidate,
    blockNumber: number
  ): boolean
  
  private shouldGenerateMirror(
    candidate: AxiomCandidate,
    blockNumber: number
  ): boolean
}
```

**Point d'intégration** : `src/server.ts:POST /axiom` (ligne ~650)

**Modification** :
```typescript
// AVANT
const result = await executeWithAutoContinue(candidate, userMessageText);

// APRÈS
const orchestrator = new BlockOrchestrator(candidateStore);
const orchestratorResult = await orchestrator.handleMessage(candidate, userMessageText, event);

if (orchestratorResult.action === 'question') {
  // Servir question depuis queue ou générer
} else if (orchestratorResult.action === 'mirror') {
  // Afficher miroir
} else if (orchestratorResult.action === 'transition') {
  // Transition bloc suivant
}
```

#### 2.2 Logique de décision

**Règles** :

1. **Début de bloc** (event `START_BLOC_1` ou transition automatique) :
   ```typescript
   if (!blockQueues.has(blockNumber) || blockQueues.get(blockNumber).questions.length === 0) {
     // Générer questions (appel API)
     const questions = await generateQuestionsForBlock(candidate, blockNumber);
     candidateStore.setQuestionsForBlock(candidateId, blockNumber, questions);
     // Servir Question 0
     return serveNextQuestion(candidate, blockNumber);
   }
   ```

2. **Réponse utilisateur reçue** :
   ```typescript
   // Stocker réponse
   candidateStore.storeAnswerForBlock(candidateId, blockNumber, cursorIndex, userMessage);
   
   // Avancer cursor
   const queue = candidateStore.advanceQuestionCursor(candidateId, blockNumber);
   
   if (queue.cursorIndex < queue.questions.length) {
     // Servir question suivante (SANS API)
     return serveNextQuestion(candidate, blockNumber);
   } else {
     // Bloc terminé → Générer miroir (appel API)
     queue.isComplete = true;
     const mirror = await generateMirrorForBlock(candidate, blockNumber);
     return { action: 'mirror', content: mirror };
   }
   ```

3. **Génération questions (lot interne)** :
   ```typescript
   private async generateQuestionsForBlock(
     candidate: AxiomCandidate,
     blockNumber: number
   ): Promise<string[]> {
     const prompt = getCompressedPrompt(blockNumber, 'questions');
     const messages = buildConversationHistory(candidate);
     
     const completion = await callOpenAI({
       messages: [
         { role: 'system', content: prompt },
         {
           role: 'system',
           content: `Génère TOUTES les questions du BLOC ${blockNumber} en une seule fois.
           Format : Questions séparées par '---QUESTION_SEPARATOR---'
           Format questions à choix : A. / B. / C. / D. / E. sur lignes séparées`
         },
         ...messages
       ]
     });
     
     // Parser questions (split par délimiteur)
     const questions = completion.split('---QUESTION_SEPARATOR---').map(q => q.trim()).filter(q => q);
     return questions;
   }
   ```

#### 2.3 Intégration avec `executeAxiom()`

**Option A — Remplacer `executeAxiom()`** :
- Supprimer logique question-par-question dans `executeAxiom()`
- Utiliser uniquement `BlockOrchestrator`

**Option B — Adapter `executeAxiom()`** (recommandé) :
- Garder `executeAxiom()` pour états spéciaux (STEP_01_IDENTITY, STEP_02_TONE, STEP_03_PREAMBULE, STEP_99_MATCHING)
- Utiliser `BlockOrchestrator` uniquement pour BLOCS 1-10

**Modification `executeAxiom()`** :
```typescript
// Dans executeAxiom(), section "BLOCS 1 à 10"
if (blocStates.includes(currentState as any)) {
  const blocNumber = blocStates.indexOf(currentState as any) + 1;
  
  // Déléguer à orchestrateur
  const orchestrator = new BlockOrchestrator(candidateStore);
  const result = await orchestrator.handleMessage(candidate, userMessage, event);
  
  // Mapper résultat orchestrateur → ExecuteAxiomResult
  return {
    response: result.content,
    step: result.nextStep || currentState,
    expectsAnswer: result.action === 'question',
    autoContinue: false
  };
}
```

### Critère d'acceptance Phase 2

**Test "API jamais appelée pour question déjà en queue"** :
1. Générer questions BLOC 1 (appel API #1)
2. Répondre Question 0 (pas d'appel API)
3. Vérifier : Question 1 servie depuis queue (logs : 0 appel API)
4. Répondre Question 1 (pas d'appel API)
5. Vérifier : Question 2 servie depuis queue (logs : 0 appel API)
6. Répondre Question 2 (dernière)
7. Vérifier : Miroir généré (appel API #2)

**Validation** : Test unitaire `testNoRedundantAPICalls()` passe, logs confirment.

---

## PHASE 3 — BLOC 2A/2B "BLINDÉ" (2-3 demi-journées)

### Objectif
Garantir BLOC 2A/2B avec adaptation et personnalisation intactes.

### Actions

#### 3.1 BLOC 2A — Génération séquentielle adaptative

**Fichier** : `src/services/blockOrchestrator.ts` (méthode spéciale)

**Méthode** :
```typescript
private async handleBlock2A(
  candidate: AxiomCandidate,
  userMessage: string | null,
  questionIndex: number
): Promise<OrchestratorResult> {
  
  if (questionIndex === 0) {
    // Question médium (appel API)
    const question = await this.generateQuestion2A1(candidate);
    candidateStore.appendAssistantMessage(candidate.candidateId, question, {
      kind: 'question',
      block: 2,
      questionIndex: 0
    });
    return { action: 'question', content: question };
  }
  
  if (questionIndex === 1) {
    // Stocker réponse Question 0
    const answer0 = userMessage; // Réponse médium
    candidateStore.storeAnswerForBlock(candidate.candidateId, 2, 0, answer0);
    
    // Question préférences adaptée (appel API)
    const question = await this.generateQuestion2A2(candidate, answer0);
    candidateStore.appendAssistantMessage(candidate.candidateId, question, {
      kind: 'question',
      block: 2,
      questionIndex: 1
    });
    return { action: 'question', content: question };
  }
  
  if (questionIndex === 2) {
    // Stocker réponse Question 1
    candidateStore.storeAnswerForBlock(candidate.candidateId, 2, 1, userMessage);
    
    // Question œuvre noyau (appel API)
    const question = await this.generateQuestion2A3(candidate);
    candidateStore.appendAssistantMessage(candidate.candidateId, question, {
      kind: 'question',
      block: 2,
      questionIndex: 2
    });
    return { action: 'question', content: question };
  }
  
  // BLOC 2A terminé → Transition BLOC 2B
  candidateStore.storeAnswerForBlock(candidate.candidateId, 2, 2, userMessage);
  return { action: 'transition', nextBlock: 2, nextMode: '2B' };
}
```

**Génération Question 2A.2 adaptée** :
```typescript
private async generateQuestion2A2(
  candidate: AxiomCandidate,
  mediumAnswer: string
): Promise<string> {
  const isSeries = mediumAnswer.toLowerCase().includes('série') || 
                   mediumAnswer.toLowerCase().includes('a');
  
  const prompt = getCompressedPrompt(2, 'questions');
  const messages = buildConversationHistory(candidate);
  
  const completion = await callOpenAI({
    messages: [
      { role: 'system', content: prompt },
      {
        role: 'system',
        content: `Le candidat a choisi : ${isSeries ? 'Série' : 'Film'}.
        Génère la question préférences adaptée (${isSeries ? 'séries' : 'films'}).`
      },
      ...messages
    ]
  });
  
  return completion.trim();
}
```

#### 3.2 BLOC 2B — Pré-génération questions projectives

**Méthode** :
```typescript
private async handleBlock2B(
  candidate: AxiomCandidate,
  userMessage: string | null
): Promise<OrchestratorResult> {
  
  const queue = candidate.blockQueues?.get(2);
  
  if (!queue || queue.questions.length === 0) {
    // Générer toutes les questions BLOC 2B (appel API)
    const questions = await this.generateQuestions2B(candidate);
    candidateStore.setQuestionsForBlock(candidate.candidateId, 2, questions);
    
    // Servir Question 0
    return this.serveNextQuestion(candidate, 2);
  }
  
  // Réponse utilisateur reçue
  if (userMessage) {
    candidateStore.storeAnswerForBlock(
      candidate.candidateId, 
      2, 
      queue.cursorIndex, 
      userMessage
    );
    
    const updatedQueue = candidateStore.advanceQuestionCursor(candidate.candidateId, 2);
    
    if (updatedQueue.cursorIndex < updatedQueue.questions.length) {
      // Servir question suivante
      return this.serveNextQuestion(candidate, 2);
    } else {
      // BLOC 2B terminé → Générer miroir (appel API)
      const mirror = await this.generateMirror2B(candidate);
      return { action: 'mirror', content: mirror };
    }
  }
}
```

**Génération questions 2B** :
```typescript
private async generateQuestions2B(candidate: AxiomCandidate): Promise<string[]> {
  // Récupérer réponses BLOC 2A (médium, préférences, œuvre noyau)
  const answers2A = candidate.answerMaps?.get(2);
  const works = answers2A?.answers.get(1); // Préférences (3 œuvres)
  const coreWork = answers2A?.answers.get(2); // Œuvre noyau
  
  const prompt = getCompressedPrompt(2, 'questions_2B');
  const messages = buildConversationHistory(candidate);
  
  const completion = await callOpenAI({
    messages: [
      { role: 'system', content: prompt },
      {
        role: 'system',
        content: `Génère TOUTES les questions projectives BLOC 2B.
        Œuvres du candidat : ${works}
        Œuvre noyau : ${coreWork}
        
        Pour chaque œuvre (#3, #2, #1) :
        - Question motif (5 propositions A/B/C/D/E spécifiques à l'œuvre)
        - Question personnages (1-3 personnages)
        - Question traits (5 propositions A/B/C/D/E par personnage, spécifiques)
        
        Format : Questions séparées par '---QUESTION_SEPARATOR---'
        IMPORTANT : Traits doivent être SPÉCIFIQUES à chaque personnage, pas génériques.`
      },
      ...messages
    ]
  });
  
  // Parser questions
  const questions = completion.split('---QUESTION_SEPARATOR---')
    .map(q => q.trim())
    .filter(q => q);
  
  return questions;
}
```

**Génération miroir 2B** :
```typescript
private async generateMirror2B(candidate: AxiomCandidate): Promise<string> {
  const prompt = getCompressedPrompt(2, 'mirror');
  const messages = buildConversationHistory(candidate);
  
  const completion = await callOpenAI({
    messages: [
      { role: 'system', content: prompt },
      {
        role: 'system',
        content: `Produis la synthèse finale BLOC 2B (4-6 lignes max).
        IMPORTANT : 
        - Croise motifs + personnages + traits
        - Fais ressortir des constantes (rapport au pouvoir, pression, relations, responsabilité)
        - Inclut 1 point de vigilance réaliste
        - Synthèse PERSONNALISÉE (noms d'œuvres et personnages explicitement mentionnés)`
      },
      ...messages
    ]
  });
  
  return completion.trim();
}
```

### Critère d'acceptance Phase 3

**Test "BLOC 2A adaptation"** :
1. Répondre "Série" à Question 2A.1
2. Vérifier : Question 2A.2 contient "séries" (pas "films")
3. Répondre "Breaking Bad, Game of Thrones, The Office"
4. Vérifier : Question 2A.3 (œuvre noyau) générée

**Test "BLOC 2B personnalisation"** :
1. Vérifier : Questions 2B contiennent noms d'œuvres (Breaking Bad, etc.)
2. Vérifier : Questions traits contiennent noms de personnages (Walter White, etc.)
3. Vérifier : Traits sont spécifiques (pas "intelligent, courageux" générique)
4. Vérifier : Miroir 2B croise motifs + personnages + traits

**Validation** : Tests unitaires `testBlock2AAdaptation()` et `testBlock2BPersonalization()` passent.

---

## PHASE 4 — PROMPTS (1-2 demi-journées)

### Objectif
Stabiliser respect du prompt sans payer 20k tokens par appel.

### Actions

#### 4.1 Créer `getCompressedPrompt()`

**Fichier** : `src/engine/prompts.ts` (extension)

**Méthode** :
```typescript
export function getCompressedPrompt(
  blockNumber: number,
  mode: 'questions' | 'mirror' | 'profil' | 'matching'
): string {
  const absolutes = `
Rôle : AXIOM, mentor professionnel lucide et exigeant.
Ton : chaleureux mais pro, direct mais respectueux, clair, simple, humain.
Zones interdites : origine ethnique, religion, opinions politiques, santé, handicap, vie sexuelle, syndicat, trauma, trouble, pathologie.
`;

  const format = `
Format questions à choix : A. / B. / C. / D. / E. sur lignes séparées (pas compact).
Format miroir : 
  1️⃣ Lecture implicite (20 mots max) : ce que la réponse révèle du fonctionnement réel.
  2️⃣ Déduction personnalisée (25 mots max) : manière probable d'agir en situation réelle.
  3️⃣ Validation ouverte : "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."
`;

  const bloc = getBlockSpecificRules(blockNumber);
  
  const fusion = mode === 'mirror' ? `
Fusion cumulative : Fusionne cette analyse avec les analyses des blocs précédents (disponibles dans l'historique).
Montre une compréhension qui progresse visiblement.
Aucune synthèse globale avant le BLOC 10.
` : '';

  return `${absolutes}\n\n${format}\n\n${bloc}\n\n${fusion}`.trim();
}
```

**Fichier règles par bloc** : `src/engine/prompts.ts` (méthode helper)

```typescript
function getBlockSpecificRules(blockNumber: number): string {
  const rules: Record<number, string> = {
    1: `BLOC 1 — ÉNERGIE & MOTEURS INTERNES
Objectif : comprendre comment le candidat se met en mouvement, ce qui le drive, comment il gère la pression et l'ennui.
Questions typiques : moteurs (progression/objectifs/reconnaissance), énergie (stable/pics), pression, ennui.`,
    2: `BLOC 2A — Collecte préférences (médium, 3 œuvres, œuvre noyau).
BLOC 2B — Analyse projective (motifs + personnages + traits, par œuvre).
IMPORTANT : Traits SPÉCIFIQUES à chaque personnage, pas génériques.`,
    // ... blocs 3-9
  };
  
  return rules[blockNumber] || '';
}
```

#### 4.2 Créer `getMatchingPrompt()`

**Fichier** : `src/engine/prompts.ts` (existant, à vérifier)

**Méthode** : Utiliser `PROMPT_AXIOM_MATCHING` existant (ligne ~529)

**Vérification** : Prompt matching complet (3k tokens) déjà présent.

#### 4.3 Validation structure miroir

**Fichier** : `src/services/blockOrchestrator.ts` (méthode helper)

**Méthode** :
```typescript
private validateMirrorStructure(content: string): boolean {
  // Détection sections obligatoires
  const hasSection1 = /1️⃣|Lecture implicite/i.test(content);
  const hasSection2 = /2️⃣|Déduction personnalisée/i.test(content);
  const hasSection3 = /3️⃣|Validation ouverte|Dis-moi si ça te parle/i.test(content);
  
  // Validation longueur (approximative)
  const sections = content.split(/\n\n/);
  const section1Words = sections[0]?.split(/\s+/).length || 0;
  const section2Words = sections[1]?.split(/\s+/).length || 0;
  
  return hasSection1 && hasSection2 && hasSection3 && 
         section1Words <= 30 && section2Words <= 35;
}
```

**Intégration** :
```typescript
private async generateMirrorForBlock(
  candidate: AxiomCandidate,
  blockNumber: number
): Promise<string> {
  let mirror = await this.callOpenAIForMirror(candidate, blockNumber);
  
  // Validation + retry si non conforme
  if (!this.validateMirrorStructure(mirror)) {
    console.warn('[ORCHESTRATOR] Miroir non conforme, retry avec format strict');
    mirror = await this.callOpenAIForMirror(candidate, blockNumber, true); // strict mode
  }
  
  return mirror;
}
```

### Critère d'acceptance Phase 4

**Test "Prompt compressé respecte règles"** :
1. Générer questions BLOC 1 avec prompt compressé
2. Vérifier : Questions respectent format A/B/C/D/E
3. Générer miroir BLOC 1 avec prompt compressé
4. Vérifier : Miroir contient 3 sections obligatoires
5. Vérifier : Longueur sections respecte limites (20+25 mots)

**Validation** : Test unitaire `testCompressedPromptCompliance()` passe.

---

## PHASE 5 — GARDE-FOUS / OBSERVABILITÉ (1.5-2.5 demi-journées)

### Objectif
Garantir qualité, coût maîtrisé, et observabilité complète.

### Actions

#### 5.1 Validations automatiques

**Fichier** : `src/services/validators.ts` (nouveau)

**Validations** :

1. **Question** :
```typescript
export function validateQuestion(content: string): ValidationResult {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Question vide' };
  }
  
  // Détection QCM
  if (/A\.|B\.|C\.|D\.|E\./i.test(content)) {
    const lines = content.split('\n').filter(l => /^[A-E]\./i.test(l));
    if (lines.length < 2) {
      return { valid: false, error: 'QCM incomplet (moins de 2 options)' };
    }
  }
  
  return { valid: true };
}
```

2. **Miroir** :
```typescript
export function validateMirror(content: string): ValidationResult {
  const hasSection1 = /1️⃣|Lecture implicite/i.test(content);
  const hasSection2 = /2️⃣|Déduction personnalisée/i.test(content);
  const hasSection3 = /3️⃣|Validation ouverte|Dis-moi si ça te parle/i.test(content);
  
  if (!hasSection1 || !hasSection2 || !hasSection3) {
    return { valid: false, error: 'Sections manquantes' };
  }
  
  // Validation longueur
  const sections = content.split(/\n\n/);
  const section1Words = sections[0]?.split(/\s+/).length || 0;
  const section2Words = sections[1]?.split(/\s+/).length || 0;
  
  if (section1Words > 30 || section2Words > 35) {
    return { valid: false, error: 'Sections trop longues' };
  }
  
  return { valid: true };
}
```

3. **BLOC 10** :
```typescript
export function validateProfilFinal(content: string): ValidationResult {
  const requiredSections = [
    /🔥.*mouvement/i,
    /🧱.*temps/i,
    /⚖️.*valeurs/i,
    /🧩.*projections/i,
    /🛠️.*forces.*limites/i,
    /🎯.*positionnement/i,
    /🧠.*synthèse.*émotionnelle/i
  ];
  
  const missing = requiredSections.filter(regex => !regex.test(content));
  
  if (missing.length > 0) {
    return { valid: false, error: `Sections manquantes : ${missing.length}` };
  }
  
  return { valid: true };
}
```

4. **Matching** :
```typescript
export function validateMatching(content: string): ValidationResult {
  const hasStatus = /🟢|🔵|🟠|ALIGNÉ|ALIGNEMENT CONDITIONNEL|PAS ALIGNÉ/i.test(content);
  const hasJustification = /Lecture de compatibilité|Rapport au cœur|Rapport à la durée|Cohérence globale/i.test(content);
  
  if (!hasStatus || !hasJustification) {
    return { valid: false, error: 'Structure matching incomplète' };
  }
  
  return { valid: true };
}
```

#### 5.2 Retry policy

**Fichier** : `src/services/blockOrchestrator.ts` (méthode helper)

**Méthode** :
```typescript
private async callOpenAIWithRetry(
  messages: Array<{ role: string; content: string }>,
  validator: (content: string) => ValidationResult,
  maxRetries: number = 1
): Promise<string> {
  let retries = 0;
  
  while (retries <= maxRetries) {
    try {
      const completion = await callOpenAI({ messages });
      const validation = validator(completion);
      
      if (validation.valid) {
        return completion;
      }
      
      // Non conforme → retry avec prompt renforcé
      if (retries < maxRetries) {
        console.warn(`[ORCHESTRATOR] Validation échouée, retry ${retries + 1}/${maxRetries}`);
        messages[messages.length - 1].content += '\n\n⚠️ FORMAT STRICT OBLIGATOIRE. Respecte exactement la structure demandée.';
        retries++;
      } else {
        throw new Error(`Validation échouée après ${maxRetries} retries: ${validation.error}`);
      }
    } catch (error) {
      if (retries < maxRetries) {
        retries++;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Backoff 1s
      } else {
        throw error;
      }
    }
  }
  
  throw new Error('Max retries atteint');
}
```

#### 5.3 Token / coût tracking

**Fichier** : `src/services/costTracker.ts` (nouveau)

**Structure** :
```typescript
export interface APICallMetrics {
  candidateId: string;
  blockNumber: number;
  callType: 'question' | 'mirror' | 'profil' | 'matching';
  inputTokens: number;
  outputTokens: number;
  cost: number; // en euros
  latency: number; // en ms
  timestamp: string;
}

export class CostTracker {
  private metrics: APICallMetrics[] = [];
  
  recordCall(metrics: APICallMetrics): void {
    this.metrics.push(metrics);
    // Persister (Redis/file)
  }
  
  getCandidateCost(candidateId: string): number {
    return this.metrics
      .filter(m => m.candidateId === candidateId)
      .reduce((sum, m) => sum + m.cost, 0);
  }
  
  getCandidateMetrics(candidateId: string): APICallMetrics[] {
    return this.metrics.filter(m => m.candidateId === candidateId);
  }
}
```

**Intégration** : Dans `callOpenAI()` wrapper

```typescript
async function callOpenAIWithTracking(
  messages: Array<{ role: string; content: string }>,
  candidateId: string,
  blockNumber: number,
  callType: 'question' | 'mirror' | 'profil' | 'matching'
): Promise<string> {
  const startTime = Date.now();
  
  const completion = await callOpenAI({ messages });
  
  // Calcul tokens (approximatif)
  const inputTokens = estimateTokens(JSON.stringify(messages));
  const outputTokens = estimateTokens(completion);
  const cost = calculateCost(inputTokens, outputTokens);
  const latency = Date.now() - startTime;
  
  // Enregistrer
  costTracker.recordCall({
    candidateId,
    blockNumber,
    callType,
    inputTokens,
    outputTokens,
    cost,
    latency,
    timestamp: new Date().toISOString()
  });
  
  return completion;
}
```

#### 5.4 Historique trimming

**Fichier** : `src/services/historyTrimmer.ts` (nouveau)

**Stratégie** :
```typescript
export function trimConversationHistory(
  history: ConversationMessage[],
  maxMessages: number = 40
): ConversationMessage[] {
  if (history.length <= maxMessages) {
    return history;
  }
  
  // Prioriser : miroirs + réponses + œuvres/personnages + profil final
  const priorityKinds: ConversationMessageKind[] = ['mirror', 'matching', 'other'];
  const priorityMessages = history.filter(m => 
    priorityKinds.includes(m.kind as ConversationMessageKind) ||
    (m.kind === 'question' && m.block === 2) // BLOC 2 questions
  );
  
  // Garder les N derniers messages + messages prioritaires
  const recentMessages = history.slice(-maxMessages);
  const allPriority = [...priorityMessages, ...recentMessages];
  
  // Dédupliquer et trier par createdAt
  const unique = Array.from(new Map(allPriority.map(m => [m.createdAt, m])).values());
  return unique.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
```

### Critère d'acceptance Phase 5

**Test "Export session audit"** :
1. Parcours complet 1 candidat (24 appels)
2. Exporter métriques : `costTracker.getCandidateMetrics(candidateId)`
3. Vérifier : Nombre appels = 24
4. Vérifier : Coût total dans 0,08€-0,12€
5. Vérifier : Latence moyenne < 5s (sauf profil final/matching < 15s)

**Validation** : Test unitaire `testSessionAuditExport()` passe, export JSON valide.

---

## PHASE 6 — TESTS (1.5-3 demi-journées)

### Objectif
Valider end-to-end avec critères d'acceptance stricts.

### Actions

#### 6.1 Test "golden path" complet

**Fichier** : `tests/e2e/goldenPath.test.ts` (nouveau)

**Scénario** :
1. Créer candidat
2. Identité → Tone → Préambule
3. BLOC 1 : 3 questions → 3 réponses → Miroir
4. BLOC 2A : 3 questions adaptatives → 3 réponses
5. BLOC 2B : Questions projectives → Réponses → Miroir 2B
6. BLOCS 3-9 : Questions → Réponses → Miroirs
7. BLOC 10 : Profil final
8. Matching

**Vérifications** :
- Nombre appels API = 24
- Coût total dans 0,08€-0,12€
- UX strict : 1 question = 1 réponse (logs)
- Miroirs respectent format (20+25 mots)
- Profil final contient toutes sections
- Matching contient statut + justification

#### 6.2 Test "reprise session"

**Fichier** : `tests/e2e/sessionResume.test.ts` (nouveau)

**Scénario** :
1. Créer candidat, démarrer BLOC 1
2. Répondre Question 0
3. Simuler reload (nouveau `candidateStore.get()`)
4. Vérifier : `blockQueues.get(1).cursorIndex === 1`
5. Servir Question 1 (sans appel API)
6. Répondre Question 1
7. Vérifier : Question 2 servie (sans appel API)

#### 6.3 Test "réponse longue"

**Fichier** : `tests/e2e/longAnswer.test.ts` (nouveau)

**Scénario** :
1. Répondre avec texte très long (5000 tokens)
2. Vérifier : Historique trimming activé
3. Vérifier : Pas de crash (timeout)
4. Vérifier : Miroir généré correctement

#### 6.4 Test "format cassé"

**Fichier** : `tests/e2e/formatValidation.test.ts` (nouveau)

**Scénario** :
1. Simuler miroir non conforme (mock OpenAI)
2. Vérifier : Retry activé (1 fois)
3. Vérifier : Prompt renforcé injecté
4. Vérifier : Miroir conforme après retry

### Critère d'acceptance final Phase 6

**Checklist** :
- ✅ UX strict 1Q=1R respectée (logs confirment)
- ✅ BLOC 2A/2B intacts et de qualité (tests passent)
- ✅ Profil final + matching identiques en intention au PDF de référence
- ✅ Coût dans 0,08-0,12€ (marge 0,15€)
- ✅ Latence acceptable (<= 15s sur final/matching)

**Validation** : Tous les tests E2E passent, rapport de test généré.

---

## ESTIMATION TEMPS TOTALE

### Répartition par phase

| Phase | Temps | Risque | Complexité |
|-------|-------|--------|------------|
| Phase 0 | 1 demi-journée | 🟢 FAIBLE | Simple inventaire |
| Phase 1 | 1-2 demi-journées | 🟢 FAIBLE | Structures données |
| Phase 2 | 2-3 demi-journées | 🔴 ÉLEVÉ | Orchestrateur complexe |
| Phase 3 | 2-3 demi-journées | 🟡 MOYEN | Adaptation BLOC 2 |
| Phase 4 | 1-2 demi-journées | 🟢 FAIBLE | Prompts |
| Phase 5 | 1.5-2.5 demi-journées | 🟢 FAIBLE | Garde-fous |
| Phase 6 | 1.5-3 demi-journées | 🟢 FAIBLE | Tests |
| **TOTAL** | **10-15 demi-journées** | | |

**Estimation réaliste MVP solide** : **12-14 demi-journées** (2.5-3 semaines)

### Risques techniques identifiés

**🔴 ÉLEVÉ — Phase 2 (Orchestrateur)** :
- **Risque** : Complexité état + queue + décisions
- **Mitigation** : Tests unitaires stricts, diagramme d'état validé avant implémentation

**🟡 MOYEN — Phase 3 (BLOC 2A/2B)** :
- **Risque** : Adaptation + personnalisation peuvent dériver
- **Mitigation** : Validation personnalisation (détection noms œuvres/personnages), retry avec prompt renforcé

**🟢 FAIBLE — Autres phases** :
- Prompts, garde-fous, tests : Exécution standard

---

## ARCHITECTURE PRÉCISE — POINTS D'INTERVENTION

### Fichiers à modifier/créer

**Nouveaux fichiers** :
- `src/services/blockOrchestrator.ts` : Orchestrateur principal
- `src/services/validators.ts` : Validations format/structure
- `src/services/costTracker.ts` : Tracking coût/tokens
- `src/services/historyTrimmer.ts` : Troncature historique
- `src/types/blocks.ts` : Types QuestionQueue, AnswerMap
- `tests/e2e/*.test.ts` : Tests end-to-end

**Fichiers à modifier** :
- `src/types/candidate.ts` : Extension `AxiomCandidate` (blockQueues, answerMaps)
- `src/store/sessionStore.ts` : Méthodes QuestionQueue/AnswerMap
- `src/server.ts` : Intégration orchestrateur (ligne ~650)
- `src/engine/axiomExecutor.ts` : Délégation BLOCS 1-10 à orchestrateur
- `src/engine/prompts.ts` : Fonction `getCompressedPrompt()`

### Point d'entrée principal

**Fichier** : `src/server.ts:POST /axiom` (ligne ~650)

**Modification** :
```typescript
// AVANT
const result = await executeWithAutoContinue(candidate, userMessageText);

// APRÈS
let result: ExecuteAxiomResult;

// États spéciaux (identité, tone, préambule, matching) → executeAxiom()
if ([STEP_01_IDENTITY, STEP_02_TONE, STEP_03_PREAMBULE, STEP_99_MATCHING].includes(candidate.session.ui?.step)) {
  result = await executeWithAutoContinue(candidate, userMessageText);
} else {
  // BLOCS 1-10 → BlockOrchestrator
  const orchestrator = new BlockOrchestrator(candidateStore, costTracker);
  const orchestratorResult = await orchestrator.handleMessage(candidate, userMessageText, event);
  result = mapOrchestratorResultToExecuteResult(orchestratorResult);
}
```

### Logs/metrics indispensables

**Logs à ajouter** :
- `[ORCHESTRATOR] Début bloc N` : Initialisation queue
- `[ORCHESTRATOR] Question servie depuis queue` : Pas d'appel API
- `[ORCHESTRATOR] Génération questions bloc N` : Appel API
- `[ORCHESTRATOR] Miroir généré bloc N` : Appel API
- `[COST_TRACKER] Appel API : bloc=N, type=question, tokens=5000, cost=0.001€`

**Metrics à exporter** :
- Nombre appels API par candidat
- Coût total par candidat
- Latence moyenne par type d'appel
- Taux de retry (validation échouée)
- Taux de trimming historique

**Format export** : JSON `session_audit_{candidateId}.json`

---

## CONCLUSION

**Plan d'exécution validé** : 6 phases, 12-14 demi-journées, risques identifiés et mitigués.

**Prochaines étapes** :
1. Valider diagramme Phase 0 avec équipe
2. Commencer Phase 1 (structures données)
3. Itérer phases 2-6 avec points de contrôle

**FIN DU PLAN D'EXÉCUTION**
