import { describe, it, expect } from 'vitest';
import { resolveCashbox, cashboxLedgerEntries, cashboxEntryEffect, cashboxes, type CashboxRecord } from '@/mocks/finance/cashboxes';
import { transactions } from '@/mocks/finance/transactions';
import { financeService } from './finance.service';

/**
 * Solde de la caisse = report d'ouverture + journal comptabilisé (mandat
 * « CORRIGER L'INCOHÉRENCE DU SOLDE DE LA FICHE CAISSE »). `resolveCashbox` est
 * la source unique : fiche caisse, liste des caisses et KPI Trésorerie du
 * dashboard s'appuient toutes dessus.
 */

const baseCashbox: CashboxRecord = {
  id: 'AC-TEST', tenantId: 'T-001', cashboxNumber: 'CS-001-TEST', title: 'Caisse test', type: 'LIBRE',
  amount: null, description: '', openingBalance: 0, memberIds: [], tenantName: 'Coopérative Sutura',
  status: 'active', openedOn: '2026-01-01',
};

type Entry = Parameters<typeof cashboxLedgerEntries>[1][number];
const entry = (over: Partial<Entry>): Entry => ({
  type: 'credit', amount: 0, status: 'completed', tenantId: 'T-001',
  source: 'Adhérent', destination: 'CS-001-TEST', date: '2026-06-01', ...over,
});

describe('resolveCashbox — calcul du solde depuis le journal', () => {
  it('CAS 1 : aucune transaction → solde = report d\'ouverture', () => {
    expect(resolveCashbox({ ...baseCashbox, openingBalance: 1_450_000 }, []).balance).toBe(1_450_000);
  });

  it('CAS 2 : un crédit de 50 000 → solde = report + 50 000', () => {
    const resolved = resolveCashbox({ ...baseCashbox, openingBalance: 100_000 }, [entry({ type: 'credit', amount: 50_000 })]);
    expect(resolved.balance).toBe(150_000);
  });

  it('CAS 3 : un débit de 20 000 → solde = report − 20 000', () => {
    const resolved = resolveCashbox({ ...baseCashbox, openingBalance: 100_000 }, [entry({ type: 'debit', amount: 20_000, source: 'CS-001-TEST', destination: 'Tiers' })]);
    expect(resolved.balance).toBe(80_000);
  });

  it('CAS 4 : deux crédits de 50 000 → solde = report + 100 000', () => {
    const resolved = resolveCashbox({ ...baseCashbox, openingBalance: 0 }, [
      entry({ type: 'credit', amount: 50_000, date: '2026-06-01' }),
      entry({ type: 'credit', amount: 50_000, date: '2026-06-02' }),
    ]);
    expect(resolved.balance).toBe(100_000);
  });

  it('CAS 5 : une transaction d\'une AUTRE caisse n\'influence pas le solde', () => {
    const resolved = resolveCashbox(baseCashbox, [entry({ amount: 999_000, destination: 'CS-001-AUTRE' })]);
    expect(resolved.balance).toBe(0);
    expect(cashboxLedgerEntries(baseCashbox, [entry({ amount: 999_000, destination: 'CS-001-AUTRE' })])).toHaveLength(0);
  });

  it('CAS 6 : une transaction d\'un AUTRE tenant n\'influence pas le solde', () => {
    const resolved = resolveCashbox(baseCashbox, [entry({ amount: 999_000, tenantId: 'T-002' })]);
    expect(resolved.balance).toBe(0);
  });

  it('CAS 7 : une transaction annulée / non comptabilisée est exclue du solde', () => {
    const ledger = [
      entry({ type: 'credit', amount: 50_000, status: 'completed' }),
      entry({ type: 'credit', amount: 30_000, status: 'cancelled' }),
      entry({ type: 'credit', amount: 20_000, status: 'pending' }),
      entry({ type: 'debit', amount: 10_000, status: 'failed', source: 'CS-001-TEST', destination: 'Tiers' }),
    ];
    expect(resolveCashbox(baseCashbox, ledger).balance).toBe(50_000);
  });

  it('CAS 8 : dernier mouvement = date (transaction_at) de la dernière transaction comptabilisée, jamais la date de réunion', () => {
    const resolved = resolveCashbox(baseCashbox, [
      entry({ type: 'credit', amount: 50_000, date: '2026-08-01', recordedAt: '2026-08-01T10:12:00' }),
      entry({ type: 'credit', amount: 50_000, date: '2026-08-11' }),
    ]);
    expect(resolved.lastMovement).toBe('2026-08-11');
  });

  it('dernier mouvement = openedOn tant qu\'aucune transaction n\'est comptabilisée', () => {
    expect(resolveCashbox({ ...baseCashbox, openedOn: '2026-05-15' }, []).lastMovement).toBe('2026-05-15');
  });

  it('un débit interne (source = la caisse) sur transaction non comptabilisée reste exclu', () => {
    const resolved = resolveCashbox(baseCashbox, [entry({ type: 'debit', amount: 500_000, status: 'cancelled', source: 'CS-001-TEST', destination: 'CS-001-COUR' })]);
    expect(resolved.balance).toBe(0);
  });
});

describe('financeService — solde de la caisse Épargne (système SAVINGS AC-009, Coopérative Sutura)', () => {
  it('Épargne SAVINGS porte le report 8 650 000 ; l’ancienne caisse AC-002 n’existe plus dans le jeu de démonstration', async () => {
    expect(await financeService.getCashbox('T-001', 'AC-002')).toBeNull();
    const savings = await financeService.getCashbox('T-001', 'AC-009');
    expect(savings).toMatchObject({ openingBalance: 8_650_000, systemCode: 'SAVINGS', status: 'active' });
  });

  it('le dernier mouvement suit la transaction la plus récente (12 août 2026), pas une valeur figée', async () => {
    const cashbox = await financeService.getCashbox('T-001', 'AC-009');
    expect(cashbox?.lastMovement).toBe('2026-08-12');
  });

  it('après un nouveau crédit de 50 000 le solde augmente de 50 000 et le dernier mouvement se met à jour', async () => {
    const before = await financeService.getCashbox('T-001', 'AC-009');
    await financeService.createTransaction('T-001', {
      cashboxNumber: 'CS-001-CX-001', memberId: 'M-001', memberName: 'Fatou Ndiaye',
      category: 'EPARGNE', type: 'credit', amount: 50_000, description: 'Épargne test solde',
    });
    const after = await financeService.getCashbox('T-001', 'AC-009');
    expect(after!.balance).toBe(before!.balance + 50_000);
    expect(after!.lastMovement).toBe(new Date().toISOString().slice(0, 10));
  });

  it('après un débit de 20 000 le solde diminue de 20 000', async () => {
    const before = await financeService.getCashbox('T-001', 'AC-009');
    await financeService.createTransaction('T-001', {
      cashboxNumber: 'CS-001-CX-001', category: 'AUTRES', subcategory: 'FRAIS',
      type: 'debit', amount: 20_000, description: 'Frais test solde',
    });
    const after = await financeService.getCashbox('T-001', 'AC-009');
    expect(after!.balance).toBe(before!.balance - 20_000);
  });

  it('une transaction annulée ne modifie pas le solde', async () => {
    const before = await financeService.getCashbox('T-001', 'AC-009');
    const created = await financeService.createTransaction('T-001', {
      cashboxNumber: 'CS-001-CX-001', category: 'EPARGNE', type: 'credit', amount: 77_000, description: 'À annuler',
    });
    await financeService.cancelTransaction('T-001', created!.id);
    const after = await financeService.getCashbox('T-001', 'AC-009');
    expect(after!.balance).toBe(before!.balance);
  });
});

describe('resolveCashbox — cohérence panneau ↔ solde (mandat « corriger le calcul du solde »)', () => {
  it('VALIDATION 2 : crédit 100 000 + crédit 50 000 − débit 20 000 = 130 000', () => {
    const resolved = resolveCashbox({ ...baseCashbox, openingBalance: 0 }, [
      entry({ type: 'credit', amount: 100_000 }),
      entry({ type: 'credit', amount: 50_000 }),
      entry({ type: 'debit', amount: 20_000, source: 'CS-001-TEST', destination: 'Tiers' }),
    ]);
    expect(resolved.balance).toBe(130_000);
  });

  it('VALIDATION 3 : deux caisses — le solde de A n’inclut jamais les transactions de B', () => {
    const cashboxA: CashboxRecord = { ...baseCashbox, cashboxNumber: 'CS-001-A', openingBalance: 0 };
    const cashboxB: CashboxRecord = { ...baseCashbox, id: 'AC-B', cashboxNumber: 'CS-001-B', openingBalance: 0 };
    const journal = [
      entry({ type: 'credit', amount: 300_000, destination: 'CS-001-A' }),
      entry({ type: 'credit', amount: 999_000, destination: 'CS-001-B' }),
      entry({ type: 'debit', amount: 40_000, source: 'CS-001-B', destination: 'Tiers' }),
    ];
    expect(resolveCashbox(cashboxA, journal).balance).toBe(300_000);
    expect(resolveCashbox(cashboxB, journal).balance).toBe(959_000);
  });

  it('un virement inter-caisses est compté DES DEUX CÔTÉS : −montant pour l’émettrice, +montant pour la réceptrice (bug corrigé)', () => {
    const source: CashboxRecord = { ...baseCashbox, cashboxNumber: 'CS-001-SRC', openingBalance: 1_000_000 };
    const dest: CashboxRecord = { ...baseCashbox, id: 'AC-DEST', cashboxNumber: 'CS-001-DST', openingBalance: 1_000_000 };
    // Écriture unique : dans le journal du tenant c'est un DÉBIT (perspective émettrice).
    const transfer = entry({ type: 'debit', amount: 500_000, source: 'CS-001-SRC', destination: 'CS-001-DST' });
    expect(resolveCashbox(source, [transfer]).balance).toBe(500_000);
    expect(resolveCashbox(dest, [transfer]).balance).toBe(1_500_000);
    // Les deux fiches voient bien la ligne (prédicat identique au panneau).
    expect(cashboxLedgerEntries(source, [transfer])).toHaveLength(1);
    expect(cashboxLedgerEntries(dest, [transfer])).toHaveLength(1);
  });

  it('VALIDATION 4 : le solde agrège TOUTES les transactions de la caisse, pas seulement une page', () => {
    const many = Array.from({ length: 50 }, (_, i) => entry({ type: 'credit', amount: 1_000, date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}` }));
    expect(resolveCashbox({ ...baseCashbox, openingBalance: 0 }, many).balance).toBe(50_000);
  });

  it('VALIDATION 6 : aucune valeur de solde n’est stockée dans le seed — `balance`/`lastMovement` sont absents des enregistrements', () => {
    for (const record of cashboxes) {
      expect(Object.keys(record)).not.toContain('balance');
      expect(Object.keys(record)).not.toContain('lastMovement');
    }
  });

  it('AC-012 « Transport » : solde 3 000 = report 0 + 3 cotisations de 5 000 (TR-006, TR-010, TR-018) − frais 12 000 (TR-019), démontré transaction par transaction', async () => {
    const record = cashboxes.find((a) => a.id === 'AC-012')!;
    // Périmètre : uniquement les écritures completed de T-001 où CS-001-CX-004 est source OU destination.
    const ledger = cashboxLedgerEntries(record, transactions);
    expect(ledger.map((tr) => tr.id).sort()).toEqual(['TR-006', 'TR-010', 'TR-018', 'TR-019']);
    // Effet signé de chaque écriture DU POINT DE VUE de la caisse Transport.
    expect(cashboxEntryEffect('CS-001-CX-004', transactions.find((tr) => tr.id === 'TR-006')!)).toBe(5_000); // cotisation Fatou
    expect(cashboxEntryEffect('CS-001-CX-004', transactions.find((tr) => tr.id === 'TR-019')!)).toBe(-12_000); // frais de transport
    const variationNette = ledger.reduce((sum, tr) => sum + cashboxEntryEffect('CS-001-CX-004', tr), 0);
    expect(variationNette).toBe(3_000);
    expect(record.openingBalance).toBe(0);
    expect(resolveCashbox(record, transactions).balance).toBe(3_000);
    const cashbox = await financeService.getCashbox('T-001', 'AC-012');
    expect(cashbox?.balance).toBe(3_000);
  });

  it('AC-011 « Secours » : solde = report + son propre journal (3 cotisations de 12 000 − aide 20 000), pas une constante figée', async () => {
    const cashbox = await financeService.getCashbox('T-001', 'AC-011');
    expect(cashbox?.openingBalance).toBe(0);
    // 12 000 × 3 (TR-020, TR-021, TR-022) − aide secours 20 000 (TR-023) = 16 000
    expect(cashbox?.balance).toBe(16_000);
    const ledger = cashboxLedgerEntries(cashboxes.find((a) => a.id === 'AC-011')!, [
      { type: 'debit', amount: 500_000, status: 'completed', tenantId: 'T-001', source: 'CS-001-CX-001', destination: 'CS-001-CX-003', date: '2026-08-03' },
    ]);
    expect(ledger).toHaveLength(1); // un virement inter-caisses reçu est bien rattaché à la caisse réceptrice
  });
});
