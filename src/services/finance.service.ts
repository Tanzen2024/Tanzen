import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { accounts, hasAccountLabelConflict, resolveAccount, type Account, type AccountRecord, type AccountType } from '@/mocks/finance/accounts';
import { transactions, type Transaction, type TransactionType } from '@/mocks/finance/transactions';
import { isClassificationValid, isTransactionCategory, type TransactionCategory, type TransactionSubcategory } from '@/mocks/finance/transaction-classification';
import { contributions, contributionsByMonth } from '@/mocks/finance/contributions';
import { distributions, type Distribution } from '@/mocks/finance/distributions';
import { members } from '@/mocks/organization/members';
import { meetingService } from './meeting.service';

/**
 * Formulaire simplifié « Nouvelle caisse » (mandat CAISSE §2/§3) : ni tenant
 * (implicite via `currentTenant`, jamais depuis l'input), ni n° de compte
 * (généré ici), ni solde (matérialisé à 0 tant qu'aucun mouvement), ni statut
 * (toujours 'active' à la création). `type` (nature de cotisation) est la seule
 * dimension métier saisie.
 */
export type AccountCreateInput = { title: string; type: AccountType; amount: number | null; description: string };
export type AccountUpdateInput = Partial<AccountCreateInput>;
export type DistributionInput = Pick<Distribution, 'beneficiary' | 'source' | 'amount' | 'date'>;

/**
 * Saisie d'une transaction depuis le journal central (mandat « Transactions =
 * journal financier central » §4). `tenantId` reste le seul paramètre de
 * sécurité (toujours `currentTenant.id`, jamais l'input). `accountNumber` et
 * `memberName` sont résolus côté appelant (déjà chargés pour peupler les
 * `<select>`), passés ici pour composer `fromAccount`/`toAccount` selon le sens,
 * sans réinventer une résolution de compte/adhérent.
 *
 * PAS de champ `date` : la « Date transaction » (`Transaction.recordedAt`, dite
 * `transaction_at`) est une donnée d'AUDIT générée exclusivement au moment du
 * INSERT (voir `createTransaction`). Le frontend ne l'envoie jamais et ne peut
 * pas la modifier. La seule date métier saisissable est celle de la réunion
 * (`meetingId` → `meetingDate`).
 */
export type TransactionInput = {
  accountNumber: string;
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
   * Réunion à laquelle l'opération se rapporte (mandat « RÈGLE CENTRALE — DATES
   * DE RÉUNION »). `meetingId` = `MTG-<fiscalYearId>-<YYYYMMDD>` généré par
   * l'exercice fiscal (`meetingService`) — jamais une date saisie librement.
   * `fiscalYearId` porte l'isolation §12 : `createTransaction` rejette la
   * transaction si `meetingId` n'appartient pas à cet exercice / ce tenant.
   * `meetingDate` est la date affichée (`meeting.meeting_date`), dérivée du
   * `meetingId` — distincte de `transaction_at` (`recordedAt`, horodatage système).
   */
  meetingId?: string;
  meetingDate?: string;
  fiscalYearId?: string;
};

function isValidAccountType(type: unknown): type is AccountType {
  return type === 'LIBRE' || type === 'TAUX_FIXE';
}

/** LIBRE => montant toujours `null` (jamais transmis par l'UI, mais protégé ici en dernier rempart) ; TAUX_FIXE => montant obligatoire et strictement positif (0 n'a pas de sens pour une cotisation à taux fixe). */
function normalizeAmount(type: AccountType, amount: number | null): number | null | undefined {
  if (type === 'LIBRE') return null;
  if (amount === null || amount === undefined || Number.isNaN(amount) || amount <= 0) return undefined;
  return amount;
}

/**
 * Contrôle d'unicité du libellé de caisse (règle métier `hasAccountLabelConflict`,
 * `@/mocks/finance/accounts`) — dernier rempart côté « backend » : refuse la
 * création/modification même si le garde-fou du formulaire React est contourné.
 * Unicité sur (`tenantId` + libellé NORMALISÉ : trim, espaces réduits, sans
 * casse, sans accent). `excludeAccountId` laisse une caisse garder son libellé.
 */
function isDuplicateTitle(tenantId: string, title: string, excludeAccountId?: string): boolean {
  return hasAccountLabelConflict(accounts, tenantId, title, excludeAccountId);
}

/** Projette une caisse stockée vers l'`Account` complet (solde + dernier mouvement calculés depuis le journal courant). Source unique : `resolveAccount`. */
function withComputedBalance(account: AccountRecord): Account {
  return resolveAccount(account, transactions);
}

export const financeService = {
  listAccounts: (tenantId: string) => mockRequest(() => accounts.filter((account) => account.tenantId === tenantId).map(withComputedBalance)),
  getAccount: (tenantId: string, accountId: string) =>
    mockRequest(() => {
      const account = getTenantScoped(accounts, (item) => item.id === accountId, tenantId);
      return account ? withComputedBalance(account) : undefined;
    }),

  createAccount: (tenantId: string, tenantName: string, input: AccountCreateInput) =>
    mockRequest(() => {
      const title = input.title.trim();
      if (!title || !isValidAccountType(input.type)) return undefined;
      const amount = normalizeAmount(input.type, input.amount);
      if (amount === undefined) return undefined;
      if (isDuplicateTitle(tenantId, title)) return undefined;
      const account: AccountRecord = {
        id: `AC-${String(accounts.length + 1).padStart(3, '0')}`,
        tenantId,
        tenantName,
        accountNumber: `CX-${tenantId}-${String(accounts.length + 1).padStart(3, '0')}`,
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
      accounts.push(account);
      return withComputedBalance(account);
    }),

  updateAccount: (tenantId: string, accountId: string, patch: AccountUpdateInput) =>
    mockRequest(() => {
      const account = getTenantScoped(accounts, (item) => item.id === accountId, tenantId);
      if (!account) return undefined;
      const nextType = patch.type ?? account.type;
      if (!isValidAccountType(nextType)) return undefined;
      const nextTitle = (patch.title ?? account.title).trim();
      if (!nextTitle) return undefined;
      if (patch.title && isDuplicateTitle(tenantId, nextTitle, accountId)) return undefined;
      const nextAmount = normalizeAmount(nextType, patch.amount !== undefined ? patch.amount : account.amount);
      if (nextAmount === undefined) return undefined;
      account.title = nextTitle;
      account.type = nextType;
      account.amount = nextAmount;
      if (patch.description !== undefined) account.description = patch.description.trim();
      return withComputedBalance(account);
    }),

  /**
   * Ajustement manuel du REPORT D'OUVERTURE (`openingBalance`) — `amount` est une
   * magnitude positive qui augmente le report. Ne crée aucune transaction : sert
   * uniquement à corriger la situation antérieure au journal. Le solde courant
   * reste `openingBalance + Σ journal`, recalculé à la lecture.
   */
  recordAccountMovement: (tenantId: string, accountId: string, amount: number) =>
    mockRequest(() => {
      const account = getTenantScoped(accounts, (item) => item.id === accountId, tenantId);
      if (!account) return undefined;
      if (!Number.isFinite(amount) || amount <= 0) return undefined;
      account.openingBalance += amount;
      account.openedOn = new Date().toISOString().slice(0, 10);
      return withComputedBalance(account);
    }),

  /**
   * Ne supprime jamais un compte ayant déjà des mouvements (§8) : bascule sur
   * une désactivation logique à la place. `deleted: true` uniquement si la
   * suppression physique a réellement eu lieu.
   */
  deleteAccount: (tenantId: string, accountId: string) =>
    mockRequest(() => {
      const account = getTenantScoped(accounts, (item) => item.id === accountId, tenantId);
      if (!account) return undefined;
      const hasMovements = transactions.some((transaction) => transaction.fromAccount === account.accountNumber || transaction.toAccount === account.accountNumber);
      if (hasMovements) {
        account.status = 'inactive';
        return { deleted: false, deactivated: true } as const;
      }
      const index = accounts.findIndex((item) => item.id === accountId);
      accounts.splice(index, 1);
      return { deleted: true, deactivated: false } as const;
    }),

  /** Adhérents affectés à une caisse — filtre en plus par tenant courant pour ne jamais laisser fuiter un `memberId` d'un autre tenant. */
  listAccountMembers: (tenantId: string, accountId: string) =>
    mockRequest(() => {
      const account = getTenantScoped(accounts, (item) => item.id === accountId, tenantId);
      if (!account) return [];
      return members.filter((member) => member.tenantId === tenantId && account.memberIds.includes(member.id));
    }),

  addAccountMembers: (tenantId: string, accountId: string, memberIds: string[]) =>
    mockRequest(() => {
      const account = getTenantScoped(accounts, (item) => item.id === accountId, tenantId);
      if (!account) return undefined;
      const eligibleIds = new Set(members.filter((member) => member.tenantId === tenantId && memberIds.includes(member.id)).map((member) => member.id));
      const merged = new Set(account.memberIds);
      eligibleIds.forEach((id) => merged.add(id));
      account.memberIds = [...merged];
      return withComputedBalance(account);
    }),

  removeAccountMembers: (tenantId: string, accountId: string, memberIds: string[]) =>
    mockRequest(() => {
      const account = getTenantScoped(accounts, (item) => item.id === accountId, tenantId);
      if (!account) return undefined;
      const toRemove = new Set(memberIds);
      account.memberIds = account.memberIds.filter((id) => !toRemove.has(id));
      return withComputedBalance(account);
    }),

  listTransactions: (tenantId: string) => mockRequest(() => transactions.filter((transaction) => transaction.tenantId === tenantId)),
  /**
   * Vue consolidée du tenant bornée par un Fiscal Year (mandat « Finance →
   * Transactions ») — `startDate`/`endDate` sont toujours celles du
   * `FiscalYear` déjà résolu côté appelant via `useFiscalYear()` (jamais une
   * caisse/compte particulier comme périmètre). `tenantId` reste le seul
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
   * c'est un dérivé de `recordedAt`, pas une saisie. `meetingDate` porte, elle,
   * la date métier de la réunion.
   */
  createTransaction: (tenantId: string, input: TransactionInput) =>
    mockRequest(() => {
      const amount = Number(input.amount);
      if (!input.accountNumber || !Number.isFinite(amount) || amount <= 0) return undefined;
      // Validations de classification (mandat §22) : catégorie officielle, et
      // combinaison catégorie/sous-catégorie cohérente (AUTRES ⇔ sous-catégorie
      // valide ; EPARGNE/PRET/REMBOURSEMENT ⇒ aucune sous-catégorie). Empêche
      // aussi qu'un client force une sous-catégorie appartenant à une autre
      // catégorie (ex. `EPARGNE` + `FRAIS`).
      if (!isTransactionCategory(input.category)) return undefined;
      if (!isClassificationValid(input.category, input.subcategory ?? null)) return undefined;
      // Isolation §12 : une réunion sélectionnée DOIT appartenir à l'exercice fiscal
      // ET au tenant de l'opération (l'id `MTG-<fiscalYearId>-…` encode les deux).
      if (input.meetingId) {
        if (!input.fiscalYearId) return undefined;
        if (!meetingService.validateMeetingBelongsToExercise(input.meetingId, input.fiscalYearId, tenantId)) return undefined;
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
        // Même convention que le seed / `transactionAccountLabel` : pour un crédit
        // les fonds vont vers le compte, pour un débit ils en sortent.
        fromAccount: input.type === 'credit' ? (memberName ?? input.accountNumber) : input.accountNumber,
        toAccount: input.type === 'credit' ? input.accountNumber : (memberName ?? input.accountNumber),
        description: input.description.trim(),
        memberId: input.memberId || undefined,
        meetingId: input.meetingId || undefined,
        // `meetingDate` affichée = date résolue depuis `meetingId` (jamais une saisie libre).
        meetingDate: input.meetingId ? meetingService.resolveMeetingDate(input.meetingId) ?? input.meetingDate ?? undefined : undefined,
        fiscalYearId: input.fiscalYearId || undefined,
        recordedAt: now.toISOString(),
      };
      transactions.push(transaction);
      return transaction;
    }),

  /**
   * `recordedAt`/`date` (la « Date transaction » d'audit) ne figurent PAS dans
   * le patch : une correction historique doit passer par un mécanisme
   * d'annulation/correction, jamais par une réécriture de l'horodatage.
   */
  updateTransaction: (tenantId: string, transactionId: string, patch: Partial<Pick<Transaction, 'category' | 'subcategory' | 'type' | 'amount' | 'description' | 'meetingId' | 'meetingDate'>>) =>
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
      if (patch.meetingId !== undefined) {
        const nextMeetingId = patch.meetingId || undefined;
        // Isolation §12 : une nouvelle réunion doit rester dans l'exercice/tenant de la transaction.
        if (nextMeetingId) {
          if (!transaction.fiscalYearId) return undefined;
          if (!meetingService.validateMeetingBelongsToExercise(nextMeetingId, transaction.fiscalYearId, tenantId)) return undefined;
        }
        transaction.meetingId = nextMeetingId;
        transaction.meetingDate = nextMeetingId ? meetingService.resolveMeetingDate(nextMeetingId) ?? undefined : undefined;
      } else if (patch.meetingDate !== undefined) {
        transaction.meetingDate = patch.meetingDate || undefined;
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
