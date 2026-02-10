# Audit + correctifs — Miroirs B3–B9 et questions statiques

**Date** : 2025-02-10  
**Périmètre** : 1) Miroirs bloc 3–9 ne se déclenchaient plus ; 2) Questions blocs statiques passaient par le LLM (30–60 s, tokens).

---

## A) DIAGNOSTIC 1 — Pourquoi les miroirs B3–B9 ne se déclenchaient plus

### Cause (prouvée par le code)

**Fichier** : `src/engine/axiomExecutor.ts`  
**Fonction** : `areAllQuestionsAnswered` (ancienne logique).

L’ancienne logique était :

- Compter les messages **assistant** avec `block === blocNumber` et `kind === 'question'`.
- Compter les messages **user** avec `block === blocNumber` et `kind !== 'mirror_validation'`.
- Retourner **true** si `answersInBlock.length >= questionsInBlock.length`.

Problème : après la **première** réponse du bloc 3 (ou 4, …), l’historique contient **1 question** (celle qu’on vient de renvoyer) et **1 réponse** utilisateur. Donc `1 >= 1` → `allQuestionsAnswered === true` → `shouldForceMirror === true` → le moteur forçait le **miroir** au lieu de poser la question 2. En pratique, le miroir pouvait être généré trop tôt ou le flux ne correspondait plus au “bloc complet” attendu (plusieurs questions puis miroir).

En résumé : **le miroir était déclenché dès la première réponse** au lieu d’être déclenché après **toutes** les questions du bloc (3, 4, … 9).

### Preuve (chemins de code)

- `axiomExecutor.ts` (ancienne version) :  
  `questionsInBlock.length > 0` puis `return answersInBlock.length >= questionsInBlock.length`  
  → une seule question et une seule réponse suffisaient à rendre le bloc “complet”.
- `shouldForceMirror = blocNumber >= 3 && blocNumber <= 9 && allQuestionsAnswered`  
  → dès la 1ère réponse, `shouldForceMirror` passait à true pour les blocs 3–9.

### Correctif appliqué

- **Seuil fixe par bloc** : pour les blocs 1 et 3–9, on n’utilise plus “réponses >= questions dans l’historique”. On exige **un nombre minimal de réponses** défini par un catalogue (aligné sur le nombre de questions statiques).
- **Fichier** : `src/engine/staticQuestions.ts` → `EXPECTED_ANSWERS_FOR_MIRROR` (et longueur des tableaux de questions).
- **Fichier** : `src/engine/axiomExecutor.ts` → `areAllQuestionsAnswered` utilise `EXPECTED_ANSWERS_FOR_MIRROR[blocNumber]` pour les blocs 1 et 3–9.
- Résultat : le miroir ne se déclenche qu’après **toutes** les réponses attendues du bloc (ex. 3 réponses pour le bloc 3, 5 pour le bloc 4, etc.).

### Logs de diagnostic (state machine)

Un log `[AXIOM][STATE]` a été ajouté dans l’executor pour les blocs 1 et 3–9 à chaque passage :

- `step`, `blocNumber`, `allQuestionsAnswered`, `shouldForceMirror`, `answersInBlock`, `event`, `hasUserMessage`.

Cela permet de vérifier en run que le moteur “voit” bien la fin de bloc et décide correctement de lancer le miroir.

---

## B) DIAGNOSTIC 2 — Questions statiques = passage par le LLM (tokens, lenteur)

### Cause (prouvée par le code)

**Fichier** : `src/engine/axiomExecutor.ts` (section “BLOCS 1 à 10”).

Pour les blocs 1 et 3–9, lorsqu’on ne forçait pas le miroir (`!shouldForceMirror`), le code :

- Construisait un `blocSystemContent` générique (“Tu exécutes STRICTEMENT le protocole AXIOM…”).
- Appelait **`callOpenAIStream`** ou **`callOpenAI`** avec l’historique de conversation.
- Utilisait la sortie du modèle comme “prochaine question”.

Donc **chaque** question de bloc 1 et 3–9 était générée par un **appel LLM** → 30–60 s et consommation de tokens.

### Preuve (chemins de code)

- Branche “Si pas de synthèse générée → génération normale” :  
  `const blocSystemContent = shouldForceMirror ? (prompt miroir) : (prompt générique)` puis  
  `callOpenAIStream({ messages: blocMessages }, onChunk)` / `callOpenAI({ messages: blocMessages })`.  
  Aucune branche “question depuis catalogue” avant ce correctif.

### Correctif appliqué

- **Catalogue statique** : `src/engine/staticQuestions.ts`  
  - `STATIC_QUESTIONS` : tableaux de questions par bloc (1, 3, 4, 5, 6, 7, 8, 9).  
  - `EXPECTED_ANSWERS_FOR_MIRROR` : nombre de réponses attendues par bloc pour déclencher le miroir (aligné sur la longueur des tableaux).  
  - `getStaticQuestion(blocNumber, questionIndex)` : retourne la question à l’index donné ou `null`.
- **Executor** :  
  - Pour **bloc 1** (première question après START_BLOC_1) : utilisation de `getStaticQuestion(1, 0)` en priorité ; fallback LLM si pas de question statique.  
  - Pour **blocs 1 et 3–9** (dans la section commune) : si on ne force pas le miroir et qu’on n’a pas encore de `aiText`, on calcule le nombre de réponses du bloc et on appelle `getStaticQuestion(blocNumber, answersInBlock.length)` ; si une question est retournée, on l’utilise comme `aiText` et **on ne fait pas** d’appel LLM pour cette étape.
- **BLOC 2A** : non modifié (reste géré par l’orchestrateur, éventuellement avec LLM selon l’existant).  
- **BLOC 2B** : non touché (dynamique, comme demandé).

Résultat : les questions des blocs 1 et 3–9 sont servies **instantanément** depuis le catalogue, **sans appel LLM** pour ces questions. Seuls les **miroirs**, la **synthèse** et le **matching** continuent d’appeler le modèle.

---

## C) Plan de correctifs appliqué (résumé)

| # | Fichier | Modification |
|---|--------|--------------|
| 1 | `src/engine/staticQuestions.ts` | **Création** : catalogue `STATIC_QUESTIONS` (blocs 1, 3–9), `EXPECTED_ANSWERS_FOR_MIRROR`, `getStaticQuestion`. |
| 2 | `src/engine/axiomExecutor.ts` | **areAllQuestionsAnswered** : pour blocs 1 et 3–9, utilisation de `EXPECTED_ANSWERS_FOR_MIRROR` au lieu de “réponses >= questions dans l’historique”. |
| 3 | `src/engine/axiomExecutor.ts` | **shouldForceMirror** : étendu aux blocs 1–9 (au lieu de 3–9). |
| 4 | `src/engine/axiomExecutor.ts` | **Questions statiques** : branche “si pas de miroir forcé et bloc 1 ou 3–9 (hors 2)” → `getStaticQuestion` ; si trouvé, `aiText` = question statique, pas d’appel LLM. |
| 5 | `src/engine/axiomExecutor.ts` | **START_BLOC_1** : première question BLOC 1 = `getStaticQuestion(1, 0)` en priorité. |
| 6 | `src/engine/axiomExecutor.ts` | **Miroir blocs 1 et 3–9** : condition “miroir REVELIOM / nouvelle architecture” étendue à `blocNumber >= 1 && blocNumber <= 9` ; `blockTypeMap` inclut `1: 'block1'`. |
| 7 | `src/engine/axiomExecutor.ts` | **Validation miroir / transition** : toutes les conditions “blocNumber >= 3 && blocNumber <= 9” concernant miroir et passage au bloc suivant étendues à `blocNumber >= 1 && blocNumber <= 9` où pertinent. |
| 8 | `src/engine/axiomExecutor.ts` | **Log [AXIOM][STATE]** : ajout pour blocs 1 et 3–9 (step, blocNumber, allQuestionsAnswered, shouldForceMirror, answersInBlock, event, hasUserMessage). |

Aucun changement sur : streaming, UX thinking loop, prompts existants, formats REVELIOM, logique de verrouillage, Google Sheet, BLOC 2B.

---

## D) Test de validation unique

- **Parcours** : jusqu’au **BLOC 4** au minimum.
- **Vérifications** :  
  1. **Questions** des blocs 1, 3 et 4 : affichage **rapide** (< 300 ms hors réseau), sans attente type “génération LLM”.  
  2. **Miroir BLOC 3** : affiché automatiquement après la **dernière** question du bloc 3 (3 réponses pour le bloc 3).  
  3. **Miroir BLOC 4** : affiché automatiquement après la **dernière** question du bloc 4 (5 réponses pour le bloc 4).  
  4. **BLOC 2B** : inchangé (comportement actuel conservé).
- **Logs** : en backend, vérifier `[AXIOM][STATE]` pour voir `shouldForceMirror: true` uniquement lorsque `answersInBlock` atteint le seuil du bloc (ex. 3 pour bloc 3, 5 pour bloc 4).

---

## E) Points laissés volontairement hors scope

- **BLOC 2A** : les questions 2A restent gérées par l’orchestrateur (avec ou sans LLM selon l’existant). Un passage à un catalogue statique 2A pourrait être fait dans un second temps de la même façon que pour 1 et 3–9.
- **Refonte** : aucun changement d’architecture ; correctifs ciblés et incrémentaux dans l’executor + nouveau module `staticQuestions.ts`.

---

*Audit et correctifs réalisés par lecture de code et application de patchs minimaux.*
