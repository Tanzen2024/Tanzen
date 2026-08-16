export type RepaymentStatus = 'completed' | 'scheduled' | 'late';

export type Repayment = {
  id: string;
  tenantId: string;
  loanId: string;
  borrower: string;
  paymentDate: string;
  amount: number;
  principalPart: number;
  interestPart: number;
  status: RepaymentStatus;
};

export const repayments: Repayment[] = [
  { id: 'RP-001', tenantId: 'T-001', loanId: 'L-001', borrower: 'Fatou Ndiaye', paymentDate: '2026-08-15', amount: 158_667, principalPart: 140_000, interestPart: 18_667, status: 'completed' },
  { id: 'RP-002', tenantId: 'T-002', loanId: 'L-002', borrower: 'Mamadou Sow', paymentDate: '2026-08-10', amount: 220_000, principalPart: 200_000, interestPart: 20_000, status: 'completed' },
  { id: 'RP-003', tenantId: 'T-005', loanId: 'L-003', borrower: 'Awa Cissé', paymentDate: '2026-08-01', amount: 102_600, principalPart: 95_000, interestPart: 7_600, status: 'completed' },
  { id: 'RP-004', tenantId: 'T-001', loanId: 'L-004', borrower: 'Cheikh Diop', paymentDate: '2026-08-01', amount: 194_250, principalPart: 175_000, interestPart: 19_250, status: 'completed' },
  { id: 'RP-005', tenantId: 'T-001', loanId: 'L-001', borrower: 'Fatou Ndiaye', paymentDate: '2026-09-15', amount: 158_667, principalPart: 140_000, interestPart: 18_667, status: 'scheduled' },
  { id: 'RP-006', tenantId: 'T-002', loanId: 'L-002', borrower: 'Mamadou Sow', paymentDate: '2026-09-10', amount: 220_000, principalPart: 200_000, interestPart: 20_000, status: 'scheduled' },
  { id: 'RP-007', tenantId: 'T-005', loanId: 'L-003', borrower: 'Awa Cissé', paymentDate: '2026-09-10', amount: 102_600, principalPart: 95_000, interestPart: 7_600, status: 'scheduled' },
  { id: 'RP-008', tenantId: 'T-001', loanId: 'L-004', borrower: 'Cheikh Diop', paymentDate: '2026-09-01', amount: 194_250, principalPart: 175_000, interestPart: 19_250, status: 'scheduled' },
  { id: 'RP-009', tenantId: 'T-003', loanId: 'L-005', borrower: 'Ibrahima Sarr', paymentDate: '2026-08-01', amount: 86_250, principalPart: 75_000, interestPart: 11_250, status: 'late' },
  { id: 'RP-010', tenantId: 'T-003', loanId: 'L-005', borrower: 'Ibrahima Sarr', paymentDate: '2026-09-01', amount: 86_250, principalPart: 75_000, interestPart: 11_250, status: 'scheduled' },
];
