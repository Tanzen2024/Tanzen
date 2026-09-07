import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';

/**
 * Mandat « FLUIDIFIER LA NAVIGATION ET LES WORKFLOWS DU MODULE TONTINE » —
 * vérifie que les boutons « Retour » du module utilisent une destination
 * explicite et contextuellement correcte (jamais `navigate(-1)`, qui dépend
 * de l'historique du navigateur plutôt que de la hiérarchie réelle des
 * écrans). Les scénarios historiques Cycle/Draw/Winner (CycleDetail,
 * DrawsHub, DrawDetail, WinnerDetail) ont été retirés de ce fichier : ces
 * écrans/routes n'existent plus (mandat « suppression complète de la logique
 * Cycle/Tour ») — voir `tontine-operations-chaining.test.tsx` et
 * `overview-module.test.tsx` pour la couverture de navigation du modèle
 * actuel Tontine → Période → Occurrence → Opérations. Tenant T-002 (TON-001
 * « Tontine Horizon » → PER-001) est réellement seedé.
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

describe('Navigation « Retour » du module Tontines — destinations explicites et contextuelles (jamais navigate(-1))', () => {
  it('TontineEdit → Retour à la tontine ramène sur la fiche de LA tontine éditée', async () => {
    renderTontines('/tontines/TON-001/edit');
    const user = userEvent.setup();
    const backButton = await screen.findByRole('button', { name: 'Retour à la tontine' });
    await user.click(backButton);
    expect(await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' })).toBeInTheDocument();
  });

  it('PeriodAdhesionCreate → Retour aux adhésions ramène sur la liste des adhésions DE cette période (jamais « Retour à la tontine »)', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/adhesions/new');
    const backButton = await screen.findByRole('button', { name: 'Retour aux adhésions' });
    expect(backButton).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retour à la tontine' })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(backButton);
    expect(await screen.findByRole('heading', { level: 1, name: 'Adhésions de la période' })).toBeInTheDocument();
  });

  it('PeriodAdhesionDetail → Retour aux adhésions ramène sur la liste des adhésions DE cette période', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/adhesions/ADH-001');
    const backButton = await screen.findByRole('button', { name: 'Retour aux adhésions' });
    const user = userEvent.setup();
    await user.click(backButton);
    expect(await screen.findByRole('heading', { level: 1, name: 'Adhésions de la période' })).toBeInTheDocument();
  });
});
