import { describe, it, expect } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
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

  it('§2/§3 CHAMP EXERCICE EN LECTURE SEULE : reflète l’exercice global du header, n’est pas un second sélecteur, et affiche aussi les bornes de dates', async () => {
    renderFinance('/finance/transactions');
    await screen.findByRole('table');
    const fiscalYearField = screen.getByLabelText('Exercice') as HTMLInputElement;
    // Un <input readOnly>, jamais un <select> permettant de changer d'exercice.
    expect(fiscalYearField.tagName).toBe('INPUT');
    expect(fiscalYearField).toHaveAttribute('readonly');
    expect(screen.queryByRole('combobox', { name: 'Exercice' })).not.toBeInTheDocument();
    expect(fiscalYearField.value).toBe('Exercice 2026');
    // Bornes de l'exercice toujours affichées.
    expect(screen.getByText('Date début')).toBeInTheDocument();
    expect(screen.getByText('Date fin')).toBeInTheDocument();
  });

  it('§1 FILTRE « Libelle de caisse » : label exact, option « Toutes les caisses » + les libellés réels des caisses du tenant (jamais codés en dur)', async () => {
    renderFinance('/finance/transactions');
    await screen.findByRole('table');
    const accountSelect = screen.getByLabelText('Libelle de caisse');
    expect(within(accountSelect).getByRole('option', { name: 'Toutes les caisses' })).toBeInTheDocument();
    // Libellés réels seedés pour T-001 (accounts.ts) — présents, non inventés.
    for (const title of ['Trésorerie', 'Compte courant', 'Inscription', 'Fond de solidarité']) {
      expect(within(accountSelect).getByRole('option', { name: title })).toBeInTheDocument();
    }
    // Aucune caisse d'un autre tenant.
    expect(within(accountSelect).queryByRole('option', { name: 'TH-002-ÉPG' })).not.toBeInTheDocument();
  });

  it('§4/§5 SÉLECTION D’UNE CAISSE : liste, compteur ET KPI (débit/crédit/solde) ne portent plus que sur cette caisse', async () => {
    renderFinance('/finance/transactions');
    const table = await screen.findByRole('table');
    const user = userEvent.setup();
    const kpi = (label: string, target: string) => {
      const card = screen.getByText(label).closest('article') as HTMLElement;
      return within(card).getByText((content) => content.replace(/\s/g, '') === target);
    };

    // Toutes les caisses → 6 transactions, totaux du mandat (1 375 000 / 220 000 / -1 155 000).
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 6);
    expect(kpi('Total débit', '1375000FCFA')).toBeInTheDocument();
    expect(kpi('Total crédit', '220000FCFA')).toBeInTheDocument();
    expect(kpi('Solde', '-1155000FCFA')).toBeInTheDocument();

    // Caisse « Trésorerie » (CS-001-TRÉS) : TR-002 (débit 850 000), TR-004 (crédit 120 000), TR-010 (débit 500 000).
    await user.selectOptions(screen.getByLabelText('Libelle de caisse'), 'Trésorerie');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 3);
    expect(within(table).getByText('Cheikh Diop')).toBeInTheDocument();
    expect(within(table).getByText('Fatou Ndiaye')).toBeInTheDocument();
    // Total débit = 1 350 000, Total crédit = 120 000, Solde = -1 230 000 — uniquement Trésorerie.
    expect(kpi('Total débit', '1350000FCFA')).toBeInTheDocument();
    expect(kpi('Total crédit', '120000FCFA')).toBeInTheDocument();
    expect(kpi('Solde', '-1230000FCFA')).toBeInTheDocument();
  });

  it('§14 CAISSE SANS TRANSACTION : la caisse reste sélectionnable, la liste est vide et les KPI valent 0', async () => {
    renderFinance('/finance/transactions');
    const table = await screen.findByRole('table');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Libelle de caisse'), 'Inscription');
    expect(within(table).queryByText('Fatou Ndiaye')).not.toBeInTheDocument();
    expect(screen.getByText('Aucune transaction ne correspond aux critères sélectionnés.')).toBeInTheDocument();
    const debitCard = screen.getByText('Total débit').closest('article') as HTMLElement;
    expect(within(debitCard).getByText((c) => c.replace(/\s/g, '') === '0FCFA')).toBeInTheDocument();
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

  const kpi = (label: string, target: string) => {
    const card = screen.getByText(label).closest('article') as HTMLElement;
    return within(card).getByText((content) => content.replace(/\s/g, '') === target);
  };

  it('§1 PÉRIODE PAR DÉFAUT : « Date début » / « Date fin » sont initialisées sur les bornes réelles de l’exercice sélectionné, bornées par min/max', async () => {
    renderFinance('/finance/transactions');
    await screen.findByRole('table');
    const start = screen.getByLabelText('Date début') as HTMLInputElement;
    const end = screen.getByLabelText('Date fin') as HTMLInputElement;
    expect(start.type).toBe('date');
    expect(start.value).toBe('2026-01-01');
    expect(end.value).toBe('2026-12-31');
    // §9 : impossible de sortir des limites de l'exercice.
    expect(start).toHaveAttribute('min', '2026-01-01');
    expect(start).toHaveAttribute('max', '2026-12-31');
    expect(end).toHaveAttribute('min', '2026-01-01');
    expect(end).toHaveAttribute('max', '2026-12-31');
    // Période complète → les 6 transactions de l'exercice, totaux du mandat.
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(1 + 6);
    expect(kpi('Total débit', '1375000FCFA')).toBeInTheDocument();
    expect(kpi('Total crédit', '220000FCFA')).toBeInTheDocument();
    expect(kpi('Solde', '-1155000FCFA')).toBeInTheDocument();
  });

  it('§2/§3/§4 PÉRIODE PARTIELLE : restreindre la période refiltre la liste ET recalcule débit / crédit / solde / nombre', async () => {
    renderFinance('/finance/transactions');
    const table = await screen.findByRole('table');
    // 2026-08-01 → 2026-08-09 : TR-012 (crédit 50 000), TR-010 (débit 500 000), TR-006 (débit 25 000), TR-004 (crédit 120 000).
    fireEvent.change(screen.getByLabelText('Date début'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Date fin'), { target: { value: '2026-08-09' } });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 4);
    expect(within(table).getByText('Cheikh Diop')).toBeInTheDocument();
    expect(within(table).getAllByText('Fatou Ndiaye')).toHaveLength(1);
    expect(kpi('Total débit', '525000FCFA')).toBeInTheDocument();
    expect(kpi('Total crédit', '170000FCFA')).toBeInTheDocument();
    expect(kpi('Solde', '-355000FCFA')).toBeInTheDocument();
  });

  it('§5 CAISSE + PÉRIODE : les deux filtres se cumulent, KPI sur ce périmètre exact', async () => {
    renderFinance('/finance/transactions');
    const table = await screen.findByRole('table');
    const user = userEvent.setup();
    fireEvent.change(screen.getByLabelText('Date début'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Date fin'), { target: { value: '2026-08-09' } });
    // Trésorerie (CS-001-TRÉS) sur cette période : TR-010 (débit 500 000, sortie) + TR-004 (crédit 120 000, Cheikh Diop → Trésorerie).
    await user.selectOptions(screen.getByLabelText('Libelle de caisse'), 'Trésorerie');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 2);
    expect(within(table).getByText('Cheikh Diop')).toBeInTheDocument();
    expect(kpi('Total débit', '500000FCFA')).toBeInTheDocument();
    expect(kpi('Total crédit', '120000FCFA')).toBeInTheDocument();
    expect(kpi('Solde', '-380000FCFA')).toBeInTheDocument();
  });

  it('§8/§16 PÉRIODE SANS TRANSACTION : liste vide, 0 transaction, tous les KPI à 0', async () => {
    renderFinance('/finance/transactions');
    const table = await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Date début'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Date fin'), { target: { value: '2026-09-30' } });
    expect(within(table).queryByText('Fatou Ndiaye')).not.toBeInTheDocument();
    expect(screen.getByText('Aucune transaction ne correspond aux critères sélectionnés.')).toBeInTheDocument();
    expect(kpi('Total débit', '0FCFA')).toBeInTheDocument();
    expect(kpi('Total crédit', '0FCFA')).toBeInTheDocument();
    expect(kpi('Solde', '0FCFA')).toBeInTheDocument();
  });

  it('§10 PÉRIODE INVALIDE (début > fin) : erreur signalée, aucune donnée renvoyée', async () => {
    renderFinance('/finance/transactions');
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Date début'), { target: { value: '2026-08-20' } });
    fireEvent.change(screen.getByLabelText('Date fin'), { target: { value: '2026-08-10' } });
    expect(screen.getByText('La date de début doit être antérieure ou égale à la date de fin.')).toBeInTheDocument();
    expect(kpi('Total débit', '0FCFA')).toBeInTheDocument();
    expect(kpi('Total crédit', '0FCFA')).toBeInTheDocument();
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

  it('§FILTRE / TEST 9 : « Libelle de caisse » n’affiche jamais deux options de libellé normalisé identique (anomalie AC-002 « Épargne » / AC-009 « Epargne »)', async () => {
    renderFinance('/finance/transactions');
    await screen.findByRole('table');
    const accountSelect = screen.getByLabelText('Libelle de caisse');
    const norm = (label: string) => label.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const optionLabels = within(accountSelect)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '')
      .filter((label) => label !== 'Toutes les caisses')
      .map(norm);
    // Aucun libellé normalisé en double.
    expect(new Set(optionLabels).size).toBe(optionLabels.length);
    // « epargne » n'apparaît qu'une fois (AC-002, porteuse de transactions, est conservée ; AC-009 est masquée).
    expect(optionLabels.filter((label) => label === 'epargne')).toHaveLength(1);
  });
});
