import { describe, it, expect } from 'vitest';
import { navigationTree, flattenNavigation, findNavigationTrail, isNavigationNodeActive } from './navigation';

/**
 * Mandat « Restructuration finale de la navigation » (2026-09-16) : « Gouvernance »
 * n'est plus un niveau de navigation autonome — Board & Mandates et Meetings
 * deviennent des enfants directs d'Organization, au même niveau que Members.
 * Remplace l'ancien describe "navigationTree — Governance (correction
 * post-implémentation Phase 4C-4)", qui testait l'ancien groupe imbriqué :
 * les régressions qu'il protégeait (pas d'entrée autonome "General Assemblies"/
 * "Assemblies", pas de route orpheline /general-assemblies ou /assemblies)
 * restent couvertes ci-dessous, à la nouvelle profondeur.
 */
describe('navigationTree — Organization (mandat « Restructuration finale de la navigation »)', () => {
  const organization = navigationTree.find((node) => node.label === 'Organization');

  it('has exactly [Members, Board & Mandates, Meetings] as direct children, no intermediate Governance node', () => {
    expect(organization?.children?.map((node) => node.label)).toEqual(['Members', 'Board & Mandates', 'Meetings']);
  });

  it('DENY: no "Governance" node remains anywhere in the tree', () => {
    expect(flattenNavigation(navigationTree).some((node) => node.label === 'Governance')).toBe(false);
  });

  it('ALLOW: Board & Mandates and Meetings keep their existing URLs — only the sidebar depth changes', () => {
    expect(organization?.children?.find((node) => node.label === 'Board & Mandates')?.path).toBe('/organization/governance/board-mandates');
    expect(organization?.children?.find((node) => node.label === 'Meetings')?.path).toBe('/organization/governance/meetings');
  });

  it('DENY: no autonomous "General Assemblies" or "Assemblies" entry remains', () => {
    const labels = flattenNavigation(navigationTree).map((node) => node.label);
    expect(labels).not.toContain('General Assemblies');
    expect(labels).not.toContain('Assemblies');
  });

  it('DENY: no flattened navigation node points at the old /general-assemblies or /assemblies paths', () => {
    const paths = flattenNavigation(navigationTree).map((node) => node.path);
    expect(paths.some((path) => path.includes('general-assemblies'))).toBe(false);
    expect(paths.some((path) => path.endsWith('/governance/assemblies'))).toBe(false);
  });

  it('DENY: no duplicate Members/Board & Mandates/Meetings entries anywhere in the tree', () => {
    const labels = flattenNavigation(navigationTree).map((node) => node.label);
    for (const label of ['Members', 'Board & Mandates', 'Meetings']) {
      expect(labels.filter((item) => item === label)).toHaveLength(1);
    }
  });
});

/**
 * Mandat « Correction définitive — structure du menu Finances » (2026-09-25) —
 * cible EXACTE : Finance = [Caisses, Tontines]. Transactions n'est PAS un menu
 * (une transaction se consulte depuis sa caisse, `/finance/cashboxes/:id`) ;
 * Exercices fiscaux n'est administré qu'en Paramètres (le changement
 * d'exercice passe par le sélecteur global du header). Aucun « Accounts » /
 * « Comptes » ne subsiste. Contributions / Demandes / Prêts / Remboursements /
 * Garants / Distributions restent des TYPES D'OPÉRATION, jamais des menus.
 */
describe('navigationTree — Finance (mandat « Correction définitive — structure du menu Finances »)', () => {
  const finance = navigationTree.find((node) => node.label === 'Finance')!;
  const flat = flattenNavigation(navigationTree);
  const paths = flat.map((node) => node.path);
  const labels = flat.map((node) => node.label);

  it('ALLOW: Finance contains exactly [Treasury, Member Balances, Tontines], in that order (mandats « Trésorerie » + « Bilan des adhérents »)', () => {
    expect(finance.path).toBe('/finance');
    expect(finance.children?.map((child) => child.label)).toEqual(['Treasury', 'Member Balances', 'Tontines']);
    expect(finance.children?.map((child) => child.path)).toEqual(['/finance/treasury', '/finance/member-balances', '/tontines']);
  });

  it('DENY: Finance exposes neither Financial Position, Credit nor Loan Rules; Loan Rules lives only under Settings', () => {
    const financeLabels = finance.children?.map((child) => child.label) ?? [];
    for (const label of ['Financial Position', 'Position', 'Credit', 'Loan Rules']) expect(financeLabels).not.toContain(label);
    expect(finance.children?.some((child) => child.path.startsWith('/finance/credit') || child.path === '/finance/position')).toBe(false);
    const settings = navigationTree.find((node) => node.label === 'Settings');
    expect(settings?.children?.find((child) => child.label === 'Loan Rules')?.path).toBe('/settings/loan-rules');
    expect(labels.filter((label) => label === 'Loan Rules')).toHaveLength(1);
    expect(findNavigationTrail('/settings/loan-rules/LR-1').map((node) => node.label)).toEqual(['Settings', 'Loan Rules']);
  });

  it('DENY: no "Transactions" menu entry anywhere, and no node points at /finance/transactions', () => {
    expect(labels).not.toContain('Transactions');
    expect(paths.some((path) => path.startsWith('/finance/transactions'))).toBe(false);
  });

  it('DENY: Finance contains neither Fiscal Years, Sessions/Meetings, nor Accounts/Comptes', () => {
    const financeLabels = finance.children?.map((child) => child.label) ?? [];
    for (const label of ['Transactions', 'Fiscal Years', 'Meetings', 'Sessions', 'Accounts', 'Comptes']) expect(financeLabels).not.toContain(label);
    expect(paths.some((path) => path.startsWith('/finance/fiscal-years'))).toBe(false);
    expect(paths.some((path) => path.startsWith('/finance/accounts'))).toBe(false);
  });

  it('DENY: no "Accounts"/"Comptes" node remains anywhere in the tree', () => {
    expect(labels).not.toContain('Accounts');
    expect(labels).not.toContain('Comptes');
    expect(paths.some((path) => /account/i.test(path))).toBe(false);
  });

  it('ALLOW: Tontines lives only under Finance (no root duplicate) and keeps its /tontines URL', () => {
    expect(navigationTree.some((node) => node.label === 'Tontines')).toBe(false);
    expect(labels.filter((label) => label === 'Tontines')).toHaveLength(1);
    expect(findNavigationTrail('/tontines').map((node) => node.label)).toEqual(['Finance', 'Tontines']);
    expect(findNavigationTrail('/tontines/t-1').map((node) => node.label)).toEqual(['Finance', 'Tontines']);
    expect(isNavigationNodeActive(finance, '/tontines')).toBe(true);
  });

  it('ALLOW: the Treasury tabs, cashbox pages and the technical /finance/transactions/* routes resolve to Finance → Treasury', () => {
    for (const pathname of ['/finance/treasury', '/finance/treasury/cashboxes', '/finance/treasury/transactions', '/finance/cashboxes', '/finance/cashboxes/c-1', '/finance/transactions', '/finance/transactions/tr-1', '/finance/transactions/create']) {
      expect(findNavigationTrail(pathname).map((node) => node.label)).toEqual(['Finance', 'Treasury']);
    }
  });

  it('ALLOW: Fiscal Years exists only once, under Settings (/settings/fiscal-years)', () => {
    const settings = navigationTree.find((node) => node.label === 'Settings');
    expect(settings?.children?.find((child) => child.label === 'Fiscal Years')?.path).toBe('/settings/fiscal-years');
    expect(labels.filter((label) => label === 'Fiscal Years')).toHaveLength(1);
    expect(findNavigationTrail('/settings/fiscal-years').map((node) => node.label)).toEqual(['Settings', 'Fiscal Years']);
  });

  it('top-level order: Dashboard, Organization, Finance, Operations, Access & Security, Audit, Settings', () => {
    expect(navigationTree.map((node) => node.label)).toEqual(['Dashboard', 'Organization', 'Finance', 'Operations', 'Access & Security', 'Audit', 'Settings']);
  });

  it('DENY: no "Contributions" / "Credit" / "Distributions" / "Loans" / "Guarantors" menu entries anywhere', () => {
    for (const label of ['Contributions', 'Credit', 'Distributions', 'Loans', 'Guarantors', 'Repayments', 'Applications']) {
      expect(labels).not.toContain(label);
    }
    expect(paths.some((path) => path === '/finance/contributions' || path === '/finance/distributions' || path.startsWith('/finance/credit'))).toBe(false);
  });
});

/**
 * Structure cible globale (mandat « Restructuration finale de la navigation »,
 * 2026-09-16) : Dashboard indépendant (jamais sous Organization/Finance), et
 * Settings conservé tel quel comme menu principal avec tous ses sous-menus
 * existants.
 */
describe('navigationTree — top-level structure (mandat « Restructuration finale de la navigation »)', () => {
  it('Dashboard is an independent top-level entry, not nested under Organization or Finance', () => {
    const dashboard = navigationTree.find((node) => node.label === 'Dashboard');
    expect(dashboard).toBeDefined();
    expect(dashboard?.path).toBe('/dashboard');
    const organization = navigationTree.find((node) => node.label === 'Organization');
    const finance = navigationTree.find((node) => node.label === 'Finance');
    expect(organization?.children?.some((node) => node.label === 'Dashboard')).toBe(false);
    expect(finance?.children?.some((node) => node.label === 'Dashboard')).toBe(false);
  });

  it('Settings remains a top-level menu; Branding is merged into Organization and no longer listed', () => {
    const settings = navigationTree.find((node) => node.label === 'Settings');
    expect(settings?.path).toBe('/settings');
    expect(settings?.children?.map((child) => child.label)).toEqual([
      'Organization', 'Fiscal Years', 'Loan Rules', 'Notifications', 'Security Policies', 'Modules', 'Integrations', 'Validation Workflows',
    ]);
  });
});
