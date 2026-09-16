import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { currentUser } from '@/mocks/rbac.mocks';
import { tontinePeriods, type Period } from '@/mocks/tontines/tontine-periods';
import { tontines } from '@/mocks/tontines/tontines';
import { members } from '@/mocks/organization/members';
import { generateOccurrenceDates } from '@/mocks/tontines/tontine-frequency';
import {
  tontineAdhesions, tontineOccurrences, occurrenceBeneficiaries, tontineContributions, occurrenceBeneficiaryPermutations,
  computeReceivedTotal, computePurchaseTotal, computeBeneficiaryStatus, isAdhesionActiveAt,
  type TontineAdhesion, type TontineOccurrence, type OccurrenceBeneficiary, type TontineContribution, type OccurrenceBeneficiaryPermutation, type ReceptionOperation, type PaymentOperation, type ValueType,
} from '@/mocks/tontines/tontine-occurrences';
import { auditEvents, type AuditEvent } from '@/mocks/audit/audit-events';
import { workflowRequests, type WorkflowRequest } from '@/mocks/operations/workflow-requests';
import { workflowService } from './workflow.service';
import { insertTransaction } from './finance.service';
import { accounts, type AccountRecord } from '@/mocks/finance/accounts';
import type { UnitCode } from '@/constants/units';

export type ReceptionInput = { amount?: number; quantity?: number; purchaseAmount?: number };
/** Champs limités à ceux déjà portés par `TontineAdhesion` (memberId, joinedAt) — D-TON-04-07 (forme technique) reste ouverte, aucun champ métier supplémentaire n'est inventé ici. `periodId` remplace `tontineId` (mandat « adhésions au niveau de la période ») : une Adhésion est toujours créée directement dans une Période existante. */
export type AdhesionInput = { periodId: string; memberId: string; memberName: string; joinedAt: string };
/** Champs limités à ceux déjà portés par `TontineContribution` — la valeur attendue générée devient une donnée historique dès la création (D-TON-04-29), `paidAmount`/`paidQuantity`/`paidAt` démarrent donc toujours à zéro/nul, statut `PENDING` (aucun flux de paiement n'est inventé à ce stade). */
export type ContributionInput = { adhesionId: string; tontineOccurrenceId: string; valueType: ValueType; expectedAmount?: number; currency?: string; expectedQuantity?: number; item?: string; unit?: UnitCode };
/** Champs volontairement minimaux (montant/quantité) — mode de paiement, référence et commentaire ne sont spécifiés par aucune source pour Contribution, non inventés ici. */
export type ContributionPaymentInput = { amount?: number; quantity?: number };
/**
 * Enregistrement du résultat d'un tirage MANUEL réalisé en amont, hors TANZEN (mandat
 * bénéficiaires) — jamais un tirage. Champs strictement limités à ceux déjà portés par
 * `OccurrenceBeneficiary` (pas de `currency`/`unit` : ce type ne les porte pas,
 * contrairement à `TontineContribution` — asymétrie déjà présente dans le modèle, non
 * ajoutée ici). `adhesionIds` accepte 0..N entrées (RB-04/RB-05, aucune limite inventée).
 */
export type BeneficiaryInput = { adhesionIds: string[]; valueType: ValueType; expectedAmount?: number; expectedQuantity?: number; item?: string };
/**
 * Demande de permutation entre deux `OccurrenceBeneficiary` déjà existants (jamais un
 * simple couple occurrence/adhésion : une occurrence peut porter plusieurs bénéficiaires,
 * D-TON-04-19, donc seul l'identifiant du `OccurrenceBeneficiary` désigne sans ambiguïté
 * QUI échange avec QUI). `requestedByUserId` suit exactement le même rôle que sur
 * `WorkflowRequest` (D-FY-08) — ici renseigné mais jamais comparé à l'acteur lors de la
 * décision : décision explicite du mandat de ne PAS généraliser le blocage
 * d'auto-approbation à ce domaine.
 */
export type BeneficiaryPermutationInput = { beneficiaryAId: string; beneficiaryBId: string; requestedBy: string; requestedByUserId?: string; justification?: string };
/** Champs strictement limités à ceux déjà portés par `TontineOccurrence` — aucune notion de fréquence/périodicité n'existe dans le modèle (confirmé absent, D-TON-04-11), donc non demandée ici : chaque occurrence est créée manuellement, une par une. */
export type OccurrenceInput = { periodId: string; occurrenceNumber: number; plannedDate: string; actualDate?: string | null };
/** Champs strictement limités à ceux du dictionnaire canonique Period (mandat refonte §4) — pas de « numéro de période » ni de champ supplémentaire non demandé. */
export type PeriodInput = { tontineId: string; startDate: string; endDate: string };

/** Une Occurrence ne peut être clôturée normalement que si TOUS ses bénéficiaires sont RECEIVED (D-TON-06-09/-13, règle de clôture reprise dans les consolidations D-TON-04-19/-21 de cette session). */
function allBeneficiariesReceived(occurrenceId: string): boolean {
  const beneficiaries = occurrenceBeneficiaries.filter((item) => item.tontineOccurrenceId === occurrenceId);
  return beneficiaries.length > 0 && beneficiaries.every((item) => computeBeneficiaryStatus(item) === 'RECEIVED');
}

function appendOperation(beneficiary: OccurrenceBeneficiary, operation: ReceptionOperation) {
  beneficiary.operations.push(operation);
}

/** `Date.now()` seul peut collisionner entre deux créations survenant dans la même milliseconde (constaté en test) — un suffixe aléatoire garantit l'unicité sans dépendre du timing. */
function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Résout la caisse Finance (`Account`) d'une Période, si sa Tontine en porte
 * une (mandat « intégration Tontine ↔ Finance ») — remonte Période → Tontine
 * → `Tontine.accountId` → `Account`, en revérifiant que le compte appartient
 * bien au même tenant (défense en profondeur, même si `isValidAccountLink`,
 * côté `tontines.service.ts`, l'a déjà garanti à l'écriture). `undefined` si
 * la tontine n'est pas rattachée à une caisse — cas normal pour toute tontine
 * créée avant ce mandat, ou n'ayant simplement pas besoin de cette intégration.
 */
function resolveTontineAccount(tenantId: string, periodId: string): AccountRecord | undefined {
  const period = tontinePeriods.find((item) => item.tenantId === tenantId && item.id === periodId);
  const tontine = period && tontines.find((item) => item.tenantId === tenantId && item.id === period.tontineId);
  if (!tontine?.accountId) return undefined;
  return accounts.find((account) => account.id === tontine.accountId && account.tenantId === tenantId);
}

/**
 * Résout la caisse « Achat tontine » (mandat « Avec achat ») — même chemin
 * Période → Tontine que `resolveTontineAccount` ci-dessus, mais lit
 * `Tontine.purchaseAccountId`, JAMAIS `accountId`. RÈGLE FINANCIÈRE CRITIQUE :
 * ces deux résolutions ne doivent jamais être confondues — `accountId`/
 * `resolveTontineAccount` restent le chemin des COTISATIONS et RÉCEPTIONS
 * (inchangé par ce mandat, cf. fonctions ci-dessus) ; `purchaseAccountId`/
 * `resolveTontinePurchaseAccount` est le SEUL chemin des montants d'ACHAT
 * (`postTontinePurchaseTransaction` ci-dessous). `undefined` si la tontine
 * n'est pas « Avec achat » (purchaseAccountId n'est alors jamais renseigné,
 * cf. `tontines.service.ts`) — donc structurellement aucune association,
 * jamais de transaction, quand « Avec achat » est OFF.
 */
function resolveTontinePurchaseAccount(tenantId: string, periodId: string): AccountRecord | undefined {
  const period = tontinePeriods.find((item) => item.tenantId === tenantId && item.id === periodId);
  const tontine = period && tontines.find((item) => item.tenantId === tenantId && item.id === period.tontineId);
  if (!tontine?.purchaseAccountId) return undefined;
  return accounts.find((account) => account.id === tontine.purchaseAccountId && account.tenantId === tenantId);
}

/**
 * Poste une transaction Finance pour un mouvement Tontine (mandat
 * « intégration Tontine ↔ Finance », objectif majeur) — le module Tontines
 * ALIMENTE désormais le moteur financier au lieu de maintenir un calcul
 * strictement parallèle (§21 du mandat). Ne poste JAMAIS pour une tontine
 * GOODS (aucun flux monétaire à faire transiter par un compte, cohérent avec
 * l'absence de « disponible » financier déjà actée ailleurs pour ce cas), ni
 * pour un montant nul/négatif (ex. bascule « annuler le paiement » côté
 * Opérations, qui nette `paidAmount` via un montant négatif — aucun concept
 * de transaction négative/d'avoir n'existe dans le journal Finance ; inventer
 * une contre-écriture ici serait une règle non sourcée, volontairement absente).
 * Best-effort et non bloquant : si `insertTransaction` refuse (cas
 * théorique — classification déjà fixée ici, jamais fournie par l'appelant,
 * donc toujours valide), l'opération Tontine elle-même n'est jamais annulée
 * a posteriori — la Tontine reste la source de vérité de son propre état,
 * la Transaction n'est qu'un reflet best-effort côté Finance.
 */
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
      occurrenceBeneficiaries
        .filter((item) => item.tenantId === tenantId && item.adhesionId === adhesionId)
        .map((item) => ({ ...item, receivedTotal: computeReceivedTotal(item.operations), purchaseTotal: computePurchaseTotal(item.operations), status: computeBeneficiaryStatus(item) })),
    ),

  /** Périodes d'une Tontine (nouveau niveau temporel, remplace Cycle comme parent d'Occurrence — mandat refonte). `TontineCycle` a été supprimé (mandat « suppression complète de la logique Cycle/Tour »). */
  listPeriodsByTontine: (tenantId: string, tontineId: string) =>
    mockRequest(() => tontinePeriods.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId).sort((a, b) => a.startDate.localeCompare(b.startDate))),
  /**
   * Vues agrégées transverses (mandat vue d'ensemble « Membres »/« Cotisations »/« Opérations » —
   * toutes tontines confondues) : simples filtres par `tenantId`, déjà porté directement par
   * chaque entité (Adhesion/Contribution/Occurrence/Bénéficiaire/Period) — aucune jointure
   * Tontine→Période n'est nécessaire pour filtrer, seulement pour l'affichage (nom de la
   * tontine), résolu côté UI via `listAllPeriods`. N'introduit aucune nouvelle entité ni
   * règle métier, uniquement des lectures agrégées de ce qui existe déjà.
   */
  listAllPeriods: (tenantId: string) => mockRequest(() => tontinePeriods.filter((item) => item.tenantId === tenantId)),
  listAllAdhesions: (tenantId: string) => mockRequest(() => tontineAdhesions.filter((item) => item.tenantId === tenantId)),
  listAllContributions: (tenantId: string) => mockRequest(() => tontineContributions.filter((item) => item.tenantId === tenantId)),
  listAllOccurrences: (tenantId: string) => mockRequest(() => tontineOccurrences.filter((item) => item.tenantId === tenantId).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))),
  listAllBeneficiaries: (tenantId: string) => mockRequest(() => occurrenceBeneficiaries.filter((item) => item.tenantId === tenantId)),
  /** Lecture pure du lien technique demande↔bénéficiaires (cf. `OccurrenceBeneficiaryPermutation`) — utilisée par l'écran de planification pour signaler une permutation déjà en cours sur une occurrence, sans dupliquer l'état déjà porté par `WorkflowRequest.status`. */
  listBeneficiaryPermutations: (tenantId: string) => mockRequest(() => occurrenceBeneficiaryPermutations.filter((item) => item.tenantId === tenantId)),
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
   * Crée l'Occurrence (mandat « suppression complète de la logique Cycle/Tour ») —
   * plus de Turn intermédiaire créé en parallèle : les bénéficiaires se rattachent
   * directement à `occurrence.id`. Refuse un `occurrenceNumber` déjà utilisé dans
   * la période (contrainte déjà documentée dans le dictionnaire canonique).
   * Création unitaire manuelle — pour générer plusieurs occurrences d'un coup à
   * partir de la fréquence de la Tontine, voir `generateOccurrences` ci-dessous
   * (mandat fréquence) ; les deux chemins restent disponibles côté UI (création
   * manuelle jamais retirée, §25).
   */
  createOccurrence: (tenantId: string, input: OccurrenceInput) =>
    mockRequest(() => {
      const period = getTenantScoped(tontinePeriods, (item) => item.id === input.periodId, tenantId);
      if (!period) return undefined;
      const duplicate = tontineOccurrences.some((item) => item.periodId === input.periodId && item.occurrenceNumber === input.occurrenceNumber);
      if (duplicate) return undefined;
      const occurrence: TontineOccurrence = { id: uniqueId('OCC'), tenantId, status: 'OPEN', actualDate: null, ...input };
      tontineOccurrences.push(occurrence);
      return occurrence;
    }),
  /**
   * Génère en une fois les Occurrences d'une Période à partir de la fréquence
   * configurée sur sa Tontine (mandat fréquence) — la périodicité est désormais
   * une décision métier fournie, contrairement au P1 (`GÉNÉRATION AUTOMATIQUE —
   * DÉCISION MÉTIER MANQUANTE`, obsolète). Refuse si la Tontine n'a pas de
   * fréquence configurée (`undefined`, pas d'erreur silencieuse). Numérote à la
   * suite des occurrences déjà présentes dans la Période (jamais de numérotation
   * globale Tontine, §26) et ignore toute date déjà occupée par une occurrence
   * existante — un second clic sur « Générer » ne crée donc jamais de doublon
   * (§25).
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
        created.push(occurrence);
        nextNumber += 1;
      }
      return created;
    }),

  /**
   * DÉTERMINATION DE L'ORDRE DE PASSAGE (mandat « Finalisation Finance/Tontines »,
   * priorité Tontines) — AUCUNE règle de rotation/tirage n'existait dans le modèle
   * avant ce mandat : `addBeneficiaries` se contente d'enregistrer un tirage déjà
   * réalisé hors TANZEN (RB-06/RB-07 ci-dessus). Faute de règle métier sourcée,
   * l'algorithme retenu ici — documenté, pas inventé arbitrairement — est un tour
   * de rôle déterministe par ORDRE D'ADHÉSION (rotation classique d'une tontine/
   * ROSCA, cohérente avec l'architecture existante) : au sein d'une Période,
   * l'Occurrence suivante attribue le bénéfice à l'adhésion active la plus
   * anciennement arrivée (`joinedAt` croissant, `id` en cas d'égalité stricte) qui
   * n'a PAS encore été bénéficiaire d'une Occurrence de CETTE Période. Une fois
   * toutes les adhésions actives servies, le tour est déclaré terminé
   * (`cycleComplete: true`) — aucune boucle automatique n'est appliquée, cohérent
   * avec `createPeriod`/`generateOccurrences` qui ne transitionnent jamais
   * automatiquement une période (une nouvelle « tournée » = une nouvelle Période,
   * mécanisme déjà existant, pas réinventé ici).
   *
   * Une adhésion inactive à la date de référence (membre suspendu/sorti) est
   * exclue du calcul ; un membre qui rejoint en cours de période entre dans le
   * calcul dès que son adhésion devient active à cette date (aucune règle
   * supplémentaire nécessaire : `isAdhesionActiveAt`, déjà utilisée partout
   * ailleurs dans ce fichier, gère les deux cas identiquement). Une Occurrence
   * déjà pourvue d'un bénéficiaire n'est pas reproposée (elle a déjà retiré son
   * adhésion du pool via `alreadyServedAdhesionIds`) ; une Occurrence CLOSED n'a
   * de toute façon plus vocation à recevoir de nouveau bénéficiaire
   * (`addBeneficiaries` le refuse déjà).
   *
   * Suggestion pure, jamais assignée automatiquement : reste un simple pré-remplissage
   * proposé à l'écran, la décision finale passant toujours par `addBeneficiaries`
   * (qui accepte n'importe quelle adhésion valide, y compris différente de la
   * suggestion — un gestionnaire garde la main en cas de situation particulière).
   */
  suggestNextBeneficiary: (tenantId: string, occurrenceId: string) =>
    mockRequest((): { adhesionId: string; memberName: string; cycleComplete: false } | { cycleComplete: true } | undefined => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence) return undefined;
      const period = getTenantScoped(tontinePeriods, (item) => item.id === occurrence.periodId, tenantId);
      if (!period) return undefined;
      const referenceDate = occurrence.actualDate ?? occurrence.plannedDate;

      const periodOccurrenceIds = new Set(
        tontineOccurrences.filter((item) => item.tenantId === tenantId && item.periodId === period.id).map((item) => item.id),
      );
      const alreadyServedAdhesionIds = new Set(
        occurrenceBeneficiaries
          .filter((item) => item.tenantId === tenantId && periodOccurrenceIds.has(item.tontineOccurrenceId))
          .map((item) => item.adhesionId),
      );

      const remaining = tontineAdhesions
        .filter((item) => item.tenantId === tenantId && item.periodId === period.id)
        .filter((item) => isAdhesionActiveAt(item, referenceDate))
        .filter((item) => !alreadyServedAdhesionIds.has(item.id))
        .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));

      if (remaining.length === 0) return { cycleComplete: true };
      const next = remaining[0];
      return { adhesionId: next.id, memberName: next.memberName, cycleComplete: false };
    }),

  /**
   * Vue d'ensemble de l'ordre de passage d'une Période (mandat « Finalisation
   * Finance/Tontines ») — toutes les adhésions de la Période, dans l'ordre de
   * rotation (même tri que `suggestNextBeneficiary`), avec le numéro
   * d'Occurrence qui les a déjà servies (`null` = pas encore passée). Lecture
   * pure, aucune mutation — dérivée à 100% des adhésions/occurrences/bénéficiaires
   * déjà existants.
   */
  listRotationOrder: (tenantId: string, periodId: string) =>
    mockRequest(() => {
      const period = getTenantScoped(tontinePeriods, (item) => item.id === periodId, tenantId);
      if (!period) return [];
      const adhesions = tontineAdhesions
        .filter((item) => item.tenantId === tenantId && item.periodId === periodId)
        .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
      const occurrences = tontineOccurrences.filter((item) => item.tenantId === tenantId && item.periodId === periodId);
      const servedAt = new Map<string, number>();
      for (const occurrence of occurrences) {
        for (const beneficiary of occurrenceBeneficiaries.filter((item) => item.tontineOccurrenceId === occurrence.id)) {
          if (!servedAt.has(beneficiary.adhesionId)) servedAt.set(beneficiary.adhesionId, occurrence.occurrenceNumber);
        }
      }
      return adhesions.map((adhesion) => ({
        adhesionId: adhesion.id,
        memberName: adhesion.memberName,
        joinedAt: adhesion.joinedAt,
        active: adhesion.status === 'active',
        servedOccurrenceNumber: servedAt.get(adhesion.id) ?? null,
      }));
    }),

  /** 1..N bénéficiaires par Occurrence (D-TON-04-19, confirmé) — jamais un champ unique. */
  listBeneficiariesByOccurrence: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence) return [];
      return occurrenceBeneficiaries
        .filter((item) => item.tontineOccurrenceId === occurrence.id)
        .map((item) => ({ ...item, receivedTotal: computeReceivedTotal(item.operations), purchaseTotal: computePurchaseTotal(item.operations), status: computeBeneficiaryStatus(item) }));
    }),
  getBeneficiary: (tenantId: string, beneficiaryId: string) =>
    mockRequest(() => {
      const beneficiary = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
      if (!beneficiary) return undefined;
      return { ...beneficiary, receivedTotal: computeReceivedTotal(beneficiary.operations), purchaseTotal: computePurchaseTotal(beneficiary.operations), status: computeBeneficiaryStatus(beneficiary) };
    }),
  /**
   * Enregistre le résultat d'un tirage MANUEL déjà réalisé hors TANZEN (RB-06/RB-07) —
   * ne choisit, ne calcule ni ne propose jamais lui-même un bénéficiaire.
   *
   * RB-01/RB-02/RB-03 : une adhésion n'est acceptée que si elle appartient à LA MÊME
   * Période que l'Occurrence (donc à la même Tontine, par construction de la chaîne
   * Adhesion→Période→Tontine) — même contrainte déjà appliquée par `createContribution`
   * ci-dessus, réutilisée telle quelle (pas une règle nouvelle). Réutilise également
   * `isAdhesionActiveAt` (même fonction que pour les Contributions, RB-10 : aucune
   * nouvelle règle d'éligibilité inventée).
   *
   * RB-08/RB-09 : aucune vérification "déjà bénéficiaire d'une autre tontine" ni "déjà
   * bénéficiaire par le passé dans cette tontine" — ce ne sont pas des règles sourcées,
   * volontairement non ajoutées. Seul un doublon strict est empêché : la même adhésion
   * deux fois dans le même appel, ou une adhésion déjà bénéficiaire de CETTE occurrence
   * précise.
   *
   * Refuse (retourne undefined) si l'Occurrence est CLOSED — même immuabilité que
   * `recordReception`.
   * Une adhésion invalide/hors tontine/déjà présente est silencieusement ignorée plutôt
   * que de faire échouer tout le lot (même convention que `createAdhesionsForPeriod`) ;
   * `skippedAdhesionIds` permet à l'UI d'en informer précisément l'utilisateur.
   */
  addBeneficiaries: (tenantId: string, occurrenceId: string, input: BeneficiaryInput) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence) return undefined;
      if (occurrence.status === 'CLOSED') return undefined;
      const referenceDate = occurrence.actualDate ?? occurrence.plannedDate;
      const alreadyAdhesionIds = new Set(occurrenceBeneficiaries.filter((item) => item.tontineOccurrenceId === occurrenceId).map((item) => item.adhesionId));
      const created: OccurrenceBeneficiary[] = [];
      const skippedAdhesionIds: string[] = [];
      const seenThisCall = new Set<string>();
      for (const adhesionId of input.adhesionIds) {
        if (seenThisCall.has(adhesionId) || alreadyAdhesionIds.has(adhesionId)) { skippedAdhesionIds.push(adhesionId); continue; }
        const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
        if (!adhesion || adhesion.periodId !== occurrence.periodId || !isAdhesionActiveAt(adhesion, referenceDate)) { skippedAdhesionIds.push(adhesionId); continue; }
        seenThisCall.add(adhesionId);
        const beneficiary: OccurrenceBeneficiary = { id: uniqueId('TB'), tenantId, tontineOccurrenceId: occurrenceId, adhesionId, valueType: input.valueType, expectedAmount: input.expectedAmount, expectedQuantity: input.expectedQuantity, item: input.item, operations: [] };
        occurrenceBeneficiaries.push(beneficiary);
        alreadyAdhesionIds.add(adhesionId);
        created.push(beneficiary);
      }
      return { created, skippedAdhesionIds };
    }),

  /**
   * Retrait d'un bénéficiaire désigné par erreur (mandat « Gestion des
   * opérations » §18) — jamais une suppression physique aveugle : refusé
   * dès qu'une opération (réception/correction/régularisation) existe déjà
   * sur ce bénéficiaire, ou que son Occurrence est CLOSED. Si aucune
   * opération n'a jamais été enregistrée, il n'y a aucun historique
   * financier à perdre — la ligne peut alors être retirée sans violer
   * l'immuabilité déjà appliquée à `recordReception`/etc. Pour défaire un
   * bénéficiaire qui a déjà reçu quelque chose, la seule voie reste la
   * permutation (`requestBeneficiaryPermutation`), jamais ce retrait direct.
   */
  removeBeneficiary: (tenantId: string, beneficiaryId: string) =>
    mockRequest(() => {
      const beneficiary = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
      if (!beneficiary) return undefined;
      const occurrence = tontineOccurrences.find((item) => item.id === beneficiary.tontineOccurrenceId);
      if (!occurrence || occurrence.status === 'CLOSED') return undefined;
      if (beneficiary.operations.length > 0) return undefined;
      const index = occurrenceBeneficiaries.findIndex((item) => item.id === beneficiaryId);
      occurrenceBeneficiaries.splice(index, 1);
      return { removed: true } as const;
    }),

  /**
   * Historique des permutations d'un bénéficiaire (mandat §16/§Q1 : « distinguer/
   * historiser » les différentes occurrences qu'une adhésion a occupées). Dérivé, jamais
   * stocké séparément — chaque `AuditEvent` `tontines.beneficiaryPermutationApplied` écrit
   * par `applyBeneficiaryPermutationDecision` porte déjà avant/après ; ce lecteur les
   * retrouve pour une adhésion donnée (des deux côtés d'un échange, `context.otherAdhesionId`).
   */
  listPermutationHistoryForAdhesion: (tenantId: string, adhesionId: string) =>
    mockRequest(() =>
      auditEvents
        .filter((event) => event.tenantId === tenantId && event.module === 'tontines' && event.action === 'tontines.beneficiaryPermutationApplied' && (event.context?.adhesionId === adhesionId || event.context?.otherAdhesionId === adhesionId))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    ),

  /**
   * Crée une `WorkflowRequest` (domaine `tontines`, `WD-006`) via le moteur générique —
   * ne modifie RIEN dans `occurrenceBeneficiaries` avant approbation effective (mandat
   * §9-10 : la permutation ne devient effective qu'après validation). `beneficiaryAId`/
   * `beneficiaryBId` désignent directement les deux `OccurrenceBeneficiary` à échanger —
   * jamais un couple occurrence/adhésion : une occurrence peut porter plusieurs
   * bénéficiaires (D-TON-04-19), seul l'id du bénéficiaire lève l'ambiguïté.
   *
   * Refuse (retourne `undefined`) si : même bénéficiaire des deux côtés, bénéficiaire
   * introuvable/autre tenant, les deux bénéficiaires appartiennent déjà à la même
   * occurrence, l'une des deux occurrences est CLOSED (même immuabilité que
   * `recordReception`/`addBeneficiaries`), les deux occurrences n'appartiennent pas à la
   * MÊME tontine (aucune permutation inter-tontine — jamais demandée par le mandat,
   * mélanger deux tontines serait un mélange de fonds distincts), ou une permutation déjà
   * `pending`/`inProgress` référence déjà l'un des deux bénéficiaires (§17, TEST 14 : deux
   * demandes concurrentes incompatibles).
   */
  requestBeneficiaryPermutation: async (tenantId: string, input: BeneficiaryPermutationInput): Promise<WorkflowRequest | undefined> => {
    if (input.beneficiaryAId === input.beneficiaryBId) return undefined;
    const beneficiaryA = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === input.beneficiaryAId, tenantId);
    const beneficiaryB = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === input.beneficiaryBId, tenantId);
    if (!beneficiaryA || !beneficiaryB || beneficiaryA.tontineOccurrenceId === beneficiaryB.tontineOccurrenceId) return undefined;
    const occurrenceA = getTenantScoped(tontineOccurrences, (item) => item.id === beneficiaryA.tontineOccurrenceId, tenantId);
    const occurrenceB = getTenantScoped(tontineOccurrences, (item) => item.id === beneficiaryB.tontineOccurrenceId, tenantId);
    if (!occurrenceA || !occurrenceB || occurrenceA.status === 'CLOSED' || occurrenceB.status === 'CLOSED') return undefined;
    const periodA = getTenantScoped(tontinePeriods, (item) => item.id === occurrenceA.periodId, tenantId);
    const periodB = getTenantScoped(tontinePeriods, (item) => item.id === occurrenceB.periodId, tenantId);
    if (!periodA || !periodB || periodA.tontineId !== periodB.tontineId) return undefined;
    const conflicting = occurrenceBeneficiaryPermutations.some((permutation) => {
      if (permutation.tenantId !== tenantId) return false;
      if (permutation.beneficiaryAId !== input.beneficiaryAId && permutation.beneficiaryAId !== input.beneficiaryBId && permutation.beneficiaryBId !== input.beneficiaryAId && permutation.beneficiaryBId !== input.beneficiaryBId) return false;
      const existingRequest = workflowRequests.find((item) => item.id === permutation.workflowRequestId);
      return Boolean(existingRequest && (existingRequest.status === 'pending' || existingRequest.status === 'inProgress'));
    });
    if (conflicting) return undefined;

    const adhesionA = getTenantScoped(tontineAdhesions, (item) => item.id === beneficiaryA.adhesionId, tenantId);
    const adhesionB = getTenantScoped(tontineAdhesions, (item) => item.id === beneficiaryB.adhesionId, tenantId);
    const entityLabel = `Occurrence ${occurrenceA.occurrenceNumber} · ${adhesionA?.memberName ?? beneficiaryA.adhesionId} ↔ Occurrence ${occurrenceB.occurrenceNumber} · ${adhesionB?.memberName ?? beneficiaryB.adhesionId}`;
    const permutationId = uniqueId('BPM');
    const request = await workflowService.createRequest(tenantId, 'WD-006', { entityId: permutationId, entityLabel, requestedBy: input.requestedBy, requestedByUserId: input.requestedByUserId, justification: input.justification });
    if (!request) return undefined;
    const permutation: OccurrenceBeneficiaryPermutation = { id: permutationId, tenantId, workflowRequestId: request.id, beneficiaryAId: input.beneficiaryAId, beneficiaryBId: input.beneficiaryBId, appliedAt: null };
    occurrenceBeneficiaryPermutations.push(permutation);
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
   * Échange atomique (mandat §13) : les deux `OccurrenceBeneficiary.adhesionId` sont permutés
   * dans le même appel synchrone — aucun état intermédiaire n'est jamais observable (le
   * moteur mock est mono-thread, comme `applyFiscalYearReopenDecision`). N'applique rien
   * (silencieusement, même tolérance que `applyFiscalYearReopenDecision` pour une FiscalYear
   * déjà rouverte entretemps) si l'une des deux Occurrences est devenue CLOSED, ou si l'un
   * des deux bénéficiaires a déjà une réception enregistrée depuis la demande — permuter
   * après coup réattribuerait un historique financier déjà réel à la mauvaise personne
   * (règle non demandée explicitement par le mandat mais directement dictée par l'intégrité
   * des données, cf. immuabilité déjà appliquée à `recordReception` etc.).
   */
  applyBeneficiaryPermutationDecision: (tenantId: string, request: WorkflowRequest) => {
    if (request.domain !== 'tontines' || request.entityType !== 'beneficiaryPermutation' || request.status !== 'approved') return;
    const permutation = occurrenceBeneficiaryPermutations.find((item) => item.tenantId === tenantId && item.workflowRequestId === request.id);
    if (!permutation || permutation.appliedAt) return;
    const beneficiaryA = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === permutation.beneficiaryAId, tenantId);
    const beneficiaryB = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === permutation.beneficiaryBId, tenantId);
    if (!beneficiaryA || !beneficiaryB || beneficiaryA.operations.length > 0 || beneficiaryB.operations.length > 0) return;
    const occurrenceA = getTenantScoped(tontineOccurrences, (item) => item.id === beneficiaryA.tontineOccurrenceId, tenantId);
    const occurrenceB = getTenantScoped(tontineOccurrences, (item) => item.id === beneficiaryB.tontineOccurrenceId, tenantId);
    if (!occurrenceA || !occurrenceB || occurrenceA.status === 'CLOSED' || occurrenceB.status === 'CLOSED') return;
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
      module: 'tontines', action: 'tontines.beneficiaryPermutationApplied', eventType: 'sensitiveAction',
      resourceType: 'occurrenceBeneficiary', resourceId: permutation.id, resourceLabel: request.entityLabel, status: 'success', sensitive: true, correlationId: permutation.id,
      before: { [`occurrence${occurrenceA.occurrenceNumber}`]: memberNameA, [`occurrence${occurrenceB.occurrenceNumber}`]: memberNameB },
      after: { [`occurrence${occurrenceA.occurrenceNumber}`]: memberNameB, [`occurrence${occurrenceB.occurrenceNumber}`]: memberNameA },
      context: { adhesionId: adhesionIdA, otherAdhesionId: adhesionIdB, beneficiaryAId: beneficiaryA.id, beneficiaryBId: beneficiaryB.id },
    };
    auditEvents.push(event);
  },

  /**
   * Lecture de composition pure (aucune mutation) — reconstruit les deux côtés d'une
   * permutation (occurrence, adhérent, photo) à partir du seul `workflowRequestId`, pour
   * que l'écran générique `WorkflowDetail` (`operations-module.tsx`, cross-domaine
   * Credit/Governance/Finance/Settings/Tontines) puisse afficher les photos des deux
   * bénéficiaires (mandat §9 « validation de permutation ») sans dupliquer la traversée
   * Occurrence→OccurrenceBeneficiary→Adhesion→Member déjà utilisée partout ailleurs dans ce
   * fichier.
   */
  getBeneficiaryPermutationPreview: (tenantId: string, workflowRequestId: string) =>
    mockRequest(() => {
      const permutation = occurrenceBeneficiaryPermutations.find((item) => item.tenantId === tenantId && item.workflowRequestId === workflowRequestId);
      if (!permutation) return undefined;
      const side = (beneficiaryId: string) => {
        const beneficiary = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
        if (!beneficiary) return undefined;
        const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === beneficiary.tontineOccurrenceId, tenantId);
        const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === beneficiary.adhesionId, tenantId);
        const member = adhesion ? getTenantScoped(members, (item) => item.id === adhesion.memberId, tenantId) : undefined;
        return { occurrenceId: beneficiary.tontineOccurrenceId, occurrenceNumber: occurrence?.occurrenceNumber, memberName: adhesion?.memberName ?? beneficiary.adhesionId, photoUrl: member?.photoUrl };
      };
      const a = side(permutation.beneficiaryAId);
      const b = side(permutation.beneficiaryBId);
      if (!a || !b) return undefined;
      return { a, b };
    }),

  listContributionsByOccurrence: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => tontineContributions.filter((item) => item.tenantId === tenantId && item.tontineOccurrenceId === occurrenceId)),
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
      // Mandat « intégration Tontine ↔ Finance » (objectif majeur) : Cotisation → Transaction → Compte.
      if (contribution.valueType === 'MONEY') {
        const adhesion = tontineAdhesions.find((item) => item.tenantId === tenantId && item.id === contribution.adhesionId);
        const account = adhesion && resolveTontineAccount(tenantId, adhesion.periodId);
        const tontine = adhesion && tontines.find((item) => item.id === tontinePeriods.find((p) => p.id === adhesion.periodId)?.tontineId);
        if (adhesion && account) {
          postTontineTransaction(tenantId, {
            account, memberId: adhesion.memberId, memberName: adhesion.memberName, amount: operation.amount, direction: 'credit', category: 'EPARGNE',
            description: `Cotisation tontine ${tontine?.name ?? ''} — occurrence ${contribution.tontineOccurrenceId}`.trim(),
          });
        }
      }
      return contribution;
    }),

  /** Nouvelle réception — une opération, jamais un remplacement (D-TON-04-21, D-TON-06-09/-11/-12 : "une réception ne remplace jamais une précédente"). Refuse si l'Occurrence est CLOSED (immuabilité, D-TON-06-16). */
  recordReception: (tenantId: string, beneficiaryId: string, input: ReceptionInput) =>
    mockRequest(() => {
      const beneficiary = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
      if (!beneficiary) return undefined;
      const occurrence = tontineOccurrences.find((item) => item.id === beneficiary.tontineOccurrenceId);
      if (!occurrence || occurrence.status === 'CLOSED') return undefined;
      appendOperation(beneficiary, { id: uniqueId('OP'), type: 'reception', amount: input.amount, quantity: input.quantity, purchaseAmount: input.purchaseAmount, date: new Date().toISOString().slice(0, 10), actorId: currentUser.id, actorName: currentUser.name, reason: null });
      // Mandat « intégration Tontine ↔ Finance » (objectif majeur) : Réception → Transaction → Compte bénéficiaire.
      if (beneficiary.valueType === 'MONEY') {
        const adhesion = tontineAdhesions.find((item) => item.tenantId === tenantId && item.id === beneficiary.adhesionId);
        const account = adhesion && resolveTontineAccount(tenantId, adhesion.periodId);
        const tontine = adhesion && tontines.find((item) => item.id === tontinePeriods.find((p) => p.id === adhesion.periodId)?.tontineId);
        if (adhesion && account) {
          postTontineTransaction(tenantId, {
            account, memberId: adhesion.memberId, memberName: adhesion.memberName, amount: input.amount, direction: 'debit', category: 'AUTRES', subcategory: 'DISTRIBUTION',
            description: `Réception tontine ${tontine?.name ?? ''} — occurrence ${occurrence.occurrenceNumber}`.trim(),
          });
        }
        /**
         * RÈGLE FINANCIÈRE CRITIQUE (mandat « Avec achat ») : le montant D'ACHAT, et lui
         * seul, va dans la caisse « Achat tontine » — jamais le montant de réception « net »
         * posté juste au-dessus (chemin `accountId`/`resolveTontineAccount`, totalement
         * distinct, inchangé). `purchaseAccountId` n'est renseigné QUE si la tontine est
         * « Avec achat » (cf. `tontines.service.ts`) : pas d'association ⇒ pas de compte
         * résolu ⇒ pas de transaction, sans condition supplémentaire à dupliquer ici.
         */
        const purchaseAccount = adhesion && resolveTontinePurchaseAccount(tenantId, adhesion.periodId);
        if (adhesion && purchaseAccount) {
          postTontineTransaction(tenantId, {
            account: purchaseAccount, memberId: adhesion.memberId, memberName: adhesion.memberName, amount: input.purchaseAmount, direction: 'credit', category: 'AUTRES', subcategory: 'AUTRE',
            description: `Achat tontine ${tontine?.name ?? ''} — occurrence ${occurrence.occurrenceNumber}`.trim(),
          });
        }
      }
      return { ...beneficiary, receivedTotal: computeReceivedTotal(beneficiary.operations), purchaseTotal: computePurchaseTotal(beneficiary.operations), status: computeBeneficiaryStatus(beneficiary) };
    }),

  /**
   * Synthèse financière d'une Occurrence (mandat « Gestion des opérations ») —
   * dérivée à 100% de données déjà existantes, aucun solde n'est stocké nulle
   * part pour une Tontine (contrairement à `Account.balance`, domaine
   * Finance, sans rapport). `totalCollected` = somme des cotisations déjà
   * réglées sur cette Occurrence (`TontineContribution.paidAmount`, MONEY
   * uniquement — une tontine GOODS n'a pas de « disponible » financier à
   * calculer, §14 du mandat) ; `totalNet`/`totalPurchases` = sommes déjà
   * attribuées aux bénéficiaires de cette Occurrence. `available` est ce qui
   * reste dans la cagnotte de la séance après ces attributions — jamais un
   * calcul inventé, seulement une soustraction de valeurs déjà correctement
   * calculées ailleurs (`computeReceivedTotal`/`computePurchaseTotal`).
   */
  getOccurrenceFinancialSummary: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence) return undefined;
      const contributions = tontineContributions.filter((item) => item.tenantId === tenantId && item.tontineOccurrenceId === occurrence.id);
      const totalCollected = contributions.filter((item) => item.valueType === 'MONEY').reduce((sum, item) => sum + item.paidAmount, 0);
      const beneficiaries = occurrenceBeneficiaries.filter((item) => item.tenantId === tenantId && item.tontineOccurrenceId === occurrenceId);
      const totalNet = beneficiaries.reduce((sum, item) => sum + computeReceivedTotal(item.operations), 0);
      const totalPurchases = beneficiaries.reduce((sum, item) => sum + computePurchaseTotal(item.operations), 0);
      return { totalCollected, totalNet, totalPurchases, available: totalCollected - totalNet - totalPurchases };
    }),

  /**
   * Clôture d'une Occurrence (mandat « suppression complète de la logique
   * Cycle/Tour » §10 : `closeOccurrence()` directe, plus de `closeTurn()`
   * intermédiaire). Précondition inchangée (D-TON-06-09/-13) : tous les
   * bénéficiaires de l'Occurrence doivent être RECEIVED. actual_date requise
   * à la clôture. Ne clôture jamais automatiquement le Cycle — le modèle
   * Cycle n'existe plus dans le module Tontine (D-TON-06-10, obsolète).
   */
  closeOccurrence: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence || occurrence.status === 'CLOSED') return undefined;
      if (!allBeneficiariesReceived(occurrence.id)) return undefined;
      occurrence.status = 'CLOSED';
      occurrence.actualDate = occurrence.actualDate ?? new Date().toISOString().slice(0, 10);
      return occurrence;
    }),
};

export type { TontineAdhesion, TontineOccurrence, OccurrenceBeneficiary, TontineContribution };
