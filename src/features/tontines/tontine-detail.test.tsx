import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';

/**
 * Mandat « REFACTORISATION DE LA FICHE TONTINE » — la fiche `/tontines/:id`
 * (`TontineDetail`) devient une page de consultation/configuration : plus
 * d'onglets, plus de gros dashboard de StatCards redondant, plus de
 * résumé « Cycles » (module legacy distinct, resté intact mais retiré de
 * cet écran). Trois zones empilées : Informations, Configuration, Périodes
 * et occurrences (Tontine → Fréquence → Période → Occurrence, jamais de
 * Tour). Le panneau Opérations reste strictement inchangé. Tenant T-002
 * (TON-001 « Tontine Horizon » → PER-001 → OCC-001 fermée/OCC-002 ouverte)
 * réellement seedé, comme dans les autres suites Tontines de ce module.
 */
vi.mock('@/mocks/rbac.mocks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/mocks/rbac.mocks')>();
  return { ...actual, currentUser: { ...actual.currentUser, tenantId: 'T-002' } };
});

function renderTontines(route: string) {
  return renderWithProviders(
    <Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>,
    { route },
  );
}

describe('Fiche Tontine — Informations essentielles (mandat « refactorisation de la fiche Tontine »)', () => {
  it('ALLOW: affiche le nom, le type de valeur, la fréquence, le montant de cotisation et le statut', async () => {
    renderTontines('/tontines/TON-001');
    expect(await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' })).toBeInTheDocument();
    expect(screen.getByText('Informations de la tontine')).toBeInTheDocument();
    expect(screen.getByText('Financière')).toBeInTheDocument();
    expect(screen.getByText('Mensuelle')).toBeInTheDocument();
    expect(screen.getByText('50 000 XOF')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
  });

  it('DENY: le gros dashboard de StatCards redondant (Type de valeur/Membres/Cycles actifs/Contributions totales/Statut en grille) n’est plus affiché', async () => {
    renderTontines('/tontines/TON-001');
    await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' });
    expect(screen.queryByText('Cycles actifs')).not.toBeInTheDocument();
    expect(screen.queryByText('Contributions totales')).not.toBeInTheDocument();
  });

  it('DENY: aucun onglet n’est affiché — la fiche est une page simple empilée, pas une interface à onglets', async () => {
    renderTontines('/tontines/TON-001');
    await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('DENY: le résumé « Cycles » (table Cycle n°/Statut/Total collecté) n’est plus affiché sur la fiche', async () => {
    renderTontines('/tontines/TON-001');
    await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' });
    expect(screen.queryByRole('columnheader', { name: 'Cycle n°' })).not.toBeInTheDocument();
  });
});

describe('Fiche Tontine — Configuration', () => {
  it('ALLOW: affiche la devise, le mode d’achat et le détail de la fréquence, sans dupliquer le montant déjà résumé plus haut', async () => {
    renderTontines('/tontines/TON-001');
    await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' });
    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByText('XOF — Franc CFA BCEAO')).toBeInTheDocument();
  });
});

describe('Fiche Tontine — navigation (mandat §17 : chaque bouton a une destination explicite et fonctionnelle)', () => {
  it('ALLOW: le bouton Modifier ouvre l’écran d’édition existant', async () => {
    renderTontines('/tontines/TON-001');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Modifier la tontine' })).toBeInTheDocument();
  });

  it('DENY: le bouton Contributions n’existe plus sur la fiche Tontine (mandat « suppression de l’écran Contribution » — les cotisations se gèrent depuis Opérations)', async () => {
    renderTontines('/tontines/TON-001');
    await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' });
    expect(screen.queryByRole('button', { name: 'Contributions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /contribution/i })).not.toBeInTheDocument();
  });

  it('DENY: naviguer directement vers l’ancienne route Contributions aboutit à une 404 propre', async () => {
    renderTontines('/tontines/TON-001/contributions');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });

  it('ALLOW: « Voir les adhésions » ouvre la liste d’adhésions de la période existante, sans nouvelle logique inventée', async () => {
    renderTontines('/tontines/TON-001');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Voir les adhésions/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Adhésions de la période' })).toBeInTheDocument();
  });

  it('ALLOW: les périodes réelles de la tontine sont affichées', async () => {
    renderTontines('/tontines/TON-001');
    await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' });
    expect(screen.getByText('Périodes et occurrences')).toBeInTheDocument();
  });

  it('ALLOW: les occurrences réelles de la période la plus récente sont affichées, et une occurrence navigue vers sa vraie fiche (jamais un Tour)', async () => {
    renderTontines('/tontines/TON-001');
    const user = userEvent.setup();
    const occRow = (await screen.findByText('#2')).closest('tr')!;
    const link = within(occRow).getAllByRole('button')[0];
    await user.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: 'Occurrence n° 2' })).toBeInTheDocument();
    expect(screen.queryByText('Tour')).not.toBeInTheDocument();
  });

  it('DENY: aucun lien « Tour » n’existe sur la fiche Tontine', async () => {
    renderTontines('/tontines/TON-001');
    await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' });
    expect(screen.queryByText('Tour')).not.toBeInTheDocument();
  });

  it('ALLOW: le retour à la liste des tontines fonctionne', async () => {
    renderTontines('/tontines/TON-001');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Retour aux tontines' }));
    expect(await screen.findByRole('tab', { name: 'Tontines' })).toBeInTheDocument();
  });
});

describe('Fiche Tontine — le panneau Opérations reste strictement inchangé', () => {
  it('ALLOW: /tontines/operations continue de monter le même composant, avec les mêmes Critères d’affichage', async () => {
    renderTontines('/tontines/operations');
    expect(await screen.findByText('Critères d’affichage')).toBeInTheDocument();
    expect(screen.getByLabelText('Tontine')).toBeInTheDocument();
    expect(screen.getByLabelText('Période')).toBeInTheDocument();
  });
});
