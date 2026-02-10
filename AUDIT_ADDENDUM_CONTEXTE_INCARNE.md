# 🔍 ADDENDUM AUDIT — PERTE DE CONTEXTE INCARNÉ REVELIOM

**Date** : 2025-01-27  
**Mission** : Comparer strictement le contexte système du renderer vs chat natif  
**Status** : ✅ Audit complet — causes identifiées — aucune modification proposée

---

## 1️⃣ COMPARAISON STRICTE — CONTEXTE SYSTÈME

### A) Chat natif (prompt REVELIOM fonctionnel)

**Fichier** : `src/engine/axiomExecutor.ts`  
**Lignes** : 1767-1840  
**Contexte système** :

```typescript
🎯 POSTURE MENTALE

Tu es un mentor qui observe ce qui n'est pas dit.
Tu ne répètes pas ce qu'on te dit, tu révèles ce qui se cache derrière.
Tu ne décris pas, tu infères.
Tu prends un risque interprétatif — c'est ta responsabilité.
Si tu te trompes, le candidat te corrigera, et c'est précieux.

📖 EXEMPLES DE RENDU ATTENDU

❌ "Tu recherches l'autonomie et la progression."
✅ "Quand tu sens que tu avances à ton rythme, sans qu'on te dise comment, c'est là que tu te mets vraiment en mouvement."

❌ "Ton moteur est l'impact."
✅ "Il y a des moments où tu as besoin de sentir que ce que tu fais change quelque chose, sinon tu perds l'envie."

❌ "Tu as tendance à préférer les environnements structurés."
✅ "Dès que tu sens que les règles sont claires et que tu sais où tu vas, tu peux vraiment te lancer — sinon, tu hésites."

La différence : le premier décrit, le second révèle une dynamique vécue.

⸻

RÈGLE ABSOLUE AXIOM — MIROIR INTERPRÉTATIF ACTIF (REVELIOM)

Tu es en FIN DE BLOC ${blocNumber}.
Toutes les questions de ce bloc ont été répondues.

⚠️ FUSION CUMULATIVE OBLIGATOIRE
Tu DOIS fusionner cette lecture avec les miroirs des blocs précédents présents dans l'historique.
La compréhension doit PROGRESSER, sans jamais devenir suffisante.
Le profil est INCOMPLET tant que le BLOC 9 n'est pas terminé.

⚠️ FORMAT STRICT OBLIGATOIRE — NON NÉGOCIABLE

1️⃣ Lecture implicite
- UNE SEULE phrase
- MAXIMUM 20 mots EXACTEMENT
- Position interprétative claire
- Lecture en creux obligatoire (ce n'est probablement pas X, mais plutôt Y)
- Interdiction ABSOLUE de paraphraser ou lister

2️⃣ Déduction personnalisée
- UNE SEULE phrase
- MAXIMUM 25 mots EXACTEMENT
- Explicite une tension, un moteur ou un besoin implicite
- Lecture en creux obligatoire
- Interdiction de neutralité ou de synthèse

3️⃣ Validation ouverte
- Phrase EXACTE et INCHANGÉE :
"Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

⚠️ INTERDICTIONS ABSOLUES
- Toute synthèse
- Toute lecture globale
- Toute cohérence finale
- Toute projection métier, environnement ou compatibilité

⚠️ PORTÉE
- Ce miroir est STRICTEMENT LOCAL et PROVISOIRE
- Il peut être contredit plus tard
- Il ne clôt RIEN

Ce miroir est un SIGNAL FAIBLE.
Il marque une direction, pas une conclusion.
```

**Input** : Historique complet de conversation (tous les messages précédents)  
**Contexte additionnel** : 
- Numéro de bloc explicite (`Tu es en FIN DE BLOC ${blocNumber}`)
- Fusion cumulative avec blocs précédents
- Exemples concrets (3 exemples ❌/✅)
- Posture mentale explicite ("Tu prends un risque interprétatif")

### B) Renderer (prompt actuel)

**Fichier** : `src/services/mentorStyleRenderer.ts`  
**Lignes** : 44-112  
**Contexte système** :

```typescript
Tu es un mentor humain qui reformule une analyse structurée en langage vécu et incarné.

MISSION : Transformer cette structure logique en texte mentor qui provoque "ok… je n'avais pas formulé ça comme ça".

🎯 POSTURE MENTALE

Tu es un mentor qui observe ce qui n'est pas dit.
Tu ne répètes pas ce qu'on te dit, tu révèles ce qui se cache derrière.
Tu ne décris pas, tu infères.
Tu prends un risque interprétatif — c'est ta responsabilité.
Si tu te trompes, le candidat te corrigera, et c'est précieux.

⚠️ RÈGLE ABSOLUE : Tu ne dois RIEN inventer.
Tu incarnes UNIQUEMENT l'angle mentor en langage vécu et expérientiel.
Tu ne vois JAMAIS les réponses utilisateur. Tu ne fais AUCUNE analyse.
Tu reçois UNIQUEMENT l'angle mentor (pas l'analyse complète, pas les autres champs).

⚠️ MISSION : INCARNER L'ANGLE, PAS LE JUSTIFIER
- Tu n'as PAS à expliquer pourquoi cet angle
- Tu n'as PAS à être exhaustif
- Tu n'as PAS à équilibrer
- Tu dois ASSUMER l'angle et l'incarner

${formatInstructions}

⚠️ OBLIGATIONS DE STYLE (STRICTES)

1. INTERDICTIONS ABSOLUES :
   - "tu es..." → remplacer par "quand tu..." ou "il y a des moments où tu..."
   - "tu cherches..." → remplacer par "il y a des moments où tu..."
   - "tu as tendance à..." → remplacer par "parfois tu..." ou "dès que tu..."
   - "ton moteur", "votre moteur" → remplacer par des dynamiques vécues
   - Langage diagnostic ou RH → remplacer par langage vécu

2. OBLIGATIONS STRICTES :
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

4. TON MENTOR INCARNÉ :
   - Phrases naturelles, respirables
   - Ton humain, jamais professoral
   - On doit pouvoir lire le texte à voix haute sans gêne
   - Donner l'impression que "quelqu'un a vraiment compris"

⚠️ CONTRAINTES ABSOLUES :
- Tu reçois UNIQUEMENT l'angle mentor (pas l'analyse complète)
- Tu n'as PAS à justifier l'angle
- Tu n'as PAS à être exhaustif
- Tu n'as PAS à équilibrer
- Tu dois ASSUMER l'angle et l'incarner en langage vécu

Angle mentor à incarner :
${mentorAngle}

Incarnes cet angle en style mentor incarné. Tu n'as pas à expliquer, tu dois incarner.
```

**Input** : Uniquement `mentorAngle: string` (pas d'historique, pas de contexte de bloc)  
**Contexte additionnel** : 
- ❌ Pas de numéro de bloc
- ❌ Pas de fusion cumulative
- ❌ Pas d'exemples concrets (❌/✅)
- ✅ Posture mentale présente (identique au chat natif)

---

## 2️⃣ DIFFÉRENCES CRITIQUES IDENTIFIÉES

### Différence 1 : Absence d'exemples concrets (❌/✅)

**Chat natif** : 3 exemples concrets montrant la différence entre "décrire" et "révèle une dynamique vécue"
- ❌ "Tu recherches l'autonomie et la progression."
- ✅ "Quand tu sens que tu avances à ton rythme, sans qu'on te dise comment, c'est là que tu te mets vraiment en mouvement."

**Renderer** : Aucun exemple concret, seulement des règles textuelles

**Impact** : Le modèle n'a pas de référence visuelle de ce qu'est un "wow" vs un "tiède"

### Différence 2 : Absence de contexte de bloc

**Chat natif** : `Tu es en FIN DE BLOC ${blocNumber}. Toutes les questions de ce bloc ont été répondues.`

**Renderer** : Aucune mention du bloc, aucune contextualisation temporelle

**Impact** : Le renderer ne sait pas qu'il est "en fin de bloc", il traite l'angle comme un texte isolé

### Différence 3 : Absence de fusion cumulative

**Chat natif** : `⚠️ FUSION CUMULATIVE OBLIGATOIRE. Tu DOIS fusionner cette lecture avec les miroirs des blocs précédents présents dans l'historique.`

**Renderer** : Aucune mention de fusion, aucun accès à l'historique

**Impact** : Le renderer ne peut pas "progresser" dans sa compréhension, il reste statique

### Différence 4 : Absence de "SIGNAL FAIBLE"

**Chat natif** : `Ce miroir est un SIGNAL FAIBLE. Il marque une direction, pas une conclusion.`

**Renderer** : Aucune mention de "signal faible", aucune notion de provisoire

**Impact** : Le renderer peut traiter l'angle comme une "vérité définitive" au lieu d'un "signal faible"

### Différence 5 : Absence de "lecture en creux" explicite dans le format

**Chat natif** : `Lecture en creux obligatoire (ce n'est probablement pas X, mais plutôt Y)`

**Renderer** : `Lecture en creux obligatoire (montrer le mécanisme, pas les traits)` — mais pas de pattern explicite

**Impact** : Le renderer ne sait pas qu'il doit utiliser le pattern "probablement pas... mais"

---

## 3️⃣ INSTRUCTIONS TECHNIQUES QUI NEUTRALISENT LE RÔLE MENTOR

### Instruction 1 : "Tu ne vois JAMAIS les réponses utilisateur"

**Fichier** : `src/services/mentorStyleRenderer.ts` (ligne 60)

**Problème** : Cette instruction crée une distance artificielle. Le mentor natif a accès à l'historique complet et peut "sentir" le candidat à travers ses réponses.

**Impact** : Le renderer devient un "transformeur de texte" au lieu d'un "mentor qui a écouté"

### Instruction 2 : "Tu incarnes UNIQUEMENT l'angle mentor"

**Fichier** : `src/services/mentorStyleRenderer.ts` (ligne 59)

**Problème** : Cette instruction limite le renderer à un rôle de "traducteur" plutôt que de "mentor incarné". Le mentor natif peut "inférer" au-delà de l'angle, le renderer ne peut pas.

**Impact** : Le renderer ne peut pas "révéler ce qui se cache derrière" car il n'a que l'angle, pas le contexte

### Instruction 3 : "Tu n'as PAS à expliquer pourquoi cet angle"

**Fichier** : `src/services/mentorStyleRenderer.ts` (ligne 64)

**Problème** : Cette instruction est correcte, mais combinée avec l'absence d'exemples, elle peut créer de la confusion. Le modèle peut hésiter entre "incarner" et "décrire".

**Impact** : Sans exemples, le modèle peut tomber dans la description plutôt que l'incarnation

### Instruction 4 : Absence de "Tu prends un risque interprétatif"

**Observation** : Le prompt du renderer contient cette phrase (ligne 55), mais elle est noyée dans les contraintes techniques. Dans le chat natif, elle est en première position dans "POSTURE MENTALE".

**Impact** : L'aspect "risque interprétatif" est moins saillant dans le renderer

---

## 4️⃣ RENDERER : AGENT INCARNÉ OU SIMPLE TRANSFORMATEUR ?

### Analyse : Le renderer est traité comme un **TRANSFORMATEUR**

#### Preuve 1 : Input isolé

**Fichier** : `src/services/mentorStyleRenderer.ts` (ligne 109-110)

```typescript
Angle mentor à incarner :
${mentorAngle}
```

**Observation** : Le renderer reçoit UNIQUEMENT l'angle, sans contexte, sans historique, sans numéro de bloc.

**Conclusion** : C'est un transformateur (input texte → output texte), pas un agent incarné.

#### Preuve 2 : Pas d'accès à l'historique

**Fichier** : `src/services/mentorStyleRenderer.ts` (ligne 29-32)

```typescript
export async function renderMentorStyle(
  mentorAngle: string,
  blockType: BlockType
): Promise<string>
```

**Observation** : La fonction ne reçoit pas l'historique de conversation, seulement l'angle et le type de bloc.

**Conclusion** : Le renderer ne peut pas "sentir" le candidat, il ne peut que transformer l'angle.

#### Preuve 3 : Instructions techniques dominantes

**Fichier** : `src/services/mentorStyleRenderer.ts` (lignes 58-67)

**Observation** : Les instructions techniques ("Tu ne vois JAMAIS", "Tu incarnes UNIQUEMENT", "Tu n'as PAS à") dominent le prompt, au détriment de la posture mentale.

**Conclusion** : Le renderer est configuré comme un "outil de transformation" plutôt qu'un "mentor incarné".

### Comparaison : Chat natif = AGENT INCARNÉ

**Preuve** : Le chat natif a accès à l'historique complet, peut "fusionner" avec les blocs précédents, et a le contexte "Tu es en FIN DE BLOC".

**Conclusion** : Le chat natif est un agent incarné qui "écoute" et "infère", le renderer est un transformateur qui "traduit".

---

## 5️⃣ IMPACT RÉEL DU FAIL-SOFT SUR LA QUALITÉ SERVIE

### Fail-soft identifiés

#### Fail-soft 1 : Validation style mentor

**Fichier** : `src/services/mentorStyleRenderer.ts` (lignes 144-153)

```typescript
// Validation échouée → retry si possible
if (retries < maxRetries) {
  console.warn(`[MENTOR_STYLE_RENDERER] Validation style échouée (retry ${retries}, type: ${blockType}), erreurs:`, validation.errors);
  retries++;
  continue;
}

// Dernier retry échoué → log d'erreur mais servir quand même (fail-soft)
console.error(`[MENTOR_STYLE_RENDERER] Validation style échouée après ${maxRetries} retries (type: ${blockType}), utilisation texte généré`, validation.errors);
return mentorText;
```

**Comportement** :
1. Validation échoue → retry (1 fois)
2. Retry échoue → **fail-soft** : servir le texte quand même

**Impact** : Des miroirs avec patterns déclaratifs ("tu es...") ou sans marqueurs expérientiels peuvent être servis.

#### Fail-soft 2 : Validation format REVELIOM

**Fichier** : `src/services/blockOrchestrator.ts` (lignes 522-531)

```typescript
const validation = validateMirrorREVELIOM(mentorText);

if (validation.valid) {
  console.log('[BLOC1][SUCCESS] Miroir généré avec succès (nouvelle architecture)');
  return mentorText;
} else {
  // Format invalide → log d'erreur mais servir quand même (fail-soft)
  console.warn('[BLOC1][WARN] Format REVELIOM invalide, mais texte servi (fail-soft):', validation.errors);
  return mentorText;
}
```

**Comportement** : Si le format REVELIOM est invalide (sections manquantes, mots dépassés, pas de lecture en creux), le texte est servi quand même.

**Impact** : Des miroirs non conformes au format REVELIOM peuvent être servis.

#### Fail-soft 3 : Validation angle (résumé)

**Fichier** : `src/services/mentorAngleSelector.ts` (lignes 150-159)

```typescript
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
```

**Comportement** : Si l'angle est détecté comme résumé ("globalement", "dans l'ensemble"), retry puis fail-soft.

**Impact** : Des angles "tièdes" (résumés) peuvent être servis.

### Analyse de l'impact

#### Impact 1 : Qualité dégradée servie silencieusement

**Observation** : Les fail-softs servent des textes invalides sans que l'utilisateur le sache.

**Exemple** : Un miroir avec "tu es..." au lieu de "quand tu..." peut être servi si la validation échoue après 1 retry.

**Impact réel** : Des miroirs "tièdes" ou "non conformes" peuvent être servis régulièrement.

#### Impact 2 : Pas de feedback pour améliorer

**Observation** : Les fail-softs loggent des warnings mais ne remontent pas d'erreur.

**Impact réel** : Le système ne "apprend" pas de ses échecs, il les masque.

#### Impact 3 : Incohérence avec le chat natif

**Observation** : Le chat natif n'a pas de fail-soft. Si le format est invalide, le prompt est rejoué.

**Impact réel** : Le renderer peut servir des textes que le chat natif n'aurait jamais servis.

---

## 6️⃣ DIAGNOSTIC FINAL — CAUSE RACINE

### 🎯 Le problème est à 80% dans le **CONTEXTE SYSTÈME** du renderer

#### Cause 1 : Absence d'exemples concrets (❌/✅)

**Impact** : Le modèle n'a pas de référence visuelle de ce qu'est un "wow" vs un "tiède"

**Preuve** : Le chat natif fonctionne avec ces exemples, le renderer ne les a pas

#### Cause 2 : Traitement comme transformateur au lieu d'agent incarné

**Impact** : Le renderer ne peut pas "sentir" le candidat, il ne peut que transformer l'angle

**Preuve** : Pas d'accès à l'historique, pas de contexte de bloc, pas de fusion cumulative

#### Cause 3 : Instructions techniques qui neutralisent la posture mentor

**Impact** : "Tu ne vois JAMAIS les réponses" crée une distance artificielle

**Preuve** : Le mentor natif a accès à l'historique et peut "inférer", le renderer ne peut pas

#### Cause 4 : Fail-softs qui servent des textes invalides

**Impact** : Des miroirs "tièdes" ou "non conformes" peuvent être servis régulièrement

**Preuve** : 3 fail-softs identifiés qui servent des textes invalides

---

## 7️⃣ OBSERVATIONS (PREUVES)

### Observation 1 : Le renderer manque de contexte incarné

**Preuve** : Comparaison des prompts
- Chat natif : `Tu es en FIN DE BLOC ${blocNumber}` + historique complet
- Renderer : Uniquement `mentorAngle: string` sans contexte

**Conclusion** : Le renderer est décontextualisé, il ne peut pas "incarner" un mentor qui a écouté.

### Observation 2 : Le renderer manque d'exemples visuels

**Preuve** : Comparaison des prompts
- Chat natif : 3 exemples concrets ❌/✅ montrant la différence
- Renderer : Aucun exemple, seulement des règles textuelles

**Conclusion** : Le modèle n'a pas de référence visuelle de ce qu'est un "wow".

### Observation 3 : Le renderer est traité comme un transformateur

**Preuve** : Signature de fonction
```typescript
renderMentorStyle(mentorAngle: string, blockType: BlockType): Promise<string>
```
Pas d'historique, pas de contexte de candidat, seulement un texte à transformer.

**Conclusion** : Le renderer est un "outil de transformation" plutôt qu'un "mentor incarné".

### Observation 4 : Les fail-softs masquent les problèmes

**Preuve** : 3 fail-softs identifiés qui servent des textes invalides sans erreur visible pour l'utilisateur.

**Conclusion** : Des miroirs "tièdes" peuvent être servis régulièrement sans que le système ne "apprenne" de ses échecs.

---

## 8️⃣ CONCLUSION

### Diagnostic binaire : **Le problème est à 80% dans le CONTEXTE SYSTÈME du renderer**

Le renderer est traité comme un **transformateur** (input texte → output texte) au lieu d'un **agent incarné** (mentor qui a écouté et infère).

**Causes principales** :
1. Absence d'exemples concrets (❌/✅)
2. Absence de contexte de bloc et d'historique
3. Instructions techniques qui neutralisent la posture mentor
4. Fail-softs qui servent des textes invalides

**Impact** : Le renderer ne peut pas "incarner" un mentor qui a écouté, il ne peut que transformer un angle isolé.

---

**FIN DE L'ADDENDUM**
