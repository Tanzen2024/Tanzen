import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ShellHeader } from '@/layouts/shell-header';
import { ShellSidebar } from '@/layouts/shell-sidebar';
import { useUiStore } from '@/stores/ui-store';
import { useTheme } from '@/contexts/theme-context';
import { useLocale } from '@/contexts/locale-context';

export function AppShell({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const { sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen } = useUiStore();
  const { theme } = useTheme();
  const { t } = useLocale();
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }, [theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileSidebarOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setMobileSidebarOpen]);

  return <div className="flex min-h-screen bg-background text-foreground"><a href="#main-content" className="skip-link">{t('shell', 'skipToContent')}</a><ShellSidebar expanded={expanded} setExpanded={setExpanded} activePaths={[location.pathname]} collapsed={sidebarCollapsed} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} /><div className="min-w-0 flex-1"><ShellHeader /><main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-4rem)] outline-none">{children ?? <Outlet />}</main></div></div>;
}
