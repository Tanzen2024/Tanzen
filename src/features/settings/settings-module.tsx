import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { Bell, Building2, CalendarDays, Cloud, Database, Eye, Globe2, KeyRound, Landmark, Lock, Mail, MapPin, Palette, Plug, Plus, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Webhook } from 'lucide-react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { PageHeader, DataTable, StatusBadge, EmptyState, FormSection, PermissionGate, ConfirmDialog, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { useTheme } from '@/contexts/theme-context';
import { usePermissions } from '@/contexts/permission-context';
import { NotFoundPage } from '@/routes';
import { organizationService } from '@/services/organization.service';
import { settingsService } from '@/services/settings.service';
import { deriveFiscalMeetings } from '@/services/meeting.service';
import { queryKeys } from '@/services/query-keys';
import { supportedLocales } from '@/i18n';
import type { FiscalYear, FiscalYearStatus } from '@/mocks/settings/fiscal-years';
import { isValidMeetingScheduleConfig, formatMeetingScheduleDescription, meetingFrequencyLabel, meetingRuleLabel, type MeetingScheduleConfig } from '@/mocks/settings/meeting-schedule';
import { MeetingScheduleFields } from './meeting-schedule-fields';
import { FiscalYearCreateDialog } from './fiscal-year-create-dialog';
import type { DateFormat, NumberFormatStyle } from '@/mocks/settings/localization-settings';
import type { NotificationChannel, NotificationChannelType, NotificationRule, NotificationRuleTrigger } from '@/mocks/settings/notification-settings';
import type { ModuleConfig, ModuleKey } from '@/mocks/settings/modules';
import type { PasswordPolicy, SessionPolicy, MfaPolicy, LoginPolicy } from '@/mocks/settings/security-policies';
import type { MfaMethod } from '@/mocks/access/users';
import type { Integration, IntegrationCategory, IntegrationStatus } from '@/mocks/settings/integrations';
import type { TableColumn, StatusTone } from '@/types/ui';
import { formatDate } from '@/lib/utils';
import { ValidationWorkflowsList, ValidationWorkflowCreate, ValidationWorkflowDetail, ValidationWorkflowEdit } from './settings-validation-workflows';

type T = (section: 'settings' | 'nav' | 'system', key: string, values?: Record<string, string>) => string;

const FY_STATUS_TONE: Record<FiscalYearStatus, StatusTone> = { open: 'success', closed: 'default', upcoming: 'info' };
const FY_STATUS_KEY: Record<FiscalYearStatus, string> = { open: 'statusOpen', closed: 'statusClosed', upcoming: 'statusUpcoming' };
const CHANNEL_KEY: Record<NotificationChannelType, string> = { email: 'channelEmail', sms: 'channelSms', push: 'channelPush', inApp: 'channelInApp' };
const TRIGGER_KEY: Record<NotificationRuleTrigger, string> = { loanOverdue: 'triggerLoanOverdue', applicationSubmitted: 'triggerApplicationSubmitted', workflowPending: 'triggerWorkflowPending', sessionRevoked: 'triggerSessionRevoked', memberJoined: 'triggerMemberJoined' };
const MODULE_LABEL_KEY: Record<ModuleKey, string> = { dashboard: 'moduleDashboard', organization: 'moduleOrganization', finance: 'moduleFinance', credit: 'moduleCredit', tontines: 'moduleTontines', operations: 'moduleOperations', accessSecurity: 'moduleAccessSecurity', audit: 'moduleAudit', settings: 'moduleSettings' };
const CATEGORY_KEY: Record<IntegrationCategory, string> = { api: 'categoryApi', storage: 'categoryStorage', sync: 'categorySync', external: 'categoryExternal' };
const CATEGORY_ICON: Record<IntegrationCategory, typeof Plug> = { api: Webhook, storage: Database, sync: RefreshCw, external: Cloud };
const INTEGRATION_STATUS_TONE: Record<IntegrationStatus, StatusTone> = { connected: 'success', disconnected: 'default', pending: 'warning' };
const INTEGRATION_STATUS_KEY: Record<IntegrationStatus, string> = { connected: 'statusConnected', disconnected: 'statusDisconnected', pending: 'statusPending' };
const MFA_METHODS: MfaMethod[] = ['authenticatorApp', 'securityKey', 'sms', 'email'];
const MFA_METHOD_KEY: Record<MfaMethod, string> = { authenticatorApp: 'mfaMethodAuthenticatorApp', securityKey: 'mfaMethodSecurityKey', sms: 'mfaMethodSms', email: 'mfaMethodEmail', none: 'mfaMethodNone' };

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="SETTINGS" title={title} description={description} actions={actions} />{children}</div>; }
function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Building2 }) { return <div className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div className="min-w-0"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 break-words text-sm font-medium" title={value}>{value}</p></div></div>; }

// ----------------------------------------------------------------------- Organization

function SettingsOrganization({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  const { data: tenant } = useQuery({ queryKey: queryKeys.tenants.detail(currentTenant.id), queryFn: () => organizationService.getTenant(currentTenant.id, currentTenant.id) });
  const { data: settings } = useQuery({ queryKey: queryKeys.settings.organization(currentTenant.id), queryFn: () => settingsService.getOrganizationSettings(currentTenant.id) });
  const [values, setValues] = useState<{ timezone: string; currency: string } | null>(null);
  useEffect(() => setValues(null), [currentTenant.id]);
  const mutation = useMockMutation<Awaited<ReturnType<typeof settingsService.updateOrganizationSettings>>, { timezone: string; currency: string }>({
    mutationFn: (patch) => settingsService.updateOrganizationSettings(currentTenant.id, patch),
    invalidateKeys: [queryKeys.settings.organization(currentTenant.id)],
    onSuccess: () => notify.success(t('settings', 'saved')),
  });
  if (!tenant) return null;
  const current = values ?? { timezone: settings?.timezone ?? '', currency: settings?.currency ?? '' };
  return <Page title={t('settings', 'organizationTitle')} description={t('settings', 'organizationDescription')}>
    <div className="grid gap-5 lg:grid-cols-2">
      <FormSection title={t('settings', 'generalInfo')} description={t('settings', 'organizationIdentityNotice')}><div className="space-y-4">
        <Info label={t('settings', 'name')} value={tenant.name} icon={Building2} />
        <Info label={t('settings', 'legalName')} value={tenant.legalName} icon={Building2} />
        <Info label={t('settings', 'country')} value={tenant.country} icon={MapPin} />
      </div></FormSection>
      <FormSection title={t('settings', 'contact')}><div className="space-y-4">
        <Info label={t('settings', 'email')} value={tenant.email} icon={Mail} />
        <Info label={t('settings', 'phone')} value={tenant.phone} icon={Building2} />
        <Info label={t('settings', 'address')} value={tenant.address} icon={MapPin} />
      </div></FormSection>
      <FormSection title={t('settings', 'general')}><div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="org-timezone">{t('settings', 'timezone')}</Label><Input id="org-timezone" value={current.timezone} onChange={(event) => setValues({ ...current, timezone: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="org-currency">{t('settings', 'currency')}</Label><Input id="org-currency" value={current.currency} onChange={(event) => setValues({ ...current, currency: event.target.value })} /></div>
      </div></FormSection>
      <div className="flex justify-end gap-2 lg:col-span-2"><PermissionGate permission="tenants.update"><Button disabled={mutation.isPending} onClick={() => mutation.mutate(current)}>{mutation.isPending ? t('settings', 'saving') : t('settings', 'save')}</Button></PermissionGate></div>
    </div>
  </Page>;
}

// ----------------------------------------------------------------------- Localization

function SettingsLocalization({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  const { locale, setLocale } = useLocale();
  const { data: settings } = useQuery({ queryKey: queryKeys.settings.localization(currentTenant.id), queryFn: () => settingsService.getLocalizationSettings(currentTenant.id) });
  const [values, setValues] = useState<{ timezone: string; currency: string; dateFormat: DateFormat; numberFormat: NumberFormatStyle } | null>(null);
  useEffect(() => setValues(null), [currentTenant.id]);
  const mutation = useMockMutation<Awaited<ReturnType<typeof settingsService.updateLocalizationSettings>>, NonNullable<typeof values>>({
    mutationFn: (patch) => settingsService.updateLocalizationSettings(currentTenant.id, patch),
    invalidateKeys: [queryKeys.settings.localization(currentTenant.id)],
    onSuccess: () => notify.success(t('settings', 'saved')),
  });
  const current = values ?? { timezone: settings?.timezone ?? '', currency: settings?.currency ?? '', dateFormat: settings?.dateFormat ?? 'DD/MM/YYYY', numberFormat: settings?.numberFormat ?? 'space' };
  return <Page title={t('settings', 'localizationTitle')} description={t('settings', 'localizationDescription')}>
    <div className="grid gap-5 lg:grid-cols-2">
      <FormSection title={t('settings', 'language')}><div className="flex flex-wrap gap-2">
        <Button variant={locale === 'fr' ? 'default' : 'outline'} aria-pressed={locale === 'fr'} onClick={() => setLocale('fr')}><Globe2 size={15} />{t('settings', 'french')}</Button>
        <Button variant={locale === 'en' ? 'default' : 'outline'} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}><Globe2 size={15} />{t('settings', 'english')}</Button>
      </div></FormSection>
      <FormSection title={t('settings', 'supportedLocales')}><div className="flex flex-wrap gap-2">{supportedLocales.map((code) => <StatusBadge key={code} label={code === 'fr' ? t('settings', 'french') : t('settings', 'english')} tone="success" />)}</div></FormSection>
      <FormSection title={t('settings', 'general')}><div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="loc-timezone">{t('settings', 'timezone')}</Label><Input id="loc-timezone" value={current.timezone} onChange={(event) => setValues({ ...current, timezone: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="loc-currency">{t('settings', 'currency')}</Label><Input id="loc-currency" value={current.currency} onChange={(event) => setValues({ ...current, currency: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="loc-date-format">{t('settings', 'dateFormat')}</Label><select id="loc-date-format" value={current.dateFormat} onChange={(event) => setValues({ ...current, dateFormat: event.target.value as DateFormat })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option></select></div>
        <div className="space-y-2"><Label htmlFor="loc-number-format">{t('settings', 'numberFormat')}</Label><select id="loc-number-format" value={current.numberFormat} onChange={(event) => setValues({ ...current, numberFormat: event.target.value as NumberFormatStyle })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="space">{t('settings', 'numberFormatSpace')}</option><option value="comma">{t('settings', 'numberFormatComma')}</option><option value="period">{t('settings', 'numberFormatPeriod')}</option></select></div>
      </div></FormSection>
      <div className="flex justify-end gap-2 lg:col-span-2"><PermissionGate permission="localization.manage"><Button disabled={mutation.isPending} onClick={() => mutation.mutate(current)}>{mutation.isPending ? t('settings', 'saving') : t('settings', 'save')}</Button></PermissionGate></div>
    </div>
  </Page>;
}

// ----------------------------------------------------------------------- Fiscal years

function SettingsFiscalYears({ t, locale }: { t: T; locale: 'fr' | 'en' }) {
  const { currentTenant } = useTenant();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const { data: years = [] } = useQuery({ queryKey: queryKeys.settings.fiscalYears(currentTenant.id), queryFn: () => settingsService.listFiscalYears(currentTenant.id) });
  const { data: reopenRequests = [] } = useQuery({ queryKey: queryKeys.settings.reopenRequests(currentTenant.id), queryFn: () => settingsService.listReopenRequests(currentTenant.id) });
  const current = years.find((year) => year.isCurrent);
  const pendingReopenByYearId = new Map(reopenRequests.filter((request) => request.status === 'pending' || request.status === 'inProgress').map((request) => [request.entityId, request]));
  const [closeTarget, setCloseTarget] = useState(false);
  const [openTarget, setOpenTarget] = useState<FiscalYear | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<FiscalYear | null>(null);
  const [reopenJustification, setReopenJustification] = useState('');
  const [reopenError, setReopenError] = useState<string | undefined>();
  /** Détail « Calendrier des réunions » d'un exercice (§11) — lecture + configuration si l'exercice n'est pas clôturé. */
  const [calendarTarget, setCalendarTarget] = useState<FiscalYear | null>(null);
  const [calendarDraft, setCalendarDraft] = useState<Partial<MeetingScheduleConfig>>({});
  /** Prorogation (mandat §6) — modifie uniquement `endDate`, jamais un indicateur de clôture. */
  const [extendTarget, setExtendTarget] = useState<FiscalYear | null>(null);
  const [extendEndDate, setExtendEndDate] = useState('');
  const [extendError, setExtendError] = useState<string | undefined>();
  useEffect(() => { setCloseTarget(false); setOpenTarget(null); setCreateOpen(false); setReopenTarget(null); setReopenError(undefined); setCalendarTarget(null); setExtendTarget(null); setExtendError(undefined); }, [currentTenant.id]);
  const closeMutation = useMockMutation<Awaited<ReturnType<typeof settingsService.closeCurrentFiscalYear>>, void>({
    mutationFn: () => settingsService.closeCurrentFiscalYear(currentTenant.id),
    invalidateKeys: [queryKeys.settings.fiscalYears(currentTenant.id), queryKeys.settings.currentFiscalYear(currentTenant.id)],
    onSuccess: (result) => {
      if (!result.ok) { notify.error(t('settings', result.reason === 'FINANCE_CLOSING_FAILED' ? 'closeFiscalYearFinanceFailed' : 'fiscalYearInvalid')); return; }
      const pendingTotal = result.pendingOperations.applications + result.pendingOperations.distributions + result.pendingOperations.transactions;
      notify.success(pendingTotal > 0 ? t('settings', 'fiscalYearClosedWithPending', { count: String(pendingTotal) }) : t('settings', 'fiscalYearClosed'));
      setCloseTarget(false);
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
  const openMutation = useMockMutation<Awaited<ReturnType<typeof settingsService.openFiscalYear>>, string>({
    mutationFn: (fiscalYearId) => settingsService.openFiscalYear(currentTenant.id, fiscalYearId),
    invalidateKeys: [queryKeys.settings.fiscalYears(currentTenant.id), queryKeys.settings.currentFiscalYear(currentTenant.id)],
    onSuccess: () => { notify.success(t('settings', 'fiscalYearOpened')); setOpenTarget(null); },
  });
  /** §24-BIS : soumet une DEMANDE de réouverture (WorkflowRequest, WD-005) — ne rouvre plus directement l'exercice. Le passage effectif CLOSED→OPEN n'intervient qu'après approbation, dans Operations > Workflows (settingsService.applyFiscalYearReopenDecision). */
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
  /** §2/§11 — configure / met à jour / retire le calendrier des réunions d'un exercice existant (autorisé tant qu'il n'est pas clôturé, cf. `updateFiscalYearMeetingSchedule`). */
  const meetingScheduleMutation = useMockMutation<Awaited<ReturnType<typeof settingsService.updateFiscalYearMeetingSchedule>>, { fiscalYearId: string; config: MeetingScheduleConfig | null }>({
    mutationFn: ({ fiscalYearId, config }) => settingsService.updateFiscalYearMeetingSchedule(currentTenant.id, fiscalYearId, config),
    invalidateKeys: [queryKeys.settings.fiscalYears(currentTenant.id), ['meetings']],
    onSuccess: (year, variables) => {
      if (!year) { notify.error(t('settings', 'fiscalYearInvalid')); return; }
      notify.success(t('settings', variables.config ? 'meetingScheduleSaved' : 'meetingScheduleRemoved'));
      setCalendarTarget(null);
    },
  });
  const openCalendar = (year: FiscalYear) => { setCalendarTarget(year); setCalendarDraft(year.meetingSchedule ?? {}); };
  const saveCalendar = () => { if (calendarTarget && isValidMeetingScheduleConfig(calendarDraft)) meetingScheduleMutation.mutate({ fiscalYearId: calendarTarget.id, config: calendarDraft }); };
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
    { key: 'label', header: t('settings', 'fiscalYear'), render: (row) => <span className="font-semibold">{row.label}</span> },
    { key: 'startDate', header: t('settings', 'startDate'), render: (row) => formatDate(row.startDate) },
    { key: 'endDate', header: t('settings', 'endDate'), render: (row) => formatDate(row.endDate) },
    { key: 'status', header: t('settings', 'status'), render: (row) => <div className="flex flex-col gap-1">
      <StatusBadge label={t('settings', FY_STATUS_KEY[row.status])} tone={FY_STATUS_TONE[row.status]} />
      {pendingReopenByYearId.has(row.id) && <StatusBadge label={t('settings', 'reopenPending')} tone="warning" />}
      {row.status === 'closed' && row.closedAt && <p className="text-[11px] text-muted-foreground">{t('settings', 'closedAtBy', { date: formatDate(row.closedAt), actor: row.closedBy ?? '—' })}</p>}
    </div> },
    { key: 'meetingSchedule', header: t('settings', 'meetingCalendar'), render: (row) => (
      <span className="text-xs text-muted-foreground">{row.meetingSchedule ? formatMeetingScheduleDescription(row.meetingSchedule, locale) : t('settings', 'noMeetingSchedule')}</span>
    ) },
    { key: 'actions', header: '', className: 'w-64', render: (row) => {
      const pendingRequest = pendingReopenByYearId.get(row.id);
      return <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => openCalendar(row)}><CalendarDays size={14} />{t('settings', 'viewMeetingCalendar')}</Button>
        {row.status !== 'closed' && <PermissionGate permission="fiscalYears.manage"><Button variant="ghost" size="sm" onClick={() => openExtend(row)}>{t('settings', 'extendFiscalYear')}</Button></PermissionGate>}
        {row.status === 'upcoming' && <PermissionGate permission="fiscalYears.manage"><Button variant="outline" size="sm" onClick={() => setOpenTarget(row)}>{t('settings', 'openFiscalYear')}</Button></PermissionGate>}
        {row.status === 'closed' && pendingRequest && <Button variant="outline" size="sm" onClick={() => navigate(`/operations/workflows/${pendingRequest.id}`)}><Eye size={14} />{t('settings', 'viewReopenRequest')}</Button>}
        {row.status === 'closed' && !pendingRequest && <PermissionGate permission="fiscalYears.manage"><Button variant="outline" size="sm" onClick={() => { setReopenTarget(row); setReopenJustification(''); setReopenError(undefined); }}><RotateCcw size={14} />{t('settings', 'requestReopenFiscalYear')}</Button></PermissionGate>}
      </div>;
    } },
  ];
  if (!can('fiscalYears.read')) {
    return <Page title={t('settings', 'fiscalYearsTitle')} description={t('settings', 'fiscalYearsDescription')}><EmptyState icon={Lock} title={t('system', 'unauthorizedTitle')} description={t('system', 'unauthorizedDescription')} /></Page>;
  }
  return <Page title={t('settings', 'fiscalYearsTitle')} description={t('settings', 'fiscalYearsDescription')} actions={<div className="flex gap-2">{current && <PermissionGate permission="fiscalYears.manage"><Button variant="outline" onClick={() => setCloseTarget(true)}>{t('settings', 'closeFiscalYear')}</Button></PermissionGate>}<PermissionGate permission="fiscalYears.manage"><Button onClick={() => setCreateOpen(true)}><Plus size={16} />{t('settings', 'createFiscalYear')}</Button></PermissionGate></div>}>
    {current && <Card className="border-primary/30 bg-primary/5"><CardContent className="flex items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Landmark size={20} /></span><div><p className="text-xs text-muted-foreground">{t('settings', 'currentFiscalYear')}</p><p className="text-lg font-semibold">{current.label}</p><p className="text-xs text-muted-foreground">{formatDate(current.startDate)} → {formatDate(current.endDate)}</p></div></CardContent></Card>}
    <Card><CardHeader><CardTitle className="text-sm">{t('settings', 'history')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={columns} rows={years} empty={<EmptyState icon={Landmark} title={t('settings', 'noFiscalYears')} />} /></CardContent></Card>
    {closeTarget && <ConfirmDialog open title={t('settings', 'closeFiscalYear')} description={t('settings', 'closeFiscalYearConfirm')} confirmLabel={t('settings', 'closeFiscalYear')} cancelLabel={t('settings', 'cancel')} onConfirm={() => closeMutation.mutate()} onCancel={() => setCloseTarget(false)} />}
    {openTarget && <ConfirmDialog open title={t('settings', 'openFiscalYear')} description={t('settings', 'openFiscalYearConfirm')} confirmLabel={t('settings', 'openFiscalYear')} cancelLabel={t('settings', 'cancel')} onConfirm={() => openMutation.mutate(openTarget.id)} onCancel={() => setOpenTarget(null)} />}
    <FiscalYearCreateDialog open={createOpen} onOpenChange={setCreateOpen} tenantId={currentTenant.id} years={years} />
    {reopenTarget && <ConfirmDialog open title={t('settings', 'requestReopenFiscalYear')} description={t('settings', 'requestReopenFiscalYearDescription', { label: reopenTarget.label })} confirmLabel={t('settings', 'submitReopenRequest')} cancelLabel={t('settings', 'cancel')} onConfirm={handleReopenRequest} onCancel={() => { setReopenTarget(null); setReopenJustification(''); setReopenError(undefined); }}>
      <div className="mt-4 space-y-1 text-left">
        <Label htmlFor="fy-reopen-justification">{t('settings', 'reopenJustificationLabel')}</Label>
        <Textarea id="fy-reopen-justification" value={reopenJustification} onChange={(event) => setReopenJustification(event.target.value)} aria-invalid={Boolean(reopenError)} />
        <FieldError message={reopenError} />
        <p className="text-xs text-muted-foreground">{t('settings', 'reopenApprovalNotice')}</p>
      </div>
    </ConfirmDialog>}
    {extendTarget && <ConfirmDialog open title={t('settings', 'extendFiscalYear')} description={t('settings', 'extendFiscalYearDescription', { label: extendTarget.label, current: formatDate(extendTarget.endDate) })} confirmLabel={t('settings', 'extendFiscalYear')} cancelLabel={t('settings', 'cancel')} onConfirm={handleExtend} onCancel={() => { setExtendTarget(null); setExtendEndDate(''); setExtendError(undefined); }}>
      <div className="mt-4 space-y-1 text-left">
        <Label htmlFor="fy-extend-end-date">{t('settings', 'newEndDate')}</Label>
        <Input id="fy-extend-end-date" type="date" value={extendEndDate} onChange={(event) => setExtendEndDate(event.target.value)} aria-invalid={Boolean(extendError)} />
        <FieldError message={extendError} />
      </div>
    </ConfirmDialog>}
    {calendarTarget && (() => {
      const editable = calendarTarget.status !== 'closed' && can('fiscalYears.manage');
      const previewSchedule = editable ? (isValidMeetingScheduleConfig(calendarDraft) ? calendarDraft : undefined) : calendarTarget.meetingSchedule;
      const meetings = deriveFiscalMeetings({ ...calendarTarget, meetingSchedule: previewSchedule });
      return <ConfirmDialog
        open
        title={`${t('settings', 'meetingCalendar')} — ${calendarTarget.label}`}
        description={t('settings', 'meetingCalendarDescription')}
        confirmLabel={editable ? t('settings', 'save') : t('settings', 'meetingCalendarClose')}
        cancelLabel={editable ? t('settings', 'cancel') : t('settings', 'meetingCalendarClose')}
        onConfirm={() => { if (editable) saveCalendar(); else setCalendarTarget(null); }}
        onCancel={() => setCalendarTarget(null)}
      >
        <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-left">
          {calendarTarget.status === 'closed' && <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t('settings', 'meetingScheduleClosedYearNotice')}</p>}
          {editable && <MeetingScheduleFields locale={locale} value={calendarDraft} onChange={setCalendarDraft} idPrefix="fy-calendar-meeting" />}
          {!editable && !calendarTarget.meetingSchedule && <p className="text-sm text-muted-foreground">{t('settings', 'noMeetingSchedule')}</p>}
          {previewSchedule && <>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-xs">
              <div><p className="text-muted-foreground">{t('settings', 'meetingCalFrequency')}</p><p className="font-medium">{meetingFrequencyLabel(previewSchedule.frequency, locale)}</p></div>
              <div><p className="text-muted-foreground">{t('settings', 'meetingCalRule')}</p><p className="font-medium">{previewSchedule.rule ? meetingRuleLabel(previewSchedule.rule, locale) : '—'}</p></div>
              <div className="col-span-2"><p className="text-muted-foreground">{t('settings', 'preview')}</p><p className="font-medium">{formatMeetingScheduleDescription(previewSchedule, locale)}</p></div>
              <div className="col-span-2"><p className="text-muted-foreground">{t('settings', 'meetingCalCount')}</p><p className="font-medium">{meetings.length}</p></div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-foreground">{t('settings', 'meetingCalDates')}</p>
              <div className="flex flex-wrap gap-1.5">
                {meetings.map((meeting) => <span key={meeting.id} className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium">{formatDate(meeting.date)}</span>)}
              </div>
            </div>
          </>}
          {editable && calendarTarget.meetingSchedule && <button type="button" onClick={() => meetingScheduleMutation.mutate({ fiscalYearId: calendarTarget.id, config: null })} className="text-xs font-medium text-destructive hover:underline">{t('settings', 'removeMeetingSchedule')}</button>}
        </div>
      </ConfirmDialog>;
    })()}
  </Page>;
}

// ----------------------------------------------------------------------- Branding

function SettingsBranding({ t }: { t: T }) {
  const { branding, setBranding } = useTheme();
  const [tenantName, setTenantName] = useState(branding.tenantName);
  const [logoLight, setLogoLight] = useState(branding.logoLight);
  const [logoDark, setLogoDark] = useState(branding.logoDark);
  const [primaryColor, setPrimaryColor] = useState(branding.primaryColor);
  const save = () => setBranding({ tenantName, logoLight, logoDark, primaryColor });
  return <Page title={t('settings', 'brandingTitle')} description={t('settings', 'brandingDescription')}>
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-5">
        <FormSection title={t('settings', 'organizationBrandingLabel')}><div className="space-y-2"><Label htmlFor="branding-name">{t('settings', 'organizationBrandingLabel')}</Label><Input id="branding-name" value={tenantName} onChange={(event) => setTenantName(event.target.value)} /></div></FormSection>
        <FormSection title={t('settings', 'logos')}><div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="branding-logo-light">{t('settings', 'logoLight')}</Label><Input id="branding-logo-light" value={logoLight} onChange={(event) => setLogoLight(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="branding-logo-dark">{t('settings', 'logoDark')}</Label><Input id="branding-logo-dark" value={logoDark} onChange={(event) => setLogoDark(event.target.value)} /></div>
        </div></FormSection>
        <FormSection title={t('settings', 'primaryColor')}><div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2"><Label htmlFor="branding-primary-color-swatch">{t('settings', 'primaryColor')}</Label><input id="branding-primary-color-swatch" type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} className="block size-10 cursor-pointer rounded-lg border border-input bg-transparent p-1" /></div>
          <div className="space-y-2"><Label htmlFor="branding-primary-color-text">{t('settings', 'primaryColorHex')}</Label><Input id="branding-primary-color-text" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} className="max-w-32 font-mono" /></div>
        </div></FormSection>
        <div className="flex justify-end"><PermissionGate permission="branding.manage"><Button onClick={save}><Palette size={15} />{t('settings', 'save')}</Button></PermissionGate></div>
      </div>
      <Card className="h-fit"><CardHeader><CardTitle className="text-sm">{t('settings', 'preview')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"><span className="grid size-10 place-items-center rounded-lg font-heading text-lg font-bold text-white" style={{ backgroundColor: primaryColor }}>{tenantName.charAt(0)}</span><div><p className="text-sm font-semibold">{tenantName}</p><p className="text-xs text-muted-foreground">TANZEN Enterprise</p></div></div>
        <div className="flex items-center gap-3 rounded-xl bg-[hsl(var(--sidebar))] p-4"><span className="grid size-9 place-items-center rounded-xl font-heading text-lg font-bold text-white" style={{ backgroundColor: primaryColor }}>T</span><p className="text-sm font-semibold text-white">{tenantName}</p></div>
        <Button style={{ backgroundColor: primaryColor }} className="text-white hover:opacity-90"><Sparkles size={15} />{t('settings', 'preview')}</Button>
      </CardContent></Card>
    </div>
  </Page>;
}

// ----------------------------------------------------------------------- Notifications (configuration)

function PreferencesTab({ t }: { t: T }) {
  const { user } = usePermissions();
  const { data: preferences = [] } = useQuery({ queryKey: queryKeys.settings.notificationPreferences(user.id), queryFn: () => settingsService.listNotificationPreferences(user.id) });
  const mutation = useMockMutation<Awaited<ReturnType<typeof settingsService.updateNotificationPreference>>, { trigger: NotificationRuleTrigger; channel: 'email' | 'push' | 'inApp'; value: boolean }>({
    mutationFn: ({ trigger, channel, value }) => settingsService.updateNotificationPreference(user.id, trigger, { [channel]: value }),
    invalidateKeys: [queryKeys.settings.notificationPreferences(user.id)],
    onSuccess: () => notify.success(t('settings', 'saved')),
  });
  const toggle = (trigger: NotificationRuleTrigger, channel: 'email' | 'push' | 'inApp', current: boolean) => mutation.mutate({ trigger, channel, value: !current });
  return <div className="space-y-3">{preferences.map((preference) => <Card key={preference.trigger}><CardContent className="flex flex-wrap items-center justify-between gap-4 p-4"><p className="text-sm font-medium">{t('settings', TRIGGER_KEY[preference.trigger])}</p><div className="flex items-center gap-5 text-xs text-muted-foreground">
    <PermissionGate permission="notificationSettings.manage" fallback={<span className="flex items-center gap-1.5">{t('settings', 'channelEmail')}<StatusBadge label={preference.email ? t('settings', 'enabled') : t('settings', 'disabled')} tone={preference.email ? 'success' : 'default'} /></span>}><label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-primary" checked={preference.email} onChange={() => toggle(preference.trigger, 'email', preference.email)} />{t('settings', 'channelEmail')}</label></PermissionGate>
    <PermissionGate permission="notificationSettings.manage" fallback={<span className="flex items-center gap-1.5">{t('settings', 'channelPush')}<StatusBadge label={preference.push ? t('settings', 'enabled') : t('settings', 'disabled')} tone={preference.push ? 'success' : 'default'} /></span>}><label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-primary" checked={preference.push} onChange={() => toggle(preference.trigger, 'push', preference.push)} />{t('settings', 'channelPush')}</label></PermissionGate>
    <PermissionGate permission="notificationSettings.manage" fallback={<span className="flex items-center gap-1.5">{t('settings', 'channelInApp')}<StatusBadge label={preference.inApp ? t('settings', 'enabled') : t('settings', 'disabled')} tone={preference.inApp ? 'success' : 'default'} /></span>}><label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-primary" checked={preference.inApp} onChange={() => toggle(preference.trigger, 'inApp', preference.inApp)} />{t('settings', 'channelInApp')}</label></PermissionGate>
  </div></CardContent></Card>)}</div>;
}

function ChannelsTab({ t, tenantId, channels }: { t: T; tenantId: string; channels: NotificationChannel[] }) {
  const mutation = useMockMutation<Awaited<ReturnType<typeof settingsService.updateNotificationChannel>>, { channelId: string; enabled: boolean }>({
    mutationFn: ({ channelId, enabled }) => settingsService.updateNotificationChannel(tenantId, channelId, enabled),
    invalidateKeys: [queryKeys.settings.notificationChannels(tenantId)],
    onSuccess: () => notify.success(t('settings', 'saved')),
  });
  const columns: TableColumn<NotificationChannel>[] = [
    { key: 'type', header: t('settings', 'channels'), render: (row) => <span className="font-medium">{t('settings', CHANNEL_KEY[row.type])}</span> },
    { key: 'destination', header: t('settings', 'destination') },
    { key: 'enabled', header: t('settings', 'enabled'), render: (row) => <PermissionGate permission="notificationSettings.manage" fallback={<StatusBadge label={row.enabled ? t('settings', 'enabled') : t('settings', 'disabled')} tone={row.enabled ? 'success' : 'default'} />}><Switch checked={row.enabled} aria-label={`${t('settings', 'enabled')} — ${t('settings', CHANNEL_KEY[row.type])} (${row.destination})`} onCheckedChange={(checked) => mutation.mutate({ channelId: row.id, enabled: checked })} /></PermissionGate> },
  ];
  return <DataTable columns={columns} rows={channels} empty={<EmptyState icon={Bell} title={t('settings', 'noModules')} />} />;
}

function RulesTab({ t, tenantId, rules }: { t: T; tenantId: string; rules: NotificationRule[] }) {
  const mutation = useMockMutation<Awaited<ReturnType<typeof settingsService.updateNotificationRule>>, { ruleId: string; enabled: boolean }>({
    mutationFn: ({ ruleId, enabled }) => settingsService.updateNotificationRule(tenantId, ruleId, enabled),
    invalidateKeys: [queryKeys.settings.notificationRules(tenantId)],
    onSuccess: () => notify.success(t('settings', 'saved')),
  });
  const columns: TableColumn<NotificationRule>[] = [
    { key: 'trigger', header: t('settings', 'rules'), render: (row) => <span className="font-medium">{t('settings', TRIGGER_KEY[row.trigger])}</span> },
    { key: 'channels', header: t('settings', 'channels'), render: (row) => <div className="flex flex-wrap gap-1">{row.channels.map((channel) => <span key={channel} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{t('settings', CHANNEL_KEY[channel])}</span>)}</div> },
    { key: 'enabled', header: t('settings', 'enabled'), render: (row) => <PermissionGate permission="notificationSettings.manage" fallback={<StatusBadge label={row.enabled ? t('settings', 'enabled') : t('settings', 'disabled')} tone={row.enabled ? 'success' : 'default'} />}><Switch checked={row.enabled} aria-label={`${t('settings', 'enabled')} — ${t('settings', TRIGGER_KEY[row.trigger])}`} onCheckedChange={(checked) => mutation.mutate({ ruleId: row.id, enabled: checked })} /></PermissionGate> },
  ];
  return <DataTable columns={columns} rows={rules} empty={<EmptyState icon={Bell} title={t('settings', 'noModules')} />} />;
}

function SettingsNotifications({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: channels = [] } = useQuery({ queryKey: queryKeys.settings.notificationChannels(currentTenant.id), queryFn: () => settingsService.listNotificationChannels(currentTenant.id) });
  const { data: rules = [] } = useQuery({ queryKey: queryKeys.settings.notificationRules(currentTenant.id), queryFn: () => settingsService.listNotificationRules(currentTenant.id) });
  return <Page title={t('settings', 'notificationsTitle')} description={t('settings', 'notificationsDescription')} actions={<Button variant="outline" onClick={() => navigate('/operations/notifications')}><Bell size={15} />{t('settings', 'goToInbox')}</Button>}>
    <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t('settings', 'configurationNotice')}</p>
    <Tabs defaultValue="preferences" className="min-w-0">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1"><TabsTrigger value="preferences">{t('settings', 'preferences')}</TabsTrigger><TabsTrigger value="channels">{t('settings', 'channels')}</TabsTrigger><TabsTrigger value="rules">{t('settings', 'rules')}</TabsTrigger></TabsList>
      <TabsContent value="preferences"><PreferencesTab t={t} /></TabsContent>
      <TabsContent value="channels"><ChannelsTab t={t} tenantId={currentTenant.id} channels={channels} /></TabsContent>
      <TabsContent value="rules"><RulesTab t={t} tenantId={currentTenant.id} rules={rules} /></TabsContent>
    </Tabs>
  </Page>;
}

// ----------------------------------------------------------------------- Security policies

function SettingsSecurityPolicies({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  const { data: passwordData } = useQuery({ queryKey: queryKeys.settings.passwordPolicy(currentTenant.id), queryFn: () => settingsService.getPasswordPolicy(currentTenant.id) });
  const { data: sessionData } = useQuery({ queryKey: queryKeys.settings.sessionPolicy(currentTenant.id), queryFn: () => settingsService.getSessionPolicy(currentTenant.id) });
  const { data: mfaData } = useQuery({ queryKey: queryKeys.settings.mfaPolicy(currentTenant.id), queryFn: () => settingsService.getMfaPolicy(currentTenant.id) });
  const { data: loginData } = useQuery({ queryKey: queryKeys.settings.loginPolicy(currentTenant.id), queryFn: () => settingsService.getLoginPolicy(currentTenant.id) });

  const [password, setPassword] = useState<Omit<PasswordPolicy, 'tenantId'> | null>(null);
  const [session, setSession] = useState<Omit<SessionPolicy, 'tenantId'> | null>(null);
  const [mfa, setMfa] = useState<Omit<MfaPolicy, 'tenantId'> | null>(null);
  const [login, setLogin] = useState<Omit<LoginPolicy, 'tenantId'> | null>(null);
  const [allowedIpRangesText, setAllowedIpRangesText] = useState<string | null>(null);
  useEffect(() => { setPassword(null); setSession(null); setMfa(null); setLogin(null); setAllowedIpRangesText(null); }, [currentTenant.id]);

  const currentPassword = password ?? passwordData;
  const currentSession = session ?? sessionData;
  const currentMfa = mfa ?? mfaData;
  const currentLogin = login ?? loginData;
  const currentAllowedIpRangesText = allowedIpRangesText ?? loginData?.allowedIpRanges.join(', ') ?? '';

  const mutation = useMockMutation<Awaited<ReturnType<typeof settingsService.updateSecurityPolicies>>, Parameters<typeof settingsService.updateSecurityPolicies>[1]>({
    mutationFn: (patch) => settingsService.updateSecurityPolicies(currentTenant.id, patch),
    invalidateKeys: [queryKeys.settings.passwordPolicy(currentTenant.id), queryKeys.settings.sessionPolicy(currentTenant.id), queryKeys.settings.mfaPolicy(currentTenant.id), queryKeys.settings.loginPolicy(currentTenant.id)],
    onSuccess: () => notify.success(t('settings', 'saved')),
  });

  const save = () => {
    if (!currentPassword || !currentSession || !currentMfa || !currentLogin) return;
    mutation.mutate({
      password: currentPassword,
      session: currentSession,
      mfa: currentMfa,
      login: { ...currentLogin, allowedIpRanges: currentAllowedIpRangesText.split(',').map((range) => range.trim()).filter(Boolean) },
    });
  };

  if (!currentPassword || !currentSession || !currentMfa || !currentLogin) return null;

  return <Page title={t('settings', 'securityTitle')} description={t('settings', 'securityDescription')}>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Lock size={15} />{t('settings', 'passwordPolicy')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="pwd-min-length">{t('settings', 'minLength')}</Label><Input id="pwd-min-length" type="number" min={0} value={currentPassword.minLength} onChange={(event) => setPassword({ ...currentPassword, minLength: Number(event.target.value) })} /></div>
        <div className="space-y-2"><Label htmlFor="pwd-expiry-days">{t('settings', 'expiryDays')}</Label><Input id="pwd-expiry-days" type="number" min={0} value={currentPassword.expiryDays} onChange={(event) => setPassword({ ...currentPassword, expiryDays: Number(event.target.value) })} /></div>
        <div className="space-y-2"><Label htmlFor="pwd-reuse-count">{t('settings', 'preventReuseCount')}</Label><Input id="pwd-reuse-count" type="number" min={0} value={currentPassword.preventReuseCount} onChange={(event) => setPassword({ ...currentPassword, preventReuseCount: Number(event.target.value) })} /></div>
        <div className="flex flex-col justify-center gap-2 pt-1">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={currentPassword.requireUppercase} onChange={(event) => setPassword({ ...currentPassword, requireUppercase: event.target.checked })} />{t('settings', 'requireUppercase')}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={currentPassword.requireNumber} onChange={(event) => setPassword({ ...currentPassword, requireNumber: event.target.checked })} />{t('settings', 'requireNumber')}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={currentPassword.requireSymbol} onChange={(event) => setPassword({ ...currentPassword, requireSymbol: event.target.checked })} />{t('settings', 'requireSymbol')}</label>
        </div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck size={15} />{t('settings', 'sessionPolicy')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="sess-idle-timeout">{t('settings', 'idleTimeout')}</Label><Input id="sess-idle-timeout" type="number" min={0} value={currentSession.idleTimeoutMinutes} onChange={(event) => setSession({ ...currentSession, idleTimeoutMinutes: Number(event.target.value) })} /></div>
        <div className="space-y-2"><Label htmlFor="sess-max-concurrent">{t('settings', 'maxConcurrentSessions')}</Label><Input id="sess-max-concurrent" type="number" min={1} value={currentSession.maxConcurrentSessions} onChange={(event) => setSession({ ...currentSession, maxConcurrentSessions: Number(event.target.value) })} /></div>
        <div className="space-y-2"><Label htmlFor="sess-remember-me">{t('settings', 'rememberMeDays')}</Label><Input id="sess-remember-me" type="number" min={0} value={currentSession.rememberMeDays} onChange={(event) => setSession({ ...currentSession, rememberMeDays: Number(event.target.value) })} /></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><KeyRound size={15} />{t('settings', 'mfaPolicy')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={currentMfa.enforced} onChange={(event) => setMfa({ ...currentMfa, enforced: event.target.checked })} />{t('settings', 'mfaEnforced')}</label>
        <div className="space-y-2"><Label htmlFor="mfa-grace-count">{t('settings', 'graceLoginCount')}</Label><Input id="mfa-grace-count" type="number" min={0} value={currentMfa.graceLoginCount} onChange={(event) => setMfa({ ...currentMfa, graceLoginCount: Number(event.target.value) })} className="max-w-40" /></div>
        <div><p className="mb-1.5 text-[11px] text-muted-foreground">{t('settings', 'allowedMethods')}</p><div className="flex flex-wrap gap-4">{MFA_METHODS.map((method) => <label key={method} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={currentMfa.allowedMethods.includes(method)} onChange={(event) => setMfa({ ...currentMfa, allowedMethods: event.target.checked ? [...currentMfa.allowedMethods, method] : currentMfa.allowedMethods.filter((item) => item !== method) })} />{t('settings', MFA_METHOD_KEY[method])}</label>)}</div></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck size={15} />{t('settings', 'loginPolicy')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="login-max-failed">{t('settings', 'maxFailedAttempts')}</Label><Input id="login-max-failed" type="number" min={1} value={currentLogin.maxFailedAttempts} onChange={(event) => setLogin({ ...currentLogin, maxFailedAttempts: Number(event.target.value) })} /></div>
        <div className="space-y-2"><Label htmlFor="login-lockout-minutes">{t('settings', 'lockoutMinutes')}</Label><Input id="login-lockout-minutes" type="number" min={0} value={currentLogin.lockoutMinutes} onChange={(event) => setLogin({ ...currentLogin, lockoutMinutes: Number(event.target.value) })} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="login-allowed-ips">{t('settings', 'allowedIpRanges')}</Label><Input id="login-allowed-ips" value={currentAllowedIpRangesText} onChange={(event) => setAllowedIpRangesText(event.target.value)} placeholder={t('settings', 'anyIp')} /></div>
      </CardContent></Card>
    </div>
    <div className="flex justify-end"><PermissionGate permission="securityPolicies.manage"><Button disabled={mutation.isPending} onClick={save}>{mutation.isPending ? t('settings', 'saving') : t('settings', 'save')}</Button></PermissionGate></div>
  </Page>;
}

// ----------------------------------------------------------------------- Modules

function SettingsModules({ t }: { t: T }) {
  const { currentTenant } = useTenant(); const { can } = usePermissions();
  const { data: modules = [] } = useQuery({ queryKey: queryKeys.settings.modules(currentTenant.id), queryFn: () => settingsService.listModules(currentTenant.id) });
  const [confirmKey, setConfirmKey] = useState<ModuleKey | null>(null);
  useEffect(() => setConfirmKey(null), [currentTenant.id]);
  const mutation = useMockMutation<Awaited<ReturnType<typeof settingsService.updateModule>>, { key: ModuleKey; enabled: boolean }>({
    mutationFn: ({ key, enabled }) => settingsService.updateModule(currentTenant.id, key, enabled),
    invalidateKeys: [queryKeys.settings.modules(currentTenant.id)],
    onSuccess: () => notify.success(t('settings', 'saved')),
  });
  const rows = modules.map((module_) => ({ ...module_, id: module_.key }));
  const applyToggle = (key: ModuleKey) => { const module_ = modules.find((item) => item.key === key); if (module_) mutation.mutate({ key, enabled: !module_.enabled }); };
  const requestToggle = (row: ModuleConfig) => row.enabled ? setConfirmKey(row.key) : applyToggle(row.key);
  const confirmTarget = rows.find((row) => row.key === confirmKey) ?? null;
  const columns: TableColumn<ModuleConfig & { id: string }>[] = [
    { key: 'name', header: t('settings', 'moduleName'), render: (row) => <span className="font-medium">{t('settings', MODULE_LABEL_KEY[row.key])}</span> },
    { key: 'visible', header: t('settings', 'visibleToYou'), render: (row) => row.requiredPermission === null ? <StatusBadge label={t('settings', 'alwaysVisible')} tone="info" /> : <StatusBadge label={can(row.requiredPermission) ? t('settings', 'visibleToYou') : t('settings', 'notVisibleToYou')} tone={can(row.requiredPermission) ? 'success' : 'default'} /> },
    { key: 'enabled', header: t('settings', 'enabled'), render: (row) => <PermissionGate permission="modules.manage" fallback={<StatusBadge label={row.enabled ? t('settings', 'enabled') : t('settings', 'disabled')} tone={row.enabled ? 'success' : 'default'} />}><Switch checked={row.enabled} aria-label={`${t('settings', 'enabled')} — ${t('settings', MODULE_LABEL_KEY[row.key])}`} onCheckedChange={() => requestToggle(row)} /></PermissionGate> },
  ];
  return <Page title={t('settings', 'modulesTitle')} description={t('settings', 'modulesDescription')}>
    <DataTable columns={columns} rows={rows} empty={<EmptyState icon={ShieldCheck} title={t('settings', 'noModules')} />} />
    <ConfirmDialog open={confirmTarget !== null} title={t('settings', 'disableModuleTitle')} description={confirmTarget ? t('settings', 'disableModuleDescription', { module: t('settings', MODULE_LABEL_KEY[confirmTarget.key]) }) : undefined} confirmLabel={t('settings', 'disableAction')} cancelLabel={t('settings', 'cancel')} onConfirm={() => { if (confirmKey) applyToggle(confirmKey); setConfirmKey(null); }} onCancel={() => setConfirmKey(null)} />
  </Page>;
}

// ----------------------------------------------------------------------- Integrations

function SettingsIntegrations({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  const { data: integrations = [] } = useQuery({ queryKey: queryKeys.settings.integrations(currentTenant.id), queryFn: () => settingsService.listIntegrations(currentTenant.id) });
  const groups = (['api', 'storage', 'sync', 'external'] as IntegrationCategory[]).map((category) => ({ category, items: integrations.filter((integration) => integration.category === category) }));
  return <Page title={t('settings', 'integrationsTitle')} description={t('settings', 'integrationsDescription')}>
    <div className="space-y-6">{groups.map(({ category, items }) => { const Icon = CATEGORY_ICON[category]; return items.length > 0 ? <div key={category}><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Icon size={16} className="text-primary" />{t('settings', CATEGORY_KEY[category])}</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((integration: Integration) => <Card key={integration.id}><CardContent className="space-y-3 p-5"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold">{integration.name}</p><StatusBadge label={t('settings', INTEGRATION_STATUS_KEY[integration.status])} tone={INTEGRATION_STATUS_TONE[integration.status]} /></div><p className="text-xs leading-5 text-muted-foreground">{integration.description}</p><p className="text-[11px] text-muted-foreground">{t('settings', 'lastSync')}: {integration.lastSyncAt ? formatDate(integration.lastSyncAt) : t('settings', 'never')}</p><PermissionGate permission="integrations.manage"><Button variant="outline" size="sm"><Plug size={14} />{t('settings', 'configure')}</Button></PermissionGate></CardContent></Card>)}</div></div> : null; })}</div>
  </Page>;
}

// ----------------------------------------------------------------------- Module entry

export function SettingsModule() {
  const { t, locale } = useLocale();
  const typedLocale = locale as 'fr' | 'en';
  return (
    <Routes>
      <Route index element={<SettingsOrganization t={t} />} />
      <Route path="organization" element={<SettingsOrganization t={t} />} />
      <Route path="localization" element={<SettingsLocalization t={t} />} />
      <Route path="fiscal-years" element={<SettingsFiscalYears t={t} locale={typedLocale} />} />
      <Route path="branding" element={<SettingsBranding t={t} />} />
      <Route path="notifications" element={<SettingsNotifications t={t} />} />
      <Route path="security-policies" element={<SettingsSecurityPolicies t={t} />} />
      <Route path="modules" element={<SettingsModules t={t} />} />
      <Route path="integrations" element={<SettingsIntegrations t={t} />} />
      <Route path="validation-workflows" element={<ValidationWorkflowsList t={t} />} />
      <Route path="validation-workflows/new" element={<ValidationWorkflowCreate t={t} />} />
      <Route path="validation-workflows/:id" element={<ValidationWorkflowDetail t={t} />} />
      <Route path="validation-workflows/:id/edit" element={<ValidationWorkflowEdit t={t} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
