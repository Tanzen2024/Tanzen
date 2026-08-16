import { mockRequest } from './api-client';
import { systemRoles, permissionCatalog, type PlatformScope } from '@/mocks/rbac.mocks';
import { users } from '@/mocks/access/users';

/**
 * Ne redéfinit aucune donnée RBAC — lit directement `systemRoles`/
 * `permissionCatalog` (mocks/rbac.mocks.ts). Les rôles eux-mêmes sont une
 * configuration système globale (pas de `tenantId`) : rien à scoper ici.
 * Seule la liste des utilisateurs porteurs d'un rôle est tenant-scoped,
 * selon le même `scope` que `userService`.
 */
export const roleService = {
  listRoles: () => mockRequest(() => systemRoles),
  getRole: (roleId: string) => mockRequest(() => systemRoles.find((role) => role.id === roleId)),
  listPermissions: () => mockRequest(() => permissionCatalog),
  listUsersForRole: (roleId: string, tenantId: string, scope: PlatformScope) => mockRequest(() => users.filter((user) => user.roleIds.includes(roleId) && (scope === 'platform' || user.tenantId === tenantId))),
};
