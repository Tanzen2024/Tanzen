import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { AmountInput } from '@/components/amount-input';
import { unfundableAmount, type LoanFundingPlan } from '@/lib/finance';
import type { Cashbox } from '@/mocks/finance/cashboxes';

type T = (section: 'finance', key: string, values?: Record<string, string>) => string;

/**
 * FINANCEMENT MULTI-CAISSES D'UN PRÊT (mandat du 2026-09-26) — affichage partagé par la saisie
 * rapide et la saisie détaillée. Le calcul est celui du métier (`planLoanFunding`) ; le service
 * `creditService.createLoanTransaction` le refait et fait foi.
 */

export function LoanFundingSection({ t, plan, cashboxes, availability, values, onChange, money, idPrefix }: {
  t: T;
  plan: LoanFundingPlan;
  cashboxes: Cashbox[];
  /** Disponible au moment de CE prêt (déjà diminué des prêts précédents d'un même lot). */
  availability: Record<string, number>;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  money: (value: number) => string;
  idPrefix: string;
}) {
  const current = cashboxes.find((cashbox) => cashbox.id === plan.currentCashboxId);
  const currentTitle = current?.title ?? '—';
  if (!(plan.principal > 0)) return null;

  if (plan.remainingAfterCurrent === 0) {
    return <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400" data-testid="loan-funding-covered"><CheckCircle2 size={13} />{t('finance', 'fundingCoveredByCurrent', { cashbox: currentTitle })}</p>;
  }

  const others = cashboxes.filter((cashbox) => cashbox.id !== plan.currentCashboxId && (availability[cashbox.id] ?? 0) > 0);
  const missingEvenWithAll = unfundableAmount(plan.remainingAfterCurrent, others.map((cashbox) => availability[cashbox.id] ?? 0));
  const complementTotal = plan.allocatedTotal - plan.currentAmount;
  const toggle = (cashboxId: string, checked: boolean) => {
    const next = { ...values };
    if (checked) {
      const stillNeeded = Math.max(0, plan.remainingAfterCurrent - complementTotal);
      next[cashboxId] = String(Math.min(availability[cashboxId] ?? 0, stillNeeded));
    } else delete next[cashboxId];
    onChange(next);
  };

  return <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40" data-testid="loan-funding">
    <p role="alert" className="flex gap-2 text-amber-800 dark:text-amber-200" data-testid="loan-funding-insufficient">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{t('finance', 'fundingInsufficientCurrent', { cashbox: currentTitle, available: money(plan.currentAvailable), principal: money(plan.principal), remaining: money(plan.remainingAfterCurrent) })}</span>
    </p>
    <div data-testid="loan-funding-complements">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('finance', 'fundingComplementaryTitle')}</p>
      {others.length === 0 && <p className="text-xs text-muted-foreground">{t('finance', 'fundingNoOtherCashbox')}</p>}
      <ul className="space-y-2">
        {others.map((cashbox) => {
          const checked = cashbox.id in values;
          return <li key={cashbox.id} className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-56 items-center gap-2">
              <Checkbox checked={checked} onCheckedChange={(state) => toggle(cashbox.id, state === true)} aria-label={t('finance', 'fundingUseCashbox', { cashbox: cashbox.title })} />
              <span>{t('finance', 'fundingCashboxAvailable', { cashbox: cashbox.title, available: money(availability[cashbox.id] ?? 0) })}</span>
            </label>
            {checked && <AmountInput id={`${idPrefix}-${cashbox.id}`} className="h-8 w-40" value={values[cashbox.id] ?? ''} onValueChange={(amount) => onChange({ ...values, [cashbox.id]: amount })} aria-label={t('finance', 'fundingAmountFrom', { cashbox: cashbox.title })} />}
          </li>;
        })}
      </ul>
    </div>
    <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3" data-testid="loan-funding-summary">
      {plan.allocations.map((allocation) => <div key={allocation.cashboxId} className="flex justify-between gap-2 sm:block"><dt className="text-muted-foreground">{cashboxes.find((cashbox) => cashbox.id === allocation.cashboxId)?.title ?? allocation.cashboxId}</dt><dd className="font-medium">{money(allocation.amount)}</dd></div>)}
      <div className="flex justify-between gap-2 sm:block"><dt className="text-muted-foreground">{t('finance', 'fundingTotal')}</dt><dd className="font-semibold">{money(plan.allocatedTotal)} / {money(plan.principal)}</dd></div>
    </dl>
    {plan.issues.includes('exceedsPrincipal') && <p className="text-xs text-destructive">{t('finance', 'fundingExceedsPrincipal', { principal: money(plan.principal) })}</p>}
    {plan.issues.includes('complementExceedsAvailable') && <p className="text-xs text-destructive">{t('finance', 'fundingExceedsAvailable')}</p>}
    {missingEvenWithAll > 0
      ? <p className="text-xs font-medium text-destructive" data-testid="loan-funding-unfundable">{t('finance', 'fundingUnfundable', { amount: money(missingEvenWithAll) })}</p>
      : plan.isComplete
        ? <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400" data-testid="loan-funding-complete">{t('finance', 'fundingComplete')}</p>
        : plan.remaining > 0 && <p className="text-xs font-medium text-amber-800 dark:text-amber-200" data-testid="loan-funding-remaining">{t('finance', 'fundingRemaining', { amount: money(plan.remaining) })}</p>}
  </div>;
}
