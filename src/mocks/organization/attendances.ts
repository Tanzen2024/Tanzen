/**
 * Modèle canonique : dictionnaire de données, fiche #19 `attendances`
 * (docs/audit/excel_dictionary_dump.txt). Construit sous D-4C3-WEB-02
 * (Option A — construire maintenant), cf.
 * docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md §3.2.
 *
 * Champs canoniques volontairement exclus (même convention déjà établie pour
 * `GeneralAssembly`/`LoanRule`) : `uuid`, `created_at`, `updated_at`,
 * `deleted_at`. `penalty_amount` (présent uniquement au diagramme, pas au
 * dictionnaire) reste explicitement hors périmètre : il est en tension non
 * résolue avec le modèle transverse `Penalty` (NC-03bis) et n'est couvert
 * par aucune des 5 décisions validées de cette mission — ne pas l'ajouter
 * reviendrait sinon à trancher silencieusement ce sujet non demandé.
 *
 * PAS de `tenantId` : le dictionnaire (fiche #19) et le diagramme de classes
 * confirment l'absence de colonne tenant_id directe sur `attendances`.
 * L'isolation tenant est garantie indirectement via `meetingId →
 * Meeting.tenantId` par `attendance.service.ts`, jamais par un champ propre
 * à cette entité (mandat IMPLEMENTATION GO §10).
 *
 * `operationId` : n'est PAS un champ du dictionnaire — ajouté pour
 * D-4C3-WEB-04 / D-4C3-TECH-02 (idempotence). Identifie l'opération logique
 * d'origine pour distinguer une retransmission (même `operationId`, même
 * couple meetingId/memberId) d'une nouvelle saisie sur ce même couple.
 */
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export type Attendance = {
  id: string;
  meetingId: string;
  memberId: string;
  status: AttendanceStatus;
  operationId: string;
};

export const attendances: Attendance[] = [
  { id: 'ATT-001', meetingId: 'MT-004', memberId: 'M-001', status: 'PRESENT', operationId: 'OP-SEED-001' },
  { id: 'ATT-002', meetingId: 'MT-004', memberId: 'M-006', status: 'ABSENT', operationId: 'OP-SEED-002' },
  { id: 'ATT-003', meetingId: 'MT-001', memberId: 'M-001', status: 'PRESENT', operationId: 'OP-SEED-003' },
];
