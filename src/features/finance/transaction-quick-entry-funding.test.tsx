import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { repayments } from '@/mocks/finance/repayments';
import { guarantors } from '@/mocks/finance/guarantors';
import { cashboxes, resolveCashbox } from '@/mocks/finance/cashboxes';
import { loanRules } from '@/mocks/finance/loan-rules';
import { auditEvents } from '@/mocks/audit/audit-events';

/**
 * Parcours « Caisse → Nouvelle transaction → Prêt » avec financement multi-caisses (mandat du
 * 2026-09-26). La règle unique LR-001 est reconfigurée sans garant ni approbation pour que seul
 * le financement conditionne la ligne.
 */
const stores = { transactions, loans, loanFundingAllocations, applications, repayments, guarantors, auditEvents, cashboxes, loanRules } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
beforeEach(() => {
  restore();
  Object.assign(loanRules.find((rule) => rule.id === 'LR-001')!, { requiresGuarantor: false, minGuarantors: 0, requiresApproval: false, approvalLevel: null, minAmount: 20_000, maxAmount: 1_000_000 });
});
afterEach(restore);

/** Fixe le disponible exact d'une caisse : le report compense le journal de démonstration déjà présent. */
const setBalance = (id: string, amount: number) => {
  const cashbox = cashboxes.find((item) => item.id === id)!;
  cashbox.openingBalance = 0;
  cashbox.openingBalance = amount - resolveCashbox(cashbox, transactions).balance;
};
type User = ReturnType<typeof userEvent.setup>;

async function openLoanEntry(user: User, cashboxId: string) {
  renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route: `/finance/transactions/quick-entry?cashboxId=${cashboxId}` });
  await screen.findByRole('heading', { name: 'Transactions' });
  await waitFor(() => expect((screen.getByLabelText(/^Caisse/) as HTMLSelectElement).value).not.toBe(''));
  await user.selectOptions(screen.getByLabelText(/^Action \*/), 'PRET');
  await screen.findByTestId('quick-entry-loan-rule');
}
async function fillLoan(user: User, member: string, amount: string) {
  const row = screen.getAllByTestId('quick-entry-row')[0];
  await user.click(within(row).getByRole('combobox'));
  await user.type(await screen.findByPlaceholderText(/Rechercher \(nom ou matricule\)/), member);
  await user.click(await screen.findByRole('option', { name: new RegExp(member) }));
  await user.type(within(row).getByLabelText('Montant de la ligne 1'), amount);
}
const saveButton = () => screen.getByRole('button', { name: /^Enregistrer \d+ prêts?$/ });

describe('Saisie rapide — prêt financé par plusieurs caisses', { timeout: 30_000 }, () => {
  it('caisse courante suffisante : « entièrement couvert », aucune autre caisse proposée, une seule transaction', async () => {
    const user = userEvent.setup();
    setBalance('AC-009', 200_000);
    setBalance('AC-010', 200_000);
    await openLoanEntry(user, 'AC-009');
    // Caisse imposée (2026-09-27) : Épargne, en lecture seule — jamais choisie.
    expect(screen.getByLabelText(/^Caisse prioritaire/)).toHaveValue('Épargne');
    await fillLoan(user, 'Modou', '150000');
    expect(await screen.findByTestId('loan-funding-covered')).toHaveTextContent('Financement entièrement couvert par la caisse « Épargne ».');
    expect(screen.queryByTestId('loan-funding-complements')).not.toBeInTheDocument();
    const before = transactions.length;
    await user.click(saveButton());
    await screen.findByRole('heading', { name: 'Épargne' });
    expect(transactions.slice(before).map((tx) => [tx.source, tx.amount])).toEqual([['CS-001-CX-001', 150_000]]);
  });

  it('caisse courante insuffisante : message exact, autres caisses proposées, complément → UN prêt, deux débits', async () => {
    const user = userEvent.setup();
    setBalance('AC-009', 110_000);
    setBalance('AC-010', 200_000);
    await openLoanEntry(user, 'AC-009');
    await fillLoan(user, 'Modou', '150000');
    const alert = await screen.findByTestId('loan-funding-insufficient');
    expect(alert.textContent?.replace(/\s/g, ' ')).toMatch(/Fonds insuffisants dans la caisse Épargne\. La caisse dispose actuellement de 110 000 FCFA pour un prêt de 150 000 FCFA\. Il reste 40 000 FCFA à financer\./);
    const complements = screen.getByTestId('loan-funding-complements');
    expect(within(complements).getByText(/Inscription — disponible : 200\s000\sFCFA/)).toBeInTheDocument();
    // Jamais Épargne elle-même (AC-009, 110 000).
    expect(within(complements).queryAllByText(/^Épargne —/)).toHaveLength(0);
    expect(saveButton()).toBeDisabled();
    expect(screen.getByTestId('quick-entry-row-status')).toHaveTextContent('Financement incomplet');

    await user.click(within(complements).getByRole('checkbox', { name: 'Utiliser la caisse Inscription' }));
    expect(within(complements).getByLabelText('Montant pris sur Inscription')).toHaveValue('40 000'); // format de l'association (FCFA : espace, 0 décimale) ; // pré-rempli au reliquat, jamais au-delà
    expect(await screen.findByTestId('loan-funding-complete')).toHaveTextContent('Financement entièrement couvert.');
    expect(saveButton()).toBeEnabled();

    const loanCount = loans.length;
    const before = transactions.length;
    await user.click(saveButton());
    await screen.findByRole('heading', { name: 'Épargne' });
    expect(loans.length).toBe(loanCount + 1);
    expect(loans[loans.length - 1].principal).toBe(150_000);
    expect(transactions.slice(before).map((tx) => [tx.source, tx.amount, tx.loanId])).toEqual([
      ['CS-001-CX-001', 110_000, loans[loans.length - 1].id],
      ['CS-001-CX-002', 40_000, loans[loans.length - 1].id],
    ]);
  });

  it('un complément trop élevé bloque l’enregistrement (Σ > montant du prêt)', async () => {
    const user = userEvent.setup();
    setBalance('AC-009', 110_000);
    setBalance('AC-010', 200_000);
    await openLoanEntry(user, 'AC-009');
    await fillLoan(user, 'Modou', '150000');
    const complements = await screen.findByTestId('loan-funding-complements');
    await user.click(within(complements).getByRole('checkbox', { name: 'Utiliser la caisse Inscription' }));
    const amount = within(complements).getByLabelText('Montant pris sur Inscription');
    await user.clear(amount);
    await user.type(amount, '50000');
    expect(await screen.findByText(/Le total des financements dépasse le montant du prêt/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('aucune combinaison de caisses ne suffit : « il manque encore … », enregistrement impossible', async () => {
    const user = userEvent.setup();
    // Seules Épargne (110 000) et Inscription (20 000) disposent de fonds : Secours et Transport (journal de démonstration) sont ramenées à 0.
    setBalance('AC-011', 0);
    setBalance('AC-012', 0);
    setBalance('AC-009', 110_000);
    setBalance('AC-010', 20_000);
    await openLoanEntry(user, 'AC-009');
    await fillLoan(user, 'Modou', '150000');
    const unfundable = await screen.findByTestId('loan-funding-unfundable');
    expect(unfundable.textContent?.replace(/\s/g, ' ')).toMatch(/Financement insuffisant\. Après utilisation des fonds disponibles, il manque encore 20 000 FCFA pour financer ce prêt\./);
    expect(saveButton()).toBeDisabled();
  });
});
