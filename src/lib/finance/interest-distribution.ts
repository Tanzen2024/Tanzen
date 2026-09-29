import { cashboxEntryEffect, type CashboxRecord } from '@/mocks/finance/cashboxes';
import type { Loan } from '@/mocks/finance/loans';
import type { LoanRuleInterestPeriod, LoanRuleLoanMode } from '@/mocks/finance/loan-rules';
import type { Repayment } from '@/mocks/finance/repayments';
import type { Transaction } from '@/mocks/finance/transactions';
import { isLoanDisbursement, isLoanRepayment } from '@/mocks/finance/transaction-classification';
import { referenceDate } from './reference-date';

/**
 * PRÊTS, INTÉRÊTS, REMBOURSEMENTS ET REDISTRIBUTIONS — RÈGLES MÉTIER DE RÉFÉRENCE (validées par
 * Hugues le 2026-09-28, elles remplacent toute règle antérieure). Fonctions PURES, contexte déjà
 * filtré par tenant par le service. DEUX FLUX DISTINCTS :
 *
 * FLUX 1 — DETTE DU PRÊT (`loanInterestAccruals`, `loanDebtAt`), paramètres HISTORISÉS sur le prêt
 * (`Loan.loanMode`, `Loan.interestRate` en % par période, `Loan.interestPeriod`), jamais la règle courante :
 *   - GLOBAL   : intérêt = capital × taux, déterminé UNE fois à l'origine (date de décaissement) et
 *                AJOUTÉ à la dette (100 000 à 25 % → 125 000 à rembourser). Aucun intérêt périodique
 *                ensuite ; les remboursements réduisent la dette restante.
 *   - SIMPLE   : intérêt de chaque période = CAPITAL DE RÉFÉRENCE × taux. Le capital de référence est
 *                le capital initial, puis la DETTE RESTANTE juste après chaque remboursement ; il ne
 *                change pas tant qu'aucun nouveau remboursement n'intervient — les intérêts suivants ne
 *                sont pas capitalisés dans la base (15 % : 100 000 → 115 000, remb. 20 000 → 95 000 ;
 *                puis 95 000 × 15 % à chaque période : 109 250, 123 500, 137 750, 152 000…).
 *   - COMPOUND : intérêt de chaque période = DETTE COURANTE × taux ; l'intérêt est capitalisé
 *                (10 % : 100 000 → 110 000, remb. 20 000 → 90 000 → 99 000 → 108 900…).
 *   Calendrier : une échéance d'intérêt par période après le décaissement (la dernière à l'échéance
 *   finale du prêt). Un remboursement daté AVANT une échéance est appliqué avant son intérêt ; daté du
 *   jour même d'une échéance, il est appliqué après (mois M : intérêt, puis remboursement). Plus
 *   d'intérêt quand la dette est soldée, ni après l'échéance finale (aucune règle de pénalité).
 *
 * FLUX 2 — REDISTRIBUTION (`distributeInterest`), calculée SÉPARÉMENT : elle ne modifie jamais la dette
 * de l'emprunteur. Toujours dans la caisse source (la caisse qui a financé le prêt, au prorata de ses
 * décaissements) :
 *   - caisse classique : membres dont le SOLDE DANS CETTE CAISSE est STRICTEMENT POSITIF, au prorata ;
 *   - caisse « Achat tontine » (`systemCode: 'TONTINE_PURCHASE'`) : le montant d'un achat de tontine
 *     (FLUX 3) est partagé À PARTS ÉGALES entre les membres de la tontine de l'achat ; un intérêt de prêt
 *     financé par cette caisse, à parts égales entre les membres des tontines ayant alimenté la caisse.
 *   Solde d'un membre dans une caisse = ses mouvements dans la caisse, hors prêts / remboursements /
 *   transferts / distributions / achats de tontine, plus les gains déjà reçus dans cette caisse.
 *
 * MONTANTS ENTIERS : chaque intérêt est arrondi à l'entier (`roundMoney`) ; toute répartition d'un
 * montant entier (entre caisses, entre adhérents) utilise `allocateInteger` — Σ parts = montant exact,
 * reliquat attribué de façon déterministe et tracé (`GainLine.roundingAdjustment`).
 */

export type InterestAccrual = {
  date: string;
  amount: number;
  /** Base de calcul : capital (GLOBAL), capital de référence (SIMPLE) ou dette courante (COMPOUND). */
  base: number;
  /** Taux appliqué, en % par période. */
  rate: number;
  periodStart: string;
  /** Dette avant l'intérêt de cette échéance (après les remboursements antérieurs). */
  debtBefore: number;
};

/** ARRONDI MONÉTAIRE unique de Tanzen : à l'entier le plus proche, demi arrondi à l'unité supérieure (en valeur absolue). */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.sign(value) * Math.round(Math.abs(value) + 1e-9);
}

/**
 * RÉPARTITION ENTIÈRE d'un montant entier selon des poids (méthode du plus fort reste) :
 * chaque part = partie entière de la part théorique, puis le reliquat est attribué, une unité à la
 * fois, aux plus fortes parties décimales (à égalité : ordre des poids fournis). Σ parts = total, toujours.
 */
export function allocateInteger(total: number, weights: number[]): { amount: number; theoretical: number; adjustment: number }[] {
  const amount = roundMoney(total);
  const sum = weights.reduce((acc, weight) => acc + Math.max(0, weight), 0);
  if (weights.length === 0) return [];
  if (!(sum > 0)) return weights.map(() => ({ amount: 0, theoretical: 0, adjustment: 0 }));
  const theoretical = weights.map((weight) => (amount * Math.max(0, weight)) / sum);
  const floors = theoretical.map((value) => Math.floor(value + 1e-9));
  let remainder = amount - floors.reduce((acc, value) => acc + value, 0);
  const order = theoretical.map((value, index) => ({ index, fraction: value - floors[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const adjustments = weights.map(() => 0);
  for (const { index } of order) {
    if (remainder <= 0) break;
    adjustments[index] = 1;
    remainder -= 1;
  }
  return theoretical.map((value, index) => ({ amount: floors[index] + adjustments[index], theoretical: value, adjustment: adjustments[index] }));
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/** Date + k périodes de la périodicité du taux. */
export function addPeriods(isoDate: string, count: number, period: LoanRuleInterestPeriod): string {
  switch (period) {
    case 'DAILY': return addDays(isoDate, count);
    case 'WEEKLY': return addDays(isoDate, 7 * count);
    case 'YEARLY': return addMonths(isoDate, 12 * count);
    case 'MONTHLY':
    default: return addMonths(isoDate, count);
  }
}

/** Échéancier des intérêts GÉNÉRÉS par un prêt, selon SES paramètres historisés (toutes dates ; l'appelant borne à sa date de situation). */
export function loanInterestAccruals(loan: Loan, loanRepayments: Repayment[]): InterestAccrual[] {
  const { loanMode, interestPeriod } = loan;
  const rate = loan.interestRate ?? 0;
  if (!(rate > 0) || !(loan.principal > 0)) return [];
  if (loanMode === 'GLOBAL') {
    // Déterminé à l'origine, ajouté à la dette, jamais recalculé ensuite.
    return [{ date: loan.disbursementDate, amount: roundMoney((loan.principal * rate) / 100), base: loan.principal, rate, periodStart: loan.disbursementDate, debtBefore: loan.principal }];
  }
  const dates: string[] = [];
  for (let k = 1; ; k += 1) {
    const date = addPeriods(loan.disbursementDate, k, interestPeriod);
    if (date >= loan.maturityDate) break;
    dates.push(date);
  }
  dates.push(loan.maturityDate > loan.disbursementDate ? loan.maturityDate : addPeriods(loan.disbursementDate, 1, interestPeriod));
  const completed = loanRepayments.filter((repayment) => repayment.status === 'completed').sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  const accruals: InterestAccrual[] = [];
  let debt = loan.principal;
  let referenceCapital = loan.principal; // SIMPLE : capital initial, puis dette restante après chaque remboursement
  let pointer = 0;
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index];
    // Remboursements datés avant cette échéance : appliqués avant son intérêt.
    while (pointer < completed.length && completed[pointer].paymentDate < date) {
      debt -= completed[pointer].amount;
      referenceCapital = debt;
      pointer += 1;
    }
    if (debt <= 0) break;
    const base = loanMode === 'COMPOUND' ? debt : referenceCapital;
    if (base <= 0) break;
    const amount = roundMoney((base * rate) / 100);
    accruals.push({ date, amount, base, rate, periodStart: index === 0 ? loan.disbursementDate : dates[index - 1], debtBefore: debt });
    debt += amount;
  }
  return accruals;
}

/** DETTE COURANTE d'un prêt à une date = capital + Σ intérêts générés (≤ date) − Σ remboursements réalisés (≤ date). Source unique pour le bilan ET le module Crédit. */
export function loanDebtAt(loan: Loan, loanRepayments: Repayment[], date: string): number {
  if (loan.disbursementDate > date) return 0;
  const interest = loanInterestAccruals(loan, loanRepayments).filter((accrual) => accrual.date <= date).reduce((sum, accrual) => sum + accrual.amount, 0);
  const repaid = loanRepayments.filter((repayment) => repayment.status === 'completed' && repayment.paymentDate <= date).reduce((sum, repayment) => sum + repayment.amount, 0);
  return loan.principal + interest - repaid;
}

/** Achat de tontine (transaction ACHAT_TONTINE) et personnes appartenant à sa tontine à la date de l'achat. */
export type TontinePurchaseGroup = { transactionId: string; tontineId: string; tontineName: string; memberIds: string[] };

export type InterestSource =
  | { kind: 'LOAN'; loanId: string; borrowerId: string; loanMode: LoanRuleLoanMode; interestPeriod: LoanRuleInterestPeriod; base: number; rate: number; loanInterest: number }
  | { kind: 'TONTINE_PURCHASE'; transactionId: string; tontineId: string; tontineName: string };

export type GainLine = {
  date: string;
  cashboxId: string;
  cashboxTitle: string;
  source: InterestSource;
  /** Montant (entier) redistribué dans la caisse par cette source (part de la caisse). */
  generated: number;
  rule: 'PROPORTIONAL' | 'EQUAL';
  /** PROPORTIONAL : solde du membre dans la caisse / Σ soldes strictement positifs. */
  memberBalance: number;
  eligibleTotal: number;
  eligibleCount: number;
  share: number;
  /** Part théorique (avant arrondi) et ajustement de reliquat (0 ou 1) : gain = partie entière + ajustement. */
  theoretical: number;
  roundingAdjustment: number;
  /** Gain ENTIER attribué au membre. */
  gain: number;
};

export type UndistributedInterest = { date: string; cashboxId: string | null; amount: number; reason: 'NO_ELIGIBLE_MEMBER' | 'UNATTRIBUTED_LOAN' | 'UNKNOWN_TONTINE'; source: InterestSource };

export type InterestDistribution = { gainsByMember: Map<string, GainLine[]>; undistributed: UndistributedInterest[] };

export type DistributionCtx = {
  transactions: Transaction[];
  loans: Loan[];
  repayments: Repayment[];
  cashboxes: CashboxRecord[];
  tontinePurchases?: TontinePurchaseGroup[];
};

const isTontinePurchase = (tx: Transaction) => tx.category === 'AUTRES' && tx.subcategory === 'ACHAT_TONTINE';
/** Mouvement comptant dans le solde d'un membre dans une caisse (classification de `memberFinancialPosition`). */
const countsInMemberBalance = (tx: Transaction) => !isLoanDisbursement(tx.category, tx.subcategory) && !isLoanRepayment(tx.category, tx.subcategory)
  && !(tx.category === 'AUTRES' && (tx.subcategory === 'TRANSFERT' || tx.subcategory === 'DISTRIBUTION')) && !isTontinePurchase(tx);

/** Parts de financement d'un prêt par caisse (transactions de décaissement du prêt) : montant décaissé par caisse et part. */
export function loanFundingShares(disbursements: Transaction[]): { cashboxNumber: string; share: number; amount: number }[] {
  const total = disbursements.reduce((sum, tx) => sum + tx.amount, 0);
  if (!(total > 0)) return [];
  const byCashbox = new Map<string, number>();
  for (const tx of disbursements) byCashbox.set(tx.source, (byCashbox.get(tx.source) ?? 0) + tx.amount);
  return [...byCashbox].map(([cashboxNumber, amount]) => ({ cashboxNumber, share: amount / total, amount }));
}

/** Part ENTIÈRE d'un montant revenant à une caisse de financement (répartition au plus fort reste entre les caisses du prêt). */
export function cashboxPortion(amount: number, shares: { cashboxNumber: string; amount: number }[], cashboxNumber: string): number {
  const index = shares.findIndex((item) => item.cashboxNumber === cashboxNumber);
  if (index < 0) return 0;
  return allocateInteger(amount, shares.map((item) => item.amount))[index].amount;
}

/**
 * Simulation UNIQUE, chronologique, de toutes les caisses du tenant jusqu'à `upTo` : un seul tri
 * d'événements, O(événements × membres de la caisse) — quel que soit le nombre d'adhérents demandés.
 */
export function distributeInterest(ctx: DistributionCtx, upTo: string): InterestDistribution {
  const cashboxByNumber = new Map(ctx.cashboxes.map((cashbox) => [cashbox.cashboxNumber, cashbox]));
  const groupByTransaction = new Map((ctx.tontinePurchases ?? []).map((group) => [group.transactionId, group]));
  type Event = { date: string; order: number; apply: () => void };
  const events: Event[] = [];
  const balances = new Map<string, Map<string, number>>();
  const balancesOf = (cashboxNumber: string) => { let map = balances.get(cashboxNumber); if (!map) { map = new Map(); balances.set(cashboxNumber, map); } return map; };
  const gainsByMember = new Map<string, GainLine[]>();
  const undistributed: UndistributedInterest[] = [];
  const purchaseMembersByCashbox = new Map<string, { date: string; memberIds: string[] }[]>();

  const disbursementsByLoan = new Map<string, Transaction[]>();
  for (const tx of ctx.transactions) {
    if (tx.status !== 'completed') continue;
    const date = referenceDate(tx);
    if (date > upTo) continue;
    if (tx.loanId && isLoanDisbursement(tx.category, tx.subcategory)) {
      const list = disbursementsByLoan.get(tx.loanId) ?? [];
      list.push(tx);
      disbursementsByLoan.set(tx.loanId, list);
    }
    if (isTontinePurchase(tx)) {
      const cashbox = cashboxByNumber.get(tx.destination);
      const group = groupByTransaction.get(tx.id);
      const source: InterestSource = { kind: 'TONTINE_PURCHASE', transactionId: tx.id, tontineId: group?.tontineId ?? '', tontineName: group?.tontineName ?? '' };
      if (!cashbox || !group) { undistributed.push({ date, cashboxId: cashbox?.id ?? null, amount: tx.amount, reason: 'UNKNOWN_TONTINE', source }); continue; }
      const list = purchaseMembersByCashbox.get(cashbox.cashboxNumber) ?? [];
      list.push({ date, memberIds: group.memberIds });
      purchaseMembersByCashbox.set(cashbox.cashboxNumber, list);
      events.push({ date, order: 1, apply: () => distribute(cashbox, date, tx.amount, source, group.memberIds) });
      continue;
    }
    if (!tx.memberId || !countsInMemberBalance(tx)) continue;
    for (const number of new Set([tx.source, tx.destination])) {
      if (!cashboxByNumber.has(number)) continue;
      const memberId = tx.memberId;
      const effect = cashboxEntryEffect(number, tx);
      events.push({ date, order: 0, apply: () => { const map = balancesOf(number); map.set(memberId, (map.get(memberId) ?? 0) + effect); } });
    }
  }

  const repaymentsByLoan = new Map<string, Repayment[]>();
  for (const repayment of ctx.repayments) {
    const list = repaymentsByLoan.get(repayment.loanId) ?? [];
    list.push(repayment);
    repaymentsByLoan.set(repayment.loanId, list);
  }
  for (const loan of ctx.loans) {
    if (loan.disbursementDate > upTo) continue;
    const shares = loanFundingShares(disbursementsByLoan.get(loan.id) ?? []);
    for (const accrual of loanInterestAccruals(loan, repaymentsByLoan.get(loan.id) ?? [])) {
      if (accrual.date > upTo) continue;
      const source: InterestSource = { kind: 'LOAN', loanId: loan.id, borrowerId: loan.memberId, loanMode: loan.loanMode, interestPeriod: loan.interestPeriod, base: accrual.base, rate: accrual.rate, loanInterest: accrual.amount };
      if (shares.length === 0) { undistributed.push({ date: accrual.date, cashboxId: null, amount: accrual.amount, reason: 'UNATTRIBUTED_LOAN', source }); continue; }
      // Intérêt ENTIER réparti entre les caisses de financement (Σ parts = intérêt).
      const portions = allocateInteger(accrual.amount, shares.map((item) => item.amount));
      shares.forEach(({ cashboxNumber }, index) => {
        const portion = portions[index].amount;
        const cashbox = cashboxByNumber.get(cashboxNumber);
        if (!cashbox) { undistributed.push({ date: accrual.date, cashboxId: null, amount: portion, reason: 'UNATTRIBUTED_LOAN', source }); return; }
        events.push({ date: accrual.date, order: 1, apply: () => {
          const members = cashbox.systemCode === 'TONTINE_PURCHASE'
            ? [...new Set((purchaseMembersByCashbox.get(cashboxNumber) ?? []).filter((item) => item.date <= accrual.date).flatMap((item) => item.memberIds))]
            : undefined;
          distribute(cashbox, accrual.date, portion, source, members);
        } });
      });
    }
  }

  function credit(memberId: string, line: GainLine, cashboxNumber: string) {
    const list = gainsByMember.get(memberId) ?? [];
    list.push(line);
    gainsByMember.set(memberId, list);
    const map = balancesOf(cashboxNumber);
    map.set(memberId, (map.get(memberId) ?? 0) + line.gain);
  }

  /** `equalMembers` défini → parts égales (Achat tontine) ; sinon prorata des soldes strictement positifs. Parts ENTIÈRES, Σ = montant. */
  function distribute(cashbox: CashboxRecord, date: string, amount: number, source: InterestSource, equalMembers?: string[]) {
    if (!(amount > 0)) return;
    const base = { date, cashboxId: cashbox.id, cashboxTitle: cashbox.title, source, generated: amount };
    if (equalMembers) {
      if (equalMembers.length === 0) { undistributed.push({ date, cashboxId: cashbox.id, amount, reason: 'NO_ELIGIBLE_MEMBER', source }); return; }
      // Ordre déterministe des bénéficiaires (identifiant) : le reliquat d'arrondi va aux premiers.
      const members = [...equalMembers].sort();
      const parts = allocateInteger(amount, members.map(() => 1));
      members.forEach((memberId, index) => credit(memberId, { ...base, rule: 'EQUAL', memberBalance: 0, eligibleTotal: 0, eligibleCount: members.length, share: 1 / members.length, theoretical: parts[index].theoretical, roundingAdjustment: parts[index].adjustment, gain: parts[index].amount }, cashbox.cashboxNumber));
      return;
    }
    const eligible = [...balancesOf(cashbox.cashboxNumber)].filter(([, balance]) => balance > 0).sort(([a], [b]) => a.localeCompare(b));
    const total = eligible.reduce((sum, [, balance]) => sum + balance, 0);
    if (eligible.length === 0 || !(total > 0)) { undistributed.push({ date, cashboxId: cashbox.id, amount, reason: 'NO_ELIGIBLE_MEMBER', source }); return; }
    const parts = allocateInteger(amount, eligible.map(([, balance]) => balance));
    eligible.forEach(([memberId, balance], index) => {
      credit(memberId, { ...base, rule: 'PROPORTIONAL', memberBalance: balance, eligibleTotal: total, eligibleCount: eligible.length, share: balance / total, theoretical: parts[index].theoretical, roundingAdjustment: parts[index].adjustment, gain: parts[index].amount }, cashbox.cashboxNumber);
    });
  }

  // Même date : les mouvements de solde passent avant la redistribution (solde « au moment » de la redistribution).
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  for (const event of events) event.apply();
  return { gainsByMember, undistributed };
}
