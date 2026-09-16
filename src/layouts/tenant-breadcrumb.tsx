import { useTenant } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';

/**
 * Bloc de contexte tenant (mandat "Supprimer le breadcrumb du bloc tenant" —
 * 2026-09-16, complété le même jour par "Ajustement largeur/espacements" puis
 * par "Amélioration des noms de tenants longs") : affiche EXCLUSIVEMENT le
 * tenant courant. Le fil de navigation qui y était fusionné a été retiré — la
 * navigation sidebar est l'unique source de vérité pour la page courante (cf.
 * docs/FIX_TENANT_APP_SINGLE_TENANT.md pour le caractère mono-tenant, sans
 * sélection, de ce bloc).
 *
 * La largeur n'est plus un plafond fixe étroit (ancien `max-w-[220px]`, qui
 * tronquait même les noms moyens sans nécessité) : `max-w-[min(30rem,42vw)]`
 * plafonne à 480px sur grand écran tout en suivant l'espace réellement
 * disponible via `42vw` sur écran plus étroit (même famille de technique que
 * `w-[min(360px,calc(100vw-32px))]` déjà utilisé plus bas dans ce fichier
 * pour `NotificationCenter`). Le bloc n'a PAS `flex-1`/`flex-grow` — il ne
 * s'agrandit donc jamais au-delà du besoin réel de son contenu ; ce plafond
 * ne fait que l'autoriser à aller plus loin qu'avant avant de tronquer.
 * `min-w-0` + `truncate` restent nécessaires pour qu'il puisse aussi rétrécir
 * en dernier recours (priorité la plus basse du header) sans jamais provoquer
 * de débordement horizontal ; le `title` restitue le nom complet au survol —
 * aucun système de tooltip dédié n'existe ailleurs dans le projet pour ce cas
 * (le seul `Tooltip` du design system, dans `components/ui/tooltip.tsx`,
 * n'est monté nulle part avec son `TooltipProvider` — l'introduire ici
 * dépasserait le cadre de cette tâche ciblée).
 */
export function TenantBreadcrumb() {
  const { currentTenant } = useTenant();
  const { t } = useLocale();
  const initials = currentTenant.name.split(' ').map((word) => word[0]).join('').slice(0, 2);

  return (
    <div data-testid="tenant-current" className="flex min-w-0 max-w-[min(30rem,42vw)] items-center gap-2.5 rounded-lg border border-input bg-card px-3 py-2 text-foreground">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">{initials}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] text-muted-foreground">{t('shell', 'currentTenant')}</span>
        <span className="block truncate text-xs font-semibold" title={currentTenant.name}>{currentTenant.name}</span>
      </span>
    </div>
  );
}
