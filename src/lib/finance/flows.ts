import { accountEntryEffect, type AccountRecord } from '@/mocks/finance/accounts';
import { isMemberOfAccountAsOf } from '@/mocks/finance/account-memberships';
import type { Transaction } from '@/mocks/finance/transactions';
import { referenceDate } from './reference-date';
import { accountsOfDuring, scopeKey } from './scope';
import type { FinanceCtx, FinancialScope, FlowAccountLine, FlowResult } from './types';

function isMemberScope(
  scope: FinancialScope,
): scope is Extract<FinancialScope, { kind: 'MEMBER_ALL_ACCOUNTS' | 'MEMBER_ACCOUNT' }> {
  return scope.kind === 'MEMBER_ALL_ACCOUNTS' || scope.kind === 'MEMBER_ACCOUNT';
}

/**
 * FLUX FINANCIERS D'UN SCOPE SUR UNE PÉRIODE — mouvements, jamais un solde.
 *
 *   flux(scope, from, to) : transactions `completed` avec
 *     from <= referenceDate(tx) <= to        (bornes inclusives)
 *   dans le périmètre du scope (`accountsOfDuring`).
 *
 * `totalDebit` / `totalCredit` = perspective JOURNAL (`transaction.type`),
 * cohérente avec l'écran Transactions. `byAccount[].debit` / `.credit` =
 * perspective CAISSE (`accountEntryEffect` : ce qui est réellement sorti / entré
 * de chaque caisse).
 *
 * Scope membre — RÈGLE TEMPORELLE (explicite, pas silencieuse) : une transaction
 * du membre sur une caisse n'est comptée QUE si son adhésion à cette caisse
 * était active le jour de la transaction (`isMemberOfAccountAsOf` sur
 * `referenceDate(tx)`). Le périmètre affiché = les caisses adhérées à un moment
 * de `[from, to]`. Conséquence assumée : une adhésion qui commence en cours de
 * période ne compte que ses transactions postérieures à `startDate` ; une
 * adhésion clôturée en cours de période ne compte pas les transactions
 * postérieures à `endDate`. Une caisse quittée avant `to` reste dans le
 * périmètre (avec ses mouvements de la fenêtre d'adhésion).
 *
 * Virements inter-caisses : AUCUN traitement spécial à cette étape (le marqueur
 * INTERNAL_TRANSFER est l'étape 10). Pour `TENANT_ALL_ACCOUNTS`, un virement
 * gonfle donc `totalDebit` (et `totalCredit` si les deux extrémités sont dans le
 * périmètre) de son montant. Le SOLDE consolidé, lui, reste juste (net nul).
 *
 * Isolation tenant : garantie par le service via `ctx`.
 */
export function flows(scope: FinancialScope, ctx: FinanceCtx, from: string, to: string): FlowResult {
  const { accounts, outOfScope } = accountsOfDuring(scope, ctx, from, to);
  const memberId = isMemberScope(scope) ? scope.memberId : undefined;
  // Défense identique à `accountLedgerEntries` : ne jamais compter une écriture
  // d'un autre tenant, même si le `ctx` en contenait par erreur (le service ne
  // fournit normalement que le tenant courant).
  const perimeterTenants = new Set(accounts.map((account) => account.tenantId));

  const inWindow = ctx.transactions.filter((tx) => {
    if (tx.status !== 'completed') return false;
    if (!perimeterTenants.has(tx.tenantId)) return false;
    const day = referenceDate(tx);
    return from <= day && day <= to;
  });

  const scoped: Transaction[] =
    scope.kind === 'TENANT_ALL_ACCOUNTS'
      ? inWindow
      : inWindow.filter((tx) => {
          const touched = accounts.filter(
            (a) => tx.fromAccount === a.accountNumber || tx.toAccount === a.accountNumber,
          );
          if (touched.length === 0) return false;
          if (!memberId) return true;
          if (tx.memberId !== memberId) return false;
          return touched.some((a) =>
            isMemberOfAccountAsOf(ctx.memberships, memberId, a.id, referenceDate(tx)),
          );
        });

  let totalDebit = 0;
  let totalCredit = 0;
  for (const tx of scoped) {
    if (tx.type === 'debit') totalDebit += tx.amount;
    else totalCredit += tx.amount;
  }

  const byAccount: FlowAccountLine[] = accounts.map((account: AccountRecord) => {
    const entries = scoped.filter(
      (tx) => tx.fromAccount === account.accountNumber || tx.toAccount === account.accountNumber,
    );
    let debit = 0;
    let credit = 0;
    for (const tx of entries) {
      const effect = accountEntryEffect(account.accountNumber, tx);
      if (effect >= 0) credit += effect;
      else debit += -effect;
    }
    return {
      accountId: account.id,
      accountNumber: account.accountNumber,
      accountTitle: account.title,
      debit,
      credit,
      count: entries.length,
    };
  });

  return {
    scopeKey: scopeKey(scope),
    from,
    to,
    totalDebit,
    totalCredit,
    count: scoped.length,
    transactionIds: scoped.map((tx) => tx.id),
    byAccount,
    outOfScope,
  };
}
