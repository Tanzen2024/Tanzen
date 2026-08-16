export type LoanStatus = 'pending' | 'active' | 'repaid' | 'defaulted';
export type LoanPenalty = { id: string; amount: number; date: string; reason: string; status: 'applied' | 'waived' };
export type LoanDocument = { id: string; name: string; type: 'contract' | 'statement' | 'other'; uploadedAt: string };
export type LoanActivity = { id: string; type: string; description: string; date: string };

export type Loan = {
  id: string;
  tenantId: string;
  memberId: string;
  borrower: string;
  principal: number;
  interestRate: number;
  interestAmount: number;
  totalRepayable: number;
  paidAmount: number;
  outstanding: number;
  disbursementDate: string;
  maturityDate: string;
  monthlyPayment: number;
  nextPaymentDate: string;
  lastPaymentDate: string;
  status: LoanStatus;
  progress: number;
  applicationId: string;
  tenantName: string;
  penalties: LoanPenalty[];
  documents: LoanDocument[];
  activities: LoanActivity[];
};

export const loans: Loan[] = [
  {
    id: 'L-001', tenantId: 'T-001', memberId: 'M-001', borrower: 'Fatou Ndiaye', principal: 850_000, interestRate: 12, interestAmount: 102_000, totalRepayable: 952_000, paidAmount: 428_400, outstanding: 523_600, disbursementDate: '2026-07-22', maturityDate: '2027-01-22', monthlyPayment: 158_667, nextPaymentDate: '2026-09-15', lastPaymentDate: '2026-08-15', status: 'active', progress: 45, applicationId: 'AP-001', tenantName: 'Coopérative Sutura',
    penalties: [],
    documents: [{ id: 'LD-1', name: 'Contrat de prêt', type: 'contract', uploadedAt: '2026-07-22' }],
    activities: [{ id: 'LA-1', type: 'Disbursement', description: 'Décaissement de 850 000 FCFA', date: '2026-07-22' }, { id: 'LA-2', type: 'Repayment', description: 'Remboursement mensualité 1', date: '2026-08-15' }],
  },
  {
    id: 'L-002', tenantId: 'T-002', memberId: 'M-002', borrower: 'Mamadou Sow', principal: 1_200_000, interestRate: 10, interestAmount: 120_000, totalRepayable: 1_320_000, paidAmount: 818_400, outstanding: 501_600, disbursementDate: '2026-07-10', maturityDate: '2027-01-10', monthlyPayment: 220_000, nextPaymentDate: '2026-09-10', lastPaymentDate: '2026-08-10', status: 'active', progress: 62, applicationId: 'AP-002', tenantName: 'Tontine Horizon',
    penalties: [],
    documents: [{ id: 'LD-2', name: 'Contrat de prêt', type: 'contract', uploadedAt: '2026-07-10' }],
    activities: [{ id: 'LA-3', type: 'Disbursement', description: 'Décaissement de 1 200 000 FCFA', date: '2026-07-10' }, { id: 'LA-4', type: 'Repayment', description: 'Remboursement mensualité 1', date: '2026-08-10' }],
  },
  {
    id: 'L-003', tenantId: 'T-005', memberId: 'M-005', borrower: 'Awa Cissé', principal: 540_000, interestRate: 14, interestAmount: 75_600, totalRepayable: 615_600, paidAmount: 480_169, outstanding: 135_431, disbursementDate: '2026-05-15', maturityDate: '2026-11-15', monthlyPayment: 102_600, nextPaymentDate: '2026-09-10', lastPaymentDate: '2026-08-01', status: 'active', progress: 78, applicationId: 'AP-006', tenantName: 'Tontine Avenir',
    penalties: [{ id: 'LP-1', amount: 5_000, date: '2026-07-01', reason: 'Retard de 3 jours', status: 'applied' }],
    documents: [{ id: 'LD-3', name: 'Contrat de prêt', type: 'contract', uploadedAt: '2026-05-15' }, { id: 'LD-4', name: 'Relevé de remboursement', type: 'statement', uploadedAt: '2026-08-01' }],
    activities: [{ id: 'LA-5', type: 'Disbursement', description: 'Décaissement de 540 000 FCFA', date: '2026-05-15' }, { id: 'LA-6', type: 'Penalty', description: 'Pénalité de retard appliquée', date: '2026-07-01' }],
  },
  {
    id: 'L-004', tenantId: 'T-001', memberId: 'M-006', borrower: 'Cheikh Diop', principal: 2_100_000, interestRate: 11, interestAmount: 231_000, totalRepayable: 2_331_000, paidAmount: 652_680, outstanding: 1_678_320, disbursementDate: '2026-07-25', maturityDate: '2027-07-25', monthlyPayment: 194_250, nextPaymentDate: '2026-09-01', lastPaymentDate: '2026-08-01', status: 'active', progress: 28, applicationId: 'AP-003', tenantName: 'Coopérative Sutura',
    penalties: [],
    documents: [{ id: 'LD-5', name: 'Contrat de prêt', type: 'contract', uploadedAt: '2026-07-25' }],
    activities: [{ id: 'LA-7', type: 'Disbursement', description: 'Décaissement de 2 100 000 FCFA', date: '2026-07-25' }, { id: 'LA-8', type: 'Repayment', description: 'Remboursement mensualité 1', date: '2026-08-01' }],
  },
  {
    id: 'L-005', tenantId: 'T-003', memberId: 'M-008', borrower: 'Ibrahima Sarr', principal: 450_000, interestRate: 15, interestAmount: 67_500, totalRepayable: 517_500, paidAmount: 465_750, outstanding: 51_750, disbursementDate: '2026-03-01', maturityDate: '2026-09-01', monthlyPayment: 86_250, nextPaymentDate: '2026-09-01', lastPaymentDate: '2026-07-15', status: 'active', progress: 90, applicationId: 'AP-006', tenantName: 'Mutuelle Teranga',
    penalties: [{ id: 'LP-2', amount: 15_000, date: '2026-08-01', reason: 'Retard de 16 jours', status: 'applied' }, { id: 'LP-3', amount: 8_000, date: '2026-07-15', reason: 'Retard de 10 jours', status: 'waived' }],
    documents: [{ id: 'LD-6', name: 'Contrat de prêt', type: 'contract', uploadedAt: '2026-03-01' }],
    activities: [{ id: 'LA-9', type: 'Disbursement', description: 'Décaissement de 450 000 FCFA', date: '2026-03-01' }, { id: 'LA-10', type: 'Penalty', description: 'Pénalité appliquée - retard 16 jours', date: '2026-08-01' }, { id: 'LA-11', type: 'Penalty', description: 'Pénalité annulée - retard 10 jours', date: '2026-07-15' }],
  },
];
