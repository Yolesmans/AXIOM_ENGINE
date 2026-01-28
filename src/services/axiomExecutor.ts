import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OpenAI from 'openai';
import type { AxiomSession } from '../types/session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required but not found in environment variables');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function loadPromptFile(filename: string): Promise<string> {
  const promptsDir = join(__dirname, '../prompts');
  const filePath = join(promptsDir, filename);
  const content = await readFile(filePath, 'utf-8');
  return content;
}

function buildSessionContext(session: AxiomSession, userMessage?: string): string {
  const context = [
    `SESSION CONTEXT:`,
    `- sessionId: ${session.sessionId}`,
    `- currentBlock: ${session.currentBlock}`,
    `- state: ${session.state}`,
    `- answers: ${JSON.stringify(session.answers, null, 2)}`,
    `- blockSummaries: ${JSON.stringify(session.blockSummaries, null, 2)}`,
  ];

  if (userMessage) {
    context.push(`- userMessage: ${userMessage}`);
  }

  return context.join('\n');
}

export async function executeProfilPrompt(
  session: AxiomSession,
  userMessage?: string,
): Promise<string> {
  const systemPrompt = await loadPromptFile('system/AXIOM_ENGINE.txt');
  const profilPrompt = await loadPromptFile('metier/AXIOM_PROFIL.txt');

  const sessionContext = buildSessionContext(session, userMessage);

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
