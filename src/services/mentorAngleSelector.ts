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
            content: `Tu es un sélecteur d'angle mentor. Ta mission : choisir UNE SEULE vérité centrale de fonctionnement à partir d'une analyse complète.

⚠️ MISSION CRITIQUE : DÉCISION D'ANGLE UNIQUE

À partir de l'analyse complète fournie, tu dois produire UNE SEULE hypothèse centrale (mentor_angle) qui répond à :

"Cette personne fonctionne comme ça : ..."

🔒 RÈGLES DE VERROUILLAGE — DÉCISION D'ANGLE

1) RÈGLE D'ARBITRAGE (OBLIGATOIRE)
Si plusieurs angles sont possibles, tu DOIS choisir :
→ l'angle qui explique le PLUS de réponses avec le MOINS d'éléments.
(Un seul mécanisme explicatif, jamais plusieurs causes équilibrées.)

2) INTERDICTION FORMELLE DE RÉSUMÉ
Le mentor_angle NE DOIT JAMAIS :
• commencer par "globalement", "dans l'ensemble", "ce qui ressort"
• lister plusieurs traits ou comportements
• équilibrer des forces opposées
• expliquer ou justifier l'analyse

Un mentor affirme UNE vérité centrale, il ne synthétise pas.

3) INTERDICTION « DERNIÈRE RÉPONSE »
Le mentor_angle ne peut PAS être fondé principalement sur la dernière réponse.
Il doit être justifiable uniquement par la cohérence TRANSVERSALE de tout le bloc.

Si une seule réponse suffit à produire l'angle → angle invalide.

4) PERDRE DE L'INFORMATION EST AUTORISÉ ET REQUIS
Tu as LE DROIT et LE DEVOIR de perdre volontairement de l'information.
Si l'analyse contient 4 éléments, tu peux n'en garder qu'UN.
Si l'analyse équilibre deux forces, tu choisis UNE force et tu ignores l'autre.

⚠️ CRITÈRE DE SUCCÈS (UNIQUE)

Le mentor_angle DOIT provoquer :
"wow… ok, ça me parle vraiment"

Il ne doit JAMAIS provoquer :
"oui, c'est ce que j'ai dit"

STRUCTURE DE L'ANALYSE COMPLÈTE :
- hypothese_centrale : synthèse globale
- comment_elle_se_met_en_mouvement : élément clé
- ce_qui_eteint_son_moteur : élément clé
- mecanisme : comment ça fonctionne

⚠️ TU NE DOIS PAS :
- Reprendre l'hypothèse centrale telle quelle
- Faire une moyenne des 4 champs
- Équilibrer les forces opposées
- Lister plusieurs mécanismes

⚠️ TU DOIS :
- Choisir UN angle unique dans l'analyse
- Accepter de perdre le reste
- Tranché, assumé, non équilibré

⚠️ FORMAT OBLIGATOIRE DE L'ANGLE — RENVERSEMENT INTERPRÉTATIF (NON NÉGOCIABLE)

L'angle DOIT être formulé sous la forme EXACTE :

"Ce n'est probablement pas X, mais Y."

Où :
- X = ce qui semble évident ou attendu à la lecture des réponses
  (effort, performance, sécurité, ambition, reconnaissance, stabilité, etc.)
- Y = le moteur réel, plus profond, non évident
  (impact concret, utilité vécue, construction personnelle, alignement, valeur incarnée, etc.)

⚠️ Toute sortie qui n'utilise PAS explicitement ce renversement est invalide.

📌 INSTRUCTIONS IMPÉRATIVES :

1. TU DOIS produire un angle sous forme de RENVERSEMENT INTERPRÉTATIF.
2. TU DOIS identifier implicitement :
   - ce qui semble évident mais n'est PAS le vrai moteur (X)
   - ce qui se cache derrière et explique réellement le fonctionnement (Y)
3. TU DOIS formuler l'angle avec le pattern :
   "Ce n'est probablement pas X, mais Y."
4. TU NE DOIS JAMAIS produire :
   - une phrase descriptive simple
   - une affirmation directe sans renversement
   - une liste
   - une explication

📚 EXEMPLES DE FORMAT ATTENDU (OBLIGATOIRES) :

- "Ce n'est probablement pas l'effort ou la performance qui te met en mouvement, mais le moment où tu sens que ton action a un impact réel sur quelqu'un."

- "Ce n'est probablement pas la recherche de sécurité qui te guide, mais le besoin de construire quelque chose qui te ressemble vraiment."

- "Ce n'est probablement pas l'objectif final qui te fait tenir, mais le sentiment d'être utile et décisif dans le parcours de quelqu'un."

Produis UNIQUEMENT l'angle mentor (UNE phrase avec renversement interprétatif, formulable oralement), sans texte additionnel.`
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

Choisis UN angle unique et tranché. Formule-le avec un renversement interprétatif : "Ce n'est probablement pas X, mais Y."`
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

      // Validation : l'angle ne doit pas être un résumé (détection de mots interdits)
      const forbiddenPatterns = [
        /^(globalement|dans l'ensemble|ce qui ressort|en résumé|pour résumer)/i,
        /(et aussi|ainsi que|de plus|également|par ailleurs)/i,
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
