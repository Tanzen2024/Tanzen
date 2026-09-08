import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { deriveFiscalMeetings, nearestMeeting } from '@/services/meeting.service';
import { fiscalYears } from '@/mocks/settings/fiscal-years';
import { transactions } from '@/mocks/finance/transactions';
import { formatDate } from '@/lib/utils';

/** ISOLATION : l'enregistrement fait un `transactions.push(...)` sur le mock module-level — on restaure le seed exact avant/après chaque cas pour qu'aucun test ne dépende de l'ordre. */
const TRANSACTIONS_SEED = structuredClone(transactions);
const restoreTransactionsSeed = () => transactions.splice(0, transactions.length, ...structuredClone(TRANSACTIONS_SEED));
beforeEach(restoreTransactionsSeed);
afterEach(restoreTransactionsSeed);

/**
 * Mandat « RÈGLE CENTRALE — DATES DE RÉUNION » §6/§7/§9 — le champ « Date de
 * réunion » du journal financier est alimenté PAR l'exercice fiscal courant
 * (T-001 → FY-T001-2026, calendrier « deuxième mardi de chaque mois »), porte le
 * `meeting_id` en valeur, affiche `meeting.meeting_date`, et présélectionne la
 * réunion la plus proche du jour courant. La réunion attendue est DÉRIVÉE du
 * même moteur que l'application (pas de date en dur) pour rester déterministe.
 */
const fiscalYear = fiscalYears.find((year) => year.id === 'FY-T001-2026')!;
const meetings = deriveFiscalMeetings(fiscalYear);
const today = new Date().toISOString().slice(0, 10);
const expectedNearest = nearestMeeting(meetings, today)!;

function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

describe('Finance → Transactions — « Date de réunion » alimentée par l\'exercice fiscal', () => {
  it('les options = réunions de l\'exercice (meeting_id en valeur, meeting_date affichée), la plus proche du jour présélectionnée', async () => {
    renderFinance('/finance/transactions/create');
    const select = await screen.findByLabelText('Date de réunion') as HTMLSelectElement;
    // une option par réunion générée + le placeholder « Aucune réunion »
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(meetings.length + 1));
    // §6 — réunion la plus proche présélectionnée ; §7 — la valeur est un meeting_id
    await waitFor(() => expect(select.value).toBe(expectedNearest.id));
    expect(select.value.startsWith('MTG-FY-T001-2026-')).toBe(true);
    // l'interface affiche meeting.meeting_date, pas l'id
    const selectedOption = within(select).getByRole('option', { selected: true }) as HTMLOptionElement;
    expect(selectedOption.textContent).toBe(expectedNearest.date);
  });

  it('à l\'enregistrement : « Date réunion » vient de meeting.meeting_date, « Date transaction » est une valeur système distincte', async () => {
    const user = userEvent.setup();
    const marker = `Épargne réunion ${Date.now()}`;
    renderFinance('/finance/transactions/create');
    await screen.findByRole('option', { name: /CS-001-ÉPG/ });
    await user.selectOptions(screen.getByLabelText(/Caisse \/ Compte/), 'CS-001-ÉPG');
    await user.selectOptions(screen.getByLabelText(/Catégorie/), 'EPARGNE');
    await screen.findByRole('option', { name: 'Fatou Ndiaye' });
    await user.selectOptions(screen.getByLabelText(/Adhérent/), 'Fatou Ndiaye');
    await waitFor(() => expect((screen.getByLabelText('Date de réunion') as HTMLSelectElement).value).toBe(expectedNearest.id));
    await user.type(screen.getByLabelText('Montant *'), '25000');
    await user.type(screen.getByLabelText(/Commentaire/), marker);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    // fiche détail de la transaction créée
    expect(await screen.findByText(marker)).toBeInTheDocument();
    expect(screen.getByText('Date réunion')).toBeInTheDocument();
    expect(screen.getByText('Date transaction')).toBeInTheDocument();
    // « Date réunion » = la date de la réunion sélectionnée (meeting.meeting_date)
    expect(screen.getAllByText(formatDate(expectedNearest.date, 'fr')).length).toBeGreaterThan(0);
  });
});
