/**
 * Période — nouveau niveau temporel de la Tontine (mandat refonte
 * Tenant→Tontine→Adhésions→Périodes→Occurrences), additif au module legacy
 * Cycle (`tontines-module.tsx`, jamais modifié). Une Tontine est permanente
 * (jamais recréée) ; ses Périodes successives portent l'historique
 * temporel, chacune avec ses propres Occurrences (mandat refonte §2-§5).
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, ChevronRight, Plus, UsersRound, Wand2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, StatusBadge, EmptyState, DateDisplay, PermissionGate, DetailSkeleton, ErrorState, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage } from '@/routes';
import { tontineTurnsService, type PeriodInput } from '@/services/tontine-turns.service';
import { tontinesService } from '@/services/tontines.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { PeriodStatus } from '@/mocks/tontines/tontine-periods';
import { formatFrequencyDescription, generateOccurrenceDates, type FrequencyConfig, type TontineFrequency } from '@/mocks/tontines/tontine-frequency';
import type { TableColumn } from '@/types/ui';
import { OccurrenceCalendarTable } from './occurrences-module';
import { TontineWizardSteps } from './tontine-wizard-steps';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const PERIOD_TONE: Record<PeriodStatus, 'success' | 'default'> = { ACTIVE: 'success', TERMINATED: 'default' };
const PERIOD_LABEL_KEY: Record<PeriodStatus, string> = { ACTIVE: 'periodActive', TERMINATED: 'periodTerminated' };
const FREQUENCY_LABEL_KEY: Record<TontineFrequency, string> = { DAILY: 'frequencyDaily', WEEKLY: 'frequencyWeekly', MONTHLY: 'frequencyMonthly', QUARTERLY: 'frequencyQuarterly' };

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label, onClick }: { label: string; onClick: () => void }) { return <Button variant="ghost" size="sm" onClick={onClick}>{label}</Button>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div>; }

/** Table réutilisable — utilisée par l'onglet « Périodes » de `TontineDetail` (embarqué, pas de page dédiée : la navigation cible directement `PeriodDetail`, cf. mandat refonte §25). */
export function PeriodTable({ t, tontineId, periods }: { t: T; tontineId: string; periods: (Awaited<ReturnType<typeof tontineTurnsService.listPeriodsByTontine>>)[number][] }) {
  const navigate = useNavigate();
  const columns: TableColumn<(typeof periods)[number]>[] = [
    { key: 'startDate', header: t('tontines', 'startDate'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/periods/${row.id}`)} className="font-semibold text-primary"><DateDisplay value={row.startDate} /></button> },
    { key: 'endDate', header: t('tontines', 'endDate'), render: (row) => <DateDisplay value={row.endDate} /> },
    { key: 'status', header: t('tontines', 'periodStatus'), render: (row) => <StatusBadge label={t('tontines', PERIOD_LABEL_KEY[row.status])} tone={PERIOD_TONE[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/periods/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <DataTable columns={columns} rows={periods} empty={<EmptyState icon={CalendarRange} title={t('tontines', 'noPeriods')} />} />;
}

export function PeriodCreate({ t }: { t: T }) {
  const { tontineId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: tontine, isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'detail', tontineId, currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | undefined>();
  const mutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.createPeriod>>, PeriodInput>({
    mutationFn: (input) => tontineTurnsService.createPeriod(currentTenant.id, input),
    invalidateKeys: [['tontines', 'periods', tontineId, currentTenant.id], queryKeys.tontines.allPeriods(currentTenant.id)],
    onSuccess: (period) => {
      if (!period) { notify.error(t('tontines', 'fieldRequired')); return; }
      notify.success(t('tontines', 'periodCreated'));
      navigate(`/tontines/${tontineId}/periods/${period.id}/adhesions`);
    },
  });
  if (isLoading) return <Page title={t('tontines', 'newPeriod')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'newPeriod')}><ErrorState onRetry={refetch} /></Page>;
  if (!tontine) return <NotFoundPage />;
  const handleSave = () => {
    if (!startDate || !endDate) { setError(t('tontines', 'fieldRequired')); return; }
    if (endDate < startDate) { setError(t('tontines', 'periodDatesInvalid')); return; }
    setError(undefined);
    mutation.mutate({ tontineId, startDate, endDate });
  };
  return <Page title={t('tontines', 'newPeriod')} description={t('tontines', 'newPeriodSubtitle')} actions={<Back label={t('tontines', 'backToTontine')} onClick={() => navigate(`/tontines/${tontineId}`)} />}>
    <TontineWizardSteps t={t} current={2} />
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'general')}</CardTitle></CardHeader>
      <div className="grid gap-4 p-5 pt-0 sm:grid-cols-3">
        <Info label={t('tontines', 'tontine')} value={tontine.name} />
        <div className="space-y-2"><Label htmlFor="period-start">{t('tontines', 'startDate')}</Label><Input id="period-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-invalid={Boolean(error)} /></div>
        <div className="space-y-2"><Label htmlFor="period-end">{t('tontines', 'endDate')}</Label><Input id="period-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-invalid={Boolean(error)} /><FieldError message={error} /></div>
      </div>
    </Card>
    {startDate && endDate && <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-2"><Info label={t('tontines', 'tontine')} value={tontine.name} /><Info label={t('tontines', 'periodSummary')} value={`${startDate} → ${endDate}`} /></CardContent></Card>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/tontines/${tontineId}`)}>{t('tontines', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('tontines', 'saving') : t('tontines', 'createPeriodAction')}</Button></div>
  </Page>;
}

export function PeriodDetail({ t }: { t: T }) {
  const { tontineId = '', periodId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: period, isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'period', periodId, currentTenant.id], queryFn: () => tontineTurnsService.getPeriod(currentTenant.id, periodId) });
  const { data: tontine } = useQuery({ queryKey: ['tontines', 'detail', tontineId, currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId), enabled: Boolean(period) });
  const { data: occurrences = [] } = useQuery({ queryKey: ['tontines', 'occurrences', periodId, currentTenant.id], queryFn: () => tontineTurnsService.listOccurrencesByPeriod(currentTenant.id, periodId), enabled: Boolean(period) });
  const { data: adhesions = [] } = useQuery({ queryKey: ['tontines', 'period-adhesions', periodId, currentTenant.id], queryFn: () => tontineTurnsService.listAdhesionsByPeriod(currentTenant.id, periodId), enabled: Boolean(period) });
  const generateMutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.generateOccurrences>>, void>({
    mutationFn: () => tontineTurnsService.generateOccurrences(currentTenant.id, periodId),
    invalidateKeys: [['tontines', 'occurrences', periodId, currentTenant.id], queryKeys.tontines.allOccurrences(currentTenant.id), queryKeys.tontines.allTurns(currentTenant.id)],
    onSuccess: (created) => {
      if (!created) { notify.error(t('tontines', 'generationUnavailable')); return; }
      notify.success(created.length > 0 ? t('tontines', 'occurrencesGenerated', { count: String(created.length) }) : t('tontines', 'occurrencesGeneratedNone'));
    },
  });
  if (isLoading) return <Page title={t('tontines', 'periodDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'periodDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!period || !tontine) return <NotFoundPage />;
  /** Toujours l'étape 4 tant qu'aucune Occurrence n'a encore été créée pour cette Période (heuristique dérivée des données, pas d'état de wizard persisté séparément). */
  const isWizardStep = occurrences.length === 0;

  /**
   * Étape 4 du parcours guidé — écran de confirmation dédié, volontairement
   * distinct de la fiche de gestion courante (une seule action principale :
   * générer les occurrences, cf. mandat finalisation §Design UX « aucun
   * écran inutilement chargé »). Bascule automatiquement vers la fiche
   * normale dès que des occurrences existent (plus besoin de clic
   * supplémentaire pour « accéder aux occurrences »).
   */
  if (isWizardStep) {
    const preview = tontine.frequency ? generateOccurrenceDates({ startDate: period.startDate, endDate: period.endDate }, tontine as FrequencyConfig) : [];
    return <Page title={t('tontines', 'prepareOccurrences')} description={t('tontines', 'prepareOccurrencesSubtitle')} actions={<Back label={t('tontines', 'backToTontine')} onClick={() => navigate(`/tontines/${tontineId}`)} />}>
      <TontineWizardSteps t={t} current={4} />
      <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-4">
        <Info label={t('tontines', 'tontine')} value={tontine.name} />
        <Info label={t('tontines', 'periodSummary')} value={`${period.startDate} → ${period.endDate}`} />
        {tontine.frequency
          ? <><Info label={t('tontines', 'frequency')} value={t('tontines', FREQUENCY_LABEL_KEY[tontine.frequency])} /><Info label={t('tontines', 'frequencyPreviewLabel')} value={formatFrequencyDescription(tontine as FrequencyConfig, 'fr')} /></>
          : <Info label={t('tontines', 'frequency')} value={t('tontines', 'autoGenerationUnavailable')} />}
      </CardContent></Card>
      {preview.length > 0 && <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'occurrencesToGenerate')}</CardTitle></CardHeader><CardContent><ol className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">{preview.map((date, index) => <li key={date}>{index + 1}. <DateDisplay value={date} /></li>)}</ol></CardContent></Card>}
      <div className="flex justify-end gap-2">
        {tontine.frequency
          ? <PermissionGate permission="cycles.manage"><Button disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}><Wand2 size={16} />{generateMutation.isPending ? t('tontines', 'saving') : t('tontines', 'generateOccurrences')}</Button></PermissionGate>
          : <PermissionGate permission="cycles.manage"><Button onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/create`)}><Plus size={16} />{t('tontines', 'createOccurrence')}</Button></PermissionGate>}
      </div>
    </Page>;
  }

  return <Page title={t('tontines', 'periodDetail')} description={period.id} actions={<><Back label={t('tontines', 'backToTontine')} onClick={() => navigate(`/tontines/${tontineId}`)} />{tontine.frequency && <PermissionGate permission="cycles.manage"><Button variant="outline" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}><Wand2 size={16} />{generateMutation.isPending ? t('tontines', 'saving') : t('tontines', 'generateOccurrences')}</Button></PermissionGate>}<PermissionGate permission="cycles.manage"><Button onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/create`)}><Plus size={16} />{t('tontines', 'createOccurrence')}</Button></PermissionGate></>}>
    <Card><div className="grid gap-4 p-5 sm:grid-cols-3">
      <Info label={t('tontines', 'startDate')} value={new Date(period.startDate).toLocaleDateString('fr-FR')} />
      <Info label={t('tontines', 'endDate')} value={new Date(period.endDate).toLocaleDateString('fr-FR')} />
      <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'periodStatus')}</p><StatusBadge label={t('tontines', PERIOD_LABEL_KEY[period.status])} tone={PERIOD_TONE[period.status]} /></div>
    </div></Card>
    {tontine.frequency
      ? <p className="text-xs text-muted-foreground">{t('tontines', 'frequencyPreviewLabel')} : {formatFrequencyDescription(tontine as FrequencyConfig, 'fr')}</p>
      : <p className="text-xs text-muted-foreground">{t('tontines', 'autoGenerationUnavailable')}</p>}
    <Card><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="text-sm font-semibold">{t('tontines', 'adhesionsOfPeriod')}</p><p className="text-xs text-muted-foreground">{t('tontines', 'periodAdhesionsCount', { count: String(adhesions.length) })}</p></div><Button variant="outline" size="sm" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/adhesions`)}><UsersRound size={15} />{t('tontines', 'manageAdhesions')}</Button></CardContent></Card>
    {occurrences.length > 0 && <Card><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="text-sm font-semibold">{t('tontines', 'planningTitle')}</p><p className="text-xs text-muted-foreground">{t('tontines', 'planningEntrySubtitle')}</p></div><Button variant="outline" size="sm" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/planning`)}><CalendarRange size={15} />{t('tontines', 'openPlanning')}</Button></CardContent></Card>}
    <OccurrenceCalendarTable t={t} tontineId={tontineId} periodId={periodId} occurrences={occurrences} />
  </Page>;
}
