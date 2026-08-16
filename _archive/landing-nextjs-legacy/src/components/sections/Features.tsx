"use client";
import { Banknote, FileText, Settings, ArrowRight, Users, Calendar, Layers, Landmark, ShieldCheck } from "lucide-react";
import Link from "next/link";

export function Features() {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-primary mb-4">
            Une gestion sans compromis
          </h2>
          <p className="text-lg text-slate-600">
            Tout ce dont vous avez besoin pour sécuriser vos finances, engager vos membres et soutenir la croissance de votre organisation.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Large Card 1 */}
          <div className="md:col-span-2 bg-surface rounded-3xl p-8 border border-slate-100 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-center gap-8 group">
            <div className="flex-1 space-y-4 relative z-10">
              <div className="h-12 w-12 rounded-xl bg-accent-light text-accent flex items-center justify-center mb-6">
                <Banknote size={24} />
              </div>
              <h3 className="text-2xl font-bold text-primary">Gestion Financière & Tontines</h3>
              <p className="text-slate-600">
                Suivi des cotisations en temps réel, rapports automatisés et gestion transparente des tours de tontine.
              </p>
            </div>
            {/* Visual Mockup inside card */}
            <div className="w-full md:w-1/2 h-48 bg-slate-100/80 rounded-xl border border-slate-200/50 p-4 transform transition-transform group-hover:scale-105">
              <div className="w-full h-full border-b-2 border-l-2 border-slate-300 relative flex items-end justify-between px-2 pb-1">
                 {/* Fake line chart using div borders and curves */}
                 <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                    <path d="M0,80 Q20,60 40,70 T80,30 T120,50 T160,10 T200,40" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400" />
                 </svg>
                 {[1,2,3,4,5,6].map(i => <div key={i} className="w-1 h-1 bg-slate-300 rounded-full"></div>)}
              </div>
            </div>
          </div>

          {/* Small Card Dark */}
          <div className="bg-primary rounded-3xl p-8 shadow-sm flex flex-col justify-between">
            <div>
              <div className="h-12 w-12 rounded-xl bg-white/10 text-accent flex items-center justify-center mb-6">
                <Settings size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Administration Intelligente</h3>
              <p className="text-slate-400 text-sm">
                Annuaire des membres, rôles personnalisés et automatisation des rappels par email et SMS.
              </p>
            </div>
          </div>

          {/* Small Card Light */}
          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col justify-between">
             <div>
              <div className="h-12 w-12 rounded-xl bg-accent-light text-accent flex items-center justify-center mb-6">
                <FileText size={24} />
              </div>
              <h3 className="text-xl font-bold text-primary mb-3">Coffre-fort Documentaire</h3>
              <p className="text-slate-600 text-sm">
                Archivage sécurisé des statuts, procès-verbaux et reçus de paiement avec signature électronique.
              </p>
            </div>
          </div>

          {/* Large Card 2 */}
          <div className="md:col-span-2 bg-[#EEF2F6] rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1 space-y-4">
              <h3 className="text-2xl font-bold text-primary">Pensé pour le passage à l&apos;échelle</h3>
              <p className="text-slate-600">
                Que vous soyez une association locale de 10 membres ou une ONG internationale avec des milliers de bénévoles.
              </p>
              <Link href="#" className="inline-flex items-center gap-2 text-primary font-bold hover:text-accent transition-colors pt-2">
                En savoir plus <ArrowRight size={16} />
              </Link>
            </div>
            
            <div className="flex gap-4 w-full md:w-auto">
              <div className="bg-white/60 backdrop-blur rounded-xl p-6 flex-1 text-center border border-white">
                <div className="text-2xl font-black text-primary mb-1">99.9%</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Uptime</div>
              </div>
              <div className="bg-white/60 backdrop-blur rounded-xl p-6 flex-1 text-center border border-white">
                <div className="text-2xl font-black text-primary mb-1">256-bit</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Encryption</div>
              </div>
            </div>
          </div>

        </div>
        {/* All Modules List */}
        <div className="mt-24 border-t border-slate-100 pt-16">
          <div className="text-center mb-12">
            <h3 className="text-2xl font-bold text-primary">Découvrez tous nos modules</h3>
            <p className="text-slate-600 mt-2">Construisez la plateforme parfaite pour votre organisation en piochant parmi nos briques fonctionnelles.</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { name: 'Membres', icon: Users, desc: 'Gestion de base des profils et cotisations standards.' },
              { name: 'Réunions', icon: Calendar, desc: 'Agendas, procès-verbaux et votes en ligne.' },
              { name: 'Tontines', icon: Layers, desc: 'Cycles de rotation, enchères et gestion des tours.' },
              { name: 'Finance', icon: Landmark, desc: 'Comptabilité avancée, prêts et intérêts.' },
              { name: 'Audit', icon: ShieldCheck, desc: 'Traçabilité complète et rapports réglementaires.' }
            ].map((mod, i) => {
              const Icon = mod.icon;
              return (
                <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:-translate-y-1 transition-transform cursor-default group">
                  <div className="w-10 h-10 rounded-xl bg-accent-light text-accent flex items-center justify-center mb-4">
                    <Icon size={20} />
                  </div>
                  <h4 className="text-lg font-bold text-primary mb-2 group-hover:text-accent transition-colors">{mod.name}</h4>
                  <p className="text-sm text-slate-500">{mod.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}
