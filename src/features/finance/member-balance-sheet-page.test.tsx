import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { defaultBalancePeriod } from '@/lib/finance';
import { FiscalYearSelector } from '@/layouts/fiscal-year-selector';
import { transactions } from '@/mocks/finance/transactions';
import { tenantCreditRule } from '@/mocks/finance/loan-rules';
import { members } from '@/mocks/organization/members';
import { currentUser } from '@/mocks/rbac.mocks';
import { financePositionService } from '@/services/finance-position.service';

/**
 * « Bilan financier de l'adhérent » (refonte du 2026-09-28) — un RELEVÉ individuel imprimable par
 * adhérent, période Date de début → Date de fin contextualisée par l'exercice du HEADER (aucun
 * sélecteur local). Aujourd'hui figé au 27/09/2026 (seul `Date` est simulé). Les montants attendus
 * sont recalculés depuis le JOURNAL : cohérence journal ↔ relevé.
 */
const TODAY = '2026-09-27';
const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ');
const t001Members = () => members.filter((member) => member.tenantId === 'T-001');
const fullName = (memberId: string) => { const member = members.find((item) => item.id === memberId)!; return `${member.firstName} ${member.lastName}`; };
/** Épargne attendue d'après le journal : Épargne − Retraits (crédit +, débit −), toutes caisses, jusqu'à `to`. */
const journalSavings = (memberId: string, to: string) => transactions
  .filter((tx) => tx.tenantId === 'T-001' && tx.memberId === memberId && tx.status === 'completed' && tx.date <= to && (tx.category === 'EPARGNE' || (tx.category === 'AUTRES' && tx.subcategory === 'RETRAIT')))
  .reduce((sum, tx) => sum + (tx.type === 'credit' ? tx.amount : -tx.amount), 0);
/** Montant d'un relevé : nombre groupé par milliers, « — » pour zéro (la devise est indiquée en tête du tableau). */
const num = (amount: number) => (amount === 0 ? '—' : `${amount < 0 ? '-' : ''}${String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`);

function LocationProbe() { const location = useLocation(); return <output data-testid="location">{location.pathname}</output>; }
function renderPage() {
  renderWithProviders(<><FiscalYearSelector /><Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes><LocationProbe /></>, { route: '/finance/member-balances' });
}
const fromField = () => screen.getByLabelText('Date de début') as HTMLInputElement;
const toField = () => screen.getByLabelText('Date de fin') as HTMLInputElement;
async function periodReady(from: string, to: string) {
  await waitFor(() => { expect(fromField().value).toBe(from); expect(toField().value).toBe(to); });
}
const statements = () => screen.getAllByTestId('mb-statement');
const statementOf = (memberId: string) => statements().find((node) => node.getAttribute('data-member-id') === memberId)!;
const summaryValue = (statement: HTMLElement, label: string) => plain(within(within(statement).getByTestId('mb-summary')).getByText(label).closest('div')!.querySelector('dd')!.textContent);

const savedPermissions = [...currentUser.permissions];
beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
});
afterEach(() => { vi.useRealTimers(); currentUser.permissions = [...savedPermissions]; });

describe('Période par défaut — defaultBalancePeriod', () => {
  it('TEST 1 — exercice 2026, aujourd’hui 27/09/2026 : du 01/01/2026 au 27/09/2026', () => {
    expect(defaultBalancePeriod({ startDate: '2026-01-01', endDate: '2026-12-31' }, TODAY)).toEqual({ from: '2026-01-01', to: '2026-09-27' });
  });
  it('TEST 2 — exercice 2025, aujourd’hui 27/09/2026 : du 01/01/2025 au 31/12/2025', () => {
    expect(defaultBalancePeriod({ startDate: '2025-01-01', endDate: '2025-12-31' }, TODAY)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
  it('exercice futur : la fin n’est jamais avant le début', () => {
    expect(defaultBalancePeriod({ startDate: '2027-01-01', endDate: '2027-12-31' }, TODAY)).toEqual({ from: '2027-01-01', to: '2027-01-01' });
  });
});

describe('Bilan financier de l’adhérent — relevés', { timeout: 30_000 }, () => {
  it('contexte du header : aucun sélecteur d’exercice dans le bilan ; période initiale = exercice 2026 jusqu’à aujourd’hui', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Bilan financier des adhérents' })).toBeInTheDocument();
    await periodReady('2026-01-01', TODAY);
    expect(screen.queryByLabelText(/Exercice fiscal|Exercice comptable/)).not.toBeInTheDocument();
    expect((screen.getByLabelText('Adhérents') as HTMLSelectElement).value).toBe('ALL');
    expect((screen.getByLabelText('Caisses') as HTMLSelectElement).value).toBe('');
  });

  it('tous les adhérents : UN relevé autonome par adhérent (jamais de tableau global), sans carte KPI, nouvelle page à chaque adhérent', async () => {
    renderPage();
    await periodReady('2026-01-01', TODAY);
    await waitFor(() => expect(statements()).toHaveLength(t001Members().length));
    expect(document.querySelectorAll('article')).toHaveLength(0);
    const [first, second] = statements();
    expect(within(first).queryByText(/^Relevé \d+ sur/)).not.toBeInTheDocument();
    expect(within(second).getByText(`Relevé 2 sur ${t001Members().length}`)).toBeInTheDocument();
    for (const statement of [first, second]) {
      expect(within(statement).getByTestId('mb-association-header')).toHaveTextContent('Coopérative Sutura');
      expect(within(statement).getByRole('heading', { name: 'Bilan financier de l’adhérent' })).toBeInTheDocument();
      expect(within(statement).getByTestId('mb-identification')).toHaveTextContent('01/01/2026 → 27/09/2026');
      expect(within(statement).getByTestId('mb-statement-table')).toBeInTheDocument();
      expect(within(statement).getByTestId('mb-summary')).toBeInTheDocument();
    }
    // En-tête complet (adresse, contacts) sur le premier relevé, compact ensuite.
    expect(within(first).getByTestId('mb-association-header')).toHaveTextContent('contact@sutura.cm');
    expect(within(second).getByTestId('mb-association-header')).not.toHaveTextContent('contact@sutura.cm');
    expect(document.querySelector('#mb-print-area style')!.textContent).toContain('break-before: page');
  });

  it('épargne versée de chaque adhérent = journal ; solde affiché = versé + gains ; une ligne par mois, report et total', async () => {
    expect(tenantCreditRule('T-001')!.interestPeriod).toBe('MONTHLY');
    const { statements: expected } = await financePositionService.memberPeriodStatements('T-001', { memberIds: 'ALL', from: '2026-01-01', to: TODAY });
    renderPage();
    await periodReady('2026-01-01', TODAY);
    await waitFor(() => expect(statements()).toHaveLength(t001Members().length));
    for (const member of t001Members()) {
      const statement = statementOf(member.id);
      const closing = expected.find((item) => item.memberId === member.id)!.closing;
      expect(closing.savings).toBe(journalSavings(member.id, TODAY));
      expect(summaryValue(statement, 'Épargne au 27/09/2026')).toBe(num(Math.round(closing.savings + closing.gains)));
      const table = within(statement).getByTestId('mb-statement-table');
      expect(within(table).getByRole('columnheader', { name: 'Mois' })).toBeInTheDocument();
      expect(within(table).getByRole('rowheader', { name: 'Report au 31/12/2025' })).toBeInTheDocument();
      expect(within(table).getByRole('rowheader', { name: /janvier 2026/i })).toBeInTheDocument();
      expect(within(table).getByRole('rowheader', { name: /septembre 2026/i })).toBeInTheDocument();
      expect(within(table).getByRole('rowheader', { name: 'Total de la période' })).toBeInTheDocument();
    }
  });

  it('adhérent emprunteur : type et taux d’intérêt réels dans l’en-tête, intérêts tracés, prêts en cours, situation nette', async () => {
    const rule = tenantCreditRule('T-001')!;
    const user = userEvent.setup();
    renderPage();
    await periodReady('2026-01-01', TODAY);
    await user.selectOptions(screen.getByLabelText('Adhérents'), 'SELECTION');
    await user.click(screen.getByRole('checkbox', { name: fullName('M-001') }));
    await waitFor(() => expect(statements()).toHaveLength(1));
    const statement = statements()[0];
    const typeLabel = { SIMPLE: 'Intérêt simple', COMPOUND: 'Intérêt composé', GLOBAL: 'Intérêt global' }[rule.loanMode];
    expect(within(statement).getByTestId('mb-interest-type')).toHaveTextContent(typeLabel);
    // Taux du prêt L-001 (instantané du dossier), exprimé par période de la règle.
    const loanRate = (await import('@/mocks/finance/loans')).loans.find((loan) => loan.id === 'L-001')!.interestRate;
    expect(within(statement).getByTestId('mb-interest-rate')).toHaveTextContent(`${loanRate} % par mois`);
    expect(within(statement).getByTestId('mb-loan-interest')).toHaveTextContent('L-001');
    expect(within(within(statement).getByTestId('mb-statement-table')).getByRole('columnheader', { name: 'Intérêts' })).toBeInTheDocument();
    expect(within(statement).getByTestId('mb-current-loans')).toHaveTextContent('L-001');
    expect(within(statement).getByTestId('mb-net-position')).toHaveTextContent('Situation nette au 27/09/2026');
  });

  it('TEST 3 et 4 — date de fin modifiable jusqu’au 31/12/2026 puis au 15/02/2027, sans blocage ni changement d’exercice', async () => {
    renderPage();
    await periodReady('2026-01-01', TODAY);
    fireEvent.change(toField(), { target: { value: '2026-12-31' } });
    expect(toField().value).toBe('2026-12-31');
    await waitFor(() => expect(screen.getAllByTestId('mb-identification')[0]).toHaveTextContent('01/01/2026 → 31/12/2026'));
    fireEvent.change(toField(), { target: { value: '2027-02-15' } });
    expect(toField().value).toBe('2027-02-15');
    await waitFor(() => expect(screen.getAllByTestId('mb-identification')[0]).toHaveTextContent('01/01/2026 → 15/02/2027'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sélecteur d.exercice fiscal/ })).toHaveTextContent('2026');
  });

  it('TEST 5 — date de début > date de fin : message de validation, aucun relevé', async () => {
    renderPage();
    await periodReady('2026-01-01', TODAY);
    await waitFor(() => expect(statements().length).toBeGreaterThan(0));
    fireEvent.change(fromField(), { target: { value: '2026-09-01' } });
    fireEvent.change(toField(), { target: { value: '2026-08-15' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('La date de début doit être antérieure ou égale à la date de fin.');
    expect(screen.queryByTestId('mb-statement')).not.toBeInTheDocument();
    expect(toField()).toHaveAttribute('aria-invalid', 'true');
  });

  it('TEST 6 — changer l’exercice dans le header : on reste sur le bilan, les dates par défaut suivent le nouvel exercice', async () => {
    const user = userEvent.setup();
    renderPage();
    await periodReady('2026-01-01', TODAY);
    fireEvent.change(toField(), { target: { value: '2026-12-31' } }); // saisie utilisateur, remplacée par le nouvel exercice
    await user.click(screen.getByRole('button', { name: /Sélecteur d.exercice fiscal/ }));
    await user.click(screen.getByRole('option', { name: /Exercice 2025/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/finance/member-balances');
    await periodReady('2025-01-01', '2025-12-31');
    await waitFor(() => expect(screen.getAllByTestId('mb-identification')[0]).toHaveTextContent('Exercice 2025'));
  });

  it('un seul adhérent : son seul relevé ; plusieurs : un relevé chacun', async () => {
    const user = userEvent.setup();
    renderPage();
    await periodReady('2026-01-01', TODAY);
    await user.selectOptions(screen.getByLabelText('Adhérents'), 'SELECTION');
    expect(await screen.findByText('Sélectionnez au moins un adhérent.')).toBeInTheDocument();
    const [first, second] = t001Members();
    await user.click(screen.getByRole('checkbox', { name: `${first.firstName} ${first.lastName}` }));
    await waitFor(() => expect(statements()).toHaveLength(1));
    await user.click(screen.getByRole('checkbox', { name: `${second.firstName} ${second.lastName}` }));
    await waitFor(() => expect(statements()).toHaveLength(2));
  });

  it('épargnant : gains redistribués tracés (caisse, prêt d’origine, répartition au prorata)', async () => {
    const { statements: all } = await financePositionService.memberPeriodStatements('T-001', { memberIds: 'ALL', from: '2026-01-01', to: TODAY });
    const saver = all.find((item) => item.end.gainLines.length > 0 && item.end.loans.length === 0)!;
    expect(saver).toBeDefined();
    const user = userEvent.setup();
    renderPage();
    await periodReady('2026-01-01', TODAY);
    await user.selectOptions(screen.getByLabelText('Adhérents'), 'SELECTION');
    await user.click(screen.getByRole('checkbox', { name: fullName(saver.memberId) }));
    await waitFor(() => expect(statements()).toHaveLength(1));
    const gains = within(statements()[0]).getByTestId('mb-gains');
    expect(within(gains).getAllByRole('row').slice(1)).toHaveLength(saver.end.gainLines.length);
    expect(gains).toHaveTextContent(/Prêt L-\d+/);
    expect(gains).toHaveTextContent(/% — solde/);
  });

  it('type et taux suivent la règle configurée : Intérêt global 25 % pour un adhérent sans prêt', async () => {
    const rule = tenantCreditRule('T-001')!;
    const saved = { loanMode: rule.loanMode, interestRate: rule.interestRate };
    Object.assign(rule, { loanMode: 'GLOBAL', interestRate: 25 });
    try {
      const borrowers = new Set(['M-001', 'M-006']);
      const saver = t001Members().find((member) => !borrowers.has(member.id))!;
      const user = userEvent.setup();
      renderPage();
      await periodReady('2026-01-01', TODAY);
      await user.selectOptions(screen.getByLabelText('Adhérents'), 'SELECTION');
      await user.click(screen.getByRole('checkbox', { name: `${saver.firstName} ${saver.lastName}` }));
      await waitFor(() => expect(statements()).toHaveLength(1));
      expect(within(statements()[0]).getByTestId('mb-interest-type')).toHaveTextContent('Intérêt global');
      expect(within(statements()[0]).getByTestId('mb-interest-rate')).toHaveTextContent('25 % par mois');
    } finally {
      Object.assign(rule, saved);
    }
  });

  it('prêts aux paramètres historisés différents : « Selon le prêt » et le détail prêt par prêt (jamais un taux unique trompeur)', async () => {
    const { loans } = await import('@/mocks/finance/loans');
    const saved = loans.length;
    const member = t001Members().find((item) => !['M-001', 'M-006'].includes(item.id))!;
    const base = structuredClone(loans.find((loan) => loan.id === 'L-001')!);
    loans.push(
      { ...base, id: 'L-HIST-1', memberId: member.id, loanMode: 'COMPOUND', interestRate: 10, interestPeriod: 'MONTHLY', disbursementDate: '2026-03-01', maturityDate: '2026-09-01' },
      { ...base, id: 'L-HIST-2', memberId: member.id, loanMode: 'SIMPLE', interestRate: 20, interestPeriod: 'MONTHLY', disbursementDate: '2026-05-01', maturityDate: '2026-11-01' },
    );
    try {
      const user = userEvent.setup();
      renderPage();
      await periodReady('2026-01-01', TODAY);
      await user.selectOptions(screen.getByLabelText('Adhérents'), 'SELECTION');
      await user.click(screen.getByRole('checkbox', { name: `${member.firstName} ${member.lastName}` }));
      await waitFor(() => expect(statements()).toHaveLength(1));
      const statement = statements()[0];
      expect(within(statement).getByTestId('mb-interest-type')).toHaveTextContent('Selon le prêt');
      expect(within(statement).getByTestId('mb-interest-rate')).toHaveTextContent('Selon le prêt');
      const detail = within(statement).getByTestId('mb-interest-per-loan');
      expect(detail).toHaveTextContent('L-HIST-1 : Intérêt composé — 10 % par mois');
      expect(detail).toHaveTextContent('L-HIST-2 : Intérêt simple — 20 % par mois');
    } finally {
      loans.splice(saved);
    }
  });

  it('TEST 20 — Intérêts et Pénalités dans deux colonnes distinctes, détail des pénalités (date, base, type, valeur, montant)', async () => {
    const { loans } = await import('@/mocks/finance/loans');
    const saved = loans.length;
    const member = t001Members().find((item) => !['M-001', 'M-006'].includes(item.id))!;
    const base = structuredClone(loans.find((loan) => loan.id === 'L-001')!);
    // Échu le 01/06/2026, non soldé : intérêts mensuels continus + pénalité FIXE de 10 000 aux échéances des 01/07, 01/08 et 01/09.
    loans.push({ ...base, id: 'L-PEN-UI', memberId: member.id, principal: 100_000, loanMode: 'SIMPLE', interestRate: 10, disbursementDate: '2026-03-01', maturityDate: '2026-06-01', penaltyEnabled: true, penaltyType: 'FIXED', penaltyValue: 10_000 });
    try {
      const user = userEvent.setup();
      renderPage();
      await periodReady('2026-01-01', TODAY);
      await user.selectOptions(screen.getByLabelText('Adhérents'), 'SELECTION');
      await user.click(screen.getByRole('checkbox', { name: `${member.firstName} ${member.lastName}` }));
      await waitFor(() => expect(statements()).toHaveLength(1));
      const table = within(statements()[0]).getByTestId('mb-statement-table');
      const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent);
      expect(headers.slice(-6)).toEqual(['Report dette', 'Prêt accordé', 'Intérêts', 'Pénalités', 'Remboursement', 'Dette restante']);
      const september = within(table).getAllByRole('row').find((row) => /septembre/i.test(row.textContent ?? ''))!;
      const cells = within(september).getAllByRole('cell').map((cell) => plain(cell.textContent));
      const penaltiesIndex = headers.indexOf('Pénalités') - 1;
      expect(cells[penaltiesIndex]).toBe(num(10_000));
      expect(cells[penaltiesIndex - 1]).toBe(num(10_000)); // intérêt SIMPLE 100 000 × 10 %, continu après l'échéance
      const detail = within(statements()[0]).getByTestId('mb-loan-penalties');
      expect(within(detail).getAllByRole('row')).toHaveLength(4); // en-tête + 3 mois de retard
      expect(detail).toHaveTextContent('Montant fixe');
    } finally {
      loans.splice(saved);
    }
  });

  describe('Colonne Pénalités — affichée selon `penaltyEnabled` des prêts du relevé, jamais selon le montant', () => {
    /** Relevé d'un adhérent sans prêt de démo, avec les prêts fournis (dérivés de L-001) ; renvoie en-têtes et relevé. */
    async function statementWithLoans(overrides: Partial<import('@/mocks/finance/loans').Loan>[]) {
      const { loans } = await import('@/mocks/finance/loans');
      const saved = loans.length;
      const member = t001Members().find((item) => !['M-001', 'M-006'].includes(item.id))!;
      const base = structuredClone(loans.find((loan) => loan.id === 'L-001')!);
      overrides.forEach((over, index) => loans.push({ ...base, id: `L-COL-${index}`, memberId: member.id, principal: 100_000, loanMode: 'SIMPLE', interestRate: 10, disbursementDate: '2026-03-01', ...over }));
      try {
        const user = userEvent.setup();
        renderPage();
        await periodReady('2026-01-01', TODAY);
        await user.selectOptions(screen.getByLabelText('Adhérents'), 'SELECTION');
        await user.click(screen.getByRole('checkbox', { name: `${member.firstName} ${member.lastName}` }));
        await waitFor(() => expect(statements()).toHaveLength(1));
        const statement = statements()[0];
        const headers = within(within(statement).getByTestId('mb-statement-table')).getAllByRole('columnheader').map((header) => header.textContent);
        return { statement, headers };
      } finally {
        loans.splice(saved);
      }
    }
    const OFF = { penaltyEnabled: false, penaltyType: null, penaltyValue: 0 } as const;
    const ON = { penaltyEnabled: true, penaltyType: 'FIXED', penaltyValue: 10_000 } as const;

    it('pénalité OFF (prêt échu, non soldé) : colonne, synthèse et détail des pénalités totalement absents', async () => {
      const { statement, headers } = await statementWithLoans([{ ...OFF, maturityDate: '2026-06-01' }]);
      expect(headers).not.toContain('Pénalités');
      expect(headers).toContain('Intérêts');
      expect(within(statement).queryByTestId('mb-penalty-detail')).not.toBeInTheDocument();
      expect(within(statement).queryByText('Pénalités de retard')).not.toBeInTheDocument();
      expect(statement).not.toHaveTextContent(/Part pénalités/);
    });

    it('pénalité ON mais aucun retard sur la période (montant 0) : la colonne reste affichée', async () => {
      const { statement, headers } = await statementWithLoans([{ ...ON, maturityDate: '2027-03-01' }]);
      expect(headers.slice(-4)).toEqual(['Intérêts', 'Pénalités', 'Remboursement', 'Dette restante']);
      expect(within(statement).queryByTestId('mb-penalty-detail')).not.toBeInTheDocument(); // aucune pénalité à détailler
    });

    it('plusieurs prêts : un OFF échu + un ON non échu → colonne affichée', async () => {
      const { headers } = await statementWithLoans([{ ...OFF, maturityDate: '2026-06-01' }, { ...ON, maturityDate: '2027-03-01' }]);
      expect(headers).toContain('Pénalités');
    });
  });

  it('« Imprimer / PDF » : impression navigateur du document', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage();
    await periodReady('2026-01-01', TODAY);
    const button = screen.getByRole('button', { name: /Imprimer \/ PDF/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('autorisations existantes : sans « loans.read », l’écran est refusé', async () => {
    currentUser.permissions = savedPermissions.filter((permission) => permission !== 'loans.read');
    renderPage();
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/unauthorized'));
  });
});
