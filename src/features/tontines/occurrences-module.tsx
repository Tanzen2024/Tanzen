/**
 * Modèle cible Tontine (Occurrence → Turn → TurnBeneficiary), additif au
 * module legacy (`tontines-module.tsx`, jamais modifié) — cf.
 * docs/P1_TONTINE_D-TON-04_REVISION_FINAL_DECISION_GATE.md et les audits
 * frontend/backend de cette session pour le détail des décisions D-TON-04
 * représentées ici (D-TON-04-05/-06/-13/-19/-20/-21, réceptions successives,
 * correction/régularisation/annulation, clôtures Turn/Occurrence distinctes).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, CheckCircle2, ChevronRight, CircleStop, Plus, RotateCcw, ScrollText, Undo2, UsersRound } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, Timeline, DateDisplay, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, ConfirmDialog, FieldError, MemberAvatar } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage } from '@/routes';
import { tontineTurnsService, type BeneficiaryInput } from '@/services/tontine-turns.service';
import { tontinesService } from '@/services/tontines.service';
import { organizationService } from '@/services/organization.service';
import { queryKeys } from '@/services/query-keys';
import { ContributionTable } from './contributions-module';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { isAdhesionActiveAt, type TontineOccurrenceStatus, type TontineTurnStatus, type BeneficiaryReceptionStatus, type ReceptionOperation } from '@/mocks/tontines/tontine-occurrences';
import type { TableColumn } from '@/types/ui';
import { formatNumber } from '@/lib/utils';
import { formatValue } from './value-format';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const ADHESION_STATUS_TONE: Record<'active' | 'exited', 'success' | 'default'> = { active: 'success', exited: 'default' };
const ADHESION_STATUS_LABEL_KEY: Record<'active' | 'exited', string> = { active: 'statusActive', exited: 'statusExited' };
const OCC_TONE: Record<TontineOccurrenceStatus | TontineTurnStatus, 'default' | 'success'> = { OPEN: 'success', CLOSED: 'default' };
const RECEPTION_TONE: Record<BeneficiaryReceptionStatus, 'default' | 'success' | 'warning'> = { PENDING: 'default', PARTIAL: 'warning', RECEIVED: 'success' };
const RECEPTION_LABEL_KEY: Record<BeneficiaryReceptionStatus, string> = { PENDING: 'statusReceptionPending', PARTIAL: 'statusReceptionPartial', RECEIVED: 'statusReceptionReceived' };
const STATUS_LABEL_KEY: Record<TontineOccurrenceStatus | TontineTurnStatus, string> = { OPEN: 'statusOpenTurn', CLOSED: 'statusClosedTurn' };
const OPERATION_LABEL_KEY = { reception: 'operationReception', correction: 'operationCorrection', regularization: 'operationRegularization', cancellation: 'operationCancellation' } as const;

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label, onClick }: { label: string; onClick: () => void }) { return <Button variant="ghost" size="sm" onClick={onClick}>{label}</Button>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div>; }

/** Table chronologique réutilisable — utilisée par `OccurrenceList` (page dédiée) et par l'onglet « Calendrier des occurrences » de `CycleDetail` (mandat P1), pour éviter toute duplication de colonnes. */
export function OccurrenceCalendarTable({ t, tontineId, periodId, occurrences }: { t: T; tontineId: string; periodId: string; occurrences: (Awaited<ReturnType<typeof tontineTurnsService.listOccurrencesByPeriod>>)[number][] }) {
  const navigate = useNavigate();
  const columns: TableColumn<(typeof occurrences)[number]>[] = [
    { key: 'occurrenceNumber', header: t('tontines', 'occurrenceNumber'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/${row.id}`)} className="font-semibold text-primary">#{row.occurrenceNumber}</button> },
    { key: 'plannedDate', header: t('tontines', 'plannedDate'), render: (row) => <DateDisplay value={row.plannedDate} /> },
    { key: 'actualDate', header: t('tontines', 'actualDate'), render: (row) => row.actualDate ? <DateDisplay value={row.actualDate} /> : <span className="text-muted-foreground">—</span> },
    { key: 'status', header: t('tontines', 'occurrenceStatus'), render: (row) => <StatusBadge label={t('tontines', STATUS_LABEL_KEY[row.status])} tone={OCC_TONE[row.status]} /> },
    { key: 'turn', header: t('tontines', 'turn'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/${row.id}/turn`)} className="flex items-center gap-1 text-primary hover:underline">{t('tontines', 'turn')}<ChevronRight size={14} /></button> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <DataTable columns={columns} rows={occurrences} empty={<EmptyState icon={CalendarDays} title={t('tontines', 'noOccurrences')} />} />;
}

export function OccurrenceList({ t }: { t: T }) {
  const { tontineId = '', periodId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: period, isLoading: isPeriodLoading, isError: isPeriodError, refetch: refetchPeriod } = useQuery({ queryKey: ['tontines', 'period', periodId, currentTenant.id], queryFn: () => tontineTurnsService.getPeriod(currentTenant.id, periodId) });
  const { data: occurrences = [], isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'occurrences', periodId, currentTenant.id], queryFn: () => tontineTurnsService.listOccurrencesByPeriod(currentTenant.id, periodId), enabled: Boolean(period) });
  if (isPeriodLoading) return <Page title={t('tontines', 'occurrencesTitle')}><TableSkeleton /></Page>;
  if (isPeriodError) return <Page title={t('tontines', 'occurrencesTitle')}><ErrorState onRetry={refetchPeriod} /></Page>;
  if (!period) return <NotFoundPage />;
  if (isLoading) return <Page title={t('tontines', 'occurrencesTitle')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'occurrencesTitle')}><ErrorState onRetry={refetch} /></Page>;
  return <Page title={t('tontines', 'occurrencesTitle')} description={`${period.id} · ${t('tontines', 'occurrencesDescription')}`} actions={<><Back label={t('tontines', 'backToPeriod')} onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}`)} /><PermissionGate permission="cycles.manage"><Button onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/create`)}><Plus size={16} />{t('tontines', 'createOccurrence')}</Button></PermissionGate></>}>
    <OccurrenceCalendarTable t={t} tontineId={tontineId} periodId={periodId} occurrences={occurrences} />
  </Page>;
}

export function OccurrenceCreate({ t }: { t: T }) {
  const { tontineId = '', periodId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: period, isLoading: isPeriodLoading, isError: isPeriodError, refetch: refetchPeriod } = useQuery({ queryKey: ['tontines', 'period', periodId, currentTenant.id], queryFn: () => tontineTurnsService.getPeriod(currentTenant.id, periodId) });
  const { data: occurrences = [] } = useQuery({ queryKey: ['tontines', 'occurrences', periodId, currentTenant.id], queryFn: () => tontineTurnsService.listOccurrencesByPeriod(currentTenant.id, periodId), enabled: Boolean(period) });
  const [occurrenceNumber, setOccurrenceNumber] = useState(1);
  const [plannedDate, setPlannedDate] = useState('');
  const [error, setError] = useState<string | undefined>();
  const mutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.createOccurrence>>, { periodId: string; occurrenceNumber: number; plannedDate: string }>({
    mutationFn: (input) => tontineTurnsService.createOccurrence(currentTenant.id, input),
    invalidateKeys: [['tontines', 'occurrences', periodId, currentTenant.id], queryKeys.tontines.allOccurrences(currentTenant.id), queryKeys.tontines.allTurns(currentTenant.id)],
    onSuccess: (occurrence) => {
      if (!occurrence) { notify.error(t('tontines', 'occurrenceNumberTaken')); return; }
      notify.success(t('tontines', 'occurrenceCreated'));
      navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/${occurrence.id}`);
    },
  });
  const [numberTouched, setNumberTouched] = useState(false);
  useEffect(() => {
    if (!numberTouched) setOccurrenceNumber(occurrences.length + 1);
  }, [occurrences.length, numberTouched]);
  if (isPeriodLoading) return <Page title={t('tontines', 'createOccurrence')}><DetailSkeleton /></Page>;
  if (isPeriodError) return <Page title={t('tontines', 'createOccurrence')}><ErrorState onRetry={refetchPeriod} /></Page>;
  if (!period) return <NotFoundPage />;
  const handleSave = () => {
    if (!plannedDate) { setError(t('tontines', 'fieldRequired')); return; }
    setError(undefined);
    mutation.mutate({ periodId, occurrenceNumber, plannedDate });
  };
  return <Page title={t('tontines', 'createOccurrence')} description={period.id} actions={<Back label={t('tontines', 'backToOccurrences')} onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences`)} />}>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'general')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="occurrence-number">{t('tontines', 'occurrenceNumber')}</Label><Input id="occurrence-number" type="number" min={1} value={occurrenceNumber} onChange={(event) => { setNumberTouched(true); setOccurrenceNumber(Number(event.target.value)); }} /></div>
      <div className="space-y-2"><Label htmlFor="occurrence-planned-date">{t('tontines', 'plannedDate')}</Label><Input id="occurrence-planned-date" type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} aria-invalid={Boolean(error)} /><FieldError message={error} /></div>
    </CardContent></Card>
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences`)}>{t('tontines', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('tontines', 'saving') : t('tontines', 'save')}</Button></div>
  </Page>;
}

export function OccurrenceDetail({ t }: { t: T }) {
  const { tontineId = '', periodId = '', occurrenceId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: occurrence, isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'occurrence', occurrenceId, currentTenant.id], queryFn: () => tontineTurnsService.getOccurrence(currentTenant.id, occurrenceId) });
  const { data: turn } = useQuery({ queryKey: ['tontines', 'turn-by-occurrence', occurrenceId, currentTenant.id], queryFn: () => tontineTurnsService.getTurnByOccurrence(currentTenant.id, occurrenceId), enabled: Boolean(occurrence) });
  const { data: contributions = [] } = useQuery({ queryKey: ['tontines', 'occurrence-contributions', occurrenceId, currentTenant.id], queryFn: () => tontineTurnsService.listContributionsByOccurrence(currentTenant.id, occurrenceId), enabled: Boolean(occurrence) });
  const { data: adhesions = [] } = useQuery({ queryKey: ['tontines', 'adhesions', tontineId, currentTenant.id], queryFn: () => tontineTurnsService.listAdhesionsByTontine(currentTenant.id, tontineId), enabled: Boolean(occurrence) });
  const { data: members = [] } = useQuery({ queryKey: ['members', 'list', currentTenant.id], queryFn: () => organizationService.listMembers(currentTenant.id), enabled: Boolean(occurrence) });
  const [confirmClose, setConfirmClose] = useState(false);
  const closeMutation = useMockMutation({
    mutationFn: () => tontineTurnsService.closeOccurrence(currentTenant.id, occurrenceId),
    invalidateKeys: [['tontines', 'occurrence', occurrenceId, currentTenant.id], ['tontines', 'occurrences', periodId, currentTenant.id], queryKeys.tontines.allOccurrences(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'turnClosePrecondition')); return; }
      notify.success(t('tontines', 'occurrenceClosed'));
      setConfirmClose(false);
    },
  });
  if (isLoading) return <Page title={t('tontines', 'occurrenceDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'occurrenceDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!occurrence) return <NotFoundPage />;
  return <Page title={`${t('tontines', 'occurrenceNumber')} ${occurrence.occurrenceNumber}`} description={occurrence.id} actions={<><Back label={t('tontines', 'backToOccurrences')} onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences`)} />{occurrence.status === 'OPEN' && turn?.status === 'CLOSED' && <PermissionGate permission="cycles.manage"><Button variant="outline" onClick={() => setConfirmClose(true)}><CircleStop size={15} />{t('tontines', 'closeOccurrence')}</Button></PermissionGate>}</>}>
    {confirmClose && <ConfirmDialog open title={t('tontines', 'closeOccurrence')} description={t('tontines', 'closeOccurrenceConfirm')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onConfirm={() => closeMutation.mutate(undefined)} onCancel={() => setConfirmClose(false)} />}
    <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-3">
      <Info label={t('tontines', 'plannedDate')} value={new Date(occurrence.plannedDate).toLocaleDateString('fr-FR')} />
      <Info label={t('tontines', 'actualDate')} value={occurrence.actualDate ? new Date(occurrence.actualDate).toLocaleDateString('fr-FR') : '—'} />
      <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'occurrenceStatus')}</p><StatusBadge label={t('tontines', STATUS_LABEL_KEY[occurrence.status])} tone={OCC_TONE[occurrence.status]} /></div>
    </CardContent></Card>
    <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">{t('tontines', 'turn')}</CardTitle>{turn && <StatusBadge label={t('tontines', STATUS_LABEL_KEY[turn.status])} tone={OCC_TONE[turn.status]} />}</CardHeader><CardContent>
      {turn ? <Button variant="outline" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/${occurrenceId}/turn`)}><UsersRound size={15} />{t('tontines', 'beneficiaries')}<ChevronRight size={14} /></Button> : <EmptyState icon={CalendarClock} title={t('tontines', 'noOccurrences')} />}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'occurrenceContributions')}</CardTitle></CardHeader><CardContent className="p-0"><ContributionTable t={t} rows={contributions} adhesions={adhesions} members={members} /></CardContent></Card>
  </Page>;
}

type OperationDialogMode = 'reception' | 'correction' | 'regularization' | 'cancellation';

function OperationDialog({ t, mode, valueType, operations, onSubmit, onCancel, isPending }: {
  t: T; mode: OperationDialogMode; valueType: 'MONEY' | 'GOODS'; operations: ReceptionOperation[];
  onSubmit: (payload: { amount?: number; quantity?: number; operationId?: string; reason?: string }) => void;
  onCancel: () => void; isPending: boolean;
}) {
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [operationId, setOperationId] = useState(operations[operations.length - 1]?.id ?? '');
  const needsOperationTarget = mode === 'correction' || mode === 'cancellation';
  const needsValue = mode !== 'cancellation';
  const needsReason = mode !== 'reception';
  const titleKey = mode === 'reception' ? 'recordReception' : mode === 'correction' ? 'correctReceptionTitle' : mode === 'regularization' ? 'regularizeReceptionTitle' : 'cancelReceptionTitle';
  const valid = (!needsValue || value.trim() !== '') && (!needsOperationTarget || operationId !== '') && (!needsReason || reason.trim() !== '');
  return <ConfirmDialog open title={t('tontines', titleKey)} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onCancel={onCancel} onConfirm={() => {
    if (!valid) return;
    onSubmit({
      amount: valueType === 'MONEY' && needsValue ? Number(value) || 0 : undefined,
      quantity: valueType === 'GOODS' && needsValue ? Number(value) || 0 : undefined,
      operationId: needsOperationTarget ? operationId : undefined,
      reason: needsReason ? reason : undefined,
    });
  }}>
    <div className="mt-4 space-y-3 text-left">
      {mode === 'cancellation' && <p className="text-xs text-amber-600">{t('tontines', 'cancellationWarning')}</p>}
      {needsOperationTarget && <div className="space-y-1"><Label htmlFor="op-target">{t('tontines', 'operationHistory')}</Label><select id="op-target" value={operationId} onChange={(event) => setOperationId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{operations.filter((op) => op.type === 'reception' || op.type === 'regularization').map((op) => <option key={op.id} value={op.id}>{op.date} · {formatValue(valueType, op.amount, op.quantity)}</option>)}</select></div>}
      {needsValue && <div className="space-y-1"><Label htmlFor="op-value">{valueType === 'MONEY' ? t('tontines', mode === 'correction' ? 'receptionAmount' : 'receptionAmount') : t('tontines', 'receptionQuantity')}</Label><Input id="op-value" type="number" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} disabled={isPending} /></div>}
      {needsReason && <div className="space-y-1"><Label htmlFor="op-reason">{mode === 'correction' ? t('tontines', 'correctionReason') : mode === 'regularization' ? t('tontines', 'regularizationReason') : t('tontines', 'cancellationReason')}</Label><Input id="op-reason" value={reason} onChange={(event) => setReason(event.target.value)} disabled={isPending} /><FieldError message={!valid && reason.trim() === '' ? (mode === 'correction' ? t('tontines', 'correctionRequired') : mode === 'regularization' ? t('tontines', 'regularizationRequired') : t('tontines', 'cancellationRequired')) : undefined} /></div>}
    </div>
  </ConfirmDialog>;
}

function BeneficiaryCard({ t, beneficiary, turnClosed }: { t: T; beneficiary: Awaited<ReturnType<typeof tontineTurnsService.listBeneficiariesByTurn>>[number]; turnClosed: boolean }) {
  const { currentTenant } = useTenant();
  const [dialogMode, setDialogMode] = useState<OperationDialogMode | null>(null);
  const { data: adhesion } = useQuery({ queryKey: ['tontines', 'adhesion', beneficiary.adhesionId, currentTenant.id], queryFn: () => tontineTurnsService.getAdhesion(currentTenant.id, beneficiary.adhesionId) });
  const { data: member } = useQuery({ queryKey: ['members', 'detail', adhesion?.memberId, currentTenant.id], queryFn: () => organizationService.getMember(currentTenant.id, adhesion!.memberId), enabled: Boolean(adhesion) });
  const invalidateKeys = [['tontines', 'turn-beneficiaries', beneficiary.tontineTurnId, currentTenant.id], queryKeys.tontines.allBeneficiaries(currentTenant.id)];
  const receptionMutation = useMockMutation({ mutationFn: (input: { amount?: number; quantity?: number }) => tontineTurnsService.recordReception(currentTenant.id, beneficiary.id, input), invalidateKeys, onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'turnClosedNoModification')); return; } notify.success(t('tontines', 'receptionRecorded')); setDialogMode(null); } });
  const correctionMutation = useMockMutation({ mutationFn: (input: { operationId: string; amount?: number; quantity?: number; reason: string }) => tontineTurnsService.correctReception(currentTenant.id, beneficiary.id, input), invalidateKeys, onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'correctionRequired')); return; } notify.success(t('tontines', 'correctionRecorded')); setDialogMode(null); } });
  const regularizationMutation = useMockMutation({ mutationFn: (input: { amount?: number; quantity?: number; reason: string }) => tontineTurnsService.regularizeReception(currentTenant.id, beneficiary.id, input), invalidateKeys, onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'regularizationRequired')); return; } notify.success(t('tontines', 'regularizationRecorded')); setDialogMode(null); } });
  const cancellationMutation = useMockMutation({ mutationFn: (input: { operationId: string; reason: string }) => tontineTurnsService.cancelReception(currentTenant.id, beneficiary.id, input), invalidateKeys, onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'cancellationRequired')); return; } notify.success(t('tontines', 'cancellationRecorded')); setDialogMode(null); } });
  const expected = beneficiary.valueType === 'MONEY' ? beneficiary.expectedAmount : beneficiary.expectedQuantity;
  const remaining = Math.max(0, (expected ?? 0) - beneficiary.receivedTotal);
  const isPending = receptionMutation.isPending || correctionMutation.isPending || regularizationMutation.isPending || cancellationMutation.isPending;

  return <Card>
    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
      <CardTitle className="flex items-center gap-2 text-sm"><MemberAvatar member={member ?? { firstName: adhesion?.memberName ?? beneficiary.adhesionId, lastName: '' }} />{adhesion?.memberName ?? beneficiary.adhesionId}</CardTitle>
      <StatusBadge label={t('tontines', RECEPTION_LABEL_KEY[beneficiary.status])} tone={RECEPTION_TONE[beneficiary.status]} />
    </CardHeader>
    <CardContent className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <Info label={beneficiary.valueType === 'MONEY' ? t('tontines', 'expectedAmount') : t('tontines', 'expectedQuantity')} value={formatValue(beneficiary.valueType, beneficiary.expectedAmount, beneficiary.expectedQuantity, beneficiary.item)} />
        <Info label={t('tontines', 'receivedTotal')} value={formatValue(beneficiary.valueType, beneficiary.receivedTotal, beneficiary.receivedTotal, beneficiary.item)} />
        <Info label={t('tontines', 'remaining')} value={formatValue(beneficiary.valueType, remaining, remaining, beneficiary.item)} />
        <Info label={t('tontines', 'valueType')} value={t('tontines', beneficiary.valueType === 'MONEY' ? 'valueTypeMoney' : 'valueTypeGoods')} />
      </div>
      {turnClosed ? <p className="text-xs text-muted-foreground">{t('tontines', 'turnClosedNoModification')}</p> : (
        <PermissionGate permission="beneficiaries.manage">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialogMode('reception')}><Plus size={14} />{t('tontines', 'newReception')}</Button>
            <Button size="sm" variant="outline" disabled={beneficiary.operations.length === 0} onClick={() => setDialogMode('correction')}><RotateCcw size={14} />{t('tontines', 'correctReception')}</Button>
            <Button size="sm" variant="outline" onClick={() => setDialogMode('regularization')}><ScrollText size={14} />{t('tontines', 'regularizeReception')}</Button>
            <Button size="sm" variant="outline" disabled={beneficiary.operations.length === 0} onClick={() => setDialogMode('cancellation')}><Undo2 size={14} />{t('tontines', 'cancelReception')}</Button>
          </div>
        </PermissionGate>
      )}
      <div className="border-t border-border pt-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('tontines', 'operationHistory')}</p>
        {beneficiary.operations.length === 0 ? <p className="text-xs text-muted-foreground">{t('tontines', 'noOperations')}</p> : (
          <Timeline items={beneficiary.operations.map((op) => ({ id: op.id, title: `${t('tontines', OPERATION_LABEL_KEY[op.type])} · ${formatValue(beneficiary.valueType, op.amount, op.quantity, beneficiary.item)}`, description: op.reason ?? `${t('tontines', 'operationActor')} : ${op.actorName}`, date: new Date(op.date).toLocaleDateString('fr-FR'), tone: op.type === 'cancellation' ? 'default' : 'success' }))} />
        )}
      </div>
    </CardContent>
    {dialogMode && <OperationDialog t={t} mode={dialogMode} valueType={beneficiary.valueType} operations={beneficiary.operations} isPending={isPending} onCancel={() => setDialogMode(null)} onSubmit={(payload) => {
      if (dialogMode === 'reception') receptionMutation.mutate({ amount: payload.amount, quantity: payload.quantity });
      else if (dialogMode === 'correction') correctionMutation.mutate({ operationId: payload.operationId!, amount: payload.amount, quantity: payload.quantity, reason: payload.reason ?? '' });
      else if (dialogMode === 'regularization') regularizationMutation.mutate({ amount: payload.amount, quantity: payload.quantity, reason: payload.reason ?? '' });
      else cancellationMutation.mutate({ operationId: payload.operationId!, reason: payload.reason ?? '' });
    }} />}
  </Card>;
}

/**
 * Fenêtre « Ajouter un bénéficiaire » — enregistre le résultat d'un tirage
 * MANUEL déjà réalisé hors TANZEN (RB-06/RB-07) ; ne calcule, ne propose ni
 * ne présélectionne jamais lui-même une adhésion (aucun bouton « tirer »/
 * « générer »). Ne liste que les adhésions de LA MÊME Période que
 * l'Occurrence de ce Turn (RB-01/02/03, `listAdhesionsByPeriod`, même
 * source que `BulkAdhesionDialog`/`PeriodAdhesionList`) ; les adhésions déjà
 * bénéficiaires de ce Turn sont affichées désactivées avec un badge plutôt
 * que masquées (même convention UX que `BulkAdhesionDialog`, §8).
 */
function AddBeneficiaryDialog({ t, turnId, periodId, referenceDate, tontine, existingAdhesionIds, open, onOpenChange }: {
  t: T; turnId: string; periodId: string; referenceDate?: string; tontine?: { valueType: 'MONEY' | 'GOODS'; item?: string };
  existingAdhesionIds: Set<string>; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { currentTenant } = useTenant();
  const { data: adhesions = [] } = useQuery({ queryKey: ['tontines', 'period-adhesions', periodId, currentTenant.id], queryFn: () => tontineTurnsService.listAdhesionsByPeriod(currentTenant.id, periodId), enabled: open });
  const { data: members = [] } = useQuery({ queryKey: ['members', 'list', currentTenant.id], queryFn: () => organizationService.listMembers(currentTenant.id), enabled: open });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [value, setValue] = useState('');

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  /** Même règle d'éligibilité que le service (`isAdhesionActiveAt`, reference = `occurrence.actualDate ?? occurrence.plannedDate`) — calculée ici uniquement pour AFFICHER pourquoi une adhésion serait ignorée, jamais pour dupliquer la validation réelle (le service reste la seule source de vérité, revalidé à chaque appel). Root cause du bug « 0 bénéficiaire ajouté » : ce calcul n'existait nulle part côté UI avant cette correction — l'utilisateur pouvait sélectionner une adhésion pas encore active à la date de l'occurrence sans le moindre signal, puis découvrir après coup un skip silencieux. */
  const isEligible = useCallback((adhesion: (typeof adhesions)[number]) => !referenceDate || isAdhesionActiveAt(adhesion, referenceDate), [referenceDate]);
  const query = search.trim().toLowerCase();
  const rows = useMemo(
    () => query ? adhesions.filter((adhesion) => `${adhesion.memberName} ${adhesion.id}`.toLowerCase().includes(query)) : adhesions,
    [adhesions, query],
  );
  const availableIds = useMemo(() => rows.filter((adhesion) => !existingAdhesionIds.has(adhesion.id) && isEligible(adhesion)).map((adhesion) => adhesion.id), [rows, existingAdhesionIds, isEligible]);

  const mutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.addBeneficiaries>>, BeneficiaryInput>({
    mutationFn: (input) => tontineTurnsService.addBeneficiaries(currentTenant.id, turnId, input),
    invalidateKeys: [['tontines', 'turn-beneficiaries', turnId, currentTenant.id], queryKeys.tontines.allBeneficiaries(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'beneficiariesAddFailed')); return; }
      if (result.created.length === 0) { notify.error(t('tontines', 'beneficiariesAddAllSkipped')); return; }
      if (result.skippedAdhesionIds.length > 0) {
        notify.success(t('tontines', 'beneficiariesAddedWithSkipped', { created: String(result.created.length), skipped: String(result.skippedAdhesionIds.length) }));
      } else {
        notify.success(t('tontines', result.created.length === 1 ? 'beneficiariesAddedOne' : 'beneficiariesAddedMany', { count: String(result.created.length) }));
      }
      setSelected(new Set());
      setSearch('');
      setValue('');
      onOpenChange(false);
    },
  });

  const toggleOne = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelected(selected.size === availableIds.length && availableIds.length > 0 ? new Set() : new Set(availableIds));

  const columns: TableColumn<(typeof adhesions)[number]>[] = [
    { key: 'select', header: '', className: 'w-10', render: (row) => (existingAdhesionIds.has(row.id) || !isEligible(row)) ? <Checkbox checked={existingAdhesionIds.has(row.id)} disabled aria-label={row.memberName} /> : <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleOne(row.id)} aria-label={row.memberName} /> },
    { key: 'memberName', header: t('tontines', 'adhesionMember'), render: (row) => <span className="flex items-center gap-2 font-medium"><MemberAvatar member={memberById.get(row.memberId) ?? { firstName: row.memberName, lastName: '' }} />{row.memberName}</span> },
    { key: 'reference', header: t('tontines', 'adhesionReference'), render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.id}</span> },
    { key: 'status', header: t('tontines', 'adhesionStatus'), render: (row) => existingAdhesionIds.has(row.id)
      ? <span className="text-xs text-muted-foreground">{t('tontines', 'alreadyBeneficiary')}</span>
      : !isEligible(row) ? <span className="text-xs text-amber-600">{t('tontines', 'notEligibleForOccurrence')}</span>
      : <StatusBadge label={t('tontines', ADHESION_STATUS_LABEL_KEY[row.status])} tone={ADHESION_STATUS_TONE[row.status]} /> },
  ];

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
      <DialogHeader><DialogTitle>{t('tontines', 'addBeneficiary')}</DialogTitle><DialogDescription>{t('tontines', 'addBeneficiarySubtitle')}</DialogDescription></DialogHeader>
      <div className="max-w-[220px] space-y-1"><Label htmlFor="beneficiary-value">{t('tontines', 'expectedValueOptional')}</Label><Input id="beneficiary-value" type="number" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} /></div>
      <FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'searchAdhesionPlaceholder')} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" disabled={availableIds.length === 0} onClick={toggleAll}>{selected.size === availableIds.length && availableIds.length > 0 ? t('tontines', 'deselectAll') : t('tontines', 'selectAll')}</Button>
        {selected.size > 0 && <span className="text-xs text-muted-foreground">{t('tontines', selected.size === 1 ? 'selectedMembersCountOne' : 'selectedMembersCountMany', { count: String(selected.size) })}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border"><DataTable columns={columns} rows={rows} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noEligibleAdhesions')} />} /></div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>{t('tontines', 'cancel')}</Button>
        <Button disabled={selected.size === 0 || mutation.isPending} onClick={() => {
          const valueType = tontine?.valueType ?? 'MONEY';
          const parsed = value.trim() ? Number(value) : undefined;
          mutation.mutate({
            adhesionIds: [...selected], valueType,
            expectedAmount: valueType === 'MONEY' ? parsed : undefined,
            expectedQuantity: valueType === 'GOODS' ? parsed : undefined,
            item: valueType === 'GOODS' ? tontine?.item : undefined,
          });
        }}>
          {mutation.isPending ? t('tontines', 'saving') : t('tontines', selected.size === 1 ? 'addBeneficiariesOne' : 'addBeneficiariesMany', { count: String(selected.size) })}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function TurnDetail({ t }: { t: T }) {
  const { tontineId = '', periodId = '', occurrenceId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: turn, isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'turn-by-occurrence', occurrenceId, currentTenant.id], queryFn: () => tontineTurnsService.getTurnByOccurrence(currentTenant.id, occurrenceId) });
  const { data: occurrence } = useQuery({ queryKey: ['tontines', 'occurrence', occurrenceId, currentTenant.id], queryFn: () => tontineTurnsService.getOccurrence(currentTenant.id, occurrenceId) });
  const { data: beneficiaries = [] } = useQuery({ queryKey: ['tontines', 'turn-beneficiaries', turn?.id, currentTenant.id], queryFn: () => tontineTurnsService.listBeneficiariesByTurn(currentTenant.id, turn!.id), enabled: Boolean(turn) });
  const { data: tontine } = useQuery({ queryKey: ['tontines', 'detail', tontineId, currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const [confirmClose, setConfirmClose] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const closeMutation = useMockMutation({
    mutationFn: () => tontineTurnsService.closeTurn(currentTenant.id, turn!.id),
    invalidateKeys: [['tontines', 'turn-by-occurrence', occurrenceId, currentTenant.id], queryKeys.tontines.allTurns(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'turnClosePrecondition')); return; }
      notify.success(t('tontines', 'turnClosed'));
      setConfirmClose(false);
    },
  });
  const existingAdhesionIds = useMemo(() => new Set(beneficiaries.map((item) => item.adhesionId)), [beneficiaries]);
  if (isLoading) return <Page title={t('tontines', 'turnDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'turnDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!turn) return <NotFoundPage />;
  const allReceived = beneficiaries.length > 0 && beneficiaries.every((item) => item.status === 'RECEIVED');
  return <Page title={`${t('tontines', 'turn')} #${turn.turnNumber}`} description={turn.id} actions={<>
    <Back label={t('tontines', 'backToOccurrences')} onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/${occurrenceId}`)} />
    {turn.status === 'OPEN' && <PermissionGate permission="beneficiaries.manage"><Button variant="outline" onClick={() => setAddOpen(true)}><Plus size={15} />{t('tontines', 'addBeneficiary')}</Button></PermissionGate>}
    {turn.status === 'OPEN' && <PermissionGate permission="cycles.manage"><Button variant="outline" disabled={!allReceived} onClick={() => setConfirmClose(true)}><CheckCircle2 size={15} />{t('tontines', 'closeTurn')}</Button></PermissionGate>}
  </>}>
    {confirmClose && <ConfirmDialog open title={t('tontines', 'closeTurn')} description={t('tontines', 'closeTurnConfirm')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onConfirm={() => closeMutation.mutate(undefined)} onCancel={() => setConfirmClose(false)} />}
    <AddBeneficiaryDialog t={t} turnId={turn.id} periodId={periodId} referenceDate={occurrence?.actualDate ?? occurrence?.plannedDate} tontine={tontine} existingAdhesionIds={existingAdhesionIds} open={addOpen} onOpenChange={setAddOpen} />
    <div className="flex items-center gap-3"><StatusBadge label={t('tontines', STATUS_LABEL_KEY[turn.status])} tone={OCC_TONE[turn.status]} /><span className="text-xs text-muted-foreground">{formatNumber(beneficiaries.length)} {t('tontines', 'beneficiaries').toLowerCase()}</span></div>
    {turn.status === 'OPEN' && !allReceived && beneficiaries.length > 0 && <p className="text-xs text-muted-foreground">{t('tontines', 'closeTurnRequiresBeneficiary')}</p>}
    {beneficiaries.length === 0 ? <EmptyState icon={UsersRound} title={t('tontines', 'noBeneficiaries')} description={turn.status === 'OPEN' ? t('tontines', 'noBeneficiariesHint') : undefined} /> : (
      <div className="grid gap-4 lg:grid-cols-2">
        {beneficiaries.map((beneficiary) => <BeneficiaryCard key={beneficiary.id} t={t} beneficiary={beneficiary} turnClosed={turn.status === 'CLOSED'} />)}
      </div>
    )}
  </Page>;
}
