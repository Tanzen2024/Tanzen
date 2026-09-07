/**
 * Configuration transverse : un seul calendrier d'exercices fiscaux par
 * tenant, consommé par tous les modules (Finance, Tontines, Audit...) —
 * pas un exercice fiscal par module.
 */
import type { MeetingScheduleConfig } from './meeting-schedule';

export type FiscalYearStatus = 'open' | 'closed' | 'upcoming';

export type FiscalYear = {
  id: string;
  tenantId: string;
  label: string;
  startDate: string;
  endDate: string;
  status: FiscalYearStatus;
  isCurrent: boolean;
  /**
   * Ajouté par IMPLEMENTATION GO (D-FY-01/D-FY-06) : seule information de
   * cycle de vie portée directement par l'entité — le reste (qui a
   * créé/ouvert/clôturé/rouvert, quand, pourquoi) vit dans `audit_logs`
   * (`src/mocks/audit/audit-events.ts`), jamais dupliqué ici, conformément à
   * D-FY-06 (traçabilité via le mécanisme d'audit global, pas des champs
   * `createdBy`/`closedBy` sur l'entité elle-même). Consommateur : affichage
   * uniquement (aucune règle métier n'en dépend). Pour les 12 enregistrements
   * de seed préexistants (aucune date de création réelle n'a jamais été
   * tracée avant cette implémentation), la valeur retenue est `startDate` —
   * un choix d'affichage rétroactif pour les données de démonstration, pas
   * une donnée réelle ni une règle métier.
   */
  createdAt: string;
  /**
   * Configuration de récurrence des RÉUNIONS de l'exercice (mandat « RÈGLE
   * CENTRALE — DATES DE RÉUNION »). Quand elle est renseignée, ses occurrences
   * générées (`meetingService` + `generateMeetingDates`) sont la SOURCE DE
   * VÉRITÉ de tous les champs « Date de réunion » de l'application, isolées par
   * exercice et par tenant. `undefined` = aucun calendrier configuré : les
   * formulaires exigeant une réunion affichent un état explicite et se bloquent
   * (jamais de date inventée). Modifiable tant que l'exercice n'est pas `closed`.
   */
  meetingSchedule?: MeetingScheduleConfig;
};

export const fiscalYears: FiscalYear[] = [
  { id: 'FY-T001-2024', tenantId: 'T-001', label: 'Exercice 2024', startDate: '2024-01-01', endDate: '2024-12-31', status: 'closed', isCurrent: false, createdAt: '2024-01-01' },
  { id: 'FY-T001-2025', tenantId: 'T-001', label: 'Exercice 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false, createdAt: '2025-01-01' },
  // Calendrier de réunions seedé = « deuxième mardi de chaque mois » (l'exemple du mandat) → 12 occurrences en 2026.
  { id: 'FY-T001-2026', tenantId: 'T-001', label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01', meetingSchedule: { frequency: 'MONTHLY', rule: 'NTH_WEEKDAY', ordinal: 'SECOND', nthWeekday: 'TUESDAY' } },
  { id: 'FY-T001-2027', tenantId: 'T-001', label: 'Exercice 2027', startDate: '2027-01-01', endDate: '2027-12-31', status: 'upcoming', isCurrent: false, createdAt: '2027-01-01' },

  { id: 'FY-T002-2025', tenantId: 'T-002', label: 'Exercice 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false, createdAt: '2025-01-01' },
  { id: 'FY-T002-2026', tenantId: 'T-002', label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01', meetingSchedule: { frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth: 5 } },
  { id: 'FY-T002-2027', tenantId: 'T-002', label: 'Exercice 2027', startDate: '2027-01-01', endDate: '2027-12-31', status: 'upcoming', isCurrent: false, createdAt: '2027-01-01' },

  { id: 'FY-T003-2025', tenantId: 'T-003', label: 'Exercice 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false, createdAt: '2025-01-01' },
  { id: 'FY-T003-2026', tenantId: 'T-003', label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01' },

  { id: 'FY-T004-2026', tenantId: 'T-004', label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01' },

  { id: 'FY-T005-2025', tenantId: 'T-005', label: 'Exercice 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false, createdAt: '2025-01-01' },
  { id: 'FY-T005-2026', tenantId: 'T-005', label: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01' },
];
