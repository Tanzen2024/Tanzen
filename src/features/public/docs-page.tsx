import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Book, Terminal, Settings, Users, ArrowRight, FileText, CheckCircle } from 'lucide-react';
import { Logo } from './components/logo';
import { useLocale } from '@/contexts/locale-context';

export function DocsPage() {
  const { t } = useLocale();
  const [activeTab, setActiveTab] = useState('intro');

  const sidebarLinks = [
    { id: 'intro', label: t('public', 'docsNavIntro'), icon: Book },
    { id: 'quickstart', label: t('public', 'docsNavQuickstart'), icon: ArrowRight },
    { id: 'members', label: t('public', 'docsNavMembers'), icon: Users },
    { id: 'finance', label: t('public', 'docsNavFinance'), icon: Settings },
    { id: 'api', label: t('public', 'docsNavApi'), icon: Terminal },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-landing-background">
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-xl font-bold tracking-tight text-landing-primary flex items-center gap-2">
              <Logo className="h-6 w-6 text-landing-accent" />TANZEN
            </Link>
            <span className="text-slate-300 font-light text-2xl hidden md:inline">/</span>
            <span className="text-sm font-semibold text-slate-600 hidden md:inline">{t('public', 'docsHeaderLabel')}</span>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link to="/" className="text-slate-500 hover:text-landing-primary transition-colors">{t('public', 'docsBackToSite')}</Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col md:flex-row">
        <aside className="w-full md:w-64 lg:w-72 border-r border-slate-200 bg-slate-50/50 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="p-6">
            <div className="relative mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input type="text" placeholder={t('public', 'docsSearchPlaceholder')} className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-landing-accent focus:border-transparent" />
            </div>

            <nav className="space-y-1">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-3">{t('public', 'docsNavGeneral')}</h4>
              {sidebarLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => setActiveTab(link.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === link.id ? 'bg-landing-accent-light text-landing-accent' : 'text-slate-600 hover:bg-slate-100 hover:text-landing-primary'}`}
                  >
                    <Icon size={16} />{link.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="flex-1 p-6 sm:p-10 lg:p-12 xl:p-16 max-w-4xl">
          <div className="mb-6 flex items-center gap-2 text-sm text-landing-accent font-semibold">
            <FileText size={16} /><span>{t('public', 'docsOfficialLabel')}</span>
          </div>

          <h1 className="text-4xl font-extrabold text-landing-primary mb-6">{t('public', 'docsWelcomeTitle')}</h1>
          <p className="text-lg text-slate-600 mb-10 leading-relaxed">{t('public', 'docsWelcomeDescription')}</p>

          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-landing-accent-light text-landing-accent flex items-center justify-center mb-4"><CheckCircle size={20} /></div>
              <h3 className="text-lg font-bold text-landing-primary mb-2">{t('public', 'docsCardStartTitle')}</h3>
              <p className="text-sm text-slate-500">{t('public', 'docsCardStartDescription')}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mb-4"><Terminal size={20} /></div>
              <h3 className="text-lg font-bold text-landing-primary mb-2">{t('public', 'docsCardApiTitle')}</h3>
              <p className="text-sm text-slate-500">{t('public', 'docsCardApiDescription')}</p>
            </div>
          </div>

          <div className="prose prose-slate max-w-none">
            <h2 className="text-2xl font-bold text-landing-primary mb-4 border-b border-slate-100 pb-2">{t('public', 'docsConceptsTitle')}</h2>
            <p className="text-slate-600 mb-4 leading-relaxed">{t('public', 'docsConceptsIntro')}</p>
            <ul className="space-y-3 text-slate-600 list-disc pl-5">
              <li><strong>{t('public', 'docsConceptDashboardLabel')}</strong> {t('public', 'docsConceptDashboardText')}</li>
              <li><strong>{t('public', 'docsConceptCyclesLabel')}</strong> {t('public', 'docsConceptCyclesText')}</li>
              <li><strong>{t('public', 'docsConceptVaultLabel')}</strong> {t('public', 'docsConceptVaultText')}</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
