import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
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
 * Reconstruction complète « Exercices fiscaux / Séances » — remplace l'ancien
 * mandat « RÈGLE CENTRALE — DATES DE RÉUNION » : le champ « Séance » du
 * journal financier liste les séances RÉELLEMENT créées de l'exercice
 * sélectionné (T-001 → FY-T001-2026), porte le `sessionId` en valeur, affiche
 * « Séance #N — date » (jamais l'id technique), et présélectionne la DERNIÈRE
 * séance créée — jamais une génération en masse de dates.
 */
describe('Finance → Transactions — « Séance » alimentée par les séances réellement créées de l\'exercice', () => {
  it('les options = séances déjà créées (sessionId en valeur, « Séance #N — date » affichée), la dernière préselectionnée', async () => {
    const second = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-11');
    renderFinance('/finance/transactions/create');
    const select = await screen.findByLabelText('Séance') as HTMLSelectElement;
    // une option par séance créée (le seed FS-001 + celle ajoutée ci-dessus) + le placeholder « Aucune séance ».
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
    // la dernière séance créée est présélectionnée ; la valeur est un sessionId réel.
    await waitFor(() => expect(select.value).toBe(second!.id));
    const selectedOption = within(select).getByRole('option', { selected: true }) as HTMLOptionElement;
    expect(selectedOption.textContent).toBe(`Séance #${second!.sessionNumber} — ${formatDate(second!.date)}`);
  });

  it('à l\'enregistrement : la transaction porte le sessionId choisi, la fiche affiche « Séance #N — date »', async () => {
    const user = userEvent.setup();
    const marker = `Épargne séance ${Date.now()}`;
    const session = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-11');
    renderFinance('/finance/transactions/create');
    await screen.findByRole('option', { name: /CS-001-ÉPG/ });
    await user.selectOptions(screen.getByLabelText(/Caisse \/ Compte/), 'CS-001-ÉPG');
    await user.selectOptions(screen.getByLabelText(/Catégorie/), 'EPARGNE');
    await screen.findByRole('option', { name: 'Fatou Ndiaye' });
    await user.selectOptions(screen.getByLabelText(/Adhérent/), 'Fatou Ndiaye');
    await waitFor(() => expect((screen.getByLabelText('Séance') as HTMLSelectElement).value).toBe(session!.id));
    await user.type(screen.getByLabelText('Montant *'), '25000');
    await user.type(screen.getByLabelText(/Commentaire/), marker);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    // fiche détail de la transaction créée
    expect(await screen.findByText(marker)).toBeInTheDocument();
    expect(screen.getByText('Séance')).toBeInTheDocument();
    expect(screen.getByText(`Séance #${session!.sessionNumber} — ${formatDate(session!.date)}`)).toBeInTheDocument();
  });
});
