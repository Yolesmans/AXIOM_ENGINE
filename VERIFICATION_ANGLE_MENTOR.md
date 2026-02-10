# ✅ VÉRIFICATION — UTILISATION DE L'ANGLE MENTOR

## 📍 3 ENDROITS OÙ `selectMentorAngle()` EST APPELÉ (Miroirs fin de bloc)

### 1. `src/services/blockOrchestrator.ts` — `generateMirrorForBlock1()` (ligne 506)
- **Bloc** : BLOC 1
- **Appel** : `const mentorAngle = await selectMentorAngle(structure);`
- **Contexte** : Miroir fin de BLOC 1 (format REVELIOM)
- **✅ CORRECT** : Utilise l'angle pour perte volontaire d'info

### 2. `src/services/blockOrchestrator.ts` — `generateMirror2B()` (ligne 1752)
- **Bloc** : BLOC 2B
- **Appel** : `const mentorAngle = await selectMentorAngle(structure);`
- **Contexte** : Miroir fin de BLOC 2B (synthèse 4-6 lignes)
- **✅ CORRECT** : Utilise l'angle pour perte volontaire d'info

### 3. `src/engine/axiomExecutor.ts` — `generateMirrorWithNewArchitecture()` (ligne 75)
- **Blocs** : BLOCS 3, 4, 5, 6, 7, 8, 9
- **Appel** : `const mentorAngle = await selectMentorAngle(structure);`
- **Contexte** : Miroirs fin de bloc (format REVELIOM)
- **✅ CORRECT** : Utilise l'angle UNIQUEMENT pour les miroirs (conditionné)

**Condition** : `usesAngle = mirrorBlockTypes.includes(blockType)` où `mirrorBlockTypes = ['block1', 'block2b', 'block3', 'block4', 'block5', 'block6', 'block7', 'block8', 'block9']`

---

## 🚫 2 ENDROITS OÙ `selectMentorAngle()` N'EST PAS APPELÉ (Synthèse complète)

### 1. BLOC 10 — Synthèse finale
- **Fichier** : `src/engine/axiomExecutor.ts`
- **Lignes** : 1746, 2071, 2106
- **Appel** : `await generateMirrorWithNewArchitecture(allUserAnswers, 'synthesis')`
- **Preuve** : 
  - `blockType = 'synthesis'` → `usesAngle = false` (ligne 47)
  - L'étape 2 est sautée (lignes 60-76)
  - `inputForRenderer = structure.hypothese_centrale` (ligne 78)
  - **✅ CORRECT** : Pas de perte d'info, synthèse complète

### 2. MATCHING
- **Fichier** : `src/engine/axiomExecutor.ts`
- **Ligne** : 2280
- **Appel** : `await generateMirrorWithNewArchitecture(allUserAnswers, 'matching', additionalContext)`
- **Preuve** :
  - `blockType = 'matching'` → `usesAngle = false` (ligne 47)
  - L'étape 2 est sautée (lignes 60-76)
  - `inputForRenderer = structure.hypothese_centrale` (ligne 78)
  - **✅ CORRECT** : Pas de perte d'info, matching précis

---

## 🔍 CODE DE VÉRIFICATION

```typescript
// src/engine/axiomExecutor.ts — generateMirrorWithNewArchitecture()

const mirrorBlockTypes: BlockType[] = ['block1', 'block2b', 'block3', 'block4', 'block5', 'block6', 'block7', 'block8', 'block9'];
const usesAngle = mirrorBlockTypes.includes(blockType);

if (usesAngle) {
  // Miroirs fin de bloc : utiliser l'angle mentor (perte volontaire d'info)
  const mentorAngle = await selectMentorAngle(structure);
  inputForRenderer = mentorAngle;
} else {
  // Synthèse finale et matching : utiliser l'hypothèse centrale complète (pas de perte d'info)
  inputForRenderer = structure.hypothese_centrale;
}
```

---

## ✅ CONCLUSION

- **Miroirs fin de bloc (BLOC 1, 2B, 3-9)** : ✅ Utilisent l'angle (perte volontaire d'info)
- **Synthèse finale (BLOC 10)** : ✅ N'utilise PAS l'angle (synthèse complète)
- **Matching** : ✅ N'utilise PAS l'angle (matching précis)

**STATUS** : ✅ CORRECT
