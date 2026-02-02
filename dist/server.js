import Fastify from 'fastify';
import { registerAxiomRoutes } from './api/axiom.js';
import { registerStartRoute } from './routes/start.js';
export function buildServer() {
    const app = Fastify({
        logger: true,
    });
    registerStartRoute(app);
    registerAxiomRoutes(app);
    return app;
}
