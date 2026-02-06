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

  return {
    valid: errors.length === 0,
    errors,
  };
}
