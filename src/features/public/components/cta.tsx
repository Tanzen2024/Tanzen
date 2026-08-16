import { Link } from 'react-router-dom';
import { useLocale } from '@/contexts/locale-context';

export function CTA() {
  const { t } = useLocale();
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-landing-primary rounded-[2.5rem] px-6 py-16 md:py-24 md:px-16 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-10 pointer-events-none">
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-landing-accent rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6">{t('public', 'ctaHeading')}</h2>
            <p className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto">{t('public', 'ctaDescription')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/pricing"
                className="w-full sm:w-auto px-8 py-4 rounded-lg bg-landing-accent text-white font-medium hover:bg-landing-accent-dark transition-colors md:text-lg"
              >
                {t('public', 'ctaSeePricing')}
              </Link>
              <Link
                to="/signup"
                className="w-full sm:w-auto px-8 py-4 rounded-lg bg-white text-landing-primary font-medium hover:bg-slate-50 transition-colors md:text-lg shadow-sm"
              >
                {t('public', 'ctaFreeTrial')}
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">{t('public', 'ctaFinePrint')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
