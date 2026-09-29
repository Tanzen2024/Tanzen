import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { transactions, type Transaction } from '@/mocks/finance/transactions';
import { financeService } from '@/services/finance.service';

/**
 * Finance → Trésorerie → Transactions : la plus RÉCENTE en première ligne
 * (tri `sortTransactionsNewestFirst` appliqué par `financeService`, comme un
 * `ORDER BY` backend). L'ordre est vérifié sur la VRAIE date/heure de chaque
 * ligne — l'attribut `dateTime` du `<time>` de la colonne « Date transaction »
 * — jamais sur le texte JJ/MM/AAAA affiché.
 *
 * Seed T-001 / exercice 2026 / séance FS-001 : 16 transactions, dont plusieurs
 * à la même date/heure (12/08/2026 10:00 : TR-016, TR-017, TR-018, TR-021, TR-022).
 */
const TRANSACTIONS_SEED = structuredClone(transactions);
function restoreSeed() { transactions.splice(0, transactions.length, ...structuredClone(TRANSACTIONS_SEED)); }
beforeEach(restoreSeed);
afterEach(restoreSeed);

function renderFinance(route: string) {
  return renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route });
}

/** Transaction T-001 de la séance FS-001 (clone de TR-016 : épargne de Cheikh Diop sur CS-001-CX-001), à la date/heure donnée. */
function addTransaction(id: string, recordedAt: string, patch: Partial<Transaction> = {}) {
  const base = TRANSACTIONS_SEED.find((tx) => tx.id === 'TR-016')!;
  transactions.push({ ...structuredClone(base), id, reference: `REF-${id}`, description: `Ordre ${id}`, date: recordedAt.slice(0, 10), recordedAt, ...patch });
}

const journal = async () => (await screen.findAllByRole('table')).find((table) => !table.getAttribute('aria-label')) as HTMLElement;
const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);
/** Horodatage réel de chaque ligne (colonne « Date transaction » = 2e cellule). */
const rowTimestamps = (table: HTMLElement) => bodyRows(table).map((row) => {
  const time = within(row).getAllByRole('cell')[1].querySelector('time');
  return Date.parse(time!.getAttribute('datetime')!);
});
const rowComments = (table: HTMLElement) => bodyRows(table).map((row) => within(row).getAllByRole('cell').at(-1)!.textContent);
function expectNewestFirst(table: HTMLElement) {
  const timestamps = rowTimestamps(table);
  expect(timestamps.length).toBeGreaterThan(1);
  timestamps.slice(1).forEach((value, index) => expect(value).toBeLessThanOrEqual(timestamps[index]));
}
async function openJournal(route = '/finance/cashboxes?tab=transactions') {
  renderFinance(route);
  await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
  return journal();
}
const count = () => screen.getByTestId('transactions-count').textContent;

describe('Transactions — la plus récente en première ligne', () => {
  it('service : listTransactionsForFiscalYear renvoie l’ordre décroissant (date/heure puis id)', async () => {
    const list = await financeService.listTransactionsForFiscalYear('T-001', 'FY-T001-2026');
    expect(list.slice(0, 7).map((tx) => tx.id)).toEqual(['TR-023', 'TR-019', 'TR-022', 'TR-021', 'TR-018', 'TR-017', 'TR-016']);
    expect(list.at(-1)!.recordedAt).toBe('2026-08-01T10:00:00');
  });

  it('ouverture : la liste du seed est triée de la plus récente à la plus ancienne', async () => {
    const table = await openJournal();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(16));
    expectNewestFirst(table);
  });

  it('Test 1 — deux transactions : 11/08/2026 10:00 apparaît avant 10/08/2026 10:00', async () => {
    addTransaction('TR-901', '2026-08-10T10:00:00', { description: 'Transaction 1' });
    addTransaction('TR-902', '2026-08-11T10:00:00', { description: 'Transaction 2' });
    const table = await openJournal();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(18));
    const comments = rowComments(table);
    expect(comments.indexOf('Transaction 2')).toBeLessThan(comments.indexOf('Transaction 1'));
    expectNewestFirst(table);
  });

  it('Test 2 — nouvelle transaction saisie : liste actualisée, elle apparaît en première ligne sans changer de séance, caisse ni filtre', async () => {
    const user = userEvent.setup();
    const marker = `Nouvelle ${Date.now()}`;
    await openJournal();
    await user.click(screen.getByRole('button', { name: /Nouvelle transaction/ }));
    await screen.findByRole('heading', { name: 'Transactions' });
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-004"]')).not.toBeNull());
    await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-004');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');
    const row = screen.getByTestId('quick-entry-row');
    await user.click(within(row).getByRole('combobox'));
    await user.type(await screen.findByPlaceholderText(/Rechercher \(nom ou matricule\)/), 'Fatou');
    await user.click(await screen.findByRole('option', { name: /Fatou/ }));
    await user.type(within(row).getByLabelText('Montant de la ligne 1'), '15000');
    await user.type(within(row).getByLabelText('Commentaire de la ligne 1'), marker);
    await user.click(screen.getByRole('button', { name: 'Enregistrer 1 transaction' }));

    // Retour automatique sur le journal, même séance, aucun filtre à toucher.
    expect(await screen.findByRole('tab', { name: 'Transactions', selected: true })).toBeInTheDocument();
    expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001');
    const table = await journal();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(17));
    expect(rowComments(table)[0]).toBe(marker);
    expectNewestFirst(table);
    expect(count()).toMatch(/^17 \/ 17/);
  }, 30_000); // parcours UI complet (saisie rapide → retour journal) : plus long que le délai par défaut de 5 s

  it('Test 3 — même date/heure : ordre secondaire déterministe par identifiant décroissant', async () => {
    const at = '2026-08-20T09:00:00';
    // Insérés dans le désordre, dont un identifiant à 4 chiffres (tri numérique, pas alphabétique).
    addTransaction('TR-901', at); addTransaction('TR-1000', at); addTransaction('TR-900', at); addTransaction('TR-950', at);
    const table = await openJournal();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(20));
    expect(rowComments(table).slice(0, 4)).toEqual(['Ordre TR-1000', 'Ordre TR-950', 'Ordre TR-901', 'Ordre TR-900']);
    expectNewestFirst(table);
  });

  it('Test 4 — le tri décroissant est conservé après recherche et chaque filtre (adhérent, action, statut, type) ; compteur exact', async () => {
    const user = userEvent.setup();
    addTransaction('TR-901', '2026-08-02T08:00:00', { description: 'Épargne mensuelle' });
    addTransaction('TR-902', '2026-08-15T08:00:00', { description: 'Épargne mensuelle' });
    const table = await openJournal();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(18));

    await user.type(screen.getByPlaceholderText('Rechercher une transaction…'), 'Épargne mensuelle');
    await waitFor(() => expect(bodyRows(table)).toHaveLength(6));
    expectNewestFirst(table);
    expect(count()).toMatch(/^6 \/ 18/);
    await user.clear(screen.getByPlaceholderText('Rechercher une transaction…'));

    await user.selectOptions(screen.getByLabelText('Adhérent'), 'M-016');
    await waitFor(() => expect(bodyRows(table).length).toBeLessThan(18));
    expectNewestFirst(table);
    await user.selectOptions(screen.getByLabelText('Adhérent'), '');

    await user.selectOptions(screen.getByLabelText('Actions'), 'AUTRES');
    await waitFor(() => expect(bodyRows(table).length).toBeLessThan(18));
    expectNewestFirst(table);
    await user.selectOptions(screen.getByLabelText('Actions'), 'all');

    await user.selectOptions(screen.getByLabelText('Statut'), 'completed');
    await waitFor(() => expect(bodyRows(table)).toHaveLength(18));
    expectNewestFirst(table);
    await user.selectOptions(screen.getByLabelText('Statut'), 'all');

    await user.selectOptions(screen.getByLabelText('Type'), 'credit');
    await waitFor(() => expect(bodyRows(table).length).toBeLessThan(18));
    expectNewestFirst(table);
    expect(rowComments(table)[0]).toBe('Épargne mensuelle'); // TR-902 (15/08) : le plus récent crédit
  }, 30_000); // cinq filtres successifs : plus long que le délai par défaut de 5 s

  it('Test 5 — changement de séance : le tri reste décroissant (Toutes les séances ↔ FS-001)', async () => {
    const user = userEvent.setup();
    addTransaction('TR-901', '2026-08-30T10:00:00', { description: 'Hors séance', sessionId: undefined });
    const table = await openJournal();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(16));
    expectNewestFirst(table);
    await user.selectOptions(screen.getByLabelText('Date de séance'), 'all');
    await waitFor(() => expect(bodyRows(table)).toHaveLength(17));
    expect(rowComments(table)[0]).toBe('Hors séance');
    expectNewestFirst(table);
    await user.selectOptions(screen.getByLabelText('Date de séance'), 'FS-001');
    await waitFor(() => expect(bodyRows(table)).toHaveLength(16));
    expectNewestFirst(table);
  });

  it('Test 6 — changement de caisse : le tri reste décroissant (journal filtré et fiche caisse)', async () => {
    const user = userEvent.setup();
    addTransaction('TR-901', '2026-08-02T10:00:00', { description: 'Transport ancien', destination: 'CS-001-CX-004' });
    addTransaction('TR-902', '2026-08-20T10:00:00', { description: 'Transport récent', destination: 'CS-001-CX-004' });
    const table = await openJournal();
    await user.selectOptions(screen.getByLabelText('Libelle de caisse'), 'AC-012');
    await waitFor(() => expect(bodyRows(table)).toHaveLength(6)); // Transport : TR-006, TR-010, TR-018, TR-019 + 2
    expect(rowComments(table)[0]).toBe('Transport récent');
    expect(rowComments(table).at(-1)).toBe('Transport ancien');
    expectNewestFirst(table);
    await user.selectOptions(screen.getByLabelText('Libelle de caisse'), 'AC-010');
    await waitFor(() => expect(bodyRows(table)).toHaveLength(2));
    expectNewestFirst(table);
  });

  it('Test 6 bis — fiche caisse : son panneau « Transactions » est aussi du plus récent au plus ancien', async () => {
    addTransaction('TR-902', '2026-08-20T10:00:00', { description: 'Transport récent', destination: 'CS-001-CX-004' });
    renderFinance('/finance/cashboxes/AC-012');
    await screen.findByRole('heading', { name: 'Transport' });
    const table = await screen.findByRole('table');
    await waitFor(() => expect(bodyRows(table)).toHaveLength(5));
    expect(rowComments(table)[0]).toBe('Transport récent');
    expectNewestFirst(table);
  });
});
