import { cashboxEntryEffect } from '@/mocks/finance/cashboxes';
import type { CashboxRecord } from '@/mocks/finance/cashboxes';
import type { Loan } from '@/mocks/finance/loans';
import type { LoanPenaltyType, LoanRuleInterestPeriod, LoanRuleLoanMode } from '@/mocks/finance/loan-rules';
import type { Repayment } from '@/mocks/finance/repayments';
import type { Transaction } from '@/mocks/finance/transactions';
import { isLoanDisbursement, isLoanRepayment, type TransactionSubcategory } from '@/mocks/finance/transaction-classification';
import { referenceDate } from './reference-date';
import { addDays, addMonths, cashboxPortion, distributeInterest, INTEREST_PERIOD, loanFundingShares, loanInterestAccruals, loanPenaltyAccruals, type GainLine, type InterestAccrual, type InterestDistribution, type PenaltyAccrual, type TontinePurchaseGroup } from './interest-distribution';

export { loanInterestAccruals, loanPenaltyAccruals, type InterestAccrual, type PenaltyAccrual } from './interest-distribution';

/**
 * BILAN FINANCIER DES ADHÉRENTS — un, plusieurs ou tous les adhérents. Fonctions PURES : le
 * contexte est fourni déjà filtré par tenant (`finance-position.service.ts`), aucune lecture de mock.
 *
 * RÈGLES — épargne / situation nette validées le 2026-09-27 ; prêts, intérêts, remboursements et
 * redistributions : RÈGLES MÉTIER DE RÉFÉRENCE du 2026-09-28 (voir interest-distribution.ts) :
 *   - ÉPARGNE VERSÉE = Σ ÉPARGNE − Σ retraits (AUTRES › RETRAIT) de l'adhérent, signées par leur
 *     type, toutes caisses ou la seule caisse filtrée.
 *   - DETTE (flux 1) = capital + intérêts générés + pénalités de retard − remboursements (dossier de prêt,
 *     `Repayment` « completed ») ; intérêts MENSUELS : GLOBAL déterminé à l'origine puis aucun, SIMPLE sur
 *     le capital de référence, COMPOUND sur la dette courante hors pénalités — y compris après `maturityDate`.
 *     Intérêts et pénalités restent deux montants DISTINCTS partout (colonnes, détails, totaux).
 *   - GAINS (flux 2 et 3) = intérêts redistribués + gains Achat tontine reçus, calculés SÉPARÉMENT :
 *     ils ne réduisent jamais la dette de l'adhérent. SOLDE ÉPARGNE = épargne versée + gains.
 *   - Les autres mouvements (cotisation, inscription, secours, achat tontine…) sont affichés À PART.
 *   - Un écart journal ↔ dossier de prêt est SIGNALÉ, jamais corrigé.
 *   - SITUATION NETTE = solde épargne − dette.
 *   - MONTANTS ENTIERS : avec une caisse filtrée, chaque montant d'un prêt (capital, intérêt,
 *     remboursement) est réparti entre ses caisses de financement en parts ENTIÈRES (`cashboxPortion`).
 *   - Aucun report à zéro au changement d'exercice : tout est cumulé depuis l'origine.
 */

export type BalanceSheetCtx = {
  transactions: Transaction[];
  loans: Loan[];
  repayments: Repayment[];
  cashboxes: CashboxRecord[];
  /** Mode de la règle de crédit ACTUELLE — affiché pour un adhérent sans prêt ; les calculs utilisent le mode historisé de chaque prêt. */
  loanMode: LoanRuleLoanMode;
  /** @deprecated Ignoré depuis le 2026-09-29 : lignes du relevé et intérêts TOUJOURS mensuels (`INTEREST_PERIOD`). */
  interestPeriod?: LoanRuleInterestPeriod;
  /** Achats de tontine et membres de leur tontine (redistribution « Achat tontine »). */
  tontinePurchases?: TontinePurchaseGroup[];
};

export type BalanceSheetParams = {
  memberIds: string[];
  asOfDate: string;
  /** Caisse filtrée (`CashboxRecord.id`) ; absent = toutes les caisses. */
  cashboxId?: string;
  /** Premier jour de l'historique mensuel (ex. début de l'exercice) ; absent = première activité de l'adhérent. */
  historyFrom?: string;
  /** Liste des opérations détaillées (calculée à la demande). */
  withOperations?: boolean;
  /** Historique mensuel (défaut : oui) — inutile pour un simple solde d'ouverture. */
  withMonths?: boolean;
  /** Lignes MENSUELLES du relevé de cette date jusqu'à `asOfDate`. */
  linesFrom?: string;
  /** Redistribution déjà calculée (jusqu'à une date ≥ `asOfDate`) — évite de la refaire. */
  distribution?: InterestDistribution;
};

export type MemberLoanLine = {
  loanId: string;
  /** Type d'intérêt HISTORISÉ du prêt (intérêts toujours mensuels). */
  loanMode: LoanRuleLoanMode;
  disbursementDate: string;
  maturityDate: string;
  /** Taux du prêt (% par mois). */
  rate: number;
  /** Pénalité de retard HISTORISÉE du prêt. */
  penaltyEnabled: boolean;
  penaltyType: LoanPenaltyType | null;
  penaltyValue: number;
  /** Part du prêt imputée au périmètre (1 = toutes caisses ; sinon part financée par la caisse filtrée). */
  share: number;
  /** Caisses qui ont financé le prêt (où son intérêt est généré et redistribué). */
  funding: { cashboxId: string; share: number }[];
  principal: number;
  /** Intérêts générés à la date (dette de l'emprunteur). */
  interestAccrued: number;
  /** Pénalités de retard générées à la date (dette de l'emprunteur, jamais redistribuées). */
  penaltiesAccrued: number;
  repaid: number;
  outstanding: number;
  status: 'active' | 'repaid';
};

/** Intérêt généré par un prêt de l'adhérent (traçabilité côté emprunteur). */
export type MemberInterestLine = InterestAccrual & { loanId: string };

/** Pénalité de retard générée par un prêt de l'adhérent. */
export type MemberPenaltyLine = PenaltyAccrual & { loanId: string };

export type BalanceMonthLine = {
  /** `YYYY-MM`. */
  month: string;
  /** Épargne versée cumulée à la fin du mois (ou à la date de situation pour le dernier mois). */
  savings: number;
  /** Dette à la fin du mois (idem). */
  debt: number;
  /** Intérêts générés pendant le mois. */
  interest: number;
  /** Intérêts générés cumulés depuis l'origine. */
  cumulativeInterest: number;
  /** Pénalités de retard générées pendant le mois. */
  penalties: number;
};

/**
 * Ligne du RELEVÉ de l'adhérent — une par MOIS civil, bornée à la période du bilan. Par construction :
 *   soldeÉpargne = soldeÉpargne(ligne précédente) + épargne + gains ;
 *   detteRestante = reportDette + prêts + intérêts + pénalités − remboursements.
 */
export type StatementLine = {
  start: string;
  end: string;
  /** Mouvement net d'épargne versée de la période (versements − retraits). */
  savings: number;
  /** Intérêts redistribués à l'adhérent pendant la période. */
  gains: number;
  /** Solde épargne (versée + gains) à la fin de la période. */
  savingsBalance: number;
  /** Dette reportée de la période précédente (dette au début). */
  debtCarried: number;
  loansDisbursed: number;
  /** Intérêts générés par ses prêts (ajoutés à sa dette). */
  interest: number;
  /** Pénalités de retard générées par ses prêts (ajoutées à sa dette, colonne distincte des intérêts). */
  penalties: number;
  repayments: number;
  /** Dette restante à la fin de la période. */
  debtRemaining: number;
};

export type MemberBalanceSheet = {
  memberId: string;
  asOfDate: string;
  cashboxId: string | null;
  /** Épargne versée (épargne − retraits). */
  savings: number;
  savingsDeposits: number;
  withdrawals: number;
  /** Intérêts redistribués reçus (cumul). */
  gains: number;
  /** Autres mouvements de l'adhérent, par sous-catégorie (informatif, hors situation nette). */
  otherMovements: Partial<Record<TransactionSubcategory, number>>;
  otherMovementsTotal: number;
  debt: number;
  interestAccrued: number;
  penaltiesAccrued: number;
  repayments: number;
  netPosition: number;
  loans: MemberLoanLine[];
  months: BalanceMonthLine[];
  /** Détail des intérêts générés par ses prêts (≤ date). */
  interestLines: MemberInterestLine[];
  /** Détail des pénalités de retard générées par ses prêts (≤ date). */
  penaltyLines: MemberPenaltyLine[];
  /** Détail des gains redistribués reçus (≤ date, caisse filtrée le cas échéant). */
  gainLines: GainLine[];
  /** Σ transactions REMBOURSEMENT du journal (même périmètre) — contrôle de cohérence. */
  journalRepayments: number;
  /** Vrai si le journal et le dossier de prêt divergent sur les remboursements. */
  repaymentsMismatch: boolean;
  /** Prêts sans transaction de décaissement : non rattachables à une caisse (ni filtrée ni redistribution). */
  unattributedLoanIds: string[];
  operations?: Transaction[];
  /** Relevé par période (si `linesFrom`). */
  lines?: StatementLine[];
};

export type BalanceSheetSummary = {
  memberCount: number;
  savings: number;
  gains: number;
  debt: number;
  interestAccrued: number;
  penaltiesAccrued: number;
  repayments: number;
  netPosition: number;
  months: BalanceMonthLine[];
};

const monthOf = (isoDate: string) => isoDate.slice(0, 7);

function endOfMonth(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);
}

/**
 * Découpage calendaire de [from, to] selon la périodicité : jours, semaines ISO (lundi → dimanche),
 * mois civils, années civiles ; la première et la dernière période sont bornées à la plage.
 */
export function periodBuckets(from: string, to: string, period: LoanRuleInterestPeriod): { start: string; end: string }[] {
  const buckets: { start: string; end: string }[] = [];
  let start = from;
  while (start <= to) {
    let end: string;
    if (period === 'DAILY') end = start;
    else if (period === 'WEEKLY') end = addDays(start, (7 - new Date(`${start}T00:00:00Z`).getUTCDay()) % 7);
    else if (period === 'YEARLY') end = `${start.slice(0, 4)}-12-31`;
    else end = endOfMonth(monthOf(start));
    if (end > to) end = to;
    buckets.push({ start, end });
    start = addDays(end, 1);
  }
  return buckets;
}

function monthRange(fromMonth: string, toMonth: string): string[] {
  const result: string[] = [];
  let cursor = `${fromMonth}-01`;
  while (monthOf(cursor) <= toMonth) {
    result.push(monthOf(cursor));
    cursor = addMonths(cursor, 1);
  }
  return result;
}

type MemberIndex = { transactions: Transaction[]; loans: Loan[] };

/** Index unique du contexte (une seule passe sur chaque collection, quel que soit le nombre d'adhérents). */
function indexContext(ctx: BalanceSheetCtx, memberIds: Set<string>) {
  const byMember = new Map<string, MemberIndex>();
  const slot = (memberId: string) => {
    let entry = byMember.get(memberId);
    if (!entry) { entry = { transactions: [], loans: [] }; byMember.set(memberId, entry); }
    return entry;
  };
  // Une transaction sans adhérent n'entre dans le bilan de personne.
  for (const tx of ctx.transactions) if (tx.memberId && memberIds.has(tx.memberId) && tx.status === 'completed') slot(tx.memberId).transactions.push(tx);
  for (const loan of ctx.loans) if (memberIds.has(loan.memberId)) slot(loan.memberId).loans.push(loan);
  const repaymentsByLoan = new Map<string, Repayment[]>();
  for (const repayment of ctx.repayments) {
    const list = repaymentsByLoan.get(repayment.loanId) ?? [];
    list.push(repayment);
    repaymentsByLoan.set(repayment.loanId, list);
  }
  const disbursementsByLoan = new Map<string, Transaction[]>();
  for (const tx of ctx.transactions) {
    if (!tx.loanId || tx.status !== 'completed' || !isLoanDisbursement(tx.category, tx.subcategory)) continue;
    const list = disbursementsByLoan.get(tx.loanId) ?? [];
    list.push(tx);
    disbursementsByLoan.set(tx.loanId, list);
  }
  for (const entry of byMember.values()) entry.transactions.sort((a, b) => referenceDate(a).localeCompare(referenceDate(b)));
  return { byMember, repaymentsByLoan, disbursementsByLoan };
}

const signed = (tx: Transaction) => (tx.type === 'credit' ? tx.amount : -tx.amount);
const isWithdrawal = (tx: Transaction) => tx.category === 'AUTRES' && tx.subcategory === 'RETRAIT';

/** `portion` : part ENTIÈRE d'un montant du prêt imputée au périmètre (identité sans caisse filtrée). */
type PreparedLoan = { loan: Loan; share: number; portion: (amount: number) => number; funding: { cashboxId: string; share: number }[]; repayments: Repayment[]; accruals: InterestAccrual[]; penalties: PenaltyAccrual[] };

function loanStateAt(prepared: PreparedLoan, date: string) {
  const { portion } = prepared;
  const interestAccrued = prepared.accruals.filter((accrual) => accrual.date <= date).reduce((sum, accrual) => sum + portion(accrual.amount), 0);
  const penaltiesAccrued = prepared.penalties.filter((penalty) => penalty.date <= date).reduce((sum, penalty) => sum + portion(penalty.amount), 0);
  const repaid = prepared.repayments.filter((repayment) => repayment.status === 'completed' && repayment.paymentDate <= date).reduce((sum, repayment) => sum + portion(repayment.amount), 0);
  const principal = portion(prepared.loan.principal);
  return { principal, interestAccrued, penaltiesAccrued, repaid, outstanding: principal + interestAccrued + penaltiesAccrued - repaid };
}

type DatedAmount = { date: string; amount: number };

/**
 * Relevé MENSUEL — balayage UNIQUE d'événements triés (épargne, gains, décaissements, intérêts,
 * pénalités, remboursements), mêmes montants que `loanStateAt` et la redistribution : aucune règle
 * nouvelle, seulement un regroupement par mois civil. Intérêts et pénalités restent séparés.
 */
function statementLines(savingsEvents: DatedAmount[], gainEvents: DatedAmount[], prepared: PreparedLoan[], from: string, to: string): StatementLine[] {
  type Kind = 'savings' | 'gain' | 'loan' | 'interest' | 'penalty' | 'repayment';
  const events: (DatedAmount & { kind: Kind })[] = [
    ...savingsEvents.map((event) => ({ ...event, kind: 'savings' as const })),
    ...gainEvents.map((event) => ({ ...event, kind: 'gain' as const })),
  ];
  for (const item of prepared) {
    events.push({ date: item.loan.disbursementDate, amount: item.portion(item.loan.principal), kind: 'loan' });
    for (const accrual of item.accruals) events.push({ date: accrual.date, amount: item.portion(accrual.amount), kind: 'interest' });
    for (const penalty of item.penalties) events.push({ date: penalty.date, amount: item.portion(penalty.amount), kind: 'penalty' });
    for (const repayment of item.repayments) if (repayment.status === 'completed') events.push({ date: repayment.paymentDate, amount: item.portion(repayment.amount), kind: 'repayment' });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  const debtEffect = (event: { kind: Kind; amount: number }) => (event.kind === 'loan' || event.kind === 'interest' || event.kind === 'penalty' ? event.amount : event.kind === 'repayment' ? -event.amount : 0);
  let pointer = 0;
  let savingsBalance = 0;
  let debt = 0;
  while (pointer < events.length && events[pointer].date < from) {
    const event = events[pointer++];
    if (event.kind === 'savings' || event.kind === 'gain') savingsBalance += event.amount;
    else debt += debtEffect(event);
  }
  const lines: StatementLine[] = [];
  for (const bucket of periodBuckets(from, to, INTEREST_PERIOD)) {
    const line: StatementLine = { ...bucket, savings: 0, gains: 0, savingsBalance, debtCarried: debt, loansDisbursed: 0, interest: 0, penalties: 0, repayments: 0, debtRemaining: debt };
    while (pointer < events.length && events[pointer].date <= bucket.end) {
      const event = events[pointer++];
      if (event.kind === 'savings') line.savings += event.amount;
      else if (event.kind === 'gain') line.gains += event.amount;
      else if (event.kind === 'loan') line.loansDisbursed += event.amount;
      else if (event.kind === 'interest') line.interest += event.amount;
      else if (event.kind === 'penalty') line.penalties += event.amount;
      else line.repayments += event.amount;
      debt += debtEffect(event);
    }
    savingsBalance += line.savings + line.gains;
    line.savingsBalance = savingsBalance;
    line.debtRemaining = debt;
    lines.push(line);
  }
  return lines;
}

/**
 * Bilans INDIVIDUELS — un par adhérent demandé (y compris sans aucune opération, tout à 0).
 * Chaque bilan ne lit que les transactions / prêts de SON adhérent et les gains qui lui sont redistribués.
 */
export function memberBalanceSheets(ctx: BalanceSheetCtx, params: BalanceSheetParams): MemberBalanceSheet[] {
  const { asOfDate } = params;
  const cashbox = params.cashboxId ? ctx.cashboxes.find((item) => item.id === params.cashboxId) : undefined;
  const { byMember, repaymentsByLoan, disbursementsByLoan } = indexContext(ctx, new Set(params.memberIds));
  // Redistribution : UNE simulation de toutes les caisses du tenant, partagée par tous les adhérents demandés.
  const distribution = params.distribution ?? distributeInterest(ctx, asOfDate);
  const cashboxIdByNumber = new Map(ctx.cashboxes.map((item) => [item.cashboxNumber, item.id]));

  return params.memberIds.map((memberId) => {
    const index = byMember.get(memberId) ?? { transactions: [], loans: [] };
    // Périmètre : opérations de l'adhérent jusqu'à la date, sur la caisse filtrée (effet vu de la caisse) ou toutes.
    const inScope = index.transactions.filter((tx) => referenceDate(tx) <= asOfDate && (!cashbox || tx.source === cashbox.cashboxNumber || tx.destination === cashbox.cashboxNumber));
    const effect = (tx: Transaction) => (cashbox ? cashboxEntryEffect(cashbox.cashboxNumber, tx) : signed(tx));

    let savingsDeposits = 0;
    let withdrawals = 0;
    let journalRepayments = 0;
    const otherMovements: Partial<Record<TransactionSubcategory, number>> = {};
    for (const tx of inScope) {
      if (tx.category === 'EPARGNE') savingsDeposits += effect(tx);
      else if (isWithdrawal(tx)) withdrawals -= effect(tx);
      else if (isLoanRepayment(tx.category, tx.subcategory)) journalRepayments += tx.amount;
      else if (isLoanDisbursement(tx.category, tx.subcategory)) continue;
      else if (tx.subcategory) otherMovements[tx.subcategory] = (otherMovements[tx.subcategory] ?? 0) + effect(tx);
    }

    const gainLines = (distribution.gainsByMember.get(memberId) ?? []).filter((line) => line.date <= asOfDate && (!cashbox || line.cashboxId === cashbox.id));
    const gains = gainLines.reduce((sum, line) => sum + line.gain, 0);

    // Prêts du dossier, décaissés à la date ; part imputée à la caisse filtrée = part de son financement.
    const unattributedLoanIds: string[] = [];
    const prepared: PreparedLoan[] = [];
    for (const loan of index.loans) {
      if (loan.disbursementDate > asOfDate) continue;
      const shares = loanFundingShares(disbursementsByLoan.get(loan.id) ?? []);
      if (shares.length === 0) unattributedLoanIds.push(loan.id);
      let share = 1;
      let portion = (amount: number) => amount;
      if (cashbox) {
        if (shares.length === 0) continue;
        share = shares.find((item) => item.cashboxNumber === cashbox.cashboxNumber)?.share ?? 0;
        if (share === 0) continue;
        portion = (amount: number) => cashboxPortion(amount, shares, cashbox.cashboxNumber);
      }
      const loanRepayments = repaymentsByLoan.get(loan.id) ?? [];
      const funding = shares.flatMap((item) => { const id = cashboxIdByNumber.get(item.cashboxNumber); return id ? [{ cashboxId: id, share: item.share }] : []; });
      // Date limite du calcul = date de situation (les intérêts ne s'arrêtent plus à l'échéance).
      prepared.push({ loan, share, portion, funding, repayments: loanRepayments, accruals: loanInterestAccruals(loan, loanRepayments, asOfDate), penalties: loanPenaltyAccruals(loan, loanRepayments, asOfDate) });
    }

    const loanLines: MemberLoanLine[] = prepared.map((item) => {
      const state = loanStateAt(item, asOfDate);
      return {
        loanId: item.loan.id,
        loanMode: item.loan.loanMode,
        disbursementDate: item.loan.disbursementDate,
        maturityDate: item.loan.maturityDate,
        rate: item.loan.interestRate,
        penaltyEnabled: item.loan.penaltyEnabled,
        penaltyType: item.loan.penaltyType,
        penaltyValue: item.loan.penaltyValue,
        share: item.share,
        funding: item.funding,
        principal: state.principal,
        interestAccrued: state.interestAccrued,
        penaltiesAccrued: state.penaltiesAccrued,
        repaid: state.repaid,
        outstanding: state.outstanding,
        status: state.outstanding > 0 ? 'active' : 'repaid',
      };
    });
    const interestLines: MemberInterestLine[] = prepared.flatMap((item) => item.accruals
      .filter((accrual) => accrual.date <= asOfDate)
      .map((accrual) => ({ ...accrual, amount: item.portion(accrual.amount), base: item.portion(accrual.base), debtBefore: item.portion(accrual.debtBefore), loanId: item.loan.id })))
      .sort((a, b) => a.date.localeCompare(b.date));
    const penaltyLines: MemberPenaltyLine[] = prepared.flatMap((item) => item.penalties
      .filter((penalty) => penalty.date <= asOfDate)
      .map((penalty) => ({ ...penalty, amount: item.portion(penalty.amount), base: item.portion(penalty.base), debtBefore: item.portion(penalty.debtBefore), loanId: item.loan.id })))
      .sort((a, b) => a.date.localeCompare(b.date));

    const savings = savingsDeposits - withdrawals;
    const debt = loanLines.reduce((sum, line) => sum + line.outstanding, 0);
    const interestAccrued = loanLines.reduce((sum, line) => sum + line.interestAccrued, 0);
    const penaltiesAccrued = loanLines.reduce((sum, line) => sum + line.penaltiesAccrued, 0);
    const repaid = loanLines.reduce((sum, line) => sum + line.repaid, 0);

    // Historique mensuel : stocks en fin de mois (bornés à la date de situation), intérêts du mois.
    const firstActivity = [inScope[0] ? referenceDate(inScope[0]) : undefined, ...prepared.map((item) => item.loan.disbursementDate)].filter((date): date is string => Boolean(date)).sort()[0];
    const fromMonth = params.historyFrom ? monthOf(params.historyFrom) : firstActivity ? monthOf(firstActivity) : undefined;
    const months: BalanceMonthLine[] = [];
    if (params.withMonths !== false && fromMonth && fromMonth <= monthOf(asOfDate)) {
      const savingsTx = inScope.filter((tx) => tx.category === 'EPARGNE' || isWithdrawal(tx));
      let pointer = 0;
      let runningSavings = 0;
      for (const month of monthRange(fromMonth, monthOf(asOfDate))) {
        const end = endOfMonth(month) < asOfDate ? endOfMonth(month) : asOfDate;
        while (pointer < savingsTx.length && referenceDate(savingsTx[pointer]) <= end) runningSavings += effect(savingsTx[pointer++]);
        let monthDebt = 0;
        let monthInterest = 0;
        let monthPenalties = 0;
        let cumulativeInterest = 0;
        for (const item of prepared) {
          if (item.loan.disbursementDate > end) continue;
          const state = loanStateAt(item, end);
          monthDebt += state.outstanding;
          cumulativeInterest += state.interestAccrued;
          monthInterest += item.accruals.filter((accrual) => monthOf(accrual.date) === month && accrual.date <= end).reduce((sum, accrual) => sum + item.portion(accrual.amount), 0);
          monthPenalties += item.penalties.filter((penalty) => monthOf(penalty.date) === month && penalty.date <= end).reduce((sum, penalty) => sum + item.portion(penalty.amount), 0);
        }
        months.push({ month, savings: runningSavings, debt: monthDebt, interest: monthInterest, cumulativeInterest, penalties: monthPenalties });
      }
    }

    const sheet: MemberBalanceSheet = {
      memberId,
      asOfDate,
      cashboxId: cashbox?.id ?? null,
      savings,
      savingsDeposits,
      withdrawals,
      gains,
      otherMovements,
      otherMovementsTotal: Object.values(otherMovements).reduce((sum, value) => sum + (value ?? 0), 0),
      debt,
      interestAccrued,
      penaltiesAccrued,
      repayments: repaid,
      netPosition: savings + gains - debt,
      loans: loanLines,
      months,
      interestLines,
      penaltyLines,
      gainLines,
      journalRepayments,
      repaymentsMismatch: Math.round(journalRepayments) !== Math.round(repaid),
      unattributedLoanIds,
    };
    if (params.withOperations) sheet.operations = [...inScope].reverse();
    if (params.linesFrom && params.linesFrom <= asOfDate) {
      const savingsEvents = inScope.filter((tx) => tx.category === 'EPARGNE' || isWithdrawal(tx)).map((tx) => ({ date: referenceDate(tx), amount: effect(tx) }));
      const gainEvents = gainLines.map((line) => ({ date: line.date, amount: line.gain }));
      sheet.lines = statementLines(savingsEvents, gainEvents, prepared, params.linesFrom, asOfDate);
    }
    return sheet;
  });
}

/** Synthèse = AGRÉGATION des bilans individuels (jamais un calcul parallèle). */
export function summarizeBalanceSheets(sheets: MemberBalanceSheet[]): BalanceSheetSummary {
  const byMonth = new Map<string, BalanceMonthLine>();
  for (const sheet of sheets) {
    for (const line of sheet.months) {
      const current = byMonth.get(line.month) ?? { month: line.month, savings: 0, debt: 0, interest: 0, cumulativeInterest: 0, penalties: 0 };
      current.savings += line.savings;
      current.debt += line.debt;
      current.interest += line.interest;
      current.cumulativeInterest += line.cumulativeInterest;
      current.penalties += line.penalties;
      byMonth.set(line.month, current);
    }
  }
  const sum = (pick: (sheet: MemberBalanceSheet) => number) => sheets.reduce((total, sheet) => total + pick(sheet), 0);
  return {
    memberCount: sheets.length,
    savings: sum((sheet) => sheet.savings),
    gains: sum((sheet) => sheet.gains),
    debt: sum((sheet) => sheet.debt),
    interestAccrued: sum((sheet) => sheet.interestAccrued),
    penaltiesAccrued: sum((sheet) => sheet.penaltiesAccrued),
    repayments: sum((sheet) => sheet.repayments),
    netPosition: sum((sheet) => sheet.netPosition),
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

/**
 * BILAN SUR UNE PÉRIODE — Date de début → Date de fin :
 *   A. situation au DÉBUT = bilan cumulé à la veille de la date de début ;
 *   B. MOUVEMENTS de la période = différence des cumuls fin − début (mêmes règles, aucun calcul parallèle) ;
 *   C. situation à la FIN = bilan cumulé à la date de fin.
 * Par construction : début + mouvements = fin (épargne, gains, dette, situation nette).
 */
export type PeriodPosition = { savings: number; gains: number; debt: number; netPosition: number };
export type PeriodMovements = {
  savingsDeposits: number;
  withdrawals: number;
  gains: number;
  loansDisbursed: number;
  interestAccrued: number;
  penaltiesAccrued: number;
  repayments: number;
  otherMovements: Partial<Record<TransactionSubcategory, number>>;
};
export type MemberPeriodStatement = {
  memberId: string;
  from: string;
  to: string;
  cashboxId: string | null;
  opening: PeriodPosition;
  movements: PeriodMovements;
  closing: PeriodPosition;
  /** Bilan cumulé à la date de fin ; `months`, `operations`, `interestLines`, `gainLines` limités à la période. */
  end: MemberBalanceSheet;
};
export type PeriodSummary = { memberCount: number; opening: PeriodPosition; movements: Omit<PeriodMovements, 'otherMovements'>; closing: PeriodPosition; months: BalanceMonthLine[] };

export type PeriodParams = Omit<BalanceSheetParams, 'asOfDate' | 'historyFrom' | 'linesFrom' | 'distribution'> & {
  from: string;
  to: string;
  /** Relevé mensuel (`MemberBalanceSheet.lines`). */
  withLines?: boolean;
};

const dayBefore = (isoDate: string) => addDays(isoDate, -1);
const loansTotal = (sheet: MemberBalanceSheet) => sheet.loans.reduce((sum, line) => sum + line.principal, 0);
const position = (sheet: MemberBalanceSheet): PeriodPosition => ({ savings: sheet.savings, gains: sheet.gains, debt: sheet.debt, netPosition: sheet.netPosition });

export function memberPeriodStatements(ctx: BalanceSheetCtx, params: PeriodParams): MemberPeriodStatement[] {
  if (params.from > params.to) throw new Error('Période invalide : la date de début est postérieure à la date de fin.');
  const { memberIds, cashboxId, withOperations } = params;
  const distribution = distributeInterest(ctx, params.to);
  const openingSheets = memberBalanceSheets(ctx, { memberIds, cashboxId, asOfDate: dayBefore(params.from), withMonths: false, distribution });
  const endSheets = memberBalanceSheets(ctx, { memberIds, cashboxId, asOfDate: params.to, historyFrom: params.from, withOperations, withMonths: params.withMonths, linesFrom: params.withLines ? params.from : undefined, distribution });
  return endSheets.map((end, index) => {
    const start = openingSheets[index];
    const otherMovements: Partial<Record<TransactionSubcategory, number>> = {};
    for (const key of new Set([...Object.keys(start.otherMovements), ...Object.keys(end.otherMovements)]) as Set<TransactionSubcategory>) {
      const delta = (end.otherMovements[key] ?? 0) - (start.otherMovements[key] ?? 0);
      if (delta !== 0) otherMovements[key] = delta;
    }
    if (end.operations) end.operations = end.operations.filter((tx) => referenceDate(tx) >= params.from);
    end.interestLines = end.interestLines.filter((line) => line.date >= params.from);
    end.penaltyLines = end.penaltyLines.filter((line) => line.date >= params.from);
    end.gainLines = end.gainLines.filter((line) => line.date >= params.from);
    return {
      memberId: end.memberId,
      from: params.from,
      to: params.to,
      cashboxId: end.cashboxId,
      opening: position(start),
      movements: {
        savingsDeposits: end.savingsDeposits - start.savingsDeposits,
        withdrawals: end.withdrawals - start.withdrawals,
        gains: end.gains - start.gains,
        loansDisbursed: loansTotal(end) - loansTotal(start),
        interestAccrued: end.interestAccrued - start.interestAccrued,
        penaltiesAccrued: end.penaltiesAccrued - start.penaltiesAccrued,
        repayments: end.repayments - start.repayments,
        otherMovements,
      },
      closing: position(end),
      end,
    };
  });
}

/** Synthèse de période = AGRÉGATION des bilans de période individuels. */
export function summarizePeriodStatements(statements: MemberPeriodStatement[]): PeriodSummary {
  const sum = (pick: (statement: MemberPeriodStatement) => number) => statements.reduce((total, statement) => total + pick(statement), 0);
  const positionSum = (pick: (statement: MemberPeriodStatement) => PeriodPosition): PeriodPosition => ({
    savings: sum((s) => pick(s).savings), gains: sum((s) => pick(s).gains), debt: sum((s) => pick(s).debt), netPosition: sum((s) => pick(s).netPosition),
  });
  return {
    memberCount: statements.length,
    opening: positionSum((s) => s.opening),
    movements: {
      savingsDeposits: sum((s) => s.movements.savingsDeposits),
      withdrawals: sum((s) => s.movements.withdrawals),
      gains: sum((s) => s.movements.gains),
      loansDisbursed: sum((s) => s.movements.loansDisbursed),
      interestAccrued: sum((s) => s.movements.interestAccrued),
      penaltiesAccrued: sum((s) => s.movements.penaltiesAccrued),
      repayments: sum((s) => s.movements.repayments),
    },
    closing: positionSum((s) => s.closing),
    months: summarizeBalanceSheets(statements.map((statement) => statement.end)).months,
  };
}

/**
 * Période par défaut, dérivée de l'exercice du HEADER : début = début de l'exercice ; fin =
 * MIN(aujourd'hui, fin de l'exercice) — jamais avant le début. Ce ne sont que des VALEURS PAR
 * DÉFAUT : la fin reste librement modifiable, sans changer l'exercice du header.
 */
export function defaultBalancePeriod(fiscalYear: { startDate: string; endDate: string } | null, today = new Date().toISOString().slice(0, 10)): { from: string; to: string } {
  if (!fiscalYear) return { from: today, to: today };
  const end = today < fiscalYear.endDate ? today : fiscalYear.endDate;
  return { from: fiscalYear.startDate, to: end < fiscalYear.startDate ? fiscalYear.startDate : end };
}
