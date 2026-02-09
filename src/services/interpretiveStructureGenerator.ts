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
 * ⚠️ HYPOTHÈSE CENTRALE OBLIGATOIRE
 * Cette structure doit contenir UNE hypothèse centrale formulable oralement
 * qui répond à : "Comment cette personne se met en mouvement, et qu'est-ce qui éteint son moteur ?"
 * 
 * La structure JSON est la décomposition logique de cette hypothèse centrale.
 */
export type InterpretiveStructure = {
  hypothese_centrale: string; // Phrase unique : "Cette personne fonctionne comme ça : ..." (formulable oralement)
  comment_elle_se_met_en_mouvement: string; // Élément clé : comment elle se met en mouvement
  ce_qui_eteint_son_moteur: string; // Élément clé : ce qui éteint son moteur
  mecanisme: string; // Comment ça fonctionne concrètement (le mécanisme de fonctionnement)
};

/**
 * Type de bloc pour adapter le contexte d'interprétation
 */
export type BlockType = 
  | 'block1' 
  | 'block2b' 
  | 'block3' 
  | 'block4' 
  | 'block5' 
  | 'block6' 
  | 'block7' 
  | 'block8' 
  | 'block9' 
  | 'synthesis' 
  | 'matching';

/**
 * Génère une structure interprétative froide et logique pour TOUS les blocs
 * 
 * ÉTAPE 1 — INTERPRÉTATION (FROIDE, LOGIQUE)
 * - Modèle : gpt-4o-mini (coût réduit)
 * - Temperature : 0.3 (stabilité)
 * - Output : JSON structuré (pas de texte final)
 * 
 * ⚠️ RÈGLE ABSOLUE : HYPOTHÈSE CENTRALE OBLIGATOIRE
 * L'output doit être UNE hypothèse centrale de fonctionnement,
 * formulable à l'oral ainsi : "Cette personne fonctionne comme ça : ..."
 * 
 * Ce n'est PAS : une moyenne, une liste de traits, un résumé, une reformulation.
 * C'est un MÉCANISME : ce qui met en mouvement, ce qui éteint le moteur, la tension centrale.
 * 
 * @param userAnswers Réponses utilisateur du bloc concerné
 * @param blockType Type de bloc (contexte ≠ profondeur)
 * @param additionalContext Contexte additionnel (œuvres, personnages, etc.) pour certains blocs
 * @returns Structure interprétative JSON
 */
export async function generateInterpretiveStructure(
  userAnswers: string[],
  blockType: BlockType,
  additionalContext?: string
): Promise<InterpretiveStructure> {
  if (!userAnswers || userAnswers.length === 0) {
    throw new Error('userAnswers cannot be empty');
  }

  const answersContext = userAnswers
    .map((answer, index) => `Q${index + 1}: ${answer}`)
    .join('\n');

  // Adapter le contexte selon le type de bloc (contexte ≠ profondeur)
  const blockContext = getBlockContext(blockType, additionalContext);

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

⚠️ MISSION CRITIQUE : HYPOTHÈSE CENTRALE DE FONCTIONNEMENT

À partir de TOUTES les réponses du bloc, tu dois produire UNE hypothèse centrale (dans ta tête, pas dans le output)
qui répond à cette question :

"Comment cette personne se met en mouvement, et qu'est-ce qui éteint son moteur ?"

RÈGLE ABSOLUE :
- Cette hypothèse centrale DOIT être formulable ainsi : "Cette personne fonctionne comme ça : ..."
- Si l'hypothèse ne peut pas être reformulée ainsi → structure INVALIDE → retry
- On ne veut PAS des traits, on veut un MÉCANISME de fonctionnement
- Prendre en compte L'ENSEMBLE des réponses du bloc
- Ne PAS faire une moyenne des réponses
- Ne PAS lister des traits séparés
- Ne PAS paraphraser ce qui a été dit

RÈGLES STRICTES :
- Aucune mise en forme
- Aucun style
- Aucune phrase mentor
- Pas de reformulation des réponses
- Uniquement de l'inférence logique sur le mécanisme de fonctionnement
- Output : JSON UNIQUEMENT

STRUCTURE JSON OBLIGATOIRE (DÉCOMPOSITION LOGIQUE DE L'HYPOTHÈSE CENTRALE) :
{
  "hypothese_centrale": "phrase unique formulable oralement : 'Cette personne fonctionne comme ça : [mécanisme de fonctionnement]' (1 phrase complète, formulable à l'oral)",
  "comment_elle_se_met_en_mouvement": "élément clé : comment concrètement elle se met en mouvement (1 phrase précise)",
  "ce_qui_eteint_son_moteur": "élément clé : ce qui concrètement éteint son moteur (1 phrase précise)",
  "mecanisme": "comment ça fonctionne concrètement (le mécanisme de fonctionnement, 1 phrase précise)"
}

⚠️ VALIDATION CRITIQUE :
- L'hypothèse centrale DOIT commencer par "Cette personne fonctionne comme ça :" ou être reformulable ainsi
- Si l'hypothèse centrale ne décrit pas un MÉCANISME mais des TRAITS → structure INVALIDE
- Si l'hypothèse centrale est vague ou générique → structure INVALIDE
- Chaque champ doit être PRÉCIS et SPÉCIFIQUE (pas vague, pas générique)
- La structure doit former un TOUT COHÉRENT (décomposition logique de l'hypothèse centrale)

INTERDICTIONS ABSOLUES :
- Reformuler les réponses
- Paraphraser ce qui a été dit
- Faire une moyenne des réponses
- Lister des traits séparés
- Décrire des traits au lieu d'un mécanisme
- Utiliser un langage stylisé
- Produire du texte final (seulement JSON)
- Hypothèse centrale non formulable comme "Cette personne fonctionne comme ça : ..."

${blockContext}

Réponses du candidat (ENSEMBLE À ANALYSER) :
${answersContext}

ÉTAPE 1 : Formule dans ta tête l'hypothèse centrale : "Cette personne fonctionne comme ça : ..."
ÉTAPE 2 : Décompose cette hypothèse en structure JSON (4 champs)

Produis UNIQUEMENT un JSON valide avec TOUS les champs remplis de manière PRÉCISE et SPÉCIFIQUE, sans texte additionnel.`
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

      console.log(`[INTERPRETIVE_STRUCTURE] Structure générée avec succès pour ${blockType}`);
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
 * Génère une structure interprétative froide et logique pour le BLOC 1
 * (Fonction de compatibilité pour migration progressive)
 * 
 * @deprecated Utiliser generateInterpretiveStructure() avec blockType='block1'
 */
export async function generateInterpretiveStructureBlock1(
  userAnswers: string[]
): Promise<InterpretiveStructure> {
  return generateInterpretiveStructure(userAnswers, 'block1');
}

/**
 * Retourne le contexte spécifique au bloc (contexte ≠ profondeur)
 */
function getBlockContext(blockType: BlockType, additionalContext?: string): string {
  switch (blockType) {
    case 'block1':
      return 'CONTEXTE : BLOC 1 — Énergie & moteurs internes\nAnalyse le mécanisme de fonctionnement basé sur les réponses concernant l\'énergie, les moteurs, la pression et l\'ennui.';
    case 'block2b':
      return `CONTEXTE : BLOC 2B — Analyse projective des œuvres\n${additionalContext || ''}\nAnalyse le mécanisme de fonctionnement basé sur les projections narratives (motifs, personnages, traits valorisés).`;
    case 'block3':
      return 'CONTEXTE : BLOC 3 — Valeurs profondes & fonctionnement cognitif\nAnalyse le mécanisme de fonctionnement basé sur les valeurs et la manière de décider.';
    case 'block4':
      return 'CONTEXTE : BLOC 4 — Compétences réelles & illusions\nAnalyse le mécanisme de fonctionnement basé sur le rapport à la valeur, la lucidité, l\'effort vs statut.';
    case 'block5':
      return 'CONTEXTE : BLOC 5 — Ambition & trajectoire future\nAnalyse le mécanisme de fonctionnement basé sur le niveau d\'ambition, l\'horizon, le type de trajectoire.';
    case 'block6':
      return 'CONTEXTE : BLOC 6 — Contraintes & réalités\nAnalyse le mécanisme de fonctionnement basé sur les contraintes réelles (mobilité, salaire, rythme).';
    case 'block7':
      return 'CONTEXTE : BLOC 7 — Identité professionnelle\nAnalyse le mécanisme de fonctionnement basé sur le métier naturel, rêvé, apprenable.';
    case 'block8':
      return 'CONTEXTE : BLOC 8 — Relation au management\nAnalyse le mécanisme de fonctionnement basé sur le style de manager idéal, insupportable, capacité à manager.';
    case 'block9':
      return 'CONTEXTE : BLOC 9 — Style social & dynamique interpersonnelle\nAnalyse le mécanisme de fonctionnement basé sur l\'intro/extraversion, selectivité, rapport au groupe, gestion des conflits.';
    case 'synthesis':
      return 'CONTEXTE : SYNTHÈSE FINALE — Lecture globale unifiée\nAnalyse le mécanisme de fonctionnement global basé sur l\'ENSEMBLE des réponses des blocs 1 à 9.';
    case 'matching':
      return 'CONTEXTE : MATCHING — Compatibilité avec le poste\nAnalyse le mécanisme de fonctionnement en relation avec les exigences du poste (vente, exposition, effort, incertitude, long terme).';
    default:
      return 'CONTEXTE : Analyse du mécanisme de fonctionnement.';
  }
}

/**
 * Valide qu'une structure interprétative contient tous les champs obligatoires
 * et que l'hypothèse centrale est formulable oralement comme "Cette personne fonctionne comme ça : ..."
 */
function validateStructure(structure: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const requiredFields: (keyof InterpretiveStructure)[] = [
    'hypothese_centrale',
    'comment_elle_se_met_en_mouvement',
    'ce_qui_eteint_son_moteur',
    'mecanisme',
  ];

  // Vérifier tous les champs présents et non vides
  for (const field of requiredFields) {
    const value = structure[field];
    
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`Champ manquant ou vide: ${field}`);
      continue;
    }

    const trimmedValue = value.trim();

    // Vérifier longueur minimale (doit être une phrase, pas un mot)
    if (trimmedValue.length < 20) {
      errors.push(`Champ trop court (vague): ${field} (${trimmedValue.length} caractères)`);
    }
  }

  // VALIDATION CRITIQUE : L'hypothèse centrale doit être formulable comme "Cette personne fonctionne comme ça : ..."
  const hypotheseCentrale = structure.hypothese_centrale?.trim() || '';
  
  if (hypotheseCentrale.length > 0) {
    // Vérifier que l'hypothèse décrit un MÉCANISME, pas des traits
    const traitPatterns = [
      /^(elle|il|la personne|le candidat|la candidate) (est|a|possède|a besoin|cherche|veut|souhaite|préfère)/i,
      /^(elle|il|la personne|le candidat|la candidate) (a tendance|a l'habitude|fait souvent|fait toujours)/i,
    ];
    
    const isTraitDescription = traitPatterns.some(pattern => pattern.test(hypotheseCentrale));
    
    if (isTraitDescription) {
      errors.push(`Hypothèse centrale décrit des TRAITS au lieu d'un MÉCANISME: "${hypotheseCentrale.substring(0, 100)}..."`);
    }

    // Vérifier que l'hypothèse est formulable comme "Cette personne fonctionne comme ça : ..."
    // (doit contenir des mots liés au fonctionnement, au mécanisme, à la dynamique)
    const mecanismePatterns = [
      /(fonctionne|se met en mouvement|s'engage|s'active|s'éteint|déclenche|provoque|crée|génère)/i,
      /(quand|dès que|si|tant que|à condition que|dans le cas où)/i,
      /(mécanisme|dynamique|processus|fonctionnement|moteur|levier)/i,
    ];
    
    const hasMecanisme = mecanismePatterns.some(pattern => pattern.test(hypotheseCentrale));
    
    if (!hasMecanisme && hypotheseCentrale.length > 30) {
      errors.push(`Hypothèse centrale ne décrit pas un MÉCANISME de fonctionnement: "${hypotheseCentrale.substring(0, 100)}..."`);
    }

    // Vérifier que l'hypothèse n'est pas trop vague
    const vagueWords = ['important', 'essentiel', 'nécessaire', 'utile', 'bien', 'mieux', 'souvent', 'parfois', 'généralement'];
    const vagueCount = vagueWords.filter(word => 
      hypotheseCentrale.toLowerCase().includes(word)
    ).length;
    
    if (vagueCount > 2) {
      errors.push(`Hypothèse centrale trop vague (trop de mots génériques)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
