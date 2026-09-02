import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';

/**
 * Finance → Transactions (mandat « refonte complète — vue consolidée du
 * tenant pour un Fiscal Year ») — vérifie le composant réellement monté par
 * la route `/finance/transactions` (`FinanceModule` → `TransactionsList`,
 * `finance-module.tsx`), avec les données réellement seedées du tenant par
 * défaut (T-001, cf. `rbac.mocks.currentUser`) : « Coopérative Sutura », dont
 * l'exercice courant (`isCurrent`) est « Exercice 2026 »
 * (`FY-T001-2026`, 2026-01-01 → 2026-12-31), qui couvre 6 transactions
 * réelles : 3 pour Fatou Ndiaye (M-001), 1 pour Cheikh Diop (M-006), et 2
 * mouvements purement inter-comptes sans adhérent (frais bancaires,
 * virement interne). Aucune donnée mockée ad hoc n'est introduite.
 */
function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

describe('Finance → Transactions — vue consolidée tenant + Fiscal Year (tenant T-001, Exercice 2026)', () => {
  it('AC01/AC02: affiche les transactions consolidées du tenant courant pour l’exercice fiscal courant, provenant de plusieurs comptes', async () => {
    renderFinance('/finance/transactions');
    const table = await screen.findByRole('table');
    // Fatou Ndiaye apparaît sur 3 transactions distinctes (contributions ET décaissement de prêt — deux comptes différents), Cheikh Diop sur 1.
    expect(within(table).getAllByText('Fatou Ndiaye').length).toBe(3);
    expect(within(table).getAllByText('Cheikh Diop').length).toBe(1);
  });

  it('AC03/AC08: le filtre Adhérent ne liste que les membres ayant réellement une transaction dans l’exercice, jamais via Account.memberIds', async () => {
    renderFinance('/finance/transactions');
    await screen.findByRole('table');
    const memberSelect = screen.getByLabelText('Adhérent');
    expect(within(memberSelect).getByRole('option', { name: 'Fatou Ndiaye' })).toBeInTheDocument();
    expect(within(memberSelect).getByRole('option', { name: 'Cheikh Diop' })).toBeInTheDocument();
    expect(within(memberSelect).getByRole('option', { name: 'Tous les adhérents' })).toBeInTheDocument();
    // Exactement 3 options (Tous les adhérents + 2 adhérents réels) — aucun doublon, aucun membre fantôme.
    expect(within(memberSelect).getAllByRole('option')).toHaveLength(3);
  });

  it('AC09: aucun adhérent ni aucune transaction d’un autre tenant n’apparaît (Mamadou Sow / Khadija Mbaye sont des membres réels du tenant T-002)', async () => {
    renderFinance('/finance/transactions');
    const table = await screen.findByRole('table');
    const memberSelect = screen.getByLabelText('Adhérent');
    expect(within(memberSelect).queryByRole('option', { name: 'Mamadou Sow' })).not.toBeInTheDocument();
    expect(within(memberSelect).queryByRole('option', { name: 'Khadija Mbaye' })).not.toBeInTheDocument();
    expect(within(table).queryByText('Mamadou Sow')).not.toBeInTheDocument();
    expect(within(table).queryByText('Khadija Mbaye')).not.toBeInTheDocument();
  });

  it('AC06/AC05: sélectionner un adhérent affiche uniquement ses transactions (tous comptes confondus), il n’apparaît qu’une seule fois dans le filtre malgré 3 transactions', async () => {
    renderFinance('/finance/transactions');
    const table = await screen.findByRole('table');
    const user = userEvent.setup();
    const memberSelect = screen.getByLabelText('Adhérent');
    await user.selectOptions(memberSelect, 'Fatou Ndiaye');
    expect(within(table).getAllByText('Fatou Ndiaye')).toHaveLength(3);
    expect(within(table).queryByText('Cheikh Diop')).not.toBeInTheDocument();
  });

  it('AC07: « Tous les adhérents » réaffiche toutes les transactions admissibles du tenant, y compris les mouvements sans adhérent (frais, virement interne)', async () => {
    renderFinance('/finance/transactions');
    const table = await screen.findByRole('table');
    const user = userEvent.setup();
    const memberSelect = screen.getByLabelText('Adhérent') as HTMLSelectElement;
    await user.selectOptions(memberSelect, 'Fatou Ndiaye');
    await user.selectOptions(memberSelect, 'Tous les adhérents');
    expect(memberSelect.value).toBe('');
    expect(within(table).getAllByText('Fatou Ndiaye')).toHaveLength(3);
    expect(within(table).getAllByText('Cheikh Diop')).toHaveLength(1);
    // 6 lignes au total pour l'exercice 2026 (4 avec adhérent + 2 sans, cf. seed) — les mouvements sans adhérent restent visibles ici.
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 6);
  });

  it('AC02/AC11/TEST « recalcul du filtre après changement de Fiscal Year »: changer d’exercice recalcule les transactions et réinitialise un adhérent devenu invalide', async () => {
    renderFinance('/finance/transactions');
    await screen.findByRole('table');
    const user = userEvent.setup();
    const memberSelect = screen.getByLabelText('Adhérent') as HTMLSelectElement;
    await user.selectOptions(memberSelect, 'Fatou Ndiaye');
    expect(memberSelect.value).not.toBe('');

    const fiscalYearSelect = screen.getByLabelText('Exercice') as HTMLSelectElement;
    await user.selectOptions(fiscalYearSelect, 'Exercice 2025');

    // Exercice 2025 : aucune transaction seedée pour T-001 → adhérent réinitialisé, plus aucun adhérent disponible.
    expect(memberSelect.value).toBe('');
    expect(await screen.findByText('Aucun adhérent n’a effectué de transaction pour l’exercice sélectionné.')).toBeInTheDocument();
    expect(await screen.findByText('Aucune transaction ne correspond aux critères sélectionnés.')).toBeInTheDocument();
    expect(within(memberSelect).getAllByRole('option')).toHaveLength(1);
  });

  it('FILTRES DU JOURNAL : les filtres Montant min / Montant max ont été retirés, la barre reste centrée sur les filtres métier', async () => {
    renderFinance('/finance/transactions');
    await screen.findByRole('table');
    // Filtres métier conservés
    expect(screen.getByLabelText('Catégorie')).toBeInTheDocument();
    expect(screen.getByLabelText('Statut')).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    // Filtres montant supprimés — plus aucune trace dans l'UI
    expect(screen.queryByLabelText('Montant min')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Montant max')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Montant min')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Montant max')).not.toBeInTheDocument();
  });

  it('IMPORTANT : le filtre Sous-catégorie n’apparaît que pour Catégorie = AUTRES', async () => {
    renderFinance('/finance/transactions');
    await screen.findByRole('table');
    const user = userEvent.setup();
    const categorySelect = screen.getByLabelText('Catégorie') as HTMLSelectElement;

    // ÉPARGNE / PRÊT / REMBOURSEMENT → pas de filtre Sous-catégorie
    for (const category of ['Épargne', 'Prêt', 'Remboursement']) {
      await user.selectOptions(categorySelect, category);
      expect(screen.queryByLabelText('Sous-catégorie')).not.toBeInTheDocument();
    }

    // AUTRES → filtre Sous-catégorie visible, limité aux sous-catégories de AUTRES
    await user.selectOptions(categorySelect, 'Autres');
    const subSelect = await screen.findByLabelText('Sous-catégorie');
    expect(within(subSelect).getByRole('option', { name: 'Toutes les sous-catégories' })).toBeInTheDocument();
    expect(within(subSelect).getByRole('option', { name: 'Frais' })).toBeInTheDocument();
    // 9 sous-catégories AUTRES + l'option « Toutes »
    expect(within(subSelect).getAllByRole('option')).toHaveLength(10);
  });
});
