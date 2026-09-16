/**
 * ADHÉSION D'UN MEMBRE À UNE CAISSE — entité datée (mandat « moteur de position
 * financière », phase 1). Comble le GAP architectural : `Account.memberIds` était
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
 * `Account.memberIds` est CONSERVÉ comme cache dénormalisé (adhésions actives du
 * jour), projeté à la lecture par `financeService` — jamais supprimé brutalement.
 */
import type { AccountRecord } from './accounts';

export type AccountMembershipStatus = 'active' | 'ended';

export type AccountMembership = {
  id: string;
  /** Isolation stricte — jamais traversée, comme partout ailleurs dans le modèle. */
  tenantId: string;
  /** → `Account.id`. */
  accountId: string;
  /** → `Member.id` (même tenant, vérifié à l'écriture par le service). */
  memberId: string;
  /** Adhésion effective — ISO `YYYY-MM-DD`, comparable lexicographiquement. */
  startDate: string;
  /** Résiliation — `null` = adhésion en cours. Un retrait CLÔT l'adhésion (jamais de suppression). */
  endDate: string | null;
  /** Dérivable de `endDate` vs aujourd'hui ; matérialisé pour la lisibilité et les filtres. */
  status: AccountMembershipStatus;
};

/**
 * Seed — tenant T-001 (Coopérative Sutura), membres réellement seedés
 * (M-001 Fatou Ndiaye, M-006 Cheikh Diop) et caisses réelles (`accounts.ts`).
 *
 *   Fatou (M-001) — « cas Jean Dupont » : adhérente de 3 caisses, dont une SANS
 *   transaction (Secours / AC-011) qui doit tout de même apparaître à 0 FCFA
 *   dans MEMBER_ALL_ACCOUNTS. NON adhérente des autres caisses du tenant.
 *
 *   Cheikh (M-006) — cas « voyage dans le temps » : adhésion Épargne clôturée au
 *   30/06/2026. Au 15/05 il est membre de {Trésorerie, Épargne} ; au 15/08,
 *   membre de {Trésorerie} uniquement.
 *
 * T-002 : une adhésion pour prouver l'isolation multi-tenant.
 */
export const accountMemberships: AccountMembership[] = [
  { id: 'AM-001', tenantId: 'T-001', accountId: 'AC-001', memberId: 'M-001', startDate: '2026-01-01', endDate: null, status: 'active' },
  { id: 'AM-002', tenantId: 'T-001', accountId: 'AC-002', memberId: 'M-001', startDate: '2026-01-01', endDate: null, status: 'active' },
  { id: 'AM-003', tenantId: 'T-001', accountId: 'AC-011', memberId: 'M-001', startDate: '2026-08-01', endDate: null, status: 'active' },
  { id: 'AM-004', tenantId: 'T-001', accountId: 'AC-001', memberId: 'M-006', startDate: '2026-01-01', endDate: null, status: 'active' },
  { id: 'AM-005', tenantId: 'T-001', accountId: 'AC-002', memberId: 'M-006', startDate: '2026-01-01', endDate: '2026-06-30', status: 'ended' },
  { id: 'AM-006', tenantId: 'T-002', accountId: 'AC-004', memberId: 'M-002', startDate: '2026-01-01', endDate: null, status: 'active' },
];

/**
 * Adhésions actives d'un membre à une date donnée : commencées au plus tard à
 * `asOfDate` et non encore clôturées à cette date (`endDate` nul ou postérieur).
 * Reçoit un tableau DÉJÀ filtré par tenant (le service s'en charge) — pur, sans
 * accès aux singletons, donc trivial à tester en isolation.
 */
export function membershipsAsOf(
  memberships: AccountMembership[],
  memberId: string,
  asOfDate: string,
): AccountMembership[] {
  return memberships.filter(
    (m) =>
      m.memberId === memberId &&
      m.startDate <= asOfDate &&
      (m.endDate === null || asOfDate <= m.endDate),
  );
}

/** IDs de caisses dont le membre est adhérent à `asOfDate` — dédoublonnés. */
export function accountIdsOfMemberAsOf(
  memberships: AccountMembership[],
  memberId: string,
  asOfDate: string,
): string[] {
  return [...new Set(membershipsAsOf(memberships, memberId, asOfDate).map((m) => m.accountId))];
}

/**
 * Caisses (objets) dont le membre est adhérent à `asOfDate`. `accounts` est le
 * tableau tenant-scopé fourni par l'appelant ; l'ordre d'origine est préservé.
 */
export function accountsOfMemberAsOf<T extends Pick<AccountRecord, 'id'>>(
  memberships: AccountMembership[],
  accounts: T[],
  memberId: string,
  asOfDate: string,
): T[] {
  const ids = new Set(accountIdsOfMemberAsOf(memberships, memberId, asOfDate));
  return accounts.filter((account) => ids.has(account.id));
}

/** `true` si le membre est adhérent de cette caisse précise à `asOfDate`. */
export function isMemberOfAccountAsOf(
  memberships: AccountMembership[],
  memberId: string,
  accountId: string,
  asOfDate: string,
): boolean {
  return membershipsAsOf(memberships, memberId, asOfDate).some((m) => m.accountId === accountId);
}

/**
 * Adhésions d'un membre qui CHEVAUCHENT au moins un jour de la fenêtre inclusive
 * `[from, to]` : commencées au plus tard le `to`, non clôturées avant le `from`.
 * Sert au calcul des flux sur période — une caisse quittée en cours de période y
 * figure quand même (ses mouvements de la période, tant que l'adhésion était
 * active le jour de chaque transaction, restent comptés — cf. `flows`).
 */
export function membershipsOverlapping(
  memberships: AccountMembership[],
  memberId: string,
  from: string,
  to: string,
): AccountMembership[] {
  return memberships.filter(
    (m) => m.memberId === memberId && m.startDate <= to && (m.endDate === null || from <= m.endDate),
  );
}

/** Caisses (objets) dont le membre a été adhérent à un moment de `[from, to]`. */
export function accountsOfMemberDuring<T extends Pick<AccountRecord, 'id'>>(
  memberships: AccountMembership[],
  accounts: T[],
  memberId: string,
  from: string,
  to: string,
): T[] {
  const ids = new Set(membershipsOverlapping(memberships, memberId, from, to).map((m) => m.accountId));
  return accounts.filter((account) => ids.has(account.id));
}
