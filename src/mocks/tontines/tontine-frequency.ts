/**
 * Périodicité de référence d'une Tontine (reconstruction complète du module
 * Tontines — voir plan de reconstruction). Appartient exclusivement à la
 * CONFIGURATION PERMANENTE de la Tontine (jamais à une Occurrence) : sert
 * uniquement à PRÉ-REMPLIR (suggestion) la date du prochain tour côté UI —
 * elle ne génère JAMAIS plusieurs Occurrences d'un coup (« Ajouter un tour »
 * reste toujours un acte unitaire et progressif, aucune génération en masse
 * de dates futures, contrairement à l'ancien module).
 *
 * WRAPPER, comme `src/mocks/settings/meeting-schedule.ts` : ne réimplémente
 * aucun calcul de date, délègue entièrement aux primitives neutres de
 * `src/lib/recurrence.ts` (extraites de l'ancien `tontine-frequency.ts` car
 * partagées avec les réunions d'exercice fiscal — aucun des deux domaines ne
 * doit posséder l'autre).
 */
import {
  computeDayOfMonthDate,
  computeNthWeekdayDate,
  daysInMonth,
  toISODate,
  type Weekday,
  type Ordinal,
} from '@/lib/recurrence';

export type { Weekday, Ordinal } from '@/lib/recurrence';
export { WEEKDAYS, ORDINALS } from '@/lib/recurrence';

export type TontineFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
export type MonthlyRule = 'DAY_OF_MONTH' | 'NTH_WEEKDAY';
export type QuarterlyRule = 'DAY_OF_MONTH' | 'NTH_WEEKDAY';
/** 1 = premier mois du trimestre, 2 = deuxième, 3 = troisième. */
export type QuarterMonth = 1 | 2 | 3;

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

export const QUARTER_MONTHS: QuarterMonth[] = [1, 2, 3];

const WEEKDAY_INDEX: Record<Weekday, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };
const WEEKDAY_LABEL: Record<Weekday, { fr: string; en: string }> = {
  MONDAY: { fr: 'lundi', en: 'Monday' }, TUESDAY: { fr: 'mardi', en: 'Tuesday' }, WEDNESDAY: { fr: 'mercredi', en: 'Wednesday' },
  THURSDAY: { fr: 'jeudi', en: 'Thursday' }, FRIDAY: { fr: 'vendredi', en: 'Friday' }, SATURDAY: { fr: 'samedi', en: 'Saturday' }, SUNDAY: { fr: 'dimanche', en: 'Sunday' },
};
const ORDINAL_LABEL: Record<Ordinal, { fr: string; en: string }> = {
  FIRST: { fr: 'premier', en: 'first' }, SECOND: { fr: 'deuxième', en: 'second' }, THIRD: { fr: 'troisième', en: 'third' }, FOURTH: { fr: 'quatrième', en: 'fourth' }, LAST: { fr: 'dernier', en: 'last' },
};
const QUARTER_MONTH_LABEL: Record<QuarterMonth, { fr: string; en: string }> = { 1: { fr: 'premier', en: 'first' }, 2: { fr: 'deuxième', en: 'second' }, 3: { fr: 'troisième', en: 'third' } };

function splitYearMonth(iso: string): [number, number] { const [y, m] = iso.split('-').map(Number); return [y, m]; }

function ordinalSuffixEn(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

/** Description humaine de la règle de fréquence — jamais de code technique (DAILY/WEEKLY/…) affiché. */
export function formatFrequencyDescription(config: FrequencyConfig, locale: 'fr' | 'en' = 'fr'): string {
  const isFr = locale === 'fr';
  switch (config.frequency) {
    case 'DAILY':
      return isFr ? 'Chaque jour' : 'Every day';
    case 'WEEKLY': {
      if (!config.weekday) return isFr ? 'Jour de la semaine non défini' : 'Weekday not set';
      return isFr ? `Chaque ${WEEKDAY_LABEL[config.weekday].fr}` : `Every ${WEEKDAY_LABEL[config.weekday].en}`;
    }
    case 'MONTHLY': {
      if (config.monthlyRule === 'NTH_WEEKDAY') {
        if (!config.monthlyOrdinal || !config.monthlyWeekday) return isFr ? 'Règle mensuelle incomplète' : 'Incomplete monthly rule';
        const ord = ORDINAL_LABEL[config.monthlyOrdinal][locale]; const wd = WEEKDAY_LABEL[config.monthlyWeekday][locale];
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

/** Prédicat pur, sans dépendance à `t()` — réutilisable côté service (validation métier, jamais liée à l'i18n). */
export function isValidFrequencyConfig(value: Partial<FrequencyConfig>): value is FrequencyConfig {
  if (!value.frequency) return false;
  if (value.frequency === 'WEEKLY') return Boolean(value.weekday);
  if (value.frequency === 'MONTHLY') {
    if ((value.monthlyRule ?? 'DAY_OF_MONTH') === 'DAY_OF_MONTH') return Boolean(value.monthlyDayOfMonth && value.monthlyDayOfMonth >= 1 && value.monthlyDayOfMonth <= 31);
    return Boolean(value.monthlyOrdinal && value.monthlyWeekday);
  }
  if (value.frequency === 'QUARTERLY') {
    if (!value.quarterlyMonth) return false;
    if ((value.quarterlyRule ?? 'DAY_OF_MONTH') === 'DAY_OF_MONTH') return Boolean(value.quarterlyDayOfMonth && value.quarterlyDayOfMonth >= 1 && value.quarterlyDayOfMonth <= 31);
    return Boolean(value.quarterlyOrdinal && value.quarterlyWeekday);
  }
  return true;
}

/** Un seul message combiné par section — fonction pure prenant `t` en paramètre plutôt que de dépendre de React. */
export function validateFrequency(t: (section: 'tontines', key: string) => string, value: Partial<FrequencyConfig>): string | undefined {
  if (!value.frequency) return t('tontines', 'frequencyRequired');
  if (value.frequency === 'WEEKLY' && !value.weekday) return t('tontines', 'weekdayRequired');
  if (value.frequency === 'MONTHLY') {
    if ((value.monthlyRule ?? 'DAY_OF_MONTH') === 'DAY_OF_MONTH') {
      if (!value.monthlyDayOfMonth || value.monthlyDayOfMonth < 1 || value.monthlyDayOfMonth > 31) return t('tontines', 'dayOfMonthRequired');
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

/**
 * Suggère UNE SEULE date (jamais un tableau) : la prochaine occurrence de la
 * fréquence configurée, strictement après `afterDate` (dernier tour déjà
 * créé, ou `Tontine.startDate` s'il n'y en a aucun). Pure suggestion
 * pré-remplie côté UI — « Ajouter un tour » reste un acte manuel unique,
 * jamais une génération en masse (mandat reconstruction §2 : « No bulk
 * future date generation »). `null` si la fréquence est incomplète/absente.
 */
export function suggestNextOccurrenceDate(config: Partial<FrequencyConfig>, afterDate: string): string | null {
  if (!isValidFrequencyConfig(config)) return null;
  if (config.frequency === 'DAILY') {
    const next = new Date(afterDate); next.setDate(next.getDate() + 1);
    return toISODate(next.getFullYear(), next.getMonth() + 1, next.getDate());
  }
  if (config.frequency === 'WEEKLY') {
    const targetIndex = WEEKDAY_INDEX[config.weekday!];
    const cursor = new Date(afterDate);
    for (let i = 0; i < 7; i += 1) {
      cursor.setDate(cursor.getDate() + 1);
      if (cursor.getDay() === targetIndex) return toISODate(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    }
    return null;
  }
  if (config.frequency === 'MONTHLY') {
    let [year, month] = splitYearMonth(afterDate);
    for (let i = 0; i < 24; i += 1) {
      month += 1; if (month > 12) { month = 1; year += 1; }
      const candidate = config.monthlyRule === 'NTH_WEEKDAY'
        ? computeNthWeekdayDate(year, month, config.monthlyOrdinal, config.monthlyWeekday)
        : computeDayOfMonthDate(year, month, config.monthlyDayOfMonth);
      if (candidate && candidate > afterDate) return candidate;
    }
    return null;
  }
  if (config.frequency === 'QUARTERLY') {
    const [initialYear, initialMonth] = splitYearMonth(afterDate);
    let year = initialYear;
    let quarter = Math.floor((initialMonth - 1) / 3);
    for (let i = 0; i < 8; i += 1) {
      quarter += 1; if (quarter > 3) { quarter = 0; year += 1; }
      const targetMonth = quarter * 3 + config.quarterlyMonth!;
      const candidate = config.quarterlyRule === 'NTH_WEEKDAY'
        ? computeNthWeekdayDate(year, targetMonth, config.quarterlyOrdinal, config.quarterlyWeekday)
        : computeDayOfMonthDate(year, targetMonth, config.quarterlyDayOfMonth);
      if (candidate && candidate > afterDate) return candidate;
    }
    return null;
  }
  return null;
}

/**
 * Transitions pures de la configuration de fréquence (cascade UX) — chaque
 * fonction réinitialise systématiquement les sous-champs devenus non
 * pertinents et préserve les champs parents déjà choisis. Utilisées par le
 * composant de fréquence de `tontines-module.tsx`.
 */
export function applyWeekday(current: Partial<FrequencyConfig>, weekday: Weekday | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, weekday };
}
export function applyMonthlyDayOfMonth(current: Partial<FrequencyConfig>, day: number | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: day };
}
export function applyMonthlyOrdinal(current: Partial<FrequencyConfig>, ordinal: Ordinal | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: ordinal };
}
export function applyMonthlyWeekday(current: Partial<FrequencyConfig>, weekday: Weekday | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: current.monthlyOrdinal, monthlyWeekday: weekday };
}
export function applyQuarterlyMonth(current: Partial<FrequencyConfig>, month: QuarterMonth | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, quarterlyRule: current.quarterlyRule, quarterlyMonth: month };
}
export function applyQuarterlyDayOfMonth(current: Partial<FrequencyConfig>, day: number | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: current.quarterlyMonth, quarterlyDayOfMonth: day };
}
export function applyQuarterlyOrdinal(current: Partial<FrequencyConfig>, ordinal: Ordinal | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: current.quarterlyMonth, quarterlyOrdinal: ordinal };
}
export function applyQuarterlyWeekday(current: Partial<FrequencyConfig>, weekday: Weekday | undefined): Partial<FrequencyConfig> {
  return { frequency: current.frequency, quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: current.quarterlyMonth, quarterlyOrdinal: current.quarterlyOrdinal, quarterlyWeekday: weekday };
}

/** Ré-exportées pour les tests de bord (primitives partagées, `src/lib/recurrence.ts`). */
export { daysInMonth, toISODate };
