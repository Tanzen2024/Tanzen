import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/contexts/permission-context';
import type { Permission } from '@/mocks/rbac.mocks';

/**
 * Garde RBAC au niveau PAGE (pas seulement au niveau action). Le RBAC
 * existait déjà pour les boutons via `PermissionGate` — celui-ci reste
 * inchangé et continue de gater les actions ; `PermissionRoute` s'en sert
 * pour l'accès à la page elle-même, sans dupliquer la logique de `can()`.
 */
export function PermissionRoute({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = usePermissions();
  if (!can(permission)) return <Navigate to="/unauthorized" replace state={{ permission }} />;
  return <>{children}</>;
}
