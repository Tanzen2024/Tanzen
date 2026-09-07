import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';

/**
 * Chaînage réel Tontine → Période (mandat « retirer Cycle/Type des critères
 * + Matricule des tableaux ») — « Période » est alimentée par
 * `tontineTurnsService.listOccurrencesByTontine`, scopée à LA Tontine
 * sélectionnée (jamais tenant-wide). Cycle/Type ont disparu des Critères
 * d'affichage (mandat précédent) — ce fichier ne les teste donc plus, cf.
 * `tontine-operations-module.test.tsx` (TEST 1/TEST 2) pour leur absence.
 * Même bascule de tenant que `tontine-operations-ledger.test.tsx` (T-002,
 * TON-001 « Tontine Horizon » → PER-001 → OCC-001/OCC-002, MONTHLY/MONEY) :
 * le tenant par défaut (T-001) n'a aucune Occurrence seedée, cf.
 * `tontine-operations-module.test.tsx` pour ce cas.
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

describe('TontineOperationsManage — chaînage réel Tontine → Période (tenant T-002, TON-001 « Tontine Horizon »)', () => {
  it('sélectionner une Tontine active « Période », peuplée directement des occurrences réelles de CETTE Tontine', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();

    const tontineSelect = await screen.findByLabelText('Tontine') as HTMLSelectElement;
    await user.selectOptions(tontineSelect, 'Tontine Horizon');

    const periodSelect = screen.getByLabelText('Période') as HTMLSelectElement;
    expect(periodSelect).not.toBeDisabled();
    expect(await screen.findByRole('option', { name: '#1 · 2026-06-20' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '#2 · 2026-07-20' })).toBeInTheDocument();
  });

  it('sélectionner une occurrence pilote bien les données du panneau (Cotisations des adhérents) et active « + » (création d’occurrence)', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();

    const tontineSelect = await screen.findByLabelText('Tontine') as HTMLSelectElement;
    await user.selectOptions(tontineSelect, 'Tontine Horizon');

    const periodSelect = screen.getByLabelText('Période') as HTMLSelectElement;
    const occurrenceOption = await screen.findByRole('option', { name: '#1 · 2026-06-20' });
    expect(screen.getByLabelText('Créer une occurrence')).toBeDisabled();

    await user.selectOptions(periodSelect, occurrenceOption);

    expect(await screen.findByText(/Cotisations des adhérents/)).toBeInTheDocument();
    expect(screen.getByLabelText('Créer une occurrence')).not.toBeDisabled();
    expect(screen.getByLabelText('Retirer la séance')).toBeDisabled();
  });

  it('désélectionner la Tontine réinitialise « Période » (occurrenceId vidé, champ redésactivé) — aucune donnée de l’ancienne Tontine ne reste affichée', async () => {
    renderTontines('/tontines/operations');
    const user = userEvent.setup();

    const tontineSelect = await screen.findByLabelText('Tontine') as HTMLSelectElement;
    await user.selectOptions(tontineSelect, 'Tontine Horizon');

    const periodSelect = screen.getByLabelText('Période') as HTMLSelectElement;
    const occurrenceOption = await screen.findByRole('option', { name: '#1 · 2026-06-20' });
    await user.selectOptions(periodSelect, occurrenceOption);
    expect(periodSelect.value).not.toBe('');

    await user.selectOptions(tontineSelect, 'Sélectionner une tontine');
    expect(periodSelect.value).toBe('');
    expect(periodSelect).toBeDisabled();
    expect(screen.queryByText(/Cotisations des adhérents/)).not.toBeInTheDocument();
  });
});
