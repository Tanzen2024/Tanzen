import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { OperationsModule } from './operations-module';
import { creditService } from '@/services/credit.service';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { guarantors } from '@/mocks/finance/guarantors';
import { auditEvents } from '@/mocks/audit/audit-events';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { tenantCreditRule } from '@/mocks/finance/loan-rules';

/**
 * Opérations → Workflows : demande d'approbation d'un prêt (mandat du 2026-09-27). Utilisateur
 * connecté : U-001 Amadou Mbaye (Administrateur → `loans.approve.admin`). Demande soumise par
 * U-002 Fatou Ndiaye, sauf pour le cas d'auto-approbation.
 */
const stores = { transactions, loans, loanFundingAllocations, applications, guarantors, auditEvents, workflowRequests } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
beforeEach(restore);
afterEach(restore);

async function submit(requesterId = 'U-002', requester = 'Fatou Ndiaye') {
  return (await creditService.submitLoanApplication('T-001', { memberId: 'M-016', requestedAmount: 200_000, purpose: 'Équipement', guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 200_000, relation: 'Membre' }] }, requester, requesterId))!;
}
function renderOperations(route: string) {
  return renderWithProviders(<Routes><Route path="/operations/*" element={<OperationsModule />} /></Routes>, { route });
}
const compact = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ');

describe('Workflows — demande d’approbation d’un prêt', { timeout: 30_000 }, () => {
  it('détail : informations du prêt, prise en charge EN COURS, puis Approuver avec commentaire → APPROUVÉ et « Décaisser » disponible', async () => {
    const user = userEvent.setup();
    const { application, request } = await submit();
    renderOperations(`/operations/workflows/${request.id}`);

    const details = await screen.findByTestId('loan-request-details');
    const text = compact(details.textContent);
    expect(text).toContain('Modou Faye');
    expect(text).toMatch(/200 000 FCFA/);
    expect(text).toContain('Caisse de financementÉpargne'); // toujours Épargne (SAVINGS), caisse prioritaire des prêts
    expect(text).toContain('12 % · Composé · Mensuel');
    // Valeur de la règle de crédit EN VIGUEUR (démo 2026-09-27 : « Garant requis » OFF) — jamais une valeur figée.
    expect(text).toContain(`Garant requis${tenantCreditRule('T-001')!.requiresGuarantor ? 'Oui' : 'Non'}`);
    expect(text).toMatch(/Cheikh Diop \(200 000 FCFA\)/);
    expect(screen.getByText('Fatou Ndiaye')).toBeInTheDocument(); // demandeur
    expect(screen.getAllByText('Approbation administrateur').length).toBeGreaterThan(0); // étape actuelle
    // Ouverture par un approbateur habilité : statut EN COURS (jamais choisi dans une liste).
    expect(await screen.findByText('En cours')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /statut/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approuver' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Commentaire' }), 'Dossier complet');
    await user.click(within(dialog).getByRole('button', { name: 'Approuver' }));

    await vi.waitFor(() => expect(workflowRequests.find((item) => item.id === request.id)?.status).toBe('approved'));
    expect(workflowRequests.find((item) => item.id === request.id)?.steps[0]).toMatchObject({ actedBy: 'U-001', comment: 'Dossier complet' });
    expect(applications.find((item) => item.id === application.id)?.stage).toBe('stageApproved');
    expect(await screen.findByRole('button', { name: 'Décaisser' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
  });

  it('Refuser → demande et prêt REFUSÉS, aucun décaissement proposé', async () => {
    const user = userEvent.setup();
    const { application, request } = await submit();
    renderOperations(`/operations/workflows/${request.id}`);
    await screen.findByTestId('loan-request-details');
    await user.click(await screen.findByRole('button', { name: 'Refuser' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Commentaire' }), 'Endettement trop élevé');
    await user.click(within(dialog).getByRole('button', { name: 'Refuser' }));
    await vi.waitFor(() => expect(workflowRequests.find((item) => item.id === request.id)?.status).toBe('rejected'));
    expect(applications.find((item) => item.id === application.id)?.stage).toBe('stageRejected');
    expect(await screen.findByText('Refusé')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Décaisser' })).not.toBeInTheDocument();
  });

  it('sa propre demande : ni Approuver ni Refuser, statut inchangé (EN ATTENTE)', async () => {
    const { request } = await submit('U-001', 'Amadou Mbaye');
    renderOperations(`/operations/workflows/${request.id}`);
    expect(await screen.findByTestId('self-approval-notice')).toHaveTextContent('Vous ne pouvez pas approuver ou rejeter votre propre demande.');
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    expect(screen.getAllByText('En attente').length).toBeGreaterThan(0);
    expect(screen.queryByText('En cours')).not.toBeInTheDocument(); // sa propre demande ne peut pas être prise en charge
    expect(workflowRequests.find((item) => item.id === request.id)?.status).toBe('pending');
  });
});

describe('Workflows — onglets Demandes et « Mes approbations »', { timeout: 30_000 }, () => {
  it('Demandes liste la demande de prêt (montant, étape, statut, date) ; Mes approbations ne montre que ce que l’utilisateur peut traiter, avec Refuser / Approuver', async () => {
    const user = userEvent.setup();
    const other = await submit('U-002', 'Fatou Ndiaye');
    const own = await submit('U-001', 'Amadou Mbaye');
    renderOperations('/operations/workflows');
    const requestsTable = await screen.findByRole('table');
    const otherRow = within(requestsTable).getByText(other.request.entityLabel).closest('tr') as HTMLElement;
    expect(compact(otherRow.textContent)).toMatch(/200 000 FCFA/);
    expect(otherRow).toHaveTextContent('Approbation administrateur');
    expect(otherRow).toHaveTextContent('En attente');
    expect(within(requestsTable).getByText(own.request.entityLabel)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Mes approbations/ }));
    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getByText(other.request.entityLabel)).toBeInTheDocument();
    expect(within(panel).queryByText(own.request.entityLabel)).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: `Approuver ${other.request.entityLabel}` }));
    // La décision s'ouvre sur la demande, commentaire possible, confirmation requise.
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Approuver' }));
    await vi.waitFor(() => expect(workflowRequests.find((item) => item.id === other.request.id)?.status).toBe('approved'));
  });
});
