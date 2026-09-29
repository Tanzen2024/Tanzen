import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { currentUser, type CurrentUser, type Permission } from '@/mocks/rbac.mocks';
import { actAsDemoUser } from '@/mocks/demo-identity';

type PermissionContextValue = {
  user: CurrentUser;
  /**
   * `entityType` est optionnel et documente sur quel type d'entité l'action
   * porte (ex. `can('loans.approve', 'loan')`) — la vérification RBAC reste
   * basée sur la permission elle-même ; ce second paramètre prépare une
   * future granularité par entité sans changer les appels existants.
   */
  can: (permission: Permission, entityType?: string) => boolean;
  /**
   * Agir en tant qu'un autre utilisateur actif du tenant (identité de démonstration, cf.
   * `@/mocks/demo-identity` — aucune authentification réelle n'existe). Toutes les requêtes sont
   * invalidées : « Mes approbations », notifications… dépendent de l'utilisateur.
   */
  actAs: (userId: string) => void;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // `currentUser` est muté en place par `actAsDemoUser` : l'identifiant sert de révision pour recalculer la valeur.
  const [userId, setUserId] = useState(currentUser.id);
  const actAs = useCallback((nextUserId: string) => {
    if (actAsDemoUser(nextUserId)) setUserId(currentUser.id);
  }, []);
  // Invalidation APRÈS le rendu sous la nouvelle identité : les `queryFn` refetchées lisent alors le nouvel utilisateur (pas l'ancienne closure).
  const previousUserId = useRef(userId);
  useEffect(() => {
    if (previousUserId.current === userId) return;
    previousUserId.current = userId;
    void queryClient.invalidateQueries();
  }, [userId, queryClient]);
  const value = useMemo<PermissionContextValue>(
    () => ({ user: { ...currentUser }, can: (permission) => currentUser.permissions.includes(permission), actAs }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `userId` est la révision de `currentUser` (muté en place).
    [userId, actAs],
  );
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (!context) throw new Error('usePermissions must be used inside PermissionProvider');
  return context;
}
