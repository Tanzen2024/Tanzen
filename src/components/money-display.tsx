import { useLocale } from '@/contexts/locale-context';

export function MoneyDisplay({ amount, currency = 'FCFA', compact = false }: { amount: number; currency?: string; compact?: boolean }) {
  const { locale } = useLocale();
  const localeStr = locale === 'en' ? 'en-US' : 'fr-FR';
  return <span>{new Intl.NumberFormat(localeStr, compact ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }).format(amount)} {currency}</span>;
}
