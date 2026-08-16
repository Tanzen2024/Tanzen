"use client";

import { useState } from "react";
import Link from "next/link";
import { User, Building2, Mail, Lock, ArrowRight, Loader2, CheckCircle } from "lucide-react";

export default function SignUpPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate API registration call, then redirect to /subscribe to choose modules
    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
      setTimeout(() => {
        window.location.href = "/subscribe";
      }, 1500);
    }, 1200);
  };

  if (isSuccess) {
    return (
      <main className="flex-1 w-full bg-background flex flex-col justify-center items-center py-20 px-4 min-h-[calc(100vh-4rem)]">
        <CheckCircle className="text-accent mb-6" size={80} />
        <h1 className="text-3xl font-bold text-primary mb-2 text-center">
          Compte créé avec succès !
        </h1>
        <p className="text-slate-500 text-center max-w-sm">
          Redirection vers la configuration de votre espace TANZEN...
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full bg-background flex flex-col justify-center items-center py-16 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-4rem)]">
      
      <div className="w-full max-w-md">
        
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-primary mb-3">
            Créez votre espace
          </h1>
          <p className="text-slate-500">
            Rejoignez TANZEN et digitalisez la gestion de votre organisation en quelques minutes.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Name Field */}
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Prénom et Nom
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User size={18} />
                </div>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  placeholder="Jean Dupont"
                />
              </div>
            </div>

            {/* Organization Field */}
            <div>
              <label htmlFor="org" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Nom de l&apos;organisation
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Building2 size={18} />
                </div>
                <input
                  id="org"
                  type="text"
                  required
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  placeholder="Association Les Bâtisseurs"
                />
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Adresse email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail size={18} />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  placeholder="nom@association.com"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock size={18} />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  placeholder="Créer un mot de passe solide"
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                En créant un compte, vous acceptez nos <Link href="#" className="underline">Conditions d&apos;utilisation</Link> et notre <Link href="#" className="underline">Politique de confidentialité</Link>.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !email || !password || !name || !org}
              className="w-full mt-2 flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-primary bg-accent hover:bg-[#00A389] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Création en cours...
                </>
              ) : (
                <>
                  Continuer vers la configuration
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Login link */}
          <div className="mt-8 text-center text-sm text-slate-500">
            Vous avez déjà un compte ?{" "}
            <Link href="/signin" className="font-bold text-primary hover:text-accent transition-colors">
              Se connecter
            </Link>
          </div>

        </div>
      </div>
    </main>
  );
}
