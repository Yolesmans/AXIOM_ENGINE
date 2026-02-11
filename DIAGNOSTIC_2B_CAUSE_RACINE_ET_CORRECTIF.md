# BLOC 2B — Cause racine et correctif structurel

**Date** : 2025-02-10

---

## 1. Diagnostic cause racine

### 1.1 "E de Suits" (placeholder / mauvais personnage)

- **Cause** : Le code supposait `QUESTIONS_PER_WORK = 6` fixe pour calculer `personnagesQuestionIndex = 1 + workIndex * 6` et lire la réponse "personnages" dans `answers[personnagesQuestionIndex]`. Or la queue 2B est générée par un seul appel LLM avec un **nombre variable** de questions par œuvre (1 à 3 traits + récap). La queue n’a donc pas 6 questions par œuvre.
- **Effet** : Pour un index donné, `workIndex` et `personnagesQuestionIndex` étaient faux. On lisait parfois une **réponse "choix"** (ex. la lettre "E" d’une question à choix) au lieu de la réponse "personnages", d’où l’affichage "E de Suits" (ou "E" + nom d’œuvre).
- **Conclusion** : Une logique d’injection basée sur un index fixe (6 par œuvre) est structurellement fausse dès que le nombre de questions par œuvre varie.

### 1.2 Questions dupliquées / options incohérentes

- **Cause** : Un seul appel `generateQuestions2B` produisait tout le bloc (motifs + personnages + traits + récaps). Les questions "traits" contenaient le placeholder `[NOM DU PERSONNAGE]` et des options génériques ou peu différenciées (même prompt pour tous les personnages). L’injection du nom au moment du **service** ne changeait que le libellé, pas les options, et l’index utilisé pour le nom pouvait être incorrect (voir ci‑dessus).
- **Effet** : Même question affichée deux fois (double appel serve / double bulle) ou même libellé avec des options différentes (deux générations différentes pour le même slot).
- **Conclusion** : Un seul mode "génération globale + injection après coup" ne peut pas garantir des traits spécifiques par personnage ni une seule question servie une seule fois sans risque de désalignement index/queue.

### 1.3 Mode hybride

- Il n’y avait qu’**un seul** flux (génération globale + injection par index), mais ce flux était **fragile** : dépendance à une structure de queue fixe (6 par œuvre) alors que la queue réelle est variable. Pas deux chemins en parallèle, mais un chemin unique basé sur une hypothèse fausse.

---

## 2. Correctif structurel appliqué

### 2.1 Un seul mode "premium" quand les œuvres sont normalisées

- **2A.2** : Après la réponse "préférences", appel LLM **normalizeWorksLLM** → `session.normalizedWorks` (titres canoniques, 1–3 œuvres, correction orthographique / séparation sémantique). En cas d’ambiguïté → message de clarification, pas d’exception.
- **Entrée 2B** : La source des œuvres est **uniquement** `session.normalizedWorks` quand il est présent. Sinon fallback sur `parseWorks` (legacy). Plus de `parseWorks` comme seule source pour le flux premium.

### 2.2 Queue 2B premium : structure fixe + meta

- **Génération initiale** : Un seul appel **generateMotifAndPersonnagesQuestions2B** qui produit **6 questions** (motif + personnages pour les 3 œuvres), avec **meta** par question : `{ workIndex, slot: 'motif' | 'personnages' | 'trait' | 'recap' }`.
- **Plus de génération globale** (motifs + personnages + traits + récaps en un bloc) pour le flux premium. L’ancien `generateQuestions2B` reste utilisé uniquement en **legacy** (pas de `normalizedWorks`).

### 2.3 Traits générés **après** les personnages, avec nom canonique

- Après chaque réponse à une question **personnages** (détectée via `meta[questionIndex].slot === 'personnages'`) :
  - Appel **normalizeCharactersLLM**(œuvre, réponse brute) → `session.normalizedCharacters[workIndex]`.
  - Pour **chaque** personnage normalisé : appel **generateTraitsForCharacterLLM**(œuvre, nom canonique) → une question + 5 options **avec le nom déjà dans le texte** (plus de placeholder).
  - **Insertion** des questions (traits + récap) dans la queue à l’index courant via **insertQuestionsAt**.
- Les questions "traits" ne contiennent **jamais** `[NOM DU PERSONNAGE]` : le nom canonique est injecté à la génération.

### 2.4 Invariants garantis dans le code

- **Aucun placeholder vers l’UI** : Dans `serveNextQuestion2B`, si le texte contient encore `[NOM DU PERSONNAGE]` (legacy ou erreur), remplacement systématique par `"ce personnage"` avant envoi. Aucun envoi du placeholder brut.
- **Une question servie = un index** : On sert `queue.questions[cursorIndex]`, puis on avance le curseur une seule fois. Pas d’insertion à un index déjà servi.
- **Pas de double génération pour le même slot** : En premium, les questions traits sont créées une fois par personnage après normalisation et insérées à un seul endroit (après la question personnages correspondante).

### 2.5 Rétrocompatibilité

- **Sessions sans normalizedWorks** (ex. déjà en 2B avant déploiement) : on utilise `parseWorks` et l’ancien flux `generateQuestions2B` (legacy). Le **safety net** sur le placeholder évite tout envoi de `[NOM DU PERSONNAGE]` à l’UI même en legacy.
- **Sessions avec normalizedWorks** : flux premium uniquement (6 questions initiales + meta, puis normalisation personnages + génération traits par personnage + insertion).

---

## 3. Fichiers modifiés (résumé)

| Fichier | Modification |
|--------|---------------|
| `src/types/candidate.ts` | `NormalizedWork`, `NormalizedCharacter` ; `CandidateSession.normalizedWorks`, `normalizedCharacters`. |
| `src/types/blocks.ts` | `Block2BQuestionMeta`, `QuestionQueue.meta`. |
| `src/store/sessionStore.ts` | `setNormalizedWorks`, `setNormalizedCharacters`, `insertQuestionsAt` ; `setQuestionsForBlock(..., meta?)` ; `updateSession` étendu. |
| `src/services/blockOrchestrator.ts` | `normalizeWorksLLM`, `normalizeCharactersLLM`, `generateMotifAndPersonnagesQuestions2B`, `generateTraitsForCharacterLLM` ; 2A.2 → normalisation puis 2A.3 ; 2B entrée → source normalizedWorks, génération 6 questions + meta ; après réponse personnages → normalisation + traits + insertion ; `serveNextQuestion2B` → safety net placeholder + pas d’injection par index pour queue avec meta. |

---

## 4. Impacts

- **2A** : Un appel LLM de normalisation des œuvres après la réponse 2A.2 ; clarification possible sans avancer.
- **2B** : Comportement premium quand `normalizedWorks` est présent ; sinon legacy avec safety net. Pas de régression volontaire sur les blocs 1 et 3+.
