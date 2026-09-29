/**
 * Filtre Statut des listes Caisses et Tontines (mandat « Supprimer = désactiver », 2026-09-27) :
 * « Actives » (défaut), « Inactives » (toute entité non active — supprimée logiquement ou
 * archivée), « Toutes ». Une seule règle partagée pour que les deux modules restent cohérents.
 */
export type StatusFilter = 'active' | 'inactive' | 'all';

export const STATUS_FILTERS: readonly StatusFilter[] = ['active', 'inactive', 'all'];

export function matchesStatusFilter(isActive: boolean, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'active' ? isActive : !isActive;
}
