import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { financeService, insertTransaction, type TransactionInput } from './finance.service';
import { transactions } from '@/mocks/finance/transactions';
import { AUTRES_SUBCATEGORIES, isTransactionTypeAllowed, requiredTransactionType, type TransactionCategory, type TransactionSubcategory } from '@/mocks/finance/transaction-classification';

/**
 * TYPE DES TRANSACTIONS — règle définitive (mandat 2026-09-25), appliquée par le
 * SERVICE indépendamment de toute interface :
 *   Épargne, Inscription, Achat tontine, Secours, Remboursement → CRÉDIT ; Prêt → DÉBIT
 *   (Prêt = AUTRES / PRET, Remboursement = AUTRES / REMBOURSEMENT depuis le mandat 2026-09-25) ;
 *   Autres (toute autre sous-catégorie) → crédit OU débit.
 * Un type incompatible est REFUSÉ (jamais forcé en silence : cela inverserait le sens de l'argent).
 */
const SEED = structuredClone(transactions);
beforeEach(() => { transactions.splice(0, transactions.length, ...structuredClone(SEED)); });
afterEach(() => { transactions.splice(0, transactions.length, ...structuredClone(SEED)); });

const input = (category: TransactionCategory, subcategory: TransactionSubcategory | null, type: 'credit' | 'debit'): TransactionInput => ({
  cashboxNumber: 'CS-001-CX-004', memberId: 'M-016', memberName: 'Modou Faye', category, subcategory, type, amount: 10_000, description: 'règle de type',
});

const OPERATIONS: [string, TransactionCategory, TransactionSubcategory | null, 'credit' | 'debit' | null][] = [
  ['Épargne', 'EPARGNE', null, 'credit'],
  ['Inscription', 'AUTRES', 'INSCRIPTION', 'credit'],
  ['Achat tontine', 'AUTRES', 'ACHAT_TONTINE', 'credit'],
  ['Secours', 'AUTRES', 'SECOURS', 'credit'],
  ['Prêt', 'AUTRES', 'PRET', 'debit'],
  ['Remboursement', 'AUTRES', 'REMBOURSEMENT', 'credit'],
  ['Autres (Frais)', 'AUTRES', 'FRAIS', null],
];

describe('requiredTransactionType — source unique de la règle', () => {
  it.each(OPERATIONS)('%s → %s', (_label, category, subcategory, expected) => {
    expect(requiredTransactionType(category, subcategory)).toBe(expected);
  });

  it('« Autres » : seules Inscription / Achat tontine / Secours / Prêt / Remboursement imposent un type ; toutes les autres sous-catégories sont libres', () => {
    const forced = AUTRES_SUBCATEGORIES.filter((subcategory) => requiredTransactionType('AUTRES', subcategory) !== null);
    expect(forced).toEqual(['INSCRIPTION', 'ACHAT_TONTINE', 'SECOURS', 'PRET', 'REMBOURSEMENT']);
    expect(requiredTransactionType('AUTRES', '')).toBeNull();
    expect(requiredTransactionType('', null)).toBeNull();
  });

  it('isTransactionTypeAllowed : type imposé respecté, type inconnu toujours refusé', () => {
    expect(isTransactionTypeAllowed('AUTRES', 'PRET', 'debit')).toBe(true);
    expect(isTransactionTypeAllowed('AUTRES', 'PRET', 'credit')).toBe(false);
    expect(isTransactionTypeAllowed('AUTRES', 'REMBOURSEMENT', 'credit')).toBe(true);
    expect(isTransactionTypeAllowed('AUTRES', 'REMBOURSEMENT', 'debit')).toBe(false);
    expect(isTransactionTypeAllowed('AUTRES', 'FRAIS', 'debit')).toBe(true);
    expect(isTransactionTypeAllowed('AUTRES', 'FRAIS', 'transfer')).toBe(false);
  });
});

describe('insertTransaction — le service impose la règle, même hors interface', () => {
  it.each([
    ['1. Épargne → Crédit', 'EPARGNE', null, 'credit'],
    ['2. Inscription → Crédit', 'AUTRES', 'INSCRIPTION', 'credit'],
    ['3. Achat tontine → Crédit', 'AUTRES', 'ACHAT_TONTINE', 'credit'],
    ['4. Secours → Crédit', 'AUTRES', 'SECOURS', 'credit'],
    ['5. Prêt → Débit', 'AUTRES', 'PRET', 'debit'],
    ['6. Remboursement → Crédit', 'AUTRES', 'REMBOURSEMENT', 'credit'],
    ['7. Autres → Crédit accepté', 'AUTRES', 'FRAIS', 'credit'],
    ['8. Autres → Débit accepté', 'AUTRES', 'FRAIS', 'debit'],
  ] as const)('%s', (_label, category, subcategory, type) => {
    const created = insertTransaction('T-001', input(category, subcategory, type));
    expect(created).toMatchObject({ category, type, ...(subcategory ? { subcategory } : {}) });
  });

  it.each([
    ['Épargne en débit', 'EPARGNE', null, 'debit'],
    ['Inscription en débit', 'AUTRES', 'INSCRIPTION', 'debit'],
    ['Achat tontine en débit', 'AUTRES', 'ACHAT_TONTINE', 'debit'],
    ['Secours en débit', 'AUTRES', 'SECOURS', 'debit'],
    ['Prêt en crédit', 'AUTRES', 'PRET', 'credit'],
    ['Remboursement en débit', 'AUTRES', 'REMBOURSEMENT', 'debit'],
  ] as const)('refuse %s — aucune écriture, jamais un type forcé en silence', (_label, category, subcategory, type) => {
    const before = transactions.length;
    expect(insertTransaction('T-001', input(category, subcategory, type))).toBeUndefined();
    expect(transactions.length).toBe(before);
  });

  it('createTransaction (API) applique la même règle', async () => {
    expect(await financeService.createTransaction('T-001', input('AUTRES', 'PRET', 'credit'))).toBeNull();
    expect(await financeService.createTransaction('T-001', input('AUTRES', 'PRET', 'debit'))).toMatchObject({ type: 'debit' });
  });
});

describe('updateTransaction — la règle s’applique à l’opération RÉSULTANTE, avant toute écriture', () => {
  it('Autres/Frais débit → passer en Épargne sans changer le type est refusé ; rien n’est modifié', async () => {
    const created = insertTransaction('T-001', input('AUTRES', 'FRAIS', 'debit'))!;
    expect(await financeService.updateTransaction('T-001', created.id, { category: 'EPARGNE', subcategory: null, amount: 99_999 })).toBeNull();
    expect(transactions.find((tx) => tx.id === created.id)).toMatchObject({ category: 'AUTRES', subcategory: 'FRAIS', type: 'debit', amount: 10_000 });
  });

  it('changement d’opération accompagné du type imposé : accepté', async () => {
    const created = insertTransaction('T-001', input('AUTRES', 'FRAIS', 'debit'))!;
    expect(await financeService.updateTransaction('T-001', created.id, { category: 'EPARGNE', subcategory: null, type: 'credit' })).toMatchObject({ category: 'EPARGNE', type: 'credit' });
  });

  it('un type seul incompatible avec l’opération existante est refusé (Prêt → crédit) ; « Autres » libre reste modifiable', async () => {
    const loan = insertTransaction('T-001', input('AUTRES', 'PRET', 'debit'))!;
    expect(await financeService.updateTransaction('T-001', loan.id, { type: 'credit' })).toBeNull();
    const other = insertTransaction('T-001', input('AUTRES', 'TRANSFERT', 'debit'))!;
    expect(await financeService.updateTransaction('T-001', other.id, { type: 'credit' })).toMatchObject({ type: 'credit' });
  });

  it('Autres / Inscription → Autres / Frais : le débit redevient permis', async () => {
    const created = insertTransaction('T-001', input('AUTRES', 'INSCRIPTION', 'credit'))!;
    expect(await financeService.updateTransaction('T-001', created.id, { subcategory: 'SECOURS', type: 'debit' })).toBeNull();
    expect(await financeService.updateTransaction('T-001', created.id, { subcategory: 'FRAIS', type: 'debit' })).toMatchObject({ subcategory: 'FRAIS', type: 'debit' });
  });
});
