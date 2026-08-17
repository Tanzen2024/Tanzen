import { currentUser } from '@/mocks/rbac.mocks';
import { tenants } from '@/mocks/organization/tenants';

/**
 * Comptes système (Access & Security). Volontairement indépendant de
 * `Member` (mocks/organization/members.ts) : un utilisateur système gère
 * l'accès à l'application, un membre est un bénéficiaire de la tontine —
 * les deux concepts ne sont pas fusionnés, comme `SystemRole` et
 * `PositionRole` ne le sont pas non plus (voir mocks/rbac.mocks.ts).
 *
 * `U-001` reprend l'identité de `currentUser` (rbac.mocks.ts) plutôt que de
 * la redéfinir, pour ne pas dupliquer la fondation RBAC déjà posée.
 *
 * `isActive` (D3, cf. docs/P0_USERS_DECISIONS_A_VALIDER.md) remplace
 * l'ancien enum `status` à 4 valeurs (`active|inactive|suspended|invited`) :
 * le modèle canonique (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 6, feuille
 * `users` du dictionnaire) ne porte qu'un booléen `is_active`, sans enum.
 * `suspended`/`invited` n'ayant aucun fondement canonique, les anciennes
 * données de démonstration portant ces valeurs sont mappées à `false`
 * (désactivé) — la seule distinction qui subsiste est active/inactive.
 *
 * D1/D3 (P0 RBAC, cf. docs/P0_RBAC_IMPLEMENTATION_REPORT.md) : `roleIds`
 * référence désormais un `SystemRole` tenant-scopé — chaque utilisateur ci-
 * dessous porte l'identifiant de rôle propre à SON tenant (`role-manager`
 * pour T-001, `role-manager-T-002` pour T-002, etc., cf. mocks/rbac.mocks.ts).
 * Jamais un identifiant appartenant à un autre tenant que `user.tenantId`.
 */
export type MfaStatus = 'enabled' | 'disabled' | 'pending';
export type MfaMethod = 'authenticatorApp' | 'securityKey' | 'sms' | 'email' | 'none';

export type MfaDevice = {
  id: string;
  name: string;
  type: 'authenticatorApp' | 'securityKey' | 'mobile';
  registeredAt: string;
};

export type SystemUser = {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  email: string;
  isActive: boolean;
  roleIds: string[];
  mfaStatus: MfaStatus;
  mfaMethod: MfaMethod;
  mfaDevices: MfaDevice[];
  recoveryCodesRemaining: number;
  lastLoginAt: string | null;
  createdAt: string;
};

export const users: SystemUser[] = [
  { id: currentUser.id, tenantId: currentUser.tenantId, tenantName: tenants.find((tenant) => tenant.id === currentUser.tenantId)?.name ?? '', name: currentUser.name, email: currentUser.email, isActive: true, roleIds: currentUser.roleIds, mfaStatus: 'enabled', mfaMethod: 'authenticatorApp', mfaDevices: [{ id: 'MD-001', name: 'iPhone 14 · Google Authenticator', type: 'authenticatorApp', registeredAt: '2025-02-10' }], recoveryCodesRemaining: 8, lastLoginAt: '2026-08-12T08:05:00', createdAt: '2024-01-10' },
  { id: 'U-002', tenantId: 'T-001', tenantName: 'Coopérative Sutura', name: 'Fatou Ndiaye', email: 'fatou.ndiaye@sutura.sn', isActive: true, roleIds: ['role-manager'], mfaStatus: 'enabled', mfaMethod: 'authenticatorApp', mfaDevices: [{ id: 'MD-002', name: 'Samsung A34 · Authy', type: 'authenticatorApp', registeredAt: '2025-04-02' }], recoveryCodesRemaining: 10, lastLoginAt: '2026-08-11T17:20:00', createdAt: '2024-03-15' },
  { id: 'U-003', tenantId: 'T-001', tenantName: 'Coopérative Sutura', name: 'Cheikh Diop', email: 'cheikh.diop@sutura.sn', isActive: true, roleIds: ['role-viewer'], mfaStatus: 'disabled', mfaMethod: 'none', mfaDevices: [], recoveryCodesRemaining: 0, lastLoginAt: '2026-08-10T09:12:00', createdAt: '2024-04-01' },
  { id: 'U-004', tenantId: 'T-002', tenantName: 'Tontine Horizon', name: 'Mamadou Sow', email: 'mamadou.sow@horizon.sn', isActive: true, roleIds: ['role-manager-T-002'], mfaStatus: 'pending', mfaMethod: 'sms', mfaDevices: [{ id: 'MD-003', name: '+221 76 234 56 78', type: 'mobile', registeredAt: '2026-08-09' }], recoveryCodesRemaining: 0, lastLoginAt: '2026-08-09T14:40:00', createdAt: '2024-05-20' },
  { id: 'U-005', tenantId: 'T-002', tenantName: 'Tontine Horizon', name: 'Khadija Mbaye', email: 'khadija.mbaye@horizon.sn', isActive: false, roleIds: ['role-viewer-T-002'], mfaStatus: 'disabled', mfaMethod: 'none', mfaDevices: [], recoveryCodesRemaining: 0, lastLoginAt: null, createdAt: '2026-08-05' },
  { id: 'U-006', tenantId: 'T-003', tenantName: 'Mutuelle Teranga', name: 'Aïssatou Bâ', email: 'aissatou.ba@teranga.sn', isActive: true, roleIds: ['role-manager-T-003'], mfaStatus: 'enabled', mfaMethod: 'authenticatorApp', mfaDevices: [{ id: 'MD-004', name: 'Pixel 7 · Google Authenticator', type: 'authenticatorApp', registeredAt: '2025-01-18' }], recoveryCodesRemaining: 5, lastLoginAt: '2026-08-12T07:50:00', createdAt: '2023-11-08' },
  { id: 'U-007', tenantId: 'T-003', tenantName: 'Mutuelle Teranga', name: 'Ibrahima Sarr', email: 'ibrahima.sarr@teranga.sn', isActive: false, roleIds: ['role-viewer-T-003'], mfaStatus: 'disabled', mfaMethod: 'none', mfaDevices: [], recoveryCodesRemaining: 0, lastLoginAt: '2026-07-01T11:30:00', createdAt: '2023-12-01' },
  { id: 'U-008', tenantId: 'T-004', tenantName: 'Association Jappo', name: 'Ousmane Fall', email: 'ousmane.fall@jappo.sn', isActive: false, roleIds: ['role-viewer-T-004'], mfaStatus: 'disabled', mfaMethod: 'none', mfaDevices: [], recoveryCodesRemaining: 0, lastLoginAt: null, createdAt: '2026-07-20' },
  { id: 'U-009', tenantId: 'T-005', tenantName: 'Tontine Avenir', name: 'Awa Cissé', email: 'awa.cisse@avenir.sn', isActive: true, roleIds: ['role-manager-T-005'], mfaStatus: 'enabled', mfaMethod: 'authenticatorApp', mfaDevices: [{ id: 'MD-005', name: 'iPhone 13 · Google Authenticator', type: 'authenticatorApp', registeredAt: '2025-06-30' }], recoveryCodesRemaining: 9, lastLoginAt: '2026-08-11T19:05:00', createdAt: '2025-01-05' },
  { id: 'U-010', tenantId: 'T-005', tenantName: 'Tontine Avenir', name: 'Astou Diallo', email: 'astou.diallo@avenir.sn', isActive: true, roleIds: ['role-viewer-T-005'], mfaStatus: 'pending', mfaMethod: 'email', mfaDevices: [{ id: 'MD-006', name: 'astou.diallo@avenir.sn', type: 'mobile', registeredAt: '2026-08-11' }], recoveryCodesRemaining: 0, lastLoginAt: '2026-08-08T10:00:00', createdAt: '2026-02-14' },
  { id: 'U-011', tenantId: 'T-001', tenantName: 'Coopérative Sutura', name: 'Omar Kane', email: 'omar.kane@sutura.sn', isActive: false, roleIds: ['role-admin'], mfaStatus: 'disabled', mfaMethod: 'none', mfaDevices: [], recoveryCodesRemaining: 0, lastLoginAt: '2026-04-02T08:00:00', createdAt: '2023-09-01' },
  { id: 'U-012', tenantId: 'T-002', tenantName: 'Tontine Horizon', name: 'Bineta Sy', email: 'bineta.sy@horizon.sn', isActive: true, roleIds: ['role-admin-T-002'], mfaStatus: 'enabled', mfaMethod: 'securityKey', mfaDevices: [{ id: 'MD-007', name: 'YubiKey 5C', type: 'securityKey', registeredAt: '2025-09-12' }], recoveryCodesRemaining: 7, lastLoginAt: '2026-08-12T06:40:00', createdAt: '2024-02-28' },
];
