import type { ReactNode } from 'react';
import { ArrowLeft, CreditCard, FileText, LayoutDashboard, Languages, Layers, Network, ScrollText, ShieldCheck } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useLocale } from '@/contexts/locale-context';

function isActive(pathname: string, path: string) { return pathname === path || pathname.startsWith(`${path}/`); }

const NAV_ITEMS = [
  { path: '/platform/dashboard', icon: LayoutDashboard, labelKey: 'navDashboard' },
  { path: '/platform/tenants', icon: Network, labelKey: 'navTenants' },
  { path: '/platform/plans', icon: Layers, labelKey: 'navPlans' },
  { path: '/platform/subscriptions', icon: CreditCard, labelKey: 'navSubscriptions' },
  { path: '/platform/payments', icon: CreditCard, labelKey: 'navPayments' },
  { path: '/platform/billing', icon: FileText, labelKey: 'navBilling' },
  { path: '/platform/audit', icon: ScrollText, labelKey: 'navAudit' },
] as const;

/**
 * Layout de Platform Administration — distinct de `AppShell` (Application
 * Tenant) : pas de `TenantSwitcher`/sidebar métier, navigation propre limitée
 * aux écrans réellement construits (voir docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md
 * §5/§8). `ThemeProvider`/`LocaleProvider` (montés globalement dans
 * `AppProviders`) s'appliquent déjà à toute l'application, Platform inclus —
 * mais le sélecteur FR/EN lui-même doit être exposé dans ce header aussi
 * (exigence multilingue §3 : Platform Administration a besoin de son propre
 * contrôle, pas seulement celui de l'Application Tenant).
 */
export function PlatformShell({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  const { locale, setLocale, t } = useLocale();
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
          <nav className="hidden items-center gap-1 overflow-x-auto sm:flex" aria-label={t('shell', 'navigation')}>
            {NAV_ITEMS.map(({ path, icon: Icon, labelKey }) => (
              <Link key={path} to={path} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${isActive(pathname, path) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                <Icon size={15} />{t('platform', labelKey)}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 border-r border-border pr-3">
            <Languages size={14} className="text-muted-foreground" aria-hidden="true" />
            <label className="sr-only" htmlFor="platform-language-switcher">{t('shell', 'language')}</label>
            <select
              id="platform-language-switcher"
              value={locale}
              onChange={(event) => setLocale(event.target.value as 'fr' | 'en')}
              className="h-8 rounded-md border-0 bg-transparent px-1 text-xs font-semibold text-muted-foreground outline-none hover:bg-muted"
            >
              <option value="fr">FR</option>
              <option value="en">EN</option>
            </select>
          </div>
          <Link to="/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft size={15} />{t('shell', 'backToTenantApp')}
          </Link>
        </div>
      </header>
      <main className="flex-1">{children ?? <Outlet />}</main>
    </div>
  );
}
