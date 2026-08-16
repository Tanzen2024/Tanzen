/**
 * Journal d'audit de la couche Platform — distinct de `/audit` (Application
 * Tenant, événements internes à un tenant). Types d'événements limités à
 * ceux explicitement listés par le mandat qui a autorisé cette couche ;
 * aucun événement supplémentaire inventé.
 */
export type PlatformAuditEventType = 'tenantCreated' | 'tenantActivated' | 'tenantSuspended' | 'tenantReactivated' | 'subscriptionCreated' | 'subscriptionUpdated' | 'paymentConfirmed';

export type PlatformAuditEvent = {
  id: string;
  type: PlatformAuditEventType;
  tenantId: string;
  tenantName: string;
  description: string;
  actor: string;
  date: string;
};

export const platformAuditEvents: PlatformAuditEvent[] = [
  { id: 'PAE-001', type: 'tenantCreated', tenantId: 'T-004', tenantName: 'Association Jappo', description: 'Tenant créé via le parcours de souscription.', actor: 'Système', date: '2026-08-01T09:12:00' },
  { id: 'PAE-002', type: 'subscriptionCreated', tenantId: 'T-004', tenantName: 'Association Jappo', description: 'Abonnement Free créé (période d\'essai).', actor: 'Système', date: '2026-08-01T09:12:05' },
  { id: 'PAE-003', type: 'tenantActivated', tenantId: 'T-003', tenantName: 'Mutuelle Teranga', description: 'Tenant activé après confirmation de paiement.', actor: 'Amadou Mbaye', date: '2026-07-10T14:05:00' },
  { id: 'PAE-004', type: 'paymentConfirmed', tenantId: 'T-003', tenantName: 'Mutuelle Teranga', description: 'Paiement TZ-PAY-20260710-003 confirmé (65 000 XOF).', actor: 'Système', date: '2026-07-10T14:04:40' },
  { id: 'PAE-005', type: 'subscriptionUpdated', tenantId: 'T-003', tenantName: 'Mutuelle Teranga', description: 'Abonnement changé de Starter vers Premium.', actor: 'Amadou Mbaye', date: '2026-02-10T11:20:00' },
  { id: 'PAE-006', type: 'tenantSuspended', tenantId: 'T-005', tenantName: 'Tontine Avenir', description: 'Tenant suspendu — échec de paiement à échéance.', actor: 'Système', date: '2026-07-11T08:00:00' },
  { id: 'PAE-007', type: 'tenantReactivated', tenantId: 'T-002', tenantName: 'Tontine Horizon', description: 'Tenant réactivé après régularisation.', actor: 'Amadou Mbaye', date: '2024-06-05T10:30:00' },
];
