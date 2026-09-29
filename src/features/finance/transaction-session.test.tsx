import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { fiscalSessionService } from '@/services/fiscal-session.service';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';
import { transactions } from '@/mocks/finance/transactions';
import { formatDate } from '@/lib/utils';

/** ISOLATION : l'enregistrement fait un `push(...)` sur des mocks module-level (transactions, fiscalSessions) — on restaure les seeds exacts avant/après chaque cas pour qu'aucun test ne dépende de l'ordre. */
const TRANSACTIONS_SEED = structuredClone(transactions);
const SESSIONS_SEED = structuredClone(fiscalSessions);
const restoreSeeds = () => {
  transactions.splice(0, transactions.length, ...structuredClone(TRANSACTIONS_SEED));
  fiscalSessions.splice(0, fiscalSessions.length, ...structuredClone(SESSIONS_SEED));
};
beforeEach(restoreSeeds);
afterEach(restoreSeeds);

function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

/**
 * Mandat « Évolution globale du module Finance » §17 : la séance d'une NOUVELLE
 * transaction est HÉRITÉE du contexte Finance (par défaut la dernière séance
 * créée de l'exercice) et affichée en LECTURE SEULE — jamais choisie dans le
 * formulaire. La transaction enregistrée porte `sessionId = currentSessionId`.
 */
describe('Finance → Transactions — « Séance » héritée du contexte Finance', () => {
  it('le formulaire affiche la séance courante (dernière créée) en lecture seule, sans liste de choix', async () => {
    const second = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-11');
    renderFinance('/finance/transactions/create');
    const field = await screen.findByLabelText('Date de séance') as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe(formatDate(second!.date)));
    expect(field).toBeDisabled();
    expect(field.tagName).toBe('INPUT');
    expect(screen.queryByRole('combobox', { name: 'Séance' })).not.toBeInTheDocument();
  });

  it('à l\'enregistrement : la transaction porte le sessionId du contexte, la fiche affiche « Séance #N — date »', async () => {
    const user = userEvent.setup();
    const marker = `Épargne séance ${Date.now()}`;
    const session = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-11');
    renderFinance('/finance/transactions/create');
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-001"]')).not.toBeNull());
    await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-001');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');
    await screen.findByRole('option', { name: 'Fatou Ndiaye' });
    await user.selectOptions(screen.getByLabelText(/Adhérent/), 'Fatou Ndiaye');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLInputElement).value).toBe(formatDate(session!.date)));
    await user.type(screen.getByLabelText('Montant *'), '25000');
    await user.type(screen.getByLabelText(/Commentaire/), marker);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    // fiche détail de la transaction créée — `ignore: textarea` : sans lui, `findByText` trouvait le champ Commentaire du
    // formulaire encore affiché (un textarea contrôlé porte sa valeur en texte), détaché dès la redirection → échec intermittent.
    expect(await screen.findByText(marker, { ignore: 'script, style, textarea' })).toBeInTheDocument();
    expect(await screen.findByText('Séance')).toBeInTheDocument();
    // La séance est résolue par une requête séparée (`getSession`) : attendre son affichage plutôt que de lire l'instant T.
    expect(await screen.findByText(`Séance #${session!.sessionNumber} — ${formatDate(session!.date)}`)).toBeInTheDocument();
    expect(transactions.find((tx) => tx.description === marker)?.sessionId).toBe(session!.id);
  });
});
