/**
 * Validé D-4C4-WEB-06 (Option A — AssemblyDecision liée directement à
 * Meeting), cf. docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md §5/§6.
 * Absent du dictionnaire canonique (aucune des 59 fiches ne le couvre) —
 * seul rapprochement documentaire : UCX5-01 « Exécuter les décisions »
 * (notion fonctionnelle uniquement, aucun schéma).
 *
 * Pas de `tenant_id` (D-4C4-WEB-09, Option B) : le tenant est dérivé de
 * `meetingId → Meeting.tenantId`, jamais stocké directement — cohérent avec
 * `Attendance` (Phase 4C-3).
 *
 * `status` : cycle de vie validé DRAFT → SUBMITTED → VOTING → DECIDED,
 * annulation possible depuis DRAFT/SUBMITTED vers CANCELLED. DECIDED et
 * CANCELLED sont terminaux.
 */
export type AssemblyDecisionStatus = 'DRAFT' | 'SUBMITTED' | 'VOTING' | 'DECIDED' | 'CANCELLED';

export type AssemblyDecision = {
  id: string;
  meetingId: string;
  decisionNumber: number;
  title: string;
  description: string;
  status: AssemblyDecisionStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
};

export const assemblyDecisions: AssemblyDecision[] = [];
