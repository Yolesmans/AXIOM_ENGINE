# 🔍 AUDIT TECHNIQUE — ERREURS TYPESCRIPT `candidate` POSSIBLY UNDEFINED
**Date** : 2025-01-27  
**Objectif** : Analyser pourquoi TypeScript considère que `candidate` peut être `undefined` dans deux endroits critiques

---

## ✅ CONFIRMATION DES ERREURS

**Erreur 1** : `src/server.ts(658,51)`
```
TS18048: 'candidate' is possibly 'undefined'
```

**Erreur 2** : `src/services/blockOrchestrator.ts(101,58)`
```
TS18048: 'currentCandidate' is possibly 'undefined'
```

---

## 1️⃣ ANALYSE DU FLUX — ERREUR 1 (src/server.ts:658)

### Code concerné

```typescript
// Ligne 654
const result = await orchestrator.handleMessage(candidate, null, "START_BLOC_1");

// Ligne 656
candidate = candidateStore.get(candidate.candidateId);
// Ligne 657
if (!candidate) {
  // Ligne 658 — ERREUR ICI
  candidate = await candidateStore.getAsync(candidate.candidateId);
}
```

### Cause racine précise

**TypeScript a raison** : Dans le bloc `if (!candidate)`, TypeScript infère que `candidate` est `undefined` (narrowing). À la ligne 658, on tente d'accéder à `candidate.candidateId` alors que TypeScript sait que `candidate` est `undefined` dans ce bloc.

**Endroit exact où le contrat se brise** :
- **Ligne 656** : `candidateStore.get()` retourne `AxiomCandidate | undefined` (signature ligne 174 de `sessionStore.ts`)
- **Ligne 657** : Le narrowing TypeScript infère `candidate === undefined` dans le bloc `if`
- **Ligne 658** : Tentative d'accès à `candidate.candidateId` alors que `candidate` est `undefined`

**Problème architectural** :
- Le `candidateId` nécessaire pour `getAsync()` est perdu si `candidate` devient `undefined`
- Le code suppose que `candidate.candidateId` existe même si `candidate` est `undefined`, ce qui est logiquement impossible

---

## 2️⃣ ANALYSE DU FLUX — ERREUR 2 (blockOrchestrator.ts:101)

### Code concerné

```typescript
// Ligne 99
currentCandidate = candidateStore.get(currentCandidate.candidateId);
// Ligne 100
if (!currentCandidate) {
  // Ligne 101 — ERREUR ICI
  currentCandidate = await candidateStore.getAsync(currentCandidate.candidateId);
}
```

### Cause racine précise

**Même problème** : Dans le bloc `if (!currentCandidate)`, TypeScript infère que `currentCandidate` est `undefined`. À la ligne 101, on tente d'accéder à `currentCandidate.candidateId` alors que TypeScript sait que `currentCandidate` est `undefined`.

**Endroit exact où le contrat se brise** :
- **Ligne 99** : `candidateStore.get()` retourne `AxiomCandidate | undefined`
- **Ligne 100** : Narrowing TypeScript → `currentCandidate === undefined` dans le bloc `if`
- **Ligne 101** : Tentative d'accès à `currentCandidate.candidateId` alors que `currentCandidate` est `undefined`

**Problème architectural** :
- Le `candidateId` nécessaire pour `getAsync()` est perdu si `currentCandidate` devient `undefined`
- Le code suppose que `currentCandidate.candidateId` existe même si `currentCandidate` est `undefined`

---

## 3️⃣ POURQUOI TYPESCRIPT A RAISON

### Signature des fonctions store

**`candidateStore.get(candidateId: string): AxiomCandidate | undefined`** (ligne 174)
- Retourne `undefined` si le candidat n'existe pas dans la Map
- TypeScript ne peut pas garantir que le candidat existe après un `get()`

**`candidateStore.getAsync(candidateId: string): Promise<AxiomCandidate | undefined>`** (ligne 179)
- Retourne également `undefined` si le candidat n'existe pas (ni dans Map ni dans Redis)
- TypeScript ne peut pas garantir que le candidat existe après un `getAsync()`

### Narrowing TypeScript

Quand on écrit :
```typescript
candidate = candidateStore.get(candidateId);
if (!candidate) {
  // Ici, TypeScript infère : candidate === undefined
  candidate = await candidateStore.getAsync(candidate.candidateId); // ❌ ERREUR
}
```

TypeScript applique le **narrowing** : dans le bloc `if (!candidate)`, il sait que `candidate` est `undefined`. Toute tentative d'accès à `candidate.candidateId` est donc invalide.

---

## 4️⃣ EST-CE UN PROBLÈME ARCHITECTURAL OU TYPOLOGIQUE ?

### Problème typologique (narrowing manquant)

**OUI** : Le problème est d'abord typologique. TypeScript applique correctement le narrowing, mais le code tente d'accéder à une propriété d'une variable `undefined`.

### Problème architectural (contrat de fonction trop large)

**PARTIELLEMENT** : 
- Les fonctions `get()` et `getAsync()` retournent `undefined` légitimement (candidat peut ne pas exister)
- Le problème est que le code ne préserve pas le `candidateId` avant de vérifier si `candidate` est `undefined`

### Problème lié à la séparation executeAxiom / orchestrateur

**NON** : Le problème n'est pas lié à la séparation. C'est un problème de gestion d'état local dans les deux endroits.

---

## 5️⃣ OPTIONS DE CORRECTION POSSIBLES

### Option A — Sauvegarder `candidateId` avant le `get()`

**Principe** : Stocker `candidateId` dans une variable locale avant d'appeler `get()`, puis utiliser cette variable dans le bloc `if (!candidate)`.

**Exemple (théorique)** :
```typescript
const candidateId = candidate.candidateId;
candidate = candidateStore.get(candidateId);
if (!candidate) {
  candidate = await candidateStore.getAsync(candidateId); // ✅ Utilise la variable sauvegardée
}
```

**Avantages** :
- ✅ Simple et direct
- ✅ Pas de changement architectural
- ✅ TypeScript satisfait (pas d'accès à propriété de `undefined`)
- ✅ Compatible avec l'OPTION B

**Inconvénients** :
- ⚠️ Nécessite une variable locale supplémentaire
- ⚠️ Duplication de logique (même pattern dans 2 endroits)

**Risques** :
- 🟢 **FAIBLE** : Risque minimal, correction locale

---

### Option B — Utiliser l'opérateur de coalescence nulle (`??`)

**Principe** : Utiliser `candidate?.candidateId ?? fallback` pour éviter l'accès à une propriété de `undefined`.

**Exemple (théorique)** :
```typescript
candidate = candidateStore.get(candidate.candidateId);
candidate = candidate ?? await candidateStore.getAsync(candidate?.candidateId ?? candidateId);
```

**Avantages** :
- ✅ Évite le narrowing problématique
- ✅ Code plus concis

**Inconvénients** :
- ⚠️ Nécessite quand même de sauvegarder `candidateId` quelque part
- ⚠️ Moins lisible que l'Option A
- ⚠️ `candidate?.candidateId` peut être `undefined` si `candidate` est `undefined`

**Risques** :
- 🟡 **MOYEN** : Risque de `undefined` si `candidateId` n'est pas préservé

---

### Option C — Restructurer avec early return

**Principe** : Utiliser un early return si `candidate` est `undefined` après `get()`, avant d'appeler `getAsync()`.

**Exemple (théorique)** :
```typescript
const candidateId = candidate.candidateId;
candidate = candidateStore.get(candidateId);
if (!candidate) {
  const asyncCandidate = await candidateStore.getAsync(candidateId);
  if (!asyncCandidate) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
  candidate = asyncCandidate;
}
```

**Avantages** :
- ✅ Logique claire et explicite
- ✅ Gestion d'erreur explicite
- ✅ TypeScript satisfait

**Inconvénients** :
- ⚠️ Plus verbeux
- ⚠️ Nécessite de modifier la structure du code

**Risques** :
- 🟢 **FAIBLE** : Risque minimal, mais plus de refactoring

---

### Option D — Modifier la signature de `get()` pour garantir un candidat

**Principe** : Modifier `candidateStore.get()` pour qu'il garantisse de retourner un candidat (jamais `undefined`), ou créer une méthode `getOrCreate()`.

**Avantages** :
- ✅ Élimine le problème à la source
- ✅ Simplifie le code appelant

**Inconvénients** :
- ❌ **INCOMPATIBLE avec PHASE 1** : Modifie le contrat du store
- ❌ **RISQUE ÉLEVÉ** : Peut casser d'autres parties du code qui s'appuient sur `get()` retournant `undefined`
- ❌ **ANTICIPATION** : Va au-delà de PHASE 2

**Risques** :
- 🔴 **ÉLEVÉ** : Risque de régression sur d'autres parties du code

---

## 6️⃣ RECOMMANDATION — OPTION LA PLUS PROPRE (OPTION B)

### Option recommandée : **Option A — Sauvegarder `candidateId`**

**Justification** :
1. **Minimale** : Correction locale, pas de changement architectural
2. **Sûre** : Pas de risque de régression
3. **Claire** : Logique explicite et lisible
4. **Compatible OPTION B** : N'affecte pas l'orchestration séquentielle
5. **TypeScript satisfait** : Élimine l'erreur de narrowing

**Application** :
- **Erreur 1** (`src/server.ts:658`) : Sauvegarder `candidate.candidateId` avant le `get()`
- **Erreur 2** (`blockOrchestrator.ts:101`) : Sauvegarder `currentCandidate.candidateId` avant le `get()`

---

## 7️⃣ RISQUES PAR OPTION

### Option A — Sauvegarder `candidateId`
- **Risque de régression** : 🟢 **FAIBLE** (correction locale)
- **Risque de casser l'existant** : 🟢 **FAIBLE** (pas de changement de contrat)
- **Risque architectural** : 🟢 **FAIBLE** (pas de changement d'architecture)

### Option B — Coalescence nulle
- **Risque de régression** : 🟡 **MOYEN** (nécessite quand même sauvegarde de `candidateId`)
- **Risque de casser l'existant** : 🟢 **FAIBLE**
- **Risque architectural** : 🟢 **FAIBLE**

### Option C — Early return
- **Risque de régression** : 🟡 **MOYEN** (refactoring plus important)
- **Risque de casser l'existant** : 🟢 **FAIBLE**
- **Risque architectural** : 🟢 **FAIBLE**

### Option D — Modifier signature `get()`
- **Risque de régression** : 🔴 **ÉLEVÉ** (change le contrat du store)
- **Risque de casser l'existant** : 🔴 **ÉLEVÉ** (autres parties du code s'appuient sur `get()` retournant `undefined`)
- **Risque architectural** : 🔴 **ÉLEVÉ** (change l'architecture du store)

---

## 8️⃣ CONCLUSION

### Cause racine

**TypeScript a raison** : Le narrowing TypeScript détecte correctement que `candidate` est `undefined` dans le bloc `if (!candidate)`, et le code tente d'accéder à `candidate.candidateId` dans ce bloc, ce qui est logiquement impossible.

**Endroit exact** :
- `src/server.ts:658` : Accès à `candidate.candidateId` alors que `candidate` est `undefined`
- `src/services/blockOrchestrator.ts:101` : Accès à `currentCandidate.candidateId` alors que `currentCandidate` est `undefined`

**Type de problème** :
- **Typologique** : Narrowing TypeScript correct, mais code tente d'accéder à propriété de `undefined`
- **Architectural** : Le `candidateId` n'est pas préservé avant la vérification `if (!candidate)`

### Option recommandée

**Option A — Sauvegarder `candidateId` avant le `get()`**

**Raison** :
- Correction minimale et sûre
- Pas de changement architectural
- Compatible avec OPTION B
- TypeScript satisfait

**Risque** : 🟢 **FAIBLE**

---

**FIN DE L'AUDIT**
