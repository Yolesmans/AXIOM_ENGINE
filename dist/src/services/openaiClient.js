import OpenAI from 'openai';
// Mode test pour environnement E2E
const AXIOM_TEST_MODE = process.env.AXIOM_TEST_MODE === 'true';
const OPENAI_MOCK_ENABLED = process.env.OPENAI_MOCK_ENABLED === 'true' || AXIOM_TEST_MODE;
if (!process.env.OPENAI_API_KEY && !OPENAI_MOCK_ENABLED) {
    throw new Error('OPENAI_API_KEY is required but not found in environment variables');
}
const client = OPENAI_MOCK_ENABLED ? null : new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
// Modèle par défaut : gpt-4o (plus puissant que gpt-4o-mini pour qualité narrative)
// TODO: Remplacer par 'gpt-5.2' quand disponible
const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0.8;
// Réponses mock déterministes pour tests E2E
function getMockResponse(messages) {
    const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    const systemMessage = messages.filter(m => m.role === 'system').slice(-1)[0]?.content || '';
    const fullContext = systemMessage + ' ' + lastUserMessage;
    // Détection du type de prompt via pattern matching
    // PRÉAMBULE
    if (fullContext.includes('PRÉAMBULE') || fullContext.includes('préambule')) {
        return `Bienvenue dans AXIOM. Nous allons explorer ensemble votre identité profonde à travers une série de questions. Ce parcours est conçu pour révéler les dimensions essentielles de qui vous êtes, au-delà des apparences et des discours convenus. Prêt à commencer ce voyage ?`;
    }
    // MIROIR BLOC 1
    if (fullContext.includes('BLOC 1') || (fullContext.includes('miroir') && fullContext.includes('énergie'))) {
        return `Tu cherches la cohérence avant tout. Ce qui t'anime, c'est la structure, l'ordre qui fait sens. Tu ne te contentes pas de l'apparent : tu creuses, tu vérifies, tu assembles. Pour toi, comprendre, c'est d'abord relier les éléments entre eux dans une logique solide. Cette quête de clarté te rend exigeant, parfois rigide, mais profondément fiable. Ton moteur principal est l'accomplissement mesurable : tu as besoin de voir les résultats concrets de ton travail pour maintenir ton énergie dans la durée. La progression visible et les objectifs atteints sont tes carburants essentiels. Tu fonctionnes mieux sous pression structurée que dans l'incertitude floue. Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue.`;
    }
    // MIROIR BLOC 2B
    if (fullContext.includes('BLOC 2B') || fullContext.includes('personnages') || (fullContext.includes('miroir') && fullContext.includes('œuvres'))) {
        return `À travers ces choix narratifs, on voit quelqu'un qui valorise la transformation sous pression, la prise de décision dans des contextes moralement ambigus, et la complexité psychologique. Tu es attiré par les personnages qui évoluent, qui ne sont ni tout blancs ni tout noirs, qui doivent faire des choix difficiles où il n'y a pas de bonne réponse évidente. Cette fascination pour l'ambiguïté morale et la transformation révèle probablement ton propre rapport au pouvoir et à la responsabilité : tu comprends que les décisions importantes impliquent souvent de choisir entre plusieurs options imparfaites. Tu rejettes la simplicité du jugement binaire au profit d'une compréhension nuancée des situations et des enjeux. Cette capacité à naviguer dans la complexité sans chercher de refuge facile est un atout rare. Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue.`;
    }
    // MIROIRS BLOCS 3-9 (génériques mais longs)
    if (fullContext.includes('miroir') || fullContext.includes('MIROIR') || fullContext.includes('lecture en creux')) {
        return `Tu privilégies la logique et la cohérence dans tes décisions. Face à l'injustice, tu analyses avant d'agir, préférant la réflexion à la réaction impulsive. Ce qui te met hors de toi, c'est le manque de rigueur et les promesses non tenues, révélant une exigence forte envers toi-même et les autres. Tu as besoin de structures claires pour t'épanouir, mais tu sais aussi naviguer dans la complexité quand les enjeux le justifient. Ton rapport au travail est ancré dans la recherche de résultats concrets et mesurables, et tu es prêt à t'investir intensément pour atteindre tes objectifs. Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue.`;
    }
    // ANALYSE FINALE BLOC 10
    if (fullContext.includes('BLOC 10') || fullContext.includes('synthèse finale') || fullContext.includes('lecture globale')) {
        return `**🔥 Ce qui te met vraiment en mouvement**\n\nTu es quelqu'un qui carbure aux résultats concrets et mesurables. L'accomplissement n'est pas une abstraction pour toi : c'est voir l'impact direct de ton travail, sentir la progression, toucher du doigt ce que tu as construit. L'adrénaline de la conquête, la satisfaction du succès tangible, c'est ça qui te donne ton énergie. Tu n'es pas dans l'attente passive : tu crées ta propre pression pour avancer.\n\n**🧱 Comment tu tiens dans le temps**\n\nTu fonctionnes par cycles d'intensité : des phases de forte implication où tu donnes tout, suivies de moments de récupération. Cette alternance n'est pas une faiblesse, c'est ton rythme naturel. Pour tenir dans la durée, tu as besoin de voir la progression, de mesurer l'impact, de sentir que l'effort a un sens. Sans ça, tu décroches. Mais quand les conditions sont réunies, tu es capable d'une constance remarquable.\n\n**⚖️ Tes valeurs quand il faut agir**\n\nTu privilégies la logique et la cohérence, mais sans rigidité dogmatique. Face à l'injustice, tu analyses avant d'agir : tu ne réagis pas à chaud, tu prends le temps de comprendre avant de trancher. Ce qui te met vraiment hors de toi, c'est le manque de rigueur et les promesses non tenues. Pour toi, la parole engage, et l'absence de suivi est inacceptable.\n\n**🧩 Ce que révèlent tes projections**\n\nÀ travers tes choix narratifs, tu montres une fascination pour la transformation sous pression et la complexité morale. Tu es attiré par les personnages qui doivent faire des choix difficiles dans des contextes ambigus, où il n'y a pas de bonne réponse évidente. Cette attirance révèle ton propre rapport au pouvoir et à la responsabilité : tu comprends que les décisions importantes impliquent souvent de choisir entre plusieurs options imparfaites.\n\n**🛠️ Tes vraies forces… et tes vraies limites**\n\nTes forces : négociation, prospection, closing. Tu sais convaincre, tu sais créer l'opportunité, tu sais conclure. Ces compétences sont opérationnelles et éprouvées. Ta limite principale : le besoin de structure et de clarté peut te rendre mal à l'aise dans les environnements trop flous ou trop imprévisibles. Tu as besoin de savoir où tu vas pour donner le meilleur de toi-même.\n\n**🎯 Ton positionnement professionnel naturel**\n\nTu te définis comme commercial, mais avec une aspiration entrepreneuriale forte. Tu ne veux pas juste exécuter : tu veux construire, développer ton propre portefeuille, créer quelque chose qui t'appartient. L'autonomie n'est pas un confort pour toi, c'est une nécessité. Tu es prêt à te former pour évoluer, mais pas indéfiniment : tu veux des résultats dans un horizon raisonnable.\n\n**🧠 Lecture globale**\n\nTu es quelqu'un qui a besoin de sens concret et de progression visible pour rester engagé. Tu fonctionnes mieux dans les environnements structurés mais exigeants, où l'autonomie est réelle et où les résultats sont mesurables. Tu n'es pas fait pour les rôles d'exécution pure ni pour les cadres trop rigides. Tu as besoin d'un espace où construire quelque chose qui t'appartient, avec des règles claires et des objectifs ambitieux.`;
    }
    // MATCHING
    if (fullContext.includes('MATCHING') || fullContext.includes('matching') || fullContext.includes('VERDICT') || fullContext.includes('AXIOM_ELGAENERGY')) {
        return `━━━━━━━━━━━━━━━━━━\n🟢 MATCHING AXIOM — ALIGNÉ\n━━━━━━━━━━━━━━━━━━\n\nLe profil révélé par AXIOM montre une cohérence forte avec les exigences du poste de courtier en énergie. Les dimensions analysées convergent vers un candidat capable de porter la mission avec authenticité et durabilité.\n\n🔎 Lecture de compatibilité\n\n- Rapport au cœur du métier : Tu es à l'aise avec la vente assumée, l'exposition au refus, et la construction d'un portefeuille client. La prospection active et le closing sont dans ta zone de confort.\n\n- Rapport à la durée : Tu es capable de soutenir un effort répété dans le temps tant que la progression est visible et les résultats mesurables. Ton besoin de voir l'impact concret de ton travail correspond parfaitement au modèle de revenu lié à l'effort.\n\n- Cohérence globale : Ton fonctionnement naturel s'aligne avec le cadre du poste. L'autonomie forte, la discipline personnelle, et la recherche d'accomplissement mesurable sont exactement ce que ce métier exige.\n\n💼 PROJECTION CONCRÈTE — COMMENT ÇA SE TRADUIT\n\nUne entreprise qui consomme 100 MWh par an sur un contrat de 4 ans, c'est 400 MWh sur la durée. Avec une commission moyenne de 3 € par MWh, cela représente 1 200 € pour un seul client.\n\nPour toi, ce modèle économique a du sens : chaque client prospecté, chaque contrat négocié, chaque signature obtenue se traduit directement en revenu mesurable et récurrent. Tu n'es pas dans l'attente d'une promotion hypothétique : tu construis ton propre portefeuille, tu contrôles ta trajectoire, tu vois la progression concrète de ton travail.\n\n🧭 LE CADRE — POUR T'ACCOMPAGNER DANS LA DURÉE\n\nCe métier nécessite autonomie et discipline personnelle. Le cadre ElgaEnergy est conçu pour accompagner cette autonomie avec structure et exigence : des objectifs clairs, des outils performants, un management direct et responsabilisant. Pas de protection artificielle, mais une tolérance à l'erreur si l'effort est réel.\n\n🚀 POUR ALLER PLUS LOIN\n\nSi, en lisant ce matching, quelque chose a résonné, tu peux ouvrir la discussion. Envoie ton rapport à : contact@elgaenergy.fr\n\nEt si tu n'as pas laissé ton avis, ça nous aide énormément ❤️ https://tally.so/r/44JLbB`;
    }
    // Normalisation caractères
    if (fullContext.includes('normalise') || fullContext.includes('Normalise') || fullContext.includes('uniformise')) {
        return `Logique et cohérent\nRessenti et juste\nÉprouvé et fiable\nOptions et possibilités`;
    }
    // Fallback générique mais long
    return `MOCK_RESPONSE : Réponse générée automatiquement pour test E2E. Cette réponse simule un retour LLM standard avec suffisamment de contenu pour valider la logique système. Le véritable contenu serait généré par le LLM en production avec une profondeur et une personnalisation adaptées au contexte spécifique du candidat et de la phase du protocole AXIOM.`;
}
export async function testOpenAI() {
    if (OPENAI_MOCK_ENABLED) {
        return 'OK';
    }
    if (!client) {
        throw new Error('OpenAI client not initialized');
    }
    const response = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
            {
                role: 'user',
                content: 'Reply ONLY with the word OK',
            },
        ],
        max_tokens: 10,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
        throw new Error('No response content from OpenAI');
    }
    return content.trim();
}
export async function callOpenAI(params) {
    // Mode test simple pour validation moteur
    if (AXIOM_TEST_MODE) {
        console.log('[AXIOM_TEST_MODE] Returning simple mock response');
        return 'MOCK_RESPONSE_TEST';
    }
    // Mode mock pour tests E2E
    if (OPENAI_MOCK_ENABLED) {
        console.log('[OPENAI_MOCK] Returning deterministic mock response');
        return getMockResponse(params.messages);
    }
    if (!client) {
        throw new Error('OpenAI client not initialized');
    }
    const temperature = params.temperature ?? DEFAULT_TEMPERATURE;
    try {
        const response = await client.chat.completions.create({
            model: DEFAULT_MODEL,
            messages: params.messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
            })),
            temperature,
        });
        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response content from OpenAI');
        }
        return content.trim();
    }
    catch (error) {
        // Fallback si modèle non disponible
        if (error?.code === 'model_not_found' || error?.message?.includes('model')) {
            console.warn(`[OPENAI] Modèle ${DEFAULT_MODEL} non disponible, fallback gpt-4o-mini`);
            const response = await client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: params.messages.map((msg) => ({
                    role: msg.role,
                    content: msg.content,
                })),
                temperature,
            });
            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('No response content from OpenAI');
            }
            return content.trim();
        }
        throw error;
    }
}
/**
 * Appel OpenAI en mode stream ; appelle onToken pour chaque delta et retourne le texte complet.
 * Même modèle/temp que callOpenAI si non spécifiés. Aucun changement de coût tokens.
 */
export async function callOpenAIStream(opts, onToken) {
    // Mode test simple pour validation moteur
    if (AXIOM_TEST_MODE) {
        console.log('[AXIOM_TEST_MODE] Simulating stream with simple mock');
        const mockText = 'MOCK_RESPONSE_TEST';
        // Simuler un stream rapide
        const words = mockText.split(' ');
        for (const word of words) {
            onToken(word + ' ');
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        return { fullText: mockText };
    }
    // Mode mock pour tests E2E (simulation stream)
    if (OPENAI_MOCK_ENABLED) {
        console.log('[OPENAI_MOCK] Simulating stream with mock response');
        const mockText = getMockResponse(opts.messages);
        // Simuler un stream en découpant par mots
        const words = mockText.split(' ');
        for (const word of words) {
            onToken(word + ' ');
            await new Promise(resolve => setTimeout(resolve, 10)); // 10ms entre chaque mot
        }
        return { fullText: mockText };
    }
    if (!client) {
        throw new Error('OpenAI client not initialized');
    }
    const model = opts.model ?? DEFAULT_MODEL;
    const temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
    const messages = opts.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
    }));
    try {
        const stream = await client.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: opts.max_tokens,
            stream: true,
        });
        let fullContent = '';
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                fullContent += content;
                onToken(content);
            }
        }
        return { fullText: fullContent.trim() };
    }
    catch (error) {
        if (error?.code === 'model_not_found' || error?.message?.includes('model')) {
            console.warn(`[OPENAI] Modèle ${model} non disponible, fallback gpt-4o-mini`);
            const stream = await client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages,
                temperature,
                max_tokens: opts.max_tokens,
                stream: true,
            });
            let fullContent = '';
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    fullContent += content;
                    onToken(content);
                }
            }
            return { fullText: fullContent.trim() };
        }
        throw error;
    }
}
