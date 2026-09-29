import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { ShellHeader } from '@/layouts/shell-header';
import { OperationsModule } from './operations-module';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { guarantors } from '@/mocks/finance/guarantors';
import { auditEvents } from '@/mocks/audit/audit-events';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { currentUser } from '@/mocks/rbac.mocks';
import { actAsDemoUser, resetDemoIdentity } from '@/mocks/demo-identity';
import { creditService } from '@/services/credit.service';
import { workflowService, permissionsOfUser } from '@/services/workflow.service';

/**
 * BUG (2026-09-28) : une demande de prêt de 120 000 visible dans « Demandes » mais absente de
 * « Mes approbations ». CAUSE : l'affectation était correcte (étape « Approbation administrateur »,
 * permission `loans.approve.admin`), mais le seul utilisateur exploitable dans l'interface — U-001,
 * aucune authentification réelle — était aussi celui qui avait SAISI la demande, écarté à juste titre
 * par la séparation des tâches (saisisseur ≠ approbateur, décision confirmée). CORRECTION : identité
 * de démonstration « Agir en tant que » (menu utilisateur) + approbateurs habilités affichés sur la demande.
 */
const stores = { transactions, loans, loanFundingAllocations, applications, guarantors, auditEvents, workflowRequests } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); resetDemoIdentity(); };
beforeEach(restore);
afterEach(restore);

function Nav() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/operations/workflows')}>nav-workflows</button>;
}
function renderApp(route: string) {
  return renderWithProviders(<><ShellHeader /><Nav /><Routes><Route path="/operations/*" element={<OperationsModule />} /></Routes></>, { route, staleTime: 30_000 });
}
const submit120k = async () => (await creditService.submitLoanApplication('T-001', { memberId: 'M-016', requestedAmount: 120_000, purpose: 'Équipement' }, currentUser.name, currentUser.id))!;
type User = ReturnType<typeof userEvent.setup>;
async function actAs(user: User, userId: string) {
  await user.click(screen.getByRole('button', { name: 'Menu utilisateur' }));
  await user.click(screen.getByTestId(`act-as-${userId}`));
}
async function openMyApprovals(user: User) {
  await user.click(await screen.findByRole('tab', { name: /Mes approbations/ }));
  return screen.findByRole('tabpanel');
}

describe('Demande de prêt → « Mes approbations » de l’approbateur habilité', { timeout: 30_000 }, () => {
  it('affectation : étape « Approbation administrateur » (loans.approve.admin) → tous les admins actifs SAUF le saisisseur', async () => {
    const { request } = await submit120k();
    expect(request).toMatchObject({ domain: 'credit', status: 'pending', requestedByUserId: 'U-001', currentStepOrder: 1 });
    expect(request.steps).toEqual([expect.objectContaining({ name: 'Approbation administrateur', approverPermission: 'loans.approve.admin', status: 'pending' })]);
    expect(await workflowService.listEligibleApprovers('T-001', request.id)).toEqual([{ id: 'U-013', name: 'Jeanne Mbarga' }, { id: 'U-014', name: 'Paul Ekotto' }]);
    const mine = async (userId: string) => (await workflowService.listMyApprovals('T-001', permissionsOfUser('T-001', userId), userId)).some((item) => item.id === request.id);
    expect(await mine('U-001')).toBe(false); // saisisseur
    expect(await mine('U-013')).toBe(true);
    expect(await mine('U-014')).toBe(true);
    expect(await mine('U-002')).toBe(false); // gestionnaire : permission insuffisante
    expect(await mine('U-003')).toBe(false); // lecteur
    // Autre tenant : jamais visible, même avec la permission.
    expect((await workflowService.listMyApprovals('T-002', permissionsOfUser('T-002', 'U-012'), 'U-012')).some((item) => item.id === request.id)).toBe(false);
  });

  it('parcours complet : saisie par Amadou → absente de SES approbations → Jeanne la voit, l’ouvre, l’approuve → décaissement unique', async () => {
    const user = userEvent.setup();
    const { request, application } = await submit120k();
    const label = `Prêt ${application.id} · Modou Faye`;
    renderApp('/operations/workflows');
    // « Demandes » : visible par tous.
    expect(await screen.findByText(label)).toBeInTheDocument();
    // Saisisseur : absente de « Mes approbations ».
    expect(within(await openMyApprovals(user)).queryByText(label)).not.toBeInTheDocument();

    await actAs(user, 'U-013');
    expect(currentUser).toMatchObject({ id: 'U-013', name: 'Jeanne Mbarga' });
    await waitFor(() => expect(within(screen.getByRole('tabpanel')).getByText(label)).toBeInTheDocument());

    // Ouverture depuis « Mes approbations » : détail, étape courante, approbateurs habilités.
    await user.click(within(screen.getByRole('tabpanel')).getByText(label));
    expect(await screen.findByTestId('loan-request-details')).toHaveTextContent('Modou Faye');
    expect(await screen.findByTestId('eligible-approvers')).toHaveTextContent('Jeanne Mbarga');
    expect(screen.getByTestId('eligible-approvers')).not.toHaveTextContent('Amadou Mbaye');
    await user.click(screen.getByRole('button', { name: 'Approuver' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approuver' }));
    await waitFor(() => expect(workflowRequests.find((item) => item.id === request.id)).toMatchObject({ status: 'approved' }));
    expect(workflowRequests.find((item) => item.id === request.id)!.steps[0]).toMatchObject({ status: 'approved', actedBy: 'U-013', actedByName: 'Jeanne Mbarga' });
    // Aucune transaction à l'approbation : elle naît au décaissement, une seule fois.
    expect(transactions.some((tx) => tx.memberId === 'M-016' && tx.subcategory === 'PRET')).toBe(false);
    await user.click(await screen.findByRole('button', { name: /Décaisser/ }));
    expect(await screen.findByTestId('loan-disbursed')).toBeInTheDocument();
    expect(loans.filter((loan) => loan.applicationId === application.id)).toHaveLength(1);
    expect(await creditService.disburseLoan('T-001', application.id)).toBeUndefined(); // second décaissement refusé
    expect(loans.filter((loan) => loan.applicationId === application.id)).toHaveLength(1);

    // Traitée : plus dans « Mes approbations ».
    await user.click(screen.getByRole('button', { name: 'nav-workflows' }));
    expect(within(await openMyApprovals(user)).queryByText(label)).not.toBeInTheDocument();
  });

  it('rejet avec motif : statut rejeté, historique, retirée de « Mes approbations », aucune transaction', async () => {
    const user = userEvent.setup();
    const { request, application } = await submit120k();
    const txCount = transactions.length;
    renderApp(`/operations/workflows/${request.id}`);
    await actAs(user, 'U-014');
    await user.click(await screen.findByRole('button', { name: /^(Refuser|Rejeter)$/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'Capacité de remboursement insuffisante');
    await user.click(within(dialog).getByRole('button', { name: /^(Refuser|Rejeter)$/ }));
    await waitFor(() => expect(workflowRequests.find((item) => item.id === request.id)).toMatchObject({ status: 'rejected' }));
    expect(workflowRequests.find((item) => item.id === request.id)!.steps[0]).toMatchObject({ status: 'rejected', actedBy: 'U-014', comment: 'Capacité de remboursement insuffisante' });
    expect(applications.find((item) => item.id === application.id)!.stage).toBe('stageRejected');
    expect(transactions).toHaveLength(txCount);
    expect((await workflowService.listMyApprovals('T-001', permissionsOfUser('T-001', 'U-014'), 'U-014')).some((item) => item.id === request.id)).toBe(false);
  });

  it('changement d’identité SANS invalidation atteignant le cache (constaté en navigateur après HMR) : « Mes approbations » suit l’utilisateur', async () => {
    // Condition mesurée dans Chrome (logpoints CDP, 2026-09-28) : après une mise à jour HMR, `actAs` change bien
    // l'utilisateur, mais `invalidateQueries()` s'exécute sur un QueryClient qui ne contient AUCUNE requête → la liste
    // de U-001 restait affichée pour U-013, `listMyApprovals` n'étant jamais rappelé. Reproduit ici avec un QueryClient
    // distinct pour le module Workflow : seule une clé de cache portant l'utilisateur garantit un nouvel appel.
    const user = userEvent.setup();
    const { application } = await submit120k();
    const label = `Prêt ${application.id} · Modou Faye`;
    const workflowClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    renderWithProviders(<><ShellHeader /><QueryClientProvider client={workflowClient}><Routes><Route path="/operations/*" element={<OperationsModule />} /></Routes></QueryClientProvider></>, { route: '/operations/workflows', staleTime: 30_000 });
    // Toujours le panneau « Mes approbations » (et non « Demandes », qui liste toutes les demandes) — il doit le rester après le changement d'identité.
    const myApprovalsPanel = () => {
      expect(screen.getByRole('tab', { name: /Mes approbations/ })).toHaveAttribute('aria-selected', 'true');
      return screen.getByRole('tabpanel', { name: /Mes approbations/ });
    };
    expect(within(await openMyApprovals(user)).queryByText(label)).not.toBeInTheDocument(); // U-001 = saisisseur
    await actAs(user, 'U-013');
    await waitFor(() => expect(within(myApprovalsPanel()).getByText(label)).toBeInTheDocument());
    await actAs(user, 'U-001');
    await waitFor(() => expect(within(myApprovalsPanel()).queryByText(label)).not.toBeInTheDocument());
    expect(within(myApprovalsPanel()).getByText('AGE Budget Q3')).toBeInTheDocument(); // la liste de U-001 est bien affichée, pas un écran vide
  });

  it('« Agir en tant que » : utilisateurs actifs du tenant seulement, permissions réelles du rôle, sans élargissement', () => {
    expect(actAsDemoUser('U-011')).toBe(false); // admin INACTIF
    expect(actAsDemoUser('U-012')).toBe(false); // autre tenant
    expect(currentUser.id).toBe('U-001');
    expect(actAsDemoUser('U-002')).toBe(true);
    expect(currentUser.permissions).not.toContain('loans.approve.admin');
    expect(permissionsOfUser('T-001', 'U-002')).toEqual(currentUser.permissions);
    resetDemoIdentity();
    expect(currentUser).toMatchObject({ id: 'U-001', name: 'Amadou Mbaye' });
    expect(currentUser.permissions).toContain('loans.approve.admin');
  });

  it('aucun approbateur possible : la demande le signale au lieu de rester silencieusement bloquée', async () => {
    const { request } = await submit120k();
    workflowRequests.find((item) => item.id === request.id)!.steps[0].approverPermission = 'permission.held.by.nobody';
    expect(await workflowService.listEligibleApprovers('T-001', request.id)).toEqual([]);
    renderApp(`/operations/workflows/${request.id}`);
    expect(await screen.findByTestId('eligible-approvers')).toHaveTextContent('Aucun utilisateur actif ne peut approuver cette étape');
  });
});
