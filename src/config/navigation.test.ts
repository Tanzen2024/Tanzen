import { describe, it, expect } from 'vitest';
import { navigationTree, flattenNavigation } from './navigation';

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
 * Mandat « Le Compte comme point d'entrée des Transactions » (2026-09-23) :
 * Transactions n'est plus un nœud de premier niveau dans le sidebar — le
 * groupe Finance ne contient plus que [Accounts, Tontines] dans le menu.
 * La route `/finance/transactions` (vue globale) et `/finance/transactions/create`
 * restent disponibles techniquement (voir finance-module-routes.test.tsx),
 * atteignables depuis la page Comptes et le détail d'un compte, mais ne sont
 * plus un nœud de `navigationTree`. Contribution / Demandes / Prêts /
 * Remboursements / Garants / Distributions restent des TYPES D'OPÉRATION :
 * aucune entrée de menu, aucune route (`credit/loan-rules` mis à part, hors
 * menu).
 */
describe('navigationTree — Finance (mandat « Le Compte comme point d\'entrée des Transactions »)', () => {
  const finance = navigationTree.find((node) => node.label === 'Finance');
  const paths = flattenNavigation(navigationTree).map((node) => node.path);

  it('ALLOW: "Finance" is a parent group with exactly [Accounts, Tontines] — Transactions is no longer a menu entry', () => {
    expect(finance?.path).toBe('/finance');
    expect(finance?.children?.map((child) => child.label)).toEqual(['Accounts', 'Tontines']);
    expect(finance?.children?.find((child) => child.label === 'Accounts')?.path).toBe('/finance/accounts');
  });

  it('ALLOW: Tontines is a direct child of Finance and keeps its existing /tontines URL — only the sidebar depth changes', () => {
    expect(finance?.children?.find((child) => child.label === 'Tontines')?.path).toBe('/tontines');
  });

  it('DENY: Tontines is not nested under Accounts, and no longer a top-level entry', () => {
    expect(finance?.children?.find((child) => child.label === 'Accounts')?.children).toBeUndefined();
    expect(navigationTree.some((node) => node.label === 'Tontines')).toBe(false);
  });

  it('DENY: no "Transactions" sidebar node remains anywhere in the tree', () => {
    expect(flattenNavigation(navigationTree).some((node) => node.label === 'Transactions')).toBe(false);
    expect(paths.some((path) => path === '/finance/transactions')).toBe(false);
  });

  it('DENY: no duplicate Accounts/Tontines entries anywhere in the tree', () => {
    const labels = flattenNavigation(navigationTree).map((node) => node.label);
    for (const label of ['Accounts', 'Tontines']) {
      expect(labels.filter((item) => item === label)).toHaveLength(1);
    }
  });

  it('DENY: no "Contributions" / "Credit" / "Distributions" / "Loans" / "Guarantors" menu entries anywhere', () => {
    for (const label of ['Contributions', 'Credit', 'Distributions', 'Loans', 'Guarantors', 'Repayments', 'Applications']) {
      expect(flattenNavigation(navigationTree).some((node) => node.label === label)).toBe(false);
    }
  });

  it('DENY: no navigation node points at /finance/contributions, /finance/distributions or /finance/credit/*', () => {
    expect(paths.some((path) => path === '/finance/contributions')).toBe(false);
    expect(paths.some((path) => path === '/finance/distributions')).toBe(false);
    expect(paths.some((path) => path.startsWith('/finance/credit'))).toBe(false);
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

  it('Settings remains a top-level menu with all of its existing sub-menus untouched', () => {
    const settings = navigationTree.find((node) => node.label === 'Settings');
    expect(settings?.path).toBe('/settings');
    expect(settings?.children?.map((child) => child.label)).toEqual([
      'Organization', 'Localization', 'Fiscal Years', 'Branding', 'Notifications', 'Security Policies', 'Modules', 'Integrations', 'Validation Workflows',
    ]);
  });
});
