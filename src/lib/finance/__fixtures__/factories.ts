import type { AccountRecord } from '@/mocks/finance/accounts';
import type { Transaction } from '@/mocks/finance/transactions';
import type { AccountMembership } from '@/mocks/finance/account-memberships';
import type { OpeningEntry } from '@/mocks/finance/opening-entries';
import type { ClosingEntry } from '@/mocks/finance/closing-entries';
import type { FiscalYear } from '@/mocks/settings/fiscal-years';
import type { Loan } from '@/mocks/finance/loans';
import type { Repayment } from '@/mocks/finance/repayments';
import type { FinanceCtx } from '../types';

/**
 * Fabriques de fixtures pour les tests du moteur — chaque appel retourne un
 * OBJET NEUF. Les tests composent leur propre `ctx` avec des tableaux frais :
 * aucun état mutable partagé entre tests, exécution ordre-indépendante.
 */

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${String(++seq).padStart(3, '0')}`;

export function makeAccount(over: Partial<AccountRecord> = {}): AccountRecord {
  const id = over.id ?? nextId('AC');
  return {
    id,
    tenantId: 'T-1',
    accountNumber: over.accountNumber ?? `CX-${id}`,
    title: over.title ?? `Caisse ${id}`,
    type: 'LIBRE',
    amount: null,
    description: '',
    openingBalance: 0,
    memberIds: [],
    tenantName: 'Tenant 1',
    status: 'active',
    openedOn: '2026-01-01',
    ...over,
  };
}

export function makeTransaction(over: Partial<Transaction> = {}): Transaction {
  const id = over.id ?? nextId('TR');
  return {
    id,
    tenantId: 'T-1',
    reference: id,
    date: '2026-06-15',
    amount: 0,
    type: 'credit',
    category: 'EPARGNE',
    status: 'completed',
    fromAccount: 'MEMBRE',
    toAccount: 'CX-?',
    description: '',
    ...over,
  };
}

export function makeMembership(over: Partial<AccountMembership> = {}): AccountMembership {
  const id = over.id ?? nextId('AM');
  return {
    id,
    tenantId: 'T-1',
    accountId: 'AC-001',
    memberId: 'M-1',
    startDate: '2026-01-01',
    endDate: null,
    status: 'active',
    ...over,
  };
}

export function makeCtx(over: Partial<FinanceCtx> = {}): FinanceCtx {
  return { accounts: [], transactions: [], memberships: [], ...over };
}

export function makeFiscalYear(over: Partial<FiscalYear> = {}): FiscalYear {
  const id = over.id ?? nextId('FY');
  return {
    id,
    tenantId: 'T-1',
    label: `Exercice ${id}`,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'open',
    isCurrent: true,
    createdAt: '2026-01-01',
    closedAt: null,
    closedBy: null,
    ...over,
  };
}

export function makeOpeningEntry(over: Partial<OpeningEntry> = {}): OpeningEntry {
  const id = over.id ?? nextId('OE');
  return {
    id,
    tenantId: 'T-1',
    accountId: 'AC-001',
    fiscalYearId: 'FY-1',
    date: '2026-01-01',
    amount: 0,
    origin: 'INITIAL',
    status: 'FINAL',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

export function makeClosingEntry(over: Partial<ClosingEntry> = {}): ClosingEntry {
  const id = over.id ?? nextId('CE');
  return {
    id,
    tenantId: 'T-1',
    accountId: 'AC-001',
    fiscalYearId: 'FY-1',
    date: '2026-12-31',
    amount: 0,
    computedFrom: {},
    status: 'FINAL',
    createdAt: '2026-12-31T00:00:00.000Z',
    ...over,
  };
}

export function makeLoan(over: Partial<Loan> = {}): Loan {
  const id = over.id ?? nextId('L');
  return {
    id,
    tenantId: 'T-1',
    memberId: 'M-1',
    borrower: 'Membre Test',
    principal: 100_000,
    interestRate: 10,
    interestAmount: 10_000,
    totalRepayable: 110_000,
    paidAmount: 0,
    outstanding: 110_000,
    disbursementDate: '2026-01-01',
    maturityDate: '2026-12-31',
    monthlyPayment: 10_000,
    nextPaymentDate: '2026-02-01',
    lastPaymentDate: '2026-01-01',
    status: 'active',
    progress: 0,
    applicationId: `AP-${id}`,
    tenantName: 'Tenant 1',
    penalties: [],
    documents: [],
    activities: [],
    ...over,
  };
}

export function makeRepayment(over: Partial<Repayment> = {}): Repayment {
  const id = over.id ?? nextId('RP');
  return {
    id,
    tenantId: 'T-1',
    loanId: 'L-1',
    borrower: 'Membre Test',
    paymentDate: '2026-02-01',
    amount: 10_000,
    principalPart: 9_000,
    interestPart: 1_000,
    status: 'completed',
    ...over,
  };
}
