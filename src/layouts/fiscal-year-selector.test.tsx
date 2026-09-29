import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';

/**
 * Sélecteur global d'exercice (header) — mandat « Caisse + exercice fiscal
 * contexte global ». `permission-context.tsx` lit `currentUser.permissions` à
 * l'import de `@/mocks/rbac.mocks` : chaque scénario mocke ce module puis
 * importe dynamiquement l'arbre (même pattern que `tenant-switcher.test.tsx`).
 *
 * Données seedées du tenant par défaut T-001 (« Coopérative Sutura ») :
 * 2024 et 2025 clôturés, 2026 en cours, 2027 à venir. Les transactions T-001
 * sont toutes en 2026 — l'exercice 2025 n'en a aucune.
 */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

async function renderAppAs(roleIds: string[], route = '/settings/fiscal-years') {
  vi.resetModules();
  vi.doMock('@/mocks/rbac.mocks', async () => {
    const actual = await vi.importActual<typeof import('@/mocks/rbac.mocks')>('@/mocks/rbac.mocks');
    const permissions = roleIds.flatMap((roleId) => actual.systemRoles.find((role) => role.id === roleId)?.permissions ?? []);
    return { ...actual, currentUser: { ...actual.currentUser, roleIds, permissions: Array.from(new Set(permissions)) } };
  });
  const { renderWithProviders } = await import('@/test/render-with-providers');
  const { FiscalYearSelector } = await import('./fiscal-year-selector');
  const { FinanceModule } = await import('@/features/finance');
  return renderWithProviders(
    <>
      <FiscalYearSelector />
      <LocationProbe />
      <main data-testid="page-body"><Routes>
        <Route path="/finance/*" element={<FinanceModule />} />
        <Route path="/settings/fiscal-years" element={<p>Paramètres → Exercices fiscaux</p>} />
      </Routes></main>
    </>,
    { route },
  );
}

const openSelector = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByRole('button', { name: /Sélecteur d.exercice fiscal/ }));

describe('FiscalYearSelector — contexte global d’exercice', { timeout: 20_000 }, () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('affiche l’exercice courant avec son statut métier calculé : « Exercice 2026 · En cours »', async () => {
    await renderAppAs(['role-admin']);
    expect(await screen.findByTestId('current-fiscal-year')).toHaveTextContent('Exercice 2026 · En cours');
  });

  it('liste TOUS les exercices du tenant avec leur statut (À venir / En cours / Clôturé), l’exercice sélectionné étant coché', async () => {
    const user = userEvent.setup();
    await renderAppAs(['role-admin']);
    await openSelector(user);
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Exercice 2027À venir',
      'Exercice 2026En cours',
      'Exercice 2025Clôturé',
      'Exercice 2024Clôturé',
    ]);
    expect(screen.getByRole('option', { name: /Exercice 2026/ })).toHaveAttribute('aria-selected', 'true');
    // Aucune notion « Ouvert » distincte de « En cours ».
    expect(screen.queryByText('Ouvert')).not.toBeInTheDocument();
  });

  it('n’administre pas les exercices : pas de création dans le sélecteur, seulement un lien vers Paramètres → Exercices fiscaux', async () => {
    const user = userEvent.setup();
    await renderAppAs(['role-admin'], '/finance/transactions');
    await openSelector(user);
    expect(screen.queryByText(/Nouvel exercice fiscal/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Gérer les exercices fiscaux' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/settings/fiscal-years');
  });

  it('sélectionner un exercice depuis Paramètres → change le contexte SANS redirection (décision du 2026-09-27) : on reste sur la page courante', async () => {
    const user = userEvent.setup();
    await renderAppAs(['role-admin'], '/settings/fiscal-years');
    await openSelector(user);
    await user.click(screen.getByRole('option', { name: /Exercice 2025/ }));

    expect(screen.getByTestId('location')).toHaveTextContent('/settings/fiscal-years');
    expect(screen.getByTestId('current-fiscal-year')).toHaveTextContent('Exercice 2025 · Clôturé');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('même comportement depuis n’importe quel écran (ici Trésorerie → Transactions) : la page reste affichée, dans le nouvel exercice', async () => {
    const user = userEvent.setup();
    await renderAppAs(['role-admin'], '/finance/treasury/transactions');
    await openSelector(user);
    await user.click(screen.getByRole('option', { name: /Exercice 2024/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/finance/treasury/transactions');
    expect(screen.getByTestId('current-fiscal-year')).toHaveTextContent(/Exercice 2024/);
  });

  it('aucune donnée de l’ancien exercice après le changement : 2026 affiche ses transactions, 2025 n’en affiche aucune', async () => {
    const user = userEvent.setup();
    await renderAppAs(['role-admin'], '/finance/cashboxes?tab=cashboxes');
    expect(await screen.findByText('16 mouvements')).toBeInTheDocument();

    await openSelector(user);
    await user.click(screen.getByRole('option', { name: /Exercice 2025/ }));

    expect(await screen.findByText('0 mouvements')).toBeInTheDocument();
    expect(screen.queryByText('16 mouvements')).not.toBeInTheDocument();
  });

  it('le choix est mémorisé pour le tenant : un nouveau montage retrouve l’exercice sélectionné', async () => {
    const user = userEvent.setup();
    const { unmount } = await renderAppAs(['role-admin']);
    await openSelector(user);
    await user.click(screen.getByRole('option', { name: /Exercice 2025/ }));
    unmount();
    await renderAppAs(['role-admin']);
    await waitFor(() => expect(screen.getByTestId('current-fiscal-year')).toHaveTextContent('Exercice 2025 · Clôturé'));
  });

  /**
   * Mandat « Exercice fiscal hors du corps des pages » (2026-09-25) : le libellé
   * « Exercice AAAA · Statut » n'est affiché QUE par le sélecteur du header —
   * jamais répété dans le corps (accueil Caisses, fiche caisse, Transactions),
   * quel que soit l'exercice sélectionné.
   */
  it.each([
    ['Exercice 2024', 'Clôturé'],
    ['Exercice 2025', 'Clôturé'],
    ['Exercice 2026', 'En cours'],
    ['Exercice 2027', 'À venir'],
  ])('%s : affiché dans le header seulement, jamais dans le corps des pages', async (label, status) => {
    const user = userEvent.setup();
    await renderAppAs(['role-admin'], '/finance/cashboxes?tab=cashboxes');
    await openSelector(user);
    await user.click(screen.getByRole('option', { name: new RegExp(label) }));
    expect(screen.getByTestId('current-fiscal-year')).toHaveTextContent(`${label} · ${status}`);

    // Accueil Caisses : onglet Caisses (aucune caisse sur l'exercice) ou Transactions (au moins une caisse) — règle dynamique du mandat §3.
    const body = screen.getByTestId('page-body');
    expect(await within(body).findByText(/^(Situation des caisses|Transactions de la séance)$/)).toBeInTheDocument();
    expect(body).not.toHaveTextContent(/Exercice d{4}/);
    expect(body).not.toHaveTextContent(/· (En cours|Clôturé|À venir)/);
  });

  it('fiche caisse et Transactions : aucun libellé « Exercice AAAA · Statut » dans le corps', async () => {
    await renderAppAs(['role-admin'], '/finance/cashboxes/AC-009');
    const body = screen.getByTestId('page-body');
    expect(await within(body).findByRole('heading', { name: 'Épargne' })).toBeInTheDocument();
    expect(within(body).getByText('Situation de la caisse')).toBeInTheDocument();
    expect(body).not.toHaveTextContent(/Exercice d{4} ·/);
    expect(screen.getByTestId('current-fiscal-year')).toHaveTextContent('Exercice 2026 · En cours');
  });

  it('« Solde à l’ouverture » suit l’exercice du header : 8 650 000 en 2026, ouverture 2027 = solde global 2026, 0 FCFA (carte visible) en 2025', async () => {
    const user = userEvent.setup();
    await renderAppAs(['role-admin'], '/finance/cashboxes?tab=cashboxes');
    const kpiValue = async (label: string) => {
      // Après un changement d'exercice, l'accueil peut s'ouvrir sur l'onglet Transactions (§3) : les KPI sont sur l'onglet Caisses.
      const cashboxesTab = await screen.findByRole('tab', { name: 'Caisses' });
      if (cashboxesTab.getAttribute('aria-selected') !== 'true') fireEvent.mouseDown(cashboxesTab);
      const kpis = await screen.findByTestId('cashbox-home-kpis');
      return (within(kpis).getByText(label).closest('article')!.querySelector('p.text-2xl')!.textContent ?? '').replace(/\s/g, ' ');
    };
    await screen.findByText('16 mouvements');
    expect(await kpiValue('Solde à l’ouverture')).toBe('8 650 000 FCFA');
    const balance2026 = await kpiValue('Solde global');

    await openSelector(user);
    await user.click(screen.getByRole('option', { name: /Exercice 2027/ }));
    await waitFor(async () => expect(await kpiValue('Solde à l’ouverture')).toBe(balance2026));

    // Toutes les caisses seedées de T-001 sont ouvertes en 2026 (`openedOn`) : aucune n'appartient à 2025 → 0 FCFA, carte toujours affichée.
    await openSelector(user);
    await user.click(screen.getByRole('option', { name: /Exercice 2025/ }));
    await waitFor(async () => expect(await kpiValue('Caisses')).toBe('0'));
    expect(await kpiValue('Solde à l’ouverture')).toBe('0 FCFA');
  });

  it('masqué sans fiscalYears.read', async () => {
    await renderAppAs(['role-no-such-role']);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Sélecteur d.exercice fiscal/ })).not.toBeInTheDocument());
  });
});
