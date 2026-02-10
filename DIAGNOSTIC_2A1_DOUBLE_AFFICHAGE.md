# Diagnostic — Double affichage question 2A.1 (désync front / back)

**Objectif** : Identifier précisément POURQUOI la question 2A.1 peut s’afficher deux fois alors que le moteur est passé à 2A.2. Pas de correctif hasardeux : une seule source de vérité, cohérente avec l’état du moteur.

---

## 1) Source de vérité côté UI — D’où vient la question affichée ?

### Frontend (`ui-test/app.js`)

- **Flux** : le front appelle **`/axiom/stream`** (SSE). Il n’utilise **pas** `/axiom` (JSON classique).
- **Pendant le stream** :
  - Chaque token reçu est ajouté à **`fullText`**.
  - Un seul élément DOM est utilisé pour le stream : **`streamMessageDiv`** (créé au **premier token** via `ensureStreamMessageElement()`).
  - Le texte affiché dans cette bulle est **`extractFirstQuestion(fullText)`** (mise à jour à chaque chunk).
  - Donc **tant qu’il y a du stream** : la source de vérité affichée = **contenu streamé** (pas `currentBlock` ni un cache séparé).
- **À la réception de l’event `done`** :
  - **Si `fullText` est vide** : le front fait **`addMessage('assistant', extractFirstQuestion(data.response))`**.
    - Donc la question affichée = **`data.response`** (réponse serveur).
  - **Si `fullText` n’est pas vide** : le front **ne fait pas** `addMessage` avec `data.response`. L’écran montre uniquement ce qui a été mis dans **`streamMessageDiv`** (le contenu streamé).
- **Conclusion** :
  - **Sans tokens** (cas BLOC 2A.2) : la question affichée vient de **`data.response`** (event `done`).
  - **Avec tokens** : la question affichée vient du **stream** ; **`data.response` n’est pas réaffiché** ni utilisé pour remplacer le stream.

Donc la question affichée vient soit du **contenu streamé** (si des tokens ont été reçus), soit de **`data.response`** (si aucun token). Il n’y a pas de dérivation depuis `currentBlock` / `answeredCount` côté front, ni de cache “question courante” : uniquement **stream** ou **`done.response`**.

---

## 2) Cycle de rendu — Comparaison serveur / front

### Ce que le serveur envoie (BLOC 2A, réponse 2A.1 → passage 2A.2)

- **Route** : `POST /axiom/stream`, avec `step === BLOC_02` et `currentBlock === 2` → délégation à l’orchestrator (`server.ts` ~1535–1539).
- **Orchestrator** :
  - Normalise la réponse 2A.1, stocke **"Série"** ou **"Film"**.
  - Recharge le candidate → **answeredCount = 1**.
  - Appelle **`generateQuestion2A2`** (LLM) → obtient la question 2A.2.
  - **Ne fait aucun appel à `onChunk`** : il retourne simplement `{ response: question2A2, step: BLOC_02, expectsAnswer: true }`.
- **Serveur** :
  - **`streamedText`** reste **vide** (aucun token envoyé).
  - **`finalResponse = streamedText || response`** = question 2A.2.
  - Envoie un event **`done`** avec **`response: question2A2`**, **`step: BLOC_02`**, **`currentBlock: 2`**.

Donc **ce que le serveur renvoie** après une réponse "A" valide = **une seule réponse**, la question **2A.2**, dans **`done.response`**, sans tokens intermédiaires.

### Ce que le front affiche dans ce scénario

- **Aucun token** reçu → **`fullText`** reste **vide**.
- **`streamMessageDiv`** n’est **jamais créé** (car `ensureStreamMessageElement()` n’est appelé que lors d’un chunk).
- À la réception de **`done`** : **`!fullText && data.response`** → **`addMessage('assistant', extractFirstQuestion(data.response))`** → affichage de la **question 2A.2**.

Donc **en théorie** : une seule requête, une seule réponse 2A.2, un seul affichage 2A.2. **Si l’utilisateur voit encore 2A.1**, alors soit :
- le **serveur** a renvoyé **2A.1** dans **`done.response`** (bug côté back),  
- soit le **front** affiche **autre chose** que **`data.response`** (ex. ancien contenu d’un stream, double rendu, autre appel).

---

## 3) Hypothèses pour “2A.1 affichée deux fois”

| Hypothèse | Où vérifier | Log à regarder |
|-----------|-------------|----------------|
| **A** Le serveur renvoie 2A.1 au lieu de 2A.2 après stockage 2A.1 | Back : contenu de `result.response` pour la requête avec `message: "A"`. | `[DEBUG] block=2A answeredCount=1 next=2A.2` : s’il apparaît, le moteur a bien passé à 2A.2. Si juste après le `done` contient 2A.1, bug back. |
| **B** Deux requêtes : une sans message (ou vide) qui renvoie 2A.1, une avec "A" qui renvoie 2A.2 | Ordre des requêtes et corps (message présent ou non). | Côté front : plusieurs `[UI] done` pour un même “tour” utilisateur. Côté back : deux entrées BLOC_02 pour le même sessionId. |
| **C** Stream “fantôme” : des tokens d’un tour précédent (2A.1) arrivent ou restent affichés | Front : utilisation de **`fullText`** / **`streamMessageDiv`** alors qu’on attend 2A.2. | `[UI] done` avec **`hasStreamedText: true`** alors que le back n’a pas envoyé de tokens pour 2A.2 → incohérence. |
| **D** Affichage basé sur un ancien état (ex. dernier message assistant en cache / re-render) | Pas de tel mécanisme dans `ui-test/app.js` : pas de state “dernier message” ni de relecture d’historique. | — |

Les logs de corrélation ajoutés permettent de trancher entre **A**, **B** et **C**.

---

## 4) Logs de corrélation ajoutés (temporaires)

### Côté serveur (`blockOrchestrator.ts`)

- **Après** `storeAnswerForBlock` pour le BLOC 2 et **rechargement** du candidate, lorsque **`updatedAnsweredCount === 1`** et **`blockNumber === 2`** :
  - **`[DEBUG] block=2A answeredCount=1 next=2A.2`**
- Interprétation : si ce log apparaît, le moteur a bien **stocké** la réponse 2A.1 et **considère** qu’il doit servir 2A.2. Si juste après le `done` contient 2A.1, le bug est en aval (construction de la réponse ou autre branche).

### Côté front (`ui-test/app.js`)

- **À la réception de l’event `done`**, avant toute décision d’affichage :
  - **`[UI] done`** avec :
    - **`step`**, **`currentBlock`**
    - **`responsePreview`** : 80 premiers caractères de **`data.response`**
    - **`hasStreamedText`** : présence de contenu streamé (**`!!fullText`**)
    - **`source`** : **`'stream'`** si `fullText` non vide, **`'done.response'`** si on va utiliser **`data.response`**, **`'none'`** sinon.
- Interprétation :
  - **`responsePreview`** = ce que le back envoie comme réponse pour **ce** tour.
  - **`source`** = ce qui sera (ou a été) affiché : stream ou **`done.response`**.

### Utilisation pour le cas “2A.1 deux fois”

1. Reproduire le scénario (réponse "A" à 2A.1).
2. Vérifier côté **serveur** : apparition de **`[DEBUG] block=2A answeredCount=1 next=2A.2`**.
3. Vérifier côté **front** : un seul **`[UI] done`** pour ce tour, avec **`responsePreview`** et **`source`**.
4. Si **`responsePreview`** commence par le texte de **2A.1** → le serveur a renvoyé 2A.1 pour ce tour (cause back).
5. Si **`responsePreview`** correspond à **2A.2** mais **`hasStreamedText: true`** → le front a peut‑être affiché le stream (éventuellement ancien) au lieu de **`data.response`** (cause front / stream).
6. Si deux **`[UI] done`** pour un même envoi utilisateur → deux requêtes (double submit ou autre).

---

## 5) Source de vérité recommandée (pour une correction propre)

- **Une seule source de vérité** pour “quelle question afficher à la fin de ce tour” : **`data.response`** de l’event **`done`** pour la requête **courante**.
- **Règle** : pour chaque tour (un submit utilisateur → une réponse SSE), la question (ou le miroir) affichée doit être **exactement** **`payload.response`** du **`done`** correspondant.
- **Implications** :
  - Si le back ne stream pas (ex. BLOC 2A.2) : **`fullText`** vide → le front utilise déjà **`data.response`** → cohérent.
  - Si le back stream : aujourd’hui le front montre le stream et **n’utilise pas** **`data.response`** en fin de tour ; pour une source unique, il faudrait soit **remplacer** le contenu de la bulle stream par **`data.response`** à la réception du **`done`**, soit n’afficher qu’à partir de **`data.response`** (et ignorer le stream pour le contenu final). À décider sans hack (pas de “si déjà affichée”, pas de reset arbitraire).

---

## 6) Résumé

- **Source de l’affichage front** : soit **contenu streamé** (si tokens reçus), soit **`data.response`** (si pas de tokens).
- **Pour BLOC 2A.2** : pas de stream → affichage = **`data.response`** du **`done`**.
- **Cause probable du double 2A.1** : soit **back** renvoie 2A.1 pour ce tour, soit **deux requêtes** (une renvoyant 2A.1), soit **affichage stream** d’un tour précédent.
- **Logs ajoutés** : back **`[DEBUG] block=2A answeredCount=1 next=2A.2`**, front **`[UI] done`** avec **step / currentBlock / responsePreview / hasStreamedText / source** pour corréler et cibler la cause (back, double requête, ou stream).
- **Correction à envisager** une fois la cause identifiée : une seule source de vérité = **`data.response`** du **`done`** pour le contenu final affiché, sans condition “si déjà affichée” et sans reset arbitraire.
