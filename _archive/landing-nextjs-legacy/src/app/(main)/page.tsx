import { Hero } from "@/components/sections/Hero";
import { TrustLogos } from "@/components/sections/TrustLogos";
import { Features } from "@/components/sections/Features";
import { CTA } from "@/components/sections/CTA";

export default function LandingPage() {
  return (
    <main className="flex-1 w-full bg-background">
      <Hero />
      <TrustLogos />
      <Features />
      <CTA />
    </main>
  );
}
