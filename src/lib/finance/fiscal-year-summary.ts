import { cashboxEntryEffect, cashboxLedgerEntries, type CashboxRecord } from '@/mocks/finance/cashboxes';
import type { FiscalYear } from '@/mocks/settings/fiscal-years';
import { balanceAsOf } from './balance';
import { flows } from './flows';
import type { FinanceCtx } from './types';

/**
 * Situation d'UNE caisse dans le contexte d'UN exercice fiscal (mandat
 * « Caisse + exercice fiscal contexte global ») — jamais de données d'un
 * autre exercice :
 *   - `openingBalance` = solde de la caisse la veille du début de l'exercice ;
 *   - `inflows` / `outflows` = entrées / sorties comptabilisées DANS l'exercice
 *     (perspective caisse, `flows`) ;
 *   - `balance` = solde de la caisse à la date de fin de l'exercice
 *     (`balanceAsOf`) — égal à `openingBalance + inflows − outflows` ;
 *   - `lastMovement` = date du dernier mouvement comptabilisé DANS l'exercice,
 *     `null` s'il n'y en a aucun.
 */
export type CashboxFiscalYearLine = {
  cashboxId: string;
  openingBalance: number;
  inflows: number;
  outflows: number;
  balance: number;
  movementCount: number;
  lastMovement: string | null;
};

/** `YYYY-MM-DD` − 1 jour, sans dérive de fuseau. */
function previousDay(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Une caisse fait partie de l'exercice si elle a été ouverte au plus tard à sa date de fin. */
export function isCashboxInFiscalYear(cashbox: Pick<CashboxRecord, 'openedOn'>, fiscalYear: Pick<FiscalYear, 'endDate'>): boolean {
  return cashbox.openedOn <= fiscalYear.endDate;
}

/**
 * Situation de chaque caisse du tenant (`ctx` déjà filtré par tenant) sur
 * l'exercice `fiscalYear`. Fonction PURE — réutilise exclusivement le moteur
 * existant (`balanceAsOf`, `flows`), aucune règle de solde dupliquée.
 */
/**
 * Situation de chaque caisse pour UNE SÉANCE de l'exercice (mandat « Évolution
 * globale du module Finance » §7/§14) — construite EXCLUSIVEMENT sur
 * `cashboxesFiscalYearSummary` (ouverture d'exercice du moteur) et
 * `cashboxEntryEffect` (même effet signé que le solde), sur les mêmes
 * transactions comptabilisées de l'exercice :
 *   - `openingBalance` = ouverture d'exercice + effets des transactions
 *     rattachées aux séances ANTÉRIEURES (numéro plus petit) ;
 *   - `inflows` / `outflows` = entrées / sorties des transactions rattachées à
 *     CETTE séance (`Transaction.sessionId`) ;
 *   - `balance` = `openingBalance + inflows − outflows`.
 * Les transactions sans séance n'entrent que dans la vue « Toutes les séances »
 * (`cashboxesFiscalYearSummary`), jamais attribuées à une séance au hasard.
 * `sessionNumberById` : séances de l'exercice (id → numéro).
 */
export function cashboxesSessionSummary(ctx: FinanceCtx, fiscalYear: FiscalYear, sessionNumberById: Map<string, number>, sessionId: string): CashboxFiscalYearLine[] {
  const selectedNumber = sessionNumberById.get(sessionId);
  const yearLines = cashboxesFiscalYearSummary(ctx, fiscalYear);
  if (selectedNumber === undefined) return yearLines.map((line) => ({ ...line, inflows: 0, outflows: 0, balance: line.openingBalance, movementCount: 0, lastMovement: null }));
  const yearFlows = flows({ kind: 'TENANT_ALL_CASHBOXES' }, ctx, fiscalYear.startDate, fiscalYear.endDate);
  const yearTransactions = ctx.transactions.filter((tx) => yearFlows.transactionIds.includes(tx.id));
  return yearLines.map((line) => {
    const cashbox = ctx.cashboxes.find((item) => item.id === line.cashboxId)!;
    const entries = cashboxLedgerEntries(cashbox, yearTransactions);
    let before = 0; let inflows = 0; let outflows = 0; let movementCount = 0; let lastMovement: string | null = null;
    for (const tx of entries) {
      const number = tx.sessionId ? sessionNumberById.get(tx.sessionId) : undefined;
      if (number === undefined) continue;
      const effect = cashboxEntryEffect(cashbox.cashboxNumber, tx);
      if (number < selectedNumber) { before += effect; continue; }
      if (number !== selectedNumber) continue;
      if (effect >= 0) inflows += effect; else outflows += -effect;
      movementCount += 1;
      const at = (tx.recordedAt ?? tx.date).slice(0, 10);
      if (lastMovement === null || at > lastMovement) lastMovement = at;
    }
    const openingBalance = line.openingBalance + before;
    return { cashboxId: line.cashboxId, openingBalance, inflows, outflows, balance: openingBalance + inflows - outflows, movementCount, lastMovement };
  });
}

export function cashboxesFiscalYearSummary(ctx: FinanceCtx, fiscalYear: FiscalYear): CashboxFiscalYearLine[] {
  const eveOfStart = previousDay(fiscalYear.startDate);
  const inYear = ctx.cashboxes.filter((cashbox) => cashbox.tenantId === fiscalYear.tenantId && isCashboxInFiscalYear(cashbox, fiscalYear));
  const yearFlows = flows({ kind: 'TENANT_ALL_CASHBOXES' }, ctx, fiscalYear.startDate, fiscalYear.endDate);
  const yearTransactions = ctx.transactions.filter((tx) => yearFlows.transactionIds.includes(tx.id));

  return inYear.map((cashbox) => {
    const opening = balanceAsOf({ kind: 'CASHBOX', cashboxId: cashbox.id }, ctx, eveOfStart).byCashbox[0]?.balance ?? 0;
    const closing = balanceAsOf({ kind: 'CASHBOX', cashboxId: cashbox.id }, ctx, fiscalYear.endDate).byCashbox[0]?.balance ?? 0;
    const flowLine = yearFlows.byCashbox.find((line) => line.cashboxId === cashbox.id);
    const entries = cashboxLedgerEntries(cashbox, yearTransactions);
    const lastMovement = entries.reduce<string | null>((latest, tx) => {
      // Même convention que `resolveCashbox` : date de saisie (`recordedAt`), à défaut `date`.
      const at = (tx.recordedAt ?? tx.date).slice(0, 10);
      return latest === null || at > latest ? at : latest;
    }, null);
    return {
      cashboxId: cashbox.id,
      openingBalance: opening,
      inflows: flowLine?.credit ?? 0,
      outflows: flowLine?.debit ?? 0,
      balance: closing,
      movementCount: flowLine?.count ?? 0,
      lastMovement,
    };
  });
}
