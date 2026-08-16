import { Banknote, FileText, Settings, ArrowRight, Users, Calendar, Layers, Landmark, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLocale } from '@/contexts/locale-context';

export function Features() {
  const { t } = useLocale();
  const modules = [
    { nameKey: 'moduleMembersName', descKey: 'moduleMembersDescription', icon: Users } as const,
    { nameKey: 'moduleMeetingsName', descKey: 'moduleMeetingsDescription', icon: Calendar } as const,
    { nameKey: 'moduleTontinesName', descKey: 'moduleTontinesDescription', icon: Layers } as const,
    { nameKey: 'moduleFinanceName', descKey: 'moduleFinanceDescription', icon: Landmark } as const,
    { nameKey: 'moduleAuditName', descKey: 'moduleAuditDescription', icon: ShieldCheck } as const,
  ];
  return (
    <section className="py-24 bg-landing-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-landing-primary mb-4">{t('public', 'featuresHeading')}</h2>
          <p className="text-lg text-slate-600">{t('public', 'featuresSubheading')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-landing-surface rounded-3xl p-8 border border-slate-100 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-center gap-8 group">
            <div className="flex-1 space-y-4 relative z-10">
              <div className="h-12 w-12 rounded-xl bg-landing-accent-light text-landing-accent flex items-center justify-center mb-6">
                <Banknote size={24} />
              </div>
              <h3 className="text-2xl font-bold text-landing-primary">{t('public', 'featureCard1Title')}</h3>
              <p className="text-slate-600">{t('public', 'featureCard1Description')}</p>
            </div>
            <div className="w-full md:w-1/2 h-48 bg-slate-100/80 rounded-xl border border-slate-200/50 p-4 transform transition-transform group-hover:scale-105">
              <div className="w-full h-full border-b-2 border-l-2 border-slate-300 relative flex items-end justify-between px-2 pb-1">
                <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                  <path d="M0,80 Q20,60 40,70 T80,30 T120,50 T160,10 T200,40" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400" />
                </svg>
                {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="w-1 h-1 bg-slate-300 rounded-full" />)}
              </div>
            </div>
          </div>

          <div className="bg-landing-primary rounded-3xl p-8 shadow-sm flex flex-col justify-between">
            <div>
              <div className="h-12 w-12 rounded-xl bg-white/10 text-landing-accent flex items-center justify-center mb-6">
                <Settings size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{t('public', 'featureCard2Title')}</h3>
              <p className="text-slate-400 text-sm">{t('public', 'featureCard2Description')}</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="h-12 w-12 rounded-xl bg-landing-accent-light text-landing-accent flex items-center justify-center mb-6">
                <FileText size={24} />
              </div>
              <h3 className="text-xl font-bold text-landing-primary mb-3">{t('public', 'featureCard3Title')}</h3>
              <p className="text-slate-600 text-sm">{t('public', 'featureCard3Description')}</p>
            </div>
          </div>

          <div className="md:col-span-2 bg-[#EEF2F6] rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1 space-y-4">
              <h3 className="text-2xl font-bold text-landing-primary">{t('public', 'featureCard4Title')}</h3>
              <p className="text-slate-600">{t('public', 'featureCard4Description')}</p>
              <Link to="#" className="inline-flex items-center gap-2 text-landing-primary font-bold hover:text-landing-accent transition-colors pt-2">
                {t('public', 'featureCard4Link')} <ArrowRight size={16} />
              </Link>
            </div>
            <div className="flex gap-4 w-full md:w-auto">
              <div className="bg-white/60 backdrop-blur rounded-xl p-6 flex-1 text-center border border-white">
                <div className="text-2xl font-black text-landing-primary mb-1">99.9%</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('public', 'featureStatUptime')}</div>
              </div>
              <div className="bg-white/60 backdrop-blur rounded-xl p-6 flex-1 text-center border border-white">
                <div className="text-2xl font-black text-landing-primary mb-1">256-bit</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('public', 'featureStatEncryption')}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-24 border-t border-slate-100 pt-16">
          <div className="text-center mb-12">
            <h3 className="text-2xl font-bold text-landing-primary">{t('public', 'modulesHeading')}</h3>
            <p className="text-slate-600 mt-2">{t('public', 'modulesSubheading')}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {modules.map((mod) => {
              const Icon = mod.icon;
              return (
                <div key={mod.nameKey} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:-translate-y-1 transition-transform cursor-default group">
                  <div className="w-10 h-10 rounded-xl bg-landing-accent-light text-landing-accent flex items-center justify-center mb-4">
                    <Icon size={20} />
                  </div>
                  <h4 className="text-lg font-bold text-landing-primary mb-2 group-hover:text-landing-accent transition-colors">{t('public', mod.nameKey)}</h4>
                  <p className="text-sm text-slate-500">{t('public', mod.descKey)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
