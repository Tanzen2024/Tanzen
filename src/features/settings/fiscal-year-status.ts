import type { FiscalYearStatus } from '@/mocks/settings/fiscal-years';
import type { StatusTone } from '@/types/ui';

/**
 * Présentation UNIQUE du statut métier d'un exercice (À venir / En cours /
 * Clôturé) — clés i18n de la section `settings` et tonalités, partagées par le
 * sélecteur du header et Paramètres → Exercices fiscaux. Le statut lui-même se
 * calcule exclusivement via `fiscalYearStatus()` (mocks/settings/fiscal-years).
 */
export const FISCAL_YEAR_STATUS_KEY: Record<FiscalYearStatus, string> = {
  upcoming: 'statusUpcoming',
  in_progress: 'statusInProgress',
  closed: 'statusClosed',
};

export const FISCAL_YEAR_STATUS_TONE: Record<FiscalYearStatus, StatusTone> = {
  upcoming: 'info',
  in_progress: 'success',
  closed: 'default',
};

/** Couleur du texte de statut dans le sélecteur compact du header. */
export const FISCAL_YEAR_STATUS_TEXT: Record<FiscalYearStatus, string> = {
  upcoming: 'text-blue-600 dark:text-blue-400',
  in_progress: 'text-emerald-600 dark:text-emerald-400',
  closed: 'text-muted-foreground',
};
