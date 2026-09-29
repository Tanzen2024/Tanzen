import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { cashboxes, hasCashboxLabelConflict, isCashboxOperational, isSystemCashbox, normalizeCashboxLabel, resolveCashbox, type Cashbox, type CashboxRecord, type CashboxType, type SystemCashboxCode } from '@/mocks/finance/cashboxes';
import { cashboxMemberships } from '@/mocks/finance/cashbox-memberships';
import { transactions, type Transaction, type TransactionType } from '@/mocks/finance/transactions';
import { isClassificationValid, isTransactionCategory, isTransactionTypeAllowed, type TransactionCategory, type TransactionSubcategory } from '@/mocks/finance/transaction-classification';
import { contributions, contributionsByMonth } from '@/mocks/finance/contributions';
import { distributions, type Distribution } from '@/mocks/finance/distributions';
import { members } from '@/mocks/organization/members';
import { tenants } from '@/mocks/organization/tenants';
import { validateSessionBelongsToExercise } from './fiscal-session.service';
import { fiscalYears, fiscalYearContaining, type FiscalYear } from '@/mocks/settings/fiscal-years';
import { auditEvents, type AuditEvent } from '@/mocks/audit/audit-events';
import { currentUser } from '@/mocks/rbac.mocks';
import { loans } from '@/mocks/finance/loans';
import { repayments as loanRepayments } from '@/mocks/finance/repayments';
import { loanDebtAt } from '@/lib/finance/interest-distribution';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { tontines } from '@/mocks/tontines/tontines';
import { sortTransactionsNewestFirst } from '@/lib/finance/transaction-order';

/**
 * Formulaire simplifié « Nouvelle caisse » (mandat CAISSE §2/§3) : ni tenant
 * (implicite via `currentTenant`, jamais depuis l'input), ni n° de caisse
 * (généré ici), ni solde (matérialisé à 0 tant qu'aucun mouvement), ni statut
 * (toujours 'active' à la création). `type` (nature de cotisation) est la seule
 * dimension métier saisie.
 */
export type CashboxCreateInput = { title: string; type: CashboxType; amount: number | null; description: string };
export type CashboxUpdateInput = Partial<CashboxCreateInput>;
export type DistributionInput = Pick<Distribution, 'beneficiary' | 'source' | 'amount' | 'date'>;

/**
 * Saisie d'une transaction depuis le journal central (mandat « Transactions =
 * journal financier central » §4). `tenantId` reste le seul paramètre de
 * sécurité (toujours `currentTenant.id`, jamais l'input). `cashboxNumber` et
 * `memberName` sont résolus côté appelant (déjà chargés pour peupler les
 * `<select>`), passés ici pour composer `source`/`destination` selon le sens,
 * sans réinventer une résolution de caisse/adhérent.
 *
 * PAS de champ `date` : la « Date transaction » (`Transaction.recordedAt`, dite
 * `transaction_at`) est une donnée d'AUDIT générée exclusivement au moment du
 * INSERT (voir `createTransaction`). Le frontend ne l'envoie jamais et ne peut
 * pas la modifier. La seule date métier saisissable est celle de la séance
 * (`sessionId` → `FiscalSession.date`).
 */
export type TransactionInput = {
  cashboxNumber: string;
  memberId?: string;
  memberName?: string;
  category: TransactionCategory;
  /**
   * Sous-catégorie — attendue UNIQUEMENT si `category === 'AUTRES'` (mandat
   * « MODÈLE DE DONNÉES »). `null`/absente pour EPARGNE ;
   * toute combinaison incohérente est rejetée par `createTransaction`.
   */
  subcategory?: TransactionSubcategory | null;
  type: TransactionType;
  amount: number;
  description: string;
  /**
   * Séance à laquelle l'opération se rapporte. `sessionId` = `FiscalSession.id`, une entité
   * RÉELLEMENT PERSISTÉE (jamais un identifiant synthétique dérivé). `fiscalYearId`
   * porte l'isolation : `createTransaction` rejette la transaction si `sessionId`
   * n'appartient pas à cet exercice / ce tenant. La date affichée se lit depuis
   * `FiscalSession.date` (résolue côté appelant), jamais dupliquée sur la transaction.
   */
  sessionId?: string;
  fiscalYearId?: string;
};

function isValidCashboxType(type: unknown): type is CashboxType {
  return type === 'LIBRE' || type === 'TAUX_FIXE';
}

/** LIBRE => montant toujours `null` (jamais transmis par l'UI, mais protégé ici en dernier rempart) ; TAUX_FIXE => montant obligatoire et strictement positif (0 n'a pas de sens pour une cotisation à taux fixe). */
function normalizeAmount(type: CashboxType, amount: number | null): number | null | undefined {
  if (type === 'LIBRE') return null;
  if (amount === null || amount === undefined || Number.isNaN(amount) || amount <= 0) return undefined;
  return amount;
}

/**
 * Contrôle d'unicité du libellé de caisse (règle métier `hasCashboxLabelConflict`,
 * `@/mocks/finance/cashboxes`) — dernier rempart côté « backend » : refuse la
 * création/modification même si le garde-fou du formulaire React est contourné.
 * Unicité sur (`tenantId` + libellé NORMALISÉ : trim, espaces réduits, sans
 * casse, sans accent). `excludeCashboxId` laisse une caisse garder son libellé.
 */
function isDuplicateTitle(tenantId: string, title: string, excludeCashboxId?: string): boolean {
  return hasCashboxLabelConflict(cashboxes, tenantId, title, excludeCashboxId);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * CAISSES SYSTÈME (mandat « robustifier la caisse système Achat tontine »)
 * ————————————————————————————————————————————————————————————————————————
 * Une caisse système est identifiée par `systemCode`, JAMAIS par son libellé
 * (`title` reste une pure donnée d'affichage, modifiable — sauf pour une
 * caisse système, cf. `updateCashbox`). Garantie : au plus UNE caisse par
 * (`tenantId`, `systemCode`) — cf. tests dédiés, aucune contrainte DB dans ce
 * projet mock, la garantie est donc portée par cette seule fonction d'entrée.
 */
const SYSTEM_CASHBOX_TITLES: Record<SystemCashboxCode, string> = {
  TONTINE_PURCHASE: 'Achat tontine',
  SAVINGS: 'Épargne',
  REGISTRATION: 'Inscription',
  EMERGENCY_FUND: 'Secours',
};

/** Les 4 codes système reconnus (mandat « centre financier ») — source unique pour toute itération, jamais une liste dupliquée ailleurs. */
export const SYSTEM_CASHBOX_CODES: SystemCashboxCode[] = ['TONTINE_PURCHASE', 'SAVINGS', 'REGISTRATION', 'EMERGENCY_FUND'];

/** Traçabilité des ambiguïtés de migration (mandat §23) — plusieurs caisses candidates pour un même (tenant, code) : jamais choisi arbitrairement, jamais fusionné/supprimé, seulement signalé. */
export type SystemCashboxMigrationConflict = { tenantId: string; systemCode: SystemCashboxCode; candidateCashboxIds: string[] };
export const systemCashboxMigrationConflicts: SystemCashboxMigrationConflict[] = [];

function tenantNameFor(tenantId: string): string {
  return tenants.find((tenant) => tenant.id === tenantId)?.name ?? tenantId;
}

/**
 * GARANTIT (create-or-adopt, jamais de doublon) l'existence de la caisse système
 * `code` pour `tenantId` :
 * 1. déjà marquée `systemCode` → la retourne telle quelle (idempotent) ;
 * 2. sinon, EXACTEMENT UNE caisse du tenant porte encore le libellé canonique
 *    sans `systemCode` (héritage de l'ancien mécanisme par libellé, mandat
 *    §23 migration) → elle est ADOPTÉE (le `systemCode` lui est assigné), jamais
 *    dupliquée ;
 * 3. plusieurs candidates (ambiguïté) → AUCUNE adoption automatique, l'ambiguïté
 *    est tracée dans `systemCashboxMigrationConflicts` pour résolution
 *    manuelle, et une caisse système neuve et propre est tout de même créée (une
 *    Tontine « avec achat » ne doit jamais rester sans caisse fonctionnelle
 *    pour autant) ;
 * 4. aucune candidate → création d'une caisse système neuve.
 * Pure et synchrone (même convention que `insertTransaction`) : appelable
 * directement depuis la factory synchrone d'un autre service (`tontines.
 * service.ts`), jamais via `mockRequest` ici.
 */
export function ensureSystemCashbox(tenantId: string, code: SystemCashboxCode): CashboxRecord {
  const existing = cashboxes.find((cashbox) => cashbox.tenantId === tenantId && cashbox.systemCode === code);
  if (existing) return existing;

  const canonicalTitle = normalizeCashboxLabel(SYSTEM_CASHBOX_TITLES[code]);
  const candidates = cashboxes.filter((cashbox) => cashbox.tenantId === tenantId && !cashbox.systemCode && normalizeCashboxLabel(cashbox.title) === canonicalTitle);
  if (candidates.length === 1) {
    candidates[0].systemCode = code;
    return candidates[0];
  }
  if (candidates.length > 1) {
    systemCashboxMigrationConflicts.push({ tenantId, systemCode: code, candidateCashboxIds: candidates.map((cashbox) => cashbox.id) });
  }

  const tenantName = tenantNameFor(tenantId);
  const created: CashboxRecord = {
    id: `AC-SYS-${tenantId}-${code}`,
    tenantId,
    cashboxNumber: `SYS-${tenantId}-${code}`,
    title: SYSTEM_CASHBOX_TITLES[code],
    type: 'LIBRE',
    amount: null,
    description: 'Caisse système gérée automatiquement par Tanzen — ne pas modifier ni supprimer manuellement.',
    openingBalance: 0,
    memberIds: [],
    tenantName,
    status: 'active',
    openedOn: todayISO(),
    systemCode: code,
  };
  cashboxes.push(created);
  return created;
}

/** Résolution de la caisse système `code` de `tenantId`, en la garantissant au passage (`ensureSystemCashbox`) — jamais par le libellé. */
export function resolveSystemCashbox(tenantId: string, code: SystemCashboxCode): CashboxRecord {
  return ensureSystemCashbox(tenantId, code);
}

// Couverture immédiate de tous les tenants déjà connus, pour les 4 codes
// système (mandat « centre financier ») — idempotent, n'écrase ni ne duplique
// une caisse existante (adoption des caisses historiques par libellé : « Achat
// tontine » AC-015/AC-016, « Epargne »/« Inscription »/« Secours » AC-009/
// AC-010/AC-011, création pour les tenants qui n'en ont encore aucune). Un
// futur tenant, lui, est couvert paresseusement au premier besoin réel via
// `resolveSystemCashbox`/`ensureSystemCashbox`.
for (const tenant of tenants) {
  for (const code of SYSTEM_CASHBOX_CODES) ensureSystemCashbox(tenant.id, code);
}

/** IDs des membres dont l'adhésion à cette caisse est ACTIVE (non clôturée) — source du cache `Cashbox.memberIds`. */
function activeMemberIdsOf(tenantId: string, cashboxId: string): string[] {
  return [
    ...new Set(
      cashboxMemberships
        .filter((m) => m.tenantId === tenantId && m.cashboxId === cashboxId && m.endDate === null)
        .map((m) => m.memberId),
    ),
  ];
}

/**
 * Projette une caisse stockée vers la `Cashbox` complète : solde + dernier
 * mouvement calculés depuis le journal (`resolveCashbox`), et `memberIds` projeté
 * depuis `CashboxMembership` (adhésions actives) — le champ stocké devient un
 * simple cache, jamais faisant autorité.
 */
function withComputedBalance(cashbox: CashboxRecord): Cashbox {
  return { ...resolveCashbox(cashbox, transactions), memberIds: activeMemberIdsOf(cashbox.tenantId, cashbox.id) };
}

/**
 * DISPONIBLE d'une caisse pour financer un prêt (mandat « financement multi-caisses », 2026-09-26) :
 * exactement le solde que le projet calcule déjà (`resolveCashbox`, même source que la liste et la
 * fiche caisse) — aucune notion de fonds réservés n'existant, aucune seconde formule. `undefined`
 * si la caisse n'appartient pas au tenant.
 */
export function cashboxAvailableBalance(tenantId: string, cashboxId: string): number | undefined {
  const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
  return cashbox ? resolveCashbox(cashbox, transactions).balance : undefined;
}

/**
 * Rattachement d'une transaction à un exercice — SEULE règle : son
 * `fiscalYearId` explicite (posé par `insertTransaction`), à défaut (seed
 * historique antérieur à la règle) la période de l'exercice qui contient sa date.
 */
export function transactionBelongsToFiscalYear(transaction: Pick<Transaction, 'tenantId' | 'date' | 'fiscalYearId'>, fiscalYear: Pick<FiscalYear, 'id' | 'tenantId' | 'startDate' | 'endDate'>): boolean {
  if (transaction.tenantId !== fiscalYear.tenantId) return false;
  if (transaction.fiscalYearId) return transaction.fiscalYearId === fiscalYear.id;
  return transaction.date >= fiscalYear.startDate && transaction.date <= fiscalYear.endDate;
}

/**
 * Logique PURE (aucun `mockRequest`, aucun délai) de `createTransaction` —
 * extraite pour être réutilisable de façon strictement SYNCHRONE par d'autres
 * services dont les propres fonctions sont elles-mêmes des factories
 * synchrones enveloppées par `mockRequest` (ex. `tontineOperationsService.
 * recordContributionPayment`/`recordReception`, mandat « intégration Tontine
 * ↔ Finance »). ATTENTION technique documentée : `mockRequest()` ne coerce
 * `undefined → null` QUE pour une factory synchrone — une factory `async`
 * retourne une Promise (jamais littéralement `undefined`) au moment où
 * `mockRequest` teste `result === undefined`, ce qui casserait silencieusement
 * cette coercion pour TOUTES les fonctions déjà existantes qui en dépendent.
 * Appeler cette fonction directement (jamais `await financeService.
 * createTransaction(...)`) est donc la seule façon, pour un appelant
 * synchrone, de rester dans le même contrat `undefined`/`null` que tout le
 * reste du projet.
 */
export function insertTransaction(tenantId: string, input: TransactionInput): Transaction | undefined {
  const amount = Number(input.amount);
  if (!input.cashboxNumber || !Number.isFinite(amount) || amount <= 0) return undefined;
  // Validations de classification (mandat §22) : catégorie officielle, et
  // combinaison catégorie/sous-catégorie cohérente (AUTRES ⇔ sous-catégorie
  // valide ; EPARGNE ⇒ aucune sous-catégorie). Empêche
  // aussi qu'un client force une sous-catégorie appartenant à une autre
  // catégorie (ex. `EPARGNE` + `FRAIS`).
  if (!isTransactionCategory(input.category)) return undefined;
  if (!isClassificationValid(input.category, input.subcategory ?? null)) return undefined;
  // TYPE IMPOSÉ PAR L'OPÉRATION (mandat « Type des transactions ») : Épargne / Remboursement / Autres-Inscription·Achat tontine·Secours = crédit, Prêt = débit ; seul « Autres » libre accepte les deux. Refus (jamais un type forcé en silence, qui inverserait le sens de l'argent).
  if (!isTransactionTypeAllowed(input.category, input.category === 'AUTRES' ? input.subcategory ?? null : null, input.type)) return undefined;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  // Cohérence tenant / caisse / membre (mandat « Caisse + exercice fiscal
  // contexte global » §22) : la caisse et l'éventuel adhérent appartiennent au
  // tenant de l'opération — jamais une écriture sur la caisse d'un autre tenant.
  // Cycle de vie (mandat « Évolution globale du module Finance » §31) : une caisse désactivée ou archivée ne reçoit plus aucune écriture — contrôle SERVICE, jamais seulement l'UI.
  if (!cashboxes.some((cashbox) => cashbox.tenantId === tenantId && cashbox.cashboxNumber === input.cashboxNumber && isCashboxOperational(cashbox))) return undefined;
  if (input.memberId && !members.some((member) => member.id === input.memberId && member.tenantId === tenantId)) return undefined;
  // Cohérence exercice : la transaction est TOUJOURS rattachée à l'exercice du
  // tenant qui contient sa date (fourni par l'appelant ou déduit). Un exercice
  // d'un autre tenant, clôturé, ou ne contenant pas la date est refusé.
  const fiscalYear = input.fiscalYearId
    ? fiscalYears.find((year) => year.id === input.fiscalYearId && year.tenantId === tenantId)
    : fiscalYearContaining(fiscalYears, tenantId, date);
  if (input.fiscalYearId && !fiscalYear) return undefined;
  if (fiscalYear && (fiscalYear.isClosed || date < fiscalYear.startDate || date > fiscalYear.endDate)) return undefined;
  // Isolation : une séance sélectionnée DOIT appartenir à l'exercice fiscal ET
  // au tenant de l'opération — jamais une séance d'un autre exercice/tenant.
  if (input.sessionId) {
    if (!fiscalYear) return undefined;
    if (!validateSessionBelongsToExercise(input.sessionId, fiscalYear.id, tenantId)) return undefined;
  }
  const subcategory = input.category === 'AUTRES' ? input.subcategory ?? undefined : undefined;
  const seq = transactions.length + 1;
  const memberName = input.memberId ? input.memberName?.trim() || undefined : undefined;
  const transaction: Transaction = {
    id: `TR-${String(seq).padStart(3, '0')}`,
    tenantId,
    reference: `REF-${now.getFullYear()}-${String(seq).padStart(4, '0')}`,
    date,
    amount,
    type: input.type,
    category: input.category,
    subcategory,
    status: 'completed',
    // Même convention que le seed / `transactionCashboxLabel` : pour un crédit
    // les fonds vont vers la caisse, pour un débit ils en sortent.
    source: input.type === 'credit' ? (memberName ?? input.cashboxNumber) : input.cashboxNumber,
    destination: input.type === 'credit' ? input.cashboxNumber : (memberName ?? input.cashboxNumber),
    description: input.description.trim(),
    memberId: input.memberId || undefined,
    sessionId: input.sessionId || undefined,
    fiscalYearId: fiscalYear?.id,
    recordedAt: now.toISOString(),
  };
  transactions.push(transaction);
  return transaction;
}

/**
 * Raison métier qui interdit de sortir une caisse de l'état opérationnel
 * (désactivation ou archivage) — uniquement des règles DÉJÀ établies ailleurs,
 * que la transition casserait sinon :
 *   - `systemProtected` : caisse système (`systemCode`), déjà protégée contre la
 *     suppression / désactivation (`deleteCashbox`) ;
 *   - `fundsActiveLoan` : la caisse finance un prêt encore actif
 *     (`LoanFundingAllocation`) — ses remboursements y sont répartis pro rata et
 *     seraient refusés par `insertTransaction` ;
 *   - `linkedToActiveTontine` : caisse de cotisation d'une tontine active
 *     (`Tontine.cashboxId`) — ses cotisations / réceptions y sont écrites.
 */
export type CashboxLifecycleBlocker = 'systemProtected' | 'fundsActiveLoan' | 'linkedToActiveTontine';
export type CashboxLifecycleOutcome = { ok: true; cashbox: Cashbox } | { ok: false; reason: CashboxLifecycleBlocker | 'invalidStatus' };

export function cashboxLifecycleBlocker(tenantId: string, cashbox: CashboxRecord): CashboxLifecycleBlocker | undefined {
  if (isSystemCashbox(cashbox)) return 'systemProtected';
  // Prêt actif = dette courante > 0 (règles de référence du 2026-09-28), jamais l'encours contractuel stocké.
  const today = new Date().toISOString().slice(0, 10);
  const activeLoanIds = new Set(loans.filter((loan) => loan.tenantId === tenantId && loan.status === 'active' && loanDebtAt(loan, loanRepayments.filter((repayment) => repayment.loanId === loan.id), today) > 0).map((loan) => loan.id));
  if (loanFundingAllocations.some((allocation) => allocation.cashboxId === cashbox.id && activeLoanIds.has(allocation.loanId))) return 'fundsActiveLoan';
  if (tontines.some((tontine) => tontine.tenantId === tenantId && tontine.cashboxId === cashbox.id && tontine.status === 'statusActive')) return 'linkedToActiveTontine';
  return undefined;
}

/** Audit d'une transition de cycle de vie — tableau canonique `auditEvents`, aucun second système d'audit. */
function recordCashboxLifecycleAudit(tenantId: string, cashbox: CashboxRecord, action: string, before: CashboxRecord['status']) {
  const event: AuditEvent = {
    id: `AUD-FIN-${Date.now()}-${auditEvents.length}`,
    tenantId,
    timestamp: new Date().toISOString(),
    actorId: currentUser.id,
    actorName: currentUser.name,
    module: 'finance',
    action,
    eventType: 'action',
    resourceType: 'cashbox',
    resourceId: cashbox.id,
    resourceLabel: cashbox.title,
    status: 'success',
    sensitive: false,
    correlationId: cashbox.id,
    before: { status: before },
    after: { status: cashbox.status },
  };
  auditEvents.push(event);
}

export const financeService = {
  listCashboxes: (tenantId: string) => mockRequest(() => cashboxes.filter((cashbox) => cashbox.tenantId === tenantId).map(withComputedBalance)),
  getCashbox: (tenantId: string, cashboxId: string) =>
    mockRequest(() => {
      const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
      return cashbox ? withComputedBalance(cashbox) : undefined;
    }),

  createCashbox: (tenantId: string, tenantName: string, input: CashboxCreateInput) =>
    mockRequest(() => {
      const title = input.title.trim();
      if (!title || !isValidCashboxType(input.type)) return undefined;
      const amount = normalizeAmount(input.type, input.amount);
      if (amount === undefined) return undefined;
      if (isDuplicateTitle(tenantId, title)) return undefined;
      // Plus grand numéro `AC-nnn` existant + 1 (et non `length + 1`) : le seed a des trous, un id ne doit jamais être réattribué.
      const seq = Math.max(cashboxes.length, ...cashboxes.map((cashbox) => Number(/^AC-(\d+)$/.exec(cashbox.id)?.[1] ?? 0))) + 1;
      const cashbox: CashboxRecord = {
        id: `AC-${String(seq).padStart(3, '0')}`,
        tenantId,
        tenantName,
        cashboxNumber: `CX-${tenantId}-${String(seq).padStart(3, '0')}`,
        title,
        type: input.type,
        amount,
        description: input.description?.trim() ?? '',
        // Nouvelle caisse : aucun report d'ouverture, aucun mouvement — le solde
        // calculé vaut donc 0 tant qu'aucune transaction n'est comptabilisée.
        openingBalance: 0,
        memberIds: [],
        status: 'active',
        openedOn: new Date().toISOString().slice(0, 10),
      };
      cashboxes.push(cashbox);
      return withComputedBalance(cashbox);
    }),

  updateCashbox: (tenantId: string, cashboxId: string, patch: CashboxUpdateInput) =>
    mockRequest(() => {
      const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
      // Archivée = consultation seule (mandat « cycle de vie » §27) : désarchiver d'abord.
      if (!cashbox || cashbox.status === 'archived') return undefined;
      const nextType = patch.type ?? cashbox.type;
      if (!isValidCashboxType(nextType)) return undefined;
      const nextTitle = (patch.title ?? cashbox.title).trim();
      if (!nextTitle) return undefined;
      /**
       * PROTECTION CAISSE SYSTÈME (mandat « robustifier Achat tontine » §10) —
       * `systemCode` n'est pas dans `CashboxUpdateInput` (jamais modifiable via
       * cette API, par construction du type). Seule son IDENTITÉ VISIBLE
       * (`title`) reste théoriquement atteignable par ce patch : un renommage
       * réel (le libellé normalisé change effectivement) est refusé — un
       * simple ré-enregistrement du MÊME libellé (formulaire non modifié)
       * reste autorisé, jamais bloqué inutilement.
       */
      if (isSystemCashbox(cashbox) && normalizeCashboxLabel(nextTitle) !== normalizeCashboxLabel(cashbox.title)) return undefined;
      if (patch.title && isDuplicateTitle(tenantId, nextTitle, cashboxId)) return undefined;
      const nextAmount = normalizeAmount(nextType, patch.amount !== undefined ? patch.amount : cashbox.amount);
      if (nextAmount === undefined) return undefined;
      cashbox.title = nextTitle;
      cashbox.type = nextType;
      cashbox.amount = nextAmount;
      if (patch.description !== undefined) cashbox.description = patch.description.trim();
      return withComputedBalance(cashbox);
    }),

  /**
   * Ajustement manuel du REPORT D'OUVERTURE (`openingBalance`) — `amount` est une
   * magnitude positive qui augmente le report. Ne crée aucune transaction : sert
   * uniquement à corriger la situation antérieure au journal. Le solde courant
   * reste `openingBalance + Σ journal`, recalculé à la lecture.
   */
  recordCashboxMovement: (tenantId: string, cashboxId: string, amount: number) =>
    mockRequest(() => {
      const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
      if (!cashbox) return undefined;
      if (!Number.isFinite(amount) || amount <= 0) return undefined;
      cashbox.openingBalance += amount;
      cashbox.openedOn = new Date().toISOString().slice(0, 10);
      return withComputedBalance(cashbox);
    }),

  /**
   * SUPPRESSION = DÉSACTIVATION LOGIQUE (mandat « Supprimer = désactiver », 2026-09-27) —
   * « Supprimer » ne retire JAMAIS l'enregistrement : la caisse passe `active → inactive`,
   * et ses transactions, adhésions, allocations de prêt et son historique restent intacts
   * et consultables. Mêmes garde-fous que l'ancienne désactivation (`cashboxLifecycleBlocker`) :
   * caisse système (PROTECTION « robustifier Achat tontine » §11/§12), caisse finançant un
   * prêt actif, caisse d'une tontine active. Seule une caisse `active` peut être supprimée
   * (`invalidStatus` sinon — jamais de no-op silencieux). `undefined` = introuvable ou hors
   * tenant. Auditée dans `auditEvents` (canonique).
   */
  deleteCashbox: (tenantId: string, cashboxId: string) =>
    mockRequest((): CashboxLifecycleOutcome | undefined => {
      const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
      if (!cashbox) return undefined;
      if (cashbox.status !== 'active') return { ok: false, reason: 'invalidStatus' };
      const blocker = cashboxLifecycleBlocker(tenantId, cashbox);
      if (blocker) return { ok: false, reason: blocker };
      cashbox.status = 'inactive';
      recordCashboxLifecycleAudit(tenantId, cashbox, 'finance.cashbox.deleted', 'active');
      return { ok: true, cashbox: withComputedBalance(cashbox) };
    }),

  /**
   * RÉACTIVATION (mandat « Évolution du cycle de vie des exercices fiscaux »
   * §33/§36 — audit des objets clôturables) : seul objet, hors exercice
   * fiscal, où la réouverture transverse a été jugée justifiée — une caisse
   * `inactive` (supprimée logiquement par `deleteCashbox`, cf. ci-dessus)
   * ne perd aucune donnée financière, réactiver n'est qu'un
   * flip de statut sans risque d'incohérence comptable. Refuse si la caisse
   * n'existe pas ou n'est pas `inactive` (pas de no-op silencieux sur une
   * caisse déjà `active`). Auditée directement dans `auditEvents` (canonique,
   * `src/mocks/audit/audit-events.ts`) — aucun second système d'audit créé.
   */
  reactivateCashbox: (tenantId: string, cashboxId: string) =>
    mockRequest(() => {
      const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
      if (!cashbox || cashbox.status !== 'inactive') return undefined;
      cashbox.status = 'active';
      recordCashboxLifecycleAudit(tenantId, cashbox, 'finance.cashbox.reactivated', 'inactive');
      return withComputedBalance(cashbox);
    }),

  /**
   * CYCLE DE VIE (mandat « Évolution globale du module Finance » §27-§31) —
   * deux transitions en plus de `deleteCashbox` (active → inactive) et de
   * `reactivateCashbox`, toutes RÉVERSIBLES et sans aucune suppression :
   * l'historique (transactions, séances, montants) reste intact et consultable.
   * Chaque refus porte la raison métier réelle (`cashboxLifecycleBlocker`) :
   * l'UI ne fait que l'expliquer.
   *   - `archiveCashbox`    : active | inactive → archived ;
   *   - `unarchiveCashbox`  : archived → inactive (réactivation explicite ensuite).
   */
  archiveCashbox: (tenantId: string, cashboxId: string) =>
    mockRequest((): CashboxLifecycleOutcome | undefined => {
      const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
      if (!cashbox) return undefined;
      if (cashbox.status === 'archived') return { ok: false, reason: 'invalidStatus' };
      const blocker = cashboxLifecycleBlocker(tenantId, cashbox);
      if (blocker) return { ok: false, reason: blocker };
      const before = cashbox.status;
      cashbox.status = 'archived';
      recordCashboxLifecycleAudit(tenantId, cashbox, 'finance.cashbox.archived', before);
      return { ok: true, cashbox: withComputedBalance(cashbox) };
    }),

  unarchiveCashbox: (tenantId: string, cashboxId: string) =>
    mockRequest((): CashboxLifecycleOutcome | undefined => {
      const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
      if (!cashbox) return undefined;
      if (cashbox.status !== 'archived') return { ok: false, reason: 'invalidStatus' };
      cashbox.status = 'inactive';
      recordCashboxLifecycleAudit(tenantId, cashbox, 'finance.cashbox.unarchived', 'archived');
      return { ok: true, cashbox: withComputedBalance(cashbox) };
    }),

  /** Adhérents actuellement adhérents d'une caisse — dérivé de `CashboxMembership` (adhésions actives), filtré tenant pour ne jamais laisser fuiter un `memberId` d'un autre tenant. */
  listCashboxMembers: (tenantId: string, cashboxId: string) =>
    mockRequest(() => {
      const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
      if (!cashbox) return [];
      const active = new Set(activeMemberIdsOf(tenantId, cashboxId));
      return members.filter((member) => member.tenantId === tenantId && active.has(member.id));
    }),

  /** Toutes les adhésions du tenant (actives et clôturées) — source de vérité datée pour le moteur de position. */
  listCashboxMemberships: (tenantId: string) =>
    mockRequest(() => cashboxMemberships.filter((membership) => membership.tenantId === tenantId)),

  /** Affecte des membres à une caisse — ouvre une `CashboxMembership` (à ce jour) pour chaque membre éligible qui n'en a pas déjà une active. `Cashbox.memberIds` (cache) se recalcule à la projection. */
  addCashboxMembers: (tenantId: string, cashboxId: string, memberIds: string[]) =>
    mockRequest(() => {
      const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
      if (!cashbox) return undefined;
      const eligibleIds = members
        .filter((member) => member.tenantId === tenantId && memberIds.includes(member.id))
        .map((member) => member.id);
      const day = todayISO();
      for (const memberId of eligibleIds) {
        const alreadyActive = cashboxMemberships.some(
          (m) => m.tenantId === tenantId && m.cashboxId === cashboxId && m.memberId === memberId && m.endDate === null,
        );
        if (alreadyActive) continue;
        cashboxMemberships.push({
          id: `AM-${String(cashboxMemberships.length + 1).padStart(3, '0')}`,
          tenantId,
          cashboxId,
          memberId,
          startDate: day,
          endDate: null,
          status: 'active',
        });
      }
      return withComputedBalance(cashbox);
    }),

  /** Retire des membres d'une caisse — CLÔT leur adhésion active (`endDate` = aujourd'hui), jamais de suppression : l'historique reste reconstructible. */
  removeCashboxMembers: (tenantId: string, cashboxId: string, memberIds: string[]) =>
    mockRequest(() => {
      const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
      if (!cashbox) return undefined;
      const toRemove = new Set(memberIds);
      const day = todayISO();
      for (const membership of cashboxMemberships) {
        if (
          membership.tenantId === tenantId &&
          membership.cashboxId === cashboxId &&
          membership.endDate === null &&
          toRemove.has(membership.memberId)
        ) {
          membership.endDate = day;
          membership.status = 'ended';
        }
      }
      return withComputedBalance(cashbox);
    }),

  /**
   * Toutes les lectures du journal renvoient l'ordre « plus récente d'abord »
   * (`sortTransactionsNewestFirst` : `recordedAt`/`date` réels décroissants, puis
   * `id` décroissant) — comme le ferait un `ORDER BY` backend. Les vues ne font
   * que filtrer (filtre stable), l'ordre est donc conservé quels que soient
   * séance, caisse, recherche ou filtres.
   */
  listTransactions: (tenantId: string) => mockRequest(() => sortTransactionsNewestFirst(transactions.filter((transaction) => transaction.tenantId === tenantId))),
  /**
   * Transactions du tenant rattachées à l'exercice `fiscalYearId` (contexte
   * global Tenant → Exercice, mandat « Caisse + exercice fiscal contexte
   * global ») — règle unique `transactionBelongsToFiscalYear`. `[]` si
   * l'exercice n'appartient pas au tenant : jamais les données d'un autre
   * tenant ni d'un autre exercice.
   */
  listTransactionsForFiscalYear: (tenantId: string, fiscalYearId: string) =>
    mockRequest(() => {
      const fiscalYear = fiscalYears.find((year) => year.id === fiscalYearId && year.tenantId === tenantId);
      if (!fiscalYear) return [];
      return sortTransactionsNewestFirst(transactions.filter((transaction) => transaction.tenantId === tenantId && transactionBelongsToFiscalYear(transaction, fiscalYear)));
    }),

  getTransaction: (tenantId: string, transactionId: string) =>
    mockRequest(() => getTenantScoped(transactions, (transaction) => transaction.id === transactionId, tenantId)),

  /**
   * Unique point d'écriture dans le journal (mandat §2/§4). Aucune création
   * croisée de Loan/Distribution (mode pragmatique validé) : une opération de
   * type `loanDisbursement`/`loanRepayment`/`distribution` produit UNE
   * transaction, les détails métier saisis sont consignés dans `description`.
   *
   * `recordedAt` (`transaction_at`) = horodatage d'AUDIT, généré ICI au moment
   * de l'écriture (jamais fourni par l'appelant, jamais modifiable ensuite via
   * l'UI — cf. `updateTransaction`). `date` reprend le jour de cet horodatage :
   * c'est un dérivé de `recordedAt`, pas une saisie. La date métier de la
   * séance se lit, elle, via `FiscalSession.date` (`sessionId`).
   */
  createTransaction: (tenantId: string, input: TransactionInput) => mockRequest(() => insertTransaction(tenantId, input)),
  /**
   * Mouvements financiers produits par un prêt (mandat « Séparation Caisses / Crédit ») : décaissement(s)
   * et encaissements de remboursement, chacun rattaché à SA caisse. Un prêt peut en avoir plusieurs
   * (relation 1-N via `Transaction.loanId`) — rien n'impose un décaissement unique.
   */
  listTransactionsByLoan: (tenantId: string, loanId: string) => mockRequest(() => sortTransactionsNewestFirst(transactions.filter((transaction) => transaction.tenantId === tenantId && transaction.loanId === loanId))),

  /**
   * `recordedAt`/`date` (la « Date transaction » d'audit) ne figurent PAS dans
   * le patch : une correction historique doit passer par un mécanisme
   * d'annulation/correction, jamais par une réécriture de l'horodatage.
   * `subcategory: null` = retirer explicitement la sous-catégorie (ex. passage à Épargne).
   */
  updateTransaction: (tenantId: string, transactionId: string, patch: Partial<Pick<Transaction, 'category' | 'type' | 'amount' | 'description' | 'sessionId'>> & { subcategory?: TransactionSubcategory | null }) =>
    mockRequest(() => {
      const transaction = getTenantScoped(transactions, (item) => item.id === transactionId, tenantId);
      if (!transaction || transaction.status === 'cancelled') return undefined;
      // Type imposé par l'opération RÉSULTANTE (catégorie / sous-catégorie / type après modification) — vérifié AVANT toute écriture.
      const nextCategory = patch.category ?? transaction.category;
      const nextSubcategory = nextCategory === 'AUTRES' ? (patch.subcategory !== undefined ? patch.subcategory : transaction.subcategory) ?? null : null;
      if (!isTransactionTypeAllowed(nextCategory, nextSubcategory, patch.type ?? transaction.type)) return undefined;
      if (patch.amount !== undefined) {
        const amount = Number(patch.amount);
        if (!Number.isFinite(amount) || amount <= 0) return undefined;
        transaction.amount = amount;
      }
      if (patch.category !== undefined) {
        // La classification résultante (nouvelle catégorie + sous-catégorie
        // fournie, ou celle déjà en base) doit rester cohérente (mandat §22).
        const nextSubcategory = patch.subcategory !== undefined ? patch.subcategory : transaction.subcategory;
        if (!isClassificationValid(patch.category, nextSubcategory ?? null)) return undefined;
        transaction.category = patch.category;
        transaction.subcategory = patch.category === 'AUTRES' ? nextSubcategory ?? undefined : undefined;
      } else if (patch.subcategory !== undefined) {
        if (!isClassificationValid(transaction.category, patch.subcategory ?? null)) return undefined;
        transaction.subcategory = transaction.category === 'AUTRES' ? patch.subcategory ?? undefined : undefined;
      }
      if (patch.type !== undefined) transaction.type = patch.type;
      if (patch.description !== undefined) transaction.description = patch.description.trim();
      if (patch.sessionId !== undefined) {
        const nextSessionId = patch.sessionId || undefined;
        // Isolation : une nouvelle séance doit rester dans l'exercice/tenant de la transaction.
        if (nextSessionId) {
          if (!transaction.fiscalYearId) return undefined;
          if (!validateSessionBelongsToExercise(nextSessionId, transaction.fiscalYearId, tenantId)) return undefined;
        }
        transaction.sessionId = nextSessionId;
      }
      return transaction;
    }),

  /** Annulation d'une transaction (mandat §2). Règle métier : seules les transactions `completed` ou `pending` sont annulables — une transaction déjà annulée ou échouée ne l'est pas. Pas de suppression physique : cohérent avec le journal append-only. */
  cancelTransaction: (tenantId: string, transactionId: string) =>
    mockRequest(() => {
      const transaction = getTenantScoped(transactions, (item) => item.id === transactionId, tenantId);
      if (!transaction || (transaction.status !== 'completed' && transaction.status !== 'pending')) return undefined;
      transaction.status = 'cancelled';
      return transaction;
    }),

  listContributions: (tenantId: string) => mockRequest(() => contributions.filter((contribution) => contribution.tenantId === tenantId)),
  listContributionsByMember: (memberId: string) => mockRequest(() => contributions.filter((contribution) => contribution.memberId === memberId)),

  listDistributions: (tenantId: string) => mockRequest(() => distributions.filter((distribution) => distribution.tenantId === tenantId)),
  createDistribution: (tenantId: string, input: DistributionInput) =>
    mockRequest(() => {
      const distribution: Distribution = { id: `DI-${String(distributions.length + 1).padStart(3, '0')}`, tenantId, status: 'pending', ...input };
      distributions.push(distribution);
      return distribution;
    }),
  approveDistribution: (tenantId: string, distributionId: string) =>
    mockRequest(() => {
      const distribution = getTenantScoped(distributions, (item) => item.id === distributionId, tenantId);
      if (!distribution) return undefined;
      distribution.status = 'completed';
      return distribution;
    }),

  /** Tendance mensuelle illustrative (agrégat global, pas de granularité par tenant dans les mocks) — passe désormais par le service plutôt qu'un import direct depuis la page. */
  listContributionsTrend: () => mockRequest(() => contributionsByMonth),
};
