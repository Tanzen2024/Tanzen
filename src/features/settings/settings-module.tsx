import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { Bell, Building2, Cloud, Database, Globe2, KeyRound, Lock, Mail, MapPin, Plug, RefreshCw, ShieldCheck, Sparkles, Webhook } from 'lucide-react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { PageHeader, DataTable, StatusBadge, EmptyState, PermissionGate, ConfirmDialog } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { useTheme } from '@/contexts/theme-context';
import { usePermissions } from '@/contexts/permission-context';
import { NotFoundPage, PermissionRoute, RouteLoadingFallback } from '@/routes';
import { organizationService } from '@/services/organization.service';
import { settingsService } from '@/services/settings.service';
import { queryKeys } from '@/services/query-keys';
import { supportedLocales } from '@/i18n';
import { SettingsFiscalYears, FiscalYearDetail, LegacySessionRedirect } from './settings-fiscal-years';
import type { DateFormat, OrganizationSettings } from '@/mocks/settings/organization-settings';
import { DEFAULT_CURRENCY_CODE, currencies, getCurrencyDisplayLabel, getCurrencyLabel } from '@/constants/currencies';
import { DECIMAL_SEPARATORS, THOUSANDS_SEPARATORS, formatNumberWith, isRegionalFormatValid, resolveRegionalFormat } from '@/lib/number-format';
import type { NotificationChannel, NotificationChannelType, NotificationRule, NotificationRuleTrigger } from '@/mocks/settings/notification-settings';
import type { ModuleConfig, ModuleKey } from '@/mocks/settings/modules';
import type { PasswordPolicy, SessionPolicy, MfaPolicy, LoginPolicy } from '@/mocks/settings/security-policies';
import type { MfaMethod } from '@/mocks/access/users';
import type { Integration, IntegrationCategory, IntegrationStatus } from '@/mocks/settings/integrations';
import type { TableColumn, StatusTone } from '@/types/ui';
import { formatDate } from '@/lib/utils';
import { ValidationWorkflowsList, ValidationWorkflowCreate, ValidationWorkflowDetail, ValidationWorkflowEdit } from './settings-validation-workflows';

/**
 * Règles de crédit : administrées ici (Paramètres → Règles de crédit) depuis le
 * mandat « Simplification du module Caisses » (2026-09-25). Les écrans restent
 * dans le domaine Finance (chargé à la demande pour ne pas alourdir le chunk
 * Paramètres).
 */
const LoanRulesRoutes = lazy(() => import('@/features/finance').then((m) => ({ default: m.LoanRulesRoutes })));

type T = (section: 'settings' | 'nav' | 'system', key: string, values?: Record<string, string>) => string;

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

/** Champs éditables de Paramètres → Organisation (tout sauf l'identifiant du tenant). */
type OrganizationForm = Omit<OrganizationSettings, 'tenantId'>;
const DATE_FORMATS: DateFormat[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const THOUSANDS_LABEL_KEY = { space: 'numberFormatSpace', comma: 'numberFormatComma', period: 'numberFormatPeriod' } as const;
const DECIMAL_LABEL_KEY = { comma: 'decimalSeparatorComma', period: 'decimalSeparatorPeriod' } as const;

/**
 * Paramètres → Organisation = CONFIGURATION DE L'ASSOCIATION (mandat « Format régional »,
 * 2026-09-26) : identité, langue, fuseau, format de date et FORMAT RÉGIONAL (devise,
 * séparateurs). L'ancienne page Localisation, qui dupliquait fuseau/devise sans effet sur
 * l'affichage, a été fusionnée ici puis supprimée. Valeurs par défaut : XAF, espace, virgule.
 */
function SettingsOrganization({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  const { locale, setLocale } = useLocale();
  const { can } = usePermissions();
  const { branding, setBranding } = useTheme();
  const { data: tenant } = useQuery({ queryKey: queryKeys.tenants.detail(currentTenant.id), queryFn: () => organizationService.getTenant(currentTenant.id, currentTenant.id) });
  const { data: settings } = useQuery({ queryKey: queryKeys.settings.organization(currentTenant.id), queryFn: () => settingsService.getOrganizationSettings(currentTenant.id) });
  const [values, setValues] = useState<OrganizationForm | null>(null);
  const [brandingDraft, setBrandingDraft] = useState<BrandingForm | null>(null);
  useEffect(() => setValues(null), [currentTenant.id]);
  const mutation = useMockMutation<Awaited<ReturnType<typeof settingsService.updateOrganizationSettings>>, OrganizationForm>({
    mutationFn: (patch) => settingsService.updateOrganizationSettings(currentTenant.id, patch),
    invalidateKeys: [queryKeys.settings.organization(currentTenant.id)],
    onSuccess: (saved) => { if (!saved) { notify.error(t('settings', 'regionalFormatInvalid')); return; } notify.success(t('settings', 'saved')); setValues(null); },
  });
  if (!tenant) return null;
  const regional = resolveRegionalFormat(settings);
  const current: OrganizationForm = values ?? { timezone: settings?.timezone ?? '', currency: settings?.currency ?? DEFAULT_CURRENCY_CODE, dateFormat: settings?.dateFormat ?? 'DD/MM/YYYY', thousandsSeparator: regional.thousandsSeparator, decimalSeparator: regional.decimalSeparator };
  const set = (patch: Partial<OrganizationForm>) => setValues({ ...current, ...patch });
  const brandingValues: BrandingForm = brandingDraft ?? { tenantName: branding.tenantName, logoLight: branding.logoLight, logoDark: branding.logoDark, primaryColor: branding.primaryColor };
  const setBrandingField = (patch: Partial<BrandingForm>) => setBrandingDraft({ ...brandingValues, ...patch });
  const formatValid = isRegionalFormatValid(current);
  const canSaveOrganization = can('tenants.update');
  const canSaveBranding = can('branding.manage');
  const selectClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
  // Aperçu calculé avec le format EN COURS DE SAISIE (pas encore enregistré) — même fonction que tout l'affichage.
  const preview = formatValid ? `${formatNumberWith(1234567.89, current, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${getCurrencyDisplayLabel(current.currency)}` : '—';
  /**
   * UN SEUL « Enregistrer » pour la page : chaque partie reste enregistrée dans SON stockage et
   * sous SA permission — paramètres d'organisation (`tenants.update`, service) et identité
   * visuelle (`branding.manage`, ThemeContext). « Annuler » abandonne les deux brouillons.
   */
  const save = () => {
    if (canSaveBranding) { setBranding(brandingValues); setBrandingDraft(null); }
    if (canSaveOrganization) mutation.mutate(current);
    else notify.success(t('settings', 'saved'));
  };
  const cancel = () => { setValues(null); setBrandingDraft(null); };
  return <Page title={t('settings', 'organizationTitle')} description={t('settings', 'organizationDescription')}>
    <section aria-labelledby="organization-general-title" className="space-y-3">
      <SectionHeading id="organization-general-title" title={t('settings', 'generalInfo')} description={t('settings', 'regionalFormatDescription')} />
      <Card><CardContent className="space-y-6 p-5 sm:p-6">
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2" data-testid="regional-format">
          <div className="space-y-2"><Label htmlFor="org-name">{t('settings', 'organizationName')}</Label><Input id="org-name" value={tenant.name} readOnly aria-describedby="org-name-notice" className="bg-muted/40" /><p id="org-name-notice" className="text-xs text-muted-foreground">{t('settings', 'organizationIdentityNotice')}</p></div>
          <div className="space-y-2"><Label htmlFor="org-currency">{t('settings', 'currency')}</Label><select id="org-currency" value={current.currency} onChange={(event) => set({ currency: event.target.value })} className={selectClass}>{currencies.map((currency) => <option key={currency.code} value={currency.code}>{`${getCurrencyLabel(currency.code, locale === 'en' ? 'en' : 'fr')} (${currency.code})`}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="org-thousands-separator">{t('settings', 'thousandsSeparator')}</Label><select id="org-thousands-separator" value={current.thousandsSeparator} onChange={(event) => set({ thousandsSeparator: event.target.value as OrganizationForm['thousandsSeparator'] })} className={selectClass}>{THOUSANDS_SEPARATORS.map((separator) => <option key={separator} value={separator}>{t('settings', THOUSANDS_LABEL_KEY[separator])}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="org-decimal-separator">{t('settings', 'decimalSeparator')}</Label><select id="org-decimal-separator" value={current.decimalSeparator} onChange={(event) => set({ decimalSeparator: event.target.value as OrganizationForm['decimalSeparator'] })} className={selectClass}>{DECIMAL_SEPARATORS.map((separator) => <option key={separator} value={separator}>{t('settings', DECIMAL_LABEL_KEY[separator])}</option>)}</select></div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-sm md:col-span-2"><span className="text-muted-foreground">{t('settings', 'regionalFormatPreview')}</span><span className="font-medium tabular-nums" data-testid="regional-format-preview">{preview}</span></div>
          {!formatValid && <p role="alert" className="text-xs text-destructive md:col-span-2">{t('settings', 'regionalFormatSameSeparator')}</p>}
        </div>
        <div className="grid gap-x-6 gap-y-4 border-t border-border pt-6 md:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="org-timezone">{t('settings', 'timezone')}</Label><Input id="org-timezone" value={current.timezone} onChange={(event) => set({ timezone: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="org-date-format">{t('settings', 'dateFormat')}</Label><select id="org-date-format" value={current.dateFormat} onChange={(event) => set({ dateFormat: event.target.value as DateFormat })} className={selectClass}>{DATE_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}</select></div>
          <div className="space-y-2"><p className="text-sm font-medium leading-none">{t('settings', 'language')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={locale === 'fr' ? 'default' : 'outline'} aria-pressed={locale === 'fr'} onClick={() => setLocale('fr')}><Globe2 size={14} />{t('settings', 'french')}</Button>
              <Button size="sm" variant={locale === 'en' ? 'default' : 'outline'} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}><Globe2 size={14} />{t('settings', 'english')}</Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('settings', 'supportedLocales')} : {supportedLocales.map((code) => (code === 'fr' ? t('settings', 'french') : t('settings', 'english'))).join(', ')}</p>
          </div>
        </div>
        <div className="grid gap-4 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-5">
          <Info label={t('settings', 'legalName')} value={tenant.legalName} icon={Building2} />
          <Info label={t('settings', 'country')} value={tenant.country} icon={MapPin} />
          <div className="space-y-3 sm:col-span-2 lg:col-span-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('settings', 'contact')}</h3><div className="grid gap-4 sm:grid-cols-3">
            <Info label={t('settings', 'email')} value={tenant.email} icon={Mail} />
            <Info label={t('settings', 'phone')} value={tenant.phone} icon={Building2} />
            <Info label={t('settings', 'address')} value={tenant.address} icon={MapPin} />
          </div></div>
        </div>
      </CardContent></Card>
    </section>
    <OrganizationBrandingSection t={t} values={brandingValues} onChange={setBrandingField} />
    {(canSaveOrganization || canSaveBranding) && <div className="flex justify-end gap-2 border-t border-border pt-5">
      <Button variant="outline" disabled={mutation.isPending} onClick={cancel}>{t('settings', 'cancel')}</Button>
      <Button disabled={mutation.isPending || !formatValid} onClick={save}>{mutation.isPending ? t('settings', 'saving') : t('settings', 'save')}</Button>
    </div>}
  </Page>;
}

function SectionHeading({ id, title, description }: { id: string; title: string; description?: string }) {
  return <div><h2 id={id} className="font-heading text-base font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>;
}

// ----------------------------------------------------------------------- Branding

type BrandingForm = { tenantName: string; logoLight: string; logoDark: string; primaryColor: string };

/**
 * Section « Identité visuelle » de Paramètres → Organisation (ancienne page Paramètres →
 * Identité visuelle, fusionnée le 2026-09-27). Identité du TENANT uniquement (ThemeContext :
 * nom affiché, logos, couleur principale) — le branding TANZEN du sidebar n'est pas concerné.
 * Composant contrôlé : le brouillon et l'enregistrement (bouton unique de la page, sous
 * `branding.manage`) sont portés par `SettingsOrganization`.
 */
function OrganizationBrandingSection({ t, values, onChange }: { t: T; values: BrandingForm; onChange: (patch: Partial<BrandingForm>) => void }) {
  const { tenantName, logoLight, logoDark, primaryColor } = values;
  const subheading = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  return <section aria-labelledby="organization-branding-title" data-testid="organization-branding" className="space-y-3">
    <SectionHeading id="organization-branding-title" title={t('settings', 'brandingTitle')} description={t('settings', 'brandingDescription')} />
    <Card className="overflow-hidden"><div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
      <div className="space-y-6 p-5 sm:p-6">
        <div className="space-y-2"><Label htmlFor="branding-name">{t('settings', 'organizationBrandingLabel')}</Label><Input id="branding-name" value={tenantName} onChange={(event) => onChange({ tenantName: event.target.value })} /></div>
        <div className="space-y-3 border-t border-border pt-6"><h3 className={subheading}>{t('settings', 'logos')}</h3><div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="branding-logo-light">{t('settings', 'logoLight')}</Label><Input id="branding-logo-light" value={logoLight} onChange={(event) => onChange({ logoLight: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="branding-logo-dark">{t('settings', 'logoDark')}</Label><Input id="branding-logo-dark" value={logoDark} onChange={(event) => onChange({ logoDark: event.target.value })} /></div>
        </div></div>
        <div className="flex flex-wrap items-end gap-4 border-t border-border pt-6">
          <div className="space-y-2"><Label htmlFor="branding-primary-color-swatch">{t('settings', 'primaryColor')}</Label><input id="branding-primary-color-swatch" type="color" value={primaryColor} onChange={(event) => onChange({ primaryColor: event.target.value })} className="block h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1" /></div>
          <div className="space-y-2"><Label htmlFor="branding-primary-color-text">{t('settings', 'primaryColorHex')}</Label><Input id="branding-primary-color-text" value={primaryColor} onChange={(event) => onChange({ primaryColor: event.target.value })} className="w-32 font-mono" /></div>
        </div>
      </div>
      <div className="space-y-4 border-t border-border bg-muted/30 p-5 sm:p-6 lg:border-l lg:border-t-0">
        <h3 className={subheading}>{t('settings', 'preview')}</h3>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"><span className="grid size-10 shrink-0 place-items-center rounded-lg font-heading text-lg font-bold text-white" style={{ backgroundColor: primaryColor }}>{tenantName.charAt(0)}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{tenantName}</p><p className="text-xs text-muted-foreground">TANZEN Enterprise</p></div></div>
        <div className="flex items-center gap-3 rounded-xl bg-[hsl(var(--sidebar))] p-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl font-heading text-lg font-bold text-white" style={{ backgroundColor: primaryColor }}>T</span><p className="truncate text-sm font-semibold text-white">{tenantName}</p></div>
        <Button style={{ backgroundColor: primaryColor }} className="text-white hover:opacity-90"><Sparkles size={15} />{t('settings', 'preview')}</Button>
      </div>
    </div></Card>
  </section>;
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
    {/* Une colonne pleine largeur : chaque catégorie ne compte en pratique qu'une carte par tenant — une grille `md:grid-cols-2` la réduisait à la moitié de la largeur, laissant l'autre colonne vide. Toutes les cartes ont ainsi la même largeur. */}
    <div className="space-y-4">{groups.map(({ category, items }) => { const Icon = CATEGORY_ICON[category]; return items.length > 0 ? <section key={category}><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Icon size={16} className="text-primary" />{t('settings', CATEGORY_KEY[category])}</h2><div className="grid gap-3">{items.map((integration: Integration) => <Card key={integration.id} className="flex flex-col"><CardContent className="flex flex-1 flex-col gap-2 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><p className="min-w-0 text-sm font-semibold">{integration.name}</p><span className="shrink-0"><StatusBadge label={t('settings', INTEGRATION_STATUS_KEY[integration.status])} tone={INTEGRATION_STATUS_TONE[integration.status]} /></span></div><p className="text-xs leading-5 text-muted-foreground">{integration.description}</p><div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1"><p className="text-[11px] text-muted-foreground">{t('settings', 'lastSync')}: {integration.lastSyncAt ? formatDate(integration.lastSyncAt) : t('settings', 'never')}</p><PermissionGate permission="integrations.manage"><Button variant="outline" size="sm"><Plug size={14} />{t('settings', 'configure')}</Button></PermissionGate></div></CardContent></Card>)}</div></section> : null; })}</div>
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
      {/* Ancienne page Localisation fusionnée dans Organisation (mandat « Format régional ») : l'URL y renvoie. */}
      <Route path="localization" element={<Navigate to="/settings/organization" replace />} />
      <Route path="fiscal-years" element={<SettingsFiscalYears t={t} locale={typedLocale} />} />
      <Route path="fiscal-years/:id" element={<PermissionRoute permission="fiscalYears.read"><FiscalYearDetail t={t} /></PermissionRoute>} />
      {/* Plus de page séance : redirection vers Trésorerie → Transactions, séance pré-filtrée. */}
      <Route path="fiscal-years/:id/sessions/:sessionId" element={<LegacySessionRedirect />} />
      <Route path="loan-rules/*" element={<Suspense fallback={<RouteLoadingFallback />}><LoanRulesRoutes /></Suspense>} />
      {/* Ancienne page Identité visuelle fusionnée dans Organisation (2026-09-27) : l'URL y renvoie. */}
      <Route path="branding" element={<Navigate to="/settings/organization" replace />} />
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
