import Link from "next/link";

export function CTA() {
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-primary rounded-[2.5rem] px-6 py-16 md:py-24 md:px-16 text-center shadow-2xl relative overflow-hidden">
          
          {/* Abstract background shapes */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-10 pointer-events-none">
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-white rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent rounded-full blur-3xl"></div>
          </div>

          <div className="relative z-10 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6">
              Prêt à transformer votre organisation ?
            </h2>
            <p className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto">
              Rejoignez des centaines d&apos;organisations qui utilisent TANZEN pour simplifier leur quotidien et se concentrer sur leur mission.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                href="/pricing" 
                className="w-full sm:w-auto px-8 py-4 rounded-lg bg-accent text-white font-medium hover:bg-[#00A389] transition-colors md:text-lg"
              >
                Voir nos tarifs
              </Link>
              <Link 
                href="/signup" 
                className="w-full sm:w-auto px-8 py-4 rounded-lg bg-white text-primary font-medium hover:bg-slate-50 transition-colors md:text-lg shadow-sm"
              >
                Essai gratuit 14 jours
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              Aucune carte de crédit requise • Installation en 5 minutes
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}
