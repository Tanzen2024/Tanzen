import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, ListOrdered, MoreVertical, Plus, Sparkles, Trash2, UserMinus, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DataTable, EmptyState, MemberAvatar, FilterBar, StatusBadge, PermissionGate, TourDateDisplay, ConfirmDialog, PositionInput } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTenant } from '@/contexts/tenant-context';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { members } from '@/mocks/organization/members';
import type { Tontine, TontineAdhesion } from '@/mocks/tontines/tontines';
import { suggestNextOccurrenceDate, type FrequencyConfig } from '@/mocks/tontines/tontine-frequency';
import { tontinesService } from '@/services/tontines.service';
import { AddAdherentsDialog } from './add-adherents-dialog';
import type { T } from './tontines-module';

export type MemberInfo = { firstName: string; lastName: string; photoUrl?: string };

type PlanRow = Awaited<ReturnType<typeof tontineOperationsService.listPlans>>[number];
type AdherentRow = { id: string; adhesion: TontineAdhesion; plan: PlanRow | undefined };

/**
 * « Adhérents + Ordre de passage » (SANS-ACHAT uniquement) — fusionne
 * l'ancien onglet « Planification » (mandat « supprimer complètement
 * l'onglet Planification ») DANS l'onglet Adhérents : une seule liste, la
 * position étant une colonne de plus, jamais un second écran. Rattachée
 * DIRECTEMENT à la Tontine, indépendante de la création des Tours.
 *
 * Chaque ligne = une `TontineAdhesion` (jamais un `Member` — deux
 * représentations du même membre restent deux lignes/positions distinctes,
 * mandat §15). Trois états par ligne :
 *  - active + position (non consommée) → `PositionInput`, attribution
 *    directe (mandat §2 : AUCUN glisser-déposer) ; `setPlanPosition`
 *    (service, une seule opération métier cohérente) recalcule
 *    automatiquement les autres positions.
 *  - active + position déjà consommée par un Tour → affichage statique,
 *    immuable (passé).
 *  - active SANS position (adhésion historique jamais planifiée, ou nouveau
 *    cycle qui repart sans planification héritée, mandat §21) → bouton « + »
 *    unitaire, ou complétion groupée via `completeOrderMutation`.
 *
 * L'AJOUT (`AddAdherentsDialog`, sans achat) crée déjà l'adhésion ET sa
 * position en une seule opération — aucune adhésion n'est donc plus jamais
 * censée rester durablement sans position, sauf cas hérité (nouveau cycle).
 */
export function AdherentsOrderPanel({ t, tontineId }: { t: T; tontineId: string }) {
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data: plans = [] } = useQuery({ queryKey: queryKeys.tontines.plans(tontineId), queryFn: () => tontineOperationsService.listPlans(currentTenant.id, tontineId) });
  const { data: adhesions = [] } = useQuery({ queryKey: queryKeys.tontines.adhesions(tontineId), queryFn: () => tontinesService.listAdhesions(currentTenant.id, tontineId) });
  const { data: allMembers = [] } = useQuery({ queryKey: ['organization', 'members', currentTenant.id], queryFn: () => Promise.resolve(members.filter((m) => m.tenantId === currentTenant.id)) });

  const memberById = useMemo(() => new Map<string, MemberInfo>(allMembers.map((m) => [m.id, { firstName: m.firstName, lastName: m.lastName, photoUrl: m.photoUrl }])), [allMembers]);
  const planByAdhesionId = useMemo(() => new Map(plans.map((p) => [p.adhesionId, p])), [plans]);
  const availableMembers = useMemo(() => allMembers.filter((m) => !adhesions.some((a) => a.memberId === m.id && a.status === 'active')), [allMembers, adhesions]);

  /** Nombre de représentations ACTIVES par membre — n'affiche `adhesionId` sur une ligne que si ce membre en a plusieurs (mandat §15 : jamais fusionner deux participations distinctes, mais jamais non plus encombrer l'affichage quand ce n'est pas nécessaire). */
  const activeCountByMemberId = useMemo(() => {
    const counts = new Map<string, number>();
    adhesions.forEach((adhesion) => { if (adhesion.status === 'active') counts.set(adhesion.memberId, (counts.get(adhesion.memberId) ?? 0) + 1); });
    return counts;
  }, [adhesions]);

  /**
   * Une ligne par adhésion — triée : positionnées (par position croissante),
   * puis actives SANS position, puis sorties (mandat §12/§24 : la recherche
   * ne renumérote jamais, elle ne fait QUE filtrer cette liste déjà triée).
   */
  const rows: AdherentRow[] = useMemo(() => {
    const withRank = adhesions.map((adhesion) => ({ id: adhesion.id, adhesion, plan: planByAdhesionId.get(adhesion.id) }));
    const rank = (row: AdherentRow) => (row.adhesion.status !== 'active' ? 2 : row.plan ? 0 : 1);
    return [...withRank].sort((a, b) => rank(a) - rank(b) || (a.plan && b.plan ? a.plan.position - b.plan.position : 0));
  }, [adhesions, planByAdhesionId]);

  const query = search.trim().toLowerCase();
  const filteredRows = query ? rows.filter((row) => row.adhesion.memberName.toLowerCase().includes(query)) : rows;

  /** Bornes valides d'une position réordonnable — jamais celles déjà consommées par un Tour (immuabilité du passé). */
  const reorderablePositions = useMemo(() => plans.filter((p) => !p.consumedByOccurrenceId).map((p) => p.position), [plans]);
  const minPosition = reorderablePositions.length > 0 ? Math.min(...reorderablePositions) : 1;
  const maxPosition = reorderablePositions.length > 0 ? Math.max(...reorderablePositions) : 1;

  /** Adhésions actives ENCORE sans position (mandat §21 : nouveau cycle qui repart sans planification héritée, ou donnée historique) — jamais comptées via `memberId`. */
  const unpositionedActiveIds = useMemo(() => rows.filter((row) => row.adhesion.status === 'active' && !row.plan).map((row) => row.adhesion.id), [rows]);

  const closeMutation = useMockMutation<Awaited<ReturnType<typeof tontinesService.closeAdhesion>>, string>({
    mutationFn: (adhesionId) => tontinesService.closeAdhesion(currentTenant.id, adhesionId, new Date().toISOString().slice(0, 10)),
    invalidateKeys: [queryKeys.tontines.adhesions(tontineId), queryKeys.tontines.summary(tontineId), queryKeys.tontines.planningStatus(tontineId), queryKeys.tontines.allContributionStatuses()],
    onSuccess: (result) => { if (result) notify.success(t('tontines', 'adhesionClosed')); },
  });

  /** Ajouter une représentation supplémentaire pour un membre déjà adhérent (Cas B, mandat « finalisation ») — combine désormais adhésion + position en une seule opération, comme `AddAdherentsDialog` (mandat « une seule interface : Adhérents + Ordre de passage »). */
  const addRepresentationMutation = useMockMutation<Awaited<ReturnType<typeof tontinesService.addAdhesion>>, string>({
    mutationFn: async (memberId) => {
      const adhesion = await tontinesService.addAdhesion(currentTenant.id, tontineId, memberId, new Date().toISOString().slice(0, 10));
      if (adhesion) await tontineOperationsService.addPlanEntries(currentTenant.id, tontineId, [adhesion.id]);
      return adhesion;
    },
    invalidateKeys: [queryKeys.tontines.adhesions(tontineId), queryKeys.tontines.summary(tontineId), queryKeys.tontines.planningStatus(tontineId), queryKeys.tontines.allContributionStatuses(), queryKeys.tontines.plans(tontineId)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'adhesionAddFailed')); return; } notify.success(t('tontines', 'representationAdded')); },
  });

  const removeMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.removePlanEntry>>, string>({
    mutationFn: (planId) => tontineOperationsService.removePlanEntry(currentTenant.id, planId),
    invalidateKeys: [queryKeys.tontines.plans(tontineId), queryKeys.tontines.planningStatus(tontineId)],
    onSuccess: (result) => { if (!result) notify.error(t('tontines', 'planRemoveFailed')); },
  });

  const setPositionMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.setPlanPosition>>, { planId: string; targetPosition: number }>({
    mutationFn: ({ planId, targetPosition }) => tontineOperationsService.setPlanPosition(currentTenant.id, tontineId, planId, targetPosition),
    invalidateKeys: [queryKeys.tontines.plans(tontineId), queryKeys.tontines.allContributionStatuses()],
    onSuccess: (result) => { if (!result) notify.error(t('tontines', 'planReorderFailed')); },
  });

  /** Position unitaire pour une adhésion historique/héritée d'un nouveau cycle — réutilise `addPlanEntries` (toujours en fin), jamais un second mécanisme. */
  const addToOrderMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.addPlanEntries>>, string[]>({
    mutationFn: (adhesionIds) => tontineOperationsService.addPlanEntries(currentTenant.id, tontineId, adhesionIds),
    invalidateKeys: [queryKeys.tontines.plans(tontineId), queryKeys.tontines.planningStatus(tontineId)],
    onSuccess: (result) => { if (!result || result.added.length === 0) notify.error(t('tontines', 'planAddFailed')); },
  });

  const columns = [
    {
      key: 'position', header: '#', className: 'w-20', render: (row: AdherentRow) => {
        if (row.adhesion.status !== 'active') return <span className="text-muted-foreground">—</span>;
        if (!row.plan) return <PermissionGate permission="beneficiaries.manage" fallback={<span className="text-muted-foreground">—</span>}>
          <Button variant="ghost" size="icon" aria-label={t('tontines', 'addToOrderAction')} disabled={addToOrderMutation.isPending} onClick={() => addToOrderMutation.mutate([row.adhesion.id])}><Plus size={14} /></Button>
        </PermissionGate>;
        if (row.plan.consumedByOccurrenceId) return <span className="font-mono text-xs text-muted-foreground">#{row.plan.position}</span>;
        return <PermissionGate permission="beneficiaries.manage" fallback={<span className="font-mono text-xs text-muted-foreground">#{row.plan.position}</span>}>
          <PositionInput
            value={row.plan.position} min={minPosition} max={maxPosition} disabled={setPositionMutation.isPending}
            onCommit={(targetPosition) => setPositionMutation.mutate({ planId: row.plan!.id, targetPosition })}
          />
        </PermissionGate>;
      },
    },
    {
      key: 'member', header: t('tontines', 'adherentColumn'), render: (row: AdherentRow) => {
        const label = row.adhesion.memberName;
        const member = memberById.get(row.adhesion.memberId);
        const showAdhesionId = (activeCountByMemberId.get(row.adhesion.memberId) ?? 0) > 1;
        return <span className="flex items-center gap-2">
          <MemberAvatar member={member ?? { firstName: label, lastName: '' }} size="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 truncate">{label}{row.adhesion.status !== 'active' && <StatusBadge label={t('tontines', 'exited')} tone="default" />}</span>
            {showAdhesionId && <span className="truncate text-[11px] text-muted-foreground">{row.adhesion.id}</span>}
          </span>
        </span>;
      },
    },
    {
      key: 'actions', header: '', className: 'w-12', render: (row: AdherentRow) => {
        if (row.plan?.consumedByOccurrenceId) return <StatusBadge label={t('tontines', 'planConsumed')} tone="default" />;
        return <PermissionGate permission="adhesions.manage">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('tontines', 'rowActionsMenu')}><MoreVertical size={15} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={addRepresentationMutation.isPending} onClick={() => addRepresentationMutation.mutate(row.adhesion.memberId)}><Plus size={14} />{t('tontines', 'addRepresentation')}</DropdownMenuItem>
              {row.plan && !row.plan.consumedByOccurrenceId && <DropdownMenuItem disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(row.plan!.id)}><Trash2 size={14} />{t('tontines', 'removePlanEntry')}</DropdownMenuItem>}
              {row.adhesion.status === 'active' && <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={closeMutation.isPending} onClick={() => closeMutation.mutate(row.adhesion.id)}><UserMinus size={14} />{t('tontines', 'closeAdhesion')}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </PermissionGate>;
      },
    },
  ];

  const positionedCount = plans.length;

  return <div className="space-y-4">
    <div>
      <p className="text-sm font-semibold text-foreground">{t('tontines', 'adherentsOrderTitle')}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('tontines', 'adherentsOrderSubtitle')}</p>
    </div>

    {rows.length === 0
      ? <EmptyState
          icon={UsersRound}
          title={t('tontines', 'noAdhesions')}
          action={<PermissionGate permission="adhesions.manage"><Button size="sm" onClick={() => setAddDialogOpen(true)}><Plus size={14} />{t('tontines', 'addAdherents')}</Button></PermissionGate>}
        />
      : <>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1"><FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'searchAdherentPlaceholder')} /></div>
          <PermissionGate permission="adhesions.manage"><Button size="sm" onClick={() => setAddDialogOpen(true)}><Plus size={14} />{t('tontines', 'add')}</Button></PermissionGate>
        </div>

        {unpositionedActiveIds.length > 1 && <PermissionGate permission="beneficiaries.manage">
          <Button variant="outline" size="sm" disabled={addToOrderMutation.isPending} onClick={() => addToOrderMutation.mutate(unpositionedActiveIds)}>
            <ListOrdered size={14} />{t('tontines', 'completeOrderAction', { count: String(unpositionedActiveIds.length) })}
          </Button>
        </PermissionGate>}

        <DataTable columns={columns} rows={filteredRows} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noPlanSearchResults')} />} />

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {unpositionedActiveIds.length > 0
            ? <><ListOrdered size={13} />{t('tontines', 'planPositionsCountWithRemaining', { planned: String(positionedCount), remaining: String(unpositionedActiveIds.length) })}</>
            : <><CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />{t('tontines', 'allParticipationsPlanned')}</>}
        </p>
      </>}

    <AddAdherentsDialog t={t} open={addDialogOpen} onOpenChange={setAddDialogOpen} tenantId={currentTenant.id} tontineId={tontineId} availableMembers={availableMembers} withPurchase={false} />
  </div>;
}

/**
 * Tours d'une Tontine — rattachés DIRECTEMENT à elle (restructuration : plus
 * de Période). « Ajouter un tour » est un acte manuel, unitaire, jamais une
 * génération en masse.
 *
 * Cycle système (mandat « recommencement automatique ») — TRANSPARENT pour
 * l'utilisateur : dès que toutes les participations éligibles ont déjà
 * bénéficié d'un Tour du cycle courant, « + Ajouter un tour » cède la place
 * au message + bouton « Démarrer un nouveau cycle » (libellés EXACTS du
 * mandat, jamais reformulés). Aucun numéro de cycle n'apparaît jamais ici.
 */
export function OccurrenceSection({ t, tontine }: { t: T; tontine: Tontine }) {
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: occurrences = [] } = useQuery({ queryKey: queryKeys.tontines.occurrences(tontine.id), queryFn: () => tontineOperationsService.listOccurrences(currentTenant.id, tontine.id) });
  const { data: cycleStatus } = useQuery({ queryKey: queryKeys.tontines.cycleStatus(tontine.id), queryFn: () => tontineOperationsService.getCycleStatus(currentTenant.id, tontine.id) });
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
  const startCycleMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.startNewCycle>>, void>({
    mutationFn: () => tontineOperationsService.startNewCycle(currentTenant.id, tontine.id),
    invalidateKeys: [queryKeys.tontines.occurrences(tontine.id), queryKeys.tontines.plans(tontine.id), queryKeys.tontines.cycleStatus(tontine.id), queryKeys.tontines.planningStatus(tontine.id)],
    onSuccess: (result) => { setConfirmOpen(false); if (!result) { notify.error(t('tontines', 'startNewCycleFailed')); return; } notify.success(t('tontines', 'startNewCycleSuccess')); },
  });
  return <div className="space-y-3">
    <div className="space-y-2">{occurrences.map((occurrence) => <button key={occurrence.id} type="button" onClick={() => navigate(`/tontines/${tontine.id}/occurrences/${occurrence.id}`)} className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"><span className="font-mono text-xs text-muted-foreground">#{occurrence.occurrenceNumber}</span><span className="flex-1"><TourDateDisplay value={occurrence.date} /></span><StatusBadge label={t('tontines', occurrence.status === 'REALIZED' ? 'occurrenceRealized' : 'occurrencePlanned')} tone={occurrence.status === 'REALIZED' ? 'success' : 'info'} /><ChevronRight size={14} /></button>)}{occurrences.length === 0 && <p className="text-xs text-muted-foreground">{t('tontines', 'noOccurrences')}</p>}</div>
    {cycleStatus?.complete
      ? <PermissionGate permission="tontines.update">
          <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
            <p className="text-sm text-foreground">{t('tontines', 'cycleCompleteMessage')}</p>
            <Button size="sm" onClick={() => setConfirmOpen(true)}><Sparkles size={14} />{t('tontines', 'startNewCycleAction')}</Button>
          </div>
        </PermissionGate>
      : <PermissionGate permission="tontines.update"><div className="flex flex-wrap items-end gap-2"><div className="space-y-1"><Label htmlFor={`occurrence-date-${tontine.id}`}>{t('tontines', 'occurrenceDate')}</Label><Input id={`occurrence-date-${tontine.id}`} type="date" value={effectiveDate} onChange={(event) => setDate(event.target.value)} /></div><Button size="sm" disabled={!effectiveDate || addMutation.isPending} onClick={() => addMutation.mutate()}><Plus size={14} />{t('tontines', 'addOccurrence')}</Button></div></PermissionGate>}
    <ConfirmDialog
      open={confirmOpen}
      title={t('tontines', 'startNewCycleConfirmTitle')}
      description={t('tontines', 'startNewCycleConfirmDescription')}
      confirmLabel={startCycleMutation.isPending ? t('tontines', 'saving') : t('tontines', 'startNewCycleConfirm')}
      cancelLabel={t('tontines', 'cancel')}
      confirmDisabled={startCycleMutation.isPending}
      onConfirm={() => startCycleMutation.mutate()}
      onCancel={() => setConfirmOpen(false)}
    />
  </div>;
}

