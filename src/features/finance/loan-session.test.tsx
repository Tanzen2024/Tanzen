import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { creditService } from '@/services/credit.service';
import { fiscalSessionService } from '@/services/fiscal-session.service';
import { transactions } from '@/mocks/finance/transactions';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';

/** Fiche prêt : la colonne « Séance » des mouvements lit `Transaction.sessionId` (mandat « Gestion des séances », décision 3). */
const TRANSACTIONS_SEED = structuredClone(transactions);
const SESSIONS_SEED = structuredClone(fiscalSessions);
const restore = () => {
  transactions.splice(0, transactions.length, ...structuredClone(TRANSACTIONS_SEED));
  fiscalSessions.splice(0, fiscalSessions.length, ...structuredClone(SESSIONS_SEED));
};
beforeEach(restore);
afterEach(restore);

describe('Fiche prêt — séance de chaque mouvement', () => {
  it('le décaissement sans séance affiche « — » ; un remboursement en séance affiche « Séance #N — date »', async () => {
    const session = (await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-09-01'))!;
    const result = await creditService.createRepaymentTransaction('T-001', {
      loanId: 'L-001', paymentDate: '2026-09-20', principalPart: 10_000, interestPart: 1_000,
      transactionInput: { cashboxNumber: 'CS-001-CX-004', memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', amount: 11_000, description: 'Remboursement en séance', sessionId: session.id },
    });
    renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route: '/finance/credit/loans/L-001' });
    const card = await screen.findByTestId('loan-movements');
    expect(within(card).getByRole('columnheader', { name: 'Séance' })).toBeInTheDocument();
    const disbursementRow = (await within(card).findByText('REF-2026-0002')).closest('tr') as HTMLElement;
    expect(disbursementRow).toHaveTextContent('—');
    const repaymentRow = (await within(card).findByText(result!.transaction.reference)).closest('tr') as HTMLElement;
    expect(await within(repaymentRow).findByText('Séance #2 — 01/09/2026')).toBeInTheDocument();
  });
});
