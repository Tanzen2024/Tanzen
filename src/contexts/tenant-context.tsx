import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { tenants as allTenants, type Tenant } from '@/mocks/organization/tenants';
import { currentUser } from '@/mocks/rbac.mocks';

type TenantContextValue = {
  tenants: Tenant[];
  currentTenant: Tenant;
};

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * Isolation stricte (cf. docs/FIX_TENANT_APP_SINGLE_TENANT.md) : l'Application
 * Tenant ne connaît qu'UN SEUL tenant — celui de l'utilisateur connecté —
 * quel que soit son scope RBAC. Il n'existe plus de mécanisme de sélection
 * ni de bascule : `tenants` ne contient jamais que ce tenant, calculé une
 * fois au niveau module, jamais depuis `localStorage` (aucune valeur externe
 * n'est même lue). Le registre complet des tenants reste disponible, mais
 * exclusivement dans la couche Platform (`organizationService.listTenants`,
 * consommé par `/platform/tenants`) — jamais via ce contexte.
 */
const ownTenant: Tenant = allTenants.find((tenant) => tenant.id === currentUser.tenantId) ?? allTenants[0];
const scopedTenants: Tenant[] = [ownTenant];

export function TenantProvider({ children }: { children: ReactNode }) {
  const value = useMemo<TenantContextValue>(() => ({ tenants: scopedTenants, currentTenant: ownTenant }), []);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) throw new Error('useTenant must be used inside TenantProvider');
  return context;
}
