import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { Logo } from './components/logo';
import { useLocale } from '@/contexts/locale-context';

/**
 * BACKEND PENDING — connexion simulée (pas d'authentification réelle, cf.
 * mocks/rbac.mocks.ts). Redirige vers l'Application Tenant existante
 * (/dashboard) au lieu de l'ancien redirect Next.js codé en dur vers
 * http://localhost:5173.
 */
export function SignInPage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setTimeout(() => navigate('/dashboard'), 1000);
  };

  return (
    <main className="flex-1 w-full bg-landing-background flex flex-col justify-center items-center py-20 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="mx-auto flex justify-center mb-6">
            <Logo className="h-14 w-14 text-landing-accent drop-shadow-sm" />
          </div>
          <h1 className="text-3xl font-extrabold text-landing-primary mb-2">{t('public', 'signinTitle')}</h1>
          <p className="text-slate-500">{t('public', 'signinSubtitle')}</p>
        </div>

        <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">{t('public', 'fieldEmail')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><Mail size={18} /></div>
                <input
                  id="email" name="email" type="email" autoComplete="email" required
                  value={email} onChange={(event) => setEmail(event.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-landing-accent focus:border-transparent transition-all"
                  placeholder={t('public', 'fieldEmailPlaceholder')}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">{t('public', 'fieldPassword')}</label>
                <Link to="#" className="text-sm font-medium text-landing-accent hover:text-landing-accent-dark transition-colors">{t('public', 'signinForgotPassword')}</Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><Lock size={18} /></div>
                <input
                  id="password" name="password" type="password" autoComplete="current-password" required
                  value={password} onChange={(event) => setPassword(event.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-landing-accent focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-landing-primary hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-landing-primary transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (<><Loader2 size={18} className="animate-spin" />{t('public', 'signinSubmitting')}</>) : (<>{t('public', 'signinSubmit')}<ArrowRight size={18} /></>)}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-500">
            {t('public', 'signinNoAccount')}{' '}
            <Link to="/pricing" className="font-bold text-landing-primary hover:text-landing-accent transition-colors">{t('public', 'signinCreateAccount')}</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
