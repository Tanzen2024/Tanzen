export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type NumberFormatStyle = 'space' | 'comma' | 'period';

export type LocalizationSettings = {
  tenantId: string;
  timezone: string;
  dateFormat: DateFormat;
  numberFormat: NumberFormatStyle;
  currency: string;
};

export const localizationSettingsList: LocalizationSettings[] = [
  { tenantId: 'T-001', timezone: 'Africa/Dakar', dateFormat: 'DD/MM/YYYY', numberFormat: 'space', currency: 'XOF' },
  { tenantId: 'T-002', timezone: 'Africa/Dakar', dateFormat: 'DD/MM/YYYY', numberFormat: 'space', currency: 'XOF' },
  { tenantId: 'T-003', timezone: 'Africa/Dakar', dateFormat: 'DD/MM/YYYY', numberFormat: 'space', currency: 'XOF' },
  { tenantId: 'T-004', timezone: 'Africa/Dakar', dateFormat: 'DD/MM/YYYY', numberFormat: 'space', currency: 'XOF' },
  { tenantId: 'T-005', timezone: 'Africa/Dakar', dateFormat: 'DD/MM/YYYY', numberFormat: 'space', currency: 'XOF' },
];
