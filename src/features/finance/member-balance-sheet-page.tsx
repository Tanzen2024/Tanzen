import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { useFiscalYear } from '@/contexts/fiscal-year-context';
import { defaultTenantBranding, useTheme } from '@/contexts/theme-context';
import { formatDate, formatNumber } from '@/lib/utils';
import { getCurrencyDecimals, getCurrencyDisplayLabel } from '@/constants/currencies';
import { useOrganizationCurrency } from '@/hooks/use-organization-currency';
import { defaultBalancePeriod, INTEREST_PERIOD, type MemberPeriodStatement, type StatementLine } from '@/lib/finance';
import type { LoanPenaltyType, LoanRuleLoanMode } from '@/mocks/finance/loan-rules';
import type { Tenant } from '@/mocks/organization/tenants';
import type { Member } from '@/mocks/organization/members';
import { fiscalYearLabel } from '@/mocks/settings/fiscal-years';
import { subcategoryLabelKey, type TransactionSubcategory } from '@/mocks/finance/transaction-classification';
import { financePositionService } from '@/services/finance-position.service';
import { financeService } from '@/services/finance.service';
import { organizationService } from '@/services/organization.service';
import { queryKeys } from '@/services/query-keys';
import { Page, type T } from './finance-module';

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

type CreditRuleInfo = { loanMode: LoanRuleLoanMode; interestRate: number; interestApplicable: boolean };
type DocumentContext = {
  t: T;
  tenant: Tenant;
  logo: string | null;
  primaryColor: string;
  fiscalYear: string;
  cashboxLabel: string;
  issuedOn: string;
  currencyLabel: string;
  amount: (value: number) => string;
  /** Taux / pourcentage au format régional (jamais d'arrondi silencieux au-delà de 3 décimales). */
  percent: (value: number) => string;
  cashboxTitleOf: Map<string, string>;
  creditRule: CreditRuleInfo;
  periodLabel: (line: StatementLine) => ReactNode;
};

/**
 * BILAN FINANCIER DE L'ADHÉRENT (refonte du 2026-09-28) — un RELEVÉ individuel par adhérent, conçu
 * pour l'impression A4 / PDF (impression navigateur, même mécanisme que la fiche membre) :
 * charte de l'association, identification, état financier MENSUEL (intérêts et pénalités de retard
 * dans deux colonnes distinctes), synthèse. Plusieurs / tous les adhérents = succession de relevés,
 * chacun sur une nouvelle page. L'exercice n'est JAMAIS choisi ici : il vient du header
 * (`useFiscalYear`). Aucun calcul dans ce fichier : tout vient de `@/lib/finance/member-balance-sheet`.
 */
export function MemberBalanceSheetPage({ t }: { t: T }) {
  const { currentTenant } = useTenant();
  const { currentFiscalYear, isLoading: fiscalYearLoading } = useFiscalYear();
  const { branding } = useTheme();
  const { locale } = useLocale();
  const currency = useOrganizationCurrency();

  const [mode, setMode] = useState<'ALL' | 'SELECTION'>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [cashboxId, setCashboxId] = useState('');
  const [period, setPeriod] = useState(() => defaultBalancePeriod(currentFiscalYear));

  // Exercice du header : ses bornes redeviennent la période par défaut à chaque changement. Son premier
  // chargement (asynchrone) n'écrase jamais une période déjà saisie par l'utilisateur.
  const lastFiscalYearId = useRef(currentFiscalYear?.id ?? null);
  const periodTouched = useRef(false);
  useEffect(() => {
    const id = currentFiscalYear?.id ?? null;
    if (id === lastFiscalYearId.current) return;
    const initialLoad = lastFiscalYearId.current === null;
    lastFiscalYearId.current = id;
    if (initialLoad && periodTouched.current) return;
    periodTouched.current = false;
    setPeriod(defaultBalancePeriod(currentFiscalYear));
  }, [currentFiscalYear?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const setBound = (bound: 'from' | 'to', value: string) => { periodTouched.current = true; setPeriod((current) => ({ ...current, [bound]: value })); };

  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { data: cashboxes = [] } = useQuery({ queryKey: queryKeys.finance.cashboxes(currentTenant.id), queryFn: () => financeService.listCashboxes(currentTenant.id) });
  const { data: tenantDetail } = useQuery({ queryKey: queryKeys.tenants.detail(currentTenant.id), queryFn: () => organizationService.getTenant(currentTenant.id, currentTenant.id) });
  const memberOf = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const validPeriod = Boolean(period.from && period.to) && period.from <= period.to;
  const hasSelection = mode === 'ALL' || selectedIds.length > 0;
  const selectionKey = mode === 'ALL' ? 'ALL' : [...selectedIds].sort().join(',');
  // Aucun calcul sur une période inversée ; on attend l'exercice (pas de `keepPreviousData`, convention Finance).
  const ready = validPeriod && !fiscalYearLoading;
  // UNE requête pour tous les adhérents demandés (contexte indexé une seule fois côté moteur, aucun N+1).
  const { data, isFetching } = useQuery({
    queryKey: queryKeys.finance.position.memberPeriodStatements(currentTenant.id, selectionKey, period.from, period.to, cashboxId, false, 'statement'),
    queryFn: () => financePositionService.memberPeriodStatements(currentTenant.id, { memberIds: mode === 'ALL' ? 'ALL' : selectedIds, from: period.from, to: period.to, cashboxId: cashboxId || undefined, withMonths: false, withLines: true }),
    enabled: ready && hasSelection,
  });

  const sortName = (member: Member | undefined, fallback: string) => (member ? `${member.lastName} ${member.firstName}` : fallback);
  const statements = useMemo(() => (data?.statements ?? [])
    .map((statement) => ({ statement, member: memberOf.get(statement.memberId) }))
    .sort((a, b) => sortName(a.member, a.statement.memberId).localeCompare(sortName(b.member, b.statement.memberId))), [data, memberOf]);
  const visibleMembers = members.filter((member) => `${member.firstName} ${member.lastName}`.toLowerCase().includes(search.toLowerCase()));

  const tenant = tenantDetail ?? currentTenant;
  const decimals = getCurrencyDecimals(currency);
  const context: DocumentContext | null = data ? {
    t,
    tenant,
    // Le logo par défaut est celui de TANZEN, pas celui de l'association : on ne l'affiche que s'il a été configuré.
    logo: branding.logoLight && branding.logoLight !== defaultTenantBranding.logoLight ? branding.logoLight : null,
    primaryColor: branding.primaryColor,
    fiscalYear: currentFiscalYear ? fiscalYearLabel(currentFiscalYear) : '—',
    cashboxLabel: cashboxId ? cashboxes.find((cashbox) => cashbox.id === cashboxId)?.title ?? '—' : t('finance', 'mbAllCashboxes'),
    issuedOn: formatDate(new Date().toISOString().slice(0, 10)),
    currencyLabel: getCurrencyDisplayLabel(currency),
    amount: (value: number) => {
      const factor = 10 ** decimals;
      const rounded = Math.round(value * factor) / factor;
      return rounded === 0 ? '—' : formatNumber(rounded);
    },
    percent: (value: number) => formatNumber(value),
    cashboxTitleOf: new Map(cashboxes.map((cashbox) => [cashbox.id, cashbox.title])),
    creditRule: data.creditRule,
    periodLabel: (line) => periodLabel(line, locale),
  } : null;

  const printable = Boolean(context && statements.length > 0);
  return <Page title={t('finance', 'memberBalancesTitle')} description={t('finance', 'memberBalancesDescription')} actions={<Button variant="outline" onClick={() => window.print()} disabled={!printable || isFetching}><Printer size={15} />{t('finance', 'mbPrint')}</Button>}>
    <div className="space-y-4 print:hidden">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2"><Label htmlFor="mb-members">{t('finance', 'mbMembersFilter')}</Label>
          <select id="mb-members" value={mode} onChange={(event) => setMode(event.target.value as 'ALL' | 'SELECTION')} className={selectClass}>
            <option value="ALL">{t('finance', 'mbAllMembers')}</option>
            <option value="SELECTION">{t('finance', 'mbSelectedMembers')}</option>
          </select>
        </div>
        <div className="space-y-2"><Label htmlFor="mb-from">{t('finance', 'mbFrom')}</Label>
          <Input id="mb-from" type="date" value={period.from} onChange={(event) => setBound('from', event.target.value)} aria-invalid={!validPeriod} aria-describedby={validPeriod ? undefined : 'mb-period-error'} />
        </div>
        <div className="space-y-2"><Label htmlFor="mb-to">{t('finance', 'mbTo')}</Label>
          <Input id="mb-to" type="date" value={period.to} onChange={(event) => setBound('to', event.target.value)} aria-invalid={!validPeriod} aria-describedby={validPeriod ? undefined : 'mb-period-error'} />
        </div>
        <div className="space-y-2"><Label htmlFor="mb-cashbox">{t('finance', 'mbCashboxFilter')}</Label>
          <select id="mb-cashbox" value={cashboxId} onChange={(event) => setCashboxId(event.target.value)} className={selectClass}>
            <option value="">{t('finance', 'mbAllCashboxes')}</option>
            {cashboxes.map((cashbox) => <option key={cashbox.id} value={cashbox.id}>{cashbox.title}</option>)}
          </select>
        </div>
      </div>
      {!validPeriod && <p id="mb-period-error" role="alert" className="text-sm text-destructive">{t('finance', 'mbInvalidPeriod')}</p>}
      {mode === 'SELECTION' && <div className="space-y-2" data-testid="mb-member-picker">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('finance', 'mbSearchMember')} aria-label={t('finance', 'mbSearchMember')} className="max-w-xs" />
          <span className="text-xs text-muted-foreground">{t('finance', 'mbSelectedCount', { count: String(selectedIds.length) })}</span>
        </div>
        <div className="grid max-h-56 gap-x-4 gap-y-1 overflow-y-auto rounded-lg border border-border px-3 py-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleMembers.map((member) => <label key={member.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
            <Checkbox checked={selectedIds.includes(member.id)} onCheckedChange={(value) => setSelectedIds((current) => (value ? [...current, member.id] : current.filter((id) => id !== member.id)))} aria-label={`${member.firstName} ${member.lastName}`} />
            {member.firstName} {member.lastName}
          </label>)}
        </div>
      </div>}
      {validPeriod && !hasSelection && <p className="border-t border-border pt-6 text-sm text-muted-foreground">{t('finance', 'mbNoMemberSelected')}</p>}
      {printable && <p className="border-t border-border pt-4 text-xs text-muted-foreground">{t('finance', 'mbStatementCount', { count: String(statements.length) })}</p>}
    </div>

    {validPeriod && hasSelection && !context && <p className="text-sm text-muted-foreground print:hidden">{t('finance', 'mbPreparing')}</p>}
    {validPeriod && hasSelection && context && <div id="mb-print-area" data-testid="mb-documents" className="space-y-6 print:space-y-0">
      <PrintStyles associationName={tenant.name} documentTitle={t('finance', 'mbDocumentTitle')} />
      {statements.map(({ statement, member }, index) => <MemberStatementDocument key={statement.memberId} ctx={context} statement={statement} member={member} index={index} total={statements.length} />)}
    </div>}
  </Page>;
}

/** Libellé d'une ligne du relevé : toujours un mois civil (intérêts mensuels, `INTEREST_PERIOD`). */
function periodLabel(line: StatementLine, locale: string): ReactNode {
  return new Date(`${line.start}T00:00:00Z`).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Règles d'impression A4 : seul le document est imprimé (le reste de l'application — header, sidebar,
 * filtres — est retiré du flux, ses conteneurs de défilement neutralisés pour que le relevé s'écoule
 * sur plusieurs pages), un adhérent = une nouvelle page, en-tête de tableau répété, lignes jamais coupées,
 * pagination dans la marge basse. Même principe que la fiche membre (`organization-module`), sans
 * positionnement absolu, qui empêcherait les sauts de page.
 */
function PrintStyles({ associationName, documentTitle }: { associationName: string; documentTitle: string }) {
  const cssString = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;
  return <style>{`
@page { size: A4 portrait; margin: 14mm 13mm 16mm 13mm;
  @bottom-left { content: ${cssString(`${associationName} — ${documentTitle}`)}; font-size: 7pt; color: #6b7280; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font-size: 7pt; color: #6b7280; } }
@media print {
  html, body { background: #fff !important; }
  body *:not(:has(#mb-print-area)):not(#mb-print-area):not(#mb-print-area *) { display: none !important; }
  *:has(#mb-print-area) { display: block !important; position: static !important; overflow: visible !important; height: auto !important; min-height: 0 !important; max-height: none !important; width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; background: #fff !important; transform: none !important; }
  .mb-statement + .mb-statement { break-before: page; }
  .mb-paper { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; }
  .mb-table thead { display: table-header-group; }
  .mb-table tfoot { display: table-row-group; }
  .mb-table tr, .mb-keep { break-inside: avoid; }
  .mb-head { break-after: avoid; }
  .mb-accent { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}`}</style>;
}

function MemberStatementDocument({ ctx, statement, member, index, total }: { ctx: DocumentContext; statement: MemberPeriodStatement; member: Member | undefined; index: number; total: number }) {
  const { t, amount, creditRule } = ctx;
  const { end, movements, opening: openingPosition, closing } = statement;
  const lines = end.lines ?? [];
  const displayName = member ? `${member.lastName.toUpperCase()} ${member.firstName}` : statement.memberId;
  // Intérêts : affichés si la règle de crédit en produit, ou si l'adhérent en a réellement généré ou reçu.
  const showInterest = creditRule.interestApplicable || movements.interestAccrued !== 0 || end.interestLines.length > 0 || end.gainLines.length > 0 || movements.gains !== 0;
  // Pénalités (règle d'affichage définitive) : colonne, synthèse et détail DISTINCTS des intérêts, présents dès qu'AU MOINS
  // UN prêt du relevé a la pénalité ACTIVÉE (`penaltyEnabled` historisé), même à 0 sur la période ; totalement absents sinon.
  const showPenalties = end.loans.some((loan) => loan.penaltyEnabled);
  const currentLoans = end.loans.filter((loan) => loan.outstanding > 0);
  const otherMovements = Object.entries(movements.otherMovements) as [TransactionSubcategory, number][];
  const columns = [
    { key: 'savings', label: t('finance', 'mbColSavings') },
    ...(showInterest ? [{ key: 'gains', label: t('finance', 'mbColGains') }] : []),
    { key: 'savingsBalance', label: t('finance', 'mbColSavingsBalance') },
    { key: 'debtCarried', label: t('finance', 'mbColDebtCarried') },
    { key: 'loansDisbursed', label: t('finance', 'mbColLoans') },
    ...(showInterest ? [{ key: 'interest', label: t('finance', 'mbColInterest') }] : []),
    ...(showPenalties ? [{ key: 'penalties', label: t('finance', 'mbColPenalties') }] : []),
    { key: 'repayments', label: t('finance', 'mbColRepayment') },
    { key: 'debtRemaining', label: t('finance', 'mbColDebtRemaining') },
  ] as { key: keyof Omit<StatementLine, 'start' | 'end'>; label: string }[];
  const totals: Record<string, number | null> = {
    savings: movements.savingsDeposits - movements.withdrawals,
    gains: movements.gains,
    savingsBalance: closing.savings + closing.gains,
    debtCarried: null,
    loansDisbursed: movements.loansDisbursed,
    interest: movements.interestAccrued,
    penalties: movements.penaltiesAccrued,
    repayments: movements.repayments,
    debtRemaining: closing.debt,
  };
  const opening: Record<string, number | null> = { savingsBalance: openingPosition.savings + openingPosition.gains, debtRemaining: openingPosition.debt };
  const from = formatDate(statement.from);
  const to = formatDate(statement.to);
  const dayBeforeFrom = formatDate(new Date(Date.parse(`${statement.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
  const cell = 'border-b border-neutral-200 py-1.5 pl-2 text-right tabular-nums whitespace-nowrap';
  const textCell = 'border-b border-neutral-200 py-1.5 pr-2 align-top';
  const header = 'border-y border-neutral-300 text-[9px] uppercase tracking-wide text-neutral-600';
  const sectionTitle = 'mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500';

  // Paramètres RÉELLEMENT appliqués : ceux historisés sur chaque prêt de l'adhérent à son octroi ; sans prêt,
  // ceux de la règle de crédit en vigueur (qui s'appliquera à ses prochains prêts). Jamais un taux unique
  // trompeur : plusieurs jeux de paramètres → « Selon le prêt » et le détail prêt par prêt.
  const typeOf = (mode: LoanRuleLoanMode) => t('finance', 'mbInterestType' + mode);
  const rateOf = (rate: number) => `${ctx.percent(rate)} % ${t('finance', 'mbRatePer' + INTEREST_PERIOD)}`;
  const parameterSets = [...new Map(end.loans.map((loan) => [`${loan.loanMode}|${loan.rate}`, loan])).values()];
  const penaltyLabel = (type: LoanPenaltyType, value: number) => (type === 'FIXED' ? `${amount(value)} ${ctx.currencyLabel}` : `${ctx.percent(value)} %`);
  const mixed = parameterSets.length > 1;
  const typeLabel = !showInterest ? t('finance', 'mbNoInterest') : mixed ? t('finance', 'mbPerLoan') : typeOf(parameterSets[0]?.loanMode ?? creditRule.loanMode);
  const rateLabel = !showInterest ? '—' : mixed ? t('finance', 'mbPerLoan') : parameterSets[0] ? rateOf(parameterSets[0].rate) : rateOf(creditRule.interestRate);
  const cashboxesOf = (funding: { cashboxId: string }[]) => funding.map((item) => ctx.cashboxTitleOf.get(item.cashboxId) ?? item.cashboxId).join(', ') || '—';
  const loanById = new Map(end.loans.map((loan) => [loan.loanId, loan]));

  return <section className="mb-statement" data-testid="mb-statement" data-member-id={statement.memberId} aria-label={`${t('finance', 'mbDocumentTitle')} — ${displayName}`}>
    {index > 0 && <div className="mb-accent mb-3 flex items-center justify-center gap-3 text-[9px] font-medium uppercase tracking-[0.25em]" style={{ color: ctx.primaryColor }} aria-hidden="true">
      <span className="h-px w-16" style={{ backgroundColor: ctx.primaryColor, opacity: 0.4 }} />{t('finance', 'mbNextStatement', { index: String(index + 1), total: String(total) })}<span className="h-px w-16" style={{ backgroundColor: ctx.primaryColor, opacity: 0.4 }} />
    </div>}
    <div className="mb-paper mx-auto max-w-[210mm] rounded-sm bg-white px-[12mm] py-[11mm] text-[10.5px] leading-snug text-neutral-800 shadow-sm ring-1 ring-black/5 print:text-[8pt]">
      <div className="mb-head">
        <AssociationHeader ctx={ctx} compact={index > 0} />
        <h2 className="mt-4 text-center text-[13px] font-semibold uppercase tracking-[0.18em] text-neutral-900 print:text-[11pt]">{t('finance', 'mbDocumentTitle')}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-y border-neutral-200 py-2.5" data-testid="mb-identification">
          <Field label={t('finance', 'mbMemberLabel')} value={<span className="font-semibold text-neutral-900">{displayName}</span>} />
          <Field label={t('finance', 'mbPeriod')} value={<span className="font-semibold text-neutral-900">{from} → {to}</span>} />
          <Field label={t('finance', 'mbInterestType')} value={<span className="font-semibold text-neutral-900" data-testid="mb-interest-type">{typeLabel}</span>} />
          <Field label={t('finance', 'mbInterestRate')} value={<span className="font-semibold text-neutral-900" data-testid="mb-interest-rate">{rateLabel}</span>} />
          {showInterest && mixed && <div className="col-span-2 flex gap-2" data-testid="mb-interest-per-loan"><dt className="w-20 shrink-0 text-neutral-500">{t('finance', 'mbParametersPerLoan')}</dt><dd className="min-w-0 text-neutral-800">{parameterSets.map((loan) => `${loan.loanId} : ${typeOf(loan.loanMode)} — ${rateOf(loan.rate)}`).join(' · ')}</dd></div>}
          {member?.matricule && <Field label={t('finance', 'mbMatricule')} value={member.matricule} />}
          <Field label={t('finance', 'mbFiscalYear')} value={ctx.fiscalYear} />
          <Field label={t('finance', 'mbCashboxes')} value={ctx.cashboxLabel} />
        </dl>
      </div>

      <div className="mt-5">
        <div className="mb-head mb-1.5 flex items-baseline justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{t('finance', 'mbStatementTitle')}</h3>
          <span className="text-[9px] text-neutral-500">{t('finance', 'mbAmountsIn', { currency: ctx.currencyLabel })}</span>
        </div>
        <table className="mb-table w-full border-collapse" data-testid="mb-statement-table">
          <thead>
            <tr className="border-y border-neutral-400 text-[9px] uppercase tracking-wide text-neutral-600">
              <th scope="col" className="py-1.5 pr-2 text-left font-medium">{t('finance', 'mbColPeriod' + INTEREST_PERIOD)}</th>
              {columns.map((column) => <th key={column.key} scope="col" className="py-1.5 pl-2 text-right font-medium">{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="text-neutral-500 italic">
              <th scope="row" className="border-b border-neutral-200 py-1.5 pr-2 text-left font-normal">{t('finance', 'mbOpeningRow', { date: dayBeforeFrom })}</th>
              {columns.map((column) => <td key={column.key} className={cell}>{opening[column.key] === undefined || opening[column.key] === null ? '' : amount(opening[column.key]!)}</td>)}
            </tr>
            {lines.map((line) => <tr key={line.start}>
              <th scope="row" className="border-b border-neutral-200 py-1.5 pr-2 text-left font-normal capitalize">{ctx.periodLabel(line)}</th>
              {columns.map((column) => <td key={column.key} className={`${cell} ${column.key === 'savingsBalance' || column.key === 'debtRemaining' ? 'text-neutral-900' : 'text-neutral-700'}`}>{amount(line[column.key])}</td>)}
            </tr>)}
            {lines.length === 0 && <tr><td colSpan={columns.length + 1} className="border-b border-neutral-200 py-2 text-neutral-500">{t('finance', 'mbNoMovement')}</td></tr>}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-400 font-semibold text-neutral-900">
              <th scope="row" className="py-1.5 pr-2 text-left">{t('finance', 'mbTotalRow')}</th>
              {columns.map((column) => <td key={column.key} className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{totals[column.key] === null || totals[column.key] === undefined ? '' : amount(totals[column.key]!)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mb-keep mt-5" data-testid="mb-summary">
        <h3 className={sectionTitle}>{t('finance', 'mbSummaryTitle')}</h3>
        <div className="grid grid-cols-2 gap-x-8 border-t border-neutral-300">
          <dl>
            <SummaryLine label={t('finance', 'mbSavingsAt', { date: dayBeforeFrom })} value={amount(openingPosition.savings + openingPosition.gains)} />
            <SummaryLine label={t('finance', 'mbSavingsDeposits')} value={amount(movements.savingsDeposits)} />
            <SummaryLine label={t('finance', 'mbWithdrawals')} value={amount(movements.withdrawals)} />
            {showInterest && <SummaryLine label={t('finance', 'mbGainsReceived')} value={amount(movements.gains)} />}
            <SummaryLine label={t('finance', 'mbSavingsAt', { date: to })} value={amount(closing.savings + closing.gains)} strong />
          </dl>
          <dl>
            <SummaryLine label={t('finance', 'mbDebtAt', { date: dayBeforeFrom })} value={amount(openingPosition.debt)} />
            <SummaryLine label={t('finance', 'mbLoansDisbursed')} value={amount(movements.loansDisbursed)} />
            {showInterest && <SummaryLine label={t('finance', 'mbInterestGenerated')} value={amount(movements.interestAccrued)} />}
            {showPenalties && <SummaryLine label={t('finance', 'mbPenaltiesGenerated')} value={amount(movements.penaltiesAccrued)} />}
            <SummaryLine label={t('finance', 'mbRepayments')} value={amount(movements.repayments)} />
            <SummaryLine label={t('finance', 'mbDebtAt', { date: to })} value={amount(closing.debt)} strong />
          </dl>
        </div>
        <div className="mt-2 flex items-baseline justify-between border-y border-neutral-400 py-2 text-[11px] font-semibold text-neutral-900 print:text-[9.5pt]" data-testid="mb-net-position">
          <span>{t('finance', 'mbNetPositionAt', { date: to })} <span className="font-normal text-neutral-500">{t('finance', 'mbNetPositionHint')}</span></span>
          <span className="tabular-nums">{amount(closing.netPosition) === '—' ? '0' : amount(closing.netPosition)} {ctx.currencyLabel}</span>
        </div>
        {otherMovements.length > 0 && <p className="mt-2 text-[9.5px] text-neutral-500">
          <span className="font-medium text-neutral-600">{t('finance', 'mbOtherMovementsTitle')} : </span>
          {otherMovements.map(([subcategory, value]) => `${t('finance', subcategoryLabelKey(subcategory))} ${amount(value)}`).join(' · ')}
        </p>}
      </div>

      {currentLoans.length > 0 && <div className="mb-keep mt-5" data-testid="mb-current-loans">
        <h3 className={sectionTitle}>{t('finance', 'mbCurrentLoansTitle')}</h3>
        <table className="w-full border-collapse">
          <thead><tr className={header}>
            {[t('finance', 'mbLoan'), t('finance', 'mbDisbursementDate'), t('finance', 'mbMaturityDate'), t('finance', 'mbCashboxColumn')].map((label) => <th key={label} scope="col" className="py-1.5 pr-2 text-left font-medium">{label}</th>)}
            {[t('finance', 'mbInitialAmount'), ...(showInterest ? [t('finance', 'mbInterestGenerated')] : []), ...(showPenalties ? [t('finance', 'mbPenaltiesGenerated')] : []), t('finance', 'mbRepaid'), t('finance', 'mbOutstanding')].map((label) => <th key={label} scope="col" className="py-1.5 pl-2 text-right font-medium">{label}</th>)}
          </tr></thead>
          <tbody>{currentLoans.map((loan) => <tr key={loan.loanId}>
            <td className={textCell}>{loan.loanId}</td>
            <td className={textCell}>{formatDate(loan.disbursementDate)}</td>
            <td className={textCell}>{formatDate(loan.maturityDate)}</td>
            <td className={textCell}>{cashboxesOf(loan.funding)}</td>
            <td className={cell}>{amount(loan.principal)}</td>
            {showInterest && <td className={cell}>{amount(loan.interestAccrued)}</td>}
            {showPenalties && <td className={cell}>{amount(loan.penaltiesAccrued)}</td>}
            <td className={cell}>{amount(loan.repaid)}</td>
            <td className={`${cell} font-medium text-neutral-900`}>{amount(loan.outstanding)}</td>
          </tr>)}</tbody>
        </table>
      </div>}

      {(end.interestLines.length > 0 || end.gainLines.length > 0) && <div className="mt-5" data-testid="mb-interest-detail">
        <h3 className={`mb-head ${sectionTitle}`}>{t('finance', 'mbInterestDetailTitle')}</h3>
        {end.interestLines.length > 0 && <table className="mb-table w-full border-collapse" data-testid="mb-loan-interest">
          <caption className="pb-1 text-left text-[9.5px] font-medium text-neutral-600">{t('finance', 'mbLoanInterestCaption')}</caption>
          <thead><tr className={header}>
            {[t('finance', 'mbDate'), t('finance', 'mbLoan'), t('finance', 'mbCashboxColumn'), t('finance', 'mbTreatment')].map((label) => <th key={label} scope="col" className="py-1.5 pr-2 text-left font-medium">{label}</th>)}
            {[t('finance', 'mbBase'), t('finance', 'mbRateColumn'), t('finance', 'mbColInterest')].map((label) => <th key={label} scope="col" className="py-1.5 pl-2 text-right font-medium">{label}</th>)}
          </tr></thead>
          <tbody>{end.interestLines.map((line, lineIndex) => <tr key={`${line.loanId}-${line.date}-${lineIndex}`}>
            <td className={`${textCell} whitespace-nowrap`}>{formatDate(line.date)}</td>
            <td className={textCell}>{line.loanId}</td>
            <td className={textCell}>{cashboxesOf(loanById.get(line.loanId)?.funding ?? [])}</td>
            <td className={textCell}>{t('finance', TREATMENT_KEY[loanById.get(line.loanId)?.loanMode ?? 'SIMPLE'])}</td>
            <td className={cell}>{amount(line.base)}</td>
            <td className={cell}>{ctx.percent(line.rate)} %</td>
            <td className={`${cell} text-neutral-900`}>{amount(line.amount)}</td>
          </tr>)}</tbody>
        </table>}
        {end.gainLines.length > 0 && <table className="mb-table mt-3 w-full border-collapse" data-testid="mb-gains">
          <caption className="pb-1 text-left text-[9.5px] font-medium text-neutral-600">{t('finance', 'mbGainsCaption')}</caption>
          <thead><tr className={header}>
            {[t('finance', 'mbDate'), t('finance', 'mbCashboxColumn'), t('finance', 'mbOrigin'), t('finance', 'mbDistribution')].map((label) => <th key={label} scope="col" className="py-1.5 pr-2 text-left font-medium">{label}</th>)}
            {[t('finance', 'mbGenerated'), t('finance', 'mbGain')].map((label) => <th key={label} scope="col" className="py-1.5 pl-2 text-right font-medium">{label}</th>)}
          </tr></thead>
          <tbody>{end.gainLines.map((line, lineIndex) => <tr key={`${line.date}-${lineIndex}`}>
            <td className={`${textCell} whitespace-nowrap`}>{formatDate(line.date)}</td>
            <td className={textCell}>{line.cashboxTitle}</td>
            <td className={textCell}>{line.source.kind === 'LOAN'
              ? t('finance', 'mbOriginLoan', { loan: line.source.loanId, type: typeOf(line.source.loanMode).toLowerCase(), rate: ctx.percent(line.source.rate), base: amount(line.source.base) })
              : t('finance', 'mbOriginPurchase', { tontine: line.source.tontineName })}</td>
            <td className={textCell}>{line.rule === 'EQUAL'
              ? t('finance', 'mbShareEqual', { count: String(line.eligibleCount) })
              : t('finance', 'mbShareProportional', { share: ctx.percent(Math.round(line.share * 1000) / 10), balance: amount(line.memberBalance), total: amount(line.eligibleTotal) })}{line.roundingAdjustment > 0 && <span className="block text-neutral-500">{t('finance', 'mbRoundingAdjusted')}</span>}</td>
            <td className={cell}>{amount(line.generated)}</td>
            <td className={`${cell} text-neutral-900`}>{amount(line.gain)}</td>
          </tr>)}</tbody>
        </table>}
      </div>}

      {showPenalties && end.penaltyLines.length > 0 && <div className="mt-5" data-testid="mb-penalty-detail">
        <h3 className={`mb-head ${sectionTitle}`}>{t('finance', 'mbPenaltyDetailTitle')}</h3>
        <table className="mb-table w-full border-collapse" data-testid="mb-loan-penalties">
          <caption className="pb-1 text-left text-[9.5px] font-medium text-neutral-600">{t('finance', 'mbPenaltyCaption')}</caption>
          <thead><tr className={header}>
            {[t('finance', 'mbDate'), t('finance', 'mbLoan'), t('finance', 'mbPenaltyLateMonth'), t('finance', 'mbPenaltyTypeColumn')].map((label) => <th key={label} scope="col" className="py-1.5 pr-2 text-left font-medium">{label}</th>)}
            {[t('finance', 'mbBase'), t('finance', 'mbPenaltyValueColumn'), t('finance', 'mbColPenalties')].map((label) => <th key={label} scope="col" className="py-1.5 pl-2 text-right font-medium">{label}</th>)}
          </tr></thead>
          <tbody>{end.penaltyLines.map((line, lineIndex) => <tr key={`${line.loanId}-${line.date}-${lineIndex}`}>
            <td className={`${textCell} whitespace-nowrap`}>{formatDate(line.date)}</td>
            <td className={textCell}>{line.loanId}</td>
            <td className={textCell}>{line.lateMonth}</td>
            <td className={textCell}>{t('finance', `penaltyType${line.penaltyType}`)}</td>
            <td className={cell}>{line.penaltyType === 'FIXED' ? '—' : amount(line.base)}</td>
            <td className={cell}>{penaltyLabel(line.penaltyType, line.penaltyValue)}</td>
            <td className={`${cell} text-neutral-900`}>{amount(line.amount)}</td>
          </tr>)}</tbody>
        </table>
      </div>}

      {(end.repaymentsMismatch || end.unattributedLoanIds.length > 0) && <div className="mt-4 space-y-1 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800 print:hidden" data-testid="mb-control-notes">
        {end.repaymentsMismatch && <p data-testid="mb-repayments-mismatch">{t('finance', 'mbRepaymentsMismatch', { loan: `${amount(end.repayments)} ${ctx.currencyLabel}`, journal: `${amount(end.journalRepayments)} ${ctx.currencyLabel}` })}</p>}
        {end.unattributedLoanIds.length > 0 && <p>{t('finance', 'mbUnattributedLoans', { loans: end.unattributedLoanIds.join(', ') })}</p>}
      </div>}

      <footer className="mb-keep mt-6 flex items-end justify-between gap-6 border-t border-neutral-200 pt-2 text-[8.5px] leading-relaxed text-neutral-500 print:text-[7pt]">
        <p className="max-w-[70%]">{t('finance', 'mbFooterNote')}</p>
        <p className="whitespace-nowrap text-right">{t('finance', 'mbIssuedOn', { date: ctx.issuedOn })}<br />{t('finance', 'mbEndOfStatement')} · {displayName}</p>
      </footer>
    </div>
  </section>;
}

/** Traitement de l'intérêt dans la dette, selon le type HISTORISÉ du prêt (règles de référence du 2026-09-28). */
const TREATMENT_KEY: Record<LoanRuleLoanMode, string> = { GLOBAL: 'mbTreatmentGlobal', SIMPLE: 'mbTreatmentAdded', COMPOUND: 'mbTreatmentCapitalized' };

function AssociationHeader({ ctx, compact }: { ctx: DocumentContext; compact: boolean }) {
  const { tenant, logo, primaryColor } = ctx;
  const initials = tenant.name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join('');
  const mark = logo
    ? <img src={logo} alt={tenant.name} className={`${compact ? 'h-8 w-8' : 'h-12 w-12'} shrink-0 object-contain`} />
    : <span className={`mb-accent grid shrink-0 place-items-center rounded-full border font-semibold ${compact ? 'size-8 text-[10px]' : 'size-12 text-sm'}`} style={{ borderColor: primaryColor, color: primaryColor }} aria-hidden="true">{initials}</span>;
  const address = [tenant.address, tenant.city, tenant.country].filter(Boolean).join(', ');
  const contacts = [tenant.phone, tenant.email, tenant.website].filter(Boolean).join(' · ');
  return <header className="mb-accent flex items-center justify-between gap-4 border-b-2 pb-3" style={{ borderColor: primaryColor }} data-testid="mb-association-header">
    <div className="flex min-w-0 items-center gap-3">
      {mark}
      <div className="min-w-0">
        <p className={`${compact ? 'text-[12px]' : 'text-[15px]'} font-semibold leading-tight text-neutral-900`}>{tenant.name}</p>
        {!compact && tenant.legalName && tenant.legalName !== tenant.name && <p className="text-[10px] text-neutral-500">{tenant.legalName}</p>}
        {!compact && address && <p className="text-[10px] text-neutral-600">{address}</p>}
        {!compact && contacts && <p className="text-[10px] text-neutral-600">{contacts}</p>}
        {compact && address && <p className="text-[9.5px] text-neutral-500">{tenant.city || address}</p>}
      </div>
    </div>
    <p className="shrink-0 text-right text-[9.5px] text-neutral-500">{ctx.t('finance', 'mbIssuedOn', { date: ctx.issuedOn })}</p>
  </header>;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div className="flex gap-2"><dt className="w-20 shrink-0 text-neutral-500">{label}</dt><dd className="min-w-0 text-neutral-800">{value}</dd></div>;
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-4 border-b border-neutral-200 py-1 ${strong ? 'font-semibold text-neutral-900' : ''}`}><dt className={strong ? '' : 'text-neutral-600'}>{label}</dt><dd className="tabular-nums">{value}</dd></div>;
}
