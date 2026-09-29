import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Check, ChevronDown, Settings2 } from 'lucide-react';
import { useFiscalYear } from '@/contexts/fiscal-year-context';
import { useLocale } from '@/contexts/locale-context';
import { usePermissions } from '@/contexts/permission-context';
import { useClickOutside } from '@/hooks/use-click-outside';
import { fiscalYearLabel, fiscalYearStatus } from '@/mocks/settings/fiscal-years';
import { FISCAL_YEAR_STATUS_KEY, FISCAL_YEAR_STATUS_TEXT } from '@/features/settings/fiscal-year-status';

/** Accueil du module Caisse. Plus une destination imposée : depuis le 2026-09-27, changer d'exercice laisse l'utilisateur sur sa page. */
export const CASHBOX_HOME_PATH = '/finance/treasury';

/**
 * Sélecteur global d'exercice fiscal (header) — SEUL moyen de naviguer entre
 * les exercices (mandat « Caisse + exercice fiscal contexte global »). Liste
 * tous les exercices du tenant courant (`useFiscalYear()`, tenant-scopé) avec
 * leur statut métier calculé (`fiscalYearStatus`). Sélectionner un exercice
 * met à jour le contexte global (source de vérité unique) SANS redirection
 * (décision du 2026-09-27) : la page courante se recalcule dans le nouvel exercice.
 * L'administration des exercices (création, clôture, séances) reste
 * exclusivement dans Paramètres → Exercices fiscaux : ce composant n'y mène
 * que par un lien. Masqué sans `fiscalYears.read`.
 */
export function FiscalYearSelector({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const { fiscalYears, currentFiscalYear, selectFiscalYear, canRead, isLoading } = useFiscalYear();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside([ref], () => setOpen(false), open);

  if (!canRead || isLoading || !currentFiscalYear) return null;
  const currentStatus = fiscalYearStatus(currentFiscalYear);

  const choose = (fiscalYearId: string) => {
    setOpen(false);
    selectFiscalYear(fiscalYearId);
  };

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
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays size={15} /></span>
        <span className={`min-w-0 flex-1 ${compact ? 'text-white' : ''}`}>
          <span className={`block truncate text-[10px] ${compact ? 'text-slate-400' : 'text-muted-foreground'}`}>{t('shell', 'currentFiscalYearLabel')}</span>
          <span className="block truncate text-xs font-semibold" data-testid="current-fiscal-year">
            {fiscalYearLabel(currentFiscalYear)}
            {' '}<span className={`font-normal ${compact ? 'text-slate-300' : FISCAL_YEAR_STATUS_TEXT[currentStatus]}`}>· {t('settings', FISCAL_YEAR_STATUS_KEY[currentStatus])}</span>
          </span>
        </span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${compact ? 'text-slate-400' : 'text-muted-foreground'} ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" aria-label={t('shell', 'fiscalYearSelector')} className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
          {fiscalYears.map((year) => {
            const status = fiscalYearStatus(year);
            const selected = year.id === currentFiscalYear.id;
            return (
              <button
                key={year.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => choose(year.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted ${selected ? 'bg-muted/70 font-semibold' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">{fiscalYearLabel(year)}</span>
                <span className={`shrink-0 text-[11px] font-medium ${FISCAL_YEAR_STATUS_TEXT[status]}`}>{t('settings', FISCAL_YEAR_STATUS_KEY[status])}</span>
                <span className="grid w-3.5 shrink-0 place-items-center">{selected && <Check size={14} className="text-primary" />}</span>
              </button>
            );
          })}
          {can('settings.read') && <>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => { setOpen(false); navigate('/settings/fiscal-years'); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Settings2 size={13} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t('shell', 'manageFiscalYears')}</span>
            </button>
          </>}
        </div>
      )}
    </div>
  );
}
