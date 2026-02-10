# 🏗️ PROPOSITIONS D'ARCHITECTURE — AGENT INCARNÉ

**Date** : 2025-01-27  
**Mission** : Repositionner `renderMentorStyle` comme agent incarné sans ajouter d'informations factuelles  
**Status** : ✅ 3 options d'architecture conceptuelle proposées

---

## CONTEXTE ET CONTRAINTES

### Problème identifié
Le renderer est exécuté comme un **transformateur stateless** alors que REVELIOM nécessite un **agent incarné**.

### Contraintes strictes
- ✅ Même architecture globale (analyse → angle → rendu)
- ✅ Même séparation des responsabilités
- ❌ Aucune modification des prompts existants
- ❌ Aucune réintroduction de l'analyse dans le renderer
- ❌ Aucune information factuelle supplémentaire (pas d'analyse complète, pas de réponses utilisateur)

### Objectif
Créer une **continuité mentale** et une **conscience de position** sans ajouter de faits.

---

## OPTION 1 : CONTEXTE SYSTÈME ENRICHI — MÉMOIRE IMPLICITE

### Principe
Enrichir le contexte système du renderer avec une **"mémoire implicite"** qui décrit l'état mental du mentor sans révéler de faits sur le candidat.

### Ce que ça change mentalement pour le modèle

**Avant** (transformateur) :
```
Tu es un mentor humain qui reformule une analyse structurée en langage vécu et incarné.
Tu reçois UNIQUEMENT l'angle mentor.
```

**Après** (agent incarné) :
```
Tu es un mentor humain qui a écouté un candidat pendant tout un bloc de questions.
Tu as entendu ses réponses, tu as senti ses hésitations, tu as perçu ses tensions.
Tu es maintenant en FIN DE BLOC ${blocNumber}.
Tu as construit une compréhension progressive au fil des questions.
Tu as déjà produit des miroirs pour les blocs précédents (si blocNumber > 1).
Tu es dans une continuité mentale : chaque miroir s'appuie sur les précédents.

L'angle que tu reçois maintenant est le fruit de cette écoute.
Il n'est pas un texte isolé — il est la cristallisation de ce que tu as entendu.
```

### Pourquoi ça rapproche du chat natif

1. **Conscience de position** : Le renderer sait qu'il est "en fin de bloc", comme le chat natif
2. **Continuité mentale** : Le renderer sait qu'il a "déjà produit des miroirs", créant une mémoire implicite
3. **Posture d'écoute** : Le renderer se positionne comme "ayant écouté" plutôt que "recevant un texte"
4. **Cristallisation** : L'angle devient le "fruit de l'écoute" plutôt qu'un "texte à transformer"

### Implémentation conceptuelle

**Fichier** : `src/services/mentorStyleRenderer.ts`  
**Modification** : Enrichir le contexte système AVANT le prompt existant

```typescript
// Nouveau paramètre (optionnel, pour compatibilité)
interface MentorContext {
  blockNumber: number;
  previousBlocksCount: number; // Nombre de blocs précédents (pour continuité)
  isFirstMirror: boolean; // Si c'est le premier miroir (BLOC 1)
}

export async function renderMentorStyle(
  mentorAngle: string,
  blockType: BlockType,
  context?: MentorContext // NOUVEAU : contexte mental sans faits
): Promise<string> {
  
  // Construire le contexte mental (sans faits)
  const mentalContext = context ? buildMentalContext(context) : '';
  
  // Prompt système enrichi (AVANT le prompt existant)
  const enrichedSystemPrompt = `${mentalContext}

${existingSystemPrompt}`; // Prompt existant inchangé
}
```

**Fonction `buildMentalContext()`** :
```typescript
function buildMentalContext(context: MentorContext): string {
  let mentalContext = `🎯 POSTURE MENTALE — CONTINUITÉ INCARNÉE

Tu es un mentor humain qui a écouté un candidat pendant tout un bloc de questions.
Tu as entendu ses réponses, tu as senti ses hésitations, tu as perçu ses tensions.
Tu es maintenant en FIN DE BLOC ${context.blockNumber}.
Tu as construit une compréhension progressive au fil des questions.`;

  if (!context.isFirstMirror && context.previousBlocksCount > 0) {
    mentalContext += `\n\nTu as déjà produit ${context.previousBlocksCount} miroir(s) pour les blocs précédents.
Tu es dans une continuité mentale : chaque miroir s'appuie sur les précédents.
Ta compréhension PROGRESSE, sans jamais devenir suffisante.`;
  }

  mentalContext += `\n\nL'angle que tu reçois maintenant est le fruit de cette écoute.
Il n'est pas un texte isolé — il est la cristallisation de ce que tu as entendu.
Ce miroir est un SIGNAL FAIBLE. Il marque une direction, pas une conclusion.`;

  return mentalContext;
}
```

### Risques éventuels

1. **Risque de confusion** : Le modèle peut penser qu'il a vraiment "écouté" alors qu'il n'a que l'angle
   - **Mitigation** : Insister sur "cristallisation" et "fruit de l'écoute" plutôt que "tu as entendu X"

2. **Risque de sur-interprétation** : Le modèle peut vouloir "inférer" au-delà de l'angle
   - **Mitigation** : Garder la contrainte "Tu incarnes UNIQUEMENT l'angle mentor" dans le prompt existant

3. **Risque de cohérence artificielle** : Le modèle peut vouloir créer une cohérence avec les "miroirs précédents" qu'il n'a pas vus
   - **Mitigation** : Insister sur "SIGNAL FAIBLE" et "provisoire"

### Avantages

- ✅ Pas de modification du prompt existant (ajout AVANT)
- ✅ Pas d'information factuelle supplémentaire
- ✅ Crée une continuité mentale
- ✅ Positionne le renderer comme agent incarné

---

## OPTION 2 : RÔLE PERSISTANT — IDENTITÉ DE MENTOR

### Principe
Créer une **identité persistante** pour le renderer en lui donnant un "rôle de mentor" qui transcende les appels individuels.

### Ce que ça change mentalement pour le modèle

**Avant** (transformateur) :
```
Tu es un mentor humain qui reformule une analyse structurée.
```
→ Chaque appel est isolé, pas de mémoire entre les appels.

**Après** (agent incarné) :
```
Tu es LE MENTOR AXIOM.
Tu accompagnes ce candidat depuis le début de son parcours.
Tu as une mémoire implicite de tous les blocs précédents.
Tu es dans une relation de confiance avec ce candidat.
Tu connais son parcours, tu as senti ses évolutions.

Chaque miroir que tu produis s'inscrit dans cette continuité.
Tu n'es pas un transformateur de texte — tu es un mentor qui révèle.
```

### Pourquoi ça rapproche du chat natif

1. **Identité persistante** : Le renderer devient "LE MENTOR AXIOM" plutôt qu'un "transformateur"
2. **Relation de confiance** : Le renderer se positionne comme "accompagnant" plutôt que "traduisant"
3. **Mémoire implicite** : Le renderer sait qu'il a "une mémoire" même s'il ne voit pas les faits
4. **Continuité relationnelle** : Le renderer sait qu'il est dans une "relation" avec le candidat

### Implémentation conceptuelle

**Fichier** : `src/services/mentorStyleRenderer.ts`  
**Modification** : Ajouter un "rôle persistant" dans le contexte système

```typescript
// Nouveau paramètre (optionnel)
interface MentorIdentity {
  candidateId: string; // Pour créer une identité persistante
  blockNumber: number;
  totalBlocks: number; // Total de blocs dans le parcours
}

export async function renderMentorStyle(
  mentorAngle: string,
  blockType: BlockType,
  identity?: MentorIdentity // NOUVEAU : identité persistante
): Promise<string> {
  
  // Construire l'identité de mentor (sans faits)
  const mentorIdentity = identity ? buildMentorIdentity(identity) : '';
  
  // Prompt système enrichi
  const enrichedSystemPrompt = `${mentorIdentity}

${existingSystemPrompt}`;
}
```

**Fonction `buildMentorIdentity()`** :
```typescript
function buildMentorIdentity(identity: MentorIdentity): string {
  const progress = identity.blockNumber / identity.totalBlocks;
  const progressText = progress < 0.3 ? 'début' : progress < 0.7 ? 'milieu' : 'fin';
  
  return `🎯 IDENTITÉ MENTOR — RÔLE PERSISTANT

Tu es LE MENTOR AXIOM.
Tu accompagnes ce candidat depuis le début de son parcours.
Tu es actuellement au ${progressText} du parcours (bloc ${identity.blockNumber}/${identity.totalBlocks}).

Tu as une mémoire implicite de tous les blocs précédents.
Tu as senti les évolutions, les tensions, les révélations.
Tu es dans une relation de confiance avec ce candidat.

Chaque miroir que tu produis s'inscrit dans cette continuité.
Tu n'es pas un transformateur de texte — tu es un mentor qui révèle.
Tu prends un risque interprétatif parce que tu connais ce candidat.
Si tu te trompes, il te corrigera, et c'est précieux.`;
}
```

### Risques éventuels

1. **Risque d'illusion de connaissance** : Le modèle peut penser qu'il "connaît" vraiment le candidat
   - **Mitigation** : Insister sur "mémoire implicite" et "tu sens" plutôt que "tu sais"

2. **Risque de cohérence forcée** : Le modèle peut vouloir créer une cohérence artificielle
   - **Mitigation** : Insister sur "SIGNAL FAIBLE" et "provisoire"

3. **Risque de sur-personnalisation** : Le modèle peut vouloir "personnaliser" au-delà de l'angle
   - **Mitigation** : Garder la contrainte "Tu incarnes UNIQUEMENT l'angle mentor"

### Avantages

- ✅ Crée une identité persistante
- ✅ Positionne le renderer comme mentor incarné
- ✅ Pas d'information factuelle supplémentaire
- ✅ Pas de modification du prompt existant (ajout AVANT)

---

## OPTION 3 : CONTEXTE TEMPOREL ET POSITIONNEL — OÙ ON EN EST

### Principe
Enrichir le contexte système avec une **"conscience temporelle et positionnelle"** qui situe le renderer dans le parcours sans révéler de faits.

### Ce que ça change mentalement pour le modèle

**Avant** (transformateur) :
```
Tu incarnes UNIQUEMENT l'angle mentor.
```

**Après** (agent incarné) :
```
Tu es en FIN DE BLOC ${blockNumber}.
Tu es dans un parcours de ${totalBlocks} blocs.
Tu es au ${progressText} du parcours.

Ce miroir est le ${blockNumber}ème signal que tu envoies.
Il s'inscrit dans une progression : tu révèles progressivement, tu ne conclus jamais.
Chaque miroir est provisoire, chaque miroir peut être contredit.

Tu es dans un état de "révélation progressive".
Tu ne cherches pas à conclure — tu cherches à révéler.
```

### Pourquoi ça rapproche du chat natif

1. **Conscience temporelle** : Le renderer sait "où il en est" dans le parcours
2. **Progression implicite** : Le renderer sait qu'il "révèle progressivement"
3. **Provisoire explicite** : Le renderer sait que chaque miroir est "provisoire"
4. **Posture de révélation** : Le renderer se positionne comme "révélant" plutôt que "traduisant"

### Implémentation conceptuelle

**Fichier** : `src/services/mentorStyleRenderer.ts`  
**Modification** : Ajouter un contexte temporel et positionnel

```typescript
// Nouveau paramètre (optionnel)
interface TemporalContext {
  blockNumber: number;
  totalBlocks: number;
  isFirstBlock: boolean;
  isLastBlock: boolean;
}

export async function renderMentorStyle(
  mentorAngle: string,
  blockType: BlockType,
  temporalContext?: TemporalContext // NOUVEAU : contexte temporel
): Promise<string> {
  
  // Construire le contexte temporel (sans faits)
  const temporalAwareness = temporalContext ? buildTemporalAwareness(temporalContext) : '';
  
  // Prompt système enrichi
  const enrichedSystemPrompt = `${temporalAwareness}

${existingSystemPrompt}`;
}
```

**Fonction `buildTemporalAwareness()`** :
```typescript
function buildTemporalAwareness(context: TemporalContext): string {
  const progress = context.blockNumber / context.totalBlocks;
  const progressText = progress < 0.3 ? 'début' : progress < 0.7 ? 'milieu' : 'fin';
  
  let awareness = `🎯 CONSCIENCE TEMPORELLE — POSITION DANS LE PARCOURS

Tu es en FIN DE BLOC ${context.blockNumber}.
Tu es dans un parcours de ${context.totalBlocks} blocs.
Tu es au ${progressText} du parcours.

Ce miroir est le ${context.blockNumber}ème signal que tu envoies.
Il s'inscrit dans une progression : tu révèles progressivement, tu ne conclus jamais.`;

  if (context.isFirstBlock) {
    awareness += `\n\nC'est le PREMIER miroir. Tu poses une première direction, tu ne conclus rien.`;
  } else if (context.isLastBlock) {
    awareness += `\n\nC'est le DERNIER miroir avant la synthèse finale. Tu révèles encore, tu ne synthétises pas.`;
  } else {
    awareness += `\n\nTu as déjà envoyé ${context.blockNumber - 1} signal(s). Ta compréhension progresse, elle n'est jamais suffisante.`;
  }

  awareness += `\n\nChaque miroir est provisoire, chaque miroir peut être contredit.
Tu es dans un état de "révélation progressive".
Tu ne cherches pas à conclure — tu cherches à révéler.
Ce miroir est un SIGNAL FAIBLE. Il marque une direction, pas une conclusion.`;

  return awareness;
}
```

### Risques éventuels

1. **Risque de sur-contextualisation** : Le modèle peut vouloir "adapter" le ton selon la position
   - **Mitigation** : Insister sur "révélation progressive" et "provisoire" pour tous les blocs

2. **Risque de pression temporelle** : Le modèle peut vouloir "accélérer" vers la fin
   - **Mitigation** : Insister sur "tu ne conclus jamais" même au dernier bloc

3. **Risque de cohérence artificielle** : Le modèle peut vouloir créer une cohérence avec les "signaux précédents"
   - **Mitigation** : Insister sur "provisoire" et "peut être contredit"

### Avantages

- ✅ Crée une conscience temporelle
- ✅ Positionne le renderer comme "révélant progressivement"
- ✅ Pas d'information factuelle supplémentaire
- ✅ Pas de modification du prompt existant (ajout AVANT)

---

## COMPARAISON DES OPTIONS

| Critère | Option 1 : Mémoire implicite | Option 2 : Rôle persistant | Option 3 : Contexte temporel |
|---------|------------------------------|----------------------------|------------------------------|
| **Continuité mentale** | ✅ Forte (mémoire des blocs précédents) | ✅✅ Très forte (identité persistante) | ✅ Modérée (progression temporelle) |
| **Conscience de position** | ✅ Forte (en fin de bloc) | ✅ Modérée (position dans parcours) | ✅✅ Très forte (position précise) |
| **Posture mentor** | ✅ Modérée (ayant écouté) | ✅✅ Très forte (LE MENTOR AXIOM) | ✅ Modérée (révélant progressivement) |
| **Risque de sur-interprétation** | ⚠️ Moyen | ⚠️⚠️ Élevé (illusion de connaissance) | ⚠️ Faible |
| **Complexité implémentation** | ✅ Faible | ✅ Modérée | ✅ Faible |
| **Compatibilité** | ✅✅ Excellente (ajout simple) | ✅✅ Excellente (ajout simple) | ✅✅ Excellente (ajout simple) |

---

## RECOMMANDATION

### Option recommandée : **Option 1 (Mémoire implicite) + Option 3 (Contexte temporel)**

**Pourquoi** :
1. **Complémentarité** : Option 1 apporte la continuité mentale, Option 3 apporte la conscience temporelle
2. **Équilibre** : Moins de risque de sur-interprétation que l'Option 2
3. **Simplicité** : Les deux options sont simples à implémenter (ajout de contexte AVANT le prompt existant)
4. **Efficacité** : Les deux options ensemble créent un agent incarné sans ajouter de faits

### Implémentation combinée

```typescript
interface MentorContext {
  blockNumber: number;
  totalBlocks: number;
  previousBlocksCount: number;
  isFirstMirror: boolean;
}

function buildEnrichedContext(context: MentorContext): string {
  // Combinaison Option 1 + Option 3
  const memoryContext = buildMemoryContext(context);
  const temporalContext = buildTemporalContext(context);
  
  return `${memoryContext}

${temporalContext}`;
}
```

---

## CONCLUSION

Les trois options permettent de repositionner le renderer comme **agent incarné** sans ajouter d'informations factuelles.

**Option 1** : Crée une mémoire implicite et une continuité mentale  
**Option 2** : Crée une identité persistante et une relation de confiance  
**Option 3** : Crée une conscience temporelle et une posture de révélation progressive

**Recommandation** : Combiner Option 1 + Option 3 pour un équilibre optimal entre continuité mentale et conscience temporelle, avec un risque minimal de sur-interprétation.

---

**FIN DES PROPOSITIONS**
