import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Banknote, BarChart3, BarChart3 as ChartIcon, CalendarClock, Check, ChevronRight, Clock3, CreditCard, FileText, HandCoins, Landmark, Plus, ReceiptText, ShieldCheck, SlidersHorizontal, TrendingUp, UserCheck, WalletCards } from 'lucide-react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, DataTable, FilterBar, StatusBadge, FormSection, Timeline, MoneyDisplay, DateDisplay, EmptyState, StatCard, PermissionGate, TableSkeleton, DetailSkeleton, ErrorState, FieldError, ConfirmDialog } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { NotFoundPage } from '@/routes';
import { financeService, type AccountInput, type DistributionInput } from '@/services/finance.service';
import { creditService, type ApplicationInput, type LoanInput, type RepaymentInput, type GuarantorInput } from '@/services/credit.service';
import { organizationService } from '@/services/organization.service';
import { tontinesService } from '@/services/tontines.service';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { notify } from '@/lib/notify';
import type { ApplicationStage } from '@/mocks/finance/applications';
import type { Account } from '@/mocks/finance/accounts';
import type { Transaction } from '@/mocks/finance/transactions';
import type { Application } from '@/mocks/finance/applications';
import type { Loan } from '@/mocks/finance/loans';
import type { Distribution } from '@/mocks/finance/distributions';
import type { TableColumn } from '@/types/ui';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatFCFA, formatNumber } from '@/lib/utils';

type T = (section: 'finance' | 'nav', key: string, values?: Record<string, string>) => string;
const tone = { active: 'success' as const, inactive: 'default' as const, completed: 'success' as const, pending: 'warning' as const, failed: 'error' as const, scheduled: 'info' as const, late: 'error' as const, stageSubmitted: 'info' as const, stageReview: 'warning' as const, stageApproved: 'success' as const, stageRejected: 'error' as const, stageDisbursed: 'success' as const, repaid: 'success' as const, defaulted: 'error' as const, applied: 'error' as const, waived: 'default' as const };

function Page({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) { return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7"><PageHeader eyebrow="FINANCE" title={title} description={description} actions={actions} />{children}</div>; }
function Back({ label }: { label: string }) { const navigate = useNavigate(); return <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={15} />{label}</Button>; }
function Avatar({ name }: { name: string }) { const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2); return <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">{initials}</span>; }
function Info({ label, value, icon: Icon }: { label: string; value: ReactNode; icon: typeof Landmark }) { return <div className="flex gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={15} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }
function Metric({ label, value, icon: Icon, tone = 'info' }: { label: string; value: string; icon: typeof Landmark; tone?: 'info' | 'success' | 'warning' | 'neutral' }) { return <StatCard label={label} value={value} icon={Icon} tone={tone} />; }

function AccountsList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const [search, setSearch] = useState('');
  const { data: accounts = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.finance.accounts(currentTenant.id), queryFn: () => financeService.listAccounts(currentTenant.id) });
  const filtered = accounts.filter((a) => `${a.accountNumber} ${a.tenantName}`.toLowerCase().includes(search.toLowerCase()));
  if (isLoading) return <Page title={t('finance', 'accountsTitle')} description={t('finance', 'accountsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'accountsTitle')} description={t('finance', 'accountsDescription')}><ErrorState onRetry={refetch} /></Page>;
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const activeCount = accounts.filter((a) => a.status === 'active').length;
  const columns: TableColumn<Account>[] = [
    { key: 'accountNumber', header: t('finance', 'accountNumber'), render: (row) => <button type="button" onClick={() => navigate(`/finance/accounts/${row.id}`)} className="flex items-center gap-3 text-left"><Avatar name={row.tenantName} /><span><span className="block font-mono text-sm font-semibold">{row.accountNumber}</span><span className="block text-xs text-muted-foreground">{row.tenantName}</span></span></button> },
    { key: 'type', header: t('finance', 'accountType'), render: (row) => t('finance', row.type) },
    { key: 'balance', header: t('finance', 'balance'), render: (row) => <span className="font-semibold"><MoneyDisplay amount={row.balance} /></span> },
    { key: 'lastMovement', header: t('finance', 'lastMovement'), render: (row) => <DateDisplay value={row.lastMovement} /> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', row.status)} tone={tone[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/finance/accounts/${row.id}`)} aria-label={t('finance', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <Page title={t('finance', 'accountsTitle')} description={t('finance', 'accountsDescription')} actions={<PermissionGate permission="accounts.create"><Button onClick={() => navigate('/finance/accounts/create')}><Plus size={16} />{t('finance', 'createAccount')}</Button></PermissionGate>}><div className="grid gap-4 sm:grid-cols-3"><Metric label={t('finance', 'totalBalance')} value={formatFCFA(totalBalance, 'fr', true)} icon={Landmark} tone="success" /><Metric label={t('finance', 'activeAccounts')} value={formatNumber(activeCount)} icon={WalletCards} /><Metric label={t('finance', 'accounts')} value={formatNumber(accounts.length)} icon={CreditCard} tone="neutral" /></div><FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} /><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={Landmark} title={t('finance', 'noAccounts')} />} /></Page>;
}

function AccountCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const { data: tenants = [] } = useQuery({ queryKey: queryKeys.tenants.list(currentTenant.id, user.scope), queryFn: () => organizationService.listTenants(currentTenant.id, user.scope) });
  const [accountNumber, setAccountNumber] = useState(''); const [type, setType] = useState<AccountInput['type']>('savings'); const [tenantId, setTenantId] = useState(currentTenant.id); const [balance, setBalance] = useState('0'); const [status, setStatus] = useState<AccountInput['status']>('active');
  const [error, setError] = useState<string | undefined>();
  const mutation = useMockMutation<Awaited<ReturnType<typeof financeService.createAccount>>, AccountInput>({
    mutationFn: (input) => financeService.createAccount(input),
    invalidateKeys: [queryKeys.finance.accounts(currentTenant.id)],
    onSuccess: (account) => { notify.success(t('finance', 'accountCreated')); navigate(`/finance/accounts/${account.id}`); },
  });
  const handleSave = () => {
    if (!accountNumber.trim()) { setError(t('finance', 'fieldRequired')); return; }
    setError(undefined);
    const tenant = tenants.find((item) => item.id === tenantId);
    mutation.mutate({ accountNumber, type, balance: Number(balance) || 0, status, tenantId, tenantName: tenant?.name ?? currentTenant.name });
  };
  return <Page title={t('finance', 'createAccount')} description={t('finance', 'accountsDescription')} actions={<Back label={t('finance', 'backToAccounts')} />}><div className="grid gap-5 lg:grid-cols-2"><FormSection title={t('finance', 'general')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="account-number">{t('finance', 'accountNumber')}</Label><Input id="account-number" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} aria-invalid={Boolean(error)} /><FieldError message={error} /></div><div className="space-y-2"><Label htmlFor="account-type">{t('finance', 'accountType')}</Label><select id="account-type" value={type} onChange={(event) => setType(event.target.value as AccountInput['type'])} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="savings">{t('finance', 'savings')}</option><option value="current">{t('finance', 'current')}</option><option value="treasury">{t('finance', 'treasury')}</option><option value="loanAccount">{t('finance', 'loanAccount')}</option></select></div><div className="space-y-2"><Label htmlFor="account-tenant">{t('finance', 'tenant')}</Label><select id="account-tenant" value={tenantId} onChange={(event) => setTenantId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="account-balance">{t('finance', 'balance')}</Label><Input id="account-balance" type="number" inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} /></div></div></FormSection><FormSection title={t('finance', 'general')}><div className="space-y-4"><div className="space-y-2"><Label htmlFor="account-status">{t('finance', 'status')}</Label><select id="account-status" value={status} onChange={(event) => setStatus(event.target.value as AccountInput['status'])} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="active">{t('finance', 'active')}</option><option value="inactive">{t('finance', 'inactive')}</option></select></div></div></FormSection><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/finance/accounts')}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div></div></Page>;
}

function AccountDetail({ t }: { t: T }) {
  const { id = '' } = useParams(); const { currentTenant } = useTenant();
  const { data: account, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.finance.account(id), currentTenant.id], queryFn: () => financeService.getAccount(currentTenant.id, id) });
  const { data: transactions = [] } = useQuery({ queryKey: queryKeys.finance.transactions(currentTenant.id), queryFn: () => financeService.listTransactions(currentTenant.id) });
  if (isLoading) return <Page title={t('finance', 'accountDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'accountDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!account) return <NotFoundPage />;
  const accountTransactions = transactions.filter((tr) => tr.fromAccount === account.accountNumber || tr.toAccount === account.accountNumber);
  const columns: TableColumn<Transaction>[] = [
    { key: 'reference', header: t('finance', 'reference'), render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
    { key: 'date', header: t('finance', 'amount'), render: (row) => <DateDisplay value={row.date} /> },
    { key: 'category', header: t('finance', 'category'), render: (row) => t('finance', row.category) },
    { key: 'type', header: t('finance', 'type'), render: (row) => <span className={row.type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{row.type === 'credit' ? '+' : '-'}<MoneyDisplay amount={row.amount} /></span> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', row.status)} tone={tone[row.status]} /> },
  ];
  return <Page title={account.accountNumber} description={account.tenantName} actions={<><Back label={t('finance', 'backToAccounts')} /><Button variant="outline"><CreditCard size={15} />{t('finance', 'createTransaction')}</Button></>}><div className="grid gap-5 lg:grid-cols-[1fr_2fr]"><Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">{t('finance', 'balance')}</p><p className="mt-2 font-heading text-3xl font-semibold"><MoneyDisplay amount={account.balance} /></p><div className="mt-5 space-y-3 border-t border-border pt-4"><Info label={t('finance', 'accountType')} value={t('finance', account.type)} icon={Landmark} /><Info label={t('finance', 'tenant')} value={account.tenantName} icon={Landmark} /><Info label={t('finance', 'lastMovement')} value={<DateDisplay value={account.lastMovement} />} icon={Clock3} /></div><div className="mt-4"><StatusBadge label={t('finance', account.status)} tone={tone[account.status]} /></div></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">{t('finance', 'transactions')}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={columns} rows={accountTransactions} empty={<EmptyState icon={ReceiptText} title={t('finance', 'noTransactions')} />} /></CardContent></Card></div></Page>;
}

function TransactionsList({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  const { data: transactions = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.finance.transactions(currentTenant.id), queryFn: () => financeService.listTransactions(currentTenant.id) });
  const [search, setSearch] = useState(''); const [period, setPeriod] = useState('all'); const [category, setCategory] = useState('all'); const [status, setStatus] = useState('all'); const [type, setType] = useState('all'); const [minAmount, setMinAmount] = useState(''); const [maxAmount, setMaxAmount] = useState('');
  const filtered = transactions.filter((tr) => {
    const matchesSearch = `${tr.reference} ${tr.description} ${tr.fromAccount} ${tr.toAccount}`.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || tr.category === category;
    const matchesStatus = status === 'all' || tr.status === status;
    const matchesType = type === 'all' || tr.type === type;
    const matchesMin = !minAmount || tr.amount >= Number(minAmount);
    const matchesMax = !maxAmount || tr.amount <= Number(maxAmount);
    let matchesPeriod = true;
    if (period !== 'all') { const trDate = new Date(tr.date); const now = new Date(); if (period === 'today') matchesPeriod = trDate.toDateString() === now.toDateString(); else if (period === 'week') matchesPeriod = trDate > new Date(now.getTime() - 7 * 86400000); else if (period === 'month') matchesPeriod = trDate.getMonth() === now.getMonth() && trDate.getFullYear() === now.getFullYear(); else if (period === 'quarter') matchesPeriod = Math.floor(trDate.getMonth() / 3) === Math.floor(now.getMonth() / 3) && trDate.getFullYear() === now.getFullYear(); else if (period === 'year') matchesPeriod = trDate.getFullYear() === now.getFullYear(); }
    return matchesSearch && matchesCategory && matchesStatus && matchesType && matchesMin && matchesMax && matchesPeriod;
  });
  const columns: TableColumn<Transaction>[] = [
    { key: 'reference', header: t('finance', 'reference'), render: (row) => <span className="font-mono text-xs font-semibold">{row.reference}</span> },
    { key: 'date', header: t('finance', 'amount'), render: (row) => <DateDisplay value={row.date} /> },
    { key: 'category', header: t('finance', 'category'), render: (row) => t('finance', row.category) },
    { key: 'fromAccount', header: t('finance', 'fromAccount'), render: (row) => <span className="text-xs text-muted-foreground">{row.fromAccount}</span> },
    { key: 'toAccount', header: t('finance', 'toAccount'), render: (row) => <span className="text-xs text-muted-foreground">{row.toAccount}</span> },
    { key: 'amount', header: t('finance', 'amount'), render: (row) => <span className={`font-semibold ${row.type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{row.type === 'credit' ? '+' : '-'}<MoneyDisplay amount={row.amount} /></span> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', row.status)} tone={tone[row.status]} /> },
  ];
  const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-xs";
  if (isLoading) return <Page title={t('finance', 'transactionsTitle')} description={t('finance', 'transactionsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'transactionsTitle')} description={t('finance', 'transactionsDescription')}><ErrorState onRetry={refetch} /></Page>;
  return <Page title={t('finance', 'transactionsTitle')} description={t('finance', 'transactionsDescription')} actions={<PermissionGate permission="transactions.export"><Button><Plus size={16} />{t('finance', 'createTransaction')}</Button></PermissionGate>}><FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} filters={<><select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t('finance', 'period')} className={selectClass}><option value="all">{t('finance', 'allPeriods')}</option><option value="today">{t('finance', 'today')}</option><option value="week">{t('finance', 'week')}</option><option value="month">{t('finance', 'month')}</option><option value="quarter">{t('finance', 'quarter')}</option><option value="year">{t('finance', 'year')}</option></select><select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('finance', 'category')} className={selectClass}><option value="all">{t('finance', 'allCategories')}</option><option value="contribution">{t('finance', 'contribution')}</option><option value="repayment">{t('finance', 'repayment')}</option><option value="loanDisbursement">{t('finance', 'loanDisbursement')}</option><option value="loanRepayment">{t('finance', 'loanRepayment')}</option><option value="fee">{t('finance', 'fee')}</option><option value="transfer">{t('finance', 'transfer')}</option><option value="distribution">{t('finance', 'distribution')}</option><option value="penalty">{t('finance', 'penalty')}</option></select><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('finance', 'status')} className={selectClass}><option value="all">{t('finance', 'allStatuses')}</option><option value="completed">{t('finance', 'completed')}</option><option value="pending">{t('finance', 'pending')}</option><option value="failed">{t('finance', 'failed')}</option></select><select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('finance', 'type')} className={selectClass}><option value="all">{t('finance', 'allTypes')}</option><option value="debit">{t('finance', 'debit')}</option><option value="credit">{t('finance', 'credit')}</option></select><Input type="number" inputMode="decimal" aria-label={t('finance', 'minAmount')} placeholder={t('finance', 'minAmount')} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="h-9 w-28" /><Input type="number" inputMode="decimal" aria-label={t('finance', 'maxAmount')} placeholder={t('finance', 'maxAmount')} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="h-9 w-28" /></>} /><div className="text-xs text-muted-foreground">{formatNumber(filtered.length)} / {formatNumber(transactions.length)}</div><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={ReceiptText} title={t('finance', 'noTransactions')} />} /></Page>;
}

function ContributionsView({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  const { data: contributions = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.finance.contributions(currentTenant.id), queryFn: () => financeService.listContributions(currentTenant.id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { data: tontines = [] } = useQuery({ queryKey: queryKeys.tontines.list(currentTenant.id), queryFn: () => tontinesService.listTontines(currentTenant.id) });
  const { data: monthlyTrend = [] } = useQuery({ queryKey: queryKeys.finance.contributionsTrend, queryFn: financeService.listContributionsTrend });
  const memberNameById = useMemo(() => new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`])), [members]);
  const tontineNameById = useMemo(() => new Map(tontines.map((tontine) => [tontine.id, tontine.name])), [tontines]);
  const byTontine = useMemo(() => {
    const grouped = new Map<string, { name: string; amount: number; count: number }>();
    contributions.forEach((c) => {
      const name = tontineNameById.get(c.tontineId) ?? c.tontineId;
      const entry = grouped.get(name) ?? { name, amount: 0, count: 0 };
      entry.amount += c.amount; entry.count += 1;
      grouped.set(name, entry);
    });
    return [...grouped.values()];
  }, [contributions, tontineNameById]);

  const total = contributions.reduce((s, c) => s + c.amount, 0);
  const thisMonthAmount = contributions.filter((c) => new Date(c.date).getMonth() === 7).reduce((s, c) => s + c.amount, 0);
  const avgPerMember = members.length ? Math.round(total / members.length) : 0;
  const collectionRate = contributions.length ? Math.round((contributions.filter((c) => c.status === 'completed').length / contributions.length) * 100) : 0;
  const columns: TableColumn<typeof contributions[number]>[] = [
    { key: 'memberId', header: t('finance', 'member'), render: (row) => { const name = memberNameById.get(row.memberId) ?? row.memberId; return <span className="flex items-center gap-2"><Avatar name={name} /><span className="font-medium">{name}</span></span>; } },
    { key: 'tontineId', header: t('finance', 'byTontine'), render: (row) => tontineNameById.get(row.tontineId) ?? row.tontineId },
    { key: 'cycleNumber', header: t('finance', 'cycleLabel'), render: (row) => row.cycleNumber },
    { key: 'amount', header: t('finance', 'amount'), render: (row) => <MoneyDisplay amount={row.amount} /> },
    { key: 'date', header: t('finance', 'amount'), render: (row) => <DateDisplay value={row.date} /> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', row.status)} tone={tone[row.status]} /> },
  ];
  if (isLoading) return <Page title={t('finance', 'contributionsTitle')} description={t('finance', 'contributionsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'contributionsTitle')} description={t('finance', 'contributionsDescription')}><ErrorState onRetry={refetch} /></Page>;
  return <Page title={t('finance', 'contributionsTitle')} description={t('finance', 'contributionsDescription')}><div className="grid gap-4 sm:grid-cols-4"><Metric label={t('finance', 'totalContributions')} value={formatFCFA(total, 'fr', true)} icon={Banknote} tone="success" /><Metric label={t('finance', 'thisMonth')} value={formatFCFA(thisMonthAmount, 'fr', true)} icon={TrendingUp} /><Metric label={t('finance', 'avgPerMember')} value={formatFCFA(avgPerMember)} icon={UserCheck} tone="neutral" /><Metric label={t('finance', 'collectionRate')} value={`${collectionRate}%`} icon={BarChart3} tone="warning" /></div><div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">{t('finance', 'byTontine')}</CardTitle></CardHeader><CardContent className="space-y-3 p-4">{byTontine.map((item) => <div key={item.name} className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium" title={item.name}>{item.name}</span><div className="flex items-center gap-3"><span className="text-sm font-semibold"><MoneyDisplay amount={item.amount} /></span><span className="text-xs text-muted-foreground">{formatNumber(item.count)}</span></div></div>)}{byTontine.length === 0 && <EmptyState icon={Banknote} title={t('finance', 'noContributions')} />}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">{t('finance', 'byMonth')}</CardTitle></CardHeader><CardContent className="p-4"><div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyTrend} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 10 }} /><Tooltip formatter={(v: number) => formatFCFA(v)} /><Bar dataKey="amount" fill="#1b6bd1" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card></div><DataTable columns={columns} rows={contributions} empty={<EmptyState icon={Banknote} title={t('finance', 'noContributions')} />} /></Page>;
}

function DistributionsList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const [search, setSearch] = useState(''); const [toApprove, setToApprove] = useState<Distribution | null>(null);
  const { data: distributions = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.finance.distributions(currentTenant.id), queryFn: () => financeService.listDistributions(currentTenant.id) });
  const approveMutation = useMockMutation<Distribution | undefined, string>({
    mutationFn: (id) => financeService.approveDistribution(currentTenant.id, id),
    invalidateKeys: [queryKeys.finance.distributions(currentTenant.id)],
    onSuccess: () => { notify.success(t('finance', 'distributionValidated')); setToApprove(null); },
  });
  const filtered = distributions.filter((d) => `${d.beneficiary} ${d.source}`.toLowerCase().includes(search.toLowerCase()));
  if (isLoading) return <Page title={t('finance', 'distributionsTitle')} description={t('finance', 'distributionsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'distributionsTitle')} description={t('finance', 'distributionsDescription')}><ErrorState onRetry={refetch} /></Page>;
  const columns: TableColumn<Distribution>[] = [
    { key: 'beneficiary', header: t('finance', 'beneficiary'), render: (row) => <span className="flex items-center gap-2"><Avatar name={row.beneficiary} /><span className="font-medium">{row.beneficiary}</span></span> },
    { key: 'source', header: t('finance', 'source') },
    { key: 'amount', header: t('finance', 'distributionAmount'), render: (row) => <MoneyDisplay amount={row.amount} /> },
    { key: 'date', header: t('finance', 'distributionDate'), render: (row) => <DateDisplay value={row.date} /> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', row.status)} tone={tone[row.status]} /> },
    { key: 'actions', header: '', className: 'w-32', render: (row) => row.status === 'pending' && <PermissionGate permission="distributions.approve"><Button variant="outline" size="sm" onClick={() => setToApprove(row)}>{t('finance', 'validateDistribution')}</Button></PermissionGate> },
  ];
  return <Page title={t('finance', 'distributionsTitle')} description={t('finance', 'distributionsDescription')} actions={<PermissionGate permission="distributions.create"><Button onClick={() => navigate('/finance/distributions/create')}><Plus size={16} />{t('finance', 'createDistribution')}</Button></PermissionGate>}><FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} /><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={SlidersHorizontal} title={t('finance', 'noDistributions')} />} />
    {toApprove && <ConfirmDialog open title={t('finance', 'validateDistribution')} description={t('finance', 'validateDistributionConfirm')} confirmLabel={t('finance', 'confirm')} cancelLabel={t('finance', 'cancel')} onConfirm={() => approveMutation.mutate(toApprove.id)} onCancel={() => setToApprove(null)} />}
  </Page>;
}

function DistributionCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const [beneficiary, setBeneficiary] = useState(''); const [source, setSource] = useState(''); const [amount, setAmount] = useState(''); const [date, setDate] = useState('');
  const [errors, setErrors] = useState<{ beneficiary?: string; amount?: string }>({});
  const mutation = useMockMutation<Distribution, DistributionInput>({
    mutationFn: (input) => financeService.createDistribution(currentTenant.id, input),
    invalidateKeys: [queryKeys.finance.distributions(currentTenant.id)],
    onSuccess: () => { notify.success(t('finance', 'distributionCreated')); navigate('/finance/distributions'); },
  });
  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!beneficiary.trim()) nextErrors.beneficiary = t('finance', 'fieldRequired');
    if (!amount || Number(amount) <= 0) nextErrors.amount = t('finance', 'fieldRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate({ beneficiary, source, amount: Number(amount), date });
  };
  return <Page title={t('finance', 'createDistribution')} description={t('finance', 'distributionsDescription')} actions={<Back label={t('finance', 'noDistributions')} />}><div className="grid gap-5 lg:grid-cols-2"><FormSection title={t('finance', 'general')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="distribution-beneficiary">{t('finance', 'beneficiary')}</Label><Input id="distribution-beneficiary" value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} aria-invalid={Boolean(errors.beneficiary)} /><FieldError message={errors.beneficiary} /></div><div className="space-y-2"><Label htmlFor="distribution-source">{t('finance', 'source')}</Label><Input id="distribution-source" value={source} onChange={(event) => setSource(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="distribution-amount">{t('finance', 'distributionAmount')}</Label><Input id="distribution-amount" type="number" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(errors.amount)} /><FieldError message={errors.amount} /></div><div className="space-y-2"><Label htmlFor="distribution-date">{t('finance', 'distributionDate')}</Label><Input id="distribution-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></div></FormSection><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/finance/distributions')}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div></div></Page>;
}

function ApplicationsList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const [search, setSearch] = useState(''); const [stage, setStage] = useState('all');
  const { data: applications = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.credit.applications(currentTenant.id), queryFn: () => creditService.listApplications(currentTenant.id) });
  const filtered = applications.filter((a) => `${a.applicant} ${a.purpose} ${a.id}`.toLowerCase().includes(search.toLowerCase()) && (stage === 'all' || a.stage === stage));
  if (isLoading) return <Page title={t('finance', 'applicationsTitle')} description={t('finance', 'applicationsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'applicationsTitle')} description={t('finance', 'applicationsDescription')}><ErrorState onRetry={refetch} /></Page>;
  const columns: TableColumn<Application>[] = [
    { key: 'id', header: 'ID', render: (row) => <button type="button" onClick={() => navigate(`/finance/credit/applications/${row.id}`)} className="font-mono text-xs font-semibold text-primary">{row.id}</button> },
    { key: 'applicant', header: t('finance', 'applicant'), render: (row) => <span className="flex items-center gap-2"><Avatar name={row.applicant} /><span className="font-medium">{row.applicant}</span></span> },
    { key: 'requestedAmount', header: t('finance', 'requestedAmount'), render: (row) => <MoneyDisplay amount={row.requestedAmount} /> },
    { key: 'purpose', header: t('finance', 'purpose'), render: (row) => <span className="truncate text-sm text-muted-foreground" title={row.purpose}>{row.purpose}</span> },
    { key: 'submittedDate', header: t('finance', 'submittedDate'), render: (row) => <DateDisplay value={row.submittedDate} /> },
    { key: 'stage', header: t('finance', 'applicationStage'), render: (row) => <StatusBadge label={t('finance', row.stage)} tone={tone[row.stage]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/finance/credit/applications/${row.id}`)} aria-label={t('finance', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <Page title={t('finance', 'applicationsTitle')} description={t('finance', 'applicationsDescription')} actions={<PermissionGate permission="applications.create"><Button onClick={() => navigate('/finance/credit/applications/create')}><Plus size={16} />{t('finance', 'createApplication')}</Button></PermissionGate>}><FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} filters={<select value={stage} onChange={(e) => setStage(e.target.value)} aria-label={t('finance', 'applicationStage')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('finance', 'allStatuses')}</option><option value="stageSubmitted">{t('finance', 'stageSubmitted')}</option><option value="stageReview">{t('finance', 'stageReview')}</option><option value="stageApproved">{t('finance', 'stageApproved')}</option><option value="stageRejected">{t('finance', 'stageRejected')}</option><option value="stageDisbursed">{t('finance', 'stageDisbursed')}</option></select>} /><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={FileText} title={t('finance', 'noApplications')} />} /></Page>;
}

function ApplicationCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const { user } = usePermissions();
  const { data: tenants = [] } = useQuery({ queryKey: queryKeys.tenants.list(currentTenant.id, user.scope), queryFn: () => organizationService.listTenants(currentTenant.id, user.scope) });
  const [applicant, setApplicant] = useState(''); const [requestedAmount, setRequestedAmount] = useState(''); const [purpose, setPurpose] = useState(''); const [tenantId, setTenantId] = useState(currentTenant.id); const [creditScore, setCreditScore] = useState(''); const [monthlyIncome, setMonthlyIncome] = useState(''); const [existingLoans, setExistingLoans] = useState('0');
  const [errors, setErrors] = useState<{ applicant?: string; requestedAmount?: string }>({});
  const mutation = useMockMutation<Awaited<ReturnType<typeof creditService.createApplication>>, ApplicationInput>({
    mutationFn: (input) => creditService.createApplication(input),
    invalidateKeys: [queryKeys.credit.applications(currentTenant.id)],
    onSuccess: (application) => { notify.success(t('finance', 'applicationCreated')); navigate(`/finance/credit/applications/${application.id}`); },
  });
  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!applicant.trim()) nextErrors.applicant = t('finance', 'fieldRequired');
    if (!requestedAmount || Number(requestedAmount) <= 0) nextErrors.requestedAmount = t('finance', 'fieldRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const tenant = tenants.find((item) => item.id === tenantId);
    mutation.mutate({ applicant, requestedAmount: Number(requestedAmount), purpose, tenantId, tenantName: tenant?.name ?? currentTenant.name, creditScore: Number(creditScore) || 0, monthlyIncome: Number(monthlyIncome) || 0, existingLoans: Number(existingLoans) || 0 });
  };
  return <Page title={t('finance', 'createApplication')} description={t('finance', 'applicationsDescription')} actions={<Back label={t('finance', 'backToApplications')} />}><div className="grid gap-5 lg:grid-cols-2"><FormSection title={t('finance', 'general')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="application-applicant">{t('finance', 'applicant')}</Label><Input id="application-applicant" value={applicant} onChange={(event) => setApplicant(event.target.value)} aria-invalid={Boolean(errors.applicant)} /><FieldError message={errors.applicant} /></div><div className="space-y-2"><Label htmlFor="application-amount">{t('finance', 'requestedAmount')}</Label><Input id="application-amount" type="number" inputMode="decimal" value={requestedAmount} onChange={(event) => setRequestedAmount(event.target.value)} aria-invalid={Boolean(errors.requestedAmount)} /><FieldError message={errors.requestedAmount} /></div><div className="space-y-2"><Label htmlFor="application-purpose">{t('finance', 'purpose')}</Label><Textarea id="application-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="application-tenant">{t('finance', 'tenant')}</Label><select id="application-tenant" value={tenantId} onChange={(event) => setTenantId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></div></div></FormSection><FormSection title={t('finance', 'personalInfo')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="application-credit-score">{t('finance', 'creditScore')}</Label><Input id="application-credit-score" type="number" inputMode="numeric" value={creditScore} onChange={(event) => setCreditScore(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="application-monthly-income">{t('finance', 'monthlyIncome')}</Label><Input id="application-monthly-income" type="number" inputMode="decimal" value={monthlyIncome} onChange={(event) => setMonthlyIncome(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="application-existing-loans">{t('finance', 'existingLoans')}</Label><Input id="application-existing-loans" type="number" inputMode="numeric" value={existingLoans} onChange={(event) => setExistingLoans(event.target.value)} /></div></div></FormSection><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/finance/credit/applications')}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div></div></Page>;
}

type ApplicationTransition = { nextStage: ApplicationStage; toastKey: 'applicationApproved' | 'applicationRejected' | 'loanDisbursed'; confirmDescriptionKey: 'approveApplicationConfirm' | 'rejectApplicationConfirm' | 'disburseConfirm' };

function ApplicationDetail({ t }: { t: T }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { data: app, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.credit.application(id), currentTenant.id], queryFn: () => creditService.getApplication(currentTenant.id, id) });
  const { data: loans = [] } = useQuery({ queryKey: queryKeys.credit.loans(currentTenant.id), queryFn: () => creditService.listLoans(currentTenant.id) });
  const [pendingTransition, setPendingTransition] = useState<ApplicationTransition | null>(null);
  const transitionMutation = useMockMutation<Awaited<ReturnType<typeof creditService.advanceApplicationStage>>, ApplicationTransition>({
    mutationFn: (transition) => creditService.advanceApplicationStage(currentTenant.id, id, transition.nextStage),
    invalidateKeys: [queryKeys.credit.application(id), queryKeys.credit.applications(currentTenant.id)],
    onSuccess: (_data, transition) => notify.success(t('finance', transition.toastKey)),
  });
  if (isLoading) return <Page title={t('finance', 'applicationDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'applicationDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!app) return <NotFoundPage />;
  const stages = ['stageSubmitted', 'stageReview', 'stageApproved', 'stageDisbursed'];
  const currentStageIdx = stages.indexOf(app.stage);
  const linkedLoan = loans.find((l) => l.applicationId === app.id);
  const isBusy = transitionMutation.isPending;
  return <Page title={`${app.id} - ${app.applicant}`} description={app.purpose} actions={<><Back label={t('finance', 'backToApplications')} />{app.stage === 'stageReview' && <><PermissionGate permission="applications.approve"><Button disabled={isBusy} onClick={() => setPendingTransition({ nextStage: 'stageApproved', toastKey: 'applicationApproved', confirmDescriptionKey: 'approveApplicationConfirm' })}><Check size={15} />{t('finance', 'approve')}</Button></PermissionGate><PermissionGate permission="applications.approve"><Button variant="outline" className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300" disabled={isBusy} onClick={() => setPendingTransition({ nextStage: 'stageRejected', toastKey: 'applicationRejected', confirmDescriptionKey: 'rejectApplicationConfirm' })}>{t('finance', 'reject')}</Button></PermissionGate></>}{app.stage === 'stageApproved' && <PermissionGate permission="loans.approve"><Button disabled={isBusy} onClick={() => setPendingTransition({ nextStage: 'stageDisbursed', toastKey: 'loanDisbursed', confirmDescriptionKey: 'disburseConfirm' })}><CreditCard size={15} />{t('finance', 'disburse')}</Button></PermissionGate>}</>}>{pendingTransition && <ConfirmDialog open title={t('finance', pendingTransition.toastKey === 'applicationApproved' ? 'approve' : pendingTransition.toastKey === 'applicationRejected' ? 'reject' : 'disburse')} description={t('finance', pendingTransition.confirmDescriptionKey)} confirmLabel={t('finance', 'confirm')} cancelLabel={t('finance', 'cancel')} onConfirm={() => { transitionMutation.mutate(pendingTransition); setPendingTransition(null); }} onCancel={() => setPendingTransition(null)} />}<Card className="mb-5"><CardContent className="p-5"><div className="flex flex-wrap items-center justify-between gap-4">{stages.map((stage, idx) => <div key={stage} className="flex items-center gap-2"><span className={`grid size-8 place-items-center rounded-full text-xs font-bold ${idx <= currentStageIdx ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{idx + 1}</span><span className={`text-xs font-medium ${idx <= currentStageIdx ? 'text-foreground' : 'text-muted-foreground'}`}>{t('finance', stage)}</span>{idx < stages.length - 1 && <ChevronRight size={14} className="text-muted-foreground" />}</div>)}</div></CardContent></Card><div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">{t('finance', 'general')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5"><Info label={t('finance', 'applicant')} value={app.applicant} icon={UserCheck} /><Info label={t('finance', 'requestedAmount')} value={formatFCFA(app.requestedAmount)} icon={Banknote} /><Info label={t('finance', 'purpose')} value={app.purpose} icon={FileText} /><Info label={t('finance', 'submittedDate')} value={<DateDisplay value={app.submittedDate} />} icon={CalendarClock} /></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">{t('finance', 'personalInfo')}</CardTitle></CardHeader><CardContent className="space-y-4 p-5"><Info label={t('finance', 'creditScore')} value={formatNumber(app.creditScore)} icon={ShieldCheck} /><Info label={t('finance', 'monthlyIncome')} value={formatFCFA(app.monthlyIncome)} icon={Banknote} /><Info label={t('finance', 'existingLoans')} value={formatNumber(app.existingLoans)} icon={CreditCard} /><Info label={t('finance', 'applicationStage')} value={t('finance', app.stage)} icon={ChartIcon} /></CardContent></Card></div>{linkedLoan && <Card className="mt-5"><CardHeader><CardTitle className="text-sm">{t('finance', 'loans')}</CardTitle></CardHeader><CardContent className="p-5"><button type="button" onClick={() => navigate(`/finance/credit/loans/${linkedLoan.id}`)} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted"><Avatar name={linkedLoan.borrower} /><div className="flex-1 text-left"><p className="text-sm font-semibold">{linkedLoan.id} - {linkedLoan.borrower}</p><p className="text-xs text-muted-foreground">{formatFCFA(linkedLoan.principal)}</p></div><ChevronRight size={16} className="text-muted-foreground" /></button></CardContent></Card>}</Page>;
}

function LoansList({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant(); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all');
  const { data: loans = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.credit.loans(currentTenant.id), queryFn: () => creditService.listLoans(currentTenant.id) });
  const filtered = loans.filter((l) => `${l.borrower} ${l.id}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || l.status === status));
  if (isLoading) return <Page title={t('finance', 'loansTitle')} description={t('finance', 'loansDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'loansTitle')} description={t('finance', 'loansDescription')}><ErrorState onRetry={refetch} /></Page>;
  const totalOutstanding = loans.reduce((s, l) => s + l.outstanding, 0);
  const columns: TableColumn<Loan>[] = [
    { key: 'id', header: t('finance', 'loanId'), render: (row) => <button type="button" onClick={() => navigate(`/finance/credit/loans/${row.id}`)} className="font-mono text-xs font-semibold text-primary">{row.id}</button> },
    { key: 'borrower', header: t('finance', 'borrower'), render: (row) => <span className="flex items-center gap-2"><Avatar name={row.borrower} /><span className="font-medium">{row.borrower}</span></span> },
    { key: 'principal', header: t('finance', 'principal'), render: (row) => <MoneyDisplay amount={row.principal} /> },
    { key: 'outstanding', header: t('finance', 'outstanding'), render: (row) => <span className="font-semibold"><MoneyDisplay amount={row.outstanding} /></span> },
    { key: 'progress', header: t('finance', 'progress'), render: (row) => <div className="flex items-center gap-2"><div role="progressbar" aria-valuenow={row.progress} aria-valuemin={0} aria-valuemax={100} aria-label={t('finance', 'progress')} className="h-2 w-20 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${row.progress}%` }} /></div><span className="text-xs text-muted-foreground">{row.progress}%</span></div> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', row.status)} tone={tone[row.status]} /> },
    { key: 'actions', header: '', className: 'w-12', render: (row) => <button type="button" onClick={() => navigate(`/finance/credit/loans/${row.id}`)} aria-label={t('finance', 'viewDetail')} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button> },
  ];
  return <Page title={t('finance', 'loansTitle')} description={t('finance', 'loansDescription')} actions={<PermissionGate permission="loans.create"><Button onClick={() => navigate('/finance/credit/loans/create')}><Plus size={16} />{t('finance', 'createLoan')}</Button></PermissionGate>}><div className="grid gap-4 sm:grid-cols-3"><Metric label={t('finance', 'loans')} value={formatNumber(loans.length)} icon={CreditCard} /><Metric label={t('finance', 'outstanding')} value={formatFCFA(totalOutstanding, 'fr', true)} icon={HandCoins} tone="warning" /><Metric label={t('finance', 'active')} value={formatNumber(loans.filter((l) => l.status === 'active').length)} icon={TrendingUp} tone="success" /></div><FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} filters={<select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('finance', 'status')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('finance', 'allStatuses')}</option><option value="pending">{t('finance', 'pending')}</option><option value="active">{t('finance', 'active')}</option><option value="repaid">{t('finance', 'repaid')}</option><option value="defaulted">{t('finance', 'defaulted')}</option></select>} /><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={CreditCard} title={t('finance', 'noLoans')} />} /></Page>;
}

function LoanCreate({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const [borrower, setBorrower] = useState(''); const [principal, setPrincipal] = useState(''); const [interestRate, setInterestRate] = useState('12'); const [maturityDate, setMaturityDate] = useState(''); const [monthlyPayment, setMonthlyPayment] = useState('');
  const [errors, setErrors] = useState<{ borrower?: string; principal?: string }>({});
  const mutation = useMockMutation<Awaited<ReturnType<typeof creditService.createLoan>>, LoanInput>({
    mutationFn: (input) => creditService.createLoan(input),
    invalidateKeys: [queryKeys.credit.loans(currentTenant.id)],
    onSuccess: (loan) => { notify.success(t('finance', 'loanCreated')); navigate(`/finance/credit/loans/${loan.id}`); },
  });
  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!borrower.trim()) nextErrors.borrower = t('finance', 'fieldRequired');
    if (!principal || Number(principal) <= 0) nextErrors.principal = t('finance', 'fieldRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const principalValue = Number(principal); const rateValue = Number(interestRate) || 0;
    const interestAmount = Math.round(principalValue * (rateValue / 100));
    mutation.mutate({ tenantId: currentTenant.id, tenantName: currentTenant.name, memberId: '', applicationId: '', borrower, principal: principalValue, interestRate: rateValue, interestAmount, totalRepayable: principalValue + interestAmount, maturityDate, monthlyPayment: Number(monthlyPayment) || 0, nextPaymentDate: maturityDate });
  };
  return <Page title={t('finance', 'createLoan')} description={t('finance', 'loansDescription')} actions={<Back label={t('finance', 'backToLoans')} />}><div className="grid gap-5 lg:grid-cols-2"><FormSection title={t('finance', 'general')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="loan-borrower">{t('finance', 'borrower')}</Label><Input id="loan-borrower" value={borrower} onChange={(event) => setBorrower(event.target.value)} aria-invalid={Boolean(errors.borrower)} /><FieldError message={errors.borrower} /></div><div className="space-y-2"><Label htmlFor="loan-principal">{t('finance', 'principal')}</Label><Input id="loan-principal" type="number" inputMode="decimal" value={principal} onChange={(event) => setPrincipal(event.target.value)} aria-invalid={Boolean(errors.principal)} /><FieldError message={errors.principal} /></div><div className="space-y-2"><Label htmlFor="loan-interest-rate">{t('finance', 'interestRate')}</Label><Input id="loan-interest-rate" type="number" inputMode="decimal" value={interestRate} onChange={(event) => setInterestRate(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="loan-maturity-date">{t('finance', 'maturityDate')}</Label><Input id="loan-maturity-date" type="date" value={maturityDate} onChange={(event) => setMaturityDate(event.target.value)} /></div></div></FormSection><FormSection title={t('finance', 'financialSummary')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="loan-monthly-payment">{t('finance', 'monthlyPayment')}</Label><Input id="loan-monthly-payment" type="number" inputMode="decimal" value={monthlyPayment} onChange={(event) => setMonthlyPayment(event.target.value)} /></div></div></FormSection><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => navigate('/finance/credit/loans')}>{t('finance', 'cancel')}</Button><Button disabled={mutation.isPending} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : t('finance', 'save')}</Button></div></div></Page>;
}

function LoanDetail({ t }: { t: T }) {
  const { id = '' } = useParams(); const { currentTenant } = useTenant(); const [confirmClose, setConfirmClose] = useState(false);
  const { data: loan, isLoading, isError, refetch } = useQuery({ queryKey: [...queryKeys.credit.loan(id), currentTenant.id], queryFn: () => creditService.getLoan(currentTenant.id, id) });
  const { data: loanRepayments = [] } = useQuery({ queryKey: [...queryKeys.credit.repaymentsByLoan(id), currentTenant.id], queryFn: () => creditService.listRepaymentsByLoan(currentTenant.id, id), enabled: Boolean(loan) });
  const { data: loanGuarantors = [] } = useQuery({ queryKey: [...queryKeys.credit.guarantorsByLoan(id), currentTenant.id], queryFn: () => creditService.listGuarantorsByLoan(currentTenant.id, id), enabled: Boolean(loan) });
  const closeMutation = useMockMutation<Awaited<ReturnType<typeof creditService.closeLoan>>, void>({
    mutationFn: () => creditService.closeLoan(currentTenant.id, id),
    invalidateKeys: [queryKeys.credit.loan(id), queryKeys.credit.loans(currentTenant.id)],
    onSuccess: () => { notify.success(t('finance', 'loanClosed')); setConfirmClose(false); },
  });
  if (isLoading) return <Page title={t('finance', 'loanDetail')} description=""><DetailSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'loanDetail')} description=""><ErrorState onRetry={refetch} /></Page>;
  if (!loan) return <NotFoundPage />;
  const tabs = [{ key: 'overview', label: t('finance', 'overview') }, { key: 'financial', label: t('finance', 'financialSummary') }, { key: 'repayments', label: t('finance', 'repayments') }, { key: 'guarantors', label: t('finance', 'guarantors') }, { key: 'penalties', label: t('finance', 'penalties') }, { key: 'documents', label: t('finance', 'documents') }, { key: 'activity', label: t('finance', 'activity') }];
  return <Page title={`${loan.id} - ${loan.borrower}`} description={loan.tenantName} actions={<><Back label={t('finance', 'backToLoans')} />{loan.status === 'active' && loan.outstanding === 0 && <PermissionGate permission="loans.approve"><Button onClick={() => setConfirmClose(true)}><Check size={15} />{t('finance', 'closeLoan')}</Button></PermissionGate>}<Button variant="outline"><FileText size={15} />{t('finance', 'contract')}</Button></>}>{confirmClose && <ConfirmDialog open title={t('finance', 'closeLoan')} description={t('finance', 'closeLoanConfirm')} confirmLabel={t('finance', 'confirm')} cancelLabel={t('finance', 'cancel')} onConfirm={() => closeMutation.mutate()} onCancel={() => setConfirmClose(false)} />}<Tabs defaultValue="overview" className="min-w-0"><TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">{tabs.map((tab) => <TabsTrigger key={tab.key} value={tab.key}>{tab.label}</TabsTrigger>)}</TabsList><TabsContent value="overview"><div className="grid gap-4 sm:grid-cols-3"><Metric label={t('finance', 'principal')} value={formatFCFA(loan.principal, 'fr', true)} icon={Banknote} /><Metric label={t('finance', 'outstanding')} value={formatFCFA(loan.outstanding, 'fr', true)} icon={HandCoins} tone="warning" /><Metric label={t('finance', 'progress')} value={`${loan.progress}%`} icon={TrendingUp} tone="success" /></div><Card className="mt-4"><CardContent className="space-y-4 p-5"><Info label={t('finance', 'borrower')} value={loan.borrower} icon={UserCheck} /><Info label={t('finance', 'monthlyPayment')} value={formatFCFA(loan.monthlyPayment)} icon={CalendarClock} /><Info label={t('finance', 'nextPayment')} value={<DateDisplay value={loan.nextPaymentDate} />} icon={Clock3} /><Info label={t('finance', 'lastPayment')} value={<DateDisplay value={loan.lastPaymentDate} />} icon={Check} /><StatusBadge label={t('finance', loan.status)} tone={tone[loan.status]} /></CardContent></Card></TabsContent><TabsContent value="financial"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Metric label={t('finance', 'principal')} value={formatFCFA(loan.principal)} icon={Banknote} /><Metric label={t('finance', 'interestAmount')} value={formatFCFA(loan.interestAmount)} icon={TrendingUp} /><Metric label={t('finance', 'totalRepayable')} value={formatFCFA(loan.totalRepayable)} icon={Landmark} tone="success" /><Metric label={t('finance', 'paidAmount')} value={formatFCFA(loan.paidAmount)} icon={Check} tone="success" /><Metric label={t('finance', 'remainingAmount')} value={formatFCFA(loan.outstanding)} icon={HandCoins} tone="warning" /><Metric label={t('finance', 'interestRate')} value={`${loan.interestRate}%`} icon={TrendingUp} /><Metric label={t('finance', 'totalInterest')} value={formatFCFA(loan.interestAmount)} icon={TrendingUp} /><Metric label={t('finance', 'totalPenalties')} value={formatFCFA(loan.penalties.reduce((s, p) => s + (p.status === 'applied' ? p.amount : 0), 0))} icon={Clock3} tone="warning" /><Metric label={t('finance', 'expectedReturn')} value={`${loan.interestRate}%`} icon={BarChart3} /></div></TabsContent><TabsContent value="repayments"><DataTable columns={[{ key: 'id', header: t('finance', 'repaymentId'), render: (row: typeof loanRepayments[number]) => <span className="font-mono text-xs font-semibold">{row.id}</span> }, { key: 'paymentDate', header: t('finance', 'paidOn'), render: (row: typeof loanRepayments[number]) => <DateDisplay value={row.paymentDate} /> }, { key: 'amount', header: t('finance', 'amount'), render: (row) => <MoneyDisplay amount={row.amount} /> }, { key: 'principalPart', header: t('finance', 'principalPart'), render: (row) => <MoneyDisplay amount={row.principalPart} /> }, { key: 'interestPart', header: t('finance', 'interestPart'), render: (row) => <MoneyDisplay amount={row.interestPart} /> }, { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', row.status)} tone={tone[row.status]} /> }] as TableColumn<typeof loanRepayments[number]>[]} rows={loanRepayments} empty={<EmptyState icon={HandCoins} title={t('finance', 'noRepayments')} />} /></TabsContent><TabsContent value="guarantors"><div className="grid gap-4 sm:grid-cols-2">{loanGuarantors.map((g) => <Card key={g.id}><CardContent className="flex items-center gap-3 p-4"><Avatar name={g.guarantorName} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{g.guarantorName}</p><p className="text-xs text-muted-foreground">{g.relation}</p></div><div className="text-right"><p className="text-sm font-semibold"><MoneyDisplay amount={g.guaranteedAmount} /></p></div></CardContent></Card>)}{loanGuarantors.length === 0 && <EmptyState icon={ShieldCheck} title={t('finance', 'noGuarantors')} />}</div></TabsContent><TabsContent value="penalties"><div className="space-y-3">{loan.penalties.map((p) => <Card key={p.id}><CardContent className="flex items-center gap-4 p-4"><span className="grid size-9 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"><Clock3 size={17} /></span><div className="flex-1"><p className="text-sm font-semibold"><MoneyDisplay amount={p.amount} /></p><p className="text-xs text-muted-foreground">{p.reason} - <DateDisplay value={p.date} /></p></div><StatusBadge label={t('finance', p.status)} tone={tone[p.status]} /></CardContent></Card>)}{loan.penalties.length === 0 && <EmptyState icon={Clock3} title={t('finance', 'noPenalties')} />}</div></TabsContent><TabsContent value="documents"><DataTable columns={[{ key: 'name', header: t('finance', 'documentName'), render: (row: typeof loan.documents[number]) => <span className="flex items-center gap-2 font-medium"><FileText size={15} className="text-primary" />{row.name}</span> }, { key: 'type', header: t('finance', 'documentType'), render: (row) => t('finance', row.type) }, { key: 'uploadedAt', header: t('finance', 'uploaded'), render: (row) => <DateDisplay value={row.uploadedAt} /> }] as TableColumn<typeof loan.documents[number]>[]} rows={loan.documents} empty={<EmptyState icon={FileText} title={t('finance', 'noDocuments')} />} /></TabsContent><TabsContent value="activity"><Card><CardContent className="p-5"><Timeline items={loan.activities.map((a) => ({ id: a.id, title: a.type, description: a.description, date: new Date(a.date).toLocaleDateString('fr-FR') }))} /></CardContent></Card></TabsContent></Tabs></Page>;
}

function RepaymentsList({ t }: { t: T }) {
  const { currentTenant } = useTenant(); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [createOpen, setCreateOpen] = useState(false);
  const { data: repayments = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.credit.repayments(currentTenant.id), queryFn: () => creditService.listRepayments(currentTenant.id) });
  const { data: loans = [] } = useQuery({ queryKey: queryKeys.credit.loans(currentTenant.id), queryFn: () => creditService.listLoans(currentTenant.id) });
  const [form, setForm] = useState({ loanId: '', paymentDate: '', principalPart: '', interestPart: '', status: 'completed' as RepaymentInput['status'] });
  const mutation = useMockMutation<Awaited<ReturnType<typeof creditService.createRepayment>>, RepaymentInput>({
    mutationFn: (input) => creditService.createRepayment(currentTenant.id, input),
    invalidateKeys: [queryKeys.credit.repayments(currentTenant.id), queryKeys.credit.loans(currentTenant.id)],
    onSuccess: () => { notify.success(t('finance', 'repaymentCreated')); setCreateOpen(false); setForm({ loanId: '', paymentDate: '', principalPart: '', interestPart: '', status: 'completed' }); },
  });
  const filtered = repayments.filter((r) => `${r.borrower} ${r.loanId} ${r.id}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || r.status === status));
  if (isLoading) return <Page title={t('finance', 'repaymentsTitle')} description={t('finance', 'repaymentsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'repaymentsTitle')} description={t('finance', 'repaymentsDescription')}><ErrorState onRetry={refetch} /></Page>;
  const totalPaid = repayments.filter((r) => r.status === 'completed').reduce((s, r) => s + r.amount, 0);
  const columns: TableColumn<typeof repayments[number]>[] = [
    { key: 'id', header: t('finance', 'repaymentId'), render: (row) => <span className="font-mono text-xs font-semibold">{row.id}</span> },
    { key: 'loanId', header: t('finance', 'loanRef'), render: (row) => <span className="font-mono text-xs">{row.loanId}</span> },
    { key: 'borrower', header: t('finance', 'borrower'), render: (row) => <span className="flex items-center gap-2"><Avatar name={row.borrower} /><span className="font-medium">{row.borrower}</span></span> },
    { key: 'paymentDate', header: t('finance', 'paidOn'), render: (row) => <DateDisplay value={row.paymentDate} /> },
    { key: 'amount', header: t('finance', 'amount'), render: (row) => <MoneyDisplay amount={row.amount} /> },
    { key: 'status', header: t('finance', 'status'), render: (row) => <StatusBadge label={t('finance', row.status)} tone={tone[row.status]} /> },
  ];
  return <Page title={t('finance', 'repaymentsTitle')} description={t('finance', 'repaymentsDescription')} actions={<PermissionGate permission="repayments.create"><Button onClick={() => setCreateOpen(true)}><Plus size={16} />{t('finance', 'createRepayment')}</Button></PermissionGate>}><div className="grid gap-4 sm:grid-cols-3"><Metric label={t('finance', 'paidAmount')} value={formatFCFA(totalPaid, 'fr', true)} icon={HandCoins} tone="success" /><Metric label={t('finance', 'repayments')} value={formatNumber(repayments.length)} icon={CreditCard} /><Metric label={t('finance', 'late')} value={formatNumber(repayments.filter((r) => r.status === 'late').length)} icon={Clock3} tone="warning" /></div><FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} filters={<select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('finance', 'status')} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">{t('finance', 'allStatuses')}</option><option value="completed">{t('finance', 'completed')}</option><option value="scheduled">{t('finance', 'scheduled')}</option><option value="late">{t('finance', 'late')}</option></select>} /><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={HandCoins} title={t('finance', 'noRepayments')} />} />
    {createOpen && <ConfirmDialog open title={t('finance', 'createRepayment')} confirmLabel={t('finance', 'save')} cancelLabel={t('finance', 'cancel')} onConfirm={() => { if (!form.loanId) return; mutation.mutate({ loanId: form.loanId, paymentDate: form.paymentDate, principalPart: Number(form.principalPart) || 0, interestPart: Number(form.interestPart) || 0, status: form.status }); }} onCancel={() => setCreateOpen(false)}>
      <div className="mt-4 space-y-3 text-left">
        <div className="space-y-1"><Label htmlFor="repayment-loan">{t('finance', 'selectLoan')}</Label><select id="repayment-loan" value={form.loanId} onChange={(e) => setForm((v) => ({ ...v, loanId: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">{t('finance', 'selectLoan')}</option>{loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.id} - {loan.borrower}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="repayment-date">{t('finance', 'paidOn')}</Label><Input id="repayment-date" type="date" value={form.paymentDate} onChange={(e) => setForm((v) => ({ ...v, paymentDate: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor="repayment-principal">{t('finance', 'principalPart')}</Label><Input id="repayment-principal" type="number" inputMode="decimal" value={form.principalPart} onChange={(e) => setForm((v) => ({ ...v, principalPart: e.target.value }))} /></div><div className="space-y-1"><Label htmlFor="repayment-interest">{t('finance', 'interestPart')}</Label><Input id="repayment-interest" type="number" inputMode="decimal" value={form.interestPart} onChange={(e) => setForm((v) => ({ ...v, interestPart: e.target.value }))} /></div></div>
        <div className="space-y-1"><Label htmlFor="repayment-status">{t('finance', 'status')}</Label><select id="repayment-status" value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value as RepaymentInput['status'] }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="completed">{t('finance', 'completed')}</option><option value="scheduled">{t('finance', 'scheduled')}</option><option value="late">{t('finance', 'late')}</option></select></div>
      </div>
    </ConfirmDialog>}
  </Page>;
}

function GuarantorsList({ t }: { t: T }) {
  const { currentTenant } = useTenant(); const [search, setSearch] = useState(''); const [createOpen, setCreateOpen] = useState(false);
  const { data: guarantors = [], isLoading, isError, refetch } = useQuery({ queryKey: queryKeys.credit.guarantors(currentTenant.id), queryFn: () => creditService.listGuarantors(currentTenant.id) });
  const { data: loans = [] } = useQuery({ queryKey: queryKeys.credit.loans(currentTenant.id), queryFn: () => creditService.listLoans(currentTenant.id) });
  const [form, setForm] = useState({ loanId: '', guarantorName: '', guaranteedAmount: '', relation: '' });
  const mutation = useMockMutation<Awaited<ReturnType<typeof creditService.createGuarantor>>, GuarantorInput>({
    mutationFn: (input) => creditService.createGuarantor(currentTenant.id, input),
    invalidateKeys: [queryKeys.credit.guarantors(currentTenant.id)],
    onSuccess: () => { notify.success(t('finance', 'guarantorCreated')); setCreateOpen(false); setForm({ loanId: '', guarantorName: '', guaranteedAmount: '', relation: '' }); },
  });
  const filtered = guarantors.filter((g) => `${g.guarantorName} ${g.borrowerName} ${g.loanId}`.toLowerCase().includes(search.toLowerCase()));
  if (isLoading) return <Page title={t('finance', 'guarantorsTitle')} description={t('finance', 'guarantorsDescription')}><TableSkeleton /></Page>;
  if (isError) return <Page title={t('finance', 'guarantorsTitle')} description={t('finance', 'guarantorsDescription')}><ErrorState onRetry={refetch} /></Page>;
  const totalGuaranteed = guarantors.reduce((s, g) => s + g.guaranteedAmount, 0);
  const columns: TableColumn<typeof guarantors[number]>[] = [
    { key: 'id', header: 'ID', render: (row) => <span className="font-mono text-xs font-semibold">{row.id}</span> },
    { key: 'guarantorName', header: t('finance', 'guarantorName'), render: (row) => <span className="flex items-center gap-2"><Avatar name={row.guarantorName} /><span className="font-medium">{row.guarantorName}</span></span> },
    { key: 'borrowerName', header: t('finance', 'borrower') },
    { key: 'loanId', header: t('finance', 'loanRef'), render: (row) => <span className="font-mono text-xs">{row.loanId}</span> },
    { key: 'guaranteedAmount', header: t('finance', 'guaranteedAmount'), render: (row) => <MoneyDisplay amount={row.guaranteedAmount} /> },
    { key: 'relation', header: t('finance', 'relation') },
  ];
  return <Page title={t('finance', 'guarantorsTitle')} description={t('finance', 'guarantorsDescription')} actions={<PermissionGate permission="guarantors.create"><Button onClick={() => setCreateOpen(true)}><Plus size={16} />{t('finance', 'createGuarantor')}</Button></PermissionGate>}><div className="grid gap-4 sm:grid-cols-2"><Metric label={t('finance', 'guarantors')} value={formatNumber(guarantors.length)} icon={ShieldCheck} /><Metric label={t('finance', 'guaranteedAmount')} value={formatFCFA(totalGuaranteed, 'fr', true)} icon={HandCoins} tone="warning" /></div><FilterBar search={search} onSearchChange={setSearch} placeholder={t('finance', 'searchTransaction')} /><DataTable columns={columns} rows={filtered} empty={<EmptyState icon={ShieldCheck} title={t('finance', 'noGuarantors')} />} />
    {createOpen && <ConfirmDialog open title={t('finance', 'createGuarantor')} confirmLabel={t('finance', 'save')} cancelLabel={t('finance', 'cancel')} onConfirm={() => { if (!form.loanId || !form.guarantorName.trim()) return; mutation.mutate({ loanId: form.loanId, guarantorName: form.guarantorName, guaranteedAmount: Number(form.guaranteedAmount) || 0, relation: form.relation }); }} onCancel={() => setCreateOpen(false)}>
      <div className="mt-4 space-y-3 text-left">
        <div className="space-y-1"><Label htmlFor="guarantor-loan">{t('finance', 'selectLoan')}</Label><select id="guarantor-loan" value={form.loanId} onChange={(e) => setForm((v) => ({ ...v, loanId: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">{t('finance', 'selectLoan')}</option>{loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.id} - {loan.borrower}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="guarantor-name">{t('finance', 'guarantorName')}</Label><Input id="guarantor-name" value={form.guarantorName} onChange={(e) => setForm((v) => ({ ...v, guarantorName: e.target.value }))} /></div>
        <div className="space-y-1"><Label htmlFor="guarantor-amount">{t('finance', 'guaranteedAmount')}</Label><Input id="guarantor-amount" type="number" inputMode="decimal" value={form.guaranteedAmount} onChange={(e) => setForm((v) => ({ ...v, guaranteedAmount: e.target.value }))} /></div>
        <div className="space-y-1"><Label htmlFor="guarantor-relation">{t('finance', 'relation')}</Label><Input id="guarantor-relation" value={form.relation} onChange={(e) => setForm((v) => ({ ...v, relation: e.target.value }))} /></div>
      </div>
    </ConfirmDialog>}
  </Page>;
}

export function FinanceModule() {
  const { t } = useLocale();
  return (
    <Routes>
      <Route index element={<Navigate to="accounts" replace />} />
      <Route path="accounts" element={<AccountsList t={t} />} />
      <Route path="accounts/create" element={<AccountCreate t={t} />} />
      <Route path="accounts/:id" element={<AccountDetail t={t} />} />
      <Route path="transactions" element={<TransactionsList t={t} />} />
      <Route path="contributions" element={<ContributionsView t={t} />} />
      <Route path="distributions" element={<DistributionsList t={t} />} />
      <Route path="distributions/create" element={<DistributionCreate t={t} />} />
      <Route path="credit/applications" element={<ApplicationsList t={t} />} />
      <Route path="credit/applications/create" element={<ApplicationCreate t={t} />} />
      <Route path="credit/applications/:id" element={<ApplicationDetail t={t} />} />
      <Route path="credit/loans" element={<LoansList t={t} />} />
      <Route path="credit/loans/create" element={<LoanCreate t={t} />} />
      <Route path="credit/loans/:id" element={<LoanDetail t={t} />} />
      <Route path="credit/repayments" element={<RepaymentsList t={t} />} />
      <Route path="credit/guarantors" element={<GuarantorsList t={t} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
