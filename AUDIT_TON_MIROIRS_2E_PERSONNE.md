# AUDIT — RESPECT STRICT DU TON + RÈGLES DE STYLE DES ANALYSES (MIROIRS)
## PROMPTS INTANGIBLES — LECTURE SEULE

**Date** : 2025-01-27  
**Version AXIOM** : Version actuelle (figée)  
**Objectif** : Identifier les causes d'écarts de ton (3e personne au lieu de 2e personne) sans modifier les prompts

---

## 1. CARTOGRAPHIE DU FLUX DE GÉNÉRATION DES MIROIRS

### 1.1 Points d'entrée

#### **BLOC 1 — Miroir**
- **Fichier** : `src/services/blockOrchestrator.ts`
- **Fonction** : `generateMirrorForBlock1()` (lignes 455-580)
- **Déclenchement** : Quand toutes les questions BLOC 1 sont répondues

#### **BLOC 2B — Miroir**
- **Fichier** : `src/services/blockOrchestrator.ts`
- **Fonction** : `generateMirror2B()` (lignes 1736-1898)
- **Déclenchement** : Quand toutes les questions BLOC 2B sont répondues

#### **BLOCS 3-9 — Miroirs**
- **Fichier** : `src/engine/axiomExecutor.ts`
- **Fonction** : `executeAxiom()` (lignes 1595-1673)
- **Déclenchement** : Quand toutes les questions du bloc sont répondues

### 1.2 Structure du prompt final envoyé au LLM

#### **BLOC 1 — Structure du message**
```typescript
messages: [
  { role: 'system', content: FULL_AXIOM_PROMPT },  // PROMPT_AXIOM_ENGINE + PROMPT_AXIOM_PROFIL
  {
    role: 'system',
    content: `RÈGLE ABSOLUE AXIOM — MIROIR INTERPRÉTATIF ACTIF (REVELIOM)
    
Tu es en FIN DE BLOC 1.
Toutes les questions du BLOC 1 ont été répondues.

Réponses du candidat :
${answersContext}

⚠️ FORMAT STRICT OBLIGATOIRE — NON NÉGOCIABLE
[...]
`
  },
  ...messages,  // buildConversationHistory(candidate)
]
```

#### **BLOC 2B — Structure du message**
```typescript
messages: [
  { role: 'system', content: FULL_AXIOM_PROMPT },
  {
    role: 'system',
    content: `RÈGLE ABSOLUE AXIOM — SYNTHÈSE FINALE BLOC 2B :
    
Tu es en fin de BLOC 2B.
[...]

RÉPONSES DU CANDIDAT :
${answersContext}
[...]
`
  },
  ...messages,  // buildConversationHistoryForBlock2B(candidate)
]
```

#### **BLOCS 3-9 — Structure du message**
```typescript
messages: [
  { role: 'system', content: FULL_AXIOM_PROMPT },
  {
    role: 'system',
    content: `RÈGLE ABSOLUE AXIOM — MIROIR INTERPRÉTATIF ACTIF (REVELIOM)
    
Tu es en FIN DE BLOC ${blocNumber}.
[...]
`
  },
  ...messages,  // buildConversationHistory(candidate)
]
```

### 1.3 Contenu de FULL_AXIOM_PROMPT

**Source** : `src/engine/prompts.ts` (lignes 6-1726)

**Composition** :
- `PROMPT_AXIOM_ENGINE` : Instructions techniques (exécution stricte)
- `PROMPT_AXIOM_PROFIL` : Instructions produit (ton, style, règles AXIOM)

**Instructions ton dans PROMPT_AXIOM_PROFIL** :
- Ligne 383-395 : "Tu es AXIOM, un système avancé d'analyse humaine..."
- Ligne 394-408 : "Bienvenue dans AXIOM. On va découvrir qui tu es vraiment..."
- **Aucune instruction explicite sur l'utilisation de la 2e personne dans les miroirs**

**⚠️ PROBLÈME IDENTIFIÉ** : Le prompt global (`PROMPT_AXIOM_PROFIL`) utilise la 2e personne dans les exemples ("tu es", "on se tutoie"), mais **ne contient pas d'instruction explicite et contraignante** pour forcer la 2e personne dans les miroirs interprétatifs.

---

## 2. AUDIT DU CONTEXTE ET DES SIGNAUX QUI POUSSENT À LA 3E PERSONNE

### 2.1 Injection du prénom/nom du candidat

**Recherche effectuée** : Aucune injection du prénom/nom dans les prompts de miroir.

**Stockage** :
- `candidate.identity.firstName` et `candidate.identity.lastName` sont stockés
- **Mais ils ne sont PAS injectés dans les prompts de miroir**

**✅ CONCLUSION** : Le prénom/nom n'est pas la cause directe du passage à la 3e personne.

### 2.2 Formatage de `answersContext`

#### **BLOC 1 — Format**
```typescript
// Source : conversationHistory
answersContext = block1UserMessages
  .map((answer, index) => `Q${index + 1}: ${answer}`)
  .join('\n');
```

**Exemple généré** :
```
Q1: Je préfère progresser
Q2: Mon énergie est stable
Q3: La pression me structure
```

#### **BLOC 2B — Format**
```typescript
answersContext = block2BAnswers
  .map((answer, index) => {
    const questionIndex = index + 3;
    const question = queue?.questions[questionIndex] || '';
    return `Question ${questionIndex} (${question.substring(0, 50)}...): ${answer}`;
  })
  .join('\n');
```

**Exemple généré** :
```
Question 3 (Qu'est-ce qui t'attire le PLUS dans Peaky Blinders?): L'ascension
Question 4 (Dans Peaky Blinders, quels sont les 1 à 3 personnages...): Tommy, Arthur
```

**⚠️ PROBLÈME IDENTIFIÉ** : Le formatage "Q1:", "Question X:" peut induire une posture narrative externe (analyste qui décrit un candidat) plutôt qu'une posture conversationnelle directe (mentor qui s'adresse au candidat).

**Hypothèse** : Le LLM voit "Réponses du candidat : Q1: ... Q2: ..." et interprète cela comme un matériau à analyser en 3e personne, plutôt qu'un contexte pour s'adresser directement au candidat.

### 2.3 Contenu de `conversationHistory` injecté

**Fonction** : `buildConversationHistory()` (lignes 25-51 de `blockOrchestrator.ts`)

**Contenu injecté** :
- Tous les messages `conversationHistory` (jusqu'à 40 messages récents)
- Inclut les messages `assistant` (questions posées) et `user` (réponses)
- Inclut les messages `mirror_validation` (exclus du filtrage pour `answersContext`, mais présents dans l'historique)

**⚠️ PROBLÈME POTENTIEL** : Si l'historique contient des formulations à la 3e personne (ex: anciens miroirs non conformes, ou messages système), le LLM peut les reproduire.

**Vérification** : Les miroirs précédents sont stockés avec `kind: 'mirror'` dans `conversationHistory`. Si un ancien miroir en 3e personne est présent, il peut influencer la génération.

### 2.4 Ordre des messages dans le prompt

**Structure observée** :
1. `system` : FULL_AXIOM_PROMPT (instructions générales)
2. `system` : Instructions spécifiques miroir (format strict)
3. `assistant` / `user` : Historique conversationnel complet

**⚠️ PROBLÈME IDENTIFIÉ** : L'ordre des messages peut créer une hiérarchie où :
- Les instructions générales (PROMPT_AXIOM_PROFIL) sont en haut
- Les instructions spécifiques (format miroir) sont au milieu
- L'historique conversationnel (qui peut contenir des exemples en 3e personne) est en bas

**Hypothèse** : Le LLM peut donner plus de poids à l'historique conversationnel (exemples concrets) qu'aux instructions générales (règles abstraites).

---

## 3. AUDIT DU POST-TRAITEMENT DE LA RÉPONSE LLM

### 3.1 Fonction `normalizeSingleResponse()`

**Fichier** : `src/services/blockOrchestrator.ts` (lignes 122-135)

**Action** :
- Détecte `---QUESTION_SEPARATOR---`
- Tronque à la première question si plusieurs détectées
- **Ne modifie pas le contenu du miroir**

**✅ CONCLUSION** : Aucun impact sur le ton.

### 3.2 Fonction `parseMirrorSections()`

**Fichier** : `src/services/parseMirrorSections.ts`

**Action** :
- Parse le miroir en 3 sections (1️⃣, 2️⃣, 3️⃣)
- **Ne modifie pas le contenu**, juste le structure

**✅ CONCLUSION** : Aucun impact sur le ton.

### 3.3 Fonction `validateMirrorREVELIOM()`

**Fichier** : `src/services/validateMirrorReveliom.ts`

**Action** :
- Valide le format (sections, nombre de mots, lecture en creux)
- **Ne valide PAS le ton (2e vs 3e personne)**
- **Ne modifie pas le contenu**

**⚠️ PROBLÈME IDENTIFIÉ** : La validation ne vérifie pas explicitement l'utilisation de la 2e personne. Un miroir en 3e personne peut passer la validation si le format est correct.

### 3.4 Affichage progressif (`progressiveDisplay`)

**Fichier** : `src/services/blockOrchestrator.ts` (lignes 348-356)

**Action** :
- Si `mirrorSections.length === 3`, active l'affichage progressif
- **Ne modifie pas le contenu**, juste le mode d'affichage

**✅ CONCLUSION** : Aucun impact sur le ton.

---

## 4. AUDIT DE LA SÉLECTION DE LA SOURCE DE CONTENU

### 4.1 Source principale : `conversationHistory`

**BLOC 1** :
```typescript
const block1UserMessages = conversationHistory
  .filter(m => m.role === 'user' && m.block === 1 && m.kind !== 'mirror_validation')
  .map(m => m.content);
```

**BLOC 2B** :
```typescript
const block2UserMessages = conversationHistory
  .filter(m => m.role === 'user' && m.block === 2 && m.kind !== 'mirror_validation')
  .map(m => m.content);
```

**Formatage** :
- BLOC 1 : `Q${index + 1}: ${answer}`
- BLOC 2B : `Question ${questionIndex} (${question.substring(0, 50)}...): ${answer}`

**⚠️ PROBLÈME IDENTIFIÉ** : Le formatage "Q1:", "Question X:" peut induire une posture narrative externe.

### 4.2 Fallback : `answerMaps`

**BLOC 1** :
```typescript
const answerMap = candidate.answerMaps?.[1];
const answers = answerMap?.answers || {};
answersContext = sortedEntries
  .map(([index, answer]) => `Q${parseInt(index) + 1}: ${answer}`)
  .join('\n');
```

**Même formatage que `conversationHistory`** → même problème potentiel.

---

## 5. AUDIT DES CONDITIONS DE DÉCLENCHEMENT ET DES ÉTATS UI

### 5.1 Génération unique du miroir

**BLOC 1** :
- Le miroir est généré une seule fois quand `allQuestionsAnswered && !lastAssistantMessage`
- Stocké dans `conversationHistory` avec `kind: 'mirror'`
- Si `userMessage` vide reçu après génération, le miroir est renvoyé depuis l'historique (lignes 273-285)

**⚠️ PROBLÈME POTENTIEL** : Si un ancien miroir non conforme (3e personne) est présent dans `conversationHistory`, il peut être renvoyé au lieu d'être régénéré.

**Vérification** : Le code vérifie `lastAssistantMessage.kind === 'mirror'` mais ne vérifie pas si le miroir est conforme au ton.

### 5.2 Filtrage par bloc

**BLOC 1** :
```typescript
const lastMirror = [...conversationHistory].reverse().find(
  m => m.role === 'assistant' && m.kind === 'mirror' && m.block === blockNumber
);
```

**✅ CONCLUSION** : Le filtrage par `block === blockNumber` est correct. Un miroir BLOC 1 ne sera pas renvoyé pour BLOC 2B.

---

## 6. HYPOTHÈSES DE CORRECTION MINIMALES

### 6.1 Hypothèse 1 : Ajout d'instruction explicite dans le prompt de miroir

**Problème** : Le prompt de miroir ne contient pas d'instruction explicite sur l'utilisation de la 2e personne.

**Solution proposée** :
Ajouter dans chaque prompt de miroir (BLOC 1, BLOC 2B, BLOCS 3-9) une instruction explicite :

```
⚠️ TON OBLIGATOIRE — 2E PERSONNE UNIQUEMENT
Tu DOIS t'adresser directement au candidat en utilisant "tu", "toi", "tes".
INTERDICTION ABSOLUE d'utiliser la 3e personne ("il", "elle", "le candidat", "James semble...").
Le miroir DOIT être écrit comme si tu parles directement au candidat, pas comme si tu décris un profil externe.
```

**Impact** : **FAIBLE** — Ajout d'une instruction, pas de modification de logique.

**Risque de régression** : **NUL** — Instruction supplémentaire, pas de suppression.

**Effort** : **1h** — Modification de 3 prompts (BLOC 1, BLOC 2B, BLOCS 3-9).

**Fichiers concernés** :
- `src/services/blockOrchestrator.ts` (lignes 499-541, 1790-1832)
- `src/engine/axiomExecutor.ts` (lignes 1602-1652)

---

### 6.2 Hypothèse 2 : Modification du formatage de `answersContext`

**Problème** : Le formatage "Q1:", "Question X:" peut induire une posture narrative externe.

**Solution proposée** :
Changer le formatage pour être plus conversationnel :

**AVANT** :
```
Réponses du candidat :
Q1: Je préfère progresser
Q2: Mon énergie est stable
```

**APRÈS** :
```
Voici ce que tu as répondu :
- Tu préfères progresser
- Ton énergie est stable
```

**Impact** : **MOYEN** — Modification du formatage, pas de logique.

**Risque de régression** : **FAIBLE** — Le formatage change, mais le contenu reste identique.

**Effort** : **2h** — Modification de 2 fonctions (`generateMirrorForBlock1`, `generateMirror2B`).

**Fichiers concernés** :
- `src/services/blockOrchestrator.ts` (lignes 470-472, 1759-1765)

---

### 6.3 Hypothèse 3 : Ajout de validation du ton dans `validateMirrorREVELIOM()`

**Problème** : La validation ne vérifie pas l'utilisation de la 2e personne.

**Solution proposée** :
Ajouter une vérification dans `validateMirrorREVELIOM()` :

```typescript
// Vérification 2e personne
const hasSecondPerson = /(tu|toi|tes|ton|ta|ton|vous|votre|vos)/i.test(content);
const hasThirdPerson = /(il|elle|le candidat|la candidate|James|Marie|semble|pourrait|est|a)/i.test(content);

if (!hasSecondPerson) {
  errors.push("Miroir ne contient pas de 2e personne (tu/toi)");
}

if (hasThirdPerson && !hasSecondPerson) {
  errors.push("Miroir utilise la 3e personne au lieu de la 2e personne");
}
```

**Impact** : **MOYEN** — Force la régénération si le ton est incorrect.

**Risque de régression** : **FAIBLE** — Peut déclencher plus de retries, mais garantit la conformité.

**Effort** : **1h** — Modification d'une fonction de validation.

**Fichiers concernés** :
- `src/services/validateMirrorReveliom.ts` (lignes 6-55)

---

### 6.4 Hypothèse 4 : Renforcement du prompt global (PROMPT_AXIOM_PROFIL)

**Problème** : Le prompt global ne contient pas d'instruction explicite sur l'utilisation de la 2e personne dans les miroirs.

**Solution proposée** :
Ajouter dans `PROMPT_AXIOM_PROFIL` (section "FORMAT STRICT ET OBLIGATOIRE DU MIROIR") :

```
⚠️ TON OBLIGATOIRE — 2E PERSONNE UNIQUEMENT
Chaque miroir interprétatif DOIT être écrit en 2e personne ("tu", "toi", "tes").
INTERDICTION ABSOLUE d'utiliser la 3e personne ("il", "elle", "le candidat").
Le miroir est une conversation directe avec le candidat, pas une description externe.
```

**Impact** : **FAIBLE** — Instruction supplémentaire dans le prompt global.

**Risque de régression** : **NUL** — Pas de modification de logique.

**Effort** : **30min** — Modification d'un fichier de prompt.

**Fichiers concernés** :
- `src/engine/prompts.ts` (lignes 257-310)

---

## 7. RECOMMANDATION FINALE "SAFE PATCH"

### 7.1 Approche recommandée : Combinaison Hypothèses 1 + 3

**Pourquoi** :
1. **Hypothèse 1** : Force le respect du ton au moment de la génération (instruction explicite).
2. **Hypothèse 3** : Garantit la conformité après génération (validation + retry si nécessaire).

**Avantages** :
- Double sécurité (instruction + validation)
- Pas de modification de logique métier
- Pas de changement de formatage (évite les régressions)
- Correction minimale et ciblée

**Risques** :
- Peut déclencher plus de retries si le LLM ignore l'instruction
- Mais garantit la conformité finale

**Effort total** : **2h**

**Ordre d'implémentation** :
1. Hypothèse 1 (instruction explicite) — 1h
2. Hypothèse 3 (validation ton) — 1h

### 7.2 Approche alternative : Hypothèse 1 seule

**Si l'effort doit être minimal** :
- Implémenter uniquement l'Hypothèse 1 (instruction explicite dans les prompts de miroir).
- **Effort** : **1h**
- **Risque** : Le LLM peut ignorer l'instruction si le contexte pousse à la 3e personne.

---

## 8. TESTS DE NON-RÉGRESSION

### 8.1 Tests fonctionnels

1. **Test BLOC 1 — Miroir 2e personne**
   - Compléter toutes les questions BLOC 1
   - Vérifier que le miroir contient "tu", "toi", "tes"
   - Vérifier qu'il ne contient pas "il", "elle", "le candidat", "[prénom] semble"

2. **Test BLOC 2B — Miroir 2e personne**
   - Compléter toutes les questions BLOC 2B
   - Vérifier que le miroir contient "tu", "toi", "tes"
   - Vérifier qu'il ne contient pas "il", "elle", "le candidat"

3. **Test BLOCS 3-9 — Miroir 2e personne**
   - Compléter un bloc 3-9
   - Vérifier que le miroir contient "tu", "toi", "tes"
   - Vérifier qu'il ne contient pas "il", "elle", "le candidat"

### 8.2 Tests de validation

1. **Test validation ton — Miroir conforme**
   - Miroir avec "tu", "toi", "tes" → Validation OK

2. **Test validation ton — Miroir non conforme**
   - Miroir avec "il", "elle", "le candidat" → Validation FAIL → Retry déclenché

### 8.3 Tests de non-régression

1. **Test format miroir — Sections présentes**
   - Vérifier que les 3 sections (1️⃣, 2️⃣, 3️⃣) sont présentes

2. **Test format miroir — Nombre de mots**
   - Vérifier que la section 1️⃣ ≤ 20 mots
   - Vérifier que la section 2️⃣ ≤ 25 mots

3. **Test format miroir — Lecture en creux**
   - Vérifier que le miroir contient "probablement pas X, mais plutôt Y"

---

## 9. CONCLUSION

### 9.1 Causes identifiées

1. **Absence d'instruction explicite** sur l'utilisation de la 2e personne dans les prompts de miroir
2. **Formatage "Q1:", "Question X:"** qui peut induire une posture narrative externe
3. **Absence de validation du ton** dans `validateMirrorREVELIOM()`

### 9.2 Corrections recommandées

**Approche SAFE** : Hypothèses 1 + 3 (instruction explicite + validation ton)
- **Effort** : 2h
- **Risque** : Faible
- **Impact** : Fort (garantit la conformité)

**Approche MINIMALE** : Hypothèse 1 seule (instruction explicite)
- **Effort** : 1h
- **Risque** : Moyen (le LLM peut ignorer l'instruction)
- **Impact** : Moyen

### 9.3 Fichiers à modifier (approche SAFE)

1. `src/services/blockOrchestrator.ts` (lignes 499-541, 1790-1832) — Ajout instruction 2e personne
2. `src/engine/axiomExecutor.ts` (lignes 1602-1652) — Ajout instruction 2e personne
3. `src/services/validateMirrorReveliom.ts` (lignes 6-55) — Ajout validation ton

**Aucune modification des prompts intangibles** (PROMPT_AXIOM_PROFIL reste inchangé).

---

**FIN DE L'AUDIT**
