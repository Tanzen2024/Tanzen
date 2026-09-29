import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { OperationsModule } from '@/features/operations/operations-module';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { guarantors } from '@/mocks/finance/guarantors';
import { auditEvents } from '@/mocks/audit/audit-events';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { creditService } from '@/services/credit.service';

/**
 * DÉFAUT CORRIGÉ (2026-09-28) : une demande de prêt soumise n'apparaissait pas dans le module
 * Workflow. Cause : aucun écran de soumission n'invalidait le cache `['operations']`, conservé 30 s
 * (`staleTime` de production, src/app/providers.tsx) — la liste déjà consultée restait affichée sans la
 * demande. Ce test reproduit ce cache réel (staleTime 30 000).
 */
const stores = { transactions, loans, loanFundingAllocations, applications, guarantors, auditEvents, workflowRequests } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
beforeEach(restore);
afterEach(restore);

function Nav() {
  const navigate = useNavigate();
  return <>
    <button type="button" onClick={() => navigate('/operations/workflows')}>nav-workflows</button>
    <button type="button" onClick={() => navigate('/finance/credit/applications/create')}>nav-new-application</button>
  </>;
}
function renderApp(route: string) {
  return renderWithProviders(<><Nav /><Routes>
    <Route path="/finance/*" element={<FinanceModule />} />
    <Route path="/operations/*" element={<OperationsModule />} />
  </Routes></>, { route, staleTime: 30_000 });
}

describe('Demande de prêt → module Workflow (cache réel de 30 s)', { timeout: 30_000 }, () => {
  it('soumise depuis « Nouvelle demande », elle apparaît aussitôt dans la liste du workflow déjà consultée', async () => {
    const user = userEvent.setup();
    renderApp('/operations/workflows');
    // Liste déjà consultée et mise en cache (demandes de démonstration de T-001, dont WR-006 « AGE Budget Q3 »).
    expect(await screen.findByText('AGE Budget Q3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'nav-new-application' }));
    await user.selectOptions(await screen.findByLabelText('Sélectionner un adhérent'), 'M-016');
    await user.type(screen.getByLabelText(/^Montant demandé/), '200000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(applications.some((item) => item.memberId === 'M-016' && item.stage === 'stageSubmitted')).toBe(true));
    const application = applications.find((item) => item.memberId === 'M-016' && item.stage === 'stageSubmitted')!;
    // Fiche de la demande : demandeur, montant, statut.
    expect(await screen.findByTestId('loan-request-details')).toHaveTextContent('Modou Faye');
    await user.click(screen.getByRole('button', { name: 'nav-workflows' }));
    expect(await screen.findByText(`Prêt ${application.id} · Modou Faye`)).toBeInTheDocument();
    // Aucune transaction à la soumission.
    expect(transactions.some((tx) => tx.memberId === 'M-016' && tx.subcategory === 'PRET')).toBe(false);
  });

  it('après décaissement : la fiche affiche le prêt décaissé (plus de bouton « Décaisser »), la transaction porte les conditions du prêt', async () => {
    const user = userEvent.setup();
    const submitted = (await creditService.submitLoanApplication('T-001', { memberId: 'M-016', requestedAmount: 200_000, purpose: 'Équipement' }, 'Fatou Ndiaye', 'U-002'))!;
    renderApp(`/operations/workflows/${submitted.request.id}`);
    await user.click(await screen.findByRole('button', { name: 'Approuver' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approuver' }));
    const disburse = await screen.findByRole('button', { name: /Décaisser/ });
    await user.click(disburse);
    expect(await screen.findByTestId('loan-disbursed')).toHaveTextContent(/Prêt décaissé : L-\d+/);
    expect(screen.queryByRole('button', { name: /Décaisser/ })).not.toBeInTheDocument();
    const loan = loans.find((item) => item.applicationId === submitted.application.id)!;
    const tx = transactions.find((item) => item.loanId === loan.id)!;
    await user.click(screen.getByRole('button', { name: 'nav-workflows' }));
    renderApp(`/finance/transactions/${tx.id}`);
    expect(await screen.findByText('Conditions du prêt (à l’octroi)')).toBeInTheDocument();
    expect(screen.getByText(/Intérêt composé — 12 % par mois/)).toBeInTheDocument();
    expect(screen.getByText('Demande approuvée')).toBeInTheDocument();
    expect(screen.getByText(/Épargne 200/)).toBeInTheDocument();
  });
});
