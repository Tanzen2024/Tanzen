import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';
import { tontinesService } from '@/services/tontines.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';

/**
 * Espace de travail du Tour (mandat refonte « Tours ») — chaque test
 * construit sa PROPRE Tontine/Tour (tenant T-001), jamais les seeds
 * partagés (`tontines-module.test.tsx` les utilise déjà en lecture ;
 * les mocks en mémoire sont des singletons, jamais réinitialisés entre
 * tests, donc toute mutation sur un seed partagé fuiterait vers les
 * autres tests de ce fichier).
 */
async function setupWithPurchaseTour(opts: { contributionAmount?: number } = {}) {
  const tontine = await tontinesService.createTontine({
    tenantId: 'T-001', name: `Tontine Test ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
    contributionAmount: opts.contributionAmount ?? 25_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1,
    withPurchase: true,
  } as never);
  await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01'); // Fatou Ndiaye
  await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-01-01'); // Cheikh Diop
  const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-06-01');
  return { tontineId: tontine!.id, occurrenceId: occurrence!.id };
}

/**
 * SANS ACHAT — 4 adhérents planifiés dans l'ordre A(1)→B(2)→C(3)→D(4)
 * (mandat « sélection séquentielle des bénéficiaires », 2026-09-23). Le
 * Tour commence TOUJOURS vide (mandat « historique des bénéficiaires entre
 * Tours », 2026-09-23 — `createOccurrence` n'auto-consomme plus aucune
 * position) : la position 1 (Fatou) est ajoutée ici explicitement via
 * `addOccurrenceBeneficiaries`, exactement comme le ferait l'utilisateur en
 * cochant sa case puis « Ajouter » — les positions 2/3/4 restent à
 * sélectionner manuellement dans l'onglet Tours > Cotisations.
 */
async function setupSansAchatTour() {
  const tontine = await tontinesService.createTontine({
    tenantId: 'T-001', name: `Tontine Sans Achat Séquence ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
    contributionAmount: 50_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: false,
  } as never);
  const fatou = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01'); // A
  const modou = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-01-01'); // B
  const cheikh = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-01-01'); // C
  const coumba = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-018', '2026-01-01'); // D
  await tontineOperationsService.addPlanEntries('T-001', tontine!.id, [fatou!.id, modou!.id, cheikh!.id, coumba!.id]);
  const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-06-01');
  await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [fatou!.id]);
  return { tontineId: tontine!.id, occurrenceId: occurrence!.id };
}

function renderOccurrence(tontineId: string, occurrenceId: string) {
  return renderWithProviders(<Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>, { route: `/tontines/${tontineId}/occurrences/${occurrenceId}` });
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-pathname">{location.pathname}</div>;
}

function renderOccurrenceWithLocationProbe(tontineId: string, occurrenceId: string) {
  return renderWithProviders(<><Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes><LocationProbe /></>, { route: `/tontines/${tontineId}/occurrences/${occurrenceId}` });
}

describe('Espace de travail du Tour — Cotisations (colonne gauche)', () => {
  it('affiche chaque adhérent actif avec son montant à régler et son statut initial « Non payé »', async () => {
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    expect(screen.getByText('Cheikh Diop')).toBeInTheDocument();
    expect(screen.getAllByText('Non payé').length).toBe(2);
  });

  it('ON : bascule le paiement d’un adhérent — applique automatiquement le montant attendu, sans saisie manuelle', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    const toggle = screen.getByLabelText('Marquer Fatou Ndiaye comme réglé');
    await user.click(toggle);
    await screen.findByLabelText('Marquer Fatou Ndiaye comme non payé');
    expect(screen.getAllByText('Réglé').length).toBeGreaterThanOrEqual(1);
  });

  it('OFF : re-bascule un paiement déjà réglé vers « Non payé » sans jamais perdre la ligne d’adhérent', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await user.click(screen.getByLabelText('Marquer Fatou Ndiaye comme réglé'));
    const offToggle = await screen.findByLabelText('Marquer Fatou Ndiaye comme non payé');
    await user.click(offToggle);
    await screen.findByLabelText('Marquer Fatou Ndiaye comme réglé');
    expect(screen.getByText('Fatou Ndiaye')).toBeInTheDocument();
  });

  it('« Marquer tous comme payés » règle en une seule action toutes les cotisations restantes', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await user.click(screen.getByRole('button', { name: /Marquer tous comme payés/ }));
    await screen.findAllByText('Réglé');
    expect(screen.queryAllByText('Non payé').length).toBe(0);
  });

  /** DENY : « Tout sélectionner » a été retiré (mandat « sélection individuelle des bénéficiaires », 2026-09-23) — avec achat aussi, la sélection reste individuelle, checkbox par checkbox. */
  it('DENY : aucun contrôle « Tout sélectionner » — les checkbox individuelles restent fonctionnelles', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    expect(screen.queryByText(/Tout sélectionner/)).not.toBeInTheDocument();
    const row = screen.getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(row).getByRole('checkbox'));
    expect(within(row).getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
  });
});

describe('Espace de travail du Tour — Bénéficiaires (Ajouter →/← Enlever)', () => {
  it('un adhérent ajouté après la création du Tour apparaît dans Cotisations sans devenir bénéficiaire', async () => {
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    const added = await tontinesService.addAdhesion('T-001', tontineId, 'M-016', '2026-09-21');
    renderOccurrence(tontineId, occurrenceId);

    const contributions = (await screen.findByText('Cotisations des adhérents (3)')).closest('[class*="rounded"]') as HTMLElement;
    expect(within(contributions).getByText('Modou Faye')).toBeInTheDocument();
    expect(await tontineOperationsService.listBeneficiaries('T-001', occurrenceId)).toEqual([]);
    expect(added).toBeTruthy();
  });

  /**
   * Régression : `setContributionPayment` comparait à tort `joinedAt` à
   * `occurrence.date` (`isAdhesionActiveAt`), ce qui refusait la bascule de
   * paiement d'un adhérent (ou d'une représentation supplémentaire) rejoint
   * APRÈS la date du Tour — pourtant déjà listé dans Cotisations selon la
   * même règle que `listContributionStatuses` (adhésion active du cycle
   * courant, jamais la date historique du Tour). Le toggle doit fonctionner
   * pour CET adhérent exactement comme pour ceux présents dès la création.
   */
  it('le paiement d’un adhérent ajouté après la création du Tour peut être basculé ON puis OFF (jamais « Impossible de modifier ce paiement »)', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    await tontinesService.addAdhesion('T-001', tontineId, 'M-016', '2026-09-21'); // Modou Faye, rejoint APRÈS le Tour (créé au 2026-06-01)
    renderOccurrence(tontineId, occurrenceId);

    await screen.findByText('Modou Faye');
    const toggle = screen.getByLabelText('Marquer Modou Faye comme réglé');
    await user.click(toggle);
    await screen.findByLabelText('Marquer Modou Faye comme non payé');
    expect(screen.queryByText('Impossible de modifier ce paiement.')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Marquer Modou Faye comme non payé'));
    await screen.findByLabelText('Marquer Modou Faye comme réglé');
    expect(screen.queryByText('Impossible de modifier ce paiement.')).not.toBeInTheDocument();
  });

  it('sélectionner un adhérent puis « Ajouter » le déplace vers le panneau des bénéficiaires', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    const leftRow = screen.getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(leftRow).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    const beneficiariesTitle = await screen.findByText('Bénéficiaires du Tour (1)');
    const beneficiariesCard = beneficiariesTitle.closest('[class*="rounded"]') as HTMLElement;
    expect(within(beneficiariesCard).getByText('Fatou Ndiaye')).toBeInTheDocument();
  });

  it('sélectionner plusieurs adhérents ajoute plusieurs bénéficiaires en une seule action', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    const rowA = screen.getByText('Fatou Ndiaye').closest('tr')!;
    const rowB = screen.getByText('Cheikh Diop').closest('tr')!;
    await user.click(within(rowA).getByRole('checkbox'));
    await user.click(within(rowB).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (2)');
  });

  it('retirer un bénéficiaire via le menu ⋮ de sa ligne fonctionne — jamais une suppression silencieuse de l’historique', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    const leftRow = screen.getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(leftRow).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    const beneficiariesTitle = await screen.findByText('Bénéficiaires du Tour (1)');
    const beneficiariesCard = beneficiariesTitle.closest('[class*="rounded"]') as HTMLElement;
    const beneficiaryRow = within(beneficiariesCard).getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(beneficiaryRow).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Retirer ce bénéficiaire' }));
    await screen.findByText('Bénéficiaires du Tour (0)');
  });

  /**
   * Le panneau « Bénéficiaires du Tour » n'a plus de colonne checkbox (mandat
   * « suppression de la colonne checkbox », 2026-09-23) : aucune sélection
   * préalable n'est nécessaire ni possible ici, seul le retrait individuel
   * via le menu ⋮ de chaque ligne existe désormais.
   */
  it('le panneau « Bénéficiaires du Tour » n’a aucune checkbox — seul le retrait individuel via ⋮ est possible', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    const leftRowA = screen.getByText('Fatou Ndiaye').closest('tr')!;
    const leftRowB = screen.getByText('Cheikh Diop').closest('tr')!;
    await user.click(within(leftRowA).getByRole('checkbox'));
    await user.click(within(leftRowB).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (2)');

    const beneficiariesTitle = screen.getByText('Bénéficiaires du Tour (2)');
    const beneficiariesCard = beneficiariesTitle.closest('[class*="rounded"]') as HTMLElement;
    expect(within(beneficiariesCard).queryAllByRole('checkbox').length).toBe(0);
    expect(screen.queryByRole('button', { name: /Enlever/ })).not.toBeInTheDocument();

    const beneficiaryRow = within(beneficiariesCard).getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(beneficiaryRow).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Retirer ce bénéficiaire' }));
    const updatedTitle = await screen.findByText('Bénéficiaires du Tour (1)');
    const updatedCard = updatedTitle.closest('[class*="rounded"]') as HTMLElement;
    expect(within(updatedCard).queryByText('Fatou Ndiaye')).not.toBeInTheDocument();
    expect(within(updatedCard).getByText('Cheikh Diop')).toBeInTheDocument();
  });
});

describe('Espace de travail du Tour — Action « Régler » (Dû / Reçu / Reste / Statut)', () => {
  async function addBeneficiary(user: ReturnType<typeof userEvent.setup>) {
    const leftRow = screen.getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(leftRow).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (1)');
  }

  it('un nouveau bénéficiaire affiche Dû/Reçu/Reste et le statut « En attente »', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour({ contributionAmount: 25_000 });
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await addBeneficiary(user);
    const beneficiariesCard = screen.getByText('Bénéficiaires du Tour (1)').closest('[class*="rounded"]') as HTMLElement;
    const row = within(beneficiariesCard).getByText('Fatou Ndiaye').closest('tr')!;
    expect(within(row).getByText('En attente')).toBeInTheDocument();
  });

  it('CAS 1→3 : « Régler » avec le montant proposé (le reste) règle intégralement — le statut passe à « Réglé »', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour({ contributionAmount: 25_000 });
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await addBeneficiary(user);
    const beneficiariesCard = screen.getByText('Bénéficiaires du Tour (1)').closest('[class*="rounded"]') as HTMLElement;
    const row = within(beneficiariesCard).getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('Bénéficiaire : Fatou Ndiaye')).toBeInTheDocument();
    expect((dialog.getByLabelText('Montant à régler') as HTMLInputElement).value).toBe('25000'); // proposé par défaut = le reste dû
    await user.click(dialog.getByRole('button', { name: 'Confirmer' }));

    const updatedRow = within(beneficiariesCard).getByText('Fatou Ndiaye').closest('tr')!;
    expect(await within(updatedRow).findByText('Réglé')).toBeInTheDocument();
  });

  it('CAS 2 : un règlement PARTIEL (montant réduit dans le dialog) passe le statut à « Partiellement réglé », jamais « Réglé »', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour({ contributionAmount: 25_000 });
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await addBeneficiary(user);
    const beneficiariesCard = screen.getByText('Bénéficiaires du Tour (1)').closest('[class*="rounded"]') as HTMLElement;
    const row = within(beneficiariesCard).getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }));

    const dialog = within(await screen.findByRole('dialog'));
    const amountInput = dialog.getByLabelText('Montant à régler') as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, '10000');
    await user.click(dialog.getByRole('button', { name: 'Confirmer' }));

    const updatedRow = within(beneficiariesCard).getByText('Fatou Ndiaye').closest('tr')!;
    expect(await within(updatedRow).findByText('Partiellement réglé')).toBeInTheDocument();
    expect(within(updatedRow).queryByText('Réglé')).not.toBeInTheDocument();
  });

  it('un bénéficiaire déjà intégralement réglé ne propose plus « Régler » (jamais de double paiement)', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour({ contributionAmount: 25_000 });
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await addBeneficiary(user);
    const beneficiariesCard = screen.getByText('Bénéficiaires du Tour (1)').closest('[class*="rounded"]') as HTMLElement;
    const row = within(beneficiariesCard).getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Confirmer' }));

    const updatedRow = within(beneficiariesCard).getByText('Fatou Ndiaye').closest('tr')!;
    await within(updatedRow).findByText('Réglé');
    // Une fois intégralement réglé : plus rien à régler, plus rien à retirer (immuabilité d'un paiement réel) — aucun menu Actions n'est même proposé.
    expect(within(updatedRow).queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
  });
});

describe('Espace de travail du Tour — Header (breadcrumb, statistiques)', () => {
  it('affiche le fil d’Ariane Tontines > Tontine > Tour #N et les statistiques dynamiques du header', async () => {
    const { tontineId, occurrenceId } = await setupWithPurchaseTour({ contributionAmount: 40_000 });
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByRole('navigation', { name: 'breadcrumb' });
    expect(screen.getByText('Tour #1')).toBeInTheDocument();
    expect(screen.getByText('Montant de cotisation')).toBeInTheDocument();
    expect(screen.getByText('Collecté')).toBeInTheDocument();
    expect(screen.getByText('À collecter')).toBeInTheDocument();
  });
});

describe('Espace de travail du Tour — Montant d’achat par bénéficiaire (mandat « montant d’achat + somme des achats »)', () => {
  async function setupThreeBeneficiaryTour() {
    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Tontine Achat ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
      contributionAmount: 50_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true,
    } as never);
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01'); // Fatou Ndiaye
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-01-01'); // Cheikh Diop
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-01-01'); // Modou Faye
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-06-01');
    return { tontineId: tontine!.id, occurrenceId: occurrence!.id };
  }

  function beneficiariesCard() {
    return screen.getByText(/Bénéficiaires du Tour \(\d+\)/).closest('[class*="rounded"]') as HTMLElement;
  }

  /** Ajoute des bénéficiaires en une action batch, puis attend que le TOTAL du panneau reflète bien `expectedTotal` (jamais le nombre ajouté dans CETTE action, qui peut s'additionner à des bénéficiaires déjà présents — CAS 5). */
  async function addBeneficiaries(user: ReturnType<typeof userEvent.setup>, names: string[], expectedTotal: number) {
    for (const name of names) await user.click(within(screen.getByText(name).closest('tr')!).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText(`Bénéficiaires du Tour (${expectedTotal})`);
  }

  async function settle(user: ReturnType<typeof userEvent.setup>, memberName: string, purchaseAmount: number) {
    const row = within(beneficiariesCard()).getByText(memberName).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }));
    const dialog = within(await screen.findByRole('dialog'));
    const purchaseInput = dialog.getByLabelText('Montant achat') as HTMLInputElement;
    await user.clear(purchaseInput);
    await user.type(purchaseInput, String(purchaseAmount));
    await user.click(dialog.getByRole('button', { name: 'Confirmer' }));
    // Le règlement utilise le montant proposé par défaut (le reste dû, intégral) → le statut passe à « Réglé », signal fiable que la mutation a été appliquée.
    await within(within(beneficiariesCard()).getByText(memberName).closest('tr')!).findByText('Réglé');
  }

  it('CAS 1 — un bénéficiaire : la colonne Achat affiche son montant, et la Somme achats l’égale', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupThreeBeneficiaryTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await addBeneficiaries(user, ['Fatou Ndiaye'], 1);
    await settle(user, 'Fatou Ndiaye', 50_000);
    expect(screen.getByText('Somme achats')).toBeInTheDocument();
    const summary = screen.getByText('Somme achats').closest('div')!;
    expect(within(summary).getByText(/50.?000/)).toBeInTheDocument();
  });

  it('CAS 2 — trois bénéficiaires avec le même montant d’achat : la Somme achats = 150 000', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupThreeBeneficiaryTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await addBeneficiaries(user, ['Fatou Ndiaye', 'Cheikh Diop', 'Modou Faye'], 3);
    await settle(user, 'Fatou Ndiaye', 50_000);
    await settle(user, 'Cheikh Diop', 50_000);
    await settle(user, 'Modou Faye', 50_000);
    const summary = screen.getByText('Somme achats').closest('div')!;
    expect(within(summary).getByText(/150.?000/)).toBeInTheDocument();
  });

  it('CAS 3 — montants d’achat différents par bénéficiaire : la Somme achats est bien la SOMME, jamais N × un montant fixe', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupThreeBeneficiaryTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await addBeneficiaries(user, ['Fatou Ndiaye', 'Cheikh Diop', 'Modou Faye'], 3);
    await settle(user, 'Fatou Ndiaye', 50_000);
    await settle(user, 'Cheikh Diop', 30_000);
    await settle(user, 'Modou Faye', 70_000);
    const summary = screen.getByText('Somme achats').closest('div')!;
    expect(within(summary).getByText(/150.?000/)).toBeInTheDocument();
  });

  it('CAS 4 — suppression d’un bénéficiaire non encore réglé : la Somme achats reste celle des bénéficiaires effectivement réglés', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupThreeBeneficiaryTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await addBeneficiaries(user, ['Fatou Ndiaye', 'Cheikh Diop', 'Modou Faye'], 3);
    await settle(user, 'Fatou Ndiaye', 50_000);
    await settle(user, 'Cheikh Diop', 50_000);
    // Modou Faye reste NON réglé (retrait autorisé uniquement si amountPaid === 0) → sa suppression ne doit rien changer à la Somme achats.
    const row = within(beneficiariesCard()).getByText('Modou Faye').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Retirer ce bénéficiaire' }));
    await screen.findByText('Bénéficiaires du Tour (2)');
    const summary = screen.getByText('Somme achats').closest('div')!;
    expect(within(summary).getByText(/100.?000/)).toBeInTheDocument();
  });

  it('CAS 5 — ajout d’un bénéficiaire supplémentaire après coup : la Somme achats se met à jour sans reload complet', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupThreeBeneficiaryTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await addBeneficiaries(user, ['Fatou Ndiaye', 'Cheikh Diop'], 2);
    await settle(user, 'Fatou Ndiaye', 50_000);
    await settle(user, 'Cheikh Diop', 50_000);
    let summary = screen.getByText('Somme achats').closest('div')!;
    expect(within(summary).getByText(/100.?000/)).toBeInTheDocument();
    await addBeneficiaries(user, ['Modou Faye'], 3);
    await settle(user, 'Modou Faye', 50_000);
    summary = screen.getByText('Somme achats').closest('div')!;
    expect(within(summary).getByText(/150.?000/)).toBeInTheDocument();
  });

  it('CAS 6 — représentations multiples du même membre : deux lignes indépendantes, chacune avec son propre montant d’achat, jamais fusionnées', async () => {
    const user = userEvent.setup();
    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Tontine Représentations ${Date.now()}`, valueType: 'MONEY', contributionAmount: 50_000,
      frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true,
    } as never);
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01'); // même memberId, seconde représentation
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-06-01');
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionA!.id, 50_000);
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionB!.id, 50_000);
    renderOccurrence(tontine!.id, occurrence!.id);
    await screen.findByText('Bénéficiaires du Tour (2)');
    const rowsBefore = within(beneficiariesCard()).getAllByText('Fatou Ndiaye').map((el) => el.closest('tr')!);
    expect(rowsBefore).toHaveLength(2); // deux lignes distinctes, jamais fusionnées par memberId

    // Règle la PREMIÈRE représentation.
    await user.click(within(rowsBefore[0]).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }));
    let dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText('Montant achat'), '50000');
    await user.click(dialog.getByRole('button', { name: 'Confirmer' }));

    // Après le premier règlement, une seule des deux lignes est « Réglé » ; l'autre reste réglable indépendamment.
    const secondRow = await within(beneficiariesCard()).findAllByText('Fatou Ndiaye').then((els) => els.map((el) => el.closest('tr')!).find((tr) => !tr.textContent?.includes('Réglé')));
    expect(secondRow).toBeTruthy();
    await user.click(within(secondRow!).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }));
    dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText('Montant achat'), '50000');
    await user.click(dialog.getByRole('button', { name: 'Confirmer' }));

    const summary = await screen.findByText('Somme achats');
    expect(within(summary.closest('div')!).getByText(/100.?000/)).toBeInTheDocument();
  });

  it('CAS 7 — Tontine SANS achat : ni colonne Achat, ni « Somme achats » — aucun montant d’achat fictif', async () => {
    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Tontine Sans Achat ${Date.now()}`, valueType: 'MONEY', contributionAmount: 50_000,
      frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: false,
    } as never);
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-06-01');
    renderOccurrence(tontine!.id, occurrence!.id);
    await screen.findByText('Synthèse');
    expect(screen.queryByText('Somme achats')).not.toBeInTheDocument();
    expect(screen.queryByText('Montant achat')).not.toBeInTheDocument();
  });

  /**
   * Colonne « # » (rang de l'ordre de passage) du panneau Cotisations —
   * SANS ACHAT uniquement (`TontineBeneficiaryPlan.position`, mandat « le
   * Compte comme point d'entrée des Transactions » n'a pas touché ceci ;
   * mandat « ordre vs sélection » du 2026-09-23). Une Tontine AVEC ACHAT n'a
   * jamais d'ordre prédéfini : la colonne doit disparaître entièrement,
   * jamais un « — » à sa place.
   */
  it('la colonne « # » du panneau Cotisations est présente pour une Tontine SANS achat (ordre de passage)', async () => {
    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Tontine Sans Achat Rang ${Date.now()}`, valueType: 'MONEY', contributionAmount: 50_000,
      frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: false,
    } as never);
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-06-01');
    renderOccurrence(tontine!.id, occurrence!.id);
    const table = (await screen.findAllByRole('table'))[0];
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)[0]).toBe('#');
  });

  it('la colonne « # » du panneau Cotisations est ABSENTE pour une Tontine AVEC achat (aucun ordre prédéfini)', async () => {
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    const purchaseTable = (await screen.findAllByRole('table'))[0];
    expect(within(purchaseTable).getAllByRole('columnheader').map((cell) => cell.textContent)).not.toContain('#');
  });
});

/**
 * Tours > Cotisations — sélection SÉQUENTIELLE des bénéficiaires, SANS ACHAT
 * uniquement (mandat « sélection séquentielle des bénéficiaires »,
 * 2026-09-23) : l'ordre défini dans l'onglet Adhérents (le Plan) est la
 * source de vérité, une position N n'est cochable que si les positions
 * 1..N-1 sont déjà bénéficiaires du Tour, et décocher une position retire en
 * cascade toutes les positions suivantes déjà sélectionnées.
 */
describe('Espace de travail du Tour — Cotisations SANS ACHAT : sélection séquentielle des bénéficiaires', () => {
  /** Le panneau Bénéficiaires réutilise le même libellé « Sélectionner » (retrait) — toutes les requêtes de checkbox de sélection ci-dessous sont donc scopées au tableau Cotisations (le premier de la page), jamais globales. */
  async function contributionsTable(): Promise<HTMLElement> {
    await screen.findByText('Cotisations des adhérents (4)');
    return (await screen.findAllByRole('table'))[0];
  }
  /** Ligne d'un adhérent dans le tableau Cotisations, identifiée par son nom (unique dans ce tableau). */
  function row(table: HTMLElement, name: string): HTMLElement { return within(table).getByText(name).closest('tr')!; }
  /** État de la case de sélection d'une ligne : `'locked'` (icône cadenas, aucune checkbox), ou l'état coché/décoché de la checkbox (Radix `<button role="checkbox" aria-checked>`, jamais un `<input>` natif). */
  function selectState(table: HTMLElement, name: string): 'locked' | boolean {
    const r = row(table, name);
    if (within(r).queryByLabelText('Position verrouillée')) return 'locked';
    return within(r).getByRole('checkbox').getAttribute('aria-checked') === 'true';
  }

  it('TEST 1 — à l’ouverture, seule la position suivant celle déjà bénéficiaire (Fatou, auto-consommée) est cochable ; les suivantes sont verrouillées', async () => {
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    const table = await contributionsTable();
    expect(screen.getByLabelText('Marquer Fatou Ndiaye comme réglé')).toBeInTheDocument(); // déjà bénéficiaire (position 1, auto-consommée à l'ouverture)
    expect(selectState(table, 'Fatou Ndiaye')).toBe(true); // déjà bénéficiaire — checkbox cochée, désactivée
    expect(selectState(table, 'Modou Faye')).toBe(false); // position 2 — seule position déverrouillée, pas encore cochée
    expect(selectState(table, 'Cheikh Diop')).toBe('locked');
    expect(selectState(table, 'Coumba Thiam')).toBe('locked');
  });

  it('TEST 2/3/4 — cocher B déverrouille C ; impossible de cocher C avant B ; cocher A+B+C déverrouille D', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    const table = await contributionsTable();

    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));
    expect(selectState(table, 'Cheikh Diop')).toBe(false); // déverrouillée par la sélection de Modou
    expect(selectState(table, 'Coumba Thiam')).toBe('locked'); // TEST 4 : toujours impossible de la sélectionner avant Cheikh

    await user.click(within(row(table, 'Cheikh Diop')).getByRole('checkbox'));
    expect(selectState(table, 'Coumba Thiam')).toBe(false); // déverrouillée à son tour

    await user.click(within(row(table, 'Coumba Thiam')).getByRole('checkbox'));
    expect(selectState(table, 'Coumba Thiam')).toBe(true);
  });

  it('TEST 5 — sélectionner A+B+C puis « Ajouter » crée 3 bénéficiaires pour CE Tour, dans l’ordre du Plan (plusieurs bénéficiaires par Tour, sans achat)', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    const table = await contributionsTable();
    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));
    await user.click(within(row(table, 'Cheikh Diop')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));

    const beneficiariesCard = (await screen.findByText('Bénéficiaires du Tour (3)')).closest('[class*="rounded"]') as HTMLElement;
    expect(within(beneficiariesCard).getByText('Fatou Ndiaye')).toBeInTheDocument();
    expect(within(beneficiariesCard).getByText('Modou Faye')).toBeInTheDocument();
    expect(within(beneficiariesCard).getByText('Cheikh Diop')).toBeInTheDocument();
  });

  it('TEST 6 — décocher B retire aussi C de la sélection (jamais de trou) ; C et D redeviennent verrouillés', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    const table = await contributionsTable();
    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));
    await user.click(within(row(table, 'Cheikh Diop')).getByRole('checkbox'));
    expect(selectState(table, 'Modou Faye')).toBe(true);
    expect(selectState(table, 'Cheikh Diop')).toBe(true);

    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));

    expect(selectState(table, 'Modou Faye')).toBe(false); // reste cochable, mais décochée
    expect(selectState(table, 'Cheikh Diop')).toBe('locked'); // retiré en cascade, de nouveau verrouillé
    expect(selectState(table, 'Coumba Thiam')).toBe('locked');
  });

  it('TEST 7 — l’ordre du panneau Cotisations reste 1→2→3→4 après sélection/désélection', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    const table = await contributionsTable();
    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));
    const knownNames = ['Fatou Ndiaye', 'Modou Faye', 'Cheikh Diop', 'Coumba Thiam'];
    const rows = within(table).getAllByRole('row').slice(1); // hors en-tête
    // `.textContent` inclut les initiales de l'avatar (ex. « FNFatou Ndiaye ») — recherche par sous-chaîne, jamais une égalité stricte.
    const names = rows.map((r) => knownNames.find((n) => r.textContent?.includes(n)));
    expect(names).toEqual(knownNames);
  });

  /**
   * DENY : « Tout sélectionner » a été retiré (mandat « sélection individuelle
   * des bénéficiaires », 2026-09-23) — le nombre de bénéficiaires d'un Tour
   * reste volontairement faible (1 à 3 en pratique), la sélection reste
   * explicite adhérent par adhérent, jamais un contrôle global. Les checkbox
   * individuelles, elles, restent pleinement fonctionnelles.
   */
  it('DENY : aucun contrôle « Tout sélectionner » n’est proposé — seules les checkbox individuelles existent', async () => {
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    await contributionsTable();
    expect(screen.queryByText(/Tout sélectionner/)).not.toBeInTheDocument();
  });
});

/**
 * Retrait d'un bénéficiaire, SANS ACHAT — retrait EN CASCADE (mandat « retrait
 * en cascade », 2026-09-23) : les bénéficiaires du Tour forment toujours un
 * préfixe continu de l'ordre maître (Adhérents) — retirer la position N
 * retire aussi toutes les positions > N déjà bénéficiaires de ce Tour, sans
 * jamais modifier l'ordre maître (numéros de position inchangés).
 */
describe('Espace de travail du Tour — Cotisations SANS ACHAT : retrait en cascade d’un bénéficiaire', () => {
  async function contributionsTable(): Promise<HTMLElement> {
    await screen.findByText('Cotisations des adhérents (4)');
    return (await screen.findAllByRole('table'))[0];
  }
  function row(table: HTMLElement, name: string): HTMLElement { return within(table).getByText(name).closest('tr')!; }
  function selectState(table: HTMLElement, name: string): 'locked' | boolean {
    const r = row(table, name);
    if (within(r).queryByLabelText('Position verrouillée')) return 'locked';
    return within(r).getByRole('checkbox').getAttribute('aria-checked') === 'true';
  }
  async function removeBeneficiary(user: ReturnType<typeof userEvent.setup>, name: string) {
    const beneficiariesCard = (await screen.findByText(/Bénéficiaires du Tour/)).closest('[class*="rounded"]') as HTMLElement;
    const beneficiaryRow = within(beneficiariesCard).getByText(name).closest('tr')!;
    await user.click(within(beneficiaryRow).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Retirer ce bénéficiaire' }));
  }

  /** TEST 1/2 — A+B+C sélectionnés puis « Ajouter » ; retirer B retire aussi C en cascade, jamais un trou (A reste, B ET C redeviennent la prochaine position sélectionnable est B). */
  it('TEST 1/2 — retirer B (position 2) retire aussi C (position 3) en cascade ; A reste bénéficiaire ; B redevient la prochaine position sélectionnable', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    const table = await contributionsTable();
    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));
    await user.click(within(row(table, 'Cheikh Diop')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (3)');

    await removeBeneficiary(user, 'Modou Faye');

    await screen.findByText('Bénéficiaires du Tour (1)'); // seule Fatou (position 1) reste bénéficiaire
    expect(selectState(table, 'Fatou Ndiaye')).toBe(true);
    expect(selectState(table, 'Modou Faye')).toBe(false); // prochaine position sélectionnable
    expect(selectState(table, 'Cheikh Diop')).toBe('locked'); // retiré en cascade, de nouveau verrouillé
    expect(selectState(table, 'Coumba Thiam')).toBe('locked');
    const beneficiariesCard = (await screen.findByText('Bénéficiaires du Tour (1)')).closest('[class*="rounded"]') as HTMLElement;
    expect(within(beneficiariesCard).queryByText('Cheikh Diop')).not.toBeInTheDocument();
  });

  it('TEST 3/4 — après retrait de B, resélectionner B puis C restaure la séquence complète', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    const table = await contributionsTable();
    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));
    await user.click(within(row(table, 'Cheikh Diop')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (3)');
    await removeBeneficiary(user, 'Modou Faye');
    await screen.findByText('Bénéficiaires du Tour (1)');

    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));
    expect(selectState(table, 'Cheikh Diop')).toBe(false); // de nouveau déverrouillée

    await user.click(within(row(table, 'Cheikh Diop')).getByRole('checkbox'));
    expect(selectState(table, 'Coumba Thiam')).toBe(false); // séquence restaurée jusqu'à la position suivante
  });

  it('TEST 5 — retirer A (position 1) retire aussi B et C en cascade ; A redevient la prochaine position sélectionnable', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    const table = await contributionsTable();
    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));
    await user.click(within(row(table, 'Cheikh Diop')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (3)');

    await removeBeneficiary(user, 'Fatou Ndiaye');

    await screen.findByText('Bénéficiaires du Tour (0)');
    expect(selectState(table, 'Fatou Ndiaye')).toBe(false); // prochaine position sélectionnable
    expect(selectState(table, 'Modou Faye')).toBe('locked');
    expect(selectState(table, 'Cheikh Diop')).toBe('locked');
    expect(selectState(table, 'Coumba Thiam')).toBe('locked');
  });

  it('TEST 6 — retirer C (position 3) dans A+B+C+D ne retire que C et D en cascade ; A et B restent bénéficiaires', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    const table = await contributionsTable();
    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));
    await user.click(within(row(table, 'Cheikh Diop')).getByRole('checkbox'));
    await user.click(within(row(table, 'Coumba Thiam')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (4)');

    await removeBeneficiary(user, 'Cheikh Diop');

    await screen.findByText('Bénéficiaires du Tour (2)'); // Fatou + Modou restent
    expect(selectState(table, 'Fatou Ndiaye')).toBe(true);
    expect(selectState(table, 'Modou Faye')).toBe(true);
    expect(selectState(table, 'Cheikh Diop')).toBe(false); // prochaine position sélectionnable
    expect(selectState(table, 'Coumba Thiam')).toBe('locked');
  });

  it('TEST 7 — l’ordre maître de l’onglet Adhérents reste intact après un retrait en cascade', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    const table = await contributionsTable();
    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (2)');
    await removeBeneficiary(user, 'Modou Faye');
    await screen.findByText('Bénéficiaires du Tour (1)');

    const plans = await tontineOperationsService.listPlans('T-001', tontineId);
    const memberNameByAdhesionId = new Map<string, string>();
    for (const plan of plans) {
      const adhesion = await tontinesService.getAdhesion('T-001', plan.adhesionId);
      memberNameByAdhesionId.set(plan.adhesionId, adhesion!.memberName);
    }
    const orderedNames = [...plans].sort((a, b) => a.position - b.position).map((p) => memberNameByAdhesionId.get(p.adhesionId));
    expect(orderedNames).toEqual(['Fatou Ndiaye', 'Modou Faye', 'Cheikh Diop', 'Coumba Thiam']);
    expect(plans.map((p) => p.position).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]); // numéros de position inchangés
  });

  it('un bénéficiaire déjà réglé bloque tout le retrait en cascade — immuabilité d’un versement effectué', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupSansAchatTour();
    renderOccurrence(tontineId, occurrenceId);
    const table = await contributionsTable();
    await user.click(within(row(table, 'Modou Faye')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (2)');

    // Règle Modou (position 2) intégralement.
    const beneficiariesCard = (await screen.findByText('Bénéficiaires du Tour (2)')).closest('[class*="rounded"]') as HTMLElement;
    const modouRow = within(beneficiariesCard).getByText('Modou Faye').closest('tr')!;
    await user.click(within(modouRow).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Confirmer' }));
    await screen.findByText('Réglé');

    // Retirer Fatou (position 1) retirerait aussi Modou (position 2, > 1) — déjà réglé : refus total.
    await removeBeneficiary(user, 'Fatou Ndiaye');
    expect(await tontineOperationsService.listBeneficiaries('T-001', occurrenceId)).toHaveLength(2); // rien n'a été retiré côté service
    await screen.findByText('Bénéficiaires du Tour (2)'); // ni côté UI
  });
});

/**
 * SANS ACHAT — historique des bénéficiaires ENTRE Tours (mandat « historique
 * des bénéficiaires entre Tours », 2026-09-23) : un adhérent déjà bénéficiaire
 * d'un Tour précédent reste visible à sa position (jamais renuméroté, jamais
 * retiré de la liste) mais devient définitivement verrouillé dans les Tours
 * suivants — distinct du verrou « séquence du Tour courant pas encore
 * atteinte ». Le prochain bénéficiaire disponible est le premier adhérent de
 * l'ordre maître qui n'a JAMAIS encore été bénéficiaire, tous Tours confondus.
 */
describe('Espace de travail du Tour — Cotisations SANS ACHAT : historique des bénéficiaires entre Tours', () => {
  function row(table: HTMLElement, name: string): HTMLElement { return within(table).getByText(name).closest('tr')!; }
  function selectState(table: HTMLElement, name: string): 'locked-history' | 'locked-sequence' | boolean {
    const r = row(table, name);
    if (within(r).queryByLabelText('Déjà bénéficiaire d’un tour précédent')) return 'locked-history';
    if (within(r).queryByLabelText('Position verrouillée')) return 'locked-sequence';
    return within(r).getByRole('checkbox').getAttribute('aria-checked') === 'true';
  }

  /** Tontine à 4 adhérents (A→B→C→D), Tour 1 déjà validé avec les bénéficiaires donnés (via le service, mise en place rapide), Tour 2 fraîchement créé. */
  async function setupWithHistory(tour1Names: ('Fatou Ndiaye' | 'Modou Faye' | 'Cheikh Diop' | 'Coumba Thiam')[]) {
    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Tontine Sans Achat Historique ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
      contributionAmount: 50_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: false,
    } as never);
    const byName: Record<string, string> = {};
    const fatou = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01'); byName['Fatou Ndiaye'] = fatou!.id;
    const modou = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-01-01'); byName['Modou Faye'] = modou!.id;
    const cheikh = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-01-01'); byName['Cheikh Diop'] = cheikh!.id;
    const coumba = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-018', '2026-01-01'); byName['Coumba Thiam'] = coumba!.id;
    await tontineOperationsService.addPlanEntries('T-001', tontine!.id, [fatou!.id, modou!.id, cheikh!.id, coumba!.id]);
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-06-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence1!.id, tour1Names.map((name) => byName[name]));
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-07-01');
    return { tontineId: tontine!.id, occurrence1Id: occurrence1!.id, occurrence2Id: occurrence2!.id };
  }

  it('TEST 1 — Tour 1 = A+B : au Tour 2, A et B sont verrouillés « historique », C est disponible, D reste verrouillé par la séquence', async () => {
    const { tontineId, occurrence2Id } = await setupWithHistory(['Fatou Ndiaye', 'Modou Faye']);
    renderOccurrence(tontineId, occurrence2Id);
    await screen.findByText('Cotisations des adhérents (4)');
    const table = (await screen.findAllByRole('table'))[0];
    expect(selectState(table, 'Fatou Ndiaye')).toBe('locked-history');
    expect(selectState(table, 'Modou Faye')).toBe('locked-history');
    expect(selectState(table, 'Cheikh Diop')).toBe(false); // disponible
    expect(selectState(table, 'Coumba Thiam')).toBe('locked-sequence'); // séquence du Tour courant pas encore atteinte, PAS un historique
  });

  it('TEST 2 — après sélection de C au Tour 2, le Tour 3 verrouille A, B et C ; D devient disponible', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrence2Id } = await setupWithHistory(['Fatou Ndiaye', 'Modou Faye']);
    const firstRender = renderOccurrence(tontineId, occurrence2Id);
    const table = (await screen.findAllByRole('table'))[0];
    // Attend que la case de Cheikh se déverrouille (la requête `cycleBeneficiaryAdhesionIds` — historique inter-Tours — peut résoudre après le premier rendu du tableau).
    const cheikhCheckbox = await within(row(table, 'Cheikh Diop')).findByRole('checkbox');
    await user.click(cheikhCheckbox);
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (1)');
    firstRender.unmount();

    const occurrence3 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-08-01');
    renderOccurrence(tontineId, occurrence3!.id);
    await screen.findByText('Cotisations des adhérents (4)');
    const table3 = (await screen.findAllByRole('table'))[0];
    expect(selectState(table3, 'Fatou Ndiaye')).toBe('locked-history');
    expect(selectState(table3, 'Modou Faye')).toBe('locked-history');
    expect(selectState(table3, 'Cheikh Diop')).toBe('locked-history');
    expect(selectState(table3, 'Coumba Thiam')).toBe(false); // disponible
  });

  it('TEST 3 — Tour 1 = A+B+C : au Tour 2, A/B/C verrouillés « historique », D disponible', async () => {
    const { tontineId, occurrence2Id } = await setupWithHistory(['Fatou Ndiaye', 'Modou Faye', 'Cheikh Diop']);
    renderOccurrence(tontineId, occurrence2Id);
    await screen.findByText('Cotisations des adhérents (4)');
    const table = (await screen.findAllByRole('table'))[0];
    expect(selectState(table, 'Fatou Ndiaye')).toBe('locked-history');
    expect(selectState(table, 'Modou Faye')).toBe('locked-history');
    expect(selectState(table, 'Cheikh Diop')).toBe('locked-history');
    expect(selectState(table, 'Coumba Thiam')).toBe(false); // disponible
  });

  it('TEST 4 — un historique déjà bénéficiaire ne peut pas être re-sélectionné, même en cliquant directement sa checkbox/ligne (verrouillage serveur, jamais uniquement côté UI)', async () => {
    const { tontineId, occurrence2Id } = await setupWithHistory(['Fatou Ndiaye']);
    // Aucune checkbox n'est rendue pour Fatou (verrouillée) — tentative directe côté service, doit être refusée quel que soit le contournement UI.
    const fatouId = (await tontineOperationsService.listCycleBeneficiaryAdhesionIds('T-001', tontineId))[0];
    const result = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence2Id, [fatouId]);
    expect(result?.added).toEqual([]);
    expect(result?.skipped).toBe(1);
  });

  it('TEST 6 — l’ordre maître de l’onglet Adhérents (Plan) reste inchangé après plusieurs Tours avec historique', async () => {
    const { tontineId } = await setupWithHistory(['Fatou Ndiaye', 'Modou Faye']);
    const plans = await tontineOperationsService.listPlans('T-001', tontineId);
    const memberNameByAdhesionId = new Map<string, string>();
    for (const plan of plans) {
      const adhesion = await tontinesService.getAdhesion('T-001', plan.adhesionId);
      memberNameByAdhesionId.set(plan.adhesionId, adhesion!.memberName);
    }
    const orderedNames = [...plans].sort((a, b) => a.position - b.position).map((p) => memberNameByAdhesionId.get(p.adhesionId));
    expect(orderedNames).toEqual(['Fatou Ndiaye', 'Modou Faye', 'Cheikh Diop', 'Coumba Thiam']);
    expect(plans.map((p) => p.position).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });
});

/**
 * Panneau « Bénéficiaires du Tour » — colonne « # », SANS ACHAT uniquement
 * (mandat « # = rang d'origine dans Adhérents », 2026-09-23) : régression où
 * le « # » affichait `index + 1` dans `beneficiaries[]` (ordre d'ajout au
 * Tour) au lieu du rang RÉEL de l'adhérent dans l'ordre maître Adhérents
 * (`TontineBeneficiaryPlan.position`), permanent et indépendant du Tour.
 */
describe('Espace de travail du Tour — Bénéficiaires SANS ACHAT : « # » = rang d’origine dans Adhérents', () => {
  /** Tontine à 4 adhérents A(1)→B(2)→C(3)→D(4), Tour 1 déjà validé avec les bénéficiaires donnés, Tour 2 fraîchement créé — sert de base à chaque test ci-dessous. */
  async function setupTour2(tour1Names: ('Fatou Ndiaye' | 'Modou Faye' | 'Cheikh Diop' | 'Coumba Thiam')[]) {
    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Tontine Sans Achat Rang Bénéficiaires ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
      contributionAmount: 50_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: false,
    } as never);
    const byName: Record<string, string> = {};
    const fatou = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01'); byName['Fatou Ndiaye'] = fatou!.id; // A, position 1
    const modou = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-01-01'); byName['Modou Faye'] = modou!.id; // B, position 2
    const cheikh = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-01-01'); byName['Cheikh Diop'] = cheikh!.id; // C, position 3
    const coumba = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-018', '2026-01-01'); byName['Coumba Thiam'] = coumba!.id; // D, position 4
    await tontineOperationsService.addPlanEntries('T-001', tontine!.id, [fatou!.id, modou!.id, cheikh!.id, coumba!.id]);
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-06-01');
    if (tour1Names.length > 0) await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence1!.id, tour1Names.map((name) => byName[name]));
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-07-01');
    return { tontineId: tontine!.id, occurrence2Id: occurrence2!.id, byName };
  }
  const KNOWN_NAMES = ['Fatou Ndiaye', 'Modou Faye', 'Cheikh Diop', 'Coumba Thiam'];
  /** Lignes du panneau Bénéficiaires (hors en-tête) : `[# affiché, nom]`, dans l'ordre d'affichage réel. `.textContent` inclut les initiales de l'avatar (ex. « MFModou Faye ») — recherche par sous-chaîne, jamais une égalité stricte. */
  async function beneficiaryRows(): Promise<[string, string][]> {
    const card = (await screen.findByText(/Bénéficiaires du Tour/)).closest('[class*="rounded"]') as HTMLElement;
    const table = within(card).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    return rows.map((r) => {
      const cells = within(r).getAllByRole('cell');
      const name = KNOWN_NAMES.find((n) => cells[1].textContent?.includes(n)) ?? cells[1].textContent ?? '';
      return [cells[0].textContent ?? '', name];
    });
  }

  it('TEST 1 — Tour 1 = A+B, Tour 2 = C (position 3) : le panneau affiche « 3 | Cheikh Diop », jamais « 1 »', async () => {
    const user = userEvent.setup();
    // B (Modou) déjà bénéficiaire du Tour 1 (historique) — C devient donc la SEULE position sélectionnable au Tour 2, sans violer la séquence déjà en place (mandat « sélection séquentielle », inchangé).
    const { tontineId, occurrence2Id } = await setupTour2(['Fatou Ndiaye', 'Modou Faye']);
    renderOccurrence(tontineId, occurrence2Id);
    await screen.findByText('Cotisations des adhérents (4)');
    const table = (await screen.findAllByRole('table'))[0];
    const cheikhCheckbox = await within(within(table).getByText('Cheikh Diop').closest('tr')!).findByRole('checkbox');
    await user.click(cheikhCheckbox);
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (1)');
    expect(await beneficiaryRows()).toEqual([['3', 'Cheikh Diop']]);
  });

  it('TEST 2/3 — sélection B puis D dans le même lot « Ajouter » : affichage trié par rang (2, 3, 4), jamais par ordre de clic', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrence2Id } = await setupTour2(['Fatou Ndiaye']);
    renderOccurrence(tontineId, occurrence2Id);
    await screen.findByText('Cotisations des adhérents (4)');
    const table = (await screen.findAllByRole('table'))[0];
    // B (position 2) doit être coché avant D (position 4) à cause du verrouillage séquentiel déjà en place — mais les deux sont ajoutés dans le MÊME lot « Ajouter », donc aucun des deux n'est « ajouté avant l'autre » au sens métier : seul le rang détermine l'affichage.
    await user.click(await within(within(table).getByText('Modou Faye').closest('tr')!).findByRole('checkbox'));
    await user.click(await within(within(table).getByText('Cheikh Diop').closest('tr')!).findByRole('checkbox'));
    await user.click(await within(within(table).getByText('Coumba Thiam').closest('tr')!).findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (3)');
    expect(await beneficiaryRows()).toEqual([['2', 'Modou Faye'], ['3', 'Cheikh Diop'], ['4', 'Coumba Thiam']]);
  });

  it('TEST 4 — retirer Coumba (position 4, la plus haute du Tour) : Modou et Cheikh conservent leurs rangs « 2 » et « 3 », jamais renumérotés', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrence2Id } = await setupTour2(['Fatou Ndiaye']);
    renderOccurrence(tontineId, occurrence2Id);
    await screen.findByText('Cotisations des adhérents (4)');
    const table = (await screen.findAllByRole('table'))[0];
    await user.click(await within(within(table).getByText('Modou Faye').closest('tr')!).findByRole('checkbox'));
    await user.click(await within(within(table).getByText('Cheikh Diop').closest('tr')!).findByRole('checkbox'));
    await user.click(await within(within(table).getByText('Coumba Thiam').closest('tr')!).findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (3)');
    expect(await beneficiaryRows()).toEqual([['2', 'Modou Faye'], ['3', 'Cheikh Diop'], ['4', 'Coumba Thiam']]);

    // Retire la position la plus haute (Coumba, 4) — aucune cascade nécessaire, aucune position supérieure à retirer.
    const card = (await screen.findByText('Bénéficiaires du Tour (3)')).closest('[class*="rounded"]') as HTMLElement;
    await user.click(within(within(card).getByText('Coumba Thiam').closest('tr')!).getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Retirer ce bénéficiaire' }));
    await screen.findByText('Bénéficiaires du Tour (2)');
    // Modou et Cheikh gardent leurs rangs d'origine — jamais renumérotés en 1/2 parce que Coumba a disparu de la liste.
    expect(await beneficiaryRows()).toEqual([['2', 'Modou Faye'], ['3', 'Cheikh Diop']]);
  });

  it('TEST 5 — l’ordre maître de l’onglet Adhérents reste 1/2/3/4 après ces opérations', async () => {
    const { tontineId } = await setupTour2(['Fatou Ndiaye']);
    const plans = await tontineOperationsService.listPlans('T-001', tontineId);
    const memberNameByAdhesionId = new Map<string, string>();
    for (const plan of plans) {
      const adhesion = await tontinesService.getAdhesion('T-001', plan.adhesionId);
      memberNameByAdhesionId.set(plan.adhesionId, adhesion!.memberName);
    }
    const orderedNames = [...plans].sort((a, b) => a.position - b.position).map((p) => memberNameByAdhesionId.get(p.adhesionId));
    expect(orderedNames).toEqual(['Fatou Ndiaye', 'Modou Faye', 'Cheikh Diop', 'Coumba Thiam']);
  });
});

/**
 * AVEC ACHAT — verrouillage historique au niveau de la PARTICIPATION (jamais
 * de l'adhérent) + numérotation globale et continue des bénéficiaires
 * (mandat « historique + numérotation globale, avec achat », 2026-09-23).
 * Coumba Thiam et Modou Faye ont chacun PLUSIEURS participations distinctes
 * (`adhesionId` différents) — reproduit exactement le cas décrit dans le
 * mandat, où raisonner par `memberId` serait incorrect.
 */
describe('Espace de travail du Tour — Cotisations AVEC ACHAT : historique par participation + numérotation globale', () => {
  /** 2 participations Coumba (A, B) + 3 participations Modou (A, B, C), aucun bénéficiaire au départ. */
  async function setupWithDuplicateParticipations() {
    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Tontine Avec Achat Participations ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
      contributionAmount: 25_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true,
    } as never);
    const coumbaA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-018', '2026-01-01');
    const coumbaB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-018', '2026-01-01');
    const modouA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-01-01');
    const modouB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-01-01');
    const modouC = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-01-01');
    return { tontineId: tontine!.id, ids: { coumbaA: coumbaA!.id, coumbaB: coumbaB!.id, modouA: modouA!.id, modouB: modouB!.id, modouC: modouC!.id } };
  }
  /** Toutes les lignes « Coumba Thiam » / « Modou Faye » du tableau Cotisations, dans l'ordre DOM (indistinguables par nom seul, d'où l'usage de l'index positionnel). */
  function rowsForName(table: HTMLElement, name: string): HTMLElement[] {
    return within(table).getAllByText(name).map((el) => el.closest('tr')!);
  }
  function isLocked(row: HTMLElement): boolean {
    return Boolean(within(row).queryByLabelText('Déjà bénéficiaire d’un tour précédent'));
  }
  async function beneficiaryRowsGlobal(): Promise<[string, string][]> {
    const card = (await screen.findByText(/Bénéficiaires du Tour/)).closest('[class*="rounded"]') as HTMLElement;
    const table = within(card).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    return rows.map((r) => {
      const cells = within(r).getAllByRole('cell');
      const name = ['Coumba Thiam', 'Modou Faye'].find((n) => cells[1].textContent?.includes(n)) ?? cells[1].textContent ?? '';
      return [cells[0].textContent ?? '', name];
    });
  }

  it('TEST 1/3 — Tour 1 = participation A de Coumba : au Tour 2, SEULE cette participation est verrouillée, l’autre participation Coumba et toutes les participations Modou restent disponibles', async () => {
    const user = userEvent.setup();
    const { tontineId, ids } = await setupWithDuplicateParticipations();
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-06-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence1!.id, [ids.coumbaA]);
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-07-01');
    renderOccurrence(tontineId, occurrence2!.id);
    await screen.findByText('Cotisations des adhérents (5)');
    const table = (await screen.findAllByRole('table'))[0];

    const coumbaRows = rowsForName(table, 'Coumba Thiam');
    expect(coumbaRows.map(isLocked)).toEqual([true, false]); // participation A verrouillée, B disponible
    const modouRows = rowsForName(table, 'Modou Faye');
    expect(modouRows.map(isLocked)).toEqual([false, false, false]); // aucune participation Modou n’a jamais bénéficié — jamais verrouillé au niveau du membre

    // La participation disponible de Coumba (B) reste réellement sélectionnable.
    await user.click(within(coumbaRows[1]).getByRole('checkbox'));
    expect(within(coumbaRows[1]).getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
  });

  it('TEST 2 — Tour 1 = Coumba A, Tour 2 = Modou A : au Tour 3, les deux participations sont verrouillées, le reste est disponible', async () => {
    const { tontineId, ids } = await setupWithDuplicateParticipations();
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-06-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence1!.id, [ids.coumbaA]);
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-07-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence2!.id, [ids.modouA]);
    const occurrence3 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-08-01');
    renderOccurrence(tontineId, occurrence3!.id);
    await screen.findByText('Cotisations des adhérents (5)');
    const table = (await screen.findAllByRole('table'))[0];

    expect(rowsForName(table, 'Coumba Thiam').map(isLocked)).toEqual([true, false]);
    expect(rowsForName(table, 'Modou Faye').map(isLocked)).toEqual([true, false, false]);
  });

  it('TEST 4 — numérotation globale : Tour 1 affiche « 1 », Tour 2 affiche « 2 » (jamais « 1 »)', async () => {
    const { tontineId, ids } = await setupWithDuplicateParticipations();
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-06-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence1!.id, [ids.coumbaA]);
    const firstRender = renderOccurrence(tontineId, occurrence1!.id);
    await waitFor(async () => expect(await beneficiaryRowsGlobal()).toEqual([['1', 'Coumba Thiam']]));
    firstRender.unmount();

    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-07-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence2!.id, [ids.modouA]);
    renderOccurrence(tontineId, occurrence2!.id);
    await waitFor(async () => expect(await beneficiaryRowsGlobal()).toEqual([['2', 'Modou Faye']]));
  });

  it('TEST 4 (suite) — deux bénéficiaires dans le même Tour 3 (après 3 bénéficiaires déjà comptabilisés) affichent « 4 » et « 5 », jamais « 1 »/« 2 »', async () => {
    const { tontineId, ids } = await setupWithDuplicateParticipations();
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-06-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence1!.id, [ids.coumbaA]);
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-07-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence2!.id, [ids.modouA, ids.coumbaB]); // 2 bénéficiaires dans ce Tour → total 3 après ce Tour
    const occurrence3 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-08-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence3!.id, [ids.modouB, ids.modouC]);
    renderOccurrence(tontineId, occurrence3!.id);
    await waitFor(async () => expect(await beneficiaryRowsGlobal()).toEqual([['4', 'Modou Faye'], ['5', 'Modou Faye']]));
  });

  it('TEST 6 — rouvrir le Tour 1 affiche toujours son bénéficiaire avec son numéro d’origine « 1 »', async () => {
    const { tontineId, ids } = await setupWithDuplicateParticipations();
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-06-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence1!.id, [ids.coumbaA]);
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-07-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence2!.id, [ids.modouA]);

    renderOccurrence(tontineId, occurrence1!.id);
    await waitFor(async () => expect(await beneficiaryRowsGlobal()).toEqual([['1', 'Coumba Thiam']]));
  });

  it('DENY : retirer une participation déjà réglée reste refusé (immuabilité inchangée pour avec achat)', async () => {
    const { tontineId, ids } = await setupWithDuplicateParticipations();
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-06-01');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence1!.id, ids.coumbaA, 25_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 25_000);
    const result = await tontineOperationsService.removeOccurrenceBeneficiary('T-001', beneficiary!.id);
    expect(result).toBeNull();
  });
});

describe('Espace de travail du Tour — Routing/chargement (anti-flash 404)', () => {
  /**
   * `tontine` est une query DÉPENDANTE (`enabled: Boolean(occurrence)`) : elle
   * démarre APRÈS que le Tour ait été trouvé, donc `occurrence` truthy mais
   * `tontine` encore `undefined` est un état de CHARGEMENT normal (2ᵉ requête
   * en vol), jamais un 404 — surveillé ici via MutationObserver pour attraper
   * un flash même s'il ne dure qu'un seul tick.
   */
  async function expectNoNotFoundFlash(run: () => Promise<unknown>) {
    let sawNotFound = document.body.textContent?.includes('Page introuvable') ?? false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('Page introuvable')) sawNotFound = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    await run();
    observer.disconnect();
    expect(sawNotFound).toBe(false);
  }

  it('TEST 1/4/5/6 : ouverture d’un Tour existant — aucun flash « Page introuvable » pendant le chargement, puis le Tour s’affiche', async () => {
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    await expectNoNotFoundFlash(async () => {
      renderOccurrence(tontineId, occurrenceId);
      await screen.findByRole('navigation', { name: 'breadcrumb' });
      await screen.findByText('Fatou Ndiaye');
    });
    expect(screen.getByText('Tour #1')).toBeInTheDocument();
  });

  it('TEST 2 : un occurrenceId inexistant affiche la vraie page 404 (jamais masquée)', async () => {
    const { tontineId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, 'OCC-INEXISTANT');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });

  it('TEST 3 : un tontineId inexistant (Tour d’une autre Tontine) affiche la vraie page 404', async () => {
    const { occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence('TON-INEXISTANTE', occurrenceId);
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });

  it('TEST 7 : navigation rapide entre deux Tours (mêmes providers/cache) ne laisse pas un ancien état déclencher un faux 404', async () => {
    function GoToOtherTourButton({ to }: { to: string }) {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate(to)}>Aller au second Tour</button>;
    }
    const tourA = await setupWithPurchaseTour();
    const tourB = await setupWithPurchaseTour();
    await expectNoNotFoundFlash(async () => {
      renderWithProviders(
        <>
          <GoToOtherTourButton to={`/tontines/${tourB.tontineId}/occurrences/${tourB.occurrenceId}`} />
          <Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>
        </>,
        { route: `/tontines/${tourA.tontineId}/occurrences/${tourA.occurrenceId}` },
      );
      await screen.findByText('Fatou Ndiaye');
      await userEvent.click(screen.getByRole('button', { name: 'Aller au second Tour' }));
      await screen.findByText('Fatou Ndiaye');
    });
  });
});

describe('Espace de travail du Tour — Navigation contextuelle (« Retour aux Tours » + onglets Vue générale/Adhérents/Tours)', () => {
  it('affiche le bouton « Retour aux Tours » et le clic ramène à la liste des Tours de la MÊME Tontine', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrenceWithLocationProbe(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await user.click(screen.getByRole('button', { name: /Retour aux Tours/ }));
    await screen.findByRole('tab', { name: 'Tours', selected: true });
    expect(screen.getByTestId('location-pathname')).toHaveTextContent(`/tontines/${tontineId}/tours`);
  });

  it('affiche les trois onglets Vue générale/Adhérents/Tours, avec « Tours » visuellement actif sur la page de détail du Tour', async () => {
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    expect(screen.getByRole('tab', { name: 'Vue générale' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Adhérents' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tours', selected: true })).toBeInTheDocument();
  });

  it('cliquer sur l’onglet « Vue générale » depuis le Tour navigue vers l’onglet Vue générale de la MÊME Tontine', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrenceWithLocationProbe(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await user.click(screen.getByRole('tab', { name: 'Vue générale' }));
    await screen.findByRole('tab', { name: 'Vue générale', selected: true });
    expect(screen.getByTestId('location-pathname')).toHaveTextContent(`/tontines/${tontineId}/overview`);
  });

  it('cliquer sur l’onglet « Adhérents » depuis le Tour navigue vers l’onglet Adhérents de la MÊME Tontine', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrenceWithLocationProbe(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await user.click(screen.getByRole('tab', { name: 'Adhérents' }));
    await screen.findByRole('tab', { name: 'Adhérents', selected: true });
    expect(screen.getByTestId('location-pathname')).toHaveTextContent(`/tontines/${tontineId}/adherents`);
  });

  it('cliquer sur l’onglet « Tours » — déjà visuellement actif — navigue quand même vers la LISTE des Tours (jamais un no-op)', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrenceWithLocationProbe(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    await user.click(screen.getByRole('tab', { name: 'Tours' }));
    await screen.findByRole('tab', { name: 'Tours', selected: true });
    expect(screen.getByTestId('location-pathname')).toHaveTextContent(`/tontines/${tontineId}/tours`);
  });
});

describe('Espace de travail du Tour — Synthèse et Tour clôturé', () => {
  it('la clôture (menu ⋮ du header) est refusée tant que les bénéficiaires ne sont pas intégralement réglés — le Tour reste Planifié', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Fatou Ndiaye');
    const leftRow = screen.getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(leftRow).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await screen.findByText('Bénéficiaires du Tour (1)');
    await user.click(screen.getByRole('button', { name: 'Actions du tour' }));
    await user.click(await screen.findByRole('menuitem', { name: /Clôturer le tour/ }));
    await new Promise((resolve) => setTimeout(resolve, 350)); // laisse la mutation mock se résoudre
    expect(screen.getByText('Planifié')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions du tour' })).toBeInTheDocument();
  });

  it('affiche la synthèse financière du Tour (total à régler / total réglé / reste à régler)', async () => {
    const { tontineId, occurrenceId } = await setupWithPurchaseTour();
    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Synthèse');
    expect(screen.getAllByText('Total à régler').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Total réglé').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Reste à régler')).toBeInTheDocument();
  });

  it('mandat « le reliquat appartient au contexte du Tour » — reste identifiable, traçable et actionnable (Affecter/Abandonner) directement dans la Synthèse du Tour, plus aucun onglet Reliquats séparé', async () => {
    const user = userEvent.setup();
    const { tontineId, occurrenceId } = await setupWithPurchaseTour({ contributionAmount: 25_000 });
    // Cagnotte sous-distribuée : 25 000 collectés, 15 000 distribués → reliquat 10 000 à la clôture.
    await tontineOperationsService.recordContribution('T-001', occurrenceId, (await tontineOperationsService.listContributionStatuses('T-001', occurrenceId))[0].adhesionId, 25_000);
    const adhesionId = (await tontineOperationsService.listContributionStatuses('T-001', occurrenceId))[0].adhesionId;
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrenceId, adhesionId, 15_000);
    expect(beneficiary).toBeTruthy();
    const reception = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 15_000);
    expect(reception).toBeTruthy();
    const closed = await tontineOperationsService.closeOccurrence('T-001', occurrenceId);
    expect(closed).toBeTruthy();
    const remaindersCheck = await tontineOperationsService.listRemainders('T-001', tontineId);
    expect(remaindersCheck.length).toBe(1);
    expect(remaindersCheck[0].amount).toBe(10_000);

    renderOccurrence(tontineId, occurrenceId);
    await screen.findByText('Synthèse');
    const remainderRow = (await screen.findByText('Ouvert')).closest('div')!;
    await user.click(within(remainderRow).getByRole('button', { name: 'Affecter' }));
    expect(await within(remainderRow).findByText('Affecté')).toBeInTheDocument();
  });
});
