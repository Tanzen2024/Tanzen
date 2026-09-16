import { accountEntryEffect, accountLedgerEntries, type AccountRecord } from '@/mocks/finance/accounts';
import { isMemberOfAccountAsOf } from '@/mocks/finance/account-memberships';
import { latestFinalOpeningEntryAsOf } from '@/mocks/finance/opening-entries';
import { referenceDate } from './reference-date';
import { accountsOfAsOf, scopeKey } from './scope';
import type { BalanceLine, BalanceResult, BaselineResolution, FinanceCtx, FinancialScope } from './types';

function isMemberScope(
  scope: FinancialScope,
): scope is Extract<FinancialScope, { kind: 'MEMBER_ALL_ACCOUNTS' | 'MEMBER_ACCOUNT' }> {
  return scope.kind === 'MEMBER_ALL_ACCOUNTS' || scope.kind === 'MEMBER_ACCOUNT';
}

/**
 * Baseline (point de départ) du solde d'une caisse à `asOfDate` — étape 6.
 *
 * Sélection PAR EXISTENCE, jamais par un flag de migration : cherche la plus
 * récente `OpeningEntry FINAL` de cette caisse avec `date <= asOfDate`.
 *   - Si elle existe → c'est la baseline, et `floorDate` (= sa `date`) borne
 *     par le bas les transactions comptées ensuite (`referenceDate(tx) >=
 *     floorDate`) — sinon on compterait deux fois ce qui est déjà inclus dans
 *     l'`OpeningEntry`.
 *   - Sinon → comportement LEGACY strictement inchangé : `account.openingBalance`,
 *     réputé valable à toute date (comme `resolveAccount`), aucune borne basse.
 *     C'est le cas de TOUTES les caisses seedées tant que `closeFiscalYear`/
 *     `carryForward` (`closing.ts`/`carry-forward.ts`) n'ont pas tourné pour
 *     elles — non-régression garantie pour les tests des étapes 1-5.
 */
export function resolveBaseline(account: AccountRecord, ctx: FinanceCtx, asOfDate: string): BaselineResolution {
  const opening = latestFinalOpeningEntryAsOf(ctx.openingEntries ?? [], account.id, asOfDate);
  if (opening) {
    return { amount: opening.amount, floorDate: opening.date, openingEntryId: opening.id };
  }
  return { amount: account.openingBalance };
}

/**
 * SOLDE À L'INSTANT T.
 *
 *   soldeAu(scope, asOfDate) =
 *     Σ sur les caisses du périmètre :
 *       baseline(caisse)                        (0 pour un scope membre)
 *     + Σ effet(caisse, tx)
 *         | tx.status == 'completed'
 *         | referenceDate(tx) <= asOfDate       (borne inclusive)
 *         | caisse ∈ { tx.fromAccount, tx.toAccount }
 *         | scope membre ⇒ tx.memberId == memberId
 *                        ET adhésion à la caisse active le jour de tx
 *
 * `effet` = `accountEntryEffect` (déjà utilisé par `resolveAccount`) : +montant
 * si la caisse reçoit, −montant si elle émet, ±montant selon `type` pour une
 * écriture interne.
 *
 * Isolation tenant : garantie par le service, qui ne fournit dans `ctx` que les
 * caisses / transactions / adhésions du tenant courant.
 */
export function balanceAsOf(scope: FinancialScope, ctx: FinanceCtx, asOfDate: string): BalanceResult {
  const { accounts, outOfScope } = accountsOfAsOf(scope, ctx, asOfDate);
  const memberScope = isMemberScope(scope);
  const memberId = memberScope ? scope.memberId : undefined;

  const upToDate = ctx.transactions.filter(
    (tx) => tx.status === 'completed' && referenceDate(tx) <= asOfDate,
  );

  const byAccount: BalanceLine[] = accounts.map((account) => {
    let entries = accountLedgerEntries(account, upToDate);
    let opening: number;
    if (memberId) {
      // Scope membre : uniquement SES écritures, et seulement sur les jours où
      // son adhésion à CETTE caisse était active — une transaction antérieure à
      // l'adhésion ou postérieure à sa clôture n'y est jamais rattachée
      // (« une transaction historique ne prouve pas l'adhésion »). Le report
      // d'ouverture d'une caisse n'appartient jamais à un membre (étape 6 :
      // `OpeningEntry`/`ClosingEntry` sont des entités CAISSE, jamais membre —
      // cette branche reste donc intouchée).
      entries = entries.filter(
        (tx) =>
          tx.memberId === memberId &&
          isMemberOfAccountAsOf(ctx.memberships, memberId, account.id, referenceDate(tx)),
      );
      opening = 0;
    } else {
      const base = resolveBaseline(account, ctx, asOfDate);
      opening = base.amount;
      if (base.floorDate) {
        entries = entries.filter((tx) => referenceDate(tx) >= base.floorDate!);
      }
    }

    let credits = 0;
    let debits = 0;
    for (const tx of entries) {
      const effect = accountEntryEffect(account.accountNumber, tx);
      if (effect >= 0) credits += effect;
      else debits += -effect;
    }

    const line: BalanceLine = {
      accountId: account.id,
      accountNumber: account.accountNumber,
      accountTitle: account.title,
      opening,
      credits,
      debits,
      balance: opening + credits - debits,
    };
    if (memberScope) {
      const active = ctx.memberships.find(
        (m) =>
          m.memberId === memberId &&
          m.accountId === account.id &&
          m.startDate <= asOfDate &&
          (m.endDate === null || asOfDate <= m.endDate),
      );
      line.memberSince = active?.startDate ?? null;
    }
    return line;
  });

  return {
    scopeKey: scopeKey(scope),
    asOfDate,
    total: byAccount.reduce((sum, line) => sum + line.balance, 0),
    byAccount,
    outOfScope,
  };
}
