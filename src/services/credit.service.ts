import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { applications, type Application, type ApplicationStage } from '@/mocks/finance/applications';
import { loans, type Loan } from '@/mocks/finance/loans';
import { repayments, type Repayment, type RepaymentStatus } from '@/mocks/finance/repayments';
import { guarantors, type Guarantor } from '@/mocks/finance/guarantors';

export type ApplicationInput = Omit<Application, 'id' | 'stage' | 'reviewDate' | 'approvalDate' | 'submittedDate'>;
export type LoanInput = Omit<Loan, 'id' | 'outstanding' | 'progress' | 'paidAmount' | 'status' | 'disbursementDate' | 'lastPaymentDate' | 'penalties' | 'documents' | 'activities'>;
export type RepaymentInput = { loanId: string; paymentDate: string; principalPart: number; interestPart: number; status: RepaymentStatus };
export type GuarantorInput = Pick<Guarantor, 'loanId' | 'guarantorName' | 'guaranteedAmount' | 'relation'>;

export const creditService = {
  listApplications: (tenantId: string) => mockRequest(() => applications.filter((application) => application.tenantId === tenantId)),
  getApplication: (tenantId: string, applicationId: string) => mockRequest(() => getTenantScoped(applications, (application) => application.id === applicationId, tenantId)),
  createApplication: (input: ApplicationInput) =>
    mockRequest(() => {
      const application: Application = { id: `AP-${String(applications.length + 1).padStart(3, '0')}`, stage: 'stageSubmitted', submittedDate: new Date().toISOString().slice(0, 10), reviewDate: null, approvalDate: null, ...input };
      applications.push(application);
      return application;
    }),
  /** Transition de statut réelle (mêmes étapes que le modèle existant) — persiste dans la source mock canonique, comme workflowService.submitAction. */
  advanceApplicationStage: (tenantId: string, applicationId: string, nextStage: ApplicationStage) =>
    mockRequest(() => {
      const application = getTenantScoped(applications, (item) => item.id === applicationId, tenantId);
      if (!application) return undefined;
      const today = new Date().toISOString().slice(0, 10);
      if (nextStage === 'stageApproved') application.approvalDate = today;
      else if (nextStage === 'stageReview' || nextStage === 'stageRejected') application.reviewDate = today;
      application.stage = nextStage;
      return application;
    }),

  listLoans: (tenantId: string) => mockRequest(() => loans.filter((loan) => loan.tenantId === tenantId)),
  getLoan: (tenantId: string, loanId: string) => mockRequest(() => getTenantScoped(loans, (loan) => loan.id === loanId, tenantId)),
  listLoansByMember: (memberId: string) => mockRequest(() => loans.filter((loan) => loan.memberId === memberId)),
  createLoan: (input: LoanInput) =>
    mockRequest(() => {
      const loan: Loan = { id: `L-${String(loans.length + 1).padStart(3, '0')}`, outstanding: input.principal, progress: 0, paidAmount: 0, status: 'active', disbursementDate: new Date().toISOString().slice(0, 10), lastPaymentDate: new Date().toISOString().slice(0, 10), penalties: [], documents: [], activities: [], ...input };
      loans.push(loan);
      return loan;
    }),

  listRepayments: (tenantId: string) => mockRequest(() => repayments.filter((repayment) => repayment.tenantId === tenantId)),
  /** Tenant-scoped en deux temps (voir tenant-scope.ts) : le Loan parent doit d'abord appartenir au tenant courant, sinon aucun remboursement n'est retourné — ne jamais faire confiance au seul `loanId` de l'URL. */
  listRepaymentsByLoan: (tenantId: string, loanId: string) =>
    mockRequest(() => {
      const loan = getTenantScoped(loans, (item) => item.id === loanId, tenantId);
      if (!loan) return [];
      return repayments.filter((repayment) => repayment.loanId === loan.id);
    }),

  listGuarantors: (tenantId: string) => mockRequest(() => guarantors.filter((guarantor) => guarantor.tenantId === tenantId)),
  /** Même pattern que listRepaymentsByLoan : le Loan parent doit être validé tenant-scope avant de révéler ses garants. */
  listGuarantorsByLoan: (tenantId: string, loanId: string) =>
    mockRequest(() => {
      const loan = getTenantScoped(loans, (item) => item.id === loanId, tenantId);
      if (!loan) return [];
      return guarantors.filter((guarantor) => guarantor.loanId === loan.id);
    }),

  /** Même exigence que listRepaymentsByLoan : le Loan parent doit être tenant-scoped avant toute écriture — un remboursement n'est jamais créé sur un `loanId` non vérifié. */
  createRepayment: (tenantId: string, input: RepaymentInput) =>
    mockRequest(() => {
      const loan = getTenantScoped(loans, (item) => item.id === input.loanId, tenantId);
      if (!loan) return undefined;
      const repayment: Repayment = { id: `RP-${String(repayments.length + 1).padStart(3, '0')}`, tenantId, borrower: loan.borrower, amount: input.principalPart + input.interestPart, ...input };
      repayments.push(repayment);
      if (input.status === 'completed') {
        loan.paidAmount += repayment.amount;
        loan.outstanding = loan.totalRepayable - loan.paidAmount;
        loan.progress = Math.round((loan.paidAmount / loan.totalRepayable) * 100);
        loan.lastPaymentDate = input.paymentDate;
      }
      return repayment;
    }),

  createGuarantor: (tenantId: string, input: GuarantorInput) =>
    mockRequest(() => {
      const loan = getTenantScoped(loans, (item) => item.id === input.loanId, tenantId);
      if (!loan) return undefined;
      const guarantor: Guarantor = { id: `GU-${String(guarantors.length + 1).padStart(3, '0')}`, tenantId, borrowerName: loan.borrower, tenantName: loan.tenantName, ...input };
      guarantors.push(guarantor);
      return guarantor;
    }),

  /** Clôture uniquement un prêt intégralement remboursé (`outstanding === 0`) — condition déjà présente dans le modèle, pas une règle de clôture anticipée inventée. */
  closeLoan: (tenantId: string, loanId: string) =>
    mockRequest(() => {
      const loan = getTenantScoped(loans, (item) => item.id === loanId, tenantId);
      if (!loan || loan.outstanding !== 0) return undefined;
      loan.status = 'repaid';
      return loan;
    }),
};
