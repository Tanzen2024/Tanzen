import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Banknote, CalendarDays, ChevronRight, ClipboardList, Hash, Landmark, Package, Pencil, Plus, UserMinus, UsersRound } from 'lucide-react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, FormSection, StatCard, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage, PermissionRoute } from '@/routes';
import { tontinesService, type TontineInput } from '@/services/tontines.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { settingsService } from '@/services/settings.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { Tontine, ValueType } from '@/mocks/tontines/tontines';
import { getCurrencyLabel, getCurrencyShortLabel } from '@/constants/currencies';
import { units, formatUnit } from '@/constants/units';
import {
  formatFrequencyDescription, validateFrequency, applyWeekday, applyMonthlyDayOfMonth, applyMonthlyOrdinal, applyMonthlyWeekday,
  applyQuarterlyMonth, applyQuarterlyDayOfMonth, applyQuarterlyOrdinal, applyQuarterlyWeekday,
  WEEKDAYS, ORDINALS, QUARTER_MONTHS, type FrequencyConfig, type TontineFrequency,
} from '@/mocks/tontines/tontine-frequency';
import { members } from '@/mocks/organization/members';
import { TontineTours } from './tontine-tours-module';
import { OccurrenceDetail } from './tontine-occurrence-module';
import type { TableColumn } from '@/types/ui';
import { formatDate, formatNumber } from '@/lib/utils';

export type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

export const STATUS_TONE: Record<'statusActive' | 'statusInactive', 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  statusActive: 'success', statusInactive: 'default',
};
const FREQUENCY_LABEL_KEY: Record<TontineFrequency, string> = { DAILY: 'frequencyDaily', WEEKLY: 'frequencyWeekly', MONTHLY: 'frequencyMonthly', QUARTERLY: 'frequencyQuarterly' };

export function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={actions} />{children}</div>; }
export function Back({ label, to }: { label: string; to: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(to)}><ArrowLeft size={15} />{label}</Button>; }
function Metric({ label, value, icon: Icon, tone = 'info' }: { label: string; value: string; icon: typeof Landmark; tone?: 'info' | 'success' | 'warning' | 'neutral' }) { return <StatCard label={label} value={value} icon={Icon} tone={tone} />; }
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

export function TontinesTableSection({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all');
  const { data: tontines = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.tontines.list(currentTenant.id), queryFn: () => tontinesService.listTontines(currentTenant.id) });
  const rows = tontines.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || item.status === status));
  if (isLoading) return <TableSkeleton />;
  if (isError) return <ErrorState onRetry={refetch} />;
  const columns: TableColumn<Tontine>[] = [
    { key: 'name', header: t('tontines', 'tontineName'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${row.id}`)} className="flex items-center gap-3 text-left"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UsersRound size={17} /></span><span><span className="block font-semibold">{row.name}</span><span className="block font-mono text-xs text-muted-foreground">{row.id}</span></span></button> },
    { key: 'valueType', header: t('tontines', 'valueType'), render: (row) => <StatusBadge label={row.valueType === 'MONEY' ? t('tontines', 'tontineFinancial') : t('tontines', 'tontineInKind')} tone={row.valueType === 'MONEY' ? 'info' : 'warning'} /> },
    { key: 'frequency', header: t('tontines', 'frequency'), render: (row) => t('tontines', FREQUENCY_LABEL_KEY[row.frequency]) },
    { key: 'status', header: t('tontines', 'tontineStatus'), render: (row) => <StatusBadge label={t('tontines', row.status)} tone={STATUS_TONE[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  /** Vue d'ensemble transverse, groupée par fréquence (toutes tontines du tenant confondues) — lecture pure, aucune règle métier supplémentaire. */
  const byFrequency = new Map<string, Tontine[]>();
  for (const tontine of tontines) byFrequency.set(tontine.frequency, [...(byFrequency.get(tontine.frequency) ?? []), tontine]);
  return <div className="space-y-6"><div className="flex flex-wrap justify-end gap-2"><PermissionGate permission="tontines.create"><Button onClick={() => navigate('/tontines/create')}><Plus size={16} />{t('tontines', 'createTontine')}</Button></PermissionGate></div><div className="grid gap-4 sm:grid-cols-2">{(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'] as const).map((frequency) => <Metric key={frequency} label={t('tontines', FREQUENCY_LABEL_KEY[frequency])} value={formatNumber((byFrequency.get(frequency) ?? []).length)} icon={CalendarDays} tone={(byFrequency.get(frequency) ?? []).length > 0 ? 'info' : 'neutral'} />)}</div><FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'tontineName')} filters={<select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('tontines', 'tontineStatus')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'tontineStatus')}</option><option value="statusActive">{t('tontines', 'statusActive')}</option><option value="statusInactive">{t('tontines', 'statusInactive')}</option></select>} /><DataTable columns={columns} rows={rows} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noTontines')} />} /></div>;
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
    <FormSection title={t('tontines', 'summarySection')}><div className="grid gap-2 text-sm sm:grid-cols-2"><Info label={t('tontines', 'summaryName')} value={name || '—'} icon={Landmark} /><Info label={t('tontines', 'valueType')} value={valueType === 'MONEY' ? t('tontines', 'tontineFinancial') : t('tontines', 'tontineInKind')} icon={ClipboardList} />{!isGoods && <><Info label={t('tontines', 'currency')} value={organizationCurrency ? `${organizationCurrency} — ${getCurrencyLabel(organizationCurrency)}` : '—'} icon={Banknote} /><Info label={t('tontines', 'tontineContributionAmount')} value={contributionAmount ? `${formatNumber(Number(contributionAmount))} ${organizationCurrency ?? ''}`.trim() : '—'} icon={Banknote} /><Info label={t('tontines', 'withPurchase')} value={t('tontines', withPurchase ? 'yes' : 'no')} icon={ClipboardList} /></>}{isGoods && <><Info label={t('tontines', 'goodsItem')} value={item.trim() || '—'} icon={Package} /><Info label={t('tontines', 'referenceQuantity')} value={quantity ? `${quantity} ${formatUnit(Number(quantity), unit)}`.trim() : '—'} icon={Hash} /></>}{freq.frequency && <><Info label={t('tontines', 'frequency')} value={t('tontines', FREQUENCY_LABEL_KEY[freq.frequency])} icon={CalendarDays} /><Info label={t('tontines', 'frequencyPreviewLabel')} value={formatFrequencyDescription(freq as FrequencyConfig, 'fr')} icon={CalendarDays} /></>}<Info label={t('tontines', 'summaryTenant')} value={`${currentTenant.name} (${currentTenant.id})`} icon={UsersRound} /></div></FormSection>
    <div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={isPending} onClick={() => navigate('/tontines')}>{t('tontines', 'cancel')}</Button><Button disabled={isPending || (!isGoods && !organizationCurrency)} onClick={handleSave}>{isPending ? t('tontines', 'saving') : t('tontines', 'save')}</Button></div>
  </div></Page>;
}

/**
 * Consultation du reliquat (mandat §3, nouveau — traçabilité réelle) : liste
 * les `TontineRemainder` de la Tontine avec leur traçabilité complète
 * (tontine/tour/date/origine/statut). `OPEN` peut être consommé (affecté
 * explicitement, ex. reporté sur le tour suivant) ou abandonné (motivé) —
 * jamais silencieusement ignoré.
 */
function RemaindersPanel({ t, tontineId }: { t: T; tontineId: string }) {
  const { currentTenant } = useTenant();
  const { data: remainders = [] } = useQuery({ queryKey: queryKeys.tontines.remainders(tontineId), queryFn: () => tontineOperationsService.listRemainders(currentTenant.id, tontineId) });
  const consumeMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.consumeRemainder>>, string>({
    mutationFn: (remainderId) => tontineOperationsService.consumeRemainder(currentTenant.id, remainderId),
    invalidateKeys: [queryKeys.tontines.remainders(tontineId)],
    onSuccess: (result) => { if (result) notify.success(t('tontines', 'remainderConsumed')); },
  });
  const writeOffMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.writeOffRemainder>>, string>({
    mutationFn: (remainderId) => tontineOperationsService.writeOffRemainder(currentTenant.id, remainderId, t('tontines', 'remainderWriteOffReason')),
    invalidateKeys: [queryKeys.tontines.remainders(tontineId)],
    onSuccess: (result) => { if (result) notify.success(t('tontines', 'remainderWrittenOff')); },
  });
  const statusTone: Record<'OPEN' | 'CONSUMED' | 'WRITTEN_OFF', 'warning' | 'success' | 'default'> = { OPEN: 'warning', CONSUMED: 'success', WRITTEN_OFF: 'default' };
  const statusKey: Record<'OPEN' | 'CONSUMED' | 'WRITTEN_OFF', string> = { OPEN: 'remainderOpen', CONSUMED: 'remainderConsumedStatus', WRITTEN_OFF: 'remainderWrittenOffStatus' };
  return <div className="space-y-2">{remainders.map((remainder) => <Card key={remainder.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
    <div><p className="text-sm font-semibold">{t('tontines', 'remainderAmount')} : {formatNumber(remainder.amount)}</p><p className="text-xs text-muted-foreground">{formatDate(remainder.date)} · {remainder.occurrenceId} · {t('tontines', 'remainderOriginUnderdistributed')}</p></div>
    <div className="flex items-center gap-2"><StatusBadge label={t('tontines', statusKey[remainder.status])} tone={statusTone[remainder.status]} />{remainder.status === 'OPEN' && <PermissionGate permission="beneficiaries.manage"><Button size="sm" variant="outline" onClick={() => consumeMutation.mutate(remainder.id)}>{t('tontines', 'consumeRemainder')}</Button><Button size="sm" variant="ghost" onClick={() => writeOffMutation.mutate(remainder.id)}>{t('tontines', 'writeOffRemainder')}</Button></PermissionGate>}</div>
  </CardContent></Card>)}{remainders.length === 0 && <EmptyState icon={Landmark} title={t('tontines', 'noRemainders')} />}</div>;
}

/**
 * Distributions — vue consolidée, transverse à tous les Tours de la Tontine
 * (item hiérarchique du mandat : Tontine → distributions, au même niveau que
 * Tours/Reliquats). Lecture pure, dérivée des `OccurrenceBeneficiary` déjà
 * affichés au niveau de chaque Tour — aucune double saisie.
 */
function DistributionsPanel({ t, tontineId }: { t: T; tontineId: string }) {
  const { currentTenant } = useTenant();
  const { data: adhesions = [] } = useQuery({ queryKey: queryKeys.tontines.adhesions(tontineId), queryFn: () => tontinesService.listAdhesions(currentTenant.id, tontineId) });
  const { data: distributions = [] } = useQuery({ queryKey: queryKeys.tontines.distributions(tontineId), queryFn: () => tontineOperationsService.listDistributions(currentTenant.id, tontineId) });
  const columns: TableColumn<(typeof distributions)[number]>[] = [
    { key: 'occurrenceNumber', header: t('tontines', 'occurrenceLabel'), render: (row) => `#${row.occurrenceNumber}` },
    { key: 'adhesionId', header: t('tontines', 'adherentsTitle'), render: (row) => adhesions.find((a) => a.id === row.adhesionId)?.memberName ?? row.adhesionId },
    { key: 'amountDue', header: t('tontines', 'amountDue'), render: (row) => formatNumber(row.amountDue) },
    { key: 'amountPaid', header: t('tontines', 'amountPaid'), render: (row) => formatNumber(row.amountPaid) },
    { key: 'status', header: t('tontines', 'received'), render: (row) => <StatusBadge label={t('tontines', row.amountPaid >= row.amountDue ? 'received' : 'pending')} tone={row.amountPaid >= row.amountDue ? 'success' : 'warning'} /> },
  ];
  return <DataTable columns={columns} rows={distributions} empty={<EmptyState icon={Landmark} title={t('tontines', 'noDistributions')} />} />;
}

/** Onglet Adhésions — rattachées DIRECTEMENT à la Tontine (mandat §2). */
function AdhesionsPanel({ t, tontineId }: { t: T; tontineId: string }) {
  const { currentTenant } = useTenant();
  const [memberId, setMemberId] = useState('');
  const { data: adhesions = [] } = useQuery({ queryKey: queryKeys.tontines.adhesions(tontineId), queryFn: () => tontinesService.listAdhesions(currentTenant.id, tontineId) });
  const { data: allMembers = [] } = useQuery({ queryKey: ['organization', 'members', currentTenant.id], queryFn: () => Promise.resolve(members.filter((m) => m.tenantId === currentTenant.id && m.status === 'active')) });
  const availableMembers = allMembers.filter((m) => !adhesions.some((a) => a.memberId === m.id && a.status === 'active'));
  const addMutation = useMockMutation<Awaited<ReturnType<typeof tontinesService.addAdhesion>>, void>({
    mutationFn: () => tontinesService.addAdhesion(currentTenant.id, tontineId, memberId, new Date().toISOString().slice(0, 10)),
    invalidateKeys: [queryKeys.tontines.adhesions(tontineId)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'adhesionAddFailed')); return; } notify.success(t('tontines', 'adhesionAdded')); setMemberId(''); },
  });
  const closeMutation = useMockMutation<Awaited<ReturnType<typeof tontinesService.closeAdhesion>>, string>({
    mutationFn: (adhesionId) => tontinesService.closeAdhesion(currentTenant.id, adhesionId, new Date().toISOString().slice(0, 10)),
    invalidateKeys: [queryKeys.tontines.adhesions(tontineId)],
    onSuccess: (result) => { if (result) notify.success(t('tontines', 'adhesionClosed')); },
  });
  return <div className="space-y-4">
    <PermissionGate permission="adhesions.manage"><div className="flex flex-wrap items-end gap-2"><div className="min-w-56 space-y-2"><Label htmlFor="adhesion-member">{t('tontines', 'addMember')}</Label><select id="adhesion-member" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">{t('tontines', 'selectMember')}</option>{availableMembers.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</select></div><Button disabled={!memberId || addMutation.isPending} onClick={() => addMutation.mutate()}><Plus size={15} />{t('tontines', 'addAdhesion')}</Button></div></PermissionGate>
    <div className="grid gap-3 sm:grid-cols-2">{adhesions.map((adhesion) => <Card key={adhesion.id}><CardContent className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{adhesion.memberName}</p><p className="text-xs text-muted-foreground">{formatDate(adhesion.joinedAt)}{adhesion.leftAt ? ` → ${formatDate(adhesion.leftAt)}` : ''}</p></div><div className="flex items-center gap-2"><StatusBadge label={t('tontines', adhesion.status === 'active' ? 'active' : 'exited')} tone={adhesion.status === 'active' ? 'success' : 'default'} />{adhesion.status === 'active' && <PermissionGate permission="adhesions.manage"><Button variant="ghost" size="icon" aria-label={t('tontines', 'closeAdhesion')} onClick={() => closeMutation.mutate(adhesion.id)}><UserMinus size={15} /></Button></PermissionGate>}</div></CardContent></Card>)}{adhesions.length === 0 && <EmptyState icon={UsersRound} title={t('tontines', 'noAdhesions')} />}</div>
  </div>;
}

function TontineDetail({ t }: { t: T }) {
  const { tontineId = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: tontine, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.tontines.detail(tontineId), currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const { data: summary } = useQuery({ queryKey: queryKeys.tontines.summary(tontineId), queryFn: () => tontinesService.getTontineSummary(currentTenant.id, tontineId), enabled: Boolean(tontine) });
  if (isLoading) return <Page title={t('tontines', 'tontineDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'tontineDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!tontine) return <NotFoundPage />;
  return <Page title={tontine.name} description={`${tontine.id} · ${tontine.tenantId}`} actions={<><Back label={t('tontines', 'backToTontines')} to="/tontines" /><PermissionGate permission="tontines.update"><Button variant="outline" onClick={() => navigate(`/tontines/${tontine.id}/edit`)}><Pencil size={16} />{t('tontines', 'edit')}</Button></PermissionGate></>}>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'tontineInfoTitle')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 pt-0 sm:grid-cols-3">
      <Info label={t('tontines', 'summaryName')} value={tontine.name} icon={Landmark} />
      <Info label={t('tontines', 'valueType')} value={tontine.valueType === 'MONEY' ? t('tontines', 'tontineFinancial') : t('tontines', 'tontineInKind')} icon={ClipboardList} />
      <Info label={t('tontines', 'frequency')} value={t('tontines', FREQUENCY_LABEL_KEY[tontine.frequency])} icon={CalendarDays} />
      {tontine.valueType === 'MONEY'
        ? <Info label={t('tontines', 'tontineContributionAmount')} value={tontine.contributionAmount ? `${formatNumber(tontine.contributionAmount)} ${tontine.currency ?? ''}`.trim() : '—'} icon={Banknote} />
        : <Info label={t('tontines', 'goodsItem')} value={tontine.item || '—'} icon={Package} />}
      <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'tontineStatus')}</p><StatusBadge label={t('tontines', tontine.status)} tone={STATUS_TONE[tontine.status]} /></div>
      <Info label={t('tontines', 'memberCount')} value={formatNumber(summary?.memberCount ?? 0)} icon={UsersRound} />
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'configuration')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 pt-0 sm:grid-cols-3">
      {tontine.valueType === 'MONEY' && <><Info label={t('tontines', 'currency')} value={tontine.currency ? `${tontine.currency} — ${getCurrencyLabel(tontine.currency)}` : '—'} icon={Banknote} /><Info label={t('tontines', 'withPurchase')} value={t('tontines', tontine.withPurchase ? 'yes' : 'no')} icon={ClipboardList} /></>}
      {tontine.valueType === 'GOODS' && <Info label={t('tontines', 'referenceQuantity')} value={tontine.quantity ? `${formatNumber(tontine.quantity)} ${formatUnit(tontine.quantity, tontine.unit)}`.trim() : '—'} icon={Hash} />}
      <Info label={t('tontines', 'frequencyPreviewLabel')} value={formatFrequencyDescription(tontine as FrequencyConfig, 'fr')} icon={CalendarDays} />
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'adherentsTitle')}</CardTitle></CardHeader><CardContent className="p-5 pt-0"><AdhesionsPanel t={t} tontineId={tontine.id} /></CardContent></Card>

    <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">{t('tontines', 'toursTitle')}</CardTitle></CardHeader><CardContent className="p-5 pt-0"><TontineTours t={t} tontine={tontine} /></CardContent></Card>

    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'distributionsTitle')}</CardTitle></CardHeader><CardContent className="p-5 pt-0"><DistributionsPanel t={t} tontineId={tontine.id} /></CardContent></Card>

    {tontine.valueType === 'MONEY' && <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'remaindersTitle')}</CardTitle></CardHeader><CardContent className="p-5 pt-0"><RemaindersPanel t={t} tontineId={tontine.id} /></CardContent></Card>}
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
      <Route path=":tontineId" element={<TontineDetail t={t} />} />
      <Route path=":tontineId/edit" element={<PermissionRoute permission="tontines.update"><TontineEdit t={t} /></PermissionRoute>} />
      <Route path=":tontineId/occurrences/:occurrenceId" element={<OccurrenceDetail t={t} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
