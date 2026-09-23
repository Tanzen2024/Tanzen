import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { ConfirmDialog, MemberAvatar, PositionInput } from '@/components';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FilterBar } from '@/components/filter-bar';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { tontinesService } from '@/services/tontines.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { queryKeys } from '@/services/query-keys';
import type { Member } from '@/mocks/organization/members';
import type { T } from './tontines-module';

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

/** Correspond sur nom complet ET matricule — les seules informations Member déjà disponibles pertinentes pour retrouver un membre (mandat §6 : ne pas inventer de nouveaux champs de recherche). */
function matchesSearch(member: Member, query: string): boolean {
  if (!query) return true;
  const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
  return fullName.includes(query) || member.matricule.toLowerCase().includes(query);
}

/** Déplace l'id à `fromIndex` vers `toIndex` — même sémantique de « décalage automatique des autres » que `setPlanPosition` côté service, mais appliquée ici à l'état LOCAL `order` (rien n'est encore persisté). Jamais une seconde logique de recalcul : un simple déplacement dans le tableau, exactement ce qu'exprime déjà `positionByMemberId` (le rang = l'index + 1). */
function moveInOrder(order: string[], fromIndex: number, toIndex: number): string[] {
  const next = [...order];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Dialog d'ajout multiple d'adhérents (mandat « ajout multiple d'adhérents à
 * une tontine »), remplace l'ancien `<select>` un-membre-à-la-fois. Couvre
 * aussi nativement le cas d'un seul membre (mandat §21) — une seule
 * interface pour les deux cas, jamais deux composants distincts.
 *
 * Refonte « ordre de sélection = ordre de passage », puis « position
 * directement modifiable dans le Dialog » (Tontine SANS ACHAT uniquement,
 * `withPurchase` prop) — AUCUNE seconde section « Ordre de passage » : la
 * position d'une participation est son RANG dans `order` (le tableau EST la
 * source de vérité, `positionByMemberId` = index + 1), affichée comme un
 * `PositionInput` compact directement dans la ligne de sélection. Éditer ce
 * champ déplace l'id dans `order` (`moveInOrder`) — le décalage des AUTRES
 * positions est une simple CONSÉQUENCE de cette réindexation, jamais un
 * second calcul. Les lignes sélectionnées s'affichent TRIÉES par position
 * (l'utilisateur voit l'ordre réel qui sera enregistré), les non
 * sélectionnées suivent, dans leur ordre de liste d'origine.
 *
 * Une désélection puis resélection place le membre à la FIN de `order`
 * (mandat « dernier arrivé, dernière position »), jamais son ancien rang.
 *
 * À la validation, enchaîne les DEUX opérations métier déjà existantes —
 * jamais un second système d'adhésion/planification, et UN SEUL bouton
 * (mandat « supprimer l'onglet Planification » §8 : plus de choix
 * « ajouter seulement » vs « ajouter et planifier », la position est
 * désormais toujours automatique, sans exception) :
 *   1. `tontinesService.addAdhesions` (création des `TontineAdhesion`) ;
 *   2. `tontineOperationsService.addPlanEntries` (positions, sur les
 *      `adhesionId` fraîchement créés, dans l'ordre choisi, toujours ajoutées
 *      en fin de planification existante) ; réordonner après coup reste le
 *      rôle de l'onglet Adhérents (`AdherentsOrderPanel`/`PositionInput`,
 *      l'ancien onglet Planification ayant disparu).
 *
 * « Avec achat » (`withPurchase = true`) conserve EXACTEMENT le comportement
 * historique — un seul bouton, aucune pastille de position, aucun ordre de
 * passage (mandat §18 : sans objet pour ce mode).
 *
 * La sélection est un état totalement indépendant du texte de recherche :
 * filtrer la liste affichée ne touche jamais à `order` (mandat §8 — la
 * recherche ne doit jamais faire perdre la sélection, même entre plusieurs
 * recherches successives sur des membres différents).
 *
 * `availableMembers` est calculé par l'appelant (`AdhesionsPanel`, déjà
 * filtré tenant + non-adhérents actifs) — ce composant ne recalcule rien,
 * il ne fait qu'afficher/sélectionner/soumettre.
 */
export function AddAdherentsDialog({ t, open, onOpenChange, tenantId, tontineId, availableMembers, withPurchase }: {
  t: T;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tontineId: string;
  availableMembers: Member[];
  withPurchase: boolean;
}) {
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<string[]>([]);

  // Repart d'un état vierge à chaque ouverture — jamais la sélection/ordre/recherche d'une session d'ajout précédente.
  useEffect(() => {
    if (!open) return;
    setSearch('');
    setOrder([]);
  }, [open]);

  const selected = useMemo(() => new Set(order), [order]);
  /** Rang de sélection de chaque membre (1-indexé) — la SEULE source de la position affichée, jamais une valeur saisie. */
  const positionByMemberId = useMemo(() => new Map(order.map((id, index) => [id, index + 1])), [order]);

  const filteredMembers = useMemo(() => {
    const query = normalizeSearchText(search);
    return availableMembers.filter((member) => matchesSearch(member, query));
  }, [availableMembers, search]);

  /** Ordre d'AFFICHAGE — sélectionnés triés par position croissante en tête (l'utilisateur voit l'ordre réel qui sera enregistré), non sélectionnés ensuite dans leur ordre de liste d'origine (tri stable). Ne modifie jamais `order` lui-même, purement un tri d'affichage. */
  const sortedFilteredMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      const posA = positionByMemberId.get(a.id);
      const posB = positionByMemberId.get(b.id);
      if (posA !== undefined && posB !== undefined) return posA - posB;
      if (posA !== undefined) return -1;
      if (posB !== undefined) return 1;
      return 0;
    });
  }, [filteredMembers, positionByMemberId]);

  /** Désélection puis resélection = nouvelle entrée en FIN de `order` (mandat §6) — jamais une réinsertion à l'ancien rang. */
  const toggleMember = (memberId: string) => setOrder((current) => (current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]));

  /**
   * « Tout sélectionner » ne porte QUE sur la liste actuellement filtrée par
   * la recherche (mandat §8) : une recherche active puis « Tout sélectionner »
   * n'affecte jamais les membres déjà sélectionnés mais masqués par le filtre
   * courant. Ordre attribué : L'ORDRE COURANT DE LA LISTE affichée
   * (`filteredMembers`, lui-même l'ordre de `availableMembers` fourni par
   * l'appelant) — stable et explicite (mandat §10), jamais présenté comme un
   * ordre métier choisi par l'utilisateur : les nouveaux ids s'ajoutent en
   * fin de `order` dans CET ordre de liste, pas un ordre aléatoire.
   */
  const filteredIds = useMemo(() => filteredMembers.map((member) => member.id), [filteredMembers]);
  const selectedFilteredCount = filteredIds.filter((id) => selected.has(id)).length;
  const allFilteredSelected = filteredIds.length > 0 && selectedFilteredCount === filteredIds.length;
  const someFilteredSelected = selectedFilteredCount > 0 && !allFilteredSelected;
  const toggleSelectAllFiltered = () => setOrder((current) => {
    if (allFilteredSelected) return current.filter((id) => !filteredIds.includes(id));
    const toAdd = filteredIds.filter((id) => !current.includes(id));
    return [...current, ...toAdd];
  });
  const selectAllLabel = allFilteredSelected
    ? t('tontines', 'deselectAll')
    : search.trim()
      ? t('tontines', 'selectAllResults', { count: String(filteredIds.length) })
      : t('tontines', 'selectAll');

  const addOnlyMutation = useMockMutation<Awaited<ReturnType<typeof tontinesService.addAdhesions>>, string[]>({
    mutationFn: (memberIds) => tontinesService.addAdhesions(tenantId, tontineId, memberIds, new Date().toISOString().slice(0, 10)),
    invalidateKeys: [queryKeys.tontines.adhesions(tontineId), queryKeys.tontines.summary(tontineId), queryKeys.tontines.planningStatus(tontineId), queryKeys.tontines.allContributionStatuses()],
    /**
     * Retour EXACT du résultat réel (mandat §12-§17) — jamais déduit de
     * `order.length` : `created.length` peut être strictement inférieur au
     * nombre demandé (cas partiel) ou nul. Le Dialog ne se ferme QUE si au
     * moins une adhésion a réellement été créée — sur échec total, l'
     * utilisateur reste dans le Dialog pour corriger/réessayer.
     */
    onSuccess: ({ created, skipped }) => {
      if (created.length === 0) { notify.error(skipped === 1 ? t('tontines', 'noAdherentsAddedOne') : t('tontines', 'noAdherentsAdded')); return; }
      notify.success(created.length === 1 ? t('tontines', 'adhesionAdded') : t('tontines', 'adhesionsAddedCount', { count: String(created.length) }));
      if (skipped > 0) notify.error(skipped === 1 ? t('tontines', 'oneMemberNotAdded') : t('tontines', 'membersNotAddedCount', { count: String(skipped) }));
      onOpenChange(false);
    },
  });

  /**
   * Sans achat — TOUJOURS combiné (mandat « une seule interface, un seul
   * bouton ») : enchaîne `addAdhesions` PUIS `addPlanEntries` sur les
   * `adhesionId` fraîchement créés (jamais une deuxième adhésion, mandat
   * §13/§16), dans l'ordre de sélection, toujours en fin de planification
   * existante — réutilise intégralement `addPlanEntries` (mandat §15).
   */
  const addAndPlanMutation = useMockMutation<
    { created: Awaited<ReturnType<typeof tontinesService.addAdhesions>>['created']; skipped: number; planned: Awaited<ReturnType<typeof tontineOperationsService.addPlanEntries>> },
    string[]
  >({
    mutationFn: async (memberIds) => {
      const { created, skipped } = await tontinesService.addAdhesions(tenantId, tontineId, memberIds, new Date().toISOString().slice(0, 10));
      if (created.length === 0) return { created, skipped, planned: { added: [], skipped: 0 } };
      const planned = await tontineOperationsService.addPlanEntries(tenantId, tontineId, created.map((adhesion) => adhesion.id));
      return { created, skipped, planned };
    },
    invalidateKeys: [queryKeys.tontines.adhesions(tontineId), queryKeys.tontines.summary(tontineId), queryKeys.tontines.planningStatus(tontineId), queryKeys.tontines.allContributionStatuses(), queryKeys.tontines.plans(tontineId)],
    onSuccess: ({ created, skipped, planned }) => {
      if (created.length === 0) { notify.error(skipped === 1 ? t('tontines', 'noAdherentsAddedOne') : t('tontines', 'noAdherentsAdded')); return; }
      notify.success(created.length === 1 ? t('tontines', 'adhesionAddedAndPlanned') : t('tontines', 'adhesionsAddedAndPlannedCount', { count: String(created.length) }));
      if (skipped > 0) notify.error(skipped === 1 ? t('tontines', 'oneMemberNotAdded') : t('tontines', 'membersNotAddedCount', { count: String(skipped) }));
      if (planned.added.length < created.length) notify.error(t('tontines', 'somePlannedFailed'));
      onOpenChange(false);
    },
  });

  const isPending = addOnlyMutation.isPending || addAndPlanMutation.isPending;
  const confirmLabel = withPurchase
    ? (order.length === 0 ? t('tontines', 'addAdherents') : order.length === 1 ? t('tontines', 'addAdherentsButtonOne') : t('tontines', 'addAdherentsButtonMany', { count: String(order.length) }))
    : (order.length === 0 ? t('tontines', 'add') : t('tontines', 'addButtonCount', { count: String(order.length) }));

  return <ConfirmDialog
    open={open}
    title={t('tontines', 'addAdherentsTitle')}
    description={t('tontines', withPurchase ? 'addAdherentsDescription' : 'addAndPlanDescription')}
    confirmLabel={isPending ? t('tontines', 'saving') : confirmLabel}
    confirmDisabled={order.length === 0 || isPending}
    cancelLabel={t('tontines', 'cancel')}
    onConfirm={() => (withPurchase ? addOnlyMutation.mutate(order) : addAndPlanMutation.mutate(order))}
    onCancel={() => onOpenChange(false)}
  >
    <div className="mt-4 space-y-3 text-left">
      <FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'searchMemberPlaceholder')} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {filteredMembers.length === 1 ? t('tontines', 'oneMemberAvailable') : t('tontines', 'membersAvailableCount', { count: String(filteredMembers.length) })}
        </p>
        {filteredMembers.length > 0 && <button type="button" onClick={toggleSelectAllFiltered} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          <Checkbox checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false} onCheckedChange={toggleSelectAllFiltered} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
          {selectAllLabel}
        </button>}
      </div>

      <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {sortedFilteredMembers.map((member) => {
          const isSelected = selected.has(member.id);
          const position = positionByMemberId.get(member.id);
          return <div
            key={member.id}
            className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${isSelected ? 'border-primary/30 bg-primary/5' : 'border-transparent hover:bg-muted'}`}
          >
            <button type="button" onClick={() => toggleMember(member.id)} aria-pressed={isSelected} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              <Checkbox checked={isSelected} onCheckedChange={() => toggleMember(member.id)} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
              <MemberAvatar member={member} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{member.firstName} {member.lastName}</span>
                {member.matricule && <span className="block truncate text-xs text-muted-foreground">{member.matricule}</span>}
              </span>
            </button>
            {/* Position directement modifiable (mandat « Ajouter des adhérents + position ») — SANS ACHAT uniquement, seulement pour une ligne sélectionnée. Un déplacement ici RÉORDONNE `order` (`moveInOrder`) ; le décalage des autres positions n'est qu'une conséquence de cette réindexation, jamais un second calcul. */}
            {!withPurchase && isSelected && position !== undefined && <PositionInput
              value={position} min={1} max={order.length} clampOutOfRange disabled={isPending}
              onCommit={(next) => setOrder((current) => moveInOrder(current, current.indexOf(member.id), next - 1))}
              aria-label={t('tontines', 'passagePositionLabel')}
            />}
          </div>;
        })}
        {filteredMembers.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('tontines', 'noMemberAvailable')}</p>}
      </div>

      {/* Résumé très simple (mandat §11) — jamais une deuxième liste complète des sélectionnés. */}
      {selected.size > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
        <p className="flex items-center gap-1 text-sm font-medium text-foreground"><Check size={14} className="text-primary" />{selected.size === 1 ? t('tontines', 'oneSelected') : t('tontines', 'selectedCount', { count: String(selected.size) })}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOrder([])}>{t('tontines', 'clearSelection')}</Button>
      </div>}
    </div>
  </ConfirmDialog>;
}
