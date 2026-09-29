import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { transactions } from '@/mocks/finance/transactions';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { financePositionService } from '@/services/finance-position.service';
import { financeService } from '@/services/finance.service';

/**
 * Mandat « Le Compte comme point d'entrée des Transactions » (2026-09-23) :
 * Transactions n'est plus un nœud de menu — le parcours attendu devient
 * Comptes → fiche caisse → « + Nouvelle transaction » (compte pré-sélectionné
 * et verrouillé) → retour sur la fiche caisse (solde/journal à jour).
 * Mandat « Correction du mini dashboard » (2026-09-25) : l'accueil Caisses
 * n'affiche plus que 4 KPI (plus de « Toutes les transactions » ni de
 * répartition / dernières transactions). AC-009 (Épargne, `CS-001-CX-001`) et
 * AC-012 (Transport, `CS-001-CX-004`) servent de fixtures (jeu de démonstration T-001).
 */
const TRANSACTIONS_SEED = structuredClone(transactions);
function restoreTransactionsSeed() {
  transactions.splice(0, transactions.length, ...structuredClone(TRANSACTIONS_SEED));
}
beforeEach(restoreTransactionsSeed);
afterEach(restoreTransactionsSeed);

function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

describe('Finance → Comptes — le compte comme point d\'entrée des transactions', () => {
  it('le mini dashboard Caisses affiche 5 KPI dans l’ordre ouverture → crédit → débit → solde → caisses', async () => {
    renderFinance('/finance/cashboxes?tab=cashboxes');
    const kpis = await screen.findByTestId('cashbox-home-kpis');
    const card = (label: string) => within(kpis).getByText(label).closest('article') as HTMLElement;
    const amount = (label: string) => Number((card(label).querySelector('p.text-2xl')?.textContent ?? '').replace(/[^\d-]/g, ''));
    expect(within(kpis).getAllByRole('article').map((article) => article.querySelector('p')?.textContent))
      .toEqual(['Solde à l’ouverture', 'Total crédit', 'Total débit', 'Solde global', 'Caisses']);
    // Σ crédits / Σ débits (perspective caisse) de l'exercice 2026 du jeu de démonstration (16 transactions, 1 219 000).
    expect(card('Total crédit')).toHaveTextContent(/337\s000\sFCFA/);
    expect(card('Total crédit')).toHaveTextContent('16 mouvements');
    // Mandat « Normalisation des montants » (2026-09-25) : montant COMPLET, jamais de notation compacte.
    expect(card('Total débit')).toHaveTextContent(/882\s000\sFCFA/);
    // « Solde à l'ouverture » : Σ des ouvertures du moteur, cohérent avec solde = ouverture + crédit − débit.
    expect(card('Solde à l’ouverture')).toHaveTextContent(/^Solde à l’ouverture\d{1,3}(\s\d{3})*\sFCFAau 01\/01\/2026$/);
    expect(amount('Solde global')).toBe(amount('Solde à l’ouverture') + amount('Total crédit') - amount('Total débit'));
    for (const label of ['Solde à l’ouverture', 'Solde global', 'Total crédit', 'Total débit']) {
      expect(card(label)).not.toHaveTextContent(/\d\s*(k|M|Md)\s/);
      expect(card(label)).not.toHaveTextContent(/Exercice \d{4}/);
    }

    for (const removed of [/Entrées de l’exercice/, /Sorties de l’exercice/, /Répartition du solde par caisse/, /Dernières transactions de l’exercice/, /Toutes les transactions/]) {
      expect(screen.queryByText(removed)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /Toutes les transactions/i })).not.toBeInTheDocument();
  });

  it('la fiche caisse ne propose plus « Nouvelle transaction » mais « Voir les transactions », qui ouvre l’onglet Transactions filtré sur cette caisse', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes/AC-009');
    await screen.findByRole('heading', { name: 'Épargne' });
    expect(screen.queryByRole('button', { name: /Nouvelle transaction/i })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Voir les transactions/i })[0]);

    expect(await screen.findByRole('tab', { name: /Transactions/, selected: true })).toBeInTheDocument();
    await waitFor(() => expect((screen.getByLabelText('Libelle de caisse') as HTMLSelectElement).value).toBe('AC-009'));
  });

  it('une transaction créée depuis l’onglet Transactions (caisse choisie dans le formulaire) revient sur l’onglet, journal à jour', async () => {
    const user = userEvent.setup();
    const marker = `Épargne depuis Transactions ${Date.now()}`;
    renderFinance('/finance/cashboxes?tab=transactions');
    await screen.findByTestId('transactions-context-header');

    await user.click(await screen.findByRole('button', { name: /Nouvelle transaction/i }));
    await screen.findByRole('heading', { name: 'Transactions' });
    await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-001');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');
    const row = screen.getAllByTestId('quick-entry-row')[0];
    await user.click(within(row).getByRole('combobox'));
    await user.type(await screen.findByPlaceholderText(/Rechercher \(nom ou matricule\)/), 'Fatou');
    await user.click(await screen.findByRole('option', { name: /Fatou/ }));
    await user.type(within(row).getByLabelText('Montant de la ligne 1'), '15000');
    await user.type(within(row).getByLabelText('Commentaire de la ligne 1'), marker);
    await user.click(screen.getByRole('button', { name: 'Enregistrer 1 transaction' }));

    // Retour sur l'onglet Transactions : la nouvelle écriture est rattachée à la séance courante (FS-001) et visible dans le journal.
    await screen.findByTestId('transactions-context-header');
    expect(await screen.findByText(marker)).toBeInTheDocument();
    expect(transactions.find((tx) => tx.description === marker)?.sessionId).toBe('FS-001');
  });
});

/**
 * Mandat « Suppression de la gestion des adhérents du module Caisses »
 * (2026-09-25) : une caisse est un espace financier, elle n'administre plus de
 * liste d'adhérents. Les adhésions (`CashboxMembership`) restent des données
 * lues par le moteur de position — seule l'interface d'administration disparaît.
 */
describe('Finance → Caisses — plus de gestion des adhérents', () => {
  const REMOVED = [/Gérer les adhérents/i, /Ajouter un adhérent/i, /Retirer un adhérent/i, /Ajouter la sélection/i, /Ajouter tous/i, /Retirer la sélection/i, /Retirer tous/i];

  it('la liste des caisses n’expose aucune action de gestion des adhérents', async () => {
    renderFinance('/finance/cashboxes?tab=cashboxes');
    await screen.findByRole('table');
    for (const name of REMOVED) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });

  it('la fiche caisse garde solde et transactions, sans section ni bouton Adhérents', async () => {
    renderFinance('/finance/cashboxes/AC-009');
    await screen.findByRole('heading', { name: 'Épargne' });
    expect(screen.getByText('Transactions de la caisse')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Voir les transactions/i }).length).toBeGreaterThan(0);
    for (const name of REMOVED) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    for (const text of [/Adhérents disponibles/, /Adhérents affectés/]) expect(screen.queryByText(text)).not.toBeInTheDocument();
  });

  it('l’ancienne route /finance/cashboxes/:id/members n’existe plus', async () => {
    renderFinance('/finance/cashboxes/AC-009/members');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
    expect(screen.queryByText(/Adhérents disponibles/)).not.toBeInTheDocument();
  });
});

/**
 * Mandat « Liste des caisses — flèche de navigation » (2026-09-25) : chaque
 * ligne n'expose plus qu'une flèche « Voir le détail » (même modèle que la
 * liste des Tontines). Modifier / Réactiver / Supprimer restent sur la fiche.
 */
describe('Finance → Caisses — liste de navigation', () => {
  it('chaque ligne a une seule flèche de navigation et un menu d’actions, sans bouton Modifier / Réactiver / Supprimer visible', async () => {
    renderFinance('/finance/cashboxes?tab=cashboxes');
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(within(row).getAllByRole('button', { name: 'Voir le détail' })).toHaveLength(1);
      expect(within(row).getAllByRole('button', { name: /^Actions — / })).toHaveLength(1);
      for (const name of [/Modifier/, /Supprimer/, /Réactiver/]) expect(within(row).queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('la flèche ouvre la fiche de CETTE caisse, où Modifier / Supprimer sont regroupés dans le menu « ⋯ »', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=cashboxes');
    const table = await screen.findByRole('table');
    const row = within(table).getByRole('button', { name: 'Épargne' }).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Voir le détail' }));
    expect(await screen.findByRole('heading', { name: 'Épargne' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions de la caisse' })).toBeInTheDocument();
  });
});

/** Texte d'une cellule sans aucun espace (les séparateurs de milliers sont des espaces insécables fins) — « 13730000FCFA ». */
const compact = (element: HTMLElement) => (element.textContent ?? '').replace(/\s/g, '');

describe('Finance → Caisses — situation financière de chaque caisse dans la liste', () => {
  afterEach(() => { window.localStorage.removeItem('tanzen.currentFiscalYear.T-001'); });

  it('colonnes dans l’ordre : Titre · Nature · Statut · Solde à l’ouverture · Crédit · Débit · Solde · Dernier mouvement · →', async () => {
    renderFinance('/finance/cashboxes?tab=cashboxes');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Titre', 'Nature de la cotisation', 'Statut', 'Solde à l’ouverture', 'Crédit', 'Débit', 'Solde', 'Dernier mouvement', '']);
  });

  it('chaque ligne reprend exactement les chiffres du moteur (tenant T-001, exercice 2026), en montant complet, et reste cohérente ouverture + crédit − débit = solde', async () => {
    // Filtre par défaut « Actives ».
    const expected = (await financePositionService.cashboxesForFiscalYear('T-001', 'FY-T001-2026'))!.filter((cashbox) => cashbox.status === 'active');
    renderFinance('/finance/cashboxes?tab=cashboxes');
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(expected.length); // uniquement les caisses du tenant courant

    // Lignes dans l'ordre du service (jamais un appariement par nom).
    for (const [index, cashbox] of expected.entries()) {
      const row = rows[index];
      expect(within(row).getByRole('button', { name: cashbox.title })).toBeInTheDocument();
      const cells = within(row).getAllByRole('cell');
      expect(compact(cells[3])).toBe(`${cashbox.yearOpeningBalance}FCFA`);
      expect(compact(cells[4])).toBe(`${cashbox.inflows}FCFA`);
      expect(compact(cells[5])).toBe(`${cashbox.outflows}FCFA`);
      expect(compact(cells[6])).toBe(`${cashbox.balance}FCFA`);
      expect(cashbox.yearOpeningBalance + cashbox.inflows - cashbox.outflows).toBe(cashbox.balance);
      expect(within(cells[8]).getByRole('button', { name: 'Voir le détail' })).toBeInTheDocument();
    }

    // Échantillon lisible du jeu de démonstration : ouverture + crédits + débits / caisse sans report / caisse système sans mouvement.
    const rowOf = (title: string) => rows.find((tr) => within(tr).queryByRole('button', { name: title }))!;
    const savingsRows = rows.filter((tr) => within(tr).queryByRole('button', { name: 'Épargne' }));
    expect(savingsRows).toHaveLength(1); // AC-009 (système SAVINGS), qui porte le report de 8 650 000
    const [systemRow] = savingsRows;
    expect(compact(systemRow)).toContain('Libre');
    expect(systemRow).not.toHaveTextContent('Caisse système');
    expect(systemRow).toHaveTextContent('Active');
    // 8 650 000 + épargnes / remboursement 285 000 − prêt L-001 850 000
    expect(within(systemRow).getAllByRole('cell').slice(3, 8).map(compact)).toEqual(['8650000FCFA', '285000FCFA', '850000FCFA', '8085000FCFA', '12/08/2026']);
    expect(within(rowOf('Transport')).getAllByRole('cell').slice(3, 8).map(compact)).toEqual(['0FCFA', '15000FCFA', '12000FCFA', '3000FCFA', '13/08/2026']);
    expect(within(rowOf('Achat tontine')).getAllByRole('cell').slice(3, 7).map(compact)).toEqual(['0FCFA', '0FCFA', '0FCFA', '0FCFA']);
    expect(rowOf('Achat tontine')).toHaveTextContent('Aucun mouvement');
    expect(screen.queryByText(/\d\s?[kM]\s?FCFA/)).not.toBeInTheDocument(); // jamais de notation compacte
  });

  it('respecte l’exercice sélectionné : sur 2027, l’ouverture = solde de fin 2026, aucun crédit/débit, aucun dernier mouvement', async () => {
    window.localStorage.setItem('tanzen.currentFiscalYear.T-001', 'FY-T001-2027');
    renderFinance('/finance/cashboxes?tab=cashboxes');
    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row').find((tr) => within(tr).queryByRole('button', { name: 'Transport' }))!;
    expect(within(row).getAllByRole('cell').slice(3, 7).map(compact)).toEqual(['3000FCFA', '0FCFA', '0FCFA', '3000FCFA']);
    expect(row).toHaveTextContent('Aucun mouvement');
  });

  it('la navigation vers la caisse fonctionne toujours (titre et flèche)', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes?tab=cashboxes');
    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row').find((tr) => within(tr).queryByRole('button', { name: 'Épargne' }))!;
    await user.click(within(row).getByRole('button', { name: 'Voir le détail' }));
    expect(await screen.findByRole('heading', { name: 'Épargne' })).toBeInTheDocument();
  });
});

describe('Finance → Caisses — libellés de la liste', () => {
  it('aucun badge « Caisse système » dans la liste ; la caisse système d’épargne s’affiche « Épargne », les autres noms sont inchangés', async () => {
    renderFinance('/finance/cashboxes?tab=cashboxes');
    const table = await screen.findByRole('table');
    expect(within(table).queryByText(/Caisse système/i)).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Epargne' })).not.toBeInTheDocument();
    const titles = within(table).getAllByRole('row').slice(1).map((tr) => within(tr).getAllByRole('button')[0].textContent);
    expect(titles).toEqual(['Épargne', 'Inscription', 'Secours', 'Transport', 'Achat tontine']);
  });

  it('la distinction technique est conservée : la fiche d’une caisse système garde son badge', async () => {
    renderFinance('/finance/cashboxes/AC-010');
    expect(await screen.findByRole('heading', { name: 'Inscription' })).toBeInTheDocument();
    expect(screen.getByText('Caisse système')).toBeInTheDocument();
  });
});

/**
 * Mandat « Suppression des cartes KPI — détail caisse » (2026-09-25) : la fiche
 * caisse n'affiche plus Solde / Solde d'ouverture / Entrées / Sorties (ils
 * restent calculés et affichés sur l'accueil Caisses) ; le journal de la caisse
 * devient le contenu principal.
 */
describe('Finance → Caisses → fiche caisse centrée sur ses transactions', () => {
  it('en-tête : nom, statut, infos essentielles en ligne, actions — et plus aucune carte KPI', async () => {
    renderFinance('/finance/cashboxes/AC-012');
    expect(await screen.findByRole('heading', { name: 'Transport' })).toBeInTheDocument();
    const info = screen.getByTestId('cashbox-header-info');
    expect(within(info).getByText('Active')).toBeInTheDocument();
    for (const label of [/Nature de la cotisation/, /Dernier mouvement/, /Ouverte le/]) expect(within(info).getByText(label)).toBeInTheDocument();
    for (const name of [/Retour aux caisses/, /Voir les transactions/, /Actions de la caisse/]) expect(screen.getAllByRole('button', { name })[0]).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nouvelle transaction/ })).not.toBeInTheDocument();

    expect(screen.queryAllByRole('article')).toHaveLength(0);
    for (const removed of [/^Solde$/, /Solde d’ouverture/, /Entrées de l’exercice/, /Sorties de l’exercice/, /Informations principales/]) {
      expect(screen.queryByText(removed)).not.toBeInTheDocument();
    }
    expect(screen.getByText('Transactions de la caisse')).toBeInTheDocument();
  });

  it('le journal ne contient que les transactions de CETTE caisse sur l’exercice courant (« Toutes les séances »)', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes/AC-012');
    await screen.findByRole('heading', { name: 'Transport' });
    // Même contexte de séance que l'onglet Transactions : « Toutes les séances » = tout l'exercice.
    await user.selectOptions(screen.getByLabelText('Date de séance'), 'all');
    const table = await screen.findByRole('table');
    const expected = transactions.filter((tx) => tx.tenantId === 'T-001' && tx.date.startsWith('2026') && (tx.source === 'CS-001-CX-004' || tx.destination === 'CS-001-CX-004'));
    expect(expected.length).toBeGreaterThan(0);
    expect(within(table).getAllByRole('row')).toHaveLength(1 + expected.length);
    for (const tx of expected) if (tx.description) expect(within(table).getAllByText(tx.description).length).toBeGreaterThan(0);
    // Une écriture qui ne touche pas Transport n'y figure jamais.
    const foreign = transactions.find((tx) => tx.tenantId === 'T-001' && tx.description && tx.source !== 'CS-001-CX-004' && tx.destination !== 'CS-001-CX-004');
    if (foreign?.description) expect(within(table).queryByText(foreign.description)).not.toBeInTheDocument();
  });

  it('caisse sans transaction : état vide propre avec « Voir les transactions »', async () => {
    const empty = cashboxes.find((cashbox) => cashbox.tenantId === 'T-001' && !transactions.some((tx) => tx.source === cashbox.cashboxNumber || tx.destination === cashbox.cashboxNumber));
    expect(empty).toBeDefined();
    renderFinance(`/finance/cashboxes/${empty!.id}`);
    expect(await screen.findByText('Aucune transaction pour cette caisse.')).toBeInTheDocument();
    // Un bouton dans l'en-tête + un dans l'état vide, même action — jamais de saisie depuis la fiche.
    expect(screen.getAllByRole('button', { name: /Voir les transactions/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Nouvelle transaction/ })).not.toBeInTheDocument();
  });
});


/**
 * Mandat « Restructuration des actions d'une caisse » (2026-09-25) : en-tête =
 * Retour aux caisses + « Nouvelle transaction » (action principale) + menu « ⋯ »
 * (Modifier la caisse / Supprimer la caisse). Protections inchangées : une caisse
 * système n'expose jamais la suppression.
 */
describe('Finance → Caisses → fiche caisse — menu « ⋯ » des actions administratives', () => {
  const createdIds: string[] = [];
  afterEach(() => {
    for (const createdId of createdIds.splice(0)) {
      const index = cashboxes.findIndex((cashbox) => cashbox.id === createdId);
      if (index >= 0) cashboxes.splice(index, 1);
    }
  });
  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Actions de la caisse' }));
    return screen.findByRole('menu');
  };

  it('en-tête : Retour + Voir les transactions visibles, Modifier / cycle de vie / Supprimer uniquement dans « ⋯ »', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes/AC-012');
    await screen.findByRole('heading', { name: 'Transport' });
    expect(screen.getByRole('button', { name: /Retour aux caisses/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Voir les transactions/ })[0]).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Modifier$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Supprimer$/ })).not.toBeInTheDocument();

    const menu = await openMenu(user);
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Modifier la caisse', 'Archiver la caisse', 'Supprimer la caisse']);
  });

  it('Retour aux caisses revient à la liste', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes/AC-012');
    await screen.findByRole('heading', { name: 'Transport' });
    await user.click(screen.getByRole('button', { name: /Retour aux caisses/ }));
    expect(await screen.findByTestId('cashbox-home-kpis')).toBeInTheDocument();
  });

  it('« Modifier la caisse » ouvre le formulaire existant ; après enregistrement on reste sur la fiche', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes/AC-012');
    await screen.findByRole('heading', { name: 'Transport' });
    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: 'Modifier la caisse' }));
    const titleInput = await screen.findByLabelText(/Titre/) as HTMLInputElement;
    expect(titleInput.value).toBe('Transport');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('heading', { name: 'Transport' })).toBeInTheDocument();
    expect(screen.getByText('Transactions de la caisse')).toBeInTheDocument();
  });

  it('« Supprimer la caisse » demande confirmation ; Annuler ferme sans rien supprimer', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/cashboxes/AC-012');
    await screen.findByRole('heading', { name: 'Transport' });
    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: 'Supprimer la caisse' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Supprimer cette caisse ?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('La caisse sera désactivée. Ses données et son historique seront conservés.');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cashboxes.find((cashbox) => cashbox.id === 'AC-012')?.status).toBe('active');
    expect(screen.getByRole('heading', { name: 'Transport' })).toBeInTheDocument();
  });

  it('confirmer une caisse sans mouvement : désactivation logique (jamais retirée), on reste sur la fiche désormais inactive', async () => {
    const user = userEvent.setup();
    const created = (await financeService.createCashbox('T-001', 'Coopérative Sutura', { title: `Caisse à supprimer ${Date.now()}`, type: 'LIBRE', amount: null, description: '' }))!;
    createdIds.push(created.id);
    renderFinance(`/finance/cashboxes/${created.id}`);
    await screen.findByRole('heading', { name: created.title });
    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: 'Supprimer la caisse' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(cashboxes.find((cashbox) => cashbox.id === created.id)?.status).toBe('inactive'));
    expect(await screen.findByTestId('cashbox-not-operational')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: created.title })).toBeInTheDocument();
  });

  it('caisses système (Achat tontine, Épargne, Inscription, Secours) : jamais « Supprimer la caisse », et le service refuse toujours', async () => {
    const systemCashboxes = cashboxes.filter((cashbox) => cashbox.tenantId === 'T-001' && cashbox.systemCode);
    expect(systemCashboxes.map((cashbox) => cashbox.systemCode).sort()).toEqual(['EMERGENCY_FUND', 'REGISTRATION', 'SAVINGS', 'TONTINE_PURCHASE']);
    for (const cashbox of systemCashboxes) {
      const user = userEvent.setup();
      const { unmount } = renderFinance(`/finance/cashboxes/${cashbox.id}`);
      await screen.findByRole('heading', { name: cashbox.title });
      const menu = await openMenu(user);
      expect(within(menu).queryByRole('menuitem', { name: 'Supprimer la caisse' })).not.toBeInTheDocument();
      expect(within(menu).getByRole('menuitem', { name: 'Modifier la caisse' })).toBeInTheDocument();
      // Jamais de désactivation / archivage d'une caisse système (le service refuse aussi : `systemProtected`).
      expect(within(menu).queryByRole('menuitem', { name: /Supprimer|Archiver/ })).not.toBeInTheDocument();
      unmount();
      expect(await financeService.deleteCashbox('T-001', cashbox.id)).toEqual({ ok: false, reason: 'systemProtected' });
    }
  });
});