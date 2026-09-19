import { useLocale } from '@/contexts/locale-context';
import { formatTourDate } from '@/lib/utils';

export function DateDisplay({ value, withTime = false }: { value: string | Date; withTime?: boolean }) {
  const { locale } = useLocale();
  const localeStr = locale === 'en' ? 'en-US' : 'fr-FR';
  const date = new Date(value); return <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat(localeStr, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date)}</time>;
}

/**
 * Dates de Tour (Occurrence) — toujours JJ/MM/AAAA, quelle que soit la
 * locale (mandat « format d'affichage des dates »). Distinct de
 * `DateDisplay` (locale-dépendant), qui reste utilisé pour les autres dates
 * de l'application (adhésions, reliquats, audit, etc.).
 */
export function TourDateDisplay({ value }: { value: string }) {
  return <time dateTime={value}>{formatTourDate(value)}</time>;
}
