import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, CheckCircle2, ChevronsUpDown, Clock3, Plus, Settings2, Trash2, UsersRound } from 'lucide-react';
import { AmountInput, FormSection, PermissionGate } from '@/components';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { guaranteeCoverage, loanPolicyViolations, splitRepaymentProRata, type GuaranteeCoverage, type LoanPolicyViolation } from '@/lib/finance';
import { financeService } from '@/services/finance.service';
import { creditService } from '@/services/credit.service';
import { loanRuleService } from '@/services/loan-rule.service';
import { organizationService } from '@/services/organization.service';
import { transactionBatchService, type TransactionBatchLine, type TransactionBatchResult } from '@/services/transaction-batch.service';
import { planLoanFunding, complementsFrom, fundingAvailabilityOf, savingsCashboxOf, loanApprovalStep, type LoanFundingPlan } from '@/lib/finance';
import { LoanFundingSection } from './loan-funding-section';
import { queryKeys } from '@/services/query-keys';
import { useMockMutation } from '@/hooks/use-mock-mutation';
import { useOrganizationCurrency } from '@/hooks/use-organization-currency';
import { notify } from '@/lib/notify';
import { formatCurrency } from '@/constants/currencies';
import { formatNumber } from '@/lib/utils';
import type { Member } from '@/mocks/organization/members';
import type { Loan } from '@/mocks/finance/loans';
import type { TransactionType } from '@/mocks/finance/transactions';
import type { LoanRule } from '@/mocks/finance/loan-rules';
import { TRANSACTION_OPERATIONS, DEFAULT_DIRECTION, requiredTransactionType, operationLabelKey, classificationForOperation, isLoanDisbursement, isLoanRepayment, type TransactionOperation } from '@/mocks/finance/transaction-classification';
import {
  BackTo, ContextSessionField, LOAN_RULES_PATH, Page, SessionRequiredNotice, applicableLoanRule, treasuryTabPath, buildTransactionInput, emptyTransactionForm, guarantorRowsFor, resolveMemberDebt, useFiscalSessions, validateTransactionForm,
  type GuarantorRow, type T, type TransactionFormErrors, type TransactionFormState,
} from './finance-module';
import { useFinanceSession } from './finance-session-context';
import { isCashboxOperational } from '@/mocks/finance/cashboxes';

/**
 * SAISIE RAPIDE (mandat « Saisie rapide des transactions », 2026-09-25) —
 * nouvelle INTERFACE, jamais une seconde logique financière :
 *   - les champs communs (caisse, séance, opération, sous-catégorie libre, type) sont
 *     saisis une seule fois ; chaque ligne ne porte que adhérent / montant /
 *     commentaire ;
 *   - chaque ligne est validée par `validateTransactionForm` (celle de la
 *     saisie détaillée) sur un `TransactionFormState` complet, puis convertie
 *     par `buildTransactionInput` ;
 *   - l'enregistrement passe par `transactionBatchService` (tout ou rien), qui
 *     route chaque ligne vers le MÊME service que la saisie détaillée.
 * La date de transaction reste générée à l'enregistrement (`recordedAt`).
 */

/** `guarantors` / `approved` ne servent qu'aux PRÊTS — mêmes champs que `TransactionFormState` (saisie détaillée). */
/** `funding` : caisses complémentaires cochées (id → montant saisi) quand la caisse courante ne suffit pas (PRÊTS uniquement). */
type QuickRow = { key: string; memberId: string; amount: string; comment: string; guarantors: GuarantorRow[]; approved: boolean; funding: Record<string, string> };
type CommonFields = Pick<TransactionFormState, 'cashboxNumber' | 'sessionId' | 'category' | 'subcategory' | 'type'>;
/** `coverage` / `status` : PRÊTS uniquement — lus sur `guaranteeCoverage` / `loanPolicyViolations` (métier Crédit), jamais recalculés ici. */
/** `funding` / `fundingAvailability` : plan de financement multi-caisses de la ligne et disponibles AU MOMENT de cette ligne (déjà diminués des prêts précédents du lot). */
type EvaluatedRow = { row: QuickRow; empty: boolean; form: TransactionFormState; errors: TransactionFormErrors; valid: boolean; debt?: Loan; amount: number; coverage?: GuaranteeCoverage; status?: string; funding?: LoanFundingPlan; fundingAvailability?: Record<string, number>; fundingError?: string };

let rowSeq = 0;
const newRow = (): QuickRow => ({ key: `row-${++rowSeq}`, memberId: '', amount: '', comment: '', guarantors: [], approved: false, funding: {} });
const isEmptyRow = (row: QuickRow) => !row.memberId && !row.amount.trim() && !row.comment.trim();
/** Erreurs propres à une ligne ; les autres (caisse, catégorie, politique de prêt) sont communes au lot. */
const ROW_ERROR_KEYS = ['member', 'amount', 'guarantors', 'approval', 'duration', 'repayment'] as const;
const memberName = (member: Member) => `${member.firstName} ${member.lastName}`;

/**
 * État court d'une ligne de prêt (colonne « État »), dans l'ordre de priorité du formulaire :
 * champs de base, puis première violation renvoyée par `loanPolicyViolations`. Le message complet
 * (avec montants) reste celui de `validateTransactionForm`, affiché sous la ligne.
 */
function loanRowStatus(t: T, errors: TransactionFormErrors, violations: LoanPolicyViolation[], principal: number): string | undefined {
  if (errors.member) return t('finance', 'quickEntryStatusMember');
  if (!(principal > 0)) return t('finance', 'quickEntryStatusAmount');
  const first = violations[0];
  if (!first) return Object.keys(errors).length > 0 ? t('finance', 'quickEntryIncomplete') : undefined;
  switch (first.code) {
    case 'AMOUNT_OUT_OF_RANGE': return t('finance', principal > first.max ? 'quickEntryStatusAboveMax' : 'quickEntryStatusBelowMin');
    case 'MAX_ACTIVE_LOANS': return t('finance', 'quickEntryStatusMaxActive');
    case 'MAX_EXPOSURE': return t('finance', 'quickEntryStatusExposure');
    case 'MIN_GUARANTORS': return t('finance', 'quickEntryStatusMissingGuarantor');
    case 'MAX_GUARANTORS': return t('finance', 'quickEntryStatusTooManyGuarantors');
    case 'GUARANTEE_RATIO': return t('finance', 'quickEntryStatusCoverage');
    case 'SELF_GUARANTEE': return t('finance', 'quickEntryStatusSelfGuarantee');
    case 'APPROVAL_REQUIRED': return t('finance', 'quickEntryStatusApproval');
    default: return t('finance', 'quickEntryIncomplete');
  }
}

/** « 1 / 2 garants » : garants complets / maximum autorisé par la règle. */
const guarantorCountLabel = (t: T, count: number, max: number) => t('finance', max === 1 ? 'quickEntryGuarantorCountOne' : 'quickEntryGuarantorCountMany', { count: String(count), max: String(max) });

/** Sélecteur d'adhérent avec recherche (nom ou matricule — mêmes critères que l'ajout d'adhérents des Tontines), construit sur les composants Popover + Command du kit UI. */
function MemberPicker({ t, id, members, value, onChange, invalid, allowEmpty, triggerRef }: { t: T; id: string; members: Member[]; value: string; onChange: (memberId: string) => void; invalid: boolean; allowEmpty: boolean; triggerRef?: (element: HTMLButtonElement | null) => void }) {
  const [open, setOpen] = useState(false);
  const selected = members.find((member) => member.id === value);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button ref={triggerRef} id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid} className="h-9 w-full min-w-44 justify-between font-normal">
        <span className={selected ? 'truncate' : 'truncate text-muted-foreground'}>{selected ? memberName(selected) : t('finance', 'quickEntrySelectMember')}</span>
        <ChevronsUpDown size={14} className="shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-72 p-0" align="start">
      <Command>
        <CommandInput placeholder={t('finance', 'quickEntrySearchMember')} />
        <CommandList>
          <CommandEmpty>{t('finance', 'quickEntryNoMemberFound')}</CommandEmpty>
          <CommandGroup>
            {allowEmpty && <CommandItem value={`__none__ ${t('finance', 'quickEntryNoMember')}`} onSelect={() => { onChange(''); setOpen(false); }}>{t('finance', 'quickEntryNoMember')}</CommandItem>}
            {members.map((member) => <CommandItem key={member.id} value={`${memberName(member)} ${member.matricule} ${member.id}`} onSelect={() => { onChange(member.id); setOpen(false); }}>
              <Check size={14} className={member.id === value ? 'mr-2 opacity-100' : 'mr-2 opacity-0'} />
              <span className="truncate">{memberName(member)}</span>
              {member.matricule && <span className="ml-auto pl-2 text-[11px] text-muted-foreground">{member.matricule}</span>}
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}

/** Résumé LECTURE SEULE de la règle de crédit appliquée : rien n'est ressaisi (taux, durée, plafonds, garanties sont ceux de la règle). */
function LoanRulePanel({ t, rule, money }: { t: T; rule: LoanRule; money: (value: number) => string }) {
  const items: [string, string][] = [
    [t('finance', 'quickEntryRuleAmount'), `${money(rule.minAmount)} → ${money(rule.maxAmount)}`],
    [t('finance', 'interestRate'), `${rule.interestRate} % · ${t('finance', 'loanMode' + rule.loanMode)} · ${t('finance', 'interestPeriod' + rule.interestPeriod)}`],
    [t('finance', 'quickEntryRuleDuration'), t('finance', 'quickEntryMonths', { count: String(rule.durationMonths) })],
    [t('finance', 'maxActiveLoans'), String(rule.maxActiveLoans)],
    [t('finance', 'maxLoanExposure'), rule.maxLoanExposure === null ? '—' : money(rule.maxLoanExposure)],
    [t('finance', 'guarantorsSection'), rule.requiresGuarantor ? t('finance', 'quickEntryRuleGuarantors', { min: String(rule.minGuarantors), max: String(rule.maxGuarantors), ratio: String(rule.guaranteeRatio), type: t('finance', 'guaranteeType' + rule.guaranteeTypeRequired) }) : t('finance', 'quickEntryRuleNoGuarantor')],
    [t('finance', 'allowSelfGuarantee'), t('finance', rule.allowSelfGuarantee ? 'quickEntryYes' : 'quickEntryNo')],
    [t('finance', 'approvalSection'), rule.requiresApproval ? t('finance', 'quickEntryRuleApproval', { level: t('finance', 'approvalLevel' + (rule.approvalLevel ?? 'ADMIN')) }) : t('finance', 'quickEntryRuleNoApproval')],
  ];
  return <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4" data-testid="quick-entry-loan-rule">
    <p className="text-sm"><span className="text-muted-foreground">{t('finance', 'quickEntryLoanRule')} :</span> <span className="font-semibold">{rule.name}</span></p>
    <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium text-foreground">{value}</dd></div>)}
    </dl>
    {/* Approbation requise → workflow (mandat du 2026-09-27) : jamais d'auto-attestation, chaque prêt est soumis à l'étape du niveau de la règle et attend la décision. */}
    {rule.requiresApproval && <p className="mt-3 flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="quick-entry-approval-workflow"><Clock3 size={14} className="mt-0.5 shrink-0" />{t('finance', 'quickEntryApprovalWorkflow', { step: loanApprovalStep(rule.approvalLevel).name })}</p>}
  </div>;
}

/**
 * Garants d'UN prêt — mêmes règles d'affichage que la saisie détaillée : entre minGuarantors et
 * maxGuarantors lignes (`guarantorRowsFor`), candidats sans l'emprunteur si l'auto-caution est interdite.
 */
function LoanGuarantorsDialog({ t, rule, members, borrowerId, rows, principal, coverage, money, error, line, onChange, onClose }: { t: T; rule: LoanRule; members: Member[]; borrowerId: string; rows: GuarantorRow[]; principal: number; coverage: GuaranteeCoverage; money: (value: number) => string; error?: string; line: number; onChange: (guarantors: GuarantorRow[]) => void; onClose: () => void }) {
  const borrower = members.find((member) => member.id === borrowerId);
  const candidates = members.filter((member) => rule.allowSelfGuarantee || member.id !== borrowerId);
  const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';
  const setGuarantor = (index: number, patch: Partial<GuarantorRow>) => onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t('finance', 'quickEntryGuarantorsTitle', { line: String(line), member: borrower ? memberName(borrower) : '—' })}</DialogTitle>
        <DialogDescription>{t('finance', 'guarantorRequiredByPolicy', { min: String(rule.minGuarantors), max: String(rule.maxGuarantors) })}</DialogDescription>
      </DialogHeader>
      <dl className="grid gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3" data-testid="quick-entry-coverage">
        <div><dt className="text-xs text-muted-foreground">{t('finance', 'quickEntryLoanAmount')}</dt><dd className="font-semibold">{money(principal)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t('finance', 'quickEntryCoverageRequired', { ratio: String(coverage.ratio) })}</dt><dd className="font-semibold">{money(coverage.required)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t('finance', 'quickEntryCoverageTotal')}</dt><dd className="font-semibold">{money(coverage.covered)}</dd></div>
        <p className={`sm:col-span-3 text-xs font-medium ${coverage.missing > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`}>{coverage.missing > 0 ? t('finance', 'quickEntryCoverageMissing', { amount: money(coverage.missing) }) : t('finance', 'quickEntryCoverageOk')}</p>
      </dl>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{guarantorCountLabel(t, coverage.guarantorCount, rule.maxGuarantors)}</p>
        {rows.map((row, index) => <div key={index} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor={`qe-guarantor-name-${index}`}>{t('finance', 'guarantorName')} {index + 1}</Label>
            <select id={`qe-guarantor-name-${index}`} value={row.name} onChange={(event) => setGuarantor(index, { name: event.target.value })} className={selectClass}>
              <option value="">—</option>
              {candidates.map((member) => <option key={member.id} value={memberName(member)}>{memberName(member)}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label htmlFor={`qe-guarantor-amount-${index}`}>{t('finance', 'guaranteedAmount')} {index + 1}</Label><AmountInput id={`qe-guarantor-amount-${index}`} value={row.amount} onValueChange={(amount) => setGuarantor(index, { amount })} /></div>
          <div className="space-y-1"><Label htmlFor={`qe-guarantor-relation-${index}`}>{t('finance', 'guarantorRelation')} {index + 1}</Label><Input id={`qe-guarantor-relation-${index}`} value={row.relation} onChange={(event) => setGuarantor(index, { relation: event.target.value })} /></div>
        </div>)}
        <div className="flex gap-2">
          {rows.length < rule.maxGuarantors && <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { name: '', amount: '', relation: '' }])}><Plus size={14} />{t('finance', 'addGuarantor')}</Button>}
          {rows.length > rule.minGuarantors && <Button type="button" variant="ghost" size="sm" onClick={() => onChange(rows.slice(0, -1))}>{t('finance', 'removeGuarantor')}</Button>}
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter><Button type="button" onClick={onClose}>{t('finance', 'quickEntryValidate')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function TransactionQuickEntry({ t }: { t: T }) {
  const navigate = useNavigate(); const { currentTenant } = useTenant();
  const { user } = usePermissions();
  const { locale } = useLocale();
  const currency = useOrganizationCurrency();
  const money = (value: number) => formatCurrency(value, currency, locale);
  const [searchParams] = useSearchParams();
  const presetCashboxId = searchParams.get('cashboxId') ?? '';
  const returnTo = presetCashboxId ? `/finance/cashboxes/${presetCashboxId}` : treasuryTabPath('transactions');

  const [common, setCommonState] = useState<CommonFields>({ cashboxNumber: '', sessionId: '', category: '', subcategory: '', type: 'credit' });
  const setCommon = (patch: Partial<CommonFields>) => setCommonState((current) => ({ ...current, ...patch }));
  const [operation, setOperation] = useState<TransactionOperation | ''>('');
  const [rows, setRows] = useState<QuickRow[]>(() => [newRow()]);
  const [failedRowKey, setFailedRowKey] = useState<string | null>(null);
  const setRow = (key: string, patch: Partial<QuickRow>) => { setFailedRowKey(null); setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row))); };

  const { data: cashboxes = [] } = useQuery({ queryKey: queryKeys.finance.cashboxes(currentTenant.id), queryFn: () => financeService.listCashboxes(currentTenant.id) });
  const { data: members = [] } = useQuery({ queryKey: queryKeys.members.list(currentTenant.id), queryFn: () => organizationService.listMembers(currentTenant.id) });
  const { dateById: sessionDateById, fiscalYearId } = useFiscalSessions();
  /** Séance du CONTEXTE Finance (mandat « Évolution globale » §17) : héritée, jamais choisie ici ; « Toutes les séances » bloque l'enregistrement. */
  const { currentSession } = useFinanceSession();
  const isLoan = isLoanDisbursement(common.category, common.subcategory);
  const isRepayment = isLoanRepayment(common.category, common.subcategory);
  const forcedType = requiredTransactionType(common.category, common.subcategory);
  const { data: creditRule, isSuccess: loanRulesLoaded } = useQuery({ queryKey: queryKeys.credit.loanRules(currentTenant.id), queryFn: () => loanRuleService.getCreditRule(currentTenant.id), enabled: isLoan });
  // Dette des prêts : REMBOURSEMENT → à la date de paiement (date de séance, sinon aujourd'hui), celle que
  // `createRepaymentTransaction` applique ; PRÊT → encours du jour (le prêt est décaissé aujourd'hui).
  const todayIso = new Date().toISOString().slice(0, 10);
  const debtDate = (isRepayment && common.sessionId && sessionDateById.get(common.sessionId)) || todayIso;
  const { data: tenantLoans = [] } = useQuery({ queryKey: [...queryKeys.credit.loans(currentTenant.id), debtDate], queryFn: () => creditService.listLoans(currentTenant.id, debtDate), enabled: isLoan || isRepayment });

  // Même préremplissage que la saisie détaillée : caisse d'origine (verrouillée) et séance du contexte Finance.
  const presetCashbox = presetCashboxId ? cashboxes.find((cashbox) => cashbox.id === presetCashboxId) : undefined;
  useEffect(() => {
    if (presetCashbox && common.cashboxNumber !== presetCashbox.cashboxNumber) setCommon({ cashboxNumber: presetCashbox.cashboxNumber });
  }, [presetCashbox?.cashboxNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (common.sessionId !== (currentSession?.id ?? '')) setCommon({ sessionId: currentSession?.id ?? '' });
  }, [currentSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * RÈGLE DE CRÉDIT = source de vérité des conditions d'octroi. Une caisse porte au plus UNE règle vivante
   * (UNIQUE(tenant, caisse), `loanRuleService`) : `applicableLoanRule` la retient si elle est ACTIVE et autorise
   * les prêts — même critère que `resolveActiveLoanRule` côté service. Aucune règle de priorité inventée.
   */
  const rule = isLoan ? applicableLoanRule(creditRule) : undefined;
  // PRÊT (2026-09-27) : caisse imposée = Épargne (`SAVINGS`), jamais choisie ; en quittant le prêt, retour à la caisse d'origine (ou aucune).
  const savings = savingsCashboxOf(cashboxes);
  useEffect(() => {
    if (isLoan && savings && common.cashboxNumber !== savings.cashboxNumber) setCommon({ cashboxNumber: savings.cashboxNumber });
    else if (!isLoan && savings && common.cashboxNumber === savings.cashboxNumber && presetCashbox?.cashboxNumber !== savings.cashboxNumber) setCommon({ cashboxNumber: presetCashbox?.cashboxNumber ?? '' });
  }, [isLoan, savings?.cashboxNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedCashbox = cashboxes.find((cashbox) => cashbox.cashboxNumber === common.cashboxNumber);
  // Règle UNIQUE du tenant : « aucune règle configurée » ou « règle présente mais prêts non autorisés / inactive ».
  const loanRuleIssue: 'noRule' | 'loansNotAllowed' | null = isLoan && selectedCashbox && loanRulesLoaded && !rule ? (creditRule ? 'loansNotAllowed' : 'noRule') : null;

  /**
   * Validation ligne par ligne, DANS L'ORDRE du lot : les règles cumulatives du
   * métier (plafond `maxActiveLoans`, solde dû d'un prêt remboursé sur plusieurs
   * lignes) voient les lignes précédentes, exactement comme le service qui les
   * appliquera l'une après l'autre.
   */
  const evaluated = useMemo<EvaluatedRow[]>(() => {
    const consumedByLoan = new Map<string, number>();
    // Financement multi-caisses : disponible de chaque caisse active, diminué des allocations des prêts précédents du lot.
    const remainingAvailability = fundingAvailabilityOf(cashboxes);
    const batchLoansByMember = new Map<string, number>();
    const batchPrincipalByMember = new Map<string, number>();
    return rows.map((row) => {
      const form: TransactionFormState = {
        ...emptyTransactionForm, ...common,
        type: requiredTransactionType(common.category, common.subcategory) ?? common.type,
        memberId: row.memberId, amount: row.amount.trim(), description: row.comment,
        // Même préremplissage depuis la politique que la saisie détaillée (taux / durée consignés dans la description).
        interestRate: rule ? String(rule.interestRate) : '', durationMonths: rule ? String(rule.durationMonths) : '',
        // L'approbation n'est jamais attestée ici : elle relève du workflow (`submitLoanApplication`).
        guarantors: row.guarantors, approved: true, approvedBy: '',
      };
      let debt: Loan | undefined;
      if (isRepayment && row.memberId) {
        const memberLoans = tenantLoans.filter((loan) => loan.memberId === row.memberId).map((loan) => ({ ...loan, outstanding: loan.outstanding - (consumedByLoan.get(loan.id) ?? 0) }));
        debt = resolveMemberDebt(memberLoans);
        form.loanId = debt?.id ?? '';
        form.debtOutstanding = debt ? String(debt.outstanding) : '';
      }
      const activeLoanCount = isLoan && row.memberId ? tenantLoans.filter((loan) => loan.memberId === row.memberId && loan.status === 'active').length + (batchLoansByMember.get(row.memberId) ?? 0) : 0;
      // Exposition : encours actuel (Σ `outstanding` des prêts actifs) + principaux des prêts précédents du lot pour cet emprunteur.
      const borrowerMember = members.find((member) => member.id === row.memberId);
      const activeOutstanding = isLoan && row.memberId ? tenantLoans.filter((loan) => loan.memberId === row.memberId && loan.status === 'active').reduce((sum, loan) => sum + loan.outstanding, 0) + (batchPrincipalByMember.get(row.memberId) ?? 0) : 0;
      const borrowerName = borrowerMember ? memberName(borrowerMember) : '';
      const errors = validateTransactionForm(form, rule, 'create', t, activeLoanCount, currency, { activeOutstanding, borrowerName });
      const empty = isEmptyRow(row);
      const amount = Number(form.amount) || 0;
      // Plan de financement (métier `planLoanFunding`) : Épargne d'abord, reliquat par les compléments cochés.
      const fundingAvailability = isLoan && savings ? { ...remainingAvailability } : undefined;
      const funding = fundingAvailability && savings && amount > 0 ? planLoanFunding(amount, savings.id, complementsFrom(row.funding), fundingAvailability) : undefined;
      const fundingError = funding && !funding.isComplete ? t('finance', 'fundingIncompleteError') : undefined;
      const valid = !empty && Object.keys(errors).length === 0 && !fundingError;
      let coverage: GuaranteeCoverage | undefined;
      let status: string | undefined;
      if (isLoan && rule) {
        // Mêmes entrées que `validateTransactionForm` → `loanPolicyViolations` : l'état affiché est celui du métier Crédit.
        const policyGuarantors = guarantorRowsFor(form, rule).map((item) => ({ name: item.name, amount: Number(item.amount) || 0 }));
        coverage = guaranteeCoverage(rule, amount, policyGuarantors);
        if (!empty && !valid) status = loanRowStatus(t, errors, loanPolicyViolations(rule, { principal: amount, borrowerName, activeLoanCount, activeOutstanding, guarantors: policyGuarantors, approved: true }), amount) ?? (fundingError ? t('finance', 'quickEntryStatusFunding') : undefined);
      }
      if (valid && funding) for (const allocation of funding.allocations) remainingAvailability[allocation.cashboxId] = (remainingAvailability[allocation.cashboxId] ?? 0) - allocation.amount;
      if (valid && debt) consumedByLoan.set(debt.id, (consumedByLoan.get(debt.id) ?? 0) + amount);
      if (valid && isLoan) {
        batchLoansByMember.set(row.memberId, (batchLoansByMember.get(row.memberId) ?? 0) + 1);
        batchPrincipalByMember.set(row.memberId, (batchPrincipalByMember.get(row.memberId) ?? 0) + amount);
      }
      return { row, empty, form, errors, valid, debt, amount, coverage, status, funding, fundingAvailability, fundingError };
    });
  }, [rows, common, rule, tenantLoans, members, isLoan, isRepayment, t, currency, cashboxes, savings]);

  /** Erreurs communes (caisse, catégorie, politique de prêt absente) — même fonction, sur une ligne témoin. */
  const commonErrors = validateTransactionForm({ ...emptyTransactionForm, ...common, amount: '1' }, rule, 'create', t, 0, currency);
  // Une ligne totalement vide (aucun adhérent, montant ni commentaire) est une ligne NON SAISIE : ignorée, jamais « invalide ».
  const filled = evaluated.filter((item) => !item.empty);
  const validRows = filled.filter((item) => item.valid);
  const invalidCount = filled.length - validRows.length;
  const emptyCount = evaluated.length - filled.length;
  /** Accord du résumé : en français 0 et 1 sont au singulier (« 0 ligne valide »), en anglais seul 1 l'est. */
  const singular = (count: number) => (locale === 'fr' ? count <= 1 : count === 1);
  const total = validRows.reduce((sum, item) => sum + item.amount, 0);
  const commonValid = !commonErrors.cashboxNumber && !commonErrors.category && !loanRuleIssue;

  // Focus automatique sur l'adhérent de la ligne ajoutée (saisie au clavier, sans clic supplémentaire).
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  useEffect(() => {
    if (!focusKey) return;
    triggerRefs.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey]);
  const addRow = () => { const row = newRow(); setRows((current) => [...current, row]); setFocusKey(row.key); };
  const removeRow = (key: string) => { setFailedRowKey(null); setRows((current) => current.filter((row) => row.key !== key)); };

  const mutation = useMockMutation<TransactionBatchResult, TransactionBatchLine[]>({
    mutationFn: (lines) => transactionBatchService.createTransactionsBatch(currentTenant.id, lines),
    // Mêmes clés que la saisie détaillée : journal, caisses (soldes, dernier mouvement), crédit.
    // `['operations']` : les prêts soumis à approbation créent des demandes de workflow, visibles aussitôt dans le module Workflow.
    invalidateKeys: [['finance', 'transactions'], ['finance', 'cashboxes'], ['credit', 'loans'], ['credit', 'applications'], ['credit', 'guarantors'], ['operations']],
    onSuccess: (result, lines) => {
      if (!result.ok) {
        // Rien n'a été enregistré (rollback du lot) : les lignes restent à l'écran pour correction.
        const failed = validRows[result.failedIndex];
        setFailedRowKey(failed?.row.key ?? null);
        const failedMember = failed ? members.find((member) => member.id === failed.row.memberId) : undefined;
        notify.error(t('finance', 'quickEntryFailed', { line: String(failed ? rows.findIndex((row) => row.key === failed.row.key) + 1 : 0), member: failedMember ? memberName(failedMember) : '—' }));
        return;
      }
      const savedKey = isLoan && rule?.requiresApproval ? (lines.length === 1 ? 'quickEntrySubmittedLoanOne' : 'quickEntrySubmittedLoanMany') : isLoan ? (lines.length === 1 ? 'quickEntrySavedLoanOne' : 'quickEntrySavedLoanMany') : (lines.length === 1 ? 'quickEntrySavedOne' : 'quickEntrySavedMany');
      notify.success(t('finance', savedKey, { count: formatNumber(lines.length) }));
      navigate(returnTo);
    },
  });

  const canSave = Boolean(currentSession) && commonValid && filled.length > 0 && filled.every((item) => item.valid) && !mutation.isPending;
  const handleSave = () => {
    if (!canSave) return;
    const memberNameById = new Map(members.map((member) => [member.id, memberName(member)]));
    const lines: TransactionBatchLine[] = validRows.map(({ form, funding }) => {
      const input = buildTransactionInput(form, rule, memberNameById, fiscalYearId, t, currency);
      if (isLoan) {
        // Même construction que la saisie détaillée (`TransactionCreate`) : garants valides.
        const validGuarantors = guarantorRowsFor(form, rule)
          .filter((row) => row.name.trim() && Number(row.amount) > 0)
          .map((row) => ({ guarantorName: row.name.trim(), guaranteedAmount: Number(row.amount) || 0, relation: row.relation.trim() }));
        const complementaryFunding = (funding?.allocations ?? []).filter((allocation) => allocation.cashboxId !== savings?.id);
        // Approbation requise → demande soumise au workflow ; le prêt ne sera créé (et décaissé) qu'après approbation.
        if (rule?.requiresApproval) return { kind: 'loanApplication', requestedBy: user.name, requestedByUserId: user.id, input: { memberId: form.memberId, requestedAmount: input.amount, purpose: form.description.trim(), guarantors: validGuarantors, complementaryFunding, sessionId: form.sessionId || undefined, description: form.description.trim() || undefined } };
        return { kind: 'loan', input: { memberId: form.memberId, principal: input.amount, guarantors: validGuarantors, approved: false, transactionInput: input, complementaryFunding } };
      }
      if (isRepayment) {
        const paymentDate = (form.sessionId && sessionDateById.get(form.sessionId)) || new Date().toISOString().slice(0, 10);
        // Le métier Crédit calcule la répartition capital / intérêts à partir du montant (`splitRepaymentProRata`).
        return { kind: 'repayment', input: { loanId: form.loanId, paymentDate, amount: input.amount, transactionInput: input } };
      }
      return { kind: 'transaction', input };
    });
    mutation.mutate(lines);
  };

  const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60';
  const memberRequired = isLoan || isRepayment;
  const saveLabel = isLoan && rule?.requiresApproval
    ? (filled.length === 1 ? t('finance', 'quickEntrySubmitLoanOne') : t('finance', 'quickEntrySubmitLoanMany', { count: formatNumber(filled.length) }))
    : isLoan
    ? (filled.length === 1 ? t('finance', 'quickEntrySaveLoanOne') : t('finance', 'quickEntrySaveLoanMany', { count: formatNumber(filled.length) }))
    : (filled.length === 1 ? t('finance', 'quickEntrySaveOne') : t('finance', 'quickEntrySaveMany', { count: formatNumber(filled.length) }));
  const showGuarantors = isLoan && Boolean(rule?.requiresGuarantor);
  const columnCount = 4 + (showGuarantors ? 2 : 0) + (isLoan ? 1 : 0);
  const [guarantorsRowKey, setGuarantorsRowKey] = useState<string | null>(null);
  const guarantorsTarget = evaluated.find((item) => item.row.key === guarantorsRowKey);

  return <Page title={t('finance', 'quickEntryTitle')} description={t('finance', 'quickEntryDescription')} actions={<BackTo label={t('finance', presetCashboxId ? 'backToCashbox' : 'backToTransactions')} to={returnTo} />}>
    <div className="space-y-5">
      <SessionRequiredNotice t={t} />
      <FormSection title={t('finance', 'quickEntryCommon')}>
        {/* 4 champs (Caisse · Date de séance · Action · Type) : 1 colonne sur mobile, 2 × 2 en intermédiaire, une seule ligne sur écran large. */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isLoan ? <div className="space-y-2"><Label htmlFor="qe-cashbox">{t('finance', 'priorityCashbox')}</Label>
            <Input id="qe-cashbox" readOnly value={savings?.title ?? ''} className="bg-muted/40" />
          </div>
          : <div className="space-y-2"><Label htmlFor="qe-cashbox">{t('finance', isRepayment ? 'receiptCashbox' : 'cashboxField')} *</Label>
            <select id="qe-cashbox" value={common.cashboxNumber} disabled={Boolean(presetCashboxId)} onChange={(event) => setCommon({ cashboxNumber: event.target.value })} className={selectClass}>
              <option value="">{t('finance', 'selectCashboxPlaceholder')}</option>
              {/* Caisses OPÉRATIONNELLES uniquement (§12/§31) ; une caisse d'origine désactivée reste affichée (verrouillée) mais le service refuserait l'écriture. */}
              {cashboxes.filter((cashbox) => isCashboxOperational(cashbox) || cashbox.id === presetCashboxId).map((cashbox) => <option key={cashbox.id} value={cashbox.cashboxNumber}>{cashbox.title}</option>)}
            </select>
          </div>}
          <ContextSessionField t={t} id="qe-session" />
          {/* L'utilisateur choisit une des 4 CATÉGORIES de saisie (Épargner · Rembourser · Emprunter · Autres) : catégorie du modèle / sous-catégorie / type imposé sont déduits par `classificationForOperation` + `requiredTransactionType`. */}
          <div className="space-y-2"><Label htmlFor="qe-operation">{t('finance', 'actionLabel')} *</Label>
            <select id="qe-operation" value={operation} onChange={(event) => {
              const next = event.target.value as TransactionOperation | '';
              setOperation(next);
              if (!next) { setCommon({ category: '', subcategory: '' }); return; }
              // Plus de sous-catégorie à la saisie : « Autres » est enregistré sous la sous-catégorie générique AUTRE (type libre), exigée par le modèle.
              const { category, subcategory } = classificationForOperation(next, next === 'AUTRES' ? 'AUTRE' : '');
              // Type recalculé à chaque changement de catégorie : imposé si la catégorie l'impose, sinon sens par défaut — jamais l'ancienne valeur.
              setCommon({ category, subcategory, type: requiredTransactionType(category, subcategory) ?? DEFAULT_DIRECTION[category] });
            }} className={selectClass}>
              <option value="">{t('finance', 'selectAction')}</option>
              {TRANSACTION_OPERATIONS.map((item) => <option key={item} value={item}>{t('finance', operationLabelKey(item))}</option>)}
            </select>
          </div>
          {/* REMBOURSEMENT : toujours un crédit pour la caisse (comme la saisie détaillée) — pas de choix de sens. */}
          {/* Type IMPOSÉ par la catégorie (`requiredTransactionType`) et non modifiable, sauf « Autres » libre. */}
          <div className="space-y-2"><Label htmlFor="qe-type">{t('finance', 'type')} *</Label>
            <select id="qe-type" value={forcedType ?? common.type} disabled={Boolean(forcedType)} onChange={(event) => setCommon({ type: event.target.value as TransactionType })} className={selectClass}>
              <option value="credit">{t('finance', 'credit')}</option>
              <option value="debit">{t('finance', 'debit')}</option>
            </select>
            {forcedType && <p className="text-[11px] text-muted-foreground">{t('finance', 'typeForcedHint')}</p>}
          </div>
        </div>
        {(isLoan || isRepayment) && selectedCashbox && <p className="mt-2 text-xs text-muted-foreground" data-testid="quick-entry-movement-note">{t('finance', isLoan ? 'quickEntryDisbursementNote' : 'quickEntryReceiptNote', { cashbox: selectedCashbox.title })}</p>}
        {loanRuleIssue && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="quick-entry-loan-rule-issue">
          <span>{t('finance', loanRuleIssue === 'noRule' ? 'quickEntryNoLoanRule' : 'quickEntryLoansNotAllowed')}</span>
          {loanRuleIssue === 'noRule' && <PermissionGate permission="loanRules.manage"><Button type="button" size="sm" variant="outline" onClick={() => navigate(`${LOAN_RULES_PATH}/create`)}><Settings2 size={14} />{t('finance', 'quickEntryConfigureLoanRule')}</Button></PermissionGate>}
        </div>}
        {rule && <LoanRulePanel t={t} rule={rule} money={money} />}
      </FormSection>

      <Card>
        <CardHeader><CardTitle className="text-sm">{t('finance', 'quickEntryLines')}</CardTitle></CardHeader>
        <CardContent className="space-y-4 px-5 pb-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" aria-label={t('finance', 'quickEntryLines')}>
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-10 py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">{t('finance', 'adherent')}{memberRequired ? ' *' : ''}</th>
                <th className="w-48 py-2 pr-3 font-medium">{t('finance', isRepayment ? 'amountPaid' : 'amount')} *</th>
                {showGuarantors && <th className="py-2 pr-3 font-medium">{t('finance', 'quickEntryGuarantorsColumn')}</th>}
                {showGuarantors && <th className="py-2 pr-3 font-medium">{t('finance', 'quickEntryCoverageColumn')}</th>}
                <th className="py-2 pr-3 font-medium">{t('finance', 'comment')}</th>
                {isLoan && <th className="min-w-[10rem] py-2 pr-3 font-medium">{t('finance', 'quickEntryStatusColumn')}</th>}
                <th className="w-12 py-2" aria-label={t('finance', 'quickEntryRemoveLine')} />
              </tr></thead>
              <tbody>
                {evaluated.map(({ row, empty, errors, debt, valid, coverage, status, funding, fundingAvailability }, index) => {
                  const showErrors = !empty || failedRowKey === row.key;
                  const rowError = showErrors ? ROW_ERROR_KEYS.map((key) => errors[key]).find(Boolean) : undefined;
                  return <Fragment key={row.key}><tr data-testid="quick-entry-row" className={`align-top ${rowError ? '' : 'border-b border-border'} ${failedRowKey === row.key ? 'bg-rose-50 dark:bg-rose-950/40' : ''}`}>
                    <td className="py-2 pr-2 pt-4 text-xs text-muted-foreground">{index + 1}</td>
                    <td className="py-2 pr-3">
                      <MemberPicker t={t} id={`qe-member-${row.key}`} members={members} value={row.memberId} onChange={(memberId) => setRow(row.key, { memberId })} invalid={showErrors && Boolean(errors.member || errors.repayment)} allowEmpty={!memberRequired} triggerRef={(element) => { if (element) triggerRefs.current.set(row.key, element); else triggerRefs.current.delete(row.key); }} />
                      {isRepayment && debt && <p className="mt-1 text-[11px] text-muted-foreground">{t('finance', 'amountToRepay')} : {money(debt.outstanding)}</p>}
                      {isRepayment && debt && Number(row.amount) > 0 && <p className="text-[11px] text-muted-foreground" data-testid="quick-entry-repayment-split">{(() => { const split = splitRepaymentProRata(debt, Number(row.amount)); return t('finance', 'quickEntryRepaymentSplit', { loan: debt.id, principal: money(split.principalPart), interest: money(split.interestPart) }); })()}</p>}
                    </td>
                    <td className="py-2 pr-3"><AmountInput aria-label={t('finance', 'quickEntryAmountOf', { line: String(index + 1) })} value={row.amount} onValueChange={(amount) => setRow(row.key, { amount })} aria-invalid={showErrors && Boolean(errors.amount)} /></td>
                    {showGuarantors && rule && coverage && <td className="py-2 pr-3"><Button type="button" variant="outline" size="sm" className="h-9 whitespace-nowrap" disabled={!row.memberId} onClick={() => setGuarantorsRowKey(row.key)} aria-label={t('finance', 'quickEntryGuarantorsOf', { line: String(index + 1) })} aria-invalid={showErrors && Boolean(errors.guarantors)}><UsersRound size={14} />{guarantorCountLabel(t, coverage.guarantorCount, rule.maxGuarantors)}</Button></td>}
                    {showGuarantors && coverage && <td className="py-2 pr-3 pt-3 text-xs" data-testid="quick-entry-row-coverage">{empty ? <span className="text-muted-foreground">—</span> : <><span className="whitespace-nowrap font-medium">{money(coverage.covered)} / {money(coverage.required)}</span>{coverage.missing > 0 && <span className="block whitespace-nowrap text-amber-700 dark:text-amber-300">{t('finance', 'quickEntryCoverageMissingShort', { amount: money(coverage.missing) })}</span>}</>}</td>}
                    <td className="py-2 pr-3"><Input aria-label={t('finance', 'quickEntryCommentOf', { line: String(index + 1) })} value={row.comment} onChange={(event) => setRow(row.key, { comment: event.target.value })} /></td>
                    {isLoan && <td className="py-2 pr-3 pt-4 text-xs" data-testid="quick-entry-row-status">{empty ? <span className="text-muted-foreground">—</span> : valid ? <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 size={13} />{t('finance', 'quickEntryCompliant')}</span> : <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400"><AlertTriangle size={13} className="shrink-0" />{status ?? t('finance', 'quickEntryIncomplete')}</span>}</td>}
                    <td className="py-2 text-right"><Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)} aria-label={t('finance', 'quickEntryRemoveLineN', { line: String(index + 1) })}><Trash2 size={15} /></Button></td>
                  </tr>
                  {rowError && <tr><td /><td colSpan={columnCount} className="pb-2 pr-3"><p role="alert" className="text-xs text-destructive" data-testid="quick-entry-row-error">{t('finance', 'quickEntryLineNumber', { line: String(index + 1) })} — {rowError}</p></td></tr>}
                  {!empty && funding && fundingAvailability && <tr className="border-b border-border" data-testid="quick-entry-row-funding"><td /><td colSpan={columnCount} className="pb-3 pr-3"><LoanFundingSection t={t} plan={funding} cashboxes={cashboxes} availability={fundingAvailability} values={row.funding} onChange={(values) => setRow(row.key, { funding: values })} money={money} idPrefix={`qe-funding-${row.key}`} /></td></tr>}</Fragment>;
                })}
              </tbody>
            </table>
            {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('finance', 'quickEntryEmpty')}</p>}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}><Plus size={14} />{t('finance', 'quickEntryAddLine')}</Button>
          {rule && guarantorsTarget?.coverage && <LoanGuarantorsDialog t={t} rule={rule} members={members} borrowerId={guarantorsTarget.row.memberId} rows={guarantorRowsFor(guarantorsTarget.form, rule)} principal={guarantorsTarget.amount} coverage={guarantorsTarget.coverage} money={money} error={guarantorsTarget.errors.guarantors} line={rows.findIndex((row) => row.key === guarantorsTarget.row.key) + 1} onChange={(guarantors) => setRow(guarantorsTarget.row.key, { guarantors })} onClose={() => setGuarantorsRowKey(null)} />}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" data-testid="quick-entry-summary">
              <span>{t('finance', singular(filled.length) ? 'quickEntryFilledOne' : 'quickEntryFilledMany', { count: formatNumber(filled.length) })}</span>
              <span className="text-emerald-700 dark:text-emerald-400">{t('finance', singular(validRows.length) ? 'quickEntryValidOne' : 'quickEntryValidMany', { count: formatNumber(validRows.length) })}</span>
              {invalidCount > 0 && <span className="text-amber-700 dark:text-amber-300">{t('finance', singular(invalidCount) ? 'quickEntryInvalidOne' : 'quickEntryInvalidMany', { count: formatNumber(invalidCount) })}</span>}
              {emptyCount > 0 && <span>{t('finance', singular(emptyCount) ? 'quickEntryEmptyOne' : 'quickEntryEmptyMany', { count: formatNumber(emptyCount) })}</span>}
              <span className="font-semibold text-foreground">{t('finance', 'quickEntryTotal', { amount: money(total) })}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={mutation.isPending} onClick={() => navigate(returnTo)}>{t('finance', 'cancel')}</Button>
              <Button disabled={!canSave} onClick={handleSave}>{mutation.isPending ? t('finance', 'saving') : saveLabel}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </Page>;
}

