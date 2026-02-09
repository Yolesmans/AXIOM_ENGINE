# 📝 NOTES DE REPRODUCTION — TESTS DE CONFORMITÉ

**Date** : 2025-01-27  
**Objectif** : Steps de reproduction pour valider la conformité technique

---

## TEST 1 — SÉQUENTIALITÉ BLOC 1

### Cas normal (1 question à la fois)

**Steps** :
1. Démarrer session AXIOM
2. Compléter identité (prénom, nom, email)
3. Choisir tutoiement/vouvoiement
4. Lire préambule métier
5. Cliquer "Je commence mon profil"
6. **Observer** : Une seule question affichée
7. Répondre à la question
8. **Observer** : Question suivante affichée (une seule)

**Attendu** : ✅ Une seule question visible à chaque étape

**Résultat actuel** : ✅ **CONFORME** (safeguard `extractFirstQuestion()` actif)

**Preuve** : Logs console `[FRONTEND] [SEQUENTIAL_LOCK]` si troncature

---

### Cas LLM renvoie "1. …? 2. …?" sans séparateur

**Steps** :
1. Démarrer session AXIOM
2. Compléter identité
3. Choisir tutoiement
4. Lire préambule
5. Cliquer "Je commence mon profil"
6. **Simuler** : Backend retourne `"Qu'est-ce qui te motive ?\n\nComment réagis-tu face à l'échec ?"`
7. **Observer** : Frontend affiche uniquement la première question

**Attendu** : ✅ Une seule question affichée (première uniquement)

**Résultat actuel** : ✅ **CONFORME** (safeguard `extractFirstQuestion()` détecte plusieurs `?`)

**Preuve** : Logs console `[FRONTEND] [SEQUENTIAL_LOCK] Multiple questions detected (semantic)`

---

### Cas "?" multiple dans même phrase (faux positif)

**Steps** :
1. Démarrer session AXIOM
2. Compléter identité
3. Choisir tutoiement
4. Lire préambule
5. Cliquer "Je commence mon profil"
6. **Simuler** : Backend retourne `"Tu te demandes ? Et si on essayait ?"`
7. **Observer** : Frontend tronque ou affiche complet

**Attendu** : ⚠️ Troncature possible (rare, mais acceptable)

**Résultat actuel** : ⚠️ **RISQUE FAUX POSITIF** (troncature si plusieurs `?` dans même phrase)

**Preuve** : Logs console si troncature

---

## TEST 2 — BOUTONS ET ÉTATS TERMINAUX

### START_BLOC_1 — Désactivation immédiate

**Steps** :
1. Démarrer session AXIOM
2. Compléter identité
3. Choisir tutoiement
4. Lire préambule
5. Cliquer "Je commence mon profil"
6. **Observer** : Bouton désactivé immédiatement
7. Double clic rapide
8. **Observer** : Pas de double génération

**Attendu** : ✅ Bouton désactivé, pas de double génération

**Résultat actuel** : ✅ **CONFORME**

**Preuve** : `ui-test/app.js:267` (désactivation), `blockOrchestrator.ts:198-201` (idempotence)

---

### START_MATCHING — Désactivation immédiate

**Steps** :
1. Compléter parcours jusqu'à BLOC 10
2. Générer profil final
3. Cliquer "👉 Je génère mon matching"
4. **Observer** : Bouton désactivé immédiatement
5. Double clic rapide
6. **Observer** : Pas de double matching

**Attendu** : ✅ Bouton désactivé, pas de double matching

**Résultat actuel** : ⚠️ **PARTIELLEMENT CONFORME** (désactivation OK, mais pas de vérification si matching déjà généré)

**Preuve** : `ui-test/app.js:301` (désactivation), `axiomExecutor.ts:1996` (transition, pas de vérification `DONE_MATCHING`)

---

### FIN — Apparition uniquement DONE_MATCHING

**Steps** :
1. Compléter parcours jusqu'à matching
2. Générer matching
3. **Observer** : Bouton FIN visible
4. Refresh la page
5. **Observer** : Bouton FIN toujours visible

**Attendu** : ✅ Bouton FIN visible uniquement après `DONE_MATCHING`, survit à refresh

**Résultat actuel** : ✅ **CONFORME**

**Preuve** : `ui-test/app.js:421` (détection), `routes/start.ts:77` (step retourné)

---

## TEST 3 — REFRESH / REPRISE SESSION

### Refresh pendant question

**Steps** :
1. Démarrer session AXIOM
2. Compléter identité
3. Choisir tutoiement
4. Lire préambule
5. Cliquer "Je commence mon profil"
6. Question affichée
7. **Refresh la page**
8. **Observer** : Question réaffichée, état cohérent

**Attendu** : ✅ Question réaffichée, pas de saut d'état

**Résultat actuel** : ⚠️ **NON TESTÉ** — Nécessite test manuel

**Risque identifié** : Re-exécution `executeAxiom()` peut générer nouvelle question au lieu de réafficher dernière

**Preuve** : `routes/start.ts:60` (re-exécution), pas de logique de réaffichage dernière question

---

### Refresh après miroir

**Steps** :
1. Compléter BLOC 1 (toutes questions)
2. Miroir affiché
3. **Refresh la page**
4. **Observer** : Miroir réaffiché, `expectsAnswer: true`, champ actif

**Attendu** : ✅ Miroir réaffiché, validation possible

**Résultat actuel** : ✅ **CONFORME** (logique re-affichage présente)

**Preuve** : `blockOrchestrator.ts:232-244` (logique re-affichage miroir si `allQuestionsAnswered && lastAssistantMessage && !userMessage`)

---

### Refresh après profil final

**Steps** :
1. Compléter parcours jusqu'à BLOC 10
2. Profil final généré
3. **Refresh la page**
4. **Observer** : Profil final réaffiché, bouton matching visible

**Attendu** : ✅ Profil final réaffiché, état `STEP_99_MATCH_READY`

**Résultat actuel** : ✅ **CONFORME** (logique présente)

**Preuve** : `routes/start.ts:77` (step retourné), `ui-test/app.js:414-420` (détection `STEP_99_MATCH_READY`)

---

### Refresh après matching

**Steps** :
1. Compléter parcours jusqu'à matching
2. Matching généré
3. **Refresh la page**
4. **Observer** : Matching réaffiché, bouton FIN visible

**Attendu** : ✅ Matching réaffiché, état `DONE_MATCHING`

**Résultat actuel** : ❌ **NON CONFORME** — Matching non réaffiché (`response: ''`)

**Preuve** : `axiomExecutor.ts:2105` (retourne `response: ''`), pas de logique de réaffichage matching

**Impact** : 🔴 **GO-BLOCKER** — Matching perdu après refresh

---

## TEST 4 — CONCATÉNATION MIROIR + QUESTION

### BLOC 1 fin → début BLOC 2A

**Steps** :
1. Compléter BLOC 1 (toutes questions)
2. Miroir affiché
3. Valider miroir (réponse non vide)
4. **Observer** : Question BLOC 2A affichée seule (pas de concaténation avec miroir)

**Attendu** : ✅ Question BLOC 2A seule, pas de miroir visible

**Résultat actuel** : ✅ **CONFORME**

**Preuve** : `blockOrchestrator.ts:288` (question seule, pas de concaténation)

---

### BLOC 2B fin → début BLOC 3

**Steps** :
1. Compléter BLOC 2B (toutes questions)
2. Miroir affiché
3. Valider miroir
4. **Observer** : Question BLOC 3 affichée seule (pas de concaténation avec miroir)

**Attendu** : ✅ Question BLOC 3 seule, pas de miroir visible

**Résultat actuel** : ✅ **CONFORME**

**Preuve** : `blockOrchestrator.ts:1113` (miroir seul), transition via `executeAxiom()` (question 3 séparée)

---

### BLOCS 3-9 (annonce transition)

**Steps** :
1. Compléter un bloc 3-9 (toutes questions)
2. Miroir affiché
3. **Observer** : Miroir + annonce transition (dans même texte ou séparé ?)

**Attendu** : ⚠️ Annonce transition après miroir (format à clarifier)

**Résultat actuel** : ⚠️ **PARTIELLEMENT CONFORME** — Annonce dans prompt, mais pas de séparation technique garantie

**Preuve** : `axiomExecutor.ts:1625-1631` (instruction prompt), `1969` (réponse LLM complète)

---

## TEST 5 — VALIDATION MIROIR

### BLOC 1 — Validation libre

**Steps** :
1. Compléter BLOC 1 (toutes questions)
2. Miroir affiché
3. Répondre "Oui" (validation)
4. **Observer** : Transition vers BLOC 2A

**Attendu** : ✅ Validation acceptée, transition OK

**Résultat actuel** : ✅ **CONFORME**

**Preuve** : `blockOrchestrator.ts:247-249` (validation libre, toute réponse non vide acceptée)

---

### BLOC 1 — Validation nuance

**Steps** :
1. Compléter BLOC 1 (toutes questions)
2. Miroir affiché
3. Répondre "Non, nuance : je pense plutôt que..."
4. **Observer** : Validation stockée avec `kind: 'mirror_validation'`, transition OK

**Attendu** : ✅ Validation stockée, transition OK

**Résultat actuel** : ✅ **CONFORME**

**Preuve** : `sessionStore.ts:426-457` (stockage avec `kind: 'mirror_validation'`)

---

### BLOCS 3-9 — Validation libre

**Steps** :
1. Compléter un bloc 3-9 (toutes questions)
2. Miroir affiché
3. Répondre "Oui" (validation)
4. **Observer** : Transition vers bloc suivant

**Attendu** : ✅ Validation acceptée, transition OK

**Résultat actuel** : ✅ **CONFORME**

**Preuve** : `axiomExecutor.ts:1818-1821` (détection validation miroir), `1850-1854` (transition)

---

## TEST 6 — PROFIL FINAL (BLOC 10)

### Structure (7 sections)

**Steps** :
1. Compléter parcours jusqu'à BLOC 10
2. Générer profil final
3. **Vérifier** : 7 sections présentes :
   - 🔥 Ce qui te met vraiment en mouvement
   - 🧱 Comment tu tiens dans le temps
   - ⚖️ Tes valeurs quand il faut agir
   - 🧩 Ce que révèlent tes projections
   - 🛠️ Tes vraies forces… et tes vraies limites
   - 🎯 Ton positionnement professionnel naturel
   - 🧠 Lecture globale — synthèse émotionnelle courte

**Attendu** : ✅ 7 sections présentes

**Résultat actuel** : ⚠️ **NON VALIDÉ** — Aucune validation dans code

**Preuve** : `axiomExecutor.ts:1862` (pas de validation), prompt définit sections mais pas de vérification code

---

### Ordre sections

**Steps** :
1. Générer profil final
2. **Vérifier** : Sections dans l'ordre défini (1→7)

**Attendu** : ✅ Ordre respecté

**Résultat actuel** : ⚠️ **NON VALIDÉ** — Aucune validation dans code

---

### Texte fixe obligatoire

**Steps** :
1. Générer profil final
2. **Vérifier** : Texte fixe présent :
   - "Si, en lisant ça, tu t'es dit : 👉 « oui… c'est exactement moi »"
   - "🔥 ET SI CE PROFIL SERVAIT À QUELQUE CHOSE DE VRAIMENT CONCRET ?"

**Attendu** : ✅ Texte fixe présent

**Résultat actuel** : ⚠️ **NON VALIDÉ** — Aucune validation dans code

---

### Absence question

**Steps** :
1. Générer profil final
2. **Vérifier** : Profil ne se termine pas par "?"

**Attendu** : ✅ Pas de question en fin de profil

**Résultat actuel** : ⚠️ **NON VALIDÉ** — Aucune validation dans code

---

## TEST 7 — MATCHING FINAL

### Structure (bandeau)

**Steps** :
1. Générer matching
2. **Vérifier** : Bandeau présent : `🟢 / 🔵 / 🟠 MATCHING AXIOM — [ISSUE]`

**Attendu** : ✅ Bandeau exact présent

**Résultat actuel** : ⚠️ **NON VALIDÉ** — Aucune validation dans code

---

### Structure (sections)

**Steps** :
1. Générer matching
2. **Vérifier** : Sections présentes :
   - 🔎 Lecture de compatibilité
   - - Rapport au cœur du métier
   - - Rapport à la durée
   - - Cohérence globale

**Attendu** : ✅ Sections présentes

**Résultat actuel** : ⚠️ **NON VALIDÉ** — Aucune validation dans code

---

### Sections conditionnelles

**Steps** :
1. Générer matching avec ISSUE = 🟢 ALIGNÉ
2. **Vérifier** : Sections conditionnelles présentes :
   - 💼 PROJECTION CONCRÈTE
   - 🧭 LE CADRE

**Steps** :
1. Générer matching avec ISSUE = 🟠 PAS ALIGNÉ
2. **Vérifier** : Sections conditionnelles absentes

**Attendu** : ✅ Sections conditionnelles selon ISSUE

**Résultat actuel** : ⚠️ **NON VALIDÉ** — Aucune validation dans code

---

### Dépendance profil final

**Steps** :
1. Générer profil final
2. Générer matching
3. **Vérifier logs** : Profil final injecté dans prompt matching

**Attendu** : ✅ Profil final présent dans contexte matching

**Résultat actuel** : ✅ **CONFORME**

**Preuve** : `axiomExecutor.ts:2024-2026` (injection `finalProfileText`)

---

## TEST 8 — IDEMPOTENCE

### Double START_BLOC_1

**Steps** :
1. Démarrer session AXIOM
2. Compléter identité
3. Choisir tutoiement
4. Lire préambule
5. Cliquer "Je commence mon profil" (1er clic)
6. **Simuler** : Cliquer à nouveau rapidement (2e clic)
7. **Observer** : Une seule génération de questions

**Attendu** : ✅ Une seule génération

**Résultat actuel** : ✅ **CONFORME**

**Preuve** : `blockOrchestrator.ts:198-201` (vérification queue existante)

---

### Double START_MATCHING

**Steps** :
1. Compléter parcours jusqu'à matching
2. Cliquer "👉 Je génère mon matching" (1er clic)
3. **Simuler** : Cliquer à nouveau rapidement (2e clic)
4. **Observer** : Une seule génération de matching

**Attendu** : ✅ Une seule génération

**Résultat actuel** : ⚠️ **PARTIELLEMENT CONFORME** — Désactivation bouton OK, mais pas de vérification si matching déjà généré

**Preuve** : `ui-test/app.js:301` (désactivation), `axiomExecutor.ts:1996` (pas de vérification `DONE_MATCHING`)

---

## TEST 9 — STREAMING (SSE)

### Route /axiom/stream fonctionnelle

**Steps** :
1. Appeler `POST /axiom/stream` avec sessionId valide
2. **Observer** : Chunks SSE reçus

**Attendu** : ✅ Chunks SSE reçus

**Résultat actuel** : ❌ **NON IMPLÉMENTÉ** — Route retourne `NOT_IMPLEMENTED`

**Preuve** : `server.ts:988` (retourne erreur)

---

### Frontend consomme SSE

**Steps** :
1. Ouvrir `ui-test/index.html`
2. Démarrer session
3. **Observer** : Consommation SSE (EventSource ou fetch reader)

**Attendu** : ✅ Consommation SSE active

**Résultat actuel** : ❌ **NON IMPLÉMENTÉ** — Aucune consommation SSE dans frontend

**Preuve** : Recherche `EventSource`, `SSE`, `stream` dans `ui-test/app.js` → Aucun résultat

---

## RÉSUMÉ TESTS

| Test | Statut | Action requise |
|------|--------|----------------|
| Séquentialité BLOC 1 (normal) | ✅ CONFORME | Aucune |
| Séquentialité BLOC 1 (questions multiples) | ✅ CONFORME | Aucune |
| Séquentialité BLOC 1 (faux positif) | ⚠️ RISQUE | Monitoring |
| Boutons désactivation | ✅ CONFORME | Aucune |
| Refresh pendant question | ⚠️ NON TESTÉ | Test manuel |
| Refresh après miroir | ✅ CONFORME | Aucune |
| Refresh après profil final | ✅ CONFORME | Aucune |
| Refresh après matching | ❌ NON CONFORME | Fix réaffichage |
| Concaténation miroir/question | ✅ CONFORME | Aucune |
| Validation miroir | ✅ CONFORME | Aucune |
| Profil final structure | ⚠️ NON VALIDÉ | Ajouter validators |
| Matching structure | ⚠️ NON VALIDÉ | Ajouter validators |
| Idempotence | ⚠️ PARTIEL | Renforcer |
| Streaming | ❌ NON IMPLÉMENTÉ | Implémenter ou supprimer |

---

**FIN DES NOTES DE REPRODUCTION**
