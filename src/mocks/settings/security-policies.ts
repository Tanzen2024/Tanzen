import type { MfaMethod } from '@/mocks/access/users';

export type PasswordPolicy = {
  tenantId: string;
  minLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  expiryDays: number;
  preventReuseCount: number;
};

export type SessionPolicy = {
  tenantId: string;
  idleTimeoutMinutes: number;
  maxConcurrentSessions: number;
  rememberMeDays: number;
};

export type MfaPolicy = {
  tenantId: string;
  enforced: boolean;
  graceLoginCount: number;
  allowedMethods: MfaMethod[];
};

export type LoginPolicy = {
  tenantId: string;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  allowedIpRanges: string[];
};

export const passwordPolicies: PasswordPolicy[] = [
  { tenantId: 'T-001', minLength: 12, requireUppercase: true, requireNumber: true, requireSymbol: true, expiryDays: 90, preventReuseCount: 5 },
  { tenantId: 'T-002', minLength: 10, requireUppercase: true, requireNumber: true, requireSymbol: false, expiryDays: 180, preventReuseCount: 3 },
  { tenantId: 'T-003', minLength: 10, requireUppercase: false, requireNumber: true, requireSymbol: false, expiryDays: 0, preventReuseCount: 0 },
  { tenantId: 'T-004', minLength: 8, requireUppercase: false, requireNumber: true, requireSymbol: false, expiryDays: 0, preventReuseCount: 0 },
  { tenantId: 'T-005', minLength: 10, requireUppercase: true, requireNumber: true, requireSymbol: false, expiryDays: 120, preventReuseCount: 3 },
];

export const sessionPolicies: SessionPolicy[] = [
  { tenantId: 'T-001', idleTimeoutMinutes: 30, maxConcurrentSessions: 3, rememberMeDays: 14 },
  { tenantId: 'T-002', idleTimeoutMinutes: 45, maxConcurrentSessions: 5, rememberMeDays: 30 },
  { tenantId: 'T-003', idleTimeoutMinutes: 60, maxConcurrentSessions: 5, rememberMeDays: 30 },
  { tenantId: 'T-004', idleTimeoutMinutes: 60, maxConcurrentSessions: 5, rememberMeDays: 30 },
  { tenantId: 'T-005', idleTimeoutMinutes: 30, maxConcurrentSessions: 3, rememberMeDays: 14 },
];

export const mfaPolicies: MfaPolicy[] = [
  { tenantId: 'T-001', enforced: true, graceLoginCount: 3, allowedMethods: ['authenticatorApp', 'securityKey', 'sms'] },
  { tenantId: 'T-002', enforced: false, graceLoginCount: 5, allowedMethods: ['authenticatorApp', 'sms', 'email'] },
  { tenantId: 'T-003', enforced: false, graceLoginCount: 5, allowedMethods: ['authenticatorApp', 'sms'] },
  { tenantId: 'T-004', enforced: false, graceLoginCount: 5, allowedMethods: ['sms'] },
  { tenantId: 'T-005', enforced: true, graceLoginCount: 3, allowedMethods: ['authenticatorApp', 'email'] },
];

export const loginPolicies: LoginPolicy[] = [
  { tenantId: 'T-001', maxFailedAttempts: 5, lockoutMinutes: 15, allowedIpRanges: [] },
  { tenantId: 'T-002', maxFailedAttempts: 5, lockoutMinutes: 15, allowedIpRanges: [] },
  { tenantId: 'T-003', maxFailedAttempts: 8, lockoutMinutes: 10, allowedIpRanges: [] },
  { tenantId: 'T-004', maxFailedAttempts: 8, lockoutMinutes: 10, allowedIpRanges: [] },
  { tenantId: 'T-005', maxFailedAttempts: 5, lockoutMinutes: 15, allowedIpRanges: ['196.1.88.0/24'] },
];
