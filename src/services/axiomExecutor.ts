import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { callGemini } from './geminiClient.js';
import type { AxiomSession } from '../types/session.js';
import type { AnswerRecord } from '../types/answer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadPromptFile(filename: string): Promise<string> {
  const promptsDir = join(__dirname, '../prompts');
  const filePath = join(promptsDir, filename);
  const content = await readFile(filePath, 'utf-8');
  return content;
}

function buildSessionContext(
  session: AxiomSession,
  answers: AnswerRecord[],
): string {
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

export async function executeProfilPrompt(
  session: AxiomSession,
  answers: AnswerRecord[],
  systemDirective?: string,
): Promise<string> {
  const systemPrompt = await loadPromptFile('system/AXIOM_ENGINE.txt');
  const profilPrompt = await loadPromptFile('metier/AXIOM_PROFIL.txt');

  const sessionContext = buildSessionContext(session, answers);

  const userContent = `${profilPrompt}\n\n${sessionContext}`;
  
  // Construire le system prompt avec directive si fournie
  const fullSystemPrompt = systemDirective 
    ? `${systemPrompt}\n\n${systemDirective}`
    : systemPrompt;

  const content = await callGemini({
    messages: [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.7,
  });

  if (!content || content.trim() === '') {
    return 'Très bien. Continuons.';
  }

  return content;
}

export async function executeMatchingPrompt(params: {
  tenantId: string;
  posteId: string;
  sessionId: string;
  answers: AnswerRecord[];
  finalProfileText: string;
  systemDirective?: string;
}): Promise<string> {
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
  
  // Construire le system prompt avec directive si fournie
  const fullSystemPrompt = params.systemDirective 
    ? `${systemPrompt}\n\n${params.systemDirective}`
    : systemPrompt;

  const content = await callGemini({
    messages: [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.7,
  });

  if (!content || content.trim() === '') {
    return 'Très bien. Continuons.';
  }

  return content;
}
