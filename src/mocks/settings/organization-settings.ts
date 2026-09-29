import type { DecimalSeparator, ThousandsSeparator } from '@/lib/number-format';

/**
 * Complète `Tenant` (mocks/organization/tenants.ts) avec les paramètres que Settings >
 * Organization ajoute — le nom, le contact, l'adresse et le pays restent lus depuis
 * `organizationService`, jamais recopiés ici.
 *
 * Mandat « Format régional » (2026-09-26) : c'est l'UNIQUE configuration régionale de
 * l'association (l'ancienne page Paramètres → Localisation et son `localizationSettingsList`,
 * qui dupliquaient fuseau et devise sans être lus par l'affichage, ont été supprimés) :
 * devise, format de date, séparateurs de milliers et de décimales. Valeurs par défaut d'une
 * association sans configuration : XAF, espace, virgule (`DEFAULT_CURRENCY_CODE`,
 * `DEFAULT_REGIONAL_FORMAT`).
 */
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export type OrganizationSettings = {
  tenantId: string;
  timezone: string;
  /** Code ISO 4217 (ex. `XAF`) — jamais un libellé d'affichage (« FCFA »). */
  currency: string;
  dateFormat: DateFormat;
  thousandsSeparator: ThousandsSeparator;
  decimalSeparator: DecimalSeparator;
};

export const organizationSettingsList: OrganizationSettings[] = [
  { tenantId: 'T-001', timezone: 'Africa/Douala', currency: 'XAF', dateFormat: 'DD/MM/YYYY', thousandsSeparator: 'space', decimalSeparator: 'comma' },
  { tenantId: 'T-002', timezone: 'Africa/Douala', currency: 'XAF', dateFormat: 'DD/MM/YYYY', thousandsSeparator: 'space', decimalSeparator: 'comma' },
  { tenantId: 'T-003', timezone: 'Africa/Douala', currency: 'XAF', dateFormat: 'DD/MM/YYYY', thousandsSeparator: 'space', decimalSeparator: 'comma' },
  { tenantId: 'T-004', timezone: 'Africa/Douala', currency: 'XAF', dateFormat: 'DD/MM/YYYY', thousandsSeparator: 'space', decimalSeparator: 'comma' },
  { tenantId: 'T-005', timezone: 'Africa/Douala', currency: 'XAF', dateFormat: 'DD/MM/YYYY', thousandsSeparator: 'space', decimalSeparator: 'comma' },
];
