import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { LocaleProvider } from '@/contexts/locale-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { TenantProvider } from '@/contexts/tenant-context';
import { PermissionProvider } from '@/contexts/permission-context';
import { FiscalYearProvider } from '@/contexts/fiscal-year-context';

/**
 * Reproduit l'ordre exact de `src/app/providers.tsx`
 * (QueryClientProvider > LocaleProvider > ThemeProvider > TenantProvider >
 * PermissionProvider > FiscalYearProvider), avec un `QueryClient` neuf par
 * appel pour éviter toute fuite d'état entre tests, et un `MemoryRouter`
 * pour les composants qui dépendent de `react-router-dom` (TenantBreadcrumb,
 * FiscalYearSelector, PlatformScopeGuard).
 */
/**
 * `staleTime` (optionnel, défaut 0) — la plupart des tests veulent voir un
 * refetch immédiat au remount (données toujours « stale »), mais certains
 * doivent reproduire le `staleTime: 30_000` réel de `src/app/providers.tsx`
 * pour vérifier qu'une invalidation explicite (`invalidateKeys`) est bien
 * nécessaire — sans ce réglage, une donnée fraîchement mise en cache par un
 * précédent montage ne serait PAS rafraîchie au remount suivant, masquant un
 * bug de cache qui ne se manifeste qu'en production.
 */
export function renderWithProviders(ui: ReactElement, { route = '/', staleTime = 0 }: { route?: string; staleTime?: number } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime }, mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <LocaleProvider>
            <ThemeProvider>
              <TenantProvider>
                <PermissionProvider>
                  <FiscalYearProvider>{children}</FiscalYearProvider>
                </PermissionProvider>
              </TenantProvider>
            </ThemeProvider>
          </LocaleProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}
