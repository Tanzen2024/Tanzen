import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { repayments } from '@/mocks/finance/repayments';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';
import { fiscalSessionService } from '@/services/fiscal-session.service';

/**
 * SÉPARATION CAISSES / CRÉDIT (mandat 2026-09-25) — côté écrans : la caisse est
 * présentée comme celle du DÉCAISSEMENT (prêt) ou de l'ENCAISSEMENT (remboursement),
 * la fiche prêt liste les mouvements financiers qu'il a produits, et la fiche
 * transaction renvoie vers le prêt / le remboursement concerné.
 */
const stores = { transactions, loans, repayments, loanFundingAllocations, fiscalSessions } as const;
let snapshot: Record<keyof typeof stores, unknown[]>;
beforeEach(() => { snapshot = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as typeof snapshot; });
afterEach(() => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(snapshot[name as keyof typeof stores])); });

function renderFinance(route: string) {
  return renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route });
}

describe('Séparation Caisses / Crédit — écrans', { timeout: 20_000 }, () => {
  it('saisie détaillée : « Caisse prioritaire » Épargne imposée pour un prêt (sens fixé au débit), « Caisse d’encaissement » pour un remboursement', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/create');
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-004"]')).not.toBeNull());
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'PRET');
    // Mandat du 2026-09-27 : aucun choix de caisse pour un prêt — Épargne, en lecture seule.
    expect(screen.getByLabelText(/^Caisse prioritaire/)).toHaveValue('Épargne');
    expect(screen.getByText(/Les prêts sont financés en priorité par la caisse Épargne\./)).toBeInTheDocument();
    // Type imposé par l'opération (mandat « Type des transactions ») : affiché, figé sur Débit, non modifiable.
    expect(screen.getByLabelText(/^Type/)).toHaveValue('debit');
    expect(screen.getByLabelText(/^Type/)).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'REMBOURSEMENT');
    expect(screen.getByLabelText(/^Caisse d’encaissement/)).toBeInTheDocument();
    expect(screen.getByText(/seul l’encaissement est enregistré dans cette caisse\./)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');
    expect(screen.getByLabelText(/^Caisse \*/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Type/)).toBeInTheDocument();
  });

  it('fiche prêt : « Mouvements financiers du prêt » liste le décaissement, avec SA caisse, et ouvre la transaction', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/credit/loans/L-001');
    const card = await screen.findByTestId('loan-movements');
    expect(within(card).getByText('Mouvements financiers du prêt')).toBeInTheDocument();
    const row = (await within(card).findByText('REF-2026-0002')).closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('Décaissement');
    expect(row).toHaveTextContent('Épargne');
    expect(row).toHaveTextContent(/850\s000\sFCFA/);
    await user.click(row);
    expect(await screen.findByRole('heading', { name: 'REF-2026-0002' })).toBeInTheDocument();
  });

  it('fiche transaction : « Prêt concerné » renvoie vers la fiche du prêt (transaction → prêt)', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/TR-002');
    await screen.findByRole('heading', { name: 'REF-2026-0002' });
    expect(screen.getByText('Prêt concerné')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'L-001' }));
    expect(await screen.findByRole('heading', { name: 'L-001' })).toBeInTheDocument();
  });

  it('un remboursement saisi : l’encaissement référence remboursement + prêt, visibles sur la fiche transaction et sur la fiche prêt', async () => {
    const { creditService } = await import('@/services/credit.service');
    const result = (await creditService.createRepaymentTransaction('T-001', { loanId: 'L-001', paymentDate: '2026-09-15', amount: 100_000, transactionInput: { cashboxNumber: 'CS-001-CX-001', memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', amount: 100_000, description: 'Encaissement test' } }))!;
    renderFinance(`/finance/transactions/${result.transaction.id}`);
    await screen.findByRole('heading', { name: result.transaction.reference });
    expect(screen.getByText('Remboursement concerné')).toBeInTheDocument();
    expect(screen.getByText(result.repayment.id)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'L-001' })).toBeInTheDocument();
  });

  it('saisie rapide Remboursement : caisse d’encaissement, note d’encaissement, répartition capital / intérêts calculée par le métier', async () => {
    const user = userEvent.setup();
    // Remboursement daté de la séance courante : FS-001 (14/07) précède le décaissement de L-001 (dette nulle à cette date).
    await fiscalSessionService.createSession('T-001', 'FY-T001-2026', new Date().toISOString().slice(0, 10));
    renderFinance('/finance/transactions/quick-entry?cashboxId=AC-012');
    await screen.findByRole('heading', { name: 'Transactions' });
    await waitFor(() => expect((screen.getByLabelText(/^Caisse/) as HTMLSelectElement).value).toBe('CS-001-CX-004'));
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'REMBOURSEMENT');
    expect(screen.getByLabelText(/^Caisse d’encaissement/)).toBeInTheDocument();
    expect(screen.getByTestId('quick-entry-movement-note')).toHaveTextContent('Encaissement dans « Transport » : une transaction de crédit par remboursement');
    const row = screen.getAllByTestId('quick-entry-row')[0];
    await user.click(within(row).getByRole('combobox'));
    await user.type(await screen.findByPlaceholderText(/Rechercher \(nom ou matricule\)/), 'Fatou');
    await user.click(await screen.findByRole('option', { name: /Fatou/ }));
    await user.type(within(row).getByLabelText('Montant de la ligne 1'), '100000');
    expect(within(row).getByTestId('quick-entry-repayment-split')).toHaveTextContent(/Prêt L-001 · Capital 89\s286\sFCFA · Intérêts 10\s714\sFCFA/);
  });
});
