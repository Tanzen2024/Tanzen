import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { SettingsModule } from '@/features/settings/settings-module';
import { sessionTransactionsPath } from './finance-session-context';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';
import { fiscalSessionService } from '@/services/fiscal-session.service';

/**
 * Une séance ouverte depuis Paramètres → Exercices fiscaux n'a plus de page
 * propre : elle mène à Finance → Trésorerie → Transactions (MÊME interface),
 * filtre « Date de séance » positionné via `?sessionId=` — prioritaire sur la
 * séance la plus récente, revalidé dans le tenant courant.
 */
const snapshot = structuredClone(fiscalSessions);
afterEach(() => { fiscalSessions.splice(0, fiscalSessions.length, ...structuredClone(snapshot)); window.localStorage.clear(); });

const picker = () => screen.getByLabelText('Date de séance') as HTMLSelectElement;
const count = () => screen.getByTestId('transactions-count').textContent;

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}
function renderApp(route: string) {
  return renderWithProviders(<>
    <Routes>
      <Route path="/finance/*" element={<FinanceModule />} />
      <Route path="/settings/*" element={<SettingsModule />} />
    </Routes>
    <LocationProbe />
  </>, { route });
}

describe('Séance depuis Exercices fiscaux → Trésorerie → Transactions', { timeout: 20_000 }, () => {
  it('accès direct inchangé : séance la plus récente, sans paramètre ni bouton retour', async () => {
    const newest = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-11');
    renderApp('/finance/treasury/transactions');
    await waitFor(() => expect(picker().value).toBe(newest!.id));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/finance\/treasury\/transactions$/);
    expect(screen.queryByRole('button', { name: /Retour à l.exercice/ })).not.toBeInTheDocument();
  });

  it('clic sur « #1 — 14/07/2026 » : interface Transactions complète, séance #1 imposée (pas la plus récente), même résultat qu’une sélection manuelle', async () => {
    const user = userEvent.setup();
    await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-11');

    // A. Sélection manuelle depuis Transactions.
    renderApp('/finance/treasury/transactions');
    await screen.findByTestId('transactions-count');
    await user.selectOptions(picker(), 'FS-001');
    await waitFor(() => expect(picker().value).toBe('FS-001'));
    const manualCount = count();
    const manualRows = screen.getAllByRole('row').length;
    cleanup();

    // B. Depuis Exercices fiscaux.
    renderApp('/settings/fiscal-years/FY-T001-2026');
    const row = (await screen.findAllByText('14/07/2026')).map((el) => el.closest('button')).find((b) => b?.textContent?.includes('#1'))!;
    await user.click(row);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/finance/treasury/transactions?sessionId=FS-001'));
    await waitFor(() => expect(picker().value).toBe('FS-001'));
    expect(screen.getByRole('tab', { name: /Transactions/, selected: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nouvelle transaction/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Rechercher/i)).toBeInTheDocument();
    await screen.findByTestId('transactions-count');
    expect(count()).toBe(manualCount);
    expect(screen.getAllByRole('row').length).toBe(manualRows);
    expect(screen.queryByText('Transactions de cette séance')).not.toBeInTheDocument();
  });

  it('changement manuel puis « refresh » : la séance choisie suit l’URL', async () => {
    const user = userEvent.setup();
    const newest = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-11');
    renderApp(sessionTransactionsPath('FS-001'));
    await waitFor(() => expect(picker().value).toBe('FS-001'));
    await user.selectOptions(picker(), newest!.id);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`sessionId=${newest!.id}`));
    expect(picker().value).toBe(newest!.id);

    cleanup();
    renderApp(sessionTransactionsPath('FS-001'));
    await waitFor(() => expect(picker().value).toBe('FS-001'));
  });

  it('« Retour à l’exercice » ramène à la fiche de l’exercice', async () => {
    const user = userEvent.setup();
    renderApp(sessionTransactionsPath('FS-001'));
    await user.click(await screen.findByRole('button', { name: /Retour à l.exercice/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings\/fiscal-years\/FY-T001-2026$/));
  });

  it('séance d’un autre exercice du tenant : l’exercice global bascule sur le sien', async () => {
    const other = await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-02-09');
    renderApp(sessionTransactionsPath(other!.id));
    await waitFor(() => expect(picker().value).toBe(other!.id));
    expect(screen.getByRole('option', { name: '09/02/2027' })).toBeInTheDocument();
  });

  it('sécurité : un sessionId d’un autre tenant ne résout rien — paramètre retiré, séance par défaut', async () => {
    const foreign = await fiscalSessionService.createSession('T-002', 'FY-T002-2026', '2026-09-01');
    renderApp(sessionTransactionsPath(foreign!.id));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/finance\/treasury\/transactions$/));
    await waitFor(() => expect(picker().value).toBe('FS-001'));
    expect(screen.queryByRole('option', { name: '01/09/2026' })).not.toBeInTheDocument();
  });

  it('ancienne URL de page séance → redirection vers Transactions filtrées', async () => {
    renderApp('/settings/fiscal-years/FY-T001-2026/sessions/FS-001');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/finance/treasury/transactions?sessionId=FS-001'));
    await waitFor(() => expect(picker().value).toBe('FS-001'));
  });
});
