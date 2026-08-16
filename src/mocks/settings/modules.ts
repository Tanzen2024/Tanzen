/**
 * Administration des modules (activation par tenant). Volontairement une
 * simple liste avec interrupteurs — ce n'est PAS une navigation métier :
 * aucune ligne ne mène vers l'écran du module qu'elle décrit.
 */
export type ModuleKey = 'dashboard' | 'organization' | 'finance' | 'credit' | 'tontines' | 'operations' | 'accessSecurity' | 'audit' | 'settings';

export type ModuleConfig = {
  key: ModuleKey;
  tenantId: string;
  enabled: boolean;
  /** Permission nécessaire pour que l'utilisateur courant voie ce module — `null` = toujours visible. */
  requiredPermission: string | null;
};

const MODULE_KEYS: ModuleKey[] = ['dashboard', 'organization', 'finance', 'credit', 'tontines', 'operations', 'accessSecurity', 'audit', 'settings'];
const REQUIRED_PERMISSION: Record<ModuleKey, string | null> = {
  dashboard: null,
  organization: 'tenants.read',
  finance: 'accounts.read',
  credit: 'applications.read',
  tontines: 'tontines.read',
  operations: 'workflows.read',
  accessSecurity: 'users.read',
  audit: 'audit.read',
  settings: 'settings.read',
};

function tenantModules(tenantId: string, disabled: ModuleKey[] = []): ModuleConfig[] {
  return MODULE_KEYS.map((key) => ({ key, tenantId, enabled: !disabled.includes(key), requiredPermission: REQUIRED_PERMISSION[key] }));
}

export const moduleConfigs: ModuleConfig[] = [
  ...tenantModules('T-001'),
  ...tenantModules('T-002'),
  ...tenantModules('T-003'),
  ...tenantModules('T-004', ['credit', 'audit']),
  ...tenantModules('T-005'),
];
