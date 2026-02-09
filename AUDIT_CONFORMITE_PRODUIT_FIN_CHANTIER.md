# 🔍 AUDIT DE CONFORMITÉ PRODUIT — AXIOM / REVELIOM (FIN DE CHANTIER)

**Date** : 2025-01-27  
**Niveau** : Senior / Lead  
**Objectif** : Certification de conformité avant ouverture aux candidats réels  
**Statut** : Code gelé — Analyse uniquement

---

## 📋 RÉSUMÉ EXÉCUTIF

### 🟢 CONFORMITÉS CONFIRMÉES

1. **Architecture FSM** : Fonctionnelle, transitions linéaires, pas de retour en arrière
2. **Contrats API** : `/start` et `/axiom` stables, validation des paramètres
3. **Persistance** : `conversationHistory` et `candidateStore` fonctionnels
4. **Events** : `START_BLOC_1` et `START_MATCHING` propagés correctement
5. **Format miroir REVELIOM** : Validation structurelle présente (sections, longueur, lecture en creux)

### 🟡 FRAGILITÉS IDENTIFIÉES

1. **Mapping step → state** : Logique dupliquée entre `/start` et `/axiom`
2. **Double valeur préambule** : `PREAMBULE_DONE` existe encore
3. **currentBlock** : Mis à jour à plusieurs endroits
4. **Protection double clic** : UI uniquement, pas de garde serveur explicite
5. **Déduplication messages** : Aucune protection contre doublons

### 🔴 NON CONFORMITÉS CRITIQUES (BLOQUANTES)

1. **Validation miroir BLOC 1** : ✅ **CORRIGÉ** (LOT 1 appliqué)
2. **Validation miroir BLOC 2B** : ✅ **CORRIGÉ** (LOT 1 appliqué)
3. **Validation miroir BLOCS 3-9** : ✅ **CORRIGÉ** (LOT 1 appliqué)
4. **Préambule → BLOC 1** : ⚠️ **FRAGILE** — Bouton présent mais logique de détection fragile
5. **Validations sorties** : 🔴 **MANQUANTES** — Profil final et matching non validés structurellement
6. **Streaming** : 🔴 **NON IMPLÉMENTÉ** — Route `/axiom/stream` existe mais non fonctionnelle (GO-blocker)
7. **Ton 3e personne** : ⚠️ **NON CERTIFIABLE** — Pas de validation explicite dans le code

**VERDICT GO/NO-GO** : **🟡 GO CONDITIONNEL** — Corrections LOT 1 appliquées, mais validations sorties et streaming manquants.

---

## 1️⃣ PRÉAMBULE (AVANT BLOC 1)

### Constat actuel

**Fichier** : `src/server.ts:237-278`, `ui-test/app.js:136-199`

**Comportement observé** :
- ✅ Préambule généré et affiché
- ✅ Bouton "Je commence mon profil" affiché quand `step === 'STEP_03_BLOC1'`
- ⚠️ Détection fragile : dépend de `session.ui.step` qui peut être désynchronisé

**Preuve code** :
- `src/server.ts:243-247` : Vérification `derivedStep === STEP_03_BLOC1 || derivedStep === "PREAMBULE_DONE"`
- `ui-test/app.js:137-139` : Affichage bouton si `data.step === 'STEP_03_BLOC1'`
- `src/engine/axiomExecutor.ts:1423-1425` : Vérification préambule dans historique

### Règle contractuelle

**Prompt** : Après préambule, le candidat doit **volontairement** déclencher le BLOC 1 via bouton.

### Écarts identifiés

1. **Détection préambule fragile** :
   - Dépend de `session.ui.step` qui peut être `null` après refresh
   - `deriveStepFromHistory()` vérifie `conversationHistory` mais logique incomplète
   - Constante `PREAMBULE_DONE` existe encore (ligne 245) → confusion possible

2. **Pas de garde serveur explicite** :
   - Si `event === 'START_BLOC_1'` reçu sans préambule → comportement non défini
   - Pas de vérification si préambule existe dans `conversationHistory` avant de démarrer BLOC 1

### Impact produit

- ⚠️ **MOYEN** : Risque de blocage si `session.ui.step` est désynchronisé après refresh
- ⚠️ **MOYEN** : Risque de double déclenchement si bouton cliqué plusieurs fois rapidement

### Hypothèse de correction minimale

**Fichier** : `src/server.ts:651-690`

**Code attendu** :
```typescript
if (event === "START_BLOC_1") {
  // Vérifier que préambule existe dans conversationHistory
  const preambuleInHistory = candidate.conversationHistory?.find(m => m.kind === 'preambule');
  if (!preambuleInHistory) {
    return res.status(200).json({
      sessionId: candidate.candidateId,
      currentBlock: candidate.session.currentBlock,
      state: "wait_start_button",
      response: '',
      step: STEP_03_BLOC1,
      expectsAnswer: false,
      autoContinue: false,
    });
  }
  
  // Garde anti-double : vérifier si BLOC 1 déjà démarré
  const currentBlock = candidate.session.currentBlock;
  if (currentBlock === 1 && candidate.session.ui?.step !== STEP_03_BLOC1) {
    // BLOC 1 déjà démarré → ignorer event
    return res.status(200).json({
      sessionId: candidate.candidateId,
      currentBlock: 1,
      state: "collecting",
      response: '',
      step: candidate.session.ui?.step || BLOC_01,
      expectsAnswer: true,
      autoContinue: false,
    });
  }
  
  // Démarrer BLOC 1
  // ... (reste du code)
}
```

**Effort estimé** : 1 heure

---

## 2️⃣ MIROIRS INTERPRÉTATIFS (TOUS LES BLOCS)

### Constat actuel

**Fichier** : `src/services/blockOrchestrator.ts:182-291` (BLOC 1), `src/services/blockOrchestrator.ts:936-1000` (BLOC 2B), `src/engine/axiomExecutor.ts:1710-1830` (BLOCS 3-9)

**Comportement observé** :
- ✅ **BLOC 1** : Miroir retourné seul, `expectsAnswer: true`, validation détectée via historique
- ✅ **BLOC 2B** : Miroir retourné seul, `expectsAnswer: true`, validation détectée via `step === BLOC_02`
- ✅ **BLOCS 3-9** : `expectsAnswer: true` forcé pour miroirs, transition bloquée si `isMirror && expectsAnswer`

### Règle contractuelle

**REVELIOM** : Un miroir = une question cognitive = arrêt obligatoire. Aucune transition avant validation.

### Écarts identifiés

1. **BLOC 1** : ✅ **CONFORME** (corrigé LOT 1)
   - Détection validation via historique conversationnel
   - Miroir retourné seul
   - Question BLOC 2A générée uniquement après validation

2. **BLOC 2B** : ⚠️ **FRAGILE**
   - Détection validation via `currentStep === BLOC_02` (ligne 938)
   - Si `step` désynchronisé → validation non détectée
   - **Recommandation** : Utiliser historique conversationnel comme BLOC 1

3. **BLOCS 3-9** : ⚠️ **FRAGILE**
   - Détection validation via `candidate.session.ui?.step === currentState` (ligne 1814)
   - Si `step` désynchronisé → validation non détectée
   - **Recommandation** : Utiliser historique conversationnel

### Impact produit

- ⚠️ **MOYEN** : Risque de blocage si `step` désynchronisé après refresh
- ✅ **FAIBLE** : Logique fonctionnelle si `step` cohérent

### Hypothèse de correction minimale

**Fichier** : `src/services/blockOrchestrator.ts:936-1000` (BLOC 2B), `src/engine/axiomExecutor.ts:1776-1806` (BLOCS 3-9)

**Code attendu (BLOC 2B)** :
```typescript
// Vérifier si le miroir a déjà été généré (dernier message assistant est un miroir de BLOC 2B)
const conversationHistory = currentCandidate.conversationHistory || [];
const lastAssistantMessage = [...conversationHistory]
  .reverse()
  .find(m => m.role === 'assistant' && m.kind === 'mirror' && m.block === blockNumber);

if (lastAssistantMessage && userMessage) {
  // Validation miroir BLOC 2B
  // ... (reste du code)
}
```

**Code attendu (BLOCS 3-9)** :
```typescript
// Vérifier si c'est une validation miroir (dernier message assistant est un miroir)
const conversationHistory = candidate.conversationHistory || [];
const lastAssistantMessage = [...conversationHistory]
  .reverse()
  .find(m => m.role === 'assistant' && m.kind === 'mirror' && m.block === blocNumber);

if (lastAssistantMessage && userMessage && blocNumber >= 3 && blocNumber <= 9) {
  // Validation miroir
  candidateStore.appendMirrorValidation(candidate.candidateId, blocNumber, userMessage);
  // ... (reste du code)
}
```

**Effort estimé** : 2 heures

---

## 3️⃣ BOUTONS / VALIDATIONS UI

### Constat actuel

**Fichier** : `ui-test/app.js:167-233`, `src/server.ts:651-690`, `src/engine/axiomExecutor.ts:1902-1931`

**Boutons identifiés** :
1. **"Je commence mon profil"** (après préambule)
   - ✅ Affiché si `step === 'STEP_03_BLOC1'`
   - ✅ Désactivé après clic (`startButton.disabled = true`)
   - ⚠️ Pas de garde serveur explicite

2. **"Je génère mon matching"** (après profil final)
   - ✅ Affiché si `step === 'STEP_99_MATCH_READY' && expectsAnswer === false`
   - ✅ Désactivé après clic (`matchingButton.disabled = true`)
   - ⚠️ Pas de garde serveur explicite

### Règle contractuelle

Tous les boutons doivent être **idempotents** (anti double clic / refresh).

### Écarts identifiés

1. **Protection UI uniquement** :
   - Boutons désactivés côté frontend
   - Pas de vérification serveur si action déjà effectuée

2. **Pas de déduplication messages** :
   - `appendUserMessage()` ne vérifie pas les doublons
   - Risque de duplication si retry réseau

### Impact produit

- ⚠️ **MOYEN** : Risque de double génération si protection UI échoue (bug réseau, latence)

### Hypothèse de correction minimale

**Fichier** : `src/server.ts:651-690` (START_BLOC_1), `src/engine/axiomExecutor.ts:1902-1931` (START_MATCHING), `src/store/sessionStore.ts:385-403` (appendUserMessage)

**Code attendu (START_BLOC_1)** :
```typescript
if (event === "START_BLOC_1") {
  // Garde anti-double : vérifier si BLOC 1 déjà démarré
  const currentBlock = candidate.session.currentBlock;
  if (currentBlock === 1 && candidate.session.ui?.step !== STEP_03_BLOC1) {
    // BLOC 1 déjà démarré → ignorer event
    return res.status(200).json({
      sessionId: candidate.candidateId,
      currentBlock: 1,
      state: "collecting",
      response: '',
      step: candidate.session.ui?.step || BLOC_01,
      expectsAnswer: true,
      autoContinue: false,
    });
  }
  // ... (reste du code)
}
```

**Code attendu (START_MATCHING)** :
```typescript
if (currentState === STEP_99_MATCH_READY) {
  // Garde anti-double : vérifier si matching déjà généré
  if (candidate.matchingResult) {
    return {
      response: candidate.matchingResult.text || '',
      step: DONE_MATCHING,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false,
    };
  }
  // ... (reste du code)
}
```

**Code attendu (appendUserMessage)** :
```typescript
appendUserMessage(candidateId: string, content: string, meta?: {...}): void {
  // Déduplication : vérifier si le dernier message utilisateur est identique
  const history = candidate.conversationHistory || [];
  const lastUserMessage = history.filter(m => m.role === 'user').pop();
  
  if (lastUserMessage && 
      lastUserMessage.content === content && 
      Date.now() - new Date(lastUserMessage.createdAt).getTime() < 5000) {
    // Doublon détecté → ignorer
    console.warn(`[STORE] Doublon message détecté pour ${candidateId}, ignoré`);
    return;
  }
  // ... (reste du code)
}
```

**Effort estimé** : 2 heures

---

## 4️⃣ CHAÎNAGE DES BLOCS (FSM)

### Constat actuel

**Fichier** : `src/engine/axiomExecutor.ts:1086-2109`, `src/services/blockOrchestrator.ts:124-1745`

**Transitions identifiées** :
- ✅ Préambule → BLOC 1 : Via bouton `START_BLOC_1`
- ✅ BLOC 1 → BLOC 2A : Après validation miroir BLOC 1
- ✅ BLOC 2A → BLOC 2B : Automatique (3 réponses stockées)
- ✅ BLOC 2B → BLOC 3 : Après validation miroir BLOC 2B
- ✅ BLOCS 3-9 : Après validation miroir chaque bloc
- ✅ BLOC 10 → MATCH_READY : Automatique (profil final généré)
- ✅ MATCH_READY → MATCHING : Via bouton `START_MATCHING`

### Règle contractuelle

Toutes les transitions doivent être **explicites** et **volontaires** (sauf transitions automatiques documentées).

### Écarts identifiés

1. **Mapping step → state dupliqué** :
   - `src/server.ts:72-90` : Fonction `mapStepToState()`
   - `src/server.ts:271` : Logique locale pour états avancés
   - Risque d'incohérence si logique locale diverge

2. **currentBlock mis à jour à plusieurs endroits** :
   - `src/services/blockOrchestrator.ts:224-227, 944-947` : Mise à jour par orchestrateur
   - `src/engine/axiomExecutor.ts:1839-1842` : Mise à jour par executeAxiom
   - Risque d'incohérence

3. **Double valeur préambule** :
   - Constante `PREAMBULE_DONE` existe encore (ligne 245 `src/server.ts`)
   - Confusion possible avec `STEP_03_BLOC1`

### Impact produit

- ⚠️ **FAIBLE** : Risque d'incohérence si logique dupliquée diverge
- ⚠️ **FAIBLE** : Confusion possible avec `PREAMBULE_DONE`

### Hypothèse de correction minimale

**Fichier** : `src/server.ts:271, 245`, `src/store/sessionStore.ts` (nouvelle méthode)

**Code attendu** :
```typescript
// Supprimer logique locale ligne 271, utiliser mapStepToState()
state: mapStepToState(derivedStep),

// Supprimer PREAMBULE_DONE ligne 245
if (
  derivedStep === STEP_03_BLOC1 ||
  // Supprimer "PREAMBULE_DONE"
  (derivedStep && derivedStep.startsWith('BLOC_'))
) {
  // ...
}

// Créer méthode unique updateCurrentBlock()
updateCurrentBlock(candidateId: string, blockNumber: number): void {
  // ... (logique centralisée)
}
```

**Effort estimé** : 1.5 heures

---

## 5️⃣ SORTIE PROFIL FINAL (BLOC 10)

### Constat actuel

**Fichier** : `src/engine/axiomExecutor.ts:1822-1826`, `src/engine/prompts.ts:1300-1416`

**Comportement observé** :
- ✅ Profil final généré et stocké via `setFinalProfileText()`
- ❌ **Aucune validation structurelle** dans le code
- ❌ **Aucune vérification** des sections obligatoires
- ❌ **Aucune vérification** de l'ordre des sections
- ❌ **Aucune vérification** des textes fixes obligatoires

### Règle contractuelle

**Prompt** (`src/engine/prompts.ts:1306-1416`) :
- Structure obligatoire : 7 sections dans l'ordre exact
- Textes fixes obligatoires (lignes 1369-1416)
- Ton mentor (2e personne uniquement)
- Aucune question
- Aucune 3e personne

### Écarts identifiés

1. **Pas de validation structurelle** :
   - Aucune vérification des sections obligatoires
   - Aucune vérification de l'ordre
   - Aucune vérification des textes fixes

2. **Pas de validation ton** :
   - Aucune détection de 3e personne
   - Aucune vérification adresse directe (2e personne)

### Impact produit

- 🔴 **ÉLEVÉ** : Risque de profil invalide non détecté
- 🔴 **ÉLEVÉ** : Risque de non-conformité prompt non détectée

### Hypothèse de correction minimale

**Fichier** : `src/services/validators.ts` (nouveau ou extension), `src/engine/axiomExecutor.ts:1822-1826`

**Code attendu** :
```typescript
// Créer validateFinalProfile() dans validators.ts
export function validateFinalProfile(content: string): ValidationResult {
  const errors: string[] = [];
  
  // Sections obligatoires (dans l'ordre)
  const requiredSections = [
    { emoji: '🔥', name: 'Ce qui te met vraiment en mouvement' },
    { emoji: '🧱', name: 'Comment tu tiens dans le temps' },
    { emoji: '⚖️', name: 'Tes valeurs quand il faut agir' },
    { emoji: '🧩', name: 'Ce que révèlent tes projections' },
    { emoji: '🛠️', name: 'Tes vraies forces… et tes vraies limites' },
    { emoji: '🎯', name: 'Ton positionnement professionnel naturel' },
    { emoji: '🧠', name: 'Lecture globale — synthèse émotionnelle courte' },
  ];
  
  // Vérifier présence et ordre
  // ... (logique de validation)
  
  // Vérifier textes fixes
  const fixedText1 = "Si, en lisant ça, tu t'es dit :\n👉 « oui… c'est exactement moi »";
  const fixedText2 = "🔥 ET SI CE PROFIL SERVAIT À QUELQUE CHOSE DE VRAIMENT CONCRET ?";
  
  // Vérifier absence de question
  if (content.trim().endsWith('?')) {
    errors.push("Profil final ne doit pas se terminer par une question");
  }
  
  return { valid: errors.length === 0, errors };
}

// Intégrer dans axiomExecutor.ts
} else if (!expectsAnswer && blocNumber === 10) {
  nextState = STEP_99_MATCH_READY;
  
  // Valider structure profil final
  const validation = validateFinalProfile(aiText || '');
  if (!validation.valid) {
    console.warn('[AXIOM_EXECUTOR] Profil final non conforme:', validation.errors);
    // Retry avec prompt renforcé (1 seule fois)
    // ... (logique retry)
  }
  
  candidateStore.setFinalProfileText(candidate.candidateId, aiText);
}
```

**Effort estimé** : 4 heures

---

## 6️⃣ SORTIE MATCHING FINAL

### Constat actuel

**Fichier** : `src/engine/axiomExecutor.ts:1955-2017`, `src/engine/prompts.ts:1543-1721`

**Comportement observé** :
- ✅ Matching généré et stocké via `setMatchingResult()`
- ❌ **Aucune validation structurelle** dans le code
- ❌ **Aucune vérification** du bandeau exact
- ❌ **Aucune vérification** des sections obligatoires
- ❌ **Aucune vérification** des sections conditionnelles

### Règle contractuelle

**Prompt** (`src/engine/prompts.ts:1547-1721`) :
- Bandeau exact : `━━━━━━━━━━━━━━━━━━`, `🟢 / 🔵 / 🟠 MATCHING AXIOM — [ISSUE]`
- 1 phrase de verdict clair
- 1 paragraphe explicatif maximum
- Sections obligatoires : 🔎 Lecture de compatibilité, 🧭 Cadrage humain, 🚀 POUR ALLER PLUS LOIN
- Sections conditionnelles : 💼 PROJECTION CONCRÈTE, 🧭 LE CADRE (si aligné/conditionnel uniquement)
- Texte fixe obligatoire (exemple chiffré ligne 1647-1648)
- Aucune question
- Aucune suggestion externe

### Écarts identifiés

1. **Pas de validation structurelle** :
   - Aucune vérification du bandeau exact
   - Aucune vérification des sections obligatoires
   - Aucune vérification des sections conditionnelles selon issue

2. **Pas de validation contenu** :
   - Aucune vérification texte fixe obligatoire
   - Aucune vérification absence de question

### Impact produit

- 🔴 **ÉLEVÉ** : Risque de matching invalide non détecté
- 🔴 **ÉLEVÉ** : Risque de non-conformité prompt non détectée

### Hypothèse de correction minimale

**Fichier** : `src/services/validators.ts` (extension), `src/engine/axiomExecutor.ts:1955-2017`

**Code attendu** :
```typescript
// Créer validateMatching() dans validators.ts
export function validateMatching(content: string): ValidationResult {
  const errors: string[] = [];
  
  // Vérifier bandeau exact
  const bandeauRegex = /━━━━━━━━━━━━━━━━━━\s*[🟢🔵🟠]\s*MATCHING AXIOM\s*—\s*\[(ALIGNÉ|ALIGNEMENT CONDITIONNEL|PAS ALIGNÉ ACTUELLEMENT)\]\s*━━━━━━━━━━━━━━━━━━/i;
  if (!bandeauRegex.test(content)) {
    errors.push("Bandeau matching manquant ou incorrect");
  }
  
  // Vérifier sections obligatoires
  const hasLectureCompatibilite = /🔎\s*Lecture de compatibilité/i.test(content);
  const hasCadrageHumain = /🧭\s*Cadrage humain/i.test(content);
  const hasPourAllerPlusLoin = /🚀\s*POUR ALLER PLUS LOIN/i.test(content);
  
  // Vérifier sections conditionnelles selon issue
  const issueMatch = content.match(/\[(ALIGNÉ|ALIGNEMENT CONDITIONNEL|PAS ALIGNÉ ACTUELLEMENT)\]/i);
  if (issueMatch) {
    const issue = issueMatch[1].toUpperCase();
    if (issue === 'ALIGNÉ' || issue === 'ALIGNEMENT CONDITIONNEL') {
      // Vérifier présence PROJECTION CONCRÈTE et LE CADRE
    } else if (issue === 'PAS ALIGNÉ ACTUELLEMENT') {
      // Vérifier absence PROJECTION CONCRÈTE et LE CADRE
    }
  }
  
  // Vérifier texte fixe obligatoire
  const fixedText = "Une entreprise qui consomme 100 MWh par an sur un contrat de 4 ans";
  if (!content.includes(fixedText)) {
    errors.push("Texte fixe obligatoire (exemple chiffré) manquant");
  }
  
  // Vérifier absence de question
  if (content.trim().endsWith('?')) {
    errors.push("Matching ne doit pas se terminer par une question");
  }
  
  return { valid: errors.length === 0, errors };
}

// Intégrer dans axiomExecutor.ts
if (typeof completion === 'string' && completion.trim()) {
  aiText = completion.trim();
  
  // Valider structure matching
  const validation = validateMatching(aiText);
  if (!validation.valid) {
    console.warn('[AXIOM_EXECUTOR] Matching non conforme:', validation.errors);
    // Retry avec prompt renforcé (1 seule fois)
    // ... (logique retry)
  }
}
```

**Effort estimé** : 4 heures

---

## 7️⃣ STREAMING / UX PERÇUE

### Constat actuel

**Fichier** : `src/server.ts:940-993`, `ui-test/app.js:106-129`

**Comportement observé** :
- ❌ Route `/axiom/stream` existe mais **non fonctionnelle** (ligne 984 : `NOT_IMPLEMENTED`)
- ⚠️ Affichage progressif partiel pour miroirs (`progressiveDisplay`, `mirrorSections`)
- ❌ Pas de streaming serveur réel
- ❌ Pas de messageId pour anti-doublons
- ❌ Pas de conformité S1-S4

### Règle contractuelle

**S1** : Streaming ne doit pas casser la FSM (step/state/expectsAnswer déterminés avant 1er chunk)  
**S2** : Aucune double intention (miroir + question dans même message)  
**S3** : Verrou miroir obligatoire (input actif uniquement après fin streaming + expectsAnswer=true)  
**S4** : Idempotence (messageId stable, front ignore chunks obsolètes)

### Écarts identifiés

1. **Streaming non implémenté** :
   - Route `/axiom/stream` retourne `NOT_IMPLEMENTED`
   - Pas de streaming réel (SSE ou WebSocket)
   - Pas de `callOpenAIStream()` fonctionnel

2. **Affichage progressif partiel** :
   - Découpage miroirs en sections côté frontend
   - Pas de streaming serveur
   - Pas de messageId

3. **Pas de conformité S1-S4** :
   - Pas de détermination step/state/expectsAnswer avant streaming
   - Pas de messageId pour anti-doublons
   - Pas de verrou input pendant streaming

### Impact produit

- 🔴 **ÉLEVÉ** : Latence perçue élevée (contenus longs affichés d'un bloc)
- 🔴 **ÉLEVÉ** : Impression "robot" / "rapport figé"
- 🔴 **GO-BLOCKER** : Streaming obligatoire pour contenus longs

### Hypothèse de correction minimale

**Fichier** : `src/services/openaiClient.ts` (nouveau), `src/server.ts:940-993` (implémentation complète), `ui-test/app.js` (gestion SSE)

**Code attendu** :
```typescript
// Créer callOpenAIStream() dans openaiClient.ts
export async function* callOpenAIStream(
  messages: Array<{ role: string; content: string }>
): AsyncGenerator<string, void, unknown> {
  // ... (implémentation SSE avec OpenAI stream API)
}

// Implémenter route /axiom/stream dans server.ts
app.post("/axiom/stream", async (req: Request, res: Response) => {
  // Déterminer step/state/expectsAnswer AVANT streaming (S1)
  // Générer messageId unique (S4)
  // Streamer contenu chunk par chunk
  // Envoyer métadonnées initiales
  // Envoyer chunks avec messageId
  // Envoyer chunk final avec isFinal: true
});

// Gérer SSE côté frontend dans app.js
async function callAxiomStream(message, event = null) {
  // ... (gestion SSE, messageId, activation input après fin streaming)
}
```

**Effort estimé** : 16 heures

---

## 8️⃣ CHARGE / STABILITÉ SERVEUR

### Constat actuel

**Fichier** : `src/store/sessionStore.ts`, `src/engine/axiomExecutor.ts`, `src/services/blockOrchestrator.ts`

**Architecture observée** :
- ✅ Store in-memory (`Map<string, AxiomCandidate>`)
- ✅ Persistance Redis (si `REDIS_URL` présent)
- ✅ Persistance fichier (fallback si pas Redis)
- ✅ Debounce persistance fichier (200ms)

### Estimation charge

**Plan actuel** :
- Store in-memory : **~100-200 candidats simultanés** (estimation)
- Redis : **~1000+ candidats simultanés** (selon config Redis)
- Fichier : **~10-20 candidats simultanés** (limite I/O disque)

**Goulots d'étranglement potentiels** :
1. **Appels LLM** : Latence OpenAI (2-15s selon contenu)
2. **Store in-memory** : Pas de limite explicite, risque OOM si >1000 candidats
3. **Persistance fichier** : I/O disque séquentiel (debounce 200ms)

### Risques réels

1. **Crash serveur** :
   - ⚠️ **MOYEN** : Store in-memory perdu si process crash (sauf Redis/file)
   - ⚠️ **FAIBLE** : Redis persiste, fichier persiste (mais risque corruption)

2. **Désynchro** :
   - ⚠️ **FAIBLE** : Store in-memory = source de vérité unique
   - ⚠️ **FAIBLE** : Redis/file = backup, pas source de vérité

3. **Charge simultanée** :
   - ⚠️ **MOYEN** : Store in-memory limité (~100-200 candidats)
   - ✅ **FAIBLE** : Redis scalable (selon config)

### Hypothèse de correction minimale

**Recommandations** :
1. **Limite store in-memory** : Ajouter LRU cache (max 200 candidats)
2. **Monitoring** : Ajouter logs métriques (nombre candidats actifs, latence LLM)
3. **Redis obligatoire** : Pour production (pas de fallback fichier)

**Effort estimé** : 4 heures (monitoring), 8 heures (LRU cache)

---

## 📊 PLAN D'ACTION PAR LOTS

### LOT 1 — Validation miroirs ✅ **TERMINÉ**

**Corrections appliquées** :
- ✅ BLOC 1 : Miroir seul, validation via historique
- ✅ BLOC 2B : Miroir seul, validation via step
- ✅ BLOCS 3-9 : expectsAnswer: true forcé, transition bloquée

**Effort** : 18 heures (déjà effectué)

---

### LOT 2 — Renforcement détection validation miroir

**Objectif** : Utiliser historique conversationnel pour BLOC 2B et BLOCS 3-9 (comme BLOC 1)

**Fichiers** :
- `src/services/blockOrchestrator.ts:936-1000` (BLOC 2B)
- `src/engine/axiomExecutor.ts:1776-1806` (BLOCS 3-9)

**Effort estimé** : 2 heures

---

### LOT 3 — Gardes serveur anti-doubles

**Objectif** : Ajouter gardes serveur pour START_BLOC_1, START_MATCHING, et déduplication messages

**Fichiers** :
- `src/server.ts:651-690` (START_BLOC_1)
- `src/engine/axiomExecutor.ts:1902-1931` (START_MATCHING)
- `src/store/sessionStore.ts:385-403` (appendUserMessage)

**Effort estimé** : 2 heures

---

### LOT 4 — Validations sorties (profil final + matching)

**Objectif** : Ajouter validation structurelle pour profil final et matching

**Fichiers** :
- `src/services/validators.ts` (nouveau ou extension)
- `src/engine/axiomExecutor.ts:1822-1826` (profil final)
- `src/engine/axiomExecutor.ts:1955-2017` (matching)

**Effort estimé** : 8 heures

---

### LOT 5 — Streaming (GO-BLOCKER)

**Objectif** : Implémenter streaming complet avec conformité S1-S4

**Fichiers** :
- `src/services/openaiClient.ts` (nouveau `callOpenAIStream()`)
- `src/server.ts:940-993` (implémentation route `/axiom/stream`)
- `ui-test/app.js` (gestion SSE frontend)

**Effort estimé** : 16 heures

---

### LOT 6 — Nettoyage (fragile)

**Objectif** : Unifier mapping step→state, supprimer PREAMBULE_DONE, centraliser currentBlock

**Fichiers** :
- `src/server.ts:271, 245`
- `src/store/sessionStore.ts` (nouvelle méthode `updateCurrentBlock()`)

**Effort estimé** : 1.5 heures

---

### LOT 7 — Préambule (fragile)

**Objectif** : Renforcer détection préambule et garde serveur START_BLOC_1

**Fichiers** :
- `src/server.ts:651-690`

**Effort estimé** : 1 heure

---

## ✅ CHECKLIST GO / NO-GO CANDIDATS RÉELS

### Conditions techniques (bloquantes)

- [ ] **T1** : Validation miroir BLOC 1 fonctionnelle
- [ ] **T2** : Validation miroir BLOC 2B fonctionnelle
- [ ] **T3** : Validation miroir BLOCS 3-9 fonctionnelle
- [ ] **T4** : Aucune double question / concaténation
- [ ] **T5** : Refresh safe à chaque étape
- [ ] **T6** : Boutons protégés UI + serveur
- [ ] **T7** : Aucun double déclenchement possible
- [ ] **T8** : Streaming fonctionnel (GO-BLOCKER)

### Conditions produit (bloquantes)

- [ ] **P1** : Ton mentor stable
- [ ] **P2** : Adresse directe au candidat (2e personne)
- [ ] **P3** : Structure profil final respectée
- [ ] **P4** : Format matching respecté

### Conditions expérience (bloquantes)

- [ ] **E1** : Temps de réponse acceptable (< 3s questions, < 5s miroirs, < 15s profil/matching)
- [ ] **E2** : Aucun sentiment de bug ou saut
- [ ] **E3** : Progression claire
- [ ] **E4** : Sentiment de dialogue réel

### Tests streaming (GO-BLOCKER)

- [ ] **TS1** : Miroir BLOC 1 streamé : pas de question 2A, input actif fin
- [ ] **TS2** : Miroir BLOC 2B streamé : pas de question 3, input actif fin
- [ ] **TS3** : Miroirs 3-9 streamés : pas de transition auto, input actif fin
- [ ] **TS4** : Profil final streamé : bouton matching après fin, aucune question
- [ ] **TS5** : Matching streamé : DONE propre, aucune question
- [ ] **TS6** : Anti-double : double clic/refresh/latence ne duplique rien

---

## 🎯 VERDICT FINAL

### 🟡 GO CONDITIONNEL

**Raisons** :
- ✅ LOT 1 (validation miroirs) terminé
- ⚠️ Validations sorties manquantes (LOT 4)
- 🔴 Streaming non implémenté (LOT 5 - GO-BLOCKER)
- ⚠️ Gardes serveur manquantes (LOT 3)

**Corrections nécessaires avant GO** :
- LOT 4 : Validations sorties (8h)
- LOT 5 : Streaming (16h)
- LOT 3 : Gardes serveur (2h)
- **Total** : **26 heures** (3.25 jours)

**Recommandation** : Appliquer LOT 3, LOT 4, et LOT 5 avant ouverture aux candidats réels.

---

**FIN DE L'AUDIT DE CONFORMITÉ PRODUIT**
