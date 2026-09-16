import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { creditService } from '@/services/credit.service';
import { financeService } from '@/services/finance.service';
import { transactions } from '@/mocks/finance/transactions';
import type { Loan } from '@/mocks/finance/loans';

/** ISOLATION : l'enregistrement fait un `transactions.push(...)` sur le mock module-level — on restaure le seed exact avant/après chaque cas pour qu'aucun test ne dépende de l'ordre. */
const TRANSACTIONS_SEED = structuredClone(transactions);
const restoreTransactionsSeed = () => transactions.splice(0, transactions.length, ...structuredClone(TRANSACTIONS_SEED));

/**
 * Mandat « REMBOURSEMENT — supprimer Prêt concerné » : le formulaire de
 * remboursement n'expose PAS de sélecteur de prêt. Après le choix de
 * l'adhérent, la dette est déterminée automatiquement ; « Montant à
 * rembourser », « Report de dette » et « Statut » sont calculés et en lecture
 * seule ; seul « Montant versé » est saisi. Sans dette active →
 * enregistrement impossible. Tenant par défaut : T-001 (rôle admin).
 *
 * `creditService.listLoansByMember` est stubé pour contrôler la dette de
 * l'adhérent sans dépendre du jeu de seeds (aucun membre T-001 n'est
 * actuellement sans prêt actif).
 */
function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

function makeLoan(partial: Partial<Loan>): Loan {
  return {
    id: 'L-TEST', tenantId: 'T-001', memberId: 'M-001', borrower: 'Fatou Ndiaye', principal: 300_000, interestRate: 10,
    interestAmount: 30_000, totalRepayable: 330_000, paidAmount: 0, outstanding: 330_000, disbursementDate: '2026-06-01',
    maturityDate: '2027-06-01', monthlyPayment: 30_000, nextPaymentDate: '2026-09-01', lastPaymentDate: '2026-08-01',
    status: 'active', progress: 0, applicationId: '', tenantName: 'Coopérative Sutura', penalties: [], documents: [], activities: [],
    ...partial,
  };
}

async function openRepaymentForm(user: ReturnType<typeof userEvent.setup>) {
  renderFinance('/finance/transactions/create');
  await screen.findByRole('option', { name: /CS-001-TRÉS/ });
  await user.selectOptions(screen.getByLabelText(/Caisse \/ Compte/), 'CS-001-TRÉS');
  await user.selectOptions(screen.getByLabelText(/Catégorie/), 'REMBOURSEMENT');
  const memberSelect = screen.getByLabelText(/Adhérent/);
  await waitFor(() => expect(within(memberSelect).getAllByRole('option').length).toBeGreaterThan(1));
  await user.selectOptions(memberSelect, 'M-001');
}

let createRepaymentTransactionSpy: ReturnType<typeof vi.spyOn>;

/**
 * Mandat « Finalisation Finance/Tontines » §14/§15 : le formulaire appelle
 * désormais `creditService.createRepaymentTransaction` (chemin atomique —
 * Transaction + Repayment en une seule opération validée), plus l'ancien
 * couple `createTransaction` puis `createRepayment` en deux appels séparés.
 * Le mock délègue la création de la Transaction au vrai `financeService`
 * (pour obtenir un identifiant réel et une page de détail affichable) tout en
 * stubant le `Loan`/`Repayment` — les prêts de test (`L-90x`) n'existent que
 * dans `listLoansByMember`, jamais dans le tableau `loans` réel.
 */
beforeEach(() => {
  restoreTransactionsSeed();
  createRepaymentTransactionSpy = vi.spyOn(creditService, 'createRepaymentTransaction').mockImplementation(async (tenantId, input) => {
    const transaction = await financeService.createTransaction(tenantId, input.transactionInput);
    if (!transaction) return undefined;
    return {
      loan: makeLoan({ id: input.loanId }),
      repayment: { id: 'RP-TEST', tenantId, loanId: input.loanId, borrower: 'Fatou Ndiaye', amount: input.principalPart + input.interestPart, paymentDate: input.paymentDate, principalPart: input.principalPart, interestPart: input.interestPart, status: 'completed' as const },
      transaction,
    };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  restoreTransactionsSeed();
});

describe('Finance → Transactions — REMBOURSEMENT (détermination automatique de la dette)', () => {
  it('aucun sélecteur « Prêt concerné » ; « Montant à rembourser » vient de la dette résolue et est en lecture seule', async () => {
    vi.spyOn(creditService, 'listLoansByMember').mockResolvedValue([makeLoan({ id: 'L-901', outstanding: 115_000 })]);
    const user = userEvent.setup();
    await openRepaymentForm(user);

    expect(await screen.findByLabelText('Montant à rembourser')).toBeInTheDocument();
    expect(screen.queryByLabelText('Prêt concerné')).not.toBeInTheDocument();
    const dueField = screen.getByLabelText('Montant à rembourser') as HTMLInputElement;
    expect(dueField).toHaveAttribute('readonly');
    expect(dueField.value).toMatch(/115[\s  ]?000/);
  });

  it('« Report de dette » et « Statut » sont calculés à partir du montant versé', async () => {
    vi.spyOn(creditService, 'listLoansByMember').mockResolvedValue([makeLoan({ id: 'L-902', outstanding: 115_000 })]);
    const user = userEvent.setup();
    await openRepaymentForm(user);
    await user.type(await screen.findByLabelText('Montant versé *'), '50000');

    expect((screen.getByLabelText('Report de dette') as HTMLInputElement).value).toMatch(/65[\s  ]?000/);
    expect(screen.getAllByText('Partiellement remboursé').length).toBeGreaterThan(0);
  });

  it('un versement égal au montant dû → statut « Totalement réglé »', async () => {
    vi.spyOn(creditService, 'listLoansByMember').mockResolvedValue([makeLoan({ id: 'L-903', outstanding: 80_000 })]);
    const user = userEvent.setup();
    await openRepaymentForm(user);
    await user.type(await screen.findByLabelText('Montant versé *'), '80000');

    expect(screen.getAllByText('Totalement réglé').length).toBeGreaterThan(0);
  });

  it('enregistre le remboursement : crée la transaction ET appelle createRepaymentTransaction sur le prêt résolu (chemin atomique)', async () => {
    vi.spyOn(creditService, 'listLoansByMember').mockResolvedValue([makeLoan({ id: 'L-904', outstanding: 200_000 })]);
    const user = userEvent.setup();
    await openRepaymentForm(user);
    await user.type(await screen.findByLabelText('Montant versé *'), '120000');
    await user.type(screen.getByLabelText(/Commentaire/), 'Remboursement test AGO');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/Remboursement test AGO/)).toBeInTheDocument();
    expect(createRepaymentTransactionSpy).toHaveBeenCalledWith('T-001', expect.objectContaining({ loanId: 'L-904', principalPart: 120_000, interestPart: 0 }));
  });

  it('adhérent sans dette active → « Aucune dette en cours » et enregistrement bloqué', async () => {
    vi.spyOn(creditService, 'listLoansByMember').mockResolvedValue([]);
    const user = userEvent.setup();
    await openRepaymentForm(user);

    expect(await screen.findByText('Aucune dette en cours pour cet adhérent.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Montant versé *')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(createRepaymentTransactionSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Aucune dette en cours pour cet adhérent.')).toBeInTheDocument();
  });

  it('« Montant versé » supérieur au montant dû → refusé', async () => {
    vi.spyOn(creditService, 'listLoansByMember').mockResolvedValue([makeLoan({ id: 'L-905', outstanding: 50_000 })]);
    const user = userEvent.setup();
    await openRepaymentForm(user);
    await user.type(await screen.findByLabelText('Montant versé *'), '90000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/ne peut pas dépasser le montant à rembourser/)).toBeInTheDocument();
    expect(createRepaymentTransactionSpy).not.toHaveBeenCalled();
  });
});
