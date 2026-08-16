import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { accounts, type Account } from '@/mocks/finance/accounts';
import { transactions } from '@/mocks/finance/transactions';
import { contributions, contributionsByMonth } from '@/mocks/finance/contributions';
import { distributions, type Distribution } from '@/mocks/finance/distributions';

export type AccountInput = Omit<Account, 'id' | 'lastMovement'>;
export type DistributionInput = Pick<Distribution, 'beneficiary' | 'source' | 'amount' | 'date'>;

export const financeService = {
  listAccounts: (tenantId: string) => mockRequest(() => accounts.filter((account) => account.tenantId === tenantId)),
  getAccount: (tenantId: string, accountId: string) => mockRequest(() => getTenantScoped(accounts, (account) => account.id === accountId, tenantId)),
  createAccount: (input: AccountInput) =>
    mockRequest(() => {
      const account: Account = { id: `ACC-${String(accounts.length + 1).padStart(3, '0')}`, lastMovement: new Date().toISOString().slice(0, 10), ...input };
      accounts.push(account);
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
