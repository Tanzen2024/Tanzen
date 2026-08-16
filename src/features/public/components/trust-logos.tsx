import { Building2, Landmark, LineChart, Target, Zap } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';

const logos = [
  { name: 'SolidarityNGO', icon: Landmark },
  { name: 'UnifyTrust', icon: Building2 },
  { name: 'TontineGlobal', icon: LineChart },
  { name: 'ApexAssoc', icon: Target },
  { name: 'ImpactHub', icon: Zap },
];

export function TrustLogos() {
  const { t } = useLocale();
  return (
    <section className="py-12 bg-white border-y border-slate-100">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-bold tracking-widest text-slate-400 uppercase mb-8">
          {t('public', 'trustLogosLabel')}
        </p>
        <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-60">
          {logos.map((logo) => (
            <div key={logo.name} className="flex items-center gap-2 text-slate-500 hover:text-landing-primary transition-colors cursor-pointer">
              <logo.icon size={24} />
              <span className="text-lg font-bold tracking-tight">{logo.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
