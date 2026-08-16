import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, ChevronRight, Edit3, Mail, MapPin, Network, Plus, Settings2 } from 'lucide-react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, FormSection, DateDisplay, EmptyState, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { NotFoundPage } from '@/routes';
import { organizationService, type TenantInput } from '@/services/organization.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { TenantForm, useTenantFormValues, validateTenant, type T, type TenantFormErrors } from '@/features/organization/tenant-form';
import type { Tenant } from '@/mocks/organization/tenants';
import type { TableColumn } from '@/types/ui';
import { formatNumber } from '@/lib/utils';

const statusTone = { active: 'success' as const, inactive: 'default' as const, pending: 'warning' as const, suspended: 'error' as const };

/**
 * Wrapper de page pour le registre des tenants — équivalent de
 * `OrganizationPage` (features/organization) mais avec l'eyebrow « PLATFORM »
 * : ces écrans appartiennent à Platform Administration, pas à l'Application
 * Tenant, depuis la séparation architecturale (voir
 * docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md).
 */
function PlatformPage({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="PLATFORM" title={title} description={description} actions={actions} />{children}</div>;
}

function BackButton({ label }: { label: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={15} />{label}</Button>; }

function Avatar({ name, large = false }: { name: string; large?: boolean }) { const initials = name.split(' ').map((word) => word[0]).join('').slice(0, 2); return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-xl bg-primary/10 font-semibold text-primary ${large ? 'size-14 text-lg' : 'size-9 text-xs'}`}>{initials}</span>; }

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Mail }) { return <div className="flex gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }

function TenantList({ t }: { t: T }) {
  const navigate = useNavigate(); const [search, setSearch] = useState(''); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const { data: tenants = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.tenants.list(currentTenant.id, user.scope), queryFn: () => organizationService.listTenants(currentTenant.id, user.scope) });
  const filtered = tenants.filter((tenant) => `${tenant.name} ${tenant.code} ${tenant.city}`.toLowerCase().includes(search.toLowerCase()));
  if (isLoading) return <PlatformPage title={t('organization', 'tenantsTitle')} description={t('organization', 'tenantsDescription')}><TableSkeleton /></PlatformPage>;
  if (isError) return <PlatformPage title={t('organization', 'tenantsTitle')} description={t('organization', 'tenantsDescription')}><ErrorState onRetry={refetch} /></PlatformPage>;
  const columns: TableColumn<Tenant>[] = [
    { key: 'name', header: t('organization', 'name'), render: (row) => <button type="button" onClick={() => navigate(`/platform/tenants/${row.id}`)} className="flex items-center gap-3 text-left"><Avatar name={row.name} /><span><span className="block font-semibold text-foreground">{row.name}</span><span className="block text-xs text-muted-foreground">{row.code}</span></span></button> },
    { key: 'type', header: t('organization', 'type'), render: (row) => t('organization', row.type) },
    { key: 'members', header: t('organization', 'members'), render: (row) => formatNumber(row.memberCount) },
    { key: 'location', header: t('organization', 'city'), render: (row) => <span className="flex items-center gap-1.5 text-muted-foreground"><MapPin size={13} />{row.city}</span> },
    { key: 'status', header: t('organization', 'status'), render: (row) => <StatusBadge label={t('organization', row.status)} tone={statusTone[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/platform/tenants/${row.id}`)} aria-label={t('organization', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <PlatformPage title={t('organization', 'tenantsTitle')} description={t('organization', 'tenantsDescription')} actions={<PermissionGate permission="tenants.create"><Button onClick={() => navigate('/platform/tenants/create')}><Plus size={16} />{t('organization', 'createTenant')}</Button></PermissionGate>}><FilterBar search={search} onSearchChange={setSearch} placeholder={`${t('organization', 'name')}…`} /><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={Building2} title={t('organization', 'noTenants')} />} /><div className="grid gap-4 md:grid-cols-3">{tenants.slice(0, 3).map((tenant) => <Card key={tenant.id} className="transition-shadow hover:shadow-md"><CardContent className="flex items-center gap-3 p-4"><Avatar name={tenant.name} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" title={tenant.name}>{tenant.name}</p><p className="text-xs text-muted-foreground">{tenant.memberCount} {t('organization', 'members').toLowerCase()}</p></div><StatusBadge label={t('organization', tenant.status)} tone={statusTone[tenant.status]} /></CardContent></Card>)}</div></PlatformPage>;
}

function TenantCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const [values, setValues] = useTenantFormValues();
  const [errors, setErrors] = useState<TenantFormErrors>({});
  const mutation = useMockMutation<Tenant, TenantInput>({
    mutationFn: (input) => organizationService.createTenant(input),
    invalidateKeys: [queryKeys.tenants.list(currentTenant.id, user.scope)],
    onSuccess: (tenant) => { notify.success(t('organization', 'tenantCreated')); navigate(`/platform/tenants/${tenant.id}`); },
  });
  const handleSave = () => {
    const nextErrors = validateTenant(values, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) mutation.mutate(values);
  };
  return <PlatformPage title={t('organization', 'createTenant')} description={t('organization', 'tenantsDescription')} actions={<BackButton label={t('organization', 'backToTenants')} />}><TenantForm values={values} onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} errors={errors} t={t} onCancel={() => navigate('/platform/tenants')} onSave={handleSave} saving={mutation.isPending} /></PlatformPage>;
}

/**
 * Le registre des tenants est le seul écran métier où un scope 'platform'
 * (voir mocks/rbac.mocks.ts) autorise à consulter un tenant différent du
 * tenant courant — c'est le même mécanisme que Access & Security, pas une
 * exception locale. Ressource absente ou hors scope ⇒ NotFoundPage, jamais
 * de fuite d'information sur son existence. L'accès au module lui-même est
 * gardé une seule fois au sommet de l'arbre `/platform/*`
 * (`PlatformScopeGuard`, voir routes/app-router.tsx) plutôt que route par
 * route.
 */
function TenantDetail({ t }: { t: T }) {
  const navigate = useNavigate(); const { id = '' } = useParams(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const { data: tenant, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.tenants.detail(id), currentTenant.id], queryFn: () => organizationService.getTenant(currentTenant.id, id, user.scope) });
  if (isLoading) return <PlatformPage title={t('organization', 'tenantsTitle')} description={t('organization', 'tenantsDescription')}><DetailSkeleton /></PlatformPage>;
  if (isError) return <PlatformPage title={t('organization', 'tenantsTitle')} description={t('organization', 'tenantsDescription')}><ErrorState onRetry={refetch} /></PlatformPage>;
  if (!tenant) return <NotFoundPage />;
  return <PlatformPage title={tenant.name} description={tenant.description} actions={<><Button variant="outline" onClick={() => navigate(`/platform/tenants/${tenant.id}/settings`)}><Settings2 size={15} />{t('organization', 'tenantSettings')}</Button><Button onClick={() => navigate(`/platform/tenants/${tenant.id}/edit`)}><Edit3 size={15} />{t('organization', 'editTenant')}</Button></>}><div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]"><Card><CardHeader className="flex-row items-center gap-4"><Avatar name={tenant.name} large /><div><CardTitle>{tenant.legalName}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{tenant.code} · {t('organization', tenant.type)}</p></div><StatusBadge label={t('organization', tenant.status)} tone={statusTone[tenant.status]} /></CardHeader><CardContent className="grid gap-5 border-t border-border pt-5 sm:grid-cols-2"><Info label={t('organization', 'email')} value={tenant.email} icon={Mail} /><Info label={t('organization', 'phone')} value={tenant.phone} icon={Mail} /><Info label={t('organization', 'address')} value={tenant.address} icon={MapPin} /><Info label={t('organization', 'website')} value={tenant.website || '—'} icon={Network} /></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">{t('organization', 'members')}</CardTitle></CardHeader><CardContent><p className="font-heading text-3xl font-semibold">{formatNumber(tenant.memberCount)}</p><p className="mt-1 text-xs text-muted-foreground">{t('organization', 'created')} <DateDisplay value={tenant.createdAt} /></p><Button variant="link" className="mt-4 px-0" onClick={() => navigate('/organization/members')}>{t('organization', 'viewMembers')}<ChevronRight size={14} /></Button></CardContent></Card></div><Card><CardHeader><CardTitle className="text-sm">{t('organization', 'description')}</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">{tenant.description}</p></CardContent></Card></PlatformPage>;
}

function TenantEdit({ t }: { t: T }) {
  const { id = '' } = useParams(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const { data: tenant, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.tenants.detail(id), currentTenant.id], queryFn: () => organizationService.getTenant(currentTenant.id, id, user.scope) });
  if (isLoading) return <PlatformPage title={t('organization', 'editTenant')} description=""><DetailSkeleton /></PlatformPage>;
  if (isError) return <PlatformPage title={t('organization', 'editTenant')} description=""><ErrorState onRetry={refetch} /></PlatformPage>;
  if (!tenant) return <NotFoundPage />;
  return <TenantEditForm t={t} tenant={tenant} />;
}

function TenantEditForm({ t, tenant }: { t: T; tenant: Tenant }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const [values, setValues] = useTenantFormValues(tenant);
  const [errors, setErrors] = useState<TenantFormErrors>({});
  const mutation = useMockMutation<Tenant | undefined, TenantInput>({
    mutationFn: (input) => organizationService.updateTenant(currentTenant.id, tenant.id, user.scope, input),
    invalidateKeys: [queryKeys.tenants.list(currentTenant.id, user.scope), queryKeys.tenants.detail(tenant.id)],
    onSuccess: () => { notify.success(t('organization', 'tenantUpdated')); navigate(`/platform/tenants/${tenant.id}`); },
  });
  const handleSave = () => {
    const nextErrors = validateTenant(values, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) mutation.mutate(values);
  };
  return <PlatformPage title={t('organization', 'editTenant')} description={tenant.name} actions={<BackButton label={t('organization', 'backToTenants')} />}><TenantForm values={values} onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} errors={errors} t={t} onCancel={() => navigate(`/platform/tenants/${tenant.id}`)} onSave={handleSave} saving={mutation.isPending} /></PlatformPage>;
}

function TenantSettings({ t }: { t: T }) {
  const navigate = useNavigate(); const { id = '' } = useParams(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const { data: tenant } = useQuery({ queryKey: [...queryKeys.tenants.detail(id), currentTenant.id], queryFn: () => organizationService.getTenant(currentTenant.id, id, user.scope) });
  if (!tenant) return <NotFoundPage />;
  return <PlatformPage title={t('organization', 'tenantSettings')} description={tenant.name} actions={<BackButton label={tenant.name} />}><div className="grid gap-5 lg:grid-cols-2"><FormSection title={t('organization', 'general')}><div className="space-y-4"><div className="space-y-2"><Label htmlFor="settings-status">{t('organization', 'status')}</Label><select id="settings-status" defaultValue={tenant.status} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="active">{t('organization', 'active')}</option><option value="inactive">{t('organization', 'inactive')}</option><option value="pending">{t('organization', 'pending')}</option></select></div><div className="space-y-2"><Label htmlFor="settings-country">{t('organization', 'country')}</Label><Input id="settings-country" defaultValue={tenant.country} /></div></div></FormSection><FormSection title={t('organization', 'branding')}><div className="space-y-4"><div className="space-y-2"><Label htmlFor="settings-name">{t('organization', 'name')}</Label><Input id="settings-name" defaultValue={tenant.name} /></div><div className="space-y-2"><Label htmlFor="settings-description">{t('organization', 'description')}</Label><Textarea id="settings-description" defaultValue={tenant.description} /></div></div></FormSection><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" onClick={() => navigate(`/platform/tenants/${tenant.id}`)}>{t('organization', 'cancel')}</Button><Button onClick={() => navigate(`/platform/tenants/${tenant.id}`)}>{t('organization', 'save')}</Button></div></div></PlatformPage>;
}

export function PlatformModule() {
  const { t } = useLocale();
  return (
    <Routes>
      <Route index element={<Navigate to="tenants" replace />} />
      <Route path="tenants" element={<TenantList t={t} />} />
      <Route path="tenants/create" element={<TenantCreate t={t} />} />
      <Route path="tenants/:id/edit" element={<TenantEdit t={t} />} />
      <Route path="tenants/:id/settings" element={<TenantSettings t={t} />} />
      <Route path="tenants/:id" element={<TenantDetail t={t} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
