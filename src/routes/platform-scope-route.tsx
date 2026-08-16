import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/contexts/permission-context';

/**
 * Garde de PORTÉE (platform vs tenant), distincte de `PermissionRoute` (qui
 * garde par `Permission`). Réservée aux répertoires transverses inter-tenant
 * (registre Organization > Tenants) — jamais aux données métier d'un tenant,
 * qui restent isolées via `getTenantScoped`/les services scope-checked
 * indépendamment de ce guard. Une permission générale (ex. `tenants.read`)
 * ne suffit pas : il faut aussi `scope === 'platform'`.
 */
export function PlatformScopeGuard({ children }: { children: ReactNode }) {
  const { user } = usePermissions();
  if (user.scope !== 'platform') return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}
