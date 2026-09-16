/**
 * SOLDE DE CLÔTURE D'UNE CAISSE POUR UN EXERCICE FISCAL (mandat « moteur de
 * position financière », étape 6). `amount` est TOUJOURS calculé par
 * `computeFiscalYearClosing()` (`@/lib/finance/closing.ts`) — jamais saisi
 * manuellement — en réutilisant `balanceAsOf()` tel quel (aucune nouvelle
 * formule de solde) : `date` = `fiscalYear.endDate`, transactions `completed`
 * uniquement, borné par la baseline utilisée (legacy `openingBalance` ou
 * `OpeningEntry`, cf. `balance.ts`).
 *
 * Immuable comme `OpeningEntry` : une correction (`recomputeClosingEntry`)
 * crée une NOUVELLE ligne `FINAL` et marque l'ancienne `SUPERSEDED` — jamais
 * d'édition en place. Invariant : au plus une ligne `FINAL` par
 * `(tenantId, accountId, fiscalYearId)` à tout instant.
 */
export type ClosingEntryStatus = 'FINAL' | 'SUPERSEDED';

export type ClosingEntry = {
  id: string;
  tenantId: string;
  accountId: string;
  fiscalYearId: string;
  /** ISO `YYYY-MM-DD` — toujours `fiscalYear.endDate`, jamais une saisie libre. */
  date: string;
  amount: number;
  /** `openingEntryId` absent = la clôture a utilisé la baseline legacy (`Account.openingBalance`), pas une `OpeningEntry`. */
  computedFrom: { openingEntryId?: string };
  status: ClosingEntryStatus;
  createdAt: string;
};

/** Aucune caisse seedée n'a encore été clôturée via ce mécanisme. */
export const closingEntries: ClosingEntry[] = [];

/** `ClosingEntry FINAL` d'une caisse pour un exercice fiscal précis. `undefined` = pas (encore) clôturée. */
export function finalClosingEntry(
  entries: ClosingEntry[],
  accountId: string,
  fiscalYearId: string,
): ClosingEntry | undefined {
  return entries.find(
    (entry) => entry.accountId === accountId && entry.fiscalYearId === fiscalYearId && entry.status === 'FINAL',
  );
}
