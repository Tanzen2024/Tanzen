import type { CashboxRecord } from '@/mocks/finance/cashboxes';
import type { FiscalYear } from '@/mocks/settings/fiscal-years';
import { finalClosingEntry } from '@/mocks/finance/closing-entries';
import { balanceAsOf, resolveBaseline } from './balance';
import type { CloseFiscalYearOutcome, FinanceCtx, RecomputeClosingOutcome } from './types';

/**
 * Montant de clôture d'UNE caisse pour un exercice — RÉUTILISE `balanceAsOf`
 * tel quel (aucune nouvelle formule de solde, mandat §12) : `date` =
 * `fiscalYear.endDate`, transactions `completed` uniquement, baseline
 * résolue par `resolveBaseline` (legacy `openingBalance` ou `OpeningEntry`
 * selon ce qui existe pour cette caisse à cette date — voir `balance.ts`).
 *
 * `openingEntryId` (traçabilité de `ClosingEntry.computedFrom`) est résolu
 * séparément de l'appel à `balanceAsOf` : léger doublon de calcul assumé
 * (fonctions pures, bon marché, appelées une fois par caisse par clôture —
 * jamais un chemin chaud) plutôt que de faire fuiter un détail interne de
 * `balanceAsOf` dans sa signature publique.
 */
function computeClosingAmount(
  ctx: FinanceCtx,
  cashbox: CashboxRecord,
  fiscalYear: FiscalYear,
): { amount: number; openingEntryId?: string } {
  const result = balanceAsOf({ kind: 'CASHBOX', cashboxId: cashbox.id }, ctx, fiscalYear.endDate);
  const base = resolveBaseline(cashbox, ctx, fiscalYear.endDate);
  return { amount: result.byCashbox[0]?.balance ?? 0, openingEntryId: base.openingEntryId };
}

/**
 * CLÔTURE D'UN EXERCICE — calcule (sans écrire nulle part, fonction pure) le
 * `ClosingEntry` de CHAQUE caisse du tenant de `fiscalYear`. La persistance
 * (assignation d'id, `createdAt`, `closingEntries.push`, audit) est la
 * responsabilité du service (`finance-position.service.ts`), jamais de ce
 * module — même séparation que `balanceAsOf`/`flows`.
 *
 * Refuse (ne calcule rien) si :
 *   - l'exercice est déjà clôturé (`FISCAL_YEAR_NOT_OPEN`) — un exercice déjà
 *     clôturé ne peut pas être reclôturé par ce chemin (« pas encore commencé » est
 *     refusé en amont par `settingsService.closeFiscalYear`) ;
 *     un recalcul explicite passe par `recomputeClosingEntry`, jamais ici.
 *   - au moins une caisse du tenant a déjà un `ClosingEntry FINAL` pour cet
 *     exercice (`ALREADY_CLOSED`, avec la liste des caisses concernées) —
 *     idempotence par refus, jamais d'écrasement silencieux.
 *
 * Toutes les caisses du tenant sont incluses, actives ou inactives — aucun
 * filtre par `status` (une caisse inactive garde un solde réel à clôturer).
 */
export function computeFiscalYearClosing(ctx: FinanceCtx, fiscalYear: FiscalYear): CloseFiscalYearOutcome {
  if (fiscalYear.isClosed) {
    return { ok: false, reason: 'FISCAL_YEAR_NOT_OPEN' };
  }

  const tenantCashboxes = ctx.cashboxes.filter((cashbox) => cashbox.tenantId === fiscalYear.tenantId);
  const closingEntries = ctx.closingEntries ?? [];
  const alreadyClosedCashboxIds = tenantCashboxes
    .filter((cashbox) => finalClosingEntry(closingEntries, cashbox.id, fiscalYear.id))
    .map((cashbox) => cashbox.id);
  if (alreadyClosedCashboxIds.length > 0) {
    return { ok: false, reason: 'ALREADY_CLOSED', cashboxIds: alreadyClosedCashboxIds };
  }

  const computations = tenantCashboxes.map((cashbox) => {
    const { amount, openingEntryId } = computeClosingAmount(ctx, cashbox, fiscalYear);
    return { cashboxId: cashbox.id, amount, openingEntryId };
  });
  return { ok: true, computations };
}

/**
 * RECALCUL EXPLICITE d'un `ClosingEntry` déjà existant (correction après
 * réouverture d'exercice, ou erreur de saisie corrigée) — jamais un effet de
 * bord implicite de `computeFiscalYearClosing`. Ne vérifie PAS `fiscalYear.status`
 * (un recalcul est légitime aussi bien exercice rouvert que déjà reclôturé,
 * c'est au service d'en décider la politique) ; le service reste responsable
 * de marquer l'ancien `ClosingEntry` `SUPERSEDED` et de journaliser l'écart.
 */
export function recomputeClosingEntry(
  ctx: FinanceCtx,
  fiscalYear: FiscalYear,
  cashboxId: string,
): RecomputeClosingOutcome {
  const cashbox = ctx.cashboxes.find((item) => item.id === cashboxId);
  if (!cashbox) return { ok: false, reason: 'CASHBOX_NOT_FOUND' };
  if (cashbox.tenantId !== fiscalYear.tenantId) return { ok: false, reason: 'FISCAL_YEAR_TENANT_MISMATCH' };

  const { amount, openingEntryId } = computeClosingAmount(ctx, cashbox, fiscalYear);
  return { ok: true, amount, openingEntryId };
}
