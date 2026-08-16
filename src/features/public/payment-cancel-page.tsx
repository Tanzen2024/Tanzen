import { useNavigate } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';

export function PaymentCancelPage() {
  const navigate = useNavigate();
  const { t } = useLocale();

  return (
    <main className="flex-1 w-full bg-landing-background flex flex-col items-center justify-center text-landing-primary font-sans p-6 pt-32 pb-32">
      <XCircle className="text-slate-300 mb-6" size={80} />
      <h1 className="text-4xl font-bold mb-4">{t('public', 'paymentCancelTitle')}</h1>
      <p className="text-slate-500 text-lg text-center max-w-md mb-8">{t('public', 'paymentCancelDescription')}</p>
      <button type="button" onClick={() => navigate('/pricing')} className="px-8 py-4 bg-landing-primary text-white hover:bg-slate-800 rounded-xl font-bold transition-all">
        {t('public', 'paymentCancelCta')}
      </button>
    </main>
  );
}
