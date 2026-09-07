/**
 * Sélecteur de récurrence des RÉUNIONS d'un Exercice fiscal (mandat « RÈGLE
 * CENTRALE — DATES DE RÉUNION » §2/§3). Même parti-pris que `FrequencyFields`
 * (Tontine) : rendu strictement progressif — un champ dépendant n'apparaît
 * qu'une fois le précédent renseigné — et TOUTE la logique de transition
 * (« pas de valeur résiduelle ») vit dans les fonctions pures `applyMeeting*`
 * de `@/mocks/settings/meeting-schedule`, jamais dans ce composant.
 *
 * Ce composant ne réimplémente aucun moteur de récurrence : `meeting-schedule`
 * délègue à `generateOccurrenceDates` (moteur Tontine) pour DAILY/WEEKLY/
 * MONTHLY/QUARTERLY et n'étend que SEMIANNUAL/ANNUAL + « dernier jour de la
 * période ».
 */
import {
  MEETING_FREQUENCIES,
  MEETING_RECURRENCE_RULES,
  WEEKDAYS,
  ORDINALS,
  frequencyHasRule,
  frequencyHasAnchorMonth,
  anchorMonthCount,
  isValidMeetingScheduleConfig,
  formatMeetingScheduleDescription,
  meetingFrequencyLabel,
  meetingRuleLabel,
  meetingWeekdayLabel,
  meetingOrdinalLabel,
  applyMeetingFrequency,
  applyMeetingWeekday,
  applyMeetingRule,
  applyMeetingAnchorMonth,
  applyMeetingDayOfMonth,
  applyMeetingOrdinal,
  applyMeetingNthWeekday,
  type MeetingScheduleConfig,
  type MeetingFrequency,
  type MeetingRecurrenceRule,
  type Weekday,
  type Ordinal,
} from '@/mocks/settings/meeting-schedule';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

type Locale = 'fr' | 'en';

function anchorMonthHint(frequency: MeetingFrequency | undefined, locale: Locale): string {
  const fr = locale === 'fr';
  if (frequency === 'QUARTERLY') return fr ? 'Mois dans le trimestre (1 à 3)' : 'Month within the quarter (1–3)';
  if (frequency === 'SEMIANNUAL') return fr ? 'Mois dans le semestre (1 à 6)' : 'Month within the half-year (1–6)';
  if (frequency === 'ANNUAL') return fr ? 'Mois de l’année (1 = janvier)' : 'Month of the year (1 = January)';
  return '';
}

export function MeetingScheduleFields({
  locale,
  value,
  onChange,
  idPrefix = 'meeting-schedule',
}: {
  locale: Locale;
  value: Partial<MeetingScheduleConfig>;
  onChange: (next: Partial<MeetingScheduleConfig>) => void;
  idPrefix?: string;
}) {
  const fr = locale === 'fr';
  const id = (suffix: string) => `${idPrefix}-${suffix}`;
  const frequency = value.frequency;
  const rule = value.rule;
  const showRule = frequencyHasRule(frequency);
  const showAnchorMonth = frequency && frequencyHasAnchorMonth(frequency) && Boolean(rule) && rule !== 'LAST_DAY_OF_PERIOD';
  const anchorReady = !showAnchorMonth || Boolean(value.anchorMonth);
  const isComplete = isValidMeetingScheduleConfig(value);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Étape 1 — fréquence, seul champ visible tant qu'elle n'est pas choisie. */}
        <div className="space-y-1">
          <Label htmlFor={id('frequency')}>{fr ? 'Fréquence des réunions' : 'Meeting frequency'} *</Label>
          <select
            id={id('frequency')}
            value={frequency ?? ''}
            onChange={(event) => onChange(applyMeetingFrequency((event.target.value || undefined) as MeetingFrequency | undefined))}
            className={selectClass}
          >
            <option value="">{fr ? 'Sélectionner une fréquence' : 'Select a frequency'}</option>
            {MEETING_FREQUENCIES.map((freq) => (
              <option key={freq} value={freq}>{meetingFrequencyLabel(freq, locale)}</option>
            ))}
          </select>
        </div>

        {/* JOURNALIÈRE : aucun champ dépendant. */}

        {/* HEBDOMADAIRE : jour de semaine. */}
        {frequency === 'WEEKLY' && (
          <div className="space-y-1">
            <Label htmlFor={id('weekday')}>{fr ? 'Jour de la semaine' : 'Day of week'}</Label>
            <select
              id={id('weekday')}
              value={value.weekday ?? ''}
              onChange={(event) => onChange(applyMeetingWeekday(value, (event.target.value || undefined) as Weekday | undefined))}
              className={selectClass}
            >
              <option value="">{fr ? 'Sélectionner un jour' : 'Select a day'}</option>
              {WEEKDAYS.map((weekday) => (
                <option key={weekday} value={weekday}>{meetingWeekdayLabel(weekday, locale)}</option>
              ))}
            </select>
          </div>
        )}

        {/* MENSUELLE / TRIMESTRIELLE / SEMESTRIELLE / ANNUELLE : la règle. */}
        {showRule && (
          <div className="space-y-1">
            <Label htmlFor={id('rule')}>{fr ? 'Règle de récurrence' : 'Recurrence rule'}</Label>
            <select
              id={id('rule')}
              value={rule ?? ''}
              onChange={(event) => onChange(applyMeetingRule(value, (event.target.value || undefined) as MeetingRecurrenceRule | undefined))}
              className={selectClass}
            >
              <option value="">{fr ? 'Sélectionner une règle' : 'Select a rule'}</option>
              {MEETING_RECURRENCE_RULES.map((recRule) => (
                <option key={recRule} value={recRule}>{meetingRuleLabel(recRule, locale)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Mois d'ancrage (TRIMESTRIELLE / SEMESTRIELLE / ANNUELLE, sauf « dernier jour »). */}
        {showAnchorMonth && (
          <div className="space-y-1">
            <Label htmlFor={id('anchor-month')}>{fr ? 'Mois d’ancrage' : 'Anchor month'}</Label>
            <select
              id={id('anchor-month')}
              value={value.anchorMonth ?? ''}
              onChange={(event) => onChange(applyMeetingAnchorMonth(value, event.target.value ? Number(event.target.value) : undefined))}
              className={selectClass}
            >
              <option value="">{fr ? 'Sélectionner un mois' : 'Select a month'}</option>
              {Array.from({ length: anchorMonthCount(frequency) }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">{anchorMonthHint(frequency, locale)}</p>
          </div>
        )}

        {/* Règle « Jour du mois » : le quantième. */}
        {showRule && rule === 'DAY_OF_MONTH' && anchorReady && (
          <div className="space-y-1">
            <Label htmlFor={id('day-of-month')}>{fr ? 'Jour du mois' : 'Day of month'}</Label>
            <Input
              id={id('day-of-month')}
              type="number"
              min={1}
              max={31}
              value={value.dayOfMonth ?? ''}
              onChange={(event) => onChange(applyMeetingDayOfMonth(value, event.target.value ? Number(event.target.value) : undefined))}
            />
            <p className="text-[11px] text-muted-foreground">{fr ? 'Un quantième absent (ex. 31 en février) est simplement ignoré ce mois-là.' : 'A missing day (e.g. the 31st in February) is simply skipped that month.'}</p>
          </div>
        )}

        {/* Règle « Jour de semaine » : l'ordre. */}
        {showRule && rule === 'NTH_WEEKDAY' && anchorReady && (
          <div className="space-y-1">
            <Label htmlFor={id('ordinal')}>{fr ? 'Ordre' : 'Order'}</Label>
            <select
              id={id('ordinal')}
              value={value.ordinal ?? ''}
              onChange={(event) => onChange(applyMeetingOrdinal(value, (event.target.value || undefined) as Ordinal | undefined))}
              className={selectClass}
            >
              <option value="">{fr ? 'Sélectionner un ordre' : 'Select an order'}</option>
              {ORDINALS.map((ordinal) => (
                <option key={ordinal} value={ordinal}>{meetingOrdinalLabel(ordinal, locale)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Règle « Jour de semaine » : le jour, seulement après l'ordre. */}
        {showRule && rule === 'NTH_WEEKDAY' && anchorReady && value.ordinal && (
          <div className="space-y-1">
            <Label htmlFor={id('nth-weekday')}>{fr ? 'Jour de la semaine' : 'Day of week'}</Label>
            <select
              id={id('nth-weekday')}
              value={value.nthWeekday ?? ''}
              onChange={(event) => onChange(applyMeetingNthWeekday(value, (event.target.value || undefined) as Weekday | undefined))}
              className={selectClass}
            >
              <option value="">{fr ? 'Sélectionner un jour' : 'Select a day'}</option>
              {WEEKDAYS.map((weekday) => (
                <option key={weekday} value={weekday}>{meetingWeekdayLabel(weekday, locale)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isComplete && (
        <p className="text-xs text-muted-foreground">
          {(fr ? 'Aperçu : ' : 'Preview: ') + formatMeetingScheduleDescription(value, locale)}
        </p>
      )}
    </div>
  );
}
