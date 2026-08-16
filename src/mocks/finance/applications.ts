export type ApplicationStage = 'stageSubmitted' | 'stageReview' | 'stageApproved' | 'stageRejected' | 'stageDisbursed';

export type Application = {
  id: string;
  tenantId: string;
  applicant: string;
  requestedAmount: number;
  purpose: string;
  submittedDate: string;
  reviewDate: string | null;
  approvalDate: string | null;
  stage: ApplicationStage;
  creditScore: number;
  monthlyIncome: number;
  existingLoans: number;
  tenantName: string;
};

export const applications: Application[] = [
  { id: 'AP-001', tenantId: 'T-001', applicant: 'Fatou Ndiaye', requestedAmount: 850_000, purpose: 'Agrandissement commerce', submittedDate: '2026-07-15', reviewDate: '2026-07-18', approvalDate: '2026-07-22', stage: 'stageDisbursed', creditScore: 720, monthlyIncome: 450_000, existingLoans: 1, tenantName: 'Coopérative Sutura' },
  { id: 'AP-002', tenantId: 'T-002', applicant: 'Mamadou Sow', requestedAmount: 1_200_000, purpose: 'Achat matériel artisanat', submittedDate: '2026-07-05', reviewDate: '2026-07-08', approvalDate: '2026-07-10', stage: 'stageDisbursed', creditScore: 680, monthlyIncome: 380_000, existingLoans: 1, tenantName: 'Tontine Horizon' },
  { id: 'AP-003', tenantId: 'T-001', applicant: 'Cheikh Diop', requestedAmount: 2_100_000, purpose: 'Achat véhicule professionnel', submittedDate: '2026-07-20', reviewDate: '2026-07-22', approvalDate: '2026-07-25', stage: 'stageDisbursed', creditScore: 750, monthlyIncome: 620_000, existingLoans: 1, tenantName: 'Coopérative Sutura' },
  { id: 'AP-004', tenantId: 'T-005', applicant: 'Awa Cissé', requestedAmount: 540_000, purpose: 'Réhabilitation boutique', submittedDate: '2026-08-01', reviewDate: '2026-08-05', approvalDate: null, stage: 'stageReview', creditScore: 640, monthlyIncome: 320_000, existingLoans: 1, tenantName: 'Tontine Avenir' },
  { id: 'AP-005', tenantId: 'T-002', applicant: 'Khadija Mbaye', requestedAmount: 350_000, purpose: 'Formation continue', submittedDate: '2026-08-05', reviewDate: null, approvalDate: null, stage: 'stageSubmitted', creditScore: 710, monthlyIncome: 410_000, existingLoans: 0, tenantName: 'Tontine Horizon' },
  { id: 'AP-006', tenantId: 'T-003', applicant: 'Ibrahima Sarr', requestedAmount: 450_000, purpose: 'Réparation véhicule', submittedDate: '2026-06-20', reviewDate: '2026-06-22', approvalDate: '2026-06-25', stage: 'stageRejected', creditScore: 520, monthlyIncome: 180_000, existingLoans: 1, tenantName: 'Mutuelle Teranga' },
];
