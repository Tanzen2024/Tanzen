import { Search, X } from 'lucide-react';
import type { Member, PositionRole } from '@/mocks/organization/members';

type T = (section: 'organization' | 'nav', key: string, values?: Record<string, string>) => string;

const MEMBER_STATUSES: Member['status'][] = ['active', 'inactive', 'suspended', 'exited'];

/**
 * Barre de filtres unique pour Organisation > Membres : recherche + Statut (4 valeurs
 * réelles du modèle) + Fonction (dérivée de `positions[0].role`) + Réinitialiser.
 * Ne duplique pas ces mêmes critères sous forme de filtres par en-tête de colonne —
 * les deux formulations visaient les mêmes champs, les superposer aurait été
 * redondant et contraire à la sobriété demandée.
 */
export function MemberToolbar({ t, searchInput, onSearchChange, status, onStatusChange, role, onRoleChange, availableRoles, resultCount, hasActiveFilters, onReset }: {
  t: T;
  searchInput: string;
  onSearchChange: (value: string) => void;
  status: 'all' | Member['status'];
  onStatusChange: (value: 'all' | Member['status']) => void;
  role: 'all' | PositionRole;
  onRoleChange: (value: 'all' | PositionRole) => void;
  availableRoles: PositionRole[];
  resultCount: number;
  hasActiveFilters: boolean;
  onReset: () => void;
}) {
  return <div className="space-y-3">
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
        <Search size={16} />
        <input value={searchInput} onChange={(event) => onSearchChange(event.target.value)} placeholder={t('organization', 'searchMembersPlaceholder')} aria-label={t('organization', 'searchMembersPlaceholder')} className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={(event) => onStatusChange(event.target.value as 'all' | Member['status'])} aria-label={t('organization', 'status')} className="h-9 rounded-md border border-input bg-background px-3 text-xs">
          <option value="all">{t('organization', 'allStatuses')}</option>
          {MEMBER_STATUSES.map((value) => <option key={value} value={value}>{t('organization', value)}</option>)}
        </select>
        {availableRoles.length > 0 && <select value={role} onChange={(event) => onRoleChange(event.target.value as 'all' | PositionRole)} aria-label={t('organization', 'role')} className="h-9 rounded-md border border-input bg-background px-3 text-xs">
          <option value="all">{t('organization', 'allRoles')}</option>
          {availableRoles.map((value) => <option key={value} value={value}>{t('organization', value)}</option>)}
        </select>}
        {hasActiveFilters && <button type="button" onClick={onReset} className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><X size={14} />{t('organization', 'resetFilters')}</button>}
      </div>
    </div>
    <p className="text-xs text-muted-foreground">{t('organization', 'membersFound', { count: String(resultCount) })}</p>
  </div>;
}
