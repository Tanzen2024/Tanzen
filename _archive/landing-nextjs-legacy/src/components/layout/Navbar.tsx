"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

export function Navbar() {
  const pathname = usePathname();

  const navLinks = [
    { href: "/", label: "Product" },
    { href: "/features", label: "Features" },
    { href: "/subscribe", label: "Pricing" },
    { href: "/downloads", label: "Downloads" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center gap-2">
            <Logo className="h-8 w-8 text-accent" />
            <span className="text-xl font-bold tracking-tight text-primary">TANZEN</span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link 
                  key={link.href}
                  href={link.href} 
                  className={`transition-colors ${isActive ? 'text-accent font-bold underline underline-offset-8 decoration-2' : 'text-slate-600 hover:text-primary'}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-4">
            <Link href="/signin" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors">
              Sign In
            </Link>
            <Link 
              href="/signup" 
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button className="text-slate-600 hover:text-primary">
              <Menu size={24} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
