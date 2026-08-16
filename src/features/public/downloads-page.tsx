import { Smartphone, MonitorSmartphone, DownloadCloud, QrCode, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLocale } from '@/contexts/locale-context';

export function DownloadsPage() {
  const { t } = useLocale();
  return (
    <main className="flex-1 w-full bg-landing-background pt-16 pb-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center rounded-full px-4 py-1.5 bg-landing-accent-light text-landing-accent text-sm font-semibold mb-6">{t('public', 'downloadsBadge')}</div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-landing-primary mb-6">{t('public', 'downloadsTitle')}</h1>
          <p className="text-lg text-slate-600">{t('public', 'downloadsDescription')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center sm:items-start gap-6 hover:shadow-md transition-shadow group">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform"><Smartphone size={32} /></div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-landing-primary mb-2">{t('public', 'downloadsIosTitle')}</h3>
              <p className="text-slate-500 mb-6">{t('public', 'downloadsIosDescription')}</p>
              <button type="button" className="w-full sm:w-auto px-6 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                <DownloadCloud size={18} />{t('public', 'downloadsIosCta')}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center sm:items-start gap-6 hover:shadow-md transition-shadow group">
            <div className="w-16 h-16 rounded-2xl bg-landing-accent-dark text-white flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform"><Smartphone size={32} /></div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-landing-primary mb-2">{t('public', 'downloadsAndroidTitle')}</h3>
              <p className="text-slate-500 mb-6">{t('public', 'downloadsAndroidDescription')}</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button type="button" className="flex-1 px-6 py-3 bg-landing-accent text-white font-medium rounded-xl hover:bg-landing-accent-dark transition-colors flex items-center justify-center gap-2">
                  <DownloadCloud size={18} />{t('public', 'downloadsAndroidCtaPlay')}
                </button>
                <button type="button" className="px-6 py-3 bg-slate-100 text-slate-600 font-medium rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2">
                  {t('public', 'downloadsAndroidCtaApk')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 bg-landing-primary rounded-3xl p-8 md:p-12 max-w-5xl mx-auto text-white flex flex-col md:flex-row items-center justify-between gap-12 relative overflow-hidden">
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex-1 text-center md:text-left z-10">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-landing-accent mb-6 mx-auto md:mx-0"><MonitorSmartphone size={24} /></div>
            <h3 className="text-2xl md:text-3xl font-bold mb-4">{t('public', 'downloadsWebTitle')}</h3>
            <p className="text-slate-300 mb-8 max-w-md">{t('public', 'downloadsWebDescription')}</p>
            {/* Corrigé depuis le site source : pointait vers http://localhost:5173, redirige maintenant vers l'Application Tenant interne */}
            <Link to="/dashboard" className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-landing-primary font-bold rounded-xl hover:bg-slate-100 transition-colors">
              {t('public', 'downloadsWebCta')} <ArrowRight size={18} />
            </Link>
          </div>

          <div className="w-full md:w-auto flex flex-col items-center bg-white/5 p-6 rounded-2xl border border-white/10 z-10 backdrop-blur-sm">
            <div className="w-32 h-32 bg-white rounded-xl flex items-center justify-center p-2 mb-4"><QrCode size={100} className="text-landing-primary" /></div>
            <p className="text-sm font-medium text-slate-300 text-center">{t('public', 'downloadsQrLabel')}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
