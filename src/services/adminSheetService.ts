import { google } from 'googleapis';
import fs from 'fs';
import { AXIOM_ADMIN_SPREADSHEET_ID } from '../config/env.js';

let sheetsClient: ReturnType<typeof google.sheets> | null = null;
let authClient: ReturnType<typeof google.auth.fromJSON> | null = null;

async function getSheetsClient(): Promise<ReturnType<typeof google.sheets>> {
  if (sheetsClient) {
    return sheetsClient;
  }

  const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error('GOOGLE_SHEETS_CREDENTIALS is not defined');
  }

  try {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    authClient = google.auth.fromJSON(credentials) as any;
    if (!authClient) {
      throw new Error('Failed to initialize Google Auth');
    }
    if ('scopes' in authClient) {
      (authClient as { scopes: string[] }).scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];
    }
    sheetsClient = google.sheets({ version: 'v4', auth: authClient });
    return sheetsClient;
  } catch (error) {
    throw new Error(`Failed to initialize Google Sheets: ${error}`);
  }
}

export type AdminRow = {
  companyName: string;
  tenantId: string;
  posteId: string;
  posteLabel: string;
  emailRH: string;
  axiomLink?: string;
  companySheetUrl?: string;
  status?: string;
};

export async function readAdminSheet(): Promise<AdminRow[]> {
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

export async function updateAdminSheetCell(
  rowIndex: number,
  col: string,
  value: string,
): Promise<void> {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: AXIOM_ADMIN_SPREADSHEET_ID,
    range: `${col}${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}
