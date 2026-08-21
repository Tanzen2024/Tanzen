import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { currentUser } from '@/mocks/rbac.mocks';
import { tontinePeriods, type Period } from '@/mocks/tontines/tontine-periods';
import { tontines } from '@/mocks/tontines/tontines';
import { members } from '@/mocks/organization/members';
import { generateOccurrenceDates } from '@/mocks/tontines/tontine-frequency';
import {
  tontineAdhesions, tontineOccurrences, tontineTurns, tontineTurnBeneficiaries, tontineContributions,
  computeReceivedTotal, computeBeneficiaryStatus, isAdhesionActiveAt,
  type TontineAdhesion, type TontineOccurrence, type TontineTurn, type TontineTurnBeneficiary, type TontineContribution, type ReceptionOperation, type PaymentOperation, type ValueType,
} from '@/mocks/tontines/tontine-occurrences';
import type { UnitCode } from '@/constants/units';

export type ReceptionInput = { amount?: number; quantity?: number };
export type CorrectionInput = { operationId: string; amount?: number; quantity?: number; reason: string };
export type CancellationInput = { operationId: string; reason: string };
/** Champs limités à ceux déjà portés par `TontineAdhesion` (memberId, joinedAt) — D-TON-04-07 (forme technique) reste ouverte, aucun champ métier supplémentaire n'est inventé ici. `periodId` remplace `tontineId` (mandat « adhésions au niveau de la période ») : une Adhésion est toujours créée directement dans une Période existante. */
export type AdhesionInput = { periodId: string; memberId: string; memberName: string; joinedAt: string };
/** Champs limités à ceux déjà portés par `TontineContribution` — la valeur attendue générée devient une donnée historique dès la création (D-TON-04-29), `paidAmount`/`paidQuantity`/`paidAt` démarrent donc toujours à zéro/nul, statut `PENDING` (aucun flux de paiement n'est inventé à ce stade). */
export type ContributionInput = { adhesionId: string; tontineOccurrenceId: string; valueType: ValueType; expectedAmount?: number; currency?: string; expectedQuantity?: number; item?: string; unit?: UnitCode };
/** Champs volontairement minimaux (montant/quantité) — mode de paiement, référence et commentaire ne sont spécifiés par aucune source pour Contribution, non inventés ici. */
export type ContributionPaymentInput = { amount?: number; quantity?: number };
/** Champs strictement limités à ceux déjà portés par `TontineOccurrence` — aucune notion de fréquence/périodicité n'existe dans le modèle (confirmé absent, D-TON-04-11), donc non demandée ici : chaque occurrence est créée manuellement, une par une. */
export type OccurrenceInput = { periodId: string; occurrenceNumber: number; plannedDate: string; actualDate?: string | null };
/** Champs strictement limités à ceux du dictionnaire canonique Period (mandat refonte §4) — pas de « numéro de période » ni de champ supplémentaire non demandé. */
export type PeriodInput = { tontineId: string; startDate: string; endDate: string };

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

/** Mutation partagée par `createAdhesion` et `createAdhesionsForPeriod` (mandat ajout multiple §18 : « éviter deux implémentations divergentes ») — seule et unique fonction qui pousse une TontineAdhesion dans le mock. */
function buildAdhesion(tenantId: string, input: AdhesionInput): TontineAdhesion {
  const adhesion: TontineAdhesion = { id: uniqueId('ADH'), tenantId, status: 'active', endDate: null, ...input };
  tontineAdhesions.push(adhesion);
  return adhesion;
}

export const tontineTurnsService = {
  /**
   * Historique transversal (mandat « adhésions au niveau de la période »
   * §28 : conservée car utile aux écrans Contributions, qui restent
   * tontine-wide) — dérivée par jointure via les Périodes de la Tontine, `Adhesion`
   * ne portant plus `tontineId` directement.
   */
  listAdhesionsByTontine: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const periodIds = new Set(tontinePeriods.filter((period) => period.tenantId === tenantId && period.tontineId === tontineId).map((period) => period.id));
      return tontineAdhesions.filter((item) => item.tenantId === tenantId && periodIds.has(item.periodId));
    }),
  /** Adhésions d'une Période précise (mandat « adhésions au niveau de la période ») — remplace l'ancien couple listAdhesionsByTontine+listPeriodAdhesions : l'Adhésion appartient directement à la Période, plus de couche d'affectation intermédiaire. */
  listAdhesionsByPeriod: (tenantId: string, periodId: string) =>
    mockRequest(() => tontineAdhesions.filter((item) => item.tenantId === tenantId && item.periodId === periodId)),
  listAdhesionsByMember: (tenantId: string, memberId: string) =>
    mockRequest(() => tontineAdhesions.filter((item) => item.tenantId === tenantId && item.memberId === memberId)),
  getAdhesion: (tenantId: string, adhesionId: string) =>
    mockRequest(() => getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId)),
  /**
   * Une Adhésion est désormais créée directement dans une Période (mandat
   * « adhésions au niveau de la période » §6/§13) — refuse si la Période
   * n'existe pas ou n'appartient pas au tenant. Multi-adhésion illimitée par
   * défaut (D-TON-04-08, confirmé, jamais remis en cause par cette
   * migration) : aucune vérification d'unicité membre/période n'est
   * appliquée — aucune règle sourcée ne l'impose, documenté comme décision
   * ouverte plutôt qu'inventé (mandat §14).
   */
  createAdhesion: (tenantId: string, input: AdhesionInput) =>
    mockRequest(() => {
      const period = getTenantScoped(tontinePeriods, (item) => item.id === input.periodId, tenantId);
      if (!period) return undefined;
      return buildAdhesion(tenantId, input);
    }),
  /**
   * Ajout multiple d'adhésions à une Période en une seule opération (mandat
   * ajout multiple) — construit sur `buildAdhesion`, la même mutation que
   * l'ajout unitaire (§18 : pas de seconde architecture d'adhésion).
   * Contrairement à `createAdhesion`, revalide chaque `memberId` côté
   * service (tenant + statut actif, §11 items 3-4) : ne fait jamais
   * confiance à la sélection déjà filtrée côté UI. Un membre invalide,
   * inactif, d'un autre tenant, ou déjà adhérent à cette Période (doublon)
   * est silencieusement ignoré plutôt que de faire échouer tout le lot
   * (§12/§13) ; `skippedMemberIds` permet à l'UI d'informer précisément
   * l'utilisateur sans jamais afficher un faux succès total.
   */
  createAdhesionsForPeriod: (tenantId: string, periodId: string, memberIds: string[], joinedAt: string) =>
    mockRequest(() => {
      const period = getTenantScoped(tontinePeriods, (item) => item.id === periodId, tenantId);
      if (!period) return undefined;
      const alreadyMemberIds = new Set(
        tontineAdhesions.filter((item) => item.tenantId === tenantId && item.periodId === periodId).map((item) => item.memberId),
      );
      const created: TontineAdhesion[] = [];
      const skippedMemberIds: string[] = [];
      for (const memberId of memberIds) {
        const member = getTenantScoped(members, (item) => item.id === memberId, tenantId);
        if (!member || member.status !== 'active' || alreadyMemberIds.has(memberId)) { skippedMemberIds.push(memberId); continue; }
        created.push(buildAdhesion(tenantId, { periodId, memberId: member.id, memberName: `${member.firstName} ${member.lastName}`, joinedAt }));
        alreadyMemberIds.add(memberId);
      }
      return { created, skippedMemberIds };
    }),
  /** Clôture logique (§8 mandat refonte : « UPDATE, jamais DELETE ») — l'adhésion et tout son historique de Contributions/Bénéfices restent consultables, seul son statut/sa endDate changent. Refuse de clôturer une adhésion déjà exited (pas de double clôture silencieuse). */
  closeAdhesion: (tenantId: string, adhesionId: string, endDate: string) =>
    mockRequest(() => {
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
      if (!adhesion || adhesion.status === 'exited') return undefined;
      adhesion.status = 'exited';
      adhesion.endDate = endDate;
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

  /** Périodes d'une Tontine (nouveau niveau temporel, remplace Cycle comme parent d'Occurrence — mandat refonte). `TontineCycle` reste une structure légataire séparée, non traversée ici. */
  listPeriodsByTontine: (tenantId: string, tontineId: string) =>
    mockRequest(() => tontinePeriods.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId).sort((a, b) => a.startDate.localeCompare(b.startDate))),
  getPeriod: (tenantId: string, periodId: string) =>
    mockRequest(() => getTenantScoped(tontinePeriods, (item) => item.id === periodId, tenantId)),
  /**
   * Crée une nouvelle Période pour une Tontine déjà existante — la Tontine
   * n'est jamais recréée (§2 du mandat refonte). Ne modifie ni ne clôture
   * aucune période existante (§5 : « ne modifie PAS les anciennes
   * périodes ») : aucune règle métier sourcée n'impose qu'une seule période
   * soit ACTIVE à la fois, donc aucune transition automatique n'est
   * appliquée ici (documenté comme gap plutôt qu'inventé).
   */
  createPeriod: (tenantId: string, input: PeriodInput) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === input.tontineId, tenantId);
      if (!tontine) return undefined;
      const period: Period = { id: uniqueId('PER'), tenantId, status: 'ACTIVE', createdAt: new Date().toISOString().slice(0, 10), ...input };
      tontinePeriods.push(period);
      return period;
    }),

  listOccurrencesByPeriod: (tenantId: string, periodId: string) =>
    mockRequest(() => tontineOccurrences.filter((item) => item.tenantId === tenantId && item.periodId === periodId).sort((a, b) => a.occurrenceNumber - b.occurrenceNumber)),
  /** Traverse Tontine → Période → Occurrence pour peupler le sélecteur d'occurrence du formulaire de contribution, sans exposer directement les mocks au composant. */
  listOccurrencesByTontine: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const periodIds = new Set(tontinePeriods.filter((period) => period.tenantId === tenantId && period.tontineId === tontineId).map((period) => period.id));
      return tontineOccurrences.filter((item) => item.tenantId === tenantId && periodIds.has(item.periodId)).sort((a, b) => a.occurrenceNumber - b.occurrenceNumber);
    }),
  getOccurrence: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId)),
  /**
   * Crée l'Occurrence ET son Turn associé dans le même appel : la relation
   * 1:1 Occurrence↔Turn est déjà confirmée (D-TON-04-06) — une Occurrence
   * sans Turn serait un état incomplet jamais défini par aucune source, pas
   * un état "en attente" valide. Refuse un `occurrenceNumber` déjà utilisé
   * dans la période (contrainte déjà documentée dans le dictionnaire
   * canonique). Création unitaire manuelle — pour générer plusieurs
   * occurrences d'un coup à partir de la fréquence de la Tontine, voir
   * `generateOccurrences` ci-dessous (mandat fréquence) ; les deux chemins
   * restent disponibles côté UI (création manuelle jamais retirée, §25).
   */
  createOccurrence: (tenantId: string, input: OccurrenceInput) =>
    mockRequest(() => {
      const period = getTenantScoped(tontinePeriods, (item) => item.id === input.periodId, tenantId);
      if (!period) return undefined;
      const duplicate = tontineOccurrences.some((item) => item.periodId === input.periodId && item.occurrenceNumber === input.occurrenceNumber);
      if (duplicate) return undefined;
      const occurrence: TontineOccurrence = { id: uniqueId('OCC'), tenantId, status: 'OPEN', actualDate: null, ...input };
      tontineOccurrences.push(occurrence);
      const turn: TontineTurn = { id: uniqueId('TURN'), tenantId, tontineOccurrenceId: occurrence.id, turnNumber: input.occurrenceNumber, status: 'OPEN' };
      tontineTurns.push(turn);
      return occurrence;
    }),
  /**
   * Génère en une fois les Occurrences (+ Turns) d'une Période à partir de
   * la fréquence configurée sur sa Tontine (mandat fréquence) — la
   * périodicité est désormais une décision métier fournie, contrairement
   * au P1 (`GÉNÉRATION AUTOMATIQUE — DÉCISION MÉTIER MANQUANTE`, obsolète).
   * Refuse si la Tontine n'a pas de fréquence configurée (`undefined`, pas
   * d'erreur silencieuse). Numérote à la suite des occurrences déjà
   * présentes dans la Période (jamais de numérotation globale Tontine, §26)
   * et ignore toute date déjà occupée par une occurrence existante — un
   * second clic sur « Générer » ne crée donc jamais de doublon (§25).
   */
  generateOccurrences: (tenantId: string, periodId: string) =>
    mockRequest(() => {
      const period = getTenantScoped(tontinePeriods, (item) => item.id === periodId, tenantId);
      if (!period) return undefined;
      const tontine = getTenantScoped(tontines, (item) => item.id === period.tontineId, tenantId);
      if (!tontine || !tontine.frequency) return undefined;
      const existing = tontineOccurrences.filter((item) => item.periodId === periodId);
      const existingDates = new Set(existing.map((item) => item.plannedDate));
      const dates = generateOccurrenceDates({ startDate: period.startDate, endDate: period.endDate }, tontine as Parameters<typeof generateOccurrenceDates>[1]);
      let nextNumber = existing.reduce((max, item) => Math.max(max, item.occurrenceNumber), 0) + 1;
      const created: TontineOccurrence[] = [];
      for (const plannedDate of dates) {
        if (existingDates.has(plannedDate)) continue;
        const occurrence: TontineOccurrence = { id: uniqueId('OCC'), tenantId, periodId, occurrenceNumber: nextNumber, plannedDate, actualDate: null, status: 'OPEN' };
        tontineOccurrences.push(occurrence);
        const turn: TontineTurn = { id: uniqueId('TURN'), tenantId, tontineOccurrenceId: occurrence.id, turnNumber: nextNumber, status: 'OPEN' };
        tontineTurns.push(turn);
        created.push(occurrence);
        nextNumber += 1;
      }
      return created;
    }),

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
      const periodIds = new Set(tontinePeriods.filter((period) => period.tenantId === tenantId && period.tontineId === tontineId).map((period) => period.id));
      const adhesionIds = new Set(tontineAdhesions.filter((item) => item.tenantId === tenantId && periodIds.has(item.periodId)).map((item) => item.id));
      return tontineContributions.filter((item) => item.tenantId === tenantId && adhesionIds.has(item.adhesionId));
    }),
  /**
   * Valeur attendue figée à la création (D-TON-04-29 : "donnée historique"),
   * paiement toujours à 0/PENDING au départ — aucune saisie de paiement à la
   * création (non spécifiée par aucune source, non inventée ici).
   * Règle d'éligibilité obligatoire (§10 mandat refonte) : l'adhésion doit
   * être active à la date de l'occurrence (`actualDate ?? plannedDate`,
   * aucune autre date canonique n'existe sur Occurrence) — refusée sinon.
   * Depuis le mandat « adhésions au niveau de la période », une Adhésion
   * appartient à une Période précise : une Contribution ne peut référencer
   * qu'une Adhésion de la MÊME Période que son Occurrence (conséquence
   * directe du modèle, §17 — jamais reconnecter une Contribution à une
   * Adhésion d'une période suivante).
   */
  createContribution: (tenantId: string, input: ContributionInput) =>
    mockRequest(() => {
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === input.adhesionId, tenantId);
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === input.tontineOccurrenceId, tenantId);
      if (!adhesion || !occurrence) return undefined;
      if (adhesion.periodId !== occurrence.periodId) return undefined;
      if (!isAdhesionActiveAt(adhesion, occurrence.actualDate ?? occurrence.plannedDate)) return undefined;
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
