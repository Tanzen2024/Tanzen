import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number, locale: 'fr' | 'en' = 'fr'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR').format(value);
}

/**
 * Formatter de date GLOBAL de l'application — TOUJOURS JJ/MM/AAAA (mandat
 * « normalisation de l'affichage des dates »), quelle que soit la locale
 * fr/en : Tanzen n'a qu'un seul format de date destiné à l'utilisateur, la
 * locale ne s'applique qu'aux nombres/devises (`formatNumber`/`formatCurrency`).
 *
 * Pour une chaîne commençant par `YYYY-MM-DD` (date métier sans heure, ex.
 * `occurrence.date`, exercices fiscaux, adhésions — même si un suffixe
 * `THH:mm:ss` traîne, cas des enregistrements historiques), le jour/mois/année
 * sont extraits directement de la chaîne, jamais via `new Date(...)`, pour ne
 * jamais introduire de décalage lié au fuseau horaire (`new
 * Date("2026-09-19")` est interprété en UTC minuit et peut restituer le 18
 * dans un fuseau négatif) — SAUF si `withTime` est demandé ET qu'un véritable
 * horodatage (`T...`) est présent : l'appelant veut alors l'heure réelle, qui
 * exige de résoudre l'instant complet.
 *
 * Pour un objet `Date` ou un horodatage complet avec `withTime`, les
 * composants jour/mois/année/heure sont lus en heure LOCALE — la valeur
 * représente déjà un instant réel non ambigu.
 *
 * `withTime` ajoute `HH:mm` (heure locale) sans jamais supprimer l'info déjà
 * présente. Retourne `—` pour `null`/`undefined`/chaîne vide/date invalide.
 */
export function formatDate(date: string | Date | null | undefined, withTime = false): string {
  if (date === null || date === undefined || date === '') return '—';
  if (typeof date === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (dateOnly && (!withTime || !date.includes('T'))) {
      const [, year, month, day] = dateOnly;
      const base = `${day}/${month}/${year}`;
      return withTime ? `${base} 00:00` : base;
    }
  }
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  const base = `${day}/${month}/${year}`;
  if (!withTime) return base;
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${base} ${hours}:${minutes}`;
}

/**
 * Alias historique pour les dates de Tour (Occurrence) — conservé pour la
 * compatibilité des appels existants (`TourDateDisplay`) ; délègue entièrement
 * à `formatDate`, qui applique désormais la même règle JJ/MM/AAAA partout.
 */
export function formatTourDate(date: string): string {
  return formatDate(date);
}

export function daysUntil(date: string | Date): number {
  const diff = new Date(date).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
