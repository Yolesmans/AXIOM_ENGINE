export type MirrorValidationResult = {
  valid: boolean;
  errors: string[];
  section1WordCount?: number;
  section2WordCount?: number;
  hasReadingInDepth?: boolean;
};

export function validateMirrorREVELIOM(mirror: string): MirrorValidationResult {
  const errors: string[] = [];

  // Sections obligatoires
  const hasSection1 = /1️⃣|Lecture implicite/i.test(mirror);
  const hasSection2 = /2️⃣|Déduction personnalisée/i.test(mirror);
  const hasSection3 =
    /3️⃣|Validation ouverte|Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue\./i.test(mirror);

  if (!hasSection1) errors.push("Section 1️⃣ manquante");
  if (!hasSection2) errors.push("Section 2️⃣ manquante");
  if (!hasSection3) errors.push("Section 3️⃣ manquante");

  // Extraction sections
  const section1Match = mirror.match(/1️⃣[\s\S]*?\n([\s\S]*?)(?=2️⃣)/);
  const section2Match = mirror.match(/2️⃣[\s\S]*?\n([\s\S]*?)(?=3️⃣)/);

  let section1WordCount = 0;
  let section2WordCount = 0;

  if (section1Match) {
    section1WordCount = section1Match[1].trim().split(/\s+/).length;
    if (section1WordCount > 20) {
      errors.push(`Section 1️⃣ > 20 mots (${section1WordCount})`);
    }
  }

  if (section2Match) {
    section2WordCount = section2Match[1].trim().split(/\s+/).length;
    if (section2WordCount > 25) {
      errors.push(`Section 2️⃣ > 25 mots (${section2WordCount})`);
    }
  }

  // Lecture en creux obligatoire
  const hasReadingInDepth =
    /ce n['']est probablement pas .* mais plutôt .*/i.test(mirror);

  if (!hasReadingInDepth) {
    errors.push("Lecture en creux absente (pas X / plutôt Y)");
  }

  // Termes interdits (anti-synthèse / anti-projection)
  if (
    /(synthèse|conclusion|global|cohérence globale|compatibilité|métier|poste|cadre|recrut|matching|orientation)/i.test(
      mirror
    )
  ) {
    errors.push("Formulation interdite détectée");
  }

  return {
    valid: errors.length === 0,
    errors,
    section1WordCount,
    section2WordCount,
    hasReadingInDepth,
  };
}
