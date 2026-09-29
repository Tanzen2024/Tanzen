import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { repayments } from '@/mocks/finance/repayments';
import { guarantors } from '@/mocks/finance/guarantors';
import { auditEvents } from '@/mocks/audit/audit-events';
import { transactionBatchService } from '@/services/transaction-batch.service';
import { creditService } from '@/services/credit.service';
import { currentUser } from '@/mocks/rbac.mocks';
import { loanRules } from '@/mocks/finance/loan-rules';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { loanDebtAt } from '@/lib/finance';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';
import { fiscalSessionService } from '@/services/fiscal-session.service';

/** Dette courante d'un prêt du seed aujourd'hui (règles de référence du 2026-09-28 : elle évolue avec les échéances). */
const debtToday = (loanId: string) => loanDebtAt(loans.find((loan) => loan.id === loanId)!, repayments.filter((repayment) => repayment.loanId === loanId), new Date().toISOString().slice(0, 10));
/** Montant FCFA tel qu'affiché (séparateur de milliers = espace quelconque). */
const moneyPattern = (amount: number) => new RegExp(`${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '\\s')}\\sFCFA`);

/**
 * SAISIE RAPIDE (mandat 2026-09-25) — nouvelle interface de saisie en lot, qui
 * réutilise EXACTEMENT les validations et services de la saisie détaillée.
 * RÈGLE DE CRÉDIT UNIQUE PAR TENANT (2026-09-26) : T-001 a une seule règle (LR-001),
 * qui exige garants + approbation, quelle que soit la caisse de décaissement.
 * Les cas « règle sans garant » reconfigurent CETTE règle (`useRuleWithoutGuarantor`,
 * paramètres de l'ancienne règle AC-009 : 20 000 → 1 000 000, 3 prêts actifs max,
 * ni garant ni approbation) ; Fatou Ndiaye (M-001) doit sur L-001 sa DETTE COURANTE (`debtToday('L-001')`).
 */
const stores = { transactions, loans, applications, repayments, guarantors, auditEvents, loanRules, loanFundingAllocations, workflowRequests, fiscalSessions } as const;
const tenantRule = () => loanRules.find((rule) => rule.id === 'LR-001')!;
function useRuleWithoutGuarantor() {
  Object.assign(tenantRule(), { loanMode: 'SIMPLE', minAmount: 20_000, maxAmount: 1_000_000, interestRate: 9, durationMonths: 12, maxActiveLoans: 3, maxLoanExposure: 2_000_000, requiresGuarantor: false, minGuarantors: 0, maxGuarantors: 2, allowSelfGuarantee: true, requiresApproval: false, approvalLevel: null });
}
let snapshot: Record<keyof typeof stores, unknown[]>;
beforeEach(() => { snapshot = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as typeof snapshot; });
afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(snapshot[name as keyof typeof stores]));
});

function renderFinance(route: string) {
  return renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route });
}
type User = ReturnType<typeof userEvent.setup>;
const rows = () => screen.getAllByTestId('quick-entry-row');
async function pickMember(user: User, row: HTMLElement, query: string) {
  await user.click(within(row).getByRole('combobox'));
  await user.type(await screen.findByPlaceholderText(/Rechercher \(nom ou matricule\)/), query);
  await user.click(await screen.findByRole('option', { name: new RegExp(query) }));
}
async function fillRow(user: User, index: number, query: string, amount: string, comment = '') {
  if (rows().length <= index) await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
  const row = rows()[index];
  await pickMember(user, row, query);
  await user.type(within(row).getByLabelText(`Montant de la ligne ${index + 1}`), amount);
  if (comment) await user.type(within(row).getByLabelText(`Commentaire de la ligne ${index + 1}`), comment);
}
async function openQuickEntry(user: User, cashboxId = 'AC-012') {
  renderFinance(`/finance/transactions/quick-entry?cashboxId=${cashboxId}`);
  await screen.findByRole('heading', { name: 'Transactions' });
  await waitFor(() => expect((screen.getByLabelText(/^Caisse/) as HTMLSelectElement).value).not.toBe(''));
  void user;
}
const saveButton = () => screen.getByRole('button', { name: /^(Enregistrer \d+ (transactions?|prêts?)|Soumettre \d+ prêts? à approbation)$/ });

/**
 * Mandat « Évolution globale du module Finance » §17/§20/§21 : le SEUL point d'entrée
 * est Finance → Caisses → onglet Transactions → « + Nouvelle transaction » (la fiche
 * caisse n'en propose plus). La caisse est choisie dans le formulaire ; la séance est
 * héritée du contexte Finance, en lecture seule, distincte de la date/heure réelle.
 */
describe('Saisie rapide — parcours depuis l’onglet Transactions', { timeout: 20_000 }, () => {
  it('« Nouvelle transaction » ouvre directement la saisie rapide : caisse à choisir, séance héritée (lecture seule), date/heure système', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    await user.click(screen.getByRole('button', { name: /Nouvelle transaction/ }));

    expect(await screen.findByRole('heading', { name: 'Transactions' })).toBeInTheDocument();
    expect(screen.queryByText('Saisie détaillée')).not.toBeInTheDocument();
    const cashbox = screen.getByLabelText(/^Caisse/) as HTMLSelectElement;
    expect(cashbox.value).toBe('');
    expect(cashbox).not.toBeDisabled();
    for (const label of [/^Action \*/, /^Type/]) expect(screen.getByLabelText(label)).toBeInTheDocument();
    // Mandat « Actions » (2026-09-27) : « Opération » → « Catégorie » → « Action » ; « Catégorie » n'est plus affiché dans la saisie rapide.
    expect(screen.getByText('Action', { selector: 'label', exact: false })).toHaveTextContent(/^Action \*$/);
    expect(screen.getByRole('option', { name: 'Sélectionner une action' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Catégorie/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sélectionner une catégorie/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Opération/)).not.toBeInTheDocument();
    const session = screen.getByLabelText('Date de séance') as HTMLInputElement;
    expect(session.value).toBe('14/07/2026');
    expect(session).toBeDisabled();
    // Horodatage technique (`recordedAt`) posé par le service à l'insertion : aucun champ affiché.
    expect(screen.queryByLabelText('Date et heure de la transaction')).not.toBeInTheDocument();
    expect(rows()).toHaveLength(1);
    expect(saveButton()).toHaveTextContent('Enregistrer 0 transactions');
    expect(saveButton()).toBeDisabled();
  });

  it('« Retour aux transactions » ramène à l’onglet Transactions', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=transactions');
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    await user.click(screen.getByRole('button', { name: /Nouvelle transaction/ }));
    await screen.findByRole('heading', { name: 'Transactions' });
    await user.click(screen.getByRole('button', { name: /Retour aux transactions/ }));
    expect(await screen.findByRole('tab', { name: 'Transactions', selected: true })).toBeInTheDocument();
  });

  it('séance « Toutes les séances » (choisie puis accès direct à l’URL) : bandeau « Séance requise » et enregistrement impossible', async () => {
    const user = userEvent.setup();
    // Le module Finance reste monté pendant la navigation : le choix explicite « Toutes les séances » est conservé.
    renderWithProviders(<Routes><Route path="/finance/*" element={<><FinanceModule /><Link to="/finance/transactions/quick-entry">go-quick-entry</Link></>} /></Routes>, { route: '/finance/cashboxes?tab=transactions' });
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLSelectElement).value).toBe('FS-001'));
    await user.selectOptions(screen.getByLabelText('Date de séance'), 'all');
    await user.click(screen.getByRole('link', { name: 'go-quick-entry' }));
    await screen.findByRole('heading', { name: 'Transactions' });
    await waitFor(() => expect(screen.getByTestId('session-required')).toHaveTextContent('Séance requise'));
    expect(saveButton()).toBeDisabled();
  });
});

describe('Saisie rapide — lignes, validation, total', { timeout: 20_000 }, () => {
  it('ajout (focus sur l’adhérent de la nouvelle ligne), suppression, recherche d’adhérent, total et compteur', async () => {
    const user = userEvent.setup();
    await openQuickEntry(user);
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');

    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    expect(rows()).toHaveLength(2);
    await waitFor(() => expect(within(rows()[1]).getByRole('combobox')).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Retirer la ligne 2' }));
    expect(rows()).toHaveLength(1);

    await fillRow(user, 0, 'Fatou', '50000');
    await fillRow(user, 1, 'Cheikh', '25000');
    await fillRow(user, 2, 'Modou', '30000');
    await fillRow(user, 3, 'Coumba', '50000');
    expect(within(rows()[0]).getByRole('combobox')).toHaveTextContent('Fatou Ndiaye');
    expect(screen.getByTestId('quick-entry-summary')).toHaveTextContent(/Total : 155\s000\sFCFA/);
    expect(saveButton()).toHaveTextContent('Enregistrer 4 transactions');
    expect(saveButton()).toBeEnabled();
  });

  it('une ligne invalide est signalée et bloque l’enregistrement (montant vide, négatif)', async () => {
    const user = userEvent.setup();
    await openQuickEntry(user);
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');
    await fillRow(user, 0, 'Fatou', '50000');
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    await pickMember(user, rows()[1], 'Cheikh');

    expect(await screen.findByText('Ligne 2 — Le montant doit être un nombre strictement positif.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    await user.type(within(rows()[1]).getByLabelText('Montant de la ligne 2'), '-10000');
    expect(screen.getByText('Ligne 2 — Le montant doit être un nombre strictement positif.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    // Le total n'additionne que les lignes valides.
    expect(screen.getByTestId('quick-entry-summary')).toHaveTextContent(/Total : 50\s000\sFCFA/);

    await user.clear(within(rows()[1]).getByLabelText('Montant de la ligne 2'));
    await user.type(within(rows()[1]).getByLabelText('Montant de la ligne 2'), '25000');
    expect(screen.queryByTestId('quick-entry-row-error')).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('AUTRES : aucune sous-catégorie à choisir, l’enregistrement est possible directement', async () => {
    const user = userEvent.setup();
    await openQuickEntry(user);
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'AUTRES');
    await fillRow(user, 0, 'Fatou', '5000');
    expect(screen.queryByLabelText(/Sous-catégorie/)).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });
});

describe('Saisie rapide — enregistrement par le métier existant', { timeout: 20_000 }, () => {
  it('ÉPARGNE / Crédit : 4 transactions créées (séance, exercice, caisse, adhérent) puis retour à la fiche caisse', async () => {
    const user = userEvent.setup();
    const before = transactions.length;
    await openQuickEntry(user);
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');
    // Séance = celle du contexte Finance (dernière séance de l'exercice : FS-001), jamais choisie ici.
    const sessionId = 'FS-001';
    await waitFor(() => expect((screen.getByLabelText('Date de séance') as HTMLInputElement).value).toBe('14/07/2026'));
    const marker = `lot ${Date.now()}`;
    await fillRow(user, 0, 'Fatou', '50000', `${marker} A`);
    await fillRow(user, 1, 'Cheikh', '25000', `${marker} B`);
    await fillRow(user, 2, 'Modou', '30000', `${marker} C`);
    await fillRow(user, 3, 'Coumba', '50000', `${marker} D`);
    await user.click(saveButton());

    expect(await screen.findByRole('heading', { name: 'Transport' })).toBeInTheDocument();
    const created = transactions.slice(before);
    expect(created.map((tx) => [tx.memberId, tx.amount])).toEqual([['M-001', 50_000], ['M-006', 25_000], ['M-016', 30_000], ['M-018', 50_000]]);
    for (const tx of created) {
      expect(tx).toMatchObject({ tenantId: 'T-001', category: 'EPARGNE', type: 'credit', destination: 'CS-001-CX-004', sessionId, fiscalYearId: 'FY-T001-2026', status: 'completed' });
      expect(tx.recordedAt).toBeTruthy();
    }
    const table = await screen.findByRole('table');
    expect(await within(table).findByText(`${marker} A`)).toBeInTheDocument();
    expect(within(table).getByText(`${marker} D`)).toBeInTheDocument();
  });

  it('PRÊT / Débit (politique sans garant) : un vrai Loan par ligne via createLoanTransaction, avec intérêts', async () => {
    const user = userEvent.setup();
    const loanCount = loans.length;
    const before = transactions.length;
    useRuleWithoutGuarantor();
    await openQuickEntry(user, 'AC-009');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'PRET');
    // Un prêt est toujours un DÉCAISSEMENT : Type affiché DÉBIT et verrouillé ; aucune caisse à choisir — Épargne est la « Caisse prioritaire » (mandat du 2026-09-27).
    expect(screen.getByLabelText(/^Type/)).toHaveValue('debit');
    expect(screen.getByLabelText(/^Type/)).toBeDisabled();
    expect(screen.getByLabelText(/^Caisse prioritaire/)).toHaveValue('Épargne');
    expect(screen.getByTestId('quick-entry-movement-note')).toHaveTextContent('Financement prioritaire par « Épargne »');
    await fillRow(user, 0, 'Modou', '100000');
    await fillRow(user, 1, 'Coumba', '50000');
    // Hors politique (20 000 → 1 000 000) : refusé comme en saisie détaillée.
    await fillRow(user, 2, 'Cheikh', '5000');
    expect(await screen.findByText(/^Ligne 3 — /)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retirer la ligne 3' }));
    await user.click(saveButton());

    await screen.findByRole('heading', { name: 'Épargne' });
    const newLoans = loans.slice(loanCount);
    expect(newLoans.map((loan) => [loan.memberId, loan.principal])).toEqual([['M-016', 100_000], ['M-018', 50_000]]);
    for (const loan of newLoans) expect(loan.totalRepayable).toBeGreaterThanOrEqual(loan.principal);
    const created = transactions.slice(before);
    expect(created.map((tx) => [tx.category, tx.subcategory, tx.type, tx.loanId])).toEqual([['AUTRES', 'PRET', 'debit', newLoans[0].id], ['AUTRES', 'PRET', 'debit', newLoans[1].id]]);
    // Caisse ← Transaction → Prêt : la caisse de décaissement est portée par la transaction, jamais par le prêt.
    for (const tx of created) expect(tx.source).toBe('CS-001-CX-001'); // Épargne (AC-009, SAVINGS) dispose des fonds : elle finance seule
    for (const loan of newLoans) expect(loan).not.toHaveProperty('cashboxId');
  });

  it('REMBOURSEMENT : dette résolue par adhérent, plafond cumulé sur le lot, puis Repayment réel sur le prêt', async () => {
    const user = userEvent.setup();
    const loan = loans.find((item) => item.id === 'L-001')!;
    const paidBefore = loan.paidAmount;
    const repaymentCount = repayments.length;
    // Le remboursement est daté de la séance courante ; FS-001 (14/07) précède le décaissement de L-001 (22/07) :
    // à cette date la dette vaut 0 (règles de référence). On ouvre donc une séance datée d'aujourd'hui.
    await fiscalSessionService.createSession('T-001', 'FY-T001-2026', new Date().toISOString().slice(0, 10));
    await openQuickEntry(user);
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'REMBOURSEMENT');
    expect(screen.getByLabelText(/^Type/)).toHaveValue('credit'); // toujours un crédit, non modifiable
    expect(screen.getByLabelText(/^Type/)).toBeDisabled();
    // Montant à rembourser = dette courante (capital + intérêts générés − remboursements), jamais l'encours contractuel.
    const debt = debtToday('L-001');
    await fillRow(user, 0, 'Fatou', '300000');
    expect(rows()[0]).toHaveTextContent(moneyPattern(debt));
    await fillRow(user, 1, 'Fatou', String(debt - 300_000 + 1));
    // 2e ligne > reste dû après la 1re : refusée.
    expect(await screen.findByText('Ligne 2 — Le montant versé ne peut pas dépasser le montant à rembourser.')).toBeInTheDocument();
    expect(rows()[1]).toHaveTextContent(moneyPattern(debt - 300_000));
    expect(saveButton()).toBeDisabled();
    await user.clear(within(rows()[1]).getByLabelText('Montant de la ligne 2'));
    await user.type(within(rows()[1]).getByLabelText('Montant de la ligne 2'), '200000');
    await user.click(saveButton());

    await screen.findByRole('heading', { name: 'Transport' });
    expect(loan.paidAmount).toBe(paidBefore + 500_000);
    const newRepayments = repayments.slice(repaymentCount);
    expect(newRepayments.map((repayment) => [repayment.loanId, repayment.amount])).toEqual([['L-001', 300_000], ['L-001', 200_000]]);
    // Chaque remboursement référence SA transaction d'encaissement : AUTRES / REMBOURSEMENT, CRÉDIT, caisse d'encaissement, prêt.
    for (const repayment of newRepayments) {
      expect(repayment).not.toHaveProperty('cashboxId');
      const tx = transactions.find((item) => item.id === repayment.transactionId);
      expect(tx).toMatchObject({ category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', destination: 'CS-001-CX-004', loanId: 'L-001', repaymentId: repayment.id });
    }
  });

  it('adhérent obligatoire pour un remboursement : une ligne sans adhérent est refusée', async () => {
    const user = userEvent.setup();
    await openQuickEntry(user);
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'REMBOURSEMENT');
    await user.type(within(rows()[0]).getByLabelText('Montant de la ligne 1'), '1000');
    expect(await screen.findByText('Ligne 1 — Ce champ est obligatoire.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('échec du lot : message clair, rien n’est affiché comme enregistré, les lignes restent pour correction', async () => {
    const user = userEvent.setup();
    vi.spyOn(transactionBatchService, 'createTransactionsBatch').mockResolvedValue({ ok: false, failedIndex: 1 });
    await openQuickEntry(user);
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');
    await fillRow(user, 0, 'Fatou', '50000');
    await fillRow(user, 1, 'Cheikh', '25000');
    await user.click(saveButton());

    await waitFor(() => expect(transactionBatchService.createTransactionsBatch).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Transactions' })).toBeInTheDocument();
    expect(rows()).toHaveLength(2);
    expect(within(rows()[1]).getByLabelText('Montant de la ligne 2')).toHaveValue('25 000'); // format de l'association (FCFA)
    expect(rows()[1].className).toMatch(/bg-rose-50/);
  });
});

describe('transactionBatchService — tout ou rien', () => {
  const epargne = (amount: number, cashboxNumber = 'CS-001-CX-004') => ({ kind: 'transaction' as const, input: { cashboxNumber, memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'EPARGNE' as const, subcategory: null, type: 'credit' as const, amount, description: 'lot' } });

  it('toutes les lignes valides → toutes enregistrées, dans l’ordre', async () => {
    const before = transactions.length;
    const result = await transactionBatchService.createTransactionsBatch('T-001', [epargne(1_000), epargne(2_000)]);
    expect(result.ok).toBe(true);
    expect(transactions.slice(before).map((tx) => tx.amount)).toEqual([1_000, 2_000]);
  });

  it('horodatage technique posé par le service à chaque insertion — jamais fourni par le payload', async () => {
    const before = transactions.length;
    const lines = [epargne(1_000), epargne(2_000)];
    for (const line of lines) expect(line.input).not.toHaveProperty('date');
    const start = Date.now();
    expect((await transactionBatchService.createTransactionsBatch('T-001', lines)).ok).toBe(true);
    for (const tx of transactions.slice(before)) {
      const at = Date.parse(tx.recordedAt ?? '');
      expect(at).toBeGreaterThanOrEqual(start);
      expect(at).toBeLessThanOrEqual(Date.now());
    }
  });

  it('une ligne refusée (caisse d’un autre tenant) → AUCUNE transaction enregistrée, index fautif retourné', async () => {
    const before = transactions.length;
    const result = await transactionBatchService.createTransactionsBatch('T-001', [epargne(1_000), epargne(2_000, 'TH-002-TRÉS'), epargne(3_000)]);
    expect(result).toEqual({ ok: false, failedIndex: 1 });
    expect(transactions.length).toBe(before);
  });

  it('rollback complet d’un remboursement déjà appliqué quand une ligne suivante échoue (prêt, Repayment, transaction)', async () => {
    const loan = loans.find((item) => item.id === 'L-001')!;
    const loanBefore = structuredClone(loan);
    const counts = { transactions: transactions.length, repayments: repayments.length };
    const input = { cashboxNumber: 'CS-001-CX-004', memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'AUTRES' as const, subcategory: 'REMBOURSEMENT' as const, type: 'credit' as const, amount: 100_000, description: '' };
    const result = await transactionBatchService.createTransactionsBatch('T-001', [
      { kind: 'repayment', input: { loanId: 'L-001', paymentDate: '2026-09-01', principalPart: 100_000, interestPart: 0, transactionInput: input } },
      epargne(0),
    ]);
    expect(result).toEqual({ ok: false, failedIndex: 1 });
    expect(loan).toEqual(loanBefore);
    expect(transactions.length).toBe(counts.transactions);
    expect(repayments.length).toBe(counts.repayments);
  });

  it('lot vide → refusé, rien écrit', async () => {
    expect(await transactionBatchService.createTransactionsBatch('T-001', [])).toEqual({ ok: false, failedIndex: -1 });
  });
});

/**
 * PRÊTS en saisie rapide (mandat « Règles de crédit = source de vérité », 2026-09-25) :
 * la règle de la caisse fixe toutes les conditions ; garants et approbation se
 * renseignent PAR PRÊT ; chaque ligne passe par `creditService.createLoanTransaction`.
 * LR-001 (Trésorerie) : 50 000 → 2 000 000, 2 prêts actifs, exposition 3 000 000,
 * 1 à 2 garants couvrant 100 %, auto-caution interdite, approbation Administrateur.
 */
describe('Saisie rapide — prêts pilotés par la règle de crédit', { timeout: 30_000 }, () => {
  async function openLoans(user: User, cashboxId: string) {
    await openQuickEntry(user, cashboxId);
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'PRET');
  }
  async function setGuarantors(user: User, line: number, guarantors: [string, string][]) {
    await user.click(screen.getByRole('button', { name: `Garants de la ligne ${line}` }));
    const dialog = await screen.findByRole('dialog');
    for (const [index, [name, amount]] of guarantors.entries()) {
      if (!within(dialog).queryByLabelText(`Nom du garant ${index + 1}`)) await user.click(within(dialog).getByRole('button', { name: 'Ajouter un garant' }));
      await user.selectOptions(within(dialog).getByLabelText(`Nom du garant ${index + 1}`), name);
      await user.clear(within(dialog).getByLabelText(`Montant garanti ${index + 1}`));
      await user.type(within(dialog).getByLabelText(`Montant garanti ${index + 1}`), amount);
    }
    return dialog;
  }

  it('règle trouvée : affichée en lecture seule (taux, durée, plafonds, garanties, approbation), rien à ressaisir', async () => {
    const user = userEvent.setup();
    tenantRule().requiresGuarantor = true; // LR-001 est OFF dans les données DEMO : ce test porte sur une règle qui EXIGE un garant.
    await openLoans(user, 'AC-012');
    const panel = await screen.findByTestId('quick-entry-loan-rule');
    expect(panel).toHaveTextContent('Politique Trésorerie Sutura');
    expect(panel).toHaveTextContent(/50\s000\sFCFA → 2\s000\s000\sFCFA/);
    expect(panel).toHaveTextContent('12 % · Composé · Mensuel');
    expect(panel).toHaveTextContent('24 mois');
    expect(panel).toHaveTextContent(/3\s000\s000\sFCFA/);
    expect(panel).toHaveTextContent('1 à 2 garant(s) · couverture 100 % · Personnelle');
    expect(panel).toHaveTextContent('Requise (Administrateur)');
    expect(screen.queryByLabelText(/Taux d’intérêt/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Durée/)).not.toBeInTheDocument();
  });

  it('aucune règle configurée pour le tenant : message clair, « Configurer une règle de crédit », enregistrement impossible', async () => {
    const user = userEvent.setup();
    tenantRule().deletedAt = '2026-09-26T00:00:00.000Z'; // tenant sans règle vivante
    await openLoans(user, 'AC-011');
    expect(await screen.findByTestId('quick-entry-loan-rule-issue')).toHaveTextContent('Aucune règle de crédit n’est configurée pour l’organisation.');
    expect(screen.getByRole('button', { name: 'Configurer une règle de crédit' })).toBeInTheDocument();
    await fillRow(user, 0, 'Modou', '100000');
    expect(saveButton()).toBeDisabled();
  });

  it('prêts non autorisés par la règle du tenant (allowLoans = false) : refus explicite, quelle que soit la caisse', async () => {
    const user = userEvent.setup();
    tenantRule().allowLoans = false;
    await openLoans(user, 'AC-009');
    expect(await screen.findByTestId('quick-entry-loan-rule-issue')).toHaveTextContent('Les prêts ne sont pas autorisés par la règle de crédit de l’organisation.');
    expect(screen.queryByRole('button', { name: 'Configurer une règle de crédit' })).not.toBeInTheDocument();
    await fillRow(user, 0, 'Modou', '100000');
    expect(saveButton()).toBeDisabled();
  });

  it('garants requis + approbation : état précis par ligne (garant requis → garantie insuffisante → conforme), couverture affichée, puis SOUMISSION au workflow d’approbation', async () => {
    const user = userEvent.setup();
    tenantRule().requiresGuarantor = true; // LR-001 est OFF dans les données DEMO : ce test porte sur une règle qui EXIGE un garant.
    const counts = { loans: loans.length, guarantors: guarantors.length, applications: applications.length, transactions: transactions.length, requests: workflowRequests.length };
    await openLoans(user, 'AC-012');
    await screen.findByTestId('quick-entry-loan-rule');
    // Approbation requise (LR-001, niveau Administrateur) : workflow annoncé, jamais d'approbateur « connecté » ni de case à cocher.
    expect(screen.getByTestId('quick-entry-approval-workflow')).toHaveTextContent('Approbation requise : chaque prêt est soumis au workflow « Approbation administrateur »');
    expect(screen.queryByTestId('quick-entry-approver')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Approuvé par')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Garants' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Garantie' })).not.toBeInTheDocument();

    await fillRow(user, 0, 'Modou', '400000');
    const status = () => within(rows()[0]).getByTestId('quick-entry-row-status');
    const coverage = () => within(rows()[0]).getByTestId('quick-entry-row-coverage');
    expect(status()).toHaveTextContent('Garant requis');
    expect(coverage()).toHaveTextContent(/0\sFCFA \/ 400\s000\sFCFA/);
    expect(coverage()).toHaveTextContent(/manque 400\s000\sFCFA/);
    expect(within(rows()[0]).getByRole('button', { name: 'Garants de la ligne 1' })).toHaveTextContent('0 / 2 garants');
    expect(await screen.findByText('Ligne 1 — Renseignez au moins 1 garant(s) complet(s) (nom + montant).')).toBeInTheDocument();
    expect(saveButton()).toHaveTextContent('Soumettre 1 prêt à approbation');
    expect(saveButton()).toBeDisabled();

    // Auto-caution interdite : l'emprunteur n'est pas proposé comme garant.
    const dialog = await setGuarantors(user, 1, [['Fatou Ndiaye', '300000']]);
    expect(within(within(dialog).getByLabelText('Nom du garant 1')).queryByRole('option', { name: 'Modou Faye' })).not.toBeInTheDocument();
    // Couverture 100 % : 300 000 < 400 000 → il manque 100 000.
    const summary = within(dialog).getByTestId('quick-entry-coverage');
    expect(summary).toHaveTextContent(/Montant du prêt\s*400\s000\sFCFA/);
    expect(summary).toHaveTextContent(/Couverture requise \(100 %\)\s*400\s000\sFCFA/);
    expect(summary).toHaveTextContent(/Couverture totale\s*300\s000\sFCFA/);
    expect(summary).toHaveTextContent(/Garantie insuffisante : il manque 100\s000\sFCFA\./);
    expect(status()).toHaveTextContent('Garantie insuffisante');
    await user.clear(within(dialog).getByLabelText('Montant garanti 1'));
    await user.type(within(dialog).getByLabelText('Montant garanti 1'), '400000');
    expect(summary).toHaveTextContent('Couverture suffisante.');
    await user.click(within(dialog).getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(rows()[0]).getByRole('button', { name: 'Garants de la ligne 1' })).toHaveTextContent('1 / 2 garants');
    expect(coverage()).toHaveTextContent(/400\s000\sFCFA \/ 400\s000\sFCFA/);
    expect(coverage()).not.toHaveTextContent('manque');

    // Plus d'attestation « Approbation obtenue » : la ligne conforme est SOUMISE au workflow.
    expect(screen.queryByRole('checkbox', { name: /Approbation obtenue/ })).not.toBeInTheDocument();
    expect(status()).toHaveTextContent('Conforme');
    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());

    await screen.findByRole('heading', { name: 'Transport' });
    // Aucun prêt ni décaissement avant la décision de l'approbateur.
    expect(loans).toHaveLength(counts.loans);
    expect(transactions).toHaveLength(counts.transactions);
    expect(guarantors).toHaveLength(counts.guarantors);
    const application = applications[counts.applications];
    expect(applications).toHaveLength(counts.applications + 1);
    expect(application).toMatchObject({ memberId: 'M-016', cashboxId: 'AC-009', requestedAmount: 400_000, stage: 'stageSubmitted', pendingGuarantors: [expect.objectContaining({ guarantorName: 'Fatou Ndiaye', guaranteedAmount: 400_000 })] });
    const request = workflowRequests[counts.requests];
    expect(workflowRequests).toHaveLength(counts.requests + 1);
    expect(request).toMatchObject({ domain: 'credit', entityType: 'application', entityId: application.id, status: 'pending', requestedByUserId: 'U-001', amount: 400_000 });
    expect(request.steps.map((step) => [step.name, step.approverPermission, step.status])).toEqual([['Approbation administrateur', 'loans.approve.admin', 'pending']]);
  });

  it('plusieurs garants : la couverture additionne les garants complets, le maximum de la règle (2) borne l’ajout', async () => {
    const user = userEvent.setup();
    tenantRule().requiresGuarantor = true; // LR-001 est OFF dans les données DEMO : ce test porte sur une règle qui EXIGE un garant.
    await openLoans(user, 'AC-012');
    await screen.findByTestId('quick-entry-loan-rule');
    await fillRow(user, 0, 'Modou', '150000');
    const dialog = await setGuarantors(user, 1, [['Fatou Ndiaye', '100000'], ['Cheikh Diop', '30000']]);
    const summary = within(dialog).getByTestId('quick-entry-coverage');
    expect(summary).toHaveTextContent(/Couverture totale\s*130\s000\sFCFA/);
    expect(summary).toHaveTextContent(/il manque 20\s000\sFCFA/);
    // 2 garants = maximum de LR-001 : plus de bouton d'ajout.
    expect(within(dialog).queryByRole('button', { name: 'Ajouter un garant' })).not.toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Montant garanti 2'));
    await user.type(within(dialog).getByLabelText('Montant garanti 2'), '50000');
    expect(summary).toHaveTextContent('Couverture suffisante.');
    await user.click(within(dialog).getByRole('button', { name: 'Valider' }));
    expect(within(rows()[0]).getByRole('button', { name: 'Garants de la ligne 1' })).toHaveTextContent('2 / 2 garants');
    // L'approbation relève du workflow : la ligne est conforme, elle sera soumise.
    expect(within(rows()[0]).getByTestId('quick-entry-row-status')).toHaveTextContent('Conforme');
  });

  it('règle sans garant requis : ni colonne Garants/Couverture ni approbation, ligne conforme directement', async () => {
    const user = userEvent.setup();
    useRuleWithoutGuarantor();
    await openLoans(user, 'AC-009');
    await screen.findByTestId('quick-entry-loan-rule');
    expect(screen.queryByRole('columnheader', { name: 'Garants' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Couverture' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-entry-approver')).not.toBeInTheDocument();
    await fillRow(user, 0, 'Modou', '100000');
    expect(within(rows()[0]).getByTestId('quick-entry-row-status')).toHaveTextContent('Conforme');
    // Plafond de la règle : 1 000 000.
    await fillRow(user, 1, 'Coumba', '1500000');
    expect(within(rows()[1]).getByTestId('quick-entry-row-status')).toHaveTextContent('Montant supérieur au plafond');
  });

  it('approbation : aucune case « Approbation obtenue », et SAISIR un prêt n’exige aucune permission d’approbation (la décision appartient à l’approbateur du workflow)', async () => {
    const user = userEvent.setup();
    const saved = [...currentUser.permissions];
    currentUser.permissions.splice(0, currentUser.permissions.length, ...saved.filter((permission) => !permission.startsWith('loans.approve')));
    try {
      await openLoans(user, 'AC-012');
      await screen.findByTestId('quick-entry-approval-workflow');
      await fillRow(user, 0, 'Modou', '100000');
      expect(screen.queryByRole('checkbox', { name: /Approbation obtenue/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Vous n’avez pas la permission d’approuver des prêts/)).not.toBeInTheDocument();
      expect(saveButton()).toHaveTextContent('Soumettre 1 prêt à approbation');
    } finally {
      currentUser.permissions.splice(0, currentUser.permissions.length, ...saved);
    }
  });

  it('lignes vides ignorées ; résumé saisies / valides / à corriger / vides ; total et nombre de prêts = lignes valides', async () => {
    const user = userEvent.setup();
    useRuleWithoutGuarantor();
    await openLoans(user, 'AC-009');
    await screen.findByTestId('quick-entry-loan-rule');
    await fillRow(user, 0, 'Modou', '150000');
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' })); // ligne 2 laissée vide
    const summary = () => screen.getByTestId('quick-entry-summary');
    expect(summary()).toHaveTextContent('1 ligne saisie');
    expect(summary()).toHaveTextContent('1 ligne valide');
    expect(summary()).toHaveTextContent('1 ligne vide ignorée');
    expect(summary()).not.toHaveTextContent('à corriger');
    expect(summary()).toHaveTextContent(/Total : 150\s000\sFCFA/);
    expect(within(rows()[1]).getByTestId('quick-entry-row-status')).toHaveTextContent('—');
    expect(screen.queryByText(/^Ligne 2 — /)).not.toBeInTheDocument();
    expect(saveButton()).toHaveTextContent('Enregistrer 1 prêt');
    expect(saveButton()).toBeEnabled();

    // Une ligne SAISIE invalide bloque l'enregistrement.
    await pickMember(user, rows()[1], 'Coumba');
    expect(summary()).toHaveTextContent('2 lignes saisies');
    expect(summary()).toHaveTextContent('1 ligne à corriger');
    expect(summary()).toHaveTextContent(/Total : 150\s000\sFCFA/);
    expect(saveButton()).toHaveTextContent('Enregistrer 2 prêts');
    expect(saveButton()).toBeDisabled();
    await user.type(within(rows()[1]).getByLabelText('Montant de la ligne 2'), '50000');
    expect(summary()).toHaveTextContent('2 lignes valides');
    expect(summary()).toHaveTextContent(/Total : 200\s000\sFCFA/);
    expect(saveButton()).toBeEnabled();
  });

  it('exposition maximum : un prêt qui porterait l’encours au-delà du plafond est refusé sur sa ligne', async () => {
    const user = userEvent.setup();
    await openLoans(user, 'AC-012');
    await screen.findByTestId('quick-entry-loan-rule');
    // Cheikh Diop (M-006) doit sa dette courante sur L-004 ; plafond fixé à dette + 1 000 000 (indépendant de la date du jour).
    tenantRule().maxLoanExposure = debtToday('L-004') + 1_000_000;
    await fillRow(user, 0, 'Cheikh', '1100000');
    expect(await screen.findByText(/^Ligne 1 — Exposition maximale dépassée/)).toBeInTheDocument();
    await user.clear(within(rows()[0]).getByLabelText('Montant de la ligne 1'));
    await user.type(within(rows()[0]).getByLabelText('Montant de la ligne 1'), '900000');
    expect(screen.queryByText(/Exposition maximale dépassée/)).not.toBeInTheDocument();
  });

  it('prêts actifs maximum cumulés sur le lot (règle : 3 max) — la 4e ligne du même adhérent est refusée', async () => {
    const user = userEvent.setup();
    useRuleWithoutGuarantor();
    await openLoans(user, 'AC-009');
    await screen.findByTestId('quick-entry-loan-rule');
    for (let index = 0; index < 4; index += 1) await fillRow(user, index, 'Modou', '20000');
    expect(await screen.findByText(/^Ligne 4 — /)).toBeInTheDocument();
    expect(screen.queryByText(/^Ligne 3 — /)).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});

describe('creditService.createLoanTransaction — règle de crédit appliquée par le service', () => {
  // Prêt DIRECT (sans workflow) : uniquement quand la règle n'exige pas d'approbation (mandat du 2026-09-27).
  // LR-001 est OFF sur « Garant requis » dans les données DEMO : ce bloc porte sur une règle qui EXIGE un garant.
  beforeEach(() => { Object.assign(loanRules.find((rule) => rule.id === 'LR-001')!, { requiresApproval: false, requiresGuarantor: true }); });
  const loanInput = (over: Partial<Parameters<typeof creditService.createLoanTransaction>[1]> = {}) => ({
    memberId: 'M-016', principal: 400_000, approved: true, approvedBy: 'Awa Sarr',
    guarantors: [{ guarantorName: 'Fatou Ndiaye', guaranteedAmount: 400_000, relation: '' }],
    transactionInput: { cashboxNumber: 'CS-001-CX-004', memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES' as const, subcategory: 'PRET' as const, type: 'debit' as const, amount: 400_000, description: '' },
    ...over,
  });

  it('prêt conforme : Loan actif + intérêts de la règle + transaction débit sur Épargne (caisse prioritaire)', async () => {
    const result = await creditService.createLoanTransaction('T-001', loanInput());
    expect(result?.loan).toMatchObject({ memberId: 'M-016', principal: 400_000, interestRate: 12, status: 'active' });
    expect(result?.transaction).toMatchObject({ type: 'debit', source: 'CS-001-CX-001', loanId: result?.loan.id });
    expect(result?.application).toMatchObject({ stage: 'stageDisbursed', approvalDate: result?.transaction.date });
  });

  it.each([
    ['garant manquant', { guarantors: [] }],
    ['couverture insuffisante (ratio 100 %)', { guarantors: [{ guarantorName: 'Fatou Ndiaye', guaranteedAmount: 399_999, relation: '' }] }],
    ['auto-caution interdite', { guarantors: [{ guarantorName: 'Modou Faye', guaranteedAmount: 400_000, relation: '' }] }],
    ['trop de garants (max 2)', { guarantors: [{ guarantorName: 'Fatou Ndiaye', guaranteedAmount: 200_000, relation: '' }, { guarantorName: 'Cheikh Diop', guaranteedAmount: 200_000, relation: '' }, { guarantorName: 'Coumba Thiam', guaranteedAmount: 200_000, relation: '' }] }],
    ['montant hors bornes', { principal: 10_000 }],
    ['exposition maximale (Cheikh : 1 678 320 déjà dû)', { memberId: 'M-006', principal: 1_400_000, guarantors: [{ guarantorName: 'Fatou Ndiaye', guaranteedAmount: 1_400_000, relation: '' }] }],
  ])('refus — %s : aucun prêt, aucune transaction', async (_label, over) => {
    const counts = { loans: loans.length, transactions: transactions.length };
    expect(await creditService.createLoanTransaction('T-001', loanInput(over))).toBeUndefined();
    expect(loans.length).toBe(counts.loans);
    expect(transactions.length).toBe(counts.transactions);
  });

  it('approbation requise par la règle : jamais de prêt direct, même avec une attestation « approuvé » (le prêt passe par le workflow)', async () => {
    loanRules.find((rule) => rule.id === 'LR-001')!.requiresApproval = true;
    const counts = { loans: loans.length, transactions: transactions.length };
    expect(await creditService.createLoanTransaction('T-001', loanInput({ approved: true }))).toBeUndefined();
    expect({ loans: loans.length, transactions: transactions.length }).toEqual(counts);
  });

  it('lot : une ligne de prêt refusée annule tout le lot (aucun prêt ni transaction partiels)', async () => {
    const counts = { loans: loans.length, transactions: transactions.length, guarantors: guarantors.length, applications: applications.length };
    const result = await transactionBatchService.createTransactionsBatch('T-001', [
      { kind: 'loan', input: loanInput() },
      { kind: 'loan', input: loanInput({ memberId: 'M-018', guarantors: [] }) }, // garant manquant → refus
    ]);
    expect(result).toEqual({ ok: false, failedIndex: 1 });
    expect({ loans: loans.length, transactions: transactions.length, guarantors: guarantors.length, applications: applications.length }).toEqual(counts);
  });
});

/**
 * CATÉGORIE de saisie (mandat « Catégories de transactions », 2026-09-27 — ex-« Opération ») :
 * exactement Épargner · Rembourser · Emprunter · Autres ; catégorie du modèle, sous-catégorie
 * et type imposé sont déduits par le référentiel (`classificationForOperation`, `requiredTransactionType`).
 */
describe('Saisie rapide — Action', { timeout: 20_000 }, () => {
  it('propose exactement les 4 actions ; « Autres » : pas de sous-catégorie, type modifiable', async () => {
    const user = userEvent.setup();
    await openQuickEntry(user);
    expect(screen.queryByLabelText(/^Opération/)).not.toBeInTheDocument();
    const operation = screen.getByLabelText(/^Action \*/);
    expect(within(operation).getAllByRole('option').map((option) => option.textContent)).toEqual(['Sélectionner une action', 'Épargner', 'Rembourser', 'Emprunter', 'Autres']);
    await user.selectOptions(operation, 'AUTRES');
    expect(screen.queryByLabelText(/Sous-catégorie/)).not.toBeInTheDocument();
    expect(screen.queryByText('Sélectionner une sous-catégorie')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Type/)).toBeEnabled();
  });

  it('PRÊT : « Caisse prioritaire » Épargne en lecture seule, Type Débit verrouillé ; REMBOURSEMENT : « Caisse d’encaissement », Type Crédit verrouillé', async () => {
    const user = userEvent.setup();
    await openQuickEntry(user);
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'PRET');
    expect(await screen.findByLabelText(/^Caisse prioritaire/)).toHaveValue('Épargne');
    expect(screen.getByLabelText(/^Type/)).toHaveValue('debit');
    expect(screen.getByLabelText(/^Type/)).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'REMBOURSEMENT');
    expect(screen.getByLabelText(/^Caisse d’encaissement/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Type/)).toHaveValue('credit');
    expect(screen.getByLabelText(/^Type/)).toBeDisabled();
  });

  it.each([
    ['EPARGNE', { category: 'EPARGNE', type: 'credit' }],
  ] as const)('%s : enregistrée avec la classification déduite de la catégorie', async (operation, expected) => {
    const user = userEvent.setup();
    const before = transactions.length;
    await openQuickEntry(user);
    await user.selectOptions(screen.getByLabelText(/^Action \*/), operation);
    expect(screen.getByLabelText(/^Type/)).toBeDisabled();
    await fillRow(user, 0, 'Fatou', '5000');
    await user.click(saveButton());
    await screen.findByRole('heading', { name: 'Transport' });
    expect(transactions.slice(before)).toEqual([expect.objectContaining({ ...expected, amount: 5_000, destination: 'CS-001-CX-004' })]);
  });
});
