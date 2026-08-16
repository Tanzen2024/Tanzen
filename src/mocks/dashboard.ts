/**
 * Séries de tendance illustratives (agrégats mensuels globaux, aucune
 * entité nommée). Les KPI et les widgets à entités nommées (activité
 * récente, transactions, échéances, tirages, approbations) sont calculés
 * dynamiquement à partir des mocks métier réels par `dashboard.service.ts`
 * — ils ne vivent plus ici pour éviter toute donnée déconnectée du reste
 * de l'application.
 */
export const financialOverviewData = [
  { month: 'Jan', treasury: 162.4, contributions: 38.2, repayments: 24.1 },
  { month: 'Feb', treasury: 165.8, contributions: 39.5, repayments: 25.3 },
  { month: 'Mar', treasury: 168.2, contributions: 40.1, repayments: 26.8 },
  { month: 'Apr', treasury: 170.5, contributions: 38.8, repayments: 27.2 },
  { month: 'May', treasury: 172.1, contributions: 41.3, repayments: 26.5 },
  { month: 'Jun', treasury: 175.4, contributions: 40.8, repayments: 27.8 },
  { month: 'Jul', treasury: 178.2, contributions: 41.5, repayments: 28.1 },
  { month: 'Aug', treasury: 184.6, contributions: 42.3, repayments: 28.5 },
];

export const contributionsData = [
  { month: 'Jan', contributions: 38.2, target: 40 },
  { month: 'Feb', contributions: 39.5, target: 40 },
  { month: 'Mar', contributions: 40.1, target: 40 },
  { month: 'Apr', contributions: 38.8, target: 40 },
  { month: 'May', contributions: 41.3, target: 42 },
  { month: 'Jun', contributions: 40.8, target: 42 },
  { month: 'Jul', contributions: 41.5, target: 42 },
  { month: 'Aug', contributions: 42.3, target: 42 },
];

export const repaymentsData = [
  { month: 'Jan', repayments: 24.1, target: 28 },
  { month: 'Feb', repayments: 25.3, target: 28 },
  { month: 'Mar', repayments: 26.8, target: 28 },
  { month: 'Apr', repayments: 27.2, target: 28 },
  { month: 'May', repayments: 26.5, target: 30 },
  { month: 'Jun', repayments: 27.8, target: 30 },
  { month: 'Jul', repayments: 28.1, target: 30 },
  { month: 'Aug', repayments: 28.5, target: 30 },
];

export const tontineActivityData = [
  { month: 'Jan', cycles: 8, participants: 96 },
  { month: 'Feb', cycles: 9, participants: 108 },
  { month: 'Mar', cycles: 10, participants: 120 },
  { month: 'Apr', cycles: 10, participants: 115 },
  { month: 'May', cycles: 11, participants: 132 },
  { month: 'Jun', cycles: 11, participants: 138 },
  { month: 'Jul', cycles: 12, participants: 145 },
  { month: 'Aug', cycles: 12, participants: 152 },
];
