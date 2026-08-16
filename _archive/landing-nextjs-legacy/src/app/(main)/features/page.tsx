import { Features } from "@/components/sections/Features";
import { CTA } from "@/components/sections/CTA";

export default function FeaturesPage() {
  return (
    <main className="flex-1 w-full bg-background pt-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-3xl mb-8">
        <div className="inline-flex items-center rounded-full px-4 py-1.5 bg-accent-light text-accent text-sm font-semibold mb-6">
          Explorez l&apos;écosystème
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-primary mb-6">
          Les fonctionnalités pour propulser votre organisation
        </h1>
        <p className="text-lg text-slate-600">
          Découvrez en détail comment nos modules s&apos;articulent pour simplifier la gestion quotidienne de votre association, ONG ou tontine.
        </p>
      </div>
      <Features />
      <CTA />
    </main>
  );
}
