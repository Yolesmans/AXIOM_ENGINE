import OpenAI from 'openai';
import { validateMentorStyle } from './validateMentorStyle.js';
if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required but not found in environment variables');
}
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
/**
 * Rend une structure interprétative en texte mentor incarné pour TOUS les blocs
 *
 * ÉTAPE 2 — RENDU MENTOR INCARNÉ
 * - Modèle : gpt-4o (qualité narrative)
 * - Temperature : 0.8 (créativité)
 * - Input : UNIQUEMENT la structure JSON (pas les réponses utilisateur)
 * - Output : Texte mentor (format adapté selon blockType)
 *
 * ⚠️ RÈGLE ABSOLUE : Le renderer ne voit JAMAIS les réponses utilisateur.
 * Il ne fait AUCUNE analyse. Il traduit uniquement la structure en langage mentor incarné.
 *
 * @param structure Structure interprétative générée par l'étape 1
 * @param blockType Type de bloc (détermine le format de sortie)
 * @returns Texte mentor incarné (format adapté)
 */
export async function renderMentorStyle(structure, blockType) {
    // Adapter le format selon le type de bloc
    const formatInstructions = getFormatInstructions(blockType);
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

⚠️ RÈGLE ABSOLUE : Tu ne dois RIEN inventer.
Tu traduis UNIQUEMENT l'hypothèse centrale en langage mentor incarné.
Tu ne vois JAMAIS les réponses utilisateur. Tu ne fais AUCUNE analyse.
Tu traduis uniquement la structure JSON.

${formatInstructions}

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
- Ne pas ajouter de synthèse ou cohérence globale

Structure interprétative à reformuler :
${JSON.stringify(structure, null, 2)}

Reformule cette structure en style mentor incarné, en respectant strictement toutes les contraintes.`
                    }
                ],
                temperature: 0.8,
                max_tokens: blockType === 'synthesis' || blockType === 'matching' ? 800 : 200,
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
                console.log(`[MENTOR_STYLE_RENDERER] Texte mentor validé (retry ${retries}, type: ${blockType})`);
                return mentorText;
            }
            // Validation échouée → retry si possible
            if (retries < maxRetries) {
                console.warn(`[MENTOR_STYLE_RENDERER] Validation style échouée (retry ${retries}, type: ${blockType}), erreurs:`, validation.errors);
                retries++;
                continue;
            }
            // Dernier retry échoué → log d'erreur mais servir quand même (fail-soft)
            console.error(`[MENTOR_STYLE_RENDERER] Validation style échouée après ${maxRetries} retries (type: ${blockType}), utilisation texte généré`, validation.errors);
            return mentorText;
        }
        catch (error) {
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
/**
 * Rend une structure interprétative en texte mentor incarné pour le BLOC 1
 * (Fonction de compatibilité pour migration progressive)
 *
 * @deprecated Utiliser renderMentorStyle() avec blockType='block1'
 */
export async function renderMentorStyleBlock1(structure) {
    return renderMentorStyle(structure, 'block1');
}
/**
 * Retourne les instructions de format selon le type de bloc
 */
function getFormatInstructions(blockType) {
    switch (blockType) {
        case 'block1':
        case 'block3':
        case 'block4':
        case 'block5':
        case 'block6':
        case 'block7':
        case 'block8':
        case 'block9':
            // Format REVELIOM (mini-miroir)
            return `⚠️ FORMAT STRICT OBLIGATOIRE — NON NÉGOCIABLE

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

⚠️ CONTRAINTES FORMAT :
- Conserver EXACTEMENT le format (sections 1️⃣ 2️⃣ 3️⃣)
- Conserver EXACTEMENT les limites de mots (20/25 mots)`;
        case 'block2b':
            // Format synthèse BLOC 2B (4-6 lignes)
            return `⚠️ FORMAT STRICT OBLIGATOIRE — SYNTHÈSE BLOC 2B

- 4 à 6 lignes maximum
- Synthèse continue, dense, incarnée, structurante
- Basée sur : hypothese_centrale + comment_elle_se_met_en_mouvement + ce_qui_eteint_son_moteur + mecanisme
- DOIT croiser motifs + personnages + traits (si disponibles dans le contexte)
- DOIT faire ressortir : rapport au pouvoir, rapport à la pression, rapport aux relations, posture face à la responsabilité
- DOIT inclure 1 point de vigilance réaliste, formulé sans jugement
- PAS de format REVELIOM (1️⃣ 2️⃣ 3️⃣)
- PAS de validation ouverte`;
        case 'synthesis':
            // Format synthèse finale (structure libre mais dense)
            return `⚠️ FORMAT STRICT OBLIGATOIRE — SYNTHÈSE FINALE

- Synthèse continue, dense, incarnée, structurante
- Basée sur : hypothese_centrale + comment_elle_se_met_en_mouvement + ce_qui_eteint_son_moteur + mecanisme
- Structure libre mais DOIT couvrir :
  * Ce qui met vraiment en mouvement
  * Comment tu tiens dans le temps
  * Tes valeurs quand il faut agir
  * Ce que révèlent tes projections
  * Tes vraies forces… et tes vraies limites
  * Ton positionnement professionnel naturel
  * Lecture globale — synthèse émotionnelle courte (3-4 phrases)
- PAS de format REVELIOM (1️⃣ 2️⃣ 3️⃣)
- PAS de validation ouverte
- Ton mentor, posé, honnête, jamais institutionnel`;
        case 'matching':
            // Format matching (structure spécifique)
            return `⚠️ FORMAT STRICT OBLIGATOIRE — MATCHING

- Structure OBLIGATOIRE :
━━━━━━━━━━━━━━━━━━
🟢 / 🔵 / 🟠 MATCHING AXIOM — [ISSUE]
━━━━━━━━━━━━━━━━━━

• 1 phrase de verdict clair
• 1 paragraphe explicatif maximum
• Basé sur : hypothese_centrale + comment_elle_se_met_en_mouvement + ce_qui_eteint_son_moteur + mecanisme
• Ton mentor, posé, honnête
• Aucun discours commercial
• Aucune reformulation de la synthèse AXIOM

🔎 Lecture de compatibilité (structure obligatoire) :
- Rapport au cœur du métier → UNE phrase maximum
- Rapport à la durée → UNE phrase maximum
- Cohérence globale → UNE phrase maximum

🧭 Cadrage humain → UNE phrase selon l'ISSUE

💼 PROJECTION CONCRÈTE (si ISSUE = 🟢 ou 🔵) :
- Afficher OBLIGATOIREMENT l'exemple chiffré (texte fixe)
- Lecture personnalisée (2-3 phrases maximum)

🧭 LE CADRE (si ISSUE = 🟢 ou 🔵) :
- Description personnalisée du cadre d'accompagnement

🚀 POUR ALLER PLUS LOIN (bloc figé, texte fixe)`;
        default:
            return `⚠️ FORMAT : Texte mentor incarné basé sur la structure interprétative.`;
    }
}
