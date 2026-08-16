import type { PlanCode } from './plans';

export type SubscriptionStatus = 'active' | 'pending' | 'expired' | 'cancelled';

export type Subscription = {
  id: string;
  tenantId: string;
  tenantName: string;
  planId: string;
  planCode: PlanCode;
  planName: string;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  trial: boolean;
  autoRenew: boolean;
};

export const subscriptions: Subscription[] = [
  { id: 'SUB-001', tenantId: 'T-001', tenantName: 'Coopérative Sutura', planId: 'PL-003', planCode: 'standard', planName: 'Standard', startDate: '2024-01-15', endDate: '2027-01-15', status: 'active', trial: false, autoRenew: true },
  { id: 'SUB-002', tenantId: 'T-002', tenantName: 'Tontine Horizon', planId: 'PL-002', planCode: 'starter', planName: 'Starter', startDate: '2024-06-01', endDate: '2027-06-01', status: 'active', trial: false, autoRenew: true },
  { id: 'SUB-003', tenantId: 'T-003', tenantName: 'Mutuelle Teranga', planId: 'PL-004', planCode: 'premium', planName: 'Premium', startDate: '2025-02-10', endDate: '2027-02-10', status: 'active', trial: false, autoRenew: true },
  { id: 'SUB-004', tenantId: 'T-004', tenantName: 'Association Jappo', planId: 'PL-001', planCode: 'free', planName: 'Free', startDate: '2026-08-01', endDate: '2026-09-01', status: 'pending', trial: true, autoRenew: false },
  { id: 'SUB-005', tenantId: 'T-005', tenantName: 'Tontine Avenir', planId: 'PL-002', planCode: 'starter', planName: 'Starter', startDate: '2023-09-10', endDate: '2026-07-10', status: 'expired', trial: false, autoRenew: false },
  { id: 'SUB-006', tenantId: 'T-003', tenantName: 'Mutuelle Teranga', planId: 'PL-002', planCode: 'starter', planName: 'Starter', startDate: '2023-06-01', endDate: '2025-02-10', status: 'cancelled', trial: false, autoRenew: false },
];
