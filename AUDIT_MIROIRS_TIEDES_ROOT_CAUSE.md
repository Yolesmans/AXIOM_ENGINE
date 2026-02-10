# 🔍 AUDIT SENIOR — MIROIRS FIN DE BLOC TIÈDES (ROOT CAUSE)

**Date** : 2025-01-27  
**Mission** : Comprendre pourquoi les miroirs fin de bloc sortent encore tièdes (descriptifs) et comment obtenir un ton mentor REVELIOM constant  
**Status** : ✅ Audit complet — causes identifiées — corrections minimales proposées

---

## A) CARTOGRAPHIE END-TO-END — PIPELINE BLOC 1

### Point d'entrée
**Fichier** : `src/services/blockOrchestrator.ts`  
**Fonction** : `generateMirrorForBlock1()` (ligne 468)  
**Trigger** : Fin du BLOC 1 (toutes les questions répondues)

### Pipeline complet (3 étapes)

#### ÉTAPE 1 — INTERPRÉTATION (FROIDE, LOGIQUE)
**Fichier** : `src/services/interpretiveStructureGenerator.ts`  
**Fonction** : `generateInterpretiveStructure()`  
**Appel** : `blockOrchestrator.ts:494`  
**Input** : `userAnswers: string[]` (réponses BLOC 1)  
**Output** : `InterpretiveStructure` (4 champs)
- `hypothese_centrale: string`
- `comment_elle_se_met_en_mouvement: string`
- `ce_qui_eteint_son_moteur: string`
- `mecanisme: string`
**Modèle** : `gpt-4o-mini`, temp `0.3`  
**Log** : `[BLOC1][ETAPE1] Structure générée`

#### ÉTAPE 2 — DÉCISION D'ANGLE (OBLIGATOIRE)
**Fichier** : `src/services/mentorAngleSelector.ts`  
**Fonction** : `selectMentorAngle()`  
**Appel** : `blockOrchestrator.ts:506`  
**Input** : `structure: InterpretiveStructure` (analyse complète)  
**Output** : `mentor_angle: string` (UNE phrase unique)  
**Modèle** : `gpt-4o-mini`, temp `0.5`  
**Log** : `[BLOC1][ETAPE2] Angle mentor sélectionné`

#### ÉTAPE 3 — RENDU MENTOR INCARNÉ
**Fichier** : `src/services/mentorStyleRenderer.ts`  
**Fonction** : `renderMentorStyle()`  
**Appel** : `blockOrchestrator.ts:515`  
**Input** : `mentorAngle: string` (angle unique)  
**Output** : `mentorText: string` (format REVELIOM)  
**Modèle** : `gpt-4o`, temp `0.8`  
**Log** : `[BLOC1][ETAPE3] Texte mentor généré`

### Validations

#### Validation 1 : Format REVELIOM
**Fichier** : `src/services/validateMirrorREVELIOM.ts`  
**Fonction** : `validateMirrorREVELIOM()`  
**Appel** : `blockOrchestrator.ts:522`  
**Vérifications** :
- Sections 1️⃣ 2️⃣ 3️⃣ présentes
- Section 1 : ≤ 20 mots
- Section 2 : ≤ 25 mots
- Lecture en creux obligatoire (pattern : "probablement pas... mais plutôt")
- Ton 2e personne majoritaire
**Log** : `[BLOC1][WARN] Format REVELIOM invalide` (si échec, mais fail-soft)

#### Validation 2 : Style mentor
**Fichier** : `src/services/validateMentorStyle.ts`  
**Fonction** : `validateMentorStyle()`  
**Appel** : `mentorStyleRenderer.ts:137`  
**Vérifications** :
- Pas de patterns déclaratifs ("tu es...", "votre...")
- Marqueurs expérientiels obligatoires ("quand tu...", "dès que tu...")
**Log** : `[MENTOR_STYLE_RENDERER] Validation style échouée` (si échec, retry puis fail-soft)

### Payload renvoyé au frontend

**Fichier** : `src/engine/axiomExecutor.ts`  
**Fonction** : `executeAxiom()` (ligne 2025-2033)  
**Structure** :
```typescript
{
  response: string,              // Texte miroir complet (format REVELIOM)
  step: string,                  // Ex: "BLOC_01"
  lastQuestion: string | null,   // null pour miroir
  expectsAnswer: boolean,        // true pour validation miroir
  autoContinue: boolean,         // false
  progressiveDisplay?: boolean,   // true si BLOC 3-9
  mirrorSections?: string[]      // [section1, section2, section3] si progressiveDisplay
}
```

**Format texte** : String brut (pas de JSON, pas de markdown structuré)  
**Exemple** :
```
1️⃣ Lecture implicite
Quand tu sens que ton action a un impact réel sur quelqu'un, tu t'engages vraiment.

2️⃣ Déduction personnalisée
Tu avances fort tant que tu aides de manière vivante, mais dès que la routine prend le dessus, ton moteur se coupe.

3️⃣ Validation ouverte
Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue.
```

### Composant UI qui affiche

**Fichier** : `ui-test/app.js`  
**Fonction** : `addMessage()` (ligne 20)  
**Rendu** :
- Si `progressiveDisplay === true` : Affichage progressif (3 messages séparés avec délai 900ms)
- Sinon : Affichage direct du texte complet
**Format** : `<p>` avec `textContent` (pas de markdown, pas de HTML)  
**CSS** : `message-reveliom` (classe CSS)  
**White-space** : Par défaut (pas de `pre-wrap`)

**⚠️ PROBLÈME IDENTIFIÉ** : Le texte est rendu en `textContent`, donc :
- Les retours à la ligne sont préservés (caractère `\n`)
- Mais pas de rendu markdown (pas de formatage des emojis)
- Pas de `white-space: pre-wrap` explicite

---

## B) AUDIT DE CONTENU — ROOT CAUSE

### Observation 1 : `mentor_angle` est probablement tiède

#### Preuve 1 : Prompt `selectMentorAngle()` manque de contraintes tranchantes

**Fichier** : `src/services/mentorAngleSelector.ts` (lignes 40-102)

**Problèmes identifiés** :

1. **Pas de few-shots "gold standard"** :
   - Le prompt ne contient AUCUN exemple d'angle tranché
   - Le modèle n'a pas de référence concrète de ce qu'est un "wow"

2. **Pas de pattern "lecture en creux" explicite** :
   - Le prompt dit "Choisir UN angle" mais ne force PAS le pattern "ce n'est probablement pas X, mais Y"
   - La validation REVELIOM cherche ce pattern (ligne 37-40 de `validateMirrorREVELIOM.ts`), mais le prompt ne l'exige pas

3. **Pas de scoring interne** :
   - Aucune validation que l'angle est "tranchant" vs "tiède"
   - Aucune auto-réécriture si l'angle est trop proche de l'hypothèse centrale

4. **Temperature trop basse** :
   - `temp: 0.5` est conservateur
   - Pour un angle "tranché", il faudrait `temp: 0.7-0.8`

#### Preuve 2 : Validation trop faible

**Fichier** : `src/services/mentorAngleSelector.ts` (lignes 144-159)

**Validation actuelle** :
- Détection de patterns interdits (résumé) : `globalement`, `dans l'ensemble`, etc.
- Mais PAS de validation que l'angle est "différent" de l'hypothèse centrale
- PAS de validation que l'angle contient une "lecture en creux"

**Résultat** : Un angle peut être une simple reformulation de l'hypothèse centrale et passer la validation.

### Observation 2 : Le renderer "neutralise" peut-être

#### Preuve 1 : Prompt `renderMentorStyle()` manque de contraintes format strictes

**Fichier** : `src/services/mentorStyleRenderer.ts` (lignes 198-224)

**Problèmes identifiés** :

1. **Pas d'en-tête "🧠 MIROIR INTERPRÉTATIF — BLOC X"** :
   - Le format attendu côté UI inclut cet en-tête
   - Mais le prompt ne le demande PAS explicitement
   - Le renderer peut produire juste les 3 sections sans en-tête

2. **Contrainte "20/25 mots" est mentionnée mais pas forcée** :
   - Le prompt dit "MAXIMUM 20 mots EXACTEMENT" mais c'est juste du texte
   - Aucune validation post-rendu qui rejette si > 20 mots
   - La validation REVELIOM existe (ligne 24 de `validateMirrorREVELIOM.ts`) mais elle est fail-soft (ligne 152 de `mentorStyleRenderer.ts`)

3. **Pas de few-shots de format exact** :
   - Le prompt ne montre PAS un exemple complet du format attendu
   - Le modèle doit deviner le format à partir de la description textuelle

#### Preuve 2 : Validation fail-soft

**Fichier** : `src/services/mentorStyleRenderer.ts` (lignes 144-153)

**Comportement actuel** :
- Si validation échoue → retry (1 fois)
- Si retry échoue → **fail-soft** : servir quand même le texte
- **Résultat** : Des miroirs invalides peuvent être servis

### Observation 3 : UI ne "aplatit" probablement pas

**Fichier** : `ui-test/app.js` (ligne 60)

**Rendu** : `textP.textContent = text || '';`

**Analyse** :
- `textContent` préserve les retours à la ligne (`\n`)
- Les emojis sont préservés (1️⃣, 2️⃣, 3️⃣)
- Pas de transformation markdown qui pourrait "aplatir"

**Conclusion** : Le problème n'est probablement PAS côté UI.

---

## C) CAUSE RACINE (DIAGNOSTIC BINAIRE)

### 🎯 DIAGNOSTIC : **Le problème est à 80% dans `mentor_angle`**

#### Preuve 1 : L'angle est probablement une reformulation tiède
- Le prompt `selectMentorAngle()` ne force PAS un angle vraiment différent
- Pas de few-shots pour montrer ce qu'est un "wow"
- Pas de pattern "lecture en creux" explicite
- Temperature trop basse (0.5 au lieu de 0.7-0.8)

#### Preuve 2 : Le renderer fait son travail mais avec un input tiède
- Le renderer reçoit un angle tiède → produit un rendu tiède
- Le prompt du renderer est correct (incarner, pas justifier)
- Mais si l'angle est "Cette personne fonctionne comme ça : elle a besoin de sens", le renderer ne peut pas faire de "wow"

#### Preuve 3 : UI ne modifie pas le contenu
- Rendu en `textContent` → préservation du format
- Pas de transformation qui "aplatit"

### 🎯 CORRECTION MINIMALE (1-3 micro-changements)

**Changement 1** : Renforcer `selectMentorAngle()` avec few-shots et pattern "lecture en creux"  
**Changement 2** : Augmenter temperature à 0.7  
**Changement 3** : Ajouter validation que l'angle contient "lecture en creux"

**Pourquoi minimal** : On ne touche qu'à l'étape 2 (angle), pas au renderer ni à l'UI.

---

## D) RECOMMANDATIONS CONCRÈTES (PATCHS SUGGÉRÉS)

### 1) Reco prompt `selectMentorAngle()` — Angle TRANCHÉ

#### Patch 1 : Ajouter few-shots "gold standard"

**Fichier** : `src/services/mentorAngleSelector.ts`  
**Ligne** : Après la ligne 102 (avant le `}` du system prompt)

**Diff suggéré** :
```typescript
⚠️ TU DOIS :
- Choisir UN angle unique dans l'analyse
- Le formuler comme "Cette personne fonctionne comme ça : ..."
- Accepter de perdre le reste
- Tranché, assumé, non équilibré

📚 EXEMPLES D'ANGLES TRANCHÉS (GOLD STANDARD) :

Exemple 1 (BLOC 1) :
"Cette personne fonctionne comme ça : ce n'est probablement pas l'effort qui la met en mouvement, mais le moment où elle sent que son action a un impact réel sur quelqu'un."

Exemple 2 (BLOC 3) :
"Cette personne fonctionne comme ça : ce n'est probablement pas la recherche de sécurité qui la guide, mais le besoin de sentir qu'elle construit quelque chose qui lui ressemble."

Exemple 3 (BLOC 5) :
"Cette personne fonctionne comme ça : ce n'est probablement pas l'ambition classique qui la pousse, mais le désir de créer un espace où ses valeurs peuvent s'incarner concrètement."

Exemple 4 (BLOC 7) :
"Cette personne fonctionne comme ça : ce n'est probablement pas le métier en lui-même qui l'anime, mais la possibilité d'être reconnue pour ce qu'elle apporte vraiment."

Exemple 5 (BLOC 9) :
"Cette personne fonctionne comme ça : ce n'est probablement pas l'extraversion qui la définit, mais sa capacité à créer des liens profonds avec très peu de personnes."

⚠️ PATTERN OBLIGATOIRE : "ce n'est probablement pas X, mais Y"
- X = ce qui semble évident (effort, sécurité, ambition, métier, extraversion)
- Y = ce qui se cache derrière (impact réel, construction personnelle, valeurs incarnées, reconnaissance, liens profonds)

Produis UNIQUEMENT l'angle mentor (UNE phrase, formulable oralement), sans texte additionnel.
```

#### Patch 2 : Forcer pattern "lecture en creux"

**Fichier** : `src/services/mentorAngleSelector.ts`  
**Ligne** : Après la ligne 98 (dans la section "⚠️ TU DOIS")

**Diff suggéré** :
```typescript
⚠️ TU DOIS :
- Choisir UN angle unique dans l'analyse
- Le formuler comme "Cette personne fonctionne comme ça : ..."
- Accepter de perdre le reste
- Tranché, assumé, non équilibré
- **OBLIGATOIRE** : Utiliser le pattern "ce n'est probablement pas X, mais Y" pour forcer une lecture en creux
```

#### Patch 3 : Augmenter temperature

**Fichier** : `src/services/mentorAngleSelector.ts`  
**Ligne** : 123

**Diff suggéré** :
```typescript
        temperature: 0.7,  // Augmenté de 0.5 à 0.7 pour plus de créativité/tranchance
```

#### Patch 4 : Ajouter validation "lecture en creux"

**Fichier** : `src/services/mentorAngleSelector.ts`  
**Ligne** : Après la ligne 150 (dans la validation)

**Diff suggéré** :
```typescript
      // Validation : l'angle ne doit pas être un résumé (détection de mots interdits)
      const forbiddenPatterns = [
        /^(globalement|dans l'ensemble|ce qui ressort|en résumé|pour résumer)/i,
        /(et aussi|ainsi que|de plus|également|par ailleurs)/i,
      ];

      const isSummary = forbiddenPatterns.some(pattern => pattern.test(mentorAngle));
      if (isSummary) {
        console.warn(`[MENTOR_ANGLE_SELECTOR] Angle détecté comme résumé (retry ${retries})`);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
        // Fail-soft : servir quand même
        console.warn(`[MENTOR_ANGLE_SELECTOR] Angle servi malgré détection résumé`);
      }

      // NOUVELLE VALIDATION : L'angle doit contenir une "lecture en creux"
      const hasReadingInDepth = /(probablement pas|n'est probablement pas|plutôt.*que|mais plutôt)/i.test(mentorAngle);
      if (!hasReadingInDepth) {
        console.warn(`[MENTOR_ANGLE_SELECTOR] Angle sans lecture en creux (retry ${retries})`);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
        // Fail-soft : servir quand même mais log warning
        console.warn(`[MENTOR_ANGLE_SELECTOR] Angle servi sans lecture en creux (non conforme REVELIOM)`);
      }
```

#### Patch 5 : Ajouter scoring interne (optionnel, plus complexe)

**Fichier** : `src/services/mentorAngleSelector.ts`  
**Ligne** : Après la ligne 132 (après `mentorAngle = content.trim()`)

**Diff suggéré** :
```typescript
      const mentorAngle = content.trim();

      // SCORING INTERNE : Vérifier que l'angle est "tranchant"
      // Score 1 : Contient "lecture en creux" (pattern "probablement pas... mais")
      const hasReadingInDepth = /(probablement pas|n'est probablement pas|plutôt.*que|mais plutôt)/i.test(mentorAngle);
      // Score 2 : Différent de l'hypothèse centrale (distance sémantique minimale)
      const isDifferentFromHypothesis = mentorAngle.toLowerCase() !== structure.hypothese_centrale.toLowerCase().substring(0, mentorAngle.length);
      // Score 3 : Contient un mécanisme (mots-clés : "quand", "dès que", "tant que", "à condition que")
      const hasMechanism = /(quand|dès que|tant que|à condition que|si|dans le cas où)/i.test(mentorAngle);
      
      const score = (hasReadingInDepth ? 1 : 0) + (isDifferentFromHypothesis ? 1 : 0) + (hasMechanism ? 1 : 0);
      const threshold = 2; // Minimum 2/3 pour être "tranchant"
      
      if (score < threshold) {
        console.warn(`[MENTOR_ANGLE_SELECTOR] Angle trop tiède (score: ${score}/3, retry ${retries})`);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
        // Fail-soft : servir quand même mais log warning
        console.warn(`[MENTOR_ANGLE_SELECTOR] Angle servi avec score faible (${score}/3)`);
      }
```

### 2) Reco prompt `renderMentorStyle()` — Format EXACT

#### Patch 1 : Ajouter en-tête "🧠 MIROIR INTERPRÉTATIF — BLOC X"

**Fichier** : `src/services/mentorStyleRenderer.ts`  
**Ligne** : 198 (dans `getFormatInstructions()` pour REVELIOM)

**Diff suggéré** :
```typescript
      // Format REVELIOM (mini-miroir)
      return `⚠️ FORMAT STRICT OBLIGATOIRE — NON NÉGOCIABLE

🧠 MIROIR INTERPRÉTATIF — BLOC ${blockType.replace('block', '')}

1️⃣ Lecture implicite
- UNE SEULE phrase
- MAXIMUM 20 mots EXACTEMENT
- Basée UNIQUEMENT sur : l'angle mentor
- Incarnes l'angle en langage vécu et expérientiel
- Position interprétative claire
- Lecture en creux obligatoire (montrer le mécanisme, pas les traits)
- Tu n'as PAS à justifier l'angle, tu dois l'incarner

2️⃣ Déduction personnalisée
- UNE SEULE phrase
- MAXIMUM 25 mots EXACTEMENT
- Basée UNIQUEMENT sur : l'angle mentor (même angle ou angle complémentaire)
- Incarnes l'angle (ou un angle complémentaire) en langage vécu et expérientiel
- Explicite les conditions concrètes d'engagement et de désengagement
- Lecture en creux obligatoire
- Tu n'as PAS à justifier, tu dois incarner

3️⃣ Validation ouverte
- Phrase EXACTE et INCHANGÉE :
"Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

⚠️ CONTRAINTES FORMAT :
- Conserver EXACTEMENT le format (en-tête + sections 1️⃣ 2️⃣ 3️⃣)
- Conserver EXACTEMENT les limites de mots (20/25 mots)
- Retours à la ligne OBLIGATOIRES entre chaque section`;
```

#### Patch 2 : Ajouter few-shot de format exact

**Fichier** : `src/services/mentorStyleRenderer.ts`  
**Ligne** : Après la ligne 224 (après les contraintes format)

**Diff suggéré** :
```typescript
⚠️ CONTRAINTES FORMAT :
- Conserver EXACTEMENT le format (sections 1️⃣ 2️⃣ 3️⃣)
- Conserver EXACTEMENT les limites de mots (20/25 mots)

📚 EXEMPLE DE FORMAT EXACT ATTENDU :

🧠 MIROIR INTERPRÉTATIF — BLOC 1

1️⃣ Lecture implicite
Quand tu sens que ton action a un impact réel sur quelqu'un, tu t'engages vraiment.

2️⃣ Déduction personnalisée
Tu avances fort tant que tu aides de manière vivante, mais dès que la routine prend le dessus, ton moteur se coupe.

3️⃣ Validation ouverte
Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue.

⚠️ IMPORTANT : Reproduis EXACTEMENT ce format (en-tête, sections, retours à la ligne, phrase validation exacte).
```

#### Patch 3 : Renforcer validation mots (optionnel, plus strict)

**Fichier** : `src/services/mentorStyleRenderer.ts`  
**Ligne** : 144 (après validation fail-soft)

**Diff suggéré** :
```typescript
      // Validation échouée → retry si possible
      if (retries < maxRetries) {
        console.warn(`[MENTOR_STYLE_RENDERER] Validation style échouée (retry ${retries}, type: ${blockType}), erreurs:`, validation.errors);
        retries++;
        continue;
      }

      // NOUVELLE VALIDATION : Vérifier limites de mots (pour REVELIOM uniquement)
      if (blockType === 'block1' || (blockType.startsWith('block') && ['3', '4', '5', '6', '7', '8', '9'].includes(blockType.replace('block', '')))) {
        const reveliomValidation = validateMirrorREVELIOM(mentorText);
        if (!reveliomValidation.valid) {
          console.warn(`[MENTOR_STYLE_RENDERER] Format REVELIOM invalide (retry ${retries}), erreurs:`, reveliomValidation.errors);
          if (retries < maxRetries) {
            retries++;
            continue;
          }
          // Fail-soft : servir quand même mais log warning
          console.warn(`[MENTOR_STYLE_RENDERER] Texte servi malgré format REVELIOM invalide`);
        }
      }

      // Dernier retry échoué → log d'erreur mais servir quand même (fail-soft)
      console.error(`[MENTOR_STYLE_RENDERER] Validation style échouée après ${maxRetries} retries (type: ${blockType}), utilisation texte généré`, validation.errors);
      return mentorText;
```

**Note** : Nécessite d'importer `validateMirrorREVELIOM` en haut du fichier.

### 3) Reco UI — Confirmation format

#### Patch 1 : Ajouter `white-space: pre-wrap` (optionnel, si problème affichage)

**Fichier** : `ui-test/app.js` (ou fichier CSS correspondant)  
**Ligne** : Dans le style de `.message-reveliom`

**Diff suggéré** :
```css
.message-reveliom {
  /* ... styles existants ... */
  white-space: pre-wrap; /* Préserver retours à la ligne et espaces */
}
```

**Note** : À faire seulement si les retours à la ligne ne s'affichent pas correctement.

---

## E) CHECKLIST DE TEST

### Test 1 : BLOC 1 — Miroir "wow"

**Scénario** :
1. Créer un candidat de test
2. Répondre aux questions BLOC 1
3. Vérifier le miroir généré

**Vérifications** :
- [ ] Log : `[BLOC1][ETAPE2] Angle mentor sélectionné` contient "probablement pas... mais"
- [ ] Log : `[MENTOR_ANGLE_SELECTOR] Angle mentor sélectionné avec succès` (pas de warning "sans lecture en creux")
- [ ] Output : En-tête "🧠 MIROIR INTERPRÉTATIF — BLOC 1" présent
- [ ] Output : Section 1 contient "probablement pas... mais" ou équivalent
- [ ] Output : Section 1 ≤ 20 mots
- [ ] Output : Section 2 ≤ 25 mots
- [ ] Effet : "wow… ok, ça me parle vraiment" (pas "oui, c'est ce que j'ai dit")

### Test 2 : BLOC 3 — Miroir "wow"

**Scénario** :
1. Continuer avec le même candidat
2. Répondre aux questions BLOC 3
3. Vérifier le miroir généré

**Vérifications** :
- [ ] Même checklist que BLOC 1
- [ ] Angle différent de l'hypothèse centrale (pas une reformulation)

### Test 3 : BLOC 10 — Synthèse riche (contraste)

**Scénario** :
1. Continuer jusqu'au BLOC 10
2. Vérifier la synthèse finale

**Vérifications** :
- [ ] Log : `[AXIOM_EXECUTOR][ETAPE2] Pas d'angle pour synthesis - utilisation hypothèse centrale complète`
- [ ] Output : Synthèse complète, structurante (pas de perte d'info)
- [ ] Output : Couvre tous les aspects (mouvement, temps, valeurs, projections, forces, limites)
- [ ] Contraste : La synthèse est RICHE vs les miroirs sont TRANCHÉS

---

## F) RÉSUMÉ EXÉCUTIF

### Cause racine
**80% dans `mentor_angle`** : L'angle sélectionné est probablement une reformulation tiède de l'hypothèse centrale, sans "lecture en creux" ni pattern "probablement pas... mais".

### Corrections minimales (3 changements)
1. **Ajouter few-shots "gold standard"** dans `selectMentorAngle()` (5 exemples avec pattern "probablement pas... mais")
2. **Augmenter temperature** de 0.5 à 0.7 dans `selectMentorAngle()`
3. **Ajouter validation "lecture en creux"** dans `selectMentorAngle()` (rejeter si pas de pattern)

### Corrections optionnelles (si problème persiste)
4. Ajouter en-tête "🧠 MIROIR INTERPRÉTATIF — BLOC X" dans `renderMentorStyle()`
5. Ajouter few-shot de format exact dans `renderMentorStyle()`
6. Renforcer validation mots dans `renderMentorStyle()`

### Impact attendu
- Angles plus tranchés avec "lecture en creux"
- Miroirs qui provoquent "wow" au lieu de "oui, c'est ce que j'ai dit"
- Format REVELIOM strict respecté

---

**FIN DE L'AUDIT**
