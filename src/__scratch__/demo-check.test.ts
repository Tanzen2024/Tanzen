import { it } from 'vitest';
import { transactions } from '@/mocks/finance/transactions';
import { cashboxes, resolveCashbox } from '@/mocks/finance/cashboxes';
import { cashboxMemberships } from '@/mocks/finance/cashbox-memberships';
import { applications } from '@/mocks/finance/applications';
import { members } from '@/mocks/organization/members';
import { requiredTransactionType, isClassificationValid, isTransactionTypeAllowed } from '@/mocks/finance/transaction-classification';
it('report', () => {
  const t1 = transactions.filter((t) => t.tenantId === 'T-001');
  const kept = cashboxes.filter((c) => c.tenantId === 'T-001');
  const nums = new Set(kept.map((c) => c.cashboxNumber));
  const lines: string[] = [];
  lines.push('T-001 cashboxes: ' + kept.map((c) => `${c.id} ${c.title} sys=${c.systemCode ?? '-'}`).join(' | '));
  lines.push(`T-001 tx count=${t1.length} SUM=${t1.reduce((s, t) => s + t.amount, 0)}`);
  lines.push(`ALL tenants tx count=${transactions.length} SUM=${transactions.reduce((s, t) => s + t.amount, 0)}`);
  const orphans = t1.filter((t) => !nums.has(t.source) && !nums.has(t.destination));
  lines.push('T-001 orphan tx: ' + orphans.map((t) => t.id).join(',') || 'none');
  const allNums = new Set(cashboxes.map((c) => c.cashboxNumber));
  lines.push('ANY-tenant tx with no known cashbox: ' + transactions.filter((t) => !allNums.has(t.source) && !allNums.has(t.destination)).map((t) => `${t.id}(${t.tenantId})`).join(','));
  const ids = new Set(cashboxes.map((c) => c.id));
  lines.push('orphan memberships: ' + cashboxMemberships.filter((m) => !ids.has(m.cashboxId)).map((m) => m.id).join(','));
  lines.push('orphan applications: ' + applications.filter((a) => a.cashboxId && !ids.has(a.cashboxId)).map((a) => a.id).join(','));
  lines.push('bad member: ' + t1.filter((t) => t.memberId && !members.some((m) => m.id === t.memberId && m.tenantId === 'T-001')).map((t) => t.id).join(','));
  lines.push('bad classification/type: ' + t1.filter((t) => !isClassificationValid(t.category, t.subcategory ?? null) || !isTransactionTypeAllowed(t.category, t.subcategory ?? null, t.type)).map((t) => t.id).join(','));
  for (const c of kept) {
    const own = t1.filter((t) => t.source === c.cashboxNumber || t.destination === c.cashboxNumber);
    lines.push(`${c.title}: n=${own.length} sum=${own.reduce((s, t) => s + t.amount, 0)} balance=${resolveCashbox(c, transactions).balance}`);
  }
  const ids2 = transactions.map((t) => t.id); lines.push('dup tx ids: ' + ids2.filter((x, i) => ids2.indexOf(x) !== i).join(','));
  console.log('\n' + lines.join('\n'));
  void requiredTransactionType;
});
