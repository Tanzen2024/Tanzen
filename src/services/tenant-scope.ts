import type { PlatformScope } from '@/mocks/rbac.mocks';

/**
 * Pattern service commun pour toute ressource métier appartenant à un
 * tenant. Un composant ne doit JAMAIS faire confiance à un `get(id)` brut :
 * chaque service qui expose une ressource tenant-scoped doit passer par
 * cette fonction plutôt que de dupliquer la vérification `tenantId` dans
 * chaque page React.
 *
 * `requesterScope` vaut 'platform' UNIQUEMENT pour les répertoires
 * transverses (registre Organization > Tenants, comptes système d'Access &
 * Security) — jamais pour une donnée métier (Member/Account/Loan/Tontine/
 * Cycle/WorkflowRequest...), qui reste strictement isolée au tenant courant
 * quel que soit le scope de l'utilisateur. Les services de ces domaines
 * n'exposent donc pas de paramètre `scope` : ils appellent cette fonction
 * avec la valeur par défaut ('tenant'), toujours stricte.
 *
 * Si la ressource n'existe pas OU appartient à un autre tenant (et que le
 * scope n'est pas 'platform'), retourne `undefined` — jamais une erreur qui
 * distinguerait "n'existe pas" de "appartient à un autre tenant" : les deux
 * cas doivent produire la même page "introuvable" côté UI, pour ne jamais
 * révéler qu'une ressource existe dans un autre tenant.
 */
export function getTenantScoped<T extends { tenantId: string }>(
  items: T[],
  matches: (item: T) => boolean,
  tenantId: string,
  requesterScope: PlatformScope = 'tenant',
): T | undefined {
  const item = items.find(matches);
  if (!item) return undefined;
  if (requesterScope === 'platform') return item;
  return item.tenantId === tenantId ? item : undefined;
}
