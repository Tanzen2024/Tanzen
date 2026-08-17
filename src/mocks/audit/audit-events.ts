import type { WorkflowDomain } from '@/mocks/operations/workflow-definitions';

/**
 * Source canonique et UNIQUE des événements d'audit. Les onglets « Activité »
 * déjà présents sur les fiches Membre/Prêt/Cycle et l'historique Operations
 * (workflowService.listHistory) restent des vues contextualisées du même
 * concept — ce fichier ne les duplique pas : `audit.service.ts` compose ce
 * tableau avec les actions de workflow réelles (dérivées à la volée), il ne
 * les recopie pas en dur ici. Aucun autre module ne doit créer son propre
 * tableau d'événements d'audit.
 */
export type AuditModule = WorkflowDomain | 'organization' | 'access' | 'system';
export type AuditEventType = 'loginSuccess' | 'loginFailure' | 'mfaEvent' | 'permissionDenied' | 'sessionRevoked' | 'sensitiveAction' | 'action';
export type AuditStatus = 'success' | 'failure';

export type AuditEvent = {
  id: string;
  tenantId: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  module: AuditModule;
  action: string;
  eventType: AuditEventType;
  resourceType: string;
  resourceId: string;
  resourceLabel: string;
  status: AuditStatus;
  sensitive: boolean;
  correlationId: string;
  before?: Record<string, string | number>;
  after?: Record<string, string | number>;
  context?: Record<string, string | number>;
};

export const auditEvents: AuditEvent[] = [
  // --- Événements de sécurité (aucun équivalent ailleurs dans l'app) ---
  { id: 'AUD-SEC-001', tenantId: 'T-001', timestamp: '2026-08-12T08:05:00', actorId: 'U-001', actorName: 'Amadou Mbaye', module: 'access', action: 'auth.login', eventType: 'loginSuccess', resourceType: 'session', resourceId: 'SS-001', resourceLabel: 'Session SS-001 · MacBook Pro', status: 'success', sensitive: false, correlationId: 'COR-2026-0101' },
  { id: 'AUD-SEC-002', tenantId: 'T-001', timestamp: '2026-08-11T22:14:00', actorId: '—', actorName: 'Inconnu', module: 'access', action: 'auth.login', eventType: 'loginFailure', resourceType: 'account', resourceId: 'amadou.mbaye@sutura.sn', resourceLabel: 'Tentative sur amadou.mbaye@sutura.sn', status: 'failure', sensitive: true, correlationId: 'COR-2026-0102', context: { reason: 'Mot de passe invalide', attempts: 3 } },
  { id: 'AUD-SEC-003', tenantId: 'T-002', timestamp: '2026-08-09T14:38:00', actorId: 'U-004', actorName: 'Mamadou Sow', module: 'access', action: 'mfa.manage', eventType: 'mfaEvent', resourceType: 'user', resourceId: 'U-004', resourceLabel: 'Mamadou Sow', status: 'success', sensitive: true, correlationId: 'COR-2026-0103', context: { method: 'sms', outcome: 'enrollmentPending' } },
  { id: 'AUD-SEC-004', tenantId: 'T-003', timestamp: '2026-07-05T10:02:00', actorId: 'U-007', actorName: 'Ibrahima Sarr', module: 'credit', action: 'loans.approve', eventType: 'permissionDenied', resourceType: 'loan', resourceId: 'L-005', resourceLabel: 'Prêt L-005 · Ibrahima Sarr', status: 'failure', sensitive: true, correlationId: 'COR-2026-0104', context: { requiredPermission: 'loans.approve' } },
  { id: 'AUD-SEC-005', tenantId: 'T-002', timestamp: '2026-07-25T15:00:00', actorId: 'U-012', actorName: 'Bineta Sy', module: 'access', action: 'sessions.revoke', eventType: 'sessionRevoked', resourceType: 'session', resourceId: 'SS-007', resourceLabel: 'Session SS-007 · iPad Air', status: 'success', sensitive: true, correlationId: 'COR-2026-0105' },
  { id: 'AUD-SEC-006', tenantId: 'T-003', timestamp: '2026-07-01T11:35:00', actorId: 'U-006', actorName: 'Aïssatou Bâ', module: 'access', action: 'sessions.revoke', eventType: 'sessionRevoked', resourceType: 'session', resourceId: 'SS-009', resourceLabel: 'Session SS-009 · Redmi Note 12', status: 'success', sensitive: true, correlationId: 'COR-2026-0106' },
  { id: 'AUD-SEC-007', tenantId: 'T-001', timestamp: '2026-08-01T09:00:00', actorId: 'U-001', actorName: 'Amadou Mbaye', module: 'access', action: 'users.update', eventType: 'sensitiveAction', resourceType: 'user', resourceId: 'U-011', resourceLabel: 'Omar Kane', status: 'success', sensitive: true, correlationId: 'COR-2026-0107', before: { status: 'active' }, after: { status: 'inactive' } },
  { id: 'AUD-SEC-008', tenantId: 'T-005', timestamp: '2026-08-11T18:50:00', actorId: 'U-009', actorName: 'Awa Cissé', module: 'access', action: 'auth.login', eventType: 'loginSuccess', resourceType: 'session', resourceId: 'SS-010', resourceLabel: 'Session SS-010 · iPhone 13', status: 'success', sensitive: false, correlationId: 'COR-2026-0108' },
  { id: 'AUD-SEC-009', tenantId: 'T-001', timestamp: '2026-08-10T09:15:00', actorId: 'U-003', actorName: 'Cheikh Diop', module: 'access', action: 'mfa.manage', eventType: 'mfaEvent', resourceType: 'user', resourceId: 'U-003', resourceLabel: 'Cheikh Diop', status: 'failure', sensitive: true, correlationId: 'COR-2026-0109', context: { method: 'none' } },
  { id: 'AUD-SEC-010', tenantId: 'T-002', timestamp: '2026-08-06T09:40:00', actorId: 'U-005', actorName: 'Khadija Mbaye', module: 'finance', action: 'distributions.approve', eventType: 'permissionDenied', resourceType: 'distribution', resourceId: 'DI-004', resourceLabel: 'Distribution DI-004 · Mamadou Sow', status: 'failure', sensitive: true, correlationId: 'COR-2026-0110' },

  // --- Actions générales, cohérentes avec les entités déjà existantes (Organization/Finance/Tontines/Gouvernance) ---
  { id: 'AUD-001', tenantId: 'T-001', timestamp: '2026-07-22T10:05:00', actorId: 'U-001', actorName: 'Amadou Mbaye', module: 'credit', action: 'loans.approve', eventType: 'action', resourceType: 'loan', resourceId: 'L-001', resourceLabel: 'Prêt L-001 · Fatou Ndiaye', status: 'success', sensitive: true, correlationId: 'WR-003', before: { stage: 'stageApproved' }, after: { stage: 'stageDisbursed' }, context: { amount: 850000 } },
  { id: 'AUD-002', tenantId: 'T-003', timestamp: '2026-07-01T08:00:00', actorId: 'U-006', actorName: 'Aïssatou Bâ', module: 'organization', action: 'members.update', eventType: 'action', resourceType: 'member', resourceId: 'M-008', resourceLabel: 'Ibrahima Sarr', status: 'success', sensitive: false, correlationId: 'COR-2026-0201', before: { status: 'active' }, after: { status: 'suspended' } },
  { id: 'AUD-003', tenantId: 'T-002', timestamp: '2026-01-20T09:00:00', actorId: 'U-004', actorName: 'Mamadou Sow', module: 'organization', action: 'tenants.create', eventType: 'action', resourceType: 'tenant', resourceId: 'T-002', resourceLabel: 'Tontine Horizon', status: 'success', sensitive: false, correlationId: 'COR-2026-0202' },
  { id: 'AUD-004', tenantId: 'T-001', timestamp: '2026-01-05T09:00:00', actorId: 'U-001', actorName: 'Amadou Mbaye', module: 'tontines', action: 'cycles.manage', eventType: 'action', resourceType: 'cycle', resourceId: 'CYC-005', resourceLabel: 'Coopérative Sutura · Cycle 3', status: 'success', sensitive: false, correlationId: 'COR-2026-0203', context: { transition: 'statusDraft_statusOpen' } },
  { id: 'AUD-005', tenantId: 'T-001', timestamp: '2026-08-06T11:00:00', actorId: 'U-002', actorName: 'Fatou Ndiaye', module: 'finance', action: 'distributions.create', eventType: 'action', resourceType: 'distribution', resourceId: 'DI-003', resourceLabel: 'Distribution DI-003 · Fatou Ndiaye', status: 'success', sensitive: true, correlationId: 'COR-2026-0204', context: { amount: 150000 } },
  // resourceId : AS-001 (ancienne entité autonome Assembly) fusionnée dans MT-005 par la correction post-implémentation Phase 4C-4 — cf. src/mocks/organization/governance.ts.
  { id: 'AUD-006', tenantId: 'T-001', timestamp: '2026-06-15T18:00:00', actorId: 'U-002', actorName: 'Fatou Ndiaye', module: 'governance', action: 'governance.create', eventType: 'action', resourceType: 'assembly', resourceId: 'MT-005', resourceLabel: 'Assemblée Générale Ordinaire 2026', status: 'success', sensitive: false, correlationId: 'COR-2026-0205' },
  { id: 'AUD-007', tenantId: 'T-005', timestamp: '2026-08-01T09:30:00', actorId: 'U-009', actorName: 'Awa Cissé', module: 'credit', action: 'applications.create', eventType: 'action', resourceType: 'application', resourceId: 'AP-004', resourceLabel: 'Demande AP-004 · Awa Cissé', status: 'success', sensitive: false, correlationId: 'WR-001', context: { amount: 540000 } },
  { id: 'AUD-008', tenantId: 'T-004', timestamp: '2026-02-15T14:00:00', actorId: 'M-004', actorName: 'Ousmane Fall', module: 'organization', action: 'members.create', eventType: 'action', resourceType: 'member', resourceId: 'M-004', resourceLabel: 'Ousmane Fall', status: 'success', sensitive: false, correlationId: 'COR-2026-0206' },
  { id: 'AUD-009', tenantId: 'T-003', timestamp: '2026-08-01T08:00:00', actorId: 'U-006', actorName: 'Aïssatou Bâ', module: 'finance', action: 'repayments.create', eventType: 'action', resourceType: 'loan', resourceId: 'L-005', resourceLabel: 'Prêt L-005 · Ibrahima Sarr', status: 'failure', sensitive: false, correlationId: 'COR-2026-0207', context: { reason: 'echecPrelevement' } },
  { id: 'AUD-010', tenantId: 'T-001', timestamp: '2026-08-11T09:30:00', actorId: 'U-001', actorName: 'Amadou Mbaye', module: 'access', action: 'roles.read', eventType: 'action', resourceType: 'role', resourceId: 'role-viewer', resourceLabel: 'Lecture seule', status: 'success', sensitive: false, correlationId: 'COR-2026-0208' },
  { id: 'AUD-011', tenantId: 'T-002', timestamp: '2026-08-08T16:45:00', actorId: 'U-002', actorName: 'Fatou Ndiaye', module: 'finance', action: 'contributions.read', eventType: 'action', resourceType: 'contribution', resourceId: 'FC-001', resourceLabel: 'Cotisation cycle 4 · Fatou Ndiaye', status: 'success', sensitive: false, correlationId: 'COR-2026-0209' },
  { id: 'AUD-012', tenantId: 'T-005', timestamp: '2026-05-15T09:00:00', actorId: 'U-009', actorName: 'Awa Cissé', module: 'credit', action: 'loans.create', eventType: 'action', resourceType: 'loan', resourceId: 'L-003', resourceLabel: 'Prêt L-003 · Awa Cissé', status: 'success', sensitive: true, correlationId: 'COR-2026-0210', context: { amount: 540000 } },
  { id: 'AUD-013', tenantId: 'T-001', timestamp: '2026-08-10T08:00:00', actorId: 'U-003', actorName: 'Cheikh Diop', module: 'tontines', action: 'draws.manage', eventType: 'action', resourceType: 'cycle', resourceId: 'CYC-005', resourceLabel: 'Coopérative Sutura · Cycle 3', status: 'success', sensitive: false, correlationId: 'COR-2026-0211' },
  { id: 'AUD-014', tenantId: 'T-003', timestamp: '2026-06-20T10:00:00', actorId: 'U-006', actorName: 'Aïssatou Bâ', module: 'credit', action: 'applications.create', eventType: 'action', resourceType: 'application', resourceId: 'AP-006', resourceLabel: 'Demande AP-006 · Ibrahima Sarr', status: 'success', sensitive: false, correlationId: 'COR-2026-0212' },
];
