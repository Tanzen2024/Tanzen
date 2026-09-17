/**
 * CONFIGURATION uniquement (canaux, règles, préférences) — distinct de
 * `mocks/operations/notifications.ts` qui est la boîte de réception (les
 * messages eux-mêmes). Ce fichier ne contient aucun message, uniquement des
 * réglages ; il n'y a donc qu'une seule boîte de réception dans l'app
 * (Operations > Notifications).
 */
export type NotificationChannelType = 'email' | 'sms' | 'push' | 'inApp';

export type NotificationChannel = {
  id: string;
  tenantId: string;
  type: NotificationChannelType;
  enabled: boolean;
  destination: string;
};

export type NotificationRuleTrigger = 'loanOverdue' | 'applicationSubmitted' | 'workflowPending' | 'sessionRevoked' | 'memberJoined';

export type NotificationRule = {
  id: string;
  tenantId: string;
  trigger: NotificationRuleTrigger;
  channels: NotificationChannelType[];
  enabled: boolean;
};

export type NotificationPreference = {
  userId: string;
  trigger: NotificationRuleTrigger;
  email: boolean;
  push: boolean;
  inApp: boolean;
};

export const notificationChannels: NotificationChannel[] = [
  { id: 'NC-001', tenantId: 'T-001', type: 'email', enabled: true, destination: 'notifications@sutura.sn' },
  { id: 'NC-002', tenantId: 'T-001', type: 'sms', enabled: true, destination: '+221 33 824 00 11' },
  { id: 'NC-003', tenantId: 'T-001', type: 'push', enabled: false, destination: '—' },
  { id: 'NC-004', tenantId: 'T-001', type: 'inApp', enabled: true, destination: '—' },
  { id: 'NC-005', tenantId: 'T-002', type: 'email', enabled: true, destination: 'notifications@horizon.sn' },
  { id: 'NC-006', tenantId: 'T-002', type: 'sms', enabled: false, destination: '—' },
  { id: 'NC-007', tenantId: 'T-002', type: 'inApp', enabled: true, destination: '—' },
  { id: 'NC-008', tenantId: 'T-003', type: 'email', enabled: true, destination: 'notifications@teranga.sn' },
  { id: 'NC-009', tenantId: 'T-003', type: 'inApp', enabled: true, destination: '—' },
  { id: 'NC-010', tenantId: 'T-004', type: 'email', enabled: false, destination: '—' },
  { id: 'NC-011', tenantId: 'T-004', type: 'inApp', enabled: true, destination: '—' },
  { id: 'NC-012', tenantId: 'T-005', type: 'email', enabled: true, destination: 'notifications@avenir.sn' },
  { id: 'NC-013', tenantId: 'T-005', type: 'inApp', enabled: true, destination: '—' },
];

export const notificationRules: NotificationRule[] = [
  { id: 'NR-001', tenantId: 'T-001', trigger: 'loanOverdue', channels: ['email', 'sms', 'inApp'], enabled: true },
  { id: 'NR-002', tenantId: 'T-001', trigger: 'applicationSubmitted', channels: ['inApp'], enabled: true },
  { id: 'NR-004', tenantId: 'T-001', trigger: 'workflowPending', channels: ['inApp'], enabled: true },
  { id: 'NR-005', tenantId: 'T-001', trigger: 'sessionRevoked', channels: ['email'], enabled: true },
  { id: 'NR-006', tenantId: 'T-001', trigger: 'memberJoined', channels: ['inApp'], enabled: false },
  { id: 'NR-007', tenantId: 'T-002', trigger: 'loanOverdue', channels: ['email', 'inApp'], enabled: true },
  { id: 'NR-009', tenantId: 'T-003', trigger: 'loanOverdue', channels: ['email'], enabled: true },
  { id: 'NR-010', tenantId: 'T-005', trigger: 'applicationSubmitted', channels: ['inApp'], enabled: true },
];

export const notificationPreferences: NotificationPreference[] = [
  { userId: 'U-001', trigger: 'loanOverdue', email: true, push: false, inApp: true },
  { userId: 'U-001', trigger: 'applicationSubmitted', email: false, push: false, inApp: true },
  { userId: 'U-001', trigger: 'workflowPending', email: false, push: false, inApp: true },
  { userId: 'U-001', trigger: 'sessionRevoked', email: true, push: false, inApp: true },
  { userId: 'U-001', trigger: 'memberJoined', email: false, push: false, inApp: false },
];
