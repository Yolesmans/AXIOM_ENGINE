import { google } from 'googleapis';
import fs from 'fs';
import { AXIOM_ADMIN_SPREADSHEET_ID } from '../config/env.js';
let sheetsClient = null;
let authClient = null;
async function getSheetsClient() {
    if (sheetsClient) {
        return sheetsClient;
    }
    const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS;
    if (!credentialsPath) {
        throw new Error('GOOGLE_SHEETS_CREDENTIALS is not defined');
    }
    try {
        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        authClient = google.auth.fromJSON(credentials);
        if (!authClient) {
            throw new Error('Failed to initialize Google Auth');
        }
        if ('scopes' in authClient) {
            authClient.scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];
        }
        sheetsClient = google.sheets({ version: 'v4', auth: authClient });
        return sheetsClient;
    }
    catch (error) {
        throw new Error(`Failed to initialize Google Sheets: ${error}`);
    }
}
export async function readAdminSheet() {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: AXIOM_ADMIN_SPREADSHEET_ID,
        range: 'A2:H',
    });
    const rows = res.data.values || [];
    return rows.map((r) => ({
        companyName: r[0] || '',
        tenantId: r[1] || '',
        posteId: r[2] || '',
        posteLabel: r[3] || '',
        emailRH: r[4] || '',
        axiomLink: r[5],
        companySheetUrl: r[6],
        status: r[7],
    }));
}
export async function updateAdminSheetCell(rowIndex, col, value) {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
        spreadsheetId: AXIOM_ADMIN_SPREADSHEET_ID,
        range: `${col}${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[value]] },
    });
}
