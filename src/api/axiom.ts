import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

const AxiomBodySchema = z.object({
  sessionId: z.string().min(8),
  userMessage: z.string().min(1),
});

export async function registerAxiomRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return { ok: true };
  });

  // STUB: moteur non implémenté à l'étape 1
  app.post('/axiom', async (req, reply) => {
    const parsed = AxiomBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        details: parsed.error.flatten(),
      });
    }

    return reply.send({
      sessionId: parsed.data.sessionId,
      reply: 'ENGINE_NOT_IMPLEMENTED_YET',
    });
  });
}
