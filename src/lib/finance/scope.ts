import type { CashboxRecord } from '@/mocks/finance/cashboxes';
import {
  cashboxesOfMemberAsOf,
  cashboxesOfMemberDuring,
  isMemberOfCashboxAsOf,
} from '@/mocks/finance/cashbox-memberships';
import type { FinancialScope, FinanceCtx } from './types';

/** Clé stable et lisible pour le cache React Query (`queryKeys.finance.position.*`). */
export function scopeKey(scope: FinancialScope): string {
  switch (scope.kind) {
    case 'TENANT_ALL_CASHBOXES':
      return 'tenant';
    case 'CASHBOX':
      return `cashbox:${scope.cashboxId}`;
    case 'MEMBER_ALL_CASHBOXES':
      return `member:${scope.memberId}`;
    case 'MEMBER_CASHBOX':
      return `member:${scope.memberId}:cashbox:${scope.cashboxId}`;
  }
}

export type Perimeter = { cashboxes: CashboxRecord[]; outOfScope: boolean };

/**
 * Caisses concernées par le scope À UNE DATE (solde à l'instant T).
 *
 *   TENANT_ALL_CASHBOXES → toutes les caisses du tenant
 *   CASHBOX              → la caisse (si elle existe)
 *   MEMBER_ALL_CASHBOXES → `cashboxesOfMemberAsOf` — jamais toutes les caisses du
 *                          tenant, jamais déduit des transactions
 *   MEMBER_CASHBOX       → la caisse SI le membre y est adhérent à `asOfDate`
 *
 * `outOfScope` est `true` quand un scope membre ne résout à aucune caisse.
 */
export function cashboxesOfAsOf(scope: FinancialScope, ctx: FinanceCtx, asOfDate: string): Perimeter {
  switch (scope.kind) {
    case 'TENANT_ALL_CASHBOXES':
      return { cashboxes: ctx.cashboxes, outOfScope: false };
    case 'CASHBOX': {
      const cashbox = ctx.cashboxes.find((a) => a.id === scope.cashboxId);
      return { cashboxes: cashbox ? [cashbox] : [], outOfScope: !cashbox };
    }
    case 'MEMBER_ALL_CASHBOXES': {
      const cashboxes = cashboxesOfMemberAsOf(ctx.memberships, ctx.cashboxes, scope.memberId, asOfDate);
      return { cashboxes, outOfScope: cashboxes.length === 0 };
    }
    case 'MEMBER_CASHBOX': {
      const cashbox = ctx.cashboxes.find((a) => a.id === scope.cashboxId);
      const ok = Boolean(cashbox) && isMemberOfCashboxAsOf(ctx.memberships, scope.memberId, scope.cashboxId, asOfDate);
      return { cashboxes: ok ? [cashbox as CashboxRecord] : [], outOfScope: !ok };
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
export function cashboxesOfDuring(scope: FinancialScope, ctx: FinanceCtx, from: string, to: string): Perimeter {
  switch (scope.kind) {
    case 'TENANT_ALL_CASHBOXES':
      return { cashboxes: ctx.cashboxes, outOfScope: false };
    case 'CASHBOX': {
      const cashbox = ctx.cashboxes.find((a) => a.id === scope.cashboxId);
      return { cashboxes: cashbox ? [cashbox] : [], outOfScope: !cashbox };
    }
    case 'MEMBER_ALL_CASHBOXES': {
      const cashboxes = cashboxesOfMemberDuring(ctx.memberships, ctx.cashboxes, scope.memberId, from, to);
      return { cashboxes, outOfScope: cashboxes.length === 0 };
    }
    case 'MEMBER_CASHBOX': {
      const cashbox = ctx.cashboxes.find((a) => a.id === scope.cashboxId);
      const overlaps =
        Boolean(cashbox) &&
        cashboxesOfMemberDuring(ctx.memberships, ctx.cashboxes, scope.memberId, from, to).some((a) => a.id === scope.cashboxId);
      return { cashboxes: overlaps ? [cashbox as CashboxRecord] : [], outOfScope: !overlaps };
    }
  }
}
