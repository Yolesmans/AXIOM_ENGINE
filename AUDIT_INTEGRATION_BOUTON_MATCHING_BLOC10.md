# 🔍 AUDIT — INTÉGRATION BOUTON MATCHING (FIN BLOC 10)
## LECTURE SEULE — AUCUNE MODIFICATION DE CODE

**Date** : 2025-01-27  
**Version** : AXIOM actuelle (figée)  
**Objectif** : Identifier la meilleure manière d'intégrer un bouton explicite "Découvrir mon matching" à la fin du BLOC 10

---

## 1. MOMENT EXACT DU CTA

### 1.1 Fin stricte du BLOC 10

**Fichier** : `src/engine/axiomExecutor.ts` (lignes 1858-1876)

**Détection actuelle** :
```typescript
} else if (!expectsAnswer && blocNumber === 10) {
  // Fin du bloc 10 → générer synthèse et passer à match_ready
  // TODO: Générer synthèse finale
  nextState = STEP_99_MATCH_READY;
  candidateStore.setFinalProfileText(candidate.candidateId, aiText);
}
```

**Comportement** :
- Détection : `!expectsAnswer && blocNumber === 10`
- Transition automatique : `nextState = STEP_99_MATCH_READY`
- Stockage : `setFinalProfileText()` (synthèse finale)

**⚠️ PROBLÈME IDENTIFIÉ** : Le message "Profil terminé. Quand tu es prêt, génère ton matching." est concaténé avec la synthèse finale (ligne 1935), ce qui peut noyer le CTA.

**Point d'insertion possible #1** : **Après la synthèse finale, dans un message séparé**
- **Avantage** : CTA visible et distinct
- **Risque** : Deux messages successifs (synthèse + CTA) peuvent créer une confusion

### 1.2 Après le dernier miroir BLOC 10

**Analyse** : Le BLOC 10 ne produit PAS de miroir REVELIOM (format 20/25 mots). Il produit une synthèse finale complète.

**Point d'insertion possible #2** : **Dans le message de transition STEP_99_MATCH_READY**
- **Avantage** : Message unique, clair
- **Risque** : Le message actuel "Profil terminé. Quand tu es prêt, génère ton matching." est peut-être trop discret

### 1.3 Via `expectsAnswer` / `autoContinue` / `step`

**État actuel** :
- `step: STEP_99_MATCH_READY` (ligne 1947)
- `expectsAnswer: false` (ligne 1949)
- `autoContinue: false` (ligne 1950)

**Détection frontend** :
```javascript
else if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false) {
  showStartButton = true;
  displayMatchingButton();
}
```

**✅ CONCLUSION** : Le signal backend est correct (`STEP_99_MATCH_READY` + `expectsAnswer: false`). Le frontend détecte correctement.

**Point d'insertion possible #3** : **Le bouton est déjà affiché, mais peut-être pas assez visible**
- **Avantage** : Logique déjà en place
- **Risque** : Le bouton peut être noyé dans le message texte ou affiché trop tard

### 1.4 Après validation implicite

**Analyse** : Il n'y a PAS de validation explicite du BLOC 10. La transition est automatique après la synthèse finale.

**Point d'insertion possible #4** : **Immédiatement après la synthèse finale, avant tout autre message**
- **Avantage** : CTA visible dès la fin du parcours
- **Risque** : Peut interrompre la lecture de la synthèse

---

## 2. FORME DU CTA

### 2.1 Bouton frontend pur (option actuelle)

**Fichier** : `ui-test/app.js` (lignes 236-265)

**Comportement actuel** :
```javascript
function displayMatchingButton() {
  const messagesContainer = document.getElementById('messages');
  let buttonContainer = document.getElementById('mvp-matching-button-container');
  if (!buttonContainer) {
    buttonContainer = document.createElement('div');
    buttonContainer.id = 'mvp-matching-button-container';
    buttonContainer.className = 'mvp-start-button';
    messagesContainer.appendChild(buttonContainer);
  }
  buttonContainer.innerHTML = `
    <button id="mvp-matching-button" type="button">
      👉 Je génère mon matching
    </button>
  `;
  // Gestionnaire de clic
  matchingButton.addEventListener('click', async () => {
    matchingButton.disabled = true;
    await callAxiom(null, 'START_MATCHING');
  });
}
```

**Avantages** :
- ✅ Bouton visible et cliquable
- ✅ Désactivation après clic (évite double-clic)
- ✅ Style cohérent avec bouton "Je commence mon profil"

**Risques** :
- ⚠️ Le bouton peut être créé plusieurs fois si `displayMatchingButton()` est appelé plusieurs fois
- ⚠️ Le bouton n'est pas affiché si le frontend ne détecte pas `STEP_99_MATCH_READY` (ex: refresh)

### 2.2 Message assistant + bouton

**Option** : Le backend envoie un message assistant explicite "Ton profil est terminé. Découvre ton matching :" suivi du bouton frontend.

**Avantages** :
- ✅ Message contextuel clair
- ✅ CTA intégré dans le flux conversationnel

**Risques** :
- ⚠️ Nécessite modification du prompt (interdit)
- ⚠️ Peut créer une redondance avec le message "Profil terminé. Quand tu es prêt, génère ton matching."

### 2.3 Bouton injecté par le front ou signalé par le backend

**Option actuelle** : **Bouton injecté par le frontend** (détection `step === 'STEP_99_MATCH_READY'`)

**Alternative** : **Bouton signalé par le backend** (nouveau champ `showMatchingButton: true` dans la réponse API)

**Avantages backend signal** :
- ✅ Plus explicite et traçable
- ✅ Moins de logique frontend conditionnelle

**Risques backend signal** :
- ⚠️ Nécessite modification du contrat API
- ⚠️ Peut créer une incohérence avec `showStartButton` (qui est géré côté frontend)

### 2.4 Gestion du refresh / reprise de session

**Problème identifié** : Le `/start` endpoint ne retourne pas `step` dans la réponse.

**Fichier** : `src/routes/start.ts` (lignes 72-79)

**Code actuel** :
```typescript
return reply.send({
  sessionId: finalSessionId,
  state: responseState,
  currentBlock: candidate.session.currentBlock,
  response: result.response,
  expectsAnswer: result.expectsAnswer,
  autoContinue: result.autoContinue,
  // ❌ step n'est PAS retourné
});
```

**Impact** : Si l'utilisateur refresh à `STEP_99_MATCH_READY`, le frontend ne peut pas détecter l'état et n'affiche pas le bouton.

**✅ CONCLUSION** : Le `/start` endpoint doit retourner `step` pour permettre la reprise de session.

---

## 3. SIGNAL DE DÉCLENCHEMENT MATCHING

### 3.1 Message utilisateur dédié (ex: "GO_MATCHING")

**Option** : Le candidat tape "GO_MATCHING" ou "Je veux mon matching" dans le champ de saisie.

**Avantages** :
- ✅ Déclenchement explicite et volontaire
- ✅ Traçable dans `conversationHistory`

**Risques** :
- ⚠️ Nécessite que le champ de saisie soit actif (actuellement masqué à `STEP_99_MATCH_READY`)
- ⚠️ Peut créer une confusion UX (pourquoi taper du texte au lieu de cliquer un bouton ?)

### 3.2 Event frontend spécifique (option actuelle)

**Fichier** : `ui-test/app.js` (ligne 262)

**Comportement actuel** :
```javascript
matchingButton.addEventListener('click', async () => {
  matchingButton.disabled = true;
  await callAxiom(null, 'START_MATCHING');
});
```

**Backend** : `src/engine/axiomExecutor.ts` (lignes 1980-2009)

**Détection** :
```typescript
if (currentState === STEP_99_MATCH_READY) {
  if (!userMessage && !event) {
    return { response: 'Profil terminé...' };
  }
  // Passer à matching
  currentState = STEP_99_MATCHING;
  // ...
}
```

**✅ CONCLUSION** : L'event `START_MATCHING` est correctement propagé et détecté.

**Avantages** :
- ✅ Déclenchement volontaire (clic bouton)
- ✅ Traçable (event dans les logs)
- ✅ Irréversible (transition vers `STEP_99_MATCHING`)

**Risques** :
- ⚠️ Aucun risque identifié (logique correcte)

### 3.3 Step terminal spécifique

**Option** : Le backend retourne `step: STEP_99_MATCH_READY` avec un flag `matchingAvailable: true`.

**Avantages** :
- ✅ Signal explicite et traçable
- ✅ Séparation claire parcours / matching

**Risques** :
- ⚠️ Nécessite modification du contrat API
- ⚠️ Redondant avec `step === 'STEP_99_MATCH_READY'`

### 3.4 Séparation stricte parcours / matching

**État actuel** :
- **Parcours** : `BLOC_01` → `BLOC_10` → `STEP_99_MATCH_READY`
- **Matching** : `STEP_99_MATCHING` → `DONE_MATCHING`

**✅ CONCLUSION** : La séparation est déjà stricte. Le matching ne peut pas être déclenché avant `STEP_99_MATCH_READY`.

---

## 4. ORCHESTRATION BACKEND

### 4.1 Où doit vivre la logique de transition ?

**Option actuelle** : `executeAxiom()` dans `src/engine/axiomExecutor.ts`

**Logique actuelle** :
1. Fin BLOC 10 → `nextState = STEP_99_MATCH_READY` (ligne 1875)
2. Si `nextState === STEP_99_MATCH_READY` → Concaténation message + transition (ligne 1934)
3. Si `currentState === STEP_99_MATCH_READY` → Attente event `START_MATCHING` (ligne 1980)

**✅ CONCLUSION** : La logique est centralisée dans `executeAxiom()`, ce qui est cohérent.

**Alternative** : `blockOrchestrator.ts` pour BLOC 10
- **Avantage** : Cohérence avec BLOC 1, 2A, 2B
- **Risque** : BLOC 10 est géré par `executeAxiom()`, pas par l'orchestrateur

### 4.2 blockOrchestrator vs axiomExecutor

**État actuel** :
- **BLOC 1, 2A, 2B** : Gérés par `BlockOrchestrator` (`src/services/blockOrchestrator.ts`)
- **BLOCS 3-10** : Gérés par `executeAxiom()` (`src/engine/axiomExecutor.ts`)

**BLOC 10** : Géré par `executeAxiom()` (ligne 1873)

**✅ CONCLUSION** : Pas de changement nécessaire. BLOC 10 reste dans `executeAxiom()`.

### 4.3 Comment garantir qu'on ne peut PAS matcher avant la fin ?

**Vérifications actuelles** :
1. **Transition BLOC 10 → STEP_99_MATCH_READY** : Uniquement si `blocNumber === 10` ET `!expectsAnswer` (ligne 1873)
2. **Déclenchement matching** : Uniquement si `currentState === STEP_99_MATCH_READY` ET `event === 'START_MATCHING'` (ligne 1980)

**✅ CONCLUSION** : Les verrous sont corrects. Le matching ne peut pas être déclenché avant la fin du BLOC 10.

**Renforcement possible** : Vérifier `currentBlock === 10` avant de permettre `STEP_99_MATCH_READY`
- **Avantage** : Double sécurité
- **Risque** : Redondant (le bloc 10 est déjà vérifié)

### 4.4 Comment garantir qu'on ne peut PAS matcher deux fois ?

**Vérifications actuelles** :
1. **Transition STEP_99_MATCH_READY → STEP_99_MATCHING** : Uniquement si `event === 'START_MATCHING'` (ligne 1994)
2. **Transition STEP_99_MATCHING → DONE_MATCHING** : Automatique après génération (ligne 2071)
3. **État DONE_MATCHING** : Retourne réponse vide, pas de transition (ligne 2100)

**✅ CONCLUSION** : Les verrous sont corrects. Le matching ne peut pas être déclenché deux fois.

**Renforcement possible** : Vérifier `currentState !== STEP_99_MATCHING && currentState !== DONE_MATCHING` avant de permettre `STEP_99_MATCH_READY`
- **Avantage** : Protection supplémentaire
- **Risque** : Redondant (les transitions sont déjà strictes)

---

## 5. ORCHESTRATION FRONTEND

### 5.1 Comment afficher le bouton UNE SEULE FOIS

**Code actuel** : `ui-test/app.js` (lignes 236-265)

**Protection actuelle** :
```javascript
let buttonContainer = document.getElementById('mvp-matching-button-container');
if (!buttonContainer) {
  buttonContainer = document.createElement('div');
  // ...
}
```

**✅ CONCLUSION** : La protection existe (vérification `getElementById` avant création).

**Risque résiduel** : Si `displayMatchingButton()` est appelé plusieurs fois, le `innerHTML` peut écraser le gestionnaire de clic.

**Renforcement possible** : Vérifier `showStartButton === true` avant d'appeler `displayMatchingButton()`
- **Avantage** : Évite les appels multiples
- **Risque** : Peut empêcher l'affichage si le flag n'est pas correctement initialisé

### 5.2 Comment éviter les doubles clics

**Code actuel** : `ui-test/app.js` (lignes 260-263)

**Protection actuelle** :
```javascript
matchingButton.addEventListener('click', async () => {
  matchingButton.disabled = true; // ✅ Désactivation immédiate
  await callAxiom(null, 'START_MATCHING');
});
```

**✅ CONCLUSION** : La protection existe (désactivation immédiate du bouton).

**Risque résiduel** : Si l'appel API échoue, le bouton reste désactivé.

**Renforcement possible** : Réactiver le bouton en cas d'erreur API
- **Avantage** : Permet de réessayer
- **Risque** : Peut permettre un double déclenchement si l'erreur est côté réseau mais que le backend a bien reçu l'event

### 5.3 Comment gérer reload / retour arrière

**Problème identifié** : Le `/start` endpoint ne retourne pas `step` dans la réponse.

**Fichier** : `src/routes/start.ts` (lignes 72-79)

**Code actuel** :
```typescript
return reply.send({
  sessionId: finalSessionId,
  state: responseState,
  currentBlock: candidate.session.currentBlock,
  response: result.response,
  expectsAnswer: result.expectsAnswer,
  autoContinue: result.autoContinue,
  // ❌ step manquant
});
```

**Impact** :
- Si l'utilisateur refresh à `STEP_99_MATCH_READY`, le frontend reçoit `data.response` mais pas `data.step`
- Le frontend ne peut pas détecter `STEP_99_MATCH_READY` et n'affiche pas le bouton

**✅ CONCLUSION** : Le `/start` endpoint doit retourner `step` pour permettre la reprise de session.

**Correction nécessaire** :
```typescript
return reply.send({
  sessionId: finalSessionId,
  state: responseState,
  currentBlock: candidate.session.currentBlock,
  response: result.response,
  step: result.step, // ← Ajouter
  expectsAnswer: result.expectsAnswer,
  autoContinue: result.autoContinue,
});
```

### 5.4 Comment éviter toute ambiguïté UX

**Problèmes identifiés** :

1. **Message texte concaténé** : "Profil terminé. Quand tu es prêt, génère ton matching." est concaténé avec la synthèse finale (ligne 1935), ce qui peut noyer le CTA.

2. **Bouton non affiché au refresh** : Si l'utilisateur refresh, le bouton n'est pas affiché car `step` n'est pas retourné par `/start`.

3. **Champ de saisie masqué** : À `STEP_99_MATCH_READY`, `expectsAnswer: false` donc le champ de saisie est masqué. L'utilisateur ne peut que cliquer le bouton (correct, mais peut créer une confusion si le bouton n'est pas visible).

**✅ CONCLUSION** : Les problèmes sont identifiés. Les corrections nécessaires sont :
1. Séparer le message CTA de la synthèse finale
2. Retourner `step` dans `/start`
3. S'assurer que le bouton est toujours visible à `STEP_99_MATCH_READY`

---

## 6. INVARIANTS À RESPECTER (NON NÉGOCIABLES)

### 6.1 Les prompts ne bougent pas

**✅ CONFIRMATION** : Aucune modification des prompts nécessaire. Le CTA est géré par le code, pas par les prompts.

### 6.2 Le matching n'est JAMAIS automatique

**Vérification** :
- Transition `STEP_99_MATCH_READY` → `STEP_99_MATCHING` : Uniquement si `event === 'START_MATCHING'` (ligne 1994)
- Aucun `autoContinue: true` à `STEP_99_MATCH_READY` (ligne 1989)

**✅ CONFIRMATION** : Le matching est strictement volontaire (event `START_MATCHING` requis).

### 6.3 Le candidat choisit explicitement

**Vérification** :
- Le bouton nécessite un clic explicite (ligne 260)
- L'event `START_MATCHING` est envoyé uniquement au clic (ligne 262)

**✅ CONFIRMATION** : Le choix est explicite (clic bouton).

### 6.4 Le moteur reste séquentiel

**Vérification** :
- `STEP_99_MATCH_READY` est un état terminal (pas de transition automatique)
- `STEP_99_MATCHING` est un état terminal (pas de transition automatique)
- `DONE_MATCHING` est un état terminal (pas de transition automatique)

**✅ CONFIRMATION** : Le moteur reste séquentiel (pas de boucle, pas de transition automatique).

### 6.5 Le parcours reste compréhensible sans explication

**Vérification** :
- Le message "Profil terminé. Quand tu es prêt, génère ton matching." est clair
- Le bouton "👉 Je génère mon matching" est explicite

**⚠️ PROBLÈME** : Le message peut être noyé dans la synthèse finale (concaténation ligne 1935).

**✅ CONCLUSION** : Le parcours est compréhensible, mais le CTA peut être amélioré pour être plus visible.

---

## 7. CARTographie DES POINTS POSSIBLES D'INSERTION DU CTA

### 7.1 Point #1 : Après la synthèse finale, message séparé

**Fichier** : `src/engine/axiomExecutor.ts` (lignes 1934-1952)

**Modification conceptuelle** :
```typescript
if (nextState === STEP_99_MATCH_READY) {
  // Retourner UNIQUEMENT la synthèse finale (sans concaténation)
  return {
    response: aiText || '', // Synthèse finale seule
    step: nextState,
    lastQuestion: null,
    expectsAnswer: false,
    autoContinue: false,
  };
}
```

**Puis dans `STEP_99_MATCH_READY`** :
```typescript
if (currentState === STEP_99_MATCH_READY) {
  if (!userMessage && !event) {
    return {
      response: 'Ton profil est terminé.\n\n👉 Découvre ton matching pour savoir si ce poste te correspond vraiment.',
      step: currentState,
      expectsAnswer: false,
      autoContinue: false,
    };
  }
  // ...
}
```

**Avantages** :
- ✅ CTA visible et distinct de la synthèse
- ✅ Message clair et incitatif
- ✅ Pas de modification de prompt

**Risques** :
- ⚠️ Deux messages successifs (synthèse + CTA) peuvent créer une confusion
- ⚠️ Nécessite modification de la logique de concaténation (ligne 1935)

**Effort** : **1h**

---

### 7.2 Point #2 : Dans le message de transition STEP_99_MATCH_READY (amélioration wording)

**Fichier** : `src/engine/axiomExecutor.ts` (lignes 1980-1990)

**Modification conceptuelle** :
```typescript
if (currentState === STEP_99_MATCH_READY) {
  if (!userMessage && !event) {
    return {
      response: 'Ton profil est terminé.\n\n👉 Découvre ton matching pour savoir si ce poste te correspond vraiment.',
      step: currentState,
      expectsAnswer: false,
      autoContinue: false,
    };
  }
  // ...
}
```

**Avantages** :
- ✅ Message unique, clair
- ✅ CTA intégré dans le message
- ✅ Pas de modification de prompt

**Risques** :
- ⚠️ Le message actuel "Profil terminé. Quand tu es prêt, génère ton matching." est peut-être trop discret
- ⚠️ Nécessite modification du wording (mais pas du prompt)

**Effort** : **30min**

---

### 7.3 Point #3 : Amélioration visibilité bouton frontend

**Fichier** : `ui-test/app.js` (lignes 236-265)

**Modification conceptuelle** :
- Ajouter un style CSS plus visible (couleur, taille, position)
- Ajouter un message assistant avant le bouton : "Ton profil est terminé. Découvre ton matching :"
- S'assurer que le bouton est toujours visible (pas de masquage)

**Avantages** :
- ✅ Amélioration UX sans modification backend
- ✅ CTA plus visible

**Risques** :
- ⚠️ Nécessite modification CSS (hors périmètre actuel)
- ⚠️ Ne résout pas le problème de refresh (bouton non affiché)

**Effort** : **1h**

---

### 7.4 Point #4 : Correction `/start` endpoint (reprise de session)

**Fichier** : `src/routes/start.ts` (lignes 72-79)

**Modification conceptuelle** :
```typescript
return reply.send({
  sessionId: finalSessionId,
  state: responseState,
  currentBlock: candidate.session.currentBlock,
  response: result.response,
  step: result.step, // ← Ajouter
  expectsAnswer: result.expectsAnswer,
  autoContinue: result.autoContinue,
});
```

**Avantages** :
- ✅ Permet la reprise de session (refresh)
- ✅ Frontend peut détecter `STEP_99_MATCH_READY` et afficher le bouton
- ✅ Correction minimale et ciblée

**Risques** :
- ⚠️ Aucun risque identifié (ajout de champ, pas de modification de logique)

**Effort** : **15min**

---

## 8. HYPOTHÈSES DE CORRECTION (SANS CODE)

### 8.1 Hypothèse 1 : Séparation synthèse / CTA + Correction `/start`

**Concept** :
1. **Séparer la synthèse finale du message CTA** :
   - Fin BLOC 10 → Retourner uniquement la synthèse finale
   - `STEP_99_MATCH_READY` sans event → Retourner message CTA distinct
2. **Corriger `/start` endpoint** :
   - Retourner `step` dans la réponse pour permettre la reprise de session

**Avantages** :
- ✅ CTA visible et distinct
- ✅ Reprise de session fonctionnelle
- ✅ Pas de modification de prompt
- ✅ Corrections minimales et ciblées

**Risques** :
- ⚠️ Deux messages successifs (synthèse + CTA) peuvent créer une confusion
- ⚠️ Nécessite modification de la logique de concaténation (ligne 1935)

**Effort** : **1h15**

**Fichiers concernés** :
- `src/engine/axiomExecutor.ts` (lignes 1934-1952, 1980-1990)
- `src/routes/start.ts` (ligne 77)

---

### 8.2 Hypothèse 2 : Amélioration wording CTA + Correction `/start`

**Concept** :
1. **Améliorer le wording du message CTA** :
   - Remplacer "Profil terminé. Quand tu es prêt, génère ton matching." par un message plus incitatif
2. **Corriger `/start` endpoint** :
   - Retourner `step` dans la réponse

**Avantages** :
- ✅ Message unique, clair
- ✅ Reprise de session fonctionnelle
- ✅ Pas de modification de prompt
- ✅ Corrections minimales

**Risques** :
- ⚠️ Le message reste concaténé avec la synthèse (peut être noyé)
- ⚠️ Nécessite modification du wording (mais pas du prompt)

**Effort** : **45min**

**Fichiers concernés** :
- `src/engine/axiomExecutor.ts` (lignes 1935, 1985)
- `src/routes/start.ts` (ligne 77)

---

### 8.3 Hypothèse 3 : Correction `/start` uniquement

**Concept** :
1. **Corriger `/start` endpoint** :
   - Retourner `step` dans la réponse
2. **Aucune autre modification**

**Avantages** :
- ✅ Reprise de session fonctionnelle
- ✅ Correction minimale (1 ligne)
- ✅ Pas de risque de régression

**Risques** :
- ⚠️ Ne résout pas le problème de visibilité du CTA (message concaténé)
- ⚠️ Le bouton peut toujours être noyé dans la synthèse

**Effort** : **15min**

**Fichiers concernés** :
- `src/routes/start.ts` (ligne 77)

---

## 9. RECOMMANDATION FINALE

### 9.1 Approche recommandée : Hypothèse 1 (Séparation synthèse / CTA + Correction `/start`)

**Pourquoi** :
1. **Séparation synthèse / CTA** : Garantit que le CTA est visible et distinct
2. **Correction `/start`** : Garantit la reprise de session (refresh)

**Avantages** :
- ✅ CTA visible et distinct de la synthèse
- ✅ Reprise de session fonctionnelle
- ✅ Pas de modification de prompt
- ✅ Corrections minimales et ciblées
- ✅ Message clair et incitatif

**Risques** :
- ⚠️ Deux messages successifs (synthèse + CTA) peuvent créer une confusion
- ⚠️ Nécessite modification de la logique de concaténation (ligne 1935)

**Effort total** : **1h15**

**Ordre d'implémentation** :
1. Correction `/start` endpoint (15min)
2. Séparation synthèse / CTA (1h)

### 9.2 Approche alternative : Hypothèse 2 (Amélioration wording + Correction `/start`)

**Si l'effort doit être minimal** :
- Améliorer le wording du message CTA
- Corriger `/start` endpoint
- **Effort** : **45min**
- **Risque** : Le message reste concaténé avec la synthèse (peut être noyé)

---

## 10. POINTS DE VIGILANCE

### 10.1 Concaténation message synthèse + CTA

**Problème** : Ligne 1935, le message "Profil terminé. Quand tu es prêt, génère ton matching." est concaténé avec la synthèse finale.

**Impact** : Le CTA peut être noyé dans la synthèse.

**Vigilance** : S'assurer que le CTA est toujours visible, même si la synthèse est longue.

### 10.2 Reprise de session (refresh)

**Problème** : Le `/start` endpoint ne retourne pas `step`, donc le frontend ne peut pas détecter `STEP_99_MATCH_READY` après refresh.

**Impact** : Le bouton n'est pas affiché après refresh.

**Vigilance** : Corriger `/start` pour retourner `step`.

### 10.3 Double affichage bouton

**Problème** : Si `displayMatchingButton()` est appelé plusieurs fois, le `innerHTML` peut écraser le gestionnaire de clic.

**Impact** : Le bouton peut ne plus fonctionner.

**Vigilance** : Vérifier `showStartButton === true` avant d'appeler `displayMatchingButton()`.

### 10.4 Champ de saisie masqué

**Problème** : À `STEP_99_MATCH_READY`, `expectsAnswer: false` donc le champ de saisie est masqué.

**Impact** : L'utilisateur ne peut que cliquer le bouton (correct, mais peut créer une confusion si le bouton n'est pas visible).

**Vigilance** : S'assurer que le bouton est toujours visible à `STEP_99_MATCH_READY`.

---

## 11. TESTS DE NON-RÉGRESSION À PRÉVOIR

### 11.1 Tests fonctionnels

1. **Test BLOC 10 → Matching**
   - Compléter BLOC 10
   - Vérifier que la synthèse finale est affichée
   - Vérifier que le message CTA est affiché (distinct de la synthèse)
   - Vérifier que le bouton "👉 Je génère mon matching" est visible
   - Cliquer sur le bouton
   - Vérifier que le matching est généré

2. **Test refresh à STEP_99_MATCH_READY**
   - Compléter BLOC 10
   - Observer le bouton matching
   - **Refresh la page** (F5)
   - Vérifier que le bouton matching est toujours visible
   - Cliquer sur le bouton
   - Vérifier que le matching est généré

3. **Test double-clic bouton**
   - Compléter BLOC 10
   - **Double-clic rapide** sur le bouton matching
   - Vérifier qu'un seul matching est généré (pas de doublon)

### 11.2 Tests de non-régression

1. **Test autres blocs**
   - Vérifier que les autres blocs (1-9) fonctionnent toujours correctement
   - Vérifier que les miroirs REVELIOM s'affichent toujours en 3 sections progressives

2. **Test bouton "Je commence mon profil"**
   - Vérifier que le bouton "Je commence mon profil" fonctionne toujours correctement

3. **Test erreur API**
   - Simuler une erreur API lors du clic sur le bouton matching
   - Vérifier que le bouton est réactivé (ou reste désactivé selon le choix)

---

## 12. CONCLUSION

### 12.1 Causes identifiées

1. **Message CTA concaténé avec synthèse** : Le message "Profil terminé. Quand tu es prêt, génère ton matching." est concaténé avec la synthèse finale (ligne 1935), ce qui peut noyer le CTA.

2. **`/start` endpoint ne retourne pas `step`** : Si l'utilisateur refresh à `STEP_99_MATCH_READY`, le frontend ne peut pas détecter l'état et n'affiche pas le bouton.

3. **Wording CTA peut être amélioré** : Le message actuel est peut-être trop discret.

### 12.2 Corrections recommandées

**Approche SAFE** : Hypothèse 1 (Séparation synthèse / CTA + Correction `/start`)
- **Effort** : 1h15
- **Risque** : Faible
- **Impact** : Fort (CTA visible et distinct, reprise de session fonctionnelle)

**Approche MINIMALE** : Hypothèse 2 (Amélioration wording + Correction `/start`)
- **Effort** : 45min
- **Risque** : Moyen (message peut être noyé)
- **Impact** : Moyen (amélioration wording, reprise de session fonctionnelle)

### 12.3 Fichiers à modifier (approche SAFE)

1. `src/engine/axiomExecutor.ts` :
   - Ligne 1934-1952 : Séparer synthèse finale du message CTA
   - Ligne 1980-1990 : Améliorer wording message CTA

2. `src/routes/start.ts` :
   - Ligne 77 : Ajouter `step: result.step` dans la réponse

**Aucune modification de prompt nécessaire.**

---

**FIN DE L'AUDIT**
