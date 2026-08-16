"use client";
import Link from "next/link";
import { Globe, MessageSquare, Users } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

export function Footer() {
  return (
    <footer className="bg-[#1B2538] text-slate-300 py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          
          {/* Brand & Social */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <Logo className="h-8 w-8 text-accent" />
              <span className="text-xl font-bold tracking-tight text-white">TANZEN</span>
            </div>
            <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
              Digitalisez votre organisation avec confiance.
            </p>
            <div className="flex gap-4 pt-4">
              <Globe size={20} className="hover:text-white cursor-pointer transition-colors" />
              <MessageSquare size={20} className="hover:text-white cursor-pointer transition-colors" />
              <Users size={20} className="hover:text-white cursor-pointer transition-colors" />
            </div>
          </div>

          {/* Product */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-white uppercase">Product</h3>
            <ul className="space-y-3 text-sm">
              <li><Link href="#" className="hover:text-white transition-colors">Features</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Pricing</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Downloads</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Roadmap</Link></li>
            </ul>
          </div>

          {/* Resources */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-white uppercase">Resources</h3>
            <ul className="space-y-3 text-sm">
              <li><Link href="/docs" className="hover:text-white transition-colors">Documentation</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Help Center</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Community</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">API</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-white uppercase">Company</h3>
            <ul className="space-y-3 text-sm">
              <li><Link href="#" className="hover:text-white transition-colors">About Us</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Careers</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Contact</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Press</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-slate-700/50 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© 2026 TANZEN SaaS Platform. All rights reserved.</p>
          <p className="italic font-medium text-slate-500">Made with care for African Organizations</p>
          <div className="flex gap-4">
            <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
