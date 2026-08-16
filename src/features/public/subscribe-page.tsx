import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, Layers, Landmark, ShieldCheck, Shield, LifeBuoy, WifiOff, Loader2 } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';

type ModuleId = 'MEMBERS' | 'MEETINGS' | 'TONTINES' | 'FINANCE' | 'AUDIT';
const MODULES: { id: ModuleId; nameKey: string; descKey: string; icon: typeof Users; price: number }[] = [
  { id: 'MEMBERS', nameKey: 'moduleMembersName', descKey: 'moduleMembersDescription', icon: Users, price: 0 },
  { id: 'MEETINGS', nameKey: 'moduleMeetingsName', descKey: 'moduleMeetingsDescription', icon: Calendar, price: 0 },
  { id: 'TONTINES', nameKey: 'moduleTontinesName', descKey: 'moduleTontinesDescription', icon: Layers, price: 5000 },
  { id: 'FINANCE', nameKey: 'moduleFinanceName', descKey: 'moduleFinanceDescription', icon: Landmark, price: 12500 },
  { id: 'AUDIT', nameKey: 'moduleAuditName', descKey: 'moduleAuditDescription', icon: ShieldCheck, price: 8000 },
];

/**
 * BACKEND PAYMENT PENDING — le site source appelait un backend fantôme
 * (http://localhost:3000/payment/initiate). Aucune passerelle de paiement
 * n'existe côté frontend : la simulation ci-dessous ne fait aucun appel
 * réseau (même pattern que signup/signin), en attendant l'intégration
 * réelle (Mobile Money / carte / etc., non spécifiée dans les sources).
 */
export function SubscribePage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [selectedModules, setSelectedModules] = useState<ModuleId[]>(['MEMBERS', 'MEETINGS']);
  const [membersCount, setMembersCount] = useState(10);
  const [financialFlow, setFinancialFlow] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const volumeFee = Math.floor(membersCount * 10) + financialFlow * 2500;
  const modulesPrice = MODULES.filter((m) => selectedModules.includes(m.id)).reduce((acc, curr) => acc + curr.price, 0);
  const totalPrice = modulesPrice + volumeFee;

  const toggleModule = (id: ModuleId, isFree: boolean) => {
    if (isFree) return;
    setSelectedModules((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const handlePayment = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setPaymentSuccess(true);
    }, 1500);
  };

  const financialFlowLabels = [t('public', 'subscribeFlowMicro'), t('public', 'subscribeFlowEmerging'), t('public', 'subscribeFlowEstablished'), t('public', 'subscribeFlowPremium')];

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-landing-background flex flex-col items-center justify-center text-landing-primary font-sans p-6 pt-32 pb-32">
        <ShieldCheck className="text-landing-accent mb-6" size={80} />
        <h1 className="text-4xl font-bold mb-4">{t('public', 'subscribeSuccessTitle')}</h1>
        <p className="text-slate-500 text-lg text-center max-w-md mb-8">{t('public', 'subscribeSuccessDescription')}</p>
        <button type="button" onClick={() => navigate('/dashboard')} className="px-8 py-4 bg-landing-primary text-white hover:bg-slate-800 rounded-xl font-bold transition-all">
          {t('public', 'subscribeSuccessCta')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-landing-background text-landing-primary font-sans pt-32 pb-24">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-3xl md:text-4xl font-extrabold text-landing-primary mb-4">{t('public', 'subscribeHeading')}</h1>
          <p className="text-lg text-slate-500">{t('public', 'subscribeSubheading')}</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-12">
          <div className="flex-1 space-y-12">
            <div>
              <h2 className="text-2xl font-bold mb-6">{t('public', 'subscribeStep1Title')}</h2>
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-10">
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <label className="text-sm font-semibold text-slate-600">{t('public', 'subscribeMembersLabel')}</label>
                    <div className="px-3 py-1 bg-landing-accent-light text-landing-accent font-bold rounded-full text-sm">
                      {t('public', 'subscribeMembersCount', { count: String(membersCount) })}
                    </div>
                  </div>
                  <input type="range" min="10" max="1000" value={membersCount} onChange={(event) => setMembersCount(parseInt(event.target.value, 10))} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-landing-accent" />
                  <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium"><span>10</span><span>1000+</span></div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-6">
                    <label className="text-sm font-semibold text-slate-600">{t('public', 'subscribeFlowLabel')}</label>
                    <div className="px-3 py-1 bg-landing-accent-light text-landing-accent font-bold rounded-full text-sm">{financialFlowLabels[financialFlow]}</div>
                  </div>
                  <input type="range" min="0" max="3" value={financialFlow} onChange={(event) => setFinancialFlow(parseInt(event.target.value, 10))} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-landing-accent" />
                  <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium">
                    <span>{t('public', 'subscribeFlowMicro')}</span><span>{t('public', 'subscribeFlowEmerging')}</span><span>{t('public', 'subscribeFlowEstablished')}</span><span>{t('public', 'subscribeFlowPremium')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-6">{t('public', 'subscribeStep2Title')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {MODULES.map((mod) => {
                  const isSelected = selectedModules.includes(mod.id);
                  const isFree = mod.price === 0;
                  const Icon = mod.icon;
                  return (
                    <div
                      key={mod.id}
                      onClick={() => toggleModule(mod.id, isFree)}
                      className={`relative p-6 rounded-2xl border ${isFree ? 'cursor-default' : 'cursor-pointer'} transition-all duration-300 bg-white hover:-translate-y-1 hover:shadow-md ${isSelected ? 'border-landing-accent ring-1 ring-landing-accent' : 'border-slate-100'}`}
                    >
                      <div className={`absolute top-4 right-4 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${isFree ? 'bg-landing-primary text-white' : 'text-slate-400'}`}>
                        {isFree ? t('public', 'subscribeIncluded') : ''}
                      </div>
                      <div className={`w-10 h-10 rounded-xl mb-4 flex items-center justify-center ${isSelected ? 'text-landing-accent' : 'text-slate-400'}`}><Icon size={28} /></div>
                      <h3 className="text-lg font-bold mb-2">{t('public', mod.nameKey)}</h3>
                      <p className="text-xs text-slate-500 mb-6 h-10">{t('public', mod.descKey)}</p>
                      <div className={`text-sm font-bold ${isFree ? 'text-landing-accent' : 'text-slate-600'}`}>
                        {isFree ? t('public', 'subscribeFree') : `+ ${mod.price.toLocaleString('fr-FR')} CFA/m`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[380px]">
            <div className="sticky top-28 p-8 rounded-3xl bg-landing-primary text-white shadow-2xl">
              <h2 className="text-xl font-bold mb-6">{t('public', 'subscribeEstimateTitle')}</h2>

              <div className="space-y-4 mb-8 text-sm">
                <div className="flex justify-between items-center text-slate-300">
                  <span>{t('public', 'subscribeBaseIncluded')}</span>
                  <span className="font-semibold text-landing-accent-light">0 CFA</span>
                </div>
                {MODULES.filter((m) => selectedModules.includes(m.id) && m.price > 0).map((mod) => (
                  <div key={mod.id} className="flex justify-between items-center text-slate-300">
                    <span>{t('public', 'subscribeModuleLine', { name: t('public', mod.nameKey) })}</span>
                    <span className="font-semibold">+ {mod.price.toLocaleString('fr-FR')} CFA</span>
                  </div>
                ))}
                <div className="flex justify-between items-center text-slate-300">
                  <span>{t('public', 'subscribeVolumeFee')}</span>
                  <span className="font-semibold">{volumeFee > 0 ? `+ ${volumeFee.toLocaleString('fr-FR')} CFA` : '0 CFA'}</span>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10 mb-6">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-extrabold">{totalPrice.toLocaleString('fr-FR')}</span>
                  <span className="text-sm font-medium text-slate-400">{t('public', 'subscribePerMonth')}</span>
                </div>
                <p className="text-xs text-slate-400">{t('public', 'subscribeAnnualBilling')}</p>
              </div>

              <div className="space-y-3">
                <button type="button" disabled={isProcessing} onClick={handlePayment} className="w-full py-4 px-6 rounded-xl font-bold text-landing-primary bg-landing-accent hover:bg-landing-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {isProcessing ? (<span className="flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={20} /> {t('public', 'subscribeProcessing')}</span>) : t('public', 'subscribeSubmit')}
                </button>
                <button type="button" onClick={() => navigate('/signup')} className="w-full py-4 px-6 rounded-xl font-bold text-white bg-white/10 hover:bg-white/20 transition-colors border border-white/10">
                  {t('public', 'subscribeStartFree')}
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-800 rounded-full flex-shrink-0 overflow-hidden"><div className="w-full h-full bg-slate-700" /></div>
                <p className="text-xs text-slate-400 italic">{t('public', 'subscribeTestimonial')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-8 rounded-2xl bg-[#EEF2F6] border border-slate-100 flex flex-col items-center text-center">
            <Shield className="text-landing-accent mb-4" size={32} />
            <h3 className="font-bold text-lg mb-2">{t('public', 'subscribeReassuranceSecurityTitle')}</h3>
            <p className="text-sm text-slate-500">{t('public', 'subscribeReassuranceSecurityDescription')}</p>
          </div>
          <div className="p-8 rounded-2xl bg-[#EEF2F6] border border-slate-100 flex flex-col items-center text-center">
            <LifeBuoy className="text-landing-accent mb-4" size={32} />
            <h3 className="font-bold text-lg mb-2">{t('public', 'subscribeReassuranceSupportTitle')}</h3>
            <p className="text-sm text-slate-500">{t('public', 'subscribeReassuranceSupportDescription')}</p>
          </div>
          <div className="p-8 rounded-2xl bg-[#EEF2F6] border border-slate-100 flex flex-col items-center text-center">
            <WifiOff className="text-landing-accent mb-4" size={32} />
            <h3 className="font-bold text-lg mb-2">{t('public', 'subscribeReassuranceOfflineTitle')}</h3>
            <p className="text-sm text-slate-500">{t('public', 'subscribeReassuranceOfflineDescription')}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
