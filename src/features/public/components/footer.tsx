import { Globe, MessageSquare, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from './logo';
import { useLocale } from '@/contexts/locale-context';

export function Footer() {
  const { t } = useLocale();
  return (
    <footer className="bg-[#1B2538] text-slate-300 py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <Logo className="h-8 w-8 text-landing-accent" />
              <span className="text-xl font-bold tracking-tight text-white">TANZEN</span>
            </div>
            <p className="text-sm text-slate-400 max-w-xs leading-relaxed">{t('public', 'footerTagline')}</p>
            <div className="flex gap-4 pt-4">
              <Globe size={20} className="hover:text-white cursor-pointer transition-colors" />
              <MessageSquare size={20} className="hover:text-white cursor-pointer transition-colors" />
              <Users size={20} className="hover:text-white cursor-pointer transition-colors" />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-white uppercase">{t('public', 'footerProduct')}</h3>
            <ul className="space-y-3 text-sm">
              <li><Link to="/features" className="hover:text-white transition-colors">{t('public', 'footerFeatures')}</Link></li>
              <li><Link to="/pricing" className="hover:text-white transition-colors">{t('public', 'footerPricing')}</Link></li>
              <li><Link to="/downloads" className="hover:text-white transition-colors">{t('public', 'footerDownloads')}</Link></li>
              <li><Link to="#" className="hover:text-white transition-colors">{t('public', 'footerRoadmap')}</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-white uppercase">{t('public', 'footerResources')}</h3>
            <ul className="space-y-3 text-sm">
              <li><Link to="/docs" className="hover:text-white transition-colors">{t('public', 'footerDocumentation')}</Link></li>
              <li><Link to="#" className="hover:text-white transition-colors">{t('public', 'footerHelpCenter')}</Link></li>
              <li><Link to="#" className="hover:text-white transition-colors">{t('public', 'footerCommunity')}</Link></li>
              <li><Link to="#" className="hover:text-white transition-colors">{t('public', 'footerApi')}</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-white uppercase">{t('public', 'footerCompany')}</h3>
            <ul className="space-y-3 text-sm">
              <li><Link to="#" className="hover:text-white transition-colors">{t('public', 'footerAboutUs')}</Link></li>
              <li><Link to="#" className="hover:text-white transition-colors">{t('public', 'footerCareers')}</Link></li>
              <li><Link to="#" className="hover:text-white transition-colors">{t('public', 'footerContact')}</Link></li>
              <li><Link to="#" className="hover:text-white transition-colors">{t('public', 'footerPress')}</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-700/50 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>{t('public', 'footerCopyright')}</p>
          <p className="italic font-medium text-slate-500">{t('public', 'footerMadeWith')}</p>
          <div className="flex gap-4">
            <Link to="#" className="hover:text-white transition-colors">{t('public', 'footerPrivacy')}</Link>
            <Link to="#" className="hover:text-white transition-colors">{t('public', 'footerTerms')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
