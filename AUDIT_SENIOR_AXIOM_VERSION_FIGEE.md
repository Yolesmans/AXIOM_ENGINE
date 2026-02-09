# 🔍 AUDIT SENIOR — AXIOM (VERSION À FIGER)

**Date** : 2025-01-27  
**Version analysée** : Version actuelle déployée (post-LOT 1)  
**Objectif** : Diagnostic exhaustif sans modification de code  
**Statut** : ✅ BASE À FIGER — Aucun correctif sans validation

---

## 📋 EXECUTIVE SUMMARY

### État général
La version actuelle d'AXIOM est **globalement stable et fonctionnelle**. Le parcours se déroule de bout en bout sans blocage technique majeur. Les corrections LOT 1 (validation miroirs, séquentialité stricte) sont opérationnelles.

### Points d'attention identifiés
6 écarts qualitatifs/logiques/sémantiques ont été identifiés, **aucun n'est bloquant** mais tous nécessitent une analyse de fond pour décider :
- S'ils sont volontaires (choix produit)
- S'ils sont accidentels (bug logique)
- S'ils sont améliorables sans casser

### Méthodologie
- ✅ Analyse code source (backend + frontend)
- ✅ Analyse prompts (PROMPT_AXIOM_PROFIL, PROMPT_AXIOM_MATCHING)
- ✅ Analyse logique métier (orchestrateur, FSM, transitions)
- ✅ Distinction stricte : logique produit vs logique moteur vs logique LLM

---

## 1️⃣ TRANSITION BLOC 2A → BLOC 2B

### 🔴 PROBLÈME OBSERVÉ
À la fin du BLOC 2A (3 réponses stockées), le BLOC 2B ne se déclenche pas automatiquement. Une validation manuelle type "ok" est nécessaire.

### 📍 PREUVE DANS LE CODE

**Fichier** : `src/services/blockOrchestrator.ts:135-148`

```typescript
// Détecter BLOC 2A (première partie du BLOC 2)
if (currentBlock === 2 && (currentStep === BLOC_02 || currentStep === '')) {
  // Vérifier si BLOC 2A est terminé (3 réponses stockées)
  const answerMap = candidate.answerMaps?.[2];
  const answers = answerMap?.answers || {};
  const answeredCount = Object.keys(answers).length;
  
  // Si BLOC 2A terminé (3 réponses) → passer à BLOC 2B
  if (answeredCount >= 3) {
    return this.handleBlock2B(candidate, userMessage, event);
  }
  
  // Sinon → continuer BLOC 2A
  return this.handleBlock2A(candidate, userMessage, event);
}
```

**Fichier** : `src/services/blockOrchestrator.ts:612-637`

```typescript
// Si 2 réponses → Générer question 2A.3 (Œuvre noyau)
if (updatedAnsweredCount === 2) {
  // ... génération question 2A.3 ...
  return {
    response: question,
    step: BLOC_02,
    expectsAnswer: true,  // ← Champ actif
    autoContinue: false,  // ← Pas d'auto-continuation
  };
}
```

**Fichier** : `src/services/blockOrchestrator.ts:637-651`

```typescript
// Cas 3 : Pas de message utilisateur → Retourner la dernière question si disponible
const lastQuestion = currentCandidate.session.ui?.lastQuestion;
if (lastQuestion) {
  return {
    response: lastQuestion,
    step: BLOC_02,
    expectsAnswer: true,
    autoContinue: false,  // ← Pas d'auto-continuation
  };
}
```

### 🔍 DIAGNOSTIC

**Cause technique identifiée** :
- Le code détecte bien `answeredCount >= 3` et délègue à `handleBlock2B`
- **MAIS** : Cette délégation ne se produit **QUE si un `userMessage` est présent**
- Si l'utilisateur répond à la question 2A.3 et que `updatedAnsweredCount === 3`, le code ne vérifie **PAS** immédiatement si BLOC 2A est terminé pour déclencher BLOC 2B
- Le déclenchement se fait au **prochain appel** avec `userMessage` (d'où le besoin d'un "ok")

**Logique produit vs logique moteur** :
- **Logique produit** : BLOC 2A → BLOC 2B devrait être automatique (comme BLOC 1 → BLOC 2A après validation miroir)
- **Logique moteur actuelle** : Transition conditionnelle uniquement si `userMessage` présent ET `answeredCount >= 3`

### ✅ VOLONTAIRE OU ACCIDENTEL ?

**Hypothèse 1 (Volontaire)** : Verrou UX pour permettre à l'utilisateur de "valider" avant de passer à l'analyse projective (BLOC 2B).  
**Hypothèse 2 (Accidentel)** : Bug logique — la transition devrait être automatique comme les autres blocs.

**Preuve** : Comparaison avec BLOC 1 → BLOC 2A (ligne 255-300 de `blockOrchestrator.ts`) :
- Après validation miroir BLOC 1, la question BLOC 2A.1 est générée **immédiatement**
- Pas de validation manuelle supplémentaire

**Conclusion** : **ACCIDENTEL** — Incohérence avec le reste du parcours.

### 📊 IMPACT UTILISATEUR
- **Friction UX** : L'utilisateur doit envoyer un message vide ou "ok" pour continuer
- **Rupture de rythme** : Le parcours semble "bloqué" alors qu'il devrait continuer
- **Incohérence** : Toutes les autres transitions sont automatiques

### 🎯 PLAN D'ACTION PROPOSÉ

**Option A (Recommandée)** : Transition automatique après réponse 2A.3
- Modifier `handleBlock2A` pour détecter `updatedAnsweredCount === 3`
- Si 3 réponses → appeler immédiatement `handleBlock2B` (sans attendre message utilisateur)
- Aligner avec logique BLOC 1 → BLOC 2A

**Option B** : Garder verrou UX mais expliciter
- Ajouter un message explicite : "On passe maintenant à l'analyse projective de tes œuvres"
- Rendre l'attente intentionnelle et claire

**Risque** : Faible — modification locale dans `handleBlock2A`

---

## 2️⃣ SÉLECTION DES ŒUVRES (BLOC 2A / 2B)

### 🔴 PROBLÈME OBSERVÉ
Cas observé : 3 œuvres + 1 œuvre noyau renseignées, mais analyse menée sur 2 œuvres classiques + 1 œuvre noyau. 1 œuvre ignorée (ex : Vikings non traitée).

### 📍 PREUVE DANS LE CODE

**Fichier** : `src/services/blockOrchestrator.ts:891-896`

```typescript
// Parser les 3 œuvres depuis preferencesAnswer
const works = this.parseWorks(preferencesAnswer);
if (works.length < 3) {
  console.error('[ORCHESTRATOR] [2B_CONTEXT_INJECTION] forced=false - Less than 3 works found');
  throw new Error(`Expected 3 works, found ${works.length}. Cannot proceed to BLOC 2B.`);
}
```

**Fichier** : `src/services/blockOrchestrator.ts:1041-1050`

```typescript
private parseWorks(preferencesAnswer: string): string[] {
  // Essayer de parser : "Œuvre 1, Œuvre 2, Œuvre 3" ou "Œuvre 1\nŒuvre 2\nŒuvre 3"
  const works = preferencesAnswer
    .split(/[,\n]/)
    .map(w => w.trim())
    .filter(w => w.length > 0)
    .slice(0, 3); // ← Prendre les 3 premières
  
  return works;
}
```

**Fichier** : `src/services/blockOrchestrator.ts:1090-1158` (Prompt génération questions 2B)

```typescript
🟦 DÉROULÉ STRICT (POUR CHAQUE ŒUVRE, dans l'ordre #3 → #2 → #1) :

ÉTAPE 1 — MOTIF PRINCIPAL :
Pour chaque œuvre, génère la question : "Qu'est-ce qui t'attire le PLUS dans [NOM DE L'ŒUVRE] ?"
...
---QUESTION_SEPARATOR---
[Question motif Œuvre #3]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #3]
...
---QUESTION_SEPARATOR---
[Question motif Œuvre #2]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #2]
...
---QUESTION_SEPARATOR---
[Question motif Œuvre #1]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #1]
```

### 🔍 DIAGNOSTIC

**Cause technique identifiée** :
1. **Parsing** : `parseWorks()` prend les 3 premières œuvres depuis `preferencesAnswer` (ligne 1047 : `.slice(0, 3)`)
2. **Ordre** : Le prompt demande analyse dans l'ordre `#3 → #2 → #1` (ligne 1090)
3. **Œuvre noyau** : L'œuvre noyau est injectée séparément (`coreWorkAnswer`) et **n'est PAS** dans le tableau `works[]`
4. **Génération LLM** : Le LLM peut choisir d'analyser uniquement certaines œuvres si le prompt n'est pas strictement respecté

**Logique produit vs logique moteur** :
- **Logique produit** : "Analyse projective des 3 œuvres" → devrait analyser les 3 œuvres de `preferencesAnswer` + l'œuvre noyau
- **Logique moteur actuelle** : Parse 3 œuvres, injecte œuvre noyau séparément, LLM peut ignorer certaines œuvres

### ✅ VOLONTAIRE OU ACCIDENTEL ?

**Hypothèse 1 (Volontaire)** : Priorisation — l'œuvre noyau a un poids plus fort (confirmé ligne 594 du prompt : "AXIOM accorde un poids interprétatif plus fort à l'œuvre noyau").  
**Hypothèse 2 (Accidentel)** : Le LLM n'est pas contraint strictement à analyser TOUTES les œuvres.

**Preuve** : Le prompt (ligne 1090-1158) liste bien les 3 œuvres mais ne contient **PAS** d'interdiction explicite de sauter une œuvre.

**Conclusion** : **ACCIDENTEL** — Manque de contrainte stricte dans le prompt.

### 📊 IMPACT UTILISATEUR
- **Promesse non tenue** : "Analyse projective des 3 œuvres" → 1 œuvre peut être ignorée
- **Perte d'information** : Les préférences de l'utilisateur ne sont pas toutes exploitées
- **Incohérence** : L'utilisateur a fourni 3 œuvres, s'attend à ce qu'elles soient toutes analysées

### 🎯 PLAN D'ACTION PROPOSÉ

**Option A (Recommandée)** : Renforcer le prompt avec contrainte stricte
- Ajouter dans le prompt : "⚠️ OBLIGATION : Analyser EXACTEMENT les 3 œuvres #3, #2, #1. Aucune œuvre ne peut être ignorée."
- Ajouter validation post-génération : vérifier que les 3 œuvres sont présentes dans les questions générées

**Option B** : Validation sémantique des œuvres
- Parser les questions générées pour extraire les noms d'œuvres mentionnés
- Comparer avec `works[]` pour détecter les manquantes
- Retry si une œuvre est absente

**Risque** : Moyen — dépend de la capacité du LLM à respecter strictement le prompt

---

## 3️⃣ COMPRÉHENSION SÉMANTIQUE DES PERSONNAGES (BLOC 2B)

### 🔴 PROBLÈME OBSERVÉ
Test volontaire : Réponse utilisateur "Tommy, Arthur et l'autre frère" → Attendu : inférence correcte → John Shelby. Observé : "Maintenant, pour le dernier frère que tu as mentionné…"

### 📍 PREUVE DANS LE CODE

**Fichier** : `src/services/blockOrchestrator.ts:1217-1244` (Prompt retry réconciliation)

```typescript
⚠️ RÈGLE CRITIQUE — RÉCONCILIATION PERSONNAGES (NON NÉGOCIABLE) :

Si le candidat décrit un personnage (ex: "le chef", "son associée", "celui qui ne ment jamais"),
AXIOM DOIT :
- identifier sans ambiguïté le personnage correspondant dans l'œuvre,
- remplacer la description par le NOM CANONIQUE officiel du personnage,
- utiliser exclusivement ce nom canonique dans toutes les questions suivantes.

EXEMPLES :
- "le chef" → "Tommy Shelby" (Peaky Blinders)
- "son associée" → "Alicia Florrick" (The Good Wife)
- "celui qui ne ment jamais" → "Ned Stark" (Game of Thrones)

⚠️ INTERDICTIONS :
- JAMAIS utiliser de descriptions floues dans les questions
- JAMAIS utiliser "l'autre", "celui", "celle" sans nom
- TOUJOURS utiliser le nom complet et officiel du personnage
```

**Fichier** : `src/services/blockOrchestrator.ts:1102-1114` (Prompt génération initiale)

```typescript
ÉTAPE 2 — PERSONNAGES PRÉFÉRÉS (1 à 3) :
Pour chaque œuvre, génère la question : "Dans [NOM DE L'ŒUVRE], quels sont les 1 à 3 personnages qui te parlent le plus ?"
Format : Question ouverte (pas de choix multiples).

ÉTAPE 3 — TRAIT DOMINANT (PERSONNALISÉ À CHAQUE PERSONNAGE) :
Pour CHAQUE personnage cité (1 à 3 par œuvre), génère la question : "Chez [NOM DU PERSONNAGE], qu'est-ce que tu apprécies le PLUS ?"
```

**Fichier** : `src/services/blockOrchestrator.ts:1273-1284` (Prompt retry)

```typescript
⚠️ IMPORTANT : Utilise TOUJOURS le NOM CANONIQUE du personnage, jamais une description.
```

### 🔍 DIAGNOSTIC

**Cause technique identifiée** :
1. **Prompt initial** : Ne contient **PAS** la règle de réconciliation (ligne 1102-1114)
2. **Prompt retry** : Contient la règle de réconciliation (ligne 1217-1244) mais **uniquement** si validation échoue
3. **Génération questions** : Les questions sont générées **AVANT** que l'utilisateur réponde (génération en lot)
4. **Réconciliation** : La réconciliation devrait se faire **APRÈS** la réponse utilisateur, lors de la génération des questions de traits

**Logique produit vs logique moteur** :
- **Logique produit** : AXIOM doit inférer "l'autre frère" → "John Shelby" et utiliser ce nom dans les questions suivantes
- **Logique moteur actuelle** : La réconciliation n'est demandée que dans le prompt retry, pas dans le prompt initial

### ✅ VOLONTAIRE OU ACCIDENTEL ?

**Hypothèse 1 (Volontaire)** : La réconciliation est un mécanisme de fallback si le LLM ne comprend pas.  
**Hypothèse 2 (Accidentel)** : La réconciliation devrait être dans le prompt initial, pas seulement dans le retry.

**Preuve** : Le prompt retry (ligne 1217) contient des exemples explicites de réconciliation, mais le prompt initial (ligne 1102) ne mentionne pas cette capacité.

**Conclusion** : **ACCIDENTEL** — Règle de réconciliation absente du prompt initial.

### 📊 IMPACT UTILISATEUR
- **Frustration** : L'utilisateur doit clarifier alors qu'AXIOM devrait comprendre
- **Perte de fluidité** : Le parcours devient mécanique au lieu d'être intelligent
- **Incohérence** : AXIOM promet de comprendre les descriptions mais ne le fait pas systématiquement

### 🎯 PLAN D'ACTION PROPOSÉ

**Option A (Recommandée)** : Intégrer réconciliation dans prompt initial
- Ajouter la règle de réconciliation dans `generateQuestions2B()` (ligne 1068)
- Inclure les exemples d'inférence dans le prompt initial
- Garder le retry comme renforcement si échec

**Option B** : Réconciliation post-réponse
- Parser la réponse utilisateur pour détecter descriptions floues
- Appeler LLM pour réconciliation avant génération questions traits
- Injecter noms canoniques dans le contexte

**Risque** : Faible — ajout de règles dans prompt, pas de changement structurel

---

## 4️⃣ QUALITÉ DES QUESTIONS PROJECTIVES (ŒUVRES)

### 🔴 PROBLÈME OBSERVÉ
Exemple actuel (trop générique) : Ascension, Décor, Relations, Ambiance, Stratégie.  
Attendu (niveau AXIOM) : Axes symboliques, Valeurs implicites, Rapport au cadre, à la liberté, à la loyauté, au pouvoir, au sens.

### 📍 PREUVE DANS LE CODE

**Fichier** : `src/services/blockOrchestrator.ts:1092-1100` (Prompt génération questions)

```typescript
ÉTAPE 1 — MOTIF PRINCIPAL :
Pour chaque œuvre, génère la question : "Qu'est-ce qui t'attire le PLUS dans [NOM DE L'ŒUVRE] ?"
Génère 5 propositions UNIQUES, spécifiques à cette œuvre.
Ces propositions doivent représenter réellement l'œuvre (ascension, décor, ambiance, relations, rythme, morale, stratégie, quotidien, chaos, etc.).
AXIOM choisit les axes pertinents, œuvre par œuvre.
Format : A / B / C / D / E (1 lettre attendue)

⚠️ CRITIQUE : Les 5 propositions pour l'Œuvre #3 doivent être DIFFÉRENTES des propositions pour l'Œuvre #2, qui doivent être DIFFÉRENTES de celles pour l'Œuvre #1.
Chaque œuvre a ses propres axes d'attraction.
```

**Fichier** : `src/services/validators.ts` (Validation motifs)

```typescript
// Validation sémantique : vérifier que les motifs ne sont pas génériques
// Vérifier que les propositions sont spécifiques à l'œuvre
```

### 🔍 DIAGNOSTIC

**Cause technique identifiée** :
1. **Prompt** : Liste des exemples (ascension, décor, ambiance, relations, rythme, morale, stratégie, quotidien, chaos) → le LLM peut se limiter à ces exemples
2. **Validation** : `validateMotifsSpecificity()` vérifie la différence entre œuvres mais **PAS** la profondeur sémantique
3. **Manque de guidance** : Le prompt ne demande **PAS** explicitement d'axes symboliques, valeurs implicites, rapport au pouvoir, etc.

**Logique produit vs logique moteur** :
- **Logique produit** : Questions projectives profondes, axes symboliques, valeurs implicites
- **Logique moteur actuelle** : Validation de spécificité entre œuvres, mais pas de validation de profondeur sémantique

### ✅ VOLONTAIRE OU ACCIDENTEL ?

**Hypothèse 1 (Volontaire)** : Les exemples (ascension, décor, etc.) sont des suggestions, le LLM peut aller plus loin.  
**Hypothèse 2 (Accidentel)** : Le prompt n'est pas assez exigeant sur la profondeur sémantique.

**Preuve** : Comparaison avec le prompt BLOC 2B dans `prompts.ts` (ligne 627-648) :
- Le prompt mentionne "ascension, décor, ambiance, relations, rythme, morale, stratégie, quotidien, chaos"
- **MAIS** ne mentionne **PAS** "axes symboliques, valeurs implicites, rapport au pouvoir, à la liberté, à la loyauté"

**Conclusion** : **ACCIDENTEL** — Prompt pas assez exigeant sur la profondeur.

### 📊 IMPACT UTILISATEUR
- **Appauvrissement** : Les questions deviennent mécaniques au lieu d'être projectives
- **Perte de valeur** : AXIOM perd son différenciateur (analyse projective profonde)
- **Incohérence** : Promesse "analyse projective" vs réalité "questions génériques"

### 🎯 PLAN D'ACTION PROPOSÉ

**Option A (Recommandée)** : Renforcer le prompt avec exigence de profondeur
- Ajouter dans le prompt : "⚠️ PROFONDEUR OBLIGATOIRE : Les propositions doivent explorer des axes symboliques, valeurs implicites, rapport au cadre, à la liberté, à la loyauté, au pouvoir, au sens. Éviter les propositions purement descriptives (décor, ambiance)."
- Ajouter validation sémantique : détecter mots interdits (décor, ambiance, relations si trop génériques)

**Option B** : Validation sémantique post-génération
- Créer `validateMotifsDepth()` : vérifier présence d'axes symboliques
- Retry si validation échoue

**Risque** : Moyen — dépend de la capacité du LLM à générer des propositions profondes

---

## 5️⃣ QUALITÉ DES MIROIRS INTERPRÉTATIFS (BLOC 2B et suivants)

### 🔴 PROBLÈME OBSERVÉ
Observé : Synthèse descriptive, correcte mais plate. Ton analytique "neutre". Peu de posture mentor / lecture implicite.  
Attendu : Analyse projective structurée. Lecture des invariants. Mise en tension. Point de vigilance implicite. Ton mentor lucide, non flatteur, non générique.

### 📍 PREUVE DANS LE CODE

**Fichier** : `src/services/blockOrchestrator.ts:1671-1701` (Prompt génération miroir 2B)

```typescript
⚠️ RÈGLES ABSOLUES POUR LA SYNTHÈSE :

1. La synthèse DOIT être VRAIMENT PERSONNALISÉE (4 à 6 lignes max).
2. Elle DOIT croiser explicitement :
   - motifs choisis + personnages cités + traits valorisés
3. Elle DOIT faire ressortir des constantes claires :
   - rapport au pouvoir
   - rapport à la pression
   - rapport aux relations
   - posture face à la responsabilité
4. Elle DOIT inclure 1 point de vigilance réaliste, formulé sans jugement.
5. Elle DOIT citer explicitement les œuvres ET les personnages.
6. Elle DOIT être exploitable pour la suite du profil (management, ambition, environnements).

Format : Synthèse continue, dense, incarnée, structurante.
PAS de liste à puces. PAS de formatage excessif.
Une lecture projective, pas descriptive.
```

**Fichier** : `src/engine/axiomExecutor.ts:1583-1625` (Prompt miroir BLOCS 3-9)

```typescript
⚠️ FORMAT STRICT OBLIGATOIRE — NON NÉGOCIABLE

1️⃣ Lecture implicite
- UNE SEULE phrase
- MAXIMUM 20 mots EXACTEMENT
- Position interprétative claire
- Lecture en creux obligatoire (ce n'est probablement pas X, mais plutôt Y)
- Interdiction ABSOLUE de paraphraser ou lister

2️⃣ Déduction personnalisée
- UNE SEULE phrase
- MAXIMUM 25 mots EXACTEMENT
- Explicite une tension, un moteur ou un besoin implicite
- Lecture en creux obligatoire
- Interdiction de neutralité ou de synthèse

3️⃣ Validation ouverte
- Phrase EXACTE et INCHANGÉE :
"Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."
```

**Fichier** : `src/engine/prompts.ts:273-285` (Exigence de profondeur)

```typescript
⚠️ EXIGENCE DE PROFONDEUR (NON OPTIONNELLE)

Le MIROIR INTERPRÉTATIF ne doit JAMAIS être neutre ou descriptif.

AXIOM DOIT :
• prendre une position interprétative claire,
• formuler au moins UNE lecture en creux ("ce n'est probablement pas X, mais plutôt Y"),
• expliciter une tension, un moteur ou un besoin implicite.
⚠️ Cette exigence de profondeur doit s'exprimer
STRICTEMENT DANS LE FORMAT MINIMAL DU MIROIR.
La profondeur ne se mesure PAS à la longueur,
mais à la justesse de l'angle interprétatif.
```

### 🔍 DIAGNOSTIC

**Cause technique identifiée** :
1. **Prompts** : Les prompts contiennent bien les exigences (profondeur, lecture en creux, ton mentor)
2. **Validation** : `validateMirrorREVELIOM()` vérifie le format (3 sections, longueur) mais **PAS** la profondeur sémantique
3. **Retry** : Le retry renforce le format mais **PAS** la profondeur
4. **LLM** : Le LLM peut respecter le format sans respecter la profondeur (20/25 mots descriptifs au lieu de projectifs)

**Logique produit vs logique moteur** :
- **Logique produit** : Miroirs projectifs, lecture en creux, ton mentor lucide
- **Logique moteur actuelle** : Validation de format, mais pas de validation de profondeur sémantique

### ✅ VOLONTAIRE OU ACCIDENTEL ?

**Hypothèse 1 (Volontaire)** : La profondeur est laissée au LLM, le format est validé.  
**Hypothèse 2 (Accidentel)** : Manque de validation sémantique de la profondeur.

**Preuve** : Le prompt (ligne 273-285) exige la profondeur, mais `validateMirrorREVELIOM()` ne vérifie que le format.

**Conclusion** : **ACCIDENTEL** — Validation de format sans validation de profondeur.

### 📊 IMPACT UTILISATEUR
- **Appauvrissement** : Les miroirs deviennent descriptifs au lieu d'être projectifs
- **Perte de valeur** : AXIOM perd son différenciateur (analyse interprétative profonde)
- **Incohérence** : Promesse "lecture en creux" vs réalité "synthèse descriptive"

### 🎯 PLAN D'ACTION PROPOSÉ

**Option A (Recommandée)** : Validation sémantique de profondeur
- Créer `validateMirrorDepth()` : détecter mots interdits (paraphrase, description neutre)
- Détecter présence de "lecture en creux" (probablement, plutôt, mais)
- Détecter présence de "tension/moteur implicite"
- Retry si validation échoue

**Option B** : Renforcer le prompt avec exemples négatifs
- Ajouter dans le prompt : "⚠️ INTERDIT : Synthèse descriptive, ton neutre, paraphrase. EXIGÉ : Position interprétative, lecture en creux, tension implicite."

**Risque** : Moyen — dépend de la capacité du LLM à générer des miroirs profonds

---

## 6️⃣ FIN DE BLOC 3 — MESSAGE INCOMPRIS

### 🔴 PROBLÈME OBSERVÉ
Un message de fin de bloc est apparu, perçu comme ambigu, peu lisible, difficile à relier au protocole AXIOM.

### 📍 PREUVE DANS LE CODE

**Fichier** : `src/engine/axiomExecutor.ts:1583-1625` (Prompt miroir BLOCS 3-9)

```typescript
⚠️ FORMAT STRICT OBLIGATOIRE — NON NÉGOCIABLE

1️⃣ Lecture implicite
- UNE SEULE phrase
- MAXIMUM 20 mots EXACTEMENT
- Position interprétative claire
- Lecture en creux obligatoire (ce n'est probablement pas X, mais plutôt Y)
- Interdiction ABSOLUE de paraphraser ou lister

2️⃣ Déduction personnalisée
- UNE SEULE phrase
- MAXIMUM 25 mots EXACTEMENT
- Explicite une tension, un moteur ou un besoin implicite
- Lecture en creux obligatoire
- Interdiction de neutralité ou de synthèse

3️⃣ Validation ouverte
- Phrase EXACTE et INCHANGÉE :
"Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."
```

**Fichier** : `src/engine/prompts.ts:234-247` (Règle transition de bloc)

```typescript
🧠 RÈGLE AXIOM — VERROU DE TRANSITION DE BLOC (OBLIGATOIRE)

À la fin de CHAQUE bloc validé (1 à 9),
AXIOM DOIT obligatoirement :
	1.	annoncer explicitement la fin du bloc courant,
	2.	annoncer explicitement le numéro et le nom du bloc suivant,
	3.	puis SEULEMENT après, poser la première question du bloc suivant.

AXIOM n'a PAS le droit de :
	•	revenir à un bloc précédent,
	•	poser une question d'un autre bloc,
	•	mélanger deux blocs.

Ce verrou est prioritaire sur toute autre logique conversationnelle.
```

### 🔍 DIAGNOSTIC

**Cause technique identifiée** :
1. **Format miroir** : Le miroir doit respecter le format REVELIOM (3 sections, 20/25 mots)
2. **Transition de bloc** : Le prompt demande d'annoncer la fin du bloc et le bloc suivant
3. **Conflit potentiel** : Le format miroir (20/25 mots) peut entrer en conflit avec l'annonce de transition (qui nécessite du texte supplémentaire)

**Logique produit vs logique moteur** :
- **Logique produit** : Miroir REVELIOM strict (3 sections) + annonce transition
- **Logique moteur actuelle** : Le prompt miroir ne mentionne **PAS** l'annonce de transition

### ✅ VOLONTAIRE OU ACCIDENTEL ?

**Hypothèse 1 (Volontaire)** : L'annonce de transition est optionnelle ou implicite.  
**Hypothèse 2 (Accidentel)** : Le prompt miroir ne mentionne pas l'annonce de transition, créant un message ambigu.

**Preuve** : Le prompt miroir (ligne 1583-1625) ne mentionne **PAS** l'annonce de transition, alors que la règle générale (ligne 234-247) l'exige.

**Conclusion** : **ACCIDENTEL** — Incohérence entre format miroir et règle de transition.

### 📊 IMPACT UTILISATEUR
- **Confusion** : L'utilisateur ne comprend pas si le bloc est terminé ou non
- **Rupture de rythme** : Le parcours semble ambigu
- **Incohérence** : Promesse "annonce explicite" vs réalité "message ambigu"

### 🎯 PLAN D'ACTION PROPOSÉ

**Option A (Recommandée)** : Intégrer annonce transition dans prompt miroir
- Ajouter dans le prompt miroir : "Après le miroir, annoncer explicitement : 'Fin du BLOC X. On passe au BLOC Y — [Nom du bloc].'"
- Garder le format REVELIOM strict pour le miroir, ajouter l'annonce après

**Option B** : Annonce transition séparée
- Générer le miroir (format REVELIOM strict)
- Générer l'annonce de transition séparément
- Concaténer les deux dans la réponse

**Risque** : Faible — ajout de texte dans prompt, pas de changement structurel

---

## 📊 SYNTHÈSE GLOBALE

### Classification des écarts

| Point | Type | Priorité | Risque correction | Effort |
|-------|------|----------|-------------------|--------|
| 1. Transition 2A→2B | Accidentel | 🔴 Haute | Faible | Faible |
| 2. Sélection œuvres | Accidentel | 🟡 Moyenne | Moyen | Moyen |
| 3. Réconciliation personnages | Accidentel | 🟡 Moyenne | Faible | Faible |
| 4. Qualité questions projectives | Accidentel | 🟡 Moyenne | Moyen | Moyen |
| 5. Qualité miroirs interprétatifs | Accidentel | 🟡 Moyenne | Moyen | Moyen |
| 6. Message fin BLOC 3 | Accidentel | 🟢 Basse | Faible | Faible |

### Distinction logique produit vs logique moteur vs logique LLM

**Logique produit** :
- Transitions automatiques fluides
- Analyse complète des 3 œuvres
- Compréhension sémantique des descriptions
- Questions projectives profondes
- Miroirs interprétatifs structurants
- Annonces de transition explicites

**Logique moteur actuelle** :
- Transitions conditionnelles (dépendent de `userMessage`)
- Parsing strict (3 premières œuvres)
- Réconciliation uniquement en retry
- Validation de spécificité (pas de profondeur)
- Validation de format (pas de profondeur)
- Format miroir strict (pas d'annonce transition)

**Logique LLM** :
- Respect du prompt (mais peut ignorer certaines contraintes)
- Génération créative (mais peut être générique)
- Inférence sémantique (mais peut être limitée)

### Plan d'actions proposé (sans implémentation)

#### LOT 1 — Transitions automatiques (Priorité 🔴)
- **Action** : Corriger transition BLOC 2A → BLOC 2B
- **Fichiers** : `src/services/blockOrchestrator.ts:612-651`
- **Risque** : Faible
- **Effort** : 1-2h

#### LOT 2 — Contraintes strictes (Priorité 🟡)
- **Action** : Renforcer prompts avec contraintes strictes (œuvres, profondeur)
- **Fichiers** : `src/services/blockOrchestrator.ts:1068-1158`, `src/engine/axiomExecutor.ts:1583-1625`
- **Risque** : Moyen
- **Effort** : 2-3h

#### LOT 3 — Validations sémantiques (Priorité 🟡)
- **Action** : Ajouter validations de profondeur (questions, miroirs)
- **Fichiers** : `src/services/validators.ts` (nouveau), `src/services/validateMirrorReveliom.ts`
- **Risque** : Moyen
- **Effort** : 3-4h

#### LOT 4 — Réconciliation personnages (Priorité 🟡)
- **Action** : Intégrer réconciliation dans prompt initial
- **Fichiers** : `src/services/blockOrchestrator.ts:1068-1158`
- **Risque** : Faible
- **Effort** : 1h

#### LOT 5 — Annonces de transition (Priorité 🟢)
- **Action** : Intégrer annonce transition dans prompt miroir
- **Fichiers** : `src/engine/axiomExecutor.ts:1583-1625`
- **Risque** : Faible
- **Effort** : 1h

---

## ✅ CONCLUSION

### État actuel
La version actuelle est **stable et fonctionnelle**. Les écarts identifiés sont **qualitatifs**, pas bloquants. Aucun bug critique n'a été détecté.

### Recommandations
1. **Figer la version actuelle** comme base de référence
2. **Valider les écarts** avec l'équipe produit (volontaire vs accidentel)
3. **Prioriser les corrections** selon impact utilisateur et risque technique
4. **Implémenter en LOTS verrouillés** avec validation après chaque lot

### Prochaines étapes
1. ✅ Audit terminé (ce document)
2. ⏳ Validation produit (décision volontaire vs accidentel)
3. ⏳ Planification corrections (ordre d'exécution)
4. ⏳ Implémentation LOTS (avec validation)

---

**FIN DE L'AUDIT**
