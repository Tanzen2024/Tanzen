import type { AccountRecord } from '@/mocks/finance/accounts';
import {
  accountsOfMemberAsOf,
  accountsOfMemberDuring,
  isMemberOfAccountAsOf,
} from '@/mocks/finance/account-memberships';
import type { FinancialScope, FinanceCtx } from './types';

/** Clé stable et lisible pour le cache React Query (`queryKeys.finance.position.*`). */
export function scopeKey(scope: FinancialScope): string {
  switch (scope.kind) {
    case 'TENANT_ALL_ACCOUNTS':
      return 'tenant';
    case 'ACCOUNT':
      return `account:${scope.accountId}`;
    case 'MEMBER_ALL_ACCOUNTS':
      return `member:${scope.memberId}`;
    case 'MEMBER_ACCOUNT':
      return `member:${scope.memberId}:account:${scope.accountId}`;
  }
}

export type Perimeter = { accounts: AccountRecord[]; outOfScope: boolean };

/**
 * Caisses concernées par le scope À UNE DATE (solde à l'instant T).
 *
 *   TENANT_ALL_ACCOUNTS  → toutes les caisses du tenant
 *   ACCOUNT              → la caisse (si elle existe)
 *   MEMBER_ALL_ACCOUNTS  → `accountsOfMemberAsOf` — jamais toutes les caisses du
 *                          tenant, jamais déduit des transactions
 *   MEMBER_ACCOUNT       → la caisse SI le membre y est adhérent à `asOfDate`
 *
 * `outOfScope` est `true` quand un scope membre ne résout à aucune caisse.
 */
export function accountsOfAsOf(scope: FinancialScope, ctx: FinanceCtx, asOfDate: string): Perimeter {
  switch (scope.kind) {
    case 'TENANT_ALL_ACCOUNTS':
      return { accounts: ctx.accounts, outOfScope: false };
    case 'ACCOUNT': {
      const account = ctx.accounts.find((a) => a.id === scope.accountId);
      return { accounts: account ? [account] : [], outOfScope: !account };
    }
    case 'MEMBER_ALL_ACCOUNTS': {
      const accounts = accountsOfMemberAsOf(ctx.memberships, ctx.accounts, scope.memberId, asOfDate);
      return { accounts, outOfScope: accounts.length === 0 };
    }
    case 'MEMBER_ACCOUNT': {
      const account = ctx.accounts.find((a) => a.id === scope.accountId);
      const ok = Boolean(account) && isMemberOfAccountAsOf(ctx.memberships, scope.memberId, scope.accountId, asOfDate);
      return { accounts: ok ? [account as AccountRecord] : [], outOfScope: !ok };
    }
  }
}

/**
 * Caisses concernées par le scope SUR UNE PÉRIODE (flux). Pour un scope membre,
 * le périmètre = les caisses adhérées à un moment de `[from, to]`
 * (`membershipsOverlapping`) — une caisse quittée en cours de période reste
 * visible ; le rattachement fin (transaction comptée seulement si l'adhésion
 * était active le jour de la transaction) est fait par `flows` lui-même.
 */
export function accountsOfDuring(scope: FinancialScope, ctx: FinanceCtx, from: string, to: string): Perimeter {
  switch (scope.kind) {
    case 'TENANT_ALL_ACCOUNTS':
      return { accounts: ctx.accounts, outOfScope: false };
    case 'ACCOUNT': {
      const account = ctx.accounts.find((a) => a.id === scope.accountId);
      return { accounts: account ? [account] : [], outOfScope: !account };
    }
    case 'MEMBER_ALL_ACCOUNTS': {
      const accounts = accountsOfMemberDuring(ctx.memberships, ctx.accounts, scope.memberId, from, to);
      return { accounts, outOfScope: accounts.length === 0 };
    }
    case 'MEMBER_ACCOUNT': {
      const account = ctx.accounts.find((a) => a.id === scope.accountId);
      const overlaps =
        Boolean(account) &&
        accountsOfMemberDuring(ctx.memberships, ctx.accounts, scope.memberId, from, to).some((a) => a.id === scope.accountId);
      return { accounts: overlaps ? [account as AccountRecord] : [], outOfScope: !overlaps };
    }
  }
}
