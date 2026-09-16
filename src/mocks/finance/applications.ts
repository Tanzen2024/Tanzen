export type ApplicationStage = 'stageSubmitted' | 'stageReview' | 'stageApproved' | 'stageRejected' | 'stageDisbursed';

/** Garant saisi lors de la demande, avant qu'un `Loan` (et donc un `Guarantor.loanId` réel) n'existe (mandat Finance/Tontines, phase Prêts). Devient un vrai `Guarantor` au moment du décaissement (`creditService.disburseLoan`) — jamais une donnée définitive tant que le prêt n'est pas décaissé. */
export type PendingGuarantor = { guarantorName: string; guaranteedAmount: number; relation: string };

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
  /**
   * Relations réelles ajoutées lors du mandat « Finalisation Finance/Tontines » —
   * absentes des lignes de seed historiques (AP-004, tenant T-005, ne possède
   * aucune caisse dans `accounts.ts`) : `undefined` y reste volontairement,
   * aucune valeur inventée. `creditService.submitLoanApplication` (nouveau
   * chemin de création) les exige ; les lignes de seed déjà existantes, créées
   * avant cette règle, ne sont jamais revalidées rétroactivement.
   */
  memberId?: string;
  accountId?: string;
  pendingGuarantors?: PendingGuarantor[];
};

export const applications: Application[] = [
  { id: 'AP-001', tenantId: 'T-001', applicant: 'Fatou Ndiaye', memberId: 'M-001', accountId: 'AC-001', requestedAmount: 850_000, purpose: 'Agrandissement commerce', submittedDate: '2026-07-15', reviewDate: '2026-07-18', approvalDate: '2026-07-22', stage: 'stageDisbursed', creditScore: 720, monthlyIncome: 450_000, existingLoans: 1, tenantName: 'Coopérative Sutura' },
  { id: 'AP-002', tenantId: 'T-002', applicant: 'Mamadou Sow', memberId: 'M-002', accountId: 'AC-004', requestedAmount: 1_200_000, purpose: 'Achat matériel artisanat', submittedDate: '2026-07-05', reviewDate: '2026-07-08', approvalDate: '2026-07-10', stage: 'stageDisbursed', creditScore: 680, monthlyIncome: 380_000, existingLoans: 1, tenantName: 'Tontine Horizon' },
  { id: 'AP-003', tenantId: 'T-001', applicant: 'Cheikh Diop', memberId: 'M-006', accountId: 'AC-001', requestedAmount: 2_100_000, purpose: 'Achat véhicule professionnel', submittedDate: '2026-07-20', reviewDate: '2026-07-22', approvalDate: '2026-07-25', stage: 'stageDisbursed', creditScore: 750, monthlyIncome: 620_000, existingLoans: 1, tenantName: 'Coopérative Sutura' },
  // T-005 (Tontine Avenir) ne possède aucune caisse dans accounts.ts — accountId volontairement absent, cf. commentaire du type ci-dessus.
  { id: 'AP-004', tenantId: 'T-005', applicant: 'Awa Cissé', memberId: 'M-005', requestedAmount: 540_000, purpose: 'Réhabilitation boutique', submittedDate: '2026-08-01', reviewDate: '2026-08-05', approvalDate: null, stage: 'stageReview', creditScore: 640, monthlyIncome: 320_000, existingLoans: 1, tenantName: 'Tontine Avenir' },
  { id: 'AP-005', tenantId: 'T-002', applicant: 'Khadija Mbaye', memberId: 'M-007', accountId: 'AC-004', requestedAmount: 350_000, purpose: 'Formation continue', submittedDate: '2026-08-05', reviewDate: null, approvalDate: null, stage: 'stageSubmitted', creditScore: 710, monthlyIncome: 410_000, existingLoans: 0, tenantName: 'Tontine Horizon' },
  { id: 'AP-006', tenantId: 'T-003', applicant: 'Ibrahima Sarr', memberId: 'M-008', accountId: 'AC-006', requestedAmount: 450_000, purpose: 'Réparation véhicule', submittedDate: '2026-06-20', reviewDate: '2026-06-22', approvalDate: '2026-06-25', stage: 'stageRejected', creditScore: 520, monthlyIncome: 180_000, existingLoans: 1, tenantName: 'Mutuelle Teranga' },
];
