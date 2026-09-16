import type { Transaction } from '@/mocks/finance/transactions';

/**
 * Date comptable canonique d'une transaction pour TOUT calcul « à l'instant T »
 * (solde, flux). Décision blueprint §G-1 : c'est `transaction.date` (jour ISO
 * `YYYY-MM-DD`), jamais `meetingDate` (date de réunion — donnée métier, pas
 * comptable). `recordedAt`, quand il est présent, partage exactement ce jour :
 * `financeService.createTransaction` pose `date = recordedAt.slice(0,10)`.
 *
 * Centralisé ici pour qu'un éventuel changement de convention reste un
 * one-liner, sans toucher aux moteurs de solde/flux.
 */
export function referenceDate(tx: Pick<Transaction, 'date'>): string {
  return tx.date;
}
