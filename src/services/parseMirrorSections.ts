/**
 * Parse un miroir REVELIOM en sections (1️⃣, 2️⃣, 3️⃣)
 * Fonction PURE : pas de side effects
 */
export function parseMirrorSections(mirror: string): string[] {
  // Section 1 = de "1️⃣" jusqu'avant "2️⃣"
  const section1Match = mirror.match(/1️⃣[\s\S]*?\n([\s\S]*?)(?=2️⃣)/);
  // Section 2 = de "2️⃣" jusqu'avant "3️⃣"
  const section2Match = mirror.match(/2️⃣[\s\S]*?\n([\s\S]*?)(?=3️⃣)/);
  // Section 3 = de "3️⃣" jusqu'à la fin
  const section3Match = mirror.match(/3️⃣[\s\S]*?\n([\s\S]*)/);

  const sections: string[] = [];

  if (section1Match) {
    sections.push(section1Match[1].trim());
  }
  if (section2Match) {
    sections.push(section2Match[1].trim());
  }
  if (section3Match) {
    sections.push(section3Match[1].trim());
  }

  // Si parsing échoue, fallback = [mirror]
  if (sections.length !== 3) {
    return [mirror];
  }

  return sections;
}
