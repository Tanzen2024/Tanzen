/**
 * Adhésions — mandat « adhésions gérées au niveau de la Période » :
 * TENANT → TONTINE → PÉRIODE → ADHÉSIONS → OCCURRENCES. Une Adhésion
 * appartient désormais à UNE Période précise (plus de notion Tontine →
 * Adhésions permanentes, plus de couche d'affectation PeriodAdhesion). Ce
 * fichier remplace l'ancien couple AdhesionList/AdhesionDetail (tontine-wide)
 * ET l'ancien AssignPeriodAdhesions (periods-module.tsx) — un seul point
 * d'entrée pour la gestion des adhésions, toujours dans le contexte d'une
 * Période. Aucune notion de Participant/PeriodParticipant n'est introduite
 * (mandat §20) : le terme officiel est ADHÉSION partout dans l'UI.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, TicketCheck, UsersRound } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, DateDisplay, PermissionGate, DetailSkeleton, ErrorState, ConfirmDialog, FieldError, MemberAvatar, Timeline } from '@/components';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage } from '@/routes';
import { tontineTurnsService, type AdhesionInput } from '@/services/tontine-turns.service';
import { tontinesService } from '@/services/tontines.service';
import { organizationService } from '@/services/organization.service';
import { queryKeys } from '@/services/query-keys';
import type { Member } from '@/mocks/organization/members';
import { ContributionTable } from './contributions-module';
import { TontineWizardSteps } from './tontine-wizard-steps';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { TableColumn } from '@/types/ui';
import { formatValue } from './value-format';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const ADHESION_STATUS_TONE: Record<'active' | 'exited', 'success' | 'default'> = { active: 'success', exited: 'default' };
const ADHESION_STATUS_LABEL_KEY: Record<'active' | 'exited', string> = { active: 'statusActive', exited: 'statusExited' };

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label, onClick }: { label: string; onClick: () => void }) { return <Button variant="ghost" size="sm" onClick={onClick}>{label}</Button>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div>; }

/**
 * Écran « Adhésions de la période » (mandat §11/§12/§32, harmonisé avec le
 * pattern Accounts → « Gérer les adhérents », mandat harmonisation Accounts)
 * — étape 3 du parcours guidé ET destination du lien « Adhésions » depuis
 * PeriodDetail (mandat §24, Période → Adhésions, pas Tontine →
 * Participants). Deux panneaux : disponibles (membres actifs non encore
 * adhérents à cette Période) à gauche, affectés (adhésions existantes) à
 * droite — remplace l'ancien couple Card unique + `BulkAdhesionDialog`
 * modale par la même structure que `AccountMembersManage`. L'ajout unitaire
 * dédié (`/adhesions/new`, §13, avec sa propre date d'adhésion) reste
 * disponible séparément et partage la même mutation de service
 * (`buildAdhesion`/`createAdhesionsForPeriod`) — pas de seconde
 * architecture d'adhésion (§18). Panneau droit volontairement sans retrait
 * en masse : `closeAdhesion` exige une date de sortie par adhésion (RB
 * intact) et n'est donc pas un simple retrait instantané comme
 * `Account.memberIds` — clôturer reste une action individuelle via la fiche
 * adhésion (`PeriodAdhesionDetail`), jamais un bouton « Retirer tous »
 * inventé pour ce mandat.
 */
export function PeriodAdhesionList({ t }: { t: T }) {
  const { tontineId = '', periodId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: period, isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'period', periodId, currentTenant.id], queryFn: () => tontineTurnsService.getPeriod(currentTenant.id, periodId) });
  const { data: tontine } = useQuery({ queryKey: ['tontines', 'detail', tontineId, currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId), enabled: Boolean(period) });
  const { data: adhesions = [] } = useQuery({ queryKey: ['tontines', 'period-adhesions', periodId, currentTenant.id], queryFn: () => tontineTurnsService.listAdhesionsByPeriod(currentTenant.id, periodId), enabled: Boolean(period) });
  const { data: allMembers = [] } = useQuery({ queryKey: ['members', 'list', currentTenant.id], queryFn: () => organizationService.listMembers(currentTenant.id), enabled: Boolean(period) });
  const memberById = new Map(allMembers.map((item) => [item.id, item]));
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [availableSearch, setAvailableSearch] = useState('');
  const [assignedSearch, setAssignedSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [joinedAt, setJoinedAt] = useState('');
  const [joinedAtTouched, setJoinedAtTouched] = useState(false);
  /** Même cause racine documentée historiquement pour ce champ : `period.startDate`, jamais « aujourd'hui », reste entièrement modifiable par le gestionnaire. */
  useEffect(() => { if (period && !joinedAtTouched) setJoinedAt(period.startDate); }, [period, joinedAtTouched]);

  const mutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.createAdhesionsForPeriod>>, string[]>({
    mutationFn: (memberIds) => tontineTurnsService.createAdhesionsForPeriod(currentTenant.id, periodId, memberIds, joinedAt),
    invalidateKeys: [['tontines', 'period-adhesions', periodId, currentTenant.id], ['tontines', 'adhesions', tontineId, currentTenant.id], queryKeys.tontines.allAdhesions(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'fieldRequired')); return; }
      if (result.skippedMemberIds.length > 0) {
        notify.success(t('tontines', 'adhesionsAddedWithSkipped', { created: String(result.created.length), skipped: String(result.skippedMemberIds.length) }));
      } else {
        notify.success(t('tontines', result.created.length === 1 ? 'adhesionsAddedOne' : 'adhesionsAddedMany', { count: String(result.created.length) }));
      }
      setSelected(new Set());
    },
  });

  if (isLoading) return <Page title={t('tontines', 'assignAdhesionsTitle')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'assignAdhesionsTitle')}><ErrorState onRetry={refetch} /></Page>;
  if (!period || !tontine) return <NotFoundPage />;

  const alreadyMemberIds = new Set(adhesions.map((item) => item.memberId));
  const available = allMembers.filter((member) => member.status === 'active' && !alreadyMemberIds.has(member.id));
  const availableRows = availableSearch ? available.filter((member) => `${member.firstName} ${member.lastName} ${member.matricule}`.toLowerCase().includes(availableSearch.toLowerCase())) : available;
  const assignedRows = assignedSearch ? adhesions.filter((row) => row.memberName.toLowerCase().includes(assignedSearch.toLowerCase())) : adhesions;

  const toggle = (memberId: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(memberId)) next.delete(memberId); else next.add(memberId); return next; });

  const availableColumns: TableColumn<Member>[] = [
    { key: 'select', header: '', className: 'w-10', render: (row) => <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggle(row.id)} aria-label={row.firstName} /> },
    { key: 'memberName', header: t('tontines', 'adhesionMember'), render: (row) => <span className="flex items-center gap-2 font-medium"><MemberAvatar member={row} />{row.firstName} {row.lastName}</span> },
    { key: 'matricule', header: t('tontines', 'memberMatricule'), render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.matricule}</span> },
    { key: 'status', header: t('tontines', 'adhesionStatus'), render: () => <StatusBadge label={t('tontines', 'statusActive')} tone="success" /> },
  ];

  const assignedColumns: TableColumn<(typeof adhesions)[number]>[] = [
    { key: 'memberName', header: t('tontines', 'adhesionMember'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/adhesions/${row.id}`)} className="flex items-center gap-3 text-left"><MemberAvatar member={memberById.get(row.memberId) ?? { firstName: row.memberName, lastName: '' }} /><span className="font-medium text-primary hover:underline">{row.memberName}</span></button> },
    { key: 'matricule', header: t('tontines', 'memberMatricule'), render: (row) => <span className="font-mono text-xs text-muted-foreground">{memberById.get(row.memberId)?.matricule || '—'}</span> },
    { key: 'joinedAt', header: t('tontines', 'joinedAt'), render: (row) => <DateDisplay value={row.joinedAt} /> },
    { key: 'status', header: t('tontines', 'adhesionStatus'), render: (row) => <StatusBadge label={t('tontines', ADHESION_STATUS_LABEL_KEY[row.status])} tone={ADHESION_STATUS_TONE[row.status]} /> },
  ];

  const handleContinue = () => {
    if (adhesions.length === 0) { setConfirmEmpty(true); return; }
    navigate(`/tontines/${tontineId}/periods/${periodId}`);
  };

  return <Page title={t('tontines', 'assignAdhesionsTitle')} description={t('tontines', 'assignAdhesionsSubtitle')} actions={<Back label={t('tontines', 'backToTontine')} onClick={() => navigate(`/tontines/${tontineId}`)} />}>
    <TontineWizardSteps t={t} current={3} />
    {confirmEmpty && <ConfirmDialog open title={t('tontines', 'emptyPeriodWarningTitle')} description={t('tontines', 'emptyPeriodWarning')} confirmLabel={t('tontines', 'continueAnyway')} cancelLabel={t('tontines', 'cancel')} onConfirm={() => navigate(`/tontines/${tontineId}/periods/${periodId}`)} onCancel={() => setConfirmEmpty(false)} />}
    <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-3">
      <Info label={t('tontines', 'tontine')} value={tontine.name} />
      <Info label={t('tontines', 'periodSummary')} value={`${period.startDate} → ${period.endDate}`} />
      <div className="max-w-[200px] space-y-1"><Label htmlFor="period-joined-at">{t('tontines', 'joinedAt')}</Label><Input id="period-joined-at" type="date" value={joinedAt} onChange={(event) => { setJoinedAtTouched(true); setJoinedAt(event.target.value); }} /></div>
    </CardContent></Card>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">{t('tontines', 'availableAdherents')} ({available.length})</CardTitle>
          <PermissionGate permission="adhesions.manage"><div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/adhesions/new`)}><Plus size={15} />{t('tontines', 'addAdhesion')}</Button>
            <Button variant="outline" size="sm" disabled={selected.size === 0 || mutation.isPending} onClick={() => mutation.mutate([...selected])}>{t('tontines', 'addSelected')}</Button>
            <Button size="sm" disabled={available.length === 0 || mutation.isPending} onClick={() => mutation.mutate(available.map((member) => member.id))}>{t('tontines', 'addAllMembers')}</Button>
          </div></PermissionGate>
        </CardHeader>
        <CardContent className="space-y-3 p-0"><div className="px-4"><FilterBar search={availableSearch} onSearchChange={setAvailableSearch} placeholder={t('tontines', 'searchMemberPlaceholder')} /></div><DataTable columns={availableColumns} rows={availableRows} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noAvailableMembers')} />} /></CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">{t('tontines', 'assignedAdherents')} ({adhesions.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-0"><div className="px-4"><FilterBar search={assignedSearch} onSearchChange={setAssignedSearch} placeholder={t('tontines', 'searchMemberPlaceholder')} /></div><DataTable columns={assignedColumns} rows={assignedRows} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noAdhesions')} />} /></CardContent>
      </Card>
    </div>
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => navigate(`/tontines/${tontineId}`)}>{t('tontines', 'finishLater')}</Button>
      <Button onClick={handleContinue}>{t('tontines', 'continueToOccurrences')}</Button>
    </div>
  </Page>;
}

/**
 * Formulaire dédié (mandat §13, route `/adhesions/new`) — Tenant/Tontine ne
 * sont jamais affichés : la Période est implicite dans le contexte de
 * l'écran (route), seuls Membre + Date d'adhésion sont demandés.
 */
export function PeriodAdhesionCreate({ t }: { t: T }) {
  const { tontineId = '', periodId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: period, isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'period', periodId, currentTenant.id], queryFn: () => tontineTurnsService.getPeriod(currentTenant.id, periodId) });
  const { data: members = [] } = useQuery({ queryKey: ['members', 'list', currentTenant.id], queryFn: () => organizationService.listMembers(currentTenant.id), enabled: Boolean(period) });
  const [memberId, setMemberId] = useState('');
  const [joinedAt, setJoinedAt] = useState('');
  const [joinedAtTouched, setJoinedAtTouched] = useState(false);
  const [error, setError] = useState<string | undefined>();
  /** Même cause racine et même correction que `BulkAdhesionDialog` : `period.startDate`, jamais « aujourd'hui » — voir son commentaire pour le détail du bug corrigé. */
  useEffect(() => { if (period && !joinedAtTouched) setJoinedAt(period.startDate); }, [period, joinedAtTouched]);

  const mutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.createAdhesion>>, AdhesionInput>({
    mutationFn: (input) => tontineTurnsService.createAdhesion(currentTenant.id, input),
    invalidateKeys: [['tontines', 'period-adhesions', periodId, currentTenant.id], ['tontines', 'adhesions', tontineId, currentTenant.id], queryKeys.tontines.allAdhesions(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'fieldRequired')); return; }
      notify.success(t('tontines', 'adhesionCreated'));
      navigate(`/tontines/${tontineId}/periods/${periodId}/adhesions`);
    },
  });

  if (isLoading) return <Page title={t('tontines', 'addAdhesion')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'addAdhesion')}><ErrorState onRetry={refetch} /></Page>;
  if (!period) return <NotFoundPage />;

  const handleSave = () => {
    const member = members.find((item) => item.id === memberId);
    if (!member) { setError(t('tontines', 'fieldRequired')); return; }
    setError(undefined);
    mutation.mutate({ periodId, memberId: member.id, memberName: `${member.firstName} ${member.lastName}`, joinedAt });
  };

  return <Page title={t('tontines', 'addAdhesion')} description={t('tontines', 'addAdhesionSubtitle')} actions={<Back label={t('tontines', 'backToAdhesions')} onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/adhesions`)} />}>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'general')}</CardTitle></CardHeader>
      <div className="grid gap-4 p-5 pt-0 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="adhesion-member">{t('tontines', 'selectMember')}</Label><select id="adhesion-member" value={memberId} onChange={(event) => setMemberId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" aria-invalid={Boolean(error)}><option value="">{t('tontines', 'selectMember')}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}</select><FieldError message={error} /></div>
        <div className="space-y-2"><Label htmlFor="adhesion-joined">{t('tontines', 'joinedAt')}</Label><Input id="adhesion-joined" type="date" value={joinedAt} onChange={(event) => { setJoinedAtTouched(true); setJoinedAt(event.target.value); }} /></div>
      </div>
    </Card>
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/adhesions`)}>{t('tontines', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('tontines', 'saving') : t('tontines', 'addAdhesion')}</Button></div>
  </Page>;
}

export function PeriodAdhesionDetail({ t }: { t: T }) {
  const { tontineId = '', periodId = '', adhesionId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: adhesion, isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'adhesion', adhesionId, currentTenant.id], queryFn: () => tontineTurnsService.getAdhesion(currentTenant.id, adhesionId) });
  const { data: member } = useQuery({ queryKey: ['members', 'detail', adhesion?.memberId, currentTenant.id], queryFn: () => organizationService.getMember(currentTenant.id, adhesion!.memberId), enabled: Boolean(adhesion) });
  const { data: contributions = [] } = useQuery({ queryKey: ['tontines', 'adhesion-contributions', adhesionId, currentTenant.id], queryFn: () => tontineTurnsService.listContributionsByAdhesion(currentTenant.id, adhesionId), enabled: Boolean(adhesion) });
  const { data: beneficiaries = [] } = useQuery({ queryKey: ['tontines', 'adhesion-beneficiaries', adhesionId, currentTenant.id], queryFn: () => tontineTurnsService.listBeneficiariesByAdhesion(currentTenant.id, adhesionId), enabled: Boolean(adhesion) });
  /** Résout l'Occurrence de chaque bénéfice lié (mandat §Q1 : « distinguer/historiser » les différentes occurrences occupées par une adhésion) — lecture tenant-large déjà existante (Vue d'ensemble), réutilisée telle quelle plutôt qu'un nouvel appel dédié. */
  const { data: allOccurrences = [] } = useQuery({ queryKey: queryKeys.tontines.allOccurrences(currentTenant.id), queryFn: () => tontineTurnsService.listAllOccurrences(currentTenant.id), enabled: Boolean(adhesion) });
  const { data: permutationHistory = [] } = useQuery({ queryKey: ['tontines', 'permutation-history', adhesionId, currentTenant.id], queryFn: () => tontineTurnsService.listPermutationHistoryForAdhesion(currentTenant.id, adhesionId), enabled: Boolean(adhesion) });
  const [closeOpen, setCloseOpen] = useState(false);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [closeError, setCloseError] = useState<string | undefined>();
  const closeMutation = useMockMutation({
    mutationFn: (date: string) => tontineTurnsService.closeAdhesion(currentTenant.id, adhesionId, date),
    invalidateKeys: [['tontines', 'adhesion', adhesionId, currentTenant.id], ['tontines', 'period-adhesions', periodId, currentTenant.id], ['tontines', 'adhesions', tontineId, currentTenant.id], queryKeys.tontines.allAdhesions(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'fieldRequired')); return; }
      notify.success(t('tontines', 'adhesionClosed'));
      setCloseOpen(false);
    },
  });

  if (isLoading) return <Page title={t('tontines', 'adhesionDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'adhesionDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!adhesion) return <NotFoundPage />;

  const occurrenceById = new Map(allOccurrences.map((item) => [item.id, item]));
  const beneficiaryColumns: TableColumn<(typeof beneficiaries)[number]>[] = [
    { key: 'occurrence', header: t('tontines', 'occurrenceNumber'), render: (row) => { const occurrence = occurrenceById.get(row.tontineOccurrenceId); return occurrence ? <button type="button" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/${occurrence.id}`)} className="font-medium text-primary hover:underline">#{occurrence.occurrenceNumber}</button> : '—'; } },
    { key: 'id', header: 'ID', render: (row) => <span className="font-mono text-xs">{row.id}</span> },
    { key: 'valueType', header: t('tontines', 'valueType'), render: (row) => t('tontines', row.valueType === 'MONEY' ? 'valueTypeMoney' : 'valueTypeGoods') },
    { key: 'expected', header: t('tontines', 'expectedAmount'), render: (row) => formatValue(row.valueType, row.expectedAmount, row.expectedQuantity) },
    { key: 'received', header: t('tontines', 'receivedTotal'), render: (row) => formatValue(row.valueType, row.receivedTotal, row.receivedTotal) },
    { key: 'status', header: t('tontines', 'beneficiaryStatus'), render: (row) => <StatusBadge label={t('tontines', row.status === 'PENDING' ? 'statusReceptionPending' : row.status === 'PARTIAL' ? 'statusReceptionPartial' : 'statusReceptionReceived')} tone={row.status === 'RECEIVED' ? 'success' : row.status === 'PARTIAL' ? 'warning' : 'default'} /> },
  ];

  return <Page title={adhesion.memberName} description={`${adhesion.id} · ${t('tontines', 'adhesion')}`} actions={<><Back label={t('tontines', 'backToAdhesions')} onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/adhesions`)} />{adhesion.status === 'active' && <PermissionGate permission="adhesions.manage"><Button variant="outline" onClick={() => setCloseOpen(true)}>{t('tontines', 'closeAdhesion')}</Button></PermissionGate>}</>}>
    {closeOpen && <ConfirmDialog open title={t('tontines', 'closeAdhesion')} description={t('tontines', 'closeAdhesionConfirm')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onCancel={() => setCloseOpen(false)} onConfirm={() => {
      if (!endDate) { setCloseError(t('tontines', 'fieldRequired')); return; }
      setCloseError(undefined);
      closeMutation.mutate(endDate);
    }}>
      <div className="mt-4 space-y-1 text-left"><Label htmlFor="adhesion-end-date">{t('tontines', 'endDate')}</Label><Input id="adhesion-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /><FieldError message={closeError} /></div>
    </ConfirmDialog>}
    <Card><CardContent className="flex flex-wrap items-center gap-4 p-5 sm:grid sm:grid-cols-4">
      <div className="flex items-center gap-3 sm:col-span-4"><MemberAvatar member={member ?? { firstName: adhesion.memberName, lastName: '' }} size="lg" /><span className="text-lg font-semibold">{adhesion.memberName}</span></div>
      <Info label={t('tontines', 'adhesionMember')} value={adhesion.memberName} />
      <Info label={t('tontines', 'joinedAt')} value={new Date(adhesion.joinedAt).toLocaleDateString('fr-FR')} />
      <Info label={t('tontines', 'endDate')} value={adhesion.endDate ? new Date(adhesion.endDate).toLocaleDateString('fr-FR') : '—'} />
      <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'adhesionStatus')}</p><StatusBadge label={t('tontines', ADHESION_STATUS_LABEL_KEY[adhesion.status])} tone={ADHESION_STATUS_TONE[adhesion.status]} /></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'linkedContributions')}</CardTitle></CardHeader><CardContent className="p-0"><ContributionTable t={t} rows={contributions} /></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'linkedBeneficiaries')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={beneficiaryColumns} rows={beneficiaries} empty={<EmptyState icon={TicketCheck} title={t('tontines', 'noLinkedBeneficiaries')} />} /></CardContent></Card>
    {permutationHistory.length > 0 && <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'permutationHistory')}</CardTitle></CardHeader><CardContent className="p-5">
      <Timeline items={permutationHistory.map((event) => ({ id: event.id, title: event.resourceLabel, description: <span className="flex items-center gap-2"><MemberAvatar member={member ?? { firstName: adhesion.memberName, lastName: '' }} size="sm" />{t('tontines', 'permutationActor')} : {event.actorName}</span>, date: new Date(event.timestamp).toLocaleDateString('fr-FR'), tone: 'success' as const }))} />
    </CardContent></Card>}
  </Page>;
}
