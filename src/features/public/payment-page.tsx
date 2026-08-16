import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreditCard, Landmark, Loader2, Smartphone } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';
import { organizationService, type TenantInput } from '@/services/organization.service';
import { platformCommercialService } from '@/services/platform-commercial.service';
import type { PaymentMethod } from '@/mocks/platform/payments';
import { formatNumber } from '@/lib/utils';

type CheckoutState = { planId: string; planCode: string; planName: string; priceMonthly: number; tenantValues: TenantInput; adminName: string; adminEmail: string };

const METHODS: { id: PaymentMethod; icon: typeof CreditCard; labelKey: string }[] = [
  { id: 'card', icon: CreditCard, labelKey: 'paymentMethodCard' },
  { id: 'mobileMoney', icon: Smartphone, labelKey: 'paymentMethodMobileMoney' },
  { id: 'bankTransfer', icon: Landmark, labelKey: 'paymentMethodBankTransfer' },
];

/**
 * BACKEND PENDING — aucune passerelle de paiement réelle. Simule le
 * provisioning honnête décrit par docs/COMMERCIAL_PLATFORM_ARCHITECTURE.md :
 * crée le tenant (statut `pending`, comportement déjà existant
 * d'`organizationService.createTenant`), une souscription puis un paiement
 * `completed` qui active la souscription (pas le tenant lui-même — son
 * activation reste un mécanisme distinct, BACKEND PENDING, jamais construit
 * ici de façon trompeuse).
 */
export function PaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, locale } = useLocale();
  const state = location.state as CheckoutState | null;
  const [method, setMethod] = useState<PaymentMethod>('mobileMoney');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!state) {
    return (
      <main className="flex-1 w-full bg-landing-background flex flex-col items-center justify-center py-24 px-4 text-center">
        <p className="text-lg text-slate-500 mb-6">{t('public', 'checkoutNoPlanSelected')}</p>
        <button type="button" onClick={() => navigate('/pricing')} className="rounded-xl bg-landing-primary px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors">{t('public', 'checkoutSelectPlanFirst')}</button>
      </main>
    );
  }

  const handlePay = async () => {
    setIsProcessing(true);
    const tenant = await organizationService.createTenant(state.tenantValues);
    const subscription = await platformCommercialService.createSubscriptionForTenant(tenant.id, tenant.name, state.planId);
    const payment = subscription ? await platformCommercialService.recordPayment(tenant.id, tenant.name, subscription.id, state.priceMonthly, method) : null;
    setIsProcessing(false);
    navigate('/payment/success', { state: { tenantId: tenant.id, tenantName: tenant.name, reference: payment?.reference ?? '' } });
  };

  return (
    <main className="flex-1 w-full bg-landing-background flex flex-col items-center justify-center py-24 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-landing-primary mb-2">{t('public', 'paymentTitle')}</h1>
          <p className="text-slate-500">{t('public', 'paymentSubtitleForPlan', { plan: state.planName })}</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <span className="text-sm font-semibold text-slate-600">{t('public', 'paymentAmountLabel')}</span>
            <span className="text-2xl font-extrabold text-landing-primary">{formatNumber(state.priceMonthly, locale)} XOF</span>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-slate-700">{t('public', 'paymentMethodLabel')}</p>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(({ id, icon: Icon, labelKey }) => (
                <button key={id} type="button" onClick={() => setMethod(id)} className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-[11px] font-medium transition-colors ${method === id ? 'border-landing-accent bg-landing-accent-light text-landing-accent' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  <Icon size={20} />{t('public', labelKey)}
                </button>
              ))}
            </div>
          </div>

          <button type="button" disabled={isProcessing} onClick={handlePay} className="w-full flex justify-center items-center gap-2 py-3.5 rounded-xl text-sm font-bold text-landing-primary bg-landing-accent hover:bg-landing-accent-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {isProcessing ? (<><Loader2 size={18} className="animate-spin" />{t('public', 'paymentProcessingLabel')}</>) : t('public', 'paymentSubmit')}
          </button>
          <button type="button" disabled={isProcessing} onClick={() => navigate('/payment/cancel')} className="w-full text-center text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors">{t('public', 'paymentCancelLink')}</button>

          <p className="text-center text-[11px] leading-5 text-slate-400">{t('public', 'paymentPendingNote')}</p>
        </div>
      </div>
    </main>
  );
}
