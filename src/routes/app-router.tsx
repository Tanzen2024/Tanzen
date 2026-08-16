import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, AuthShell } from '@/layouts';
import { DashboardOverview } from '@/features/dashboard';
import { LoginPage } from '@/features/auth/login-page';
import { PermissionRoute } from './permission-route';
import { AuthGuard } from './auth-guard';
import { NotFoundPage } from './not-found-page';
import { UnauthorizedPage } from './unauthorized-page';
import { RouteLoadingFallback } from './route-loading-fallback';

/**
 * Arbre de routes de tanzen-frontend — Application Tenant exclusivement,
 * depuis la séparation Commercial/Tenant (2026-08-16, voir
 * docs/COMMERCIAL_TENANT_EXECUTION_PLAN.md). Ce routeur ne connaît plus
 * `PlatformShell`/`PublicShell` ni aucune route Public/Platform
 * (`/pricing`, `/checkout`, `/payment`, `/platform/*`, etc.) : elles
 * n'existent plus dans ce projet, déplacées vers tanzen-commercial.
 *
 * `/` redirige vers `/login`, le nouveau point d'entrée de l'app (mandat
 * §7/§9) ; `AuthGuard` reste un passthrough documenté tant qu'aucune
 * authentification réelle n'existe (`BACKEND PENDING`, voir `auth-guard.tsx`).
 *
 * Chaque domaine métier est monté sur un segment `/*` et définit ses
 * propres routes imbriquées (voir `<Domaine>Module()` dans
 * `src/features/<domaine>/`). `PermissionRoute` protège l'accès à la PAGE
 * (pas seulement aux actions, déjà couvertes par `PermissionGate`).
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

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route element={<AuthShell />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route
        element={
          <AuthGuard>
            <AppShell />
          </AuthGuard>
        }
      >
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
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
