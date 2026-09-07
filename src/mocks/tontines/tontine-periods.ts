/**
 * Période — niveau temporel de la Tontine (mandat refonte
 * Tenant→Tontine→Adhésions→Périodes→Occurrences), seul parent d'Occurrence.
 * L'ancien `TontineCycle` (Draw/Winner/CycleMember/CycleContribution) a été
 * entièrement retiré (mandat « suppression complète de la logique
 * Cycle/Tour ») : le modèle métier est désormais exactement
 * Tontine → Fréquence → Période → Occurrence, sans niveau Cycle. Une Tontine
 * est permanente et n'est jamais recréée ; ses Périodes successives portent
 * son historique temporel (D-TON refonte §2/§5).
 */
export type PeriodStatus = 'ACTIVE' | 'TERMINATED';

export type Period = {
  id: string;
  tenantId: string;
  tontineId: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  createdAt: string;
};

/**
 * PER-001/PER-002 ne sont pas des périodes inventées : elles reprennent
 * exactement les dates des Cycles (CYC-002, CYC-003) déjà référencés par les
 * Occurrences existantes (OCC-001/002/003), pour migrer leur parent sans
 * perdre ni falsifier l'historique déjà seedé. CYC-002/CYC-003 eux-mêmes ne
 * sont ni modifiés ni supprimés (leurs Draws/Members restent intacts).
 */
export const tontinePeriods: Period[] = [
  { id: 'PER-001', tenantId: 'T-002', tontineId: 'TON-001', startDate: '2026-06-01', endDate: '2027-05-31', status: 'ACTIVE', createdAt: '2026-06-01' },
  { id: 'PER-002', tenantId: 'T-005', tontineId: 'TON-002', startDate: '2026-07-01', endDate: '2027-02-28', status: 'ACTIVE', createdAt: '2026-07-01' },
];
