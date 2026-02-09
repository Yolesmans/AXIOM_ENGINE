import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required but not found in environment variables');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Modèle par défaut : gpt-4o (plus puissant que gpt-4o-mini pour qualité narrative)
// TODO: Remplacer par 'gpt-5.2' quand disponible
const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0.8;

export async function testOpenAI(): Promise<string> {
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

export async function callOpenAI(params: {
  messages: Array<{ role: string; content: string }>;
}): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: params.messages.map((msg) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      })),
      temperature: DEFAULT_TEMPERATURE,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenAI');
    }

    return content.trim();
  } catch (error: any) {
    // Fallback si modèle non disponible
    if (error?.code === 'model_not_found' || error?.message?.includes('model')) {
      console.warn(`[OPENAI] Modèle ${DEFAULT_MODEL} non disponible, fallback gpt-4o-mini`);
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: params.messages.map((msg) => ({
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content,
        })),
        temperature: DEFAULT_TEMPERATURE,
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

export async function* callOpenAIStream(params: {
  messages: Array<{ role: string; content: string }>;
}): AsyncGenerator<string, string, unknown> {
  try {
    const stream = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: params.messages.map((msg) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      })),
      temperature: DEFAULT_TEMPERATURE,
      stream: true,
    });

    let fullContent = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullContent += content;
        yield content;
      }
    }

    return fullContent.trim();
  } catch (error: any) {
    // Fallback si modèle non disponible
    if (error?.code === 'model_not_found' || error?.message?.includes('model')) {
      console.warn(`[OPENAI] Modèle ${DEFAULT_MODEL} non disponible, fallback gpt-4o-mini`);
      const stream = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: params.messages.map((msg) => ({
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content,
        })),
        temperature: DEFAULT_TEMPERATURE,
        stream: true,
      });

      let fullContent = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullContent += content;
          yield content;
        }
      }

      return fullContent.trim();
    }
    throw error;
  }
}
