import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';
import { fiscalSessionService, latestSession } from '@/services/fiscal-session.service';

/**
 * « Date de séance » par défaut dans Finance → Caisses → Transactions : la
 * séance la plus récente (vraie date) de l'exercice courant du tenant courant
 * (T-001 / FY-T001-2026, seule séance seedée : FS-001 du 14/07/2026) ; un
 * choix manuel n'est jamais écrasé tant que le module reste monté ; une
 * nouvelle ouverture repart de la séance la plus récente.
 */
const snapshot = structuredClone(fiscalSessions);
afterEach(() => { fiscalSessions.splice(0, fiscalSessions.length, ...structuredClone(snapshot)); });

const picker = () => screen.getByLabelText('Date de séance') as HTMLSelectElement;
function openTransactions() {
  return renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route: '/finance/cashboxes?tab=transactions' });
}

describe('latestSession', () => {
  it('compare la vraie date de séance, pas la position dans la liste', () => {
    const sessions = [
      { id: 'b', date: '2026-08-11', sessionNumber: 1 },
      { id: 'c', date: '2026-09-27', sessionNumber: 2 },
      { id: 'a', date: '2026-07-14', sessionNumber: 3 },
    ];
    expect(latestSession(sessions)?.id).toBe('c');
    expect(latestSession([])).toBeUndefined();
  });
});

describe('Finance → Transactions — séance sélectionnée par défaut', { timeout: 20_000 }, () => {
  it('sélectionne la séance la plus récente, y compris une séance nouvellement créée', async () => {
    await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-01');
    const newest = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-09-27');
    // Séance d'un AUTRE tenant, plus tardive : jamais prise en compte.
    await fiscalSessionService.createSession('T-002', 'FY-T002-2026', '2026-12-01');
    openTransactions();
    await waitFor(() => expect(picker().value).toBe(newest!.id));
    expect(screen.getByRole('option', { name: '27/09/2026' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '01/12/2026' })).not.toBeInTheDocument();
  });

  it('respecte une sélection manuelle, puis repart de la plus récente à la réouverture', async () => {
    const user = userEvent.setup();
    const newest = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-11');
    openTransactions();
    await waitFor(() => expect(picker().value).toBe(newest!.id));

    await user.selectOptions(picker(), 'FS-001');
    await user.click(screen.getByRole('tab', { name: 'Caisses' }));
    await user.click(screen.getByRole('tab', { name: 'Transactions' }));
    await waitFor(() => expect(picker().value).toBe('FS-001'));

    // Réouverture (équivalent d'un rafraîchissement) : séance la plus récente.
    cleanup();
    openTransactions();
    await waitFor(() => expect(picker().value).toBe(newest!.id));
  });
});
