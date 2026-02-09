# 🔍 AUDIT TECHNIQUE — BLOC 2A / BLOC 2B (CRITIQUE)

**Date** : 2025-01-27  
**Objectif** : Analyser l'état actuel, identifier les risques de dérive, proposer une stratégie de verrouillage pour préserver la valeur projectrice d'AXIOM-REVELIOM

---

## 📋 TABLE DES MATIÈRES

1. [Analyse de l'état actuel](#1-analyse-de-létat-actuel)
2. [Risques identifiés](#2-risques-identifiés)
3. [Recommandations de verrouillage](#3-recommandations-de-verrouillage)
4. [Points NON MODIFIABLES (invariants AXIOM)](#4-points-non-modifiables-invariants-axiom)
5. [Tests avant implémentation BLOC 2B](#5-tests-avant-implémentation-bloc-2b)

---

## 1. ANALYSE DE L'ÉTAT ACTUEL

### 1.1 BLOC 2A — Implémentation actuelle

**Fichier** : `src/services/blockOrchestrator.ts` (lignes 442-522)

#### 1.1.1 Structure des prompts injectés

**Question 2A.1 — Médium** (lignes 442-462) :
```typescript
{
  role: 'system',
  content: `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 1).
Génère UNE question simple demandant au candidat son médium préféré (Série ou Film).
Format : Question à choix avec A. Série / B. Film sur lignes séparées.
La question doit être claire et directe.`
}
```

**Question 2A.2 — Préférences adaptées** (lignes 464-494) :
```typescript
// Détection médium (lignes 469-474)
const isSeries = mediumAnswer.toLowerCase().includes('série') || 
                 mediumAnswer.toLowerCase().includes('serie') ||
                 mediumAnswer.toLowerCase().includes('a.') ||
                 mediumAnswer.toLowerCase().includes('a');

{
  role: 'system',
  content: `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 2).
Le candidat a choisi : ${mediumType}.
Génère UNE question adaptée demandant ses préférences en ${mediumType}s.
La question doit être personnalisée selon le choix du candidat (séries ou films).
Format : Question ouverte ou à choix multiples (A/B/C/D/E si choix).
La question doit être pertinente pour explorer les préférences en ${mediumType}s.`
}
```

**Question 2A.3 — Œuvre noyau** (lignes 496-522) :
```typescript
{
  role: 'system',
  content: `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 3).
Le candidat a choisi : ${mediumAnswer}
Ses préférences : ${preferencesAnswer}
Génère UNE question demandant au candidat de choisir UNE œuvre centrale (noyau) parmi ses préférences.
La question doit être claire et demander une œuvre spécifique (nom d'une série ou d'un film).
Format : Question ouverte demandant le nom de l'œuvre.
La question doit permettre d'identifier l'œuvre la plus significative pour le candidat.`
}
```

#### 1.1.2 Points forts de l'implémentation actuelle

✅ **Séquentialité stricte** : 1 question = 1 réponse = 1 appel API  
✅ **Adaptation dynamique** : Question 2A.2 s'adapte selon médium choisi  
✅ **Historique conversationnel** : `buildConversationHistory()` injecté à chaque appel  
✅ **Stockage structuré** : Réponses stockées dans `AnswerMap[2]` avec indexation claire

#### 1.1.3 Points faibles identifiés

⚠️ **Détection médium fragile** (lignes 469-474) :
- Détection basée sur mots-clés simples (`'série'`, `'a.'`, `'a'`)
- Risque de faux positifs (ex: "J'aime les séries d'animation" → détecté comme "Série" même si réponse était "Film")
- **Impact** : Question 2A.2 peut être mal adaptée

⚠️ **Prompt 2A.2 trop générique** :
- Instruction "Question ouverte ou à choix multiples" → pas de contrainte forte
- Pas de mention explicite du format attendu (3 œuvres)
- **Impact** : L'IA peut générer une question qui ne collecte pas exactement 3 œuvres

⚠️ **Absence de validation format** :
- Aucune validation que la question 2A.1 contient bien "A. Série / B. Film"
- Aucune validation que la question 2A.3 demande bien une œuvre unique
- **Impact** : Questions mal formatées peuvent passer inaperçues

### 1.2 BLOC 2B — État actuel (non implémenté)

**Référence** : `src/prompts/metier/AXIOM_PROFIL.txt` (lignes 493-684)

#### 1.2.1 Structure attendue selon le prompt métier

**Déroulé strict** (lignes 539-642) :
1. **ÉTAPE 1 — Motif principal** (par œuvre) :
   - Question : "Qu'est-ce qui t'attire le PLUS dans [NOM DE L'ŒUVRE] ?"
   - 5 propositions UNIQUES, spécifiques à l'œuvre
   - Format : A / B / C / D / E

2. **ÉTAPE 2 — Personnages préférés** (1 à 3) :
   - Question : "Dans [NOM DE L'ŒUVRE], quels sont les 1 à 3 personnages qui te parlent le plus ?"
   - Identification canonique des personnages (remplacement descriptions par noms officiels)

3. **ÉTAPE 3 — Trait dominant** (par personnage) :
   - Question : "Chez [NOM DU PERSONNAGE], qu'est-ce que tu apprécies le PLUS ?"
   - 5 TRAITS SPÉCIFIQUES à ce personnage
   - Dimensions : émotionnelle, stratégique, relationnelle, morale, comportementale
   - **RÈGLE CRITIQUE** : Traits non recyclables pour un autre personnage

4. **ÉTAPE 4 — Micro-récap œuvre** (factuel, 1-2 lignes)

5. **SYNTHÈSE FINALE BLOC 2B** :
   - 4 à 6 lignes max
   - Croise motifs + personnages + traits
   - Fait ressortir : rapport au pouvoir, pression, relations, responsabilité
   - 1 point de vigilance réaliste

#### 1.2.2 Règles absolues (invariants)

**Lignes 525-535** :
1. AUCUNE question générique n'est autorisée
2. Chaque série/film a ses propres MOTIFS, générés par AXIOM
3. Chaque personnage a ses propres TRAITS, générés par AXIOM
4. Les propositions doivent être spécifiques, crédibles, distinctes
5. AXIOM n'utilise JAMAIS une liste standard réutilisable
6. 1 choix obligatoire par question (sauf "je passe" explicite)
7. Aucune interprétation avant la synthèse finale

#### 1.2.3 Objectif critique (lignes 511-521)

> "Comprendre finement et concrètement :
> - ce que le candidat aime réellement dans chaque œuvre,
> - ce qu'il projette à travers les personnages,
> - quels leviers psychologiques, relationnels et décisionnels reviennent.
> 
> 👉 Ici, la valeur vient de la personnalisation, pas du volume."

### 1.3 Injection des prompts

#### 1.3.1 Prompt complet vs prompt compressé

**Actuellement** (BLOC 2A) :
- `FULL_AXIOM_PROMPT` injecté à chaque appel (≈20k tokens)
- `buildConversationHistory()` injecté (historique complet)
- Instructions spécifiques BLOC 2A en message système supplémentaire

**Risque pour BLOC 2B** :
- Si même approche : 20k tokens × nombre d'appels BLOC 2B = coût élevé
- Si prompt compressé : risque de perte des règles critiques (lignes 525-535)

#### 1.3.2 Historique conversationnel

**Fonction** : `buildConversationHistory()` (lignes 15-41 de `blockOrchestrator.ts`)
- Prend les 40 derniers messages de `conversationHistory`
- Fallback sur `candidate.answers` si historique vide
- **Point critique** : L'historique doit contenir les réponses BLOC 2A pour que BLOC 2B puisse personnaliser

---

## 2. RISQUES IDENTIFIÉS

### 2.1 Risques BLOC 2A (implémentation actuelle)

#### 🔴 RISQUE 1 — Détection médium fragile

**Symptôme** : Question 2A.2 mal adaptée (séries au lieu de films, ou inversement)

**Cause racine** : Détection basée sur mots-clés simples (lignes 469-474)

**Impact** :
- Question incohérente avec la réponse utilisateur
- Perte de confiance utilisateur
- Réponses BLOC 2A potentiellement incohérentes

**Probabilité** : **MOYENNE** (détection fragile mais cas limites rares)

**Gravité** : **MOYENNE** (impact UX, mais récupérable)

#### 🟠 RISQUE 2 — Collecte incomplète des préférences

**Symptôme** : Question 2A.2 ne collecte pas exactement 3 œuvres

**Cause racine** : Prompt 2A.2 ne mentionne pas explicitement "3 œuvres"

**Impact** :
- BLOC 2B ne peut pas fonctionner correctement (besoin de 3 œuvres + 1 noyau)
- Erreur détectée tardivement (après réponses utilisateur)

**Probabilité** : **FAIBLE** (l'IA comprend généralement "préférences" = liste)

**Gravité** : **ÉLEVÉE** (blocage fonctionnel BLOC 2B)

#### 🟡 RISQUE 3 — Absence de validation format

**Symptôme** : Questions mal formatées (pas de A/B/C, format incorrect)

**Cause racine** : Aucune validation après génération OpenAI

**Impact** :
- Frontend ne peut pas parser correctement
- Expérience utilisateur dégradée

**Probabilité** : **FAIBLE** (l'IA respecte généralement les formats demandés)

**Gravité** : **FAIBLE** (détectable rapidement, récupérable)

### 2.2 Risques BLOC 2B (non implémenté, critiques)

#### 🔴🔴 RISQUE 1 — Traits génériques recyclables

**Symptôme** : Traits générés identiques ou transposables d'un personnage à l'autre

**Exemple de dérive** :
- Personnage A : "A. Intelligent, B. Stratégique, C. Charismatique, D. Déterminé, E. Loyal"
- Personnage B : "A. Intelligent, B. Stratégique, C. Charismatique, D. Déterminé, E. Loyal"
- → Traits identiques, aucune différenciation

**Cause racine** :
- Prompt insuffisamment contraignant
- L'IA utilise des listes de traits "standards" au lieu de personnaliser
- Absence de validation côté moteur

**Impact** :
- **CATASTROPHIQUE** : Perte totale de la valeur projectrice
- Deux candidats aimant la même œuvre → traits identiques → différenciation impossible
- Synthèse finale BLOC 2B sans valeur analytique

**Probabilité** : **ÉLEVÉE** (tendance naturelle de l'IA à réutiliser des patterns)

**Gravité** : **CRITIQUE** (cœur du système AXIOM compromis)

#### 🔴🔴 RISQUE 2 — Motifs non spécifiques à l'œuvre

**Symptôme** : Propositions de motifs identiques pour différentes œuvres

**Exemple de dérive** :
- Œuvre A (série policière) : "A. L'intrigue, B. Les personnages, C. Le suspense, D. L'ambiance, E. Le rythme"
- Œuvre B (série comique) : "A. L'intrigue, B. Les personnages, C. Le suspense, D. L'ambiance, E. Le rythme"
- → Motifs génériques, pas spécifiques

**Cause racine** :
- Prompt ne force pas assez la spécificité
- L'IA ne connaît pas suffisamment l'œuvre pour personnaliser
- Absence de contrainte explicite "ces propositions doivent être UNIQUES à cette œuvre"

**Impact** :
- **CRITIQUE** : Perte de la différenciation sémantique
- Impossible de comprendre ce que le candidat aime réellement dans chaque œuvre
- Synthèse finale sans valeur

**Probabilité** : **ÉLEVÉE** (si prompt compressé ou insuffisant)

**Gravité** : **CRITIQUE** (cœur du système AXIOM compromis)

#### 🔴 RISQUE 3 — Perte de personnalisation dans la synthèse finale

**Symptôme** : Synthèse finale générique, ne croise pas motifs + personnages + traits

**Exemple de dérive** :
- Synthèse : "Tu es attiré par des personnages forts et des intrigues captivantes."
- → Générique, ne mentionne pas les œuvres spécifiques, ne croise pas les éléments

**Cause racine** :
- Prompt synthèse trop vague
- Historique incomplet (réponses BLOC 2B non injectées correctement)
- Absence de contrainte explicite "croise motifs + personnages + traits"

**Impact** :
- **ÉLEVÉE** : Synthèse sans valeur analytique
- Impossible d'exploiter pour la suite (management, ambition, environnements)

**Probabilité** : **MOYENNE** (si prompt bien structuré, risque réduit)

**Gravité** : **ÉLEVÉE** (perte de valeur métier)

#### 🟠 RISQUE 4 — Parsing questions délimitées

**Symptôme** : Questions BLOC 2B mal parsées (séparation incorrecte, questions mélangées)

**Cause racine** :
- Délimiteur `---QUESTION_SEPARATOR---` ambigu
- Questions multi-lignes mal gérées
- Parsing fragile

**Impact** :
- Frontend affiche questions incorrectes
- Réponses utilisateur associées aux mauvaises questions

**Probabilité** : **MOYENNE** (dépend de la qualité du parsing)

**Gravité** : **MOYENNE** (détectable, récupérable avec retry)

#### 🟡 RISQUE 5 — Identification personnages incorrecte

**Symptôme** : Description utilisateur non remplacée par nom canonique

**Cause racine** :
- L'IA ne connaît pas tous les personnages de toutes les œuvres
- Identification ambiguë (plusieurs personnages correspondent à la description)
- Absence de validation côté moteur

**Impact** :
- Questions traits posées avec description au lieu de nom canonique
- Incohérence dans les questions suivantes

**Probabilité** : **FAIBLE** (l'IA connaît généralement les personnages principaux)

**Gravité** : **FAIBLE** (impact limité, récupérable)

### 2.3 Risques architecturaux (prompt compression)

#### 🔴 RISQUE 1 — Perte des règles critiques dans prompt compressé

**Symptôme** : Lignes 525-535 (règles absolues BLOC 2B) absentes du prompt compressé

**Cause racine** :
- Compression trop agressive
- Priorisation incorrecte (règles "absolues" non prioritaires)

**Impact** :
- **CRITIQUE** : L'IA ignore les règles de personnalisation
- Génération de traits/motifs génériques

**Probabilité** : **MOYENNE** (si compression mal faite)

**Gravité** : **CRITIQUE** (cœur du système compromis)

#### 🟠 RISQUE 2 — Historique incomplet pour personnalisation

**Symptôme** : L'IA ne reçoit pas les réponses BLOC 2A (noms des œuvres) dans l'historique

**Cause racine** :
- Troncature historique trop agressive
- Réponses BLOC 2A stockées dans `AnswerMap` mais pas dans `conversationHistory`
- `buildConversationHistory()` ne récupère pas `AnswerMap`

**Impact** :
- **ÉLEVÉE** : L'IA ne peut pas personnaliser les questions BLOC 2B
- Génération de questions génériques

**Probabilité** : **FAIBLE** (si `conversationHistory` correctement maintenu)

**Gravité** : **ÉLEVÉE** (blocage fonctionnel)

---

## 3. RECOMMANDATIONS DE VERROUILLAGE

### 3.1 Verrouillage BLOC 2A (corrections immédiates)

#### ✅ RECOMMANDATION 1 — Améliorer la détection médium

**Fichier** : `src/services/blockOrchestrator.ts` (lignes 469-474)

**Action** :
```typescript
// AVANT (fragile)
const isSeries = mediumAnswer.toLowerCase().includes('série') || 
                 mediumAnswer.toLowerCase().includes('serie') ||
                 mediumAnswer.toLowerCase().includes('a.') ||
                 mediumAnswer.toLowerCase().includes('a');

// APRÈS (robuste)
function detectMedium(answer: string): 'série' | 'film' {
  const lower = answer.toLowerCase().trim();
  
  // Détection explicite "A. Série" ou "B. Film"
  if (/^[a]\.?\s*(série|serie)/i.test(lower) || 
      /^série/i.test(lower) && !/film/i.test(lower)) {
    return 'série';
  }
  if (/^[b]\.?\s*(film)/i.test(lower) || 
      /^film/i.test(lower) && !/série|serie/i.test(lower)) {
    return 'film';
  }
  
  // Fallback : analyser le contenu
  const hasSerie = /série|serie|série/i.test(lower);
  const hasFilm = /film/i.test(lower);
  
  if (hasSerie && !hasFilm) return 'série';
  if (hasFilm && !hasSerie) return 'film';
  
  // Par défaut, demander clarification
  throw new Error('Medium detection ambiguous, need clarification');
}
```

**Justification** : Détection plus robuste, évite faux positifs

#### ✅ RECOMMANDATION 2 — Renforcer le prompt 2A.2

**Fichier** : `src/services/blockOrchestrator.ts` (lignes 480-487)

**Action** :
```typescript
{
  role: 'system',
  content: `RÈGLE ABSOLUE AXIOM :
Tu es en état BLOC_02 (BLOC 2A - Question 2).
Le candidat a choisi : ${mediumType}.
Génère UNE question demandant EXACTEMENT 3 ${mediumType}s que le candidat préfère en ce moment.
La question doit être claire et explicite : "Sans trop réfléchir, quelles sont les 3 ${mediumType}s que tu préfères en ce moment, tous genres confondus ?"
Format : Question ouverte demandant une liste de 3 ${mediumType}s.
IMPORTANT : La question doit demander EXACTEMENT 3 ${mediumType}s, pas plus, pas moins.`
}
```

**Justification** : Garantit la collecte de 3 œuvres, nécessaire pour BLOC 2B

#### ✅ RECOMMANDATION 3 — Ajouter validation format questions

**Fichier** : `src/services/validators.ts` (nouveau)

**Action** :
```typescript
export function validateQuestion2A1(content: string): ValidationResult {
  // Vérifier présence "A. Série" et "B. Film"
  const hasSerie = /A\.?\s*(Série|série)/i.test(content);
  const hasFilm = /B\.?\s*(Film|film)/i.test(content);
  
  if (!hasSerie || !hasFilm) {
    return { 
      valid: false, 
      error: 'Question 2A.1 must contain "A. Série" and "B. Film"' 
    };
  }
  
  return { valid: true };
}

export function validateQuestion2A3(content: string): ValidationResult {
  // Vérifier que la question demande une œuvre unique
  const asksForOne = /une|un|1|seule|unique/i.test(content);
  const asksForWork = /œuvre|série|film|titre/i.test(content);
  
  if (!asksForOne || !asksForWork) {
    return { 
      valid: false, 
      error: 'Question 2A.3 must ask for ONE work (œuvre unique)' 
    };
  }
  
  return { valid: true };
}
```

**Justification** : Détecte les questions mal formatées avant affichage

### 3.2 Verrouillage BLOC 2B (stratégie complète)

#### ✅✅ RECOMMANDATION 1 — Prompt BLOC 2B avec contraintes explicites

**Fichier** : `src/services/blockOrchestrator.ts` (nouveau, à créer)

**Action** : Créer `generateQuestions2B()` avec prompt ultra-contraignant

```typescript
private async generateQuestions2B(candidate: AxiomCandidate): Promise<string[]> {
  const messages = buildConversationHistory(candidate);
  const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
  
  // Récupérer réponses BLOC 2A
  const answerMap = candidate.answerMaps?.[2];
  const answers = answerMap?.answers || {};
  const mediumAnswer = answers[0] || '';
  const preferencesAnswer = answers[1] || ''; // 3 œuvres
  const coreWorkAnswer = answers[2] || ''; // Œuvre noyau
  
  // Parser les 3 œuvres depuis preferencesAnswer
  const works = this.parseWorks(preferencesAnswer); // ["Œuvre 1", "Œuvre 2", "Œuvre 3"]
  
  const completion = await callOpenAI({
    messages: [
      { role: 'system', content: FULL_AXIOM_PROMPT },
      {
        role: 'system',
        content: `RÈGLE ABSOLUE AXIOM — BLOC 2B (CRITIQUE) :

Tu es en état BLOC_02 (BLOC 2B - Analyse projective).

ŒUVRES DU CANDIDAT :
- Œuvre #3 : ${works[2] || 'N/A'}
- Œuvre #2 : ${works[1] || 'N/A'}
- Œuvre #1 : ${works[0] || 'N/A'}
- Œuvre noyau : ${coreWorkAnswer}

⚠️ RÈGLES ABSOLUES (NON NÉGOCIABLES) :

1. AUCUNE question générique n'est autorisée.
2. Chaque série/film a ses propres MOTIFS, générés par AXIOM.
3. Chaque personnage a ses propres TRAITS, générés par AXIOM.
4. Les propositions doivent être :
   - spécifiques à l'œuvre ou au personnage,
   - crédibles,
   - distinctes entre elles.
5. AXIOM n'utilise JAMAIS une liste standard réutilisable.
6. 1 choix obligatoire par question (sauf "je passe" explicite).

🟦 DÉROULÉ STRICT (POUR CHAQUE ŒUVRE, dans l'ordre #3 → #2 → #1) :

ÉTAPE 1 — MOTIF PRINCIPAL :
Question : "Qu'est-ce qui t'attire le PLUS dans [NOM DE L'ŒUVRE] ?"
Génère 5 propositions UNIQUES, spécifiques à cette œuvre.
Ces propositions doivent représenter réellement l'œuvre (ascension, décor, ambiance, relations, rythme, morale, stratégie, quotidien, chaos, etc.).
AXIOM choisit les axes pertinents, œuvre par œuvre.
Format : A / B / C / D / E (1 lettre attendue)

⚠️ CRITIQUE : Les 5 propositions pour l'Œuvre #3 doivent être DIFFÉRENTES des propositions pour l'Œuvre #2, qui doivent être DIFFÉRENTES de celles pour l'Œuvre #1.
Chaque œuvre a ses propres axes d'attraction.

ÉTAPE 2 — PERSONNAGES PRÉFÉRÉS (1 à 3) :
Question : "Dans [NOM DE L'ŒUVRE], quels sont les 1 à 3 personnages qui te parlent le plus ?"
Règles : 1 minimum, 3 maximum. Orthographe approximative acceptée. Surnoms acceptés.
Si description fonctionnelle → identifier le personnage et utiliser le NOM CANONIQUE officiel.

ÉTAPE 3 — TRAIT DOMINANT (PERSONNALISÉ À CHAQUE PERSONNAGE) :
Pour CHAQUE personnage cité, question : "Chez [NOM DU PERSONNAGE], qu'est-ce que tu apprécies le PLUS ?"
Génère 5 TRAITS SPÉCIFIQUES À CE PERSONNAGE, qui :
- correspondent à son rôle réel dans l'œuvre,
- couvrent des dimensions différentes (émotionnelle, stratégique, relationnelle, morale, comportementale),
- ne sont PAS recyclables pour un autre personnage.

⚠️ CRITIQUE : Les traits pour le Personnage A de l'Œuvre #3 doivent être DIFFÉRENTS des traits pour le Personnage B de l'Œuvre #3, qui doivent être DIFFÉRENTS des traits pour le Personnage A de l'Œuvre #2.
Chaque personnage a ses propres traits uniques.

Format : A / B / C / D / E (1 seule réponse possible)

ÉTAPE 4 — MICRO-RÉCAP ŒUVRE (factuel, 1-2 lignes) :
"Sur [ŒUVRE], tu es surtout attiré par [motif choisi], et par des personnages que tu valorises pour [traits dominants observés]."

🟦 SYNTHÈSE FINALE BLOC 2B (OBLIGATOIRE) :
Une fois les 3 œuvres traitées, produit une synthèse VRAIMENT PERSONNALISÉE (4 à 6 lignes max) qui :
- croise motifs + personnages + traits,
- fait ressortir des constantes claires,
- met en lumière : rapport au pouvoir, rapport à la pression, rapport aux relations, posture face à la responsabilité,
- inclut 1 point de vigilance réaliste, formulé sans jugement.

Format de sortie :
---QUESTION_SEPARATOR---
[Question motif Œuvre #3]
---QUESTION_SEPARATOR---
[Question personnages Œuvre #3]
---QUESTION_SEPARATOR---
[Question traits Personnage 1 Œuvre #3]
---QUESTION_SEPARATOR---
[Question traits Personnage 2 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Question traits Personnage 3 Œuvre #3] (si applicable)
---QUESTION_SEPARATOR---
[Micro-récap Œuvre #3]
---QUESTION_SEPARATOR---
[Question motif Œuvre #2]
---QUESTION_SEPARATOR---
[... (même structure pour Œuvre #2 et Œuvre #1) ...]
---QUESTION_SEPARATOR---
[SYNTHÈSE FINALE BLOC 2B]`
      },
      ...messages,
    ],
  });
  
  // Parser questions
  const questions = completion
    .split('---QUESTION_SEPARATOR---')
    .map(q => q.trim())
    .filter(q => q.length > 0);
  
  return questions;
}
```

**Justification** : Prompt ultra-contraignant avec règles absolues répétées, contraintes explicites de différenciation

#### ✅✅ RECOMMANDATION 2 — Validateur de spécificité des traits

**Fichier** : `src/services/validators.ts` (nouveau)

**Action** :
```typescript
export function validateTraitsSpecificity(
  traitsWork1: string[],
  traitsWork2: string[],
  traitsWork3: string[]
): ValidationResult {
  // Extraire les traits (texte après "A.", "B.", etc.)
  const extractTraits = (text: string): string[] => {
    return text
      .split(/\n/)
      .filter(line => /^[A-E]\./i.test(line))
      .map(line => line.replace(/^[A-E]\.\s*/i, '').toLowerCase().trim());
  };
  
  const allTraits: string[] = [];
  
  // Collecter tous les traits
  traitsWork1.forEach(t => allTraits.push(...extractTraits(t)));
  traitsWork2.forEach(t => allTraits.push(...extractTraits(t)));
  traitsWork3.forEach(t => allTraits.push(...extractTraits(t)));
  
  // Détecter doublons (traits identiques ou très similaires)
  const duplicates: string[] = [];
  for (let i = 0; i < allTraits.length; i++) {
    for (let j = i + 1; j < allTraits.length; j++) {
      const similarity = calculateSimilarity(allTraits[i], allTraits[j]);
      if (similarity > 0.8) { // 80% de similarité = trop proche
        duplicates.push(`${allTraits[i]} ≈ ${allTraits[j]}`);
      }
    }
  }
  
  if (duplicates.length > 0) {
    return {
      valid: false,
      error: `Traits trop similaires détectés : ${duplicates.join(', ')}. Chaque personnage doit avoir des traits UNIQUES.`,
      details: duplicates
    };
  }
  
  return { valid: true };
}

function calculateSimilarity(str1: string, str2: string): number {
  // Similarité basée sur mots communs (Jaccard)
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}
```

**Justification** : Détecte automatiquement les traits trop similaires, force la régénération

#### ✅✅ RECOMMANDATION 3 — Validateur de spécificité des motifs

**Fichier** : `src/services/validators.ts` (extension)

**Action** :
```typescript
export function validateMotifsSpecificity(
  motifWork1: string,
  motifWork2: string,
  motifWork3: string
): ValidationResult {
  const extractPropositions = (text: string): string[] => {
    return text
      .split(/\n/)
      .filter(line => /^[A-E]\./i.test(line))
      .map(line => line.replace(/^[A-E]\.\s*/i, '').toLowerCase().trim());
  };
  
  const props1 = extractPropositions(motifWork1);
  const props2 = extractPropositions(motifWork2);
  const props3 = extractPropositions(motifWork3);
  
  // Vérifier que chaque œuvre a des propositions différentes
  const allProps = [...props1, ...props2, ...props3];
  const duplicates: string[] = [];
  
  for (let i = 0; i < allProps.length; i++) {
    for (let j = i + 1; j < allProps.length; j++) {
      const similarity = calculateSimilarity(allProps[i], allProps[j]);
      if (similarity > 0.7) { // 70% de similarité = trop proche
        duplicates.push(`${allProps[i]} ≈ ${allProps[j]}`);
      }
    }
  }
  
  if (duplicates.length > 0) {
    return {
      valid: false,
      error: `Motifs trop similaires entre œuvres : ${duplicates.join(', ')}. Chaque œuvre doit avoir des motifs UNIQUES.`,
      details: duplicates
    };
  }
  
  return { valid: true };
}
```

**Justification** : Garantit que chaque œuvre a des motifs distincts

#### ✅ RECOMMANDATION 4 — Retry avec prompt renforcé

**Fichier** : `src/services/blockOrchestrator.ts` (extension)

**Action** :
```typescript
private async generateQuestions2BWithRetry(
  candidate: AxiomCandidate,
  maxRetries: number = 1
): Promise<string[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const questions = await this.generateQuestions2B(candidate);
    
    // Valider spécificité
    const motifs = this.extractMotifs(questions);
    const traits = this.extractTraits(questions);
    
    const motifsValidation = validateMotifsSpecificity(
      motifs.work1, motifs.work2, motifs.work3
    );
    const traitsValidation = validateTraitsSpecificity(
      traits.work1, traits.work2, traits.work3
    );
    
    if (motifsValidation.valid && traitsValidation.valid) {
      return questions;
    }
    
    // Si dernière tentative, retourner quand même (avec warning)
    if (attempt === maxRetries) {
      console.warn('[ORCHESTRATOR] BLOC 2B validation failed after retries:', {
        motifs: motifsValidation.error,
        traits: traitsValidation.error
      });
      return questions; // Retourner quand même, mais loguer l'erreur
    }
    
    // Retry avec prompt renforcé
    console.log(`[ORCHESTRATOR] BLOC 2B validation failed, retry ${attempt + 1}/${maxRetries}`);
    // Réinjecter prompt avec contraintes encore plus explicites
  }
  
  throw new Error('Failed to generate valid BLOC 2B questions after retries');
}
```

**Justification** : Retry automatique si validation échoue, avec prompt renforcé

#### ✅ RECOMMANDATION 5 — Validation synthèse finale

**Fichier** : `src/services/validators.ts` (extension)

**Action** :
```typescript
export function validateSynthesis2B(content: string): ValidationResult {
  // Vérifier présence mots-clés obligatoires
  const requiredKeywords = [
    /rapport.*pouvoir|pouvoir/i,
    /rapport.*pression|pression/i,
    /rapport.*relation|relation/i,
    /responsabilité/i
  ];
  
  const missing = requiredKeywords.filter(regex => !regex.test(content));
  
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Synthèse BLOC 2B incomplète : manque ${missing.length} élément(s) obligatoire(s)`
    };
  }
  
  // Vérifier longueur (4-6 lignes)
  const lines = content.split(/\n/).filter(l => l.trim().length > 0);
  if (lines.length < 4 || lines.length > 6) {
    return {
      valid: false,
      error: `Synthèse BLOC 2B : longueur incorrecte (${lines.length} lignes, attendu 4-6)`
    };
  }
  
  // Vérifier croisement motifs + personnages + traits
  const hasMotifs = /motif|attire|attraction/i.test(content);
  const hasPersonnages = /personnage|caractère/i.test(content);
  const hasTraits = /trait|apprécie|valorise/i.test(content);
  
  if (!hasMotifs || !hasPersonnages || !hasTraits) {
    return {
      valid: false,
      error: 'Synthèse BLOC 2B : ne croise pas motifs + personnages + traits'
    };
  }
  
  return { valid: true };
}
```

**Justification** : Garantit que la synthèse finale respecte le format et le contenu attendus

### 3.3 Verrouillage architectural (prompt compression)

#### ✅ RECOMMANDATION 1 — Version compressée avec règles absolues préservées

**Fichier** : `src/engine/prompts.ts` (nouveau, à créer)

**Action** : Créer `getCompressedPrompt2B(): string`

```typescript
export function getCompressedPrompt2B(): string {
  return `RÈGLES ABSOLUES AXIOM — BLOC 2B (NON NÉGOCIABLES) :

1. AUCUNE question générique n'est autorisée.
2. Chaque série/film a ses propres MOTIFS, générés par AXIOM.
3. Chaque personnage a ses propres TRAITS, générés par AXIOM.
4. Les propositions doivent être :
   - spécifiques à l'œuvre ou au personnage,
   - crédibles,
   - distinctes entre elles.
5. AXIOM n'utilise JAMAIS une liste standard réutilisable.
6. 1 choix obligatoire par question (sauf "je passe" explicite).
7. Aucune interprétation avant la synthèse finale.

OBJECTIF : Comprendre finement ce que le candidat aime réellement dans chaque œuvre, ce qu'il projette à travers les personnages, quels leviers psychologiques, relationnels et décisionnels reviennent.

VALEUR : La personnalisation, pas le volume.

DÉROULÉ STRICT (pour chaque œuvre, ordre #3 → #2 → #1) :
1. Motif principal : 5 propositions UNIQUES, spécifiques à l'œuvre
2. Personnages préférés : 1 à 3 personnages
3. Trait dominant : 5 TRAITS SPÉCIFIQUES à chaque personnage, non recyclables
4. Micro-récap œuvre : factuel, 1-2 lignes

SYNTHÈSE FINALE : 4-6 lignes, croise motifs + personnages + traits, fait ressortir rapport au pouvoir/pression/relations/responsabilité.`;
}
```

**Justification** : Version compressée qui préserve les règles critiques (lignes 525-535 du prompt métier)

#### ✅ RECOMMANDATION 2 — Injection garantie des réponses BLOC 2A

**Fichier** : `src/services/blockOrchestrator.ts` (modification `buildConversationHistory`)

**Action** :
```typescript
function buildConversationHistoryForBlock2B(candidate: AxiomCandidate): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  
  // TOUJOURS inclure les réponses BLOC 2A dans le contexte
  const answerMap = candidate.answerMaps?.[2];
  if (answerMap) {
    const answers = answerMap.answers;
    messages.push({
      role: 'system',
      content: `CONTEXTE BLOC 2A (OBLIGATOIRE) :
Médium choisi : ${answers[0] || 'N/A'}
Préférences (3 œuvres) : ${answers[1] || 'N/A'}
Œuvre noyau : ${answers[2] || 'N/A'}`
    });
  }
  
  // Historique conversationnel standard
  if (candidate.conversationHistory && candidate.conversationHistory.length > 0) {
    const history = candidate.conversationHistory;
    const recentHistory = history.slice(-MAX_CONV_MESSAGES);
    
    recentHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });
  }
  
  return messages;
}
```

**Justification** : Garantit que les réponses BLOC 2A sont toujours injectées, même si `conversationHistory` est tronqué

---

## 4. POINTS NON MODIFIABLES (INVARIANTS AXIOM)

### 4.1 Invariants BLOC 2A

✅ **Ordre strict** : Question 1 (Médium) → Question 2 (Préférences) → Question 3 (Œuvre noyau)  
✅ **Collecte uniquement** : Aucune interprétation avant BLOC 2B  
✅ **Format questions** : Question 1 = choix A/B, Question 2 = ouverte (3 œuvres), Question 3 = ouverte (1 œuvre)

### 4.2 Invariants BLOC 2B

✅ **Ordre strict des œuvres** : Œuvre #3 → Œuvre #2 → Œuvre #1  
✅ **Structure par œuvre** : Motif → Personnages → Traits (par personnage) → Micro-récap  
✅ **Spécificité absolue** : Chaque œuvre a ses propres motifs, chaque personnage a ses propres traits  
✅ **Synthèse finale obligatoire** : 4-6 lignes, croise motifs + personnages + traits  
✅ **Poids œuvre noyau** : Poids interprétatif plus fort que les œuvres actuelles

### 4.3 Invariants prompts

✅ **Règles absolues** (lignes 525-535) : DOIVENT être présentes dans TOUS les prompts BLOC 2B  
✅ **Format questions** : A / B / C / D / E pour choix, question ouverte pour personnages  
✅ **Pas de liste standard** : AXIOM n'utilise JAMAIS une liste réutilisable

### 4.4 Invariants valeur métier

✅ **Personnalisation > Volume** : La valeur vient de la personnalisation, pas du volume  
✅ **Différenciation candidats** : Deux candidats aimant la même œuvre doivent être différenciables  
✅ **Exploitabilité synthèse** : La synthèse finale doit être exploitable pour la suite (management, ambition, environnements)

---

## 5. TESTS AVANT IMPLÉMENTATION BLOC 2B

### 5.1 Tests de spécificité des traits

**Scénario 1 — Traits identiques détectés** :
- Générer questions BLOC 2B pour 2 candidats différents avec la même œuvre
- Vérifier que les traits générés sont différents
- **Critère de succès** : Similarité < 80% entre traits de personnages différents

**Scénario 2 — Traits recyclables détectés** :
- Générer questions BLOC 2B avec 2 personnages de la même œuvre
- Vérifier que les traits sont spécifiques à chaque personnage
- **Critère de succès** : Similarité < 80% entre traits de personnages différents

**Scénario 3 — Traits génériques détectés** :
- Générer questions BLOC 2B avec personnages de genres différents (drame vs comédie)
- Vérifier que les traits reflètent le genre de l'œuvre
- **Critère de succès** : Traits adaptés au contexte de l'œuvre

### 5.2 Tests de spécificité des motifs

**Scénario 1 — Motifs identiques détectés** :
- Générer questions BLOC 2B avec 3 œuvres de genres différents
- Vérifier que les motifs sont différents pour chaque œuvre
- **Critère de succès** : Similarité < 70% entre motifs d'œuvres différentes

**Scénario 2 — Motifs adaptés au genre** :
- Générer questions BLOC 2B avec œuvre policière vs comédie
- Vérifier que les motifs reflètent le genre
- **Critère de succès** : Motifs cohérents avec le genre de l'œuvre

### 5.3 Tests de synthèse finale

**Scénario 1 — Croisement motifs + personnages + traits** :
- Générer synthèse finale BLOC 2B
- Vérifier présence de mots-clés : "motif", "personnage", "trait"
- **Critère de succès** : Synthèse mentionne explicitement les 3 éléments

**Scénario 2 — Constantes claires** :
- Générer synthèse finale BLOC 2B
- Vérifier présence de : rapport au pouvoir, pression, relations, responsabilité
- **Critère de succès** : Synthèse mentionne au moins 3 des 4 constantes

**Scénario 3 — Longueur et format** :
- Générer synthèse finale BLOC 2B
- Vérifier longueur : 4-6 lignes
- **Critère de succès** : Longueur entre 4 et 6 lignes

### 5.4 Tests de parsing questions

**Scénario 1 — Parsing correct** :
- Générer questions BLOC 2B avec délimiteur `---QUESTION_SEPARATOR---`
- Parser les questions
- Vérifier que chaque question est correctement séparée
- **Critère de succès** : Nombre de questions parsées = nombre attendu

**Scénario 2 — Format questions** :
- Générer questions BLOC 2B
- Vérifier format : "A. / B. / C. / D. / E." pour choix
- **Critère de succès** : 100% des questions à choix respectent le format

### 5.5 Tests de différenciation candidats

**Scénario 1 — Même œuvre, candidats différents** :
- Générer questions BLOC 2B pour 2 candidats avec la même œuvre
- Comparer les traits générés
- **Critère de succès** : Traits différents (similarité < 80%)

**Scénario 2 — Même personnage, candidats différents** :
- Générer questions BLOC 2B pour 2 candidats avec le même personnage
- Comparer les traits générés
- **Critère de succès** : Traits différents (similarité < 80%)

### 5.6 Tests de validation automatique

**Scénario 1 — Validation échoue → retry** :
- Forcer génération de traits similaires (mock)
- Vérifier que la validation échoue
- Vérifier que le retry est déclenché
- **Critère de succès** : Retry déclenché, prompt renforcé injecté

**Scénario 2 — Validation réussit → pas de retry** :
- Générer questions BLOC 2B valides
- Vérifier que la validation réussit
- Vérifier qu'aucun retry n'est déclenché
- **Critère de succès** : Pas de retry, questions retournées directement

---

## 📊 RÉSUMÉ EXÉCUTIF

### État actuel

✅ **BLOC 2A** : Implémenté, fonctionnel, mais avec risques mineurs (détection médium fragile, absence validation)  
❌ **BLOC 2B** : Non implémenté, risques critiques identifiés

### Risques critiques

🔴🔴 **Traits génériques recyclables** : Probabilité ÉLEVÉE, Gravité CRITIQUE  
🔴🔴 **Motifs non spécifiques** : Probabilité ÉLEVÉE, Gravité CRITIQUE  
🔴 **Synthèse finale générique** : Probabilité MOYENNE, Gravité ÉLEVÉE

### Recommandations prioritaires

1. **URGENT** : Implémenter validateurs de spécificité (traits + motifs)  
2. **URGENT** : Renforcer prompt BLOC 2B avec contraintes explicites  
3. **IMPORTANT** : Ajouter retry avec prompt renforcé  
4. **IMPORTANT** : Garantir injection réponses BLOC 2A dans contexte BLOC 2B

### Points non négociables

✅ Spécificité absolue (traits + motifs)  
✅ Ordre strict (œuvres #3 → #2 → #1)  
✅ Synthèse finale croisant motifs + personnages + traits  
✅ Règles absolues présentes dans TOUS les prompts BLOC 2B

---

**FIN DE L'AUDIT**
