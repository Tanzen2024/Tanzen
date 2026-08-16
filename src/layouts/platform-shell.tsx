import type { ReactNode } from 'react';
import { ArrowLeft, Network, ShieldCheck } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useLocale } from '@/contexts/locale-context';

function isActive(pathname: string, path: string) { return pathname === path || pathname.startsWith(`${path}/`); }

/**
 * Layout de Platform Administration — distinct de `AppShell` (Application
 * Tenant) : pas de `TenantSwitcher`/sidebar métier, navigation propre limitée
 * aux écrans réellement construits (voir docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md
 * §5/§8). `light/dark/system` et `FR/EN` restent actifs sans logique propre à
 * ce layout : `ThemeProvider`/`LocaleProvider` (montés globalement dans
 * `AppProviders`) s'appliquent déjà à toute l'application, Platform inclus.
 */
export function PlatformShell({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  const { t } = useLocale();
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary font-heading text-xl font-bold text-primary-foreground shadow-lg shadow-primary/20">T</span>
            <div>
              <p className="font-heading text-sm font-bold tracking-[.04em]">TANZEN</p>
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[.18em] text-primary"><ShieldCheck size={11} />{t('shell', 'platformAdministration')}</p>
            </div>
          </div>
          <nav className="hidden items-center gap-1 sm:flex" aria-label={t('shell', 'navigation')}>
            <Link to="/platform/tenants" className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${isActive(pathname, '/platform/tenants') ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <Network size={15} />{t('organization', 'tenantsTitle')}
            </Link>
          </nav>
        </div>
        <Link to="/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft size={15} />{t('shell', 'backToTenantApp')}
        </Link>
      </header>
      <main className="flex-1">{children ?? <Outlet />}</main>
    </div>
  );
}
