# 📋 RÉCAPITULATIF COMPLET — PROJET ANGLE MENTOR

**Date** : 2025-01-27  
**Dernière modification** : Ajout étape "décision d'angle mentor"  
**Status** : ✅ Architecture implémentée, tests à valider

---

## 🎯 OBJECTIF PRODUIT

### Problème initial
Le système produisait des miroirs de fin de bloc trop "sages" ou "résumés", au lieu d'un effet mentor fort ("wow… ok, je n'avais pas formulé ça comme ça").

### Solution cible
Ajouter une **étape intermédiaire de "décision d'angle"** entre l'analyse globale et le rendu mentor, permettant au système de :
- Choisir UN angle unique et tranché
- Perdre volontairement de l'information pour créer l'effet mentor
- Produire des miroirs qui provoquent "wow… ok, ça me parle vraiment"

### Règle fondamentale (NON NÉGOCIABLE)
> Un miroir mentor ne traduit JAMAIS toute l'analyse.  
> Il choisit UNE vérité centrale de fonctionnement et accepte explicitement de perdre le reste.  
> La perte d'information est AUTORISÉE et REQUISE pour créer l'effet mentor.

---

## 🏗️ ARCHITECTURE FINALE

### Pipeline en 3 étapes (pour miroirs fin de bloc)

```
ÉTAPE 1 — ANALYSE GLOBALE (INCHANGÉE)
→ generateInterpretiveStructure()
→ Input : toutes les réponses du bloc
→ Output : InterpretiveStructure complète (4 champs)
  - hypothese_centrale
  - comment_elle_se_met_en_mouvement
  - ce_qui_eteint_son_moteur
  - mecanisme
→ Modèle : gpt-4o-mini, temp 0.3
→ Aucun style, aucune narration, aucune sélection

🆕 ÉTAPE 2 — DÉCISION D'ANGLE (OBLIGATOIRE pour miroirs)
→ selectMentorAngle()
→ Input : InterpretiveStructure complète
→ Output : mentor_angle (string unique)
→ Modèle : gpt-4o-mini, temp 0.5
→ Règles de verrouillage :
  - Règle d'arbitrage (expliquer le plus avec le moins)
  - Interdiction de résumé
  - Interdiction "dernière réponse"
  - Permission de perdre de l'info

ÉTAPE 3 — RENDU MENTOR (REVELIOM)
→ renderMentorStyle()
→ Input : mentor_angle UNIQUEMENT (pour miroirs)
→ Output : Texte mentor incarné (format REVELIOM)
→ Modèle : gpt-4o, temp 0.8
→ Format : 1️⃣ Lecture implicite (20 mots) + 2️⃣ Déduction personnalisée (25 mots) + 3️⃣ Validation ouverte
```

### Pipeline en 2 étapes (pour synthèse finale et matching)

```
ÉTAPE 1 — ANALYSE GLOBALE (INCHANGÉE)
→ generateInterpretiveStructure()
→ Output : InterpretiveStructure complète

ÉTAPE 2 — RENDU MENTOR (SANS ANGLE)
→ renderMentorStyle()
→ Input : structure.hypothese_centrale (pas d'angle, pas de perte d'info)
→ Output : Synthèse complète / Matching précis
```

**⚠️ IMPORTANT** : La synthèse finale (BLOC 10) et le matching n'utilisent PAS l'étape ANGLE pour conserver toute l'information.

---

## 📁 FICHIERS CRÉÉS

### 1. `src/services/mentorAngleSelector.ts` (NOUVEAU)
- **Fonction** : `selectMentorAngle(structure: InterpretiveStructure): Promise<string>`
- **Rôle** : Sélectionne UN angle mentor unique à partir de l'analyse complète
- **Règles implémentées** :
  - Règle d'arbitrage (ligne 95-97)
  - Interdiction de résumé (ligne 99-105)
  - Interdiction "dernière réponse" (ligne 107-111)
  - Permission de perdre de l'info (ligne 113-115)
- **Validation** : Détection de patterns interdits (ligne 140-148)
- **Retry** : 1 retry en cas d'échec

---

## 📁 FICHIERS MODIFIÉS

### 1. `src/services/mentorStyleRenderer.ts`

#### Modifications principales
- **Signature changée** : `renderMentorStyle(mentorAngle: string, blockType: BlockType)` au lieu de `renderMentorStyle(structure: InterpretiveStructure, blockType: BlockType)`
- **Ligne 29-32** : Nouvelle signature acceptant uniquement `mentorAngle: string`
- **Ligne 46-61** : Prompt système mis à jour pour refléter qu'on reçoit uniquement l'angle mentor
- **Ligne 102-112** : Input changé de `structure.hypothese_centrale` à `mentorAngle`
- **Ligne 196-211** : Instructions format REVELIOM mises à jour ("Basée UNIQUEMENT sur : l'angle mentor")
- **Ligne 227-234** : Instructions format BLOC 2B mises à jour
- **Ligne 241-254** : Instructions format synthèse finale mises à jour
- **Ligne 267-288** : Instructions format matching mises à jour

#### Points clés
- Le renderer ne reçoit plus l'analyse complète, seulement l'angle mentor (pour miroirs) ou l'hypothèse centrale (pour synthèse/matching)
- Tous les prompts ont été mis à jour pour refléter cette simplification

### 2. `src/engine/axiomExecutor.ts`

#### Modifications principales
- **Ligne 11** : Import ajouté : `import { selectMentorAngle } from '../services/mentorAngleSelector.js';`
- **Ligne 41-80** : Fonction `generateMirrorWithNewArchitecture()` complètement refactorée
  - **Ligne 47-48** : Détection si le blockType doit utiliser l'angle
  - **Ligne 60-78** : Logique conditionnelle :
    - Si `usesAngle = true` (miroirs) → appelle `selectMentorAngle()`
    - Si `usesAngle = false` (synthèse/matching) → utilise `structure.hypothese_centrale` directement
  - **Ligne 70** : Appel à `renderMentorStyle()` avec `inputForRenderer` (angle ou hypothèse centrale)

#### Appels à `generateMirrorWithNewArchitecture()`
- **Ligne 1746** : Synthèse finale (BLOC 10) → `blockType = 'synthesis'` → **PAS d'angle**
- **Ligne 1974** : Miroirs BLOCS 3-9 → `blockType = 'block3'...'block9'` → **AVEC angle**
- **Ligne 2071, 2106** : Synthèse finale (autres cas) → `blockType = 'synthesis'` → **PAS d'angle**
- **Ligne 2280** : Matching → `blockType = 'matching'` → **PAS d'angle**

### 3. `src/services/blockOrchestrator.ts`

#### Modifications principales
- **Ligne 18** : Import ajouté : `import { selectMentorAngle } from './mentorAngleSelector.js';`
- **Ligne 485-515** : Fonction `generateMirrorForBlock1()` mise à jour
  - **Ligne 485** : Log mis à jour "3 étapes" au lieu de "2 étapes"
  - **Ligne 506** : Ajout de l'étape 2 : `const mentorAngle = await selectMentorAngle(structure);`
  - **Ligne 515** : Appel à `renderMentorStyle(mentorAngle, 'block1')` au lieu de `renderMentorStyle(structure, 'block1')`
- **Ligne 1720-1759** : Fonction `generateMirror2B()` mise à jour
  - **Ligne 1720** : Log mis à jour "3 étapes" au lieu de "2 étapes"
  - **Ligne 1752** : Ajout de l'étape 2 : `const mentorAngle = await selectMentorAngle(structure);`
  - **Ligne 1759** : Appel à `renderMentorStyle(mentorAngle, 'block2b')` au lieu de `renderMentorStyle(structure, 'block2b')`

---

## ✅ CE QUI EST RÉSOLU

### 1. Architecture 3 étapes implémentée
- ✅ Étape 1 (analyse) : inchangée, fonctionne
- ✅ Étape 2 (angle) : implémentée dans `mentorAngleSelector.ts`
- ✅ Étape 3 (rendu) : adaptée pour recevoir l'angle uniquement

### 2. Séparation miroirs / synthèse / matching
- ✅ Miroirs fin de bloc (BLOC 1, 2B, 3-9) : utilisent l'angle (perte volontaire d'info)
- ✅ Synthèse finale (BLOC 10) : n'utilise PAS l'angle (synthèse complète)
- ✅ Matching : n'utilise PAS l'angle (matching précis)

### 3. Règles de verrouillage implémentées
- ✅ Règle d'arbitrage : "expliquer le plus avec le moins"
- ✅ Interdiction de résumé : détection de patterns interdits
- ✅ Interdiction "dernière réponse" : cohérence transversale requise
- ✅ Permission de perdre de l'info : explicitement autorisée

### 4. Build et compilation
- ✅ TypeScript compile sans erreur
- ✅ Aucune erreur de lint
- ✅ Tous les imports/exports corrects

### 5. Vérification des appels
- ✅ 3 endroits où `selectMentorAngle()` est appelé (miroirs uniquement)
- ✅ 2 endroits où il n'est PAS appelé (synthèse + matching)
- ✅ Logique conditionnelle correcte dans `generateMirrorWithNewArchitecture()`

---

## ⚠️ CE QUI RESTE À FAIRE

### 1. Tests réels (BLOQUANT)
**Objectif** : Valider que les outputs correspondent aux attentes produit

#### Test 1 : Miroir fin de bloc (doit faire "wow")
- **Scénario** : Générer un miroir pour BLOC 3 (ou autre)
- **Vérifications** :
  - Log : `[AXIOM_EXECUTOR][ETAPE2] Sélection angle mentor pour block3...`
  - Output : Format REVELIOM respecté (20/25 mots)
  - Effet : "wow… ok, ça me parle vraiment" (pas "oui, c'est ce que j'ai dit")
  - Angle : UN angle tranché, pas un résumé

#### Test 2 : Synthèse BLOC 10 (doit rester riche)
- **Scénario** : Générer la synthèse finale après BLOC 10
- **Vérifications** :
  - Log : `[AXIOM_EXECUTOR][ETAPE2] Pas d'angle pour synthesis - utilisation hypothèse centrale complète`
  - Output : Synthèse complète, structurante, pas de perte d'info
  - Contenu : Couvre tous les aspects (mouvement, temps, valeurs, projections, forces, limites, positionnement)

#### Test 3 : Matching (doit rester précis)
- **Scénario** : Générer le matching après synthèse
- **Vérifications** :
  - Log : `[AXIOM_EXECUTOR][ETAPE2] Pas d'angle pour matching - utilisation hypothèse centrale complète`
  - Output : Matching précis, pas de "one-liner"
  - Contenu : Analyse complète de compatibilité (cœur métier, durée, cohérence)

### 2. Ajustements prompts (si nécessaire après tests)
- **Si les miroirs ne font pas "wow"** :
  - Ajuster le prompt de `selectMentorAngle()` pour être plus tranché
  - Ajuster le prompt de `renderMentorStyle()` pour être plus incarné
- **Si la synthèse est trop réduite** :
  - Vérifier que `structure.hypothese_centrale` contient bien toute l'info
  - Ajuster le prompt de `generateInterpretiveStructure()` pour synthèse finale

### 3. Validation format REVELIOM
- **Vérifier** : Les miroirs respectent toujours le format REVELIOM (20/25 mots)
- **Si problème** : Ajuster les contraintes dans `getFormatInstructions()`

### 4. Monitoring et logs
- **Ajouter** : Logs plus détaillés pour tracer l'angle sélectionné
- **Ajouter** : Métriques sur la longueur des angles vs hypothèses centrales
- **Ajouter** : Validation que l'angle est bien différent de l'hypothèse centrale

---

## 🔍 PROBLÈMES CONNUS

### 1. Aucun problème technique identifié
- ✅ Build passe
- ✅ Types corrects
- ✅ Imports/exports corrects
- ✅ Logique conditionnelle correcte

### 2. Risques potentiels (à valider par tests)

#### Risque 1 : L'angle est trop proche de l'hypothèse centrale
- **Symptôme** : L'angle sélectionné est une reformulation de l'hypothèse centrale
- **Cause possible** : Prompt de `selectMentorAngle()` pas assez tranché
- **Solution** : Renforcer le prompt pour exiger un angle vraiment différent

#### Risque 2 : La synthèse finale est trop réduite
- **Symptôme** : La synthèse BLOC 10 manque d'éléments
- **Cause possible** : `structure.hypothese_centrale` ne contient pas assez d'info
- **Solution** : Vérifier que `generateInterpretiveStructure()` produit bien une hypothèse centrale complète pour `blockType = 'synthesis'`

#### Risque 3 : Le matching est trop vague
- **Symptôme** : Le matching est un "one-liner" au lieu d'une analyse précise
- **Cause possible** : Le prompt de `renderMentorStyle()` pour `blockType = 'matching'` n'est pas assez structurant
- **Solution** : Renforcer les instructions de format pour le matching

---

## 🎯 PISTES D'AMÉLIORATION

### 1. Affiner la sélection d'angle
- **Idée** : Ajouter une validation que l'angle est bien "différent" de l'hypothèse centrale
- **Idée** : Mesurer la "distance" entre l'angle et l'hypothèse centrale
- **Idée** : Forcer l'angle à être plus court/more tranché

### 2. Améliorer le rendu mentor
- **Idée** : Ajouter des exemples dans le prompt de `renderMentorStyle()`
- **Idée** : Utiliser un few-shot learning avec des exemples de "wow"
- **Idée** : Ajuster la température selon le blockType

### 3. Monitoring et métriques
- **Idée** : Logger l'angle sélectionné pour chaque miroir
- **Idée** : Comparer la longueur de l'angle vs l'hypothèse centrale
- **Idée** : Mesurer la "tranchance" de l'angle (via analyse sémantique)

---

## 📊 ÉTAT ACTUEL DU CODE

### Fichiers modifiés (4)
1. ✅ `src/services/mentorAngleSelector.ts` (NOUVEAU)
2. ✅ `src/services/mentorStyleRenderer.ts` (MODIFIÉ)
3. ✅ `src/engine/axiomExecutor.ts` (MODIFIÉ)
4. ✅ `src/services/blockOrchestrator.ts` (MODIFIÉ)

### Fichiers non modifiés (mais utilisés)
- `src/services/interpretiveStructureGenerator.ts` : Inchangé (étape 1)
- `src/services/validateMirrorREVELIOM.ts` : Inchangé
- `src/services/validateMentorStyle.ts` : Inchangé

### Commits effectués
- ✅ Commit 1 : "feat: renderer utilise uniquement hypothèse centrale - permission de trancher"
- ✅ Commit 2 : "feat: ajout étape décision d'angle mentor (étape 2) - architecture 3 étapes"

---

## 🧪 GUIDE DE TEST

### Test manuel rapide

1. **Démarrer le serveur** :
   ```bash
   npm run dev
   ```

2. **Créer un candidat de test** :
   - Utiliser l'API pour créer une session
   - Répondre aux questions du BLOC 1

3. **Vérifier les logs** :
   - Chercher : `[AXIOM_EXECUTOR][ETAPE2] Sélection angle mentor pour block1...`
   - Vérifier que l'angle est loggé
   - Vérifier que le miroir est généré

4. **Tester BLOC 10** :
   - Compléter tous les blocs jusqu'au BLOC 10
   - Vérifier les logs : `[AXIOM_EXECUTOR][ETAPE2] Pas d'angle pour synthesis...`
   - Vérifier que la synthèse est complète

5. **Tester Matching** :
   - Générer le matching après synthèse
   - Vérifier les logs : `[AXIOM_EXECUTOR][ETAPE2] Pas d'angle pour matching...`
   - Vérifier que le matching est précis

### Tests à automatiser (futur)

1. **Test unitaire** : `selectMentorAngle()` avec différents `InterpretiveStructure`
2. **Test d'intégration** : Pipeline complet pour un miroir
3. **Test de validation** : Vérifier que l'angle est bien différent de l'hypothèse centrale
4. **Test de format** : Vérifier que les miroirs respectent REVELIOM

---

## 📝 NOTES IMPORTANTES

### Architecture décisionnelle
- **Miroirs fin de bloc** : Utilisent l'angle → perte volontaire d'info → effet "wow"
- **Synthèse finale** : N'utilise PAS l'angle → synthèse complète → structurant
- **Matching** : N'utilise PAS l'angle → matching précis → analyse complète

### Règles de verrouillage (dans `selectMentorAngle()`)
1. **Règle d'arbitrage** : Si plusieurs angles possibles, choisir celui qui explique le plus avec le moins
2. **Interdiction de résumé** : Pas de "globalement", pas de liste, pas d'équilibrage
3. **Interdiction "dernière réponse"** : L'angle doit être justifiable par la cohérence transversale
4. **Permission de perdre de l'info** : Explicitement autorisée et requise

### Critère de succès
- **Miroir** : Doit provoquer "wow… ok, ça me parle vraiment"
- **Miroir** : Ne doit JAMAIS provoquer "oui, c'est ce que j'ai dit"
- **Synthèse** : Doit rester riche et structurante
- **Matching** : Doit rester précis, pas de "one-liner"

---

## 🔗 RESSOURCES

### Fichiers de documentation
- `AUDIT_RENDU_MENTOR_INCARNE_CAUSES_RACINES.md` : Audit initial du problème
- `VERIFICATION_ANGLE_MENTOR.md` : Vérification des appels (créé dans cette session)

### Points d'entrée du code
- **Miroirs BLOC 1** : `src/services/blockOrchestrator.ts:generateMirrorForBlock1()`
- **Miroirs BLOC 2B** : `src/services/blockOrchestrator.ts:generateMirror2B()`
- **Miroirs BLOCS 3-9** : `src/engine/axiomExecutor.ts:generateMirrorWithNewArchitecture()`
- **Synthèse BLOC 10** : `src/engine/axiomExecutor.ts:generateMirrorWithNewArchitecture()` (ligne 1746, 2071, 2106)
- **Matching** : `src/engine/axiomExecutor.ts:generateMirrorWithNewArchitecture()` (ligne 2280)

---

## ✅ CHECKLIST POUR REPRENDRE LE PROJET

- [ ] Lire ce document en entier
- [ ] Vérifier que le build passe : `npm run build`
- [ ] Lire les fichiers modifiés pour comprendre les changements
- [ ] Faire un test manuel avec un candidat de test
- [ ] Vérifier les logs pour confirmer que l'angle est bien utilisé/non utilisé selon le cas
- [ ] Valider les outputs (miroir "wow", synthèse riche, matching précis)
- [ ] Si problèmes identifiés, ajuster les prompts selon les pistes d'amélioration
- [ ] Documenter les résultats des tests
- [ ] Si tout est OK, passer en production

---

**FIN DU RÉCAPITULATIF**
