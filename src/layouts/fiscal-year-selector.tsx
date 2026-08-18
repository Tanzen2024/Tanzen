import { useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { useFiscalYear } from '@/contexts/fiscal-year-context';
import { useLocale } from '@/contexts/locale-context';
import { useClickOutside } from '@/hooks/use-click-outside';
import type { FiscalYearStatus } from '@/mocks/settings/fiscal-years';

const STATUS_DOT: Record<FiscalYearStatus, string> = { open: 'bg-emerald-500', closed: 'bg-slate-400', upcoming: 'bg-blue-500' };

/**
 * Sélecteur global d'exercice fiscal — mandat "UX CONTEXT + FISCAL YEAR
 * OPENING / TRANSFER". Ne s'affiche PAS du tout sans `fiscalYears.read`
 * (§5 du mandat : un utilisateur sans cette permission ne doit même pas
 * pouvoir consulter/sélectionner). La liste vient exclusivement de
 * `useFiscalYear()` (déjà tenant-scopée côté service) — aucune valeur codée
 * en dur (§4 du mandat).
 */
export function FiscalYearSelector({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  const { fiscalYears, selectedFiscalYear, selectFiscalYear, canRead, isLoading } = useFiscalYear();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside([ref], () => setOpen(false), open);

  if (!canRead || isLoading || !selectedFiscalYear) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('shell', 'fiscalYearSelector')}
        className={`flex w-full items-center gap-2.5 rounded-lg border text-left transition-colors ${compact ? 'border-white/10 bg-white/5 p-2 hover:bg-white/10' : 'border-input bg-card px-3 py-2 text-foreground hover:bg-muted'}`}
      >
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 ${compact ? 'text-primary' : 'text-primary'}`}><CalendarDays size={15} /></span>
        <span className={`min-w-0 flex-1 ${compact ? 'text-white' : ''}`}>
          <span className={`block truncate text-[10px] ${compact ? 'text-slate-400' : 'text-muted-foreground'}`}>{t('shell', 'currentFiscalYearLabel')}</span>
          <span className="block truncate text-xs font-semibold">{selectedFiscalYear.label}{selectedFiscalYear.isCurrent && <span className="ml-1 font-normal text-emerald-500">· {t('shell', 'fiscalYearCurrentBadge')}</span>}</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${compact ? 'text-slate-400' : 'text-muted-foreground'} ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" aria-label={t('shell', 'fiscalYearSelector')} className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
          {fiscalYears.map((year) => (
            <button
              key={year.id}
              type="button"
              role="option"
              aria-selected={year.id === selectedFiscalYear.id}
              onClick={() => { selectFiscalYear(year.id); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted ${year.id === selectedFiscalYear.id ? 'bg-muted/70 font-semibold' : ''}`}
            >
              <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[year.status]}`} />
              <span className="min-w-0 flex-1 truncate">{year.label}</span>
              {year.isCurrent && <span className="shrink-0 text-[10px] font-semibold text-emerald-600">{t('shell', 'fiscalYearCurrentBadge')}</span>}
              {year.id === selectedFiscalYear.id && <Check size={14} className="shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
