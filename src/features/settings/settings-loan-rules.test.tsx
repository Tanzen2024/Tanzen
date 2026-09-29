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

/**
 * RÈGLE DE CRÉDIT UNIQUE PAR TENANT (décision définitive du 2026-09-26) : Paramètres → Règle de
 * crédit est UNE page — le formulaire de la règle existante, ou sa création si le tenant n'en a
 * aucune. Plus de liste, plus de champ Caisse, jamais de deuxième règle.
 */
const RULES_SEED = structuredClone(loanRules);
const REQUESTS_SEED = structuredClone(workflowRequests);
const restore = () => { loanRules.splice(0, loanRules.length, ...structuredClone(RULES_SEED)); workflowRequests.splice(0, workflowRequests.length, ...structuredClone(REQUESTS_SEED)); };
beforeEach(restore);
afterEach(restore);

function renderSettings(route: string) {
  return renderWithProviders(
    <Routes><Route path="/settings/*" element={<SettingsModule />} /></Routes>,
    { route },
  );
}
/** Espaces (fine insécable U+202F comprise) ramenés à une espace simple. */
const plain = (text: string) => text.replace(/\s/g, ' ');
const optionLabels = (select: HTMLElement) => within(select).getAllByRole('option').map((option) => option.textContent);

describe('Paramètres → Règle de crédit (règle unique du tenant)', () => {
  it('une règle existe : son formulaire s’affiche directement — ni liste, ni « Créer », ni champ Caisse', async () => {
    renderSettings('/settings/loan-rules');
    expect(await screen.findByRole('heading', { name: 'Règle de crédit' })).toBeInTheDocument();
    expect(screen.getByText('Configurez la politique de crédit applicable aux prêts de l’organisation.')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Politique Trésorerie Sutura')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Créer/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Caisse')).not.toBeInTheDocument();
    for (const section of ['Général', 'Conditions de prêt', 'Garanties', 'Approbation']) expect(screen.getByText(section)).toBeInTheDocument();
    // Les règles supprimées logiquement (LR-003 / LR-004) ne sont jamais proposées.
    expect(screen.queryByDisplayValue('Politique Épargne volontaire Sutura')).not.toBeInTheDocument();
  });

  it('« Mode de prêt » : Simple, Composé, Global dans cet ordre, valeur de la règle présélectionnée (LR-001 → Composé)', async () => {
    renderSettings('/settings/loan-rules');
    const select = await screen.findByLabelText('Mode de prêt') as HTMLSelectElement;
    expect(optionLabels(select)).toEqual(['Simple', 'Composé', 'Global']);
    await vi.waitFor(() => expect(select.value).toBe('COMPOUND'));
    expect(screen.queryByText('Interne')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Type de taux')).not.toBeInTheDocument();
  });

  it('modifier la règle existante l’enregistre sur la MÊME règle (aucune deuxième règle créée)', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/loan-rules');
    const maxAmount = await screen.findByLabelText('Montant max');
    await user.clear(maxAmount);
    await user.type(maxAmount, '2500000');
    await user.selectOptions(screen.getByLabelText('Mode de prêt'), 'GLOBAL');
    await user.click(screen.getByRole('button', { name: 'Soumettre la modification' }));
    await approvePendingChange('T-001', 'LR-001'); // double approbation (mandat 2026-09-28) : seul chemin d'activation
    await vi.waitFor(() => expect(loanRules.find((rule) => rule.id === 'LR-001')).toMatchObject({ maxAmount: 2_500_000, loanMode: 'GLOBAL' }));
    expect(loanRules.filter((rule) => rule.tenantId === 'T-001' && rule.deletedAt === null)).toHaveLength(1);
  });

  it('aucune règle : « Créer la règle de crédit » (mode Simple par défaut), puis la page affiche la règle créée', async () => {
    const user = userEvent.setup();
    loanRules.find((rule) => rule.id === 'LR-001')!.deletedAt = '2026-09-26T00:00:00.000Z';
    renderSettings('/settings/loan-rules');
    expect(await screen.findByText('Aucune règle de crédit n’est encore configurée : créez-la pour autoriser les prêts.')).toBeInTheDocument();
    expect((screen.getByLabelText('Mode de prêt') as HTMLSelectElement).value).toBe('SIMPLE');
    await user.type(screen.getByLabelText('Nom de la règle'), 'Politique de crédit Sutura');
    await user.type(screen.getByLabelText('Montant max'), '1000000');
    await user.click(screen.getByRole('button', { name: 'Créer la règle de crédit' }));
    await vi.waitFor(() => expect(loanRules.filter((rule) => rule.tenantId === 'T-001' && rule.deletedAt === null).map((rule) => rule.name)).toEqual(['Politique de crédit Sutura']));
    expect(await screen.findByRole('button', { name: 'Soumettre la modification' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer la règle de crédit' })).not.toBeInTheDocument();
  });

  describe('Garanties : « Garant requis » conditionne l’affichage des paramètres de garantie', () => {
    const GUARANTEE_FIELDS = ['Auto-caution autorisée', 'Garants min.', 'Garants max.', 'Type de garantie', 'Ratio de garantie'];
    const expectGuaranteeFields = (visible: boolean) => {
      for (const label of GUARANTEE_FIELDS) {
        if (visible) expect(screen.getByLabelText(label)).toBeInTheDocument();
        else expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
      }
    };

    it('Garant requis ON (LR-001) : les paramètres de garantie sont affichés avec les valeurs de la règle', async () => {
      loanRules.find((rule) => rule.id === 'LR-001')!.requiresGuarantor = true; // LR-001 est OFF dans les données DEMO
      renderSettings('/settings/loan-rules');
      await screen.findByDisplayValue('Politique Trésorerie Sutura');
      expect(screen.getByRole('switch', { name: 'Garant requis' })).toBeChecked();
      expectGuaranteeFields(true);
      expect(screen.getByLabelText('Garants min.')).toHaveValue(1);
      expect(screen.getByLabelText('Garants max.')).toHaveValue(2);
      expect(screen.getByLabelText('Ratio de garantie')).toHaveValue(100);
    });

    it('Garant requis OFF : les paramètres de garantie ne sont pas affichés', async () => {
      loanRules.find((rule) => rule.id === 'LR-001')!.requiresGuarantor = false;
      renderSettings('/settings/loan-rules');
      await screen.findByDisplayValue('Politique Trésorerie Sutura');
      expect(screen.getByRole('switch', { name: 'Garant requis' })).not.toBeChecked();
      expectGuaranteeFields(false);
    });

    it('ON → OFF : les champs disparaissent immédiatement ; OFF → ON : ils réapparaissent avec les valeurs saisies', async () => {
      const user = userEvent.setup();
      loanRules.find((rule) => rule.id === 'LR-001')!.requiresGuarantor = true; // LR-001 est OFF dans les données DEMO
      renderSettings('/settings/loan-rules');
      await screen.findByDisplayValue('Politique Trésorerie Sutura');
      await user.clear(screen.getByLabelText('Ratio de garantie'));
      await user.type(screen.getByLabelText('Ratio de garantie'), '80');
      await user.click(screen.getByRole('switch', { name: 'Garant requis' }));
      expectGuaranteeFields(false);
      await user.click(screen.getByRole('switch', { name: 'Garant requis' }));
      expectGuaranteeFields(true);
      expect(screen.getByLabelText('Ratio de garantie')).toHaveValue(80);
      expect(screen.getByLabelText('Garants min.')).toHaveValue(1);
      expect(screen.getByLabelText('Garants max.')).toHaveValue(2);
    });

    it('nouvelle règle : Garant requis OFF par défaut, aucun paramètre de garantie affiché', async () => {
      loanRules.find((rule) => rule.id === 'LR-001')!.deletedAt = '2026-09-26T00:00:00.000Z';
      renderSettings('/settings/loan-rules');
      expect(await screen.findByRole('button', { name: 'Créer la règle de crédit' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Garant requis' })).not.toBeChecked();
      expectGuaranteeFields(false);
    });

    it('Garant requis OFF avec Garants min. = 3 / max. = 1 conservés : l’enregistrement est accepté et les valeurs sont conservées', async () => {
      const user = userEvent.setup();
      Object.assign(loanRules.find((rule) => rule.id === 'LR-001')!, { requiresGuarantor: false, minGuarantors: 3, maxGuarantors: 1 });
      renderSettings('/settings/loan-rules');
      const name = await screen.findByDisplayValue('Politique Trésorerie Sutura');
      await user.clear(name);
      await user.type(name, 'Politique révisée');
      await user.click(screen.getByRole('button', { name: 'Soumettre la modification' }));
      await approvePendingChange('T-001', 'LR-001'); // double approbation (mandat 2026-09-28) : seul chemin d'activation
      await vi.waitFor(() => expect(loanRules.find((rule) => rule.id === 'LR-001')).toMatchObject({ name: 'Politique révisée', requiresGuarantor: false, minGuarantors: 3, maxGuarantors: 1 }));
      expect(loanRules.filter((rule) => rule.tenantId === 'T-001' && rule.deletedAt === null)).toHaveLength(1);
    });

    it('enregistrer avec Garant requis OFF : requiresGuarantor = false, les autres valeurs de la règle restent inchangées', async () => {
      const user = userEvent.setup();
      loanRules.find((rule) => rule.id === 'LR-001')!.requiresGuarantor = true; // LR-001 est OFF dans les données DEMO
      renderSettings('/settings/loan-rules');
      await screen.findByDisplayValue('Politique Trésorerie Sutura');
      await user.click(screen.getByRole('switch', { name: 'Garant requis' }));
      await user.click(screen.getByRole('button', { name: 'Soumettre la modification' }));
      await approvePendingChange('T-001', 'LR-001'); // double approbation (mandat 2026-09-28) : seul chemin d'activation
      await vi.waitFor(() => expect(loanRules.find((rule) => rule.id === 'LR-001')).toMatchObject({
        requiresGuarantor: false,
        minAmount: 50_000, maxAmount: 2_000_000, interestRate: 12, durationMonths: 24, maxActiveLoans: 2, maxLoanExposure: 3_000_000,
      }));
    });
  });

  it('Conditions de prêt : valeurs de la règle affichées au format de l’association (Plafond d’endettement = 3 000 000)', async () => {
    renderSettings('/settings/loan-rules');
    await screen.findByDisplayValue('Politique Trésorerie Sutura');
    // Mandat « Formatage des montants » (2026-09-27) : séparateurs de l'association (défaut espace / virgule), décimales de sa devise (FCFA : 0).
    expect(plain((screen.getByLabelText('Montant min') as HTMLInputElement).value)).toBe('50 000');
    expect(plain((screen.getByLabelText('Montant max') as HTMLInputElement).value)).toBe('2 000 000');
    expect(screen.getByLabelText('Durée (mois)')).toHaveValue(24);
    expect(screen.getByLabelText('Prêts actifs max.')).toHaveValue(2);
    expect(plain((screen.getByLabelText("Plafond d'endettement") as HTMLInputElement).value)).toBe('3 000 000');
  });

  it('montants saisis formatés en direct, enregistrés en nombres propres ; Montant min > Montant max reste refusé', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/loan-rules');
    const minAmount = await screen.findByLabelText('Montant min');
    const maxAmount = screen.getByLabelText('Montant max');
    const exposure = screen.getByLabelText("Plafond d'endettement");
    await user.clear(maxAmount);
    await user.type(maxAmount, '2000000,50');
    expect(plain((maxAmount as HTMLInputElement).value)).toBe('2 000 000,50');
    await user.clear(exposure);
    await user.type(exposure, '3500000');
    expect(plain((exposure as HTMLInputElement).value)).toBe('3 500 000');
    // Validation existante inchangée : min > max → refus, rien n'est écrit.
    await user.clear(minAmount);
    await user.type(minAmount, '2500000');
    await user.click(screen.getByRole('button', { name: 'Soumettre la modification' }));
    expect(await screen.findByText('Ce champ est obligatoire.')).toBeInTheDocument();
    expect(loanRules.find((rule) => rule.id === 'LR-001')).toMatchObject({ minAmount: 50_000, maxAmount: 2_000_000 });
    // min ≤ max → enregistré avec des nombres, jamais de chaîne formatée.
    await user.clear(minAmount);
    await user.type(minAmount, '75000');
    await user.click(screen.getByRole('button', { name: 'Soumettre la modification' }));
    await approvePendingChange('T-001', 'LR-001'); // double approbation (mandat 2026-09-28) : seul chemin d'activation
    await vi.waitFor(() => expect(loanRules.find((rule) => rule.id === 'LR-001')).toMatchObject({ minAmount: 75_000, maxAmount: 2_000_000.5, maxLoanExposure: 3_500_000 }));
  });

  it('Approbation requise OFF : le niveau d’approbation est masqué, puis réaffiché à la réactivation', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/loan-rules');
    await screen.findByDisplayValue('Politique Trésorerie Sutura');
    expect(screen.getByLabelText('Niveau d’approbation')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Approbation requise' }));
    expect(screen.queryByLabelText('Niveau d’approbation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Approbation requise' }));
    expect((screen.getByLabelText('Niveau d’approbation') as HTMLSelectElement).value).toBe('ADMIN');
  });

  it('les anciennes URLs (fiche, édition, création) retombent sur la page unique', async () => {
    for (const route of ['/settings/loan-rules/LR-001', '/settings/loan-rules/LR-001/edit', '/settings/loan-rules/create']) {
      const { unmount } = renderSettings(route);
      expect(await screen.findByDisplayValue('Politique Trésorerie Sutura')).toBeInTheDocument();
      unmount();
    }
  });
});
