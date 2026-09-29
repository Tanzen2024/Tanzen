import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { applications, type Application, type ApplicationStage, type PendingGuarantor } from '@/mocks/finance/applications';
import { loans, type Loan } from '@/mocks/finance/loans';
import { repayments, type Repayment, type RepaymentStatus } from '@/mocks/finance/repayments';
import { guarantors, type Guarantor } from '@/mocks/finance/guarantors';
import { tenantCreditRule, type LoanRule } from '@/mocks/finance/loan-rules';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { members } from '@/mocks/organization/members';
import { auditEvents, type AuditEvent } from '@/mocks/audit/audit-events';
import { currentUser } from '@/mocks/rbac.mocks';
import type { WorkflowRequest } from '@/mocks/operations/workflow-requests';
import { workflowService, permissionsOfUser } from './workflow.service';
import { financeService, insertTransaction, cashboxAvailableBalance, resolveSystemCashbox, type TransactionInput } from './finance.service';
import { loanFundingAllocations, type LoanFundingAllocation } from '@/mocks/finance/loan-funding-allocations';
import { transactions, type Transaction } from '@/mocks/finance/transactions';
import { isLoanDisbursement, isLoanRepayment } from '@/mocks/finance/transaction-classification';
import { fiscalSessions, type FiscalSession } from '@/mocks/settings/fiscal-sessions';
import { computeLoanTerms, loanPolicyViolations, splitRepaymentProRata, planLoanFunding, splitByAllocations, loanApprovalSteps, loanDebtAt, type FundingAllocationInput } from '@/lib/finance';
import { workflowRequests } from '@/mocks/operations/workflow-requests';

export type ApplicationInput = Omit<Application, 'id' | 'stage' | 'reviewDate' | 'approvalDate' | 'submittedDate'>;
export type LoanInput = Omit<Loan, 'id' | 'outstanding' | 'progress' | 'paidAmount' | 'status' | 'disbursementDate' | 'lastPaymentDate' | 'penalties' | 'documents' | 'activities'>;
export type RepaymentInput = { loanId: string; paymentDate: string; principalPart: number; interestPart: number; status: RepaymentStatus };
export type GuarantorInput = Pick<Guarantor, 'loanId' | 'guarantorName' | 'guaranteedAmount' | 'relation'>;

/** Aucune caisse : la caisse de décaissement prioritaire est TOUJOURS Épargne (`SAVINGS`), résolue par le service. */
export type SubmitLoanApplicationInput = {
  memberId: string;
  requestedAmount: number;
  purpose: string;
  creditScore?: number;
  monthlyIncome?: number;
  guarantors?: PendingGuarantor[];
  /** Financement multi-caisses prévu à la saisie (caisses complémentaires), réutilisé au décaissement. */
  complementaryFunding?: FundingAllocationInput[];
  /** Séance de la saisie, reportée sur la transaction de décaissement. */
  sessionId?: string;
  /** Commentaire de la saisie, repris dans la description du décaissement. */
  description?: string;
};

/**
 * Un PRÊT n'appartient à aucune caisse (mandat « Séparation Caisses / Crédit ») : seules ses transactions
 * de décaissement en portent une. L'appelant ne choisit aucune caisse (2026-09-27) : Épargne (`SAVINGS`)
 * finance toujours en premier, les compléments couvrent le reliquat. La caisse de
 * `transactionInput.cashboxNumber` est ignorée — chaque part est écrite sur sa propre caisse.
 */
export type CreateLoanTransactionInput = {
  memberId: string;
  principal: number;
  purpose?: string;
  guarantors: PendingGuarantor[];
  approved: boolean;
  approvedBy?: string;
  /** Déjà entièrement construit côté appelant (AUTRES / PRET, description, réunion...) — voir `financeService.createTransaction`. */
  transactionInput: TransactionInput;
  /**
   * FINANCEMENT COMPLÉMENTAIRE (mandat du 2026-09-26) : caisses ACTIVES (n'importe lesquelles) choisies
   * pour couvrir le reliquat quand Épargne ne suffit pas. Épargne finance toujours en premier,
   * automatiquement (`planLoanFunding`) — jamais listée ici.
   */
  complementaryFunding?: FundingAllocationInput[];
};

/**
 * Un REMBOURSEMENT n'appartient à aucune caisse : seule la transaction d'ENCAISSEMENT
 * (`transactionInput.cashboxNumber`) l'est. Fournir `amount` seul : le métier Crédit en calcule
 * la répartition capital / intérêts (`splitRepaymentProRata`). `principalPart`/`interestPart`
 * explicites restent acceptés (compatibilité des appels existants) et priment alors.
 */
export type CreateRepaymentTransactionInput = {
  loanId: string;
  paymentDate: string;
  amount?: number;
  principalPart?: number;
  interestPart?: number;
  transactionInput: TransactionInput;
};

/** `Date.now()` seul peut collisionner entre deux créations survenant dans la même milliseconde (même précaution que `tontine-operations.service.ts`, `uniqueId`). */
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
function resolveActiveLoanRule(tenantId: string): LoanRule | undefined {
  // Règle de crédit UNIQUE du tenant (décision 2026-09-26) — jamais déduite de la caisse de décaissement.
  const rule = tenantCreditRule(tenantId);
  return rule && rule.status === 'ACTIVE' && rule.allowLoans ? rule : undefined;
}

/**
 * Nombre de prêts ACTIFS d'un membre pour ce tenant (mandat `maxActiveLoans`) —
 * un prêt `repaid`/`defaulted` ne compte plus, un prêt tout juste décaissé
 * (`status: 'active'`) compte. Exposé pour que l'UI affiche exactement le même
 * nombre que celui réellement appliqué par la règle côté service (avant ce
 * mandat, l'UI calculait son propre `activeLoanCount` sans jamais bloquer la
 * soumission avec — cf. audit TANZEN, section Finance).
 */
/** Paramètres financiers de la règle EN VIGUEUR, copiés sur le prêt à l'octroi — jamais relus ensuite (`Loan.loanMode`). */
function historisedTerms(rule: LoanRule): Pick<Loan, 'loanMode' | 'interestRate' | 'interestPeriod'> {
  return { loanMode: rule.loanMode, interestRate: rule.interestRate, interestPeriod: rule.interestPeriod };
}

/**
 * DETTE COURANTE d'un prêt à une date — RÈGLES MÉTIER DE RÉFÉRENCE (2026-09-28) : capital + intérêts
 * générés selon le type historisé du prêt − remboursements réalisés (`loanDebtAt`, même calcul que le
 * bilan). Remplace l'ancien encours contractuel figé (`totalRepayable − paidAmount`).
 */
function currentDebt(loan: Loan, date: string = today()): number {
  return loanDebtAt(loan, repayments.filter((repayment) => repayment.loanId === loan.id && repayment.tenantId === loan.tenantId), date);
}

/** Prêt tel qu'exposé aux écrans : `outstanding` = dette courante à `date` (du jour par défaut), jamais l'encours contractuel stocké. */
function withCurrentDebt(loan: Loan, date: string = today()): Loan {
  return { ...loan, outstanding: currentDebt(loan, date) };
}

function countActiveLoans(tenantId: string, memberId: string): number {
  return loans.filter((loan) => loan.tenantId === tenantId && loan.memberId === memberId && loan.status === 'active').length;
}

/** Encours d'un membre (Σ `outstanding` de ses prêts ACTIFS) — base de l'exposition `maxLoanExposure`, même périmètre que `countActiveLoans`. */
function activeOutstanding(tenantId: string, memberId: string): number {
  return loans.filter((loan) => loan.tenantId === tenantId && loan.memberId === memberId && loan.status === 'active').reduce((sum, loan) => sum + Math.max(0, currentDebt(loan)), 0);
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

/** `actorId`/`actorName` : l'acteur réel d'une décision (défaut : utilisateur connecté) ; `before`/`after` : statuts avant/après l'action. */
function recordCreditAudit(params: { tenantId: string; action: string; resourceId: string; resourceLabel: string; context?: Record<string, string | number>; actorId?: string; actorName?: string; before?: Record<string, string | number>; after?: Record<string, string | number> }) {
  const event: AuditEvent = {
    id: `AUD-CRD-${Date.now()}-${auditEvents.length}`,
    tenantId: params.tenantId,
    timestamp: new Date().toISOString(),
    actorId: params.actorId ?? currentUser.id,
    actorName: params.actorName ?? currentUser.name,
    module: 'credit',
    action: params.action,
    eventType: 'sensitiveAction',
    resourceType: 'loan',
    resourceId: params.resourceId,
    resourceLabel: params.resourceLabel,
    status: 'success',
    sensitive: true,
    correlationId: params.resourceId,
    ...(params.before ? { before: params.before } : {}),
    ...(params.after ? { after: params.after } : {}),
    ...(params.context ? { context: params.context } : {}),
  };
  auditEvents.push(event);
}

/**
 * Mutation partagée par `createRepayment` (chemin historique) et
 * `createRepaymentTransaction` (chemin atomique) — seule fonction qui recalcule `paidAmount`/
 * `outstanding`/`progress`/`status` d'un `Loan`. RÈGLES DE RÉFÉRENCE (2026-09-28) : un remboursement
 * ne crée jamais d'intérêt ; il réduit la DETTE COURANTE à sa date (`currentDebt`) ; un montant
 * négatif, nul ou SUPÉRIEUR à cette dette est refusé (aucune mutation). À appeler AVANT d'enregistrer
 * le `Repayment` (la dette avant remboursement ne doit pas l'inclure).
 */
function applyRepaymentToLoan(loan: Loan, input: Pick<RepaymentInput, 'principalPart' | 'interestPart' | 'paymentDate' | 'status'>): boolean {
  if (input.principalPart < 0 || input.interestPart < 0) return false;
  const amount = input.principalPart + input.interestPart;
  if (input.status === 'completed') {
    if (amount <= 0) return false;
    const debtBefore = currentDebt(loan, input.paymentDate);
    if (amount > debtBefore) return false;
    loan.paidAmount += amount;
    loan.outstanding = debtBefore - amount;
    loan.progress = Math.min(100, Math.round((loan.paidAmount / (loan.paidAmount + loan.outstanding)) * 100));
    loan.lastPaymentDate = input.paymentDate;
    // Transition de statut réelle à l'extinction de la dette (mandat §14 « Loan status ») —
    // jamais appliquée avant ce mandat, `status` restait `active` même à `outstanding === 0`.
    if (loan.outstanding <= 0) loan.status = 'repaid';
  }
  return true;
}

/** Transaction de DÉCAISSEMENT d'un prêt (AUTRES / PRET, jamais un encaissement de remboursement qui porte aussi `loanId`). */
export function disbursementTransactionOf(loan: Pick<Loan, 'id' | 'tenantId'>): Transaction | undefined {
  return transactions.find((tx) => tx.tenantId === loan.tenantId && tx.loanId === loan.id && isLoanDisbursement(tx.category, tx.subcategory) && !tx.repaymentId);
}

/** Transaction d'ENCAISSEMENT d'un remboursement — relation déjà portée par `Transaction.repaymentId`. */
export function collectionTransactionOf(repayment: Pick<Repayment, 'id' | 'tenantId'>): Transaction | undefined {
  return transactions.find((tx) => tx.tenantId === repayment.tenantId && tx.repaymentId === repayment.id);
}

/** Séance d'une transaction (même tenant) — `undefined` sans séance. */
export function sessionOfTransaction(transaction: Transaction | undefined): FiscalSession | undefined {
  if (!transaction?.sessionId) return undefined;
  return fiscalSessions.find((session) => session.id === transaction.sessionId && session.tenantId === transaction.tenantId);
}

/** Disponible (solde `resolveCashbox`) de chaque caisse ACTIVE du tenant — base du plan de financement. */
function fundingAvailability(tenantId: string): Record<string, number> {
  const availability: Record<string, number> = {};
  for (const cashbox of cashboxes) {
    if (cashbox.tenantId !== tenantId || cashbox.status !== 'active') continue;
    availability[cashbox.id] = cashboxAvailableBalance(tenantId, cashbox.id) ?? 0;
  }
  return availability;
}

/** Caisse Épargne du tenant (code système `SAVINGS`, garantie par `resolveSystemCashbox`) — caisse prioritaire de tout prêt. */
function savingsCashbox(tenantId: string) {
  return resolveSystemCashbox(tenantId, 'SAVINGS');
}

/**
 * Plan de financement d'un prêt depuis la caisse prioritaire (Épargne) — `undefined` si le financement n'est
 * pas intégral et cohérent (reliquat non couvert, dépassement du capital ou d'un disponible…).
 */
function completeFundingPlan(tenantId: string, principal: number, currentCashboxId: string, complements: FundingAllocationInput[] | undefined) {
  const plan = planLoanFunding(principal, currentCashboxId, complements ?? [], fundingAvailability(tenantId));
  return plan.isComplete ? plan : undefined;
}

/**
 * Écrit une transaction par part (`base` avec la caisse et le montant de la part), TOUT OU RIEN :
 * au premier refus, les transactions déjà écrites par cet appel sont retirées.
 */
function insertPerCashbox(tenantId: string, base: TransactionInput, parts: FundingAllocationInput[]): { part: FundingAllocationInput; transaction: Transaction }[] | undefined {
  const written: { part: FundingAllocationInput; transaction: Transaction }[] = [];
  for (const part of parts) {
    const cashbox = getTenantScoped(cashboxes, (item) => item.id === part.cashboxId, tenantId);
    const transaction = cashbox ? insertTransaction(tenantId, { ...base, cashboxNumber: cashbox.cashboxNumber, amount: part.amount }) : undefined;
    if (!transaction) {
      for (const { transaction: done } of written) transactions.splice(transactions.indexOf(done), 1);
      return undefined;
    }
    written.push({ part, transaction });
  }
  return written;
}

/** Enregistre les allocations d'un prêt (une par transaction de décaissement) et rattache ces transactions au prêt. */
function recordFundingAllocations(tenantId: string, loan: Loan, written: { part: FundingAllocationInput; transaction: Transaction }[]): LoanFundingAllocation[] {
  return written.map(({ part, transaction }) => {
    transaction.loanId = loan.id;
    const allocation: LoanFundingAllocation = { id: uniqueId('LFA'), tenantId, loanId: loan.id, cashboxId: part.cashboxId, amount: part.amount, transactionId: transaction.id, createdAt: transaction.date };
    loanFundingAllocations.push(allocation);
    return allocation;
  });
}


export type LoanApplicationDecisionResult =
  | { ok: true; request: WorkflowRequest; application: Application }
  | { ok: false; reason: 'notFound' | 'notPending' | 'forbidden' | 'selfApproval' | 'sameApprover' };

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
   * `tontineOperationsService.requestPlanPermutation`) : cette fonction
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
      const cashbox = savingsCashbox(tenantId);
      const rule = resolveActiveLoanRule(tenantId);
      if (!rule) return undefined;
      if (!Number.isFinite(input.requestedAmount) || input.requestedAmount < rule.minAmount || input.requestedAmount > rule.maxAmount) return undefined;
      if (countActiveLoans(tenantId, input.memberId) >= rule.maxActiveLoans) return undefined;
      // Conditions normales de la règle (exposition, garanties…), l'approbation exceptée : c'est précisément l'objet du workflow.
      const violations = loanPolicyViolations(rule, {
        principal: input.requestedAmount,
        borrowerName: `${member.firstName} ${member.lastName}`,
        activeLoanCount: countActiveLoans(tenantId, input.memberId),
        activeOutstanding: activeOutstanding(tenantId, input.memberId),
        guarantors: (input.guarantors ?? []).map((item) => ({ name: item.guarantorName, amount: item.guaranteedAmount })),
        approved: true,
      });
      if (violations.length > 0) return undefined;
      // Financement prévu dès la saisie (revérifié au décaissement : les disponibles peuvent avoir changé entre-temps).
      if (input.complementaryFunding && !completeFundingPlan(tenantId, input.requestedAmount, cashbox.id, input.complementaryFunding)) return undefined;
      // Définition ACTIVE « demande de prêt » résolue par le moteur générique (entité + action), jamais par
      // un identifiant figé : une nouvelle version du workflow (Paramètres → Workflows) reste utilisée.
      const definition = await workflowService.getWorkflowFor('application', 'create');
      if (!definition) return undefined;

      const applicant = `${member.firstName} ${member.lastName}`;
      const application: Application = {
        id: uniqueId('AP'),
        tenantId,
        applicant,
        memberId: input.memberId,
        cashboxId: cashbox.id,
        requestedAmount: input.requestedAmount,
        purpose: input.purpose,
        submittedDate: today(),
        reviewDate: null,
        approvalDate: null,
        stage: 'stageSubmitted',
        creditScore: input.creditScore ?? 0,
        monthlyIncome: input.monthlyIncome ?? 0,
        existingLoans: countActiveLoans(tenantId, input.memberId),
        tenantName: cashbox.tenantName,
        pendingGuarantors: input.guarantors,
        ...(input.complementaryFunding && input.complementaryFunding.length > 0 ? { complementaryFunding: input.complementaryFunding } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.description ? { description: input.description } : {}),
      };
      applications.push(application);
      const request = await workflowService.createRequest(tenantId, definition.id, {
        entityId: application.id,
        entityLabel: `Prêt ${application.id} · ${applicant}`,
        requestedBy,
        requestedByUserId,
        amount: input.requestedAmount,
        // Nombre d'approbations de la définition active ; une seule étape → niveau d'approbation de la règle de crédit.
        steps: loanApprovalSteps(definition.steps, rule.approvalLevel),
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
   * et `tontineOperationsService.applyPlanPermutationDecision`, cf. `operations-module.tsx`,
   * `WorkflowDetail`) — no-op pour tout autre domaine/entité. Fait progresser `Application.stage`
   * en miroir de l'avancement des 2 étapes de WD-001 : étape 1 approuvée → `stageReview` ;
   * étape 2 (décision finale) approuvée → `stageApproved` (prêt à décaisser, jamais décaissé
   * automatiquement ici — le décaissement reste une action explicite séparée, `disburseLoan`) ;
   * rejet à n'importe quelle étape → `stageRejected` (terminal). Idempotent : ne régresse
   * jamais un stage déjà avancé (`stageDisbursed` notamment).
   */
  /**
   * DÉCISION sur une demande de prêt (mandat « Workflow d'approbation des prêts », 2026-09-27) —
   * contrôles faits ICI, jamais confiés à l'écran :
   *   - la demande existe, est une demande de prêt du tenant et est toujours en attente / en cours ;
   *   - l'acteur détient la permission de l'étape courante (niveau d'approbation de la règle) ;
   *   - l'acteur n'est pas le demandeur (auto-approbation interdite).
   * Puis le moteur générique enregistre l'acteur, la date, le commentaire et fait avancer le
   * workflow (`workflowService.submitAction`), et la demande de prêt suit (`applyLoanApplicationDecision`).
   */
  decideLoanApplication: async (tenantId: string, requestId: string, action: 'approve' | 'reject', actorId: string, actorName: string, comment?: string): Promise<LoanApplicationDecisionResult> => {
    const request = getTenantScoped(workflowRequests, (item) => item.id === requestId, tenantId);
    if (!request || request.domain !== 'credit' || request.entityType !== 'application') return { ok: false, reason: 'notFound' };
    if (request.status !== 'pending' && request.status !== 'inProgress') return { ok: false, reason: 'notPending' };
    const step = request.steps.find((item) => item.order === request.currentStepOrder);
    if (!step || step.status !== 'pending') return { ok: false, reason: 'notPending' };
    if (!permissionsOfUser(tenantId, actorId).includes(step.approverPermission)) return { ok: false, reason: 'forbidden' };
    if (workflowService.isSelfApprovalBlocked(request, actorId)) return { ok: false, reason: 'selfApproval' };
    // Plusieurs approbations : chacune par un approbateur différent.
    if (request.steps.some((item) => item.order < step.order && item.actedBy === actorId)) return { ok: false, reason: 'sameApprover' };
    // Traçabilité : statuts AVANT l'action (demande de workflow + demande de prêt), capturés avant toute mutation.
    const previousStatus = request.status;
    const previousStage = getTenantScoped(applications, (item) => item.id === request.entityId, tenantId)?.stage ?? '';
    const updated = await workflowService.submitAction(tenantId, requestId, action, actorName, comment, actorId);
    if (!updated) return { ok: false, reason: 'notFound' };
    creditService.applyLoanApplicationDecision(tenantId, updated);
    const application = getTenantScoped(applications, (item) => item.id === updated.entityId, tenantId);
    if (!application) return { ok: false, reason: 'notFound' };
    recordCreditAudit({
      tenantId, actorId, actorName,
      action: action === 'approve' ? 'credit.application.approved' : 'credit.application.rejected',
      resourceId: application.id, resourceLabel: `${application.applicant} · ${application.id}`,
      before: { status: previousStatus, stage: previousStage },
      after: { status: updated.status, stage: application.stage },
      context: { requestId, step: step.name, comment: comment ?? '' },
    });
    return { ok: true, request: updated, application };
  },

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
   * en premier ; si elle échoue (classification/séance invalide), AUCUN
   * `Loan`/`Guarantor` n'est créé et `Application.stage` n'avance pas.
   *
   * `sessionId` (optionnel, mandat « Gestion des séances », décision 3) : la
   * séance pendant laquelle le prêt est décaissé. Elle est portée par la SEULE
   * transaction de décaissement (`Transaction.sessionId`, jamais `Loan.sessionId`)
   * et validée par `financeService.createTransaction` — exactement les mêmes
   * contrôles que toute transaction (séance existante, du bon tenant, du bon exercice).
   */
  /** Pas de `mockRequest()` — voir la note sur `submitLoanApplication`. */
  disburseLoan: async (tenantId: string, applicationId: string, sessionId?: string, complementaryFunding?: FundingAllocationInput[]): Promise<{ application: Application; loan: Loan } | undefined> => {
      const application = getTenantScoped(applications, (item) => item.id === applicationId, tenantId);
      if (!application || application.stage !== 'stageApproved' || !application.memberId) return undefined;
      const rule = resolveActiveLoanRule(tenantId);
      if (!rule) return undefined;
      // Approbation requise ⇒ le WORKFLOW fait foi, pas le seul `stage` (modifiable hors workflow) :
      // aucune demande de workflow APPROUVÉE pour ce dossier → décaissement interdit.
      if (rule.requiresApproval && !workflowRequests.some((request) => request.tenantId === tenantId && request.domain === 'credit' && request.entityType === 'application' && request.entityId === application.id && request.status === 'approved')) return undefined;
      if (rule.requiresGuarantor) {
        const valid = (application.pendingGuarantors ?? []).filter((item) => item.guarantorName.trim() && item.guaranteedAmount > 0);
        if (valid.length < rule.minGuarantors) return undefined;
      }
      const cashbox = savingsCashbox(tenantId);
      const member = getTenantScoped(members, (item) => item.id === application.memberId as string, tenantId);
      if (!member) return undefined;

      const transactionInput: TransactionInput = {
        cashboxNumber: cashbox.cashboxNumber,
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`,
        category: 'AUTRES',
        subcategory: 'PRET',
        type: 'debit',
        amount: application.requestedAmount,
        description: application.description ? `${application.description} — décaissement prêt, demande ${application.id}` : `Décaissement prêt — demande ${application.id}`,
        ...((sessionId ?? application.sessionId) ? { sessionId: sessionId ?? application.sessionId } : {}),
      };
      // Financement multi-caisses : Épargne finance d'abord (disponible actuel), le reliquat par les caisses complémentaires (prévues à la saisie à défaut d'autres) ; jamais de prêt partiellement financé.
      const plan = completeFundingPlan(tenantId, application.requestedAmount, cashbox.id, complementaryFunding ?? application.complementaryFunding);
      if (!plan) return undefined;
      const written = insertPerCashbox(tenantId, transactionInput, plan.allocations);
      if (!written) return undefined;
      const transaction = written[0].transaction;

      const terms = computeLoanTerms(application.requestedAmount, rule, transaction.date);
      const loan: Loan = {
        id: `L-${String(loans.length + 1).padStart(3, '0')}`,
        tenantId,
        memberId: member.id,
        borrower: `${member.firstName} ${member.lastName}`,
        principal: application.requestedAmount,
        ...historisedTerms(rule),
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
        tenantName: cashbox.tenantName,
        penalties: [],
        documents: [],
        activities: [{ id: uniqueId('LA'), type: 'Disbursement', description: `Décaissement de ${application.requestedAmount} FCFA`, date: transaction.date }],
      };
      loans.push(loan);
      recordFundingAllocations(tenantId, loan, written);
      pushGuarantors(tenantId, loan, application.pendingGuarantors, cashbox.tenantName);
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
  createLoanTransaction: async (tenantId: string, input: CreateLoanTransactionInput): Promise<{ application: Application; loan: Loan; transaction: NonNullable<Awaited<ReturnType<typeof financeService.createTransaction>>>; transactions: Transaction[]; allocations: LoanFundingAllocation[] } | undefined> => {
      const member = getTenantScoped(members, (item) => item.id === input.memberId, tenantId);
      if (!member) return undefined;
      const cashbox = savingsCashbox(tenantId);
      // La transaction est le DÉCAISSEMENT : AUTRES / PRET, DÉBIT — jamais une autre classification.
      if (input.transactionInput.type !== 'debit' || !isLoanDisbursement(input.transactionInput.category, input.transactionInput.subcategory)) return undefined;
      const rule = resolveActiveLoanRule(tenantId);
      if (!rule) return undefined;
      // Approbation requise → le prêt passe OBLIGATOIREMENT par le workflow (`submitLoanApplication`), jamais par une attestation cochée.
      if (rule.requiresApproval) return undefined;
      // Toutes les conditions d'octroi de la règle (montant, prêts actifs, exposition, garants, ratio, auto-caution) — `loanPolicyViolations`, source unique partagée avec les formulaires.
      const violations = loanPolicyViolations(rule, {
        principal: input.principal,
        borrowerName: `${member.firstName} ${member.lastName}`,
        activeLoanCount: countActiveLoans(tenantId, input.memberId),
        activeOutstanding: activeOutstanding(tenantId, input.memberId),
        guarantors: input.guarantors.map((item) => ({ name: item.guarantorName, amount: item.guaranteedAmount })),
        approved: input.approved,
      });
      if (violations.length > 0) return undefined;

      // Financement multi-caisses : Épargne d'abord (2026-09-27), reliquat par les compléments choisis ; Σ allocations = capital, sinon refus.
      const plan = completeFundingPlan(tenantId, input.principal, cashbox.id, input.complementaryFunding);
      if (!plan) return undefined;
      const written = insertPerCashbox(tenantId, input.transactionInput, plan.allocations);
      if (!written) return undefined;
      const transaction = written[0].transaction;

      const terms = computeLoanTerms(input.principal, rule, transaction.date);
      const application: Application = {
        id: uniqueId('AP'),
        tenantId,
        applicant: `${member.firstName} ${member.lastName}`,
        memberId: input.memberId,
        cashboxId: cashbox.id,
        requestedAmount: input.principal,
        purpose: input.purpose ?? '',
        submittedDate: transaction.date,
        reviewDate: transaction.date,
        approvalDate: input.approved ? transaction.date : null,
        stage: 'stageDisbursed',
        creditScore: 0,
        monthlyIncome: 0,
        existingLoans: countActiveLoans(tenantId, input.memberId),
        tenantName: cashbox.tenantName,
        pendingGuarantors: input.guarantors,
      };
      applications.push(application);

      const loan: Loan = {
        id: `L-${String(loans.length + 1).padStart(3, '0')}`,
        tenantId,
        memberId: member.id,
        borrower: `${member.firstName} ${member.lastName}`,
        principal: input.principal,
        ...historisedTerms(rule),
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
        tenantName: cashbox.tenantName,
        penalties: [],
        documents: [],
        activities: [{ id: uniqueId('LA'), type: 'Disbursement', description: `Décaissement de ${input.principal} FCFA`, date: transaction.date }],
      };
      loans.push(loan);
      const allocations = recordFundingAllocations(tenantId, loan, written);
      pushGuarantors(tenantId, loan, input.guarantors, cashbox.tenantName);
      recordCreditAudit({ tenantId, action: 'credit.loan.disbursed', resourceId: loan.id, resourceLabel: `${loan.borrower} · ${loan.id}`, context: { applicationId: application.id, principal: loan.principal } });
      return { application, loan, transaction, transactions: written.map((item) => item.transaction), allocations };
  },

  /**
   * Séance d'un prêt / d'un remboursement — TOUJOURS lue via la transaction
   * (source de vérité unique `Transaction.sessionId`, décision 3) : le prêt via
   * sa transaction de décaissement (`loanId`, catégorie PRET), le remboursement
   * via sa transaction d'encaissement (`Transaction.repaymentId`, déjà posé par
   * `createRepaymentTransaction`). `null` si aucune séance n'est rattachée.
   */
  getLoanSession: (tenantId: string, loanId: string) =>
    mockRequest(() => {
      const loan = getTenantScoped(loans, (item) => item.id === loanId, tenantId);
      return loan ? sessionOfTransaction(disbursementTransactionOf(loan)) ?? null : null;
    }),
  getRepaymentSession: (tenantId: string, repaymentId: string) =>
    mockRequest(() => {
      const repayment = getTenantScoped(repayments, (item) => item.id === repaymentId, tenantId);
      return repayment ? sessionOfTransaction(collectionTransactionOf(repayment)) ?? null : null;
    }),

  /** Allocations de financement d'un prêt (vide pour un prêt antérieur au financement multi-caisses). */
  listLoanFundingAllocations: (tenantId: string, loanId: string) =>
    mockRequest(() => {
      const loan = getTenantScoped(loans, (item) => item.id === loanId, tenantId);
      return loan ? loanFundingAllocations.filter((allocation) => allocation.tenantId === tenantId && allocation.loanId === loan.id) : [];
    }),

  /** `outstanding` des prêts exposés = DETTE COURANTE du jour (règles de référence), jamais l'encours contractuel figé. */
  listLoans: (tenantId: string, asOfDate: string = today()) => mockRequest(() => loans.filter((loan) => loan.tenantId === tenantId).map((loan) => withCurrentDebt(loan, asOfDate))),
  getLoan: (tenantId: string, loanId: string) => mockRequest(() => { const loan = getTenantScoped(loans, (item) => item.id === loanId, tenantId); return loan ? withCurrentDebt(loan) : undefined; }),
  /** `asOfDate` : date de la dette exposée — un remboursement est plafonné à la dette À SA DATE DE PAIEMENT (date de séance). */
  listLoansByMember: (memberId: string, asOfDate: string = today()) => mockRequest(() => loans.filter((loan) => loan.memberId === memberId).map((loan) => withCurrentDebt(loan, asOfDate))),
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
  createRepaymentTransaction: async (tenantId: string, input: CreateRepaymentTransactionInput): Promise<{ loan: Loan; repayment: Repayment; transaction: NonNullable<Awaited<ReturnType<typeof financeService.createTransaction>>>; transactions: Transaction[] } | undefined> => {
      const loan = getTenantScoped(loans, (item) => item.id === input.loanId, tenantId);
      if (!loan) return undefined;
      // Répartition : explicite si fournie (compatibilité), sinon calculée par le métier Crédit au prorata du prêt.
      const split = input.principalPart !== undefined || input.interestPart !== undefined
        ? { principalPart: input.principalPart ?? 0, interestPart: input.interestPart ?? 0 }
        : splitRepaymentProRata(loan, input.amount ?? 0);
      const amount = split.principalPart + split.interestPart;
      if (split.principalPart < 0 || split.interestPart < 0 || amount <= 0) return undefined;
      // Remboursement plafonné à la DETTE COURANTE à sa date (règles de référence) : jamais au-delà.
      if (amount > currentDebt(loan, input.paymentDate)) return undefined;
      // L'ENCAISSEMENT est un crédit de la caisse, du montant exact du remboursement.
      if (input.transactionInput.type !== 'credit' || Number(input.transactionInput.amount) !== amount || !isLoanRepayment(input.transactionInput.category, input.transactionInput.subcategory)) return undefined;

      // Prêt financé par allocations : l'encaissement est PARTAGÉ entre ses caisses de financement au
      // prorata de leur part (décision du 2026-09-26) ; un prêt sans allocation (antérieur) garde
      // l'encaissement unique sur la caisse choisie.
      const funding = loanFundingAllocations.filter((allocation) => allocation.tenantId === tenantId && allocation.loanId === loan.id);
      const collectionInput = funding.length > 0 ? undefined : input.transactionInput;
      const written = collectionInput
        ? await financeService.createTransaction(tenantId, collectionInput).then((created) => (created ? [created] : undefined))
        : insertPerCashbox(tenantId, input.transactionInput, splitByAllocations(amount, funding))?.map((item) => item.transaction);
      if (!written || written.length === 0) return undefined;
      const transaction = written[0];

      applyRepaymentToLoan(loan, { principalPart: split.principalPart, interestPart: split.interestPart, paymentDate: input.paymentDate, status: 'completed' });
      const repayment: Repayment = { id: `RP-${String(repayments.length + 1).padStart(3, '0')}`, tenantId, borrower: loan.borrower, amount, loanId: input.loanId, paymentDate: input.paymentDate, principalPart: split.principalPart, interestPart: split.interestPart, status: 'completed' };
      repayments.push(repayment);
      // Traçabilité : encaissement → remboursement → prêt (le remboursement reste l'événement métier, la transaction son mouvement financier).
      for (const collected of written) {
        collected.loanId = loan.id;
        collected.repaymentId = repayment.id;
      }
      repayment.transactionId = transaction.id;
      return { loan, repayment, transaction, transactions: written };
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
      if (!loan || currentDebt(loan) !== 0) return undefined;
      loan.status = 'repaid';
      return loan;
    }),
};
