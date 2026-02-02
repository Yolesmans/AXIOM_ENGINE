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
// Export default compatible Vercel
const app = buildServer();
let isReady = false;
export default async function handler(req, res) {
    if (!isReady) {
        await app.ready();
        isReady = true;
    }
    app.server.emit('request', req, res);
}
