import { formatFCFA, formatNumber } from '@/lib/utils';
import type { ValueType } from '@/mocks/tontines/tontine-occurrences';

/** Affichage MONEY/GOODS commun, partagé entre les écrans Occurrence/Turn/Beneficiary et Adhesion. */
export function formatValue(valueType: ValueType, amount?: number, quantity?: number, item?: string): string {
  if (valueType === 'MONEY') return formatFCFA(amount ?? 0);
  return `${formatNumber(quantity ?? 0)}${item ? ` · ${item}` : ''}`;
}
