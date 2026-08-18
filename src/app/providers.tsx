import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LocaleProvider } from '@/contexts/locale-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { TenantProvider } from '@/contexts/tenant-context';
import { PermissionProvider } from '@/contexts/permission-context';
import { FiscalYearProvider } from '@/contexts/fiscal-year-context';
import { Toaster } from '@/components/ui/toaster';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <ThemeProvider>
          <TenantProvider>
            <PermissionProvider>
              <FiscalYearProvider>
                {children}
                <Toaster />
              </FiscalYearProvider>
            </PermissionProvider>
          </TenantProvider>
        </ThemeProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
