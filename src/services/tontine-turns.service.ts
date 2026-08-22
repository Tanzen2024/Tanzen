import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { currentUser } from '@/mocks/rbac.mocks';
import { tontinePeriods, type Period } from '@/mocks/tontines/tontine-periods';
import { tontines } from '@/mocks/tontines/tontines';
import { members } from '@/mocks/organization/members';
import { generateOccurrenceDates } from '@/mocks/tontines/tontine-frequency';
import {
  tontineAdhesions, tontineOccurrences, tontineTurns, tontineTurnBeneficiaries, tontineContributions, tontineTurnPermutations,
  computeReceivedTotal, computeBeneficiaryStatus, isAdhesionActiveAt,
  type TontineAdhesion, type TontineOccurrence, type TontineTurn, type TontineTurnBeneficiary, type TontineContribution, type TontineTurnPermutation, type ReceptionOperation, type PaymentOperation, type ValueType,
} from '@/mocks/tontines/tontine-occurrences';
import { auditEvents, type AuditEvent } from '@/mocks/audit/audit-events';
import { workflowRequests, type WorkflowRequest } from '@/mocks/operations/workflow-requests';
import { workflowService } from './workflow.service';
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
/**
 * Enregistrement du résultat d'un tirage MANUEL réalisé en amont, hors TANZEN (mandat
 * bénéficiaires) — jamais un tirage. Champs strictement limités à ceux déjà portés par
 * `TontineTurnBeneficiary` (pas de `currency`/`unit` : ce type ne les porte pas,
 * contrairement à `TontineContribution` — asymétrie déjà présente dans le modèle, non
 * ajoutée ici). `adhesionIds` accepte 0..N entrées (RB-04/RB-05, aucune limite inventée).
 */
export type BeneficiaryInput = { adhesionIds: string[]; valueType: ValueType; expectedAmount?: number; expectedQuantity?: number; item?: string };
/**
 * Demande de permutation entre deux `TontineTurnBeneficiary` déjà existants (jamais un
 * simple couple tour/adhésion : un tour peut porter plusieurs bénéficiaires, D-TON-04-19,
 * donc seul l'identifiant du `TontineTurnBeneficiary` désigne sans ambiguïté QUI échange
 * avec QUI). `requestedByUserId` suit exactement le même rôle que sur `WorkflowRequest`
 * (D-FY-08) — ici renseigné mais jamais comparé à l'acteur lors de la décision : décision
 * explicite du mandat de ne PAS généraliser le blocage d'auto-approbation à ce domaine.
 */
export type TurnPermutationInput = { turnBeneficiaryAId: string; turnBeneficiaryBId: string; requestedBy: string; requestedByUserId?: string; justification?: string };
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
  /**
   * Vues agrégées transverses (mandat vue d'ensemble « Membres »/« Cotisations »/« Opérations » —
   * toutes tontines confondues) : simples filtres par `tenantId`, déjà porté directement par
   * chaque entité (Adhesion/Contribution/Occurrence/Turn/Period) — aucune jointure Tontine→Période
   * n'est nécessaire pour filtrer, seulement pour l'affichage (nom de la tontine), résolu côté UI
   * via `listAllPeriods`. N'introduit aucune nouvelle entité ni règle métier, uniquement des
   * lectures agrégées de ce qui existe déjà.
   */
  listAllPeriods: (tenantId: string) => mockRequest(() => tontinePeriods.filter((item) => item.tenantId === tenantId)),
  listAllAdhesions: (tenantId: string) => mockRequest(() => tontineAdhesions.filter((item) => item.tenantId === tenantId)),
  listAllContributions: (tenantId: string) => mockRequest(() => tontineContributions.filter((item) => item.tenantId === tenantId)),
  listAllOccurrences: (tenantId: string) => mockRequest(() => tontineOccurrences.filter((item) => item.tenantId === tenantId).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))),
  listAllTurns: (tenantId: string) => mockRequest(() => tontineTurns.filter((item) => item.tenantId === tenantId)),
  listAllBeneficiaries: (tenantId: string) => mockRequest(() => tontineTurnBeneficiaries.filter((item) => item.tenantId === tenantId)),
  /** Lecture pure du lien technique demande↔bénéficiaires (cf. `TontineTurnPermutation`) — utilisée par l'écran de planification pour signaler une permutation déjà en cours sur un tour, sans dupliquer l'état déjà porté par `WorkflowRequest.status`. */
  listTurnPermutations: (tenantId: string) => mockRequest(() => tontineTurnPermutations.filter((item) => item.tenantId === tenantId)),
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
  /**
   * Enregistre le résultat d'un tirage MANUEL déjà réalisé hors TANZEN (RB-06/RB-07) —
   * ne choisit, ne calcule ni ne propose jamais lui-même un bénéficiaire.
   *
   * RB-01/RB-02/RB-03 : une adhésion n'est acceptée que si elle appartient à LA MÊME
   * Période que l'Occurrence de ce Turn (donc à la même Tontine, par construction de la
   * chaîne Adhesion→Période→Tontine) — même contrainte déjà appliquée par
   * `createContribution` ci-dessus, réutilisée telle quelle (pas une règle nouvelle).
   * Réutilise également `isAdhesionActiveAt` (même fonction que pour les Contributions,
   * RB-10 : aucune nouvelle règle d'éligibilité inventée).
   *
   * RB-08/RB-09 : aucune vérification "déjà bénéficiaire d'une autre tontine" ni "déjà
   * bénéficiaire par le passé dans cette tontine" — ce ne sont pas des règles sourcées,
   * volontairement non ajoutées. Seul un doublon strict est empêché : la même adhésion
   * deux fois dans le même appel, ou une adhésion déjà bénéficiaire de CE turn précis.
   *
   * Refuse (retourne undefined) si le Turn est CLOSED — même immuabilité que
   * `recordReception`/`correctReception`/`regularizeReception`/`cancelReception`.
   * Une adhésion invalide/hors tontine/déjà présente est silencieusement ignorée plutôt
   * que de faire échouer tout le lot (même convention que `createAdhesionsForPeriod`) ;
   * `skippedAdhesionIds` permet à l'UI d'en informer précisément l'utilisateur.
   */
  addBeneficiaries: (tenantId: string, turnId: string, input: BeneficiaryInput) =>
    mockRequest(() => {
      const turn = getTenantScoped(tontineTurns, (item) => item.id === turnId, tenantId);
      if (!turn) return undefined;
      if (turn.status === 'CLOSED') return undefined;
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === turn.tontineOccurrenceId, tenantId);
      if (!occurrence) return undefined;
      const referenceDate = occurrence.actualDate ?? occurrence.plannedDate;
      const alreadyAdhesionIds = new Set(tontineTurnBeneficiaries.filter((item) => item.tontineTurnId === turnId).map((item) => item.adhesionId));
      const created: TontineTurnBeneficiary[] = [];
      const skippedAdhesionIds: string[] = [];
      const seenThisCall = new Set<string>();
      for (const adhesionId of input.adhesionIds) {
        if (seenThisCall.has(adhesionId) || alreadyAdhesionIds.has(adhesionId)) { skippedAdhesionIds.push(adhesionId); continue; }
        const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
        if (!adhesion || adhesion.periodId !== occurrence.periodId || !isAdhesionActiveAt(adhesion, referenceDate)) { skippedAdhesionIds.push(adhesionId); continue; }
        seenThisCall.add(adhesionId);
        const beneficiary: TontineTurnBeneficiary = { id: uniqueId('TB'), tenantId, tontineTurnId: turnId, adhesionId, valueType: input.valueType, expectedAmount: input.expectedAmount, expectedQuantity: input.expectedQuantity, item: input.item, operations: [] };
        tontineTurnBeneficiaries.push(beneficiary);
        alreadyAdhesionIds.add(adhesionId);
        created.push(beneficiary);
      }
      return { created, skippedAdhesionIds };
    }),

  /**
   * Historique des permutations d'un bénéficiaire (mandat §16/§Q1 : « distinguer/
   * historiser » les différents tours qu'une adhésion a occupés). Dérivé, jamais stocké
   * séparément — chaque `AuditEvent` `tontines.turnPermutationApplied` écrit par
   * `applyTurnPermutationDecision` porte déjà avant/après ; ce lecteur les retrouve pour
   * une adhésion donnée (des deux côtés d'un échange, `context.otherAdhesionId`).
   */
  listPermutationHistoryForAdhesion: (tenantId: string, adhesionId: string) =>
    mockRequest(() =>
      auditEvents
        .filter((event) => event.tenantId === tenantId && event.module === 'tontines' && event.action === 'tontines.turnPermutationApplied' && (event.context?.adhesionId === adhesionId || event.context?.otherAdhesionId === adhesionId))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    ),

  /**
   * Crée une `WorkflowRequest` (domaine `tontines`, `WD-006`) via le moteur générique —
   * ne modifie RIEN dans `tontineTurnBeneficiaries` avant approbation effective (mandat
   * §9-10 : la permutation ne devient effective qu'après validation). `turnBeneficiaryAId`/
   * `turnBeneficiaryBId` désignent directement les deux `TontineTurnBeneficiary` à
   * échanger — jamais un couple tour/adhésion : un tour peut porter plusieurs
   * bénéficiaires (D-TON-04-19), seul l'id du bénéficiaire lève l'ambiguïté.
   *
   * Refuse (retourne `undefined`) si : même bénéficiaire des deux côtés, bénéficiaire
   * introuvable/autre tenant, les deux bénéficiaires appartiennent déjà au même tour,
   * l'un des deux tours est CLOSED (même immuabilité que `recordReception`/
   * `addBeneficiaries`), les deux tours n'appartiennent pas à la MÊME tontine (aucune
   * permutation inter-tontine — jamais demandée par le mandat, mélanger deux tontines
   * serait un mélange de fonds distincts), ou une permutation déjà `pending`/`inProgress`
   * référence déjà l'un des deux bénéficiaires (§17, TEST 14 : deux demandes concurrentes
   * incompatibles).
   */
  requestTurnPermutation: async (tenantId: string, input: TurnPermutationInput): Promise<WorkflowRequest | undefined> => {
    if (input.turnBeneficiaryAId === input.turnBeneficiaryBId) return undefined;
    const beneficiaryA = getTenantScoped(tontineTurnBeneficiaries, (item) => item.id === input.turnBeneficiaryAId, tenantId);
    const beneficiaryB = getTenantScoped(tontineTurnBeneficiaries, (item) => item.id === input.turnBeneficiaryBId, tenantId);
    if (!beneficiaryA || !beneficiaryB || beneficiaryA.tontineTurnId === beneficiaryB.tontineTurnId) return undefined;
    const turnA = getTenantScoped(tontineTurns, (item) => item.id === beneficiaryA.tontineTurnId, tenantId);
    const turnB = getTenantScoped(tontineTurns, (item) => item.id === beneficiaryB.tontineTurnId, tenantId);
    if (!turnA || !turnB || turnA.status === 'CLOSED' || turnB.status === 'CLOSED') return undefined;
    const occurrenceA = getTenantScoped(tontineOccurrences, (item) => item.id === turnA.tontineOccurrenceId, tenantId);
    const occurrenceB = getTenantScoped(tontineOccurrences, (item) => item.id === turnB.tontineOccurrenceId, tenantId);
    if (!occurrenceA || !occurrenceB) return undefined;
    const periodA = getTenantScoped(tontinePeriods, (item) => item.id === occurrenceA.periodId, tenantId);
    const periodB = getTenantScoped(tontinePeriods, (item) => item.id === occurrenceB.periodId, tenantId);
    if (!periodA || !periodB || periodA.tontineId !== periodB.tontineId) return undefined;
    const conflicting = tontineTurnPermutations.some((permutation) => {
      if (permutation.tenantId !== tenantId) return false;
      if (permutation.turnBeneficiaryAId !== input.turnBeneficiaryAId && permutation.turnBeneficiaryAId !== input.turnBeneficiaryBId && permutation.turnBeneficiaryBId !== input.turnBeneficiaryAId && permutation.turnBeneficiaryBId !== input.turnBeneficiaryBId) return false;
      const existingRequest = workflowRequests.find((item) => item.id === permutation.workflowRequestId);
      return Boolean(existingRequest && (existingRequest.status === 'pending' || existingRequest.status === 'inProgress'));
    });
    if (conflicting) return undefined;

    const adhesionA = getTenantScoped(tontineAdhesions, (item) => item.id === beneficiaryA.adhesionId, tenantId);
    const adhesionB = getTenantScoped(tontineAdhesions, (item) => item.id === beneficiaryB.adhesionId, tenantId);
    const entityLabel = `Tour ${turnA.turnNumber} · ${adhesionA?.memberName ?? beneficiaryA.adhesionId} ↔ Tour ${turnB.turnNumber} · ${adhesionB?.memberName ?? beneficiaryB.adhesionId}`;
    const permutationId = uniqueId('TPM');
    const request = await workflowService.createRequest(tenantId, 'WD-006', { entityId: permutationId, entityLabel, requestedBy: input.requestedBy, requestedByUserId: input.requestedByUserId, justification: input.justification });
    if (!request) return undefined;
    const permutation: TontineTurnPermutation = { id: permutationId, tenantId, workflowRequestId: request.id, turnBeneficiaryAId: input.turnBeneficiaryAId, turnBeneficiaryBId: input.turnBeneficiaryBId, appliedAt: null };
    tontineTurnPermutations.push(permutation);
    return request;
  },

  /**
   * Effet de bord propre au domaine Tontines, appelé APRÈS `workflowService.submitAction`
   * — même point d'intégration générique que `settingsService.applyFiscalYearReopenDecision`
   * (`operations-module.tsx`, `WorkflowDetail`) : no-op pour tout autre domaine/entityType,
   * le moteur workflow reste agnostique. Auto-approbation VOLONTAIREMENT autorisée (décision
   * explicite du mandat : ne pas généraliser D-FY-08 à ce domaine) — aucune comparaison
   * `requestedByUserId`/acteur ici, contrairement à `decideFiscalYearReopen`.
   *
   * Échange atomique (mandat §13) : les deux `TontineTurnBeneficiary.adhesionId` sont permutés
   * dans le même appel synchrone — aucun état intermédiaire n'est jamais observable (le
   * moteur mock est mono-thread, comme `applyFiscalYearReopenDecision`). N'applique rien
   * (silencieusement, même tolérance que `applyFiscalYearReopenDecision` pour une FiscalYear
   * déjà rouverte entretemps) si l'un des deux Turns est devenu CLOSED, ou si l'un des deux
   * bénéficiaires a déjà une réception enregistrée depuis la demande — permuter après coup
   * réattribuerait un historique financier déjà réel à la mauvaise personne (règle non
   * demandée explicitement par le mandat mais directement dictée par l'intégrité des
   * données, cf. immuabilité déjà appliquée à `recordReception` etc.).
   */
  applyTurnPermutationDecision: (tenantId: string, request: WorkflowRequest) => {
    if (request.domain !== 'tontines' || request.entityType !== 'turnPermutation' || request.status !== 'approved') return;
    const permutation = tontineTurnPermutations.find((item) => item.tenantId === tenantId && item.workflowRequestId === request.id);
    if (!permutation || permutation.appliedAt) return;
    const beneficiaryA = getTenantScoped(tontineTurnBeneficiaries, (item) => item.id === permutation.turnBeneficiaryAId, tenantId);
    const beneficiaryB = getTenantScoped(tontineTurnBeneficiaries, (item) => item.id === permutation.turnBeneficiaryBId, tenantId);
    if (!beneficiaryA || !beneficiaryB || beneficiaryA.operations.length > 0 || beneficiaryB.operations.length > 0) return;
    const turnA = getTenantScoped(tontineTurns, (item) => item.id === beneficiaryA.tontineTurnId, tenantId);
    const turnB = getTenantScoped(tontineTurns, (item) => item.id === beneficiaryB.tontineTurnId, tenantId);
    if (!turnA || !turnB || turnA.status === 'CLOSED' || turnB.status === 'CLOSED') return;
    const adhesionIdA = beneficiaryA.adhesionId;
    const adhesionIdB = beneficiaryB.adhesionId;
    if (adhesionIdA === adhesionIdB) return;
    beneficiaryA.adhesionId = adhesionIdB;
    beneficiaryB.adhesionId = adhesionIdA;
    permutation.appliedAt = new Date().toISOString();
    const memberNameA = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionIdA, tenantId)?.memberName ?? adhesionIdA;
    const memberNameB = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionIdB, tenantId)?.memberName ?? adhesionIdB;
    const event: AuditEvent = {
      id: uniqueId('AUD-TON'), tenantId, timestamp: new Date().toISOString(), actorId: currentUser.id, actorName: currentUser.name,
      module: 'tontines', action: 'tontines.turnPermutationApplied', eventType: 'sensitiveAction',
      resourceType: 'turnBeneficiary', resourceId: permutation.id, resourceLabel: request.entityLabel, status: 'success', sensitive: true, correlationId: permutation.id,
      before: { [`turn${turnA.turnNumber}`]: memberNameA, [`turn${turnB.turnNumber}`]: memberNameB },
      after: { [`turn${turnA.turnNumber}`]: memberNameB, [`turn${turnB.turnNumber}`]: memberNameA },
      context: { adhesionId: adhesionIdA, otherAdhesionId: adhesionIdB, turnBeneficiaryAId: beneficiaryA.id, turnBeneficiaryBId: beneficiaryB.id },
    };
    auditEvents.push(event);
  },

  /**
   * Lecture de composition pure (aucune mutation) — reconstruit les deux côtés d'une
   * permutation (tour, adhérent, photo) à partir du seul `workflowRequestId`, pour que
   * l'écran générique `WorkflowDetail` (`operations-module.tsx`, cross-domaine
   * Credit/Governance/Finance/Settings/Tontines) puisse afficher les photos des deux
   * bénéficiaires (mandat §9 « validation de permutation ») sans dupliquer la traversée
   * Turn→TurnBeneficiary→Adhesion→Member déjà utilisée partout ailleurs dans ce fichier.
   */
  getTurnPermutationPreview: (tenantId: string, workflowRequestId: string) =>
    mockRequest(() => {
      const permutation = tontineTurnPermutations.find((item) => item.tenantId === tenantId && item.workflowRequestId === workflowRequestId);
      if (!permutation) return undefined;
      const side = (beneficiaryId: string) => {
        const beneficiary = getTenantScoped(tontineTurnBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
        if (!beneficiary) return undefined;
        const turn = getTenantScoped(tontineTurns, (item) => item.id === beneficiary.tontineTurnId, tenantId);
        const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === beneficiary.adhesionId, tenantId);
        const member = adhesion ? getTenantScoped(members, (item) => item.id === adhesion.memberId, tenantId) : undefined;
        return { turnId: beneficiary.tontineTurnId, turnNumber: turn?.turnNumber, memberName: adhesion?.memberName ?? beneficiary.adhesionId, photoUrl: member?.photoUrl };
      };
      const a = side(permutation.turnBeneficiaryAId);
      const b = side(permutation.turnBeneficiaryBId);
      if (!a || !b) return undefined;
      return { a, b };
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
