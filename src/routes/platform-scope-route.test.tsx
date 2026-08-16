import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

async function renderGuardedRouteAs(scope: 'tenant' | 'platform') {
  vi.resetModules();
  vi.doMock('@/mocks/rbac.mocks', async () => {
    const actual = await vi.importActual<typeof import('@/mocks/rbac.mocks')>('@/mocks/rbac.mocks');
    return { ...actual, currentUser: { ...actual.currentUser, scope } };
  });
  const { renderWithProviders } = await import('@/test/render-with-providers');
  const { PlatformScopeGuard } = await import('@/routes/platform-scope-route');
  return renderWithProviders(
    <Routes>
      <Route path="/platform" element={<PlatformScopeGuard><div>Platform content</div></PlatformScopeGuard>} />
      <Route path="/unauthorized" element={<div>Unauthorized page</div>} />
    </Routes>,
    { route: '/platform' },
  );
}

describe('PlatformScopeGuard', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('DENY: redirects a tenant-scoped user to /unauthorized', async () => {
    await renderGuardedRouteAs('tenant');
    expect(screen.getByText('Unauthorized page')).toBeInTheDocument();
    expect(screen.queryByText('Platform content')).not.toBeInTheDocument();
  });

  it('ALLOW: renders children for a platform-scoped user', async () => {
    await renderGuardedRouteAs('platform');
    expect(screen.getByText('Platform content')).toBeInTheDocument();
  });
});
