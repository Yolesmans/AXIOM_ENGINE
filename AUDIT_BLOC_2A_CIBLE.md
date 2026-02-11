# Audit ciblé — BLOC 2A (source du problème)

**Objectif** : Vérifier factuellement si le BLOC 2A est bien l’unique source (latence, retries, validations, appels API inutiles). Aucune modification de code. Aucune refonte.

---

## 1) CONFIRMATION FORMELLE — Tableau par bloc

| Bloc | Questions LLM ? | Validation bloquante ? | Peut bloquer l’état ? | Preuve (fichier + ligne) |
|------|------------------|-------------------------|------------------------|---------------------------|
| **1** | **NON** | N/A | Non | `blockOrchestrator.ts` 211–217 : `STATIC_QUESTIONS[1]`, pas d’appel LLM. |
| **2A** | **OUI** (3 appels : 2A.1, 2A.2, 2A.3) | **OUI** (format stricte 2A.1 et 2A.3 → retry) | **Non** (toujours une question renvoyée) | 2A.1 : 717–759 `validateQuestion2A1` + retry si `retryCount < 1` ; après retry on renvoie quand même la question (755–758). 2A.3 : 794–845 idem. Aucun `throw` en échec de validation. |
| **2B** | **OUI** (1 batch + retry/reconciliation possibles) | **OUI** (motifs/traits après retry → throw) | **Oui** (erreur utilisateur, pas de questions servies) | `blockOrchestrator.ts` 1537 : `throw new Error('BLOC 2B validation failed...')` ; `server.ts` 804–816 : catch → 200 + message d’erreur. |
| **3–9** | **NON** | N/A | Non | Executor : `getStaticQuestion` (catalogue), pas de LLM pour les questions. |

**Réponses directes :**

- **Blocs qui déclenchent un appel LLM pour les QUESTIONS** : **2A** (3 questions) et **2B** (1 génération en batch).
- **Blocs avec validation + retry** : **2A** (2A.1 et 2A.3, validation de format ; retry max 1, puis on renvoie la question quand même) ; **2B** (validation sémantique motifs/traits + character names ; retry max 1, puis **throw** si échec).
- **Bloc qui peut bloquer l’avancement de l’état global** : **2B** uniquement (throw → message d’erreur côté utilisateur, pas de questions servies). **2A ne lance jamais d’exception** en cas d’échec de validation : après au plus 1 retry, la question est renvoyée (avec log d’erreur).

---

## 2) COMPARAISON 2A vs 2B (CODE)

| Critère | BLOC 2A | BLOC 2B | Preuve |
|--------|---------|---------|--------|
| **Même orchestrator ?** | Oui | Oui | `handleBlock2A` / `handleBlock2B` dans `blockOrchestrator.ts` ; même `handleMessage` selon `currentBlock` + step. |
| **Génération questions** | 3 appels séparés (1 par question) | 1 appel batch (toutes les questions) | 2A : 599, 646, 671 (`generateQuestion2A1`, `2A2`, `2A3`). 2B : 970 `generateQuestions2B` (un seul `callOpenAI` avec séparateur). |
| **Validator** | **Format strict** (2A.1 et 2A.3) | **Sémantique** (motifs, traits, noms personnages) | 2A : `validators.ts` 238–260 (2A.1 : regex `A\.? Série`, `B\.? Film`), 268–288 (2A.3 : « une œuvre », « série/film »). 2B : `validateMotifsSpecificity`, `validateTraitsSpecificity`, `validateCharacterNames`. |
| **Retry logic** | Inline dans chaque générateur, max 1 retry | Batch : `validateAndRetryQuestions2B`, max 1 retry | 2A : 749–751 (2A.1), 835–837 (2A.3). 2B : 1485–1537 (retry puis throw si encore invalide). |
| **Comportement après échec validation** | **Toujours renvoyer** une question (avec warning) | **Throw** → erreur côté serveur → message utilisateur | 2A : 755–758, 841–843 (return question). 2B : 1537 throw ; server 804–816 catch. |
| **2A.2** | Aucune validation, aucun retry | — | 762–792 : `callOpenAI` puis `return completion.trim()`. |
| **Format attendu** | 2A.1 : chaînes littérales « A. Série » / « B. Film ». 2A.3 : « une œuvre » + « œuvre/série/film ». | Structure batch + spécificité motifs/traits, noms canoniques | Validators ci-dessus ; 2B pas de regex sur forme de phrase. |
| **Gestion réponses utilisateur** | `storeAnswerForBlock` + `answerMaps[2]` ; génération question suivante selon `updatedAnsweredCount`. | `storeAnswerForBlock` + queue 2B ; `serveNextQuestion2B`. | 2A : 624–706. 2B : 994–995, 1011–1012, etc. |
| **Impact conversationHistory / state** | `appendAssistantMessage` à chaque question ; `updateUIState` ; transition 2A→2B après 3 réponses. | `setQuestionsForBlock` puis `serveNextQuestion2B` ; miroir puis validation → passage BLOC 3. | Même store, même mise à jour session/UI. |

**Conclusion comparaison :**

- **2A est plus fragile côté logs et latence** : validation de **format** très stricte sur 2A.1 (et 2A.3). Le LLM renvoie souvent des variantes (« A) Série », « Série (A) », etc.) → échec validation → retry → 2e appel API → logs « Question 2A.1 validation failed, retry ». L’avancement n’est jamais bloqué (on renvoie toujours une question).
- **2B** peut **bloquer** l’état (throw + message d’erreur) mais tu indiques qu’il fonctionne correctement en pratique ; ses validations portent sur le contenu sémantique du batch, pas sur la forme d’une phrase unique.
- **Cause des logs « retries + validation failures UNIQUEMENT sur 2A.1 »** : seul 2A.1 (et éventuellement 2A.3) a une validation **format** stricte + retry ; 2A.2 n’a pas de validation ; 2B a d’autres validateurs et un autre type d’erreur (fatale, pas « retry then serve anyway »).

---

## 3) VERROUILLAGE — QUESTION, PAS SOLUTION (recommandation minimale)

**Question :** Quelle est la manière la **plus simple** et la **moins invasive** de verrouiller le BLOC 2A (choix Film/Série, etc.) en conservant l’adaptation du flux (film vs série), la collecte pour le BLOC 2B, sans nouvelle logique, sans casser l’existant, sans modifier le BLOC 2B ?

**Recommandation minimale (sans code) :**

- **Principe** : réutiliser le même principe que BLOC 1 — **une question statique** pour l’étape qui pose le plus de problème (format fixe, 0 token).
- **Cible** : **Uniquement la question 2A.1** (Médium Série/Film). C’est la seule qui, dans le code, déclenche validation stricte + retry et qui correspond aux logs « validation failures UNIQUEMENT sur 2A.1 ».
- **Moyen** : remplacer l’appel à `generateQuestion2A1` (LLM) par **une chaîne fixe** (constante ou catalogue type BLOC 1) pour la question 2A.1. Un seul point de modification : dans `handleBlock2A`, lorsque `answeredCount === 0`, servir cette chaîne au lieu d’appeler `generateQuestion2A1`. Aucun changement pour 2A.2, 2A.3, ni pour 2B.
- **Conservé** : adaptation film/série (2A.2 reste LLM, basée sur la réponse 2A.1) ; collecte 2A → 2B inchangée ; pas de changement de comportement 2B ; pas de déplacement de bloc ni de duplication de logique.
- **Réversibilité** : retirer la constante et réactiver l’appel à `generateQuestion2A1` restaure l’ancien comportement.

**Option plus large (si besoin ultérieur)** : rendre aussi 2A.3 statique (une question « œuvre noyau » fixe) pour supprimer tout retry sur 2A. Ce n’est pas nécessaire pour supprimer les logs actuels (concentrés sur 2A.1).

---

## 4) PREUVE AVANT ACTION

**Oui, le BLOC 2A est bien la cause** des phénomènes observés (latence, retries, validation failures dans les logs) :

- Les **retries** et **validation failures** visibles en prod concernent **uniquement** les questions 2A (et en pratique 2A.1 d’après tes logs) : c’est le seul endroit où une validation de **format** stricte est appliquée sur une sortie LLM puis déclenche un retry (l.748–751, 834–837), tout en renvoyant quand même une question (donc pas de blocage d’état).
- La **latence** sur 2A vient des **3 appels LLM** (2A.1, 2A.2, 2A.3) et, pour 2A.1, d’un **2e appel** en cas de retry.
- **Aucun autre bloc** ne combine : (1) génération de question par LLM, (2) validation de format stricte sur cette sortie, (3) retry puis renvoi de la question. Le 2B a une logique différente (batch, validation sémantique, throw en échec) et fonctionne correctement chez toi.

**Le problème n’est pas ailleurs** (routing, orchestrator général) : le routing BLOC_02 + currentBlock 2 est le même pour 2A et 2B ; la différence est bien la génération 2A (3 appels, validateurs 2A.1/2A.3) vs 2B (1 batch, validateurs sémantiques).

---

## 5) RÉSUMÉ

- **Tableau** : Seuls 2A et 2B utilisent le LLM pour les questions. Seul 2A a validation de format + retry sans blocage ; seul 2B peut bloquer l’état (throw).
- **2A vs 2B** : Même orchestrator, validateurs et retry différents (2A = format strict sur 2A.1/2A.3 ; 2B = sémantique batch). 2A est plus fragile pour les logs et la latence (surtout 2A.1).
- **Verrouillage minimal** : Rendre **2A.1** statique (une question fixe type BLOC 1), sans toucher à 2A.2, 2A.3 ni 2B.
- **Cause** : **Oui, le BLOC 2A (en pratique la question 2A.1) est bien la cause** des retries, validation failures et latence observés. Aucune modification n’a été faite dans le cadre de cet audit ; la section 3 reste une recommandation minimale, pas du code.
