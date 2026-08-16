import { describe, it, expect } from 'vitest';
import { creditService } from './credit.service';

describe('creditService — Applications', () => {
  it('ALLOW/DENY: listApplications and getApplication are scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([creditService.listApplications('T-001'), creditService.listApplications('T-002')]);
    expect(t001.every((application) => application.tenantId === 'T-001')).toBe(true);
    if (t002.length > 0) {
      const result = await creditService.getApplication('T-001', t002[0].id);
      expect(result).toBeNull();
    }
  });

  it('DENY: advanceApplicationStage cannot mutate an application of another tenant', async () => {
    const [t001] = await creditService.listApplications('T-001');
    const result = await creditService.advanceApplicationStage('T-002', t001.id, 'stageApproved');
    expect(result).toBeNull();
  });
});

describe('creditService — Loans', () => {
  it('ALLOW/DENY: listLoans and getLoan are scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([creditService.listLoans('T-001'), creditService.listLoans('T-002')]);
    expect(t001.every((loan) => loan.tenantId === 'T-001')).toBe(true);
    expect(t002.length).toBeGreaterThan(0);
    const result = await creditService.getLoan('T-001', t002[0].id);
    expect(result).toBeNull();
  });

  it('DENY: closeLoan cannot mutate a loan of another tenant', async () => {
    const [t001] = await creditService.listLoans('T-001');
    const result = await creditService.closeLoan('T-002', t001.id);
    expect(result).toBeNull();
  });
});

describe('creditService — Repayments/Guarantors: two-step tenant scoping via parent Loan', () => {
  it('DENY: listRepaymentsByLoan returns an empty list (not another tenant\'s data) for a loan of another tenant', async () => {
    const [t002Loan] = await creditService.listLoans('T-002');
    const result = await creditService.listRepaymentsByLoan('T-001', t002Loan.id);
    expect(result).toEqual([]);
  });

  it('DENY: listGuarantorsByLoan returns an empty list for a loan of another tenant', async () => {
    const [t002Loan] = await creditService.listLoans('T-002');
    const result = await creditService.listGuarantorsByLoan('T-001', t002Loan.id);
    expect(result).toEqual([]);
  });

  it('DENY: createRepayment refuses to write against a loan of another tenant', async () => {
    const [t002Loan] = await creditService.listLoans('T-002');
    const before = await creditService.getLoan('T-002', t002Loan.id);
    const result = await creditService.createRepayment('T-001', { loanId: t002Loan.id, paymentDate: '2026-12-01', principalPart: 50_000, interestPart: 5_000, status: 'completed' });
    expect(result).toBeNull();
    const after = await creditService.getLoan('T-002', t002Loan.id);
    expect(after?.paidAmount).toBe(before?.paidAmount);
  });

  it('DENY: createGuarantor refuses to write against a loan of another tenant', async () => {
    const [t002Loan] = await creditService.listLoans('T-002');
    const result = await creditService.createGuarantor('T-001', { loanId: t002Loan.id, guarantorName: 'Intrus', guaranteedAmount: 10_000, relation: 'friend' });
    expect(result).toBeNull();
  });
});

describe('creditService — REGRESSION: repayment recalculates parent loan paidAmount/outstanding/progress (Phase 7)', () => {
  it('ALLOW: a completed repayment on L-001 updates paidAmount/outstanding/progress with the verified formula', async () => {
    const before = await creditService.getLoan('T-001', 'L-001');
    expect(before).not.toBeNull();
    // `before` is a live reference into the same mutable mock array (services never clone),
    // so its primitive fields must be captured before the mutation, not read again afterwards.
    const beforePaidAmount = before?.paidAmount ?? 0;
    const totalRepayable = before?.totalRepayable ?? 0;
    const principalPart = 80_000;
    const interestPart = 20_000;
    const repayment = await creditService.createRepayment('T-001', { loanId: 'L-001', paymentDate: '2026-09-01', principalPart, interestPart, status: 'completed' });
    expect(repayment).not.toBeNull();
    expect(repayment?.amount).toBe(principalPart + interestPart);

    const after = await creditService.getLoan('T-001', 'L-001');
    const expectedPaidAmount = beforePaidAmount + principalPart + interestPart;
    const expectedOutstanding = totalRepayable - expectedPaidAmount;
    const expectedProgress = Math.round((expectedPaidAmount / totalRepayable) * 100);
    expect(after?.paidAmount).toBe(expectedPaidAmount);
    expect(after?.outstanding).toBe(expectedOutstanding);
    expect(after?.progress).toBe(expectedProgress);
    expect(after?.lastPaymentDate).toBe('2026-09-01');
  });

  it('does NOT update the loan when the repayment status is not "completed"', async () => {
    const before = await creditService.getLoan('T-001', 'L-004');
    // Snapshot primitives — `before` is a live reference into the mutable mock array.
    const beforePaidAmount = before?.paidAmount;
    const beforeOutstanding = before?.outstanding;
    const beforeProgress = before?.progress;
    const repayment = await creditService.createRepayment('T-001', { loanId: 'L-004', paymentDate: '2026-09-01', principalPart: 10_000, interestPart: 1_000, status: 'scheduled' });
    expect(repayment).not.toBeNull();
    const after = await creditService.getLoan('T-001', 'L-004');
    expect(after?.paidAmount).toBe(beforePaidAmount);
    expect(after?.outstanding).toBe(beforeOutstanding);
    expect(after?.progress).toBe(beforeProgress);
  });
});
