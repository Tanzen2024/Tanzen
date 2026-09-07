import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';

/**
 * Vérification de rendu réel (mandat « contrôle final » — capture jointe) :
 * `/tontines` → onglet « Opérations » doit monter `TontineOperationsManage`
 * (Critères d'affichage + Cotisations/Bénéficiaire/etc.), jamais l'ancienne
 * liste agrégée `AggregatedOperationsTab` (recherche « une tontine ou une
 * occurrence », filtres « Toutes les tontines »/« Tous les statuts »).
 * Monte le VRAI arbre de routage (`TontinesModule`, exactement ce que
 * `app-router.tsx` monte sur `/tontines/*`), pas une reconstruction
 * manuelle des sous-composants — pour prouver que le chemin de rendu réel,
 * pas seulement le JSX source, a bien changé.
 */
function renderTontines(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/tontines/*" element={<TontinesModule />} />
    </Routes>,
    { route },
  );
}

describe('TontinesOverview — onglet Opérations (mandat routage « Gestion des opérations »)', () => {
  it('ALLOW: /tontines renders the Opérations tab trigger', async () => {
    renderTontines('/tontines');
    expect(await screen.findByRole('tab', { name: 'Opérations' })).toBeInTheDocument();
  });

  it('ALLOW: clicking the Opérations tab mounts TontineOperationsManage (Critères d’affichage), not the old aggregated occurrence list', async () => {
    renderTontines('/tontines');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Opérations' }));

    const panel = await screen.findByRole('tabpanel', { name: 'Opérations' });
    // Marqueur de traçage (mandat « afficher réellement TontineOperationsManage ») : preuve DOM directe,
    // au-delà du seul texte, que c'est bien ce composant — et aucun autre — qui est monté ici.
    expect(within(panel).getByTestId('tontine-operations-real-component')).toBeInTheDocument();
    expect(within(panel).getByText('Critères d’affichage')).toBeInTheDocument();

    // L'ancien écran agrégé ne doit plus jamais apparaître sous cet onglet.
    expect(within(panel).queryByPlaceholderText('Rechercher une tontine ou une occurrence…')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Toutes les tontines')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Aucune occurrence')).not.toBeInTheDocument();
  });

  it('ALLOW: the standalone /tontines/operations route mounts the exact same component (no second implementation)', async () => {
    renderTontines('/tontines/operations');
    expect(await screen.findByText('Critères d’affichage')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Rechercher une tontine ou une occurrence…')).not.toBeInTheDocument();
  });

  it('ALLOW: « Tontine » et « Période » sont visibles dès l’affichage des Critères ; « Cycle »/« Type » ont disparu (mandat « retirer Cycle/Type des critères »)', async () => {
    renderTontines('/tontines/operations');
    expect(await screen.findByLabelText('Tontine')).toBeInTheDocument();
    expect(screen.getByLabelText('Période')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cycle')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Type')).not.toBeInTheDocument();
  });

  it('DENY: « Libellé compte », « Solde compte », l’Exercice et ses dates ont disparu du panneau (mandat « supprimer Libellé compte/Solde compte/Exercice/Date début/Date fin ») — le Fiscal Year n’est plus un critère graphique', async () => {
    renderTontines('/tontines/operations');
    await screen.findByLabelText('Tontine');

    expect(screen.queryByText('Libellé compte')).not.toBeInTheDocument();
    expect(screen.queryByText('Solde compte')).not.toBeInTheDocument();
    expect(screen.queryByText('Exercice')).not.toBeInTheDocument();
    expect(screen.queryByText('Date début')).not.toBeInTheDocument();
    expect(screen.queryByText('Date fin')).not.toBeInTheDocument();
    expect(screen.queryByText(/Exercice 20\d\d/)).not.toBeInTheDocument();
  });

  it('DENY: « Tontine » n’est jamais alimenté par Account — aucune trace de « Sélectionner un compte », il pointe sur les vraies Tontines et pilote seul `tontineId`', async () => {
    renderTontines('/tontines/operations');
    await screen.findByLabelText('Tontine');
    expect(screen.queryByText('Sélectionner un compte')).not.toBeInTheDocument();

    const tontineSelect = screen.getByLabelText('Tontine') as HTMLSelectElement;
    const tontineOptions = within(tontineSelect).getAllByRole('option').map((option) => option.textContent);
    expect(tontineOptions[0]).toBe('Sélectionner une tontine');
    const realTontineOption = tontineOptions.find((label) => label && label !== 'Sélectionner une tontine');
    expect(realTontineOption).toBeTruthy();

    const periodSelect = screen.getByLabelText('Période') as HTMLSelectElement;
    expect(periodSelect).toBeDisabled();
    const user = userEvent.setup();
    await user.selectOptions(tontineSelect, realTontineOption!);
    expect(periodSelect).not.toBeDisabled();
  });
});

/**
 * Mandat « simplification du module Tontine » — les onglets « Vue d'ensemble »,
 * « Contributions » et « Membres » (agrégations lecture seule toutes tontines
 * confondues) sont retirés du menu `/tontines` : leur contenu était déjà
 * intégralement couvert par « Opérations » (cotisations/participation/statut)
 * et « Adhésions » (liste des adhérents par période), jamais une perte de
 * fonctionnalité. Seuls « Tontines » et « Opérations » restent.
 */
describe('TontinesOverview — menu simplifié (mandat « simplification du module Tontine »)', () => {
  it('DENY: les onglets Vue d’ensemble / Contributions / Membres ont disparu du menu /tontines', async () => {
    renderTontines('/tontines');
    await screen.findByRole('tab', { name: 'Tontines' });
    expect(screen.queryByRole('tab', { name: 'Vue d’ensemble' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Contributions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Membres' })).not.toBeInTheDocument();
  });

  it('ALLOW: seuls « Tontines » et « Opérations » restent, « Tontines » est l’onglet par défaut', async () => {
    renderTontines('/tontines');
    expect(await screen.findByRole('tab', { name: 'Tontines', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Opérations' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('ALLOW: l’onglet Tontines affiche bien la liste réelle des tontines (TontinesTableSection)', async () => {
    renderTontines('/tontines');
    expect(await screen.findByPlaceholderText('Nom de la tontine')).toBeInTheDocument();
  });

  it('DENY: /tontines/:id/contributions n’existe plus (mandat « suppression de l’écran Contribution ») — 404 propre', async () => {
    renderTontines('/tontines/TON-004/contributions');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });
});
