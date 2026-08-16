import { describe, it, expect } from 'vitest';
import { financeService } from './finance.service';

describe('financeService — Accounts', () => {
  it('ALLOW: listAccounts returns only accounts of the requesting tenant', async () => {
    const result = await financeService.listAccounts('T-001');
    expect(result.every((account) => account.tenantId === 'T-001')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('DENY: getAccount returns null for an account of another tenant', async () => {
    const [t001Accounts, t002Accounts] = await Promise.all([financeService.listAccounts('T-001'), financeService.listAccounts('T-002')]);
    expect(t002Accounts.length).toBeGreaterThan(0);
    const otherTenantAccountId = t002Accounts[0].id;
    const result = await financeService.getAccount('T-001', otherTenantAccountId);
    expect(result).toBeNull();
    expect(t001Accounts.some((account) => account.id === otherTenantAccountId)).toBe(false);
  });

  it('ALLOW: getAccount returns the account when it belongs to the requesting tenant', async () => {
    const [account] = await financeService.listAccounts('T-001');
    const result = await financeService.getAccount('T-001', account.id);
    expect(result?.id).toBe(account.id);
  });
});

describe('financeService — Transactions', () => {
  it('ALLOW/DENY: listTransactions is scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([financeService.listTransactions('T-001'), financeService.listTransactions('T-002')]);
    expect(t001.every((transaction) => transaction.tenantId === 'T-001')).toBe(true);
    expect(t002.every((transaction) => transaction.tenantId === 'T-002')).toBe(true);
    const t002Ids = new Set(t002.map((transaction) => transaction.id));
    expect(t001.some((transaction) => t002Ids.has(transaction.id))).toBe(false);
  });
});

describe('financeService — Contributions', () => {
  it('ALLOW/DENY: listContributions is scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([financeService.listContributions('T-001'), financeService.listContributions('T-002')]);
    expect(t001.every((contribution) => contribution.tenantId === 'T-001')).toBe(true);
    expect(t002.every((contribution) => contribution.tenantId === 'T-002')).toBe(true);
  });

  /**
   * GAP CONNU (non corrigé dans cette phase, additive-only) : contrairement à
   * tous les autres services, `listContributionsByMember` ne prend pas de
   * `tenantId` — aucune vérification possible au niveau service. Sûr
   * aujourd'hui uniquement parce que le seul point d'appel UI
   * (`organization-module.tsx`) obtient toujours `member.id` via
   * `organizationService.getMember(tenantId, memberId)`, déjà tenant-scopé
   * en amont — mais un appel direct au service avec un `memberId` d'un autre
   * tenant retournerait ses contributions sans aucun contrôle. Documenté ici
   * plutôt que corrigé silencieusement (voir docs/PHASE_12_INTEGRATION_TESTS_REGRESSION.md).
   */
  it('KNOWN GAP: listContributionsByMember has no tenant guard of its own (relies on caller pre-validation)', async () => {
    const result = await financeService.listContributionsByMember('M-002');
    expect(result.every((contribution) => contribution.memberId === 'M-002')).toBe(true);
  });
});

describe('financeService — Distributions', () => {
  it('ALLOW/DENY: listDistributions is scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([financeService.listDistributions('T-001'), financeService.listDistributions('T-002')]);
    expect(t001.every((distribution) => distribution.tenantId === 'T-001')).toBe(true);
    expect(t002.every((distribution) => distribution.tenantId === 'T-002')).toBe(true);
  });

  it('DENY: approveDistribution cannot mutate a distribution of another tenant', async () => {
    const [distribution] = await financeService.listDistributions('T-001');
    const result = await financeService.approveDistribution('T-002', distribution.id);
    expect(result).toBeNull();
    const after = await financeService.listDistributions('T-001');
    expect(after.find((item) => item.id === distribution.id)?.status).toBe(distribution.status);
  });

  it('ALLOW: createDistribution attaches the correct tenantId regardless of caller', async () => {
    const distribution = await financeService.createDistribution('T-002', { beneficiary: 'Test', source: 'Test fund', amount: 1000, date: '2026-12-01' });
    expect(distribution.tenantId).toBe('T-002');
    expect(distribution.status).toBe('pending');
  });

  it('ALLOW: approveDistribution transitions status to completed for the owning tenant', async () => {
    const distribution = await financeService.createDistribution('T-001', { beneficiary: 'Test 2', source: 'Test fund', amount: 500, date: '2026-12-02' });
    const approved = await financeService.approveDistribution('T-001', distribution.id);
    expect(approved?.status).toBe('completed');
  });
});
