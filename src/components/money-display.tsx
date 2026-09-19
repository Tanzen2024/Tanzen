import { useLocale } from '@/contexts/locale-context';
import { useOrganizationCurrency } from '@/hooks/use-organization-currency';
import { formatCurrency } from '@/constants/currencies';

/**
 * Affichage central d'un montant monétaire. `currency` est le code ISO
 * (ex. `XOF`) — jamais un libellé d'affichage — et reste optionnel : quand
 * l'appelant ne le connaît pas déjà (la plupart des tableaux/KPI), il est
 * résolu depuis la devise de l'organisation du tenant courant
 * (`useOrganizationCurrency`), jamais hardcodé.
 */
export function MoneyDisplay({ amount, currency, compact = false }: { amount: number; currency?: string; compact?: boolean }) {
  const { locale } = useLocale();
  const organizationCurrency = useOrganizationCurrency();
  return <span>{formatCurrency(amount, currency ?? organizationCurrency, locale, { compact })}</span>;
}
