import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Edit3, Eye, MoreVertical, Printer, Trash2, Users } from 'lucide-react';
import { StatusBadge, DateDisplay, EmptyState, PermissionGate, MemberAvatar } from '@/components';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Member } from '@/mocks/organization/members';
import { statusTone } from '../organization-module';
import { memberRole, type MemberSortKey, type SortDirection } from '../hooks/use-member-directory';

type T = (section: 'organization' | 'nav', key: string, values?: Record<string, string>) => string;

function SortableHeader({ label, sortKey, active, direction, onSort }: { label: string; sortKey: MemberSortKey; active: boolean; direction: SortDirection; onSort: (key: MemberSortKey) => void }) {
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 font-semibold hover:text-foreground">{label}<Icon size={12} className={active ? 'text-foreground' : 'text-muted-foreground/60'} /></button>;
}

/**
 * Table Membres spécifique (pas `components/data-table.tsx`, partagé par
 * Finance/Tontines/Access/Audit/Governance) : elle a besoin d'en-têtes
 * triables et d'un menu d'actions par ligne que le `DataTable` générique
 * n'offre pas — l'étendre aurait impacté tous les autres modules qui
 * l'utilisent tel quel.
 */
export function MemberTable({ t, rows, onView, onEdit, onPrint, onDelete, sortKey, sortDirection, onSort, emptyTitle, emptyDescription, emptyAction }: {
  t: T;
  rows: Member[];
  onView: (member: Member) => void;
  onEdit: (member: Member) => void;
  onPrint: (member: Member) => void;
  onDelete: (member: Member) => void;
  sortKey: MemberSortKey;
  sortDirection: SortDirection;
  onSort: (key: MemberSortKey) => void;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}) {
  return <div className="contain-layout overflow-hidden rounded-xl border border-border bg-card shadow-sm">
    <div className="overflow-x-auto">
      {/*
        `table-fixed` + largeurs de colonnes explicites (au lieu de `table-layout: auto`
        implicite) : sans cela, une cellule au contenu long (email, téléphone) fait
        recalculer au navigateur une largeur de table minimale supérieure à `width:100%`,
        rendue défilable par cet `overflow-x-auto` interne comme prévu.
        `contain-layout` sur le conteneur englobant (`overflow-hidden rounded-xl…`) est ce
        qui empêche réellement cette largeur de fuiter jusqu'à `document.documentElement` :
        vérifié que `overflow-x-auto`/`overflow-hidden` seuls (sans `contain: layout`)
        laissaient `document.documentElement.scrollWidth` s'élargir de la largeur du
        tableau — la page entière défilait alors horizontalement, pas seulement ce
        tableau (régression trouvée lors de l'audit Passe 3, absente des autres pages qui
        n'ont pas ce composant). `contain: layout` isole formellement la mise en page de ce
        sous-arbre de ses ancêtres (portée strictement locale à ce composant, sans toucher
        `AppShell`/layout partagé).
      */}
      <table className="w-full min-w-[1000px] table-fixed text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="w-[220px] px-4 py-3"><SortableHeader label={t('organization', 'member')} sortKey="lastName" active={sortKey === 'lastName'} direction={sortDirection} onSort={onSort} /></th>
            <th scope="col" className="w-[100px] px-4 py-3 font-semibold">{t('organization', 'matricule')}</th>
            <th scope="col" className="w-[140px] px-4 py-3 font-semibold">{t('organization', 'role')}</th>
            <th scope="col" className="w-[220px] px-4 py-3 font-semibold">{t('organization', 'email')}</th>
            <th scope="col" className="w-[140px] px-4 py-3 font-semibold">{t('organization', 'phone')}</th>
            <th scope="col" className="w-[110px] px-4 py-3"><SortableHeader label={t('organization', 'status')} sortKey="status" active={sortKey === 'status'} direction={sortDirection} onSort={onSort} /></th>
            <th scope="col" className="w-[110px] px-4 py-3"><SortableHeader label={t('organization', 'joined')} sortKey="joinedAt" active={sortKey === 'joinedAt'} direction={sortDirection} onSort={onSort} /></th>
            <th scope="col" className="w-12 px-4 py-3"><span className="sr-only">{t('organization', 'actions')}</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((member) => {
            const fullName = `${member.firstName} ${member.lastName}`;
            return <tr key={member.id} className="transition-colors hover:bg-muted/30">
              <td className="px-4 py-3"><button type="button" onClick={() => onView(member)} className="flex min-w-0 items-center gap-3 text-left"><MemberAvatar member={member} /><span className="min-w-0"><span className="block truncate font-semibold text-foreground">{member.lastName}</span><span className="block truncate text-xs text-muted-foreground">{member.firstName}</span></span></button></td>
              <td className="truncate px-4 py-3 font-mono text-xs text-muted-foreground">{member.matricule || member.id}</td>
              <td className="truncate px-4 py-3 text-foreground">{t('organization', memberRole(member))}</td>
              <td className="truncate px-4 py-3 text-foreground">{member.email || '—'}</td>
              <td className="truncate px-4 py-3 text-foreground">{member.phone || '—'}</td>
              <td className="px-4 py-3"><StatusBadge label={t('organization', member.status)} tone={statusTone[member.status]} /></td>
              <td className="px-4 py-3 text-foreground"><DateDisplay value={member.joinedAt} /></td>
              <td className="px-4 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" aria-label={`${t('organization', 'actions')} — ${fullName}`} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><MoreVertical size={16} /></button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onView(member)}><Eye size={14} className="mr-2" />{t('organization', 'viewDetail')}</DropdownMenuItem>
                    <PermissionGate permission="members.update"><DropdownMenuItem onSelect={() => onEdit(member)}><Edit3 size={14} className="mr-2" />{t('organization', 'editMember')}</DropdownMenuItem></PermissionGate>
                    <DropdownMenuItem onSelect={() => onPrint(member)}><Printer size={14} className="mr-2" />{t('organization', 'print')}</DropdownMenuItem>
                    <PermissionGate permission="members.delete"><DropdownMenuItem onSelect={() => onDelete(member)} className="text-destructive focus:text-destructive"><Trash2 size={14} className="mr-2" />{t('organization', 'deleteMember')}</DropdownMenuItem></PermissionGate>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    {rows.length === 0 && <EmptyState icon={Users} title={emptyTitle} description={emptyDescription} action={emptyAction} />}
  </div>;
}
