import type { ReactNode } from 'react';

/**
 * BACKEND PENDING — aucune authentification réelle n'existe encore
 * (`currentUser` dans `mocks/rbac.mocks.ts` est une constante toujours
 * "connectée", pas un état de session). Un vrai `AuthGuard` redirigerait
 * vers `/login` en l'absence de session valide ; il n'y a aujourd'hui rien
 * de réel à vérifier, donc ce garde reste un passthrough explicite plutôt
 * que d'inventer une logique de session fictive. Même principe que
 * `PlatformScopeGuard`/`PermissionRoute` (qui eux vérifient un `scope`/
 * `permission` réels, dérivés du RBAC mocké) — quand une authentification
 * réelle existera, c'est ici que la vérification de session prendra place,
 * sans changer l'emplacement de la garde dans l'arbre de routes.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
