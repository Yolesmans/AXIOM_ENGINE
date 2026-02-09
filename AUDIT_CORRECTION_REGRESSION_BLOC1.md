# 🔍 AUDIT DE CORRECTION — RÉGRESSION BLOC 1 (LECTURE SEULE)

**Date** : Audit en lecture seule, aucune modification  
**Objectif** : Identifier et documenter les causes des régressions fonctionnelles sur le BLOC 1  
**Statut** : Diagnostic complet, stratégies de correction proposées

---

## 1️⃣ CARTOGRAPHIE ACTUELLE (FACTUELLE)

### 1.1 Stockage des réponses BLOC 1

**Source de vérité** : `candidate.answerMaps[1].answers` (objet avec clés numériques string)

**Fichier** : `src/store/sessionStore.ts:616-665`

```typescript
storeAnswerForBlock(
  candidateId: string,
  blockNumber: number,
  questionIndex: number,  // ← cursorIndex - 1
  answer: string,
): AnswerMap {
  // answers[questionIndex] = answer
  const updatedAnswerMap: AnswerMap = {
    ...answerMap,
    answers: {
      ...answerMap.answers,
      [questionIndex]: answer,  // ← Clé numérique (string)
    },
  };
}
```

**Structure** : `answerMaps[1].answers = { "0": "réponse1", "1": "réponse2", "2": "réponse3" }`

**Moment de stockage** : `src/services/blockOrchestrator.ts:338-343`
- Après réception de `userMessage`
- Calcul de `questionIndex = currentQueue.cursorIndex - 1`
- **Avant** rechargement du candidate

**Problème potentiel** : Le `questionIndex` est calculé depuis `cursorIndex - 1`, mais le cursor est avancé **APRÈS** avoir servi la question (ligne 481). Donc :
- Question 0 servie → cursor = 1
- Réponse reçue → questionIndex = 1 - 1 = 0 ✅
- Question 1 servie → cursor = 2
- Réponse reçue → questionIndex = 2 - 1 = 1 ✅

**Conclusion** : Le calcul de `questionIndex` est **correct** si le cursor est bien avancé après avoir servi la question.

---

### 1.2 Génération du miroir BLOC 1

**Fichier** : `src/services/blockOrchestrator.ts:492-533`

**Source utilisée** : `candidate.answerMaps[1].answers`

```typescript
private async generateMirrorForBlock1(candidate: AxiomCandidate): Promise<string> {
  // Récupérer toutes les réponses du BLOC 1 depuis AnswerMap
  const answerMap = candidate.answerMaps?.[1];
  const answers = answerMap?.answers || {};  // ← Objet avec clés numériques

  // Construire le contexte des réponses
  const answersContext = Object.entries(answers)
    .map(([index, answer]) => `Question ${index}: ${answer}`)
    .join('\n');
  
  // ... génération miroir avec answersContext
}
```

**Moment de génération** : `src/services/blockOrchestrator.ts:361-366`
- Quand `finalQueue.cursorIndex >= finalQueue.questions.length`
- **Après** stockage de la dernière réponse
- **Avant** activation du verrou miroir

**Problème potentiel** : 
- Si `answers` est vide ou incomplet → `answersContext` sera vide ou partiel
- `Object.entries()` devrait fonctionner même avec des clés numériques string
- Mais si une réponse n'a pas été stockée (bug de stockage), elle ne sera pas dans le miroir

**Vérification nécessaire** : S'assurer que toutes les réponses sont bien stockées avant la génération du miroir.

---

### 1.3 Flux de validation miroir et transition BLOC 1 → BLOC 2A

**Fichier** : `src/services/blockOrchestrator.ts:160-330`

**Flux actuel** :

1. **Vérification verrou (lignes 160-207)** :
   ```typescript
   const mirrorValidated = candidate.session.ui?.mirrorValidated;
   if (mirrorValidated === false && userMessage) {
     if (isMirrorValidation(userMessage)) {  // ← "GO"
       // Lever le verrou
       candidateStore.updateUIState(candidate.candidateId, {
         mirrorValidated: true,
       });
       // Recharger candidate
       candidate = updatedCandidate;
       // CONTINUER le traitement (pas de return)
     } else {
       // Bloquer et renvoyer le même miroir
       return { response: lastMirror.content, ... };
     }
   }
   ```

2. **Vérification validation miroir (lignes 274-330)** :
   ```typescript
   // Si on arrive ici, c'est que le verrou a été levé (message === "GO")
   const allQuestionsAnswered = currentQueue.cursorIndex >= currentQueue.questions.length;
   const lastAssistantMessage = [...conversationHistory]
     .reverse()
     .find(m => m.role === 'assistant' && m.kind === 'mirror' && m.block === blockNumber);
   
   if (allQuestionsAnswered && lastAssistantMessage) {
     // Validation miroir → transition BLOC 2A
   }
   ```

**Problème identifié** : **DOUBLE VÉRIFICATION CRITIQUE**

- Le verrou vérifie `mirrorValidated === false && userMessage`
- Si `userMessage === "GO"`, le verrou est levé et le code continue
- **MAIS** : La vérification suivante (`allQuestionsAnswered && lastAssistantMessage`) peut être **fausse** si :
  - Le cursor n'est pas au bon endroit (problème de synchronisation)
  - Le miroir n'est pas trouvé dans `conversationHistory` (problème de timing)
- Si cette condition est fausse, on tombe dans le cas "Réponse à une question" (ligne 332), ce qui peut créer une boucle

**Scénario de boucle** :
1. Miroir généré → `mirrorValidated: false`
2. Utilisateur envoie "GO"
3. Verrou levé → `mirrorValidated: true`
4. Vérification `allQuestionsAnswered && lastAssistantMessage` → **FAUSSE** (pourquoi ?)
5. Code tombe dans "Réponse à une question"
6. Stocke "GO" comme réponse à une question (mauvais index)
7. Génère peut-être un nouveau miroir ou reboucle

---

## 2️⃣ ANALYSE DES RÉGRESSIONS

### 2.1 Pourquoi le miroir semble ne plus combiner toutes les réponses

**Hypothèse 1 : Réponses non stockées correctement**

**Cause possible** : Le `questionIndex` est calculé incorrectement ou le cursor n'est pas synchronisé.

**Preuve** :
- `questionIndex = currentQueue.cursorIndex - 1` (ligne 335)
- Le cursor est avancé **après** avoir servi la question (ligne 481)
- Si le cursor est avancé **avant** de stocker la réponse, il y a un décalage

**Vérification** : Logs Railway doivent montrer les valeurs de `cursorIndex` et `questionIndex` à chaque stockage.

**Hypothèse 2 : Réponses stockées mais non lues**

**Cause possible** : Le `answerMaps[1].answers` est vide ou incomplet au moment de la génération du miroir.

**Preuve** :
- `generateMirrorForBlock1` lit `candidate.answerMaps[1].answers` (ligne 497)
- Si `answers` est vide → `answersContext` sera vide
- Le miroir sera généré sans contexte de réponses

**Vérification** : Logs Railway doivent montrer le contenu de `answerMaps[1].answers` avant génération du miroir.

**Hypothèse 3 : Problème de timing / rechargement**

**Cause possible** : Le candidate est rechargé entre le stockage et la génération, et les réponses ne sont pas persistées.

**Preuve** :
- Stockage ligne 338 → Rechargement ligne 347
- Génération miroir ligne 366 → Utilise `currentCandidate` rechargé
- Si la persistance échoue, les réponses peuvent être perdues

**Vérification** : S'assurer que `persistCandidate()` est appelé après chaque `storeAnswerForBlock()`.

---

### 2.2 Pourquoi le flux peut reboucler sur le miroir après réponse

**Hypothèse 1 : Double vérification incohérente**

**Cause** : Le verrou est levé, mais la condition `allQuestionsAnswered && lastAssistantMessage` est fausse.

**Scénario** :
1. Miroir généré → `mirrorValidated: false`, `cursorIndex = 3` (3 questions)
2. Utilisateur envoie "GO"
3. Verrou levé → `mirrorValidated: true`
4. Rechargement candidate → `currentQueue.cursorIndex` peut être différent
5. `allQuestionsAnswered = currentQueue.cursorIndex >= 3` → **FAUX** si cursor < 3
6. Code tombe dans "Réponse à une question"
7. Stocke "GO" comme réponse → `questionIndex = cursorIndex - 1` (mauvais index)
8. Génère peut-être un nouveau miroir ou reboucle

**Preuve** : Le code vérifie `allQuestionsAnswered` **après** avoir levé le verrou, mais **avant** de vérifier si c'est vraiment une validation miroir.

**Hypothèse 2 : Verrou non réinitialisé après transition**

**Cause** : Le verrou reste actif même après transition vers BLOC 2A.

**Scénario** :
1. Miroir généré → `mirrorValidated: false`
2. Utilisateur envoie "GO"
3. Verrou levé → `mirrorValidated: true`
4. Transition BLOC 2A → `mirrorValidated: true` (ligne 297)
5. Si l'utilisateur envoie un autre message, le verrou n'est plus vérifié
6. Mais si le verrou n'est pas réinitialisé pour le prochain bloc, il peut rester actif

**Preuve** : Le verrou est mis à `true` lors de la transition (ligne 297), mais n'est jamais réinitialisé à `undefined` ou `false` pour les nouveaux blocs.

**Hypothèse 3 : Interaction avec normalisation response**

**Cause** : La normalisation peut affecter le contenu du miroir renvoyé.

**Preuve** :
- `normalizeSingleResponse(mirror)` est appelé ligne 389
- Si le miroir contient `---QUESTION_SEPARATOR---` (ne devrait pas arriver), il sera tronqué
- Mais le miroir ne devrait jamais contenir ce séparateur

**Conclusion** : La normalisation ne devrait pas affecter le miroir, mais elle est appliquée par précaution.

---

## 3️⃣ STRATÉGIES DE CORRECTION (SANS CODER)

### Stratégie 1 : Simplification et déplacement du verrou miroir

**Principe** : Déplacer la logique de validation miroir **après** la vérification `allQuestionsAnswered && lastAssistantMessage`, et simplifier le flux.

**Modifications proposées** :

1. **Supprimer la vérification verrou au début de `handleMessage`**
   - Retirer les lignes 160-207
   - Laisser uniquement la vérification `allQuestionsAnswered && lastAssistantMessage`

2. **Ajouter la vérification "GO" dans la condition de validation miroir**
   ```typescript
   if (allQuestionsAnswered && lastAssistantMessage) {
     // Vérifier si c'est une validation explicite
     if (isMirrorValidation(userMessage)) {
       // Validation miroir → transition
     } else {
       // Message ≠ "GO" → renvoyer le même miroir
       return { response: lastMirror.content, ... };
     }
   }
   ```

3. **Réinitialiser le verrou après transition**
   - Mettre `mirrorValidated: undefined` (ou ne pas le définir) après transition BLOC 2A

**Avantages** :
- ✅ Simplifie le flux (une seule vérification au lieu de deux)
- ✅ Élimine la double vérification incohérente
- ✅ Réduit les risques de boucle
- ✅ Plus facile à déboguer

**Risques** :
- ⚠️ Supprime le verrou global (mais il n'est utilisé que pour BLOC 1 et 2B)
- ⚠️ Nécessite de vérifier que le verrou n'est pas utilisé ailleurs

**Impact sur l'existant** :
- Modifie uniquement `blockOrchestrator.ts`
- Aucun impact sur les autres fichiers
- Compatible avec les autres blocs (3-9) qui n'utilisent pas le verrou

**Pourquoi SAFE** :
- Ne change pas la logique métier, seulement l'ordre des vérifications
- Élimine une source de bugs (double vérification)
- Plus simple = moins de bugs

---

### Stratégie 2 : Ajustement du moment de lecture des réponses

**Principe** : S'assurer que toutes les réponses sont bien stockées et persistées avant la génération du miroir.

**Modifications proposées** :

1. **Forcer la persistance avant génération du miroir**
   ```typescript
   // Stocker la réponse
   candidateStore.storeAnswerForBlock(...);
   
   // FORCER la persistance
   candidateStore.persistCandidate(candidateId);
   
   // Recharger candidate
   currentCandidate = candidateStore.get(candidateId);
   
   // Vérifier que toutes les réponses sont présentes
   const answerMap = currentCandidate.answerMaps?.[1];
   const answers = answerMap?.answers || {};
   const expectedCount = finalQueue.questions.length;
   const actualCount = Object.keys(answers).length;
   
   if (actualCount < expectedCount) {
     console.error('[ORCHESTRATOR] Missing answers', { expectedCount, actualCount });
     throw new Error(`Missing answers: expected ${expectedCount}, got ${actualCount}`);
   }
   
   // Générer le miroir
   const mirror = await this.generateMirrorForBlock1(currentCandidate);
   ```

2. **Ajouter des logs de débogage**
   - Logger `answerMaps[1].answers` avant génération du miroir
   - Logger `answersContext` construit
   - Logger le nombre de réponses attendues vs réelles

**Avantages** :
- ✅ Garantit que toutes les réponses sont présentes
- ✅ Détecte les problèmes de persistance
- ✅ Facilite le débogage

**Risques** :
- ⚠️ Peut casser si une réponse est manquante (mais c'est le comportement attendu)
- ⚠️ Nécessite de gérer les erreurs de persistance

**Impact sur l'existant** :
- Ajoute des vérifications, mais ne change pas la logique
- Compatible avec l'existant

**Pourquoi SAFE** :
- Ne change pas la logique, seulement ajoute des garde-fous
- Détecte les problèmes plutôt que de les masquer

---

### Stratégie 3 : Changement de source de vérité pour le miroir (HYBRIDE)

**Principe** : Utiliser `conversationHistory` comme source de vérité au lieu de `answerMaps`, car il est plus fiable et contient déjà toutes les réponses utilisateur.

**Modifications proposées** :

1. **Lire les réponses depuis `conversationHistory`**
   ```typescript
   private async generateMirrorForBlock1(candidate: AxiomCandidate): Promise<string> {
     // Lire les réponses depuis conversationHistory (plus fiable)
     const conversationHistory = candidate.conversationHistory || [];
     const block1UserMessages = conversationHistory
       .filter(m => m.role === 'user' && m.block === 1 && m.kind !== 'mirror_validation')
       .map(m => m.content);
     
     // Construire le contexte
     const answersContext = block1UserMessages
       .map((answer, index) => `Question ${index}: ${answer}`)
       .join('\n');
     
     // ... génération miroir
   }
   ```

2. **Garder `answerMaps` comme backup**
   - Si `conversationHistory` est vide, utiliser `answerMaps`
   - Logger un warning si les deux sources diffèrent

**Avantages** :
- ✅ `conversationHistory` est plus fiable (déjà utilisé pour le contexte LLM)
- ✅ Contient toutes les réponses dans l'ordre chronologique
- ✅ Moins de risques de perte de données

**Risques** :
- ⚠️ Peut inclure des messages non pertinents (mais filtrable par `block === 1`)
- ⚠️ Nécessite de filtrer les validations miroir (`kind !== 'mirror_validation'`)

**Impact sur l'existant** :
- Change la source de vérité, mais garde `answerMaps` comme backup
- Compatible avec l'existant

**Pourquoi SAFE** :
- Utilise une source de données déjà fiable
- Garde un fallback si la nouvelle source échoue
- Plus robuste que `answerMaps` seul

---

## 4️⃣ RECOMMANDATION FINALE

### Approche recommandée : **Stratégie 1 + Stratégie 2 (hybride)**

**Pourquoi cette combinaison** :

1. **Stratégie 1** élimine la cause racine de la boucle (double vérification incohérente)
2. **Stratégie 2** garantit que toutes les réponses sont présentes avant génération du miroir
3. Les deux stratégies sont complémentaires et ne se chevauchent pas

**Plan d'implémentation** :

1. **Phase 1 : Simplification du verrou (Stratégie 1)**
   - Supprimer la vérification verrou au début de `handleMessage`
   - Déplacer la vérification "GO" dans la condition `allQuestionsAnswered && lastAssistantMessage`
   - Réinitialiser le verrou après transition

2. **Phase 2 : Vérification des réponses (Stratégie 2)**
   - Ajouter vérification du nombre de réponses avant génération du miroir
   - Ajouter logs de débogage
   - Forcer la persistance si nécessaire

3. **Phase 3 : Optionnel — Source de vérité (Stratégie 3)**
   - Si les problèmes persistent, implémenter la lecture depuis `conversationHistory`
   - Garder `answerMaps` comme backup

**Invariants AXIOM respectés** :

- ✅ **Séquentialité stricte** : 1 question à la fois, pas de changement
- ✅ **Validation miroir obligatoire** : Toujours requise avant progression
- ✅ **Pas de perte de données** : Toutes les réponses doivent être présentes
- ✅ **Contrat backend→frontend** : 1 requête = 1 message maximum

**Risques minimisés** :

- ✅ Pas de changement de logique métier, seulement simplification
- ✅ Ajout de garde-fous plutôt que modification de comportement
- ✅ Compatible avec l'existant (autres blocs non affectés)
- ✅ Facile à rollback si problème

---

## 5️⃣ POINTS DE VIGILANCE

### À vérifier avant implémentation

1. **Logs Railway** : Vérifier les valeurs exactes de `cursorIndex`, `questionIndex`, et `answerMaps[1].answers` lors des bugs
2. **Timing** : Vérifier si le problème vient d'un problème de timing (rechargement, persistance)
3. **Autres blocs** : Vérifier que le verrou n'est pas utilisé ailleurs (BLOC 2B, 3-9)

### Tests de validation

1. **Test complet BLOC 1** : Répondre à toutes les questions, vérifier que le miroir contient toutes les réponses
2. **Test validation miroir** : Envoyer "GO", vérifier la transition vers BLOC 2A
3. **Test boucle** : Envoyer un message ≠ "GO" après le miroir, vérifier qu'il est bloqué
4. **Test persistance** : Refresh après avoir répondu, vérifier que les réponses sont toujours présentes

---

**FIN DE L'AUDIT — AUCUNE MODIFICATION EFFECTUÉE**
