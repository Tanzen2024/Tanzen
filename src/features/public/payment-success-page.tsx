import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';

type SuccessState = { tenantId: string; tenantName: string; reference: string };

export function PaymentSuccessPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLocale();
  const state = location.state as SuccessState | null;

  return (
    <main className="flex-1 w-full bg-landing-background flex flex-col items-center justify-center text-landing-primary font-sans p-6 pt-32 pb-32">
      <ShieldCheck className="text-landing-accent mb-6" size={80} />
      <h1 className="text-4xl font-bold mb-4">{t('public', 'paymentSuccessTitle')}</h1>
      <p className="text-slate-500 text-lg text-center max-w-md mb-8">{t('public', 'paymentSuccessDescription', { name: state?.tenantName ?? '' })}</p>
      {state && (
        <div className="mb-8 w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-5 text-sm shadow-sm">
          <div className="flex items-center justify-between py-1.5"><span className="text-slate-500">{t('public', 'paymentSuccessTenantId')}</span><span className="font-semibold">{state.tenantId}</span></div>
          {state.reference && <div className="flex items-center justify-between py-1.5"><span className="text-slate-500">{t('public', 'paymentSuccessReference')}</span><span className="font-semibold">{state.reference}</span></div>}
        </div>
      )}
      <button type="button" onClick={() => navigate('/signin')} className="px-8 py-4 bg-landing-primary text-white hover:bg-slate-800 rounded-xl font-bold transition-all">
        {t('public', 'paymentSuccessCta')}
      </button>
    </main>
  );
}
