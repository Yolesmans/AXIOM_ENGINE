import OpenAI from 'openai';
import { callOpenAIStream } from './openaiClient.js';
import { validateMentorStyle } from './validateMentorStyle.js';
import type { BlockType } from './interpretiveStructureGenerator.js';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required but not found in environment variables');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** Blocs qui utilisent le format REVELIOM (1️⃣ Lecture implicite, 2️⃣ Déduction, 3️⃣ Validation) */
const REVELIOM_BLOCK_TYPES: BlockType[] = ['block1', 'block3', 'block4', 'block5', 'block6', 'block7', 'block8', 'block9'];

/** Phrase fixe section 3 — inchangée */
const VALIDATION_OUVERTE = 'Dis-moi si ça te parle, ou s\'il y a une nuance importante que je n\'ai pas vue.';

/**
 * Transposition 3ᵉ → 2ᵉ personne pour le rendu utilisateur (REVELIOM).
 * Purement stylistique, déterministe, sans impact sémantique.
 * L'angle reste en 3ᵉ personne en interne ; le texte affiché est toujours en "tu".
 */
function transposeToSecondPerson(text: string): string {
  let out = text;
  // Ordre : expressions longues d'abord pour éviter sous-remplacements
  out = out.replace(/\bcette personne\b/gi, 'tu');
  out = out.replace(/\bla personne\b/gi, 'tu');
  out = out.replace(/\bqu'elle\b/gi, 'que tu');
  out = out.replace(/\bqui la met\b/gi, 'qui te met');
  out = out.replace(/\bqui la fait\b/gi, 'qui te fait');
  out = out.replace(/\bqui la guide\b/gi, 'qui te guide');
  out = out.replace(/\bqui la motive\b/gi, 'qui te motive');
  out = out.replace(/\bqui la tient\b/gi, 'qui te tient');
  out = out.replace(/\bqui la pousse\b/gi, 'qui te pousse');
  out = out.replace(/\bla motive\b/gi, 'te motive');
  out = out.replace(/\bla met\b/gi, 'te met');
  out = out.replace(/\bla fait\b/gi, 'te fait');
  out = out.replace(/\bla guide\b/gi, 'te guide');
  out = out.replace(/\bla tient\b/gi, 'te tient');
  out = out.replace(/\belle\b/g, 'tu');
  out = out.replace(/\bson\b/g, 'ton');
  out = out.replace(/\bsa\b/g, 'ta');
  out = out.replace(/\bses\b/g, 'tes');
  out = out.replace(/\blui\b/g, 'toi');
  return out;
}

/**
 * Rend un angle mentor en texte mentor incarné pour TOUS les blocs
 * 
 * ÉTAPE 3 — RENDU MENTOR INCARNÉ
 * - Modèle : gpt-4o (qualité narrative)
 * - Temperature : 0.8 (créativité)
 * - Input : UNIQUEMENT l'angle mentor (pas l'analyse complète, pas les réponses utilisateur)
 * - Output : Texte mentor (format adapté selon blockType)
 * 
 * ⚠️ RÈGLE ABSOLUE : Le renderer ne voit JAMAIS les réponses utilisateur.
 * Il ne fait AUCUNE analyse. Il incarne uniquement l'angle mentor en langage vécu.
 * 
 * @param mentorAngle Angle mentor unique sélectionné par l'étape 2
 * @param blockType Type de bloc (détermine le format de sortie)
 * @returns Texte mentor incarné (format adapté)
 */
export async function renderMentorStyle(
  mentorAngle: string,
  blockType: BlockType,
  onChunk?: (s: string) => void
): Promise<string> {
  const isReveliomFormat = REVELIOM_BLOCK_TYPES.includes(blockType);

  if (isReveliomFormat) {
    return renderReveliomWithRawAngle(mentorAngle, blockType, onChunk);
  }

  // Autres formats (block2b, synthesis, matching) : flux inchangé
  const formatInstructions = getFormatInstructions(blockType);
  const positionalContext = buildPositionalContext(blockType);

  let retries = 0;
  const maxRetries = 1;

  const systemContent = `${positionalContext}Tu es un mentor humain qui reformule une analyse structurée en langage vécu et incarné.

MISSION : Transformer cette structure logique en texte mentor qui provoque "ok… je n'avais pas formulé ça comme ça".

🎯 POSTURE MENTALE

Tu es un mentor qui observe ce qui n'est pas dit.
Tu ne répètes pas ce qu'on te dit, tu révèles ce qui se cache derrière.
Tu ne décris pas, tu infères.
Tu prends un risque interprétatif — c'est ta responsabilité.
Si tu te trompes, le candidat te corrigera, et c'est précieux.

⚠️ RÈGLE ABSOLUE : Tu ne dois RIEN inventer.
Tu incarnes UNIQUEMENT l'angle mentor en langage vécu et expérientiel.
Tu ne vois JAMAIS les réponses utilisateur. Tu ne fais AUCUNE analyse.
Tu reçois UNIQUEMENT l'angle mentor (pas l'analyse complète, pas les autres champs).

⚠️ MISSION : INCARNER L'ANGLE, PAS LE JUSTIFIER
- Tu n'as PAS à expliquer pourquoi cet angle
- Tu n'as PAS à être exhaustif
- Tu n'as PAS à équilibrer
- Tu dois ASSUMER l'angle et l'incarner

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
- Tu reçois UNIQUEMENT l'angle mentor (pas l'analyse complète)
- Tu n'as PAS à justifier l'angle
- Tu n'as PAS à être exhaustif
- Tu n'as PAS à équilibrer
- Tu dois ASSUMER l'angle et l'incarner en langage vécu

Angle mentor à incarner :
${mentorAngle}

Incarnes cet angle en style mentor incarné. Tu n'as pas à expliquer, tu dois incarner.`;

  while (retries <= maxRetries) {
    try {
      let mentorText: string;
      if (onChunk) {
        const { fullText } = await callOpenAIStream(
          {
            messages: [{ role: 'system', content: systemContent }],
            model: 'gpt-4o',
            temperature: 0.8,
            max_tokens: blockType === 'synthesis' || blockType === 'matching' ? 800 : 200,
          },
          onChunk
        );
        mentorText = fullText;
      } else {
        const response = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'system', content: systemContent }],
          temperature: 0.8,
          max_tokens: blockType === 'synthesis' || blockType === 'matching' ? 800 : 200,
        });
        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No response content from OpenAI');
        }
        mentorText = content.trim();
      }

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
      const rendered = transposeToSecondPerson(mentorText);

      if (validation.valid) {
        console.log(`[MENTOR_STYLE_RENDERER] Texte mentor validé (retry ${retries}, type: ${blockType})`);
        return rendered;
      }

      // Validation échouée → retry si possible
      if (retries < maxRetries) {
        console.warn(`[MENTOR_STYLE_RENDERER] Validation style échouée (retry ${retries}, type: ${blockType}), erreurs:`, validation.errors);
        retries++;
        continue;
      }

      // Dernier retry échoué → log d'erreur mais servir quand même (fail-soft)
      console.error(`[MENTOR_STYLE_RENDERER] Validation style échouée après ${maxRetries} retries (type: ${blockType}), utilisation texte généré`, validation.errors);
      return rendered;

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

const REVELIOM_DEDUCTION_SYSTEM = (positionalContext: string, mentorAngle: string) =>
  `${positionalContext}Tu es un mentor. Tu reçois un ANGLE déjà formulé (lecture en creux : "Ce n'est probablement pas X, mais Y.").

⚠️ RÈGLE STRICTE — SECTIONS

• La section "1️⃣ Lecture implicite" est DÉJÀ RÉDIGÉE : c'est l'angle tel quel. Tu ne la rédiges PAS.
• Tu produis UNIQUEMENT la section "2️⃣ Déduction personnalisée". Une seule phrase.
• La section "3️⃣ Validation ouverte" est fixe, tu ne la produis pas.

═══════════════════════════════════════════════════════════════════
FORMAT OBLIGATOIRE — DÉDUCTION PERSONNALISÉE (NON NÉGOCIABLE)
═══════════════════════════════════════════════════════════════════

Ta phrase DOIT suivre EXACTEMENT cette structure :

« Ce moteur tient tant que … — lorsque … , … »

• Première partie (après "tant que") : condition concrète où le moteur est vivant — en "tu", langage vécu.
• Tiret long " — " (obligatoire).
• Deuxième partie (après "lorsque") : ce qui dilue ou éteint — conséquence sur ton engagement.

Ton : mentor, causal, incarné, vécu. Jamais psychologisant, jamais RH, jamais abstrait. Toujours en 2ᵉ personne (tu / te / ton).

Exemple CANONIQUE :
« Ce moteur tient tant que tu sens que ton action change réellement quelque chose pour quelqu'un — lorsque ce lien se dilue, ton engagement perd de sa force. »

❌ INTERDICTIONS ABSOLUES :
- Ne PAS répéter ni reformuler l'angle (il est déjà en Lecture implicite).
- Ne PAS lister des traits, ne PAS expliquer psychologiquement, ne PAS neutraliser.
- Ne PAS produire de phrase qui ne suit pas la forme "Ce moteur tient tant que … — lorsque … , …".
- Ne PAS employer "quand tu" en début de déduction.
- Ne PAS employer "il est possible que", "tu sembles", "on voit que".
- Ne PAS employer de concepts mous : motivation générale, personnalité, équilibre, etc.

Angle (déjà utilisé en Lecture implicite — ne pas recopier) :
${mentorAngle}

Produis UNIQUEMENT cette phrase (forme "Ce moteur tient tant que … — lorsque … , …"), sans numéro ni titre.`;

/**
 * Rendu REVELIOM avec Lecture implicite = angle brut (sans reformulation).
 * Le LLM ne produit que la section 2 (Déduction personnalisée).
 */
async function renderReveliomWithRawAngle(
  mentorAngle: string,
  blockType: BlockType,
  onChunk?: (s: string) => void
): Promise<string> {
  const positionalContext = buildPositionalContext(blockType);
  let retries = 0;
  const maxRetries = 1;

  while (retries <= maxRetries) {
    try {
      let deduction: string;

      if (onChunk) {
        const prefixRaw = '1️⃣ Lecture implicite\n\n' + mentorAngle + '\n\n2️⃣ Déduction personnalisée\n\n';
        const prefixDisplay = '1️⃣ Lecture implicite\n\n' + transposeToSecondPerson(mentorAngle) + '\n\n2️⃣ Déduction personnalisée\n\n';
        const suffix = '\n\n3️⃣ Validation ouverte\n\n' + VALIDATION_OUVERTE;

        onChunk(prefixDisplay);

        const { fullText: deductionStreamed } = await callOpenAIStream(
          {
            messages: [
              { role: 'system', content: REVELIOM_DEDUCTION_SYSTEM(positionalContext, mentorAngle) },
              { role: 'user', content: 'Déduction personnalisée (une phrase, max 25 mots) :' },
            ],
            model: 'gpt-4o',
            temperature: 0.8,
            max_tokens: 120,
          },
          onChunk
        );
        deduction = deductionStreamed.trim();

        onChunk(suffix);
      } else {
        const response = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: REVELIOM_DEDUCTION_SYSTEM(positionalContext, mentorAngle) },
            { role: 'user', content: 'Déduction personnalisée (une phrase, max 25 mots) :' },
          ],
          temperature: 0.8,
          max_tokens: 120,
        });
        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No response content from OpenAI');
        }
        deduction = content.trim();
      }

      if (!deduction || deduction.length < 10) {
        console.warn(`[MENTOR_STYLE_RENDERER] Déduction trop courte (retry ${retries})`);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
      }

      const mentorText = [
        '1️⃣ Lecture implicite',
        '',
        mentorAngle,
        '',
        '2️⃣ Déduction personnalisée',
        '',
        deduction,
        '',
        '3️⃣ Validation ouverte',
        '',
        VALIDATION_OUVERTE,
      ].join('\n');

      const validation = validateMentorStyle(mentorText);
      const rendered = transposeToSecondPerson(mentorText);
      if (validation.valid) {
        console.log(`[MENTOR_STYLE_RENDERER] Texte REVELIOM (angle brut section 1) validé (type: ${blockType})`);
        return rendered;
      }
      if (retries < maxRetries) {
        console.warn(`[MENTOR_STYLE_RENDERER] Validation échouée (retry ${retries})`, validation.errors);
        retries++;
        continue;
      }
      console.warn(`[MENTOR_STYLE_RENDERER] Validation échouée après retries, utilisation texte assemblé`, validation.errors);
      return rendered;
    } catch (error: any) {
      if (retries < maxRetries) {
        retries++;
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to render REVELIOM after retries');
}

/**
 * Rend un angle mentor en texte mentor incarné pour le BLOC 1
 * (Fonction de compatibilité pour migration progressive)
 * 
 * @deprecated Utiliser renderMentorStyle() avec blockType='block1'
 */
export async function renderMentorStyleBlock1(
  mentorAngle: string
): Promise<string> {
  return renderMentorStyle(mentorAngle, 'block1');
}

/**
 * Construit le contexte mental positionnel (uniquement pour miroirs fin de bloc 1-9)
 */
function buildPositionalContext(blockType: BlockType): string {
  // Extraire le numéro de bloc depuis blockType
  const blockNumber = extractBlockNumber(blockType);
  
  // Appliquer uniquement pour les miroirs fin de bloc (1-9)
  if (blockNumber === null || blockNumber < 1 || blockNumber > 9) {
    return '';
  }

  return `🎯 CONTEXTE POSITIONNEL — MIROIR REVELIOM

Tu es en FIN DE BLOC ${blockNumber}.
Toutes les questions de ce bloc ont été intégralement répondues.

Ce que tu produis maintenant :
- n'est PAS une synthèse,
- n'est PAS une conclusion,
- n'est PAS une lecture globale.

Ce miroir est un SIGNAL FAIBLE.
Il marque une direction provisoire.
Il peut être contredit plus tard.
Il ne clôt rien.

Ta compréhension PROGRESSE,
mais elle est encore INCOMPLÈTE.

Tu ne cherches pas à expliquer.
Tu ne cherches pas à équilibrer.
Tu ne cherches pas à rassurer.

Tu révèles une dynamique vécue,
comme un mentor qui pose un jalon,
pas comme un système qui résume.

`;

}

/**
 * Extrait le numéro de bloc depuis blockType
 * Retourne null si ce n'est pas un bloc numéroté (1-9)
 */
function extractBlockNumber(blockType: BlockType): number | null {
  if (blockType === 'block1') return 1;
  if (blockType === 'block2b') return null; // BLOC 2B n'est pas un miroir fin de bloc standard
  if (blockType === 'block3') return 3;
  if (blockType === 'block4') return 4;
  if (blockType === 'block5') return 5;
  if (blockType === 'block6') return 6;
  if (blockType === 'block7') return 7;
  if (blockType === 'block8') return 8;
  if (blockType === 'block9') return 9;
  if (blockType === 'synthesis') return null;
  if (blockType === 'matching') return null;
  return null;
}

/**
 * Retourne les instructions de format selon le type de bloc
 */
function getFormatInstructions(blockType: BlockType): string {
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
- Basée UNIQUEMENT sur : l'angle mentor
- Incarnes l'angle en langage vécu et expérientiel
- Position interprétative claire
- Lecture en creux obligatoire (montrer le mécanisme, pas les traits)
- Tu n'as PAS à justifier l'angle, tu dois l'incarner

2️⃣ Déduction personnalisée
- UNE SEULE phrase
- MAXIMUM 25 mots EXACTEMENT
- Basée UNIQUEMENT sur : l'angle mentor (même angle ou angle complémentaire)
- Incarnes l'angle (ou un angle complémentaire) en langage vécu et expérientiel
- Explicite les conditions concrètes d'engagement et de désengagement
- Lecture en creux obligatoire
- Tu n'as PAS à justifier, tu dois incarner

3️⃣ Validation ouverte
- Phrase EXACTE et INCHANGÉE :
"Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

⚠️ CONTRAINTES FORMAT :
- Conserver EXACTEMENT le format (sections 1️⃣ 2️⃣ 3️⃣)
- Conserver EXACTEMENT les limites de mots (20/25 mots)`;

    case 'block2b':
      // Format synthèse BLOC 2B (4-6 lignes) — même doctrine stylistique que miroirs REVELIOM
      return `⚠️ FORMAT STRICT OBLIGATOIRE — SYNTHÈSE BLOC 2B (MIROIR)

- 4 à 6 lignes maximum. Synthèse continue, dense, INCARNÉE.
- Basée UNIQUEMENT sur l'angle mentor. Révélation d'un moteur réel, pas un résumé.
- Ton : mentor, causal, vécu. 2ᵉ personne UNIQUEMENT (tu / te / ton).
- Croiser motifs + personnages + traits si contexte dispo. Faire ressortir : rapport au pouvoir, à la pression, aux relations, posture face à la responsabilité.
- 1 point de vigilance réaliste, sans jugement.
- PAS de format 1️⃣ 2️⃣ 3️⃣. PAS de validation ouverte.

❌ INTERDICTIONS (doctrine REVELIOM) :
- Jamais descriptif RH, jamais bilan générique, jamais psychologisant.
- Pas de "elle", "la personne", "cette personne" — tout en "tu".
- Pas de "il est possible que", "tu sembles", "on voit que". Pas de concepts mous (motivation générale, personnalité, équilibre).
- Le rendu doit provoquer "ok… je ne l'avais pas formulé comme ça", PAS "oui c'est ce que j'ai dit".`;

    case 'synthesis':
      // Format synthèse finale (structure libre mais dense)
      return `⚠️ FORMAT STRICT OBLIGATOIRE — SYNTHÈSE FINALE

- Synthèse continue, dense, incarnée, structurante
- Basée UNIQUEMENT sur : l'angle mentor
- Incarnes l'angle en langage vécu et expérientiel
- Tu n'as PAS à justifier l'angle, tu dois l'incarner
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
• Basé UNIQUEMENT sur : l'angle mentor
• Incarnes l'angle en langage vécu et expérientiel
• Tu n'as PAS à justifier l'angle, tu dois l'incarner
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
