import { readAdminSheet, updateAdminSheetCell } from './adminSheetService.js';
import { createCompanySpreadsheetIfNotExists, googleSheetsLiveTrackingService } from './googleSheetsService.js';
import { getAxiomLink } from './googleSheetsService.js';
import { getSpreadsheetIdForTenant } from '../store/tenantRegistry.js';
export async function provisionFromAdminSheet() {
    const rows = await readAdminSheet();
    for (let i = 0; i < rows.length; i++) {
        const rowIndex = i + 2;
        const row = rows[i];
        if (!row.tenantId || !row.posteId)
            continue;
        if (row.status === 'ACTIF')
            continue;
        const companySheet = await createCompanySpreadsheetIfNotExists({
            tenantId: row.tenantId,
            companyName: row.companyName,
            emailRH: row.emailRH,
        });
        try {
            const spreadsheetId = getSpreadsheetIdForTenant(row.tenantId);
            await googleSheetsLiveTrackingService.ensureSheetExists(spreadsheetId, row.posteLabel, row.tenantId, row.posteId);
        }
        catch (e) {
            // Le tenant n'existe pas encore dans le registry, utiliser le spreadsheetId créé
            await googleSheetsLiveTrackingService.ensureSheetExists(companySheet.spreadsheetId, row.posteLabel, row.tenantId, row.posteId);
        }
        const axiomLink = getAxiomLink(row.tenantId, row.posteId);
        await updateAdminSheetCell(rowIndex, 'F', axiomLink);
        await updateAdminSheetCell(rowIndex, 'G', companySheet.url);
        await updateAdminSheetCell(rowIndex, 'H', 'ACTIF');
    }
}
