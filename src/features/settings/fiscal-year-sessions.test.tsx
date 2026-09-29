import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { SettingsModule } from './settings-module';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';
import { fiscalYears } from '@/mocks/settings/fiscal-years';
import { fiscalSessionService, sessionsOf, sessionTiming, suggestNextSession } from '@/services/fiscal-session.service';

const TIMING_LABEL = { upcoming: 'À venir', today: 'Aujourd’hui', past: 'Passée' } as const;
import { formatDate } from '@/lib/utils';
import { notify } from '@/lib/notify';
import { navigationTree, flattenNavigation } from '@/config/navigation';

/**
 * Paramètres → Exercices fiscaux → Exercice → Séances (mandat « Gestion des séances »,
 * 2026-09-25) — même expérience que les Tours Tontines : liste #N + date + état calculé,
 * date préremplie (suggestion, jamais écrite), création uniquement sur « Ajouter une séance ».
 */
const SESSIONS_SEED = structuredClone(fiscalSessions);
const YEARS_SEED = structuredClone(fiscalYears);
const restore = () => {
  fiscalSessions.splice(0, fiscalSessions.length, ...structuredClone(SESSIONS_SEED));
  fiscalYears.splice(0, fiscalYears.length, ...structuredClone(YEARS_SEED));
};
beforeEach(restore);
afterEach(restore);

/** Ligne de la LISTE des séances (la date figure aussi dans les cartes « Dernière / Prochaine séance »). */
async function findSessionRow(date: string): Promise<HTMLElement> {
  let row: HTMLElement | undefined;
  await vi.waitFor(() => {
    row = screen.getAllByText(date).map((element) => element.closest('button')).find((button): button is HTMLButtonElement => Boolean(button?.textContent?.includes('#'))) ?? undefined;
    expect(row).toBeTruthy();
  });
  return row!;
}

function renderSettings(route: string, staleTime = 0) {
  return renderWithProviders(<Routes><Route path="/settings/*" element={<SettingsModule />} /></Routes>, { route, staleTime });
}

/** Valeur affichée par la carte KPI `label` de la fiche exercice. */
function kpiValue(label: string): string {
  const card = screen.getByText(label).closest('article') as HTMLElement;
  return card.querySelector('p:nth-of-type(2)')?.textContent ?? '';
}

describe('Paramètres → Exercices fiscaux → Exercice 2026 → Séances', () => {
  it('liste les séances (#1 — 14/07/2026) avec un état calculé depuis la date, jamais un statut stocké', async () => {
    renderSettings('/settings/fiscal-years/FY-T001-2026');
    const row = await findSessionRow('14/07/2026');
    expect(row).toHaveTextContent('#1');
    expect(row).toHaveTextContent(TIMING_LABEL[sessionTiming('2026-07-14')]);
  });

  it('la date est préremplie par la suggestion, sans rien créer ; « Ajouter une séance » crée la séance #2', async () => {
    const user = userEvent.setup();
    const suggestion = suggestNextSession('T-001', 'FY-T001-2026')!;
    renderSettings('/settings/fiscal-years/FY-T001-2026');
    const input = await screen.findByLabelText('Date de la séance') as HTMLInputElement;
    await vi.waitFor(() => expect(input.value).toBe(suggestion));
    expect(input.min).toBe('2026-07-15'); // strictement après la dernière séance (14/07)
    expect(sessionsOf('T-001', 'FY-T001-2026')).toHaveLength(1); // afficher la suggestion n'écrit rien

    await user.click(screen.getByRole('button', { name: /Ajouter une séance/ }));
    await vi.waitFor(() => expect(sessionsOf('T-001', 'FY-T001-2026')).toHaveLength(2));
    const created = sessionsOf('T-001', 'FY-T001-2026')[1];
    expect(created).toMatchObject({ sessionNumber: 2, date: suggestion });
    expect(await findSessionRow(formatDate(suggestion))).toHaveTextContent('#2');
  });

  it('une date qui ne suit pas la dernière séance est refusée par le service, avec un message explicite', async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(notify, 'error');
    renderSettings('/settings/fiscal-years/FY-T001-2026');
    const input = await screen.findByLabelText('Date de la séance');
    fireEvent.change(input, { target: { value: '2026-07-14' } }); // saisie directe d'un champ date (jsdom)
    await user.click(screen.getByRole('button', { name: /Ajouter une séance/ }));
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('La date doit être postérieure à la dernière séance (14/07/2026).'));
    expect(sessionsOf('T-001', 'FY-T001-2026')).toHaveLength(1);
    errorSpy.mockRestore();
  });

  it('une séance s’ouvre dans Trésorerie → Transactions, filtre « Date de séance » positionné (plus de page séance dédiée)', async () => {
    const user = userEvent.setup();
    function LocationProbe() { const location = useLocation(); return <output data-testid="location">{`${location.pathname}${location.search}`}</output>; }
    renderWithProviders(<><Routes><Route path="/settings/*" element={<SettingsModule />} /></Routes><LocationProbe /></>, { route: '/settings/fiscal-years/FY-T001-2026' });
    await user.click(await findSessionRow('14/07/2026'));
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/finance/treasury/transactions?sessionId=FS-001'));
    expect(screen.queryByText('Transactions de cette séance')).not.toBeInTheDocument();
  });
});

describe('Navigation — les séances vivent uniquement dans Paramètres → Exercices fiscaux', () => {
  it('aucune entrée Finance → Séances ni Finance → Exercices fiscaux ; Paramètres → Exercices fiscaux existe', () => {
    const paths = flattenNavigation(navigationTree).map((node) => node.path);
    expect(paths.filter((path) => path.startsWith('/finance') && /session|seance|fiscal-year/i.test(path))).toEqual([]);
    expect(paths).toContain('/settings/fiscal-years');
  });
});

/**
 * Bug « Prochaine séance → — » (2026-09-25) : après avoir configuré la fréquence d'un exercice,
 * la suggestion restait en cache à `null` — l'invalidation visait `sessions.next(tenant, undefined)`,
 * clé qui ne correspond à AUCUN exercice. Reproduit avec le `staleTime: 30_000` réel de l'application.
 */
describe('Fiche exercice 2027 — prochaine séance recalculée d’après la fréquence', () => {
  it('fréquence posée APRÈS une première visite : KPI et champ passent à 20/02/2027, puis 20/03/2027 après ajout — sans jamais créer la séance suggérée', async () => {
    const user = userEvent.setup();
    await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-01-20'); // #1, exercice encore sans fréquence
    renderSettings('/settings/fiscal-years/FY-T001-2027', 30_000);

    await findSessionRow('20/01/2027');
    expect(kpiValue('Prochaine séance')).toBe('—'); // aucune fréquence : pas de suggestion (comportement attendu)

    // Liste des exercices → « Fréquence des séances » de 2027 → Mensuelle, jour du mois 20.
    await user.click(screen.getByRole('button', { name: /Retour aux exercices fiscaux/ }));
    const row = (await screen.findByText('Exercice 2027')).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /Fréquence des séances/ }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Fréquence des séances/), 'MONTHLY');
    await user.selectOptions(within(dialog).getByLabelText('Règle de récurrence'), 'DAY_OF_MONTH');
    await user.type(within(dialog).getByLabelText('Jour du mois'), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await vi.waitFor(() => expect(fiscalYears.find((year) => year.id === 'FY-T001-2027')?.sessionSchedule).toMatchObject({ frequency: 'MONTHLY', dayOfMonth: 20 }));

    // Retour sur la fiche : KPI et champ affichent la MÊME date calculée.
    await user.click(await screen.findByText('Exercice 2027'));
    await vi.waitFor(() => expect(kpiValue('Prochaine séance')).toBe('20/02/2027'));
    expect((screen.getByLabelText('Date de la séance') as HTMLInputElement).value).toBe('2027-02-20');
    expect(kpiValue('Dernière séance')).toBe('20/01/2027');
    expect(sessionsOf('T-001', 'FY-T001-2027')).toHaveLength(1); // afficher la suggestion ne crée rien

    // Ajout de la séance proposée → l'occurrence suivante est recalculée.
    await user.click(screen.getByRole('button', { name: /Ajouter une séance/ }));
    await vi.waitFor(() => expect(kpiValue('Prochaine séance')).toBe('20/03/2027'));
    expect(kpiValue('Dernière séance')).toBe('20/02/2027');
    expect((screen.getByLabelText('Date de la séance') as HTMLInputElement).value).toBe('2027-03-20');
    expect(sessionsOf('T-001', 'FY-T001-2027').map((session) => session.date)).toEqual(['2027-01-20', '2027-02-20']); // jamais le 20/03 créé d'office
  });
});
