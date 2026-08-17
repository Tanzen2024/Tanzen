import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { meetings, votes, type Vote } from '@/mocks/organization/governance';
import { members } from '@/mocks/organization/members';
import { assemblyDecisions } from '@/mocks/organization/assembly-decisions';
import { voteOptions, type VoteOption } from '@/mocks/organization/vote-options';
import { memberVotes, type MemberVote } from '@/mocks/organization/member-votes';

/**
 * D-4C4-WEB-07 (Vote.meeting_id → Meeting.id) + D-4C4-WEB-08 (Vote.assembly_decision_id
 * → AssemblyDecision.id, conservé en parallèle de meetingId, avec la règle
 * d'intégrité Vote.meetingId === AssemblyDecision.meetingId) + D-4C4-WEB-10
 * (VoteOption/MemberVote). Distinct de `organizationService.createVote`
 * (onglet Governance > Votes, vote autonome jamais concerné par ces
 * décisions) — voir `src/mocks/organization/governance.ts`.
 */
export type CreateDecisionVoteInput = { subject: string; optionLabels: string[] };

function getGeneralAssemblyMeetingScoped(tenantId: string, meetingId: string) {
  return getTenantScoped(meetings, (item) => item.id === meetingId && item.type === 'GENERAL_ASSEMBLY', tenantId);
}

/** Un Vote créé par ce service appartient au tenant ssi son Meeting (meetingId) l'est — jamais un simple id brut. */
function getVoteScoped(tenantId: string, voteId: string): Vote | undefined {
  const vote = votes.find((item) => item.id === voteId && item.meetingId !== null);
  if (!vote || !vote.meetingId) return undefined;
  return getTenantScoped(meetings, (item) => item.id === vote.meetingId, tenantId) ? vote : undefined;
}

export const decisionVoteService = {
  listVotesByDecision: (tenantId: string, decisionId: string) =>
    mockRequest(() => {
      const decision = assemblyDecisions.find((item) => item.id === decisionId);
      if (!decision || !getGeneralAssemblyMeetingScoped(tenantId, decision.meetingId)) return [];
      return votes.filter((vote) => vote.assemblyDecisionId === decisionId);
    }),

  listVoteOptions: (tenantId: string, voteId: string) =>
    mockRequest(() => {
      const vote = getVoteScoped(tenantId, voteId);
      if (!vote) return [];
      return voteOptions.filter((option) => option.voteId === voteId);
    }),

  listMemberVotes: (tenantId: string, voteId: string) =>
    mockRequest(() => {
      const vote = getVoteScoped(tenantId, voteId);
      if (!vote) return [];
      return memberVotes.filter((memberVote) => memberVote.voteId === voteId);
    }),

  /**
   * Règle d'intégrité obligatoire (D-4C4-WEB-08) : `Vote.meetingId ===
   * AssemblyDecision.meetingId` — appliquée ici en dérivant systématiquement
   * `meetingId` depuis la Decision elle-même (jamais depuis une valeur
   * fournie par l'appelant), rendant la violation structurellement
   * impossible plutôt que simplement vérifiée après coup.
   *
   * `optionLabels` : fournies par l'appelant, jamais une liste POUR/CONTRE/
   * ABSTENTION imposée par le code (mandat IMPLEMENTATION GO §17).
   */
  createVoteForDecision: (tenantId: string, decisionId: string, input: CreateDecisionVoteInput) =>
    mockRequest(() => {
      const decision = assemblyDecisions.find((item) => item.id === decisionId);
      if (!decision) return undefined;
      const meeting = getGeneralAssemblyMeetingScoped(tenantId, decision.meetingId);
      if (!meeting) return undefined;
      if (!input.subject.trim() || input.optionLabels.length === 0) return undefined;

      const vote: Vote = { id: `V-${String(votes.length + 1).padStart(3, '0')}`, tenantId, subject: input.subject, date: new Date().toISOString().slice(0, 10), yes: 0, no: 0, abstain: 0, result: 'pending', meetingId: decision.meetingId, assemblyDecisionId: decision.id };
      votes.push(vote);
      input.optionLabels.forEach((label, index) => {
        const option: VoteOption = { id: `VO-${String(voteOptions.length + 1).padStart(3, '0')}`, voteId: vote.id, code: `OPT-${index + 1}`, label, displayOrder: index + 1, createdAt: new Date().toISOString() };
        voteOptions.push(option);
      });
      return vote;
    }),

  /**
   * `UNIQUE(vote_id, member_id)` (D-4C4-WEB-10) : rejet explicite du
   * doublon (pas d'upsert idempotent comme `Attendance` — aucune décision
   * ne prévoit d'`operationId` sur `MemberVote`, mandat §18/§28 : "premier
   * => OK, deuxième => REJET"). Éligibilité vérifiée via
   * `eligibilityService` — aucune règle de présence obligatoire n'est
   * appliquée, faute de source l'établissant (mandat §20 : "ne pas créer
   * cette règle arbitrairement").
   */
  castMemberVote: (tenantId: string, voteId: string, memberId: string, voteOptionId: string) =>
    mockRequest(() => {
      const vote = getVoteScoped(tenantId, voteId);
      if (!vote) return undefined;
      const option = voteOptions.find((item) => item.id === voteOptionId && item.voteId === voteId);
      if (!option) return undefined;
      const member = members.find((item) => item.id === memberId && item.tenantId === tenantId);
      if (!member) return undefined;
      const alreadyVoted = memberVotes.some((item) => item.voteId === voteId && item.memberId === memberId);
      if (alreadyVoted) return undefined;

      const now = new Date().toISOString();
      const record: MemberVote = { id: `MV-${String(memberVotes.length + 1).padStart(3, '0')}`, voteId, memberId, voteOptionId, votedAt: now, createdAt: now, updatedAt: now };
      memberVotes.push(record);
      return record;
    }),
};
