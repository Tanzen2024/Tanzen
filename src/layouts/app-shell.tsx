import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ShellHeader } from '@/layouts/shell-header';
import { ShellSidebar } from '@/layouts/shell-sidebar';
import { useUiStore } from '@/stores/ui-store';
import { useLocale } from '@/contexts/locale-context';

/**
 * Séparation Commercial/Tenant (2026-08-16) : la classe `.dark` sur
 * `<html>` était auparavant appliquée ici via un `useEffect` dupliquant
 * (en moins complet — pas d'écoute live de `prefers-color-scheme`) la
 * logique déjà présente dans `ThemeProvider` (`contexts/theme-context.tsx`),
 * monté une seule fois à la racine de l'app (`AppProviders`) et donc déjà
 * actif pour tous les shells (`AppShell`/`PlatformShell`/`PublicShell`),
 * pas seulement celui-ci. Le doublon local est retiré ; `ThemeProvider`
 * reste l'unique source de vérité, ce qui est nécessaire une fois
 * `PlatformShell` séparé dans tanzen-commercial (où `AppShell` n'existera
 * plus du tout).
 */
export function AppShell({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const { sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen } = useUiStore();
  const { t } = useLocale();
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileSidebarOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setMobileSidebarOpen]);

  return <div className="flex min-h-screen bg-background text-foreground"><a href="#main-content" className="skip-link">{t('shell', 'skipToContent')}</a><ShellSidebar expanded={expanded} setExpanded={setExpanded} activePaths={[location.pathname]} collapsed={sidebarCollapsed} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} /><div className="min-w-0 flex-1"><ShellHeader /><main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-4rem)] outline-none">{children ?? <Outlet />}</main></div></div>;
}
