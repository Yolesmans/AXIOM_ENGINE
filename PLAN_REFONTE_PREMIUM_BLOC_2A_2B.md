# Plan technique — Refonte premium BLOC 2A / 2B

**Date** : 2025-02-10  
**Objectif** : Couche d’intelligence sémantique pour 2A.2 et 2B (normalisation œuvres/personnages, génération dynamique des traits).  
**Contrainte** : Aucune implémentation avant validation du plan.

---

## 1. Vue d’ensemble

| Composant | Actuel | Cible |
|-----------|--------|--------|
| Œuvres (2A.2) | `parseWorks` regex uniquement | Appel LLM dédié → JSON normalisé → `session.normalizedWorks` |
| Personnages (2B) | `parseCharacterNames` split | Appel LLM après chaque réponse « personnages » → `session.normalizedCharacters[workIndex]` |
| Questions 2B | Un seul `generateQuestions2B` (tout le bloc) | Motif + personnages en une génération ; traits générés **après** réception des personnages, **un mini-appel par personnage** |
| Source 2B | `parseWorks(preferencesAnswer)` | `candidate.session.normalizedWorks` (titres canoniques) |

---

## 2. Normalisation intelligente des œuvres (2A.2)

### 2.1 Règle métier

- **Déclencheur** : immédiatement après stockage de la réponse utilisateur à la question 2A.2 (préférences).
- **Input** : texte brut utilisateur (ex. `"peacky blindé viking suits"`).
- **Output** : JSON strict avec correction orthographique, séparation sémantique, max 3 œuvres. En cas d’ambiguïté majeure → message utilisateur clair (pas d’exception non gérée).
- **Source officielle 2B** : `candidate.session.normalizedWorks` ; plus aucun usage de `parseWorks` comme source des œuvres pour la génération 2B.

### 2.2 Format de sortie LLM (JSON strict)

```ts
interface NormalizedWork {
  canonicalTitle: string;
  type: 'series' | 'film';
  confidence: number; // 0..1
}

// Réponse attendue (un seul objet JSON)
{
  "works": NormalizedWork[]  // length 1..3
}
// Ou en cas d’ambiguïté bloquante :
{
  "needsClarification": true,
  "message": "Message court et bienveillant pour l’utilisateur"
}
```

### 2.3 Point d’injection dans le code

- **Fichier** : `src/services/blockOrchestrator.ts`.
- **Moment** : Dans `handleBlock2A`, **après** `storeAnswerForBlock(candidateId, blockNumber, 1, userMessage)` quand `questionIndex === 1` (réponse 2A.2).
- **Séquence** :
  1. Stocker la réponse brute (déjà fait).
  2. Recharger le candidate.
  3. **Nouveau** : appeler `normalizeWorksLLM(preferencesAnswer)` (nouvelle méthode privée).
  4. Si `needsClarification` → retourner `{ response: message, expectsAnswer: true }` sans avancer ; ne pas remplir `normalizedWorks`.
  5. Sinon : `candidateStore.setNormalizedWorks(candidateId, works)` (nouveau sur le store), puis continuer le flux actuel (génération 2A.3 si 2 réponses, transition 2B si 3 réponses).
- **Remplacement** : L’entrée 2B ne lit plus `parseWorks(preferencesAnswer)` pour la liste d’œuvres ; elle lit `candidate.session.normalizedWorks` (et en dérive `works = normalizedWorks.map(w => w.canonicalTitle)`). Si `normalizedWorks` est vide ou absent → message utilisateur demandant de reprendre la phase préférences (pas de throw).

### 2.4 Cache

- **Clé** : hash du texte brut (ex. `sha256(raw).slice(0,16)`).
- **Valeur** : `{ works: NormalizedWork[] }` ou `{ needsClarification, message }`.
- **Portée** : mémoire (Map), pas de persistance. Évite appels redondants si même formulation rejouée (ex. tests).

---

## 3. Normalisation intelligente des personnages (2B)

### 3.1 Règle métier

- **Déclencheur** : après stockage de la réponse à la question « personnages » d’**une** œuvre (une seule question par œuvre).
- **Input** : `{ work: string, rawAnswer: string }` (œuvre = titre canonique issu de `normalizedWorks`).
- **Output** : JSON strict ; résolution des descriptions indirectes ; max 3 personnages ; si ambiguïté → clarification propre.
- **Stockage** : `candidate.session.normalizedCharacters[workIndex] = characters`.

### 3.2 Format de sortie LLM (JSON strict)

```ts
interface NormalizedCharacter {
  canonicalName: string;
  confidence: number;
}

// Réponse attendue
{
  "characters": NormalizedCharacter[]  // length 1..3
}
// Ou
{
  "needsClarification": true,
  "message": "Message court pour préciser le personnage"
}
```

### 3.3 Point d’injection dans le code

- **Fichier** : `src/services/blockOrchestrator.ts`.
- **Moment** : Dans `handleBlock2B`, **après** `storeAnswerForBlock(..., questionIndex, userMessage)` quand la question servie était une question **« personnages »** pour une œuvre donnée.
- **Détermination « personnages »** : avec la nouvelle structure de queue (voir §4), on connaît pour chaque `questionIndex` le type (motif / personnages / trait / récap) et le `workIndex`. Dès que le type est « personnages », après stockage :
  1. Récupérer `rawAnswer = userMessage`, `work = normalizedWorks[workIndex].canonicalTitle`.
  2. Appeler `normalizeCharactersLLM({ work, rawAnswer })`.
  3. Si `needsClarification` → retourner le message à l’utilisateur, ne pas avancer le curseur, ne pas remplir `normalizedCharacters[workIndex]`.
  4. Sinon : `candidateStore.setNormalizedCharacters(candidateId, workIndex, characters)` puis enchaîner avec génération des questions « traits » pour cette œuvre (voir §4).
- **Cache** : clé `work + "|" + hash(rawAnswer)` ; valeur `{ characters }` ou `{ needsClarification, message }`.

---

## 4. Génération dynamique des traits par personnage

### 4.1 Nouvelle architecture 2B (sans génération globale unique)

- **Plus** : un seul `generateQuestions2B` qui produit tout (motifs + personnages + traits + récaps).
- **Nouveau** :
  1. **Phase initiale (entrée 2B)** : une seule génération LLM qui produit **uniquement** les questions **motif** et **personnages** pour les 3 œuvres (ordre : œuvre #3, #2, #1). Soit 6 questions : motif #3, personnages #3, motif #2, personnages #2, motif #1, personnages #1. Aucune question « traits » ni « récap » à ce stade.
  2. **Queue initiale** : `queue.questions = [motif W3, personnages W3, motif W2, personnages W2, motif W1, personnages W1]` (6 éléments).
  3. **Après chaque réponse « personnages »** (voir §3) : normalisation personnages → pour **chaque** personnage normalisé, **un** mini-appel LLM avec `{ work, character, context }` → une question + 5 options. Puis génération d’**un** micro-récap pour cette œuvre. **Insertion** de ces questions (traits + récap) dans la queue **juste après** la question « personnages » qui vient d’être répondue.
  4. **Service des questions** : inchangé côté UX (on sert `queue.questions[cursorIndex]` puis on avance). Les questions de traits contiennent déjà le **nom canonique** (plus de placeholder `[NOM DU PERSONNAGE]` à remplacer a posteriori).

### 4.2 Format mini-appel « traits » (par personnage)

- **Input** :
  - `work` : titre canonique.
  - `character` : nom canonique du personnage.
  - `context` : résumé bref de l’œuvre (optionnel, 1–2 phrases ou extrait du prompt AXIOM).
- **Output JSON strict** :
```ts
{
  "question": "Qu'est-ce que tu apprécies le PLUS chez Ragnar Lothbrok ?",
  "options": [ "option A", "option B", "option C", "option D", "option E" ]
}
```
- Contraintes : traits spécifiques à ce personnage ; pas de recyclage générique ; ton premium.

### 4.3 Points d’injection dans le code

- **Génération initiale (motif + personnages)**  
  - **Où** : `handleBlock2B`, branche `if (!queue || queue.questions.length === 0)`.  
  - **Changement** : au lieu d’appeler `generateQuestions2B` (tout-en-un), appeler une nouvelle méthode `generateMotifAndPersonnagesQuestions2B(candidate, works, coreWork)` qui retourne **6** questions (2 par œuvre). Les `works` viennent de `candidate.session.normalizedWorks` (titres canoniques).  
  - **Stockage** : `candidateStore.setQuestionsForBlock(candidateId, blockNumber, these6Questions)`.

- **Après réponse à une question « personnages »**  
  - **Où** : dans `handleBlock2B`, après `storeAnswerForBlock` et rechargement du candidate, détecter que la question à l’index `questionIndex` est une question « personnages » (grâce à la structure de queue fixe : indices 1, 3, 5 = personnages pour workIndex 0, 1, 2).  
  - **Séquence** :  
    1. `workIndex = questionIndex === 1 ? 0 : questionIndex === 3 ? 1 : 2`.  
    2. Normalisation personnages (cf. §3).  
    3. Pour chaque `character` dans `normalizedCharacters[workIndex]` : `generateTraitsForCharacterLLM(work, character, context)` → une question + 5 options.  
    4. Génération du micro-récap pour cette œuvre (un petit appel dédié ou une fonction déterministe à partir des questions déjà générées).  
    5. **Insertion** : `candidateStore.insertQuestionsAt(candidateId, blockNumber, questionIndex + 1, [traitQ1, traitQ2, ..., recap])`.  
  - Puis continuer le flux : servir la question suivante (première question « traits » insérée).

- **Suppression** :  
  - `generateQuestions2B` (génération globale) et `generateQuestions2BWithReconciliation` ne sont plus utilisés pour la construction de la queue.  
  - `serveNextQuestion2B` n’a plus à remplacer `[NOM DU PERSONNAGE]` : les questions de traits sont déjà générées avec le nom réel.

### 4.4 Structure de la queue 2B (après refonte)

- **Initiale** : 6 questions, indices 0..5.
  - 0 : motif œuvre #3, 1 : personnages #3, 2 : motif #2, 3 : personnages #2, 4 : motif #1, 5 : personnages #1.
- **Après réponse personnages #3** : insertion après index 1 de N1 traits + 1 récap (N1 = nombre de personnages normalisés pour l’œuvre #3). Queue : `[0, 1, (N1 traits + récap), 2, 3, 4, 5]`.
- **Après réponse personnages #2** : insertion après l’index actuel de la question « personnages #2 » (qui aura été décalé par les insertions précédentes). Il faut donc repérer la question « personnages » par un **marqueur** (ex. métadonnée par index) plutôt que par index fixe, ou recalculer l’index après insertions. **Recommandation** : stocker pour chaque question un `meta: { workIndex?, slot: 'motif'|'personnages'|'trait'|'recap', characterIndex? }` (voir §5) pour savoir à tout moment quelle question est « personnages » pour quel `workIndex`, et à quel index insérer les traits + récap.
- **Alternative plus simple** : ne pas mélanger les œuvres dans une seule queue plate. Ordre strict : toutes les questions de l’œuvre #3 (motif, personnages, trait1…traitN, récap), puis œuvre #2, puis #1. Ainsi, après réponse « personnages #3 », on insère à position 2 ; après réponse « personnages #2 », l’index de la question « personnages #2 » est connu (2 + N1 + 1 + 2 = 5 + N1). Gestion plus simple si on garde un compteur `questionsInsertedPerWork[workIndex]`.

### 4.5 Cache traits

- **Clé** : `work + "|" + character` (noms canoniques).
- **Valeur** : `{ question, options }`.
- Évite de régénérer les traits pour le même couple œuvre/personnage (ex. rejeu de session).

---

## 5. Structure de stockage

### 5.1 Session (CandidateSession)

- **Fichier** : `src/types/candidate.ts`.
- **Ajouts** :
```ts
// Dans CandidateSession
normalizedWorks?: Array<{ canonicalTitle: string; type: 'series' | 'film'; confidence: number }>;
normalizedCharacters?: Array<Array<{ canonicalName: string; confidence: number }>>; // indexed by workIndex
```
- **Persistance** : même mécanisme que le reste de la session (sessionStore persiste le candidate dont `session`).

### 5.2 Store (sessionStore)

- **Nouvelles méthodes** (ou extension de `updateSession` avec champs optionnels) :
  - `setNormalizedWorks(candidateId: string, works: NormalizedWork[]): AxiomCandidate | undefined`
  - `setNormalizedCharacters(candidateId: string, workIndex: number, characters: NormalizedCharacter[]): AxiomCandidate | undefined`
- **Implémentation** : merger dans `candidate.session` (shallow copy session puis assignation `normalizedWorks` / `normalizedCharacters[workIndex]`), puis `persistCandidate`.

### 5.3 Queue 2B (optionnel mais recommandé)

- Pour permettre insertion et identification fiable des questions « personnages » :
  - Soit **étendre** `QuestionQueue` avec un tableau parallèle `meta?: Array<{ workIndex: number; slot: 'motif'|'personnages'|'trait'|'recap'; characterIndex?: number }>` (même longueur que `questions`).
  - Soit garder une queue de chaînes et dériver le type à partir de l’index (formule explicite par phase : 2 questions par œuvre en initial, puis blocs variables après insertions). La formule devient fragile dès qu’on insère ; d’où la recommandation d’un `meta` explicite.

### 5.4 Méthode d’insertion dans la queue

- **Nouvelle méthode** : `insertQuestionsAt(candidateId: string, blockNumber: number, atIndex: number, newQuestions: string[], newMeta?: ...): void`
- Comportement : `questions.splice(atIndex, 0, ...newQuestions)` (et si `meta` existe, `meta.splice(atIndex, 0, ...newMeta)`), puis persister. Ne pas réinitialiser `cursorIndex` ; le curseur pointe déjà vers la prochaine question à servir (éventuellement la première insérée si on insère juste après la question courante et qu’on n’a pas encore avancé — à trancher selon le flux exact).

---

## 6. Estimation tokens (par parcours type)

Hypothèses : 3 œuvres, 2 personnages par œuvre en moyenne (6 personnages au total), modèles type gpt-4o.

| Étape | Appel | Input (approx.) | Output (approx.) |
|-------|--------|------------------|-------------------|
| 2A.2 normalisation | 1 | ~400 (prompt + raw) | ~150 (JSON) |
| 2B motif + personnages | 1 | ~1200 (contexte + 3 œuvres) | ~600 (6 questions) |
| 2B normalisation personnages | 3 | ~350 × 3 | ~120 × 3 |
| 2B traits (mini par personnage) | 6 | ~450 × 6 | ~200 × 6 |
| 2B micro-récaps | 3 | ~300 × 3 | ~80 × 3 |
| **Total nouveau (2A.2 + 2B)** | **~17** | **~5 500** | **~2 400** |

- En **cumul** par parcours 2A+2B : de l’ordre de **8–9 k tokens** (input + output). Les appels 2A (2A.2, 2A.3) et le miroir 2B restent inchangés côté volume ; l’augmentation vient des normalisations et des mini-appels traits.
- Cache : en cas de rejeu identique (même texte 2A.2 / mêmes réponses personnages), les appels normalisation et traits peuvent être évités, ce qui réduit fortement le volume.

---

## 7. Impacts sur le flux actuel

### 7.1 BLOC 2A

- **2A.1** : inchangé.
- **2A.2** : après stockage de la réponse, ajout d’un appel LLM de normalisation ; en cas de succès, écriture de `session.normalizedWorks` ; en cas de clarification, retour du message sans avancer. La génération de la question 2A.3 et la transition 2B s’appuient sur la présence de `normalizedWorks` (ou, en fallback temporaire, sur les réponses brutes si on garde une compatibilité de migration).
- **2A.3** : inchangé (œuvre noyau). On peut optionnellement vérifier que l’œuvre noyau fait partie des `normalizedWorks` pour cohérence.

### 7.2 BLOC 2B

- **Entrée** : plus de `parseWorks` ; lecture de `candidate.session.normalizedWorks`. Si vide/absent → message utilisateur (pas d’exception). Génération initiale = 6 questions (motif + personnages uniquement).
- **Réponse utilisateur** : lorsqu’elle correspond à une question « personnages », enchaînement : normalisation personnages → stockage `normalizedCharacters[workIndex]` → génération des questions traits (1 appel par personnage) + 1 micro-récap → insertion dans la queue → service de la question suivante.
- **Miroir 2B** : inchangé en entrée/sortie ; il peut continuer à utiliser `works` dérivé de `normalizedWorks` pour le contexte.

### 7.3 Rétrocompatibilité / migration

- **Candidats en cours** : ceux déjà en 2B avec l’ancienne queue (questions générées en une fois) peuvent être gérés soit par un **flag** `session.premium2B = true` pour les nouveaux parcours, soit en détectant la présence de `normalizedWorks` à l’entrée 2B. Si `normalizedWorks` est absent et que la queue existe déjà → considérer l’ancien flux (pas d’insertion dynamique, garder le remplacement `[NOM DU PERSONNAGE]` pour ces sessions). Pour les nouvelles sessions, toujours remplir `normalizedWorks` en 2A.2 et utiliser le nouveau flux 2B.
- **API / contrat** : aucun changement attendu côté routes ou SSE ; seuls les contenus des questions et le nombre d’appels changent.

### 7.4 Fichiers à modifier (liste indicative)

| Fichier | Modification |
|---------|--------------|
| `src/types/candidate.ts` | Ajout `normalizedWorks` et `normalizedCharacters` dans `CandidateSession`. |
| `src/store/sessionStore.ts` | `setNormalizedWorks`, `setNormalizedCharacters`, `insertQuestionsAt` ; éventuellement étendre `updateSession` pour accepter ces champs. |
| `src/services/blockOrchestrator.ts` | Nouveaux : `normalizeWorksLLM`, `normalizeCharactersLLM`, `generateTraitsForCharacterLLM`, `generateMotifAndPersonnagesQuestions2B`, logique « après réponse personnages » + insertion ; lecture des œuvres depuis `session.normalizedWorks` à l’entrée 2B ; plus d’usage de `parseWorks` pour la source 2B ; plus de remplacement `[NOM DU PERSONNAGE]` dans `serveNextQuestion2B` pour les nouvelles questions. |
| `src/types/blocks.ts` | Optionnel : étendre `QuestionQueue` avec `meta` pour le type de question (motif / personnages / trait / récap) et workIndex / characterIndex. |

---

## 8. Règle absolue (rappel)

- Les réponses utilisateur peuvent contenir : fautes, noms partiels, descriptions indirectes, absence de virgules.
- Le moteur **doit** : comprendre (via LLM), normaliser (œuvres + personnages), reformuler proprement (titres et noms canoniques).
- **Aucune** dépendance structurelle au split regex pour l’extraction des œuvres ou des personnages dans les blocs 2A/2B premium. Les regex peuvent rester en secours uniquement si une politique de fallback est définie (hors scope de ce plan).

---

## 9. Prochaines étapes après validation

1. Valider ce plan (produit / technique).
2. Étendre les types (`CandidateSession`, éventuellement `QuestionQueue`).
3. Implémenter le store (`setNormalizedWorks`, `setNormalizedCharacters`, `insertQuestionsAt`).
4. Implémenter les appels LLM (normalisation œuvres, personnages, traits) avec parsing JSON strict et gestion `needsClarification`.
5. Brancher la normalisation 2A.2 et la lecture `normalizedWorks` à l’entrée 2B.
6. Remplacer la génération globale 2B par motif+personnages puis génération dynamique des traits + insertion.
7. Ajouter les caches en mémoire (œuvres, personnages, traits).
8. Tests de bout en bout (2A.2 avec fautes, 2B avec « le fils de Ragnar », vérification de la spécificité des traits par personnage).

**Aucune implémentation avant validation du plan.**
