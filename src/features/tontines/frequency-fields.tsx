/**
 * Sélecteur de périodicité de la Tontine (mandat fréquence, puis mandat
 * cascade UX) — configuration permanente de la Tontine, jamais d'une
 * Occurrence ni de l'ancien Cycle. Rendu strictement progressif : un champ
 * dépendant n'apparaît qu'une fois le champ précédent renseigné, jamais
 * plusieurs champs dépendants simultanément vides (mandat cascade UX
 * §"RÈGLE GÉNÉRALE"). Toute la logique de réinitialisation « pas de valeur
 * résiduelle » vit dans les fonctions pures `apply*` de `tontine-frequency.ts`
 * (§9 du mandat : ne pas dupliquer la logique métier dans le composant).
 */
import {
  WEEKDAYS, ORDINALS, QUARTER_MONTHS, formatFrequencyDescription, validateFrequency,
  applyWeekday, applyMonthlyRule, applyMonthlyDayOfMonth, applyMonthlyOrdinal, applyMonthlyWeekday,
  applyQuarterlyRule, applyQuarterlyMonth, applyQuarterlyDayOfMonth, applyQuarterlyOrdinal, applyQuarterlyWeekday,
  type FrequencyConfig, type TontineFrequency, type Weekday, type MonthlyRule, type Ordinal, type QuarterlyRule, type QuarterMonth,
} from '@/mocks/tontines/tontine-frequency';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FieldError } from '@/components';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const WEEKDAY_KEY: Record<Weekday, string> = { MONDAY: 'weekdayMonday', TUESDAY: 'weekdayTuesday', WEDNESDAY: 'weekdayWednesday', THURSDAY: 'weekdayThursday', FRIDAY: 'weekdayFriday', SATURDAY: 'weekdaySaturday', SUNDAY: 'weekdaySunday' };
const ORDINAL_KEY: Record<Ordinal, string> = { FIRST: 'ordinalFirst', SECOND: 'ordinalSecond', THIRD: 'ordinalThird', FOURTH: 'ordinalFourth', LAST: 'ordinalLast' };
const QUARTER_MONTH_KEY: Record<QuarterMonth, string> = { 1: 'quarterMonthFirst', 2: 'quarterMonthSecond', 3: 'quarterMonthThird' };
const selectClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

export function FrequencyFields({ t, value, onChange, error }: { t: T; value: Partial<FrequencyConfig>; onChange: (next: Partial<FrequencyConfig>) => void; error?: string }) {
  /**
   * Jamais de valeur par défaut implicite ici (contrairement à l'ancienne
   * version qui utilisait `?? 'DAY_OF_MONTH'`) : un `<select>` de règle
   * pré-rempli sans interaction réelle de l'utilisateur cassait la cascade
   * en révélant son champ dépendant avant tout choix explicite (mandat
   * cascade UX §13, cas rapporté). La règle reste `undefined` tant que
   * l'utilisateur n'a pas cliqué une option.
   */
  const monthlyRule = value.monthlyRule;
  const quarterlyRule = value.quarterlyRule;
  const isComplete = !validateFrequency(t, value);

  const setFrequency = (frequency: TontineFrequency | '') => onChange(frequency ? { frequency } : {});
  const setWeekday = (weekday: Weekday | '') => onChange(applyWeekday(value, weekday || undefined));
  const setMonthlyRule = (rule: MonthlyRule) => onChange(applyMonthlyRule(value, rule));
  const setMonthlyDayOfMonth = (n: number) => onChange(applyMonthlyDayOfMonth(value, n || undefined));
  const setMonthlyOrdinal = (ordinal: Ordinal | '') => onChange(applyMonthlyOrdinal(value, ordinal || undefined));
  const setMonthlyWeekday = (weekday: Weekday | '') => onChange(applyMonthlyWeekday(value, weekday || undefined));
  const setQuarterlyRule = (rule: QuarterlyRule) => onChange(applyQuarterlyRule(value, rule));
  const setQuarterlyMonth = (month: QuarterMonth | '') => onChange(applyQuarterlyMonth(value, month || undefined));
  const setQuarterlyDayOfMonth = (n: number) => onChange(applyQuarterlyDayOfMonth(value, n || undefined));
  const setQuarterlyOrdinal = (ordinal: Ordinal | '') => onChange(applyQuarterlyOrdinal(value, ordinal || undefined));
  const setQuarterlyWeekday = (weekday: Weekday | '') => onChange(applyQuarterlyWeekday(value, weekday || undefined));

  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Étape 1 — toujours affichée en premier, seul champ visible tant qu'aucune fréquence n'est choisie. */}
      <div className="space-y-2">
        <Label htmlFor="tontine-frequency">{t('tontines', 'frequency')}</Label>
        <select id="tontine-frequency" value={value.frequency ?? ''} onChange={(event) => setFrequency(event.target.value as TontineFrequency | '')} className={selectClass}>
          <option value="">{t('tontines', 'selectFrequency')}</option>
          <option value="DAILY">{t('tontines', 'frequencyDaily')}</option>
          <option value="WEEKLY">{t('tontines', 'frequencyWeekly')}</option>
          <option value="MONTHLY">{t('tontines', 'frequencyMonthly')}</option>
          <option value="QUARTERLY">{t('tontines', 'frequencyQuarterly')}</option>
        </select>
      </div>

      {/* DAILY : aucun champ dépendant — l'aperçu suit directement. */}

      {/* WEEKLY : une seule étape après la fréquence. */}
      {value.frequency === 'WEEKLY' && <div className="space-y-2">
        <Label htmlFor="tontine-weekday">{t('tontines', 'weekdayLabel')}</Label>
        <select id="tontine-weekday" value={value.weekday ?? ''} onChange={(event) => setWeekday(event.target.value as Weekday | '')} className={selectClass}>
          <option value="">{t('tontines', 'selectWeekday')}</option>
          {WEEKDAYS.map((weekday) => <option key={weekday} value={weekday}>{t('tontines', WEEKDAY_KEY[weekday])}</option>)}
        </select>
      </div>}

      {/* MONTHLY — étape 2 : la règle. Rien d'autre tant qu'elle n'est pas choisie. */}
      {value.frequency === 'MONTHLY' && <div className="space-y-2">
        <Label htmlFor="tontine-monthly-rule">{t('tontines', 'monthlyRuleLabel')}</Label>
        <select id="tontine-monthly-rule" value={monthlyRule ?? ''} onChange={(event) => setMonthlyRule(event.target.value as MonthlyRule)} className={selectClass}>
          <option value="">{t('tontines', 'selectRule')}</option>
          <option value="DAY_OF_MONTH">{t('tontines', 'ruleDayOfMonth')}</option>
          <option value="NTH_WEEKDAY">{t('tontines', 'ruleNthWeekday')}</option>
        </select>
      </div>}
      {/* MONTHLY + Jour du mois — étape 3, unique. */}
      {monthlyRule === 'DAY_OF_MONTH' && <div className="space-y-2">
        <Label htmlFor="tontine-monthly-day">{t('tontines', 'dayOfMonthLabel')}</Label>
        <Input id="tontine-monthly-day" type="number" min={1} max={31} value={value.monthlyDayOfMonth ?? ''} onChange={(event) => setMonthlyDayOfMonth(Number(event.target.value))} />
      </div>}
      {/* MONTHLY + Jour de semaine — étape 3 : l'ordre d'abord. */}
      {monthlyRule === 'NTH_WEEKDAY' && <div className="space-y-2">
        <Label htmlFor="tontine-monthly-ordinal">{t('tontines', 'ordinalLabel')}</Label>
        <select id="tontine-monthly-ordinal" value={value.monthlyOrdinal ?? ''} onChange={(event) => setMonthlyOrdinal(event.target.value as Ordinal | '')} className={selectClass}>
          <option value="">{t('tontines', 'selectOrdinal')}</option>
          {ORDINALS.map((ordinal) => <option key={ordinal} value={ordinal}>{t('tontines', ORDINAL_KEY[ordinal])}</option>)}
        </select>
      </div>}
      {/* MONTHLY + Jour de semaine — étape 4 : le jour, seulement après l'ordre. */}
      {monthlyRule === 'NTH_WEEKDAY' && value.monthlyOrdinal && <div className="space-y-2">
        <Label htmlFor="tontine-monthly-weekday">{t('tontines', 'weekdayLabel')}</Label>
        <select id="tontine-monthly-weekday" value={value.monthlyWeekday ?? ''} onChange={(event) => setMonthlyWeekday(event.target.value as Weekday | '')} className={selectClass}>
          <option value="">{t('tontines', 'selectWeekday')}</option>
          {WEEKDAYS.map((weekday) => <option key={weekday} value={weekday}>{t('tontines', WEEKDAY_KEY[weekday])}</option>)}
        </select>
      </div>}

      {/* QUARTERLY — étape 2 : la règle. */}
      {value.frequency === 'QUARTERLY' && <div className="space-y-2">
        <Label htmlFor="tontine-quarterly-rule">{t('tontines', 'quarterlyRuleLabel')}</Label>
        <select id="tontine-quarterly-rule" value={quarterlyRule ?? ''} onChange={(event) => setQuarterlyRule(event.target.value as QuarterlyRule)} className={selectClass}>
          <option value="">{t('tontines', 'selectRule')}</option>
          <option value="DAY_OF_MONTH">{t('tontines', 'ruleFixedDay')}</option>
          <option value="NTH_WEEKDAY">{t('tontines', 'ruleNthWeekday')}</option>
        </select>
      </div>}
      {/* QUARTERLY — étape 3 : le mois du trimestre, commun aux deux règles, seulement après la règle. */}
      {quarterlyRule && <div className="space-y-2">
        <Label htmlFor="tontine-quarterly-month">{t('tontines', 'quarterMonthLabel')}</Label>
        <select id="tontine-quarterly-month" value={value.quarterlyMonth ?? ''} onChange={(event) => setQuarterlyMonth(event.target.value ? (Number(event.target.value) as QuarterMonth) : '')} className={selectClass}>
          <option value="">{t('tontines', 'selectQuarterMonth')}</option>
          {QUARTER_MONTHS.map((month) => <option key={month} value={month}>{t('tontines', QUARTER_MONTH_KEY[month])}</option>)}
        </select>
      </div>}
      {/* QUARTERLY + Jour fixe — étape 4, unique : le jour, seulement après le mois. */}
      {quarterlyRule === 'DAY_OF_MONTH' && value.quarterlyMonth && <div className="space-y-2">
        <Label htmlFor="tontine-quarterly-day">{t('tontines', 'dayOfMonthLabel')}</Label>
        <Input id="tontine-quarterly-day" type="number" min={1} max={31} value={value.quarterlyDayOfMonth ?? ''} onChange={(event) => setQuarterlyDayOfMonth(Number(event.target.value))} />
      </div>}
      {/* QUARTERLY + Jour de semaine — étape 4 : l'ordre, seulement après le mois. */}
      {quarterlyRule === 'NTH_WEEKDAY' && value.quarterlyMonth && <div className="space-y-2">
        <Label htmlFor="tontine-quarterly-ordinal">{t('tontines', 'ordinalLabel')}</Label>
        <select id="tontine-quarterly-ordinal" value={value.quarterlyOrdinal ?? ''} onChange={(event) => setQuarterlyOrdinal(event.target.value as Ordinal | '')} className={selectClass}>
          <option value="">{t('tontines', 'selectOrdinal')}</option>
          {ORDINALS.map((ordinal) => <option key={ordinal} value={ordinal}>{t('tontines', ORDINAL_KEY[ordinal])}</option>)}
        </select>
      </div>}
      {/* QUARTERLY + Jour de semaine — étape 5 : le jour, seulement après l'ordre. */}
      {quarterlyRule === 'NTH_WEEKDAY' && value.quarterlyMonth && value.quarterlyOrdinal && <div className="space-y-2">
        <Label htmlFor="tontine-quarterly-weekday">{t('tontines', 'weekdayLabel')}</Label>
        <select id="tontine-quarterly-weekday" value={value.quarterlyWeekday ?? ''} onChange={(event) => setQuarterlyWeekday(event.target.value as Weekday | '')} className={selectClass}>
          <option value="">{t('tontines', 'selectWeekday')}</option>
          {WEEKDAYS.map((weekday) => <option key={weekday} value={weekday}>{t('tontines', WEEKDAY_KEY[weekday])}</option>)}
        </select>
      </div>}
    </div>
    {/* Aperçu : uniquement lorsque la configuration est complète pour le scénario choisi (§11 du mandat), jamais de phrase dupliquée manuellement. */}
    {isComplete && <p className="text-xs text-muted-foreground">{t('tontines', 'frequencyPreviewLabel')} : {formatFrequencyDescription(value as FrequencyConfig, 'fr')}</p>}
    <FieldError message={error} />
  </div>;
}
