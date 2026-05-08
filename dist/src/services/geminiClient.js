import OpenAI from 'openai';
const AXIOM_TEST_MODE = process.env.AXIOM_TEST_MODE === 'true';
const GEMINI_MOCK_ENABLED = process.env.GEMINI_MOCK_ENABLED === 'true' || AXIOM_TEST_MODE;
if (!process.env.OPENAI_API_KEY && !GEMINI_MOCK_ENABLED) {
    throw new Error('OPENAI_API_KEY is required but not found in environment variables');
}
const client = GEMINI_MOCK_ENABLED ? null : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_MODEL = 'gpt-5.4-nano';
const DEFAULT_TEMPERATURE = 0.8;
// Réponses mock déterministes pour tests E2E
function getMockResponse(systemPrompt, userMessage) {
    const fullContext = systemPrompt + ' ' + userMessage;
    if (fullContext.includes('PRÉAMBULE') || fullContext.includes('préambule')) {
        return `Bienvenue dans REVELIOM.\nOn va découvrir qui tu es vraiment — pas ce qu'il y a sur ton CV.\nPromis : je ne te juge pas. Je veux juste comprendre comment tu fonctionnes.\n\nOn commence tranquille.\nDis-moi : tu préfères qu'on se tutoie ou qu'on se vouvoie pour cette discussion ?`;
    }
    if (fullContext.includes('BLOC 1') || (fullContext.includes('miroir') && fullContext.includes('énergie'))) {
        return `Lecture implicite : Tu cherches l'accomplissement concret, pas la reconnaissance symbolique.\nDéduction personnalisée : Tu performes mieux quand l'objectif est clair et l'impact mesurable — pas dans le flou.\nDis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue.`;
    }
    if (fullContext.includes('BLOC 2B') || fullContext.includes('personnages') || (fullContext.includes('miroir') && fullContext.includes('œuvres'))) {
        return `Lecture implicite : Tu valorises la transformation sous pression et la complexité morale dans les personnages.\nDéduction personnalisée : Ce n'est probablement pas le pouvoir en soi qui t'attire, mais la capacité à décider dans l'incertitude.\nDis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue.`;
    }
    if (fullContext.includes('miroir') || fullContext.includes('MIROIR') || fullContext.includes('lecture en creux')) {
        return `Lecture implicite : Tu privilégies la logique et la cohérence dans tes décisions.\nDéduction personnalisée : Ce n'est probablement pas la règle qui te guide, mais l'équité perçue dans la situation.\nDis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue.`;
    }
    if (fullContext.includes('BLOC 10') || fullContext.includes('synthèse finale') || fullContext.includes('lecture globale')) {
        return `**🔥 Ce qui te met vraiment en mouvement**\n\nTu carbures aux résultats concrets et mesurables.\n\n**🧱 Comment tu tiens dans le temps**\n\nTu fonctionnes par cycles d'intensité.\n\n**⚖️ Tes valeurs quand il faut agir**\n\nTu analyses avant d'agir.\n\n**🎯 Ton positionnement professionnel naturel**\n\nTu fonctionnes mieux dans des environnements structurés mais exigeants.`;
    }
    return `MOCK_RESPONSE : Réponse générée automatiquement pour test.`;
}
export async function testGemini() {
    if (GEMINI_MOCK_ENABLED)
        return 'OK';
    if (!client)
        throw new Error('OpenAI client not initialized');
    const result = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'Reply ONLY with the word OK' }],
    });
    return result.choices[0]?.message?.content?.trim() ?? '';
}
export async function callGemini(params) {
    if (AXIOM_TEST_MODE)
        return 'MOCK_RESPONSE_TEST';
    if (GEMINI_MOCK_ENABLED) {
        const systemMsg = params.messages.find(m => m.role === 'system')?.content ?? '';
        const userMsg = params.messages.filter(m => m.role === 'user').slice(-1)[0]?.content ?? '';
        return getMockResponse(systemMsg, userMsg);
    }
    if (!client)
        throw new Error('OpenAI client not initialized');
    const response = await client.chat.completions.create({
        model: params.model ?? DEFAULT_MODEL,
        messages: params.messages,
        temperature: params.temperature ?? DEFAULT_TEMPERATURE,
    });
    const text = response.choices[0]?.message?.content;
    if (!text)
        throw new Error('No response content from OpenAI');
    return text.trim();
}
export async function callGeminiStream(opts, onToken) {
    if (AXIOM_TEST_MODE) {
        const mockText = 'MOCK_RESPONSE_TEST';
        for (const word of mockText.split(' ')) {
            onToken(word + ' ');
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        return { fullText: mockText };
    }
    if (GEMINI_MOCK_ENABLED) {
        const systemMsg = opts.messages.find(m => m.role === 'system')?.content ?? '';
        const userMsg = opts.messages.filter(m => m.role === 'user').slice(-1)[0]?.content ?? '';
        const mockText = getMockResponse(systemMsg, userMsg);
        for (const word of mockText.split(' ')) {
            onToken(word + ' ');
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        return { fullText: mockText };
    }
    if (!client)
        throw new Error('OpenAI client not initialized');
    const stream = await client.chat.completions.create({
        model: opts.model ?? DEFAULT_MODEL,
        messages: opts.messages,
        temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
        ...(opts.max_tokens ? { max_completion_tokens: opts.max_tokens } : {}),
        stream: true,
    });
    let fullContent = '';
    for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? '';
        if (text) {
            fullContent += text;
            onToken(text);
        }
    }
    return { fullText: fullContent.trim() };
}
// Aliases pour compatibilité
export const testOpenAI = testGemini;
export const callOpenAI = callGemini;
export const callOpenAIStream = callGeminiStream;
