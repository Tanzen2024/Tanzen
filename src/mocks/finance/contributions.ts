/**
 * Source canonique des cotisations (remplace les anciens `financeContributions`
 * et `Member.contributions`, qui dupliquaient les mêmes faits avec des IDs
 * différents). Toute vue (Finance > Contributions, fiche Membre) doit lire
 * ce tableau et le filtrer, jamais recopier ses valeurs.
 *
 * Distinct de `TontineContribution` (dans mocks/tontines/tontine-occurrences.ts) :
 * ce dernier est un enregistrement interne au modèle Tontine → Période →
 * Occurrence (protégé, non modifié ici), alors que `Contribution` est
 * l'écriture ledger côté Finance, rattachée à un membre réel.
 */
export type ContributionStatus = 'completed' | 'pending';

export type Contribution = {
  id: string;
  tenantId: string;
  memberId: string;
  tontineId: string;
  cycleNumber: number;
  amount: number;
  date: string;
  status: ContributionStatus;
};

export const contributions: Contribution[] = [
  { id: 'FC-001', tenantId: 'T-001', memberId: 'M-001', tontineId: 'TON-001', cycleNumber: 4, amount: 50_000, date: '2026-08-08', status: 'completed' },
  { id: 'FC-002', tenantId: 'T-002', memberId: 'M-002', tontineId: 'TON-001', cycleNumber: 4, amount: 75_000, date: '2026-08-08', status: 'completed' },
  { id: 'FC-003', tenantId: 'T-002', memberId: 'M-007', tontineId: 'TON-001', cycleNumber: 4, amount: 50_000, date: '2026-08-08', status: 'completed' },
  { id: 'FC-004', tenantId: 'T-001', memberId: 'M-006', tontineId: 'TON-001', cycleNumber: 4, amount: 50_000, date: '2026-08-08', status: 'completed' },
  { id: 'FC-005', tenantId: 'T-003', memberId: 'M-003', tontineId: 'TON-003', cycleNumber: 1, amount: 60_000, date: '2026-07-15', status: 'completed' },
  { id: 'FC-006', tenantId: 'T-005', memberId: 'M-005', tontineId: 'TON-002', cycleNumber: 1, amount: 40_000, date: '2026-07-12', status: 'completed' },
  { id: 'FC-007', tenantId: 'T-001', memberId: 'M-001', tontineId: 'TON-001', cycleNumber: 3, amount: 50_000, date: '2026-08-01', status: 'completed' },
  { id: 'FC-008', tenantId: 'T-002', memberId: 'M-002', tontineId: 'TON-001', cycleNumber: 3, amount: 75_000, date: '2026-08-01', status: 'completed' },
  { id: 'FC-009', tenantId: 'T-001', memberId: 'M-006', tontineId: 'TON-001', cycleNumber: 3, amount: 50_000, date: '2026-08-01', status: 'completed' },
  { id: 'FC-010', tenantId: 'T-005', memberId: 'M-005', tontineId: 'TON-002', cycleNumber: 2, amount: 40_000, date: '2026-08-05', status: 'pending' },
];

/** Tendance mensuelle illustrative (agrégat global, pas de donnée par tenant dans les mocks). */
export const contributionsByMonth = [
  { month: 'Mar', amount: 1_850_000 }, { month: 'Avr', amount: 2_100_000 }, { month: 'Mai', amount: 1_950_000 }, { month: 'Juin', amount: 2_300_000 }, { month: 'Juil', amount: 2_650_000 }, { month: 'Août', amount: 2_250_000 },
];
