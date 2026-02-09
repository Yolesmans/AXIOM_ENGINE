# 🔍 AUDIT TECHNIQUE — RENDU "MENTOR INCARNÉ" REVELIOM

**Date** : 2025-01-27  
**Objectif** : Identifier où se joue le problème de rendu "descriptif/déclaratif" et proposer des solutions techniques pour forcer un rendu "mentor incarné"  
**Contrainte absolue** : Aucune modification du fond analytique, uniquement la forme linguistique

---

## 1️⃣ DIAGNOSTIC — OÙ SE JOUE LE PROBLÈME

### 1.1 Pipeline actuel de génération

#### **Étape 1 : Génération LLM (prompts métier)**
**Fichiers** :
- `src/services/blockOrchestrator.ts` (BLOC 1, BLOC 2B)
- `src/engine/axiomExecutor.ts` (BLOCS 3-9, synthèse BLOC 10, matching)

**Prompts utilisés** :
- `FULL_AXIOM_PROMPT` (prompt principal REVELIOM)
- Prompts spécifiques de génération (format strict, sections, longueurs)

**Contenu des prompts** :
- ✅ Règles analytiques : "parler de ce que ça DIT, pas de ce qu'elle a dit"
- ✅ Règles de profondeur : "lecture en creux", "position interprétative"
- ✅ Règles de format : "20 mots", "25 mots", "3 sections"
- ❌ **ABSENCE** : Règles linguistiques explicites sur la forme ("quand tu...", "dès que...")

**Observation** : Les prompts imposent **QUOI dire** (fond analytique) mais pas **COMMENT le dire** (forme linguistique).

#### **Étape 2 : Validation format (validateMirrorREVELIOM)**
**Fichier** : `src/services/validateMirrorReveliom.ts`

**Vérifications actuelles** :
- Présence sections 1️⃣ 2️⃣ 3️⃣
- Longueur section 1 (≤ 20 mots)
- Longueur section 2 (≤ 25 mots)
- Présence lecture en creux (pattern "probablement pas... mais plutôt")
- Ton 2e personne (détection "tu/toi" vs "il/elle")
- Interdictions (synthèse, conclusion, global, métier)

**Observation** : La validation vérifie le **contenu** (profondeur, ton) mais pas la **forme linguistique** (marqueurs expérientiels, temporalité).

#### **Étape 3 : Validation profondeur interprétative (validateInterpretiveDepth)**
**Fichier** : `src/services/validateInterpretiveDepth.ts` (nouveau)

**Vérifications actuelles** :
- Absence reformulation/paraphrase
- Présence inférence (ce que ça révèle)
- Présence exclusion (lecture en creux)
- Position interprétative claire

**Observation** : Vérifie le **fond** (inférence vs description) mais pas la **forme** (expérientiel vs déclaratif).

#### **Étape 4 : Reformulation stylistique (adaptToMentorStyle)**
**Fichier** : `src/services/mirrorNarrativeAdapter.ts`

**Fonctionnement actuel** :
- Appel OpenAI avec prompt de reformulation
- Règles de transformation : "tu es..." → "quand tu...", "tu as tendance à..." → "parfois tu..."
- Fail-soft : retourne texte original si échec

**Problème identifié** :
1. **Prompt de reformulation trop générique** : règles listées mais pas de contraintes strictes sur la structure
2. **Pas de validation post-reformulation** : on ne vérifie pas si la reformulation a réellement transformé le style
3. **Pas de retry si reformulation insuffisante** : si le LLM reformule mal, on sert quand même le texte
4. **Ordre des contraintes** : le prompt demande de "reformuler" mais ne force pas explicitement les marqueurs expérientiels

**Observation** : La couche de reformulation existe mais **ne garantit pas** le résultat attendu.

### 1.2 Point de blocage identifié

**Le problème se joue à 2 niveaux** :

#### **Niveau 1 : Génération initiale (LLM primaire)**
- Le LLM génère avec un biais naturel vers le langage RH/diagnostic
- Les prompts métier n'imposent pas explicitement la forme linguistique expérientielle
- Résultat : phrases déclaratives ("votre moteur est...", "vous recherchez...")

#### **Niveau 2 : Reformulation (adaptToMentorStyle)**
- Le prompt de reformulation est trop permissif
- Pas de validation que la reformulation a réellement transformé le style
- Pas de retry si la reformulation est insuffisante
- Résultat : parfois la reformulation ne change pas assez le style

### 1.3 Pourquoi le problème persiste

**Hypothèse principale** :
Le LLM (GPT-4o) a un biais fort vers le langage analytique/diagnostic dès qu'on lui demande d'**analyser** quelque chose. Même avec des règles de reformulation, il peut :
- Reformuler partiellement (quelques phrases, pas toutes)
- Garder des structures déclaratives ("tu es..." → "quand tu es..." au lieu de "quand tu...")
- Utiliser des concepts nommés ("ton moteur", "ta recherche") au lieu de dynamiques vécues

**Preuve** : La fonction `adaptToMentorStyle` existe et est appliquée, mais le problème persiste → la reformulation n'est pas assez contraignante.

---

## 2️⃣ PROPOSITIONS TECHNIQUES

### **APPROCHE 1 : Renforcement du prompt de reformulation (RECOMMANDÉE)**

#### **Principe**
Améliorer le prompt de `adaptToMentorStyle` pour le rendre plus contraignant et ajouter une validation post-reformulation avec retry.

#### **Où s'insère**
- **Avant** : Validation format (validateMirrorREVELIOM)
- **Après** : Validation profondeur (validateInterpretiveDepth)
- **Avant** : Affichage frontend

#### **Modifications nécessaires**

**1. Prompt de reformulation renforcé** (`src/services/mirrorNarrativeAdapter.ts`) :
```
RÈGLES DE TRANSFORMATION STRICTES (NON NÉGOCIABLES) :

1. INTERDICTIONS ABSOLUES (à éliminer systématiquement) :
   - "tu es..." → remplacer par "quand tu..." ou "il y a des moments où tu..."
   - "tu cherches..." → remplacer par "il y a des moments où tu..."
   - "tu as tendance à..." → remplacer par "parfois tu..." ou "dès que tu..."
   - "votre moteur est..." → remplacer par "quand tu..., tu te sens..."
   - "vous recherchez..." → remplacer par "il y a des moments où tu..."
   - Langage diagnostic ou RH → remplacer par langage vécu

2. OBLIGATIONS STRICTES (à appliquer systématiquement) :
   - TOUTES les phrases d'analyse DOIVENT commencer par un marqueur expérientiel :
     * "Quand tu..."
     * "Dès que tu..."
     * "Il y a des moments où tu..."
     * "Parfois tu..."
     * "Tant que tu..."
     * "À force de..."
   - INTERDICTION ABSOLUE de commencer par "tu es", "vous êtes", "votre", "ton", "ta"
   - Décrire une dynamique vécue, pas un trait de personnalité
   - Utiliser "tu sens", "tu te sens", "on sent que", "tu ressens"

3. TEMPORALITÉ OBLIGATOIRE :
   - Chaque phrase d'analyse DOIT contenir au moins UN marqueur temporel
   - Exemples : "parfois", "dès que", "quand", "tant que", "à force de", "il y a des moments où"

4. VALIDATION INTERNE :
   - Si le texte reformulé contient encore "tu es..." ou "votre..." en début de phrase d'analyse → REJETER et reformuler à nouveau
   - Si le texte reformulé ne contient pas au moins un marqueur expérientiel par phrase d'analyse → REJETER et reformuler à nouveau
```

**2. Validation post-reformulation** (nouvelle fonction) :
```typescript
function validateMentorStyle(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Détecter phrases déclaratives interdites
  const declarativePatterns = [
    /^(tu es|vous êtes|votre|ton|ta).*$/m,
    /^(ton moteur|votre moteur|ta recherche|votre recherche)/i,
  ];
  
  // Détecter marqueurs expérientiels obligatoires
  const experientialMarkers = [
    /quand tu/i,
    /dès que tu/i,
    /il y a des moments où tu/i,
    /parfois tu/i,
    /tant que tu/i,
    /à force de/i,
  ];
  
  // Vérifier chaque phrase d'analyse (sections 1️⃣ et 2️⃣)
  const sections = content.match(/[1️⃣2️⃣][^\n]*\n([^3️⃣]*)/g);
  if (sections) {
    sections.forEach((section, index) => {
      const hasDeclarative = declarativePatterns.some(p => p.test(section));
      const hasExperiential = experientialMarkers.some(p => p.test(section));
      
      if (hasDeclarative) {
        errors.push(`Section ${index + 1} contient encore des phrases déclaratives`);
      }
      if (!hasExperiential) {
        errors.push(`Section ${index + 1} ne contient pas de marqueur expérientiel`);
      }
    });
  }
  
  return { valid: errors.length === 0, errors };
}
```

**3. Retry avec prompt renforcé** :
- Si validation échoue → retry avec prompt encore plus strict
- Maximum 2 retries
- Si échec après retries → log d'erreur + servir texte original (fail-soft)

#### **Avantages**
- ✅ Réversible (fonction isolée, désactivable)
- ✅ Fail-soft (texte original si échec)
- ✅ Pas d'impact sur prompts métier
- ✅ Amélioration progressive (retry)

#### **Inconvénients**
- ⚠️ Coût API : +1 appel OpenAI par texte (reformulation)
- ⚠️ Latence : +200-500ms par texte
- ⚠️ Risque : si retry échoue, texte original servi (peut être déclaratif)

#### **Impact**
- **Coût** : +1 appel OpenAI par miroir/synthèse/matching (≈ $0.01-0.02 par texte)
- **Latence** : +200-500ms par texte
- **Parsing** : Aucun impact (validation après reformulation)
- **Validation existante** : Aucun impact (validation avant reformulation)
- **Front** : Aucun impact (texte reformulé servi comme avant)

---

### **APPROCHE 2 : Contraintes linguistiques dans prompts de génération**

#### **Principe**
Ajouter des contraintes linguistiques explicites dans les prompts de génération (BLOC 1, 2B, 3-9, synthèse, matching) pour que le LLM génère directement en style expérientiel.

#### **Où s'insère**
- **Dans** : Prompts de génération (blockOrchestrator.ts, axiomExecutor.ts)
- **Avant** : Appel OpenAI
- **Après** : Validation format

#### **Modifications nécessaires**

**Ajout dans prompts de génération** :
```
⚠️ RÈGLE LINGUISTIQUE STRICTE (NON NÉGOCIABLE)

TOUTES les phrases d'analyse (sections 1️⃣ et 2️⃣) DOIVENT :
- Commencer par un marqueur expérientiel : "Quand tu...", "Dès que tu...", "Il y a des moments où tu...", "Parfois tu..."
- Décrire une dynamique vécue, pas un trait de personnalité
- Utiliser "tu sens", "tu te sens", "on sent que", "tu ressens"

INTERDICTIONS ABSOLUES :
- Commencer par "tu es", "vous êtes", "votre", "ton", "ta"
- Utiliser des concepts nommés ("ton moteur", "votre recherche")
- Langage diagnostic ou RH

EXEMPLE DE FORME ATTENDUE :
❌ "Votre moteur semble être l'autonomie dans le progrès."
✅ "Quand tu avances à ton rythme et que tu sens que tu progresses par toi-même, tu te mets naturellement en mouvement."
```

#### **Avantages**
- ✅ Pas de coût API supplémentaire (génération directe)
- ✅ Pas de latence supplémentaire
- ✅ Génération directe en style expérientiel

#### **Inconvénients**
- ⚠️ Modification des prompts métier (contrainte demandée : pas de modification prompts)
- ⚠️ Risque de conflit avec règles analytiques existantes
- ⚠️ Validation nécessaire pour vérifier que le LLM respecte les contraintes

#### **Impact**
- **Coût** : Aucun impact
- **Latence** : Aucun impact
- **Parsing** : Aucun impact
- **Validation existante** : Nécessite ajout validation style linguistique
- **Front** : Aucun impact

---

### **APPROCHE 3 : Pipeline en 2 étapes (génération + reformulation forcée)**

#### **Principe**
Générer le texte analytique normalement, puis forcer une reformulation avec validation stricte et retry jusqu'à obtention du style expérientiel.

#### **Où s'insère**
- **Après** : Génération LLM
- **Avant** : Validation format
- **Avant** : Affichage frontend

#### **Modifications nécessaires**

**Pipeline** :
1. Génération LLM (prompts métier inchangés)
2. Validation format (validateMirrorREVELIOM)
3. **Reformulation forcée** (adaptToMentorStyle avec validation stricte)
4. **Validation style** (nouvelle fonction validateMentorStyle)
5. **Retry reformulation** si validation échoue (max 2 retries)
6. **Fail-soft** : servir texte original si retry échoue

**Fonction reformulation renforcée** :
- Prompt très strict avec exemples concrets
- Validation post-reformulation obligatoire
- Retry automatique si validation échoue
- Log d'erreur si échec final

#### **Avantages**
- ✅ Séparation claire : fond analytique (génération) vs forme linguistique (reformulation)
- ✅ Réversible (fonction isolée)
- ✅ Fail-soft (texte original si échec)
- ✅ Pas d'impact sur prompts métier

#### **Inconvénients**
- ⚠️ Coût API : +1-3 appels OpenAI par texte (reformulation + retries)
- ⚠️ Latence : +200-1500ms par texte (selon retries)
- ⚠️ Complexité : pipeline plus long

#### **Impact**
- **Coût** : +1-3 appels OpenAI par texte (≈ $0.01-0.06 par texte)
- **Latence** : +200-1500ms par texte
- **Parsing** : Aucun impact
- **Validation existante** : Aucun impact
- **Front** : Aucun impact

---

## 3️⃣ RECOMMANDATION

### **Approche recommandée : APPROCHE 1 (Renforcement prompt reformulation)**

**Raisons** :
1. ✅ **Respecte la contrainte** : Pas de modification des prompts métier
2. ✅ **Réversible** : Fonction isolée, désactivable
3. ✅ **Fail-soft** : Texte original servi si échec
4. ✅ **Coût maîtrisé** : +1 appel OpenAI par texte (acceptable)
5. ✅ **Latence acceptable** : +200-500ms (impact UX minimal)
6. ✅ **Amélioration progressive** : Retry si première reformulation insuffisante

**Modifications à apporter** :
1. Renforcer le prompt de `adaptToMentorStyle` avec contraintes strictes
2. Ajouter fonction `validateMentorStyle` pour validation post-reformulation
3. Ajouter retry avec prompt encore plus strict si validation échoue
4. Log d'erreur si échec final (pour monitoring)

**Ordre d'implémentation** :
1. Renforcer prompt reformulation
2. Ajouter validation style
3. Ajouter retry si validation échoue
4. Tester sur miroirs BLOC 1, 2B, 3-9
5. Tester sur synthèse BLOC 10
6. Tester sur matching

---

## 4️⃣ ESTIMATION EFFORT

### **Approche 1 (Recommandée)**
- **Développement** : 4-6 heures
  - Renforcement prompt : 1h
  - Fonction validation style : 2h
  - Intégration retry : 1h
  - Tests : 2h
- **Tests** : 2-3 heures
  - Tests unitaires validation
  - Tests intégration sur miroirs
  - Tests intégration sur synthèse/matching
- **Total** : 6-9 heures

### **Approche 2**
- **Développement** : 2-3 heures
  - Modification prompts : 1h
  - Tests : 1-2h
- **Tests** : 2-3 heures
- **Total** : 4-6 heures
- **⚠️ Risque** : Modification prompts métier (contrainte violée)

### **Approche 3**
- **Développement** : 6-8 heures
  - Pipeline 2 étapes : 2h
  - Validation style : 2h
  - Retry automatique : 2h
  - Tests : 2h
- **Tests** : 3-4 heures
- **Total** : 9-12 heures

---

## 5️⃣ RISQUES

### **Risques communs**
- **Échec reformulation** : Si le LLM ne reformule pas correctement → texte original servi (peut être déclaratif)
- **Coût API** : +1-3 appels OpenAI par texte (impact budget)
- **Latence** : +200-1500ms par texte (impact UX)

### **Risques spécifiques Approche 1**
- **Retry insuffisant** : Si 2 retries échouent → texte original servi
- **Validation trop stricte** : Risque de rejeter des textes valides
- **Validation trop permissive** : Risque d'accepter des textes déclaratifs

### **Mitigation**
- **Monitoring** : Logs d'erreur pour suivre taux d'échec reformulation
- **A/B testing** : Comparer textes reformulés vs originaux
- **Fallback progressif** : Si reformulation échoue → servir texte original avec log

---

## 6️⃣ CRITÈRES DE VALIDATION

### **Critères objectifs (automatisables)**

**1. Validation linguistique** :
- ✅ Aucune phrase d'analyse ne commence par "tu es", "vous êtes", "votre", "ton", "ta"
- ✅ Chaque phrase d'analyse contient au moins un marqueur expérientiel ("quand tu...", "dès que tu...", etc.)
- ✅ Aucun concept nommé ("ton moteur", "votre recherche") en début de phrase

**2. Validation format** :
- ✅ Format REVELIOM respecté (sections 1️⃣ 2️⃣ 3️⃣, longueurs 20/25 mots)
- ✅ Profondeur interprétative respectée (inférence, lecture en creux)

**3. Validation sens** :
- ✅ Sens strictement identique (pas d'ajout, suppression, modification d'information)

### **Critères subjectifs (tests utilisateurs)**

**1. Lisibilité** :
- ✅ Le texte peut être lu à voix haute sans gêne
- ✅ Le texte ne ressemble ni à un test, ni à un rapport, ni à une analyse RH

**2. Perception** :
- ✅ Le candidat se dit spontanément : "oui… c'est exactement ça"
- ✅ Le texte donne le sentiment que "quelqu'un a vraiment compris"

**3. Style** :
- ✅ Le texte décrit une dynamique vécue, pas un trait de personnalité
- ✅ Le texte utilise un langage expérientiel, pas déclaratif

### **Tests de validation**

**Tests unitaires** :
- Validation style linguistique (fonction `validateMentorStyle`)
- Validation sens (comparaison avant/après reformulation)

**Tests intégration** :
- Génération miroir BLOC 1 → reformulation → validation
- Génération miroir BLOC 2B → reformulation → validation
- Génération miroir BLOCS 3-9 → reformulation → validation
- Génération synthèse BLOC 10 → reformulation → validation
- Génération matching → reformulation → validation

**Tests utilisateurs** :
- Comparaison textes avant/après reformulation
- Feedback candidats sur perception du style
- Mesure taux de validation ("oui, c'est exactement ça")

---

## 7️⃣ CONCLUSION

### **Diagnostic**
Le problème se joue à 2 niveaux :
1. **Génération initiale** : Prompts métier n'imposent pas la forme linguistique expérientielle
2. **Reformulation** : Prompt de reformulation trop permissif, pas de validation post-reformulation

### **Solution recommandée**
**Approche 1** : Renforcement du prompt de reformulation avec validation stricte et retry
- ✅ Respecte contraintes (pas de modification prompts métier)
- ✅ Réversible et fail-soft
- ✅ Coût et latence acceptables
- ✅ Amélioration progressive

### **Prochaines étapes**
1. Valider l'approche recommandée
2. Implémenter renforcement prompt + validation style
3. Tester sur miroirs BLOC 1, 2B, 3-9
4. Tester sur synthèse BLOC 10 et matching
5. Monitoring et ajustements

---

**FIN DE L'AUDIT**
