import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Building2, Mail, Lock, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';

/** BACKEND PENDING — inscription simulée, aucune création réelle de compte/tenant. */
export function SignUpPage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
      setTimeout(() => navigate('/subscribe'), 1500);
    }, 1200);
  };

  if (isSuccess) {
    return (
      <main className="flex-1 w-full bg-landing-background flex flex-col justify-center items-center py-20 px-4 min-h-[calc(100vh-4rem)]">
        <CheckCircle className="text-landing-accent mb-6" size={80} />
        <h1 className="text-3xl font-bold text-landing-primary mb-2 text-center">{t('public', 'signupSuccessTitle')}</h1>
        <p className="text-slate-500 text-center max-w-sm">{t('public', 'signupSuccessDescription')}</p>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full bg-landing-background flex flex-col justify-center items-center py-16 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-landing-primary mb-3">{t('public', 'signupTitle')}</h1>
          <p className="text-slate-500">{t('public', 'signupSubtitle')}</p>
        </div>

        <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-slate-700 mb-1.5">{t('public', 'fieldFullName')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><User size={18} /></div>
                <input id="name" type="text" required value={name} onChange={(event) => setName(event.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-landing-accent focus:border-transparent transition-all"
                  placeholder={t('public', 'fieldFullNamePlaceholder')} />
              </div>
            </div>

            <div>
              <label htmlFor="org" className="block text-sm font-semibold text-slate-700 mb-1.5">{t('public', 'fieldOrgName')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><Building2 size={18} /></div>
                <input id="org" type="text" required value={org} onChange={(event) => setOrg(event.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-landing-accent focus:border-transparent transition-all"
                  placeholder={t('public', 'fieldOrgNamePlaceholder')} />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1.5">{t('public', 'fieldEmail')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><Mail size={18} /></div>
                <input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-landing-accent focus:border-transparent transition-all"
                  placeholder={t('public', 'fieldEmailPlaceholder')} />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-1.5">{t('public', 'fieldPassword')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><Lock size={18} /></div>
                <input id="password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-landing-accent focus:border-transparent transition-all"
                  placeholder={t('public', 'fieldPasswordPlaceholderStrong')} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {t('public', 'signupLegalPrefix')} <Link to="#" className="underline">{t('public', 'signupTerms')}</Link> {t('public', 'signupLegalAnd')} <Link to="#" className="underline">{t('public', 'signupPrivacy')}</Link>.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password || !name || !org}
              className="w-full mt-2 flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-landing-primary bg-landing-accent hover:bg-landing-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-landing-accent transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (<><Loader2 size={18} className="animate-spin" />{t('public', 'signupSubmitting')}</>) : (<>{t('public', 'signupSubmit')}<ArrowRight size={18} /></>)}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-500">
            {t('public', 'signupHasAccount')}{' '}
            <Link to="/signin" className="font-bold text-landing-primary hover:text-landing-accent transition-colors">{t('public', 'signupSignIn')}</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
