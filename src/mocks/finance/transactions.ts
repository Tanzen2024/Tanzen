export type TransactionType = 'debit' | 'credit';
export type TransactionCategory = 'contribution' | 'repayment' | 'loanDisbursement' | 'loanRepayment' | 'fee' | 'transfer' | 'distribution' | 'penalty';
export type TransactionStatus = 'completed' | 'pending' | 'failed';

export type Transaction = {
  id: string;
  tenantId: string;
  reference: string;
  date: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  status: TransactionStatus;
  fromAccount: string;
  toAccount: string;
  description: string;
};

export const transactions: Transaction[] = [
  { id: 'TR-001', tenantId: 'T-001', reference: 'REF-2026-0001', date: '2026-08-11', amount: 50_000, type: 'credit', category: 'contribution', status: 'completed', fromAccount: 'Fatou Ndiaye', toAccount: 'CS-001-ÉPG', description: 'Contribution cycle 4 - Tontine Horizon' },
  { id: 'TR-002', tenantId: 'T-001', reference: 'REF-2026-0002', date: '2026-08-10', amount: 850_000, type: 'debit', category: 'loanDisbursement', status: 'completed', fromAccount: 'CS-001-TRÉS', toAccount: 'Fatou Ndiaye', description: 'Décaissement prêt L-001' },
  { id: 'TR-003', tenantId: 'T-002', reference: 'REF-2026-0003', date: '2026-08-10', amount: 75_000, type: 'credit', category: 'contribution', status: 'completed', fromAccount: 'Mamadou Sow', toAccount: 'TH-002-ÉPG', description: 'Contribution cycle 3 - Tontine Horizon' },
  { id: 'TR-004', tenantId: 'T-001', reference: 'REF-2026-0004', date: '2026-08-09', amount: 120_000, type: 'credit', category: 'loanRepayment', status: 'completed', fromAccount: 'Cheikh Diop', toAccount: 'CS-001-TRÉS', description: 'Remboursement prêt L-004 - Mensualité 3' },
  { id: 'TR-005', tenantId: 'T-002', reference: 'REF-2026-0005', date: '2026-08-08', amount: 50_000, type: 'credit', category: 'contribution', status: 'completed', fromAccount: 'Khadija Mbaye', toAccount: 'TH-002-ÉPG', description: 'Contribution cycle 4 - Tontine Horizon' },
  { id: 'TR-006', tenantId: 'T-001', reference: 'REF-2026-0006', date: '2026-08-07', amount: 25_000, type: 'debit', category: 'fee', status: 'completed', fromAccount: 'CS-001-COUR', toAccount: 'Frais bancaires', description: 'Frais de transfert Western Union' },
  { id: 'TR-007', tenantId: 'T-003', reference: 'REF-2026-0007', date: '2026-08-06', amount: 300_000, type: 'debit', category: 'distribution', status: 'completed', fromAccount: 'MT-003-TRÉS', toAccount: 'Aïssatou Bâ', description: 'Distribution trimestrielle - Mutuelle Teranga' },
  { id: 'TR-008', tenantId: 'T-003', reference: 'REF-2026-0008', date: '2026-08-05', amount: 15_000, type: 'debit', category: 'penalty', status: 'completed', fromAccount: 'Ibrahima Sarr', toAccount: 'MT-003-TRÉS', description: 'Pénalité retard remboursement L-005' },
  { id: 'TR-009', tenantId: 'T-005', reference: 'REF-2026-0009', date: '2026-08-04', amount: 60_000, type: 'credit', category: 'contribution', status: 'pending', fromAccount: 'Awa Cissé', toAccount: 'TA-005-SAV', description: 'Contribution cycle 1 - Tontine Avenir' },
  { id: 'TR-010', tenantId: 'T-001', reference: 'REF-2026-0010', date: '2026-08-03', amount: 500_000, type: 'debit', category: 'transfer', status: 'completed', fromAccount: 'CS-001-TRÉS', toAccount: 'CS-001-COUR', description: 'Virement interne trésorerie vers courant' },
  { id: 'TR-011', tenantId: 'T-005', reference: 'REF-2026-0011', date: '2026-08-02', amount: 95_000, type: 'credit', category: 'loanRepayment', status: 'completed', fromAccount: 'Awa Cissé', toAccount: 'TA-005-SAV', description: 'Remboursement prêt L-003 - Mensualité 5' },
  { id: 'TR-012', tenantId: 'T-001', reference: 'REF-2026-0012', date: '2026-08-01', amount: 50_000, type: 'credit', category: 'contribution', status: 'completed', fromAccount: 'Fatou Ndiaye', toAccount: 'CS-001-ÉPG', description: 'Contribution cycle 3 - Tontine Horizon' },
  { id: 'TR-013', tenantId: 'T-002', reference: 'REF-2026-0013', date: '2026-07-30', amount: 1_200_000, type: 'debit', category: 'loanDisbursement', status: 'completed', fromAccount: 'TH-002-TRÉS', toAccount: 'Mamadou Sow', description: 'Décaissement prêt L-002' },
  { id: 'TR-014', tenantId: 'T-003', reference: 'REF-2026-0014', date: '2026-07-28', amount: 45_000, type: 'debit', category: 'penalty', status: 'failed', fromAccount: 'Ibrahima Sarr', toAccount: 'MT-003-TRÉS', description: 'Pénalité - échec prélèvement' },
  { id: 'TR-015', tenantId: 'T-002', reference: 'REF-2026-0015', date: '2026-07-25', amount: 200_000, type: 'debit', category: 'distribution', status: 'completed', fromAccount: 'TH-002-TRÉS', toAccount: 'Tontine Horizon - Cycle 4', description: 'Distribution tirage cycle 4' },
];
