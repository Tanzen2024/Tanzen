import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  FileClock,
  FileText,
  Fingerprint,
  KeyRound,
  Landmark,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Scale,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserCog,
  Users,
  WalletCards,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export type NavigationNode = {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  children?: NavigationNode[];
  /**
   * Préfixes d'URL supplémentaires qui rendent ce nœud actif, pour les pages
   * qui lui appartiennent métier sans vivre sous son URL (ex. le détail d'une
   * transaction, `/finance/transactions/:id`, appartient à Caisses).
   */
  matchPaths?: string[];
};

export const navigationTree: NavigationNode[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  /**
   * Mandat « Restructuration finale de la navigation » (2026-09-16) : « Gouvernance »
   * disparaît comme NIVEAU DE NAVIGATION — Members / Board & Mandates / Meetings
   * deviennent des enfants directs d'Organization, au même niveau hiérarchique.
   * Uniquement un déplacement dans le sidebar : les URLs (`/organization/governance/...`),
   * les routes, permissions, workflows et audits du domaine Gouvernance restent
   * inchangés (voir `organization-module.tsx`/`organization.service.ts`), ce nœud ne
   * fait que les référencer à une profondeur différente.
   */
  {
    label: 'Organization', path: '/organization', icon: Building2, children: [
      { label: 'Members', path: '/organization/members', icon: Users },
      { label: 'Board & Mandates', path: '/organization/governance/board-mandates', icon: UserCog },
      { label: 'Meetings', path: '/organization/governance/meetings', icon: CalendarDays },
    ],
  },
  /**
   * Mandat « Correction définitive — structure du menu Finances » (2026-09-25) :
   * Finance contient EXACTEMENT Caisses et Tontines (ni Position financière,
   * ni Crédit, ni Règles de crédit — ces dernières vivent en Paramètres).
   * - Transactions n'est PLUS une entrée de menu : une transaction est un
   *   mouvement d'une caisse, consulté depuis `/finance/cashboxes/:id`. Les
   *   routes `/finance/transactions/*` restent (détail, création, édition,
   *   journal global) pour compatibilité, jamais exposées dans le sidebar ;
   *   elles activent « Caisses » via `matchPaths`.
   * - Tontines est un sous-menu de Finance mais garde son URL `/tontines`
   *   (hors du préfixe `/finance` — `isNavigationNodeActive` et
   *   `findNavigationTrail` descendent donc dans les enfants même quand l'URL
   *   du parent ne correspond pas).
   * - « Exercices fiscaux » n'est administré qu'en Paramètres → Exercices
   *   fiscaux ; le changement d'exercice passe par le sélecteur global du
   *   header (`FiscalYearSelector`), qui redirige vers `/finance/treasury`.
   * Contributions / Demandes / Prêts / Remboursements / Garants /
   * Distributions restent des TYPES D'OPÉRATION, jamais des entrées de menu.
   */
  {
    label: 'Finance', path: '/finance', icon: Landmark, children: [
      /**
       * Mandat « Trésorerie » (2026-09-27) : UNE entrée « Trésorerie » dont la page porte deux
       * onglets frères, Caisses et Transactions (`/finance/treasury/cashboxes|transactions`).
       * Les fiches (`/finance/cashboxes/:id`, `/finance/transactions/:id`…) et les anciennes
       * URLs (redirigées) restent rattachées à Trésorerie via `matchPaths`.
       */
      { label: 'Treasury', path: '/finance/treasury', icon: WalletCards, matchPaths: ['/finance/cashboxes', '/finance/transactions'] },
      /** Bilan financier des adhérents (mandat du 2026-09-27) : un, plusieurs ou tous les adhérents, à une date donnée. */
      { label: 'Member Balances', path: '/finance/member-balances', icon: Scale },
      { label: 'Tontines', path: '/tontines', icon: Sparkles },
    ],
  },
  {
    label: 'Operations', path: '/operations', icon: Workflow, children: [
      { label: 'Workflows', path: '/operations/workflows', icon: Workflow, badge: '4' },
      { label: 'Notifications', path: '/operations/notifications', icon: Bell, badge: '7' },
      { label: 'Documents', path: '/operations/documents', icon: FileText },
    ],
  },
  {
    label: 'Access & Security', path: '/access-security', icon: ShieldCheck, children: [
      { label: 'Users', path: '/access-security/users', icon: Users },
      { label: 'Roles', path: '/access-security/roles', icon: UserCog },
      { label: 'Permissions', path: '/access-security/permissions', icon: KeyRound },
      { label: 'Sessions', path: '/access-security/sessions', icon: FileClock },
      { label: 'MFA', path: '/access-security/mfa', icon: Fingerprint },
    ],
  },
  {
    label: 'Audit', path: '/audit', icon: Activity, children: [
      { label: 'Overview', path: '/audit/overview', icon: BarChart3 },
      { label: 'Audit Logs', path: '/audit/logs', icon: FileText },
      { label: 'Security Events', path: '/audit/security-events', icon: LockKeyhole },
      { label: 'Activity', path: '/audit/activity', icon: Activity },
    ],
  },
  {
    label: 'Settings', path: '/settings', icon: Settings2, children: [
      { label: 'Organization', path: '/settings/organization', icon: Building2 },
      { label: 'Fiscal Years', path: '/settings/fiscal-years', icon: CalendarDays },
      // Mandat « Simplification du module Caisses » (2026-09-25) : seule entrée des Règles de crédit.
      { label: 'Loan Rules', path: '/settings/loan-rules', icon: Scale },
      // « Identité visuelle » fusionnée dans Organisation (2026-09-27) : plus d'entrée dédiée.
      { label: 'Notifications', path: '/settings/notifications', icon: Bell },
      { label: 'Security Policies', path: '/settings/security-policies', icon: ShieldCheck },
      { label: 'Modules', path: '/settings/modules', icon: ListChecks },
      { label: 'Integrations', path: '/settings/integrations', icon: SlidersHorizontal },
      { label: 'Validation Workflows', path: '/settings/validation-workflows', icon: Workflow },
    ],
  },
];

export function getNavigationLabelKey(path: string): string { return path.split('/').filter(Boolean).at(-1)?.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()) ?? 'dashboard'; }

export function flattenNavigation(nodes: NavigationNode[]): NavigationNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenNavigation(node.children) : [])]);
}

function matchesPath(path: string, pathname: string): boolean {
  return pathname === path || (path !== '/dashboard' && pathname.startsWith(`${path}/`));
}

/** Le nœud lui-même (URL propre ou `matchPaths`) correspond à `pathname`, sans regarder ses enfants. */
export function isNavigationNodeSelfActive(node: NavigationNode, pathname: string): boolean {
  return matchesPath(node.path, pathname) || (node.matchPaths ?? []).some((path) => matchesPath(path, pathname));
}

/** Le nœud ou l'un de ses descendants correspond — un enfant peut vivre hors du préfixe du parent (Finance → Tontines). */
export function isNavigationNodeActive(node: NavigationNode, pathname: string): boolean {
  return isNavigationNodeSelfActive(node, pathname) || (node.children ?? []).some((child) => isNavigationNodeActive(child, pathname));
}

export function findNavigationTrail(pathname: string): NavigationNode[] {
  const walk = (nodes: NavigationNode[], trail: NavigationNode[]): NavigationNode[] => {
    for (const node of nodes) {
      if (node.children) {
        const childTrail = walk(node.children, [...trail, node]);
        if (childTrail.length) return childTrail;
      }
      if (isNavigationNodeSelfActive(node, pathname)) return [...trail, node];
    }
    return [];
  };
  return walk(navigationTree, []);
}
