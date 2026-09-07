import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';

/**
 * Mandat « CLASSIFICATION DES TRANSACTIONS » : le bouton « + Ajouter une
 * transaction » ouvre UN formulaire générique qui commence par « Catégorie »
 * (ÉPARGNE / PRÊT / REMBOURSEMENT / AUTRES). « Sous-catégorie » n'apparaît QUE
 * pour AUTRES. Pour un PRÊT, le formulaire lit la politique de la caisse
 * (`LoanRule` liée à `account_id`) et affiche garant / approbation seulement si
 * la politique l'impose. Tenant par défaut : T-001 « Coopérative Sutura »
 * (rôle admin). Politiques T-001 seedées : AC-001 (Trésorerie) garant +
 * approbation requis ; AC-009 (Épargne volontaire) prêt autorisé sans garant.
 *
 * Les tests partagent l'état du tableau `transactions` (mock module-level) :
 * un test écrit une ligne, un test suivant vérifie qu'elle est au journal.
 */
function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

const SAVINGS_MARKER = 'Épargne test — journal central';
const LOAN_MARKER = 'Prêt test — politique Trésorerie';

describe('Finance → Transactions — saisie (journal central)', () => {
  it('le journal expose « Ajouter une transaction » et exactement les 7 colonnes du mandat (dont « Catégorie », jamais « Opération »)', async () => {
    renderFinance('/finance/transactions');
    const table = await screen.findByRole('table');
    expect(screen.getByRole('button', { name: /Ajouter une transaction/i })).toBeInTheDocument();
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Date réunion', 'Date transaction', 'Adhérent', 'Catégorie', 'Débit', 'Crédit', 'Commentaire']);
  });

  it('IMPORTANT : « Sous-catégorie » n’apparaît que pour Catégorie = AUTRES, est vidée quand on quitte AUTRES', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/create');
    await screen.findByRole('option', { name: /CS-001-ÉPG/ });
    const categorySelect = screen.getByLabelText(/Catégorie/);

    // ÉPARGNE / PRÊT / REMBOURSEMENT → pas de champ Sous-catégorie
    for (const category of ['EPARGNE', 'PRET', 'REMBOURSEMENT']) {
      await user.selectOptions(categorySelect, category);
      expect(screen.queryByLabelText(/Sous-catégorie/)).not.toBeInTheDocument();
    }

    // AUTRES → champ Sous-catégorie obligatoire, options = les 9 de AUTRES + placeholder
    await user.selectOptions(categorySelect, 'AUTRES');
    const subSelect = await screen.findByLabelText(/Sous-catégorie/);
    expect(within(subSelect).getAllByRole('option')).toHaveLength(10);
    await user.selectOptions(subSelect, 'FRAIS');
    expect((subSelect as HTMLSelectElement).value).toBe('FRAIS');

    // Retour vers ÉPARGNE → champ masqué ; re-sélection de AUTRES → valeur vidée
    await user.selectOptions(categorySelect, 'EPARGNE');
    expect(screen.queryByLabelText(/Sous-catégorie/)).not.toBeInTheDocument();
    await user.selectOptions(categorySelect, 'AUTRES');
    expect(((await screen.findByLabelText(/Sous-catégorie/)) as HTMLSelectElement).value).toBe('');
  });

  it('AUTRES sans sous-catégorie → l’enregistrement est bloqué (champ obligatoire)', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/create');
    await screen.findByRole('option', { name: /CS-001-COUR/ });
    await user.selectOptions(screen.getByLabelText(/Caisse \/ Compte/), 'CS-001-COUR');
    await user.selectOptions(screen.getByLabelText(/Catégorie/), 'AUTRES');
    await user.type(screen.getByLabelText('Montant *'), '5000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    // toujours sur le formulaire, message d'erreur sur la sous-catégorie
    expect(await screen.findByText('Ce champ est obligatoire.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Sous-catégorie/)).toBeInTheDocument();
  });

  it('§ PRÊT : Catégorie = Prêt sur la caisse Trésorerie affiche les conditions, la garantie ET l’approbation imposées par la politique', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/create');
    await screen.findByRole('option', { name: /CS-001-TRÉS/ });
    await user.selectOptions(screen.getByLabelText(/Caisse \/ Compte/), 'CS-001-TRÉS');
    await user.selectOptions(screen.getByLabelText(/Catégorie/), 'PRET');

    expect(await screen.findByText('Conditions du prêt')).toBeInTheDocument();
    expect(screen.getByText('Garantie')).toBeInTheDocument();
    expect(screen.getByText('Approbation')).toBeInTheDocument();
    // taux prérempli depuis la politique (LR-001 : 12 %)
    expect((screen.getByLabelText(/Taux d’intérêt/) as HTMLInputElement).value).toBe('12');
  });

  it('§ PRÊT : Catégorie = Prêt sur une caisse dont la politique n’exige pas de garant → pas de bloc Garantie ni Approbation', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/create');
    await screen.findByRole('option', { name: /CS-001-CX-001/ });
    await user.selectOptions(screen.getByLabelText(/Caisse \/ Compte/), 'CS-001-CX-001');
    await user.selectOptions(screen.getByLabelText(/Catégorie/), 'PRET');

    expect(await screen.findByText('Conditions du prêt')).toBeInTheDocument();
    expect(screen.queryByText('Garantie')).not.toBeInTheDocument();
    expect(screen.queryByText('Approbation')).not.toBeInTheDocument();
  });

  it('§ PRÊT : un montant hors des bornes de la politique est refusé', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/create');
    await screen.findByRole('option', { name: /CS-001-TRÉS/ });
    await user.selectOptions(screen.getByLabelText(/Caisse \/ Compte/), 'CS-001-TRÉS');
    await user.selectOptions(screen.getByLabelText(/Catégorie/), 'PRET');
    await screen.findByText('Conditions du prêt');
    const memberSelect = screen.getByLabelText(/Adhérent/);
    await waitFor(() => expect(within(memberSelect).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(memberSelect, 'M-001');
    await user.type(screen.getByLabelText('Montant *'), '10000'); // < minAmount 50 000
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/doit être compris entre/)).toBeInTheDocument();
  });

  it('§ PRÊT : un prêt conforme (garant + approbation) est enregistré comme UNE transaction de catégorie Prêt', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/create');
    await screen.findByRole('option', { name: /CS-001-TRÉS/ });
    await user.selectOptions(screen.getByLabelText(/Caisse \/ Compte/), 'CS-001-TRÉS');
    await user.selectOptions(screen.getByLabelText(/Catégorie/), 'PRET');
    await screen.findByText('Conditions du prêt');
    const memberSelect = screen.getByLabelText(/Adhérent/);
    await waitFor(() => expect(within(memberSelect).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(memberSelect, 'M-001');
    await user.type(screen.getByLabelText('Montant *'), '300000');
    await user.type(screen.getByLabelText(/Commentaire/), LOAN_MARKER);
    // garant imposé par la politique (minGuarantors 1)
    await user.selectOptions(screen.getByLabelText('Nom du garant'), 'Cheikh Diop');
    await user.type(screen.getByLabelText('Montant garanti'), '300000');
    // approbation imposée par la politique
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    // fiche détail de la transaction créée
    expect(await screen.findByText(new RegExp(LOAN_MARKER), {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Garant: Cheikh Diop/)).toBeInTheDocument();
    expect(screen.getAllByText('Prêt').length).toBeGreaterThan(0);
  });

  it('§ ÉPARGNE : enregistre une transaction d’épargne et redirige vers sa fiche détail', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/create');
    await screen.findByRole('option', { name: /CS-001-ÉPG/ });
    await user.selectOptions(screen.getByLabelText(/Caisse \/ Compte/), 'CS-001-ÉPG');
    await user.selectOptions(screen.getByLabelText(/Catégorie/), 'EPARGNE');
    await screen.findByRole('option', { name: 'Fatou Ndiaye' });
    await user.selectOptions(screen.getByLabelText(/Adhérent/), 'Fatou Ndiaye');
    await user.type(screen.getByLabelText('Montant *'), '25000');
    await user.type(screen.getByLabelText(/Commentaire/), SAVINGS_MARKER);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(SAVINGS_MARKER)).toBeInTheDocument();
    expect(screen.getAllByText('Épargne').length).toBeGreaterThan(0);
  });

  it('les transactions enregistrées apparaissent dans le journal consolidé', async () => {
    renderFinance('/finance/transactions');
    const table = await screen.findByRole('table');
    expect(await within(table).findByText(SAVINGS_MARKER)).toBeInTheDocument();
    expect(within(table).getByText(new RegExp(LOAN_MARKER))).toBeInTheDocument();
  });
});
