/**
 * Paramètres → Exercices fiscaux — SEUL endroit d'administration des
 * exercices et de leurs séances (mandat « Caisse + exercice fiscal contexte
 * global », 2026-09-25). Fusionne l'ancien écran d'administration de
 * Paramètres (clôture, prorogation, réouverture, fréquence des séances) et
 * l'ancien sous-module Finance → Exercices fiscaux (liste, fiche, séances),
 * supprimé de Finance.
 *
 * Page d'ADMINISTRATION : elle n'est pas le point d'entrée opérationnel de
 * Finance — la navigation entre exercices passe par le sélecteur global du
 * header. UX calquée sur Tontines (Cycle → Tours) : liste → fiche → séances,
 * formulaire d'ajout de séance prérempli, jamais de précréation.
 *
 * Statut affiché : TOUJOURS `fiscalYearStatus()` (À venir / En cours / Clôturé).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, ChevronRight, Eye, Landmark, Lock, Plus, RotateCcw } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, StatusBadge, EmptyState, StatCard, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, ConfirmDialog, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { NotFoundPage } from '@/routes';
import { settingsService } from '@/services/settings.service';
import { fiscalSessionService, sessionTiming, type SessionTiming } from '@/services/fiscal-session.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { formatDate } from '@/lib/utils';
import { findCurrentFiscalYear, fiscalYearLabel, fiscalYearStatus, type FiscalYear } from '@/mocks/settings/fiscal-years';
import { isValidSessionScheduleConfig, formatSessionScheduleDescription, sessionFrequencyLabel, sessionRuleLabel, type SessionScheduleConfig } from '@/mocks/settings/session-schedule';
import type { FiscalSession } from '@/mocks/settings/fiscal-sessions';
import type { TableColumn } from '@/types/ui';
import { SessionScheduleFields } from './session-schedule-fields';
import { FiscalYearCreateDialog } from './fiscal-year-create-dialog';
import { FISCAL_YEAR_STATUS_KEY, FISCAL_YEAR_STATUS_TONE } from './fiscal-year-status';
import { sessionTransactionsPath } from '@/features/finance/finance-session-context';

type T = (section: 'settings' | 'finance' | 'nav' | 'system', key: string, values?: Record<string, string>) => string;

export const FISCAL_YEARS_PATH = '/settings/fiscal-years';

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="SETTINGS" title={title} description={description} actions={actions} />{children}</div>;
}
function Back({ label, to }: { label: string; to: string }) {
  const navigate = useNavigate();
  return <Button variant="ghost" size="sm" onClick={() => navigate(to)}><ArrowLeft size={15} />{label}</Button>;
}
function FiscalYearStatusBadge({ t, year }: { t: T; year: FiscalYear }) {
  const status = fiscalYearStatus(year);
  return <StatusBadge label={t('settings', FISCAL_YEAR_STATUS_KEY[status])} tone={FISCAL_YEAR_STATUS_TONE[status]} />;
}

// ----------------------------------------------------------------------- Liste (administration)

export function SettingsFiscalYears({ t, locale }: { t: T; locale: 'fr' | 'en' }) {
  const { currentTenant } = useTenant();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const { data: years = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.settings.fiscalYears(currentTenant.id), queryFn: () => settingsService.listFiscalYears(currentTenant.id), enabled: can('fiscalYears.read') });
  const { data: sessions = [] } = useQuery({ queryKey: queryKeys.finance.sessions.all(currentTenant.id), queryFn: () => fiscalSessionService.listAllSessions(currentTenant.id), enabled: can('fiscalYears.read') });
  const { data: reopenRequests = [] } = useQuery({ queryKey: queryKeys.settings.reopenRequests(currentTenant.id), queryFn: () => settingsService.listReopenRequests(currentTenant.id), enabled: can('fiscalYears.read') });
  const current = findCurrentFiscalYear(years);
  const pendingReopenByYearId = new Map(reopenRequests.filter((request) => request.status === 'pending' || request.status === 'inProgress').map((request) => [request.entityId, request]));
  /** Regroupement CLIENT-SIDE, jamais une requête par ligne (même principe que `TontinesTableSection`). */
  const sessionCountByYear = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of sessions) map.set(session.fiscalYearId, (map.get(session.fiscalYearId) ?? 0) + 1);
    return map;
  }, [sessions]);
  const [closeTarget, setCloseTarget] = useState<FiscalYear | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<FiscalYear | null>(null);
  const [reopenJustification, setReopenJustification] = useState('');
  const [reopenError, setReopenError] = useState<string | undefined>();
  /** Détail « Fréquence des séances » d'un exercice — lecture + configuration si l'exercice n'est pas clôturé. */
  const [calendarTarget, setCalendarTarget] = useState<FiscalYear | null>(null);
  const [calendarDraft, setCalendarDraft] = useState<Partial<SessionScheduleConfig>>({});
  /** Prorogation (mandat §6) — modifie uniquement `endDate`, jamais un indicateur de clôture. */
  const [extendTarget, setExtendTarget] = useState<FiscalYear | null>(null);
  const [extendEndDate, setExtendEndDate] = useState('');
  const [extendError, setExtendError] = useState<string | undefined>();
  useEffect(() => { setCloseTarget(null); setCreateOpen(false); setReopenTarget(null); setReopenError(undefined); setCalendarTarget(null); setExtendTarget(null); setExtendError(undefined); }, [currentTenant.id]);

  const closeMutation = useMockMutation<Awaited<ReturnType<typeof settingsService.closeFiscalYear>>, string>({
    mutationFn: (fiscalYearId) => settingsService.closeFiscalYear(currentTenant.id, fiscalYearId),
    invalidateKeys: [queryKeys.settings.fiscalYears(currentTenant.id), queryKeys.settings.currentFiscalYear(currentTenant.id)],
    onSuccess: (result) => {
      if (!result.ok) { notify.error(t('settings', result.reason === 'FINANCE_CLOSING_FAILED' ? 'closeFiscalYearFinanceFailed' : 'fiscalYearInvalid')); return; }
      const pendingTotal = result.pendingOperations.applications + result.pendingOperations.distributions + result.pendingOperations.transactions;
      notify.success(pendingTotal > 0 ? t('settings', 'fiscalYearClosedWithPending', { count: String(pendingTotal) }) : t('settings', 'fiscalYearClosed'));
      setCloseTarget(null);
    },
  });
  const extendMutation = useMockMutation<Awaited<ReturnType<typeof settingsService.extendFiscalYearEndDate>>, { fiscalYearId: string; newEndDate: string }>({
    mutationFn: ({ fiscalYearId, newEndDate }) => settingsService.extendFiscalYearEndDate(currentTenant.id, fiscalYearId, newEndDate),
    invalidateKeys: [queryKeys.settings.fiscalYears(currentTenant.id)],
    onSuccess: (result) => {
      if (!result.ok) {
        const key = result.reason === 'CLOSED' ? 'extendFiscalYearClosed' : result.reason === 'OVERLAPS_NEXT_YEAR' ? 'extendFiscalYearOverlap' : 'extendFiscalYearInvalid';
        setExtendError(t('settings', key));
        return;
      }
      notify.success(t('settings', 'extendFiscalYearSuccess'));
      setExtendTarget(null);
      setExtendEndDate('');
      setExtendError(undefined);
    },
  });
  /** §24-BIS : soumet une DEMANDE de réouverture (WorkflowRequest, WD-005) — la levée effective de la clôture n'intervient qu'après approbation, dans Operations > Workflows (settingsService.applyFiscalYearReopenDecision). */
  const reopenRequestMutation = useMockMutation<Awaited<ReturnType<typeof settingsService.requestFiscalYearReopen>>, { fiscalYearId: string; justification: string }>({
    mutationFn: ({ fiscalYearId, justification }) => settingsService.requestFiscalYearReopen(currentTenant.id, fiscalYearId, justification),
    invalidateKeys: [queryKeys.settings.reopenRequests(currentTenant.id)],
    onSuccess: (request) => {
      if (!request) { setReopenError(t('settings', 'reopenJustificationRequired')); return; }
      notify.success(t('settings', 'reopenRequestSubmitted'));
      setReopenTarget(null);
      setReopenJustification('');
      setReopenError(undefined);
    },
  });
  /** Configure / met à jour / retire la fréquence des séances d'un exercice (autorisé tant qu'il n'est pas clôturé, cf. `updateFiscalYearSessionSchedule`). */
  const sessionScheduleMutation = useMockMutation<Awaited<ReturnType<typeof settingsService.updateFiscalYearSessionSchedule>>, { fiscalYearId: string; config: SessionScheduleConfig | null }>({
    mutationFn: ({ fiscalYearId, config }) => settingsService.updateFiscalYearSessionSchedule(currentTenant.id, fiscalYearId, config),
    // La fréquence alimente la suggestion de prochaine séance : invalider celle de CHAQUE exercice (préfixe), sinon la fiche garde « — » en cache.
    invalidateKeys: [queryKeys.settings.fiscalYears(currentTenant.id), queryKeys.finance.sessions.nextAll(currentTenant.id)],
    onSuccess: (year, variables) => {
      if (!year) { notify.error(t('settings', 'fiscalYearInvalid')); return; }
      notify.success(t('settings', variables.config ? 'sessionScheduleSaved' : 'sessionScheduleRemoved'));
      setCalendarTarget(null);
    },
  });
  const openCalendar = (year: FiscalYear) => { setCalendarTarget(year); setCalendarDraft(year.sessionSchedule ?? {}); };
  const saveCalendar = () => { if (calendarTarget && isValidSessionScheduleConfig(calendarDraft)) sessionScheduleMutation.mutate({ fiscalYearId: calendarTarget.id, config: calendarDraft }); };
  const handleReopenRequest = () => {
    if (!reopenTarget) return;
    if (!reopenJustification.trim()) { setReopenError(t('settings', 'reopenJustificationRequired')); return; }
    setReopenError(undefined);
    reopenRequestMutation.mutate({ fiscalYearId: reopenTarget.id, justification: reopenJustification });
  };
  const openExtend = (year: FiscalYear) => { setExtendTarget(year); setExtendEndDate(year.endDate); setExtendError(undefined); };
  const handleExtend = () => {
    if (!extendTarget) return;
    if (!extendEndDate) { setExtendError(t('settings', 'fieldRequired')); return; }
    extendMutation.mutate({ fiscalYearId: extendTarget.id, newEndDate: extendEndDate });
  };

  const columns: TableColumn<FiscalYear>[] = [
    { key: 'label', header: t('settings', 'fiscalYear'), render: (row) => <span className="font-semibold">{fiscalYearLabel(row)}</span> },
    { key: 'period', header: t('settings', 'period'), render: (row) => <span className="text-xs text-muted-foreground">{formatDate(row.startDate)} → {formatDate(row.endDate)}</span> },
    { key: 'status', header: t('settings', 'status'), render: (row) => <div className="flex flex-col items-start gap-1">
      <FiscalYearStatusBadge t={t} year={row} />
      {pendingReopenByYearId.has(row.id) && <StatusBadge label={t('settings', 'reopenPending')} tone="warning" />}
      {row.isClosed && row.closedAt && <p className="text-[11px] text-muted-foreground">{t('settings', 'closedAtBy', { date: formatDate(row.closedAt), actor: row.closedBy ?? '—' })}</p>}
    </div> },
    { key: 'sessionsCount', header: t('finance', 'sessionsCountColumn'), render: (row) => String(sessionCountByYear.get(row.id) ?? 0) },
    { key: 'sessionSchedule', header: t('settings', 'sessionScheduleTitle'), render: (row) => (
      <span className="text-xs text-muted-foreground">{row.sessionSchedule ? formatSessionScheduleDescription(row.sessionSchedule, locale) : t('settings', 'noSessionSchedule')}</span>
    ) },
    { key: 'actions', header: '', className: 'w-72', render: (row) => {
      const status = fiscalYearStatus(row);
      const pendingRequest = pendingReopenByYearId.get(row.id);
      // Les actions ne doivent pas déclencher la navigation de ligne (fiche de l'exercice).
      return <div className="flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <Button variant="ghost" size="sm" onClick={() => openCalendar(row)}><CalendarDays size={14} />{t('settings', 'viewSessionSchedule')}</Button>
        {status !== 'closed' && <PermissionGate permission="fiscalYears.manage"><Button variant="ghost" size="sm" onClick={() => openExtend(row)}>{t('settings', 'extendFiscalYear')}</Button></PermissionGate>}
        {status === 'in_progress' && <PermissionGate permission="fiscalYears.manage"><Button variant="outline" size="sm" onClick={() => setCloseTarget(row)}>{t('settings', 'closeFiscalYear')}</Button></PermissionGate>}
        {status === 'closed' && pendingRequest && <Button variant="outline" size="sm" onClick={() => navigate(`/operations/workflows/${pendingRequest.id}`)}><Eye size={14} />{t('settings', 'viewReopenRequest')}</Button>}
        {status === 'closed' && !pendingRequest && <PermissionGate permission="fiscalYears.manage"><Button variant="outline" size="sm" onClick={() => { setReopenTarget(row); setReopenJustification(''); setReopenError(undefined); }}><RotateCcw size={14} />{t('settings', 'requestReopenFiscalYear')}</Button></PermissionGate>}
        {/* Flèche = vrai bouton de navigation vers la fiche (même route que le clic de ligne) : le conteneur des actions stoppe la propagation, une simple icône n'y réagissait jamais. */}
        <button type="button" onClick={() => navigate(`${FISCAL_YEARS_PATH}/${row.id}`)} aria-label={t('settings', 'viewFiscalYear', { label: fiscalYearLabel(row) })} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button>
      </div>;
    } },
  ];

  if (!can('fiscalYears.read')) {
    return <Page title={t('settings', 'fiscalYearsTitle')} description={t('settings', 'fiscalYearsDescription')}><EmptyState icon={Lock} title={t('system', 'unauthorizedTitle')} description={t('system', 'unauthorizedDescription')} /></Page>;
  }
  if (isLoading) return <Page title={t('settings', 'fiscalYearsTitle')} description={t('settings', 'fiscalYearsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('settings', 'fiscalYearsTitle')} description={t('settings', 'fiscalYearsDescription')}><ErrorState onRetry={refetch} /></Page>;

  return <Page title={t('settings', 'fiscalYearsTitle')} description={t('settings', 'fiscalYearsDescription')} actions={<PermissionGate permission="fiscalYears.manage"><Button onClick={() => setCreateOpen(true)}><Plus size={16} />{t('settings', 'createFiscalYear')}</Button></PermissionGate>}>
    {current && <Card className="border-primary/30 bg-primary/5"><CardContent className="flex items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Landmark size={20} /></span><div><p className="text-xs text-muted-foreground">{t('settings', 'currentFiscalYear')}</p><p className="text-lg font-semibold">{fiscalYearLabel(current)}</p><p className="text-xs text-muted-foreground">{formatDate(current.startDate)} → {formatDate(current.endDate)}</p></div></CardContent></Card>}
    <Card><CardHeader><CardTitle className="text-sm">{t('settings', 'history')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={columns} rows={years} empty={<EmptyState icon={Landmark} title={t('settings', 'noFiscalYears')} />} onRowClick={(row) => navigate(`${FISCAL_YEARS_PATH}/${row.id}`)} /></CardContent></Card>
    {closeTarget && <ConfirmDialog open title={`${t('settings', 'closeFiscalYear')} — ${fiscalYearLabel(closeTarget)}`} description={t('settings', 'closeFiscalYearConfirm')} confirmLabel={t('settings', 'closeFiscalYear')} cancelLabel={t('settings', 'cancel')} onConfirm={() => closeMutation.mutate(closeTarget.id)} onCancel={() => setCloseTarget(null)} />}
    <FiscalYearCreateDialog open={createOpen} onOpenChange={setCreateOpen} tenantId={currentTenant.id} years={years} />
    {reopenTarget && <ConfirmDialog open title={t('settings', 'requestReopenFiscalYear')} description={t('settings', 'requestReopenFiscalYearDescription', { label: fiscalYearLabel(reopenTarget) })} confirmLabel={t('settings', 'submitReopenRequest')} cancelLabel={t('settings', 'cancel')} onConfirm={handleReopenRequest} onCancel={() => { setReopenTarget(null); setReopenJustification(''); setReopenError(undefined); }}>
      <div className="mt-4 space-y-1 text-left">
        <Label htmlFor="fy-reopen-justification">{t('settings', 'reopenJustificationLabel')}</Label>
        <Textarea id="fy-reopen-justification" value={reopenJustification} onChange={(event) => setReopenJustification(event.target.value)} aria-invalid={Boolean(reopenError)} />
        <FieldError message={reopenError} />
        <p className="text-xs text-muted-foreground">{t('settings', 'reopenApprovalNotice')}</p>
      </div>
    </ConfirmDialog>}
    {extendTarget && <ConfirmDialog open title={t('settings', 'extendFiscalYear')} description={t('settings', 'extendFiscalYearDescription', { label: fiscalYearLabel(extendTarget), current: formatDate(extendTarget.endDate) })} confirmLabel={t('settings', 'extendFiscalYear')} cancelLabel={t('settings', 'cancel')} onConfirm={handleExtend} onCancel={() => { setExtendTarget(null); setExtendEndDate(''); setExtendError(undefined); }}>
      <div className="mt-4 space-y-1 text-left">
        <Label htmlFor="fy-extend-end-date">{t('settings', 'newEndDate')}</Label>
        <Input id="fy-extend-end-date" type="date" value={extendEndDate} onChange={(event) => setExtendEndDate(event.target.value)} aria-invalid={Boolean(extendError)} />
        <FieldError message={extendError} />
      </div>
    </ConfirmDialog>}
    {calendarTarget && (() => {
      const editable = !calendarTarget.isClosed && can('fiscalYears.manage');
      const previewSchedule = editable ? (isValidSessionScheduleConfig(calendarDraft) ? calendarDraft : undefined) : calendarTarget.sessionSchedule;
      return <ConfirmDialog
        open
        title={`${t('settings', 'sessionScheduleTitle')} — ${fiscalYearLabel(calendarTarget)}`}
        description={t('settings', 'sessionScheduleDescription')}
        confirmLabel={editable ? t('settings', 'save') : t('settings', 'sessionScheduleClose')}
        cancelLabel={editable ? t('settings', 'cancel') : t('settings', 'sessionScheduleClose')}
        onConfirm={() => { if (editable) saveCalendar(); else setCalendarTarget(null); }}
        onCancel={() => setCalendarTarget(null)}
      >
        <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-left">
          {calendarTarget.isClosed && <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t('settings', 'sessionScheduleClosedYearNotice')}</p>}
          {editable && <SessionScheduleFields locale={locale} value={calendarDraft} onChange={setCalendarDraft} idPrefix="fy-calendar-session" />}
          {!editable && !calendarTarget.sessionSchedule && <p className="text-sm text-muted-foreground">{t('settings', 'noSessionSchedule')}</p>}
          {previewSchedule && <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-xs">
            <div><p className="text-muted-foreground">{t('settings', 'sessionScheduleFrequency')}</p><p className="font-medium">{sessionFrequencyLabel(previewSchedule.frequency, locale)}</p></div>
            <div><p className="text-muted-foreground">{t('settings', 'sessionScheduleRule')}</p><p className="font-medium">{previewSchedule.rule ? sessionRuleLabel(previewSchedule.rule, locale) : '—'}</p></div>
            <div className="col-span-2"><p className="text-muted-foreground">{t('settings', 'preview')}</p><p className="font-medium">{formatSessionScheduleDescription(previewSchedule, locale)}</p></div>
          </div>}
          {editable && calendarTarget.sessionSchedule && <button type="button" onClick={() => sessionScheduleMutation.mutate({ fiscalYearId: calendarTarget.id, config: null })} className="text-xs font-medium text-destructive hover:underline">{t('settings', 'removeSessionSchedule')}</button>}
        </div>
      </ConfirmDialog>;
    })()}
  </Page>;
}

// ----------------------------------------------------------------------- Séances d'un exercice

/** État AFFICHÉ d'une séance (décision 2 du mandat « Gestion des séances ») — calculé depuis sa date, jamais stocké. */
const SESSION_TIMING_LABEL_KEY: Record<SessionTiming, string> = { upcoming: 'sessionTimingUpcoming', today: 'sessionTimingToday', past: 'sessionTimingPast' };
const SESSION_TIMING_TONE: Record<SessionTiming, 'info' | 'warning' | 'default'> = { upcoming: 'info', today: 'warning', past: 'default' };
function SessionTimingBadge({ t, date }: { t: T; date: string }) {
  const timing = sessionTiming(date);
  return <StatusBadge label={t('finance', SESSION_TIMING_LABEL_KEY[timing])} tone={SESSION_TIMING_TONE[timing]} />;
}

/** `YYYY-MM-DD` + 1 jour (UTC, sans dérive de fuseau). */
function dayAfter(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Section « Séances » — pendant direct de `OccurrenceSection` (Tours de
 * Tontine) : séances déjà créées + formulaire d'ajout prérempli par
 * `suggestNextSessionDate` (simple prévision). Ouvrir le formulaire ne crée
 * rien — seule la validation appelle `createSession`, qui applique les règles
 * métier (exercice non clôturé, date dans l'exercice, strictement après la
 * dernière séance, numéro unique). L'UI ne fait qu'expliquer un refus.
 */
function SessionsSection({ t, fiscalYear }: { t: T; fiscalYear: FiscalYear }) {
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const { data: sessions = [] } = useQuery({ queryKey: queryKeys.finance.sessions.list(currentTenant.id, fiscalYear.id), queryFn: () => fiscalSessionService.listSessions(currentTenant.id, fiscalYear.id) });
  const { data: suggested } = useQuery({ queryKey: queryKeys.finance.sessions.next(currentTenant.id, fiscalYear.id), queryFn: () => fiscalSessionService.suggestNextSessionDate(currentTenant.id, fiscalYear.id) });
  const [date, setDate] = useState('');
  const effectiveDate = date || suggested || '';
  const canAdd = !fiscalYear.isClosed;
  const lastDate = sessions.length > 0 ? sessions[sessions.length - 1].date : undefined;
  const minDate = lastDate && dayAfter(lastDate) > fiscalYear.startDate ? dayAfter(lastDate) : fiscalYear.startDate;
  const addMutation = useMockMutation<Awaited<ReturnType<typeof fiscalSessionService.createSession>>, void>({
    mutationFn: () => fiscalSessionService.createSession(currentTenant.id, fiscalYear.id, effectiveDate),
    invalidateKeys: [queryKeys.finance.sessions.list(currentTenant.id, fiscalYear.id), queryKeys.finance.sessions.next(currentTenant.id, fiscalYear.id), queryKeys.finance.sessions.all(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('finance', lastDate && effectiveDate <= lastDate ? 'sessionDateNotAfterLast' : 'sessionAddFailed', { date: lastDate ? formatDate(lastDate) : '' })); return; }
      notify.success(t('finance', 'sessionAdded')); setDate('');
    },
  });
  return <div className="space-y-3">
    <div className="space-y-2">
      {sessions.map((session: FiscalSession) => (
        <button key={session.id} type="button" onClick={() => navigate(sessionTransactionsPath(session.id))} className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted">
          <span className="font-mono text-xs text-muted-foreground">#{session.sessionNumber}</span>
          <span className="flex-1">{formatDate(session.date)}</span>
          <SessionTimingBadge t={t} date={session.date} />
          <ChevronRight size={14} />
        </button>
      ))}
      {sessions.length === 0 && <p className="text-xs text-muted-foreground">{t('finance', 'noSessions')}</p>}
    </div>
    {canAdd && <PermissionGate permission="fiscalYears.manage">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label htmlFor={`session-date-${fiscalYear.id}`}>{t('finance', 'sessionDateLabel')}</Label><Input id={`session-date-${fiscalYear.id}`} type="date" min={minDate} max={fiscalYear.endDate} value={effectiveDate} onChange={(event) => setDate(event.target.value)} /></div>
        <Button size="sm" disabled={!effectiveDate || addMutation.isPending} onClick={() => addMutation.mutate()}><Plus size={14} />{t('finance', 'addSession')}</Button>
      </div>
    </PermissionGate>}
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

  if (isLoading) return <Page title={t('finance', 'fiscalYearDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'fiscalYearDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!fiscalYear) return <NotFoundPage />;

  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : undefined;

  return <Page title={fiscalYearLabel(fiscalYear)} description={`${formatDate(fiscalYear.startDate)} → ${formatDate(fiscalYear.endDate)}`} actions={<Back label={t('finance', 'backToFiscalYears')} to={FISCAL_YEARS_PATH} />}>
    <div className="flex items-center gap-2"><FiscalYearStatusBadge t={t} year={fiscalYear} /></div>
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

/**
 * Ancienne URL `/settings/fiscal-years/:id/sessions/:sessionId` (favoris, liens
 * partagés) : il n'existe plus de page séance — une séance se consulte dans
 * Finance → Trésorerie → Transactions, filtre « Date de séance » positionné
 * (`sessionTransactionsPath`). La séance y est revalidée dans le tenant courant.
 */
export function LegacySessionRedirect() {
  const { sessionId = '' } = useParams();
  return <Navigate to={sessionTransactionsPath(sessionId)} replace />;
}
