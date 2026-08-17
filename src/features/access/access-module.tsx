import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Edit3, Fingerprint, KeyRound, Laptop, LogOut, Mail, Monitor, Plus, ShieldCheck, ShieldOff, Smartphone, Trash2, UserCog, Users } from 'lucide-react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, StatCard, DateDisplay, PermissionGate, ConfirmDialog, TableSkeleton, DetailSkeleton, ErrorState, FormSection, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { NotFoundPage } from '@/routes';
import { userService, type UserInput } from '@/services/user.service';
import { roleService, type RoleInput } from '@/services/role.service';
import { sessionService } from '@/services/session.service';
import { workflowService } from '@/services/workflow.service';
import { organizationService } from '@/services/organization.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { PermissionMatrix, MODULE_KEY, ACTION_KEY, splitPermission, groupByModule } from './components/permission-matrix';
import type { Permission, SystemRole } from '@/mocks/rbac.mocks';
import type { SystemUser, MfaStatus } from '@/mocks/access/users';
import type { UserSession, SessionStatus } from '@/mocks/access/sessions';
import type { TableColumn, StatusTone } from '@/types/ui';
import { formatDate, formatNumber } from '@/lib/utils';

type T = (section: 'access' | 'nav' | 'system', key: string, values?: Record<string, string>) => string;

/** D3 (cf. docs/P0_USERS_DECISIONS_A_VALIDER.md) : `is_active` est un booléen, pas un enum — ces deux fonctions remplacent l'ancien `USER_STATUS_TONE`/`USER_STATUS_KEY` à 4 valeurs. */
function userStatusTone(isActive: boolean): StatusTone { return isActive ? 'success' : 'default'; }
function userStatusKey(isActive: boolean): string { return isActive ? 'statusActive' : 'statusInactive'; }
const MFA_TONE: Record<MfaStatus, StatusTone> = { enabled: 'success', disabled: 'default', pending: 'warning' };
const MFA_KEY: Record<MfaStatus, string> = { enabled: 'mfaEnabled', disabled: 'mfaDisabled', pending: 'mfaPending' };
const METHOD_KEY: Record<string, string> = { authenticatorApp: 'methodAuthenticatorApp', securityKey: 'methodSecurityKey', sms: 'methodSms', email: 'methodEmail', none: 'methodNone' };
const SESSION_STATUS_TONE: Record<SessionStatus, StatusTone> = { active: 'success', expired: 'default', revoked: 'error' };
const SESSION_STATUS_KEY: Record<SessionStatus, string> = { active: 'statusActive', expired: 'statusExpired', revoked: 'statusRevoked' };
const DEVICE_ICON: Record<string, typeof Laptop> = { authenticatorApp: Smartphone, securityKey: KeyRound, mobile: Smartphone };

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="ACCESS & SECURITY" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label }: { label: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={15} />{label}</Button>; }
function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Mail }) { return <div className="flex gap-3"><span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div className="min-w-0"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-sm font-medium" title={value}>{value}</p></div></div>; }
function Avatar({ name }: { name: string }) { const initials = name.split(' ').map((word) => word[0]).join('').slice(0, 2); return <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">{initials}</span>; }
function roleNames(roleIds: string[], roles: SystemRole[]) { return roleIds.map((id) => roles.find((role) => role.id === id)?.name ?? id); }
/** D1 (validé) : les rôles sont tenant-scopés — toujours résolus pour le tenant courant, jamais un catalogue global. */
function useRoles() { const { currentTenant } = useTenant(); return useQuery({ queryKey: [...queryKeys.access.roles, currentTenant.id], queryFn: () => roleService.listRoles(currentTenant.id) }); }
function usePermissionCatalog() { return useQuery({ queryKey: queryKeys.access.permissions, queryFn: roleService.listPermissions }); }

// ----------------------------------------------------------------------- Users

function UsersList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  /** D1 (cf. docs/P0_USERS_DECISIONS_A_VALIDER.md, docs/FIX_TENANT_APP_SINGLE_TENANT.md) : toujours 'tenant', jamais la portée RBAC résolue de l'utilisateur — l'Application Tenant reste isolée à un seul tenant quel que soit le scope. */
  const { data: users = [], isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.access.users, currentTenant.id], queryFn: () => userService.list(currentTenant.id, 'tenant') });
  const { data: roles = [] } = useRoles();
  const [search, setSearch] = useState(''); const [tenant, setTenant] = useState('all'); const [status, setStatus] = useState('all'); const [role, setRole] = useState('all'); const [mfa, setMfa] = useState('all');

  if (isLoading) return <Page title={t('access', 'usersTitle')} description={t('access', 'usersDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('access', 'usersTitle')} description={t('access', 'usersDescription')}><ErrorState onRetry={refetch} /></Page>;

  const tenants = [...new Map(users.map((user) => [user.tenantId, user.tenantName])).entries()];
  const filtered = users.filter((user) =>
    `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()) &&
    (tenant === 'all' || user.tenantId === tenant) &&
    (status === 'all' || (status === 'active') === user.isActive) &&
    (role === 'all' || user.roleIds.includes(role)) &&
    (mfa === 'all' || user.mfaStatus === mfa),
  );

  const columns: TableColumn<SystemUser>[] = [
    { key: 'name', header: t('access', 'name'), render: (row) => <button type="button" onClick={() => navigate(`/access-security/users/${row.id}`)} className="flex items-center gap-3 text-left"><Avatar name={row.name} /><span><span className="block font-semibold">{row.name}</span><span className="block text-xs text-muted-foreground">{row.id}</span></span></button> },
    { key: 'email', header: t('access', 'email'), render: (row) => <span className="text-sm text-muted-foreground">{row.email}</span> },
    { key: 'tenant', header: t('access', 'tenant'), render: (row) => row.tenantName },
    { key: 'status', header: t('access', 'status'), render: (row) => <StatusBadge label={t('access', userStatusKey(row.isActive))} tone={userStatusTone(row.isActive)} /> },
    { key: 'roles', header: t('access', 'roles'), render: (row) => <div className="flex flex-wrap gap-1">{roleNames(row.roleIds, roles).map((name) => <span key={name} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{name}</span>)}</div> },
    { key: 'mfa', header: t('access', 'mfa'), render: (row) => <StatusBadge label={t('access', MFA_KEY[row.mfaStatus])} tone={MFA_TONE[row.mfaStatus]} /> },
    { key: 'lastLogin', header: t('access', 'lastLogin'), render: (row) => row.lastLoginAt ? <DateDisplay value={row.lastLoginAt} /> : <span className="text-muted-foreground">{t('access', 'never')}</span> },
  ];

  return <Page title={t('access', 'usersTitle')} description={t('access', 'usersDescription')} actions={<PermissionGate permission="users.create"><Button onClick={() => navigate('/access-security/users/create')}><Plus size={16} />{t('access', 'createUser')}</Button></PermissionGate>}>
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label={t('access', 'usersTitle')} value={formatNumber(users.length)} icon={Users} tone="info" />
      <StatCard label={t('access', 'mfaEnabled')} value={formatNumber(users.filter((u) => u.mfaStatus === 'enabled').length)} icon={ShieldCheck} tone="success" />
      <StatCard label={t('access', 'mfaDisabled')} value={formatNumber(users.filter((u) => u.mfaStatus === 'disabled').length)} icon={ShieldOff} tone="warning" />
    </div>
    <FilterBar search={search} onSearchChange={setSearch} placeholder={t('access', 'searchUser')} filters={<>
      <select value={tenant} onChange={(e) => setTenant(e.target.value)} aria-label={t('access', 'tenant')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('access', 'allTenants')}</option>{tenants.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('access', 'status')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('access', 'allStatuses')}</option>{(['active', 'inactive'] as const).map((s) => <option key={s} value={s}>{t('access', userStatusKey(s === 'active'))}</option>)}</select>
      <select value={role} onChange={(e) => setRole(e.target.value)} aria-label={t('access', 'roles')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('access', 'allRoles')}</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <select value={mfa} onChange={(e) => setMfa(e.target.value)} aria-label={t('access', 'mfa')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('access', 'allMfaStatuses')}</option>{(['enabled', 'disabled', 'pending'] as MfaStatus[]).map((m) => <option key={m} value={m}>{t('access', MFA_KEY[m])}</option>)}</select>
    </>} />
    <DataTable columns={columns} rows={filtered} empty={<EmptyState icon={Users} title={t('access', 'noUsers')} />} />
  </Page>;
}

function RolePicker({ roles, currentUserScope, selected, onChange }: { roles: SystemRole[]; currentUserScope: 'tenant' | 'platform'; selected: string[]; onChange: (ids: string[]) => void }) {
  const assignable = roles.filter((role) => currentUserScope === 'platform' || role.scope === 'tenant');
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return <div className="space-y-2">{assignable.map((role) => <label key={role.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(role.id)} onChange={() => toggle(role.id)} className="size-4 rounded border-input" />{role.name}</label>)}</div>;
}

/** Sélecteur éditable de permissions pour un rôle — même regroupement par module que `PermissionMatrix` (lecture seule), jamais une liste de permissions inventée : toujours dérivé de `permissionCatalog`. */
function PermissionPicker({ t, permissions, selected, onChange }: { t: T; permissions: Permission[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const grouped = groupByModule(permissions);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {grouped.map(([module, modulePermissions]) => <Card key={module}><CardHeader><CardTitle className="text-sm">{t('access', MODULE_KEY[module] ?? module)}</CardTitle></CardHeader><CardContent className="space-y-2 p-4 pt-0">
      {modulePermissions.map((permission) => { const { action } = splitPermission(permission); return <label key={permission} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(permission)} onChange={() => toggle(permission)} className="size-4 rounded border-input" />{t('access', ACTION_KEY[action] ?? action)}</label>; })}
    </CardContent></Card>)}
  </div>;
}

type RoleFormValues = { name: string; description: string; permissions: string[] };
type RoleFormErrors = Partial<Record<'name', string>>;

function validateRoleForm(values: RoleFormValues, t: T): RoleFormErrors {
  const errors: RoleFormErrors = {};
  if (!values.name.trim()) errors.name = t('access', 'fieldRequired');
  return errors;
}

function RoleFormFields({ t, values, onChange, errors, permissionCatalog }: { t: T; values: RoleFormValues; onChange: (patch: Partial<RoleFormValues>) => void; errors: RoleFormErrors; permissionCatalog: Permission[] }) {
  return <>
    <FormSection title={t('access', 'general')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="role-name">{t('access', 'roleName')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="role-name" value={values.name} onChange={(event) => onChange({ name: event.target.value })} aria-required="true" aria-invalid={Boolean(errors.name)} /><FieldError message={errors.name} /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="role-description">{t('access', 'roleDescription')}</Label><Input id="role-description" value={values.description} onChange={(event) => onChange({ description: event.target.value })} /></div></div></FormSection>
    <FormSection title={t('access', 'permissionMatrix')}><PermissionPicker t={t} permissions={permissionCatalog} selected={values.permissions} onChange={(ids) => onChange({ permissions: ids })} /></FormSection>
  </>;
}

type UserFormValues = { name: string; email: string; tenantId: string; roleIds: string[] };
type UserFormErrors = Partial<Record<'name' | 'email', string>>;

function validateUserForm(values: UserFormValues, t: T): UserFormErrors {
  const errors: UserFormErrors = {};
  if (!values.name.trim()) errors.name = t('access', 'fieldRequired');
  if (!values.email.trim()) errors.email = t('access', 'fieldRequired');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = t('access', 'invalidEmail');
  return errors;
}

function UserFormFields({ t, values, onChange, errors, tenants, roles, currentUserScope }: { t: T; values: UserFormValues; onChange: (patch: Partial<UserFormValues>) => void; errors: UserFormErrors; tenants: { id: string; name: string }[]; roles: SystemRole[]; currentUserScope: 'tenant' | 'platform' }) {
  return <><FormSection title={t('access', 'general')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="user-name">{t('access', 'name')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="user-name" value={values.name} onChange={(event) => onChange({ name: event.target.value })} aria-required="true" aria-invalid={Boolean(errors.name)} /><FieldError message={errors.name} /></div><div className="space-y-2"><Label htmlFor="user-email">{t('access', 'email')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="user-email" type="email" value={values.email} onChange={(event) => onChange({ email: event.target.value })} aria-required="true" aria-invalid={Boolean(errors.email)} /><FieldError message={errors.email} /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="user-tenant">{t('access', 'tenant')}</Label><select id="user-tenant" value={values.tenantId} onChange={(event) => onChange({ tenantId: event.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></div></div></FormSection><FormSection title={t('access', 'roles')}><RolePicker roles={roles} currentUserScope={currentUserScope} selected={values.roleIds} onChange={(ids) => onChange({ roleIds: ids })} /></FormSection></>;
}

function UserCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  /** Application Tenant : toujours 'tenant' pour le registre, jamais la portée RBAC résolue de l'utilisateur (cf. docs/FIX_TENANT_APP_SINGLE_TENANT.md, docs/P0_TENANTS_AUDIT.md E1) — `user.scope` reste utilisé ci-dessous pour `currentUserScope` (RolePicker) ET, depuis le correctif sécurité (docs/P0_RBAC_SCOPE_SECURITY_FIX_REPORT.md), comme `actorScope` transmis à `userService.create` — le service applique désormais la même garde anti-élévation que `RolePicker`, pas seulement l'UI. */
  const { data: tenants = [] } = useQuery({ queryKey: queryKeys.tenants.list(currentTenant.id, 'tenant'), queryFn: () => organizationService.listTenants(currentTenant.id, 'tenant') });
  const { data: roles = [] } = useRoles();
  const [values, setValues] = useState<UserFormValues>({ name: '', email: '', tenantId: currentTenant.id, roleIds: [] });
  const [errors, setErrors] = useState<UserFormErrors>({});
  const mutation = useMockMutation<SystemUser | undefined, UserInput>({
    mutationFn: (input) => userService.create(input, user.scope),
    invalidateKeys: [queryKeys.access.users],
    onSuccess: (created) => {
      if (!created) { notify.error(t('system', 'errorTitle')); return; }
      notify.success(t('access', 'userCreated'));
      navigate(`/access-security/users/${created.id}`);
    },
  });
  const handleSave = () => {
    const nextErrors = validateUserForm(values, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const tenant = tenants.find((item) => item.id === values.tenantId);
    mutation.mutate({ name: values.name, email: values.email, tenantId: values.tenantId, tenantName: tenant?.name ?? currentTenant.name, roleIds: values.roleIds });
  };
  return <Page title={t('access', 'createUser')} description={t('access', 'usersDescription')} actions={<Back label={t('access', 'backToUsers')} />}><div className="grid gap-5 lg:grid-cols-2"><UserFormFields t={t} values={values} onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} errors={errors} tenants={tenants} roles={roles} currentUserScope={user.scope} /><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/access-security/users')}>{t('access', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('access', 'saving') : t('access', 'save')}</Button></div></div></Page>;
}

function UserEdit({ t }: { t: T }) {
  const { id: userId = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user: currentUser } = usePermissions();
  /** D1 : toujours 'tenant' pour get()/update() (4ᵉ paramètre) — jamais la portée RBAC résolue de l'utilisateur. `currentUser.scope` reste utilisé ci-dessous pour `currentUserScope` (RolePicker) ET comme `actorScope` (5ᵉ paramètre d'`update()`, correctif sécurité, cf. docs/P0_RBAC_SCOPE_SECURITY_FIX_REPORT.md) — deux usages RBAC distincts du même scope résolu, aucun rapport avec l'isolation tenant (4ᵉ paramètre), jamais fusionnés. */
  const { data: existing, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.access.user(userId), currentTenant.id], queryFn: () => userService.get(currentTenant.id, userId, 'tenant') });
  const { data: tenants = [] } = useQuery({ queryKey: queryKeys.tenants.list(currentTenant.id, 'tenant'), queryFn: () => organizationService.listTenants(currentTenant.id, 'tenant') });
  const { data: roles = [] } = useRoles();
  const [values, setValues] = useState<UserFormValues | null>(null);
  const [errors, setErrors] = useState<UserFormErrors>({});
  const mutation = useMockMutation<SystemUser | undefined, UserInput>({
    mutationFn: (input) => userService.update(currentTenant.id, userId, input, 'tenant', currentUser.scope),
    invalidateKeys: [queryKeys.access.users, queryKeys.access.user(userId)],
    onSuccess: () => { notify.success(t('access', 'userUpdated')); navigate(`/access-security/users/${userId}`); },
  });
  if (isLoading) return <Page title={t('access', 'editUser')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('access', 'editUser')}><ErrorState onRetry={refetch} /></Page>;
  if (!existing) return <NotFoundPage />;
  const current = values ?? { name: existing.name, email: existing.email, tenantId: existing.tenantId, roleIds: existing.roleIds };
  const handleSave = () => {
    const nextErrors = validateUserForm(current, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const tenant = tenants.find((item) => item.id === current.tenantId);
    mutation.mutate({ name: current.name, email: current.email, tenantId: current.tenantId, tenantName: tenant?.name ?? existing.tenantName, roleIds: current.roleIds });
  };
  return <Page title={t('access', 'editUser')} description={existing.name} actions={<Back label={t('access', 'backToUsers')} />}><div className="grid gap-5 lg:grid-cols-2"><UserFormFields t={t} values={current} onChange={(patch) => setValues({ ...current, ...patch })} errors={errors} tenants={tenants} roles={roles} currentUserScope={currentUser.scope} /><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/access-security/users/${userId}`)}>{t('access', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('access', 'saving') : t('access', 'save')}</Button></div></div></Page>;
}

function ProfileTab({ t, locale, user }: { t: T; locale: 'fr' | 'en'; user: SystemUser }) {
  return <Card><CardHeader><CardTitle className="text-sm">{t('access', 'profileInfo')}</CardTitle></CardHeader><CardContent className="grid gap-5 p-5 sm:grid-cols-2">
    <Info label={t('access', 'name')} value={user.name} icon={Users} />
    <Info label={t('access', 'email')} value={user.email} icon={Mail} />
    <Info label={t('access', 'tenant')} value={user.tenantName} icon={UserCog} />
    <Info label={t('access', 'status')} value={t('access', userStatusKey(user.isActive))} icon={ShieldCheck} />
    <Info label={t('access', 'createdAt')} value={formatDate(user.createdAt, locale)} icon={UserCog} />
    <Info label={t('access', 'lastLogin')} value={user.lastLoginAt ? formatDate(user.lastLoginAt, locale) : t('access', 'never')} icon={UserCog} />
  </CardContent></Card>;
}

function RolesTab({ t, user }: { t: T; user: SystemUser }) {
  const { data: allRoles = [] } = useRoles();
  const roles = user.roleIds.map((id) => allRoles.find((role) => role.id === id)).filter((role): role is SystemRole => Boolean(role));
  if (roles.length === 0) return <EmptyState icon={UserCog} title={t('access', 'noRoles')} />;
  return <div className="grid gap-4 sm:grid-cols-2">{roles.map((role) => <Card key={role.id}><CardContent className="flex items-start gap-3 p-4"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><UserCog size={16} /></span><div className="min-w-0"><p className="text-sm font-semibold">{role.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{role.description}</p><p className="mt-2 text-[11px] text-muted-foreground">{formatNumber(role.permissions.length)} {t('access', 'permissionsCount').toLowerCase()}</p></div></CardContent></Card>)}</div>;
}

function UserPermissionsTab({ t, user }: { t: T; user: SystemUser }) {
  const { data: allRoles = [] } = useRoles();
  const { data: permissionCatalog = [] } = usePermissionCatalog();
  const effective = new Set(user.roleIds.flatMap((id) => allRoles.find((role) => role.id === id)?.permissions ?? []));
  return <><p className="mb-4 text-sm text-muted-foreground">{formatNumber(effective.size)} / {formatNumber(permissionCatalog.length)} {t('access', 'effectivePermissions').toLowerCase()}</p><PermissionMatrix t={t} permissions={permissionCatalog} allowed={effective} /></>;
}

function SessionsTable({ t, sessions, onRevoke }: { t: T; sessions: UserSession[]; onRevoke?: (session: UserSession) => void }) {
  const columns: TableColumn<UserSession>[] = [
    { key: 'user', header: t('access', 'name'), render: (row) => <span className="font-medium">{row.userName}</span> },
    { key: 'device', header: t('access', 'device'), render: (row) => <span className="flex items-center gap-2"><Monitor size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" /><span className="truncate" title={row.device}>{row.device}</span></span> },
    { key: 'browser', header: t('access', 'browser') },
    { key: 'lastActivity', header: t('access', 'lastActivity'), render: (row) => <DateDisplay value={row.lastActivityAt} /> },
    { key: 'createdAt', header: t('access', 'createdAt'), render: (row) => <DateDisplay value={row.createdAt} /> },
    { key: 'status', header: t('access', 'status'), render: (row) => <StatusBadge label={t('access', SESSION_STATUS_KEY[row.status])} tone={SESSION_STATUS_TONE[row.status]} /> },
    ...(onRevoke ? [{ key: 'actions', header: '', className: 'w-32', render: (row: UserSession) => row.status === 'active' ? <PermissionGate permission="sessions.revoke" fallback={<span className="text-[11px] text-muted-foreground">{t('access', 'noPermissionRevoke')}</span>}><Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => onRevoke(row)}><LogOut size={13} />{t('access', 'revokeSession')}</Button></PermissionGate> : null } as TableColumn<UserSession>] : []),
  ];
  return <DataTable columns={columns} rows={sessions} empty={<EmptyState icon={Monitor} title={t('access', 'noSessions')} />} />;
}

function UserSessionsTab({ t, userId }: { t: T; userId: string }) {
  const { currentTenant } = useTenant(); const queryClient = useQueryClient();
  const { data: sessions = [] } = useQuery({ queryKey: queryKeys.access.sessionsByUser(userId), queryFn: () => sessionService.listByUser(userId) });
  const [toRevoke, setToRevoke] = useState<UserSession | null>(null);
  /** D1 : toujours 'tenant', jamais la portée RBAC résolue de l'utilisateur. */
  const revoke = useMutation({ mutationFn: (id: string) => sessionService.revoke(currentTenant.id, id, 'tenant'), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['access', 'sessions'] }); setToRevoke(null); } });
  return <>
    <SessionsTable t={t} sessions={sessions} onRevoke={setToRevoke} />
    {toRevoke && <ConfirmDialog open title={t('access', 'revokeSessionTitle')} description={t('access', 'revokeSessionConfirm')} confirmLabel={t('access', 'revokeSession')} cancelLabel={t('access', 'cancel')} onConfirm={() => revoke.mutate(toRevoke.id)} onCancel={() => setToRevoke(null)} />}
  </>;
}

function UserMfaTab({ t, locale, user }: { t: T; locale: 'fr' | 'en'; user: SystemUser }) {
  return <div className="grid gap-5 lg:grid-cols-2">
    <Card><CardHeader><CardTitle className="text-sm">{t('access', 'mfaStatus')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
      <StatusBadge label={t('access', MFA_KEY[user.mfaStatus])} tone={MFA_TONE[user.mfaStatus]} />
      <Info label={t('access', 'authenticator')} value={t('access', METHOD_KEY[user.mfaMethod])} icon={Fingerprint} />
      <Info label={t('access', 'recoveryCodesRemaining')} value={formatNumber(user.recoveryCodesRemaining)} icon={KeyRound} />
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">{t('access', 'registeredDevices')}</CardTitle></CardHeader><CardContent className="space-y-3 p-5">
      {user.mfaDevices.length === 0 && <EmptyState icon={ShieldOff} title={t('access', 'noDevices')} />}
      {user.mfaDevices.map((device) => { const Icon = DEVICE_ICON[device.type] ?? Smartphone; return <div key={device.id} className="flex items-center gap-3 rounded-lg border border-border p-3"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={device.name}>{device.name}</p><p className="text-xs text-muted-foreground">{formatDate(device.registeredAt, locale)}</p></div></div>; })}
    </CardContent></Card>
  </div>;
}

function UserActivityTab({ t, locale, user }: { t: T; locale: 'fr' | 'en'; user: SystemUser }) {
  const { data: history = [] } = useQuery({ queryKey: queryKeys.operations.history(user.tenantId), queryFn: () => workflowService.listHistory(user.tenantId) });
  const activity = history.filter((action) => action.actorName === user.name);
  if (activity.length === 0) return <EmptyState icon={UserCog} title={t('access', 'noActivity')} />;
  return <div className="space-y-3">{activity.map((action) => <Card key={action.id}><CardContent className="flex items-center gap-3 p-4"><span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-lg ${action.action === 'approved' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : action.action === 'rejected' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}><ShieldCheck size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={`${action.entityLabel} · ${action.stepName}`}>{action.entityLabel} · {action.stepName}</p><p className="text-xs text-muted-foreground">{formatDate(action.date, locale)}{action.comment ? ` — ${action.comment}` : ''}</p></div></CardContent></Card>)}</div>;
}

function UserDetail({ t, locale }: { t: T; locale: 'fr' | 'en' }) {
  const navigate = useNavigate(); const { id: userId = '' } = useParams(); const { currentTenant } = useTenant();
  /** D1 : toujours 'tenant', jamais la portée RBAC résolue de l'utilisateur. */
  const { data: user, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.access.user(userId), currentTenant.id], queryFn: () => userService.get(currentTenant.id, userId, 'tenant') });
  const { data: roles = [] } = useRoles();
  const [confirmStatus, setConfirmStatus] = useState(false);
  /** D3 : `isActive` booléen — désactiver/réactiver ne sont que `true⇄false`, aucune transition supplémentaire (`suspended`/`invited`/`pending` n'existent plus). */
  const statusMutation = useMockMutation<SystemUser | undefined, boolean>({
    mutationFn: (isActive) => userService.update(currentTenant.id, userId, { isActive } as Partial<UserInput> & { isActive: boolean }, 'tenant'),
    invalidateKeys: [queryKeys.access.users, queryKeys.access.user(userId)],
    onSuccess: () => { notify.success(t('access', 'userStatusChanged')); setConfirmStatus(false); },
  });
  if (isLoading) return <Page title={t('access', 'userDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('access', 'userDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!user) return <NotFoundPage />;
  const isInactive = !user.isActive;
  const nextIsActive = isInactive;
  return <Page title={user.name} description={`${user.id} · ${user.tenantName}`} actions={<><Back label={t('access', 'backToUsers')} /><PermissionGate permission="users.update"><Button variant="outline" onClick={() => navigate(`/access-security/users/${user.id}/edit`)}><Edit3 size={15} />{t('access', 'editUser')}</Button><Button variant="outline" onClick={() => setConfirmStatus(true)}>{isInactive ? <ShieldCheck size={15} /> : <ShieldOff size={15} />}{t('access', isInactive ? 'reactivateUser' : 'deactivateUser')}</Button></PermissionGate></>}>
    {confirmStatus && <ConfirmDialog open title={t('access', isInactive ? 'reactivateUser' : 'deactivateUser')} description={t('access', isInactive ? 'reactivateUserConfirm' : 'deactivateUserConfirm')} confirmLabel={t('access', isInactive ? 'reactivateUser' : 'deactivateUser')} cancelLabel={t('access', 'cancel')} onConfirm={() => statusMutation.mutate(nextIsActive)} onCancel={() => setConfirmStatus(false)} />}
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit"><CardContent className="flex flex-col items-center p-6 text-center">
        <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{user.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
        <h2 className="mt-4 text-lg font-semibold">{user.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5"><StatusBadge label={t('access', userStatusKey(user.isActive))} tone={userStatusTone(user.isActive)} /><StatusBadge label={t('access', MFA_KEY[user.mfaStatus])} tone={MFA_TONE[user.mfaStatus]} /></div>
        <div className="mt-5 w-full space-y-3 border-t border-border pt-5 text-left"><Info label={t('access', 'tenant')} value={user.tenantName} icon={UserCog} /><Info label={t('access', 'roles')} value={roleNames(user.roleIds, roles).join(', ') || '—'} icon={UserCog} /></div>
      </CardContent></Card>
      <Tabs defaultValue="profile" className="min-w-0">
        <TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">
          <TabsTrigger value="profile">{t('access', 'tabProfile')}</TabsTrigger>
          <TabsTrigger value="roles">{t('access', 'tabRoles')}</TabsTrigger>
          <TabsTrigger value="permissions">{t('access', 'tabPermissions')}</TabsTrigger>
          <TabsTrigger value="sessions">{t('access', 'tabSessions')}</TabsTrigger>
          <TabsTrigger value="mfa">{t('access', 'tabMfa')}</TabsTrigger>
          <TabsTrigger value="activity">{t('access', 'tabActivity')}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileTab t={t} locale={locale} user={user} /></TabsContent>
        <TabsContent value="roles"><RolesTab t={t} user={user} /></TabsContent>
        <TabsContent value="permissions"><UserPermissionsTab t={t} user={user} /></TabsContent>
        <TabsContent value="sessions"><UserSessionsTab t={t} userId={user.id} /></TabsContent>
        <TabsContent value="mfa"><UserMfaTab t={t} locale={locale} user={user} /></TabsContent>
        <TabsContent value="activity"><UserActivityTab t={t} locale={locale} user={user} /></TabsContent>
      </Tabs>
    </div>
  </Page>;
}

// ----------------------------------------------------------------------- Roles

function RolesList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: roles = [], isLoading, isError, refetch } = useRoles();
  /** D1 : toujours 'tenant', jamais la portée RBAC résolue de l'utilisateur. */
  const { data: users = [] } = useQuery({ queryKey: [...queryKeys.access.users, currentTenant.id], queryFn: () => userService.list(currentTenant.id, 'tenant') });
  if (isLoading) return <Page title={t('access', 'rolesTitle')} description={t('access', 'rolesDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('access', 'rolesTitle')} description={t('access', 'rolesDescription')}><ErrorState onRetry={refetch} /></Page>;
  const columns: TableColumn<SystemRole>[] = [
    { key: 'name', header: t('access', 'roleName'), render: (row) => <button type="button" onClick={() => navigate(`/access-security/roles/${row.id}`)} className="flex items-center gap-3 text-left"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><UserCog size={16} /></span><span className="font-semibold">{row.name}</span></button> },
    { key: 'description', header: t('access', 'roleDescription'), render: (row) => <span className="text-sm text-muted-foreground">{row.description}</span> },
    { key: 'users', header: t('access', 'usersCount'), render: (row) => formatNumber(users.filter((user) => user.roleIds.includes(row.id)).length) },
    { key: 'permissions', header: t('access', 'permissionsCount'), render: (row) => formatNumber(row.permissions.length) },
  ];
  return <Page title={t('access', 'rolesTitle')} description={t('access', 'rolesDescription')} actions={<PermissionGate permission="roles.create"><Button onClick={() => navigate('/access-security/roles/create')}><Plus size={16} />{t('access', 'createRole')}</Button></PermissionGate>}>
    <DataTable columns={columns} rows={roles} empty={<EmptyState icon={UserCog} title={t('access', 'noPermissions')} />} />
  </Page>;
}

function RoleCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: permissionCatalog = [] } = usePermissionCatalog();
  const [values, setValues] = useState<RoleFormValues>({ name: '', description: '', permissions: [] });
  const [errors, setErrors] = useState<RoleFormErrors>({});
  const mutation = useMockMutation<SystemRole, RoleInput & { tenantId: string }>({
    mutationFn: (input) => roleService.create(input),
    invalidateKeys: [queryKeys.access.roles],
    onSuccess: (created) => { notify.success(t('access', 'roleCreated')); navigate(`/access-security/roles/${created.id}`); },
  });
  const handleSave = () => {
    const nextErrors = validateRoleForm(values, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate({ name: values.name, description: values.description, permissions: values.permissions, tenantId: currentTenant.id });
  };
  return <Page title={t('access', 'createRole')} description={t('access', 'rolesDescription')} actions={<Back label={t('access', 'backToRoles')} />}>
    <div className="grid gap-5"><RoleFormFields t={t} values={values} onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} errors={errors} permissionCatalog={permissionCatalog} /><div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/access-security/roles')}>{t('access', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('access', 'saving') : t('access', 'save')}</Button></div></div>
  </Page>;
}

function RoleEdit({ t }: { t: T }) {
  const { id: roleId = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: existing, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.access.role(roleId), currentTenant.id], queryFn: () => roleService.getRole(currentTenant.id, roleId) });
  const { data: permissionCatalog = [] } = usePermissionCatalog();
  const [values, setValues] = useState<RoleFormValues | null>(null);
  const [errors, setErrors] = useState<RoleFormErrors>({});
  const mutation = useMockMutation<SystemRole | undefined, RoleInput>({
    mutationFn: (input) => roleService.update(currentTenant.id, roleId, input),
    invalidateKeys: [queryKeys.access.roles, queryKeys.access.role(roleId)],
    onSuccess: () => { notify.success(t('access', 'roleUpdated')); navigate(`/access-security/roles/${roleId}`); },
  });
  if (isLoading) return <Page title={t('access', 'editRole')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('access', 'editRole')}><ErrorState onRetry={refetch} /></Page>;
  if (!existing) return <NotFoundPage />;
  const current = values ?? { name: existing.name, description: existing.description, permissions: existing.permissions };
  const handleSave = () => {
    const nextErrors = validateRoleForm(current, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate({ name: current.name, description: current.description, permissions: current.permissions });
  };
  return <Page title={t('access', 'editRole')} description={existing.name} actions={<Back label={t('access', 'backToRoles')} />}>
    <div className="grid gap-5"><RoleFormFields t={t} values={current} onChange={(patch) => setValues({ ...current, ...patch })} errors={errors} permissionCatalog={permissionCatalog} /><div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/access-security/roles/${roleId}`)}>{t('access', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('access', 'saving') : t('access', 'save')}</Button></div></div>
  </Page>;
}

function RoleDetail({ t }: { t: T }) {
  const navigate = useNavigate(); const { id: roleId = '' } = useParams(); const { currentTenant } = useTenant(); const queryClient = useQueryClient();
  /** D1 : toujours résolu pour le tenant courant — jamais un catalogue global. */
  const { data: role, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.access.role(roleId), currentTenant.id], queryFn: () => roleService.getRole(currentTenant.id, roleId) });
  const { data: users = [] } = useQuery({ queryKey: [...queryKeys.access.usersByRole(roleId), currentTenant.id], queryFn: () => userService.listByRole(roleId, currentTenant.id, 'tenant') });
  const { data: permissionCatalog = [] } = usePermissionCatalog();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => roleService.delete(currentTenant.id, roleId),
    onSuccess: (deleted) => {
      setConfirmDelete(false);
      if (!deleted) { notify.error(t('access', 'roleDeleteBlocked')); return; }
      queryClient.invalidateQueries({ queryKey: queryKeys.access.roles });
      notify.success(t('access', 'roleDeleted'));
      navigate('/access-security/roles');
    },
  });
  if (isLoading) return <Page title={t('access', 'roleDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('access', 'roleDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!role) return <NotFoundPage />;
  const allowed = new Set(role.permissions);
  return <Page title={role.name} description={role.description} actions={<>
    <Back label={t('access', 'backToRoles')} />
    <PermissionGate permission="roles.update"><Button variant="outline" onClick={() => navigate(`/access-security/roles/${role.id}/edit`)}><Edit3 size={15} />{t('access', 'editRole')}</Button></PermissionGate>
    <PermissionGate permission="roles.delete"><Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />{t('access', 'deleteRole')}</Button></PermissionGate>
  </>}>
    {confirmDelete && <ConfirmDialog open title={t('access', 'deleteRole')} description={t('access', 'deleteRoleConfirm')} confirmLabel={t('access', 'deleteRole')} cancelLabel={t('access', 'cancel')} onConfirm={() => deleteMutation.mutate()} onCancel={() => setConfirmDelete(false)} />}
    <div className="grid gap-4 sm:grid-cols-2">
      <StatCard label={t('access', 'usersCount')} value={formatNumber(users.length)} icon={Users} tone="info" />
      <StatCard label={t('access', 'permissionsCount')} value={formatNumber(role.permissions.length)} icon={KeyRound} tone="success" />
    </div>
    <Card><CardHeader><CardTitle className="text-sm">{t('access', 'usersCount')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={[{ key: 'name', header: t('access', 'name'), render: (row: SystemUser) => <span className="flex items-center gap-2"><Avatar name={row.name} />{row.name}</span> }, { key: 'tenant', header: t('access', 'tenant'), render: (row: SystemUser) => row.tenantName }, { key: 'status', header: t('access', 'status'), render: (row: SystemUser) => <StatusBadge label={t('access', userStatusKey(row.isActive))} tone={userStatusTone(row.isActive)} /> }] as TableColumn<SystemUser>[]} rows={users} empty={<EmptyState icon={Users} title={t('access', 'noUsers')} />} /></CardContent></Card>
    <div><h2 className="mb-4 text-sm font-semibold text-foreground">{t('access', 'permissionMatrix')}</h2><PermissionMatrix t={t} permissions={permissionCatalog} allowed={allowed} /></div>
  </Page>;
}

// ----------------------------------------------------------------------- Permissions

function PermissionsPage({ t }: { t: T }) {
  const { data: permissions = [], isLoading, isError, refetch } = usePermissionCatalog();
  const { data: roles = [] } = useRoles();
  if (isLoading) return <Page title={t('access', 'permissionsTitle')} description={t('access', 'permissionsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('access', 'permissionsTitle')} description={t('access', 'permissionsDescription')}><ErrorState onRetry={refetch} /></Page>;
  const columns: TableColumn<{ id: string; module: string; action: string }>[] = [
    { key: 'module', header: t('access', 'module'), render: (row) => t('access', MODULE_KEY[row.module] ?? row.module) },
    { key: 'resource', header: t('access', 'resource'), render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.module}</span> },
    { key: 'action', header: t('access', 'action'), render: (row) => t('access', ACTION_KEY[row.action] ?? row.action) },
    { key: 'permission', header: t('access', 'permission'), render: (row) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{row.id}</code> },
    { key: 'roles', header: t('access', 'roles'), render: (row) => <div className="flex flex-wrap gap-1">{roles.filter((role) => role.permissions.includes(row.id)).map((role) => <span key={role.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{role.name}</span>)}</div> },
  ];
  const rows = permissions.map((permission) => ({ id: permission, ...splitPermission(permission) }));
  return <Page title={t('access', 'permissionsTitle')} description={t('access', 'permissionsDescription')}>
    <StatCard label={t('access', 'permissionsCount')} value={formatNumber(permissions.length)} icon={KeyRound} tone="info" />
    <DataTable columns={columns} rows={rows} empty={<EmptyState icon={KeyRound} title={t('access', 'noPermissions')} />} />
  </Page>;
}

// ----------------------------------------------------------------------- Sessions

function SessionsPage({ t }: { t: T }) {
  const { currentTenant } = useTenant(); const queryClient = useQueryClient();
  /** D1 : toujours 'tenant', jamais la portée RBAC résolue de l'utilisateur. */
  const { data: sessions = [], isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.access.sessions, currentTenant.id], queryFn: () => sessionService.list(currentTenant.id, 'tenant') });
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all');
  const [toRevoke, setToRevoke] = useState<UserSession | null>(null);
  const revoke = useMutation({ mutationFn: (id: string) => sessionService.revoke(currentTenant.id, id, 'tenant'), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['access', 'sessions'] }); setToRevoke(null); } });

  if (isLoading) return <Page title={t('access', 'sessionsTitle')} description={t('access', 'sessionsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('access', 'sessionsTitle')} description={t('access', 'sessionsDescription')}><ErrorState onRetry={refetch} /></Page>;

  const filtered = sessions.filter((session) => `${session.userName} ${session.device} ${session.browser}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || session.status === status));
  const active = sessions.filter((s) => s.status === 'active');

  return <Page title={t('access', 'sessionsTitle')} description={t('access', 'sessionsDescription')}>
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label={t('access', 'statusActive')} value={formatNumber(active.length)} icon={Laptop} tone="success" />
      <StatCard label={t('access', 'statusExpired')} value={formatNumber(sessions.filter((s) => s.status === 'expired').length)} icon={AlertTriangle} tone="neutral" />
      <StatCard label={t('access', 'statusRevoked')} value={formatNumber(sessions.filter((s) => s.status === 'revoked').length)} icon={ShieldOff} tone="warning" />
    </div>
    <FilterBar search={search} onSearchChange={setSearch} placeholder={t('access', 'searchUser')} filters={<select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('access', 'status')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('access', 'allStatuses')}</option>{(['active', 'expired', 'revoked'] as SessionStatus[]).map((s) => <option key={s} value={s}>{t('access', SESSION_STATUS_KEY[s])}</option>)}</select>} />
    <SessionsTable t={t} sessions={filtered} onRevoke={setToRevoke} />
    {toRevoke && <ConfirmDialog open title={t('access', 'revokeSessionTitle')} description={t('access', 'revokeSessionConfirm')} confirmLabel={t('access', 'revokeSession')} cancelLabel={t('access', 'cancel')} onConfirm={() => revoke.mutate(toRevoke.id)} onCancel={() => setToRevoke(null)} />}
  </Page>;
}

// ----------------------------------------------------------------------- MFA

function MfaPage({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  /** D1 : toujours 'tenant', jamais la portée RBAC résolue de l'utilisateur. */
  const { data: users = [], isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.access.users, currentTenant.id], queryFn: () => userService.list(currentTenant.id, 'tenant') });
  if (isLoading) return <Page title={t('access', 'mfaTitle')} description={t('access', 'mfaDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('access', 'mfaTitle')} description={t('access', 'mfaDescription')}><ErrorState onRetry={refetch} /></Page>;
  const enabled = users.filter((u) => u.mfaStatus === 'enabled');
  const disabled = users.filter((u) => u.mfaStatus === 'disabled');
  const pending = users.filter((u) => u.mfaStatus === 'pending');

  const columns: TableColumn<SystemUser>[] = [
    { key: 'name', header: t('access', 'name'), render: (row) => <span className="flex items-center gap-2"><Avatar name={row.name} />{row.name}</span> },
    { key: 'tenant', header: t('access', 'tenant'), render: (row) => row.tenantName },
    { key: 'mfa', header: t('access', 'mfaStatus'), render: (row) => <StatusBadge label={t('access', MFA_KEY[row.mfaStatus])} tone={MFA_TONE[row.mfaStatus]} /> },
    { key: 'method', header: t('access', 'authenticator'), render: (row) => t('access', METHOD_KEY[row.mfaMethod]) },
    { key: 'devices', header: t('access', 'registeredDevices'), render: (row) => formatNumber(row.mfaDevices.length) },
    { key: 'recovery', header: t('access', 'recoveryOptions'), render: (row) => row.recoveryCodesRemaining > 0 ? `${formatNumber(row.recoveryCodesRemaining)} ${t('access', 'recoveryCodesRemaining').toLowerCase()}` : '—' },
  ];

  return <Page title={t('access', 'mfaTitle')} description={t('access', 'mfaDescription')}>
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label={t('access', 'mfaEnabled')} value={formatNumber(enabled.length)} icon={ShieldCheck} tone="success" />
      <StatCard label={t('access', 'mfaPending')} value={formatNumber(pending.length)} icon={AlertTriangle} tone="warning" />
      <StatCard label={t('access', 'mfaDisabled')} value={formatNumber(disabled.length)} icon={ShieldOff} tone="neutral" />
    </div>
    <Tabs defaultValue="all" className="min-w-0">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">
        <TabsTrigger value="all">{t('access', 'usersTitle')}</TabsTrigger>
        <TabsTrigger value="enabled">{t('access', 'mfaEnabled')}</TabsTrigger>
        <TabsTrigger value="pending">{t('access', 'mfaPending')}</TabsTrigger>
        <TabsTrigger value="disabled">{t('access', 'mfaDisabled')}</TabsTrigger>
      </TabsList>
      <TabsContent value="all"><DataTable columns={columns} rows={users} empty={<EmptyState icon={ShieldCheck} title={t('access', 'noUsers')} />} /></TabsContent>
      <TabsContent value="enabled"><DataTable columns={columns} rows={enabled} empty={<EmptyState icon={ShieldCheck} title={t('access', 'noUsers')} />} /></TabsContent>
      <TabsContent value="pending"><DataTable columns={columns} rows={pending} empty={<EmptyState icon={AlertTriangle} title={t('access', 'noUsers')} />} /></TabsContent>
      <TabsContent value="disabled"><DataTable columns={columns} rows={disabled} empty={<EmptyState icon={ShieldOff} title={t('access', 'noUsers')} />} /></TabsContent>
    </Tabs>
  </Page>;
}

// ----------------------------------------------------------------------- Module entry

export function AccessModule() {
  const { t, locale } = useLocale();
  const typedLocale = locale as 'fr' | 'en';
  return (
    <Routes>
      <Route index element={<UsersList t={t} />} />
      <Route path="users" element={<UsersList t={t} />} />
      <Route path="users/create" element={<UserCreate t={t} />} />
      <Route path="users/:id/edit" element={<UserEdit t={t} />} />
      <Route path="users/:id" element={<UserDetail t={t} locale={typedLocale} />} />
      <Route path="roles" element={<RolesList t={t} />} />
      <Route path="roles/create" element={<RoleCreate t={t} />} />
      <Route path="roles/:id/edit" element={<RoleEdit t={t} />} />
      <Route path="roles/:id" element={<RoleDetail t={t} />} />
      <Route path="permissions" element={<PermissionsPage t={t} />} />
      <Route path="sessions" element={<SessionsPage t={t} />} />
      <Route path="mfa" element={<MfaPage t={t} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
