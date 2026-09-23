import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowLeft, Ban, Banknote, CalendarClock, Check, ChevronRight, Clock3, CreditCard, FileText, HandCoins, Landmark, ListChecks, Pencil, Plus, ReceiptText, RotateCcw, ShieldCheck, SlidersHorizontal, Trash2, TrendingUp, UserCheck, UsersRound, WalletCards } from 'lucide-react';
import { Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, FormSection, MoneyDisplay, DateDisplay, EmptyState, StatCard, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, FieldError, ConfirmDialog, MemberAvatar } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { useFiscalYear } from '@/contexts/fiscal-year-context';
import { NotFoundPage, PermissionRoute } from '@/routes';
import { financeService, type AccountCreateInput, type AccountUpdateInput, type TransactionInput } from '@/services/finance.service';
import { financePositionService } from '@/services/finance-position.service';
import { scopeKey } from '@/lib/finance';
import { creditService } from '@/services/credit.service';
import { loanRuleService, type LoanRuleInput, type LoanRuleUpdateInput } from '@/services/loan-rule.service';
import { organizationService } from '@/services/organization.service';
import { meetingService } from '@/services/meeting.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import { accountEntryEffect, normalizeAccountLabel, type Account, type AccountType } from '@/mocks/finance/accounts';
import type { Member } from '@/mocks/organization/members';
import type { Transaction, TransactionType } from '@/mocks/finance/transactions';
import type { Loan } from '@/mocks/finance/loans';
import type { Application } from '@/mocks/finance/applications';
import type { Repayment } from '@/mocks/finance/repayments';
import type { Guarantor } from '@/mocks/finance/guarantors';
import { TRANSACTION_CATEGORIES, AUTRES_SUBCATEGORIES, DEFAULT_DIRECTION, categoryLabelKey, subcategoryLabelKey, subcategoriesFor, type TransactionCategory, type TransactionSubcategory } from '@/mocks/finance/transaction-classification';
import type { LoanRule, LoanRuleApprovalLevel, LoanRuleGuaranteeType, LoanRuleInterestPeriod, LoanRuleInterestType, LoanRuleLoanMode } from '@/mocks/finance/loan-rules';
import type { TableColumn } from '@/types/ui';
import { formatNumber } from '@/lib/utils';
import { formatCurrency } from '@/constants/currencies';
import { useOrganizationCurrency } from '@/hooks/use-organization-currency';

type T = (section: 'finance' | 'nav', key: string, values?: Record<string, string>) => string;

/**
 * Réunions de l'exercice fiscal courant (mandat « RÈGLE CENTRALE — DATES DE
 * RÉUNION » §5/§6/§7/§9/§11) — SOURCE DE VÉRITÉ unique de tout champ « Date de
 * réunion » du journal financier. Aucun calcul de date local : les occurrences
 * viennent de `meetingService`, dérivées de `FiscalYear.meetingSchedule`.
 *   - `options` : `value` = `meeting_id` (jamais une date texte), `date` = `meeting.meeting_date` affichée.
 *   - `nearestId` : réunion la plus proche de ce jour, proposée par défaut (§6).
 *   - `hasCalendar` : `false` → l'exercice n'a pas de calendrier, on affiche un état explicite (§11).
 */
function useFiscalMeetings() {
  const { currentTenant } = useTenant();
  const { selectedFiscalYear } = useFiscalYear();
  const fiscalYearId = selectedFiscalYear?.id;
  const hasCalendar = Boolean(selectedFiscalYear?.meetingSchedule);
  const enabled = Boolean(fiscalYearId) && hasCalendar;
  const today = new Date().toISOString().slice(0, 10);
  const { data: options = [] } = useQuery({
    queryKey: queryKeys.meetings.forFiscalYear(currentTenant.id, fiscalYearId),
    queryFn: () => meetingService.getMeetingOptions(currentTenant.id, fiscalYearId as string),
    enabled,
  });
  const { data: nearest = null } = useQuery({
    queryKey: queryKeys.meetings.nearest(currentTenant.id, fiscalYearId, today),
    queryFn: () => meetingService.getNearestMeeting(currentTenant.id, fiscalYearId as string, today),
    enabled,
  });
  const dateById = useMemo(() => new Map(options.map((option) => [option.value, option.date])), [options]);
  return { options, dateById, nearestId: nearest?.id ?? '', fiscalYearId, hasCalendar };
}

/**
 * Champ « Date de réunion » commun à la création et à l'édition — `value`/
 * `onChange` portent le `meeting_id` (jamais une date libre). L'affichage montre
 * `meeting.meeting_date`. Sans calendrier configuré pour l'exercice (§11/§12), le
 * champ reste présent mais désactivé, avec un état explicite : aucune date n'est
 * inventée et aucune réunion ne peut être sélectionnée.
 */
function MeetingField({ t, value, onChange, options, hasCalendar }: { t: T; value: string; onChange: (meetingId: string) => void; options: { value: string; date: string }[]; hasCalendar: boolean }) {
  return <div className="space-y-2"><Label htmlFor="tx-meeting">{t('finance', 'meetingDateField')}</Label>
    <select id="tx-meeting" value={value} disabled={!hasCalendar} onChange={(event) => onChange(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60">
      <option value="">{t('finance', 'noMeeting')}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.date}</option>)}
    </select>
    {!hasCalendar && <p className="text-[11px] text-amber-700 dark:text-amber-300">{t('finance', 'noMeetingCalendar')}</p>}
  </div>;
}
const tone = { active: 'success' as const, inactive: 'default' as const, completed: 'success' as const, pending: 'warning' as const, failed: 'error' as const, cancelled: 'default' as const, scheduled: 'info' as const, late: 'error' as const, stageSubmitted: 'info' as const, stageReview: 'warning' as const, stageApproved: 'success' as const, stageRejected: 'error' as const, stageDisbursed: 'success' as const, repaid: 'success' as const, defaulted: 'error' as const, applied: 'error' as const, waived: 'default' as const };

function Page({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="FINANCE" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label }: { label: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={15} />{label}</Button>; }
function Info({ label, value, icon: Icon }: { label: string; value: ReactNode; icon: typeof Landmark }) { return <div className="flex gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }
function Metric({ label, value, icon: Icon, tone = 'info' }: { label: string; value: string; icon: typeof Landmark; tone?: 'info' | 'success' | 'warning' | 'neutral' }) { return <StatCard label={label} value={value} icon={Icon} tone={tone} />; }

const ACCOUNT_TYPE_LABEL_KEY: Record<AccountType, string> = { LIBRE: 'accountTypeLibre', TAUX_FIXE: 'accountTypeTauxFixe' };
const MEMBER_STATUS_LABEL_KEY: Record<Member['status'], string> = { active: 'active', inactive: 'inactive', suspended: 'memberStatusSuspended', exited: 'memberStatusExited' };
const MEMBER_STATUS_TONE: Record<Member['status'], 'success' | 'default' | 'warning' | 'error'> = { active: 'success', inactive: 'default', suspended: 'warning', exited: 'error' };

function AccountsList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const [search, setSearch] = useState('');
  const { locale } = useLocale();
  const currency = useOrganizationCurrency();
  const { data: accounts = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.finance.accounts(currentTenant.id), queryFn: () => financeService.listAccounts(currentTenant.id) });
  const [toDelete, setToDelete] = useState<Account | null>(null);
  const deleteMutation = useMockMutation<Awaited<ReturnType<typeof financeService.deleteAccount>>, string>({
    mutationFn: (accountId) => financeService.deleteAccount(currentTenant.id, accountId),
    invalidateKeys: [queryKeys.finance.accounts(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('finance', 'duplicateTitle')); return; }
      notify.success(t('finance', result.deactivated ? 'accountDeactivatedInstead' : 'accountDeleted'));
      setToDelete(null);
    },
  });
  /** Seul objet, hors exercice fiscal, où la réouverture transverse a été jugée justifiée (audit §33/§36 du mandat cycle de vie) — voir `financeService.reactivateAccount`. */
  const reactivateMutation = useMockMutation<Awaited<ReturnType<typeof financeService.reactivateAccount>>, string>({
    mutationFn: (accountId) => financeService.reactivateAccount(currentTenant.id, accountId),
    invalidateKeys: [queryKeys.finance.accounts(currentTenant.id)],
    onSuccess: (result) => { if (result) notify.success(t('finance', 'accountReactivated')); },
  });
  const filtered = accounts.filter((a) => a.title.toLowerCase().includes(search.toLowerCase()));
  if (isLoading) return <Page title={t('finance', 'accountsTitle')} description={t('finance', 'accountsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'accountsTitle')} description={t('finance', 'accountsDescription')}><ErrorState onRetry={refetch} /></Page>;
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const activeCount = accounts.filter((a) => a.status === 'active').length;
  const columns: TableColumn<Account>[] = [
    { key: 'title', header: t('finance', 'accountTitle'), render: (row) => <button type="button" onClick={() => navigate(`/finance/accounts/${row.id}`)} className="text-left font-medium text-primary hover:underline">{row.title}</button> },
    { key: 'type', header: t('finance', 'accountType'), render: (row) => <StatusBadge label={t('finance', ACCOUNT_TYPE_LABEL_KEY[row.type])} tone={row.type === 'TAUX_FIXE' ? 'info' : 'default'} /> },
    { key: 'amount', header: t('finance', 'amount'), render: (row) => row.amount !== null ? <MoneyDisplay amount={row.amount} /> : <span className="text-muted-foreground">—</span> },
    { key: 'balance', header: t('finance', 'balance'), render: (row) => <span className="font-semibold"><MoneyDisplay amount={row.balance} /></span> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', row.status)} tone={tone[row.status]} /> },
    { key: 'actions', header: '', className: 'w-32', render: (row) => <div className="flex justify-end gap-1">
      <PermissionGate permission="accounts.manage"><button type="button" onClick={() => navigate(`/finance/accounts/${row.id}/members`)} aria-label={t('finance', 'manageMembers')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><UsersRound size={16} /></button></PermissionGate>
      <PermissionGate permission="accounts.update"><button type="button" onClick={() => navigate(`/finance/accounts/${row.id}/edit`)} aria-label={t('finance', 'edit')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><Pencil size={16} /></button></PermissionGate>
      {row.status === 'inactive' && <PermissionGate permission="accounts.manage"><button type="button" disabled={reactivateMutation.isPending} onClick={() => reactivateMutation.mutate(row.id)} aria-label={t('finance', 'reactivateAccount')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><RotateCcw size={16} /></button></PermissionGate>}
      <PermissionGate permission="accounts.delete"><button type="button" onClick={() => setToDelete(row)} aria-label={t('finance', 'deleteAccount')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><Trash2 size={16} /></button></PermissionGate>
    </div> },
  ];
  return <Page title={t('finance', 'accountsTitle')} description={t('finance', 'accountsDescription')} actions={<><PermissionGate permission="transactions.read"><Button variant="outline" onClick={() => navigate('/finance/transactions')}><ReceiptText size={16} />{t('finance', 'allTransactions')}</Button></PermissionGate><PermissionGate permission="accounts.read"><Button variant="outline" onClick={() => navigate('/finance/position')}><TrendingUp size={16} />{t('finance', 'financialPositionTitle')}</Button></PermissionGate><PermissionGate permission="applications.read"><Button variant="outline" onClick={() => navigate('/finance/credit/applications')}><HandCoins size={16} />{t('finance', 'credit')}</Button></PermissionGate><PermissionGate permission="loanRules.manage"><Button variant="outline" onClick={() => navigate('/finance/credit/loan-rules')}><ListChecks size={16} />{t('finance', 'creditPolicies')}</Button></PermissionGate><PermissionGate permission="accounts.create"><Button onClick={() => navigate('/finance/accounts/create')}><Plus size={16} />{t('finance', 'newAccount')}</Button></PermissionGate></>}><div className="grid gap-4 sm:grid-cols-3"><Metric label={t('finance', 'totalBalance')} value={formatCurrency(totalBalance, currency, locale, { compact: true })} icon={Landmark} tone="success" /><Metric label={t('finance', 'activeAccounts')} value={formatNumber(activeCount)} icon={WalletCards} /><Metric label={t('finance', 'accounts')} value={formatNumber(accounts.length)} icon={CreditCard} tone="neutral" /></div><FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchAccountPlaceholder')} /><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={Landmark} title={t('finance', 'noAccounts')} />} />
    {toDelete && <ConfirmDialog open title={t('finance', 'deleteAccount')} description={t('finance', 'deleteAccountConfirm')} confirmLabel={t('finance', 'confirm')} cancelLabel={t('finance', 'cancel')} onConfirm={() => deleteMutation.mutate(toDelete.id)} onCancel={() => setToDelete(null)} />}
  </Page>;
}

function AccountFormFields({ t, title, setTitle, type, setType, amount, setAmount, description, setDescription, errors }: {
  t: T; title: string; setTitle: (value: string) => void; type: AccountType; setType: (value: AccountType) => void; amount: string; setAmount: (value: string) => void; description: string; setDescription: (value: string) => void; errors: { title?: string; amount?: string };
}) {
  return <FormSection title={t('finance', 'general')}>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="account-title">{t('finance', 'accountTitle')} *</Label><Input id="account-title" value={title} onChange={(event) => setTitle(event.target.value)} aria-invalid={Boolean(errors.title)} /><FieldError message={errors.title} /></div>
      <div className="space-y-2"><Label htmlFor="account-type">{t('finance', 'accountType')} *</Label><select id="account-type" value={type} onChange={(event) => setType(event.target.value as AccountType)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="TAUX_FIXE">{t('finance', 'accountTypeTauxFixe')}</option><option value="LIBRE">{t('finance', 'accountTypeLibre')}</option></select></div>
      {type === 'TAUX_FIXE' && <div className="space-y-2"><Label htmlFor="account-amount">{t('finance', 'amount')}</Label><Input id="account-amount" type="number" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(errors.amount)} /><FieldError message={errors.amount} /></div>}
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="account-description">{t('finance', 'cotisationDescription')}</Label><Textarea id="account-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
    </div>
  </FormSection>;
}

function AccountCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const [title, setTitle] = useState(''); const [type, setType] = useState<AccountType>('TAUX_FIXE'); const [amount, setAmount] = useState(''); const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ title?: string; amount?: string }>({});
  /** Caisses du tenant — sert au garde-fou de saisie (unicité du libellé, règle métier). La validation autoritaire reste côté service (`createAccount`). */
  const { data: existingAccounts = [] } = useQuery({ queryKey: queryKeys.finance.accounts(currentTenant.id), queryFn: () => financeService.listAccounts(currentTenant.id) });
  const mutation = useMockMutation<Awaited<ReturnType<typeof financeService.createAccount>>, AccountCreateInput>({
    mutationFn: (input) => financeService.createAccount(currentTenant.id, currentTenant.name, input),
    invalidateKeys: [queryKeys.finance.accounts(currentTenant.id)],
    onSuccess: (account) => { if (!account) { notify.error(t('finance', 'duplicateCashLabel')); return; } notify.success(t('finance', 'accountCreated')); navigate(`/finance/accounts/${account.id}`); },
  });
  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!title.trim()) nextErrors.title = t('finance', 'fieldRequired');
    // Règle métier : deux caisses d'un même tenant ne peuvent pas avoir le même libellé (comparaison normalisée : casse/accents/espaces).
    else if (existingAccounts.some((account) => normalizeAccountLabel(account.title) === normalizeAccountLabel(title))) nextErrors.title = t('finance', 'duplicateCashLabel');
    if (type === 'TAUX_FIXE') { if (!amount) nextErrors.amount = t('finance', 'fieldRequired'); else if (Number(amount) <= 0) nextErrors.amount = t('finance', 'invalidAmount'); }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate({ title, type, amount: type === 'TAUX_FIXE' ? Number(amount) : null, description });
  };
  return <Page title={t('finance', 'createAccount')} description={t('finance', 'accountsDescription')} actions={<Back label={t('finance', 'backToAccounts')} />}>
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-5">
        <AccountFormFields t={t} title={title} setTitle={setTitle} type={type} setType={setType} amount={amount} setAmount={setAmount} description={description} setDescription={setDescription} errors={errors} />
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/finance/accounts')}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div>
      </div>
      <FormSection title={t('finance', 'summarySection')}>
        <div className="space-y-4">
          <Info label={t('finance', 'summaryName')} value={title.trim() || '—'} icon={Landmark} />
          <Info label={t('finance', 'accountType')} value={t('finance', ACCOUNT_TYPE_LABEL_KEY[type])} icon={ListChecks} />
          <Info label={t('finance', 'amount')} value={type === 'TAUX_FIXE' && amount ? `${amount}`.trim() : '—'} icon={Banknote} />
          <Info label={t('finance', 'summaryTenant')} value={`${currentTenant.name} (${currentTenant.id})`} icon={UsersRound} />
        </div>
      </FormSection>
    </div>
  </Page>;
}

function AccountEdit({ t }: { t: T }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: account, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.finance.account(id), currentTenant.id], queryFn: () => financeService.getAccount(currentTenant.id, id) });
  /** Autres caisses du tenant — garde-fou d'unicité du libellé (la caisse courante `id` s'exclut elle-même). Validation autoritaire côté service (`updateAccount`). */
  const { data: existingAccounts = [] } = useQuery({ queryKey: queryKeys.finance.accounts(currentTenant.id), queryFn: () => financeService.listAccounts(currentTenant.id) });
  const [form, setForm] = useState<{ title: string; type: AccountType; amount: string; description: string } | null>(null);
  const [errors, setErrors] = useState<{ title?: string; amount?: string }>({});
  const mutation = useMockMutation<Awaited<ReturnType<typeof financeService.updateAccount>>, AccountUpdateInput>({
    mutationFn: (patch) => financeService.updateAccount(currentTenant.id, id, patch),
    invalidateKeys: [queryKeys.finance.account(id), queryKeys.finance.accounts(currentTenant.id)],
    onSuccess: (updated) => { if (!updated) { notify.error(t('finance', 'duplicateCashLabel')); return; } notify.success(t('finance', 'accountUpdated')); navigate(`/finance/accounts/${id}`); },
  });
  if (isLoading) return <Page title={t('finance', 'editAccount')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'editAccount')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!account) return <NotFoundPage />;
  const current = form ?? { title: account.title, type: account.type, amount: account.amount === null ? '' : String(account.amount), description: account.description };
  const setField = <K extends keyof typeof current>(key: K, value: (typeof current)[K]) => setForm({ ...current, [key]: value });
  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!current.title.trim()) nextErrors.title = t('finance', 'fieldRequired');
    // Règle métier : le nouveau libellé ne doit pas entrer en collision (normalisée) avec une AUTRE caisse du tenant — la caisse courante garde le droit à son propre libellé.
    else if (existingAccounts.some((other) => other.id !== id && normalizeAccountLabel(other.title) === normalizeAccountLabel(current.title))) nextErrors.title = t('finance', 'duplicateCashLabel');
    if (current.type === 'TAUX_FIXE') { if (!current.amount) nextErrors.amount = t('finance', 'fieldRequired'); else if (Number(current.amount) <= 0) nextErrors.amount = t('finance', 'invalidAmount'); }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate({ title: current.title, type: current.type, amount: current.type === 'TAUX_FIXE' ? Number(current.amount) : null, description: current.description });
  };
  return <Page title={t('finance', 'editAccount')} description={account.title} actions={<Back label={t('finance', 'backToAccounts')} />}>
    <div className="max-w-5xl space-y-5">
      <AccountFormFields t={t} title={current.title} setTitle={(value) => setField('title', value)} type={current.type} setType={(value) => setField('type', value)} amount={current.amount} setAmount={(value) => setField('amount', value)} description={current.description} setDescription={(value) => setField('description', value)} errors={errors} />
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/finance/accounts/${id}`)}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div>
    </div>
  </Page>;
}

function AccountDetail({ t }: { t: T }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: account, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.finance.account(id), currentTenant.id], queryFn: () => financeService.getAccount(currentTenant.id, id) });
  const { data: transactions = [] } = useQuery({ queryKey: queryKeys.finance.transactions(currentTenant.id), queryFn: () => financeService.listTransactions(currentTenant.id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const memberById = useMemo(() => new Map<string, Member>(members.map((member) => [member.id, member])), [members]);
  const [toDelete, setToDelete] = useState(false);
  const deleteMutation = useMockMutation<Awaited<ReturnType<typeof financeService.deleteAccount>>, string>({
    mutationFn: (accountId) => financeService.deleteAccount(currentTenant.id, accountId),
    invalidateKeys: [queryKeys.finance.account(id), queryKeys.finance.accounts(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('finance', 'duplicateTitle')); return; }
      setToDelete(false);
      if (result.deleted) { notify.success(t('finance', 'accountDeleted')); navigate('/finance/accounts'); return; }
      notify.success(t('finance', 'accountDeactivatedInstead'));
    },
  });
  const reactivateMutation = useMockMutation<Awaited<ReturnType<typeof financeService.reactivateAccount>>, string>({
    mutationFn: (accountId) => financeService.reactivateAccount(currentTenant.id, accountId),
    invalidateKeys: [queryKeys.finance.account(id), queryKeys.finance.accounts(currentTenant.id)],
    onSuccess: (result) => { if (result) notify.success(t('finance', 'accountReactivated')); },
  });
  if (isLoading) return <Page title={t('finance', 'accountDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'accountDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!account) return <NotFoundPage />;
  /** Même prédicat que `accountLedgerEntries` (mocks/finance/accounts.ts) : la caisse figure sur l'une des deux extrémités → le panneau et le solde voient exactement le même ensemble de transactions. */
  const accountTransactions = transactions.filter((tr) => tr.fromAccount === account.accountNumber || tr.toAccount === account.accountNumber);
  /** Colonnes du journal orientées « point de vue de cette caisse » (Débit = sortie, Crédit = entrée) → cohérence stricte panneau ↔ solde. */
  const columns = transactionJournalColumns(t, memberById, account.accountNumber);
  return <Page title={account.title} description={account.tenantName} actions={<>
    <Back label={t('finance', 'backToAccounts')} />
    {/* Mandat « Le Compte comme point d'entrée des Transactions » (2026-09-23) : le compte pré-sélectionne son propre numéro via `?accountId=`, l'utilisateur n'a jamais à le ressaisir dans `TransactionFormBody` (voir `accountLocked`). */}
    <PermissionGate permission="transactions.create"><Button onClick={() => navigate(`/finance/transactions/create?accountId=${id}`)}><Plus size={15} />{t('finance', 'newTransaction')}</Button></PermissionGate>
    <PermissionGate permission="accounts.manage"><Button variant="outline" onClick={() => navigate(`/finance/accounts/${id}/members`)}><UsersRound size={15} />{t('finance', 'manageMembers')}</Button></PermissionGate>
    <PermissionGate permission="accounts.update"><Button variant="outline" onClick={() => navigate(`/finance/accounts/${id}/edit`)}><Pencil size={15} />{t('finance', 'edit')}</Button></PermissionGate>
    {account.status === 'inactive' && <PermissionGate permission="accounts.manage"><Button variant="outline" disabled={reactivateMutation.isPending} onClick={() => reactivateMutation.mutate(id)}><RotateCcw size={15} />{t('finance', 'reactivateAccount')}</Button></PermissionGate>}
    <PermissionGate permission="accounts.delete"><Button variant="outline" className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300" onClick={() => setToDelete(true)}><Trash2 size={15} />{t('finance', 'deleteAccount')}</Button></PermissionGate>
  </>}>
    {toDelete && <ConfirmDialog open title={t('finance', 'deleteAccount')} description={t('finance', 'deleteAccountConfirm')} confirmLabel={t('finance', 'confirm')} cancelLabel={t('finance', 'cancel')} onConfirm={() => deleteMutation.mutate(id)} onCancel={() => setToDelete(false)} />}
    <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
      {/*
        * Fiche COMPTE financier (mandat « nettoyage fiche compte ») — plus une
        * ancienne « caisse de cotisation » : les propriétés héritées (nature de
        * la cotisation `type`, montant fixe `amount`, décompte des adhérents
        * affectés) ne sont plus affichées ici. Elles restent dans le modèle
        * (`Account`) et éditables via l'écran dédié tant que le besoin métier
        * existe. Le compte se résume à : nom · tenant · solde · dernier
        * mouvement · statut · journal.
        */}
      <Card><CardContent className="p-5">
        <p className="text-xs text-muted-foreground">{t('finance', 'balance')}</p><p className="mt-2 font-heading text-3xl font-semibold"><MoneyDisplay amount={account.balance} /></p>
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          <Info label={t('finance', 'lastMovement')} value={<DateDisplay value={account.lastMovement} />} icon={Clock3} />
        </div>
        {account.description && <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">{account.description}</p>}
        <div className="mt-4"><StatusBadge label={t('finance', account.status)} tone={tone[account.status]} /></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'transactions')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={columns} rows={accountTransactions} empty={<EmptyState icon={ReceiptText} title={t('finance', 'noTransactions')} />} /></CardContent></Card>
    </div>
  </Page>;
}

function AccountMembersManage({ t }: { t: T }) {
  const { id = '' } = useParams(); const { currentTenant } = useTenant();
  const { data: account, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.finance.account(id), currentTenant.id], queryFn: () => financeService.getAccount(currentTenant.id, id) });
  const { data: allMembers = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id), enabled: Boolean(account) });
  const [availableSearch, setAvailableSearch] = useState(''); const [assignedSearch, setAssignedSearch] = useState('');
  const [selectedAvailable, setSelectedAvailable] = useState<Set<string>>(new Set());
  const [selectedAssigned, setSelectedAssigned] = useState<Set<string>>(new Set());

  const addMutation = useMockMutation<Awaited<ReturnType<typeof financeService.addAccountMembers>>, string[]>({
    mutationFn: (memberIds) => financeService.addAccountMembers(currentTenant.id, id, memberIds),
    invalidateKeys: [queryKeys.finance.account(id), queryKeys.finance.accounts(currentTenant.id)],
    onSuccess: (_updated, memberIds) => { notify.success(t('finance', memberIds.length === 1 ? 'membersAddedOne' : 'membersAddedMany', { count: String(memberIds.length) })); setSelectedAvailable(new Set()); },
  });
  const removeMutation = useMockMutation<Awaited<ReturnType<typeof financeService.removeAccountMembers>>, string[]>({
    mutationFn: (memberIds) => financeService.removeAccountMembers(currentTenant.id, id, memberIds),
    invalidateKeys: [queryKeys.finance.account(id), queryKeys.finance.accounts(currentTenant.id)],
    onSuccess: (_updated, memberIds) => { notify.success(t('finance', memberIds.length === 1 ? 'membersRemovedOne' : 'membersRemovedMany', { count: String(memberIds.length) })); setSelectedAssigned(new Set()); },
  });

  if (isLoading) return <Page title={t('finance', 'manageMembers')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'manageMembers')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!account) return <NotFoundPage />;

  const assignedIds = new Set(account.memberIds);
  const assigned = allMembers.filter((member) => assignedIds.has(member.id));
  const available = allMembers.filter((member) => !assignedIds.has(member.id) && member.status === 'active');
  const availableRows = availableSearch ? available.filter((member) => `${member.firstName} ${member.lastName} ${member.matricule}`.toLowerCase().includes(availableSearch.toLowerCase())) : available;
  const assignedRows = assignedSearch ? assigned.filter((member) => `${member.firstName} ${member.lastName} ${member.matricule}`.toLowerCase().includes(assignedSearch.toLowerCase())) : assigned;

  const toggle = (set: Set<string>, setSet: (next: Set<string>) => void, memberId: string) => { const next = new Set(set); if (next.has(memberId)) next.delete(memberId); else next.add(memberId); setSet(next); };

  const makeColumns = (selected: Set<string>, setSelected: (next: Set<string>) => void): TableColumn<Member>[] => [
    { key: 'select', header: '', className: 'w-10', render: (row) => <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggle(selected, setSelected, row.id)} aria-label={`${row.firstName} ${row.lastName}`} /> },
    { key: 'name', header: t('finance', 'member'), render: (row) => <span className="flex items-center gap-2 font-medium"><MemberAvatar member={row} />{row.firstName} {row.lastName}</span> },
    { key: 'matricule', header: t('finance', 'memberMatricule'), render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.matricule}</span> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', MEMBER_STATUS_LABEL_KEY[row.status])} tone={MEMBER_STATUS_TONE[row.status]} /> },
  ];

  return <Page title={t('finance', 'manageMembers')} description={`${account.title} — ${t('finance', 'accountMembersSubtitle')}`} actions={<Back label={t('finance', 'backToAccounts')} />}>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">{t('finance', 'availableMembers')} ({available.length})</CardTitle>
          <PermissionGate permission="accounts.manage"><div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={selectedAvailable.size === 0 || addMutation.isPending} onClick={() => addMutation.mutate([...selectedAvailable])}>{t('finance', 'addSelected')}</Button>
            <Button size="sm" disabled={available.length === 0 || addMutation.isPending} onClick={() => addMutation.mutate(available.map((member) => member.id))}>{t('finance', 'addAllMembers')}</Button>
          </div></PermissionGate>
        </CardHeader>
        <CardContent className="space-y-3 p-0"><div className="px-4"><FilterBar search={availableSearch} onSearchChange={setAvailableSearch} placeholder={t('finance', 'searchMemberPlaceholder')} /></div><DataTable columns={makeColumns(selectedAvailable, setSelectedAvailable)} rows={availableRows} empty={<EmptyState icon={UsersRound} title={t('finance', 'noAvailableMembers')} />} /></CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">{t('finance', 'assignedMembers')} ({assigned.length})</CardTitle>
          <PermissionGate permission="accounts.manage"><div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={selectedAssigned.size === 0 || removeMutation.isPending} onClick={() => removeMutation.mutate([...selectedAssigned])}>{t('finance', 'removeSelected')}</Button>
            <Button variant="outline" size="sm" disabled={assigned.length === 0 || removeMutation.isPending} onClick={() => removeMutation.mutate(assigned.map((member) => member.id))}>{t('finance', 'removeAllMembers')}</Button>
          </div></PermissionGate>
        </CardHeader>
        <CardContent className="space-y-3 p-0"><div className="px-4"><FilterBar search={assignedSearch} onSearchChange={setAssignedSearch} placeholder={t('finance', 'searchMemberPlaceholder')} /></div><DataTable columns={makeColumns(selectedAssigned, setSelectedAssigned)} rows={assignedRows} empty={<EmptyState icon={UsersRound} title={t('finance', 'noAssignedMembers')} />} /></CardContent>
      </Card>
    </div>
  </Page>;
}

/**
 * Colonnes du journal des transactions — SOURCE UNIQUE partagée par la vue
 * consolidée `Finance → Transactions` (`TransactionsList`) ET le panel
 * `Transactions` de la fiche caisse (`AccountDetail`), pour garantir libellés,
 * ordre, mapping métier, formats de date/monnaie et règles de valeur absente
 * strictement identiques entre les deux vues. Exactement les 7 colonnes du
 * mandat, dans cet ordre : Date réunion · Date transaction · Adhérent ·
 * Catégorie · Débit · Crédit · Commentaire. Le statut reste un filtre (jamais
 * une colonne) ; une transaction annulée est grisée + barrée.
 */
/**
 * `accountNumber` fourni (panneau « Transactions » de la fiche caisse) → les
 * colonnes Débit/Crédit sont orientées DU POINT DE VUE DE CETTE CAISSE : sortie
 * (`fromAccount === accountNumber`) = Débit, entrée (`toAccount === accountNumber`)
 * = Crédit. Ainsi chaque ligne visible correspond exactement à son effet sur le
 * solde (`solde = Σ Crédit − Σ Débit`), y compris pour un virement inter-caisses
 * reçu (affiché en Crédit, alors qu'il est un Débit dans le journal du tenant).
 * Sans `accountNumber` (journal consolidé) → Débit/Crédit = `Transaction.type`.
 */
function transactionJournalColumns(t: T, memberById: Map<string, Member>, accountNumber?: string): TableColumn<Transaction>[] {
  const memberFullName = (memberId: string) => { const member = memberById.get(memberId); return member ? `${member.firstName} ${member.lastName}` : memberId; };
  // Orientation par caisse : signe de `accountEntryEffect` (même fonction que le solde) → cohérence stricte panneau ↔ solde. Sans caisse : perspective journal du tenant (`Transaction.type`).
  const effect = (row: Transaction) => (accountNumber ? accountEntryEffect(accountNumber, row) : row.type === 'debit' ? -row.amount : row.amount);
  const isDebit = (row: Transaction) => effect(row) < 0;
  const isCredit = (row: Transaction) => effect(row) > 0;
  const counterparty = (row: Transaction) => (row.fromAccount === accountNumber ? row.toAccount : row.fromAccount);
  return [
    { key: 'meetingDate', header: t('finance', 'meetingDateColumn'), render: (row) => row.meetingDate ? <DateDisplay value={row.meetingDate} /> : <span className="text-muted-foreground">—</span> },
    { key: 'transactionDate', header: t('finance', 'transactionDateColumn'), render: (row) => <span className={row.status === 'cancelled' ? 'text-muted-foreground line-through' : undefined}><DateDisplay value={row.recordedAt ?? row.date} withTime={Boolean(row.recordedAt)} /></span> },
    { key: 'member', header: t('finance', 'adherent'), render: (row) => row.memberId ? <span className="flex items-center gap-2 font-medium"><MemberAvatar member={memberById.get(row.memberId) ?? { firstName: memberFullName(row.memberId), lastName: '' }} /><span>{memberFullName(row.memberId)}</span></span> : <span className="text-muted-foreground">{accountNumber ? counterparty(row) : '—'}</span> },
    { key: 'category', header: t('finance', 'category'), render: (row) => <span className="flex items-center gap-2">{t('finance', categoryLabelKey(row.category))}{row.subcategory ? <span className="text-muted-foreground">· {t('finance', subcategoryLabelKey(row.subcategory))}</span> : null}{row.status === 'cancelled' && <StatusBadge label={t('finance', 'cancelled')} tone="default" />}</span> },
    { key: 'debit', header: t('finance', 'debit'), render: (row) => isDebit(row) ? <span className={`font-semibold ${row.status === 'cancelled' ? 'text-muted-foreground line-through' : 'text-rose-600 dark:text-rose-400'}`}><MoneyDisplay amount={row.amount} /></span> : <span className="text-muted-foreground">—</span> },
    { key: 'credit', header: t('finance', 'credit'), render: (row) => isCredit(row) ? <span className={`font-semibold ${row.status === 'cancelled' ? 'text-muted-foreground line-through' : 'text-emerald-600 dark:text-emerald-400'}`}><MoneyDisplay amount={row.amount} /></span> : <span className="text-muted-foreground">—</span> },
    { key: 'description', header: t('finance', 'comment'), render: (row) => <span className="text-sm text-muted-foreground" title={row.description}>{row.description || '—'}</span> },
  ];
}

/**
 * Vue consolidée Finance → Transactions (mandat « refonte complète ») —
 * remplace intégralement l'ancienne liste centrée sur une caisse : le
 * périmètre est désormais `currentTenant` + `selectedFiscalYear`
 * (`useFiscalYear()`, même contexte global que le sélecteur d'exercice du
 * header — jamais un second état d'exercice dupliqué), les transactions
 * proviennent de TOUTES les caisses du tenant (`financeService.
 * listTransactionsInDateRange`, jamais `Account.memberIds`), et le filtre
 * Adhérent est reconstruit exclusivement à partir des `Transaction.memberId`
 * réellement présents dans ce périmètre — un adhérent sans transaction dans
 * l'exercice sélectionné n'apparaît jamais dans la liste.
 *
 * Deux champs supplémentaires (mandat « filtrage par exercice fiscal et par
 * caisse ») : un reflet EN LECTURE SEULE de l'exercice du header (§2/§3, jamais
 * un second sélecteur) et le filtre « Libelle de caisse » (§1/§4) qui restreint
 * le périmètre (`scoped`) en amont de tout le reste — liste, compteur et KPI
 * (Total débit / Total crédit / Solde = crédit − débit, règle inchangée).
 */
function TransactionsList({ t }: { t: T }) {
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const currency = useOrganizationCurrency();
  const { selectedFiscalYear, fiscalYears, isLoading: isFiscalYearLoading } = useFiscalYear();
  /** `placeholderData: keepPreviousData` — un changement d'exercice change la clé de requête ; sans ça, `isLoading` repasserait à `true` à chaque changement et ferait disparaître la carte Fiscal Year/Adhérent elle-même (plus moyen de rechanger d'exercice pendant le chargement). Les anciennes données restent affichées le temps du rechargement, jamais un écran vide entre deux exercices. */
  const { data: allTransactions = [], isLoading: isTransactionsLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.finance.transactionsByFiscalYear(currentTenant.id, selectedFiscalYear?.id),
    queryFn: () => financeService.listTransactionsInDateRange(currentTenant.id, selectedFiscalYear!.startDate, selectedFiscalYear!.endDate),
    enabled: Boolean(selectedFiscalYear),
    placeholderData: keepPreviousData,
  });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const memberById = useMemo(() => new Map<string, Member>(members.map((member) => [member.id, member])), [members]);
  /** Caisses du tenant — requête indépendante de l'exercice (les `Account` ne portent pas de `fiscalYearId`), donc jamais rechargée sur un simple changement d'exercice : seul le sous-ensemble « pertinent pour l'exercice » est recalculé côté client (`availableAccounts`). */
  const { data: accounts = [] } = useQuery({ queryKey: queryKeys.finance.accounts(currentTenant.id), queryFn: () => financeService.listAccounts(currentTenant.id) });

  const [memberId, setMemberId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  /** Bornes du filtre « période » (§1) — chaînes ISO `YYYY-MM-DD`, comparables lexicographiquement avec `Transaction.date` (même format). Initialisées/réinitialisées aux bornes de l'exercice courant (voir l'effet ci-dessous). */
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('all'); const [subcategory, setSubcategory] = useState('all'); const [status, setStatus] = useState('all'); const [type, setType] = useState('all');

  /**
   * §1/§8 : « Date début » / « Date fin » ne sont JAMAIS codées en dur — elles
   * valent par défaut les bornes réelles de l'exercice sélectionné
   * (`FiscalYear.startDate`/`endDate`, la même source que le champ Exercice en
   * lecture seule et que la requête `listTransactionsInDateRange`). Un changement
   * d'exercice depuis le header les remet donc automatiquement sur les bornes du
   * nouvel exercice (§8.2/§8.3), sans conserver la période de l'ancien.
   */
  const fiscalYearStart = selectedFiscalYear?.startDate ?? '';
  const fiscalYearEnd = selectedFiscalYear?.endDate ?? '';
  useEffect(() => {
    setPeriodStart(fiscalYearStart);
    setPeriodEnd(fiscalYearEnd);
  }, [fiscalYearStart, fiscalYearEnd]);
  /** §9 : la période reste toujours bornée par l'exercice — toute saisie hors limites est corrigée à la borne la plus proche (le `min`/`max` natif de l'input couvre le clavier, ceci couvre tout le reste). */
  const clampToFiscalYear = (value: string) => {
    if (!value || !selectedFiscalYear) return value;
    if (value < fiscalYearStart) return fiscalYearStart;
    if (value > fiscalYearEnd) return fiscalYearEnd;
    return value;
  };
  /** §10 : période incohérente (début > fin) — signalée sous le champ, et AUCUNE donnée n'est renvoyée (jamais une recherche incohérente). */
  const periodInvalid = Boolean(periodStart && periodEnd && periodStart > periodEnd);
  /** Le filtre sous-catégorie n'a de sens que pour la catégorie AUTRES (mandat §24 : « dépendant de la catégorie sélectionnée ») — on le réinitialise dès qu'on quitte AUTRES. */
  useEffect(() => { if (category !== 'AUTRES' && subcategory !== 'all') setSubcategory('all'); }, [category, subcategory]);

  /**
   * Caisses proposées dans le filtre « Libelle de caisse » (mandat §1/§7) —
   * jamais codées en dur : `financeService.listAccounts` (tenant-scopé),
   * restreintes aux caisses pertinentes pour l'exercice courant, c.-à-d.
   * ouvertes au plus tard à la clôture de l'exercice OU déjà porteuses d'au
   * moins une transaction dans son périmètre. Un changement d'exercice recompose
   * donc cette liste. Triées par libellé.
   */
  const accountNumbersInScope = useMemo(() => new Set(allTransactions.flatMap((tr) => [tr.fromAccount, tr.toAccount])), [allTransactions]);
  const availableAccounts = useMemo(() => {
    if (!selectedFiscalYear) return [];
    const inScope = accounts.filter((account) => account.openedOn <= selectedFiscalYear.endDate || accountNumbersInScope.has(account.accountNumber));
    /**
     * Règle métier d'unicité du libellé de caisse (`normalizeAccountLabel`) : le
     * filtre ne doit JAMAIS proposer deux options de libellé normalisé identique.
     * Depuis la mise en place du contrôle (create/update), aucun nouveau conflit
     * ne peut apparaître ; ce dédoublonnage protège en plus des anomalies de
     * données pré-existantes (cf. AC-002 « Épargne » / AC-009 « Epargne »). En
     * cas de collision, on garde une seule caisse par libellé : priorité à celle
     * qui porte des transactions dans l'exercice, puis au plus petit `id`
     * (déterministe) — jamais de fusion ni de modification des données.
     */
    const byLabel = new Map<string, (typeof inScope)[number]>();
    for (const account of inScope) {
      const key = normalizeAccountLabel(account.title);
      const kept = byLabel.get(key);
      if (!kept) { byLabel.set(key, account); continue; }
      const accountHasTx = accountNumbersInScope.has(account.accountNumber);
      const keptHasTx = accountNumbersInScope.has(kept.accountNumber);
      if ((accountHasTx && !keptHasTx) || (accountHasTx === keptHasTx && account.id < kept.id)) byLabel.set(key, account);
    }
    return Array.from(byLabel.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [accounts, accountNumbersInScope, selectedFiscalYear]);
  /** §7 : une caisse sélectionnée qui n'appartient plus à l'exercice courant (après changement d'exercice) retombe sur « Toutes les caisses », jamais conservée silencieusement. */
  useEffect(() => { if (accountNumber && !availableAccounts.some((account) => account.accountNumber === accountNumber)) setAccountNumber(''); }, [availableAccounts, accountNumber]);

  /**
   * Filtre « Libelle de caisse » (mandat §4) — une transaction appartient à la
   * caisse dès que celle-ci figure sur l'une des deux extrémités de l'écriture
   * (`fromAccount`/`toAccount`), même prédicat que la fiche caisse
   * (`accountLedgerEntries`). Appliqué EN AMONT de tous les autres filtres → la
   * liste, le compteur, les KPI (Total débit / Total crédit / Solde) et la liste
   * des adhérents disponibles en héritent tous.
   */
  /**
   * §2/§3/§13/§18 : la période est un VRAI filtre de données, appliqué EN AMONT
   * de la caisse et de l'adhérent — le même dataset borné dans le temps sert
   * ensuite à la liste, au compteur, aux KPI et à la liste des adhérents
   * disponibles. Champ de date métier = `Transaction.date` (celui-là même
   * qu'utilise déjà `listTransactionsInDateRange` pour borner l'exercice, et non
   * `meetingDate`). Bornes inclusives. Période incohérente (§10) → dataset vide.
   */
  const periodScoped = useMemo(() => {
    if (periodInvalid) return [];
    return allTransactions.filter((tr) => (!periodStart || tr.date >= periodStart) && (!periodEnd || tr.date <= periodEnd));
  }, [allTransactions, periodStart, periodEnd, periodInvalid]);

  const scoped = useMemo(
    () => (accountNumber ? periodScoped.filter((tr) => tr.fromAccount === accountNumber || tr.toAccount === accountNumber) : periodScoped),
    [periodScoped, accountNumber],
  );

  /** Adhérents réellement porteurs d'au moins une transaction dans le périmètre courant (tenant + exercice + période + caisse ; jamais `Account.memberIds`, AC08) — dédoublonnés via `Set`, triés par nom. */
  const memberIdsWithTransactions = useMemo(() => new Set(scoped.flatMap((tr) => (tr.memberId ? [tr.memberId] : []))), [scoped]);
  const availableMembers = useMemo(
    () => Array.from(memberIdsWithTransactions).map((id) => memberById.get(id)).filter((member): member is Member => Boolean(member)).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)),
    [memberIdsWithTransactions, memberById],
  );
  /** Changement d'exercice / de caisse (ou de tenant) → un adhérent sélectionné qui n'a plus de transaction dans le nouveau périmètre est désélectionné (mandat §4/§6), jamais laissé sélectionné silencieusement. */
  useEffect(() => { if (memberId && !memberIdsWithTransactions.has(memberId)) setMemberId(''); }, [memberIdsWithTransactions, memberId]);

  const eligible = memberId ? scoped.filter((tr) => tr.memberId === memberId) : scoped;
  const filtered = eligible.filter((tr) => {
    const matchesSearch = `${tr.reference} ${tr.description} ${tr.fromAccount} ${tr.toAccount}`.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || tr.category === category;
    const matchesSubcategory = subcategory === 'all' || tr.subcategory === subcategory;
    const matchesStatus = status === 'all' || tr.status === status;
    const matchesType = type === 'all' || tr.type === type;
    return matchesSearch && matchesCategory && matchesSubcategory && matchesStatus && matchesType;
  });
  /** KPI recalculés sur `filtered` (mandat §4/§11/§12) — respectent donc déjà tenant + exercice + période + caisse + adhérent + les filtres secondaires actifs. Règle métier inchangée : Solde = Total crédit − Total débit (sens = `Transaction.type`). */
  const totalDebit = filtered.filter((tr) => tr.type === 'debit').reduce((sum, tr) => sum + tr.amount, 0);
  const totalCredit = filtered.filter((tr) => tr.type === 'credit').reduce((sum, tr) => sum + tr.amount, 0);

  /** Journal — mêmes 7 colonnes que la fiche caisse (source unique `transactionJournalColumns`). */
  const columns = transactionJournalColumns(t, memberById);
  const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-xs";
  /** Englobe aussi bien le chargement de la requête elle-même que le court instant où elle est encore `enabled: false` (le temps que `selectedFiscalYear` se résolve) — sans ça, la zone Transactions afficherait brièvement un tableau vide avant le skeleton, un aller-retour visuel inutile. */
  const isTableLoading = isTransactionsLoading || !selectedFiscalYear;

  if (isFiscalYearLoading) return <Page title={t('finance', 'transactionsTitle')} description={t('finance', 'transactionsDescription')}><TableSkeleton /></Page>;
  if (fiscalYears.length === 0) return <Page title={t('finance', 'transactionsTitle')} description={t('finance', 'transactionsDescription')}><EmptyState icon={CalendarClock} title={t('finance', 'noFiscalYearConfigured')} /></Page>;

  /**
   * La carte de filtres (Exercice lecture seule · Libelle de caisse · Adhérent ·
   * dates d'exercice) reste toujours montée dès que les exercices sont chargés —
   * seule la zone KPI/DataTable en dessous bascule entre skeleton/erreur/contenu
   * selon `isTableLoading`/`isError`. L'exercice courant provient du contexte
   * global `useFiscalYear()` (sélecteur du header) ; il est ici purement
   * affiché, comme ses bornes de dates.
   */
  return <Page title={t('finance', 'transactionsTitle')} description={t('finance', 'transactionsDescription')} actions={<PermissionGate permission="transactions.create"><Button onClick={() => navigate('/finance/transactions/create')}><Plus size={16} />{t('finance', 'addTransaction')}</Button></PermissionGate>}>
    <Card>
      <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="tr-fiscal-year">{t('finance', 'fiscalYear')}</Label>
          {/* §2/§3 : simple reflet, EN LECTURE SEULE, de l'exercice choisi dans le sélecteur global du header (`useFiscalYear()`) — jamais un second moyen de changer d'exercice. */}
          <Input id="tr-fiscal-year" value={selectedFiscalYear?.label ?? ''} readOnly tabIndex={-1} aria-readonly="true" className="cursor-default bg-muted text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tr-account">{t('finance', 'cashLabel')}</Label>
          <select id="tr-account" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t('finance', 'allCashboxes')}</option>
            {availableAccounts.map((account) => <option key={account.id} value={account.accountNumber}>{account.title}</option>)}
          </select>
          {availableAccounts.length === 0 && <p className="text-[11px] text-muted-foreground">{t('finance', 'noCashboxForFiscalYear')}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tr-member">{t('finance', 'adherent')}</Label>
          <select id="tr-member" value={memberId} onChange={(event) => setMemberId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t('finance', 'allAdherents')}</option>
            {availableMembers.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
          </select>
          {availableMembers.length === 0 && <p className="text-[11px] text-muted-foreground">{t('finance', 'noMembersWithTransactions')}</p>}
        </div>
        {/*
          * §1/§2/§15 : « Date début » / « Date fin » sont de VRAIS filtres de
          * période, modifiables — pas un simple affichage. Par défaut = bornes de
          * l'exercice sélectionné (jamais codées en dur) ; `min`/`max` = ces mêmes
          * bornes (§9) ; toute modification refiltre immédiatement liste, compteur
          * et KPI (§11). Seul le champ Exercice reste en lecture seule.
          */}
        <div className="space-y-1.5">
          <Label htmlFor="tr-period-start">{t('finance', 'startDate')}</Label>
          <Input id="tr-period-start" type="date" value={periodStart} min={fiscalYearStart} max={fiscalYearEnd} disabled={!selectedFiscalYear} aria-invalid={periodInvalid} onChange={(event) => setPeriodStart(clampToFiscalYear(event.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tr-period-end">{t('finance', 'endDate')}</Label>
          <Input id="tr-period-end" type="date" value={periodEnd} min={fiscalYearStart} max={fiscalYearEnd} disabled={!selectedFiscalYear} aria-invalid={periodInvalid} onChange={(event) => setPeriodEnd(clampToFiscalYear(event.target.value))} />
          <FieldError message={periodInvalid ? t('finance', 'periodStartAfterEnd') : undefined} />
        </div>
      </CardContent>
    </Card>

    {isTableLoading ? <div className="mt-5"><TableSkeleton /></div> : isError ? <div className="mt-5"><ErrorState onRetry={refetch} /></div> : <>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label={t('finance', 'totalDebitLabel')} value={formatCurrency(totalDebit, currency, locale)} icon={HandCoins} tone="neutral" />
        <Metric label={t('finance', 'totalCreditLabel')} value={formatCurrency(totalCredit, currency, locale)} icon={Banknote} tone="success" />
        <Metric label={t('finance', 'balance')} value={formatCurrency(totalCredit - totalDebit, currency, locale)} icon={WalletCards} tone={totalCredit - totalDebit >= 0 ? 'success' : 'neutral'} />
      </div>

      <div className="mt-5 space-y-3">
        <FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} filters={<><select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('finance', 'category')} className={selectClass}><option value="all">{t('finance', 'allCategories')}</option>{TRANSACTION_CATEGORIES.map((c) => <option key={c} value={c}>{t('finance', categoryLabelKey(c))}</option>)}</select>{category === 'AUTRES' && <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} aria-label={t('finance', 'subcategory')} className={selectClass}><option value="all">{t('finance', 'allSubcategories')}</option>{AUTRES_SUBCATEGORIES.map((s) => <option key={s} value={s}>{t('finance', subcategoryLabelKey(s))}</option>)}</select>}<select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('finance', 'status')} className={selectClass}><option value="all">{t('finance', 'allStatuses')}</option><option value="completed">{t('finance', 'completed')}</option><option value="pending">{t('finance', 'pending')}</option><option value="failed">{t('finance', 'failed')}</option><option value="cancelled">{t('finance', 'cancelled')}</option></select><select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('finance', 'type')} className={selectClass}><option value="all">{t('finance', 'allTypes')}</option><option value="debit">{t('finance', 'debit')}</option><option value="credit">{t('finance', 'credit')}</option></select></>} />
        <div className="text-xs text-muted-foreground">{formatNumber(filtered.length)} / {formatNumber(scoped.length)} · {t('finance', 'transactionCountLabel')}</div>
        <DataTable columns={columns} rows={filtered} onRowClick={(row) => navigate(`/finance/transactions/${row.id}`)} empty={<EmptyState icon={ReceiptText} title={t('finance', 'noTransactionsForCriteria')} />} />
      </div>
    </>}
  </Page>;
}

/**
 * Classification de la saisie (mandat « CLASSIFICATION DES TRANSACTIONS ») :
 * `category` ∈ {EPARGNE, PRET, REMBOURSEMENT, AUTRES} — source unique
 * `@/mocks/finance/transaction-classification`. `subcategory` n'est demandée
 * QUE pour `AUTRES`. Aucune énumération d'« opération » ici.
 */

type GuarantorRow = { name: string; amount: string; relation: string };

type TransactionFormState = {
  accountNumber: string; meetingId: string; memberId: string;
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

const emptyTransactionForm: TransactionFormState = { accountNumber: '', meetingId: '', memberId: '', category: '', subcategory: '', type: 'credit', amount: '', description: '', interestRate: '', durationMonths: '', startDate: '', dueDate: '', guarantors: [], approved: false, approvedBy: '', loanId: '', debtOutstanding: '', distributionId: '' };

type TransactionFormErrors = { accountNumber?: string; category?: string; subcategory?: string; amount?: string; member?: string; duration?: string; guarantors?: string; approval?: string; repayment?: string };

/**
 * Dette active à rembourser pour un adhérent (mandat « REMBOURSEMENT » —
 * détermination automatique). L'utilisateur ne choisit jamais le prêt : on
 * retient le prêt ACTIF avec un encours > 0 dont l'échéance est la plus proche
 * (départage : encours le plus élevé). `undefined` = aucune dette en cours →
 * remboursement impossible.
 */
function resolveMemberDebt(loans: Loan[]): Loan | undefined {
  return [...loans]
    .filter((loan) => loan.status === 'active' && loan.outstanding > 0)
    .sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate) || b.outstanding - a.outstanding)[0];
}

/**
 * Politique de prêt applicable à la caisse sélectionnée (mandat §7/§17). Le
 * modèle ne porte qu'une `LoanRule` par compte (`LoanRule.accountId`, unique
 * tenant+compte) — pas de politique-défaut tenant ni d'héritage (concern
 * backend). On retient la règle ACTIVE qui autorise les prêts.
 */
function applicableLoanRule(rules: LoanRule[], accounts: Account[], accountNumber: string): LoanRule | undefined {
  const account = accounts.find((item) => item.accountNumber === accountNumber);
  if (!account) return undefined;
  return rules.find((rule) => rule.accountId === account.id && rule.status === 'ACTIVE' && rule.allowLoans);
}

/** Lignes garant à afficher : au moins `minGuarantors` (imposé par la politique), au plus `maxGuarantors`. */
function guarantorRowsFor(form: TransactionFormState, rule: LoanRule | undefined): GuarantorRow[] {
  if (form.category !== 'PRET' || !rule?.requiresGuarantor) return [];
  const count = Math.min(Math.max(form.guarantors.length, rule.minGuarantors), rule.maxGuarantors);
  return Array.from({ length: count }, (_, index) => form.guarantors[index] ?? { name: '', amount: '', relation: '' });
}

/** Compose la description : commentaire libre + détails métier saisis (mandat §5 : aucune entité Loan/Guarantor/Distribution créée, tout est consigné ici). */
function composeTransactionDescription(form: TransactionFormState, rule: LoanRule | undefined, t: T, currency?: string): string {
  const parts = [form.description.trim()].filter(Boolean);
  if (form.category === 'PRET') {
    if (form.interestRate) parts.push(`${t('finance', 'interestRate')}: ${form.interestRate}%`);
    if (form.durationMonths) parts.push(`${t('finance', 'durationMonths')}: ${form.durationMonths}`);
    if (form.startDate) parts.push(`${t('finance', 'startDate')}: ${form.startDate}`);
    if (form.dueDate) parts.push(`${t('finance', 'dueDate')}: ${form.dueDate}`);
    guarantorRowsFor(form, rule).filter((row) => row.name.trim()).forEach((row) => parts.push(`${t('finance', 'guarantor')}: ${row.name}${row.amount ? ` (${row.amount})` : ''}${row.relation ? ` — ${row.relation}` : ''}`));
    if (rule?.requiresApproval && form.approved) parts.push(`${t('finance', 'approvedBy')}: ${form.approvedBy || '—'} (${t('finance', 'approvalLevel' + (rule.approvalLevel ?? 'ADMIN'))})`);
  }
  if (form.category === 'REMBOURSEMENT' && form.loanId) {
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

function TransactionFormBody({ t, form, setForm, errors, mode, accountLocked = false }: { t: T; form: TransactionFormState; setForm: (patch: Partial<TransactionFormState>) => void; errors: TransactionFormErrors; mode: 'create' | 'edit'; accountLocked?: boolean }) {
  const currency = useOrganizationCurrency();
  const { currentTenant } = useTenant();
  const isLoan = mode === 'create' && form.category === 'PRET';
  const isRepayment = mode === 'create' && form.category === 'REMBOURSEMENT';
  const { data: accounts = [] } = useQuery({ queryKey: queryKeys.finance.accounts(currentTenant.id), queryFn: () => financeService.listAccounts(currentTenant.id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { options: meetingOptions, hasCalendar: hasMeetingCalendar } = useFiscalMeetings();
  const isDistribution = form.category === 'AUTRES' && form.subcategory === 'DISTRIBUTION';
  const { data: distributions = [] } = useQuery({ queryKey: queryKeys.finance.distributions(currentTenant.id), queryFn: () => financeService.listDistributions(currentTenant.id), enabled: isDistribution });
  const { data: loanRules = [] } = useQuery({ queryKey: queryKeys.credit.loanRules(currentTenant.id), queryFn: () => loanRuleService.listLoanRules(currentTenant.id), enabled: isLoan });
  const { data: borrowerLoans = [] } = useQuery({ queryKey: queryKeys.credit.loansByMember(form.memberId), queryFn: () => creditService.listLoansByMember(form.memberId), enabled: (isLoan || isRepayment) && Boolean(form.memberId) });

  const rule = isLoan ? applicableLoanRule(loanRules, accounts, form.accountNumber) : undefined;
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
  const guarantorRows = guarantorRowsFor(form, rule);
  const setGuarantor = (index: number, patch: Partial<GuarantorRow>) => {
    const next = guarantorRows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
    setForm({ guarantors: next });
  };
  const guarantorCandidates = members.filter((member) => rule?.allowSelfGuarantee || member.id !== form.memberId);

  return <>
    <FormSection title={t('finance', 'general')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="tx-account">{t('finance', 'accountOrCash')} *</Label>
          <select id="tx-account" value={form.accountNumber} disabled={readOnlyIdentity || accountLocked} onChange={(event) => setForm({ accountNumber: event.target.value })} className={selectClass} aria-invalid={Boolean(errors.accountNumber)}>
            <option value="">{t('finance', 'selectAccountPlaceholder')}</option>
            {accounts.map((account) => <option key={account.id} value={account.accountNumber}>{account.title} · {account.accountNumber}</option>)}
          </select><FieldError message={errors.accountNumber} />
        </div>
        <div className="space-y-2"><Label htmlFor="tx-category">{t('finance', 'category')} *</Label>
          <select id="tx-category" value={form.category} disabled={readOnlyIdentity} onChange={(event) => {
            const category = event.target.value as TransactionCategory | '';
            setForm({
              category,
              // Quitter AUTRES → la sous-catégorie n'a plus de sens : vidée, jamais envoyée au backend (mandat « COMPORTEMENT FRONTEND »).
              subcategory: category === 'AUTRES' ? form.subcategory : '',
              type: category ? DEFAULT_DIRECTION[category] : form.type,
            });
          }} className={selectClass} aria-invalid={Boolean(errors.category)}>
            <option value="">{t('finance', 'selectCategory')}</option>
            {TRANSACTION_CATEGORIES.map((c) => <option key={c} value={c}>{t('finance', categoryLabelKey(c))}</option>)}
          </select><FieldError message={errors.category} />
        </div>
        {form.category === 'AUTRES' && <div className="space-y-2"><Label htmlFor="tx-subcategory">{t('finance', 'subcategory')} *</Label>
          <select id="tx-subcategory" value={form.subcategory} disabled={readOnlyIdentity} onChange={(event) => setForm({ subcategory: event.target.value as TransactionSubcategory | '' })} className={selectClass} aria-invalid={Boolean(errors.subcategory)}>
            <option value="">{t('finance', 'selectSubcategory')}</option>
            {subcategoriesFor('AUTRES').map((s) => <option key={s} value={s}>{t('finance', subcategoryLabelKey(s))}</option>)}
          </select><FieldError message={errors.subcategory} />
        </div>}
        <MeetingField t={t} value={form.meetingId} onChange={(meetingId) => setForm({ meetingId })} options={meetingOptions} hasCalendar={hasMeetingCalendar} />
        {/**
          * Date transaction = horodatage d'audit `recordedAt`, généré CÔTÉ SERVEUR
          * au moment du INSERT (`financeService.createTransaction`). Jamais saisi
          * ni modifiable ici : champ système en lecture seule. La date métier
          * saisissable est celle de la réunion (`meetingId` ci-dessus).
          */}
        <div className="space-y-2"><Label htmlFor="tx-transaction-at">{t('finance', 'transactionDateField')}</Label><Input id="tx-transaction-at" value={t('finance', 'transactionDateAuto')} readOnly disabled aria-describedby="tx-transaction-at-hint" /><p id="tx-transaction-at-hint" className="text-[11px] text-muted-foreground">{t('finance', 'transactionDateAutoHint')}</p></div>
        <div className="space-y-2"><Label htmlFor="tx-member">{t('finance', 'adherent')}{isLoan || isRepayment ? ' *' : ''}</Label>
          <select id="tx-member" value={form.memberId} disabled={readOnlyIdentity} onChange={(event) => setForm({ memberId: event.target.value })} className={selectClass} aria-invalid={Boolean(errors.member)}>
            <option value="">{t('finance', 'selectMember')}</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
          </select><FieldError message={errors.member} />
        </div>
        {/* REMBOURSEMENT : sens (toujours un crédit pour la caisse) et montant versé sont gérés dans le bloc dédié ci-dessous — pas de saisie générique ici. */}
        {!isRepayment && <div className="space-y-2"><Label htmlFor="tx-type">{t('finance', 'type')} *</Label>
          <select id="tx-type" value={form.type} onChange={(event) => setForm({ type: event.target.value as TransactionType })} className={selectClass}>
            <option value="credit">{t('finance', 'credit')}</option>
            <option value="debit">{t('finance', 'debit')}</option>
          </select>
        </div>}
        {!isRepayment && <div className="space-y-2"><Label htmlFor="tx-amount">{t('finance', 'amount')} *</Label><Input id="tx-amount" type="number" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ amount: event.target.value })} aria-invalid={Boolean(errors.amount)} /><FieldError message={errors.amount} /></div>}
        {isDistribution && <div className="space-y-2"><Label htmlFor="tx-distribution">{t('finance', 'distributionConcerned')}</Label>
          <select id="tx-distribution" value={form.distributionId} onChange={(event) => setForm({ distributionId: event.target.value })} className={selectClass}>
            <option value="">—</option>
            {distributions.map((distribution) => <option key={distribution.id} value={distribution.id}>{distribution.id} · {distribution.beneficiary}</option>)}
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
          <div className="space-y-2"><Label htmlFor="tx-amount-to-repay">{t('finance', 'amountToRepay')}</Label><Input id="tx-amount-to-repay" value={formatCurrency(memberDebt.outstanding, currency)} readOnly disabled /><p className="text-[11px] text-muted-foreground">{t('finance', 'loanConcerned')}: {memberDebt.id}</p></div>
          <div className="space-y-2"><Label htmlFor="tx-amount-paid">{t('finance', 'amountPaid')} *</Label><Input id="tx-amount-paid" type="number" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ amount: event.target.value })} aria-invalid={Boolean(errors.amount)} /><FieldError message={errors.amount} /></div>
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

    {isLoan && !form.accountNumber && <p className="text-sm text-muted-foreground">{t('finance', 'selectAccountForLoanPolicy')}</p>}
    {isLoan && form.accountNumber && !rule && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{t('finance', 'noLoanPolicyForAccount')}</div>}

    {isLoan && rule && <FormSection title={t('finance', 'loanConditions')}>
      <p className="mb-4 text-xs text-muted-foreground">{t('finance', 'loanConditionsFromPolicy', { name: rule.name })}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="tx-loan-rate">{t('finance', 'interestRate')}</Label><Input id="tx-loan-rate" type="number" inputMode="decimal" value={form.interestRate} onChange={(event) => setForm({ interestRate: event.target.value })} /><p className="text-[11px] text-muted-foreground">{t('finance', 'interestType' + rule.interestType)} · {t('finance', 'interestPeriod' + rule.interestPeriod)}</p></div>
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
          <div className="space-y-1"><Label htmlFor={`tx-guarantor-amount-${index}`}>{t('finance', 'guaranteedAmount')}</Label><Input id={`tx-guarantor-amount-${index}`} type="number" inputMode="decimal" value={row.amount} onChange={(event) => setGuarantor(index, { amount: event.target.value })} /></div>
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
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('finance', 'approvalRequiredLevel', { level: t('finance', 'approvalLevel' + (rule.approvalLevel ?? 'ADMIN')) })}</p>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.approved} onCheckedChange={(checked) => setForm({ approved: checked === true })} aria-invalid={Boolean(errors.approval)} />{t('finance', 'loanApprovedCheckbox')}</label>
        <div className="space-y-1"><Label htmlFor="tx-approved-by">{t('finance', 'approvedBy')}</Label><Input id="tx-approved-by" value={form.approvedBy} onChange={(event) => setForm({ approvedBy: event.target.value })} /></div>
        <FieldError message={errors.approval} />
      </div>
    </FormSection>}
  </>;
}

function validateTransactionForm(form: TransactionFormState, rule: LoanRule | undefined, mode: 'create' | 'edit', t: T, activeLoanCount = 0, currency?: string): TransactionFormErrors {
  const errors: TransactionFormErrors = {};
  if (!form.accountNumber) errors.accountNumber = t('finance', 'fieldRequired');
  if (!form.category) errors.category = t('finance', 'fieldRequired');
  // Sous-catégorie obligatoire ssi AUTRES (mandat « COMPORTEMENT FRONTEND »).
  if (form.category === 'AUTRES' && !form.subcategory) errors.subcategory = t('finance', 'fieldRequired');
  const amount = Number(form.amount);
  if (!form.amount || amount <= 0) errors.amount = t('finance', 'invalidAmount');

  if (mode === 'create' && form.category === 'REMBOURSEMENT') {
    // Mandat « REMBOURSEMENT » : l'adhérent est obligatoire, la dette est résolue automatiquement,
    // et « Montant versé » ne peut pas dépasser « Montant à rembourser ». Sans dette active → blocage.
    if (!form.memberId) { errors.member = t('finance', 'fieldRequired'); return errors; }
    const due = Number(form.debtOutstanding);
    if (!form.loanId || !(due > 0)) { errors.repayment = t('finance', 'noActiveDebt'); return errors; }
    if (!errors.amount && amount > due) errors.amount = t('finance', 'amountPaidExceedsDebt');
  }

  if (form.category === 'PRET') {
    if (!form.memberId) errors.member = t('finance', 'fieldRequired');
    if (!rule) { errors.category = t('finance', 'noLoanPolicyForAccount'); return errors; }
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
    if (rule.requiresApproval && !form.approved) errors.approval = t('finance', 'approvalRequired');
  }
  return errors;
}

function buildTransactionInput(form: TransactionFormState, rule: LoanRule | undefined, meetingDateById: Map<string, string>, memberNameById: Map<string, string>, fiscalYearId: string | undefined, t: T, currency?: string): TransactionInput {
  return {
    accountNumber: form.accountNumber,
    memberId: form.memberId || undefined,
    memberName: form.memberId ? memberNameById.get(form.memberId) : undefined,
    category: form.category as TransactionCategory,
    // Sous-catégorie transmise UNIQUEMENT pour AUTRES (mandat « COMPORTEMENT FRONTEND »).
    subcategory: form.category === 'AUTRES' ? (form.subcategory || undefined) : null,
    type: form.type,
    amount: Number(form.amount),
    description: composeTransactionDescription(form, rule, t, currency),
    // `meetingId` = réunion de l'exercice fiscal courant (jamais une date libre) ;
    // `fiscalYearId` porte l'isolation §12 vérifiée par `createTransaction`.
    meetingId: form.meetingId || undefined,
    meetingDate: form.meetingId ? meetingDateById.get(form.meetingId) : undefined,
    fiscalYearId: form.meetingId ? fiscalYearId : undefined,
  };
}

/**
 * Point d'entrée « + Nouvelle transaction » depuis la fiche caisse (mandat
 * « Le Compte comme point d'entrée des Transactions », 2026-09-23) : `id` de
 * l'`Account` transmis en query param (`?accountId=`), jamais son
 * `accountNumber` (identifiant interne du journal, pas une clé d'URL stable).
 * Dès que `accounts` est chargé, on résout et on préremplit `accountNumber`
 * dans le formulaire — le champ Compte reste alors verrouillé
 * (`accountLocked`), sans dupliquer aucune règle de validation : la même
 * `TransactionFormBody`/`validateTransactionForm`/`buildTransactionInput` que
 * la création « libre » depuis `/finance/transactions/create`.
 */
function TransactionCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const currency = useOrganizationCurrency();
  const [searchParams] = useSearchParams();
  const presetAccountId = searchParams.get('accountId') ?? '';
  const [form, setFormState] = useState<TransactionFormState>(emptyTransactionForm);
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const setForm = (patch: Partial<TransactionFormState>) => setFormState((current) => ({ ...current, ...patch }));
  const { data: accounts = [] } = useQuery({ queryKey: queryKeys.finance.accounts(currentTenant.id), queryFn: () => financeService.listAccounts(currentTenant.id) });
  const presetAccount = presetAccountId ? accounts.find((account) => account.id === presetAccountId) : undefined;
  const accountLocked = Boolean(presetAccountId);
  useEffect(() => {
    if (presetAccount && form.accountNumber !== presetAccount.accountNumber) setForm({ accountNumber: presetAccount.accountNumber });
  }, [presetAccount?.accountNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancelTarget = presetAccountId ? `/finance/accounts/${presetAccountId}` : '/finance/transactions';
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { dateById: meetingDateById, nearestId: nearestMeetingId, fiscalYearId } = useFiscalMeetings();
  const { data: loanRules = [] } = useQuery({ queryKey: queryKeys.credit.loanRules(currentTenant.id), queryFn: () => loanRuleService.listLoanRules(currentTenant.id), enabled: form.category === 'PRET' });
  const rule = form.category === 'PRET' ? applicableLoanRule(loanRules, accounts, form.accountNumber) : undefined;
  /** Même source que le bandeau d'avertissement de `TransactionFormBody` — nécessaire ici aussi pour que `validateTransactionForm` bloque réellement (mandat §10 « maxActiveLoans »), pas seulement pour l'affichage. */
  const { data: borrowerLoans = [] } = useQuery({ queryKey: queryKeys.credit.loansByMember(form.memberId), queryFn: () => creditService.listLoansByMember(form.memberId), enabled: form.category === 'PRET' && Boolean(form.memberId) });
  const activeLoanCount = borrowerLoans.filter((loan) => loan.status === 'active').length;
  /**
   * §6 — dès que le calendrier de l'exercice est chargé, présélectionne la
   * réunion la plus proche de ce jour (`distance = |meeting_date − today|`
   * minimale). L'utilisateur reste libre d'en choisir une autre ou « Aucune
   * réunion ». `touchedMeeting` empêche d'écraser un choix manuel ultérieur.
   */
  useEffect(() => {
    if (!form.meetingId && nearestMeetingId) setForm({ meetingId: nearestMeetingId });
  }, [nearestMeetingId]); // eslint-disable-line react-hooks/exhaustive-deps
  const mutation = useMockMutation<Awaited<ReturnType<typeof financeService.createTransaction>>, TransactionInput>({
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
      if (form.category === 'PRET') {
        const account = accounts.find((item) => item.accountNumber === input.accountNumber);
        if (!account) return undefined;
        const validGuarantors = guarantorRowsFor(form, rule)
          .filter((row) => row.name.trim() && Number(row.amount) > 0)
          .map((row) => ({ guarantorName: row.name.trim(), guaranteedAmount: Number(row.amount) || 0, relation: row.relation.trim() }));
        const result = await creditService.createLoanTransaction(currentTenant.id, {
          accountId: account.id,
          memberId: form.memberId,
          principal: input.amount,
          guarantors: validGuarantors,
          approved: form.approved,
          approvedBy: form.approvedBy || undefined,
          transactionInput: input,
        });
        return result?.transaction;
      }
      if (form.category === 'REMBOURSEMENT' && form.loanId) {
        const paymentDate = (form.meetingId && meetingDateById.get(form.meetingId)) || new Date().toISOString().slice(0, 10);
        const result = await creditService.createRepaymentTransaction(currentTenant.id, { loanId: form.loanId, paymentDate, principalPart: input.amount, interestPart: 0, transactionInput: input });
        return result?.transaction;
      }
      return financeService.createTransaction(currentTenant.id, input);
    },
    // `['finance', 'accounts']` (préfixe large) invalide la liste ET la fiche caisse : le solde et le dernier mouvement sont dérivés du journal, ils doivent se recalculer dès qu'une transaction est créée.
    invalidateKeys: [['finance', 'transactions'], ['finance', 'accounts'], ['credit', 'loans'], ['credit', 'applications'], ['credit', 'guarantors']],
    onSuccess: (transaction) => {
      if (!transaction) { notify.error(t('finance', 'transactionActionFailed')); return; }
      notify.success(t('finance', 'transactionCreated'));
      // Créée depuis une fiche caisse → retour sur cette fiche (solde/journal à jour, invalidation ci-dessus) ; sinon comportement inchangé (fiche transaction).
      navigate(presetAccountId ? `/finance/accounts/${presetAccountId}` : `/finance/transactions/${transaction.id}`);
    },
  });
  const handleSave = () => {
    const nextErrors = validateTransactionForm(form, rule, 'create', t, activeLoanCount, currency);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const memberNameById = new Map(members.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));
    mutation.mutate(buildTransactionInput(form, rule, meetingDateById, memberNameById, fiscalYearId, t, currency));
  };
  return <Page title={t('finance', 'newTransaction')} description={t('finance', 'transactionsDescription')} actions={<Back label={t('finance', presetAccountId ? 'backToAccount' : 'backToTransactions')} />}>
    <div className="max-w-5xl space-y-5">
      <TransactionFormBody t={t} form={form} setForm={setForm} errors={errors} mode="create" accountLocked={accountLocked} />
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(cancelTarget)}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div>
    </div>
  </Page>;
}

function TransactionEdit({ t }: { t: T }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const currency = useOrganizationCurrency();
  const { data: transaction, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.finance.transaction(id), currentTenant.id], queryFn: () => financeService.getTransaction(currentTenant.id, id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { dateById: meetingDateById, fiscalYearId } = useFiscalMeetings();
  const [form, setFormState] = useState<TransactionFormState | null>(null);
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const mutation = useMockMutation<Awaited<ReturnType<typeof financeService.updateTransaction>>, TransactionInput>({
    mutationFn: (input) => financeService.updateTransaction(currentTenant.id, id, { category: input.category, subcategory: input.subcategory ?? undefined, type: input.type, amount: input.amount, description: input.description, meetingId: input.meetingId ?? '', meetingDate: input.meetingDate ?? '' }),
    // Modifier montant/type/statut d'une transaction change le solde dérivé des caisses concernées.
    invalidateKeys: [['finance', 'transactions'], ['finance', 'accounts']],
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
    accountNumber: transaction.fromAccount, meetingId: transaction.meetingId ?? '',
    memberId: transaction.memberId ?? '', category: transaction.category, subcategory: transaction.subcategory ?? '', type: transaction.type,
    amount: String(transaction.amount), description: transaction.description,
  };
  const setForm = (patch: Partial<TransactionFormState>) => setFormState({ ...current, ...patch });
  const handleSave = () => {
    const nextErrors = validateTransactionForm(current, undefined, 'edit', t, 0, currency);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const memberNameById = new Map(members.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));
    mutation.mutate(buildTransactionInput(current, undefined, meetingDateById, memberNameById, fiscalYearId, t, currency));
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
  const { data: transaction, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.finance.transaction(id), currentTenant.id], queryFn: () => financeService.getTransaction(currentTenant.id, id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const cancelMutation = useMockMutation<Awaited<ReturnType<typeof financeService.cancelTransaction>>, void>({
    mutationFn: () => financeService.cancelTransaction(currentTenant.id, id),
    // Annuler une transaction la retire du solde dérivé (liste + fiche caisse).
    invalidateKeys: [['finance', 'transactions'], ['finance', 'accounts']],
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
        <Info label={t('finance', 'meetingDateColumn')} value={transaction.meetingDate ? <DateDisplay value={transaction.meetingDate} /> : '—'} icon={CalendarClock} />
        <Info label={t('finance', 'transactionDateColumn')} value={<DateDisplay value={transaction.recordedAt ?? transaction.date} withTime={Boolean(transaction.recordedAt)} />} icon={Clock3} />
        <Info label={t('finance', 'fromAccount')} value={transaction.fromAccount} icon={Landmark} />
        <Info label={t('finance', 'toAccount')} value={transaction.toAccount} icon={Landmark} />
        <div className="sm:col-span-2"><Info label={t('finance', 'comment')} value={transaction.description || '—'} icon={FileText} /></div>
      </CardContent></Card>
    </div>
  </Page>;
}

type LoanRuleFormState = {
  accountId: string; name: string; allowLoans: boolean; loanMode: LoanRuleLoanMode; minAmount: string; maxAmount: string; interestRate: string; interestType: LoanRuleInterestType; interestPeriod: LoanRuleInterestPeriod; durationMonths: string; maxActiveLoans: string; maxLoanExposure: string; requiresGuarantor: boolean; minGuarantors: string; maxGuarantors: string; guaranteeTypeRequired: LoanRuleGuaranteeType; guaranteeRatio: string; allowSelfGuarantee: boolean; requiresApproval: boolean; approvalLevel: LoanRuleApprovalLevel;
};

const defaultLoanRuleForm: LoanRuleFormState = { accountId: '', name: '', allowLoans: true, loanMode: 'INTERNAL', minAmount: '0', maxAmount: '', interestRate: '0', interestType: 'FIXED', interestPeriod: 'MONTHLY', durationMonths: '12', maxActiveLoans: '1', maxLoanExposure: '', requiresGuarantor: false, minGuarantors: '0', maxGuarantors: '1', guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: '100', allowSelfGuarantee: false, requiresApproval: true, approvalLevel: 'ADMIN' };

function loanRuleFormToInput(form: LoanRuleFormState): LoanRuleInput {
  return {
    accountId: form.accountId, name: form.name.trim(), allowLoans: form.allowLoans, loanMode: form.loanMode,
    minAmount: Number(form.minAmount) || 0, maxAmount: Number(form.maxAmount) || 0, interestRate: Number(form.interestRate) || 0,
    interestType: form.interestType, interestPeriod: form.interestPeriod, durationMonths: Number(form.durationMonths) || 0,
    maxActiveLoans: Number(form.maxActiveLoans) || 1, maxLoanExposure: form.maxLoanExposure === '' ? null : Number(form.maxLoanExposure),
    requiresGuarantor: form.requiresGuarantor, minGuarantors: Number(form.minGuarantors) || 0, maxGuarantors: Number(form.maxGuarantors) || 0,
    guaranteeTypeRequired: form.guaranteeTypeRequired, guaranteeRatio: Number(form.guaranteeRatio) || 0, allowSelfGuarantee: form.allowSelfGuarantee,
    requiresApproval: form.requiresApproval, approvalLevel: form.requiresApproval ? form.approvalLevel : null,
  };
}

/** accountId n'est jamais transmis à UPDATE (§9 du mandat : immuable après création). */
function loanRuleFormToUpdateInput(form: LoanRuleFormState): LoanRuleUpdateInput {
  const input: Partial<LoanRuleInput> = loanRuleFormToInput(form);
  delete input.accountId;
  return input;
}

function loanRuleStatusTone(status: LoanRule['status']): 'success' | 'default' { return status === 'ACTIVE' ? 'success' : 'default'; }
function loanRuleStatusKey(status: LoanRule['status']): string { return status === 'ACTIVE' ? 'active' : 'inactive'; }

function LoanRuleFormBody({ t, form, setForm, accounts, accountEditable, errors }: { t: T; form: LoanRuleFormState; setForm: (updater: LoanRuleFormState | ((prev: LoanRuleFormState) => LoanRuleFormState)) => void; accounts: Account[]; accountEditable: boolean; errors: { name?: string; accountId?: string; maxAmount?: string } }) {
  const set = <K extends keyof LoanRuleFormState>(key: K, value: LoanRuleFormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  return <>
    <FormSection title={t('finance', 'general')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="loan-rule-name">{t('finance', 'loanRuleName')}</Label><Input id="loan-rule-name" value={form.name} onChange={(event) => set('name', event.target.value)} aria-invalid={Boolean(errors.name)} /><FieldError message={errors.name} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-account">{t('finance', 'account')}</Label>{accountEditable ? <select id="loan-rule-account" value={form.accountId} onChange={(event) => set('accountId', event.target.value)} aria-invalid={Boolean(errors.accountId)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">{t('finance', 'selectAccount')}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.accountNumber}</option>)}</select> : <Input value={accounts.find((account) => account.id === form.accountId)?.accountNumber ?? form.accountId} disabled />}<FieldError message={errors.accountId} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-loan-mode">{t('finance', 'loanMode')}</Label><select id="loan-rule-loan-mode" value={form.loanMode} onChange={(event) => set('loanMode', event.target.value as LoanRuleLoanMode)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="NONE">{t('finance', 'loanModeNONE')}</option><option value="INTERNAL">{t('finance', 'loanModeINTERNAL')}</option><option value="EXTERNAL">{t('finance', 'loanModeEXTERNAL')}</option><option value="BOTH">{t('finance', 'loanModeBOTH')}</option></select></div>
        <div className="flex items-center gap-2 pt-6"><Switch id="loan-rule-allow-loans" checked={form.allowLoans} onCheckedChange={(checked: boolean) => set('allowLoans', checked)} /><Label htmlFor="loan-rule-allow-loans">{t('finance', 'allowLoans')}</Label></div>
      </div>
    </FormSection>
    <FormSection title={t('finance', 'loanTerms')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="loan-rule-min-amount">{t('finance', 'minAmount')}</Label><Input id="loan-rule-min-amount" type="number" inputMode="decimal" value={form.minAmount} onChange={(event) => set('minAmount', event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-max-amount">{t('finance', 'maxAmount')}</Label><Input id="loan-rule-max-amount" type="number" inputMode="decimal" value={form.maxAmount} onChange={(event) => set('maxAmount', event.target.value)} aria-invalid={Boolean(errors.maxAmount)} /><FieldError message={errors.maxAmount} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-interest-rate">{t('finance', 'interestRate')}</Label><Input id="loan-rule-interest-rate" type="number" inputMode="decimal" value={form.interestRate} onChange={(event) => set('interestRate', event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-duration">{t('finance', 'durationMonths')}</Label><Input id="loan-rule-duration" type="number" inputMode="numeric" value={form.durationMonths} onChange={(event) => set('durationMonths', event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-interest-type">{t('finance', 'interestType')}</Label><select id="loan-rule-interest-type" value={form.interestType} onChange={(event) => set('interestType', event.target.value as LoanRuleInterestType)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="FIXED">{t('finance', 'interestTypeFIXED')}</option><option value="REDUCING">{t('finance', 'interestTypeREDUCING')}</option><option value="FLAT">{t('finance', 'interestTypeFLAT')}</option></select></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-interest-period">{t('finance', 'interestPeriod')}</Label><select id="loan-rule-interest-period" value={form.interestPeriod} onChange={(event) => set('interestPeriod', event.target.value as LoanRuleInterestPeriod)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="DAILY">{t('finance', 'interestPeriodDAILY')}</option><option value="WEEKLY">{t('finance', 'interestPeriodWEEKLY')}</option><option value="MONTHLY">{t('finance', 'interestPeriodMONTHLY')}</option><option value="YEARLY">{t('finance', 'interestPeriodYEARLY')}</option></select></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-max-active-loans">{t('finance', 'maxActiveLoans')}</Label><Input id="loan-rule-max-active-loans" type="number" inputMode="numeric" value={form.maxActiveLoans} onChange={(event) => set('maxActiveLoans', event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-max-exposure">{t('finance', 'maxLoanExposure')}</Label><Input id="loan-rule-max-exposure" type="number" inputMode="decimal" value={form.maxLoanExposure} onChange={(event) => set('maxLoanExposure', event.target.value)} /></div>
      </div>
    </FormSection>
    <FormSection title={t('finance', 'guarantees')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-2"><Switch id="loan-rule-requires-guarantor" checked={form.requiresGuarantor} onCheckedChange={(checked: boolean) => set('requiresGuarantor', checked)} /><Label htmlFor="loan-rule-requires-guarantor">{t('finance', 'requiresGuarantor')}</Label></div>
        <div className="flex items-center gap-2"><Switch id="loan-rule-allow-self-guarantee" checked={form.allowSelfGuarantee} onCheckedChange={(checked: boolean) => set('allowSelfGuarantee', checked)} /><Label htmlFor="loan-rule-allow-self-guarantee">{t('finance', 'allowSelfGuarantee')}</Label></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-min-guarantors">{t('finance', 'minGuarantors')}</Label><Input id="loan-rule-min-guarantors" type="number" inputMode="numeric" value={form.minGuarantors} onChange={(event) => set('minGuarantors', event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-max-guarantors">{t('finance', 'maxGuarantors')}</Label><Input id="loan-rule-max-guarantors" type="number" inputMode="numeric" value={form.maxGuarantors} onChange={(event) => set('maxGuarantors', event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-guarantee-type">{t('finance', 'guaranteeTypeRequired')}</Label><select id="loan-rule-guarantee-type" value={form.guaranteeTypeRequired} onChange={(event) => set('guaranteeTypeRequired', event.target.value as LoanRuleGuaranteeType)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="PERSONAL">{t('finance', 'guaranteeTypePERSONAL')}</option><option value="GROUP">{t('finance', 'guaranteeTypeGROUP')}</option><option value="COLLATERAL">{t('finance', 'guaranteeTypeCOLLATERAL')}</option></select></div>
        <div className="space-y-2"><Label htmlFor="loan-rule-guarantee-ratio">{t('finance', 'guaranteeRatio')}</Label><Input id="loan-rule-guarantee-ratio" type="number" inputMode="decimal" value={form.guaranteeRatio} onChange={(event) => set('guaranteeRatio', event.target.value)} /></div>
      </div>
    </FormSection>
    <FormSection title={t('finance', 'approval')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-2"><Switch id="loan-rule-requires-approval" checked={form.requiresApproval} onCheckedChange={(checked: boolean) => set('requiresApproval', checked)} /><Label htmlFor="loan-rule-requires-approval">{t('finance', 'requiresApproval')}</Label></div>
        {form.requiresApproval && <div className="space-y-2"><Label htmlFor="loan-rule-approval-level">{t('finance', 'approvalLevel')}</Label><select id="loan-rule-approval-level" value={form.approvalLevel} onChange={(event) => set('approvalLevel', event.target.value as LoanRuleApprovalLevel)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="MEMBER">{t('finance', 'approvalLevelMEMBER')}</option><option value="BOARD">{t('finance', 'approvalLevelBOARD')}</option><option value="ADMIN">{t('finance', 'approvalLevelADMIN')}</option></select></div>}
      </div>
    </FormSection>
  </>;
}

function LoanRulesList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const [search, setSearch] = useState('');
  const { data: rules = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.credit.loanRules(currentTenant.id), queryFn: () => loanRuleService.listLoanRules(currentTenant.id) });
  const filtered = rules.filter((rule) => `${rule.name} ${rule.accountNumber}`.toLowerCase().includes(search.toLowerCase()));
  if (isLoading) return <Page title={t('finance', 'loanRulesTitle')} description={t('finance', 'loanRulesDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'loanRulesTitle')} description={t('finance', 'loanRulesDescription')}><ErrorState onRetry={refetch} /></Page>;
  const columns: TableColumn<LoanRule>[] = [
    { key: 'name', header: t('finance', 'loanRuleName'), render: (row) => <button type="button" onClick={() => navigate(`/finance/credit/loan-rules/${row.id}`)} className="text-left text-sm font-semibold text-primary">{row.name}</button> },
    { key: 'accountNumber', header: t('finance', 'account'), render: (row) => <span className="font-mono text-xs">{row.accountNumber}</span> },
    { key: 'maxAmount', header: t('finance', 'maxAmount'), render: (row) => <MoneyDisplay amount={row.maxAmount} /> },
    { key: 'interestRate', header: t('finance', 'interestRate'), render: (row) => `${row.interestRate}%` },
    { key: 'durationMonths', header: t('finance', 'durationMonths'), render: (row) => row.durationMonths },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', loanRuleStatusKey(row.status))} tone={loanRuleStatusTone(row.status)} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/finance/credit/loan-rules/${row.id}`)} aria-label={t('finance', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <Page title={t('finance', 'loanRulesTitle')} description={t('finance', 'loanRulesDescription')} actions={<Button onClick={() => navigate('/finance/credit/loan-rules/create')}><Plus size={16} />{t('finance', 'createLoanRule')}</Button>}><FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} /><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={ListChecks} title={t('finance', 'noLoanRules')} />} /></Page>;
}

function LoanRuleCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: accounts = [] } = useQuery({ queryKey: queryKeys.finance.accounts(currentTenant.id), queryFn: () => financeService.listAccounts(currentTenant.id) });
  const [form, setForm] = useState<LoanRuleFormState>(defaultLoanRuleForm);
  const [errors, setErrors] = useState<{ name?: string; accountId?: string; maxAmount?: string }>({});
  const mutation = useMockMutation<Awaited<ReturnType<typeof loanRuleService.createLoanRule>>, LoanRuleInput>({
    mutationFn: (input) => loanRuleService.createLoanRule(currentTenant.id, input),
    invalidateKeys: [queryKeys.credit.loanRules(currentTenant.id)],
    onSuccess: (rule) => { if (!rule) { notify.error(t('finance', 'loanRuleRejected')); return; } notify.success(t('finance', 'loanRuleCreated')); navigate(`/finance/credit/loan-rules/${rule.id}`); },
  });
  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!form.name.trim()) nextErrors.name = t('finance', 'fieldRequired');
    if (!form.accountId) nextErrors.accountId = t('finance', 'fieldRequired');
    if (!form.maxAmount || Number(form.maxAmount) < (Number(form.minAmount) || 0)) nextErrors.maxAmount = t('finance', 'fieldRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate(loanRuleFormToInput(form));
  };
  return <Page title={t('finance', 'createLoanRule')} description={t('finance', 'loanRulesDescription')} actions={<Back label={t('finance', 'backToLoanRules')} />}><div className="grid gap-5 lg:grid-cols-2">
    <LoanRuleFormBody t={t} form={form} setForm={setForm} accounts={accounts} accountEditable errors={errors} />
    <div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/finance/credit/loan-rules')}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div>
  </div></Page>;
}

function LoanRuleDetail({ t }: { t: T }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const currency = useOrganizationCurrency();
  const [confirmAction, setConfirmAction] = useState<'activate' | 'deactivate' | 'delete' | null>(null);
  const { data: rule, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.credit.loanRule(id), currentTenant.id], queryFn: () => loanRuleService.getLoanRule(currentTenant.id, id) });
  const invalidateKeys = [queryKeys.credit.loanRule(id), queryKeys.credit.loanRules(currentTenant.id)];
  const activateMutation = useMockMutation<Awaited<ReturnType<typeof loanRuleService.activateLoanRule>>, void>({ mutationFn: () => loanRuleService.activateLoanRule(currentTenant.id, id), invalidateKeys, onSuccess: () => { notify.success(t('finance', 'loanRuleActivated')); setConfirmAction(null); } });
  const deactivateMutation = useMockMutation<Awaited<ReturnType<typeof loanRuleService.deactivateLoanRule>>, void>({ mutationFn: () => loanRuleService.deactivateLoanRule(currentTenant.id, id), invalidateKeys, onSuccess: () => { notify.success(t('finance', 'loanRuleDeactivated')); setConfirmAction(null); } });
  const deleteMutation = useMockMutation<Awaited<ReturnType<typeof loanRuleService.deleteLoanRule>>, void>({ mutationFn: () => loanRuleService.deleteLoanRule(currentTenant.id, id), invalidateKeys, onSuccess: () => { notify.success(t('finance', 'loanRuleDeleted')); navigate('/finance/credit/loan-rules'); } });
  if (isLoading) return <Page title={t('finance', 'loanRuleDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'loanRuleDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!rule) return <NotFoundPage />;
  const isActive = rule.status === 'ACTIVE';
  return <Page title={rule.name} description={rule.accountNumber} actions={<>
    <Back label={t('finance', 'backToLoanRules')} />
    <Button variant="outline" onClick={() => navigate(`/finance/credit/loan-rules/${rule.id}/edit`)}>{t('finance', 'edit')}</Button>
    {isActive ? <Button variant="outline" onClick={() => setConfirmAction('deactivate')}><Ban size={15} />{t('finance', 'deactivateLoanRule')}</Button> : <Button variant="outline" onClick={() => setConfirmAction('activate')}><Check size={15} />{t('finance', 'activateLoanRule')}</Button>}
    <Button variant="outline" className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300" onClick={() => setConfirmAction('delete')}><Trash2 size={15} />{t('finance', 'deleteLoanRule')}</Button>
  </>}>
    {confirmAction === 'activate' && <ConfirmDialog open title={t('finance', 'activateLoanRule')} description={t('finance', 'activateLoanRuleConfirm')} confirmLabel={t('finance', 'confirm')} cancelLabel={t('finance', 'cancel')} onConfirm={() => activateMutation.mutate()} onCancel={() => setConfirmAction(null)} />}
    {confirmAction === 'deactivate' && <ConfirmDialog open title={t('finance', 'deactivateLoanRule')} description={t('finance', 'deactivateLoanRuleConfirm')} confirmLabel={t('finance', 'confirm')} cancelLabel={t('finance', 'cancel')} onConfirm={() => deactivateMutation.mutate()} onCancel={() => setConfirmAction(null)} />}
    {confirmAction === 'delete' && <ConfirmDialog open title={t('finance', 'deleteLoanRule')} description={t('finance', 'deleteLoanRuleConfirm')} confirmLabel={t('finance', 'confirm')} cancelLabel={t('finance', 'cancel')} onConfirm={() => deleteMutation.mutate()} onCancel={() => setConfirmAction(null)} />}
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'general')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
        <Info label={t('finance', 'account')} value={rule.accountNumber} icon={Landmark} />
        <Info label={t('finance', 'status')} value={<StatusBadge label={t('finance', loanRuleStatusKey(rule.status))} tone={loanRuleStatusTone(rule.status)} />} icon={ShieldCheck} />
        <Info label={t('finance', 'allowLoans')} value={rule.allowLoans ? t('finance', 'yes') : t('finance', 'no')} icon={CreditCard} />
        <Info label={t('finance', 'loanMode')} value={t('finance', `loanMode${rule.loanMode}`)} icon={SlidersHorizontal} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'loanTerms')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
        <Info label={t('finance', 'minAmount')} value={formatCurrency(rule.minAmount, currency)} icon={Banknote} />
        <Info label={t('finance', 'maxAmount')} value={formatCurrency(rule.maxAmount, currency)} icon={Banknote} />
        <Info label={t('finance', 'interestRate')} value={`${rule.interestRate}%`} icon={TrendingUp} />
        <Info label={t('finance', 'interestType')} value={t('finance', `interestType${rule.interestType}`)} icon={TrendingUp} />
        <Info label={t('finance', 'interestPeriod')} value={t('finance', `interestPeriod${rule.interestPeriod}`)} icon={CalendarClock} />
        <Info label={t('finance', 'durationMonths')} value={String(rule.durationMonths)} icon={CalendarClock} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'exposure')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
        <Info label={t('finance', 'maxActiveLoans')} value={String(rule.maxActiveLoans)} icon={HandCoins} />
        <Info label={t('finance', 'maxLoanExposure')} value={rule.maxLoanExposure !== null ? formatCurrency(rule.maxLoanExposure, currency) : '—'} icon={HandCoins} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'guarantees')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
        <Info label={t('finance', 'requiresGuarantor')} value={rule.requiresGuarantor ? t('finance', 'yes') : t('finance', 'no')} icon={ShieldCheck} />
        <Info label={t('finance', 'minGuarantors')} value={String(rule.minGuarantors)} icon={UserCheck} />
        <Info label={t('finance', 'maxGuarantors')} value={String(rule.maxGuarantors)} icon={UserCheck} />
        <Info label={t('finance', 'guaranteeTypeRequired')} value={t('finance', `guaranteeType${rule.guaranteeTypeRequired}`)} icon={ShieldCheck} />
        <Info label={t('finance', 'guaranteeRatio')} value={`${rule.guaranteeRatio}%`} icon={ShieldCheck} />
        <Info label={t('finance', 'allowSelfGuarantee')} value={rule.allowSelfGuarantee ? t('finance', 'yes') : t('finance', 'no')} icon={ShieldCheck} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'approval')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
        <Info label={t('finance', 'requiresApproval')} value={rule.requiresApproval ? t('finance', 'yes') : t('finance', 'no')} icon={Check} />
        <Info label={t('finance', 'approvalLevel')} value={rule.approvalLevel ? t('finance', `approvalLevel${rule.approvalLevel}`) : '—'} icon={Check} />
      </CardContent></Card>
    </div>
  </Page>;
}

function LoanRuleEdit({ t }: { t: T }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: rule, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.credit.loanRule(id), currentTenant.id], queryFn: () => loanRuleService.getLoanRule(currentTenant.id, id) });
  const { data: accounts = [] } = useQuery({ queryKey: queryKeys.finance.accounts(currentTenant.id), queryFn: () => financeService.listAccounts(currentTenant.id) });
  const [form, setForm] = useState<LoanRuleFormState | null>(null);
  const [errors, setErrors] = useState<{ name?: string; maxAmount?: string }>({});
  const mutation = useMockMutation<Awaited<ReturnType<typeof loanRuleService.updateLoanRule>>, LoanRuleUpdateInput>({
    mutationFn: (patch) => loanRuleService.updateLoanRule(currentTenant.id, id, patch),
    invalidateKeys: [queryKeys.credit.loanRule(id), queryKeys.credit.loanRules(currentTenant.id)],
    onSuccess: (updated) => { if (!updated) { notify.error(t('finance', 'loanRuleRejected')); return; } notify.success(t('finance', 'loanRuleUpdated')); navigate(`/finance/credit/loan-rules/${id}`); },
  });
  if (isLoading) return <Page title={t('finance', 'editLoanRule')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'editLoanRule')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!rule) return <NotFoundPage />;
  const current: LoanRuleFormState = form ?? { accountId: rule.accountId, name: rule.name, allowLoans: rule.allowLoans, loanMode: rule.loanMode, minAmount: String(rule.minAmount), maxAmount: String(rule.maxAmount), interestRate: String(rule.interestRate), interestType: rule.interestType, interestPeriod: rule.interestPeriod, durationMonths: String(rule.durationMonths), maxActiveLoans: String(rule.maxActiveLoans), maxLoanExposure: rule.maxLoanExposure === null ? '' : String(rule.maxLoanExposure), requiresGuarantor: rule.requiresGuarantor, minGuarantors: String(rule.minGuarantors), maxGuarantors: String(rule.maxGuarantors), guaranteeTypeRequired: rule.guaranteeTypeRequired, guaranteeRatio: String(rule.guaranteeRatio), allowSelfGuarantee: rule.allowSelfGuarantee, requiresApproval: rule.requiresApproval, approvalLevel: rule.approvalLevel ?? 'ADMIN' };
  const setCurrent = (updater: LoanRuleFormState | ((prev: LoanRuleFormState) => LoanRuleFormState)) => setForm(typeof updater === 'function' ? (updater as (prev: LoanRuleFormState) => LoanRuleFormState)(current) : updater);
  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!current.name.trim()) nextErrors.name = t('finance', 'fieldRequired');
    if (!current.maxAmount || Number(current.maxAmount) < (Number(current.minAmount) || 0)) nextErrors.maxAmount = t('finance', 'fieldRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate(loanRuleFormToUpdateInput(current));
  };
  return <Page title={t('finance', 'editLoanRule')} description={rule.name} actions={<Back label={t('finance', 'backToLoanRules')} />}><div className="grid gap-5 lg:grid-cols-2">
    <LoanRuleFormBody t={t} form={current} setForm={setCurrent} accounts={accounts} accountEditable={false} errors={errors} />
    <div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(`/finance/credit/loan-rules/${id}`)}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div>
  </div></Page>;
}

// ----------------------------------------------------------------------- Crédit : demandes, prêts (mandat « Finalisation Finance/Tontines »)

function ApplicationsList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const [search, setSearch] = useState('');
  const { data: applications = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.credit.applications(currentTenant.id), queryFn: () => creditService.listApplications(currentTenant.id) });
  const filtered = applications.filter((application) => `${application.applicant} ${application.id}`.toLowerCase().includes(search.toLowerCase()));
  const columns: TableColumn<Application>[] = [
    { key: 'id', header: t('finance', 'loanId'), render: (row) => <button type="button" onClick={() => navigate(`/finance/credit/applications/${row.id}`)} className="font-mono text-xs font-semibold text-primary">{row.id}</button> },
    { key: 'applicant', header: t('finance', 'applicant') },
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

type ApplicationFormState = { accountId: string; memberId: string; requestedAmount: string; purpose: string; guarantors: GuarantorRow[] };
const emptyApplicationForm: ApplicationFormState = { accountId: '', memberId: '', requestedAmount: '', purpose: '', guarantors: [] };

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
  const [errors, setErrors] = useState<{ accountId?: string; memberId?: string; amount?: string; guarantors?: string }>({});
  const setForm = (patch: Partial<ApplicationFormState>) => setFormState((current) => ({ ...current, ...patch }));
  const { data: accounts = [] } = useQuery({ queryKey: queryKeys.finance.accounts(currentTenant.id), queryFn: () => financeService.listAccounts(currentTenant.id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { data: loanRules = [] } = useQuery({ queryKey: queryKeys.credit.loanRules(currentTenant.id), queryFn: () => loanRuleService.listLoanRules(currentTenant.id) });
  const eligibleAccounts = accounts.filter((account) => loanRules.some((item) => item.accountId === account.id && item.status === 'ACTIVE' && item.allowLoans));
  const rule = loanRules.find((item) => item.accountId === form.accountId && item.status === 'ACTIVE' && item.allowLoans);
  const guarantorRows = rule?.requiresGuarantor ? Array.from({ length: Math.min(Math.max(form.guarantors.length, rule.minGuarantors), rule.maxGuarantors) }, (_, index) => form.guarantors[index] ?? { name: '', amount: '', relation: '' }) : [];
  const setGuarantor = (index: number, patch: Partial<GuarantorRow>) => setForm({ guarantors: guarantorRows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) });

  const mutation = useMockMutation<Awaited<ReturnType<typeof creditService.submitLoanApplication>>, void>({
    mutationFn: () =>
      creditService.submitLoanApplication(
        currentTenant.id,
        {
          accountId: form.accountId,
          memberId: form.memberId,
          requestedAmount: Number(form.requestedAmount),
          purpose: form.purpose,
          guarantors: guarantorRows.filter((row) => row.name.trim() && Number(row.amount) > 0).map((row) => ({ guarantorName: row.name.trim(), guaranteedAmount: Number(row.amount) || 0, relation: row.relation.trim() })),
        },
        user.name,
        user.id,
      ),
    invalidateKeys: [queryKeys.credit.applications(currentTenant.id)],
    onSuccess: (result) => {
      if (!result) { notify.error(t('finance', 'applicationRejected')); return; }
      notify.success(t('finance', 'applicationCreated'));
      navigate(`/operations/workflows/${result.request.id}`);
    },
  });

  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!form.accountId) nextErrors.accountId = t('finance', 'fieldRequired');
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
          <div className="space-y-2"><Label htmlFor="app-account">{t('finance', 'accountOrCash')}</Label>
            <select id="app-account" value={form.accountId} onChange={(event) => setForm({ accountId: event.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{t('finance', 'selectAccountPlaceholder')}</option>
              {eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountNumber} — {account.title}</option>)}
            </select>
            <FieldError message={errors.accountId} />
          </div>
          <div className="space-y-2"><Label htmlFor="app-member">{t('finance', 'selectMember')}</Label>
            <select id="app-member" value={form.memberId} onChange={(event) => setForm({ memberId: event.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{t('finance', 'selectMember')}</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
            </select>
            <FieldError message={errors.memberId} />
          </div>
          <div className="space-y-2"><Label htmlFor="app-amount">{t('finance', 'requestedAmount')} *</Label><Input id="app-amount" type="number" inputMode="decimal" value={form.requestedAmount} onChange={(event) => setForm({ requestedAmount: event.target.value })} /><FieldError message={errors.amount} />{rule && <p className="text-[11px] text-muted-foreground">{t('finance', 'policyAmountRange', { min: formatCurrency(rule.minAmount, currency), max: formatCurrency(rule.maxAmount, currency) })}</p>}</div>
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
            <div className="space-y-1"><Label htmlFor={`app-guarantor-amount-${index}`}>{t('finance', 'guaranteedAmount')}</Label><Input id={`app-guarantor-amount-${index}`} type="number" inputMode="decimal" value={row.amount} onChange={(event) => setGuarantor(index, { amount: event.target.value })} /></div>
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
 * TANZEN). Ne remplace PAS `resolveAccount()` (déjà utilisé par la liste des
 * comptes et la fiche caisse, déjà correct et testé) : ajoute la capacité
 * qui n'existait nulle part — solde à une date passée, et position financière
 * consolidée d'un membre (épargne / prêts en cours / distributions).
 */
function FinancePosition({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  const today = new Date().toISOString().slice(0, 10);
  const { data: accounts = [] } = useQuery({ queryKey: queryKeys.finance.accounts(currentTenant.id), queryFn: () => financeService.listAccounts(currentTenant.id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });

  const [accountId, setAccountId] = useState('');
  const [accountDate, setAccountDate] = useState(today);
  const accountScope = accountId ? ({ kind: 'ACCOUNT' as const, accountId }) : null;
  const { data: balanceResult, isFetching: balanceLoading } = useQuery({
    queryKey: accountScope ? queryKeys.finance.position.balance(currentTenant.id, scopeKey(accountScope), accountDate) : ['finance', 'position', 'balance', 'idle'],
    queryFn: () => financePositionService.balanceAsOf(currentTenant.id, accountScope!, accountDate),
    enabled: Boolean(accountScope && accountDate),
  });

  const [memberId, setMemberId] = useState('');
  const [memberDate, setMemberDate] = useState(today);
  const memberScope = memberId ? ({ kind: 'MEMBER_ALL_ACCOUNTS' as const, memberId }) : null;
  const { data: positionResult, isFetching: positionLoading } = useQuery({
    queryKey: memberScope ? queryKeys.finance.position.memberPosition(currentTenant.id, scopeKey(memberScope), memberDate) : ['finance', 'position', 'member', 'idle'],
    queryFn: () => financePositionService.memberFinancialPosition(currentTenant.id, memberScope!, memberDate),
    enabled: Boolean(memberScope && memberDate),
  });

  return <Page title={t('finance', 'financialPositionTitle')} description={t('finance', 'financialPositionDescription')} actions={<Back label={t('finance', 'backToAccounts')} />}>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'balanceAsOfTitle')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="pos-account">{t('finance', 'accountOrCash')}</Label>
            <select id="pos-account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{t('finance', 'selectAccountPlaceholder')}</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.accountNumber} — {account.title}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label htmlFor="pos-account-date">{t('finance', 'asOfDate')}</Label><Input id="pos-account-date" type="date" value={accountDate} onChange={(event) => setAccountDate(event.target.value)} /></div>
        </div>
        {accountId && (balanceLoading ? <p className="text-xs text-muted-foreground">{t('finance', 'saving')}</p> : balanceResult && (
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
    { key: 'id', header: t('finance', 'loanId'), render: (row) => <button type="button" onClick={() => navigate(`/finance/credit/loans/${row.id}`)} className="font-mono text-xs font-semibold text-primary">{row.id}</button> },
    { key: 'borrower', header: t('finance', 'borrower') },
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
      <Card><CardHeader><CardTitle className="text-sm">{t('finance', 'repaymentsTitle')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={repaymentColumns} rows={repayments} empty={<EmptyState icon={ReceiptText} title={t('finance', 'noRepayments')} />} /></CardContent></Card>
    </div>
  </Page>;
}

export function FinanceModule() {
  const { t } = useLocale();
  return (
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
       * modules). `credit/loan-rules` reste atteignable depuis Comptes.
       *
       * Mandat « Le Compte comme point d'entrée des Transactions »
       * (2026-09-23) : Comptes devient la page d'atterrissage de `/finance`
       * (Transactions n'étant plus un nœud de menu, `/finance/transactions`
       * ne doit plus être la redirection par défaut — elle reste une route à
       * part entière, atteignable depuis Comptes/le détail d'un compte).
       */}
      <Route index element={<Navigate to="accounts" replace />} />
      <Route path="accounts" element={<AccountsList t={t} />} />
      <Route path="accounts/create" element={<AccountCreate t={t} />} />
      <Route path="accounts/:id" element={<AccountDetail t={t} />} />
      <Route path="accounts/:id/edit" element={<AccountEdit t={t} />} />
      <Route path="accounts/:id/members" element={<AccountMembersManage t={t} />} />
      <Route path="transactions" element={<TransactionsList t={t} />} />
      <Route path="transactions/create" element={<PermissionRoute permission="transactions.create"><TransactionCreate t={t} /></PermissionRoute>} />
      <Route path="transactions/:id" element={<TransactionDetail t={t} />} />
      <Route path="transactions/:id/edit" element={<PermissionRoute permission="transactions.update"><TransactionEdit t={t} /></PermissionRoute>} />
      <Route path="credit/loan-rules" element={<PermissionRoute permission="loanRules.manage"><LoanRulesList t={t} /></PermissionRoute>} />
      <Route path="credit/loan-rules/create" element={<PermissionRoute permission="loanRules.manage"><LoanRuleCreate t={t} /></PermissionRoute>} />
      <Route path="credit/loan-rules/:id/edit" element={<PermissionRoute permission="loanRules.manage"><LoanRuleEdit t={t} /></PermissionRoute>} />
      <Route path="credit/loan-rules/:id" element={<PermissionRoute permission="loanRules.manage"><LoanRuleDetail t={t} /></PermissionRoute>} />
      <Route path="credit/applications" element={<PermissionRoute permission="applications.read"><ApplicationsList t={t} /></PermissionRoute>} />
      <Route path="credit/applications/create" element={<PermissionRoute permission="applications.create"><ApplicationCreate t={t} /></PermissionRoute>} />
      <Route path="credit/applications/:id" element={<PermissionRoute permission="applications.read"><ApplicationDetail t={t} /></PermissionRoute>} />
      <Route path="credit/loans" element={<PermissionRoute permission="loans.read"><LoansList t={t} /></PermissionRoute>} />
      <Route path="credit/loans/:id" element={<PermissionRoute permission="loans.read"><LoanDetail t={t} /></PermissionRoute>} />
      <Route path="position" element={<PermissionRoute permission="accounts.read"><FinancePosition t={t} /></PermissionRoute>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
