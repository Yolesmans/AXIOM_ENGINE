# 📋 RAPPORT PHASE 3A — VERROUS SÉMANTIQUES BLOC 2A / 2B

**Date** : 2025-01-27  
**Objectif** : Mettre en place les garde-fous techniques garantissant que BLOC 2A et BLOC 2B ne pourront jamais devenir génériques

---

## ✅ CE QUI A ÉTÉ AJOUTÉ

### 1. VALIDATEURS SÉMANTIQUES

**Fichier** : `src/services/validators.ts` (nouveau fichier, 292 lignes)

#### 1.1 `validateTraitsSpecificity()`

**Localisation** : Lignes 60-110

**Fonction** : Détecte les traits trop similaires entre personnages différents

**Méthode** :
- Extrait les propositions de traits depuis les textes (format "A. Trait 1\nB. Trait 2\n...")
- Calcule la similarité entre tous les traits (coefficient de Jaccard)
- Seuil de similarité : **80%** (au-delà = trop proche, non spécifique)

**Retour** :
- `valid: true` si tous les traits sont uniques
- `valid: false` avec liste des doublons détectés si similarité > 80%

**Logs** : Aucun log direct (validation silencieuse, logs au niveau appelant)

**Utilisation** : Appelé lors de la génération BLOC 2B pour valider que chaque personnage a des traits UNIQUES

#### 1.2 `validateMotifsSpecificity()`

**Localisation** : Lignes 112-170

**Fonction** : Détecte les motifs trop similaires entre œuvres différentes

**Méthode** :
- Extrait les 5 propositions de motifs pour chaque œuvre
- Vérifie qu'on a bien 5 propositions par œuvre
- Calcule la similarité entre toutes les propositions (coefficient de Jaccard)
- Seuil de similarité : **70%** (au-delà = trop proche, non spécifique)

**Retour** :
- `valid: true` si tous les motifs sont uniques par œuvre
- `valid: false` avec liste des doublons détectés si similarité > 70%

**Logs** : Aucun log direct (validation silencieuse, logs au niveau appelant)

**Utilisation** : Appelé lors de la génération BLOC 2B pour valider que chaque œuvre a des motifs UNIQUES

#### 1.3 `validateSynthesis2B()`

**Localisation** : Lignes 172-240

**Fonction** : Valide la synthèse finale BLOC 2B (format, contenu, croisement)

**Méthode** :
- Vérifie présence mots-clés obligatoires : rapport au pouvoir, pression, relations, responsabilité
- Vérifie longueur : 4-6 lignes
- Vérifie croisement : présence de "motifs", "personnages", "traits"

**Retour** :
- `valid: true` si tous les critères sont respectés
- `valid: false` avec erreur détaillée si critère manquant

**Logs** : Aucun log direct (validation silencieuse, logs au niveau appelant)

**Utilisation** : Appelé lors de la génération de la synthèse finale BLOC 2B

#### 1.4 `validateQuestion2A1()` et `validateQuestion2A3()`

**Localisation** : Lignes 242-292

**Fonction** : Valide le format des questions BLOC 2A

**Méthode** :
- `validateQuestion2A1()` : Vérifie présence "A. Série" et "B. Film"
- `validateQuestion2A3()` : Vérifie que la question demande une œuvre unique

**Retour** : `valid: true/false` avec erreur détaillée

**Utilisation** : Appelé lors de la génération des questions BLOC 2A (déjà intégré)

#### 1.5 Fonction utilitaire `calculateSimilarity()`

**Localisation** : Lignes 17-40

**Fonction** : Calcule la similarité entre deux chaînes (coefficient de Jaccard)

**Méthode** :
- Normalise les chaînes (lowercase, trim)
- Extrait les mots (longueur > 2 caractères)
- Calcule intersection / union des ensembles de mots
- Retourne score entre 0 (pas de similarité) et 1 (identique)

**Utilisation** : Utilisée par `validateTraitsSpecificity()` et `validateMotifsSpecificity()`

---

### 2. MÉCANISME DE RETRY CONTRÔLÉ

**Fichier** : `src/services/blockOrchestrator.ts`

#### 2.1 Retry dans `generateQuestion2A1()`

**Localisation** : Lignes 520-555

**Fonction** : Génère question 2A.1 avec retry contrôlé si validation échoue

**Mécanisme** :
- Paramètre `retryCount` (défaut 0)
- Appel `validateQuestion2A1()` après génération
- Si validation échoue ET `retryCount < 1` :
  - Log : `[ORCHESTRATOR] Question 2A.1 validation failed, retry: [erreur]`
  - Retry avec prompt renforcé (mention explicite "A. Série" et "B. Film")
- Si validation échoue après retry :
  - Log : `[ORCHESTRATOR] Question 2A.1 validation failed after retry: [erreur]`
  - Retourne quand même la question (avec warning)

**Prompt renforcé** :
```
RÈGLE ABSOLUE AXIOM (RETRY - FORMAT STRICT) :
...
Format OBLIGATOIRE : Question à choix avec EXACTEMENT "A. Série" et "B. Film" sur lignes séparées.
IMPORTANT : La question DOIT contenir les deux options "A. Série" et "B. Film" explicitement.
```

#### 2.2 Retry dans `generateQuestion2A3()`

**Localisation** : Lignes 589-635

**Fonction** : Génère question 2A.3 avec retry contrôlé si validation échoue

**Mécanisme** : Identique à `generateQuestion2A1()`

**Prompt renforcé** :
```
RÈGLE ABSOLUE AXIOM (RETRY - FORMAT STRICT) :
...
La question DOIT demander EXACTEMENT UNE œuvre (utilise les mots "une", "un", "seule", "unique").
La question DOIT mentionner explicitement "œuvre", "série" ou "film".
```

#### 2.3 Mécanisme générique `generateWithRetry()`

**Localisation** : Lignes 637-670

**Fonction** : Template générique pour retry contrôlé (prêt pour BLOC 2B)

**Mécanisme** :
- Paramètres : `generator` (fonction génératrice), `validator` (fonction validation), `maxRetries` (défaut 1)
- Boucle `for` : `attempt` de 0 à `maxRetries`
- À chaque tentative :
  - Appel `generator(attempt)` (passe le numéro de tentative pour prompt adapté)
  - Appel `validator(result)`
  - Si validation réussit : retourne le résultat
  - Si validation échoue ET pas dernière tentative : retry avec prompt renforcé
  - Si validation échoue après toutes tentatives : log erreur + retourne quand même (avec warning)

**Logs** :
- `[ORCHESTRATOR] Validation succeeded after X retry(ies)` si succès après retry
- `[ORCHESTRATOR] Validation failed, retry X/Y: [erreur]` si retry déclenché
- `[ORCHESTRATOR] Validation failed after X retry(ies): [erreur]` si échec final
- `[ORCHESTRATOR] Validation details: [détails]` si détails disponibles

**Utilisation** : Prêt pour être utilisé lors de l'implémentation BLOC 2B

---

### 3. INJECTION FORCÉE DES DONNÉES BLOC 2A

**Fichier** : `src/services/blockOrchestrator.ts`

#### 3.1 Fonction `buildConversationHistoryForBlock2B()`

**Localisation** : Lignes 51-111

**Fonction** : Construit l'historique conversationnel avec injection FORCÉE des réponses BLOC 2A

**Mécanisme** :
1. **Injection forcée BLOC 2A** (lignes 62-88) :
   - Récupère `answerMap[2]` depuis `candidate.answerMaps`
   - Extrait : `answers[0]` (médium), `answers[1]` (3 œuvres), `answers[2]` (œuvre noyau)
   - Injecte dans message système avec label `CONTEXTE BLOC 2A (OBLIGATOIRE — INJECTION FORCÉE)`
   - Log : `[ORCHESTRATOR] BLOC 2A context injected: { medium, preferences, coreWork }`
   - Si `answerMap` absent : Log warning `[ORCHESTRATOR] BLOC 2A answers not found in AnswerMap. BLOC 2B cannot be personalized.`

2. **Historique conversationnel standard** (lignes 90-108) :
   - Prend les 40 derniers messages de `conversationHistory`
   - Fallback sur `candidate.answers` si historique vide

**Garantie** : Même si `conversationHistory` est tronqué, les réponses BLOC 2A sont TOUJOURS injectées

**Utilisation** : Sera utilisé lors de l'implémentation BLOC 2B pour garantir la personnalisation

---

### 4. HELPERS DE VALIDATION POUR BLOC 2B

**Fichier** : `src/services/blockOrchestrator.ts`

#### 4.1 `validateTraitsForBlock2B()`

**Localisation** : Lignes 672-675

**Fonction** : Wrapper pour `validateTraitsSpecificity()`

**Utilisation** : Prêt pour être utilisé lors de l'implémentation BLOC 2B

#### 4.2 `validateMotifsForBlock2B()`

**Localisation** : Lignes 677-680

**Fonction** : Wrapper pour `validateMotifsSpecificity()`

**Utilisation** : Prêt pour être utilisé lors de l'implémentation BLOC 2B

#### 4.3 `validateSynthesisForBlock2B()`

**Localisation** : Lignes 682-685

**Fonction** : Wrapper pour `validateSynthesis2B()`

**Utilisation** : Prêt pour être utilisé lors de l'implémentation BLOC 2B

---

## 📍 OÙ LES ÉLÉMENTS ONT ÉTÉ AJOUTÉS

### Fichiers modifiés/créés

1. **`src/services/validators.ts`** (NOUVEAU)
   - 292 lignes
   - 5 validateurs publics
   - 1 fonction utilitaire privée

2. **`src/services/blockOrchestrator.ts`** (MODIFIÉ)
   - Lignes 1-7 : Import des validateurs
   - Lignes 51-111 : Fonction `buildConversationHistoryForBlock2B()`
   - Lignes 520-555 : Retry dans `generateQuestion2A1()`
   - Lignes 589-635 : Retry dans `generateQuestion2A3()`
   - Lignes 637-670 : Mécanisme générique `generateWithRetry()`
   - Lignes 672-685 : Helpers de validation pour BLOC 2B

---

## 🎯 POURQUOI CES ÉLÉMENTS ONT ÉTÉ AJOUTÉS

### 1. Validateurs sémantiques

**Raison** : Garantir que BLOC 2B ne génère jamais de traits/motifs génériques recyclables

**Risque évité** :
- Traits identiques pour différents personnages → perte de différenciation
- Motifs identiques pour différentes œuvres → perte de spécificité
- Synthèse finale générique → perte de valeur analytique

**Seuils choisis** :
- Traits : 80% (strict, car chaque personnage doit être unique)
- Motifs : 70% (légèrement plus permissif, car œuvres différentes peuvent avoir des axes similaires)

### 2. Retry contrôlé

**Raison** : Donner une seconde chance à l'IA si validation échoue, sans boucle infinie

**Risque évité** :
- Questions mal formatées affichées à l'utilisateur
- Boucle infinie de retry (max 1 retry)
- Perte de contexte (prompt renforcé au retry)

**Choix technique** :
- Max 1 retry : Équilibre entre correction et performance
- Prompt renforcé : Instructions plus explicites au retry
- Retour même si échec : Ne pas bloquer l'utilisateur, mais logger l'erreur

### 3. Injection forcée BLOC 2A

**Raison** : Garantir que BLOC 2B a toujours accès aux réponses BLOC 2A pour personnaliser

**Risque évité** :
- Historique tronqué → perte des réponses BLOC 2A → questions génériques
- Session longue → réponses BLOC 2A hors contexte → perte de personnalisation

**Choix technique** :
- Injection dans message système : Toujours présent, même si historique tronqué
- Label explicite "INJECTION FORCÉE" : Indique l'importance critique
- Logs explicites : Traçabilité de l'injection

---

## ❌ CE QUI N'A VOLONTAIREMENT PAS ÉTÉ FAIT

### 1. Génération complète BLOC 2B

**Raison** : Phase 3A = verrous uniquement, pas d'implémentation métier

**Ce qui manque** :
- Fonction `generateQuestions2B()` complète
- Parsing des questions délimitées
- Enchaînement UX (affichage séquentiel)
- Génération de la synthèse finale

**Quand sera fait** : Phase suivante (implémentation BLOC 2B)

### 2. Logique UX

**Raison** : Phase 3A = backend uniquement, pas de frontend

**Ce qui manque** :
- Affichage séquentiel des questions
- Gestion des réponses utilisateur
- Transitions entre œuvres

**Quand sera fait** : Phase suivante (implémentation BLOC 2B)

### 3. Optimisations

**Raison** : Phase 3A = verrous de sécurité, pas d'optimisation

**Ce qui n'a pas été fait** :
- Cache des validations
- Optimisation des calculs de similarité
- Compression des prompts

**Quand sera fait** : Phase d'optimisation (si nécessaire)

### 4. Refactor non demandé

**Raison** : Phase 3A = ajout de verrous, pas de refactor

**Ce qui n'a pas été fait** :
- Refactor de `buildConversationHistory()`
- Restructuration de `BlockOrchestrator`
- Extraction de constantes

**Quand sera fait** : Phase de refactor (si nécessaire)

---

## 📊 RÉSUMÉ DES LOGS IMPLÉMENTÉS

### Logs de validation

- `[ORCHESTRATOR] Question 2A.1 validation failed, retry: [erreur]`
- `[ORCHESTRATOR] Question 2A.1 validation failed after retry: [erreur]`
- `[ORCHESTRATOR] Question 2A.3 validation failed, retry: [erreur]`
- `[ORCHESTRATOR] Question 2A.3 validation failed after retry: [erreur]`

### Logs de retry

- `[ORCHESTRATOR] Validation succeeded after X retry(ies)`
- `[ORCHESTRATOR] Validation failed, retry X/Y: [erreur]`
- `[ORCHESTRATOR] Validation failed after X retry(ies): [erreur]`
- `[ORCHESTRATOR] Validation details: [détails]`

### Logs d'injection

- `[ORCHESTRATOR] BLOC 2A context injected: { medium, preferences, coreWork }`
- `[ORCHESTRATOR] BLOC 2A answers not found in AnswerMap. BLOC 2B cannot be personalized.`

**Note** : Les logs demandés `[2B_VALIDATION_FAIL]`, `[2B_RETRY_TRIGGERED]`, `[2B_CONTEXT_INJECTION]` seront ajoutés lors de l'implémentation BLOC 2B (actuellement, seuls les validateurs et l'injection sont prêts, mais pas encore utilisés).

---

## ✅ ÉTAT FINAL

### Ce qui est prêt

✅ Validateurs sémantiques (traits, motifs, synthèse)  
✅ Retry contrôlé (max 1, prompt renforcé)  
✅ Injection forcée BLOC 2A → contexte BLOC 2B  
✅ Validation questions BLOC 2A (2A.1, 2A.3)  
✅ Logs explicites (validation, retry, injection)  
✅ Helpers pour BLOC 2B (prêts à être utilisés)

### Ce qui n'est pas fait (volontairement)

❌ Génération complète BLOC 2B  
❌ Parsing questions délimitées  
❌ Logique UX  
❌ Optimisations  
❌ Refactor

---

## 🎯 PROCHAINES ÉTAPES

1. **Phase suivante** : Implémentation BLOC 2B
   - Utiliser `buildConversationHistoryForBlock2B()` pour le contexte
   - Utiliser `validateTraitsForBlock2B()`, `validateMotifsForBlock2B()`, `validateSynthesisForBlock2B()` pour valider
   - Utiliser `generateWithRetry()` pour le retry contrôlé

2. **Tests** : Valider que les verrous fonctionnent
   - Tester avec traits similaires → doit échouer validation
   - Tester avec motifs similaires → doit échouer validation
   - Tester avec synthèse incomplète → doit échouer validation

3. **Monitoring** : Surveiller les logs
   - Fréquence des validations échouées
   - Fréquence des retries
   - Fréquence des injections forcées

---

**FIN DU RAPPORT**
