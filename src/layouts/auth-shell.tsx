import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Layout du point d'entrée Tenant (`/login`) — séparation Commercial/Tenant
 * (2026-08-16, voir docs/COMMERCIAL_TENANT_EXECUTION_PLAN.md §24). Minimal
 * par nature (pas de nav marketing, pas de ShellSidebar/ShellHeader/
 * TenantSwitcher — l'utilisateur n'est pas encore dans l'app tenant tant
 * qu'il n'est pas connecté). Miroir structurel d'`AppShell`/`PublicShell`
 * (accepte `children` ou retombe sur `<Outlet/>`).
 */
export function AuthShell({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-landing-background text-landing-foreground">
      {children ?? <Outlet />}
    </div>
  );
}
