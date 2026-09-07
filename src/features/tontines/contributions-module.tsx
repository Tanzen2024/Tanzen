/**
 * Table de cotisations réutilisable — l'écran indépendant « Contributions »
 * (liste/création/détail) a été supprimé du module Tontine (mandat
 * « suppression de l'écran Contribution ») : le panneau Opérations
 * (`tontine-operations-module.tsx`, non modifié ici) est désormais
 * l'interface principale de gestion des cotisations et appelle directement
 * `tontineTurnsService.createContribution`/`recordContributionPayment`.
 * `ContributionTable` reste ici et reste utilisé par les fiches Adhésion et
 * Occurrence (`adhesions-module.tsx`/`occurrences-module.tsx`) pour afficher
 * leurs cotisations liées en lecture seule — sans lien vers une fiche
 * Contribution, qui n'existe plus.
 */
import { ScrollText } from 'lucide-react';
import { DataTable, StatusBadge, EmptyState, MemberAvatar } from '@/components';
import type { Member } from '@/mocks/organization/members';
import type { TontineAdhesion, ContributionStatus } from '@/mocks/tontines/tontine-occurrences';
import type { TableColumn } from '@/types/ui';
import type { tontineTurnsService } from '@/services/tontine-turns.service';
import { formatValue } from './value-format';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const CONTRIBUTION_TONE: Record<ContributionStatus, 'default' | 'success' | 'warning'> = { PENDING: 'default', PARTIAL: 'warning', PAID: 'success', WAIVED: 'default' };
const CONTRIBUTION_LABEL_KEY: Record<ContributionStatus, string> = { PENDING: 'statusReceptionPending', PARTIAL: 'statusReceptionPartial', PAID: 'statusPaid', WAIVED: 'statusWaived' };

/**
 * Réutilisable par les fiches Adhésion et Occurrence pour afficher leurs contributions liées
 * (mandat §12) sans dupliquer la logique de colonnes. Purement informatif — aucune ligne ne
 * navigue plus vers une fiche Contribution (écran supprimé) ; `adhesions`/`members` optionnels
 * (mandat photos §7) : fournis par l'appelant quand plusieurs membres différents peuvent
 * apparaître dans la même table (ex. `OccurrenceDetail`, où chaque ligne est une adhésion
 * distincte) — affiche alors photo + nom au lieu du seul `adhesionId` brut. Omis par un appelant
 * dont la table ne concerne qu'un seul membre déjà visible ailleurs sur l'écran (ex.
 * `PeriodAdhesionDetail`), pour ne pas répéter une information redondante.
 */
export function ContributionTable({ t, rows, adhesions = [], members = [] }: { t: T; rows: Awaited<ReturnType<typeof tontineTurnsService.listContributionsByOccurrence>>; adhesions?: TontineAdhesion[]; members?: Member[] }) {
  const adhesionById = new Map(adhesions.map((item) => [item.id, item]));
  const memberById = new Map(members.map((item) => [item.id, item]));
  const columns: TableColumn<(typeof rows)[number]>[] = [
    { key: 'id', header: 'ID', render: (row) => <span className="font-mono text-xs">{row.id}</span> },
    ...(adhesions.length > 0 ? [{ key: 'member', header: t('tontines', 'adhesionMember'), render: (row: (typeof rows)[number]) => { const adhesion = adhesionById.get(row.adhesionId); const member = adhesion ? memberById.get(adhesion.memberId) : undefined; return <span className="flex items-center gap-2"><MemberAvatar member={member ?? { firstName: adhesion?.memberName ?? row.adhesionId, lastName: '' }} />{adhesion?.memberName ?? row.adhesionId}</span>; } }] : [{ key: 'adhesionId', header: t('tontines', 'adhesion'), render: (row: (typeof rows)[number]) => <span className="font-mono text-xs">{row.adhesionId}</span> }]),
    { key: 'valueType', header: t('tontines', 'valueType'), render: (row) => t('tontines', row.valueType === 'MONEY' ? 'valueTypeMoney' : 'valueTypeGoods') },
    { key: 'expected', header: t('tontines', 'expectedValue'), render: (row) => formatValue(row.valueType, row.expectedAmount, row.expectedQuantity, row.item, row.valueType === 'MONEY' ? row.currency : row.unit) },
    { key: 'paid', header: t('tontines', 'contributionAmount'), render: (row) => formatValue(row.valueType, row.paidAmount, row.paidQuantity, row.item, row.valueType === 'MONEY' ? row.currency : row.unit) },
    { key: 'paidAt', header: t('tontines', 'contributionDate'), render: (row) => row.paidAt ? new Date(row.paidAt).toLocaleDateString('fr-FR') : '—' },
    { key: 'status', header: t('tontines', 'contributionStatus'), render: (row) => <StatusBadge label={t('tontines', CONTRIBUTION_LABEL_KEY[row.status])} tone={CONTRIBUTION_TONE[row.status]} /> },
  ];
  return <DataTable columns={columns} rows={rows} empty={<EmptyState icon={ScrollText} title={t('tontines', 'noContributions')} />} />;
}
