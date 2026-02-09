/**
 * Validation de profondeur interprétative REVELIOM
 * 
 * Vérifie que le texte respecte les règles REVELIOM :
 * - Ne reformule PAS les réponses
 * - Infère ce que ça révèle (pas ce qui a été dit)
 * - Lecture en creux obligatoire
 * - Exclusion d'au moins une autre lecture possible
 * - Position interprétative claire
 */

export type InterpretiveDepthResult = {
  valid: boolean;
  errors: string[];
  isDescriptive: boolean;
  hasInference: boolean;
  hasExclusion: boolean;
};

/**
 * Valide la profondeur interprétative d'un texte d'analyse
 * 
 * @param content Texte à valider
 * @param userAnswers Réponses utilisateur (optionnel, pour détecter reformulation)
 * @returns Résultat de validation
 */
export function validateInterpretiveDepth(
  content: string,
  userAnswers?: string[]
): InterpretiveDepthResult {
  const errors: string[] = [];
  let isDescriptive = false;
  let hasInference = false;
  let hasExclusion = false;

  if (!content || !content.trim()) {
    return {
      valid: false,
      errors: ['Texte vide'],
      isDescriptive: true,
      hasInference: false,
      hasExclusion: false,
    };
  }

  const contentLower = content.toLowerCase();

  // 1. DÉTECTION REFORMULATION / PARAPHRASE
  // Patterns de reformulation interdits
  const reformulationPatterns = [
    /tu (as dit|dis|disais|mentionnes|parles de|évoques)/i,
    /d'après (tes|ton|ta)/i,
    /selon (tes|ton|ta)/i,
    /tu (indiques|signales|précises|expliques)/i,
    /(tes|ton|ta) (réponse|réponses|propos)/i,
    /ce que tu (as dit|dis|disais)/i,
  ];

  const hasReformulation = reformulationPatterns.some(pattern => pattern.test(content));
  if (hasReformulation) {
    errors.push('Reformulation détectée : le texte répète ce que le candidat a dit au lieu d\'inférer ce que ça révèle');
    isDescriptive = true;
  }

  // 2. DÉTECTION INFÉRENCE (ce que ça révèle)
  // Patterns d'inférence autorisés
  const inferencePatterns = [
    /(révèle|montre|indique|signale|traduit|témoigne|exprime|manifeste).*fonctionnement/i,
    /(rapport|relation|posture|façon|manière).*(au|à|avec|face)/i,
    /(moteur|besoin|tension|dynamique|logique).*(profond|implicite|caché|réel)/i,
    /(probablement|plutôt|semble|suggère|indique).*(que|pas|mais)/i,
    /ce n'est (probablement )?pas.*mais (plutôt|surtout)/i,
    /(ce que ça dit|ce que ça révèle|ce que ça traduit)/i,
  ];

  const hasInferencePattern = inferencePatterns.some(pattern => pattern.test(content));
  if (!hasInferencePattern && !hasReformulation) {
    // Si pas d'inférence explicite ET pas de reformulation, vérifier s'il y a quand même une inférence implicite
    // via présence de termes interprétatifs
    const interpretiveTerms = [
      'fonctionne', 'fonctionnement', 'moteur', 'besoin', 'tension', 'rapport',
      'posture', 'dynamique', 'logique', 'révèle', 'traduit', 'manifeste'
    ];
    const hasInterpretiveTerms = interpretiveTerms.some(term => contentLower.includes(term));
    if (!hasInterpretiveTerms) {
      errors.push('Absence d\'inférence : le texte ne révèle pas ce que ça dit de la personne');
    } else {
      hasInference = true;
    }
  } else if (hasInferencePattern) {
    hasInference = true;
  }

  // 3. DÉTECTION EXCLUSION (lecture en creux)
  // Patterns d'exclusion obligatoires
  const exclusionPatterns = [
    /(ce n'est|n'est) (probablement )?pas.*mais (plutôt|surtout|davantage)/i,
    /(plutôt|surtout|davantage).*que/i,
    /(pas|non).*(X|simple|seulement|juste|uniquement).*mais (plutôt|surtout|Y)/i,
    /(moins|pas).*(que|qu').*(plus|qu')/i,
  ];

  const hasExclusionPattern = exclusionPatterns.some(pattern => pattern.test(content));
  if (!hasExclusionPattern) {
    errors.push('Absence d\'exclusion : le texte ne contient pas de lecture en creux ("ce n\'est probablement pas X, mais plutôt Y")');
  } else {
    hasExclusion = true;
  }

  // 4. DÉTECTION POSITION INTERPRÉTATIVE CLAIRE
  // Le texte doit prendre une position, pas rester neutre
  const neutralPatterns = [
    /(semble|pourrait|peut être|est possible)/i,
    /(peut|peuvent).*(être|avoir|faire)/i,
  ];

  const neutralCount = (content.match(/semble|pourrait|peut être|est possible/gi) || []).length;
  const interpretiveCount = (content.match(/révèle|montre|traduit|manifeste|indique/gi) || []).length;

  // Si trop de neutralité et pas assez d'interprétation
  if (neutralCount > interpretiveCount && neutralCount > 2) {
    errors.push('Position interprétative floue : trop de neutralité ("semble", "pourrait") au lieu d\'une position claire');
  }

  // 5. DÉTECTION PHRASES GÉNÉRIQUES (applicables à n'importe qui)
  const genericPatterns = [
    /tu (es|as|cherches|veux|souhaites).*(un|une|des|le|la|les)/i,
    /tu (apprécies|aimes|préfères).*(la|le|les|un|une)/i,
  ];

  // Vérifier si le texte contient trop de phrases génériques sans personnalisation
  const genericMatches = genericPatterns.filter(pattern => pattern.test(content)).length;
  if (genericMatches > 2 && !hasInference) {
    errors.push('Phrases génériques : le texte pourrait s\'appliquer à n\'importe qui sans inférence personnalisée');
  }

  // 6. VALIDATION FINALE
  const valid = errors.length === 0 && hasInference && hasExclusion;

  return {
    valid,
    errors,
    isDescriptive,
    hasInference,
    hasExclusion,
  };
}
