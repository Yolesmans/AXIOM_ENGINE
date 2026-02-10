/**
 * Validation du style mentor incarné
 * 
 * Vérifie que le texte reformulé respecte strictement les contraintes linguistiques :
 * - Aucune phrase déclarative ("tu es...", "votre...")
 * - Marqueurs expérientiels obligatoires ("quand tu...", "dès que tu...")
 * - Langage vécu, pas conceptuel
 */

export type MentorStyleValidationResult = {
  valid: boolean;
  errors: string[];
  hasDeclarative: boolean;
  hasExperiential: boolean;
};

/**
 * Valide que le texte respecte le style mentor incarné
 * 
 * @param content Texte à valider
 * @returns Résultat de validation
 */
export function validateMentorStyle(content: string): MentorStyleValidationResult {
  const errors: string[] = [];
  let hasDeclarative = false;
  let hasExperiential = false;

  if (!content || !content.trim()) {
    return {
      valid: false,
      errors: ['Texte vide'],
      hasDeclarative: false,
      hasExperiential: false,
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

  // Patterns déclaratifs interdits (en début de phrase)
  const declarativePatterns = [
    /^(tu es|vous êtes|votre|ton|ta)\s+/i,
    /^(ton moteur|votre moteur|ta recherche|votre recherche|ton besoin|votre besoin)/i,
    /^(tu cherches|vous cherchez|tu recherches|vous recherchez)\s+/i,
    /^(tu as|vous avez)\s+(tendance|besoin|envie)\s+/i,
  ];

  // Marqueurs expérientiels obligatoires
  const experientialMarkers = [
    /quand tu/i,
    /dès que tu/i,
    /il y a des moments où tu/i,
    /parfois tu/i,
    /tant que tu/i,
    /à force de/i,
    /dès lors que tu/i,
    /chaque fois que tu/i,
  ];

  // Section 1 (Lecture implicite) en format "Ce n'est probablement pas X, mais Y." = lecture en creux brute → pas d'exigence de marqueur expérientiel
  const isSection1LectureEnCreux = (content: string) =>
    /Ce n'est probablement pas .+ mais .+/s.test(content) || /probablement pas .+ mais .+/s.test(content);

  // Vérifier chaque section
  sections.forEach((section, sectionIndex) => {
    const sectionContent = section.content;
    
    // Découper en phrases (point, point d'exclamation, point d'interrogation)
    const sentences = sectionContent
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (sentences.length === 0) {
      errors.push(`Section ${section.index === 0 ? 'texte' : section.index} : aucune phrase détectée`);
      return;
    }

    const exemptExperiential = section.index === 1 && isSection1LectureEnCreux(sectionContent);

    // Vérifier chaque phrase
    let sectionHasDeclarative = false;
    let sectionHasExperiential = false;

    sentences.forEach((sentence, sentenceIndex) => {
      // Vérifier présence patterns déclaratifs interdits
      const hasDeclarativePattern = declarativePatterns.some(pattern => pattern.test(sentence));
      if (hasDeclarativePattern) {
        sectionHasDeclarative = true;
        errors.push(`Section ${section.index === 0 ? 'texte' : section.index}, phrase ${sentenceIndex + 1} : contient un pattern déclaratif interdit ("${sentence.substring(0, 50)}...")`);
      }

      // Vérifier présence marqueurs expérientiels (sauf section 1 si lecture en creux)
      const hasExperientialMarker = experientialMarkers.some(pattern => pattern.test(sentence));
      if (hasExperientialMarker) {
        sectionHasExperiential = true;
      }
    });

    // Validation section
    if (sectionHasDeclarative) {
      hasDeclarative = true;
    }

    if (exemptExperiential) {
      hasExperiential = true; // Section 1 lecture en creux : pas d'exigence "quand tu"
    } else if (!sectionHasExperiential && sentences.length > 0) {
      errors.push(`Section ${section.index === 0 ? 'texte' : section.index} : aucune phrase ne contient de marqueur expérientiel ("quand tu...", "dès que tu...", etc.)`);
    } else if (sectionHasExperiential) {
      hasExperiential = true;
    }
  });

  // Validation globale
  const valid = errors.length === 0 && !hasDeclarative && hasExperiential;

  return {
    valid,
    errors,
    hasDeclarative,
    hasExperiential,
  };
}
