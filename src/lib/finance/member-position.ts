import { cashboxEntryEffect, cashboxLedgerEntries } from '@/mocks/finance/cashboxes';
import { isMemberOfCashboxAsOf } from '@/mocks/finance/cashbox-memberships';
import type { Loan } from '@/mocks/finance/loans';
import type { Repayment } from '@/mocks/finance/repayments';
import { referenceDate } from './reference-date';
import { cashboxesOfAsOf, scopeKey } from './scope';
import type { FinanceCtx, FinancialScope, MemberCashboxLine, MemberCreditSummary, MemberFinancialPosition } from './types';

type MemberScope = Extract<FinancialScope, { kind: 'MEMBER_ALL_CASHBOXES' | 'MEMBER_CASHBOX' }>;

/**
 * Agrégat CRÉDIT d'un membre (mandat étape 7) — TOUJOURS tenant/membre-scopé,
 * jamais par caisse (`Loan` n'a pas d'`cashboxId` : voir `types.ts`,
 * `MemberCreditSummary`).
 *
 * SOURCE DE VÉRITÉ : `Loan`/`Repayment` UNIQUEMENT.
 *   - `loansReceived` = Σ `Loan.principal` des prêts du membre DÉCAISSÉS au
 *     plus tard à `asOfDate` (`disbursementDate <= asOfDate`) — jamais
 *     `Transaction(PRET)`, qui existe en parallèle pour le même événement
 *     (ex. seed Fatou/L-001/TR-002) mais n'est PAS additionnée ici : ce
 *     serait compter deux fois le même décaissement.
 *   - `outstanding` = Σ (`Loan.totalRepayable − Σ Repayment.amount
 *     `completed` de CE prêt avec `paymentDate <= asOfDate``) — RECALCULÉ à la
 *     date demandée, jamais lu depuis `Loan.outstanding` (un instantané
 *     courant, pas une valeur historique). `Transaction(REMBOURSEMENT)`
 *     n'entre jamais dans ce calcul : la même action UI écrit À LA FOIS une
 *     transaction ET un `Repayment` (double-écriture connue, non corrigée
 *     ici) — additionner les deux compterait chaque remboursement deux fois.
 *   - Un prêt disbursé APRÈS `asOfDate` n'existe pas encore à cette date :
 *     exclu de `loansReceived`, `outstanding` et `loanCount`.
 *
 * `perimeterTenants` est une DÉFENSE, pas le mécanisme d'isolation principal
 * (assuré par le service via `ctx`) — même patron que `flows.ts`
 * (`perimeterTenants`) : ne jamais compter un prêt/remboursement d'un autre
 * tenant même si `ctx.loans`/`ctx.repayments` en contenaient par erreur.
 */
function memberLoanSummary(
  loans: Loan[],
  repayments: Repayment[],
  memberId: string,
  perimeterTenants: Set<string>,
  asOfDate: string,
): MemberCreditSummary {
  const memberLoans = loans.filter(
    (loan) => loan.memberId === memberId && perimeterTenants.has(loan.tenantId) && loan.disbursementDate <= asOfDate,
  );

  let loansReceived = 0;
  let totalRepayments = 0;
  let outstanding = 0;
  for (const loan of memberLoans) {
    loansReceived += loan.principal;
    const paid = repayments
      .filter(
        (repayment) =>
          repayment.loanId === loan.id &&
          perimeterTenants.has(repayment.tenantId) &&
          repayment.status === 'completed' &&
          repayment.paymentDate <= asOfDate,
      )
      .reduce((sum, repayment) => sum + repayment.amount, 0);
    totalRepayments += paid;
    outstanding += loan.totalRepayable - paid;
  }

  return { loansReceived, repayments: totalRepayments, outstanding, loanCount: memberLoans.length };
}

/**
 * POSITION FINANCIÈRE D'UN MEMBRE (étape 7) — RÉUTILISE le périmètre
 * `CashboxMembership` déjà établi par `scope.ts`/`cashboxesOfAsOf` (étapes
 * 3-5) : aucune nouvelle règle de périmètre, aucune caisse du tenant
 * n'apparaît si le membre n'y est pas adhérent à `asOfDate`, une caisse
 * adhérée SANS transaction apparaît à 0 (héritage direct, pas de code
 * nouveau).
 *
 * Ne calcule PAS un solde caisse (`balanceAsOf`) : décompose le flux net déjà
 * calculé par étapes 3-5 PAR CATÉGORIE de transaction —
 *   - `EPARGNE`                              → `savings`
 *   - `AUTRES`, hors `DISTRIBUTION`/`TRANSFERT` → `otherMovements`
 *   - `AUTRES/TRANSFERT`                     → `internalTransfers` (jamais dans un total)
 *   - `AUTRES/DISTRIBUTION`                  → agrégée à part, au niveau membre (pas par caisse, voir plus bas)
 *   - `PRET`/`REMBOURSEMENT`                 → JAMAIS comptés ici (source = `Loan`/`Repayment`, `credit`)
 *
 * `credit` (prêts) et `distributions` ne sont calculés QUE pour
 * `MEMBER_ALL_CASHBOXES` (mandat §2 : `Loan` n'a pas d'`cashboxId`, un prêt
 * n'est jamais attribuable à une seule caisse) — restent `undefined` pour
 * `MEMBER_CASHBOX`, jamais une valeur inventée (répartition par caisse,
 * moyenne, etc.).
 */
export function memberFinancialPosition(scope: MemberScope, ctx: FinanceCtx, asOfDate: string): MemberFinancialPosition {
  const memberId = scope.memberId;
  const { cashboxes: accounts, outOfScope } = cashboxesOfAsOf(scope, ctx, asOfDate);

  const upToDate = ctx.transactions.filter((tx) => tx.status === 'completed' && referenceDate(tx) <= asOfDate);

  const byCashbox: MemberCashboxLine[] = accounts.map((account) => {
    const entries = cashboxLedgerEntries(account, upToDate).filter(
      (tx) => tx.memberId === memberId && isMemberOfCashboxAsOf(ctx.memberships, memberId, account.id, referenceDate(tx)),
    );

    let savings = 0;
    let otherMovements = 0;
    let internalTransfers = 0;
    for (const tx of entries) {
      const effect = cashboxEntryEffect(account.cashboxNumber, tx);
      if (tx.category === 'EPARGNE') {
        savings += effect;
      } else if (tx.category === 'AUTRES') {
        if (tx.subcategory === 'TRANSFERT') internalTransfers += effect;
        else if (tx.subcategory === 'DISTRIBUTION') {
          // Agrégée au niveau membre (voir plus bas), jamais par caisse — pas de double comptage ici.
        } else {
          otherMovements += effect;
        }
      }
      // PRET / REMBOURSEMENT : intentionnellement ignorées — source = Loan/Repayment (`credit`).
    }

    const active = ctx.memberships.find(
      (m) =>
        m.memberId === memberId &&
        m.cashboxId === account.id &&
        m.startDate <= asOfDate &&
        (m.endDate === null || asOfDate <= m.endDate),
    );

    return {
      cashboxId: account.id,
      cashboxNumber: account.cashboxNumber,
      cashboxTitle: account.title,
      savings,
      otherMovements,
      internalTransfers,
      netCaisseFlow: savings + otherMovements,
      memberSince: active?.startDate ?? null,
    };
  });

  const savings = byCashbox.reduce((sum, line) => sum + line.savings, 0);
  const otherMovements = byCashbox.reduce((sum, line) => sum + line.otherMovements, 0);
  const internalTransfers = byCashbox.reduce((sum, line) => sum + line.internalTransfers, 0);

  const result: MemberFinancialPosition = {
    scopeKey: scopeKey(scope),
    asOfDate,
    outOfScope,
    byCashbox,
    savings,
    otherMovements,
    internalTransfers,
  };

  if (scope.kind === 'MEMBER_ALL_CASHBOXES') {
    // Défense tenant dérivée de `ctx.cashboxes` (déjà tenant-scopé par le service), même
    // patron que `flows.ts` — `credit`/`distributions` ne sont pas gated par l'adhésion
    // (un prêt n'exige aucune caisse adhérée), donc calculés même si `outOfScope`.
    const perimeterTenants = new Set(ctx.cashboxes.map((account) => account.tenantId));

    result.credit = memberLoanSummary(ctx.loans ?? [], ctx.repayments ?? [], memberId, perimeterTenants, asOfDate);

    result.distributions = ctx.transactions
      .filter(
        (tx) =>
          tx.status === 'completed' &&
          referenceDate(tx) <= asOfDate &&
          perimeterTenants.has(tx.tenantId) &&
          tx.category === 'AUTRES' &&
          tx.subcategory === 'DISTRIBUTION' &&
          tx.memberId === memberId,
      )
      .reduce((sum, tx) => sum + tx.amount, 0);

    result.estimatedNetPosition = savings + otherMovements + result.distributions - result.credit.outstanding;
  }

  return result;
}

/** Version batch — un `memberFinancialPosition` par membre, même scope (caisse unique ou toutes ses caisses). */
export function memberFinancialPositions(
  memberIds: string[],
  cashboxId: string | undefined,
  ctx: FinanceCtx,
  asOfDate: string,
): MemberFinancialPosition[] {
  return memberIds.map((memberId) => {
    const scope: MemberScope = cashboxId ? { kind: 'MEMBER_CASHBOX', memberId, cashboxId } : { kind: 'MEMBER_ALL_CASHBOXES', memberId };
    return memberFinancialPosition(scope, ctx, asOfDate);
  });
}
