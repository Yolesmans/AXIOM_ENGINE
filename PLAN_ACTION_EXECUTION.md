# 📋 PLAN D'ACTION D'EXÉCUTION — AXIOM / REVELIOM

**Date** : 2025-01-27  
**Niveau** : Senior / Lead  
**Objectif** : Corrections minimales et ciblées pour conformité REVELIOM  
**Principe** : Le code se conforme aux prompts, pas l'inverse

---

## 🎯 ORDRE STRICT D'EXÉCUTION

**RÈGLE ABSOLUE** : Un lot = un commit. Pas de bundle. Tests après chaque lot.

**Lots** :
1. **LOT 1** : Validation miroirs (C1-C4) — **BLOQUANT**
2. **LOT 2** : Validations sorties (profil final + matching) — **BLOQUANT**
3. **LOT 3** : Streaming (S1-S4 + tests TS1-TS6) — **GO-BLOCKER**
4. **LOT 4** : Anti-doubles (gardes serveur) — **FRAGILE**
5. **LOT 5** : Nettoyage (mapping, PREAMBULE_DONE, currentBlock) — **FRAGILE**

---

## LOT 1 — VALIDATION MIROIRS (BLOQUANT)

### C1 — Correction validation miroir BLOC 1

**Objectif** : Après le miroir BLOC 1, retourner uniquement le miroir avec `expectsAnswer: true`, attendre validation, puis générer question BLOC 2A.

**Fichier** : `src/services/blockOrchestrator.ts`

**Modification ligne 240-268** :

**Code actuel** :
```typescript
// Après génération miroir BLOC 1
const mirror = await this.generateMirrorForBlock1(currentCandidate);

// Enregistrer le miroir
candidateStore.appendAssistantMessage(currentCandidate.candidateId, mirror, {
  block: blockNumber,
  step: BLOC_02,
  kind: 'mirror',
});

// Mettre à jour session
candidateStore.updateSession(currentCandidate.candidateId, {
  state: "collecting",
  currentBlock: 2,
});
candidateStore.updateUIState(currentCandidate.candidateId, {
  step: BLOC_02,
  lastQuestion: null,
  identityDone: true,
});

// Générer immédiatement la première question BLOC 2A
const firstQuestion2A = await this.generateQuestion2A1(updatedCandidate, 0);

return {
  response: mirror + '\n\n' + firstQuestion2A,
  step: BLOC_02,
  expectsAnswer: true,
  autoContinue: false,
  progressiveDisplay: mirrorSections.length === 3,
  mirrorSections: mirrorSections.length === 3 ? mirrorSections : undefined,
};
```

**Code attendu** :
```typescript
// Après génération miroir BLOC 1
const mirror = await this.generateMirrorForBlock1(currentCandidate);

// Enregistrer le miroir
candidateStore.appendAssistantMessage(currentCandidate.candidateId, mirror, {
  block: blockNumber,
  step: BLOC_01, // Rester sur BLOC_01 jusqu'à validation
  kind: 'mirror',
});

// Mettre à jour session (currentBlock reste 1 jusqu'à validation)
candidateStore.updateUIState(currentCandidate.candidateId, {
  step: BLOC_01, // Rester sur BLOC_01
  lastQuestion: null,
  identityDone: true,
});

// Parser le miroir en sections pour affichage progressif
const mirrorSections = parseMirrorSections(mirror);

// Retourner UNIQUEMENT le miroir avec expectsAnswer: true
return {
  response: mirror,
  step: BLOC_01, // Rester sur BLOC_01 jusqu'à validation
  expectsAnswer: true, // Forcer true pour validation
  autoContinue: false,
  progressiveDisplay: mirrorSections.length === 3,
  mirrorSections: mirrorSections.length === 3 ? mirrorSections : undefined,
};
```

**Modification ligne 130-277 (handleMessage)** :

**Code actuel** :
```typescript
// Cas 1 : Event START_BLOC_1
if (event === "START_BLOC_1") {
  // Générer questions BLOC 1
}

// Cas 2 : Réponse utilisateur
if (userMessage) {
  // Traiter réponse
  // Si toutes questions répondues → Générer miroir + question 2A
}
```

**Code attendu** :
```typescript
// Cas 1 : Event START_BLOC_1
if (event === "START_BLOC_1") {
  // Générer questions BLOC 1
}

// Cas 2 : Réponse utilisateur
if (userMessage) {
  const currentBlock = candidate.session.currentBlock || 1;
  
  if (currentBlock === 1) {
    const queue = candidate.blockQueues?.get(1);
    
    if (queue && queue.cursorIndex < queue.questions.length) {
      // Réponse à une question BLOC 1
      candidateStore.storeAnswerForBlock(candidate.candidateId, 1, queue.cursorIndex, userMessage);
      const updatedQueue = candidateStore.advanceQuestionCursor(candidate.candidateId, 1);
      
      if (updatedQueue.cursorIndex < updatedQueue.questions.length) {
        // Servir question suivante
        return this.serveNextQuestion(candidate.candidateId, 1);
      } else {
        // Toutes questions répondues → Générer miroir (sans question 2A)
        return this.generateMirrorForBlock1(candidate);
      }
    } else {
      // Validation miroir BLOC 1
      // Stocker validation
      candidateStore.appendMirrorValidation(candidate.candidateId, 1, userMessage);
      
      // Générer première question BLOC 2A
      candidateStore.updateSession(candidate.candidateId, {
        currentBlock: 2,
      });
      candidateStore.updateUIState(candidate.candidateId, {
        step: BLOC_02,
        lastQuestion: null,
        identityDone: true,
      });
      
      const updatedCandidate = candidateStore.get(candidate.candidateId);
      if (!updatedCandidate) {
        throw new Error(`Candidate ${candidate.candidateId} not found after validation`);
      }
      
      const firstQuestion2A = await this.generateQuestion2A1(updatedCandidate, 0);
      candidateStore.appendAssistantMessage(updatedCandidate.candidateId, firstQuestion2A, {
        block: 2,
        step: BLOC_02,
        kind: 'question',
      });
      
      return {
        response: firstQuestion2A,
        step: BLOC_02,
        expectsAnswer: true,
        autoContinue: false,
      };
    }
  }
}
```

**Risque** : Moyen (changement de comportement, nécessite test)

**Tests** :
1. Miroir BLOC 1 affiché seul
2. `expectsAnswer: true` après miroir
3. Champ de saisie actif
4. Validation stockée avec `kind: 'mirror_validation'`
5. Question BLOC 2A générée uniquement après validation

**Effort estimé** : 4 heures

---

### C2 — Correction validation miroir BLOC 2B

**Objectif** : Après le miroir BLOC 2B, retourner uniquement le miroir avec `expectsAnswer: true`, attendre validation, puis générer question BLOC 3.

**Fichier** : `src/services/blockOrchestrator.ts`

**Modification ligne 940-958** :

**Code actuel** :
```typescript
// Après génération miroir BLOC 2B
const mirror = await this.generateMirror2B(currentCandidate);

// Enregistrer le miroir
candidateStore.appendAssistantMessage(currentCandidate.candidateId, mirror, {
  block: 2,
  step: BLOC_03,
  kind: 'mirror',
});

// Appeler executeAxiom() pour générer la première question BLOC 3
const nextResult = await executeAxiom({
  candidate: updatedCandidate,
  userMessage: null,
  event: undefined,
});

return {
  response: mirror + '\n\n' + nextResult.response,
  step: nextResult.step,
  expectsAnswer: nextResult.expectsAnswer,
  autoContinue: false,
  progressiveDisplay: mirrorSections.length === 3,
  mirrorSections: mirrorSections.length === 3 ? mirrorSections : undefined,
};
```

**Code attendu** :
```typescript
// Après génération miroir BLOC 2B
const mirror = await this.generateMirror2B(currentCandidate);

// Enregistrer le miroir
candidateStore.appendAssistantMessage(currentCandidate.candidateId, mirror, {
  block: 2,
  step: BLOC_02, // Rester sur BLOC_02 jusqu'à validation
  kind: 'mirror',
});

// Mettre à jour UI state (currentBlock reste 2 jusqu'à validation)
candidateStore.updateUIState(currentCandidate.candidateId, {
  step: BLOC_02, // Rester sur BLOC_02
  lastQuestion: null,
  identityDone: true,
});

// Parser le miroir en sections pour affichage progressif
const mirrorSections = parseMirrorSections(mirror);

// Retourner UNIQUEMENT le miroir avec expectsAnswer: true
return {
  response: mirror,
  step: BLOC_02, // Rester sur BLOC_02 jusqu'à validation
  expectsAnswer: true, // Forcer true pour validation
  autoContinue: false,
  progressiveDisplay: mirrorSections.length === 3,
  mirrorSections: mirrorSections.length === 3 ? mirrorSections : undefined,
};
```

**Modification ligne 800-967 (handleBlock2B)** :

**Code attendu** :
```typescript
// Dans handleBlock2B(), après génération miroir
// Si userMessage existe ET toutes questions 2B répondues ET step === BLOC_02
if (userMessage && queue.cursorIndex >= queue.questions.length && candidate.session.ui?.step === BLOC_02) {
  // Validation miroir BLOC 2B
  // Stocker validation
  candidateStore.appendMirrorValidation(candidate.candidateId, 2, userMessage);
  
  // Générer première question BLOC 3
  candidateStore.updateSession(candidate.candidateId, {
    currentBlock: 3,
  });
  candidateStore.updateUIState(candidate.candidateId, {
    step: BLOC_03,
    lastQuestion: null,
    identityDone: true,
  });
  
  const updatedCandidate = candidateStore.get(candidate.candidateId);
  if (!updatedCandidate) {
    throw new Error(`Candidate ${candidate.candidateId} not found after validation`);
  }
  
  const nextResult = await executeAxiom({
    candidate: updatedCandidate,
    userMessage: null,
    event: undefined,
  });
  
  return {
    response: nextResult.response,
    step: nextResult.step,
    expectsAnswer: nextResult.expectsAnswer,
    autoContinue: false,
  };
}
```

**Risque** : Moyen

**Tests** :
1. Miroir BLOC 2B affiché seul
2. `expectsAnswer: true` après miroir
3. Champ de saisie actif
4. Validation stockée avec `kind: 'mirror_validation'`
5. Question BLOC 3 générée uniquement après validation

**Effort estimé** : 4 heures

---

### C3 — Correction validation miroir BLOCS 3-9

**Objectif** : Forcer `expectsAnswer: true` après un miroir, attendre validation, puis passer au bloc suivant.

**Fichier** : `src/engine/axiomExecutor.ts`

**Modification ligne 1711, 1768, 1795-1797** :

**Code actuel** :
```typescript
// Ligne 1711
let expectsAnswer = aiText ? aiText.trim().endsWith('?') : false;

// Ligne 1768 (après validation/retry miroir)
expectsAnswer = aiText ? aiText.trim().endsWith('?') : false;

// Ligne 1795-1797
if (!expectsAnswer && blocNumber < 10) {
  // Fin du bloc → passer au suivant
  nextState = blocStates[blocNumber] as any;
}
```

**Code attendu** :
```typescript
// Ligne 1711
let expectsAnswer = aiText ? aiText.trim().endsWith('?') : false;

// Ligne 1768 (après validation/retry miroir)
expectsAnswer = aiText ? aiText.trim().endsWith('?') : false;

// NOUVEAU : Si c'est un miroir (blocNumber >= 3 && blocNumber <= 9 && !expectsAnswer)
if (aiText && blocNumber >= 3 && blocNumber <= 9 && !expectsAnswer) {
  // C'est un miroir → forcer expectsAnswer: true
  expectsAnswer = true;
}

// Ligne 1795-1797 (MODIFIÉ)
// Ne pas passer au bloc suivant si expectsAnswer: true (validation attendue)
if (!expectsAnswer && blocNumber < 10) {
  // Fin du bloc → passer au suivant
  nextState = blocStates[blocNumber] as any;
} else if (expectsAnswer && blocNumber >= 3 && blocNumber <= 9) {
  // Miroir affiché → rester sur le bloc courant jusqu'à validation
  nextState = currentState; // Ne pas changer de bloc
}
```

**Modification ligne 1776-1791 (stockage réponse utilisateur)** :

**Code attendu** :
```typescript
// Stocker la réponse utilisateur
if (userMessage) {
  // Vérifier si c'est une validation miroir
  const isMirrorValidation = 
    blocNumber >= 1 && blocNumber <= 9 && 
    !expectsAnswer && 
    candidate.session.ui?.step === currentState;
  
  if (isMirrorValidation) {
    // Stocker validation miroir
    candidateStore.appendMirrorValidation(candidate.candidateId, blocNumber, userMessage);
    
    // Passer au bloc suivant
    if (blocNumber < 10) {
      nextState = blocStates[blocNumber] as any;
    } else if (blocNumber === 10) {
      nextState = STEP_99_MATCH_READY;
    }
  } else {
    // Réponse normale à une question
    const answerRecord: AnswerRecord = {
      block: blocNumber,
      message: userMessage,
      createdAt: new Date().toISOString(),
    };
    candidateStore.addAnswer(candidate.candidateId, answerRecord);
    
    candidateStore.appendUserMessage(candidate.candidateId, userMessage, {
      block: blocNumber,
      step: currentState,
      kind: 'other',
    });
  }
}
```

**Risque** : Élevé (changement de logique FSM pour tous les blocs 3-9)

**Tests** :
1. Miroir BLOCS 3-9 affiché seul
2. `expectsAnswer: true` après chaque miroir
3. Champ de saisie actif
4. Validation stockée avec `kind: 'mirror_validation'`
5. Transition au bloc suivant uniquement après validation

**Effort estimé** : 6 heures

---

### C4 — Stockage nuances validation miroir

**Objectif** : Créer méthode dédiée pour stocker les validations miroir et les réinjecter dans les prompts suivants.

**Fichier** : `src/store/sessionStore.ts`

**Modification** : Ajouter méthode `appendMirrorValidation()`

**Code attendu** :
```typescript
appendMirrorValidation(
  candidateId: string,
  mirrorBlock: number,
  validationText: string
): void {
  const candidate = this.candidates.get(candidateId);
  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }

  const message: ConversationMessage = {
    role: 'user',
    content: validationText,
    createdAt: new Date().toISOString(),
    block: mirrorBlock,
    step: `BLOC_${String(mirrorBlock).padStart(2, '0')}`,
    kind: 'mirror_validation',
  };

  const updated: AxiomCandidate = {
    ...candidate,
    conversationHistory: [...(candidate.conversationHistory || []), message],
    session: {
      ...candidate.session,
      lastActivityAt: new Date(),
    },
  };

  this.candidates.set(candidateId, updated);
  this.persistCandidate(candidateId);
}
```

**Fichier** : `src/engine/axiomExecutor.ts`

**Modification** : Réinjecter les validations miroir dans `buildConversationHistory()`

**Code attendu** :
```typescript
function buildConversationHistory(candidate: AxiomCandidate): Array<{ role: string; content: string }> {
  const history = candidate.conversationHistory || [];
  
  // Filtrer et mapper l'historique
  const messages = history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role,
      content: m.content,
    }));
  
  // Les validations miroir sont déjà dans conversationHistory avec kind: 'mirror_validation'
  // Elles seront automatiquement incluses dans les messages
  
  return messages;
}
```

**Risque** : Faible (ajout de fonctionnalité)

**Tests** :
1. Validation stockée avec `kind: 'mirror_validation'`
2. Validation visible dans `conversationHistory`
3. Validation réinjectée dans prompts blocs suivants

**Effort estimé** : 4 heures

---

## LOT 2 — VALIDATIONS SORTIES (BLOQUANT)

### V1 — Validation structure profil final

**Objectif** : Valider que le profil final respecte la structure obligatoire (7 sections + texte fixe).

**Fichier** : `src/services/validators.ts` (nouveau ou extension)

**Code attendu** :
```typescript
export function validateFinalProfile(content: string): ValidationResult {
  const errors: string[] = [];
  
  // Sections obligatoires (dans l'ordre)
  const requiredSections = [
    { emoji: '🔥', name: 'Ce qui te met vraiment en mouvement' },
    { emoji: '🧱', name: 'Comment tu tiens dans le temps' },
    { emoji: '⚖️', name: 'Tes valeurs quand il faut agir' },
    { emoji: '🧩', name: 'Ce que révèlent tes projections' },
    { emoji: '🛠️', name: 'Tes vraies forces… et tes vraies limites' },
    { emoji: '🎯', name: 'Ton positionnement professionnel naturel' },
    { emoji: '🧠', name: 'Lecture globale — synthèse émotionnelle courte' },
  ];
  
  // Vérifier présence sections
  requiredSections.forEach((section, index) => {
    const regex = new RegExp(`${section.emoji}[^\\n]*${section.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    if (!regex.test(content)) {
      errors.push(`Section ${index + 1} manquante : ${section.emoji} ${section.name}`);
    }
  });
  
  // Vérifier ordre (approximatif : section i doit apparaître avant section i+1)
  requiredSections.forEach((section, index) => {
    if (index < requiredSections.length - 1) {
      const currentIndex = content.indexOf(section.emoji);
      const nextIndex = content.indexOf(requiredSections[index + 1].emoji);
      if (currentIndex !== -1 && nextIndex !== -1 && currentIndex > nextIndex) {
        errors.push(`Ordre incorrect : ${section.emoji} apparaît après ${requiredSections[index + 1].emoji}`);
      }
    }
  });
  
  // Vérifier texte fixe obligatoire
  const fixedText1 = "Si, en lisant ça, tu t'es dit :\n👉 « oui… c'est exactement moi »";
  const fixedText2 = "🔥 ET SI CE PROFIL SERVAIT À QUELQUE CHOSE DE VRAIMENT CONCRET ?";
  
  if (!content.includes(fixedText1) && !content.includes("oui… c'est exactement moi")) {
    errors.push("Texte fixe obligatoire 1 manquant");
  }
  
  if (!content.includes(fixedText2) && !content.includes("ET SI CE PROFIL SERVAIT")) {
    errors.push("Texte fixe obligatoire 2 manquant");
  }
  
  // Vérifier absence de question
  if (content.trim().endsWith('?')) {
    errors.push("Profil final ne doit pas se terminer par une question");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
```

**Fichier** : `src/engine/axiomExecutor.ts`

**Modification ligne 1798-1803** :

**Code attendu** :
```typescript
} else if (!expectsAnswer && blocNumber === 10) {
  // Fin du bloc 10 → générer synthèse et passer à match_ready
  nextState = STEP_99_MATCH_READY;
  
  // Valider structure profil final
  const validation = validateFinalProfile(aiText || '');
  if (!validation.valid) {
    console.warn('[AXIOM_EXECUTOR] Profil final non conforme:', validation.errors);
    // Retry avec prompt renforcé (1 seule fois)
    // ... (logique retry)
  }
  
  candidateStore.setFinalProfileText(candidate.candidateId, aiText);
}
```

**Risque** : Faible (ajout de validation)

**Tests** :
1. Profil final avec toutes sections → Validation OK
2. Profil final avec section manquante → Validation KO
3. Profil final avec ordre incorrect → Validation KO
4. Profil final sans texte fixe → Validation KO
5. Profil final avec question → Validation KO

**Effort estimé** : 4 heures

---

### V2 — Validation structure matching

**Objectif** : Valider que le matching respecte le format strict (bandeau, sections, texte fixe).

**Fichier** : `src/services/validators.ts` (extension)

**Code attendu** :
```typescript
export function validateMatching(content: string): ValidationResult {
  const errors: string[] = [];
  
  // Vérifier bandeau exact
  const bandeauRegex = /━━━━━━━━━━━━━━━━━━\s*[🟢🔵🟠]\s*MATCHING AXIOM\s*—\s*\[(ALIGNÉ|ALIGNEMENT CONDITIONNEL|PAS ALIGNÉ ACTUELLEMENT)\]\s*━━━━━━━━━━━━━━━━━━/i;
  if (!bandeauRegex.test(content)) {
    errors.push("Bandeau matching manquant ou incorrect");
  }
  
  // Vérifier sections obligatoires
  const hasLectureCompatibilite = /🔎\s*Lecture de compatibilité/i.test(content);
  const hasCadrageHumain = /🧭\s*Cadrage humain/i.test(content);
  const hasPourAllerPlusLoin = /🚀\s*POUR ALLER PLUS LOIN/i.test(content);
  
  if (!hasLectureCompatibilite) {
    errors.push("Section 🔎 Lecture de compatibilité manquante");
  }
  
  if (!hasCadrageHumain) {
    errors.push("Section 🧭 Cadrage humain manquante");
  }
  
  if (!hasPourAllerPlusLoin) {
    errors.push("Section 🚀 POUR ALLER PLUS LOIN manquante");
  }
  
  // Vérifier sections conditionnelles (si aligné/conditionnel)
  const issueMatch = content.match(/\[(ALIGNÉ|ALIGNEMENT CONDITIONNEL|PAS ALIGNÉ ACTUELLEMENT)\]/i);
  if (issueMatch) {
    const issue = issueMatch[1].toUpperCase();
    if (issue === 'ALIGNÉ' || issue === 'ALIGNEMENT CONDITIONNEL') {
      const hasProjection = /💼\s*PROJECTION CONCRÈTE/i.test(content);
      const hasCadre = /🧭\s*LE CADRE/i.test(content);
      
      if (!hasProjection) {
        errors.push("Section 💼 PROJECTION CONCRÈTE manquante (requise pour aligné/conditionnel)");
      }
      if (!hasCadre) {
        errors.push("Section 🧭 LE CADRE manquante (requise pour aligné/conditionnel)");
      }
    } else if (issue === 'PAS ALIGNÉ ACTUELLEMENT') {
      // Vérifier absence sections conditionnelles
      const hasProjection = /💼\s*PROJECTION CONCRÈTE/i.test(content);
      const hasCadre = /🧭\s*LE CADRE/i.test(content);
      
      if (hasProjection) {
        errors.push("Section 💼 PROJECTION CONCRÈTE interdite pour PAS ALIGNÉ");
      }
      if (hasCadre) {
        errors.push("Section 🧭 LE CADRE interdite pour PAS ALIGNÉ");
      }
    }
  }
  
  // Vérifier texte fixe obligatoire (exemple chiffré)
  const fixedText = "Une entreprise qui consomme 100 MWh par an sur un contrat de 4 ans";
  if (!content.includes(fixedText)) {
    errors.push("Texte fixe obligatoire (exemple chiffré) manquant");
  }
  
  // Vérifier absence de question
  if (content.trim().endsWith('?')) {
    errors.push("Matching ne doit pas se terminer par une question");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
```

**Fichier** : `src/engine/axiomExecutor.ts`

**Modification ligne 1955-1991** :

**Code attendu** :
```typescript
if (typeof completion === 'string' && completion.trim()) {
  aiText = completion.trim();
  
  // Valider structure matching
  const validation = validateMatching(aiText);
  if (!validation.valid) {
    console.warn('[AXIOM_EXECUTOR] Matching non conforme:', validation.errors);
    // Retry avec prompt renforcé (1 seule fois)
    // ... (logique retry)
  }
}
```

**Risque** : Faible (ajout de validation)

**Tests** :
1. Matching avec toutes sections → Validation OK
2. Matching avec bandeau incorrect → Validation KO
3. Matching aligné sans PROJECTION CONCRÈTE → Validation KO
4. Matching PAS ALIGNÉ avec PROJECTION CONCRÈTE → Validation KO
5. Matching avec question → Validation KO

**Effort estimé** : 4 heures

---

## LOT 3 — STREAMING (GO-BLOCKER)

### S1-S4 — Implémentation streaming complet

**Objectif** : Implémenter streaming pour miroirs, profil final, et matching, avec conformité S1-S4.

**Option choisie** : SSE (Server-Sent Events) — Plus simple que WebSocket, suffisant pour streaming unidirectionnel.

**Fichier** : `src/services/openaiClient.ts`

**Modification** : Ajouter fonction `callOpenAIStream()`

**Code attendu** :
```typescript
export async function* callOpenAIStream(
  messages: Array<{ role: string; content: string }>
): AsyncGenerator<string, void, unknown> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body reader');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch (e) {
          // Ignorer lignes invalides
        }
      }
    }
  }
}
```

**Fichier** : `src/server.ts`

**Modification ligne 940-994** : Implémenter route `/axiom/stream`

**Code attendu** :
```typescript
app.post("/axiom/stream", async (req: Request, res: Response) => {
  try {
    const parsed = AxiomBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        details: parsed.error.flatten(),
      });
    }

    const {
      tenantId,
      posteId,
      sessionId: providedSessionId,
      message: userMessage,
      event,
    } = parsed.data;

    const sessionId = (req.headers["x-session-id"] as string) || providedSessionId;
    if (!sessionId) {
      return res.status(400).json({
        error: "MISSING_SESSION_ID",
        message: "sessionId requis",
      });
    }

    let candidate = candidateStore.get(sessionId);
    if (!candidate) {
      candidate = await candidateStore.getAsync(sessionId);
    }
    if (!candidate) {
      return res.status(404).json({
        error: "SESSION_NOT_FOUND",
        message: "Session introuvable",
      });
    }

    // Déterminer si streaming autorisé (miroir, profil final, matching uniquement)
    const currentStep = candidate.session.ui?.step;
    const isMirror = currentStep?.startsWith('BLOC_') && !currentStep.includes('BLOC_02') && !currentStep.includes('BLOC_10');
    const isFinalProfile = currentStep === 'STEP_99_MATCH_READY';
    const isMatching = currentStep === 'STEP_99_MATCHING';

    if (!isMirror && !isFinalProfile && !isMatching) {
      return res.status(400).json({
        error: "STREAMING_NOT_AUTHORIZED",
        message: "Streaming autorisé uniquement pour miroirs, profil final, et matching",
      });
    }

    // Générer messageId unique
    const messageId = uuidv4();

    // Déterminer step/state/expectsAnswer AVANT streaming (S1)
    let step: string;
    let state: string;
    let expectsAnswer: boolean;
    let currentBlock: number | null;

    if (isMirror) {
      step = currentStep || 'BLOC_01';
      state = mapStepToState(step);
      expectsAnswer = true; // Forcer true pour validation miroir
      currentBlock = candidate.session.currentBlock;
    } else if (isFinalProfile) {
      step = 'STEP_99_MATCH_READY';
      state = 'waiting_go';
      expectsAnswer = false;
      currentBlock = 10;
    } else if (isMatching) {
      step = 'DONE_MATCHING';
      state = 'matching';
      expectsAnswer = false;
      currentBlock = null;
    } else {
      return res.status(400).json({ error: "INVALID_STATE" });
    }

    // Envoyer headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx

    // Envoyer métadonnées initiales (S1)
    res.write(`data: ${JSON.stringify({
      messageId,
      kind: isMirror ? 'mirror' : (isFinalProfile ? 'final_profile' : 'matching'),
      step,
      state,
      currentBlock,
      expectsAnswer,
      isFinal: false,
    })}\n\n`);

    // Générer contenu (miroir, profil, ou matching)
    let fullContent = '';
    
    if (isMirror) {
      // Générer miroir (logique existante)
      // ... (appel OpenAI ou récupération depuis store)
    } else if (isFinalProfile) {
      // Générer profil final (logique existante)
      // ... (appel OpenAI)
    } else if (isMatching) {
      // Générer matching (logique existante)
      // ... (appel OpenAI)
    }

    // Streamer contenu chunk par chunk
    const messages = buildConversationHistory(candidate);
    const generator = callOpenAIStream([
      { role: 'system', content: getFullAxiomPrompt() },
      ...messages,
    ]);

    for await (const chunk of generator) {
      fullContent += chunk;
      res.write(`data: ${JSON.stringify({
        messageId,
        chunk,
        isFinal: false,
      })}\n\n`);
    }

    // Envoyer chunk final (S1)
    res.write(`data: ${JSON.stringify({
      messageId,
      chunk: '',
      isFinal: true,
      step,
      state,
      expectsAnswer,
    })}\n\n`);

    res.end();
  } catch (error) {
    console.error('[STREAM] error:', error);
    res.write(`data: ${JSON.stringify({
      error: 'STREAM_ERROR',
      message: 'Erreur lors du streaming',
    })}\n\n`);
    res.end();
  }
});
```

**Fichier** : `ui-test/app.js`

**Modification** : Ajouter gestion SSE

**Code attendu** :
```typescript
async function callAxiomStream(message, event = null) {
  if (isWaiting || !sessionId) {
    return;
  }

  isWaiting = true;

  const body = {
    tenantId: tenantId,
    posteId: posteId,
    sessionId: sessionId,
    message: message,
  };
  if (event) {
    body.event = event;
  }

  const response = await fetch(`${API_BASE_URL}/axiom/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': sessionId || '',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Stream error: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentMessageId = null;
  let metadata = null;
  let accumulatedContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        
        // Ignorer chunks avec messageId différent (S4)
        if (data.messageId && data.messageId !== currentMessageId) {
          if (currentMessageId === null) {
            currentMessageId = data.messageId;
            metadata = data;
          } else {
            continue; // Ignorer chunk obsolète
          }
        }

        if (data.chunk) {
          accumulatedContent += data.chunk;
          // Afficher chunk progressivement
          updateLastMessage(accumulatedContent);
        }

        if (data.isFinal) {
          // Streaming terminé
          // Activer input si expectsAnswer: true (S1, S3)
          if (data.expectsAnswer === true) {
            const chatForm = document.getElementById('chat-form');
            if (chatForm) {
              chatForm.style.display = 'flex';
            }
            const userInput = document.getElementById('user-input');
            if (userInput) {
              userInput.disabled = false;
            }
          }
          
          isWaiting = false;
          return { ...data, response: accumulatedContent };
        }
      }
    }
  }
}
```

**Risque** : Élevé (nouvelle fonctionnalité, complexité SSE)

**Tests** :
- TS1 : Miroir BLOC 1 streamé : pas de question 2A, input actif fin
- TS2 : Miroir BLOC 2B streamé : pas de question 3, input actif fin
- TS3 : Miroirs 3-9 streamés : pas de transition auto, input actif fin
- TS4 : Profil final streamé : bouton matching après fin, aucune question
- TS5 : Matching streamé : DONE propre, aucune question
- TS6 : Anti-double : double clic/refresh/latence ne duplique rien

**Effort estimé** : 16 heures

---

## LOT 4 — ANTI-DOUBLES (FRAGILE)

### D1 — Garde serveur START_BLOC_1

**Objectif** : Empêcher double génération si BLOC 1 déjà démarré.

**Fichier** : `src/server.ts`

**Modification ligne 652-691** :

**Code attendu** :
```typescript
if (event === "START_BLOC_1") {
  // Garde anti-double : vérifier si BLOC 1 déjà démarré
  const currentBlock = candidate.session.currentBlock;
  const currentStep = candidate.session.ui?.step;
  
  if (currentBlock === 1 && currentStep !== STEP_03_BLOC1) {
    // BLOC 1 déjà démarré → ignorer event
    return res.status(200).json({
      sessionId: candidate.candidateId,
      currentBlock: candidate.session.currentBlock,
      state: "collecting",
      response: '',
      step: currentStep || BLOC_01,
      expectsAnswer: false,
      autoContinue: false,
    });
  }
  
  // Générer questions BLOC 1
  const orchestrator = new BlockOrchestrator();
  const result = await orchestrator.handleMessage(candidate, null, "START_BLOC_1");
  // ... (reste du code)
}
```

**Risque** : Faible

**Tests** :
1. Double clic bouton START_BLOC_1 → Une seule génération
2. Event START_BLOC_1 après BLOC 1 démarré → Ignoré

**Effort estimé** : 1 heure

---

### D2 — Garde serveur START_MATCHING

**Objectif** : Empêcher double matching si déjà généré.

**Fichier** : `src/engine/axiomExecutor.ts`

**Modification ligne 1902-1931** :

**Code attendu** :
```typescript
if (currentState === STEP_99_MATCH_READY) {
  // Garde anti-double : vérifier si matching déjà généré
  if (candidate.matchingResult) {
    // Matching déjà généré → retourner résultat existant
    return {
      response: candidate.matchingResult.text || '',
      step: DONE_MATCHING,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false,
    };
  }
  
  // Attendre event START_MATCHING
  if (!userMessage && !event) {
    // ... (reste du code)
  }
}
```

**Risque** : Faible

**Tests** :
1. Double clic bouton START_MATCHING → Un seul matching généré
2. Event START_MATCHING après matching généré → Retour résultat existant

**Effort estimé** : 1 heure

---

### D3 — Déduplication messages

**Objectif** : Empêcher doublons dans l'historique.

**Fichier** : `src/store/sessionStore.ts`

**Modification ligne 370-420** :

**Code attendu** :
```typescript
appendUserMessage(
  candidateId: string,
  content: string,
  meta?: {
    block?: number;
    step?: string;
    kind?: ConversationMessageKind;
  }
): void {
  const candidate = this.candidates.get(candidateId);
  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }

  // Déduplication : vérifier si le dernier message utilisateur est identique
  const history = candidate.conversationHistory || [];
  const lastUserMessage = history.filter(m => m.role === 'user').pop();
  
  if (lastUserMessage && 
      lastUserMessage.content === content && 
      Date.now() - new Date(lastUserMessage.createdAt).getTime() < 5000) {
    // Doublon détecté (même contenu dans les 5 dernières secondes) → ignorer
    console.warn(`[STORE] Doublon message détecté pour ${candidateId}, ignoré`);
    return;
  }

  const message: ConversationMessage = {
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
    block: meta?.block,
    step: meta?.step,
    kind: meta?.kind || 'other',
  };

  const updated: AxiomCandidate = {
    ...candidate,
    conversationHistory: [...(candidate.conversationHistory || []), message],
    session: {
      ...candidate.session,
      lastActivityAt: new Date(),
    },
  };

  this.candidates.set(candidateId, updated);
  this.persistCandidate(candidateId);
}
```

**Risque** : Faible

**Tests** :
1. Message dupliqué envoyé → Un seul stocké
2. Messages différents → Tous stockés

**Effort estimé** : 1 heure

---

## LOT 5 — NETTOYAGE (FRAGILE)

### N1 — Unifier mapping step → state

**Objectif** : Utiliser uniquement `mapStepToState()` dans `/start` et `/axiom`.

**Fichier** : `src/server.ts`

**Modification ligne 271** :

**Code actuel** :
```typescript
return res.status(200).json({
  sessionId: finalSessionId,
  step: derivedStep,
  state: derivedStep.startsWith('BLOC_') ? "collecting" : "wait_start_button",
  // ...
});
```

**Code attendu** :
```typescript
return res.status(200).json({
  sessionId: finalSessionId,
  step: derivedStep,
  state: mapStepToState(derivedStep), // Utiliser fonction unique
  // ...
});
```

**Risque** : Faible

**Tests** :
1. `/start` et `/axiom` retournent mêmes states pour mêmes steps

**Effort estimé** : 30 minutes

---

### N2 — Supprimer PREAMBULE_DONE

**Objectif** : Remplacer toutes les occurrences par `STEP_03_BLOC1`.

**Fichier** : `src/engine/axiomExecutor.ts`

**Modification ligne 852** :

**Code actuel** :
```typescript
export const PREAMBULE_DONE = 'PREAMBULE_DONE';
```

**Code attendu** :
```typescript
// Supprimer cette ligne
```

**Fichier** : `src/server.ts`

**Modification ligne 245** :

**Code actuel** :
```typescript
if (
  derivedStep === STEP_03_BLOC1 ||
  derivedStep === "PREAMBULE_DONE" ||
  // ...
)
```

**Code attendu** :
```typescript
if (
  derivedStep === STEP_03_BLOC1 ||
  // Supprimer "PREAMBULE_DONE"
  // ...
)
```

**Risque** : Faible

**Tests** :
1. Aucune référence à `PREAMBULE_DONE` dans le code

**Effort estimé** : 30 minutes

---

### N3 — Centraliser currentBlock

**Objectif** : Créer méthode unique `updateCurrentBlock()`.

**Fichier** : `src/store/sessionStore.ts`

**Code attendu** :
```typescript
updateCurrentBlock(candidateId: string, blockNumber: number): void {
  const candidate = this.candidates.get(candidateId);
  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }

  const updated: AxiomCandidate = {
    ...candidate,
    session: {
      ...candidate.session,
      currentBlock: blockNumber,
      lastActivityAt: new Date(),
    },
  };

  this.candidates.set(candidateId, updated);
  this.persistCandidate(candidateId);
}
```

**Fichier** : `src/services/blockOrchestrator.ts`, `src/engine/axiomExecutor.ts`

**Modification** : Remplacer toutes les mises à jour directes par `candidateStore.updateCurrentBlock()`

**Risque** : Faible

**Tests** :
1. `currentBlock` mis à jour uniquement via `updateCurrentBlock()`

**Effort estimé** : 2 heures

---

## 📊 RÉCAPITULATIF

### Priorité 1 (BLOQUANT)
- C1 : Validation miroir BLOC 1 — 4h
- C2 : Validation miroir BLOC 2B — 4h
- C3 : Validation miroir BLOCS 3-9 — 6h
- C4 : Stockage nuances — 4h
- **Total** : **18 heures**

### Priorité 2 (BLOQUANT)
- V1 : Validation profil final — 4h
- V2 : Validation matching — 4h
- **Total** : **8 heures**

### Priorité 3 (GO-BLOCKER)
- S1-S4 : Streaming complet — 16h
- **Total** : **16 heures**

### Priorité 4 (FRAGILE)
- D1 : Garde START_BLOC_1 — 1h
- D2 : Garde START_MATCHING — 1h
- D3 : Déduplication messages — 1h
- **Total** : **3 heures**

### Priorité 5 (FRAGILE)
- N1 : Unifier mapping — 0.5h
- N2 : Supprimer PREAMBULE_DONE — 0.5h
- N3 : Centraliser currentBlock — 2h
- **Total** : **3 heures**

**TOTAL GLOBAL** : **48 heures** (6 jours)

---

## 🎯 ORDRE STRICT D'EXÉCUTION

1. **LOT 1** : C1 → C2 → C3 → C4 (validation miroirs)
2. **Tests LOT 1** : Valider toutes les validations miroirs
3. **LOT 2** : V1 → V2 (validations sorties)
4. **Tests LOT 2** : Valider structure profil + matching
5. **LOT 3** : S1-S4 (streaming)
6. **Tests LOT 3** : TS1-TS6 (tous les tests streaming)
7. **LOT 4** : D1 → D2 → D3 (anti-doubles)
8. **Tests LOT 4** : Valider gardes serveur
9. **LOT 5** : N1 → N2 → N3 (nettoyage)
10. **Tests LOT 5** : Valider nettoyage

---

**FIN DU PLAN D'ACTION D'EXÉCUTION**
