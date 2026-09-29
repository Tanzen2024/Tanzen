import { mockRequest } from './api-client';
import { formatCurrency } from '@/constants/currencies';
import { organizationSettingsList } from '@/mocks/settings/organization-settings';
import { financialOverviewData, contributionsData, repaymentsData, tontineActivityData } from '@/mocks/dashboard';
import { members } from '@/mocks/organization/members';
import { cashboxes, resolveCashbox } from '@/mocks/finance/cashboxes';
import { transactions } from '@/mocks/finance/transactions';
import { contributions } from '@/mocks/finance/contributions';
import { applications } from '@/mocks/finance/applications';
import { loans } from '@/mocks/finance/loans';
import { repayments } from '@/mocks/finance/repayments';
import { loanDebtAt } from '@/lib/finance/interest-distribution';
import { tontines } from '@/mocks/tontines/tontines';

/** Devise de l'association (Paramètres → Organisation) ; `undefined` → XAF par défaut dans `formatCurrency`. */
const organizationCurrencyOf = (tenantId: string) => organizationSettingsList.find((item) => item.tenantId === tenantId)?.currency;

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
    pendingWorkflows: KpiValue;
  };
  loansDistribution: { key: string; value: number }[];
  recentActivity: { id: string; typeKey: string; label: string; date: string }[];
  recentTransactions: { id: string; member: string; typeKey: string; amount: number; date: string; statusKey: string }[];
  upcomingPayments: { id: string; member: string; amount: number; dueDate: string; statusKey: string }[];
  loanDueDates: { id: string; member: string; amount: number; dueDate: string; progress: number }[];
  importantNotifications: { id: string; priority: 'high' | 'medium' | 'low'; titleKey: string; detail: string; date: string }[];
  pendingApprovals: { id: string; typeKey: string; requester: string; amount: number; date: string }[];
};

const noDelta: KpiValue['delta'] = '';
const kpi = (value: number): KpiValue => ({ value, delta: noDelta });

/** Nomenclature `Transaction.category` (mandat « CLASSIFICATION DES TRANSACTIONS ») → clé i18n du widget. */
const TX_TYPE_KEY: Record<string, string> = {
  EPARGNE: 'txContribution', REMBOURSEMENT: 'txRepayment', PRET: 'txDisbursement', AUTRES: 'txWithdrawal',
};

function buildOverview(tenantId: string): DashboardOverview {
  const tenantMembers = members.filter((member) => member.tenantId === tenantId);
  const tenantCashboxes = cashboxes.filter((cashbox) => cashbox.tenantId === tenantId);
  const tenantTransactions = transactions.filter((transaction) => transaction.tenantId === tenantId);
  const tenantContributions = contributions.filter((contribution) => contribution.tenantId === tenantId);
  const tenantApplications = applications.filter((application) => application.tenantId === tenantId);
  const tenantLoans = loans.filter((loan) => loan.tenantId === tenantId);
  const tenantRepayments = repayments.filter((repayment) => repayment.tenantId === tenantId);
  const tenantTontines = tontines.filter((tontine) => tontine.tenantId === tenantId);

  const byDateDesc = <T extends { date: string }>(rows: T[]) => [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Dette courante de chaque prêt (règles de référence du 2026-09-28), même calcul que le bilan et le module Crédit.
  const today = new Date().toISOString().slice(0, 10);
  const debtOf = (loan: (typeof tenantLoans)[number]) => loanDebtAt(loan, tenantRepayments.filter((repayment) => repayment.loanId === loan.id), today);
  const kpis: DashboardOverview['kpis'] = {
    members: kpi(tenantMembers.length),
    // Trésorerie = somme des soldes calculés (report d'ouverture + journal comptabilisé), même source que la fiche caisse.
    treasury: kpi(tenantCashboxes.reduce((sum, cashbox) => sum + resolveCashbox(cashbox, tenantTransactions).balance, 0)),
    contributions: kpi(tenantContributions.filter((c) => c.status === 'completed').reduce((sum, c) => sum + c.amount, 0)),
    activeLoans: kpi(tenantLoans.filter((loan) => loan.status === 'active').length),
    repayments: kpi(tenantRepayments.filter((r) => r.status === 'completed').reduce((sum, r) => sum + r.amount, 0)),
    outstanding: kpi(tenantLoans.reduce((sum, loan) => sum + Math.max(0, debtOf(loan)), 0)),
    activeTontines: kpi(tenantTontines.filter((tontine) => tontine.status === 'statusActive').length),
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

  const recentTransactions: DashboardOverview['recentTransactions'] = byDateDesc(tenantTransactions).slice(0, 5).map((transaction) => ({
    id: transaction.id,
    member: transaction.type === 'credit' ? transaction.source : transaction.destination,
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
    .map((loan) => ({ id: loan.id, member: loan.borrower, amount: debtOf(loan), dueDate: loan.nextPaymentDate, progress: loan.progress }));

  const importantNotifications: DashboardOverview['importantNotifications'] = [];
  const applicationsInReview = tenantApplications.filter((application) => application.stage === 'stageReview');
  if (applicationsInReview[0]) importantNotifications.push({ id: `notif-app-${applicationsInReview[0].id}`, priority: 'high', titleKey: 'loanReview', detail: `${applicationsInReview[0].applicant} · ${formatCurrency(applicationsInReview[0].requestedAmount, organizationCurrencyOf(tenantId))}`, date: applicationsInReview[0].submittedDate });
  const overdueLoans = tenantLoans.filter((loan) => lateLoanIds.has(loan.id));
  if (overdueLoans[0]) importantNotifications.push({ id: `notif-loan-${overdueLoans[0].id}`, priority: 'high', titleKey: 'overdueRepayment', detail: `${overdueLoans[0].borrower} · ${formatCurrency(debtOf(overdueLoans[0]), organizationCurrencyOf(tenantId))}`, date: overdueLoans[0].nextPaymentDate });
  // D-MEM-04 (définitive, docs/P1_MEMBERS_USERS_D_MEM_04_STATUS_ADDENDUM.md) : le statut
  // 'pending' (demande d'adhésion en attente) est retiré du vocabulaire Member — cette
  // notification/approbation ne peut plus jamais se déclencher (aucun membre ne peut plus
  // être 'pending'), retirée plutôt que conservée comme code mort silencieusement inatteignable.
  // Notification « Période bientôt terminée » retirée — la notion de Période n'existe plus
  // dans le module Tontines (restructuration : Tontine → Tour, directement, sans Période).

  const pendingApprovals: DashboardOverview['pendingApprovals'] = [];
  applicationsInReview.slice(0, 2).forEach((application) => pendingApprovals.push({ id: `approval-app-${application.id}`, typeKey: 'approvalLoan', requester: application.applicant, amount: application.requestedAmount, date: application.submittedDate }));
  // 'approvalMembership' (membre en attente d'adhésion) retiré — D-MEM-04, voir ci-dessus.

  return { kpis, loansDistribution, recentActivity, recentTransactions, upcomingPayments, loanDueDates, importantNotifications, pendingApprovals };
}

export const dashboardService = {
  getOverview: (tenantId: string) => mockRequest(() => buildOverview(tenantId)),

  /** Tendances illustratives (agrégat global, pas de granularité par tenant dans les mocks) — passe par le service plutôt qu'un import direct depuis la page. */
  getFinancialOverviewTrend: () => mockRequest(() => financialOverviewData),
  getContributionsTrend: () => mockRequest(() => contributionsData),
  getRepaymentsTrend: () => mockRequest(() => repaymentsData),
  getTontineActivityTrend: () => mockRequest(() => tontineActivityData),
};
