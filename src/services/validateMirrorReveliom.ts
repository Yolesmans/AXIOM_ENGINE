export type MirrorValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateMirrorREVELIOM(content: string): MirrorValidationResult {
  const errors: string[] = [];

  // Sections obligatoires
  const hasSection1 = /1️⃣/.test(content);
  const hasSection2 = /2️⃣/.test(content);
  const hasSection3 = /3️⃣/.test(content);

  if (!hasSection1) errors.push("Section 1️⃣ manquante");
  if (!hasSection2) errors.push("Section 2️⃣ manquante");
  if (!hasSection3) errors.push("Section 3️⃣ manquante");

  // Extraction sections
  const section1Match = content.match(/1️⃣[^\n]*\n([^2️⃣]*)/s);
  const section2Match = content.match(/2️⃣[^\n]*\n([^3️⃣]*)/s);

  if (section1Match) {
    const words = section1Match[1].trim().split(/\s+/).length;
    if (words > 20) {
      errors.push(`Section 1️⃣ dépasse 20 mots (${words})`);
    }
  }

  if (section2Match) {
    const words = section2Match[1].trim().split(/\s+/).length;
    if (words > 25) {
      errors.push(`Section 2️⃣ dépasse 25 mots (${words})`);
    }
  }

  // Lecture en creux obligatoire
  const hasReadingInDepth =
    /probablement pas.*mais plutôt|n'est probablement pas.*mais|plutôt.*que/i.test(
      content
    );

  if (!hasReadingInDepth) {
    errors.push("Lecture en creux absente");
  }

  // Interdictions
  if (/(synthèse|conclusion|global|cohérence globale|métier|compatibilité)/i.test(content)) {
    errors.push("Formulation interdite détectée");
  }

  // Validation du ton — 2e personne obligatoire
  // Exclure la section 3️⃣ (validation ouverte) du comptage car elle contient toujours "te"
  const section3Match = content.match(/3️⃣[^\n]*\n(.*)/s);
  const contentWithoutSection3 = section3Match 
    ? content.replace(/3️⃣[^\n]*\n.*/s, '')
    : content;
  
  const secondPersonPattern = /\b(tu|toi|tes|ton|ta|votre|vos|vous)\b/gi;
  const thirdPersonPattern = /\b(il|elle|le candidat|la candidate|semble|pourrait|est|a|était|avait)\b/gi;
  
  // Détecter les noms propres suivis de verbes à la 3e personne
  const thirdPersonWithNamePattern = /\b([A-Z][a-z]+)\s+(semble|pourrait|est|a|était|avait|fonctionne|réagit|cherche)\b/g;
  
  const secondPersonMatches = contentWithoutSection3.match(secondPersonPattern) || [];
  const thirdPersonMatches = contentWithoutSection3.match(thirdPersonPattern) || [];
  const thirdPersonWithNameMatches = contentWithoutSection3.match(thirdPersonWithNamePattern) || [];
  
  const secondPersonCount = secondPersonMatches.length;
  const thirdPersonCount = thirdPersonMatches.length + thirdPersonWithNameMatches.length;
  
  // Validation : 2e personne doit être présente ET majoritaire dans les sections 1️⃣ et 2️⃣
  const hasSecondPerson = secondPersonCount > 0;
  const isThirdPersonMajority = thirdPersonCount > secondPersonCount;
  const isThirdPersonOnly = thirdPersonCount > 0 && secondPersonCount === 0;
  
  if (!hasSecondPerson || isThirdPersonMajority || isThirdPersonOnly) {
    errors.push("Ton non conforme : utilisation de la 3e personne au lieu de la 2e personne");
  }
  
  // Log de validation du ton
  const toneValid = hasSecondPerson && !isThirdPersonMajority && !isThirdPersonOnly;
  console.log(`[REVELIOM] mirror_tone_valid=${toneValid} (2e_personne=${secondPersonCount}, 3e_personne=${thirdPersonCount})`);

  return {
    valid: errors.length === 0,
    errors,
  };
}
