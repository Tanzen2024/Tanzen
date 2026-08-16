import { Hero } from './components/hero';
import { TrustLogos } from './components/trust-logos';
import { Features } from './components/features-section';
import { CTA } from './components/cta';

export function LandingPage() {
  return (
    <main className="flex-1 w-full bg-landing-background">
      <Hero />
      <TrustLogos />
      <Features />
      <CTA />
    </main>
  );
}
