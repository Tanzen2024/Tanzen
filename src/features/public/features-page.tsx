import { Features } from './components/features-section';
import { CTA } from './components/cta';
import { useLocale } from '@/contexts/locale-context';

export function FeaturesPage() {
  const { t } = useLocale();
  return (
    <main className="flex-1 w-full bg-landing-background pt-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-3xl mb-8">
        <div className="inline-flex items-center rounded-full px-4 py-1.5 bg-landing-accent-light text-landing-accent text-sm font-semibold mb-6">
          {t('public', 'featuresPageBadge')}
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-landing-primary mb-6">{t('public', 'featuresPageTitle')}</h1>
        <p className="text-lg text-slate-600">{t('public', 'featuresPageDescription')}</p>
      </div>
      <Features />
      <CTA />
    </main>
  );
}
