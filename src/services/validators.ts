// ============================================
// VALIDATEURS BLOC 2A / 2B — VERROUS TECHNIQUES
// ============================================
// Ces validateurs garantissent que BLOC 2A et 2B ne peuvent pas dériver
// vers des générations génériques ou non spécifiques.

export interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: string[];
}

/**
 * Calcule la similarité entre deux chaînes (coefficient de Jaccard)
 * Retourne un score entre 0 (pas de similarité) et 1 (identique)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) => s.toLowerCase().trim();
  const s1 = normalize(str1);
  const s2 = normalize(str2);
  
  // Si identiques après normalisation
  if (s1 === s2) {
    return 1.0;
  }
  
  // Similarité basée sur mots communs (Jaccard)
  const words1 = new Set(s1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(s2.split(/\s+/).filter(w => w.length > 2));
  
  if (words1.size === 0 && words2.size === 0) {
    return 0;
  }
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Extrait les propositions d'une question à choix multiples
 * Format attendu : "A. Proposition 1\nB. Proposition 2\n..."
 */
function extractPropositions(text: string): string[] {
  return text
    .split(/\n/)
    .filter(line => /^[A-E]\./i.test(line.trim()))
    .map(line => line.replace(/^[A-E]\.\s*/i, '').trim())
    .filter(prop => prop.length > 0);
}

/**
 * VALIDATEUR 1 — Spécificité des traits de personnages
 * 
 * Garantit que les traits générés pour différents personnages
 * ne sont pas recyclables ou trop similaires.
 * 
 * Règle critique : Chaque personnage doit avoir des traits UNIQUES.
 * Seuil de similarité : 80% (au-delà = trop proche)
 */
export function validateTraitsSpecificity(
  traitsWork1: string[],
  traitsWork2: string[],
  traitsWork3: string[]
): ValidationResult {
  // Extraire les traits de chaque texte
  const extractTraits = (text: string): string[] => {
    if (typeof text !== 'string') return [];
    return extractPropositions(text);
  };
  
  const allTraits: string[] = [];
  
  // Collecter tous les traits de toutes les œuvres
  traitsWork1.forEach(t => allTraits.push(...extractTraits(t)));
  traitsWork2.forEach(t => allTraits.push(...extractTraits(t)));
  traitsWork3.forEach(t => allTraits.push(...extractTraits(t)));
  
  // Vérifier qu'on a des traits à valider
  if (allTraits.length === 0) {
    return {
      valid: false,
      error: 'Aucun trait détecté. Format attendu : "A. Trait 1\nB. Trait 2\n..."'
    };
  }
  
  // Détecter doublons (traits identiques ou très similaires)
  const duplicates: string[] = [];
  const similarityThreshold = 0.8; // 80% de similarité = trop proche
  
  for (let i = 0; i < allTraits.length; i++) {
    for (let j = i + 1; j < allTraits.length; j++) {
      const similarity = calculateSimilarity(allTraits[i], allTraits[j]);
      if (similarity > similarityThreshold) {
        duplicates.push(`${allTraits[i]} ≈ ${allTraits[j]} (similarité: ${(similarity * 100).toFixed(1)}%)`);
      }
    }
  }
  
  if (duplicates.length > 0) {
    return {
      valid: false,
      error: `Traits trop similaires détectés (${duplicates.length} paire(s)). Chaque personnage doit avoir des traits UNIQUES, non recyclables.`,
      details: duplicates
    };
  }
  
  return { valid: true };
}

/**
 * VALIDATEUR 2 — Spécificité des motifs d'œuvres
 * 
 * Garantit que les motifs générés pour différentes œuvres
 * ne sont pas identiques ou trop similaires.
 * 
 * Règle critique : Chaque œuvre doit avoir des motifs UNIQUES.
 * Seuil de similarité : 70% (au-delà = trop proche)
 */
export function validateMotifsSpecificity(
  motifWork1: string,
  motifWork2: string,
  motifWork3: string
): ValidationResult {
  const props1 = extractPropositions(motifWork1);
  const props2 = extractPropositions(motifWork2);
  const props3 = extractPropositions(motifWork3);
  
  // Vérifier qu'on a des propositions pour chaque œuvre
  if (props1.length === 0 || props2.length === 0 || props3.length === 0) {
    return {
      valid: false,
      error: 'Format motifs incorrect. Format attendu : "A. Motif 1\nB. Motif 2\n..." (5 propositions par œuvre)'
    };
  }
  
  // Vérifier qu'on a bien 5 propositions par œuvre
  if (props1.length !== 5 || props2.length !== 5 || props3.length !== 5) {
    return {
      valid: false,
      error: `Nombre de propositions incorrect. Attendu : 5 par œuvre. Reçu : ${props1.length}, ${props2.length}, ${props3.length}`
    };
  }
  
  // Vérifier que chaque œuvre a des propositions différentes
  const allProps = [...props1, ...props2, ...props3];
  const duplicates: string[] = [];
  const similarityThreshold = 0.7; // 70% de similarité = trop proche
  
  for (let i = 0; i < allProps.length; i++) {
    for (let j = i + 1; j < allProps.length; j++) {
      const similarity = calculateSimilarity(allProps[i], allProps[j]);
      if (similarity > similarityThreshold) {
        duplicates.push(`${allProps[i]} ≈ ${allProps[j]} (similarité: ${(similarity * 100).toFixed(1)}%)`);
      }
    }
  }
  
  if (duplicates.length > 0) {
    return {
      valid: false,
      error: `Motifs trop similaires entre œuvres (${duplicates.length} paire(s)). Chaque œuvre doit avoir des motifs UNIQUES, spécifiques à cette œuvre.`,
      details: duplicates
    };
  }
  
  return { valid: true };
}

/**
 * VALIDATEUR 3 — Synthèse finale BLOC 2B
 * 
 * Garantit que la synthèse finale respecte le format et le contenu attendus :
 * - Croise motifs + personnages + traits
 * - Fait ressortir des constantes claires
 * - Longueur : 4-6 lignes
 */
export function validateSynthesis2B(content: string): ValidationResult {
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return {
      valid: false,
      error: 'Synthèse BLOC 2B vide ou invalide'
    };
  }
  
  // Vérifier présence mots-clés obligatoires (rapport au pouvoir, pression, relations, responsabilité)
  const requiredKeywords = [
    { pattern: /rapport.*pouvoir|pouvoir|autorité/i, name: 'rapport au pouvoir' },
    { pattern: /rapport.*pression|pression|stress/i, name: 'rapport à la pression' },
    { pattern: /rapport.*relation|relation|interpersonnel/i, name: 'rapport aux relations' },
    { pattern: /responsabilité|responsable/i, name: 'responsabilité' }
  ];
  
  const missing = requiredKeywords.filter(kw => !kw.pattern.test(content));
  
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Synthèse BLOC 2B incomplète : manque ${missing.length} élément(s) obligatoire(s) : ${missing.map(kw => kw.name).join(', ')}`
    };
  }
  
  // Vérifier longueur (4-6 lignes)
  const lines = content.split(/\n/).filter(l => l.trim().length > 0);
  if (lines.length < 4 || lines.length > 6) {
    return {
      valid: false,
      error: `Synthèse BLOC 2B : longueur incorrecte (${lines.length} lignes, attendu 4-6 lignes)`
    };
  }
  
  // Vérifier croisement motifs + personnages + traits
  const hasMotifs = /motif|attire|attraction|ce qui.*attire/i.test(content);
  const hasPersonnages = /personnage|caractère|protagoniste/i.test(content);
  const hasTraits = /trait|apprécie|valorise|ce que.*apprécie/i.test(content);
  
  if (!hasMotifs || !hasPersonnages || !hasTraits) {
    const missingElements: string[] = [];
    if (!hasMotifs) missingElements.push('motifs');
    if (!hasPersonnages) missingElements.push('personnages');
    if (!hasTraits) missingElements.push('traits');
    
    return {
      valid: false,
      error: `Synthèse BLOC 2B : ne croise pas tous les éléments requis. Manque : ${missingElements.join(', ')}`
    };
  }
  
  return { valid: true };
}

/**
 * VALIDATEUR 4 — Question 2A.1 (Médium)
 * 
 * Garantit que la question 2A.1 contient bien "A. Série" et "B. Film"
 */
export function validateQuestion2A1(content: string): ValidationResult {
  if (!content || typeof content !== 'string') {
    return {
      valid: false,
      error: 'Question 2A.1 vide ou invalide'
    };
  }
  
  // Accepter "A. Série" / "A) Série" / "A Série" et idem pour B. Film
  const hasSerie = /A\s*[\.\)]?\s*(Série|série)/i.test(content);
  const hasFilm = /B\s*[\.\)]?\s*(Film|film)/i.test(content);
  
  if (!hasSerie || !hasFilm) {
    const missing: string[] = [];
    if (!hasSerie) missing.push('option Série (A. ou A))');
    if (!hasFilm) missing.push('option Film (B. ou B))');
    
    return {
      valid: false,
      error: `Question 2A.1 : format incorrect. Manque : ${missing.join(', ')}`
    };
  }
  
  return { valid: true };
}

/**
 * VALIDATEUR 5 — Question 2A.3 (Œuvre noyau)
 * 
 * Garantit que la question 2A.3 demande bien une œuvre unique
 */
export function validateQuestion2A3(content: string): ValidationResult {
  if (!content || typeof content !== 'string') {
    return {
      valid: false,
      error: 'Question 2A.3 vide ou invalide'
    };
  }
  
  const asksForOne = /une|un|1|seule|unique/i.test(content);
  const asksForWork = /œuvre|série|film|titre|nom.*œuvre/i.test(content);
  
  if (!asksForOne || !asksForWork) {
    const missing: string[] = [];
    if (!asksForOne) missing.push('demande d\'une œuvre UNIQUE');
    if (!asksForWork) missing.push('mention d\'œuvre/série/film');
    
    return {
      valid: false,
      error: `Question 2A.3 : format incorrect. Manque : ${missing.join(', ')}`
    };
  }
  
  return { valid: true };
}
