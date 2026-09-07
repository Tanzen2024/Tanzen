import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';

/**
 * Mandat « Refonte module Finances » §1 : les écrans Contributions / Demandes /
 * Prêts / Remboursements / Garants / Distributions ont été supprimés — routes ET
 * composants. Seuls Comptes, Transactions et l'éditeur de politique de prêt
 * (`credit/loan-rules`, hors menu) subsistent.
 */
function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

describe('FinanceModule — routes supprimées (mandat « Refonte module Finances »)', () => {
  it.each([
    '/finance/contributions',
    '/finance/distributions',
    '/finance/distributions/create',
    '/finance/credit/applications',
    '/finance/credit/loans',
    '/finance/credit/loans/L-001',
    '/finance/credit/repayments',
    '/finance/credit/guarantors',
  ])('DENY: %s → page introuvable', async (route) => {
    renderFinance(route);
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });

  it('ALLOW: /finance redirige vers le journal des transactions', async () => {
    renderFinance('/finance');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ajouter une transaction/i })).toBeInTheDocument();
  });

  it('ALLOW: /finance/credit/loan-rules reste accessible (éditeur de politique de prêt)', async () => {
    renderFinance('/finance/credit/loan-rules');
    expect(await screen.findByText('Règles de crédit')).toBeInTheDocument();
  });
});
