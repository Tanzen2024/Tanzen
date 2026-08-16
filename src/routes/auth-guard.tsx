import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '@/services/auth.service';

/**
 * Garde de session — voir `services/auth.service.ts` pour le détail de la
 * session locale (BACKEND PENDING : pas de vrai token, juste un drapeau
 * `localStorage`). Même principe que `PermissionRoute`/`PlatformScopeGuard`
 * (l'ancien `PlatformScopeGuard`, supprimé de ce projet lors de la
 * séparation Commercial/Tenant) : une vérification synchrone au rendu,
 * `<Navigate>` si elle échoue — pas de state React à synchroniser, pas de
 * context dédié. Cette vérification s'exécute à chaque nouveau rendu (donc
 * à chaque navigation), ce qui suffit : après `authService.logout()` suivi
 * d'une redirection vers `/login`, ce composant sort de l'arbre rendu et
 * n'est réévalué que si l'utilisateur retente une route protégée — auquel
 * cas il relit l'état à jour et redirige de nouveau.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  if (!authService.isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
