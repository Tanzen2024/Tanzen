/**
 * Validé D-4C4-WEB-10 (modèle étendu), cf.
 * docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md §5. Étend la fiche
 * dictionnaire #41 `vote_options` ({id, vote_id, label}, UNIQUE(vote_id,
 * label)) avec `code` et `display_order`, non prévus par le dictionnaire
 * mais validés par le PO. `POUR`/`CONTRE`/`ABSTENTION` ne sont PAS une
 * liste universelle imposée par le code — chaque `Vote` définit ses propres
 * `VoteOption` (mandat IMPLEMENTATION GO §17).
 */
export type VoteOption = {
  id: string;
  voteId: string;
  code: string;
  label: string;
  displayOrder: number;
  createdAt: string;
};

export const voteOptions: VoteOption[] = [];
