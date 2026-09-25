import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { cashboxes, hasCashboxLabelConflict, isSystemCashbox, normalizeCashboxLabel, resolveCashbox, type Cashbox, type CashboxRecord, type CashboxType, type SystemCashboxCode } from '@/mocks/finance/cashboxes';
import { cashboxMemberships } from '@/mocks/finance/cashbox-memberships';
import { transactions, type Transaction, type TransactionType } from '@/mocks/finance/transactions';
import { isClassificationValid, isTransactionCategory, type TransactionCategory, type TransactionSubcategory } from '@/mocks/finance/transaction-classification';
import { contributions, contributionsByMonth } from '@/mocks/finance/contributions';
import { distributions, type Distribution } from '@/mocks/finance/distributions';
import { members } from '@/mocks/organization/members';
import { tenants } from '@/mocks/organization/tenants';
import { validateSessionBelongsToExercise } from './fiscal-session.service';
import { auditEvents, type AuditEvent } from '@/mocks/audit/audit-events';
import { currentUser } from '@/mocks/rbac.mocks';

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
 * `<select>`), passés ici pour composer `fromAccount`/`toAccount` selon le sens,
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
   * « MODÈLE DE DONNÉES »). `null`/absente pour EPARGNE/PRET/REMBOURSEMENT ;
   * toute combinaison incohérente est rejetée par `createTransaction`.
   */
  subcategory?: TransactionSubcategory | null;
  type: TransactionType;
  amount: number;
  description: string;
  /**
   * Séance à laquelle l'opération se rapporte (reconstruction complète du
   * sous-module Exercices fiscaux / Séances — remplace l'ancien `meetingId`/
   * `meetingDate` virtuels). `sessionId` = `FiscalSession.id`, une entité
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
  // valide ; EPARGNE/PRET/REMBOURSEMENT ⇒ aucune sous-catégorie). Empêche
  // aussi qu'un client force une sous-catégorie appartenant à une autre
  // catégorie (ex. `EPARGNE` + `FRAIS`).
  if (!isTransactionCategory(input.category)) return undefined;
  if (!isClassificationValid(input.category, input.subcategory ?? null)) return undefined;
  // Isolation : une séance sélectionnée DOIT appartenir à l'exercice fiscal ET
  // au tenant de l'opération — jamais une séance d'un autre exercice/tenant.
  if (input.sessionId) {
    if (!input.fiscalYearId) return undefined;
    if (!validateSessionBelongsToExercise(input.sessionId, input.fiscalYearId, tenantId)) return undefined;
  }
  const subcategory = input.category === 'AUTRES' ? input.subcategory ?? undefined : undefined;
  const now = new Date();
  const seq = transactions.length + 1;
  const memberName = input.memberId ? input.memberName?.trim() || undefined : undefined;
  const transaction: Transaction = {
    id: `TR-${String(seq).padStart(3, '0')}`,
    tenantId,
    reference: `REF-${now.getFullYear()}-${String(seq).padStart(4, '0')}`,
    date: now.toISOString().slice(0, 10),
    amount,
    type: input.type,
    category: input.category,
    subcategory,
    status: 'completed',
    // Même convention que le seed / `transactionCashboxLabel` : pour un crédit
    // les fonds vont vers la caisse, pour un débit ils en sortent.
    fromAccount: input.type === 'credit' ? (memberName ?? input.cashboxNumber) : input.cashboxNumber,
    toAccount: input.type === 'credit' ? input.cashboxNumber : (memberName ?? input.cashboxNumber),
    description: input.description.trim(),
    memberId: input.memberId || undefined,
    sessionId: input.sessionId || undefined,
    fiscalYearId: input.fiscalYearId || undefined,
    recordedAt: now.toISOString(),
  };
  transactions.push(transaction);
  return transaction;
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
      const cashbox: CashboxRecord = {
        id: `AC-${String(cashboxes.length + 1).padStart(3, '0')}`,
        tenantId,
        tenantName,
        cashboxNumber: `CX-${tenantId}-${String(cashboxes.length + 1).padStart(3, '0')}`,
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
      if (!cashbox) return undefined;
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
   * Ne supprime jamais une caisse ayant déjà des mouvements (§8) : bascule sur
   * une désactivation logique à la place. `deleted: true` uniquement si la
   * suppression physique a réellement eu lieu.
   *
   * PROTECTION CAISSE SYSTÈME (mandat « robustifier Achat tontine » §11/§12) —
   * refusée EXPLICITEMENT avant toute autre logique, qu'elle aurait sinon
   * supprimé physiquement OU désactivé : une Tontine « avec achat » ne doit
   * jamais se retrouver avec une caisse système absente/inactive suite à une
   * action utilisateur ordinaire. `systemProtected: true` distingue ce refus
   * du cas générique (caisse introuvable → `undefined`).
   */
  deleteCashbox: (tenantId: string, cashboxId: string) =>
    mockRequest(() => {
      const cashbox = getTenantScoped(cashboxes, (item) => item.id === cashboxId, tenantId);
      if (!cashbox) return undefined;
      if (isSystemCashbox(cashbox)) return { deleted: false, deactivated: false, systemProtected: true } as const;
      const hasMovements = transactions.some((transaction) => transaction.fromAccount === cashbox.cashboxNumber || transaction.toAccount === cashbox.cashboxNumber);
      if (hasMovements) {
        cashbox.status = 'inactive';
        return { deleted: false, deactivated: true } as const;
      }
      const index = cashboxes.findIndex((item) => item.id === cashboxId);
      cashboxes.splice(index, 1);
      return { deleted: true, deactivated: false } as const;
    }),

  /**
   * RÉACTIVATION (mandat « Évolution du cycle de vie des exercices fiscaux »
   * §33/§36 — audit des objets clôturables) : seul objet, hors exercice
   * fiscal, où la réouverture transverse a été jugée justifiée — une caisse
   * `inactive` (désactivée par `deleteCashbox` faute de pouvoir la supprimer,
   * cf. ci-dessus) ne perd aucune donnée financière, réactiver n'est qu'un
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
      const event: AuditEvent = {
        id: `AUD-FIN-${Date.now()}-${auditEvents.length}`,
        tenantId,
        timestamp: new Date().toISOString(),
        actorId: currentUser.id,
        actorName: currentUser.name,
        module: 'finance',
        action: 'finance.cashbox.reactivated',
        eventType: 'action',
        resourceType: 'cashbox',
        resourceId: cashbox.id,
        resourceLabel: cashbox.title,
        status: 'success',
        sensitive: false,
        correlationId: cashbox.id,
        before: { status: 'inactive' },
        after: { status: 'active' },
      };
      auditEvents.push(event);
      return withComputedBalance(cashbox);
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

  listTransactions: (tenantId: string) => mockRequest(() => transactions.filter((transaction) => transaction.tenantId === tenantId)),
  /**
   * Vue consolidée du tenant bornée par un Fiscal Year (mandat « Finance →
   * Transactions ») — `startDate`/`endDate` sont toujours celles du
   * `FiscalYear` déjà résolu côté appelant via `useFiscalYear()` (jamais une
   * caisse particulière comme périmètre). `tenantId` reste le seul
   * paramètre de sécurité, comme partout ailleurs dans ce service — toujours
   * `currentTenant.id`, jamais une valeur fournie par un formulaire. Bornes
   * inclusives, comparables lexicographiquement (`Transaction.date` et les
   * dates de `FiscalYear` partagent le même format ISO `YYYY-MM-DD`).
   */
  listTransactionsInDateRange: (tenantId: string, startDate: string, endDate: string) =>
    mockRequest(() => transactions.filter((transaction) => transaction.tenantId === tenantId && transaction.date >= startDate && transaction.date <= endDate)),

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
   * `recordedAt`/`date` (la « Date transaction » d'audit) ne figurent PAS dans
   * le patch : une correction historique doit passer par un mécanisme
   * d'annulation/correction, jamais par une réécriture de l'horodatage.
   */
  updateTransaction: (tenantId: string, transactionId: string, patch: Partial<Pick<Transaction, 'category' | 'subcategory' | 'type' | 'amount' | 'description' | 'sessionId'>>) =>
    mockRequest(() => {
      const transaction = getTenantScoped(transactions, (item) => item.id === transactionId, tenantId);
      if (!transaction || transaction.status === 'cancelled') return undefined;
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
