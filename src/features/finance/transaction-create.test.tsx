import { describe, it, expect, beforeEach, afterEach, onTestFinished } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { applications } from '@/mocks/finance/applications';
import { guarantors } from '@/mocks/finance/guarantors';
import { auditEvents } from '@/mocks/audit/audit-events';
import { loanRules } from '@/mocks/finance/loan-rules';
import { workflowRequests } from '@/mocks/operations/workflow-requests';

/**
 * Mandat « CLASSIFICATION DES TRANSACTIONS » : le bouton « + Ajouter une
 * transaction » ouvre UN formulaire générique qui commence par « Catégorie »
 * (Épargner / Rembourser / Emprunter / Autres, mandat 2026-09-27) — aucune
 * « Sous-catégorie » à la création. Pour un PRÊT, le formulaire lit la politique de la caisse
 * (`LoanRule` liée à `cashbox_id`) et affiche garant / approbation seulement si
 * la politique l'impose. Tenant par défaut : T-001 « Coopérative Sutura »
 * (rôle admin). Politiques T-001 seedées : AC-012 (Transport) garant +
 * approbation requis ; AC-009 (Épargne volontaire) prêt autorisé sans garant.
 *
 * ISOLATION : `createTransaction` fait un `transactions.push(...)` sur le mock
 * module-level. Chaque test qui enregistre une transaction est donc
 * potentiellement visible des suivants. On restaure le tableau au seed exact
 * (contenu ET références profondes) avant/après chaque cas — aucun test ne
 * dépend plus de l'ordre : chacun repart du même état, seul ou en groupe.
 */
const TRANSACTIONS_SEED = structuredClone(transactions);
/**
 * Un PRÊT écrit aussi `loans` / `applications` / `guarantors` / `auditEvents`
 * (`creditService.createLoanTransaction`) : sans les restaurer, un prêt créé par
 * une tentative précédente (retry vitest) compte dans `maxActiveLoans` de
 * l'adhérent et fait refuser le suivant.
 */
const CREDIT_STORES = { loans, applications, guarantors, auditEvents };
const CREDIT_SEED = Object.fromEntries(Object.entries(CREDIT_STORES).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof CREDIT_STORES, unknown[]>;
function restoreTransactionsSeed() {
  transactions.splice(0, transactions.length, ...structuredClone(TRANSACTIONS_SEED));
  for (const [name, list] of Object.entries(CREDIT_STORES)) (list as unknown[]).splice(0, list.length, ...structuredClone(CREDIT_SEED[name as keyof typeof CREDIT_STORES]));
}
beforeEach(restoreTransactionsSeed);
afterEach(restoreTransactionsSeed);

function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

const SAVINGS_MARKER = 'Épargne test — journal central';
const LOAN_MARKER = 'Prêt test — politique Trésorerie';

/** Enregistre une transaction d'épargne conforme depuis le formulaire générique et attend la redirection vers sa fiche. Rend chaque cas autonome (aucune dépendance à un test précédent). */
async function submitSavings(user: ReturnType<typeof userEvent.setup>, marker: string) {
  renderFinance('/finance/transactions/create');
  await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-001"]')).not.toBeNull());
  await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-001');
  await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');
  await screen.findByRole('option', { name: 'Fatou Ndiaye' });
  await user.selectOptions(screen.getByLabelText(/Adhérent/), 'Fatou Ndiaye');
  await user.type(screen.getByLabelText('Montant *'), '25000');
  await user.type(screen.getByLabelText(/Commentaire/), marker);
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  // Fiche détail uniquement : le textarea Commentaire du formulaire porte aussi `marker` (valeur contrôlée) et résolvait
  // la recherche AVANT la redirection.
  await screen.findByText(marker, { ignore: 'script, style, textarea' });
}

describe('Finance → Transactions — saisie (journal central)', () => {
  it('l’onglet Transactions expose « Nouvelle transaction » et les colonnes du journal (dont « Caisse » et « Actions », jamais « Opération »)', async () => {
    renderFinance('/finance/transactions');
    await screen.findByTestId('transactions-context-header');
    const table = (await screen.findAllByRole('table')).find((item) => !item.getAttribute('aria-label')) as HTMLElement;
    expect(screen.getByRole('button', { name: /Nouvelle transaction/i })).toBeInTheDocument();
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Séance', 'Date transaction', 'Caisse', 'Adhérent', 'Actions', 'Débit', 'Report dette', 'Crédit', 'Commentaire']);
  });

  it('IMPORTANT : Action = exactement Épargner · Rembourser · Emprunter · Autres, AUCUN champ « Sous-catégorie » (mandat « Catégories de transactions », 2026-09-27)', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/create');
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-001"]')).not.toBeNull());
    const categorySelect = screen.getByLabelText(/^Action \*/);
    expect(within(categorySelect).getAllByRole('option').map((option) => option.textContent)).toEqual(['Sélectionner une action', 'Épargner', 'Rembourser', 'Emprunter', 'Autres']);
    for (const operation of ['EPARGNE', 'REMBOURSEMENT', 'PRET', 'AUTRES']) {
      await user.selectOptions(categorySelect, operation);
      expect(screen.queryByLabelText(/Sous-catégorie/)).not.toBeInTheDocument();
    }
  });

  it('« Autres » : enregistrée en AUTRES / AUTRE, type au choix (Débit accepté)', async () => {
    const user = userEvent.setup();
    const before = transactions.length;
    renderFinance('/finance/transactions/create');
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-003"]')).not.toBeNull());
    await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-003');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'AUTRES');
    expect(screen.getByLabelText(/^Type/)).toBeEnabled();
    await user.selectOptions(screen.getByLabelText(/^Type/), 'debit');
    await user.type(screen.getByLabelText('Montant *'), '5000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(transactions.length).toBe(before + 1));
    expect(transactions[before]).toMatchObject({ category: 'AUTRES', subcategory: 'AUTRE', type: 'debit', amount: 5_000 });
  });

  it('§ PRÊT : Catégorie = Prêt sur la caisse Transport affiche les conditions, la garantie ET l’approbation imposées par la politique', async () => {
    const user = userEvent.setup();
    // LR-001 est OFF dans les données DEMO : ce test porte sur une règle qui EXIGE un garant.
    { const rule = loanRules.find((item) => item.id === 'LR-001')!; const seeded = rule.requiresGuarantor; rule.requiresGuarantor = true; onTestFinished(() => { rule.requiresGuarantor = seeded; }); }
    renderFinance('/finance/transactions/create');
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-004"]')).not.toBeNull());
    await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-004');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'PRET');

    expect(await screen.findByText('Conditions du prêt')).toBeInTheDocument();
    expect(screen.getByText('Garantie')).toBeInTheDocument();
    expect(screen.getByText('Approbation')).toBeInTheDocument();
    // taux prérempli depuis la politique (LR-001 : 12 %)
    expect((screen.getByLabelText(/Taux d’intérêt/) as HTMLInputElement).value).toBe('12');
  });

  it('§ PRÊT : la règle unique du tenant n’exige ni garant ni approbation → pas de bloc Garantie ni Approbation', async () => {
    const user = userEvent.setup();
    // Règle de crédit UNIQUE du tenant (2026-09-26) : c'est elle, et non la caisse choisie, qui décide des garanties.
    const rule = loanRules.find((item) => item.id === 'LR-001')!;
    const saved = { ...rule };
    Object.assign(rule, { requiresGuarantor: false, minGuarantors: 0, requiresApproval: false, approvalLevel: null });
    try {
    renderFinance('/finance/transactions/create');
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-001"]')).not.toBeNull());
    await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-001');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'PRET');

    expect(await screen.findByText('Conditions du prêt')).toBeInTheDocument();
    expect(screen.queryByText('Garantie')).not.toBeInTheDocument();
    expect(screen.queryByText('Approbation')).not.toBeInTheDocument();
    } finally { Object.assign(rule, saved); }
  });

  it('§ PRÊT : un montant hors des bornes de la politique est refusé', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/create');
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-004"]')).not.toBeNull());
    await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-004');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'PRET');
    await screen.findByText('Conditions du prêt');
    const memberSelect = screen.getByLabelText(/Adhérent/);
    await waitFor(() => expect(within(memberSelect).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(memberSelect, 'M-001');
    await user.type(screen.getByLabelText('Montant *'), '10000'); // < minAmount 50 000
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/doit être compris entre/)).toBeInTheDocument();
  });

  it('§ PRÊT : approbation requise → le prêt conforme (garant) est SOUMIS au workflow — aucune transaction ni aucun prêt avant la décision', async () => {
    const user = userEvent.setup();
    // LR-001 est OFF dans les données DEMO : ce test porte sur une règle qui EXIGE un garant.
    { const rule = loanRules.find((item) => item.id === 'LR-001')!; const seeded = rule.requiresGuarantor; rule.requiresGuarantor = true; onTestFinished(() => { rule.requiresGuarantor = seeded; }); }
    const counts = { transactions: transactions.length, loans: loans.length, applications: applications.length, requests: workflowRequests.length };
    renderFinance('/finance/transactions/create');
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-004"]')).not.toBeNull());
    await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-004');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'PRET');
    await screen.findByText('Conditions du prêt');
    const memberSelect = screen.getByLabelText(/Adhérent/);
    await waitFor(() => expect(within(memberSelect).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(memberSelect, 'M-001');
    await user.type(screen.getByLabelText('Montant *'), '300000');
    await user.type(screen.getByLabelText(/Commentaire/), LOAN_MARKER);
    // garant imposé par la politique (minGuarantors 1)
    await user.selectOptions(screen.getByLabelText('Nom du garant'), 'Cheikh Diop');
    await user.type(screen.getByLabelText('Montant garanti'), '300000');
    // Approbation : plus de case à cocher, un avis de workflow (niveau Administrateur de LR-001).
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('tx-approval-workflow')).toHaveTextContent('Approbation requise (Approbation administrateur)');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(workflowRequests).toHaveLength(counts.requests + 1), { timeout: 5000 });
    const application = applications[counts.applications];
    expect(application).toMatchObject({ memberId: 'M-001', requestedAmount: 300_000, stage: 'stageSubmitted', description: LOAN_MARKER, pendingGuarantors: [expect.objectContaining({ guarantorName: 'Cheikh Diop', guaranteedAmount: 300_000 })] });
    expect(workflowRequests[counts.requests]).toMatchObject({ entityType: 'application', entityId: application.id, status: 'pending', requestedByUserId: 'U-001' });
    expect(transactions).toHaveLength(counts.transactions);
    expect(loans).toHaveLength(counts.loans);
  });

  it('§ ÉPARGNE : enregistre une transaction d’épargne et redirige vers sa fiche détail', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/create');
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-001"]')).not.toBeNull());
    await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-001');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');
    await screen.findByRole('option', { name: 'Fatou Ndiaye' });
    await user.selectOptions(screen.getByLabelText(/Adhérent/), 'Fatou Ndiaye');
    await user.type(screen.getByLabelText('Montant *'), '25000');
    await user.type(screen.getByLabelText(/Commentaire/), SAVINGS_MARKER);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(SAVINGS_MARKER)).toBeInTheDocument();
    expect(screen.getAllByText('Épargne').length).toBeGreaterThan(0);
  });

  it('une transaction enregistrée apparaît dans le journal consolidé', async () => {
    const user = userEvent.setup();
    const marker = `Épargne journal ${Date.now()}`;
    // Cas autonome : on crée la transaction ici même (helper partagé), puis on
    // vérifie qu'elle est bien listée dans le journal — sans dépendre d'un test
    // précédent ni de l'ordre d'exécution.
    await submitSavings(user, marker);
    renderFinance('/finance/transactions');
    // La transaction porte la séance courante du contexte (FS-001) : elle figure dans le journal de cette séance.
    expect((await screen.findAllByText(marker)).length).toBeGreaterThan(0);
  });
});
