# 📋 PLAN D'ACTION FINAL — AXIOM / REVELIOM

**Date** : 2025-01-27  
**Basé sur** : AUDIT_FIN_DE_CHANTIER_EXHAUSTIF_AXIOM.md  
**Objectif** : Liste exhaustive des correctifs restants avec priorité et effort estimé

---

## 🎯 VERDICT AUDIT

**STATUT** : 🔴 **NO-GO** — Validation miroir impossible, violation contrat REVELIOM

**Blocages principaux** :
1. Validation miroir BLOC 1 court-circuitée
2. Validation miroir BLOC 2B court-circuitée
3. Validation miroir BLOCS 3-9 impossible
4. Nuances de validation non stockées

---

## 🔴 PRIORITÉ 1 — BLOQUANT (AVANT PRODUCTION)

### C1 — Correction validation miroir BLOC 1

**Problème** : Après le miroir BLOC 1, la première question BLOC 2A est immédiatement générée et concaténée avec le miroir.

**Fichier** : `src/services/blockOrchestrator.ts:240-268`

**Modification** :
1. Après génération du miroir, retourner UNIQUEMENT le miroir avec `expectsAnswer: true`
2. Attendre une réponse utilisateur de validation
3. Stocker la validation dans `conversationHistory` avec `kind: 'mirror_validation'`
4. Ensuite seulement générer la première question BLOC 2A

**Code actuel** (ligne 262) :
```typescript
return {
  response: mirror + '\n\n' + firstQuestion2A,
  step: BLOC_02,
  expectsAnswer: true,
  autoContinue: false,
  progressiveDisplay: mirrorSections.length === 3,
  mirrorSections: mirrorSections.length === 3 ? mirrorSections : undefined,
};
```

**Code attendu** :
```typescript
// Après miroir, retourner uniquement le miroir
return {
  response: mirror,
  step: BLOC_01, // Rester sur BLOC_01 jusqu'à validation
  expectsAnswer: true, // Forcer true pour validation
  autoContinue: false,
  progressiveDisplay: mirrorSections.length === 3,
  mirrorSections: mirrorSections.length === 3 ? mirrorSections : undefined,
};

// Dans handleMessage(), si userMessage existe et step === BLOC_01 et toutes questions répondues :
// 1. Stocker validation
// 2. Générer question BLOC 2A
// 3. Retourner question avec step: BLOC_02
```

**Effort estimé** : 4 heures

**Risque** : Moyen (changement de comportement, nécessite test)

**Tests** :
- Miroir BLOC 1 affiché seul
- Champ de saisie actif après miroir
- Validation stockée correctement
- Question BLOC 2A générée après validation

---

### C2 — Correction validation miroir BLOC 2B

**Problème** : Après le miroir BLOC 2B, la première question BLOC 3 est immédiatement générée et concaténée avec le miroir.

**Fichier** : `src/services/blockOrchestrator.ts:940-958`

**Modification** :
1. Même logique que BLOC 1 : retourner uniquement le miroir avec `expectsAnswer: true`
2. Attendre validation
3. Stocker validation
4. Ensuite seulement appeler `executeAxiom()` pour BLOC 3

**Code actuel** (ligne 952) :
```typescript
return {
  response: mirror + '\n\n' + nextResult.response,
  step: nextResult.step,
  expectsAnswer: nextResult.expectsAnswer,
  autoContinue: false,
  progressiveDisplay: mirrorSections.length === 3,
  mirrorSections: mirrorSections.length === 3 ? mirrorSections : undefined,
};
```

**Code attendu** :
```typescript
// Après miroir, retourner uniquement le miroir
return {
  response: mirror,
  step: BLOC_02, // Rester sur BLOC_02 jusqu'à validation
  expectsAnswer: true, // Forcer true pour validation
  autoContinue: false,
  progressiveDisplay: mirrorSections.length === 3,
  mirrorSections: mirrorSections.length === 3 ? mirrorSections : undefined,
};

// Dans handleMessage(), si userMessage existe et step === BLOC_02 et toutes questions 2B répondues :
// 1. Stocker validation
// 2. Appeler executeAxiom() pour question BLOC 3
// 3. Retourner question avec step issu de executeAxiom()
```

**Effort estimé** : 4 heures

**Risque** : Moyen

**Tests** :
- Miroir BLOC 2B affiché seul
- Champ de saisie actif après miroir
- Validation stockée correctement
- Question BLOC 3 générée après validation

---

### C3 — Correction validation miroir BLOCS 3-9

**Problème** : Après un miroir, `expectsAnswer = false` (car le miroir ne se termine pas par `?`), et le système passe automatiquement au bloc suivant.

**Fichier** : `src/engine/axiomExecutor.ts:1711, 1795-1797`

**Modification** :
1. Après génération d'un miroir, forcer `expectsAnswer: true` (même si le texte ne se termine pas par `?`)
2. Attendre une réponse utilisateur
3. Stocker la validation
4. Ensuite seulement passer au bloc suivant

**Code actuel** (ligne 1711, 1768) :
```typescript
let expectsAnswer = aiText ? aiText.trim().endsWith('?') : false;

// Après validation/retry miroir
expectsAnswer = aiText ? aiText.trim().endsWith('?') : false;
```

**Code actuel** (ligne 1795-1797) :
```typescript
if (!expectsAnswer && blocNumber < 10) {
  // Fin du bloc → passer au suivant
  nextState = blocStates[blocNumber] as any;
}
```

**Code attendu** :
```typescript
// Après validation/retry miroir
let expectsAnswer = aiText ? aiText.trim().endsWith('?') : false;

// Si c'est un miroir (blocNumber >= 3 && blocNumber <= 9 && !expectsAnswer)
if (aiText && blocNumber >= 3 && blocNumber <= 9 && !expectsAnswer) {
  // C'est un miroir → forcer expectsAnswer: true
  expectsAnswer = true;
}

// Ne pas passer au bloc suivant si expectsAnswer: true
if (!expectsAnswer && blocNumber < 10) {
  // Fin du bloc → passer au suivant
  nextState = blocStates[blocNumber] as any;
}
```

**Effort estimé** : 6 heures

**Risque** : Élevé (changement de logique FSM pour tous les blocs 3-9)

**Tests** :
- Miroir BLOCS 3-9 affiché seul
- `expectsAnswer: true` après chaque miroir
- Champ de saisie actif
- Validation stockée correctement
- Transition au bloc suivant uniquement après validation

---

### C4 — Stockage nuances validation miroir

**Problème** : Les nuances de validation miroir ne sont pas stockées séparément et ne sont pas réutilisables par les blocs suivants.

**Fichier** : `src/store/sessionStore.ts`

**Modification** :
1. Ajouter méthode `appendMirrorValidation(candidateId, mirrorBlock, validationText)`
2. Stocker dans `conversationHistory` avec `kind: 'mirror_validation'`
3. Réinjecter dans les prompts des blocs suivants

**Code attendu** :
```typescript
appendMirrorValidation(
  candidateId: string,
  mirrorBlock: number,
  validationText: string
): void {
  const candidate = this.get(candidateId);
  if (!candidate) return;

  const message: ConversationMessage = {
    role: 'user',
    content: validationText,
    createdAt: new Date().toISOString(),
    block: mirrorBlock,
    step: `BLOC_${String(mirrorBlock).padStart(2, '0')}`,
    kind: 'mirror_validation',
  };

  candidate.conversationHistory.push(message);
  this.persistCandidate(candidate);
}
```

**Réinjection dans prompts** :
- Modifier `buildConversationHistory()` pour inclure les validations miroir
- Les validations doivent être visibles dans les prompts des blocs suivants

**Effort estimé** : 4 heures

**Risque** : Faible (ajout de fonctionnalité)

**Tests** :
- Validation stockée avec `kind: 'mirror_validation'`
- Validation visible dans `conversationHistory`
- Validation réinjectée dans prompts blocs suivants

---

## ⚠️ PRIORITÉ 2 — FRAGILE (AMÉLIORATION QUALITÉ)

### F1 — Unifier mapping step → state

**Problème** : Logique de mapping dupliquée entre `/start` et `/axiom`.

**Fichier** : `src/server.ts:72-90, 271, 284, 897`

**Modification** :
1. Utiliser uniquement `mapStepToState()` dans `/start` et `/axiom`
2. Supprimer la logique locale dans `/start` (ligne 271)

**Effort estimé** : 1 heure

**Risque** : Faible

---

### F2 — Supprimer PREAMBULE_DONE

**Problème** : Constante `PREAMBULE_DONE` existe encore, code dupliqué.

**Fichier** : `src/engine/axiomExecutor.ts:852`, `src/server.ts:245`

**Modification** :
1. Supprimer `export const PREAMBULE_DONE = 'PREAMBULE_DONE';`
2. Remplacer toutes les occurrences par `STEP_03_BLOC1`

**Effort estimé** : 30 minutes

**Risque** : Faible

---

### F3 — Centraliser mise à jour currentBlock

**Problème** : `currentBlock` mis à jour à plusieurs endroits.

**Fichier** : `src/services/blockOrchestrator.ts:224-227, 921-924`, `src/engine/axiomExecutor.ts:1812-1842`

**Modification** :
1. Créer méthode unique `updateCurrentBlock(candidateId, blockNumber)`
2. Utiliser cette méthode partout

**Effort estimé** : 2 heures

**Risque** : Faible

---

### F4 — Ajouter déduplication messages

**Problème** : Pas de protection contre les doublons dans l'historique.

**Fichier** : `src/store/sessionStore.ts:370-420`

**Modification** :
1. Ajouter vérification de doublon dans `appendUserMessage()`
2. Comparer avec le dernier message utilisateur (contenu + timestamp)

**Effort estimé** : 2 heures

**Risque** : Faible

---

### F5 — Ajouter gardes serveur pour double clic boutons

**Problème** : Protection UI uniquement, pas de garde serveur explicite.

**Fichier** : `src/server.ts:652-691`, `src/engine/axiomExecutor.ts:1902-1931`

**Modification** :
1. Ajouter vérification si BLOC 1 déjà démarré avant de générer questions
2. Ajouter vérification si matching déjà généré avant de générer matching

**Effort estimé** : 2 heures

**Risque** : Faible

---

## 📝 PRIORITÉ 3 — NON CERTIFIABLE (TESTS MANUELS)

### T1 — Valider ton mentor

**Éléments à tester** :
- Questions : ton mentor (chaleureux mais pro, direct mais respectueux)
- Miroirs : ton mentor
- Profil final : ton mentor
- Matching : ton mentor

**Méthode** : Test manuel avec plusieurs profils

**Effort estimé** : 2 heures

---

### T2 — Valider adresse 2e personne

**Éléments à tester** :
- Questions : adresse directe (tu / toi)
- Miroirs : adresse directe
- Profil final : adresse directe
- Matching : adresse directe
- Aucune 3e personne ("il", "ce profil", prénom en 3e personne)

**Méthode** : Test manuel avec plusieurs profils

**Effort estimé** : 2 heures

---

### T3 — Valider structure profil final

**Éléments à tester** :
- Sections présentes : 🔥, 🧱, ⚖️, 🧩, 🛠️, 🎯, 🧠
- Ordre respecté
- Texte fixe présent (ligne 1369-1379, 1383-1416)
- Ton respecté

**Méthode** : Test manuel avec plusieurs profils

**Effort estimé** : 2 heures

---

### T4 — Valider format matching

**Éléments à tester** :
- Structure respectée : `━━━━━━━━━━━━━━━━━━`, `🟢 / 🔵 / 🟠 MATCHING AXIOM — [ISSUE]`
- Sections présentes : 🔎 Lecture de compatibilité, 🧭 Cadrage humain
- Sections conditionnelles : 💼 PROJECTION CONCRÈTE (si aligné/conditionnel), 🧭 LE CADRE (si aligné/conditionnel)
- Texte fixe présent (ligne 1647-1648, 1682-1711)
- Pas de double question
- Pas de suggestions parasites

**Méthode** : Test manuel avec plusieurs profils (aligné, conditionnel, pas aligné)

**Effort estimé** : 3 heures

---

## 📊 RÉCAPITULATIF

### Priorité 1 (BLOQUANT)
- C1 : Validation miroir BLOC 1 — 4h
- C2 : Validation miroir BLOC 2B — 4h
- C3 : Validation miroir BLOCS 3-9 — 6h
- C4 : Stockage nuances — 4h
- **Total** : **18 heures** (2.25 jours)

### Priorité 2 (FRAGILE)
- F1 : Unifier mapping — 1h
- F2 : Supprimer PREAMBULE_DONE — 0.5h
- F3 : Centraliser currentBlock — 2h
- F4 : Déduplication messages — 2h
- F5 : Gardes serveur — 2h
- **Total** : **7.5 heures** (1 jour)

### Priorité 3 (TESTS MANUELS)
- T1 : Ton mentor — 2h
- T2 : Adresse 2e personne — 2h
- T3 : Structure profil final — 2h
- T4 : Format matching — 3h
- **Total** : **9 heures** (1.125 jours)

**TOTAL GLOBAL** : **34.5 heures** (4.3 jours)

---

## 🎯 ORDRE STRICT D'EXÉCUTION

1. **C1** → Validation miroir BLOC 1
2. **C2** → Validation miroir BLOC 2B
3. **C3** → Validation miroir BLOCS 3-9
4. **C4** → Stockage nuances
5. **Tests** → Valider C1-C4
6. **F1-F5** → Améliorations qualité (en parallèle si possible)
7. **T1-T4** → Tests manuels (en parallèle si possible)

---

**FIN DU PLAN D'ACTION**
