import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { users, type SystemUser } from '@/mocks/access/users';
import { systemRoles, type PlatformScope } from '@/mocks/rbac.mocks';

export type UserInput = Pick<SystemUser, 'name' | 'email' | 'tenantId' | 'tenantName' | 'roleIds'>;

/**
 * D3 (validé, cf. docs/P0_RBAC_IMPLEMENTATION_REPORT.md) : `user.tenantId
 * === role.tenantId === currentTenantId`, vérifié service-side — jamais
 * seulement côté UI (`RolePicker` filtre déjà l'affichage, mais un appel
 * direct au service doit être refusé indépendamment de ce que l'écran
 * proposait). Un seul `roleId` hors tenant dans le tableau soumis refuse
 * l'opération entière plutôt que de filtrer silencieusement la liste.
 */
function rolesBelongToTenant(roleIds: string[], tenantId: string): boolean {
  return roleIds.every((roleId) => systemRoles.some((role) => role.id === roleId && role.tenantId === tenantId));
}

/**
 * Correctif de sécurité (cf. docs/P0_RBAC_SCOPE_SECURITY_FIX_REPORT.md) :
 * `rolesBelongToTenant` seule ne vérifiait que le tenant, jamais
 * `role.scope` — un acteur `scope: 'tenant'` pouvait, par appel direct au
 * service, s'auto-affecter (ou affecter à un tiers) un rôle `scope:
 * 'platform'` de son propre tenant, contournant la garde qui n'existait
 * jusqu'ici que côté UI (`RolePicker`, `access-module.tsx` : `assignable =
 * roles.filter((role) => currentUserScope === 'platform' || role.scope ===
 * 'tenant')`). Cette fonction réplique EXACTEMENT la même règle,
 * service-side : un acteur `'platform'` peut affecter n'importe quel rôle
 * de son tenant (tenant ou platform) ; un acteur `'tenant'` ne peut
 * affecter que des rôles `scope: 'tenant'`. Aucune nouvelle politique
 * inventée — seule l'extension au service d'une règle déjà appliquée par
 * `RolePicker`.
 */
function rolesWithinActorScope(roleIds: string[], tenantId: string, actorScope: PlatformScope): boolean {
  if (actorScope === 'platform') return true;
  return roleIds.every((roleId) => systemRoles.find((role) => role.id === roleId && role.tenantId === tenantId)?.scope === 'tenant');
}

/**
 * D1 (cf. docs/P0_USERS_DECISIONS_A_VALIDER.md) : `tanzen-frontend` est
 * exclusivement une Tenant Application, isolée à un seul tenant quel que
 * soit le `scope` RBAC ('tenant' | 'platform', voir mocks/rbac.mocks.ts) de
 * l'utilisateur courant — Access & Security n'est plus traitée comme une
 * console transverse ici (contrairement à l'ancien choix de
 * PHASE_10_ACCESS_SECURITY.md, explicitement révoqué par D1). Le paramètre
 * `scope` ci-dessous reste accepté par ces fonctions — même « special case:
 * scope-gated repository » que `organizationService.listTenants`
 * (organization.service.ts) — mais tous les appelants réels dans
 * `src/features/access/access-module.tsx` passent désormais littéralement
 * `'tenant'`, jamais `currentUser.scope` : la branche `'platform'` est une
 * capacité de service non exercée par l'UI de ce projet, conservée pour
 * cohérence avec `getTenantScoped`/`tenant-scope.ts` et testée comme telle
 * (voir `user.service.test.ts`), pas un mécanisme de bypass actif.
 */
export const userService = {
  list: (tenantId: string, scope: PlatformScope) => mockRequest(() => (scope === 'platform' ? users : users.filter((user) => user.tenantId === tenantId))),
  get: (tenantId: string, userId: string, scope: PlatformScope = 'tenant') => mockRequest(() => getTenantScoped(users, (user) => user.id === userId, tenantId, scope)),
  listByRole: (roleId: string, tenantId: string, scope: PlatformScope) => mockRequest(() => users.filter((user) => user.roleIds.includes(roleId) && (scope === 'platform' || user.tenantId === tenantId))),

  /**
   * Pas de mot de passe ni de flux MFA généré ici — aucune gestion
   * d'identifiants réelle côté frontend (cf. docs/PHASE_10_DECISIONS_A_VALIDER.md).
   * `isActive: true` par défaut (D3 `users`) : le modèle canonique n'a pas
   * d'état "invited" distinct, un utilisateur créé est actif dès sa
   * création. D3 (`P0 RBAC`) : refuse la création si un `roleId` soumis
   * n'appartient pas au tenant de l'utilisateur créé, ou si l'acteur
   * (`actorScope`) n'a pas le droit d'affecter un rôle de ce niveau
   * (correctif sécurité, cf. docs/P0_RBAC_SCOPE_SECURITY_FIX_REPORT.md) —
   * jamais seulement une restriction d'affichage (`RolePicker`).
   */
  create: (input: UserInput, actorScope: PlatformScope = 'tenant') =>
    mockRequest(() => {
      if (!rolesBelongToTenant(input.roleIds, input.tenantId)) return undefined;
      if (!rolesWithinActorScope(input.roleIds, input.tenantId, actorScope)) return undefined;
      const user: SystemUser = { id: `U-${String(users.length + 1).padStart(3, '0')}`, isActive: true, mfaStatus: 'disabled', mfaMethod: 'none', mfaDevices: [], recoveryCodesRemaining: 0, lastLoginAt: null, createdAt: new Date().toISOString().slice(0, 10), ...input };
      users.push(user);
      return user;
    }),
  /**
   * Même garde tenant/scope que get() — jamais d'écriture sur un userId non
   * vérifié tenant-scoped. `tenantId`/`tenantName` sont explicitement
   * retirés du patch avant application : le tenant d'un utilisateur est fixé
   * à la création et n'est jamais réassignable via update(), même si un
   * appelant les inclut dans `patch` (défense service-side, cf. D1 et
   * l'audit §9 — la seule protection existante avant cette mission était le
   * `<select>` du formulaire, déjà restreint à un seul tenant mais pas
   * infranchissable côté service). D3 (`P0 RBAC`, validé) : si `patch`
   * contient `roleIds`, chaque rôle doit appartenir au même tenant que
   * l'utilisateur cible — un `roleId` d'un autre tenant refuse l'opération
   * entière (`undefined`), exactement le scénario interdit par le mandat
   * (`userService.update({ roleIds: [roleFromTenantB] })` sur un utilisateur
   * du Tenant A). `actorScope` (correctif sécurité, cf.
   * docs/P0_RBAC_SCOPE_SECURITY_FIX_REPORT.md) : un acteur `scope: 'tenant'`
   * ne peut affecter que des rôles `scope: 'tenant'` — même au sein de son
   * propre tenant, même si `rolesBelongToTenant` seule aurait laissé passer
   * l'opération. Note : `scope` (4ᵉ paramètre, hérité de D1 `users`) reste
   * réservé à la portée de la RECHERCHE du userId cible (`getTenantScoped`)
   * — un concept distinct de `actorScope`, qui gouverne uniquement le
   * niveau de rôle que l'acteur a le droit d'affecter. Ne jamais confondre
   * les deux, ni les fusionner en un seul paramètre.
   */
  update: (tenantId: string, userId: string, patch: Partial<UserInput> & { isActive?: boolean }, scope: PlatformScope = 'tenant', actorScope: PlatformScope = 'tenant') =>
    mockRequest(() => {
      const user = getTenantScoped(users, (item) => item.id === userId, tenantId, scope);
      if (!user) return undefined;
      if (patch.roleIds) {
        if (!rolesBelongToTenant(patch.roleIds, tenantId)) return undefined;
        if (!rolesWithinActorScope(patch.roleIds, tenantId, actorScope)) return undefined;
      }
      const safePatch = { ...patch };
      delete safePatch.tenantId;
      delete safePatch.tenantName;
      Object.assign(user, safePatch);
      return user;
    }),
};
