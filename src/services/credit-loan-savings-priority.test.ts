import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { creditService } from './credit.service';
import { workflowService } from './workflow.service';
import { financeService, cashboxAvailableBalance, type TransactionInput } from './finance.service';
import { transactions } from '@/mocks/finance/transactions';
import { loanRules } from '@/mocks/finance/loan-rules';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { repayments } from '@/mocks/finance/repayments';
import { guarantors } from '@/mocks/finance/guarantors';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { auditEvents } from '@/mocks/audit/audit-events';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { fundingAvailabilityOf, savingsCashboxOf } from '@/lib/finance';

/**
 * ÉPARGNE, CAISSE PRIORITAIRE DES PRÊTS (2026-09-27) — Épargne (`SAVINGS`, AC-009 pour T-001) est sollicitée
 * EN PREMIER, jamais choisie par l'appelant ; toute autre caisse ACTIVE (ordinaire ou système, libre ou à taux
 * fixe) peut compléter. Aucune caisse n'est réservée au débit ou au crédit : le sens dépend de l'opération.
 */
const stores = { transactions, loans, loanFundingAllocations, applications, repayments, guarantors, auditEvents, cashboxes, workflowRequests, loanRules } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
beforeEach(restore);
afterEach(restore);

const T = 'T-001';
const EPARGNE = 'AC-009';
const GENERALE = 'AC-012'; // « Transport » — joue la Caisse Générale
const SOCIALE = 'AC-011'; // « Secours » (caisse système EMERGENCY_FUND) — joue la Caisse Sociale
const record = (id: string) => cashboxes.find((cashbox) => cashbox.id === id)!;
const balanceOf = (id: string) => cashboxAvailableBalance(T, id);
/** Fixe le disponible exact des caisses listées ; toutes les autres caisses de T-001 sont mises à 0. */
function onlyAvailable(balances: Record<string, number>) {
  for (const cashbox of cashboxes.filter((item) => item.tenantId === T)) cashbox.openingBalance += (balances[cashbox.id] ?? 0) - (balanceOf(cashbox.id) ?? 0);
}
const directLoans = () => { loanRules.find((rule) => rule.id === 'LR-001')!.requiresApproval = false; };
const GUARANTORS = (amount: number) => [{ guarantorName: 'Cheikh Diop', guaranteedAmount: amount, relation: 'Membre' }];
function lend(principal: number, complementaryFunding: { cashboxId: string; amount: number }[] = []) {
  // `cashboxNumber` volontairement Transport : ignoré, Épargne finance toujours en premier.
  const transactionInput: TransactionInput = { cashboxNumber: record(GENERALE).cashboxNumber, memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: principal, description: 'Prêt test Épargne' };
  return creditService.createLoanTransaction(T, { memberId: 'M-016', principal, guarantors: GUARANTORS(principal), approved: true, approvedBy: 'Amadou Mbaye', transactionInput, complementaryFunding });
}
const allocationsOf = (list: { cashboxId: string; amount: number }[]) => list.map((item) => [item.cashboxId, item.amount]);
const snapshot = () => ({ tx: transactions.length, loans: loans.length, allocations: loanFundingAllocations.length });

describe('Épargne sollicitée en premier', () => {
  beforeEach(directLoans);

  it('Épargne est résolue par son code système SAVINGS (AC-009, qui porte le report de 8 650 000)', async () => {
    const list = await financeService.listCashboxes(T);
    expect(savingsCashboxOf(list)?.id).toBe(EPARGNE);
    expect(cashboxes.some((cashbox) => cashbox.id === 'AC-002')).toBe(false);
    expect(record(EPARGNE).openingBalance).toBe(8_650_000);
  });

  it('Épargne suffisante (700 000 pour 500 000) : elle finance seule, même si l’appelant indique une autre caisse', async () => {
    onlyAvailable({ [EPARGNE]: 700_000, [GENERALE]: 5_000_000 });
    const result = (await lend(500_000))!;
    expect(allocationsOf(result.allocations)).toEqual([[EPARGNE, 500_000]]);
    expect(result.transactions.map((tx) => [tx.source, tx.amount, tx.type])).toEqual([[record(EPARGNE).cashboxNumber, 500_000, 'debit']]);
    expect(result.application.cashboxId).toBe(EPARGNE);
    expect(balanceOf(EPARGNE)).toBe(200_000);
    expect(balanceOf(GENERALE)).toBe(5_000_000);
  });

  it('EXEMPLE — 500 000 : Épargne 300 000 + Générale 150 000 + Sociale 50 000, trois débits, un seul prêt', async () => {
    onlyAvailable({ [EPARGNE]: 300_000, [GENERALE]: 150_000, [SOCIALE]: 100_000 });
    const loanCount = loans.length;
    const result = (await lend(500_000, [{ cashboxId: GENERALE, amount: 150_000 }, { cashboxId: SOCIALE, amount: 50_000 }]))!;
    expect(loans.length).toBe(loanCount + 1);
    expect(allocationsOf(result.allocations)).toEqual([[EPARGNE, 300_000], [GENERALE, 150_000], [SOCIALE, 50_000]]);
    expect(result.transactions.map((tx) => [tx.source, tx.amount, tx.type])).toEqual([
      [record(EPARGNE).cashboxNumber, 300_000, 'debit'],
      [record(GENERALE).cashboxNumber, 150_000, 'debit'],
      [record(SOCIALE).cashboxNumber, 50_000, 'debit'],
    ]);
    expect([balanceOf(EPARGNE), balanceOf(GENERALE), balanceOf(SOCIALE)]).toEqual([0, 0, 50_000]);
  });

  it('Épargne insuffisante sans complément : refus, rien n’est écrit (jamais de prêt partiellement financé)', async () => {
    onlyAvailable({ [EPARGNE]: 300_000, [GENERALE]: 900_000 });
    const before = snapshot();
    expect(await lend(500_000)).toBeUndefined();
    expect(snapshot()).toEqual(before);
  });

  it('Épargne suffisante : un complément reste interdit (Σ allocations > capital)', async () => {
    onlyAvailable({ [EPARGNE]: 700_000, [GENERALE]: 300_000 });
    expect(await lend(500_000, [{ cashboxId: GENERALE, amount: 100_000 }])).toBeUndefined();
  });
});

describe('Aucune restriction de caisse : toute caisse ACTIVE peut compléter', () => {
  beforeEach(directLoans);

  it('caisses système (Inscription, Achat tontine) et caisse à taux fixe (Transport) : proposées et acceptées', async () => {
    onlyAvailable({ [EPARGNE]: 100_000, 'AC-010': 100_000, 'AC-015': 100_000, 'AC-012': 100_000 });
    const availability = fundingAvailabilityOf(await financeService.listCashboxes(T));
    for (const id of ['AC-010', 'AC-015', 'AC-012']) expect(availability[id]).toBe(100_000);
    const result = (await lend(400_000, [{ cashboxId: 'AC-010', amount: 100_000 }, { cashboxId: 'AC-015', amount: 100_000 }, { cashboxId: 'AC-012', amount: 100_000 }]))!;
    expect(allocationsOf(result.allocations)).toEqual([[EPARGNE, 100_000], ['AC-010', 100_000], ['AC-015', 100_000], ['AC-012', 100_000]]);
  });

  it('seules limites : caisse inactive, autre tenant, montant au-delà du disponible', async () => {
    onlyAvailable({ [EPARGNE]: 300_000, [GENERALE]: 150_000, 'AC-010': 500_000 });
    record('AC-010').status = 'inactive';
    const before = snapshot();
    expect(await lend(500_000, [{ cashboxId: 'AC-010', amount: 200_000 }])).toBeUndefined(); // inactive
    expect(await lend(500_000, [{ cashboxId: 'AC-004', amount: 200_000 }])).toBeUndefined(); // T-002
    expect(await lend(500_000, [{ cashboxId: GENERALE, amount: 200_000 }])).toBeUndefined(); // 150 000 disponibles
    expect(snapshot()).toEqual(before);
  });

  it('Épargne INACTIVE : disponible 0, jamais débitée ; le prêt est entièrement financé par les autres caisses', async () => {
    onlyAvailable({ [EPARGNE]: 700_000, [GENERALE]: 600_000 });
    record(EPARGNE).status = 'inactive';
    expect(await lend(500_000)).toBeUndefined();
    const result = (await lend(500_000, [{ cashboxId: GENERALE, amount: 500_000 }]))!;
    expect(allocationsOf(result.allocations)).toEqual([[GENERALE, 500_000]]);
    expect(balanceOf(EPARGNE)).toBe(700_000);
  });

  it('une même caisse est DÉBITÉE (prêt) puis CRÉDITÉE (remboursement au prorata, épargne) — le sens vient de l’opération', async () => {
    onlyAvailable({ [EPARGNE]: 300_000, [GENERALE]: 300_000 });
    const { loan } = (await lend(400_000, [{ cashboxId: GENERALE, amount: 100_000 }]))!;
    expect(balanceOf(EPARGNE)).toBe(0);
    const repayment = (await creditService.createRepaymentTransaction(T, {
      loanId: loan.id, paymentDate: loan.disbursementDate, amount: 40_000, // ≥ décaissement (sinon dette 0 → refus)
      transactionInput: { cashboxNumber: record(GENERALE).cashboxNumber, memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', amount: 40_000, description: 'Remboursement' },
    }))!;
    // Remboursement inchangé : réparti au prorata des allocations (300 000 / 100 000).
    expect(repayment.transactions.map((tx) => [tx.destination, tx.amount, tx.type])).toEqual([[record(EPARGNE).cashboxNumber, 30_000, 'credit'], [record(GENERALE).cashboxNumber, 10_000, 'credit']]);
    const epargne = await financeService.createTransaction(T, { cashboxNumber: record(EPARGNE).cashboxNumber, memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'EPARGNE', type: 'credit', amount: 5_000, description: 'Épargne' });
    expect(epargne).toBeTruthy();
    expect(balanceOf(EPARGNE)).toBe(35_000);
  });
});

describe('Chemin avec approbation — même priorité', () => {
  it('la demande porte Épargne comme caisse de décaissement ; aucune transaction avant le décaissement, qui débite Épargne d’abord', async () => {
    onlyAvailable({ [EPARGNE]: 300_000, [GENERALE]: 400_000 });
    const before = snapshot();
    const submitted = (await creditService.submitLoanApplication(T, { memberId: 'M-016', requestedAmount: 500_000, purpose: 'Demande', guarantors: GUARANTORS(500_000), complementaryFunding: [{ cashboxId: GENERALE, amount: 200_000 }] }, 'Modou Faye'))!;
    expect(submitted.application.cashboxId).toBe(EPARGNE);
    expect(snapshot()).toEqual(before);
    const approved = (await workflowService.submitAction(T, submitted.request.id, 'approve', 'Amadou Mbaye', undefined, 'U-001'))!;
    creditService.applyLoanApplicationDecision(T, approved);
    const disbursed = (await creditService.disburseLoan(T, submitted.application.id))!;
    expect(allocationsOf(await creditService.listLoanFundingAllocations(T, disbursed.loan.id))).toEqual([[EPARGNE, 300_000], [GENERALE, 200_000]]);
  });
});
