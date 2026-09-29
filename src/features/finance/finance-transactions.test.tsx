import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { transactions } from '@/mocks/finance/transactions';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';

/**
 * Finance → Caisses → onglets « Caisses » / « Transactions » (mandat « Évolution
 * globale du module Finance » §2-§19, tests §46-§49). L'ancienne vue consolidée
 * `/finance/transactions` EST désormais l'onglet Transactions (la route y
 * redirige) : le filtre de période par dates est remplacé par la séance du
 * contexte Finance.
 *
 * Données réellement seedées du tenant par défaut T-001 (« Coopérative
 * Sutura »), exercice courant « Exercice 2026 » : jeu de démonstration de 16
 * transactions (Épargne, Inscription, Secours, Transport ; 4 adhérents), toutes
 * rattachées à la séance FS-001 du 14/07/2026 — la seule séance de l'exercice.
 */
const TRANSACTIONS_SEED = structuredClone(transactions);
const SESSIONS_SEED = structuredClone(fiscalSessions);
const CASHBOXES_SEED = structuredClone(cashboxes);
function restoreSeeds() {
  transactions.splice(0, transactions.length, ...structuredClone(TRANSACTIONS_SEED));
  fiscalSessions.splice(0, fiscalSessions.length, ...structuredClone(SESSIONS_SEED));
  cashboxes.splice(0, cashboxes.length, ...structuredClone(CASHBOXES_SEED));
}
beforeEach(restoreSeeds);
afterEach(restoreSeeds);

function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

const journal = async () => (await screen.findAllByRole('table')).find((table) => !table.getAttribute('aria-label')) as HTMLElement;
/** Mandat du 2026-09-27 : plus AUCUN « Récapitulatif par caisse » dans Transactions (la synthèse des caisses appartient à l'onglet Caisses). */
const expectNoCashboxRecap = () => {
  expect(screen.queryByTestId('cashbox-recap')).not.toBeInTheDocument();
  expect(screen.queryByText('Récapitulatif par caisse')).not.toBeInTheDocument();
};

describe('Finance → Caisses — deux onglets (§2/§3, tests §46)', () => {
  it('deux onglets, « Caisses » en premier puis « Transactions »', async () => {
    renderFinance('/finance/cashboxes');
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Caisses', 'Transactions']);
  });

  it('au moins une caisse → « Transactions » actif par défaut', async () => {
    renderFinance('/finance/cashboxes');
    expect(await screen.findByRole('tab', { name: 'Transactions', selected: true })).toBeInTheDocument();
    expect(await screen.findByTestId('transactions-context-header')).toBeInTheDocument();
  });

  it('aucune caisse → « Caisses » actif par défaut', async () => {
    for (let index = cashboxes.length - 1; index >= 0; index -= 1) if (cashboxes[index].tenantId === 'T-001') cashboxes.splice(index, 1);
    renderFinance('/finance/cashboxes');
    expect(await screen.findByRole('tab', { name: 'Caisses', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('Aucune caisse')).toBeInTheDocument();
  });

  it('navigation manuelle entre les deux onglets', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes');
    await screen.findByTestId('transactions-context-header');
    await user.click(screen.getByRole('tab', { name: 'Caisses' }));
    expect(await screen.findByTestId('cashbox-home-kpis')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Transactions' }));
    expect(await screen.findByTestId('transactions-context-header')).toBeInTheDocument();
  });

  it('l’ancienne URL /finance/transactions ouvre l’onglet Transactions (aucun second journal)', async () => {
    renderFinance('/finance/transactions');
    expect(await screen.findByRole('tab', { name: 'Transactions', selected: true })).toBeInTheDocument();
  });
});

describe('Finance → Transactions — séance du contexte Finance (§6-§11, tests §47)', () => {
  it('sélecteur « Date de séance » : Toutes les séances + séances de l’exercice + « Ajouter une séance » ; dernière séance sélectionnée', async () => {
    renderFinance('/finance/cashboxes?tab=transactions');
    const picker = await screen.findByLabelText('Date de séance') as HTMLSelectElement;
    await waitFor(() => expect(picker.value).toBe('FS-001'));
    expect(within(picker).getAllByRole('option').map((option) => option.textContent)).toEqual(['Toutes les séances', '14/07/2026', '──────────', '+ Ajouter une séance']);
  });

  it('une séance précise filtre la liste (aucun récapitulatif par caisse)', async () => {
    renderFinance('/finance/cashboxes?tab=transactions');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    // Une transaction de l'exercice HORS séance : visible dans « Toutes les séances », jamais dans FS-001.
    transactions.push({ ...transactions.find((tx) => tx.id === 'TR-017')!, id: 'TR-HORS-SEANCE', description: 'Épargne hors séance', sessionId: undefined });
    const table = await journal();
    expect(within(table).getAllByRole('row')).toHaveLength(17); // en-tête + 16 transactions de FS-001
    expect(within(table).getAllByText('Épargne mensuelle').length).toBeGreaterThan(0);
    expect(within(table).queryByText('Épargne hors séance')).not.toBeInTheDocument();
    expectNoCashboxRecap();
  });

  it('« Toutes les séances » : toutes les transactions de l’exercice, sans récapitulatif par caisse', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    await user.selectOptions(screen.getByLabelText('Date de séance'), 'all');
    const table = await journal();
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(17));
    expectNoCashboxRecap();
    // Transactions = journal : une seule table (la liste), jamais une seconde table de soldes.
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it('la synthèse des caisses reste dans l’onglet « Caisses » (solde à l’ouverture, crédit, débit, solde)', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await journal();
    expectNoCashboxRecap();
    await user.click(screen.getByRole('tab', { name: 'Caisses' }));
    const headers = (await screen.findAllByRole('columnheader')).map((th) => th.textContent);
    expect(headers).toEqual(expect.arrayContaining(['Solde à l’ouverture', 'Crédit', 'Débit', 'Solde']));
  });

  it('la séance est un contexte PARTAGÉ : choisie dans Transactions, elle reste sélectionnée dans la fiche caisse', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    await user.selectOptions(screen.getByLabelText('Date de séance'), 'all');
    await user.click(screen.getByRole('tab', { name: 'Caisses' }));
    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row').find((tr) => within(tr).queryByRole('button', { name: 'Transport' }))!;
    await user.click(within(row).getByRole('button', { name: 'Voir le détail' }));
    await screen.findByRole('heading', { name: 'Transport' });
    expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('all');
  });

  it('« + Ajouter une séance » crée la séance (moteur existant) et la rend courante', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    const picker = await screen.findByLabelText('Date de séance') as HTMLSelectElement;
    await waitFor(() => expect(picker.value).toBe('FS-001'));
    await user.selectOptions(picker, '__add_session__');
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Date de la séance'), { target: { value: '2026-10-25' } });
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter une séance' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const created = fiscalSessions.find((session) => session.tenantId === 'T-001' && session.date === '2026-10-25');
    expect(created).toMatchObject({ fiscalYearId: 'FY-T001-2026', sessionNumber: 2 });
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe(created!.id));
    expect(within(screen.getByLabelText('Date de séance')).getByRole('option', { name: '25/10/2026' })).toBeInTheDocument();
  });

  it('exercice clôturé : la création de séance est interdite', async () => {
    window.localStorage.setItem('tanzen.currentFiscalYear.T-001', 'FY-T001-2025');
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    const picker = await screen.findByLabelText('Date de séance');
    await user.selectOptions(picker, '__add_session__');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Exercice clôturé : aucune séance ne peut être créée.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Ajouter une séance' })).toBeDisabled();
  });
});

describe('Finance → Transactions — filtres séance × caisse (§12-§15, tests §49)', () => {
  it('caisse précise + toutes les séances : uniquement ses transactions', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    await user.selectOptions(screen.getByLabelText('Date de séance'), 'all');
    await user.selectOptions(screen.getByLabelText('Libelle de caisse'), 'AC-012');
    const table = await journal();
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(5)); // Transport : TR-006, TR-010, TR-018, TR-019
    expectNoCashboxRecap();
  });

  it('caisse précise + séance précise : les deux filtres se cumulent', async () => {
    const user = userEvent.setup();
    // Achat tontine (AC-015) n'a aucune transaction en séance FS-001 ; Inscription (AC-010) en a deux.
    renderFinance('/finance/cashboxes?tab=transactions&cashboxId=AC-015');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    expect((screen.getByLabelText('Libelle de caisse') as HTMLSelectElement).value).toBe('AC-015');
    expect(await screen.findByText('Aucune transaction ne correspond aux critères sélectionnés.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Libelle de caisse'), 'AC-010');
    const table = await journal();
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
  });

  it('filtre Adhérent : uniquement les membres porteurs d’une transaction dans le périmètre, jamais ceux d’un autre tenant', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    await user.selectOptions(screen.getByLabelText('Date de séance'), 'all');
    await journal();
    const memberSelect = screen.getByLabelText('Adhérent');
    await waitFor(() => expect(within(memberSelect).getAllByRole('option').map((option) => option.textContent)).toEqual(['Tous les adhérents', 'Cheikh Diop', 'Coumba Thiam', 'Fatou Ndiaye', 'Modou Faye']));
    expect(screen.queryByText('Mamadou Sow')).not.toBeInTheDocument();
  });

  it('les caisses désactivées restent consultables dans le filtre, signalées par leur statut', async () => {
    cashboxes.find((cashbox) => cashbox.id === 'AC-012')!.status = 'inactive';
    renderFinance('/finance/cashboxes?tab=transactions');
    const select = await screen.findByLabelText('Libelle de caisse');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Transport (Inactive)' })).toBeInTheDocument());
  });

  it('aucun identifiant technique affiché dans le journal (ni TR-xxx, ni REF-xxx, ni numéro de caisse)', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    await user.selectOptions(screen.getByLabelText('Date de séance'), 'all');
    const table = await journal();
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(17));
    expect(table.textContent).not.toMatch(/TR-\d|REF-\d|CS-001|FS-\d|AC-\d/);
  });
});

describe('Finance → Transactions — « + Nouvelle transaction » (§9/§17-§19, tests §48)', () => {
  it('« Toutes les séances » bloque la création : « Séance requise »', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    await user.selectOptions(screen.getByLabelText('Date de séance'), 'all');
    await user.click(screen.getByRole('button', { name: /Nouvelle transaction/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Séance requise')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Veuillez sélectionner une séance précise avant de créer une transaction.');
    expect(screen.queryByRole('button', { name: 'Ajouter une ligne' })).not.toBeInTheDocument();
  });

  it('aucune séance : création bloquée, « Ajouter une séance » proposé', async () => {
    fiscalSessions.splice(0, fiscalSessions.length, ...fiscalSessions.filter((session) => session.tenantId !== 'T-001'));
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await screen.findByTestId('transactions-context-header');
    await user.click(await screen.findByRole('button', { name: /Nouvelle transaction/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Aucune séance disponible.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Ajouter une séance/ })).toBeInTheDocument();
  });

  it('aucune caisse : création bloquée, retour vers l’onglet Caisses', async () => {
    for (let index = cashboxes.length - 1; index >= 0; index -= 1) if (cashboxes[index].tenantId === 'T-001') cashboxes.splice(index, 1);
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await user.click(await screen.findByRole('button', { name: /Nouvelle transaction/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Créez d’abord une caisse avant d’enregistrer une transaction.');
    await user.click(within(dialog).getByRole('button', { name: 'Aller aux caisses' }));
    expect(await screen.findByRole('tab', { name: 'Caisses', selected: true })).toBeInTheDocument();
  });

  it('séance précise : ouvre le formulaire centralisé, séance héritée en lecture seule, date/heure de transaction distincte, caisses actives uniquement', async () => {
    cashboxes.find((cashbox) => cashbox.id === 'AC-012')!.status = 'inactive';
    cashboxes.find((cashbox) => cashbox.id === 'AC-011')!.status = 'archived';
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    await user.click(screen.getByRole('button', { name: /Nouvelle transaction/ }));
    await screen.findByRole('heading', { name: 'Transactions' });
    const session = screen.getByLabelText('Date de séance') as HTMLInputElement;
    expect(session.value).toBe('14/07/2026');
    expect(session).toBeDisabled();
    // Saisie rapide : la date/heure de transaction n'est plus affichée (décision Hugues) — elle reste générée à l'enregistrement (`recordedAt`).
    expect(screen.queryByLabelText('Date et heure de la transaction')).not.toBeInTheDocument();
    const cashboxOptions = within(screen.getByLabelText(/^Caisse/)).getAllByRole('option').map((option) => option.textContent);
    expect(cashboxOptions).not.toContain('Transport');
    expect(cashboxOptions).not.toContain('Secours');
    expect(cashboxOptions).toContain('Inscription');
  });
});
