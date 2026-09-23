import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';

/**
 * Mandat « Refonte module Finances » §1 : les écrans Contributions /
 * Remboursements / Garants / Distributions dédiés ont été supprimés — routes
 * ET composants (ce sont des types d'opération du journal central, pas des
 * modules). Seuls Comptes, Transactions et l'éditeur de politique de prêt
 * (`credit/loan-rules`, hors menu) subsistaient à l'issue de ce mandat.
 *
 * Mandat « Finalisation Finance/Tontines » (ultérieur) §7-12 : les écrans
 * Demandes de crédit et Prêts sont RÉINTRODUITS pour porter le cycle de vie
 * complet demande → approbation (moteur de workflow générique, WD-001) →
 * décaissement réel (`creditService.disburseLoan`/`createLoanTransaction`) —
 * un changement de comportement métier volontaire et documenté, cf.
 * docs/FINANCE_TONTINES_IMPLEMENTATION.md. Remboursements/Garants/Distributions
 * dédiés restent hors périmètre : le remboursement reste saisi via le journal
 * central, les garants s'affichent au sein de la fiche prêt (pas d'écran
 * séparé), les distributions restent orphelines (cf. rapport d'implémentation).
 */
function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

describe('FinanceModule — routes toujours supprimées (mandat « Refonte module Finances »)', () => {
  it.each([
    '/finance/contributions',
    '/finance/distributions',
    '/finance/distributions/create',
    '/finance/credit/repayments',
    '/finance/credit/guarantors',
  ])('DENY: %s → page introuvable', async (route) => {
    renderFinance(route);
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });

  it('ALLOW: /finance redirige vers la liste des comptes (mandat « Le Compte comme point d\'entrée des Transactions »)', async () => {
    renderFinance('/finance');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nouveau/i })).toBeInTheDocument();
  });

  it('ALLOW: /finance/credit/loan-rules reste accessible (éditeur de politique de prêt)', async () => {
    renderFinance('/finance/credit/loan-rules');
    expect(await screen.findByText('Règles de crédit')).toBeInTheDocument();
  });
});

describe('FinanceModule — écrans Crédit réintroduits (mandat « Finalisation Finance/Tontines »)', () => {
  it('ALLOW: /finance/credit/applications liste les demandes de crédit', async () => {
    renderFinance('/finance/credit/applications');
    expect(await screen.findByText('Demandes de crédit')).toBeInTheDocument();
  });

  it('ALLOW: /finance/credit/applications/create ouvre le formulaire de demande', async () => {
    renderFinance('/finance/credit/applications/create');
    expect(await screen.findByText('Nouvelle demande')).toBeInTheDocument();
  });

  it('ALLOW: /finance/credit/loans liste les prêts', async () => {
    renderFinance('/finance/credit/loans');
    expect(await screen.findByText('Prêts')).toBeInTheDocument();
  });

  it('ALLOW: /finance/credit/loans/L-001 (prêt seedé) affiche sa fiche', async () => {
    renderFinance('/finance/credit/loans/L-001');
    expect(await screen.findByText('Fatou Ndiaye')).toBeInTheDocument();
  });

  it('DENY: /finance/credit/loans/L-DOES-NOT-EXIST → page introuvable', async () => {
    renderFinance('/finance/credit/loans/L-DOES-NOT-EXIST');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });
});
