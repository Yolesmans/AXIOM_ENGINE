# Audit structurel — BLOC 2A (dernière question libre non traitée)

**Date** : 2025-02-10  
**Contexte** : Bug 2A.1 en boucle corrigé. Nouveau problème : réponse à 2A.3 (ex. "Harry Potter") → aucun retour (pas de miroir, pas de transition 2B, pas d’évolution visible).  
**Contrainte** : Aucune modification de code ; analyse uniquement.

---

## 1. Vérifications demandées dans handleBlock2A

### 1.1 Réponse à questionIndex === 2 stockée via storeAnswerForBlock

**Fichier** : `src/services/blockOrchestrator.ts`, méthode `handleBlock2A`.

- **Cas 2** (l.642) : `if (userMessage)` → on entre bien dans le traitement du message.
- **questionIndex** (l.644) : `const questionIndex = answeredCount;`  
  Pour la 3e réponse, `answeredCount === 2` (déjà 2 réponses stockées) → **questionIndex === 2**. ✓
- **Branche questionIndex === 0** (l.646–658) : réservée à la 2A.1 (normalisation Série/Film).
- **Branche else** (l.659–661) : pour toute autre question (dont 2A.3) :
  ```ts
  candidateStore.storeAnswerForBlock(candidateId, blockNumber, questionIndex, userMessage);
  ```
  Donc la réponse à la question 2A.3 (questionIndex 2) est bien **stockée** via `storeAnswerForBlock(candidateId, 2, 2, userMessage)`. ✓

**Conclusion** : Oui, la réponse à la dernière question 2A (questionIndex === 2) est bien enregistrée via `storeAnswerForBlock`.

---

### 1.2 updatedAnsweredCount passe bien à 3 après stockage

- **Rechargement** (l.663–670) : après `storeAnswerForBlock`, rechargement du candidat depuis le store.
- **Lecture** (l.672–674) :
  ```ts
  const updatedAnswerMap = currentCandidate.answerMaps?.[blockNumber];
  const updatedAnswers = updatedAnswerMap?.answers || {};
  const updatedAnsweredCount = Object.keys(updatedAnswers).length;
  ```
- **Store** (`sessionStore.ts` l.640–645) : `answers` est un objet avec clés `questionIndex` (0, 1, 2). Après stockage de l’index 2, on a bien `answers = { 0: ..., 1: ..., 2: ... }` → `Object.keys(updatedAnswers).length === 3`. ✓

**Conclusion** : Oui, après stockage de la 3e réponse, `updatedAnsweredCount` vaut bien 3.

---

### 1.3 La condition `updatedAnsweredCount === 3` est atteinte

- **Ordre des tests** (l.682–738) :
  - `if (updatedAnsweredCount === 1)` → retour 2A.2 (l.683–706)
  - `if (updatedAnsweredCount === 2)` → retour 2A.3 (l.709–731)
  - `if (updatedAnsweredCount === 3)` → transition 2B (l.734–738)
- Pour la 3e réponse, on ne rentre ni dans 1 ni dans 2, on rentre dans le bloc **3** (l.733–738) :
  ```ts
  if (updatedAnsweredCount === 3) {
    console.log('[ORCHESTRATOR] BLOC 2A terminé → transition automatique vers BLOC 2B');
    return this.handleBlock2B(currentCandidate, null, null, onChunk, onUx);
  }
  ```
  La condition est donc **atteinte** et la transition vers 2B est **appelée**. ✓

**Conclusion** : Oui, la condition est atteinte et `handleBlock2B` est bien invoqué.

---

### 1.4 La transition vers BLOC 2B est-elle effectivement exécutée ?

- **Appel** : `return this.handleBlock2B(currentCandidate, null, null, onChunk, onUx);`  
  Donc 2B est bien **entré** avec le candidat mis à jour (3 réponses en answerMaps[2]), sans message utilisateur (`userMessage = null`).
- **À l’intérieur de handleBlock2B** (l.961–1001) :
  - Vérification du contexte 2A : `answerMap = currentCandidate.answerMaps?.[2]`, `answers[0]`, `answers[1]`, `answers[2]` (medium, préférences, œuvre noyau).
  - Si une de ces valeurs manque → `throw new Error('BLOC 2A data incomplete. Cannot proceed to BLOC 2B.')`.
  - **Parser les 3 œuvres** (l.996–1001) :
    ```ts
    const works = this.parseWorks(preferencesAnswer);
    if (works.length < 3) {
      console.error('[ORCHESTRATOR] [2B_CONTEXT_INJECTION] forced=false - Less than 3 works found');
      throw new Error(`Expected 3 works, found ${works.length}. Cannot proceed to BLOC 2B.`);
    }
    ```
  - `parseWorks` (l.1164–1172) : `preferencesAnswer.split(/[,\n]/).map(trim).filter(length>0).slice(0,3)`.
  - Si la réponse à **2A.2** (préférences) n’est pas au format « au moins 3 éléments séparés par virgule ou retour à la ligne », `works.length` peut être **< 3** → **exception** avant tout retour.

Donc la transition **est exécutée** (on entre dans handleBlock2B), mais **handleBlock2B peut lever une exception** avant de renvoyer un résultat. Si c’est le cas, il n’y a pas de « transition visible » côté front car le serveur ne renvoie pas de `done` avec une réponse.

**Conclusion** : La transition est bien déclenchée ; l’échec observé (« aucune évolution ») vient très probablement d’une **exception dans handleBlock2B** (ex. `works.length < 3`), pas d’un défaut du flux 2A (stockage / compteur / appel 2B).

---

### 1.5 Aucun early return ne coupe le flux après stockage (pour updatedAnsweredCount === 3)

- Après le stockage (l.661), les seuls retours possibles dans le bloc `if (userMessage)` sont :
  - `updatedAnsweredCount === 1` → return 2A.2
  - `updatedAnsweredCount === 2` → return 2A.3
  - `updatedAnsweredCount === 3` → return handleBlock2B(...)
- Il n’y a pas de `return` entre le stockage et ces trois branches. Pour la 3e réponse, on va directement à la branche `updatedAnsweredCount === 3` et on retourne **le résultat** de `handleBlock2B`. Aucun early return ne coupe le flux entre stockage et transition. ✓

**Conclusion** : Non, aucun early return ne coupe le flux après stockage pour le cas « 3 réponses ».

---

### 1.6 Le payload retourné par handleBlock2A contient-il un response non vide ?

- Pour `updatedAnsweredCount === 3`, handleBlock2A ne construit **pas** elle-même le payload : elle fait `return this.handleBlock2B(...)`. Le payload vu par l’appelant est donc **celui retourné par handleBlock2B**.
- Si handleBlock2B **retourne** normalement (première question 2B via `serveNextQuestion2B`), le payload a bien un `response` non vide.
- Si handleBlock2B **lève une exception** (ex. `works.length < 3`), handleBlock2A ne retourne jamais ; l’exception remonte au serveur. Le serveur (l.1538–1564) ne capture que les erreurs dont le message contient `"BLOC 2B validation failed"` ; les autres sont re-throw. Au niveau route (l.1706), on envoie alors un événement **error** et on ferme le flux **sans** envoyer de `done` avec `response`. Le front reçoit donc un **error** et pas de `data.response` → « aucun retour » côté UI.

**Conclusion** : Structurellement, handleBlock2A ne fait que déléguer à handleBlock2B. Si handleBlock2B lève une exception, il n’y a pas de payload « response » renvoyé au client ; c’est cohérent avec le symptôme « pas d’évolution visible ».

---

### 1.7 session.currentBlock est-il correctement mis à jour ?

- Dans **handleBlock2A** : aucune mise à jour de `session.currentBlock` lors de la transition 2A → 2B. On se contente d’appeler `handleBlock2B`.
- Dans **handleBlock2B** : `currentBlock` n’est mis à jour qu’à la **validation du miroir 2B** (l.1082–1085), lors du passage au BLOC 3. Tant qu’on est en train de poser les questions 2B, on reste en `currentBlock === 2`. Donc après transition 2A → 2B, `currentBlock` reste 2 jusqu’à la fin du bloc 2B ; c’est cohérent avec le modèle « bloc 2 = 2A + 2B ».
- Si handleBlock2B **throw** avant d’avoir retourné quoi que ce soit, on ne modifie pas le candidat ni la session ; l’état reste celui d’après stockage 2A.3 (toujours en bloc 2, 3 réponses stockées). Aucune incohérence supplémentaire sur currentBlock dans ce scénario.

**Conclusion** : Oui, dans le flux nominal (2B retourne sans erreur), `currentBlock` reste 2 pendant 2B puis passe à 3 à la validation miroir. En cas d’exception dans 2B, currentBlock n’est pas modifié, ce qui est cohérent avec l’absence de transition effective.

---

## 2. Synthèse : pattern « message → stockage → compteur → transition »

Dans **handleBlock2A** le pattern est correct et fiable pour les trois questions :

| Étape | questionIndex 0 (2A.1) | questionIndex 1 (2A.2) | questionIndex 2 (2A.3) |
|-------|------------------------|------------------------|-------------------------|
| Stockage | storeAnswerForBlock(..., 0, valueToStore) | storeAnswerForBlock(..., 1, userMessage) | storeAnswerForBlock(..., 2, userMessage) |
| Rechargement | oui | oui | oui |
| updatedAnsweredCount | 1 | 2 | 3 |
| Suite | Génération 2A.2, return | Génération 2A.3, return | **Appel handleBlock2B**, return son résultat |

Aucune branche ne court-circuite le stockage pour la 3e réponse ; la transition 2A → 2B est bien déclenchée lorsque `updatedAnsweredCount === 3`.

---

## 3. Cause probable de « aucun retour » après réponse à 2A.3

Le bloc 2A fait bien : stockage 2A.3 → compteur à 3 → appel `handleBlock2B(currentCandidate, null, null, ...)`.  
L’échec visible (« pas de miroir, pas de transition, pas d’évolution ») vient très probablement **d’une exception dans handleBlock2B** avant qu’il ne renvoie une réponse.

Point critique dans **handleBlock2B** (l.996–1001) :

- `preferencesAnswer = answers[1]` = la réponse **libre** à la question 2A.2 (préférences).
- `works = this.parseWorks(preferencesAnswer)` : découpage par `,` ou `\n`, puis trim, filtre non vides, `slice(0, 3)`.
- Si l’utilisateur a répondu à 2A.2 en une phrase ou avec un format qui ne donne pas au moins 3 segments (ex. « J’aime les séries policières », ou « A. Breaking Bad B. Dark C. Squid Game » sans virgules), alors **works.length < 3** → **throw** `Expected 3 works, found X. Cannot proceed to BLOC 2B.`

Comportement serveur lorsque cette erreur est levée :

- Le `catch` (l.1540) ne matche que `"BLOC 2B validation failed"` → l’erreur est **re-throw**.
- Le catch global de la route envoie un événement **error** et termine le flux **sans** envoyer d’événement **done** avec une réponse.
- Le front reçoit donc une erreur et pas de `data.response` → aucun nouveau message, aucune transition affichée.

Cela explique le symptôme sans remettre en cause le pattern 2A (message → stockage → compteur → transition).

---

## 4. Recommandations (sans modification de code dans ce document)

1. **Vérifier les logs serveur** : après une réponse à 2A.3, chercher une exception du type `Expected 3 works, found X` ou `BLOC 2A data incomplete` / `BLOC 2A answers not found`. Si présente, elle confirme que l’échec est dans handleBlock2B (contexte 2A ou parsing des œuvres).
2. **Robustesse 2B à l’entrée** : le contrat actuel exige **exactement** 3 œuvres parsées depuis la réponse libre 2A.2. Pour un format libre, soit assouplir le parsing (ex. accepter 1 ou 2 œuvres, ou extraire jusqu’à 3 éléments d’une phrase), soit guider davantage la question 2A.2 pour obtenir un format « 3 éléments séparés par virgule/newline », soit traiter explicitement le cas `works.length < 3` (message utilisateur clair + pas de throw fatal).
3. **Cohérence du pattern** : le pattern dans handleBlock2A (message → store → reload → compteur → branche 1/2/3 → transition si 3) est structurellement fiable pour toutes les questions 2A. La suite à sécuriser est l’**entrée** de handleBlock2B (prérequis sur answerMaps et format de `answers[1]`) pour qu’une réponse valide à 2A.3 mène toujours à un retour exploitable (première question 2B ou message d’erreur explicite) plutôt qu’à une exception non gérée côté stream.

---

## 5. Tableau récapitulatif

| Point | Statut | Commentaire |
|-------|--------|-------------|
| 1) Réponse questionIndex 2 stockée via storeAnswerForBlock | ✓ | else (l.659–661) appelle bien storeAnswerForBlock(candidateId, 2, 2, userMessage). |
| 2) updatedAnsweredCount passe à 3 après stockage | ✓ | Object.keys(updatedAnswers).length === 3 après rechargement. |
| 3) Condition updatedAnsweredCount === 3 atteinte | ✓ | Branche l.734–738 exécutée, handleBlock2B appelé. |
| 4) Transition vers 2B exécutée | ✓ partiel | 2B est bien **entré** ; l’absence de retour visible vient d’une **exception dans 2B** (ex. works.length < 3). |
| 5) Aucun early return ne coupe le flux après stockage | ✓ | Aucun return entre stockage et la branche updatedAnsweredCount === 3. |
| 6) Payload avec response non vide | Dépend de 2B | handleBlock2A retourne le résultat de handleBlock2B ; si 2B throw, pas de payload → flux error côté serveur. |
| 7) session.currentBlock correct | ✓ | Pas de mise à jour dans 2A ; 2B ne met à jour qu’à la validation miroir (passage au bloc 3). Comportement cohérent. |

**Conclusion** : Le pattern « message → stockage → compteur mis à jour → transition » est **structurellement fiable** dans handleBlock2A pour toutes les questions 2A, y compris la dernière (2A.3). La cause du « aucun retour » après une réponse valide à 2A.3 est très probablement une **exception dans handleBlock2B** au moment de l’entrée (ex. parsing des 3 œuvres depuis la réponse libre 2A.2), et non un défaut de ce pattern dans le bloc 2A.
