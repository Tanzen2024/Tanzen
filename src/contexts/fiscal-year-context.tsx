import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from './tenant-context';
import { usePermissions } from './permission-context';
import { settingsService } from '@/services/settings.service';
import { queryKeys } from '@/services/query-keys';
import { defaultFiscalYear, type FiscalYear } from '@/mocks/settings/fiscal-years';

/**
 * Contexte global Exercice fiscal — SOURCE DE VÉRITÉ UNIQUE de l'exercice
 * courant de l'application (mandat « Caisse + exercice fiscal contexte
 * global », 2026-09-25). Hiérarchie : Tenant → Exercice fiscal → Module →
 * Données. Le Tenant reste le premier contexte : la liste des exercices est
 * tenant-scopée côté service, et changer d'exercice ne change jamais de tenant.
 *
 * Aucun composant ne duplique l'exercice sélectionné : tout consommateur lit
 * `useFiscalYear()` et inclut `currentFiscalYearId` dans ses clés de requête,
 * si bien qu'un changement d'exercice ne peut jamais réafficher les données
 * de l'ancien (clé différente → nouveau chargement).
 *
 * Sélectionner un exercice est un changement de VUE : ne modifie jamais
 * l'exercice lui-même (clôture, dates…). Le choix est mémorisé par tenant
 * (`localStorage`, best effort) ; à défaut, l'exercice « En cours »
 * (`defaultFiscalYear`), sinon le plus récent.
 *
 * La redirection vers l'accueil Caisse après sélection est portée par le seul
 * point d'entrée de sélection, `FiscalYearSelector` (header).
 */
type FiscalYearContextValue = {
  fiscalYears: FiscalYear[];
  currentFiscalYear: FiscalYear | null;
  currentFiscalYearId: string | null;
  /** Ne sélectionne que parmi `fiscalYears` (déjà tenant-scopé) — un id d'un autre tenant est structurellement absent de cette liste. */
  selectFiscalYear: (fiscalYearId: string) => void;
  /** `fiscalYears.read` — si absente, `fiscalYears` reste vide et aucune sélection n'est possible. */
  canRead: boolean;
  isLoading: boolean;
};

const FiscalYearContext = createContext<FiscalYearContextValue | null>(null);

const storageKey = (tenantId: string) => `tanzen.currentFiscalYear.${tenantId}`;

function readStoredFiscalYearId(tenantId: string): string | null {
  try { return window.localStorage.getItem(storageKey(tenantId)); } catch { return null; }
}

function storeFiscalYearId(tenantId: string, fiscalYearId: string) {
  try { window.localStorage.setItem(storageKey(tenantId), fiscalYearId); } catch { /* stockage indisponible : la sélection reste valable pour la session */ }
}

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const { currentTenant } = useTenant();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const canRead = can('fiscalYears.read');
  const { data: fiscalYears = [], isLoading } = useQuery({
    queryKey: queryKeys.settings.fiscalYears(currentTenant.id),
    queryFn: () => settingsService.listFiscalYears(currentTenant.id),
    enabled: canRead,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // (Ré)initialise la sélection quand la liste change (chargement, changement de
  // tenant, exercice supprimé) : choix mémorisé du tenant s'il est encore valide,
  // sinon l'exercice en cours — jamais une année codée en dur.
  useEffect(() => {
    if (fiscalYears.length === 0) { setSelectedId(null); return; }
    if (fiscalYears.some((year) => year.id === selectedId)) return;
    const stored = readStoredFiscalYearId(currentTenant.id);
    const next = fiscalYears.find((year) => year.id === stored) ?? defaultFiscalYear(fiscalYears);
    setSelectedId(next?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYears, currentTenant.id]);

  const selectFiscalYear = useCallback((fiscalYearId: string) => {
    if (!fiscalYears.some((year) => year.id === fiscalYearId)) return;
    setSelectedId(fiscalYearId);
    storeFiscalYearId(currentTenant.id, fiscalYearId);
    // Les requêtes du nouvel exercice ont leurs propres clés ; on invalide en plus
    // tout le domaine financier pour qu'aucune donnée dérivée ne survive au changement.
    void queryClient.invalidateQueries({ queryKey: ['finance'] });
  }, [fiscalYears, currentTenant.id, queryClient]);

  const value = useMemo<FiscalYearContextValue>(() => ({
    fiscalYears,
    currentFiscalYear: fiscalYears.find((year) => year.id === selectedId) ?? null,
    currentFiscalYearId: selectedId,
    selectFiscalYear,
    canRead,
    isLoading,
  }), [fiscalYears, selectedId, selectFiscalYear, canRead, isLoading]);

  return <FiscalYearContext.Provider value={value}>{children}</FiscalYearContext.Provider>;
}

export function useFiscalYear() {
  const context = useContext(FiscalYearContext);
  if (!context) throw new Error('useFiscalYear must be used inside FiscalYearProvider');
  return context;
}
