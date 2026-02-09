# AUDIT — VERROU SÉQUENTIEL STRICT BLOC 1

**Date** : 2025-01-27  
**Objectif** : Identifier pourquoi plusieurs questions peuvent s'afficher simultanément au BLOC 1 malgré les verrous existants, et proposer des stratégies de correction SAFE.

---

## 1. DIAGNOSTIC PRÉCIS

### 1.1 Problème observé

**Symptôme** : Au BLOC 1 uniquement, plusieurs questions peuvent s'afficher simultanément dans un seul message assistant, malgré les verrous existants.

**Exemple de cas problématique** :
```
Question 1: Qu'est-ce qui te motive vraiment dans ton travail ?
Question 2: Comment réagis-tu face à l'échec ?
```

Ces deux questions peuvent apparaître dans un seul `data.response` **sans séparateur `---QUESTION_SEPARATOR---`**, et le frontend les affichera toutes les deux.

### 1.2 Verrous existants analysés

#### A) Verrou `hasActiveQuestion` (frontend)

**Fichier** : `ui-test/app.js` (lignes 11, 24-30, 169-185)

**Fonctionnement** :
- Variable globale : `let hasActiveQuestion = false`
- Vérifié dans `addMessage()` : si `hasActiveQuestion === true` et `role === 'assistant'` et `!isProgressiveMirror`, alors refuser l'affichage
- Activé dans `callAxiom()` : si `data.expectsAnswer === true`, alors `hasActiveQuestion = true`
- Désactivé dans le submit : `hasActiveQuestion = false` quand l'utilisateur répond

**Limite identifiée** :
- ✅ Bloque les **appels API multiples** (si `isWaiting === true`, l'appel est refusé)
- ✅ Bloque l'affichage d'un **nouveau message assistant** si une question est déjà active
- ❌ **NE BLOQUE PAS** plusieurs questions contenues dans un **seul message** (`data.response`)

**Exemple de contournement** :
```javascript
// Backend retourne :
data.response = "Qu'est-ce qui te motive ?\n\nComment réagis-tu face à l'échec ?"

// Frontend :
addMessage('assistant', data.response); // ✅ hasActiveQuestion = false (première fois)
// → Les deux questions sont affichées dans un seul message
```

#### B) Normalisation backend `normalizeSingleResponse()`

**Fichier** : `src/services/blockOrchestrator.ts` (lignes 122-134)

**Fonctionnement** :
- Détecte `---QUESTION_SEPARATOR---` dans `response`
- Si détecté → retourne uniquement la première question (split + trim)
- Sinon → retourne `response.trim()` tel quel

**Limite identifiée** :
- ✅ Bloque les questions séparées par `---QUESTION_SEPARATOR---`
- ❌ **NE BLOQUE PAS** les questions sans séparateur explicite

**Exemple de contournement** :
```javascript
// LLM génère (sans séparateur) :
response = "Qu'est-ce qui te motive ?\n\nComment réagis-tu face à l'échec ?"

// normalizeSingleResponse() :
if (response.includes('---QUESTION_SEPARATOR---')) { // ❌ false
  // ...
}
return response.trim(); // ✅ Retourne les deux questions
```

#### C) Détection frontend `---QUESTION_SEPARATOR---`

**Fichier** : `ui-test/app.js` (lignes 149-153)

**Fonctionnement** :
- Vérifie si `data.response.includes('---QUESTION_SEPARATOR---')`
- Si oui → split et affiche uniquement la première
- Sinon → affiche `data.response` tel quel

**Limite identifiée** :
- ✅ Bloque les questions avec séparateur explicite
- ❌ **NE BLOQUE PAS** les questions sans séparateur

### 1.3 Pourquoi le problème survient spécifiquement au BLOC 1 ?

**Analyse du flux BLOC 1** :

1. **Génération initiale** (`generateQuestionsForBlock1`) :
   - Le prompt demande explicitement : "Questions séparées par '---QUESTION_SEPARATOR---'"
   - Le LLM peut parfois ignorer cette instruction et générer plusieurs questions sans séparateur
   - Les questions sont parsées avec `split('---QUESTION_SEPARATOR---')` (ligne 392)
   - Si le LLM n'utilise pas le séparateur, toutes les questions sont dans un seul élément du tableau

2. **Service des questions** (`serveNextQuestion`) :
   - Prend une question depuis la queue (ligne 421)
   - Applique `normalizeSingleResponse(question)` (ligne 447)
   - Si la question contient plusieurs questions sans séparateur, `normalizeSingleResponse()` ne les détecte pas

3. **Enrichissement du contexte** :
   - Avec l'enrichissement du contexte backend, le LLM devient "plus structurant"
   - Il peut générer des questions plus longues ou plusieurs questions dans un seul texte
   - Le prompt demande le séparateur, mais le LLM peut l'oublier ou le remplacer par des sauts de ligne

**Conclusion** : Le problème survient quand :
- Le LLM génère plusieurs questions dans un seul élément de la queue (sans séparateur)
- `normalizeSingleResponse()` ne détecte pas ces questions multiples
- Le frontend affiche le texte complet dans un seul message

---

## 2. CAUSES RACINES

### 2.1 Cause principale : Détection insuffisante des questions multiples

**Problème** : Les verrous existants reposent uniquement sur la détection du séparateur explicite `---QUESTION_SEPARATOR---`. Si le LLM génère plusieurs questions sans ce séparateur (par exemple avec des sauts de ligne ou des points d'interrogation multiples), aucune protection n'est activée.

**Exemples de formats non détectés** :
```
Format 1 (sauts de ligne) :
"Qu'est-ce qui te motive ?
Comment réagis-tu face à l'échec ?"

Format 2 (paragraphes) :
"Qu'est-ce qui te motive vraiment dans ton travail ?

Comment réagis-tu face à l'échec ?"

Format 3 (énumération) :
"1. Qu'est-ce qui te motive ?
2. Comment réagis-tu face à l'échec ?"
```

### 2.2 Cause secondaire : Prompt non strictement respecté

**Analyse** : Le prompt demande explicitement le séparateur `---QUESTION_SEPARATOR---`, mais le LLM peut :
- Oublier le séparateur
- Utiliser un format différent (sauts de ligne, numérotation)
- Générer plusieurs questions dans un seul texte "cohérent"

**Fichier** : `src/services/blockOrchestrator.ts` (lignes 380-384)
```
Format : Questions séparées par '---QUESTION_SEPARATOR---'
```

**Limite** : Le prompt est une instruction, pas une contrainte technique. Le LLM peut la contourner.

### 2.3 Cause tertiaire : Absence de validation sémantique

**Analyse** : Aucune validation sémantique n'est effectuée pour détecter plusieurs questions dans un seul texte. Les verrous sont purement syntaxiques (détection de chaîne de caractères).

---

## 3. OPTIONS DE CORRECTION POSSIBLES

### 3.1 Option 1 : Détection sémantique frontend (RECOMMANDÉE)

**Principe** : Détecter sémantiquement plusieurs questions dans `data.response` avant l'affichage, et n'afficher que la première.

**Implémentation** :
```javascript
// Dans callAxiom(), avant addMessage()
function extractFirstQuestion(text) {
  if (!text) return text;
  
  // Détection du séparateur explicite (déjà fait)
  if (text.includes('---QUESTION_SEPARATOR---')) {
    return text.split('---QUESTION_SEPARATOR---')[0].trim();
  }
  
  // Détection sémantique : plusieurs points d'interrogation
  const questionMarks = (text.match(/\?/g) || []).length;
  if (questionMarks > 1) {
    // Découper au premier point d'interrogation suivi d'un saut de ligne ou d'un espace
    const firstQuestionEnd = text.indexOf('?');
    if (firstQuestionEnd !== -1) {
      // Chercher la fin de la première question (saut de ligne ou fin de texte)
      const afterQuestionMark = text.substring(firstQuestionEnd + 1);
      const nextLineBreak = afterQuestionMark.search(/\n\s*\n/); // Double saut de ligne
      if (nextLineBreak !== -1) {
        return text.substring(0, firstQuestionEnd + 1 + nextLineBreak).trim();
      }
      // Sinon, prendre jusqu'au prochain point d'interrogation
      const nextQuestionMark = afterQuestionMark.indexOf('?');
      if (nextQuestionMark !== -1) {
        return text.substring(0, firstQuestionEnd + 1).trim();
      }
    }
  }
  
  return text.trim();
}

// Utilisation
const responseText = data.response.trim();
const firstQuestion = extractFirstQuestion(responseText);
addMessage('assistant', firstQuestion);
```

**Avantages** :
- ✅ Frontend uniquement (pas de modification backend)
- ✅ Détecte les questions multiples même sans séparateur
- ✅ Compatible avec l'existant (s'ajoute aux vérifications actuelles)
- ✅ Pas de modification des prompts
- ✅ Pas de modification de la FSM

**Risques** :
- ⚠️ Risque de troncature si une question contient plusieurs points d'interrogation (rare)
- ⚠️ Risque de troncature si une question contient des exemples avec "?" (rare)

**Mitigation** :
- Utiliser une heuristique plus robuste (détection de patterns : "Question 1:", "1.", etc.)
- Logger les troncatures pour monitoring

**Effort estimé** : 2-3 heures (implémentation + tests)

---

### 3.2 Option 2 : Validation backend stricte (ALTERNATIVE)

**Principe** : Ajouter une validation dans `normalizeSingleResponse()` pour détecter plusieurs questions même sans séparateur.

**Implémentation** :
```typescript
// Dans blockOrchestrator.ts, fonction normalizeSingleResponse()
function normalizeSingleResponse(response?: string): string {
  if (!response) return '';

  // SAFEGUARD — ne jamais exposer plus d'un message affichable
  if (response.includes('---QUESTION_SEPARATOR---')) {
    console.warn(
      '[AXIOM][SAFEGUARD] Multiple questions detected in response — truncating to first'
    );
    return response.split('---QUESTION_SEPARATOR---')[0].trim();
  }

  // NOUVEAU : Détection sémantique de questions multiples
  const questionMarks = (response.match(/\?/g) || []).length;
  if (questionMarks > 1) {
    // Découper au premier point d'interrogation suivi d'un saut de ligne
    const firstQuestionEnd = response.indexOf('?');
    if (firstQuestionEnd !== -1) {
      const afterQuestionMark = response.substring(firstQuestionEnd + 1);
      // Chercher un double saut de ligne (fin de question probable)
      const nextDoubleLineBreak = afterQuestionMark.search(/\n\s*\n/);
      if (nextDoubleLineBreak !== -1) {
        const truncated = response.substring(0, firstQuestionEnd + 1 + nextDoubleLineBreak).trim();
        console.warn(
          '[AXIOM][SAFEGUARD] Multiple questions detected (semantic) — truncating to first'
        );
        return truncated;
      }
      // Sinon, prendre jusqu'au premier point d'interrogation inclus
      const truncated = response.substring(0, firstQuestionEnd + 1).trim();
      console.warn(
        '[AXIOM][SAFEGUARD] Multiple questions detected (semantic) — truncating to first'
      );
      return truncated;
    }
  }

  return response.trim();
}
```

**Avantages** :
- ✅ Protection centralisée (backend)
- ✅ S'applique à tous les blocs automatiquement
- ✅ Pas de modification frontend

**Risques** :
- ⚠️ Modification backend (contrainte demandée : frontend uniquement)
- ⚠️ Même risque de troncature que l'option 1

**Effort estimé** : 1-2 heures (modification backend + tests)

---

### 3.3 Option 3 : Parsing amélioré lors de la génération (ALTERNATIVE)

**Principe** : Améliorer le parsing lors de `generateQuestionsForBlock1()` pour détecter plusieurs questions même sans séparateur.

**Implémentation** :
```typescript
// Dans generateQuestionsForBlock1(), après le split
const questions = completion
  .split('---QUESTION_SEPARATOR---')
  .map(q => q.trim())
  .filter(q => q.length > 0);

// NOUVEAU : Détecter si un élément contient plusieurs questions
const parsedQuestions: string[] = [];
for (const question of questions) {
  const questionMarks = (question.match(/\?/g) || []).length;
  if (questionMarks > 1) {
    // Découper en plusieurs questions
    const subQuestions = question.split(/\?\s*\n\s*\n/).map(q => q.trim() + '?');
    parsedQuestions.push(...subQuestions.filter(q => q.length > 1));
  } else {
    parsedQuestions.push(question);
  }
}

return parsedQuestions;
```

**Avantages** :
- ✅ Correction à la source (génération)
- ✅ Garantit que la queue ne contient jamais plusieurs questions dans un seul élément

**Risques** :
- ⚠️ Modification backend (contrainte demandée : frontend uniquement)
- ⚠️ Complexité accrue du parsing

**Effort estimé** : 2-3 heures (modification backend + tests)

---

## 4. RECOMMANDATION FINALE

### 4.1 Stratégie retenue : Option 1 (Détection sémantique frontend)

**Raison** :
1. ✅ Respecte la contrainte "frontend uniquement"
2. ✅ Pas de modification backend
3. ✅ Pas de modification des prompts
4. ✅ Compatible avec l'existant
5. ✅ Protection défensive efficace

### 4.2 Implémentation recommandée

**Fichier** : `ui-test/app.js`

**Modification** : Ajouter une fonction `extractFirstQuestion()` et l'utiliser dans `callAxiom()` avant `addMessage()`.

**Heuristique proposée** :
1. Détecter le séparateur explicite `---QUESTION_SEPARATOR---` (déjà fait)
2. Si plusieurs points d'interrogation (`?`) :
   - Découper au premier `?` suivi d'un double saut de ligne (`\n\n`)
   - Si pas de double saut de ligne, découper au premier `?` inclus
3. Logger les troncatures pour monitoring

**Code attendu** :
```javascript
// Fonction helper (ajouter avant callAxiom)
function extractFirstQuestion(text) {
  if (!text) return text;
  
  // Détection séparateur explicite (déjà géré)
  if (text.includes('---QUESTION_SEPARATOR---')) {
    return text.split('---QUESTION_SEPARATOR---')[0].trim();
  }
  
  // Détection sémantique : plusieurs points d'interrogation
  const questionMarks = (text.match(/\?/g) || []).length;
  if (questionMarks > 1) {
    // Chercher le premier point d'interrogation
    const firstQuestionEnd = text.indexOf('?');
    if (firstQuestionEnd !== -1) {
      const afterQuestionMark = text.substring(firstQuestionEnd + 1);
      // Chercher un double saut de ligne (fin de question probable)
      const nextDoubleLineBreak = afterQuestionMark.search(/\n\s*\n/);
      if (nextDoubleLineBreak !== -1) {
        const truncated = text.substring(0, firstQuestionEnd + 1 + nextDoubleLineBreak).trim();
        console.warn('[FRONTEND] [SEQUENTIAL_LOCK] Multiple questions detected (semantic) — displaying only first');
        return truncated;
      }
      // Sinon, prendre jusqu'au premier point d'interrogation inclus
      const truncated = text.substring(0, firstQuestionEnd + 1).trim();
      console.warn('[FRONTEND] [SEQUENTIAL_LOCK] Multiple questions detected (semantic) — displaying only first');
      return truncated;
    }
  }
  
  return text.trim();
}

// Dans callAxiom(), remplacer :
// addMessage('assistant', responseText);
// Par :
const firstQuestion = extractFirstQuestion(responseText);
addMessage('assistant', firstQuestion);
```

### 4.3 Garanties de sécurité

**Protection** :
- ✅ Détecte les questions multiples même sans séparateur
- ✅ Troncature défensive (première question uniquement)
- ✅ Logging pour monitoring
- ✅ Compatible avec l'existant (s'ajoute aux vérifications)

**Risques mitigés** :
- ⚠️ Troncature si question contient plusieurs `?` (rare, mais loggé)
- ⚠️ Troncature si question contient des exemples avec `?` (rare, mais loggé)

**Tests à effectuer** :
1. Question unique → affichage normal
2. Questions multiples avec séparateur → première question uniquement
3. Questions multiples sans séparateur → première question uniquement
4. Question avec plusieurs `?` (exemple) → troncature loggée mais acceptable

---

## 5. CONCLUSION

**Diagnostic** : Le verrou `hasActiveQuestion` bloque les appels multiples, mais ne bloque pas plusieurs questions contenues dans un seul `data.response` sans séparateur explicite.

**Cause racine** : Détection insuffisante des questions multiples (repose uniquement sur `---QUESTION_SEPARATOR---`).

**Recommandation** : Option 1 (détection sémantique frontend) — ajout d'une fonction `extractFirstQuestion()` qui détecte plusieurs points d'interrogation et tronque défensivement.

**Impact** : Minimal (frontend uniquement, pas de modification backend, pas de modification prompts).

**Risque** : Faible (troncature défensive, logging pour monitoring).

**Effort** : 2-3 heures (implémentation + tests).

---

**FIN DE L'AUDIT**
