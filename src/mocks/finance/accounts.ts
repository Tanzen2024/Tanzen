export type AccountType = 'savings' | 'current' | 'loanAccount' | 'treasury';
export type AccountStatus = 'active' | 'inactive';

export type Account = {
  id: string;
  tenantId: string;
  accountNumber: string;
  type: AccountType;
  balance: number;
  tenantName: string;
  status: AccountStatus;
  lastMovement: string;
};

export const accounts: Account[] = [
  { id: 'AC-001', tenantId: 'T-001', accountNumber: 'CS-001-TRÉS', type: 'treasury', balance: 12_500_000, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-10' },
  { id: 'AC-002', tenantId: 'T-001', accountNumber: 'CS-001-ÉPG', type: 'savings', balance: 8_750_000, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-09' },
  { id: 'AC-003', tenantId: 'T-001', accountNumber: 'CS-001-COUR', type: 'current', balance: 3_200_000, tenantName: 'Coopérative Sutura', status: 'active', lastMovement: '2026-08-11' },
  { id: 'AC-004', tenantId: 'T-002', accountNumber: 'TH-002-TRÉS', type: 'treasury', balance: 4_800_000, tenantName: 'Tontine Horizon', status: 'active', lastMovement: '2026-08-08' },
  { id: 'AC-005', tenantId: 'T-002', accountNumber: 'TH-002-ÉPG', type: 'savings', balance: 2_100_000, tenantName: 'Tontine Horizon', status: 'active', lastMovement: '2026-08-07' },
  { id: 'AC-006', tenantId: 'T-003', accountNumber: 'MT-003-TRÉS', type: 'treasury', balance: 6_300_000, tenantName: 'Mutuelle Teranga', status: 'active', lastMovement: '2026-08-10' },
  { id: 'AC-007', tenantId: 'T-003', accountNumber: 'MT-003-COUR', type: 'current', balance: 1_450_000, tenantName: 'Mutuelle Teranga', status: 'active', lastMovement: '2026-08-06' },
  { id: 'AC-008', tenantId: 'T-004', accountNumber: 'AJ-004-ÉPG', type: 'savings', balance: 320_000, tenantName: 'Association Jappo', status: 'inactive', lastMovement: '2026-05-15' },
];
