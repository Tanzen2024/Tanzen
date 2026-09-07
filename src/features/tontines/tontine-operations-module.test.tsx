import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';

/**
 * Critères d'affichage du panneau « Opérations » (mandat « retirer Cycle/
 * Type des critères + Matricule des tableaux ») — vérifie le composant
 * effectivement monté par `/tontines` → onglet Opérations
 * (`overview-module.tsx` → `TontineOperationsManage`, via `TontinesModule`).
 * Les Critères d'affichage contiennent désormais exactement Tontine (seul
 * sélecteur réel) et Période (les occurrences réelles de CETTE Tontine,
 * `listOccurrencesByTontine`, désactivée tant qu'aucune Tontine n'est
 * choisie) — plus aucune trace de Cycle/Type comme critère graphique
 * (`Tontine.frequency`/`Tontine.valueType` restent utilisés ailleurs dans le
 * composant, seul leur affichage ici disparaît). Tenant par défaut des
 * tests (T-001, cf. `rbac.mocks.currentUser`) : « Coopérative Sutura »
 * (TON-004) y est réellement seedée mais sans aucune Période/Occurrence
 * (`tontine-periods.ts` ne couvre que T-002/T-005) — cas idéal pour l'état
 * « aucune période disponible » sans inventer de mock ad hoc. Le chaînage
 * avec des occurrences réellement peuplées est couvert par
 * `tontine-operations-chaining.test.tsx` (tenant T-002).
 */
function renderTontines(route: string) {
  return renderWithProviders(
    <Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>,
    { route },
  );
}

describe('TontineOperationsManage — critères d’affichage, état initial et absence de données (tenant T-001)', () => {
  it('sans Tontine sélectionnée, « Période » est désactivée et affiche « Sélectionner une période »', async () => {
    renderTontines('/tontines/operations');
    const periodSelect = await screen.findByLabelText('Période');
    expect(periodSelect).toBeDisabled();
    expect(await screen.findByRole('option', { name: 'Sélectionner une période' })).toBeInTheDocument();
  });

  it('TEST 1 : « Cycle » n’est plus présent dans le panneau Opérations', async () => {
    renderTontines('/tontines/operations');
    await screen.findByLabelText('Tontine');
    expect(screen.queryByLabelText('Cycle')).not.toBeInTheDocument();
  });

  it('TEST 2 : « Type » n’est plus présent comme critère d’affichage', async () => {
    renderTontines('/tontines/operations');
    await screen.findByLabelText('Tontine');
    expect(screen.queryByLabelText('Type')).not.toBeInTheDocument();
  });

  it('TEST 3/4 : « Tontine » et « Période » restent tous les deux présents ; sélectionner Coopérative Sutura active « Période », qui affiche "Aucune période disponible" (aucune donnée réelle pour cette Tontine)', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();

    expect(await screen.findByLabelText('Tontine')).toBeInTheDocument();
    expect(screen.getByLabelText('Période')).toBeInTheDocument();

    const tontineSelect = screen.getByLabelText('Tontine') as HTMLSelectElement;
    await user.selectOptions(tontineSelect, 'Coopérative Sutura');

    const periodSelect = screen.getByLabelText('Période');
    expect(periodSelect).not.toBeDisabled();
    await screen.findByRole('option', { name: 'Aucune période disponible' });
  });

  it('sans occurrence sélectionnée, le bouton « + » (créer une occurrence) reste désactivé ; le bouton « X » est toujours désactivé (aucune suppression d’occurrence n’existe côté service)', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();

    const tontineSelect = await screen.findByLabelText('Tontine') as HTMLSelectElement;
    await user.selectOptions(tontineSelect, 'Coopérative Sutura');

    expect(screen.getByLabelText('Créer une occurrence')).toBeDisabled();
    expect(screen.getByLabelText('Retirer la séance')).toBeDisabled();
  });

  it('le panneau affiche « Sélectionnez une période pour commencer. » tant qu’aucune occurrence n’est choisie', async () => {
    renderTontines('/tontines/operations');
    expect(await screen.findByText('Sélectionnez une période pour commencer.')).toBeInTheDocument();
  });
});
