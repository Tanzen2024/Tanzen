/**
 * Configuration de récurrence des SÉANCES d'un Exercice fiscal.
 *
 * Portée par `FiscalYear.sessionSchedule` (`src/mocks/settings/fiscal-years.ts`),
 * elle sert UNIQUEMENT à PRÉ-REMPLIR (suggestion) la date de la prochaine
 * séance — exactement comme `tontine-frequency.ts` pour les Tours de Tontine.
 * Ce module ne génère JAMAIS un calendrier complet : `createSession` (`fiscal-session.service.ts`) reste
 * toujours un acte manuel, unitaire, progressif — aucune génération en masse
 * de dates futures.
 *
 * Ne réimplémente aucun calcul de date calendaire : bâtit directement sur les
 * primitives neutres de `src/lib/recurrence.ts`, les mêmes que
 * `mocks/tontines/tontine-frequency.ts` (`suggestNextOccurrenceDate`) — aucun
 * second moteur de récurrence.
 */
import {
  computeDayOfMonthDate,
  computeNthWeekdayDate,
  daysInMonth,
  toISODate,
  splitYearMonth,
  WEEKDAY_INDEX,
  type Weekday,
  type Ordinal,
} from '@/lib/recurrence';

export type { Weekday, Ordinal } from '@/lib/recurrence';
export { WEEKDAYS, ORDINALS } from '@/lib/recurrence';

/** Les 6 fréquences supportées. ANNUAL n'est jamais dédoublée. */
export type SessionFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
/** Règles de récurrence. `LAST_DAY_OF_PERIOD` = dernier jour calendaire de la période. */
export type SessionRecurrenceRule = 'DAY_OF_MONTH' | 'NTH_WEEKDAY' | 'LAST_DAY_OF_PERIOD';

export type SessionScheduleConfig = {
  frequency: SessionFrequency;
  /** WEEKLY uniquement. */
  weekday?: Weekday;
  /** MONTHLY / QUARTERLY / SEMIANNUAL / ANNUAL. */
  rule?: SessionRecurrenceRule;
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

export const SESSION_FREQUENCIES: SessionFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];
export const SESSION_RECURRENCE_RULES: SessionRecurrenceRule[] = ['DAY_OF_MONTH', 'NTH_WEEKDAY', 'LAST_DAY_OF_PERIOD'];

/** Une fréquence porte une règle de période (donc un mois d'ancrage éventuel). DAILY/WEEKLY non. */
export function frequencyHasRule(frequency: SessionFrequency | undefined): boolean {
  return frequency === 'MONTHLY' || frequency === 'QUARTERLY' || frequency === 'SEMIANNUAL' || frequency === 'ANNUAL';
}
/** MONTHLY : la période EST le mois, aucun mois d'ancrage à choisir. */
export function frequencyHasAnchorMonth(frequency: SessionFrequency | undefined): boolean {
  return frequency === 'QUARTERLY' || frequency === 'SEMIANNUAL' || frequency === 'ANNUAL';
}
/** Nombre de mois par période — sert de borne au sélecteur « mois d'ancrage ». */
export function anchorMonthCount(frequency: SessionFrequency | undefined): number {
  if (frequency === 'QUARTERLY') return 3;
  if (frequency === 'SEMIANNUAL') return 6;
  if (frequency === 'ANNUAL') return 12;
  return 0;
}

/** Mois du calendrier occupé par CETTE période (1 pour MONTHLY, 3/6/12 pour QUARTERLY/SEMIANNUAL/ANNUAL). */
function periodMonths(frequency: SessionFrequency): number {
  if (frequency === 'QUARTERLY') return 3;
  if (frequency === 'SEMIANNUAL') return 6;
  if (frequency === 'ANNUAL') return 12;
  return 1;
}

function lastDayOfMonthISO(year: number, month: number): string { return toISODate(year, month, daysInMonth(year, month)); }

/** Applique la règle (`DAY_OF_MONTH` / `NTH_WEEKDAY` / `LAST_DAY_OF_PERIOD`) à un mois donné → date ISO ou `null`. */
function applyRuleToMonth(year: number, month: number, config: SessionScheduleConfig): string | null {
  if (config.rule === 'LAST_DAY_OF_PERIOD') return lastDayOfMonthISO(year, month);
  if (config.rule === 'NTH_WEEKDAY') return computeNthWeekdayDate(year, month, config.ordinal, config.nthWeekday);
  if (config.rule === 'DAY_OF_MONTH') return computeDayOfMonthDate(year, month, config.dayOfMonth);
  return null;
}

/** Prédicat pur — une config complète pour son scénario. Réutilisé par le service ET l'UI. */
export function isValidSessionScheduleConfig(value: Partial<SessionScheduleConfig> | undefined | null): value is SessionScheduleConfig {
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

/**
 * Suggère UNE SEULE date (jamais un tableau) : la prochaine occurrence de la
 * fréquence configurée, strictement après `afterDate`, et — si `periodEnd`
 * est fourni — jamais au-delà (`null` dans ce cas : « plus aucune séance
 * prévue dans cet exercice selon la fréquence », jamais une séance créée hors
 * période). Pure suggestion pré-remplie côté UI — « Ajouter une séance » reste
 * un acte manuel unique, jamais une génération en masse.
 *
 * `afterDate` est la date de la dernière Séance déjà créée, OU `startDate` de
 * l'exercice quand aucune Séance n'existe encore (Séance 0) — dans ce second
 * cas la période EN COURS reste éligible : si la règle tombe encore à
 * `afterDate` ou après dans le mois/trimestre/semestre/année de `afterDate`,
 * c'est elle la réponse (même principe que `suggestNextOccurrenceDate` des
 * Tontines, à ceci près qu'ici `afterDate` INCLUS est éligible — la première
 * séance peut légitimement tomber le jour même du début d'exercice).
 */
export function suggestNextSessionDate(config: Partial<SessionScheduleConfig>, afterDate: string, periodEnd?: string): string | null {
  if (!isValidSessionScheduleConfig(config)) return null;
  const inBounds = (candidate: string | null): string | null => {
    if (!candidate) return null;
    if (periodEnd && candidate > periodEnd) return null;
    return candidate;
  };

  if (config.frequency === 'DAILY') {
    return inBounds(afterDate);
  }
  if (config.frequency === 'WEEKLY') {
    const targetIndex = WEEKDAY_INDEX[config.weekday!];
    const cursor = new Date(`${afterDate}T00:00:00Z`);
    for (let i = 0; i < 7; i += 1) {
      if (cursor.getUTCDay() === targetIndex) return inBounds(toISODate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return null;
  }

  // MONTHLY / QUARTERLY / SEMIANNUAL / ANNUAL — un seul parcours unifié : on avance
  // période par période (1/3/6/12 mois) jusqu'à trouver la première date >= afterDate.
  const months = periodMonths(config.frequency);
  const [afterYear, afterMonth] = splitYearMonth(afterDate);
  let cursorYear = afterYear;
  let cursorMonthStart = Math.floor((afterMonth - 1) / months) * months + 1;
  const MAX_PERIODS = 400;
  for (let i = 0; i < MAX_PERIODS; i += 1) {
    const anchor = config.rule === 'LAST_DAY_OF_PERIOD' ? months : (config.anchorMonth ?? 1);
    const targetMonth = cursorMonthStart + anchor - 1;
    const candidate = applyRuleToMonth(cursorYear, targetMonth, config as SessionScheduleConfig);
    if (candidate && candidate >= afterDate) return inBounds(candidate);
    cursorMonthStart += months;
    if (cursorMonthStart > 12) { cursorMonthStart -= 12; cursorYear += 1; }
  }
  return null;
}

const WEEKDAY_LABEL: Record<Weekday, { fr: string; en: string }> = {
  MONDAY: { fr: 'lundi', en: 'Monday' }, TUESDAY: { fr: 'mardi', en: 'Tuesday' }, WEDNESDAY: { fr: 'mercredi', en: 'Wednesday' },
  THURSDAY: { fr: 'jeudi', en: 'Thursday' }, FRIDAY: { fr: 'vendredi', en: 'Friday' }, SATURDAY: { fr: 'samedi', en: 'Saturday' }, SUNDAY: { fr: 'dimanche', en: 'Sunday' },
};
const ORDINAL_LABEL: Record<Ordinal, { fr: string; en: string }> = {
  FIRST: { fr: 'premier', en: 'first' }, SECOND: { fr: 'deuxième', en: 'second' }, THIRD: { fr: 'troisième', en: 'third' }, FOURTH: { fr: 'quatrième', en: 'fourth' }, LAST: { fr: 'dernier', en: 'last' },
};
const PERIOD_LABEL: Record<SessionFrequency, { fr: string; en: string }> = {
  DAILY: { fr: 'jour', en: 'day' }, WEEKLY: { fr: 'semaine', en: 'week' }, MONTHLY: { fr: 'mois', en: 'month' },
  QUARTERLY: { fr: 'trimestre', en: 'quarter' }, SEMIANNUAL: { fr: 'semestre', en: 'half-year' }, ANNUAL: { fr: 'année', en: 'year' },
};
const FREQUENCY_LABEL: Record<SessionFrequency, { fr: string; en: string }> = {
  DAILY: { fr: 'Journalière', en: 'Daily' }, WEEKLY: { fr: 'Hebdomadaire', en: 'Weekly' }, MONTHLY: { fr: 'Mensuelle', en: 'Monthly' },
  QUARTERLY: { fr: 'Trimestrielle', en: 'Quarterly' }, SEMIANNUAL: { fr: 'Semestrielle', en: 'Half-yearly' }, ANNUAL: { fr: 'Annuelle', en: 'Yearly' },
};
const RULE_LABEL: Record<SessionRecurrenceRule, { fr: string; en: string }> = {
  DAY_OF_MONTH: { fr: 'Jour du mois', en: 'Day of month' }, NTH_WEEKDAY: { fr: 'Jour de semaine', en: 'Weekday' }, LAST_DAY_OF_PERIOD: { fr: 'Dernier jour de la période', en: 'Last day of the period' },
};

/** Libellés de référence — bilingues embarqués (même parti-pris que `tontine-frequency.ts`), réutilisés par `SessionScheduleFields`. */
export function sessionFrequencyLabel(frequency: SessionFrequency, locale: 'fr' | 'en' = 'fr'): string { return FREQUENCY_LABEL[frequency][locale]; }
export function sessionRuleLabel(rule: SessionRecurrenceRule, locale: 'fr' | 'en' = 'fr'): string { return RULE_LABEL[rule][locale]; }
export function sessionWeekdayLabel(weekday: Weekday, locale: 'fr' | 'en' = 'fr'): string { return WEEKDAY_LABEL[weekday][locale]; }
export function sessionOrdinalLabel(ordinal: Ordinal, locale: 'fr' | 'en' = 'fr'): string { return ORDINAL_LABEL[ordinal][locale]; }

/** Description humaine de la règle — bilingue embarqué (même parti-pris que `tontine-frequency.ts`). */
export function formatSessionScheduleDescription(config: Partial<SessionScheduleConfig> | undefined | null, locale: 'fr' | 'en' = 'fr'): string {
  const isFr = locale === 'fr';
  if (!isValidSessionScheduleConfig(config)) return isFr ? 'Configuration incomplète' : 'Incomplete configuration';
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
 * Transitions pures de la config (cascade UX) — chaque changement réinitialise
 * systématiquement les sous-champs devenus non pertinents (jamais de valeur
 * résiduelle), à l'image des `apply*` de `tontine-frequency.ts`. Utilisées par
 * `SessionScheduleFields` — la logique ne vit pas dans le composant.
 */
export function applySessionFrequency(frequency: SessionFrequency | undefined): Partial<SessionScheduleConfig> {
  return frequency ? { frequency } : {};
}
export function applySessionWeekday(current: Partial<SessionScheduleConfig>, weekday: Weekday | undefined): Partial<SessionScheduleConfig> {
  return { frequency: current.frequency, weekday };
}
export function applySessionRule(current: Partial<SessionScheduleConfig>, rule: SessionRecurrenceRule | undefined): Partial<SessionScheduleConfig> {
  return { frequency: current.frequency, rule };
}
export function applySessionAnchorMonth(current: Partial<SessionScheduleConfig>, anchorMonth: number | undefined): Partial<SessionScheduleConfig> {
  return { frequency: current.frequency, rule: current.rule, anchorMonth };
}
export function applySessionDayOfMonth(current: Partial<SessionScheduleConfig>, dayOfMonth: number | undefined): Partial<SessionScheduleConfig> {
  return { frequency: current.frequency, rule: 'DAY_OF_MONTH', anchorMonth: current.anchorMonth, dayOfMonth };
}
export function applySessionOrdinal(current: Partial<SessionScheduleConfig>, ordinal: Ordinal | undefined): Partial<SessionScheduleConfig> {
  return { frequency: current.frequency, rule: 'NTH_WEEKDAY', anchorMonth: current.anchorMonth, ordinal };
}
export function applySessionNthWeekday(current: Partial<SessionScheduleConfig>, nthWeekday: Weekday | undefined): Partial<SessionScheduleConfig> {
  return { frequency: current.frequency, rule: 'NTH_WEEKDAY', anchorMonth: current.anchorMonth, ordinal: current.ordinal, nthWeekday };
}
