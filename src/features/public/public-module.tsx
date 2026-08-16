import { Route, Routes } from 'react-router-dom';
import { PublicShell } from '@/layouts';
import { LandingPage } from './landing-page';
import { FeaturesPage } from './features-page';
import { SignInPage } from './signin-page';
import { SignUpPage } from './signup-page';
import { SubscribePage } from './subscribe-page';
import { DownloadsPage } from './downloads-page';
import { DocsPage } from './docs-page';
import { NotFoundPage } from '@/routes';

/**
 * `/docs` reste hors du groupe `PublicShell` (Navbar/Footer) — fidèle à la
 * source (`landing/src/app/docs/page.tsx` vit hors du groupe de routes
 * `(main)` de `landing/src/app/(main)/layout.tsx`) : la page documentation a
 * son propre en-tête/sidebar complet, pas la Navbar/Footer marketing.
 */
export function PublicModule() {
  return (
    <Routes>
      <Route element={<PublicShell />}>
        <Route index element={<LandingPage />} />
        <Route path="features" element={<FeaturesPage />} />
        <Route path="signin" element={<SignInPage />} />
        <Route path="signup" element={<SignUpPage />} />
        <Route path="subscribe" element={<SubscribePage />} />
        <Route path="downloads" element={<DownloadsPage />} />
      </Route>
      <Route path="docs" element={<DocsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
