/**
 * Configuration de récurrence des RÉUNIONS d'un Exercice fiscal (mandat
 * « RÈGLE CENTRALE — DATES DE RÉUNION »). Portée par `FiscalYear.meetingSchedule`
 * (`src/mocks/settings/fiscal-years.ts`), elle est la SOURCE DE VÉRITÉ des dates
 * de réunion consommées partout dans l'application via `meetingService`
 * (`src/services/meeting.service.ts`).
 *
 * Ce module NE réimplémente AUCUN calcul de date calendaire : il bâtit
 * directement sur les primitives neutres de `src/lib/recurrence.ts`
 * (`computeDayOfMonthDate`/`computeNthWeekdayDate`/`daysInMonth`/
 * `allWeekdayDatesInMonth`/`iterateMonths`/`iterateQuarters`), exactement
 * comme le moteur de fréquence Tontines (`src/mocks/tontines/tontine-frequency.ts`)
 * bâtit sur les mêmes primitives — aucun des deux domaines ne dépend de
 * l'autre (extraction déjà faite lors de la reconstruction complète du
 * module Tontines, qui ne génère plus JAMAIS de dates en masse : la
 * génération calendaire complète d'un exercice reste un besoin propre aux
 * réunions, implémentée ici, jamais déléguée à un module qui ne la fait
 * plus). N'ajoute, au-delà des 4 fréquences communes (DAILY/WEEKLY/MONTHLY/
 * QUARTERLY), que :
 *   - les fréquences SEMIANNUAL / ANNUAL (propres aux réunions) ;
 *   - la règle LAST_DAY_OF_PERIOD (« dernier jour de la période »).
 *
 * Fonctions pures, sans dépendance React ni service — directement testables
 * (`meeting-schedule.test.ts`).
 */
import {
  computeDayOfMonthDate,
  computeNthWeekdayDate,
  daysInMonth,
  allWeekdayDatesInMonth,
  iterateMonths,
  iterateQuarters,
  WEEKDAY_INDEX,
  toISODate,
  type Weekday,
  type Ordinal,
} from '@/lib/recurrence';

export type { Weekday, Ordinal } from '@/lib/recurrence';
export { WEEKDAYS, ORDINALS } from '@/lib/recurrence';

/** Les 6 fréquences imposées par le mandat (§2). ANNUAL n'est jamais dédoublée. */
export type MeetingFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
/** Règles de récurrence (§3). `LAST_DAY_OF_PERIOD` = dernier jour calendaire de la période. */
export type MeetingRecurrenceRule = 'DAY_OF_MONTH' | 'NTH_WEEKDAY' | 'LAST_DAY_OF_PERIOD';

export type MeetingScheduleConfig = {
  frequency: MeetingFrequency;
  /** WEEKLY uniquement. */
  weekday?: Weekday;
  /** MONTHLY / QUARTERLY / SEMIANNUAL / ANNUAL. */
  rule?: MeetingRecurrenceRule;
  /** `rule === 'DAY_OF_MONTH'` — 1..31 (un jour absent le mois considéré est simplement omis). */
  dayOfMonth?: number;
  /** `rule === 'NTH_WEEKDAY'` — ordre (PREMIER..QUATRIÈME / DERNIER). */
  ordinal?: Ordinal;
  /** `rule === 'NTH_WEEKDAY'` — jour de semaine. */
  nthWeekday?: Weekday;
  /**
   * Mois d'ancrage à l'intérieur de la période, pour QUARTERLY / SEMIANNUAL /
   * ANNUAL et `rule !== 'LAST_DAY_OF_PERIOD'` :
   *   QUARTERLY  → 1..3  (mois du trimestre)
   *   SEMIANNUAL → 1..6  (mois du semestre)
   *   ANNUAL     → 1..12 (mois de l'année)
   */
  anchorMonth?: number;
};

export const MEETING_FREQUENCIES: MeetingFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];
export const MEETING_RECURRENCE_RULES: MeetingRecurrenceRule[] = ['DAY_OF_MONTH', 'NTH_WEEKDAY', 'LAST_DAY_OF_PERIOD'];

/** Une fréquence porte une règle de période (donc un mois d'ancrage éventuel). DAILY/WEEKLY non. */
export function frequencyHasRule(frequency: MeetingFrequency | undefined): boolean {
  return frequency === 'MONTHLY' || frequency === 'QUARTERLY' || frequency === 'SEMIANNUAL' || frequency === 'ANNUAL';
}
/** MONTHLY : la période EST le mois, aucun mois d'ancrage à choisir. */
export function frequencyHasAnchorMonth(frequency: MeetingFrequency | undefined): boolean {
  return frequency === 'QUARTERLY' || frequency === 'SEMIANNUAL' || frequency === 'ANNUAL';
}
/** Nombre de mois par période — sert de borne au sélecteur « mois d'ancrage ». */
export function anchorMonthCount(frequency: MeetingFrequency | undefined): number {
  if (frequency === 'QUARTERLY') return 3;
  if (frequency === 'SEMIANNUAL') return 6;
  if (frequency === 'ANNUAL') return 12;
  return 0;
}

function lastDayOfMonthISO(year: number, month: number): string { return toISODate(year, month, daysInMonth(year, month)); }
function splitYearMonth(iso: string): [number, number] { const [y, m] = iso.split('-').map(Number); return [y, m]; }

/** Applique la règle (`DAY_OF_MONTH` / `NTH_WEEKDAY` / `LAST_DAY_OF_PERIOD`) à un mois donné → date ISO ou `null`. */
function applyRuleToMonth(year: number, month: number, config: MeetingScheduleConfig): string | null {
  if (config.rule === 'LAST_DAY_OF_PERIOD') return lastDayOfMonthISO(year, month);
  if (config.rule === 'NTH_WEEKDAY') return computeNthWeekdayDate(year, month, config.ordinal, config.nthWeekday);
  if (config.rule === 'DAY_OF_MONTH') return computeDayOfMonthDate(year, month, config.dayOfMonth);
  return null;
}

/**
 * Toutes les dates de réunion de l'exercice — déterministe, ordre chronologique,
 * sans doublon, jamais hors [startDate, endDate]. Une combinaison inexistante
 * (31 février, 5ᵉ lundi absent) est omise, jamais décalée.
 */
export function generateMeetingDates(period: { startDate: string; endDate: string }, config: MeetingScheduleConfig): string[] {
  const { startDate, endDate } = period;
  if (!startDate || !endDate || endDate < startDate) return [];
  if (!isValidMeetingScheduleConfig(config)) return [];
  const inRange = (d: string) => d >= startDate && d <= endDate;

  // DAILY / WEEKLY / MONTHLY / QUARTERLY (hors LAST_DAY_OF_PERIOD) → implémentation directe sur les primitives neutres.
  const common = generateCommonFrequencyDates(period, config);
  if (common) return common;

  const [startYear] = splitYearMonth(startDate);
  const [endYear] = splitYearMonth(endDate);
  const dates: string[] = [];

  if (config.frequency === 'MONTHLY') {
    // Seul cas MONTHLY non délégué : LAST_DAY_OF_PERIOD (dernier jour de chaque mois).
    const [sy, sm] = splitYearMonth(startDate);
    const [ey, em] = splitYearMonth(endDate);
    let y = sy; let m = sm;
    while (y < ey || (y === ey && m <= em)) {
      const d = lastDayOfMonthISO(y, m);
      if (inRange(d)) dates.push(d);
      m += 1; if (m > 12) { m = 1; y += 1; }
    }
    return dates;
  }

  if (config.frequency === 'QUARTERLY') {
    // Seul cas QUARTERLY non délégué : LAST_DAY_OF_PERIOD (dernier jour de chaque trimestre).
    for (let y = startYear; y <= endYear; y += 1) {
      for (let q = 0; q < 4; q += 1) {
        const d = lastDayOfMonthISO(y, q * 3 + 3);
        if (inRange(d)) dates.push(d);
      }
    }
    return dates.sort();
  }

  if (config.frequency === 'SEMIANNUAL') {
    for (let y = startYear; y <= endYear; y += 1) {
      for (let half = 0; half < 2; half += 1) {
        const anchor = config.rule === 'LAST_DAY_OF_PERIOD' ? 6 : (config.anchorMonth ?? 1);
        const month = half * 6 + anchor;
        const d = applyRuleToMonth(y, month, config);
        if (d && inRange(d)) dates.push(d);
      }
    }
    return dates.sort();
  }

  if (config.frequency === 'ANNUAL') {
    for (let y = startYear; y <= endYear; y += 1) {
      const month = config.rule === 'LAST_DAY_OF_PERIOD' ? 12 : (config.anchorMonth ?? 1);
      const d = applyRuleToMonth(y, month, config);
      if (d && inRange(d)) dates.push(d);
    }
    return dates.sort();
  }

  return dates;
}

/**
 * DAILY / WEEKLY / MONTHLY / QUARTERLY (hors `LAST_DAY_OF_PERIOD`) — mêmes 4
 * fréquences communes que le moteur de fréquence Tontines, implémentées
 * directement ici sur les mêmes primitives neutres (`src/lib/recurrence.ts`),
 * jamais déléguées (Tontines ne génère plus de dates en masse). Renvoie
 * `null` pour SEMIANNUAL/ANNUAL et pour toute règle `LAST_DAY_OF_PERIOD`
 * (traités séparément par `generateMeetingDates` ci-dessus).
 */
function generateCommonFrequencyDates(period: { startDate: string; endDate: string }, config: MeetingScheduleConfig): string[] | null {
  const { startDate, endDate } = period;
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

  if (config.frequency === 'MONTHLY' && config.rule !== 'LAST_DAY_OF_PERIOD') {
    const [startYear, startMonth] = splitYearMonth(startDate);
    const [endYear, endMonth] = splitYearMonth(endDate);
    for (const { year, month } of iterateMonths(startYear, startMonth, endYear, endMonth)) {
      if (config.rule === 'NTH_WEEKDAY') {
        if (!config.nthWeekday) continue;
        const monthDates = config.ordinal
          ? [computeNthWeekdayDate(year, month, config.ordinal, config.nthWeekday)].filter((d): d is string => d !== null)
          : allWeekdayDatesInMonth(year, month, WEEKDAY_INDEX[config.nthWeekday]);
        for (const dateStr of monthDates) if (inRange(dateStr)) dates.push(dateStr);
      } else {
        const dateStr = computeDayOfMonthDate(year, month, config.dayOfMonth);
        if (dateStr && inRange(dateStr)) dates.push(dateStr);
      }
    }
    return dates;
  }

  if (config.frequency === 'QUARTERLY' && config.rule !== 'LAST_DAY_OF_PERIOD') {
    if (!config.anchorMonth) return [];
    const [startYear, startMonth] = splitYearMonth(startDate);
    const [endYear, endMonth] = splitYearMonth(endDate);
    for (const { year, quarter } of iterateQuarters(startYear, startMonth, endYear, endMonth)) {
      const targetMonth = quarter * 3 + config.anchorMonth;
      const dateStr = config.rule === 'NTH_WEEKDAY'
        ? computeNthWeekdayDate(year, targetMonth, config.ordinal, config.nthWeekday)
        : computeDayOfMonthDate(year, targetMonth, config.dayOfMonth);
      if (dateStr && inRange(dateStr)) dates.push(dateStr);
    }
    return dates;
  }

  return null;
}

/** Prédicat pur — une config complète pour son scénario. Réutilisé par le service ET l'UI. */
export function isValidMeetingScheduleConfig(value: Partial<MeetingScheduleConfig> | undefined | null): value is MeetingScheduleConfig {
  if (!value || !value.frequency) return false;
  if (value.frequency === 'DAILY') return true;
  if (value.frequency === 'WEEKLY') return Boolean(value.weekday);
  if (!value.rule) return false;
  if (frequencyHasAnchorMonth(value.frequency) && value.rule !== 'LAST_DAY_OF_PERIOD') {
    const max = anchorMonthCount(value.frequency);
    if (!value.anchorMonth || value.anchorMonth < 1 || value.anchorMonth > max) return false;
  }
  if (value.rule === 'DAY_OF_MONTH') return Boolean(value.dayOfMonth && value.dayOfMonth >= 1 && value.dayOfMonth <= 31);
  if (value.rule === 'NTH_WEEKDAY') return Boolean(value.ordinal && value.nthWeekday);
  return true; // LAST_DAY_OF_PERIOD
}

const WEEKDAY_LABEL: Record<Weekday, { fr: string; en: string }> = {
  MONDAY: { fr: 'lundi', en: 'Monday' }, TUESDAY: { fr: 'mardi', en: 'Tuesday' }, WEDNESDAY: { fr: 'mercredi', en: 'Wednesday' },
  THURSDAY: { fr: 'jeudi', en: 'Thursday' }, FRIDAY: { fr: 'vendredi', en: 'Friday' }, SATURDAY: { fr: 'samedi', en: 'Saturday' }, SUNDAY: { fr: 'dimanche', en: 'Sunday' },
};
const ORDINAL_LABEL: Record<Ordinal, { fr: string; en: string }> = {
  FIRST: { fr: 'premier', en: 'first' }, SECOND: { fr: 'deuxième', en: 'second' }, THIRD: { fr: 'troisième', en: 'third' }, FOURTH: { fr: 'quatrième', en: 'fourth' }, LAST: { fr: 'dernier', en: 'last' },
};
const PERIOD_LABEL: Record<MeetingFrequency, { fr: string; en: string }> = {
  DAILY: { fr: 'jour', en: 'day' }, WEEKLY: { fr: 'semaine', en: 'week' }, MONTHLY: { fr: 'mois', en: 'month' },
  QUARTERLY: { fr: 'trimestre', en: 'quarter' }, SEMIANNUAL: { fr: 'semestre', en: 'half-year' }, ANNUAL: { fr: 'année', en: 'year' },
};

const FREQUENCY_LABEL: Record<MeetingFrequency, { fr: string; en: string }> = {
  DAILY: { fr: 'Journalière', en: 'Daily' }, WEEKLY: { fr: 'Hebdomadaire', en: 'Weekly' }, MONTHLY: { fr: 'Mensuelle', en: 'Monthly' },
  QUARTERLY: { fr: 'Trimestrielle', en: 'Quarterly' }, SEMIANNUAL: { fr: 'Semestrielle', en: 'Half-yearly' }, ANNUAL: { fr: 'Annuelle', en: 'Yearly' },
};
const RULE_LABEL: Record<MeetingRecurrenceRule, { fr: string; en: string }> = {
  DAY_OF_MONTH: { fr: 'Jour du mois', en: 'Day of month' }, NTH_WEEKDAY: { fr: 'Jour de semaine', en: 'Weekday' }, LAST_DAY_OF_PERIOD: { fr: 'Dernier jour de la période', en: 'Last day of the period' },
};

/** Libellés de référence — bilingues embarqués (même parti-pris que `tontine-frequency.ts`), réutilisés par `MeetingScheduleFields` et l'affichage « Calendrier des réunions ». */
export function meetingFrequencyLabel(frequency: MeetingFrequency, locale: 'fr' | 'en' = 'fr'): string { return FREQUENCY_LABEL[frequency][locale]; }
export function meetingRuleLabel(rule: MeetingRecurrenceRule, locale: 'fr' | 'en' = 'fr'): string { return RULE_LABEL[rule][locale]; }
export function meetingWeekdayLabel(weekday: Weekday, locale: 'fr' | 'en' = 'fr'): string { return WEEKDAY_LABEL[weekday][locale]; }
export function meetingOrdinalLabel(ordinal: Ordinal, locale: 'fr' | 'en' = 'fr'): string { return ORDINAL_LABEL[ordinal][locale]; }

/** Description humaine de la règle — bilingue embarqué (même parti-pris que `tontine-frequency.ts`). */
export function formatMeetingScheduleDescription(config: Partial<MeetingScheduleConfig> | undefined | null, locale: 'fr' | 'en' = 'fr'): string {
  const isFr = locale === 'fr';
  if (!isValidMeetingScheduleConfig(config)) return isFr ? 'Configuration incomplète' : 'Incomplete configuration';
  const period = PERIOD_LABEL[config.frequency][locale];
  if (config.frequency === 'DAILY') return isFr ? 'Chaque jour' : 'Every day';
  if (config.frequency === 'WEEKLY') {
    const wd = WEEKDAY_LABEL[config.weekday!][locale];
    return isFr ? `Chaque ${wd}` : `Every ${wd}`;
  }
  if (config.rule === 'LAST_DAY_OF_PERIOD') {
    return isFr ? `Le dernier jour de chaque ${period}` : `The last day of every ${period}`;
  }
  const anchor = frequencyHasAnchorMonth(config.frequency)
    ? (isFr ? ` (mois ${config.anchorMonth} du ${period})` : ` (month ${config.anchorMonth} of the ${period})`)
    : ` ${isFr ? `de chaque ${period}` : `of every ${period}`}`;
  if (config.rule === 'NTH_WEEKDAY') {
    const ord = ORDINAL_LABEL[config.ordinal!][locale];
    const wd = WEEKDAY_LABEL[config.nthWeekday!][locale];
    return isFr ? `Le ${ord} ${wd}${anchor}` : `The ${ord} ${wd}${anchor}`;
  }
  return isFr ? `Le ${config.dayOfMonth}${anchor}` : `Day ${config.dayOfMonth}${anchor}`;
}

/**
 * Transitions pures de la config (cascade UI) — chaque changement réinitialise
 * systématiquement les sous-champs devenus non pertinents (jamais de valeur
 * résiduelle), à l'image des `apply*` de `tontine-frequency.ts`. Utilisées par
 * `MeetingScheduleFields` — la logique ne vit pas dans le composant.
 */
export function applyMeetingFrequency(frequency: MeetingFrequency | undefined): Partial<MeetingScheduleConfig> {
  return frequency ? { frequency } : {};
}
export function applyMeetingWeekday(current: Partial<MeetingScheduleConfig>, weekday: Weekday | undefined): Partial<MeetingScheduleConfig> {
  return { frequency: current.frequency, weekday };
}
export function applyMeetingRule(current: Partial<MeetingScheduleConfig>, rule: MeetingRecurrenceRule | undefined): Partial<MeetingScheduleConfig> {
  return { frequency: current.frequency, rule };
}
export function applyMeetingAnchorMonth(current: Partial<MeetingScheduleConfig>, anchorMonth: number | undefined): Partial<MeetingScheduleConfig> {
  return { frequency: current.frequency, rule: current.rule, anchorMonth };
}
export function applyMeetingDayOfMonth(current: Partial<MeetingScheduleConfig>, dayOfMonth: number | undefined): Partial<MeetingScheduleConfig> {
  return { frequency: current.frequency, rule: 'DAY_OF_MONTH', anchorMonth: current.anchorMonth, dayOfMonth };
}
export function applyMeetingOrdinal(current: Partial<MeetingScheduleConfig>, ordinal: Ordinal | undefined): Partial<MeetingScheduleConfig> {
  return { frequency: current.frequency, rule: 'NTH_WEEKDAY', anchorMonth: current.anchorMonth, ordinal };
}
export function applyMeetingNthWeekday(current: Partial<MeetingScheduleConfig>, nthWeekday: Weekday | undefined): Partial<MeetingScheduleConfig> {
  return { frequency: current.frequency, rule: 'NTH_WEEKDAY', anchorMonth: current.anchorMonth, ordinal: current.ordinal, nthWeekday };
}

/** Id synthétique STABLE d'une réunion générée : encode l'exercice (donc le tenant) → isolation §12. */
export function fiscalMeetingId(fiscalYearId: string, isoDate: string): string {
  return `MTG-${fiscalYearId}-${isoDate.replace(/-/g, '')}`;
}
/** Extrait `fiscalYearId` + date ISO d'un id synthétique, ou `null` si la forme ne correspond pas. */
export function parseFiscalMeetingId(meetingId: string): { fiscalYearId: string; date: string } | null {
  const match = /^MTG-(.+)-(\d{4})(\d{2})(\d{2})$/.exec(meetingId);
  if (!match) return null;
  return { fiscalYearId: match[1], date: `${match[2]}-${match[3]}-${match[4]}` };
}
