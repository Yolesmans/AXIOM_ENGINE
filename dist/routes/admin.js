import { provisionFromAdminSheet } from '../services/provisioningService.js';
export async function adminRoutes(app) {
    app.post('/admin/sync', async (req, reply) => {
        const adminKey = req.headers['x-admin-key'];
        if (!adminKey || adminKey !== process.env.AXIOM_ADMIN_API_KEY) {
            reply.code(403).send({ error: 'Forbidden' });
            return;
        }
        await provisionFromAdminSheet();
        reply.send({ status: 'OK' });
    });
}
