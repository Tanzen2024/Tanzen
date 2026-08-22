/**
 * Vue d'ensemble du module Tontines (mandat UX Enterprise) — Vue d'ensemble / Tontines /
 * Cotisations / Membres / Opérations. Les 3 derniers onglets sont des vues agrégées
 * *toutes tontines confondues* du tenant courant, construites uniquement à partir des
 * entités déjà validées (`TontineAdhesion`, `TontineContribution`, `TontineOccurrence`,
 * `TontineTurn`) via les lectures ajoutées à `tontineTurnsService` (`listAllAdhesions` etc.)
 * — aucune nouvelle entité, aucune règle métier inventée. Chaque ligne reste un lien direct
 * vers l'écran détail existant (tontine-scopé), jamais une réimplémentation.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CalendarDays, ChevronRight, ClipboardList, ScrollText, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, StatCard, DateDisplay, TableSkeleton, ErrorState, MemberAvatar } from '@/components';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { tontinesService } from '@/services/tontines.service';
import { tontineTurnsService } from '@/services/tontine-turns.service';
import { organizationService } from '@/services/organization.service';
import { queryKeys } from '@/services/query-keys';
import type { Member } from '@/mocks/organization/members';
import type { ContributionStatus } from '@/mocks/tontines/tontine-occurrences';
import type { TableColumn } from '@/types/ui';
import { formatFCFA, formatNumber } from '@/lib/utils';
import { formatValue } from './value-format';
import { TontinesTableSection } from './tontines-module';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const ADHESION_TONE: Record<'active' | 'exited', 'success' | 'default'> = { active: 'success', exited: 'default' };
const ADHESION_LABEL_KEY: Record<'active' | 'exited', string> = { active: 'statusActive', exited: 'statusExited' };
const CONTRIBUTION_TONE: Record<ContributionStatus, 'default' | 'success' | 'warning'> = { PENDING: 'default', PARTIAL: 'warning', PAID: 'success', WAIVED: 'default' };
const CONTRIBUTION_LABEL_KEY: Record<ContributionStatus, string> = { PENDING: 'statusReceptionPending', PARTIAL: 'statusReceptionPartial', PAID: 'statusPaid', WAIVED: 'statusWaived' };

function useOverviewData(tenantId: string) {
  const tontinesQ = useQuery({ queryKey: queryKeys.tontines.list(tenantId), queryFn: () => tontinesService.listTontines(tenantId) });
  const periodsQ = useQuery({ queryKey: queryKeys.tontines.allPeriods(tenantId), queryFn: () => tontineTurnsService.listAllPeriods(tenantId) });
  const adhesionsQ = useQuery({ queryKey: queryKeys.tontines.allAdhesions(tenantId), queryFn: () => tontineTurnsService.listAllAdhesions(tenantId) });
  const contributionsQ = useQuery({ queryKey: queryKeys.tontines.allContributions(tenantId), queryFn: () => tontineTurnsService.listAllContributions(tenantId) });
  const occurrencesQ = useQuery({ queryKey: queryKeys.tontines.allOccurrences(tenantId), queryFn: () => tontineTurnsService.listAllOccurrences(tenantId) });
  const turnsQ = useQuery({ queryKey: queryKeys.tontines.allTurns(tenantId), queryFn: () => tontineTurnsService.listAllTurns(tenantId) });
  const beneficiariesQ = useQuery({ queryKey: queryKeys.tontines.allBeneficiaries(tenantId), queryFn: () => tontineTurnsService.listAllBeneficiaries(tenantId) });
  const membersQ = useQuery({ queryKey: queryKeys.members.list(tenantId), queryFn: () => organizationService.listMembers(tenantId) });

  const tontines = tontinesQ.data ?? []; const periods = periodsQ.data ?? []; const adhesions = adhesionsQ.data ?? [];
  const contributions = contributionsQ.data ?? []; const occurrences = occurrencesQ.data ?? []; const turns = turnsQ.data ?? [];
  const beneficiaries = beneficiariesQ.data ?? []; const members = membersQ.data ?? [];

  /** Dépend de `.data` (référence stable entre rendus tant que React Query ne refetch pas), pas des variables locales `?? []` ci-dessus qui, elles, changent de référence à chaque rendu. */
  const tontineById = useMemo(() => new Map((tontinesQ.data ?? []).map((item) => [item.id, item])), [tontinesQ.data]);
  const periodById = useMemo(() => new Map((periodsQ.data ?? []).map((item) => [item.id, item])), [periodsQ.data]);
  const memberById = useMemo(() => new Map<string, Member>((membersQ.data ?? []).map((item) => [item.id, item])), [membersQ.data]);
  const adhesionById = useMemo(() => new Map((adhesionsQ.data ?? []).map((item) => [item.id, item])), [adhesionsQ.data]);
  const occurrenceById = useMemo(() => new Map((occurrencesQ.data ?? []).map((item) => [item.id, item])), [occurrencesQ.data]);
  const turnByOccurrenceId = useMemo(() => new Map((turnsQ.data ?? []).map((item) => [item.tontineOccurrenceId, item])), [turnsQ.data]);
  /** Noms + photo résolus via Turn→TurnBeneficiary→Adhesion→Member (jamais un accès direct Member depuis Turn) pour le résumé « [Photo] Jean Dupont + 2 » de `AggregatedOperationsTab` (mandat §9, photos dans les vues agrégées). */
  const beneficiaryNamesByTurnId = useMemo(() => {
    const map = new Map<string, { name: string; photoUrl?: string }[]>();
    for (const item of (beneficiariesQ.data ?? [])) {
      const adhesion = adhesionById.get(item.adhesionId);
      const name = adhesion?.memberName ?? item.adhesionId;
      const photoUrl = adhesion ? memberById.get(adhesion.memberId)?.photoUrl : undefined;
      map.set(item.tontineTurnId, [...(map.get(item.tontineTurnId) ?? []), { name, photoUrl }]);
    }
    return map;
  }, [beneficiariesQ.data, adhesionById, memberById]);

  const tontineNameForPeriod = (periodId: string) => tontineById.get(periodById.get(periodId)?.tontineId ?? '')?.name ?? '—';
  const tontineIdForPeriod = (periodId: string) => periodById.get(periodId)?.tontineId ?? '';

  const isLoading = tontinesQ.isLoading || periodsQ.isLoading || adhesionsQ.isLoading || contributionsQ.isLoading || occurrencesQ.isLoading || turnsQ.isLoading || beneficiariesQ.isLoading || membersQ.isLoading;
  const isError = tontinesQ.isError || periodsQ.isError || adhesionsQ.isError || contributionsQ.isError || occurrencesQ.isError || turnsQ.isError || beneficiariesQ.isError || membersQ.isError;
  const refetchAll = () => { tontinesQ.refetch(); periodsQ.refetch(); adhesionsQ.refetch(); contributionsQ.refetch(); occurrencesQ.refetch(); turnsQ.refetch(); beneficiariesQ.refetch(); membersQ.refetch(); };

  return { tontines, periods, adhesions, contributions, occurrences, turns, beneficiaries, members, tontineById, periodById, memberById, adhesionById, occurrenceById, turnByOccurrenceId, beneficiaryNamesByTurnId, tontineNameForPeriod, tontineIdForPeriod, isLoading, isError, refetchAll };
}

function OverviewTab({ t, data }: { t: T; data: ReturnType<typeof useOverviewData> }) {
  const navigate = useNavigate();
  const activeTontines = data.tontines.filter((item) => item.status === 'statusActive').length;
  const activeMemberIds = new Set(data.adhesions.filter((item) => item.status === 'active').map((item) => item.memberId));
  const moneyContributions = data.contributions.filter((item) => item.valueType === 'MONEY');
  const expectedTotal = moneyContributions.reduce((sum, item) => sum + (item.expectedAmount ?? 0), 0);
  const collectedTotal = moneyContributions.reduce((sum, item) => sum + item.paidAmount, 0);
  const openOperations = data.occurrences.filter((item) => item.status === 'OPEN');
  const upcoming = [...openOperations].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)).slice(0, 5);
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard label={t('tontines', 'kpiActiveTontines')} value={formatNumber(activeTontines)} icon={UsersRound} tone="info" />
      <StatCard label={t('tontines', 'kpiActiveMembers')} value={formatNumber(activeMemberIds.size)} icon={UsersRound} tone="neutral" />
      <StatCard label={t('tontines', 'kpiExpectedTotal')} value={formatFCFA(expectedTotal, 'fr', true)} icon={ClipboardList} tone="neutral" />
      <StatCard label={t('tontines', 'kpiCollectedTotal')} value={formatFCFA(collectedTotal, 'fr', true)} icon={Banknote} tone="success" />
      <StatCard label={t('tontines', 'kpiOpenOperations')} value={formatNumber(openOperations.length)} icon={CalendarDays} tone="warning" />
    </div>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'upcomingOperations')}</CardTitle></CardHeader><CardContent className="space-y-2">
      {upcoming.map((occurrence) => { const tontineId = data.tontineIdForPeriod(occurrence.periodId); return <button type="button" key={occurrence.id} onClick={() => navigate(`/tontines/${tontineId}/periods/${occurrence.periodId}/occurrences/${occurrence.id}`)} className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays size={17} /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{data.tontineNameForPeriod(occurrence.periodId)} · {t('tontines', 'occurrenceNumber')}{occurrence.occurrenceNumber}</p><p className="text-xs text-muted-foreground"><DateDisplay value={occurrence.plannedDate} /></p></div>
        <ChevronRight size={16} className="text-muted-foreground" />
      </button>; })}
      {upcoming.length === 0 && <EmptyState icon={CalendarDays} title={t('tontines', 'noUpcomingOperations')} />}
    </CardContent></Card>
  </div>;
}

function AggregatedMembersTab({ t, data }: { t: T; data: ReturnType<typeof useOverviewData> }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState(''); const [tontineFilter, setTontineFilter] = useState('all'); const [status, setStatus] = useState('all');
  const query = search.trim().toLowerCase();
  const rows = data.adhesions.filter((item) => {
    const tontineId = data.tontineIdForPeriod(item.periodId);
    if (query && !`${item.memberName} ${data.tontineNameForPeriod(item.periodId)}`.toLowerCase().includes(query)) return false;
    if (tontineFilter !== 'all' && tontineId !== tontineFilter) return false;
    if (status !== 'all' && item.status !== status) return false;
    return true;
  });
  const columns: TableColumn<(typeof rows)[number]>[] = [
    { key: 'member', header: t('tontines', 'adhesionMember'), render: (row) => { const member = data.memberById.get(row.memberId); return <button type="button" onClick={() => navigate(`/tontines/${data.tontineIdForPeriod(row.periodId)}/periods/${row.periodId}/adhesions/${row.id}`)} className="flex items-center gap-3 text-left"><MemberAvatar member={member ?? { firstName: row.memberName, lastName: '' }} /><span className="font-medium">{row.memberName}</span></button>; } },
    { key: 'tontine', header: t('tontines', 'tontine'), render: (row) => data.tontineNameForPeriod(row.periodId) },
    { key: 'joinedAt', header: t('tontines', 'joinedAt'), render: (row) => <DateDisplay value={row.joinedAt} /> },
    { key: 'status', header: t('tontines', 'adhesionStatus'), render: (row) => <StatusBadge label={t('tontines', ADHESION_LABEL_KEY[row.status])} tone={ADHESION_TONE[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${data.tontineIdForPeriod(row.periodId)}/periods/${row.periodId}/adhesions/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <div className="space-y-4">
    <FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'searchMembersOrTontines')} filters={<>
      <select value={tontineFilter} onChange={(event) => setTontineFilter(event.target.value)} aria-label={t('tontines', 'tontine')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'allTontines')}</option>{data.tontines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('tontines', 'adhesionStatus')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'allStatuses')}</option><option value="active">{t('tontines', 'statusActive')}</option><option value="exited">{t('tontines', 'statusExited')}</option></select>
    </>} />
    <DataTable columns={columns} rows={rows} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noAdhesions')} />} />
  </div>;
}

function AggregatedContributionsTab({ t, data }: { t: T; data: ReturnType<typeof useOverviewData> }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState(''); const [tontineFilter, setTontineFilter] = useState('all'); const [status, setStatus] = useState('all');
  const memberNameOf = (adhesionId: string) => data.adhesionById.get(adhesionId)?.memberName ?? adhesionId;
  const tontineIdOf = (adhesionId: string) => { const adhesion = data.adhesionById.get(adhesionId); return adhesion ? data.tontineIdForPeriod(adhesion.periodId) : ''; };
  const tontineNameOf = (adhesionId: string) => { const adhesion = data.adhesionById.get(adhesionId); return adhesion ? data.tontineNameForPeriod(adhesion.periodId) : '—'; };
  const query = search.trim().toLowerCase();
  const rows = data.contributions.filter((item) => {
    if (query && !`${memberNameOf(item.adhesionId)} ${tontineNameOf(item.adhesionId)}`.toLowerCase().includes(query)) return false;
    if (tontineFilter !== 'all' && tontineIdOf(item.adhesionId) !== tontineFilter) return false;
    if (status !== 'all' && item.status !== status) return false;
    return true;
  });
  const moneyRows = rows.filter((item) => item.valueType === 'MONEY');
  const totalExpected = moneyRows.reduce((sum, item) => sum + (item.expectedAmount ?? 0), 0);
  const totalPaid = moneyRows.reduce((sum, item) => sum + item.paidAmount, 0);
  const columns: TableColumn<(typeof rows)[number]>[] = [
    { key: 'member', header: t('tontines', 'adhesionMember'), render: (row) => { const adhesion = data.adhesionById.get(row.adhesionId); const member = adhesion ? data.memberById.get(adhesion.memberId) : undefined; return <span className="flex items-center gap-3"><MemberAvatar member={member ?? { firstName: memberNameOf(row.adhesionId), lastName: '' }} />{memberNameOf(row.adhesionId)}</span>; } },
    { key: 'tontine', header: t('tontines', 'tontine'), render: (row) => tontineNameOf(row.adhesionId) },
    { key: 'occurrence', header: t('tontines', 'occurrenceNumber'), render: (row) => { const occurrence = data.occurrenceById.get(row.tontineOccurrenceId); return occurrence ? `#${occurrence.occurrenceNumber}` : '—'; } },
    { key: 'expected', header: t('tontines', 'expectedValue'), render: (row) => formatValue(row.valueType, row.expectedAmount, row.expectedQuantity, row.item, row.valueType === 'MONEY' ? row.currency : row.unit) },
    { key: 'paid', header: t('tontines', 'contributionAmount'), render: (row) => formatValue(row.valueType, row.paidAmount, row.paidQuantity, row.item, row.valueType === 'MONEY' ? row.currency : row.unit) },
    { key: 'status', header: t('tontines', 'contributionStatus'), render: (row) => <StatusBadge label={t('tontines', CONTRIBUTION_LABEL_KEY[row.status])} tone={CONTRIBUTION_TONE[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineIdOf(row.adhesionId)}/contributions/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <div className="space-y-4">
    <FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'searchContributionsPlaceholder')} filters={<>
      <select value={tontineFilter} onChange={(event) => setTontineFilter(event.target.value)} aria-label={t('tontines', 'tontine')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'allTontines')}</option>{data.tontines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('tontines', 'contributionStatus')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'allStatuses')}</option><option value="PENDING">{t('tontines', 'statusReceptionPending')}</option><option value="PARTIAL">{t('tontines', 'statusReceptionPartial')}</option><option value="PAID">{t('tontines', 'statusPaid')}</option><option value="WAIVED">{t('tontines', 'statusWaived')}</option></select>
    </>} />
    <DataTable columns={columns} rows={rows} empty={<EmptyState icon={ScrollText} title={t('tontines', 'noContributions')} />} />
    {rows.length > 0 && <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><span className="font-semibold">{t('tontines', 'contributionsTotalRow')}</span><span className="flex gap-6"><span>{t('tontines', 'expectedValue')} : <strong>{formatFCFA(totalExpected)}</strong></span><span>{t('tontines', 'contributionAmount')} : <strong>{formatFCFA(totalPaid)}</strong></span></span></CardContent></Card>}
  </div>;
}

function AggregatedOperationsTab({ t, data }: { t: T; data: ReturnType<typeof useOverviewData> }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState(''); const [tontineFilter, setTontineFilter] = useState('all'); const [status, setStatus] = useState('all');
  const query = search.trim().toLowerCase();
  const rows = data.occurrences.filter((item) => {
    const tontineId = data.tontineIdForPeriod(item.periodId);
    if (query && !`${data.tontineNameForPeriod(item.periodId)} ${item.occurrenceNumber}`.toLowerCase().includes(query)) return false;
    if (tontineFilter !== 'all' && tontineId !== tontineFilter) return false;
    if (status !== 'all' && item.status !== status) return false;
    return true;
  });
  const columns: TableColumn<(typeof rows)[number]>[] = [
    { key: 'tontine', header: t('tontines', 'tontine'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${data.tontineIdForPeriod(row.periodId)}/periods/${row.periodId}/occurrences/${row.id}`)} className="text-left font-medium text-primary hover:underline">{data.tontineNameForPeriod(row.periodId)}</button> },
    { key: 'number', header: t('tontines', 'occurrenceNumber'), render: (row) => `#${row.occurrenceNumber}` },
    { key: 'plannedDate', header: t('tontines', 'plannedDate'), render: (row) => <DateDisplay value={row.plannedDate} /> },
    { key: 'status', header: t('tontines', 'occurrenceStatus'), render: (row) => <StatusBadge label={t('tontines', row.status === 'OPEN' ? 'statusOpenTurn' : 'statusClosedTurn')} tone={row.status === 'OPEN' ? 'success' : 'default'} /> },
    { key: 'turnStatus', header: t('tontines', 'turnStatus'), render: (row) => { const turn = data.turnByOccurrenceId.get(row.id); return turn ? <StatusBadge label={t('tontines', turn.status === 'OPEN' ? 'statusOpenTurn' : 'statusClosedTurn')} tone={turn.status === 'OPEN' ? 'success' : 'default'} /> : '—'; } },
    { key: 'beneficiaries', header: t('tontines', 'beneficiariesCount'), render: (row) => {
      const turn = data.turnByOccurrenceId.get(row.id);
      const beneficiaries = turn ? (data.beneficiaryNamesByTurnId.get(turn.id) ?? []) : [];
      if (beneficiaries.length === 0) return <span className="text-muted-foreground">—</span>;
      const [first, ...rest] = beneficiaries;
      return <span className="flex items-center gap-2"><MemberAvatar member={{ firstName: first.name, lastName: '', photoUrl: first.photoUrl }} />{first.name}{rest.length > 0 && <span className="text-muted-foreground"> {t('tontines', 'beneficiaryCountSuffix', { count: String(rest.length) })}</span>}</span>;
    } },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${data.tontineIdForPeriod(row.periodId)}/periods/${row.periodId}/occurrences/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <div className="space-y-4">
    <FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'searchOperationsPlaceholder')} filters={<>
      <select value={tontineFilter} onChange={(event) => setTontineFilter(event.target.value)} aria-label={t('tontines', 'tontine')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'allTontines')}</option>{data.tontines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('tontines', 'occurrenceStatus')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'allStatuses')}</option><option value="OPEN">{t('tontines', 'statusOpenTurn')}</option><option value="CLOSED">{t('tontines', 'statusClosedTurn')}</option></select>
    </>} />
    <DataTable columns={columns} rows={rows} empty={<EmptyState icon={CalendarDays} title={t('tontines', 'noOccurrences')} />} />
  </div>;
}

export function TontinesOverview({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  const [tab, setTab] = useState('overview');
  const data = useOverviewData(currentTenant.id);

  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7">
    <PageHeader eyebrow="TONTINES" title={t('tontines', 'tontinesTitle')} description={t('tontines', 'tontinesOverviewSubtitle')} />
    <Tabs value={tab} onValueChange={setTab} className="min-w-0">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">
        <TabsTrigger value="overview">{t('tontines', 'overview')}</TabsTrigger>
        <TabsTrigger value="tontines">{t('tontines', 'tontines')}</TabsTrigger>
        <TabsTrigger value="contributions">{t('tontines', 'contributions')}</TabsTrigger>
        <TabsTrigger value="members">{t('tontines', 'members')}</TabsTrigger>
        <TabsTrigger value="operations">{t('tontines', 'operationsTab')}</TabsTrigger>
      </TabsList>
      {data.isLoading ? <TableSkeleton /> : data.isError ? <ErrorState onRetry={data.refetchAll} /> : <>
        <TabsContent value="overview"><OverviewTab t={t} data={data} /></TabsContent>
        <TabsContent value="tontines"><TontinesTableSection t={t} /></TabsContent>
        <TabsContent value="contributions"><AggregatedContributionsTab t={t} data={data} /></TabsContent>
        <TabsContent value="members"><AggregatedMembersTab t={t} data={data} /></TabsContent>
        <TabsContent value="operations"><AggregatedOperationsTab t={t} data={data} /></TabsContent>
      </>}
    </Tabs>
  </div>;
}
