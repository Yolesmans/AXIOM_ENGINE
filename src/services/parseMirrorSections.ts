export function parseMirrorSections(mirror: string): string[] {
  const sections: string[] = [];

  const s1 = mirror.match(/1️⃣[^\n]*\n([^2️⃣]*)/s);
  const s2 = mirror.match(/2️⃣[^\n]*\n([^3️⃣]*)/s);
  const s3 = mirror.match(/3️⃣[^\n]*\n(.*)/s);

  if (s1) sections.push("1️⃣ Lecture implicite\n\n" + s1[1].trim());
  if (s2) sections.push("2️⃣ Déduction personnalisée\n\n" + s2[1].trim());
  if (s3) sections.push("3️⃣ Validation ouverte\n\n" + s3[1].trim());

  return sections;
}
