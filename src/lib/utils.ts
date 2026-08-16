import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFCFA(amount: number, locale: 'fr' | 'en' = 'fr', compact = false): string {
  const localeStr = locale === 'en' ? 'en-US' : 'fr-FR';
  const formatted = new Intl.NumberFormat(localeStr, compact ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }).format(amount);
  return `${formatted} FCFA`;
}

export function formatNumber(value: number, locale: 'fr' | 'en' = 'fr'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR').format(value);
}

export function formatDate(date: string | Date, locale: 'fr' | 'en' = 'fr'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'medium' }).format(new Date(date));
}

export function daysUntil(date: string | Date): number {
  const diff = new Date(date).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
