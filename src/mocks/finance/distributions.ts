export type Distribution = {
  id: string;
  tenantId: string;
  beneficiary: string;
  source: string;
  amount: number;
  date: string;
  status: 'completed' | 'pending';
};

export const distributions: Distribution[] = [
  { id: 'DI-001', tenantId: 'T-003', beneficiary: 'Aïssatou Bâ', source: 'Mutuelle Teranga', amount: 300_000, date: '2026-08-06', status: 'completed' },
  { id: 'DI-002', tenantId: 'T-002', beneficiary: 'Tontine Horizon - Cycle 4', source: 'Tontine Horizon', amount: 200_000, date: '2026-07-25', status: 'completed' },
  { id: 'DI-003', tenantId: 'T-001', beneficiary: 'Fatou Ndiaye', source: 'Coopérative Sutura', amount: 150_000, date: '2026-07-20', status: 'completed' },
  { id: 'DI-004', tenantId: 'T-002', beneficiary: 'Mamadou Sow', source: 'Tontine Horizon', amount: 180_000, date: '2026-08-15', status: 'pending' },
  { id: 'DI-005', tenantId: 'T-001', beneficiary: 'Cheikh Diop', source: 'Coopérative Sutura', amount: 220_000, date: '2026-08-18', status: 'pending' },
];
