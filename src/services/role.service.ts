import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { systemRoles, permissionCatalog, type SystemRole } from '@/mocks/rbac.mocks';
import { users } from '@/mocks/access/users';

export type RoleInput = Pick<SystemRole, 'name' | 'description' | 'permissions'>;

/**
 * D1 (validé, cf. docs/P0_RBAC_IMPLEMENTATION_REPORT.md) : les rôles sont
 * désormais tenant-scopés (`SystemRole.tenantId`, mocks/rbac.mocks.ts).
 * Contrairement à `userService`/`sessionService` (qui conservent un
 * paramètre `scope` hérité de D1 `users`, jamais exercé par l'UI), les
 * fonctions ci-dessous n'acceptent AUCUN paramètre `scope` — le tenant est
 * la seule clé de portée possible, il n'existe structurellement aucune
 * branche de contournement à laisser inactive. `permissions` reste un
 * catalogue global, non scopé tenant (conforme au modèle canonique).
 */
export const roleService = {
  listRoles: (tenantId: string) => mockRequest(() => systemRoles.filter((role) => role.tenantId === tenantId)),
  getRole: (tenantId: string, roleId: string) => mockRequest(() => getTenantScoped(systemRoles, (role) => role.id === roleId, tenantId)),
  listPermissions: () => mockRequest(() => permissionCatalog),
  /** D3 (validé) : un porteur de rôle n'est jamais cherché au-delà du tenant courant. */
  listUsersForRole: (roleId: string, tenantId: string) => mockRequest(() => users.filter((user) => user.roleIds.includes(roleId) && user.tenantId === tenantId)),

  /** `tenantId` provient toujours de l'appelant (le tenant courant résolu par `TenantContext`), jamais d'un champ de formulaire — le rôle créé est automatiquement rattaché à ce tenant, sans exception possible. `scope` est toujours `'tenant'` pour un rôle créé depuis le Tenant App : un administrateur tenant ne peut jamais créer un rôle marqué « platform » (le rôle le plus élevé reste réservé aux 3 rôles de base pré-existants). */
  create: (input: RoleInput & { tenantId: string }) =>
    mockRequest(() => {
      const { tenantId, ...fields } = input;
      const ordinal = systemRoles.filter((role) => role.tenantId === tenantId).length + 1;
      const role: SystemRole = { id: `role-custom-${tenantId}-${ordinal}`, tenantId, scope: 'tenant', ...fields };
      systemRoles.push(role);
      return role;
    }),
  /** Même garde tenant que get() — jamais d'écriture sur un roleId non vérifié tenant-scoped. `tenantId` n'est même pas un champ de `RoleInput` : aucune réassignation de tenant possible via ce patch, par construction du type. */
  update: (tenantId: string, roleId: string, patch: Partial<RoleInput>) =>
    mockRequest(() => {
      const role = getTenantScoped(systemRoles, (item) => item.id === roleId, tenantId);
      if (!role) return undefined;
      Object.assign(role, patch);
      return role;
    }),
  /**
   * Suppression réelle (aucun champ de désactivation logique n'existe sur
   * `SystemRole` dans le modèle canonique) — refusée si le rôle est encore
   * porté par au moins un utilisateur du tenant, pour ne jamais laisser un
   * `SystemUser.roleIds` pointer vers un rôle inexistant (intégrité
   * référentielle, pas une politique métier inventée). Retourne `undefined`
   * dans les deux cas de refus (rôle introuvable/hors tenant, ou rôle
   * encore assigné) — même sémantique « refus indistinct » que le reste du
   * projet, aucune information n'est révélée sur la raison exacte.
   */
  delete: (tenantId: string, roleId: string) =>
    mockRequest(() => {
      const role = getTenantScoped(systemRoles, (item) => item.id === roleId, tenantId);
      if (!role) return undefined;
      const stillAssigned = users.some((user) => user.tenantId === tenantId && user.roleIds.includes(roleId));
      if (stillAssigned) return undefined;
      const index = systemRoles.findIndex((item) => item.id === roleId);
      systemRoles.splice(index, 1);
      return role;
    }),
};
