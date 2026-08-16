"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

export default function SignInPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate API call, then redirect to the dashboard (localhost:5173)
    setTimeout(() => {
      window.location.href = "http://localhost:5173";
    }, 1000);
  };

  return (
    <main className="flex-1 w-full bg-background flex flex-col justify-center items-center py-20 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-4rem)]">
      
      <div className="w-full max-w-md">
        
        {/* Title */}
        <div className="text-center mb-10">
          <div className="mx-auto flex justify-center mb-6">
            <Logo className="h-14 w-14 text-accent drop-shadow-sm" />
          </div>
          <h1 className="text-3xl font-extrabold text-primary mb-2">
            Bon retour parmi nous
          </h1>
          <p className="text-slate-500">
            Connectez-vous pour accéder à votre espace TANZEN.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                Adresse email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail size={18} />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
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
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                  Mot de passe
                </label>
                <Link href="#" className="text-sm font-medium text-accent hover:text-[#00A389] transition-colors">
                  Oublié ?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock size={18} />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-primary hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Connexion...
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Registration link */}
          <div className="mt-8 text-center text-sm text-slate-500">
            Vous n&apos;avez pas encore de compte ?{" "}
            <Link href="/subscribe" className="font-bold text-primary hover:text-accent transition-colors">
              Créer mon espace
            </Link>
          </div>

        </div>
      </div>
    </main>
  );
}
