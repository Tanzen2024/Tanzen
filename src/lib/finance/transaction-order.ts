import type { Transaction } from '@/mocks/finance/transactions';

/**
 * Horodatage RÉEL d'une transaction, en millisecondes : `recordedAt` (date/heure
 * d'audit, ISO avec ou sans fuseau) sinon le jour `date` (`YYYY-MM-DD`) pris à
 * minuit LOCAL — même base que `recordedAt` sans fuseau du seed, pour ne pas
 * décaler d'un fuseau les lignes qui n'ont qu'un jour. Jamais le texte affiché.
 */
export function transactionTimestamp(tx: Pick<Transaction, 'date' | 'recordedAt'>): number {
  const parsed = Date.parse(tx.recordedAt ?? `${tx.date}T00:00:00`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Ordre du journal : la plus RÉCENTE en premier. Égalité de date/heure →
 * identifiant décroissant, comparé numériquement (`TR-010` > `TR-009`) : les
 * identifiants sont séquentiels à la création (`insertTransaction`), donc la
 * dernière créée passe devant. Ordre total et déterministe.
 */
export function compareTransactionsNewestFirst(a: Pick<Transaction, 'id' | 'date' | 'recordedAt'>, b: Pick<Transaction, 'id' | 'date' | 'recordedAt'>): number {
  return transactionTimestamp(b) - transactionTimestamp(a) || b.id.localeCompare(a.id, undefined, { numeric: true });
}

/** Copie triée (plus récente → plus ancienne) — ne modifie jamais le tableau source. */
export function sortTransactionsNewestFirst<T extends Pick<Transaction, 'id' | 'date' | 'recordedAt'>>(rows: readonly T[]): T[] {
  return [...rows].sort(compareTransactionsNewestFirst);
}
