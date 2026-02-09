import { callOpenAI } from './openaiClient.js';
import { validateMentorStyle } from './validateMentorStyle.js';

/**
 * Adapte un texte d'analyse au style mentor incarné
 * 
 * RÈGLES STRICTES :
 * - Conserve le sens strictement identique
 * - Transforme uniquement le style (diagnostic → expérientiel)
 * - Validation stricte post-reformulation
 * - Retry automatique si validation échoue
 * - Fail-soft : retourne texte original si échec final
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

  let retries = 0;
  const maxRetries = 2; // Maximum 2 retries pour garantir le rendu

  while (retries <= maxRetries) {
    try {
      const prompt = retries === 0
        ? getReformulationPrompt(rawText, contextType)
        : getStrictReformulationPrompt(rawText, contextType, retries);

      const completion = await callOpenAI({
        messages: [
          {
            role: 'system',
            content: prompt
          }
        ]
      });

      const adaptedText = completion.trim();
      
      // Vérification basique : le texte reformulé ne doit pas être vide
      if (!adaptedText || adaptedText.length < 10) {
        console.warn(`[MIRROR_NARRATIVE_ADAPTER] Texte reformulé trop court (retry ${retries}), utilisation original`);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
        return rawText;
      }

      // VALIDATION STRICTE : Vérifier que le style mentor est respecté
      const validation = validateMentorStyle(adaptedText);
      
      if (validation.valid) {
        console.log(`[MIRROR_NARRATIVE_ADAPTER] Texte reformulé validé (retry ${retries})`);
        return adaptedText;
      }

      // Validation échouée → retry si possible
      if (retries < maxRetries) {
        console.warn(`[MIRROR_NARRATIVE_ADAPTER] Validation échouée (retry ${retries}), erreurs:`, validation.errors);
        retries++;
        continue;
      }

      // Dernier retry échoué → log d'erreur et servir texte original
      console.error(`[MIRROR_NARRATIVE_ADAPTER] Validation échouée après ${maxRetries} retries, utilisation texte original`, validation.errors);
      return rawText;

    } catch (error) {
      // Erreur API → retry si possible
      if (retries < maxRetries) {
        console.warn(`[MIRROR_NARRATIVE_ADAPTER] Erreur API (retry ${retries}), nouvelle tentative`, error);
        retries++;
        continue;
      }
      
      // Dernier retry échoué → fail-soft
      console.error('[MIRROR_NARRATIVE_ADAPTER] Erreur adaptation stylistique après retries, utilisation texte original', error);
      return rawText;
    }
  }

  // Ne devrait jamais arriver ici, mais fail-soft
  return rawText;
}

/**
 * Prompt de reformulation standard (première tentative)
 */
function getReformulationPrompt(rawText: string, contextType: 'mirror' | 'synthesis' | 'matching'): string {
  return `Tu es un mentor humain qui reformule des analyses pour les rendre plus incarnées et expérientielles.

MISSION UNIQUE : Reformuler le style SANS modifier le sens.

⚠️ RÈGLES DE TRANSFORMATION STRICTES (NON NÉGOCIABLES) :

1. INTERDICTIONS ABSOLUES (à éliminer systématiquement) :
   - "tu es..." → remplacer par "quand tu..." ou "il y a des moments où tu..."
   - "tu cherches..." → remplacer par "il y a des moments où tu..."
   - "tu as tendance à..." → remplacer par "parfois tu..." ou "dès que tu..."
   - "tu te motives en..." → remplacer par "quand tu..., tu te sens..."
   - "votre moteur est..." → remplacer par "quand tu..., tu te sens..."
   - "vous recherchez..." → remplacer par "il y a des moments où tu..."
   - "ton moteur", "votre moteur", "ta recherche", "votre recherche" → remplacer par des dynamiques vécues
   - "cela montre que..." → remplacer par "on sent que..." ou "ça révèle que..."
   - Langage diagnostic ou RH → remplacer par langage vécu

2. OBLIGATIONS STRICTES (à appliquer systématiquement) :
   - TOUTES les phrases d'analyse DOIVENT commencer par un marqueur expérientiel :
     * "Quand tu..."
     * "Dès que tu..."
     * "Il y a des moments où tu..."
     * "Parfois tu..."
     * "Tant que tu..."
     * "À force de..."
     * "Dès lors que tu..."
     * "Chaque fois que tu..."
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

5. CONTRAINTES ABSOLUES :
   - Conserver EXACTEMENT le sens (aucune information ajoutée, supprimée ou modifiée)
   - Conserver EXACTEMENT le format si spécifique (sections 1️⃣ 2️⃣ 3️⃣ pour miroirs)
   - Conserver EXACTEMENT les limites de mots si spécifiées (20/25 pour miroirs)
   - Ne pas ajouter de synthèse ou cohérence globale

⚠️ VALIDATION INTERNE :
- Si le texte reformulé contient encore "tu es..." ou "votre..." en début de phrase d'analyse → REJETER et reformuler à nouveau
- Si le texte reformulé ne contient pas au moins un marqueur expérientiel par phrase d'analyse → REJETER et reformuler à nouveau

CONTEXTE : ${contextType === 'mirror' ? 'Miroir interprétatif de fin de bloc' : contextType === 'synthesis' ? 'Synthèse finale du profil' : 'Matching final'}

Texte à reformuler :
${rawText}

Reformule ce texte en style mentor incarné, en respectant strictement toutes les contraintes.`;
}

/**
 * Prompt de reformulation strict (retry)
 */
function getStrictReformulationPrompt(
  rawText: string,
  contextType: 'mirror' | 'synthesis' | 'matching',
  retryCount: number
): string {
  return `⚠️ RETRY ${retryCount} — REFORMULATION STRICTE OBLIGATOIRE

La reformulation précédente n'a pas respecté les contraintes linguistiques strictes.

Tu es un mentor humain qui reformule des analyses pour les rendre plus incarnées et expérientielles.

MISSION UNIQUE : Reformuler le style SANS modifier le sens.

⚠️ RÈGLES ABSOLUES (NON NÉGOCIABLES) :

1. INTERDICTIONS FORMELLES (à éliminer ABSOLUMENT) :
   - "tu es..." → OBLIGATOIREMENT remplacer par "quand tu..." ou "il y a des moments où tu..."
   - "vous êtes..." → OBLIGATOIREMENT remplacer par "quand tu..." ou "il y a des moments où tu..."
   - "votre..." → OBLIGATOIREMENT remplacer par "quand tu..." ou "il y a des moments où tu..."
   - "ton moteur", "votre moteur" → OBLIGATOIREMENT remplacer par "quand tu..., tu te sens..."
   - "ta recherche", "votre recherche" → OBLIGATOIREMENT remplacer par "il y a des moments où tu..."
   - "tu cherches..." → OBLIGATOIREMENT remplacer par "il y a des moments où tu..."
   - "tu as tendance à..." → OBLIGATOIREMENT remplacer par "parfois tu..." ou "dès que tu..."

2. OBLIGATIONS STRICTES (à appliquer ABSOLUMENT) :
   - TOUTES les phrases d'analyse DOIVENT OBLIGATOIREMENT commencer par un marqueur expérientiel :
     * "Quand tu..."
     * "Dès que tu..."
     * "Il y a des moments où tu..."
     * "Parfois tu..."
     * "Tant que tu..."
     * "À force de..."
   - AUCUNE exception autorisée
   - INTERDICTION TOTALE de commencer par "tu es", "vous êtes", "votre", "ton", "ta"

3. EXEMPLE DE TRANSFORMATION :
   ❌ "Votre moteur semble être l'autonomie dans le progrès."
   ✅ "Quand tu avances à ton rythme et que tu sens que tu progresses par toi-même, tu te mets naturellement en mouvement."

4. CONTRAINTES ABSOLUES :
   - Conserver EXACTEMENT le sens (aucune information ajoutée, supprimée ou modifiée)
   - Conserver EXACTEMENT le format si spécifique (sections 1️⃣ 2️⃣ 3️⃣ pour miroirs)
   - Conserver EXACTEMENT les limites de mots si spécifiées (20/25 pour miroirs)

CONTEXTE : ${contextType === 'mirror' ? 'Miroir interprétatif de fin de bloc' : contextType === 'synthesis' ? 'Synthèse finale du profil' : 'Matching final'}

Texte à reformuler :
${rawText}

Reformule ce texte en style mentor incarné, en respectant ABSOLUMENT toutes les contraintes. Vérifie que chaque phrase d'analyse commence par un marqueur expérientiel.`;
}
