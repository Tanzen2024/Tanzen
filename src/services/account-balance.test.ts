import { describe, it, expect } from 'vitest';
import { resolveAccount, accountLedgerEntries, accountEntryEffect, accounts, type AccountRecord } from '@/mocks/finance/accounts';
import { transactions } from '@/mocks/finance/transactions';
import { financeService } from './finance.service';

/**
 * Solde de la caisse = report d'ouverture + journal comptabilisé (mandat
 * « CORRIGER L'INCOHÉRENCE DU SOLDE DE LA FICHE CAISSE »). `resolveAccount` est
 * la source unique : fiche caisse, liste des caisses et KPI Trésorerie du
 * dashboard s'appuient toutes dessus.
 */

const baseAccount: AccountRecord = {
  id: 'AC-TEST', tenantId: 'T-001', accountNumber: 'CS-001-TEST', title: 'Caisse test', type: 'LIBRE',
  amount: null, description: '', openingBalance: 0, memberIds: [], tenantName: 'Coopérative Sutura',
  status: 'active', openedOn: '2026-01-01',
};

type Entry = Parameters<typeof accountLedgerEntries>[1][number];
const entry = (over: Partial<Entry>): Entry => ({
  type: 'credit', amount: 0, status: 'completed', tenantId: 'T-001',
  fromAccount: 'Adhérent', toAccount: 'CS-001-TEST', date: '2026-06-01', ...over,
});

describe('resolveAccount — calcul du solde depuis le journal', () => {
  it('CAS 1 : aucune transaction → solde = report d\'ouverture', () => {
    expect(resolveAccount({ ...baseAccount, openingBalance: 1_450_000 }, []).balance).toBe(1_450_000);
  });

  it('CAS 2 : un crédit de 50 000 → solde = report + 50 000', () => {
    const resolved = resolveAccount({ ...baseAccount, openingBalance: 100_000 }, [entry({ type: 'credit', amount: 50_000 })]);
    expect(resolved.balance).toBe(150_000);
  });

  it('CAS 3 : un débit de 20 000 → solde = report − 20 000', () => {
    const resolved = resolveAccount({ ...baseAccount, openingBalance: 100_000 }, [entry({ type: 'debit', amount: 20_000, fromAccount: 'CS-001-TEST', toAccount: 'Tiers' })]);
    expect(resolved.balance).toBe(80_000);
  });

  it('CAS 4 : deux crédits de 50 000 → solde = report + 100 000', () => {
    const resolved = resolveAccount({ ...baseAccount, openingBalance: 0 }, [
      entry({ type: 'credit', amount: 50_000, date: '2026-06-01' }),
      entry({ type: 'credit', amount: 50_000, date: '2026-06-02' }),
    ]);
    expect(resolved.balance).toBe(100_000);
  });

  it('CAS 5 : une transaction d\'une AUTRE caisse n\'influence pas le solde', () => {
    const resolved = resolveAccount(baseAccount, [entry({ amount: 999_000, toAccount: 'CS-001-AUTRE' })]);
    expect(resolved.balance).toBe(0);
    expect(accountLedgerEntries(baseAccount, [entry({ amount: 999_000, toAccount: 'CS-001-AUTRE' })])).toHaveLength(0);
  });

  it('CAS 6 : une transaction d\'un AUTRE tenant n\'influence pas le solde', () => {
    const resolved = resolveAccount(baseAccount, [entry({ amount: 999_000, tenantId: 'T-002' })]);
    expect(resolved.balance).toBe(0);
  });

  it('CAS 7 : une transaction annulée / non comptabilisée est exclue du solde', () => {
    const ledger = [
      entry({ type: 'credit', amount: 50_000, status: 'completed' }),
      entry({ type: 'credit', amount: 30_000, status: 'cancelled' }),
      entry({ type: 'credit', amount: 20_000, status: 'pending' }),
      entry({ type: 'debit', amount: 10_000, status: 'failed', fromAccount: 'CS-001-TEST', toAccount: 'Tiers' }),
    ];
    expect(resolveAccount(baseAccount, ledger).balance).toBe(50_000);
  });

  it('CAS 8 : dernier mouvement = date (transaction_at) de la dernière transaction comptabilisée, jamais la date de réunion', () => {
    const resolved = resolveAccount(baseAccount, [
      entry({ type: 'credit', amount: 50_000, date: '2026-08-01', recordedAt: '2026-08-01T10:12:00' }),
      entry({ type: 'credit', amount: 50_000, date: '2026-08-11' }),
    ]);
    expect(resolved.lastMovement).toBe('2026-08-11');
  });

  it('dernier mouvement = openedOn tant qu\'aucune transaction n\'est comptabilisée', () => {
    expect(resolveAccount({ ...baseAccount, openedOn: '2026-05-15' }, []).lastMovement).toBe('2026-05-15');
  });

  it('un débit interne (fromAccount = la caisse) sur transaction non comptabilisée reste exclu', () => {
    const resolved = resolveAccount(baseAccount, [entry({ type: 'debit', amount: 500_000, status: 'cancelled', fromAccount: 'CS-001-TEST', toAccount: 'CS-001-COUR' })]);
    expect(resolved.balance).toBe(0);
  });
});

describe('financeService — solde de la caisse Épargne (AC-002, Coopérative Sutura)', () => {
  it('le solde affiché est cohérent avec le journal : report 8 650 000 + 2 crédits de 50 000 = 8 750 000', async () => {
    const account = await financeService.getAccount('T-001', 'AC-002');
    expect(account?.openingBalance).toBe(8_650_000);
    expect(account?.balance).toBe(8_750_000);
  });

  it('le dernier mouvement suit la transaction la plus récente (11 août 2026), pas une valeur figée', async () => {
    const account = await financeService.getAccount('T-001', 'AC-002');
    expect(account?.lastMovement).toBe('2026-08-11');
  });

  it('après un nouveau crédit de 50 000 le solde augmente de 50 000 et le dernier mouvement se met à jour', async () => {
    const before = await financeService.getAccount('T-001', 'AC-002');
    await financeService.createTransaction('T-001', {
      accountNumber: 'CS-001-ÉPG', memberId: 'M-001', memberName: 'Fatou Ndiaye',
      category: 'EPARGNE', type: 'credit', amount: 50_000, description: 'Épargne test solde',
    });
    const after = await financeService.getAccount('T-001', 'AC-002');
    expect(after!.balance).toBe(before!.balance + 50_000);
    expect(after!.lastMovement).toBe(new Date().toISOString().slice(0, 10));
  });

  it('après un débit de 20 000 le solde diminue de 20 000', async () => {
    const before = await financeService.getAccount('T-001', 'AC-002');
    await financeService.createTransaction('T-001', {
      accountNumber: 'CS-001-ÉPG', category: 'AUTRES', subcategory: 'FRAIS',
      type: 'debit', amount: 20_000, description: 'Frais test solde',
    });
    const after = await financeService.getAccount('T-001', 'AC-002');
    expect(after!.balance).toBe(before!.balance - 20_000);
  });

  it('une transaction annulée ne modifie pas le solde', async () => {
    const before = await financeService.getAccount('T-001', 'AC-002');
    const created = await financeService.createTransaction('T-001', {
      accountNumber: 'CS-001-ÉPG', category: 'EPARGNE', type: 'credit', amount: 77_000, description: 'À annuler',
    });
    await financeService.cancelTransaction('T-001', created!.id);
    const after = await financeService.getAccount('T-001', 'AC-002');
    expect(after!.balance).toBe(before!.balance);
  });
});

describe('resolveAccount — cohérence panneau ↔ solde (mandat « corriger le calcul du solde »)', () => {
  it('VALIDATION 2 : crédit 100 000 + crédit 50 000 − débit 20 000 = 130 000', () => {
    const resolved = resolveAccount({ ...baseAccount, openingBalance: 0 }, [
      entry({ type: 'credit', amount: 100_000 }),
      entry({ type: 'credit', amount: 50_000 }),
      entry({ type: 'debit', amount: 20_000, fromAccount: 'CS-001-TEST', toAccount: 'Tiers' }),
    ]);
    expect(resolved.balance).toBe(130_000);
  });

  it('VALIDATION 3 : deux caisses — le solde de A n’inclut jamais les transactions de B', () => {
    const accountA: AccountRecord = { ...baseAccount, accountNumber: 'CS-001-A', openingBalance: 0 };
    const accountB: AccountRecord = { ...baseAccount, id: 'AC-B', accountNumber: 'CS-001-B', openingBalance: 0 };
    const journal = [
      entry({ type: 'credit', amount: 300_000, toAccount: 'CS-001-A' }),
      entry({ type: 'credit', amount: 999_000, toAccount: 'CS-001-B' }),
      entry({ type: 'debit', amount: 40_000, fromAccount: 'CS-001-B', toAccount: 'Tiers' }),
    ];
    expect(resolveAccount(accountA, journal).balance).toBe(300_000);
    expect(resolveAccount(accountB, journal).balance).toBe(959_000);
  });

  it('un virement inter-caisses est compté DES DEUX CÔTÉS : −montant pour l’émettrice, +montant pour la réceptrice (bug corrigé)', () => {
    const source: AccountRecord = { ...baseAccount, accountNumber: 'CS-001-SRC', openingBalance: 1_000_000 };
    const dest: AccountRecord = { ...baseAccount, id: 'AC-DEST', accountNumber: 'CS-001-DST', openingBalance: 1_000_000 };
    // Écriture unique : dans le journal du tenant c'est un DÉBIT (perspective émettrice).
    const transfer = entry({ type: 'debit', amount: 500_000, fromAccount: 'CS-001-SRC', toAccount: 'CS-001-DST' });
    expect(resolveAccount(source, [transfer]).balance).toBe(500_000);
    expect(resolveAccount(dest, [transfer]).balance).toBe(1_500_000);
    // Les deux fiches voient bien la ligne (prédicat identique au panneau).
    expect(accountLedgerEntries(source, [transfer])).toHaveLength(1);
    expect(accountLedgerEntries(dest, [transfer])).toHaveLength(1);
  });

  it('VALIDATION 4 : le solde agrège TOUTES les transactions de la caisse, pas seulement une page', () => {
    const many = Array.from({ length: 50 }, (_, i) => entry({ type: 'credit', amount: 1_000, date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}` }));
    expect(resolveAccount({ ...baseAccount, openingBalance: 0 }, many).balance).toBe(50_000);
  });

  it('VALIDATION 6 : aucune valeur de solde n’est stockée dans le seed — `balance`/`lastMovement` sont absents des enregistrements', () => {
    for (const record of accounts) {
      expect(Object.keys(record)).not.toContain('balance');
      expect(Object.keys(record)).not.toContain('lastMovement');
    }
  });

  it('AC-001 « Trésorerie » : solde 12 500 000 = report 13 730 000 − prêt 850 000 (TR-002) + remboursement 120 000 (TR-004) − virement émis 500 000 (TR-010), démontré transaction par transaction', async () => {
    const record = accounts.find((a) => a.id === 'AC-001')!;
    // Périmètre : uniquement les écritures completed de T-001 où CS-001-TRÉS est source OU destination.
    const ledger = accountLedgerEntries(record, transactions);
    expect(ledger.map((tr) => tr.id).sort()).toEqual(['TR-002', 'TR-004', 'TR-010']);
    // Effet signé de chaque écriture DU POINT DE VUE de la trésorerie.
    expect(accountEntryEffect('CS-001-TRÉS', transactions.find((tr) => tr.id === 'TR-002')!)).toBe(-850_000); // décaissement prêt L-001
    expect(accountEntryEffect('CS-001-TRÉS', transactions.find((tr) => tr.id === 'TR-004')!)).toBe(120_000); // remboursement L-004
    expect(accountEntryEffect('CS-001-TRÉS', transactions.find((tr) => tr.id === 'TR-010')!)).toBe(-500_000); // virement interne émis
    const variationNette = ledger.reduce((sum, tr) => sum + accountEntryEffect('CS-001-TRÉS', tr), 0);
    expect(variationNette).toBe(-1_230_000);
    expect(record.openingBalance).toBe(13_730_000);
    expect(resolveAccount(record, transactions).balance).toBe(12_500_000);
    const account = await financeService.getAccount('T-001', 'AC-001');
    expect(account?.balance).toBe(12_500_000);
    // Le virement TR-010 n'est PAS compté deux fois côté trésorerie (émettrice uniquement) ; il crédite l'autre côté (AC-003).
    expect(ledger.filter((tr) => tr.id === 'TR-010')).toHaveLength(1);
    expect(accountEntryEffect('CS-001-COUR', transactions.find((tr) => tr.id === 'TR-010')!)).toBe(500_000);
  });

  it('AC-003 « Compte courant » : solde = report + son propre journal (dont le virement reçu TR-010 de 500 000), pas une constante figée', async () => {
    const account = await financeService.getAccount('T-001', 'AC-003');
    expect(account?.openingBalance).toBe(2_725_000);
    // report 2 725 000 − frais 25 000 (TR-006) + virement reçu 500 000 (TR-010) = 3 200 000
    expect(account?.balance).toBe(3_200_000);
    const ledger = accountLedgerEntries(accounts.find((a) => a.id === 'AC-003')!, [
      { type: 'debit', amount: 500_000, status: 'completed', tenantId: 'T-001', fromAccount: 'CS-001-TRÉS', toAccount: 'CS-001-COUR', date: '2026-08-03' },
    ]);
    expect(ledger).toHaveLength(1); // le virement inter-caisses reçu est bien rattaché à AC-003
  });
});
