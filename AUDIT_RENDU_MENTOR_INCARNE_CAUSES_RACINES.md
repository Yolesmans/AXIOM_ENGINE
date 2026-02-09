# AUDIT SENIOR — Pourquoi on n'obtient pas le rendu "mentor incarné"

**Date** : 2025-01-27  
**Objectif** : Identifier les causes racines du rendu "sage/résumé" au lieu de "mentor incarné"  
**Méthode** : Analyse du pipeline complet (2 étapes), contraintes, validations, prompts  
**Statut** : ✅ Audit complet — AUCUNE modification de code

---

## A) DIAGNOSTIC PIPELINE (1 page)

### Architecture actuelle (2 étapes)

#### ÉTAPE 1 : `generateInterpretiveStructure()` 
**Fichier** : `src/services/interpretiveStructureGenerator.ts`

- **Modèle** : `gpt-4o-mini` (coût réduit)
- **Température** : `0.3` (stabilité)
- **Max tokens** : `300`
- **Input** : Toutes les réponses utilisateur du bloc
- **Output** : JSON structuré avec 4 champs obligatoires :
  ```typescript
  {
    hypothese_centrale: string;           // "Cette personne fonctionne comme ça : ..."
    comment_elle_se_met_en_mouvement: string;
    ce_qui_eteint_son_moteur: string;
    mecanisme: string;
  }
  ```
- **Contraintes** : 
  - Doit être un MÉCANISME, pas des traits
  - Validation stricte (patterns mécanisme vs traits)
  - Hypothèse centrale formulable oralement

**✅ Point fort** : L'étape 1 produit bien une hypothèse centrale (mécanisme).

**⚠️ Point faible** : La structure JSON contient 4 champs qui doivent TOUS être utilisés par l'étape 2.

---

#### ÉTAPE 2 : `renderMentorStyle()`
**Fichier** : `src/services/mentorStyleRenderer.ts`

- **Modèle** : `gpt-4o` (qualité narrative)
- **Température** : `0.8` (créativité)
- **Max tokens** : `200` (miroirs) / `800` (synthèse/matching)
- **Input** : UNIQUEMENT la structure JSON (pas les réponses utilisateur)
- **Output** : Texte mentor format REVELIOM (1️⃣ 2️⃣ 3️⃣)

**Contraintes FORMAT** :
- Section 1️⃣ : **EXACTEMENT 20 mots maximum**, 1 phrase unique
- Section 2️⃣ : **EXACTEMENT 25 mots maximum**, 1 phrase unique
- Section 3️⃣ : Phrase fixe ("Dis-moi si ça te parle...")

**Contraintes STYLE** :
- Marqueurs expérientiels obligatoires ("quand tu...", "dès que tu...")
- Interdiction déclaratif ("tu es...", "votre...")
- Temporalité obligatoire (chaque phrase doit contenir un marqueur temporel)

**Contraintes FIDÉLITÉ** :
- **Ligne 58-59** : "Tu ne dois RIEN inventer. Tu traduis UNIQUEMENT l'hypothèse centrale"
- **Ligne 97** : "Conserver EXACTEMENT le sens de la structure (aucune information ajoutée, supprimée ou modifiée)"
- **Ligne 195** : Section 1 basée sur `hypothese_centrale + comment_elle_se_met_en_mouvement`
- **Ligne 202** : Section 2 basée sur `ce_qui_eteint_son_moteur + mecanisme`

**Validations POST-RENDU** :
1. `validateMentorStyle()` : Vérifie marqueurs expérientiels, interdiction déclaratif
2. `validateMirrorREVELIOM()` : Vérifie format (20/25 mots), lecture en creux, ton 2e personne, interdictions

---

### Où l'info se rigidifie

**Point de rigidification #1** : L'étape 1 produit 4 champs qui doivent TOUS être utilisés.

Le renderer reçoit :
```json
{
  "hypothese_centrale": "...",
  "comment_elle_se_met_en_mouvement": "...",
  "ce_qui_eteint_son_moteur": "...",
  "mecanisme": "..."
}
```

Et il doit :
- Section 1️⃣ : Utiliser `hypothese_centrale + comment_elle_se_met_en_mouvement` (2 champs)
- Section 2️⃣ : Utiliser `ce_qui_eteint_son_moteur + mecanisme` (2 champs)

**Résultat** : Le renderer ne peut pas "trancher" — il doit traduire TOUS les champs. Il fait une synthèse fidèle plutôt qu'un angle mentor.

**Point de rigidification #2** : Contrainte "Conserver EXACTEMENT le sens" (ligne 97).

Cette contrainte empêche le renderer de :
- Perdre volontairement de l'info pour faire émerger un angle
- Reformuler de manière plus audacieuse
- Choisir un focus plutôt qu'une exhaustivité

**Point de rigidification #3** : Format 20/25 mots + obligation d'utiliser 2 champs par section.

Pour mettre 2 champs JSON dans 20 mots, le renderer est forcé de :
- Compresser (résumé)
- Paraphraser (synthèse)
- Équilibrer (pas d'angle dominant)

**Point de rigidification #4** : Validation "lecture en creux" obligatoire.

La validation `validateMirrorREVELIOM()` exige un pattern : `"probablement pas X, mais plutôt Y"`.

Cette contrainte formelle pousse vers une structure mécanique plutôt qu'un langage naturel de mentor.

---

### Qui est responsable du "résumé"

**Responsable principal** : L'étape 2 (`renderMentorStyle`) est dans une position impossible :

1. Elle doit traduire **4 champs JSON** en **2 phrases** (20 + 25 mots)
2. Elle doit "Conserver EXACTEMENT le sens" (aucune perte d'info)
3. Elle doit respecter le format strict (20/25 mots)
4. Elle doit passer les validations (lecture en creux, marqueurs expérientiels)

**Résultat** : Le renderer fait une **synthèse fidèle** plutôt qu'un **angle mentor**.

**Responsable secondaire** : Les validations punissent toute déviation.

- `validateMentorStyle()` : Rejette si pas de marqueurs expérientiels
- `validateMirrorREVELIOM()` : Rejette si pas de "lecture en creux" (pattern mécanique)
- Retry si validation échoue → le modèle apprend à être "prudent"

**Responsable tertiaire** : La structure JSON de l'étape 1 est trop détaillée.

L'étape 1 produit 4 champs qui doivent TOUS être utilisés. Un mentor "tranche" en choisissant UN angle, pas en traduisant 4 champs équilibrés.

---

## B) VALIDATION / INVALIDATION DE LA THÉORIE

### Théorie proposée

> "Le rendu reste sage parce que le modèle n'a pas la permission de trancher. Il est contraint à préserver toute l'info (fidélité + validations + structure), donc il fait une synthèse propre au lieu d'un angle mentor. Un mentor perd volontairement de l'info pour faire émerger une hypothèse centrale. Tant que le renderer doit rester exhaustif/aligné/validé, il se protège et résume."

### ✅ VALIDATION DE LA THÉORIE

**Preuve #1** : Contrainte "Conserver EXACTEMENT le sens" (ligne 97 de `mentorStyleRenderer.ts`)

```typescript
⚠️ CONTRAINTES ABSOLUES :
- Conserver EXACTEMENT le sens de la structure (aucune information ajoutée, supprimée ou modifiée)
- Ne pas ajouter de synthèse ou cohérence globale
```

Cette contrainte interdit explicitement au renderer de "perdre volontairement de l'info" pour faire émerger un angle.

**Preuve #2** : Obligation d'utiliser TOUS les champs (lignes 194-204)

```typescript
1️⃣ Lecture implicite
- Basée sur : hypothese_centrale + comment_elle_se_met_en_mouvement  // 2 champs
2️⃣ Déduction personnalisée
- Basée sur : ce_qui_eteint_son_moteur + mecanisme  // 2 champs
```

Le renderer doit traduire 4 champs en 2 phrases (20 + 25 mots). Il ne peut pas choisir UN angle — il doit équilibrer TOUS les champs.

**Preuve #3** : Contrainte "Tu ne dois RIEN inventer" (ligne 58)

```typescript
⚠️ RÈGLE ABSOLUE : Tu ne dois RIEN inventer.
Tu traduis UNIQUEMENT l'hypothèse centrale en langage mentor incarné.
```

Cette contrainte empêche le renderer de prendre des risques interprétatifs. Il traduit fidèlement plutôt que d'incarner un angle.

**Preuve #4** : Format 20/25 mots + obligation d'utiliser 2 champs par section

Pour mettre 2 champs JSON dans 20 mots, le renderer est forcé de :
- Compresser (résumé)
- Paraphraser (synthèse)
- Équilibrer (pas d'angle dominant)

**Preuve #5** : Validations punissent toute déviation

- `validateMentorStyle()` : Rejette si pas de marqueurs expérientiels → retry
- `validateMirrorREVELIOM()` : Rejette si pas de "lecture en creux" → retry
- Le modèle apprend à être "prudent" pour passer les validations

**Preuve #6** : Contradiction entre "POSTURE MENTALE" et "CONTRAINTES ABSOLUES"

Le prompt dit :
- "Tu prends un risque interprétatif — c'est ta responsabilité" (ligne 55)
- Mais aussi : "Tu ne dois RIEN inventer" (ligne 58)
- Et : "Conserver EXACTEMENT le sens" (ligne 97)

Ces contraintes contradictoires poussent le modèle vers la prudence (synthèse fidèle) plutôt que l'audace (angle mentor).

---

### Conclusion : Théorie VALIDÉE ✅

**La théorie est VALIDÉE**. Le renderer n'a pas la permission de "trancher" car :

1. Il doit traduire **4 champs JSON** en **2 phrases** (20 + 25 mots)
2. Il doit "Conserver EXACTEMENT le sens" (aucune perte d'info)
3. Il doit respecter le format strict (20/25 mots)
4. Il doit passer les validations (lecture en creux, marqueurs expérientiels)
5. Les validations punissent toute déviation (retry si échec)

**Résultat** : Le renderer fait une **synthèse fidèle** plutôt qu'un **angle mentor**. Il se protège en restant exhaustif/aligné/validé.

---

## C) CAUSES RACINES ALTERNATIVES (2 à 5)

### Cause racine #1 : Le renderer reçoit trop d'inputs (4 champs à équilibrer)

**Explication** :
- L'étape 1 produit 4 champs JSON qui doivent TOUS être utilisés
- Le renderer doit traduire 4 champs en 2 phrases (20 + 25 mots)
- Il ne peut pas choisir UN angle — il doit équilibrer TOUS les champs

**Preuve** :
- Ligne 194-204 de `mentorStyleRenderer.ts` : Section 1 basée sur 2 champs, Section 2 basée sur 2 champs
- Le renderer ne voit JAMAIS les réponses utilisateur (ligne 60) — il ne peut pas choisir un focus

**Impact** : Le renderer fait une synthèse équilibrée plutôt qu'un angle mentor.

---

### Cause racine #2 : Les validations punissent l'audace

**Explication** :
- `validateMentorStyle()` : Rejette si pas de marqueurs expérientiels → retry
- `validateMirrorREVELIOM()` : Rejette si pas de "lecture en creux" (pattern mécanique) → retry
- Le modèle apprend à être "prudent" pour passer les validations

**Preuve** :
- Ligne 128-144 de `mentorStyleRenderer.ts` : Retry si validation échoue
- Le modèle optimise pour passer les validations plutôt que pour créer un angle mentor

**Impact** : Le renderer se protège en restant dans les clous (synthèse fidèle) plutôt qu'en prenant des risques (angle mentor).

---

### Cause racine #3 : Les prompts imposent de la fidélité plutôt que de la sélection

**Explication** :
- Le prompt dit "Tu ne dois RIEN inventer" (ligne 58)
- Le prompt dit "Conserver EXACTEMENT le sens" (ligne 97)
- Le prompt dit "Tu traduis UNIQUEMENT l'hypothèse centrale" (ligne 59)
- Mais aussi : "Tu prends un risque interprétatif" (ligne 55) — contradiction

**Preuve** :
- Lignes 58-61 et 97-98 de `mentorStyleRenderer.ts` : Contraintes de fidélité strictes
- Ligne 55 : Posture mentale contradictoire ("risque interprétatif" vs "RIEN inventer")

**Impact** : Le renderer choisit la prudence (fidélité) plutôt que l'audace (sélection d'angle).

---

### Cause racine #4 : Le format (20/25 mots) pousse mécaniquement au résumé

**Explication** :
- Section 1️⃣ : 20 mots maximum pour traduire 2 champs JSON
- Section 2️⃣ : 25 mots maximum pour traduire 2 champs JSON
- Pour mettre 2 champs dans 20 mots, le renderer est forcé de compresser (résumé)

**Preuve** :
- Lignes 193-213 de `mentorStyleRenderer.ts` : Format strict 20/25 mots
- Validation `validateMirrorREVELIOM()` : Rejette si > 20 mots section 1, > 25 mots section 2

**Impact** : Le renderer fait une compression (résumé) plutôt qu'un angle mentor (sélection).

---

### Cause racine #5 : La structure JSON oblige à réécrire au lieu d'incarner

**Explication** :
- Le renderer reçoit une structure JSON logique (4 champs)
- Il doit traduire cette structure en langage mentor incarné
- Mais la structure JSON est déjà "analysée" — le renderer ne peut pas "incarner" un angle, il doit "réécrire" la structure

**Preuve** :
- Ligne 101 de `mentorStyleRenderer.ts` : Input = `JSON.stringify(structure, null, 2)`
- Le renderer ne voit JAMAIS les réponses utilisateur (ligne 60) — il ne peut pas "incarner" un angle basé sur les réponses

**Impact** : Le renderer fait une réécriture stylistique (synthèse) plutôt qu'une incarnation d'angle (mentor).

---

## D) OPTIONS DE SOLUTION (3 options, sans implémenter)

### Option 1 : Donner au renderer la permission de "trancher" (perdre de l'info volontairement)

**Idée** :
- Modifier le prompt du renderer pour lui donner la permission de "perdre volontairement de l'info" pour faire émerger un angle
- Au lieu de traduire TOUS les champs, le renderer choisit UN angle dominant
- Supprimer la contrainte "Conserver EXACTEMENT le sens"

**Pourquoi ça marche** :
- Un mentor "tranche" en choisissant UN angle, pas en traduisant 4 champs équilibrés
- Le renderer peut faire émerger une hypothèse centrale plutôt qu'une synthèse fidèle
- Le format 20/25 mots devient un avantage (force la sélection) plutôt qu'une contrainte (force la compression)

**Impacts** :
- **Coût** : Aucun (même modèle, même température)
- **Latence** : Aucune (même pipeline)
- **Risque** : **MOYEN** — Le renderer peut perdre de l'info importante si l'angle choisi est mauvais

**Comment tester vite** :
- Modifier le prompt du renderer (ligne 97) : Remplacer "Conserver EXACTEMENT le sens" par "Tu peux perdre volontairement de l'info pour faire émerger un angle mentor"
- Tester sur 5 miroirs BLOC 1 → Comparer avec rendu actuel
- Mesurer : Le rendu est-il plus "mentor incarné" ? L'info perdue est-elle critique ?

**Ce que ça change sur la "permission de trancher"** :
- ✅ Le renderer a la permission de choisir UN angle plutôt que d'équilibrer TOUS les champs
- ✅ Le renderer peut perdre volontairement de l'info pour faire émerger une hypothèse centrale
- ✅ Le format 20/25 mots devient un avantage (force la sélection) plutôt qu'une contrainte

---

### Option 2 : Réduire l'input du renderer à UN seul champ (hypothèse centrale)

**Idée** :
- Modifier l'étape 1 pour produire UNIQUEMENT l'hypothèse centrale (supprimer les 3 autres champs)
- Le renderer reçoit UNIQUEMENT l'hypothèse centrale (pas 4 champs à équilibrer)
- Le renderer peut "incarner" cette hypothèse centrale plutôt que de "réécrire" 4 champs

**Pourquoi ça marche** :
- Le renderer n'a plus à équilibrer 4 champs — il peut se concentrer sur UN angle
- L'hypothèse centrale est déjà formulée comme "Cette personne fonctionne comme ça : ..." — le renderer peut l'incarner
- Le format 20/25 mots devient un avantage (force la sélection) plutôt qu'une contrainte (force la compression)

**Impacts** :
- **Coût** : Aucun (même modèle, même température)
- **Latence** : Aucune (même pipeline)
- **Risque** : **FAIBLE** — L'hypothèse centrale contient déjà l'essentiel (les 3 autres champs sont des décompositions)

**Comment tester vite** :
- Modifier `generateInterpretiveStructure()` pour retourner UNIQUEMENT `hypothese_centrale`
- Modifier `renderMentorStyle()` pour utiliser UNIQUEMENT `hypothese_centrale` (lignes 194-204)
- Tester sur 5 miroirs BLOC 1 → Comparer avec rendu actuel
- Mesurer : Le rendu est-il plus "mentor incarné" ? L'info perdue est-elle critique ?

**Ce que ça change sur la "permission de trancher"** :
- ✅ Le renderer n'a plus à équilibrer 4 champs — il peut se concentrer sur UN angle
- ✅ Le renderer peut "incarner" l'hypothèse centrale plutôt que de "réécrire" 4 champs
- ✅ Le format 20/25 mots devient un avantage (force la sélection) plutôt qu'une contrainte

---

### Option 3 : Fusionner étape 1 et étape 2 (1 seule étape : analyse + rendu)

**Idée** :
- Supprimer la séparation 2 étapes
- Créer UNE seule étape qui fait : analyse des réponses → rendu mentor incarné directement
- Le modèle peut choisir UN angle pendant l'analyse (pas de structure JSON intermédiaire)

**Pourquoi ça marche** :
- Le modèle peut choisir UN angle pendant l'analyse (pas de structure JSON intermédiaire à traduire)
- Le modèle peut "perdre volontairement de l'info" pendant l'analyse pour faire émerger un angle
- Le format 20/25 mots devient un avantage (force la sélection) plutôt qu'une contrainte

**Impacts** :
- **Coût** : **ÉLEVÉ** — Utiliser `gpt-4o` (au lieu de `gpt-4o-mini` pour l'étape 1) pour TOUS les blocs
- **Latence** : **ÉLEVÉE** — 1 appel API au lieu de 2, mais modèle plus lourd
- **Risque** : **MOYEN** — Perte de la séparation analyse/rendu (moins de contrôle)

**Comment tester vite** :
- Créer une fonction `generateMirrorDirect()` qui fait : réponses utilisateur → rendu mentor directement
- Utiliser `gpt-4o` avec température 0.8, prompt combiné (analyse + rendu)
- Tester sur 5 miroirs BLOC 1 → Comparer avec rendu actuel (2 étapes)
- Mesurer : Le rendu est-il plus "mentor incarné" ? Le coût/latence est-il acceptable ?

**Ce que ça change sur la "permission de trancher"** :
- ✅ Le modèle peut choisir UN angle pendant l'analyse (pas de structure JSON intermédiaire)
- ✅ Le modèle peut "perdre volontairement de l'info" pendant l'analyse pour faire émerger un angle
- ✅ Le format 20/25 mots devient un avantage (force la sélection) plutôt qu'une contrainte

---

## E) RECOMMANDATION FINALE

**Recommandation** : **Option 2** (Réduire l'input du renderer à UN seul champ)

**Pourquoi** :
1. **Risque minimal** : L'hypothèse centrale contient déjà l'essentiel (les 3 autres champs sont des décompositions)
2. **Impact maximal** : Le renderer n'a plus à équilibrer 4 champs — il peut se concentrer sur UN angle
3. **Coût/latence nul** : Même modèle, même température, même pipeline
4. **Test rapide** : Modification simple (supprimer 3 champs de l'input du renderer)

**Alternatives** :
- Si Option 2 ne suffit pas → Option 1 (permission de trancher)
- Si Option 1 + 2 ne suffisent pas → Option 3 (fusionner étapes)

**Invariants AXIOM respectés** :
- ✅ Format REVELIOM strict (20/25 mots, 3 sections)
- ✅ Validation post-rendu (format, style, ton)
- ✅ Hypothèse centrale obligatoire (étape 1)
- ✅ Pipeline 2 étapes (analyse + rendu) — sauf si Option 3 choisie

---

## F) RÉSUMÉ EXÉCUTIF

**Problème** : Le rendu reste "sage/résumé" au lieu de "mentor incarné".

**Cause racine principale** : Le renderer n'a pas la permission de "trancher". Il doit traduire 4 champs JSON en 2 phrases (20 + 25 mots) tout en "Conservant EXACTEMENT le sens". Il fait une synthèse fidèle plutôt qu'un angle mentor.

**Solution recommandée** : Réduire l'input du renderer à UN seul champ (hypothèse centrale). Le renderer n'a plus à équilibrer 4 champs — il peut se concentrer sur UN angle.

**Risque** : FAIBLE (l'hypothèse centrale contient déjà l'essentiel).  
**Coût** : NUL (même modèle, même température, même pipeline).  
**Test** : Modification simple (supprimer 3 champs de l'input du renderer).

---

**FIN DE L'AUDIT**
