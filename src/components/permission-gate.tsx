import type { ReactNode } from 'react';
import { usePermissions } from '@/contexts/permission-context';
import type { Permission } from '@/mocks/rbac.mocks';

export function PermissionGate({ permission, entityType, children, fallback = null }: { permission: Permission; entityType?: string; children: ReactNode; fallback?: ReactNode }) {
  const { can } = usePermissions();
  return can(permission, entityType) ? <>{children}</> : <>{fallback}</>;
}
