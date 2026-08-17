import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { meetings } from '@/mocks/organization/governance';
import { members } from '@/mocks/organization/members';
import { attendances } from '@/mocks/organization/attendances';
import { quorumSnapshots, type QuorumSnapshot, type QuorumThresholdType } from '@/mocks/organization/quorum-snapshots';
import { eligibilityService } from './eligibility.service';

export type QuorumThresholdInput = { type: QuorumThresholdType; value: number };

/** `Meeting` scopé au tenant ET explicitement de type GENERAL_ASSEMBLY — QuorumSnapshot n'a de sens que pour une AG. */
function getGeneralAssemblyMeetingScoped(tenantId: string, meetingId: string) {
  return getTenantScoped(meetings, (item) => item.id === meetingId && item.type === 'GENERAL_ASSEMBLY', tenantId);
}

export const quorumService = {
  getQuorumSnapshot: (tenantId: string, meetingId: string) =>
    mockRequest(() => {
      const meeting = getGeneralAssemblyMeetingScoped(tenantId, meetingId);
      if (!meeting) return undefined;
      return quorumSnapshots.find((snapshot) => snapshot.meetingId === meetingId);
    }),

  /**
   * D-4C4-WEB-04/05 : figeage unique du résultat de quorum (`UNIQUE(meeting_id)`
   * — un second appel sur un `Meeting` déjà doté d'un snapshot est refusé,
   * jamais recalculé silencieusement, mandat IMPLEMENTATION GO §11).
   * `threshold` est obligatoire, fourni par l'appelant : aucune valeur par
   * défaut n'est inventée (§10 du mandat) — validation explicite si absent.
   * Éligibilité : `eligibilityService.isMemberEligibleForGeneralAssembly`
   * (unique critère validé : tenant + actif à la date de la réunion, D-4C4-WEB-03).
   * Présence : `Attendance.status === 'PRESENT'` pour ce `meetingId`.
   */
  computeAndFreezeQuorumSnapshot: (tenantId: string, meetingId: string, threshold: QuorumThresholdInput) =>
    mockRequest(() => {
      const meeting = getGeneralAssemblyMeetingScoped(tenantId, meetingId);
      if (!meeting) return undefined;
      if (!threshold || (threshold.type !== 'PERCENTAGE' && threshold.type !== 'COUNT') || !Number.isFinite(threshold.value) || threshold.value < 0) return undefined;
      const alreadyFrozen = quorumSnapshots.some((snapshot) => snapshot.meetingId === meetingId);
      if (alreadyFrozen) return undefined;

      const tenantMembers = members.filter((member) => member.tenantId === tenantId);
      const eligibleMemberCount = tenantMembers.filter((member) => eligibilityService.isMemberEligibleForGeneralAssembly(tenantId, member, meeting).eligible).length;
      const presentMemberCount = attendances.filter((attendance) => attendance.meetingId === meetingId && attendance.status === 'PRESENT').length;

      const quorumReached = threshold.type === 'COUNT'
        ? presentMemberCount >= threshold.value
        : eligibleMemberCount > 0 && (presentMemberCount / eligibleMemberCount) * 100 >= threshold.value;

      const snapshot: QuorumSnapshot = {
        id: `QS-${String(quorumSnapshots.length + 1).padStart(3, '0')}`,
        meetingId,
        eligibleMemberCount,
        presentMemberCount,
        quorumThresholdType: threshold.type,
        quorumThresholdValue: threshold.value,
        quorumReached,
        frozenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      quorumSnapshots.push(snapshot);
      return snapshot;
    }),
};
