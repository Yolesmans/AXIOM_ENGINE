import { google } from 'googleapis';
import fs from 'fs';
import type { AxiomCandidate } from '../types/candidate.js';
import type { LiveTrackingRow } from '../types/liveTracking.js';
import { getPostConfig } from '../store/postRegistry.js';
import { env } from '../env.js';

function getStatusLabel(state: LiveTrackingRow['state'], currentBlock: number | null): string {
  switch (state) {
    case 'identity':
      return 'En attente d\'identité';
    case 'preamble':
      return 'Préambule';
    case 'collecting':
      return `Bloc ${currentBlock || 1} en cours`;
    case 'waiting_go':
      return `Bloc ${currentBlock || 1} terminé`;
    case 'matching':
      return 'Matching en cours';
    case 'completed':
      return 'AXIOM terminé';
    default:
      return 'État inconnu';
  }
}

export function getAxiomLink(tenantId: string, posteId: string): string {
  const base = process.env.AXIOM_PUBLIC_URL;
  if (!base) throw new Error('AXIOM_PUBLIC_URL missing');
  return `${base}/start?tenant=${tenantId}&poste=${posteId}`;
}

export function candidateToLiveTrackingRow(candidate: AxiomCandidate): LiveTrackingRow & { verdict?: string } {
  const state: LiveTrackingRow['state'] = candidate.session.completedAt
    ? 'completed'
    : candidate.session.state;

  return {
    candidateId: candidate.candidateId,
    tenantId: candidate.tenantId,
    firstName: candidate.identity.firstName || '',
    lastName: candidate.identity.lastName || '',
    email: candidate.identity.email || '',
    state,
    currentBlock: candidate.session.state === 'identity' ? null : candidate.session.currentBlock,
    statusLabel: getStatusLabel(state, candidate.session.currentBlock),
    startedAt: candidate.session.startedAt.toISOString(),
    lastActivityAt: candidate.session.lastActivityAt.toISOString(),
    verdict: candidate.matchingResult?.verdict ?? '',
  };
}

class GoogleSheetsLiveTrackingService {
  private auth: ReturnType<typeof google.auth.fromJSON> | null = null;
  private sheets: ReturnType<typeof google.sheets> | null = null;

  private async initializeAuth() {
    if (this.auth && this.sheets) {
      return;
    }

    try {
      const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON
        ? JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS_JSON)
        : JSON.parse(fs.readFileSync(process.env.GOOGLE_SHEETS_CREDENTIALS!, 'utf8'));
      this.auth = google.auth.fromJSON(credentials);
      if (!this.auth) {
        throw new Error('Failed to initialize Google Auth');
      }
      if ('scopes' in this.auth) {
        (this.auth as { scopes: string[] }).scopes = [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/spreadsheets',
        ];
      }
      this.sheets = google.sheets({ version: 'v4', auth: this.auth as any });
    } catch (error) {
      throw new Error(`Failed to initialize Google Sheets: ${error}`);
    }
  }

  async ensureSheetExists(spreadsheetId: string, sheetName: string, tenantId: string, posteId: string): Promise<void> {
    await this.initializeAuth();
    if (!this.sheets) {
      throw new Error('Google Sheets not initialized');
    }

    try {
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });

      const sheetExists = spreadsheet.data.sheets?.some(
        (sheet) => sheet.properties?.title === sheetName,
      );

      if (!sheetExists) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName,
                  },
                },
              },
            ],
          },
        });
      }

      await this.ensureHeaderRow(spreadsheetId, sheetName, tenantId, posteId);
    } catch (error) {
      throw new Error(`Failed to ensure sheet exists: ${error}`);
    }
  }

  private async ensureHeaderRow(spreadsheetId: string, sheetName: string, tenantId: string, posteId: string): Promise<void> {
    if (!this.sheets) {
      throw new Error('Google Sheets not initialized');
    }

    try {
      const linkRange = `${sheetName}!A1:B2`;
      const linkResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: linkRange,
      });

      const existingLink = linkResponse.data.values?.[0]?.[0];
      const axiomLink = getAxiomLink(tenantId, posteId);

      if (existingLink !== 'Lien AXIOM – Candidats') {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A1:B2`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [
              ['Lien AXIOM – Candidats', ''],
              [axiomLink, ''],
            ],
          },
        });
      }

      const headerRange = `${sheetName}!A3:I3`;
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: headerRange,
      });

      const existingHeaders = response.data.values?.[0];

      const expectedHeaders = [
        'Date d\'entrée',
        'Prénom',
        'Nom',
        'Email',
        'Statut AXIOM',
        'Bloc atteint',
        'Recommandation AXIOM',
        'Dernière activité',
        'Commentaire RH',
      ];

      const headersMatch =
        existingHeaders &&
        existingHeaders.length === expectedHeaders.length &&
        existingHeaders.every((h, i) => h === expectedHeaders[i]);

      if (!headersMatch) {
        // Vérifier s'il y a des données après la ligne 3
        const dataRange = `${sheetName}!A4:I`;
        const dataResponse = await this.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: dataRange,
        });

        const hasData = dataResponse.data.values && dataResponse.data.values.length > 0 && dataResponse.data.values.some((row) => row && row.some((cell) => cell && String(cell).trim() !== ''));

        // Ne jamais réécrire les headers si des données existent
        if (hasData) {
          return;
        }

        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: headerRange,
          valueInputOption: 'RAW',
          requestBody: {
            values: [expectedHeaders],
          },
        });

        await this.formatHeaderRow(spreadsheetId, sheetName);
        await this.applyConditionalFormatting(spreadsheetId, sheetName);
      }
    } catch (error) {
      throw new Error(`Failed to ensure header row: ${error}`);
    }
  }

  private async formatHeaderRow(spreadsheetId: string, sheetName: string): Promise<void> {
    if (!this.sheets) {
      throw new Error('Google Sheets not initialized');
    }

    try {
      const sheet = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });

      const sheetId = sheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName,
      )?.properties?.sheetId;

      if (!sheetId) {
        throw new Error('Sheet not found');
      }

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: 2,
                  endRowIndex: 3,
                  startColumnIndex: 0,
                  endColumnIndex: 9,
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: {
                      bold: true,
                    },
                    backgroundColor: {
                      red: 0.95,
                      green: 0.95,
                      blue: 0.95,
                    },
                  },
                },
                fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor',
              },
            },
            {
              setBasicFilter: {
                filter: {
                  range: {
                    sheetId,
                    startRowIndex: 2,
                    endRowIndex: 2,
                    startColumnIndex: 0,
                    endColumnIndex: 9,
                  },
                  sortSpecs: [],
                },
              },
            },
            {
              updateDimensionProperties: {
                range: {
                  sheetId,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: 9,
                },
                properties: {
                  pixelSize: 150,
                },
                fields: 'pixelSize',
              },
            },
          ],
        },
      });
    } catch (error) {
      throw new Error(`Failed to format header row: ${error}`);
    }
  }

  private async applyConditionalFormatting(spreadsheetId: string, sheetName: string): Promise<void> {
    if (!this.sheets) {
      throw new Error('Google Sheets not initialized');
    }

    try {
      const sheet = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });

      const sheetId = sheet.data.sheets?.find(
        (s) => s.properties?.title === sheetName,
      )?.properties?.sheetId;

      if (!sheetId) {
        throw new Error('Sheet not found');
      }

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addConditionalFormatRule: {
                rule: {
                  ranges: [
                    {
                      sheetId,
                      startRowIndex: 3,
                      startColumnIndex: 4,
                      endColumnIndex: 5,
                    },
                  ],
                  booleanRule: {
                    condition: {
                      type: 'TEXT_EQ',
                      values: [{ userEnteredValue: 'En cours' }],
                    },
                    format: {
                      backgroundColor: {
                        red: 0.9,
                        green: 0.9,
                        blue: 0.9,
                      },
                    },
                  },
                },
                index: 0,
              },
            },
            {
              addConditionalFormatRule: {
                rule: {
                  ranges: [
                    {
                      sheetId,
                      startRowIndex: 3,
                      startColumnIndex: 4,
                      endColumnIndex: 5,
                    },
                  ],
                  booleanRule: {
                    condition: {
                      type: 'TEXT_EQ',
                      values: [{ userEnteredValue: 'Profil complété' }],
                    },
                    format: {
                      backgroundColor: {
                        red: 0.85,
                        green: 0.9,
                        blue: 1.0,
                      },
                    },
                  },
                },
                index: 1,
              },
            },
            {
              addConditionalFormatRule: {
                rule: {
                  ranges: [
                    {
                      sheetId,
                      startRowIndex: 3,
                      startColumnIndex: 4,
                      endColumnIndex: 5,
                    },
                  ],
                  booleanRule: {
                    condition: {
                      type: 'TEXT_EQ',
                      values: [{ userEnteredValue: 'Matching prêt' }],
                    },
                    format: {
                      backgroundColor: {
                        red: 0.85,
                        green: 1.0,
                        blue: 0.85,
                      },
                    },
                  },
                },
                index: 2,
              },
            },
          ],
        },
      });
    } catch (error) {
      throw new Error(`Failed to apply conditional formatting: ${error}`);
    }
  }

  private getStatusAxiomLabel(state: LiveTrackingRow['state']): string {
    switch (state) {
      case 'identity':
      case 'preamble':
      case 'collecting':
      case 'waiting_go':
        return 'En cours';
      case 'matching':
        return 'Profil complété';
      case 'completed':
        return 'Matching prêt';
      default:
        return 'En cours';
    }
  }

  async updateLiveTracking(tenantId: string, posteId: string, row: LiveTrackingRow): Promise<void> {
    try {
      await this.initializeAuth();
      if (!this.sheets) {
        throw new Error('Google Sheets not initialized');
      }

      if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) {
        throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not defined');
      }
      const post = getPostConfig(tenantId, posteId);
      const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID;
      await this.ensureSheetExists(spreadsheetId, post.label, tenantId, posteId);

      const statusAxiom = this.getStatusAxiomLabel(row.state);
      const blocAtteint = row.currentBlock?.toString() || '';
      const verdict = (row as any).verdict ?? '';

      const values = [
        [
          row.startedAt.split('T')[0],
          row.firstName,
          row.lastName,
          row.email,
          statusAxiom,
          blocAtteint,
          verdict,
          row.lastActivityAt.split('T')[0] + ' ' + row.lastActivityAt.split('T')[1]?.split('.')[0] || '',
          '',
        ],
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${post.label}!A4:I`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values,
        },
      });
    } catch (error) {
      throw new Error(`Failed to update live tracking: ${error}`);
    }
  }

  async upsertLiveTracking(tenantId: string, posteId: string, row: LiveTrackingRow): Promise<void> {
    let spreadsheetId: string | undefined;
    let sheetName: string | undefined;
    let range: string | undefined;
    try {
      await this.initializeAuth();
      if (!this.sheets) {
        throw new Error('Google Sheets not initialized');
      }

      if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) {
        throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not defined');
      }
      const post = getPostConfig(tenantId, posteId);
      spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID;
      sheetName = post.label;
      console.log('[GS] ensureSheetExists', {
        spreadsheetId,
        sheetName,
        tenantId,
        posteId,
      });
      await this.ensureSheetExists(spreadsheetId, post.label, tenantId, posteId);

      const statusAxiom = this.getStatusAxiomLabel(row.state);
      const blocAtteint = row.currentBlock?.toString() || '';
      const verdict = (row as any).verdict ?? '';

      const values = [
        [
          row.startedAt.split('T')[0],
          row.firstName,
          row.lastName,
          row.email,
          statusAxiom,
          blocAtteint,
          verdict,
          row.lastActivityAt.split('T')[0] + ' ' + row.lastActivityAt.split('T')[1]?.split('.')[0] || '',
          '',
        ],
      ];

      range = `${post.label}!A4:I`;
      console.log('[GS] values.get', { range });
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const rows = response.data.values || [];
      const candidateIndex = rows.findIndex(
        (r) => r && r.length >= 4 && r[2] === row.lastName && r[3] === row.email,
      );

      if (candidateIndex >= 0) {
        const updateRange = `${post.label}!A${candidateIndex + 4}:I${candidateIndex + 4}`;
        console.log('[GS] values.update', {
          range: updateRange,
          sheetName: post.label,
          candidateId: row.candidateId,
          email: row.email,
        });
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: updateRange,
          valueInputOption: 'RAW',
          requestBody: {
            values,
          },
        });
      } else {
        console.log('[GS] values.append', {
          range,
          sheetName: post.label,
          candidateId: row.candidateId,
          email: row.email,
        });
        await this.sheets.spreadsheets.values.append({
          spreadsheetId,
          range,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values,
          },
        });
      }
    } catch (error) {
      console.error('[GS] upsertLiveTracking error', {
        spreadsheetId,
        sheetName,
        range,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        googleResponse: (error as any)?.response?.data,
      });
      throw new Error(`Failed to upsert live tracking: ${error}`);
    }
  }
}

export const googleSheetsLiveTrackingService = new GoogleSheetsLiveTrackingService();
