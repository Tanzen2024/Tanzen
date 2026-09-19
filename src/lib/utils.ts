import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number, locale: 'fr' | 'en' = 'fr'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR').format(value);
}

export function formatDate(date: string | Date, locale: 'fr' | 'en' = 'fr'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'medium' }).format(new Date(date));
}

/**
 * Format d'affichage JJ/MM/AAAA pour les dates de Tour (mandat « format
 * d'affichage des dates ») — toujours numérique, jamais dépendant de la
 * locale (contrairement à `formatDate`, utilisé ailleurs dans l'app), et
 * dérivé directement de la chaîne `YYYY-MM-DD` stockée plutôt que d'un objet
 * `Date` pour ne jamais introduire de décalage de fuseau horaire. Le format
 * de stockage (`occurrence.date`) reste inchangé.
 */
export function formatTourDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return date;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function daysUntil(date: string | Date): number {
  const diff = new Date(date).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
