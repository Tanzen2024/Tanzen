import { mockRequest } from './api-client';
import { financialOverviewData, contributionsData, repaymentsData, tontineActivityData } from '@/mocks/dashboard';
import { members } from '@/mocks/organization/members';
import { accounts } from '@/mocks/finance/accounts';
import { transactions } from '@/mocks/finance/transactions';
import { contributions } from '@/mocks/finance/contributions';
import { applications } from '@/mocks/finance/applications';
import { loans } from '@/mocks/finance/loans';
import { repayments } from '@/mocks/finance/repayments';
import { tontines } from '@/mocks/tontines/tontines';
import { tontineCycles } from '@/mocks/tontines/tontine-cycles';

type KpiValue = { value: number; delta: string };

export type DashboardOverview = {
  kpis: {
    members: KpiValue;
    treasury: KpiValue;
    contributions: KpiValue;
    activeLoans: KpiValue;
    repayments: KpiValue;
    outstanding: KpiValue;
    activeTontines: KpiValue;
    activeCycles: KpiValue;
    pendingWorkflows: KpiValue;
  };
  loansDistribution: { key: string; value: number }[];
  recentActivity: { id: string; typeKey: string; label: string; date: string }[];
  recentTransactions: { id: string; member: string; typeKey: string; amount: number; date: string; statusKey: string }[];
  upcomingPayments: { id: string; member: string; amount: number; dueDate: string; statusKey: string }[];
  loanDueDates: { id: string; member: string; amount: number; dueDate: string; progress: number }[];
  upcomingDraws: { id: string; tontine: string; cycle: number; drawDate: string; participants: number; amount: number }[];
  importantNotifications: { id: string; priority: 'high' | 'medium' | 'low'; titleKey: string; detail: string; date: string }[];
  pendingApprovals: { id: string; typeKey: string; requester: string; amount: number; date: string }[];
};

const noDelta: KpiValue['delta'] = '';
const kpi = (value: number): KpiValue => ({ value, delta: noDelta });

const TX_TYPE_KEY: Record<string, string> = {
  contribution: 'txContribution', loanRepayment: 'txRepayment', repayment: 'txRepayment', loanDisbursement: 'txDisbursement', distribution: 'txDistribution', fee: 'txWithdrawal', transfer: 'txWithdrawal', penalty: 'txWithdrawal',
};

function buildOverview(tenantId: string): DashboardOverview {
  const tenantMembers = members.filter((member) => member.tenantId === tenantId);
  const tenantAccounts = accounts.filter((account) => account.tenantId === tenantId);
  const tenantTransactions = transactions.filter((transaction) => transaction.tenantId === tenantId);
  const tenantContributions = contributions.filter((contribution) => contribution.tenantId === tenantId);
  const tenantApplications = applications.filter((application) => application.tenantId === tenantId);
  const tenantLoans = loans.filter((loan) => loan.tenantId === tenantId);
  const tenantRepayments = repayments.filter((repayment) => repayment.tenantId === tenantId);
  const tenantTontines = tontines.filter((tontine) => tontine.tenantId === tenantId);
  const tenantCycles = tontineCycles.filter((cycle) => cycle.tenantId === tenantId);

  const byDateDesc = <T extends { date: string }>(rows: T[]) => [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const kpis: DashboardOverview['kpis'] = {
    members: kpi(tenantMembers.length),
    treasury: kpi(tenantAccounts.reduce((sum, account) => sum + account.balance, 0)),
    contributions: kpi(tenantContributions.filter((c) => c.status === 'completed').reduce((sum, c) => sum + c.amount, 0)),
    activeLoans: kpi(tenantLoans.filter((loan) => loan.status === 'active').length),
    repayments: kpi(tenantRepayments.filter((r) => r.status === 'completed').reduce((sum, r) => sum + r.amount, 0)),
    outstanding: kpi(tenantLoans.reduce((sum, loan) => sum + loan.outstanding, 0)),
    activeTontines: kpi(tenantTontines.filter((tontine) => tontine.status === 'statusActive').length),
    activeCycles: kpi(tenantCycles.filter((cycle) => cycle.status === 'statusOpen').length),
    pendingWorkflows: kpi(0),
  };

  const lateLoanIds = new Set(tenantRepayments.filter((r) => r.status === 'late').map((r) => r.loanId));
  const loansDistribution = [
    { key: 'loanDisbursed', value: tenantApplications.filter((a) => a.stage === 'stageDisbursed').length },
    { key: 'loanPending', value: tenantApplications.filter((a) => a.stage === 'stageSubmitted' || a.stage === 'stageReview').length },
    { key: 'loanRepaid', value: tenantLoans.filter((l) => l.status === 'repaid').length },
    { key: 'loanOverdue', value: tenantLoans.filter((l) => lateLoanIds.has(l.id)).length },
  ];

  const recentActivity: DashboardOverview['recentActivity'] = [];
  const latestMember = byDateDesc(tenantMembers.map((m) => ({ ...m, date: m.joinedAt })))[0];
  if (latestMember) recentActivity.push({ id: `activity-member-${latestMember.id}`, typeKey: 'activityMemberJoined', label: `${latestMember.firstName} ${latestMember.lastName}`, date: latestMember.joinedAt });
  const latestLoan = byDateDesc(tenantLoans.map((l) => ({ ...l, date: l.disbursementDate })))[0];
  if (latestLoan) recentActivity.push({ id: `activity-loan-${latestLoan.id}`, typeKey: 'activityLoanApproved', label: latestLoan.borrower, date: latestLoan.disbursementDate });
  const latestContribution = byDateDesc(tenantContributions.filter((c) => c.status === 'completed'))[0];
  if (latestContribution) {
    const member = members.find((m) => m.id === latestContribution.memberId);
    recentActivity.push({ id: `activity-contribution-${latestContribution.id}`, typeKey: 'activityContributionReceived', label: member ? `${member.firstName} ${member.lastName}` : latestContribution.memberId, date: latestContribution.date });
  }
  const completedDraws = tenantCycles.flatMap((cycle) => cycle.draws.filter((draw) => draw.status === 'statusCompleted').map((draw) => ({ ...draw, tontineName: tontines.find((t) => t.id === cycle.tontineId)?.name ?? cycle.tontineId })));
  const latestDraw = byDateDesc(completedDraws)[0];
  if (latestDraw) recentActivity.push({ id: `activity-draw-${latestDraw.id}`, typeKey: 'activityTontineDrawCompleted', label: `${latestDraw.tontineName} · ${latestDraw.winnerName}`, date: latestDraw.date });

  const recentTransactions: DashboardOverview['recentTransactions'] = byDateDesc(tenantTransactions).slice(0, 5).map((transaction) => ({
    id: transaction.id,
    member: transaction.type === 'credit' ? transaction.fromAccount : transaction.toAccount,
    typeKey: TX_TYPE_KEY[transaction.category] ?? 'txContribution',
    amount: transaction.amount,
    date: transaction.date,
    statusKey: transaction.status === 'completed' ? 'statusCompleted' : transaction.status === 'failed' ? 'statusRejected' : 'statusPending',
  }));

  const upcomingPayments: DashboardOverview['upcomingPayments'] = [...tenantRepayments]
    .filter((repayment) => repayment.status === 'scheduled')
    .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())
    .slice(0, 5)
    .map((repayment) => ({ id: repayment.id, member: repayment.borrower, amount: repayment.amount, dueDate: repayment.paymentDate, statusKey: 'statusDue' }));

  const loanDueDates: DashboardOverview['loanDueDates'] = [...tenantLoans]
    .filter((loan) => loan.status === 'active')
    .sort((a, b) => new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime())
    .slice(0, 4)
    .map((loan) => ({ id: loan.id, member: loan.borrower, amount: loan.outstanding, dueDate: loan.nextPaymentDate, progress: loan.progress }));

  const scheduledDraws = tenantCycles.flatMap((cycle) => cycle.draws.filter((draw) => draw.status === 'statusScheduled').map((draw) => ({
    id: draw.id,
    tontine: tontines.find((t) => t.id === cycle.tontineId)?.name ?? cycle.tontineId,
    cycle: cycle.cycleNumber,
    drawDate: draw.date,
    participants: cycle.members.filter((member) => member.status === 'statusActive').length,
    amount: draw.contributionPool,
  })));
  const upcomingDraws = [...scheduledDraws].sort((a, b) => new Date(a.drawDate).getTime() - new Date(b.drawDate).getTime()).slice(0, 4);

  const importantNotifications: DashboardOverview['importantNotifications'] = [];
  const applicationsInReview = tenantApplications.filter((application) => application.stage === 'stageReview');
  if (applicationsInReview[0]) importantNotifications.push({ id: `notif-app-${applicationsInReview[0].id}`, priority: 'high', titleKey: 'loanReview', detail: `${applicationsInReview[0].applicant} · ${applicationsInReview[0].requestedAmount.toLocaleString('fr-FR')} FCFA`, date: applicationsInReview[0].submittedDate });
  const overdueLoans = tenantLoans.filter((loan) => lateLoanIds.has(loan.id));
  if (overdueLoans[0]) importantNotifications.push({ id: `notif-loan-${overdueLoans[0].id}`, priority: 'high', titleKey: 'overdueRepayment', detail: `${overdueLoans[0].borrower} · ${overdueLoans[0].outstanding.toLocaleString('fr-FR')} FCFA`, date: overdueLoans[0].nextPaymentDate });
  // D-MEM-04 (définitive, docs/P1_MEMBERS_USERS_D_MEM_04_STATUS_ADDENDUM.md) : le statut
  // 'pending' (demande d'adhésion en attente) est retiré du vocabulaire Member — cette
  // notification/approbation ne peut plus jamais se déclencher (aucun membre ne peut plus
  // être 'pending'), retirée plutôt que conservée comme code mort silencieusement inatteignable.
  const now = Date.now();
  const soonClosingCycles = tenantCycles.filter((cycle) => cycle.status === 'statusOpen' && new Date(cycle.endDate).getTime() - now < 45 * 86_400_000);
  if (soonClosingCycles[0]) {
    const tontine = tontines.find((t) => t.id === soonClosingCycles[0].tontineId);
    importantNotifications.push({ id: `notif-cycle-${soonClosingCycles[0].id}`, priority: 'low', titleKey: 'cycleEndingSoon', detail: `${tontine?.name ?? soonClosingCycles[0].tontineId} · Cycle ${soonClosingCycles[0].cycleNumber}`, date: soonClosingCycles[0].endDate });
  }

  const pendingApprovals: DashboardOverview['pendingApprovals'] = [];
  applicationsInReview.slice(0, 2).forEach((application) => pendingApprovals.push({ id: `approval-app-${application.id}`, typeKey: 'approvalLoan', requester: application.applicant, amount: application.requestedAmount, date: application.submittedDate }));
  // 'approvalMembership' (membre en attente d'adhésion) retiré — D-MEM-04, voir ci-dessus.

  return { kpis, loansDistribution, recentActivity, recentTransactions, upcomingPayments, loanDueDates, upcomingDraws, importantNotifications, pendingApprovals };
}

export const dashboardService = {
  getOverview: (tenantId: string) => mockRequest(() => buildOverview(tenantId)),

  /** Tendances illustratives (agrégat global, pas de granularité par tenant dans les mocks) — passe par le service plutôt qu'un import direct depuis la page. */
  getFinancialOverviewTrend: () => mockRequest(() => financialOverviewData),
  getContributionsTrend: () => mockRequest(() => contributionsData),
  getRepaymentsTrend: () => mockRequest(() => repaymentsData),
  getTontineActivityTrend: () => mockRequest(() => tontineActivityData),
};
