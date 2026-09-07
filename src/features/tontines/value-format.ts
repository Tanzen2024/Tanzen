import { formatNumber } from '@/lib/utils';
import { formatUnit } from '@/constants/units';
import type { ValueType } from '@/mocks/tontines/tontine-occurrences';

/** Devise affichée telle que stockée (code ISO, ex. « XAF ») plutôt que le suffixe « FCFA » figé de `formatFCFA` — nécessaire dès qu'une Tontine/Contribution peut porter une devise autre que le franc CFA. `currencyCode` absent (données historiques sans devise) retombe sur « FCFA » pour ne rien casser d'existant. */
export function formatMoney(amount: number, currencyCode?: string): string {
  return `${formatNumber(amount)} ${currencyCode ?? 'FCFA'}`;
}

/**
 * Affichage MONEY/GOODS commun, partagé entre les écrans
 * Occurrence/Beneficiary, Adhesion et Contribution.
 * `currencyOrUnit` porte la devise (MONEY) ou le code d'unité (GOODS) — les
 * deux ne coexistant jamais pour une même valeur, un seul paramètre positionnel
 * suffit. Sans unité connue (ex. OccurrenceBeneficiary, qui n'en porte pas),
 * le comportement historique (quantité « · » nature) est conservé.
 */
export function formatValue(valueType: ValueType, amount?: number, quantity?: number, item?: string, currencyOrUnit?: string): string {
  if (valueType === 'MONEY') return formatMoney(amount ?? 0, currencyOrUnit);
  const qty = quantity ?? 0;
  const unitLabel = currencyOrUnit ? formatUnit(qty, currencyOrUnit) : '';
  return unitLabel ? `${formatNumber(qty)} ${unitLabel}` : `${formatNumber(qty)}${item ? ` · ${item}` : ''}`;
}
