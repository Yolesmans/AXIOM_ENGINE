/**
 * Adaptateur temporaire pour convertir AxiomCandidate vers AxiomSession
 * (pour compatibilité avec le moteur existant)
 */
export function candidateToSession(candidate) {
    return {
        sessionId: candidate.candidateId,
        currentBlock: candidate.session.currentBlock,
        state: candidate.session.state,
        answers: {},
        blockSummaries: candidate.blockSummaries,
        createdAt: candidate.session.startedAt,
        updatedAt: candidate.session.lastActivityAt,
    };
}
/**
 * Met à jour un AxiomCandidate à partir d'un AxiomSession modifié
 */
export function updateCandidateFromSession(candidate, session) {
    return {
        ...candidate,
        session: {
            ...candidate.session,
            currentBlock: session.currentBlock,
            state: session.state,
            lastActivityAt: session.updatedAt,
        },
        blockSummaries: session.blockSummaries,
    };
}
