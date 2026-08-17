import type { Member, MemberStatus } from '@/mocks/organization/members';
import type { Meeting } from '@/mocks/organization/governance';

/**
 * D-4C4-WEB-03 (Option D — historisation + règle d'éligibilité AG), cf.
 * docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md §2 et mandat
 * IMPLEMENTATION GO §8-9.
 *
 * IMPORTANT — périmètre volontairement minimal : aucune source ne définit de
 * critère d'éligibilité au-delà de « appartenir au tenant » et « être actif
 * à la date de l'Assemblée ». Ce module n'invente PAS de critère
 * supplémentaire (durée minimale d'adhésion, cotisation, ancienneté, âge,
 * droits particuliers...) — c'est l'unique règle appliquée, exposée comme
 * un point d'extension isolé (cette fonction) plutôt que dispersée dans
 * l'UI, précisément pour qu'une future règle métier validée puisse être
 * ajoutée ici sans toucher aux appelants.
 */
export type EligibilityResult = { eligible: boolean; reason: 'tenantMismatch' | 'notActiveAtMeetingDate' | null };

/** Reconstruit le statut d'un membre à une date donnée à partir de `statusHistory` (D-4C4-WEB-03). */
export function getMemberStatusAt(member: Member, date: string): MemberStatus {
  const ordered = [...member.statusHistory].sort((a, b) => a.since.localeCompare(b.since));
  let status: MemberStatus = ordered[0]?.status ?? member.status;
  for (const entry of ordered) {
    if (entry.since <= date) status = entry.status;
    else break;
  }
  return status;
}

export const eligibilityService = {
  isMemberEligibleForGeneralAssembly(tenantId: string, member: Member, meeting: Meeting): EligibilityResult {
    if (member.tenantId !== tenantId || meeting.tenantId !== tenantId) return { eligible: false, reason: 'tenantMismatch' };
    const statusAtMeetingDate = getMemberStatusAt(member, meeting.date);
    if (statusAtMeetingDate !== 'active') return { eligible: false, reason: 'notActiveAtMeetingDate' };
    return { eligible: true, reason: null };
  },
};
