import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
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
});

describe('Espace de travail du Tour — Bénéficiaires (Ajouter →/← Enlever)', () => {
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

  it('sélectionner un bénéficiaire puis « Enlever » le retire en batch — le bouton reste désactivé sans sélection', async () => {
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

    const removeButton = screen.getByRole('button', { name: /Enlever/ });
    expect(removeButton).toBeDisabled();

    const beneficiariesTitle = screen.getByText('Bénéficiaires du Tour (2)');
    const beneficiariesCard = beneficiariesTitle.closest('[class*="rounded"]') as HTMLElement;
    const beneficiaryRow = within(beneficiariesCard).getByText('Fatou Ndiaye').closest('tr')!;
    await user.click(within(beneficiaryRow).getByRole('checkbox'));
    expect(removeButton).not.toBeDisabled();
    await user.click(removeButton);
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
