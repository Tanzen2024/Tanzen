import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { SettingsModule } from './settings-module';
import { loanRules } from '@/mocks/finance/loan-rules';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { approvePendingChange } from '@/services/loan-rule.test-helpers';
// Depuis le 2026-09-28, une modification de règle n'est effective qu'après double approbation : « Soumettre la modification » puis `approvePendingChange`.
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { guarantors } from '@/mocks/finance/guarantors';
import { creditService } from '@/services/credit.service';

/**
 * « Garant requis » OFF par défaut pour une NOUVELLE règle de crédit ; une règle existante garde
 * sa valeur ; OFF ⇒ aucune condition de garantie sur un prêt (mandat du 2026-09-27). Complète les
 * tests « Garanties » de settings-loan-rules.test.tsx (règle existante ON/OFF, bascule, enregistrement).
 */
const stores = { loanRules, transactions, loans, loanFundingAllocations, applications, guarantors } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
const REQUESTS_SEED = structuredClone(workflowRequests);
beforeEach(() => { restore(); workflowRequests.splice(0, workflowRequests.length, ...structuredClone(REQUESTS_SEED)); });
afterEach(() => { restore(); workflowRequests.splice(0, workflowRequests.length, ...structuredClone(REQUESTS_SEED)); });

const GUARANTEE_FIELDS = ['Auto-caution autorisée', 'Garants min.', 'Garants max.', 'Type de garantie', 'Ratio de garantie'];
const expectGuaranteeFields = (visible: boolean) => {
  for (const label of GUARANTEE_FIELDS) {
    if (visible) expect(screen.getByLabelText(label)).toBeInTheDocument();
    else expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
  }
};
function renderRulePage() {
  return renderWithProviders(<Routes><Route path="/settings/*" element={<SettingsModule />} /></Routes>, { route: '/settings/loan-rules' });
}
/** Tenant sans règle vivante → la page ouvre le formulaire de CRÉATION. */
const withoutRule = () => { loanRules.find((rule) => rule.id === 'LR-001')!.deletedAt = '2026-09-27T00:00:00.000Z'; };

describe('Nouvelle règle de crédit — « Garant requis » OFF par défaut', () => {
  it('à l’ouverture de la création : toggle OFF, paramètres de garantie masqués', async () => {
    withoutRule();
    renderRulePage();
    expect(await screen.findByRole('button', { name: 'Créer la règle de crédit' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Garant requis' })).not.toBeChecked();
    expectGuaranteeFields(false);
  });

  it('activer puis désactiver « Garant requis » en création : les champs apparaissent puis disparaissent', async () => {
    const user = userEvent.setup();
    withoutRule();
    renderRulePage();
    await user.click(await screen.findByRole('switch', { name: 'Garant requis' }));
    expectGuaranteeFields(true);
    await user.click(screen.getByRole('switch', { name: 'Garant requis' }));
    expectGuaranteeFields(false);
  });

  it('la règle créée sans toucher au toggle est enregistrée avec requiresGuarantor = false', async () => {
    const user = userEvent.setup();
    withoutRule();
    renderRulePage();
    await user.type(await screen.findByLabelText('Nom de la règle'), 'Politique de crédit Sutura');
    await user.type(screen.getByLabelText('Montant max'), '1000000');
    await user.click(screen.getByRole('button', { name: 'Créer la règle de crédit' }));
    await vi.waitFor(() => expect(loanRules.find((rule) => rule.tenantId === 'T-001' && rule.deletedAt === null)).toMatchObject({ name: 'Politique de crédit Sutura', requiresGuarantor: false }));
  });
});

describe('Règle existante — la valeur enregistrée est conservée', () => {
  it('LR-001 (données DEMO : Garant requis OFF) : ouvrir la page puis enregistrer une autre modification ne touche pas à requiresGuarantor ni aux paramètres de garantie', async () => {
    const user = userEvent.setup();
    const before = structuredClone(loanRules.find((rule) => rule.id === 'LR-001')!);
    renderRulePage();
    const maxAmount = await screen.findByLabelText('Montant max');
    expect(screen.getByRole('switch', { name: 'Garant requis' })).not.toBeChecked();
    expect(loanRules.find((rule) => rule.id === 'LR-001')).toEqual(before); // simple ouverture : aucune écriture
    await user.clear(maxAmount);
    await user.type(maxAmount, '2500000');
    await user.click(screen.getByRole('button', { name: 'Soumettre la modification' }));
    await approvePendingChange('T-001', 'LR-001'); // double approbation (mandat 2026-09-28) : seul chemin d'activation
    await vi.waitFor(() => expect(loanRules.find((rule) => rule.id === 'LR-001')?.maxAmount).toBe(2_500_000));
    expect(loanRules.find((rule) => rule.id === 'LR-001')).toMatchObject({ requiresGuarantor: false, minGuarantors: 1, maxGuarantors: 2, guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: 100, allowSelfGuarantee: false });
  });
});

describe('Garant requis OFF — aucune condition de garantie sur un prêt', () => {
  it('même si des valeurs de garantie restent enregistrées (min 2, ratio 100 %, pas d’auto-caution), un prêt sans garant est accordé', async () => {
    Object.assign(loanRules.find((rule) => rule.id === 'LR-001')!, { requiresGuarantor: false, minGuarantors: 2, maxGuarantors: 2, guaranteeRatio: 100, allowSelfGuarantee: false, requiresApproval: false, approvalLevel: null });
    const result = await creditService.createLoanTransaction('T-001', {
      memberId: 'M-016', principal: 100_000, guarantors: [], approved: false,
      transactionInput: { cashboxNumber: 'CS-001-CX-004', memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: 100_000, description: 'Prêt sans garant' },
    });
    expect(result?.loan.principal).toBe(100_000);
  });

  it('Garant requis ON : les conditions de garantie existantes s’appliquent toujours (prêt sans garant refusé)', async () => {
    Object.assign(loanRules.find((rule) => rule.id === 'LR-001')!, { requiresGuarantor: true, requiresApproval: false, approvalLevel: null });
    const result = await creditService.createLoanTransaction('T-001', {
      memberId: 'M-016', principal: 100_000, guarantors: [], approved: false,
      transactionInput: { cashboxNumber: 'CS-001-CX-004', memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: 100_000, description: 'Prêt sans garant' },
    });
    expect(result).toBeUndefined();
  });
});

describe('Règle unique — « Garant requis » enregistré puis relu à chaque ouverture', () => {
  const liveRules = () => loanRules.filter((rule) => rule.tenantId === 'T-001' && rule.deletedAt === null);
  const guaranteesSection = () => screen.getByRole('group', { name: 'Garanties' });

  it('OFF → ON + enregistrer → réouverture ON → OFF + enregistrer → réouverture OFF ; toujours UNE seule règle', async () => {
    const user = userEvent.setup();
    // Point de départ : la règle unique existe avec Garant requis OFF (valeurs de garantie conservées en interne).
    loanRules.find((rule) => rule.id === 'LR-001')!.requiresGuarantor = false;

    const first = renderRulePage();
    await screen.findByDisplayValue('Politique Trésorerie Sutura');
    expect(screen.getByRole('switch', { name: 'Garant requis' })).not.toBeChecked();
    // Section compacte : seul le commutateur « Garant requis ».
    expect(within(guaranteesSection()).getAllByRole('switch')).toHaveLength(1);
    expect(within(guaranteesSection()).queryAllByRole('spinbutton')).toHaveLength(0);
    await user.click(screen.getByRole('switch', { name: 'Garant requis' }));
    expectGuaranteeFields(true);
    // Les valeurs configurées auparavant réapparaissent telles quelles.
    expect(screen.getByLabelText('Garants min.')).toHaveValue(1);
    expect(screen.getByLabelText('Ratio de garantie')).toHaveValue(100);
    await user.click(screen.getByRole('button', { name: 'Soumettre la modification' }));
    await approvePendingChange('T-001', 'LR-001'); // double approbation (mandat 2026-09-28) : seul chemin d'activation
    await vi.waitFor(() => expect(loanRules.find((rule) => rule.id === 'LR-001')?.requiresGuarantor).toBe(true));
    expect(liveRules()).toHaveLength(1);
    first.unmount();

    const second = renderRulePage();
    await screen.findByDisplayValue('Politique Trésorerie Sutura');
    expect(screen.getByRole('switch', { name: 'Garant requis' })).toBeChecked();
    expectGuaranteeFields(true);
    await user.click(screen.getByRole('switch', { name: 'Garant requis' }));
    expectGuaranteeFields(false);
    await user.click(screen.getByRole('button', { name: 'Soumettre la modification' }));
    await approvePendingChange('T-001', 'LR-001'); // double approbation (mandat 2026-09-28) : seul chemin d'activation
    await vi.waitFor(() => expect(loanRules.find((rule) => rule.id === 'LR-001')?.requiresGuarantor).toBe(false));
    expect(liveRules()).toHaveLength(1);
    second.unmount();

    renderRulePage();
    await screen.findByDisplayValue('Politique Trésorerie Sutura');
    expect(screen.getByRole('switch', { name: 'Garant requis' })).not.toBeChecked();
    expectGuaranteeFields(false);
    expect(liveRules()).toHaveLength(1);
    // Les valeurs de garantie restent enregistrées techniquement (réutilisées si l'option est réactivée).
    expect(loanRules.find((rule) => rule.id === 'LR-001')).toMatchObject({ minGuarantors: 1, maxGuarantors: 2, guaranteeRatio: 100 });
  });
});
