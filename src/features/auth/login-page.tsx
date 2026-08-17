import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2, Info } from 'lucide-react';
import { Logo } from './components/logo';
import { useLocale } from '@/contexts/locale-context';
import { authService } from '@/services/auth.service';
import { notify } from '@/lib/notify';

/**
 * Point d'entrée de l'Application Tenant — séparation Commercial/Tenant
 * (2026-08-16, voir docs/COMMERCIAL_TENANT_EXECUTION_PLAN.md §24). Contenu
 * fonctionnel identique à l'ancien `signin-page.tsx` du site Public
 * (formulaire, redirection `/dashboard`) — seul l'habillage change
 * (`AuthShell` minimal au lieu de `PublicShell`). Le lien "Pas encore de
 * compte ? Créer mon espace" a été retiré : il pointait vers
 * `/pricing`/`/signup`, qui n'existent plus dans ce projet — la
 * souscription est un parcours Commercial, pas une action du Tenant App.
 *
 * BACKEND PENDING (D2, cf. docs/P0_USERS_DECISIONS_A_VALIDER.md) —
 * `authService.login()` ne vérifie aucun identifiant réel et le déclare
 * honnêtement (`{ ok: false, error: 'BACKEND_PENDING' }`) ; ce formulaire
 * l'affiche explicitement (bandeau ci-dessous) plutôt que de laisser croire
 * qu'une connexion a été vérifiée. Il pose néanmoins le drapeau de session
 * locale qui permet à `AuthGuard` de laisser passer, pour ne pas rendre les
 * écrans déjà construits inaccessibles (cf. docs/FIX_LOGOUT_TENANT_APP.md)
 * — une session de démonstration, jamais présentée comme réelle.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      await authService.login();
      navigate('/dashboard');
    } catch {
      notify.error(t('system', 'errorTitle'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex-1 w-full bg-landing-background flex flex-col justify-center items-center py-20 px-4 sm:px-6 lg:px-8 min-h-screen">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="mx-auto flex justify-center mb-6">
            <Logo className="h-14 w-14 text-landing-accent drop-shadow-sm" />
          </div>
          <h1 className="text-3xl font-extrabold text-landing-primary mb-2">{t('auth', 'title')}</h1>
          <p className="text-slate-500">{t('auth', 'subtitle')}</p>
        </div>

        <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">{t('auth', 'fieldEmail')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><Mail size={18} /></div>
                <input
                  id="email" name="email" type="email" autoComplete="email" required
                  value={email} onChange={(event) => setEmail(event.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-landing-accent focus:border-transparent transition-all"
                  placeholder={t('auth', 'fieldEmailPlaceholder')}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">{t('auth', 'fieldPassword')}</label>
                <Link to="#" className="text-sm font-medium text-landing-accent hover:text-landing-accent-dark transition-colors">{t('auth', 'forgotPassword')}</Link>
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
              {isLoading ? (<><Loader2 size={18} className="animate-spin" />{t('auth', 'submitting')}</>) : (<>{t('auth', 'submit')}<ArrowRight size={18} /></>)}
            </button>
          </form>
          <div role="status" className="mt-6 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            <Info size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span>{t('auth', 'backendPendingNotice')}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
