import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { meetings } from '@/mocks/organization/governance';
import { members } from '@/mocks/organization/members';
import { attendances, type Attendance, type AttendanceStatus } from '@/mocks/organization/attendances';

export type AttendanceInput = { meetingId: string; memberId: string; status: AttendanceStatus; operationId: string };
export type AttendanceUpdateInput = { status: AttendanceStatus; operationId: string };

/**
 * D-4C3-WEB-03 (immuabilité) + D-4C3-TECH-01 (COMPLETED/CANCELLED = états
 * terminaux) : un Meeting est "ouvert" (Attendance modifiable) tant qu'il
 * est PLANNED ou ONGOING. La règle validée ne nomme explicitement que la
 * « clôture » (COMPLETED) ; elle est étendue ici à CANCELLED par cohérence
 * directe avec D-4C3-TECH-01 qui qualifie les deux états de "terminaux" au
 * même titre — un Attendance ne doit pas rester modifiable sur une réunion
 * annulée alors qu'il ne l'est plus sur une réunion terminée normalement.
 * Interprétation signalée explicitement (pas silencieuse) — voir
 * docs/P1_GOVERNANCE_PHASE_4C3_IMPLEMENTATION_REPORT.md §7.
 */
function isMeetingOpen(meetingId: string, tenantId: string): boolean {
  const meeting = getTenantScoped(meetings, (item) => item.id === meetingId, tenantId);
  return meeting !== undefined && (meeting.status === 'PLANNED' || meeting.status === 'ONGOING');
}

function isMemberOfTenant(memberId: string, tenantId: string): boolean {
  return members.some((member) => member.id === memberId && member.tenantId === tenantId);
}

/**
 * Isolation tenant indirecte (§10 du mandat IMPLEMENTATION GO) : `Attendance`
 * ne porte pas de `tenantId` propre (conforme au dictionnaire/diagramme,
 * cf. mocks/organization/attendances.ts) — une Attendance appartient au
 * tenant courant si et seulement si son Meeting y appartient. Une simple FK
 * `meetingId` n'est jamais traitée comme une preuve suffisante : on repasse
 * systématiquement par `getTenantScoped` sur `meetings`.
 */
function getAttendanceScoped(attendanceId: string, tenantId: string): Attendance | undefined {
  const attendance = attendances.find((item) => item.id === attendanceId);
  if (!attendance) return undefined;
  const meeting = getTenantScoped(meetings, (item) => item.id === attendance.meetingId, tenantId);
  return meeting ? attendance : undefined;
}

export const attendanceService = {
  listAttendancesByMeeting: (tenantId: string, meetingId: string) =>
    mockRequest(() => {
      const meeting = getTenantScoped(meetings, (item) => item.id === meetingId, tenantId);
      if (!meeting) return [];
      return attendances.filter((item) => item.meetingId === meetingId);
    }),

  /**
   * D-4C3-WEB-04 (Option B, idempotence) + D-4C3-TECH-02 (operation_id +
   * UNIQUE(meeting_id, member_id)) :
   * - meetingId/memberId doivent appartenir au tenant courant, sinon refusé
   *   (jamais un meeting_id ou member_id d'un autre tenant, §10/§13).
   * - meeting doit être ouvert (PLANNED/ONGOING), sinon refusé (§14, §3 D-4C3-WEB-03).
   * - même `operationId` sur le même couple (meetingId, memberId) = retransmission
   *   de la même opération logique -> renvoie l'enregistrement inchangé, ne crée
   *   jamais de doublon.
   * - `operationId` différent sur un couple déjà existant = nouvelle opération sur
   *   le même membre/réunion -> UNIQUE(meeting_id, member_id) appliquée en upsert
   *   (le statut est mis à jour, pas de second enregistrement créé).
   */
  createAttendance: (tenantId: string, input: AttendanceInput) =>
    mockRequest(() => {
      if (!isMeetingOpen(input.meetingId, tenantId)) return undefined;
      if (!isMemberOfTenant(input.memberId, tenantId)) return undefined;
      const existing = attendances.find((item) => item.meetingId === input.meetingId && item.memberId === input.memberId);
      if (existing) {
        if (existing.operationId === input.operationId) return existing;
        existing.status = input.status;
        existing.operationId = input.operationId;
        return existing;
      }
      const attendance: Attendance = { id: `ATT-${String(attendances.length + 1).padStart(3, '0')}`, meetingId: input.meetingId, memberId: input.memberId, status: input.status, operationId: input.operationId };
      attendances.push(attendance);
      return attendance;
    }),

  /** Même règle d'idempotence par `operationId` que createAttendance ; refuse toute écriture si le Meeting n'est plus ouvert (D-4C3-WEB-03). */
  updateAttendance: (tenantId: string, attendanceId: string, patch: AttendanceUpdateInput) =>
    mockRequest(() => {
      const attendance = getAttendanceScoped(attendanceId, tenantId);
      if (!attendance) return undefined;
      if (!isMeetingOpen(attendance.meetingId, tenantId)) return undefined;
      if (attendance.operationId === patch.operationId) return attendance;
      attendance.status = patch.status;
      attendance.operationId = patch.operationId;
      return attendance;
    }),

  /**
   * Suppression physique (pas de `deletedAt` : ce champ n'a pas été ajouté au
   * modèle, cf. mocks/organization/attendances.ts). Refuse toute suppression
   * si le Meeting n'est plus ouvert (D-4C3-WEB-03).
   */
  deleteAttendance: (tenantId: string, attendanceId: string) =>
    mockRequest(() => {
      const attendance = getAttendanceScoped(attendanceId, tenantId);
      if (!attendance) return undefined;
      if (!isMeetingOpen(attendance.meetingId, tenantId)) return undefined;
      const index = attendances.findIndex((item) => item.id === attendance.id);
      attendances.splice(index, 1);
      return attendance;
    }),
};
