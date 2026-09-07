/**
 * Écran « Gestion des opérations » (mandat « retirer Cycle/Type des
 * critères + Matricule des tableaux ») — les Critères d'affichage
 * contiennent exactement deux champs : Tontine (`tontineId`/`setTontineId`,
 * alimentée uniquement par `tontinesService.listTontines(currentTenant.id)`,
 * jamais `Account`) et Période, les occurrences réelles de CETTE Tontine
 * (`tontineTurnsService.listOccurrencesByTontine`), désactivée tant
 * qu'aucune Tontine n'est choisie. `Tontine.frequency`/`Tontine.valueType`
 * ne sont plus affichés comme critères, mais restent utilisés tels quels
 * ailleurs dans ce composant (`isMoney`/`formatValue`/dialogues) — seule
 * leur présentation en critère graphique disparaît, jamais le modèle.
 * Changer de Tontine réinitialise `occurrenceId` — aucune donnée de
 * l'ancienne Tontine ne doit rester affichée. Les tableaux « Cotisations
 * des adhérents » et « Bénéficiaire de la séance » n'affichent plus de
 * colonne Matricule (le champ `Member.matricule` reste inchangé côté
 * modèle, seul son rendu dans ces deux tableaux disparaît).
 *
 * « Participation » (toggle payé/non payé) réutilise deux mutations déjà
 * exposées par le service, jamais une troisième règle inventée :
 * `createContribution` (si aucune Contribution n'existe encore pour cette
 * adhésion+occurrence) puis `recordContributionPayment` — un montant
 * positif pour atteindre le montant attendu (payer), un montant négatif
 * pour revenir à zéro (dépayer), la même fonction gérant déjà correctement
 * l'arithmétique et le recalcul de `status` dans les deux sens. L'action
 * globale « Marquer tous comme payés/non payés » appelle la même fonction
 * partagée (`applyParticipation`) ligne par ligne — jamais une deuxième
 * logique métier.
 *
 * « Ajouter un bénéficiaire » compose ici, dans un seul dialogue, les deux
 * mêmes mutations déjà utilisées ailleurs : `addBeneficiaries` (désignation,
 * rattachée directement à l'Occurrence, mandat « suppression complète de la
 * logique Cycle/Tour ») puis `recordReception` (première réception, même
 * fonction que le bouton « Modifier » d'une ligne) — aucune troisième règle
 * métier n'est inventée, seule la séquence d'appel est assemblée côté UI. Le
 * retrait réutilise `removeBeneficiary` (refuse toute opération déjà
 * enregistrée — jamais une suppression aveugle d'historique), via la même
 * mutation que l'icône de suppression par ligne, simplement précédée d'un
 * sélecteur quand il est déclenché depuis la barre d'actions plutôt que
 * depuis une ligne précise. Aucun tirage automatique, aucune permutation
 * directe : une modification d'affectation passe toujours par
 * `requestBeneficiaryPermutation`/le workflow WD-006 existant, jamais ce
 * formulaire.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Download, Lock, Pencil, Plus, RefreshCw, Trash2, UserPlus, UsersRound, X } from 'lucide-react';
import { PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, PermissionGate, TableSkeleton, ErrorState, FieldError, MemberAvatar, ConfirmDialog } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { tontineTurnsService, type ReceptionInput, type BeneficiaryInput } from '@/services/tontine-turns.service';
import { tontinesService } from '@/services/tontines.service';
import { organizationService } from '@/services/organization.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { isAdhesionActiveAt, type ContributionStatus } from '@/mocks/tontines/tontine-occurrences';
import type { TableColumn } from '@/types/ui';
import { formatValue as formatDomainValue } from './value-format';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const CONTRIBUTION_TONE: Record<ContributionStatus, 'default' | 'success' | 'warning'> = { PENDING: 'default', PARTIAL: 'warning', PAID: 'success', WAIVED: 'default' };
/** Libellés du badge « Statut » — PENDING affiche « Non payé » (mandat « critères Cycle/Période/Type » §3, capture jointe) plutôt que la clé partagée `statusReceptionPending` (« En attente »), qui reste utilisée telle quelle ailleurs (statut de réception d'un bénéficiaire) : une clé dédiée pour ne jamais changer ce texte partagé par effet de bord. */
const CONTRIBUTION_LABEL_KEY: Record<ContributionStatus, string> = { PENDING: 'contributionUnpaidLabel', PARTIAL: 'statusReceptionPartial', PAID: 'statusPaid', WAIVED: 'statusWaived' };
/** Couleur du montant réglé par ligne : vert si réglé, rouge si rien n'a encore été réglé — distincte du badge Statut (plus neutre, `CONTRIBUTION_TONE`). */
const CONTRIBUTION_TEXT_TONE: Record<ContributionStatus, string> = { PENDING: 'text-destructive font-medium', PARTIAL: 'text-amber-700 dark:text-amber-400 font-medium', PAID: 'text-emerald-700 dark:text-emerald-400 font-medium', WAIVED: 'text-muted-foreground' };

/** `embedded` — quand ce composant est monté dans l'onglet « Opérations » de `TontinesOverview` (qui porte déjà son propre PageHeader/`max-w`/padding), on ne rend que le contenu, jamais un second en-tête/conteneur imbriqué ; la route autonome `/tontines/operations` continue de fournir son propre en-tête complet comme avant. */
function Page({ t, title, description, embedded, children }: { t: T; title: string; description?: string; embedded?: boolean; children: ReactNode }) {
  const navigate = useNavigate();
  if (embedded) return <div className="space-y-6">{children}</div>;
  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="TONTINES" title={title} description={description} actions={<Button variant="ghost" size="sm" onClick={() => navigate('/tontines')}><ArrowLeft size={15} />{t('tontines', 'backToTontines')}</Button>} />{children}</div>;
}
/** Indicateur fortement surligné — vert = crédit/réglé, rouge = dette/reste dû, neutre = rien à signaler. */
function BalanceBox({ label, value, tone }: { label: string; value: string; tone: 'success' | 'error' | 'neutral' }) {
  const toneClass = tone === 'success' ? 'border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
    : tone === 'error' ? 'border-rose-400 bg-rose-100 text-rose-900 dark:border-rose-700 dark:bg-rose-900 dark:text-rose-200'
    : 'border-border bg-muted text-muted-foreground';
  return <div className={`rounded-lg border px-5 py-3 ${toneClass}`}><p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p><p className="mt-0.5 text-xl font-bold">{value}</p></div>;
}

/** Sérialisation CSV minimale du tableau visible — aucune infrastructure d'export réutilisable n'existe ailleurs dans TANZEN, donc pas de « moteur parallèle » à éviter ici, seulement un gestionnaire de clic auto-suffisant. */
function exportRowsToCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function TontineOperationsManage({ t, embedded }: { t: T; embedded?: boolean }) {
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManageContributions = can('contributions.manage');

  const { data: tontines = [], isLoading: isTontinesLoading, isError: isTontinesError, refetch: refetchTontines } = useQuery({ queryKey: queryKeys.tontines.list(currentTenant.id), queryFn: () => tontinesService.listTontines(currentTenant.id) });
  const [tontineId, setTontineId] = useState('');
  const tontine = tontines.find((item) => item.id === tontineId);

  /**
   * « Période » = les occurrences réelles de LA Tontine sélectionnée
   * (`listOccurrencesByTontine`, déjà utilisé ailleurs pour peupler un
   * sélecteur d'occurrence directement depuis une Tontine, `contributions-
   * module.tsx`) — jamais un sélecteur de Période calendaire séparé, jamais
   * tenant-wide. Désactivé tant qu'aucune Tontine n'est choisie.
   */
  const { data: occurrences = [], isLoading: isOccurrencesLoading } = useQuery({ queryKey: ['tontines', 'occurrences-by-tontine', tontineId, currentTenant.id], queryFn: () => tontineTurnsService.listOccurrencesByTontine(currentTenant.id, tontineId), enabled: Boolean(tontineId) });
  const [occurrenceId, setOccurrenceId] = useState('');
  const [search, setSearch] = useState('');

  const occurrence = occurrences.find((item) => item.id === occurrenceId);
  const periodId = occurrence?.periodId ?? '';
  /** Placeholder explicite — jamais une liste vide sans explication : distingue absence de Tontine / chargement en cours / aucune donnée / invite à sélectionner. */
  const occurrencePlaceholder = !tontineId ? t('tontines', 'selectPeriod') : isOccurrencesLoading ? t('tontines', 'loadingOptionsLabel') : occurrences.length === 0 ? t('tontines', 'noPeriodsAvailable') : t('tontines', 'selectPeriod');

  const { data: adhesions = [] } = useQuery({ queryKey: ['tontines', 'period-adhesions', periodId, currentTenant.id], queryFn: () => tontineTurnsService.listAdhesionsByPeriod(currentTenant.id, periodId), enabled: Boolean(periodId) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id), enabled: Boolean(periodId) });
  const { data: contributions = [] } = useQuery({ queryKey: ['tontines', 'contributions-by-occurrence', occurrenceId, currentTenant.id], queryFn: () => tontineTurnsService.listContributionsByOccurrence(currentTenant.id, occurrenceId), enabled: Boolean(occurrenceId) });
  const { data: beneficiaries = [] } = useQuery({ queryKey: ['tontines', 'occurrence-beneficiaries', occurrenceId, currentTenant.id], queryFn: () => tontineTurnsService.listBeneficiariesByOccurrence(currentTenant.id, occurrenceId), enabled: Boolean(occurrenceId) });
  const { data: financials } = useQuery({ queryKey: ['tontines', 'occurrence-financial-summary', occurrenceId, currentTenant.id], queryFn: () => tontineTurnsService.getOccurrenceFinancialSummary(currentTenant.id, occurrenceId), enabled: Boolean(occurrenceId) });

  const memberById = useMemo(() => new Map(members.map((item) => [item.id, item])), [members]);
  const adhesionById = useMemo(() => new Map(adhesions.map((item) => [item.id, item])), [adhesions]);
  const contributionByAdhesionId = useMemo(() => new Map(contributions.map((item) => [item.adhesionId, item])), [contributions]);

  const referenceDate = occurrence?.actualDate ?? occurrence?.plannedDate;
  const isMoney = tontine?.valueType === 'MONEY';
  const isWithPurchase = isMoney && tontine?.purchaseMode === 'WITH_PURCHASE';
  /** Réutilise le formateur MONEY/GOODS déjà partagé par les autres écrans Tontines (`./value-format`) — jamais une devise/quantité recalculée localement. */
  const formatValue = (value: number) => formatDomainValue(tontine?.valueType ?? 'MONEY', value, value, tontine?.item, isMoney ? tontine?.currency : tontine?.unit);

  /** MONEY porte `expectedAmount`/`paidAmount`, GOODS porte `expectedQuantity`/`paidQuantity` (même distinction déjà appliquée par `recordContributionPayment`/`computeBeneficiaryStatus`). */
  const contributionDue = (contribution: (typeof contributions)[number]) => contribution.valueType === 'MONEY' ? contribution.expectedAmount : contribution.expectedQuantity;
  const contributionPaid = (contribution: (typeof contributions)[number]) => contribution.valueType === 'MONEY' ? contribution.paidAmount : contribution.paidQuantity;

  const allRows = adhesions
    .filter((adhesion) => adhesion.status === 'active')
    .map((adhesion) => ({ id: adhesion.id, adhesion, contribution: contributionByAdhesionId.get(adhesion.id) }));
  /** « Montant à régler » (mandat §4) — préempli depuis la configuration réelle de la Tontine (`contributionAmount`/MONEY, `quantity`/GOODS) tant qu'aucune Contribution n'existe encore pour cette adhésion+occurrence ; une fois la Contribution créée, sa propre valeur figée (`expectedAmount`/`expectedQuantity`) prévaut, jamais recalculée après coup. */
  const rowDue = (row: (typeof allRows)[number]) => row.contribution ? (contributionDue(row.contribution) ?? 0) : ((isMoney ? tontine?.contributionAmount : tontine?.quantity) ?? 0);
  const rowPaid = (row: (typeof allRows)[number]) => row.contribution ? (contributionPaid(row.contribution) ?? 0) : 0;
  const rowStatus = (row: (typeof allRows)[number]): ContributionStatus => row.contribution?.status ?? 'PENDING';
  const rowIsPaid = (row: (typeof allRows)[number]) => rowStatus(row) === 'PAID';

  /**
   * Applique/retire la participation d'un adhérent pour l'occurrence
   * sélectionnée (mandat §5-§8) — SEULE fonction qui mute une Contribution
   * ici, appelée aussi bien par le toggle individuel que par l'action
   * globale (jamais une deuxième logique). Composition de deux mutations
   * déjà exposées par le service :
   * - `markPaid` sans Contribution existante : `createContribution` (préremplie
   *   depuis `Tontine.contributionAmount`/`quantity`) puis `recordContributionPayment`
   *   pour la différence restant à régler.
   * - `markPaid` avec Contribution déjà PARTIAL/PENDING : seul le complément
   *   (`due - paid`) est réglé, jamais un doublon du montant déjà versé.
   * - `!markPaid` : un paiement du montant négatif du solde déjà réglé
   *   (`-paidAmount`) ramène `paidAmount`/`paidQuantity` à 0 — `status`
   *   redevient PENDING via le même calcul déjà fait par
   *   `recordContributionPayment`, sans réécrire ni supprimer l'historique
   *   des versements (chaque entrée, positive ou négative, reste tracée dans
   *   `payments[]`, conforme à l'immuabilité déjà appliquée ailleurs).
   * Refuse (retourne false) pour une Contribution WAIVED, exactement comme
   * `recordContributionPayment` le fait déjà.
   */
  async function applyParticipation(row: (typeof allRows)[number], markPaid: boolean): Promise<boolean> {
    let contribution = row.contribution;
    if (markPaid) {
      if (!contribution) {
        const created = await tontineTurnsService.createContribution(currentTenant.id, {
          adhesionId: row.adhesion.id,
          tontineOccurrenceId: occurrenceId,
          valueType: tontine!.valueType,
          expectedAmount: isMoney ? tontine!.contributionAmount : undefined,
          currency: isMoney ? tontine!.currency : undefined,
          expectedQuantity: !isMoney ? tontine!.quantity : undefined,
          item: !isMoney ? tontine!.item : undefined,
          unit: !isMoney ? tontine!.unit : undefined,
        });
        if (!created) return false;
        contribution = created;
      }
      const delta = (contributionDue(contribution) ?? 0) - (contributionPaid(contribution) ?? 0);
      if (delta > 0) {
        const updated = await tontineTurnsService.recordContributionPayment(currentTenant.id, contribution.id, isMoney ? { amount: delta } : { quantity: delta });
        if (!updated) return false;
      }
      return true;
    }
    if (!contribution) return true;
    const paidSoFar = contributionPaid(contribution) ?? 0;
    if (paidSoFar > 0) {
      const updated = await tontineTurnsService.recordContributionPayment(currentTenant.id, contribution.id, isMoney ? { amount: -paidSoFar } : { quantity: -paidSoFar });
      if (!updated) return false;
    }
    return true;
  }

  const toggleParticipationMutation = useMockMutation<boolean, { row: (typeof allRows)[number]; markPaid: boolean }>({
    mutationFn: ({ row, markPaid }) => applyParticipation(row, markPaid),
    invalidateKeys: [['tontines', 'contributions-by-occurrence', occurrenceId, currentTenant.id]],
    onSuccess: (ok) => { if (!ok) notify.error(t('tontines', 'fieldRequired')); },
  });
  /** Action globale (mandat §6-§7) — même fonction `applyParticipation` que le toggle individuel, appliquée à chaque adhérent dont l'état diffère déjà de la cible (jamais un doublon de paiement sur une ligne déjà à jour). */
  const globalParticipationMutation = useMockMutation<boolean, boolean>({
    mutationFn: async (markPaid) => {
      const results = await Promise.all(allRows.filter((row) => rowIsPaid(row) !== markPaid).map((row) => applyParticipation(row, markPaid)));
      return results.every(Boolean);
    },
    invalidateKeys: [['tontines', 'contributions-by-occurrence', occurrenceId, currentTenant.id]],
    onSuccess: (ok) => { if (!ok) notify.error(t('tontines', 'fieldRequired')); },
  });

  const [operationTarget, setOperationTarget] = useState<(typeof beneficiaries)[number] | null>(null);
  const [netValue, setNetValue] = useState('');
  const [purchaseValue, setPurchaseValue] = useState('');
  const [operationError, setOperationError] = useState<string | undefined>();
  const [purchaseError, setPurchaseError] = useState<string | undefined>();
  const operationMutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.recordReception>>, ReceptionInput>({
    mutationFn: (input) => tontineTurnsService.recordReception(currentTenant.id, operationTarget!.id, input),
    invalidateKeys: [['tontines', 'occurrence-beneficiaries', occurrenceId, currentTenant.id], ['tontines', 'occurrence-financial-summary', occurrenceId, currentTenant.id]],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'fieldRequired')); return; }
      notify.success(t('tontines', 'operationRecorded'));
      setOperationTarget(null); setNetValue(''); setPurchaseValue(''); setOperationError(undefined); setPurchaseError(undefined);
    },
  });

  const [removeTarget, setRemoveTarget] = useState<(typeof beneficiaries)[number] | null>(null);
  const [removePickerOpen, setRemovePickerOpen] = useState(false);
  const [removePickerId, setRemovePickerId] = useState('');
  const removeMutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.removeBeneficiary>>, string>({
    mutationFn: (beneficiaryId) => tontineTurnsService.removeBeneficiary(currentTenant.id, beneficiaryId),
    invalidateKeys: [['tontines', 'occurrence-beneficiaries', occurrenceId, currentTenant.id], ['tontines', 'occurrence-financial-summary', occurrenceId, currentTenant.id]],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'cannotRemoveBeneficiary')); setRemoveTarget(null); return; }
      notify.success(t('tontines', 'beneficiaryRemoved'));
      setRemoveTarget(null); setRemovePickerOpen(false); setRemovePickerId('');
    },
  });

  /**
   * « Ajouter un bénéficiaire » : compose deux appels déjà exposés par le
   * service, jamais une nouvelle règle — `addBeneficiaries` désigne
   * l'adhésion (crée l'OccurrenceBeneficiary), puis `recordReception`
   * enregistre immédiatement la première réception si un montant/quantité a
   * été saisi dans le même dialogue.
   */
  const [addOpen, setAddOpen] = useState(false);
  const [addAdhesionId, setAddAdhesionId] = useState('');
  const [addNetValue, setAddNetValue] = useState('');
  const [addPurchaseValue, setAddPurchaseValue] = useState('');
  const [addAdhesionError, setAddAdhesionError] = useState<string | undefined>();
  const [addNetError, setAddNetError] = useState<string | undefined>();
  const [addPurchaseError, setAddPurchaseError] = useState<string | undefined>();
  const addMutation = useMockMutation<Awaited<ReturnType<typeof tontineTurnsService.recordReception>>, { adhesionId: string; net: string; purchase: string }>({
    mutationFn: async ({ adhesionId, net, purchase }) => {
      const valueType = tontine!.valueType;
      const added = await tontineTurnsService.addBeneficiaries(currentTenant.id, occurrenceId, {
        adhesionIds: [adhesionId], valueType,
        expectedAmount: valueType === 'MONEY' ? Number(net) || 0 : undefined,
        expectedQuantity: valueType === 'GOODS' ? Number(net) || 0 : undefined,
        item: valueType === 'GOODS' ? tontine!.item : undefined,
      } satisfies BeneficiaryInput);
      if (!added || added.created.length === 0) return undefined;
      const created = added.created[0];
      return tontineTurnsService.recordReception(currentTenant.id, created.id, { amount: valueType === 'MONEY' ? Number(net) || 0 : undefined, quantity: valueType === 'GOODS' ? Number(net) || 0 : undefined, purchaseAmount: purchase.trim() ? Number(purchase) || 0 : undefined });
    },
    invalidateKeys: [['tontines', 'occurrence-beneficiaries', occurrenceId, currentTenant.id], ['tontines', 'occurrence-financial-summary', occurrenceId, currentTenant.id], queryKeys.tontines.allBeneficiaries(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('tontines', 'beneficiariesAddFailed')); return; }
      notify.success(t('tontines', 'beneficiariesAddedOne', { count: '1' }));
      setAddOpen(false); setAddAdhesionId(''); setAddNetValue(''); setAddPurchaseValue(''); setAddAdhesionError(undefined); setAddNetError(undefined); setAddPurchaseError(undefined);
    },
  });

  if (isTontinesLoading) return <Page t={t} title={t('tontines', 'operationsTitle')} description={t('tontines', 'operationsSubtitle')} embedded={embedded}><TableSkeleton /></Page>;
  if (isTontinesError) return <Page t={t} title={t('tontines', 'operationsTitle')} description={t('tontines', 'operationsSubtitle')} embedded={embedded}><ErrorState onRetry={refetchTontines} /></Page>;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tontines.list(currentTenant.id) });
    if (tontineId) queryClient.invalidateQueries({ queryKey: ['tontines', 'occurrences-by-tontine', tontineId, currentTenant.id] });
    if (periodId) queryClient.invalidateQueries({ queryKey: ['tontines', 'period-adhesions', periodId, currentTenant.id] });
    if (occurrenceId) {
      queryClient.invalidateQueries({ queryKey: ['tontines', 'contributions-by-occurrence', occurrenceId, currentTenant.id] });
      queryClient.invalidateQueries({ queryKey: ['tontines', 'occurrence-beneficiaries', occurrenceId, currentTenant.id] });
      queryClient.invalidateQueries({ queryKey: ['tontines', 'occurrence-financial-summary', occurrenceId, currentTenant.id] });
    }
  };

  /** Même filtre d'éligibilité que le dialogue « Ajouter un bénéficiaire » lui-même (isAdhesionActiveAt + pas déjà bénéficiaire de cette Occurrence) — recalculé ici uniquement pour peupler son sélecteur, jamais une seconde règle d'éligibilité : `addBeneficiaries` revalide de toute façon côté service. */
  const existingBeneficiaryAdhesionIds = new Set(beneficiaries.map((item) => item.adhesionId));
  const eligibleAdhesions = adhesions.filter((adhesion) => !existingBeneficiaryAdhesionIds.has(adhesion.id) && (!referenceDate || isAdhesionActiveAt(adhesion, referenceDate)));

  const query = search.trim().toLowerCase();
  const rows = query ? allRows.filter((row) => `${row.adhesion.memberName} ${memberById.get(row.adhesion.memberId)?.matricule ?? ''}`.toLowerCase().includes(query)) : allRows;
  const allPaid = allRows.length > 0 && allRows.every(rowIsPaid);
  /** « Total montant réglé » (mandat §9) — seul indicateur conservé en pied de page, calculé sur `rows` (lignes affichées/filtrées par la recherche), jamais sur `contributions` en entier. */
  const totalPaidAmount = rows.reduce((sum, row) => sum + rowPaid(row), 0);

  /** Colonnes de la Card « Cotisations des adhérents » (mandat §3) — exactement #/Membre/Montant à régler/Montant réglé/Statut/Participation, plus de Matricule ni de Reste à payer. */
  const columns: TableColumn<(typeof rows)[number]>[] = [
    { key: 'index', header: '#', className: 'w-10', render: (row) => <span className="text-xs text-muted-foreground">{rows.findIndex((item) => item.id === row.id) + 1}</span> },
    { key: 'member', header: t('tontines', 'adhesionMember'), render: (row) => <span className="flex items-center gap-2 font-medium"><MemberAvatar member={memberById.get(row.adhesion.memberId) ?? { firstName: row.adhesion.memberName, lastName: '' }} />{row.adhesion.memberName}</span> },
    { key: 'due', header: t('tontines', 'dueAmountLabel'), render: (row) => formatValue(rowDue(row)) },
    { key: 'paid', header: t('tontines', 'paidAmountLabel'), render: (row) => <span className={CONTRIBUTION_TEXT_TONE[rowStatus(row)]}>{formatValue(rowPaid(row))}</span> },
    { key: 'status', header: t('tontines', 'contributionStatus'), render: (row) => <StatusBadge label={t('tontines', CONTRIBUTION_LABEL_KEY[rowStatus(row)])} tone={CONTRIBUTION_TONE[rowStatus(row)]} /> },
    { key: 'participation', header: t('tontines', 'participationLabel'), render: (row) => <Switch checked={rowIsPaid(row)} disabled={!canManageContributions || rowStatus(row) === 'WAIVED' || toggleParticipationMutation.isPending || globalParticipationMutation.isPending} onCheckedChange={(checked) => toggleParticipationMutation.mutate({ row, markPaid: checked })} aria-label={t('tontines', rowIsPaid(row) ? 'statusPaid' : 'contributionUnpaidLabel')} /> },
  ];

  const beneficiaryColumns: TableColumn<(typeof beneficiaries)[number]>[] = [
    { key: 'index', header: '#', className: 'w-10', render: (row) => <span className="text-xs text-muted-foreground">{beneficiaries.findIndex((item) => item.id === row.id) + 1}</span> },
    { key: 'member', header: t('tontines', 'adhesionMember'), render: (row) => { const adhesion = adhesionById.get(row.adhesionId); const member = adhesion ? memberById.get(adhesion.memberId) : undefined; return <span className="flex items-center gap-2 font-medium"><MemberAvatar member={member ?? { firstName: adhesion?.memberName ?? row.adhesionId, lastName: '' }} />{adhesion?.memberName ?? row.adhesionId}</span>; } },
    ...(isWithPurchase ? [{ key: 'purchase', header: t('tontines', 'purchaseAmountLabel'), render: (row: (typeof beneficiaries)[number]) => formatValue(row.purchaseTotal) }] : []),
    { key: 'net', header: t('tontines', 'netToReceive'), render: (row) => formatValue(row.receivedTotal) },
    ...(isMoney && financials ? [{ key: 'available', header: t('tontines', 'occurrenceRemainderLabel'), render: () => formatValue(financials.available) }] : []),
    { key: 'status', header: t('tontines', 'contributionStatus'), render: (row) => <StatusBadge label={t('tontines', row.status === 'RECEIVED' ? 'statusReceptionReceived' : row.status === 'PARTIAL' ? 'statusReceptionPartial' : 'statusReceptionPending')} tone={row.status === 'RECEIVED' ? 'success' : row.status === 'PARTIAL' ? 'warning' : 'default'} /> },
    { key: 'actions', header: '', className: 'w-24', render: (row) => <div className="flex justify-end gap-1"><PermissionGate permission="beneficiaries.manage">{row.status !== 'RECEIVED' && <button type="button" aria-label={t('tontines', 'editOperation')} onClick={() => { setOperationTarget(row); setNetValue(''); setPurchaseValue(''); setOperationError(undefined); setPurchaseError(undefined); }} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><Pencil size={15} /></button>}<button type="button" aria-label={t('tontines', 'removeBeneficiaryAction')} onClick={() => setRemoveTarget(row)} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><Trash2 size={15} /></button></PermissionGate></div> },
  ];

  return <Page t={t} title={t('tontines', 'operationsTitle')} description={t('tontines', 'operationsSubtitle')} embedded={embedded}>
    <div data-testid="tontine-operations-real-component" className="space-y-6">
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">{t('tontines', 'managementCriteria')}</CardTitle>
        <button type="button" aria-label={t('tontines', 'refreshLabel')} onClick={handleRefresh} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><RefreshCw size={15} /></button>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {/*
         * Critères d'affichage (mandat « retirer Cycle/Type des critères ») —
         * exactement 2 champs : Tontine (seul sélecteur réel,
         * `tontineId`/`setTontineId`, alimenté uniquement par
         * `tontinesService.listTontines`) et Période, les occurrences
         * réelles de CETTE Tontine, désactivée tant qu'aucune Tontine n'est
         * choisie. `Tontine.frequency`/`Tontine.valueType` restent utilisés
         * ailleurs dans ce composant (`isMoney`/`formatValue`/dialogues) —
         * seul leur AFFICHAGE comme critère disparaît ici.
         */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ops-tontine">{t('tontines', 'tontine')}</Label>
            <select id="ops-tontine" value={tontineId} onChange={(event) => { setTontineId(event.target.value); setOccurrenceId(''); }} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">{t('tontines', 'selectTontine')}</option>
              {tontines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ops-period">{t('tontines', 'period')}</Label>
            <div className="flex gap-1.5">
              <select id="ops-period" value={occurrenceId} onChange={(event) => setOccurrenceId(event.target.value)} disabled={!tontineId} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{occurrencePlaceholder}</option>
                {occurrences.map((item) => <option key={item.id} value={item.id}>#{item.occurrenceNumber} · {item.plannedDate}</option>)}
              </select>
              {/* « + » : réutilise la route de création d'occurrence déjà existante (`OccurrenceCreate`, /tontines/:tontineId/periods/:periodId/occurrences/create) — aucune mutation dupliquée ici. N'a de sens que si une occurrence est déjà sélectionnée (Période résolue) : sans ça, aucune route valide à ouvrir. */}
              <button type="button" onClick={() => navigate(`/tontines/${tontineId}/periods/${periodId}/occurrences/create`)} disabled={!periodId} aria-label={t('tontines', 'createOccurrence')} className="grid size-9 shrink-0 place-items-center rounded-md border border-input text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"><Plus size={15} /></button>
              {/* « X » : aucune suppression/annulation d'Occurrence n'existe dans le service (`closeOccurrence` ne fait que clôturer, jamais supprimer) — bouton désactivé plutôt qu'un comportement inventé. */}
              <button type="button" disabled aria-label={t('tontines', 'removeOccurrenceAction')} className="grid size-9 shrink-0 place-items-center rounded-md border border-input text-muted-foreground disabled:pointer-events-none disabled:opacity-40"><X size={15} /></button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    {!occurrence ? <EmptyState icon={ClipboardList} title={t('tontines', 'noOperationsContext')} /> : <>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">{t('tontines', 'cotisationsSection')} ({allRows.length})</CardTitle>
            {canManageContributions && allRows.length > 0 && <Button variant="outline" size="sm" disabled={globalParticipationMutation.isPending || toggleParticipationMutation.isPending} onClick={() => globalParticipationMutation.mutate(!allPaid)}>{t('tontines', allPaid ? 'markAllUnpaidAction' : 'markAllPaidAction')}</Button>}
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <div className="px-4"><FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'searchMemberPlaceholder')} filters={<PermissionGate permission="contributions.read"><Button variant="outline" size="sm" onClick={() => exportRowsToCsv(`cotisations-${occurrence.id}.csv`, [t('tontines', 'adhesionMember'), t('tontines', 'dueAmountLabel'), t('tontines', 'paidAmountLabel'), t('tontines', 'contributionStatus')], rows.map((row) => [row.adhesion.memberName, formatValue(rowDue(row)), formatValue(rowPaid(row)), t('tontines', CONTRIBUTION_LABEL_KEY[rowStatus(row)])]))}><Download size={15} />{t('tontines', 'exportLabel')}</Button></PermissionGate>} /></div>
            <DataTable columns={columns} rows={rows} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noAdhesions')} />} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">{t('tontines', 'beneficiarySection')}</CardTitle>
            {occurrence && <PermissionGate permission="beneficiaries.manage"><div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={eligibleAdhesions.length === 0} onClick={() => { setAddOpen(true); setAddAdhesionId(''); setAddNetValue(''); setAddPurchaseValue(''); setAddAdhesionError(undefined); setAddNetError(undefined); setAddPurchaseError(undefined); }}><UserPlus size={15} />{t('tontines', 'addBeneficiary')}</Button>
              <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10" disabled={beneficiaries.length === 0} onClick={() => { setRemovePickerId(''); setRemovePickerOpen(true); }}><Trash2 size={15} />{t('tontines', 'removeBeneficiaryAction')}</Button>
            </div></PermissionGate>}
          </CardHeader>
          <CardContent className="p-0"><DataTable columns={beneficiaryColumns} rows={beneficiaries} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noBeneficiaryDesignated')} />} /></CardContent>
        </Card>
      </div>

      {/* Pied de page (mandat §9) — seul indicateur conservé : le total réellement réglé, recalculé immédiatement après chaque bascule (individuelle ou globale). */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <span className="text-sm font-medium text-muted-foreground">{t('tontines', 'totalPaidAmountLabel')} :</span>
          <BalanceBox label={t('tontines', 'totalPaidAmountLabel')} value={formatValue(totalPaidAmount)} tone={totalPaidAmount > 0 ? 'success' : 'neutral'} />
        </CardContent>
      </Card>
    </>}
    </div>

    {operationTarget && <ConfirmDialog open title={t('tontines', 'recordOperation')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onCancel={() => setOperationTarget(null)} onConfirm={() => {
      let hasError = false;
      if (!netValue.trim()) { setOperationError(t('tontines', 'fieldRequired')); hasError = true; } else setOperationError(undefined);
      if (isWithPurchase && !purchaseValue.trim()) { setPurchaseError(t('tontines', 'fieldRequired')); hasError = true; } else setPurchaseError(undefined);
      /** Le montant demandé ne doit jamais dépasser le solde tontine réellement disponible — `financials.available` reflète déjà toutes les opérations précédentes (requêté à chaque mutation), donc cette somme est toujours comparée à l'état courant réel, jamais à une valeur figée côté UI. */
      if (!hasError && isMoney && financials && (Number(netValue) || 0) + (isWithPurchase ? Number(purchaseValue) || 0 : 0) > financials.available) { setOperationError(t('tontines', 'amountExceedsAvailable')); hasError = true; }
      if (hasError) return;
      operationMutation.mutate({ amount: Number(netValue) || 0, purchaseAmount: isWithPurchase ? Number(purchaseValue) || 0 : undefined });
    }}>
      <div className="mt-4 space-y-4 text-left">
        <div className="space-y-2"><Label htmlFor="ops-net-value">{t('tontines', 'netToReceive')} *</Label><Input id="ops-net-value" type="number" inputMode="decimal" value={netValue} onChange={(event) => setNetValue(event.target.value)} aria-invalid={Boolean(operationError)} /><FieldError message={operationError} /></div>
        {isWithPurchase && <div className="space-y-2"><Label htmlFor="ops-purchase-value">{t('tontines', 'purchaseAmountLabel')} *</Label><Input id="ops-purchase-value" type="number" inputMode="decimal" value={purchaseValue} onChange={(event) => setPurchaseValue(event.target.value)} aria-invalid={Boolean(purchaseError)} /><FieldError message={purchaseError} /></div>}
        {financials && <p className="flex items-center gap-2 text-[11px] text-muted-foreground"><Lock size={11} />{t('tontines', 'availableAmountLabel')}: <span className="font-medium text-foreground">{formatValue(financials.available)}</span></p>}
      </div>
    </ConfirmDialog>}

    {addOpen && <ConfirmDialog open title={t('tontines', 'addBeneficiary')} description={t('tontines', 'addBeneficiaryDialogSubtitle')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onCancel={() => setAddOpen(false)} onConfirm={() => {
      let hasError = false;
      if (!addAdhesionId) { setAddAdhesionError(t('tontines', 'fieldRequired')); hasError = true; } else setAddAdhesionError(undefined);
      if (!addNetValue.trim()) { setAddNetError(t('tontines', 'fieldRequired')); hasError = true; } else setAddNetError(undefined);
      if (isWithPurchase && !addPurchaseValue.trim()) { setAddPurchaseError(t('tontines', 'fieldRequired')); hasError = true; } else setAddPurchaseError(undefined);
      /** Même garde que le dialogue « Modifier » ci-dessus — le montant désigné à la création ne doit pas non plus dépasser le solde tontine réellement disponible. */
      if (!hasError && isMoney && financials && (Number(addNetValue) || 0) + (isWithPurchase ? Number(addPurchaseValue) || 0 : 0) > financials.available) { setAddNetError(t('tontines', 'amountExceedsAvailable')); hasError = true; }
      if (hasError) return;
      addMutation.mutate({ adhesionId: addAdhesionId, net: addNetValue, purchase: isWithPurchase ? addPurchaseValue : '' });
    }}>
      <div className="mt-4 space-y-4 text-left">
        <div className="space-y-2">
          <Label htmlFor="ops-add-adhesion">{t('tontines', 'selectBeneficiaryAdhesion')} *</Label>
          <select id="ops-add-adhesion" value={addAdhesionId} onChange={(event) => setAddAdhesionId(event.target.value)} aria-invalid={Boolean(addAdhesionError)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t('tontines', 'selectBeneficiaryAdhesion')}</option>
            {eligibleAdhesions.map((adhesion) => <option key={adhesion.id} value={adhesion.id}>{adhesion.memberName}</option>)}
          </select>
          <FieldError message={addAdhesionError} />
        </div>
        <div className="space-y-2"><Label htmlFor="ops-add-net-value">{t('tontines', 'netToReceive')} *</Label><Input id="ops-add-net-value" type="number" inputMode="decimal" value={addNetValue} onChange={(event) => setAddNetValue(event.target.value)} aria-invalid={Boolean(addNetError)} /><FieldError message={addNetError} /></div>
        {isWithPurchase && <div className="space-y-2"><Label htmlFor="ops-add-purchase-value">{t('tontines', 'purchaseAmountLabel')} *</Label><Input id="ops-add-purchase-value" type="number" inputMode="decimal" value={addPurchaseValue} onChange={(event) => setAddPurchaseValue(event.target.value)} aria-invalid={Boolean(addPurchaseError)} /><FieldError message={addPurchaseError} /></div>}
        {financials && <p className="flex items-center gap-2 text-[11px] text-muted-foreground"><Lock size={11} />{t('tontines', 'availableAmountLabel')}: <span className="font-medium text-foreground">{formatValue(financials.available)}</span></p>}
      </div>
    </ConfirmDialog>}

    {removePickerOpen && <ConfirmDialog open title={t('tontines', 'removeBeneficiaryAction')} description={t('tontines', 'removeBeneficiaryConfirmDescription')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onCancel={() => setRemovePickerOpen(false)} onConfirm={() => { if (!removePickerId) return; removeMutation.mutate(removePickerId); }}>
      <div className="mt-4 space-y-2 text-left">
        <Label htmlFor="ops-remove-picker">{t('tontines', 'selectBeneficiaryToRemove')}</Label>
        <select id="ops-remove-picker" value={removePickerId} onChange={(event) => setRemovePickerId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">{t('tontines', 'selectBeneficiaryToRemove')}</option>
          {beneficiaries.map((beneficiary) => <option key={beneficiary.id} value={beneficiary.id}>{adhesionById.get(beneficiary.adhesionId)?.memberName ?? beneficiary.adhesionId}</option>)}
        </select>
      </div>
    </ConfirmDialog>}

    {removeTarget && <ConfirmDialog open title={t('tontines', 'removeBeneficiaryConfirmTitle')} description={t('tontines', 'removeBeneficiaryConfirmDescription')} confirmLabel={t('tontines', 'confirm')} cancelLabel={t('tontines', 'cancel')} onCancel={() => setRemoveTarget(null)} onConfirm={() => removeMutation.mutate(removeTarget.id)} />}
  </Page>;
}
