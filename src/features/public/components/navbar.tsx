import { Languages, Menu } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from './logo';
import { useLocale } from '@/contexts/locale-context';

function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className="flex items-center gap-1 text-slate-500">
      <Languages size={15} aria-hidden="true" />
      <label className="sr-only" htmlFor="public-language-switcher">{t('shell', 'language')}</label>
      <select
        id="public-language-switcher"
        value={locale}
        onChange={(event) => setLocale(event.target.value as 'fr' | 'en')}
        className="h-8 rounded-md border-0 bg-transparent px-1 text-xs font-semibold text-slate-500 outline-none hover:bg-slate-100"
      >
        <option value="fr">FR</option>
        <option value="en">EN</option>
      </select>
    </div>
  );
}

export function Navbar() {
  const { pathname } = useLocation();
  const { t } = useLocale();

  /**
   * Checkout se veut un tunnel dédié, sans distraction (exigence refonte UX
   * checkout §10) : on masque la navigation marketing et les CTA "Se
   * connecter"/"Commencer" (qui pointent d'ailleurs déjà vers /checkout ou
   * /pricing, redondants ici) en ne gardant que le logo et la langue. Aucune
   * route/logique n'est modifiée — seul ce header change d'apparence.
   */
  const minimal = pathname.startsWith('/checkout');

  const navLinks = [
    { href: '/', label: t('public', 'navProduct') },
    { href: '/features', label: t('public', 'navFeatures') },
    { href: '/pricing', label: t('public', 'navPricing') },
    { href: '/downloads', label: t('public', 'navDownloads') },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex-shrink-0 flex items-center gap-2">
            <Logo className="h-8 w-8 text-landing-accent" />
            <span className="text-xl font-bold tracking-tight text-landing-primary">TANZEN</span>
          </div>

          {minimal ? (
            <LanguageSwitcher />
          ) : (
            <>
              <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      to={link.href}
                      className={`transition-colors ${isActive ? 'text-landing-accent font-bold underline underline-offset-8 decoration-2' : 'text-slate-600 hover:text-landing-primary'}`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="flex items-center gap-3 sm:gap-4">
                <LanguageSwitcher />
                <div className="hidden items-center gap-4 md:flex">
                  <Link to="/signin" className="text-sm font-medium text-slate-600 hover:text-landing-primary transition-colors">
                    {t('public', 'navSignIn')}
                  </Link>
                  <Link
                    to="/pricing"
                    className="rounded-md bg-landing-primary px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
                  >
                    {t('public', 'navGetStarted')}
                  </Link>
                </div>

                <button type="button" aria-label={t('public', 'navMenu')} className="text-slate-600 hover:text-landing-primary md:hidden">
                  <Menu size={24} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
