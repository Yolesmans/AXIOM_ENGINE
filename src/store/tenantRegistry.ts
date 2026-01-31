import type { TenantConfig } from '../types/tenant.js';

const tenants: Record<string, TenantConfig> = {
  elgaenergy: {
    tenantId: 'elgaenergy',
    name: 'Elga Energy',
    spreadsheetId: '1t655Zq4PwJ7GrmgNBOBKj4UdlDBNDznsZnHjE7f2hqg',
    createdAt: new Date().toISOString(),
  },
};

export function getTenantConfig(tenantId: string): TenantConfig {
  const tenant = tenants[tenantId];
  if (!tenant) {
    throw new Error(`UNKNOWN_TENANT: ${tenantId}`);
  }
  return tenant;
}

export function getSpreadsheetIdForTenant(tenantId: string): string {
  return getTenantConfig(tenantId).spreadsheetId;
}
