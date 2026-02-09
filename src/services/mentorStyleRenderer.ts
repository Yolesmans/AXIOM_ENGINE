import OpenAI from 'openai';
import { validateMentorStyle } from './validateMentorStyle.js';
import type { InterpretiveStructure } from './interpretiveStructureGenerator.js';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required but not found in environment variables');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Rend une structure interprétative en texte mentor incarné pour le BLOC 1
 * 
 * ÉTAPE 2 — RENDU MENTOR INCARNÉ
 * - Modèle : gpt-4o (qualité narrative)
 * - Temperature : 0.8 (créativité)
 * - Input : UNIQUEMENT la structure JSON (pas les réponses utilisateur)
 * - Output : Texte mentor au format REVELIOM (1️⃣ 2️⃣ 3️⃣)
 * 
 * @param structure Structure interprétative générée par l'étape 1
 * @returns Texte mentor incarné au format REVELIOM
 */
export async function renderMentorStyleBlock1(
  structure: InterpretiveStructure
): Promise<string> {
  let retries = 0;
  const maxRetries = 1;

  while (retries <= maxRetries) {
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Tu es un mentor humain qui reformule une analyse structurée en langage vécu et incarné.

MISSION : Transformer cette structure logique en texte mentor qui provoque "ok… je n'avais pas formulé ça comme ça".

🎯 POSTURE MENTALE

Tu es un mentor qui observe ce qui n'est pas dit.
Tu ne répètes pas ce qu'on te dit, tu révèles ce qui se cache derrière.
Tu ne décris pas, tu infères.
Tu prends un risque interprétatif — c'est ta responsabilité.
Si tu te trompes, le candidat te corrigera, et c'est précieux.

⚠️ FORMAT STRICT OBLIGATOIRE — NON NÉGOCIABLE

⚠️ RÈGLE ABSOLUE : Tu ne dois RIEN inventer.
Tu traduis UNIQUEMENT l'hypothèse centrale en langage mentor incarné.

1️⃣ Lecture implicite
- UNE SEULE phrase
- MAXIMUM 20 mots EXACTEMENT
- Basée sur : hypothese_centrale + comment_elle_se_met_en_mouvement
- Traduis l'hypothèse centrale en langage vécu et expérientiel
- Position interprétative claire
- Lecture en creux obligatoire (montrer le mécanisme, pas les traits)

2️⃣ Déduction personnalisée
- UNE SEULE phrase
- MAXIMUM 25 mots EXACTEMENT
- Basée sur : ce_qui_eteint_son_moteur + mecanisme
- Traduis le mécanisme d'extinction et le fonctionnement concret
- Explicite les conditions concrètes d'engagement et de désengagement
- Lecture en creux obligatoire

3️⃣ Validation ouverte
- Phrase EXACTE et INCHANGÉE :
"Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

⚠️ OBLIGATIONS DE STYLE (STRICTES)

1. INTERDICTIONS ABSOLUES :
   - "tu es..." → remplacer par "quand tu..." ou "il y a des moments où tu..."
   - "tu cherches..." → remplacer par "il y a des moments où tu..."
   - "tu as tendance à..." → remplacer par "parfois tu..." ou "dès que tu..."
   - "ton moteur", "votre moteur" → remplacer par des dynamiques vécues
   - Langage diagnostic ou RH → remplacer par langage vécu

2. OBLIGATIONS STRICTES :
   - TOUTES les phrases d'analyse DOIVENT commencer par un marqueur expérientiel :
     * "Quand tu..."
     * "Dès que tu..."
     * "Il y a des moments où tu..."
     * "Parfois tu..."
     * "Tant que tu..."
     * "À force de..."
   - INTERDICTION ABSOLUE de commencer par "tu es", "vous êtes", "votre", "ton", "ta"
   - Décrire une dynamique vécue, pas un trait de personnalité
   - Utiliser "tu sens", "tu te sens", "on sent que", "tu ressens"

3. TEMPORALITÉ OBLIGATOIRE :
   - Chaque phrase d'analyse DOIT contenir au moins UN marqueur temporel
   - Exemples : "parfois", "dès que", "quand", "tant que", "à force de", "il y a des moments où"

4. TON MENTOR INCARNÉ :
   - Phrases naturelles, respirables
   - Ton humain, jamais professoral
   - On doit pouvoir lire le texte à voix haute sans gêne
   - Donner l'impression que "quelqu'un a vraiment compris"

⚠️ CONTRAINTES ABSOLUES :
- Conserver EXACTEMENT le sens de la structure (aucune information ajoutée, supprimée ou modifiée)
- Conserver EXACTEMENT le format (sections 1️⃣ 2️⃣ 3️⃣)
- Conserver EXACTEMENT les limites de mots (20/25 mots)
- Ne pas ajouter de synthèse ou cohérence globale

Structure interprétative à reformuler :
${JSON.stringify(structure, null, 2)}

Reformule cette structure en style mentor incarné, en respectant strictement toutes les contraintes.`
          }
        ],
        temperature: 0.8,
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      const mentorText = content.trim();

      // Validation basique : le texte reformulé ne doit pas être vide
      if (!mentorText || mentorText.length < 10) {
        console.warn(`[MENTOR_STYLE_RENDERER] Texte reformulé trop court (retry ${retries})`);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
        throw new Error('Rendered text too short');
      }

      // VALIDATION STYLE : Vérifier que le style mentor est respecté
      const validation = validateMentorStyle(mentorText);

      if (validation.valid) {
        console.log(`[MENTOR_STYLE_RENDERER] Texte mentor validé (retry ${retries})`);
        return mentorText;
      }

      // Validation échouée → retry si possible
      if (retries < maxRetries) {
        console.warn(`[MENTOR_STYLE_RENDERER] Validation style échouée (retry ${retries}), erreurs:`, validation.errors);
        retries++;
        continue;
      }

      // Dernier retry échoué → log d'erreur mais servir quand même (fail-soft)
      console.error(`[MENTOR_STYLE_RENDERER] Validation style échouée après ${maxRetries} retries, utilisation texte généré`, validation.errors);
      return mentorText;

    } catch (error: any) {
      // Erreur API → retry si possible
      if (retries < maxRetries) {
        console.warn(`[MENTOR_STYLE_RENDERER] Erreur API (retry ${retries}), nouvelle tentative`, error);
        retries++;
        continue;
      }

      // Dernier retry échoué → fail-soft
      console.error('[MENTOR_STYLE_RENDERER] Erreur rendu mentor après retries', error);
      throw error;
    }
  }

  throw new Error('Failed to render mentor style after retries');
}
