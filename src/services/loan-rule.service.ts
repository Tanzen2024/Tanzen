import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { loanRules, tenantCreditRule, type LoanRule, type LoanRuleApprovalLevel, type LoanRuleGuaranteeType, type LoanRuleInterestPeriod, type LoanRuleLoanMode } from '@/mocks/finance/loan-rules';
import { workflowRequests, type WorkflowRequest } from '@/mocks/operations/workflow-requests';
import { computeChangeSet } from '@/lib/workflow/change-set';
import { permissionsOfUser, workflowService } from './workflow.service';
import { auditService } from './audit.service';
import { notificationService } from './notification.service';

/**
 * RÈGLE DE CRÉDIT UNIQUE PAR TENANT (décision définitive du 2026-09-26) : plus aucune caisse
 * dans la règle, plus de liste, plus d'activation / désactivation / suppression — la règle du
 * tenant se crée une fois puis se MODIFIE (suspendre les prêts = décocher `allowLoans`).
 *
 * MODIFICATION = DOUBLE APPROBATION (mandat « Finalisation du bilan », 2026-09-28) : une règle
 * EXISTANTE ne se modifie plus jamais directement. `requestLoanRuleUpdate` crée une demande
 * (workflow WD-009, ChangeSet avant/après, version de la règle) ; `decideLoanRuleUpdate` enregistre
 * chaque approbation / rejet ; la règle n'est modifiée (et sa version incrémentée) qu'après la
 * DEUXIÈME approbation. Les prêts déjà accordés n'en sont jamais affectés : leurs paramètres
 * financiers sont historisés à l'octroi (`Loan.loanMode` / `interestRate` / `interestPeriod`).
 */
export type LoanRuleInput = {
  name: string;
  allowLoans: boolean;
  loanMode: LoanRuleLoanMode;
  minAmount: number;
  maxAmount: number;
  interestRate: number;
  interestPeriod: LoanRuleInterestPeriod;
  durationMonths: number;
  maxActiveLoans: number;
  maxLoanExposure: number | null;
  requiresGuarantor: boolean;
  minGuarantors: number;
  maxGuarantors: number;
  guaranteeTypeRequired: LoanRuleGuaranteeType;
  guaranteeRatio: number;
  allowSelfGuarantee: boolean;
  requiresApproval: boolean;
  approvalLevel: LoanRuleApprovalLevel | null;
};
export type LoanRuleUpdateInput = Partial<LoanRuleInput>;

/** Définition du workflow de double approbation (voir `workflow-definitions.ts`). */
export const CREDIT_RULE_UPDATE_WORKFLOW = 'WD-009';

export type LoanRuleUpdateRequestResult =
  | { ok: true; request: WorkflowRequest }
  | { ok: false; reason: 'notFound' | 'forbidden' | 'invalid' | 'noChange' | 'workflowUnavailable' }
  | { ok: false; reason: 'pending'; existingRequestId: string };

export type LoanRuleDecisionResult =
  | { ok: true; request: WorkflowRequest; activated: boolean }
  | { ok: false; reason: 'notFound' | 'notPending' | 'forbidden' | 'selfApproval' | 'sameApprover' };

/**
 * Contraintes CHECK nommées de la fiche canonique #14 — refuse toute écriture qui les violerait.
 * Garant requis = false → aucune contrainte de garantie : les paramètres de garantie conservés (masqués
 * dans le formulaire) ne sont pas contrôlés, même incohérents.
 */
function violatesCanonicalConstraints(input: Pick<LoanRuleInput, 'minAmount' | 'maxAmount' | 'interestRate' | 'durationMonths' | 'maxLoanExposure' | 'requiresGuarantor' | 'minGuarantors' | 'maxGuarantors' | 'guaranteeRatio'>): boolean {
  if (input.maxAmount < input.minAmount) return true; // ck_amount_valid
  if (input.interestRate < 0) return true; // ck_interest_valid
  if (input.durationMonths <= 0) return true; // ck_duration_valid
  if (input.maxLoanExposure !== null && input.maxLoanExposure < 0) return true; // ck_exposure_valid
  if (input.requiresGuarantor) {
    if (input.maxGuarantors < input.minGuarantors) return true; // ck_guarantor_count
    if (input.guaranteeRatio < 0 || input.guaranteeRatio > 100) return true; // ck_guarantee_ratio
  }
  return false;
}

/** Seuls les champs de `LoanRuleInput` peuvent être modifiés (jamais id, tenant, statut, suppression ni version). */
const EDITABLE_FIELDS: (keyof LoanRuleInput)[] = ['name', 'allowLoans', 'loanMode', 'minAmount', 'maxAmount', 'interestRate', 'interestPeriod', 'durationMonths', 'maxActiveLoans', 'maxLoanExposure', 'requiresGuarantor', 'minGuarantors', 'maxGuarantors', 'guaranteeTypeRequired', 'guaranteeRatio', 'allowSelfGuarantee', 'requiresApproval', 'approvalLevel'];
function editablePatch(patch: LoanRuleUpdateInput): LoanRuleUpdateInput {
  return Object.fromEntries(Object.entries(patch).filter(([field, value]) => EDITABLE_FIELDS.includes(field as keyof LoanRuleInput) && value !== undefined)) as LoanRuleUpdateInput;
}

const livingRule = (tenantId: string, ruleId: string) => {
  const rule = getTenantScoped(loanRules, (item) => item.id === ruleId, tenantId);
  return rule && rule.deletedAt === null ? rule : undefined;
};
const isCreditRuleRequest = (request: WorkflowRequest) => request.domain === 'credit' && request.entityType === 'creditRule';
const valuesOf = (request: WorkflowRequest, side: 'before' | 'after') => Object.fromEntries((request.changeSet ?? []).map((item) => [item.field, item[side] === null || item[side] === undefined ? '' : String(item[side])]));

/**
 * ACTIVATION — seul point du projet qui MODIFIE une règle de crédit existante, appelé uniquement
 * par `decideLoanRuleUpdate` après la 2e approbation. Verrou optimiste : si la règle a changé depuis
 * la demande, rien n'est appliqué (`versionConflict`), jamais d'écrasement silencieux.
 */
function activate(tenantId: string, request: WorkflowRequest): boolean {
  const rule = livingRule(tenantId, request.entityId);
  if (!rule || !request.changeSet || request.changeSet.length === 0) return false;
  if (request.entitySnapshotVersion !== undefined && rule.version !== request.entitySnapshotVersion) {
    request.versionConflict = true;
    auditService.record({ tenantId, actorId: '', actorName: 'system', module: 'credit', action: 'loanRules.updateConflict', resourceType: 'loanRule', resourceId: rule.id, resourceLabel: rule.name, sensitive: true, context: { requestId: request.id, snapshotVersion: request.entitySnapshotVersion, currentVersion: rule.version } });
    return false;
  }
  const patch = Object.fromEntries(request.changeSet.map((item) => [item.field, item.after])) as LoanRuleUpdateInput;
  if (violatesCanonicalConstraints({ ...rule, ...patch })) return false;
  Object.assign(rule, patch);
  rule.version += 1;
  request.appliedAt = new Date().toISOString();
  auditService.record({ tenantId, actorId: '', actorName: 'system', module: 'credit', action: 'loanRules.updateActivated', resourceType: 'loanRule', resourceId: rule.id, resourceLabel: rule.name, sensitive: true, before: valuesOf(request, 'before'), after: valuesOf(request, 'after'), context: { requestId: request.id, version: rule.version, activatedAt: request.appliedAt } });
  return true;
}

export const loanRuleService = {
  /** LA règle du tenant (jamais une règle supprimée logiquement), `null` si aucune n'est encore configurée. */
  getCreditRule: (tenantId: string) => mockRequest((): LoanRule | null => tenantCreditRule(tenantId) ?? null),

  /**
   * Création de LA règle du tenant — UNICITÉ garantie ici, quel que soit l'appelant :
   * refus (undefined) si le tenant possède déjà une règle vivante. Une création n'est pas une
   * modification : aucune règle active n'est remplacée, pas de double approbation.
   */
  createLoanRule: (tenantId: string, input: LoanRuleInput) =>
    mockRequest(() => {
      if (tenantCreditRule(tenantId)) return undefined;
      if (!input.name.trim() || violatesCanonicalConstraints(input)) return undefined;
      const rule: LoanRule = { id: `LR-${String(loanRules.length + 1).padStart(3, '0')}`, tenantId, status: 'ACTIVE', deletedAt: null, version: 1, ...input };
      loanRules.push(rule);
      return rule;
    }),

  /**
   * DEMANDE DE MODIFICATION (étape 1 du workflow) — la règle active reste INCHANGÉE. Refus :
   * permission `loanRules.manage` absente, règle inconnue / d'un autre tenant, valeurs violant les
   * contraintes, aucun changement, ou demande précédente encore en cours sur la même règle (jamais
   * écrasée : elle doit d'abord être approuvée, rejetée ou annulée).
   */
  requestLoanRuleUpdate: async (tenantId: string, ruleId: string, patch: LoanRuleUpdateInput, requesterId: string, requesterName: string, justification?: string): Promise<LoanRuleUpdateRequestResult> => {
    if (!permissionsOfUser(tenantId, requesterId).includes('loanRules.manage')) return { ok: false, reason: 'forbidden' };
    const rule = livingRule(tenantId, ruleId);
    if (!rule) return { ok: false, reason: 'notFound' };
    const cleaned = editablePatch(patch);
    const merged = { ...rule, ...cleaned };
    if (!merged.name.trim() || violatesCanonicalConstraints(merged)) return { ok: false, reason: 'invalid' };
    const pending = await workflowService.hasPendingApproval(tenantId, 'creditRule', rule.id);
    if (pending) return { ok: false, reason: 'pending', existingRequestId: pending.id };
    const changeSet = computeChangeSet(rule as unknown as Record<string, unknown>, cleaned as Record<string, unknown>);
    if (changeSet.length === 0) return { ok: false, reason: 'noChange' };
    const request = await workflowService.createRequest(tenantId, CREDIT_RULE_UPDATE_WORKFLOW, {
      entityId: rule.id, entityLabel: rule.name, requestedBy: requesterName, requestedByUserId: requesterId, justification, changeSet, entitySnapshotVersion: rule.version,
    });
    if (!request) return { ok: false, reason: 'workflowUnavailable' };
    auditService.record({ tenantId, actorId: requesterId, actorName: requesterName, module: 'credit', action: 'loanRules.updateRequested', resourceType: 'loanRule', resourceId: rule.id, resourceLabel: rule.name, sensitive: true, before: valuesOf(request, 'before'), after: valuesOf(request, 'after'), context: { requestId: request.id } });
    return { ok: true, request };
  },

  /**
   * DÉCISION (1re ou 2e approbation, ou rejet) — seul point d'entrée pour ce domaine (jamais
   * `workflowService.submitAction` directement). Contrôles AVANT toute écriture : demande en cours,
   * permission de l'étape (`loanRules.approve`, résolue côté service), demandeur ≠ approbateur, et
   * 2e approbateur ≠ 1er. La règle n'est modifiée qu'après la 2e approbation ; un rejet, à n'importe
   * quelle étape, clôt la demande sans aucun effet. Chaque décision est auditée (acteur, date, étape,
   * valeurs avant / proposées).
   */
  decideLoanRuleUpdate: async (tenantId: string, requestId: string, action: 'approve' | 'reject', actorId: string, actorName: string, comment?: string): Promise<LoanRuleDecisionResult> => {
    const request = getTenantScoped(workflowRequests, (item) => item.id === requestId, tenantId);
    if (!request || !isCreditRuleRequest(request)) return { ok: false, reason: 'notFound' };
    if (request.status !== 'pending' && request.status !== 'inProgress') return { ok: false, reason: 'notPending' };
    const step = request.steps.find((item) => item.order === request.currentStepOrder);
    if (!step || step.status !== 'pending') return { ok: false, reason: 'notPending' };
    if (!permissionsOfUser(tenantId, actorId).includes(step.approverPermission)) return { ok: false, reason: 'forbidden' };
    if (workflowService.isSelfApprovalBlocked(request, actorId)) return { ok: false, reason: 'selfApproval' };
    if (request.steps.some((item) => item.order < step.order && item.actedBy === actorId)) return { ok: false, reason: 'sameApprover' };
    const stepOrder = step.order;
    const result = await workflowService.submitAction(tenantId, requestId, action, actorName, comment, actorId);
    if (!result) return { ok: false, reason: 'notPending' };
    const rule = livingRule(tenantId, result.entityId);
    auditService.record({
      tenantId, actorId, actorName, module: 'credit', action: action === 'approve' ? 'loanRules.updateApproved' : 'loanRules.updateRejected',
      resourceType: 'loanRule', resourceId: result.entityId, resourceLabel: rule?.name ?? result.entityLabel, sensitive: true,
      before: valuesOf(result, 'before'), after: valuesOf(result, 'after'), context: { requestId: result.id, step: stepOrder, comment: comment ?? '' },
    });
    const activated = result.status === 'approved' ? activate(tenantId, result) : false;
    if (result.requestedByUserId && (result.status === 'approved' || result.status === 'rejected')) {
      notificationService.notify({
        tenantId, userId: result.requestedByUserId, type: 'workflow', source: 'credit', link: `/operations/workflows/${result.id}`,
        title: activated ? 'Règle de crédit modifiée' : 'Modification de la règle de crédit refusée',
        message: activated ? `Votre modification de la règle « ${result.entityLabel} » a reçu ses deux approbations et est active.` : `Votre demande de modification de la règle « ${result.entityLabel} » n’a pas été appliquée.${comment ? ` Motif : ${comment}` : ''}`,
      });
    }
    return { ok: true, request: result, activated };
  },

  /** Historique complet des modifications de la règle (jamais écrasé), la plus récente d'abord. */
  listLoanRuleChanges: (tenantId: string, ruleId: string) =>
    mockRequest(() => workflowRequests.filter((request) => request.tenantId === tenantId && isCreditRuleRequest(request) && request.entityId === ruleId).reverse()),

  /** Demande en cours (1re ou 2e approbation attendue) sur la règle, s'il y en a une. */
  pendingLoanRuleChange: (tenantId: string, ruleId: string) => workflowService.hasPendingApproval(tenantId, 'creditRule', ruleId),
};
