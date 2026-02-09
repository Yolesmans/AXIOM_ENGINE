# ✅ CHECKLIST GO/NO-GO CANDIDATS RÉELS — AXIOM / REVELIOM

**Date** : 2025-01-27  
**Objectif** : Checklist exécutable pour valider l'ouverture aux candidats réels  
**Règle** : Si 1 test échoue → **NO-GO**

---

## 🎯 RÈGLES D'EXÉCUTION

- **Tous les tests doivent être exécutés** avant ouverture
- **Un seul échec = NO-GO**
- **Chaque test doit être documenté** (résultat + screenshot/log si applicable)
- **Tests manuels** : Exécutables en 30-60 minutes
- **Tests automatisables** : Peuvent être scriptés pour validation continue

---

## 1️⃣ CONDITIONS TECHNIQUES (BLOQUANT)

### T1 — Validation miroir BLOC 1

**Test** :
1. Compléter BLOC 1 jusqu'au miroir
2. Observer l'affichage du miroir BLOC 1
3. **Vérifier** : Le miroir est affiché seul (pas de question BLOC 2A visible)
4. **Vérifier** : `data.expectsAnswer === true` dans la console
5. **Vérifier** : Champ de saisie actif
6. Répondre "Oui, ça me parle" ou "Non, il y a une nuance : ..."
7. **Vérifier** : Question BLOC 2A générée uniquement après validation

**Critères de succès** :
- ✅ Miroir affiché seul
- ✅ `expectsAnswer: true` après miroir
- ✅ Champ de saisie actif
- ✅ Aucune question BLOC 2A avant validation
- ✅ Question BLOC 2A générée après validation

**Si échec** : 🔴 **NO-GO**

---

### T2 — Validation miroir BLOC 2B

**Test** :
1. Compléter BLOC 2B jusqu'au miroir
2. Observer l'affichage du miroir BLOC 2B
3. **Vérifier** : Le miroir est affiché seul (pas de question BLOC 3 visible)
4. **Vérifier** : `data.expectsAnswer === true` dans la console
5. **Vérifier** : Champ de saisie actif
6. Répondre "Oui, ça me parle" ou "Non, il y a une nuance : ..."
7. **Vérifier** : Question BLOC 3 générée uniquement après validation

**Critères de succès** :
- ✅ Miroir affiché seul
- ✅ `expectsAnswer: true` après miroir
- ✅ Champ de saisie actif
- ✅ Aucune question BLOC 3 avant validation
- ✅ Question BLOC 3 générée après validation

**Si échec** : 🔴 **NO-GO**

---

### T3 — Validation miroir BLOCS 3-9

**Test** :
1. Compléter BLOC 3 jusqu'au miroir
2. Observer l'affichage du miroir BLOC 3
3. **Vérifier** : `data.expectsAnswer === true` dans la console
4. **Vérifier** : Champ de saisie actif
5. **Vérifier** : `data.step === 'BLOC_03'` (pas de transition automatique)
6. Répondre "Oui, ça me parle"
7. **Vérifier** : Transition vers BLOC 4 uniquement après validation
8. Répéter pour BLOCS 4-9

**Critères de succès** :
- ✅ `expectsAnswer: true` après chaque miroir
- ✅ Champ de saisie actif
- ✅ Pas de transition automatique
- ✅ Transition au bloc suivant uniquement après validation

**Si échec** : 🔴 **NO-GO**

---

### T4 — Aucune double question / concaténation

**Test** :
1. Parcourir le parcours complet
2. **Vérifier** : Aucun message ne contient miroir + question
3. **Vérifier** : Aucun message ne contient profil final + question
4. **Vérifier** : Aucun message ne contient matching + question

**Critères de succès** :
- ✅ Miroir seul (pas de question suivante)
- ✅ Profil final seul (pas de question)
- ✅ Matching seul (pas de question)

**Si échec** : 🔴 **NO-GO**

---

### T5 — Refresh safe à chaque étape

**Test** :
1. Refresh après préambule → Vérifier état restauré
2. Refresh en plein BLOC 1 → Vérifier question en cours
3. Refresh après miroir BLOC 1 (avant validation) → Vérifier miroir seul, pas de question 2A
4. Refresh en plein BLOC 2A → Vérifier question en cours
5. Refresh après miroir BLOC 2B (avant validation) → Vérifier miroir seul, pas de question 3
6. Refresh après profil final → Vérifier profil affiché, bouton matching visible

**Critères de succès** :
- ✅ État correctement restauré après chaque refresh
- ✅ Pas de saut de bloc
- ✅ Pas de question affichée avant validation après refresh

**Si échec** : 🔴 **NO-GO**

---

### T6 — Boutons protégés UI + serveur

**Test** :
1. Double clic rapide sur "Je commence mon profil" → Vérifier une seule génération
2. Double clic rapide sur "Je génère mon matching" → Vérifier un seul matching
3. Envoi message dupliqué (simulation bug réseau) → Vérifier pas de doublon dans historique

**Critères de succès** :
- ✅ Bouton désactivé après premier clic
- ✅ Une seule génération côté serveur
- ✅ Pas de doublon dans l'historique

**Si échec** : 🔴 **NO-GO**

---

### T7 — Aucun double déclenchement possible

**Test** :
1. Clic bouton → Attendre réponse → Clic bouton à nouveau (simulation latence) → Vérifier une seule exécution
2. Refresh pendant génération → Vérifier pas de duplication
3. Retry réseau (simulation) → Vérifier pas de doublon

**Critères de succès** :
- ✅ Une seule exécution même en cas de latence
- ✅ Pas de duplication après refresh
- ✅ Pas de doublon après retry réseau

**Si échec** : 🔴 **NO-GO**

---

## 2️⃣ CONDITIONS PRODUIT (BLOQUANT)

### P1 — Ton mentor stable

**Test** :
1. Parcourir le parcours complet
2. **Vérifier** : Questions : ton mentor (chaleureux mais pro, direct mais respectueux)
3. **Vérifier** : Miroirs : ton mentor
4. **Vérifier** : Profil final : ton mentor
5. **Vérifier** : Matching : ton mentor
6. **Vérifier** : Pas de jargon RH
7. **Vérifier** : Pas d'effet "test psy"

**Critères de succès** :
- ✅ Ton mentor stable sur tout le parcours
- ✅ Pas de jargon RH
- ✅ Pas d'effet "test psy"

**Si échec** : 🔴 **NO-GO**

---

### P2 — Adresse directe au candidat (2e personne)

**Test** :
1. Parcourir le parcours complet
2. **Vérifier** : Questions : "tu/toi" (pas "il/elle")
3. **Vérifier** : Miroirs : "tu/toi"
4. **Vérifier** : Profil final : "tu/toi"
5. **Vérifier** : Matching : "tu/toi"
6. **Vérifier** : Aucune 3e personne ("il", "ce profil", prénom en 3e personne)

**Critères de succès** :
- ✅ Adresse directe (2e personne) sur tout le parcours
- ✅ Aucune 3e personne détectée

**Si échec** : 🔴 **NO-GO**

---

### P3 — Structure profil final respectée

**Test** :
1. Compléter le parcours jusqu'au profil final
2. **Vérifier** : Section 🔥 présente
3. **Vérifier** : Section 🧱 présente
4. **Vérifier** : Section ⚖️ présente
5. **Vérifier** : Section 🧩 présente
6. **Vérifier** : Section 🛠️ présente
7. **Vérifier** : Section 🎯 présente
8. **Vérifier** : Section 🧠 présente
9. **Vérifier** : Ordre respecté (🔥 avant 🧱, etc.)
10. **Vérifier** : Texte fixe présent ("Si, en lisant ça, tu t'es dit : 👉 « oui… c'est exactement moi »")
11. **Vérifier** : Texte fixe 2 présent ("🔥 ET SI CE PROFIL SERVAIT À QUELQUE CHOSE DE VRAIMENT CONCRET ?")
12. **Vérifier** : Pas de question à la fin

**Critères de succès** :
- ✅ Toutes les sections présentes
- ✅ Ordre respecté
- ✅ Textes fixes présents
- ✅ Pas de question

**Si échec** : 🔴 **NO-GO**

---

### P4 — Format matching respecté

**Test** :
1. Compléter le parcours jusqu'au matching
2. **Vérifier** : Bandeau exact présent (`━━━━━━━━━━━━━━━━━━`, `🟢 / 🔵 / 🟠 MATCHING AXIOM — [ISSUE]`)
3. **Vérifier** : 1 phrase de verdict clair
4. **Vérifier** : 1 paragraphe explicatif maximum
5. **Vérifier** : Section 🔎 Lecture de compatibilité présente
6. **Vérifier** : Section 🧭 Cadrage humain présente
7. **Vérifier** : Section 🚀 POUR ALLER PLUS LOIN présente
8. **Vérifier** : Si aligné/conditionnel : Section 💼 PROJECTION CONCRÈTE présente
9. **Vérifier** : Si aligné/conditionnel : Section 🧭 LE CADRE présente
10. **Vérifier** : Si PAS ALIGNÉ : Sections 💼 et 🧭 absentes
11. **Vérifier** : Texte fixe présent (exemple chiffré)
12. **Vérifier** : Pas de question à la fin

**Critères de succès** :
- ✅ Bandeau exact
- ✅ Toutes les sections obligatoires présentes
- ✅ Sections conditionnelles selon issue
- ✅ Textes fixes présents
- ✅ Pas de question

**Si échec** : 🔴 **NO-GO**

---

## 3️⃣ CONDITIONS EXPÉRIENCE (BLOQUANT)

### E1 — Temps de réponse acceptable

**Test** :
1. Mesurer temps de réponse pour chaque type de contenu :
   - Questions courtes : < 3 secondes
   - Miroirs : < 5 secondes (ou streaming actif)
   - Profil final : < 15 secondes (ou streaming actif)
   - Matching : < 15 secondes (ou streaming actif)

**Critères de succès** :
- ✅ Questions : < 3s
- ✅ Miroirs : < 5s ou streaming
- ✅ Profil/Matching : < 15s ou streaming

**Si échec** : 🔴 **NO-GO**

---

### E2 — Aucun sentiment de bug ou saut

**Test** :
1. Parcourir le parcours complet
2. **Vérifier** : Aucun saut de bloc
3. **Vérifier** : Aucun retour en arrière
4. **Vérifier** : Aucun message d'erreur
5. **Vérifier** : Aucun état bloquant

**Critères de succès** :
- ✅ Parcours linéaire sans saut
- ✅ Aucun retour en arrière
- ✅ Aucun message d'erreur
- ✅ Aucun état bloquant

**Si échec** : 🔴 **NO-GO**

---

### E3 — Progression claire

**Test** :
1. Parcourir le parcours complet
2. **Vérifier** : Progression visible (BLOC 1 → 2 → 3 → ... → 10)
3. **Vérifier** : Transitions explicites
4. **Vérifier** : Aucune ambiguïté sur l'étape en cours

**Critères de succès** :
- ✅ Progression visible
- ✅ Transitions explicites
- ✅ Aucune ambiguïté

**Si échec** : 🔴 **NO-GO**

---

### E4 — Sentiment de dialogue réel

**Test** :
1. Parcourir le parcours complet
2. **Vérifier** : Questions adaptées aux réponses précédentes
3. **Vérifier** : Miroirs personnalisés (noms d'œuvres, personnages)
4. **Vérifier** : Profil final unique (pas de texte générique)
5. **Vérifier** : Matching personnalisé

**Critères de succès** :
- ✅ Questions adaptatives
- ✅ Miroirs personnalisés
- ✅ Profil final unique
- ✅ Matching personnalisé

**Si échec** : 🔴 **NO-GO**

---

## 4️⃣ TESTS STREAMING (GO-BLOCKER)

### TS1 — Miroir BLOC 1 streamé

**Test** :
1. Compléter BLOC 1 jusqu'au miroir
2. **Vérifier** : Streaming actif (chunks progressifs)
3. **Vérifier** : Pas de question BLOC 2A pendant streaming
4. **Vérifier** : Streaming terminé → Input actif (`expectsAnswer: true`)
5. **Vérifier** : Question BLOC 2A générée uniquement après validation

**Critères de succès** :
- ✅ Streaming actif
- ✅ Pas de question pendant streaming
- ✅ Input actif après streaming
- ✅ Question générée après validation

**Si échec** : 🔴 **NO-GO**

---

### TS2 — Miroir BLOC 2B streamé

**Test** :
1. Compléter BLOC 2B jusqu'au miroir
2. **Vérifier** : Streaming actif
3. **Vérifier** : Pas de question BLOC 3 pendant streaming
4. **Vérifier** : Streaming terminé → Input actif
5. **Vérifier** : Question BLOC 3 générée uniquement après validation

**Critères de succès** :
- ✅ Streaming actif
- ✅ Pas de question pendant streaming
- ✅ Input actif après streaming
- ✅ Question générée après validation

**Si échec** : 🔴 **NO-GO**

---

### TS3 — Miroirs 3-9 streamés

**Test** :
1. Compléter BLOC 3 jusqu'au miroir
2. **Vérifier** : Streaming actif
3. **Vérifier** : Pas de transition automatique pendant streaming
4. **Vérifier** : Streaming terminé → Input actif
5. **Vérifier** : Transition BLOC 4 uniquement après validation
6. Répéter pour BLOCS 4-9

**Critères de succès** :
- ✅ Streaming actif pour chaque miroir
- ✅ Pas de transition automatique
- ✅ Input actif après streaming
- ✅ Transition uniquement après validation

**Si échec** : 🔴 **NO-GO**

---

### TS4 — Profil final streamé

**Test** :
1. Compléter le parcours jusqu'au profil final
2. **Vérifier** : Streaming actif
3. **Vérifier** : Pas de question pendant streaming
4. **Vérifier** : Streaming terminé → Bouton "Je génère mon matching" visible
5. **Vérifier** : Aucune question à la fin

**Critères de succès** :
- ✅ Streaming actif
- ✅ Pas de question pendant streaming
- ✅ Bouton matching visible après streaming
- ✅ Aucune question

**Si échec** : 🔴 **NO-GO**

---

### TS5 — Matching streamé

**Test** :
1. Générer le matching
2. **Vérifier** : Streaming actif
3. **Vérifier** : Pas de question pendant streaming
4. **Vérifier** : Streaming terminé → `step === 'DONE_MATCHING'`
5. **Vérifier** : Aucune question à la fin

**Critères de succès** :
- ✅ Streaming actif
- ✅ Pas de question pendant streaming
- ✅ `DONE_MATCHING` après streaming
- ✅ Aucune question

**Si échec** : 🔴 **NO-GO**

---

### TS6 — Anti-double streaming

**Test** :
1. Démarrer streaming miroir
2. **Pendant streaming** : Double clic / Refresh / Latence réseau
3. **Vérifier** : Pas de duplication de chunks
4. **Vérifier** : Pas de duplication de messages
5. **Vérifier** : messageId stable (chunks ignorés si messageId différent)

**Critères de succès** :
- ✅ Pas de duplication de chunks
- ✅ Pas de duplication de messages
- ✅ messageId stable

**Si échec** : 🔴 **NO-GO**

---

## 5️⃣ RÉSUMÉ DES TESTS

### Tests techniques (7 tests)
- T1 : Validation miroir BLOC 1
- T2 : Validation miroir BLOC 2B
- T3 : Validation miroir BLOCS 3-9
- T4 : Aucune double question
- T5 : Refresh safe
- T6 : Boutons protégés
- T7 : Aucun double déclenchement

### Tests produit (4 tests)
- P1 : Ton mentor
- P2 : Adresse 2e personne
- P3 : Structure profil final
- P4 : Format matching

### Tests expérience (4 tests)
- E1 : Temps de réponse
- E2 : Aucun bug/saut
- E3 : Progression claire
- E4 : Dialogue réel

### Tests streaming (6 tests)
- TS1 : Miroir BLOC 1 streamé
- TS2 : Miroir BLOC 2B streamé
- TS3 : Miroirs 3-9 streamés
- TS4 : Profil final streamé
- TS5 : Matching streamé
- TS6 : Anti-double streaming

**TOTAL** : **21 tests**

---

## 6️⃣ TEMPS TOTAL ESTIMÉ

- Tests techniques : 20 minutes
- Tests produit : 15 minutes
- Tests expérience : 10 minutes
- Tests streaming : 15 minutes

**Total** : **60 minutes** pour un test complet

---

## 7️⃣ RAPPORT DE TEST

Pour chaque test, noter :
- ✅ **PASS** : Critères de succès respectés
- ⚠️ **WARN** : Critères partiellement respectés (détails dans notes)
- ❌ **FAIL** : Critères non respectés (détails dans notes)

**Exemple de rapport** :

```
Test T1 - Validation miroir BLOC 1
- Miroir affiché seul : ✅ PASS
- expectsAnswer: true : ✅ PASS
- Champ de saisie actif : ✅ PASS
- Aucune question BLOC 2A avant validation : ❌ FAIL
  → Question BLOC 2A apparaît immédiatement après le miroir
  → Concaténation miroir + question dans data.response
  → Non conforme aux règles REVELIOM
```

---

## 8️⃣ VERDICT FINAL

**Si tous les tests PASS** : ✅ **GO** — Ouverture aux candidats réels autorisée

**Si 1 test FAIL** : 🔴 **NO-GO** — Corrections nécessaires avant ouverture

**Si tests WARN** : ⚠️ **GO CONDITIONNEL** — Corrections recommandées mais non bloquantes

---

**FIN DE LA CHECKLIST GO/NO-GO**
