import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { users, type SystemUser } from '@/mocks/access/users';
import type { PlatformScope } from '@/mocks/rbac.mocks';

export type UserInput = Pick<SystemUser, 'name' | 'email' | 'tenantId' | 'tenantName' | 'roleIds'>;

/**
 * Access & Security est une console d'administration transverse : la portée
 * inter-tenant n'est plus une exception "parce que c'est Access & Security"
 * — elle dépend du `scope` ('tenant' | 'platform') porté par l'utilisateur
 * courant (voir mocks/rbac.mocks.ts et services/tenant-scope.ts), exactement
 * comme pour le registre Organization > Tenants.
 */
export const userService = {
  list: (tenantId: string, scope: PlatformScope) => mockRequest(() => (scope === 'platform' ? users : users.filter((user) => user.tenantId === tenantId))),
  get: (tenantId: string, userId: string, scope: PlatformScope = 'tenant') => mockRequest(() => getTenantScoped(users, (user) => user.id === userId, tenantId, scope)),
  listByRole: (roleId: string, tenantId: string, scope: PlatformScope) => mockRequest(() => users.filter((user) => user.roleIds.includes(roleId) && (scope === 'platform' || user.tenantId === tenantId))),

  /** Pas de mot de passe ni de flux MFA généré ici — aucune gestion d'identifiants réelle côté frontend (cf. docs/PHASE_10_DECISIONS_A_VALIDER.md). */
  create: (input: UserInput) =>
    mockRequest(() => {
      const user: SystemUser = { id: `U-${String(users.length + 1).padStart(3, '0')}`, status: 'invited', mfaStatus: 'disabled', mfaMethod: 'none', mfaDevices: [], recoveryCodesRemaining: 0, lastLoginAt: null, createdAt: new Date().toISOString().slice(0, 10), ...input };
      users.push(user);
      return user;
    }),
  /** Même garde tenant/scope que get() — jamais d'écriture sur un userId non vérifié tenant-scoped. */
  update: (tenantId: string, userId: string, patch: Partial<UserInput> & { status?: SystemUser['status'] }, scope: PlatformScope = 'tenant') =>
    mockRequest(() => {
      const user = getTenantScoped(users, (item) => item.id === userId, tenantId, scope);
      if (!user) return undefined;
      Object.assign(user, patch);
      return user;
    }),
};
