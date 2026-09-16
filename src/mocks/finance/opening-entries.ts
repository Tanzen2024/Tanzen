/**
 * REPORT D'OUVERTURE D'UNE CAISSE POUR UN EXERCICE FISCAL (mandat « moteur de
 * position financière », étape 6 — Opening/Closing/Carry-forward). Ne
 * remplace PAS `Account.openingBalance` : tant qu'aucune `OpeningEntry` n'existe
 * pour une caisse, `baseline()` (`@/lib/finance/balance.ts`) continue d'utiliser
 * `Account.openingBalance` sans condition de date, exactement comme avant cette
 * entité (comportement legacy inchangé — voir son commentaire).
 *
 * Une caisse « bascule » silencieusement vers ce mécanisme dès qu'une première
 * `OpeningEntry` lui est associée (par existence, jamais par un flag de
 * migration) — typiquement via le premier `carryForward()` qui suit son
 * premier `closeFiscalYear()` (`@/lib/finance/closing.ts` /
 * `@/lib/finance/carry-forward.ts`).
 *
 * `origin: 'INITIAL'` = un point de départ affirmé manuellement (aucune preuve
 * de calcul en amont — même niveau de risque que `recordAccountMovement`,
 * seul point d'ajustement manuel de `openingBalance`). `origin: 'CARRY_FORWARD'`
 * = généré automatiquement, `amount` toujours COPIÉ tel quel depuis le
 * `ClosingEntry` source (`sourceClosingEntryId`) — jamais recalculé, pour
 * garantir `closing(N) === opening(N+1)` par construction plutôt que par
 * vérification a posteriori.
 *
 * Immuable comme `AccountMembership` (« jamais de suppression ») : une
 * correction crée une NOUVELLE `OpeningEntry` et marque l'ancienne
 * `SUPERSEDED` (cf. scénario de correction en cascade après réouverture
 * d'exercice, `verifyCarryForwardIntegrity`) — jamais d'édition en place.
 */
export type OpeningEntryOrigin = 'INITIAL' | 'CARRY_FORWARD';
export type OpeningEntryStatus = 'FINAL' | 'SUPERSEDED';

export type OpeningEntry = {
  id: string;
  /** Isolation stricte — jamais traversée, comme partout ailleurs dans le modèle. */
  tenantId: string;
  /** → `Account.id` (pas `accountNumber`), comme `AccountMembership`. */
  accountId: string;
  /** → `FiscalYear.id` (`@/mocks/settings/fiscal-years`). */
  fiscalYearId: string;
  /** ISO `YYYY-MM-DD` — situation AVANT tout mouvement de l'exercice (= `fiscalYear.startDate`). */
  date: string;
  amount: number;
  origin: OpeningEntryOrigin;
  /** Requis si `origin === 'CARRY_FORWARD'`, absent sinon. */
  sourceClosingEntryId?: string;
  status: OpeningEntryStatus;
  createdAt: string;
};

/** Aucune caisse seedée n'a d'`OpeningEntry` — comportement legacy inchangé pour les 14 comptes existants (voir en-tête). */
export const openingEntries: OpeningEntry[] = [];

/**
 * `OpeningEntry FINAL` la plus récente d'une caisse avec `date <= asOfDate` —
 * pure, reçoit un tableau déjà filtré par tenant. `undefined` = aucune
 * `OpeningEntry` applicable, donc fallback legacy côté appelant
 * (`baseline()`).
 */
export function latestFinalOpeningEntryAsOf(
  entries: OpeningEntry[],
  accountId: string,
  asOfDate: string,
): OpeningEntry | undefined {
  return entries
    .filter((entry) => entry.accountId === accountId && entry.status === 'FINAL' && entry.date <= asOfDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** `OpeningEntry FINAL` d'une caisse pour un exercice fiscal précis (pas de recherche « à une date »). */
export function finalOpeningEntryForFiscalYear(
  entries: OpeningEntry[],
  accountId: string,
  fiscalYearId: string,
): OpeningEntry | undefined {
  return entries.find(
    (entry) => entry.accountId === accountId && entry.fiscalYearId === fiscalYearId && entry.status === 'FINAL',
  );
}
