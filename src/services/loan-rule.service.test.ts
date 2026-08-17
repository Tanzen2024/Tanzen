import { describe, it, expect } from 'vitest';
import { loanRuleService, type LoanRuleInput } from './loan-rule.service';

const validInput: LoanRuleInput = {
  accountId: 'AC-003', name: 'Nouvelle politique test', allowLoans: true, loanMode: 'INTERNAL',
  minAmount: 10_000, maxAmount: 500_000, interestRate: 9, interestType: 'FIXED', interestPeriod: 'MONTHLY', durationMonths: 12,
  maxActiveLoans: 1, maxLoanExposure: 600_000, requiresGuarantor: true, minGuarantors: 1, maxGuarantors: 1,
  guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: 100, allowSelfGuarantee: false, requiresApproval: true, approvalLevel: 'ADMIN',
};

describe('loanRuleService — tenant isolation', () => {
  it('ALLOW/DENY: listLoanRules and getLoanRule are scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([loanRuleService.listLoanRules('T-001'), loanRuleService.listLoanRules('T-002')]);
    expect(t001.every((rule) => rule.tenantId === 'T-001')).toBe(true);
    expect(t002.length).toBeGreaterThan(0);
    const result = await loanRuleService.getLoanRule('T-001', t002[0].id);
    expect(result).toBeNull();
  });

  it('DENY: createLoanRule refuses an account belonging to another tenant', async () => {
    const result = await loanRuleService.createLoanRule('T-001', { ...validInput, accountId: 'AC-004' });
    expect(result).toBeNull();
  });

  it('DENY: updateLoanRule/activateLoanRule/deactivateLoanRule/deleteLoanRule cannot mutate a rule of another tenant', async () => {
    const [t002Rule] = await loanRuleService.listLoanRules('T-002');
    expect(await loanRuleService.updateLoanRule('T-001', t002Rule.id, { name: 'Intrus' })).toBeNull();
    expect(await loanRuleService.activateLoanRule('T-001', t002Rule.id)).toBeNull();
    expect(await loanRuleService.deactivateLoanRule('T-001', t002Rule.id)).toBeNull();
    expect(await loanRuleService.deleteLoanRule('T-001', t002Rule.id)).toBeNull();
  });
});

describe('loanRuleService — Account relation (loan_rules.account_id -> accounts.id)', () => {
  it('ALLOW: createLoanRule succeeds for an account of the same tenant', async () => {
    const rule = await loanRuleService.createLoanRule('T-001', validInput);
    expect(rule).not.toBeNull();
    expect(rule?.tenantId).toBe('T-001');
    expect(rule?.accountId).toBe('AC-003');
    expect(rule?.accountNumber).toBe('CS-001-COUR');
    expect(rule?.status).toBe('ACTIVE');
    expect(rule?.deletedAt).toBeNull();
  });

  it('DENY: createLoanRule refuses an unknown account id', async () => {
    const result = await loanRuleService.createLoanRule('T-001', { ...validInput, accountId: 'AC-999' });
    expect(result).toBeNull();
  });
});

describe('loanRuleService — UNIQUE(tenant_id, account_id) / UNIQUE(tenant_id, name)', () => {
  it('DENY: createLoanRule refuses a second rule for an account that already has a live rule', async () => {
    const result = await loanRuleService.createLoanRule('T-001', { ...validInput, accountId: 'AC-001', name: 'Autre nom' });
    expect(result).toBeNull();
  });

  it('DENY: createLoanRule refuses a duplicate name within the same tenant', async () => {
    const [existing] = await loanRuleService.listLoanRules('T-001');
    const result = await loanRuleService.createLoanRule('T-001', { ...validInput, accountId: 'AC-002', name: existing.name });
    expect(result).toBeNull();
  });
});

describe('loanRuleService — canonical CHECK constraints', () => {
  it('DENY: createLoanRule refuses maxAmount < minAmount (ck_amount_valid)', async () => {
    const result = await loanRuleService.createLoanRule('T-002', { ...validInput, accountId: 'AC-005', name: 'Test contrainte', minAmount: 100_000, maxAmount: 50_000 });
    expect(result).toBeNull();
  });

  it('DENY: createLoanRule refuses guaranteeRatio outside 0-100 (ck_guarantee_ratio)', async () => {
    const result = await loanRuleService.createLoanRule('T-002', { ...validInput, accountId: 'AC-005', name: 'Test ratio', guaranteeRatio: 150 });
    expect(result).toBeNull();
  });
});

describe('loanRuleService — Activate/Deactivate (D-CREDIT-LR-02, status only)', () => {
  it('ALLOW: deactivateLoanRule sets status to INACTIVE without touching deletedAt', async () => {
    const [rule] = await loanRuleService.listLoanRules('T-001');
    const result = await loanRuleService.deactivateLoanRule('T-001', rule.id);
    expect(result?.status).toBe('INACTIVE');
    expect(result?.deletedAt).toBeNull();
  });

  it('ALLOW: activateLoanRule sets status back to ACTIVE without touching deletedAt', async () => {
    const [rule] = await loanRuleService.listLoanRules('T-001');
    await loanRuleService.deactivateLoanRule('T-001', rule.id);
    const result = await loanRuleService.activateLoanRule('T-001', rule.id);
    expect(result?.status).toBe('ACTIVE');
    expect(result?.deletedAt).toBeNull();
  });
});

describe('loanRuleService — DELETE (soft delete, D-CREDIT-LR-02)', () => {
  /** Chaque test crée sa propre règle (compte T-002 encore libre) pour ne pas dépendre de l'ordre d'exécution des autres tests sur le même tableau mock partagé. */
  async function createDisposableT002Rule(name: string) {
    const rule = await loanRuleService.createLoanRule('T-002', { ...validInput, accountId: 'AC-005', name });
    if (!rule) throw new Error('setup failed: could not create disposable T-002 rule');
    return rule;
  }

  it('ALLOW: deleteLoanRule sets deletedAt AND forces status to INACTIVE', async () => {
    const rule = await createDisposableT002Rule('Règle jetable 1');
    const result = await loanRuleService.deleteLoanRule('T-002', rule.id);
    expect(result?.deletedAt).not.toBeNull();
    expect(result?.status).toBe('INACTIVE');
  });

  it('a deleted rule no longer appears in listLoanRules by default', async () => {
    const rule = await createDisposableT002Rule('Règle jetable 2');
    await loanRuleService.deleteLoanRule('T-002', rule.id);
    const after = await loanRuleService.listLoanRules('T-002');
    expect(after.find((item) => item.id === rule.id)).toBeUndefined();
  });

  it('a deleted rule is no longer reachable via getLoanRule', async () => {
    const rule = await createDisposableT002Rule('Règle jetable 3');
    await loanRuleService.deleteLoanRule('T-002', rule.id);
    const result = await loanRuleService.getLoanRule('T-002', rule.id);
    expect(result).toBeNull();
  });

  it('DELETE cannot be applied twice (already-deleted rule is treated as not found)', async () => {
    const rule = await createDisposableT002Rule('Règle jetable 4');
    await loanRuleService.deleteLoanRule('T-002', rule.id);
    const secondAttempt = await loanRuleService.deleteLoanRule('T-002', rule.id);
    expect(secondAttempt).toBeNull();
  });

  it('a live rule can be recreated for the same account after the previous one was soft-deleted (RESTORE hors périmètre, §12 du mandat)', async () => {
    const first = await createDisposableT002Rule('Règle jetable 5');
    await loanRuleService.deleteLoanRule('T-002', first.id);
    const recreated = await loanRuleService.createLoanRule('T-002', { ...validInput, accountId: 'AC-005', name: 'Règle jetable 5 bis' });
    expect(recreated).not.toBeNull();
    expect(recreated?.accountId).toBe('AC-005');
  });

  it('RESTORE is not implemented (hors périmètre, §12 du mandat)', () => {
    expect((loanRuleService as Record<string, unknown>).restoreLoanRule).toBeUndefined();
  });
});

describe('loanRuleService — UPDATE', () => {
  it('ALLOW: updateLoanRule modifies business fields without changing accountId', async () => {
    const [rule] = await loanRuleService.listLoanRules('T-001');
    const result = await loanRuleService.updateLoanRule('T-001', rule.id, { interestRate: 15 });
    expect(result?.interestRate).toBe(15);
    expect(result?.accountId).toBe(rule.accountId);
  });

  it('DENY: updateLoanRule refuses a change that would violate a canonical CHECK constraint', async () => {
    const [rule] = await loanRuleService.listLoanRules('T-001');
    const result = await loanRuleService.updateLoanRule('T-001', rule.id, { minGuarantors: 5, maxGuarantors: 1 });
    expect(result).toBeNull();
  });
});
