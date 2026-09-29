import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { SettingsModule } from './settings-module';
import { OperationsModule } from '@/features/operations/operations-module';
import { loanRules } from '@/mocks/finance/loan-rules';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { auditEvents } from '@/mocks/audit/audit-events';
import { loanRuleService } from '@/services/loan-rule.service';
import { APPROVER_1, APPROVER_2, REQUESTER, approvePendingChange } from '@/services/loan-rule.test-helpers';

/**
 * Écrans de la DOUBLE APPROBATION de la règle de crédit (mandat du 2026-09-28) : Paramètres →
 * Règle de crédit (soumission, bandeau d'attente, historique) et fiche du workflow (séparation des
 * approbateurs). Utilisateur connecté : U-001 Amadou Mbaye (Administrateur).
 */
const stores = { loanRules, workflowRequests, auditEvents } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
beforeEach(restore);
afterEach(restore);

const lr001 = () => loanRules.find((rule) => rule.id === 'LR-001')!;
const renderRule = () => renderWithProviders(<Routes><Route path="/settings/*" element={<SettingsModule />} /></Routes>, { route: '/settings/loan-rules' });
const renderWorkflow = (id: string) => renderWithProviders(<Routes><Route path="/operations/*" element={<OperationsModule />} /></Routes>, { route: `/operations/workflows/${id}` });

describe('Paramètres → Règle de crédit : modification soumise à double approbation', { timeout: 30_000 }, () => {
  it('soumettre : règle active INCHANGÉE, bandeau d’attente, nouvelle soumission bloquée ; activation après 2 approbations, historique complet', async () => {
    const user = userEvent.setup();
    const view = renderRule();
    expect(await screen.findByTestId('credit-rule-approval-notice')).toHaveTextContent('double approbation');
    const rate = screen.getByLabelText('Taux d’intérêt');
    await user.clear(rate);
    await user.type(rate, '15');
    await user.click(screen.getByRole('button', { name: 'Soumettre la modification' }));

    expect(await screen.findByTestId('credit-rule-pending')).toHaveTextContent('en attente de la première approbation');
    expect(lr001()).toMatchObject({ interestRate: 12, version: 1 });
    expect(screen.getByRole('button', { name: 'Soumettre la modification' })).toBeDisabled();
    const history = screen.getByTestId('credit-rule-history');
    expect(history).toHaveTextContent('Amadou Mbaye');
    expect(history).toHaveTextContent(/12 → 15/);

    const decision = await approvePendingChange('T-001', 'LR-001');
    expect(decision).toMatchObject({ ok: true, activated: true });
    expect(lr001()).toMatchObject({ interestRate: 15, version: 2 });
    view.unmount();

    renderRule();
    const reopened = await screen.findByTestId('credit-rule-history');
    expect(within(reopened).getByRole('button', { name: 'Activée' })).toBeInTheDocument();
    expect(reopened).toHaveTextContent(APPROVER_2.name);
    expect(screen.queryByTestId('credit-rule-pending')).not.toBeInTheDocument();
  });
});

describe('Fiche du workflow : séparation des approbateurs', { timeout: 30_000 }, () => {
  it('ChangeSet lisible ; le 1er approbateur ne peut pas donner la 2e approbation', async () => {
    const created = await loanRuleService.requestLoanRuleUpdate('T-001', 'LR-001', { loanMode: 'SIMPLE', interestRate: 15 }, REQUESTER.id, REQUESTER.name);
    if (!created.ok) throw new Error('demande refusée');
    await loanRuleService.decideLoanRuleUpdate('T-001', created.request.id, 'approve', APPROVER_1.id, APPROVER_1.name);
    renderWorkflow(created.request.id);
    expect(await screen.findByText('Type d’intérêt')).toBeInTheDocument();
    expect(screen.getByText('Taux d’intérêt (%)')).toBeInTheDocument();
    expect(await screen.findByTestId('second-approver-notice')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
    expect(lr001()).toMatchObject({ loanMode: 'COMPOUND', interestRate: 12 });
  });

  it('1re approbation depuis la fiche par un approbateur habilité : la règle reste inchangée, la demande attend la 2e', async () => {
    const user = userEvent.setup();
    const created = await loanRuleService.requestLoanRuleUpdate('T-001', 'LR-001', { interestRate: 15 }, REQUESTER.id, REQUESTER.name);
    if (!created.ok) throw new Error('demande refusée');
    renderWorkflow(created.request.id);
    await user.click(await screen.findByRole('button', { name: 'Approuver' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approuver' }));
    await vi.waitFor(() => expect(workflowRequests.find((item) => item.id === created.request.id)).toMatchObject({ status: 'inProgress', currentStepOrder: 2 }));
    expect(lr001().interestRate).toBe(12);
  });
});
