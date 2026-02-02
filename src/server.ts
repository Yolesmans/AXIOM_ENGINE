import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerAxiomRoutes } from './api/axiom.js';
import { registerStartRoute } from './routes/start.js';

export function buildServer() {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
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
