"use client";

import { Smartphone, MonitorSmartphone, DownloadCloud, QrCode, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function DownloadsPage() {
  return (
    <main className="flex-1 w-full bg-background pt-16 pb-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center rounded-full px-4 py-1.5 bg-accent-light text-accent text-sm font-semibold mb-6">
            Multi-plateforme
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-primary mb-6">
            Emportez TANZEN partout avec vous
          </h1>
          <p className="text-lg text-slate-600">
            Gérez votre association, consultez vos comptes et communiquez avec vos membres depuis n&apos;importe quel appareil, où que vous soyez.
          </p>
        </div>

        {/* Download Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          
          {/* iOS App */}
          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center sm:items-start gap-6 hover:shadow-md transition-shadow group">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <Smartphone size={32} />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-primary mb-2">iOS / iPhone</h3>
              <p className="text-slate-500 mb-6">L&apos;expérience native optimisée pour iPhone et iPad. Nécessite iOS 14.0 ou ultérieur.</p>
              <button className="w-full sm:w-auto px-6 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                <DownloadCloud size={18} />
                Télécharger sur l&apos;App Store
              </button>
            </div>
          </div>

          {/* Android App */}
          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center sm:items-start gap-6 hover:shadow-md transition-shadow group">
            <div className="w-16 h-16 rounded-2xl bg-[#00A389] text-white flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <Smartphone size={32} />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-primary mb-2">Android</h3>
              <p className="text-slate-500 mb-6">L&apos;application officielle pour tous les appareils Android. Nécessite Android 8.0 ou ultérieur.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button className="flex-1 px-6 py-3 bg-[#00C48C] text-white font-medium rounded-xl hover:bg-[#00A389] transition-colors flex items-center justify-center gap-2">
                  <DownloadCloud size={18} />
                  Google Play
                </button>
                <button className="px-6 py-3 bg-slate-100 text-slate-600 font-medium rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2">
                  APK direct
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Web Access & QR Code */}
        <div className="mt-12 bg-primary rounded-3xl p-8 md:p-12 max-w-5xl mx-auto text-white flex flex-col md:flex-row items-center justify-between gap-12 relative overflow-hidden">
          {/* Abstract bg circle */}
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex-1 text-center md:text-left z-10">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-accent mb-6 mx-auto md:mx-0">
              <MonitorSmartphone size={24} />
            </div>
            <h3 className="text-2xl md:text-3xl font-bold mb-4">Portail Web (PWA)</h3>
            <p className="text-slate-300 mb-8 max-w-md">
              Pas envie d&apos;installer une application ? Accédez à toutes les fonctionnalités directement depuis votre navigateur web, sur ordinateur ou mobile.
            </p>
            <Link href="http://localhost:5173" className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-primary font-bold rounded-xl hover:bg-slate-100 transition-colors">
              Accéder au portail web <ArrowRight size={18} />
            </Link>
          </div>

          <div className="w-full md:w-auto flex flex-col items-center bg-white/5 p-6 rounded-2xl border border-white/10 z-10 backdrop-blur-sm">
            <div className="w-32 h-32 bg-white rounded-xl flex items-center justify-center p-2 mb-4">
              <QrCode size={100} className="text-primary" />
            </div>
            <p className="text-sm font-medium text-slate-300 text-center">
              Scannez pour télécharger<br/>l&apos;application sur mobile
            </p>
          </div>
        </div>

      </div>
    </main>
  );
}
