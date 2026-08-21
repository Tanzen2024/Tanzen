/**
 * Gestion des contributions Tontine — additive, ne modifie aucun mécanisme
 * legacy. Flux : Adhésion → Contribution → Occurrence (D-TON-04-29,
 * `TontineContribution` référence toujours `adhesionId` + `occurrenceId`,
 * jamais directement un Member ni un Turn). Aucun accès direct aux mocks
 * depuis les composants — tout passe par `tontineTurnsService`.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, ScrollText } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, Timeline, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, ConfirmDialog, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage } from '@/routes';
import { tontineTurnsService, type ContributionInput, type ContributionPaymentInput } from '@/services/tontine-turns.service';
import { tontinesService } from '@/services/tontines.service';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { ValueType, ContributionStatus } from '@/mocks/tontines/tontine-occurrences';
import type { TableColumn } from '@/types/ui';
import { formatValue } from './value-format';
import { currencies, DEFAULT_CURRENCY_CODE } from '@/constants/currencies';
import { units } from '@/constants/units';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const CONTRIBUTION_TONE: Record<ContributionStatus, 'default' | 'success' | 'warning'> = { PENDING: 'default', PARTIAL: 'warning', PAID: 'success', WAIVED: 'default' };
const CONTRIBUTION_LABEL_KEY: Record<ContributionStatus, string> = { PENDING: 'statusReceptionPending', PARTIAL: 'statusReceptionPartial', PAID: 'statusPaid', WAIVED: 'statusWaived' };

function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label, onClick }: { label: string; onClick: () => void }) { return <Button variant="ghost" size="sm" onClick={onClick}>{label}</Button>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div>; }

/** Réutilisable par les fiches Adhésion et Occurrence pour afficher leurs contributions liées (mandat §12) sans dupliquer la logique de colonnes. Chaque ligne mène à `ContributionDetail` (accès contextuel manquant avant cette étape — les lignes n'étaient qu'un affichage sans navigation). */
export function ContributionTable({ t, rows }: { t: T; rows: Awaited<ReturnType<typeof tontineTurnsService.listContributionsByTontine>> }) {
  const { tontineId = '' } = useParams();
  const navigate = useNavigate();
  const columns: TableColumn<(typeof rows)[number]>[] = [
    { key: 'id', header: 'ID', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/contributions/${row.id}`)} className="font-mono text-xs text-primary hover:underline">{row.id}</button> },
    { key: 'adhesionId', header: t('tontines', 'adhesion'), render: (row) => <span className="font-mono text-xs">{row.adhesionId}</span> },
    { key: 'valueType', header: t('tontines', 'valueType'), render: (row) => t('tontines', row.valueType === 'MONEY' ? 'valueTypeMoney' : 'valueTypeGoods') },
    { key: 'expected', header: t('tontines', 'expectedValue'), render: (row) => formatValue(row.valueType, row.expectedAmount, row.expectedQuantity, row.item, row.valueType === 'MONEY' ? row.currency : row.unit) },
    { key: 'paid', header: t('tontines', 'contributionAmount'), render: (row) => formatValue(row.valueType, row.paidAmount, row.paidQuantity, row.item, row.valueType === 'MONEY' ? row.currency : row.unit) },
    { key: 'paidAt', header: t('tontines', 'contributionDate'), render: (row) => row.paidAt ? new Date(row.paidAt).toLocaleDateString('fr-FR') : '—' },
    { key: 'status', header: t('tontines', 'contributionStatus'), render: (row) => <StatusBadge label={t('tontines', CONTRIBUTION_LABEL_KEY[row.status])} tone={CONTRIBUTION_TONE[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/contributions/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <DataTable columns={columns} rows={rows} empty={<EmptyState icon={ScrollText} title={t('tontines', 'noContributions')} />} />;
}

export function ContributionList({ t }: { t: T }) {
  const { tontineId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [valueType, setValueType] = useState('all');

  const { data: tontine, isLoading: isTontineLoading, isError: isTontineError, refetch: refetchTontine } = useQuery({ queryKey: ['tontines', 'detail', tontineId, currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const { data: contributions = [], isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'contributions', tontineId, currentTenant.id], queryFn: () => tontineTurnsService.listContributionsByTontine(currentTenant.id, tontineId), enabled: Boolean(tontine) });
  const { data: adhesions = [] } = useQuery({ queryKey: ['tontines', 'adhesions', tontineId, currentTenant.id], queryFn: () => tontineTurnsService.listAdhesionsByTontine(currentTenant.id, tontineId), enabled: Boolean(tontine) });

  if (isTontineLoading) return <Page title={t('tontines', 'contributionsPageTitle')}><TableSkeleton /></Page>;
  if (isTontineError) return <Page title={t('tontines', 'contributionsPageTitle')}><ErrorState onRetry={refetchTontine} /></Page>;
  if (!tontine) return <NotFoundPage />;
  if (isLoading) return <Page title={t('tontines', 'contributionsPageTitle')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'contributionsPageTitle')}><ErrorState onRetry={refetch} /></Page>;

  const memberNameOf = (adhesionId: string) => adhesions.find((item) => item.id === adhesionId)?.memberName ?? adhesionId;
  const rows = contributions.filter((row) =>
    memberNameOf(row.adhesionId).toLowerCase().includes(search.toLowerCase()) &&
    (status === 'all' || row.status === status) &&
    (valueType === 'all' || row.valueType === valueType),
  );
  const columns: TableColumn<(typeof rows)[number]>[] = [
    { key: 'id', header: 'ID', render: (row) => <span className="font-mono text-xs">{row.id}</span> },
    { key: 'member', header: t('tontines', 'adhesionMember'), render: (row) => memberNameOf(row.adhesionId) },
    { key: 'occurrence', header: t('tontines', 'occurrenceNumber'), render: (row) => <span className="font-mono text-xs">{row.tontineOccurrenceId}</span> },
    { key: 'valueType', header: t('tontines', 'valueType'), render: (row) => t('tontines', row.valueType === 'MONEY' ? 'valueTypeMoney' : 'valueTypeGoods') },
    { key: 'expected', header: t('tontines', 'expectedValue'), render: (row) => formatValue(row.valueType, row.expectedAmount, row.expectedQuantity, row.item, row.valueType === 'MONEY' ? row.currency : row.unit) },
    { key: 'paid', header: t('tontines', 'contributionAmount'), render: (row) => formatValue(row.valueType, row.paidAmount, row.paidQuantity, row.item, row.valueType === 'MONEY' ? row.currency : row.unit) },
    { key: 'paidAt', header: t('tontines', 'contributionDate'), render: (row) => row.paidAt ? new Date(row.paidAt).toLocaleDateString('fr-FR') : '—' },
    { key: 'status', header: t('tontines', 'contributionStatus'), render: (row) => <StatusBadge label={t('tontines', CONTRIBUTION_LABEL_KEY[row.status])} tone={CONTRIBUTION_TONE[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/tontines/${tontineId}/contributions/${row.id}`)} aria-label={t('tontines', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];

  return <Page title={t('tontines', 'contributionsPageTitle')} description={`${tontine.name} · ${t('tontines', 'contributionsPageDescription')}`} actions={<><Back label={t('tontines', 'backToTontines')} onClick={() => navigate(`/tontines/${tontineId}`)} /><PermissionGate permission="contributions.manage"><Button onClick={() => navigate(`/tontines/${tontineId}/contributions/new`)}><Plus size={16} />{t('tontines', 'createContribution')}</Button></PermissionGate></>}>
    <FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'adhesionMember')} filters={<>
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('tontines', 'contributionStatus')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'contributionStatus')}</option><option value="PENDING">{t('tontines', 'statusReceptionPending')}</option><option value="PARTIAL">{t('tontines', 'statusReceptionPartial')}</option><option value="PAID">{t('tontines', 'statusPaid')}</option><option value="WAIVED">{t('tontines', 'statusWaived')}</option></select>
      <select value={valueType} onChange={(event) => setValueType(event.target.value)} aria-label={t('tontines', 'valueType')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('tontines', 'valueType')}</option><option value="MONEY">{t('tontines', 'valueTypeMoney')}</option><option value="GOODS">{t('tontines', 'valueTypeGoods')}</option></select>
    </>} />
    <DataTable columns={columns} rows={rows} empty={<EmptyState icon={ScrollText} title={t('tontines', 'noContributions')} />} />
  </Page>;
}

export function ContributionCreate({ t }: { t: T }) {
  const { tontineId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: tontine, isLoading: isTontineLoading, isError: isTontineError, refetch: refetchTontine } = useQuery({ queryKey: ['tontines', 'detail', tontineId, currentTenant.id], queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId) });
  const { data: adhesions = [] } = useQuery({ queryKey: ['tontines', 'adhesions', tontineId, currentTenant.id], queryFn: () => tontineTurnsService.listAdhesionsByTontine(currentTenant.id, tontineId), enabled: Boolean(tontine) });
  const { data: occurrences = [] } = useQuery({ queryKey: ['tontines', 'occurrences-by-tontine', tontineId, currentTenant.id], queryFn: () => tontineTurnsService.listOccurrencesByTontine(currentTenant.id, tontineId), enabled: Boolean(tontine) });

  const [adhesionId, setAdhesionId] = useState('');
  const [occurrenceId, setOccurrenceId] = useState('');
  const [valueType, setValueType] = useState<ValueType>('MONEY');
  const [value, setValue] = useState('');
  const [item, setItem] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY_CODE);
  const [unit, setUnit] = useState('');
  const [error, setError] = useState<string | undefined>();

  /** Préremplissage depuis la Tontine parente (§8/§10 du mandat devise/unité) : valueType, devise (MONEY) ou nature/quantité/unité de référence (GOODS). Ce sont des valeurs de départ, pas un verrouillage — aucune règle sourcée n'impose que la Contribution reste identique à la Tontine, donc tous les champs restent modifiables ensuite. */
  useEffect(() => {
    if (!tontine) return;
    setValueType(tontine.valueType);
    if (tontine.valueType === 'GOODS') {
      setItem(tontine.item ?? '');
      setValue(tontine.quantity ? String(tontine.quantity) : '');
      setUnit(tontine.unit ?? '');
    } else {
      setCurrency(tontine.currency ?? DEFAULT_CURRENCY_CODE);
    }
  }, [tontine]);

  const mutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.createContribution>>, ContributionInput>({
    mutationFn: (input) => tontineTurnsService.createContribution(currentTenant.id, input),
    invalidateKeys: [['tontines', 'contributions', tontineId, currentTenant.id]],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'fieldRequired')); return; }
      notify.success(t('tontines', 'contributionCreated'));
      navigate(`/tontines/${tontineId}/contributions`);
    },
  });

  if (isTontineLoading) return <Page title={t('tontines', 'newContribution')}><DetailSkeleton /></Page>;
  if (isTontineError) return <Page title={t('tontines', 'newContribution')}><ErrorState onRetry={refetchTontine} /></Page>;
  if (!tontine) return <NotFoundPage />;

  const handleSave = () => {
    if (!adhesionId || !occurrenceId || !value.trim()) { setError(t('tontines', 'fieldRequired')); return; }
    setError(undefined);
    mutation.mutate({
      adhesionId, tontineOccurrenceId: occurrenceId, valueType,
      expectedAmount: valueType === 'MONEY' ? Number(value) || 0 : undefined,
      currency: valueType === 'MONEY' ? currency : undefined,
      expectedQuantity: valueType === 'GOODS' ? Number(value) || 0 : undefined,
      item: valueType === 'GOODS' && item.trim() ? item.trim() : undefined,
      unit: valueType === 'GOODS' && unit ? (unit as ContributionInput['unit']) : undefined,
    });
  };

  return <Page title={t('tontines', 'newContribution')} description={`${tontine.name} · ${t('tontines', 'contributionsPageDescription')}`} actions={<Back label={t('tontines', 'backToContributions')} onClick={() => navigate(`/tontines/${tontineId}/contributions`)} />}>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'general')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="contribution-adhesion">{t('tontines', 'selectAdhesion')}</Label>
        <select id="contribution-adhesion" value={adhesionId} onChange={(event) => setAdhesionId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{t('tontines', 'selectAdhesion')}</option>{adhesions.map((adhesion) => <option key={adhesion.id} value={adhesion.id}>{adhesion.memberName} · {adhesion.id} · {adhesion.periodId}</option>)}</select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contribution-occurrence">{t('tontines', 'selectOccurrence')}</Label>
        <select id="contribution-occurrence" value={occurrenceId} onChange={(event) => setOccurrenceId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{t('tontines', 'selectOccurrence')}</option>{occurrences.map((occurrence) => <option key={occurrence.id} value={occurrence.id}>#{occurrence.occurrenceNumber} · {occurrence.plannedDate} · {occurrence.periodId}</option>)}</select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contribution-value-type">{t('tontines', 'valueType')}</Label>
        <select id="contribution-value-type" value={valueType} onChange={(event) => setValueType(event.target.value as ValueType)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="MONEY">{t('tontines', 'valueTypeMoney')}</option><option value="GOODS">{t('tontines', 'valueTypeGoods')}</option></select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contribution-value">{valueType === 'MONEY' ? t('tontines', 'expectedAmount') : t('tontines', 'expectedQuantity')}</Label>
        <Input id="contribution-value" type="number" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} aria-invalid={Boolean(error)} />
      </div>
      {valueType === 'MONEY' && <div className="space-y-2">
        <Label htmlFor="contribution-currency">{t('tontines', 'currency')}</Label>
        <select id="contribution-currency" value={currency} onChange={(event) => setCurrency(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{currencies.map((option) => <option key={option.code} value={option.code}>{option.code} — {option.labelFr}</option>)}</select>
      </div>}
      {valueType === 'GOODS' && <>
        <div className="space-y-2">
          <Label htmlFor="contribution-item">{t('tontines', 'item')}</Label>
          <Input id="contribution-item" value={item} onChange={(event) => setItem(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contribution-unit">{t('tontines', 'unit')}</Label>
          <select id="contribution-unit" value={unit} onChange={(event) => setUnit(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{t('tontines', 'selectUnit')}</option>{units.map((option) => <option key={option.code} value={option.code}>{option.singularFr}</option>)}</select>
        </div>
      </>}
      <FieldError message={error} />
    </CardContent></Card>
    <div className="flex justify-end gap-2">
      <Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/tontines/${tontineId}/contributions`)}>{t('tontines', 'cancel')}</Button>
      <Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('tontines', 'saving') : t('tontines', 'save')}</Button>
    </div>
  </Page>;
}

export function ContributionDetail({ t }: { t: T }) {
  const { tontineId = '', contributionId = '' } = useParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { data: contribution, isLoading, isError, refetch } = useQuery({ queryKey: ['tontines', 'contribution', contributionId, currentTenant.id], queryFn: () => tontineTurnsService.getContribution(currentTenant.id, contributionId) });
  const { data: adhesion } = useQuery({ queryKey: ['tontines', 'adhesion', contribution?.adhesionId, currentTenant.id], queryFn: () => tontineTurnsService.getAdhesion(currentTenant.id, contribution!.adhesionId), enabled: Boolean(contribution) });
  const [payOpen, setPayOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();

  const mutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.recordContributionPayment>>, ContributionPaymentInput>({
    mutationFn: (input) => tontineTurnsService.recordContributionPayment(currentTenant.id, contributionId, input),
    invalidateKeys: [['tontines', 'contribution', contributionId, currentTenant.id]],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'fieldRequired')); return; }
      notify.success(t('tontines', 'paymentRecorded'));
      setPayOpen(false); setValue('');
    },
  });

  if (isLoading) return <Page title={t('tontines', 'contributionDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'contributionDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!contribution) return <NotFoundPage />;

  const expected = contribution.expectedAmount ?? contribution.expectedQuantity ?? 0;
  const paid = contribution.valueType === 'MONEY' ? contribution.paidAmount : contribution.paidQuantity;
  const remaining = Math.max(0, expected - paid);

  return <Page title={t('tontines', 'contributionDetail')} description={contribution.id} actions={<><Back label={t('tontines', 'backToContributions')} onClick={() => navigate(`/tontines/${tontineId}/contributions`)} />{contribution.status !== 'WAIVED' && <PermissionGate permission="contributions.manage"><Button variant="outline" onClick={() => setPayOpen(true)}><Plus size={15} />{t('tontines', 'recordPayment')}</Button></PermissionGate>}</>}>
    {payOpen && <ConfirmDialog open title={t('tontines', 'recordPayment')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onCancel={() => setPayOpen(false)} onConfirm={() => {
      if (!value.trim()) { setError(t('tontines', 'fieldRequired')); return; }
      setError(undefined);
      mutation.mutate({ amount: contribution.valueType === 'MONEY' ? Number(value) || 0 : undefined, quantity: contribution.valueType === 'GOODS' ? Number(value) || 0 : undefined });
    }}>
      <div className="mt-4 space-y-2 text-left">
        <Label htmlFor="payment-value">{contribution.valueType === 'MONEY' ? t('tontines', 'receptionAmount') : t('tontines', 'receptionQuantity')}</Label>
        <Input id="payment-value" type="number" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} aria-invalid={Boolean(error)} />
        <FieldError message={error} />
      </div>
    </ConfirmDialog>}
    <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-4">
      <Info label={t('tontines', 'adhesionMember')} value={adhesion?.memberName ?? contribution.adhesionId} />
      <Info label={t('tontines', 'valueType')} value={t('tontines', contribution.valueType === 'MONEY' ? 'valueTypeMoney' : 'valueTypeGoods')} />
      {contribution.valueType === 'GOODS' && <Info label={t('tontines', 'goodsItem')} value={contribution.item || '—'} />}
      <Info label={t('tontines', 'expectedValue')} value={formatValue(contribution.valueType, contribution.expectedAmount, contribution.expectedQuantity, contribution.item, contribution.valueType === 'MONEY' ? contribution.currency : contribution.unit)} />
      <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'contributionStatus')}</p><StatusBadge label={t('tontines', CONTRIBUTION_LABEL_KEY[contribution.status])} tone={CONTRIBUTION_TONE[contribution.status]} /></div>
      <Info label={t('tontines', 'contributionAmount')} value={formatValue(contribution.valueType, contribution.paidAmount, contribution.paidQuantity, contribution.item, contribution.valueType === 'MONEY' ? contribution.currency : contribution.unit)} />
      <Info label={t('tontines', 'remaining')} value={formatValue(contribution.valueType, remaining, remaining, contribution.item, contribution.valueType === 'MONEY' ? contribution.currency : contribution.unit)} />
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">{t('tontines', 'paymentHistory')}</CardTitle></CardHeader><CardContent>
      {contribution.payments.length === 0 ? <p className="text-xs text-muted-foreground">{t('tontines', 'noOperations')}</p> : (
        <Timeline items={contribution.payments.map((payment) => ({ id: payment.id, title: formatValue(contribution.valueType, payment.amount, payment.quantity, contribution.item, contribution.valueType === 'MONEY' ? contribution.currency : contribution.unit), description: `${t('tontines', 'operationActor')} : ${payment.actorName}`, date: new Date(payment.date).toLocaleDateString('fr-FR'), tone: 'success' }))} />
      )}
    </CardContent></Card>
  </Page>;
}
