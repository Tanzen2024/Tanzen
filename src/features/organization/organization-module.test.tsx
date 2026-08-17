import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { OrganizationModule } from './organization-module';

/**
 * Correction post-implémentation Phase 4C-4 (cf.
 * docs/P1_GOVERNANCE_PHASE_4C4_GENERALASSEMBLY_MEETING_MIGRATION_UX_CORRECTION_REPORT.md) :
 * `Assembly`/`GeneralAssembly` ne sont plus des points d'entrée autonomes —
 * leurs anciennes routes doivent rediriger vers `Meeting` (jamais un 404, ni
 * une page dédiée reconstruite), pour ne pas casser un lien/marque-page
 * existant vers l'ancienne URL.
 */
function renderOrganization(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/organization/*" element={<OrganizationModule />} />
    </Routes>,
    { route },
  );
}

describe('OrganizationModule — Governance routing (correction post-implémentation Phase 4C-4)', () => {
  it('ALLOW: /organization/governance/meetings renders the unified Meetings list', async () => {
    renderOrganization('/organization/governance/meetings');
    await waitFor(() => expect(screen.getAllByText('Assemblée Générale Ordinaire 2026').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Réunion bureau - Août').length).toBeGreaterThan(0);
  });

  it('DENY→REDIRECT: the old /organization/governance/assemblies route no longer renders an autonomous Assembly page — it redirects to Meetings', async () => {
    renderOrganization('/organization/governance/assemblies');
    await waitFor(() => expect(screen.getAllByText('Réunion bureau - Août').length).toBeGreaterThan(0));
  });

  it('DENY→REDIRECT: the old /organization/governance/general-assemblies list route redirects to Meetings', async () => {
    renderOrganization('/organization/governance/general-assemblies');
    await waitFor(() => expect(screen.getAllByText('Assemblée Générale Ordinaire 2026').length).toBeGreaterThan(0));
  });

  it('DENY→REDIRECT: an old /organization/governance/general-assemblies/:id deep link redirects to the same Meeting id, not to a generic list — no data loss for existing bookmarks', async () => {
    renderOrganization('/organization/governance/general-assemblies/MT-005');
    await waitFor(() => expect(screen.getAllByText('Assemblée Générale Ordinaire 2026').length).toBeGreaterThan(0));
    // Preuve que c'est bien la fiche détail (Meeting MT-005), pas la liste : le Quorum (spécifique GENERAL_ASSEMBLY) y est visible.
    expect(await screen.findByText('Quorum')).toBeInTheDocument();
  });

  it('ALLOW: a GENERAL_ASSEMBLY Meeting detail page exposes Quorum and Décisions — reachable from Meeting, not from a separate autonomous page', async () => {
    renderOrganization('/organization/governance/meetings/MT-005');
    await waitFor(() => expect(screen.getAllByText('Assemblée Générale Ordinaire 2026').length).toBeGreaterThan(0));
    expect(await screen.findByText('Quorum')).toBeInTheDocument();
    expect(await screen.findByText('Décisions')).toBeInTheDocument();
  });

  it('ALLOW: a REGULAR Meeting detail page does not expose Quorum/Décisions (D-4C4-WEB-04/05/06 stay scoped to GENERAL_ASSEMBLY)', async () => {
    renderOrganization('/organization/governance/meetings/MT-001');
    await waitFor(() => expect(screen.getAllByText('Réunion bureau - Août').length).toBeGreaterThan(0));
    expect(screen.queryByText('Quorum')).not.toBeInTheDocument();
  });
});
