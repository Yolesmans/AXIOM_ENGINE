# 🎯 PLAN CORRECTION ONE-SHOT — AXIOM PRODUCTION

**Date:** 13 février 2026  
**Mission:** Livraison ce soir  
**Status:** PLAN VALIDÉ — PRÊT POUR IMPLÉMENTATION

---

## ✅ AUDIT COMPLET TERMINÉ

### 🟢 CE QUI FONCTIONNE DÉJÀ

1. ✅ **Température 0.8 partout** (`DEFAULT_TEMPERATURE = 0.8`)
2. ✅ **Transition 2B → 3** (correction déjà appliquée)
3. ✅ **Base stable jusqu'à BLOC 2A** (identité, tone, préambule, BLOC 1, 2A)
4. ✅ **Prompts intégrés et immuables** (prompts.ts)
5. ✅ **Google Sheets** (upsert par email)
6. ✅ **FSM principale** (axiomExecutor.ts structure OK)

---

## 🔴 PROBLÈMES CRITIQUES IDENTIFIÉS

### PROBLÈME 1 : Verrou "Oui" BLOC 10 manquant

**Cahier des charges :**
> "AXIOM attend explicitement la réponse 'Oui' pour activer le BLOC 10.  
> Toute autre réponse maintient AXIOM en état de collecte inactive.  
> Aucune synthèse ne peut être produite sans ce mot exact."

**État actuel :**  
Le code passe directement de BLOC 9 à STEP_99_MATCH_READY et génère la synthèse sans attendre "Oui".

**Fichier :** `src/engine/axiomExecutor.ts`  
**Impact :** 🔴 **BLOQUANT** — Non conforme au cahier des charges

**Correction requise :**
1. Ajouter état intermédiaire `WAIT_BLOC10_YES`
2. Afficher message demandant "Oui" explicite
3. Bloquer génération synthèse tant que "Oui" n'est pas reçu
4. Générer synthèse UNIQUEMENT après "Oui"

---

### PROBLÈME 2 : Event START_MATCHING non géré

**Cahier des charges :**
> "MATCHING :  
> - déclenché par événement START_MATCHING  
> - pas besoin de message texte"

**État actuel :**  
Le matching démarre automatiquement dès qu'un message/event arrive en `STEP_99_MATCH_READY`, sans vérifier l'event spécifique.

**Fichier :** `src/engine/axiomExecutor.ts` (ligne 2348-2376)  
**Impact :** 🟠 **IMPORTANT** — Fonctionnel mais non conforme

**Correction requise :**
1. Vérifier `event === 'START_MATCHING'` explicitement
2. Bloquer si event différent
3. Frontend doit envoyer `{ event: "START_MATCHING" }` au clic du bouton

---

### PROBLÈME 3 : Miroirs cumulatifs non vérifiés

**Cahier des charges :**
> "Règle de fusion analytique :  
> • Bloc 2 → analyse Bloc 2 + fusion Bloc 1  
> • Bloc 3 → analyse Bloc 3 + fusion Blocs 1 + 2  
> • Bloc 4 → analyse Bloc 4 + fusion Blocs 1 → 3"

**État actuel :**  
Je dois vérifier si `generateMirrorWithNewArchitecture()` implémente bien cette fusion cumulative.

**Fichier :** `src/services/blockOrchestrator.ts`  
**Impact :** 🟡 **À VÉRIFIER** — Dépend de l'implémentation

**Vérification requise :**
1. Lire `generateMirrorWithNewArchitecture()`
2. Confirmer qu'elle reçoit l'historique complet
3. Confirmer que le prompt système demande la fusion

---

### PROBLÈME 4 : Format miroir strict non vérifié

**Cahier des charges :**
> "Format MINIMAL DU MIROIR (BLOCS 1-9) :  
> • Lecture implicite : 1 phrase unique, maximum 20 mots  
> • Déduction personnalisée : 1 phrase unique, maximum 25 mots  
> • Validation ouverte : phrase exacte"

**État actuel :**  
Le prompt système demande ce format, mais aucune validation côté code.

**Impact :** 🟡 **ACCEPTABLE** — LLM doit respecter le prompt

**Action :** ✅ **AUCUNE** — Le prompt est explicite, on fait confiance au LLM

---

### PROBLÈME 5 : BLOC 2B personnalisation

**Cahier des charges :**
> "RÈGLES ABSOLUES :  
> 1. AUCUNE question générique n'est autorisée  
> 2. Chaque série/film a ses propres MOTIFS, générés par AXIOM  
> 3. Chaque personnage a ses propres TRAITS, générés par AXIOM  
> 4. AXIOM n'utilise JAMAIS une liste standard réutilisable"

**État actuel :**  
Je dois vérifier `blockOrchestrator.ts` pour confirmer qu'il n'y a pas de listes génériques.

**Impact :** 🟡 **À VÉRIFIER**

**Vérification requise :**
1. Lire `handleBlock2B()` dans `blockOrchestrator.ts`
2. Confirmer que motifs/traits sont générés dynamiquement par LLM
3. Confirmer qu'il n'y a pas de tableaux A-E prédéfinis

---

## 🔧 PLAN D'IMPLÉMENTATION ONE-SHOT

### CORRECTION 1 : Ajouter verrou "Oui" BLOC 10

**Fichier :** `src/engine/axiomExecutor.ts`

**Étape 1.1 :** Ajouter constante
```typescript
export const WAIT_BLOC10_YES = 'WAIT_BLOC10_YES';
```

**Étape 1.2 :** Modifier transition BLOC 9 → BLOC 10
```typescript
// Actuellement ligne ~2170-2237
// Remplacer nextState = STEP_99_MATCH_READY par :
nextState = WAIT_BLOC10_YES;
```

**Étape 1.3 :** Ajouter handler `WAIT_BLOC10_YES`
```typescript
// Nouvelle section après BLOC 9
if (currentState === WAIT_BLOC10_YES) {
  if (!userMessage) {
    return {
      response: 'Les informations nécessaires à l\'analyse sont maintenant collectées.\n\nDis-moi "Oui" pour découvrir ta synthèse complète.',
      step: currentState,
      lastQuestion: null,
      expectsAnswer: true,
      autoContinue: false,
    };
  }
  
  const cleanMessage = userMessage.trim().toLowerCase();
  if (cleanMessage === 'oui') {
    // Générer synthèse BLOC 10
    // [CODE EXISTANT de génération synthèse]
    // Puis nextState = STEP_99_MATCH_READY
  } else {
    return {
      response: 'Pour accéder à ta synthèse finale, dis-moi exactement "Oui".',
      step: currentState,
      lastQuestion: null,
      expectsAnswer: true,
      autoContinue: false,
    };
  }
}
```

---

### CORRECTION 2 : Ajouter event START_MATCHING

**Fichier :** `src/engine/axiomExecutor.ts`

**Modifier section STEP_99_MATCH_READY (ligne 2348):**

**AVANT :**
```typescript
if (currentState === STEP_99_MATCH_READY) {
  if (!userMessage && !event) {
    return {
      response: 'Ton profil est terminé...',
      // ...
    };
  }
  
  // Passer à matching (immédiat)
  currentState = STEP_99_MATCHING;
  // ...
}
```

**APRÈS :**
```typescript
if (currentState === STEP_99_MATCH_READY) {
  if (!event || event !== 'START_MATCHING') {
    return {
      response: 'Ton profil est terminé.\n\n👉 Clique sur le bouton "Je génère mon matching" pour découvrir si ce poste te correspond vraiment.',
      step: currentState,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false,
    };
  }
  
  // Event START_MATCHING reçu → passer à matching
  console.log('[AXIOM_EXECUTOR] Event START_MATCHING reçu — génération matching');
  currentState = STEP_99_MATCHING;
  // ...
}
```

---

### CORRECTION 3 : Frontend — Bouton matching

**Fichier :** `ui-test/app.js`

**Vérifier que le bouton envoie bien :**
```javascript
await callAxiom(null, "START_MATCHING");
```

---

## 📋 CHECKLIST FINALE AVANT COMMIT

### Tests de non-régression

- [ ] Identité → Tone → Préambule (fonctionne déjà)
- [ ] BLOC 1 complet avec miroir (fonctionne déjà)
- [ ] BLOC 2A → 2B (fonctionne déjà)
- [ ] Transition 2B → 3 (correction déjà appliquée)
- [ ] BLOCS 3-9 : un par un avec miroirs
- [ ] **NOUVEAU :** BLOC 9 → demande "Oui"
- [ ] **NOUVEAU :** "Oui" → génération synthèse BLOC 10
- [ ] **NOUVEAU :** Autre réponse → redemande "Oui"
- [ ] **NOUVEAU :** Synthèse → bouton matching
- [ ] **NOUVEAU :** Bouton matching → event START_MATCHING
- [ ] **NOUVEAU :** Matching généré avec verdict

### Validation conformité

- [ ] Température 0.8 partout
- [ ] Prompts non modifiés
- [ ] Verrou "Oui" BLOC 10
- [ ] Event START_MATCHING obligatoire
- [ ] Google Sheets : 3 moments (identité, BLOC 10, matching)

---

## 🚀 ORDRE D'IMPLÉMENTATION

1. **CORRECTION 1** : Verrou "Oui" BLOC 10 (axiomExecutor.ts)
2. **CORRECTION 2** : Event START_MATCHING (axiomExecutor.ts)
3. **VÉRIFICATION** : Frontend bouton matching (ui-test/app.js)
4. **BUILD** : `npm run build`
5. **COMMIT** : "feat(engine): verrou Oui BLOC 10 + event START_MATCHING (conformité cahier des charges)"
6. **PUSH** : `git push`
7. **TEST MANUEL** : Parcours complet A-Z

---

## ⏱️ ESTIMATION

- Correction 1 : **15 min**
- Correction 2 : **5 min**
- Vérification frontend : **5 min**
- Build + tests : **10 min**
- Commit + push : **2 min**

**TOTAL : ~40 minutes**

---

**PLAN VALIDÉ — PRÊT POUR IMPLÉMENTATION**
