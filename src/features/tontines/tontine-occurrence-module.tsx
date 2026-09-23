import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowLeft as ArrowLeftIcon, CalendarDays, CheckCircle2, Download, HandCoins, Lock, MoreVertical, ShoppingCart, Trash2, UsersRound, Wallet } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataTable, StatusBadge, EmptyState, MoneyDisplay, PermissionGate, DetailSkeleton, ErrorState, MemberAvatar, FilterBar, ConfirmDialog } from '@/components';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTenant } from '@/contexts/tenant-context';
import { NotFoundPage } from '@/routes';
import { tontineOperationsService, getBeneficiaryPaymentStatus, type BeneficiaryPaymentStatus } from '@/services/tontine-operations.service';
import { tontinesService } from '@/services/tontines.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { members } from '@/mocks/organization/members';
import type { TableColumn } from '@/types/ui';
import { formatDate, formatTourDate } from '@/lib/utils';
import type { T } from './tontines-module';

/**
 * Espace de travail d'un Tour (mandat refonte visuelle « Tours ») —
 * reproduit la maquette de référence (header + 2 colonnes Cotisations/
 * Bénéficiaires + Synthèse). Réutilise exclusivement les mécanismes déjà
 * existants : `setContributionPayment`/`markAllContributionsPaid` (paiement
 * ON/OFF, journal-lié via `insertTransaction`) et
 * `addOccurrenceBeneficiaries`/`removeOccurrenceBeneficiary(ies)` (batch,
 * plusieurs bénéficiaires par Tour, `adhesionId` jamais `memberId`). Aucune
 * notion de Période/Cycle, aucune nouvelle caisse, aucun nouveau système
 * d'audit/d'avatar.
 */

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type ContributionStatus = Awaited<ReturnType<typeof tontineOperationsService.listContributionStatuses>>[number];
type OccurrenceBeneficiaryRow = Awaited<ReturnType<typeof tontineOperationsService.listBeneficiaries>>[number];
type MemberInfo = { memberName: string; firstName: string; lastName: string; photoUrl?: string };

/** En-tête de statistiques du Tour, séparateurs verticaux discrets (maquette §5). */
function HeaderStat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="min-w-[7rem]"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-base font-semibold text-foreground">{value}</p></div>;
}

/** Colonne gauche — cotisations des adhérents (checkbox, avatar, montant, statut, toggle ON/OFF). */
function ContributionsColumn({
  t, contributions, memberById, beneficiaryAdhesionIds, historicalBeneficiaryAdhesionIds, selectedToAdd, onToggleSelect, onTogglePayment, onMarkAllPaid, onAdd, closed, togglePendingId, markAllPending, addPending, withPurchase,
}: {
  t: T; contributions: ContributionStatus[]; memberById: Map<string, MemberInfo>; beneficiaryAdhesionIds: Set<string>; historicalBeneficiaryAdhesionIds: Set<string>;
  selectedToAdd: Set<string>; onToggleSelect: (adhesionId: string) => void; onTogglePayment: (adhesionId: string, paid: boolean) => void; onMarkAllPaid: () => void; onAdd: () => void;
  closed: boolean; togglePendingId: string | null; markAllPending: boolean; addPending: boolean; withPurchase: boolean;
}) {
  const [search, setSearch] = useState('');
  const query = normalizeSearchText(search);
  const filtered = contributions.filter((row) => !query || row.memberName.toLowerCase().includes(query));
  const anyUnpaid = contributions.some((row) => !row.paid);
  /**
   * SANS ACHAT uniquement (mandat « sélection séquentielle des bénéficiaires »,
   * 2026-09-23, étendu par « historique des bénéficiaires entre Tours ») —
   * `contributions` est déjà trié par `rank` (source de vérité : l'ordre
   * défini dans l'onglet Adhérents, `TontineBeneficiaryPlan.position`), jamais
   * retrié ici par nom/date/sélection/API. Une position N n'est sélectionnable
   * que si TOUTES les positions précédentes sont déjà bénéficiaires de CE Tour,
   * OU déjà bénéficiaires d'un Tour PRÉCÉDENT (historique), OU déjà
   * sélectionnées dans ce lot — jamais un trou dans la séquence 1→2→3→4→5.
   * Avec achat, aucune contrainte : toujours vrai.
   */
  const orderedAdhesionIds = contributions.map((row) => row.adhesionId);
  const isSelectableInOrder = (adhesionId: string): boolean => {
    if (withPurchase) return true;
    const index = orderedAdhesionIds.indexOf(adhesionId);
    return orderedAdhesionIds.slice(0, index).every((id) => beneficiaryAdhesionIds.has(id) || historicalBeneficiaryAdhesionIds.has(id) || selectedToAdd.has(id));
  };

  const columns: TableColumn<ContributionStatus & { id: string }>[] = [
    // Sans achat uniquement : le rang reflète l'ordre de passage prédéfini (`TontineBeneficiaryPlan.position`). Avec achat, aucun ordre n'est prédéfini — la colonne n'a pas de sens et disparaît entièrement (jamais un « — » à la place).
    ...(withPurchase ? [] : [{ key: 'rank', header: '#', className: 'w-10', render: (row: ContributionStatus) => row.rank === Number.MAX_SAFE_INTEGER ? '—' : String(row.rank) } as TableColumn<ContributionStatus & { id: string }>]),
    {
      key: 'select', header: '', className: 'w-8', render: (row) => {
        const isBeneficiary = beneficiaryAdhesionIds.has(row.adhesionId);
        // Deux raisons de verrouillage distinctes côté code (mandat §5/§11), même rendu visuel (cadenas) : historique (déjà bénéficiaire d'un AUTRE Tour de ce cycle) vs séquence du Tour courant pas encore atteinte.
        const isHistorical = !isBeneficiary && historicalBeneficiaryAdhesionIds.has(row.adhesionId);
        const isSequenceLocked = !isBeneficiary && !isHistorical && !isSelectableInOrder(row.adhesionId);
        if (isHistorical) return <Lock size={14} className="text-muted-foreground" aria-label={t('tontines', 'positionAlreadyBeneficiary')} />;
        if (isSequenceLocked) return <Lock size={14} className="text-muted-foreground" aria-label={t('tontines', 'positionLocked')} />;
        return <Checkbox checked={isBeneficiary || selectedToAdd.has(row.adhesionId)} onCheckedChange={() => onToggleSelect(row.adhesionId)} disabled={closed || isBeneficiary} aria-label={t('tontines', 'selectMember')} />;
      },
    },
    { key: 'member', header: t('tontines', 'memberColumn'), render: (row) => { const member = memberById.get(row.memberId); return <span className="flex items-center gap-2"><MemberAvatar member={member ?? { firstName: row.memberName, lastName: '' }} size="sm" />{row.memberName}</span>; } },
    { key: 'amountDue', header: t('tontines', 'amountDue'), render: (row) => <MoneyDisplay amount={row.amountDue} /> },
    { key: 'status', header: t('tontines', 'paymentStatus'), render: (row) => <StatusBadge label={t('tontines', row.paid ? 'paidStatus' : 'unpaidStatus')} tone={row.paid ? 'success' : 'error'} /> },
    { key: 'toggle', header: t('tontines', 'paymentToggle'), className: 'w-20', render: (row) => <PermissionGate permission="contributions.manage"><Switch checked={row.paid} disabled={closed || togglePendingId === row.adhesionId} onCheckedChange={(checked) => onTogglePayment(row.adhesionId, checked)} aria-label={t('tontines', row.paid ? 'markUnpaid' : 'markPaid', { name: row.memberName })} /></PermissionGate> },
  ];

  return <Card className="lg:basis-[58%]">
    <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <CardTitle className="flex items-center gap-2 text-base"><UsersRound size={16} className="text-primary" />{t('tontines', 'memberContributionsTitle', { count: String(contributions.length) })}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{t('tontines', 'cotisationsSubtitle')}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => downloadCsv('cotisations.csv', [[t('tontines', 'memberColumn'), t('tontines', 'amountDue'), t('tontines', 'amountPaid'), t('tontines', 'paymentStatus')], ...contributions.map((row) => [row.memberName, String(row.amountDue), String(row.amountPaid), t('tontines', row.paid ? 'paidStatus' : 'unpaidStatus')])])}>
        <Download size={14} />{t('tontines', 'exportAction')}
      </Button>
    </CardHeader>
    <CardContent className="space-y-4 p-5">
      <FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'searchAdherentPlaceholder')} />
      <DataTable columns={columns} rows={filtered.map((row) => ({ ...row, id: row.adhesionId }))} empty={<EmptyState icon={UsersRound} title={t('tontines', 'noAdhesions')} />} />

      {/* Mandat « sélection individuelle des bénéficiaires » (2026-09-23) : le nombre de bénéficiaires d'un Tour reste volontairement faible (1 à 3 en pratique) — la sélection reste explicite adhérent par adhérent, jamais un « Tout sélectionner » global. */}

      {anyUnpaid && <PermissionGate permission="contributions.manage"><Button variant="outline" className="w-full justify-center border-primary/40 text-primary hover:bg-primary/5" disabled={closed || markAllPending} onClick={onMarkAllPaid}><CheckCircle2 size={15} />{t('tontines', 'markAllPaid')}</Button></PermissionGate>}

      <PermissionGate permission="beneficiaries.manage">
        <Button className="h-auto w-full flex-col gap-0.5 py-3" disabled={closed || selectedToAdd.size === 0 || addPending} onClick={onAdd}>
          <span className="flex items-center gap-1.5 text-sm font-semibold">{t('tontines', 'addAction')}<ArrowRight size={15} /></span>
          <span className="text-[11px] font-normal opacity-90">{t('tontines', 'addBeneficiariesHint')}</span>
        </Button>
      </PermissionGate>
    </CardContent>
  </Card>;
}

const BENEFICIARY_STATUS_TONE: Record<BeneficiaryPaymentStatus, 'warning' | 'orange' | 'success'> = { PENDING: 'warning', PARTIAL: 'orange', PAID: 'success' };
const BENEFICIARY_STATUS_KEY: Record<BeneficiaryPaymentStatus, string> = { PENDING: 'beneficiaryPendingStatus', PARTIAL: 'beneficiaryPartialStatus', PAID: 'beneficiaryPaidStatus' };

/**
 * Dialog « Régler » — RÉUTILISE `ConfirmDialog` (mandat §23), jamais un
 * second système de confirmation. Le montant proposé par défaut est le
 * RESTE dû (`amountDue - amountPaid`), modifiable à la baisse : le modèle
 * (`recordReception`, additif) supporte déjà le paiement partiel — jamais
 * une nouvelle règle financière inventée ici, seulement une saisie qui
 * respecte les bornes déjà garanties par le service (`amount > 0`).
 */
function SettleBeneficiaryDialog({ t, open, memberName, remaining, withPurchase, pending, onCancel, onConfirm }: {
  t: T; open: boolean; memberName: string; remaining: number; withPurchase: boolean; pending: boolean;
  onCancel: () => void; onConfirm: (amount: number, purchaseAmount?: number) => void;
}) {
  const [amount, setAmount] = useState(String(remaining));
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const numericAmount = Number(amount);
  const isValid = numericAmount > 0 && numericAmount <= remaining;
  return <ConfirmDialog
    open={open}
    title={t('tontines', 'confirmSettlementTitle')}
    description={t('tontines', 'confirmSettlementDescription', { name: memberName })}
    confirmLabel={pending ? t('tontines', 'saving') : t('tontines', 'settlementConfirm')}
    confirmDisabled={!isValid || pending}
    cancelLabel={t('tontines', 'cancel')}
    onConfirm={() => onConfirm(numericAmount, withPurchase && purchaseAmount ? Number(purchaseAmount) : undefined)}
    onCancel={onCancel}
  >
    <div className="mt-4 space-y-3 text-left">
      <div className="space-y-1.5">
        <Label htmlFor="settlement-amount">{t('tontines', 'settlementAmountLabel')}</Label>
        <Input id="settlement-amount" type="number" min={1} max={remaining} value={amount} onChange={(event) => setAmount(event.target.value)} />
      </div>
      {withPurchase && <div className="space-y-1.5">
        <Label htmlFor="settlement-purchase-amount">{t('tontines', 'purchaseAmount')}</Label>
        <Input id="settlement-purchase-amount" type="number" min={0} value={purchaseAmount} onChange={(event) => setPurchaseAmount(event.target.value)} />
      </div>}
    </div>
  </ConfirmDialog>;
}

/**
 * Colonne droite — bénéficiaires du Tour (plusieurs par Tour, chacun sa
 * propre ligne, chaque paiement indépendant des autres). Aucune checkbox de
 * sélection ici (mandat « suppression de la colonne checkbox », 2026-09-23) :
 * ce panneau n'est qu'un affichage des bénéficiaires déjà sélectionnés depuis
 * Cotisations. Le retrait est exclusivement individuel, via `onRemoveOne`
 * (menu ⋮ de la ligne, `row.id` — jamais une sélection groupée).
 */
function BeneficiariesColumn({ t, beneficiaries, memberById, positionByAdhesionId, globalBeneficiaryNumberByAdhesionId, onRemoveOne, onSettle, closed, withPurchase, removePendingId, settlePendingId }: {
  t: T; beneficiaries: OccurrenceBeneficiaryRow[]; memberById: Map<string, MemberInfo>; positionByAdhesionId: Map<string, number>; globalBeneficiaryNumberByAdhesionId: Map<string, number>;
  onRemoveOne: (beneficiaryId: string) => void;
  onSettle: (beneficiaryId: string, amount: number, purchaseAmount?: number) => void;
  closed: boolean; withPurchase: boolean; removePendingId: string | null; settlePendingId: string | null;
}) {
  const [search, setSearch] = useState('');
  const [settlingBeneficiaryId, setSettlingBeneficiaryId] = useState<string | null>(null);
  const query = normalizeSearchText(search);
  const filtered = beneficiaries.filter((row) => !query || (memberById.get(row.adhesionId)?.memberName ?? row.adhesionId).toLowerCase().includes(query));
  const settlingBeneficiary = beneficiaries.find((b) => b.id === settlingBeneficiaryId);

  const columns: TableColumn<OccurrenceBeneficiaryRow & { id: string; index: number }>[] = [
    // Sans achat : le « # » est le RANG D'ORIGINE dans l'ordre maître Adhérents (mandat « # = rang d'origine », 2026-09-23). Avec achat : numéro GLOBAL et CONTINU du bénéficiaire depuis le début du cycle (mandat « numérotation globale des bénéficiaires », 2026-09-23) — jamais l'index dans ce tableau, jamais réinitialisé à 1 par Tour.
    { key: 'index', header: '#', className: 'w-8', render: (row) => String(row.index) },
    { key: 'member', header: t('tontines', 'beneficiaryColumn'), render: (row) => { const member = memberById.get(row.adhesionId); const label = member?.memberName ?? row.adhesionId; return <span className="flex items-center gap-2"><MemberAvatar member={member ?? { firstName: label, lastName: '' }} size="sm" />{label}</span>; } },
    /** « Achat » — avec-achat uniquement (mandat « montant d'achat par bénéficiaire ») : une Tontine sans achat n'affiche jamais cette colonne, jamais un montant fictif à 0. */
    ...(withPurchase ? [{ key: 'amountPurchased', header: t('tontines', 'purchaseAmount'), render: (row: OccurrenceBeneficiaryRow) => <MoneyDisplay amount={row.amountPurchased} /> } as TableColumn<OccurrenceBeneficiaryRow & { id: string; index: number }>] : []),
    { key: 'amountDue', header: t('tontines', 'amountDue'), render: (row) => <MoneyDisplay amount={row.amountDue} /> },
    { key: 'amountReceived', header: t('tontines', 'amountReceivedColumn'), render: (row) => <MoneyDisplay amount={row.amountPaid} /> },
    { key: 'remaining', header: t('tontines', 'remainingColumn'), render: (row) => <MoneyDisplay amount={Math.max(row.amountDue - row.amountPaid, 0)} /> },
    { key: 'status', header: t('tontines', 'paymentStatus'), render: (row) => { const status = getBeneficiaryPaymentStatus(row); return <StatusBadge label={t('tontines', BENEFICIARY_STATUS_KEY[status])} tone={BENEFICIARY_STATUS_TONE[status]} />; } },
    {
      key: 'actions', header: '', className: 'w-10', render: (row) => {
        const status = getBeneficiaryPaymentStatus(row);
        // Sans achat : le retrait est autorisé (mandat « retrait en cascade », 2026-09-23) — le service retire aussi, côté serveur, toute position supérieure déjà bénéficiaire de ce même Tour, jamais uniquement côté UI.
        const canRemove = row.amountPaid === 0 && !closed;
        const canSettle = status !== 'PAID' && !closed;
        if (!canRemove && !canSettle) return null;
        return <PermissionGate permission="beneficiaries.manage">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('tontines', 'rowActionsMenu')}><MoreVertical size={15} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canSettle && <DropdownMenuItem disabled={settlePendingId === row.id} onClick={() => setSettlingBeneficiaryId(row.id)}><Wallet size={14} />{t('tontines', 'settleAction')}</DropdownMenuItem>}
              {canRemove && <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={removePendingId === row.id} onClick={() => onRemoveOne(row.id)}><Trash2 size={14} />{t('tontines', 'removeBeneficiaryAction')}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </PermissionGate>;
      },
    },
  ];
  /**
   * SANS ACHAT : trie ET numérote par le rang d'origine (`positionByAdhesionId`,
   * source unique `TontineBeneficiaryPlan.position`) — jamais l'ordre de
   * recherche/sélection/ajout au Tour.
   * AVEC ACHAT (mandat « numérotation globale des bénéficiaires »,
   * 2026-09-23) : numérote par `globalBeneficiaryNumberByAdhesionId` (ordre
   * chronologique de TOUS les Tours du cycle) — jamais réinitialisé à 1 à
   * l'ouverture d'un nouveau Tour. L'ordre d'ajout au sein de ce Tour est
   * DÉJÀ l'ordre chronologique global (les numéros y sont donc déjà
   * croissants) : aucun retri nécessaire, contrairement à sans achat.
   */
  const orderedFiltered = withPurchase ? filtered : [...filtered].sort((a, b) => (positionByAdhesionId.get(a.adhesionId) ?? Number.MAX_SAFE_INTEGER) - (positionByAdhesionId.get(b.adhesionId) ?? Number.MAX_SAFE_INTEGER));
  const rows = orderedFiltered.map((row, index) => ({ ...row, id: row.id, index: withPurchase ? (globalBeneficiaryNumberByAdhesionId.get(row.adhesionId) ?? index + 1) : (positionByAdhesionId.get(row.adhesionId) ?? index + 1) }));

  return <Card className="lg:basis-[42%]">
    <CardHeader className="border-b border-border pb-4">
      <CardTitle className="flex items-center gap-2 text-base"><HandCoins size={16} className="text-primary" />{t('tontines', 'tourBeneficiariesTitle', { count: String(beneficiaries.length) })}</CardTitle>
      <p className="mt-1 text-xs text-muted-foreground">{t('tontines', 'beneficiariesSubtitle')}</p>
    </CardHeader>
    <CardContent className="space-y-4 p-5">
      <FilterBar search={search} onSearchChange={setSearch} placeholder={t('tontines', 'searchBeneficiaryPlaceholder')} />
      <DataTable columns={columns} rows={rows} empty={<EmptyState icon={HandCoins} title={t('tontines', 'noBeneficiaries')} />} />
    </CardContent>

    {settlingBeneficiary && <SettleBeneficiaryDialog
      t={t} open={Boolean(settlingBeneficiary)} memberName={memberById.get(settlingBeneficiary.adhesionId)?.memberName ?? settlingBeneficiary.adhesionId}
      remaining={Math.max(settlingBeneficiary.amountDue - settlingBeneficiary.amountPaid, 0)} withPurchase={withPurchase} pending={settlePendingId === settlingBeneficiary.id}
      onCancel={() => setSettlingBeneficiaryId(null)}
      onConfirm={(amount, purchaseAmount) => { onSettle(settlingBeneficiary.id, amount, purchaseAmount); setSettlingBeneficiaryId(null); }}
    />}
  </Card>;
}

const REMAINDER_STATUS_TONE: Record<'OPEN' | 'CONSUMED' | 'WRITTEN_OFF', 'warning' | 'success' | 'default'> = { OPEN: 'warning', CONSUMED: 'success', WRITTEN_OFF: 'default' };
const REMAINDER_STATUS_KEY: Record<'OPEN' | 'CONSUMED' | 'WRITTEN_OFF', string> = { OPEN: 'remainderOpen', CONSUMED: 'remainderConsumedStatus', WRITTEN_OFF: 'remainderWrittenOffStatus' };
type RemainderRow = Awaited<ReturnType<typeof tontineOperationsService.listRemainders>>[number];

/**
 * Bas de page — synthèse financière du Tour (source de vérité inchangée,
 * aucun recalcul de reliquat ici). « Somme achats » — avec-achat uniquement
 * (mandat « montant d'achat par bénéficiaire »), jamais affichée pour une
 * Tontine sans achat. Le reliquat n'est plus un onglet indépendant de la
 * Tontine (mandat « le Tour devient le centre des opérations ») : les
 * `TontineRemainder` de CE Tour restent consultables et actionnables
 * (`consumeRemainder`/`writeOffRemainder`, services inchangés) directement
 * ici, jamais un onglet séparé.
 */
function FinancialSummaryPanel({ t, totalDue, totalPaid, remainderAmount, totalPurchase, withPurchase, remainders, onConsume, onWriteOff, consumePendingId, writeOffPendingId }: {
  t: T; totalDue: number; totalPaid: number; remainderAmount: number; totalPurchase: number; withPurchase: boolean;
  remainders: RemainderRow[]; onConsume: (remainderId: string) => void; onWriteOff: (remainderId: string) => void; consumePendingId: string | null; writeOffPendingId: string | null;
}) {
  const remaining = Math.max(0, totalDue - totalPaid);
  return <Card>
    <CardHeader><CardTitle className="text-base">{t('tontines', 'tourSummaryTitle')}</CardTitle></CardHeader>
    <CardContent className="space-y-5 p-5 pt-0">
      <div className={`grid gap-4 ${withPurchase ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
        {withPurchase && <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'totalPurchaseLabel')}</p><p className="text-base font-semibold"><MoneyDisplay amount={totalPurchase} /></p></div>}
        <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'totalDueLabel')}</p><p className="text-base font-semibold"><MoneyDisplay amount={totalDue} /></p></div>
        <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'totalPaidLabel')}</p><p className="text-base font-semibold"><MoneyDisplay amount={totalPaid} /></p></div>
        <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'remainingDueLabel')}</p><p className="text-base font-semibold"><MoneyDisplay amount={remaining} /></p></div>
        <div><p className="text-[11px] text-muted-foreground">{t('tontines', 'remainderAmount')}</p><p className="text-base font-semibold"><MoneyDisplay amount={remainderAmount} /></p></div>
      </div>
      {remainders.length > 0 && <div className="space-y-2 border-t border-border pt-4">
        {remainders.map((remainder) => <div key={remainder.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
          <div><p className="text-sm font-semibold"><MoneyDisplay amount={remainder.amount} /></p><p className="text-xs text-muted-foreground">{formatDate(remainder.date)} · {t('tontines', 'remainderOriginUnderdistributed')}</p></div>
          <div className="flex items-center gap-2">
            <StatusBadge label={t('tontines', REMAINDER_STATUS_KEY[remainder.status])} tone={REMAINDER_STATUS_TONE[remainder.status]} />
            {remainder.status === 'OPEN' && <PermissionGate permission="beneficiaries.manage">
              <Button size="sm" variant="outline" disabled={consumePendingId === remainder.id} onClick={() => onConsume(remainder.id)}>{t('tontines', 'consumeRemainder')}</Button>
              <Button size="sm" variant="ghost" disabled={writeOffPendingId === remainder.id} onClick={() => onWriteOff(remainder.id)}>{t('tontines', 'writeOffRemainder')}</Button>
            </PermissionGate>}
          </div>
        </div>)}
      </div>}
    </CardContent>
  </Card>;
}

export function OccurrenceDetail({ t }: { t: T }) {
  const { tontineId = '', occurrenceId = '' } = useParams();
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());

  const { data: occurrence, isPending: isOccurrencePending, isError: isOccurrenceError, isSuccess: isOccurrenceSuccess, refetch } = useQuery({ queryKey: queryKeys.tontines.occurrence(occurrenceId), queryFn: () => tontineOperationsService.getOccurrence(currentTenant.id, occurrenceId) });
  /** Requête dépendante (`enabled: Boolean(occurrence)`) — tant qu'elle n'a pas elle-même abouti, le Tour n'est PAS « introuvable » : il attend encore sa Tontine parente (sinon flash 404 le temps de ce second aller-retour). */
  const { data: tontine, isPending: isTontinePending, isError: isTontineError, isSuccess: isTontineSuccess, refetch: refetchTontine } = useQuery({ queryKey: queryKeys.tontines.detail(tontineId), queryFn: () => tontinesService.getTontine(currentTenant.id, tontineId), enabled: Boolean(occurrence) });
  const { data: contributions = [] } = useQuery({ queryKey: queryKeys.tontines.contributionStatuses(occurrenceId), queryFn: () => tontineOperationsService.listContributionStatuses(currentTenant.id, occurrenceId), enabled: Boolean(occurrence) });
  const { data: beneficiaries = [] } = useQuery({ queryKey: queryKeys.tontines.beneficiaries(occurrenceId), queryFn: () => tontineOperationsService.listBeneficiaries(currentTenant.id, occurrenceId), enabled: Boolean(occurrence) });
  /** Sans achat ET avec achat (mandat « historique des bénéficiaires entre Tours », étendu 2026-09-23 aux tontines avec achat, au niveau de la PARTICIPATION/`adhesionId`, jamais du membre) — bénéficiaires de TOUS les Tours du cycle, jamais uniquement de celui-ci ; sert à verrouiller les participations déjà « passées » dans un Tour précédent. */
  const { data: cycleBeneficiaryAdhesionIds = [] } = useQuery({ queryKey: queryKeys.tontines.cycleBeneficiaries(tontineId), queryFn: () => tontineOperationsService.listCycleBeneficiaryAdhesionIds(currentTenant.id, tontineId), enabled: Boolean(occurrence) && Boolean(tontine) });
  /** AVEC ACHAT uniquement (mandat « numérotation globale des bénéficiaires », 2026-09-23) — ordre chronologique de TOUS les bénéficiaires du cycle, jamais réinitialisé par Tour. Sans achat : non utilisé (le rang du Plan reste la seule source, inchangée). */
  const { data: cycleBeneficiaryOrder = [] } = useQuery({ queryKey: queryKeys.tontines.cycleBeneficiaryOrder(tontineId), queryFn: () => tontineOperationsService.listCycleBeneficiaryGlobalOrder(currentTenant.id, tontineId), enabled: Boolean(occurrence) && Boolean(tontine?.withPurchase === true) });
  const { data: remainders = [] } = useQuery({ queryKey: queryKeys.tontines.remainders(tontineId), queryFn: () => tontineOperationsService.listRemainders(currentTenant.id, tontineId), enabled: Boolean(occurrence) });
  const { data: allMembers = [] } = useQuery({ queryKey: ['organization', 'members', currentTenant.id], queryFn: () => Promise.resolve(members.filter((m) => m.tenantId === currentTenant.id)) });

  const closeMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.closeOccurrence>>, void>({
    mutationFn: () => tontineOperationsService.closeOccurrence(currentTenant.id, occurrenceId),
    invalidateKeys: [queryKeys.tontines.occurrence(occurrenceId), queryKeys.tontines.occurrences(tontineId), queryKeys.tontines.remainders(tontineId)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'closeOccurrenceFailed')); return; } notify.success(t('tontines', 'occurrenceClosed')); },
  });

  const toggleMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.setContributionPayment>>, { adhesionId: string; paid: boolean }>({
    mutationFn: ({ adhesionId, paid }) => tontineOperationsService.setContributionPayment(currentTenant.id, occurrenceId, adhesionId, paid),
    invalidateKeys: [queryKeys.tontines.contributionStatuses(occurrenceId)],
    onSuccess: (result) => { if (!result) notify.error(t('tontines', 'paymentToggleFailed')); },
  });
  const togglePendingId = toggleMutation.isPending ? toggleMutation.variables?.adhesionId ?? null : null;

  const markAllMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.markAllContributionsPaid>>, void>({
    mutationFn: () => tontineOperationsService.markAllContributionsPaid(currentTenant.id, occurrenceId),
    invalidateKeys: [queryKeys.tontines.contributionStatuses(occurrenceId)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'paymentToggleFailed')); return; } notify.success(t('tontines', 'markAllPaidSuccess', { count: String(result.updated) })); },
  });

  const addMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.addOccurrenceBeneficiaries>>, void>({
    mutationFn: () => tontineOperationsService.addOccurrenceBeneficiaries(currentTenant.id, occurrenceId, Array.from(selectedToAdd)),
    // `cycleBeneficiaries` (historique inter-Tours, sans/avec achat) et `cycleBeneficiaryOrder` (numérotation globale, avec achat) doivent rester en phase avec `beneficiaries` de ce Tour, sinon un bénéficiaire tout juste ajouté ICI apparaîtrait à tort comme « historique » (verrouillé) ou son numéro serait incorrect avant le prochain refetch.
    invalidateKeys: [queryKeys.tontines.beneficiaries(occurrenceId), queryKeys.tontines.cycleBeneficiaries(tontineId), queryKeys.tontines.cycleBeneficiaryOrder(tontineId)],
    onSuccess: (result) => { if (!result || result.added.length === 0) { notify.error(t('tontines', 'beneficiaryAddFailed')); return; } notify.success(t('tontines', 'beneficiariesAddedCount', { count: String(result.added.length) })); setSelectedToAdd(new Set()); },
  });

  const removeOneMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.removeOccurrenceBeneficiary>>, string>({
    mutationFn: (beneficiaryId) => tontineOperationsService.removeOccurrenceBeneficiary(currentTenant.id, beneficiaryId),
    // Sans achat : le retrait libère aussi des positions du Plan (`consumedByOccurrenceId` réinitialisé) — l'onglet Adhérents ET l'historique inter-Tours doivent refléter cette disponibilité retrouvée sans reload complet. Avec achat : la numérotation globale change aussi dès qu'une participation quitte le cycle.
    invalidateKeys: [queryKeys.tontines.beneficiaries(occurrenceId), queryKeys.tontines.plans(tontineId), queryKeys.tontines.cycleBeneficiaries(tontineId), queryKeys.tontines.cycleBeneficiaryOrder(tontineId)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'beneficiaryRemoveFailed')); return; } notify.success(t('tontines', 'beneficiaryRemoved')); },
  });
  const removePendingId = removeOneMutation.isPending ? removeOneMutation.variables ?? null : null;

  const settleMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.recordReception>>, { beneficiaryId: string; amount: number; purchaseAmount?: number }>({
    mutationFn: ({ beneficiaryId, amount, purchaseAmount }) => tontineOperationsService.recordReception(currentTenant.id, beneficiaryId, amount, purchaseAmount),
    invalidateKeys: [queryKeys.tontines.beneficiaries(occurrenceId), queryKeys.tontines.remainders(tontineId)],
    onSuccess: (result) => { if (!result) { notify.error(t('tontines', 'settlementFailed')); return; } notify.success(t('tontines', 'settlementRecorded')); },
  });
  const settlePendingId = settleMutation.isPending ? settleMutation.variables?.beneficiaryId ?? null : null;

  const consumeMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.consumeRemainder>>, string>({
    mutationFn: (remainderId) => tontineOperationsService.consumeRemainder(currentTenant.id, remainderId),
    invalidateKeys: [queryKeys.tontines.remainders(tontineId)],
    onSuccess: (result) => { if (result) notify.success(t('tontines', 'remainderConsumed')); },
  });
  const consumePendingId = consumeMutation.isPending ? consumeMutation.variables ?? null : null;
  const writeOffMutation = useMockMutation<Awaited<ReturnType<typeof tontineOperationsService.writeOffRemainder>>, string>({
    mutationFn: (remainderId) => tontineOperationsService.writeOffRemainder(currentTenant.id, remainderId, t('tontines', 'remainderWriteOffReason')),
    invalidateKeys: [queryKeys.tontines.remainders(tontineId)],
    onSuccess: (result) => { if (result) notify.success(t('tontines', 'remainderWrittenOff')); },
  });
  const writeOffPendingId = writeOffMutation.isPending ? writeOffMutation.variables ?? null : null;

  /** Chargement en cours (Tour, puis Tontine parente une fois le Tour trouvé) — jamais confondu avec une absence de données définitive (cf. mandat anti-flash-404). */
  if (isOccurrencePending || (isOccurrenceSuccess && Boolean(occurrence) && isTontinePending)) return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><DetailSkeleton /></div>;
  if (isOccurrenceError) return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><ErrorState onRetry={refetch} /></div>;
  if (isTontineError) return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><ErrorState onRetry={refetchTontine} /></div>;
  /** Tour ou Tontine réellement inexistant·e (requête aboutie, `undefined` en retour) — seul cas légitime de 404. */
  if ((isOccurrenceSuccess && !occurrence) || (isTontineSuccess && !tontine)) return <NotFoundPage />;
  if (!occurrence || !tontine) return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><DetailSkeleton /></div>;

  const withPurchase = Boolean(tontine.withPurchase);
  const closed = occurrence.status === 'REALIZED';
  const expectedAmount = tontineOperationsService.getExpectedContributionAmount(tontine);
  const totalDue = contributions.reduce((sum, row) => sum + row.amountDue, 0);
  const totalPaid = contributions.reduce((sum, row) => sum + Math.min(row.amountPaid, row.amountDue), 0);
  const remaining = Math.max(0, totalDue - totalPaid);
  const remaindersForOccurrence = remainders.filter((row) => row.occurrenceId === occurrenceId);
  const remainderAmount = remaindersForOccurrence.reduce((sum, row) => sum + row.amount, 0);
  /** Somme achats = Σ montant d'achat de chaque bénéficiaire (mandat « montant d'achat par bénéficiaire ») — jamais nombre de bénéficiaires × montant de la Tontine : des montants d'achat différents par bénéficiaire restent supportés. */
  const totalPurchase = beneficiaries.reduce((sum, row) => sum + row.amountPurchased, 0);
  const memberById = new Map<string, MemberInfo>(allMembers.map((m) => [m.id, { memberName: `${m.firstName} ${m.lastName}`, firstName: m.firstName, lastName: m.lastName, photoUrl: m.photoUrl }]));
  const contributionMemberById = new Map<string, MemberInfo>(contributions.map((row) => [row.memberId, memberById.get(row.memberId) ?? { memberName: row.memberName, firstName: row.memberName, lastName: '', photoUrl: undefined }]));
  const beneficiaryMemberById = new Map<string, MemberInfo>(beneficiaries.map((row) => {
    const status = contributions.find((c) => c.adhesionId === row.adhesionId);
    const member = status ? memberById.get(status.memberId) : undefined;
    return [row.adhesionId, member ?? { memberName: status?.memberName ?? row.adhesionId, firstName: status?.memberName ?? row.adhesionId, lastName: '', photoUrl: undefined }];
  }));
  const beneficiaryAdhesionIds = new Set(beneficiaries.map((b) => b.adhesionId));
  /**
   * SANS ACHAT (mandat « historique des bénéficiaires entre Tours »,
   * 2026-09-23) — adhésions déjà bénéficiaires d'un Tour PRÉCÉDENT (jamais de
   * celui-ci, exclu explicitement) : par construction, une adhésion ne
   * bénéficie jamais de deux Tours du même cycle simultanément, donc
   * `cycleBeneficiaryAdhesionIds \ beneficiaryAdhesionIds` = exactement les
   * positions « déjà passées » ailleurs.
   */
  const historicalBeneficiaryAdhesionIds = new Set(cycleBeneficiaryAdhesionIds.filter((id) => !beneficiaryAdhesionIds.has(id)));
  /**
   * SANS ACHAT (mandat « # = rang d'origine dans Adhérents », 2026-09-23) —
   * `contributions[].rank` porte déjà exactement cette information (source
   * de vérité unique : `TontineBeneficiaryPlan.position`, jamais retrié ici),
   * réutilisée telle quelle pour le panneau « Bénéficiaires du Tour » — un
   * même `adhesionId` (une même représentation) garde toujours le même rang,
   * jamais l'index dans `beneficiaries[]` ni l'ordre d'ajout au Tour.
   */
  const positionByAdhesionId = new Map(contributions.map((row) => [row.adhesionId, row.rank]));
  /**
   * AVEC ACHAT (mandat « numérotation globale des bénéficiaires »,
   * 2026-09-23) — numéro 1..N dans `cycleBeneficiaryOrder` (déjà l'ordre
   * chronologique de tous les Tours du cycle) : ne recommence jamais à 1 à
   * l'ouverture d'un nouveau Tour, jamais l'index dans `beneficiaries[]`.
   */
  const globalBeneficiaryNumberByAdhesionId = new Map(cycleBeneficiaryOrder.map((id, index) => [id, index + 1]));

  /**
   * SANS ACHAT (mandat « sélection séquentielle des bénéficiaires »,
   * 2026-09-23) — l'ordre défini dans l'onglet Adhérents (`rank`, déjà
   * l'ordre de tri de `contributions`) est la SOURCE DE VÉRITÉ : on ne peut
   * cocher une position que si toutes les précédentes sont déjà bénéficiaires
   * de ce Tour ou déjà sélectionnées dans ce lot (garde-fou en plus du
   * verrouillage visuel de `ContributionsColumn`, jamais uniquement côté UI).
   * Décocher une position retire aussi, en cascade, toutes les positions
   * SUIVANTES du lot — jamais un trou dans la séquence 1→2→3→4→5. Avec
   * achat, comportement historique inchangé (toggle indépendant).
   */
  const toggleSelectAdd = (adhesionId: string) => setSelectedToAdd((current) => {
    if (beneficiaryAdhesionIds.has(adhesionId) || historicalBeneficiaryAdhesionIds.has(adhesionId)) return current; // déjà bénéficiaire (ce Tour ou un Tour précédent) — jamais re-sélectionnable ici
    const next = new Set(current);
    if (next.has(adhesionId)) {
      next.delete(adhesionId);
      if (!withPurchase) {
        const orderedIds = contributions.map((row) => row.adhesionId);
        for (const id of orderedIds.slice(orderedIds.indexOf(adhesionId) + 1)) next.delete(id);
      }
      return next;
    }
    if (!withPurchase) {
      const orderedIds = contributions.map((row) => row.adhesionId);
      const index = orderedIds.indexOf(adhesionId);
      const precedingReady = orderedIds.slice(0, index).every((id) => beneficiaryAdhesionIds.has(id) || historicalBeneficiaryAdhesionIds.has(id) || next.has(id));
      if (!precedingReady) return current;
    }
    next.add(adhesionId);
    return next;
  });
  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink asChild><button type="button" onClick={() => navigate('/tontines')} className="hover:text-foreground">{t('nav', 'tontines')}</button></BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink asChild><button type="button" onClick={() => navigate(`/tontines/${tontineId}`)} className="hover:text-foreground">{tontine.name}</button></BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>{t('tontines', 'tourBreadcrumbLabel', { number: String(occurrence.occurrenceNumber) })}</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    {/*
      Navigation contextuelle (mandat « améliorer la navigation sur le
      détail d'un Tour ») — complémentaire du breadcrumb ci-dessus, jamais un
      remplacement. Le bouton « Retour aux Tours » n'est PAS un onglet
      (poids visuel inférieur, ghost) ; la navigation principale RÉUTILISE
      telle quelle la même liste d'onglets que `TontineDetail`
      (`tabOverview`/`tabAdherents`/`tabTours`, mêmes routes explicites
      `/tontines/:tontineId/<segment>`) — jamais une seconde logique
      d'onglets. Cette page est toujours conceptuellement « dans » Tours :
      `value="tours"` est fixe, chaque `TabsTrigger` navigue explicitement
      au clic (y compris « Tours » lui-même, qui doit ramener à la LISTE des
      Tours même si son onglet est déjà visuellement actif — un
      `onValueChange` seul ne se déclenche jamais pour une valeur inchangée).
    */}
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => navigate(`/tontines/${tontineId}/tours`)}>
        <ArrowLeftIcon size={14} />{t('tontines', 'backToOccurrences')}
      </Button>
      <Tabs value="tours">
        <TabsList className="flex h-auto w-fit flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="overview" onClick={() => navigate(`/tontines/${tontineId}/overview`)}>{t('tontines', 'tabOverview')}</TabsTrigger>
          <TabsTrigger value="adherents" onClick={() => navigate(`/tontines/${tontineId}/adherents`)}>{t('tontines', 'tabAdherents')}</TabsTrigger>
          <TabsTrigger value="tours" onClick={() => navigate(`/tontines/${tontineId}/tours`)}>{t('tontines', 'tabTours')}</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarDays size={20} /></span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('tontines', 'tourDateTitle', { date: formatTourDate(occurrence.date) })}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{tontine.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge label={t('tontines', closed ? 'occurrenceRealized' : 'occurrencePlanned')} tone={closed ? 'success' : 'info'} />
            {!closed && <PermissionGate permission="beneficiaries.manage"><DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={t('tontines', 'tourActionsMenu')}><MoreVertical size={16} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()}><CheckCircle2 size={14} />{t('tontines', 'closeOccurrence')}</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu></PermissionGate>}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-4 border-t border-border pt-4">
          <HeaderStat label={t('tontines', 'cotisationAmountLabel')} value={<MoneyDisplay amount={expectedAmount} />} />
          <HeaderStat label={t('tontines', 'adherentsTitle')} value={String(contributions.length)} />
          <HeaderStat label={t('tontines', 'beneficiariesLabel')} value={String(beneficiaries.length)} />
          <HeaderStat label={t('tontines', 'collectedLabel')} value={<MoneyDisplay amount={totalPaid} />} />
          <HeaderStat label={t('tontines', 'toCollectLabel')} value={<MoneyDisplay amount={remaining} />} />
        </div>

        {withPurchase && <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShoppingCart size={14} />{t('tontines', 'purchaseHint')}</p>}
      </CardContent>
    </Card>

    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <ContributionsColumn
        t={t} contributions={contributions} memberById={contributionMemberById} beneficiaryAdhesionIds={beneficiaryAdhesionIds}
        historicalBeneficiaryAdhesionIds={historicalBeneficiaryAdhesionIds}
        selectedToAdd={selectedToAdd} onToggleSelect={toggleSelectAdd}
        onTogglePayment={(adhesionId, paid) => toggleMutation.mutate({ adhesionId, paid })} onMarkAllPaid={() => markAllMutation.mutate()}
        onAdd={() => addMutation.mutate()}
        closed={closed} togglePendingId={togglePendingId} markAllPending={markAllMutation.isPending} addPending={addMutation.isPending}
        withPurchase={withPurchase}
      />
      <BeneficiariesColumn
        t={t} beneficiaries={beneficiaries} memberById={beneficiaryMemberById} positionByAdhesionId={positionByAdhesionId}
        globalBeneficiaryNumberByAdhesionId={globalBeneficiaryNumberByAdhesionId}
        onRemoveOne={(beneficiaryId) => removeOneMutation.mutate(beneficiaryId)}
        onSettle={(beneficiaryId, amount, purchaseAmount) => settleMutation.mutate({ beneficiaryId, amount, purchaseAmount })}
        closed={closed} withPurchase={withPurchase} removePendingId={removePendingId} settlePendingId={settlePendingId}
      />
    </div>

    <FinancialSummaryPanel
      t={t} totalDue={totalDue} totalPaid={totalPaid} remainderAmount={remainderAmount} totalPurchase={totalPurchase} withPurchase={withPurchase}
      remainders={remaindersForOccurrence} onConsume={(id) => consumeMutation.mutate(id)} onWriteOff={(id) => writeOffMutation.mutate(id)}
      consumePendingId={consumePendingId} writeOffPendingId={writeOffPendingId}
    />
  </div>;
}
