/**
 * Primitives PURES de calcul de dates calendaires (jour du mois, n-ième jour
 * de semaine d'un mois, parcours de mois consécutifs) — sans dépendance React
 * ni service, sans aucune notion métier (ni Tontine, ni Réunion). Extrait de
 * `src/mocks/tontines/tontine-frequency.ts` (module Tontines, en cours de
 * reconstruction complète) car `src/mocks/settings/meeting-schedule.ts`
 * (récurrence des réunions d'exercice fiscal, domaine totalement distinct)
 * en dépendait déjà : aucun des deux domaines ne doit posséder l'autre, donc
 * ce module neutre est la seule source de vérité du calcul de date pur.
 *
 * Un jour/combinaison inexistant (31 en février, 5ᵉ lundi absent) est
 * simplement omis par les fonctions qui en dépendent — jamais de décalage
 * automatique.
 */

export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type Ordinal = 'FIRST' | 'SECOND' | 'THIRD' | 'FOURTH' | 'LAST';

export const WEEKDAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
export const ORDINALS: Ordinal[] = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'LAST'];

export const WEEKDAY_INDEX: Record<Weekday, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };
export const ORDINAL_NUMBER: Record<Ordinal, number | 'LAST'> = { FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, LAST: 'LAST' };

export const WEEKDAY_LABEL: Record<Weekday, { fr: string; en: string }> = {
  MONDAY: { fr: 'lundi', en: 'Monday' }, TUESDAY: { fr: 'mardi', en: 'Tuesday' }, WEDNESDAY: { fr: 'mercredi', en: 'Wednesday' },
  THURSDAY: { fr: 'jeudi', en: 'Thursday' }, FRIDAY: { fr: 'vendredi', en: 'Friday' }, SATURDAY: { fr: 'samedi', en: 'Saturday' }, SUNDAY: { fr: 'dimanche', en: 'Sunday' },
};
export const ORDINAL_LABEL: Record<Ordinal, { fr: string; en: string }> = {
  FIRST: { fr: 'premier', en: 'first' }, SECOND: { fr: 'deuxième', en: 'second' }, THIRD: { fr: 'troisième', en: 'third' }, FOURTH: { fr: 'quatrième', en: 'fourth' }, LAST: { fr: 'dernier', en: 'last' },
};

function pad(n: number): string { return String(n).padStart(2, '0'); }
export function toISODate(year: number, month: number, day: number): string { return `${year}-${pad(month)}-${pad(day)}`; }
export function splitYearMonth(iso: string): [number, number] { const [y, m] = iso.split('-').map(Number); return [y, m]; }

/** `month` 1-12 (convention de ce module, jamais l'index JS 0-based). */
export function daysInMonth(year: number, month: number): number { return new Date(year, month, 0).getDate(); }
export function weekdayOf(year: number, month: number, day: number): number { return new Date(year, month - 1, day).getDay(); }

/** Retourne le jour (1-31) du n-ième (ou dernier) `weekdayIndex` du mois, ou `null` s'il n'existe pas (ex. un 5ᵉ lundi qui n'existe pas ce mois-là) — jamais de décalage automatique. */
export function nthWeekdayOfMonth(year: number, month: number, weekdayIndex: number, ordinal: number | 'LAST'): number | null {
  const total = daysInMonth(year, month);
  if (ordinal === 'LAST') {
    for (let day = total; day >= 1; day -= 1) if (weekdayOf(year, month, day) === weekdayIndex) return day;
    return null;
  }
  let count = 0;
  for (let day = 1; day <= total; day += 1) {
    if (weekdayOf(year, month, day) === weekdayIndex) {
      count += 1;
      if (count === ordinal) return day;
    }
  }
  return null;
}

export function computeDayOfMonthDate(year: number, month: number, dayOfMonth: number | undefined): string | null {
  if (!dayOfMonth) return null;
  if (dayOfMonth > daysInMonth(year, month)) return null; // ex. "31" en février : absent ce mois-ci, jamais décalé.
  return toISODate(year, month, dayOfMonth);
}

export function computeNthWeekdayDate(year: number, month: number, ordinal: Ordinal | undefined, weekday: Weekday | undefined): string | null {
  if (!ordinal || !weekday) return null;
  const day = nthWeekdayOfMonth(year, month, WEEKDAY_INDEX[weekday], ORDINAL_NUMBER[ordinal]);
  return day ? toISODate(year, month, day) : null;
}

/** Toutes les occurrences d'un jour de semaine donné dans le mois (pas une seule). */
export function allWeekdayDatesInMonth(year: number, month: number, weekdayIndex: number): string[] {
  const total = daysInMonth(year, month);
  const result: string[] = [];
  for (let day = 1; day <= total; day += 1) if (weekdayOf(year, month, day) === weekdayIndex) result.push(toISODate(year, month, day));
  return result;
}

export function* iterateMonths(startYear: number, startMonth: number, endYear: number, endMonth: number): Generator<{ year: number; month: number }> {
  let y = startYear; let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    yield { year: y, month: m };
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
}

export function* iterateQuarters(startYear: number, startMonth: number, endYear: number, endMonth: number): Generator<{ year: number; quarter: number }> {
  let y = startYear; let q = Math.floor((startMonth - 1) / 3);
  const endKey = endYear * 4 + Math.floor((endMonth - 1) / 3);
  while (y * 4 + q <= endKey) {
    yield { year: y, quarter: q };
    q += 1; if (q > 3) { q = 0; y += 1; }
  }
}

export function ordinalSuffixEn(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}
