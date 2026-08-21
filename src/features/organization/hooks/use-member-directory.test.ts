import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Member } from '@/mocks/organization/members';
import { useMemberDirectory, memberRole, MEMBER_PAGE_SIZES } from './use-member-directory';

/**
 * Jeu de données 100% synthétique, local à ce fichier de test — ne touche jamais
 * `mocks/organization/members.ts` (données métier). Sert uniquement à prouver le
 * comportement de pagination/tri/filtre à des tailles que les 8 membres mockés du
 * projet ne permettent pas d'atteindre (le mandat demande explicitement 11/25/26/51).
 */
function makeMember(index: number, overrides: Partial<Member> = {}): Member {
  const statuses: Member['status'][] = ['active', 'inactive', 'suspended', 'exited'];
  const padded = String(index).padStart(3, '0');
  return {
    id: `T-${padded}`, uuid: `uuid-${padded}`, tenantId: 'T-TEST', matricule: '',
    firstName: `Prenom${padded}`, lastName: `Nom${padded}`, gender: index % 2 === 0 ? 'male' : 'female',
    birthDate: '1990-01-01', nationality: 'Test', idNumber: '', occupation: 'Test',
    email: `member${padded}@test.sn`, phone: `+000${padded}`, address: '', photoUrl: '',
    joinedAt: `2020-01-${String((index % 28) + 1).padStart(2, '0')}`,
    status: statuses[index % statuses.length],
    statusHistory: [{ status: statuses[index % statuses.length], since: '2020-01-01' }],
    syncStatus: 'synced', version: 1, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
    deletedAt: null, createdBy: null, updatedBy: null, tenantName: 'Tenant Test',
    positions: index % 3 === 0 ? [{ id: `P-${padded}`, role: 'treasurer', tenantName: 'Tenant Test', startDate: '2020-01-01', endDate: null }] : [],
    accounts: [], documents: [], activities: [], governanceParticipation: [],
    ...overrides,
  };
}

function makeMembers(count: number): Member[] { return Array.from({ length: count }, (_, i) => makeMember(i + 1)); }

describe('useMemberDirectory — pagination (tailles réelles demandées par le mandat)', () => {
  it.each([0, 1, 2, 10, 11, 25, 26, 50, 51, 100])('taille=%i : pageCount/rows cohérents à la taille de page par défaut (10)', (count) => {
    const { result } = renderHook(() => useMemberDirectory(makeMembers(count)));
    const expectedPageCount = count === 0 ? 1 : Math.ceil(count / 10);
    expect(result.current.pageCount).toBe(expectedPageCount);
    expect(result.current.total).toBe(count);
    expect(result.current.rows.length).toBe(count === 0 ? 0 : Math.min(10, count));
  });

  it('dernière page partielle contient le bon reste (26 membres, 10/page → page 3 = 6 lignes)', () => {
    const { result } = renderHook(() => useMemberDirectory(makeMembers(26)));
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    expect(result.current.rows.length).toBe(6);
  });

  it('page suivante / page précédente déplacent bien la fenêtre de lignes', () => {
    const { result } = renderHook(() => useMemberDirectory(makeMembers(25)));
    const page1Ids = result.current.rows.map((m) => m.id);
    act(() => result.current.setPage(2));
    const page2Ids = result.current.rows.map((m) => m.id);
    expect(page2Ids).not.toEqual(page1Ids);
    act(() => result.current.setPage(1));
    expect(result.current.rows.map((m) => m.id)).toEqual(page1Ids);
  });

  it('changement de taille de page (10/25/50) recalcule pageCount et revient en page 1', () => {
    const { result } = renderHook(() => useMemberDirectory(makeMembers(51)));
    act(() => result.current.setPage(4)); // page 4/6 à 10/page
    expect(result.current.pageCount).toBe(6);
    act(() => result.current.setPageSize(25));
    expect(result.current.page).toBe(1);
    expect(result.current.pageCount).toBe(3); // ceil(51/25)
    act(() => result.current.setPageSize(50));
    expect(result.current.page).toBe(1);
    expect(result.current.pageCount).toBe(2); // ceil(51/50)
  });

  it('une page devenue invalide après filtrage revient automatiquement à la page 1 (pas de page fantôme)', () => {
    const members = makeMembers(51); // status cycle 4 → ~13 actifs
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.setPage(5)); // page valide à 10/page (51 → 6 pages)
    expect(result.current.page).toBe(5);
    act(() => result.current.setStatus('active'));
    const activeCount = members.filter((m) => m.status === 'active').length;
    const expectedPageCount = Math.max(1, Math.ceil(activeCount / 10));
    expect(result.current.pageCount).toBe(expectedPageCount);
    expect(result.current.page).toBeLessThanOrEqual(expectedPageCount);
    expect(result.current.page).toBe(1); // reset explicite au changement de filtre
  });

  it('la page ne "resurgit" pas: si pageCount remonte après reset des filtres, on reste en page 1 (pas de retour furtif à l\'ancienne page)', () => {
    const members = makeMembers(51);
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.setPage(5));
    act(() => result.current.setStatus('active')); // clamp -> page 1
    act(() => result.current.setStatus('all')); // pageCount remonte à 6
    expect(result.current.pageCount).toBe(6);
    expect(result.current.page).toBe(1); // reste en page 1, ne saute pas à 5
  });

  it('0 membre : pageCount=1, rows=[], pas de division par zéro', () => {
    const { result } = renderHook(() => useMemberDirectory([]));
    expect(result.current.pageCount).toBe(1);
    expect(result.current.rows).toEqual([]);
    expect(Number.isFinite(result.current.pageCount)).toBe(true);
  });

  it('MEMBER_PAGE_SIZES expose les tailles 10/25/50 attendues par la maquette', () => {
    expect(MEMBER_PAGE_SIZES).toEqual([10, 25, 50]);
  });
});

describe('useMemberDirectory — recherche', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('debounce: la recherche appliquée (total) ne change qu\'après le délai, pas à chaque frappe', () => {
    const members = makeMembers(5);
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.setSearchInput('Nom001'));
    // Avant l'expiration du debounce, aucun filtrage n'a encore eu lieu.
    expect(result.current.total).toBe(5);
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current.total).toBe(1);
  });

  it('race condition: plusieurs frappes rapides — seule la dernière valeur recherchée doit compter (annulation via cleanup du debounce)', () => {
    const members = makeMembers(5);
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.setSearchInput('Nom001'));
    act(() => { vi.advanceTimersByTime(100); }); // n'atteint pas encore les 250ms
    act(() => result.current.setSearchInput('Nom002'));
    act(() => { vi.advanceTimersByTime(100); }); // toujours pas 250ms depuis la 2e frappe
    expect(result.current.total).toBe(5); // rien appliqué prématurément
    act(() => { vi.advanceTimersByTime(250); });
    // Seule la dernière frappe ("Nom002") doit avoir été appliquée, pas "Nom001".
    expect(result.current.total).toBe(1);
    expect(result.current.rows[0]?.lastName).toBe('Nom002');
  });

  it('recherche insensible à la casse et aux espaces superflus', () => {
    const members = makeMembers(5);
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.setSearchInput('  nOm001  '));
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current.total).toBe(1);
  });

  it('recherche vide (ou espaces seuls) ne filtre rien', () => {
    const members = makeMembers(5);
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.setSearchInput('   '));
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current.total).toBe(5);
  });

  it('texte inexistant retourne un résultat vide sans erreur', () => {
    const members = makeMembers(5);
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.setSearchInput('zzzznexistepas'));
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current.total).toBe(0);
    expect(result.current.rows).toEqual([]);
  });

  it('caractères accentués recherchés à l\'identique trouvent le membre correspondant', () => {
    const members = [makeMember(1, { firstName: 'Aïssatou', lastName: 'Bâ' }), makeMember(2)];
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.setSearchInput('Aïssatou'));
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current.total).toBe(1);
    expect(result.current.rows[0]?.firstName).toBe('Aïssatou');
  });
});

describe('useMemberDirectory — filtres combinés et compteur', () => {
  it('statut seul, fonction seule, puis combinés — le compteur "total" reste exact à chaque étape', () => {
    const members = makeMembers(30);
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.setStatus('active'));
    const activeCount = members.filter((m) => m.status === 'active').length;
    expect(result.current.total).toBe(activeCount);

    act(() => result.current.setRole('treasurer'));
    const combinedCount = members.filter((m) => m.status === 'active' && memberRole(m) === 'treasurer').length;
    expect(result.current.total).toBe(combinedCount);

    act(() => result.current.resetFilters());
    expect(result.current.total).toBe(members.length);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('la liste des fonctions disponibles ne contient que des rôles réellement présents dans les données', () => {
    const members = makeMembers(10); // seuls les index%3===0 ont une position (treasurer)
    const { result } = renderHook(() => useMemberDirectory(members));
    expect(result.current.availableRoles).toContain('treasurer');
    expect(result.current.availableRoles).toContain('member'); // fallback par défaut de memberRole()
    expect(result.current.availableRoles).not.toContain('president');
  });
});

describe('useMemberDirectory — tri', () => {
  it('le tri par défaut est déjà "Nom" ASC (état initial du hook)', () => {
    const members = makeMembers(5);
    const { result } = renderHook(() => useMemberDirectory(members));
    expect(result.current.sortKey).toBe('lastName');
    expect(result.current.sortDirection).toBe('asc');
  });

  it('tri ASC puis DESC (colonne Adhésion), sans muter le tableau source', () => {
    const members = makeMembers(5);
    const originalOrder = members.map((m) => m.id);
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.toggleSort('joinedAt')); // changement de colonne -> repart en asc
    expect(result.current.sortDirection).toBe('asc');
    const ascIds = result.current.rows.map((m) => m.id);
    act(() => result.current.toggleSort('joinedAt')); // même colonne -> bascule en desc
    expect(result.current.sortDirection).toBe('desc');
    const descIds = result.current.rows.map((m) => m.id);
    expect(descIds).toEqual([...ascIds].reverse());
    // Le tableau source passé en argument ne doit jamais être réordonné.
    expect(members.map((m) => m.id)).toEqual(originalOrder);
  });

  it('cliquer une première fois sur la colonne déjà triée par défaut (Nom) bascule en DESC, ne réinitialise pas en ASC', () => {
    const members = makeMembers(5);
    const { result } = renderHook(() => useMemberDirectory(members));
    // sortKey === 'lastName' dès le départ : un premier clic sur "Nom" est donc un 2e état du même tri, pas une sélection fraîche.
    act(() => result.current.toggleSort('lastName'));
    expect(result.current.sortKey).toBe('lastName');
    expect(result.current.sortDirection).toBe('desc');
  });

  it('re-cliquer une 3e fois (retour ASC) restaure l\'ordre initial du tri', () => {
    const members = makeMembers(5);
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.toggleSort('joinedAt')); // asc
    const firstAsc = result.current.rows.map((m) => m.id);
    act(() => result.current.toggleSort('joinedAt')); // desc
    act(() => result.current.toggleSort('joinedAt')); // asc again
    expect(result.current.rows.map((m) => m.id)).toEqual(firstAsc);
  });

  it('changer de clé de tri repart toujours en ASC', () => {
    const members = makeMembers(5);
    const { result } = renderHook(() => useMemberDirectory(members));
    act(() => result.current.toggleSort('status'));
    act(() => result.current.toggleSort('status'));
    expect(result.current.sortDirection).toBe('desc');
    act(() => result.current.toggleSort('lastName'));
    expect(result.current.sortKey).toBe('lastName');
    expect(result.current.sortDirection).toBe('asc');
  });
});
