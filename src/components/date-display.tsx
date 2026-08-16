import { useLocale } from '@/contexts/locale-context';

export function DateDisplay({ value, withTime = false }: { value: string | Date; withTime?: boolean }) {
  const { locale } = useLocale();
  const localeStr = locale === 'en' ? 'en-US' : 'fr-FR';
  const date = new Date(value); return <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat(localeStr, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date)}</time>;
}
