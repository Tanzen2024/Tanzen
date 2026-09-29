import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { OperationsModule } from './operations-module';
import { workflowService } from '@/services/workflow.service';
import { creditService } from '@/services/credit.service';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { applications } from '@/mocks/finance/applications';
import { auditEvents } from '@/mocks/audit/audit-events';

/**
 * Opérations → Workflows → « Mes approbations » (mandat du 2026-09-27) : trois actions seulement —
 * Rejeter / Renvoyer / Approuver —, chacune = UNE confirmation simple (ni commentaire, ni page
 * intermédiaire, ni seconde validation), exécutée par les services métier existants.
 * Utilisateur connecté : U-001 Amadou Mbaye. Demande de référence : WR-006 « AGE Budget Q3 »
 * (Gouvernance, étape « Validation du bureau », `governance.approve`).
 */
const stores = { workflowRequests, applications, auditEvents } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
beforeEach(restore);
afterEach(() => { restore(); vi.restoreAllMocks(); });

const ENTITY = 'AGE Budget Q3';
const wr006 = () => workflowRequests.find((request) => request.id === 'WR-006')!;
const myApprovalsTab = () => screen.getByRole('tab', { name: /Mes approbations/ });
const badgeCount = () => Number(within(myApprovalsTab()).queryByText(/^\d+$/)?.textContent ?? 0);

async function openMyApprovals() {
  const user = userEvent.setup();
  renderWithProviders(<Routes><Route path="/operations/*" element={<OperationsModule />} /></Routes>, { route: '/operations/workflows' });
  await user.click(await screen.findByRole('tab', { name: /Mes approbations/ }));
  const panel = await screen.findByRole('tabpanel');
  await within(panel).findByText(ENTITY);
  return { user, panel };
}

describe('Mes approbations — Rejeter / Renvoyer / Approuver', { timeout: 30_000 }, () => {
  it('chaque demande affiche exactement trois actions, dans l’ordre Rejeter, Renvoyer, Approuver', async () => {
    const { panel } = await openMyApprovals();
    const row = within(panel).getByText(ENTITY).closest('tr')!;
    expect([...row.querySelectorAll('td:last-child button')].map((button) => button.textContent)).toEqual(['Rejeter', 'Renvoyer', 'Approuver']);
    expect(within(row).queryByRole('button', { name: /Refuser|Annuler/ })).not.toBeInTheDocument();
  });

  it('Approuver : confirmation simple sans commentaire → exécutée immédiatement, sans seconde confirmation ni navigation ; la demande quitte la liste et le compteur baisse', async () => {
    const { user, panel } = await openMyApprovals();
    const before = badgeCount();
    await user.click(within(panel).getByRole('button', { name: `Approuver ${ENTITY}` }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Approuver la demande ?')).toBeInTheDocument();
    expect(within(dialog).getByText('Êtes-vous sûr de vouloir approuver cette demande ?')).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual(['Annuler', 'Approuver']);
    await user.click(within(dialog).getByRole('button', { name: 'Approuver' }));
    await vi.waitFor(() => expect(wr006().status).toBe('approved'));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Workflows' })).toBeInTheDocument(); // toujours sur la liste
    await vi.waitFor(() => expect(within(screen.getByRole('tabpanel')).queryByText(ENTITY)).not.toBeInTheDocument());
    expect(badgeCount()).toBe(before - 1);
    // Historique : mécanisme existant (étape horodatée, acteur), sans commentaire.
    expect(wr006().steps[1]).toMatchObject({ status: 'approved', actedBy: 'U-001', actedByName: 'Amadou Mbaye', comment: undefined });
  });

  it('Renvoyer : même parcours → demande RENVOYÉE, retirée de la liste', async () => {
    const { user, panel } = await openMyApprovals();
    await user.click(within(panel).getByRole('button', { name: `Renvoyer ${ENTITY}` }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Renvoyer la demande ?')).toBeInTheDocument();
    expect(within(dialog).getByText('Êtes-vous sûr de vouloir renvoyer cette demande ?')).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Renvoyer' }));
    await vi.waitFor(() => expect(wr006().status).toBe('returned'));
    await vi.waitFor(() => expect(within(screen.getByRole('tabpanel')).queryByText(ENTITY)).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Rejeter : même parcours → demande REJETÉE, retirée de la liste', async () => {
    const { user, panel } = await openMyApprovals();
    await user.click(within(panel).getByRole('button', { name: `Rejeter ${ENTITY}` }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Rejeter la demande ?')).toBeInTheDocument();
    expect(within(dialog).getByText('Êtes-vous sûr de vouloir rejeter cette demande ?')).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Rejeter' }));
    await vi.waitFor(() => expect(wr006().status).toBe('rejected'));
    await vi.waitFor(() => expect(within(screen.getByRole('tabpanel')).queryByText(ENTITY)).not.toBeInTheDocument());
  });

  it('Annuler ferme la confirmation sans modifier la demande', async () => {
    const { user, panel } = await openMyApprovals();
    const statusBefore = wr006().status;
    await user.click(within(panel).getByRole('button', { name: `Approuver ${ENTITY}` }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(wr006().status).toBe(statusBefore);
    expect(wr006().steps[1].status).toBe('pending');
    expect(within(panel).getByText(ENTITY)).toBeInTheDocument();
  });

  it('double clic sur la confirmation : UNE seule action métier', async () => {
    const spy = vi.spyOn(workflowService, 'submitAction');
    const { user, panel } = await openMyApprovals();
    await user.click(within(panel).getByRole('button', { name: `Approuver ${ENTITY}` }));
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Approuver' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await vi.waitFor(() => expect(wr006().status).toBe('approved'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('demande de prêt : Renvoyer présent mais inactif (règle existante) ; Approuver passe par le service de crédit', async () => {
    const submitted = (await creditService.submitLoanApplication('T-001', { memberId: 'M-016', requestedAmount: 200_000, purpose: 'Équipement', guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 200_000, relation: 'Membre' }] }, 'Fatou Ndiaye', 'U-002'))!;
    const decide = vi.spyOn(creditService, 'decideLoanApplication');
    const { user, panel } = await openMyApprovals();
    const label = submitted.request.entityLabel;
    expect(within(panel).getByRole('button', { name: `Renvoyer ${label}` })).toBeDisabled();
    await user.click(within(panel).getByRole('button', { name: `Approuver ${label}` }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approuver' }));
    await vi.waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(decide.mock.calls[0]).toEqual(['T-001', submitted.request.id, 'approve', 'U-001', 'Amadou Mbaye', undefined]);
  });
});

describe('workflowService.submitAction — contrôles serveur', () => {
  it('decide : acteur sans la permission de l’étape → refusé, demande inchangée ; approbateur habilité → exécuté', async () => {
    expect(await workflowService.decide('T-001', 'WR-006', 'approve', 'U-INCONNU', 'Inconnu')).toBeUndefined();
    expect(wr006().steps[1].status).toBe('pending');
    expect((await workflowService.decide('T-001', 'WR-006', 'approve', 'U-001', 'Amadou Mbaye'))?.status).toBe('approved');
  });

  it('decide : un utilisateur d’un autre tenant n’agit jamais', async () => {
    expect(await workflowService.decide('T-002', 'WR-006', 'approve', 'U-001', 'Amadou Mbaye')).toBeUndefined();
    expect(wr006().steps[1].status).toBe('pending');
  });

  it('demande annulée (étape restée ouverte) → aucune action', async () => {
    await workflowService.cancelRequest('T-001', 'WR-006', 'Amadou Mbaye');
    const result = await workflowService.submitAction('T-001', 'WR-006', 'approve', 'Amadou Mbaye', undefined, 'U-001');
    expect(result?.status).toBe('cancelled');
    expect(wr006().steps[1].status).toBe('pending');
  });

  it('demande de prêt : le renvoi est refusé par le service', async () => {
    const submitted = (await creditService.submitLoanApplication('T-001', { memberId: 'M-016', requestedAmount: 200_000, purpose: 'Équipement', guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 200_000, relation: 'Membre' }] }, 'Fatou Ndiaye', 'U-002'))!;
    expect(await workflowService.submitAction('T-001', submitted.request.id, 'return', 'Amadou Mbaye', undefined, 'U-001')).toBeFalsy();
    expect(workflowRequests.find((request) => request.id === submitted.request.id)!.status).toBe('pending');
  });

  it('seconde soumission sur une étape déjà traitée → aucun second effet', async () => {
    await workflowService.submitAction('T-001', 'WR-006', 'approve', 'Amadou Mbaye', undefined, 'U-001');
    const again = await workflowService.submitAction('T-001', 'WR-006', 'reject', 'Amadou Mbaye', undefined, 'U-001');
    expect(again?.status).toBe('approved');
  });
});
