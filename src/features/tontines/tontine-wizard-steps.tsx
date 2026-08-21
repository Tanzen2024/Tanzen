/**
 * Indicateur d'étapes du parcours de création guidé (mandat assistant UX) :
 * Tontine → Période → Adhérents → Occurrences. Purement explicatif — pas de
 * navigation cliquable, pas d'état persistant (§16 : « ne doit pas devenir
 * une navigation complexe »). Affiché uniquement pendant la mise en place
 * initiale (TontineCreate, PeriodCreate, l'écran d'affectation, et
 * PeriodDetail tant qu'aucune Occurrence n'existe encore) — jamais sur les
 * écrans de gestion courante déjà en service depuis longtemps.
 */
import { Check } from 'lucide-react';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

const STEPS = [
  { step: 1, labelKey: 'wizardStepTontine', subLabelKey: 'wizardStepTontineSub' },
  { step: 2, labelKey: 'wizardStepPeriod', subLabelKey: 'wizardStepPeriodSub' },
  { step: 3, labelKey: 'wizardStepAdhesions', subLabelKey: 'wizardStepAdhesionsSub' },
  { step: 4, labelKey: 'wizardStepOccurrences', subLabelKey: 'wizardStepOccurrencesSub' },
] as const;

export function TontineWizardSteps({ t, current }: { t: T; current: 1 | 2 | 3 | 4 }) {
  return <ol className="flex flex-wrap items-start gap-x-1 gap-y-3 text-xs">
    {STEPS.map(({ step, labelKey, subLabelKey }, index) => {
      const done = step < current;
      const active = step === current;
      return <li key={step} className="flex items-start gap-2">
        <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${done ? 'bg-primary text-primary-foreground' : active ? 'border-2 border-primary text-primary' : 'bg-muted text-muted-foreground'}`}>
          {done ? <Check size={13} /> : step}
        </span>
        <span className="flex flex-col leading-tight">
          <span className={active ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground'}>{t('tontines', labelKey)}</span>
          <span className="text-[11px] text-muted-foreground">{t('tontines', subLabelKey)}</span>
        </span>
        {index < STEPS.length - 1 && <span aria-hidden="true" className="mx-2 mt-3 h-px w-6 shrink-0 bg-border sm:w-10" />}
      </li>;
    })}
  </ol>;
}
