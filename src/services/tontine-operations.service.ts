import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { currentUser } from '@/mocks/rbac.mocks';
import {
  tontines, tontineAdhesions, tontineOccurrences, occurrenceBeneficiaries,
  tontineBeneficiaryPlans, tontineRemainders, tontineContributions, tontineCycles, isAdhesionActiveAt,
  type TontineOccurrence, type TontineAdhesion, type OccurrenceBeneficiary, type TontineBeneficiaryPlan, type TontineRemainder, type TontineContribution, type TontineCycle,
} from '@/mocks/tontines/tontines';
import { auditEvents, type AuditEvent } from '@/mocks/audit/audit-events';
import { workflowRequests, type WorkflowRequest } from '@/mocks/operations/workflow-requests';
import { workflowService } from './workflow.service';
import { insertTransaction, resolveSystemAccount } from './finance.service';
import { accounts, type AccountRecord } from '@/mocks/finance/accounts';
import { members } from '@/mocks/organization/members';

export type PlanPermutationInput = { planAId: string; planBId: string; requestedBy: string; requestedByUserId?: string; justification?: string };

/**
 * Statut d'un bénéficiaire — dérivé EXCLUSIVEMENT de `amountDue`/`amountPaid`,
 * jamais un champ stocké séparément ni modifiable directement par
 * l'utilisateur (mandat « finalisation » §19). Fonction UNIQUE et
 * centralisée — jamais dupliquée dans un composant UI.
 */
export type BeneficiaryPaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';
export function getBeneficiaryPaymentStatus(beneficiary: { amountDue: number; amountPaid: number }): BeneficiaryPaymentStatus {
  if (beneficiary.amountPaid >= beneficiary.amountDue && beneficiary.amountDue > 0) return 'PAID';
  if (beneficiary.amountPaid > 0) return 'PARTIAL';
  return 'PENDING';
}

/** Identifiant technique reliant une `WorkflowRequest` de permutation aux deux `TontineBeneficiaryPlan` échangés. */
type PlanPermutation = { id: string; tenantId: string; workflowRequestId: string; planAId: string; planBId: string; appliedAt: string | null };
const tontinePlanPermutations: PlanPermutation[] = [];

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Cycle système courant (« OPEN ») d'une Tontine — un seul à la fois (mandat
 * « recommencement automatique »). `undefined` uniquement si la Tontine
 * elle-même n'existe pas/hors tenant, ou pour une donnée corrompue sans
 * aucun cycle courant (ne devrait jamais arriver : `tontinesService.
 * createTontine` en crée toujours un).
 */
function getCurrentCycle(tenantId: string, tontineId: string): TontineCycle | undefined {
  return tontineCycles.find((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.status === 'OPEN');
}

/**
 * Participations ÉLIGIBLES pour le calcul de fin de cycle — mêmes critères
 * que le reste du module (ex. `AdhesionsPanel`/`addPlanEntry`) : les
 * adhésions actuellement `active` de CETTE Tontine, jamais celles déjà
 * sorties (`exited`). Raisonne exclusivement par `adhesionId`, jamais
 * `memberId` (mandat §2 : plusieurs représentations d'un même membre sont
 * autant de participations distinctes).
 */
function getEligibleAdhesionIds(tenantId: string, tontineId: string): string[] {
  return tontineAdhesions.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.status === 'active').map((item) => item.id);
}

/**
 * `adhesionId` déjà DÉSIGNÉ bénéficiaire d'un Tour DANS le cycle donné —
 * dérivé des `OccurrenceBeneficiary` déjà existants (simple présence de la
 * ligne), aucune nouvelle donnée de stockage. Sert UNIQUEMENT la règle
 * structurelle « une participation n'occupe jamais deux désignations dans le
 * même cycle » (`hasAlreadyBenefitedInCurrentCycle`) — PAS la détermination
 * de fin de cycle, qui exige le bénéfice RÉALISÉ (cf.
 * `getRealizedBeneficiaryAdhesionIdsInCycle`, audit ciblé du 2026-09-18 :
 * une désignation seule, `amountPaid` encore à 0, n'est jamais un bénéfice
 * consommé).
 */
function getBeneficiaryAdhesionIdsInCycle(tenantId: string, tontineId: string, cycleId: string): Set<string> {
  const cycleOccurrenceIds = new Set(tontineOccurrences.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.cycleId === cycleId).map((item) => item.id));
  return new Set(occurrenceBeneficiaries.filter((item) => item.tenantId === tenantId && cycleOccurrenceIds.has(item.occurrenceId)).map((item) => item.adhesionId));
}

/**
 * `adhesionId` ayant RÉELLEMENT bénéficié — c'est-à-dire réglé
 * intégralement (`getBeneficiaryPaymentStatus(...) === 'PAID'`, la SEULE
 * fonction déjà existante et centralisée du projet qui détermine la
 * réalisation d'un bénéfice, réutilisée ici jamais dupliquée/redéfinie) —
 * dans le cycle donné. Une désignation encore `PENDING` (`amountPaid === 0`)
 * ou `PARTIAL` (`0 < amountPaid < amountDue`) ne compte JAMAIS ici : c'est
 * précisément la distinction que `closeOccurrence` applique déjà pour
 * clôturer un Tour (exige `amountPaid >= amountDue` pour CHAQUE
 * bénéficiaire) et que `removeOccurrenceBeneficiary` applique déjà pour
 * autoriser un retrait (`amountPaid === 0` uniquement, sinon immuable) —
 * cette fonction ne fait qu'appliquer la MÊME règle déjà établie ailleurs
 * dans ce module à l'échelle du cycle.
 */
function getRealizedBeneficiaryAdhesionIdsInCycle(tenantId: string, tontineId: string, cycleId: string): Set<string> {
  const cycleOccurrenceIds = new Set(tontineOccurrences.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.cycleId === cycleId).map((item) => item.id));
  return new Set(
    occurrenceBeneficiaries
      .filter((item) => item.tenantId === tenantId && cycleOccurrenceIds.has(item.occurrenceId) && getBeneficiaryPaymentStatus(item) === 'PAID')
      .map((item) => item.adhesionId),
  );
}

/**
 * Règle structurelle — une participation (`adhesionId`) n'occupe jamais
 * DEUX désignations de bénéficiaire dans le même cycle courant, RÉGLÉE ou
 * non (mandat « recommencement automatique » §14). Volontairement basée sur
 * la simple DÉSIGNATION (`getBeneficiaryAdhesionIdsInCycle`), jamais sur la
 * réalisation : deux lignes `OccurrenceBeneficiary` simultanées pour la même
 * participation dans le même cycle seraient de toute façon incohérentes
 * (quel Tour porte le « vrai » bénéfice ?), qu'elles soient payées ou non —
 * distinct de `isCycleComplete`, qui lui exige la réalisation. Vérifiée
 * AVANT toute création de bénéficiaire (AVEC-ACHAT comme SANS-ACHAT),
 * jamais uniquement côté UI.
 */
function hasAlreadyBenefitedInCurrentCycle(tenantId: string, tontineId: string, adhesionId: string): boolean {
  const cycle = getCurrentCycle(tenantId, tontineId);
  if (!cycle) return false;
  return getBeneficiaryAdhesionIdsInCycle(tenantId, tontineId, cycle.id).has(adhesionId);
}

/**
 * SANS ACHAT uniquement (mandat « sélection séquentielle des bénéficiaires »,
 * 2026-09-23) — une adhésion ne peut devenir bénéficiaire d'un Tour QUE si
 * elle a une position dans le Plan du cycle courant (`cyclePlans`, trié par
 * position), non déjà consommée, ET si TOUTES les positions de rang
 * INFÉRIEUR sont déjà consommées (bénéficiaires d'un Tour, quel qu'il soit —
 * `consumedByOccurrenceId`) ou déjà mises en file dans le même lot
 * (`queuedInBatch`, alimenté au fil du traitement de `addOccurrenceBeneficiaries`).
 * Jamais un saut de position (1→3 sans 2), jamais une vérification côté UI
 * seule — source de vérité identique à `ContributionsColumn`/`toggleSelectAdd`
 * côté client, ici imposée côté service.
 */
function sansAchatBeneficiaryEligible(cyclePlans: TontineBeneficiaryPlan[], adhesionId: string, queuedInBatch: Set<string>): boolean {
  const plan = cyclePlans.find((item) => item.adhesionId === adhesionId);
  if (!plan || plan.consumedByOccurrenceId) return false;
  return cyclePlans.filter((item) => item.position < plan.position).every((item) => Boolean(item.consumedByOccurrenceId) || queuedInBatch.has(item.adhesionId));
}

/**
 * Une planification ne regarde pas la date historique du Tour : elle regarde
 * les adhésions ACTIVES du cycle courant. Ainsi, une adhésion créée après la
 * création d'un Tour déjà planifié devient immédiatement sélectionnable,
 * sans toucher aux Tours/cycles déjà clos.
 */
function isAvailableForOccurrencePlanning(tenantId: string, occurrence: TontineOccurrence, adhesion: TontineAdhesion): boolean {
  const currentCycle = getCurrentCycle(tenantId, occurrence.tontineId);
  return adhesion.tontineId === occurrence.tontineId
    && adhesion.status === 'active'
    && currentCycle?.id === occurrence.cycleId
    && occurrence.status === 'PLANNED';
}

/**
 * Le cycle courant est terminé quand TOUTES les participations éligibles ont
 * RÉELLEMENT bénéficié — réglé intégralement, `getBeneficiaryPaymentStatus
 * === 'PAID'` — d'un Tour dans ce cycle (mandat §4, précisé par l'audit
 * ciblé du 2026-09-18 : une simple désignation `OccurrenceBeneficiary` avec
 * `amountPaid === 0`, ou un règlement partiel, ne clôt jamais le cycle) —
 * jamais après un nombre fixe de Tours (le nombre de Tours n'est jamais
 * prédéfini, §3), et jamais `false` par défaut sur une Tontine sans aucune
 * participation éligible (rien à distribuer ne peut jamais être « terminé »).
 */
export function isCycleComplete(tenantId: string, tontineId: string): boolean {
  const cycle = getCurrentCycle(tenantId, tontineId);
  if (!cycle) return false;
  const eligibleAdhesionIds = getEligibleAdhesionIds(tenantId, tontineId);
  if (eligibleAdhesionIds.length === 0) return false;
  const realizedAdhesionIds = getRealizedBeneficiaryAdhesionIdsInCycle(tenantId, tontineId, cycle.id);
  return eligibleAdhesionIds.every((id) => realizedAdhesionIds.has(id));
}

/**
 * Planification COMPLÈTE (mandat « onglet par défaut selon adhérents et
 * planification ») — TOUTES les participations éligibles (`adhesionId`
 * actives de cette Tontine, mêmes critères que `getEligibleAdhesionIds`,
 * jamais `memberId` seul : deux représentations d'un même membre sont deux
 * participations distinctes à planifier séparément) possèdent une position
 * dans la planification du cycle COURANT — jamais celle d'un cycle clos
 * (nouveau cycle sans planification propre ≠ planifié, même si l'ancien
 * cycle l'était intégralement). SEULE définition de « planification
 * complète » du projet — réutilisée telle quelle partout où ce besoin existe
 * (onglet par défaut ici), jamais redéfinie en parallèle.
 *
 * Sans objet pour une Tontine « Avec achat » (aucune planification n'existe
 * pour ce mode) : retourne toujours `false`, jamais utilisée pour ce cas par
 * l'appelant (l'onglet par défaut « Avec achat » ignore totalement la
 * planification).
 */
export function isPlanningComplete(tenantId: string, tontineId: string): boolean {
  const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
  if (!tontine || tontine.withPurchase) return false;
  const cycle = getCurrentCycle(tenantId, tontineId);
  if (!cycle) return false;
  const eligibleAdhesionIds = getEligibleAdhesionIds(tenantId, tontineId);
  if (eligibleAdhesionIds.length === 0) return false;
  const plannedAdhesionIds = new Set(
    tontineBeneficiaryPlans.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.cycleId === cycle.id).map((item) => item.adhesionId),
  );
  return eligibleAdhesionIds.every((id) => plannedAdhesionIds.has(id));
}

function resolveTontineAccount(tenantId: string, tontineId: string): AccountRecord | undefined {
  const tontine = tontines.find((item) => item.tenantId === tenantId && item.id === tontineId);
  if (!tontine?.accountId) return undefined;
  return accounts.find((account) => account.id === tontine.accountId && account.tenantId === tenantId);
}

/**
 * RÈGLE FINANCIÈRE CRITIQUE — distincte de `resolveTontineAccount` : seul le
 * montant d'ACHAT transite par cette caisse, jamais les cotisations/
 * réceptions « nettes ». `undefined` si `withPurchase` est faux (donc jamais
 * de `purchaseAccountId`, cf. `tontines.service.ts`).
 *
 * CORRECTIF (bug « Régler échoue dès que le montant d'achat > 0 ») —
 * `resolveWithPurchase` ne garantit `purchaseAccountId` que pour les
 * Tontines créées/modifiées via `tontinesService` ; un enregistrement
 * existant AVANT cette garantie (ex. seed historique tel que TON-004) peut
 * légitimement porter `withPurchase: true` sans `purchaseAccountId`. Avant
 * ce correctif, `recordReception` refusait alors TOUT règlement dès que
 * `purchaseAmount > 0` (jamais quand il valait 0, d'où le symptôme). On
 * répare ici la référence via le MÊME résolveur de compte système que
 * `resolveWithPurchase` (`resolveSystemAccount`, idempotent, jamais une
 * seconde caisse) — la caisse « Achat tontine » reste un compte système
 * dédié, jamais transformée en caisse générale de la Tontine.
 */
function resolveTontinePurchaseAccount(tenantId: string, tontineId: string): AccountRecord | undefined {
  const tontine = tontines.find((item) => item.tenantId === tenantId && item.id === tontineId);
  if (!tontine || tontine.valueType !== 'MONEY' || !tontine.withPurchase) return undefined;
  if (!tontine.purchaseAccountId) tontine.purchaseAccountId = resolveSystemAccount(tenantId, 'TONTINE_PURCHASE').id;
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
  // --- Classement des adhérents (toutes Tontines) — rattaché DIRECTEMENT à la Tontine ---

  /** Positions du cycle COURANT uniquement — les positions d'un ancien cycle (clos) restent en base pour l'historique mais ne polluent jamais la Planification affichée/actionnable (mandat « transparence du cycle »). */
  listPlans: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const cycle = getCurrentCycle(tenantId, tontineId);
      if (!cycle) return [];
      return tontineBeneficiaryPlans.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.cycleId === cycle.id).sort((a, b) => a.position - b.position);
    }),

  /** Ajoute la prochaine position du classement courant — SANS ACHAT uniquement : l'ordre de passage n'a de sens que si la Tontine en a un prédéfini. Une Tontine « Avec achat » refuse toute entrée de Plan (`withPurchase` → `undefined`), la détermination du bénéficiaire s'y fait via les règles d'achat, jamais un classement. */
  addPlanEntry: (tenantId: string, tontineId: string, adhesionId: string) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine || tontine.withPurchase) return undefined;
      const cycle = getCurrentCycle(tenantId, tontineId);
      if (!cycle) return undefined;
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
      if (!adhesion || adhesion.tontineId !== tontineId) return undefined;
      const existing = tontineBeneficiaryPlans.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.cycleId === cycle.id);
      if (existing.some((item) => item.adhesionId === adhesionId)) return undefined;
      const nextPosition = existing.reduce((max, item) => Math.max(max, item.position), 0) + 1;
      const plan: TontineBeneficiaryPlan = { id: uniqueId('PLN'), tenantId, tontineId, position: nextPosition, adhesionId, consumedByOccurrenceId: null, cycleId: cycle.id };
      tontineBeneficiaryPlans.push(plan);
      return plan;
    }),

  /**
   * Ajout multiple (refonte UX Planification — remplace l'ancien menu
   * déroulant un-adhérent-à-la-fois) — même validation unitaire que
   * `addPlanEntry` (adhésion hors Tontine ou
   * déjà planifiée ignorée), positions strictement croissantes et JAMAIS
   * dupliquées même au sein d'un même batch.
   *
   * `startPosition` (optionnel, mandat « attribution directe d'une
   * position » §9/§10) — position de départ de la première participation
   * ajoutée, les suivantes prenant les positions consécutives ; les
   * positions déjà occupées à partir de `startPosition` sont automatiquement
   * décalées vers le bas (jamais de doublon). Omis, ou `undefined` : ajout en
   * fin de liste (comportement historique, inchangé). Bornes valides :
   * [nombre de positions déjà CONSOMMÉES + 1, nombre total de positions + 1]
   * — jamais avant une position consommée (immuabilité du passé), jamais un
   * trou après la fin. Hors bornes ou non entier : lot entier refusé
   * (`skipped` = tout le lot) plutôt qu'une position invalide silencieusement
   * corrigée (mandat §7/§17 : l'intégrité ne repose jamais sur l'UI seule).
   */
  addPlanEntries: (tenantId: string, tontineId: string, adhesionIds: string[], startPosition?: number) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      // SANS ACHAT uniquement — même règle que `addPlanEntry` : une Tontine « Avec achat » refuse le lot entier (aucun ordre de passage prédéfini).
      if (!tontine || tontine.withPurchase) return { added: [] as TontineBeneficiaryPlan[], skipped: adhesionIds.length };
      const cycle = getCurrentCycle(tenantId, tontineId);
      if (!cycle) return { added: [] as TontineBeneficiaryPlan[], skipped: adhesionIds.length };
      const existing = tontineBeneficiaryPlans.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.cycleId === cycle.id);
      const minInsertable = existing.filter((item) => item.consumedByOccurrenceId).length + 1;
      const maxInsertable = existing.length + 1;
      if (startPosition !== undefined && (!Number.isInteger(startPosition) || startPosition < minInsertable || startPosition > maxInsertable)) {
        return { added: [] as TontineBeneficiaryPlan[], skipped: adhesionIds.length };
      }
      const insertAt = startPosition ?? maxInsertable;
      const plannedAdhesionIds = new Set(existing.map((item) => item.adhesionId));
      const toAdd: string[] = [];
      for (const adhesionId of adhesionIds) {
        const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
        if (!adhesion || adhesion.tontineId !== tontineId || plannedAdhesionIds.has(adhesionId)) continue;
        plannedAdhesionIds.add(adhesionId);
        toAdd.push(adhesionId);
      }
      if (toAdd.length === 0) return { added: [] as TontineBeneficiaryPlan[], skipped: adhesionIds.length };
      existing.filter((item) => item.position >= insertAt).forEach((item) => { item.position += toAdd.length; });
      const added = toAdd.map((adhesionId, index) => {
        const plan: TontineBeneficiaryPlan = { id: uniqueId('PLN'), tenantId, tontineId, position: insertAt + index, adhesionId, consumedByOccurrenceId: null, cycleId: cycle.id };
        tontineBeneficiaryPlans.push(plan);
        return plan;
      });
      return { added, skipped: adhesionIds.length - toAdd.length };
    }),

  /**
   * Attribution DIRECTE d'une position (refonte UX §3-§7 — remplace le
   * glisser-déposer) — décale automatiquement les positions intermédiaires
   * pour que la séquence reste 1..N sans trou ni doublon, en UNE SEULE
   * opération cohérente (jamais d'aller-retour réseau par position
   * intermédiaire, mandat §16/§18). Opère UNIQUEMENT sur les positions NON
   * consommées du cycle courant (immuabilité du passé inchangée, mêmes
   * garanties que `removePlanEntry`) et sur `adhesionId` (jamais `memberId`).
   *
   * `targetPosition` hors de l'intervalle des positions réordonnables
   * [plus petite position non consommée, plus grande position du cycle], ou
   * non entier : refus propre (`undefined`), jamais de position invalide
   * créée — l'UI ne peut pas se reposer sur une correction silencieuse.
   */
  setPlanPosition: (tenantId: string, tontineId: string, planId: string, targetPosition: number) =>
    mockRequest(() => {
      if (!Number.isInteger(targetPosition)) return undefined;
      const plan = getTenantScoped(tontineBeneficiaryPlans, (item) => item.id === planId, tenantId);
      if (!plan || plan.tontineId !== tontineId || plan.consumedByOccurrenceId) return undefined;
      const cycle = getCurrentCycle(tenantId, tontineId);
      if (!cycle || plan.cycleId !== cycle.id) return undefined;
      const reorderable = tontineBeneficiaryPlans.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.cycleId === cycle.id && !item.consumedByOccurrenceId);
      const minPosition = Math.min(...reorderable.map((item) => item.position));
      const maxPosition = Math.max(...reorderable.map((item) => item.position));
      if (targetPosition < minPosition || targetPosition > maxPosition) return undefined;
      if (targetPosition !== plan.position) {
        if (targetPosition < plan.position) reorderable.filter((item) => item.id !== plan.id && item.position >= targetPosition && item.position < plan.position).forEach((item) => { item.position += 1; });
        else reorderable.filter((item) => item.id !== plan.id && item.position <= targetPosition && item.position > plan.position).forEach((item) => { item.position -= 1; });
        plan.position = targetPosition;
      }
      return tontineBeneficiaryPlans.filter((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.cycleId === cycle.id).sort((a, b) => a.position - b.position);
    }),

  /**
   * Retrait d'une position non encore consommée — une position déjà
   * consommée par un Tour est immuable (retrait refusé), cohérent avec
   * l'immuabilité du passé. Renumérote ensuite les positions suivantes du
   * même cycle (mandat refonte UX Planification §12 : jamais de trou dans la
   * numérotation après un retrait) — SANS RISQUE pour l'immuabilité des
   * positions déjà consommées : `createOccurrence` ne consomme jamais que la
   * plus petite position NON consommée (cf. plus bas), donc les positions
   * consommées forment TOUJOURS un préfixe contigu {1..k} et les positions
   * retirables sont TOUJOURS strictement supérieures à k — décrémenter les
   * positions > à celle retirée ne peut donc jamais retoucher une position
   * déjà consommée.
   */
  removePlanEntry: (tenantId: string, planId: string) =>
    mockRequest(() => {
      const plan = getTenantScoped(tontineBeneficiaryPlans, (item) => item.id === planId, tenantId);
      if (!plan || plan.consumedByOccurrenceId) return undefined;
      const index = tontineBeneficiaryPlans.findIndex((item) => item.id === planId);
      tontineBeneficiaryPlans.splice(index, 1);
      tontineBeneficiaryPlans
        .filter((item) => item.tenantId === tenantId && item.tontineId === plan.tontineId && item.cycleId === plan.cycleId && item.position > plan.position)
        .forEach((item) => { item.position -= 1; });
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
   * « Ajouter un tour » — un acte manuel, unitaire. Le panneau Bénéficiaires
   * commence TOUJOURS vide, sans achat comme avec achat (mandat « historique
   * des bénéficiaires entre Tours », 2026-09-23 — remplace l'ancien
   * comportement où sans achat auto-consommait la prochaine position non
   * consommée : désormais chaque bénéficiaire, à chaque position, dans
   * chaque Tour, est ajouté explicitement via checkbox + « Ajouter »,
   * jamais automatiquement — cohérent avec la sélection séquentielle
   * manuelle déjà en place pour les positions suivantes).
   */
  createOccurrence: (tenantId: string, tontineId: string, date: string) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine) return undefined;
      const cycle = getCurrentCycle(tenantId, tontineId);
      if (!cycle) return undefined;
      const existing = tontineOccurrences.filter((item) => item.tontineId === tontineId);
      const nextNumber = existing.reduce((max, item) => Math.max(max, item.occurrenceNumber), 0) + 1;
      const occurrence: TontineOccurrence = { id: uniqueId('OCC'), tenantId, tontineId, occurrenceNumber: nextNumber, date, status: 'PLANNED', createdAt: new Date().toISOString().slice(0, 10), cycleId: cycle.id };
      tontineOccurrences.push(occurrence);
      return occurrence;
    }),

  listBeneficiaries: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => occurrenceBeneficiaries.filter((item) => item.tenantId === tenantId && item.occurrenceId === occurrenceId)),

  /**
   * SANS ACHAT — `adhesionId` déjà bénéficiaire d'un Tour QUELCONQUE du cycle
   * courant (mandat « historique des bénéficiaires entre Tours », 2026-09-23)
   * — réutilise `getBeneficiaryAdhesionIdsInCycle` (source déjà existante,
   * jamais un second calcul). Sert à verrouiller, dans un Tour donné, les
   * positions déjà « passées » dans un AUTRE Tour du même cycle : par
   * construction (`hasAlreadyBenefitedInCurrentCycle`), une adhésion ne
   * bénéficie jamais de deux Tours différents du même cycle simultanément,
   * donc « historique relatif au Tour courant » = cet ensemble MOINS les
   * bénéficiaires du Tour lui-même (calculé côté appelant).
   */
  listCycleBeneficiaryAdhesionIds: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const cycle = getCurrentCycle(tenantId, tontineId);
      if (!cycle) return [];
      return Array.from(getBeneficiaryAdhesionIdsInCycle(tenantId, tontineId, cycle.id));
    }),

  /**
   * AVEC ACHAT — ordre chronologique GLOBAL des bénéficiaires du cycle
   * courant (mandat « numérotation globale des bénéficiaires », 2026-09-23)
   * : parcourt tous les Tours du cycle par `occurrenceNumber` croissant
   * (jamais l'ordre de retour d'une requête), et au sein de chaque Tour dans
   * l'ordre d'ajout déjà porté par `occurrenceBeneficiaries` (aucun ordre
   * prédéfini n'existe avec achat — l'ordre d'ajout EST l'ordre métier).
   * Le rang d'un `adhesionId` dans le tableau retourné + 1 = son numéro
   * global — jamais réinitialisé à 1 à chaque nouveau Tour. Sans achat,
   * cette notion ne s'applique pas : le rang du Plan (`listPlans`) reste la
   * seule source de vérité, inchangée.
   */
  listCycleBeneficiaryGlobalOrder: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const cycle = getCurrentCycle(tenantId, tontineId);
      if (!cycle) return [];
      const cycleOccurrenceIds = tontineOccurrences
        .filter((item) => item.tenantId === tenantId && item.tontineId === tontineId && item.cycleId === cycle.id)
        .sort((a, b) => a.occurrenceNumber - b.occurrenceNumber)
        .map((item) => item.id);
      return cycleOccurrenceIds.flatMap((occurrenceId) => occurrenceBeneficiaries.filter((item) => item.tenantId === tenantId && item.occurrenceId === occurrenceId).map((item) => item.adhesionId));
    }),

  /** Source de vérité du panneau « Planifier le Tour » : chaque adhésion active
   * est une participation distincte, identifiée par son `adhesionId`. */
  listOccurrencePlanningCandidates: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence) return [];
      return tontineAdhesions.filter((adhesion) => adhesion.tenantId === tenantId && isAvailableForOccurrencePlanning(tenantId, occurrence, adhesion));
    }),

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
   * Sélection explicite du/des bénéficiaire(s) au moment de la création du
   * tour. Plusieurs bénéficiaires par Tour possibles, chacun sa propre ligne
   * (jamais une chaîne concaténée). Refuse si le Tour est déjà RÉALISÉ, si
   * l'adhésion n'appartient pas à cette Tontine ou n'est pas active à la
   * date du Tour, ou si l'adhésion est déjà bénéficiaire de ce Tour.
   *
   * SANS ACHAT (mandat « sélection séquentielle des bénéficiaires »,
   * 2026-09-23) : contrairement au comportement historique (refus total),
   * cette voie est désormais AUSSI utilisée pour ajouter manuellement des
   * bénéficiaires supplémentaires à un Tour déjà ouvert (`createOccurrence`
   * continue d'auto-consommer la position 1 à l'ouverture — inchangé) —
   * mais gardée par `sansAchatBeneficiaryEligible` : l'adhésion doit avoir
   * une position dans le Plan du cycle courant, ET toutes les positions
   * PRÉCÉDENTES doivent déjà être consommées (bénéficiaires d'un Tour,
   * quel qu'il soit) — jamais un saut de position, jamais uniquement côté
   * UI. La position correspondante est marquée consommée par CE Tour.
   */
  addOccurrenceBeneficiary: (tenantId: string, occurrenceId: string, adhesionId: string, amountDue: number) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence || occurrence.status === 'REALIZED') return undefined;
      const tontine = getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId);
      if (!tontine) return undefined;
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
      if (!adhesion || !isAvailableForOccurrencePlanning(tenantId, occurrence, adhesion)) return undefined;
      if (occurrenceBeneficiaries.some((item) => item.occurrenceId === occurrenceId && item.adhesionId === adhesionId)) return undefined;
      if (hasAlreadyBenefitedInCurrentCycle(tenantId, tontine.id, adhesionId)) return undefined;
      let consumedPlan: TontineBeneficiaryPlan | undefined;
      if (!tontine.withPurchase) {
        const cyclePlans = tontineBeneficiaryPlans.filter((item) => item.tenantId === tenantId && item.tontineId === tontine.id && item.cycleId === occurrence.cycleId).sort((a, b) => a.position - b.position);
        consumedPlan = cyclePlans.find((item) => item.adhesionId === adhesionId);
        if (!sansAchatBeneficiaryEligible(cyclePlans, adhesionId, new Set())) return undefined;
      }
      const beneficiary: OccurrenceBeneficiary = { id: uniqueId('TB'), tenantId, occurrenceId, adhesionId, amountDue, amountPaid: 0, amountPurchased: 0, paidAt: null };
      occurrenceBeneficiaries.push(beneficiary);
      if (consumedPlan) consumedPlan.consumedByOccurrenceId = occurrenceId;
      writeAuditEvent({ tenantId, action: 'tontines.beneficiaryAdded', resourceType: 'occurrenceBeneficiary', resourceId: beneficiary.id, resourceLabel: `${tontine.name} — tour ${occurrence.occurrenceNumber} — ${adhesion.memberName}`, sensitive: false, correlationId: occurrenceId, context: { adhesionId, occurrenceId, amountDue: String(amountDue) } });
      return beneficiary;
    }),

  /**
   * Ajout groupé de bénéficiaires (mandat refonte « Tours » — sélection
   * multiple via checkbox puis « Ajouter → ») — UNE opération batch, jamais
   * N appels indépendants depuis l'UI. Mêmes règles d'éligibilité que
   * `addOccurrenceBeneficiary` (y compris, sans achat, la contrainte de
   * séquence position par position — voir `sansAchatBeneficiaryEligible`,
   * appliquée dans l'ORDRE de `adhesionIds` : le client envoie déjà les
   * positions dans l'ordre où elles ont été cochées, c.-à-d. l'ordre du
   * Plan). `amountDue` par défaut = montant de cotisation de la Tontine
   * (jamais une nouvelle définition de montant).
   */
  addOccurrenceBeneficiaries: (tenantId: string, occurrenceId: string, adhesionIds: string[]) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      const tontine = occurrence ? getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId) : undefined;
      if (!occurrence || !tontine) return { added: [] as OccurrenceBeneficiary[], skipped: adhesionIds.length };
      const amountDue = tontineOperationsService.getExpectedContributionAmount(tontine);
      const cyclePlans = tontine.withPurchase ? [] : tontineBeneficiaryPlans.filter((item) => item.tenantId === tenantId && item.tontineId === tontine.id && item.cycleId === occurrence.cycleId).sort((a, b) => a.position - b.position);
      const queuedInBatch = new Set<string>();
      const added: OccurrenceBeneficiary[] = [];
      let skipped = 0;
      for (const adhesionId of adhesionIds) {
        if (occurrence.status === 'REALIZED') { skipped += 1; continue; }
        const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
        if (!adhesion || !isAvailableForOccurrencePlanning(tenantId, occurrence, adhesion) || occurrenceBeneficiaries.some((item) => item.occurrenceId === occurrenceId && item.adhesionId === adhesionId)) { skipped += 1; continue; }
        if (hasAlreadyBenefitedInCurrentCycle(tenantId, tontine.id, adhesionId)) { skipped += 1; continue; }
        let consumedPlan: TontineBeneficiaryPlan | undefined;
        if (!tontine.withPurchase) {
          consumedPlan = cyclePlans.find((item) => item.adhesionId === adhesionId);
          if (!sansAchatBeneficiaryEligible(cyclePlans, adhesionId, queuedInBatch)) { skipped += 1; continue; }
        }
        const beneficiary: OccurrenceBeneficiary = { id: uniqueId('TB'), tenantId, occurrenceId, adhesionId, amountDue, amountPaid: 0, amountPurchased: 0, paidAt: null };
        occurrenceBeneficiaries.push(beneficiary);
        if (consumedPlan) consumedPlan.consumedByOccurrenceId = occurrenceId;
        queuedInBatch.add(adhesionId);
        writeAuditEvent({ tenantId, action: 'tontines.beneficiaryAdded', resourceType: 'occurrenceBeneficiary', resourceId: beneficiary.id, resourceLabel: `${tontine.name} — tour ${occurrence.occurrenceNumber} — ${adhesion.memberName}`, sensitive: false, correlationId: occurrenceId, context: { adhesionId, occurrenceId, amountDue: String(amountDue), batch: 'true' } });
        added.push(beneficiary);
      }
      return { added, skipped };
    }),

  /**
   * Retrait d'un bénéficiaire (mandat refonte « Tours » — « ← Enlever ») —
   * additif dans son historisation (jamais une suppression silencieuse de
   * l'historique) : refuse si le Tour est déjà RÉALISÉ, ou si une réception
   * a déjà été enregistrée (`amountPaid > 0`, immuabilité d'un versement
   * déjà effectué).
   *
   * SANS ACHAT (mandat « retrait en cascade », 2026-09-23, étendu par
   * « historique des bénéficiaires entre Tours ») : les bénéficiaires d'un
   * Tour forment TOUJOURS un préfixe continu de l'ordre maître défini dans
   * l'onglet Adhérents (`TontineBeneficiaryPlan.position`, jamais modifié
   * ici) — retirer la position N retire donc EN CASCADE toutes les
   * positions > N déjà bénéficiaires de CE MÊME Tour (jamais un trou :
   * `1,2,4` ou `2,3` sont des états interdits). Refuse tout le retrait
   * (jamais un retrait partiel silencieux) si l'une de ces positions a déjà
   * un versement enregistré (immuabilité), OU si un Tour SUIVANT a déjà
   * consommé une position >= N (le retrait ne peut agir que sur le Tour le
   * plus récent de la séquence — §16, éviter un trou entre deux Tours).
   * Chaque position ainsi libérée voit son `consumedByOccurrenceId`
   * réinitialisé à `null` — son NUMÉRO de position, lui, ne change jamais
   * (l'ordre maître reste intact), et redevient donc immédiatement
   * sélectionnable. Avec achat, comportement historique inchangé (retrait
   * strictement individuel).
   */
  removeOccurrenceBeneficiary: (tenantId: string, beneficiaryId: string) =>
    mockRequest(() => {
      const beneficiary = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
      if (!beneficiary || beneficiary.amountPaid > 0) return undefined;
      const occurrence = tontineOccurrences.find((item) => item.id === beneficiary.occurrenceId);
      if (!occurrence || occurrence.status === 'REALIZED') return undefined;
      const tontine = getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId);
      if (!tontine) return undefined;

      if (!tontine.withPurchase) {
        const cyclePlans = tontineBeneficiaryPlans.filter((item) => item.tenantId === tenantId && item.tontineId === tontine.id && item.cycleId === occurrence.cycleId);
        const targetPlan = cyclePlans.find((item) => item.adhesionId === beneficiary.adhesionId);
        if (!targetPlan) return undefined;
        /**
         * Garde-fou inter-Tours (mandat « historique des bénéficiaires entre
         * Tours », 2026-09-23 §16) : le retrait en cascade ne peut agir que
         * sur CE Tour. Si une position >= N est déjà consommée par un AUTRE
         * Tour (un Tour suivant a déjà pris la suite de la séquence), retirer
         * N créerait un trou global (position N libre, position > N déjà
         * prise ailleurs) — refus total plutôt qu'un état incohérent.
         * Concrètement, seul le Tour le plus récent de la séquence consommée
         * peut voir ses bénéficiaires retirés.
         */
        const blockedByOtherOccurrence = cyclePlans.some((item) => item.position >= targetPlan.position && item.consumedByOccurrenceId && item.consumedByOccurrenceId !== occurrence.id);
        if (blockedByOtherOccurrence) return undefined;
        const toRemove = occurrenceBeneficiaries.filter((item) => {
          if (item.tenantId !== tenantId || item.occurrenceId !== occurrence.id) return false;
          const plan = cyclePlans.find((p) => p.adhesionId === item.adhesionId);
          return Boolean(plan) && plan!.position >= targetPlan.position;
        });
        if (toRemove.some((item) => item.amountPaid > 0)) return undefined;
        for (const item of toRemove) {
          const index = occurrenceBeneficiaries.findIndex((row) => row.id === item.id);
          occurrenceBeneficiaries.splice(index, 1);
          const plan = cyclePlans.find((p) => p.adhesionId === item.adhesionId);
          if (plan) plan.consumedByOccurrenceId = null;
          const itemAdhesion = getTenantScoped(tontineAdhesions, (a) => a.id === item.adhesionId, tenantId);
          writeAuditEvent({ tenantId, action: 'tontines.beneficiaryRemoved', resourceType: 'occurrenceBeneficiary', resourceId: item.id, resourceLabel: `${tontine.name} — tour ${occurrence.occurrenceNumber} — ${itemAdhesion?.memberName ?? item.adhesionId}`, sensitive: false, correlationId: occurrence.id, context: { adhesionId: item.adhesionId, occurrenceId: occurrence.id, cascade: String(item.id !== beneficiary.id) } });
        }
        return { removed: true } as const;
      }

      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === beneficiary.adhesionId, tenantId);
      const index = occurrenceBeneficiaries.findIndex((item) => item.id === beneficiaryId);
      occurrenceBeneficiaries.splice(index, 1);
      writeAuditEvent({ tenantId, action: 'tontines.beneficiaryRemoved', resourceType: 'occurrenceBeneficiary', resourceId: beneficiary.id, resourceLabel: `${tontine.name} — tour ${occurrence.occurrenceNumber} — ${adhesion?.memberName ?? beneficiary.adhesionId}`, sensitive: false, correlationId: occurrence.id, context: { adhesionId: beneficiary.adhesionId, occurrenceId: occurrence.id } });
      return { removed: true } as const;
    }),

  /** Retrait groupé — même règle par bénéficiaire que `removeOccurrenceBeneficiary`, UNE opération batch. */
  removeOccurrenceBeneficiaries: (tenantId: string, beneficiaryIds: string[]) =>
    mockRequest(() => {
      let removed = 0;
      for (const beneficiaryId of beneficiaryIds) {
        const beneficiary = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
        if (!beneficiary || beneficiary.amountPaid > 0) continue;
        const occurrence = tontineOccurrences.find((item) => item.id === beneficiary.occurrenceId);
        if (!occurrence || occurrence.status === 'REALIZED') continue;
        const tontine = getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId);
        if (!tontine || !tontine.withPurchase) continue;
        const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === beneficiary.adhesionId, tenantId);
        const index = occurrenceBeneficiaries.findIndex((item) => item.id === beneficiaryId);
        occurrenceBeneficiaries.splice(index, 1);
        writeAuditEvent({ tenantId, action: 'tontines.beneficiaryRemoved', resourceType: 'occurrenceBeneficiary', resourceId: beneficiary.id, resourceLabel: `${tontine.name} — tour ${occurrence.occurrenceNumber} — ${adhesion?.memberName ?? beneficiary.adhesionId}`, sensitive: false, correlationId: occurrence.id, context: { adhesionId: beneficiary.adhesionId, occurrenceId: occurrence.id, batch: 'true' } });
        removed += 1;
      }
      return { removed, skipped: beneficiaryIds.length - removed };
    }),

  /**
   * Enregistre un versement de contribution — journal-lié : poste
   * immédiatement la Transaction Finance correspondante, best-effort comme
   * partout ailleurs dans ce module (n'annule jamais l'enregistrement
   * métier si `insertTransaction` refuse). Refuse sur un Tour déjà RÉALISÉ
   * (immuabilité du passé, cohérent avec `addOccurrenceBeneficiary`/
   * `recordReception`).
   */
  recordContribution: (tenantId: string, occurrenceId: string, adhesionId: string, amount: number) =>
    mockRequest(() => {
      if (!(amount > 0)) return undefined;
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence || occurrence.status === 'REALIZED') return undefined;
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
   * Montant de cotisation attendu par adhésion pour ce Tour — dérivé
   * exclusivement de la configuration de la Tontine (`contributionAmount`
   * MONEY / `quantity` GOODS), jamais un second champ dupliqué.
   */
  getExpectedContributionAmount: (tontine: { valueType: 'MONEY' | 'GOODS'; contributionAmount?: number; quantity?: number }): number =>
    tontine.valueType === 'MONEY' ? (tontine.contributionAmount ?? 0) : (tontine.quantity ?? 0),

  /**
   * Statut de cotisation « ON/OFF » par adhérent pour ce Tour — dérivé à
   * 100% des `TontineContribution` déjà existants (une désactivation
   * (`setContributionPayment(..., false)`) enregistre une ligne négative,
   * jamais une suppression physique de l'historique) : `amountPaid` est la
   * somme nette, jamais un second compteur stocké séparément.
   */
  listContributionStatuses: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence) return [];
      const tontine = getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId);
      if (!tontine) return [];
      const amountDue = tontineOperationsService.getExpectedContributionAmount(tontine);
      // Sur un Tour planifié du cycle courant, l'écran affiche les adhésions
      // actives maintenant : un adhérent ajouté après la création du Tour est
      // donc immédiatement visible et sélectionnable. L'historique conserve
      // sa lecture à la date du Tour.
      const eligibleAdhesions = tontineAdhesions.filter((item) => item.tenantId === tenantId && (isAvailableForOccurrencePlanning(tenantId, occurrence, item) || (occurrence.status === 'REALIZED' && item.tontineId === tontine.id && isAdhesionActiveAt(item, occurrence.date))));
      const positionByAdhesionId = new Map(
        tontineBeneficiaryPlans
          .filter((plan) => plan.tenantId === tenantId && plan.tontineId === tontine.id && plan.cycleId === occurrence.cycleId)
          .map((plan) => [plan.adhesionId, plan.position]),
      );
      return eligibleAdhesions.map((adhesion) => {
        const netPaid = tontineContributions.filter((item) => item.tenantId === tenantId && item.occurrenceId === occurrenceId && item.adhesionId === adhesion.id).reduce((sum, item) => sum + item.amount, 0);
        const amountPaid = Math.max(0, netPaid);
        return { adhesionId: adhesion.id, memberId: adhesion.memberId, memberName: adhesion.memberName, rank: positionByAdhesionId.get(adhesion.id) ?? Number.MAX_SAFE_INTEGER, amountDue, amountPaid, paid: amountPaid >= amountDue && amountDue > 0 };
      }).sort((a, b) => a.rank - b.rank || a.memberName.localeCompare(b.memberName));
    }),

  /**
   * Bascule ON/OFF d'une cotisation (mandat refonte « Tours ») — RÉUTILISE
   * le mécanisme financier existant (`insertTransaction` via
   * `postTontineTransaction`), jamais un simple champ local modifié :
   *
   * - ON  : poste la Cotisation manquante (`amountDue - amountPaid` déjà
   *   réglé), exactement comme `recordContribution` — jamais une
   *   ressaisie manuelle du montant, toujours celui de la Tontine.
   * - OFF : poste une Cotisation NÉGATIVE d'annulation pour le montant
   *   déjà réglé, plus une Transaction Finance compensatoire (`debit`)
   *   miroir exact du `credit` initial. AUCUNE ligne historique n'est
   *   jamais supprimée physiquement — l'annulation est additive, comme
   *   partout ailleurs dans ce module.
   *
   * Refuse sur un Tour déjà RÉALISÉ (immuabilité). Chaque bascule est
   * historisée (`writeAuditEvent`) avec l'ancien/le nouveau montant réglé.
   */
  setContributionPayment: (tenantId: string, occurrenceId: string, adhesionId: string, paid: boolean) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence || occurrence.status === 'REALIZED') return undefined;
      const tontine = getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId);
      if (!tontine) return undefined;
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === adhesionId, tenantId);
      // Même règle d'éligibilité que `listContributionStatuses` (mandat « un adhérent ajouté après la création du Tour est immédiatement visible ET sélectionnable ») : `isAdhesionActiveAt(adhesion, occurrence.date)` comparait à tort à la date du Tour, ce qui refusait le paiement d'un adhérent (ou d'une représentation supplémentaire) rejoint APRÈS cette date bien que déjà listé — jamais l'historique d'un Tour REALIZED ici, cette branche est déjà exclue ligne 702.
      if (!adhesion || !isAvailableForOccurrencePlanning(tenantId, occurrence, adhesion)) return undefined;
      const amountDue = tontineOperationsService.getExpectedContributionAmount(tontine);
      const currentPaid = Math.max(0, tontineContributions.filter((item) => item.tenantId === tenantId && item.occurrenceId === occurrenceId && item.adhesionId === adhesionId).reduce((sum, item) => sum + item.amount, 0));
      const account = resolveTontineAccount(tenantId, occurrence.tontineId);
      const description = `Cotisation tontine ${tontine.name} — tour ${occurrence.occurrenceNumber}`;

      if (paid) {
        const missing = amountDue - currentPaid;
        if (missing <= 0) return { adhesionId, amountDue, amountPaid: currentPaid, paid: true };
        tontineContributions.push({ id: uniqueId('CTB'), tenantId, occurrenceId, adhesionId, amount: missing, date: new Date().toISOString().slice(0, 10), createdBy: currentUser.name });
        if (account) postTontineTransaction(tenantId, { account, memberId: adhesion.memberId, memberName: adhesion.memberName, amount: missing, direction: 'credit', category: 'EPARGNE', description });
        writeAuditEvent({ tenantId, action: 'tontines.contributionPaymentToggled', resourceType: 'tontineContribution', resourceId: adhesionId, resourceLabel: `${tontine.name} — tour ${occurrence.occurrenceNumber} — ${adhesion.memberName}`, sensitive: false, correlationId: occurrenceId, before: { amountPaid: String(currentPaid), paid: 'false' }, after: { amountPaid: String(amountDue), paid: 'true' }, context: { adhesionId, occurrenceId, amount: missing } });
        return { adhesionId, amountDue, amountPaid: amountDue, paid: true };
      }

      if (currentPaid <= 0) return { adhesionId, amountDue, amountPaid: 0, paid: false };
      tontineContributions.push({ id: uniqueId('CTB'), tenantId, occurrenceId, adhesionId, amount: -currentPaid, date: new Date().toISOString().slice(0, 10), createdBy: currentUser.name });
      if (account) postTontineTransaction(tenantId, { account, memberId: adhesion.memberId, memberName: adhesion.memberName, amount: currentPaid, direction: 'debit', category: 'EPARGNE', description: `Annulation — ${description}` });
      writeAuditEvent({ tenantId, action: 'tontines.contributionPaymentToggled', resourceType: 'tontineContribution', resourceId: adhesionId, resourceLabel: `${tontine.name} — tour ${occurrence.occurrenceNumber} — ${adhesion.memberName}`, sensitive: true, correlationId: occurrenceId, before: { amountPaid: String(currentPaid), paid: 'true' }, after: { amountPaid: '0', paid: 'false' }, context: { adhesionId, occurrenceId, amount: currentPaid } });
      return { adhesionId, amountDue, amountPaid: 0, paid: false };
    }),

  /**
   * « Marquer tous comme payés » — UNE opération métier batch (mandat §11 :
   * jamais N actions UI indépendantes), réutilise exactement
   * `setContributionPayment(..., true)` par adhésion éligible non encore
   * intégralement réglée. Jamais de doublon (les adhésions déjà réglées
   * sont ignorées, `missing <= 0`).
   */
  markAllContributionsPaid: (tenantId: string, occurrenceId: string) =>
    mockRequest(() => {
      const occurrence = getTenantScoped(tontineOccurrences, (item) => item.id === occurrenceId, tenantId);
      if (!occurrence || occurrence.status === 'REALIZED') return undefined;
      const tontine = getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId);
      if (!tontine) return undefined;
      const amountDue = tontineOperationsService.getExpectedContributionAmount(tontine);
      // Même éligibilité que `listContributionStatuses`/`setContributionPayment` (voir ce dernier) — jamais `isAdhesionActiveAt(item, occurrence.date)` seule, qui exclurait à tort un adhérent rejoint après la création du Tour.
      const eligibleAdhesions = tontineAdhesions.filter((item) => item.tenantId === tenantId && isAvailableForOccurrencePlanning(tenantId, occurrence, item));
      let updated = 0;
      for (const adhesion of eligibleAdhesions) {
        const currentPaid = Math.max(0, tontineContributions.filter((item) => item.tenantId === tenantId && item.occurrenceId === occurrenceId && item.adhesionId === adhesion.id).reduce((sum, item) => sum + item.amount, 0));
        if (currentPaid >= amountDue && amountDue > 0) continue;
        const missing = amountDue - currentPaid;
        if (missing <= 0) continue;
        tontineContributions.push({ id: uniqueId('CTB'), tenantId, occurrenceId, adhesionId: adhesion.id, amount: missing, date: new Date().toISOString().slice(0, 10), createdBy: currentUser.name });
        const account = resolveTontineAccount(tenantId, occurrence.tontineId);
        if (account) postTontineTransaction(tenantId, { account, memberId: adhesion.memberId, memberName: adhesion.memberName, amount: missing, direction: 'credit', category: 'EPARGNE', description: `Cotisation tontine ${tontine.name} — tour ${occurrence.occurrenceNumber}` });
        writeAuditEvent({ tenantId, action: 'tontines.contributionPaymentToggled', resourceType: 'tontineContribution', resourceId: adhesion.id, resourceLabel: `${tontine.name} — tour ${occurrence.occurrenceNumber} — ${adhesion.memberName}`, sensitive: false, correlationId: occurrenceId, before: { amountPaid: String(currentPaid), paid: 'false' }, after: { amountPaid: String(amountDue), paid: 'true' }, context: { adhesionId: adhesion.id, occurrenceId, amount: missing, batch: 'true' } });
        updated += 1;
      }
      return { updated };
    }),

  /**
   * Réception d'un bénéficiaire — additive (jamais un remplacement). Refuse
   * si le Tour est déjà RÉALISÉ (immuabilité). `purchaseAmount`
   * (avec-achat uniquement) poste EXCLUSIVEMENT vers la caisse système
   * TONTINE_PURCHASE, jamais mélangé au montant net posté vers la caisse
   * générale.
   *
   * DERNIER REMPART — `resolveTontinePurchaseAccount` s'auto-répare
   * désormais (voir son commentaire) et ne renvoie `undefined` que si le
   * tenant lui-même n'a aucun compte système résolvable (corruption de
   * données) : dans ce cas précis, TOUTE l'opération est refusée AVANT toute
   * mutation — jamais un enregistrement partiel, jamais `purchaseAmount`
   * perdu silencieusement, jamais un faux succès.
   */
  recordReception: (tenantId: string, beneficiaryId: string, amount: number, purchaseAmount?: number) =>
    mockRequest(() => {
      if (!(amount > 0)) return undefined;
      const beneficiary = getTenantScoped(occurrenceBeneficiaries, (item) => item.id === beneficiaryId, tenantId);
      if (!beneficiary) return undefined;
      const occurrence = tontineOccurrences.find((item) => item.id === beneficiary.occurrenceId);
      if (!occurrence || occurrence.status === 'REALIZED') return undefined;
      const tontine = getTenantScoped(tontines, (item) => item.id === occurrence.tontineId, tenantId);
      if (tontine?.withPurchase && purchaseAmount && purchaseAmount > 0 && !resolveTontinePurchaseAccount(tenantId, occurrence.tontineId)) return undefined;
      const statusBefore = getBeneficiaryPaymentStatus(beneficiary);
      const amountPaidBefore = beneficiary.amountPaid;
      const amountPurchasedBefore = beneficiary.amountPurchased;
      beneficiary.amountPaid += amount;
      /** Cumul additif, jamais un remplacement — même principe que `amountPaid` (mandat « montant d'achat par bénéficiaire »). Toujours 0 hors avec-achat. */
      const appliedPurchaseAmount = tontine?.withPurchase && purchaseAmount && purchaseAmount > 0 ? purchaseAmount : 0;
      beneficiary.amountPurchased += appliedPurchaseAmount;
      beneficiary.paidAt = new Date().toISOString().slice(0, 10);
      const adhesion = getTenantScoped(tontineAdhesions, (item) => item.id === beneficiary.adhesionId, tenantId);
      if (adhesion && tontine?.valueType === 'MONEY') {
        const account = resolveTontineAccount(tenantId, occurrence.tontineId);
        if (account) postTontineTransaction(tenantId, { account, memberId: adhesion.memberId, memberName: adhesion.memberName, amount, direction: 'debit', category: 'AUTRES', subcategory: 'DISTRIBUTION', description: `Réception tontine ${tontine.name} — tour ${occurrence.occurrenceNumber}`.trim() });
        const purchaseAccount = resolveTontinePurchaseAccount(tenantId, occurrence.tontineId);
        if (purchaseAccount) postTontineTransaction(tenantId, { account: purchaseAccount, memberId: adhesion.memberId, memberName: adhesion.memberName, amount: purchaseAmount, direction: 'credit', category: 'AUTRES', subcategory: 'AUTRE', description: `Achat tontine ${tontine.name} — tour ${occurrence.occurrenceNumber}`.trim() });
      }
      writeAuditEvent({
        tenantId, action: 'tontines.beneficiaryPaymentRecorded', resourceType: 'occurrenceBeneficiary', resourceId: beneficiary.id,
        resourceLabel: `${tontine?.name ?? ''} — tour ${occurrence.occurrenceNumber} — ${adhesion?.memberName ?? beneficiary.adhesionId}`.trim(),
        sensitive: true, correlationId: occurrence.id,
        before: { amountPaid: String(amountPaidBefore), amountPurchased: String(amountPurchasedBefore), status: statusBefore },
        after: { amountPaid: String(beneficiary.amountPaid), amountPurchased: String(beneficiary.amountPurchased), status: getBeneficiaryPaymentStatus(beneficiary) },
        context: { adhesionId: beneficiary.adhesionId, occurrenceId: occurrence.id, beneficiaryId: beneficiary.id, amount, purchaseAmount: appliedPurchaseAmount },
      });
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

  // --- Cycle (notion SYSTÈME — mandat « recommencement automatique de la Tontine ») ---

  /**
   * État du cycle courant, pour piloter l'UI (bouton « + Ajouter un tour »
   * vs message + « Démarrer un nouveau cycle », mandat §8/§9) — jamais un
   * numéro de cycle exposé, uniquement `complete`.
   */
  getCycleStatus: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine) return undefined;
      return { complete: isCycleComplete(tenantId, tontineId) };
    }),

  /** État de la planification du cycle courant (mandat « onglet par défaut selon adhérents et planification ») — pilote UNIQUEMENT le choix de l'onglet par défaut à l'ouverture de la Tontine, réutilise `isPlanningComplete` (seule définition), jamais un second calcul. */
  getPlanningStatus: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine) return undefined;
      return { complete: isPlanningComplete(tenantId, tontineId) };
    }),

  /**
   * « Démarrer un nouveau cycle » (mandat §11) — L'UTILISATEUR NE FOURNIT
   * AUCUNE INFORMATION : re-vérifie côté service (jamais seulement l'UI) que
   * toutes les participations éligibles ont bénéficié, refuse sinon (double
   * rempart avec `getCycleStatus`, contre une désynchronisation UI/service).
   * Clôture le cycle courant (`CLOSED`, `closedAt`), crée le suivant
   * (`OPEN`, `cycleNumber + 1`) — jamais un remplacement, toujours un NOUVEL
   * enregistrement, l'ancien restant intact et consultable. Ne touche
   * JAMAIS aux Tours/bénéficiaires/reliquats/transactions déjà existants
   * (mandat §16/§17 : aucune refonte comptable ici).
   */
  startNewCycle: (tenantId: string, tontineId: string) =>
    mockRequest(() => {
      const tontine = getTenantScoped(tontines, (item) => item.id === tontineId, tenantId);
      if (!tontine) return undefined;
      const currentCycle = getCurrentCycle(tenantId, tontineId);
      if (!currentCycle) return undefined;
      if (!isCycleComplete(tenantId, tontineId)) return undefined;
      currentCycle.status = 'CLOSED';
      currentCycle.closedAt = new Date().toISOString();
      const newCycle: TontineCycle = { id: uniqueId('CYC'), tenantId, tontineId, cycleNumber: currentCycle.cycleNumber + 1, status: 'OPEN', startedAt: new Date().toISOString(), closedAt: null };
      tontineCycles.push(newCycle);
      writeAuditEvent({ tenantId, action: 'tontines.cycleStarted', resourceType: 'tontineCycle', resourceId: newCycle.id, resourceLabel: tontine.name, sensitive: false, correlationId: tontineId, before: { previousCycleId: currentCycle.id }, after: { newCycleId: newCycle.id } });
      return newCycle;
    }),

  // --- Vues transverses (toutes tontines confondues) ---

  listAllAdhesions: (tenantId: string) => mockRequest(() => tontineAdhesions.filter((item) => item.tenantId === tenantId)),
  listAllOccurrences: (tenantId: string) => mockRequest(() => tontineOccurrences.filter((item) => item.tenantId === tenantId).sort((a, b) => a.date.localeCompare(b.date))),
  listAllContributions: (tenantId: string) => mockRequest(() => tontineContributions.filter((item) => item.tenantId === tenantId)),
  /** Vue transverse (mandat « dashboard Tontines ») — sert à composer « Prochains Tours » en UNE seule requête, jamais un fetch par Tour. */
  listAllBeneficiaries: (tenantId: string) => mockRequest(() => occurrenceBeneficiaries.filter((item) => item.tenantId === tenantId)),
  /** Vue transverse (mandat « dashboard Tontines ») — sert à composer la colonne « Reliquats » (somme des reliquats OPEN par Tontine) en UNE seule requête, jamais un fetch par Tontine. */
  listAllRemainders: (tenantId: string) => mockRequest(() => tontineRemainders.filter((item) => item.tenantId === tenantId)),
};
