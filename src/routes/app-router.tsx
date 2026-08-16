import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell, PlatformShell } from '@/layouts';
import { DashboardOverview } from '@/features/dashboard';
import { PermissionRoute } from './permission-route';
import { PlatformScopeGuard } from './platform-scope-route';
import { NotFoundPage } from './not-found-page';
import { UnauthorizedPage } from './unauthorized-page';
import { RouteLoadingFallback } from './route-loading-fallback';

/**
 * Arbre de routes déclaratif. Chaque domaine métier est monté sur un
 * segment `/*` et définit ses propres routes imbriquées (voir
 * `<Domaine>Module()` dans `src/features/<domaine>/`) — plus aucun module
 * ne parse `pathname` à la main. `PermissionRoute` protège l'accès à la
 * PAGE (pas seulement aux actions, déjà couvertes par `PermissionGate`).
 *
 * Le Dashboard reste en import statique (chargé avec le shell) ; les 7
 * autres domaines sont chargés à la demande via `React.lazy` — chacun
 * importé directement depuis `@/features/<domaine>` (pas via le barrel
 * agrégateur `@/features`) pour que le découpage de chunk soit net.
 */
const OrganizationModule = lazy(() => import('@/features/organization').then((m) => ({ default: m.OrganizationModule })));
const FinanceModule = lazy(() => import('@/features/finance').then((m) => ({ default: m.FinanceModule })));
const TontinesModule = lazy(() => import('@/features/tontines').then((m) => ({ default: m.TontinesModule })));
const OperationsModule = lazy(() => import('@/features/operations').then((m) => ({ default: m.OperationsModule })));
const AccessModule = lazy(() => import('@/features/access').then((m) => ({ default: m.AccessModule })));
const AuditModule = lazy(() => import('@/features/audit').then((m) => ({ default: m.AuditModule })));
const SettingsModule = lazy(() => import('@/features/settings').then((m) => ({ default: m.SettingsModule })));
const PlatformModule = lazy(() => import('@/features/platform').then((m) => ({ default: m.PlatformModule })));
const PublicModule = lazy(() => import('@/features/public').then((m) => ({ default: m.PublicModule })));

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<PermissionRoute permission="dashboard.read"><DashboardOverview /></PermissionRoute>} />
        <Route path="/organization/*" element={<PermissionRoute permission="tenants.read"><Suspense fallback={<RouteLoadingFallback />}><OrganizationModule /></Suspense></PermissionRoute>} />
        <Route path="/finance/*" element={<PermissionRoute permission="accounts.read"><Suspense fallback={<RouteLoadingFallback />}><FinanceModule /></Suspense></PermissionRoute>} />
        <Route path="/tontines/*" element={<PermissionRoute permission="tontines.read"><Suspense fallback={<RouteLoadingFallback />}><TontinesModule /></Suspense></PermissionRoute>} />
        <Route path="/operations/*" element={<PermissionRoute permission="workflows.read"><Suspense fallback={<RouteLoadingFallback />}><OperationsModule /></Suspense></PermissionRoute>} />
        <Route path="/access-security/*" element={<PermissionRoute permission="users.read"><Suspense fallback={<RouteLoadingFallback />}><AccessModule /></Suspense></PermissionRoute>} />
        <Route path="/audit/*" element={<PermissionRoute permission="audit.read"><Suspense fallback={<RouteLoadingFallback />}><AuditModule /></Suspense></PermissionRoute>} />
        <Route path="/settings/*" element={<PermissionRoute permission="settings.read"><Suspense fallback={<RouteLoadingFallback />}><SettingsModule /></Suspense></PermissionRoute>} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="/404" element={<NotFoundPage />} />
      </Route>
      <Route
        path="/platform/*"
        element={
          <PlatformScopeGuard>
            <PlatformShell>
              <Suspense fallback={<RouteLoadingFallback />}>
                <PlatformModule />
              </Suspense>
            </PlatformShell>
          </PlatformScopeGuard>
        }
      />
      {/*
        Racine du site Public/SaaS — non authentifié, pas d'AppShell/TenantContext.
        Splat non préfixé : un catch-all bare `path="*"` existait auparavant dans le
        bloc AppShell ci-dessus et aurait été à égalité de score avec celui-ci
        (React Router ne départage des splats de même rang que par l'ordre de
        déclaration, ce qui est fragile) — il a été retiré. Les chemins métier
        (/dashboard, /organization/*, /platform/*, ...) restent prioritaires car
        plus spécifiques (segment statique) ; seuls les chemins réellement non
        reconnus atteignent ce splat, où PublicModule gère son propre 404 interne.
      */}
      <Route
        path="/*"
        element={
          <Suspense fallback={<RouteLoadingFallback />}>
            <PublicModule />
          </Suspense>
        }
      />
    </Routes>
  );
}
