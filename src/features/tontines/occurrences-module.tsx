/**
 * Occurrences d'une Période (Tontine → Période → Occurrence) — l'ancien
 * niveau intermédiaire `TontineTurn` a été supprimé (mandat « suppression
 * complète de la logique Cycle/Tour ») : les bénéficiaires
 * (`OccurrenceBeneficiary`) sont rattachés directement à l'Occurrence, et
 * portent l'historique/la synthèse financière déjà utilisés par le panneau
 * « Opérations » (`tontine-operations-module.tsx`) et par le workflow de
 * permutation (WD-006, `operations-module.tsx`). Aucune page/route/navigation
 * dédiée « Tour » n'existe : la désignation/gestion des bénéficiaires se fait
 * exclusivement depuis Opérations, jamais depuis un écran intermédiaire
 * propre à l'Occurrence. `closeOccurrence` clôture directement l'Occurrence,
 * sans étape de clôture séparée.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, CircleStop, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, StatusBadge, EmptyState, DateDisplay, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, ConfirmDialog, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage } from '@/routes';
import { tontineTurnsService } from '@/services/tontine-turns.service';
import { organizationService } from '@/services/organization.service';
import { queryKeys } from '@/services/query-keys';
import { ContributionTable } from './contributions-module';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { TontineOccurrenceStatus } from '@/mocks/tontines/tontine-occurrences';
import type { TableColumn } from '@/types/ui';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const OCC_TONE: Record<TontineOccurrenceStatus, 'default' | 'success'> = { OPEN: 'success', CLOSED: 'default' };
const STATUS_LABEL_KEY: Record<TontineOccurrenceStatus, string> = { OPEN: 'statusOpenOccurrence', CLOSED: 'statusClosedOccurrence' };

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label, onClick }: { label: string; onClick: () => void }) { return <Button variant="ghost" size="sm" onClick={onClick}>{label}</Button>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div>; }

/** Table chronologique réutilisable — utilisée par `OccurrenceList` (page dédiée) et par `PeriodDetail` (calendrier des occurrences de la période), pour éviter toute duplication de colonnes. */
export function OccurrenceCalendarTable({ t, tontineId, periodId, occurrences }: { t: T; tontineId: string; periodId: string; occurrences: (Awaited<ReturnType<typeof tontineTurnsService.listOccurrencesByPeriod>>)[number][] }) {
  const navigate = useNavigate();
  const columns: TableColumn<(typeof occurrences)[number]>[] = [
    { key: 'occurrenceNumber', header: t('tontines', 'occurrenceNumber'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/${row.id}`)} className="font-semibold text-primary">#{row.occurrenceNumber}</button> },
    { key: 'plannedDate', header: t('tontines', 'plannedDate'), render: (row) => <DateDisplay value={row.plannedDate} /> },
    { key: 'actualDate', header: t('tontines', 'actualDate'), render: (row) => row.actualDate ? <DateDisplay value={row.actualDate} /> : <span className="text-muted-foreground">—</span> },
    { key: 'status', header: t('tontines', 'occurrenceStatus'), render: (row) => <StatusBadge label={t('tontines', STATUS_LABEL_KEY[row.status])} tone={OCC_TONE[row.status]} /> },
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
    invalidateKeys: [['tontines', 'occurrences', periodId, currentTenant.id], ['tontines', 'occurrences-by-tontine', tontineId, currentTenant.id], queryKeys.tontines.allOccurrences(currentTenant.id)],
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
  return <Page title={`${t('tontines', 'occurrenceNumber')} ${occurrence.occurrenceNumber}`} description={occurrence.id} actions={<><Back label={t('tontines', 'backToOccurrences')} onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences`)} />{occurrence.status === 'OPEN' && <PermissionGate permission="cycles.manage"><Button variant="outline" onClick={() => setConfirmClose(true)}><CircleStop size={15} />{t('tontines', 'closeOccurrence')}</Button></PermissionGate>}</>}>
    {confirmClose && <ConfirmDialog open title={t('tontines', 'closeOccurrence')} description={t('tontines', 'closeOccurrenceConfirm')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onConfirm={() => closeMutation.mutate(undefined)} onCancel={() => setConfirmClose(false)} />}
    <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-3">
      <Info label={t('tontines', 'plannedDate')} value={new Date(occurrence.plannedDate).toLocaleDateString('fr-FR')} />
      <Info label={t('tontines', 'actualDate')} value={occurrence.actualDate ? new Date(occurrence.actualDate).toLocaleDateString('fr-FR') : '—'} />
      <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'occurrenceStatus')}</p><StatusBadge label={t('tontines', STATUS_LABEL_KEY[occurrence.status])} tone={OCC_TONE[occurrence.status]} /></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'occurrenceContributions')}</CardTitle></CardHeader><CardContent className="p-0"><ContributionTable t={t} rows={contributions} adhesions={adhesions} members={members} /></CardContent></Card>
  </Page>;
}
