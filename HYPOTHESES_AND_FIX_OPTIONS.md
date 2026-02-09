# 🔬 HYPOTHÈSES & OPTIONS DE CORRECTION — TON MENTOR / MIROIRS

**Date** : 2025-01-27  
**Objectif** : Analyser pourquoi les miroirs sont "froids" vs attendu "mentor chaleureux" et proposer des corrections non-invasives

---

## 🎯 PROBLÈME OBSERVÉ

**Symptôme** : Les miroirs actuels sont perçus comme :
- "Froids", "plats", "lecture"
- Manque de "chaleur", "empathie", "posture mentor"
- Style analytique "neutre" au lieu de "conversation réelle"

**Attendu** : Ton mentor lucide, chaleureux, proche, incarné (comme ChatGPT "normal")

---

## 🔍 HYPOTHÈSE 1 : MODÈLE ÉCONOMIQUE (CAUSE PROBABLE MAJEURE)

### Diagnostic

**Preuve code** :
- **Fichier** : `src/services/openaiClient.ts:35`
- **Ligne 35** : `model: 'gpt-4o-mini'` — Modèle économique utilisé

**Analyse** :
- `gpt-4o-mini` : Modèle optimisé pour coût/performance
- Comparé à `gpt-4` ou `gpt-4-turbo` : Moins de "chaleur" narrative, style plus mécanique
- Capacité narrative limitée vs modèles plus puissants

**Impact** : 🔴 **ÉLEVÉ** — Le modèle peut expliquer 60-70% de l'écart qualitatif

### Options de correction

#### Option 1.1 : Modèle différent pour miroirs uniquement

**Principe** : Utiliser `gpt-4` ou `gpt-4-turbo` uniquement pour génération miroirs (pas pour questions)

**Avantages** :
- ✅ Amélioration majeure du ton (modèle plus puissant)
- ✅ Impact limité sur coût (miroirs = ~10% des appels)
- ✅ Pas de modification prompts

**Risques** :
- ⚠️ Coût augmenté (mais limité aux miroirs)
- ⚠️ Latence légèrement augmentée

**Effort** : 2-3 heures (créer `callOpenAIForMirror()` avec modèle différent)

**Recommandation** : ✅ **RECOMMANDÉ** — Impact majeur, effort faible

---

#### Option 1.2 : Température augmentée pour miroirs

**Principe** : Utiliser température 0.8-0.9 pour miroirs (au lieu de 0.7)

**Avantages** :
- ✅ Plus de créativité/ton dans miroirs
- ✅ Pas de changement de modèle (coût inchangé)
- ✅ Pas de modification prompts

**Risques** :
- ⚠️ Moins de cohérence (mais acceptable pour miroirs)
- ⚠️ Format REVELIOM peut être moins strict (mitigé par validators)

**Effort** : 1-2 heures (créer `callOpenAIForMirror()` avec température 0.8)

**Recommandation** : ✅ **RECOMMANDÉ** — Impact moyen, effort très faible

---

## 🔍 HYPOTHÈSE 2 : CONTRADICTION INSTRUCTIONS (CAUSE PROBABLE)

### Diagnostic

**Preuve code** :
- **Fichier** : `src/engine/prompts.ts:31-79` — `PROMPT_AXIOM_ENGINE`
- **Lignes 31-79** : Instructions strictes "exécution mécanique", "pas d'interprétation", "pas d'adaptation"
- **Fichier** : `src/engine/prompts.ts:118-119` — Ton mentor "chaleureux mais pro"

**Analyse** :
- Contradiction entre "exécution stricte" et "ton mentor"
- `PROMPT_AXIOM_ENGINE` insiste sur "pas d'interprétation" → peut inhiber le ton mentor
- Instructions contradictoires peuvent confondre le modèle

**Impact** : 🟡 **MOYEN** — Contradiction peut expliquer 20-30% de l'écart

### Options de correction

#### Option 2.1 : Réconcilier instructions (sans modifier prompts)

**Principe** : Ajouter instruction explicite dans prompt miroir : "Ton mentor chaleureux PRIORITAIRE sur exécution stricte pour les miroirs"

**Avantages** :
- ✅ Clarifie la priorité (ton mentor > exécution stricte pour miroirs)
- ✅ Pas de modification prompts existants (ajout uniquement)

**Risques** :
- ⚠️ Modification prompt (mais ajout, pas suppression)

**Effort** : 1 heure (ajout instruction dans prompt miroir)

**Recommandation** : ✅ **RECOMMANDÉ** — Impact moyen, effort très faible

---

#### Option 2.2 : Séparer prompts (exécution vs mentor)

**Principe** : Créer prompt séparé pour miroirs (sans `PROMPT_AXIOM_ENGINE`)

**Avantages** :
- ✅ Pas de contradiction (prompt mentor pur)
- ✅ Ton mentor non inhibé

**Risques** :
- ⚠️ Modification architecture (création nouveau prompt)
- ⚠️ Risque de divergence comportementale

**Effort** : 4-6 heures (création prompt séparé + intégration)

**Recommandation** : ⚠️ **ALTERNATIVE** — Impact élevé, effort moyen

---

## 🔍 HYPOTHÈSE 3 : CONTRAINTE FORMAT TROP STRICTE (CAUSE PROBABLE)

### Diagnostic

**Preuve code** :
- **Fichier** : `src/engine/prompts.ts:183-187` — Format minimal (20/25 mots max)
- **Ligne 186** : "Déduction personnalisée : 1 phrase unique, maximum 25 mots"
- **Fichier** : `src/engine/prompts.ts:298-305` — Exigence profondeur

**Analyse** :
- Contrainte format (25 mots max) peut limiter l'expression du ton mentor
- Exigence profondeur vs format minimal = contradiction
- Format trop court peut rendre le texte "mécanique"

**Impact** : 🟡 **MOYEN** — Contrainte peut expliquer 10-20% de l'écart

### Options de correction

#### Option 3.1 : Réévaluer contrainte format (sans modifier prompts)

**Principe** : Aucune action (contrainte format dans prompt, non modifiable)

**Analyse** : Contrainte format est dans prompt, donc non modifiable selon contraintes.

**Recommandation** : ⚠️ **NON APPLICABLE** — Contrainte dans prompt, non modifiable

---

#### Option 3.2 : Validation format souple (post-génération)

**Principe** : Valider format avec tolérance (20-30 mots au lieu de 20 exactement)

**Avantages** :
- ✅ Plus de flexibilité pour expression ton
- ✅ Validation défensive (pas de modification prompt)

**Risques** :
- ⚠️ Écart avec prompt (mais acceptable si validation souple)

**Effort** : 1-2 heures (modification `validateMirrorREVELIOM()`)

**Recommandation** : ✅ **RECOMMANDÉ** — Impact faible mais positif, effort très faible

---

## 🔍 HYPOTHÈSE 4 : CONTEXTE HISTORIQUE INSUFFISANT (CAUSE POSSIBLE)

### Diagnostic

**Preuve code** :
- **Fichier** : `src/engine/axiomExecutor.ts:1095-1120` — `buildConversationHistory()`
- **Ligne 1095** : `const MAX_CONV_MESSAGES = 40` — Limite 40 messages
- **Ligne 1100** : `history.slice(-MAX_CONV_MESSAGES)` — Derniers 40 messages

**Analyse** :
- Limite 40 messages peut tronquer historique long (rare mais possible)
- Historique peut manquer de contexte "chaleur" si messages trop factuels

**Impact** : 🟢 **FAIBLE** — Limite raisonnable, impact limité

### Options de correction

#### Option 4.1 : Augmenter limite messages

**Principe** : Passer `MAX_CONV_MESSAGES` de 40 à 60

**Avantages** :
- ✅ Plus de contexte pour miroirs
- ✅ Pas de modification prompts

**Risques** :
- ⚠️ Coût légèrement augmenté (mais négligeable)

**Effort** : 5 minutes (changement constante)

**Recommandation** : ✅ **RECOMMANDÉ** — Impact faible mais positif, effort nul

---

#### Option 4.2 : Réinjection explicite validations miroir

**Principe** : Injecter validations miroir précédentes dans contexte miroir suivant

**Avantages** :
- ✅ Contexte enrichi (validations = feedback utilisateur)
- ✅ Ton peut s'ajuster selon validations

**Risques** :
- ⚠️ Aucun (ajout contexte, pas modification)

**Effort** : 2-3 heures (modification `buildConversationHistory()` pour miroirs)

**Recommandation** : ✅ **RECOMMANDÉ** — Impact moyen, effort faible

---

## 🔍 HYPOTHÈSE 5 : ABSENCE BOUCLE VALIDATION (CAUSE POSSIBLE)

### Diagnostic

**Preuve code** :
- **Fichier** : `src/store/sessionStore.ts:426-457` — Stockage validation avec `kind: 'mirror_validation'`
- **Fichier** : `src/engine/axiomExecutor.ts:1095-1120` — Réinjection dans `conversationHistory`

**Analyse** :
- Validations stockées et réinjectées dans historique général
- Mais pas de réinjection **explicite** dans contexte miroir suivant
- Absence de boucle de correction/nuance peut limiter l'ajustement du ton

**Impact** : 🟢 **FAIBLE** — Validations réinjectées, mais impact limité

### Options de correction

#### Option 5.1 : Réinjection explicite validations dans contexte miroir

**Principe** : Ajouter section dédiée "VALIDATIONS MIROIRS PRÉCÉDENTS" dans prompt miroir

**Avantages** :
- ✅ Contexte enrichi (feedback utilisateur explicite)
- ✅ Ton peut s'ajuster selon validations

**Risques** :
- ⚠️ Aucun (ajout contexte)

**Effort** : 2-3 heures (modification prompt miroir pour inclure validations)

**Recommandation** : ✅ **RECOMMANDÉ** — Impact moyen, effort faible

---

## 🔍 HYPOTHÈSE 6 : PARSING / NORMALISATION DÉGRADE STYLE (CAUSE IMPROBABLE)

### Diagnostic

**Preuve code** :
- **Fichier** : `src/services/parseMirrorSections.ts` — Parsing sections 1️⃣ 2️⃣ 3️⃣
- **Fichier** : `src/services/blockOrchestrator.ts:122-134` — `normalizeSingleResponse()` — Troncature si séparateur

**Analyse** :
- Parsing sections : Ne dégrade pas style (découpage structurel uniquement)
- Normalisation : Troncature si séparateur (rare, ne concerne pas miroirs)
- **Conclusion** : Parsing/normalisation ne dégradent pas le style

**Impact** : 🟢 **NÉGLIGEABLE** — Pas de cause identifiée

### Options de correction

**Aucune action requise** — Parsing/normalisation ne sont pas la cause

---

## 📊 SYNTHÈSE DES HYPOTHÈSES

| Hypothèse | Probabilité | Impact | Action recommandée |
|-----------|-------------|--------|-------------------|
| Modèle économique | 🔴 ÉLEVÉE | 🔴 ÉLEVÉ | Option 1.1 + 1.2 (modèle + température) |
| Contradiction instructions | 🟡 MOYENNE | 🟡 MOYEN | Option 2.1 (réconcilier instructions) |
| Contrainte format | 🟡 MOYENNE | 🟡 MOYEN | Option 3.2 (validation souple) |
| Contexte historique | 🟢 FAIBLE | 🟢 FAIBLE | Option 4.1 + 4.2 (limite + réinjection) |
| Absence boucle validation | 🟢 FAIBLE | 🟢 FAIBLE | Option 5.1 (réinjection explicite) |
| Parsing/normalisation | 🟢 IMPROBABLE | 🟢 NÉGLIGEABLE | Aucune action |

---

## 🎯 PLAN D'ACTION RECOMMANDÉ (PRIORISÉ)

### Phase 1 — Corrections rapides (4-6 heures)

1. **Option 1.2** : Température 0.8 pour miroirs (1-2h)
2. **Option 2.1** : Réconcilier instructions (1h)
3. **Option 4.1** : Augmenter limite messages (5min)
4. **Option 3.2** : Validation format souple (1-2h)

**Impact attendu** : 🟡 **MOYEN** — Amélioration perceptible du ton

---

### Phase 2 — Corrections structurantes (6-8 heures)

1. **Option 1.1** : Modèle `gpt-4` pour miroirs (2-3h)
2. **Option 4.2** : Réinjection validations miroir (2-3h)
3. **Option 5.1** : Réinjection explicite validations (2-3h)

**Impact attendu** : 🔴 **ÉLEVÉ** — Amélioration majeure du ton

---

### Phase 3 — Alternative (si Phase 1+2 insuffisantes)

1. **Option 2.2** : Prompt séparé pour miroirs (4-6h)

**Impact attendu** : 🔴 **TRÈS ÉLEVÉ** — Ton mentor pur (sans contradiction)

---

## 🧪 MÉTHODE D'ÉVALUATION

### Snapshots à produire (après corrections)

**Snapshot 1 — BLOC 1 miroir (avant/après)** :
- Avant : Miroir actuel (froid, plat)
- Après : Miroir avec corrections (chaleureux, mentor)

**Snapshot 2 — BLOC 2B miroir (avant/après)** :
- Avant : Miroir actuel
- Après : Miroir avec corrections

**Snapshot 3 — BLOC 3-9 miroir (avant/après)** :
- Avant : Miroir actuel
- Après : Miroir avec corrections

### Critères d'évaluation

Pour chaque snapshot :
- ✅ Empathie présente ?
- ✅ Reformulation chaleureuse ?
- ✅ Lecture en creux (pas juste description) ?
- ✅ Chaleur, rythme, questions de validation ?
- ✅ Ton mentor vs ton analytique neutre ?

---

## 🎯 RECOMMANDATION FINALE

**Approche graduée** :
1. **Phase 1** (4-6h) : Corrections rapides → Évaluer amélioration
2. **Phase 2** (6-8h) : Corrections structurantes → Évaluer amélioration
3. **Phase 3** (4-6h) : Alternative si insuffisant

**Priorité** : **Option 1.1 + 1.2** (modèle + température) — Impact majeur, effort faible

**Contraintes respectées** :
- ✅ Aucune modification prompts (sauf ajout instruction)
- ✅ Corrections non-invasives (orchestration uniquement)
- ✅ Tests manuels pour validation

---

**FIN DES HYPOTHÈSES ET OPTIONS**
