import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OpenAI from 'openai';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required but not found in environment variables');
}
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
async function loadPromptFile(filename) {
    const promptsDir = join(__dirname, '../prompts');
    const filePath = join(promptsDir, filename);
    const content = await readFile(filePath, 'utf-8');
    return content;
}
function buildSessionContext(session, answers) {
    const context = [
        `SESSION CONTEXT:`,
        `- sessionId: ${session.sessionId}`,
        `- currentBlock: ${session.currentBlock}`,
        `- state: ${session.state}`,
        `- blockSummaries: ${JSON.stringify(session.blockSummaries, null, 2)}`,
        `- answers (ordre chronologique):`,
    ];
    answers.forEach((answer, index) => {
        context.push(`  ${index + 1}. [Bloc ${answer.block}] ${answer.message} (${answer.createdAt})`);
    });
    return context.join('\n');
}
export async function executeProfilPrompt(session, answers) {
    const systemPrompt = await loadPromptFile('system/AXIOM_ENGINE.txt');
    const profilPrompt = await loadPromptFile('metier/AXIOM_PROFIL.txt');
    const sessionContext = buildSessionContext(session, answers);
    const userContent = `${profilPrompt}\n\n${sessionContext}`;
    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: systemPrompt,
            },
            {
                role: 'user',
                content: userContent,
            },
        ],
        temperature: 0.7,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
        throw new Error('No response content from OpenAI');
    }
    return content;
}
export async function executeMatchingPrompt(params) {
    const systemPrompt = await loadPromptFile('system/AXIOM_ENGINE.txt');
    const matchingPrompt = await loadPromptFile('metier/AXIOM_MATCHING.txt');
    const context = [
        `MATCHING CONTEXT:`,
        `- tenantId: ${params.tenantId}`,
        `- posteId: ${params.posteId}`,
        `- sessionId: ${params.sessionId}`,
        `- finalProfileText:`,
        params.finalProfileText,
        `- answers (ordre chronologique):`,
    ];
    params.answers.forEach((answer, index) => {
        context.push(`  ${index + 1}. [Bloc ${answer.block}] ${answer.message} (${answer.createdAt})`);
    });
    const userContent = `${matchingPrompt}\n\n${context.join('\n')}`;
    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: systemPrompt,
            },
            {
                role: 'user',
                content: userContent,
            },
        ],
        temperature: 0.7,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
        throw new Error('No response content from OpenAI');
    }
    return content;
}
