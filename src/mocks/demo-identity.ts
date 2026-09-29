import { currentUser, resolveScope, systemRoles, type CurrentUser } from '@/mocks/rbac.mocks';
import { users, type SystemUser } from '@/mocks/access/users';

/**
 * IDENTITÉ DE DÉMONSTRATION (mandat « Demande de prêt absente de Mes approbations », 2026-09-28).
 *
 * Aucune authentification réelle n'existe (`authService.login` → BACKEND_PENDING) : l'application
 * tourne toujours sous `currentUser`. Or les workflows à séparation des tâches (saisisseur ≠
 * approbateur, 1er ≠ 2e approbateur) ne peuvent être exercés qu'avec un AUTRE utilisateur habilité.
 *
 * Ce module fait « agir en tant que » un utilisateur ACTIF du même tenant. Il mute `currentUser`
 * EN PLACE (même référence) : tous les services qui lisent `currentUser` à l'appel (acteurs d'audit,
 * `permissionsOfUser`, demandeur…) suivent donc l'identité choisie. Les permissions sont celles des
 * rôles réellement assignés à l'utilisateur, jamais élargies. À remplacer par la vraie session le
 * jour où le backend d'authentification existera.
 */
const initialIdentity: CurrentUser = { ...currentUser, roleIds: [...currentUser.roleIds], permissions: [...currentUser.permissions] };

/** Utilisateurs sous lesquels on peut agir : actifs, du tenant de l'utilisateur initial. */
export function demoIdentityCandidates(): SystemUser[] {
  return users.filter((user) => user.tenantId === initialIdentity.tenantId && user.isActive);
}

/** Agit en tant que `userId` (utilisateur actif du tenant) ; `false` sans aucun effet sinon. */
export function actAsDemoUser(userId: string): boolean {
  if (userId === initialIdentity.id) { resetDemoIdentity(); return true; }
  const user = demoIdentityCandidates().find((item) => item.id === userId);
  if (!user) return false;
  const permissions = [...new Set(user.roleIds.flatMap((roleId) => systemRoles.find((role) => role.id === roleId)?.permissions ?? []))];
  Object.assign(currentUser, { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId, roleIds: [...user.roleIds], permissions, scope: resolveScope(user.roleIds) });
  return true;
}

/** Retour à l'identité initiale (U-001) — aussi appelé après chaque test (src/test/setup.ts). */
export function resetDemoIdentity() {
  Object.assign(currentUser, { ...initialIdentity, roleIds: [...initialIdentity.roleIds], permissions: [...initialIdentity.permissions] });
}
