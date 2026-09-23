import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  FileClock,
  FileText,
  Fingerprint,
  Globe2,
  KeyRound,
  Landmark,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
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
   * Mandat « Le Compte comme point d'entrée des Transactions » (2026-09-23) :
   * le groupe Finances ne contient plus que Comptes et Tontines dans le menu.
   * Transactions n'est plus un nœud de premier niveau, mais la fonctionnalité
   * (journal financier, point d'entrée unique de toute opération via le
   * bouton « + Ajouter une transaction ») reste entièrement disponible :
   * `/finance/transactions` (vue globale, filtrable par compte/type/date) et
   * `/finance/transactions/create` existent toujours, atteignables depuis la
   * page Comptes et depuis le détail d'un compte (`AccountDetail`), jamais
   * depuis le menu. Contributions / Demandes de prêts / Prêts / Remboursements /
   * Garants / Distributions restent des TYPES D'OPÉRATION, pas des modules
   * autonomes. `/finance/credit/loan-rules` reste atteignable depuis la page
   * Comptes.
   *
   * Mandat « Restructuration finale de la navigation » (2026-09-16) : Tontines
   * rejoint ce groupe comme domaine financier — déplacement de nœud
   * uniquement, l'URL `/tontines` et toute la logique métier Tontines restent
   * inchangées.
   */
  {
    label: 'Finance', path: '/finance', icon: Landmark, children: [
      { label: 'Accounts', path: '/finance/accounts', icon: WalletCards },
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
      { label: 'Localization', path: '/settings/localization', icon: Globe2 },
      { label: 'Fiscal Years', path: '/settings/fiscal-years', icon: CalendarDays },
      { label: 'Branding', path: '/settings/branding', icon: Sparkles },
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

export function findNavigationTrail(pathname: string): NavigationNode[] {
  const walk = (nodes: NavigationNode[], trail: NavigationNode[]): NavigationNode[] => {
    for (const node of nodes) {
      if (pathname === node.path || (node.path !== '/dashboard' && pathname.startsWith(`${node.path}/`))) {
        if (node.children) {
          const childTrail = walk(node.children, [...trail, node]);
          if (childTrail.length) return childTrail;
        }
        return [...trail, node];
      }
    }
    return [];
  };
  return walk(navigationTree, []);
}
