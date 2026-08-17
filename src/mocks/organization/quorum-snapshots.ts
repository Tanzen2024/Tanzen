/**
 * Validé D-4C4-WEB-05 (Option A — QuorumSnapshot persistant), cf.
 * docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md §5. Absent du
 * dictionnaire canonique (aucune des 59 fiches ne le couvre) — schéma
 * entièrement issu de la décision PO, pas d'une source canonique
 * préexistante.
 *
 * `quorum_threshold_type`/`quorum_threshold_value` (D-4C4-WEB-04, Option C) :
 * seuil configurable, jamais une valeur numérique figée dans le code —
 * fournie explicitement par l'appelant à chaque calcul (aucune valeur par
 * défaut n'est inventée, cf. mandat IMPLEMENTATION GO §10).
 *
 * Pas de `tenant_id` propre : isolation indirecte via `meetingId →
 * Meeting.tenantId`, cohérent avec `Attendance` (Phase 4C-3).
 */
export type QuorumThresholdType = 'PERCENTAGE' | 'COUNT';

export type QuorumSnapshot = {
  id: string;
  meetingId: string;
  eligibleMemberCount: number;
  presentMemberCount: number;
  quorumThresholdType: QuorumThresholdType;
  quorumThresholdValue: number;
  quorumReached: boolean;
  frozenAt: string;
  createdAt: string;
};

export const quorumSnapshots: QuorumSnapshot[] = [];
