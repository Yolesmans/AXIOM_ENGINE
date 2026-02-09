# 🔍 AUDIT STYLE MIROIRS — PROPOSITION AMÉLIORATION QUALITATIVE

**Date** : 2025-01-27  
**Type** : Audit + Proposition technique (sans implémentation)  
**Objectif** : Transformer style miroirs "diagnostic" → style "mentor incarné"

---

## 📋 AUDIT ÉTAT ACTUEL

### 1. Prompts miroirs actuels

**Fichier** : `src/engine/axiomExecutor.ts:1662-1712`

**Instructions style actuelles** :
- ✅ Format strict (20/25 mots, 3 sections)
- ✅ Lecture en creux obligatoire
- ✅ Interdiction synthèse/cohérence globale
- ❌ **Aucune instruction sur style narratif "mentor incarné"**
- ❌ **Aucune interdiction langage diagnostic**
- ❌ **Aucune instruction temporalité/expérientialité**

**Exemple prompt actuel** :
```
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
```

**Problème identifié** : Le prompt ne guide pas vers un style "mentor incarné". Il se contente de demander une "lecture en creux" et une "tension", mais ne précise pas le style d'énonciation.

---

### 2. Validation actuelle

**Fichier** : `src/services/validateMirrorReveliom.ts`

**Validations actuelles** :
- ✅ Sections 1️⃣ 2️⃣ 3️⃣ présentes
- ✅ Nombre de mots (20/25)
- ✅ Lecture en creux détectée
- ✅ Ton 2e personne vérifié
- ❌ **Aucune validation style "mentor incarné"**
- ❌ **Aucune validation langage expérientiel**
- ❌ **Aucune validation temporalité**

**Problème identifié** : La validation vérifie le format et le ton (2e personne), mais pas le style narratif.

---

### 3. Exemples de miroirs actuels (style diagnostic)

**Style actuel (à éviter)** :
```
❌ "Tu te motives en progressant et en te stabilisant, mais l'ennui te pousse à bâcler."
```

**Problèmes** :
- Langage diagnostic : "tu te motives", "te pousse"
- Pas de temporalité : présent générique
- Pas d'expérientialité : analyse externe
- Pas de présence mentor : pas de normalisation/nuance

---

## 🎯 OBJECTIF PRODUIT

### Style attendu (mentor incarné)

**Exemple cible** :
```
✅ "Quand tu avances et que tu sens que les choses se structurent, tu te sens porté.
Mais dès que ça devient trop lisse, trop répétitif, tu décroches… et tu peux aller trop vite, parfois contre toi-même."
```

**Caractéristiques** :
- ✅ Langage expérientiel : "quand tu", "dès que", "tu sens"
- ✅ Temporalité : "quand", "dès que", "parfois"
- ✅ Expérientialité : "tu sens porté", "tu décroches"
- ✅ Présence mentor : Nuance implicite ("parfois contre toi-même")

---

## 🔧 PROPOSITIONS TECHNIQUES

### Proposition 1 : Post-traitement LLM (RECOMMANDÉE)

**Principe** : Après génération du miroir, passer par un second appel LLM pour "humaniser" le style.

**Avantages** :
- ✅ **Aucune modification des prompts métiers** (prompts intangibles respectés)
- ✅ **Compatible avec validateMirrorREVELIOM** (validation après transformation)
- ✅ **Compatible avec parseMirrorSections** (parsing après transformation)
- ✅ **Réversible** (fonction désactivable facilement)
- ✅ **Testable isolément** (fonction dédiée)

**Inconvénients** :
- ⚠️ **Coût API doublé** (2 appels LLM par miroir)
- ⚠️ **Latence légèrement augmentée** (+1 appel)
- ⚠️ **Risque de dérive** (si transformation échoue, miroir original servi)

**Implémentation** :

**Fichier** : `src/services/mirrorNarrativeAdapter.ts` (nouveau)

```typescript
export async function adaptMirrorToMentorStyle(
  rawMirror: string,
  blocNumber: number
): Promise<string> {
  // Appel LLM pour transformer le style
  const completion = await callOpenAI({
    messages: [
      {
        role: 'system',
        content: `Tu es un mentor humain qui reformule des analyses pour les rendre plus incarnées et expérientielles.

RÈGLES DE TRANSFORMATION STRICTES :

1. INTERDICTIONS ABSOLUES (à remplacer) :
   - "tu es..." → remplacer par "quand tu..."
   - "tu cherches..." → remplacer par "il y a des moments où tu..."
   - "tu as tendance à..." → remplacer par "parfois tu..."
   - "tu te motives en..." → remplacer par "quand tu..., tu te sens..."

2. LANGAGE EXPÉRIENTIEL OBLIGATOIRE :
   - Utiliser "quand", "dès que", "il y a des moments où", "parfois"
   - Décrire une expérience vécue, pas un trait de personnalité
   - Utiliser "tu sens", "tu te sens", "on sent que"

3. TEMPORALITÉ OBLIGATOIRE :
   - Chaque section doit contenir au moins UNE notion de temps/variation
   - Exemples : "parfois", "dès que", "quand", "tant que", "à force de"

4. PRÉSENCE MENTOR (optionnelle mais recommandée) :
   - Ajouter une nuance, une normalisation, ou une reconnaissance
   - Exemples : "c'est très cohérent", "il n'y a rien d'anormal là-dedans", "beaucoup ressentent ça"

5. TENSION HUMAINE OBLIGATOIRE :
   - Maintenir la tension identifiée (stabilité ↔ ennui, cadre ↔ liberté, etc.)
   - Mais l'exprimer en termes d'expérience, pas de diagnostic

CONTRAINTES ABSOLUES :
- Conserver EXACTEMENT le format 3 sections (1️⃣ 2️⃣ 3️⃣)
- Conserver EXACTEMENT les limites de mots (20/25)
- Conserver EXACTEMENT la section 3️⃣ (validation ouverte)
- Conserver la lecture en creux
- Ne pas ajouter de synthèse ou cohérence globale

Miroir à transformer :
${rawMirror}

Transforme ce miroir en style mentor incarné, en respectant strictement les contraintes.`
      }
    ]
  });

  return completion.trim();
}
```

**Intégration** : `src/engine/axiomExecutor.ts:1801-1858`

```typescript
// Après validation REVELIOM réussie
if (validation.valid && isMirror) {
  // Post-traitement style mentor
  try {
    const adaptedMirror = await adaptMirrorToMentorStyle(cleanMirrorText, blocNumber);
    
    // Re-valider le miroir adapté (format doit rester conforme)
    const adaptedValidation = validateMirrorREVELIOM(adaptedMirror);
    
    if (adaptedValidation.valid) {
      cleanMirrorText = adaptedMirror;
      aiText = adaptedMirror;
      console.log(`[AXIOM_EXECUTOR] Miroir BLOC ${blocNumber} adapté au style mentor`);
    } else {
      // Si adaptation invalide, utiliser miroir original
      console.warn(`[AXIOM_EXECUTOR] Adaptation miroir BLOC ${blocNumber} invalide, utilisation original`, adaptedValidation.errors);
      cleanMirrorText = mirror;
      aiText = mirror;
    }
  } catch (e) {
    // Si erreur adaptation, utiliser miroir original
    console.error(`[AXIOM_EXECUTOR] Erreur adaptation miroir BLOC ${blocNumber}`, e);
    cleanMirrorText = mirror;
    aiText = mirror;
  }
}
```

**Effort estimé** : 4-6 heures
- Création fonction `adaptMirrorToMentorStyle` : 2h
- Intégration dans `axiomExecutor` : 1h
- Tests + ajustements : 2-3h

**Risques** :
- ⚠️ Coût API doublé (mitigé : uniquement pour miroirs, pas questions)
- ⚠️ Latence +200-500ms (acceptable pour miroirs)
- ⚠️ Dérive possible (mitigé : fail-soft vers miroir original)

---

### Proposition 2 : Préambule style dans prompt (ALTERNATIVE)

**Principe** : Ajouter un préambule "style mentor" dans le prompt miroir, sans modifier le prompt métier.

**Avantages** :
- ✅ **Un seul appel LLM** (coût/latence optimaux)
- ✅ **Style guidé dès la génération** (pas de post-traitement)

**Inconvénients** :
- ⚠️ **Modification du prompt miroir** (mais pas du prompt métier)
- ⚠️ **Risque de conflit** avec instructions format strictes
- ⚠️ **Moins réversible** (modification prompt)

**Implémentation** :

**Fichier** : `src/engine/axiomExecutor.ts:1662-1712`

```typescript
content: shouldForceMirror
  ? `RÈGLE ABSOLUE AXIOM — MIROIR INTERPRÉTATIF ACTIF (REVELIOM)

⚠️ STYLE MENTOR INCARNÉ (OBLIGATOIRE)

Tu dois produire un miroir qui donne l'impression qu'un mentor humain parle, pas un diagnostic externe.

INTERDICTIONS ABSOLUES :
- "tu es..." → utiliser "quand tu..."
- "tu cherches..." → utiliser "il y a des moments où tu..."
- "tu as tendance à..." → utiliser "parfois tu..."
- "tu te motives en..." → utiliser "quand tu..., tu te sens..."

LANGAGE EXPÉRIENTIEL OBLIGATOIRE :
- Utiliser "quand", "dès que", "il y a des moments où", "parfois"
- Décrire une expérience vécue, pas un trait de personnalité
- Utiliser "tu sens", "tu te sens", "on sent que"

TEMPORALITÉ OBLIGATOIRE :
- Chaque section doit contenir au moins UNE notion de temps/variation
- Exemples : "parfois", "dès que", "quand", "tant que", "à force de"

Tu es en FIN DE BLOC ${blocNumber}.
[... reste du prompt inchangé ...]
```

**Effort estimé** : 2-3 heures
- Modification prompt : 1h
- Tests + ajustements : 1-2h

**Risques** :
- ⚠️ Conflit possible avec instructions format strictes
- ⚠️ Moins réversible (modification prompt)

---

## 📊 COMPARAISON DES APPROCHES

| Critère | Proposition 1 (Post-traitement) | Proposition 2 (Préambule) |
|---------|--------------------------------|---------------------------|
| **Modification prompts métiers** | ❌ Aucune | ⚠️ Préambule ajouté |
| **Coût API** | ⚠️ Doublé (2 appels) | ✅ Simple (1 appel) |
| **Latence** | ⚠️ +200-500ms | ✅ Optimale |
| **Réversibilité** | ✅ Facile (fonction désactivable) | ⚠️ Moins réversible |
| **Testabilité** | ✅ Isolée (fonction dédiée) | ⚠️ Intégrée au prompt |
| **Risque dérive** | ⚠️ Fail-soft vers original | ⚠️ Pas de fallback |
| **Effort** | 4-6h | 2-3h |

---

## 🎯 RECOMMANDATION

**Proposition 1 (Post-traitement LLM)** est recommandée car :
1. ✅ **Aucune modification des prompts métiers** (contrainte absolue respectée)
2. ✅ **Réversible et testable** (fonction isolée)
3. ✅ **Fail-soft** (si adaptation échoue, miroir original servi)
4. ✅ **Impact qualité majeur** (transformation ciblée)

**Proposition 2 (Préambule)** est une alternative si :
- Coût/latence critiques
- Acceptation de modification prompt (préambule uniquement)

---

## 🔍 VALIDATION ATTENDUE

### Critères GO/NO-GO

**Un miroir est VALIDÉ si** :
- ✅ Il ne peut pas être confondu avec un rapport RH
- ✅ Il donne l'impression que "quelqu'un a vraiment compris"
- ✅ Il pourrait être lu à voix haute sans gêne
- ✅ Il crée une réaction du type : "oui… c'est exactement ça"

**Un miroir est REFUSÉ si** :
- ❌ Il ressemble à une lecture de réponses
- ❌ Il pourrait s'appliquer à n'importe qui
- ❌ Il est froidement descriptif

### Tests recommandés

1. **Test transformation** : Générer 10 miroirs, vérifier style avant/après
2. **Test validation** : Vérifier que miroirs adaptés passent `validateMirrorREVELIOM`
3. **Test parsing** : Vérifier que miroirs adaptés passent `parseMirrorSections`
4. **Test affichage** : Vérifier affichage progressif fonctionne
5. **Test qualité** : Test manuel (ton mentor perceptible ?)

---

## 📝 NOTES TECHNIQUES

### Compatibilité

**Proposition 1** :
- ✅ Compatible `validateMirrorREVELIOM` (validation après transformation)
- ✅ Compatible `parseMirrorSections` (parsing après transformation)
- ✅ Compatible affichage progressif (sections 1️⃣ 2️⃣ 3️⃣ conservées)
- ✅ Compatible FSM (aucune modification d'états/transitions)

**Proposition 2** :
- ✅ Compatible `validateMirrorREVELIOM` (validation après génération)
- ✅ Compatible `parseMirrorSections` (parsing après génération)
- ✅ Compatible affichage progressif (sections 1️⃣ 2️⃣ 3️⃣ conservées)
- ✅ Compatible FSM (aucune modification d'états/transitions)

### Coût estimé

**Proposition 1** :
- Coût par miroir : ~2x (2 appels LLM)
- Impact global : Modéré (miroirs uniquement, pas questions)
- Estimation : +20-30% coût total (si 10 miroirs par parcours)

**Proposition 2** :
- Coût par miroir : Inchangé (1 appel LLM)
- Impact global : Aucun

---

## ✅ CONCLUSION

**Recommandation** : **Proposition 1 (Post-traitement LLM)**

**Justification** :
- Respecte contrainte absolue (prompts métiers intangibles)
- Réversible et testable
- Fail-soft (miroir original si adaptation échoue)
- Impact qualité majeur attendu

**Effort** : 4-6 heures

**Risques** : Faibles (fail-soft, réversible)

**Attente validation** : Avant implémentation

---

**FIN DE L'AUDIT**
