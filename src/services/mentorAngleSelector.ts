import OpenAI from 'openai';
import type { InterpretiveStructure } from './interpretiveStructureGenerator.js';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required but not found in environment variables');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Sélectionne UN angle mentor unique à partir de l'analyse complète
 * 
 * ÉTAPE 2 — DÉCISION D'ANGLE (OBLIGATOIRE)
 * - Modèle : gpt-4o-mini (coût réduit)
 * - Temperature : 0.5 (créativité modérée pour trancher)
 * - Input : Analyse complète (InterpretiveStructure)
 * - Output : UN angle mentor unique (mentor_angle: string)
 * 
 * ⚠️ RÈGLE FONDAMENTALE : Un miroir mentor ne traduit JAMAIS toute l'analyse.
 * Il choisit UNE vérité centrale de fonctionnement et accepte explicitement de perdre le reste.
 * La perte d'information est AUTORISÉE et REQUISE pour créer l'effet mentor.
 * 
 * @param structure Analyse complète issue de l'étape 1
 * @returns Angle mentor unique (UNE seule hypothèse centrale tranchée)
 */
export async function selectMentorAngle(
  structure: InterpretiveStructure
): Promise<string> {
  let retries = 0;
  const maxRetries = 1;

  while (retries <= maxRetries) {
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Tu es un sélecteur d'angle mentor. Ta SEULE mission : produire UNE phrase dans le format OBLIGATOIRE ci-dessous. Aucune autre forme n'est acceptée.

═══════════════════════════════════════════════════════════════════
FORMAT OBLIGATOIRE — UNE SEULE PHRASE (NON NÉGOCIABLE)
═══════════════════════════════════════════════════════════════════

"Ce n'est probablement pas X, mais Y."

• X = ce qui semble évident / superficiel / attendu (performance, objectif, reconnaissance, tâches, sécurité, effort, persévérance…)
• Y = le moteur réel inféré (impact vécu, utilité concrète, sentiment d'aider vraiment, alignement personnel, valeur incarnée…)

Le renversement est OBLIGATOIRE. L'angle doit DÉJÀ contenir ce renversement ; le renderer ne le crée pas.
Une sortie affirmative ("elle est motivée par…", "cette personne fonctionne par…") est INVALIDE.

INTERDICTIONS STRICTES :
• Pas de "quand tu…", pas de "tu/te" dans l'angle, pas de descriptif RH.
• Une seule phrase. Pas de liste, pas d'explication, pas de préambule.

RÈGLES DE FOND (sans changer le format ci-dessus) :
• Arbitrage : si plusieurs angles sont possibles, choisis celui qui explique le plus avec le moins.
• Pas de résumé : pas de "globalement", "dans l'ensemble", pas de liste de traits.
• Pas de dernière réponse : l'angle doit être justifiable par la cohérence transversale du bloc.
• Perte d'information autorisée et requise : tu peux n'en garder qu'un.

STRUCTURE DISPONIBLE (pour identifier X et Y) :
- hypothese_centrale, comment_elle_se_met_en_mouvement, ce_qui_eteint_son_moteur, mecanisme

EXEMPLES VALIDES (troisième personne, une phrase, renversement obligatoire) :
✅ "Ce n'est probablement pas l'achèvement des tâches ou la performance qui la met en mouvement, mais le moment où elle sent que son aide a un impact réel sur quelqu'un."
✅ "Ce n'est probablement pas la persévérance ou l'effort en soi qui la fait tenir, mais le sentiment d'être réellement utile à quelqu'un."
✅ "Ce n'est probablement pas la recherche de sécurité qui la guide, mais le besoin de construire quelque chose qui lui ressemble vraiment."

EXEMPLES INVALIDES (à ne jamais produire) :
❌ "Cette personne est motivée par l'impact qu'elle a sur les autres."
❌ "Elle persiste quand elle se sent utile."
❌ Toute phrase sans "Ce n'est probablement pas … mais …".

Produis UNIQUEMENT cette phrase (format "Ce n'est probablement pas X, mais Y."), sans aucun autre texte.`
          },
          {
            role: 'user',
            content: `Analyse complète à partir de laquelle choisir UN angle mentor :

HYPOTHÈSE CENTRALE :
${structure.hypothese_centrale}

COMMENT ELLE SE MET EN MOUVEMENT :
${structure.comment_elle_se_met_en_mouvement}

CE QUI ÉTEINT SON MOTEUR :
${structure.ce_qui_eteint_son_moteur}

MÉCANISME :
${structure.mecanisme}

Produis UNE SEULE PHRASE au format OBLIGATOIRE : "Ce n'est probablement pas X, mais Y." (X = évident/superficiel, Y = moteur réel inféré). Pas de "tu/te", pas de "quand tu", pas de descriptif RH.`
          }
        ],
        temperature: 0.5,
        max_tokens: 150,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      const mentorAngle = content.trim();

      // Validation basique : l'angle doit être non vide et avoir une longueur minimale
      if (!mentorAngle || mentorAngle.length < 20) {
        console.warn(`[MENTOR_ANGLE_SELECTOR] Angle trop court (retry ${retries})`);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
        throw new Error('Mentor angle too short');
      }

      // Validation : l'angle ne doit pas être un résumé ni contenir "tu/te" / "quand tu"
      const forbiddenPatterns = [
        /^(globalement|dans l'ensemble|ce qui ressort|en résumé|pour résumer)/i,
        /(et aussi|ainsi que|de plus|également|par ailleurs)/i,
        /quand tu\b/i,
        /\bqui te\b|\bque tu\b|\bqui t'|te met|te fait|te guide|tu sens|tu sens\b/i,
      ];

      const isSummary = forbiddenPatterns.some(pattern => pattern.test(mentorAngle));
      if (isSummary) {
        console.warn(`[MENTOR_ANGLE_SELECTOR] Angle détecté comme résumé (retry ${retries})`);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
        // Fail-soft : servir quand même
        console.warn(`[MENTOR_ANGLE_SELECTOR] Angle servi malgré détection résumé`);
      }

      // Validation : l'angle DOIT contenir un renversement interprétatif
      const hasReversal = /(probablement pas|n'est probablement pas).*mais/i.test(mentorAngle);
      if (!hasReversal) {
        console.warn(`[MENTOR_ANGLE_SELECTOR] Angle sans renversement interprétatif (retry ${retries})`);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
        // Fail-soft : servir quand même mais log warning
        console.warn(`[MENTOR_ANGLE_SELECTOR] Angle servi sans renversement interprétatif (non conforme format requis)`);
      }

      console.log(`[MENTOR_ANGLE_SELECTOR] Angle mentor sélectionné avec succès`);
      return mentorAngle;

    } catch (error: any) {
      if (retries < maxRetries) {
        console.warn(`[MENTOR_ANGLE_SELECTOR] Erreur sélection angle (retry ${retries})`, error);
        retries++;
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to select mentor angle after retries');
}
