import { cashboxEntryEffect, type CashboxRecord } from '@/mocks/finance/cashboxes';
import type { Loan } from '@/mocks/finance/loans';
import type { LoanPenaltyType, LoanRuleInterestPeriod, LoanRuleLoanMode } from '@/mocks/finance/loan-rules';
import type { Repayment } from '@/mocks/finance/repayments';
import type { Transaction } from '@/mocks/finance/transactions';
import { isLoanDisbursement, isLoanRepayment } from '@/mocks/finance/transaction-classification';
import { referenceDate } from './reference-date';

/**
 * PRÊTS, INTÉRÊTS, PÉNALITÉS, REMBOURSEMENTS ET REDISTRIBUTIONS — RÈGLES MÉTIER DE RÉFÉRENCE du 2026-09-28,
 * complétées par les RÈGLES DÉFINITIVES du 2026-09-29 (intérêts toujours mensuels, intérêts au-delà de
 * l'échéance, pénalités de retard). Fonctions PURES, contexte déjà filtré par tenant par le service.
 *
 * FLUX 1 — DETTE DU PRÊT (`loanState` / `loanSchedule` → `loanInterestAccruals`, `loanPenaltyAccruals`,
 * `loanDebtAt`), paramètres HISTORISÉS sur le prêt (`Loan.loanMode`, `Loan.interestRate` en % PAR MOIS,
 * `Loan.penaltyEnabled / penaltyType / penaltyValue`), jamais la règle courante :
 *   - PÉRIODICITÉ : TOUJOURS MENSUELLE (`INTEREST_PERIOD`). Aucune fréquence de réunion, de séance, de
 *     tontine, ni `Loan.interestPeriod` (donnée historique conservée pour compatibilité) n'intervient.
 *   - GLOBAL   : intérêt = capital × taux, déterminé UNE fois à l'origine (date de décaissement) et
 *                AJOUTÉ à la dette (100 000 à 25 % → 125 000 à rembourser). EXCEPTION MÉTIER EXPLICITE
 *                (décision définitive du 2026-09-30) à la règle des intérêts mensuels : aucun intérêt
 *                périodique, ni avant ni APRÈS `maturityDate` — ne jamais le traiter comme SIMPLE / COMPOUND.
 *                Les pénalités de retard s'y appliquent comme à tout prêt.
 *   - SIMPLE   : intérêt mensuel = CAPITAL DE RÉFÉRENCE × taux (capital initial, puis dette restante hors
 *                pénalités juste après chaque remboursement ; les intérêts suivants ne sont pas capitalisés
 *                dans la base : 15 % : 100 000 → 115 000, remb. 20 000 → 95 000 ; puis 95 000 × 15 %…).
 *   - COMPOUND : intérêt mensuel = DETTE COURANTE HORS PÉNALITÉS × taux (capital + intérêts − remboursements ;
 *                10 % : 100 000 → 110 000, remb. 20 000 → 90 000 → 99 000 → 108 900…).
 *   Calendrier : une échéance au même quantième chaque mois après le décaissement (`addMonths`, bornée à la
 *   fin de mois). `maturityDate` N'ARRÊTE PAS les intérêts : ils continuent tant que la dette > 0, jusqu'à la
 *   date limite `until` fournie par l'appelant (OBLIGATOIRE — jamais de calendrier infini). Un remboursement
 *   daté AVANT une échéance est appliqué avant son intérêt ; daté du jour même, après (mois M : intérêt, puis
 *   remboursement).
 *   PÉNALITÉ DE RETARD (si `penaltyEnabled`) : à CHAQUE échéance mensuelle postérieure à `maturityDate` tant
 *   que la dette > 0 (échéance non alignée, décision du 2026-09-30 : décaissement le 25, échéance le 10/07 →
 *   1re pénalité le 25/07, jamais le 10/07 ni d'intérêt supplémentaire ce jour-là), APRÈS l'intérêt du mois — FIXED : `penaltyValue` ; PERCENTAGE : dette à `maturityDate`
 *   (hors pénalités) × `penaltyValue` %, base FIGÉE pendant tout le retard. La pénalité s'ajoute à la dette
 *   mais n'entre jamais dans la base des intérêts. Un remboursement s'impute d'abord sur la dette hors
 *   pénalités (capital + intérêts), le reliquat sur les pénalités (base intérêt = capital + intérêts − remb.).
 *
 * FLUX 2 — REDISTRIBUTION (`distributeInterest`), calculée SÉPARÉMENT : elle ne modifie jamais la dette
 * de l'emprunteur et ne traite QUE les événements INTEREST (jamais les pénalités). Toujours dans la caisse
 * source (la caisse qui a financé le prêt, au prorata de ses décaissements) :
 *   - caisse classique : membres dont le SOLDE DANS CETTE CAISSE est STRICTEMENT POSITIF, au prorata ;
 *   - caisse « Achat tontine » (`systemCode: 'TONTINE_PURCHASE'`) : le montant d'un achat de tontine
 *     (FLUX 3) est partagé À PARTS ÉGALES entre les membres de la tontine de l'achat ; un intérêt de prêt
 *     financé par cette caisse, à parts égales entre les membres des tontines ayant alimenté la caisse.
 *   Solde d'un membre dans une caisse = ses mouvements dans la caisse, hors prêts / remboursements /
 *   transferts / distributions / achats de tontine, plus les gains déjà reçus dans cette caisse.
 *
 * MONTANTS ENTIERS : chaque intérêt et chaque pénalité est arrondi à l'entier (`roundMoney`) ; toute
 * répartition d'un montant entier (entre caisses, entre adhérents) utilise `allocateInteger` — Σ parts =
 * montant exact, reliquat attribué de façon déterministe et tracé (`GainLine.roundingAdjustment`).
 */

/** Périodicité UNIQUE des intérêts (règle définitive du 2026-09-29) — indépendante de toute fréquence métier. */
export const INTEREST_PERIOD = 'MONTHLY' as const satisfies LoanRuleInterestPeriod;

export type InterestAccrual = {
  date: string;
  amount: number;
  /** Base de calcul : capital (GLOBAL), capital de référence (SIMPLE) ou dette courante (COMPOUND). */
  base: number;
  /** Taux appliqué, en % par mois (`INTEREST_PERIOD`). */
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

/** Date + N mois, bornée au dernier jour du mois cible (31/01 + 1 mois = 28/02, jamais 03/03 : aucun mois sauté). */
export function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

/** Date + k périodes (découpages calendaires uniquement ; les intérêts n'utilisent que `addMonths`, cf. `INTEREST_PERIOD`). */
export function addPeriods(isoDate: string, count: number, period: LoanRuleInterestPeriod): string {
  switch (period) {
    case 'DAILY': return addDays(isoDate, count);
    case 'WEEKLY': return addDays(isoDate, 7 * count);
    case 'YEARLY': return addMonths(isoDate, 12 * count);
    case 'MONTHLY':
    default: return addMonths(isoDate, count);
  }
}

/** Pénalité de retard générée par un prêt — événement distinct de l'intérêt, jamais redistribué. */
export type PenaltyAccrual = {
  date: string;
  amount: number;
  /** PERCENTAGE : dette à `maturityDate` hors pénalités (base figée) ; FIXED : 0 (aucune base). */
  base: number;
  penaltyType: LoanPenaltyType;
  /** FCFA (FIXED) ou % (PERCENTAGE), historisé sur le prêt. */
  penaltyValue: number;
  /** Rang du mois de retard (1 = première échéance mensuelle postérieure à `maturityDate`). */
  lateMonth: number;
  /** Dette totale (pénalités comprises) avant cette pénalité. */
  debtBefore: number;
};

export type LoanEventKind = 'LOAN' | 'INTEREST' | 'PENALTY' | 'REPAYMENT';

/**
 * Événement financier d'un prêt. `debtBefore` / `debtAfter` = dette TOTALE (capital + intérêts + pénalités
 * − remboursements) autour de l'événement. INTEREST : `base`, `rate` (% par mois), `periodStart`,
 * `interestDebtBefore` (dette hors pénalités). PENALTY : `base`, `penaltyType`, `penaltyValue`, `lateMonth`.
 * REPAYMENT : `penaltyPart` = part imputée sur les pénalités.
 */
export type LoanEvent = {
  date: string;
  kind: LoanEventKind;
  amount: number;
  base: number;
  rate?: number;
  periodStart?: string;
  interestDebtBefore?: number;
  penaltyType?: LoanPenaltyType;
  penaltyValue?: number;
  lateMonth?: number;
  penaltyPart?: number;
  debtBefore: number;
  debtAfter: number;
};

/** Calendrier d'un prêt et son état à la date limite : dette hors pénalités (porteuse d'intérêts) et pénalités dues. */
export type LoanState = { events: LoanEvent[]; interestDebt: number; penaltyDebt: number; debt: number };

/**
 * MOTEUR UNIQUE d'un prêt jusqu'à `until` INCLUS (obligatoire : les intérêts ne s'arrêtent plus à
 * l'échéance, le calendrier ne serait jamais borné sans lui). Pour chaque échéance mensuelle :
 * remboursements datés avant l'échéance → dette > 0 ? → intérêt → retard (échéance > `maturityDate`) ? →
 * pénalité. Les remboursements datés après la dernière échéance (≤ `until`) sont appliqués en fin de calcul.
 */
export function loanState(loan: Loan, loanRepayments: Repayment[], until: string): LoanState {
  if (!until) throw new Error('loanSchedule : date limite `until` obligatoire.');
  const events: LoanEvent[] = [];
  if (loan.disbursementDate > until) return { events, interestDebt: 0, penaltyDebt: 0, debt: 0 };
  const { loanMode } = loan;
  const rate = loan.interestRate ?? 0;
  const bearsInterest = rate > 0 && loan.principal > 0;
  const completed = loanRepayments
    .filter((repayment) => repayment.status === 'completed' && repayment.paymentDate <= until)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  let interestDebt = loan.principal; // capital + intérêts − remboursements : base COMPOUND, jamais les pénalités
  let penaltyDebt = 0;
  let referenceCapital = loan.principal; // SIMPLE : capital initial, puis dette hors pénalités après chaque remboursement
  const total = () => interestDebt + penaltyDebt;
  events.push({ date: loan.disbursementDate, kind: 'LOAN', amount: loan.principal, base: loan.principal, debtBefore: 0, debtAfter: total() });

  const addInterest = (date: string, periodStart: string, base: number) => {
    const amount = roundMoney((base * rate) / 100);
    const debtBefore = total();
    const interestDebtBefore = interestDebt;
    interestDebt += amount; // ajouté à la dette dans tous les modes ; seule la base de COMPOUND le réutilise
    events.push({ date, kind: 'INTEREST', amount, base, rate, periodStart, interestDebtBefore, debtBefore, debtAfter: total() });
  };
  // GLOBAL : déterminé à l'origine, ajouté à la dette, jamais recalculé. EXCEPTION MÉTIER : aucun intérêt
  // périodique, même après `maturityDate` (`periodic` ci-dessous exclut GLOBAL) ; seules les pénalités continuent.
  if (loanMode === 'GLOBAL' && bearsInterest) addInterest(loan.disbursementDate, loan.disbursementDate, loan.principal);

  let pointer = 0;
  const applyRepayment = (repayment: Repayment) => {
    const debtBefore = total();
    // Imputation : dette hors pénalités (capital + intérêts) d'abord, le reliquat sur les pénalités.
    const onInterestDebt = Math.min(repayment.amount, Math.max(0, interestDebt));
    const penaltyPart = repayment.amount - onInterestDebt;
    interestDebt -= onInterestDebt;
    penaltyDebt -= penaltyPart;
    referenceCapital = interestDebt;
    events.push({ date: repayment.paymentDate, kind: 'REPAYMENT', amount: repayment.amount, base: 0, penaltyPart, debtBefore, debtAfter: total() });
  };

  const periodic = bearsInterest && (loanMode === 'SIMPLE' || loanMode === 'COMPOUND');
  const penaltyType = loan.penaltyEnabled ? loan.penaltyType : null;
  const penaltyValue = loan.penaltyValue ?? 0;
  let penaltyBase: number | null = null;
  let lateMonth = 0;
  let periodStart = loan.disbursementDate;
  for (let k = 1; ; k += 1) {
    const date = addMonths(loan.disbursementDate, k); // INTEREST_PERIOD = MONTHLY
    if (date > until) break; // date limite : la seule borne tant que la dette reste due (plus aucun arrêt à `maturityDate`)
    while (pointer < completed.length && completed[pointer].paymentDate < date) applyRepayment(completed[pointer++]);
    if (total() <= 0) break; // dette soldée : plus d'intérêt ni de pénalité
    if (periodic && interestDebt > 0) {
      let base: number;
      switch (loanMode) {
        case 'COMPOUND':
          base = interestDebt; // dette courante hors pénalités, intérêts antérieurs capitalisés compris
          break;
        case 'SIMPLE':
        default:
          base = referenceCapital; // les intérêts postérieurs au dernier remboursement n'entrent pas dans la base
          break;
      }
      if (base > 0) addInterest(date, periodStart, base);
    }
    if (penaltyType && date > loan.maturityDate) {
      lateMonth += 1;
      // Base FIGÉE : dette à `maturityDate` hors pénalités = capital + intérêts ≤ échéance − remboursements ≤ échéance.
      penaltyBase ??= Math.max(0, loan.principal
        + events.filter((event) => event.kind === 'INTEREST' && event.date <= loan.maturityDate).reduce((sum, event) => sum + event.amount, 0)
        - completed.filter((repayment) => repayment.paymentDate <= loan.maturityDate).reduce((sum, repayment) => sum + repayment.amount, 0));
      const amount = penaltyType === 'FIXED' ? roundMoney(penaltyValue) : roundMoney((penaltyBase * penaltyValue) / 100);
      if (amount > 0) {
        const debtBefore = total();
        penaltyDebt += amount; // due, mais jamais dans la base des intérêts
        events.push({ date, kind: 'PENALTY', amount, base: penaltyType === 'FIXED' ? 0 : penaltyBase, penaltyType, penaltyValue, lateMonth, debtBefore, debtAfter: total() });
      }
    }
    periodStart = date;
  }
  while (pointer < completed.length) applyRepayment(completed[pointer++]);
  return { events, interestDebt, penaltyDebt, debt: total() };
}

/** Événements financiers distincts (LOAN, INTEREST, PENALTY, REPAYMENT) d'un prêt jusqu'à `until` inclus. */
export function loanSchedule(loan: Loan, loanRepayments: Repayment[], until: string): LoanEvent[] {
  return loanState(loan, loanRepayments, until).events;
}

/** Intérêts GÉNÉRÉS par un prêt jusqu'à `until` inclus, selon SES paramètres historisés — les seuls redistribuables. */
export function loanInterestAccruals(loan: Loan, loanRepayments: Repayment[], until: string): InterestAccrual[] {
  return loanSchedule(loan, loanRepayments, until)
    .filter((event) => event.kind === 'INTEREST')
    .map((event) => ({ date: event.date, amount: event.amount, base: event.base, rate: event.rate ?? 0, periodStart: event.periodStart ?? event.date, debtBefore: event.interestDebtBefore ?? event.debtBefore }));
}

/** Pénalités de retard générées par un prêt jusqu'à `until` inclus (jamais redistribuées). */
export function loanPenaltyAccruals(loan: Loan, loanRepayments: Repayment[], until: string): PenaltyAccrual[] {
  return loanSchedule(loan, loanRepayments, until)
    .filter((event): event is LoanEvent & { penaltyType: LoanPenaltyType } => event.kind === 'PENALTY' && event.penaltyType !== undefined)
    .map((event) => ({ date: event.date, amount: event.amount, base: event.base, penaltyType: event.penaltyType, penaltyValue: event.penaltyValue ?? 0, lateMonth: event.lateMonth ?? 0, debtBefore: event.debtBefore }));
}

/**
 * DETTE COURANTE d'un prêt à une date = capital + Σ intérêts (≤ date) + Σ pénalités (≤ date) − Σ remboursements
 * réalisés (≤ date). Source unique pour le bilan, l'état financier ET le module Crédit.
 */
export function loanDebtAt(loan: Loan, loanRepayments: Repayment[], date: string): number {
  if (loan.disbursementDate > date) return 0;
  return loanState(loan, loanRepayments, date).debt;
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
    // Événements INTEREST uniquement : les pénalités (`loanPenaltyAccruals`) ne sont JAMAIS redistribuées.
    for (const accrual of loanInterestAccruals(loan, repaymentsByLoan.get(loan.id) ?? [], upTo)) {
      const source: InterestSource = { kind: 'LOAN', loanId: loan.id, borrowerId: loan.memberId, loanMode: loan.loanMode, interestPeriod: INTEREST_PERIOD, base: accrual.base, rate: accrual.rate, loanInterest: accrual.amount };
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
