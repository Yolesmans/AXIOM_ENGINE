# Audit technique — Chaîne BLOC 2B (œuvres, traits, robustesse)

**Date** : 2025-02-10  
**Périmètre** : 2A.2 (œuvres) → parseWorks → injection → génération 2B → appel(s) LLM → rendu UI.  
**Contrainte** : Aucune modification de code ; diagnostic uniquement.

---

## 1. Synthèse des symptômes et objectif de l’audit

**Symptômes constatés** :
1. Extraction des œuvres dégradée (ex. "Peaky Blinders, viking suits" traité comme une œuvre "Viking Suits" au lieu de deux : "Vikings", "Suits").
2. Génération des traits devenue générique (ex. Ragnar et Björn reçoivent les mêmes propositions).
3. Perte de robustesse sur fautes et formulations libres (correction orthographique, références indirectes type "le fils de Ragnar" → Björn).

**Objectif** : Comprendre où la logique « intelligente » a été remplacée par une logique simplifiée ou générique, sans appliquer de patch.

---

## 2. Chaîne complète — traçage

### 2.1 2A.2 (réponse « préférences » / œuvres)

- **Stockage** : La réponse utilisateur à la question 2A.2 (préférences en séries/films) est enregistrée **telle quelle** dans `answerMaps[2].answers[1]` (clé `1`), sans aucun appel LLM, sans normalisation, sans correction orthographique.
- **Référence** : `handleBlock2A` → `storeAnswerForBlock(candidateId, 2, 1, userMessage)` (l.661 pour 2A.2, `questionIndex === 1`). Aucun autre chemin ne modifie cette réponse avant stockage.
- **Conclusion** : Il n’existe **aucune** étape de « normalisation intelligente » ou de correction des œuvres côté 2A.2 dans le code actuel. La chaîne n’a jamais contenu, dans les fichiers analysés, un appel LLM dédié à la normalisation/correction de la réponse 2A.2.

### 2.2 parseWorks (extraction des œuvres)

- **Implémentation actuelle** : `blockOrchestrator.ts` (l.1186–1202).
- **Logique** :
  - `raw = preferencesAnswer.trim().replace(/\s+/g, ' ')`
  - `parts = raw.split(/[,;\n]+/).map(trim).filter(length > 0)`
  - Si `parts.length === 0` → `return [raw]` (toute la chaîne = une seule « œuvre »)
  - Sinon → `return parts.slice(0, 3)`
- **Aucun** appel LLM, aucune correction orthographique, aucune reconnaissance de titres (ex. "viking suits" → Vikings + Suits). La séparation repose **uniquement** sur les délimiteurs `,`, `;`, `\n`.

**Effet des modifications récentes** :
- **Avant** (version stricte) : même logique de split (virgules / retours à la ligne) ; si `works.length < 3` → **throw**, donc le flux 2B ne démarrait pas.
- **Après** (version tolérante) :
  - Si l’utilisateur ne met **pas** de virgule (ex. "Peaky Blinders viking suits"), `split` ne découpe pas → `parts.length === 0` → **une seule œuvre** = `"Peaky Blinders viking suits"`. C’est ce comportement qui peut être perçu comme « une seule œuvre Viking Suits » (chaîne entière interprétée comme un titre).
  - Si l’utilisateur écrit "Peaky Blinders, viking suits", on obtient **deux** segments : `["Peaky Blinders", "viking suits"]`. Le second segment reste "viking suits" (non découpé en "Vikings" et "Suits"), car il n’y a pas de virgule entre les deux.

**Conclusion** : La logique d’extraction des œuvres a **toujours** été uniquement regex (split sur délimiteurs). Les changements récents n’ont pas « supprimé » une normalisation LLM ; ils ont :
- rendu possible l’entrée en 2B avec 1 ou 2 œuvres (plus de throw),
- et introduit le cas « pas de délimiteur » → une seule œuvre = chaîne brute, ce qui dégrade l’extraction dès que l’utilisateur ne sépare pas explicitement par virgule.

### 2.3 Injection dans le contexte 2B

- **Entrée handleBlock2B** : `preferencesAnswer = answers[1]`, `works = this.parseWorks(preferencesAnswer)` (l.1007).
- **Prompts 2B** : Les variables `works[0]`, `works[1]`, `works[2]` sont injectées telles quelles dans le prompt système (ex. `Œuvre #1 : ${works[0] || 'N/A'}`, etc.). Aucune correction ni reformulation n’est appliquée aux chaînes de `works`.
- **Conclusion** : Les noms d’œuvres vus par le LLM sont **exactement** ceux produits par `parseWorks`. Faute de typo ou chaîne ambiguë ("viking suits") reste inchangée.

### 2.4 Génération des questions 2B (motifs, personnages, traits)

- **Point d’entrée** : `generateQuestions2B(candidate, works, coreWork)` (l.1207–1331).
- **Appel LLM** : **Un seul** `callOpenAI` (l.1215) qui génère **toute** la séquence de questions 2B en une fois : motifs, questions personnages, questions traits (avec placeholder `[NOM DU PERSONNAGE]`) et micro-récaps, pour les 3 œuvres (ou moins si `works.length < 3`, avec `'N/A'` pour les œuvres manquantes).
- **Moment de l’appel** : Au **premier** passage en 2B (queue vide). À ce moment, l’utilisateur n’a **pas encore** répondu aux questions « personnages » : le LLM ne connaît donc pas les noms réels (Ragnar, Björn, etc.). Il génère pour des entités abstraites (« Personnage 1 », « Personnage 2 », etc.) et utilise le placeholder `[NOM DU PERSONNAGE]` dans le libellé.
- **Conséquence** : Les **propositions de traits** (A/B/C/D/E) pour chaque question « traits » sont fixées à ce **unique** appel. Elles ne sont pas régénérées plus tard avec le nom réel du personnage. Donc :
  - Le modèle peut produire des traits différenciés entre « Personnage 1 », « Personnage 2 », « Personnage 3 » d’une même œuvre, mais sans savoir qu’il s’agit de Ragnar vs Björn.
  - Si le LLM tend à générer des propositions peu différenciées entre personnages (par manque de signal), les traits paraissent « génériques » une fois les vrais noms injectés à l’affichage.

**Conclusion** : Il n’y a **pas** d’« appel API dynamique pour chaque personnage ». Un seul appel génère tout le bloc ; la personnalisation par personnage repose entièrement sur la capacité du modèle à distinguer « Personnage 1 / 2 / 3 » dans ce seul passage, sans connaissance des noms réels.

### 2.5 Injection du nom du personnage au service de la question

- **Où** : `serveNextQuestion2B` (l.1779–1795). Lorsqu’une question contient `[NOM DU PERSONNAGE]`, le code remplace ce placeholder par le nom issu de la réponse « personnages » de la même œuvre (parsing via `parseCharacterNames`).
- **Effet** : Seul le **texte de la question** affichée est personnalisé (ex. « Chez Ragnar, qu’est-ce que tu apprécies le plus ? »). Les **propositions A/B/C/D/E** ne sont pas régénérées ; elles sont celles produites au moment de `generateQuestions2B`, avec le placeholder encore présent côté LLM.
- **Conclusion** : Les prompts utilisent bien le nom **réel** au moment du **rendu** (après remplacement), mais le LLM qui a **généré** les propositions n’a jamais vu ce nom. Aucun fallback générique n’est activé « par erreur » : le flux est le même qu’avant ; la limite est structurelle (une seule génération pour tous les personnages).

### 2.6 Fallback générique

- Aucune branche ne bascule vers un « mode générique » selon `works.length` ou autre. Avec 1 ou 2 œuvres, le même `generateQuestions2B` est appelé ; le prompt reçoit `works[0]`, `works[1] || 'N/A'`, `works[2] || 'N/A'`. Le LLM peut donc produire du contenu moins riche ou plus répétitif pour les slots `'N/A'`, mais ce n’est pas un fallback explicite du code, c’est une conséquence du contenu du prompt.

### 2.7 Robustesse : fautes, références indirectes

- **Correction orthographique** (ex. "peacki blindé" → "Peaky Blinders") : Aucune étape du code ne fait appel à un LLM (ou autre) pour normaliser/corriger la réponse 2A.2 ou les noms d’œuvres. `parseWorks` et l’injection utilisent la chaîne brute.
- **Références indirectes** (ex. "le fils de Ragnar" → Björn) : Les réponses « personnages » sont stockées brutes et parsées par `parseCharacterNames` (split sur virgules, « et », etc.). Aucun appel LLM ne résout les descriptions en noms canoniques. Le prompt de `generateQuestions2BWithReconciliation` demande au LLM d’utiliser des noms canoniques dans les **questions qu’il génère**, pas de réécrire les **réponses utilisateur**.
- **Conclusion** : Le moteur actuel ne contient **pas** de logique de correction d’orthographe ni de résolution de références indirectes pour les entrées utilisateur (2A.2 ou réponses personnages). Si un tel comportement existait « avant la sécurisation du BLOC 2A », il devait reposer sur un autre chemin (non présent dans les fichiers audités) ou sur une attente forte envers le LLM dans un contexte qui a pu changer (prompt, modèle, ou format d’entrée).

---

## 3. Réponses aux points de vérification demandés

| Point | Réponse |
|-------|--------|
| L’appel API dynamique est-il exécuté pour **chaque** personnage ? | **Non.** Un seul appel (`generateQuestions2B`) génère toutes les questions et toutes les propositions (motifs + personnages + traits) pour toutes les œuvres et tous les personnages. |
| Les prompts utilisent-ils le nom réel injecté ? | **Au rendu, oui** : `serveNextQuestion2B` remplace `[NOM DU PERSONNAGE]` par le nom saisi. **À la génération, non** : le LLM n’a pas les noms réels au moment de l’appel. |
| Un fallback générique est-il activé par erreur ? | **Non.** Aucune branche ne bascule vers un mode générique ; le même flux est utilisé avec 1, 2 ou 3 œuvres. |
| parseWorks / tolérances ont-ils supprimé une normalisation intelligente ? | **Non.** Aucune normalisation LLM des œuvres n’existe dans le code. parseWorks a toujours été du split regex ; les changements ont ajouté la tolérance (1–2 œuvres, pas de throw) et le cas « pas de délimiteur » → une œuvre = chaîne entière, ce qui peut dégrader l’extraction. |
| La séparation des œuvres repose-t-elle uniquement sur un split regex ? | **Oui.** Uniquement `split(/[,;\n]+/)` (et trim/filter). Aucune analyse LLM pour extraire ou corriger les titres. |

---

## 4. Causes racines identifiées (sans patch)

### 4.1 Extraction dégradée (ex. "viking suits" → une œuvre)

- **Cause** : Séparation **uniquement** par délimiteurs `,`, `;`, `\n`. Aucune segmentation sémantique (ex. "viking suits" en deux titres "Vikings" et "Suits").
- **Aggravation** : Quand l’utilisateur ne met pas de virgule, `parts.length === 0` → une seule œuvre = chaîne complète ("Peaky Blinders viking suits"), ce qui favorise une interprétation type « Viking Suits » ou une seule œuvre mal formée.

### 4.2 Traits génériques entre personnages (ex. Ragnar / Björn)

- **Cause** : **Une seule** génération LLM pour tout le bloc 2B, **avant** que les noms des personnages soient connus. Les propositions de traits sont donc produites pour « Personnage 1 / 2 / 3 » sans lien avec Ragnar ou Björn. L’injection du nom ne modifie que le libellé de la question, pas les options A/B/C/D/E.
- Il n’y a pas eu remplacement d’une logique « par personnage » par une logique générique : l’architecture actuelle n’a qu’un seul appel de génération pour tout le bloc.

### 4.3 Perte de robustesse (fautes, références indirectes)

- **Cause** : Aucune étape du code ne :
  - corrige l’orthographe des œuvres ou des personnages,
  - ni ne résout les descriptions (« le fils de Ragnar ») en noms canoniques pour les **réponses utilisateur**.
- Les instructions de « réconciliation » / « nom canonique » dans les prompts concernent les **questions générées** par le LLM, pas la normalisation des entrées utilisateur.

---

## 5. Chaîne résumée (2A.2 → UI)

| Étape | Fichier / méthode | Ce qui se passe | Normalisation / LLM ? |
|-------|-------------------|-----------------|------------------------|
| 1. Réponse 2A.2 | handleBlock2A | Stockage brut dans `answerMaps[2].answers[1]` | Aucune |
| 2. Extraction œuvres | parseWorks | Split `[,;\n]+`, si vide → `[raw]`, sinon `slice(0,3)` | Aucune |
| 3. Entrée 2B | handleBlock2B | `works = parseWorks(preferencesAnswer)` ; si `works.length === 0` → message utilisateur, sinon suite | Aucune |
| 4. Génération questions 2B | generateQuestions2B | **Un** callOpenAI : toutes les questions + toutes les propositions (motifs, personnages, traits) ; noms réels inconnus à ce moment | Un seul appel, pas par personnage |
| 5. Service question | serveNextQuestion2B | Remplacement `[NOM DU PERSONNAGE]` par le nom issu de la réponse « personnages » (parseCharacterNames) | Injection uniquement, pas de nouvel appel LLM |
| 6. Rendu UI | Réponse HTTP / SSE | Texte de la question (avec nom injecté) + propositions générées une fois pour toutes | — |

---

## 6. Conclusion et pistes (pour décision produit, sans modification)

- **Extraction des œuvres** : La logique actuelle est et a toujours été **regex uniquement**. Pour retrouver une extraction « intelligente » (séparation sémantique, correction de titres), il faudrait introduire une étape dédiée (ex. appel LLM ou service de normalisation) **avant** ou **à la place** de la seule utilisation de `parseWorks`.
- **Traits spécifiques par personnage** : L’architecture actuelle (une génération globale avant les réponses personnages) ne permet pas de générer des traits conditionnés au **nom** du personnage. Pour avoir des traits vraiment spécifiques à Ragnar vs Björn, il faudrait soit des appels LLM **après** réception de chaque réponse « personnages » (une génération par question traits), soit un second passage LLM qui régénère uniquement les propositions de traits en prenant en entrée les noms réels.
- **Robustesse (fautes, références)** : Aucune brique de normalisation/correction des **entrées** utilisateur n’existe aujourd’hui. Toute amélioration (orthographe, résolution de références) supposerait d’ajouter un tel module (LLM ou règles) sur la réponse 2A.2 et/ou sur les réponses « personnages », sans que les changements récents n’aient « supprimé » une telle brique dans le code audité.

**Aucune modification de code n’a été effectuée dans le cadre de cet audit.**
