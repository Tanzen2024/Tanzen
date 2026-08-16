export type Guarantor = {
  id: string;
  tenantId: string;
  guarantorName: string;
  loanId: string;
  borrowerName: string;
  guaranteedAmount: number;
  relation: string;
  tenantName: string;
};

export const guarantors: Guarantor[] = [
  { id: 'GU-001', tenantId: 'T-001', guarantorName: 'Cheikh Diop', loanId: 'L-001', borrowerName: 'Fatou Ndiaye', guaranteedAmount: 425_000, relation: 'Collègue bureau', tenantName: 'Coopérative Sutura' },
  { id: 'GU-002', tenantId: 'T-002', guarantorName: 'Aïssatou Bâ', loanId: 'L-002', borrowerName: 'Mamadou Sow', guaranteedAmount: 600_000, relation: 'Membre tontine', tenantName: 'Tontine Horizon' },
  { id: 'GU-003', tenantId: 'T-005', guarantorName: 'Fatou Ndiaye', loanId: 'L-003', borrowerName: 'Awa Cissé', guaranteedAmount: 270_000, relation: 'Parente', tenantName: 'Tontine Avenir' },
  { id: 'GU-004', tenantId: 'T-001', guarantorName: 'Mamadou Sow', loanId: 'L-004', borrowerName: 'Cheikh Diop', guaranteedAmount: 1_050_000, relation: 'Ami proche', tenantName: 'Coopérative Sutura' },
  { id: 'GU-005', tenantId: 'T-003', guarantorName: 'Awa Cissé', loanId: 'L-005', borrowerName: 'Ibrahima Sarr', guaranteedAmount: 225_000, relation: 'Voisin', tenantName: 'Mutuelle Teranga' },
];
