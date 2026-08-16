/**
 * Configuration transverse : un seul calendrier d'exercices fiscaux par
 * tenant, consommé par tous les modules (Finance, Tontines, Audit...) —
 * pas un exercice fiscal par module.
 */
export type FiscalYearStatus = 'open' | 'closed' | 'upcoming';

export type FiscalYear = {
  id: string;
  tenantId: string;
  label: string;
  startDate: string;
  endDate: string;
  status: FiscalYearStatus;
  isCurrent: boolean;
};

export const fiscalYears: FiscalYear[] = [
  { id: 'FY-T001-2024', tenantId: 'T-001', label: 'Exercice 2024', startDate: '2024-01-01', endDate: '2024-12-31', status: 'closed', isCurrent: false },
  { id: 'FY-T001-2025', tenantId: 'T-001', label: 'Exercice 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false },
  { id: 'FY-T001-2026', tenantId: 'T-001', label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true },
  { id: 'FY-T001-2027', tenantId: 'T-001', label: 'Exercice 2027', startDate: '2027-01-01', endDate: '2027-12-31', status: 'upcoming', isCurrent: false },

  { id: 'FY-T002-2025', tenantId: 'T-002', label: 'Exercice 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false },
  { id: 'FY-T002-2026', tenantId: 'T-002', label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true },
  { id: 'FY-T002-2027', tenantId: 'T-002', label: 'Exercice 2027', startDate: '2027-01-01', endDate: '2027-12-31', status: 'upcoming', isCurrent: false },

  { id: 'FY-T003-2025', tenantId: 'T-003', label: 'Exercice 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false },
  { id: 'FY-T003-2026', tenantId: 'T-003', label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true },

  { id: 'FY-T004-2026', tenantId: 'T-004', label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true },

  { id: 'FY-T005-2025', tenantId: 'T-005', label: 'Exercice 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false },
  { id: 'FY-T005-2026', tenantId: 'T-005', label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true },
];
