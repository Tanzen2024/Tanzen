import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ListOrdered, Plus, Repeat, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge, PermissionGate, DateDisplay } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { Tontine } from '@/mocks/tontines/tontines';
import { suggestNextOccurrenceDate, type FrequencyConfig } from '@/mocks/tontines/tontine-frequency';
import { tontinesService } from '@/services/tontines.service';
import type { T } from './tontines-module';

/**
 * Planification des positions (SANS-ACHAT uniquement) — rattachée
 * DIRECTEMENT à la Tontine (restructuration : plus de Période
 * intermédiaire), indépendante de la création des Tours.
 */
function PlanSection({ t, tontineId }: { t: T; tontineId: string }) {
  const { currentTenant } = useTenant();
  const { user } = usePermissions();
  const [memberId, setMemberId] = useState('');
  const [selectedA, setSelectedA] = useState('');
  const [selectedB, setSelectedB] = useState('');
  const { data: plans = [] } = useQuery({ queryKey: queryKeys.tontines.plans(tontineId), queryFn: () => tontineOperationsService.listPlans(currentTenant.id, tontineId) });
  const { data: adhesions = [] } = useQuery({ queryKey: queryKeys.tontines.adhesions(tontineId), queryFn: () => tontinesService.listAdhesions(currentTenant.id, tontineId) });
  const availableAdhesions = adhesions.filter((a) => a.status === 'active' && !plans.some((p) => p.adhesionId === a.id));

  const addMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.addPlanEntry>>, void>({
    mutationFn: () => tontineOperationsService.addPlanEntry(currentTenant.id, tontineId, memberId),
    invalidateKeys: [queryKeys.tontines.plans(tontineId)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'planAddFailed')); return; } setMemberId(''); },
  });
  const removeMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.removePlanEntry>>, string>({
    mutationFn: (planId) => tontineOperationsService.removePlanEntry(currentTenant.id, planId),
    invalidateKeys: [queryKeys.tontines.plans(tontineId)],
    onSuccess: (result) => { if (!result) notify.error(t('tontines', 'planRemoveFailed')); },
  });
  const permuteMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.requestPlanPermutation>>, void>({
    mutationFn: () => tontineOperationsService.requestPlanPermutation(currentTenant.id, { planAId: selectedA, planBId: selectedB, requestedBy: user.name, requestedByUserId: user.id }),
    invalidateKeys: [queryKeys.operations.workflowRequests(currentTenant.id)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'permutationRequestFailed')); return; } notify.success(t('tontines', 'permutationRequested')); setSelectedA(''); setSelectedB(''); },
  });

  return <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
    <p className="text-xs font-semibold text-muted-foreground">{t('tontines', 'planningSection')}</p>
    <div className="space-y-2">{plans.map((plan) => {
      const adhesion = adhesions.find((a) => a.id === plan.adhesionId);
      return <div key={plan.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
        <span className="font-mono text-xs text-muted-foreground">#{plan.position}</span>
        <span className="flex-1 truncate">{adhesion?.memberName ?? plan.adhesionId}</span>
        {plan.consumedByOccurrenceId ? <StatusBadge label={t('tontines', 'planConsumed')} tone="default" /> : <PermissionGate permission="beneficiaries.manage"><Button variant="ghost" size="icon" aria-label={t('tontines', 'removePlanEntry')} onClick={() => removeMutation.mutate(plan.id)}><Trash2 size={14} /></Button></PermissionGate>}
      </div>;
    })}{plans.length === 0 && <p className="text-xs text-muted-foreground">{t('tontines', 'noPlanEntries')}</p>}</div>
    <PermissionGate permission="beneficiaries.manage"><div className="flex flex-wrap items-end gap-2"><div className="min-w-48 space-y-1"><Label htmlFor={`plan-member-${tontineId}`}>{t('tontines', 'addToPlan')}</Label><select id={`plan-member-${tontineId}`} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">{t('tontines', 'selectAdhesion')}</option>{availableAdhesions.map((a) => <option key={a.id} value={a.id}>{a.memberName}</option>)}</select></div><Button size="sm" disabled={!memberId || addMutation.isPending} onClick={() => addMutation.mutate()}><Plus size={14} />{t('tontines', 'add')}</Button></div></PermissionGate>
    {plans.filter((p) => !p.consumedByOccurrenceId).length >= 2 && <PermissionGate permission="beneficiaries.manage"><div className="flex flex-wrap items-end gap-2 border-t border-border pt-3"><div className="min-w-40 space-y-1"><Label htmlFor={`permute-a-${tontineId}`}>{t('tontines', 'permutePositionA')}</Label><select id={`permute-a-${tontineId}`} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedA} onChange={(event) => setSelectedA(event.target.value)}><option value="">—</option>{plans.filter((p) => !p.consumedByOccurrenceId).map((p) => <option key={p.id} value={p.id}>#{p.position} · {adhesions.find((a) => a.id === p.adhesionId)?.memberName}</option>)}</select></div><div className="min-w-40 space-y-1"><Label htmlFor={`permute-b-${tontineId}`}>{t('tontines', 'permutePositionB')}</Label><select id={`permute-b-${tontineId}`} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedB} onChange={(event) => setSelectedB(event.target.value)}><option value="">—</option>{plans.filter((p) => !p.consumedByOccurrenceId && p.id !== selectedA).map((p) => <option key={p.id} value={p.id}>#{p.position} · {adhesions.find((a) => a.id === p.adhesionId)?.memberName}</option>)}</select></div><Button size="sm" variant="outline" disabled={!selectedA || !selectedB || permuteMutation.isPending} onClick={() => permuteMutation.mutate()}><Repeat size={14} />{t('tontines', 'requestPermutation')}</Button></div></PermissionGate>}
  </div>;
}

/** Tours d'une Tontine — rattachés DIRECTEMENT à elle (restructuration : plus de Période). « Ajouter un tour » est un acte manuel, unitaire, jamais une génération en masse. */
function OccurrenceSection({ t, tontine }: { t: T; tontine: Tontine }) {
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const { data: occurrences = [] } = useQuery({ queryKey: queryKeys.tontines.occurrences(tontine.id), queryFn: () => tontineOperationsService.listOccurrences(currentTenant.id, tontine.id) });
  /**
   * La Tontine ne porte aucune date propre (mandat suppression `startDate`) :
   * s'il n'existe encore AUCUN Tour, aucune date n'est jamais suggérée ni
   * inventée — l'utilisateur saisit librement la date du premier Tour. La
   * suggestion ne dérive QUE du dernier Tour déjà réellement créé + la
   * fréquence de la Tontine.
   */
  const lastDate = occurrences.length > 0 ? occurrences[occurrences.length - 1].date : undefined;
  const suggested = lastDate ? suggestNextOccurrenceDate(tontine as FrequencyConfig, lastDate) : null;
  const [date, setDate] = useState('');
  const effectiveDate = date || suggested || '';
  const addMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.createOccurrence>>, void>({
    mutationFn: () => tontineOperationsService.createOccurrence(currentTenant.id, tontine.id, effectiveDate),
    invalidateKeys: [queryKeys.tontines.occurrences(tontine.id)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'occurrenceAddFailed')); return; } notify.success(t('tontines', 'occurrenceAdded')); setDate(''); },
  });
  return <div className="space-y-3">
    <div className="space-y-2">{occurrences.map((occurrence) => <button key={occurrence.id} type="button" onClick={() => navigate(`/tontines/${tontine.id}/occurrences/${occurrence.id}`)} className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"><span className="font-mono text-xs text-muted-foreground">#{occurrence.occurrenceNumber}</span><span className="flex-1"><DateDisplay value={occurrence.date} /></span><StatusBadge label={t('tontines', occurrence.status === 'REALIZED' ? 'occurrenceRealized' : 'occurrencePlanned')} tone={occurrence.status === 'REALIZED' ? 'success' : 'info'} /><ChevronRight size={14} /></button>)}{occurrences.length === 0 && <p className="text-xs text-muted-foreground">{t('tontines', 'noOccurrences')}</p>}</div>
    <PermissionGate permission="tontines.update"><div className="flex flex-wrap items-end gap-2"><div className="space-y-1"><Label htmlFor={`occurrence-date-${tontine.id}`}>{t('tontines', 'occurrenceDate')}</Label><Input id={`occurrence-date-${tontine.id}`} type="date" value={effectiveDate} onChange={(event) => setDate(event.target.value)} /></div><Button size="sm" disabled={!effectiveDate || addMutation.isPending} onClick={() => addMutation.mutate()}><Plus size={14} />{t('tontines', 'addOccurrence')}</Button></div></PermissionGate>
  </div>;
}

/**
 * Bloc « Tours » + « Planification » de la fiche Tontine — rattachés
 * DIRECTEMENT à la Tontine, plus de liste de Périodes à parcourir
 * (restructuration : suppression totale de la notion de Période).
 */
export function TontineTours({ t, tontine }: { t: T; tontine: Tontine }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <div><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ListOrdered size={13} />{t('tontines', 'occurrencesLabel')}</p><OccurrenceSection t={t} tontine={tontine} /></div>
    {!tontine.withPurchase && <div><PlanSection t={t} tontineId={tontine.id} /></div>}
  </div>;
}

