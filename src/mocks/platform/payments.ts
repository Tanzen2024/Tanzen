/**
 * `PaymentMethod` ici est propre au paiement d'abonnement SaaS (Platform) —
 * distinct de `Transaction`/`finance.service.ts` (mouvements financiers
 * internes au tenant), cf. docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md §14.
 * Aucune énumération canonique de méthode de paiement SaaS n'existe dans le
 * projet à réutiliser — celle-ci est nouvelle pour ce domaine, limitée aux
 * rails de paiement réalistes pour un abonnement (pas d'espèces).
 */
export type PaymentMethod = 'card' | 'mobileMoney' | 'bankTransfer';
export type PaymentStatus = 'completed' | 'pending' | 'failed' | 'refunded';

export type Payment = {
  id: string;
  tenantId: string;
  tenantName: string;
  subscriptionId: string;
  amount: number;
  currency: 'XOF';
  method: PaymentMethod;
  status: PaymentStatus;
  date: string;
  reference: string;
};

export const payments: Payment[] = [
  { id: 'PAY-001', tenantId: 'T-001', tenantName: 'Coopérative Sutura', subscriptionId: 'SUB-001', amount: 35000, currency: 'XOF', method: 'bankTransfer', status: 'completed', date: '2026-07-15', reference: 'TZ-PAY-20260715-001' },
  { id: 'PAY-002', tenantId: 'T-002', tenantName: 'Tontine Horizon', subscriptionId: 'SUB-002', amount: 15000, currency: 'XOF', method: 'mobileMoney', status: 'completed', date: '2026-07-01', reference: 'TZ-PAY-20260701-002' },
  { id: 'PAY-003', tenantId: 'T-003', tenantName: 'Mutuelle Teranga', subscriptionId: 'SUB-003', amount: 65000, currency: 'XOF', method: 'card', status: 'completed', date: '2026-07-10', reference: 'TZ-PAY-20260710-003' },
  { id: 'PAY-004', tenantId: 'T-005', tenantName: 'Tontine Avenir', subscriptionId: 'SUB-005', amount: 15000, currency: 'XOF', method: 'mobileMoney', status: 'failed', date: '2026-07-10', reference: 'TZ-PAY-20260710-004' },
  { id: 'PAY-005', tenantId: 'T-003', tenantName: 'Mutuelle Teranga', subscriptionId: 'SUB-006', amount: 15000, currency: 'XOF', method: 'mobileMoney', status: 'refunded', date: '2025-01-20', reference: 'TZ-PAY-20250120-005' },
];
