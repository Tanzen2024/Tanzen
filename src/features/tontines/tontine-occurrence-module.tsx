import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CheckCircle2, HandCoins, Plus, ShoppingCart } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { DataTable, StatusBadge, EmptyState, MoneyDisplay, DateDisplay, PermissionGate, DetailSkeleton, ErrorState } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage } from '@/routes';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { tontinesService } from '@/services/tontines.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { TableColumn } from '@/types/ui';
import { Page, Back } from './tontines-module';
import type { T } from './tontines-module';

function BeneficiariesPanel({ t, occurrenceId, tontineId, withPurchase }: { t: T; occurrenceId: string; tontineId: string; withPurchase: boolean }) {
  const { currentTenant } = useTenant();
  const [adhesionId, setAdhesionId] = useState(''); const [amountDue, setAmountDue] = useState('');
  const [receptionAmounts, setReceptionAmounts] = useState<Record<string, string>>({});
  const [purchaseAmounts, setPurchaseAmounts] = useState<Record<string, string>>({});
  const { data: beneficiaries = [] } = useQuery({ queryKey: queryKeys.tontines.beneficiaries(occurrenceId), queryFn: () => tontineOperationsService.listBeneficiaries(currentTenant.id, occurrenceId) });
  const { data: adhesions = [] } = useQuery({ queryKey: queryKeys.tontines.adhesions(tontineId), queryFn: () => tontinesService.listAdhesions(currentTenant.id, tontineId) });
  const availableAdhesions = adhesions.filter((a) => a.status === 'active' && !beneficiaries.some((b) => b.adhesionId === a.id));

  const addMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.addOccurrenceBeneficiary>>, void>({
    mutationFn: () => tontineOperationsService.addOccurrenceBeneficiary(currentTenant.id, occurrenceId, adhesionId, Number(amountDue)),
    invalidateKeys: [queryKeys.tontines.beneficiaries(occurrenceId)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'beneficiaryAddFailed')); return; } notify.success(t('tontines', 'beneficiaryAdded')); setAdhesionId(''); setAmountDue(''); },
  });
  const receptionMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.recordReception>>, string>({
    mutationFn: (beneficiaryId) => tontineOperationsService.recordReception(currentTenant.id, beneficiaryId, Number(receptionAmounts[beneficiaryId] ?? 0), withPurchase ? Number(purchaseAmounts[beneficiaryId] ?? 0) || undefined : undefined),
    invalidateKeys: [queryKeys.tontines.beneficiaries(occurrenceId)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'receptionFailed')); return; } notify.success(t('tontines', 'receptionRecorded')); },
  });

  return <div className="space-y-3">
    <div className="space-y-2">{beneficiaries.map((beneficiary) => {
      const adhesion = adhesions.find((a) => a.id === beneficiary.adhesionId);
      const fullyPaid = beneficiary.amountPaid >= beneficiary.amountDue;
      return <Card key={beneficiary.id}><CardContent className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-40 flex-1"><p className="text-sm font-semibold">{adhesion?.memberName ?? beneficiary.adhesionId}</p><p className="text-xs text-muted-foreground">{t('tontines', 'amountDue')} : <MoneyDisplay amount={beneficiary.amountDue} /> · {t('tontines', 'amountPaid')} : <MoneyDisplay amount={beneficiary.amountPaid} /></p></div>
        <StatusBadge label={t('tontines', fullyPaid ? 'received' : 'pending')} tone={fullyPaid ? 'success' : 'warning'} />
        {!fullyPaid && <PermissionGate permission="beneficiaries.manage"><div className="flex flex-wrap items-end gap-2">
          <div className="w-32 space-y-1"><Label htmlFor={`reception-${beneficiary.id}`}>{t('tontines', 'receptionAmount')}</Label><Input id={`reception-${beneficiary.id}`} type="number" min={0} value={receptionAmounts[beneficiary.id] ?? ''} onChange={(event) => setReceptionAmounts((prev) => ({ ...prev, [beneficiary.id]: event.target.value }))} /></div>
          {withPurchase && <div className="w-32 space-y-1"><Label htmlFor={`purchase-${beneficiary.id}`}>{t('tontines', 'purchaseAmount')}</Label><Input id={`purchase-${beneficiary.id}`} type="number" min={0} value={purchaseAmounts[beneficiary.id] ?? ''} onChange={(event) => setPurchaseAmounts((prev) => ({ ...prev, [beneficiary.id]: event.target.value }))} /></div>}
          <Button size="sm" disabled={!(Number(receptionAmounts[beneficiary.id]) > 0) || receptionMutation.isPending} onClick={() => receptionMutation.mutate(beneficiary.id)}><HandCoins size={14} />{t('tontines', 'recordReception')}</Button>
        </div></PermissionGate>}
      </CardContent></Card>;
    })}{beneficiaries.length === 0 && <EmptyState icon={HandCoins} title={t('tontines', 'noBeneficiaries')} />}</div>
    {withPurchase && <PermissionGate permission="beneficiaries.manage"><div className="flex flex-wrap items-end gap-2 border-t border-border pt-3"><div className="min-w-48 space-y-1"><Label htmlFor="beneficiary-adhesion">{t('tontines', 'addBeneficiary')}</Label><select id="beneficiary-adhesion" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={adhesionId} onChange={(event) => setAdhesionId(event.target.value)}><option value="">{t('tontines', 'selectAdhesion')}</option>{availableAdhesions.map((a) => <option key={a.id} value={a.id}>{a.memberName}</option>)}</select></div><div className="w-32 space-y-1"><Label htmlFor="beneficiary-amount-due">{t('tontines', 'amountDue')}</Label><Input id="beneficiary-amount-due" type="number" min={0} value={amountDue} onChange={(event) => setAmountDue(event.target.value)} /></div><Button size="sm" disabled={!adhesionId || !(Number(amountDue) > 0) || addMutation.isPending} onClick={() => addMutation.mutate()}><Plus size={14} />{t('tontines', 'add')}</Button></div></PermissionGate>}
    {!withPurchase && <p className="text-xs text-muted-foreground">{t('tontines', 'beneficiaryFromPlanHint')}</p>}
  </div>;
}

function ContributionsPanel({ t, occurrenceId, tontineId }: { t: T; occurrenceId: string; tontineId: string }) {
  const { currentTenant } = useTenant();
  const [adhesionId, setAdhesionId] = useState(''); const [amount, setAmount] = useState('');
  const { data: contributions = [] } = useQuery({ queryKey: queryKeys.tontines.contributions(occurrenceId), queryFn: () => tontineOperationsService.listContributions(currentTenant.id, occurrenceId) });
  const { data: adhesions = [] } = useQuery({ queryKey: queryKeys.tontines.adhesions(tontineId), queryFn: () => tontinesService.listAdhesions(currentTenant.id, tontineId) });
  const mutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.recordContribution>>, void>({
    mutationFn: () => tontineOperationsService.recordContribution(currentTenant.id, occurrenceId, adhesionId, Number(amount)),
    invalidateKeys: [queryKeys.tontines.contributions(occurrenceId)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'contributionFailed')); return; } notify.success(t('tontines', 'contributionRecorded')); setAdhesionId(''); setAmount(''); },
  });
  const columns: TableColumn<(typeof contributions)[number]>[] = [
    { key: 'adhesionId', header: t('tontines', 'adherentsTitle'), render: (row) => adhesions.find((a) => a.id === row.adhesionId)?.memberName ?? row.adhesionId },
    { key: 'amount', header: t('tontines', 'amountPaid'), render: (row) => <MoneyDisplay amount={row.amount} /> },
    { key: 'date', header: t('tontines', 'contributionDate'), render: (row) => <DateDisplay value={row.date} /> },
  ];
  return <div className="space-y-3">
    <DataTable columns={columns} rows={contributions} empty={<EmptyState icon={Banknote} title={t('tontines', 'noContributionsRecorded')} />} />
    <PermissionGate permission="contributions.manage"><div className="flex flex-wrap items-end gap-2"><div className="min-w-48 space-y-1"><Label htmlFor="contribution-adhesion">{t('tontines', 'contributingMember')}</Label><select id="contribution-adhesion" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={adhesionId} onChange={(event) => setAdhesionId(event.target.value)}><option value="">{t('tontines', 'selectAdhesion')}</option>{adhesions.filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.id}>{a.memberName}</option>)}</select></div><div className="w-32 space-y-1"><Label htmlFor="contribution-amount">{t('tontines', 'amountPaid')}</Label><Input id="contribution-amount" type="number" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} /></div><Button size="sm" disabled={!adhesionId || !(Number(amount) > 0) || mutation.isPending} onClick={() => mutation.mutate()}><Plus size={14} />{t('tontines', 'recordContribution')}</Button></div></PermissionGate>
  </div>;
}

export function OccurrenceDetail({ t }: { t: T }) {
  const { tontineId = '', occurrenceId = '' } = useParams();
  const { currentTenant } = useTenant();
  const { data: occurrence, isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.tontines.occurrence(occurrenceId), queryFn: () => tontineOperationsService.getOccurrence(currentTenant.id, occurrenceId) });
  const { data: tontine } = useQuery({ queryKey: queryKeys.tontines.detail(tontineId), queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId), enabled: Boolean(occurrence) });
  const closeMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.closeOccurrence>>, void>({
    mutationFn: () => tontineOperationsService.closeOccurrence(currentTenant.id, occurrenceId),
    invalidateKeys: [queryKeys.tontines.occurrence(occurrenceId), queryKeys.tontines.occurrences(tontineId), queryKeys.tontines.remainders(tontineId)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'closeOccurrenceFailed')); return; } notify.success(t('tontines', 'occurrenceClosed')); },
  });
  if (isLoading) return <Page title={t('tontines', 'occurrenceDetail')}><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('tontines', 'occurrenceDetail')}><ErrorState onRetry={refetch} /></Page>;
  if (!occurrence || !tontine) return <NotFoundPage />;
  const withPurchase = Boolean(tontine.withPurchase);
  return <Page title={`${t('tontines', 'occurrenceLabel')} #${occurrence.occurrenceNumber}`} description={tontine.name} actions={<Back label={t('tontines', 'backToTontine')} to={`/tontines/${tontineId}`} />}>
    <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="flex items-center gap-3"><StatusBadge label={t('tontines', occurrence.status === 'REALIZED' ? 'occurrenceRealized' : 'occurrencePlanned')} tone={occurrence.status === 'REALIZED' ? 'success' : 'info'} /><span className="text-sm text-muted-foreground"><DateDisplay value={occurrence.date} /></span></div>
      {occurrence.status === 'PLANNED' && <PermissionGate permission="beneficiaries.manage"><Button variant="outline" disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()}><CheckCircle2 size={15} />{t('tontines', 'closeOccurrence')}</Button></PermissionGate>}
    </CardContent></Card>

    {tontine.valueType === 'MONEY' && <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Banknote size={15} />{t('tontines', 'contributionsLabel')}</CardTitle></CardHeader><CardContent className="p-5 pt-0"><ContributionsPanel t={t} occurrenceId={occurrenceId} tontineId={tontineId} /></CardContent></Card>}

    <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><HandCoins size={15} />{t('tontines', 'beneficiariesLabel')}</CardTitle></CardHeader><CardContent className="p-5 pt-0"><BeneficiariesPanel t={t} occurrenceId={occurrenceId} tontineId={tontineId} withPurchase={withPurchase} /></CardContent></Card>

    {withPurchase && <Card><CardContent className="flex items-center gap-2 p-4 text-xs text-muted-foreground"><ShoppingCart size={14} />{t('tontines', 'purchaseHint')}</CardContent></Card>}
  </Page>;
}
