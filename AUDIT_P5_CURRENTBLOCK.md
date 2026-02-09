# 🔍 AUDIT P5 — GESTION DE `currentBlock`

**Date** : 2025-01-27  
**Objectif** : Vérifier si la mise à jour de `currentBlock` dans `server.ts` est redondante avec `executeAxiom` pour les BLOCS 3-10

---

## 1️⃣ GESTION DE `currentBlock` DANS `executeAxiom`

### Fichier analysé : `src/engine/axiomExecutor.ts`

### Analyse de la section "BLOCS 1 à 10" (lignes 1558-1865)

**❌ RÉSULTAT : `executeAxiom` NE met PAS à jour `currentBlock` pour les BLOCS 3-10**

**Preuve dans le code :**

1. **Calcul du `blocNumber`** (ligne 1563) :
   ```typescript
   const blocNumber = blocStates.indexOf(currentState as any) + 1;
   ```
   - Le `blocNumber` est calculé depuis `currentState`
   - Mais il n'est utilisé QUE pour :
     - Construire les prompts OpenAI
     - Stocker dans `conversationHistory` avec `block: blocNumber`
     - Déterminer `nextState` pour la transition

2. **Détermination de `nextState`** (lignes 1793-1803) :
   ```typescript
   let nextState = currentState;
   if (!expectsAnswer && blocNumber < 10) {
     nextState = blocStates[blocNumber] as any; // Passe au bloc suivant
   }
   ```

3. **Mise à jour UI uniquement** (lignes 1805-1810) :
   ```typescript
   candidateStore.updateUIState(candidate.candidateId, {
     step: nextState,
     lastQuestion,
     tutoiement: ui.tutoiement || undefined,
     identityDone: true,
   });
   ```
   - ✅ `updateUIState` est appelé avec `nextState`
   - ❌ **AUCUN appel à `updateSession` avec `currentBlock`**

4. **Aucune mise à jour de session** :
   - Recherche exhaustive : **AUCUNE occurrence** de `updateSession` avec `currentBlock` dans la section BLOCS 3-10 de `executeAxiom`

### Conclusion 1️⃣

**❌ NON, `executeAxiom` ne met PAS à jour `currentBlock` automatiquement pour les BLOCS 3-10**

- Il met uniquement à jour `step` via `updateUIState`
- Il calcule `nextState` pour la transition
- Mais `currentBlock` dans `candidate.session.currentBlock` n'est JAMAIS modifié

---

## 2️⃣ RÔLE EXACT DE `server.ts` SUR `currentBlock`

### Fichier analysé : `src/server.ts`

### Analyse des mises à jour de `currentBlock`

#### A) Route `/axiom` — Section principale (lignes 909-912)

```typescript
// Mise à jour session pour les blocs (si nécessaire)
if ([BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(result.step as any)) {
  const blocNumber = [BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].indexOf(result.step as any) + 1;
  candidateStore.updateSession(candidate.candidateId, { state: "collecting", currentBlock: blocNumber });
}
```

**Rôle :**
- ✅ Met à jour `currentBlock` pour **TOUS les blocs** (1-10)
- ✅ Exécuté APRÈS l'appel à `executeAxiom` ou `BlockOrchestrator`
- ✅ **SEULE source de mise à jour pour les BLOCS 3-10**

#### B) Route `/axiom` — Section BLOC 1 (lignes 748-756)

```typescript
// Utiliser la fonction unique de mapping
const responseState = mapStepToState(result.step);
const responseStep = result.step;
```

**Rôle :**
- ❌ Ne met PAS à jour `currentBlock` (mapping uniquement)

#### C) Route `/axiom` — Section BLOC 2A/2B (lignes 838-847)

```typescript
// Utiliser la fonction unique de mapping
const responseState = mapStepToState(result.step);
const responseStep = result.step;

// Mise à jour session pour BLOC 1 et 2
if (result.step === BLOC_01) {
  candidateStore.updateSession(candidate.candidateId, { state: "collecting", currentBlock: 1 });
} else if (result.step === BLOC_02) {
  candidateStore.updateSession(candidate.candidateId, { state: "collecting", currentBlock: 2 });
}
```

**Rôle :**
- ⚠️ Met à jour `currentBlock` pour BLOC 1 et 2 uniquement
- ⚠️ **REDONDANT** avec la section principale (lignes 909-912)

### Analyse de `BlockOrchestrator`

#### D) BLOC 1 → BLOC 2A (lignes 252-256)

```typescript
candidateStore.updateUIState(updatedCandidate.candidateId, {
  step: BLOC_02,
  lastQuestion: firstQuestion2A,
  identityDone: true,
});
```

**Rôle :**
- ❌ Ne met PAS à jour `currentBlock` explicitement
- ✅ Met uniquement à jour `step: BLOC_02`

#### E) BLOC 2B → BLOC 3 (lignes 920-924)

```typescript
candidateStore.updateSession(candidateId, {
  state: "collecting",
  currentBlock: 3,
});
```

**Rôle :**
- ✅ Met à jour `currentBlock: 3` explicitement
- ⚠️ **REDONDANT** avec la section principale de `server.ts` (lignes 909-912)

### Conclusion 2️⃣

**Résumé des mises à jour de `currentBlock` :**

| Source | BLOC 1 | BLOC 2A | BLOC 2B | BLOC 3-10 |
|--------|--------|---------|---------|-----------|
| `BlockOrchestrator` | ❌ | ❌ | ✅ (→ BLOC 3) | N/A |
| `executeAxiom` | ❌ | ❌ | ❌ | ❌ |
| `server.ts` (section principale) | ✅ | ✅ | ✅ | ✅ |
| `server.ts` (section BLOC 2A/2B) | ✅ | ✅ | ❌ | ❌ |

**Analyse :**
- La ligne 909-912 dans `server.ts` est **ESSENTIELLE** pour les BLOCS 3-10
- Elle est **REDONDANTE** pour BLOC 1 et 2 (également mise à jour dans section BLOC 2A/2B)
- Elle est **REDONDANTE** avec `BlockOrchestrator` pour la transition BLOC 2B → BLOC 3

---

## 3️⃣ HYPOTHÈSES TECHNIQUES

### Hypothèse A : Suppression totale de la ligne 909-912

**❌ DANGEREUSE**

**Raison :**
- Les BLOCS 3-10 n'auraient PLUS de mise à jour de `currentBlock`
- `executeAxiom` ne le fait pas
- `BlockOrchestrator` ne gère que BLOC 1 et 2
- **Impact :** `candidate.session.currentBlock` resterait bloqué à la dernière valeur (ex: 2 ou 3)

### Hypothèse B : Suppression partielle (BLOCS 3-10 uniquement)

**❌ IMPOSSIBLE**

**Raison :**
- La condition actuelle couvre TOUS les blocs (1-10)
- Il faudrait scinder la logique pour exclure BLOC 1 et 2
- Mais alors les BLOCS 3-10 n'auraient plus de mise à jour

### Hypothèse C : Déplacer la logique dans `executeAxiom`

**✅ FAISABLE MAIS HORS PÉRIMÈTRE P5**

**Raison :**
- Ajouter dans `executeAxiom` (ligne ~1805) :
  ```typescript
  if ([BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(nextState as any)) {
    const nextBlocNumber = blocStates.indexOf(nextState as any) + 1;
    candidateStore.updateSession(candidate.candidateId, { currentBlock: nextBlocNumber });
  }
  ```
- Puis supprimer la ligne 909-912 dans `server.ts`
- **Mais :** P5 demande uniquement la suppression, pas le déplacement

### Hypothèse D : Suppression uniquement pour BLOC 1 et 2 (garder 3-10)

**✅ SÉCURISÉE**

**Raison :**
- Modifier la condition ligne 909-912 pour exclure BLOC_01 et BLOC_02
- Garder la mise à jour pour BLOCS 3-10
- Supprimer les mises à jour redondantes dans section BLOC 2A/2B (lignes 843-846)

**Code proposé :**
```typescript
// Mise à jour session pour les blocs 3-10 uniquement (BLOC 1 et 2 gérés par BlockOrchestrator)
if ([BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(result.step as any)) {
  const blocNumber = [BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].indexOf(result.step as any) + 3;
  candidateStore.updateSession(candidate.candidateId, { state: "collecting", currentBlock: blocNumber });
}
```

---

## 4️⃣ CONCLUSION ATTENDUE

### ❌ P5 NE PEUT PAS être appliqué en supprimant uniquement la ligne 909-912

**Raison principale :**
- Cette ligne est **ESSENTIELLE** pour les BLOCS 3-10
- `executeAxiom` ne met PAS à jour `currentBlock` pour ces blocs
- Supprimer cette ligne casserait la synchronisation `step` ↔ `currentBlock` pour BLOCS 3-10

### ✅ P5 nécessite une adaptation préalable

**Option recommandée :**

1. **Déplacer la logique dans `executeAxiom`** (ligne ~1805, après `updateUIState`) :
   ```typescript
   // Mise à jour currentBlock pour BLOCS 3-10
   if ([BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10].includes(nextState as any)) {
     const nextBlocNumber = blocStates.indexOf(nextState as any) + 1;
     candidateStore.updateSession(candidate.candidateId, { currentBlock: nextBlocNumber });
   }
   ```

2. **Puis supprimer la ligne 909-912 dans `server.ts`**

3. **Supprimer les mises à jour redondantes** dans section BLOC 2A/2B (lignes 843-846)

**Alternative (si on veut rester dans P5 strict) :**

- Modifier la condition ligne 909-912 pour exclure BLOC_01 et BLOC_02
- Garder uniquement BLOCS 3-10
- Supprimer les redondances dans section BLOC 2A/2B

---

## 📋 RÉSUMÉ EXÉCUTIF

| Question | Réponse |
|----------|---------|
| `executeAxiom` met-il à jour `currentBlock` pour BLOCS 3-10 ? | ❌ NON |
| La ligne 909-912 est-elle redondante pour BLOCS 3-10 ? | ❌ NON (essentielle) |
| La ligne 909-912 est-elle redondante pour BLOC 1 et 2 ? | ✅ OUI |
| P5 peut-il être appliqué en supprimant uniquement la ligne ? | ❌ NON |
| P5 nécessite-t-il une adaptation préalable ? | ✅ OUI |

**Recommandation finale :** P5 nécessite de déplacer la logique de mise à jour `currentBlock` pour BLOCS 3-10 dans `executeAxiom` AVANT de supprimer la ligne dans `server.ts`.
