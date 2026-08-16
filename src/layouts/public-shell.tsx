import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '@/features/public/components/navbar';
import { Footer } from '@/features/public/components/footer';

/**
 * Layout du site Public/SaaS — Navbar + Footer marketing, identité visuelle
 * propre (tokens `landing-*`), aucune dépendance à `TenantContext`/
 * `PermissionContext`/`AppShell` (le site public n'est pas tenant-scoped ni
 * authentifié). Miroir structurel d'`AppShell`/`PlatformShell` (accepte
 * `children` ou retombe sur `<Outlet/>`) mais sans rien de leur contenu.
 */
export function PublicShell({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-landing-background text-landing-foreground">
      <Navbar />
      {children ?? <Outlet />}
      <Footer />
    </div>
  );
}
