import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { AuthGuard } from './auth-guard';
import { authService } from '@/services/auth.service';
import { LocaleProvider } from '@/contexts/locale-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { TenantProvider, useTenant } from '@/contexts/tenant-context';
import { PermissionProvider, usePermissions } from '@/contexts/permission-context';

/**
 * `AuthGuard` gate au niveau ROUTE (comme `PermissionRoute`), pas au
 * niveau des contexts : `TenantContext`/`PermissionContext` restent de
 * simples projections du mock RBAC, sans notion de session. La garantie
 * "aucune session tenant/permission active après déconnexion" (mandat
 * §4/§5/§13, TESTS 5/6) est donc vérifiée ici en prouvant qu'un composant
 * protégé qui LIT `useTenant()`/`usePermissions()` ne s'affiche jamais
 * quand la session est absente — la donnée n'est jamais atteinte, pas
 * "effacée après coup".
 */
function ProtectedPage() {
  const { currentTenant } = useTenant();
  const { user } = usePermissions();
  return <div>Protected dashboard — {currentTenant.name} — {user.name}</div>;
}

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LocaleProvider>
          <ThemeProvider>
            <TenantProvider>
              <PermissionProvider>
                <Routes>
                  <Route path="/login" element={<div>Login screen</div>} />
                  <Route path="/dashboard" element={<AuthGuard><ProtectedPage /></AuthGuard>} />
                </Routes>
              </PermissionProvider>
            </TenantProvider>
          </ThemeProvider>
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AuthGuard — route protection after logout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('DENY: redirects to /login when there is no active session — protected data never rendered', () => {
    renderApp('/dashboard');
    expect(screen.getByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText(/Protected dashboard/)).not.toBeInTheDocument();
  });

  it('ALLOW: renders the protected page (with tenant/permission data) when a session is active', async () => {
    await authService.login();
    renderApp('/dashboard');
    expect(screen.getByText(/Protected dashboard/)).toBeInTheDocument();
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument();
  });

  it('DENY: a direct visit to /dashboard after logout redirects to /login again', async () => {
    await authService.login();
    await authService.logout();
    renderApp('/dashboard');
    expect(screen.getByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText(/Protected dashboard/)).not.toBeInTheDocument();
  });

  it('DENY: a stale session cleared by another tab (simulates a refresh reading fresh localStorage) is not honored', async () => {
    await authService.login();
    localStorage.removeItem('tanzen-session');
    renderApp('/dashboard');
    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });
});
