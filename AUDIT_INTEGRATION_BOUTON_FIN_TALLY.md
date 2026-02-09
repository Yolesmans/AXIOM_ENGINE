# AUDIT — INTÉGRATION BOUTON FIN → AVIS TALLY (POST-MATCHING)

**Date** : 2025-01-27  
**Objectif** : Intégrer un bouton "FIN" qui redirige vers Tally après le matching, sans modifier les prompts, avec une UX claire et volontaire.

---

## 1. ÉTAT ACTUEL DU FLUX MATCHING

### 1.1 États FSM concernés

**Fichier** : `src/engine/axiomExecutor.ts`

| État | Ligne | Comportement actuel |
|------|-------|---------------------|
| `STEP_99_MATCH_READY` | 1982-2011 | Attente du clic bouton "Je génère mon matching". Retourne message CTA si pas d'event. |
| `STEP_99_MATCHING` | 2016-2097 | Génération du matching (appel LLM). Retourne le matching avec `step: DONE_MATCHING`. |
| `DONE_MATCHING` | 2102-2111 | **État terminal**. Retourne `response: ''` (vide) car le matching a déjà été affiché. |

### 1.2 Flux de transition

```
STEP_99_MATCH_READY
  ↓ (event: START_MATCHING)
STEP_99_MATCHING
  ↓ (matching généré, response: aiText, step: DONE_MATCHING)
DONE_MATCHING
  ↓ (response: '', step: DONE_MATCHING)
[TERMINAL]
```

**Observation** : Le matching est affiché lors de la transition `STEP_99_MATCHING → DONE_MATCHING` (ligne 2091). L'état `DONE_MATCHING` est donc l'état terminal idéal pour afficher le bouton FIN.

### 1.3 Gestion frontend actuelle

**Fichier** : `ui-test/app.js`

**Lignes 166-185** : Détection des états
```javascript
if (data.step === 'STEP_03_BLOC1') {
  showStartButton = true;
  displayStartButton();
} else if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false) {
  showStartButton = true;
  displayMatchingButton();
} else if (data.expectsAnswer === true) {
  hasActiveQuestion = true;
  // Afficher champ de saisie
} else {
  hasActiveQuestion = false;
}
```

**Problème identifié** : Aucune gestion spécifique de `DONE_MATCHING`. Le frontend ne masque pas définitivement le champ de saisie et n'affiche pas le bouton FIN.

---

## 2. ANALYSE DES POINTS CRITIQUES

### 2.1 Quel état utiliser pour signaler "matching terminé" ?

**✅ RECOMMANDATION** : Utiliser `DONE_MATCHING` (existant)

**Raisons** :
- État déjà terminal et dédié
- Transition claire : `STEP_99_MATCHING → DONE_MATCHING` après génération
- Pas besoin de créer un nouvel état (`STEP_100_FEEDBACK_READY` serait redondant)
- Cohérent avec l'architecture FSM existante

**Alternative rejetée** : Créer `STEP_100_FEEDBACK_READY`
- Risque : Complexification inutile
- Impact : Modification de la FSM, tests supplémentaires
- Bénéfice : Aucun (DONE_MATCHING suffit)

### 2.2 Où déclencher l'affichage du bouton FIN ?

**✅ RECOMMANDATION** : Frontend uniquement, déclenché par `step === 'DONE_MATCHING'`

**Raisons** :
- Pattern cohérent avec `displayMatchingButton()` (ligne 236)
- Pas de logique backend nécessaire (le matching est déjà généré)
- Séparation claire : backend = état, frontend = affichage

**Backend** : `DONE_MATCHING` retourne déjà `response: ''` et `step: DONE_MATCHING` (lignes 2102-2111). Aucune modification nécessaire.

**Frontend** : Ajouter une détection `data.step === 'DONE_MATCHING'` pour :
1. Masquer définitivement le champ de saisie
2. Afficher le bouton FIN (une seule fois)
3. Rediriger vers Tally au clic

### 2.3 Garantir l'affichage unique du bouton FIN

**✅ RECOMMANDATION** : Utiliser le même pattern que `displayMatchingButton()`

**Pattern existant** (lignes 236-265) :
```javascript
function displayMatchingButton() {
  // Vérifier si le bouton existe déjà
  let buttonContainer = document.getElementById('mvp-matching-button-container');
  if (!buttonContainer) {
    // Créer le bouton
  }
  // ...
}
```

**Application** : Créer `displayFinishButton()` avec :
- Vérification d'existence : `document.getElementById('mvp-finish-button-container')`
- Si existe → ne pas recréer (évite les doublons)
- Si n'existe pas → créer et afficher

### 2.4 Garantir l'affichage après refresh

**✅ RECOMMANDATION** : Le `/start` endpoint doit retourner `step: DONE_MATCHING` si on est dans cet état

**Fichier** : `src/routes/start.ts`

**État actuel** (lignes 60-80) :
- Appelle `executeAxiom({ candidate, userMessage: null })`
- Retourne `step: result.step` (ligne 77)

**Vérification** : Si `candidate.session.ui.step === 'DONE_MATCHING'`, alors `executeAxiom` retournera `step: DONE_MATCHING` (ligne 2106).

**✅ CONCLUSION** : Le `/start` retourne déjà correctement `step: DONE_MATCHING`. Le frontend pourra détecter cet état après refresh.

### 2.5 Désactiver définitivement toute interaction après DONE_MATCHING

**✅ RECOMMANDATION** : Masquer le champ de saisie et désactiver tous les boutons sauf FIN

**Frontend** : Dans la détection `data.step === 'DONE_MATCHING'` :
```javascript
// Masquer définitivement le champ de saisie
const chatForm = document.getElementById('chat-form');
if (chatForm) {
  chatForm.style.display = 'none';
}

// Masquer les autres boutons (matching, start)
const matchingButtonContainer = document.getElementById('mvp-matching-button-container');
if (matchingButtonContainer) {
  matchingButtonContainer.classList.add('hidden');
}
const startButtonContainer = document.getElementById('mvp-start-button-container');
if (startButtonContainer) {
  startButtonContainer.classList.add('hidden');
}

// Afficher uniquement le bouton FIN
displayFinishButton();
```

**Backend** : `DONE_MATCHING` retourne déjà `expectsAnswer: false` (ligne 2108). Aucune modification nécessaire.

---

## 3. STRATÉGIE D'IMPLÉMENTATION

### 3.1 Backend — Aucune modification nécessaire

**Fichier** : `src/engine/axiomExecutor.ts`

**État actuel** : `DONE_MATCHING` retourne déjà :
- `response: ''` (vide, car matching déjà affiché)
- `step: DONE_MATCHING` (état terminal)
- `expectsAnswer: false` (pas d'interaction attendue)

**✅ CONCLUSION** : Aucune modification backend nécessaire.

### 3.2 Frontend — Ajout de la détection DONE_MATCHING

**Fichier** : `ui-test/app.js`

**Modification 1** : Ajouter la détection dans `callAxiom()` (après ligne 168)

```javascript
} else if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false) {
  showStartButton = true;
  displayMatchingButton();
} else if (data.step === 'DONE_MATCHING') {
  // État terminal : masquer tout sauf le bouton FIN
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.style.display = 'none';
  }
  // Masquer les autres boutons
  const matchingButtonContainer = document.getElementById('mvp-matching-button-container');
  if (matchingButtonContainer) {
    matchingButtonContainer.classList.add('hidden');
  }
  const startButtonContainer = document.getElementById('mvp-start-button-container');
  if (startButtonContainer) {
    startButtonContainer.classList.add('hidden');
  }
  // Afficher le bouton FIN
  displayFinishButton();
} else if (data.expectsAnswer === true) {
  // ...
```

**Modification 2** : Ajouter la fonction `displayFinishButton()` (après `displayMatchingButton()`, ligne 265)

```javascript
// Fonction pour afficher le bouton FIN
function displayFinishButton() {
  const messagesContainer = document.getElementById('messages');
  if (!messagesContainer) return;

  // Vérifier si le bouton existe déjà (éviter les doublons)
  let buttonContainer = document.getElementById('mvp-finish-button-container');
  if (!buttonContainer) {
    buttonContainer = document.createElement('div');
    buttonContainer.id = 'mvp-finish-button-container';
    buttonContainer.className = 'mvp-start-button';
    messagesContainer.appendChild(buttonContainer);
  }

  buttonContainer.innerHTML = `
    <button id="mvp-finish-button" type="button">
      FIN
    </button>
  `;

  buttonContainer.classList.remove('hidden');

  // Gestionnaire de clic : redirection vers Tally
  const finishButton = document.getElementById('mvp-finish-button');
  if (finishButton) {
    finishButton.addEventListener('click', () => {
      finishButton.disabled = true;
      window.location.href = 'https://tally.so/r/44JLbB';
    });
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
```

**Modification 3** : Ajouter la détection dans l'initialisation (ligne 363, après `STEP_99_MATCH_READY`)

```javascript
} else if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false) {
  showStartButton = true;
  displayMatchingButton();
} else if (data.step === 'DONE_MATCHING') {
  // État terminal : masquer tout sauf le bouton FIN
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.style.display = 'none';
  }
  displayFinishButton();
}
```

---

## 4. GARANTIES DE SÉCURITÉ

### 4.1 Le bouton FIN n'apparaît JAMAIS avant la fin réelle du matching

**Garantie** : Détection stricte `data.step === 'DONE_MATCHING'`

**Vérification** :
- `DONE_MATCHING` n'est atteint qu'après `STEP_99_MATCHING` (ligne 2073)
- `STEP_99_MATCHING` ne se termine qu'après génération du matching (ligne 2082-2087)
- Le matching est affiché avant la transition vers `DONE_MATCHING` (ligne 2091)

**✅ CONCLUSION** : Le bouton FIN ne peut pas apparaître avant la fin du matching.

### 4.2 Le bouton FIN apparaît UNE SEULE FOIS, y compris après refresh

**Garantie 1** : Vérification d'existence dans `displayFinishButton()`
- Si `document.getElementById('mvp-finish-button-container')` existe → ne pas recréer

**Garantie 2** : Le `/start` retourne `step: DONE_MATCHING` si on est dans cet état
- `executeAxiom` retourne `step: DONE_MATCHING` (ligne 2106)
- Le frontend détecte cet état après refresh (ligne 363)

**✅ CONCLUSION** : Le bouton FIN apparaît une seule fois, même après refresh.

### 4.3 Toute interaction est désactivée après DONE_MATCHING

**Garantie 1** : Champ de saisie masqué
- `chatForm.style.display = 'none'` (ligne 367)

**Garantie 2** : Backend retourne `expectsAnswer: false`
- `DONE_MATCHING` retourne `expectsAnswer: false` (ligne 2108)

**Garantie 3** : Autres boutons masqués
- `mvp-matching-button-container` → `hidden`
- `mvp-start-button-container` → `hidden`

**✅ CONCLUSION** : Toute interaction est désactivée après `DONE_MATCHING`.

---

## 5. RISQUES ET MITIGATION

### 5.1 Risque : Double affichage du bouton FIN

**Probabilité** : Faible  
**Impact** : UX dégradée (bouton dupliqué)

**Mitigation** :
- Vérification d'existence dans `displayFinishButton()`
- Pattern identique à `displayMatchingButton()` (déjà testé)

### 5.2 Risque : Bouton FIN non visible après refresh

**Probabilité** : Faible  
**Impact** : UX dégradée (utilisateur bloqué)

**Mitigation** :
- Le `/start` retourne déjà `step: DONE_MATCHING` (vérifié ligne 77)
- Détection dans l'initialisation (ligne 363)

### 5.3 Risque : Champ de saisie encore visible après DONE_MATCHING

**Probabilité** : Faible  
**Impact** : UX dégradée (confusion)

**Mitigation** :
- Masquage explicite dans la détection `DONE_MATCHING`
- Backend retourne `expectsAnswer: false` (pas d'activation automatique)

---

## 6. RECOMMANDATION FINALE

### 6.1 Approche retenue : SAFE / PRODUIT / UX

**✅ Utiliser `DONE_MATCHING` comme état terminal** (pas de nouvel état)  
**✅ Frontend uniquement** (pas de modification backend)  
**✅ Pattern cohérent** avec `displayMatchingButton()`  
**✅ Garanties de sécurité** (affichage unique, désactivation interactions)

### 6.2 Fichiers à modifier

1. **`ui-test/app.js`** :
   - Ajouter détection `data.step === 'DONE_MATCHING'` dans `callAxiom()` (ligne ~168)
   - Ajouter détection `data.step === 'DONE_MATCHING'` dans l'initialisation (ligne ~363)
   - Ajouter fonction `displayFinishButton()` (après ligne 265)

### 6.3 Aucune modification backend nécessaire

- `src/engine/axiomExecutor.ts` : Aucune modification
- `src/routes/start.ts` : Aucune modification

### 6.4 Tests à effectuer

1. **Test 1** : Générer un matching → Vérifier que le bouton FIN apparaît
2. **Test 2** : Refresh après matching → Vérifier que le bouton FIN est toujours visible
3. **Test 3** : Clic bouton FIN → Vérifier redirection vers Tally
4. **Test 4** : Vérifier que le champ de saisie est masqué après `DONE_MATCHING`
5. **Test 5** : Vérifier qu'aucun autre bouton n'est visible après `DONE_MATCHING`

---

## 7. HYPOTHÈSE D'IMPLÉMENTATION

### 7.1 Ordre d'exécution

1. Ajouter la fonction `displayFinishButton()` dans `ui-test/app.js`
2. Ajouter la détection `DONE_MATCHING` dans `callAxiom()` (après `STEP_99_MATCH_READY`)
3. Ajouter la détection `DONE_MATCHING` dans l'initialisation (après `STEP_99_MATCH_READY`)
4. Tester localement
5. Commit + push

### 7.2 Code attendu (extraits)

**Fonction `displayFinishButton()`** :
```javascript
function displayFinishButton() {
  const messagesContainer = document.getElementById('messages');
  if (!messagesContainer) return;

  let buttonContainer = document.getElementById('mvp-finish-button-container');
  if (!buttonContainer) {
    buttonContainer = document.createElement('div');
    buttonContainer.id = 'mvp-finish-button-container';
    buttonContainer.className = 'mvp-start-button';
    messagesContainer.appendChild(buttonContainer);
  }

  buttonContainer.innerHTML = `
    <button id="mvp-finish-button" type="button">
      FIN
    </button>
  `;

  buttonContainer.classList.remove('hidden');

  const finishButton = document.getElementById('mvp-finish-button');
  if (finishButton) {
    finishButton.addEventListener('click', () => {
      finishButton.disabled = true;
      window.location.href = 'https://tally.so/r/44JLbB';
    });
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
```

**Détection dans `callAxiom()`** :
```javascript
} else if (data.step === 'STEP_99_MATCH_READY' && data.expectsAnswer === false) {
  showStartButton = true;
  displayMatchingButton();
} else if (data.step === 'DONE_MATCHING') {
  // État terminal : masquer tout sauf le bouton FIN
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.style.display = 'none';
  }
  const matchingButtonContainer = document.getElementById('mvp-matching-button-container');
  if (matchingButtonContainer) {
    matchingButtonContainer.classList.add('hidden');
  }
  const startButtonContainer = document.getElementById('mvp-start-button-container');
  if (startButtonContainer) {
    startButtonContainer.classList.add('hidden');
  }
  displayFinishButton();
} else if (data.expectsAnswer === true) {
  // ...
```

---

## 8. CONCLUSION

**✅ APPROCHE VALIDÉE** : Utiliser `DONE_MATCHING` comme état terminal, frontend uniquement, pattern cohérent avec `displayMatchingButton()`.

**✅ RISQUES MITIGÉS** : Vérification d'existence, détection dans initialisation, masquage explicite.

**✅ GARANTIES RESPECTÉES** :
- Bouton FIN uniquement après matching terminé
- Affichage unique, même après refresh
- Désactivation définitive des interactions

**✅ PRÊT POUR IMPLÉMENTATION** : Modifications frontend uniquement, aucune modification backend, aucun prompt modifié.

---

**FIN DE L'AUDIT**
