/**
 * Fondation RBAC (rôles système / permissions techniques), distincte des
 * rôles métier de Gouvernance (`PositionRole` dans mocks/organization/members.ts :
 * président, trésorier, secrétaire...). Un `SystemRole` détermine ce qu'un
 * utilisateur peut faire dans l'application ; un `PositionRole` décrit une
 * fonction élue au sein d'un tenant. Les deux ne doivent jamais être fusionnés.
 *
 * Les écrans Users/Roles/Permissions (Access & Security) ne sont pas
 * construits ici — seule la fondation (types, contexte, garde) l'est.
 */

/** Format `module.action`, ex. "members.read", "loans.approve". */
export type Permission = string;

/**
 * Portée d'accès inter-tenant. Ne concerne QUE les répertoires transverses
 * (registre Organization > Tenants, comptes système d'Access & Security) —
 * jamais les données métier d'un tenant (Member/Account/Loan/Tontine/Cycle/
 * WorkflowRequest...), qui restent strictement isolées au tenant courant
 * quel que soit le scope de l'utilisateur (voir services/tenant-scope.ts).
 * - 'tenant'   : ne voit que le tenant actuellement sélectionné.
 * - 'platform' : peut consulter les répertoires transverses au-delà du
 *                 tenant sélectionné (ex. un opérateur plateforme).
 */
export type PlatformScope = 'tenant' | 'platform';

export type SystemRole = {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  scope: PlatformScope;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  roleIds: string[];
  /** Permissions effectives résolues (union des permissions des rôles assignés). */
  permissions: Permission[];
  /** Le plus large des scopes parmi les rôles assignés ('platform' l'emporte sur 'tenant'). */
  scope: PlatformScope;
};

export const permissionCatalog: Permission[] = [
  'dashboard.read',
  'tenants.read', 'tenants.create', 'tenants.update',
  'plans.read', 'subscriptions.read', 'payments.read', 'billing.read', 'platformAudit.read',
  'members.read', 'members.create', 'members.update', 'members.delete',
  'governance.read', 'governance.create', 'governance.approve',
  'accounts.read', 'accounts.create',
  'transactions.read', 'transactions.export',
  'contributions.read',
  'distributions.read', 'distributions.create', 'distributions.approve',
  'applications.read', 'applications.create', 'applications.approve',
  'loans.read', 'loans.create', 'loans.approve',
  'repayments.read', 'repayments.create',
  'guarantors.read', 'guarantors.create',
  'tontines.read', 'tontines.create',
  'cycles.read', 'cycles.create', 'cycles.manage',
  'draws.read', 'draws.manage',
  'workflows.read', 'workflows.create', 'workflows.manage',
  'notifications.read', 'notifications.manage',
  'documents.read', 'documents.create', 'documents.delete', 'documents.download',
  'users.read', 'users.create', 'users.update', 'users.delete',
  'roles.read', 'roles.create', 'roles.update', 'roles.delete',
  'permissions.read',
  'sessions.read', 'sessions.revoke',
  'mfa.read', 'mfa.manage',
  'audit.read', 'audit.readSensitive',
  'settings.read', 'localization.manage', 'fiscalYears.read', 'fiscalYears.manage',
  'branding.manage', 'notificationSettings.read', 'notificationSettings.manage',
  'securityPolicies.manage', 'modules.manage', 'integrations.manage',
];

export const systemRoles: SystemRole[] = [
  {
    id: 'role-admin', name: 'Administrateur Tenant', description: "Accès complet, avec visibilité inter-tenant sur les répertoires transverses (registre des tenants, comptes système).",
    permissions: permissionCatalog, scope: 'platform',
  },
  {
    id: 'role-manager', name: 'Gestionnaire', description: 'Gestion opérationnelle sans suppression ni approbation finale, restreinte au tenant courant.',
    permissions: permissionCatalog.filter((permission) => !permission.endsWith('.delete') && !permission.endsWith('.approve')), scope: 'tenant',
  },
  {
    id: 'role-viewer', name: 'Lecture seule', description: 'Consultation uniquement, restreinte au tenant courant.',
    permissions: permissionCatalog.filter((permission) => permission.endsWith('.read')), scope: 'tenant',
  },
];

function resolveScope(roleIds: string[]): PlatformScope {
  const roles = roleIds.map((id) => systemRoles.find((role) => role.id === id)).filter((role): role is SystemRole => Boolean(role));
  return roles.some((role) => role.scope === 'platform') ? 'platform' : 'tenant';
}

/**
 * Utilisateur courant mocké (pas d'authentification réelle). Rattaché à
 * role-admin pour ne pas masquer les écrans déjà construits — à remplacer
 * par un vrai flux de connexion quand un vrai système d'authentification
 * sera construit.
 */
export const currentUser: CurrentUser = {
  id: 'U-001',
  name: 'Amadou Mbaye',
  email: 'amadou.mbaye@sutura.sn',
  tenantId: 'T-001',
  roleIds: ['role-admin'],
  permissions: systemRoles.find((role) => role.id === 'role-admin')?.permissions ?? [],
  scope: resolveScope(['role-admin']),
};
