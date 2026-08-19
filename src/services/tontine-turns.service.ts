import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { currentUser } from '@/mocks/rbac.mocks';
import { tontineCycles } from '@/mocks/tontines/tontine-cycles';
import {
  tontineAdhesions, tontineOccurrences, tontineTurns, tontineTurnBeneficiaries, tontineContributions,
  computeReceivedTotal, computeBeneficiaryStatus,
  type TontineAdhesion, type TontineOccurrence, type TontineTurn, type TontineTurnBeneficiary, type TontineContribution, type ReceptionOperation, type PaymentOperation, type ValueType,
} from '@/mocks/tontines/tontine-occurrences';

export type ReceptionInput = { amount?: number; quantity?: number };
export type CorrectionInput = { operationId: string; amount?: number; quantity?: number; reason: string };
export type CancellationInput = { operationId: string; reason: string };
/** Champs limités à ceux déjà portés par `TontineAdhesion` (memberId, joinedAt) — D-TON-04-07 (forme technique) reste ouverte, aucun champ métier supplémentaire n'est inventé ici. */
export type AdhesionInput = { tontineId: string; memberId: string; memberName: string; joinedAt: string };
/** Champs limités à ceux déjà portés par `TontineContribution` — la valeur attendue générée devient une donnée historique dès la création (D-TON-04-29), `paidAmount`/`paidQuantity`/`paidAt` démarrent donc toujours à zéro/nul, statut `PENDING` (aucun flux de paiement n'est inventé à ce stade). */
export type ContributionInput = { adhesionId: string; tontineOccurrenceId: string; valueType: ValueType; expectedAmount?: number; expectedQuantity?: number; item?: string };
/** Champs volontairement minimaux (montant/quantité) — mode de paiement, référence et commentaire ne sont spécifiés par aucune source pour Contribution, non inventés ici. */
export type ContributionPaymentInput = { amount?: number; quantity?: number };
/** Champs strictement limités à ceux déjà portés par `TontineOccurrence` — aucune notion de fréquence/périodicité n'existe dans le modèle (confirmé absent, D-TON-04-11), donc non demandée ici : chaque occurrence est créée manuellement, une par une. */
export type OccurrenceInput = { tontineCycleId: string; occurrenceNumber: number; plannedDate: string; actualDate?: string | null };

/** Un Turn ne peut être clôturé normalement que si TOUS ses bénéficiaires sont RECEIVED (D-TON-06-09/-13, règle de clôture reprise dans les consolidations D-TON-04-19/-21 de cette session). */
function allBeneficiariesReceived(turnId: string): boolean {
  const beneficiaries = tontineTurnBeneficiaries.filter((item) => item.tontineTurnId === turnId);
  return beneficiaries.length > 0 && beneficiaries.every((item) => computeBeneficiaryStatus(item) === 'RECEIVED');
}

function appendOperation(beneficiary: TontineTurnBeneficiary, operation: ReceptionOperation) {
  beneficiary.operations.push(operation);
}

/** `Date.now()` seul peut collisionner entre deux créations survenant dans la même milliseconde (constaté en test) — un suffixe aléatoire garantit l'unicité sans dépendre du timing. */
function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const tontineTurnsService = {
  listAdhesionsByTontine: (tenantId: string, tontineId: string) =>
    mockRequest(() => tontineAdhesions.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId)),
  listAdhesionsByMember: (tenantId: string, memberId: string) =>
    mockRequest(() => tontineAdhesions.filter((item) => item.tenantId === tenantId && item.memberId === memberId)),
  getAdhesion: (tenantId: string, adhesionId: string) =>
    mockRequest(() => getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId)),
  /** Multi-adhésion illimitée par défaut (D-TON-04-08, confirmé) — aucune vérification d'unicité member/tontine n'est appliquée, volontairement. */
  createAdhesion: (tenantId: string, input: AdhesionInput) =>
    mockRequest(() => {
      const adhesion: TontineAdhesion = { id: uniqueId('ADH'), tenantId, status: 'active', ...input };
      tontineAdhesions.push(adhesion);
      return adhesion;
    }),
  listContributionsByAdhesion: (tenantId: string, adhesionId: string) =>
    mockRequest(() => tontineContributions.filter((item) => item.tenantId === tenantId && item.adhesionId === adhesionId)),
  listBeneficiariesByAdhesion: (tenantId: string, adhesionId: string) =>
    mockRequest(() =>
      tontineTurnBeneficiaries
        .filter((item) => item.tenantId === tenantId && item.adhesionId === adhesionId)
        .map((item) => ({ ...item, receivedTotal: computeReceivedTotal(item.operations), status: computeBeneficiaryStatus(item) })),
    ),

  listOccurrencesByCycle: (tenantId: string, cycleId: string) =>
    mockRequest(() => tontineOccurrences.filter((item) => item.tenantId === tenantId && item.tontineCycleId === cycleId).sort((a, b) => a.occurrenceNumber - b.occurrenceNumber)),
  /** Traverse Tontine → Cycle → Occurrence (D-TON-04-03/-05) pour peupler le sélecteur d'occurrence du formulaire de contribution, sans exposer directement les mocks au composant. */
  listOccurrencesByTontine: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const cycleIds = new Set(tontineCycles.filter((cycle) => cycle.tenantId === tenantId && cycle.tontineId === tontineId).map((cycle) => cycle.id));
      return tontineOccurrences.filter((item) => item.tenantId === tenantId && cycleIds.has(item.tontineCycleId)).sort((a, b) => a.occurrenceNumber - b.occurrenceNumber);
    }),
  getOccurrence: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId)),

  /** Une occurrence possède un seul Turn (D-TON-04-06, relation 1:1). */
  getTurnByOccurrence: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence) return undefined;
      return tontineTurns.find((item) => item.tontineOccurrenceId === occurrence.id);
    }),
  getTurn: (tenantId: string, turnId: string) =>
    mockRequest(() => getTenantScoped(tontineTurns, (item) => item.id === turnId, tenantId)),

  /** 1..N bénéficiaires par Turn (D-TON-04-19, confirmé) — jamais un champ unique. */
  listBeneficiariesByTurn: (tenantId: string, turnId: string) =>
    mockRequest(() => {
      const turn = getTenantScoped(tontineTurns, (item) => item.id === turnId, tenantId);
      if (!turn) return [];
      return tontineTurnBeneficiaries
        .filter((item) => item.tontineTurnId === turn.id)
        .map((item) => ({ ...item, receivedTotal: computeReceivedTotal(item.operations), status: computeBeneficiaryStatus(item) }));
    }),
  getBeneficiary: (tenantId: string, beneficiaryId: string) =>
    mockRequest(() => {
      const beneficiary = getTenantScoped(tontineTurnBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
      if (!beneficiary) return undefined;
      return { ...beneficiary, receivedTotal: computeReceivedTotal(beneficiary.operations), status: computeBeneficiaryStatus(beneficiary) };
    }),

  listContributionsByOccurrence: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => tontineContributions.filter((item) => item.tenantId === tenantId && item.tontineOccurrenceId === occurrenceId)),
  /** Traverse Adhesion → Contribution (D-TON-04-29 : la contribution référence l'adhésion, jamais directement Member) pour peupler la liste globale d'une tontine. */
  listContributionsByTontine: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const adhesionIds = new Set(tontineAdhesions.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId).map((item) => item.id));
      return tontineContributions.filter((item) => item.tenantId === tenantId && adhesionIds.has(item.adhesionId));
    }),
  /** Valeur attendue figée à la création (D-TON-04-29 : "donnée historique"), paiement toujours à 0/PENDING au départ — aucune saisie de paiement à la création (non spécifiée par aucune source, non inventée ici). */
  createContribution: (tenantId: string, input: ContributionInput) =>
    mockRequest(() => {
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === input.adhesionId, tenantId);
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === input.tontineOccurrenceId, tenantId);
      if (!adhesion || !occurrence) return undefined;
      const contribution: TontineContribution = { id: uniqueId('CTB'), tenantId, paidAmount: 0, paidQuantity: 0, paidAt: null, status: 'PENDING', payments: [], ...input };
      tontineContributions.push(contribution);
      return contribution;
    }),
  getContribution: (tenantId: string, contributionId: string) =>
    mockRequest(() => getTenantScoped(tontineContributions, (item) => item.id === contributionId, tenantId)),
  /**
   * Une opération = une nouvelle entrée dans `payments[]`, jamais un
   * remplacement (« les paiements successifs doivent rester traçables »,
   * seule règle sourcée pour Contribution). Refusée si la contribution est
   * WAIVED — une exonération formelle (« WAIVED ≠ impayé ») est un état
   * délibérément distinct du flux de paiement, pas simplement « en attente ».
   * Aucun plafond sur un dépassement de l'attendu : aucune règle d'écart
   * n'est sourcée pour Contribution (contrairement à la réception du
   * bénéfice, §J) — volontairement non inventée ici.
   */
  recordContributionPayment: (tenantId: string, contributionId: string, input: ContributionPaymentInput) =>
    mockRequest(() => {
      const contribution = getTenantScoped(tontineContributions, (item) => item.id === contributionId, tenantId);
      if (!contribution) return undefined;
      if (contribution.status === 'WAIVED') return undefined;
      const operation: PaymentOperation = { id: uniqueId('PAY'), amount: input.amount, quantity: input.quantity, date: new Date().toISOString().slice(0, 10), actorId: currentUser.id, actorName: currentUser.name };
      contribution.payments.push(operation);
      contribution.paidAmount += operation.amount ?? 0;
      contribution.paidQuantity += operation.quantity ?? 0;
      contribution.paidAt = operation.date;
      const expected = contribution.expectedAmount ?? contribution.expectedQuantity ?? 0;
      const paid = contribution.valueType === 'MONEY' ? contribution.paidAmount : contribution.paidQuantity;
      contribution.status = paid <= 0 ? 'PENDING' : paid >= expected ? 'PAID' : 'PARTIAL';
      return contribution;
    }),

  /** Nouvelle réception — une opération, jamais un remplacement (D-TON-04-21, D-TON-06-09/-11/-12 : "une réception ne remplace jamais une précédente"). Refuse si le Turn est CLOSED (immuabilité, D-TON-06-16). */
  recordReception: (tenantId: string, beneficiaryId: string, input: ReceptionInput) =>
    mockRequest(() => {
      const beneficiary = getTenantScoped(tontineTurnBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
      if (!beneficiary) return undefined;
      const turn = tontineTurns.find((item) => item.id === beneficiary.tontineTurnId);
      if (!turn || turn.status === 'CLOSED') return undefined;
      appendOperation(beneficiary, { id: uniqueId('OP'), type: 'reception', amount: input.amount, quantity: input.quantity, date: new Date().toISOString().slice(0, 10), actorId: currentUser.id, actorName: currentUser.name, reason: null });
      return { ...beneficiary, receivedTotal: computeReceivedTotal(beneficiary.operations), status: computeBeneficiaryStatus(beneficiary) };
    }),

  /** Correction — conserve l'ancienne opération, ajoute une nouvelle entrée référençant la valeur corrigée + motif obligatoire (D-TON-06-12). */
  correctReception: (tenantId: string, beneficiaryId: string, input: CorrectionInput) =>
    mockRequest(() => {
      const beneficiary = getTenantScoped(tontineTurnBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
      if (!beneficiary) return undefined;
      const turn = tontineTurns.find((item) => item.id === beneficiary.tontineTurnId);
      if (!turn || turn.status === 'CLOSED') return undefined;
      if (!input.reason.trim()) return undefined;
      const target = beneficiary.operations.find((item) => item.id === input.operationId);
      if (!target) return undefined;
      appendOperation(beneficiary, { id: uniqueId('OP'), type: 'correction', amount: input.amount, quantity: input.quantity, correctedOperationId: target.id, date: new Date().toISOString().slice(0, 10), actorId: currentUser.id, actorName: currentUser.name, reason: input.reason });
      return { ...beneficiary, receivedTotal: computeReceivedTotal(beneficiary.operations), status: computeBeneficiaryStatus(beneficiary) };
    }),

  /** Régularisation — nouvelle opération métier, ne réécrit jamais une opération précédente (distincte d'une correction). */
  regularizeReception: (tenantId: string, beneficiaryId: string, input: ReceptionInput & { reason: string }) =>
    mockRequest(() => {
      const beneficiary = getTenantScoped(tontineTurnBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
      if (!beneficiary) return undefined;
      const turn = tontineTurns.find((item) => item.id === beneficiary.tontineTurnId);
      if (!turn || turn.status === 'CLOSED') return undefined;
      if (!input.reason.trim()) return undefined;
      appendOperation(beneficiary, { id: uniqueId('OP'), type: 'regularization', amount: input.amount, quantity: input.quantity, date: new Date().toISOString().slice(0, 10), actorId: currentUser.id, actorName: currentUser.name, reason: input.reason });
      return { ...beneficiary, receivedTotal: computeReceivedTotal(beneficiary.operations), status: computeBeneficiaryStatus(beneficiary) };
    }),

  /** Annulation — invalide une opération sans la supprimer physiquement (D-TON-06-12 : "n'efface jamais physiquement l'historique"). */
  cancelReception: (tenantId: string, beneficiaryId: string, input: CancellationInput) =>
    mockRequest(() => {
      const beneficiary = getTenantScoped(tontineTurnBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
      if (!beneficiary) return undefined;
      const turn = tontineTurns.find((item) => item.id === beneficiary.tontineTurnId);
      if (!turn || turn.status === 'CLOSED') return undefined;
      if (!input.reason.trim()) return undefined;
      const target = beneficiary.operations.find((item) => item.id === input.operationId);
      if (!target) return undefined;
      appendOperation(beneficiary, { id: uniqueId('OP'), type: 'cancellation', cancelledOperationId: target.id, date: new Date().toISOString().slice(0, 10), actorId: currentUser.id, actorName: currentUser.name, reason: input.reason });
      return { ...beneficiary, receivedTotal: computeReceivedTotal(beneficiary.operations), status: computeBeneficiaryStatus(beneficiary) };
    }),

  /** Clôture explicite, définitive, uniquement si tous les bénéficiaires sont RECEIVED (D-TON-06-09/-13). */
  closeTurn: (tenantId: string, turnId: string) =>
    mockRequest(() => {
      const turn = getTenantScoped(tontineTurns, (item) => item.id === turnId, tenantId);
      if (!turn || turn.status === 'CLOSED') return undefined;
      if (!allBeneficiariesReceived(turn.id)) return undefined;
      turn.status = 'CLOSED';
      return turn;
    }),

  /** Précondition : Turn CLOSED. actual_date requise à la clôture. Ne clôture jamais automatiquement le Cycle (D-TON-06-10). */
  closeOccurrence: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence || occurrence.status === 'CLOSED') return undefined;
      const turn = tontineTurns.find((item) => item.tontineOccurrenceId === occurrence.id);
      if (!turn || turn.status !== 'CLOSED') return undefined;
      occurrence.status = 'CLOSED';
      occurrence.actualDate = occurrence.actualDate ?? new Date().toISOString().slice(0, 10);
      return occurrence;
    }),
};

export type { TontineAdhesion, TontineOccurrence, TontineTurn, TontineTurnBeneficiary, TontineContribution };
