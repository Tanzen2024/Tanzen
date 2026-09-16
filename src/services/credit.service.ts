import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { applications, type Application, type ApplicationStage, type PendingGuarantor } from '@/mocks/finance/applications';
import { loans, type Loan } from '@/mocks/finance/loans';
import { repayments, type Repayment, type RepaymentStatus } from '@/mocks/finance/repayments';
import { guarantors, type Guarantor } from '@/mocks/finance/guarantors';
import { loanRules, type LoanRule } from '@/mocks/finance/loan-rules';
import { accounts } from '@/mocks/finance/accounts';
import { members } from '@/mocks/organization/members';
import { auditEvents, type AuditEvent } from '@/mocks/audit/audit-events';
import { currentUser } from '@/mocks/rbac.mocks';
import { workflowDefinitions } from '@/mocks/operations/workflow-definitions';
import type { WorkflowRequest } from '@/mocks/operations/workflow-requests';
import { workflowService } from './workflow.service';
import { financeService, type TransactionInput } from './finance.service';
import { computeLoanTerms } from '@/lib/finance';

export type ApplicationInput = Omit<Application, 'id' | 'stage' | 'reviewDate' | 'approvalDate' | 'submittedDate'>;
export type LoanInput = Omit<Loan, 'id' | 'outstanding' | 'progress' | 'paidAmount' | 'status' | 'disbursementDate' | 'lastPaymentDate' | 'penalties' | 'documents' | 'activities'>;
export type RepaymentInput = { loanId: string; paymentDate: string; principalPart: number; interestPart: number; status: RepaymentStatus };
export type GuarantorInput = Pick<Guarantor, 'loanId' | 'guarantorName' | 'guaranteedAmount' | 'relation'>;

export type SubmitLoanApplicationInput = {
  memberId: string;
  accountId: string;
  requestedAmount: number;
  purpose: string;
  creditScore?: number;
  monthlyIncome?: number;
  guarantors?: PendingGuarantor[];
};

export type CreateLoanTransactionInput = {
  accountId: string;
  memberId: string;
  principal: number;
  purpose?: string;
  guarantors: PendingGuarantor[];
  approved: boolean;
  approvedBy?: string;
  /** Déjà entièrement construit côté appelant (catégorie PRET, description, réunion...) — voir `financeService.createTransaction`. */
  transactionInput: TransactionInput;
};

export type CreateRepaymentTransactionInput = {
  loanId: string;
  paymentDate: string;
  principalPart: number;
  interestPart: number;
  transactionInput: TransactionInput;
};

/** `Date.now()` seul peut collisionner entre deux créations survenant dans la même milliseconde (même précaution que `tontine-turns.service.ts`, `uniqueId`). */
function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Politique de prêt applicable à une caisse (mandat « Finalisation Finance/
 * Tontines ») — SOURCE UNIQUE DE VÉRITÉ côté service, réutilisée par toutes les
 * fonctions de ce fichier qui doivent appliquer une `LoanRule` (avant ce
 * mandat, cette résolution n'existait que côté UI, `applicableLoanRule` dans
 * `finance-module.tsx`, jamais revérifiée côté service — un appel direct au
 * service contournait donc entièrement la politique). Ne retient qu'une règle
 * ACTIVE et non supprimée qui autorise les prêts (`allowLoans`).
 */
function resolveActiveLoanRule(tenantId: string, accountId: string): LoanRule | undefined {
  return loanRules.find((rule) => rule.tenantId === tenantId && rule.accountId === accountId && rule.status === 'ACTIVE' && rule.deletedAt === null && rule.allowLoans);
}

/**
 * Nombre de prêts ACTIFS d'un membre pour ce tenant (mandat `maxActiveLoans`) —
 * un prêt `repaid`/`defaulted` ne compte plus, un prêt tout juste décaissé
 * (`status: 'active'`) compte. Exposé pour que l'UI affiche exactement le même
 * nombre que celui réellement appliqué par la règle côté service (avant ce
 * mandat, l'UI calculait son propre `activeLoanCount` sans jamais bloquer la
 * soumission avec — cf. audit TANZEN, section Finance).
 */
function countActiveLoans(tenantId: string, memberId: string): number {
  return loans.filter((loan) => loan.tenantId === tenantId && loan.memberId === memberId && loan.status === 'active').length;
}

function pushGuarantors(tenantId: string, loan: Loan, list: PendingGuarantor[] | undefined, tenantName: string) {
  for (const guarantor of list ?? []) {
    if (!guarantor.guarantorName.trim() || !(guarantor.guaranteedAmount > 0)) continue;
    const record: Guarantor = {
      id: `GU-${String(guarantors.length + 1).padStart(3, '0')}`,
      tenantId,
      guarantorName: guarantor.guarantorName.trim(),
      loanId: loan.id,
      borrowerName: loan.borrower,
      guaranteedAmount: guarantor.guaranteedAmount,
      relation: guarantor.relation,
      tenantName,
    };
    guarantors.push(record);
  }
}

function recordCreditAudit(params: { tenantId: string; action: string; resourceId: string; resourceLabel: string; context?: Record<string, string | number> }) {
  const event: AuditEvent = {
    id: `AUD-CRD-${Date.now()}-${auditEvents.length}`,
    tenantId: params.tenantId,
    timestamp: new Date().toISOString(),
    actorId: currentUser.id,
    actorName: currentUser.name,
    module: 'credit',
    action: params.action,
    eventType: 'sensitiveAction',
    resourceType: 'loan',
    resourceId: params.resourceId,
    resourceLabel: params.resourceLabel,
    status: 'success',
    sensitive: true,
    correlationId: params.resourceId,
    ...(params.context ? { context: params.context } : {}),
  };
  auditEvents.push(event);
}

/**
 * Mutation partagée par `createRepayment` (chemin historique) et
 * `createRepaymentTransaction` (nouveau chemin atomique, mandat « Finalisation
 * Finance/Tontines ») — seule et unique fonction qui recalcule `paidAmount`/
 * `outstanding`/`progress`/`status` d'un `Loan`. Refuse (retourne `undefined`,
 * aucune mutation) un remboursement négatif, nul, ou qui dépasserait le
 * montant total dû (§14 du mandat : « interdire les incohérences ») — avant ce
 * mandat, seule la validation du formulaire React bloquait un dépassement,
 * jamais le service.
 */
function applyRepaymentToLoan(loan: Loan, input: Pick<RepaymentInput, 'principalPart' | 'interestPart' | 'paymentDate' | 'status'>): boolean {
  if (input.principalPart < 0 || input.interestPart < 0) return false;
  const amount = input.principalPart + input.interestPart;
  if (input.status === 'completed') {
    if (amount <= 0) return false;
    if (loan.paidAmount + amount > loan.totalRepayable) return false;
    loan.paidAmount += amount;
    loan.outstanding = loan.totalRepayable - loan.paidAmount;
    loan.progress = Math.round((loan.paidAmount / loan.totalRepayable) * 100);
    loan.lastPaymentDate = input.paymentDate;
    // Transition de statut réelle à l'extinction de la dette (mandat §14 « Loan status ») —
    // jamais appliquée avant ce mandat, `status` restait `active` même à `outstanding === 0`.
    if (loan.outstanding <= 0) loan.status = 'repaid';
  }
  return true;
}

export const creditService = {
  listApplications: (tenantId: string) => mockRequest(() => applications.filter((application) => application.tenantId === tenantId)),
  getApplication: (tenantId: string, applicationId: string) => mockRequest(() => getTenantScoped(applications, (application) => application.id === applicationId, tenantId)),
  createApplication: (input: ApplicationInput) =>
    mockRequest(() => {
      const application: Application = { id: uniqueId('AP'), stage: 'stageSubmitted', submittedDate: today(), reviewDate: null, approvalDate: null, ...input };
      applications.push(application);
      return application;
    }),
  /** Transition de statut réelle (mêmes étapes que le modèle existant) — persiste dans la source mock canonique, comme workflowService.submitAction. */
  advanceApplicationStage: (tenantId: string, applicationId: string, nextStage: ApplicationStage) =>
    mockRequest(() => {
      const application = getTenantScoped(applications, (item) => item.id === applicationId, tenantId);
      if (!application) return undefined;
      const day = today();
      if (nextStage === 'stageApproved') application.approvalDate = day;
      else if (nextStage === 'stageReview' || nextStage === 'stageRejected') application.reviewDate = day;
      application.stage = nextStage;
      return application;
    }),

  /**
   * NOUVEAU point d'entrée « demande de prêt avec approbation préalable »
   * (mandat « Finalisation Finance/Tontines », priorité Prêts) — crée un
   * `Application` réel puis une `WorkflowRequest` (WD-001, moteur générique
   * déjà existant mais jusqu'ici jamais utilisé pour créer une nouvelle
   * demande de crédit à l'exécution, cf. audit TANZEN). Valide la règle
   * AVANT toute écriture (montant dans les bornes, `maxActiveLoans`, compte/
   * membre du tenant) — aucune mutation si la validation échoue.
   *
   * DÉCISION D'ARCHITECTURE (documentée, cf. docs/FINANCE_TONTINES_IMPLEMENTATION.md) :
   * le pré-décaissement (brouillon → soumis → en revue → approuvé/rejeté)
   * reste porté par `Application.stage`, déjà un objet réel et testé — le
   * `Loan` proprement dit (principal/intérêts/échéancier) n'est créé qu'au
   * décaissement (`disburseLoan`), jamais avant, cohérent avec le moteur de
   * position financière existant (`memberLoanSummary` filtre déjà sur
   * `disbursementDate`, jamais sur un état "demandé").
   */
  /**
   * NOTE D'IMPLÉMENTATION — pas de `mockRequest()` ici (même choix que
   * `tontineTurnsService.requestBeneficiaryPermutation`) : cette fonction
   * orchestre déjà plusieurs appels eux-mêmes enveloppés par `mockRequest`
   * (`workflowService.createRequest`, `financeService.createTransaction`) —
   * l'envelopper une seconde fois ajouterait un délai redondant et, plus
   * important, casserait la coercion `undefined → null` de `mockRequest`
   * (qui n'agit que sur une factory SYNCHRONE : une factory `async`
   * retourne une Promise, jamais littéralement `undefined`, au moment où
   * `mockRequest` teste `result === undefined`). Retourne donc directement
   * `undefined` en cas de refus, comme son homologue Tontines.
   */
  submitLoanApplication: async (tenantId: string, input: SubmitLoanApplicationInput, requestedBy: string, requestedByUserId?: string): Promise<{ application: Application; request: WorkflowRequest } | undefined> => {
      const member = getTenantScoped(members, (item) => item.id === input.memberId, tenantId);
      if (!member) return undefined;
      const account = getTenantScoped(accounts, (item) => item.id === input.accountId, tenantId);
      if (!account) return undefined;
      const rule = resolveActiveLoanRule(tenantId, input.accountId);
      if (!rule) return undefined;
      if (!Number.isFinite(input.requestedAmount) || input.requestedAmount < rule.minAmount || input.requestedAmount > rule.maxAmount) return undefined;
      if (countActiveLoans(tenantId, input.memberId) >= rule.maxActiveLoans) return undefined;
      const definition = workflowDefinitions.find((item) => item.id === 'WD-001' && item.active);
      if (!definition) return undefined;

      const applicant = `${member.firstName} ${member.lastName}`;
      const application: Application = {
        id: uniqueId('AP'),
        tenantId,
        applicant,
        memberId: input.memberId,
        accountId: input.accountId,
        requestedAmount: input.requestedAmount,
        purpose: input.purpose,
        submittedDate: today(),
        reviewDate: null,
        approvalDate: null,
        stage: 'stageSubmitted',
        creditScore: input.creditScore ?? 0,
        monthlyIncome: input.monthlyIncome ?? 0,
        existingLoans: countActiveLoans(tenantId, input.memberId),
        tenantName: account.tenantName,
        pendingGuarantors: input.guarantors,
      };
      applications.push(application);
      const request = await workflowService.createRequest(tenantId, 'WD-001', {
        entityId: application.id,
        entityLabel: `Demande ${application.id} · ${applicant}`,
        requestedBy,
        requestedByUserId,
        amount: input.requestedAmount,
      });
      if (!request) {
        applications.splice(applications.indexOf(application), 1);
        return undefined;
      }
      return { application, request };
  },

  /**
   * Effet de bord propre au domaine Credit, appelé après `workflowService.submitAction`
   * (même point d'intégration générique que `settingsService.applyFiscalYearReopenDecision`
   * et `tontineTurnsService.applyBeneficiaryPermutationDecision`, cf. `operations-module.tsx`,
   * `WorkflowDetail`) — no-op pour tout autre domaine/entité. Fait progresser `Application.stage`
   * en miroir de l'avancement des 2 étapes de WD-001 : étape 1 approuvée → `stageReview` ;
   * étape 2 (décision finale) approuvée → `stageApproved` (prêt à décaisser, jamais décaissé
   * automatiquement ici — le décaissement reste une action explicite séparée, `disburseLoan`) ;
   * rejet à n'importe quelle étape → `stageRejected` (terminal). Idempotent : ne régresse
   * jamais un stage déjà avancé (`stageDisbursed` notamment).
   */
  applyLoanApplicationDecision: (tenantId: string, request: WorkflowRequest) => {
    if (request.domain !== 'credit' || request.entityType !== 'application') return;
    const application = getTenantScoped(applications, (item) => item.id === request.entityId, tenantId);
    if (!application || application.stage === 'stageDisbursed') return;
    if (request.status === 'inProgress' && application.stage === 'stageSubmitted') {
      application.stage = 'stageReview';
      application.reviewDate = today();
    } else if (request.status === 'approved' && application.stage !== 'stageApproved') {
      application.stage = 'stageApproved';
      application.approvalDate = today();
    } else if (request.status === 'rejected' && application.stage !== 'stageRejected') {
      application.stage = 'stageRejected';
    }
  },

  /**
   * DÉCAISSEMENT (mandat « Finalisation Finance/Tontines », §12) — seule
   * fonction qui crée réellement un `Loan`, à partir d'un `Application` déjà
   * au stade `stageApproved` (refuse sinon : pas de décaissement d'une
   * demande non approuvée, ni un second décaissement de la même demande).
   * Revalide la politique de la caisse et les garants au moment du
   * décaissement (défense en profondeur : la politique a pu changer entre
   * la soumission et l'approbation). ATOMIQUE : la `Transaction` est créée
   * en premier ; si elle échoue (classification/réunion invalide), AUCUN
   * `Loan`/`Guarantor` n'est créé et `Application.stage` n'avance pas.
   */
  /** Pas de `mockRequest()` — voir la note sur `submitLoanApplication`. */
  disburseLoan: async (tenantId: string, applicationId: string): Promise<{ application: Application; loan: Loan } | undefined> => {
      const application = getTenantScoped(applications, (item) => item.id === applicationId, tenantId);
      if (!application || application.stage !== 'stageApproved' || !application.memberId || !application.accountId) return undefined;
      const rule = resolveActiveLoanRule(tenantId, application.accountId);
      if (!rule) return undefined;
      if (rule.requiresGuarantor) {
        const valid = (application.pendingGuarantors ?? []).filter((item) => item.guarantorName.trim() && item.guaranteedAmount > 0);
        if (valid.length < rule.minGuarantors) return undefined;
      }
      const account = getTenantScoped(accounts, (item) => item.id === application.accountId, tenantId);
      const member = getTenantScoped(members, (item) => item.id === application.memberId as string, tenantId);
      if (!account || !member) return undefined;

      const transactionInput: TransactionInput = {
        accountNumber: account.accountNumber,
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`,
        category: 'PRET',
        type: 'debit',
        amount: application.requestedAmount,
        description: `Décaissement prêt — demande ${application.id}`,
      };
      const transaction = await financeService.createTransaction(tenantId, transactionInput);
      if (!transaction) return undefined;

      const terms = computeLoanTerms(application.requestedAmount, rule, transaction.date);
      const loan: Loan = {
        id: `L-${String(loans.length + 1).padStart(3, '0')}`,
        tenantId,
        memberId: member.id,
        borrower: `${member.firstName} ${member.lastName}`,
        principal: application.requestedAmount,
        interestRate: rule.interestRate,
        interestAmount: terms.interestAmount,
        totalRepayable: terms.totalRepayable,
        paidAmount: 0,
        outstanding: terms.totalRepayable,
        disbursementDate: transaction.date,
        maturityDate: terms.maturityDate,
        monthlyPayment: terms.monthlyPayment,
        nextPaymentDate: terms.nextPaymentDate,
        lastPaymentDate: transaction.date,
        status: 'active',
        progress: 0,
        applicationId: application.id,
        tenantName: account.tenantName,
        penalties: [],
        documents: [],
        activities: [{ id: uniqueId('LA'), type: 'Disbursement', description: `Décaissement de ${application.requestedAmount} FCFA`, date: transaction.date }],
      };
      loans.push(loan);
      transaction.loanId = loan.id;
      pushGuarantors(tenantId, loan, application.pendingGuarantors, account.tenantName);
      application.stage = 'stageDisbursed';
      recordCreditAudit({ tenantId, action: 'credit.loan.disbursed', resourceId: loan.id, resourceLabel: `${loan.borrower} · ${loan.id}`, context: { applicationId: application.id, principal: loan.principal } });
      return { application, loan };
  },

  /**
   * Chemin « enregistrement direct » (mandat §8/§12) utilisé par le
   * formulaire générique de transaction (`finance-module.tsx`, catégorie
   * `PRET`) — préserve EXACTEMENT le comportement déjà testé (une seule
   * transaction visible immédiatement, avec garants/approbation consignés
   * dans sa description) tout en créant, en plus, un véritable `Application`
   * (déjà `stageDisbursed`, l'attestation d'approbation ayant déjà eu lieu
   * hors-ligne selon la case cochée par l'utilisateur) + `Loan` + `Guarantor`
   * réels, avec intérêts calculés (`computeLoanTerms`) — jamais plus « une
   * simple transaction ». ATOMIQUE : toute la validation (règle, montant,
   * garants, approbation) a lieu AVANT `financeService.createTransaction` ;
   * si elle échoue, aucune transaction n'est créée non plus.
   */
  /** Pas de `mockRequest()` — voir la note sur `submitLoanApplication`. */
  createLoanTransaction: async (tenantId: string, input: CreateLoanTransactionInput): Promise<{ application: Application; loan: Loan; transaction: NonNullable<Awaited<ReturnType<typeof financeService.createTransaction>>> } | undefined> => {
      const member = getTenantScoped(members, (item) => item.id === input.memberId, tenantId);
      if (!member) return undefined;
      const account = getTenantScoped(accounts, (item) => item.id === input.accountId, tenantId);
      if (!account) return undefined;
      const rule = resolveActiveLoanRule(tenantId, input.accountId);
      if (!rule) return undefined;
      if (!Number.isFinite(input.principal) || input.principal < rule.minAmount || input.principal > rule.maxAmount) return undefined;
      if (countActiveLoans(tenantId, input.memberId) >= rule.maxActiveLoans) return undefined;
      if (rule.requiresGuarantor) {
        const valid = input.guarantors.filter((item) => item.guarantorName.trim() && item.guaranteedAmount > 0);
        if (valid.length < rule.minGuarantors) return undefined;
      }
      if (rule.requiresApproval && !input.approved) return undefined;

      const transaction = await financeService.createTransaction(tenantId, input.transactionInput);
      if (!transaction) return undefined;

      const terms = computeLoanTerms(input.principal, rule, transaction.date);
      const application: Application = {
        id: uniqueId('AP'),
        tenantId,
        applicant: `${member.firstName} ${member.lastName}`,
        memberId: input.memberId,
        accountId: input.accountId,
        requestedAmount: input.principal,
        purpose: input.purpose ?? '',
        submittedDate: transaction.date,
        reviewDate: transaction.date,
        approvalDate: input.approved ? transaction.date : null,
        stage: 'stageDisbursed',
        creditScore: 0,
        monthlyIncome: 0,
        existingLoans: countActiveLoans(tenantId, input.memberId),
        tenantName: account.tenantName,
        pendingGuarantors: input.guarantors,
      };
      applications.push(application);

      const loan: Loan = {
        id: `L-${String(loans.length + 1).padStart(3, '0')}`,
        tenantId,
        memberId: member.id,
        borrower: `${member.firstName} ${member.lastName}`,
        principal: input.principal,
        interestRate: rule.interestRate,
        interestAmount: terms.interestAmount,
        totalRepayable: terms.totalRepayable,
        paidAmount: 0,
        outstanding: terms.totalRepayable,
        disbursementDate: transaction.date,
        maturityDate: terms.maturityDate,
        monthlyPayment: terms.monthlyPayment,
        nextPaymentDate: terms.nextPaymentDate,
        lastPaymentDate: transaction.date,
        status: 'active',
        progress: 0,
        applicationId: application.id,
        tenantName: account.tenantName,
        penalties: [],
        documents: [],
        activities: [{ id: uniqueId('LA'), type: 'Disbursement', description: `Décaissement de ${input.principal} FCFA`, date: transaction.date }],
      };
      loans.push(loan);
      transaction.loanId = loan.id;
      pushGuarantors(tenantId, loan, input.guarantors, account.tenantName);
      recordCreditAudit({ tenantId, action: 'credit.loan.disbursed', resourceId: loan.id, resourceLabel: `${loan.borrower} · ${loan.id}`, context: { applicationId: application.id, principal: loan.principal } });
      return { application, loan, transaction };
  },

  listLoans: (tenantId: string) => mockRequest(() => loans.filter((loan) => loan.tenantId === tenantId)),
  getLoan: (tenantId: string, loanId: string) => mockRequest(() => getTenantScoped(loans, (loan) => loan.id === loanId, tenantId)),
  listLoansByMember: (memberId: string) => mockRequest(() => loans.filter((loan) => loan.memberId === memberId)),
  /** Nombre de prêts actifs d'un membre — même définition que la règle `maxActiveLoans` appliquée côté service (voir `countActiveLoans`), pour que l'UI affiche exactement le chiffre qui conditionne le blocage réel. */
  countActiveLoans: (tenantId: string, memberId: string) => mockRequest(() => countActiveLoans(tenantId, memberId)),
  createLoan: (input: LoanInput) =>
    mockRequest(() => {
      const loan: Loan = { id: `L-${String(loans.length + 1).padStart(3, '0')}`, outstanding: input.principal, progress: 0, paidAmount: 0, status: 'active', disbursementDate: today(), lastPaymentDate: today(), penalties: [], documents: [], activities: [], ...input };
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

  /**
   * Même exigence que listRepaymentsByLoan : le Loan parent doit être tenant-scoped avant toute écriture.
   * Refuse désormais aussi (§14 du mandat) un remboursement négatif/nul ou qui dépasserait le solde dû —
   * voir `applyRepaymentToLoan`, seule fonction qui applique réellement la mutation.
   */
  createRepayment: (tenantId: string, input: RepaymentInput) =>
    mockRequest(() => {
      const loan = getTenantScoped(loans, (item) => item.id === input.loanId, tenantId);
      if (!loan) return undefined;
      const applied = applyRepaymentToLoan(loan, input);
      if (!applied) return undefined;
      const repayment: Repayment = { id: `RP-${String(repayments.length + 1).padStart(3, '0')}`, tenantId, borrower: loan.borrower, amount: input.principalPart + input.interestPart, ...input };
      repayments.push(repayment);
      return repayment;
    }),

  /**
   * Chemin atomique « transaction + remboursement » (mandat §14/§15) utilisé
   * par le formulaire générique de transaction (catégorie `REMBOURSEMENT`) —
   * valide le prêt/le montant AVANT de créer la `Transaction` : un
   * remboursement refusé (dépassement, montant négatif, prêt introuvable) ne
   * laisse aucune transaction orpheline, contrairement au chemin historique
   * (`financeService.createTransaction` puis `creditService.createRepayment`
   * en deux appels séparés, cf. audit TANZEN).
   */
  /** Pas de `mockRequest()` — voir la note sur `submitLoanApplication`. */
  createRepaymentTransaction: async (tenantId: string, input: CreateRepaymentTransactionInput): Promise<{ loan: Loan; repayment: Repayment; transaction: NonNullable<Awaited<ReturnType<typeof financeService.createTransaction>>> } | undefined> => {
      const loan = getTenantScoped(loans, (item) => item.id === input.loanId, tenantId);
      if (!loan) return undefined;
      const amount = input.principalPart + input.interestPart;
      if (input.principalPart < 0 || input.interestPart < 0 || amount <= 0) return undefined;
      if (loan.paidAmount + amount > loan.totalRepayable) return undefined;

      const transaction = await financeService.createTransaction(tenantId, input.transactionInput);
      if (!transaction) return undefined;

      applyRepaymentToLoan(loan, { principalPart: input.principalPart, interestPart: input.interestPart, paymentDate: input.paymentDate, status: 'completed' });
      const repayment: Repayment = { id: `RP-${String(repayments.length + 1).padStart(3, '0')}`, tenantId, borrower: loan.borrower, amount, loanId: input.loanId, paymentDate: input.paymentDate, principalPart: input.principalPart, interestPart: input.interestPart, status: 'completed' };
      repayments.push(repayment);
      transaction.loanId = loan.id;
      return { loan, repayment, transaction };
  },

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
