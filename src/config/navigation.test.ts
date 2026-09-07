import { describe, it, expect } from 'vitest';
import { navigationTree, flattenNavigation } from './navigation';

/**
 * Correction post-implémentation Phase 4C-4 (cf.
 * docs/P1_GOVERNANCE_PHASE_4C4_GENERALASSEMBLY_MEETING_MIGRATION_UX_CORRECTION_REPORT.md) :
 * `GeneralAssembly`/`Assembly` ne doivent plus apparaître comme entrées de
 * menu autonomes — `Meeting` (« Réunions ») est le seul point d'entrée
 * Governance. Ce test protège contre une régression du même type que celle
 * remontée par l'utilisateur (menu encore affiché après une migration
 * "complète" côté données/service).
 */
describe('navigationTree — Governance (correction post-implémentation Phase 4C-4)', () => {
  const governance = navigationTree.find((node) => node.label === 'Organization')?.children?.find((node) => node.label === 'Governance');

  it('has a Governance section under Organization', () => {
    expect(governance).toBeDefined();
  });

  it('DENY: no autonomous "General Assemblies" or "Assemblies" entry remains', () => {
    const labels = governance?.children?.map((node) => node.label) ?? [];
    expect(labels).not.toContain('General Assemblies');
    expect(labels).not.toContain('Assemblies');
  });

  it('ALLOW: "Meetings" is present and is the sole Governance entry point for meetings/assemblies', () => {
    const labels = governance?.children?.map((node) => node.label) ?? [];
    expect(labels).toContain('Meetings');
    expect(governance?.children?.find((node) => node.label === 'Meetings')?.path).toBe('/organization/governance/meetings');
  });

  it('DENY: no flattened navigation node points at the old /general-assemblies or /assemblies paths', () => {
    const paths = flattenNavigation(navigationTree).map((node) => node.path);
    expect(paths.some((path) => path.includes('general-assemblies'))).toBe(false);
    expect(paths.some((path) => path.endsWith('/governance/assemblies'))).toBe(false);
  });
});

/**
 * Mandat « Refonte module Finances » : le groupe `Finance` ne contient QUE deux
 * enfants — `Accounts` (Comptes) et `Transactions` (journal, point d'entrée
 * unique). Contribution / Demandes / Prêts / Remboursements / Garants /
 * Distributions ne sont pas des modules mais des TYPES D'OPÉRATION : plus aucune
 * entrée de menu, plus aucune route (`credit/loan-rules` mis à part, hors menu).
 */
describe('navigationTree — Finance (mandat « Refonte module Finances »)', () => {
  const finance = navigationTree.find((node) => node.label === 'Finance');
  const paths = flattenNavigation(navigationTree).map((node) => node.path);

  it('ALLOW: "Finance" is a parent group with exactly [Accounts, Transactions]', () => {
    expect(finance?.path).toBe('/finance');
    expect(finance?.children?.map((child) => child.label)).toEqual(['Accounts', 'Transactions']);
    expect(finance?.children?.find((child) => child.label === 'Accounts')?.path).toBe('/finance/accounts');
    expect(finance?.children?.find((child) => child.label === 'Transactions')?.path).toBe('/finance/transactions');
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
