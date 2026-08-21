import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, CalendarDays, Camera, CheckCircle2, ChevronRight, ClipboardCheck, Edit3, FileText, Landmark, Mail, MoreHorizontal, Network, Play, Plus, Printer, ShieldCheck, Trash2, UserCog, UserRound, Users, UsersRound, WalletCards, X, XCircle } from 'lucide-react';
import { Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader, DataTable, StatusBadge, FormSection, Timeline, MoneyDisplay, DateDisplay, EmptyState, PermissionGate, TableSkeleton, DetailSkeleton, CardSkeleton, ErrorState, FieldError, ConfirmDialog } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage, PermissionRoute } from '@/routes';
import { organizationService, type MemberInput } from '@/services/organization.service';
import { financeService } from '@/services/finance.service';
import { creditService } from '@/services/credit.service';
import { tontinesService } from '@/services/tontines.service';
import { attendanceService, type AttendanceInput } from '@/services/attendance.service';
import { quorumService, type QuorumThresholdInput } from '@/services/quorum.service';
import { assemblyDecisionService, type AssemblyDecisionInput } from '@/services/assembly-decision.service';
import { decisionVoteService, type CreateDecisionVoteInput } from '@/services/decision-vote.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { Member } from '@/mocks/organization/members';
import type { Contribution } from '@/mocks/finance/contributions';
import type { Loan } from '@/mocks/finance/loans';
import type { Meeting, MeetingStatus, MeetingType, Vote, BoardMember, VoteResult } from '@/mocks/organization/governance';
import type { Attendance, AttendanceStatus } from '@/mocks/organization/attendances';
import type { QuorumThresholdType } from '@/mocks/organization/quorum-snapshots';
import type { AssemblyDecision, AssemblyDecisionStatus } from '@/mocks/organization/assembly-decisions';
import type { VoteOption } from '@/mocks/organization/vote-options';
import type { MemberVote } from '@/mocks/organization/member-votes';
import type { MeetingInput, BoardMemberInput, VoteInput } from '@/services/organization.service';
import type { PositionRole } from '@/mocks/organization/members';
import { Textarea } from '@/components/ui/textarea';
import type { TableColumn } from '@/types/ui';
import { formatDate, formatNumber } from '@/lib/utils';
import { useMemberDirectory } from './hooks/use-member-directory';
import { MemberToolbar } from './components/member-toolbar';
import { MemberTable } from './components/member-table';
import { MemberPagination } from './components/member-pagination';
import { MemberAvatar, getInitials } from './components/member-avatar';

type T = (section: 'organization' | 'nav', key: string, values?: Record<string, string>) => string;

export const statusTone = { active: 'success' as const, inactive: 'default' as const, pending: 'warning' as const, suspended: 'error' as const, exited: 'default' as const, ongoing: 'success' as const, expired: 'default' as const, upcoming: 'info' as const, adopted: 'success' as const, rejected: 'error' as const, repaid: 'success' as const, overdue: 'error' as const, completed: 'success' as const };

function OrganizationPage({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="ORGANIZATION" title={title} description={description} actions={actions} />{children}</div>;
}

function BackButton({ label }: { label: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={15} />{label}</Button>; }

/** Réservé aux identités sans concept de photo (ex. lignes Bureau & Mandats, qui n'ont qu'un `memberName` textuel) — `MemberAvatar` (photo + fallback) est le composant à utiliser partout où un `Member` complet est disponible. Réutilise `getInitials`, la même logique de fallback que `MemberAvatar`, jamais une seconde implémentation. */
export function Avatar({ name, large = false }: { name: string; large?: boolean }) { return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-xl bg-primary/10 font-semibold text-primary ${large ? 'size-14 text-lg' : 'size-9 text-xs'}`}>{getInitials(name)}</span>; }

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Mail }) { return <div className="flex gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }

function MembersDirectory({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: members = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const directory = useMemberDirectory(members);
  const [confirmDelete, setConfirmDelete] = useState<Member | null>(null);
  const deleteMutation = useMockMutation<Member | undefined, string>({
    mutationFn: (memberId) => organizationService.updateMember(currentTenant.id, memberId, { status: 'exited' }),
    invalidateKeys: [queryKeys.members.list(currentTenant.id)],
    onSuccess: () => { notify.success(t('organization', 'memberDeleted')); setConfirmDelete(null); },
  });
  if (isLoading) return <OrganizationPage title={t('organization', 'membersTitle')} description={t('organization', 'membersDescription')}><TableSkeleton /></OrganizationPage>;
  if (isError) return <OrganizationPage title={t('organization', 'membersTitle')} description={t('organization', 'membersDescription')}><ErrorState onRetry={refetch} /></OrganizationPage>;
  return <OrganizationPage title={t('organization', 'membersTitle')} description={t('organization', 'membersDescription')} actions={<PermissionGate permission="members.create"><Button onClick={() => navigate('/organization/members/create')}><Plus size={16} />{t('organization', 'addMember')}</Button></PermissionGate>}>
    <MemberToolbar t={t} searchInput={directory.searchInput} onSearchChange={directory.setSearchInput} status={directory.status} onStatusChange={directory.setStatus} role={directory.role} onRoleChange={directory.setRole} availableRoles={directory.availableRoles} resultCount={directory.total} hasActiveFilters={directory.hasActiveFilters} onReset={directory.resetFilters} />
    <MemberTable
      t={t} rows={directory.rows} sortKey={directory.sortKey} sortDirection={directory.sortDirection} onSort={directory.toggleSort}
      onView={(member) => navigate(`/organization/members/${member.id}`)}
      onEdit={(member) => navigate(`/organization/members/${member.id}/edit`)}
      onPrint={(member) => navigate(`/organization/members/${member.id}?print=1`)}
      onDelete={(member) => setConfirmDelete(member)}
      emptyTitle={t('organization', directory.totalUnfiltered === 0 ? 'noMembers' : 'noMembersFound')}
      emptyDescription={directory.totalUnfiltered === 0 ? undefined : t('organization', 'noMembersFoundHint')}
      emptyAction={directory.hasActiveFilters ? <Button variant="outline" size="sm" onClick={directory.resetFilters}>{t('organization', 'resetFilters')}</Button> : undefined}
    />
    <MemberPagination t={t} page={directory.page} pageCount={directory.pageCount} pageSize={directory.pageSize} total={directory.total} onPageChange={directory.setPage} onPageSizeChange={directory.setPageSize} />
    {confirmDelete && <ConfirmDialog open title={t('organization', 'deleteMember')} description={t('organization', 'deleteMemberConfirm')} confirmLabel={t('organization', 'deleteMember')} cancelLabel={t('organization', 'cancel')} onConfirm={() => deleteMutation.mutate(confirmDelete.id)} onCancel={() => setConfirmDelete(null)} />}
  </OrganizationPage>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) { return <Card><CardContent className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={17} /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 font-heading text-xl font-semibold">{value}</p></div></CardContent></Card>; }

type MemberFormValues = { firstName: string; lastName: string; matricule: string; gender: Member['gender']; email: string; phone: string; joinedAt: string; occupation: string; nationality: string; address: string; photoUrl: string; tenantId: string; status: Member['status'] };
type MemberFormErrors = Partial<Record<'firstName' | 'lastName' | 'email' | 'matricule' | 'phone' | 'general', string>>;

/** `email`/`phone`/`matricule`/`joinedAt` nullable au sens du dictionnaire (mandat P1 MEMBERS) — non rendus obligatoires ici, aucune règle métier existante ne le justifiait (vérifié : `email` n'est consommé qu'en affichage ailleurs dans l'app, jamais comme clé d'un mécanisme obligatoire). */
function validateMember(values: MemberFormValues, t: T): MemberFormErrors {
  const errors: MemberFormErrors = {};
  if (!values.firstName.trim()) errors.firstName = t('organization', 'fieldRequired');
  if (values.firstName.length > 100) errors.firstName = t('organization', 'fieldTooLong');
  if (!values.lastName.trim()) errors.lastName = t('organization', 'fieldRequired');
  if (values.lastName.length > 100) errors.lastName = t('organization', 'fieldTooLong');
  if (values.matricule.length > 50) errors.matricule = t('organization', 'fieldTooLong');
  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = t('organization', 'invalidEmail');
  if (values.email.length > 255) errors.email = t('organization', 'fieldTooLong');
  if (values.phone.length > 50) errors.phone = t('organization', 'fieldTooLong');
  return errors;
}

/**
 * Contrôle d'unicité — appelé après la validation de forme, avant l'appel à
 * `createMember`/`updateMember` (qui reste l'autorité finale, non
 * contournable : voir `organizationService.createMember`). Ce second appel
 * côté service (`findMemberDuplicate`) sert uniquement à produire un message
 * d'erreur distinct par contrainte, ce que le service de création seul ne
 * peut pas communiquer (il ne renvoie qu'un succès/échec générique, comme le
 * reste de l'architecture mock du projet).
 */
async function checkMemberDuplicate(tenantId: string, values: MemberFormValues, excludeMemberId: string | undefined, t: T): Promise<MemberFormErrors> {
  const reason = await organizationService.findMemberDuplicate(tenantId, { matricule: values.matricule.trim() || undefined, phone: values.phone.trim() || undefined, email: values.email.trim() || undefined, firstName: values.firstName.trim(), lastName: values.lastName.trim(), joinedAt: values.joinedAt || new Date().toISOString().slice(0, 10) }, excludeMemberId);
  if (reason === 'matricule') return { matricule: t('organization', 'duplicateMatricule') };
  if (reason === 'phone') return { phone: t('organization', 'duplicatePhone') };
  if (reason === 'email') return { email: t('organization', 'duplicateEmail') };
  if (reason === 'identity') return { general: t('organization', 'duplicateIdentity') };
  return {};
}

/**
 * Contrôlé par `photoUrl` (data URI, cf. `Member.photoUrl`) plutôt qu'un aperçu local
 * jamais persisté : `FileReader.readAsDataURL` remplace l'ancien `URL.createObjectURL`
 * (piège de révocation — un blob révoqué à la fermeture du formulaire aurait cassé la
 * référence une fois enregistrée dans `members`). Aucune dépendance ajoutée, aucune
 * architecture de stockage de fichiers créée : le data URI est la valeur elle-même.
 */
function MemberPhotoField({ t, value, onChange }: { t: T; value: string; onChange: (photoUrl: string) => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const handleFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify.error(t('organization', 'invalidPhotoType')); return; }
    if (file.size > 5 * 1024 * 1024) { notify.error(t('organization', 'photoTooLarge')); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') onChange(reader.result); };
    reader.readAsDataURL(file);
    setFileName(file.name);
  };
  const handleRemove = () => { onChange(''); setFileName(null); };
  return <div className="space-y-2">
    <Label>{t('organization', 'memberPhoto')}</Label>
    <div className="flex items-center gap-4">
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-muted-foreground">
        {value ? <img src={value} alt="" className="size-full object-cover" /> : <Camera size={22} aria-hidden="true" />}
      </span>
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <Label htmlFor="member-photo-input" className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted">
            <Camera size={15} />{t('organization', value ? 'changePhoto' : 'selectPhoto')}
          </Label>
          <input id="member-photo-input" type="file" accept="image/*" className="hidden" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} />
          {value && <Button type="button" variant="ghost" size="sm" onClick={handleRemove}><X size={14} />{t('organization', 'removePhoto')}</Button>}
        </div>
        {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
        <p className="text-xs text-muted-foreground">{t('organization', 'memberPhotoHint')}</p>
      </div>
    </div>
  </div>;
}

function MemberFormFields({ values, onChange, errors, t }: { values: MemberFormValues; onChange: (patch: Partial<MemberFormValues>) => void; errors: MemberFormErrors; t: T }) {
  return <><FormSection title={t('organization', 'personalInfo')}><div className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-2"><Label htmlFor="member-first-name">{t('organization', 'firstName')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="member-first-name" value={values.firstName} onChange={(event) => onChange({ firstName: event.target.value })} required aria-required="true" aria-invalid={Boolean(errors.firstName)} aria-describedby={errors.firstName ? 'member-first-name-error' : undefined} /><span id="member-first-name-error"><FieldError message={errors.firstName} /></span></div>
    <div className="space-y-2"><Label htmlFor="member-last-name">{t('organization', 'lastName')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="member-last-name" value={values.lastName} onChange={(event) => onChange({ lastName: event.target.value })} required aria-required="true" aria-invalid={Boolean(errors.lastName)} aria-describedby={errors.lastName ? 'member-last-name-error' : undefined} /><span id="member-last-name-error"><FieldError message={errors.lastName} /></span></div>
    <div className="space-y-2"><Label htmlFor="member-matricule">{t('organization', 'matricule')}</Label><Input id="member-matricule" value={values.matricule} onChange={(event) => onChange({ matricule: event.target.value })} aria-invalid={Boolean(errors.matricule)} aria-describedby={errors.matricule ? 'member-matricule-error' : undefined} /><span id="member-matricule-error"><FieldError message={errors.matricule} /></span></div>
    <div className="space-y-2"><Label htmlFor="member-gender">{t('organization', 'gender')}</Label><select id="member-gender" value={values.gender} onChange={(event) => onChange({ gender: event.target.value as MemberFormValues['gender'] })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">{t('organization', 'genderUnspecified')}</option><option value="male">{t('organization', 'male')}</option><option value="female">{t('organization', 'female')}</option></select></div>
    <div className="space-y-2"><Label htmlFor="member-email">{t('organization', 'email')}</Label><Input id="member-email" type="email" value={values.email} onChange={(event) => onChange({ email: event.target.value })} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'member-email-error' : undefined} /><span id="member-email-error"><FieldError message={errors.email} /></span></div>
    <div className="space-y-2"><Label htmlFor="member-phone">{t('organization', 'phone')}</Label><Input id="member-phone" value={values.phone} onChange={(event) => onChange({ phone: event.target.value })} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'member-phone-error' : undefined} /><span id="member-phone-error"><FieldError message={errors.phone} /></span></div>
    <div className="space-y-2"><Label htmlFor="member-joined-at">{t('organization', 'joinDateLabel')}</Label><Input id="member-joined-at" type="date" value={values.joinedAt} onChange={(event) => onChange({ joinedAt: event.target.value })} /></div>
    <div className="space-y-2"><Label htmlFor="member-occupation">{t('organization', 'occupation')}</Label><Input id="member-occupation" value={values.occupation} onChange={(event) => onChange({ occupation: event.target.value })} /></div>
    <div className="space-y-2"><Label htmlFor="member-nationality">{t('organization', 'nationality')}</Label><Input id="member-nationality" value={values.nationality} onChange={(event) => onChange({ nationality: event.target.value })} /></div>
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="member-address">{t('organization', 'address')}</Label><Input id="member-address" value={values.address} onChange={(event) => onChange({ address: event.target.value })} /></div>
    <div className="sm:col-span-2"><MemberPhotoField t={t} value={values.photoUrl} onChange={(photoUrl) => onChange({ photoUrl })} /></div>
  </div></FormSection>
    {errors.general && <p className="text-sm text-destructive" role="alert">{errors.general}</p>}
  </>;
}

function MemberCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  // D-MEM-04 (définitive) : un nouveau membre est toujours créé 'active' — 'pending' est retiré
  // du vocabulaire officiel, aucun contrôle de statut n'est donc plus exposé à la création.
  const [values, setValues] = useState<MemberFormValues>({ firstName: '', lastName: '', matricule: '', gender: '', email: '', phone: '', joinedAt: '', occupation: '', nationality: 'Sénégalaise', address: '', photoUrl: '', tenantId: currentTenant.id, status: 'active' });
  const [errors, setErrors] = useState<MemberFormErrors>({});
  const [isChecking, setIsChecking] = useState(false);
  const mutation = useMockMutation<Member | undefined, MemberInput>({
    mutationFn: (input) => organizationService.createMember(input),
    invalidateKeys: [queryKeys.members.list(currentTenant.id)],
    onSuccess: (member) => {
      if (!member) { setErrors({ general: t('organization', 'memberCreateFailed') }); return; }
      notify.success(t('organization', 'memberCreated')); navigate(`/organization/members/${member.id}`);
    },
  });
  const handleSave = async () => {
    const nextErrors = validateMember(values, t);
    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }
    setIsChecking(true);
    const duplicateErrors = await checkMemberDuplicate(currentTenant.id, values, undefined, t);
    setIsChecking(false);
    if (Object.keys(duplicateErrors).length > 0) { setErrors(duplicateErrors); return; }
    setErrors({});
    mutation.mutate(buildMemberInput(values, currentTenant.name));
  };
  const isBusy = mutation.isPending || isChecking;
  return <OrganizationPage title={t('organization', 'addMember')} description={t('organization', 'membersDescription')} actions={<BackButton label={t('organization', 'backToMembers')} />}><div className="grid gap-5 lg:grid-cols-2"><MemberFormFields values={values} onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} errors={errors} t={t} /><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={isBusy} onClick={() => navigate('/organization/members')}>{t('organization', 'cancel')}</Button><Button disabled={isBusy} onClick={handleSave}>{isBusy ? t('organization', 'saving') : t('organization', 'save')}</Button></div></div></OrganizationPage>;
}

/** Le tenant n'est plus un champ de formulaire (dérivé de `currentTenant`, jamais éditable — cf. `MemberFormFields`) : la valeur transmise ici est toujours celle du contexte tenant courant, jamais une sélection utilisateur. `gender` n'est plus forcé à une valeur par défaut arbitraire (bug corrigé — voir `MemberGenderValue`). */
function buildMemberInput(values: MemberFormValues, tenantName: string): MemberInput {
  const { tenantId, joinedAt, ...rest } = values;
  return { ...rest, tenantId, tenantName, joinedAt: joinedAt || undefined };
}

/** Impression scopée à la fiche membre : masque tout le reste de l'app (sidebar/header compris) sans toucher aux fichiers de layout — pure CSS @media print ciblant l'id `member-print-area`. */
function MemberPrintStyles() {
  return <style>{`@media print { body * { visibility: hidden; } #member-print-area, #member-print-area * { visibility: visible; } #member-print-area { position: absolute; inset: 0; padding: 24px; } }`}</style>;
}

function MemberDetail({ t }: { t: T }) {
  const navigate = useNavigate(); const { id = '' } = useParams(); const { currentTenant } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: member, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.members.detail(id), currentTenant.id], queryFn: () => organizationService.getMember(currentTenant.id, id) });
  const statusMutation = useMockMutation<Member | undefined, Partial<MemberInput>>({
    mutationFn: (patch) => organizationService.updateMember(currentTenant.id, id, patch),
    invalidateKeys: [queryKeys.members.list(currentTenant.id), queryKeys.members.detail(id)],
    onSuccess: (_, patch) => { notify.success(t('organization', patch.status === 'suspended' ? 'memberSuspended' : 'memberReactivated')); setConfirmStatus(false); },
  });
  /** `?print=1` déclenché depuis le menu d'actions de la liste (`MemberTable`) — réutilise le même mécanisme d'impression que le bouton « Imprimer » de cette page, sans dupliquer la logique. Le hook doit rester avant tout `return` conditionnel (règles des Hooks) : la garde `member` se fait à l'intérieur de l'effet, pas en sautant son appel. */
  useEffect(() => { if (member && searchParams.get('print') === '1') { window.print(); setSearchParams((current) => { current.delete('print'); return current; }, { replace: true }); } }, [member, searchParams, setSearchParams]);
  /** "Supprimer" est une transition de statut vers `exited` (déjà présent et fermé par D-MEM-04, jamais utilisé jusqu'ici) via `updateMember` — cohérent avec `statusHistory` append-only : aucune suppression physique n'existe nulle part dans ce modèle, une vraie suppression casserait l'historique/l'audit déjà en place. */
  const deleteMutation = useMockMutation<Member | undefined, void>({
    mutationFn: () => organizationService.updateMember(currentTenant.id, id, { status: 'exited' }),
    invalidateKeys: [queryKeys.members.list(currentTenant.id), queryKeys.members.detail(id)],
    onSuccess: () => { notify.success(t('organization', 'memberDeleted')); setConfirmDelete(false); navigate('/organization/members'); },
  });
  if (isLoading) return <OrganizationPage title={t('organization', 'memberDetail')} description=""><DetailSkeleton /></OrganizationPage>;
  if (isError) return <OrganizationPage title={t('organization', 'memberDetail')} description=""><ErrorState onRetry={refetch} /></OrganizationPage>;
  if (!member) return <NotFoundPage />;
  const fullName = `${member.firstName} ${member.lastName}`;
  const isSuspended = member.status === 'suspended';
  const nextStatus: Member['status'] = isSuspended ? 'active' : 'suspended';
  return <OrganizationPage title={fullName} description={`${member.id} · ${member.tenantName}`} actions={<><BackButton label={t('organization', 'backToMembers')} /><Button variant="outline" onClick={() => window.print()}><Printer size={15} />{t('organization', 'print')}</Button><PermissionGate permission="members.update"><Button variant="outline" onClick={() => setConfirmStatus(true)}>{isSuspended ? <ShieldCheck size={15} /> : <UserCog size={15} />}{t('organization', isSuspended ? 'reactivateMember' : 'suspendMember')}</Button></PermissionGate><Button variant="outline" onClick={() => navigate(`/organization/members/${member.id}/edit`)}><Edit3 size={15} />{t('organization', 'editMember')}</Button><PermissionGate permission="members.delete"><Button variant="outline" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />{t('organization', 'deleteMember')}</Button></PermissionGate></>}>
    <MemberPrintStyles />
    <div id="member-print-area" className="grid gap-5 lg:grid-cols-[280px_1fr]">
      {/* PageHeader (titre/référence) est un frère de ce conteneur, donc masqué par les règles d'impression scopées — dupliqué ici, visible uniquement à l'impression (`print:block`), pour que la fiche imprimée reste complète sans toucher au composant partagé PageHeader. */}
      <div className="hidden print:block lg:col-span-2"><h1 className="text-xl font-semibold">{fullName}</h1><p className="text-sm text-muted-foreground">{member.id} · {member.tenantName}</p></div>
      <Card className="h-fit"><CardContent className="flex flex-col items-center p-6 text-center"><MemberAvatar member={member} size="lg" /><h2 className="mt-4 text-lg font-semibold">{fullName}</h2><p className="mt-1 text-sm text-muted-foreground">{member.occupation}</p><div className="mt-4"><StatusBadge label={t('organization', member.status)} tone={statusTone[member.status]} /></div><div className="mt-5 w-full space-y-3 border-t border-border pt-5 text-left"><Info label={t('organization', 'email')} value={member.email} icon={Mail} /><Info label={t('organization', 'phone')} value={member.phone} icon={Mail} /><Info label={t('organization', 'tenants')} value={member.tenantName} icon={Building2} /></div></CardContent></Card><MemberTabs t={t} member={member} /></div>
    {confirmStatus && <ConfirmDialog open title={t('organization', isSuspended ? 'reactivateMember' : 'suspendMember')} description={t('organization', isSuspended ? 'reactivateMemberConfirm' : 'suspendMemberConfirm')} confirmLabel={t('organization', isSuspended ? 'reactivateMember' : 'suspendMember')} cancelLabel={t('organization', 'cancel')} onConfirm={() => statusMutation.mutate({ status: nextStatus })} onCancel={() => setConfirmStatus(false)} />}
    {confirmDelete && <ConfirmDialog open title={t('organization', 'deleteMember')} description={t('organization', 'deleteMemberConfirm')} confirmLabel={t('organization', 'deleteMember')} cancelLabel={t('organization', 'cancel')} onConfirm={() => deleteMutation.mutate()} onCancel={() => setConfirmDelete(false)} />}
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
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const [values, setValues] = useState<MemberFormValues>({ firstName: member.firstName, lastName: member.lastName, matricule: member.matricule, gender: member.gender, email: member.email, phone: member.phone, joinedAt: member.joinedAt, occupation: member.occupation, nationality: member.nationality, address: member.address, photoUrl: member.photoUrl, tenantId: member.tenantId, status: member.status });
  const [errors, setErrors] = useState<MemberFormErrors>({});
  const [isChecking, setIsChecking] = useState(false);
  const mutation = useMockMutation<Member | undefined, Partial<MemberInput>>({
    mutationFn: (patch) => organizationService.updateMember(currentTenant.id, member.id, patch),
    invalidateKeys: [queryKeys.members.list(currentTenant.id), queryKeys.members.detail(member.id)],
    onSuccess: (result) => {
      if (!result) { setErrors({ general: t('organization', 'memberCreateFailed') }); return; }
      notify.success(t('organization', 'memberUpdated')); navigate(`/organization/members/${member.id}`);
    },
  });
  const handleSave = async () => {
    const nextErrors = validateMember(values, t);
    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }
    setIsChecking(true);
    const duplicateErrors = await checkMemberDuplicate(currentTenant.id, values, member.id, t);
    setIsChecking(false);
    if (Object.keys(duplicateErrors).length > 0) { setErrors(duplicateErrors); return; }
    setErrors({});
    mutation.mutate(buildMemberInput(values, member.tenantName));
  };
  const isBusy = mutation.isPending || isChecking;
  return <OrganizationPage title={t('organization', 'editMember')} description={`${member.firstName} ${member.lastName}`} actions={<BackButton label={t('organization', 'backToMembers')} />}><div className="grid gap-5 lg:grid-cols-2"><MemberFormFields values={values} onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} errors={errors} t={t} /><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={isBusy} onClick={() => navigate(`/organization/members/${member.id}`)}>{t('organization', 'cancel')}</Button><Button disabled={isBusy} onClick={handleSave}>{isBusy ? t('organization', 'saving') : t('organization', 'save')}</Button></div></div></OrganizationPage>;
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

function PersonalTab({ t, member }: { t: T; member: Member }) { const fields = [['firstName', member.firstName], ['lastName', member.lastName], ['gender', t('organization', member.gender)], ['birthDate', formatDate(member.birthDate)], ['nationality', member.nationality], ['idNumber', member.idNumber], ['occupation', member.occupation], ['address', member.address || '—'], ['joined', formatDate(member.joinedAt)]]; return <Card><CardHeader><CardTitle className="text-sm">{t('organization', 'personalInfo')}</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">{fields.map(([label, value]) => <Info key={label} label={t('organization', label)} value={value} icon={UserRound} />)}</CardContent></Card>; }
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

/**
 * `GeneralAssembly`/`Assembly` ne sont plus des entités autonomes (correction
 * post-implémentation Phase 4C-4 — cf.
 * docs/P1_GOVERNANCE_PHASE_4C4_GENERALASSEMBLY_MEETING_MIGRATION_UX_CORRECTION_REPORT.md
 * §7) : plus de carte/route dédiée. La carte "Assemblées Générales" ci-dessous
 * n'ouvre pas une nouvelle structure — elle navigue vers la liste Meetings
 * pré-filtrée par `type=GENERAL_ASSEMBLY`, le seul point d'entrée Governance
 * reste `Meeting`.
 */
function GovernanceOverview({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const meetingsQuery = useQuery({ queryKey: queryKeys.governance.meetings(currentTenant.id), queryFn: () => organizationService.listMeetings(currentTenant.id) });
  const votesQuery = useQuery({ queryKey: queryKeys.governance.votes(currentTenant.id), queryFn: () => organizationService.listVotes(currentTenant.id) });
  const boardQuery = useQuery({ queryKey: queryKeys.governance.board(currentTenant.id), queryFn: () => organizationService.listBoardMembers(currentTenant.id) });
  const meetings = meetingsQuery.data ?? []; const votes = votesQuery.data ?? []; const boardMembers = boardQuery.data ?? [];
  if (meetingsQuery.isLoading || votesQuery.isLoading || boardQuery.isLoading) return <OrganizationPage title={t('organization', 'governanceTitle')} description={t('organization', 'governanceDescription')}><CardSkeleton count={4} /></OrganizationPage>;
  if (meetingsQuery.isError || votesQuery.isError || boardQuery.isError) return <OrganizationPage title={t('organization', 'governanceTitle')} description={t('organization', 'governanceDescription')}><ErrorState onRetry={() => { meetingsQuery.refetch(); votesQuery.refetch(); boardQuery.refetch(); }} /></OrganizationPage>;
  const generalAssemblyCount = meetings.filter((meeting) => meeting.type === 'GENERAL_ASSEMBLY').length;
  const cards = [
    { key: 'meetings', icon: CalendarDays, count: meetings.length, path: '/organization/governance/meetings' },
    { key: 'generalAssemblies', icon: ShieldCheck, count: generalAssemblyCount, path: '/organization/governance/meetings?type=GENERAL_ASSEMBLY' },
    { key: 'votes', icon: ClipboardCheck, count: votes.length, path: '/organization/governance/votes' },
    { key: 'boardMandates', icon: UserCog, count: boardMembers.length, path: '/organization/governance/board-mandates' },
  ];
  const upcoming = meetings.filter((meeting) => meeting.status === 'PLANNED').sort((a, b) => a.date.localeCompare(b.date));
  return <OrganizationPage title={t('organization', 'governanceTitle')} description={t('organization', 'governanceDescription')}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map((item) => <button type="button" key={item.key} onClick={() => navigate(item.path)} className="group text-left"><Card className="h-full transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md"><CardContent className="p-5"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><item.icon size={19} /></span><p className="mt-5 text-sm font-semibold">{t('organization', item.key)}</p><p className="mt-1 font-heading text-2xl font-semibold">{formatNumber(item.count)}</p><p className="mt-1 flex items-center gap-1 text-xs text-primary">{t('organization', 'viewDetail')}<ChevronRight size={13} /></p></CardContent></Card></button>)}</div><Card><CardHeader><CardTitle className="text-sm">{t('organization', 'upcoming')}</CardTitle></CardHeader><CardContent><Timeline items={upcoming.map((meeting) => ({ id: meeting.id, title: meeting.title, description: `${t('organization', meeting.type === 'GENERAL_ASSEMBLY' ? 'meetingTypeGeneralAssembly' : 'meetingTypeRegular')} · ${meeting.location || '—'}`, date: formatDate(meeting.date), tone: 'success' as const }))} /></CardContent></Card></OrganizationPage>;
}

function GovernanceTableShell({ title, description, action, icon: Icon, t, onCreate, children }: { title: string; description: string; action: string; icon: typeof CalendarDays; t: T; onCreate: () => void; children: ReactNode }) { const navigate = useNavigate(); return <OrganizationPage title={title} description={description} actions={<PermissionGate permission="governance.create"><Button onClick={onCreate}><Plus size={16} />{action}</Button></PermissionGate>}><div className="flex items-center gap-2 border-b border-border pb-3 text-sm text-muted-foreground"><button type="button" onClick={() => navigate('/organization/governance')} className="hover:text-foreground">{t('organization', 'governanceTitle')}</button><ChevronRight size={14} /><Icon size={14} className="text-primary" /><span className="font-medium text-foreground">{title}</span></div>{children}</OrganizationPage>; }

const BOARD_POSITIONS: PositionRole[] = ['president', 'treasurer', 'secretary', 'boardMember'];

/** D-4C3-TECH-01 : même vocabulaire/tons que GeneralAssemblyStatus (déjà en place dans ce projet). */
function meetingStatusTone(status: MeetingStatus): 'info' | 'warning' | 'success' | 'error' {
  if (status === 'PLANNED') return 'info';
  if (status === 'ONGOING') return 'warning';
  if (status === 'COMPLETED') return 'success';
  return 'error';
}
function meetingStatusKey(status: MeetingStatus): string {
  return status === 'PLANNED' ? 'statusPlanned' : status === 'ONGOING' ? 'statusOngoingMeeting' : status === 'COMPLETED' ? 'statusCompletedMeeting' : 'statusCancelledMeeting';
}

function GovernanceTablePage({ t, kind }: { t: T; kind: 'meetings' | 'votes' | 'boardMandates' }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const [searchParams] = useSearchParams();
  const meetingsQuery = useQuery({ queryKey: queryKeys.governance.meetings(currentTenant.id), queryFn: () => organizationService.listMeetings(currentTenant.id), enabled: kind === 'meetings' });
  const votesQuery = useQuery({ queryKey: queryKeys.governance.votes(currentTenant.id), queryFn: () => organizationService.listVotes(currentTenant.id), enabled: kind === 'votes' });
  const boardQuery = useQuery({ queryKey: queryKeys.governance.board(currentTenant.id), queryFn: () => organizationService.listBoardMembers(currentTenant.id), enabled: kind === 'boardMandates' });
  const membersQuery = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id), enabled: kind === 'boardMandates' });
  const allMeetings = meetingsQuery.data ?? []; const votes = votesQuery.data ?? []; const boardMembers = boardQuery.data ?? []; const members = membersQuery.data ?? [];
  const activeQuery = kind === 'meetings' ? meetingsQuery : kind === 'votes' ? votesQuery : boardQuery;

  const [createOpen, setCreateOpen] = useState(false);
  const [meetingTypeFilter, setMeetingTypeFilter] = useState<'all' | MeetingType>((searchParams.get('type') as MeetingType | null) ?? 'all');
  const meetings = meetingTypeFilter === 'all' ? allMeetings : allMeetings.filter((meeting) => meeting.type === meetingTypeFilter);
  const [meetingForm, setMeetingForm] = useState({ title: '', date: '', location: '', participants: 0, agenda: '', type: 'REGULAR' as MeetingType, description: '' });
  const [boardForm, setBoardForm] = useState({ memberId: '', position: 'president' as PositionRole, mandateStart: '', mandateEnd: '' });
  const [voteForm, setVoteForm] = useState({ subject: '', date: '' });
  const [minutesTarget, setMinutesTarget] = useState<Meeting | null>(null);
  const [minutesText, setMinutesText] = useState('');
  const [mandateTarget, setMandateTarget] = useState<BoardMember | null>(null);
  const [resultTarget, setResultTarget] = useState<Vote | null>(null);
  const [resultForm, setResultForm] = useState({ yes: 0, no: 0, abstain: 0, result: 'adopted' as VoteResult });

  const createMeeting = useMockMutation<Meeting | undefined, MeetingInput>({
    mutationFn: (input) => organizationService.createMeeting(currentTenant.id, input),
    invalidateKeys: [queryKeys.governance.meetings(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('organization', 'meetingRejected')); return; }
      notify.success(t('organization', 'meetingCreated'));
      setCreateOpen(false);
      setMeetingForm({ title: '', date: '', location: '', participants: 0, agenda: '', type: 'REGULAR', description: '' });
    },
  });
  const createBoardMember = useMockMutation<BoardMember, BoardMemberInput>({ mutationFn: (input) => organizationService.createBoardMember(currentTenant.id, input), invalidateKeys: [queryKeys.governance.board(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'boardMemberAdded')); setCreateOpen(false); setBoardForm({ memberId: '', position: 'president', mandateStart: '', mandateEnd: '' }); } });
  const createVote = useMockMutation<Vote, VoteInput>({ mutationFn: (input) => organizationService.createVote(currentTenant.id, input), invalidateKeys: [queryKeys.governance.votes(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'voteCreated')); setCreateOpen(false); setVoteForm({ subject: '', date: '' }); } });
  const publishMinutes = useMockMutation<Meeting | undefined, string>({ mutationFn: (minutes) => organizationService.updateMeetingMinutes(currentTenant.id, minutesTarget?.id ?? '', minutes), invalidateKeys: [queryKeys.governance.meetings(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'minutesPublished')); setMinutesTarget(null); setMinutesText(''); } });
  const endMandate = useMockMutation<BoardMember | undefined, void>({ mutationFn: () => organizationService.endBoardMandate(currentTenant.id, mandateTarget?.id ?? '', new Date().toISOString().slice(0, 10)), invalidateKeys: [queryKeys.governance.board(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'mandateEnded')); setMandateTarget(null); } });
  const publishResult = useMockMutation<Vote | undefined, typeof resultForm>({ mutationFn: (patch) => organizationService.updateVoteResult(currentTenant.id, resultTarget?.id ?? '', patch), invalidateKeys: [queryKeys.governance.votes(currentTenant.id)], onSuccess: () => { notify.success(t('organization', 'resultPublished')); setResultTarget(null); } });
  /** D-4C3-TECH-01 : transitions de cycle de vie Meeting — jamais un simple changement de champ, toujours via ces 3 méthodes de service dédiées. */
  const startMeeting = useMockMutation<Meeting | undefined, string>({ mutationFn: (meetingId) => organizationService.startMeeting(currentTenant.id, meetingId), invalidateKeys: [queryKeys.governance.meetings(currentTenant.id)], onSuccess: () => notify.success(t('organization', 'meetingStarted')) });
  const completeMeeting = useMockMutation<Meeting | undefined, string>({ mutationFn: (meetingId) => organizationService.completeMeeting(currentTenant.id, meetingId), invalidateKeys: [queryKeys.governance.meetings(currentTenant.id)], onSuccess: () => notify.success(t('organization', 'meetingCompleted')) });
  const cancelMeeting = useMockMutation<Meeting | undefined, string>({ mutationFn: (meetingId) => organizationService.cancelMeeting(currentTenant.id, meetingId), invalidateKeys: [queryKeys.governance.meetings(currentTenant.id)], onSuccess: () => notify.success(t('organization', 'meetingCancelled')) });

  if (activeQuery.isLoading) return <OrganizationPage title={t('organization', 'governanceTitle')} description=""><TableSkeleton /></OrganizationPage>;
  if (activeQuery.isError) return <OrganizationPage title={t('organization', 'governanceTitle')} description=""><ErrorState onRetry={activeQuery.refetch} /></OrganizationPage>;

  if (kind === 'meetings') {
    const columns: TableColumn<Meeting>[] = [
      { key: 'title', header: t('organization', 'meetingTitle'), render: (row) => <button type="button" onClick={() => navigate(`/organization/governance/meetings/${row.id}`)} className="text-left text-sm font-semibold text-primary">{row.title}</button> },
      { key: 'type', header: t('organization', 'meetingTypeLabel'), render: (row) => <StatusBadge label={t('organization', row.type === 'GENERAL_ASSEMBLY' ? 'meetingTypeGeneralAssembly' : 'meetingTypeRegular')} tone={row.type === 'GENERAL_ASSEMBLY' ? 'success' : 'default'} /> },
      { key: 'date', header: t('organization', 'meetingDate'), render: (row) => <DateDisplay value={row.date} /> },
      { key: 'location', header: t('organization', 'location'), render: (row) => row.location || '—' },
      { key: 'participants', header: t('organization', 'participants') },
      { key: 'status', header: t('organization', 'status'), render: (row) => <StatusBadge label={t('organization', meetingStatusKey(row.status))} tone={meetingStatusTone(row.status)} /> },
      { key: 'minutes', header: t('organization', 'minutes'), render: (row) => row.minutes ?? '—' },
      {
        key: 'actions', header: '', className: 'w-96', render: (row) => <div className="flex flex-wrap justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => navigate(`/organization/governance/meetings/${row.id}`)}><ChevronRight size={14} />{t('organization', 'viewDetail')}</Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/organization/governance/meetings/${row.id}/attendances`)}><UsersRound size={14} />{t('organization', 'manageAttendance')}</Button>
          {row.status === 'PLANNED' && <PermissionGate permission="governance.update"><Button variant="outline" size="sm" onClick={() => startMeeting.mutate(row.id)}><Play size={14} />{t('organization', 'startMeeting')}</Button></PermissionGate>}
          {row.status === 'ONGOING' && <PermissionGate permission="governance.approve"><Button variant="outline" size="sm" onClick={() => completeMeeting.mutate(row.id)}><CheckCircle2 size={14} />{t('organization', 'completeMeeting')}</Button></PermissionGate>}
          {(row.status === 'PLANNED' || row.status === 'ONGOING') && <PermissionGate permission="governance.approve"><Button variant="outline" size="sm" onClick={() => cancelMeeting.mutate(row.id)}><XCircle size={14} />{t('organization', 'cancelMeeting')}</Button></PermissionGate>}
          <PermissionGate permission="governance.approve"><Button variant="outline" size="sm" onClick={() => { setMinutesTarget(row); setMinutesText(row.minutes ?? ''); }}>{t('organization', 'publishMinutes')}</Button></PermissionGate>
        </div>,
      },
    ];
    return <GovernanceTableShell title={t('organization', 'meetingsTitle')} description={t('organization', 'meetingsDescription')} action={t('organization', 'createMeeting')} icon={CalendarDays} t={t} onCreate={() => setCreateOpen(true)}>
      <div className="flex items-center justify-end gap-2">
        <Label htmlFor="meeting-type-filter" className="text-xs text-muted-foreground">{t('organization', 'meetingTypeLabel')}</Label>
        <select id="meeting-type-filter" value={meetingTypeFilter} onChange={(e) => setMeetingTypeFilter(e.target.value as 'all' | MeetingType)} className="h-9 rounded-md border border-input bg-background px-3 text-xs">
          <option value="all">{t('organization', 'meetingTypeAll')}</option>
          <option value="REGULAR">{t('organization', 'meetingTypeRegular')}</option>
          <option value="GENERAL_ASSEMBLY">{t('organization', 'meetingTypeGeneralAssembly')}</option>
        </select>
      </div>
      <DataTable columns={columns} rows={meetings} empty={<EmptyState icon={CalendarDays} title={t('organization', 'noMeetings')} />} />
      {createOpen && <ConfirmDialog open title={t('organization', 'createMeeting')} confirmLabel={t('organization', 'save')} cancelLabel={t('organization', 'cancel')} onConfirm={() => createMeeting.mutate({ ...meetingForm, participants: Number(meetingForm.participants), description: meetingForm.type === 'GENERAL_ASSEMBLY' ? (meetingForm.description.trim() ? meetingForm.description : null) : null })} onCancel={() => setCreateOpen(false)}>
        <div className="mt-4 space-y-3 text-left">
          <div className="space-y-1"><Label htmlFor="meeting-type">{t('organization', 'meetingTypeLabel')} <span className="text-destructive" aria-hidden="true">*</span></Label><select id="meeting-type" value={meetingForm.type} onChange={(e) => setMeetingForm((v) => ({ ...v, type: e.target.value as MeetingType }))} required aria-required="true" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="REGULAR">{t('organization', 'meetingTypeRegular')}</option><option value="GENERAL_ASSEMBLY">{t('organization', 'meetingTypeGeneralAssembly')}</option></select></div>
          <div className="space-y-1"><Label htmlFor="meeting-title">{t('organization', 'title')}</Label><Input id="meeting-title" value={meetingForm.title} onChange={(e) => setMeetingForm((v) => ({ ...v, title: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor="meeting-date">{t('organization', 'date')}</Label><Input id="meeting-date" type="date" value={meetingForm.date} onChange={(e) => setMeetingForm((v) => ({ ...v, date: e.target.value }))} /></div><div className="space-y-1"><Label htmlFor="meeting-participants">{t('organization', 'participants')}</Label><Input id="meeting-participants" type="number" min={0} value={meetingForm.participants} onChange={(e) => setMeetingForm((v) => ({ ...v, participants: Number(e.target.value) }))} /></div></div>
          <div className="space-y-1"><Label htmlFor="meeting-location">{t('organization', 'location')}</Label><Input id="meeting-location" value={meetingForm.location} onChange={(e) => setMeetingForm((v) => ({ ...v, location: e.target.value }))} /></div>
          <div className="space-y-1"><Label htmlFor="meeting-agenda">{t('organization', 'agenda')}</Label><Textarea id="meeting-agenda" value={meetingForm.agenda} onChange={(e) => setMeetingForm((v) => ({ ...v, agenda: e.target.value }))} /></div>
          {meetingForm.type === 'GENERAL_ASSEMBLY' && <div className="space-y-1"><Label htmlFor="meeting-description">{t('organization', 'description')}</Label><Textarea id="meeting-description" value={meetingForm.description} onChange={(e) => setMeetingForm((v) => ({ ...v, description: e.target.value }))} /></div>}
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

  const memberById = new Map(members.map((item) => [item.id, item]));
  const columns: TableColumn<BoardMember>[] = [{ key: 'memberName', header: t('organization', 'boardMemberName'), render: (row) => { const boardMember = memberById.get(row.memberId); return <button type="button" onClick={() => navigate(`/organization/members/${row.memberId}`)} className="flex items-center gap-3 text-left">{boardMember ? <MemberAvatar member={boardMember} /> : <Avatar name={row.memberName} />}<span><span className="block font-semibold">{row.memberName}</span><span className="block text-xs text-muted-foreground">{row.memberId}</span></span></button>; } }, { key: 'position', header: t('organization', 'position'), render: (row) => t('organization', row.position) }, { key: 'mandateStart', header: t('organization', 'mandateStart'), render: (row) => <DateDisplay value={row.mandateStart} /> }, { key: 'mandateEnd', header: t('organization', 'mandateEnd'), render: (row) => <DateDisplay value={row.mandateEnd} /> }, { key: 'status', header: t('organization', 'mandateStatus'), render: (row) => <StatusBadge label={t('organization', row.status)} tone={statusTone[row.status]} /> }, { key: 'actions', header: '', className: 'w-40', render: (row) => row.status === 'ongoing' && <PermissionGate permission="governance.approve"><Button variant="outline" size="sm" onClick={() => setMandateTarget(row)}>{t('organization', 'endMandate')}</Button></PermissionGate> }];
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

const QUORUM_THRESHOLD_TYPES: QuorumThresholdType[] = ['PERCENTAGE', 'COUNT'];

/** D-4C4-WEB-04/05 : seuil configurable, jamais une valeur par défaut — le formulaire exige type + valeur avant tout calcul. Figeage unique, non recalculable une fois posé (bouton disparaît, carte devient lecture seule). */
function QuorumCard({ t, meetingId }: { t: T; meetingId: string }) {
  const { currentTenant } = useTenant();
  const { data: snapshot, isLoading } = useQuery({ queryKey: [...queryKeys.governance.quorumSnapshot(meetingId), currentTenant.id], queryFn: () => quorumService.getQuorumSnapshot(currentTenant.id, meetingId) });
  const [thresholdType, setThresholdType] = useState<QuorumThresholdType>('PERCENTAGE');
  const [thresholdValue, setThresholdValue] = useState('');
  const compute = useMockMutation<Awaited<ReturnType<typeof quorumService.computeAndFreezeQuorumSnapshot>>, QuorumThresholdInput>({
    mutationFn: (threshold) => quorumService.computeAndFreezeQuorumSnapshot(currentTenant.id, meetingId, threshold),
    invalidateKeys: [[...queryKeys.governance.quorumSnapshot(meetingId), currentTenant.id]],
    onSuccess: (result) => { if (!result) { notify.error(t('organization', 'quorumRejected')); return; } notify.success(t('organization', 'quorumComputed')); },
  });
  if (isLoading) return <Card><CardContent className="p-5"><TableSkeleton /></CardContent></Card>;
  return <Card><CardHeader><CardTitle className="text-sm">{t('organization', 'quorumTitle')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5 pt-0">
    {snapshot ? <div className="grid gap-4 sm:grid-cols-2">
      <Info label={t('organization', 'quorumEligible')} value={formatNumber(snapshot.eligibleMemberCount)} icon={Users} />
      <Info label={t('organization', 'quorumPresent')} value={formatNumber(snapshot.presentMemberCount)} icon={UsersRound} />
      <Info label={t('organization', 'quorumThreshold')} value={snapshot.quorumThresholdType === 'PERCENTAGE' ? `${snapshot.quorumThresholdValue}%` : formatNumber(snapshot.quorumThresholdValue)} icon={ClipboardCheck} />
      <div className="pt-1 sm:col-span-2"><StatusBadge label={t('organization', snapshot.quorumReached ? 'quorumReached' : 'quorumNotReached')} tone={snapshot.quorumReached ? 'success' : 'error'} /></div>
    </div> : <>
      <p className="text-xs text-muted-foreground">{t('organization', 'quorumNotComputed')}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label htmlFor="quorum-threshold-type">{t('organization', 'quorumThresholdType')}</Label><select id="quorum-threshold-type" value={thresholdType} onChange={(e) => setThresholdType(e.target.value as QuorumThresholdType)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{QUORUM_THRESHOLD_TYPES.map((type) => <option key={type} value={type}>{t('organization', type === 'PERCENTAGE' ? 'quorumPercentage' : 'quorumCount')}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="quorum-threshold-value">{t('organization', 'quorumThresholdValue')}</Label><Input id="quorum-threshold-value" type="number" min={0} value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} /></div>
      </div>
      <PermissionGate permission="governance.approve"><Button variant="outline" disabled={!thresholdValue || compute.isPending} onClick={() => compute.mutate({ type: thresholdType, value: Number(thresholdValue) })}>{t('organization', 'quorumCompute')}</Button></PermissionGate>
    </>}
  </CardContent></Card>;
}

const ASSEMBLY_DECISION_STATUS_TONE: Record<AssemblyDecisionStatus, 'info' | 'warning' | 'success' | 'error'> = { DRAFT: 'info', SUBMITTED: 'warning', VOTING: 'warning', DECIDED: 'success', CANCELLED: 'error' };
function assemblyDecisionStatusKey(status: AssemblyDecisionStatus): string {
  return status === 'DRAFT' ? 'decisionDraft' : status === 'SUBMITTED' ? 'decisionSubmitted' : status === 'VOTING' ? 'decisionVoting' : status === 'DECIDED' ? 'decisionDecided' : 'decisionCancelled';
}

/** D-4C4-WEB-06 : cycle de vie DRAFT → SUBMITTED → VOTING → DECIDED, annulation DRAFT/SUBMITTED → CANCELLED — chaque transition passe par une méthode de service dédiée, jamais un simple changement de champ. */
function AssemblyDecisionsCard({ t, meetingId }: { t: T; meetingId: string }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: decisions = [], isLoading } = useQuery({ queryKey: [...queryKeys.governance.assemblyDecisions(meetingId), currentTenant.id], queryFn: () => assemblyDecisionService.listAssemblyDecisionsByMeeting(currentTenant.id, meetingId) });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const invalidate = [[...queryKeys.governance.assemblyDecisions(meetingId), currentTenant.id]];
  const create = useMockMutation<AssemblyDecision | undefined, AssemblyDecisionInput>({ mutationFn: (input) => assemblyDecisionService.createAssemblyDecision(currentTenant.id, meetingId, input), invalidateKeys: invalidate, onSuccess: (result) => { if (!result) { notify.error(t('organization', 'decisionRejected')); return; } notify.success(t('organization', 'decisionCreated')); setCreateOpen(false); setForm({ title: '', description: '' }); } });
  const submit = useMockMutation<AssemblyDecision | undefined, string>({ mutationFn: (decisionId) => assemblyDecisionService.submitAssemblyDecision(currentTenant.id, decisionId), invalidateKeys: invalidate, onSuccess: () => notify.success(t('organization', 'decisionSubmittedNotice')) });
  const startVoting = useMockMutation<AssemblyDecision | undefined, string>({ mutationFn: (decisionId) => assemblyDecisionService.startAssemblyDecisionVoting(currentTenant.id, decisionId), invalidateKeys: invalidate, onSuccess: () => notify.success(t('organization', 'decisionVotingStarted')) });
  const decide = useMockMutation<AssemblyDecision | undefined, string>({ mutationFn: (decisionId) => assemblyDecisionService.decideAssemblyDecision(currentTenant.id, decisionId), invalidateKeys: invalidate, onSuccess: () => notify.success(t('organization', 'decisionDecidedNotice')) });
  const cancel = useMockMutation<AssemblyDecision | undefined, string>({ mutationFn: (decisionId) => assemblyDecisionService.cancelAssemblyDecision(currentTenant.id, decisionId), invalidateKeys: invalidate, onSuccess: () => notify.success(t('organization', 'decisionCancelledNotice')) });

  const columns: TableColumn<AssemblyDecision>[] = [
    { key: 'number', header: '#', className: 'w-12', render: (row) => row.decisionNumber },
    { key: 'title', header: t('organization', 'decisionTitleLabel'), render: (row) => <span className="font-semibold">{row.title}</span> },
    { key: 'status', header: t('organization', 'status'), render: (row) => <StatusBadge label={t('organization', assemblyDecisionStatusKey(row.status))} tone={ASSEMBLY_DECISION_STATUS_TONE[row.status]} /> },
    {
      key: 'actions', header: '', className: 'w-96', render: (row) => <div className="flex flex-wrap justify-end gap-1.5">
        {(row.status === 'VOTING' || row.status === 'DECIDED') && <Button variant="outline" size="sm" onClick={() => navigate(`/organization/governance/meetings/${meetingId}/decisions/${row.id}/votes`)}><ClipboardCheck size={14} />{t('organization', 'manageVotes')}</Button>}
        {row.status === 'DRAFT' && <PermissionGate permission="governance.approve"><Button variant="outline" size="sm" onClick={() => submit.mutate(row.id)}>{t('organization', 'decisionSubmit')}</Button></PermissionGate>}
        {row.status === 'SUBMITTED' && <PermissionGate permission="governance.approve"><Button variant="outline" size="sm" onClick={() => startVoting.mutate(row.id)}>{t('organization', 'decisionStartVoting')}</Button></PermissionGate>}
        {row.status === 'VOTING' && <PermissionGate permission="governance.approve"><Button variant="outline" size="sm" onClick={() => decide.mutate(row.id)}><CheckCircle2 size={14} />{t('organization', 'decisionDecide')}</Button></PermissionGate>}
        {(row.status === 'DRAFT' || row.status === 'SUBMITTED') && <PermissionGate permission="governance.approve"><Button variant="outline" size="sm" onClick={() => cancel.mutate(row.id)}><XCircle size={14} />{t('organization', 'decisionCancel')}</Button></PermissionGate>}
      </div>,
    },
  ];

  return <Card><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-sm">{t('organization', 'assemblyDecisionsTitle')}</CardTitle><PermissionGate permission="governance.create"><Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} />{t('organization', 'createDecision')}</Button></PermissionGate></CardHeader>
    <CardContent className="p-5 pt-0">
      {isLoading ? <TableSkeleton /> : <DataTable columns={columns} rows={decisions} empty={<EmptyState icon={ClipboardCheck} title={t('organization', 'noDecisions')} />} />}
      {createOpen && <ConfirmDialog open title={t('organization', 'createDecision')} confirmLabel={t('organization', 'save')} cancelLabel={t('organization', 'cancel')} onConfirm={() => create.mutate({ title: form.title, description: form.description, createdBy: currentTenant.id })} onCancel={() => setCreateOpen(false)}>
        <div className="mt-4 space-y-3 text-left">
          <div className="space-y-1"><Label htmlFor="decision-title">{t('organization', 'decisionTitleLabel')}</Label><Input id="decision-title" value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} /></div>
          <div className="space-y-1"><Label htmlFor="decision-description">{t('organization', 'description')}</Label><Textarea id="decision-description" value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} /></div>
        </div>
      </ConfirmDialog>}
    </CardContent>
  </Card>;
}

/**
 * Page détail unique pour tout `Meeting` (REGULAR ou GENERAL_ASSEMBLY) —
 * remplace l'ancienne `GeneralAssemblyDetail` autonome (correction
 * post-implémentation Phase 4C-4, cf.
 * docs/P1_GOVERNANCE_PHASE_4C4_GENERALASSEMBLY_MEETING_MIGRATION_UX_CORRECTION_REPORT.md
 * §7) : une seule identité métier `Meeting`, pas de second modèle "détail AG"
 * en parallèle. Quorum (D-4C4-WEB-04/05) et AssemblyDecision (D-4C4-WEB-06)
 * ne s'affichent que pour `type === 'GENERAL_ASSEMBLY'` — inchangés par
 * ailleurs, réutilisés tels quels. Présences reste accessible pour tout
 * Meeting (D-4C3-WEB-02 ne distinguait déjà pas de type).
 */
function MeetingDetail({ t }: { t: T }) {
  const { id = '' } = useParams(); const { currentTenant } = useTenant(); const navigate = useNavigate();
  const { data: meeting, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.governance.meeting(id), currentTenant.id], queryFn: () => organizationService.getMeeting(currentTenant.id, id) });
  if (isLoading) return <OrganizationPage title={t('organization', 'meetingDetail')} description=""><DetailSkeleton /></OrganizationPage>;
  if (isError) return <OrganizationPage title={t('organization', 'meetingDetail')} description=""><ErrorState onRetry={refetch} /></OrganizationPage>;
  if (!meeting) return <NotFoundPage />;
  const isGeneralAssembly = meeting.type === 'GENERAL_ASSEMBLY';
  return <OrganizationPage title={meeting.title} description={t('organization', 'meetingsTitle')} actions={<><BackButton label={t('organization', 'backToMeetings')} /><Button variant="outline" onClick={() => navigate(`/organization/governance/meetings/${meeting.id}/attendances`)}><UsersRound size={15} />{t('organization', 'manageAttendance')}</Button></>}>
    <Card><CardHeader><CardTitle className="text-sm">{t('organization', 'meetingInfo')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5 pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={t('organization', isGeneralAssembly ? 'meetingTypeGeneralAssembly' : 'meetingTypeRegular')} tone={isGeneralAssembly ? 'success' : 'default'} />
        <StatusBadge label={t('organization', meetingStatusKey(meeting.status))} tone={meetingStatusTone(meeting.status)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Info label={t('organization', 'meetingDate')} value={formatDate(meeting.date)} icon={CalendarDays} />
        <Info label={t('organization', 'location')} value={meeting.location || '—'} icon={Building2} />
        <Info label={t('organization', 'participants')} value={formatNumber(meeting.participants)} icon={UsersRound} />
        <Info label={t('organization', 'minutes')} value={meeting.minutes ?? '—'} icon={FileText} />
      </div>
      {meeting.agenda && <Info label={t('organization', 'agenda')} value={meeting.agenda} icon={ClipboardCheck} />}
      {isGeneralAssembly && meeting.description && <Info label={t('organization', 'description')} value={meeting.description} icon={FileText} />}
    </CardContent></Card>
    {isGeneralAssembly && <div className="grid gap-5 lg:grid-cols-2">
      <QuorumCard t={t} meetingId={meeting.id} />
      <div className="lg:col-span-2"><AssemblyDecisionsCard t={t} meetingId={meeting.id} /></div>
    </div>}
  </OrganizationPage>;
}

/** D-4C4-WEB-07/08/10 : gestion des Vote/VoteOption/MemberVote d'une AssemblyDecision — pas d'entrée de navigation dédiée, atteinte via "Gérer les votes" sur la carte Décisions. */
function DecisionVotesPage({ t }: { t: T }) {
  const { decisionId = '' } = useParams(); const { currentTenant } = useTenant();
  const decisionQuery = useQuery({ queryKey: [...queryKeys.governance.assemblyDecision(decisionId), currentTenant.id], queryFn: () => assemblyDecisionService.getAssemblyDecision(currentTenant.id, decisionId) });
  const votesQuery = useQuery({ queryKey: [...queryKeys.governance.decisionVotes(decisionId), currentTenant.id], queryFn: () => decisionVoteService.listVotesByDecision(currentTenant.id, decisionId) });
  const membersQuery = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });

  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState(''); const [optionsText, setOptionsText] = useState('');
  const invalidateVotes = [[...queryKeys.governance.decisionVotes(decisionId), currentTenant.id]];
  const createVote = useMockMutation<Vote | undefined, CreateDecisionVoteInput>({
    mutationFn: (input) => decisionVoteService.createVoteForDecision(currentTenant.id, decisionId, input),
    invalidateKeys: invalidateVotes,
    onSuccess: (result) => { if (!result) { notify.error(t('organization', 'decisionVoteRejected')); return; } notify.success(t('organization', 'decisionVoteCreated')); setCreateOpen(false); setSubject(''); setOptionsText(''); },
  });

  if (decisionQuery.isLoading || votesQuery.isLoading || membersQuery.isLoading) return <OrganizationPage title={t('organization', 'manageVotes')} description=""><TableSkeleton /></OrganizationPage>;
  if (decisionQuery.isError || votesQuery.isError || membersQuery.isError) return <OrganizationPage title={t('organization', 'manageVotes')} description=""><ErrorState onRetry={() => { decisionQuery.refetch(); votesQuery.refetch(); membersQuery.refetch(); }} /></OrganizationPage>;
  if (!decisionQuery.data) return <NotFoundPage />;
  const decision = decisionQuery.data;
  const decisionVotes = votesQuery.data ?? [];
  const members = membersQuery.data ?? [];

  return <OrganizationPage title={t('organization', 'manageVotes')} description={decision.title} actions={<BackButton label={t('organization', 'backToDecision')} />}>
    <Card><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-sm">{t('organization', 'votesTitle')}</CardTitle><PermissionGate permission="governance.create"><Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} />{t('organization', 'createVote')}</Button></PermissionGate></CardHeader>
      <CardContent className="space-y-3 p-5 pt-0">
        {decisionVotes.map((vote) => <DecisionVoteCard key={vote.id} t={t} vote={vote} members={members} />)}
        {decisionVotes.length === 0 && <EmptyState icon={ClipboardCheck} title={t('organization', 'noVotes')} />}
      </CardContent>
    </Card>
    {createOpen && <ConfirmDialog open title={t('organization', 'createVote')} confirmLabel={t('organization', 'save')} cancelLabel={t('organization', 'cancel')} onConfirm={() => createVote.mutate({ subject, optionLabels: optionsText.split(',').map((label) => label.trim()).filter(Boolean) })} onCancel={() => setCreateOpen(false)}>
      <div className="mt-4 space-y-3 text-left">
        <div className="space-y-1"><Label htmlFor="decision-vote-subject">{t('organization', 'voteSubject')}</Label><Input id="decision-vote-subject" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="decision-vote-options">{t('organization', 'voteOptionsLabel')}</Label><Input id="decision-vote-options" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={t('organization', 'voteOptionsPlaceholder')} /></div>
      </div>
    </ConfirmDialog>}
  </OrganizationPage>;
}

/** Une ligne "Vote" + ses VoteOption + la liste de casting nominatif MemberVote — même pattern que MeetingAttendancePage (statuts par bouton, un par membre). */
function DecisionVoteCard({ t, vote, members }: { t: T; vote: Vote; members: Member[] }) {
  const { currentTenant } = useTenant();
  const optionsQuery = useQuery({ queryKey: [...queryKeys.governance.voteOptions(vote.id), currentTenant.id], queryFn: () => decisionVoteService.listVoteOptions(currentTenant.id, vote.id) });
  const memberVotesQuery = useQuery({ queryKey: [...queryKeys.governance.memberVotes(vote.id), currentTenant.id], queryFn: () => decisionVoteService.listMemberVotes(currentTenant.id, vote.id) });
  const invalidate = [[...queryKeys.governance.memberVotes(vote.id), currentTenant.id]];
  const cast = useMockMutation<MemberVote | undefined, { memberId: string; voteOptionId: string }>({
    mutationFn: ({ memberId, voteOptionId }) => decisionVoteService.castMemberVote(currentTenant.id, vote.id, memberId, voteOptionId),
    invalidateKeys: invalidate,
    onSuccess: (result) => { if (!result) { notify.error(t('organization', 'memberVoteRejected')); return; } notify.success(t('organization', 'memberVoteCast')); },
  });
  const options = optionsQuery.data ?? [];
  const castVotes = memberVotesQuery.data ?? [];
  const castByMember = new Map(castVotes.map((item) => [item.memberId, item]));
  const optionById = new Map(options.map((option) => [option.id, option]));

  if (optionsQuery.isLoading || memberVotesQuery.isLoading) return <Card><CardContent className="p-4"><TableSkeleton /></CardContent></Card>;

  return <Card><CardContent className="space-y-3 p-4">
    <p className="text-sm font-semibold">{vote.subject}</p>
    <div className="space-y-2">
      {members.map((member) => {
        const existing = castByMember.get(member.id);
        return <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2">
          <span className="text-sm">{member.firstName} {member.lastName}{existing && <span className="ml-2 text-xs text-muted-foreground">{optionById.get(existing.voteOptionId)?.label}</span>}</span>
          <PermissionGate permission="governance.create">
            <div className="flex flex-wrap gap-1.5">
              {options.map((option: VoteOption) => <Button key={option.id} variant={existing?.voteOptionId === option.id ? 'default' : 'outline'} size="sm" disabled={Boolean(existing)} onClick={() => cast.mutate({ memberId: member.id, voteOptionId: option.id })}>{option.label}</Button>)}
            </div>
          </PermissionGate>
        </div>;
      })}
    </div>
  </CardContent></Card>;
}

const ATTENDANCE_STATUS_OPTIONS: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
const ATTENDANCE_STATUS_TONE: Record<AttendanceStatus, 'success' | 'error' | 'warning' | 'info'> = { PRESENT: 'success', ABSENT: 'error', LATE: 'warning', EXCUSED: 'info' };
function attendanceStatusKey(status: AttendanceStatus): string {
  return status === 'PRESENT' ? 'attendancePresent' : status === 'ABSENT' ? 'attendanceAbsent' : status === 'LATE' ? 'attendanceLate' : 'attendanceExcused';
}

/**
 * `operationId` généré côté client à chaque action utilisateur — c'est le
 * contrat minimal côté Web pour D-4C3-TECH-02 (identité de l'opération pour
 * l'idempotence), sans construire d'infrastructure Offline/Outbox complète
 * qui n'existe pas ailleurs dans ce projet (mandat IMPLEMENTATION GO §5/§21 :
 * « ne pas inventer une architecture parallèle »). Le comportement réel de
 * retransmission réseau reste Backend/Mobile Pending — voir
 * docs/P1_GOVERNANCE_PHASE_4C3_IMPLEMENTATION_REPORT.md §9.
 */
function generateOperationId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `OP-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Nouvelle page (D-4C3-WEB-02, Option A) — pas d'entrée de navigation dédiée :
 * atteinte uniquement via le bouton "Gérer les présences" de la liste des
 * réunions (mandat IMPLEMENTATION GO §17 : ne pas créer de nouvelle
 * structure de navigation). La présence reste nominative sur l'ensemble des
 * membres du tenant : aucune source ne définit de liste d'invités distincte
 * du répertoire Members, donc aucune n'est inventée ici.
 */
function MeetingAttendancePage({ t }: { t: T }) {
  const { meetingId = '' } = useParams();
  const { currentTenant } = useTenant();
  const meetingQuery = useQuery({ queryKey: [...queryKeys.governance.meeting(meetingId), currentTenant.id], queryFn: () => organizationService.getMeeting(currentTenant.id, meetingId) });
  const membersQuery = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const attendancesQuery = useQuery({ queryKey: [...queryKeys.governance.attendances(meetingId), currentTenant.id], queryFn: () => attendanceService.listAttendancesByMeeting(currentTenant.id, meetingId) });

  const setAttendance = useMockMutation<Attendance | undefined, AttendanceInput>({
    mutationFn: (input) => attendanceService.createAttendance(currentTenant.id, input),
    invalidateKeys: [[...queryKeys.governance.attendances(meetingId), currentTenant.id]],
    onSuccess: (result) => { if (!result) { notify.error(t('organization', 'attendanceRejected')); return; } notify.success(t('organization', 'attendanceSaved')); },
  });
  const removeAttendance = useMockMutation<Attendance | undefined, string>({
    mutationFn: (attendanceId) => attendanceService.deleteAttendance(currentTenant.id, attendanceId),
    invalidateKeys: [[...queryKeys.governance.attendances(meetingId), currentTenant.id]],
    onSuccess: (result) => { if (!result) { notify.error(t('organization', 'attendanceRejected')); return; } notify.success(t('organization', 'attendanceRemoved')); },
  });

  if (meetingQuery.isLoading || membersQuery.isLoading || attendancesQuery.isLoading) return <OrganizationPage title={t('organization', 'manageAttendance')} description=""><TableSkeleton /></OrganizationPage>;
  if (meetingQuery.isError || membersQuery.isError || attendancesQuery.isError) return <OrganizationPage title={t('organization', 'manageAttendance')} description=""><ErrorState onRetry={() => { meetingQuery.refetch(); membersQuery.refetch(); attendancesQuery.refetch(); }} /></OrganizationPage>;
  if (!meetingQuery.data) return <NotFoundPage />;
  const meeting = meetingQuery.data;
  const members = membersQuery.data ?? [];
  const attendances = attendancesQuery.data ?? [];
  const attendanceByMember = new Map(attendances.map((item) => [item.memberId, item]));
  const isOpen = meeting.status === 'PLANNED' || meeting.status === 'ONGOING';

  const columns: TableColumn<Member>[] = [
    { key: 'member', header: t('organization', 'member'), render: (row) => <span className="font-medium">{row.firstName} {row.lastName}</span> },
    { key: 'status', header: t('organization', 'status'), render: (row) => { const existing = attendanceByMember.get(row.id); return existing ? <StatusBadge label={t('organization', attendanceStatusKey(existing.status))} tone={ATTENDANCE_STATUS_TONE[existing.status]} /> : <span className="text-xs text-muted-foreground">{t('organization', 'attendanceNotRecorded')}</span>; } },
    {
      key: 'actions', header: '', className: 'w-96', render: (row) => {
        const existing = attendanceByMember.get(row.id);
        return <div className="flex flex-wrap items-center justify-end gap-1.5">
          <PermissionGate permission={existing ? 'governance.update' : 'governance.create'}>
            <div className="flex flex-wrap gap-1.5">
              {ATTENDANCE_STATUS_OPTIONS.map((status) => <Button key={status} variant={existing?.status === status ? 'default' : 'outline'} size="sm" disabled={!isOpen} onClick={() => setAttendance.mutate({ meetingId, memberId: row.id, status, operationId: generateOperationId() })}>{t('organization', attendanceStatusKey(status))}</Button>)}
            </div>
          </PermissionGate>
          {existing && <PermissionGate permission="governance.delete"><Button variant="outline" size="sm" disabled={!isOpen} onClick={() => removeAttendance.mutate(existing.id)}>{t('organization', 'delete')}</Button></PermissionGate>}
        </div>;
      },
    },
  ];

  return <OrganizationPage title={t('organization', 'manageAttendance')} description={meeting.title} actions={<BackButton label={t('organization', 'backToMeetings')} />}>
    <div className="flex items-center gap-3">
      <StatusBadge label={t('organization', meetingStatusKey(meeting.status))} tone={meetingStatusTone(meeting.status)} />
      {!isOpen && <p className="text-xs text-muted-foreground">{t('organization', 'attendanceLocked')}</p>}
    </div>
    <DataTable columns={columns} rows={members} empty={<EmptyState icon={UsersRound} title={t('organization', 'noMembers')} />} />
  </OrganizationPage>;
}

/**
 * Le registre des tenants (ex-`/organization/tenants*`) vit désormais sous
 * Platform Administration (`src/features/platform/platform-module.tsx`,
 * routes `/platform/tenants*`) — voir docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md.
 * Organization ne représente plus que le tenant courant (Members/Governance).
 */
/**
 * `Assembly`/`GeneralAssembly` ne sont plus des points d'entrée autonomes —
 * ces routes ne sont conservées que comme redirections pour ne pas casser
 * d'éventuels liens/marque-pages existants vers les anciennes URLs
 * (mandat correction post-implémentation §"ne pas casser des liens
 * existants sans vérification d'usage"), jamais comme UI dédiée.
 */
function RedirectToMeeting() { const { id = '' } = useParams(); return <Navigate to={`/organization/governance/meetings/${id}`} replace />; }
function RedirectToDecisionVotes() { const { meetingId = '', decisionId = '' } = useParams(); return <Navigate to={`/organization/governance/meetings/${meetingId}/decisions/${decisionId}/votes`} replace />; }

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
      <Route path="governance/meetings" element={<PermissionRoute permission="governance.read"><GovernanceTablePage t={t} kind="meetings" /></PermissionRoute>} />
      <Route path="governance/meetings/:meetingId/attendances" element={<PermissionRoute permission="governance.read"><MeetingAttendancePage t={t} /></PermissionRoute>} />
      <Route path="governance/meetings/:meetingId/decisions/:decisionId/votes" element={<PermissionRoute permission="governance.read"><DecisionVotesPage t={t} /></PermissionRoute>} />
      <Route path="governance/meetings/:id" element={<PermissionRoute permission="governance.read"><MeetingDetail t={t} /></PermissionRoute>} />
      <Route path="governance/votes" element={<GovernanceTablePage t={t} kind="votes" />} />
      <Route path="governance/board-mandates" element={<GovernanceTablePage t={t} kind="boardMandates" />} />
      <Route path="governance/assemblies" element={<Navigate to="/organization/governance/meetings" replace />} />
      <Route path="governance/general-assemblies" element={<Navigate to="/organization/governance/meetings" replace />} />
      <Route path="governance/general-assemblies/create" element={<Navigate to="/organization/governance/meetings" replace />} />
      <Route path="governance/general-assemblies/:id" element={<RedirectToMeeting />} />
      <Route path="governance/general-assemblies/:meetingId/decisions/:decisionId/votes" element={<RedirectToDecisionVotes />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
