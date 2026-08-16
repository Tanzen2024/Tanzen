import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, CalendarDays, ChevronRight, ClipboardCheck, Edit3, FileText, Landmark, Mail, MoreHorizontal, Network, PanelsTopLeft, Plus, ShieldCheck, UserCog, UserRound, Users, WalletCards } from 'lucide-react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, FormSection, Timeline, MoneyDisplay, DateDisplay, EmptyState, PermissionGate, TableSkeleton, DetailSkeleton, CardSkeleton, ErrorState, FieldError, ConfirmDialog } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { NotFoundPage } from '@/routes';
import { organizationService, type MemberInput } from '@/services/organization.service';
import { financeService } from '@/services/finance.service';
import { creditService } from '@/services/credit.service';
import { tontinesService } from '@/services/tontines.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { Tenant } from '@/mocks/organization/tenants';
import type { Member } from '@/mocks/organization/members';
import type { Contribution } from '@/mocks/finance/contributions';
import type { Loan } from '@/mocks/finance/loans';
import type { Assembly, Meeting, Vote, BoardMember, AssemblyType, VoteResult } from '@/mocks/organization/governance';
import type { AssemblyInput, MeetingInput, BoardMemberInput, VoteInput } from '@/services/organization.service';
import type { PositionRole } from '@/mocks/organization/members';
import { Textarea } from '@/components/ui/textarea';
import type { TableColumn } from '@/types/ui';
import { formatDate, formatNumber } from '@/lib/utils';

type T = (section: 'organization' | 'nav', key: string, values?: Record<string, string>) => string;

const statusTone = { active: 'success' as const, inactive: 'default' as const, pending: 'warning' as const, suspended: 'error' as const, ongoing: 'success' as const, expired: 'default' as const, upcoming: 'info' as const, adopted: 'success' as const, rejected: 'error' as const, repaid: 'success' as const, overdue: 'error' as const, completed: 'success' as const };

function OrganizationPage({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="ORGANIZATION" title={title} description={description} actions={actions} />{children}</div>;
}

function BackButton({ label }: { label: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={15} />{label}</Button>; }

function Avatar({ name, large = false }: { name: string; large?: boolean }) { const initials = name.split(' ').map((word) => word[0]).join('').slice(0, 2); return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-xl bg-primary/10 font-semibold text-primary ${large ? 'size-14 text-lg' : 'size-9 text-xs'}`}>{initials}</span>; }

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Mail }) { return <div className="flex gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }

function MembersDirectory({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all');
  const { data: members = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const filtered = members.filter((member) => `${member.firstName} ${member.lastName} ${member.email} ${member.tenantName}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || member.status === status));
  if (isLoading) return <OrganizationPage title={t('organization', 'membersTitle')} description={t('organization', 'membersDescription')}><TableSkeleton /></OrganizationPage>;
  if (isError) return <OrganizationPage title={t('organization', 'membersTitle')} description={t('organization', 'membersDescription')}><ErrorState onRetry={refetch} /></OrganizationPage>;
  const columns: TableColumn<Member>[] = [
    { key: 'member', header: t('organization', 'member'), render: (row) => <button type="button" onClick={() => navigate(`/organization/members/${row.id}`)} className="flex items-center gap-3 text-left"><Avatar name={`${row.firstName} ${row.lastName}`} /><span><span className="block font-semibold">{row.firstName} {row.lastName}</span><span className="block text-xs text-muted-foreground">{row.id} · {row.email}</span></span></button> },
    { key: 'tenant', header: t('organization', 'tenants'), render: (row) => row.tenantName },
    { key: 'role', header: t('organization', 'role'), render: (row) => row.positions.length ? t('organization', row.positions[0].role) : t('organization', 'member') },
    { key: 'joined', header: t('organization', 'joined'), render: (row) => <DateDisplay value={row.joinedAt} /> },
    { key: 'status', header: t('organization', 'status'), render: (row) => <StatusBadge label={t('organization', row.status)} tone={statusTone[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/organization/members/${row.id}`)} aria-label={t('organization', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <OrganizationPage title={t('organization', 'membersTitle')} description={t('organization', 'membersDescription')} actions={<PermissionGate permission="members.create"><Button onClick={() => navigate('/organization/members/create')}><Plus size={16} />{t('organization', 'addMember')}</Button></PermissionGate>}><FilterBar search={search} onSearchChange={setSearch} placeholder={`${t('organization', 'firstName')}…`} filters={<select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('organization', 'status')}</option><option value="active">{t('organization', 'active')}</option><option value="pending">{t('organization', 'pending')}</option><option value="inactive">{t('organization', 'inactive')}</option><option value="suspended">{t('organization', 'suspended')}</option></select>} /><div className="grid gap-3 sm:grid-cols-3"><Metric label={t('organization', 'members')} value={formatNumber(members.length)} icon={Users} /><Metric label={t('organization', 'active')} value={formatNumber(members.filter((member) => member.status === 'active').length)} icon={ShieldCheck} /><Metric label={t('organization', 'pending')} value={formatNumber(members.filter((member) => member.status === 'pending').length)} icon={ClipboardCheck} /></div><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={Users} title={t('organization', 'noMembers')} />} /></OrganizationPage>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) { return <Card><CardContent className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={17} /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 font-heading text-xl font-semibold">{value}</p></div></CardContent></Card>; }

type MemberFormValues = { firstName: string; lastName: string; email: string; phone: string; occupation: string; nationality: string; address: string; tenantId: string; status: Member['status'] };
type MemberFormErrors = Partial<Record<'firstName' | 'lastName' | 'email', string>>;

function validateMember(values: MemberFormValues, t: T): MemberFormErrors {
  const errors: MemberFormErrors = {};
  if (!values.firstName.trim()) errors.firstName = t('organization', 'fieldRequired');
  if (!values.lastName.trim()) errors.lastName = t('organization', 'fieldRequired');
  if (!values.email.trim()) errors.email = t('organization', 'fieldRequired');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = t('organization', 'invalidEmail');
  return errors;
}

function MemberFormFields({ values, onChange, errors, tenants, t }: { values: MemberFormValues; onChange: (patch: Partial<MemberFormValues>) => void; errors: MemberFormErrors; tenants: Tenant[]; t: T }) {
  return <><FormSection title={t('organization', 'personalInfo')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="member-first-name">{t('organization', 'firstName')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="member-first-name" value={values.firstName} onChange={(event) => onChange({ firstName: event.target.value })} required aria-required="true" aria-invalid={Boolean(errors.firstName)} aria-describedby={errors.firstName ? 'member-first-name-error' : undefined} /><span id="member-first-name-error"><FieldError message={errors.firstName} /></span></div><div className="space-y-2"><Label htmlFor="member-last-name">{t('organization', 'lastName')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="member-last-name" value={values.lastName} onChange={(event) => onChange({ lastName: event.target.value })} required aria-required="true" aria-invalid={Boolean(errors.lastName)} aria-describedby={errors.lastName ? 'member-last-name-error' : undefined} /><span id="member-last-name-error"><FieldError message={errors.lastName} /></span></div><div className="space-y-2"><Label htmlFor="member-email">{t('organization', 'email')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="member-email" type="email" value={values.email} onChange={(event) => onChange({ email: event.target.value })} required aria-required="true" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'member-email-error' : undefined} /><span id="member-email-error"><FieldError message={errors.email} /></span></div><div className="space-y-2"><Label htmlFor="member-phone">{t('organization', 'phone')}</Label><Input id="member-phone" value={values.phone} onChange={(event) => onChange({ phone: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="member-occupation">{t('organization', 'occupation')}</Label><Input id="member-occupation" value={values.occupation} onChange={(event) => onChange({ occupation: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="member-nationality">{t('organization', 'nationality')}</Label><Input id="member-nationality" value={values.nationality} onChange={(event) => onChange({ nationality: event.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="member-address">{t('organization', 'address')}</Label><Input id="member-address" value={values.address} onChange={(event) => onChange({ address: event.target.value })} /></div></div></FormSection><FormSection title={t('organization', 'general')}><div className="space-y-4"><div className="space-y-2"><Label htmlFor="member-tenant">{t('organization', 'tenants')}</Label><select id="member-tenant" value={values.tenantId} onChange={(event) => onChange({ tenantId: event.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="member-status-select">{t('organization', 'memberStatus')}</Label><select id="member-status-select" value={values.status} onChange={(event) => onChange({ status: event.target.value as MemberFormValues['status'] })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="active">{t('organization', 'active')}</option><option value="pending">{t('organization', 'pending')}</option></select></div></div></FormSection></>;
}

function MemberCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const { data: tenants = [] } = useQuery({ queryKey: queryKeys.tenants.list(currentTenant.id, user.scope), queryFn: () => organizationService.listTenants(currentTenant.id, user.scope) });
  const [values, setValues] = useState<MemberFormValues>({ firstName: '', lastName: '', email: '', phone: '', occupation: '', nationality: 'Sénégalaise', address: '', tenantId: currentTenant.id, status: 'pending' });
  const [errors, setErrors] = useState<MemberFormErrors>({});
  const mutation = useMockMutation<Member, ReturnType<typeof buildMemberInput>>({
    mutationFn: (input) => organizationService.createMember(input),
    invalidateKeys: [queryKeys.members.list(currentTenant.id)],
    onSuccess: (member) => { notify.success(t('organization', 'memberCreated')); navigate(`/organization/members/${member.id}`); },
  });
  const handleSave = () => {
    const nextErrors = validateMember(values, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const tenant = tenants.find((item) => item.id === values.tenantId);
    mutation.mutate(buildMemberInput(values, tenant?.name ?? ''));
  };
  return <OrganizationPage title={t('organization', 'addMember')} description={t('organization', 'membersDescription')} actions={<BackButton label={t('organization', 'backToMembers')} />}><div className="grid gap-5 lg:grid-cols-2"><MemberFormFields values={values} onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} errors={errors} tenants={tenants} t={t} /><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/organization/members')}>{t('organization', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('organization', 'saving') : t('organization', 'save')}</Button></div></div></OrganizationPage>;
}

function buildMemberInput(values: MemberFormValues, tenantName: string): MemberInput {
  const { tenantId, ...rest } = values;
  return { ...rest, tenantId, tenantName };
}

function MemberDetail({ t }: { t: T }) {
  const navigate = useNavigate(); const { id = '' } = useParams(); const { currentTenant } = useTenant();
  const [confirmStatus, setConfirmStatus] = useState(false);
  const { data: member, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.members.detail(id), currentTenant.id], queryFn: () => organizationService.getMember(currentTenant.id, id) });
  const statusMutation = useMockMutation<Member | undefined, Partial<MemberInput>>({
    mutationFn: (patch) => organizationService.updateMember(currentTenant.id, id, patch),
    invalidateKeys: [queryKeys.members.list(currentTenant.id), queryKeys.members.detail(id)],
    onSuccess: (_, patch) => { notify.success(t('organization', patch.status === 'suspended' ? 'memberSuspended' : 'memberReactivated')); setConfirmStatus(false); },
  });
  if (isLoading) return <OrganizationPage title={t('organization', 'memberDetail')} description=""><DetailSkeleton /></OrganizationPage>;
  if (isError) return <OrganizationPage title={t('organization', 'memberDetail')} description=""><ErrorState onRetry={refetch} /></OrganizationPage>;
  if (!member) return <NotFoundPage />;
  const fullName = `${member.firstName} ${member.lastName}`;
  const isSuspended = member.status === 'suspended';
  const nextStatus: Member['status'] = isSuspended ? 'active' : 'suspended';
  return <OrganizationPage title={fullName} description={`${member.id} · ${member.tenantName}`} actions={<><BackButton label={t('organization', 'backToMembers')} /><PermissionGate permission="members.update"><Button variant="outline" onClick={() => setConfirmStatus(true)}>{isSuspended ? <ShieldCheck size={15} /> : <UserCog size={15} />}{t('organization', isSuspended ? 'reactivateMember' : 'suspendMember')}</Button></PermissionGate><Button variant="outline" onClick={() => navigate(`/organization/members/${member.id}/edit`)}><Edit3 size={15} />{t('organization', 'editMember')}</Button></>}><div className="grid gap-5 lg:grid-cols-[280px_1fr]"><Card className="h-fit"><CardContent className="flex flex-col items-center p-6 text-center"><Avatar name={fullName} large /><h2 className="mt-4 text-lg font-semibold">{fullName}</h2><p className="mt-1 text-sm text-muted-foreground">{member.occupation}</p><div className="mt-4"><StatusBadge label={t('organization', member.status)} tone={statusTone[member.status]} /></div><div className="mt-5 w-full space-y-3 border-t border-border pt-5 text-left"><Info label={t('organization', 'email')} value={member.email} icon={Mail} /><Info label={t('organization', 'phone')} value={member.phone} icon={Mail} /><Info label={t('organization', 'tenants')} value={member.tenantName} icon={Building2} /></div></CardContent></Card><MemberTabs t={t} member={member} /></div>
    {confirmStatus && <ConfirmDialog open title={t('organization', isSuspended ? 'reactivateMember' : 'suspendMember')} description={t('organization', isSuspended ? 'reactivateMemberConfirm' : 'suspendMemberConfirm')} confirmLabel={t('organization', isSuspended ? 'reactivateMember' : 'suspendMember')} cancelLabel={t('organization', 'cancel')} onConfirm={() => statusMutation.mutate({ status: nextStatus })} onCancel={() => setConfirmStatus(false)} />}
  </OrganizationPage>;
}

function MemberEdit({ t }: { t: T }) {
  const { id = '' } = useParams(); const { currentTenant } = useTenant();
  const { data: member, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.members.detail(id), currentTenant.id], queryFn: () => organizationService.getMember(currentTenant.id, id) });
  if (isLoading) return <OrganizationPage title={t('organization', 'editMember')} description=""><DetailSkeleton /></OrganizationPage>;
  if (isError) return <OrganizationPage title={t('organization', 'editMember')} description=""><ErrorState onRetry={refetch} /></OrganizationPage>;
  if (!member) return <NotFoundPage />;
  return <MemberEditForm t={t} member={member} />;
}

function MemberEditForm({ t, member }: { t: T; member: Member }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const { data: tenants = [] } = useQuery({ queryKey: queryKeys.tenants.list(currentTenant.id, user.scope), queryFn: () => organizationService.listTenants(currentTenant.id, user.scope) });
  const [values, setValues] = useState<MemberFormValues>({ firstName: member.firstName, lastName: member.lastName, email: member.email, phone: member.phone, occupation: member.occupation, nationality: member.nationality, address: member.address, tenantId: member.tenantId, status: member.status });
  const [errors, setErrors] = useState<MemberFormErrors>({});
  const mutation = useMockMutation<Member | undefined, Partial<MemberInput>>({
    mutationFn: (patch) => organizationService.updateMember(currentTenant.id, member.id, patch),
    invalidateKeys: [queryKeys.members.list(currentTenant.id), queryKeys.members.detail(member.id)],
    onSuccess: () => { notify.success(t('organization', 'memberUpdated')); navigate(`/organization/members/${member.id}`); },
  });
  const handleSave = () => {
    const nextErrors = validateMember(values, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const tenant = tenants.find((item) => item.id === values.tenantId);
    mutation.mutate(buildMemberInput(values, tenant?.name ?? member.tenantName));
  };
  return <OrganizationPage title={t('organization', 'editMember')} description={`${member.firstName} ${member.lastName}`} actions={<BackButton label={t('organization', 'backToMembers')} />}><div className="grid gap-5 lg:grid-cols-2"><MemberFormFields values={values} onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} errors={errors} tenants={tenants} t={t} /><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/organization/members/${member.id}`)}>{t('organization', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('organization', 'saving') : t('organization', 'save')}</Button></div></div></OrganizationPage>;
}

function MemberTabs({ t, member }: { t: T; member: Member }) {
  const { data: tenantTontines = [] } = useQuery({ queryKey: queryKeys.tontines.list(member.tenantId), queryFn: () => tontinesService.listTontines(member.tenantId) });
  const tontineNameById = useMemo(() => new Map(tenantTontines.map((tontine) => [tontine.id, tontine.name])), [tenantTontines]);
  const tabs = [{ key: 'overview', label: t('organization', 'overview') }, { key: 'personal', label: t('organization', 'personalInfo') }, { key: 'positions', label: t('organization', 'positions') }, { key: 'accounts', label: t('organization', 'accounts') }, { key: 'contributions', label: t('organization', 'contributions') }, { key: 'loans', label: t('organization', 'loans') }, { key: 'tontines', label: t('organization', 'tontines') }, { key: 'governance', label: t('organization', 'memberGovernance') }, { key: 'documents', label: t('organization', 'documents') }, { key: 'activity', label: t('organization', 'activity') }];
  return <Tabs defaultValue="overview" className="min-w-0"><TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1"><TabsTrigger value="overview">{tabs[0].label}</TabsTrigger>{tabs.slice(1).map((tab) => <TabsTrigger key={tab.key} value={tab.key}>{tab.label}</TabsTrigger>)}</TabsList><TabsContent value="overview"><MemberOverviewTab t={t} member={member} /></TabsContent><TabsContent value="personal"><PersonalTab t={t} member={member} /></TabsContent><TabsContent value="positions"><PositionsTab t={t} member={member} /></TabsContent><TabsContent value="accounts"><AccountsTab t={t} member={member} /></TabsContent><TabsContent value="contributions"><ContributionsTab t={t} memberId={member.id} tontineNameById={tontineNameById} /></TabsContent><TabsContent value="loans"><LoansTab t={t} memberId={member.id} /></TabsContent><TabsContent value="tontines"><TontinesTab t={t} memberId={member.id} tontineNameById={tontineNameById} /></TabsContent><TabsContent value="governance"><GovernanceTab t={t} member={member} /></TabsContent><TabsContent value="documents"><DocumentsTab t={t} member={member} /></TabsContent><TabsContent value="activity"><Card><CardContent className="p-5"><Timeline items={member.activities.map((item) => ({ id: item.id, title: item.type, description: item.description, date: formatDate(item.date), tone: 'default' as const }))} /></CardContent></Card></TabsContent></Tabs>;
}

function MemberOverviewTab({ t, member }: { t: T; member: Member }) {
  const { data: contributions = [] } = useQuery({ queryKey: queryKeys.finance.contributionsByMember(member.id), queryFn: () => financeService.listContributionsByMember(member.id) });
  const { data: loans = [] } = useQuery({ queryKey: queryKeys.credit.loansByMember(member.id), queryFn: () => creditService.listLoansByMember(member.id) });
  return <><div className="grid gap-4 sm:grid-cols-3"><Metric label={t('organization', 'accounts')} value={formatNumber(member.accounts.length)} icon={WalletCards} /><Metric label={t('organization', 'contributions')} value={formatNumber(contributions.length)} icon={Landmark} /><Metric label={t('organization', 'loans')} value={formatNumber(loans.length)} icon={Network} /></div><Card className="mt-4"><CardHeader><CardTitle className="text-sm">{t('organization', 'activity')}</CardTitle></CardHeader><CardContent><Timeline items={member.activities.map((item) => ({ id: item.id, title: item.type, description: item.description, date: formatDate(item.date), tone: 'default' as const }))} /></CardContent></Card></>;
}

function PersonalTab({ t, member }: { t: T; member: Member }) { const fields = [['firstName', member.firstName], ['lastName', member.lastName], ['gender', t('organization', member.gender)], ['birthDate', formatDate(member.birthDate)], ['nationality', member.nationality], ['idNumber', member.idNumber], ['occupation', member.occupation], ['joined', formatDate(member.joinedAt)]]; return <Card><CardHeader><CardTitle className="text-sm">{t('organization', 'personalInfo')}</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">{fields.map(([label, value]) => <Info key={label} label={t('organization', label)} value={value} icon={UserRound} />)}</CardContent></Card>; }
function PositionsTab({ t, member }: { t: T; member: Member }) { return <div className="space-y-3">{member.positions.map((position) => <Card key={position.id}><CardContent className="flex flex-wrap items-center gap-4 p-4"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UserCog size={17} /></span><div className="min-w-40 flex-1"><p className="text-sm font-semibold">{t('organization', position.role)}</p><p className="text-xs text-muted-foreground">{position.tenantName}</p></div><div><p className="text-xs text-muted-foreground">{t('organization', 'mandateStart')}</p><p className="text-sm"><DateDisplay value={position.startDate} /></p></div><div><p className="text-xs text-muted-foreground">{t('organization', 'mandateEnd')}</p><p className="text-sm">{position.endDate ? <DateDisplay value={position.endDate} /> : '—'}</p></div><StatusBadge label={position.endDate ? t('organization', 'expired') : t('organization', 'ongoing')} tone={position.endDate ? 'default' : 'success'} /></CardContent></Card>)}{member.positions.length === 0 && <EmptyState icon={UserCog} title={t('organization', 'noPositions')} />}</div>; }
function AccountsTab({ t, member }: { t: T; member: Member }) { return <div className="grid gap-4 sm:grid-cols-2">{member.accounts.map((account) => <Card key={account.id}><CardContent className="p-5"><div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><WalletCards size={17} /></span><StatusBadge label={t('organization', 'active')} tone="success" /></div><p className="mt-4 text-xs text-muted-foreground">{t('organization', account.type)}</p><p className="mt-1 font-mono text-sm font-semibold">{account.accountNumber}</p><p className="mt-4 font-heading text-xl font-semibold"><MoneyDisplay amount={account.balance} /></p><p className="mt-1 text-xs text-muted-foreground">{t('organization', 'balance')}</p></CardContent></Card>)}{member.accounts.length === 0 && <EmptyState icon={WalletCards} title={t('organization', 'noAccounts')} />}</div>; }

function ContributionsTab({ t, memberId, tontineNameById }: { t: T; memberId: string; tontineNameById: Map<string, string> }) {
  const { data: rows = [] } = useQuery({ queryKey: queryKeys.finance.contributionsByMember(memberId), queryFn: () => financeService.listContributionsByMember(memberId) });
  const columns: TableColumn<Contribution>[] = [
    { key: 'tontineId', header: t('organization', 'tontineName'), render: (row) => tontineNameById.get(row.tontineId) ?? row.tontineId },
    { key: 'cycleNumber', header: t('organization', 'cycle'), render: (row) => row.cycleNumber },
    { key: 'amount', header: t('organization', 'amount'), render: (row) => <MoneyDisplay amount={row.amount} /> },
    { key: 'date', header: t('organization', 'date'), render: (row) => <DateDisplay value={row.date} /> },
  ];
  return <DataTable columns={columns} rows={rows} empty={<EmptyState icon={Landmark} title={t('organization', 'noContributions')} />} />;
}

const LOAN_STATUS_TONE = { pending: 'warning', active: 'success', repaid: 'success', defaulted: 'error' } as const;

function LoansTab({ t, memberId }: { t: T; memberId: string }) {
  const { data: loans = [] } = useQuery({ queryKey: queryKeys.credit.loansByMember(memberId), queryFn: () => creditService.listLoansByMember(memberId) });
  return <div className="space-y-3">{loans.map((loan: Loan) => <Card key={loan.id}><CardContent className="flex flex-wrap items-center gap-4 p-4"><span className="grid size-9 place-items-center rounded-lg bg-amber-500/10 text-amber-600"><Network size={17} /></span><div className="min-w-24 flex-1"><p className="text-xs text-muted-foreground">{loan.id}</p><p className="font-semibold"><MoneyDisplay amount={loan.principal} /></p></div><div><p className="text-xs text-muted-foreground">{t('organization', 'dueDate')}</p><p className="text-sm"><DateDisplay value={loan.nextPaymentDate} /></p></div><div className="min-w-32"><p className="mb-1 text-xs text-muted-foreground">{t('organization', 'progress')} · {loan.progress}%</p><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${loan.progress}%` }} /></div></div><StatusBadge label={t('organization', loan.status)} tone={LOAN_STATUS_TONE[loan.status]} /></CardContent></Card>)}{loans.length === 0 && <EmptyState icon={Network} title={t('organization', 'noLoans')} />}</div>;
}

const CYCLE_STATUS_LABEL: Record<string, string> = { statusDraft: 'Brouillon', statusOpen: 'Ouvert', statusSuspended: 'Suspendu', statusClosed: 'Clôturé' };

function TontinesTab({ t, memberId, tontineNameById }: { t: T; memberId: string; tontineNameById: Map<string, string> }) {
  const { currentTenant } = useTenant();
  const { data: cycles = [] } = useQuery({ queryKey: queryKeys.tontines.cyclesByMember(memberId), queryFn: () => tontinesService.listCyclesByMember(currentTenant.id, memberId) });
  return <div className="grid gap-4 sm:grid-cols-2">{cycles.map((cycle) => <Card key={cycle.id}><CardContent className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Landmark size={17} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" title={tontineNameById.get(cycle.tontineId) ?? cycle.tontineId}>{tontineNameById.get(cycle.tontineId) ?? cycle.tontineId}</p><p className="text-xs text-muted-foreground">{t('organization', 'cycle')} {cycle.cycleNumber}</p></div><StatusBadge label={CYCLE_STATUS_LABEL[cycle.status] ?? cycle.status} tone={cycle.status === 'statusOpen' ? 'success' : cycle.status === 'statusSuspended' ? 'warning' : 'default'} /></CardContent></Card>)}{cycles.length === 0 && <EmptyState icon={Landmark} title={t('organization', 'noTontines')} />}</div>;
}

function GovernanceTab({ t, member }: { t: T; member: Member }) { return <Card><CardContent className="p-5">{member.governanceParticipation.length ? <Timeline items={member.governanceParticipation.map((item) => ({ id: item.id, title: item.assemblyName, description: item.role, date: formatDate(item.date), tone: 'success' as const }))} /> : <EmptyState icon={ShieldCheck} title={t('organization', 'noGovernance')} />}</CardContent></Card>; }
function DocumentsTab({ t, member }: { t: T; member: Member }) { const columns: TableColumn<typeof member.documents[number]>[] = [{ key: 'name', header: t('organization', 'documentName'), render: (row) => <span className="flex items-center gap-2 font-medium"><FileText size={15} className="text-primary" />{row.name}</span> }, { key: 'type', header: t('organization', 'documentType'), render: (row) => t('organization', row.type) }, { key: 'uploadedAt', header: t('organization', 'uploaded'), render: (row) => <DateDisplay value={row.uploadedAt} /> }, { key: 'action', header: '', className: 'w-12', render: (row) => <button type="button" aria-label={`${t('organization', 'actions')} — ${row.name}`} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><MoreHorizontal size={16} /></button> }]; return <DataTable columns={columns} rows={member.documents} empty={<EmptyState icon={FileText} title={t('organization', 'noDocuments')} />} />; }

function GovernanceOverview({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const assembliesQuery = useQuery({ queryKey: queryKeys.governance.assemblies(currentTenant.id), queryFn: () => organizationService.listAssemblies(currentTenant.id) });
  const meetingsQuery = useQuery({ queryKey: queryKeys.governance.meetings(currentTenant.id), queryFn: () => organizationService.listMeetings(currentTenant.id) });
  const votesQuery = useQuery({ queryKey: queryKeys.governance.votes(currentTenant.id), queryFn: () => organizationService.listVotes(currentTenant.id) });
  const boardQuery = useQuery({ queryKey: queryKeys.governance.board(currentTenant.id), queryFn: () => organizationService.listBoardMembers(currentTenant.id) });
  const assemblies = assembliesQuery.data ?? []; const meetings = meetingsQuery.data ?? []; const votes = votesQuery.data ?? []; const boardMembers = boardQuery.data ?? [];
  if (assembliesQuery.isLoading || meetingsQuery.isLoading || votesQuery.isLoading || boardQuery.isLoading) return <OrganizationPage title={t('organization', 'governanceTitle')} description={t('organization', 'governanceDescription')}><CardSkeleton count={4} /></OrganizationPage>;
  if (assembliesQuery.isError || meetingsQuery.isError || votesQuery.isError || boardQuery.isError) return <OrganizationPage title={t('organization', 'governanceTitle')} description={t('organization', 'governanceDescription')}><ErrorState onRetry={() => { assembliesQuery.refetch(); meetingsQuery.refetch(); votesQuery.refetch(); boardQuery.refetch(); }} /></OrganizationPage>;
  return <OrganizationPage title={t('organization', 'governanceTitle')} description={t('organization', 'governanceDescription')}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[{ key: 'assemblies', icon: PanelsTopLeft, count: assemblies.length, path: '/organization/governance/assemblies' }, { key: 'meetings', icon: CalendarDays, count: meetings.length, path: '/organization/governance/meetings' }, { key: 'votes', icon: ClipboardCheck, count: votes.length, path: '/organization/governance/votes' }, { key: 'boardMandates', icon: UserCog, count: boardMembers.length, path: '/organization/governance/board-mandates' }].map((item) => <button type="button" key={item.key} onClick={() => navigate(item.path)} className="group text-left"><Card className="h-full transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md"><CardContent className="p-5"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><item.icon size={19} /></span><p className="mt-5 text-sm font-semibold">{t('organization', item.key)}</p><p className="mt-1 font-heading text-2xl font-semibold">{formatNumber(item.count)}</p><p className="mt-1 flex items-center gap-1 text-xs text-primary">{t('organization', 'viewDetail')}<ChevronRight size={13} /></p></CardContent></Card></button>)}</div><Card><CardHeader><CardTitle className="text-sm">{t('organization', 'upcoming')}</CardTitle></CardHeader><CardContent><Timeline items={assemblies.filter((assembly) => assembly.status === 'upcoming').map((assembly) => ({ id: assembly.id, title: assembly.name, description: `${t('organization', assembly.type)} · ${assembly.location}`, date: formatDate(assembly.date), tone: 'success' as const }))} /></CardContent></Card></OrganizationPage>;
}

function GovernanceTableShell({ title, description, action, icon: Icon, t, onCreate, children }: { title: string; description: string; action: string; icon: typeof CalendarDays; t: T; onCreate: () => void; children: ReactNode }) { const navigate = useNavigate(); return <OrganizationPage title={title} description={description} actions={<PermissionGate permission="governance.create"><Button onClick={onCreate}><Plus size={16} />{action}</Button></PermissionGate>}><div className="flex items-center gap-2 border-b border-border pb-3 text-sm text-muted-foreground"><button type="button" onClick={() => navigate('/organization/governance')} className="hover:text-foreground">{t('organization', 'governanceTitle')}</button><ChevronRight size={14} /><Icon size={14} className="text-primary" /><span className="font-medium text-foreground">{title}</span></div>{children}</OrganizationPage>; }

const BOARD_POSITIONS: PositionRole[] = ['president', 'treasurer', 'secretary', 'boardMember'];

function GovernanceTablePage({ t, kind }: { t: T; kind: 'assemblies' | 'meetings' | 'votes' | 'boardMandates' }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const assembliesQuery = useQuery({ queryKey: queryKeys.governance.assemblies(currentTenant.id), queryFn: () => organizationService.listAssemblies(currentTenant.id), enabled: kind === 'assemblies' });
  const meetingsQuery = useQuery({ queryKey: queryKeys.governance.meetings(currentTenant.id), queryFn: () => organizationService.listMeetings(currentTenant.id), enabled: kind === 'meetings' });
  const votesQuery = useQuery({ queryKey: queryKeys.governance.votes(currentTenant.id), queryFn: () => organizationService.listVotes(currentTenant.id), enabled: kind === 'votes' });
  const boardQuery = useQuery({ queryKey: queryKeys.governance.board(currentTenant.id), queryFn: () => organizationService.listBoardMembers(currentTenant.id), enabled: kind === 'boardMandates' });
  const membersQuery = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id), enabled: kind === 'boardMandates' });
  const assemblies = assembliesQuery.data ?? []; const meetings = meetingsQuery.data ?? []; const votes = votesQuery.data ?? []; const boardMembers = boardQuery.data ?? []; const members = membersQuery.data ?? [];
  const activeQuery = kind === 'assemblies' ? assembliesQuery : kind === 'meetings' ? meetingsQuery : kind === 'votes' ? votesQuery : boardQuery;

  const [createOpen, setCreateOpen] = useState(false);
  const [assemblyForm, setAssemblyForm] = useState({ name: '', type: 'generalAssembly' as AssemblyType, date: '', location: '', participants: 0, agenda: '' });
  const [meetingForm, setMeetingForm] = useState({ title: '', date: '', location: '', participants: 0, agenda: '' });
  const [boardForm, setBoardForm] = useState({ memberId: '', position: 'president' as PositionRole, mandateStart: '', mandateEnd: '' });
  const [voteForm, setVoteForm] = useState({ subject: '', date: '' });
  const [minutesTarget, setMinutesTarget] = useState<Meeting | null>(null);
  const [minutesText, setMinutesText] = useState('');
  const [mandateTarget, setMandateTarget] = useState<BoardMember | null>(null);
  const [resultTarget, setResultTarget] = useState<Vote | null>(null);
  const [resultForm, setResultForm] = useState({ yes: 0, no: 0, abstain: 0, result: 'adopted' as VoteResult });

  const createAssembly = useMockMutation<Assembly, AssemblyInput>({ mutationFn: (input) => organizationService.createAssembly(currentTenant.id, input), invalidateKeys: [queryKeys.governance.assemblies(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'assemblyCreated')); setCreateOpen(false); setAssemblyForm({ name: '', type: 'generalAssembly', date: '', location: '', participants: 0, agenda: '' }); } });
  const createMeeting = useMockMutation<Meeting, MeetingInput>({ mutationFn: (input) => organizationService.createMeeting(currentTenant.id, input), invalidateKeys: [queryKeys.governance.meetings(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'meetingCreated')); setCreateOpen(false); setMeetingForm({ title: '', date: '', location: '', participants: 0, agenda: '' }); } });
  const createBoardMember = useMockMutation<BoardMember, BoardMemberInput>({ mutationFn: (input) => organizationService.createBoardMember(currentTenant.id, input), invalidateKeys: [queryKeys.governance.board(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'boardMemberAdded')); setCreateOpen(false); setBoardForm({ memberId: '', position: 'president', mandateStart: '', mandateEnd: '' }); } });
  const createVote = useMockMutation<Vote, VoteInput>({ mutationFn: (input) => organizationService.createVote(currentTenant.id, input), invalidateKeys: [queryKeys.governance.votes(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'voteCreated')); setCreateOpen(false); setVoteForm({ subject: '', date: '' }); } });
  const publishMinutes = useMockMutation<Meeting | undefined, string>({ mutationFn: (minutes) => organizationService.updateMeetingMinutes(currentTenant.id, minutesTarget?.id ?? '', minutes), invalidateKeys: [queryKeys.governance.meetings(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'minutesPublished')); setMinutesTarget(null); setMinutesText(''); } });
  const endMandate = useMockMutation<BoardMember | undefined, void>({ mutationFn: () => organizationService.endBoardMandate(currentTenant.id, mandateTarget?.id ?? '', new Date().toISOString().slice(0, 10)), invalidateKeys: [queryKeys.governance.board(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'mandateEnded')); setMandateTarget(null); } });
  const publishResult = useMockMutation<Vote | undefined, typeof resultForm>({ mutationFn: (patch) => organizationService.updateVoteResult(currentTenant.id, resultTarget?.id ?? '', patch), invalidateKeys: [queryKeys.governance.votes(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'resultPublished')); setResultTarget(null); } });

  if (activeQuery.isLoading) return <OrganizationPage title={t('organization', 'governanceTitle')} description=""><TableSkeleton /></OrganizationPage>;
  if (activeQuery.isError) return <OrganizationPage title={t('organization', 'governanceTitle')} description=""><ErrorState onRetry={activeQuery.refetch} /></OrganizationPage>;

  if (kind === 'assemblies') {
    const columns: TableColumn<Assembly>[] = [{ key: 'name', header: t('organization', 'assemblyName'), render: (row) => <span className="font-semibold">{row.name}</span> }, { key: 'type', header: t('organization', 'assemblyType'), render: (row) => t('organization', row.type) }, { key: 'date', header: t('organization', 'date'), render: (row) => <DateDisplay value={row.date} /> }, { key: 'location', header: t('organization', 'location') }, { key: 'participants', header: t('organization', 'participants') }, { key: 'status', header: t('organization', 'status'), render: (row) => <StatusBadge label={t('organization', row.status)} tone={statusTone[row.status]} /> }];
    return <GovernanceTableShell title={t('organization', 'assembliesTitle')} description={t('organization', 'assembliesDescription')} action={t('organization', 'createAssembly')} icon={PanelsTopLeft} t={t} onCreate={() => setCreateOpen(true)}>
      <DataTable columns={columns} rows={assemblies} empty={<EmptyState icon={PanelsTopLeft} title={t('organization', 'noAssemblies')} />} />
      {createOpen && <ConfirmDialog open title={t('organization', 'createAssembly')} confirmLabel={t('organization', 'save')} cancelLabel={t('organization', 'cancel')} onConfirm={() => createAssembly.mutate({ ...assemblyForm, participants: Number(assemblyForm.participants) })} onCancel={() => setCreateOpen(false)}>
        <div className="mt-4 space-y-3 text-left">
          <div className="space-y-1"><Label htmlFor="assembly-name">{t('organization', 'name')}</Label><Input id="assembly-name" value={assemblyForm.name} onChange={(e) => setAssemblyForm((v) => ({ ...v, name: e.target.value }))} /></div>
          <div className="space-y-1"><Label htmlFor="assembly-type">{t('organization', 'assemblyType')}</Label><select id="assembly-type" value={assemblyForm.type} onChange={(e) => setAssemblyForm((v) => ({ ...v, type: e.target.value as AssemblyType }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="generalAssembly">{t('organization', 'generalAssembly')}</option><option value="extraordinaryAssembly">{t('organization', 'extraordinaryAssembly')}</option><option value="boardAssembly">{t('organization', 'boardAssembly')}</option></select></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor="assembly-date">{t('organization', 'date')}</Label><Input id="assembly-date" type="date" value={assemblyForm.date} onChange={(e) => setAssemblyForm((v) => ({ ...v, date: e.target.value }))} /></div><div className="space-y-1"><Label htmlFor="assembly-participants">{t('organization', 'participants')}</Label><Input id="assembly-participants" type="number" min={0} value={assemblyForm.participants} onChange={(e) => setAssemblyForm((v) => ({ ...v, participants: Number(e.target.value) }))} /></div></div>
          <div className="space-y-1"><Label htmlFor="assembly-location">{t('organization', 'location')}</Label><Input id="assembly-location" value={assemblyForm.location} onChange={(e) => setAssemblyForm((v) => ({ ...v, location: e.target.value }))} /></div>
          <div className="space-y-1"><Label htmlFor="assembly-agenda">{t('organization', 'agenda')}</Label><Textarea id="assembly-agenda" value={assemblyForm.agenda} onChange={(e) => setAssemblyForm((v) => ({ ...v, agenda: e.target.value }))} /></div>
        </div>
      </ConfirmDialog>}
    </GovernanceTableShell>;
  }

  if (kind === 'meetings') {
    const columns: TableColumn<Meeting>[] = [{ key: 'title', header: t('organization', 'meetingTitle'), render: (row) => <span className="font-semibold">{row.title}</span> }, { key: 'date', header: t('organization', 'meetingDate'), render: (row) => <DateDisplay value={row.date} /> }, { key: 'location', header: t('organization', 'location') }, { key: 'participants', header: t('organization', 'participants') }, { key: 'minutes', header: t('organization', 'minutes'), render: (row) => row.minutes ?? '—' }, { key: 'actions', header: '', className: 'w-40', render: (row) => <PermissionGate permission="governance.approve"><Button variant="outline" size="sm" onClick={() => { setMinutesTarget(row); setMinutesText(row.minutes ?? ''); }}>{t('organization', 'publishMinutes')}</Button></PermissionGate> }];
    return <GovernanceTableShell title={t('organization', 'meetingsTitle')} description={t('organization', 'meetingsDescription')} action={t('organization', 'createMeeting')} icon={CalendarDays} t={t} onCreate={() => setCreateOpen(true)}>
      <DataTable columns={columns} rows={meetings} empty={<EmptyState icon={CalendarDays} title={t('organization', 'noMeetings')} />} />
      {createOpen && <ConfirmDialog open title={t('organization', 'createMeeting')} confirmLabel={t('organization', 'save')} cancelLabel={t('organization', 'cancel')} onConfirm={() => createMeeting.mutate({ ...meetingForm, participants: Number(meetingForm.participants) })} onCancel={() => setCreateOpen(false)}>
        <div className="mt-4 space-y-3 text-left">
          <div className="space-y-1"><Label htmlFor="meeting-title">{t('organization', 'title')}</Label><Input id="meeting-title" value={meetingForm.title} onChange={(e) => setMeetingForm((v) => ({ ...v, title: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor="meeting-date">{t('organization', 'date')}</Label><Input id="meeting-date" type="date" value={meetingForm.date} onChange={(e) => setMeetingForm((v) => ({ ...v, date: e.target.value }))} /></div><div className="space-y-1"><Label htmlFor="meeting-participants">{t('organization', 'participants')}</Label><Input id="meeting-participants" type="number" min={0} value={meetingForm.participants} onChange={(e) => setMeetingForm((v) => ({ ...v, participants: Number(e.target.value) }))} /></div></div>
          <div className="space-y-1"><Label htmlFor="meeting-location">{t('organization', 'location')}</Label><Input id="meeting-location" value={meetingForm.location} onChange={(e) => setMeetingForm((v) => ({ ...v, location: e.target.value }))} /></div>
          <div className="space-y-1"><Label htmlFor="meeting-agenda">{t('organization', 'agenda')}</Label><Textarea id="meeting-agenda" value={meetingForm.agenda} onChange={(e) => setMeetingForm((v) => ({ ...v, agenda: e.target.value }))} /></div>
        </div>
      </ConfirmDialog>}
      {minutesTarget && <ConfirmDialog open title={t('organization', 'publishMinutes')} description={t('organization', 'publishMinutesConfirm')} confirmLabel={t('organization', 'publishMinutes')} cancelLabel={t('organization', 'cancel')} onConfirm={() => publishMinutes.mutate(minutesText)} onCancel={() => setMinutesTarget(null)}>
        <div className="mt-4 space-y-1 text-left"><Label htmlFor="minutes-text">{t('organization', 'minutes')}</Label><Textarea id="minutes-text" value={minutesText} onChange={(e) => setMinutesText(e.target.value)} rows={5} /></div>
      </ConfirmDialog>}
    </GovernanceTableShell>;
  }

  if (kind === 'votes') {
    const columns: TableColumn<Vote>[] = [{ key: 'subject', header: t('organization', 'voteSubject'), render: (row) => <span className="font-semibold">{row.subject}</span> }, { key: 'date', header: t('organization', 'voteDate'), render: (row) => <DateDisplay value={row.date} /> }, { key: 'yes', header: t('organization', 'yes') }, { key: 'no', header: t('organization', 'no') }, { key: 'abstain', header: t('organization', 'abstain') }, { key: 'result', header: t('organization', 'result'), render: (row) => <StatusBadge label={t('organization', row.result)} tone={statusTone[row.result]} /> }, { key: 'actions', header: '', className: 'w-40', render: (row) => row.result === 'pending' && <PermissionGate permission="governance.approve"><Button variant="outline" size="sm" onClick={() => { setResultTarget(row); setResultForm({ yes: row.yes, no: row.no, abstain: row.abstain, result: 'adopted' }); }}>{t('organization', 'publishResult')}</Button></PermissionGate> }];
    return <GovernanceTableShell title={t('organization', 'votesTitle')} description={t('organization', 'votesDescription')} action={t('organization', 'createVote')} icon={ClipboardCheck} t={t} onCreate={() => setCreateOpen(true)}>
      <DataTable columns={columns} rows={votes} empty={<EmptyState icon={ClipboardCheck} title={t('organization', 'noVotes')} />} />
      {createOpen && <ConfirmDialog open title={t('organization', 'createVote')} confirmLabel={t('organization', 'save')} cancelLabel={t('organization', 'cancel')} onConfirm={() => createVote.mutate(voteForm)} onCancel={() => setCreateOpen(false)}>
        <div className="mt-4 space-y-3 text-left">
          <div className="space-y-1"><Label htmlFor="vote-subject">{t('organization', 'voteSubject')}</Label><Input id="vote-subject" value={voteForm.subject} onChange={(e) => setVoteForm((v) => ({ ...v, subject: e.target.value }))} /></div>
          <div className="space-y-1"><Label htmlFor="vote-date">{t('organization', 'voteDate')}</Label><Input id="vote-date" type="date" value={voteForm.date} onChange={(e) => setVoteForm((v) => ({ ...v, date: e.target.value }))} /></div>
        </div>
      </ConfirmDialog>}
      {resultTarget && <ConfirmDialog open title={t('organization', 'publishResult')} description={t('organization', 'publishResultConfirm')} confirmLabel={t('organization', 'publishResult')} cancelLabel={t('organization', 'cancel')} onConfirm={() => publishResult.mutate(resultForm)} onCancel={() => setResultTarget(null)}>
        <div className="mt-4 space-y-3 text-left">
          <div className="grid grid-cols-3 gap-3"><div className="space-y-1"><Label htmlFor="result-yes">{t('organization', 'yes')}</Label><Input id="result-yes" type="number" min={0} value={resultForm.yes} onChange={(e) => setResultForm((v) => ({ ...v, yes: Number(e.target.value) }))} /></div><div className="space-y-1"><Label htmlFor="result-no">{t('organization', 'no')}</Label><Input id="result-no" type="number" min={0} value={resultForm.no} onChange={(e) => setResultForm((v) => ({ ...v, no: Number(e.target.value) }))} /></div><div className="space-y-1"><Label htmlFor="result-abstain">{t('organization', 'abstain')}</Label><Input id="result-abstain" type="number" min={0} value={resultForm.abstain} onChange={(e) => setResultForm((v) => ({ ...v, abstain: Number(e.target.value) }))} /></div></div>
          <div className="space-y-1"><Label htmlFor="result-outcome">{t('organization', 'result')}</Label><select id="result-outcome" value={resultForm.result} onChange={(e) => setResultForm((v) => ({ ...v, result: e.target.value as VoteResult }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="adopted">{t('organization', 'adopted')}</option><option value="rejected">{t('organization', 'rejected')}</option></select></div>
        </div>
      </ConfirmDialog>}
    </GovernanceTableShell>;
  }

  const columns: TableColumn<BoardMember>[] = [{ key: 'memberName', header: t('organization', 'boardMemberName'), render: (row) => <button type="button" onClick={() => navigate(`/organization/members/${row.memberId}`)} className="flex items-center gap-3 text-left"><Avatar name={row.memberName} /><span><span className="block font-semibold">{row.memberName}</span><span className="block text-xs text-muted-foreground">{row.memberId}</span></span></button> }, { key: 'position', header: t('organization', 'position'), render: (row) => t('organization', row.position) }, { key: 'mandateStart', header: t('organization', 'mandateStart'), render: (row) => <DateDisplay value={row.mandateStart} /> }, { key: 'mandateEnd', header: t('organization', 'mandateEnd'), render: (row) => <DateDisplay value={row.mandateEnd} /> }, { key: 'status', header: t('organization', 'mandateStatus'), render: (row) => <StatusBadge label={t('organization', row.status)} tone={statusTone[row.status]} /> }, { key: 'actions', header: '', className: 'w-40', render: (row) => row.status === 'ongoing' && <PermissionGate permission="governance.approve"><Button variant="outline" size="sm" onClick={() => setMandateTarget(row)}>{t('organization', 'endMandate')}</Button></PermissionGate> }];
  return <GovernanceTableShell title={t('organization', 'boardMandatesTitle')} description={t('organization', 'boardMandatesDescription')} action={t('organization', 'addBoardMember')} icon={UserCog} t={t} onCreate={() => setCreateOpen(true)}>
    <DataTable columns={columns} rows={boardMembers} empty={<EmptyState icon={UserCog} title={t('organization', 'noBoardMembers')} />} />
    {createOpen && <ConfirmDialog open title={t('organization', 'addBoardMember')} confirmLabel={t('organization', 'save')} cancelLabel={t('organization', 'cancel')} onConfirm={() => { const member = members.find((m) => m.id === boardForm.memberId); if (!member) return; createBoardMember.mutate({ memberId: member.id, memberName: `${member.firstName} ${member.lastName}`, position: boardForm.position, mandateStart: boardForm.mandateStart, mandateEnd: boardForm.mandateEnd }); }} onCancel={() => setCreateOpen(false)}>
      <div className="mt-4 space-y-3 text-left">
        <div className="space-y-1"><Label htmlFor="board-member">{t('organization', 'selectMember')}</Label><select id="board-member" value={boardForm.memberId} onChange={(e) => setBoardForm((v) => ({ ...v, memberId: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">{t('organization', 'selectMember')}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="board-position">{t('organization', 'position')}</Label><select id="board-position" value={boardForm.position} onChange={(e) => setBoardForm((v) => ({ ...v, position: e.target.value as PositionRole }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{BOARD_POSITIONS.map((role) => <option key={role} value={role}>{t('organization', role)}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor="board-mandate-start">{t('organization', 'mandateStart')}</Label><Input id="board-mandate-start" type="date" value={boardForm.mandateStart} onChange={(e) => setBoardForm((v) => ({ ...v, mandateStart: e.target.value }))} /></div><div className="space-y-1"><Label htmlFor="board-mandate-end">{t('organization', 'mandateEnd')}</Label><Input id="board-mandate-end" type="date" value={boardForm.mandateEnd} onChange={(e) => setBoardForm((v) => ({ ...v, mandateEnd: e.target.value }))} /></div></div>
      </div>
    </ConfirmDialog>}
    {mandateTarget && <ConfirmDialog open title={t('organization', 'endMandate')} description={t('organization', 'endMandateConfirm')} confirmLabel={t('organization', 'endMandate')} cancelLabel={t('organization', 'cancel')} onConfirm={() => endMandate.mutate()} onCancel={() => setMandateTarget(null)} />}
  </GovernanceTableShell>;
}

/**
 * Le registre des tenants (ex-`/organization/tenants*`) vit désormais sous
 * Platform Administration (`src/features/platform/platform-module.tsx`,
 * routes `/platform/tenants*`) — voir docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md.
 * Organization ne représente plus que le tenant courant (Members/Governance).
 */
export function OrganizationModule() {
  const { t } = useLocale();
  return (
    <Routes>
      <Route index element={<Navigate to="members" replace />} />
      <Route path="members" element={<MembersDirectory t={t} />} />
      <Route path="members/create" element={<MemberCreate t={t} />} />
      <Route path="members/:id/edit" element={<MemberEdit t={t} />} />
      <Route path="members/:id" element={<MemberDetail t={t} />} />
      <Route path="governance" element={<GovernanceOverview t={t} />} />
      <Route path="governance/assemblies" element={<GovernanceTablePage t={t} kind="assemblies" />} />
      <Route path="governance/meetings" element={<GovernanceTablePage t={t} kind="meetings" />} />
      <Route path="governance/votes" element={<GovernanceTablePage t={t} kind="votes" />} />
      <Route path="governance/board-mandates" element={<GovernanceTablePage t={t} kind="boardMandates" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
