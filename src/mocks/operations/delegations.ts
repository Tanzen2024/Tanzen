import type { WorkflowDomain } from './workflow-definitions';

export type WorkflowDelegation = {
  id: string;
  tenantId: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  domain: WorkflowDomain | 'all';
  startDate: string;
  endDate: string;
  active: boolean;
  reason: string;
};

export const delegations: WorkflowDelegation[] = [
  { id: 'DEL-001', tenantId: 'T-001', fromUserId: 'U-001', fromUserName: 'Amadou Mbaye', toUserId: 'U-002', toUserName: 'Fatou Ndiaye', domain: 'credit', startDate: '2026-08-10', endDate: '2026-08-24', active: true, reason: 'Congés annuels' },
  { id: 'DEL-002', tenantId: 'T-001', fromUserId: 'U-001', fromUserName: 'Amadou Mbaye', toUserId: 'U-003', toUserName: 'Cheikh Diop', domain: 'all', startDate: '2026-06-01', endDate: '2026-06-15', active: false, reason: 'Déplacement professionnel' },
  { id: 'DEL-003', tenantId: 'T-002', fromUserId: 'U-004', fromUserName: 'Mamadou Sow', toUserId: 'U-005', toUserName: 'Khadija Mbaye', domain: 'tontines', startDate: '2026-08-05', endDate: '2026-08-20', active: true, reason: 'Formation' },
];
