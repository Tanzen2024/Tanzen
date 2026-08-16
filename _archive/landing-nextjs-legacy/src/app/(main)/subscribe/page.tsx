"use client";

import { useState } from 'react';
import { Users, Calendar, Layers, Landmark, ShieldCheck, Shield, LifeBuoy, WifiOff, Loader2 } from 'lucide-react';
import Image from 'next/image';

const MODULES = [
  { id: 'MEMBERS', name: 'Membres', icon: Users, description: 'Gestion de base des profils et cotisations standards.', price: 0, tag: 'INCLUS' },
  { id: 'MEETINGS', name: 'Réunions', icon: Calendar, description: 'Agendas, procès-verbaux et votes en ligne.', price: 0, tag: 'INCLUS' },
  { id: 'TONTINES', name: 'Tontines', icon: Layers, description: 'Cycles de rotation, enchères et gestion des tours.', price: 5000, tag: '+ 5 000 CFA/m' },
  { id: 'FINANCE', name: 'Finance', icon: Landmark, description: 'Comptabilité avancée, prêts et intérêts.', price: 12500, tag: '+ 12 500 CFA/m' },
  { id: 'AUDIT', name: 'Audit', icon: ShieldCheck, description: 'Traçabilité complète et rapports réglementaires.', price: 8000, tag: '+ 8 000 CFA/m' },
];

export default function SubscribePage() {
  const [selectedModules, setSelectedModules] = useState<string[]>(['MEMBERS', 'MEETINGS']);
  const [membersCount, setMembersCount] = useState<number>(10);
  const [financialFlow, setFinancialFlow] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Volume pricing logic
  // Just a simple mockup calculation for the UI
  const volumeFee = Math.floor(membersCount * 10) + (financialFlow * 2500);
  
  const modulesPrice = MODULES.filter(m => selectedModules.includes(m.id)).reduce((acc, curr) => acc + curr.price, 0);
  const totalPrice = modulesPrice + volumeFee;

  const toggleModule = (id: string, isFree: boolean) => {
    if (isFree) return; // Cannot toggle free base modules in this mockup
    setSelectedModules(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handlePayment = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('http://localhost:3000/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'ORANGE_MONEY', // Defaulting for now
          amount: totalPrice,
          currency: 'XOF', // Changed to CFA (XOF)
          reference: `sub_tanzen_${Date.now()}`
        })
      });
      const data = await res.json();
      
      if (data.success) {
        setPaymentSuccess(true);
      }
    } catch (error) {
      console.error('Erreur lors du paiement:', error);
      // Simulate success for demo purposes if backend is missing
      setTimeout(() => setPaymentSuccess(true), 1500);
    } finally {
      setIsProcessing(false);
    }
  };

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-primary font-sans p-6 pt-32 pb-32">
        <ShieldCheck className="text-accent mb-6" size={80} />
        <h1 className="text-4xl font-bold mb-4">Paiement Réussi !</h1>
        <p className="text-slate-500 text-lg text-center max-w-md mb-8">
          Votre espace Tanzen est en cours de création. Veuillez vérifier votre téléphone pour la confirmation.
        </p>
        <button className="px-8 py-4 bg-primary text-white hover:bg-slate-800 rounded-xl font-bold transition-all">
          Accéder à mon tableau de bord
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-primary font-sans pt-32 pb-24">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-3xl md:text-4xl font-extrabold text-primary mb-4">
            Tarification Modulaire & Transparente
          </h1>
          <p className="text-lg text-slate-500">
            Ne payez que pour ce que vous utilisez. Configurez vos modules et ajustez selon la taille de votre organisation.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-12">
          
          {/* Left Column: Configuration */}
          <div className="flex-1 space-y-12">
            
            {/* Step 1: Volume */}
            <div>
              <h2 className="text-2xl font-bold mb-6">1. Volume de l&apos;organisation</h2>
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-10">
                
                {/* Members Slider */}
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <label className="text-sm font-semibold text-slate-600">Nombre de membres</label>
                    <div className="px-3 py-1 bg-accent-light text-accent font-bold rounded-full text-sm">
                      {membersCount} membres
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="10" 
                    max="1000" 
                    value={membersCount} 
                    onChange={(e) => setMembersCount(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium">
                    <span>10</span>
                    <span>1000+</span>
                  </div>
                </div>

                {/* Financial Flow Slider */}
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <label className="text-sm font-semibold text-slate-600">Flux financier annuel (CFA)</label>
                    <div className="px-3 py-1 bg-accent-light text-accent font-bold rounded-full text-sm">
                      {['< 1M CFA', '< 10M CFA', '< 50M CFA', '> 50M CFA'][financialFlow]}
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="3" 
                    value={financialFlow} 
                    onChange={(e) => setFinancialFlow(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium">
                    <span>Micro</span>
                    <span>Émergent</span>
                    <span>Établi</span>
                    <span>Premium</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Step 2: Modules */}
            <div>
              <h2 className="text-2xl font-bold mb-6">2. Choisissez vos modules</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {MODULES.map((mod) => {
                  const isSelected = selectedModules.includes(mod.id);
                  const isFree = mod.price === 0;
                  const Icon = mod.icon;
                  return (
                    <div 
                      key={mod.id}
                      onClick={() => toggleModule(mod.id, isFree)}
                      className={`relative p-6 rounded-2xl border ${isFree ? 'cursor-default' : 'cursor-pointer'} transition-all duration-300 bg-white hover:-translate-y-1 hover:shadow-md ${
                        isSelected 
                        ? 'border-accent ring-1 ring-accent' 
                        : 'border-slate-100'
                      }`}
                    >
                      {/* Top right tag */}
                      <div className={`absolute top-4 right-4 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${isFree ? 'bg-primary text-white' : 'text-slate-400'}`}>
                        {isFree ? 'INCLUS' : ''}
                      </div>

                      <div className={`w-10 h-10 rounded-xl mb-4 flex items-center justify-center ${isSelected ? 'text-accent' : 'text-slate-400'}`}>
                        <Icon size={28} />
                      </div>
                      <h3 className="text-lg font-bold mb-2">{mod.name}</h3>
                      <p className="text-xs text-slate-500 mb-6 h-10">{mod.description}</p>
                      <div className={`text-sm font-bold ${isFree ? 'text-accent' : 'text-slate-600'}`}>
                        {isFree ? 'Gratuit' : mod.tag}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Right Column: Sticky Sidebar */}
          <div className="w-full lg:w-[380px]">
            <div className="sticky top-28 p-8 rounded-3xl bg-primary text-white shadow-2xl">
              <h2 className="text-xl font-bold mb-6">Votre estimation</h2>
              
              <div className="space-y-4 mb-8 text-sm">
                <div className="flex justify-between items-center text-slate-300">
                  <span>Base (Inclus)</span>
                  <span className="font-semibold text-accent-light">0 CFA</span>
                </div>
                {MODULES.filter(m => selectedModules.includes(m.id) && m.price > 0).map(mod => (
                  <div key={mod.id} className="flex justify-between items-center text-slate-300">
                    <span>Module {mod.name}</span>
                    <span className="font-semibold">+ {mod.price.toLocaleString('fr-FR')} CFA</span>
                  </div>
                ))}
                <div className="flex justify-between items-center text-slate-300">
                  <span>Frais de volume</span>
                  <span className="font-semibold">{volumeFee > 0 ? `+ ${volumeFee.toLocaleString('fr-FR')} CFA` : '0 CFA'}</span>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10 mb-6">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-extrabold">{totalPrice.toLocaleString('fr-FR')}</span>
                  <span className="text-sm font-medium text-slate-400">CFA / mois</span>
                </div>
                <p className="text-xs text-slate-400">Facturation annuelle disponible (-15%)</p>
              </div>

              <div className="space-y-3">
                <button 
                  disabled={isProcessing}
                  onClick={handlePayment}
                  className="w-full py-4 px-6 rounded-xl font-bold text-primary bg-accent hover:bg-[#00A389] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={20} /> Traitement...
                    </span>
                  ) : (
                    "S'abonner maintenant"
                  )}
                </button>
                <button className="w-full py-4 px-6 rounded-xl font-bold text-white bg-white/10 hover:bg-white/20 transition-colors border border-white/10">
                  Démarrer gratuitement
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-800 rounded-full flex-shrink-0 overflow-hidden">
                  <div className="w-full h-full bg-slate-700"></div>
                </div>
                <p className="text-xs text-slate-400 italic">
                  &quot;TANZEN a révolutionné la gestion de notre coopérative en 3 mois.&quot; — Aminata S., Directrice
                </p>
              </div>

            </div>
          </div>

        </div>

        {/* Bottom Reassurance Section */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-8 rounded-2xl bg-[#EEF2F6] border border-slate-100 flex flex-col items-center text-center">
            <Shield className="text-accent mb-4" size={32} />
            <h3 className="font-bold text-lg mb-2">Sécurité Bancaire</h3>
            <p className="text-sm text-slate-500">Vos données financières sont chiffrées selon les standards bancaires internationaux.</p>
          </div>
          <div className="p-8 rounded-2xl bg-[#EEF2F6] border border-slate-100 flex flex-col items-center text-center">
            <LifeBuoy className="text-accent mb-4" size={32} />
            <h3 className="font-bold text-lg mb-2">Support Local</h3>
            <p className="text-sm text-slate-500">Une équipe dédiée basée à Dakar et Abidjan pour vous accompagner 24/7.</p>
          </div>
          <div className="p-8 rounded-2xl bg-[#EEF2F6] border border-slate-100 flex flex-col items-center text-center">
            <WifiOff className="text-accent mb-4" size={32} />
            <h3 className="font-bold text-lg mb-2">Accès Offline</h3>
            <p className="text-sm text-slate-500">Travaillez sans connexion et synchronisez vos données dès que vous retrouvez le réseau.</p>
          </div>
        </div>

      </main>
    </div>
  );
}
