import { PlayCircle, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLocale } from '@/contexts/locale-context';

export function Hero() {
  const { t } = useLocale();
  return (
    <section className="relative overflow-hidden pt-20 pb-16 lg:pt-32 lg:pb-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-center">
          <div className="sm:text-center md:max-w-2xl md:mx-auto lg:col-span-6 lg:text-left">
            <div className="inline-flex items-center rounded-full px-4 py-1.5 bg-landing-accent-light text-landing-accent text-sm font-semibold mb-6">
              {t('public', 'heroBadge')}
            </div>

            <h1 className="text-4xl tracking-tight font-extrabold text-landing-primary sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl mb-6">
              {t('public', 'heroTitlePrefix')} <span className="text-landing-accent">{t('public', 'heroTitleAccent')}</span>{t('public', 'heroTitleSuffix')}
            </h1>

            <p className="mt-3 text-base text-slate-600 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0 mb-10">
              {t('public', 'heroDescription')}
            </p>

            <div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start gap-4">
              <Link
                to="/signup"
                className="w-full sm:w-auto flex items-center justify-center px-8 py-4 border border-transparent text-base font-medium rounded-lg text-white bg-landing-primary hover:bg-slate-800 transition-colors md:text-lg"
              >
                {t('public', 'heroCtaPrimary')}
              </Link>
              <a
                href="#demo"
                className="mt-3 w-full sm:w-auto sm:mt-0 flex items-center justify-center gap-2 px-8 py-4 border border-slate-200 text-base font-medium rounded-lg text-landing-primary bg-white hover:bg-slate-50 transition-colors md:text-lg shadow-sm"
              >
                <PlayCircle size={20} className="text-slate-500" />
                {t('public', 'heroCtaSecondary')}
              </a>
            </div>
          </div>

          <div className="mt-16 lg:mt-0 lg:col-span-6 relative">
            <div className="relative mx-auto w-full rounded-2xl shadow-xl lg:max-w-md xl:max-w-xl border border-slate-100 bg-landing-surface-muted aspect-[4/3] flex items-center justify-center p-8 overflow-hidden">
              <div className="w-full h-full bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                  <div className="h-4 w-32 bg-slate-100 rounded-full" />
                  <div className="flex gap-2">
                    <div className="h-6 w-16 bg-slate-100 rounded-md" />
                    <div className="h-6 w-6 bg-slate-200 rounded-full" />
                  </div>
                </div>
                <div className="flex gap-4 flex-1">
                  <div className="w-1/4 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-8 bg-slate-50 rounded-md w-full" />)}
                  </div>
                  <div className="flex-1 flex flex-col gap-4">
                    <div className="flex justify-between items-end h-32 border-b border-slate-100 pb-2">
                      {[40, 70, 45, 90, 65, 100, 80].map((h, i) => (
                        <div key={i} className="w-8 bg-landing-accent rounded-t-md opacity-80 transition-all hover:opacity-100 cursor-pointer" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                    <div className="flex justify-between gap-4">
                      <div className="flex-1 h-20 bg-slate-50 rounded-md" />
                      <div className="flex-1 h-20 bg-slate-50 rounded-md" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-4 -right-4 lg:bottom-4 lg:-left-12 bg-white rounded-full shadow-lg border border-slate-100 py-3 px-5 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-landing-accent-light flex items-center justify-center text-landing-accent">
                  <ShieldCheck size={18} />
                </div>
                <div className="text-sm font-semibold text-landing-primary">
                  {t('public', 'heroBadgeAuditLabel')} <span className="text-landing-accent">(+12%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
