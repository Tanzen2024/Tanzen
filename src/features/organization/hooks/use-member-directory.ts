import { useEffect, useMemo, useState } from 'react';
import type { Member, PositionRole } from '@/mocks/organization/members';

export type MemberSortKey = 'lastName' | 'joinedAt' | 'status';
export type SortDirection = 'asc' | 'desc';

export const MEMBER_PAGE_SIZES = [10, 25, 50] as const;

/** Rôle réel d'un membre — dérivé de `positions[0]`, comme déjà fait pour la colonne « Rôle » existante (`organization-module.tsx`) ; aucun champ plat `role`/`fonction` n'existe sur `Member`. */
export function memberRole(member: Member): PositionRole {
  return member.positions[0]?.role ?? 'member';
}

/**
 * État de la liste (recherche/filtres/tri/pagination) pour Organisation > Membres.
 * Entièrement côté client : `organizationService.listMembers(tenantId)` charge déjà
 * la totalité des membres du tenant courant (mock, pas de pagination serveur à ce
 * jour) — dériver/trier/paginer en mémoire n'ajoute donc aucune requête réseau et
 * n'introduit aucune dépendance nouvelle.
 *
 * Pas de filtre « Localisation » : dans ce même appel, tous les membres retournés
 * partagent déjà le même `tenantId` (scope du tenant courant) — un tel filtre
 * n'aurait jamais qu'une seule valeur possible, donc jamais d'effet réel.
 */
export function useMemberDirectory(members: Member[]) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | Member['status']>('all');
  const [role, setRole] = useState<'all' | PositionRole>('all');
  const [sortKey, setSortKey] = useState<MemberSortKey>('lastName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(MEMBER_PAGE_SIZES[0]);

  useEffect(() => { const handle = setTimeout(() => setSearch(searchInput), 250); return () => clearTimeout(handle); }, [searchInput]);
  useEffect(() => { setPage(1); }, [search, status, role, pageSize]);

  const availableRoles = useMemo(() => Array.from(new Set(members.map(memberRole))), [members]);

  const filtered = useMemo(() => members.filter((member) => {
    if (status !== 'all' && member.status !== status) return false;
    if (role !== 'all' && memberRole(member) !== role) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return [member.firstName, member.lastName, member.email, member.phone, member.matricule, member.id].some((field) => field.toLowerCase().includes(needle));
  }), [members, search, status, role]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const result = sortKey === 'lastName' ? a.lastName.localeCompare(b.lastName) : sortKey === 'joinedAt' ? a.joinedAt.localeCompare(b.joinedAt) : a.status.localeCompare(b.status);
      return sortDirection === 'asc' ? result : -result;
    });
    return copy;
  }, [filtered, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  /**
   * Resynchronise l'état `page` lui-même (pas seulement `currentPage`, dérivé) dès que
   * `pageCount` diminue — sinon une page devenue invalide (ex. page 3 après un filtre qui
   * ne laisse qu'1 page) reste seulement clampée à l'affichage : un état obsolète pourrait
   * resurgir plus tard si `pageCount` remonte (ex. réinitialisation des filtres, ou liste
   * qui regagne des membres après une autre mutation), causant un saut de page inattendu.
   */
  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);
  const rows = useMemo(() => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize), [sorted, currentPage, pageSize]);

  const toggleSort = (key: MemberSortKey) => {
    if (key === sortKey) setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDirection('asc'); }
  };

  const resetFilters = () => { setSearchInput(''); setSearch(''); setStatus('all'); setRole('all'); };
  const hasActiveFilters = Boolean(search) || status !== 'all' || role !== 'all';

  return { searchInput, setSearchInput, status, setStatus, role, setRole, availableRoles, sortKey, sortDirection, toggleSort, page: currentPage, setPage, pageSize, setPageSize, pageCount, total: sorted.length, totalUnfiltered: members.length, rows, resetFilters, hasActiveFilters };
}
