# 📊 DIFF REPORT — ÉCARTS PROMPTS REVELIOM vs COMPORTEMENT RÉEL

**Date** : 2025-01-27  
**Objectif** : Liste exhaustive des écarts entre la promesse des prompts et le comportement réel du système

---

## 🔴 ÉCARTS CRITIQUES (BLOQUANTS)

### Écart 1 : Validation miroir BLOC 1 court-circuitée

**Promesse prompt** :
> Section 3️⃣ Validation ouverte :
> "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."
>
> Après chaque miroir, le système DOIT attendre une réponse utilisateur de validation avant de continuer.

**Comportement réel** :
- Le miroir BLOC 1 est immédiatement suivi de la première question BLOC 2A
- Les deux sont concaténés dans la même réponse : `mirror + '\n\n' + firstQuestion2A`
- Le frontend affiche le miroir et la question dans le même message
- Le candidat ne peut pas valider le miroir

**Preuve code** :
- `src/services/blockOrchestrator.ts:262` : `response: mirror + '\n\n' + firstQuestion2A`
- `ui-test/app.js:109` : Extraction et affichage de la question après le miroir

**Impact** : 🔴 **BLOQUANT** — Violation du contrat REVELIOM, validation impossible

---

### Écart 2 : Validation miroir BLOC 2B court-circuitée

**Promesse prompt** :
> Même règle que BLOC 1 : après le miroir, attendre validation utilisateur.

**Comportement réel** :
- Le miroir BLOC 2B est immédiatement suivi de la première question BLOC 3
- Les deux sont concaténés dans la même réponse : `mirror + '\n\n' + nextResult.response`
- Le candidat ne peut pas valider le miroir

**Preuve code** :
- `src/services/blockOrchestrator.ts:952` : `response: mirror + '\n\n' + nextResult.response`

**Impact** : 🔴 **BLOQUANT** — Violation du contrat REVELIOM, validation impossible

---

### Écart 3 : Validation miroir BLOCS 3-9 impossible

**Promesse prompt** :
> Après chaque miroir (BLOCS 3-9), le système DOIT attendre une réponse utilisateur de validation.

**Comportement réel** :
- Après un miroir, `expectsAnswer = false` (car le miroir ne se termine pas par `?`)
- Le système passe automatiquement au bloc suivant sans attendre de validation
- Le candidat ne peut pas valider le miroir

**Preuve code** :
- `src/engine/axiomExecutor.ts:1711` : `expectsAnswer = aiText.trim().endsWith('?')`
- `src/engine/axiomExecutor.ts:1795-1797` : Transition automatique si `!expectsAnswer && blocNumber < 10`

**Impact** : 🔴 **BLOQUANT** — Violation du contrat REVELIOM, validation impossible

---

### Écart 4 : Nuances de validation non stockées

**Promesse prompt** :
> Les nuances de validation miroir doivent être stockées et réutilisables par les blocs suivants.

**Comportement réel** :
- Aucune fonction dédiée pour stocker les validations miroir
- Les réponses de validation sont stockées comme des réponses normales (`kind: 'other'`)
- Pas de réinjection dans les prompts des blocs suivants

**Preuve code** :
- `src/store/sessionStore.ts` : Aucune méthode `appendMirrorValidation()` ou équivalent
- Les validations sont stockées via `appendUserMessage()` avec `kind: 'other'`

**Impact** : 🔴 **BLOQUANT** — Les nuances ne sont pas réutilisables, perte d'information

---

## ⚠️ ÉCARTS FRAGILES (NON BLOQUANTS MAIS À SURVEILLER)

### Écart 5 : Mapping step → state dupliqué

**Promesse** :
> `/start` et `/axiom` doivent retourner les mêmes conventions (state/step mapping).

**Comportement réel** :
- Fonction `mapStepToState()` existe et est utilisée dans `/axiom`
- `/start` utilise aussi `mapStepToState()` mais a aussi une logique locale (ligne 271)
- Risque d'incohérence si la logique locale diverge

**Preuve code** :
- `src/server.ts:72-90` : Fonction `mapStepToState()`
- `src/server.ts:284` : Utilisation dans `/start`
- `src/server.ts:271` : Logique locale pour états avancés

**Impact** : ⚠️ **FRAGILE** — Risque d'incohérence, pas bloquant mais dette technique

---

### Écart 6 : Double valeur préambule

**Promesse** :
> Une seule valeur pour l'état "préambule terminé" : `STEP_03_BLOC1`.

**Comportement réel** :
- Constante `PREAMBULE_DONE` existe encore (ligne 852 `axiomExecutor.ts`)
- Code dupliqué dans `/start` et `/axiom` pour gérer les deux valeurs

**Preuve code** :
- `src/engine/axiomExecutor.ts:852` : `export const PREAMBULE_DONE = 'PREAMBULE_DONE';`
- `src/server.ts:245` : Vérification `derivedStep === "PREAMBULE_DONE"`

**Impact** : ⚠️ **FRAGILE** — Dette technique, pas bloquant mais confusion possible

---

### Écart 7 : currentBlock mis à jour à plusieurs endroits

**Promesse** :
> Une seule source de vérité pour `currentBlock`.

**Comportement réel** :
- `currentBlock` mis à jour par `BlockOrchestrator` (BLOC 1, 2B)
- `currentBlock` mis à jour par `executeAxiom()` (BLOCS 3-10)
- Risque d'incohérence si les mises à jour divergent

**Preuve code** :
- `src/services/blockOrchestrator.ts:224-227` : Mise à jour pour BLOC 1
- `src/services/blockOrchestrator.ts:921-924` : Mise à jour pour BLOC 2B
- `src/engine/axiomExecutor.ts:1812-1842` : Mise à jour pour BLOCS 3-10

**Impact** : ⚠️ **FRAGILE** — Risque d'incohérence, pas bloquant mais dette technique

---

### Écart 8 : Pas de déduplication messages

**Promesse** :
> Pas de doublons dans l'historique après refresh ou double clic.

**Comportement réel** :
- Aucune vérification de doublon dans `appendUserMessage()`
- Si un message est envoyé deux fois (bug réseau), il sera stocké deux fois

**Preuve code** :
- `src/store/sessionStore.ts:370-420` : `appendUserMessage()` fait un `push()` sans vérification

**Impact** : ⚠️ **FRAGILE** — Doublons possibles, pas bloquant mais qualité de données

---

## ✅ CONFORMITÉS (PAS D'ÉCART)

### Conformité 1 : Format miroir REVELIOM

**Promesse prompt** :
> Format strict : 3 sections (1️⃣, 2️⃣, 3️⃣), longueurs limitées (20/25 mots), lecture en creux, interdictions.

**Comportement réel** :
- Validation `validateMirrorREVELIOM()` appliquée
- Retry si non conforme
- Format respecté

**Preuve code** :
- `src/services/validateMirrorReveliom.ts:6-55` : Validation complète
- `src/services/blockOrchestrator.ts:452` : Validation BLOC 1
- `src/engine/axiomExecutor.ts:1720` : Validation BLOCS 3-9

**Impact** : ✅ **CONFORME** — Format validé et respecté

---

### Conformité 2 : BLOC 2A sans miroir

**Promesse prompt** :
> BLOC 2A : Aucun miroir de fin de bloc, transition directe vers BLOC 2B.

**Comportement réel** :
- Aucune génération de miroir dans `handleBlock2A()`
- Transition directe vers BLOC 2B

**Preuve code** :
- `src/services/blockOrchestrator.ts:476-723` : Aucune génération de miroir

**Impact** : ✅ **CONFORME** — Règle respectée

---

### Conformité 3 : Events propagés correctement

**Promesse** :
> Events `START_BLOC_1` et `START_MATCHING` doivent être propagés jusqu'à `executeAxiom()`.

**Comportement réel** :
- `executeWithAutoContinue()` accepte `event: string | null`
- Propagation correcte jusqu'à `executeAxiom()`

**Preuve code** :
- `src/engine/axiomExecutor.ts:2052` : `executeWithAutoContinue()` accepte `event`
- `src/server.ts:881` : Propagation correcte

**Impact** : ✅ **CONFORME** — Events fonctionnels

---

## 📊 RÉSUMÉ DES ÉCARTS

| Écart | Type | Blocage | Fichier | Ligne | Correction nécessaire |
|-------|------|---------|---------|-------|----------------------|
| Validation miroir BLOC 1 | 🔴 Critique | OUI | `blockOrchestrator.ts` | 262 | OUI |
| Validation miroir BLOC 2B | 🔴 Critique | OUI | `blockOrchestrator.ts` | 952 | OUI |
| Validation miroir BLOCS 3-9 | 🔴 Critique | OUI | `axiomExecutor.ts` | 1795-1797 | OUI |
| Nuances non stockées | 🔴 Critique | OUI | `sessionStore.ts` | - | OUI |
| Mapping dupliqué | ⚠️ Fragile | NON | `server.ts` | 72-90, 271 | Optionnel |
| Double valeur préambule | ⚠️ Fragile | NON | `axiomExecutor.ts` | 852 | Optionnel |
| currentBlock multiple | ⚠️ Fragile | NON | Multiple | - | Optionnel |
| Pas de déduplication | ⚠️ Fragile | NON | `sessionStore.ts` | 370-420 | Optionnel |

---

## 🎯 PRIORISATION DES CORRECTIONS

### Priorité 1 (BLOQUANT — Avant production)

1. **Validation miroir BLOC 1** : Retourner uniquement le miroir avec `expectsAnswer: true`, attendre validation, puis générer question BLOC 2A
2. **Validation miroir BLOC 2B** : Même logique que BLOC 1
3. **Validation miroir BLOCS 3-9** : Forcer `expectsAnswer: true` après miroir, attendre validation, puis passer au bloc suivant
4. **Stockage nuances** : Ajouter méthode `appendMirrorValidation()` et réinjection dans prompts

### Priorité 2 (FRAGILE — Amélioration qualité)

1. Unifier mapping step → state
2. Supprimer `PREAMBULE_DONE`
3. Centraliser mise à jour `currentBlock`
4. Ajouter déduplication messages

---

**FIN DU DIFF REPORT**
