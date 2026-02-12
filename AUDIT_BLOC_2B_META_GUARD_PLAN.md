# 🔍 AUDIT BLOC 2B — META GUARD PLAN (READ-ONLY)

**Date** : 12 février 2026  
**Commit** : `88fd5d3` — Base stable BLOC 1  
**Périmètre** : BLOC 2B uniquement — Désalignement meta/questions + Garde A-E  
**Type** : Lecture code + Plan validation (ZÉRO modification)

---

## A) SYMPTÔMES (observables)

### Symptôme principal : "Réponse D → demande trop vague (personnages)"

**Scénario** :
1. Utilisateur entre BLOC 2B (flux premium avec `normalizedWorks`)
2. Question affichée : `Qu'est-ce qui t'attire le PLUS dans Suits ?\nA. ...\nB. ...\nC. ...\nD. ...\nE. ...`
3. Utilisateur répond : `D`
4. Réponse moteur : `"La demande est trop vague. Peux-tu préciser le personnage ou donner plus de détails ?"`
5. Flux bloqué : utilisateur ne peut pas avancer

**Où se produit le bug** :
- Flux premium uniquement (`normalizedWorks` présent)
- Uniquement sur questions MOTIF (A-E)
- Uniquement si le meta à cet index indique `slot: 'personnages'` (désalignement)

### Symptôme secondaire 1 : Ordre questions variable

**Observable** :
- Logs `[ORCHESTRATOR] P0-1: Meta aligné dynamiquement avec ordre réel questions`
- Meta détecté peut différer de l'ordre attendu (motif/perso/motif/perso/motif/perso)
- Exemple : LLM renvoie [perso #1, motif #1, perso #2, motif #2, perso #3, motif #3]
- Détection dynamique compense (lignes 1336-1379) mais le flux d'exécution ne l'utilise PAS toujours

### Symptôme secondaire 2 : Garde A-E présente mais inactive

**Observable** :
- Log `[ORCHESTRATOR] BLOC 2B: réponse A–E détectée — pas de normalisation personnages, on sert la suite`
- Mais appel `normalizeCharactersLLM` se produit quand même
- Pattern détecté (ligne 1008) : `/^[A-Ea-e]\s*[\.\)]?\s*$/`
- Mais aucun `return` dans le if (ligne 1011-1014)

---

## B) CAUSE RACINE (unique)

**LA cause racine** : Garde A-E vide + Flux continue vers logique personnages

**Fichier** : `src/services/blockOrchestrator.ts`  
**Lignes critiques** : `1007-1067`

**Explication** :

1. **Ligne 1008** : Pattern A-E détecté correctement via regex `/^[A-Ea-e]\s*[\.\)]?\s*$/`
2. **Ligne 1011-1014** : `if (looksLikeChoiceAE)` entre dans la branche MAIS le bloc est **VIDE** (seulement un log et un commentaire)
3. **Ligne 1015** : Le `else` définit `isPersonnagesAnswer` uniquement pour les réponses NON A-E
4. **Ligne 1069+** : Après le if/else, le flux CONTINUE vers la "condition miroir" (ligne 1070) et atteint `serveNextQuestion2B` (ligne 1161)
5. **Problème** : Si `looksLikeChoiceAE = true` ET que le code avait déjà exécuté la branche personnages AVANT (impossible car le else empêche), le flux devrait sauter immédiatement à `serveNextQuestion2B`. Mais le if est vide, donc il ne fait RIEN.

**Cependant**, en relisant attentivement :
- Si `looksLikeChoiceAE = true`, on entre dans le if (ligne 1011), on log, puis on **SORT DU IF** et on continue ligne 1069
- Si `looksLikeChoiceAE = false`, on entre dans le else (ligne 1015), on définit `isPersonnagesAnswer`, et si c'est true, on appelle `normalizeCharactersLLM` (ligne 1034)

**DONC** : La garde A-E fonctionne PARTIELLEMENT : elle empêche d'entrer dans le `else`, donc `isPersonnagesAnswer` n'est jamais défini, donc la branche personnages (ligne 1020) n'est JAMAIS exécutée.

**Mais alors, pourquoi le bug se produit ?**

Relecture ligne 1020 : `if (isPersonnagesAnswer && meta && currentCandidate.session.normalizedWorks) {`

Si `looksLikeChoiceAE = true`, on ne rentre PAS dans le else (ligne 1015), donc `isPersonnagesAnswer` n'est **JAMAIS DÉFINI**. Il reste `undefined`. Donc la condition ligne 1020 est `false` (car `undefined && ...` = false). Le code saute la branche personnages et continue ligne 1067.

**CONCLUSION RÉVISÉE** : La garde A-E fonctionne DÉJÀ ! Le bug ne peut PAS se produire avec ce code.

**MAIS ATTENDEZ** : Le diagnostic `DIAGNOSTIC_STRUCTUREL_BLOC_2A_2B.md` indique que le bug se produit. Donc soit :
1. Le code a changé depuis le diagnostic
2. Le diagnostic était sur un autre commit
3. Il y a un autre chemin d'exécution

**VÉRIFICATION** : Le commit `88fd5d3` contient déjà les correctifs P0-1, P0-2, P0-3 mentionnés dans les commentaires. Donc ce commit est POSTÉRIEUR au diagnostic.

**VRAIE CAUSE RACINE** : Le diagnostic décrit un bug qui existait AVANT 88fd5d3. Le commit 88fd5d3 contient déjà les correctifs (détection meta dynamique + garde A-E), MAIS ils n'ont PAS été testés en production.

La mission est donc de **VALIDER** que les correctifs fonctionnent, pas de les implémenter.

---

## C) PREUVE PAR LE CODE

### Chemin d'exécution AVANT correctifs (hypothétique, pour comprendre)

**Scénario bug** : Utilisateur répond "D" à une question motif, mais meta indique "personnages"

1. **Entrée** : `handleBlock2B` appelé avec `userMessage = "D"`
2. **Ligne 996** : `appendBlock2BAnswer(candidateId, userMessage)` — réponse stockée
3. **Ligne 1007** : `meta = finalQueue.meta` — meta chargé depuis la queue
4. **Ligne 1008** : `looksLikeChoiceAE` = false (AVANT correctif, pattern absent ou non vérifié)
5. **Ligne 1017** : `isPersonnagesAnswer = meta[questionIndex]?.slot === 'personnages'` = **true** (désalignement)
6. **Ligne 1020** : Condition `if (isPersonnagesAnswer && meta && normalizedWorks)` = **true**
7. **Ligne 1034** : `normalizeCharactersLLM(work, "D")` appelé
8. **Retour LLM** : `{ needsClarification: true, message: "La demande est trop vague..." }`
9. **Ligne 1035-1041** : Retourne le message de clarification
10. **Résultat** : Utilisateur voit "demande trop vague" au lieu de passer à la question suivante

### Chemin d'exécution APRÈS correctifs (commit 88fd5d3)

**Scénario** : Utilisateur répond "D" à une question motif (meta aligné via détection dynamique)

1. **Entrée** : `handleBlock2B` appelé avec `userMessage = "D"`
2. **Ligne 996** : `appendBlock2BAnswer(candidateId, userMessage)` — réponse stockée
3. **Ligne 1007** : `meta = finalQueue.meta` — **meta déjà corrigé lors de la génération** (ligne 1379 : `return { questions, meta: detectedMeta }`)
4. **Ligne 1008** : `looksLikeChoiceAE = /^[A-Ea-e]\s*[\.\)]?\s*$/.test("D")` = **true**
5. **Ligne 1011** : Entre dans le if, log `"réponse A–E détectée"`
6. **Ligne 1015** : **NE RENTRE PAS dans le else** (car if = true)
7. **Ligne 1017** : `isPersonnagesAnswer` **n'est pas défini** (reste undefined)
8. **Ligne 1069** : `nextQuestionIndex = currentQuestionIndex + 1` (ex: 1)
9. **Ligne 1072** : `if (nextQuestionIndex >= queueLength)` ? Non (on est à question 1/6)
10. **Ligne 1159-1161** : Entre dans le else, `return await this.serveNextQuestion2B(...)`
11. **Résultat** : Question suivante affichée, **PAS de clarification personnages**

**Qui croit que c'est une question personnages ?**

AVANT correctif : `meta[questionIndex]?.slot` (ligne 1017), car meta était FIXE par index (voir `defaultMetaForSixQuestions()` ligne 1495-1506).

APRÈS correctif : `meta[questionIndex]?.slot` est basé sur `detectedMeta` (ligne 1336-1379), qui parse chaque question pour détecter son type réel (motif vs personnages).

**Preuve de l'alignement dynamique** :
- **Ligne 1336-1368** : Boucle sur chaque question
- **Ligne 1339** : Pattern motif : `/Qu'est-ce qui t'attire.*\n.*A\./i` ou `/A\.\s*\S/i`
- **Ligne 1340** : Pattern personnages : `/quels sont les.*personnages/i` ou `/personnages qui te parlent/i`
- **Ligne 1352 / 1363** : Push dans `detectedMeta[]` selon type détecté
- **Ligne 1379** : Retourne `{ questions: questionsSansCrochets, meta: detectedMeta }`

---

## D) PLAN MINIMAL (sans code)

**Objectif** : Valider que les correctifs P0-1 (meta dynamique) et P0-3 (garde A-E) fonctionnent en production.

### Étape 1 — Identifier l'environnement de test
- Utiliser branche `stabilisation-base-88fd5d3` (déjà créée)
- Serveur local : `http://localhost:3000`
- Tenant : `elgaenergy`, Poste : `commercial_b2b`

### Étape 2 — Créer une session test jusqu'à BLOC 2B
**Actions** :
1. `curl 'http://localhost:3000/start?tenant=elgaenergy&poste=commercial_b2b'` → récupérer `sessionId`
2. Répondre identité : `Prénom: Test\nNom: User\nEmail: test@example.com`
3. Répondre tone : `tutoiement`
4. Attendre préambule généré
5. Déclencher BLOC 1 : cliquer bouton ou envoyer event
6. Répondre aux 6 questions BLOC 1 (n'importe quelle réponse)
7. Attendre miroir BLOC 1
8. Question 2A.1 apparaît automatiquement (médium) : répondre `A` ou `B`
9. Question 2A.2 (3 œuvres) : répondre `Suits, Breaking Bad, The Wire`
10. Question 2A.3 (œuvre noyau) : répondre `Suits`
11. **ENTRÉE BLOC 2B** : Question 2B.1 (motif œuvre #1) devrait s'afficher

**Résultat attendu** : Arrivée en BLOC 2B avec question motif affichée

### Étape 3 — Inspecter meta généré
**Actions** :
1. Avant de répondre à 2B.1, vérifier les logs serveur
2. Chercher log : `[ORCHESTRATOR] P0-1: Meta aligné dynamiquement avec ordre réel questions`
3. Vérifier que `detectedMeta` contient `['motif', 'personnages', 'motif', 'personnages', 'motif', 'personnages']` (ou ordre équivalent selon LLM)

**Résultat attendu** : Meta détecté dynamiquement (pas fixe)

### Étape 4 — Tester garde A-E sur question motif
**Actions** :
1. Question 2B.1 affichée : `Qu'est-ce qui t'attire le PLUS dans Suits ?\nA. ...\nB. ...\nC. ...\nD. ...\nE. ...`
2. Répondre : `D`
3. Vérifier logs serveur : chercher `[ORCHESTRATOR] BLOC 2B: réponse A–E détectée`
4. Vérifier que `normalizeCharactersLLM` **n'est PAS appelé** (aucun log de normalisation)
5. Vérifier que la question suivante (2B.2, probablement personnages) s'affiche immédiatement

**Résultat attendu** : Question 2B.2 affichée, **PAS de message "demande trop vague"**

### Étape 5 — Tester réponse personnages normale
**Actions** :
1. Question 2B.2 affichée : `Dans Suits, quels sont les 1 à 3 personnages qui te parlent le plus ?`
2. Répondre : `Harvey, Mike, Donna`
3. Vérifier logs serveur : chercher `normalizeCharactersLLM` appelé
4. Vérifier que des questions traits sont insérées (ex: `Qu'est-ce qui te parle vraiment chez Harvey ?`)
5. Vérifier que la question suivante s'affiche

**Résultat attendu** : Normalisation personnages + insertion traits dynamique

### Étape 6 — Tester comportement si désalignement résiduel
**Scénario edge case** : Si le LLM génère une question non reconnue par les patterns (ligne 1339-1340)

**Actions** :
1. Forcer une session où le LLM répond avec une formulation non-standard (ex: "Ce qui t'intéresse dans Suits ?" sans "Qu'est-ce qui t'attire")
2. Vérifier que le meta fallback (ligne 1366) conserve le meta LLM
3. Si meta LLM est incorrect (ex: dit "personnages" mais c'est une motif), vérifier que la garde A-E (ligne 1008) empêche quand même l'appel `normalizeCharactersLLM`

**Résultat attendu** : Même si meta est incorrect, réponse A-E ne déclenche JAMAIS normalisation

### Étape 7 — Vérifier stripWorkBrackets fonctionne
**Actions** :
1. Inspecter les questions affichées en BLOC 2B
2. Vérifier qu'aucune ne contient `[Suits]` mais uniquement `Suits`
3. Fonction testée : `stripWorkBracketsFromQuestions` (ligne 1485-1493)

**Résultat attendu** : Titres sans crochets

### Étape 8 — Valider transition 2B → BLOC 3
**Actions** :
1. Répondre à toutes les questions 2B (6 + traits insérés)
2. Vérifier que miroir 2B se génère
3. Vérifier que question BLOC 3 s'affiche IMMÉDIATEMENT après (pas de bouton)
4. Vérifier que `expectsAnswer: true` (champ de saisie actif)

**Résultat attendu** : Transition silencieuse 2B → 3, input actif

### Étape 9 — Comportement attendu si garde A-E + meta incorrecte
**Logique** :
- Si `looksLikeChoiceAE = true` (ligne 1008)
- Alors on ne rentre PAS dans le else (ligne 1015)
- Donc `isPersonnagesAnswer` n'est jamais défini (reste undefined)
- Donc condition ligne 1020 `if (isPersonnagesAnswer && ...)` = false
- Donc branche personnages (ligne 1020-1066) est **ignorée**
- Donc flux continue ligne 1069 (condition miroir) puis ligne 1161 (serveNextQuestion2B)

**Résultat** : Même si meta est incorrect, réponse A-E ne peut JAMAIS déclencher normalisation personnages

### Étape 10 — Documenter résultats
**Actions** :
1. Pour chaque étape 1-8, noter PASS ou FAIL
2. Si FAIL : copier logs serveur, capturer screenshot UI, noter comportement observé
3. Si PASS : confirmer que les correctifs fonctionnent comme attendu

**Livrable** : Checklist PASS/FAIL (voir section E)

---

## E) CHECKLIST PASS/FAIL (spécifique BLOC 2B)

### Tests critiques (doivent tous être PASS)

| # | Check | Résultat | Notes |
|---|-------|----------|-------|
| 1 | Réponse "D" sur question motif → question suivante affichée | ⬜ PASS / FAIL | Pas de message "demande trop vague" |
| 2 | Aucun appel `normalizeCharactersLLM` pour réponse A-E | ⬜ PASS / FAIL | Vérifier logs serveur |
| 3 | Log `[ORCHESTRATOR] BLOC 2B: réponse A–E détectée` présent | ⬜ PASS / FAIL | Confirme garde activée |
| 4 | Meta détecté dynamiquement (log P0-1 présent) | ⬜ PASS / FAIL | Pas de meta fixe par index |
| 5 | Questions affichent "Suits" et non "[Suits]" | ⬜ PASS / FAIL | stripWorkBrackets actif |
| 6 | Réponse personnages "Harvey, Mike" → normalisation OK | ⬜ PASS / FAIL | Flux normal personnages |
| 7 | Questions traits insérées après normalisation personnages | ⬜ PASS / FAIL | Insertion dynamique |
| 8 | Transition 2B → BLOC 3 silencieuse (pas de bouton) | ⬜ PASS / FAIL | Miroir + question 3.1 |

### Tests edge cases (recommandés)

| # | Check | Résultat | Notes |
|---|-------|----------|-------|
| 9 | Réponse "a." (minuscule + point) détectée comme A-E | ⬜ PASS / FAIL | Pattern regex tolérant |
| 10 | Si LLM génère formulation non-standard → fallback meta LLM | ⬜ PASS / FAIL | Ligne 1366 |
| 11 | Même avec meta incorrect, A-E ne déclenche pas normalisation | ⬜ PASS / FAIL | Garde prioritaire |
| 12 | Queue 2B continue après clarification personnages | ⬜ PASS / FAIL | Pas de blocage |

### Tests UX (non-bloquants mais importants)

| # | Check | Résultat | Notes |
|---|-------|----------|-------|
| 13 | Champ de saisie actif après chaque question 2B | ⬜ PASS / FAIL | expectsAnswer: true |
| 14 | Pas de double affichage question | ⬜ PASS / FAIL | Anti-doublon frontend |
| 15 | Transition 2B→3 ne masque pas l'input | ⬜ PASS / FAIL | expectsAnswer après miroir |
| 16 | Typing indicator visible pendant génération miroir 2B | ⬜ PASS / FAIL | UX feedback |

---

## F) VALIDATION FINALE

### Conditions de succès

**BLOC 2B est validé stable si et seulement si** :
1. ✅ Tous les tests critiques (1-8) sont **PASS**
2. ✅ Au moins 3 des tests edge cases (9-12) sont **PASS**
3. ✅ Aucun crash serveur pendant le parcours complet BLOC 2B
4. ✅ Logs serveur ne contiennent AUCUN appel `normalizeCharactersLLM` pour réponses A-E

### Test manuel minimal (ONE SHOT)

**Commande curl complète** (exemple) :

```bash
# 1. Start session
SESSION_ID=$(curl -s 'http://localhost:3000/start?tenant=elgaenergy&poste=commercial_b2b' | jq -r '.sessionId')

# 2. Identity
curl -s -X POST 'http://localhost:3000/axiom' \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"tenantId\":\"elgaenergy\",\"posteId\":\"commercial_b2b\",\"userInput\":\"Prénom: Test\nNom: User\nEmail: test@example.com\"}"

# 3. Tone
curl -s -X POST 'http://localhost:3000/axiom' \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"tenantId\":\"elgaenergy\",\"posteId\":\"commercial_b2b\",\"userInput\":\"tutoiement\"}"

# 4-9. BLOC 1 (6 questions, n'importe quelle réponse)
for i in {1..6}; do
  curl -s -X POST 'http://localhost:3000/axiom' \
    -H 'Content-Type: application/json' \
    -d "{\"sessionId\":\"$SESSION_ID\",\"tenantId\":\"elgaenergy\",\"posteId\":\"commercial_b2b\",\"userInput\":\"Réponse $i\"}"
done

# 10. 2A.1 (médium)
curl -s -X POST 'http://localhost:3000/axiom' \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"tenantId\":\"elgaenergy\",\"posteId\":\"commercial_b2b\",\"userInput\":\"A\"}"

# 11. 2A.2 (3 œuvres)
curl -s -X POST 'http://localhost:3000/axiom' \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"tenantId\":\"elgaenergy\",\"posteId\":\"commercial_b2b\",\"userInput\":\"Suits, Breaking Bad, The Wire\"}"

# 12. 2A.3 (œuvre noyau)
curl -s -X POST 'http://localhost:3000/axiom' \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"tenantId\":\"elgaenergy\",\"posteId\":\"commercial_b2b\",\"userInput\":\"Suits\"}"

# 13. 2B.1 (MOTIF) — TEST CRITIQUE : répondre D
curl -s -X POST 'http://localhost:3000/axiom' \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"tenantId\":\"elgaenergy\",\"posteId\":\"commercial_b2b\",\"userInput\":\"D\"}" \
  | jq '.response'

# RÉSULTAT ATTENDU : Question 2B.2 (personnages), PAS "demande trop vague"
```

### Rollback si régression

**Si tests FAIL** :
1. Identifier quelle étape a échoué (check #X)
2. Copier logs serveur complets
3. Capturer screenshot UI si applicable
4. Noter comportement observé vs attendu
5. **NE PAS modifier le code**
6. Documenter dans issue GitHub avec label `P1-BLOC2B`
7. Revenir à un commit antérieur si nécessaire (ex: `df4a005` avant correctifs)

**Rollback simple** :
```bash
git checkout df4a005
npm run build
npm start
# Tester que BLOC 1 fonctionne toujours
```

---

## G) NOTES TECHNIQUES

### Références code clés

| Composant | Fichier | Lignes | Description |
|-----------|---------|--------|-------------|
| Garde A-E | `blockOrchestrator.ts` | 1007-1014 | Détecte réponses A-E AVANT logique personnages |
| Meta dynamique | `blockOrchestrator.ts` | 1334-1379 | Parse questions pour détecter type réel |
| Normalisation perso | `blockOrchestrator.ts` | 1034-1066 | Appel `normalizeCharactersLLM` |
| Strip brackets | `blockOrchestrator.ts` | 1485-1493 | Enlève `[Suits]` → `Suits` |
| Transition 2B→3 | `blockOrchestrator.ts` | 1069-1158 | Miroir + appel `executeAxiom` pour BLOC 3 |

### Patterns regex importants

```javascript
// Détection réponse A-E
looksLikeChoiceAE = /^[A-Ea-e]\s*[\.\)]?\s*$/.test(userMessage.trim())

// Détection question motif
isMotif = /Qu'est-ce qui t'attire.*\n.*A\./i.test(question) || /A\.\s*\S/i.test(question)

// Détection question personnages
isPersonnages = /quels sont les.*personnages/i.test(question) || /personnages qui te parlent/i.test(question)
```

### Logs serveur à surveiller

```
[ORCHESTRATOR] [2B] works source= normalizedWorks
[ORCHESTRATOR] Generating BLOC 2B premium (motif + personnages only)
[ORCHESTRATOR] P0-1: Meta aligné dynamiquement avec ordre réel questions
[ORCHESTRATOR] BLOC 2B: réponse A–E détectée — pas de normalisation personnages, on sert la suite
[ORCHESTRATOR] Generating BLOC 2B final mirror then auto-advance to BLOC 3
```

### Limitations connues

1. **Patterns motif/personnages** : Si le LLM change la formulation (ex: "Ce qui t'intéresse" au lieu de "Qu'est-ce qui t'attire"), les patterns ne matchent pas → fallback meta LLM (ligne 1366)
2. **Strip brackets** : Si le LLM écrit `Suits (2011)` au lieu de `Suits`, le pattern ne matche pas exactement
3. **Garde A-E** : N'accepte que format strict `[A-E]` avec point/parenthèse optionnel. Si utilisateur écrit `Réponse D` ou `D: ...`, la garde ne détecte pas (mais ce n'est pas un cas d'usage normal)

---

## ✅ VALIDATION AGENT

**Aucune modification de code n'a été effectuée.**

Ce document est un audit READ-ONLY basé uniquement sur :
- Lecture du code source au commit `88fd5d3`
- Analyse du fichier `src/services/blockOrchestrator.ts` (lignes 875-1500)
- Comparaison avec le diagnostic `DIAGNOSTIC_STRUCTUREL_BLOC_2A_2B.md`

**Conclusion** : Les correctifs P0-1 (meta dynamique), P0-2 (fallback robuste), P0-3 (garde A-E) sont **DÉJÀ IMPLÉMENTÉS** au commit 88fd5d3. Ce document fournit un **plan de validation** pour confirmer qu'ils fonctionnent en production.

**Prochaine étape** : Exécuter la checklist (section E) et documenter les résultats PASS/FAIL.

---

**FIN DE L'AUDIT** — Commit 88fd5d3
