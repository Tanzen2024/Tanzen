import type { FiscalYear } from '@/mocks/settings/fiscal-years';
import { finalClosingEntry } from '@/mocks/finance/closing-entries';
import type { CarryForwardOutcome, FinanceCtx, IntegrityMismatch } from './types';

/** Jour calendaire suivant, en arithmétique UTC pure (évite tout piège de fuseau horaire). */
function nextCalendarDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * REPORT À NOUVEAU — calcule (fonction pure, n'écrit rien) l'`OpeningEntry` à
 * créer pour CHAQUE caisse du tenant, exercice `fromFiscalYear` → exercice
 * `toFiscalYear`. `amount` est TOUJOURS copié tel quel depuis le
 * `ClosingEntry` source — jamais recalculé — pour garantir
 * `closing(N) === opening(N+1)` par construction.
 *
 * Toutes les caisses du tenant sont incluses (actives, inactives, créées en
 * cours d'exercice, sans transaction) — aucun filtre par `status` ni par
 * activité. Ne touche JAMAIS `AccountMembership` (write-set strictement
 * limité à `OpeningEntry` — une adhésion historique n'est jamais modifiée par
 * un report, mandat §6).
 *
 * Refuse (ne calcule rien) si :
 *   - les deux exercices n'appartiennent pas au même tenant (`TENANT_MISMATCH`) ;
 *   - `fromFiscalYear.status !== 'closed'` (`FROM_NOT_CLOSED`) ;
 *   - les exercices ne sont pas STRICTEMENT contigus, i.e.
 *     `toFiscalYear.startDate !== fromFiscalYear.endDate + 1 jour`
 *     (`NOT_CONTIGUOUS`) — `createFiscalYear` (`settings.service.ts`) n'impose
 *     aujourd'hui aucune règle de chevauchement/contiguïté ; c'est ici, au
 *     moment du report, que l'absence de trou/chevauchement est vérifiée,
 *     jamais supposée ;
 *   - au moins une caisse du tenant n'a pas de `ClosingEntry FINAL` pour
 *     `fromFiscalYear` (`MISSING_CLOSING_ENTRIES`, avec la liste) — un report
 *     ne peut jamais partir d'une clôture absente ;
 *   - au moins une caisse a déjà une `OpeningEntry FINAL` pour `toFiscalYear`
 *     (`ALREADY_CARRIED`, avec la liste) — idempotence par refus, comme
 *     `computeFiscalYearClosing`.
 */
export function computeCarryForward(
  ctx: FinanceCtx,
  fromFiscalYear: FiscalYear,
  toFiscalYear: FiscalYear,
): CarryForwardOutcome {
  if (fromFiscalYear.tenantId !== toFiscalYear.tenantId) {
    return { ok: false, reason: 'TENANT_MISMATCH' };
  }
  if (fromFiscalYear.status !== 'closed') {
    return { ok: false, reason: 'FROM_NOT_CLOSED' };
  }
  if (toFiscalYear.startDate !== nextCalendarDay(fromFiscalYear.endDate)) {
    return { ok: false, reason: 'NOT_CONTIGUOUS' };
  }

  const tenantAccounts = ctx.accounts.filter((account) => account.tenantId === fromFiscalYear.tenantId);
  const closingEntries = ctx.closingEntries ?? [];
  const openingEntries = ctx.openingEntries ?? [];

  const missingClosingAccountIds = tenantAccounts
    .filter((account) => !finalClosingEntry(closingEntries, account.id, fromFiscalYear.id))
    .map((account) => account.id);
  if (missingClosingAccountIds.length > 0) {
    return { ok: false, reason: 'MISSING_CLOSING_ENTRIES', accountIds: missingClosingAccountIds };
  }

  const alreadyCarriedAccountIds = tenantAccounts
    .filter((account) =>
      openingEntries.some(
        (entry) => entry.accountId === account.id && entry.fiscalYearId === toFiscalYear.id && entry.status === 'FINAL',
      ),
    )
    .map((account) => account.id);
  if (alreadyCarriedAccountIds.length > 0) {
    return { ok: false, reason: 'ALREADY_CARRIED', accountIds: alreadyCarriedAccountIds };
  }

  const computations = tenantAccounts.map((account) => {
    const closing = finalClosingEntry(closingEntries, account.id, fromFiscalYear.id)!;
    return { accountId: account.id, amount: closing.amount, date: toFiscalYear.startDate, sourceClosingEntryId: closing.id };
  });
  return { ok: true, computations };
}

/**
 * Détecte les couples (`ClosingEntry` de `fromFiscalYear`, `OpeningEntry` de
 * `toFiscalYear`) désynchronisés pour une même caisse — typiquement après une
 * réouverture de `fromFiscalYear`, correction, puis reclôture
 * (`recomputeClosingEntry`) SANS que le report n'ait été rejoué. Ne corrige
 * rien elle-même : signale seulement, pour que le service pilote la
 * remédiation (nouvelle `OpeningEntry` de `toFiscalYear`, `SUPERSEDED` sur
 * l'ancienne).
 */
export function verifyCarryForwardIntegrity(
  ctx: FinanceCtx,
  fromFiscalYear: FiscalYear,
  toFiscalYear: FiscalYear,
): IntegrityMismatch[] {
  const tenantAccounts = ctx.accounts.filter((account) => account.tenantId === fromFiscalYear.tenantId);
  const closingEntries = ctx.closingEntries ?? [];
  const openingEntries = ctx.openingEntries ?? [];

  const mismatches: IntegrityMismatch[] = [];
  for (const account of tenantAccounts) {
    const closing = finalClosingEntry(closingEntries, account.id, fromFiscalYear.id);
    const opening = openingEntries.find(
      (entry) => entry.accountId === account.id && entry.fiscalYearId === toFiscalYear.id && entry.status === 'FINAL',
    );
    if (closing && opening && closing.amount !== opening.amount) {
      mismatches.push({ accountId: account.id, closingAmount: closing.amount, openingAmount: opening.amount });
    }
  }
  return mismatches;
}
