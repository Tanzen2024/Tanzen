/**
 * Planification des bénéficiaires (mandat planification/permutation) — écran additif,
 * jamais un remplacement du panneau Opérations : réutilise les mêmes lectures
 * (`listOccurrencesByPeriod`/`listAllBeneficiaries`, déjà existantes pour la Vue
 * d'ensemble) pour donner une vue groupée « quelle occurrence a déjà son bénéficiaire ? »
 * sur une Période entière, avant même que la 1ʳᵉ occurrence ait eu lieu (mandat
 * « suppression complète de la logique Cycle/Tour » : plus de niveau Tour intermédiaire,
 * les bénéficiaires sont rattachés directement à l'Occurrence). Aucun tirage : ce n'est
 * qu'un tableau de bord + un renvoi vers Opérations (point d'entrée unique de désignation
 * d'un bénéficiaire), plus la demande de permutation (workflow générique, jamais
 * d'application directe).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, Repeat } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, StatusBadge, EmptyState, DateDisplay, PermissionGate, DetailSkeleton, ErrorState, MemberAvatar } from '@/components';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { NotFoundPage } from '@/routes';
import { tontineTurnsService } from '@/services/tontine-turns.service';
import { tontinesService } from '@/services/tontines.service';
import { organizationService } from '@/services/organization.service';
import { workflowService } from '@/services/workflow.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { TableColumn, StatusTone } from '@/types/ui';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label, onClick }: { label: string; onClick: () => void }) { return <Button variant="ghost" size="sm" onClick={onClick}>{label}</Button>; }

type PlanningRow = {
  id: string;
  occurrenceId: string;
  occurrenceNumber: number;
  occurrenceStatus: 'OPEN' | 'CLOSED';
  plannedDate: string;
  beneficiaryId?: string;
  adhesionId?: string;
  memberName?: string;
  photoUrl?: string;
  pendingPermutation: boolean;
};

export function TurnPlanningList({ t }: { t: T }) {
  const { tontineId = '', periodId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { user } = usePermissions();
  const { data: period, isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'period', periodId, currentTenant.id], queryFn: () => tontineTurnsService.getPeriod(currentTenant.id, periodId) });
  const { data: tontine } = useQuery({ queryKey: queryKeys.tontines.detail(tontineId), queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId), enabled: Boolean(period) });
  const { data: occurrences = [] } = useQuery({ queryKey: ['tontines', 'occurrences', periodId, currentTenant.id], queryFn: () => tontineTurnsService.listOccurrencesByPeriod(currentTenant.id, periodId), enabled: Boolean(period) });
  const { data: allBeneficiaries = [] } = useQuery({ queryKey: queryKeys.tontines.allBeneficiaries(currentTenant.id), queryFn: () => tontineTurnsService.listAllBeneficiaries(currentTenant.id), enabled: Boolean(period) });
  const { data: adhesions = [] } = useQuery({ queryKey: ['tontines', 'period-adhesions', periodId, currentTenant.id], queryFn: () => tontineTurnsService.listAdhesionsByPeriod(currentTenant.id, periodId), enabled: Boolean(period) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id), enabled: Boolean(period) });
  const { data: permutations = [] } = useQuery({ queryKey: queryKeys.tontines.beneficiaryPermutations(currentTenant.id), queryFn: () => tontineTurnsService.listBeneficiaryPermutations(currentTenant.id), enabled: Boolean(period) });
  const { data: pendingRequests = [] } = useQuery({ queryKey: queryKeys.operations.workflowRequests(currentTenant.id), queryFn: () => workflowService.listRequests(currentTenant.id), enabled: Boolean(period) });

  const [selectedA, setSelectedA] = useState<PlanningRow | null>(null);
  const [pendingPair, setPendingPair] = useState<{ a: PlanningRow; b: PlanningRow } | null>(null);
  const [justification, setJustification] = useState('');

  const adhesionById = useMemo(() => new Map(adhesions.map((item) => [item.id, item])), [adhesions]);
  const memberById = useMemo(() => new Map(members.map((item) => [item.id, item])), [members]);
  const pendingBeneficiaryIds = useMemo(() => {
    const pendingRequestIds = new Set(pendingRequests.filter((item) => item.domain === 'tontines' && item.entityType === 'beneficiaryPermutation' && (item.status === 'pending' || item.status === 'inProgress')).map((item) => item.id));
    const ids = new Set<string>();
    for (const permutation of permutations) {
      if (pendingRequestIds.has(permutation.workflowRequestId)) { ids.add(permutation.beneficiaryAId); ids.add(permutation.beneficiaryBId); }
    }
    return ids;
  }, [permutations, pendingRequests]);

  const rows = useMemo<PlanningRow[]>(() => {
    const list: PlanningRow[] = [];
    for (const occurrence of [...occurrences].sort((a, b) => a.occurrenceNumber - b.occurrenceNumber)) {
      const beneficiaries = allBeneficiaries.filter((item) => item.tontineOccurrenceId === occurrence.id);
      if (beneficiaries.length === 0) {
        list.push({ id: `empty-${occurrence.id}`, occurrenceId: occurrence.id, occurrenceNumber: occurrence.occurrenceNumber, occurrenceStatus: occurrence.status, plannedDate: occurrence.plannedDate, pendingPermutation: false });
        continue;
      }
      for (const beneficiary of beneficiaries) {
        const adhesion = adhesionById.get(beneficiary.adhesionId);
        const member = adhesion ? memberById.get(adhesion.memberId) : undefined;
        list.push({ id: beneficiary.id, occurrenceId: occurrence.id, occurrenceNumber: occurrence.occurrenceNumber, occurrenceStatus: occurrence.status, plannedDate: occurrence.plannedDate, beneficiaryId: beneficiary.id, adhesionId: beneficiary.adhesionId, memberName: adhesion?.memberName, photoUrl: member?.photoUrl, pendingPermutation: pendingBeneficiaryIds.has(beneficiary.id) });
      }
    }
    return list;
  }, [occurrences, allBeneficiaries, adhesionById, memberById, pendingBeneficiaryIds]);

  const plannedCount = rows.filter((row) => Boolean(row.beneficiaryId)).length;
  const totalOccurrences = new Set(rows.map((row) => row.occurrenceId)).size;
  const isComplete = totalOccurrences > 0 && plannedCount === totalOccurrences;
  /**
   * Mandat §6 — dérivé uniquement des données déjà chargées (`adhesions` de la Période,
   * `rows` déjà résolues), aucune nouvelle règle métier : un adhérent « jamais affecté »
   * n'apparaît dans aucun `beneficiary.adhesionId` de cette Période ; un adhérent
   * « affecté plusieurs fois » est explicitement autorisé (décision métier déjà actée,
   * cf. `requestBeneficiaryPermutation`/RB-08-09) — affiché à titre informatif, jamais
   * bloqué.
   */
  const assignmentCountByAdhesionId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) { if (row.adhesionId) map.set(row.adhesionId, (map.get(row.adhesionId) ?? 0) + 1); }
    return map;
  }, [rows]);
  const unassignedAdherents = useMemo(() => adhesions.filter((adhesion) => adhesion.status === 'active' && !assignmentCountByAdhesionId.has(adhesion.id)), [adhesions, assignmentCountByAdhesionId]);
  const multiAssignedAdherents = useMemo(() => adhesions.filter((adhesion) => (assignmentCountByAdhesionId.get(adhesion.id) ?? 0) > 1).map((adhesion) => ({ adhesion, count: assignmentCountByAdhesionId.get(adhesion.id)! })), [adhesions, assignmentCountByAdhesionId]);

  const permutationMutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.requestBeneficiaryPermutation>>, { beneficiaryAId: string; beneficiaryBId: string; justification?: string }>({
    mutationFn: (vars) => tontineTurnsService.requestBeneficiaryPermutation(currentTenant.id, { ...vars, requestedBy: user.name, requestedByUserId: user.id }),
    invalidateKeys: [queryKeys.tontines.beneficiaryPermutations(currentTenant.id), queryKeys.operations.workflowRequests(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'permutationRequestFailed')); return; }
      notify.success(t('tontines', 'permutationRequested'));
      setPendingPair(null);
      setJustification('');
    },
  });

  if (isLoading) return <Page title={t('tontines', 'planningTitle')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'planningTitle')}><ErrorState onRetry={refetch} /></Page>;
  if (!period || !tontine) return <NotFoundPage />;

  const handlePermuteClick = (row: PlanningRow) => {
    if (!row.beneficiaryId) return;
    if (!selectedA) { setSelectedA(row); return; }
    if (selectedA.beneficiaryId === row.beneficiaryId) { setSelectedA(null); return; }
    setPendingPair({ a: selectedA, b: row });
    setSelectedA(null);
  };

  const columns: TableColumn<PlanningRow>[] = [
    { key: 'occurrence', header: t('tontines', 'occurrenceNumber'), render: (row) => `#${row.occurrenceNumber}` },
    { key: 'beneficiary', header: t('tontines', 'beneficiary'), render: (row) => row.memberName
      ? <span className="flex items-center gap-2 font-medium"><MemberAvatar member={{ firstName: row.memberName, lastName: '', photoUrl: row.photoUrl }} />{row.memberName}</span>
      : <span className="text-xs text-muted-foreground">{t('tontines', 'notPlannedYet')}</span> },
    { key: 'date', header: t('tontines', 'plannedDate'), render: (row) => <DateDisplay value={row.plannedDate} /> },
    { key: 'reference', header: t('tontines', 'adhesionReference'), render: (row) => row.adhesionId ? <span className="font-mono text-xs text-muted-foreground">{row.adhesionId}</span> : <span className="text-muted-foreground">—</span> },
    { key: 'status', header: t('tontines', 'planningStatus'), render: (row) => row.beneficiaryId
      ? (row.pendingPermutation ? <StatusBadge label={t('tontines', 'permutationPending')} tone={'warning' as StatusTone} /> : <StatusBadge label={t('tontines', 'statusPlanned')} tone={'success' as StatusTone} />)
      : <StatusBadge label={t('tontines', 'statusNotPlanned')} tone={'default' as StatusTone} /> },
    { key: 'actions', header: '', className: 'w-64', render: (row) => <div className="flex flex-wrap items-center justify-end gap-2">
      {/* Désigner un bénéficiaire se fait désormais exclusivement depuis Opérations (mandat « suppression complète de la logique Cycle/Tour ») — plus d'écran dédié par occurrence. */}
      {!row.beneficiaryId && <Button size="sm" variant="outline" onClick={() => navigate('/tontines/operations')}>{t('tontines', 'planBeneficiary')}</Button>}
      {row.beneficiaryId && row.occurrenceStatus === 'OPEN' && !row.pendingPermutation && (
        <PermissionGate permission="beneficiaries.manage">
          <Button size="sm" variant={selectedA?.beneficiaryId === row.beneficiaryId ? 'default' : 'outline'} onClick={() => handlePermuteClick(row)}>
            <Repeat size={14} />{selectedA?.beneficiaryId === row.beneficiaryId ? t('tontines', 'cancelSelection') : t('tontines', 'requestPermutation')}
          </Button>
        </PermissionGate>
      )}
      <button type="button" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/${row.occurrenceId}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button>
    </div> },
  ];

  return <Page title={t('tontines', 'planningTitle')} description={`${tontine.name} · ${period.startDate} → ${period.endDate}`} actions={<Back label={t('tontines', 'backToPeriod')} onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}`)} />}>
    {selectedA && <p className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-primary">{t('tontines', 'permutationSelectHint', { turn: String(selectedA.occurrenceNumber), member: selectedA.memberName ?? '' })}</p>}
    <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div><p className="text-sm font-semibold">{t('tontines', 'planningCompletion')}</p><p className="text-xs text-muted-foreground">{t('tontines', 'planningCompletionCount', { planned: String(plannedCount), total: String(totalOccurrences) })}</p></div>
      <StatusBadge label={t('tontines', isComplete ? 'planningComplete' : 'planningIncomplete')} tone={(isComplete ? 'success' : 'warning') as StatusTone} />
    </CardContent></Card>
    {(unassignedAdherents.length > 0 || multiAssignedAdherents.length > 0) && <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-2">
      {unassignedAdherents.length > 0 && <div>
        <p className="text-sm font-semibold">{t('tontines', 'unassignedAdherents', { count: String(unassignedAdherents.length) })}</p>
        <ul className="mt-2 space-y-1.5">{unassignedAdherents.map((adhesion) => <li key={adhesion.id} className="flex items-center gap-2 text-sm"><MemberAvatar member={memberById.get(adhesion.memberId) ?? { firstName: adhesion.memberName, lastName: '' }} />{adhesion.memberName}</li>)}</ul>
      </div>}
      {multiAssignedAdherents.length > 0 && <div>
        <p className="text-sm font-semibold">{t('tontines', 'multiAssignedAdherents')}</p>
        <ul className="mt-2 space-y-1.5">{multiAssignedAdherents.map(({ adhesion, count }) => <li key={adhesion.id} className="flex items-center gap-2 text-sm"><MemberAvatar member={memberById.get(adhesion.memberId) ?? { firstName: adhesion.memberName, lastName: '' }} />{adhesion.memberName} <span className="text-xs text-muted-foreground">{t('tontines', 'beneficiaryCountSuffix', { count: String(count - 1) })}</span></li>)}</ul>
      </div>}
    </CardContent></Card>}
    <DataTable columns={columns} rows={rows} empty={<EmptyState icon={CalendarClock} title={t('tontines', 'noOccurrences')} />} />
    {pendingPair && <Dialog open onOpenChange={(open) => { if (!open) { setPendingPair(null); setJustification(''); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{t('tontines', 'permutationRequestTitle')}</DialogTitle><DialogDescription>{t('tontines', 'permutationRequestSubtitle')}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
          <div className="space-y-2 text-center"><MemberAvatar member={{ firstName: pendingPair.a.memberName ?? '', lastName: '', photoUrl: pendingPair.a.photoUrl }} size="lg" className="mx-auto" /><p className="text-sm font-semibold">{pendingPair.a.memberName}</p><p className="text-xs text-muted-foreground">{t('tontines', 'occurrenceNumber')} #{pendingPair.a.occurrenceNumber}</p></div>
          <Repeat className="text-muted-foreground" size={18} />
          <div className="space-y-2 text-center"><MemberAvatar member={{ firstName: pendingPair.b.memberName ?? '', lastName: '', photoUrl: pendingPair.b.photoUrl }} size="lg" className="mx-auto" /><p className="text-sm font-semibold">{pendingPair.b.memberName}</p><p className="text-xs text-muted-foreground">{t('tontines', 'occurrenceNumber')} #{pendingPair.b.occurrenceNumber}</p></div>
        </div>
        <div className="space-y-1"><Label htmlFor="permutation-justification">{t('tontines', 'permutationReason')}</Label><Textarea id="permutation-justification" value={justification} onChange={(event) => setJustification(event.target.value)} disabled={permutationMutation.isPending} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setPendingPair(null); setJustification(''); }}>{t('tontines', 'cancel')}</Button>
          <Button disabled={permutationMutation.isPending} onClick={() => permutationMutation.mutate({ beneficiaryAId: pendingPair.a.beneficiaryId!, beneficiaryBId: pendingPair.b.beneficiaryId!, justification: justification.trim() || undefined })}>{permutationMutation.isPending ? t('tontines', 'saving') : t('tontines', 'submitPermutationRequest')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </Page>;
}
