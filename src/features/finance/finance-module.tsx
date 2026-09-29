import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowLeft, Ban, Banknote, CalendarClock, Check, ChevronRight, Clock3, FileText, HandCoins, Landmark, ListChecks, MoreHorizontal, Pencil, Plus, ReceiptText, RotateCcw, ShieldCheck, Trash2, TrendingUp, UsersRound, Vault, WalletCards } from 'lucide-react';
import { Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { WorkflowRequest } from '@/mocks/operations/workflow-requests';
import { PageHeader, DataTable, FilterBar, StatusBadge, FormSection, MoneyDisplay, DateDisplay, EmptyState, StatCard, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, FieldError, ConfirmDialog, MemberAvatar, AmountInput } from '@/components';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { useFiscalYear } from '@/contexts/fiscal-year-context';
import { NotFoundPage, PermissionRoute } from '@/routes';
import { financeService, type CashboxCreateInput, type CashboxLifecycleBlocker, type CashboxLifecycleOutcome, type CashboxUpdateInput, type TransactionInput } from '@/services/finance.service';
import { financePositionService, type CashboxInFiscalYear } from '@/services/finance-position.service';
import { loanPolicyViolations, scopeKey } from '@/lib/finance';
import { creditService } from '@/services/credit.service';
import { workflowService } from '@/services/workflow.service';
import { loanRuleService, type LoanRuleInput, type LoanRuleUpdateInput } from '@/services/loan-rule.service';
import { organizationService } from '@/services/organization.service';
import { fiscalSessionService } from '@/services/fiscal-session.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { matchesStatusFilter, type StatusFilter } from '@/lib/status-filter';
import { cashboxEntryEffect, isCashboxOperational, normalizeCashboxLabel, type CashboxStatus, type CashboxType } from '@/mocks/finance/cashboxes';
import { fiscalYearStatus } from '@/mocks/settings/fiscal-years';
import type { Member } from '@/mocks/organization/members';
import type { Transaction, TransactionType } from '@/mocks/finance/transactions';
import type { Loan } from '@/mocks/finance/loans';
import type { Application } from '@/mocks/finance/applications';
import type { Repayment } from '@/mocks/finance/repayments';
import type { Guarantor } from '@/mocks/finance/guarantors';
import { TRANSACTION_CATEGORIES, TRANSACTION_OPERATIONS, OTHER_OPERATION_SUBCATEGORIES, operationForClassification, operationLabelKey, classificationForOperation, DEFAULT_DIRECTION, requiredTransactionType, categoryLabelKey, subcategoryLabelKey, subcategoriesFor, isLoanDisbursement, isLoanRepayment, type TransactionCategory, type TransactionSubcategory, type TransactionOperation } from '@/mocks/finance/transaction-classification';
import { LOAN_MODES, type LoanRule, type LoanRuleApprovalLevel, type LoanRuleGuaranteeType, type LoanRuleInterestPeriod, type LoanRuleLoanMode } from '@/mocks/finance/loan-rules';
import type { TableColumn } from '@/types/ui';
import { formatDate, formatNumber } from '@/lib/utils';
import { formatCurrency } from '@/constants/currencies';
import { useOrganizationCurrency } from '@/hooks/use-organization-currency';
import { TransactionQuickEntry } from './transaction-quick-entry';
import { MemberBalanceSheetPage } from './member-balance-sheet-page';
import { LoanFundingSection } from './loan-funding-section';
import { ALL_SESSIONS, FinanceSessionProvider, SESSION_PARAM, useFinanceSession } from './finance-session-context';
import { AddSessionDialog, SessionPicker } from './session-picker';
import { planLoanFunding, complementsFrom, fundingAvailabilityOf, savingsCashboxOf, loanApprovalStep } from '@/lib/finance';

export type T = (section: 'finance' | 'settings' | 'nav', key: string, values?: Record<string, string>) => string;

/**
 * Séances de l'exercice fiscal courant — SOURCE DE VÉRITÉ unique de
 * tout champ « Séance » du journal financier. `FiscalSession` est une entité
 * RÉELLEMENT PERSISTÉE (`fiscalSessionService`), jamais dérivée en masse.
 *   - `sessions` : les séances déjà créées pour l'exercice sélectionné, dans l'ordre.
 *   - `latestId` : la dernière séance créée, proposée par défaut.
 *   - `hasSessions` : `false` → aucune séance n'existe encore pour cet exercice.
 */
export function useFiscalSessions() {
  const { currentTenant } = useTenant();
  const { currentFiscalYear } = useFiscalYear();
  const fiscalYearId = currentFiscalYear?.id;
  const enabled = Boolean(fiscalYearId);
  const { data: sessions = [] } = useQuery({
    queryKey: queryKeys.finance.sessions.list(currentTenant.id, fiscalYearId),
    queryFn: () => fiscalSessionService.listSessions(currentTenant.id, fiscalYearId as string),
    enabled,
  });
  const dateById = useMemo(() => new Map(sessions.map((session) => [session.id, session.date])), [sessions]);
  const latest = sessions.length > 0 ? sessions[sessions.length - 1] : undefined;
  return { sessions, dateById, latestId: latest?.id ?? '', fiscalYearId, hasSessions: sessions.length > 0 };
}

/**
 * Champ « Séance » commun à la création et à l'édition — `value`/`onChange`
 * portent le `sessionId` (jamais une date libre, jamais un id technique
 * affiché : l'option montre « Séance #N — date »). Aucune séance encore créée
 * pour l'exercice → état explicite, jamais une séance inventée ; l'utilisateur
 * est renvoyé vers Finance → Exercices fiscaux pour en créer une.
 */
export function SessionField({ t, value, onChange, sessions, hasSessions }: { t: T; value: string; onChange: (sessionId: string) => void; sessions: { id: string; sessionNumber: number; date: string }[]; hasSessions: boolean }) {
  return <div className="space-y-2"><Label htmlFor="tx-session">{t('finance', 'sessionField')}</Label>
    <select id="tx-session" value={value} disabled={!hasSessions} onChange={(event) => onChange(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60">
      <option value="">{t('finance', 'noSession')}</option>
      {sessions.map((session) => <option key={session.id} value={session.id}>{t('finance', 'sessionOption', { number: String(session.sessionNumber), date: formatDate(session.date) })}</option>)}
    </select>
    {!hasSessions && <p className="text-[11px] text-amber-700 dark:text-amber-300">{t('finance', 'noSessionForFiscalYear')}</p>}
  </div>;
}
/**
 * « Date de séance » d'une NOUVELLE transaction (mandat §17) — héritée du
 * contexte Finance, en LECTURE SEULE : jamais choisie dans le formulaire.
 * Sans séance précise (« Toutes les séances » / aucune séance), la création est
 * bloquée par `SessionRequiredNotice`.
 */
export function ContextSessionField({ t, id = 'tx-session-context' }: { t: T; id?: string }) {
  const { currentSession } = useFinanceSession();
  return <div className="space-y-2"><Label htmlFor={id}>{t('finance', 'sessionDatePicker')}</Label>
    <Input id={id} value={currentSession ? formatDate(currentSession.date) : t('finance', 'sessionRequiredTitle')} readOnly disabled aria-describedby={`${id}-hint`} />
    <p id={`${id}-hint`} className="text-[11px] text-muted-foreground">{t('finance', 'sessionFromContextHint')}</p>
  </div>;
}

/** Blocage explicite d'une création sans séance précise (§9/§18) — jamais `sessionId = « Toutes les séances »`. */
export function SessionRequiredNotice({ t }: { t: T }) {
  const { hasSessions, currentSession, isLoading } = useFinanceSession();
  // Rien tant que les séances chargent : jamais un faux « aucune séance » affiché un instant.
  if (currentSession || isLoading) return null;
  return <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="session-required">
    <p className="font-semibold">{t('finance', hasSessions ? 'sessionRequiredTitle' : 'newTransactionNoSessionTitle')}</p>
    <p>{t('finance', hasSessions ? 'sessionRequiredMessage' : 'newTransactionNoSession')}</p>
  </div>;
}

const tone = { active: 'success' as const, archived: 'default' as const, inactive: 'default' as const, completed: 'success' as const, pending: 'warning' as const, failed: 'error' as const, cancelled: 'default' as const, scheduled: 'info' as const, late: 'error' as const, stageSubmitted: 'info' as const, stageReview: 'warning' as const, stageApproved: 'success' as const, stageRejected: 'error' as const, stageDisbursed: 'success' as const, repaid: 'success' as const, defaulted: 'error' as const, applied: 'error' as const, waived: 'default' as const };

export function Page({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="FINANCE" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label }: { label: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={15} />{label}</Button>; }
/** Retour vers une route FIXE (même composant que Tontines) — jamais l'historique, pour qu'une fiche ouverte après un changement d'exercice ramène toujours à la liste. */
export function BackTo({ label, to }: { label: string; to: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(to)}><ArrowLeft size={15} />{label}</Button>; }
function Info({ label, value, icon: Icon }: { label: string; value: ReactNode; icon: typeof Landmark }) { return <div className="flex gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }

const CASHBOX_TYPE_LABEL_KEY: Record<CashboxType, string> = { LIBRE: 'cashboxTypeLibre', TAUX_FIXE: 'cashboxTypeTauxFixe' };

/**
 * Exercice courant du contexte global + ses caisses (tenant + exercice). Toute
 * vue Caisse passe par ce hook : les clés de requête portent `fiscalYearId`,
 * donc un changement d'exercice ne peut jamais réafficher les chiffres de
 * l'ancien (pas de `keepPreviousData`).
 */
function useFiscalYearCashboxes() {
  const { currentTenant } = useTenant();
  const { currentFiscalYear, isLoading: isFiscalYearLoading } = useFiscalYear();
  const fiscalYearId = currentFiscalYear?.id;
  const query = useQuery({
    queryKey: queryKeys.finance.cashboxesByFiscalYear(currentTenant.id, fiscalYearId),
    queryFn: async () => (await financePositionService.cashboxesForFiscalYear(currentTenant.id, fiscalYearId!)) ?? [],
    enabled: Boolean(fiscalYearId),
  });
  return { currentFiscalYear, isFiscalYearLoading, ...query, cashboxes: query.data ?? [] };
}

/**
 * Libellé humain d'une extrémité d'écriture (`Transaction.source`/`destination`) :
 * le NOM de la caisse quand l'extrémité est une caisse du tenant (jamais son
 * numéro technique), sinon la valeur telle quelle (nom d'adhérent, tiers).
 */
function useTransactionPartyLabel() {
  const { currentTenant } = useTenant();
  const { data: cashboxes = [] } = useQuery({ queryKey: queryKeys.finance.cashboxes(currentTenant.id), queryFn: () => financeService.listCashboxes(currentTenant.id) });
  const titleByNumber = useMemo(() => new Map(cashboxes.map((cashbox) => [cashbox.cashboxNumber, cashbox.title])), [cashboxes]);
  return (party: string) => titleByNumber.get(party) ?? party;
}

/** Transactions de l'exercice courant (tenant + exercice), même clé que le journal Transactions. */
function useFiscalYearTransactions() {
  const { currentTenant } = useTenant();
  const { currentFiscalYear } = useFiscalYear();
  const fiscalYearId = currentFiscalYear?.id;
  return useQuery({
    queryKey: queryKeys.finance.transactionsByFiscalYear(currentTenant.id, fiscalYearId),
    queryFn: () => financeService.listTransactionsForFiscalYear(currentTenant.id, fiscalYearId!),
    enabled: Boolean(fiscalYearId),
  });
}

function SystemCashboxBadge({ t }: { t: T }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><ShieldCheck size={11} />{t('finance', 'systemCashboxBadge')}</span>;
}

/** Libellés / tons du cycle de vie d'une caisse (Active · Désactivée · Archivée). */
const CASHBOX_STATUS_LABEL_KEY: Record<CashboxStatus, string> = { active: 'cashboxStatusActive', inactive: 'cashboxStatusInactive', archived: 'cashboxStatusArchived' };
const CASHBOX_STATUS_TONE: Record<CashboxStatus, 'success' | 'warning' | 'default'> = { active: 'success', inactive: 'warning', archived: 'default' };
function CashboxStatusBadge({ t, status }: { t: T; status: CashboxStatus }) {
  return <StatusBadge label={t('finance', CASHBOX_STATUS_LABEL_KEY[status])} tone={CASHBOX_STATUS_TONE[status]} />;
}

/** `delete` = suppression LOGIQUE (active → inactive, `financeService.deleteCashbox`) — jamais une suppression physique. */
type CashboxLifecycleAction = 'delete' | 'reactivate' | 'archive' | 'unarchive';
const LIFECYCLE_KEYS: Record<CashboxLifecycleAction, { menu: string; title: string; description: string; confirm: string; success: string }> = {
  delete: { menu: 'deleteCashboxAction', title: 'deleteCashboxTitle', description: 'deleteCashboxConfirm', confirm: 'deleteCashboxConfirmAction', success: 'cashboxDeleted' },
  reactivate: { menu: 'reactivateCashbox', title: 'reactivateCashboxTitle', description: 'reactivateCashboxConfirm', confirm: 'reactivateAction', success: 'cashboxReactivated' },
  archive: { menu: 'archiveCashbox', title: 'archiveCashboxTitle', description: 'archiveCashboxConfirm', confirm: 'archiveAction', success: 'cashboxArchived' },
  unarchive: { menu: 'unarchiveCashbox', title: 'unarchiveCashboxTitle', description: 'unarchiveCashboxConfirm', confirm: 'unarchiveAction', success: 'cashboxUnarchived' },
};
const LIFECYCLE_BLOCKER_KEY: Record<CashboxLifecycleBlocker | 'invalidStatus', string> = {
  systemProtected: 'cashboxLifecycleSystemProtected', fundsActiveLoan: 'cashboxLifecycleFundsActiveLoan', linkedToActiveTontine: 'cashboxLifecycleLinkedTontine', invalidStatus: 'cashboxLifecycleInvalidStatus',
};

/**
 * Transitions permises depuis un statut (mandat §27) — le service reste l'autorité (il revérifie et explique tout refus).
 * « Supprimer » (dernière entrée, en rouge) n'est proposé qu'à une caisse active : une caisse inactive est déjà supprimée logiquement.
 */
export function cashboxLifecycleActionsFor(status: CashboxStatus): CashboxLifecycleAction[] {
  if (status === 'active') return ['archive', 'delete'];
  if (status === 'inactive') return ['reactivate', 'archive'];
  return ['unarchive'];
}

/**
 * Cycle de vie d'une caisse — UNE implémentation partagée par la liste (menu de
 * ligne) et la fiche caisse (menu « ⋯ ») : entrées de menu selon le statut,
 * confirmation obligatoire (textes du mandat §28-§30), appel du service, et
 * explication de la raison métier réelle en cas de refus. « Supprimer » =
 * désactivation logique : jamais de suppression physique.
 */
function useCashboxLifecycle(t: T) {
  const { currentTenant } = useTenant();
  const { can } = usePermissions();
  const [pending, setPending] = useState<{ action: CashboxLifecycleAction; id: string; title: string } | null>(null);
  const mutation = useMockMutation<CashboxLifecycleOutcome | undefined, { action: CashboxLifecycleAction; id: string }>({
    mutationFn: async ({ action, id }) => {
      if (action === 'reactivate') {
        const cashbox = await financeService.reactivateCashbox(currentTenant.id, id);
        return cashbox ? { ok: true, cashbox } : { ok: false, reason: 'invalidStatus' };
      }
      if (action === 'delete') return financeService.deleteCashbox(currentTenant.id, id);
      if (action === 'archive') return financeService.archiveCashbox(currentTenant.id, id);
      return financeService.unarchiveCashbox(currentTenant.id, id);
    },
    invalidateKeys: [['finance', 'cashboxes']],
    onSuccess: (outcome, { action }) => {
      setPending(null);
      if (!outcome) { notify.error(t('finance', 'transactionActionFailed')); return; }
      if (!outcome.ok) { notify.error(t('finance', LIFECYCLE_BLOCKER_KEY[outcome.reason])); return; }
      notify.success(t('finance', LIFECYCLE_KEYS[action].success));
    },
  });
  const canManage = can('cashboxes.manage');
  const canDelete = can('cashboxes.delete');
  // Caisse système : aucune transition proposée (le service refuserait toujours — `systemProtected`).
  // Permissions inchangées : `cashboxes.delete` pour « Supprimer », `cashboxes.manage` pour le reste du cycle de vie.
  const menuItems = (cashbox: { id: string; title: string; status: CashboxStatus; systemCode?: string }) => cashbox.systemCode ? [] : cashboxLifecycleActionsFor(cashbox.status).filter((action) => (action === 'delete' ? canDelete : canManage)).map((action) => {
    const Icon = action === 'delete' ? Trash2 : action === 'reactivate' ? RotateCcw : action === 'archive' ? Archive : ArchiveRestore;
    return <DropdownMenuItem key={action} onSelect={() => setPending({ action, id: cashbox.id, title: cashbox.title })} className={action === 'delete' ? 'text-destructive focus:text-destructive' : undefined}><Icon size={14} className="mr-2" />{t('finance', LIFECYCLE_KEYS[action].menu)}</DropdownMenuItem>;
  });
  const dialog = pending ? <ConfirmDialog open destructive={pending.action === 'delete'} title={t('finance', LIFECYCLE_KEYS[pending.action].title)} description={t('finance', LIFECYCLE_KEYS[pending.action].description, { title: pending.title })} confirmLabel={t('finance', LIFECYCLE_KEYS[pending.action].confirm)} cancelLabel={t('finance', 'cancel')} confirmDisabled={mutation.isPending} onConfirm={() => mutation.mutate({ action: pending.action, id: pending.id })} onCancel={() => setPending(null)} /> : null;
  return { menuItems, dialog, canManage };
}

/**
 * FINANCE → TRÉSORERIE (mandat « Trésorerie », 2026-09-27) — un espace unique,
 * deux onglets FRÈRES portés par l'URL (refresh, précédent/suivant et liens
 * directs conservent l'onglet) :
 *   - `/finance/treasury/cashboxes`    → onglet « Caisses »
 *   - `/finance/treasury/transactions` → onglet « Transactions » (`?cashboxId=` pré-filtre une caisse)
 * `/finance/treasury` seul choisit l'onglet par défaut (Transactions dès qu'une
 * caisse existe, sinon Caisses). Anciennes URLs (`/finance/cashboxes[?tab=]`,
 * `/finance/transactions`) → redirection, jamais une seconde implémentation.
 */
export const TREASURY_PATH = '/finance/treasury';
/** Paramètres → Exercices fiscaux (constante dupliquée volontairement : importer le module Paramètres casserait le découpage lazy des domaines). */
const FISCAL_YEARS_SETTINGS_PATH = '/settings/fiscal-years';
type TreasuryTabKey = 'cashboxes' | 'transactions';
export const treasuryTabPath = (tab: TreasuryTabKey) => `${TREASURY_PATH}/${tab}`;

/** Lien « Voir les transactions » d'une caisse : onglet Transactions, caisse pré-filtrée (l'id ne sert que de paramètre d'URL, jamais affiché), séance courante conservée par le contexte Finance. */
export const cashboxTransactionsPath = (cashboxId: string) => `${treasuryTabPath('transactions')}?cashboxId=${encodeURIComponent(cashboxId)}`;

/** `/finance/treasury` (menu, changement d'exercice) : onglet par défaut DYNAMIQUE, décidé une fois les caisses chargées. */
function TreasuryIndexRedirect({ t }: { t: T }) {
  const { currentFiscalYear, isFiscalYearLoading, cashboxes, isLoading } = useFiscalYearCashboxes();
  if (isFiscalYearLoading || (currentFiscalYear && isLoading)) return <TreasuryLayout t={t} tab="cashboxes" loading />;
  return <Navigate to={treasuryTabPath(cashboxes.length > 0 ? 'transactions' : 'cashboxes')} replace />;
}

/** Compatibilité : `/finance/cashboxes?tab=…&cashboxId=…` → `/finance/treasury/<onglet>?cashboxId=…`. */
function LegacyCashboxesRedirect() {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  const tab = params.get('tab');
  params.delete('tab');
  if (tab !== 'transactions') params.delete('cashboxId');
  const search = params.toString();
  const target = tab === 'cashboxes' || tab === 'transactions' ? treasuryTabPath(tab) : TREASURY_PATH;
  return <Navigate to={`${target}${search ? `?${search}` : ''}`} replace />;
}

/** Compatibilité : `/finance/transactions[?…]` → onglet Transactions (paramètres conservés). */
function LegacyTransactionsRedirect() {
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  return <Navigate to={`${treasuryTabPath('transactions')}${search ? `?${search}` : ''}`} replace />;
}

/**
 * Gabarit de la page Trésorerie : fil d'Ariane Finance → Trésorerie → onglet,
 * titre = onglet actif, puis la barre d'onglets (composant `Tabs` du design
 * system). Changer d'onglet = navigation (entrée d'historique), le `?cashboxId=`
 * n'est conservé que vers Transactions.
 */
function TreasuryLayout({ t, tab, loading = false, children }: { t: T; tab: TreasuryTabKey; loading?: boolean; children?: ReactNode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentFiscalYearId } = useFiscalYear();
  const tabLabel = t('finance', tab === 'transactions' ? 'transactionsTab' : 'cashboxesTab');
  /** Arrivé depuis une séance (Paramètres → Exercices fiscaux → séance) : retour à la fiche de l'exercice courant, comme l'ancienne page séance. */
  const backToFiscalYear = tab === 'transactions' && searchParams.has(SESSION_PARAM) && currentFiscalYearId
    ? <PermissionGate permission="fiscalYears.read"><Button variant="ghost" size="sm" onClick={() => navigate(`${FISCAL_YEARS_SETTINGS_PATH}/${currentFiscalYearId}`)}><ArrowLeft size={15} />{t('finance', 'backToFiscalYear')}</Button></PermissionGate>
    : undefined;
  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>{t('nav', 'finance')}</BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink asChild><button type="button" onClick={() => navigate(TREASURY_PATH)} className="hover:text-foreground">{t('nav', 'treasury')}</button></BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>{tabLabel}</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
    <PageHeader eyebrow={t('nav', 'treasury')} title={tabLabel} description={t('finance', tab === 'transactions' ? 'transactionsTabDescription' : 'cashboxesHomeDescription')} actions={backToFiscalYear} />
    <Tabs value={tab} onValueChange={(value) => navigate(treasuryTabPath(value as TreasuryTabKey))}>
      <TabsList className="h-auto gap-1 bg-muted p-1">
        <TabsTrigger value="cashboxes" className="px-4"><WalletCards size={15} className="mr-1.5" />{t('finance', 'cashboxesTab')}</TabsTrigger>
        <TabsTrigger value="transactions" className="px-4"><ReceiptText size={15} className="mr-1.5" />{t('finance', 'transactionsTab')}</TabsTrigger>
      </TabsList>
    </Tabs>
    {loading ? <TableSkeleton /> : children}
  </div>;
}

/** Page Trésorerie pour un onglet donné (fourni par la route). Point d'arrivée de tout changement d'exercice (`FiscalYearSelector`). */
function TreasuryPage({ t, tab }: { t: T; tab: TreasuryTabKey }) {
  const navigate = useNavigate();
  const { currentFiscalYear, isFiscalYearLoading } = useFiscalYearCashboxes();
  if (isFiscalYearLoading) return <TreasuryLayout t={t} tab={tab} loading />;
  if (!currentFiscalYear) return <TreasuryLayout t={t} tab={tab}><EmptyState icon={CalendarClock} title={t('finance', 'noFiscalYearSelected')} /></TreasuryLayout>;
  return <TreasuryLayout t={t} tab={tab}>
    {tab === 'cashboxes' ? <CashboxesTab t={t} /> : <TransactionsTab t={t} onGoToCashboxes={() => navigate(treasuryTabPath('cashboxes'))} />}
  </TreasuryLayout>;
}

/**
 * ONGLET « CAISSES » — gestion des caisses (mini dashboard de l'exercice + liste).
 * Toutes les données sont tenant + exercice courant : solde global et soldes =
 * fin d'exercice, total crédit / total débit = Σ crédits / Σ débits des caisses
 * (perspective caisse, `flows`) DE l'exercice. Les KPI portent sur toutes les
 * caisses (l'argent d'une caisse désactivée ou archivée existe toujours) ; la
 * LISTE est centrée par défaut sur les caisses actives (filtre Statut, §32).
 */
function CashboxesTab({ t }: { t: T }) {
  const navigate = useNavigate(); const [search, setSearch] = useState('');
  /** Filtre Statut (défaut : actives). « Inactives » = toute caisse non active (supprimée logiquement ou archivée — son badge Statut les distingue). */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const { locale } = useLocale();
  const currency = useOrganizationCurrency();
  const { currentFiscalYear, cashboxes, isLoading, isError, refetch } = useFiscalYearCashboxes();
  const { data: yearTransactions = [] } = useFiscalYearTransactions();
  const lifecycle = useCashboxLifecycle(t);
  const { can } = usePermissions();

  if (!currentFiscalYear || isLoading) return <TableSkeleton />;
  if (isError) return <ErrorState onRetry={refetch} />;

  /** Σ `yearOpeningBalance` du moteur (`cashboxesFiscalYearSummary` : solde la veille du début d'exercice, report à nouveau inclus) — jamais recalculé ici. */
  const totalOpeningBalance = cashboxes.reduce((sum, cashbox) => sum + cashbox.yearOpeningBalance, 0);
  const totalBalance = cashboxes.reduce((sum, cashbox) => sum + cashbox.balance, 0);
  const inflows = cashboxes.reduce((sum, cashbox) => sum + cashbox.inflows, 0);
  const outflows = cashboxes.reduce((sum, cashbox) => sum + cashbox.outflows, 0);
  const movementCount = yearTransactions.filter((tr) => tr.status === 'completed').length;
  const activeCount = cashboxes.filter((cashbox) => cashbox.status === 'active').length;
  const filtered = cashboxes.filter((cashbox) => matchesStatusFilter(cashbox.status === 'active', statusFilter) && cashbox.title.toLowerCase().includes(search.toLowerCase()));
  const canEdit = can('cashboxes.update');

  const columns: TableColumn<CashboxInFiscalYear>[] = [
    { key: 'title', header: t('finance', 'cashboxTitle'), render: (row) => <span className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => navigate(`/finance/cashboxes/${row.id}`)} className="text-left font-medium text-primary hover:underline">{row.title}</button></span> }, // Plus de badge « Caisse système » dans la liste (affichage seul : `systemCode` et ses règles restent intacts, la fiche caisse garde le badge).
    { key: 'type', header: t('finance', 'cashboxType'), render: (row) => <StatusBadge label={t('finance', CASHBOX_TYPE_LABEL_KEY[row.type])} tone={row.type === 'TAUX_FIXE' ? 'info' : 'default'} /> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <CashboxStatusBadge t={t} status={row.status} /> },
    /**
     * Situation financière de la caisse SUR L'EXERCICE COURANT — valeurs lues telles quelles sur
     * `CashboxInFiscalYear` (`cashboxesFiscalYearSummary`), jamais recalculées ici : solde à
     * l'ouverture = solde la veille du début d'exercice, crédit/débit = mêmes Σ que les KPI
     * « Total crédit »/« Total débit », solde = `balanceAsOf` en fin d'exercice
     * (= ouverture + crédit − débit par construction du moteur).
     */
    { key: 'yearOpeningBalance', header: t('finance', 'cashboxOpeningBalanceColumn'), className: 'whitespace-nowrap text-right', render: (row) => <span className="tabular-nums"><MoneyDisplay amount={row.yearOpeningBalance} /></span> },
    { key: 'inflows', header: t('finance', 'credit'), className: 'whitespace-nowrap text-right', render: (row) => <span className="tabular-nums"><MoneyDisplay amount={row.inflows} /></span> },
    { key: 'outflows', header: t('finance', 'debit'), className: 'whitespace-nowrap text-right', render: (row) => <span className="tabular-nums"><MoneyDisplay amount={row.outflows} /></span> },
    { key: 'balance', header: t('finance', 'balance'), className: 'whitespace-nowrap text-right', render: (row) => <span className="font-semibold tabular-nums"><MoneyDisplay amount={row.balance} /></span> },
    { key: 'lastMovement', header: t('finance', 'lastMovement'), className: 'min-w-[7rem]', render: (row) => row.lastMovement ? <DateDisplay value={row.lastMovement} /> : <span className="text-muted-foreground">{t('finance', 'noMovementInFiscalYear')}</span> },
    /** Actions de la ligne (§27) : menu « ⋯ » selon le statut + flèche vers la fiche. */
    { key: 'actions', header: '', className: 'w-px whitespace-nowrap', render: (row) => <span className="flex items-center justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label={t('finance', 'cashboxRowActions', { title: row.title })} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><MoreHorizontal size={16} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => navigate(cashboxTransactionsPath(row.id))}><ReceiptText size={14} className="mr-2" />{t('finance', 'viewTransactions')}</DropdownMenuItem>
          {canEdit && row.status !== 'archived' && <DropdownMenuItem onSelect={() => navigate(`/finance/cashboxes/${row.id}/edit`)}><Pencil size={14} className="mr-2" />{t('finance', 'editCashbox')}</DropdownMenuItem>}
          {lifecycle.menuItems(row)}
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" onClick={() => navigate(`/finance/cashboxes/${row.id}`)} aria-label={t('finance', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button>
    </span> },
  ];

  return <div className="space-y-6">
    {lifecycle.dialog}
    {/*
      Ordre narratif : ouverture → + crédits → − débits → solde, puis le nombre de caisses.
      5 cartes : 2 colonnes (sm), puis 3 + 2 cartes élargies sur une grille de 6 (lg, aucune case vide),
      puis une seule ligne de 5 (2xl) — les montants restent complets et lisibles à chaque palier.
    */}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 2xl:grid-cols-5" data-testid="cashbox-home-kpis">
      <div className="lg:col-span-2 2xl:col-span-1 [&>article]:h-full"><StatCard label={t('finance', 'cashboxHomeOpeningBalance')} value={formatCurrency(totalOpeningBalance, currency, locale)} detail={t('finance', 'cashboxHomeBalanceDetail', { date: formatDate(currentFiscalYear.startDate) })} icon={Vault} tone="info" /></div>
      <div className="lg:col-span-2 2xl:col-span-1 [&>article]:h-full"><StatCard label={t('finance', 'cashboxHomeTotalCredit')} value={formatCurrency(inflows, currency, locale)} detail={t('finance', 'cashboxHomeMovementsDetail', { count: formatNumber(movementCount) })} icon={Banknote} tone="neutral" /></div>
      <div className="lg:col-span-2 2xl:col-span-1 [&>article]:h-full"><StatCard label={t('finance', 'cashboxHomeTotalDebit')} value={formatCurrency(outflows, currency, locale)} icon={HandCoins} tone="neutral" /></div>
      <div className="lg:col-span-3 2xl:col-span-1 [&>article]:h-full"><StatCard label={t('finance', 'cashboxHomeGlobalBalance')} value={formatCurrency(totalBalance, currency, locale)} detail={t('finance', 'cashboxHomeBalanceDetail', { date: formatDate(currentFiscalYear.endDate) })} icon={Landmark} tone="success" /></div>
      <div className="sm:col-span-2 lg:col-span-3 2xl:col-span-1 [&>article]:h-full"><StatCard label={t('finance', 'cashboxes')} value={formatNumber(cashboxes.length)} detail={t('finance', 'cashboxHomeCountDetail', { count: formatNumber(activeCount) })} icon={WalletCards} tone="info" /></div>
    </div>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t('finance', 'cashboxHomeList')}</h2>
        <PermissionGate permission="cashboxes.create"><Button onClick={() => navigate('/finance/cashboxes/create')}><Plus size={16} />{t('finance', 'createCashbox')}</Button></PermissionGate>
      </div>
      <FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchCashboxPlaceholder')} filters={<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} aria-label={t('finance', 'cashboxStatusFilter')} className="h-9 rounded-md border border-input bg-background px-3 text-xs">
        <option value="active">{t('finance', 'cashboxFilterActive')}</option>
        <option value="inactive">{t('finance', 'cashboxFilterInactive')}</option>
        <option value="all">{t('finance', 'cashboxFilterAll')}</option>
      </select>} />
      <DataTable columns={columns} rows={filtered} onRowClick={(row) => navigate(`/finance/cashboxes/${row.id}`)} empty={<EmptyState icon={Landmark} title={t('finance', cashboxes.length === 0 ? 'noCashboxes' : 'noCashboxForStatus')} />} />
    </div>
  </div>;
}

function CashboxFormFields({ t, title, setTitle, type, setType, amount, setAmount, description, setDescription, errors }: {
  t: T; title: string; setTitle: (value: string) => void; type: CashboxType; setType: (value: CashboxType) => void; amount: string; setAmount: (value: string) => void; description: string; setDescription: (value: string) => void; errors: { title?: string; amount?: string };
}) {
  return <FormSection title={t('finance', 'general')}>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="cashbox-title">{t('finance', 'cashboxTitle')} *</Label><Input id="cashbox-title" value={title} onChange={(event) => setTitle(event.target.value)} aria-invalid={Boolean(errors.title)} /><FieldError message={errors.title} /></div>
      <div className="space-y-2"><Label htmlFor="cashbox-type">{t('finance', 'cashboxType')} *</Label><select id="cashbox-type" value={type} onChange={(event) => setType(event.target.value as CashboxType)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="TAUX_FIXE">{t('finance', 'cashboxTypeTauxFixe')}</option><option value="LIBRE">{t('finance', 'cashboxTypeLibre')}</option></select></div>
      {type === 'TAUX_FIXE' && <div className="space-y-2"><Label htmlFor="cashbox-amount">{t('finance', 'amount')}</Label><AmountInput id="cashbox-amount" value={amount} onValueChange={setAmount} aria-invalid={Boolean(errors.amount)} /><FieldError message={errors.amount} /></div>}
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="cashbox-description">{t('finance', 'cotisationDescription')}</Label><Textarea id="cashbox-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
    </div>
  </FormSection>;
}

function CashboxCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const [title, setTitle] = useState(''); const [type, setType] = useState<CashboxType>('TAUX_FIXE'); const [amount, setAmount] = useState(''); const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ title?: string; amount?: string }>({});
  /** Caisses du tenant — sert au garde-fou de saisie (unicité du libellé, règle métier). La validation autoritaire reste côté service (`createCashbox`). */
  const { data: existingCashboxes = [] } = useQuery({ queryKey: queryKeys.finance.cashboxes(currentTenant.id), queryFn: () => financeService.listCashboxes(currentTenant.id) });
  const mutation = useMockMutation<Awaited<ReturnType<typeof financeService.createCashbox>>, CashboxCreateInput>({
    mutationFn: (input) => financeService.createCashbox(currentTenant.id, currentTenant.name, input),
    invalidateKeys: [queryKeys.finance.cashboxes(currentTenant.id)],
    onSuccess: (cashbox) => { if (!cashbox) { notify.error(t('finance', 'duplicateCashLabel')); return; } notify.success(t('finance', 'cashboxCreated')); navigate(`/finance/cashboxes/${cashbox.id}`); },
  });
  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!title.trim()) nextErrors.title = t('finance', 'fieldRequired');
    // Règle métier : deux caisses d'un même tenant ne peuvent pas avoir le même libellé (comparaison normalisée : casse/accents/espaces).
    else if (existingCashboxes.some((cashbox) => normalizeCashboxLabel(cashbox.title) === normalizeCashboxLabel(title))) nextErrors.title = t('finance', 'duplicateCashLabel');
    if (type === 'TAUX_FIXE') { if (!amount) nextErrors.amount = t('finance', 'fieldRequired'); else if (Number(amount) <= 0) nextErrors.amount = t('finance', 'invalidAmount'); }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate({ title, type, amount: type === 'TAUX_FIXE' ? Number(amount) : null, description });
  };
  return <Page title={t('finance', 'createCashbox')} description={t('finance', 'cashboxesDescription')} actions={<Back label={t('finance', 'backToCashboxes')} />}>
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-5">
        <CashboxFormFields t={t} title={title} setTitle={setTitle} type={type} setType={setType} amount={amount} setAmount={setAmount} description={description} setDescription={setDescription} errors={errors} />
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(treasuryTabPath('cashboxes'))}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div>
      </div>
      <FormSection title={t('finance', 'summarySection')}>
        <div className="space-y-4">
          <Info label={t('finance', 'summaryName')} value={title.trim() || '—'} icon={Landmark} />
          <Info label={t('finance', 'cashboxType')} value={t('finance', CASHBOX_TYPE_LABEL_KEY[type])} icon={ListChecks} />
          <Info label={t('finance', 'amount')} value={type === 'TAUX_FIXE' && amount ? `${amount}`.trim() : '—'} icon={Banknote} />
          <Info label={t('finance', 'summaryTenant')} value={`${currentTenant.name} (${currentTenant.id})`} icon={UsersRound} />
        </div>
      </FormSection>
    </div>
  </Page>;
}

function CashboxEdit({ t }: { t: T }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: cashbox, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.finance.cashbox(id), currentTenant.id], queryFn: () => financeService.getCashbox(currentTenant.id, id) });
  /** Autres caisses du tenant — garde-fou d'unicité du libellé (la caisse courante `id` s'exclut elle-même). Validation autoritaire côté service (`updateCashbox`). */
  const { data: existingCashboxes = [] } = useQuery({ queryKey: queryKeys.finance.cashboxes(currentTenant.id), queryFn: () => financeService.listCashboxes(currentTenant.id) });
  const [form, setForm] = useState<{ title: string; type: CashboxType; amount: string; description: string } | null>(null);
  const [errors, setErrors] = useState<{ title?: string; amount?: string }>({});
  const mutation = useMockMutation<Awaited<ReturnType<typeof financeService.updateCashbox>>, CashboxUpdateInput>({
    mutationFn: (patch) => financeService.updateCashbox(currentTenant.id, id, patch),
    invalidateKeys: [queryKeys.finance.cashbox(id), queryKeys.finance.cashboxes(currentTenant.id)],
    onSuccess: (updated) => { if (!updated) { notify.error(t('finance', 'duplicateCashLabel')); return; } notify.success(t('finance', 'cashboxUpdated')); navigate(`/finance/cashboxes/${id}`); },
  });
  if (isLoading) return <Page title={t('finance', 'editCashbox')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'editCashbox')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!cashbox) return <NotFoundPage />;
  const current = form ?? { title: cashbox.title, type: cashbox.type, amount: cashbox.amount === null ? '' : String(cashbox.amount), description: cashbox.description };
  const setField = <K extends keyof typeof current>(key: K, value: (typeof current)[K]) => setForm({ ...current, [key]: value });
  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!current.title.trim()) nextErrors.title = t('finance', 'fieldRequired');
    // Règle métier : le nouveau libellé ne doit pas entrer en collision (normalisée) avec une AUTRE caisse du tenant — la caisse courante garde le droit à son propre libellé.
    else if (existingCashboxes.some((other) => other.id !== id && normalizeCashboxLabel(other.title) === normalizeCashboxLabel(current.title))) nextErrors.title = t('finance', 'duplicateCashLabel');
    if (current.type === 'TAUX_FIXE') { if (!current.amount) nextErrors.amount = t('finance', 'fieldRequired'); else if (Number(current.amount) <= 0) nextErrors.amount = t('finance', 'invalidAmount'); }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate({ title: current.title, type: current.type, amount: current.type === 'TAUX_FIXE' ? Number(current.amount) : null, description: current.description });
  };
  return <Page title={t('finance', 'editCashbox')} description={cashbox.title} actions={<Back label={t('finance', 'backToCashboxes')} />}>
    <div className="max-w-5xl space-y-5">
      <CashboxFormFields t={t} title={current.title} setTitle={(value) => setField('title', value)} type={current.type} setType={(value) => setField('type', value)} amount={current.amount} setAmount={(value) => setField('amount', value)} description={current.description} setDescription={(value) => setField('description', value)} errors={errors} />
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/finance/cashboxes/${id}`)}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div>
    </div>
  </Page>;
}

/**
 * Fiche d'une caisse dans le contexte de l'exercice courant — consultation
 * (situation, informations, transactions DE LA CAISSE) et cycle de vie. Mandat
 * « Évolution globale du module Finance » §21-§23 : AUCUNE saisie de
 * transaction ici — « Voir les transactions » ouvre l'onglet Transactions avec
 * cette caisse pré-filtrée ; le sélecteur « Date de séance » est celui du
 * contexte Finance (changer de séance ici la change partout).
 */
function CashboxDetail({ t }: { t: T }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { currentFiscalYear, isLoading: isFiscalYearLoading } = useFiscalYear();
  const fiscalYearId = currentFiscalYear?.id;
  const { data: cashbox, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.finance.cashboxByFiscalYear(id, currentTenant.id, fiscalYearId),
    queryFn: () => financePositionService.cashboxForFiscalYear(currentTenant.id, id, fiscalYearId!),
    enabled: Boolean(fiscalYearId),
  });
  const { data: yearTransactions = [] } = useFiscalYearTransactions();
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const memberById = useMemo(() => new Map<string, Member>(members.map((member) => [member.id, member])), [members]);
  const { sessions, selection } = useFinanceSession();
  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);
  // Hooks appelés AVANT les retours anticipés (rules-of-hooks) — sinon la page plante au passage chargement → chargé.
  const partyLabel = useTransactionPartyLabel();
  const lifecycle = useCashboxLifecycle(t);
  const { can } = usePermissions();
  if (isFiscalYearLoading || (fiscalYearId && isLoading)) return <Page title={t('finance', 'cashboxDetail')} description=""><DetailSkeleton /></Page>;
  if (!currentFiscalYear) return <Page title={t('finance', 'cashboxDetail')} description=""><EmptyState icon={CalendarClock} title={t('finance', 'noFiscalYearSelected')} /></Page>;
  if (isError) return <Page title={t('finance', 'cashboxDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!cashbox) return <NotFoundPage />;
  /** Même prédicat que `cashboxLedgerEntries` (la caisse figure sur l'une des deux extrémités), restreint à l'exercice courant ET à la séance du contexte Finance. */
  const cashboxTransactions = yearTransactions.filter((tr) => (tr.source === cashbox.cashboxNumber || tr.destination === cashbox.cashboxNumber) && (selection === ALL_SESSIONS || tr.sessionId === selection));
  /** Colonnes orientées « point de vue de cette caisse » (Débit = sortie, Crédit = entrée) → cohérence stricte panneau ↔ solde. */
  const columns = transactionJournalColumns(t, memberById, sessionById, cashbox.cashboxNumber, partyLabel);
  const viewTransactionsButton = <Button onClick={() => navigate(cashboxTransactionsPath(id))}><ReceiptText size={15} />{t('finance', 'viewTransactions')}</Button>;
  /**
   * Actions administratives regroupées dans « ⋯ » : Modifier (sauf caisse archivée, en consultation seule),
   * puis le cycle de vie selon le statut (Réactiver / Archiver / Désarchiver / Supprimer en rouge) —
   * « Supprimer » = désactivation logique ; une caisse système n'expose aucune de ces entrées.
   */
  const canEdit = can('cashboxes.update') && cashbox.status !== 'archived';
  const lifecycleItems = lifecycle.menuItems(cashbox);
  return <Page title={cashbox.title} description={t('finance', 'cashboxDetailDescription')} actions={<>
    <BackTo label={t('finance', 'backToCashboxes')} to={treasuryTabPath('cashboxes')} />
    {viewTransactionsButton}
    {(canEdit || lifecycleItems.length > 0) && <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={t('finance', 'cashboxActions')}><MoreHorizontal size={16} /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && <DropdownMenuItem onSelect={() => navigate(`/finance/cashboxes/${id}/edit`)}><Pencil size={14} className="mr-2" />{t('finance', 'editCashbox')}</DropdownMenuItem>}
        {lifecycleItems}
      </DropdownMenuContent>
    </DropdownMenu>}
  </>}>
    {lifecycle.dialog}
    <div className="grid items-end gap-4 md:grid-cols-[1fr_auto_1fr]">
      <div className="space-y-2" data-testid="cashbox-header-info">
        <div className="flex flex-wrap items-center gap-2"><CashboxStatusBadge t={t} status={cashbox.status} />{cashbox.systemCode && <SystemCashboxBadge t={t} />}</div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5"><dt className="text-muted-foreground">{t('finance', 'cashboxType')} :</dt><dd className="font-medium">{t('finance', CASHBOX_TYPE_LABEL_KEY[cashbox.type])}</dd></div>
          {cashbox.amount !== null && <div className="flex gap-1.5"><dt className="text-muted-foreground">{t('finance', 'amount')} :</dt><dd className="font-medium"><MoneyDisplay amount={cashbox.amount} /></dd></div>}
          <div className="flex gap-1.5"><dt className="text-muted-foreground">{t('finance', 'lastMovement')} :</dt><dd className="font-medium">{cashbox.lastMovement ? <DateDisplay value={cashbox.lastMovement} /> : t('finance', 'noMovementInFiscalYear')}</dd></div>
          <div className="flex gap-1.5"><dt className="text-muted-foreground">{t('finance', 'cashboxOpenedOn')} :</dt><dd className="font-medium"><DateDisplay value={cashbox.openedOn} /></dd></div>
        </dl>
        {cashbox.description && <p className="text-sm text-muted-foreground">{cashbox.description}</p>}
        {cashbox.status !== 'active' && <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="cashbox-not-operational">{t('finance', 'cashboxNotOperationalNotice')}</p>}
      </div>
      <SessionPicker t={t} id="cashbox-session" />
      <div />
    </div>
    <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'cashboxTransactionsTitle')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={columns} rows={cashboxTransactions} onRowClick={(row) => navigate(`/finance/transactions/${row.id}`)} empty={<EmptyState icon={ReceiptText} title={t('finance', 'noCashboxTransactions')} action={viewTransactionsButton} />} /></CardContent></Card>
  </Page>;
}

/**
 * Colonnes du journal des transactions — SOURCE UNIQUE partagée par la vue
 * consolidée `Finance → Transactions` (`TransactionsList`) ET le panel
 * `Transactions` de la fiche caisse (`CashboxDetail`), pour garantir libellés,
 * ordre, mapping métier, formats de date/monnaie et règles de valeur absente
 * strictement identiques entre les deux vues. Exactement les 7 colonnes du
 * mandat, dans cet ordre : Date réunion · Date transaction · Adhérent ·
 * Catégorie · Débit · Crédit · Commentaire. Le statut reste un filtre (jamais
 * une colonne) ; une transaction annulée est grisée + barrée.
 */
/**
 * `cashboxNumber` fourni (panneau « Transactions » de la fiche caisse) → les
 * colonnes Débit/Crédit sont orientées DU POINT DE VUE DE CETTE CAISSE : sortie
 * (`source === cashboxNumber`) = Débit, entrée (`destination === cashboxNumber`)
 * = Crédit. Ainsi chaque ligne visible correspond exactement à son effet sur le
 * solde (`solde = Σ Crédit − Σ Débit`), y compris pour un virement inter-caisses
 * reçu (affiché en Crédit, alors qu'il est un Débit dans le journal du tenant).
 * Sans `cashboxNumber` (journal consolidé) → Débit/Crédit = `Transaction.type`.
 */
function transactionJournalColumns(t: T, memberById: Map<string, Member>, sessionById: Map<string, { sessionNumber: number; date: string }>, cashboxNumber?: string, partyLabel: (party: string) => string = (party) => party, withCashbox = false): TableColumn<Transaction>[] {
  const memberFullName = (memberId: string) => { const member = memberById.get(memberId); return member ? `${member.firstName} ${member.lastName}` : memberId; };
  // Orientation par caisse : signe de `cashboxEntryEffect` (même fonction que le solde) → cohérence stricte panneau ↔ solde. Sans caisse : perspective journal du tenant (`Transaction.type`).
  const effect = (row: Transaction) => (cashboxNumber ? cashboxEntryEffect(cashboxNumber, row) : row.type === 'debit' ? -row.amount : row.amount);
  const isDebit = (row: Transaction) => effect(row) < 0;
  const isCredit = (row: Transaction) => effect(row) > 0;
  const counterparty = (row: Transaction) => partyLabel(row.source === cashboxNumber ? row.destination : row.source);
  // Vue consolidée (onglet Transactions) : colonne « Caisse » = la caisse mouvementée (destination d'un crédit, source d'un débit), toujours par son NOM.
  const cashboxColumn: TableColumn<Transaction>[] = withCashbox ? [{ key: 'cashbox', header: t('finance', 'cashboxField'), render: (row) => <span className="whitespace-nowrap">{partyLabel(row.type === 'credit' ? row.destination : row.source)}</span> }] : [];
  return [
    { key: 'session', header: t('finance', 'sessionColumn'), render: (row) => {
      const session = row.sessionId ? sessionById.get(row.sessionId) : undefined;
      return session ? <span className="whitespace-nowrap">{formatDate(session.date)}</span> : <span className="text-muted-foreground">—</span>;
    } },
    { key: 'transactionDate', header: t('finance', 'transactionDateColumn'), render: (row) => <span className={row.status === 'cancelled' ? 'text-muted-foreground line-through' : undefined}><DateDisplay value={row.recordedAt ?? row.date} withTime={Boolean(row.recordedAt)} /></span> },
    ...cashboxColumn,
    { key: 'member', header: t('finance', 'adherent'), render: (row) => row.memberId ? <span className="flex items-center gap-2 font-medium"><MemberAvatar member={memberById.get(row.memberId) ?? { firstName: memberFullName(row.memberId), lastName: '' }} /><span>{memberFullName(row.memberId)}</span></span> : <span className="text-muted-foreground">{cashboxNumber ? counterparty(row) : '—'}</span> },
    // Colonne « Actions » : la classification stockée (catégorie + sous-catégorie historique, inchangée) est ramenée à l'une des 4 actions de saisie via `operationForClassification` — même règle que le filtre ; la sous-catégorie reste visible sur la fiche transaction.
    { key: 'category', header: t('finance', 'actionsColumn'), render: (row) => <span className="flex items-center gap-2">{t('finance', operationLabelKey(operationForClassification(row.category, row.subcategory)))}{row.status === 'cancelled' && <StatusBadge label={t('finance', 'cancelled')} tone="default" />}</span> },
    { key: 'debit', header: t('finance', 'debit'), render: (row) => isDebit(row) ? <span className={`font-semibold ${row.status === 'cancelled' ? 'text-muted-foreground line-through' : 'text-rose-600 dark:text-rose-400'}`}><MoneyDisplay amount={row.amount} /></span> : <span className="text-muted-foreground">—</span> },
    // « Report dette » (vue consolidée uniquement) : aucun champ de report n'est persisté sur `Transaction` — affichage « — », aucune valeur calculée ni inventée.
    ...(withCashbox ? [{ key: 'debtCarryover', header: t('finance', 'debtCarryoverColumn'), render: () => <span className="text-muted-foreground">—</span> } satisfies TableColumn<Transaction>] : []),
    { key: 'credit', header: t('finance', 'credit'), render: (row) => isCredit(row) ? <span className={`font-semibold ${row.status === 'cancelled' ? 'text-muted-foreground line-through' : 'text-emerald-600 dark:text-emerald-400'}`}><MoneyDisplay amount={row.amount} /></span> : <span className="text-muted-foreground">—</span> },
    { key: 'description', header: t('finance', 'comment'), render: (row) => <span className="text-sm text-muted-foreground" title={row.description}>{row.description || '—'}</span> },
  ];
}

/** Pourquoi « + Nouvelle transaction » est bloqué (mandat §9/§18/§19) — jamais une transaction sans caisse opérationnelle ni séance précise. */
type NewTransactionBlocker = 'noCashbox' | 'noActiveCashbox' | 'noSession' | 'sessionRequired';

/**
 * Point d'entrée UNIQUE « + Nouvelle transaction » (mandat §17/§20) : vérifie
 * le contexte (caisse opérationnelle, séance précise) puis ouvre le formulaire
 * centralisé (`TransactionQuickEntry`), qui hérite de la séance du contexte
 * Finance. Sinon, explique le blocage et propose l'action utile.
 */
function NewTransactionAction({ t, onGoToCashboxes }: { t: T; onGoToCashboxes: () => void }) {
  const navigate = useNavigate();
  const { currentFiscalYear } = useFiscalYear();
  const { cashboxes } = useFiscalYearCashboxes();
  const { currentSession, hasSessions } = useFinanceSession();
  const [blocked, setBlocked] = useState<NewTransactionBlocker | null>(null);
  const [adding, setAdding] = useState(false);
  // Une transaction se rattache à l'exercice qui contient sa date (date système) : saisie proposée uniquement sur un exercice « En cours » — règle appliquée aussi par `insertTransaction`.
  if (!currentFiscalYear || fiscalYearStatus(currentFiscalYear) !== 'in_progress') return null;
  const open = () => {
    if (cashboxes.length === 0) return setBlocked('noCashbox');
    if (!cashboxes.some((cashbox) => isCashboxOperational(cashbox))) return setBlocked('noActiveCashbox');
    if (!hasSessions) return setBlocked('noSession');
    if (!currentSession) return setBlocked('sessionRequired');
    navigate('/finance/transactions/quick-entry');
  };
  const titleKey: Record<NewTransactionBlocker, string> = { noCashbox: 'newTransactionNoCashboxTitle', noActiveCashbox: 'newTransactionNoCashboxTitle', noSession: 'newTransactionNoSessionTitle', sessionRequired: 'sessionRequiredTitle' };
  const messageKey: Record<NewTransactionBlocker, string> = { noCashbox: 'newTransactionNoCashbox', noActiveCashbox: 'newTransactionNoActiveCashbox', noSession: 'newTransactionNoSession', sessionRequired: 'sessionRequiredMessage' };
  return <>
    <PermissionGate permission="transactions.create"><Button onClick={open}><Plus size={16} />{t('finance', 'newTransaction')}</Button></PermissionGate>
    {blocked && <Dialog open onOpenChange={(next) => { if (!next) setBlocked(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('finance', titleKey[blocked])}</DialogTitle><DialogDescription>{t('finance', messageKey[blocked])}</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBlocked(null)}>{t('finance', 'close')}</Button>
          {(blocked === 'noCashbox' || blocked === 'noActiveCashbox') && <Button onClick={() => { setBlocked(null); onGoToCashboxes(); }}>{t('finance', 'goToCashboxes')}</Button>}
          {blocked === 'noSession' && <PermissionGate permission="fiscalYears.manage"><Button onClick={() => { setBlocked(null); setAdding(true); }}><Plus size={14} />{t('finance', 'addSession')}</Button></PermissionGate>}
        </DialogFooter>
      </DialogContent>
    </Dialog>}
    {adding && <AddSessionDialog t={t} open onClose={() => setAdding(false)} />}
  </>;
}

/**
 * ONGLET « TRANSACTIONS » — centre opérationnel des transactions (mandat
 * « Évolution globale du module Finance » §2/§6-§15). Périmètre = tenant +
 * exercice courant (`useFiscalYear`, sélecteur global inchangé) + séance du
 * contexte Finance (`useFinanceSession`, sélecteur « Date de séance » centré).
 *
 * Filtres combinables : séance (ou « Toutes les séances ») × caisse (ou
 * « Toutes les caisses », `?cashboxId=` pour arriver depuis une caisse) ×
 * adhérent × opération × statut × type × recherche. La liste reprend les
 * colonnes du journal (`transactionJournalColumns`, source unique partagée avec
 * la fiche caisse). Aucun récapitulatif par caisse ici (mandat du 2026-09-27) :
 * la synthèse financière des caisses appartient à l'onglet « Caisses ».
 */
function TransactionsTab({ t, onGoToCashboxes }: { t: T; onGoToCashboxes: () => void }) {
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentFiscalYear } = useFiscalYear();
  /** Pas de `keepPreviousData` : après un changement d'exercice, la zone repasse en chargement — jamais les chiffres de l'ancien exercice sous le nouveau. */
  const { data: allTransactions = [], isLoading: isTransactionsLoading, isError, refetch } = useFiscalYearTransactions();
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const memberById = useMemo(() => new Map<string, Member>(members.map((member) => [member.id, member])), [members]);
  const { sessions, selection, isApplyingRequestedSession } = useFinanceSession();
  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);
  const { cashboxes } = useFiscalYearCashboxes();
  const partyLabel = useTransactionPartyLabel();

  const cashboxId = searchParams.get('cashboxId') ?? '';
  const setCashboxId = (next: string) => setSearchParams((current) => {
    const params = new URLSearchParams(current);
    if (next) params.set('cashboxId', next); else params.delete('cashboxId');
    return params;
  });
  const [memberId, setMemberId] = useState('');
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('all'); const [subcategory, setSubcategory] = useState('all'); const [status, setStatus] = useState('all'); const [type, setType] = useState('all');
  /** Le filtre sous-catégorie n'a de sens que pour la catégorie AUTRES — réinitialisé dès qu'on quitte AUTRES. */
  useEffect(() => { if (category !== 'AUTRES' && subcategory !== 'all') setSubcategory('all'); }, [category, subcategory]);

  /**
   * Caisses proposées dans le filtre — celles de l'exercice courant (y compris
   * désactivées / archivées : leur historique reste consultable, §12/§32),
   * triées par libellé. Règle d'unicité du libellé (`normalizeCashboxLabel`) :
   * jamais deux options de libellé normalisé identique (anomalie de données
   * pré-existante AC-002 « Épargne » / AC-009) — on garde celle qui porte des
   * transactions, puis le plus petit `id`, SAUF la caisse explicitement demandée
   * (`?cashboxId=`), toujours proposée.
   */
  const cashboxNumbersInScope = useMemo(() => new Set(allTransactions.flatMap((tr) => [tr.source, tr.destination])), [allTransactions]);
  const availableCashboxes = useMemo(() => {
    const byLabel = new Map<string, CashboxInFiscalYear>();
    for (const cashbox of cashboxes) {
      const key = cashbox.id === cashboxId ? `__selected__${cashbox.id}` : normalizeCashboxLabel(cashbox.title);
      const kept = byLabel.get(key);
      if (!kept) { byLabel.set(key, cashbox); continue; }
      const cashboxHasTx = cashboxNumbersInScope.has(cashbox.cashboxNumber);
      const keptHasTx = cashboxNumbersInScope.has(kept.cashboxNumber);
      if ((cashboxHasTx && !keptHasTx) || (cashboxHasTx === keptHasTx && cashbox.id < kept.id)) byLabel.set(key, cashbox);
    }
    const selected = cashboxes.find((cashbox) => cashbox.id === cashboxId);
    const values = Array.from(byLabel.values()).filter((cashbox) => !selected || cashbox.id === selected.id || normalizeCashboxLabel(cashbox.title) !== normalizeCashboxLabel(selected.title));
    return values.sort((a, b) => a.title.localeCompare(b.title));
  }, [cashboxes, cashboxNumbersInScope, cashboxId]);
  const selectedCashbox = cashboxes.find((cashbox) => cashbox.id === cashboxId);

  /** Séance (ou toutes) puis caisse — appliqués EN AMONT de tout le reste : liste, compteur et adhérents disponibles en héritent. */
  const scoped = useMemo(() => allTransactions.filter((tr) => (selection === ALL_SESSIONS || tr.sessionId === selection)
    && (!selectedCashbox || tr.source === selectedCashbox.cashboxNumber || tr.destination === selectedCashbox.cashboxNumber)), [allTransactions, selection, selectedCashbox]);
  /** Adhérents réellement porteurs d'au moins une transaction dans le périmètre courant (jamais `Cashbox.memberIds`) — dédoublonnés, triés par nom. */
  const memberIdsWithTransactions = useMemo(() => new Set(scoped.flatMap((tr) => (tr.memberId ? [tr.memberId] : []))), [scoped]);
  const availableMembers = useMemo(
    () => Array.from(memberIdsWithTransactions).map((id) => memberById.get(id)).filter((member): member is Member => Boolean(member)).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)),
    [memberIdsWithTransactions, memberById],
  );
  useEffect(() => { if (memberId && !memberIdsWithTransactions.has(memberId)) setMemberId(''); }, [memberIdsWithTransactions, memberId]);

  const eligible = memberId ? scoped.filter((tr) => tr.memberId === memberId) : scoped;
  const filtered = eligible.filter((tr) => {
    const matchesSearch = `${tr.description} ${partyLabel(tr.source)} ${partyLabel(tr.destination)} ${tr.memberId ? `${memberById.get(tr.memberId)?.firstName ?? ''} ${memberById.get(tr.memberId)?.lastName ?? ''}` : ''}`.toLowerCase().includes(search.toLowerCase());
    // Mêmes catégories que la saisie (`TRANSACTION_OPERATIONS`) : la valeur stockée (catégorie + sous-catégorie) est ramenée à sa catégorie de saisie.
    const matchesCategory = category === 'all' || operationForClassification(tr.category, tr.subcategory) === category;
    const matchesSubcategory = subcategory === 'all' || tr.subcategory === subcategory;
    const matchesStatus = status === 'all' || tr.status === status;
    const matchesType = type === 'all' || tr.type === type;
    return matchesSearch && matchesCategory && matchesSubcategory && matchesStatus && matchesType;
  });

  /** Récapitulatif : toutes les caisses, ou uniquement la caisse filtrée — valeurs du moteur, TOTAL = Σ des lignes affichées. */

  const columns = transactionJournalColumns(t, memberById, sessionById, undefined, partyLabel, true);
  const selectClass = 'h-9 rounded-md border border-input bg-background px-3 text-xs';

  return <div className="space-y-5">
    <Card>
      {/* En-tête du contexte : caisse à gauche, « Date de séance » RÉELLEMENT centrée (grille 1fr · auto · 1fr), action à droite. */}
      <CardContent className="grid items-end gap-4 p-5 md:grid-cols-[1fr_auto_1fr]" data-testid="transactions-context-header">
        <div className="space-y-1.5">
          <Label htmlFor="tr-cashbox">{t('finance', 'cashLabel')}</Label>
          <select id="tr-cashbox" value={selectedCashbox ? selectedCashbox.id : ''} onChange={(event) => setCashboxId(event.target.value)} className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t('finance', 'allCashboxes')}</option>
            {availableCashboxes.map((cashbox) => <option key={cashbox.id} value={cashbox.id}>{cashbox.status === 'active' ? cashbox.title : `${cashbox.title} (${t('finance', CASHBOX_STATUS_LABEL_KEY[cashbox.status])})`}</option>)}
          </select>
          {availableCashboxes.length === 0 && <p className="text-[11px] text-muted-foreground">{t('finance', 'noCashboxForFiscalYear')}</p>}
        </div>
        <SessionPicker t={t} />
        <div className="flex md:justify-end"><NewTransactionAction t={t} onGoToCashboxes={onGoToCashboxes} /></div>
      </CardContent>
    </Card>

    {isTransactionsLoading || !currentFiscalYear || isApplyingRequestedSession ? <TableSkeleton /> : isError ? <ErrorState onRetry={refetch} /> : <>
      <div className="space-y-3">
        <FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} filters={<>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label={t('finance', 'adherent')} className={selectClass}><option value="">{t('finance', 'allAdherents')}</option>{availableMembers.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}</select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('finance', 'actionsLabel')} className={selectClass}><option value="all">{t('finance', 'allActions')}</option>{TRANSACTION_OPERATIONS.map((operation) => <option key={operation} value={operation}>{t('finance', operationLabelKey(operation))}</option>)}</select>
          {category === 'AUTRES' && <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} aria-label={t('finance', 'subcategory')} className={selectClass}><option value="all">{t('finance', 'allSubcategories')}</option>{OTHER_OPERATION_SUBCATEGORIES.map((s) => <option key={s} value={s}>{t('finance', subcategoryLabelKey(s))}</option>)}</select>}
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('finance', 'status')} className={selectClass}><option value="all">{t('finance', 'allStatuses')}</option><option value="completed">{t('finance', 'completed')}</option><option value="pending">{t('finance', 'pending')}</option><option value="failed">{t('finance', 'failed')}</option><option value="cancelled">{t('finance', 'cancelled')}</option></select>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('finance', 'type')} className={selectClass}><option value="all">{t('finance', 'allTypes')}</option><option value="debit">{t('finance', 'debit')}</option><option value="credit">{t('finance', 'credit')}</option></select>
        </>} />
        <div className="text-xs text-muted-foreground" data-testid="transactions-count">{formatNumber(filtered.length)} / {formatNumber(scoped.length)} · {t('finance', 'transactionCountLabel')}</div>
        <DataTable columns={columns} rows={filtered} onRowClick={(row) => navigate(`/finance/transactions/${row.id}`)} empty={<EmptyState icon={ReceiptText} title={t('finance', 'noTransactionsForCriteria')} />} />
      </div>
    </>}
  </div>;
}

/**
 * Classification de la saisie (mandat « CLASSIFICATION DES TRANSACTIONS ») :
 * `category` ∈ {EPARGNE, PRET, REMBOURSEMENT, AUTRES} — source unique
 * `@/mocks/finance/transaction-classification`. `subcategory` n'est demandée
 * QUE pour `AUTRES`. Aucune énumération d'« opération » ici.
 */

export type GuarantorRow = { name: string; amount: string; relation: string };

export type TransactionFormState = {
  cashboxNumber: string; sessionId: string; memberId: string;
  category: TransactionCategory | ''; subcategory: TransactionSubcategory | ''; type: TransactionType; amount: string; description: string;
  /** Champs prêt (catégorie `PRET`) — pilotés par la politique de la caisse. */
  interestRate: string; durationMonths: string; startDate: string; dueDate: string;
  guarantors: GuarantorRow[]; approved: boolean; approvedBy: string;
  /**
   * REMBOURSEMENT — `loanId` et `debtOutstanding` sont déterminés
   * AUTOMATIQUEMENT à partir de l'adhérent (mandat « REMBOURSEMENT ») :
   * l'utilisateur ne sélectionne jamais le prêt. `loanId` est conservé pour la
   * traçabilité comptable ; `debtOutstanding` (montant à rembourser) est en
   * lecture seule. AUTRES/DISTRIBUTION → `distributionId`.
   */
  loanId: string; debtOutstanding: string; distributionId: string;
};

export const emptyTransactionForm: TransactionFormState = { cashboxNumber: '', sessionId: '', memberId: '', category: '', subcategory: '', type: 'credit', amount: '', description: '', interestRate: '', durationMonths: '', startDate: '', dueDate: '', guarantors: [], approved: false, approvedBy: '', loanId: '', debtOutstanding: '', distributionId: '' };

export type TransactionFormErrors = { cashboxNumber?: string; category?: string; subcategory?: string; amount?: string; member?: string; duration?: string; guarantors?: string; approval?: string; repayment?: string };

/**
 * Dette active à rembourser pour un adhérent (mandat « REMBOURSEMENT » —
 * détermination automatique). L'utilisateur ne choisit jamais le prêt : on
 * retient le prêt ACTIF avec un encours > 0 dont l'échéance est la plus proche
 * (départage : encours le plus élevé). `undefined` = aucune dette en cours →
 * remboursement impossible.
 */
export function resolveMemberDebt(loans: Loan[]): Loan | undefined {
  return [...loans]
    .filter((loan) => loan.status === 'active' && loan.outstanding > 0)
    .sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate) || b.outstanding - a.outstanding)[0];
}

/**
 * Politique de prêt applicable à la caisse sélectionnée (mandat §7/§17). Le
 * modèle ne porte qu'une `LoanRule` par compte (`LoanRule.cashboxId`, unique
 * tenant+compte) — pas de politique-défaut tenant ni d'héritage (concern
 * backend). On retient la règle ACTIVE qui autorise les prêts.
 */
export function applicableLoanRule(rule: LoanRule | null | undefined): LoanRule | undefined {
  // Règle de crédit UNIQUE du tenant (décision 2026-09-26) — jamais déduite de la caisse choisie.
  return rule && rule.status === 'ACTIVE' && rule.allowLoans ? rule : undefined;
}

/** Lignes garant à afficher : au moins `minGuarantors` (imposé par la politique), au plus `maxGuarantors`. */
export function guarantorRowsFor(form: TransactionFormState, rule: LoanRule | undefined): GuarantorRow[] {
  if (!isLoanDisbursement(form.category, form.subcategory) || !rule?.requiresGuarantor) return [];
  const count = Math.min(Math.max(form.guarantors.length, rule.minGuarantors), rule.maxGuarantors);
  return Array.from({ length: count }, (_, index) => form.guarantors[index] ?? { name: '', amount: '', relation: '' });
}

/** Compose la description : commentaire libre + détails métier saisis (mandat §5 : aucune entité Loan/Guarantor/Distribution créée, tout est consigné ici). */
function composeTransactionDescription(form: TransactionFormState, rule: LoanRule | undefined, t: T, currency?: string): string {
  const parts = [form.description.trim()].filter(Boolean);
  if (isLoanDisbursement(form.category, form.subcategory)) {
    if (form.interestRate) parts.push(`${t('finance', 'interestRate')}: ${form.interestRate}%`);
    if (form.durationMonths) parts.push(`${t('finance', 'durationMonths')}: ${form.durationMonths}`);
    if (form.startDate) parts.push(`${t('finance', 'startDate')}: ${form.startDate}`);
    if (form.dueDate) parts.push(`${t('finance', 'dueDate')}: ${form.dueDate}`);
    guarantorRowsFor(form, rule).filter((row) => row.name.trim()).forEach((row) => parts.push(`${t('finance', 'guarantor')}: ${row.name}${row.amount ? ` (${row.amount})` : ''}${row.relation ? ` — ${row.relation}` : ''}`));
  }
  if (isLoanRepayment(form.category, form.subcategory) && form.loanId) {
    // Prêt/dette conservé en interne pour la traçabilité comptable (mandat : « le backend doit continuer à savoir exactement quelle dette a été remboursée »).
    parts.push(`${t('finance', 'loanConcerned')}: ${form.loanId}`);
    const due = Number(form.debtOutstanding);
    const paid = Number(form.amount);
    if (due > 0) {
      parts.push(`${t('finance', 'amountToRepay')}: ${formatCurrency(due, currency)}`);
      parts.push(`${t('finance', 'debtCarryover')}: ${formatCurrency(Math.max(0, due - paid), currency)}`);
      parts.push(t('finance', paid >= due ? 'repaymentStatusSettled' : 'repaymentStatusPartial'));
    }
  }
  if (form.category === 'AUTRES' && form.subcategory === 'DISTRIBUTION' && form.distributionId) parts.push(`${t('finance', 'distributionConcerned')}: ${form.distributionId}`);
  return parts.join(' · ');
}

function TransactionFormBody({ t, form, setForm, errors, mode, cashboxLocked = false }: { t: T; form: TransactionFormState; setForm: (patch: Partial<TransactionFormState>) => void; errors: TransactionFormErrors; mode: 'create' | 'edit'; cashboxLocked?: boolean }) {
  const currency = useOrganizationCurrency();
  const { currentTenant } = useTenant();
  const isLoan = mode === 'create' && isLoanDisbursement(form.category, form.subcategory);
  const isRepayment = mode === 'create' && isLoanRepayment(form.category, form.subcategory);
  const { data: cashboxes = [] } = useQuery({ queryKey: queryKeys.finance.cashboxes(currentTenant.id), queryFn: () => financeService.listCashboxes(currentTenant.id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { sessions: fiscalSessions, hasSessions } = useFiscalSessions();
  const isDistribution = form.category === 'AUTRES' && form.subcategory === 'DISTRIBUTION';
  const { data: distributions = [] } = useQuery({ queryKey: queryKeys.finance.distributions(currentTenant.id), queryFn: () => financeService.listDistributions(currentTenant.id), enabled: isDistribution });
  const { data: creditRule } = useQuery({ queryKey: queryKeys.credit.loanRules(currentTenant.id), queryFn: () => loanRuleService.getCreditRule(currentTenant.id), enabled: isLoan });
  // REMBOURSEMENT : dette à la DATE DE PAIEMENT (date de séance, sinon aujourd'hui), celle que `createRepaymentTransaction`
  // applique ; PRÊT : encours du jour (le prêt est décaissé aujourd'hui).
  const debtDate = (isRepayment && fiscalSessions.find((session) => session.id === form.sessionId)?.date) || new Date().toISOString().slice(0, 10);
  const { data: borrowerLoans = [] } = useQuery({ queryKey: [...queryKeys.credit.loansByMember(form.memberId), debtDate], queryFn: () => creditService.listLoansByMember(form.memberId, debtDate), enabled: (isLoan || isRepayment) && Boolean(form.memberId) });

  const rule = isLoan ? applicableLoanRule(creditRule) : undefined;
  const activeLoanCount = borrowerLoans.filter((loan) => loan.status === 'active').length;
  /** Dette résolue automatiquement (jamais choisie par l'utilisateur, mandat « REMBOURSEMENT »). */
  const memberDebt = isRepayment && form.memberId ? resolveMemberDebt(borrowerLoans) : undefined;
  const selectedMember = members.find((member) => member.id === form.memberId);
  const memberFullName = selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : '';
  const paidAmount = Number(form.amount) || 0;

  // Préremplissage depuis la politique (mandat §9 : le frontend ne duplique pas les règles, il les lit).
  useEffect(() => {
    if (!rule) return;
    const patch: Partial<TransactionFormState> = {};
    if (form.interestRate === '') patch.interestRate = String(rule.interestRate);
    if (form.durationMonths === '') patch.durationMonths = String(rule.durationMonths);
    if (Object.keys(patch).length) setForm(patch);
  }, [rule]); // eslint-disable-line react-hooks/exhaustive-deps

  /** REMBOURSEMENT : `loanId` + `debtOutstanding` suivent la dette résolue — jamais saisis. */
  useEffect(() => {
    if (!isRepayment) return;
    const nextLoanId = memberDebt?.id ?? '';
    const nextDebt = memberDebt ? String(memberDebt.outstanding) : '';
    if (form.loanId !== nextLoanId || form.debtOutstanding !== nextDebt) setForm({ loanId: nextLoanId, debtOutstanding: nextDebt });
  }, [isRepayment, memberDebt?.id, memberDebt?.outstanding]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60';
  const readOnlyIdentity = mode === 'edit';
  const forcedType = requiredTransactionType(form.category, form.subcategory);
  const guarantorRows = guarantorRowsFor(form, rule);
  const setGuarantor = (index: number, patch: Partial<GuarantorRow>) => {
    const next = guarantorRows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
    setForm({ guarantors: next });
  };
  const guarantorCandidates = members.filter((member) => rule?.allowSelfGuarantee || member.id !== form.memberId);

  return <>
    <FormSection title={t('finance', 'general')}>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* PRÊT (2026-09-27) : aucun choix de caisse — Épargne finance en premier, les autres caisses complètent (panneau de financement). */}
        {isLoan ? <div className="space-y-2"><Label htmlFor="tx-cashbox">{t('finance', 'priorityCashbox')}</Label>
          <Input id="tx-cashbox" readOnly value={savingsCashboxOf(cashboxes)?.title ?? ''} className="bg-muted/40" />
          <p className="text-[11px] text-muted-foreground">{t('finance', 'priorityCashboxHint')}</p>
        </div>
        /* Mandat « Séparation Caisses / Crédit » : pour un REMBOURSEMENT la caisse est celle de l'ENCAISSEMENT — jamais la « caisse du prêt ». */
        : <div className="space-y-2"><Label htmlFor="tx-cashbox">{t('finance', isLoan ? 'disbursementCashbox' : isRepayment ? 'receiptCashbox' : 'cashboxField')} *</Label>
          <select id="tx-cashbox" value={form.cashboxNumber} disabled={readOnlyIdentity || cashboxLocked} onChange={(event) => setForm({ cashboxNumber: event.target.value })} className={selectClass} aria-invalid={Boolean(errors.cashboxNumber)}>
            <option value="">{t('finance', 'selectCashboxPlaceholder')}</option>
            {/* Création : caisses OPÉRATIONNELLES uniquement (§12/§31) — une caisse désactivée / archivée n'est jamais proposée. */}
            {cashboxes.filter((cashbox) => mode === 'edit' || isCashboxOperational(cashbox)).map((cashbox) => <option key={cashbox.id} value={cashbox.cashboxNumber}>{cashbox.title}</option>)}
          </select><FieldError message={errors.cashboxNumber} />
          {isRepayment && <p className="text-[11px] text-muted-foreground">{t('finance', 'receiptCashboxHint')}</p>}
        </div>}
        {/* Création : mêmes 4 catégories de saisie que la saisie rapide (Épargner · Rembourser · Emprunter · Autres), sans sous-catégorie — « Autres » = AUTRES / AUTRE. */}
        {mode === 'create' && <div className="space-y-2"><Label htmlFor="tx-category">{t('finance', 'actionLabel')} *</Label>
          <select id="tx-category" value={form.category ? operationForClassification(form.category, form.subcategory) : ''} onChange={(event) => {
            const operation = event.target.value as TransactionOperation | '';
            if (!operation) { setForm({ category: '', subcategory: '' }); return; }
            const { category, subcategory } = classificationForOperation(operation, operation === 'AUTRES' ? 'AUTRE' : '');
            // Type recalculé à chaque changement de catégorie : imposé si la catégorie l'impose, sinon sens par défaut — jamais l'ancienne valeur.
            setForm({ category, subcategory, type: requiredTransactionType(category, subcategory) ?? DEFAULT_DIRECTION[category] });
          }} className={selectClass} aria-invalid={Boolean(errors.category || errors.subcategory)}>
            <option value="">{t('finance', 'selectAction')}</option>
            {TRANSACTION_OPERATIONS.map((operation) => <option key={operation} value={operation}>{t('finance', operationLabelKey(operation))}</option>)}
          </select><FieldError message={errors.category ?? errors.subcategory} />
        </div>}
        {/* Modification : classification HISTORIQUE affichée en lecture seule (Inscription, Achat tontine… restent visibles) — jamais modifiable. */}
        {mode === 'edit' && <div className="space-y-2"><Label htmlFor="tx-category">{t('finance', 'category')} *</Label>
          <select id="tx-category" value={form.category} disabled={readOnlyIdentity} onChange={(event) => {
            const category = event.target.value as TransactionCategory | '';
            setForm({
              category,
              // Quitter AUTRES → la sous-catégorie n'a plus de sens : vidée, jamais envoyée au backend (mandat « COMPORTEMENT FRONTEND »).
              subcategory: category === 'AUTRES' ? form.subcategory : '',
              // Type recalculé à CHAQUE changement d'opération (mandat « Type des transactions ») : imposé si l'opération l'impose, sinon sens par défaut — jamais l'ancienne valeur.
              type: requiredTransactionType(category, category === 'AUTRES' ? form.subcategory : '') ?? (category ? DEFAULT_DIRECTION[category] : form.type),
            });
          }} className={selectClass} aria-invalid={Boolean(errors.category)}>
            <option value="">{t('finance', 'selectCategory')}</option>
            {TRANSACTION_CATEGORIES.map((c) => <option key={c} value={c}>{t('finance', categoryLabelKey(c))}</option>)}
          </select><FieldError message={errors.category} />
        </div>}
        {mode === 'edit' && form.category === 'AUTRES' && <div className="space-y-2"><Label htmlFor="tx-subcategory">{t('finance', 'subcategory')} *</Label>
          <select id="tx-subcategory" value={form.subcategory} disabled={readOnlyIdentity} onChange={(event) => { const subcategory = event.target.value as TransactionSubcategory | ''; const required = requiredTransactionType('AUTRES', subcategory); setForm(required ? { subcategory, type: required } : { subcategory }); }} className={selectClass} aria-invalid={Boolean(errors.subcategory)}>
            <option value="">{t('finance', 'selectSubcategory')}</option>
            {subcategoriesFor('AUTRES').map((s) => <option key={s} value={s}>{t('finance', subcategoryLabelKey(s))}</option>)}
          </select><FieldError message={errors.subcategory} />
        </div>}
        {/* Création : séance HÉRITÉE du contexte Finance (lecture seule). Modification : la séance propre de la transaction existante, jamais celle du contexte. */}
        {mode === 'create' ? <ContextSessionField t={t} /> : <SessionField t={t} value={form.sessionId} onChange={(sessionId) => setForm({ sessionId })} sessions={fiscalSessions} hasSessions={hasSessions} />}
        {/**
          * Date transaction = horodatage d'audit `recordedAt`, généré CÔTÉ SERVEUR
          * au moment du INSERT (`financeService.createTransaction`). Mandat
          * « Trésorerie » : AUCUN champ date/heure à la création (ni saisi, ni
          * affiché, ni envoyé) ; en édition, simple rappel en lecture seule.
          */}
        {mode === 'edit' && <div className="space-y-2"><Label htmlFor="tx-transaction-at">{t('finance', 'transactionDateField')}</Label><Input id="tx-transaction-at" value={t('finance', 'transactionDateAuto')} readOnly disabled aria-describedby="tx-transaction-at-hint" /><p id="tx-transaction-at-hint" className="text-[11px] text-muted-foreground">{t('finance', 'transactionDateAutoHint')}</p></div>}
        <div className="space-y-2"><Label htmlFor="tx-member">{t('finance', 'adherent')}{isLoan || isRepayment ? ' *' : ''}</Label>
          <select id="tx-member" value={form.memberId} disabled={readOnlyIdentity} onChange={(event) => setForm({ memberId: event.target.value })} className={selectClass} aria-invalid={Boolean(errors.member)}>
            <option value="">{t('finance', 'selectMember')}</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
          </select><FieldError message={errors.member} />
        </div>
        {/* Type : IMPOSÉ par l'opération (`requiredTransactionType`) et non modifiable, sauf pour « Autres » libre — Prêt = débit, Remboursement / Épargne / Inscription / Achat tontine / Secours = crédit. */}
        <div className="space-y-2"><Label htmlFor="tx-type">{t('finance', 'type')} *</Label>
          <select id="tx-type" value={forcedType ?? form.type} disabled={Boolean(forcedType)} onChange={(event) => setForm({ type: event.target.value as TransactionType })} className={selectClass}>
            <option value="credit">{t('finance', 'credit')}</option>
            <option value="debit">{t('finance', 'debit')}</option>
          </select>
          {forcedType && <p className="text-[11px] text-muted-foreground">{t('finance', 'typeForcedHint')}</p>}
        </div>
        {!isRepayment && <div className="space-y-2"><Label htmlFor="tx-amount">{t('finance', 'amount')} *</Label><AmountInput id="tx-amount" value={form.amount} onValueChange={(amount) => setForm({ amount })} aria-invalid={Boolean(errors.amount)} /><FieldError message={errors.amount} /></div>}
        {isDistribution && <div className="space-y-2"><Label htmlFor="tx-distribution">{t('finance', 'distributionConcerned')}</Label>
          <select id="tx-distribution" value={form.distributionId} onChange={(event) => setForm({ distributionId: event.target.value })} className={selectClass}>
            <option value="">—</option>
            {distributions.map((distribution) => <option key={distribution.id} value={distribution.id}>{distribution.beneficiary} · {formatDate(distribution.date)}</option>)}
          </select>
        </div>}
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="tx-comment">{t('finance', 'comment')}</Label><Textarea id="tx-comment" value={form.description} onChange={(event) => setForm({ description: event.target.value })} /></div>
      </div>
    </FormSection>

    {/*
      * REMBOURSEMENT (mandat dédié) — l'utilisateur ne choisit JAMAIS le prêt :
      * la dette est déterminée automatiquement à partir de l'adhérent
      * (`resolveMemberDebt`). « Montant à rembourser », « Report de dette » et
      * « Statut » sont calculés et en lecture seule ; seul « Montant versé » est
      * saisi. Sans dette active → enregistrement impossible.
      */}
    {isRepayment && !form.memberId && <p className="text-sm text-muted-foreground">{t('finance', 'selectMemberForDebt')}</p>}
    {isRepayment && form.memberId && !memberDebt && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{t('finance', 'noActiveDebt')}</div>}
    {isRepayment && memberDebt && <>
      <FormSection title={t('finance', 'repaymentSection')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="tx-amount-to-repay">{t('finance', 'amountToRepay')}</Label><Input id="tx-amount-to-repay" value={formatCurrency(memberDebt.outstanding, currency)} readOnly disabled /><p className="text-[11px] text-muted-foreground">{t('finance', 'loanConcerned')}: {formatDate(memberDebt.disbursementDate)}</p></div>
          <div className="space-y-2"><Label htmlFor="tx-amount-paid">{t('finance', 'amountPaid')} *</Label><AmountInput id="tx-amount-paid" value={form.amount} onValueChange={(amount) => setForm({ amount })} aria-invalid={Boolean(errors.amount)} /><FieldError message={errors.amount} /></div>
          <div className="space-y-2"><Label htmlFor="tx-debt-carryover">{t('finance', 'debtCarryover')}</Label><Input id="tx-debt-carryover" value={formatCurrency(Math.max(0, memberDebt.outstanding - paidAmount), currency)} readOnly disabled /></div>
          <div className="space-y-2"><Label>{t('finance', 'status')}</Label><div className="pt-1"><StatusBadge label={t('finance', paidAmount >= memberDebt.outstanding ? 'repaymentStatusSettled' : 'repaymentStatusPartial')} tone={paidAmount >= memberDebt.outstanding ? 'success' : 'warning'} /></div></div>
        </div>
      </FormSection>
      <FormSection title={t('finance', 'summarySection')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label={t('finance', 'adherent')} value={memberFullName} icon={UsersRound} />
          <Info label={t('finance', 'amountToRepay')} value={formatCurrency(memberDebt.outstanding, currency)} icon={HandCoins} />
          <Info label={t('finance', 'amountPaid')} value={form.amount ? formatCurrency(paidAmount, currency) : '—'} icon={Banknote} />
          <Info label={t('finance', 'debtCarryover')} value={formatCurrency(Math.max(0, memberDebt.outstanding - paidAmount), currency)} icon={HandCoins} />
          <Info label={t('finance', 'status')} value={t('finance', paidAmount >= memberDebt.outstanding ? 'repaymentStatusSettled' : 'repaymentStatusPartial')} icon={Check} />
        </div>
      </FormSection>
    </>}

    {isLoan && !form.cashboxNumber && <p className="text-sm text-muted-foreground">{t('finance', 'selectCashboxForLoanPolicy')}</p>}
    {isLoan && form.cashboxNumber && !rule && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{t('finance', 'noLoanPolicyForCashbox')}</div>}

    {isLoan && rule && <FormSection title={t('finance', 'loanConditions')}>
      <p className="mb-4 text-xs text-muted-foreground">{t('finance', 'loanConditionsFromPolicy', { name: rule.name })}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="tx-loan-rate">{t('finance', 'interestRate')}</Label><Input id="tx-loan-rate" type="number" inputMode="decimal" value={form.interestRate} onChange={(event) => setForm({ interestRate: event.target.value })} /><p className="text-[11px] text-muted-foreground">{t('finance', 'loanMode' + rule.loanMode)} · {t('finance', 'interestPeriod' + rule.interestPeriod)}</p></div>
        <div className="space-y-2"><Label htmlFor="tx-loan-duration">{t('finance', 'durationMonths')}</Label><Input id="tx-loan-duration" type="number" inputMode="numeric" value={form.durationMonths} onChange={(event) => setForm({ durationMonths: event.target.value })} aria-invalid={Boolean(errors.duration)} /><p className="text-[11px] text-muted-foreground">{t('finance', 'policyMax', { value: String(rule.durationMonths) })}</p><FieldError message={errors.duration} /></div>
        <div className="space-y-2"><Label htmlFor="tx-loan-start">{t('finance', 'startDate')}</Label><Input id="tx-loan-start" type="date" value={form.startDate} onChange={(event) => setForm({ startDate: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="tx-loan-due">{t('finance', 'dueDate')}</Label><Input id="tx-loan-due" type="date" value={form.dueDate} onChange={(event) => setForm({ dueDate: event.target.value })} /></div>
        <p className="text-[11px] text-muted-foreground sm:col-span-2">{t('finance', 'policyAmountRange', { min: formatCurrency(rule.minAmount, currency), max: formatCurrency(rule.maxAmount, currency) })}</p>
        {activeLoanCount >= rule.maxActiveLoans && form.memberId && <div className="sm:col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{t('finance', 'maxActiveLoansReached', { count: String(rule.maxActiveLoans) })}</div>}
      </div>
    </FormSection>}

    {isLoan && rule?.requiresGuarantor && <FormSection title={t('finance', 'guarantorsSection')}>
      <p className="mb-3 text-xs text-muted-foreground">{t('finance', 'guarantorRequiredByPolicy', { min: String(rule.minGuarantors), max: String(rule.maxGuarantors) })}</p>
      <div className="space-y-3">
        {guarantorRows.map((row, index) => <div key={index} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor={`tx-guarantor-name-${index}`}>{t('finance', 'guarantorName')}</Label>
            <select id={`tx-guarantor-name-${index}`} value={row.name} onChange={(event) => setGuarantor(index, { name: event.target.value })} className={selectClass}>
              <option value="">—</option>
              {guarantorCandidates.map((member) => <option key={member.id} value={`${member.firstName} ${member.lastName}`}>{member.firstName} {member.lastName}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label htmlFor={`tx-guarantor-amount-${index}`}>{t('finance', 'guaranteedAmount')}</Label><AmountInput id={`tx-guarantor-amount-${index}`} value={row.amount} onValueChange={(amount) => setGuarantor(index, { amount })} /></div>
          <div className="space-y-1"><Label htmlFor={`tx-guarantor-relation-${index}`}>{t('finance', 'guarantorRelation')}</Label><Input id={`tx-guarantor-relation-${index}`} value={row.relation} onChange={(event) => setGuarantor(index, { relation: event.target.value })} /></div>
        </div>)}
        <div className="flex gap-2">
          {guarantorRows.length < rule.maxGuarantors && <Button type="button" variant="outline" size="sm" onClick={() => setForm({ guarantors: [...guarantorRows, { name: '', amount: '', relation: '' }] })}><Plus size={14} />{t('finance', 'addGuarantor')}</Button>}
          {guarantorRows.length > rule.minGuarantors && <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ guarantors: guarantorRows.slice(0, -1) })}>{t('finance', 'removeGuarantor')}</Button>}
        </div>
        <FieldError message={errors.guarantors} />
      </div>
    </FormSection>}

    {isLoan && rule?.requiresApproval && <FormSection title={t('finance', 'approvalSection')}>
      {/* Mandat « Workflow d'approbation des prêts » (2026-09-27) : plus d'« Approbation obtenue » cochée par l'utilisateur — la demande part dans le workflow. */}
      <p className="text-sm text-muted-foreground" data-testid="tx-approval-workflow">{t('finance', 'loanApprovalPendingNotice', { step: loanApprovalStep(rule.approvalLevel).name })}</p>
    </FormSection>}
  </>;
}

/** Situation de l'emprunteur nécessaire aux règles d'exposition et d'auto-caution (`loanPolicyViolations`). */
export type BorrowerContext = { activeOutstanding: number; borrowerName: string };

export function validateTransactionForm(form: TransactionFormState, rule: LoanRule | undefined, mode: 'create' | 'edit', t: T, activeLoanCount = 0, currency?: string, borrower: BorrowerContext = { activeOutstanding: 0, borrowerName: '' }): TransactionFormErrors {
  const errors: TransactionFormErrors = {};
  if (!form.cashboxNumber) errors.cashboxNumber = t('finance', 'fieldRequired');
  if (!form.category) errors.category = t('finance', 'fieldRequired');
  // Sous-catégorie obligatoire ssi AUTRES (mandat « COMPORTEMENT FRONTEND »).
  if (form.category === 'AUTRES' && !form.subcategory) errors.subcategory = t('finance', 'fieldRequired');
  const amount = Number(form.amount);
  if (!form.amount || amount <= 0) errors.amount = t('finance', 'invalidAmount');

  if (mode === 'create' && isLoanRepayment(form.category, form.subcategory)) {
    // Mandat « REMBOURSEMENT » : l'adhérent est obligatoire, la dette est résolue automatiquement,
    // et « Montant versé » ne peut pas dépasser « Montant à rembourser ». Sans dette active → blocage.
    if (!form.memberId) { errors.member = t('finance', 'fieldRequired'); return errors; }
    const due = Number(form.debtOutstanding);
    if (!form.loanId || !(due > 0)) { errors.repayment = t('finance', 'noActiveDebt'); return errors; }
    if (!errors.amount && amount > due) errors.amount = t('finance', 'amountPaidExceedsDebt');
  }

  if (isLoanDisbursement(form.category, form.subcategory)) {
    if (!form.memberId) errors.member = t('finance', 'fieldRequired');
    if (!rule) { errors.category = t('finance', 'noLoanPolicyForCashbox'); return errors; }
    if (!errors.amount && (amount < rule.minAmount || amount > rule.maxAmount)) errors.amount = t('finance', 'amountOutOfPolicyRange', { min: formatCurrency(rule.minAmount, currency), max: formatCurrency(rule.maxAmount, currency) });
    // Mandat « Finalisation Finance/Tontines » §10 : `maxActiveLoans` doit RÉELLEMENT bloquer
    // la soumission — avant ce mandat, seul un bandeau d'avertissement était affiché
    // (`activeLoanCount >= rule.maxActiveLoans`, jamais lu par cette fonction de validation).
    if (!errors.amount && activeLoanCount >= rule.maxActiveLoans) errors.amount = t('finance', 'maxActiveLoansReached', { count: String(rule.maxActiveLoans) });
    const duration = Number(form.durationMonths);
    if (form.durationMonths && (duration <= 0 || duration > rule.durationMonths)) errors.duration = t('finance', 'durationOutOfPolicyRange', { max: String(rule.durationMonths) });
    if (rule.requiresGuarantor) {
      const complete = guarantorRowsFor(form, rule).filter((row) => row.name.trim() && Number(row.amount) > 0).length;
      if (complete < rule.minGuarantors) errors.guarantors = t('finance', 'minGuarantorsNotMet', { count: String(rule.minGuarantors) });
    }
    // Règles complémentaires de la règle de crédit, appliquées aussi par `creditService.createLoanTransaction` (même fonction) : exposition, garants max., ratio de garantie, auto-caution.
    const violations = loanPolicyViolations(rule, {
      principal: amount, borrowerName: borrower.borrowerName, activeLoanCount, activeOutstanding: borrower.activeOutstanding, approved: true, // approbation : workflow, jamais le formulaire
      guarantors: guarantorRowsFor(form, rule).map((row) => ({ name: row.name, amount: Number(row.amount) || 0 })),
    });
    for (const violation of violations) {
      if (violation.code === 'MAX_EXPOSURE' && !errors.amount) errors.amount = t('finance', 'loanExposureExceeded', { max: formatCurrency(violation.max, currency), current: formatCurrency(violation.current, currency) });
      if (errors.guarantors) continue;
      if (violation.code === 'MAX_GUARANTORS') errors.guarantors = t('finance', 'maxGuarantorsExceeded', { count: String(violation.max) });
      if (violation.code === 'GUARANTEE_RATIO') errors.guarantors = t('finance', 'guaranteeRatioNotMet', { ratio: String(violation.ratio), required: formatCurrency(violation.required, currency) });
      if (violation.code === 'SELF_GUARANTEE') errors.guarantors = t('finance', 'selfGuaranteeForbidden');
    }
  }
  return errors;
}

export function buildTransactionInput(form: TransactionFormState, rule: LoanRule | undefined, memberNameById: Map<string, string>, fiscalYearId: string | undefined, t: T, currency?: string): TransactionInput {
  return {
    cashboxNumber: form.cashboxNumber,
    memberId: form.memberId || undefined,
    memberName: form.memberId ? memberNameById.get(form.memberId) : undefined,
    category: form.category as TransactionCategory,
    // Sous-catégorie transmise UNIQUEMENT pour AUTRES (mandat « COMPORTEMENT FRONTEND »).
    subcategory: form.category === 'AUTRES' ? (form.subcategory || undefined) : null,
    type: requiredTransactionType(form.category, form.subcategory) ?? form.type,
    amount: Number(form.amount),
    description: composeTransactionDescription(form, rule, t, currency),
    // `sessionId` = séance de l'exercice fiscal courant (jamais une date libre) ;
    // `fiscalYearId` porte l'isolation vérifiée par `createTransaction`.
    sessionId: form.sessionId || undefined,
    fiscalYearId: form.sessionId ? fiscalYearId : undefined,
  };
}

/**
 * Point d'entrée « + Nouvelle transaction » depuis la fiche caisse (mandat
 * « Le Compte comme point d'entrée des Transactions », 2026-09-23) : `id` de
 * l'`Cashbox` transmis en query param (`?cashboxId=`), jamais son
 * `cashboxNumber` (identifiant interne du journal, pas une clé d'URL stable).
 * Dès que `cashboxes` est chargé, on résout et on préremplit `cashboxNumber`
 * dans le formulaire — le champ Compte reste alors verrouillé
 * (`cashboxLocked`), sans dupliquer aucune règle de validation : la même
 * `TransactionFormBody`/`validateTransactionForm`/`buildTransactionInput` que
 * la création « libre » depuis `/finance/transactions/create`.
 */
function TransactionCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const currency = useOrganizationCurrency();
  const [searchParams] = useSearchParams();
  const presetCashboxId = searchParams.get('cashboxId') ?? '';
  const [form, setFormState] = useState<TransactionFormState>(emptyTransactionForm);
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const setForm = (patch: Partial<TransactionFormState>) => setFormState((current) => ({ ...current, ...patch }));
  const { data: cashboxes = [] } = useQuery({ queryKey: queryKeys.finance.cashboxes(currentTenant.id), queryFn: () => financeService.listCashboxes(currentTenant.id) });
  const presetCashbox = presetCashboxId ? cashboxes.find((cashbox) => cashbox.id === presetCashboxId) : undefined;
  const cashboxLocked = Boolean(presetCashboxId);
  useEffect(() => {
    if (presetCashbox && form.cashboxNumber !== presetCashbox.cashboxNumber) setForm({ cashboxNumber: presetCashbox.cashboxNumber });
  }, [presetCashbox?.cashboxNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancelTarget = presetCashboxId ? `/finance/cashboxes/${presetCashboxId}` : treasuryTabPath('transactions');
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { dateById: sessionDateById, fiscalYearId } = useFiscalSessions();
  const { currentSession } = useFinanceSession();
  const { data: creditRule } = useQuery({ queryKey: queryKeys.credit.loanRules(currentTenant.id), queryFn: () => loanRuleService.getCreditRule(currentTenant.id), enabled: isLoanDisbursement(form.category, form.subcategory) });
  const rule = isLoanDisbursement(form.category, form.subcategory) ? applicableLoanRule(creditRule) : undefined;
  /** Même source que le bandeau d'avertissement de `TransactionFormBody` — nécessaire ici aussi pour que `validateTransactionForm` bloque réellement (mandat §10 « maxActiveLoans »), pas seulement pour l'affichage. */
  const { data: borrowerLoans = [] } = useQuery({ queryKey: queryKeys.credit.loansByMember(form.memberId), queryFn: () => creditService.listLoansByMember(form.memberId), enabled: isLoanDisbursement(form.category, form.subcategory) && Boolean(form.memberId) });
  const activeLoanCount = borrowerLoans.filter((loan) => loan.status === 'active').length;
  const borrowerMember = members.find((member) => member.id === form.memberId);
  // Financement multi-caisses : Épargne finance d'abord (2026-09-27, jamais choisie) ; compléments cochés, parmi toutes les caisses actives, si elle ne suffit pas.
  const [funding, setFunding] = useState<Record<string, string>>({});
  const isLoanForm = isLoanDisbursement(form.category, form.subcategory);
  const savings = savingsCashboxOf(cashboxes);
  const fundingCashbox = isLoanForm ? savings : undefined;
  useEffect(() => {
    // Prêt → caisse imposée : Épargne ; en quittant le prêt, retour à la caisse d'origine (ou aucune).
    if (isLoanForm && savings && form.cashboxNumber !== savings.cashboxNumber) setForm({ cashboxNumber: savings.cashboxNumber });
    else if (!isLoanForm && savings && form.cashboxNumber === savings.cashboxNumber && presetCashbox?.cashboxNumber !== savings.cashboxNumber) setForm({ cashboxNumber: presetCashbox?.cashboxNumber ?? '' });
  }, [isLoanForm, savings?.cashboxNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  const fundingAvailability = fundingAvailabilityOf(cashboxes);
  const fundingPlan = fundingCashbox && Number(form.amount) > 0 ? planLoanFunding(Number(form.amount), fundingCashbox.id, complementsFrom(funding), fundingAvailability) : undefined;
  const borrower = { activeOutstanding: borrowerLoans.filter((loan) => loan.status === 'active').reduce((sum, loan) => sum + loan.outstanding, 0), borrowerName: borrowerMember ? `${borrowerMember.firstName} ${borrowerMember.lastName}` : '' };
  /** Séance = celle du contexte Finance (§17 : `sessionId = currentSessionId`), jamais choisie dans le formulaire. */
  useEffect(() => {
    if (form.sessionId !== (currentSession?.id ?? '')) setForm({ sessionId: currentSession?.id ?? '' });
  }, [currentSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const mutation = useMockMutation<Awaited<ReturnType<typeof financeService.createTransaction>> | { submittedRequestId: string }, TransactionInput>({
    /**
     * PRET/REMBOURSEMENT passent désormais par les orchestrateurs atomiques de
     * `creditService` (mandat « Finalisation Finance/Tontines ») plutôt que
     * d'appeler `financeService.createTransaction` directement : la Transaction
     * n'est créée QUE si la politique de prêt (montant, `maxActiveLoans`,
     * garants, approbation) — ou, pour un remboursement, le solde dû — est déjà
     * validée, et un véritable `Loan`/`Repayment` est créé/mis à jour dans la
     * même opération, jamais « une simple transaction ». Le comportement visible
     * (une transaction, sa description, la redirection) reste inchangé pour
     * l'utilisateur ; ce qui change est tout ce que le service garantit derrière.
     */
    mutationFn: async (input) => {
      if (isLoanDisbursement(form.category, form.subcategory)) {
        const cashbox = cashboxes.find((item) => item.cashboxNumber === input.cashboxNumber);
        if (!cashbox) return undefined;
        const validGuarantors = guarantorRowsFor(form, rule)
          .filter((row) => row.name.trim() && Number(row.amount) > 0)
          .map((row) => ({ guarantorName: row.name.trim(), guaranteedAmount: Number(row.amount) || 0, relation: row.relation.trim() }));
        // Approbation requise → demande soumise au workflow (étape = niveau de la règle) ; le prêt n'existera qu'après approbation puis décaissement.
        if (rule?.requiresApproval) {
          const submitted = await creditService.submitLoanApplication(currentTenant.id, {
            memberId: form.memberId, requestedAmount: input.amount, purpose: form.description.trim(), guarantors: validGuarantors,
            complementaryFunding: (fundingPlan?.allocations ?? []).filter((allocation) => allocation.cashboxId !== cashbox.id),
            sessionId: form.sessionId || undefined, description: form.description.trim() || undefined,
          }, user.name, user.id);
          return submitted ? { submittedRequestId: submitted.request.id } : undefined;
        }
        const result = await creditService.createLoanTransaction(currentTenant.id, {
          memberId: form.memberId,
          principal: input.amount,
          guarantors: validGuarantors,
          approved: false,
          transactionInput: input,
          complementaryFunding: (fundingPlan?.allocations ?? []).filter((allocation) => allocation.cashboxId !== cashbox.id),
        });
        return result?.transaction;
      }
      if (isLoanRepayment(form.category, form.subcategory) && form.loanId) {
        const paymentDate = (form.sessionId && sessionDateById.get(form.sessionId)) || new Date().toISOString().slice(0, 10);
        const result = await creditService.createRepaymentTransaction(currentTenant.id, { loanId: form.loanId, paymentDate, amount: input.amount, transactionInput: input });
        return result?.transaction;
      }
      return financeService.createTransaction(currentTenant.id, input);
    },
    // `['finance', 'cashboxes']` (préfixe large) invalide la liste ET la fiche caisse : le solde et le dernier mouvement sont dérivés du journal, ils doivent se recalculer dès qu'une transaction est créée.
    // `['operations']` : un prêt soumis à approbation crée une demande de workflow — sans cette invalidation, le module Workflow
    // (cache de 30 s, `providers.tsx`) affichait encore l'ancienne liste, sans la demande.
    invalidateKeys: [['finance', 'transactions'], ['finance', 'cashboxes'], ['credit', 'loans'], ['credit', 'applications'], ['credit', 'guarantors'], ['operations']],
    onSuccess: (transaction) => {
      if (!transaction) { notify.error(t('finance', 'transactionActionFailed')); return; }
      if ('submittedRequestId' in transaction) {
        notify.success(t('finance', 'loanSubmittedForApproval'));
        navigate(`/operations/workflows/${transaction.submittedRequestId}`);
        return;
      }
      notify.success(t('finance', 'transactionCreated'));
      // Créée depuis une fiche caisse → retour sur cette fiche (solde/journal à jour, invalidation ci-dessus) ; sinon comportement inchangé (fiche transaction).
      navigate(presetCashboxId ? `/finance/cashboxes/${presetCashboxId}` : `/finance/transactions/${transaction.id}`);
    },
  });
  const handleSave = () => {
    // Séance précise obligatoire (§9/§18) — « Toutes les séances » n'est jamais une séance de rattachement.
    if (!currentSession) { notify.error(t('finance', 'sessionRequiredMessage')); return; }
    const nextErrors = validateTransactionForm(form, rule, 'create', t, activeLoanCount, currency, borrower);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    // Jamais de prêt partiellement financé : le service refuserait de toute façon (`completeFundingPlan`).
    if (fundingPlan && !fundingPlan.isComplete) { notify.error(t('finance', 'fundingIncompleteError')); return; }
    const memberNameById = new Map(members.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));
    mutation.mutate(buildTransactionInput(form, rule, memberNameById, fiscalYearId, t, currency));
  };
  return <Page title={t('finance', 'newTransaction')} description={t('finance', 'transactionsDescription')} actions={<Back label={t('finance', presetCashboxId ? 'backToCashbox' : 'backToTransactions')} />}>
    <div className="max-w-5xl space-y-5">
      <SessionRequiredNotice t={t} />
      <TransactionFormBody t={t} form={form} setForm={setForm} errors={errors} mode="create" cashboxLocked={cashboxLocked} />
      {fundingPlan && <LoanFundingSection t={t} plan={fundingPlan} cashboxes={cashboxes} availability={fundingAvailability} values={funding} onChange={setFunding} money={(value) => formatCurrency(value, currency)} idPrefix="tx-funding" />}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(cancelTarget)}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending || !currentSession} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div>
    </div>
  </Page>;
}

function TransactionEdit({ t }: { t: T }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const currency = useOrganizationCurrency();
  const { data: transaction, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.finance.transaction(id), currentTenant.id], queryFn: () => financeService.getTransaction(currentTenant.id, id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { fiscalYearId } = useFiscalSessions();
  const [form, setFormState] = useState<TransactionFormState | null>(null);
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const mutation = useMockMutation<Awaited<ReturnType<typeof financeService.updateTransaction>>, TransactionInput>({
    mutationFn: (input) => financeService.updateTransaction(currentTenant.id, id, { category: input.category, subcategory: input.subcategory ?? undefined, type: input.type, amount: input.amount, description: input.description, sessionId: input.sessionId ?? '' }),
    // Modifier montant/type/statut d'une transaction change le solde dérivé des caisses concernées.
    invalidateKeys: [['finance', 'transactions'], ['finance', 'cashboxes']],
    onSuccess: (updated) => {
      if (!updated) { notify.error(t('finance', 'transactionActionFailed')); return; }
      notify.success(t('finance', 'transactionUpdated'));
      navigate(`/finance/transactions/${id}`);
    },
  });
  if (isLoading) return <Page title={t('finance', 'editTransaction')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'editTransaction')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!transaction) return <NotFoundPage />;
  const current: TransactionFormState = form ?? {
    ...emptyTransactionForm,
    cashboxNumber: transaction.source, sessionId: transaction.sessionId ?? '',
    memberId: transaction.memberId ?? '', category: transaction.category, subcategory: transaction.subcategory ?? '', type: transaction.type,
    amount: String(transaction.amount), description: transaction.description,
  };
  const setForm = (patch: Partial<TransactionFormState>) => setFormState({ ...current, ...patch });
  const handleSave = () => {
    const nextErrors = validateTransactionForm(current, undefined, 'edit', t, 0, currency);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const memberNameById = new Map(members.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));
    mutation.mutate(buildTransactionInput(current, undefined, memberNameById, fiscalYearId, t, currency));
  };
  return <Page title={t('finance', 'editTransaction')} description={transaction.reference} actions={<Back label={t('finance', 'backToTransactions')} />}>
    <div className="max-w-5xl space-y-5">
      <TransactionFormBody t={t} form={current} setForm={setForm} errors={errors} mode="edit" />
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/finance/transactions/${id}`)}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div>
    </div>
  </Page>;
}

function TransactionDetail({ t }: { t: T }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const partyLabel = useTransactionPartyLabel();
  const { data: transaction, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.finance.transaction(id), currentTenant.id], queryFn: () => financeService.getTransaction(currentTenant.id, id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { data: session } = useQuery({ queryKey: ['finance', 'sessions', 'detail', transaction?.sessionId], queryFn: () => fiscalSessionService.getSession(currentTenant.id, transaction!.sessionId!), enabled: Boolean(transaction?.sessionId) });
  // Origine d'un achat de tontine — relue par relation (`tontineBeneficiaryId`), jamais recopiée sur la transaction.
  const { data: purchaseOrigin } = useQuery({ queryKey: ['tontines', 'purchase-origin', currentTenant.id, transaction?.tontineBeneficiaryId], queryFn: () => tontineOperationsService.getPurchaseOrigin(currentTenant.id, transaction!.tontineBeneficiaryId!), enabled: Boolean(transaction?.tontineBeneficiaryId) });
  // Prêt lié (lecture seule, par relation `loanId`) : conditions HISTORISÉES à l'octroi, financement par caisse, demande approuvée.
  const loanId = transaction?.loanId;
  const { data: linkedLoan } = useQuery({ queryKey: [...queryKeys.credit.loan(loanId ?? ''), currentTenant.id], queryFn: () => creditService.getLoan(currentTenant.id, loanId!), enabled: Boolean(loanId) });
  const { data: loanAllocations = [] } = useQuery({ queryKey: ['credit', 'loans', 'funding', loanId ?? '', currentTenant.id], queryFn: () => creditService.listLoanFundingAllocations(currentTenant.id, loanId!), enabled: Boolean(loanId) });
  const { data: loanCashboxes = [] } = useQuery({ queryKey: queryKeys.finance.cashboxes(currentTenant.id), queryFn: () => financeService.listCashboxes(currentTenant.id), enabled: Boolean(loanId) });
  const { data: workflowRequestsList = [] } = useQuery({ queryKey: queryKeys.operations.workflowRequests(currentTenant.id), queryFn: () => workflowService.listRequests(currentTenant.id), enabled: Boolean(linkedLoan?.applicationId) });
  const approvalRequest = linkedLoan ? workflowRequestsList.find((request) => request.domain === 'credit' && request.entityType === 'application' && request.entityId === linkedLoan.applicationId) : undefined;
  const cancelMutation = useMockMutation<Awaited<ReturnType<typeof financeService.cancelTransaction>>, void>({
    mutationFn: () => financeService.cancelTransaction(currentTenant.id, id),
    // Annuler une transaction la retire du solde dérivé (liste + fiche caisse).
    invalidateKeys: [['finance', 'transactions'], ['finance', 'cashboxes']],
    onSuccess: (result) => {
      setConfirmCancel(false);
      if (!result) { notify.error(t('finance', 'transactionActionFailed')); return; }
      notify.success(t('finance', 'transactionCancelled'));
    },
  });
  if (isLoading) return <Page title={t('finance', 'transactionDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'transactionDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!transaction) return <NotFoundPage />;
  const memberName = transaction.memberId ? (members.find((member) => member.id === transaction.memberId) ? `${members.find((member) => member.id === transaction.memberId)!.firstName} ${members.find((member) => member.id === transaction.memberId)!.lastName}` : transaction.memberId) : '—';
  const canMutate = transaction.status === 'completed' || transaction.status === 'pending';
  return <Page title={transaction.reference} description={t('finance', categoryLabelKey(transaction.category))} actions={<>
    <Back label={t('finance', 'backToTransactions')} />
    {canMutate && <PermissionGate permission="transactions.update"><Button variant="outline" onClick={() => navigate(`/finance/transactions/${id}/edit`)}><Pencil size={15} />{t('finance', 'edit')}</Button></PermissionGate>}
    {canMutate && <PermissionGate permission="transactions.cancel"><Button variant="outline" className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300" onClick={() => setConfirmCancel(true)}><Ban size={15} />{t('finance', 'cancelTransaction')}</Button></PermissionGate>}
  </>}>
    {confirmCancel && <ConfirmDialog open title={t('finance', 'cancelTransaction')} description={t('finance', 'cancelTransactionConfirm')} confirmLabel={t('finance', 'confirm')} cancelLabel={t('finance', 'cancel')} onConfirm={() => cancelMutation.mutate()} onCancel={() => setConfirmCancel(false)} />}
    <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
      <Card><CardContent className="p-5">
        <p className="text-xs text-muted-foreground">{t('finance', transaction.type === 'credit' ? 'credit' : 'debit')}</p>
        <p className={`mt-2 font-heading text-3xl font-semibold ${transaction.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}`}><MoneyDisplay amount={transaction.amount} /></p>
        <div className="mt-4"><StatusBadge label={t('finance', transaction.status)} tone={tone[transaction.status]} /></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'general')}</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2">
        <Info label={t('finance', 'category')} value={t('finance', categoryLabelKey(transaction.category))} icon={ListChecks} />
        {transaction.category === 'AUTRES' && transaction.subcategory && <Info label={t('finance', 'subcategory')} value={t('finance', subcategoryLabelKey(transaction.subcategory))} icon={ListChecks} />}
        <Info label={t('finance', 'adherent')} value={memberName} icon={UsersRound} />
        <Info label={t('finance', 'sessionColumn')} value={session ? t('finance', 'sessionOption', { number: String(session.sessionNumber), date: formatDate(session.date) }) : '—'} icon={CalendarClock} />
        <Info label={t('finance', 'transactionDateColumn')} value={<DateDisplay value={transaction.recordedAt ?? transaction.date} withTime={Boolean(transaction.recordedAt)} />} icon={Clock3} />
        <Info label={t('finance', 'fromCashbox')} value={partyLabel(transaction.source)} icon={Landmark} />
        <Info label={t('finance', 'toCashbox')} value={partyLabel(transaction.destination)} icon={Landmark} />
        {/* Traçabilité mouvement → objet métier : la transaction RÉFÉRENCE le prêt / le remboursement qui l'a produite, sans en être un. */}
        {transaction.loanId && <Info label={t('finance', 'loanConcerned')} value={<button type="button" className="font-medium text-primary hover:underline" onClick={() => navigate(`/finance/credit/loans/${transaction.loanId}`)}>{transaction.loanId}</button>} icon={HandCoins} />}
        {linkedLoan && <>
          <Info label={t('finance', 'txLoanTerms')} value={`${t('finance', 'mbInterestType' + linkedLoan.loanMode)} — ${formatNumber(linkedLoan.interestRate)} % ${t('finance', 'mbRatePer' + linkedLoan.interestPeriod)}`} icon={ListChecks} />
          <Info label={t('finance', 'txLoanPrincipal')} value={<MoneyDisplay amount={linkedLoan.principal} />} icon={HandCoins} />
          <Info label={t('finance', 'txLoanFunding')} value={loanAllocations.length > 0 ? loanAllocations.map((item) => `${loanCashboxes.find((cashbox) => cashbox.id === item.cashboxId)?.title ?? item.cashboxId} ${formatNumber(item.amount)}`).join(' · ') : partyLabel(transaction.type === 'debit' ? transaction.source : transaction.destination)} icon={Landmark} />
          <Info label={t('finance', 'txLoanApplication')} value={approvalRequest ? <button type="button" className="font-medium text-primary hover:underline" onClick={() => navigate(`/operations/workflows/${approvalRequest.id}`)}>{linkedLoan.applicationId}</button> : (linkedLoan.applicationId || '—')} icon={FileText} />
        </>}
        {transaction.repaymentId && <Info label={t('finance', 'repaymentConcerned')} value={transaction.repaymentId} icon={Banknote} />}
        {/* Même traçabilité pour un achat de tontine : la transaction de la caisse « Achat tontine » RÉFÉRENCE l'achat (tontine, tour, acheteur, montant) qui l'a produite. */}
        {purchaseOrigin && <>
          <Info label={t('finance', 'purchaseOriginTontine')} value={<button type="button" className="font-medium text-primary hover:underline" onClick={() => navigate(`/tontines/${purchaseOrigin.tontineId}/tours`)}>{purchaseOrigin.tontineName}</button>} icon={ListChecks} />
          <Info label={t('finance', 'purchaseOriginTour')} value={purchaseOrigin.cycleNumber === null
            ? t('finance', 'purchaseOriginTourValue', { number: String(purchaseOrigin.occurrenceNumber), date: formatDate(purchaseOrigin.occurrenceDate) })
            : t('finance', 'purchaseOriginTourCycleValue', { number: String(purchaseOrigin.occurrenceNumber), cycle: String(purchaseOrigin.cycleNumber), date: formatDate(purchaseOrigin.occurrenceDate) })} icon={CalendarClock} />
          <Info label={t('finance', 'purchaseOriginBuyer')} value={purchaseOrigin.memberName} icon={UsersRound} />
          <Info label={t('finance', 'purchaseOriginAmount')} value={<MoneyDisplay amount={purchaseOrigin.purchaseAmount} />} icon={Banknote} />
        </>}
        <div className="sm:col-span-2"><Info label={t('finance', 'comment')} value={transaction.description || '—'} icon={FileText} /></div>
      </CardContent></Card>
    </div>
  </Page>;
}

type LoanRuleFormState = {
  name: string; allowLoans: boolean; loanMode: LoanRuleLoanMode; minAmount: string; maxAmount: string; interestRate: string; interestPeriod: LoanRuleInterestPeriod; durationMonths: string; maxActiveLoans: string; maxLoanExposure: string; requiresGuarantor: boolean; minGuarantors: string; maxGuarantors: string; guaranteeTypeRequired: LoanRuleGuaranteeType; guaranteeRatio: string; allowSelfGuarantee: boolean; requiresApproval: boolean; approvalLevel: LoanRuleApprovalLevel;
};

const defaultLoanRuleForm: LoanRuleFormState = { name: '', allowLoans: true, loanMode: 'SIMPLE', minAmount: '0', maxAmount: '', interestRate: '0', interestPeriod: 'MONTHLY', durationMonths: '12', maxActiveLoans: '1', maxLoanExposure: '', requiresGuarantor: false, minGuarantors: '0', maxGuarantors: '1', guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: '100', allowSelfGuarantee: false, requiresApproval: true, approvalLevel: 'ADMIN' };

function loanRuleFormToInput(form: LoanRuleFormState): LoanRuleInput {
  return {
    name: form.name.trim(), allowLoans: form.allowLoans, loanMode: form.loanMode,
    minAmount: Number(form.minAmount) || 0, maxAmount: Number(form.maxAmount) || 0, interestRate: Number(form.interestRate) || 0,
    interestPeriod: form.interestPeriod, durationMonths: Number(form.durationMonths) || 0,
    maxActiveLoans: Number(form.maxActiveLoans) || 1, maxLoanExposure: form.maxLoanExposure === '' ? null : Number(form.maxLoanExposure),
    requiresGuarantor: form.requiresGuarantor, minGuarantors: Number(form.minGuarantors) || 0, maxGuarantors: Number(form.maxGuarantors) || 0,
    guaranteeTypeRequired: form.guaranteeTypeRequired, guaranteeRatio: Number(form.guaranteeRatio) || 0, allowSelfGuarantee: form.allowSelfGuarantee,
    requiresApproval: form.requiresApproval, approvalLevel: form.requiresApproval ? form.approvalLevel : null,
  };
}

function LoanRuleFormBody({ t, form, setForm, errors }: { t: T; form: LoanRuleFormState; setForm: (updater: LoanRuleFormState | ((prev: LoanRuleFormState) => LoanRuleFormState)) => void; errors: { name?: string; maxAmount?: string } }) {
  const set = <K extends keyof LoanRuleFormState>(key: K, value: LoanRuleFormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  // Cartes pleine largeur empilées dans l'ordre métier, TOUTES sur la même grille de champs
  // (`FIELD_GRID` : 1 → 2 → 4 colonnes) : les colonnes s'alignent d'une carte à l'autre, chaque carte a
  // la hauteur de son contenu, aucune ne dépend d'une voisine. Garant requis = OFF → aucun paramètre de
  // garantie affiché (les valeurs restent dans le formulaire et réapparaissent si l'option est réactivée).
  // Espacements : 24 px entre cartes (gap-6 de `CreditRulePage`), 16 px entre champs (gap-4), label → champ `space-y-2`.
  const FIELD_GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4';
  return <>
    <FormSection title={t('finance', 'general')}>
      <div className={FIELD_GRID}>
        <div className="space-y-2 lg:col-span-2"><Label htmlFor="loan-rule-name">{t('finance', 'loanRuleName')}</Label><Input id="loan-rule-name" value={form.name} onChange={(event) => set('name', event.target.value)} aria-invalid={Boolean(errors.name)} /><FieldError message={errors.name} /></div>
        <div className="space-y-2 lg:col-span-2"><Label htmlFor="loan-rule-loan-mode">{t('finance', 'loanMode')}</Label><select id="loan-rule-loan-mode" value={form.loanMode} onChange={(event) => set('loanMode', event.target.value as LoanRuleLoanMode)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{LOAN_MODES.map((mode) => <option key={mode} value={mode}>{t('finance', `loanMode${mode}`)}</option>)}</select></div>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4"><Switch id="loan-rule-allow-loans" checked={form.allowLoans} onCheckedChange={(checked: boolean) => set('allowLoans', checked)} /><Label htmlFor="loan-rule-allow-loans">{t('finance', 'allowLoans')}</Label></div>
      </div>
    </FormSection>
    <FormSection title={t('finance', 'loanTerms')}>
      <div className={FIELD_GRID}>
        <div className="space-y-2"><Label htmlFor="loan-rule-min-amount">{t('finance', 'minAmount')}</Label><AmountInput id="loan-rule-min-amount" value={form.minAmount} onValueChange={(value) => set('minAmount', value)} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-max-amount">{t('finance', 'maxAmount')}</Label><AmountInput id="loan-rule-max-amount" value={form.maxAmount} onValueChange={(value) => set('maxAmount', value)} aria-invalid={Boolean(errors.maxAmount)} /><FieldError message={errors.maxAmount} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-interest-rate">{t('finance', 'interestRate')}</Label><Input id="loan-rule-interest-rate" type="number" inputMode="decimal" value={form.interestRate} onChange={(event) => set('interestRate', event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-duration">{t('finance', 'durationMonths')}</Label><Input id="loan-rule-duration" type="number" inputMode="numeric" value={form.durationMonths} onChange={(event) => set('durationMonths', event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-interest-period">{t('finance', 'interestPeriod')}</Label><select id="loan-rule-interest-period" value={form.interestPeriod} onChange={(event) => set('interestPeriod', event.target.value as LoanRuleInterestPeriod)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="DAILY">{t('finance', 'interestPeriodDAILY')}</option><option value="WEEKLY">{t('finance', 'interestPeriodWEEKLY')}</option><option value="MONTHLY">{t('finance', 'interestPeriodMONTHLY')}</option><option value="YEARLY">{t('finance', 'interestPeriodYEARLY')}</option></select></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-max-active-loans">{t('finance', 'maxActiveLoans')}</Label><Input id="loan-rule-max-active-loans" type="number" inputMode="numeric" value={form.maxActiveLoans} onChange={(event) => set('maxActiveLoans', event.target.value)} /></div>
        {/* Dernier champ : complète sa ligne (pleine largeur en 2 colonnes, moitié droite en 4 colonnes) — aucune demi-ligne vide. */}
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="loan-rule-max-exposure">{t('finance', 'maxLoanExposure')}</Label><AmountInput id="loan-rule-max-exposure" value={form.maxLoanExposure} onValueChange={(value) => set('maxLoanExposure', value)} /></div>
      </div>
    </FormSection>
    <FormSection title={t('finance', 'guarantees')}>
      <div className={FIELD_GRID}>
        {/* OFF : seul l'interrupteur ; ON : les deux interrupteurs sur la ligne du dessus, alignés sur les moitiés de la grille. */}
        <div className={`flex items-center gap-2 ${form.requiresGuarantor ? 'lg:col-span-2' : 'sm:col-span-2 lg:col-span-4'}`}><Switch id="loan-rule-requires-guarantor" checked={form.requiresGuarantor} onCheckedChange={(checked: boolean) => set('requiresGuarantor', checked)} /><Label htmlFor="loan-rule-requires-guarantor">{t('finance', 'requiresGuarantor')}</Label></div>
        {form.requiresGuarantor && <>
        <div className="flex items-center gap-2 lg:col-span-2"><Switch id="loan-rule-allow-self-guarantee" checked={form.allowSelfGuarantee} onCheckedChange={(checked: boolean) => set('allowSelfGuarantee', checked)} /><Label htmlFor="loan-rule-allow-self-guarantee">{t('finance', 'allowSelfGuarantee')}</Label></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-min-guarantors">{t('finance', 'minGuarantors')}</Label><Input id="loan-rule-min-guarantors" type="number" inputMode="numeric" value={form.minGuarantors} onChange={(event) => set('minGuarantors', event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-max-guarantors">{t('finance', 'maxGuarantors')}</Label><Input id="loan-rule-max-guarantors" type="number" inputMode="numeric" value={form.maxGuarantors} onChange={(event) => set('maxGuarantors', event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-guarantee-type">{t('finance', 'guaranteeTypeRequired')}</Label><select id="loan-rule-guarantee-type" value={form.guaranteeTypeRequired} onChange={(event) => set('guaranteeTypeRequired', event.target.value as LoanRuleGuaranteeType)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="PERSONAL">{t('finance', 'guaranteeTypePERSONAL')}</option><option value="GROUP">{t('finance', 'guaranteeTypeGROUP')}</option><option value="COLLATERAL">{t('finance', 'guaranteeTypeCOLLATERAL')}</option></select></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-guarantee-ratio">{t('finance', 'guaranteeRatio')}</Label><Input id="loan-rule-guarantee-ratio" type="number" inputMode="decimal" value={form.guaranteeRatio} onChange={(event) => set('guaranteeRatio', event.target.value)} /></div>
        </>}
      </div>
    </FormSection>
    <FormSection title={t('finance', 'approval')}>
      <div className={FIELD_GRID}>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4"><Switch id="loan-rule-requires-approval" checked={form.requiresApproval} onCheckedChange={(checked: boolean) => set('requiresApproval', checked)} /><Label htmlFor="loan-rule-requires-approval">{t('finance', 'requiresApproval')}</Label></div>
        {/* Même largeur que « Nom de la règle » (moitié gauche de la grille). OFF → masqué, la carte se réduit. */}
        {form.requiresApproval && <div className="space-y-2 lg:col-span-2"><Label htmlFor="loan-rule-approval-level">{t('finance', 'approvalLevel')}</Label><select id="loan-rule-approval-level" value={form.approvalLevel} onChange={(event) => set('approvalLevel', event.target.value as LoanRuleApprovalLevel)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="MEMBER">{t('finance', 'approvalLevelMEMBER')}</option><option value="BOARD">{t('finance', 'approvalLevelBOARD')}</option><option value="ADMIN">{t('finance', 'approvalLevelADMIN')}</option></select></div>}
      </div>
    </FormSection>
  </>;
}

/**
 * RÈGLE DE CRÉDIT UNIQUE PAR TENANT (décision définitive du 2026-09-26), administrée en
 * Paramètres → Règle de crédit : une seule page — le formulaire de la règle existante, ou sa
 * création si le tenant n'en a encore aucune. Plus de liste, plus de fiche, plus
 * d'activation / désactivation / suppression. Les anciennes URLs (`/create`, `/:id`,
 * `/:id/edit`, `/finance/credit/loan-rules/*`) retombent toutes sur cette page.
 */
export const LOAN_RULES_PATH = '/settings/loan-rules';

export function LoanRulesRoutes() {
  const { t } = useLocale();
  return (
    <Routes>
      <Route index element={<PermissionRoute permission="loanRules.manage"><CreditRulePage t={t} /></PermissionRoute>} />
      <Route path="*" element={<Navigate to={LOAN_RULES_PATH} replace />} />
    </Routes>
  );
}

function LegacyLoanRulesRedirect() {
  return <Navigate to={LOAN_RULES_PATH} replace />;
}

function creditRuleToForm(rule: LoanRule): LoanRuleFormState {
  return { name: rule.name, allowLoans: rule.allowLoans, loanMode: rule.loanMode, minAmount: String(rule.minAmount), maxAmount: String(rule.maxAmount), interestRate: String(rule.interestRate), interestPeriod: rule.interestPeriod, durationMonths: String(rule.durationMonths), maxActiveLoans: String(rule.maxActiveLoans), maxLoanExposure: rule.maxLoanExposure === null ? '' : String(rule.maxLoanExposure), requiresGuarantor: rule.requiresGuarantor, minGuarantors: String(rule.minGuarantors), maxGuarantors: String(rule.maxGuarantors), guaranteeTypeRequired: rule.guaranteeTypeRequired, guaranteeRatio: String(rule.guaranteeRatio), allowSelfGuarantee: rule.allowSelfGuarantee, requiresApproval: rule.requiresApproval, approvalLevel: rule.approvalLevel ?? 'ADMIN' };
}

/**
 * RÈGLE DE CRÉDIT — création directe (aucune règle active remplacée), MODIFICATION par double
 * approbation (mandat du 2026-09-28) : « Soumettre » crée une demande (WD-009) ; la règle active
 * reste inchangée jusqu'à la 2e approbation. Une seule demande en cours à la fois ; l'historique
 * complet des demandes (demandeur, approbateurs, dates, résultat, activation) est affiché.
 */
function CreditRulePage({ t }: { t: T }) {
  const { currentTenant } = useTenant(); const { user } = usePermissions(); const navigate = useNavigate();
  const { data: rule, isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.credit.loanRules(currentTenant.id), queryFn: () => loanRuleService.getCreditRule(currentTenant.id) });
  const { data: changes = [] } = useQuery({ queryKey: [...queryKeys.credit.loanRules(currentTenant.id), 'changes', rule?.id ?? ''], queryFn: () => loanRuleService.listLoanRuleChanges(currentTenant.id, rule!.id), enabled: Boolean(rule) });
  const pending = changes.find((request) => request.status === 'pending' || request.status === 'inProgress');
  const [form, setForm] = useState<LoanRuleFormState | null>(null);
  const [errors, setErrors] = useState<{ name?: string; maxAmount?: string }>({});
  const invalidateKeys = [queryKeys.credit.loanRules(currentTenant.id), ['operations']];
  const createMutation = useMockMutation<Awaited<ReturnType<typeof loanRuleService.createLoanRule>>, LoanRuleInput>({
    mutationFn: (input) => loanRuleService.createLoanRule(currentTenant.id, input),
    invalidateKeys,
    onSuccess: (created) => { if (!created) { notify.error(t('finance', 'loanRuleRejected')); return; } notify.success(t('finance', 'loanRuleCreated')); setForm(null); },
  });
  const requestMutation = useMockMutation<Awaited<ReturnType<typeof loanRuleService.requestLoanRuleUpdate>>, LoanRuleUpdateInput>({
    mutationFn: (patch) => loanRuleService.requestLoanRuleUpdate(currentTenant.id, rule?.id ?? '', patch, user.id, user.name),
    invalidateKeys,
    onSuccess: (result) => {
      if (result.ok) { notify.success(t('finance', 'loanRuleChangeRequested')); setForm(null); return; }
      notify.error(t('finance', result.reason === 'pending' ? 'loanRuleChangePending' : result.reason === 'noChange' ? 'loanRuleNoChange' : result.reason === 'forbidden' ? 'loanRuleChangeForbidden' : 'loanRuleRejected'));
    },
  });
  const title = t('finance', 'loanRulesTitle');
  const description = t('finance', 'loanRulesDescription');
  if (isLoading) return <Page title={title} description={description}><DetailSkeleton /></Page>;
  if (isError) return <Page title={title} description={description}><ErrorState onRetry={refetch} /></Page>;
  const current: LoanRuleFormState = form ?? (rule ? creditRuleToForm(rule) : defaultLoanRuleForm);
  const setCurrent = (updater: LoanRuleFormState | ((prev: LoanRuleFormState) => LoanRuleFormState)) => setForm(typeof updater === 'function' ? (updater as (prev: LoanRuleFormState) => LoanRuleFormState)(current) : updater);
  const isPending = createMutation.isPending || requestMutation.isPending;
  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!current.name.trim()) nextErrors.name = t('finance', 'fieldRequired');
    if (!current.maxAmount || Number(current.maxAmount) < (Number(current.minAmount) || 0)) nextErrors.maxAmount = t('finance', 'fieldRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (rule) requestMutation.mutate(loanRuleFormToInput(current));
    else createMutation.mutate(loanRuleFormToInput(current));
  };
  const actor = (request: WorkflowRequest, order: number) => { const step = request.steps.find((item) => item.order === order); return step?.actedAt ? `${step.actedByName ?? '—'} · ${formatDate(step.actedAt)}` : '—'; };
  const statusKey = (request: WorkflowRequest) => request.appliedAt ? 'loanRuleChangeActivated'
    : request.status === 'rejected' ? 'loanRuleChangeRejected'
      : request.status === 'cancelled' || request.status === 'returned' ? 'loanRuleChangeClosed'
        : request.status === 'approved' ? 'loanRuleChangeNotApplied'
          : request.currentStepOrder === 2 ? 'loanRuleChangeAwaitingSecond' : 'loanRuleChangeAwaitingFirst';
  const fieldValue = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value));
  return <Page title={title} description={description}>
    {!rule && <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{t('finance', 'noCreditRuleYet')}</p>}
    {rule && !pending && <p className="text-xs text-muted-foreground" data-testid="credit-rule-approval-notice">{t('finance', 'loanRuleDoubleApprovalNotice')}</p>}
    {pending && <div role="status" data-testid="credit-rule-pending" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <span>{t('finance', 'loanRuleChangePendingBanner', { step: t('finance', statusKey(pending)) })}</span>
      <Button size="sm" variant="outline" onClick={() => navigate(`/operations/workflows/${pending.id}`)}>{t('finance', 'loanRuleOpenRequest')}</Button>
    </div>}
    {/* Pile de cartes pleine largeur (grille de champs commune, cf. `LoanRuleFormBody`) : hauteurs naturelles, boutons juste sous la dernière carte. */}
    <div className="space-y-6">
      <div className="grid gap-6">
        <LoanRuleFormBody t={t} form={current} setForm={setCurrent} errors={errors} />
      </div>
      <div className="flex justify-end gap-2">
        {rule && form && <Button variant="outline" disabled={isPending} onClick={() => { setForm(null); setErrors({}); }}>{t('finance', 'cancel')}</Button>}
        <Button disabled={isPending || Boolean(pending)} onClick={handleSave}>{isPending ? t('finance', 'saving') : rule ? t('finance', 'loanRuleSubmitChange') : t('finance', 'createLoanRule')}</Button>
      </div>
    </div>
    {rule && changes.length > 0 && <section className="space-y-3 rounded-xl border border-border p-5" data-testid="credit-rule-history" aria-label={t('finance', 'loanRuleHistoryTitle')}>
      <h2 className="text-sm font-semibold">{t('finance', 'loanRuleHistoryTitle')}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
            {['loanRuleHistoryRequested', 'loanRuleHistoryChanges', 'loanRuleHistoryFirst', 'loanRuleHistorySecond', 'loanRuleHistoryResult'].map((key) => <th key={key} scope="col" className="pb-2 pr-3 font-medium">{t('finance', key)}</th>)}
          </tr></thead>
          <tbody>{changes.map((request) => <tr key={request.id} className="border-b border-border/50 align-top last:border-0">
            <td className="py-2 pr-3">{request.requestedBy}<span className="block text-xs text-muted-foreground">{formatDate(request.requestedAt)}</span></td>
            <td className="py-2 pr-3 text-xs">{(request.changeSet ?? []).map((item) => <span key={item.field} className="block">{t('finance', LOAN_RULE_FIELD_KEY[item.field] ?? item.field)} : {fieldValue(item.before)} → <strong>{fieldValue(item.after)}</strong></span>)}</td>
            <td className="py-2 pr-3 text-xs">{actor(request, 1)}</td>
            <td className="py-2 pr-3 text-xs">{actor(request, 2)}</td>
            <td className="py-2 text-xs"><button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => navigate(`/operations/workflows/${request.id}`)}>{t('finance', statusKey(request))}</button>{request.appliedAt && <span className="block text-muted-foreground">{formatDate(request.appliedAt)}</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
  </Page>;
}

/** Libellés des champs de la règle (historique des modifications) — mêmes clés que le formulaire. */
const LOAN_RULE_FIELD_KEY: Record<string, string> = { name: 'loanRuleName', allowLoans: 'allowLoans', loanMode: 'loanMode', minAmount: 'minAmount', maxAmount: 'maxAmount', interestRate: 'interestRate', interestPeriod: 'interestPeriod', durationMonths: 'durationMonths', maxActiveLoans: 'maxActiveLoans', maxLoanExposure: 'maxLoanExposure', requiresGuarantor: 'requiresGuarantor', minGuarantors: 'minGuarantors', maxGuarantors: 'maxGuarantors', guaranteeTypeRequired: 'guaranteeTypeRequired', guaranteeRatio: 'guaranteeRatio', allowSelfGuarantee: 'allowSelfGuarantee', requiresApproval: 'requiresApproval', approvalLevel: 'approvalLevel' };

// ----------------------------------------------------------------------- Crédit : demandes, prêts (mandat « Finalisation Finance/Tontines »)

function ApplicationsList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const [search, setSearch] = useState('');
  const { data: applications = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.credit.applications(currentTenant.id), queryFn: () => creditService.listApplications(currentTenant.id) });
  const filtered = applications.filter((application) => `${application.applicant} ${application.id}`.toLowerCase().includes(search.toLowerCase()));
  const columns: TableColumn<Application>[] = [
    { key: 'applicant', header: t('finance', 'applicant'), render: (row) => <button type="button" onClick={() => navigate(`/finance/credit/applications/${row.id}`)} className="text-left font-semibold text-primary">{row.applicant}</button> },
    { key: 'requestedAmount', header: t('finance', 'requestedAmount'), render: (row) => <MoneyDisplay amount={row.requestedAmount} /> },
    { key: 'stage', header: t('finance', 'applicationStage'), render: (row) => <StatusBadge label={t('finance', row.stage)} tone={tone[row.stage]} /> },
    { key: 'submittedDate', header: t('finance', 'submittedDate'), render: (row) => <DateDisplay value={row.submittedDate} /> },
  ];
  if (isLoading) return <Page title={t('finance', 'applicationsTitle')} description={t('finance', 'applicationsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'applicationsTitle')} description={t('finance', 'applicationsDescription')}><ErrorState onRetry={refetch} /></Page>;
  return <Page title={t('finance', 'applicationsTitle')} description={t('finance', 'applicationsDescription')} actions={<><PermissionGate permission="loans.read"><Button variant="outline" onClick={() => navigate('/finance/credit/loans')}><HandCoins size={16} />{t('finance', 'loansTitle')}</Button></PermissionGate><PermissionGate permission="applications.create"><Button onClick={() => navigate('/finance/credit/applications/create')}><Plus size={16} />{t('finance', 'createApplication')}</Button></PermissionGate></>}>
    <FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} />
    <DataTable columns={columns} rows={filtered} empty={<EmptyState icon={FileText} title={t('finance', 'noApplications')} />} />
  </Page>;
}

function ApplicationDetail({ t }: { t: T }) {
  const { id = '' } = useParams(); const { currentTenant } = useTenant(); const navigate = useNavigate();
  const { data: application, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.credit.application(id), currentTenant.id], queryFn: () => creditService.getApplication(currentTenant.id, id) });
  const { data: loans = [] } = useQuery({ queryKey: queryKeys.credit.loans(currentTenant.id), queryFn: () => creditService.listLoans(currentTenant.id), enabled: application?.stage === 'stageDisbursed' });
  const relatedLoan = loans.find((loan) => loan.applicationId === application?.id);
  if (isLoading) return <Page title={t('finance', 'applicationDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'applicationDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!application) return <NotFoundPage />;
  return <Page title={application.id} description={application.applicant} actions={<Back label={t('finance', 'backToApplications')} />}>
    <div className="max-w-3xl space-y-5">
      <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-3">
        <Info label={t('finance', 'applicant')} value={application.applicant} icon={UsersRound} />
        <Info label={t('finance', 'requestedAmount')} value={<MoneyDisplay amount={application.requestedAmount} />} icon={HandCoins} />
        <Info label={t('finance', 'submittedDate')} value={<DateDisplay value={application.submittedDate} />} icon={CalendarClock} />
        {application.purpose && <Info label={t('finance', 'purpose')} value={application.purpose} icon={FileText} />}
        {application.reviewDate && <Info label={t('finance', 'reviewDate')} value={<DateDisplay value={application.reviewDate} />} icon={CalendarClock} />}
        {application.approvalDate && <Info label={t('finance', 'approvalDate')} value={<DateDisplay value={application.approvalDate} />} icon={CalendarClock} />}
      </CardContent></Card>
      <div className="flex items-center gap-3">
        <StatusBadge label={t('finance', application.stage)} tone={tone[application.stage]} />
        {(application.stage === 'stageSubmitted' || application.stage === 'stageReview' || application.stage === 'stageApproved') && (
          <Button variant="outline" size="sm" onClick={() => navigate('/operations/workflows')}><ClipboardIcon />{t('finance', 'seeAlso')} · Workflows</Button>
        )}
        {relatedLoan && <Button variant="outline" size="sm" onClick={() => navigate(`/finance/credit/loans/${relatedLoan.id}`)}><HandCoins size={15} />{t('finance', 'loanDetail')}</Button>}
      </div>
    </div>
  </Page>;
}
/** Petite icône neutre pour le lien « voir aussi » (évite d'ajouter une dépendance d'icône dédiée pour un seul bouton). */
function ClipboardIcon() { return <ChevronRight size={15} />; }

type ApplicationFormState = { memberId: string; requestedAmount: string; purpose: string; guarantors: GuarantorRow[] };
const emptyApplicationForm: ApplicationFormState = { memberId: '', requestedAmount: '', purpose: '', guarantors: [] };

/**
 * Nouvelle demande de prêt (mandat « Finalisation Finance/Tontines », phase
 * Prêts) — chemin PRÉ-décaissement passant par le moteur d'approbation
 * générique (WD-001, déjà défini mais jamais utilisé pour créer une nouvelle
 * demande à l'exécution avant ce mandat). Le décaissement lui-même reste une
 * action séparée, effectuée depuis Opérations → Workflows une fois la demande
 * intégralement approuvée (voir `creditService.disburseLoan`).
 */
function ApplicationCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const currency = useOrganizationCurrency();
  const [form, setFormState] = useState<ApplicationFormState>(emptyApplicationForm);
  const [errors, setErrors] = useState<{ memberId?: string; amount?: string; guarantors?: string }>({});
  const setForm = (patch: Partial<ApplicationFormState>) => setFormState((current) => ({ ...current, ...patch }));
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { data: creditRule } = useQuery({ queryKey: queryKeys.credit.loanRules(currentTenant.id), queryFn: () => loanRuleService.getCreditRule(currentTenant.id) });
  // Règle unique du tenant ; aucune caisse à choisir : Épargne finance en premier au décaissement.
  const rule = applicableLoanRule(creditRule);
  const guarantorRows = rule?.requiresGuarantor ? Array.from({ length: Math.min(Math.max(form.guarantors.length, rule.minGuarantors), rule.maxGuarantors) }, (_, index) => form.guarantors[index] ?? { name: '', amount: '', relation: '' }) : [];
  const setGuarantor = (index: number, patch: Partial<GuarantorRow>) => setForm({ guarantors: guarantorRows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) });

  const mutation = useMockMutation<Awaited<ReturnType<typeof creditService.submitLoanApplication>>, void>({
    mutationFn: () =>
      creditService.submitLoanApplication(
        currentTenant.id,
        {
          memberId: form.memberId,
          requestedAmount: Number(form.requestedAmount),
          purpose: form.purpose,
          guarantors: guarantorRows.filter((row) => row.name.trim() && Number(row.amount) > 0).map((row) => ({ guarantorName: row.name.trim(), guaranteedAmount: Number(row.amount) || 0, relation: row.relation.trim() })),
        },
        user.name,
        user.id,
      ),
    // `['operations']` : la demande de workflow créée doit apparaître immédiatement dans le module Workflow (cache de 30 s sinon).
    invalidateKeys: [queryKeys.credit.applications(currentTenant.id), ['operations']],
    onSuccess: (result) => {
      if (!result) { notify.error(t('finance', 'applicationRejected')); return; }
      notify.success(t('finance', 'applicationCreated'));
      navigate(`/operations/workflows/${result.request.id}`);
    },
  });

  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!form.memberId) nextErrors.memberId = t('finance', 'fieldRequired');
    const amount = Number(form.requestedAmount);
    if (!form.requestedAmount || amount <= 0) nextErrors.amount = t('finance', 'invalidAmount');
    if (rule && !nextErrors.amount && (amount < rule.minAmount || amount > rule.maxAmount)) nextErrors.amount = t('finance', 'amountOutOfPolicyRange', { min: formatCurrency(rule.minAmount, currency), max: formatCurrency(rule.maxAmount, currency) });
    if (rule?.requiresGuarantor) {
      const complete = guarantorRows.filter((row) => row.name.trim() && Number(row.amount) > 0).length;
      if (complete < rule.minGuarantors) nextErrors.guarantors = t('finance', 'minGuarantorsNotMet', { count: String(rule.minGuarantors) });
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate();
  };

  return <Page title={t('finance', 'createApplication')} description={t('finance', 'applicationsDescription')} actions={<Back label={t('finance', 'backToApplications')} />}>
    <div className="max-w-3xl space-y-5">
      <FormSection title={t('finance', 'general')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="app-member">{t('finance', 'selectMember')}</Label>
            <select id="app-member" value={form.memberId} onChange={(event) => setForm({ memberId: event.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{t('finance', 'selectMember')}</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
            </select>
            <FieldError message={errors.memberId} />
          </div>
          <div className="space-y-2"><Label htmlFor="app-amount">{t('finance', 'requestedAmount')} *</Label><AmountInput id="app-amount" value={form.requestedAmount} onValueChange={(requestedAmount) => setForm({ requestedAmount })} /><FieldError message={errors.amount} />{rule && <p className="text-[11px] text-muted-foreground">{t('finance', 'policyAmountRange', { min: formatCurrency(rule.minAmount, currency), max: formatCurrency(rule.maxAmount, currency) })}</p>}</div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="app-purpose">{t('finance', 'purpose')}</Label><Textarea id="app-purpose" value={form.purpose} onChange={(event) => setForm({ purpose: event.target.value })} /></div>
        </div>
      </FormSection>
      {rule?.requiresGuarantor && <FormSection title={t('finance', 'guarantorsSection')}>
        <p className="mb-3 text-xs text-muted-foreground">{t('finance', 'guarantorRequiredByPolicy', { min: String(rule.minGuarantors), max: String(rule.maxGuarantors) })}</p>
        <div className="space-y-3">
          {guarantorRows.map((row, index) => <div key={index} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
            <div className="space-y-1"><Label htmlFor={`app-guarantor-name-${index}`}>{t('finance', 'guarantorName')}</Label>
              <select id={`app-guarantor-name-${index}`} value={row.name} onChange={(event) => setGuarantor(index, { name: event.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">{t('finance', 'selectMember')}</option>
                {members.filter((member) => rule.allowSelfGuarantee || member.id !== form.memberId).map((member) => <option key={member.id} value={`${member.firstName} ${member.lastName}`}>{member.firstName} {member.lastName}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label htmlFor={`app-guarantor-amount-${index}`}>{t('finance', 'guaranteedAmount')}</Label><AmountInput id={`app-guarantor-amount-${index}`} value={row.amount} onValueChange={(amount) => setGuarantor(index, { amount })} /></div>
            <div className="space-y-1"><Label htmlFor={`app-guarantor-relation-${index}`}>{t('finance', 'guarantorRelation')}</Label><Input id={`app-guarantor-relation-${index}`} value={row.relation} onChange={(event) => setGuarantor(index, { relation: event.target.value })} /></div>
          </div>)}
          <FieldError message={errors.guarantors} />
        </div>
      </FormSection>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/finance/credit/applications')}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div>
    </div>
  </Page>;
}

/**
 * PRIORITÉ N°1 du mandat « Finalisation Finance/Tontines » — brancher le
 * nouveau moteur financier (`@/lib/finance`, `financePositionService`) à
 * l'interface : jusqu'ici entièrement fonctionnel et testé (150+ cas), mais
 * invisible pour un utilisateur (aucune route ne l'appelait, cf. audit
 * TANZEN). Ne remplace PAS `resolveCashbox()` (déjà utilisé par la liste des
 * comptes et la fiche caisse, déjà correct et testé) : ajoute la capacité
 * qui n'existait nulle part — solde à une date passée, et position financière
 * consolidée d'un membre (épargne / prêts en cours / distributions).
 */
function FinancePosition({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  const today = new Date().toISOString().slice(0, 10);
  const { data: cashboxes = [] } = useQuery({ queryKey: queryKeys.finance.cashboxes(currentTenant.id), queryFn: () => financeService.listCashboxes(currentTenant.id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });

  const [cashboxId, setCashboxId] = useState('');
  const [cashboxDate, setCashboxDate] = useState(today);
  const cashboxScope = cashboxId ? ({ kind: 'CASHBOX' as const, cashboxId }) : null;
  const { data: balanceResult, isFetching: balanceLoading } = useQuery({
    queryKey: cashboxScope ? queryKeys.finance.position.balance(currentTenant.id, scopeKey(cashboxScope), cashboxDate) : ['finance', 'position', 'balance', 'idle'],
    queryFn: () => financePositionService.balanceAsOf(currentTenant.id, cashboxScope!, cashboxDate),
    enabled: Boolean(cashboxScope && cashboxDate),
  });

  const [memberId, setMemberId] = useState('');
  const [memberDate, setMemberDate] = useState(today);
  const memberScope = memberId ? ({ kind: 'MEMBER_ALL_CASHBOXES' as const, memberId }) : null;
  const { data: positionResult, isFetching: positionLoading } = useQuery({
    queryKey: memberScope ? queryKeys.finance.position.memberPosition(currentTenant.id, scopeKey(memberScope), memberDate) : ['finance', 'position', 'member', 'idle'],
    queryFn: () => financePositionService.memberFinancialPosition(currentTenant.id, memberScope!, memberDate),
    enabled: Boolean(memberScope && memberDate),
  });

  return <Page title={t('finance', 'financialPositionTitle')} description={t('finance', 'financialPositionDescription')} actions={<Back label={t('finance', 'backToCashboxes')} />}>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'balanceAsOfTitle')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="pos-cashbox">{t('finance', 'cashboxField')}</Label>
            <select id="pos-cashbox" value={cashboxId} onChange={(event) => setCashboxId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{t('finance', 'selectCashboxPlaceholder')}</option>
              {cashboxes.map((cashbox) => <option key={cashbox.id} value={cashbox.id}>{cashbox.title}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label htmlFor="pos-cashbox-date">{t('finance', 'asOfDate')}</Label><Input id="pos-cashbox-date" type="date" value={cashboxDate} onChange={(event) => setCashboxDate(event.target.value)} /></div>
        </div>
        {cashboxId && (balanceLoading ? <p className="text-xs text-muted-foreground">{t('finance', 'saving')}</p> : balanceResult && (
          <div className="rounded-lg border border-border p-4">
            <p className="text-[11px] text-muted-foreground">{t('finance', 'balance')}</p>
            <p className="text-2xl font-semibold"><MoneyDisplay amount={balanceResult.total} /></p>
            {balanceResult.outOfScope && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{t('finance', 'outOfScope')}</p>}
          </div>
        ))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'memberPositionTitle')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="pos-member">{t('finance', 'selectMember')}</Label>
            <select id="pos-member" value={memberId} onChange={(event) => setMemberId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{t('finance', 'selectMember')}</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label htmlFor="pos-member-date">{t('finance', 'asOfDate')}</Label><Input id="pos-member-date" type="date" value={memberDate} onChange={(event) => setMemberDate(event.target.value)} /></div>
        </div>
        {memberId && (positionLoading ? <p className="text-xs text-muted-foreground">{t('finance', 'saving')}</p> : positionResult && (
          <div className="grid grid-cols-2 gap-3">
            <Info label={t('finance', 'savingsPosition')} value={<MoneyDisplay amount={positionResult.savings} />} icon={WalletCards} />
            <Info label={t('finance', 'otherMovementsPosition')} value={<MoneyDisplay amount={positionResult.otherMovements} />} icon={Banknote} />
            {positionResult.credit && <Info label={t('finance', 'outstanding')} value={<MoneyDisplay amount={positionResult.credit.outstanding} />} icon={HandCoins} />}
            {positionResult.distributions !== undefined && <Info label={t('finance', 'distributionsPosition')} value={<MoneyDisplay amount={positionResult.distributions} />} icon={Landmark} />}
            {positionResult.estimatedNetPosition !== undefined && <Info label={t('finance', 'estimatedNetPositionLabel')} value={<MoneyDisplay amount={positionResult.estimatedNetPosition} />} icon={TrendingUp} />}
            {positionResult.outOfScope && <p className="col-span-2 text-xs text-amber-700 dark:text-amber-300">{t('finance', 'outOfScope')}</p>}
          </div>
        ))}
      </CardContent></Card>
    </div>
  </Page>;
}

function LoansList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const [search, setSearch] = useState('');
  const { data: loans = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.credit.loans(currentTenant.id), queryFn: () => creditService.listLoans(currentTenant.id) });
  const filtered = loans.filter((loan) => `${loan.borrower} ${loan.id}`.toLowerCase().includes(search.toLowerCase()));
  const columns: TableColumn<Loan>[] = [
    { key: 'borrower', header: t('finance', 'borrower'), render: (row) => <button type="button" onClick={() => navigate(`/finance/credit/loans/${row.id}`)} className="text-left font-semibold text-primary">{row.borrower}</button> },
    { key: 'principal', header: t('finance', 'principal'), render: (row) => <MoneyDisplay amount={row.principal} /> },
    { key: 'outstanding', header: t('finance', 'outstanding'), render: (row) => <MoneyDisplay amount={row.outstanding} /> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', row.status)} tone={tone[row.status]} /> },
    { key: 'nextPaymentDate', header: t('finance', 'nextPayment'), render: (row) => <DateDisplay value={row.nextPaymentDate} /> },
  ];
  if (isLoading) return <Page title={t('finance', 'loansTitle')} description={t('finance', 'loansDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'loansTitle')} description={t('finance', 'loansDescription')}><ErrorState onRetry={refetch} /></Page>;
  return <Page title={t('finance', 'loansTitle')} description={t('finance', 'loansDescription')} actions={<PermissionGate permission="applications.create"><Button variant="outline" onClick={() => navigate('/finance/credit/applications')}><FileText size={16} />{t('finance', 'applicationsTitle')}</Button></PermissionGate>}>
    <FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} />
    <DataTable columns={columns} rows={filtered} empty={<EmptyState icon={HandCoins} title={t('finance', 'noLoans')} />} />
  </Page>;
}

function LoanDetail({ t }: { t: T }) {
  const { id = '' } = useParams(); const { currentTenant } = useTenant();
  const { data: loan, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.credit.loan(id), currentTenant.id], queryFn: () => creditService.getLoan(currentTenant.id, id) });
  const { data: repayments = [] } = useQuery({ queryKey: queryKeys.credit.repaymentsByLoan(id), queryFn: () => creditService.listRepaymentsByLoan(currentTenant.id, id), enabled: Boolean(loan) });
  const { data: loanGuarantors = [] } = useQuery({ queryKey: queryKeys.credit.guarantorsByLoan(id), queryFn: () => creditService.listGuarantorsByLoan(currentTenant.id, id), enabled: Boolean(loan) });
  /** Mouvements financiers PRODUITS par le prêt (décaissement(s), encaissements) — chacun rattaché à SA caisse ; le prêt, lui, n'en a aucune. */
  const { data: loanMovements = [] } = useQuery({ queryKey: ['finance', 'transactions', 'by-loan', currentTenant.id, id], queryFn: () => financeService.listTransactionsByLoan(currentTenant.id, id), enabled: Boolean(loan) });
  /** Séance de chaque mouvement — lue sur la TRANSACTION (`sessionId`, source de vérité unique), jamais sur le prêt ni sur le remboursement. */
  const { data: tenantSessions = [] } = useQuery({ queryKey: queryKeys.finance.sessions.all(currentTenant.id), queryFn: () => fiscalSessionService.listAllSessions(currentTenant.id), enabled: Boolean(loan) });
  const loanSessionById = useMemo(() => new Map(tenantSessions.map((session) => [session.id, session])), [tenantSessions]);
  const navigate = useNavigate();
  const partyLabel = useTransactionPartyLabel();
  if (isLoading) return <Page title={t('finance', 'loanDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'loanDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!loan) return <NotFoundPage />;
  const repaymentColumns: TableColumn<Repayment>[] = [
    { key: 'paymentDate', header: t('finance', 'paymentDate'), render: (row) => <DateDisplay value={row.paymentDate} /> },
    { key: 'principalPart', header: t('finance', 'principalPart'), render: (row) => <MoneyDisplay amount={row.principalPart} /> },
    { key: 'interestPart', header: t('finance', 'interestPart'), render: (row) => <MoneyDisplay amount={row.interestPart} /> },
    { key: 'amount', header: t('finance', 'amount'), render: (row) => <MoneyDisplay amount={row.amount} /> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', row.status)} tone={tone[row.status]} /> },
  ];
  const guarantorColumns: TableColumn<Guarantor>[] = [
    { key: 'guarantorName', header: t('finance', 'guarantorName') },
    { key: 'guaranteedAmount', header: t('finance', 'guaranteedAmount'), render: (row) => <MoneyDisplay amount={row.guaranteedAmount} /> },
    { key: 'relation', header: t('finance', 'relation') },
  ];
  const movementColumns: TableColumn<Transaction>[] = [
    { key: 'date', header: t('finance', 'transactionDateColumn'), render: (row) => <DateDisplay value={row.recordedAt ?? row.date} /> },
    { key: 'nature', header: t('finance', 'movementNature'), render: (row) => <StatusBadge label={t('finance', row.type === 'debit' ? 'movementDisbursement' : 'movementReceipt')} tone={row.type === 'debit' ? 'warning' : 'success'} /> },
    { key: 'cashbox', header: t('finance', 'cashboxField'), render: (row) => partyLabel(row.type === 'debit' ? row.source : row.destination) },
    { key: 'session', header: t('finance', 'sessionField'), render: (row) => { const session = row.sessionId ? loanSessionById.get(row.sessionId) : undefined; return session ? t('finance', 'sessionOption', { number: String(session.sessionNumber), date: formatDate(session.date) }) : <span className="text-muted-foreground">—</span>; } },
    { key: 'amount', header: t('finance', 'amount'), render: (row) => <MoneyDisplay amount={row.amount} /> },
    { key: 'reference', header: t('finance', 'movementReference'), render: (row) => <span className="text-muted-foreground">{row.reference}</span> },
  ];
  return <Page title={loan.id} description={loan.borrower} actions={<Back label={t('finance', 'backToLoans')} />}>
    <div className="space-y-5">
      <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-4">
        <Info label={t('finance', 'principal')} value={<MoneyDisplay amount={loan.principal} />} icon={HandCoins} />
        <Info label={t('finance', 'interestRate')} value={`${loan.interestRate}%`} icon={TrendingUp} />
        <Info label={t('finance', 'interestAmount')} value={<MoneyDisplay amount={loan.interestAmount} />} icon={TrendingUp} />
        <Info label={t('finance', 'totalRepayable')} value={<MoneyDisplay amount={loan.totalRepayable} />} icon={Landmark} />
        <Info label={t('finance', 'outstanding')} value={<MoneyDisplay amount={loan.outstanding} />} icon={WalletCards} />
        <Info label={t('finance', 'paidAmount')} value={<MoneyDisplay amount={loan.paidAmount} />} icon={Banknote} />
        <Info label={t('finance', 'disbursementDate')} value={<DateDisplay value={loan.disbursementDate} />} icon={CalendarClock} />
        <Info label={t('finance', 'maturityDate')} value={<DateDisplay value={loan.maturityDate} />} icon={CalendarClock} />
        <Info label={t('finance', 'monthlyPayment')} value={<MoneyDisplay amount={loan.monthlyPayment} />} icon={Clock3} />
        <Info label={t('finance', 'nextPayment')} value={<DateDisplay value={loan.nextPaymentDate} />} icon={Clock3} />
      </CardContent></Card>
      <div><StatusBadge label={t('finance', loan.status)} tone={tone[loan.status]} /></div>
      {loanGuarantors.length > 0 && <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'guarantorsTitle')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={guarantorColumns} rows={loanGuarantors} empty={null} /></CardContent></Card>}
      <Card data-testid="loan-movements"><CardHeader><CardTitle className="text-sm">{t('finance', 'loanMovementsTitle')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={movementColumns} rows={loanMovements} onRowClick={(row) => navigate(`/finance/transactions/${row.id}`)} empty={<EmptyState icon={ReceiptText} title={t('finance', 'noLoanMovements')} />} /></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'repaymentsTitle')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={repaymentColumns} rows={repayments} empty={<EmptyState icon={ReceiptText} title={t('finance', 'noRepayments')} />} /></CardContent></Card>
    </div>
  </Page>;
}

export function FinanceModule() {
  const { t } = useLocale();
  return (
    <FinanceSessionProvider>
    <Routes>
      {/*
       * Mandat « Refonte module Finances » : le domaine expose Comptes et
       * Transactions (journal central, point d'entrée unique de TOUTE
       * opération via « + Ajouter une transaction »). Mandat « Finalisation
       * Finance/Tontines » (ultérieur) : les écrans Demandes/Prêts sont
       * réintroduits pour porter le cycle de vie complet du crédit (demande →
       * approbation via le moteur de workflow générique → décaissement réel,
       * cf. `creditService`) — Contributions/Garants/Distributions dédiés
       * restent hors périmètre (types d'opération du journal, pas des
       * modules). Les Règles de crédit vivent en Paramètres (`LOAN_RULES_PATH`).
       *
       * Mandat « Le Compte comme point d'entrée des Transactions »
       * (2026-09-23) : Comptes devient la page d'atterrissage de `/finance`
       * (Transactions n'étant plus un nœud de menu, `/finance/transactions`
       * ne doit plus être la redirection par défaut — elle reste une route à
       * part entière, atteignable depuis Comptes/le détail d'un compte).
       */}
      <Route index element={<Navigate to="treasury" replace />} />
      {/* Mandat « Trésorerie » (2026-09-27) : Finance → Trésorerie = deux onglets frères portés par l'URL (Caisses · Transactions). */}
      <Route path="treasury" element={<TreasuryIndexRedirect t={t} />} />
      <Route path="treasury/cashboxes" element={<TreasuryPage t={t} tab="cashboxes" />} />
      <Route path="treasury/transactions" element={<TreasuryPage t={t} tab="transactions" />} />
      <Route path="treasury/*" element={<Navigate to="/finance/treasury" replace />} />
      {/* Anciennes URLs de la liste → Trésorerie (redirection, aucune seconde implémentation). */}
      <Route path="cashboxes" element={<LegacyCashboxesRedirect />} />
      <Route path="cashboxes/create" element={<CashboxCreate t={t} />} />
      <Route path="cashboxes/:id" element={<CashboxDetail t={t} />} />
      <Route path="cashboxes/:id/edit" element={<CashboxEdit t={t} />} />
      {/* L'ancienne liste consolidée EST l'onglet Transactions de Trésorerie (aucun second journal). */}
      <Route path="transactions" element={<LegacyTransactionsRedirect />} />
      <Route path="transactions/create" element={<PermissionRoute permission="transactions.create"><TransactionCreate t={t} /></PermissionRoute>} />
      <Route path="transactions/quick-entry" element={<PermissionRoute permission="transactions.create"><TransactionQuickEntry t={t} /></PermissionRoute>} />
      <Route path="transactions/:id" element={<TransactionDetail t={t} />} />
      <Route path="transactions/:id/edit" element={<PermissionRoute permission="transactions.update"><TransactionEdit t={t} /></PermissionRoute>} />
      {/* Anciennes URLs des Règles de crédit → Paramètres → Règles de crédit. */}
      <Route path="credit/loan-rules/*" element={<LegacyLoanRulesRedirect />} />
      <Route path="credit/applications" element={<PermissionRoute permission="applications.read"><ApplicationsList t={t} /></PermissionRoute>} />
      <Route path="credit/applications/create" element={<PermissionRoute permission="applications.create"><ApplicationCreate t={t} /></PermissionRoute>} />
      <Route path="credit/applications/:id" element={<PermissionRoute permission="applications.read"><ApplicationDetail t={t} /></PermissionRoute>} />
      <Route path="credit/loans" element={<PermissionRoute permission="loans.read"><LoansList t={t} /></PermissionRoute>} />
      <Route path="credit/loans/:id" element={<PermissionRoute permission="loans.read"><LoanDetail t={t} /></PermissionRoute>} />
      <Route path="position" element={<PermissionRoute permission="cashboxes.read"><FinancePosition t={t} /></PermissionRoute>} />
      {/* Bilan financier des adhérents : données financières sensibles → permissions EXISTANTES de lecture du journal ET des prêts. */}
      <Route path="member-balances" element={<PermissionRoute permission="transactions.read"><PermissionRoute permission="loans.read"><MemberBalanceSheetPage t={t} /></PermissionRoute></PermissionRoute>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </FinanceSessionProvider>
  );
}
