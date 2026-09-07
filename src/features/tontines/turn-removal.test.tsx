import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';

/**
 * Mandat « SUPPRESSION COMPLÈTE DE LA FONCTIONNALITÉ TOUR » — la fiche Tour
 * (`TurnDetail`) et l'écran de désignation de bénéficiaires qui lui était
 * propre (`TurnBeneficiariesManage`) ont été retirés, avec leurs routes
 * `.../occurrences/:occurrenceId/turn` et `.../turn/beneficiaries`. Le
 * modèle Occurrence → Turn → TurnBeneficiary reste en interne (utilisé par
 * le panneau Opérations et le workflow de permutation, tous deux hors
 * périmètre de cette suppression), mais n'est plus jamais navigable en tant
 * que page dédiée. Tenant T-002 (TON-001 « Tontine Horizon » → PER-001 →
 * OCC-001 fermée/TURN-001 fermé, OCC-002 ouverte/TURN-002 ouvert avec 2
 * bénéficiaires) réellement seedé, comme dans `tontines-navigation.test.tsx`.
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

describe('Suppression de la fonctionnalité Tour — routes mortes', () => {
  it('DENY: la route .../occurrences/:id/turn n’existe plus (404, pas la fiche Tour)', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/occurrences/OCC-001/turn');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });

  it('DENY: la route .../turn/beneficiaries n’existe plus (404, pas l’écran de désignation)', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/occurrences/OCC-001/turn/beneficiaries');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });
});

describe('Suppression de la fonctionnalité Tour — OccurrenceDetail reste fonctionnel, sans aucun accès Tour', () => {
  it('ALLOW: la fiche Occurrence reste accessible et affiche ses cotisations', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/occurrences/OCC-002');
    expect(await screen.findByRole('heading', { level: 1, name: 'Occurrence n° 2' })).toBeInTheDocument();
  });

  it('DENY: aucun bouton/lien « Tour »/« Bénéficiaires » n’est affiché sur la fiche Occurrence', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/occurrences/OCC-002');
    await screen.findByRole('heading', { level: 1, name: 'Occurrence n° 2' });
    expect(screen.queryByText('Tour')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bénéficiaires/i })).not.toBeInTheDocument();
  });

  it('ALLOW: la clôture d’une Occurrence ouverte reste proposée directement (plus d’étape Tour séparée requise)', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/occurrences/OCC-002');
    expect(await screen.findByRole('button', { name: 'Clôturer l’occurrence' })).toBeInTheDocument();
  });
});

describe('Suppression de la fonctionnalité Tour — Planification (planning-module.tsx) ne navigue plus vers Tour', () => {
  it('ALLOW: le chevron « voir » d’une ligne planifiée ouvre la fiche Occurrence, jamais une fiche Tour', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/planning');
    const user = userEvent.setup();
    // Ligne du Turn #1 (bénéficiaire ADH-001 · Fatou Ndiaye) — identifiée par le nom du membre plutôt que par "#1"
    // (ambigu : ce même texte apparaît aussi dans la colonne « Occurrence n° » de cette ligne, occurrenceNumber === turnNumber === 1).
    const row = (await screen.findByText('Fatou Ndiaye')).closest('tr')!;
    const chevron = within(row).getByRole('button', { name: 'Voir le détail' });
    await user.click(chevron);
    expect(await screen.findByRole('heading', { level: 1, name: 'Occurrence n° 1' })).toBeInTheDocument();
  });
});
