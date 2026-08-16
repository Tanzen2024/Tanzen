import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, ShieldCheck, Sparkles } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';
import { platformCommercialService } from '@/services/platform-commercial.service';
import { queryKeys } from '@/services/query-keys';
import { TenantForm, useTenantFormValues, validateTenant, type TenantFormErrors } from '@/features/organization/tenant-form';
import { formatNumber } from '@/lib/utils';

/**
 * Étape « Informations tenant » du tunnel commercial (SaaSTenantOnboarding,
 * préparé mais non construit avant cette mission — cf.
 * docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md §12 Décision B). Réutilise
 * exactement le triplet `TenantForm`/`validateTenant`/`useTenantFormValues`
 * déjà partagé avec `PlatformTenantCreate`, comme prévu par cette décision.
 *
 * Refonte UX 2026-08-16 (docs/CHECKOUT_UX_REDESIGN.md) : layout et habillage
 * uniquement — aucune donnée inventée, aucun champ ajouté/retiré, aucune
 * étape de la navigation modifiée (`?plan=`, validation, `navigate('/payment', ...)`
 * sont strictement identiques à avant).
 */
const STEPS = ['checkoutStepInformation', 'checkoutStepVerification', 'checkoutStepPayment'] as const;

export function CheckoutPage() {
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [searchParams] = useSearchParams();
  const planCode = searchParams.get('plan');
  const { data: plans = [], isLoading: plansLoading } = useQuery({ queryKey: queryKeys.platformCommercial.plans, queryFn: () => platformCommercialService.listPlans() });
  const plan = plans.find((item) => item.code === planCode);

  const [values, setValues] = useTenantFormValues();
  const [errors, setErrors] = useState<TenantFormErrors>({});
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  if (plans.length > 0 && !plan) {
    return (
      <main className="flex-1 w-full bg-landing-background flex flex-col items-center justify-center py-24 px-4 text-center">
        <p className="text-lg text-slate-500 mb-6">{t('public', 'checkoutNoPlanSelected')}</p>
        <button type="button" onClick={() => navigate('/pricing')} className="rounded-xl bg-landing-primary px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors">{t('public', 'checkoutSelectPlanFirst')}</button>
      </main>
    );
  }

  const handleContinue = () => {
    const nextErrors = validateTenant(values, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !adminName.trim() || !adminEmail.trim() || !plan) return;
    navigate('/payment', { state: { planId: plan.id, planCode: plan.code, planName: plan.name, priceMonthly: plan.priceMonthly, tenantValues: values, adminName, adminEmail } });
  };

  return (
    <main className="flex-1 w-full bg-landing-background pb-24 pt-20 sm:pt-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <h1 className="text-3xl font-extrabold text-landing-primary sm:text-4xl">{t('public', 'checkoutTitle')}</h1>
          <p className="mt-3 text-base text-slate-500 sm:text-lg">{t('public', 'checkoutSubtitle')}</p>
          <ol aria-label={t('public', 'checkoutStepperLabel')} className="mt-8 flex items-center justify-center gap-2 sm:gap-3">
            {STEPS.map((stepKey, index) => {
              const isCurrent = index === 0;
              return (
                <li key={stepKey} className="flex items-center gap-2 sm:gap-3">
                  <span className="flex items-center gap-1.5 sm:gap-2" aria-current={isCurrent ? 'step' : undefined}>
                    <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${isCurrent ? 'bg-landing-accent text-landing-primary' : 'bg-slate-100 text-slate-400'}`}>{index + 1}</span>
                    <span className={`text-xs font-semibold sm:text-sm ${isCurrent ? 'text-landing-primary' : 'text-slate-400'}`}>
                      {t('public', stepKey)}
                      {isCurrent && <span className="sr-only"> — {t('public', 'checkoutStepCurrent')}</span>}
                    </span>
                  </span>
                  {index < STEPS.length - 1 && <span className="h-px w-6 bg-slate-200 sm:w-10" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-start lg:gap-8">
          <div className="order-2 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8 lg:order-1">
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-landing-primary">{t('public', 'checkoutAdminInfoTitle')}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="admin-name" className="block text-sm font-semibold text-slate-700">{t('public', 'checkoutAdminName')}</label>
                  <input id="admin-name" value={adminName} onChange={(event) => setAdminName(event.target.value)} placeholder={t('public', 'checkoutAdminNamePlaceholder')} required className="block h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-landing-accent" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-email" className="block text-sm font-semibold text-slate-700">{t('public', 'checkoutAdminEmail')}</label>
                  <input id="admin-email" type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder={t('public', 'checkoutAdminEmailPlaceholder')} required className="block h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-landing-accent" />
                </div>
              </div>
            </div>
            <div className="my-8 h-px bg-slate-100" />
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-landing-primary">{t('public', 'checkoutOrgInfoTitle')}</h2>
              <TenantForm values={values} onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} errors={errors} t={t} onCancel={() => navigate('/pricing')} onSave={handleContinue} saving={false} cancelLabel={t('public', 'checkoutBack')} saveLabel={t('public', 'checkoutContinue')} tone="checkout" />
            </div>
          </div>

          <div className="order-1 space-y-4 lg:sticky lg:top-24 lg:order-2">
            {plan ? (
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-200/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-landing-accent">{t('public', 'checkoutPlanSummaryTitle')}</p>
                <p className="mt-1 text-2xl font-extrabold text-landing-primary">{plan.name}</p>
                <p className="text-sm text-slate-500">{t('public', 'checkoutPlanSummarySubtitle')}</p>
                <div className="my-5 h-px bg-slate-100" />
                <p className="text-3xl font-extrabold text-landing-primary">{formatNumber(plan.priceMonthly, locale)} <span className="text-sm font-medium text-slate-400">{t('public', 'pricingPerMonth')}</span></p>
                <ul className="mt-5 space-y-2.5 text-sm text-slate-600">
                  <li className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-landing-accent" />{plan.description[locale]}</li>
                  <li className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-landing-accent" />{plan.maxUsers === null ? t('public', 'pricingUnlimitedUsers') : t('public', 'pricingMaxUsers', { count: String(plan.maxUsers) })}</li>
                </ul>
              </div>
            ) : plansLoading ? (
              <div className="animate-pulse rounded-3xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-200/60">
                <div className="h-3 w-24 rounded bg-slate-100" />
                <div className="mt-3 h-7 w-32 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-40 rounded bg-slate-100" />
                <div className="my-5 h-px bg-slate-100" />
                <div className="h-8 w-36 rounded bg-slate-100" />
                <div className="mt-5 h-3 w-full rounded bg-slate-100" />
                <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm shadow-slate-200/60">
              <ul className="space-y-3 text-xs text-slate-500 sm:text-sm">
                <li className="flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-landing-accent" />{t('public', 'checkoutReassuranceProtected')}</li>
                <li className="flex items-start gap-2"><Sparkles size={16} className="mt-0.5 shrink-0 text-landing-accent" />{t('public', 'checkoutReassuranceManage')}</li>
                <li className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-landing-accent" />{t('public', 'checkoutReassuranceNextStep')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
