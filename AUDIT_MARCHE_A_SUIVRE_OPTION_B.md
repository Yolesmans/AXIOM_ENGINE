# 🟧 MARCHE À SUIVRE — OPTION B (CHAT ORCHESTRÉ INTELLIGENT)
**Date** : 2025-01-27  
**Objectif** : Guide opérationnel pour exécuter proprement l'OPTION B sans casser l'existant

---

## ✅ PRINCIPE FONDAMENTAL

**L'OPTION B transforme AXIOM d'un moteur conversationnel question-par-question en un moteur orchestré par blocs logiques.**

**Changement clé** :
- **AVANT** : 1 appel OpenAI = 1 question → 1 réponse utilisateur → 1 appel OpenAI = 1 question suivante
- **APRÈS** : 1 appel OpenAI = toutes les questions d'un bloc → toutes les réponses utilisateur stockées → 1 appel OpenAI = mini-analyse du bloc

**Avantage** : Réduction drastique du nombre d'appels (de 60-100 à 12-15), coût maîtrisé, stabilité améliorée.

**Contrainte** : Perte de l'adaptation question par question (sous-questions conditionnelles), mais acceptable pour la stabilité.

---

## 1️⃣ SÉQUENCE IDÉALE D'EXÉCUTION

### 1.1 Séquence recommandée (13 appels)

**Principe** : Minimiser les appels tout en préservant la logique cognitive et la fusion cumulative.

**Séquence exacte** :

1. **Appel 1 — Préambule**
   - **Trigger** : Après réponse tone (tutoiement/vouvoiement)
   - **Prompt** : Version compressée (3-5k tokens) + règles préambule
   - **Output** : Préambule métier complet
   - **Stockage** : `appendAssistantMessage(..., kind: 'preambule')`

2. **Appel 2 — Questions BLOC 1**
   - **Trigger** : Event `START_BLOC_1` (bouton "Je commence mon profil")
   - **Prompt** : Version compressée + règles BLOC 1 + instruction explicite "Génère TOUTES les questions du BLOC 1 en une seule fois"
   - **Output** : 3-5 questions du BLOC 1 (format A/B/C pour choix, questions ouvertes)
   - **Stockage** : `appendAssistantMessage(..., kind: 'question', block: 1)`
   - **Frontend** : Affiche toutes les questions d'un coup (ou progressivement, mais stockées ensemble)

3. **Attente réponses utilisateur BLOC 1**
   - **Stockage** : Chaque réponse utilisateur → `appendUserMessage(..., block: 1)`
   - **Pas d'appel OpenAI** : Le moteur attend que toutes les réponses soient collectées

4. **Appel 3 — Mini-analyse BLOC 1 + Questions BLOC 2**
   - **Trigger** : Toutes les réponses BLOC 1 reçues (ou timeout après dernière réponse)
   - **Prompt** : Version compressée + règles miroir + règles BLOC 2 + instruction "Produis d'abord le miroir interprétatif du BLOC 1, puis génère TOUTES les questions du BLOC 2"
   - **Input** : Toutes les réponses utilisateur BLOC 1
   - **Output** : Miroir interprétatif BLOC 1 (format minimal : 20+25 mots) + Questions BLOC 2
   - **Stockage** : `appendAssistantMessage(miroir, kind: 'mirror', block: 1)` puis `appendAssistantMessage(questions, kind: 'question', block: 2)`

5. **Attente réponses utilisateur BLOC 2**
   - **Stockage** : Chaque réponse → `appendUserMessage(..., block: 2)`

6. **Appel 4 — Mini-analyse BLOC 2 + Questions BLOC 3**
   - **Trigger** : Toutes les réponses BLOC 2 reçues
   - **Prompt** : Version compressée + règles miroir + règles BLOC 3 + instruction "Produis d'abord le miroir interprétatif du BLOC 2 (fusionné avec BLOC 1), puis génère TOUTES les questions du BLOC 3"
   - **Input** : Réponses BLOC 2 + Mini-analyse BLOC 1 (depuis `conversationHistory`)
   - **Output** : Miroir interprétatif BLOC 2 (fusionné) + Questions BLOC 3
   - **Stockage** : `appendAssistantMessage(miroir, kind: 'mirror', block: 2)` puis `appendAssistantMessage(questions, kind: 'question', block: 3)`

7. **Appels 5-11** (BLOCS 3-9)
   - **Pattern identique** : Mini-analyse bloc N (fusionnée avec blocs précédents) + Questions bloc N+1
   - **Fusion cumulative** : Chaque mini-analyse fusionne avec toutes les mini-analyses précédentes (depuis `conversationHistory`)

8. **Appel 12 — Profil final (BLOC 10)**
   - **Trigger** : Toutes les réponses BLOC 9 reçues + Mini-analyse BLOC 9 générée
   - **Prompt** : Version compressée + règles BLOC 10 + instruction "Relis l'intégralité de la conversation et produis la synthèse finale"
   - **Input** : Toutes les réponses utilisateur (blocs 1-9) + Toutes les mini-analyses (blocs 1-9)
   - **Output** : Profil final complet (sections structurées)
   - **Stockage** : `appendAssistantMessage(..., kind: 'other', step: STEP_99_MATCH_READY)`

9. **Appel 13 — Matching**
   - **Trigger** : Profil final généré
   - **Prompt** : Prompt matching complet + instruction "Évalue la compatibilité avec le poste"
   - **Input** : Profil final + Toutes les réponses utilisateur
   - **Output** : Matching (🟢/🔵/🟠) + Explication structurée
   - **Stockage** : `appendAssistantMessage(..., kind: 'matching')`

**Total** : **13 appels** par candidat

### 1.2 Optimisations possibles

**Option A — Séquence standard (21 appels)** :
- Questions et mini-analyses séparées (2 appels par bloc)
- **Avantage** : Plus de contrôle, moins de confusion IA
- **Inconvénient** : Coût plus élevé (0,10€ à 0,15€)

**Option B — Séquence optimisée (13 appels)** ← **RECOMMANDÉE**
- Mini-analyse + Questions suivantes combinées
- **Avantage** : Coût optimal (0,08€ à 0,12€), logique cognitive préservée
- **Inconvénient** : Risque de confusion IA (maîtrisable avec prompt clair)

**Option C — Séquence ultra-optimisée (8-10 appels)** :
- Plusieurs blocs combinés (ex: BLOC 1-3, BLOC 4-6, BLOC 7-9)
- **Avantage** : Coût minimal
- **Inconvénient** : Perte de personnalisation, risque de dérive forte

**✅ RECOMMANDATION** : **Option B (13 appels)** — Meilleur compromis coût/qualité/stabilité.

### 1.3 Appels qui doivent rester séparés

**OBLIGATOIREMENT SÉPARÉS** :

1. **Préambule** (Appel 1)
   - Ne peut pas être combiné avec questions BLOC 1
   - Raison : Transition logique (préambule → bouton → BLOC 1)

2. **Profil final** (Appel 12)
   - Ne peut pas être combiné avec matching
   - Raison : Le matching nécessite le profil final complet

3. **Matching** (Appel 13)
   - Ne peut pas être combiné avec profil final
   - Raison : Phase décisionnelle indépendante

**PEUVENT ÊTRE COMBINÉS** :

- Mini-analyse BLOC N + Questions BLOC N+1
- Raison : Logique cognitive cohérente (analyse → questions adaptatives)

### 1.4 Gestion des blocs spéciaux (2A/2B)

**BLOC 2A — Collecte** :
- **Appel séparé** : Questions BLOC 2A (3 questions : médium, préférences, œuvre noyau)
- **Pas de mini-analyse** : BLOC 2A ne produit aucun miroir
- **Stockage** : Réponses utilisateur → `appendUserMessage(..., block: 2)`

**BLOC 2B — Analyse projective** :
- **Appel séparé** : Questions BLOC 2B (motifs + personnages + traits, par œuvre)
- **Mini-analyse finale** : Synthèse BLOC 2B (4-6 lignes, personnalisée)
- **Stockage** : Mini-analyse → `appendAssistantMessage(..., kind: 'mirror', block: 2)`

**Séquence BLOC 2** :
- **Appel 2A** : Questions collecte (3 questions)
- **Attente réponses** : Stockage réponses
- **Appel 2B** : Questions analyse (motifs + personnages + traits) + Mini-analyse finale
- **Total BLOC 2** : 2 appels (au lieu de 1 pour les autres blocs)

**Impact sur séquence totale** : **14 appels** (au lieu de 13) si BLOC 2 traité séparément.

---

## 2️⃣ GESTION DU PROMPT (POINT CRITIQUE)

### 2.1 Quand injecter le prompt complet ?

**RÈGLE ABSOLUE** : **JAMAIS** dans l'OPTION B.

**Raison** : Le prompt complet (≈20k tokens) est trop volumineux et coûteux pour être injecté à chaque appel.

**Exception** : **Appel 1 (Préambule)** peut utiliser une version légèrement compressée (5k tokens) pour garantir la qualité du préambule.

### 2.2 Quand injecter une version compressée ?

**RÈGLE** : **À CHAQUE APPEL**, injecter une version compressée (3-5k tokens).

**Contenu de la version compressée** :

1. **Règles absolues** (500 tokens) :
   - Rôle AXIOM (mentor professionnel)
   - Zones interdites
   - Ton et style

2. **Règles de format** (500 tokens) :
   - Format miroir (20+25 mots)
   - Format questions à choix (A/B/C/D/E)
   - Validation ouverte

3. **Règles de bloc** (1-2k tokens) :
   - Règles spécifiques au bloc courant
   - Objectif du bloc
   - Questions typiques (exemples)

4. **Règles fusion cumulative** (500 tokens) :
   - Fusion avec blocs précédents
   - Mise à jour `profil_axiom`
   - Interdiction synthèse globale avant BLOC 10

5. **Règles de transition** (500 tokens) :
   - Verrous de transition
   - Annonce fin de bloc
   - Annonce bloc suivant

**Total** : **3-5k tokens** (au lieu de 20k)

### 2.3 Que doit absolument être rappelé à chaque appel ?

**OBLIGATOIRE** :

1. **Format miroir** :
   - "Format minimal : Lecture implicite (20 mots max) + Déduction personnalisée (25 mots max) + Validation ouverte"

2. **Format questions à choix** :
   - "Questions à choix : Format A. / B. / C. / D. / E. sur lignes séparées"

3. **Fusion cumulative** :
   - "Fusionne cette analyse avec les analyses des blocs précédents (disponibles dans l'historique)"

4. **Interdiction synthèse globale** :
   - "Aucune synthèse globale avant le BLOC 10"

5. **Règles spécifiques au bloc** :
   - Objectif du bloc
   - Questions typiques (exemples)

**OPTIONNEL** (peut rester uniquement dans l'historique) :

- Détails du préambule (déjà affiché)
- Règles des blocs précédents (déjà appliquées)
- Exemples de questions des blocs précédents

### 2.4 Structure du prompt injecté

**Pour chaque appel (sauf préambule et matching)** :

```
messages = [
  {
    role: 'system',
    content: PROMPT_COMPRESSÉ (3-5k tokens)
      - Règles absolues
      - Règles de format
      - Règles du bloc courant
      - Règles fusion cumulative
  },
  {
    role: 'system',
    content: INSTRUCTION_EXPLICITE
      - "Tu es en état BLOC_N"
      - "Produis d'abord le miroir interprétatif du BLOC_N (fusionné avec blocs précédents)"
      - "Puis génère TOUTES les questions du BLOC_N+1"
      - "Format strict : miroir (20+25 mots) + questions (A/B/C pour choix)"
  },
  ...conversationHistory (historique complet)
]
```

**Pour l'appel préambule** :

```
messages = [
  {
    role: 'system',
    content: PROMPT_COMPRESSÉ_PRÉAMBULE (5k tokens)
      - Règles absolues
      - Règles préambule (texte complet)
  },
  {
    role: 'system',
    content: "Affiche LE PRÉAMBULE MÉTIER COMPLET"
  },
  ...conversationHistory (préambule + tone)
]
```

**Pour l'appel matching** :

```
messages = [
  {
    role: 'system',
    content: PROMPT_MATCHING_COMPLET (3k tokens)
      - Règles matching
      - Référentiels internes
      - Structure de sortie
  },
  {
    role: 'system',
    content: "Évalue la compatibilité avec le poste"
  },
  ...conversationHistory (profil final inclus)
]
```

### 2.5 Création de la version compressée

**Méthode recommandée** :

1. **Extraire les règles essentielles** du prompt complet
2. **Conserver les exemples critiques** (format miroir, format questions)
3. **Supprimer les détails redondants** (exemples multiples, répétitions)
4. **Structurer par sections** (absolues, format, bloc, fusion, transition)

**Validation** : La version compressée doit permettre à l'IA de :
- Respecter le format miroir (20+25 mots)
- Respecter le format questions (A/B/C/D/E)
- Fusionner avec blocs précédents
- Générer des questions adaptatives

**⚠️ RISQUE** : Si la version compressée est trop réduite, l'IA peut oublier des règles critiques.

**✅ GARDE-FOU** : Validation format côté moteur (si format non respecté → régénération).

---

## 3️⃣ BLOCS SENSIBLES (2A/2B)

### 3.1 Exécution BLOC 2A sans rebond phrase par phrase

**Problème** : Le BLOC 2A nécessite 3 questions séquentielles (médium → préférences → œuvre noyau), mais l'OPTION B génère toutes les questions en une fois.

**Solution** : **Générer les 3 questions en une fois, mais les afficher progressivement côté frontend**.

**Séquence** :

1. **Appel OpenAI** : Génère les 3 questions du BLOC 2A en une fois
   - Question 1 : Choix médium (A. Série / B. Film)
   - Question 2 : Préférences (adaptée selon médium choisi)
   - Question 3 : Œuvre noyau

2. **Stockage** : `appendAssistantMessage(questions_2A, kind: 'question', block: 2)`

3. **Frontend** : Affiche Question 1 → Attend réponse → Affiche Question 2 (adaptée) → Attend réponse → Affiche Question 3

4. **Stockage réponses** : Chaque réponse → `appendUserMessage(..., block: 2)`

**⚠️ COMPLEXITÉ** : La Question 2 doit être adaptée selon la réponse Question 1 (Série vs Film).

**Solution technique** : L'IA génère les 2 versions de la Question 2 (Série et Film), le moteur sélectionne la bonne version selon la réponse Question 1.

**Alternative** : Générer Question 1 → Attendre réponse → Générer Question 2 (adaptée) → Attendre réponse → Générer Question 3.

**Impact** : **3 appels** pour BLOC 2A (au lieu de 1), mais garantit l'adaptation.

**✅ RECOMMANDATION** : **Alternative (3 appels)** — Garantit l'adaptation et préserve la valeur analytique.

### 3.2 Exécution BLOC 2B sans rebond phrase par phrase

**Problème** : Le BLOC 2B nécessite des questions personnalisées par œuvre (motifs, personnages, traits), mais l'OPTION B génère toutes les questions en une fois.

**Solution** : **Générer toutes les questions BLOC 2B en une fois, structurées par œuvre**.

**Séquence** :

1. **Appel OpenAI** : Génère toutes les questions BLOC 2B en une fois
   - Pour chaque œuvre (#3, #2, #1) :
     - Question motif (5 propositions A/B/C/D/E)
     - Question personnages (1-3 personnages)
     - Question traits (5 propositions A/B/C/D/E par personnage)
   - Synthèse finale (4-6 lignes)

2. **Stockage** : `appendAssistantMessage(questions_2B, kind: 'question', block: 2)`

3. **Frontend** : Affiche questions progressivement (œuvre par œuvre)

4. **Stockage réponses** : Chaque réponse → `appendUserMessage(..., block: 2)`

5. **Appel final** : Mini-analyse BLOC 2B (synthèse personnalisée)

**⚠️ COMPLEXITÉ** : Les questions doivent être personnalisées à chaque œuvre (pas de liste générique).

**Solution technique** : L'IA génère des questions spécifiques à chaque œuvre (motifs, personnages, traits), basées sur les réponses BLOC 2A (noms des œuvres).

**✅ RECOMMANDATION** : **Génération en une fois** — Acceptable car les œuvres sont connues (réponses BLOC 2A), l'IA peut personnaliser.

### 3.3 Garantir l'extraction des traits de personnages

**Règle critique** : Chaque personnage doit avoir des traits spécifiques (pas de liste générique).

**Garde-fou** : Dans le prompt BLOC 2B, instruction explicite :
- "Pour chaque personnage, génère 5 traits SPÉCIFIQUES à ce personnage, couvrant plusieurs dimensions (émotionnelle, stratégique, relationnelle, morale, comportementale)"
- "Ces traits ne doivent PAS être recyclables pour un autre personnage"

**Validation côté moteur** : Si les traits générés sont trop génériques (détection par mots-clés), régénération.

### 3.4 Garantir la projection du candidat

**Règle critique** : La synthèse BLOC 2B doit croiser motifs + personnages + traits pour faire ressortir des constantes.

**Garde-fou** : Dans le prompt BLOC 2B, instruction explicite :
- "Synthèse finale : Croise motifs + personnages + traits, fais ressortir des constantes claires (rapport au pouvoir, pression, relations, responsabilité)"

**Validation côté moteur** : Si la synthèse est trop générique ou ne croise pas les éléments, régénération.

### 3.5 Préserver la valeur analytique

**Risque** : Perte de personnalisation si questions générées en masse.

**Garde-fou** : 
- Prompt BLOC 2B avec exemples de personnalisation (motifs spécifiques à une œuvre, traits spécifiques à un personnage)
- Validation côté moteur (détection personnalisation)

**✅ CONCLUSION** : Le BLOC 2B peut être exécuté en OPTION B avec garde-fous, mais nécessite un prompt très précis et une validation côté moteur.

---

## 4️⃣ MINI-ANALYSES ET ANALYSE CUMULATIVE

### 4.1 Structurer les mini-analyses par bloc

**Format obligatoire** (depuis le prompt) :

1. **Lecture implicite** (20 mots max) :
   - Ce que la réponse révèle du fonctionnement réel
   - Pas de reformulation, pas de liste de faits

2. **Déduction personnalisée** (25 mots max) :
   - Manière probable d'agir en situation réelle
   - Comportement en équipe ou sous responsabilité
   - Ce que le candidat cherche sans le formuler

3. **Validation ouverte** (phrase fixe) :
   - "Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

**Garde-fou** : Validation format côté moteur (si > 20+25 mots, régénération ou troncature).

### 4.2 Garantir la fusion cumulative

**Règle critique** : Chaque mini-analyse doit fusionner avec les mini-analyses précédentes.

**Méthode** : Dans le prompt de mini-analyse, instruction explicite :
- "Fusionne cette analyse avec les analyses des blocs précédents (disponibles dans l'historique)"
- "Montre une compréhension qui progresse visiblement"

**Input** : Mini-analyses précédentes (depuis `conversationHistory`, filtrées par `kind: 'mirror'`)

**Output** : Mini-analyse fusionnée (format minimal : 20+25 mots, mais contenu enrichi)

**Garde-fou** : Validation côté moteur (si la mini-analyse ne mentionne pas les blocs précédents, régénération).

### 4.3 Préparer proprement le BLOC 10 (profil final)

**Règle critique** : Le BLOC 10 doit relire l'intégralité de la conversation et produire une synthèse globale.

**Méthode** : Dans le prompt BLOC 10, instruction explicite :
- "Relis l'intégralité de la conversation depuis le début"
- "Produis une synthèse globale structurée selon les sections obligatoires"

**Input** : Toutes les réponses utilisateur (blocs 1-9) + Toutes les mini-analyses (blocs 1-9)

**Sections obligatoires** (depuis le prompt) :
- 🔥 Ce qui te met vraiment en mouvement
- 🧱 Comment tu tiens dans le temps
- ⚖️ Tes valeurs quand il faut agir
- 🧩 Ce que révèlent tes projections
- 🛠️ Tes vraies forces… et tes vraies limites
- 🎯 Ton positionnement professionnel naturel
- 🧠 Lecture globale — synthèse émotionnelle courte (3-4 phrases)

**Garde-fou** : Validation structure côté moteur (si sections manquantes, régénération).

### 4.4 Éviter la confusion

**Risque** : Si mini-analyse + questions suivantes sont combinées, l'IA peut mélanger les deux tâches.

**Garde-fou** : Dans le prompt, instruction explicite :
- "Produis d'abord le miroir interprétatif du BLOC_N (fusionné avec blocs précédents)"
- "Puis, sur une nouvelle ligne, génère TOUTES les questions du BLOC_N+1"
- "Sépare clairement les deux parties"

**Validation côté moteur** : Détection de séparation (si pas de séparation claire, régénération).

---

## 5️⃣ FIDÉLITÉ CHATGPT — VÉRITÉ TERRAIN

### 5.1 Ce qui peut être équivalent à ChatGPT

**✅ ÉQUIVALENT** :

1. **Continuité conversationnelle** :
   - L'historique complet est injecté à chaque appel
   - L'IA peut "relire" les échanges précédents
   - La conversation est fluide et cohérente

2. **Personnalisation** :
   - Les questions sont adaptées selon les réponses précédentes
   - Les mini-analyses sont personnalisées
   - Le profil final est unique à chaque candidat

3. **Ton et style** :
   - Le ton AXIOM (chaleureux mais pro) est préservé
   - Le style conversationnel est maintenu

4. **Cohérence narrative** :
   - Les mini-analyses s'enchaînent logiquement
   - Le profil final synthétise l'ensemble

### 5.2 Ce qui sera légèrement différent

**⚠️ LÉGÈREMENT DIFFÉRENT** :

1. **Adaptation question par question** :
   - **ChatGPT** : Peut poser une sous-question conditionnelle immédiatement après une réponse
   - **OPTION B** : Toutes les questions d'un bloc sont générées en une fois, pas de sous-questions conditionnelles
   - **Impact** : Perte de personnalisation fine, mais acceptable pour la stabilité

2. **Rebond conversationnel** :
   - **ChatGPT** : Peut rebondir sur une réponse inattendue
   - **OPTION B** : Les questions sont prédéterminées (générées en une fois)
   - **Impact** : Moins de flexibilité, mais plus de contrôle

3. **Temps de réponse** :
   - **ChatGPT** : Réponse immédiate après chaque message
   - **OPTION B** : Attente de toutes les réponses d'un bloc avant génération
   - **Impact** : Expérience utilisateur légèrement différente (mais acceptable)

### 5.3 Ce qui est impossible à reproduire via API

**❌ IMPOSSIBLE** :

1. **Mémoire persistante côté serveur** :
   - **ChatGPT** : Le contexte est maintenu côté serveur OpenAI
   - **API OpenAI** : Stateless, chaque appel est indépendant
   - **Impact** : Nécessité d'injecter l'historique à chaque appel (coût, latence)

2. **Apprentissage progressif** :
   - **ChatGPT** : Peut "apprendre" des préférences utilisateur au fil de la conversation
   - **API OpenAI** : Pas d'apprentissage entre appels
   - **Impact** : Pas d'impact majeur pour AXIOM (conversation unique, pas de réutilisation)

3. **Adaptation en temps réel** :
   - **ChatGPT** : Peut adapter sa stratégie conversationnelle en temps réel
   - **API OpenAI** : Adaptation limitée par le prompt injecté
   - **Impact** : Moins de flexibilité, mais plus de contrôle (acceptable pour AXIOM)

### 5.4 Alignement réaliste

**Objectif** : Obtenir un comportement **équivalent à 85-90%** de ChatGPT, pas 100%.

**Justification** :
- **85-90%** : Continuité, personnalisation, ton, cohérence narrative
- **10-15%** : Adaptation question par question, rebond conversationnel (perte acceptable)

**✅ CONCLUSION** : L'OPTION B permet d'atteindre un alignement réaliste avec ChatGPT (85-90%), sans promesse marketing irréaliste.

---

## 6️⃣ RISQUES ET GARDE-FOUS

### 6.1 Vrais risques de dérive

**RISQUE 1 — Oubli du format** :
- **Symptôme** : Questions générées sans format A/B/C/D/E, miroir > 20+25 mots
- **Probabilité** : **MOYENNE** (si prompt compressé trop réduit)
- **Garde-fou** : Validation format côté moteur (regex, parsing) → Régénération si non conforme

**RISQUE 2 — Perte de fusion cumulative** :
- **Symptôme** : Mini-analyses isolées, pas de mention des blocs précédents
- **Probabilité** : **FAIBLE** (si prompt rappelle explicitement)
- **Garde-fou** : Validation contenu (détection mots-clés "bloc précédent", "fusion") → Régénération si absent

**RISQUE 3 — Questions génériques** :
- **Symptôme** : Questions BLOC 2B non personnalisées, traits génériques
- **Probabilité** : **MOYENNE** (si prompt BLOC 2B insuffisant)
- **Garde-fou** : Validation personnalisation (détection noms d'œuvres, personnages) → Régénération si générique

**RISQUE 4 — Confusion mini-analyse + questions** :
- **Symptôme** : Mini-analyse et questions mélangées, pas de séparation claire
- **Probabilité** : **FAIBLE** (si instruction explicite)
- **Garde-fou** : Validation structure (détection séparation) → Régénération si mélangé

### 6.2 Vrais risques de crash

**RISQUE 1 — Timeout serveur** :
- **Symptôme** : Appel OpenAI > timeout serveur (ex: 15 secondes)
- **Probabilité** : **MOYENNE** (sur appels volumineux : profil final, matching)
- **Garde-fou** : Timeout serveur ≥ 30 secondes, retry automatique (1 fois)

**RISQUE 2 — Rate limit OpenAI** :
- **Symptôme** : Trop d'appels simultanés → erreur 429
- **Probabilité** : **FAIBLE** (si plan OpenAI adapté, 13 appels par candidat répartis)
- **Garde-fou** : Queue d'appels, retry avec backoff exponentiel

**RISQUE 3 — Historique trop volumineux** :
- **Symptôme** : Historique > limite tokens OpenAI (ex: 128k)
- **Probabilité** : **FAIBLE** (historique typique : 30-50k tokens)
- **Garde-fou** : Troncature historique (garder N derniers messages, ex: 40 messages)

### 6.3 Garde-fous légers suffisants

**GARDE-FOU 1 — Validation format questions** :
- **Méthode** : Regex détection format "A. / B. / C. / D. / E."
- **Action** : Si non conforme → Régénération (1 fois max)
- **Complexité** : **FAIBLE** (regex simple)

**GARDE-FOU 2 — Validation format miroir** :
- **Méthode** : Comptage mots (lecture implicite ≤ 20 mots, déduction ≤ 25 mots)
- **Action** : Si non conforme → Troncature ou régénération
- **Complexité** : **FAIBLE** (comptage mots)

**GARDE-FOU 3 — Validation fusion cumulative** :
- **Méthode** : Détection mots-clés ("bloc précédent", "fusion", "analyse précédente")
- **Action** : Si absent → Régénération avec prompt renforcé
- **Complexité** : **MOYENNE** (détection sémantique)

**GARDE-FOU 4 — Validation structure BLOC 10** :
- **Méthode** : Détection sections obligatoires (🔥, 🧱, ⚖️, 🧩, 🛠️, 🎯, 🧠)
- **Action** : Si sections manquantes → Régénération
- **Complexité** : **FAIBLE** (détection emojis/sections)

**GARDE-FOU 5 — Troncature historique** :
- **Méthode** : Garder N derniers messages (ex: 40 messages)
- **Action** : Si historique > limite → Troncature (garder les plus récents)
- **Complexité** : **FAIBLE** (slice array)

**✅ CONCLUSION** : Les garde-fous légers suffisent (validation format, structure, troncature). Pas besoin d'orchestrateur complexe.

---

## 7️⃣ IMPLÉMENTATION THÉORIQUE (SANS CODE)

### 7.1 Modifications nécessaires dans `executeAxiom()`

**AVANT** (question par question) :
```
Si userMessage existe :
  → Appeler OpenAI avec userMessage
  → Générer 1 question
  → Stocker réponse assistant
```

**APRÈS** (orchestration par blocs) :
```
Si event === 'START_BLOC_1' :
  → Appeler OpenAI (générer TOUTES les questions BLOC 1)
  → Stocker questions assistant
  → Attendre réponses utilisateur

Si toutes les réponses BLOC N reçues :
  → Appeler OpenAI (mini-analyse BLOC N + questions BLOC N+1)
  → Stocker mini-analyse + questions assistant
  → Attendre réponses utilisateur BLOC N+1
```

**Modifications** :
1. **Détection "toutes les réponses reçues"** : Compter réponses utilisateur par bloc (depuis `conversationHistory`)
2. **Génération questions en masse** : Instruction explicite "Génère TOUTES les questions du bloc"
3. **Combinaison mini-analyse + questions** : Instruction explicite "Produis d'abord miroir, puis questions"

### 7.2 Modifications nécessaires dans `buildConversationHistory()`

**AVANT** : Construit historique depuis `conversationHistory` (inchangé)

**APRÈS** : Inchangé (fonctionne déjà correctement)

**Aucune modification nécessaire** : `buildConversationHistory()` est déjà compatible avec l'OPTION B.

### 7.3 Modifications nécessaires dans le frontend

**AVANT** : Affiche 1 question → Attend réponse → Affiche question suivante

**APRÈS** : Affiche toutes les questions d'un bloc (ou progressivement, mais stockées ensemble)

**Modifications** :
1. **Affichage questions en masse** : Recevoir toutes les questions d'un bloc, les afficher progressivement
2. **Gestion réponses multiples** : Envoyer chaque réponse séparément, mais attendre toutes avant déclenchement mini-analyse

### 7.4 Création de la version compressée du prompt

**Méthode** :
1. **Extraire règles essentielles** du prompt complet
2. **Structurer par sections** (absolues, format, bloc, fusion, transition)
3. **Conserver exemples critiques** (format miroir, format questions)
4. **Supprimer redondances** (exemples multiples, répétitions)

**Fichier** : `src/engine/prompts.ts` → Fonction `getCompressedAxiomPrompt(blockNumber: number): string`

**Validation** : La version compressée doit permettre à l'IA de respecter toutes les règles critiques.

---

## 8️⃣ CONCLUSION — MARCHE À SUIVRE

### 8.1 Résumé exécutif

**OPTION B est viable** avec :
- ✅ **13 appels** par candidat (séquence optimisée)
- ✅ **Coût** : 0,08€ à 0,12€ par candidat
- ✅ **Respect prompt** : 85-90% (ajustable à 95% avec garde-fous)
- ✅ **Stabilité** : BONNE (risque faible, maîtrisable)
- ✅ **Fidélité ChatGPT** : 85-90% (alignement réaliste)

### 8.2 Étapes d'implémentation (ordre recommandé)

1. **Créer version compressée du prompt** (3-5k tokens)
2. **Modifier `executeAxiom()`** pour orchestration par blocs
3. **Ajouter garde-fous** (validation format, structure, troncature)
4. **Adapter frontend** pour affichage questions en masse
5. **Tester séquence complète** (13 appels, validation format, fusion cumulative)

### 8.3 Points d'attention critiques

1. **BLOC 2A/2B** : Nécessite traitement spécial (3 appels au lieu de 1)
2. **Fusion cumulative** : Doit être explicitement rappelée dans chaque prompt mini-analyse
3. **Format strict** : Validation format obligatoire (miroir 20+25 mots, questions A/B/C/D/E)
4. **Historique volumineux** : Troncature si > 40 messages

### 8.4 Verdict final

**✅ GO** — L'OPTION B est **exécutable proprement** avec les modifications théoriques décrites ci-dessus.

**Résultat attendu** :
- Coût maîtrisé (0,08€ à 0,12€)
- Stabilité bonne
- Respect prompt 85-90% (ajustable à 95%)
- Fidélité ChatGPT 85-90% (alignement réaliste)

**FIN DE LA MARCHE À SUIVRE**
