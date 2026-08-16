export type IntegrationCategory = 'api' | 'storage' | 'sync' | 'external';
export type IntegrationStatus = 'connected' | 'disconnected' | 'pending';

export type Integration = {
  id: string;
  tenantId: string;
  category: IntegrationCategory;
  name: string;
  description: string;
  status: IntegrationStatus;
  lastSyncAt: string | null;
};

export const integrations: Integration[] = [
  { id: 'INT-001', tenantId: 'T-001', category: 'api', name: 'API TANZEN /api/v1', description: 'Accès programmatique en lecture/écriture, jetons par application.', status: 'connected', lastSyncAt: '2026-08-12T07:00:00' },
  { id: 'INT-002', tenantId: 'T-001', category: 'storage', name: 'Stockage documentaire', description: 'Stockage des pièces jointes (compatible S3).', status: 'connected', lastSyncAt: '2026-08-12T06:30:00' },
  { id: 'INT-003', tenantId: 'T-001', category: 'sync', name: 'Synchronisation comptable', description: 'Export périodique vers le logiciel de comptabilité.', status: 'pending', lastSyncAt: null },
  { id: 'INT-004', tenantId: 'T-001', category: 'external', name: 'Passerelle Mobile Money', description: 'Réception des cotisations par Mobile Money.', status: 'disconnected', lastSyncAt: '2026-06-01T09:00:00' },
  { id: 'INT-005', tenantId: 'T-002', category: 'api', name: 'API TANZEN /api/v1', description: 'Accès programmatique en lecture/écriture, jetons par application.', status: 'connected', lastSyncAt: '2026-08-11T18:00:00' },
  { id: 'INT-006', tenantId: 'T-002', category: 'storage', name: 'Stockage documentaire', description: 'Stockage des pièces jointes (compatible S3).', status: 'connected', lastSyncAt: '2026-08-11T17:45:00' },
  { id: 'INT-007', tenantId: 'T-002', category: 'external', name: 'Passerelle SMS', description: 'Envoi des notifications par SMS.', status: 'connected', lastSyncAt: '2026-08-09T14:00:00' },
  { id: 'INT-008', tenantId: 'T-003', category: 'api', name: 'API TANZEN /api/v1', description: 'Accès programmatique en lecture/écriture, jetons par application.', status: 'disconnected', lastSyncAt: null },
  { id: 'INT-009', tenantId: 'T-003', category: 'storage', name: 'Stockage documentaire', description: 'Stockage des pièces jointes (compatible S3).', status: 'connected', lastSyncAt: '2026-08-10T09:00:00' },
  { id: 'INT-010', tenantId: 'T-004', category: 'api', name: 'API TANZEN /api/v1', description: 'Accès programmatique en lecture/écriture, jetons par application.', status: 'disconnected', lastSyncAt: null },
  { id: 'INT-011', tenantId: 'T-005', category: 'api', name: 'API TANZEN /api/v1', description: 'Accès programmatique en lecture/écriture, jetons par application.', status: 'connected', lastSyncAt: '2026-08-11T19:10:00' },
  { id: 'INT-012', tenantId: 'T-005', category: 'sync', name: 'Synchronisation comptable', description: 'Export périodique vers le logiciel de comptabilité.', status: 'connected', lastSyncAt: '2026-08-08T08:00:00' },
];
