import { candidateStore } from '../store/sessionStore.js';
import { v4 as uuidv4 } from 'uuid';
import { getPostConfig } from '../store/postRegistry.js';
export async function registerStartRoute(app) {
    app.get('/start', async (req, reply) => {
        const { tenant, poste } = req.query;
        if (!tenant || !poste) {
            return reply.code(400).send({
                error: 'MISSING_PARAMS',
                message: 'tenant et poste requis',
            });
        }
        try {
            getPostConfig(tenant, poste);
        }
        catch (e) {
            return reply.code(400).send({
                error: 'UNKNOWN_TENANT_OR_POSTE',
                message: 'Entreprise ou poste inconnu',
            });
        }
        const candidateId = uuidv4();
        const candidate = candidateStore.create(candidateId, tenant);
        return reply.send({
            sessionId: candidate.candidateId,
            state: candidate.session.state,
            currentBlock: candidate.session.currentBlock,
            response: "Avant de commencer AXIOM, j'ai besoin de :\n- ton prénom\n- ton nom\n- ton adresse email",
        });
    });
}
