import { useTenant } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';

/**
 * L'Application Tenant ne connaît qu'un seul tenant, quel que soit le scope
 * de l'utilisateur connecté (cf. docs/FIX_TENANT_APP_SINGLE_TENANT.md) :
 * ce composant n'a donc plus de variante interactive. Aucune sélection,
 * recherche, ni liste d'autres tenants — même pour un utilisateur
 * platform-scoped. Le registre complet des tenants reste disponible, mais
 * exclusivement dans la couche Platform (/platform/tenants), via un
 * composant distinct, jamais celui-ci.
 */
export function TenantSwitcher({ compact = false }: { compact?: boolean }) {
  const { currentTenant } = useTenant();
  const { t } = useLocale();
  const initials = currentTenant.name.split(' ').map((word) => word[0]).join('').slice(0, 2);

  return <div className={`flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 text-left ${compact ? 'p-2' : 'border-input bg-card px-3 py-2 text-foreground'}`}><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">{initials}</span><span className={`min-w-0 flex-1 ${compact ? 'text-white' : ''}`}><span className={`block truncate text-[10px] ${compact ? 'text-slate-400' : 'text-muted-foreground'}`}>{t('shell', 'currentTenant')}</span><span className="block truncate text-xs font-semibold">{currentTenant.name}</span></span></div>;
}
