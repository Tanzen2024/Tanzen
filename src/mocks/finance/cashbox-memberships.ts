/**
 * ADHÉSION D'UN MEMBRE À UNE CAISSE — entité datée (mandat « moteur de position
 * financière », phase 1). Comble le GAP architectural : `Cashbox.memberIds` était
 * un simple ensemble d'IDs, sans date ni historique, et vide dans 100 % du seed.
 *
 * Règle métier : pour un adhérent, « Toutes les caisses » = les caisses dont il
 * est adhérent À LA DATE CONSIDÉRÉE — jamais toutes les caisses du tenant, jamais
 * déduit des transactions trouvées. Une caisse adhérée sans transaction fait
 * partie du périmètre (position = 0). Une transaction historique seule n'établit
 * pas une adhésion.
 *
 * Forme calquée sur `Position { role, startDate, endDate }` (gouvernance) — le
 * seul patron de relation datée déjà présent dans le modèle.
 *
 * `Cashbox.memberIds` est CONSERVÉ comme cache dénormalisé (adhésions actives du
 * jour), projeté à la lecture par `financeService` — jamais supprimé brutalement.
 */
import type { CashboxRecord } from './cashboxes';

export type CashboxMembershipStatus = 'active' | 'ended';

export type CashboxMembership = {
  id: string;
  /** Isolation stricte — jamais traversée, comme partout ailleurs dans le modèle. */
  tenantId: string;
  /** → `Cashbox.id`. */
  cashboxId: string;
  /** → `Member.id` (même tenant, vérifié à l'écriture par le service). */
  memberId: string;
  /** Adhésion effective — ISO `YYYY-MM-DD`, comparable lexicographiquement. */
  startDate: string;
  /** Résiliation — `null` = adhésion en cours. Un retrait CLÔT l'adhésion (jamais de suppression). */
  endDate: string | null;
  /** Dérivable de `endDate` vs aujourd'hui ; matérialisé pour la lisibilité et les filtres. */
  status: CashboxMembershipStatus;
};

/**
 * Seed — tenant T-001 (Coopérative Sutura), membres réellement seedés
 * (M-001 Fatou Ndiaye, M-006 Cheikh Diop) et caisses réelles (`cashboxes.ts`).
 *
 *   Fatou (M-001) — « cas Jean Dupont » : adhérente de 3 caisses, dont une SANS
 *   transaction (Secours / AC-011) qui doit tout de même apparaître à 0 FCFA
 *   dans MEMBER_ALL_ACCOUNTS. NON adhérente des autres caisses du tenant.
 *
 *   Cheikh (M-006) — cas « voyage dans le temps » : adhésion Épargne clôturée au
 *   31/08/2026. Au 15/08 il est membre de {Transport, Épargne} ; au 15/09,
 *   membre de {Transport} uniquement.
 *
 * T-002 : une adhésion pour prouver l'isolation multi-tenant.
 */
export const cashboxMemberships: CashboxMembership[] = [
  { id: 'AM-001', tenantId: 'T-001', cashboxId: 'AC-009', memberId: 'M-001', startDate: '2026-08-01', endDate: null, status: 'active' },
  { id: 'AM-002', tenantId: 'T-001', cashboxId: 'AC-012', memberId: 'M-001', startDate: '2026-08-01', endDate: null, status: 'active' },
  { id: 'AM-003', tenantId: 'T-001', cashboxId: 'AC-011', memberId: 'M-001', startDate: '2026-08-01', endDate: null, status: 'active' },
  { id: 'AM-004', tenantId: 'T-001', cashboxId: 'AC-012', memberId: 'M-006', startDate: '2026-08-01', endDate: null, status: 'active' },
  { id: 'AM-005', tenantId: 'T-001', cashboxId: 'AC-009', memberId: 'M-006', startDate: '2026-08-01', endDate: '2026-08-31', status: 'ended' },
  { id: 'AM-006', tenantId: 'T-002', cashboxId: 'AC-004', memberId: 'M-002', startDate: '2026-01-01', endDate: null, status: 'active' },
];

/**
 * Adhésions actives d'un membre à une date donnée : commencées au plus tard à
 * `asOfDate` et non encore clôturées à cette date (`endDate` nul ou postérieur).
 * Reçoit un tableau DÉJÀ filtré par tenant (le service s'en charge) — pur, sans
 * accès aux singletons, donc trivial à tester en isolation.
 */
export function membershipsAsOf(
  memberships: CashboxMembership[],
  memberId: string,
  asOfDate: string,
): CashboxMembership[] {
  return memberships.filter(
    (m) =>
      m.memberId === memberId &&
      m.startDate <= asOfDate &&
      (m.endDate === null || asOfDate <= m.endDate),
  );
}

/** IDs de caisses dont le membre est adhérent à `asOfDate` — dédoublonnés. */
export function cashboxIdsOfMemberAsOf(
  memberships: CashboxMembership[],
  memberId: string,
  asOfDate: string,
): string[] {
  return [...new Set(membershipsAsOf(memberships, memberId, asOfDate).map((m) => m.cashboxId))];
}

/**
 * Caisses (objets) dont le membre est adhérent à `asOfDate`. `cashboxes` est le
 * tableau tenant-scopé fourni par l'appelant ; l'ordre d'origine est préservé.
 */
export function cashboxesOfMemberAsOf<T extends Pick<CashboxRecord, 'id'>>(
  memberships: CashboxMembership[],
  cashboxes: T[],
  memberId: string,
  asOfDate: string,
): T[] {
  const ids = new Set(cashboxIdsOfMemberAsOf(memberships, memberId, asOfDate));
  return cashboxes.filter((cashbox) => ids.has(cashbox.id));
}

/** `true` si le membre est adhérent de cette caisse précise à `asOfDate`. */
export function isMemberOfCashboxAsOf(
  memberships: CashboxMembership[],
  memberId: string,
  cashboxId: string,
  asOfDate: string,
): boolean {
  return membershipsAsOf(memberships, memberId, asOfDate).some((m) => m.cashboxId === cashboxId);
}

/**
 * Adhésions d'un membre qui CHEVAUCHENT au moins un jour de la fenêtre inclusive
 * `[from, to]` : commencées au plus tard le `to`, non clôturées avant le `from`.
 * Sert au calcul des flux sur période — une caisse quittée en cours de période y
 * figure quand même (ses mouvements de la période, tant que l'adhésion était
 * active le jour de chaque transaction, restent comptés — cf. `flows`).
 */
export function membershipsOverlapping(
  memberships: CashboxMembership[],
  memberId: string,
  from: string,
  to: string,
): CashboxMembership[] {
  return memberships.filter(
    (m) => m.memberId === memberId && m.startDate <= to && (m.endDate === null || from <= m.endDate),
  );
}

/** Caisses (objets) dont le membre a été adhérent à un moment de `[from, to]`. */
export function cashboxesOfMemberDuring<T extends Pick<CashboxRecord, 'id'>>(
  memberships: CashboxMembership[],
  cashboxes: T[],
  memberId: string,
  from: string,
  to: string,
): T[] {
  const ids = new Set(membershipsOverlapping(memberships, memberId, from, to).map((m) => m.cashboxId));
  return cashboxes.filter((cashbox) => ids.has(cashbox.id));
}
