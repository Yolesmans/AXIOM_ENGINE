# 🔍 AUDIT TECHNIQUE — CONFORMITÉ BLOC 2B / DOCTRINE AXIOM

**Date** : 2025-01-27  
**Objectif** : Vérifier si l'implémentation actuelle du BLOC 2B est conforme à la doctrine AXIOM sur le plan sémantique  
**Type** : Audit technique pur (aucune modification de code)

---

## 📋 RAPPEL DOCTRINAL (NON NÉGOCIABLE)

**Doctrine AXIOM — BLOC 2B** :

- ✅ **Les QUESTIONS du BLOC 2B peuvent être génériques dans leur structure.**
  - Exemple acceptable : "Qu'est-ce qui t'attire le PLUS dans Blacklist ?"

- ❌ **La spécificité AXIOM repose UNIQUEMENT sur :**
  1. Les **PROPOSITIONS** (A/B/C/D/E)
  2. Les **PERSONNAGES**
  3. La **RÉCONCILIATION implicite** des noms de personnages

- ❌ **Ce qui ne doit JAMAIS être générique :**
  - Les propositions
  - Les traits
  - Les personnages
  - La correspondance œuvre ↔ personnages
  - La réconciliation implicite (ex : "Tommy, John et l'autre frère" → "Tommy Shelby, John Shelby, Arthur Shelby")

---

## 1️⃣ VALIDATION ACTUELLE — ANALYSE TECHNIQUE

### 1.1 Ce qui est validé

**Référence** : `src/services/validators.ts` (lignes 62-169)

#### `validateMotifsSpecificity(motifWork1, motifWork2, motifWork3)`

**Ce qui est validé** :
- ✅ **Uniquement les PROPOSITIONS** extraites via `extractPropositions()`
- ✅ **Similarité entre propositions** de différentes œuvres (seuil 70%)
- ✅ **Format** : 5 propositions par œuvre (A. / B. / C. / D. / E.)

**Ce qui n'est PAS validé** :
- ❌ La question elle-même (ex: "Qu'est-ce qui t'attire le PLUS dans Blacklist ?")
- ❌ La structure de la question
- ❌ Le libellé de la question

**Preuve technique** :
```typescript
// src/services/validators.ts:126-128
const props1 = extractPropositions(motifWork1);
const props2 = extractPropositions(motifWork2);
const props3 = extractPropositions(motifWork3);
```

La fonction `extractPropositions()` (lignes 40-48) extrait uniquement les lignes commençant par `A.`, `B.`, `C.`, `D.`, `E.` et ignore le reste de la question.

#### `validateTraitsSpecificity(traitsWork1, traitsWork2, traitsWork3)`

**Ce qui est validé** :
- ✅ **Uniquement les PROPOSITIONS** extraites via `extractPropositions()`
- ✅ **Similarité entre traits** de différents personnages (seuil 80%)
- ✅ **Unicité** : chaque trait doit être unique, non recyclable

**Ce qui n'est PAS validé** :
- ❌ La question elle-même (ex: "Chez [PERSONNAGE], qu'est-ce que tu apprécies le PLUS ?")
- ❌ Le nom du personnage dans la question
- ❌ La correspondance personnage ↔ œuvre

**Preuve technique** :
```typescript
// src/services/validators.ts:68-71
const extractTraits = (text: string): string[] => {
  if (typeof text !== 'string') return [];
  return extractPropositions(text);
};
```

### 1.2 Extraction des questions pour validation

**Référence** : `src/services/blockOrchestrator.ts` (lignes 1005-1012)

**Logique d'extraction** :
```typescript
for (const question of questions) {
  if (question.includes('Qu\'est-ce qui t\'attire le PLUS dans')) {
    motifs.push(question);  // ← Question ENTIÈRE stockée
  } else if (question.includes('Chez') && question.includes('qu\'est-ce que tu apprécies')) {
    traits.push(question);  // ← Question ENTIÈRE stockée
  }
}
```

**Observation critique** :
- La question **entière** (incluant le libellé) est passée à `validateMotifsSpecificity()`
- MAIS le validateur **ignore** le libellé et extrait uniquement les propositions
- **Conclusion** : La validation ne rejette PAS une question générique en tant que telle

### 1.3 Conformité à la doctrine

**✅ CONFORME** : La validation actuelle est **conforme à la doctrine AXIOM**.

**Justification** :
1. Les questions génériques (ex: "Qu'est-ce qui t'attire le PLUS dans Blacklist ?") sont **acceptées**
2. Seules les **propositions** (A/B/C/D/E) sont validées pour leur spécificité
3. La validation garantit que les propositions sont **uniques** entre œuvres (motifs) et entre personnages (traits)

**Point d'attention** :
- Le prompt système (ligne 896 de `blockOrchestrator.ts`) contient : "1. AUCUNE question générique n'est autorisée."
- Cette instruction est **contradictoire** avec la doctrine (questions génériques acceptables)
- MAIS la validation technique ne vérifie pas cette règle, donc **pas d'impact fonctionnel**

---

## 2️⃣ RÉCONCILIATION PERSONNAGE — ANALYSE TECHNIQUE

### 2.1 Logique explicite dans le code

**Recherche effectuée** : Aucune fonction, méthode ou logique explicite de réconciliation des personnages n'existe dans le code.

**Fichiers analysés** :
- `src/services/blockOrchestrator.ts` : Aucune fonction de réconciliation
- `src/services/validators.ts` : Aucune validation de noms canoniques
- `src/engine/axiomExecutor.ts` : Aucune logique de remplacement

### 2.2 Logique implicite (via prompt)

**Référence** : `src/prompts/metier/AXIOM_PROFIL.txt` (lignes 594-600)

**Instruction dans le prompt métier** :
```
Si le candidat ne se souvient pas du nom exact d'un personnage
mais le décrit clairement (fonction, rôle, relation, comportement),
AXIOM DOIT :
• identifier sans ambiguïté le personnage correspondant dans l'œuvre,
• remplacer la description par le NOM CANONIQUE officiel du personnage,
• utiliser exclusivement ce nom canonique dans toutes les questions suivantes.
```

**Référence dans le prompt système** : `src/services/blockOrchestrator.ts` (lignes 918-920)

**Instruction dans le prompt système** :
```
ÉTAPE 2 — PERSONNAGES PRÉFÉRÉS (1 à 3) :
Pour chaque œuvre, génère la question : "Dans [NOM DE L'ŒUVRE], quels sont les 1 à 3 personnages qui te parlent le plus ?"
Format : Question ouverte (pas de choix multiples).
```

**Observation** : Le prompt système ne mentionne **pas explicitement** la réconciliation des personnages.

### 2.3 Hypothèse technique

**Hypothèse formulée** : La réconciliation des personnages est **déléguée entièrement à l'IA** via le prompt métier, sans validation ni correction côté code.

**Justification** :
1. Aucune logique explicite de réconciliation dans le code
2. Le prompt métier contient l'instruction, mais elle n'est pas réinjectée dans le prompt système BLOC 2B
3. Aucune validation post-génération pour vérifier que les noms sont canoniques

**Risque identifié** :
- Si l'IA ne suit pas l'instruction du prompt métier, aucune correction n'est appliquée
- Les questions traits peuvent contenir des descriptions au lieu de noms canoniques
- Aucun garde-fou technique pour garantir la réconciliation

### 2.4 Conclusion sur la réconciliation

**État actuel** :
- ❌ **Aucune logique explicite** de réconciliation dans le code
- ⚠️ **Logique implicite** via prompt métier (mais pas réinjectée dans prompt système BLOC 2B)
- ⚠️ **Aucune validation** post-génération

**Conformité à la doctrine** :
- ⚠️ **PARTIELLEMENT CONFORME** : La doctrine exige la réconciliation, mais elle n'est garantie que par le prompt (non validée)

---

## 3️⃣ FAIL-FAST & GESTION D'ERREURS — ANALYSE TECHNIQUE

### 3.1 Propagation de l'erreur

**Référence** : `src/services/blockOrchestrator.ts` (lignes 1096-1103)

**Code** :
```typescript
// Si retry échoue aussi → ERREUR ASSUMÉE (pas de questions servies)
if (!retryMotifsValid || !retryTraitsValid) {
  const failedReasons: string[] = [];
  if (!retryMotifsValid) failedReasons.push('motifs');
  if (!retryTraitsValid) failedReasons.push('traits');
  
  throw new Error(`BLOC 2B validation failed after retry. Reasons: ${failedReasons.join(', ')}. Cannot serve generic questions.`);
}
```

**Observation** : L'erreur est **throw** sans être catchée dans `validateAndRetryQuestions2B()`.

### 3.2 Gestion dans `handleBlock2B()`

**Référence** : `src/services/blockOrchestrator.ts` (lignes 776-782)

**Code** :
```typescript
// Validation sémantique avec retry contrôlé (FAIL-FAST QUALITATIF)
const validatedQuestions = await this.validateAndRetryQuestions2B(
  questions,
  works,
  currentCandidate,
  coreWorkAnswer
);
```

**Observation** : L'appel à `validateAndRetryQuestions2B()` n'est **pas dans un try/catch**. L'erreur sera propagée.

### 3.3 Gestion dans `handleMessage()`

**Référence** : `src/services/blockOrchestrator.ts` (lignes 121-240)

**Code** : `handleMessage()` appelle `handleBlock2B()` sans try/catch explicite.

**Observation** : L'erreur sera propagée jusqu'à l'appelant.

### 3.4 Gestion dans `src/server.ts`

**Référence** : `src/server.ts` (lignes 785-786)

**Code** :
```typescript
const orchestrator = new BlockOrchestrator();
const result = await orchestrator.handleMessage(candidate, userMessageText, null);
```

**Observation** : L'appel à `orchestrator.handleMessage()` n'est **pas dans un try/catch**.

### 3.5 Conséquence technique

**Scénario** :
1. `validateAndRetryQuestions2B()` throw une `Error`
2. L'erreur remonte : `handleBlock2B()` → `handleMessage()` → `POST /axiom`
3. Express.js catch l'erreur non gérée
4. **Résultat** : Réponse HTTP **500 Internal Server Error** brute

**Réponse attendue** :
```json
{
  "error": "Internal Server Error",
  "message": "BLOC 2B validation failed after retry. Reasons: motifs, traits. Cannot serve generic questions."
}
```

**Risque** :
- ⚠️ **500 brute** : Pas de message utilisateur-friendly
- ⚠️ **Pas de fallback** : Le candidat ne peut pas continuer
- ⚠️ **Pas de log structuré** : L'erreur est loguée par Express, mais pas avec les tags `[2B_VALIDATION_FAIL] fatal=true`

### 3.6 Conclusion sur la gestion d'erreurs

**État actuel** :
- ❌ **Erreur non catchée** : Risque de 500 brute
- ❌ **Pas de message utilisateur-friendly** : Erreur technique brute
- ⚠️ **Logs présents** : `[2B_VALIDATION_FAIL] fatal=true` est logué AVANT le throw, mais l'erreur HTTP n'est pas structurée

**Conformité** :
- ⚠️ **PARTIELLEMENT CONFORME** : Le fail-fast fonctionne, mais la gestion d'erreur côté API n'est pas optimale

---

## 4️⃣ HYPOTHÈSES TECHNIQUES FORMULÉES

### 4.1 Hypothèse 1 : Validation des propositions suffit

**Hypothèse** : La validation des **propositions uniquement** (A/B/C/D/E) suffit à garantir la spécificité AXIOM.

**Justification** :
- Les questions génériques sont acceptables selon la doctrine
- La spécificité réside dans les propositions, pas dans la question
- Les validateurs `validateMotifsSpecificity` et `validateTraitsSpecificity` vérifient l'unicité des propositions

**Source** : Doctrine AXIOM (questions génériques acceptables)

**Conformité** : ✅ **CONFORME**

### 4.2 Hypothèse 2 : Réconciliation déléguée à l'IA

**Hypothèse** : La réconciliation des personnages (descriptions → noms canoniques) est **déléguée entièrement à l'IA** via le prompt, sans validation côté code.

**Justification** :
- Le prompt métier contient l'instruction de réconciliation
- Aucune logique explicite de réconciliation dans le code
- Aucune validation post-génération pour vérifier les noms canoniques

**Source** : Analyse du code (aucune fonction de réconciliation trouvée)

**Conformité** : ⚠️ **PARTIELLEMENT CONFORME** (dépend de la fidélité de l'IA au prompt)

### 4.3 Hypothèse 3 : Fail-fast sans gestion d'erreur API

**Hypothèse** : Le fail-fast qualitatif est implémenté au niveau de la validation, mais la gestion d'erreur côté API (try/catch, message utilisateur-friendly) n'a pas été anticipée.

**Justification** :
- L'erreur est throw dans `validateAndRetryQuestions2B()`
- Aucun try/catch dans `handleBlock2B()`, `handleMessage()`, ou `POST /axiom`
- Risque de 500 brute

**Source** : Analyse du code (lignes 776-786, 785-786)

**Conformité** : ⚠️ **PARTIELLEMENT CONFORME** (fail-fast fonctionne, mais gestion API incomplète)

### 4.4 Hypothèse 4 : Prompt contradictoire (non bloquant)

**Hypothèse** : Le prompt système contient "AUCUNE question générique n'est autorisée" (ligne 896), ce qui est **contradictoire** avec la doctrine (questions génériques acceptables), mais cette contradiction n'a **pas d'impact fonctionnel** car la validation ne vérifie pas cette règle.

**Justification** :
- Le prompt dit "AUCUNE question générique"
- La doctrine dit "questions génériques acceptables"
- La validation ne vérifie pas le libellé de la question, seulement les propositions

**Source** : `src/services/blockOrchestrator.ts` (ligne 896) vs doctrine AXIOM

**Conformité** : ⚠️ **CONTRADICTION MAJEURE** (mais non bloquante fonctionnellement)

---

## 5️⃣ SYNTHÈSE FINALE — CONFORMITÉ GLOBALE

### 5.1 Points conformes ✅

1. **Validation des propositions** : Conforme à la doctrine (seules les propositions sont validées, pas les questions)
2. **Fail-fast qualitatif** : Fonctionne (bloque le serving si validation échoue après retry)
3. **Logs explicites** : Présents (`[2B_VALIDATION_FAIL]`, `[2B_RETRY_TRIGGERED]`)

### 5.2 Points partiellement conformes ⚠️

1. **Réconciliation des personnages** :
   - Doctrine : Exigée
   - Implémentation : Déléguée à l'IA via prompt (non validée)
   - Risque : Si l'IA ne suit pas le prompt, aucune correction

2. **Gestion d'erreur API** :
   - Doctrine : Fail-fast fonctionne
   - Implémentation : Erreur throw → 500 brute
   - Risque : Message utilisateur non friendly, pas de fallback

3. **Prompt contradictoire** :
   - Doctrine : Questions génériques acceptables
   - Implémentation : Prompt dit "AUCUNE question générique"
   - Impact : Aucun (validation ne vérifie pas cette règle)

### 5.3 Points non conformes ❌

**Aucun point non conforme critique identifié.**

Les écarts identifiés sont des **points d'attention** (réconciliation, gestion d'erreur API) mais ne violent pas la doctrine de manière bloquante.

### 5.4 Recommandation globale

**Verdict** : L'implémentation actuelle est **CONFORME à la doctrine AXIOM** sur le plan sémantique.

**Justification** :
- ✅ La validation vérifie uniquement les propositions (conforme)
- ✅ Les questions génériques sont acceptées (conforme)
- ⚠️ La réconciliation est déléguée à l'IA (acceptable, mais non garantie)
- ⚠️ La gestion d'erreur API pourrait être améliorée (non bloquant)

**Points d'attention pour amélioration future** (non bloquants) :
1. Ajouter une validation post-génération des noms canoniques (optionnel)
2. Améliorer la gestion d'erreur API (try/catch, message utilisateur-friendly)
3. Corriger la contradiction dans le prompt système (ligne 896)

---

## 6️⃣ CONCLUSION

L'implémentation actuelle du BLOC 2B est **conforme à la doctrine AXIOM** sur le plan sémantique.

La validation vérifie uniquement les **propositions** (A/B/C/D/E), ce qui est conforme à la doctrine (questions génériques acceptables, spécificité dans les propositions).

Les points d'attention identifiés (réconciliation personnages, gestion d'erreur API) sont des **améliorations possibles** mais ne remettent pas en cause la conformité actuelle.

**Aucune modification urgente n'est nécessaire.**
