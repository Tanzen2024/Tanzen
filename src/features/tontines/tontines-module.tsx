import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Banknote, CalendarDays, ChevronRight, CircleCheck, ClipboardList, Hash, Landmark, List, Package, Pencil, Plus, UserMinus, UsersRound } from 'lucide-react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, FormSection, StatCard, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, FieldError, MoneyDisplay, TourDateDisplay } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage, PermissionRoute } from '@/routes';
import { tontinesService, type TontineInput } from '@/services/tontines.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { settingsService } from '@/services/settings.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { Tontine, TontineAdhesion, ValueType } from '@/mocks/tontines/tontines';
import { getCurrencyLabel, getCurrencyShortLabel, formatCurrency } from '@/constants/currencies';
import { useOrganizationCurrency } from '@/hooks/use-organization-currency';
import { units, formatUnit } from '@/constants/units';
import {
  formatFrequencyDescription, validateFrequency, applyWeekday, applyMonthlyDayOfMonth, applyMonthlyOrdinal, applyMonthlyWeekday,
  applyQuarterlyMonth, applyQuarterlyDayOfMonth, applyQuarterlyOrdinal, applyQuarterlyWeekday,
  WEEKDAYS, ORDINALS, QUARTER_MONTHS, type FrequencyConfig, type TontineFrequency,
} from '@/mocks/tontines/tontine-frequency';
import { members } from '@/mocks/organization/members';
import { AdherentsOrderPanel, OccurrenceSection } from './tontine-tours-module';
import { OccurrenceDetail } from './tontine-occurrence-module';
import { AddAdherentsDialog } from './add-adherents-dialog';
import type { TableColumn } from '@/types/ui';
import { formatDate, formatNumber, formatTourDate } from '@/lib/utils';

export type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

export const STATUS_TONE: Record<'statusActive' | 'statusInactive', 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  statusActive: 'success', statusInactive: 'default',
};
const FREQUENCY_LABEL_KEY: Record<TontineFrequency, string> = { DAILY: 'frequencyDaily', WEEKLY: 'frequencyWeekly', MONTHLY: 'frequencyMonthly', QUARTERLY: 'frequencyQuarterly' };

export function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={actions} />{children}</div>; }
export function Back({ label, to }: { label: string; to: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(to)}><ArrowLeft size={15} />{label}</Button>; }
function Metric({ label, value, detail, icon: Icon, tone = 'info' }: { label: string; value: string; detail?: string; icon: typeof Landmark; tone?: 'info' | 'success' | 'warning' | 'neutral' }) { return <StatCard label={label} value={value} detail={detail} icon={Icon} tone={tone} />; }
export function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Landmark }) { return <div className="flex gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }

/**
 * Composant de fréquence — sert uniquement à PRÉ-REMPLIR la suggestion de
 * prochaine date de tour (mandat reconstruction §2 : aucune génération en
 * masse). Cascade UX identique au moteur `tontine-frequency.ts`.
 */
function FrequencyFields({ t, value, onChange, error }: { t: T; value: Partial<FrequencyConfig>; onChange: (next: Partial<FrequencyConfig>) => void; error?: string }) {
  const selectClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
  return <div className="space-y-3">
    <div className="space-y-2"><Label htmlFor="tontine-frequency">{t('tontines', 'frequency')}</Label>
      <select id="tontine-frequency" className={selectClass} value={value.frequency ?? ''} onChange={(event) => onChange({ frequency: event.target.value as TontineFrequency })} aria-invalid={Boolean(error)}>
        <option value="">{t('tontines', 'selectFrequency')}</option>
        <option value="DAILY">{t('tontines', 'frequencyDaily')}</option>
        <option value="WEEKLY">{t('tontines', 'frequencyWeekly')}</option>
        <option value="MONTHLY">{t('tontines', 'frequencyMonthly')}</option>
        <option value="QUARTERLY">{t('tontines', 'frequencyQuarterly')}</option>
      </select>
    </div>
    {value.frequency === 'WEEKLY' && <div className="space-y-2"><Label htmlFor="tontine-weekday">{t('tontines', 'weekday')}</Label><select id="tontine-weekday" className={selectClass} value={value.weekday ?? ''} onChange={(event) => onChange(applyWeekday(value, event.target.value ? (event.target.value as FrequencyConfig['weekday']) : undefined))}><option value="">{t('tontines', 'selectWeekday')}</option>{WEEKDAYS.map((wd) => <option key={wd} value={wd}>{t('tontines', `weekday${wd}`)}</option>)}</select></div>}
    {value.frequency === 'MONTHLY' && <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="tontine-monthly-rule">{t('tontines', 'monthlyRule')}</Label><select id="tontine-monthly-rule" className={selectClass} value={value.monthlyRule ?? 'DAY_OF_MONTH'} onChange={(event) => onChange(event.target.value === 'NTH_WEEKDAY' ? applyMonthlyOrdinal(value, undefined) : applyMonthlyDayOfMonth(value, undefined))}><option value="DAY_OF_MONTH">{t('tontines', 'ruleDayOfMonth')}</option><option value="NTH_WEEKDAY">{t('tontines', 'ruleNthWeekday')}</option></select></div>
      {(value.monthlyRule ?? 'DAY_OF_MONTH') === 'DAY_OF_MONTH'
        ? <div className="space-y-2"><Label htmlFor="tontine-monthly-day">{t('tontines', 'dayOfMonth')}</Label><Input id="tontine-monthly-day" type="number" min={1} max={31} value={value.monthlyDayOfMonth ?? ''} onChange={(event) => onChange(applyMonthlyDayOfMonth(value, event.target.value ? Number(event.target.value) : undefined))} /></div>
        : <>
          <div className="space-y-2"><Label htmlFor="tontine-monthly-ordinal">{t('tontines', 'ordinal')}</Label><select id="tontine-monthly-ordinal" className={selectClass} value={value.monthlyOrdinal ?? ''} onChange={(event) => onChange(applyMonthlyOrdinal(value, event.target.value ? (event.target.value as FrequencyConfig['monthlyOrdinal']) : undefined))}><option value="">{t('tontines', 'selectOrdinal')}</option>{ORDINALS.map((ord) => <option key={ord} value={ord}>{t('tontines', `ordinal${ord}`)}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="tontine-monthly-weekday">{t('tontines', 'weekday')}</Label><select id="tontine-monthly-weekday" className={selectClass} value={value.monthlyWeekday ?? ''} onChange={(event) => onChange(applyMonthlyWeekday(value, event.target.value ? (event.target.value as FrequencyConfig['monthlyWeekday']) : undefined))}><option value="">{t('tontines', 'selectWeekday')}</option>{WEEKDAYS.map((wd) => <option key={wd} value={wd}>{t('tontines', `weekday${wd}`)}</option>)}</select></div>
        </>}
    </div>}
    {value.frequency === 'QUARTERLY' && <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="tontine-quarterly-month">{t('tontines', 'quarterMonth')}</Label><select id="tontine-quarterly-month" className={selectClass} value={value.quarterlyMonth ?? ''} onChange={(event) => onChange(applyQuarterlyMonth(value, event.target.value ? (Number(event.target.value) as FrequencyConfig['quarterlyMonth']) : undefined))}><option value="">{t('tontines', 'selectQuarterMonth')}</option>{QUARTER_MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="tontine-quarterly-rule">{t('tontines', 'monthlyRule')}</Label><select id="tontine-quarterly-rule" className={selectClass} value={value.quarterlyRule ?? 'DAY_OF_MONTH'} onChange={(event) => onChange(event.target.value === 'NTH_WEEKDAY' ? applyQuarterlyOrdinal(value, undefined) : applyQuarterlyDayOfMonth(value, undefined))}><option value="DAY_OF_MONTH">{t('tontines', 'ruleDayOfMonth')}</option><option value="NTH_WEEKDAY">{t('tontines', 'ruleNthWeekday')}</option></select></div>
      {(value.quarterlyRule ?? 'DAY_OF_MONTH') === 'DAY_OF_MONTH'
        ? <div className="space-y-2"><Label htmlFor="tontine-quarterly-day">{t('tontines', 'dayOfMonth')}</Label><Input id="tontine-quarterly-day" type="number" min={1} max={31} value={value.quarterlyDayOfMonth ?? ''} onChange={(event) => onChange(applyQuarterlyDayOfMonth(value, event.target.value ? Number(event.target.value) : undefined))} /></div>
        : <>
          <div className="space-y-2"><Label htmlFor="tontine-quarterly-ordinal">{t('tontines', 'ordinal')}</Label><select id="tontine-quarterly-ordinal" className={selectClass} value={value.quarterlyOrdinal ?? ''} onChange={(event) => onChange(applyQuarterlyOrdinal(value, event.target.value ? (event.target.value as FrequencyConfig['quarterlyOrdinal']) : undefined))}><option value="">{t('tontines', 'selectOrdinal')}</option>{ORDINALS.map((ord) => <option key={ord} value={ord}>{t('tontines', `ordinal${ord}`)}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="tontine-quarterly-weekday">{t('tontines', 'weekday')}</Label><select id="tontine-quarterly-weekday" className={selectClass} value={value.quarterlyWeekday ?? ''} onChange={(event) => onChange(applyQuarterlyWeekday(value, event.target.value ? (event.target.value as FrequencyConfig['quarterlyWeekday']) : undefined))}><option value="">{t('tontines', 'selectWeekday')}</option>{WEEKDAYS.map((wd) => <option key={wd} value={wd}>{t('tontines', `weekday${wd}`)}</option>)}</select></div>
        </>}
    </div>}
    <FieldError message={error} />
  </div>;
}

/** Nombre max de Tours affichés dans « Prochains Tours » — au-delà, « Voir tous les Tours » renvoie vers la liste des Tontines de cette même page. */
const UPCOMING_TOURS_LIMIT = 5;
/** Taille de page de la liste des Tontines (mandat « dashboard Tontines », pagination). */
const TONTINES_PAGE_SIZE = 10;

/** Fenêtre de pages simple ("‹ 1 2 3 ›", jamais d'ellipse) — la liste des Tontines d'un tenant reste de taille modeste. */
function TontinesPagination({ page, pageCount, onPageChange }: { page: number; pageCount: number; onPageChange: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return <Pagination className="mx-0 w-auto">
    <PaginationContent>
      <PaginationItem><PaginationPrevious href="#" aria-disabled={page === 1} className={page === 1 ? 'pointer-events-none opacity-50' : ''} onClick={(event) => { event.preventDefault(); onPageChange(Math.max(1, page - 1)); }} /></PaginationItem>
      {Array.from({ length: pageCount }, (_, index) => index + 1).map((entry) => <PaginationItem key={entry}><PaginationLink href="#" isActive={entry === page} onClick={(event) => { event.preventDefault(); onPageChange(entry); }}>{entry}</PaginationLink></PaginationItem>)}
      <PaginationItem><PaginationNext href="#" aria-disabled={page === pageCount} className={page === pageCount ? 'pointer-events-none opacity-50' : ''} onClick={(event) => { event.preventDefault(); onPageChange(Math.min(pageCount, page + 1)); }} /></PaginationItem>
    </PaginationContent>
  </Pagination>;
}

export function TontinesTableSection({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const organizationCurrency = useOrganizationCurrency();
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [frequency, setFrequency] = useState('all'); const [page, setPage] = useState(1);
  const { data: tontines = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.tontines.list(currentTenant.id), queryFn: () => tontinesService.listTontines(currentTenant.id) });
  /**
   * Requêtes transverses (mandat « dashboard Tontines » §26 « pas de requête
   * par Tontine/Tour ») — chacune UNE SEULE fois pour tout le tenant, jamais
   * un fetch par ligne. Alimentent les KPI, l'analyse, « Prochains Tours » et
   * les colonnes Reliquats/Adhérents/Prochain tour de la liste.
   */
  const { data: occurrences = [] } = useQuery({ queryKey: queryKeys.tontines.allOccurrences(currentTenant.id), queryFn: () => tontineOperationsService.listAllOccurrences(currentTenant.id) });
  const { data: adhesions = [] } = useQuery({ queryKey: queryKeys.tontines.allAdhesions(currentTenant.id), queryFn: () => tontineOperationsService.listAllAdhesions(currentTenant.id) });
  const { data: beneficiaries = [] } = useQuery({ queryKey: queryKeys.tontines.allBeneficiaries(currentTenant.id), queryFn: () => tontineOperationsService.listAllBeneficiaries(currentTenant.id) });
  const { data: remainders = [] } = useQuery({ queryKey: queryKeys.tontines.allRemainders(currentTenant.id), queryFn: () => tontineOperationsService.listAllRemainders(currentTenant.id) });
  if (isLoading) return <TableSkeleton />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const activeTontinesCount = tontines.filter((item) => item.status === 'statusActive').length;
  /** Participations = adhésions ACTIVES, tenant entier — chaque `TontineAdhesion` EST une représentation distincte (un membre peut en cumuler plusieurs dans une même Tontine, cf. onglet Adhérents) : jamais un comptage par membre unique. */
  const activeParticipationsCount = adhesions.filter((item) => item.status === 'active').length;
  const today = new Date().toISOString().slice(0, 10);
  /** Tour à venir = PLANNED (jamais REALIZED) ET date ≥ aujourd'hui — mêmes statuts que partout ailleurs dans le module (aucun statut « annulé » dans ce modèle). */
  const upcomingAll = occurrences.filter((occurrence) => occurrence.status === 'PLANNED' && occurrence.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = upcomingAll.slice(0, UPCOMING_TOURS_LIMIT);

  const tontineById = new Map(tontines.map((item) => [item.id, item]));
  const adhesionById = new Map(adhesions.map((item) => [item.id, item]));
  const beneficiariesByOccurrence = new Map<string, typeof beneficiaries>();
  for (const beneficiary of beneficiaries) beneficiariesByOccurrence.set(beneficiary.occurrenceId, [...(beneficiariesByOccurrence.get(beneficiary.occurrenceId) ?? []), beneficiary]);

  /** Fréquences RÉELLEMENT utilisées par le tenant courant — jamais les 4 valeurs du référentiel en dur : une fréquence non utilisée par aucune Tontine n'apparaît ni dans l'analyse ni dans le filtre (mandat §7). Le modèle actuel ne définit que 4 fréquences fixes (DAILY/WEEKLY/MONTHLY/QUARTERLY) — aucune fréquence personnalisée (« toutes les 2 semaines », etc.) n'existe encore côté données (mandat §8 : documentée, pas créée dans ce chantier). */
  const frequencyCounts = new Map<TontineFrequency, number>();
  for (const tontine of tontines) frequencyCounts.set(tontine.frequency, (frequencyCounts.get(tontine.frequency) ?? 0) + 1);
  const frequencyBars = [...frequencyCounts.entries()].sort((a, b) => b[1] - a[1]); // les plus utilisées d'abord, pour l'analyse
  const frequencyOptions = [...frequencyCounts.keys()].sort((a, b) => t('tontines', FREQUENCY_LABEL_KEY[a]).localeCompare(t('tontines', FREQUENCY_LABEL_KEY[b]))); // ordre alphabétique, pour le filtre
  const maxFrequencyCount = Math.max(1, ...frequencyBars.map(([, count]) => count));

  /** Adhésions ACTIVES par Tontine (colonne Adhérents) — jamais dédupliquées par Membre : une représentation supplémentaire du même Membre compte pour 1 de plus (même règle que le KPI Participations). */
  const activeAdhesionsByTontine = new Map<string, number>();
  for (const adhesion of adhesions) if (adhesion.status === 'active') activeAdhesionsByTontine.set(adhesion.tontineId, (activeAdhesionsByTontine.get(adhesion.tontineId) ?? 0) + 1);
  /** Prochain Tour par Tontine (colonne Prochain tour) — dérivé de `upcomingAll`, déjà trié par date croissante : le premier rencontré pour une Tontine est son prochain Tour. */
  const nextOccurrenceByTontine = new Map<string, (typeof upcomingAll)[number]>();
  for (const occurrence of upcomingAll) if (!nextOccurrenceByTontine.has(occurrence.tontineId)) nextOccurrenceByTontine.set(occurrence.tontineId, occurrence);
  /** Reliquats RESTANTS par Tontine (colonne Reliquats) — somme des `TontineRemainder` `OPEN` uniquement (`CONSUMED`/`WRITTEN_OFF` sont déjà résolus, jamais comptés comme « restants »). */
  const openRemaindersByTontine = new Map<string, number>();
  for (const remainder of remainders) if (remainder.status === 'OPEN') openRemaindersByTontine.set(remainder.tontineId, (openRemaindersByTontine.get(remainder.tontineId) ?? 0) + remainder.amount);
  /** KPI « Reliquats tontines » — somme des reliquats OPEN de TOUTES les Tontines du tenant courant, indépendante des filtres de la liste (même règle que les autres KPI globaux). */
  const totalOpenRemainders = tontines.reduce((sum, item) => sum + (openRemaindersByTontine.get(item.id) ?? 0), 0);
  const totalOpenRemaindersCurrency = tontines.find((item) => item.currency)?.currency ?? organizationCurrency;

  const resetPage = () => setPage(1);
  const rows = tontines.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || item.status === status) && (frequency === 'all' || item.frequency === frequency));
  /** Le Total de la liste dépend des filtres (mandat §27/§28) — jamais du KPI global, qui lui reste indépendant de la recherche/des filtres. */
  const filteredRemaindersTotal = rows.reduce((sum, item) => sum + (openRemaindersByTontine.get(item.id) ?? 0), 0);
  const filteredAdherentsTotal = rows.reduce((sum, item) => sum + (activeAdhesionsByTontine.get(item.id) ?? 0), 0);
  const pageCount = Math.max(1, Math.ceil(rows.length / TONTINES_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = rows.slice((currentPage - 1) * TONTINES_PAGE_SIZE, currentPage * TONTINES_PAGE_SIZE);

  const columns: TableColumn<Tontine>[] = [
    { key: 'name', header: t('tontines', 'tontineName'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${row.id}`)} className="flex items-center gap-3 text-left"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UsersRound size={17} /></span><span><span className="block font-semibold">{row.name}</span><span className="block font-mono text-xs text-muted-foreground">{row.id}</span></span></button> },
    { key: 'frequency', header: t('tontines', 'frequency'), render: (row) => t('tontines', FREQUENCY_LABEL_KEY[row.frequency]) },
    { key: 'status', header: t('tontines', 'tontineStatus'), render: (row) => <StatusBadge label={t('tontines', row.status)} tone={STATUS_TONE[row.status]} /> },
    { key: 'remainders', header: t('tontines', 'remaindersColumn'), render: (row) => row.valueType === 'MONEY' ? <MoneyDisplay amount={openRemaindersByTontine.get(row.id) ?? 0} currency={row.currency ?? organizationCurrency} /> : '—' },
    { key: 'adherents', header: t('tontines', 'adherentsColumnShort'), render: (row) => formatNumber(activeAdhesionsByTontine.get(row.id) ?? 0) },
    { key: 'nextOccurrence', header: t('tontines', 'nextOccurrenceColumn'), render: (row) => { const next = nextOccurrenceByTontine.get(row.id); return next ? <TourDateDisplay value={next.date} /> : '—'; } },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];

  const upcomingColumns: TableColumn<(typeof upcoming)[number]>[] = [
    { key: 'date', header: t('tontines', 'upcomingDateColumn'), render: (occurrence) => <TourDateDisplay value={occurrence.date} /> },
    { key: 'frequency', header: t('tontines', 'frequency'), render: (occurrence) => { const tontine = tontineById.get(occurrence.tontineId); return tontine ? t('tontines', FREQUENCY_LABEL_KEY[tontine.frequency]) : '—'; } },
    {
      key: 'beneficiary', header: t('tontines', 'upcomingBeneficiaryColumn'), render: (occurrence) => {
        const names = (beneficiariesByOccurrence.get(occurrence.id) ?? []).map((item) => adhesionById.get(item.adhesionId)?.memberName).filter((name): name is string => Boolean(name));
        if (names.length === 0) return '—';
        return names.length === 1 ? names[0] : t('tontines', 'upcomingBeneficiaryAndOthers', { name: names[0], count: String(names.length - 1) });
      },
    },
    {
      key: 'amount', header: t('tontines', 'upcomingAmountColumn'), render: (occurrence) => {
        const tontine = tontineById.get(occurrence.tontineId);
        const firstBeneficiary = (beneficiariesByOccurrence.get(occurrence.id) ?? [])[0];
        if (!tontine || !firstBeneficiary) return '—';
        return tontine.valueType === 'MONEY' ? <MoneyDisplay amount={firstBeneficiary.amountDue} currency={tontine.currency ?? organizationCurrency} /> : formatUnit(firstBeneficiary.amountDue, tontine.unit);
      },
    },
  ];

  return <div className="space-y-6">
    <div className="flex flex-wrap justify-end gap-2"><PermissionGate permission="tontines.create"><Button onClick={() => navigate('/tontines/create')}><Plus size={16} />{t('tontines', 'createTontine')}</Button></PermissionGate></div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label={t('tontines', 'tontinesTitle')} value={formatNumber(tontines.length)} detail={t('tontines', 'kpiTontinesTotal')} icon={Landmark} tone="info" />
      <Metric label={t('tontines', 'kpiActiveTontines')} value={formatNumber(activeTontinesCount)} detail={t('tontines', 'kpiActiveTontinesDetail')} icon={CircleCheck} tone="success" />
      <Metric label={t('tontines', 'kpiParticipations')} value={formatNumber(activeParticipationsCount)} detail={t('tontines', 'kpiParticipationsDetail')} icon={UsersRound} tone="info" />
      <Metric label={t('tontines', 'kpiUpcomingTours')} value={formatNumber(upcomingAll.length)} detail={t('tontines', 'kpiUpcomingToursDetail')} icon={CalendarDays} tone={upcomingAll.length > 0 ? 'info' : 'neutral'} />
      <Metric label={t('tontines', 'kpiRemainders')} value={formatCurrency(totalOpenRemainders, totalOpenRemaindersCurrency, locale)} detail={t('tontines', 'kpiRemaindersDetail')} icon={Banknote} tone={totalOpenRemainders > 0 ? 'warning' : 'neutral'} />
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'frequencyDistributionTitle')}</CardTitle></CardHeader><CardContent className="space-y-3 p-5 pt-0">
        {frequencyBars.length === 0 && <p className="text-sm text-muted-foreground">{t('tontines', 'noFrequencyUsed')}</p>}
        {frequencyBars.map(([freq, count]) => <div key={freq}>
          <div className="mb-1 flex items-center justify-between text-sm"><span>{t('tontines', FREQUENCY_LABEL_KEY[freq])}</span><span className="font-semibold">{formatNumber(count)}</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(count / maxFrequencyCount) * 100}%` }} /></div>
        </div>)}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'tontineStatusOverviewTitle')}</CardTitle></CardHeader><CardContent className="space-y-2 p-5 pt-0">
        <div className="flex items-center justify-between text-sm"><StatusBadge label={t('tontines', 'statusActive')} tone={STATUS_TONE.statusActive} /><span className="font-semibold">{formatNumber(activeTontinesCount)}</span></div>
        <div className="flex items-center justify-between text-sm"><StatusBadge label={t('tontines', 'statusInactive')} tone={STATUS_TONE.statusInactive} /><span className="font-semibold">{formatNumber(tontines.length - activeTontinesCount)}</span></div>
        <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold"><span>{t('tontines', 'totalLabel')}</span><span>{formatNumber(tontines.length)}</span></div>
      </CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><CalendarDays size={15} />{t('tontines', 'upcomingToursTitle')}</CardTitle></CardHeader><CardContent className="p-5 pt-0">
      <DataTable columns={upcomingColumns} rows={upcoming} onRowClick={(occurrence) => navigate(`/tontines/${occurrence.tontineId}/occurrences/${occurrence.id}`)} empty={<EmptyState icon={CalendarDays} title={t('tontines', 'noUpcomingTours')} />} />
      {upcomingAll.length > UPCOMING_TOURS_LIMIT && <div className="mt-3 text-right"><a href="#tontines-list" className="text-sm font-medium text-primary hover:underline">{t('tontines', 'viewAllTours')} →</a></div>}
    </CardContent></Card>

    <div id="tontines-list" className="space-y-4 scroll-mt-6">
      <div className="flex items-center gap-2 text-sm font-semibold"><List size={15} />{t('tontines', 'tontineListTitle')}</div>
      <FilterBar search={search} onSearchChange={(value) => { setSearch(value); resetPage(); }} placeholder={t('tontines', 'tontineName')} onClear={() => { setSearch(''); setStatus('all'); setFrequency('all'); resetPage(); }} filters={<>
        <select value={frequency} onChange={(event) => { setFrequency(event.target.value); resetPage(); }} aria-label={t('tontines', 'frequency')} className="h-9 rounded-md border border-input bg-background px-3 text-xs">
          <option value="all">{t('tontines', 'allFrequencies')}</option>
          {frequencyOptions.map((freq) => <option key={freq} value={freq}>{t('tontines', FREQUENCY_LABEL_KEY[freq])}</option>)}
        </select>
        <select value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }} aria-label={t('tontines', 'tontineStatus')} className="h-9 rounded-md border border-input bg-background px-3 text-xs">
          <option value="all">{t('tontines', 'tontineStatus')}</option>
          <option value="statusActive">{t('tontines', 'statusActive')}</option>
          <option value="statusInactive">{t('tontines', 'statusInactive')}</option>
        </select>
      </>} />
      <DataTable columns={columns} rows={pagedRows} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noTontines')} />} />
      {rows.length > 0 && <div className="-mt-px flex flex-wrap items-center justify-between gap-3 rounded-b-xl border border-t-0 border-border bg-card px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-semibold"><span>{t('tontines', 'totalLabel')}</span><span><MoneyDisplay amount={filteredRemaindersTotal} currency={rows.find((item) => item.currency)?.currency ?? organizationCurrency} /></span><span className="text-muted-foreground">{formatNumber(filteredAdherentsTotal)} {t('tontines', 'adherentsColumnShort').toLowerCase()}</span></div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{t('tontines', 'paginationSummary', { shown: String(pagedRows.length), total: String(rows.length) })}</span>
          <TontinesPagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
        </div>
      </div>}
    </div>
  </div>;
}

function TontineCreate({ t }: { t: T }) {
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const [name, setName] = useState(''); const [valueType, setValueType] = useState<ValueType>('MONEY');
  /** Devise : aucun choix utilisateur (mandat « no currency field in any Tontine form ») — toujours héritée de Paramètres > Organisation. */
  const { data: organizationSettings } = useQuery({ queryKey: queryKeys.settings.organization(currentTenant.id), queryFn: () => settingsService.getOrganizationSettings(currentTenant.id) });
  const organizationCurrency = organizationSettings?.currency;
  /** « Avec achat » — jamais « Mode achat » (mandat reconstruction). */
  const [withPurchase, setWithPurchase] = useState(false);
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionAmountError, setContributionAmountError] = useState<string | undefined>();
  const [item, setItem] = useState(''); const [quantity, setQuantity] = useState(''); const [unit, setUnit] = useState('');
  const [freq, setFreq] = useState<Partial<FrequencyConfig>>({});
  const [frequencyError, setFrequencyError] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [itemError, setItemError] = useState<string | undefined>();
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [unitError, setUnitError] = useState<string | undefined>();
  const isGoods = valueType === 'GOODS';
  const mutation = useMockMutation<Awaited<ReturnType<typeof tontinesService.createTontine>>, TontineInput>({
    mutationFn: (input) => tontinesService.createTontine(input),
    invalidateKeys: [queryKeys.tontines.list(currentTenant.id)],
    onSuccess: (tontine) => {
      if (!tontine) { notify.error(t('tontines', 'invalidContributionAmount')); return; }
      notify.success(t('tontines', 'tontineCreated'));
      navigate(`/tontines/${tontine.id}`);
    },
  });
  const handleSave = () => {
    let hasError = false;
    if (!name.trim()) { setError(t('tontines', 'tontineNameRequired')); hasError = true; } else setError(undefined);
    if (isGoods && !item.trim()) { setItemError(t('tontines', 'goodsItemRequired')); hasError = true; } else setItemError(undefined);
    if (isGoods && !quantity.trim()) { setQuantityError(t('tontines', 'goodsQuantityRequired')); hasError = true; }
    else if (isGoods && !(Number(quantity) > 0)) { setQuantityError(t('tontines', 'goodsQuantityPositive')); hasError = true; } else setQuantityError(undefined);
    if (isGoods && !unit) { setUnitError(t('tontines', 'unitRequired')); hasError = true; } else setUnitError(undefined);
    if (!isGoods) {
      if (!contributionAmount.trim()) { setContributionAmountError(t('tontines', 'contributionAmountRequired')); hasError = true; }
      else if (Number(contributionAmount) <= 0) { setContributionAmountError(t('tontines', 'invalidContributionAmount')); hasError = true; }
      else setContributionAmountError(undefined);
    } else setContributionAmountError(undefined);
    const frequencyValidationError = validateFrequency(t, freq);
    if (frequencyValidationError) { setFrequencyError(frequencyValidationError); hasError = true; } else setFrequencyError(undefined);
    if (!isGoods && !organizationCurrency) hasError = true;
    if (hasError) return;
    mutation.mutate({
      name, valueType, tenantId: currentTenant.id,
      ...(freq as FrequencyConfig),
      ...(isGoods
        ? { item: item.trim(), quantity: Number(quantity), unit: unit as TontineInput['unit'] }
        : { withPurchase, contributionAmount: Number(contributionAmount) }),
    });
  };
  const isPending = mutation.isPending;
  return <Page title={t('tontines', 'createTontine')} description={t('tontines', 'tontinesDescription')} actions={<Back label={t('tontines', 'backToTontines')} to="/tontines" />}><div className="grid gap-5 lg:grid-cols-2">
    <FormSection title={t('tontines', 'general')}><div className="grid gap-4 sm:grid-cols-2">{!isGoods && !organizationCurrency && <div className="sm:col-span-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"><p>{t('tontines', 'organizationCurrencyMissing')}</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => navigate('/settings/organization')}>{t('tontines', 'goToOrganizationSettings')}</Button></div>}<div className="space-y-2"><Label htmlFor="tontine-name">{t('tontines', 'tontineName')} *</Label><Input id="tontine-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(error)} /><FieldError message={error} /></div><div className="space-y-2"><Label htmlFor="tontine-value-type">{t('tontines', 'valueType')}</Label><select id="tontine-value-type" value={valueType} onChange={(event) => setValueType(event.target.value as ValueType)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="MONEY">{t('tontines', 'tontineFinancial')}</option><option value="GOODS">{t('tontines', 'tontineInKind')}</option></select></div>{!isGoods && <div className="space-y-2"><Label htmlFor="tontine-contribution-amount">{t('tontines', 'tontineContributionAmount')} *</Label><div className="relative"><Input id="tontine-contribution-amount" type="number" inputMode="decimal" min={0} value={contributionAmount} onChange={(event) => setContributionAmount(event.target.value)} aria-invalid={Boolean(contributionAmountError)} aria-describedby={organizationCurrency ? 'tontine-contribution-amount-currency' : undefined} className={organizationCurrency ? 'pr-14' : undefined} />{organizationCurrency && <span id="tontine-contribution-amount-currency" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{getCurrencyShortLabel(organizationCurrency)}</span>}</div><FieldError message={contributionAmountError} /></div>}{isGoods && <div className="space-y-2"><Label htmlFor="tontine-goods-item">{t('tontines', 'goodsItem')} *</Label><Input id="tontine-goods-item" value={item} onChange={(event) => setItem(event.target.value)} aria-invalid={Boolean(itemError)} /><FieldError message={itemError} /></div>}{isGoods && <div className="space-y-2"><Label htmlFor="tontine-goods-quantity">{t('tontines', 'referenceQuantity')} *</Label><Input id="tontine-goods-quantity" type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-invalid={Boolean(quantityError)} /><FieldError message={quantityError} /></div>}{!isGoods && <div className="flex items-center justify-between gap-3 space-y-0 rounded-lg border border-input px-3 py-2 sm:col-span-2"><div><Label htmlFor="tontine-with-purchase">{t('tontines', 'withPurchase')}</Label><p className="mt-0.5 text-[11px] text-muted-foreground">{t('tontines', 'withPurchaseHint')}</p></div><Switch id="tontine-with-purchase" checked={withPurchase} onCheckedChange={setWithPurchase} /></div>}{isGoods && <div className="space-y-2"><Label htmlFor="tontine-goods-unit">{t('tontines', 'unit')} *</Label><select id="tontine-goods-unit" value={unit} onChange={(event) => setUnit(event.target.value)} aria-invalid={Boolean(unitError)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{t('tontines', 'selectUnit')}</option>{units.map((option) => <option key={option.code} value={option.code}>{option.singularFr}</option>)}</select><FieldError message={unitError} /></div>}{!isGoods && <p className="text-xs text-muted-foreground sm:col-span-2">{t('tontines', 'contributionAmountHint')}</p>}</div></FormSection>
    <FormSection title={t('tontines', 'frequencySection')} description={t('tontines', 'frequencySectionDescription')}><FrequencyFields t={t} value={freq} onChange={setFreq} error={frequencyError} /></FormSection>
    <FormSection title={t('tontines', 'summarySection')}><div className="grid gap-2 text-sm sm:grid-cols-2"><Info label={t('tontines', 'summaryName')} value={name || '—'} icon={Landmark} /><Info label={t('tontines', 'valueType')} value={valueType === 'MONEY' ? t('tontines', 'tontineFinancial') : t('tontines', 'tontineInKind')} icon={ClipboardList} />{!isGoods && <><Info label={t('tontines', 'currency')} value={organizationCurrency ? `${organizationCurrency} — ${getCurrencyLabel(organizationCurrency)}` : '—'} icon={Banknote} /><Info label={t('tontines', 'tontineContributionAmount')} value={contributionAmount ? formatCurrency(Number(contributionAmount), organizationCurrency, 'fr') : '—'} icon={Banknote} /><Info label={t('tontines', 'withPurchase')} value={t('tontines', withPurchase ? 'yes' : 'no')} icon={ClipboardList} /></>}{isGoods && <><Info label={t('tontines', 'goodsItem')} value={item.trim() || '—'} icon={Package} /><Info label={t('tontines', 'referenceQuantity')} value={quantity ? `${quantity} ${formatUnit(Number(quantity), unit)}`.trim() : '—'} icon={Hash} /></>}{freq.frequency && <><Info label={t('tontines', 'frequency')} value={t('tontines', FREQUENCY_LABEL_KEY[freq.frequency])} icon={CalendarDays} /><Info label={t('tontines', 'frequencyPreviewLabel')} value={formatFrequencyDescription(freq as FrequencyConfig, 'fr')} icon={CalendarDays} /></>}<Info label={t('tontines', 'summaryTenant')} value={`${currentTenant.name} (${currentTenant.id})`} icon={UsersRound} /></div></FormSection>
    <div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={isPending} onClick={() => navigate('/tontines')}>{t('tontines', 'cancel')}</Button><Button disabled={isPending || (!isGoods && !organizationCurrency)} onClick={handleSave}>{isPending ? t('tontines', 'saving') : t('tontines', 'save')}</Button></div>
  </div></Page>;
}

/**
 * Groupe les adhésions (représentations) par membre — un membre peut détenir
 * plusieurs représentations distinctes dans la même Tontine (mandat
 * « finalisation ajout multiple d'adhérents » §1/§2), jamais plusieurs
 * `Member` : l'ordre d'insertion (`Map`) est préservé, jamais retrié.
 */
function groupAdhesionsByMember(adhesions: TontineAdhesion[]): { memberId: string; memberName: string; representations: TontineAdhesion[] }[] {
  const byMember = new Map<string, TontineAdhesion[]>();
  for (const adhesion of adhesions) byMember.set(adhesion.memberId, [...(byMember.get(adhesion.memberId) ?? []), adhesion]);
  return [...byMember.entries()].map(([memberId, representations]) => ({ memberId, memberName: representations[0].memberName, representations }));
}

/**
 * Onglet Adhésions — rattachées DIRECTEMENT à la Tontine (mandat §2). Ajout
 * via `AddAdherentsDialog` (sélection multiple d'un premier lot de NOUVEAUX
 * membres — les membres déjà représentés dans cette Tontine restent exclus
 * de ce Dialog, mandat « finalisation » §6 Cas A). Ajouter une représentation
 * SUPPLÉMENTAIRE pour un membre déjà présent (Cas B) est une action distincte,
 * discrète, sur sa fiche groupée ci-dessous — jamais confondue avec l'ajout
 * d'un nouveau membre.
 */
function AdhesionsPanel({ t, tontineId }: { t: T; tontineId: string }) {
  const { currentTenant } = useTenant();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const { data: adhesions = [] } = useQuery({ queryKey: queryKeys.tontines.adhesions(tontineId), queryFn: () => tontinesService.listAdhesions(currentTenant.id, tontineId) });
  const { data: allMembers = [] } = useQuery({ queryKey: ['organization', 'members', currentTenant.id], queryFn: () => Promise.resolve(members.filter((m) => m.tenantId === currentTenant.id && m.status === 'active')) });
  const availableMembers = allMembers.filter((m) => !adhesions.some((a) => a.memberId === m.id && a.status === 'active'));
  const groups = groupAdhesionsByMember(adhesions);
  const closeMutation = useMockMutation<Awaited<ReturnType<typeof tontinesService.closeAdhesion>>, string>({
    mutationFn: (adhesionId) => tontinesService.closeAdhesion(currentTenant.id, adhesionId, new Date().toISOString().slice(0, 10)),
    invalidateKeys: [queryKeys.tontines.adhesions(tontineId), queryKeys.tontines.summary(tontineId), queryKeys.tontines.planningStatus(tontineId), queryKeys.tontines.allContributionStatuses()],
    onSuccess: (result) => { if (result) notify.success(t('tontines', 'adhesionClosed')); },
  });
  const addRepresentationMutation = useMockMutation<Awaited<ReturnType<typeof tontinesService.addAdhesion>>, string>({
    mutationFn: (memberId) => tontinesService.addAdhesion(currentTenant.id, tontineId, memberId, new Date().toISOString().slice(0, 10)),
    invalidateKeys: [queryKeys.tontines.adhesions(tontineId), queryKeys.tontines.summary(tontineId), queryKeys.tontines.planningStatus(tontineId), queryKeys.tontines.allContributionStatuses()],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'adhesionAddFailed')); return; } notify.success(t('tontines', 'representationAdded')); },
  });
  return <div className="space-y-4">
    <PermissionGate permission="adhesions.manage"><Button onClick={() => setAddDialogOpen(true)}><Plus size={15} />{t('tontines', 'addAdherents')}</Button></PermissionGate>
    <div className="grid gap-3 sm:grid-cols-2">{groups.map((group) => {
      const activeCount = group.representations.filter((item) => item.status === 'active').length;
      return <Card key={group.memberId}><CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{group.memberName}</p><span className="text-[11px] text-muted-foreground">{activeCount === 1 ? t('tontines', 'oneRepresentation') : t('tontines', 'representationsCount', { count: String(activeCount) })}</span></div>
          <PermissionGate permission="adhesions.manage"><Button variant="ghost" size="sm" disabled={addRepresentationMutation.isPending} onClick={() => addRepresentationMutation.mutate(group.memberId)} aria-label={t('tontines', 'addRepresentation')}><Plus size={13} />{t('tontines', 'addRepresentation')}</Button></PermissionGate>
        </div>
        <div className="space-y-1.5">{group.representations.map((representation) => <div key={representation.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5"><p className="text-xs text-muted-foreground">{formatDate(representation.joinedAt)}{representation.leftAt ? ` → ${formatDate(representation.leftAt)}` : ''}</p><div className="flex items-center gap-1.5"><StatusBadge label={t('tontines', representation.status === 'active' ? 'active' : 'exited')} tone={representation.status === 'active' ? 'success' : 'default'} />{representation.status === 'active' && <PermissionGate permission="adhesions.manage"><Button variant="ghost" size="icon" aria-label={t('tontines', 'closeAdhesion')} onClick={() => closeMutation.mutate(representation.id)}><UserMinus size={14} /></Button></PermissionGate>}</div></div>)}</div>
      </CardContent></Card>;
    })}{groups.length === 0 && <EmptyState icon={UsersRound} title={t('tontines', 'noAdhesions')} />}</div>
    <AddAdherentsDialog t={t} open={addDialogOpen} onOpenChange={setAddDialogOpen} tenantId={currentTenant.id} tontineId={tontineId} availableMembers={availableMembers} withPurchase />
  </div>;
}

/**
 * « Vue générale » a désormais sa PROPRE route explicite (`overview`) — le
 * chemin bare (`/tontines/:id`, aucun segment) n'ouvre plus « Vue générale »
 * mais « Tours » (mandat « ouverture par défaut sur Tours »), tandis qu'une
 * route explicite reste toujours prioritaire, y compris `/overview` (voir
 * `activeTab`/`goToTab` ci-dessous).
 *
 * Mandat « le Tour devient le centre des opérations » — « Cotisations »,
 * « Distributions » et « Reliquats » ne sont plus des onglets du détail
 * Tontine (redondants avec ce que chaque Tour affiche déjà individuellement :
 * `ContributionsColumn`/`BeneficiariesColumn`/reliquat de la synthèse dans
 * `tontine-occurrence-module.tsx`). Un ancien lien vers l'un de ces trois
 * segments retombe proprement sur « Tours » via le même mécanisme de secours
 * que pour tout segment absent de `TAB_SEGMENTS` (`activeTab` ci-dessous) —
 * jamais une page cassée. AUCUNE donnée/service supprimé : `listContributions`,
 * `listDistributions`, `listRemainders`, `consumeRemainder`, `writeOffRemainder`
 * restent intacts dans `tontine-operations.service.ts`, réutilisés par
 * `tontine-occurrence-module.tsx`.
 */
const TAB_SEGMENTS = ['overview', 'adherents', 'tours'] as const;
type TabSegment = (typeof TAB_SEGMENTS)[number];

function TontineDetail({ t }: { t: T }) {
  const { tontineId = '', '*': subPath = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const { data: tontine, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.tontines.detail(tontineId), currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  /**
   * `summary`/`planningStatus` alimentent le calcul de l'onglet par défaut
   * (plus bas) — délibérément PAS `enabled: Boolean(tontine)` : ni l'une ni
   * l'autre requête n'a réellement besoin de l'objet `tontine` chargé (juste
   * de `tontineId`/`currentTenant.id`), les gater derrière `tontine`
   * introduirait un aller-retour SÉQUENTIEL (tontine → puis seulement
   * ensuite summary/planningStatus) qui ferait flasher un mauvais onglet par
   * défaut le temps de ce second aller-retour. Parties en parallèle avec la
   * requête `tontine` dès le montage, elles résolvent avec elle.
   */
  const { data: summary } = useQuery({ queryKey: queryKeys.tontines.summary(tontineId), queryFn: () => tontinesService.getTontineSummary(currentTenant.id, tontineId) });
  const { data: occurrences = [] } = useQuery({ queryKey: queryKeys.tontines.occurrences(tontineId), queryFn: () => tontineOperationsService.listOccurrences(currentTenant.id, tontineId), enabled: Boolean(tontine) });
  /** Sans objet pour « Avec achat » (`isPlanningComplete` y retourne toujours `false`, jamais utilisé dans ce cas par `defaultTab` plus bas) — interrogée quand même pour rester en parallèle de `tontine`, jamais séquentielle derrière elle. */
  const { data: planningStatus } = useQuery({ queryKey: queryKeys.tontines.planningStatus(tontineId), queryFn: () => tontineOperationsService.getPlanningStatus(currentTenant.id, tontineId) });
  const tabAvailable: Record<TabSegment, boolean> = { overview: true, adherents: true, tours: true };
  /**
   * Onglet par défaut à l'ouverture (URL « bare », aucun onglet explicite
   * demandé) — mandat « Adhérents + Ordre de passage » : l'ancien onglet
   * Planification a disparu, tout le travail de positionnement se fait
   * désormais DANS l'onglet Adhérents (`AdherentsOrderPanel`). Calcul pur,
   * dérivé des données déjà chargées (`summary`/`planningStatus`) — jamais un
   * effet qui `navigate()`, donc aucun risque de boucle de rendu.
   *
   * « Avec achat » ignore totalement l'ordre de passage (il n'existe pas
   * pour ce mode). « Sans achat » : Adhérents tant qu'aucune adhésion OU que
   * l'ordre n'est pas complet (réutilise `isPlanningComplete`, seule
   * définition — jamais un second calcul), Tours une fois complet.
   */
  const memberCount = summary?.memberCount ?? 0;
  const defaultTab: TabSegment = memberCount === 0 ? 'adherents' : tontine?.withPurchase ? 'tours' : (planningStatus?.complete ? 'tours' : 'adherents');
  /**
   * Fige l'onglet par défaut UNE SEULE FOIS par montage, dès qu'il est connu
   * (résolution de `tontine`/`summary`/`planningStatus`) — jamais l'URL
   * elle-même (une URL bare reste bare, mandat « route racine = simple point
   * d'entrée » : un test dédié vérifie qu'ouvrir une Tontine depuis la liste
   * ne fait JAMAIS apparaître `/adherents` ou `/tours` dans l'URL). Corrige
   * un bug de navigation : sans ce gel, `activeTab` (plus bas) recalculait
   * `defaultTab` à CHAQUE re-rendu tant que l'URL restait bare ; un ajout
   * d'adhérents qui complète la planification (`planningStatus.complete`
   * passe à `true`) faisait alors basculer silencieusement l'affichage vers
   * Tours pendant que l'utilisateur était encore en train de travailler sur
   * Adhérents (aucune navigation explicite en jeu — seulement `activeTab` qui
   * suit une valeur devenue mouvante). Une route explicite (mandat §16)
   * n'utilise jamais ce gel : `frozenDefaultTab` ne sert que pour `subPath
   * === ''`. Placé AVANT les retours anticipés (chargement/erreur/
   * introuvable) pour respecter les Rules of Hooks.
   *
   * Gardé avec `tontineId` (et non un simple `TabSegment | null`) : React
   * Router réutilise la MÊME instance de `TontineDetail` en changeant
   * seulement les params lors d'une navigation `:tontineId/*` → `:tontineId/*`
   * (ex. liste → Tontine A → retour liste → Tontine B, sans démontage) — sans
   * ce garde, un gel effectué pour la Tontine A resterait figé par erreur en
   * arrivant sur la Tontine B.
   */
  const [frozenDefaultTab, setFrozenDefaultTab] = useState<{ tontineId: string; tab: TabSegment } | null>(null);
  const defaultTabReady = Boolean(tontine) && summary !== undefined && (tontine?.withPurchase || planningStatus !== undefined);
  const frozenTabForCurrentTontine = frozenDefaultTab?.tontineId === tontineId ? frozenDefaultTab.tab : null;
  useEffect(() => {
    if (subPath !== '' || frozenTabForCurrentTontine !== null || !defaultTabReady) return;
    setFrozenDefaultTab({ tontineId, tab: defaultTab });
  }, [subPath, frozenTabForCurrentTontine, defaultTabReady, defaultTab, tontineId]);
  if (isLoading) return <Page title={t('tontines', 'tontineDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'tontineDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!tontine) return <NotFoundPage />;
  /** L'URL est la source de vérité de l'onglet actif (rafraîchissement, retour navigateur, partage de lien) — jamais un état local isolé. Une route explicite (segment valide et disponible) reste TOUJOURS prioritaire sur le défaut calculé (mandat §16). Pour l'URL bare, `frozenDefaultTab` (une fois connu) prime sur `defaultTab` : voir commentaire ci-dessus. */
  const activeTab: TabSegment = subPath === '' ? (frozenTabForCurrentTontine ?? defaultTab) : ((TAB_SEGMENTS as readonly string[]).includes(subPath) && tabAvailable[subPath as TabSegment] ? (subPath as TabSegment) : defaultTab);
  /**
   * TOUJOURS un segment explicite — jamais de retour à l'URL « bare » au clic
   * (contrairement à une version antérieure qui collapsait vers l'URL bare
   * quand `tab === defaultTab`). `defaultTab` est désormais dynamique (mandat
   * « onglet par défaut selon adhérents et planification ») : il peut changer
   * PENDANT que l'utilisateur reste sur cet onglet (ex. terminer la
   * planification alors qu'on l'a ouverte via le défaut) — rester sur l'URL
   * bare dans ce cas ferait basculer silencieusement l'onglet affiché vers le
   * nouveau défaut au prochain re-rendu, sans action de l'utilisateur. Un
   * segment explicite fixe l'onglet réellement affiché, indépendamment de
   * toute réévaluation ultérieure de `defaultTab`.
   */
  const goToTab = (tab: TabSegment) => navigate(`/tontines/${tontine.id}/${tab}`);
  const nextOccurrence = occurrences.filter((occurrence) => occurrence.status === 'PLANNED').sort((a, b) => a.date.localeCompare(b.date))[0];
  return <Page title={tontine.name} description={`${tontine.id} · ${tontine.tenantId}`} actions={<><Back label={t('tontines', 'backToTontines')} to="/tontines" /><PermissionGate permission="tontines.update"><Button variant="outline" onClick={() => navigate(`/tontines/${tontine.id}/edit`)}><Pencil size={16} />{t('tontines', 'edit')}</Button></PermissionGate></>}>
    <Card><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="space-y-1 min-w-0">
        <StatusBadge label={t('tontines', tontine.status)} tone={STATUS_TONE[tontine.status]} />
        <p className="text-sm text-muted-foreground">{t('tontines', FREQUENCY_LABEL_KEY[tontine.frequency])}{tontine.valueType === 'MONEY' && tontine.withPurchase ? ` · ${t('tontines', 'withPurchase')}` : ''}</p>
        <p className="text-xs text-muted-foreground">{formatNumber(summary?.memberCount ?? 0)} {t('tontines', 'adherentsTitle').toLowerCase()} · {formatNumber(occurrences.length)} {t('tontines', 'occurrenceCount').toLowerCase()}</p>
      </div>
    </CardContent></Card>

    <Tabs value={activeTab} onValueChange={(value) => goToTab(value as TabSegment)}>
      <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
        <TabsTrigger value="overview">{t('tontines', 'tabOverview')}</TabsTrigger>
        <TabsTrigger value="adherents">{t('tontines', 'tabAdherents')}</TabsTrigger>
        <TabsTrigger value="tours">{t('tontines', 'tabTours')}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4 space-y-5">
        <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'tontineInfoTitle')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 pt-0 sm:grid-cols-3">
          <Info label={t('tontines', 'summaryName')} value={tontine.name} icon={Landmark} />
          <Info label={t('tontines', 'valueType')} value={tontine.valueType === 'MONEY' ? t('tontines', 'tontineFinancial') : t('tontines', 'tontineInKind')} icon={ClipboardList} />
          <Info label={t('tontines', 'frequency')} value={t('tontines', FREQUENCY_LABEL_KEY[tontine.frequency])} icon={CalendarDays} />
          {tontine.valueType === 'MONEY'
            ? <Info label={t('tontines', 'tontineContributionAmount')} value={tontine.contributionAmount ? formatCurrency(tontine.contributionAmount, tontine.currency, locale) : '—'} icon={Banknote} />
            : <Info label={t('tontines', 'goodsItem')} value={tontine.item || '—'} icon={Package} />}
          <Info label={t('tontines', 'memberCount')} value={formatNumber(summary?.memberCount ?? 0)} icon={UsersRound} />
          <Info label={t('tontines', 'occurrenceCount')} value={formatNumber(occurrences.length)} icon={Hash} />
          <Info label={t('tontines', 'nextOccurrenceLabel')} value={nextOccurrence ? formatTourDate(nextOccurrence.date) : t('tontines', 'noNextOccurrence')} icon={CalendarDays} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'configuration')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 pt-0 sm:grid-cols-3">
          {tontine.valueType === 'MONEY' && <><Info label={t('tontines', 'currency')} value={tontine.currency ? `${tontine.currency} — ${getCurrencyLabel(tontine.currency)}` : '—'} icon={Banknote} /><Info label={t('tontines', 'withPurchase')} value={t('tontines', tontine.withPurchase ? 'yes' : 'no')} icon={ClipboardList} /></>}
          {tontine.valueType === 'GOODS' && <Info label={t('tontines', 'referenceQuantity')} value={tontine.quantity ? `${formatNumber(tontine.quantity)} ${formatUnit(tontine.quantity, tontine.unit)}`.trim() : '—'} icon={Hash} />}
          <Info label={t('tontines', 'frequencyPreviewLabel')} value={formatFrequencyDescription(tontine as FrequencyConfig, 'fr')} icon={CalendarDays} />
        </CardContent></Card>
      </TabsContent>

      {/* Sans achat : ordre de passage prédéfini (AdherentsOrderPanel). Avec achat : pas d'ordre, simple adhésion (AdhesionsPanel) — la détermination du bénéficiaire se fait ultérieurement via les règles d'achat. */}
      <TabsContent value="adherents" className="mt-4"><Card><CardContent className="p-5">{tontine.withPurchase ? <AdhesionsPanel t={t} tontineId={tontine.id} /> : <AdherentsOrderPanel t={t} tontineId={tontine.id} />}</CardContent></Card></TabsContent>

      <TabsContent value="tours" className="mt-4"><Card><CardContent className="p-5"><OccurrenceSection t={t} tontine={tontine} /></CardContent></Card></TabsContent>
    </Tabs>
  </Page>;
}

/**
 * Écran « Modifier une tontine ». AUCUN champ Devise (mandat reconstruction :
 * « No currency field in any Tontine form ») — la devise reste affichée en
 * lecture seule sur la fiche, jamais éditable ici.
 */
function TontineEdit({ t }: { t: T }) {
  const { tontineId = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: tontine, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.tontines.detail(tontineId), currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const [form, setForm] = useState<{ name: string; valueType: ValueType; withPurchase: boolean; contributionAmount: string; item: string; quantity: string; unit: string } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [contributionAmountError, setContributionAmountError] = useState<string | undefined>();
  const [itemError, setItemError] = useState<string | undefined>();
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [unitError, setUnitError] = useState<string | undefined>();
  const mutation = useMockMutation<Awaited<ReturnType<typeof tontinesService.updateTontine>>, Parameters<typeof tontinesService.updateTontine>[2]>({
    mutationFn: (patch) => tontinesService.updateTontine(currentTenant.id, tontineId, patch),
    invalidateKeys: [queryKeys.tontines.detail(tontineId), queryKeys.tontines.list(currentTenant.id)],
    onSuccess: (updated) => {
      if (!updated) { notify.error(t('tontines', 'invalidContributionAmount')); return; }
      notify.success(t('tontines', 'tontineUpdated'));
      navigate(`/tontines/${tontineId}`);
    },
  });
  if (isLoading) return <Page title={t('tontines', 'editTontine')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'editTontine')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!tontine) return <NotFoundPage />;
  const current = form ?? { name: tontine.name, valueType: tontine.valueType, withPurchase: tontine.withPurchase ?? false, contributionAmount: tontine.contributionAmount !== undefined ? String(tontine.contributionAmount) : '', item: tontine.item ?? '', quantity: tontine.quantity !== undefined ? String(tontine.quantity) : '', unit: tontine.unit ?? '' };
  const setField = <K extends keyof typeof current>(key: K, value: (typeof current)[K]) => setForm({ ...current, [key]: value });
  const isGoods = current.valueType === 'GOODS';
  const handleSave = () => {
    let hasError = false;
    if (!current.name.trim()) { setError(t('tontines', 'tontineNameRequired')); hasError = true; } else setError(undefined);
    if (isGoods && !current.item.trim()) { setItemError(t('tontines', 'goodsItemRequired')); hasError = true; } else setItemError(undefined);
    if (isGoods && !current.quantity.trim()) { setQuantityError(t('tontines', 'goodsQuantityRequired')); hasError = true; }
    else if (isGoods && !(Number(current.quantity) > 0)) { setQuantityError(t('tontines', 'goodsQuantityPositive')); hasError = true; } else setQuantityError(undefined);
    if (isGoods && !current.unit) { setUnitError(t('tontines', 'unitRequired')); hasError = true; } else setUnitError(undefined);
    if (!isGoods) {
      if (!current.contributionAmount.trim()) { setContributionAmountError(t('tontines', 'contributionAmountRequired')); hasError = true; }
      else if (Number(current.contributionAmount) <= 0) { setContributionAmountError(t('tontines', 'invalidContributionAmount')); hasError = true; }
      else setContributionAmountError(undefined);
    } else setContributionAmountError(undefined);
    if (hasError) return;
    mutation.mutate({
      name: current.name, valueType: current.valueType,
      ...(isGoods
        ? { item: current.item.trim(), quantity: Number(current.quantity), unit: current.unit as TontineInput['unit'] }
        : { withPurchase: current.withPurchase, contributionAmount: Number(current.contributionAmount) }),
    });
  };
  return <Page title={t('tontines', 'editTontine')} description={tontine.name} actions={<Back label={t('tontines', 'backToTontine')} to={`/tontines/${tontineId}`} />}>
    <FormSection title={t('tontines', 'general')}><div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="tontine-edit-name">{t('tontines', 'tontineName')} *</Label><Input id="tontine-edit-name" value={current.name} onChange={(event) => setField('name', event.target.value)} aria-invalid={Boolean(error)} /><FieldError message={error} /></div>
      <div className="space-y-2"><Label htmlFor="tontine-edit-value-type">{t('tontines', 'valueType')}</Label><select id="tontine-edit-value-type" value={current.valueType} onChange={(event) => setField('valueType', event.target.value as ValueType)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="MONEY">{t('tontines', 'tontineFinancial')}</option><option value="GOODS">{t('tontines', 'tontineInKind')}</option></select></div>
      {!isGoods && <div className="space-y-2"><Label htmlFor="tontine-edit-contribution-amount">{t('tontines', 'tontineContributionAmount')} *</Label><Input id="tontine-edit-contribution-amount" type="number" inputMode="decimal" min={0} value={current.contributionAmount} onChange={(event) => setField('contributionAmount', event.target.value)} aria-invalid={Boolean(contributionAmountError)} /><FieldError message={contributionAmountError} /></div>}
      {!isGoods && <div className="flex items-center justify-between gap-3 rounded-lg border border-input px-3 py-2 sm:col-span-2"><div><Label htmlFor="tontine-edit-with-purchase">{t('tontines', 'withPurchase')}</Label><p className="mt-0.5 text-[11px] text-muted-foreground">{t('tontines', 'withPurchaseHint')}</p></div><Switch id="tontine-edit-with-purchase" checked={current.withPurchase} onCheckedChange={(checked) => setField('withPurchase', checked)} /></div>}
      {!isGoods && <p className="text-xs text-muted-foreground sm:col-span-2">{t('tontines', 'contributionAmountHint')}</p>}
      {isGoods && <div className="space-y-2"><Label htmlFor="tontine-edit-goods-item">{t('tontines', 'goodsItem')} *</Label><Input id="tontine-edit-goods-item" value={current.item} onChange={(event) => setField('item', event.target.value)} aria-invalid={Boolean(itemError)} /><FieldError message={itemError} /></div>}
      {isGoods && <div className="space-y-2"><Label htmlFor="tontine-edit-goods-quantity">{t('tontines', 'referenceQuantity')} *</Label><Input id="tontine-edit-goods-quantity" type="number" min={1} value={current.quantity} onChange={(event) => setField('quantity', event.target.value)} aria-invalid={Boolean(quantityError)} /><FieldError message={quantityError} /></div>}
      {isGoods && <div className="space-y-2"><Label htmlFor="tontine-edit-goods-unit">{t('tontines', 'unit')} *</Label><select id="tontine-edit-goods-unit" value={current.unit} onChange={(event) => setField('unit', event.target.value)} aria-invalid={Boolean(unitError)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{t('tontines', 'selectUnit')}</option>{units.map((option) => <option key={option.code} value={option.code}>{option.singularFr}</option>)}</select><FieldError message={unitError} /></div>}
    </div></FormSection>
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/tontines/${tontineId}`)}>{t('tontines', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('tontines', 'saving') : t('tontines', 'save')}</Button></div>
  </Page>;
}

export function TontinesModule() {
  const { t } = useLocale();
  return (
    <Routes>
      <Route index element={<Page title={t('tontines', 'tontinesTitle')} description={t('tontines', 'tontinesDescription')}><TontinesTableSection t={t} /></Page>} />
      <Route path="create" element={<PermissionRoute permission="tontines.create"><TontineCreate t={t} /></PermissionRoute>} />
      <Route path=":tontineId/edit" element={<PermissionRoute permission="tontines.update"><TontineEdit t={t} /></PermissionRoute>} />
      <Route path=":tontineId/occurrences/:occurrenceId" element={<OccurrenceDetail t={t} />} />
      <Route path=":tontineId/*" element={<TontineDetail t={t} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
