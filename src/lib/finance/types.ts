import type { AccountRecord } from '@/mocks/finance/accounts';
import type { Transaction } from '@/mocks/finance/transactions';
import type { AccountMembership } from '@/mocks/finance/account-memberships';
import type { OpeningEntry } from '@/mocks/finance/opening-entries';
import type { ClosingEntry } from '@/mocks/finance/closing-entries';
import type { Loan } from '@/mocks/finance/loans';
import type { Repayment } from '@/mocks/finance/repayments';

/**
 * Périmètre d'une consultation financière. « Toutes les caisses » a DEUX
 * significations distinctes selon le point de vue :
 *   - TENANT_ALL_ACCOUNTS  → toutes les caisses du tenant
 *   - MEMBER_ALL_ACCOUNTS  → uniquement les caisses dont le membre est adhérent
 *                            à la date considérée (source = AccountMembership,
 *                            jamais les transactions trouvées)
 */
export type FinancialScope =
  | { kind: 'TENANT_ALL_ACCOUNTS' }
  | { kind: 'ACCOUNT'; accountId: string }
  | { kind: 'MEMBER_ALL_ACCOUNTS'; memberId: string }
  | { kind: 'MEMBER_ACCOUNT'; memberId: string; accountId: string };

/**
 * Données d'entrée du moteur — TOUJOURS déjà filtrées par tenant (c'est le
 * service `finance-position.service.ts` qui s'en charge). Les fonctions du
 * moteur sont pures : elles ne lisent aucun singleton, ce qui rend les tests
 * ordre-indépendants et exécutables un par un.
 */
export type FinanceCtx = {
  accounts: AccountRecord[];
  transactions: Transaction[];
  memberships: AccountMembership[];
  /**
   * Étape 6 — OPTIONNELS pour ne rien casser des fixtures/tests existants
   * (steps 1-5) : absent ou vide ⇒ `baseline()` retombe sur le comportement
   * LEGACY inchangé (`Account.openingBalance`, sans condition de date). Voir
   * `balance.ts` (`baseline`) et `closing.ts`/`carry-forward.ts`.
   */
  openingEntries?: OpeningEntry[];
  closingEntries?: ClosingEntry[];
  /**
   * Étape 7 — OPTIONNELS, même raison qu'`openingEntries`/`closingEntries` :
   * absents ⇒ `memberFinancialPosition` traite le membre comme sans prêt/
   * remboursement (`credit` reste `undefined`). `balanceAsOf`/`flows` ne les
   * lisent jamais (Loan n'a pas d'`accountId` — hors de leur périmètre).
   */
  loans?: Loan[];
  repayments?: Repayment[];
};

/**
 * Une ligne du résultat, par caisse du périmètre.
 *
 * `TENANT_ALL_ACCOUNTS` / `ACCOUNT` — SOLDE COMPTABLE de la caisse à `asOfDate` :
 *   `opening` (= `account.openingBalance` tant qu'il n'existe pas d'OpeningEntry)
 *   `+ credits − debits` (effets cumulés des transactions `completed` ≤ `asOfDate`
 *   touchant la caisse).
 *
 * `MEMBER_ALL_ACCOUNTS` / `MEMBER_ACCOUNT` — FLUX NET CUMULÉ DU MEMBRE dans cette
 *   caisse à `asOfDate` (Σ effets des seules transactions du membre, sur les
 *   jours où son adhésion était active). `opening` vaut 0 : le report d'ouverture
 *   d'une caisse n'appartient pas à un membre. Ce n'est PAS la « position
 *   financière » du membre (concept traité à l'étape 7 — agrégation
 *   épargne / encours de prêt / autres, décision encore ouverte).
 */
export type BalanceLine = {
  accountId: string;
  accountNumber: string;
  accountTitle: string;
  opening: number;
  credits: number;
  debits: number;
  balance: number;
  /** Scopes membre uniquement : date de début de l'adhésion active à `asOfDate`. */
  memberSince?: string | null;
};

export type BalanceResult = {
  scopeKey: string;
  asOfDate: string;
  /** Σ des `balance` de `byAccount`. */
  total: number;
  byAccount: BalanceLine[];
  /**
   * `true` pour un scope membre quand le membre n'est adhérent d'AUCUNE caisse
   * du périmètre à `asOfDate` (MEMBER_ALL_ACCOUNTS sans adhésion, ou
   * MEMBER_ACCOUNT sur une caisse non adhérée / inexistante). `total` vaut alors
   * 0 et `byAccount` est vide.
   */
  outOfScope: boolean;
};

export type FlowAccountLine = {
  accountId: string;
  accountNumber: string;
  accountTitle: string;
  /** Sorties de CETTE caisse sur la période (perspective caisse, `accountEntryEffect`). */
  debit: number;
  /** Entrées de CETTE caisse sur la période. */
  credit: number;
  count: number;
};

export type FlowResult = {
  scopeKey: string;
  from: string;
  to: string;
  /** Perspective JOURNAL (`transaction.type`), cohérente avec l'écran Transactions. */
  totalDebit: number;
  totalCredit: number;
  count: number;
  transactionIds: string[];
  byAccount: FlowAccountLine[];
  outOfScope: boolean;
};

/**
 * Résolution de la baseline d'UNE caisse à `asOfDate` (`balance.ts`,
 * `baseline`) — interne au moteur, réutilisée par `closing.ts` pour savoir
 * quelle `OpeningEntry` (le cas échéant) a servi de point de départ.
 *
 * `floorDate` n'est présent QUE si une `OpeningEntry` a été utilisée : c'est
 * elle qui borne les transactions comptées par le bas (`referenceDate(tx) >=
 * floorDate`). Absent ⇒ baseline legacy, aucune borne basse (comportement
 * historique de `balanceAsOf`, inchangé).
 */
export type BaselineResolution = {
  amount: number;
  floorDate?: string;
  openingEntryId?: string;
};

/** Une caisse par ligne de calcul — utilisé en interne par `computeFiscalYearClosing` et exposé pour `recomputeClosingEntry`. */
export type ClosingComputation = {
  accountId: string;
  amount: number;
  openingEntryId?: string;
};

export type CloseFiscalYearOutcome =
  | { ok: true; computations: ClosingComputation[] }
  | { ok: false; reason: 'FISCAL_YEAR_NOT_OPEN' | 'ALREADY_CLOSED'; accountIds?: string[] };

export type RecomputeClosingOutcome =
  | { ok: true; amount: number; openingEntryId?: string }
  | { ok: false; reason: 'ACCOUNT_NOT_FOUND' | 'FISCAL_YEAR_TENANT_MISMATCH' };

/** Une caisse par ouverture à créer — `amount` toujours COPIÉ depuis le `ClosingEntry` source, jamais recalculé. */
export type OpeningComputation = {
  accountId: string;
  amount: number;
  date: string;
  sourceClosingEntryId: string;
};

export type CarryForwardOutcome =
  | { ok: true; computations: OpeningComputation[] }
  | {
      ok: false;
      reason: 'TENANT_MISMATCH' | 'FROM_NOT_CLOSED' | 'NOT_CONTIGUOUS' | 'MISSING_CLOSING_ENTRIES' | 'ALREADY_CARRIED';
      accountIds?: string[];
    };

/** Écart entre le `ClosingEntry` d'un exercice et l'`OpeningEntry` de l'exercice suivant pour une même caisse — cf. scénario de correction en cascade après réouverture (§7 du design). */
export type IntegrityMismatch = {
  accountId: string;
  closingAmount: number;
  openingAmount: number;
};

/**
 * Ligne de position PAR CAISSE (étape 7) — uniquement ce qui est attribuable à
 * une caisse précise : épargne (`Transaction.category === 'EPARGNE'`) et
 * autres mouvements (`AUTRES`, hors `DISTRIBUTION`/`TRANSFERT`, cf.
 * `member-position.ts`). `PRET`/`REMBOURSEMENT` n'apparaissent JAMAIS ici —
 * leur source est `Loan`/`Repayment` (agrégés au niveau membre/tenant, voir
 * `MemberFinancialPosition.credit`), pas le journal.
 */
export type MemberAccountLine = {
  accountId: string;
  accountNumber: string;
  accountTitle: string;
  savings: number;
  /** `AUTRES`, hors `DISTRIBUTION` (agrégée à part) et `TRANSFERT` (jamais mélangé, voir `internalTransfers`). */
  otherMovements: number;
  /** `AUTRES/TRANSFERT` — informationnel, JAMAIS inclus dans `netCaisseFlow` ni aucun total. */
  internalTransfers: number;
  /** = `savings + otherMovements` (jamais `internalTransfers`). */
  netCaisseFlow: number;
  memberSince?: string | null;
};

/**
 * Agrégat crédit d'un membre — TOUJOURS tenant/membre-scopé, JAMAIS par
 * caisse (`Loan` n'a pas d'`accountId` : rattacher un prêt à une caisse
 * précise serait une donnée inventée, explicitement exclue).
 *
 * `outstanding` est RECALCULÉ à une date (`Loan.totalRepayable − Σ
 * Repayment.amount complétés ≤ asOfDate`), jamais lu directement depuis
 * `Loan.outstanding` (ce champ est un instantané courant, pas une valeur
 * datée — voir `member-position.ts`, `memberLoanSummary`).
 */
export type MemberCreditSummary = {
  loansReceived: number;
  repayments: number;
  outstanding: number;
  loanCount: number;
};

export type MemberFinancialPosition = {
  scopeKey: string;
  asOfDate: string;
  /** Concerne UNIQUEMENT le périmètre caisse (adhésions) — `credit`/`distributions` restent calculés même si `true` (un prêt n'exige aucune adhésion à une caisse). */
  outOfScope: boolean;
  byAccount: MemberAccountLine[];
  /** Σ `byAccount.savings`. */
  savings: number;
  /** Σ `byAccount.otherMovements`. */
  otherMovements: number;
  /** Σ `byAccount.internalTransfers` — jamais dans un total financier. */
  internalTransfers: number;
  /** MEMBER_ALL_ACCOUNTS uniquement (voir `MemberCreditSummary`). */
  credit?: MemberCreditSummary;
  /**
   * MEMBER_ALL_ACCOUNTS uniquement — Σ `Transaction.amount` où
   * `category === 'AUTRES'`, `subcategory === 'DISTRIBUTION'`, `memberId`
   * correspond. `Distribution.beneficiary` (registre séparé, texte libre,
   * sans `memberId`) n'est JAMAIS consulté — un rapprochement par nom serait
   * un rattachement inventé. `0` si aucune transaction ne correspond, même si
   * un enregistrement `Distribution` semble nominalement lié.
   */
  distributions?: number;
  /**
   * INDICATIF UNIQUEMENT — jamais une vérité comptable. Mélange un actif
   * liquide (épargne) et une dette de prêt (encours) dans un seul nombre ; ne
   * doit jamais être présenté comme LE solde du membre. Présent uniquement
   * quand `credit` l'est (= `savings + otherMovements + distributions −
   * credit.outstanding`).
   */
  estimatedNetPosition?: number;
};
