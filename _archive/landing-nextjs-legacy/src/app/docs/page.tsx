"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Book, Terminal, Settings, Users, ArrowRight, FileText, CheckCircle } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState("intro");

  const sidebarLinks = [
    { id: "intro", label: "Introduction", icon: Book },
    { id: "quickstart", label: "Démarrage rapide", icon: ArrowRight },
    { id: "members", label: "Gestion des membres", icon: Users },
    { id: "finance", label: "Tontines & Finance", icon: Settings },
    { id: "api", label: "Référence API", icon: Terminal },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Docs Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
              <Logo className="h-6 w-6 text-accent" />
              TANZEN
            </Link>
            <span className="text-slate-300 font-light text-2xl hidden md:inline">/</span>
            <span className="text-sm font-semibold text-slate-600 hidden md:inline">Documentation</span>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link href="/" className="text-slate-500 hover:text-primary transition-colors">Retour au site</Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col md:flex-row">
        
        {/* Sidebar */}
        <aside className="w-full md:w-64 lg:w-72 border-r border-slate-200 bg-slate-50/50 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        <div className="p-6">
          <div className="relative mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Rechercher..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <nav className="space-y-1">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-3">Général</h4>
            {sidebarLinks.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.id}
                  onClick={() => setActiveTab(link.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === link.id 
                    ? "bg-accent-light text-accent" 
                    : "text-slate-600 hover:bg-slate-100 hover:text-primary"
                  }`}
                >
                  <Icon size={16} />
                  {link.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 p-6 sm:p-10 lg:p-12 xl:p-16 max-w-4xl">
        <div className="mb-6 flex items-center gap-2 text-sm text-accent font-semibold">
          <FileText size={16} />
          <span>Documentation Officielle</span>
        </div>
        
        <h1 className="text-4xl font-extrabold text-primary mb-6">
          Bienvenue sur le centre d&apos;aide TANZEN
        </h1>
        
        <p className="text-lg text-slate-600 mb-10 leading-relaxed">
          Découvrez comment configurer votre espace, importer vos membres, gérer vos premières tontines et exploiter au maximum toutes les fonctionnalités de la plateforme.
        </p>

        <div className="grid sm:grid-cols-2 gap-6 mb-12">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-accent-light text-accent flex items-center justify-center mb-4">
              <CheckCircle size={20} />
            </div>
            <h3 className="text-lg font-bold text-primary mb-2">Guide de démarrage</h3>
            <p className="text-sm text-slate-500">Configurez votre association en 5 étapes simples.</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mb-4">
              <Terminal size={20} />
            </div>
            <h3 className="text-lg font-bold text-primary mb-2">Documentation API</h3>
            <p className="text-sm text-slate-500">Connectez vos propres outils grâce à notre API REST.</p>
          </div>
        </div>

        <div className="prose prose-slate max-w-none">
          <h2 className="text-2xl font-bold text-primary mb-4 border-b border-slate-100 pb-2">Concepts clés</h2>
          <p className="text-slate-600 mb-4 leading-relaxed">
            TANZEN est structuré autour du concept d&apos;<strong>Organisation</strong>. Une organisation peut être une association, une coopérative, ou un groupe de tontine informel. 
            Chaque organisation est composée de <strong>Membres</strong>, qui peuvent participer à des <strong>Cycles de Tontine</strong> ou des <strong>Fonds de solidarité</strong>.
          </p>
          <ul className="space-y-3 text-slate-600 list-disc pl-5">
            <li><strong>Le Tableau de bord :</strong> Votre vue centrale pour suivre les cotisations en temps réel.</li>
            <li><strong>Les Cycles :</strong> Une période définie durant laquelle les membres cotisent (ex: 12 mois).</li>
            <li><strong>Le Coffre-fort :</strong> Espace sécurisé (chiffré) pour conserver vos statuts et reçus.</li>
          </ul>
        </div>

      </div>

    </main>
    </div>
  );
}
