/**
 * Sous-module « Exercices fiscaux / Séances » (reconstruction complète —
 * remplace intégralement l'ancien mécanisme Meeting). UX délibérément calquée
 * sur le module Tontines (Cycle → Tours) : cette liste/fiche/section reprend
 * les mêmes patterns que `TontinesTableSection`/`TontineDetail`/
 * `OccurrenceSection` (`features/tontines/tontines-module.tsx` et
 * `tontine-tours-module.tsx`) — PageHeader, StatCard, DataTable, Back, badge
 * de statut, liste + formulaire d'ajout avec préremplissage, jamais une
 * précréation en masse.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, ChevronRight, Landmark, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, StatusBadge, EmptyState, StatCard, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, MemberAvatar } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage } from '@/routes';
import { settingsService } from '@/services/settings.service';
import { financeService } from '@/services/finance.service';
import { fiscalSessionService } from '@/services/fiscal-session.service';
import { organizationService } from '@/services/organization.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { fiscalYearLabel, type FiscalYear, type FiscalYearStatus } from '@/mocks/settings/fiscal-years';
import type { FiscalSession } from '@/mocks/settings/fiscal-sessions';
import type { Member } from '@/mocks/organization/members';
import { FiscalYearCreateDialog } from '@/features/settings/fiscal-year-create-dialog';
import { formatDate } from '@/lib/utils';
import type { TableColumn, StatusTone } from '@/types/ui';

type T = (section: 'finance' | 'settings' | 'nav', key: string, values?: Record<string, string>) => string;

const STATUS_KEY: Record<FiscalYearStatus, string> = { open: 'fiscalYearOpen', closed: 'fiscalYearClosedStatus', upcoming: 'fiscalYearUpcoming' };
const STATUS_TONE: Record<FiscalYearStatus, StatusTone> = { open: 'success', closed: 'default', upcoming: 'info' };

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="FINANCE" title={title} description={description} actions={actions} />{children}</div>;
}
function Back({ label, to }: { label: string; to: string }) {
  const navigate = useNavigate();
  return <Button variant="ghost" size="sm" onClick={() => navigate(to)}><ArrowLeft size={15} />{label}</Button>;
}

export function FiscalYearsList({ t }: { t: T }) {
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: years = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.settings.fiscalYears(currentTenant.id), queryFn: () => settingsService.listFiscalYears(currentTenant.id) });
  const { data: sessions = [] } = useQuery({ queryKey: queryKeys.finance.sessions.all(currentTenant.id), queryFn: () => fiscalSessionService.listAllSessions(currentTenant.id) });

  /** Regroupement CLIENT-SIDE, jamais une requête par ligne (même principe que `TontinesTableSection`). */
  const sessionsByYear = useMemo(() => {
    const map = new Map<string, FiscalSession[]>();
    for (const session of sessions) {
      const list = map.get(session.fiscalYearId) ?? [];
      list.push(session);
      map.set(session.fiscalYearId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sessionNumber - b.sessionNumber);
    return map;
  }, [sessions]);

  const columns: TableColumn<FiscalYear>[] = [
    { key: 'label', header: t('settings', 'fiscalYear'), render: (row) => <span className="font-semibold">{fiscalYearLabel(row)}</span> },
    { key: 'period', header: t('settings', 'startDate'), render: (row) => <span className="text-xs text-muted-foreground">{formatDate(row.startDate)} → {formatDate(row.endDate)}</span> },
    { key: 'status', header: t('settings', 'status'), render: (row) => <StatusBadge label={t('finance', STATUS_KEY[row.status])} tone={STATUS_TONE[row.status]} /> },
    { key: 'sessionsCount', header: t('finance', 'sessionsCountColumn'), render: (row) => String((sessionsByYear.get(row.id) ?? []).length) },
    { key: 'lastSession', header: t('finance', 'lastSessionColumn'), render: (row) => {
      const list = sessionsByYear.get(row.id) ?? [];
      return list.length > 0 ? formatDate(list[list.length - 1].date) : <span className="text-muted-foreground">—</span>;
    } },
    { key: 'actions', header: '', className: 'w-10', render: () => <ChevronRight size={16} className="text-muted-foreground" /> },
  ];

  if (isLoading) return <Page title={t('finance', 'fiscalYearsListTitle')} description={t('finance', 'fiscalYearsListDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'fiscalYearsListTitle')} description={t('finance', 'fiscalYearsListDescription')}><ErrorState onRetry={refetch} /></Page>;

  return <Page title={t('finance', 'fiscalYearsListTitle')} description={t('finance', 'fiscalYearsListDescription')} actions={<PermissionGate permission="fiscalYears.manage"><Button onClick={() => setCreateOpen(true)}><Plus size={16} />{t('settings', 'createFiscalYear')}</Button></PermissionGate>}>
    <DataTable
      columns={columns}
      rows={years}
      empty={<EmptyState icon={Landmark} title={t('finance', 'noFiscalYearsList')} />}
      onRowClick={(row) => navigate(`/finance/fiscal-years/${row.id}`)}
    />
    <FiscalYearCreateDialog open={createOpen} onOpenChange={setCreateOpen} tenantId={currentTenant.id} years={years} />
  </Page>;
}

/**
 * Section « Séances » d'un exercice — pendant direct de `OccurrenceSection`
 * (Tours de Tontine, `tontine-tours-module.tsx`) : liste des séances déjà
 * créées + formulaire d'ajout préreempli par `suggestNextSessionDate`.
 * L'ouverture du formulaire ne crée rien — seule la validation appelle
 * `createSession`.
 */
function SessionsSection({ t, fiscalYear }: { t: T; fiscalYear: FiscalYear }) {
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const { data: sessions = [] } = useQuery({ queryKey: queryKeys.finance.sessions.list(currentTenant.id, fiscalYear.id), queryFn: () => fiscalSessionService.listSessions(currentTenant.id, fiscalYear.id) });
  const { data: suggested } = useQuery({ queryKey: queryKeys.finance.sessions.next(currentTenant.id, fiscalYear.id), queryFn: () => fiscalSessionService.suggestNextSessionDate(currentTenant.id, fiscalYear.id) });
  const [date, setDate] = useState('');
  const effectiveDate = date || suggested || '';
  const canAdd = fiscalYear.status !== 'closed';
  const addMutation = useMockMutation<Awaited<ReturnType<typeof fiscalSessionService.createSession>>, void>({
    mutationFn: () => fiscalSessionService.createSession(currentTenant.id, fiscalYear.id, effectiveDate),
    invalidateKeys: [queryKeys.finance.sessions.list(currentTenant.id, fiscalYear.id), queryKeys.finance.sessions.next(currentTenant.id, fiscalYear.id), queryKeys.finance.sessions.all(currentTenant.id)],
    onSuccess: (result) => { if (!result) { notify.error(t('finance', 'sessionAddFailed')); return; } notify.success(t('finance', 'sessionAdded')); setDate(''); },
  });
  return <div className="space-y-3">
    <div className="space-y-2">
      {sessions.map((session) => (
        <button key={session.id} type="button" onClick={() => navigate(`/finance/fiscal-years/${fiscalYear.id}/sessions/${session.id}`)} className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted">
          <span className="font-mono text-xs text-muted-foreground">#{session.sessionNumber}</span>
          <span className="flex-1">{formatDate(session.date)}</span>
          <ChevronRight size={14} />
        </button>
      ))}
      {sessions.length === 0 && <p className="text-xs text-muted-foreground">{t('finance', 'noSessions')}</p>}
    </div>
    {canAdd
      ? <PermissionGate permission="fiscalYears.manage">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1"><Label htmlFor={`session-date-${fiscalYear.id}`}>{t('finance', 'sessionDateLabel')}</Label><Input id={`session-date-${fiscalYear.id}`} type="date" min={fiscalYear.startDate} max={fiscalYear.endDate} value={effectiveDate} onChange={(event) => setDate(event.target.value)} /></div>
            <Button size="sm" disabled={!effectiveDate || addMutation.isPending} onClick={() => addMutation.mutate()}><Plus size={14} />{t('finance', 'addSession')}</Button>
          </div>
        </PermissionGate>
      : null}
    {!suggested && sessions.length > 0 && canAdd && <p className="text-xs text-muted-foreground">{t('finance', 'noNextSession')}</p>}
  </div>;
}

export function FiscalYearDetail({ t }: { t: T }) {
  const { id = '' } = useParams();
  const { currentTenant } = useTenant();
  const { data: years, isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.settings.fiscalYears(currentTenant.id), queryFn: () => settingsService.listFiscalYears(currentTenant.id) });
  const fiscalYear = years?.find((year) => year.id === id);
  const { data: sessions = [] } = useQuery({ queryKey: queryKeys.finance.sessions.list(currentTenant.id, id), queryFn: () => fiscalSessionService.listSessions(currentTenant.id, id), enabled: Boolean(fiscalYear) });
  const { data: suggested } = useQuery({ queryKey: queryKeys.finance.sessions.next(currentTenant.id, id), queryFn: () => fiscalSessionService.suggestNextSessionDate(currentTenant.id, id), enabled: Boolean(fiscalYear) });

  if (isLoading) return <Page title={t('finance', 'fiscalYearDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'fiscalYearDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!fiscalYear) return <NotFoundPage />;

  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : undefined;

  return <Page title={fiscalYearLabel(fiscalYear)} description={`${formatDate(fiscalYear.startDate)} → ${formatDate(fiscalYear.endDate)}`} actions={<Back label={t('finance', 'backToFiscalYears')} to="/finance/fiscal-years" />}>
    <div className="flex items-center gap-2"><StatusBadge label={t('finance', STATUS_KEY[fiscalYear.status])} tone={STATUS_TONE[fiscalYear.status]} /></div>
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label={t('finance', 'sessionsLabel')} value={String(sessions.length)} icon={CalendarDays} tone="info" />
      <StatCard label={t('finance', 'lastSessionColumn')} value={lastSession ? formatDate(lastSession.date) : '—'} icon={CalendarDays} tone="neutral" />
      <StatCard label={t('finance', 'nextSessionLabel')} value={suggested ? formatDate(suggested) : '—'} detail={suggested ? t('finance', 'nextSessionProvisionalLabel') : undefined} icon={CalendarDays} tone="success" />
    </div>
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{t('finance', 'sessionsLabel')}</h3>
      <SessionsSection t={t} fiscalYear={fiscalYear} />
    </div>
  </Page>;
}

export function SessionDetail({ t }: { t: T }) {
  const { id = '', sessionId = '' } = useParams();
  const { currentTenant } = useTenant();
  const { data: session, isLoading, isError, refetch } = useQuery({ queryKey: ['finance', 'sessions', 'detail', sessionId], queryFn: () => fiscalSessionService.getSession(currentTenant.id, sessionId) });
  const { data: transactions = [] } = useQuery({ queryKey: queryKeys.finance.transactions(currentTenant.id), queryFn: () => financeService.listTransactions(currentTenant.id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const memberById = useMemo(() => new Map<string, Member>(members.map((member) => [member.id, member])), [members]);
  const sessionTransactions = transactions.filter((transaction) => transaction.sessionId === sessionId);

  if (isLoading) return <Page title={t('finance', 'sessionDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'sessionDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!session) return <NotFoundPage />;

  const columns: TableColumn<(typeof sessionTransactions)[number]>[] = [
    { key: 'date', header: t('finance', 'transactionDateColumn'), render: (row) => formatDate(row.recordedAt ?? row.date) },
    { key: 'member', header: t('finance', 'adherent'), render: (row) => row.memberId ? <span className="flex items-center gap-2 font-medium"><MemberAvatar member={memberById.get(row.memberId) ?? { firstName: row.memberId, lastName: '' }} /><span>{memberById.get(row.memberId) ? `${memberById.get(row.memberId)!.firstName} ${memberById.get(row.memberId)!.lastName}` : row.memberId}</span></span> : <span className="text-muted-foreground">—</span> },
    { key: 'amount', header: t('finance', 'amount'), render: (row) => `${row.amount}` },
  ];

  return <Page title={`${t('finance', 'sessionLabel')} #${session.sessionNumber}`} description={formatDate(session.date)} actions={<Back label={t('finance', 'backToFiscalYears')} to={`/finance/fiscal-years/${id}`} />}>
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{t('finance', 'sessionTransactionsTitle')}</h3>
      <DataTable columns={columns} rows={sessionTransactions} empty={<EmptyState icon={CalendarDays} title={t('finance', 'noSessionTransactions')} />} />
    </div>
  </Page>;
}
