/**
 * SÉANCE d'un exercice fiscal — reconstruction complète du sous-module
 * « Exercices fiscaux / Séances », remplace intégralement l'ancien mécanisme
 * « Meeting » (dates dérivées, virtuelles, jamais persistées). Une
 * `FiscalSession` est une entité RÉELLEMENT PERSISTÉE, créée un acte manuel à
 * la fois (`fiscal-session.service.ts`, `createSession`) — exactement le même
 * principe que `TontineOccurrence` (« Tour ») pour les Tontines : jamais de
 * génération en masse, jamais de précréation automatique.
 */
export type FiscalSession = {
  id: string;
  tenantId: string;
  fiscalYearId: string;
  /** Numéro de séance — propre à l'exercice (Séance 1, 2, 3…), jamais global au tenant. Jamais réutilisé après suppression (il n'existe d'ailleurs aucune suppression). */
  sessionNumber: number;
  date: string;
  createdAt: string;
};

/**
 * Seed : migration de l'unique donnée réelle qui utilisait l'ancien mécanisme
 * Meeting virtuel (`TR-012`, `meetingId: 'MTG-FY-T001-2026-20260714'`) vers
 * une vraie `FiscalSession` persistée — FS-001, 2026-07-14, exercice
 * FY-T001-2026. Voir `mocks/finance/transactions.ts` (`TR-012.sessionId`).
 */
export const fiscalSessions: FiscalSession[] = [
  { id: 'FS-001', tenantId: 'T-001', fiscalYearId: 'FY-T001-2026', sessionNumber: 1, date: '2026-07-14', createdAt: '2026-08-01' },
];
