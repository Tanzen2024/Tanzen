import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render-with-providers';
import type { Member } from '@/mocks/organization/members';
import { MemberTable } from './member-table';

const member: Member = {
  id: 'M-001', uuid: 'uuid-1', tenantId: 'T-001', matricule: '', firstName: 'Fatou', lastName: 'Ndiaye',
  gender: 'female', birthDate: '1988-04-12', nationality: 'Sénégalaise', idNumber: '', occupation: 'Commerçante',
  email: 'fatou.ndiaye@email.sn', phone: '+221 77 123 45 67', address: '', photoUrl: '', joinedAt: '2021-03-20', status: 'active',
  statusHistory: [{ status: 'active', since: '2021-03-20' }], syncStatus: 'synced', version: 1,
  createdAt: '2021-03-20T00:00:00.000Z', updatedAt: '2021-03-20T00:00:00.000Z', deletedAt: null, createdBy: null, updatedBy: null,
  tenantName: 'Coopérative Sutura', positions: [], accounts: [], documents: [], activities: [], governanceParticipation: [],
};

/**
 * Même technique d'isolation par rôle que `permission-gate.test.tsx` (mock du module
 * `rbac.mocks`, `role-admin` détenant toutes les permissions par défaut).
 *
 * `vi.resetModules()` invalide tout le registre de modules Vitest, y compris
 * `@testing-library/react` lui-même : la fonction `cleanup` importée statiquement une
 * fois dans `src/test/setup.ts` (avant tout `resetModules`) ne correspond alors plus à
 * l'instance de `render()` obtenue ici par import dynamique après reset — l'`afterEach`
 * global ne démonte donc plus réellement ces rendus, laissant les boutons ⋮ (même
 * `aria-label`, même membre fixe) s'accumuler d'un test à l'autre au sein du même
 * fichier. D'où le besoin d'importer et d'appeler `cleanup` explicitement, depuis la
 * même instance de module que celle utilisée pour `render`.
 *
 * Le coût de `resetModules()` + réimport dynamique à chaque test (plus lourd qu'un
 * rendu simple) peut dépasser le timeout par défaut (5s) sous contention CPU (suite
 * complète en parallèle) — chaque test précise donc un timeout de 15s en 3e argument.
 */
let activeCleanup: (() => void) | null = null;
const TEST_TIMEOUT = 15000;

async function renderTableAs(roleId: 'role-admin' | 'role-viewer' | 'role-manager') {
  vi.resetModules();
  vi.doMock('@/mocks/rbac.mocks', async () => {
    const actual = await vi.importActual<typeof import('@/mocks/rbac.mocks')>('@/mocks/rbac.mocks');
    const role = actual.systemRoles.find((item) => item.id === roleId)!;
    return { ...actual, currentUser: { ...actual.currentUser, roleIds: [roleId], permissions: role.permissions, scope: role.scope } };
  });
  const { renderWithProviders } = await import('@/test/render-with-providers');
  const { cleanup } = await import('@testing-library/react');
  const { MemberTable } = await import('./member-table');
  const t = (_section: 'organization' | 'nav', key: string) => key;
  const handlers = { onView: vi.fn(), onEdit: vi.fn(), onPrint: vi.fn(), onDelete: vi.fn(), onSort: vi.fn() };
  const view = renderWithProviders(
    <MemberTable t={t} rows={[member]} sortKey="lastName" sortDirection="asc" emptyTitle="empty" {...handlers} />,
  );
  activeCleanup = cleanup;
  return { ...view, handlers };
}

describe('MemberTable — actions par ligne et RBAC (⋮ Voir / Modifier / Imprimer / Supprimer)', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { activeCleanup?.(); activeCleanup = null; });

  it('role-admin (toutes permissions) : les 4 actions sont proposées dans le menu', async () => {
    const user = userEvent.setup();
    await renderTableAs('role-admin');
    await user.click(screen.getByRole('button', { name: /Actions/i }));
    expect(await screen.findByText('viewDetail')).toBeInTheDocument();
    expect(screen.getByText('editMember')).toBeInTheDocument();
    expect(screen.getByText('print')).toBeInTheDocument();
    expect(screen.getByText('deleteMember')).toBeInTheDocument();
  }, TEST_TIMEOUT);

  it('role-viewer (lecture seule, sans members.update ni members.delete) : Modifier et Supprimer sont absents, Voir et Imprimer restent proposés', async () => {
    const user = userEvent.setup();
    await renderTableAs('role-viewer');
    await user.click(screen.getByRole('button', { name: /Actions/i }));
    expect(await screen.findByText('viewDetail')).toBeInTheDocument();
    expect(screen.getByText('print')).toBeInTheDocument();
    expect(screen.queryByText('editMember')).not.toBeInTheDocument();
    expect(screen.queryByText('deleteMember')).not.toBeInTheDocument();
  }, TEST_TIMEOUT);

  it('role-manager (update mais pas delete, cf. rbac.mocks: `.delete` exclu) : Modifier présent, Supprimer absent', async () => {
    const user = userEvent.setup();
    await renderTableAs('role-manager');
    await user.click(screen.getByRole('button', { name: /Actions/i }));
    expect(await screen.findByText('editMember')).toBeInTheDocument();
    expect(screen.queryByText('deleteMember')).not.toBeInTheDocument();
  }, TEST_TIMEOUT);

  it('cliquer "Voir le détail" appelle onView avec le membre — la ligne n\'est pas la seule voie d\'accès à la fiche', async () => {
    const user = userEvent.setup();
    const { handlers } = await renderTableAs('role-admin');
    await user.click(screen.getByRole('button', { name: /Actions/i }));
    await user.click(await screen.findByText('viewDetail'));
    expect(handlers.onView).toHaveBeenCalledWith(member);
  }, TEST_TIMEOUT);

  it('le menu est utilisable au clavier : Tab jusqu\'au déclencheur, Entrée l\'ouvre, Échap le referme', async () => {
    const user = userEvent.setup();
    await renderTableAs('role-admin');
    const trigger = screen.getByRole('button', { name: /Actions/i });
    // La table a plusieurs cibles focusables avant le déclencheur ⋮ (3 en-têtes triables + le nom du membre) —
    // on avance au clavier jusqu'à l'atteindre plutôt que de supposer un nombre de Tab fixe, pour ne pas coupler
    // le test à l'ordre exact des colonnes.
    for (let i = 0; i < 10 && document.activeElement !== trigger; i += 1) await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('viewDetail')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('viewDetail')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus(); // le focus revient au déclencheur (comportement Radix par défaut)
  }, TEST_TIMEOUT);
});

describe('MemberTable — colonne Membre (photo réelle vs initiales)', () => {
  const t = (_section: 'organization' | 'nav', key: string) => key;
  const noop = () => {};

  it('TEST 4 — photo réellement affichée dans la ligne quand le membre en a une', () => {
    const withPhoto: Member = { ...member, photoUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>' };
    const { container } = renderWithProviders(<MemberTable t={t} rows={[withPhoto]} sortKey="lastName" sortDirection="asc" emptyTitle="empty" onView={noop} onEdit={noop} onPrint={noop} onDelete={noop} onSort={noop} />);
    const row = within(container).getAllByRole('row')[1];
    expect(within(row).getByRole('img')).toBeInTheDocument();
    expect(within(row).queryByText('FN')).not.toBeInTheDocument();
  });

  it('membre sans photo dans la même liste : initiales affichées, aucune image', () => {
    const { container } = renderWithProviders(<MemberTable t={t} rows={[member]} sortKey="lastName" sortDirection="asc" emptyTitle="empty" onView={noop} onEdit={noop} onPrint={noop} onDelete={noop} onSort={noop} />);
    const row = within(container).getAllByRole('row')[1];
    expect(within(row).getByText('FN')).toBeInTheDocument();
    expect(within(row).queryByRole('img')).not.toBeInTheDocument();
  });
});
