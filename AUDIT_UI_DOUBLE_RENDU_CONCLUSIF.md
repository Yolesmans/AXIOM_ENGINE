# Audit UI — Double rendu de la même réponse serveur (conclusif)

**Date** : 2025-02-10  
**Périmètre** : 100 % flux UI (SSE, listeners, re-render, DOM, state, réception).  
**Objectif** : Une cause racine, une preuve dans le code, un correctif structurel (pas de garde-fou de surface).

---

## 1. Constat factuel (rapporté)

- Le moteur avance correctement (BLOC 2A → 2A.2 confirmé côté back, logs `block=2A answeredCount=1 next=2A.2`).
- Aucune erreur métier côté back.
- Le problème est **uniquement** un double rendu UI : la même réponse serveur (ex. question 2A.1) apparaît deux fois à l’écran.

---

## 2. Inventaire des points d’affichage assistant

Tout contenu assistant affiché à l’utilisateur provient de l’un des chemins suivants :

| # | Fichier   | Ligne | Contexte | Action |
|---|-----------|-------|----------|--------|
| 1 | `ui-test/app.js` | 322–327 | `callAxiom` → `ensureStreamMessageElement()` | Création d’une bulle stream + `streamTextP.textContent = firstQuestion` (tokens SSE). |
| 2 | `ui-test/app.js` | 382–387 | `callAxiom` après `readSSEStream` | Si bulle stream existante : `streamTextP.textContent = finalContent` ; sinon : `addMessage('assistant', finalContent)`. |
| 3 | `ui-test/app.js` | 636–638 | Init après `GET /start` | Si `data.response` : `addMessage('assistant', data.response)`. |

Il n’y a **pas** d’autre endroit qui crée ou remplit une bulle assistant (pas de clé, pas de second listener submit, pas de re-render framework).

---

## 3. Cycle de vie SSE (résumé)

- **Ouverture** : un seul `fetch` par `callAxiom`, un seul `readSSEStream` par appel.
- **Tokens** : callback `onToken` → `fullText += chunk`, `ensureStreamMessageElement()`, puis `streamTextP.textContent = extractFirstQuestion(fullText)` → **une seule** bulle stream par appel, mise à jour en place.
- **Done** : callback `onDone` → `finalData = donePayload` (une seule fois par flux ; le back envoie un seul `writeEvent("done", ...)` puis `res.end()`).
- **Après flux** : on utilise `finalData` une seule fois : soit mise à jour de la bulle stream (si elle existe), soit **un seul** `addMessage('assistant', finalContent)`.

Donc **pour un seul appel à `callAxiom`**, une seule réponse serveur ne peut produire qu’**une seule** bulle assistant (stream mise à jour **ou** un seul `addMessage`), pas les deux. Pas de double rendu à l’intérieur d’un même appel.

---

## 4. Gestion des listeners et risque de double requête

- **Submit** : un seul `chatForm.addEventListener('submit', ...)` (DOMContentLoaded, une fois).
- **Verrous** : `submitInProgress = true` en tête du handler, `isWaiting = true` au début de `callAxiom`, relâchés en `finally` / fin de handler.
- Aucun autre point d’envoi (pas de keydown/envoyer, pas de second listener).

Un seul clic Envoyer ne peut donc déclencher qu’**un seul** `callAxiom` pour ce tour. Le double rendu ne vient **pas** d’un double submit non maîtrisé.

---

## 5. Cause racine : condition du garde anti-doublon (LOT1)

Le code actuel évite d’afficher deux fois le **même** texte assistant uniquement quand le **dernier** nœud du conteneur est déjà une bulle assistant :

```javascript
// ui-test/app.js, ~l.130–141
if (role === 'assistant') {
  const lastMessage = messagesContainer.lastElementChild;
  if (lastMessage && lastMessage.classList.contains('message-reveliom')) {
    const lastText = lastMessage.querySelector('p')?.textContent || '';
    // ...
    if (lastText === textTrimmed) {
      console.warn('[FRONTEND] [LOT1] Duplicate message detected, skipping');
      return;
    }
  }
}
```

**Séquence qui mène au double affichage :**

1. Une première bulle assistant avec la question 2A.1 est affichée (via **/start** l.638 ou un **premier** `callAxiom`).
2. L’utilisateur envoie sa réponse (ex. "A") → `addMessage('user', message)` (l.794) → le **dernier** enfant du conteneur devient la **bulle user**.
3. Un **second** affichage du même contenu 2A.1 est demandé (autre `callAxiom` ou même tour dans un cas limite) → `addMessage('assistant', finalContent)` avec `finalContent === 2A.1`.
4. Au moment de ce second `addMessage`, `lastElementChild` est la bulle **user**, donc **pas** `message-reveliom` → le bloc `if (lastMessage && lastMessage.classList.contains('message-reveliom'))` **n’est pas exécuté** → le doublon n’est **pas** détecté → une **deuxième** bulle 2A.1 est ajoutée.

**Cause racine (une seule)** :  
Le garde anti-doublon LOT1 ne regarde que le **dernier nœud** du conteneur. Dès qu’un message **utilisateur** a été ajouté après la première 2A.1, le dernier nœud n’est plus une bulle assistant, donc une seconde tentative d’affichage du même contenu assistant **n’est pas bloquée** → double rendu de la même réponse serveur.

**Preuve dans le code** :  
`ui-test/app.js` : lignes 131–141 (comparaison uniquement avec `lastElementChild` ; pas de recherche du **dernier** message assistant dans le conteneur).

---

## 6. Pourquoi la “même question” est rendue plusieurs fois

- La même réponse serveur (ex. 2A.1) peut être livrée par **deux chemins** : (1) `/start` au chargement ou premier `callAxiom`, (2) un autre `callAxiom` (même tour ou rejeu).
- Chaque chemin appelle `addMessage('assistant', …)` une fois.
- Après l’ajout du message user, le garde LOT1 ne s’applique plus → la deuxième tentative d’ajout du même texte assistant crée une **deuxième** bulle → la même question apparaît deux fois.

---

## 7. Correctif structurel (aligné architecture)

**Principe** : une seule bulle assistant par **contenu** distinct ; l’affichage du même contenu est **idempotent**.

**Règle** : avant d’ajouter une bulle assistant, comparer le texte à afficher au texte de la **dernière bulle assistant** déjà présente dans le conteneur (en parcourant les enfants à partir de la fin jusqu’à trouver un nœud `.message-reveliom`), et ne pas ajouter si c’est identique.

- On ne change pas le flux SSE, ni le nombre d’appels, ni les listeners.
- On renforce l’invariant “pas deux bulles assistant identiques” en le basant sur le **dernier message assistant** (pas sur le dernier nœud tout court).

**Implémentation** : dans `addMessage`, pour `role === 'assistant'`, remplacer la comparaison avec `lastElementChild` par la recherche du **dernier** élément `.message-reveliom` dans `#messages`, puis comparaison du texte ; si égal, `return` sans ajouter.

---

## 8. Résumé

| Élément | Conclusion |
|--------|------------|
| **Cause racine** | Le garde anti-doublon LOT1 ne compare qu’au **dernier** nœud du conteneur ; après ajout du message user, ce n’est plus une bulle assistant → second `addMessage('assistant', mêmeContenu)` non filtré → double bulle. |
| **Preuve** | `ui-test/app.js` l.131–141 : utilisation de `lastElementChild` sans ciblage du dernier message assistant. |
| **Correctif** | Comparer le nouveau texte assistant au texte de la **dernière bulle assistant** (parcours arrière du conteneur) et ne pas ajouter si identique (affichage idempotent). |

Une fois cet audit validé et le correctif appliqué, le flux BLOC 2A → 2B → 3 peut être gelé définitivement côté UI pour ce point.
