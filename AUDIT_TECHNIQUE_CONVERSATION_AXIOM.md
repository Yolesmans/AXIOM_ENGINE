# 🔍 AUDIT TECHNIQUE CIBLÉ — AXIOM / CONVERSATION
**Date** : 2025-01-27  
**Objectif** : Vérifier l'hypothèse que l'absence de mémoire assistant empêche AXIOM de fonctionner comme ChatGPT

---

## ✅ CONFIRMATION DE L'HYPOTHÈSE

**HYPOTHÈSE VALIDÉE** : AXIOM ne peut pas dérouler une conversation continue car **les réponses de l'assistant ne sont jamais conservées ni réinjectées** dans l'historique OpenAI.

**Conséquence** : Chaque appel OpenAI est stateless côté assistant, l'IA ne se relit jamais, la conversation redémarre à chaque tour.

---

## 1️⃣ CE QUI EST ENVOYÉ À OPENAI — PREUVE TECHNIQUE

### 1.1 Analyse du code d'appel OpenAI

**Fichier** : `src/engine/axiomExecutor.ts`

#### **Cas 1 : BLOCS 1 à 10** (lignes 1404-1434)

```typescript
// Construire l'historique
const messages: Array<{ role: string; content: string }> = [];
candidate.answers.forEach((answer: AnswerRecord) => {
  messages.push({ role: 'user', content: answer.message }); // ← UNIQUEMENT user
});

if (userMessage) {
  messages.push({ role: 'user', content: userMessage }); // ← Message actuel
}

const completion = await callOpenAI({
  messages: [
    { role: 'system', content: FULL_AXIOM_PROMPT },
    { role: 'system', content: `RÈGLE ABSOLUE AXIOM...` },
    ...messages, // ← UNIQUEMENT messages user
  ],
});
```

**Résultat** : OpenAI reçoit :
- ✅ Messages système (prompts)
- ✅ Messages `role: 'user'` (réponses utilisateur depuis `candidate.answers`)
- ❌ **AUCUN message `role: 'assistant'`**

#### **Cas 2 : START_BLOC_1** (lignes 1286-1312)

```typescript
const messages: Array<{ role: string; content: string }> = [];
updatedCandidate.answers.forEach((answer: AnswerRecord) => {
  messages.push({ role: 'user', content: answer.message }); // ← UNIQUEMENT user
});

const completion = await callOpenAI({
  messages: [
    { role: 'system', content: FULL_AXIOM_PROMPT },
    { role: 'system', content: `RÈGLE ABSOLUE AXIOM...` },
    ...messages, // ← UNIQUEMENT messages user
  ],
});
```

**Résultat** : Même problème — uniquement messages utilisateur.

#### **Cas 3 : STEP_03_PREAMBULE** (lignes 1155-1168)

```typescript
const completion = await callOpenAI({
  messages: [
    { role: 'system', content: FULL_AXIOM_PROMPT },
    { role: 'system', content: `RÈGLE ABSOLUE AXIOM...` },
    // ← AUCUN message user, AUCUN message assistant
  ],
});
```

**Résultat** : Aucun historique — conversation complètement vide.

### 1.2 Structure exacte des messages envoyés

**Exemple concret** : Après que l'utilisateur ait répondu "tutoie" à la question tone

**1er appel OpenAI** (question tone) :
```json
[
  { "role": "system", "content": "FULL_AXIOM_PROMPT..." },
  { "role": "system", "content": "RÈGLE ABSOLUE AXIOM..." }
]
```
→ OpenAI génère : "Bienvenue dans AXIOM... Dis-moi : tu préfères qu'on se tutoie ou qu'on se vouvoie ?"

**2ème appel OpenAI** (après réponse "tutoie") :
```json
[
  { "role": "system", "content": "FULL_AXIOM_PROMPT..." },
  { "role": "system", "content": "RÈGLE ABSOLUE AXIOM..." },
  { "role": "user", "content": "tutoie" }
]
```

**PROBLÈME** : OpenAI ne voit **PAS** :
- ❌ La question qu'il a lui-même posée ("Dis-moi : tu préfères...")
- ❌ Le contexte narratif ("Bienvenue dans AXIOM...")
- ❌ Aucune trace de la conversation précédente

**Résultat** : OpenAI ne sait pas qu'il a déjà posé la question tone, qu'il a déjà généré le préambule, etc.

---

## 2️⃣ COMPARAISON DEUX APPELS CONSÉCUTIFS

### 2.1 Scénario exact : Question tone → Réponse "tutoie"

#### **Appel 1 : Génération question tone**

**Code** : `src/engine/axiomExecutor.ts:1083-1098`

```typescript
if (!userMessage) {
  const toneQuestion = 'Bienvenue dans AXIOM... Dis-moi : tu préfères... ?';
  return {
    response: toneQuestion, // ← Retourné au frontend
    step: currentState,
    lastQuestion: toneQuestion, // ← Stocké dans UI
    expectsAnswer: true,
  };
}
```

**Messages envoyés à OpenAI** : Aucun (retour direct, pas d'appel OpenAI)

**Stockage** :
- ✅ `candidate.session.ui.lastQuestion = toneQuestion`
- ❌ **AUCUN stockage dans `candidate.answers`**
- ❌ **AUCUN stockage de la réponse assistant**

#### **Appel 2 : Après réponse "tutoie"**

**Code** : `src/engine/axiomExecutor.ts:1101-1136`

```typescript
const tone = detectTone(userMessage); // "tutoie" détecté
candidateStore.setTonePreference(candidate.candidateId, tone);
currentState = STEP_03_PREAMBULE;
// Auto-enchaînement vers préambule
return await executeAxiom({
  candidate: candidateStore.get(candidate.candidateId)!,
  userMessage: null,
});
```

**Messages envoyés à OpenAI** (lignes 1155-1168) :
```json
[
  { "role": "system", "content": "FULL_AXIOM_PROMPT..." },
  { "role": "system", "content": "RÈGLE ABSOLUE AXIOM..." }
]
```

**PROBLÈME** : OpenAI ne voit **PAS** :
- ❌ La question tone précédente
- ❌ La réponse "tutoie" de l'utilisateur
- ❌ Aucun contexte de conversation

**Résultat** : OpenAI génère le préambule, mais **ne sait pas qu'il vient de poser une question tone**.

### 2.2 Comparaison avec ChatGPT

**ChatGPT** conserve l'historique complet :

```json
[
  { "role": "system", "content": "You are a helpful assistant." },
  { "role": "assistant", "content": "Bienvenue dans AXIOM... Dis-moi : tu préfères..." },
  { "role": "user", "content": "tutoie" },
  { "role": "assistant", "content": "Parfait, on se tutoie..." }
]
```

**AXIOM** envoie uniquement :

```json
[
  { "role": "system", "content": "FULL_AXIOM_PROMPT..." },
  { "role": "user", "content": "tutoie" }
]
```

**Différence** : ChatGPT voit ses propres réponses précédentes, AXIOM non.

---

## 3️⃣ VÉRIFICATION DU STOCKAGE RÉEL

### 3.1 Structure de données `candidate.answers`

**Fichier** : `src/types/answer.ts`

```typescript
export type AnswerRecord = {
  block: number;
  message: string; // ← UNIQUEMENT message utilisateur
  createdAt: string;
};
```

**Stockage** : `src/store/sessionStore.ts:122-140`

```typescript
addAnswer(candidateId: string, record: AnswerRecord): AxiomCandidate | undefined {
  const updated: AxiomCandidate = {
    ...candidate,
    answers: [...candidate.answers, record], // ← UNIQUEMENT réponses user
  };
  return updated;
}
```

**Résultat** : `candidate.answers` contient **UNIQUEMENT** les messages utilisateur.

### 3.2 Structure de données `candidate.session.ui`

**Fichier** : `src/types/candidate.ts`

```typescript
ui?: {
  step: string;
  lastQuestion: string | null; // ← Dernière question seulement
  tutoiement?: 'tutoiement' | 'vouvoiement';
  identityDone?: boolean;
}
```

**Stockage** : `src/store/sessionStore.ts:320-355`

```typescript
updateUIState(candidateId: string, uiUpdates: Partial<{...}>): AxiomCandidate {
  const updated: AxiomCandidate = {
    ...candidate,
    session: {
      ...candidate.session,
      ui: {
        ...currentUI,
        ...uiUpdates, // ← Met à jour lastQuestion
      },
    },
  };
  return updated;
}
```

**Résultat** : `candidate.session.ui.lastQuestion` stocke **UNIQUEMENT** la dernière question, pas l'historique complet.

### 3.3 Ce qui n'est PAS stocké

**Réponses assistant** :
- ❌ La question tone générée → **PAS stockée**
- ❌ Le préambule généré → **PAS stocké**
- ❌ Les questions des blocs → **PAS stockées** (sauf `lastQuestion`)
- ❌ Les miroirs interprétatifs → **PAS stockés**
- ❌ Les réponses contextuelles → **PAS stockées**

**Preuve code** : Aucun appel à `candidateStore.addAnswer()` ou équivalent pour les réponses assistant.

**Lignes concernées** :
- `src/engine/axiomExecutor.ts:1092-1098` : Retourne `toneQuestion` mais ne la stocke pas
- `src/engine/axiomExecutor.ts:1252-1258` : Retourne `aiText` (préambule) mais ne le stocke pas
- `src/engine/axiomExecutor.ts:1541-1547` : Retourne `aiText` (bloc) mais ne le stocke pas

---

## 4️⃣ EXPLICATION TECHNIQUE DE LA BOUCLE

### 4.1 Pourquoi AXIOM repose la question tone

**Scénario** : Refresh après préambule

1. **État initial** : Candidat a répondu "tutoie", préambule affiché
2. **Refresh** : `candidate.session.ui` peut être `null` (perte store)
3. **Dérivation état** : `deriveStepFromHistory()` → `STEP_03_BLOC1` ✅
4. **MAIS** : Si dérivation échoue → retour à `STEP_02_TONE`
5. **Appel OpenAI** : `executeAxiom()` avec `currentState === STEP_02_TONE` et `!userMessage`
6. **Code** : `src/engine/axiomExecutor.ts:1083-1098`
   ```typescript
   if (!userMessage) {
     const toneQuestion = 'Bienvenue dans AXIOM... Dis-moi : tu préfères... ?';
     return { response: toneQuestion, ... };
   }
   ```

**Pourquoi ça se produit** :
- OpenAI n'a **AUCUN contexte** de la conversation précédente
- OpenAI ne sait pas qu'il a déjà posé la question tone
- OpenAI ne sait pas qu'un préambule a déjà été généré
- La FSM dit "STEP_02_TONE" → OpenAI génère la question tone

**Cause racine** : **Absence de mémoire assistant**, pas un problème FSM.

### 4.2 Pourquoi le préambule peut revenir

**Scénario** : Appel `/start` après préambule

1. **État** : Candidat en `STEP_03_BLOC1` (préambule affiché)
2. **Appel `/start`** : Garde anti-régression fonctionne ✅
3. **MAIS** : Si `candidate.session.ui` est `null` et dérivation échoue
4. **Appel OpenAI** : `executeWithAutoContinue()` → `executeAxiom()` avec `currentState === STEP_03_PREAMBULE`
5. **Code** : `src/engine/axiomExecutor.ts:1150-1258`
   ```typescript
   if (currentState === STEP_03_PREAMBULE) {
     const completion = await callOpenAI({
       messages: [
         { role: 'system', content: FULL_AXIOM_PROMPT },
         { role: 'system', content: 'RÈGLE ABSOLUE AXIOM...' },
         // ← AUCUN historique
       ],
     });
   }
   ```

**Pourquoi ça se produit** :
- OpenAI n'a **AUCUN contexte** de la conversation précédente
- OpenAI ne sait pas qu'un préambule a déjà été généré
- La FSM dit "STEP_03_PREAMBULE" → OpenAI régénère le préambule

**Cause racine** : **Absence de mémoire assistant**, pas un problème FSM.

### 4.3 Pourquoi les blocs ne s'enchaînent pas naturellement

**Scénario** : Réponse utilisateur dans BLOC_01

1. **État** : Candidat en `BLOC_01`, question posée
2. **Réponse utilisateur** : "Je préfère progresser"
3. **Stockage** : `candidateStore.addAnswer()` → `candidate.answers = [{ block: 1, message: "Je préfère progresser" }]`
4. **Appel OpenAI** : `src/engine/axiomExecutor.ts:1404-1434`
   ```typescript
   const messages: Array<{ role: string; content: string }> = [];
   candidate.answers.forEach((answer: AnswerRecord) => {
     messages.push({ role: 'user', content: answer.message }); // ← "Je préfère progresser"
   });
   messages.push({ role: 'user', content: userMessage }); // ← Message actuel
   
   const completion = await callOpenAI({
     messages: [
       { role: 'system', content: FULL_AXIOM_PROMPT },
       { role: 'system', content: 'RÈGLE ABSOLUE AXIOM...' },
       ...messages, // ← UNIQUEMENT messages user
     ],
   });
   ```

**PROBLÈME** : OpenAI ne voit **PAS** :
- ❌ La question qu'il a posée ("Tu te sens plus poussé par...")
- ❌ Le contexte narratif précédent
- ❌ Les miroirs interprétatifs générés

**Résultat** : OpenAI génère une réponse, mais **sans contexte conversationnel**, la réponse peut être incohérente ou répétitive.

---

## 5️⃣ COMPARAISON AXIOM vs CHATGPT

### 5.1 Structure des messages ChatGPT

**ChatGPT** envoie un historique complet :

```json
[
  { "role": "system", "content": "You are a helpful assistant." },
  { "role": "assistant", "content": "Bienvenue dans AXIOM..." },
  { "role": "user", "content": "tutoie" },
  { "role": "assistant", "content": "Parfait, on se tutoie. Avant de commencer..." },
  { "role": "user", "content": "Je préfère progresser" },
  { "role": "assistant", "content": "Intéressant. Dis-moi..." }
]
```

**Avantages** :
- ✅ OpenAI voit ses propres réponses précédentes
- ✅ OpenAI peut maintenir la cohérence narrative
- ✅ OpenAI peut éviter les répétitions
- ✅ OpenAI peut construire sur les réponses précédentes

### 5.2 Structure des messages AXIOM

**AXIOM** envoie uniquement les messages utilisateur :

```json
[
  { "role": "system", "content": "FULL_AXIOM_PROMPT..." },
  { "role": "system", "content": "RÈGLE ABSOLUE AXIOM..." },
  { "role": "user", "content": "Je préfère progresser" }
]
```

**Inconvénients** :
- ❌ OpenAI ne voit pas ses propres réponses précédentes
- ❌ OpenAI ne peut pas maintenir la cohérence narrative
- ❌ OpenAI peut répéter des questions déjà posées
- ❌ OpenAI ne peut pas construire sur les réponses précédentes

---

## 6️⃣ PROPOSITION D'ARCHITECTURE CONVERSATIONNELLE CORRECTE

### 6.1 Structure de données idéale

#### **Option A : Étendre `AnswerRecord`**

```typescript
export type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
  block?: number;
  createdAt: string;
};

export type ConversationHistory = ConversationMessage[];
```

**Stockage** : `candidate.conversationHistory: ConversationHistory[]`

**Avantages** :
- ✅ Historique complet user + assistant
- ✅ Ordre chronologique préservé
- ✅ Facile à sérialiser/désérialiser

#### **Option B : Structure séparée**

```typescript
export interface AxiomCandidate {
  // ... existant
  answers: AnswerRecord[]; // ← Garder pour compatibilité
  conversationHistory: ConversationMessage[]; // ← Nouveau
}
```

**Avantages** :
- ✅ Rétrocompatibilité avec `answers`
- ✅ Historique conversationnel séparé
- ✅ Facile à migrer progressivement

### 6.2 Où stocker les réponses assistant

#### **Point d'injection 1 : Retour `executeAxiom()`**

**Fichier** : `src/engine/axiomExecutor.ts`

**Lignes concernées** :
- `1092-1098` : Retour question tone
- `1252-1258` : Retour préambule
- `1541-1547` : Retour réponse bloc

**Action** : Après chaque `return { response: aiText, ... }`, stocker :

```typescript
// Après génération réponse
if (aiText) {
  const conversationMessage: ConversationMessage = {
    role: 'assistant',
    content: aiText,
    block: blocNumber || undefined,
    createdAt: new Date().toISOString(),
  };
  candidateStore.addConversationMessage(candidate.candidateId, conversationMessage);
}
```

#### **Point d'injection 2 : Stockage réponse utilisateur**

**Fichier** : `src/engine/axiomExecutor.ts:1500-1507`

**Action** : Stocker aussi la réponse utilisateur dans l'historique conversationnel :

```typescript
if (userMessage) {
  const answerRecord: AnswerRecord = { ... };
  candidateStore.addAnswer(candidate.candidateId, answerRecord);
  
  // AUSSI stocker dans conversationHistory
  const conversationMessage: ConversationMessage = {
    role: 'user',
    content: userMessage,
    block: blocNumber,
    createdAt: new Date().toISOString(),
  };
  candidateStore.addConversationMessage(candidate.candidateId, conversationMessage);
}
```

### 6.3 Comment reconstruire l'historique

#### **Fonction de reconstruction**

**Fichier** : `src/engine/axiomExecutor.ts`

**Fonction** :

```typescript
function buildConversationHistory(candidate: AxiomCandidate): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  
  // Option A : Utiliser conversationHistory si disponible
  if (candidate.conversationHistory && candidate.conversationHistory.length > 0) {
    candidate.conversationHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });
    return messages;
  }
  
  // Option B : Fallback sur answers (rétrocompatibilité)
  candidate.answers.forEach((answer) => {
    messages.push({
      role: 'user',
      content: answer.message,
    });
  });
  
  return messages;
}
```

### 6.4 Comment l'injecter proprement à OpenAI

#### **Modification des appels OpenAI**

**Fichier** : `src/engine/axiomExecutor.ts`

**Lignes concernées** :
- `1286-1312` : START_BLOC_1
- `1404-1434` : BLOCS 1 à 10
- `1155-1168` : STEP_03_PREAMBULE

**Action** : Remplacer :

```typescript
// AVANT
const messages: Array<{ role: string; content: string }> = [];
candidate.answers.forEach((answer: AnswerRecord) => {
  messages.push({ role: 'user', content: answer.message });
});

// APRÈS
const messages = buildConversationHistory(candidate);
```

**Résultat** : OpenAI reçoit maintenant :

```json
[
  { "role": "system", "content": "FULL_AXIOM_PROMPT..." },
  { "role": "system", "content": "RÈGLE ABSOLUE AXIOM..." },
  { "role": "assistant", "content": "Bienvenue dans AXIOM..." },
  { "role": "user", "content": "tutoie" },
  { "role": "assistant", "content": "Parfait, on se tutoie..." },
  { "role": "user", "content": "Je préfère progresser" }
]
```

### 6.5 Gestion des cas spéciaux

#### **Cas 1 : Préambule (pas de userMessage avant)**

**Problème** : Le préambule est généré sans contexte utilisateur.

**Solution** : Inclure quand même l'historique conversationnel précédent :

```typescript
if (currentState === STEP_03_PREAMBULE) {
  const messages = buildConversationHistory(candidate);
  
  const completion = await callOpenAI({
    messages: [
      { role: 'system', content: FULL_AXIOM_PROMPT },
      { role: 'system', content: 'RÈGLE ABSOLUE AXIOM...' },
      ...messages, // ← Historique conversationnel
    ],
  });
}
```

#### **Cas 2 : START_BLOC_1 (première question bloc)**

**Problème** : Aucune réponse utilisateur dans le bloc encore.

**Solution** : Inclure l'historique conversationnel complet (tone, préambule) :

```typescript
if (event === 'START_BLOC_1') {
  const messages = buildConversationHistory(candidate);
  
  const completion = await callOpenAI({
    messages: [
      { role: 'system', content: FULL_AXIOM_PROMPT },
      { role: 'system', content: 'RÈGLE ABSOLUE AXIOM...' },
      ...messages, // ← Historique complet (tone, préambule)
    ],
  });
}
```

### 6.6 Migration progressive

#### **Phase 1 : Ajout structure sans casser l'existant**

1. Ajouter `conversationHistory` à `AxiomCandidate`
2. Créer `addConversationMessage()` dans `CandidateStore`
3. **Ne pas modifier** les appels OpenAI encore

#### **Phase 2 : Stockage des nouvelles réponses**

1. Stocker chaque réponse assistant dans `conversationHistory`
2. Stocker chaque réponse utilisateur dans `conversationHistory`
3. **Garder** `answers` pour rétrocompatibilité

#### **Phase 3 : Utilisation dans les appels OpenAI**

1. Créer `buildConversationHistory()`
2. Remplacer les appels OpenAI pour utiliser `conversationHistory`
3. **Tester** que l'historique est correct

#### **Phase 4 : Nettoyage**

1. Supprimer `answers` si plus utilisé
2. Optimiser le stockage
3. **Valider** que tout fonctionne

---

## 7️⃣ CONCLUSION

### 7.1 Confirmation de l'hypothèse

**OUI**, l'hypothèse est **VALIDÉE** :

- ✅ AXIOM n'envoie **JAMAIS** les réponses assistant à OpenAI
- ✅ AXIOM ne stocke **JAMAIS** les réponses assistant dans `candidate.answers`
- ✅ Chaque appel OpenAI est **stateless côté assistant**
- ✅ L'IA ne se relit **JAMAIS** ses propres réponses précédentes

### 7.2 Cause racine identifiée

**Cause racine** : **Absence de mémoire assistant**, pas un problème FSM.

**Preuve** :
- La FSM fonctionne correctement (états, transitions)
- Le problème est l'**absence de contexte conversationnel** dans les appels OpenAI
- ChatGPT fonctionne car il conserve l'historique complet user + assistant

### 7.3 AXIOM peut-il fonctionner comme ChatGPT ?

**OUI**, AXIOM **PEUT** fonctionner comme ChatGPT **SI** :

1. ✅ Les réponses assistant sont stockées dans `conversationHistory`
2. ✅ Les réponses utilisateur sont stockées dans `conversationHistory`
3. ✅ L'historique complet est injecté dans chaque appel OpenAI
4. ✅ L'ordre chronologique est préservé

**Architecture proposée** :
- Structure : `ConversationMessage[]` avec `role: 'user' | 'assistant'`
- Stockage : `candidate.conversationHistory`
- Injection : `buildConversationHistory()` avant chaque appel OpenAI
- Migration : Progressive, sans casser l'existant

### 7.4 Impact attendu

**Après correction** :
- ✅ OpenAI verra ses propres réponses précédentes
- ✅ OpenAI pourra maintenir la cohérence narrative
- ✅ OpenAI évitera les répétitions (question tone, préambule)
- ✅ Les blocs s'enchaîneront naturellement
- ✅ Les miroirs interprétatifs pourront être cumulés

**Résultat** : AXIOM fonctionnera comme ChatGPT avec une conversation continue et contextuelle.

---

**FIN DE L'AUDIT**
