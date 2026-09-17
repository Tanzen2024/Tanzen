import { tenants } from '@/mocks/organization/tenants';

/**
 * Fondation RBAC (rôles système / permissions techniques), distincte des
 * rôles métier de Gouvernance (`PositionRole` dans mocks/organization/members.ts :
 * président, trésorier, secrétaire...). Un `SystemRole` détermine ce qu'un
 * utilisateur peut faire dans l'application ; un `PositionRole` décrit une
 * fonction élue au sein d'un tenant. Les deux ne doivent jamais être fusionnés.
 */

/** Format `module.action`, ex. "members.read", "loans.approve". */
export type Permission = string;

/**
 * Marqueur RBAC hérité, PAS un `tenant_id`. Depuis D1 (P0 RBAC, cf.
 * docs/P0_RBAC_IMPLEMENTATION_REPORT.md), `SystemRole` porte son propre
 * `tenantId` — la portée inter-tenant que ce champ décrivait historiquement
 * n'existe plus nulle part dans `tanzen-frontend` (déjà neutralisée pour
 * `users`/`sessions` par D1 de la mission `users`, désormais également
 * neutralisée pour `roles` lui-même). `scope` ne sert plus qu'à distinguer,
 * *au sein du catalogue d'un même tenant*, le rôle le plus élevé (« platform »)
 * des rôles ordinaires (« tenant ») — un vestige de nommage conservé pour ne
 * pas casser `RolePicker`/`resolveScope()`, jamais une capacité inter-tenant
 * réelle dans ce projet.
 */
export type PlatformScope = 'tenant' | 'platform';

export type SystemRole = {
  id: string;
  /** D1 (validé) : chaque rôle appartient à un seul tenant — jamais partagé entre tenants, jamais global. */
  tenantId: string;
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
  /** `members.approve` (mandat « Moteur générique de workflow de validation ») — distincte de `members.update` (soumettre) : étape d'approbation de la demande de modification WD-007. Suit `roleTemplates` ci-dessous : exclue de role-manager (filtre `.approve`), incluse dans role-admin (catalogue complet). */
  'members.read', 'members.create', 'members.update', 'members.delete', 'members.approve',
  'governance.read', 'governance.create', 'governance.approve', 'governance.update', 'governance.delete',
  /** `boardPositions.manage` (mandat « Fonctions / mandats ») — gère le RÉFÉRENTIEL de fonctions (créer/modifier/activer/désactiver), distincte de `governance.create` qui reste la permission pour attribuer un MANDAT (choisir une fonction existante). Un utilisateur avec seulement `governance.create` peut ajouter un mandat mais pas créer de nouvelle fonction. */
  'boardPositions.manage',
  'accounts.read', 'accounts.create', 'accounts.update', 'accounts.delete', 'accounts.manage',
  'transactions.read', 'transactions.export', 'transactions.create', 'transactions.update', 'transactions.cancel',
  'contributions.read',
  'distributions.read', 'distributions.create', 'distributions.approve',
  'applications.read', 'applications.create', 'applications.approve',
  'loans.read', 'loans.create', 'loans.approve',
  'repayments.read', 'repayments.create',
  'guarantors.read', 'guarantors.create',
  'loanRules.manage',
  /** Domaine Tontines (reconstruction complète) : `cycles.*`/`draws.*` (ancien modèle Cycle/Draw, supprimé) retirés — plus aucune trace de terminologie Cycle/Draw dans le catalogue. `beneficiaries.manage` couvre à la fois les `OccurrenceBeneficiary` (avec-achat), les `TontineBeneficiaryPlan` (sans-achat) et leur permutation (même capacité métier : décider qui bénéficie, et dans quel ordre) — aucune permission dédiée « plans »/« permutations » introduite, pour ne pas dupliquer une même capacité sous plusieurs clés. */
  'tontines.read', 'tontines.create', 'tontines.update',
  'beneficiaries.manage',
  'adhesions.read', 'adhesions.manage',
  'contributions.manage',
  'workflows.read', 'workflows.create', 'workflows.manage',
  'notifications.read', 'notifications.manage',
  'documents.read', 'documents.create', 'documents.delete', 'documents.download',
  'users.read', 'users.create', 'users.update', 'users.delete',
  'roles.read', 'roles.create', 'roles.update', 'roles.delete',
  'permissions.read',
  'sessions.read', 'sessions.revoke',
  'mfa.read', 'mfa.manage',
  'audit.read', 'audit.readSensitive',
  'settings.read', 'localization.manage', 'fiscalYears.read', 'fiscalYears.manage', 'fiscalYears.approve',
  'branding.manage', 'notificationSettings.read', 'notificationSettings.manage',
  'securityPolicies.manage', 'modules.manage', 'integrations.manage',
];

type RoleTemplate = { key: string; name: string; description: string; scope: PlatformScope; permissions: Permission[] };

const roleTemplates: RoleTemplate[] = [
  { key: 'role-admin', name: 'Administrateur Tenant', description: 'Accès complet aux fonctionnalités du tenant courant.', scope: 'platform', permissions: permissionCatalog },
  { key: 'role-manager', name: 'Gestionnaire', description: 'Gestion opérationnelle sans suppression ni approbation finale, restreinte au tenant courant.', scope: 'tenant', permissions: permissionCatalog.filter((permission) => !permission.endsWith('.delete') && !permission.endsWith('.approve')) },
  { key: 'role-viewer', name: 'Lecture seule', description: 'Consultation uniquement, restreinte au tenant courant.', scope: 'tenant', permissions: permissionCatalog.filter((permission) => permission.endsWith('.read')) },
];

/**
 * D1 (validé, cf. docs/P0_RBAC_IMPLEMENTATION_REPORT.md) : chaque tenant
 * possède sa PROPRE instance des 3 rôles de base — jamais partagée. Avant
 * cette mission, `systemRoles` était un catalogue global à 3 entrées ; il
 * est désormais généré une fois par tenant (5 tenants × 3 rôles = 15
 * entrées avec le jeu de données actuel). T-001 conserve les identifiants
 * historiques (`role-admin`/`role-manager`/`role-viewer`, sans suffixe) —
 * uniquement pour ne pas casser les nombreux tests/mocks déjà écrits contre
 * ces chaînes littérales ; les autres tenants reçoivent un identifiant
 * suffixé (`role-admin-T-002`, etc.). Aucune signification n'est attachée à
 * la présence ou l'absence du suffixe — ce sont de simples identifiants
 * opaques, uniques dans l'ensemble du tableau.
 */
export const systemRoles: SystemRole[] = tenants.flatMap((tenant) =>
  roleTemplates.map((template) => ({
    id: tenant.id === 'T-001' ? template.key : `${template.key}-${tenant.id}`,
    tenantId: tenant.id,
    name: template.name,
    description: template.description,
    permissions: template.permissions,
    scope: template.scope,
  })),
);

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
