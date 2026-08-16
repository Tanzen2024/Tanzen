import { mockRequest } from './api-client';
import { plans, type Plan } from '@/mocks/platform/plans';
import { subscriptions, type Subscription } from '@/mocks/platform/subscriptions';
import { payments, type Payment } from '@/mocks/platform/payments';
import { invoices, type Invoice } from '@/mocks/platform/invoices';
import { platformAuditEvents, type PlatformAuditEvent } from '@/mocks/platform/platform-audit';
import { tenants } from '@/mocks/organization/tenants';
import type { PlatformScope } from '@/mocks/rbac.mocks';

/**
 * Couche commerciale Platform (Plans/Subscriptions/Payments/Billing/Platform
 * Audit) — tous ces répertoires sont, par nature, transverses à tous les
 * tenants : ils n'appartiennent jamais à l'Application Tenant (cf.
 * docs/FIX_TENANT_APP_SINGLE_TENANT.md, docs/COMMERCIAL_PLATFORM_ARCHITECTURE.md).
 * Chaque fonction est gardée par `scope: PlatformScope` — même défense en
 * profondeur que `organizationService.listTenants` : un appel avec
 * `scope !== 'platform'` renvoie toujours une liste vide / `undefined`,
 * indépendamment de la garde de route (`PlatformScopeGuard`) qui protège déjà
 * `/platform/*` en amont.
 */
export const platformCommercialService = {
  /**
   * `listPlans`/`getPlan` sont volontairement NON gardés par `scope` : le
   * catalogue de plans est une information commerciale publique (affichée
   * sur `/pricing`, site non authentifié), contrairement aux Subscriptions/
   * Payments/Invoices/Audit ci-dessous qui portent des données par tenant et
   * restent strictement réservées à `scope === 'platform'`.
   */
  listPlans: () => mockRequest<Plan[]>(() => plans),
  getPlan: (planId: string) => mockRequest<Plan | undefined>(() => plans.find((plan) => plan.id === planId)),

  listSubscriptions: (scope: PlatformScope) => mockRequest<Subscription[]>(() => (scope === 'platform' ? subscriptions : [])),
  getSubscription: (scope: PlatformScope, subscriptionId: string) => mockRequest<Subscription | undefined>(() => (scope === 'platform' ? subscriptions.find((subscription) => subscription.id === subscriptionId) : undefined)),
  listSubscriptionsByTenant: (scope: PlatformScope, tenantId: string) => mockRequest<Subscription[]>(() => (scope === 'platform' ? subscriptions.filter((subscription) => subscription.tenantId === tenantId) : [])),

  listPayments: (scope: PlatformScope) => mockRequest<Payment[]>(() => (scope === 'platform' ? payments : [])),
  listPaymentsByTenant: (scope: PlatformScope, tenantId: string) => mockRequest<Payment[]>(() => (scope === 'platform' ? payments.filter((payment) => payment.tenantId === tenantId) : [])),

  listInvoices: (scope: PlatformScope) => mockRequest<Invoice[]>(() => (scope === 'platform' ? invoices : [])),
  listInvoicesByTenant: (scope: PlatformScope, tenantId: string) => mockRequest<Invoice[]>(() => (scope === 'platform' ? invoices.filter((invoice) => invoice.tenantId === tenantId) : [])),

  listAuditEvents: (scope: PlatformScope) => mockRequest<PlatformAuditEvent[]>(() => (scope === 'platform' ? platformAuditEvents : [])),

  /**
   * Agrégation pour le Platform Dashboard. "Tenants suspendus"/"Tenants
   * expirés" (vocabulaire du mandat) ne correspondent à aucun champ inventé :
   * suspendu = `Tenant.status === 'inactive'` (valeur déjà canonique, cf.
   * mocks/organization/tenants.ts) ; expiré = tenant dont l'abonnement le
   * plus récent a `Subscription.status === 'expired'` (valeur déjà listée
   * par le mandat) — aucun nouveau statut ajouté nulle part.
   */
  getDashboardSummary: (scope: PlatformScope) =>
    mockRequest(() => {
      if (scope !== 'platform') return null;
      const expiredTenantIds = new Set(subscriptions.filter((subscription) => subscription.status === 'expired').map((subscription) => subscription.tenantId));
      return {
        totalTenants: tenants.length,
        activeTenants: tenants.filter((tenant) => tenant.status === 'active').length,
        pendingTenants: tenants.filter((tenant) => tenant.status === 'pending').length,
        suspendedTenants: tenants.filter((tenant) => tenant.status === 'inactive').length,
        expiredTenants: expiredTenantIds.size,
        activeSubscriptions: subscriptions.filter((subscription) => subscription.status === 'active').length,
        recentPayments: [...payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
        totalRevenue: payments.filter((payment) => payment.status === 'completed').reduce((sum, payment) => sum + payment.amount, 0),
        planBreakdown: plans.map((plan) => ({ plan, count: subscriptions.filter((subscription) => subscription.planId === plan.id && subscription.status === 'active').length })),
      };
    }),

  /**
   * Provisioning du tenant après paiement — BACKEND PENDING pour la partie
   * réelle (paiement/activation asynchrone), simulé ici de façon honnête
   * (pas de fausse promesse de persistance au-delà de la session mémoire) :
   * crée le tenant (`status: 'pending'`, comportement déjà existant de
   * `organizationService.createTenant`), une souscription `pending`, et une
   * facture `pending` liée. N'active PAS automatiquement le tenant — c'est
   * un mécanisme distinct (BACKEND PENDING, cf.
   * docs/COMMERCIAL_PLATFORM_ARCHITECTURE.md §8).
   */
  createSubscriptionForTenant: (tenantId: string, tenantName: string, planId: string) =>
    mockRequest(() => {
      const plan = plans.find((item) => item.id === planId);
      if (!plan) return undefined;
      const subscription: Subscription = { id: `SUB-${String(subscriptions.length + 1).padStart(3, '0')}`, tenantId, tenantName, planId: plan.id, planCode: plan.code, planName: plan.name, startDate: new Date().toISOString().slice(0, 10), endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), status: 'pending', trial: plan.code === 'free', autoRenew: false };
      subscriptions.push(subscription);
      return subscription;
    }),

  recordPayment: (tenantId: string, tenantName: string, subscriptionId: string, amount: number, method: Payment['method']) =>
    mockRequest(() => {
      const payment: Payment = { id: `PAY-${String(payments.length + 1).padStart(3, '0')}`, tenantId, tenantName, subscriptionId, amount, currency: 'XOF', method, status: 'completed', date: new Date().toISOString().slice(0, 10), reference: `TZ-PAY-${Date.now()}` };
      payments.push(payment);
      const subscription = subscriptions.find((item) => item.id === subscriptionId);
      if (subscription) subscription.status = 'active';
      return payment;
    }),
};
