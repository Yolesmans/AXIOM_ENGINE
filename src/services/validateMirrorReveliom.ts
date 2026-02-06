// ============================================
// VALIDATEUR MIROIR REVELIOM — COMPLIANCE STRICTE
// ============================================
// Valide que les miroirs respectent le format REVELIOM strict :
// - Section 1 : ≤ 20 mots, 1 phrase
// - Section 2 : ≤ 25 mots, 1 phrase, lecture en creux obligatoire
// - Section 3 : phrase exacte de validation
// - Pas de mots interdits (synthèse, conclusion, global, etc.)

export interface MirrorValidationResult {
  valid: boolean;
  errors: string[];
  section1WordCount?: number;
  section2WordCount?: number;
  hasReadingInDepth?: boolean;
}

/**
 * Valide qu'un miroir respecte strictement le format REVELIOM
 */
export function validateMirrorREVELIOM(mirror: string): MirrorValidationResult {
  const errors: string[] = [];
  
  // Détection sections obligatoires (1️⃣, 2️⃣, 3️⃣ OU mots-clés)
  const hasSection1 = /1️⃣|Lecture implicite/i.test(mirror);
  const hasSection2 = /2️⃣|Déduction personnalisée/i.test(mirror);
  const hasSection3 = /3️⃣|Validation ouverte|Dis-moi si ça te parle/i.test(mirror);
  
  if (!hasSection1) {
    errors.push('Section 1️⃣ Lecture implicite manquante');
  }
  if (!hasSection2) {
    errors.push('Section 2️⃣ Déduction personnalisée manquante');
  }
  if (!hasSection3) {
    errors.push('Section 3️⃣ Validation ouverte manquante');
  }
  
  // Extraction section 1 (entre 1️⃣ et 2️⃣)
  const section1Match = mirror.match(/1️⃣[^\n]*\n([^2️⃣]*)/s);
  let section1WordCount = 0;
  if (section1Match) {
    const section1Text = section1Match[1].trim();
    // Nettoyer le texte (retirer emojis, caractères spéciaux pour comptage)
    const cleanText = section1Text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    section1WordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
    if (section1WordCount > 20) {
      errors.push(`Section 1️⃣ dépasse 20 mots (${section1WordCount} mots)`);
    }
  } else if (hasSection1) {
    errors.push('Section 1️⃣ : impossible d\'extraire le contenu');
  }
  
  // Extraction section 2 (entre 2️⃣ et 3️⃣)
  const section2Match = mirror.match(/2️⃣[^\n]*\n([^3️⃣]*)/s);
  let section2WordCount = 0;
  if (section2Match) {
    const section2Text = section2Match[1].trim();
    const cleanText = section2Text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    section2WordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
    if (section2WordCount > 25) {
      errors.push(`Section 2️⃣ dépasse 25 mots (${section2WordCount} mots)`);
    }
  } else if (hasSection2) {
    errors.push('Section 2️⃣ : impossible d\'extraire le contenu');
  }
  
  // Détection lecture en creux (structure "pas X ... plutôt Y")
  // Accepte variantes : "ce n'est probablement pas", "n'est probablement pas", "pas ... mais plutôt", "plutôt ... que"
  const readingInDepthPatterns = [
    /ce n['']est probablement pas .* mais plutôt/i,
    /n['']est probablement pas .* mais plutôt/i,
    /probablement pas .* mais plutôt/i,
    /pas .* mais plutôt/i,
    /plutôt .* que/i,
    /n['']est pas .* mais plutôt/i,
  ];
  
  const hasReadingInDepth = readingInDepthPatterns.some(pattern => pattern.test(mirror));
  if (!hasReadingInDepth) {
    errors.push('Lecture en creux manquante ("ce n\'est probablement pas X, mais plutôt Y")');
  }
  
  // Vérification phrase exacte de validation ouverte
  const validationPhrase = /Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue/i;
  if (!validationPhrase.test(mirror)) {
    errors.push('Phrase de validation ouverte manquante ou incorrecte');
  }
  
  // Détection mots interdits (indicatifs de synthèse/projection)
  const forbiddenWords = /synthèse|conclusion|global|cohérence globale|compatibilité|métier|poste|cadre|recrut|matching|orientation/i;
  if (forbiddenWords.test(mirror)) {
    errors.push('Formulation interdite détectée (synthèse, conclusion, cohérence globale, projection métier)');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    section1WordCount: section1WordCount > 0 ? section1WordCount : undefined,
    section2WordCount: section2WordCount > 0 ? section2WordCount : undefined,
    hasReadingInDepth,
  };
}
