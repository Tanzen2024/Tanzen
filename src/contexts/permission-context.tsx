import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { currentUser, type CurrentUser, type Permission } from '@/mocks/rbac.mocks';

type PermissionContextValue = {
  user: CurrentUser;
  /**
   * `entityType` est optionnel et documente sur quel type d'entité l'action
   * porte (ex. `can('loans.approve', 'loan')`) — la vérification RBAC reste
   * basée sur la permission elle-même ; ce second paramètre prépare une
   * future granularité par entité sans changer les appels existants.
   */
  can: (permission: Permission, entityType?: string) => boolean;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const value = useMemo<PermissionContextValue>(
    () => ({ user: currentUser, can: (permission) => currentUser.permissions.includes(permission) }),
    [],
  );
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (!context) throw new Error('usePermissions must be used inside PermissionProvider');
  return context;
}
