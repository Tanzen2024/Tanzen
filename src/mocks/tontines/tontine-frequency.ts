/**
 * Périodicité de la Tontine (mandat fréquence) — appartient exclusivement à
 * la CONFIGURATION PERMANENTE de la Tontine (jamais à une Occurrence, jamais
 * à l'ancien Cycle légataire, cf. tontine-cycles.ts qui n'est pas touché
 * ici). Sert de règle de référence pour calculer les dates d'Occurrences
 * d'une Période (`generateOccurrenceDates`), réutilisée telle quelle par
 * toutes les Périodes successives d'une même Tontine (aucune recopie, aucune
 * nouvelle Tontine créée pour changer de période — cf. tontine-periods.ts).
 *
 * `generateOccurrenceDates`/`formatFrequencyDescription` sont des fonctions
 * pures, sans dépendance React ni service, directement testables — suivent
 * le même principe déjà appliqué à `formatUnit` (constants/units.ts) :
 * les libellés bilingues sont embarqués ici plutôt que threadés via `t()`,
 * car ce sont des données de référence, pas de la copie UI générique.
 */

export type TontineFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type Ordinal = 'FIRST' | 'SECOND' | 'THIRD' | 'FOURTH' | 'LAST';
export type MonthlyRule = 'DAY_OF_MONTH' | 'NTH_WEEKDAY';
export type QuarterlyRule = 'DAY_OF_MONTH' | 'NTH_WEEKDAY';
/** 1 = premier mois du trimestre, 2 = deuxième, 3 = troisième (convention explicite, non ambiguë). */
export type QuarterMonth = 1 | 2 | 3;

/** Champs de périodicité — embarqués tels quels dans `Tontine` (configuration permanente), jamais sur `TontineOccurrence` ni sur l'ancien `TontineCycle`. */
export type FrequencyConfig = {
  frequency: TontineFrequency;
  weekday?: Weekday;
  monthlyRule?: MonthlyRule;
  monthlyDayOfMonth?: number;
  monthlyOrdinal?: Ordinal;
  monthlyWeekday?: Weekday;
  quarterlyRule?: QuarterlyRule;
  quarterlyMonth?: QuarterMonth;
  quarterlyDayOfMonth?: number;
  quarterlyOrdinal?: Ordinal;
  quarterlyWeekday?: Weekday;
};

export const WEEKDAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
export const ORDINALS: Ordinal[] = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'LAST'];
export const QUARTER_MONTHS: QuarterMonth[] = [1, 2, 3];

const WEEKDAY_INDEX: Record<Weekday, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };
const WEEKDAY_LABEL: Record<Weekday, { fr: string; en: string }> = {
  MONDAY: { fr: 'lundi', en: 'Monday' }, TUESDAY: { fr: 'mardi', en: 'Tuesday' }, WEDNESDAY: { fr: 'mercredi', en: 'Wednesday' },
  THURSDAY: { fr: 'jeudi', en: 'Thursday' }, FRIDAY: { fr: 'vendredi', en: 'Friday' }, SATURDAY: { fr: 'samedi', en: 'Saturday' }, SUNDAY: { fr: 'dimanche', en: 'Sunday' },
};
const ORDINAL_LABEL: Record<Ordinal, { fr: string; en: string }> = {
  FIRST: { fr: 'premier', en: 'first' }, SECOND: { fr: 'deuxième', en: 'second' }, THIRD: { fr: 'troisième', en: 'third' }, FOURTH: { fr: 'quatrième', en: 'fourth' }, LAST: { fr: 'dernier', en: 'last' },
};
const ORDINAL_NUMBER: Record<Ordinal, number | 'LAST'> = { FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, LAST: 'LAST' };
const QUARTER_MONTH_LABEL: Record<QuarterMonth, { fr: string; en: string }> = { 1: { fr: 'premier', en: 'first' }, 2: { fr: 'deuxième', en: 'second' }, 3: { fr: 'troisième', en: 'third' } };

function pad(n: number): string { return String(n).padStart(2, '0'); }
function toISODate(year: number, month: number, day: number): string { return `${year}-${pad(month)}-${pad(day)}`; }
function splitYearMonth(iso: string): [number, number] { const [y, m] = iso.split('-').map(Number); return [y, m]; }
/** `month` 1-12 (convention de ce module, jamais l'index JS 0-based). */
function daysInMonth(year: number, month: number): number { return new Date(year, month, 0).getDate(); }
function weekdayOf(year: number, month: number, day: number): number { return new Date(year, month - 1, day).getDay(); }

/** Retourne le jour (1-31) du n-ième (ou dernier) `weekdayIndex` du mois, ou `null` s'il n'existe pas (ex. un 5ᵉ lundi qui n'existe pas ce mois-là) — jamais de décalage automatique. */
function nthWeekdayOfMonth(year: number, month: number, weekdayIndex: number, ordinal: number | 'LAST'): number | null {
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

function computeDayOfMonthDate(year: number, month: number, dayOfMonth: number | undefined): string | null {
  if (!dayOfMonth) return null;
  if (dayOfMonth > daysInMonth(year, month)) return null; // ex. "31" en février : absent ce mois-ci, jamais décalé.
  return toISODate(year, month, dayOfMonth);
}

function computeNthWeekdayDate(year: number, month: number, ordinal: Ordinal | undefined, weekday: Weekday | undefined): string | null {
  if (!ordinal || !weekday) return null;
  const day = nthWeekdayOfMonth(year, month, WEEKDAY_INDEX[weekday], ORDINAL_NUMBER[ordinal]);
  return day ? toISODate(year, month, day) : null;
}

/** Toutes les occurrences d'un jour de semaine donné dans le mois (pas une seule) — sémantique de MONTHLY + « Jour de semaine » sans ordinal (mandat correction UX §6) : « une occurrence chaque semaine de ce jour, dans chaque mois concerné ». */
function allWeekdayDatesInMonth(year: number, month: number, weekdayIndex: number): string[] {
  const total = daysInMonth(year, month);
  const result: string[] = [];
  for (let day = 1; day <= total; day += 1) if (weekdayOf(year, month, day) === weekdayIndex) result.push(toISODate(year, month, day));
  return result;
}

function* iterateMonths(startYear: number, startMonth: number, endYear: number, endMonth: number): Generator<{ year: number; month: number }> {
  let y = startYear; let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    yield { year: y, month: m };
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
}

function* iterateQuarters(startYear: number, startMonth: number, endYear: number, endMonth: number): Generator<{ year: number; quarter: number }> {
  let y = startYear; let q = Math.floor((startMonth - 1) / 3);
  const endKey = endYear * 4 + Math.floor((endMonth - 1) / 3);
  while (y * 4 + q <= endKey) {
    yield { year: y, quarter: q };
    q += 1; if (q > 3) { q = 0; y += 1; }
  }
}

/**
 * Calcule les dates d'Occurrences d'une Période à partir de la config de
 * fréquence de sa Tontine. Déterministe (même entrée → même sortie),
 * jamais de doublon, jamais hors période, ordre chronologique. Un jour/
 * combinaison inexistant (31 en février, 5ᵉ lundi absent) est simplement
 * omis — aucun décalage automatique n'est appliqué (§17 du mandat).
 */
export function generateOccurrenceDates(period: { startDate: string; endDate: string }, config: FrequencyConfig): string[] {
  const { startDate, endDate } = period;
  if (!startDate || !endDate || endDate < startDate) return [];
  const inRange = (d: string) => d >= startDate && d <= endDate;
  const dates: string[] = [];

  if (config.frequency === 'DAILY') {
    const cursor = new Date(startDate); const end = new Date(endDate);
    while (cursor.getTime() <= end.getTime()) {
      const iso = toISODate(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
      if (inRange(iso)) dates.push(iso);
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  if (config.frequency === 'WEEKLY') {
    if (!config.weekday) return [];
    const targetIndex = WEEKDAY_INDEX[config.weekday];
    const cursor = new Date(startDate); const end = new Date(endDate);
    while (cursor.getTime() <= end.getTime()) {
      if (cursor.getDay() === targetIndex) {
        const iso = toISODate(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
        if (inRange(iso)) dates.push(iso);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  if (config.frequency === 'MONTHLY') {
    const [startYear, startMonth] = splitYearMonth(startDate);
    const [endYear, endMonth] = splitYearMonth(endDate);
    for (const { year, month } of iterateMonths(startYear, startMonth, endYear, endMonth)) {
      if (config.monthlyRule === 'NTH_WEEKDAY') {
        if (!config.monthlyWeekday) continue;
        /**
         * `monthlyOrdinal` absent (parcours UI actuel, mandat correction UX
         * §3/§6) → toutes les occurrences du jour dans le mois. `monthlyOrdinal`
         * présent (compatibilité §9 : anciennes configs/mocks/tests) → une
         * seule date, comportement historique inchangé.
         */
        const monthDates = config.monthlyOrdinal
          ? [computeNthWeekdayDate(year, month, config.monthlyOrdinal, config.monthlyWeekday)].filter((d): d is string => d !== null)
          : allWeekdayDatesInMonth(year, month, WEEKDAY_INDEX[config.monthlyWeekday]);
        for (const dateStr of monthDates) if (inRange(dateStr)) dates.push(dateStr);
      } else {
        const dateStr = computeDayOfMonthDate(year, month, config.monthlyDayOfMonth);
        if (dateStr && inRange(dateStr)) dates.push(dateStr);
      }
    }
    return dates;
  }

  if (config.frequency === 'QUARTERLY') {
    if (!config.quarterlyMonth) return [];
    const [startYear, startMonth] = splitYearMonth(startDate);
    const [endYear, endMonth] = splitYearMonth(endDate);
    for (const { year, quarter } of iterateQuarters(startYear, startMonth, endYear, endMonth)) {
      const targetMonth = quarter * 3 + config.quarterlyMonth; // quarter 0-3, quarterlyMonth 1-3 → mois 1-12
      const dateStr = config.quarterlyRule === 'NTH_WEEKDAY'
        ? computeNthWeekdayDate(year, targetMonth, config.quarterlyOrdinal, config.quarterlyWeekday)
        : computeDayOfMonthDate(year, targetMonth, config.quarterlyDayOfMonth);
      if (dateStr && inRange(dateStr)) dates.push(dateStr);
    }
    return dates;
  }

  return dates;
}

function ordinalSuffixEn(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

/** Description humaine de la règle de fréquence — jamais de code technique (DAILY/WEEKLY/…) affiché, jamais dupliquée manuellement ailleurs. */
export function formatFrequencyDescription(config: FrequencyConfig, locale: 'fr' | 'en' = 'fr'): string {
  const isFr = locale === 'fr';
  switch (config.frequency) {
    case 'DAILY':
      return isFr ? 'Chaque jour' : 'Every day';
    case 'WEEKLY': {
      if (!config.weekday) return isFr ? 'Jour de la semaine non défini' : 'Weekday not set';
      const wd = WEEKDAY_LABEL[config.weekday][locale];
      return isFr ? `Chaque ${wd}` : `Every ${wd}`;
    }
    case 'MONTHLY': {
      if (config.monthlyRule === 'NTH_WEEKDAY') {
        if (!config.monthlyWeekday) return isFr ? 'Règle mensuelle incomplète' : 'Incomplete monthly rule';
        const wd = WEEKDAY_LABEL[config.monthlyWeekday][locale];
        // `monthlyOrdinal` absent (parcours UI actuel) → « Chaque jeudi », identique à WEEKLY. Présent (compatibilité §9) → ancien libellé « Le dernier jeudi de chaque mois ».
        if (!config.monthlyOrdinal) return isFr ? `Chaque ${wd}` : `Every ${wd}`;
        const ord = ORDINAL_LABEL[config.monthlyOrdinal][locale];
        return isFr ? `Le ${ord} ${wd} de chaque mois` : `The ${ord} ${wd} of every month`;
      }
      if (!config.monthlyDayOfMonth) return isFr ? 'Règle mensuelle incomplète' : 'Incomplete monthly rule';
      return isFr ? `Le ${config.monthlyDayOfMonth} de chaque mois` : `The ${ordinalSuffixEn(config.monthlyDayOfMonth)} of every month`;
    }
    case 'QUARTERLY': {
      if (!config.quarterlyMonth) return isFr ? 'Règle trimestrielle incomplète' : 'Incomplete quarterly rule';
      const monthLabel = QUARTER_MONTH_LABEL[config.quarterlyMonth][locale];
      if (config.quarterlyRule === 'NTH_WEEKDAY') {
        if (!config.quarterlyOrdinal || !config.quarterlyWeekday) return isFr ? 'Règle trimestrielle incomplète' : 'Incomplete quarterly rule';
        const ord = ORDINAL_LABEL[config.quarterlyOrdinal][locale]; const wd = WEEKDAY_LABEL[config.quarterlyWeekday][locale];
        return isFr ? `Le ${ord} ${wd} du ${monthLabel} mois de chaque trimestre` : `The ${ord} ${wd} of the ${monthLabel} month of every quarter`;
      }
      if (!config.quarterlyDayOfMonth) return isFr ? 'Règle trimestrielle incomplète' : 'Incomplete quarterly rule';
      return isFr ? `Le ${config.quarterlyDayOfMonth} du ${monthLabel} mois de chaque trimestre` : `The ${ordinalSuffixEn(config.quarterlyDayOfMonth)} of the ${monthLabel} month of every quarter`;
    }
    default:
      return '';
  }
}

/**
 * Transitions pures de la configuration de fréquence (mandat cascade UX) —
 * chaque fonction réinitialise systématiquement les sous-champs devenus non
 * pertinents (jamais de valeur résiduelle) et préserve les champs parents
 * déjà choisis (jamais de perte d'une sélection encore valide). Utilisées
 * par `FrequencyFields` (UI) et directement testables ici, plutôt que de
 * dupliquer cette logique dans le composant (§9 du mandat).
 */
export function applyWeekday(current: Partial<FrequencyConfig>, weekday: Weekday | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, weekday };
}
export function applyMonthlyRule(current: Partial<FrequencyConfig>, rule: MonthlyRule): Partial<FrequencyConfig> {
  return { frequency: current.frequency, monthlyRule: rule };
}
export function applyMonthlyDayOfMonth(current: Partial<FrequencyConfig>, day: number | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: day };
}
/** Étape 1 de MONTHLY + « Jour de semaine » (mandat cascade UX §4.2) — choisir/changer l'ordre réinitialise toujours le jour de semaine, qui vient après dans la cascade. */
export function applyMonthlyOrdinal(current: Partial<FrequencyConfig>, ordinal: Ordinal | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: ordinal };
}
/** Étape 2 (dernière) de MONTHLY + « Jour de semaine » — préserve l'ordre déjà choisi (parent), rien en aval. */
export function applyMonthlyWeekday(current: Partial<FrequencyConfig>, weekday: Weekday | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: current.monthlyOrdinal, monthlyWeekday: weekday };
}
/** Changer de règle trimestrielle conserve `quarterlyMonth` (champ commun aux deux branches, §7 du mandat) mais réinitialise tout ce qui est spécifique à l'ancienne branche. */
export function applyQuarterlyRule(current: Partial<FrequencyConfig>, rule: QuarterlyRule): Partial<FrequencyConfig> {
  return { frequency: current.frequency, quarterlyRule: rule, quarterlyMonth: current.quarterlyMonth };
}
/** `quarterlyMonth` est en amont de Jour/Ordre/Jour de semaine dans la cascade — le changer réinitialise systématiquement tout ce qui en dépend. */
export function applyQuarterlyMonth(current: Partial<FrequencyConfig>, month: QuarterMonth | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, quarterlyRule: current.quarterlyRule, quarterlyMonth: month };
}
export function applyQuarterlyDayOfMonth(current: Partial<FrequencyConfig>, day: number | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: current.quarterlyMonth, quarterlyDayOfMonth: day };
}
/** Étape 2 de QUARTERLY + « Jour de semaine » (après Mois du trimestre) — choisir/changer l'ordre réinitialise le jour de semaine, qui vient après. */
export function applyQuarterlyOrdinal(current: Partial<FrequencyConfig>, ordinal: Ordinal | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: current.quarterlyMonth, quarterlyOrdinal: ordinal };
}
/** Étape 3 (dernière) de QUARTERLY + « Jour de semaine ». */
export function applyQuarterlyWeekday(current: Partial<FrequencyConfig>, weekday: Weekday | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: current.quarterlyMonth, quarterlyOrdinal: current.quarterlyOrdinal, quarterlyWeekday: weekday };
}

/** Exposé uniquement pour les tests d'edge case (§17 : « cinquième occurrence inexistante ») — l'UI ne propose jamais d'ordinal au-delà de FOURTH/LAST, mais l'algorithme sous-jacent doit rester sûr si on l'interroge au-delà. */
export const __testing = { nthWeekdayOfMonth, daysInMonth };

/** Validation §8 du mandat — un seul message combiné par section (cohérent avec la granularité déjà utilisée ailleurs dans le formulaire Tontine). Fonction pure prenant `t` en paramètre plutôt que de dépendre de React, pour rester colocalisée avec le reste de la logique de fréquence (évite de mélanger export de composant et export de fonction dans un même fichier `.tsx`, source du seul type de warning ESLint déjà toléré ailleurs dans ce projet). */
export function validateFrequency(t: (section: 'tontines', key: string) => string, value: Partial<FrequencyConfig>): string | undefined {
  if (!value.frequency) return t('tontines', 'frequencyRequired');
  if (value.frequency === 'WEEKLY' && !value.weekday) return t('tontines', 'weekdayRequired');
  if (value.frequency === 'MONTHLY') {
    if ((value.monthlyRule ?? 'DAY_OF_MONTH') === 'DAY_OF_MONTH') {
      if (!value.monthlyDayOfMonth || value.monthlyDayOfMonth < 1 || value.monthlyDayOfMonth > 31) return t('tontines', 'dayOfMonthRequired');
      // Mandat cascade UX (postérieur à la correction précédente) : « Jour de semaine » mensuel redemande l'ordre, symétrique à QUARTERLY ci-dessous — décision explicite, documentée comme réintroduction volontaire dans le rapport final.
    } else if (!value.monthlyOrdinal || !value.monthlyWeekday) return t('tontines', 'ordinalWeekdayRequired');
  }
  if (value.frequency === 'QUARTERLY') {
    if (!value.quarterlyMonth) return t('tontines', 'quarterMonthRequired');
    if ((value.quarterlyRule ?? 'DAY_OF_MONTH') === 'DAY_OF_MONTH') {
      if (!value.quarterlyDayOfMonth || value.quarterlyDayOfMonth < 1 || value.quarterlyDayOfMonth > 31) return t('tontines', 'dayOfMonthRequired');
    } else if (!value.quarterlyOrdinal || !value.quarterlyWeekday) return t('tontines', 'ordinalWeekdayRequired');
  }
  return undefined;
}
