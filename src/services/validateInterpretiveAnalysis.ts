/**
 * Validation de l'analyse interprétative (non descriptive)
 * 
 * Vérifie que le texte respecte les règles AXIOM d'analyse interprétative :
 * - Ne reformule PAS les réponses
 * - Contient une lecture en creux (exclusion)
 * - Apporte un décalage interprétatif (tension, contradiction, logique sous-jacente)
 */

export type InterpretiveAnalysisValidationResult = {
  valid: boolean;
  errors: string[];
  hasReformulation: boolean;
  hasExclusion: boolean;
  hasInterpretiveShift: boolean;
};

/**
 * Valide que le texte est une analyse interprétative, pas descriptive
 * 
 * @param content Texte à valider
 * @param userAnswers Réponses utilisateur (optionnel, pour détecter reformulation)
 * @returns Résultat de validation
 */
export function validateInterpretiveAnalysis(
  content: string,
  userAnswers?: string[]
): InterpretiveAnalysisValidationResult {
  const errors: string[] = [];
  let hasReformulation = false;
  let hasExclusion = false;
  let hasInterpretiveShift = false;

  if (!content || !content.trim()) {
    return {
      valid: false,
      errors: ['Texte vide'],
      hasReformulation: false,
      hasExclusion: false,
      hasInterpretiveShift: false,
    };
  }

  // Extraire les sections d'analyse (1️⃣ et 2️⃣) - exclure section 3️⃣ (validation ouverte)
  const section1Match = content.match(/1️⃣[^\n]*\n([^2️⃣]*)/s);
  const section2Match = content.match(/2️⃣[^\n]*\n([^3️⃣]*)/s);

  const sections: { content: string; index: number }[] = [];
  if (section1Match) {
    sections.push({ content: section1Match[1].trim(), index: 1 });
  }
  if (section2Match) {
    sections.push({ content: section2Match[1].trim(), index: 2 });
  }

  // Si pas de sections (synthèse finale ou matching), analyser tout le texte
  if (sections.length === 0) {
    sections.push({ content: content.trim(), index: 0 });
  }

  // Patterns de reformulation interdits (paraphrase directe)
  const reformulationPatterns = [
    /(tu as dit|vous avez dit|tu dis|vous dites|tu mentionnes|vous mentionnez)/i,
    /(d'après (tes|ton|ta|vos|votre) (réponses|propos|mots|paroles))/i,
    /(selon (tes|ton|ta|vos|votre) (réponses|propos|mots|paroles))/i,
    /(tes|ton|ta|vos|votre) (réponses?|propos|mots?|paroles?)/i,
    /(ce que tu|ce que vous) (as|avez) (dit|exprimé|mentionné)/i,
  ];

  // Patterns d'exclusion obligatoires (lecture en creux)
  const exclusionPatterns = [
    /(ce n'est|n'est) (probablement )?pas.*mais (plutôt|surtout|davantage)/i,
    /(plutôt|surtout|davantage).*que/i,
    /(pas|non).*(simple|seulement|juste|uniquement).*mais (plutôt|surtout)/i,
    /(moins|pas).*(que|qu').*(plus|qu')/i,
    /(ce n'est pas tant|pas tant).*que/i,
    /(plus que|davantage que).*c'est.*qui/i,
    /(ce n'est probablement pas|probablement pas).*mais/i,
  ];

  // Patterns de décalage interprétatif (tension, contradiction, logique sous-jacente)
  const interpretiveShiftPatterns = [
    // Tensions internes
    /(tension|contradiction|paradoxe|dissonance|écart)/i,
    /(en même temps|simultanément|pourtant|cependant|mais aussi)/i,
    // Logique sous-jacente
    /(sous-jacent|implicite|caché|révèle|traduit|manifeste)/i,
    /(ce que ça dit|ce que ça révèle|ce que ça traduit)/i,
    // Moteurs implicites
    /(moteur|besoin|logique|dynamique).*(profond|implicite|caché|réel)/i,
    /(sans forcément|sans nécessairement|sans le formuler)/i,
    // Inférences
    /(probablement|plutôt|semble|suggère|indique).*(que|pas|mais)/i,
    /(on sent|on perçoit|on devine|on comprend)/i,
  ];

  // Vérifier chaque section
  sections.forEach((section) => {
    const sectionContent = section.content;
    
    // 1. DÉTECTION REFORMULATION (INTERDICTION)
    const hasReformulationPattern = reformulationPatterns.some(pattern => pattern.test(sectionContent));
    if (hasReformulationPattern) {
      hasReformulation = true;
      errors.push(`Section ${section.index === 0 ? 'texte' : section.index} : reformulation détectée (répète ce que le candidat a dit)`);
    }

    // Vérification heuristique : si le texte contient des mots-clés des réponses utilisateur
    if (userAnswers && userAnswers.length > 0) {
      const userWords = userAnswers
        .join(' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 4) // Mots significatifs uniquement
        .slice(0, 10); // Limiter pour éviter faux positifs
      
      const sectionLower = sectionContent.toLowerCase();
      const matchingWords = userWords.filter(word => sectionLower.includes(word));
      
      // Si trop de mots en commun ET pas d'exclusion → probable reformulation
      if (matchingWords.length > 3 && !exclusionPatterns.some(p => p.test(sectionContent))) {
        hasReformulation = true;
        errors.push(`Section ${section.index === 0 ? 'texte' : section.index} : trop de mots en commun avec les réponses (reformulation probable)`);
      }
    }

    // 2. DÉTECTION EXCLUSION (OBLIGATOIRE)
    const hasExclusionPattern = exclusionPatterns.some(pattern => pattern.test(sectionContent));
    if (!hasExclusionPattern) {
      errors.push(`Section ${section.index === 0 ? 'texte' : section.index} : absence de lecture en creux (exclusion obligatoire : "pas... mais...", "plutôt que...")`);
    } else {
      hasExclusion = true;
    }

    // 3. DÉTECTION DÉCALAGE INTERPRÉTATIF (OBLIGATOIRE)
    const hasInterpretiveShiftPattern = interpretiveShiftPatterns.some(pattern => pattern.test(sectionContent));
    if (!hasInterpretiveShiftPattern) {
      errors.push(`Section ${section.index === 0 ? 'texte' : section.index} : absence de décalage interprétatif (tension, contradiction, logique sous-jacente, moteur implicite)`);
    } else {
      hasInterpretiveShift = true;
    }

    // 4. VÉRIFICATION "PHRASE GÉNÉRIQUE" (ne pourrait pas s'appliquer à n'importe qui)
    // Si le texte contient uniquement des formulations génériques sans personnalisation
    const genericPatterns = [
      /tu (es|as|cherches|veux|souhaites).*(un|une|des|le|la|les)/i,
      /tu (apprécies|aimes|préfères).*(la|le|les|un|une)/i,
    ];
    
    const genericMatches = genericPatterns.filter(pattern => pattern.test(sectionContent)).length;
    const hasPersonalization = interpretiveShiftPatterns.some(p => p.test(sectionContent));
    
    if (genericMatches > 2 && !hasPersonalization && !hasExclusionPattern) {
      errors.push(`Section ${section.index === 0 ? 'texte' : section.index} : phrases génériques sans personnalisation (pourrait s'appliquer à n'importe qui)`);
    }
  });

  // Validation globale
  const valid = errors.length === 0 && !hasReformulation && hasExclusion && hasInterpretiveShift;

  return {
    valid,
    errors,
    hasReformulation,
    hasExclusion,
    hasInterpretiveShift,
  };
}
