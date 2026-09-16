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
export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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
