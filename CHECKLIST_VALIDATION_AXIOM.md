# ✅ CHECKLIST DE VALIDATION AXIOM

**Date** : 2025-01-27  
**Objectif** : Scénarios de test manuel pour valider la conformité AXIOM/REVELIOM  
**Durée estimée** : 30-60 minutes

---

## 🎯 PRÉREQUIS

- Serveur AXIOM démarré en local (`npm run dev`)
- Frontend accessible (`ui-test/index.html`)
- Tenant/Poste valides : `tenant=elgaenergy&poste=commercial_b2b`
- Console navigateur ouverte (F12) pour observer les logs

---

## 1️⃣ PARCOURS NOMINAL COMPLET (Happy Path)

### Test 1.1 : Démarrage → Identité → Tone → Préambule

**Actions** :
1. Ouvrir `ui-test/index.html?tenant=elgaenergy&poste=commercial_b2b`
2. Observer le message d'accueil
3. Remplir le formulaire d'identité (Prénom, Nom, Email)
4. Cliquer "Continuer"
5. Répondre à la question tone ("tutoie" ou "vouvoie")
6. Observer l'affichage du préambule

**Critères de succès** :
- ✅ Formulaire d'identité affiché après message d'accueil
- ✅ Après soumission identité, question tone affichée
- ✅ Après réponse tone, préambule affiché automatiquement
- ✅ Bouton "Je commence mon profil" visible après préambule
- ✅ `data.step === 'STEP_03_BLOC1'` dans la console

**Temps estimé** : 2 minutes

---

### Test 1.2 : BLOC 1 → Miroir → Validation → BLOC 2A

**Actions** :
1. Cliquer sur "Je commence mon profil"
2. Répondre aux questions BLOC 1 (3-5 questions selon génération)
3. Observer l'affichage du miroir BLOC 1
4. **CRITIQUE** : Vérifier si le champ de saisie est actif après le miroir
5. **CRITIQUE** : Vérifier si une question BLOC 2A apparaît immédiatement après le miroir
6. Si champ actif : Répondre "Oui, ça me parle" ou "Non, il y a une nuance..."
7. Observer le comportement

**Critères de succès** :
- ✅ Miroir BLOC 1 affiché avec 3 sections (1️⃣, 2️⃣, 3️⃣)
- ✅ Section 3️⃣ contient "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."
- ✅ **ATTENDU** : Champ de saisie actif après le miroir (`expectsAnswer: true`)
- ✅ **ATTENDU** : Aucune question BLOC 2A avant validation du miroir
- ⚠️ **PROBLÈME ACTUEL** : Question BLOC 2A apparaît immédiatement (non conforme)

**Temps estimé** : 3 minutes

---

### Test 1.3 : BLOC 2A → BLOC 2B → Miroir → Validation → BLOC 3

**Actions** :
1. Répondre aux 3 questions BLOC 2A (médium, préférences, œuvre noyau)
2. Observer la transition automatique vers BLOC 2B
3. Répondre aux questions BLOC 2B (motifs, personnages, traits par œuvre)
4. Observer l'affichage du miroir BLOC 2B
5. **CRITIQUE** : Vérifier si le champ de saisie est actif après le miroir
6. **CRITIQUE** : Vérifier si une question BLOC 3 apparaît immédiatement après le miroir
7. Si champ actif : Répondre "Oui, ça me parle" ou "Non, il y a une nuance..."
8. Observer le comportement

**Critères de succès** :
- ✅ Aucun miroir après BLOC 2A (transition directe vers BLOC 2B)
- ✅ Miroir BLOC 2B affiché avec 3 sections
- ✅ **ATTENDU** : Champ de saisie actif après le miroir
- ✅ **ATTENDU** : Aucune question BLOC 3 avant validation du miroir
- ⚠️ **PROBLÈME ACTUEL** : Question BLOC 3 apparaît immédiatement (non conforme)

**Temps estimé** : 5 minutes

---

### Test 1.4 : BLOCS 3-9 → Miroirs → Validation

**Actions** :
1. Répondre aux questions BLOC 3
2. Observer l'affichage du miroir BLOC 3
3. **CRITIQUE** : Vérifier `expectsAnswer` dans la console
4. **CRITIQUE** : Vérifier si le système passe automatiquement au BLOC 4
5. Répéter pour BLOCS 4-9

**Critères de succès** :
- ✅ Miroir affiché après chaque bloc (3-9)
- ✅ **ATTENDU** : `expectsAnswer: true` après chaque miroir
- ✅ **ATTENDU** : Champ de saisie actif pour validation
- ⚠️ **PROBLÈME ACTUEL** : `expectsAnswer: false` et transition automatique (non conforme)

**Temps estimé** : 10 minutes (1-2 min par bloc)

---

### Test 1.5 : BLOC 10 → MATCH_READY → Matching → DONE

**Actions** :
1. Répondre aux questions BLOC 10
2. Observer l'affichage du profil final
3. Vérifier l'apparition du bouton "Je génère mon matching"
4. Cliquer sur le bouton
5. Observer l'affichage du matching

**Critères de succès** :
- ✅ Profil final affiché après BLOC 10
- ✅ Bouton "Je génère mon matching" visible (`step === 'STEP_99_MATCH_READY'`)
- ✅ Matching généré après clic bouton
- ✅ `step === 'DONE_MATCHING'` à la fin

**Temps estimé** : 3 minutes

---

## 2️⃣ REPRISE / REFRESH

### Test 2.1 : Refresh après préambule

**Actions** :
1. Compléter identité + tone + préambule
2. Observer le bouton "Je commence mon profil"
3. **Refresh la page** (F5)
4. Observer l'état restauré

**Critères de succès** :
- ✅ Préambule toujours affiché
- ✅ Bouton "Je commence mon profil" toujours visible
- ✅ `step === 'STEP_03_BLOC1'` dans la console
- ✅ Pas de retour à l'identité ou au tone

**Temps estimé** : 1 minute

---

### Test 2.2 : Refresh pendant BLOC 1

**Actions** :
1. Démarrer BLOC 1
2. Répondre à 1-2 questions
3. **Refresh la page**
4. Observer l'état restauré

**Critères de succès** :
- ✅ Questions déjà posées affichées dans l'historique
- ✅ Prochaine question affichée (pas de reprise depuis le début)
- ✅ `currentBlock === 1` dans la console
- ✅ `step === 'BLOC_01'` dans la console

**Temps estimé** : 1 minute

---

### Test 2.3 : Refresh après miroir (avant validation)

**Actions** :
1. Compléter BLOC 1 jusqu'au miroir
2. Observer le miroir affiché
3. **NE PAS valider le miroir**
4. **Refresh la page**
5. Observer l'état restauré

**Critères de succès** :
- ✅ Miroir toujours affiché
- ✅ **ATTENDU** : Champ de saisie actif pour validation
- ⚠️ **PROBLÈME ACTUEL** : Question BLOC 2A peut apparaître (non conforme)

**Temps estimé** : 1 minute

---

## 3️⃣ VALIDATION MIROIR (CRITIQUE)

### Test 3.1 : Validation miroir BLOC 1

**Actions** :
1. Compléter BLOC 1 jusqu'au miroir
2. Observer le miroir affiché
3. **Vérifier dans la console** : `data.expectsAnswer` après le miroir
4. **Vérifier visuellement** : Champ de saisie actif ou question BLOC 2A visible
5. Si champ actif : Répondre "Oui, ça me parle"
6. Observer le comportement

**Critères de succès** :
- ✅ `expectsAnswer: true` après le miroir
- ✅ Champ de saisie actif
- ✅ Aucune question BLOC 2A avant validation
- ⚠️ **PROBLÈME ACTUEL** : `expectsAnswer: true` mais question BLOC 2A déjà affichée (non conforme)

**Temps estimé** : 2 minutes

---

### Test 3.2 : Validation miroir BLOC 2B

**Actions** :
1. Compléter BLOC 2B jusqu'au miroir
2. Observer le miroir affiché
3. **Vérifier dans la console** : `data.expectsAnswer` après le miroir
4. **Vérifier visuellement** : Champ de saisie actif ou question BLOC 3 visible
5. Si champ actif : Répondre "Non, il y a une nuance : ..."
6. Observer le comportement

**Critères de succès** :
- ✅ `expectsAnswer: true` après le miroir
- ✅ Champ de saisie actif
- ✅ Aucune question BLOC 3 avant validation
- ⚠️ **PROBLÈME ACTUEL** : Question BLOC 3 déjà affichée (non conforme)

**Temps estimé** : 2 minutes

---

### Test 3.3 : Validation miroir BLOC 3

**Actions** :
1. Compléter BLOC 3 jusqu'au miroir
2. Observer le miroir affiché
3. **Vérifier dans la console** : `data.expectsAnswer` après le miroir
4. **Vérifier dans la console** : `data.step` après le miroir
5. Si champ actif : Répondre "Oui, ça me parle"
6. Observer le comportement

**Critères de succès** :
- ✅ `expectsAnswer: true` après le miroir
- ✅ Champ de saisie actif
- ✅ `step` reste sur `BLOC_03` jusqu'à validation
- ⚠️ **PROBLÈME ACTUEL** : `expectsAnswer: false` et transition automatique vers BLOC 4 (non conforme)

**Temps estimé** : 2 minutes

---

## 4️⃣ ANTI-DOUBLES / IDEMPOTENCE

### Test 4.1 : Double clic bouton "Je commence mon profil"

**Actions** :
1. Arriver au préambule
2. **Double clic rapide** sur "Je commence mon profil"
3. Observer le comportement

**Critères de succès** :
- ✅ Une seule génération de questions BLOC 1
- ✅ Bouton désactivé après le premier clic
- ✅ Pas de duplication dans l'historique

**Temps estimé** : 1 minute

---

### Test 4.2 : Double clic bouton "Je génère mon matching"

**Actions** :
1. Arriver à `STEP_99_MATCH_READY`
2. **Double clic rapide** sur "Je génère mon matching"
3. Observer le comportement

**Critères de succès** :
- ✅ Un seul matching généré
- ✅ Bouton désactivé après le premier clic
- ✅ Pas de duplication dans l'historique

**Temps estimé** : 1 minute

---

### Test 4.3 : Envoi message dupliqué (simulation bug réseau)

**Actions** :
1. Répondre à une question
2. **Avant la réponse** : Re-cliquer sur "Envoyer" (simulation)
3. Observer le comportement

**Critères de succès** :
- ✅ Un seul message traité
- ⚠️ **PROBLÈME ACTUEL** : Pas de protection explicite, doublon possible

**Temps estimé** : 1 minute

---

## 5️⃣ GESTION D'ERREURS

### Test 5.1 : Tenant/Poste invalides

**Actions** :
1. Ouvrir `ui-test/index.html?tenant=invalid&poste=invalid`
2. Observer le comportement

**Critères de succès** :
- ✅ Message d'erreur clair affiché
- ✅ Code HTTP 400
- ✅ Format JSON : `{ error: "UNKNOWN_TENANT_OR_POSTE", message: "..." }`

**Temps estimé** : 1 minute

---

### Test 5.2 : Session invalide (simulation)

**Actions** :
1. Ouvrir `ui-test/index.html?tenant=elgaenergy&poste=commercial_b2b`
2. Modifier manuellement le `sessionId` dans localStorage avec une valeur invalide
3. Refresh la page
4. Observer le comportement

**Critères de succès** :
- ✅ Nouvelle session créée silencieusement
- ✅ Pas d'erreur utilisateur
- ⚠️ **FRAGILE** : Perte de session possible

**Temps estimé** : 1 minute

---

## 6️⃣ FORMAT REVELIOM

### Test 6.1 : Format miroir BLOC 1

**Actions** :
1. Compléter BLOC 1 jusqu'au miroir
2. Observer le format du miroir

**Critères de succès** :
- ✅ Section 1️⃣ présente (20 mots max)
- ✅ Section 2️⃣ présente (25 mots max)
- ✅ Section 3️⃣ présente avec phrase exacte : "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."
- ✅ Lecture en creux présente ("probablement pas X, mais plutôt Y")
- ✅ Aucun mot interdit (synthèse, conclusion, global, métier, compatibilité)

**Temps estimé** : 2 minutes

---

### Test 6.2 : Format miroir BLOCS 3-9

**Actions** :
1. Compléter BLOC 3 jusqu'au miroir
2. Observer le format du miroir
3. Répéter pour BLOCS 4-9

**Critères de succès** :
- ✅ Même format que BLOC 1 (3 sections, longueurs, validation ouverte)
- ✅ Aucun mot interdit

**Temps estimé** : 5 minutes (30 secondes par bloc)

---

## 7️⃣ ADRESSE AU CANDIDAT (2e personne)

### Test 7.1 : Vérification ton questions

**Actions** :
1. Parcourir les questions BLOC 1-10
2. Observer le ton utilisé

**Critères de succès** :
- ✅ Questions s'adressent au candidat (2e personne : "tu", "toi")
- ✅ Pas de 3e personne ("James semble...", "Il est...")

**Temps estimé** : 2 minutes

---

### Test 7.2 : Vérification ton miroirs

**Actions** :
1. Observer les miroirs BLOC 1, 2B, 3-9
2. Vérifier le ton utilisé

**Critères de succès** :
- ✅ Miroirs s'adressent au candidat (2e personne)
- ✅ Pas de 3e personne

**Temps estimé** : 2 minutes

---

## 8️⃣ RÉSUMÉ DES TESTS CRITIQUES

### Tests bloquants (NO-GO si échec)

1. **Test 3.1** : Validation miroir BLOC 1 — Champ actif, pas de question avant validation
2. **Test 3.2** : Validation miroir BLOC 2B — Champ actif, pas de question avant validation
3. **Test 3.3** : Validation miroir BLOC 3 — `expectsAnswer: true`, pas de transition automatique

### Tests fragiles (à surveiller)

1. **Test 2.3** : Refresh après miroir — État restauré correctement
2. **Test 4.3** : Message dupliqué — Pas de doublon dans l'historique
3. **Test 5.2** : Session invalide — Nouvelle session créée proprement

---

## 9️⃣ TEMPS TOTAL ESTIMÉ

- Parcours nominal complet : 20 minutes
- Reprise/Refresh : 3 minutes
- Validation miroir (critique) : 6 minutes
- Anti-doubles : 3 minutes
- Gestion d'erreurs : 2 minutes
- Format REVELIOM : 7 minutes
- Adresse candidat : 4 minutes

**Total** : **45 minutes** pour un test complet

---

## 🔟 RAPPORT DE TEST

Pour chaque test, noter :
- ✅ **PASS** : Critères de succès respectés
- ⚠️ **WARN** : Critères partiellement respectés (détails dans notes)
- ❌ **FAIL** : Critères non respectés (détails dans notes)

**Exemple de rapport** :

```
Test 3.1 - Validation miroir BLOC 1
- expectsAnswer: true : ✅ PASS
- Champ de saisie actif : ✅ PASS
- Aucune question BLOC 2A avant validation : ❌ FAIL
  → Question BLOC 2A apparaît immédiatement après le miroir
  → Concaténation miroir + question dans data.response
  → Non conforme aux règles REVELIOM
```

---

**FIN DE LA CHECKLIST**
