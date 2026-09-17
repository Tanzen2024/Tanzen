import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { currentUser } from '@/mocks/rbac.mocks';
import {
  tontines, tontineAdhesions, tontineOccurrences, occurrenceBeneficiaries,
  tontineBeneficiaryPlans, tontineRemainders, tontineContributions, isAdhesionActiveAt,
  type TontineOccurrence, type OccurrenceBeneficiary, type TontineBeneficiaryPlan, type TontineRemainder, type TontineContribution,
} from '@/mocks/tontines/tontines';
import { auditEvents, type AuditEvent } from '@/mocks/audit/audit-events';
import { workflowRequests, type WorkflowRequest } from '@/mocks/operations/workflow-requests';
import { workflowService } from './workflow.service';
import { insertTransaction } from './finance.service';
import { accounts, type AccountRecord } from '@/mocks/finance/accounts';
import { members } from '@/mocks/organization/members';

export type PlanPermutationInput = { planAId: string; planBId: string; requestedBy: string; requestedByUserId?: string; justification?: string };

/** Identifiant technique reliant une `WorkflowRequest` de permutation aux deux `TontineBeneficiaryPlan` échangés. */
type PlanPermutation = { id: string; tenantId: string; workflowRequestId: string; planAId: string; planBId: string; appliedAt: string | null };
const tontinePlanPermutations: PlanPermutation[] = [];

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveTontineAccount(tenantId: string, tontineId: string): AccountRecord | undefined {
  const tontine = tontines.find((item) => item.tenantId === tenantId && item.id === tontineId);
  if (!tontine?.accountId) return undefined;
  return accounts.find((account) => account.id === tontine.accountId && account.tenantId === tenantId);
}

/** RÈGLE FINANCIÈRE CRITIQUE — distincte de `resolveTontineAccount` : seul le montant d'ACHAT transite par cette caisse, jamais les cotisations/réceptions « nettes ». `undefined` si `withPurchase` est faux (donc jamais de `purchaseAccountId`, cf. `tontines.service.ts`). */
function resolveTontinePurchaseAccount(tenantId: string, tontineId: string): AccountRecord | undefined {
  const tontine = tontines.find((item) => item.tenantId === tenantId && item.id === tontineId);
  if (!tontine?.purchaseAccountId) return undefined;
  return accounts.find((account) => account.id === tontine.purchaseAccountId && account.tenantId === tenantId);
}

/** Best-effort, non bloquant : si `insertTransaction` refuse, l'opération Tontine reste la source de vérité de son propre état — jamais annulée a posteriori. Jamais appelé pour un montant nul/négatif. */
function postTontineTransaction(tenantId: string, params: { account: AccountRecord; memberId: string; memberName: string; amount: number | undefined; direction: 'credit' | 'debit'; category: 'EPARGNE' | 'AUTRES'; subcategory?: 'DISTRIBUTION' | 'AUTRE'; description: string }): void {
  if (!params.amount || params.amount <= 0) return;
  insertTransaction(tenantId, {
    accountNumber: params.account.accountNumber,
    memberId: params.memberId,
    memberName: params.memberName,
    category: params.category,
    subcategory: params.subcategory ?? null,
    type: params.direction,
    amount: params.amount,
    description: params.description,
  });
}

function writeAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp' | 'actorId' | 'actorName' | 'module' | 'eventType' | 'status'>): void {
  auditEvents.push({
    id: uniqueId('AUD-TON'), timestamp: new Date().toISOString(), actorId: currentUser.id, actorName: currentUser.name,
    module: 'tontines', eventType: 'sensitiveAction', status: 'success', ...event,
  });
}

export const tontineOperationsService = {
  // --- Plans de bénéficiaires (SANS-ACHAT uniquement, planification à l'avance) — rattachés DIRECTEMENT à la Tontine ---

  listPlans: (tenantId: string, tontineId: string) =>
    mockRequest(() => tontineBeneficiaryPlans.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId).sort((a, b) => a.position - b.position)),

  /** Ajoute la prochaine position disponible (dernière + 1) — jamais de position dupliquée/choisie librement. Refuse si la Tontine est « Avec achat » (pas de Plan pour ce mode) ou si l'adhésion n'appartient pas à cette Tontine. */
  addPlanEntry: (tenantId: string, tontineId: string, adhesionId: string) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine || tontine.withPurchase) return undefined;
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
      if (!adhesion || adhesion.tontineId !== tontineId) return undefined;
      const existing = tontineBeneficiaryPlans.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId);
      if (existing.some((item) => item.adhesionId === adhesionId)) return undefined;
      const nextPosition = existing.reduce((max, item) => Math.max(max, item.position), 0) + 1;
      const plan: TontineBeneficiaryPlan = { id: uniqueId('PLN'), tenantId, tontineId, position: nextPosition, adhesionId, consumedByOccurrenceId: null };
      tontineBeneficiaryPlans.push(plan);
      return plan;
    }),

  /** Retrait d'une position non encore consommée — une position déjà consommée par un Tour est immuable (retrait refusé), cohérent avec l'immuabilité du passé. */
  removePlanEntry: (tenantId: string, planId: string) =>
    mockRequest(() => {
      const plan = getTenantScoped(tontineBeneficiaryPlans, (item) => item.id === planId, tenantId);
      if (!plan || plan.consumedByOccurrenceId) return undefined;
      const index = tontineBeneficiaryPlans.findIndex((item) => item.id === planId);
      tontineBeneficiaryPlans.splice(index, 1);
      return { removed: true } as const;
    }),

  /**
   * Demande de permutation entre deux positions FUTURES, via le moteur
   * Workflow générique — ne modifie RIEN avant approbation effective.
   * Refuse si l'une des deux positions est déjà consommée par un Tour
   * (immuabilité du passé), si les deux positions n'appartiennent pas à la
   * MÊME Tontine, ou si une permutation `pending`/`inProgress` référence
   * déjà l'une des deux.
   */
  requestPlanPermutation: async (tenantId: string, input: PlanPermutationInput): Promise<WorkflowRequest | undefined> => {
    if (input.planAId === input.planBId) return undefined;
    const planA = getTenantScoped(tontineBeneficiaryPlans, (item) => item.id === input.planAId, tenantId);
    const planB = getTenantScoped(tontineBeneficiaryPlans, (item) => item.id === input.planBId, tenantId);
    if (!planA || !planB || planA.tontineId !== planB.tontineId) return undefined;
    if (planA.consumedByOccurrenceId || planB.consumedByOccurrenceId) return undefined;
    const conflicting = tontinePlanPermutations.some((permutation) => {
      if (permutation.tenantId !== tenantId) return false;
      const involvesA = permutation.planAId === input.planAId || permutation.planBId === input.planAId;
      const involvesB = permutation.planAId === input.planBId || permutation.planBId === input.planBId;
      if (!involvesA && !involvesB) return false;
      const existingRequest = workflowRequests.find((item) => item.id === permutation.workflowRequestId);
      return Boolean(existingRequest && (existingRequest.status === 'pending' || existingRequest.status === 'inProgress'));
    });
    if (conflicting) return undefined;
    const adhesionA = getTenantScoped(tontineAdhesions, (item) => item.id === planA.adhesionId, tenantId);
    const adhesionB = getTenantScoped(tontineAdhesions, (item) => item.id === planB.adhesionId, tenantId);
    const entityLabel = `Position ${planA.position} · ${adhesionA?.memberName ?? planA.adhesionId} ↔ Position ${planB.position} · ${adhesionB?.memberName ?? planB.adhesionId}`;
    const permutationId = uniqueId('BPM');
    const definition = await workflowService.getWorkflowFor('beneficiaryPermutation', 'update');
    if (!definition) return undefined;
    const request = await workflowService.createRequest(tenantId, definition.id, { entityId: permutationId, entityLabel, requestedBy: input.requestedBy, requestedByUserId: input.requestedByUserId, justification: input.justification });
    if (!request) return undefined;
    tontinePlanPermutations.push({ id: permutationId, tenantId, workflowRequestId: request.id, planAId: input.planAId, planBId: input.planBId, appliedAt: null });
    return request;
  },

  /**
   * Effet de bord appelé APRÈS `workflowService.submitAction`, même point
   * d'intégration générique que les autres domaines (`operations-module.tsx`).
   * Auto-approbation VOLONTAIREMENT autorisée. Échange atomique des deux
   * `adhesionId` ; no-op si l'une des deux positions a été consommée entre
   * la demande et la décision (immuabilité prioritaire sur l'application
   * d'une permutation obsolète).
   */
  applyPlanPermutationDecision: (tenantId: string, request: WorkflowRequest) => {
    if (request.domain !== 'tontines' || request.entityType !== 'beneficiaryPermutation' || request.status !== 'approved') return;
    const permutation = tontinePlanPermutations.find((item) => item.tenantId === tenantId && item.workflowRequestId === request.id);
    if (!permutation || permutation.appliedAt) return;
    const planA = getTenantScoped(tontineBeneficiaryPlans, (item) => item.id === permutation.planAId, tenantId);
    const planB = getTenantScoped(tontineBeneficiaryPlans, (item) => item.id === permutation.planBId, tenantId);
    if (!planA || !planB || planA.consumedByOccurrenceId || planB.consumedByOccurrenceId) return;
    const adhesionIdA = planA.adhesionId; const adhesionIdB = planB.adhesionId;
    if (adhesionIdA === adhesionIdB) return;
    planA.adhesionId = adhesionIdB;
    planB.adhesionId = adhesionIdA;
    permutation.appliedAt = new Date().toISOString();
    const memberNameA = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionIdA, tenantId)?.memberName ?? adhesionIdA;
    const memberNameB = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionIdB, tenantId)?.memberName ?? adhesionIdB;
    writeAuditEvent({
      tenantId, action: 'tontines.beneficiaryPermutationApplied', resourceType: 'tontineBeneficiaryPlan', resourceId: permutation.id, resourceLabel: request.entityLabel, sensitive: true, correlationId: permutation.id,
      before: { [`position${planA.position}`]: memberNameA, [`position${planB.position}`]: memberNameB },
      after: { [`position${planA.position}`]: memberNameB, [`position${planB.position}`]: memberNameA },
      context: { adhesionId: adhesionIdA, otherAdhesionId: adhesionIdB, planAId: planA.id, planBId: planB.id },
    });
  },

  getPlanPermutationPreview: (tenantId: string, workflowRequestId: string) =>
    mockRequest(() => {
      const permutation = tontinePlanPermutations.find((item) => item.tenantId === tenantId && item.workflowRequestId === workflowRequestId);
      if (!permutation) return undefined;
      const side = (planId: string) => {
        const plan = getTenantScoped(tontineBeneficiaryPlans, (item) => item.id === planId, tenantId);
        if (!plan) return undefined;
        const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === plan.adhesionId, tenantId);
        const member = adhesion ? getTenantScoped(members, (item) => item.id === adhesion.memberId, tenantId) : undefined;
        return { planId: plan.id, position: plan.position, memberName: adhesion?.memberName ?? plan.adhesionId, photoUrl: member?.photoUrl };
      };
      const a = side(permutation.planAId); const b = side(permutation.planBId);
      if (!a || !b) return undefined;
      return { a, b };
    }),

  // --- Tours (progressifs — « Ajouter un tour », jamais de génération en masse) — rattachés DIRECTEMENT à la Tontine ---

  listOccurrences: (tenantId: string, tontineId: string) =>
    mockRequest(() => tontineOccurrences.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId).sort((a, b) => a.occurrenceNumber - b.occurrenceNumber)),
  getOccurrence: (tenantId: string, occurrenceId: string) => mockRequest(() => getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId)),

  /**
   * « Ajouter un tour » — un acte manuel, unitaire (aucune génération en
   * masse). SANS-ACHAT (`!tontine.withPurchase`, y compris GOODS) : consomme
   * automatiquement la PROCHAINE position de Plan non consommée de la
   * Tontine et crée l'`OccurrenceBeneficiary` correspondant. AVEC-ACHAT
   * (MONEY + `withPurchase`) : ne crée aucun bénéficiaire — l'utilisateur
   * les choisit ensuite via `addOccurrenceBeneficiary`.
   */
  createOccurrence: (tenantId: string, tontineId: string, date: string) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine) return undefined;
      const existing = tontineOccurrences.filter((item) => item.tontineId === tontineId);
      const nextNumber = existing.reduce((max, item) => Math.max(max, item.occurrenceNumber), 0) + 1;
      const occurrence: TontineOccurrence = { id: uniqueId('OCC'), tenantId, tontineId, occurrenceNumber: nextNumber, date, status: 'PLANNED', createdAt: new Date().toISOString().slice(0, 10) };
      tontineOccurrences.push(occurrence);

      if (!tontine.withPurchase) {
        const nextPlan = tontineBeneficiaryPlans
          .filter((item) => item.tenantId === tenantId && item.tontineId === tontineId && !item.consumedByOccurrenceId)
          .sort((a, b) => a.position - b.position)[0];
        if (nextPlan) {
          const amountDue = tontine.valueType === 'MONEY' ? (tontine.contributionAmount ?? 0) : (tontine.quantity ?? 0);
          const beneficiary: OccurrenceBeneficiary = { id: uniqueId('TB'), tenantId, occurrenceId: occurrence.id, adhesionId: nextPlan.adhesionId, amountDue, amountPaid: 0, paidAt: null };
          occurrenceBeneficiaries.push(beneficiary);
          nextPlan.consumedByOccurrenceId = occurrence.id;
        }
      }
      return occurrence;
    }),

  listBeneficiaries: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => occurrenceBeneficiaries.filter((item) => item.tenantId === tenantId && item.occurrenceId === occurrenceId)),

  /**
   * Vue « Distributions » consolidée, transverse à tous les Tours de la
   * Tontine (item hiérarchique du mandat, au même niveau que « Tours » et
   * « Reliquats ») — dérivée à 100% des `OccurrenceBeneficiary` déjà
   * existants, aucune nouvelle entité de stockage : une distribution EST une
   * ligne bénéficiaire, jamais dupliquée sous un second modèle.
   */
  listDistributions: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const occurrenceIds = new Set(tontineOccurrences.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId).map((item) => item.id));
      return occurrenceBeneficiaries
        .filter((item) => item.tenantId === tenantId && occurrenceIds.has(item.occurrenceId))
        .map((item) => ({ ...item, occurrenceNumber: tontineOccurrences.find((occ) => occ.id === item.occurrenceId)?.occurrenceNumber ?? 0 }))
        .sort((a, b) => b.occurrenceNumber - a.occurrenceNumber);
    }),

  /**
   * AVEC-ACHAT uniquement — sélection du/des bénéficiaire(s) au moment de la
   * création du tour. Plusieurs bénéficiaires par Tour possibles, chacun sa
   * propre ligne (jamais une chaîne concaténée). Refuse si la Tontine est
   * sans-achat (le Plan est alors l'unique voie), si le Tour est déjà
   * RÉALISÉ, si l'adhésion n'appartient pas à cette Tontine ou n'est pas
   * active à la date du Tour, ou si l'adhésion est déjà bénéficiaire de ce
   * Tour.
   */
  addOccurrenceBeneficiary: (tenantId: string, occurrenceId: string, adhesionId: string, amountDue: number) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence || occurrence.status === 'REALIZED') return undefined;
      const tontine = getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId);
      if (!tontine || !tontine.withPurchase) return undefined;
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
      if (!adhesion || adhesion.tontineId !== tontine.id || !isAdhesionActiveAt(adhesion, occurrence.date)) return undefined;
      if (occurrenceBeneficiaries.some((item) => item.occurrenceId === occurrenceId && item.adhesionId === adhesionId)) return undefined;
      const beneficiary: OccurrenceBeneficiary = { id: uniqueId('TB'), tenantId, occurrenceId, adhesionId, amountDue, amountPaid: 0, paidAt: null };
      occurrenceBeneficiaries.push(beneficiary);
      return beneficiary;
    }),

  /**
   * Enregistre un versement de contribution — journal-lié : poste
   * immédiatement la Transaction Finance correspondante, best-effort comme
   * partout ailleurs dans ce module (n'annule jamais l'enregistrement
   * métier si `insertTransaction` refuse).
   */
  recordContribution: (tenantId: string, occurrenceId: string, adhesionId: string, amount: number) =>
    mockRequest(() => {
      if (!(amount > 0)) return undefined;
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence) return undefined;
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
      if (!adhesion || adhesion.tontineId !== occurrence.tontineId || !isAdhesionActiveAt(adhesion, occurrence.date)) return undefined;
      const contribution: TontineContribution = { id: uniqueId('CTB'), tenantId, occurrenceId, adhesionId, amount, date: new Date().toISOString().slice(0, 10), createdBy: currentUser.name };
      tontineContributions.push(contribution);
      const tontine = getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId);
      const account = resolveTontineAccount(tenantId, occurrence.tontineId);
      if (account) {
        postTontineTransaction(tenantId, { account, memberId: adhesion.memberId, memberName: adhesion.memberName, amount, direction: 'credit', category: 'EPARGNE', description: `Cotisation tontine ${tontine?.name ?? ''} — tour ${occurrence.occurrenceNumber}`.trim() });
      }
      return contribution;
    }),

  listContributions: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => tontineContributions.filter((item) => item.tenantId === tenantId && item.occurrenceId === occurrenceId)),

  /**
   * Réception d'un bénéficiaire — additive (jamais un remplacement). Refuse
   * si le Tour est déjà RÉALISÉ (immuabilité). `purchaseAmount`
   * (avec-achat uniquement) poste EXCLUSIVEMENT vers la caisse « Achat
   * tontine », jamais mélangé au montant net posté vers la caisse générale.
   */
  recordReception: (tenantId: string, beneficiaryId: string, amount: number, purchaseAmount?: number) =>
    mockRequest(() => {
      if (!(amount > 0)) return undefined;
      const beneficiary = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
      if (!beneficiary) return undefined;
      const occurrence = tontineOccurrences.find((item) => item.id === beneficiary.occurrenceId);
      if (!occurrence || occurrence.status === 'REALIZED') return undefined;
      beneficiary.amountPaid += amount;
      beneficiary.paidAt = new Date().toISOString().slice(0, 10);
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === beneficiary.adhesionId, tenantId);
      const tontine = getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId);
      if (adhesion && tontine?.valueType === 'MONEY') {
        const account = resolveTontineAccount(tenantId, occurrence.tontineId);
        if (account) postTontineTransaction(tenantId, { account, memberId: adhesion.memberId, memberName: adhesion.memberName, amount, direction: 'debit', category: 'AUTRES', subcategory: 'DISTRIBUTION', description: `Réception tontine ${tontine.name} — tour ${occurrence.occurrenceNumber}`.trim() });
        const purchaseAccount = resolveTontinePurchaseAccount(tenantId, occurrence.tontineId);
        if (purchaseAccount) postTontineTransaction(tenantId, { account: purchaseAccount, memberId: adhesion.memberId, memberName: adhesion.memberName, amount: purchaseAmount, direction: 'credit', category: 'AUTRES', subcategory: 'AUTRE', description: `Achat tontine ${tontine.name} — tour ${occurrence.occurrenceNumber}`.trim() });
      }
      return beneficiary;
    }),

  /**
   * Clôture (PLANNED → REALIZED) — exige au moins un bénéficiaire, tous
   * intégralement payés (`amountPaid >= amountDue`). Calcule et enregistre
   * automatiquement le reliquat : si le total réellement collecté
   * (Contributions de ce tour) dépasse le total effectivement distribué aux
   * bénéficiaires, l'écart devient un `TontineRemainder` `OPEN` — jamais
   * silencieusement perdu.
   */
  closeOccurrence: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence || occurrence.status === 'REALIZED') return undefined;
      const beneficiaries = occurrenceBeneficiaries.filter((item) => item.occurrenceId === occurrence.id);
      if (beneficiaries.length === 0 || !beneficiaries.every((item) => item.amountPaid >= item.amountDue)) return undefined;
      occurrence.status = 'REALIZED';
      const tontine = getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId);
      if (tontine) {
        const collected = tontineContributions.filter((item) => item.tenantId === tenantId && item.occurrenceId === occurrence.id).reduce((sum, item) => sum + item.amount, 0);
        const distributed = beneficiaries.reduce((sum, item) => sum + item.amountPaid, 0);
        const shortfall = collected - distributed;
        if (shortfall > 0) {
          const remainder: TontineRemainder = { id: uniqueId('RLQ'), tenantId, tontineId: tontine.id, occurrenceId: occurrence.id, frequency: tontine.frequency, amount: shortfall, date: new Date().toISOString().slice(0, 10), origin: 'UNDERDISTRIBUTED_POOL', status: 'OPEN', createdBy: currentUser.name };
          tontineRemainders.push(remainder);
          writeAuditEvent({ tenantId, action: 'tontines.remainderCreated', resourceType: 'tontineRemainder', resourceId: remainder.id, resourceLabel: `${tontine.name} — tour ${occurrence.occurrenceNumber}`, sensitive: false, correlationId: remainder.id, context: { amount: shortfall } });
        }
      }
      return occurrence;
    }),

  // --- Reliquat ---

  listRemainders: (tenantId: string, tontineId: string) =>
    mockRequest(() => tontineRemainders.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId).sort((a, b) => b.date.localeCompare(a.date))),

  /** Consommation explicite (affecté manuellement, ex. reporté sur le tour suivant) — jamais automatique. */
  consumeRemainder: (tenantId: string, remainderId: string) =>
    mockRequest(() => {
      const remainder = getTenantScoped(tontineRemainders, (item) => item.id === remainderId, tenantId);
      if (!remainder || remainder.status !== 'OPEN') return undefined;
      remainder.status = 'CONSUMED';
      writeAuditEvent({ tenantId, action: 'tontines.remainderConsumed', resourceType: 'tontineRemainder', resourceId: remainder.id, resourceLabel: remainder.id, sensitive: false, correlationId: remainder.id });
      return remainder;
    }),

  /** Abandon explicite et motivé — jamais silencieux. */
  writeOffRemainder: (tenantId: string, remainderId: string, reason: string) =>
    mockRequest(() => {
      const remainder = getTenantScoped(tontineRemainders, (item) => item.id === remainderId, tenantId);
      if (!remainder || remainder.status !== 'OPEN' || !reason.trim()) return undefined;
      remainder.status = 'WRITTEN_OFF';
      writeAuditEvent({ tenantId, action: 'tontines.remainderWrittenOff', resourceType: 'tontineRemainder', resourceId: remainder.id, resourceLabel: remainder.id, sensitive: false, correlationId: remainder.id, context: { reason } });
      return remainder;
    }),

  // --- Vues transverses (toutes tontines confondues) ---

  listAllAdhesions: (tenantId: string) => mockRequest(() => tontineAdhesions.filter((item) => item.tenantId === tenantId)),
  listAllOccurrences: (tenantId: string) => mockRequest(() => tontineOccurrences.filter((item) => item.tenantId === tenantId).sort((a, b) => a.date.localeCompare(b.date))),
  listAllContributions: (tenantId: string) => mockRequest(() => tontineContributions.filter((item) => item.tenantId === tenantId)),
};
