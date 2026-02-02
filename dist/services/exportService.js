/**
 * Convertit un AxiomCandidate en ligne de suivi live
 * (sans exposer les réponses sensibles)
 */
export function toLiveTrackingRow(candidate) {
    return {
        candidateId: candidate.candidateId,
        firstName: candidate.identity.firstName,
        lastName: candidate.identity.lastName,
        email: candidate.identity.email,
        axiomStarted: candidate.session.startedAt ? 'oui' : 'non',
        currentBlock: candidate.session.currentBlock,
        axiomState: candidate.session.state,
        axiomCompleted: candidate.session.completedAt ? 'oui' : 'non',
        matchingAvailable: candidate.matchingResult ? 'oui' : 'non',
        lastActivity: candidate.session.lastActivityAt,
    };
}
/**
 * Convertit un AxiomCandidate en ligne d'export RH
 * (uniquement pour les candidats terminés avec matching)
 */
export function toRhExportRow(candidate) {
    if (!candidate.session.completedAt || !candidate.matchingResult) {
        return null;
    }
    const verdict = candidate.matchingResult.verdict;
    if (!verdict || !verdict.startsWith('🟢') && !verdict.startsWith('🔵') && !verdict.startsWith('🟠')) {
        return null;
    }
    return {
        candidateId: candidate.candidateId,
        firstName: candidate.identity.firstName,
        lastName: candidate.identity.lastName,
        email: candidate.identity.email,
        completedAt: candidate.session.completedAt,
        matchingVerdict: verdict,
    };
}
/**
 * Structure pour l'intégration Google Sheets (à implémenter en 7.2+)
 */
export class GoogleSheetsService {
    /**
     * Met à jour le sheet de suivi live pour un tenant
     * (à implémenter)
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async updateLiveTracking(tenantId, row) {
        // TODO: Implémentation Google Sheets API
        throw new Error('Not implemented yet');
    }
    /**
     * Exporte un candidat vers le sheet RH d'un tenant
     * (à implémenter)
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async exportToRh(tenantId, row) {
        // TODO: Implémentation Google Sheets API
        throw new Error('Not implemented yet');
    }
}
export const googleSheetsService = new GoogleSheetsService();
