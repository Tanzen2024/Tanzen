import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowLeft, BarChart3, ChevronRight, ClipboardList, Fingerprint, KeyRound, ListChecks, LogIn, LogOut, ShieldAlert, UserX } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, StatCard, Timeline, TableSkeleton, DetailSkeleton, ErrorState } from '@/components';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { NotFoundPage } from '@/routes';
import { auditService } from '@/services/audit.service';
import { queryKeys } from '@/services/query-keys';
import type { AuditEvent, AuditEventType, AuditModule, AuditStatus } from '@/mocks/audit/audit-events';
import type { TableColumn, StatusTone } from '@/types/ui';
import { formatDate, formatNumber } from '@/lib/utils';

type T = (section: 'audit', key: string, values?: Record<string, string>) => string;

const AUDIT_MODULE_KEY: Record<AuditModule, string> = { credit: 'moduleCredit', tontines: 'moduleTontines', governance: 'moduleGovernance', finance: 'moduleFinance', organization: 'moduleOrganization', access: 'moduleAccess', system: 'moduleSystem' };
const EVENT_TYPE_KEY: Record<AuditEventType, string> = { loginSuccess: 'eventLoginSuccess', loginFailure: 'eventLoginFailure', mfaEvent: 'eventMfaEvent', permissionDenied: 'eventPermissionDenied', sessionRevoked: 'eventSessionRevoked', sensitiveAction: 'eventSensitiveAction', action: 'eventAction' };
const EVENT_TYPE_ICON: Record<AuditEventType, typeof LogIn> = { loginSuccess: LogIn, loginFailure: UserX, mfaEvent: Fingerprint, permissionDenied: ShieldAlert, sessionRevoked: LogOut, sensitiveAction: KeyRound, action: Activity };
const EVENT_TYPE_TONE: Record<AuditEventType, StatusTone> = { loginSuccess: 'success', loginFailure: 'error', mfaEvent: 'info', permissionDenied: 'error', sessionRevoked: 'warning', sensitiveAction: 'warning', action: 'default' };
const STATUS_TONE: Record<AuditStatus, StatusTone> = { success: 'success', failure: 'error' };
const STATUS_KEY: Record<AuditStatus, string> = { success: 'statusSuccess', failure: 'statusFailure' };
const SECURITY_TYPES: AuditEventType[] = ['loginSuccess', 'loginFailure', 'mfaEvent', 'permissionDenied', 'sessionRevoked', 'sensitiveAction'];

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="AUDIT" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label }: { label: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={15} />{label}</Button>; }
function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Activity }) { return <div className="flex gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }

/** Filtre RBAC : un utilisateur sans `audit.readSensitive` ne voit pas les événements sensibles. */
function useVisibleEvents(tenantId: string) {
  const { can } = usePermissions();
  const { data: events = [], ...rest } = useQuery({ queryKey: queryKeys.audit.events(tenantId), queryFn: () => auditService.list(tenantId) });
  const canReadAudit = can('audit.read');
  const canReadSensitive = can('audit.readSensitive');
  const visible = useMemo(() => (canReadAudit ? events.filter((event) => !event.sensitive || canReadSensitive) : []), [events, canReadAudit, canReadSensitive]);
  const hiddenSensitiveCount = canReadAudit ? events.filter((event) => event.sensitive).length - visible.filter((event) => event.sensitive).length : 0;
  return { events: visible, canReadAudit, hiddenSensitiveCount, ...rest };
}

function KeyValueGrid({ data }: { data?: Record<string, string | number> }) {
  if (!data || Object.keys(data).length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return <dl className="grid gap-2 text-xs">{Object.entries(data).map(([key, value]) => <div key={key} className="flex justify-between gap-3 rounded-md bg-muted/50 px-2.5 py-1.5"><dt className="shrink-0 font-mono text-muted-foreground">{key}</dt><dd className="min-w-0 break-words text-right font-medium" title={String(value)}>{String(value)}</dd></div>)}</dl>;
}

// ----------------------------------------------------------------------- Overview

function AuditOverview({ t, locale }: { t: T; locale: 'fr' | 'en' }) {
  const { currentTenant } = useTenant();
  const { events, canReadAudit, isLoading, isError, refetch } = useVisibleEvents(currentTenant.id);

  const todayKey = new Date().toISOString().slice(0, 10);
  const eventsToday = events.filter((event) => event.timestamp.startsWith(todayKey)).length;
  const securityEvents = events.filter((event) => SECURITY_TYPES.includes(event.eventType)).length;
  const failedActions = events.filter((event) => event.status === 'failure').length;
  const sensitiveActions = events.filter((event) => event.sensitive).length;

  const byModule = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => counts.set(event.module, (counts.get(event.module) ?? 0) + 1));
    return [...counts.entries()].map(([module, count]) => ({ module: t('audit', AUDIT_MODULE_KEY[module as AuditModule] ?? module), count }));
  }, [events, t]);

  const byUser = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => counts.set(event.actorName, (counts.get(event.actorName) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([actor, count]) => ({ actor, count }));
  }, [events]);

  const trend = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => { const day = event.timestamp.slice(0, 10); counts.set(day, (counts.get(day) ?? 0) + 1); });
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day: formatDate(day, locale), count }));
  }, [events, locale]);

  if (isLoading) return <Page title={t('audit', 'overviewTitle')} description={t('audit', 'overviewDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('audit', 'overviewTitle')} description={t('audit', 'overviewDescription')}><ErrorState onRetry={refetch} /></Page>;
  if (!canReadAudit) return <Page title={t('audit', 'overviewTitle')}><EmptyState icon={ShieldAlert} title={t('audit', 'noEvents')} /></Page>;

  return <Page title={t('audit', 'overviewTitle')} description={t('audit', 'overviewDescription')}>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label={t('audit', 'eventsToday')} value={formatNumber(eventsToday)} icon={Activity} tone="info" />
      <StatCard label={t('audit', 'securityEventsCount')} value={formatNumber(securityEvents)} icon={ShieldAlert} tone="warning" />
      <StatCard label={t('audit', 'failedActions')} value={formatNumber(failedActions)} icon={UserX} tone="warning" />
      <StatCard label={t('audit', 'sensitiveActions')} value={formatNumber(sensitiveActions)} icon={KeyRound} tone="neutral" />
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-sm">{t('audit', 'activityByModule')}</CardTitle></CardHeader><CardContent className="p-4"><div className="h-[220px]">{byModule.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={byModule} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="module" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="count" fill="#1b6bd1" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyState icon={BarChart3} title={t('audit', 'noEvents')} />}</div></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">{t('audit', 'activityByUser')}</CardTitle></CardHeader><CardContent className="p-4"><div className="h-[220px]">{byUser.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={byUser} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}><CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border/50" /><XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="actor" tick={{ fontSize: 10 }} width={100} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptyState icon={ListChecks} title={t('audit', 'noEvents')} />}</div></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">{t('audit', 'eventTrend')}</CardTitle></CardHeader><CardContent className="p-4"><div className="h-[220px]">{trend.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="count" stroke="#1b6bd1" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <EmptyState icon={BarChart3} title={t('audit', 'noEvents')} />}</div></CardContent></Card>
  </Page>;
}

// ----------------------------------------------------------------------- Logs

function logColumns(t: T, navigate: (path: string) => void): TableColumn<AuditEvent>[] {
  return [
    { key: 'timestamp', header: t('audit', 'timestamp'), render: (row) => <button type="button" onClick={() => navigate(`/audit/logs/${row.id}`)} className="text-left font-mono text-xs text-primary">{formatDate(row.timestamp, 'fr')}</button> },
    { key: 'actor', header: t('audit', 'actor'), render: (row) => row.actorName },
    { key: 'tenant', header: t('audit', 'tenant'), render: (row) => row.tenantId },
    { key: 'module', header: t('audit', 'module'), render: (row) => t('audit', AUDIT_MODULE_KEY[row.module] ?? row.module) },
    { key: 'action', header: t('audit', 'action'), render: (row) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{row.action}</code> },
    { key: 'resource', header: t('audit', 'resource'), render: (row) => <span className="block max-w-[220px] truncate" title={row.resourceLabel}>{row.resourceLabel}</span> },
    { key: 'status', header: t('audit', 'status'), render: (row) => <StatusBadge label={t('audit', STATUS_KEY[row.status])} tone={STATUS_TONE[row.status]} /> },
    { key: 'correlationId', header: t('audit', 'correlationId'), render: (row) => <code className="font-mono text-[11px] text-muted-foreground" title={row.correlationId}>{row.correlationId}</code> },
    { key: 'actions', header: '', className: 'w-10', render: (row) => <button type="button" onClick={() => navigate(`/audit/logs/${row.id}`)} aria-label={t('audit', 'viewDetail')} className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronRight size={15} /></button> },
  ];
}

function AuditLogs({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { events, canReadAudit, hiddenSensitiveCount, isLoading, isError, refetch } = useVisibleEvents(currentTenant.id);
  const [search, setSearch] = useState(''); const [module, setModule] = useState('all'); const [status, setStatus] = useState('all');
  if (isLoading) return <Page title={t('audit', 'logsTitle')} description={t('audit', 'logsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('audit', 'logsTitle')} description={t('audit', 'logsDescription')}><ErrorState onRetry={refetch} /></Page>;
  if (!canReadAudit) return <Page title={t('audit', 'logsTitle')}><EmptyState icon={ShieldAlert} title={t('audit', 'noEvents')} /></Page>;

  const modules = [...new Set(events.map((event) => event.module))];
  const filtered = events.filter((event) => `${event.resourceLabel} ${event.actorName} ${event.action} ${event.correlationId}`.toLowerCase().includes(search.toLowerCase()) && (module === 'all' || event.module === module) && (status === 'all' || event.status === status));

  return <Page title={t('audit', 'logsTitle')} description={t('audit', 'logsDescription')}>
    {hiddenSensitiveCount > 0 && <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t('audit', 'noPermissionSensitive')}</p>}
    <FilterBar search={search} onSearchChange={setSearch} placeholder={t('audit', 'searchLog')} filters={<>
      <select value={module} onChange={(e) => setModule(e.target.value)} aria-label={t('audit', 'filterByModule')} className="h-9 rounded-md border border-input bg-background px-3 text-xs transition-colors hover:bg-muted/50"><option value="all">{t('audit', 'allModules')}</option>{modules.map((m) => <option key={m} value={m}>{t('audit', AUDIT_MODULE_KEY[m as AuditModule] ?? m)}</option>)}</select>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('audit', 'filterByStatus')} className="h-9 rounded-md border border-input bg-background px-3 text-xs transition-colors hover:bg-muted/50"><option value="all">{t('audit', 'allStatuses')}</option><option value="success">{t('audit', 'statusSuccess')}</option><option value="failure">{t('audit', 'statusFailure')}</option></select>
    </>} />
    <DataTable columns={logColumns(t, navigate)} rows={filtered} empty={<EmptyState icon={ClipboardList} title={t('audit', 'noEvents')} />} />
  </Page>;
}

function AuditLogDetail({ t, locale }: { t: T; locale: 'fr' | 'en' }) {
  const { id: eventId = '' } = useParams(); const { currentTenant } = useTenant();
  const { data: event, isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.audit.event(currentTenant.id, eventId), queryFn: () => auditService.get(currentTenant.id, eventId) });
  if (isLoading) return <Page title={t('audit', 'logDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('audit', 'logDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!event) return <NotFoundPage />;
  const Icon = EVENT_TYPE_ICON[event.eventType];
  return <Page title={t('audit', 'logDetail')} description={event.correlationId} actions={<Back label={t('audit', 'backToLogs')} />}>
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Card><CardHeader><CardTitle className="text-sm">{t('audit', 'event')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={18} /></span><div><p className="text-sm font-semibold">{t('audit', EVENT_TYPE_KEY[event.eventType])}</p><code className="font-mono text-xs text-muted-foreground">{event.action}</code></div></div>
        <StatusBadge label={t('audit', STATUS_KEY[event.status])} tone={STATUS_TONE[event.status]} />
        <Info label={t('audit', 'actor')} value={event.actorName} icon={Activity} />
        <Info label={t('audit', 'tenant')} value={event.tenantId} icon={Activity} />
        <Info label={t('audit', 'resource')} value={`${event.resourceLabel} (${event.resourceType})`} icon={Activity} />
        <Info label={t('audit', 'timestamp')} value={formatDate(event.timestamp, locale)} icon={Activity} />
      </CardContent></Card>
      <div className="space-y-5">
        <Card><CardHeader><CardTitle className="text-sm">{t('audit', 'before')}</CardTitle></CardHeader><CardContent className="p-5"><KeyValueGrid data={event.before} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">{t('audit', 'after')}</CardTitle></CardHeader><CardContent className="p-5"><KeyValueGrid data={event.after} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">{t('audit', 'context')}</CardTitle></CardHeader><CardContent className="p-5"><KeyValueGrid data={event.context} /></CardContent></Card>
      </div>
    </div>
  </Page>;
}

// ----------------------------------------------------------------------- Security events

function SecurityEvents({ t, locale }: { t: T; locale: 'fr' | 'en' }) {
  const { currentTenant } = useTenant();
  const { events, canReadAudit, hiddenSensitiveCount, isLoading, isError, refetch } = useVisibleEvents(currentTenant.id);
  const [type, setType] = useState('all');
  if (isLoading) return <Page title={t('audit', 'securityEventsTitle')} description={t('audit', 'securityEventsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('audit', 'securityEventsTitle')} description={t('audit', 'securityEventsDescription')}><ErrorState onRetry={refetch} /></Page>;
  if (!canReadAudit) return <Page title={t('audit', 'securityEventsTitle')}><EmptyState icon={ShieldAlert} title={t('audit', 'noEvents')} /></Page>;

  const securityEvents = events.filter((event) => SECURITY_TYPES.includes(event.eventType));
  const filtered = type === 'all' ? securityEvents : securityEvents.filter((event) => event.eventType === type);
  const counts = SECURITY_TYPES.map((t2) => ({ type: t2, count: securityEvents.filter((event) => event.eventType === t2).length }));

  return <Page title={t('audit', 'securityEventsTitle')} description={t('audit', 'securityEventsDescription')}>
    {hiddenSensitiveCount > 0 && <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t('audit', 'noPermissionSensitive')}</p>}
    <div role="group" aria-label={t('audit', 'filterByEventType')} className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{counts.map(({ type: eventType, count }) => { const Icon = EVENT_TYPE_ICON[eventType]; return <button type="button" key={eventType} aria-pressed={type === eventType} onClick={() => setType(eventType === type ? 'all' : eventType)} className={`rounded-xl border p-3 text-left transition-colors ${type === eventType ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}><Icon size={16} className="text-muted-foreground" /><p className="mt-2 text-lg font-semibold">{formatNumber(count)}</p><p className="text-[11px] text-muted-foreground">{t('audit', EVENT_TYPE_KEY[eventType])}</p></button>; })}</div>
    <DataTable columns={[
      { key: 'timestamp', header: t('audit', 'timestamp'), render: (row) => <span className="font-mono text-xs">{formatDate(row.timestamp, locale)}</span> },
      { key: 'type', header: t('audit', 'event'), render: (row) => <span className="flex items-center gap-2">{(() => { const Icon = EVENT_TYPE_ICON[row.eventType]; return <Icon size={14} className="shrink-0 text-muted-foreground" />; })()}<StatusBadge label={t('audit', EVENT_TYPE_KEY[row.eventType])} tone={EVENT_TYPE_TONE[row.eventType]} /></span> },
      { key: 'actor', header: t('audit', 'actor'), render: (row) => row.actorName },
      { key: 'tenant', header: t('audit', 'tenant'), render: (row) => row.tenantId },
      { key: 'resource', header: t('audit', 'resource'), render: (row) => <span className="block max-w-[220px] truncate" title={row.resourceLabel}>{row.resourceLabel}</span> },
      { key: 'status', header: t('audit', 'status'), render: (row) => <StatusBadge label={t('audit', STATUS_KEY[row.status])} tone={STATUS_TONE[row.status]} /> },
    ] as TableColumn<AuditEvent>[]} rows={filtered} empty={<EmptyState icon={ShieldAlert} title={t('audit', 'noEvents')} />} />
  </Page>;
}

// ----------------------------------------------------------------------- Activity

function ActivityPage({ t, locale }: { t: T; locale: 'fr' | 'en' }) {
  const { currentTenant } = useTenant();
  const { events, canReadAudit, hiddenSensitiveCount, isLoading, isError, refetch } = useVisibleEvents(currentTenant.id);
  const [user, setUser] = useState('all'); const [module, setModule] = useState('all'); const [action, setAction] = useState('all'); const [period, setPeriod] = useState('all'); const [status, setStatus] = useState('all');
  if (isLoading) return <Page title={t('audit', 'activityTitle')} description={t('audit', 'activityDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('audit', 'activityTitle')} description={t('audit', 'activityDescription')}><ErrorState onRetry={refetch} /></Page>;
  if (!canReadAudit) return <Page title={t('audit', 'activityTitle')}><EmptyState icon={ShieldAlert} title={t('audit', 'noEvents')} /></Page>;

  const users = [...new Set(events.map((event) => event.actorName))];
  const modules = [...new Set(events.map((event) => event.module))];
  const actions = [...new Set(events.filter((event) => module === 'all' || event.module === module).map((event) => event.action))];

  const filtered = events.filter((event) => {
    const matchesUser = user === 'all' || event.actorName === user;
    const matchesModule = module === 'all' || event.module === module;
    const matchesAction = action === 'all' || event.action === action;
    const matchesStatus = status === 'all' || event.status === status;
    let matchesPeriod = true;
    if (period !== 'all') { const eventDate = new Date(event.timestamp); const now = new Date(); if (period === 'today') matchesPeriod = eventDate.toDateString() === now.toDateString(); else if (period === 'week') matchesPeriod = eventDate > new Date(now.getTime() - 7 * 86400000); else if (period === 'month') matchesPeriod = eventDate.getMonth() === now.getMonth() && eventDate.getFullYear() === now.getFullYear(); else if (period === 'quarter') matchesPeriod = Math.floor(eventDate.getMonth() / 3) === Math.floor(now.getMonth() / 3) && eventDate.getFullYear() === now.getFullYear(); else if (period === 'year') matchesPeriod = eventDate.getFullYear() === now.getFullYear(); }
    return matchesUser && matchesModule && matchesAction && matchesStatus && matchesPeriod;
  });

  const selectClass = 'h-9 rounded-md border border-input bg-background px-3 text-xs transition-colors hover:bg-muted/50';
  const items = filtered.map((event) => ({
    id: event.id,
    title: `${event.actorName} · ${t('audit', EVENT_TYPE_KEY[event.eventType])}`,
    description: <span>{event.resourceLabel} <code className="ml-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{event.action}</code></span>,
    date: formatDate(event.timestamp, locale),
    tone: event.status === 'failure' ? ('error' as const) : event.eventType === 'sensitiveAction' ? ('warning' as const) : ('default' as const),
  }));

  return <Page title={t('audit', 'activityTitle')} description={t('audit', 'activityDescription')}>
    {hiddenSensitiveCount > 0 && <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t('audit', 'noPermissionSensitive')}</p>}
    <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      <select value={user} onChange={(e) => setUser(e.target.value)} aria-label={t('audit', 'filterByUser')} className={selectClass}><option value="all">{t('audit', 'allUsers')}</option>{users.map((u) => <option key={u} value={u}>{u}</option>)}</select>
      <select value={module} onChange={(e) => { setModule(e.target.value); setAction('all'); }} aria-label={t('audit', 'filterByModule')} className={selectClass}><option value="all">{t('audit', 'allModules')}</option>{modules.map((m) => <option key={m} value={m}>{t('audit', AUDIT_MODULE_KEY[m as AuditModule] ?? m)}</option>)}</select>
      <select value={action} onChange={(e) => setAction(e.target.value)} aria-label={t('audit', 'filterByAction')} className={selectClass}><option value="all">{t('audit', 'allActions')}</option>{actions.map((a) => <option key={a} value={a}>{a}</option>)}</select>
      <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t('audit', 'filterByPeriod')} className={selectClass}><option value="all">{t('audit', 'allPeriods')}</option><option value="today">{t('audit', 'today')}</option><option value="week">{t('audit', 'week')}</option><option value="month">{t('audit', 'month')}</option><option value="quarter">{t('audit', 'quarter')}</option><option value="year">{t('audit', 'year')}</option></select>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('audit', 'filterByStatus')} className={selectClass}><option value="all">{t('audit', 'allStatuses')}</option><option value="success">{t('audit', 'statusSuccess')}</option><option value="failure">{t('audit', 'statusFailure')}</option></select>
    </div>
    <Card><CardContent className="p-5">{items.length ? <Timeline items={items} /> : <EmptyState icon={Activity} title={t('audit', 'noEvents')} />}</CardContent></Card>
  </Page>;
}

// ----------------------------------------------------------------------- Module entry

export function AuditModule() {
  const { t, locale } = useLocale();
  const typedLocale = locale as 'fr' | 'en';
  return (
    <Routes>
      <Route index element={<AuditOverview t={t} locale={typedLocale} />} />
      <Route path="overview" element={<AuditOverview t={t} locale={typedLocale} />} />
      <Route path="logs" element={<AuditLogs t={t} />} />
      <Route path="logs/:id" element={<AuditLogDetail t={t} locale={typedLocale} />} />
      <Route path="security-events" element={<SecurityEvents t={t} locale={typedLocale} />} />
      <Route path="activity" element={<ActivityPage t={t} locale={typedLocale} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
