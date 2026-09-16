import { mockRequest } from './api-client';
import { accounts } from '@/mocks/finance/accounts';
import { transactions } from '@/mocks/finance/transactions';
import { accountMemberships } from '@/mocks/finance/account-memberships';
import { openingEntries, finalOpeningEntryForFiscalYear, type OpeningEntry } from '@/mocks/finance/opening-entries';
import { closingEntries, finalClosingEntry, type ClosingEntry } from '@/mocks/finance/closing-entries';
import { fiscalYears } from '@/mocks/settings/fiscal-years';
import { loans } from '@/mocks/finance/loans';
import { repayments } from '@/mocks/finance/repayments';
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
function ctxForTenant(tenantId: string): FinanceCtx {
  return {
    accounts: accounts.filter((account) => account.tenantId === tenantId),
    transactions: transactions.filter((transaction) => transaction.tenantId === tenantId),
    memberships: accountMemberships.filter((membership) => membership.tenantId === tenantId),
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

export const financePositionService = {
  /** Solde à l'instant T pour un périmètre (caisse / tenant / adhérent / adhérent×caisse). */
  balanceAsOf: (tenantId: string, scope: FinancialScope, asOfDate: string) =>
    mockRequest(() => balanceAsOf(scope, ctxForTenant(tenantId), asOfDate)),

  /** Flux financiers d'un périmètre sur une période inclusive `[from, to]`. */
  flows: (tenantId: string, scope: FinancialScope, from: string, to: string) =>
    mockRequest(() => flows(scope, ctxForTenant(tenantId), from, to)),

  /**
   * POSITION FINANCIÈRE D'UN MEMBRE (étape 7) — lecture seule, aucune écriture.
   * `scope` doit être `MEMBER_ACCOUNT` ou `MEMBER_ALL_ACCOUNTS` (voir
   * `@/lib/finance/member-position.ts` pour la logique complète : savings/
   * otherMovements/internalTransfers par caisse, `credit`/`distributions`
   * uniquement pour `MEMBER_ALL_ACCOUNTS`, jamais de rattachement Loan→caisse
   * ni Distribution→membre par nom inventés).
   */
  memberFinancialPosition: (tenantId: string, scope: Extract<FinancialScope, { kind: 'MEMBER_ACCOUNT' | 'MEMBER_ALL_ACCOUNTS' }>, asOfDate: string) =>
    mockRequest(() => memberFinancialPositionEngine(scope, ctxForTenant(tenantId), asOfDate)),

  /** Version batch — un `memberFinancialPosition` par membre, même scope (caisse unique si `accountId` fourni, sinon toutes ses caisses). */
  memberFinancialPositions: (tenantId: string, memberIds: string[], accountId: string | undefined, asOfDate: string) =>
    mockRequest(() => memberFinancialPositionsEngine(memberIds, accountId, ctxForTenant(tenantId), asOfDate)),

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
        accountId: computation.accountId,
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
        resourceLabel: fiscalYear.label,
        sensitive: true,
        context: { accountCount: created.length },
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
  recomputeClosingEntry: (tenantId: string, fiscalYearId: string, accountId: string, reason: string) =>
    mockRequest(() => {
      const fiscalYear = fiscalYears.find((fy) => fy.id === fiscalYearId && fy.tenantId === tenantId);
      if (!fiscalYear) return undefined;

      const outcome = recomputeClosingEntryEngine(ctxForTenant(tenantId), fiscalYear, accountId);
      if (!outcome.ok) return outcome;

      const previous = finalClosingEntry(closingEntries, accountId, fiscalYearId);
      if (previous) previous.status = 'SUPERSEDED';

      const created: ClosingEntry = {
        id: `CE-${String(closingEntries.length + 1).padStart(3, '0')}`,
        tenantId,
        accountId,
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
        resourceLabel: `${fiscalYear.label} · ${accountId}`,
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
   * 'CARRY_FORWARD'`. Ne touche jamais `AccountMembership` (mandat §6).
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
        accountId: computation.accountId,
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
        resourceLabel: toFiscalYear.label,
        sensitive: true,
        context: { fromFiscalYearId: fromFiscalYear.id, accountCount: created.length },
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
  createInitialOpeningEntry: (tenantId: string, accountId: string, fiscalYearId: string, amount: number) =>
    mockRequest(() => {
      const fiscalYear = fiscalYears.find((fy) => fy.id === fiscalYearId && fy.tenantId === tenantId);
      const account = accounts.find((item) => item.id === accountId && item.tenantId === tenantId);
      if (!fiscalYear || !account || !Number.isFinite(amount)) return undefined;
      if (finalOpeningEntryForFiscalYear(openingEntries, accountId, fiscalYearId)) return undefined;

      const entry: OpeningEntry = {
        id: `OE-${String(openingEntries.length + 1).padStart(3, '0')}`,
        tenantId,
        accountId,
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
        resourceLabel: `${account.title} · ${fiscalYear.label}`,
        sensitive: true,
        context: { origin: 'INITIAL', amount },
      });
      return entry;
    }),
};
