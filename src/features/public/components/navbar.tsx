import { Menu } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from './logo';
import { useLocale } from '@/contexts/locale-context';

export function Navbar() {
  const { pathname } = useLocation();
  const { t } = useLocale();

  const navLinks = [
    { href: '/', label: t('public', 'navProduct') },
    { href: '/features', label: t('public', 'navFeatures') },
    { href: '/subscribe', label: t('public', 'navPricing') },
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

          <div className="hidden md:flex items-center gap-4">
            <Link to="/signin" className="text-sm font-medium text-slate-600 hover:text-landing-primary transition-colors">
              {t('public', 'navSignIn')}
            </Link>
            <Link
              to="/signup"
              className="rounded-md bg-landing-primary px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              {t('public', 'navGetStarted')}
            </Link>
          </div>

          <div className="md:hidden">
            <button type="button" aria-label={t('public', 'navMenu')} className="text-slate-600 hover:text-landing-primary">
              <Menu size={24} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
