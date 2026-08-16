import { Check, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Permission } from '@/mocks/rbac.mocks';

type T = (section: 'access', key: string, values?: Record<string, string>) => string;

export const MODULE_KEY: Record<string, string> = {
  tenants: 'moduleTenants', members: 'moduleMembers', governance: 'moduleGovernance', accounts: 'moduleAccounts', transactions: 'moduleTransactions', contributions: 'moduleContributions', distributions: 'moduleDistributions', applications: 'moduleApplications', loans: 'moduleLoans', repayments: 'moduleRepayments', guarantors: 'moduleGuarantors', tontines: 'moduleTontines', cycles: 'moduleCycles', draws: 'moduleDraws', workflows: 'moduleWorkflows', notifications: 'moduleNotifications', documents: 'moduleDocuments', users: 'moduleUsers', roles: 'moduleRoles', permissions: 'modulePermissions', sessions: 'moduleSessions', mfa: 'moduleMfa',
};

export const ACTION_KEY: Record<string, string> = {
  read: 'actionRead', create: 'actionCreate', update: 'actionUpdate', delete: 'actionDelete', approve: 'actionApprove', export: 'actionExport', manage: 'actionManage', revoke: 'actionRevoke', download: 'actionDownload',
};

export function splitPermission(permission: Permission): { module: string; action: string } {
  const [module, action] = permission.split('.');
  return { module: module ?? permission, action: action ?? '' };
}

export function groupByModule(permissions: Permission[]): [string, Permission[]][] {
  const groups = new Map<string, Permission[]>();
  permissions.forEach((permission) => {
    const { module } = splitPermission(permission);
    groups.set(module, [...(groups.get(module) ?? []), permission]);
  });
  return [...groups.entries()];
}

/** Matrice Module / Action / Allowed — dérivée de `permissionCatalog` (mocks/rbac.mocks.ts), jamais une liste de permissions inventée. */
export function PermissionMatrix({ t, permissions, allowed }: { t: T; permissions: Permission[]; allowed: Set<Permission> }) {
  const grouped = groupByModule(permissions);
  return <div role="list" aria-label={t('access', 'permissionMatrix')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {grouped.map(([module, modulePermissions]) => <Card key={module} role="listitem">
      <CardHeader><CardTitle className="text-sm">{t('access', MODULE_KEY[module] ?? module)}</CardTitle></CardHeader>
      <CardContent role="list" className="space-y-2 p-4 pt-0">
        {modulePermissions.map((permission) => {
          const { action } = splitPermission(permission);
          const isAllowed = allowed.has(permission);
          const stateLabel = t('access', isAllowed ? 'allowed' : 'notAllowed');
          const actionLabel = t('access', ACTION_KEY[action] ?? action);
          return <div key={permission} role="listitem" className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
            <span className="min-w-0"><span className="block font-medium">{actionLabel}</span><span className="block truncate font-mono text-[11px] text-muted-foreground" title={permission}>{permission}</span></span>
            <span role="img" aria-label={`${actionLabel} — ${stateLabel}`} title={stateLabel} className={`grid size-6 shrink-0 place-items-center rounded-full ${isAllowed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{isAllowed ? <Check size={13} aria-hidden="true" /> : <Minus size={13} aria-hidden="true" />}</span>
          </div>;
        })}
      </CardContent>
    </Card>)}
  </div>;
}
