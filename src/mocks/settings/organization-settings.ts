/**
 * Complète `Tenant` (mocks/organization/tenants.ts) avec les seuls champs
 * que Settings > Organization ajoute (fuseau horaire, devise) — le nom, le
 * contact, l'adresse et le pays restent lus depuis `organizationService`,
 * jamais recopiés ici.
 */
export type OrganizationSettings = {
  tenantId: string;
  timezone: string;
  currency: string;
};

export const organizationSettingsList: OrganizationSettings[] = [
  { tenantId: 'T-001', timezone: 'Africa/Dakar', currency: 'XOF' },
  { tenantId: 'T-002', timezone: 'Africa/Dakar', currency: 'XOF' },
  { tenantId: 'T-003', timezone: 'Africa/Dakar', currency: 'XOF' },
  { tenantId: 'T-004', timezone: 'Africa/Dakar', currency: 'XOF' },
  { tenantId: 'T-005', timezone: 'Africa/Dakar', currency: 'XOF' },
];
