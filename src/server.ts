import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerAxiomRoutes } from './api/axiom.js';
import { registerStartRoute } from './routes/start.js';

// Map de sessions en mémoire pour gérer identityDone, vouvoiement, lastQuestion, lastAssistant
export const sessions = new Map<string, {
  identityDone: boolean;
  vouvoiement: 'tutoiement' | 'vouvoiement' | null;
  lastQuestion: string | null;
  lastAssistant: string | null;
}>();

export function buildServer() {
  const app = Fastify({
    logger: true,
  });

  // 🔒 CORS — MVP (OBLIGATOIRE POUR LE FRONT)
  app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
  });

  registerStartRoute(app);
  registerAxiomRoutes(app);

  return app;
}

// Export default compatible Vercel
const app = buildServer();
let isReady = false;

export default async function handler(req: any, res: any) {
  if (!isReady) {
    await app.ready();
    isReady = true;
  }
  app.server.emit('request', req, res);
}
