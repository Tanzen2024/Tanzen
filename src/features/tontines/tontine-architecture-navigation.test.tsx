import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';

/**
 * Mandat « SUPPRESSION COMPLÈTE DE LA LOGIQUE CYCLE/TOUR DU MODULE TONTINE »
 * §22, points 10 à 17 — vérifie qu'aucun écran/lien Cycle ou Turn n'est plus
 * navigable, et que les écrans Opérations/Adhésions/Planning restent tous
 * fonctionnels. Volontairement séparé de la vérification service
 * (`tontine-architecture.service.test.ts`), voir le commentaire de ce
 * fichier pour la raison (accumulation de travail React Query en arrière-plan
 * quand des appels de service asynchrones et des rendus sont mélangés).
 * Point 15 (ex-Contributions) mis à jour par le mandat « suppression de
 * l'écran Contribution » : cet écran n'existe plus, /tontines/:id/contributions
 * doit désormais aboutir à une 404 propre.
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

describe('§22.10-13 — Aucun écran/lien Cycle ou Turn n’est plus navigable', () => {
  it('10) DENY: aucune route Cycle n’existe plus (/tontines/:id/cycles/:cycleId → 404)', async () => {
    renderTontines('/tontines/TON-001/cycles/CYC-001');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });

  it('11) DENY: aucune route Turn n’existe plus (/tontines/:id/periods/:pid/occurrences/:oid/turn → 404)', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/occurrences/OCC-001/turn');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });

  it('12) DENY: aucun lien/bouton « Tour » n’est affiché sur la fiche Occurrence', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/occurrences/OCC-002');
    await screen.findByRole('heading', { level: 1, name: 'Occurrence n° 2' });
    expect(screen.queryByText('Tour')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tour/i })).not.toBeInTheDocument();
  });

  it('13) DENY: aucun lien/bouton « Cycle » n’est affiché sur la fiche tontine', async () => {
    renderTontines('/tontines/TON-001');
    await screen.findByRole('heading', { level: 1, name: 'Tontine Horizon' });
    expect(screen.queryByRole('button', { name: /cycle/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cycle/i })).not.toBeInTheDocument();
  });
});

describe('§22.14-17 — Les écrans Opérations/Contributions/Adhésions/Planning fonctionnent toujours', () => {
  it('14) Opérations reste accessible et fonctionnel (/tontines/operations)', async () => {
    renderTontines('/tontines/operations');
    expect(await screen.findByRole('heading', { level: 1, name: 'Gestion des opérations' })).toBeInTheDocument();
  });

  it('15) DENY: l’écran Contributions n’existe plus (/tontines/:id/contributions → 404) — les cotisations se gèrent depuis Opérations', async () => {
    renderTontines('/tontines/TON-001/contributions');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });

  it('16) Adhésions reste accessible et fonctionnel (/tontines/:id/periods/:pid/adhesions)', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/adhesions');
    expect(await screen.findByRole('heading', { level: 1, name: 'Adhésions de la période' })).toBeInTheDocument();
  });

  it('17) Planning reste accessible et fonctionnel (/tontines/:id/periods/:pid/planning)', async () => {
    renderTontines('/tontines/TON-001/periods/PER-001/planning');
    expect(await screen.findByRole('heading', { level: 1, name: 'Planification des bénéficiaires' })).toBeInTheDocument();
  });
});
