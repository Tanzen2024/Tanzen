/**
 * Validé D-4C4-WEB-10 (modèle étendu), cf.
 * docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md §5. Étend la fiche
 * dictionnaire #42 `member_votes` avec `updatedAt`. Contrainte validée :
 * `UNIQUE(vote_id, member_id)` — un membre ne peut voter qu'une fois pour un
 * même `Vote` (appliquée par `decision-vote.service.ts`, rejet explicite du
 * doublon — pas d'upsert idempotent comme `Attendance`, cette entité ne
 * porte pas d'`operationId`, aucune décision ne le prévoit).
 *
 * Pas de `tenant_id` : isolation indirecte via `voteId → Vote.meetingId →
 * Meeting.tenantId`, et via `memberId → Member.tenantId`.
 */
export type MemberVote = {
  id: string;
  voteId: string;
  memberId: string;
  voteOptionId: string;
  votedAt: string;
  createdAt: string;
  updatedAt: string;
};

export const memberVotes: MemberVote[] = [];
