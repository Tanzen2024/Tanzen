import { useState, type Dispatch, type SetStateAction } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getNavigationLabelKey, navigationTree, type NavigationNode } from '@/config/navigation';
import { useUiStore } from '@/stores/ui-store';
import { useLocale } from '@/contexts/locale-context';

function isActive(pathname: string, currentPath: string) { return currentPath === pathname || (pathname !== '/dashboard' && currentPath.startsWith(`${pathname}/`)); }

function NavigationBranch({ node, currentPath, collapsed, expanded, setExpanded, level = 0, onNavigate, onExpandSidebar }: { node: NavigationNode; currentPath: string; collapsed: boolean; expanded: string[]; setExpanded: Dispatch<SetStateAction<string[]>>; level?: number; onNavigate: () => void; onExpandSidebar: () => void }) {
  const navigate = useNavigate();
  const { t } = useLocale();
  const hasChildren = Boolean(node.children?.length);
  const open = expanded.includes(node.path) || isActive(node.path, currentPath);
  const active = currentPath === node.path;
  const Icon = node.icon;
  const toggle = () => setExpanded((items) => items.includes(node.path) ? items.filter((item) => item !== node.path) : [...items, node.path]);
  return <div><button type="button" title={collapsed ? t('nav', getNavigationLabelKey(node.path)) : undefined} onClick={() => { if (hasChildren) { if (collapsed) { onExpandSidebar(); setExpanded((items) => items.includes(node.path) ? items : [...items, node.path]); } else toggle(); } else { navigate(node.path); onNavigate(); } }} className={`group flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12px] transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-white'} ${level > 0 ? 'pl-8' : ''}`}><Icon size={17} className="shrink-0" /><span className={`min-w-0 flex-1 truncate ${collapsed ? 'sr-only' : ''}`}>{t('nav', getNavigationLabelKey(node.path))}</span>{!collapsed && node.badge && <span className="min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{node.badge}</span>}{!collapsed && hasChildren && <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />}</button>{hasChildren && open && !collapsed && <div className="space-y-0.5 pt-0.5">{node.children?.map((child) => <NavigationBranch key={child.path} node={child} currentPath={currentPath} collapsed={collapsed} expanded={expanded} setExpanded={setExpanded} level={level + 1} onNavigate={onNavigate} onExpandSidebar={onExpandSidebar} />)}</div>}</div>;
}

export function ShellSidebar({ expanded, setExpanded, activePaths, collapsed, mobileOpen, onMobileClose }: { expanded: string[]; setExpanded: Dispatch<SetStateAction<string[]>>; activePaths: string[]; collapsed: boolean; mobileOpen: boolean; onMobileClose: () => void }) {
  const navigate = useNavigate();
  const { t } = useLocale();
  const { toggleSidebar, setSidebarCollapsed } = useUiStore();
  const expandSidebar = () => setSidebarCollapsed(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Mandat "Figer le branding TANZEN au scroll" (2026-09-16) : `AppShell` place l'<aside> dans un
  // conteneur `min-h-screen` (pas `h-screen`) qui grandit avec le contenu de la page, donc la seule
  // façon de garder le sidebar ancré à l'écran quand la page défile est de le sortir du flux normal.
  // En mobile, `fixed` + translate-x gère déjà le tiroir slide-in. Au lg, on remplace l'ancien
  // `lg:static` (qui faisait défiler tout le sidebar, branding compris, avec la page) par
  // `lg:sticky lg:top-0` : le sidebar reste épinglé en haut du viewport. `h-screen` (au lieu de
  // s'appuyer sur `inset-y-0`, neutralisé au lg par `lg:inset-auto`) fixe sa hauteur à 100vh dans
  // les deux modes, ce qui borne le `<nav>` `flex-1 min-h-0 overflow-y-auto` : lui seul défile,
  // le bandeau `shrink-0` ci-dessous et le bloc aide/réduire en bas restent fixes.
  return <><aside className={`fixed inset-y-0 left-0 z-40 flex h-screen w-[276px] flex-col bg-[hsl(var(--sidebar))] px-3 py-4 text-[hsl(var(--sidebar-foreground))] shadow-xl transition-transform duration-200 lg:sticky lg:inset-auto lg:top-0 lg:translate-x-0 lg:shadow-none ${collapsed ? 'lg:w-[76px]' : ''} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
    {/* Bandeau de branding pleine largeur, fond bleu/navy (mandat "Alignement et fond complet du
        bloc TANZEN Enterprise", 2026-09-16) :
        - largeur : `-mx-3` compense exactement le `px-3` de l'<aside> pour que le fond touche les
          deux bords internes du sidebar (au lieu d'une carte flottante avec des marges de part et
          d'autre) ; seul ce conteneur externe porte le fond, jamais un padding qui le réduirait —
          le padding de CONTENU (`px-3` en expanded) est appliqué à CE MÊME conteneur mais n'affecte
          que la position du logo/texte à l'intérieur, pas la largeur du fond (`box-sizing: border-box`
          par défaut via Tailwind Preflight).
        - alignement vertical : `-mt-4` annule le `py-4` (padding-top) de l'<aside> pour que ce
          conteneur démarre exactement au sommet du sidebar (y=0), puis `h-16` lui donne la même
          hauteur que le `<header>` de `ShellHeader` (`h-16` aussi) où vit « Tenant actuel »
          (`TenantBreadcrumb`) — les deux conteneurs démarrent donc au même niveau (y=0) avec la
          même hauteur, un alignement garanti par construction plutôt que par un padding calculé à
          la main (fragile si le header ou le bandeau changent de contenu plus tard).
        - couleur : `bg-primary` (même bleu que le badge actif de la navigation et le logo "T"
          d'origine) au lieu d'un fond clair — le logo passe en carte blanche/texte bleu pour
          rester lisible sur ce fond, cohérent avec la palette existante (aucune couleur inventée). */}
    <div className={`-mx-3 -mt-4 flex h-16 shrink-0 items-center gap-2 bg-primary ${collapsed ? 'justify-center px-2' : 'px-3'}`}>
      <button type="button" onClick={() => navigate('/dashboard')} className="grid size-9 shrink-0 place-items-center rounded-xl bg-white font-heading text-xl font-bold text-primary shadow-sm" aria-label={t('nav', 'dashboard')}>T</button>
      {!collapsed && <div className="min-w-0 flex-1"><p className="font-heading text-[17px] font-bold tracking-[.08em] text-white">TANZEN</p><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-white/70">{t('shell', 'platformTagline')}</p></div>}
      <button type="button" onClick={onMobileClose} className="grid size-8 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white lg:hidden" aria-label={t('shell', 'closeMenu')}><X size={18} /></button>
    </div>
    {/* Mandat "Refonte navigation/contexte" (2026-09-16) : le sidebar est désormais réservé au
    branding TANZEN (ci-dessus) et à la navigation (ci-dessous) — tenant courant + exercice fiscal
    vivent uniquement dans le header (`ShellHeader` : `TenantBreadcrumb` + `FiscalYearSelector`),
    plus aucune instance ici, à aucune largeur d'écran. */}
<nav className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label={t('shell', 'navigation')}><NavigationBranch node={navigationTree[0]} currentPath={activePaths[0] ?? ''} collapsed={collapsed} expanded={expanded} setExpanded={setExpanded} onNavigate={onMobileClose} onExpandSidebar={expandSidebar} /><div className={`my-4 border-t border-white/10 ${collapsed ? 'mx-1' : ''}`} />{navigationTree.slice(1).map((node) => <NavigationBranch key={node.path} node={node} currentPath={activePaths[0]} collapsed={collapsed} expanded={expanded} setExpanded={setExpanded} onNavigate={onMobileClose} onExpandSidebar={expandSidebar} />)}</nav><div className="mt-3 border-t border-white/10 pt-3"><button type="button" onClick={() => setHelpOpen((value) => !value)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-300 hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center' : ''}`}><CircleHelp size={17} /><span className={collapsed ? 'sr-only' : 'flex-1'}>{t('shell', 'needHelp')}</span>{!collapsed && <ChevronRight size={15} />}</button>{helpOpen && !collapsed && <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-300">{t('shell', 'helpText')}</div>}<button type="button" onClick={() => { toggleSidebar(); setSidebarCollapsed(!collapsed); }} className={`mt-2 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] text-slate-400 hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center' : ''}`} aria-label={collapsed ? t('shell', 'expandMenu') : t('shell', 'reduceMenu')}>{collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>{t('shell', 'reduceMenu')}</span></>}</button></div></aside>{mobileOpen && <button type="button" onClick={onMobileClose} className="fixed inset-0 z-30 bg-slate-950/55 lg:hidden" aria-label={t('shell', 'closeMenu')} />}<button type="button" onClick={() => useUiStore.getState().setMobileSidebarOpen(true)} className="fixed bottom-5 left-5 z-20 grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg lg:hidden" aria-label={t('shell', 'openMenu')}><Menu size={19} /></button></>;
}
