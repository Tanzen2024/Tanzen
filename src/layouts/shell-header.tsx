import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Check, ChevronDown, Languages, LogOut, Menu, Moon, Settings, Sun, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TenantBreadcrumb } from '@/layouts/tenant-breadcrumb';
import { FiscalYearSelector } from '@/layouts/fiscal-year-selector';
import { useUiStore } from '@/stores/ui-store';
import { useClickOutside } from '@/hooks/use-click-outside';
import { useLocale } from '@/contexts/locale-context';
import { useTheme } from '@/contexts/theme-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePermissions } from '@/contexts/permission-context';
import { notificationService } from '@/services/notification.service';
import { queryKeys } from '@/services/query-keys';
import { authService } from '@/services/auth.service';
import { notify } from '@/lib/notify';

const PRIORITY_TONE: Record<'high' | 'medium' | 'low', string> = { high: 'bg-rose-500', medium: 'bg-amber-500', low: 'bg-blue-500' };

function MenuButton({ label, children, onClick, active = false }: { label: string; children: ReactNode; onClick: () => void; active?: boolean }) { return <button type="button" onClick={onClick} className={`grid size-9 place-items-center rounded-lg transition-colors ${active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} aria-label={label} aria-pressed={active}>{children}</button>; }

function NotificationCenter({ items, onClose }: { items: import('@/mocks/operations/notifications').Notification[]; onClose: () => void }) {
  const { t } = useLocale(); const navigate = useNavigate();
  const preview = items.slice(0, 4);
  return <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-32px))] rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl"><div className="flex items-center justify-between px-3 py-2"><div><h2 className="text-sm font-semibold">{t('shell', 'notifications')}</h2><p className="mt-0.5 text-xs text-muted-foreground">{items.length} {t('shell', 'notificationSummary')}</p></div><button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label={t('shell', 'close')}><Check size={15} /></button></div><div className="border-t border-border pt-1">{preview.map((notification) => <button type="button" key={notification.id} onClick={() => { navigate('/operations/notifications'); onClose(); }} className="flex w-full gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${PRIORITY_TONE[notification.priority]}`} /><span className="min-w-0 flex-1"><strong className="block text-xs font-semibold">{notification.title}</strong><span className="mt-1 block truncate text-xs text-muted-foreground">{notification.message}</span></span></button>)}{preview.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t('shell', 'notificationSummary')}</p>}</div><button type="button" onClick={() => { navigate('/operations/notifications'); onClose(); }} className="mt-1 w-full rounded-lg border-t border-border py-2 text-xs font-semibold text-primary hover:bg-muted">{t('shell', 'seeAllNotifications')}</button></div>;
}

function UserMenu({ name, initials, onClose }: { name: string; initials: string; onClose: () => void }) {
  const navigate = useNavigate(); const { t } = useLocale(); const [loggingOut, setLoggingOut] = useState(false);
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await authService.logout();
      navigate('/login', { replace: true });
    } catch {
      notify.error(t('system', 'errorTitle'));
      setLoggingOut(false);
    }
  };
  return <div className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl"><div className="flex items-center gap-3 border-b border-border px-2 pb-3 pt-1"><span className="grid size-9 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials}</span><div><p className="text-sm font-semibold">{name}</p><p className="text-xs text-muted-foreground">{t('shell', 'administrator')}</p></div></div><div className="py-1"><button type="button" onClick={() => { navigate('/settings/organization'); onClose(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted"><User size={16} /> {t('shell', 'profile')}</button><button type="button" onClick={() => { navigate('/settings/organization'); onClose(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted"><Settings size={16} /> {t('shell', 'preferences')}</button></div><div className="border-t border-border pt-1"><button type="button" onClick={handleLogout} disabled={loggingOut} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-60 disabled:cursor-not-allowed dark:hover:bg-rose-950"><LogOut size={16} /> {t('shell', 'signOut')}</button></div></div>;
}

export function ShellHeader() {
  const { setMobileSidebarOpen } = useUiStore(); const { locale, t, setLocale } = useLocale(); const { resolvedTheme, setTheme } = useTheme(); const { currentTenant } = useTenant(); const { user } = usePermissions(); const [notificationsOpen, setNotificationsOpen] = useState(false); const [userOpen, setUserOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null); const userRef = useRef<HTMLDivElement>(null);
  const { data: notifications = [] } = useQuery({ queryKey: queryKeys.operations.notifications(currentTenant.id, user.id), queryFn: () => notificationService.list(currentTenant.id, user.id) });
  const unreadNotifications = notifications.filter((notification) => !notification.read);
  const userInitials = user.name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setNotificationsOpen(false); setUserOpen(false); } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, []);
  useClickOutside([notificationsRef], () => setNotificationsOpen(false), notificationsOpen);
  useClickOutside([userRef], () => setUserOpen(false), userOpen);
  return (
    /* Mandat "Finalisation header/layout" (2026-09-16, révisé le même jour pour retirer le
       breadcrumb du bloc tenant, puis à nouveau pour compacter sa largeur) : ordre de gauche à
       droite = menu mobile, tenant courant (uniquement — plus de fil de navigation fusionné) +
       exercice fiscal regroupés avec un petit gap, puis Notifications / Langue / Clair-Sombre /
       Utilisateur. Recherche, Aide et l'option "Système" du thème ont été retirées du header
       (§12-16 du mandat) — le thème n'expose plus que Clair/Sombre (`resolvedTheme`, cf.
       theme-context.tsx). Le groupe tenant+exercice n'a plus `flex-1` (qui étirait le bloc
       tenant sur toute la largeur disponible) : c'est `ml-auto` sur le cluster d'actions qui
       pousse celui-ci vers la droite, tandis que `TenantBreadcrumb` se limite lui-même en
       largeur (`max-w-[...]` + `truncate`, cf. tenant-breadcrumb.tsx) pour rester compact. */
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:px-6">
      <button type="button" onClick={() => setMobileSidebarOpen(true)} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden" aria-label={t('shell', 'openMenu')}><Menu size={19} /></button>
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0"><TenantBreadcrumb /></div>
        <div className="shrink-0"><FiscalYearSelector /></div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <div className="relative" ref={notificationsRef}><MenuButton label={t('shell', 'notifications')} active={notificationsOpen} onClick={() => { setNotificationsOpen((value) => !value); setUserOpen(false); }}><Bell size={17} />{unreadNotifications.length > 0 && <span className="absolute right-0.5 top-0.5 grid size-3.5 place-items-center rounded-full bg-amber-500 text-[8px] font-bold text-white">{unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}</span>}</MenuButton>{notificationsOpen && <NotificationCenter items={unreadNotifications} onClose={() => setNotificationsOpen(false)} />}</div>
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <div className="hidden items-center gap-2 border-l border-border pl-2 sm:flex">
          <label className="sr-only" htmlFor="language-switcher">{t('shell', 'language')}</label>
          <select id="language-switcher" value={locale} onChange={(event) => setLocale(event.target.value as 'fr' | 'en')} className="h-8 max-w-16 rounded-md border-0 bg-transparent px-1 text-xs font-semibold text-muted-foreground outline-none hover:bg-muted"><option value="fr">FR</option><option value="en">EN</option></select>
          <Languages size={14} className="-ml-1 text-muted-foreground" />
          {/* Bascule binaire Clair/Sombre — plus d'option "Système" proposée à l'utilisateur (mandat §15-16). */}
          <div role="group" aria-label={t('shell', 'theme')} className="flex items-center gap-0.5 rounded-md border border-input p-0.5">
            <button type="button" onClick={() => setTheme('light')} aria-pressed={resolvedTheme === 'light'} aria-label={t('shell', 'light')} className={`grid size-6 place-items-center rounded ${resolvedTheme === 'light' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted'}`}><Sun size={13} /></button>
            <button type="button" onClick={() => setTheme('dark')} aria-pressed={resolvedTheme === 'dark'} aria-label={t('shell', 'dark')} className={`grid size-6 place-items-center rounded ${resolvedTheme === 'dark' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted'}`}><Moon size={13} /></button>
          </div>
        </div>
        <div className="relative" ref={userRef}><button type="button" onClick={() => { setUserOpen((value) => !value); setNotificationsOpen(false); }} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted" aria-label={t('shell', 'userMenu')}><span className="grid size-8 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{userInitials}</span><span className="hidden max-w-28 truncate text-xs font-semibold xl:block">{user.name}</span><ChevronDown size={14} className="hidden text-muted-foreground xl:block" /></button>{userOpen && <UserMenu name={user.name} initials={userInitials} onClose={() => setUserOpen(false)} />}</div>
      </div>
    </header>
  );
}
