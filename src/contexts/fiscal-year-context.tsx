import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from './tenant-context';
import { usePermissions } from './permission-context';
import { settingsService } from '@/services/settings.service';
import { queryKeys } from '@/services/query-keys';
import type { FiscalYear } from '@/mocks/settings/fiscal-years';

/**
 * Contexte global Fiscal Year — mandat "UX CONTEXT + FISCAL YEAR OPENING /
 * TRANSFER". Étend `TenantContext` plutôt que de le remplacer : le Tenant
 * reste l'unique source de vérité pour l'isolation (§3 du mandat : "changer
 * de Fiscal Year ne change JAMAIS de Tenant") — ce contexte n'ajoute qu'une
 * dimension temporelle de LECTURE/AFFICHAGE au-dessus.
 *
 * IMPORTANT (respect strict de D-FY-02) : `selectedFiscalYearId` est un état
 * de VUE côté client — il ne modifie jamais `FiscalYear.status`/`isCurrent`
 * ni aucune autre donnée. Aucune entité métier n'est automatiquement
 * FY-scoped par la seule existence de ce contexte ; les futurs domaines
 * pourront le lire (`useFiscalYear()`) sans qu'aucun `fiscalYearId` ne soit
 * ajouté ici à leurs propres mocks/types.
 */
type FiscalYearContextValue = {
  fiscalYears: FiscalYear[];
  selectedFiscalYear: FiscalYear | null;
  selectedFiscalYearId: string | null;
  /** Ne sélectionne que parmi `fiscalYears` (déjà tenant-scopé côté service) — un id d'un autre tenant est structurellement absent de cette liste. */
  selectFiscalYear: (fiscalYearId: string) => void;
  /** `fiscalYears.read` — si absente, `fiscalYears` reste vide et aucune sélection n'est possible (§5 du mandat). */
  canRead: boolean;
  isLoading: boolean;
};

const FiscalYearContext = createContext<FiscalYearContextValue | null>(null);

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const { currentTenant } = useTenant();
  const { can } = usePermissions();
  const canRead = can('fiscalYears.read');
  const { data: fiscalYears = [], isLoading } = useQuery({
    queryKey: queryKeys.settings.fiscalYears(currentTenant.id),
    queryFn: () => settingsService.listFiscalYears(currentTenant.id),
    enabled: canRead,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Réinitialise sur la valeur "exercice courant" (isCurrent) dès que la liste change
  // (changement de tenant, chargement initial, ou sélection devenue invalide) — jamais
  // une sélection figée codée en dur (mandat §4 : "NE PAS coder en dur 2024/2025/2026/2027").
  useEffect(() => {
    if (fiscalYears.length === 0) { setSelectedId(null); return; }
    const stillValid = fiscalYears.some((year) => year.id === selectedId);
    if (!stillValid) {
      const current = fiscalYears.find((year) => year.isCurrent);
      setSelectedId(current?.id ?? fiscalYears[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYears, currentTenant.id]);

  const value = useMemo<FiscalYearContextValue>(() => ({
    fiscalYears,
    selectedFiscalYear: fiscalYears.find((year) => year.id === selectedId) ?? null,
    selectedFiscalYearId: selectedId,
    selectFiscalYear: (fiscalYearId: string) => {
      // Sélectionner un FY est un pur changement de vue : ne touche jamais status/isCurrent (§7 du mandat).
      if (fiscalYears.some((year) => year.id === fiscalYearId)) setSelectedId(fiscalYearId);
    },
    canRead,
    isLoading,
  }), [fiscalYears, selectedId, canRead, isLoading]);

  return <FiscalYearContext.Provider value={value}>{children}</FiscalYearContext.Provider>;
}

export function useFiscalYear() {
  const context = useContext(FiscalYearContext);
  if (!context) throw new Error('useFiscalYear must be used inside FiscalYearProvider');
  return context;
}
