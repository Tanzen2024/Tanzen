import { useState, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Banknote, CalendarDays, Check, ChevronRight, CirclePause, CirclePlay, CircleStop, ClipboardList, Clock3, Landmark, Plus, RotateCcw, ShieldCheck, TicketCheck, TrendingUp, UserRound, UsersRound } from 'lucide-react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, FormSection, Timeline, StatCard, MoneyDisplay, DateDisplay, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, ConfirmDialog, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { NotFoundPage } from '@/routes';
import { tontinesService, type TontineInput, type CycleInput, type CycleMemberInput, type DrawInput, type WinnerInput } from '@/services/tontines.service';
import { organizationService } from '@/services/organization.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { Tontine } from '@/mocks/tontines/tontines';
import type { TontineCycle, TontineCycleStatus, CycleMember, CycleContribution, CycleDraw } from '@/mocks/tontines/tontine-cycles';
import type { TableColumn } from '@/types/ui';
import { formatFCFA, formatNumber } from '@/lib/utils';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const STATUS_TONE: Record<TontineCycleStatus | 'statusActive' | 'statusInactive' | 'statusCompleted' | 'statusPending' | 'statusScheduled' | 'settlementPending' | 'settlementProcessing' | 'settlementCompleted' | 'settlementFailed', 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  statusDraft: 'default', statusOpen: 'success', statusSuspended: 'warning', statusClosed: 'default', statusActive: 'success', statusInactive: 'default', statusCompleted: 'success', statusPending: 'warning', statusScheduled: 'info', settlementPending: 'warning', settlementProcessing: 'info', settlementCompleted: 'success', settlementFailed: 'error',
};

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label }: { label: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={15} />{label}</Button>; }
function Avatar({ name }: { name: string }) { const initials = name.split(' ').map((word) => word[0]).join('').slice(0, 2); return <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">{initials}</span>; }
function Metric({ label, value, icon: Icon, tone = 'info' }: { label: string; value: string; icon: typeof Landmark; tone?: 'info' | 'success' | 'warning' | 'neutral' }) { return <StatCard label={label} value={value} icon={Icon} tone={tone} />; }
function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Landmark }) { return <div className="flex gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }

function TontinesList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all');
  const { data: tontines = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.tontines.list(currentTenant.id), queryFn: () => tontinesService.listTontines(currentTenant.id) });
  const rows = tontines.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || item.status === status));
  if (isLoading) return <Page title={t('tontines', 'tontinesTitle')} description={t('tontines', 'tontinesDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'tontinesTitle')} description={t('tontines', 'tontinesDescription')}><ErrorState onRetry={refetch} /></Page>;
  const columns: TableColumn<Tontine>[] = [
    { key: 'name', header: t('tontines', 'tontineName'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${row.id}`)} className="flex items-center gap-3 text-left"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UsersRound size={17} /></span><span><span className="block font-semibold">{row.name}</span><span className="block font-mono text-xs text-muted-foreground">{row.id}</span></span></button> },
    { key: 'type', header: t('tontines', 'tontineType'), render: (row) => row.type },
    { key: 'memberCount', header: t('tontines', 'memberCount'), render: (row) => formatNumber(row.memberCount) },
    { key: 'activeCycles', header: t('tontines', 'activeCycles'), render: (row) => formatNumber(row.activeCycles) },
    { key: 'totalContributions', header: t('tontines', 'totalContributions'), render: (row) => <MoneyDisplay amount={row.totalContributions} /> },
    { key: 'status', header: t('tontines', 'tontineStatus'), render: (row) => <StatusBadge label={t('tontines', row.status)} tone={STATUS_TONE[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <Page title={t('tontines', 'tontinesTitle')} description={t('tontines', 'tontinesDescription')} actions={<PermissionGate permission="tontines.create"><Button onClick={() => navigate('/tontines/create')}><Plus size={16} />{t('tontines', 'createTontine')}</Button></PermissionGate>}><div className="grid gap-4 sm:grid-cols-3"><Metric label={t('tontines', 'tontines')} value={formatNumber(tontines.length)} icon={UsersRound} /><Metric label={t('tontines', 'activeCycles')} value={formatNumber(tontines.reduce((sum, item) => sum + item.activeCycles, 0))} icon={CalendarDays} tone="success" /><Metric label={t('tontines', 'totalContributions')} value={formatFCFA(tontines.reduce((sum, item) => sum + item.totalContributions, 0), 'fr', true)} icon={Banknote} tone="warning" /></div><FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'tontineName')} filters={<select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('tontines', 'tontineStatus')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'tontineStatus')}</option><option value="statusActive">{t('tontines', 'statusActive')}</option><option value="statusInactive">{t('tontines', 'statusInactive')}</option></select>} /><DataTable columns={columns} rows={rows} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noTontines')} />} /></Page>;
}

function TontineCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const { data: tenants = [] } = useQuery({ queryKey: queryKeys.tenants.list(currentTenant.id, user.scope), queryFn: () => organizationService.listTenants(currentTenant.id, user.scope) });
  const [name, setName] = useState(''); const [type, setType] = useState<Tontine['type']>('tontine'); const [tenantId, setTenantId] = useState(currentTenant.id);
  const [error, setError] = useState<string | undefined>();
  const mutation = useMockMutation<Tontine, TontineInput>({
    mutationFn: (input) => tontinesService.createTontine(input),
    invalidateKeys: [queryKeys.tontines.list(currentTenant.id)],
    onSuccess: (tontine) => { notify.success(t('tontines', 'tontineCreated')); navigate(`/tontines/${tontine.id}`); },
  });
  const handleSave = () => {
    if (!name.trim()) { setError(t('tontines', 'fieldRequired')); return; }
    setError(undefined);
    mutation.mutate({ name, type, tenantId });
  };
  return <Page title={t('tontines', 'createTontine')} description={t('tontines', 'tontinesDescription')} actions={<Back label={t('tontines', 'backToTontines')} />}><div className="grid gap-5 lg:grid-cols-2"><FormSection title={t('tontines', 'general')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="tontine-name">{t('tontines', 'tontineName')}</Label><Input id="tontine-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(error)} /><FieldError message={error} /></div><div className="space-y-2"><Label htmlFor="tontine-type">{t('tontines', 'tontineType')}</Label><select id="tontine-type" value={type} onChange={(event) => setType(event.target.value as Tontine['type'])} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="tontine">tontine</option><option value="cooperative">cooperative</option><option value="association">association</option><option value="mutuelle">mutuelle</option></select></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="tontine-tenant">{t('tontines', 'tenant')}</Label><select id="tontine-tenant" value={tenantId} onChange={(event) => setTenantId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.id} — {tenant.name}</option>)}</select></div></div></FormSection><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/tontines')}>{t('tontines', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('tontines', 'saving') : t('tontines', 'save')}</Button></div></div></Page>;
}

function TontineDetail({ t }: { t: T }) {
  const { tontineId = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: tontine, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.tontines.detail(tontineId), currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const { data: cycles = [] } = useQuery({ queryKey: queryKeys.tontines.cycles(tontineId), queryFn: () => tontinesService.listCyclesByTontine(currentTenant.id, tontineId), enabled: Boolean(tontine) });
  if (isLoading) return <Page title={t('tontines', 'tontineDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'tontineDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!tontine) return <NotFoundPage />;
  const columns: TableColumn<TontineCycle>[] = [
    { key: 'cycleNumber', header: t('tontines', 'cycleNumber'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontine.id}/cycles/${row.id}`)} className="font-semibold text-primary">#{row.cycleNumber}</button> },
    { key: 'startDate', header: t('tontines', 'startDate'), render: (row) => <DateDisplay value={row.startDate} /> },
    { key: 'endDate', header: t('tontines', 'endDate'), render: (row) => <DateDisplay value={row.endDate} /> },
    { key: 'status', header: t('tontines', 'cycleStatus'), render: (row) => <StatusBadge label={t('tontines', row.status)} tone={STATUS_TONE[row.status]} /> },
    { key: 'totalCollected', header: t('tontines', 'totalCollected'), render: (row) => <MoneyDisplay amount={row.totalCollected} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontine.id}/cycles/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <Page title={tontine.name} description={`${tontine.id} · ${tontine.tenantId}`} actions={<><Back label={t('tontines', 'backToTontines')} /><PermissionGate permission="cycles.create"><Button onClick={() => navigate(`/tontines/${tontine.id}/cycles/create`)}><Plus size={16} />{t('tontines', 'createCycle')}</Button></PermissionGate></>}><div className="grid gap-4 sm:grid-cols-4"><Metric label={t('tontines', 'memberCount')} value={formatNumber(tontine.memberCount)} icon={UsersRound} /><Metric label={t('tontines', 'activeCycles')} value={formatNumber(tontine.activeCycles)} icon={CalendarDays} tone="success" /><Metric label={t('tontines', 'totalContributions')} value={formatFCFA(tontine.totalContributions, 'fr', true)} icon={Banknote} tone="warning" /><Metric label={t('tontines', 'tontineStatus')} value={t('tontines', tontine.status)} icon={ShieldCheck} tone="neutral" /></div><Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">{t('tontines', 'cycles')}</CardTitle><Button variant="outline" size="sm" onClick={() => navigate(`/tontines/${tontine.id}/cycles`)}>{t('tontines', 'viewDetail')}<ChevronRight size={14} /></Button></CardHeader><CardContent className="p-0"><DataTable columns={columns} rows={cycles} empty={<EmptyState icon={CalendarDays} title={t('tontines', 'noCycles')} />} /></CardContent></Card></Page>;
}

function CycleCreate({ t }: { t: T }) {
  const { tontineId = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: tontine, isLoading: isTontineLoading, isError: isTontineError, refetch: refetchTontine } = useQuery({ queryKey: [...queryKeys.tontines.detail(tontineId), currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const { data: cycles = [] } = useQuery({ queryKey: queryKeys.tontines.cycles(tontineId), queryFn: () => tontinesService.listCyclesByTontine(currentTenant.id, tontineId), enabled: Boolean(tontine) });
  const [cycleNumber, setCycleNumber] = useState(1); const [startDate, setStartDate] = useState(''); const [endDate, setEndDate] = useState(''); const [expectedTotal, setExpectedTotal] = useState('');
  const [error, setError] = useState<string | undefined>();
  const mutation = useMockMutation<TontineCycle | undefined, CycleInput>({
    mutationFn: (input) => tontinesService.createCycle(currentTenant.id, input),
    invalidateKeys: [queryKeys.tontines.cycles(tontineId)],
    onSuccess: (cycle) => {
      if (!cycle) { setError(t('tontines', 'cycleNumberTaken')); return; }
      notify.success(t('tontines', 'cycleCreated'));
      navigate(`/tontines/${tontineId}/cycles/${cycle.id}`);
    },
  });
  useEffect(() => { setCycleNumber(cycles.length + 1); }, [cycles.length]);
  const handleSave = () => {
    if (!startDate || !endDate) { setError(t('tontines', 'fieldRequired')); return; }
    setError(undefined);
    mutation.mutate({ tontineId, cycleNumber, startDate, endDate, expectedTotal: Number(expectedTotal) || 0 });
  };
  if (isTontineLoading) return <Page title={t('tontines', 'createCycle')}><DetailSkeleton /></Page>;
  if (isTontineError) return <Page title={t('tontines', 'createCycle')}><ErrorState onRetry={refetchTontine} /></Page>;
  if (!tontine) return <NotFoundPage />;
  return <Page title={t('tontines', 'createCycle')} description={t('tontines', 'cyclesDescription')} actions={<Back label={t('tontines', 'backToCycles')} />}><div className="grid gap-5 lg:grid-cols-2"><FormSection title={t('tontines', 'general')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="cycle-number">{t('tontines', 'cycleNumber')}</Label><Input id="cycle-number" type="number" value={cycleNumber} onChange={(event) => setCycleNumber(Number(event.target.value))} /></div><div className="space-y-2"><Label htmlFor="cycle-tenant">{t('tontines', 'tenant')}</Label><Input id="cycle-tenant" value={currentTenant.id} disabled /></div><div className="space-y-2"><Label htmlFor="cycle-start-date">{t('tontines', 'startDate')}</Label><Input id="cycle-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-invalid={Boolean(error)} /></div><div className="space-y-2"><Label htmlFor="cycle-end-date">{t('tontines', 'endDate')}</Label><Input id="cycle-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-invalid={Boolean(error)} /></div><div className="space-y-2"><Label htmlFor="cycle-expected-total">{t('tontines', 'expectedTotal')}</Label><Input id="cycle-expected-total" type="number" value={expectedTotal} onChange={(event) => setExpectedTotal(event.target.value)} /></div></div><FieldError message={error} /></FormSection><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/tontines/${tontineId}/cycles`)}>{t('tontines', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('tontines', 'saving') : t('tontines', 'save')}</Button></div></div></Page>;
}

function CycleList({ t }: { t: T }) {
  const { tontineId = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant(); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all');
  const { data: tontine, isLoading: isTontineLoading, isError: isTontineError, refetch: refetchTontine } = useQuery({ queryKey: [...queryKeys.tontines.detail(tontineId), currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const { data: allCycles = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.tontines.cycles(tontineId), queryFn: () => tontinesService.listCyclesByTontine(currentTenant.id, tontineId), enabled: Boolean(tontine) });
  const rows = allCycles.filter((cycle) => (`${cycle.cycleNumber} ${cycle.id}`.toLowerCase().includes(search.toLowerCase())) && (status === 'all' || cycle.status === status));
  if (isTontineLoading) return <Page title={t('tontines', 'cyclesTitle')} description={t('tontines', 'cyclesDescription')}><TableSkeleton /></Page>;
  if (isTontineError) return <Page title={t('tontines', 'cyclesTitle')} description={t('tontines', 'cyclesDescription')}><ErrorState onRetry={refetchTontine} /></Page>;
  if (!tontine) return <NotFoundPage />;
  if (isLoading) return <Page title={t('tontines', 'cyclesTitle')} description={t('tontines', 'cyclesDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'cyclesTitle')} description={t('tontines', 'cyclesDescription')}><ErrorState onRetry={refetch} /></Page>;
  const columns: TableColumn<TontineCycle>[] = [
    { key: 'cycleNumber', header: t('tontines', 'cycleNumber'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/cycles/${row.id}`)} className="font-semibold text-primary">#{row.cycleNumber}</button> },
    { key: 'startDate', header: t('tontines', 'startDate'), render: (row) => <DateDisplay value={row.startDate} /> }, { key: 'endDate', header: t('tontines', 'endDate'), render: (row) => <DateDisplay value={row.endDate} /> }, { key: 'status', header: t('tontines', 'cycleStatus'), render: (row) => <StatusBadge label={t('tontines', row.status)} tone={STATUS_TONE[row.status]} /> }, { key: 'members', header: t('tontines', 'cycleMembers'), render: (row) => formatNumber(row.members.length) }, { key: 'totalCollected', header: t('tontines', 'totalCollected'), render: (row) => <MoneyDisplay amount={row.totalCollected} /> }, { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/cycles/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <Page title={t('tontines', 'cyclesTitle')} description={t('tontines', 'cyclesDescription')} actions={<><Back label={t('tontines', 'backToTontine')} /><PermissionGate permission="cycles.create"><Button onClick={() => navigate(`/tontines/${tontineId}/cycles/create`)}><Plus size={16} />{t('tontines', 'createCycle')}</Button></PermissionGate></>}><FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'cycleNumber')} filters={<select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('tontines', 'cycleStatus')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'cycleStatus')}</option><option value="statusDraft">{t('tontines', 'statusDraft')}</option><option value="statusOpen">{t('tontines', 'statusOpen')}</option><option value="statusSuspended">{t('tontines', 'statusSuspended')}</option><option value="statusClosed">{t('tontines', 'statusClosed')}</option></select>} /><DataTable columns={columns} rows={rows} empty={<EmptyState icon={CalendarDays} title={t('tontines', 'noCycles')} />} /></Page>;
}

function MemberRows({ t, rows }: { t: T; rows: CycleMember[] }) { const columns: TableColumn<CycleMember>[] = [{ key: 'position', header: t('tontines', 'position'), render: (row) => <span className="font-semibold">#{row.position}</span> }, { key: 'memberName', header: t('tontines', 'memberName'), render: (row) => <span className="flex items-center gap-2"><Avatar name={row.memberName} />{row.memberName}</span> }, { key: 'expectedAmount', header: t('tontines', 'expectedAmount'), render: (row) => <MoneyDisplay amount={row.expectedAmount} /> }, { key: 'collectedAmount', header: t('tontines', 'collectedAmount'), render: (row) => <MoneyDisplay amount={row.collectedAmount} /> }, { key: 'payoutAmount', header: t('tontines', 'payoutAmount'), render: (row) => <MoneyDisplay amount={row.payoutAmount} /> }, { key: 'status', header: t('tontines', 'memberStatus'), render: (row) => <StatusBadge label={t('tontines', row.status)} tone={STATUS_TONE[row.status]} /> }]; return <DataTable columns={columns} rows={rows} empty={<EmptyState icon={UserRound} title={t('tontines', 'noMembers')} />} />; }
function ContributionRows({ t, rows }: { t: T; rows: CycleContribution[] }) { const columns: TableColumn<CycleContribution>[] = [{ key: 'id', header: 'ID', render: (row) => <span className="font-mono text-xs">{row.id}</span> }, { key: 'memberName', header: t('tontines', 'memberName') }, { key: 'amount', header: t('tontines', 'contributionAmount'), render: (row) => <MoneyDisplay amount={row.amount} /> }, { key: 'date', header: t('tontines', 'contributionDate'), render: (row) => <DateDisplay value={row.date} /> }, { key: 'status', header: t('tontines', 'contributionStatus'), render: (row) => <StatusBadge label={t('tontines', row.status)} tone={STATUS_TONE[row.status]} /> }]; return <DataTable columns={columns} rows={rows} empty={<EmptyState icon={Banknote} title={t('tontines', 'noContributions')} />} />; }
function DrawRows({ t, rows }: { t: T; rows: CycleDraw[] }) { const columns: TableColumn<CycleDraw>[] = [{ key: 'drawNumber', header: t('tontines', 'drawNumber'), render: (row) => <span className="font-semibold">#{row.drawNumber}</span> }, { key: 'date', header: t('tontines', 'drawDate'), render: (row) => <DateDisplay value={row.date} /> }, { key: 'winnerName', header: t('tontines', 'drawWinner'), render: (row) => <span className="flex items-center gap-2"><TicketCheck size={15} className="text-primary" />{row.winnerName}</span> }, { key: 'contributionPool', header: t('tontines', 'contributionPool'), render: (row) => <MoneyDisplay amount={row.contributionPool} /> }, { key: 'settlementStatus', header: t('tontines', 'settlementStatus'), render: (row) => <StatusBadge label={t('tontines', row.settlementStatus)} tone={STATUS_TONE[row.settlementStatus]} /> }]; return <DataTable columns={columns} rows={rows} empty={<EmptyState icon={TicketCheck} title={t('tontines', 'noDraws')} />} />; }

function DrawPhaseStepper({ t, phase }: { t: T; phase: import('@/mocks/tontines/tontine-cycles').DrawPhase }) {
  const phases = ['phaseConfiguration', 'phaseVerification', 'phaseExecution', 'phaseResult', 'phaseWinner', 'phaseSettlement', 'phaseHistory'] as const;
  const current = phases.indexOf(phase);
  return <div className="grid gap-2 sm:grid-cols-7">{phases.map((item, index) => <div key={item} className="flex items-center gap-2 sm:block"><span className={`grid size-8 place-items-center rounded-full text-xs font-bold ${index <= current ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{index < current ? <Check size={14} /> : index + 1}</span><span className={`text-xs ${index <= current ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{t('tontines', item)}</span></div>)}</div>;
}

function useCycle(cycleId: string) {
  const { currentTenant } = useTenant();
  return useQuery({ queryKey: [...queryKeys.tontines.cycle(cycleId), currentTenant.id], queryFn: () => tontinesService.getCycle(currentTenant.id, cycleId) });
}

function DrawsHub({ t }: { t: T }) {
  const { tontineId = '', cycleId = '' } = useParams(); const navigate = useNavigate(); const { data: cycle, isLoading, isError, refetch } = useCycle(cycleId); const [search, setSearch] = useState('');
  if (isLoading) return <Page title={t('tontines', 'drawsTitle')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'drawsTitle')}><ErrorState onRetry={refetch} /></Page>;
  if (!cycle) return <NotFoundPage />;
  const upcoming = cycle.draws.filter((draw) => draw.status === 'statusScheduled'); const history = cycle.draws.filter((draw) => draw.status === 'statusCompleted'); const winners = history.filter((draw) => draw.winnerMemberId);
  const rows = cycle.draws.filter((draw) => `${draw.id} ${draw.winnerName} ${draw.drawNumber}`.toLowerCase().includes(search.toLowerCase()));
  const columns: TableColumn<CycleDraw>[] = [
    { key: 'drawNumber', header: t('tontines', 'draw'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/cycles/${cycleId}/draws/${row.id}`)} className="font-semibold text-primary">#{row.drawNumber}</button> },
    { key: 'date', header: t('tontines', 'drawDate'), render: (row) => <DateDisplay value={row.date} /> },
    { key: 'contributionPool', header: t('tontines', 'contributionPool'), render: (row) => <MoneyDisplay amount={row.contributionPool} /> },
    { key: 'winnerName', header: t('tontines', 'winnerName'), render: (row) => row.winnerMemberId ? <button type="button" onClick={() => navigate(`/tontines/${tontineId}/cycles/${cycleId}/draws/${row.id}/winner`)} className="flex items-center gap-2 font-medium text-primary"><Avatar name={row.winnerName} />{row.winnerName}</button> : <span className="text-muted-foreground">—</span> },
    { key: 'amountReceived', header: t('tontines', 'amountReceived'), render: (row) => <MoneyDisplay amount={row.amountReceived} /> },
    { key: 'settlementStatus', header: t('tontines', 'settlementStatus'), render: (row) => <StatusBadge label={t('tontines', row.settlementStatus)} tone={STATUS_TONE[row.settlementStatus]} /> },
  ];
  const winnerColumns: TableColumn<CycleDraw>[] = [{ key: 'drawNumber', header: t('tontines', 'draw'), render: (row) => <span className="font-semibold">#{row.drawNumber}</span> }, { key: 'winnerName', header: t('tontines', 'member'), render: (row) => <span className="flex items-center gap-2"><Avatar name={row.winnerName} />{row.winnerName}</span> }, { key: 'contributionPool', header: t('tontines', 'contributionPool'), render: (row) => <MoneyDisplay amount={row.contributionPool} /> }, { key: 'amountReceived', header: t('tontines', 'amountReceived'), render: (row) => <MoneyDisplay amount={row.amountReceived} /> }, { key: 'bidAmount', header: t('tontines', 'bidAmount'), render: (row) => <MoneyDisplay amount={row.bidAmount} /> }, { key: 'date', header: t('tontines', 'date'), render: (row) => <DateDisplay value={row.date} /> }, { key: 'settlementStatus', header: t('tontines', 'settlementStatus'), render: (row) => <StatusBadge label={t('tontines', row.settlementStatus)} tone={STATUS_TONE[row.settlementStatus]} /> }];
  return <Page title={t('tontines', 'drawsTitle')} description={`${cycle.id} · ${t('tontines', 'drawsDescription')}`} actions={<><Back label={t('tontines', 'backToCycles')} /><PermissionGate permission="draws.manage"><Button onClick={() => navigate(`/tontines/${tontineId}/cycles/${cycleId}/draws/create`)}><Plus size={16} />{t('tontines', 'upcomingDraw')}</Button></PermissionGate></>}><div className="grid gap-4 sm:grid-cols-3"><Metric label={t('tontines', 'upcomingDraw')} value={formatNumber(upcoming.length)} icon={Clock3} tone="warning" /><Metric label={t('tontines', 'drawHistory')} value={formatNumber(history.length)} icon={TicketCheck} tone="success" /><Metric label={t('tontines', 'winnersTitle')} value={formatNumber(winners.length)} icon={UsersRound} /></div><div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">{t('tontines', 'upcomingDraw')}</CardTitle><span className="text-xs text-muted-foreground">{cycle.id}</span></CardHeader><CardContent className="space-y-3">{upcoming.map((draw) => <button type="button" key={draw.id} onClick={() => navigate(`/tontines/${tontineId}/cycles/${cycleId}/draws/${draw.id}`)} className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"><span className="grid size-9 place-items-center rounded-lg bg-amber-500/10 text-amber-600"><CalendarDays size={17} /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t('tontines', 'draw')} #{draw.drawNumber}</p><p className="text-xs text-muted-foreground"><DateDisplay value={draw.date} /> · {formatFCFA(draw.contributionPool)}</p></div><ChevronRight size={16} className="text-muted-foreground" /></button>)}{upcoming.length === 0 && <EmptyState icon={CalendarDays} title={t('tontines', 'noUpcomingDraw')} />}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'drawHistory')}</CardTitle></CardHeader><CardContent className="space-y-3">{history.slice(0, 4).map((draw) => <button type="button" key={draw.id} onClick={() => navigate(`/tontines/${tontineId}/cycles/${cycleId}/draws/${draw.id}`)} className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"><span className="grid size-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600"><Check size={17} /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t('tontines', 'draw')} #{draw.drawNumber} · {draw.winnerName}</p><p className="text-xs text-muted-foreground"><DateDisplay value={draw.date} /> · {formatFCFA(draw.amountReceived)}</p></div><ChevronRight size={16} className="text-muted-foreground" /></button>)}</CardContent></Card></div><FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'drawHistory')} /><DataTable columns={columns} rows={rows} empty={<EmptyState icon={TicketCheck} title={t('tontines', 'noDraws')} />} /><Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'winnersTitle')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={winnerColumns} rows={winners} empty={<EmptyState icon={UserRound} title={t('tontines', 'noWinners')} />} /></CardContent></Card></Page>;
}

function DrawCreate({ t }: { t: T }) {
  const { tontineId = '', cycleId = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant(); const { data: cycle, isLoading, isError, refetch } = useCycle(cycleId);
  const [drawNumber, setDrawNumber] = useState(1); const [date, setDate] = useState(''); const [contributionPool, setContributionPool] = useState('');
  const [error, setError] = useState<string | undefined>();
  const mutation = useMockMutation<CycleDraw | undefined, DrawInput>({
    mutationFn: (input) => tontinesService.createDraw(currentTenant.id, input),
    invalidateKeys: [queryKeys.tontines.cycle(cycleId)],
    onSuccess: (draw) => {
      if (!draw) { notify.error(t('tontines', 'fieldRequired')); return; }
      notify.success(t('tontines', 'drawCreated'));
      navigate(`/tontines/${tontineId}/cycles/${cycleId}/draws`);
    },
  });
  useEffect(() => { if (cycle) { setDrawNumber(cycle.draws.length + 1); setContributionPool(String(cycle.totalCollected)); } }, [cycle]);
  const handleSave = () => {
    if (!date) { setError(t('tontines', 'fieldRequired')); return; }
    setError(undefined);
    mutation.mutate({ cycleId, drawNumber, date, contributionPool: Number(contributionPool) || 0 });
  };
  if (isLoading) return <Page title={t('tontines', 'upcomingDraw')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'upcomingDraw')}><ErrorState onRetry={refetch} /></Page>;
  if (!cycle) return <NotFoundPage />;
  return <Page title={t('tontines', 'upcomingDraw')} description={`${cycle.id} · ${t('tontines', 'drawsDescription')}`} actions={<Back label={t('tontines', 'backToDraws')} />}><div className="grid gap-5 lg:grid-cols-2"><FormSection title={t('tontines', 'drawConfiguration')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="draw-number">{t('tontines', 'drawNumber')}</Label><Input id="draw-number" type="number" value={drawNumber} onChange={(event) => setDrawNumber(Number(event.target.value))} /></div><div className="space-y-2"><Label htmlFor="draw-date">{t('tontines', 'drawDate')}</Label><Input id="draw-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-invalid={Boolean(error)} /></div><div className="space-y-2"><Label htmlFor="draw-contribution-pool">{t('tontines', 'contributionPool')}</Label><Input id="draw-contribution-pool" type="number" value={contributionPool} onChange={(event) => setContributionPool(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="draw-method">{t('tontines', 'drawMethod')}</Label><select id="draw-method" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option>{t('tontines', 'randomDraw')}</option><option>{t('tontines', 'manualDraw')}</option></select></div></div><FieldError message={error} /></FormSection><FormSection title={t('tontines', 'eligibleMembers')}><p className="text-sm text-muted-foreground">{formatNumber(cycle.members.filter((member) => member.status === 'statusActive' && !member.hasWon).length)} {t('tontines', 'members').toLowerCase()}</p></FormSection><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/tontines/${tontineId}/cycles/${cycleId}/draws`)}>{t('tontines', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('tontines', 'saving') : t('tontines', 'configureDraw')}</Button></div></div></Page>;
}

function DrawDetail({ t }: { t: T }) {
  const { tontineId = '', cycleId = '', drawId = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant(); const { data: cycle, isLoading, isError, refetch } = useCycle(cycleId);
  const draw = cycle?.draws.find((item) => item.id === drawId);
  const [phase, setPhase] = useState(draw?.phase ?? 'phaseConfiguration');
  const [declareOpen, setDeclareOpen] = useState(false);
  const [winnerMemberId, setWinnerMemberId] = useState(''); const [amountReceived, setAmountReceived] = useState('');
  const winnerMutation = useMockMutation<CycleDraw | undefined, WinnerInput>({
    mutationFn: (input) => tontinesService.declareWinner(currentTenant.id, cycleId, input),
    invalidateKeys: [queryKeys.tontines.cycle(cycleId)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'fieldRequired')); return; }
      notify.success(t('tontines', 'winnerDeclared'));
      setDeclareOpen(false); setWinnerMemberId(''); setAmountReceived('');
    },
  });
  if (isLoading) return <Page title={t('tontines', 'drawDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'drawDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!cycle || !draw) return <NotFoundPage />;
  const eligibleMembers = cycle.members.filter((member) => member.status === 'statusActive' && !member.hasWon);
  const phaseOrder = ['phaseConfiguration', 'phaseVerification', 'phaseExecution', 'phaseResult', 'phaseWinner', 'phaseSettlement', 'phaseHistory'] as const; const phaseIndex = phaseOrder.indexOf(phase);
  const advance = () => { if (phaseIndex < phaseOrder.length - 1) setPhase(phaseOrder[phaseIndex + 1]); };
  return <Page title={`${t('tontines', 'draw')} #${draw.drawNumber}`} description={`${cycle.id} · ${t('tontines', 'drawDetail')}`} actions={<><Back label={t('tontines', 'backToDraws')} />{draw.winnerMemberId && <Button variant="outline" onClick={() => navigate(`/tontines/${tontineId}/cycles/${cycleId}/draws/${draw.id}/winner`)}><UserRound size={15} />{t('tontines', 'viewWinnerDetail')}</Button>}{!draw.winnerMemberId && <PermissionGate permission="draws.manage"><Button variant="outline" onClick={() => setDeclareOpen(true)}><TicketCheck size={15} />{t('tontines', 'declareWinner')}</Button></PermissionGate>}<Button onClick={advance} disabled={phase === 'phaseHistory'}>{phase === 'phaseHistory' ? t('tontines', 'drawComplete') : t('tontines', 'nextStep')}<ChevronRight size={15} /></Button></>}>{declareOpen && <ConfirmDialog open title={t('tontines', 'declareWinner')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onConfirm={() => { if (!winnerMemberId) return; winnerMutation.mutate({ drawId: draw.id, winnerMemberId, amountReceived: Number(amountReceived) || 0 }); }} onCancel={() => setDeclareOpen(false)}>
    <div className="mt-4 space-y-3 text-left">
      <div className="space-y-1"><Label htmlFor="winner-member">{t('tontines', 'selectWinner')}</Label><select id="winner-member" value={winnerMemberId} onChange={(event) => setWinnerMemberId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">{t('tontines', 'selectWinner')}</option>{eligibleMembers.map((member) => <option key={member.id} value={member.id}>{member.memberName}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="winner-amount">{t('tontines', 'amountReceived')}</Label><Input id="winner-amount" type="number" inputMode="decimal" value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} /></div>
    </div>
  </ConfirmDialog>}<Card><CardContent className="space-y-5 p-5"><DrawPhaseStepper t={t} phase={phase} /><div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4"><Info label={t('tontines', 'drawPhase')} value={t('tontines', phase)} icon={ClipboardList} /><Info label={t('tontines', 'contributionPool')} value={formatFCFA(draw.contributionPool)} icon={Banknote} /><Info label={t('tontines', 'bidAmount')} value={formatFCFA(draw.bidAmount)} icon={TrendingUp} /><Info label={t('tontines', 'settlementStatus')} value={t('tontines', draw.settlementStatus)} icon={ShieldCheck} /></div></CardContent></Card><div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'drawConfiguration')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5"><Info label={t('tontines', 'cycle')} value={cycle.id} icon={CalendarDays} /><Info label={t('tontines', 'drawDate')} value={new Date(draw.date).toLocaleDateString('fr-FR')} icon={Clock3} /><Info label={t('tontines', 'eligibleMembers')} value={formatNumber(cycle.members.filter((member) => member.status === 'statusActive').length)} icon={UsersRound} /></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'drawResult')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">{draw.winnerMemberId ? <><Info label={t('tontines', 'winnerName')} value={draw.winnerName} icon={UserRound} /><Info label={t('tontines', 'amountReceived')} value={formatFCFA(draw.amountReceived)} icon={Banknote} /><Info label={t('tontines', 'settlementDate')} value={draw.settlementDate ? new Date(draw.settlementDate).toLocaleDateString('fr-FR') : '—'} icon={Check} /></> : <EmptyState icon={Clock3} title={t('tontines', 'noUpcomingDraw')} />}</CardContent></Card></div><Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'drawHistoryLog')}</CardTitle></CardHeader><CardContent><Timeline items={phaseOrder.slice(0, phaseIndex + 1).map((item, index) => ({ id: item, title: t('tontines', item), description: index === phaseIndex ? t('tontines', 'nextStep') : t('tontines', 'drawComplete'), date: index === 0 ? draw.date : undefined, tone: index < phaseIndex ? 'success' : 'default' }))} /></CardContent></Card></Page>;
}

function WinnerDetail({ t }: { t: T }) {
  const { tontineId = '', cycleId = '', drawId = '' } = useParams(); const navigate = useNavigate(); const { data: cycle, isLoading, isError, refetch } = useCycle(cycleId);
  const draw = cycle?.draws.find((item) => item.id === drawId);
  if (isLoading) return <Page title={t('tontines', 'winnerDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'winnerDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!cycle || !draw) return <NotFoundPage />;
  const winner = cycle.members.find((member) => member.id === draw.winnerMemberId);
  return <Page title={t('tontines', 'winnerDetail')} description={`${draw.winnerName} · ${cycle.id}`} actions={<><Back label={t('tontines', 'drawDetail')} /><Button variant="outline" onClick={() => navigate(`/tontines/${tontineId}/cycles/${cycleId}/draws/${draw.id}`)}><TicketCheck size={15} />{t('tontines', 'drawDetail')}</Button></>}><div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><Card><CardContent className="p-6"><div className="flex items-center gap-4"><Avatar name={draw.winnerName} /><div><p className="text-xs text-muted-foreground">{t('tontines', 'winnerName')}</p><h2 className="text-xl font-semibold">{draw.winnerName}</h2><p className="font-mono text-xs text-muted-foreground">{winner?.id ?? draw.winnerMemberId ?? '—'}</p></div></div><div className="mt-6 space-y-4 border-t border-border pt-5"><Info label={t('tontines', 'draw')} value={`#${draw.drawNumber}`} icon={TicketCheck} /><Info label={t('tontines', 'cycle')} value={cycle.id} icon={CalendarDays} /><Info label={t('tontines', 'drawDate')} value={new Date(draw.date).toLocaleDateString('fr-FR')} icon={Clock3} /></div></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'settlement')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2"><Info label={t('tontines', 'contributionPool')} value={formatFCFA(draw.contributionPool)} icon={Landmark} /><Info label={t('tontines', 'amountReceived')} value={formatFCFA(draw.amountReceived)} icon={Banknote} /><Info label={t('tontines', 'bidAmount')} value={formatFCFA(draw.bidAmount)} icon={TrendingUp} /><Info label={t('tontines', 'settlementDate')} value={draw.settlementDate ? new Date(draw.settlementDate).toLocaleDateString('fr-FR') : '—'} icon={CalendarDays} /><div className="sm:col-span-2"><StatusBadge label={t('tontines', draw.settlementStatus)} tone={STATUS_TONE[draw.settlementStatus]} /></div></CardContent></Card></div></Page>;
}

type CycleTransition = { next: TontineCycleStatus; toastKey: 'cycleOpened' | 'cycleSuspended' | 'cycleClosed' | 'cycleResumed'; label: string; icon: typeof CirclePlay; confirmDescriptionKey?: 'suspendCycleConfirm' | 'closeCycleConfirm' | 'resumeCycleConfirm' };

function CycleDetail({ t }: { t: T }) {
  const { cycleId = '' } = useParams(); const { currentTenant } = useTenant(); const { data: cycle, isLoading, isError, refetch } = useCycle(cycleId);
  const { data: tontine } = useQuery({ queryKey: [...queryKeys.tontines.detail(cycle?.tontineId ?? ''), currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, cycle!.tontineId), enabled: Boolean(cycle) });
  const [pendingTransition, setPendingTransition] = useState<CycleTransition | null>(null);
  const transitionMutation = useMockMutation<TontineCycle | undefined, CycleTransition>({
    mutationFn: (transition) => tontinesService.updateCycleStatus(currentTenant.id, cycleId, transition.next),
    invalidateKeys: cycle ? [queryKeys.tontines.cycle(cycleId), queryKeys.tontines.cycles(cycle.tontineId), queryKeys.tontines.detail(cycle.tontineId)] : [queryKeys.tontines.cycle(cycleId)],
    onSuccess: (_data, transition) => notify.success(t('tontines', transition.toastKey)),
  });
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({ memberId: '', position: 1, expectedAmount: '' });
  const { data: tenantMembers = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const addMemberMutation = useMockMutation<CycleMember | undefined, CycleMemberInput>({
    mutationFn: (input) => tontinesService.addCycleMember(currentTenant.id, cycleId, input),
    invalidateKeys: [queryKeys.tontines.cycle(cycleId)],
    onSuccess: (member) => {
      if (!member) { notify.error(t('tontines', 'fieldRequired')); return; }
      notify.success(t('tontines', 'cycleMemberAdded'));
      setAddMemberOpen(false); setMemberForm({ memberId: '', position: 1, expectedAmount: '' });
    },
  });
  if (isLoading) return <Page title={t('tontines', 'cycleDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'cycleDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!cycle) return <NotFoundPage />;
  const status = cycle.status;
  const progress = cycle.expectedTotal ? Math.round((cycle.totalCollected / cycle.expectedTotal) * 100) : 0;
  const lifecycleAction: CycleTransition | null =
    status === 'statusDraft' ? { next: 'statusOpen', toastKey: 'cycleOpened', label: t('tontines', 'openCycle'), icon: CirclePlay } :
    status === 'statusOpen' ? { next: 'statusSuspended', toastKey: 'cycleSuspended', label: t('tontines', 'suspendCycle'), icon: CirclePause, confirmDescriptionKey: 'suspendCycleConfirm' } :
    status === 'statusSuspended' ? { next: 'statusOpen', toastKey: 'cycleResumed', label: t('tontines', 'resumeCycle'), icon: RotateCcw, confirmDescriptionKey: 'resumeCycleConfirm' } :
    null; // statusClosed : aucune source ne documente de réouverture — voir docs/PHASE_08_DECISIONS_A_VALIDER.md
  const closeAction: CycleTransition = { next: 'statusClosed', toastKey: 'cycleClosed', label: t('tontines', 'closeCycle'), icon: CircleStop, confirmDescriptionKey: 'closeCycleConfirm' };
  const triggerTransition = (transition: CycleTransition) => { if (transition.confirmDescriptionKey) setPendingTransition(transition); else transitionMutation.mutate(transition); };
  const isBusy = transitionMutation.isPending;
  const LifecycleIcon = lifecycleAction?.icon;
  return <Page title={`${t('tontines', 'cycleNumber')} ${cycle.cycleNumber}`} description={`${tontine?.name ?? cycle.tontineId} · ${cycle.id}`} actions={<><Back label={t('tontines', 'backToCycles')} />{lifecycleAction && LifecycleIcon && <PermissionGate permission="cycles.manage"><Button variant="outline" disabled={isBusy} onClick={() => triggerTransition(lifecycleAction)}><LifecycleIcon size={15} />{isBusy ? t('tontines', 'saving') : lifecycleAction.label}</Button></PermissionGate>}{status === 'statusOpen' && <PermissionGate permission="cycles.manage"><Button variant="outline" disabled={isBusy} onClick={() => triggerTransition(closeAction)}><CircleStop size={15} />{isBusy ? t('tontines', 'saving') : t('tontines', 'closeCycle')}</Button></PermissionGate>}</>}><Card><CardContent className="p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarDays size={23} /></span><div><p className="font-mono text-xs text-muted-foreground">{cycle.id}</p><h2 className="mt-1 text-lg font-semibold">{tontine?.name ?? cycle.tontineId} · {t('tontines', 'cycleNumber')} {cycle.cycleNumber}</h2></div></div><StatusBadge label={t('tontines', status)} tone={STATUS_TONE[status]} /></div><div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-3"><Info label={t('tontines', 'startDate')} value={new Date(cycle.startDate).toLocaleDateString('fr-FR')} icon={CalendarDays} /><Info label={t('tontines', 'endDate')} value={new Date(cycle.endDate).toLocaleDateString('fr-FR')} icon={Clock3} /><Info label={t('tontines', 'tenant')} value={cycle.tenantId} icon={Landmark} /></div></CardContent></Card>{pendingTransition && <ConfirmDialog open title={pendingTransition.label} description={t('tontines', pendingTransition.confirmDescriptionKey!)} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onConfirm={() => { transitionMutation.mutate(pendingTransition); setPendingTransition(null); }} onCancel={() => setPendingTransition(null)} />}<Tabs defaultValue="overview" className="min-w-0"><TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">{[['overview', 'cycleOverview'], ['members', 'cycleMembers'], ['contributions', 'cycleContributions'], ['draws', 'cycleDraws'], ['positions', 'cyclePositions'], ['financial', 'cycleFinancial'], ['activity', 'cycleActivity']].map(([value, label]) => <TabsTrigger key={value} value={value}>{t('tontines', label)}</TabsTrigger>)}</TabsList><TabsContent value="overview"><div className="grid gap-4 sm:grid-cols-4"><Metric label={t('tontines', 'cycleMembers')} value={formatNumber(cycle.members.length)} icon={UsersRound} /><Metric label={t('tontines', 'totalCollected')} value={formatFCFA(cycle.totalCollected, 'fr', true)} icon={Banknote} tone="success" /><Metric label={t('tontines', 'totalPaidOut')} value={formatFCFA(cycle.totalPaidOut, 'fr', true)} icon={TrendingUp} tone="warning" /><Metric label={t('tontines', 'collectionRate')} value={`${progress}%`} icon={ClipboardList} tone="neutral" /></div><Card className="mt-4"><CardHeader><CardTitle className="text-sm">{t('tontines', 'cycleOverview')}</CardTitle></CardHeader><CardContent><div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={t('tontines', 'collectionRate')} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{formatFCFA(cycle.totalCollected)}</span><span>{formatFCFA(cycle.expectedTotal)}</span></div></CardContent></Card></TabsContent><TabsContent value="members"><div className="mb-3 flex justify-end"><PermissionGate permission="cycles.manage"><Button size="sm" onClick={() => { setMemberForm({ memberId: '', position: cycle.members.length + 1, expectedAmount: '' }); setAddMemberOpen(true); }}><Plus size={15} />{t('tontines', 'addCycleMember')}</Button></PermissionGate></div><MemberRows t={t} rows={cycle.members} />{addMemberOpen && <ConfirmDialog open title={t('tontines', 'addCycleMember')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onConfirm={() => { const member = tenantMembers.find((m) => m.id === memberForm.memberId); if (!member) return; addMemberMutation.mutate({ memberId: member.id, memberName: `${member.firstName} ${member.lastName}`, position: memberForm.position, expectedAmount: Number(memberForm.expectedAmount) || 0 }); }} onCancel={() => setAddMemberOpen(false)}>
    <div className="mt-4 space-y-3 text-left">
      <div className="space-y-1"><Label htmlFor="cycle-member-select">{t('tontines', 'selectMember')}</Label><select id="cycle-member-select" value={memberForm.memberId} onChange={(event) => setMemberForm((v) => ({ ...v, memberId: event.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">{t('tontines', 'selectMember')}</option>{tenantMembers.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor="cycle-member-position">{t('tontines', 'position')}</Label><Input id="cycle-member-position" type="number" min={1} value={memberForm.position} onChange={(event) => setMemberForm((v) => ({ ...v, position: Number(event.target.value) }))} /></div><div className="space-y-1"><Label htmlFor="cycle-member-amount">{t('tontines', 'expectedAmount')}</Label><Input id="cycle-member-amount" type="number" inputMode="decimal" value={memberForm.expectedAmount} onChange={(event) => setMemberForm((v) => ({ ...v, expectedAmount: event.target.value }))} /></div></div>
    </div>
  </ConfirmDialog>}</TabsContent><TabsContent value="contributions"><ContributionRows t={t} rows={cycle.contributions} /></TabsContent><TabsContent value="draws"><DrawRows t={t} rows={cycle.draws} /></TabsContent><TabsContent value="positions"><Card><CardContent className="p-0"><MemberRows t={t} rows={[...cycle.members].sort((a, b) => a.position - b.position)} /></CardContent></Card></TabsContent><TabsContent value="financial"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label={t('tontines', 'expectedTotal')} value={formatFCFA(cycle.expectedTotal)} icon={Landmark} /><Metric label={t('tontines', 'totalCollected')} value={formatFCFA(cycle.totalCollected)} icon={Banknote} tone="success" /><Metric label={t('tontines', 'totalPaidOut')} value={formatFCFA(cycle.totalPaidOut)} icon={TrendingUp} tone="warning" /><Metric label={t('tontines', 'pendingAmount')} value={formatFCFA(cycle.expectedTotal - cycle.totalCollected)} icon={Clock3} tone="neutral" /></div></TabsContent><TabsContent value="activity"><Card><CardContent className="p-5"><Timeline items={cycle.activities.map((item) => ({ id: item.id, title: item.type, description: item.description, date: new Date(item.date).toLocaleDateString('fr-FR') }))} /></CardContent></Card></TabsContent></Tabs></Page>;
}

export function TontinesModule() {
  const { t } = useLocale();
  return (
    <Routes>
      <Route index element={<TontinesList t={t} />} />
      <Route path="create" element={<TontineCreate t={t} />} />
      <Route path=":tontineId" element={<TontineDetail t={t} />} />
      <Route path=":tontineId/cycles" element={<CycleList t={t} />} />
      <Route path=":tontineId/cycles/create" element={<CycleCreate t={t} />} />
      <Route path=":tontineId/cycles/:cycleId" element={<CycleDetail t={t} />} />
      <Route path=":tontineId/cycles/:cycleId/draws" element={<DrawsHub t={t} />} />
      <Route path=":tontineId/cycles/:cycleId/draws/create" element={<DrawCreate t={t} />} />
      <Route path=":tontineId/cycles/:cycleId/draws/:drawId" element={<DrawDetail t={t} />} />
      <Route path=":tontineId/cycles/:cycleId/draws/:drawId/winner" element={<WinnerDetail t={t} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
