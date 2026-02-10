# AUDIT — PRISE EN COMPTE DES RÉPONSES & COÛT TOKENS

**Date** : 2025-02-10  
**Périmètre** : Flux analyse → angle → rendu, sans modification de code.  
**Objectif** : Valider que le moteur est cognitivement juste, économiquement optimisé et stable pour montée en charge.

---

## 1. CHEMIN EXACT DES DONNÉES

### 1.1 Schéma global

```
userAnswers[] (toutes les réponses du bloc)
    → generateInterpretiveStructure(userAnswers, blockType, additionalContext?)
    → InterpretiveStructure (4 champs)
    → [si miroir fin de bloc] selectMentorAngle(structure)
    → inputForRenderer (angle OU hypothese_centrale)
    → renderMentorStyle(inputForRenderer, blockType)
    → texte mentor (REVELIOM ou synthèse/matching)
```

### 1.2 D’où viennent les `userAnswers[]` ?

| Contexte | Fichier | Construction des réponses |
|----------|---------|----------------------------|
| **Bloc 1** | `blockOrchestrator.ts` | `conversationHistory` filtré `role === 'user' && block === 1 && kind !== 'mirror_validation'` → `block1UserMessages` ; fallback `answerMaps[1].answers` (toutes les réponses du bloc 1). |
| **Bloc 2B** | `blockOrchestrator.ts` | `block2BAnswers` = toutes les réponses du bloc 2B (œuvres + contexte). |
| **Blocs 3 → 9** | `axiomExecutor.ts` | `userAnswersInBlock = conversationHistory.filter(m => m.role === 'user' && m.block === blocNumber && m.kind !== 'mirror_validation').map(m => m.content.trim())`. |
| **Synthèse (BLOC 10)** | `axiomExecutor.ts` | `allUserAnswers = conversationHistory.filter(m => m.role === 'user' && m.kind !== 'mirror_validation').map(m => m.content.trim())` → **toutes** les réponses de tous les blocs. |
| **Matching** | `axiomExecutor.ts` | Même `allUserAnswers` (toutes les réponses) + `additionalContext` = synthèse finale si disponible. |

**Conclusion** : À chaque usage, ce sont bien **toutes les réponses du (ou des) bloc(s) concerné(s)** qui sont passées en entrée ; aucune logique ne sélectionne uniquement la dernière réponse.

---

## 2. PRISE EN COMPTE DE TOUTES LES RÉPONSES (Q1 → Q5)

### 2.1 Étape 1 — `generateInterpretiveStructure(userAnswers, blockType, additionalContext)`

- **Fichier** : `src/services/interpretiveStructureGenerator.ts`
- **Entrée** : `userAnswers: string[]` (tableau complet).
- **Construction du prompt** :
  ```ts
  const answersContext = userAnswers
    .map((answer, index) => `Q${index + 1}: ${answer}`)
    .join('\n');
  ```
  Chaque réponse est numérotée (Q1, Q2, …) et concaténée. Le tout est injecté dans le message user sous la forme :
  `Réponses du candidat (ENSEMBLE À ANALYSER) :\n${answersContext}`.
- **Instructions système** :
  - « Prendre en compte **L'ENSEMBLE** des réponses du bloc »
  - « Ne PAS faire une moyenne des réponses »
  - « ÉTAPE 1 : Formule dans ta tête l'hypothèse centrale … ÉTAPE 2 : Décompose … »

**Conclusion** : L’analyse est explicitement fondée sur **toutes** les réponses du bloc (Q1→Q5 ou équivalent). Aucun code ne restreint l’entrée à la dernière réponse.

### 2.2 Étape 2 — `selectMentorAngle(structure)`

- **Fichier** : `src/services/mentorAngleSelector.ts`
- **Entrée** : `InterpretiveStructure` uniquement (4 champs : `hypothese_centrale`, `comment_elle_se_met_en_mouvement`, `ce_qui_eteint_son_moteur`, `mecanisme`). **Aucune accès aux réponses brutes**.
- **Règle dans le prompt** :
  - « **INTERDICTION « DERNIÈRE RÉPONSE »** : Le mentor_angle ne peut PAS être fondé principalement sur la dernière réponse. Il doit être justifiable uniquement par la **cohérence TRANSVERSALE de tout le bloc**. Si une seule réponse suffit à produire l’angle → angle invalide. »

**Conclusion** : L’angle est dérivé de la **structure complète** (elle-même issue de toutes les réponses). Il ne peut pas être « déclenché » par une seule réponse, car le sélecteur ne voit pas les réponses et le prompt interdit explicitement un angle fondé sur la dernière seule.

### 2.3 Synthèse et matching

- **Synthèse** : `generateInterpretiveStructure(allUserAnswers, 'synthesis')` avec `allUserAnswers` = **toutes** les réponses de la conversation (blocs 1 à 9).
- **Matching** : idem `allUserAnswers` + contexte additionnel (synthèse finale). Donc raisonnement sur l’ensemble du profil.

**Conclusion** : Aucune logique ne se base uniquement sur la dernière réponse. Le flux est transversal par construction.

---

## 3. RAISONNEMENT TRANSVERSAL ET ÉCONOMIE DE TOKENS

### 3.1 Similitude avec un raisonnement « ChatGPT natif » transversal

- L’utilisateur enchaîne Q1→Q5 (ou plus) ; un raisonnement transversal consisterait à envoyer tout le bloc (ou tout le profil) au modèle et à demander une interprétation globale.
- Ici :
  - **Étape 1** : tout le bloc (toutes les réponses) est envoyé une fois ; le modèle produit une **structure interprétative unique** (hypothèse centrale + 3 champs dérivés). C’est équivalent à une première passe « raisonnement transversal » sur le bloc.
  - **Étape 2** (miroirs uniquement) : le modèle ne reçoit que cette structure (résumé dense), pas les réponses brutes. Il produit un **angle unique** (lecture en creux). Équivalent à une seconde passe de raisonnement sur une représentation déjà synthétique.
  - **Étape 3** : le modèle ne reçoit que l’angle (ou l’hypothèse centrale pour synthèse/matching) et produit le texte final.

Donc : **même idée** qu’un raisonnement transversal (tout le bloc / tout le profil pris en compte), mais **découpé en étapes** avec des entrées de plus en plus courtes pour les étapes suivantes.

### 3.2 En quoi c’est plus économe en tokens

- **Alternative « tout en un »** : envoyer à chaque fois toutes les réponses du bloc (ou du profil) + instructions de miroir/synthèse/matching → un seul gros appel par sortie. Les réponses sont répétées à chaque génération (miroir bloc 3, bloc 4, …, synthèse, matching).
- **Architecture actuelle** :
  - Une fois par bloc (ou une fois pour synthèse/matching) : **un** appel avec **toutes** les réponses → structure (petite sortie ~300 tokens).
  - Ensuite : appels avec **structure seule** (angle) puis **angle seul** (rendu). Les réponses brutes ne sont plus jamais renvoyées après l’étape 1.

Donc : **moins de répétition des réponses** dans les prompts, et **modèle léger (gpt-4o-mini)** pour analyse + angle, **gpt-4o** réservé au rendu final. C’est bien une logique plus économe en tokens tout en gardant un raisonnement transversal.

---

## 4. LECTURE EN CREUX — OÙ ET UNIQUEMENT OÙ

### 4.1 Où la lecture en creux (angle) est utilisée

- **Fichier** : `src/engine/axiomExecutor.ts` (fonction `generateMirrorWithNewArchitecture`) :
  ```ts
  const mirrorBlockTypes: BlockType[] = ['block1', 'block2b', 'block3', 'block4', 'block5', 'block6', 'block7', 'block8', 'block9'];
  const usesAngle = mirrorBlockTypes.includes(blockType);
  ```
- Si `usesAngle === true` : appel à `selectMentorAngle(structure)` puis `renderMentorStyle(mentorAngle, blockType)` (avec angle en entrée).
- **Bloc 1** : même logique 3 étapes (structure → angle → rendu) dans `blockOrchestrator.ts` (`generateMirrorForBlock1`).
- **Bloc 2B** : même logique dans `blockOrchestrator.ts` (`generateMirror2B`).

Donc **lecture en creux (angle)** appliquée à :
- Blocs **1, 2b, 3, 4, 5, 6, 7, 8, 9** (tous les mini-miroirs de fin de bloc).

### 4.2 Où elle n’est pas utilisée

- **Synthèse** (`blockType === 'synthesis'`) : `usesAngle === false` → `inputForRenderer = structure.hypothese_centrale` (pas d’angle, pas de lecture en creux).
- **Matching** (`blockType === 'matching'`) : idem, `inputForRenderer = structure.hypothese_centrale`.

**Conclusion** : La logique « lecture en creux » (sélection d’angle + format « Ce n’est probablement pas X, mais Y ») est appliquée **uniquement** aux mini-miroirs de fin de bloc (1, 2b, 3→9), et **à aucun autre endroit** (ni synthèse, ni matching).

---

## 5. ESTIMATION DU COÛT EN TOKENS

Hypothèses pour les ordres de grandeur :
- Réponse utilisateur moyenne : ~80 caractères (≈ 20 tokens).
- 5 réponses par bloc → ~100 tokens de réponses par bloc.
- Synthèse : 9 blocs × 5 réponses → ~900 tokens de réponses (ordre de grandeur).

Rappel des modèles et limites :
- **gpt-4o-mini** : analyse (étape 1), angle (étape 2) — `max_tokens` 300 et 150.
- **gpt-4o** : rendu (étape 3) — `max_tokens` 120 (REVELIOM) ou 800 (synthèse/matching).

### 5.1 Par bloc (miroir fin de bloc : 1, 2b, 3 → 9)

| Étape | Modèle | Rôle | Estimation input | Estimation output |
|-------|--------|------|-------------------|-------------------|
| 1 – Analyse | gpt-4o-mini | system + user (blockContext + Q1…Q5) | ~700–900 tokens | 300 tokens |
| 2 – Angle | gpt-4o-mini | system + user (4 champs structure) | ~800–950 tokens | 150 tokens |
| 3 – Rendu REVELIOM | gpt-4o | system + user (angle seul) | ~350–450 tokens | 120 tokens |

**Par bloc miroir (ordre de grandeur)** :
- **4o-mini** : ~1 500–1 850 tokens in, 450 tokens out.
- **4o** : ~350–450 tokens in, 120 tokens out.

(Les chiffres réels dépendent de la longueur des réponses et des contextes de bloc ; block2b inclut le contexte œuvres, donc un peu plus en input.)

### 5.2 Synthèse (BLOC 10)

| Étape | Modèle | Rôle | Estimation input | Estimation output |
|-------|--------|------|-------------------|-------------------|
| 1 – Analyse | gpt-4o-mini | system + user (toutes réponses 1–9 + contexte synthèse) | ~1 600–2 200 tokens | 300 tokens |
| 2 – (aucune) | — | — | — | — |
| 3 – Rendu | gpt-4o | system + user (hypothese_centrale) | ~1 000–1 500 tokens | jusqu’à 800 tokens |

**Synthèse (ordre de grandeur)** :
- **4o-mini** : ~1 600–2 200 in, 300 out.
- **4o** : ~1 000–1 500 in, jusqu’à 800 out.

### 5.3 Matching

| Étape | Modèle | Rôle | Estimation input | Estimation output |
|-------|--------|------|-------------------|-------------------|
| 1 – Analyse | gpt-4o-mini | allUserAnswers + contexte matching | ~1 600–2 200 tokens | 300 tokens |
| 2 – (aucune) | — | — | — | — |
| 3 – Rendu | gpt-4o | hypothese_centrale + additionalContext (synthèse) | ~1 200–2 000 tokens | jusqu’à 800 tokens |

**Matching (ordre de grandeur)** :
- **4o-mini** : ~1 600–2 200 in, 300 out.
- **4o** : ~1 200–2 000 in, jusqu’à 800 out.

### 5.4 Profil complet (9 blocs miroirs + synthèse + matching)

- **9 miroirs** : 9 × (analyse 4o-mini + angle 4o-mini + rendu 4o) ≈ 9 × (1 500 in + 450 out | 4o-mini) + 9 × (400 in + 120 out | 4o).
- **1 synthèse** : 1 × (analyse 4o-mini + rendu 4o).
- **1 matching** : 1 × (analyse 4o-mini + rendu 4o).

En agrégé (ordre de grandeur) :

| Modèle | Input total (approx.) | Output total (approx.) |
|--------|----------------------|------------------------|
| **gpt-4o-mini** | 9 × ~1 750 + 1 × ~1 900 + 1 × ~1 900 ≈ **20 000** tokens | 9 × 450 + 300 + 300 = **4 650** tokens |
| **gpt-4o** | 9 × ~400 + ~1 250 + ~1 600 ≈ **6 450** tokens | 9 × 120 + 800 + 800 = **2 680** tokens |

**Conclusion** : Pour un profil complet, l’ordre de grandeur est d’environ **20k tokens en entrée** et **4,6k en sortie** pour gpt-4o-mini, et **~6,5k en entrée** et **~2,7k en sortie** pour gpt-4o. Les prix réels dépendent des tarifs OpenAI (input/output 4o vs 4o-mini) ; l’architecture minimise l’usage de 4o (réservé au rendu) et évite de renvoyer toutes les réponses à chaque étape.

---

## 6. SYNTHÈSE DE VALIDATION

| Critère | Statut | Justification |
|---------|--------|----------------|
| **Toutes les réponses du bloc prises en compte** | ✔ | `userAnswers` = tableau complet ; `answersContext = userAnswers.map(Q1…Qn)` ; prompt « ENSEMBLE À ANALYSER », pas d’accès à une seule réponse. |
| **Aucune logique basée uniquement sur la dernière réponse** | ✔ | Pas de code qui isole la dernière réponse ; `selectMentorAngle` reçoit la structure complète et le prompt interdit un angle fondé sur la dernière réponse seule. |
| **Raisonnement transversal + économique** | ✔ | Une passe d’analyse sur tout le bloc (ou tout le profil) ; étapes 2 et 3 travaillent sur structure/angle uniquement ; 4o-mini pour analyse et angle, 4o pour rendu. |
| **Lecture en creux uniquement sur mini-miroirs 1, 2b, 3→9** | ✔ | `usesAngle === true` uniquement pour `block1`, `block2b`, `block3`…`block9` ; synthèse et matching utilisent `hypothese_centrale` sans angle. |
| **Stabilité pour montée en charge** | ✔ | Pas de boucle sur les réponses dans les appels API ; flux déterministe par bloc ; retries limités (1) ; pas de dépendance à une seule réponse. |

---

## 7. RÉSUMÉ DES CHEMINS ET MODÈLES

- **userAnswers[]** → **generateInterpretiveStructure** (gpt-4o-mini) → **InterpretiveStructure**.
- **InterpretiveStructure** → **selectMentorAngle** (gpt-4o-mini) **uniquement** pour block1, block2b, block3…block9 → angle (lecture en creux).
- **Angle** (ou **hypothese_centrale** pour synthèse/matching) → **renderMentorStyle** (gpt-4o) → texte final.

Aucun refactor ni changement de logique : audit et confirmations uniquement, conformément à la demande.
