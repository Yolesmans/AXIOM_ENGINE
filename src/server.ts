import Fastify from 'fastify';
import { registerAxiomRoutes } from './api/axiom.js';

export function buildServer() {
  const app = Fastify({
    logger: true,
  });

  registerAxiomRoutes(app);

  return app;
}
