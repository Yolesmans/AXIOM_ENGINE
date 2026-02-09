import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required but not found in environment variables');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Structure interprétative (froide, logique, non stylisée)
 * Générée par l'étape 1 d'analyse
 */
export type InterpretiveStructure = {
  hypothese_principale: string;
  tension_centrale: string;
  exclusion: string; // Format: "pas X mais Y"
  moteur_implicite: string;
  risque_comportemental: string;
};

/**
 * Génère une structure interprétative froide et logique pour le BLOC 1
 * 
 * ÉTAPE 1 — INTERPRÉTATION (FROIDE, LOGIQUE)
 * - Modèle : gpt-4o-mini (coût réduit)
 * - Temperature : 0.3 (stabilité)
 * - Output : JSON structuré (pas de texte final)
 * 
 * @param userAnswers Réponses utilisateur BLOC 1 uniquement
 * @returns Structure interprétative JSON
 */
export async function generateInterpretiveStructureBlock1(
  userAnswers: string[]
): Promise<InterpretiveStructure> {
  if (!userAnswers || userAnswers.length === 0) {
    throw new Error('userAnswers cannot be empty');
  }

  const answersContext = userAnswers
    .map((answer, index) => `Q${index + 1}: ${answer}`)
    .join('\n');

  let retries = 0;
  const maxRetries = 1;

  while (retries <= maxRetries) {
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Tu es un analyste qui produit une structure interprétative froide et logique.

MISSION : Analyser les réponses pour extraire une structure logique, SANS style, SANS phrases mentor, SANS reformulation.

RÈGLES STRICTES :
- Aucune mise en forme
- Aucun style
- Aucune phrase mentor
- Pas de reformulation des réponses
- Uniquement de l'inférence logique
- Output : JSON UNIQUEMENT

STRUCTURE JSON OBLIGATOIRE :
{
  "hypothese_principale": "hypothèse principale sur ce qui anime le candidat (1 phrase courte)",
  "tension_centrale": "tension ou contradiction principale détectée (1 phrase courte)",
  "exclusion": "ce que ce n'est probablement PAS, mais plutôt ce que c'est (format: 'pas X mais Y')",
  "moteur_implicite": "moteur ou besoin implicite non formulé explicitement (1 phrase courte)",
  "risque_comportemental": "risque ou limite comportementale probable (1 phrase courte)"
}

INTERDICTIONS ABSOLUES :
- Reformuler les réponses
- Paraphraser ce qui a été dit
- Utiliser un langage stylisé
- Produire du texte final (seulement JSON)

Réponses du candidat BLOC 1 :
${answersContext}

Produis UNIQUEMENT un JSON valide, sans texte additionnel.`
          }
        ],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      // Parser le JSON
      let structure: InterpretiveStructure;
      try {
        structure = JSON.parse(content.trim()) as InterpretiveStructure;
      } catch (parseError) {
        console.warn(`[INTERPRETIVE_STRUCTURE] Erreur parsing JSON (retry ${retries})`, parseError);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
        throw new Error('Failed to parse JSON structure');
      }

      // Validation structure (champs présents et non vides)
      const validation = validateStructure(structure);
      if (!validation.valid) {
        console.warn(`[INTERPRETIVE_STRUCTURE] Structure invalide (retry ${retries})`, validation.errors);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
        throw new Error(`Invalid structure: ${validation.errors.join(', ')}`);
      }

      console.log('[INTERPRETIVE_STRUCTURE] Structure générée avec succès pour BLOC 1');
      return structure;

    } catch (error: any) {
      if (retries < maxRetries) {
        console.warn(`[INTERPRETIVE_STRUCTURE] Erreur génération (retry ${retries})`, error);
        retries++;
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to generate interpretive structure after retries');
}

/**
 * Valide qu'une structure interprétative contient tous les champs obligatoires
 */
function validateStructure(structure: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const requiredFields: (keyof InterpretiveStructure)[] = [
    'hypothese_principale',
    'tension_centrale',
    'exclusion',
    'moteur_implicite',
    'risque_comportemental',
  ];

  for (const field of requiredFields) {
    if (!structure[field] || typeof structure[field] !== 'string' || structure[field].trim().length === 0) {
      errors.push(`Champ manquant ou vide: ${field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
