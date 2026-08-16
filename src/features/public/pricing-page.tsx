import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';
import { platformCommercialService } from '@/services/platform-commercial.service';
import { queryKeys } from '@/services/query-keys';
import type { PlanCode } from '@/mocks/platform/plans';
import { formatNumber } from '@/lib/utils';

const POPULAR_PLAN: PlanCode = 'standard';

export function PricingPage() {
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [annual, setAnnual] = useState(false);
  const { data: plans = [] } = useQuery({ queryKey: queryKeys.platformCommercial.plans, queryFn: () => platformCommercialService.listPlans() });

  return (
    <main className="flex-1 w-full bg-landing-background text-landing-primary font-sans pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center rounded-full px-4 py-1.5 bg-landing-accent-light text-landing-accent text-sm font-semibold mb-6">{t('public', 'pricingBadge')}</div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-landing-primary mb-4">{t('public', 'pricingTitle')}</h1>
          <p className="text-lg text-slate-500">{t('public', 'pricingSubtitle')}</p>
        </div>

        <div className="flex items-center justify-center gap-4 mb-12">
          <span className={`text-sm font-semibold ${!annual ? 'text-landing-primary' : 'text-slate-400'}`}>{t('public', 'pricingMonthly')}</span>
          <button type="button" role="switch" aria-checked={annual} onClick={() => setAnnual((value) => !value)} className={`relative h-7 w-12 rounded-full transition-colors ${annual ? 'bg-landing-accent' : 'bg-slate-200'}`}>
            <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className={`text-sm font-semibold ${annual ? 'text-landing-primary' : 'text-slate-400'}`}>{t('public', 'pricingAnnual')} <span className="text-landing-accent">{t('public', 'pricingAnnualSaving')}</span></span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
          {plans.map((plan) => {
            const popular = plan.code === POPULAR_PLAN;
            const price = annual ? plan.priceAnnual : plan.priceMonthly;
            return (
              <div key={plan.id} className={`relative flex flex-col rounded-3xl border p-6 bg-white transition-all ${popular ? 'border-landing-accent ring-2 ring-landing-accent shadow-xl' : 'border-slate-100 shadow-sm'}`}>
                {popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-landing-accent px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">{t('public', 'pricingMostPopular')}</span>}
                <h2 className="text-lg font-bold">{plan.name}</h2>
                <p className="mt-2 h-12 text-xs text-slate-500">{plan.description[locale]}</p>
                <div className="mt-4 mb-2">
                  <span className="text-3xl font-extrabold">{formatNumber(price, locale)}</span>
                  <span className="ml-1 text-xs font-medium text-slate-400">{annual ? t('public', 'pricingPerYear') : t('public', 'pricingPerMonth')}</span>
                </div>
                <p className="mb-6 flex items-center gap-1.5 text-xs text-slate-500"><Check size={14} className="text-landing-accent" />{plan.maxUsers === null ? t('public', 'pricingUnlimitedUsers') : t('public', 'pricingMaxUsers', { count: String(plan.maxUsers) })}</p>
                <button type="button" onClick={() => navigate(`/checkout?plan=${plan.code}`)} className={`mt-auto w-full rounded-xl py-3 text-sm font-bold transition-colors ${popular ? 'bg-landing-accent text-landing-primary hover:bg-landing-accent-dark' : 'bg-landing-primary text-white hover:bg-slate-800'}`}>
                  {t('public', 'pricingChoosePlan')}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-14 text-center">
          <p className="text-sm text-slate-500 mb-3">{t('public', 'pricingCustomNote')}</p>
          <button type="button" onClick={() => navigate('/subscribe')} className="text-sm font-bold text-landing-accent hover:text-landing-accent-dark transition-colors">{t('public', 'pricingCustomCta')}</button>
        </div>
      </div>
    </main>
  );
}
