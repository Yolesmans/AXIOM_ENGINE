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
 * 
 * ⚠️ ANALYSE GLOBALE OBLIGATOIRE
 * Cette structure doit être une hypothèse centrale de fonctionnement,
 * PAS une moyenne ni une liste de traits.
 */
export type InterpretiveStructure = {
  axe_dominant: string; // Ce qui met réellement la personne en mouvement
  moteur_principal: string; // Ce qui déclenche son engagement
  faux_moteur: string; // Ce qui pourrait sembler moteur mais ne l'est pas
  condition_activation: string; // Dans quelles conditions elle s'engage fortement
  condition_extinction: string; // Dans quelles conditions son moteur s'éteint
  tension_centrale: string; // La dynamique clé qui traverse ses réponses
  risque_comportemental: string; // Ce qui se passe quand le moteur s'éteint
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

⚠️ MISSION CRITIQUE : ANALYSE GLOBALE DU FONCTIONNEMENT

Tu dois produire UNE hypothèse centrale de fonctionnement, PAS une moyenne ni une liste de traits.

RÈGLE ABSOLUE :
- Prendre en compte L'ENSEMBLE des réponses du bloc
- Formuler une hypothèse cohérente sur COMMENT la personne fonctionne réellement
- Ne PAS faire une moyenne des réponses
- Ne PAS lister des traits séparés
- Ne PAS paraphraser ce qui a été dit

RÈGLES STRICTES :
- Aucune mise en forme
- Aucun style
- Aucune phrase mentor
- Pas de reformulation des réponses
- Uniquement de l'inférence logique globale
- Output : JSON UNIQUEMENT

STRUCTURE JSON OBLIGATOIRE (TOUS LES CHAMPS REQUIS) :
{
  "axe_dominant": "ce qui met réellement la personne en mouvement (hypothèse centrale, 1 phrase précise)",
  "moteur_principal": "ce qui déclenche son engagement profond (1 phrase précise)",
  "faux_moteur": "ce qui pourrait sembler moteur mais ne l'est pas réellement (1 phrase précise)",
  "condition_activation": "dans quelles conditions concrètes elle s'engage fortement (1 phrase précise)",
  "condition_extinction": "dans quelles conditions concrètes son moteur s'éteint (1 phrase précise)",
  "tension_centrale": "la dynamique clé qui traverse l'ensemble de ses réponses (1 phrase précise)",
  "risque_comportemental": "ce qui se passe concrètement quand le moteur s'éteint (1 phrase précise)"
}

⚠️ EXIGENCES DE QUALITÉ (VALIDATION STRICTE) :
- Chaque champ doit être PRÉCIS et SPÉCIFIQUE (pas vague, pas générique)
- Chaque champ doit être une HYPOTHÈSE, pas une description
- La structure doit former un TOUT COHÉRENT (pas des éléments isolés)
- Si un champ est vide, vague ou générique → structure INVALIDE → retry

INTERDICTIONS ABSOLUES :
- Reformuler les réponses
- Paraphraser ce qui a été dit
- Faire une moyenne des réponses
- Lister des traits séparés
- Utiliser un langage stylisé
- Produire du texte final (seulement JSON)
- Champs vagues ou génériques

Réponses du candidat BLOC 1 (ENSEMBLE À ANALYSER) :
${answersContext}

Produis UNIQUEMENT un JSON valide avec TOUS les champs remplis de manière PRÉCISE et SPÉCIFIQUE, sans texte additionnel.`
          }
        ],
        temperature: 0.3,
        max_tokens: 400, // Augmenté pour 7 champs au lieu de 5
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
 * et qu'ils sont précis et spécifiques (pas vagues ni génériques)
 */
function validateStructure(structure: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const requiredFields: (keyof InterpretiveStructure)[] = [
    'axe_dominant',
    'moteur_principal',
    'faux_moteur',
    'condition_activation',
    'condition_extinction',
    'tension_centrale',
    'risque_comportemental',
  ];

  // Mots vagues/génériques à détecter (signe de structure insuffisamment précise)
  const vaguePatterns = [
    /^(c'est|ce sont|il y a|on peut|on pourrait|peut-être|probablement|souvent|parfois|généralement|souvent|toujours|jamais)$/i,
    /^(quelque chose|certaines choses|des choses|différentes choses)$/i,
    /^(important|essentiel|nécessaire|utile|bien|mieux|meilleur)$/i,
    /^(besoin|envie|désir|souhait|préférence)$/i, // Trop générique sans précision
  ];

  for (const field of requiredFields) {
    const value = structure[field];
    
    // Vérifier présence et non-vide
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`Champ manquant ou vide: ${field}`);
      continue;
    }

    const trimmedValue = value.trim();

    // Vérifier longueur minimale (doit être une phrase, pas un mot)
    if (trimmedValue.length < 20) {
      errors.push(`Champ trop court (vague): ${field} (${trimmedValue.length} caractères)`);
      continue;
    }

    // Vérifier qu'il n'y a pas que des mots vagues
    const words = trimmedValue.toLowerCase().split(/\s+/);
    const vagueWordCount = words.filter(word => 
      vaguePatterns.some(pattern => pattern.test(word))
    ).length;
    
    if (vagueWordCount > words.length * 0.3) {
      errors.push(`Champ trop vague (trop de mots génériques): ${field}`);
      continue;
    }

    // Vérifier qu'il y a au moins un mot spécifique (longueur > 5 caractères)
    const specificWords = words.filter(word => word.length > 5);
    if (specificWords.length < 2) {
      errors.push(`Champ insuffisamment spécifique: ${field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
