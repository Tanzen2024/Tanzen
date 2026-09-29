import { mockRequest } from './api-client';
import { cashboxes, type CashboxRecord } from '@/mocks/finance/cashboxes';
import { transactions } from '@/mocks/finance/transactions';
import { cashboxMemberships } from '@/mocks/finance/cashbox-memberships';
import { openingEntries, finalOpeningEntryForFiscalYear, type OpeningEntry } from '@/mocks/finance/opening-entries';
import { closingEntries, finalClosingEntry, type ClosingEntry } from '@/mocks/finance/closing-entries';
import { fiscalYears, fiscalYearLabel } from '@/mocks/settings/fiscal-years';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';
import { loans } from '@/mocks/finance/loans';
import { repayments } from '@/mocks/finance/repayments';
import { tenantCreditRule } from '@/mocks/finance/loan-rules';
import { members } from '@/mocks/organization/members';
import { isAdhesionActiveAt, occurrenceBeneficiaries, tontineAdhesions, tontineOccurrences, tontines } from '@/mocks/tontines/tontines';
import { auditEvents, type AuditEvent } from '@/mocks/audit/audit-events';
import { currentUser } from '@/mocks/rbac.mocks';
import {
  balanceAsOf,
  flows,
  computeFiscalYearClosing,
  recomputeClosingEntry as recomputeClosingEntryEngine,
  computeCarryForward,
  verifyCarryForwardIntegrity as verifyCarryForwardIntegrityEngine,
  memberFinancialPosition as memberFinancialPositionEngine,
  memberFinancialPositions as memberFinancialPositionsEngine,
  memberBalanceSheets as memberBalanceSheetsEngine,
  summarizeBalanceSheets,
  memberPeriodStatements as memberPeriodStatementsEngine,
  summarizePeriodStatements,
  type BalanceSheetCtx,
  type BalanceSheetParams,
  type PeriodParams,
  type TontinePurchaseGroup,
  cashboxesFiscalYearSummary,
  cashboxesSessionSummary,
  type FinanceCtx,
  type FinancialScope,
  type IntegrityMismatch,
} from '@/lib/finance';

/**
 * Exposition tenant-scoped du Financial Position Engine (`@/lib/finance`).
 *
 * Ce service est volontairement MINCE : il ne fait que (1) filtrer les mocks par
 * tenant pour composer le `ctx`, (2) appeler la fonction pure, (3) passer par
 * `mockRequest` comme tous les autres services. Toute la logique de calcul vit
 * dans `@/lib/finance` et se teste sans ce service.
 *
 * ISOLATION : `ctxForTenant` est le SEUL point où le `tenantId` entre en jeu.
 * Les fonctions pures ne voient jamais les données d'un autre tenant.
 */
/**
 * Périmètre du bilan des adhérents : contexte du tenant, adhérents du tenant uniquement (« ALL » =
 * tous), caisse ignorée si elle n'appartient pas au tenant. Mode de la règle de crédit UNIQUE du
 * tenant ; sans règle, aucun prêt ne peut exister — SIMPLE par défaut.
 */
/**
 * Achats de tontine du tenant → personnes appartenant à la tontine de l'achat (adhésions actives à la
 * date de l'achat, une part par personne) : base de la redistribution « Achat tontine » à parts égales.
 * Relation relue par `Transaction.tontineBeneficiaryId` → bénéficiaire → Tour → Tontine, jamais recopiée.
 */
function tontinePurchaseGroups(tenantId: string, tenantTransactions: typeof transactions): TontinePurchaseGroup[] {
  const beneficiaryById = new Map(occurrenceBeneficiaries.filter((item) => item.tenantId === tenantId).map((item) => [item.id, item]));
  const occurrenceById = new Map(tontineOccurrences.filter((item) => item.tenantId === tenantId).map((item) => [item.id, item]));
  const tontineById = new Map(tontines.filter((item) => item.tenantId === tenantId).map((item) => [item.id, item]));
  const groups: TontinePurchaseGroup[] = [];
  for (const tx of tenantTransactions) {
    if (tx.subcategory !== 'ACHAT_TONTINE' || !tx.tontineBeneficiaryId) continue;
    const occurrence = occurrenceById.get(beneficiaryById.get(tx.tontineBeneficiaryId)?.occurrenceId ?? '');
    const tontine = occurrence && tontineById.get(occurrence.tontineId);
    if (!tontine) continue;
    const memberIds = [...new Set(tontineAdhesions.filter((adhesion) => adhesion.tenantId === tenantId && adhesion.tontineId === tontine.id && isAdhesionActiveAt(adhesion, tx.date)).map((adhesion) => adhesion.memberId))];
    groups.push({ transactionId: tx.id, tontineId: tontine.id, tontineName: tontine.name, memberIds });
  }
  return groups;
}

function balanceSheetScope(tenantId: string, requested: string[] | 'ALL', requestedCashboxId: string | undefined): { ctx: BalanceSheetCtx; memberIds: string[]; cashboxId: string | undefined } {
  const finance = ctxForTenant(tenantId);
  const rule = tenantCreditRule(tenantId);
  const tenantMemberIds = members.filter((member) => member.tenantId === tenantId).map((member) => member.id);
  return {
    ctx: { transactions: finance.transactions, loans: finance.loans ?? [], repayments: finance.repayments ?? [], cashboxes: finance.cashboxes, loanMode: rule?.loanMode ?? 'SIMPLE', interestPeriod: rule?.interestPeriod ?? 'MONTHLY', tontinePurchases: tontinePurchaseGroups(tenantId, finance.transactions) },
    memberIds: requested === 'ALL' ? tenantMemberIds : requested.filter((id) => tenantMemberIds.includes(id)),
    cashboxId: requestedCashboxId && finance.cashboxes.some((cashbox) => cashbox.id === requestedCashboxId) ? requestedCashboxId : undefined,
  };
}

function ctxForTenant(tenantId: string): FinanceCtx {
  return {
    cashboxes: cashboxes.filter((cashbox) => cashbox.tenantId === tenantId),
    transactions: transactions.filter((transaction) => transaction.tenantId === tenantId),
    memberships: cashboxMemberships.filter((membership) => membership.tenantId === tenantId),
    openingEntries: openingEntries.filter((entry) => entry.tenantId === tenantId),
    closingEntries: closingEntries.filter((entry) => entry.tenantId === tenantId),
    // Étape 7 — mêmes règles d'isolation que les autres tableaux : un membre d'un
    // tenant ne doit jamais voir les prêts/remboursements d'un autre tenant.
    loans: loans.filter((loan) => loan.tenantId === tenantId),
    repayments: repayments.filter((repayment) => repayment.tenantId === tenantId),
  };
}

/**
 * Point d'entrée UNIQUE des écritures d'audit du moteur de position (étape 6)
 * — pousse directement dans `auditEvents` (`@/mocks/audit/audit-events`), le
 * tableau canonique déjà utilisé par tous les autres modules (cf. son
 * en-tête : « aucun autre module ne doit créer son propre tableau
 * d'événements d'audit »). Même patron que `recordFiscalYearAudit`
 * (`settings.service.ts`, D-FY-06), pas un second système parallèle.
 */
function recordFinanceAudit(params: {
  tenantId: string;
  action: string;
  resourceId: string;
  resourceLabel: string;
  before?: Record<string, string | number>;
  after?: Record<string, string | number>;
  context?: Record<string, string | number>;
  sensitive: boolean;
}) {
  const event: AuditEvent = {
    id: `AUD-FIN-${Date.now()}-${auditEvents.length}`,
    tenantId: params.tenantId,
    timestamp: new Date().toISOString(),
    actorId: currentUser.id,
    actorName: currentUser.name,
    module: 'finance',
    action: params.action,
    eventType: 'action',
    resourceType: 'fiscalYear',
    resourceId: params.resourceId,
    resourceLabel: params.resourceLabel,
    status: 'success',
    sensitive: params.sensitive,
    correlationId: params.resourceId,
    ...(params.before ? { before: params.before } : {}),
    ...(params.after ? { after: params.after } : {}),
    ...(params.context ? { context: params.context } : {}),
  };
  auditEvents.push(event);
}

/**
 * Caisse vue dans le contexte d'UN exercice fiscal (mandat « Caisse + exercice
 * fiscal contexte global ») : la donnée stockée de la caisse + sa situation SUR
 * CET EXERCICE uniquement (`cashboxesFiscalYearSummary`). `balance` = solde à la
 * fin de l'exercice ; `lastMovement` = dernier mouvement DANS l'exercice (`null`
 * sinon). Jamais de chiffre d'un autre exercice.
 */
export type CashboxInFiscalYear = CashboxRecord & {
  fiscalYearId: string;
  yearOpeningBalance: number;
  inflows: number;
  outflows: number;
  balance: number;
  movementCount: number;
  lastMovement: string | null;
};

function cashboxesInFiscalYear(tenantId: string, fiscalYearId: string, sessionId?: string): CashboxInFiscalYear[] | undefined {
  // Isolation : l'exercice doit appartenir au tenant, sinon aucune donnée.
  const fiscalYear = fiscalYears.find((year) => year.id === fiscalYearId && year.tenantId === tenantId);
  if (!fiscalYear) return undefined;
  const ctx = ctxForTenant(tenantId);
  // Séance précise → situation de CETTE séance (séances de l'exercice + tenant uniquement) ; sinon, tout l'exercice.
  const sessionNumberById = new Map(fiscalSessions.filter((session) => session.tenantId === tenantId && session.fiscalYearId === fiscalYearId).map((session) => [session.id, session.sessionNumber]));
  const lines = sessionId ? cashboxesSessionSummary(ctx, fiscalYear, sessionNumberById, sessionId) : cashboxesFiscalYearSummary(ctx, fiscalYear);
  return lines.map((line) => {
    const record = ctx.cashboxes.find((cashbox) => cashbox.id === line.cashboxId)!;
    return {
      ...record,
      fiscalYearId,
      yearOpeningBalance: line.openingBalance,
      inflows: line.inflows,
      outflows: line.outflows,
      balance: line.balance,
      movementCount: line.movementCount,
      lastMovement: line.lastMovement,
    };
  });
}

export const financePositionService = {
  /** Caisses du tenant dans le contexte de l'exercice `fiscalYearId` (tenant + exercice). `undefined` si l'exercice n'appartient pas au tenant. */
  cashboxesForFiscalYear: (tenantId: string, fiscalYearId: string) =>
    mockRequest(() => cashboxesInFiscalYear(tenantId, fiscalYearId)),

  /**
   * Récapitulatif par caisse de l'onglet Transactions (mandat « Évolution globale du module Finance » §14) :
   * `sessionId` fourni → situation de CETTE séance (`cashboxesSessionSummary`) ; absent (« Toutes les
   * séances ») → situation de tout l'exercice, strictement identique à `cashboxesForFiscalYear`.
   */
  cashboxesForSession: (tenantId: string, fiscalYearId: string, sessionId: string | undefined) =>
    mockRequest(() => cashboxesInFiscalYear(tenantId, fiscalYearId, sessionId)),

  /** Une caisse dans le contexte de l'exercice `fiscalYearId` — `undefined` si la caisse ou l'exercice n'appartient pas au tenant. */
  cashboxForFiscalYear: (tenantId: string, cashboxId: string, fiscalYearId: string) =>
    mockRequest(() => cashboxesInFiscalYear(tenantId, fiscalYearId)?.find((cashbox) => cashbox.id === cashboxId)),

  /** Solde à l'instant T pour un périmètre (caisse / tenant / adhérent / adhérent×caisse). */
  balanceAsOf: (tenantId: string, scope: FinancialScope, asOfDate: string) =>
    mockRequest(() => balanceAsOf(scope, ctxForTenant(tenantId), asOfDate)),

  /** Flux financiers d'un périmètre sur une période inclusive `[from, to]`. */
  flows: (tenantId: string, scope: FinancialScope, from: string, to: string) =>
    mockRequest(() => flows(scope, ctxForTenant(tenantId), from, to)),

  /**
   * POSITION FINANCIÈRE D'UN MEMBRE (étape 7) — lecture seule, aucune écriture.
   * `scope` doit être `MEMBER_CASHBOX` ou `MEMBER_ALL_CASHBOXES` (voir
   * `@/lib/finance/member-position.ts` pour la logique complète : savings/
   * otherMovements/internalTransfers par caisse, `credit`/`distributions`
   * uniquement pour `MEMBER_ALL_CASHBOXES`, jamais de rattachement Loan→caisse
   * ni Distribution→membre par nom inventés).
   */
  memberFinancialPosition: (tenantId: string, scope: Extract<FinancialScope, { kind: 'MEMBER_CASHBOX' | 'MEMBER_ALL_CASHBOXES' }>, asOfDate: string) =>
    mockRequest(() => memberFinancialPositionEngine(scope, ctxForTenant(tenantId), asOfDate)),

  /** Version batch — un `memberFinancialPosition` par membre, même scope (caisse unique si `cashboxId` fourni, sinon toutes ses caisses). */
  memberFinancialPositions: (tenantId: string, memberIds: string[], cashboxId: string | undefined, asOfDate: string) =>
    mockRequest(() => memberFinancialPositionsEngine(memberIds, cashboxId, ctxForTenant(tenantId), asOfDate)),

  /**
   * BILAN FINANCIER DES ADHÉRENTS (mandat du 2026-09-27) — un, plusieurs (`memberIds`) ou tous
   * (`'ALL'` = tous les adhérents du tenant) : bilans individuels + synthèse agrégée. UNE seule
   * composition du contexte et UNE passe d'indexation quel que soit le nombre d'adhérents
   * (`memberBalanceSheets`). Backend réel : même contrat, agrégation SQL groupée par adhérent.
   * La caisse filtrée doit appartenir au tenant (sinon `cashboxId` est ignoré → aucun mouvement).
   */
  memberBalanceSheets: (tenantId: string, params: Omit<BalanceSheetParams, 'memberIds'> & { memberIds: string[] | 'ALL' }) =>
    mockRequest(() => {
      const { ctx, memberIds, cashboxId } = balanceSheetScope(tenantId, params.memberIds, params.cashboxId);
      const sheets = memberBalanceSheetsEngine(ctx, { ...params, memberIds, cashboxId });
      return { sheets, summary: summarizeBalanceSheets(sheets) };
    }),

  /**
   * BILAN SUR UNE PÉRIODE (Date de début → Date de fin) : situation au début, mouvements de la
   * période, situation à la fin — par adhérent + synthèse agrégée. Même périmètre tenant que
   * `memberBalanceSheets` ; une période inversée est refusée (`from > to`).
   */
  memberPeriodStatements: (tenantId: string, params: Omit<PeriodParams, 'memberIds'> & { memberIds: string[] | 'ALL' }) =>
    mockRequest(() => {
      const { ctx, memberIds, cashboxId } = balanceSheetScope(tenantId, params.memberIds, params.cashboxId);
      const statements = memberPeriodStatementsEngine(ctx, { ...params, memberIds, cashboxId });
      const rule = tenantCreditRule(tenantId);
      // Règle de crédit appliquée au relevé : périodicité des lignes et des intérêts, et intérêts
      // applicables (prêts autorisés, taux non nul) — sinon le relevé n'affiche aucun intérêt artificiel.
      const creditRule = { loanMode: ctx.loanMode, interestPeriod: ctx.interestPeriod ?? 'MONTHLY', interestRate: rule?.interestRate ?? 0, interestApplicable: Boolean(rule && rule.allowLoans && rule.interestRate > 0) };
      return { statements, summary: summarizePeriodStatements(statements), creditRule };
    }),

  /**
   * CLÔTURE D'EXERCICE (étape 6) — calcule (via `computeFiscalYearClosing`,
   * pur) puis PERSISTE un `ClosingEntry FINAL` par caisse du tenant.
   * `undefined` si l'exercice n'existe pas pour ce tenant ; sinon
   * `CloseFiscalYearOutcome` (refus explicite typé, ou succès + entrées créées).
   * Séquencement recommandé côté appelant (mandat §3/§4) : appeler CECI avant
   * `settingsService.closeCurrentFiscalYear` — un exercice ne doit jamais
   * passer `status: 'closed'` sans que ses clôtures financières existent.
   */
  closeFiscalYear: (tenantId: string, fiscalYearId: string) =>
    mockRequest(() => {
      const fiscalYear = fiscalYears.find((fy) => fy.id === fiscalYearId && fy.tenantId === tenantId);
      if (!fiscalYear) return undefined;

      const outcome = computeFiscalYearClosing(ctxForTenant(tenantId), fiscalYear);
      if (!outcome.ok) return outcome;

      const now = new Date().toISOString();
      const base = closingEntries.length;
      const created: ClosingEntry[] = outcome.computations.map((computation, index) => ({
        id: `CE-${String(base + index + 1).padStart(3, '0')}`,
        tenantId,
        cashboxId: computation.cashboxId,
        fiscalYearId: fiscalYear.id,
        date: fiscalYear.endDate,
        amount: computation.amount,
        computedFrom: { openingEntryId: computation.openingEntryId },
        status: 'FINAL',
        createdAt: now,
      }));
      closingEntries.push(...created);
      recordFinanceAudit({
        tenantId,
        action: 'finance.closingEntry.created',
        resourceId: fiscalYear.id,
        resourceLabel: fiscalYearLabel(fiscalYear),
        sensitive: true,
        context: { cashboxCount: created.length },
      });
      return { ok: true as const, entries: created };
    }),

  /**
   * RECALCUL EXPLICITE d'une clôture déjà existante (correction après
   * réouverture d'exercice) — jamais un effet de bord implicite de
   * `closeFiscalYear`. L'ancien `ClosingEntry FINAL` (s'il existe) passe
   * `SUPERSEDED`, un nouveau `FINAL` est créé — jamais d'édition en place
   * (mandat §8, immutabilité).
   */
  recomputeClosingEntry: (tenantId: string, fiscalYearId: string, cashboxId: string, reason: string) =>
    mockRequest(() => {
      const fiscalYear = fiscalYears.find((fy) => fy.id === fiscalYearId && fy.tenantId === tenantId);
      if (!fiscalYear) return undefined;

      const outcome = recomputeClosingEntryEngine(ctxForTenant(tenantId), fiscalYear, cashboxId);
      if (!outcome.ok) return outcome;

      const previous = finalClosingEntry(closingEntries, cashboxId, fiscalYearId);
      if (previous) previous.status = 'SUPERSEDED';

      const created: ClosingEntry = {
        id: `CE-${String(closingEntries.length + 1).padStart(3, '0')}`,
        tenantId,
        cashboxId,
        fiscalYearId: fiscalYear.id,
        date: fiscalYear.endDate,
        amount: outcome.amount,
        computedFrom: { openingEntryId: outcome.openingEntryId },
        status: 'FINAL',
        createdAt: new Date().toISOString(),
      };
      closingEntries.push(created);
      recordFinanceAudit({
        tenantId,
        action: 'finance.closingEntry.recomputed',
        resourceId: created.id,
        resourceLabel: `${fiscalYearLabel(fiscalYear)} · ${cashboxId}`,
        before: previous ? { amount: previous.amount } : undefined,
        after: { amount: created.amount },
        context: { reason },
        sensitive: true,
      });
      return { ok: true as const, entry: created };
    }),

  /**
   * REPORT À NOUVEAU (étape 6) — calcule (via `computeCarryForward`, pur) puis
   * PERSISTE une `OpeningEntry FINAL` par caisse du tenant, `origin:
   * 'CARRY_FORWARD'`. Ne touche jamais `CashboxMembership` (mandat §6).
   */
  carryForward: (tenantId: string, fromFiscalYearId: string, toFiscalYearId: string) =>
    mockRequest(() => {
      const fromFiscalYear = fiscalYears.find((fy) => fy.id === fromFiscalYearId && fy.tenantId === tenantId);
      const toFiscalYear = fiscalYears.find((fy) => fy.id === toFiscalYearId && fy.tenantId === tenantId);
      if (!fromFiscalYear || !toFiscalYear) return undefined;

      const outcome = computeCarryForward(ctxForTenant(tenantId), fromFiscalYear, toFiscalYear);
      if (!outcome.ok) return outcome;

      const now = new Date().toISOString();
      const base = openingEntries.length;
      const created: OpeningEntry[] = outcome.computations.map((computation, index) => ({
        id: `OE-${String(base + index + 1).padStart(3, '0')}`,
        tenantId,
        cashboxId: computation.cashboxId,
        fiscalYearId: toFiscalYear.id,
        date: computation.date,
        amount: computation.amount,
        origin: 'CARRY_FORWARD',
        sourceClosingEntryId: computation.sourceClosingEntryId,
        status: 'FINAL',
        createdAt: now,
      }));
      openingEntries.push(...created);
      recordFinanceAudit({
        tenantId,
        action: 'finance.carryForward.applied',
        resourceId: toFiscalYear.id,
        resourceLabel: fiscalYearLabel(toFiscalYear),
        sensitive: true,
        context: { fromFiscalYearId: fromFiscalYear.id, cashboxCount: created.length },
      });
      return { ok: true as const, entries: created };
    }),

  /**
   * Signale (sans rien corriger) les écarts `closing(N) ≠ opening(N+1)` — cas
   * de correction en cascade après réouverture + reclôture sans report rejoué
   * (mandat §7). `[]` si les deux exercices n'existent pas pour ce tenant.
   */
  verifyCarryForwardIntegrity: (tenantId: string, fromFiscalYearId: string, toFiscalYearId: string) =>
    mockRequest((): IntegrityMismatch[] => {
      const fromFiscalYear = fiscalYears.find((fy) => fy.id === fromFiscalYearId && fy.tenantId === tenantId);
      const toFiscalYear = fiscalYears.find((fy) => fy.id === toFiscalYearId && fy.tenantId === tenantId);
      if (!fromFiscalYear || !toFiscalYear) return [];
      return verifyCarryForwardIntegrityEngine(ctxForTenant(tenantId), fromFiscalYear, toFiscalYear);
    }),

  /**
   * `origin: 'INITIAL'` (mandat §2) — assertion manuelle d'un point de départ
   * SANS preuve de calcul en amont, pour une caisse qui n'a encore aucune
   * `OpeningEntry`. Reste RARE en pratique : le bootstrap naturel d'une caisse
   * seedée passe par son premier `closeFiscalYear` (baseline legacy
   * `openingBalance`) puis `carryForward` (`origin: 'CARRY_FORWARD'`), jamais
   * par cette voie. Refuse si une `OpeningEntry FINAL` existe déjà pour cette
   * caisse × cet exercice (jamais d'écrasement silencieux).
   */
  createInitialOpeningEntry: (tenantId: string, cashboxId: string, fiscalYearId: string, amount: number) =>
    mockRequest(() => {
      const fiscalYear = fiscalYears.find((fy) => fy.id === fiscalYearId && fy.tenantId === tenantId);
      const cashbox = cashboxes.find((item) => item.id === cashboxId && item.tenantId === tenantId);
      if (!fiscalYear || !cashbox || !Number.isFinite(amount)) return undefined;
      if (finalOpeningEntryForFiscalYear(openingEntries, cashboxId, fiscalYearId)) return undefined;

      const entry: OpeningEntry = {
        id: `OE-${String(openingEntries.length + 1).padStart(3, '0')}`,
        tenantId,
        cashboxId,
        fiscalYearId: fiscalYear.id,
        date: fiscalYear.startDate,
        amount,
        origin: 'INITIAL',
        status: 'FINAL',
        createdAt: new Date().toISOString(),
      };
      openingEntries.push(entry);
      recordFinanceAudit({
        tenantId,
        action: 'finance.openingEntry.created',
        resourceId: entry.id,
        resourceLabel: `${cashbox.title} · ${fiscalYearLabel(fiscalYear)}`,
        sensitive: true,
        context: { origin: 'INITIAL', amount },
      });
      return entry;
    }),
};
