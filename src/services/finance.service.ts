import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { accounts, type Account, type AccountType } from '@/mocks/finance/accounts';
import { transactions } from '@/mocks/finance/transactions';
import { contributions, contributionsByMonth } from '@/mocks/finance/contributions';
import { distributions, type Distribution } from '@/mocks/finance/distributions';
import { members } from '@/mocks/organization/members';

/**
 * Formulaire simplifié « Nouvelle caisse » (mandat CAISSE §2/§3) : ni tenant
 * (implicite via `currentTenant`, jamais depuis l'input), ni n° de compte
 * (généré ici), ni solde (matérialisé à 0 tant qu'aucune transaction),
 * ni statut (toujours 'active' à la création).
 */
export type AccountCreateInput = { title: string; type: AccountType; amount: number | null; description: string };
export type AccountUpdateInput = Partial<AccountCreateInput>;
export type DistributionInput = Pick<Distribution, 'beneficiary' | 'source' | 'amount' | 'date'>;

function isValidAccountType(type: unknown): type is AccountType {
  return type === 'LIBRE' || type === 'TAUX_FIXE';
}

/** LIBRE => montant toujours `null` (jamais transmis par l'UI, mais protégé ici en dernier rempart) ; TAUX_FIXE => montant obligatoire et strictement positif (0 n'a pas de sens pour une cotisation à taux fixe). */
function normalizeAmount(type: AccountType, amount: number | null): number | null | undefined {
  if (type === 'LIBRE') return null;
  if (amount === null || amount === undefined || Number.isNaN(amount) || amount <= 0) return undefined;
  return amount;
}

function isDuplicateTitle(tenantId: string, title: string, excludeAccountId?: string): boolean {
  const normalized = title.trim().toLowerCase();
  return accounts.some((account) => account.tenantId === tenantId && account.id !== excludeAccountId && account.title.trim().toLowerCase() === normalized);
}

export const financeService = {
  listAccounts: (tenantId: string) => mockRequest(() => accounts.filter((account) => account.tenantId === tenantId)),
  getAccount: (tenantId: string, accountId: string) => mockRequest(() => getTenantScoped(accounts, (account) => account.id === accountId, tenantId)),

  createAccount: (tenantId: string, tenantName: string, input: AccountCreateInput) =>
    mockRequest(() => {
      const title = input.title.trim();
      if (!title || !isValidAccountType(input.type)) return undefined;
      const amount = normalizeAmount(input.type, input.amount);
      if (amount === undefined) return undefined;
      if (isDuplicateTitle(tenantId, title)) return undefined;
      const account: Account = {
        id: `AC-${String(accounts.length + 1).padStart(3, '0')}`,
        tenantId,
        tenantName,
        accountNumber: `CX-${tenantId}-${String(accounts.length + 1).padStart(3, '0')}`,
        title,
        type: input.type,
        amount,
        description: input.description?.trim() ?? '',
        balance: 0,
        memberIds: [],
        status: 'active',
        lastMovement: new Date().toISOString().slice(0, 10),
      };
      accounts.push(account);
      return account;
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
      return account;
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
      return account;
    }),

  removeAccountMembers: (tenantId: string, accountId: string, memberIds: string[]) =>
    mockRequest(() => {
      const account = getTenantScoped(accounts, (item) => item.id === accountId, tenantId);
      if (!account) return undefined;
      const toRemove = new Set(memberIds);
      account.memberIds = account.memberIds.filter((id) => !toRemove.has(id));
      return account;
    }),

  listTransactions: (tenantId: string) => mockRequest(() => transactions.filter((transaction) => transaction.tenantId === tenantId)),

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
