import {
  Activity,
  Banknote,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FileClock,
  FileText,
  Fingerprint,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Landmark,
  ListChecks,
  LockKeyhole,
  PanelsTopLeft,
  ReceiptText,
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
};

export const navigationTree: NavigationNode[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Organization', path: '/organization', icon: Building2, children: [
      { label: 'Members', path: '/organization/members', icon: Users },
      {
        label: 'Governance', path: '/organization/governance', icon: Scale, children: [
          { label: 'Assemblies', path: '/organization/governance/assemblies', icon: PanelsTopLeft },
          { label: 'Meetings', path: '/organization/governance/meetings', icon: CalendarDays },
          { label: 'Votes', path: '/organization/governance/votes', icon: ClipboardCheck },
          { label: 'Board & Mandates', path: '/organization/governance/board-mandates', icon: UserCog },
        ],
      },
    ],
  },
  {
    label: 'Finance', path: '/finance', icon: Landmark, children: [
      { label: 'Accounts', path: '/finance/accounts', icon: WalletCards },
      { label: 'Transactions', path: '/finance/transactions', icon: ReceiptText },
      { label: 'Contributions', path: '/finance/contributions', icon: Banknote },
      {
        label: 'Credit', path: '/finance/credit', icon: CreditCard, children: [
          { label: 'Applications', path: '/finance/credit/applications', icon: FileCheck2 },
          { label: 'Loans', path: '/finance/credit/loans', icon: CreditCard },
          { label: 'Repayments', path: '/finance/credit/repayments', icon: ReceiptText },
          { label: 'Guarantors', path: '/finance/credit/guarantors', icon: Users },
        ],
      },
      { label: 'Distributions', path: '/finance/distributions', icon: SlidersHorizontal },
    ],
  },
  { label: 'Tontines', path: '/tontines', icon: Sparkles },
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
