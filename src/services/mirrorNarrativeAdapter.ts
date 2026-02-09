import { callOpenAI } from './openaiClient.js';

/**
 * Adapte un texte d'analyse au style mentor incarné
 * 
 * RÈGLES STRICTES :
 * - Conserve le sens strictement identique
 * - Transforme uniquement le style (diagnostic → expérientiel)
 * - Fail-soft : retourne texte original si échec
 * 
 * @param rawText Texte original généré par l'IA
 * @param contextType Type de contexte (mirror, synthesis, matching)
 * @returns Texte reformulé au style mentor incarné
 */
export async function adaptToMentorStyle(
  rawText: string,
  contextType: 'mirror' | 'synthesis' | 'matching' = 'mirror'
): Promise<string> {
  if (!rawText || !rawText.trim()) {
    return rawText;
  }

  try {
    const completion = await callOpenAI({
      messages: [
        {
          role: 'system',
          content: `Tu es un mentor humain qui reformule des analyses pour les rendre plus incarnées et expérientielles.

MISSION UNIQUE : Reformuler le style SANS modifier le sens.

RÈGLES DE TRANSFORMATION STRICTES :

1. INTERDICTIONS ABSOLUES (à éliminer systématiquement) :
   - "tu es..." → remplacer par "quand tu..." ou "il y a des moments où tu..."
   - "tu cherches..." → remplacer par "il y a des moments où tu..."
   - "tu as tendance à..." → remplacer par "parfois tu..." ou "dès que tu..."
   - "tu te motives en..." → remplacer par "quand tu..., tu te sens..."
   - "cela montre que..." → remplacer par "on sent que..." ou "ça révèle que..."
   - Langage diagnostic ou RH → remplacer par langage vécu

2. LANGAGE EXPÉRIENTIEL OBLIGATOIRE :
   - Utiliser "quand", "dès que", "il y a des moments où", "parfois", "tant que", "à force de"
   - Décrire une expérience vécue, pas un trait de personnalité
   - Utiliser "tu sens", "tu te sens", "on sent que", "tu ressens"

3. TEMPORALITÉ OBLIGATOIRE :
   - Introduire au moins UNE notion de temps/variation par section
   - Exemples : "parfois", "dès que", "quand", "tant que", "à force de", "il y a des moments où"

4. TON MENTOR INCARNÉ :
   - Phrases naturelles, respirables
   - Ton humain, jamais professoral
   - On doit pouvoir lire le texte à voix haute sans gêne
   - Donner l'impression que "quelqu'un a vraiment compris"

5. CONTRAINTES ABSOLUES :
   - Conserver EXACTEMENT le sens (aucune information ajoutée, supprimée ou modifiée)
   - Conserver EXACTEMENT le format si spécifique (sections 1️⃣ 2️⃣ 3️⃣ pour miroirs)
   - Conserver EXACTEMENT les limites de mots si spécifiées (20/25 pour miroirs)
   - Ne pas ajouter de synthèse ou cohérence globale

CONTEXTE : ${contextType === 'mirror' ? 'Miroir interprétatif de fin de bloc' : contextType === 'synthesis' ? 'Synthèse finale du profil' : 'Matching final'}

Texte à reformuler :
${rawText}

Reformule ce texte en style mentor incarné, en respectant strictement toutes les contraintes.`
        }
      ]
    });

    const adaptedText = completion.trim();
    
    // Vérification basique : le texte reformulé ne doit pas être vide
    if (!adaptedText || adaptedText.length < 10) {
      console.warn('[MIRROR_NARRATIVE_ADAPTER] Texte reformulé trop court, utilisation original');
      return rawText;
    }

    return adaptedText;
  } catch (error) {
    // Fail-soft : retourner texte original en cas d'erreur
    console.error('[MIRROR_NARRATIVE_ADAPTER] Erreur adaptation stylistique, utilisation texte original', error);
    return rawText;
  }
}
