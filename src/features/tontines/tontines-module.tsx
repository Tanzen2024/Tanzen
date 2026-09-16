import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Banknote, CalendarDays, ChevronRight, ClipboardList, Hash, Landmark, Package, Pencil, Plus, UsersRound } from 'lucide-react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, FormSection, StatCard, MoneyDisplay, DateDisplay, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage, PermissionRoute } from '@/routes';
import { OccurrenceList, OccurrenceCreate, OccurrenceDetail, OccurrenceCalendarTable } from './occurrences-module';
import { PeriodTable, PeriodCreate, PeriodDetail } from './periods-module';
import { TurnPlanningList } from './planning-module';
import { PeriodAdhesionList, PeriodAdhesionCreate, PeriodAdhesionDetail } from './adhesions-module';
import { TontinesOverview } from './overview-module';
import { TontineOperationsManage } from './tontine-operations-module';
import { tontinesService, type TontineInput } from '@/services/tontines.service';
import { tontineTurnsService } from '@/services/tontine-turns.service';
import { settingsService } from '@/services/settings.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { Tontine } from '@/mocks/tontines/tontines';
import type { ValueType } from '@/mocks/tontines/tontine-occurrences';
import { currencies, DEFAULT_CURRENCY_CODE, getCurrencyLabel, getCurrencyShortLabel } from '@/constants/currencies';
import { units, formatUnit } from '@/constants/units';
import { FrequencyFields } from './frequency-fields';
import { TontineWizardSteps } from './tontine-wizard-steps';
import { formatFrequencyDescription, validateFrequency, type FrequencyConfig, type TontineFrequency } from '@/mocks/tontines/tontine-frequency';
import type { TableColumn } from '@/types/ui';
import { formatFCFA, formatNumber } from '@/lib/utils';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

export const STATUS_TONE: Record<'statusActive' | 'statusInactive', 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  statusActive: 'success', statusInactive: 'default',
};
const FREQUENCY_LABEL_KEY: Record<TontineFrequency, string> = { DAILY: 'frequencyDaily', WEEKLY: 'frequencyWeekly', MONTHLY: 'frequencyMonthly', QUARTERLY: 'frequencyQuarterly' };

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label, to }: { label: string; to: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(to)}><ArrowLeft size={15} />{label}</Button>; }
function Metric({ label, value, icon: Icon, tone = 'info' }: { label: string; value: string; icon: typeof Landmark; tone?: 'info' | 'success' | 'warning' | 'neutral' }) { return <StatCard label={label} value={value} icon={Icon} tone={tone} />; }
function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Landmark }) { return <div className="flex gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }

/**
 * Contenu de la liste des tontines, sans son propre `Page`/`PageHeader` — extrait pour être
 * embarqué dans l'onglet « Tontines » de `TontinesOverview` (mandat vue d'ensemble) sans
 * dupliquer la logique de colonnes/filtre/métriques. Reste exporté et réutilisable tel quel.
 */
export function TontinesTableSection({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all');
  const { data: tontines = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.tontines.list(currentTenant.id), queryFn: () => tontinesService.listTontines(currentTenant.id) });
  const rows = tontines.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || item.status === status));
  if (isLoading) return <TableSkeleton />;
  if (isError) return <ErrorState onRetry={refetch} />;
  const columns: TableColumn<Tontine>[] = [
    { key: 'name', header: t('tontines', 'tontineName'), render: (row) => <button type="button" onClick={() => navigate(`/tontines/${row.id}`)} className="flex items-center gap-3 text-left"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UsersRound size={17} /></span><span><span className="block font-semibold">{row.name}</span><span className="block font-mono text-xs text-muted-foreground">{row.id}</span></span></button> },
    { key: 'valueType', header: t('tontines', 'valueType'), render: (row) => <StatusBadge label={row.valueType === 'MONEY' ? t('tontines', 'tontineFinancial') : t('tontines', 'tontineInKind')} tone={row.valueType === 'MONEY' ? 'info' : 'warning'} /> },
    { key: 'memberCount', header: t('tontines', 'memberCount'), render: (row) => formatNumber(row.memberCount) },
    { key: 'totalContributions', header: t('tontines', 'totalContributions'), render: (row) => <MoneyDisplay amount={row.totalContributions} /> },
    { key: 'status', header: t('tontines', 'tontineStatus'), render: (row) => <StatusBadge label={t('tontines', row.status)} tone={STATUS_TONE[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <div className="space-y-6"><div className="flex flex-wrap justify-end gap-2"><PermissionGate permission="contributions.manage"><Button variant="outline" onClick={() => navigate('/tontines/operations')}><ClipboardList size={16} />{t('tontines', 'operationsTitle')}</Button></PermissionGate><PermissionGate permission="tontines.create"><Button onClick={() => navigate('/tontines/create')}><Plus size={16} />{t('tontines', 'createTontine')}</Button></PermissionGate></div><div className="grid gap-4 sm:grid-cols-2"><Metric label={t('tontines', 'tontines')} value={formatNumber(tontines.length)} icon={UsersRound} /><Metric label={t('tontines', 'totalContributions')} value={formatFCFA(tontines.reduce((sum, item) => sum + item.totalContributions, 0), 'fr', true)} icon={Banknote} tone="warning" /></div><FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'tontineName')} filters={<select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('tontines', 'tontineStatus')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'tontineStatus')}</option><option value="statusActive">{t('tontines', 'statusActive')}</option><option value="statusInactive">{t('tontines', 'statusInactive')}</option></select>} /><DataTable columns={columns} rows={rows} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noTontines')} />} /></div>;
}

function TontineCreate({ t }: { t: T }) {
  const navigate = useNavigate();
  /** Application Tenant : un seul tenant possible, jamais de sélection (cf. docs/FIX_TENANT_APP_SINGLE_TENANT.md) — le tenant courant est utilisé directement, jamais choisi par l'utilisateur, y compris à la création d'une Tontine. */
  const { currentTenant } = useTenant();
  const [name, setName] = useState(''); const [valueType, setValueType] = useState<ValueType>('MONEY');
  /** Devise : plus de choix utilisateur (mandat « devise automatique ») — toujours héritée de Paramètres > Organisation pour le tenant courant, jamais un état local ni un défaut codé en dur. Recalculée à chaque changement de tenant via la query React Query ci-dessous (clé incluant `currentTenant.id`), donc jamais de valeur périmée d'un tenant précédent. */
  const { data: organizationSettings } = useQuery({ queryKey: queryKeys.settings.organization(currentTenant.id), queryFn: () => settingsService.getOrganizationSettings(currentTenant.id) });
  const organizationCurrency = organizationSettings?.currency;
  /** « Avec achat » (mandat « Avec achat ») — switch ON/OFF, jamais de caisse choisie manuellement : la caisse « Achat tontine » du tenant est résolue automatiquement côté service quand ce switch est activé (cf. `tontinesService.createTontine`). */
  const [purchaseMode, setPurchaseMode] = useState<'WITH_PURCHASE' | 'WITHOUT_PURCHASE'>('WITHOUT_PURCHASE');
  /** Montant de cotisation (mandat « montant de cotisation ») — initialisé à vide, pertinent uniquement pour MONEY ; une ancienne valeur saisie avant un passage à GOODS reste en mémoire côté UI (comme `item`/`quantity`/`unit` pour le cas inverse) mais n'est jamais soumise ni utilisée pour valider une tontine non financière. */
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionAmountError, setContributionAmountError] = useState<string | undefined>();
  const [item, setItem] = useState(''); const [quantity, setQuantity] = useState(''); const [unit, setUnit] = useState('');
  /** Périodicité de la Tontine (mandat fréquence) — configuration permanente, jamais portée par une Occurrence ni par l'ancien Cycle ; sert de règle de génération des occurrences pour toutes les Périodes successives (cf. `generateOccurrences`). */
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
      navigate(`/tontines/${tontine.id}/periods/create`);
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
    /** Filet de sécurité en plus de la désactivation du bouton Enregistrer : une tontine MONEY ne peut pas être créée sans devise d'organisation configurée (mandat « devise automatique », §8) — jamais de repli silencieux sur XAF. */
    if (!isGoods && !organizationCurrency) hasError = true;
    if (hasError) return;
    mutation.mutate({
      name, valueType, tenantId: currentTenant.id,
      ...(freq as FrequencyConfig),
      ...(isGoods
        ? { item: item.trim(), quantity: Number(quantity), unit: unit as TontineInput['unit'] }
        : { purchaseMode, contributionAmount: Number(contributionAmount) }),
    });
  };
  const isPending = mutation.isPending;
  return <Page title={t('tontines', 'createTontine')} description={t('tontines', 'tontinesDescription')} actions={<Back label={t('tontines', 'backToTontines')} to="/tontines" />}><div className="grid gap-5 lg:grid-cols-2">
    <div className="lg:col-span-2"><TontineWizardSteps t={t} current={1} /></div>
    <FormSection title={t('tontines', 'general')}><div className="grid gap-4 sm:grid-cols-2">{!isGoods && !organizationCurrency && <div className="sm:col-span-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"><p>{t('tontines', 'organizationCurrencyMissing')}</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => navigate('/settings/organization')}>{t('tontines', 'goToOrganizationSettings')}</Button></div>}<div className="space-y-2"><Label htmlFor="tontine-name">{t('tontines', 'tontineName')} *</Label><Input id="tontine-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(error)} /><FieldError message={error} /></div><div className="space-y-2"><Label htmlFor="tontine-value-type">{t('tontines', 'valueType')}</Label><select id="tontine-value-type" value={valueType} onChange={(event) => setValueType(event.target.value as ValueType)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="MONEY">{t('tontines', 'tontineFinancial')}</option><option value="GOODS">{t('tontines', 'tontineInKind')}</option></select></div>{!isGoods && <div className="space-y-2"><Label htmlFor="tontine-contribution-amount">{t('tontines', 'tontineContributionAmount')} *</Label><div className="relative"><Input id="tontine-contribution-amount" type="number" inputMode="decimal" min={0} value={contributionAmount} onChange={(event) => setContributionAmount(event.target.value)} aria-invalid={Boolean(contributionAmountError)} aria-describedby={organizationCurrency ? 'tontine-contribution-amount-currency' : undefined} className={organizationCurrency ? 'pr-14' : undefined} />{organizationCurrency && <span id="tontine-contribution-amount-currency" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{getCurrencyShortLabel(organizationCurrency)}</span>}</div><FieldError message={contributionAmountError} /></div>}{isGoods && <div className="space-y-2"><Label htmlFor="tontine-goods-item">{t('tontines', 'goodsItem')} *</Label><Input id="tontine-goods-item" value={item} onChange={(event) => setItem(event.target.value)} aria-invalid={Boolean(itemError)} /><FieldError message={itemError} /></div>}{isGoods && <div className="space-y-2"><Label htmlFor="tontine-goods-quantity">{t('tontines', 'referenceQuantity')} *</Label><Input id="tontine-goods-quantity" type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-invalid={Boolean(quantityError)} /><FieldError message={quantityError} /></div>}{!isGoods && <div className="flex items-center justify-between gap-3 space-y-0 rounded-lg border border-input px-3 py-2 sm:col-span-2"><div><Label htmlFor="tontine-with-purchase">{t('tontines', 'withPurchase')}</Label><p className="mt-0.5 text-[11px] text-muted-foreground">{t('tontines', 'withPurchaseHint')}</p></div><Switch id="tontine-with-purchase" checked={purchaseMode === 'WITH_PURCHASE'} onCheckedChange={(checked) => setPurchaseMode(checked ? 'WITH_PURCHASE' : 'WITHOUT_PURCHASE')} /></div>}{isGoods && <div className="space-y-2"><Label htmlFor="tontine-goods-unit">{t('tontines', 'unit')} *</Label><select id="tontine-goods-unit" value={unit} onChange={(event) => setUnit(event.target.value)} aria-invalid={Boolean(unitError)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{t('tontines', 'selectUnit')}</option>{units.map((option) => <option key={option.code} value={option.code}>{option.singularFr}</option>)}</select><FieldError message={unitError} /></div>}{!isGoods && <p className="text-xs text-muted-foreground sm:col-span-2">{t('tontines', 'contributionAmountHint')}</p>}</div></FormSection>
    <FormSection title={t('tontines', 'frequencySection')} description={t('tontines', 'frequencySectionDescription')}><FrequencyFields t={t} value={freq} onChange={setFreq} error={frequencyError} /></FormSection>
    <FormSection title={t('tontines', 'adhesionsInfoSection')} description={t('tontines', 'adhesionsInfoDescription')}><></></FormSection>
    <FormSection title={t('tontines', 'summarySection')}><div className="grid gap-2 text-sm sm:grid-cols-2"><Info label={t('tontines', 'summaryName')} value={name || '—'} icon={Landmark} /><Info label={t('tontines', 'valueType')} value={valueType === 'MONEY' ? t('tontines', 'tontineFinancial') : t('tontines', 'tontineInKind')} icon={ClipboardList} />{!isGoods && <><Info label={t('tontines', 'currency')} value={organizationCurrency ? `${organizationCurrency} — ${getCurrencyLabel(organizationCurrency)}` : '—'} icon={Banknote} /><Info label={t('tontines', 'tontineContributionAmount')} value={contributionAmount ? `${formatNumber(Number(contributionAmount))} ${organizationCurrency ?? ''}`.trim() : '—'} icon={Banknote} /><Info label={t('tontines', 'withPurchase')} value={t('tontines', purchaseMode === 'WITH_PURCHASE' ? 'yes' : 'no')} icon={ClipboardList} /></>}{isGoods && <><Info label={t('tontines', 'goodsItem')} value={item.trim() || '—'} icon={Package} /><Info label={t('tontines', 'referenceQuantity')} value={quantity ? `${quantity} ${formatUnit(Number(quantity), unit)}`.trim() : '—'} icon={Hash} /><Info label={t('tontines', 'unit')} value={unit ? formatUnit(2, unit) : '—'} icon={Hash} /></>}{freq.frequency && <><Info label={t('tontines', 'frequency')} value={t('tontines', FREQUENCY_LABEL_KEY[freq.frequency])} icon={CalendarDays} /><Info label={t('tontines', 'frequencyPreviewLabel')} value={formatFrequencyDescription(freq as FrequencyConfig, 'fr')} icon={CalendarDays} /></>}<Info label={t('tontines', 'summaryTenant')} value={`${currentTenant.name} (${currentTenant.id})`} icon={UsersRound} /></div></FormSection>
    <div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={isPending} onClick={() => navigate('/tontines')}>{t('tontines', 'cancel')}</Button><Button disabled={isPending || (!isGoods && !organizationCurrency)} onClick={handleSave}>{isPending ? t('tontines', 'saving') : t('tontines', 'save')}</Button></div>
  </div></Page>;
}

/**
 * Fiche Tontine (mandat « refactorisation de la fiche Tontine ») — page de
 * consultation/configuration, plus jamais une deuxième interface
 * opérationnelle : les cotisations/participation/bénéficiaires détaillés
 * restent exclusivement dans le panneau Opérations (`tontine-operations-
 * module.tsx`, non modifié ici). Trois zones seulement, empilées (plus
 * d'onglets) : Informations (identité/statut), Configuration (paramètres
 * fonctionnels), Périodes et occurrences (structure temporelle réelle,
 * `Tontine → Fréquence → Période → Occurrence`, jamais de Tour ni de Cycle).
 * L'ancien modèle `TontineCycle` (`tontine-cycles.ts`, jamais intégré au
 * modèle Période/Occurrence/Opérations) a été supprimé du module Tontine
 * dans son ensemble (mandat « suppression complète de la logique
 * Cycle/Tour ») — plus de routes, plus de composants, plus de service.
 */
function TontineDetail({ t }: { t: T }) {
  const { tontineId = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: tontine, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.tontines.detail(tontineId), currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const { data: periods = [] } = useQuery({ queryKey: ['tontines', 'periods', tontineId, currentTenant.id], queryFn: () => tontineTurnsService.listPeriodsByTontine(currentTenant.id, tontineId), enabled: Boolean(tontine) });
  /** Toutes les occurrences de la Tontine (déjà utilisé ailleurs — `contributions-module.tsx`/`tontine-operations-module.tsx` — pour peupler un sélecteur ; réutilisé ici tel quel pour afficher les occurrences réelles de la période la plus récente, jamais une donnée inventée). */
  const { data: occurrences = [] } = useQuery({ queryKey: ['tontines', 'occurrences-by-tontine', tontineId, currentTenant.id], queryFn: () => tontineTurnsService.listOccurrencesByTontine(currentTenant.id, tontineId), enabled: Boolean(tontine) });
  /** Compte réel d'adhérents (mandat §7) — dérivé des Adhésions effectives de la Tontine, jamais de `Tontine.memberCount` (compteur statique hérité, non tenu à jour par le modèle Période/Adhésion actuel). */
  const { data: adhesions = [] } = useQuery({ queryKey: ['tontines', 'adhesions', tontineId, currentTenant.id], queryFn: () => tontineTurnsService.listAdhesionsByTontine(currentTenant.id, tontineId), enabled: Boolean(tontine) });
  if (isLoading) return <Page title={t('tontines', 'tontineDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'tontineDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!tontine) return <NotFoundPage />;
  const activeAdherentsCount = adhesions.filter((item) => item.status === 'active').length;
  /** Route d'adhésions déjà existante (mandat §7 : « ne pas créer de nouvelle logique d'adhésion ») — les adhésions sont gérées au niveau de la Période, jamais de la Tontine directement ; on cible donc la période la plus récente (`listPeriodsByTontine` trie déjà par date de début croissante). */
  const latestPeriod = periods[periods.length - 1];
  const latestPeriodOccurrences = latestPeriod ? occurrences.filter((item) => item.periodId === latestPeriod.id) : [];
  return <Page title={tontine.name} description={`${tontine.id} · ${tontine.tenantId}`} actions={<><Back label={t('tontines', 'backToTontines')} to="/tontines" /><PermissionGate permission="tontines.update"><Button variant="outline" onClick={() => navigate(`/tontines/${tontine.id}/edit`)}><Pencil size={16} />{t('tontines', 'edit')}</Button></PermissionGate></>}>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'tontineInfoTitle')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 pt-0 sm:grid-cols-3">
      <Info label={t('tontines', 'summaryName')} value={tontine.name} icon={Landmark} />
      <Info label={t('tontines', 'valueType')} value={tontine.valueType === 'MONEY' ? t('tontines', 'tontineFinancial') : t('tontines', 'tontineInKind')} icon={ClipboardList} />
      <Info label={t('tontines', 'frequency')} value={tontine.frequency ? t('tontines', FREQUENCY_LABEL_KEY[tontine.frequency]) : '—'} icon={CalendarDays} />
      {tontine.valueType === 'MONEY'
        ? <Info label={t('tontines', 'tontineContributionAmount')} value={tontine.contributionAmount ? `${formatNumber(tontine.contributionAmount)} ${tontine.currency ?? ''}`.trim() : '—'} icon={Banknote} />
        : <Info label={t('tontines', 'goodsItem')} value={tontine.item || '—'} icon={Package} />}
      <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'tontineStatus')}</p><StatusBadge label={t('tontines', tontine.status)} tone={STATUS_TONE[tontine.status]} /></div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'configuration')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 pt-0 sm:grid-cols-3">
      {tontine.valueType === 'MONEY' && <><Info label={t('tontines', 'currency')} value={tontine.currency ? `${tontine.currency} — ${getCurrencyLabel(tontine.currency)}` : '—'} icon={Banknote} /><Info label={t('tontines', 'withPurchase')} value={t('tontines', tontine.purchaseMode === 'WITH_PURCHASE' ? 'yes' : 'no')} icon={ClipboardList} /></>}
      {tontine.valueType === 'GOODS' && <><Info label={t('tontines', 'referenceQuantity')} value={tontine.quantity ? `${formatNumber(tontine.quantity)} ${formatUnit(tontine.quantity, tontine.unit)}`.trim() : '—'} icon={Hash} /><Info label={t('tontines', 'unit')} value={tontine.unit ? formatUnit(2, tontine.unit) : '—'} icon={Hash} /></>}
      <Info label={t('tontines', 'frequencyPreviewLabel')} value={tontine.frequency ? formatFrequencyDescription(tontine as FrequencyConfig, 'fr') : '—'} icon={CalendarDays} />
    </CardContent></Card>

    <Card><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div><p className="text-sm font-semibold">{t('tontines', 'adherentsTitle')}</p><p className="text-xs text-muted-foreground">{t('tontines', 'adherentsCount', { count: String(activeAdherentsCount) })}</p></div>
      {latestPeriod && <Button variant="outline" size="sm" onClick={() => navigate(`/tontines/${tontine.id}/periods/${latestPeriod.id}/adhesions`)}>{t('tontines', 'viewAdhesions')}<ChevronRight size={14} /></Button>}
    </CardContent></Card>

    <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">{t('tontines', 'periodsAndOccurrences')}</CardTitle><PermissionGate permission="cycles.create"><Button size="sm" variant="outline" onClick={() => navigate(`/tontines/${tontine.id}/periods/create`)}><Plus size={15} />{t('tontines', 'newPeriod')}</Button></PermissionGate></CardHeader><CardContent className="space-y-4 p-5 pt-0">
      {periods.length === 0 ? <EmptyState icon={CalendarDays} title={t('tontines', 'nextSteps')} description={t('tontines', 'nextStepsDescription')} /> : <>
        {latestPeriod && <div>
          <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-muted-foreground"><DateDisplay value={latestPeriod.startDate} /> → <DateDisplay value={latestPeriod.endDate} /></p><button type="button" onClick={() => navigate(`/tontines/${tontine.id}/periods/${latestPeriod.id}`)} className="text-xs font-medium text-primary hover:underline">{t('tontines', 'viewDetail')}</button></div>
          <OccurrenceCalendarTable t={t} tontineId={tontine.id} periodId={latestPeriod.id} occurrences={latestPeriodOccurrences} />
        </div>}
        {periods.length > 1 && <div className="border-t border-border pt-4"><p className="mb-2 text-xs font-semibold text-muted-foreground">{t('tontines', 'periodsAndOccurrences')}</p><PeriodTable t={t} tontineId={tontine.id} periods={periods} /></div>}
      </>}
    </CardContent></Card>
  </Page>;
}

/**
 * Écran « Modifier une tontine » (mandat « montant de cotisation » §6) —
 * applique exactement la même règle que la création : montant de cotisation
 * obligatoire et strictement positif pour MONEY, non applicable pour GOODS.
 * Volontairement restreint aux champs de la section Général (nom/type de
 * valeur/devise/mode d'achat/montant/référence de bien) : la fréquence et le
 * chaînage « première période » sont des préoccupations propres à la
 * création, hors périmètre de ce mandat.
 */
function TontineEdit({ t }: { t: T }) {
  const { tontineId = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: tontine, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.tontines.detail(tontineId), currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const [form, setForm] = useState<{ name: string; valueType: ValueType; currency: string; purchaseMode: 'WITH_PURCHASE' | 'WITHOUT_PURCHASE'; contributionAmount: string; item: string; quantity: string; unit: string } | null>(null);
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
  const current = form ?? { name: tontine.name, valueType: tontine.valueType, currency: tontine.currency ?? DEFAULT_CURRENCY_CODE, purchaseMode: tontine.purchaseMode ?? 'WITHOUT_PURCHASE', contributionAmount: tontine.contributionAmount !== undefined ? String(tontine.contributionAmount) : '', item: tontine.item ?? '', quantity: tontine.quantity !== undefined ? String(tontine.quantity) : '', unit: tontine.unit ?? '' };
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
        : { currency: current.currency, purchaseMode: current.purchaseMode, contributionAmount: Number(current.contributionAmount) }),
    });
  };
  return <Page title={t('tontines', 'editTontine')} description={tontine.name} actions={<Back label={t('tontines', 'backToTontine')} to={`/tontines/${tontineId}`} />}>
    <FormSection title={t('tontines', 'general')}><div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="tontine-edit-name">{t('tontines', 'tontineName')} *</Label><Input id="tontine-edit-name" value={current.name} onChange={(event) => setField('name', event.target.value)} aria-invalid={Boolean(error)} /><FieldError message={error} /></div>
      <div className="space-y-2"><Label htmlFor="tontine-edit-value-type">{t('tontines', 'valueType')}</Label><select id="tontine-edit-value-type" value={current.valueType} onChange={(event) => setField('valueType', event.target.value as ValueType)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="MONEY">{t('tontines', 'tontineFinancial')}</option><option value="GOODS">{t('tontines', 'tontineInKind')}</option></select></div>
      {!isGoods && <div className="space-y-2"><Label htmlFor="tontine-edit-currency">{t('tontines', 'currency')}</Label><select id="tontine-edit-currency" value={current.currency} onChange={(event) => setField('currency', event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{currencies.map((option) => <option key={option.code} value={option.code}>{option.code} — {option.labelFr}</option>)}</select></div>}
      {!isGoods && <div className="space-y-2"><Label htmlFor="tontine-edit-contribution-amount">{t('tontines', 'tontineContributionAmount')} *</Label><Input id="tontine-edit-contribution-amount" type="number" inputMode="decimal" min={0} value={current.contributionAmount} onChange={(event) => setField('contributionAmount', event.target.value)} aria-invalid={Boolean(contributionAmountError)} /><FieldError message={contributionAmountError} /></div>}
      {!isGoods && <div className="flex items-center justify-between gap-3 rounded-lg border border-input px-3 py-2 sm:col-span-2"><div><Label htmlFor="tontine-edit-with-purchase">{t('tontines', 'withPurchase')}</Label><p className="mt-0.5 text-[11px] text-muted-foreground">{t('tontines', 'withPurchaseHint')}</p></div><Switch id="tontine-edit-with-purchase" checked={current.purchaseMode === 'WITH_PURCHASE'} onCheckedChange={(checked) => setField('purchaseMode', checked ? 'WITH_PURCHASE' : 'WITHOUT_PURCHASE')} /></div>}
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
      <Route index element={<TontinesOverview t={t} />} />
      <Route path="create" element={<TontineCreate t={t} />} />
      <Route path="operations" element={<TontineOperationsManage t={t} />} />
      <Route path=":tontineId" element={<TontineDetail t={t} />} />
      <Route path=":tontineId/edit" element={<PermissionRoute permission="tontines.update"><TontineEdit t={t} /></PermissionRoute>} />
      <Route path=":tontineId/periods/create" element={<PeriodCreate t={t} />} />
      <Route path=":tontineId/periods/:periodId" element={<PeriodDetail t={t} />} />
      <Route path=":tontineId/periods/:periodId/adhesions" element={<PeriodAdhesionList t={t} />} />
      <Route path=":tontineId/periods/:periodId/adhesions/new" element={<PeriodAdhesionCreate t={t} />} />
      <Route path=":tontineId/periods/:periodId/adhesions/:adhesionId" element={<PeriodAdhesionDetail t={t} />} />
      <Route path=":tontineId/periods/:periodId/planning" element={<TurnPlanningList t={t} />} />
      <Route path=":tontineId/periods/:periodId/occurrences" element={<OccurrenceList t={t} />} />
      <Route path=":tontineId/periods/:periodId/occurrences/create" element={<OccurrenceCreate t={t} />} />
      <Route path=":tontineId/periods/:periodId/occurrences/:occurrenceId" element={<OccurrenceDetail t={t} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
