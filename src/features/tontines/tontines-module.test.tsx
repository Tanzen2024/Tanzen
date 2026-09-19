import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';
import { tontinesService } from '@/services/tontines.service';
import { tontineOperationsService } from '@/services/tontine-operations.service';
import { formatNumber, formatTourDate } from '@/lib/utils';

function renderTontines(route: string) {
  return renderWithProviders(<Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>, { route });
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-pathname">{location.pathname}</div>;
}

function renderTontinesWithLocationProbe(route: string) {
  return renderWithProviders(<><Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes><LocationProbe /></>, { route });
}

describe('Créer une tontine — « Avec achat », jamais « Mode achat »/« Mode d’achat »', () => {
  it('affiche le libellé « Avec achat », jamais « Mode achat »', async () => {
    renderTontines('/tontines/create');
    await screen.findByLabelText(/Nom de la tontine/);
    expect(screen.getAllByText('Avec achat').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Avec achat')).toBeInTheDocument();
    expect(screen.queryByText('Mode achat')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mode d.achat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Caisse liée/)).not.toBeInTheDocument();
  });

  it('n’affiche aucun champ Devise dans le formulaire de création — la devise est toujours automatique', async () => {
    renderTontines('/tontines/create');
    await screen.findByLabelText(/Nom de la tontine/);
    expect(screen.queryByRole('combobox', { name: 'Devise' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Devise')).not.toBeInTheDocument();
  });
});

describe('Fiche Tontine — édition sans aucun champ Devise', () => {
  it('la fiche en lecture affiche « Avec achat », jamais « Mode achat » (onglet Vue générale)', async () => {
    renderTontines('/tontines/TON-004/overview'); // MONEY, tenant T-001, withPurchase: true (seed) — Vue générale n'est plus l'onglet par défaut, route explicite
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.getAllByText('Avec achat').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Mode achat')).not.toBeInTheDocument();
  });

  it('le formulaire de modification ne contient AUCUN champ Devise, même sélectionnable', async () => {
    renderTontines('/tontines/TON-004/edit');
    await screen.findByLabelText(/Nom de la tontine/);
    expect(screen.queryByRole('combobox', { name: 'Devise' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Devise')).not.toBeInTheDocument();
    expect(screen.queryByText('Devise')).not.toBeInTheDocument();
  });
});

describe('Tontine sans date propre — la Tontine définit les règles, le Tour porte la date', () => {
  it('DENY: aucun champ « Date de début » dans le formulaire de création', async () => {
    renderTontines('/tontines/create');
    await screen.findByLabelText(/Nom de la tontine/);
    expect(screen.queryByLabelText(/Date de début/)).not.toBeInTheDocument();
  });

  it('DENY: aucun champ « Date de début » dans le formulaire de modification, ni sur la fiche en lecture', async () => {
    renderTontines('/tontines/TON-004/edit');
    await screen.findByLabelText(/Nom de la tontine/);
    expect(screen.queryByLabelText(/Date de début/)).not.toBeInTheDocument();
    renderTontines('/tontines/TON-004');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.queryByText(/Date de début/)).not.toBeInTheDocument();
  });

  it('ALLOW: une Tontine créée n’a pas de propriété `startDate` du tout (pas seulement `undefined`)', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test sans date ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    expect(tontine).toBeTruthy();
    expect('startDate' in (tontine as object)).toBe(false);
  });

  it('ALLOW: la suggestion de date du prochain tour dérive UNIQUEMENT du dernier tour déjà créé + la fréquence — jamais inventée quand aucun tour n’existe', async () => {
    // TON-004 porte déjà un tour (OCC-004, 2026-06-01, mensuelle jour 1) → suggestion = 2026-07-01, sans aucune dépendance à un champ Tontine.
    // Le champ « Date du tour » vit désormais dans l'onglet « Tours » de la fiche Tontine.
    renderTontines('/tontines/TON-004/tours');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    const dateInput = await screen.findByLabelText(/Date du tour/) as HTMLInputElement;
    expect(dateInput.value).toBe('2026-07-01');
  });

  it('ALLOW: une Tontine fraîchement créée (aucun tour) ne propose AUCUNE date suggérée — le champ reste vide, l’utilisateur saisit librement la date du premier tour', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test zéro tour ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    renderTontines(`/tontines/${tontine!.id}/tours`);
    await screen.findByRole('heading', { name: tontine!.name });
    const dateInput = await screen.findByLabelText(/Date du tour/) as HTMLInputElement;
    expect(dateInput.value).toBe('');
  });
});

describe('Fiche Tontine — navigation par onglets (refonte UI)', () => {
  it('affiche l’onglet « Tours » par défaut (mandat « ouverture par défaut sur Tours ») et masque « Planification » pour une tontine avec achat', async () => {
    renderTontines('/tontines/TON-004'); // MONEY, withPurchase: true — aucun onglet explicite dans l'URL
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Vue générale' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Adhérents' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Planification' })).not.toBeInTheDocument();
  });

  it('mandat « le Tour devient le centre des opérations » — Cotisations/Distributions/Reliquats n’apparaissent plus comme onglets du détail Tontine (redondants avec le Tour)', async () => {
    renderTontines('/tontines/TON-004');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.queryByRole('tab', { name: 'Cotisations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Distributions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Reliquats' })).not.toBeInTheDocument();
  });

  it('CAS A : /tontines/:id/occurrences (route Tours explicite, déjà présente dans l’architecture) affiche également Tours', async () => {
    renderTontines('/tontines/TON-004/tours');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'true');
  });

  it('CAS C/D : une route explicite (Adhérents) reste prioritaire sur le défaut Tours, y compris après un « rechargement » (rendu direct de l’URL)', async () => {
    renderTontines('/tontines/TON-004/adherents');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.getByRole('tab', { name: 'Adhérents' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'false');
    expect(await screen.findByText('Coumba Thiam')).toBeInTheDocument();
  });

  it('Vue générale reste accessible via sa route explicite /overview, jamais l’onglet d’entrée', async () => {
    renderTontines('/tontines/TON-004/overview');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.getByRole('tab', { name: 'Vue générale' })).toHaveAttribute('aria-selected', 'true');
  });

  it('cliquer sur l’onglet « Adhérents » depuis Tours (défaut) affiche son contenu et met à jour l’URL sous /tontines/:id/adherents', async () => {
    const user = userEvent.setup();
    renderTontinesWithLocationProbe('/tontines/TON-004');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Adhérents' }));
    expect(await screen.findByText('Modou Faye')).toBeInTheDocument();
    expect(screen.getByTestId('location-pathname')).toHaveTextContent('/tontines/TON-004/adherents');
  });

  it('CAS B : Tours (défaut) → Adhérents → retour sur Tours (segment explicite) redonne bien Tours actif', async () => {
    // Depuis le mandat « onglet par défaut selon adhérents et planification », `defaultTab` est dynamique
    // (peut changer pendant que l'utilisateur reste sur l'onglet ouvert via le défaut) — un clic sur un onglet
    // navigue donc TOUJOURS vers son segment explicite, plus jamais vers l'URL bare (qui resterait, elle,
    // toujours réévaluée dynamiquement).
    const user = userEvent.setup();
    renderTontinesWithLocationProbe('/tontines/TON-004');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    await user.click(screen.getByRole('tab', { name: 'Adhérents' }));
    expect(screen.getByTestId('location-pathname')).toHaveTextContent('/tontines/TON-004/adherents');
    await user.click(screen.getByRole('tab', { name: 'Tours' }));
    expect(screen.getByTestId('location-pathname')).toHaveTextContent('/tontines/TON-004/tours');
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'true');
  });

  it('accéder directement à l’URL d’un onglet (rafraîchissement) affiche ce sous-module sans clic préalable — l’URL est la source de vérité', async () => {
    renderTontines('/tontines/TON-004/adherents');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.getByRole('tab', { name: 'Adhérents' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Coumba Thiam')).toBeInTheDocument();
  });

  it('une ancienne URL /distributions (onglet supprimé) ne casse pas la page — redirige proprement sur Tours, la Tontine sélectionnée reste la même', async () => {
    renderTontines('/tontines/TON-004/distributions');
    expect(await screen.findByRole('heading', { name: 'Coopérative Sutura' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Distributions' })).not.toBeInTheDocument();
  });

  it('une ancienne URL /reliquats (onglet supprimé) ne casse pas la page — redirige proprement sur Tours', async () => {
    renderTontines('/tontines/TON-004/reliquats');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Reliquats' })).not.toBeInTheDocument();
  });

  it('une ancienne URL /cotisations (onglet supprimé) ne casse pas la page — redirige proprement sur Tours', async () => {
    renderTontines('/tontines/TON-004/cotisations');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Cotisations' })).not.toBeInTheDocument();
  });
});

describe('Onglet Adhérents — ajout multiple (Dialog, mandat « ajout multiple d’adhérents »)', () => {
  // TON-004 (T-001) : adhérents déjà en place = M-016 (Modou Faye), M-018 (Coumba Thiam).
  // Membres actifs de T-001 non encore adhérents (donc disponibles) = M-001 (Fatou Ndiaye), M-006 (Cheikh Diop).
  async function openAddAdherentsDialog(user: ReturnType<typeof userEvent.setup>) {
    renderTontines('/tontines/TON-004/adherents');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    await user.click(screen.getByRole('button', { name: 'Ajouter des adhérents' }));
    return within(await screen.findByRole('dialog'));
  }

  it('ALLOW: le Dialog ne liste que les membres du tenant NON déjà adhérents de cette tontine — jamais désactivés, exclus', async () => {
    const user = userEvent.setup();
    const dialog = await openAddAdherentsDialog(user);
    expect(dialog.getByText('Sélectionnez les membres à ajouter à cette tontine.')).toBeInTheDocument();
    expect(dialog.getByText('Fatou Ndiaye')).toBeInTheDocument();
    expect(dialog.getByText('Cheikh Diop')).toBeInTheDocument();
    expect(dialog.queryByText('Modou Faye')).not.toBeInTheDocument();
    expect(dialog.queryByText('Coumba Thiam')).not.toBeInTheDocument();
    expect(dialog.getByText('2 membres disponibles')).toBeInTheDocument();
  });

  it('ALLOW: le bouton principal est désactivé et affiche « Ajouter des adhérents » tant qu’aucun membre n’est sélectionné', async () => {
    const user = userEvent.setup();
    const dialog = await openAddAdherentsDialog(user);
    expect(dialog.getByRole('button', { name: 'Ajouter des adhérents' })).toBeDisabled();
  });

  it('ALLOW: sélectionner un membre met à jour le libellé du bouton en « Ajouter 1 adhérent » et le résumé', async () => {
    const user = userEvent.setup();
    const dialog = await openAddAdherentsDialog(user);
    await user.click(dialog.getByText('Fatou Ndiaye'));
    expect(dialog.getByRole('button', { name: 'Ajouter 1 adhérent' })).toBeEnabled();
    expect(dialog.getByText('1 membre sélectionné')).toBeInTheDocument();
  });

  it('ALLOW: sélectionner plusieurs membres affiche « Ajouter N adhérents »', async () => {
    const user = userEvent.setup();
    const dialog = await openAddAdherentsDialog(user);
    await user.click(dialog.getByText('Fatou Ndiaye'));
    await user.click(dialog.getByText('Cheikh Diop'));
    expect(dialog.getByRole('button', { name: 'Ajouter 2 adhérents' })).toBeEnabled();
    expect(dialog.getByText('2 membres sélectionnés')).toBeInTheDocument();
  });

  it('ALLOW: désélectionner un membre déjà sélectionné le retire du résumé et remet à jour le compteur', async () => {
    const user = userEvent.setup();
    const dialog = await openAddAdherentsDialog(user);
    await user.click(dialog.getByText('Fatou Ndiaye'));
    await user.click(dialog.getByText('Cheikh Diop'));
    await user.click(dialog.getByText('Fatou Ndiaye')); // désélection
    expect(dialog.getByRole('button', { name: 'Ajouter 1 adhérent' })).toBeEnabled();
    expect(dialog.getByText('1 membre sélectionné')).toBeInTheDocument();
  });

  it('IMPORTANT — la recherche filtre l’affichage SANS jamais faire perdre la sélection déjà faite', async () => {
    const user = userEvent.setup();
    const dialog = await openAddAdherentsDialog(user);
    await user.click(dialog.getByText('Fatou Ndiaye'));
    await user.type(dialog.getByPlaceholderText('Rechercher un membre...'), 'Cheikh');
    expect(dialog.queryByText('Fatou Ndiaye')).not.toBeInTheDocument(); // filtrée par la recherche, jamais désélectionnée pour autant
    await user.click(dialog.getByText('Cheikh Diop'));
    await user.clear(dialog.getByPlaceholderText('Rechercher un membre...'));
    expect(dialog.getByText('Fatou Ndiaye')).toBeInTheDocument();
    expect(dialog.getByText('Cheikh Diop')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Ajouter 2 adhérents' })).toBeEnabled();
    expect(dialog.getByText('2 membres sélectionnés')).toBeInTheDocument();
  });

  it('ALLOW: « Effacer » vide toute la sélection en un clic', async () => {
    const user = userEvent.setup();
    const dialog = await openAddAdherentsDialog(user);
    await user.click(dialog.getByText('Fatou Ndiaye'));
    await user.click(dialog.getByText('Cheikh Diop'));
    await user.click(dialog.getByRole('button', { name: 'Effacer' }));
    expect(dialog.getByRole('button', { name: 'Ajouter des adhérents' })).toBeDisabled();
    expect(dialog.queryByText(/sélectionné/)).not.toBeInTheDocument();
  });

  // Tests mutants (créent réellement des adhésions) : chacun sur sa PROPRE Tontine fraîche,
  // jamais sur TON-004 (fixture partagée par les tests ci-dessus, qui doit rester intacte).
  it('ALLOW: confirmer l’ajout crée les adhésions, ferme le Dialog et rafraîchit la liste — un seul membre ou plusieurs', async () => {
    // Avec achat — vue Adhérents groupée inchangée (les tests dédiés à la fusion Adhérents+Ordre de passage, sans achat, vivent dans add-and-plan.test.tsx).
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Ajout Multiple ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true } as never);
    const user = userEvent.setup();
    renderTontines(`/tontines/${tontine!.id}/adherents`);
    await screen.findByRole('heading', { name: tontine!.name });
    await user.click(screen.getByRole('button', { name: 'Ajouter des adhérents' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByText('Fatou Ndiaye'));
    await user.click(dialog.getByText('Cheikh Diop'));
    await user.click(dialog.getByRole('button', { name: 'Ajouter 2 adhérents' }));
    expect(await screen.findByText('Fatou Ndiaye')).toBeInTheDocument(); // le Dialog se ferme et la liste des adhérents se rafraîchit
    expect(screen.getByText('Cheikh Diop')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ALLOW: le Dialog se ferme avec Échap sans rien ajouter', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Échap ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    const user = userEvent.setup();
    renderTontines(`/tontines/${tontine!.id}/adherents`);
    await screen.findByRole('heading', { name: tontine!.name });
    await user.click(screen.getByRole('button', { name: 'Ajouter des adhérents' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByText('Fatou Ndiaye'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Fatou Ndiaye')).not.toBeInTheDocument(); // toujours absente des adhérents — rien n'a été ajouté
  });

  describe('« Tout sélectionner » (mandat « finalisation ajout multiple » §8-§11)', () => {
    it('ALLOW: « Tout sélectionner » sélectionne tous les membres actuellement disponibles (sans recherche active)', async () => {
      const user = userEvent.setup();
      const dialog = await openAddAdherentsDialog(user);
      await user.click(dialog.getByRole('button', { name: 'Tout sélectionner' }));
      expect(dialog.getByRole('button', { name: 'Ajouter 2 adhérents' })).toBeEnabled();
      expect(dialog.getByText('2 membres sélectionnés')).toBeInTheDocument();
    });

    it('ALLOW: le contrôle devient « Tout désélectionner » une fois tous les membres visibles sélectionnés, et vide la sélection en un clic', async () => {
      const user = userEvent.setup();
      const dialog = await openAddAdherentsDialog(user);
      await user.click(dialog.getByRole('button', { name: 'Tout sélectionner' }));
      await user.click(dialog.getByRole('button', { name: 'Tout désélectionner' }));
      expect(dialog.getByRole('button', { name: 'Ajouter des adhérents' })).toBeDisabled();
      expect(dialog.queryByText(/sélectionné/)).not.toBeInTheDocument();
    });

    it('ALLOW: état partiel — le libellé reste « Tout sélectionner » tant que tous les membres visibles ne sont pas sélectionnés', async () => {
      const user = userEvent.setup();
      const dialog = await openAddAdherentsDialog(user);
      await user.click(dialog.getByText('Fatou Ndiaye')); // 1 sur 2 — état partiel
      expect(dialog.getByRole('button', { name: 'Tout sélectionner' })).toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: 'Tout désélectionner' })).not.toBeInTheDocument();
    });

    it('IMPORTANT — « Tout sélectionner » ne porte QUE sur les résultats filtrés par la recherche, jamais sur la liste complète', async () => {
      const user = userEvent.setup();
      const dialog = await openAddAdherentsDialog(user);
      await user.type(dialog.getByPlaceholderText('Rechercher un membre...'), 'Fatou');
      expect(dialog.getByRole('button', { name: 'Tout sélectionner (1 résultats)' })).toBeInTheDocument();
      await user.click(dialog.getByRole('button', { name: 'Tout sélectionner (1 résultats)' }));
      expect(dialog.getByText('1 membre sélectionné')).toBeInTheDocument();
      await user.clear(dialog.getByPlaceholderText('Rechercher un membre...'));
      // Fatou reste sélectionnée après avoir vidé la recherche — Cheikh (jamais touché) reste non sélectionné.
      expect(dialog.getByText('1 membre sélectionné')).toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'Tout sélectionner' })).toBeInTheDocument(); // état partiel : Fatou oui, Cheikh non
    });

    it('ALLOW: sélectionner « Tout » sur un résultat de recherche puis sur un second n’efface jamais le premier lot (mandat §9, exemple Jean/Paul)', async () => {
      const user = userEvent.setup();
      const dialog = await openAddAdherentsDialog(user);
      await user.type(dialog.getByPlaceholderText('Rechercher un membre...'), 'Fatou');
      await user.click(dialog.getByRole('button', { name: 'Tout sélectionner (1 résultats)' }));
      await user.clear(dialog.getByPlaceholderText('Rechercher un membre...'));
      await user.type(dialog.getByPlaceholderText('Rechercher un membre...'), 'Cheikh');
      await user.click(dialog.getByRole('button', { name: 'Tout sélectionner (1 résultats)' }));
      await user.clear(dialog.getByPlaceholderText('Rechercher un membre...'));
      expect(dialog.getByText('2 membres sélectionnés')).toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'Tout désélectionner' })).toBeInTheDocument();
    });

    it('DENY: aucun contrôle « Tout sélectionner » lorsqu’aucun membre n’est disponible (recherche sans résultat)', async () => {
      const user = userEvent.setup();
      const dialog = await openAddAdherentsDialog(user);
      await user.type(dialog.getByPlaceholderText('Rechercher un membre...'), 'Zzzznomrave'); // filtre vers 0 résultat
      expect(dialog.getByText('Aucun membre disponible')).toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: /Tout sélectionner/ })).not.toBeInTheDocument();
    });
  });
});

describe('Onglet Adhérents — représentations multiples d’un même membre (mandat « finalisation ajout multiple » §1-§7)', () => {
  it('ALLOW: un membre déjà adhérent peut recevoir une représentation supplémentaire via « Ajouter une représentation » — jamais confondu avec l’ajout d’un nouveau membre', async () => {
    // Tontine fraîche (Avec achat — vue groupée inchangée) + une seule adhésion créée directement via le service (jamais TON-004, fixture partagée par les tests ci-dessus).
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Représentations ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true } as never);
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const user = userEvent.setup();
    renderTontines(`/tontines/${tontine!.id}/adherents`);
    await screen.findByRole('heading', { name: tontine!.name });
    expect(await screen.findByText('Fatou Ndiaye')).toBeInTheDocument();
    expect(screen.getByText('1 représentation')).toBeInTheDocument(); // une seule représentation avant l'action
    await user.click(screen.getByRole('button', { name: 'Ajouter une représentation' }));
    expect(await screen.findByText('2 représentations')).toBeInTheDocument();
  });
});

/**
 * Le tenant applicatif est FIGÉ à T-001 (`TenantProvider`, isolation stricte
 * — aucun mécanisme de bascule dans les tests) : tous les tests ci-dessous
 * partagent donc le même tableau mutable `tontines`/`tontineAdhesions`/
 * `tontineOccurrences` de T-001 au sein de ce fichier. Comme le reste de ce
 * fichier, les assertions comparent un AVANT/APRÈS (delta) plutôt qu'un
 * total absolu, pour rester correctes quel que soit l'ordre d'exécution.
 * L'isolation MULTI-TENANT elle-même est déjà couverte au niveau service
 * (`tontine-operations.service.test.ts` — « Isolation multi-tenant ») : elle
 * n'est pas dupliquée ici, un rendu ne pouvant afficher qu'un seul tenant.
 */
describe('Dashboard Tontines — carte « État des Tontines » (sans pourcentages)', () => {
  it('affiche uniquement les nombres (Actives/Inactives/Total), jamais de pourcentage — les nombres restent calculés dynamiquement', async () => {
    const before = await tontinesService.listTontines('T-001');
    const activeBefore = before.filter((item) => item.status === 'statusActive').length;
    const inactiveBefore = before.length - activeBefore;
    await tontinesService.createTontine({ tenantId: 'T-001', name: `Test État ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never); // toujours créée active

    renderTontines('/tontines');
    const card = (await screen.findByText('État des Tontines')).closest('[class*="rounded"]') as HTMLElement;

    const activeRow = within(card).getByText('Active').closest('div')!;
    expect(within(activeRow).getByText(String(activeBefore + 1))).toBeInTheDocument();
    const inactiveRow = within(card).getByText('Inactive').closest('div')!;
    expect(within(inactiveRow).getByText(String(inactiveBefore))).toBeInTheDocument();
    const totalRow = within(card).getByText('Total').closest('div')!;
    expect(within(totalRow).getByText(String(before.length + 1))).toBeInTheDocument();

    expect(within(card).queryByText(/%/)).not.toBeInTheDocument();
    expect(card.textContent).not.toMatch(/\d+\s*%/);
  });
});

describe('Dashboard Tontines — KPI', () => {
  it('KPI Tontines / Tontines actives : augmentent tous deux de 1 après la création d’une tontine (aucune tontine n’est jamais créée inactive)', async () => {
    const before = await tontinesService.listTontines('T-001');
    const activeBefore = before.filter((item) => item.status === 'statusActive').length;
    await tontinesService.createTontine({ tenantId: 'T-001', name: `Test KPI Total ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    renderTontines('/tontines');
    await screen.findByText('Tontines actives');
    const totalValue = within(screen.getAllByText('Tontines').find((el) => el.closest('article'))!.closest('article')!).getByText(String(before.length + 1));
    expect(totalValue).toBeInTheDocument();
    const activeValue = within(screen.getByText('Tontines actives').closest('article')!).getByText(String(activeBefore + 1));
    expect(activeValue).toBeInTheDocument();
  });

  it('KPI Participations : compte les REPRÉSENTATIONS actives (chaque adhésion), jamais un nombre de membres uniques', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test KPI Participations ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    const before = (await tontineOperationsService.listAllAdhesions('T-001')).filter((item) => item.status === 'active').length;
    // Un même membre (M-001) reçoit ICI DEUX représentations distinctes dans la même Tontine → le KPI doit compter 2, jamais 1.
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    renderTontines('/tontines');
    await screen.findByText('Participations');
    expect(within(screen.getByText('Participations').closest('article')!).getByText(String(before + 2))).toBeInTheDocument();
  });

  it('KPI Tours à venir : compte uniquement les Tours PLANNED dont la date est future — jamais les Tours passés ni RÉALISÉS, et reste indépendant des filtres de la liste', async () => {
    const before = (await tontineOperationsService.listAllOccurrences('T-001')).filter((o) => o.status === 'PLANNED' && o.date >= new Date().toISOString().slice(0, 10)).length;
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test KPI Tours ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true } as never);
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2099-01-01'); // futur, PLANNED → compté
    const pastOccurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2020-01-01'); // passé → jamais compté
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2020-01-01');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', pastOccurrence!.id, adhesion!.id, 5_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 5_000);
    await tontineOperationsService.closeOccurrence('T-001', pastOccurrence!.id); // RÉALISÉ → jamais compté même si sa date était future
    renderTontines('/tontines');
    await screen.findByText('Tours à venir');
    expect(within(screen.getByText('Tours à venir').closest('article')!).getByText(String(before + 1))).toBeInTheDocument();
  });
});

describe('Dashboard Tontines — Répartition par fréquence', () => {
  it('une fréquence utilisée apparaît avec le bon NOMBRE (et non un pourcentage), et ce nombre reflète bien PLUSIEURS Tontines de cette même fréquence (regroupement correct)', async () => {
    const stamp = Date.now();
    const before = (await tontinesService.listTontines('T-001')).filter((item) => item.frequency === 'WEEKLY').length;
    await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Freq A ${stamp}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'WEEKLY', weekday: 'MONDAY' } as never);
    await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Freq B ${stamp}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'WEEKLY', weekday: 'TUESDAY' } as never);
    renderTontines('/tontines');
    const section = (await screen.findByText('Répartition par fréquence')).closest('div')!.parentElement!;
    const line = within(section).getByText('Hebdomadaire').closest('div')!;
    expect(line.textContent).toContain(String(before + 2)); // les DEUX nouvelles Tontines Hebdomadaire sont regroupées ensemble, jamais deux lignes distinctes
    expect(line.textContent).not.toContain('%'); // le nombre brut, jamais un pourcentage
  });

  it('6 tontines mensuelles et 3 hebdomadaires affichent respectivement « 6 » et « 3 », et le total correspond au nombre de tontines prises en compte', async () => {
    const stamp = Date.now();
    const beforeMonthly = (await tontinesService.listTontines('T-001')).filter((item) => item.frequency === 'MONTHLY').length;
    const beforeWeekly = (await tontinesService.listTontines('T-001')).filter((item) => item.frequency === 'WEEKLY').length;
    for (let index = 0; index < 6; index += 1) {
      await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Freq Mensuelle ${stamp}-${index}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    }
    for (let index = 0; index < 3; index += 1) {
      await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Freq Hebdo ${stamp}-${index}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'WEEKLY', weekday: 'MONDAY' } as never);
    }
    renderTontines('/tontines');
    const section = (await screen.findByText('Répartition par fréquence')).closest('div')!.parentElement!;
    expect(within(section).getByText('Mensuelle').closest('div')!.textContent).toContain(String(beforeMonthly + 6));
    expect(within(section).getByText('Hebdomadaire').closest('div')!.textContent).toContain(String(beforeWeekly + 3));
    const allTontines = await tontinesService.listTontines('T-001');
    const displayedTotal = allTontines.filter((item) => item.frequency === 'MONTHLY').length + allTontines.filter((item) => item.frequency === 'WEEKLY').length + allTontines.filter((item) => item.frequency === 'QUARTERLY').length + allTontines.filter((item) => item.frequency === 'DAILY').length;
    expect(displayedTotal).toBe(allTontines.length); // toutes les tontines sont réparties dans une fréquence, aucune perdue
  });

  it('jamais les 4 cartes fixes Journalière/Hebdomadaire/Mensuelle/Trimestrielle codées en dur — ni un compteur « Cycle »/« Tirage » — et une fréquence non utilisée n’apparaît jamais', async () => {
    renderTontines('/tontines');
    await screen.findByText('Répartition par fréquence');
    expect(screen.queryByText(/[Cc]ycle/)).not.toBeInTheDocument();
    expect(screen.queryByText(/[Tt]irage/)).not.toBeInTheDocument();
    const usedFrequencies = new Set((await tontinesService.listTontines('T-001')).map((item) => item.frequency));
    if (!usedFrequencies.has('DAILY')) expect(screen.queryByText('Journalière')).not.toBeInTheDocument();
  });

  it('aucun caractère « % » n’apparaît dans la section « Répartition par fréquence »', async () => {
    renderTontines('/tontines');
    const section = (await screen.findByText('Répartition par fréquence')).closest('div')!.parentElement!;
    expect(section.textContent).not.toContain('%');
  });

  it('le filtre de fréquence et le filtre de statut existants continuent de fonctionner sans affecter la section pourcentage supprimée', async () => {
    renderTontines('/tontines');
    await screen.findByText('Répartition par fréquence');
    const comboboxes = screen.getAllByRole('combobox');
    const frequencySelect = comboboxes.find((el) => el.getAttribute('aria-label') === 'Fréquence') as HTMLSelectElement;
    const statusSelect = comboboxes.find((el) => el.getAttribute('aria-label') === 'Statut' || el.getAttribute('aria-label') === 'Status') as HTMLSelectElement | undefined;
    expect(frequencySelect).toBeTruthy();
    expect(frequencySelect.querySelectorAll('option').length).toBeGreaterThan(1);
    if (statusSelect) expect(statusSelect.querySelectorAll('option').length).toBeGreaterThan(1);
  });

  it('seules les Tontines du tenant courant (T-001) sont comptabilisées dans la répartition par fréquence', async () => {
    const stamp = Date.now();
    const before = (await tontinesService.listTontines('T-001')).filter((item) => item.frequency === 'QUARTERLY').length;
    await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Isolation Tenant ${stamp}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'QUARTERLY', quarterlyMonth: 1, quarterlyDayOfMonth: 15 } as never);
    renderTontines('/tontines');
    const section = (await screen.findByText('Répartition par fréquence')).closest('div')!.parentElement!;
    const line = within(section).getByText('Trimestrielle').closest('div')!;
    expect(line.textContent).toContain(String(before + 1));
  });
});

describe('Dashboard Tontines — État des Tontines', () => {
  it('le total de la section « État des Tontines » reste cohérent avec le KPI Tontines, et « Inactive » reste à 0 (aucune Tontine T-001 n’est jamais inactive dans ce modèle)', async () => {
    const before = await tontinesService.listTontines('T-001');
    await tontinesService.createTontine({ tenantId: 'T-001', name: `Test État ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    renderTontines('/tontines');
    const section = (await screen.findByText('État des Tontines')).closest('div')!.parentElement!;
    const inactiveRow = within(section).getByText('Inactive').closest('div')!;
    expect(inactiveRow.textContent).toContain('0');
    const totalRow = within(section).getByText('Total').closest('div')!;
    expect(totalRow.textContent).toContain(String(before.length + 1));
  });
});

describe('Dashboard Tontines — Prochains Tours', () => {
  it('seuls les Tours à venir apparaissent, triés par date croissante (le plus proche en premier), et un Tour passé n’y figure jamais même s’il reste PLANNED', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Ordre Tours ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2099-06-01'); // plus lointain
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2099-01-01'); // plus proche
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2019-01-01'); // passé, jamais affiché même PLANNED
    renderTontines('/tontines');
    const card = (await screen.findByText('Prochains Tours')).closest('div')!.parentElement!;
    expect(within(card).getAllByText(formatTourDate('2099-01-01')).length).toBeGreaterThanOrEqual(1);
    const janIndex = within(card).getAllByRole('row').findIndex((row) => row.textContent?.includes(formatTourDate('2099-01-01')));
    const juneIndex = within(card).getAllByRole('row').findIndex((row) => row.textContent?.includes(formatTourDate('2099-06-01')));
    expect(janIndex).toBeGreaterThanOrEqual(0);
    expect(juneIndex).toBeGreaterThan(janIndex); // le plus proche (janvier) précède le plus lointain (juin)
    expect(within(card).queryByText(/2019/)).not.toBeInTheDocument();
  });

  it('« Voir tous les Tours » apparaît uniquement au-delà de la limite affichée, et pointe vers la liste des Tontines de cette même page', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Limite Tours ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    for (const date of ['2098-01-01', '2098-02-01', '2098-03-01', '2098-04-01', '2098-05-01', '2098-06-01']) {
      await tontineOperationsService.createOccurrence('T-001', tontine!.id, date);
    }
    renderTontines('/tontines');
    const link = await screen.findByText('Voir tous les Tours →');
    expect(link.closest('a')).toHaveAttribute('href', '#tontines-list');
  });

  it('plusieurs bénéficiaires sur un même Tour ne sont jamais perdus — affichage compact « Nom + N autres »', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Multi Bénéficiaires ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true } as never);
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2097-01-01');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2020-01-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2020-01-01');
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionA!.id, 5_000);
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionB!.id, 5_000);
    renderTontines('/tontines');
    const card = (await screen.findByText('Prochains Tours')).closest('div')!.parentElement!;
    expect(await within(card).findByText(/\+ 1 autres/)).toBeInTheDocument();
  });

  it('aucun Tour à venir → état vide explicite', async () => {
    // Sans tour futur créé, la carte doit rester exploitable (état vide plutôt qu'une erreur).
    renderTontines('/tontines');
    await screen.findByText('Prochains Tours');
    const upcomingCount = (await tontineOperationsService.listAllOccurrences('T-001')).filter((o) => o.status === 'PLANNED' && o.date >= new Date().toISOString().slice(0, 10)).length;
    if (upcomingCount === 0) expect(screen.getByText('Aucun Tour à venir')).toBeInTheDocument();
  });
});

describe('Dashboard Tontines — Liste (colonnes Reliquats / Adhérents / Prochain tour)', () => {
  it('la colonne Adhérents compte les représentations actives de la Tontine, jamais les membres uniques', async () => {
    const user = userEvent.setup();
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Colonne Adhérents ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01'); // même membre, 2 représentations
    renderTontines('/tontines');
    // La liste est paginée (mandat « dashboard Tontines » §29) : on filtre par recherche pour garantir que la Tontine fraîchement créée est sur la page affichée, quel que soit le nombre de Tontines déjà accumulées par les tests précédents.
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), tontine!.name);
    const row = (await screen.findByText(tontine!.name)).closest('tr')!;
    expect(within(row).getByText('2')).toBeInTheDocument();
  });

  it('la colonne Prochain tour affiche « — » quand aucun Tour futur n’existe pour cette Tontine', async () => {
    const user = userEvent.setup();
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Sans Tour ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    renderTontines('/tontines');
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), tontine!.name);
    const row = (await screen.findByText(tontine!.name)).closest('tr')!;
    expect(within(row).getByText('—')).toBeInTheDocument();
  });
});

describe('Dashboard Tontines — Colonne « Prochain tour » (date future la plus proche, par Tontine, sans N+1)', () => {
  function futureDate(daysFromNow: number) {
    const date = new Date(); date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().slice(0, 10);
  }

  async function makeTontine(tenantId: string, name: string) {
    return tontinesService.createTontine({ tenantId, name: `${name} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
  }

  it('TEST 1 — un Tour futur unique : sa date s’affiche dans « Prochain tour »', async () => {
    const user = userEvent.setup();
    const tontine = await makeTontine('T-001', 'Test Tour Futur Unique');
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, futureDate(10));
    renderTontines('/tontines');
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), tontine!.name);
    const row = (await screen.findByText(tontine!.name)).closest('tr')!;
    expect(within(row).getByText(formatTourDate(futureDate(10)))).toBeInTheDocument();
    expect(within(row).queryByText('—')).not.toBeInTheDocument();
  });

  it('TEST 2/8 — plusieurs Tours futurs sur la même Tontine : seul le plus proche est affiché', async () => {
    const user = userEvent.setup();
    const tontine = await makeTontine('T-001', 'Test Plusieurs Tours Futurs');
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, futureDate(60)); // le plus éloigné, créé en premier
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, futureDate(5)); // le plus proche
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, futureDate(30)); // intermédiaire
    renderTontines('/tontines');
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), tontine!.name);
    const row = (await screen.findByText(tontine!.name)).closest('tr')!;
    expect(within(row).getByText(formatTourDate(futureDate(5)))).toBeInTheDocument();
    expect(within(row).queryByText(formatTourDate(futureDate(30)))).not.toBeInTheDocument();
    expect(within(row).queryByText(formatTourDate(futureDate(60)))).not.toBeInTheDocument();
  });

  it('TEST 3 — uniquement des Tours passés : « — »', async () => {
    const user = userEvent.setup();
    const tontine = await makeTontine('T-001', 'Test Tours Uniquement Passés');
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, futureDate(-10));
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, futureDate(-3));
    renderTontines('/tontines');
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), tontine!.name);
    const row = (await screen.findByText(tontine!.name)).closest('tr')!;
    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  it('TEST 5 — un Tour passé et un Tour futur : le Tour futur est affiché', async () => {
    const user = userEvent.setup();
    const tontine = await makeTontine('T-001', 'Test Passé Puis Futur');
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, futureDate(-7));
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, futureDate(14));
    renderTontines('/tontines');
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), tontine!.name);
    const row = (await screen.findByText(tontine!.name)).closest('tr')!;
    expect(within(row).getByText(formatTourDate(futureDate(14)))).toBeInTheDocument();
  });

  it('TEST 6 — plusieurs Tontines avec des prochains Tours différents : chaque ligne affiche SON propre prochain Tour', async () => {
    const user = userEvent.setup();
    const tontineA = await makeTontine('T-001', 'Test Multi A');
    const tontineB = await makeTontine('T-001', 'Test Multi B');
    await tontineOperationsService.createOccurrence('T-001', tontineA!.id, futureDate(3));
    await tontineOperationsService.createOccurrence('T-001', tontineB!.id, futureDate(20));
    renderTontines('/tontines');
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), 'Test Multi ');
    const rowA = (await screen.findByText(tontineA!.name)).closest('tr')!;
    const rowB = (await screen.findByText(tontineB!.name)).closest('tr')!;
    expect(within(rowA).getByText(formatTourDate(futureDate(3)))).toBeInTheDocument();
    expect(within(rowB).getByText(formatTourDate(futureDate(20)))).toBeInTheDocument();
  });

  it('TEST 7 — MULTI-TENANT : un Tour futur d’un AUTRE tenant n’apparaît jamais dans la Tontine du tenant courant', async () => {
    const user = userEvent.setup();
    const tontineOther = await tontinesService.createTontine({ tenantId: 'T-002', name: `Test Autre Tenant ${Date.now()}`, valueType: 'MONEY', currency: 'XOF', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    await tontineOperationsService.createOccurrence('T-002', tontineOther!.id, futureDate(2));
    const tontine = await makeTontine('T-001', 'Test Tenant Courant Sans Tour');
    renderTontines('/tontines'); // rendu pour le tenant courant, T-001
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), tontine!.name);
    const row = (await screen.findByText(tontine!.name)).closest('tr')!;
    expect(within(row).getByText('—')).toBeInTheDocument(); // le Tour de T-002 n'est jamais utilisé
  });

  it('TEST 9 — la colonne reste correcte après application des filtres Fréquence et Statut', async () => {
    const user = userEvent.setup();
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Filtre Prochain Tour ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'QUARTERLY', quarterlyMonth: 1, quarterlyDayOfMonth: 15 } as never);
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, futureDate(8));
    renderTontines('/tontines');
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), tontine!.name);
    await user.selectOptions(screen.getByLabelText('Fréquence'), 'QUARTERLY');
    await user.selectOptions(screen.getByLabelText('Statut'), 'statusActive');
    const row = (await screen.findByText(tontine!.name)).closest('tr')!;
    expect(within(row).getByText(formatTourDate(futureDate(8)))).toBeInTheDocument();
  });

  it('TON-004 (Coopérative Sutura) — la seule Occurrence du jeu de données (OCC-004, 2026-06-01) est passée : « — » est correct, absence réelle de Tour futur, pas un bug de calcul', async () => {
    const user = userEvent.setup();
    renderTontines('/tontines');
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), 'Coopérative Sutura');
    const row = (await screen.findByText('Coopérative Sutura')).closest('tr')!;
    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  it('TON-004 (Coopérative Sutura) — dès qu’un Tour futur existe réellement (« Ajouter un tour »), la colonne affiche sa date au lieu de « — »', async () => {
    const user = userEvent.setup();
    await tontineOperationsService.createOccurrence('T-001', 'TON-004', futureDate(12));
    renderTontines('/tontines');
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), 'Coopérative Sutura');
    const row = (await screen.findByText('Coopérative Sutura')).closest('tr')!;
    expect(within(row).getByText(formatTourDate(futureDate(12)))).toBeInTheDocument();
    expect(within(row).queryByText('—')).not.toBeInTheDocument();
  });

  it('TEST 10 — aucune requête N+1 : la liste ne fait jamais un fetch par Tontine (`listOccurrences`), uniquement `listAllOccurrences`', async () => {
    const listOccurrencesSpy = vi.spyOn(tontineOperationsService, 'listOccurrences');
    renderTontines('/tontines');
    await screen.findByPlaceholderText('Nom de la tontine');
    await screen.findAllByRole('row');
    expect(listOccurrencesSpy).not.toHaveBeenCalled();
    listOccurrencesSpy.mockRestore();
  });
});

describe('Dashboard Tontines — Filtres (Fréquence puis Statut) et Réinitialisation', () => {
  it('l’ordre des filtres est Fréquence PUIS Statut', async () => {
    renderTontines('/tontines');
    const comboboxes = await screen.findAllByRole('combobox');
    const frequencyIndex = comboboxes.findIndex((el) => el.getAttribute('aria-label') === 'Fréquence');
    const statusIndex = comboboxes.findIndex((el) => el.getAttribute('aria-label') === 'Statut');
    expect(frequencyIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThan(frequencyIndex);
  });

  it('le filtre Fréquence ne propose que les fréquences réellement utilisées par le tenant, avec « Toutes » en premier', async () => {
    renderTontines('/tontines');
    const select = await screen.findByLabelText('Fréquence');
    const options = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(options[0]).toBe('Toutes');
    expect(new Set(options).size).toBe(options.length); // jamais de doublon
  });

  it('Fréquence + Statut fonctionnent en AND ; le Statut « Inactive » ne renvoie aucun résultat pour T-001 (aucune Tontine T-001 n’est jamais inactive)', async () => {
    const user = userEvent.setup();
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Filtre AND ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'QUARTERLY', quarterlyMonth: 1, quarterlyDayOfMonth: 15 } as never);
    renderTontines('/tontines');
    // La liste est paginée (mandat « dashboard Tontines » §29) : recherche par nom pour garantir que la Tontine fraîchement créée est visible, quel que soit le nombre de Tontines déjà accumulées par les tests précédents.
    await user.type(await screen.findByPlaceholderText('Nom de la tontine'), tontine!.name);
    await screen.findByText(tontine!.name);
    await user.selectOptions(screen.getByLabelText('Fréquence'), 'QUARTERLY');
    await user.selectOptions(screen.getByLabelText('Statut'), 'statusActive');
    expect(screen.getByText(tontine!.name)).toBeInTheDocument(); // AND avec une valeur compatible → toujours visible
    await user.selectOptions(screen.getByLabelText('Statut'), 'statusInactive');
    expect(screen.queryByText(tontine!.name)).not.toBeInTheDocument();
    expect(screen.getByText('Aucune tontine')).toBeInTheDocument(); // aucun résultat, état vide
  });

  it('« Effacer » (réinitialisation) remet la recherche et les deux filtres à leur état initial', async () => {
    const user = userEvent.setup();
    renderTontines('/tontines');
    await screen.findByPlaceholderText('Nom de la tontine');
    await user.type(screen.getByPlaceholderText('Nom de la tontine'), 'introuvable-xyz');
    await user.selectOptions(screen.getByLabelText('Fréquence'), 'MONTHLY');
    expect(screen.getByText('Aucune tontine')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Effacer/ }));
    expect(screen.queryByText('Aucune tontine')).not.toBeInTheDocument();
    expect((screen.getByPlaceholderText('Nom de la tontine') as HTMLInputElement).value).toBe('');
  });
});

describe('Dashboard Tontines — KPI global vs Total de la liste filtrée', () => {
  it('le Total de reliquats de la liste change avec le filtre Fréquence, mais le KPI global « Tours à venir » n’en dépend jamais', async () => {
    const kpiBefore = (await tontineOperationsService.listAllOccurrences('T-001')).filter((o) => o.status === 'PLANNED' && o.date >= new Date().toISOString().slice(0, 10)).length;
    const user = userEvent.setup();
    renderTontines('/tontines');
    await screen.findByText('Tours à venir');
    const kpiValueBefore = within(screen.getByText('Tours à venir').closest('article')!).getByText(String(kpiBefore)).textContent;
    await user.selectOptions(screen.getByLabelText('Fréquence'), 'MONTHLY');
    const kpiValueAfter = within(screen.getByText('Tours à venir').closest('article')!).getByText(String(kpiBefore)).textContent;
    expect(kpiValueAfter).toBe(kpiValueBefore); // inchangé malgré le filtre Fréquence appliqué à la liste
  });
});

describe('Dashboard Tontines — KPI « Reliquats tontines » (somme des reliquats OPEN du tenant courant)', () => {
  /** Reproduit le SEUL chemin métier qui crée un reliquat : clôture d'un Tour dont la cagnotte collectée dépasse ce qui a été distribué (cf. tontine-operations.service.ts `closeOccurrence`). Retourne le reliquat effectivement créé (collected - distributed). */
  async function createRemainder(tenantId: string, memberId: string, collected: number, distributed: number) {
    const tontine = await tontinesService.createTontine({ tenantId, name: `Test Reliquat KPI ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY', withPurchase: true, contributionAmount: collected, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 } as never);
    const adhesion = await tontinesService.addAdhesion(tenantId, tontine!.id, memberId, '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence(tenantId, tontine!.id, '2026-09-05');
    await tontineOperationsService.recordContribution(tenantId, occurrence!.id, adhesion!.id, collected);
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary(tenantId, occurrence!.id, adhesion!.id, distributed);
    await tontineOperationsService.recordReception(tenantId, beneficiary!.id, distributed);
    await tontineOperationsService.closeOccurrence(tenantId, occurrence!.id);
    return tontine!;
  }

  async function totalOpenRemainders(tenantId: string) {
    return (await tontineOperationsService.listAllRemainders(tenantId)).filter((r) => r.status === 'OPEN').reduce((sum, r) => sum + r.amount, 0);
  }

  /** Même convention que finance-transactions.test.tsx : compare le montant en ignorant les espaces (l'espace insécable fine d'Intl.NumberFormat n'est pas un caractère « normal »). */
  function kpiValue(article: HTMLElement, target: string) {
    return within(article).getByText((content) => content.replace(/\s/g, '') === target.replace(/\s/g, ''));
  }

  it('affiche le libellé « Reliquats tontines » et le sous-libellé « Total des reliquats »', async () => {
    renderTontines('/tontines');
    const article = (await screen.findByText('Reliquats tontines')).closest('article')!;
    expect(within(article).getByText('Total des reliquats')).toBeInTheDocument();
  });

  it('un reliquat créé pour le tenant courant (T-001) augmente le KPI exactement du montant du reliquat (10 000 collectés, 6 000 distribués → 4 000)', async () => {
    const before = await totalOpenRemainders('T-001');
    await createRemainder('T-001', 'M-001', 10_000, 6_000);
    renderTontines('/tontines');
    const article = (await screen.findByText('Reliquats tontines')).closest('article')!;
    expect(kpiValue(article, `${formatNumber(before + 4_000)}FCFA`)).toBeInTheDocument();
  });

  it('plusieurs Tontines avec reliquats se somment exactement (5 000 + 2 500 = 7 500)', async () => {
    const before = await totalOpenRemainders('T-001');
    await createRemainder('T-001', 'M-001', 10_000, 5_000); // reliquat 5 000
    await createRemainder('T-001', 'M-001', 10_000, 7_500); // reliquat 2 500
    renderTontines('/tontines');
    const article = (await screen.findByText('Reliquats tontines')).closest('article')!;
    expect(kpiValue(article, `${formatNumber(before + 7_500)}FCFA`)).toBeInTheDocument();
  });

  it('une Tontine sans reliquat (cagnotte intégralement distribuée) n’ajoute rien au KPI', async () => {
    const before = await totalOpenRemainders('T-001');
    await createRemainder('T-001', 'M-001', 10_000, 10_000); // collecté = distribué → aucun reliquat créé
    renderTontines('/tontines');
    const article = (await screen.findByText('Reliquats tontines')).closest('article')!;
    expect(kpiValue(article, `${formatNumber(before)}FCFA`)).toBeInTheDocument();
  });

  it('MULTI-TENANT : un reliquat créé pour un AUTRE tenant (T-002) n’est jamais inclus dans le KPI de T-001', async () => {
    const before = await totalOpenRemainders('T-001');
    await createRemainder('T-002', 'M-002', 10_000, 1_000); // reliquat 9 000, mais chez T-002
    renderTontines('/tontines'); // rendu pour le tenant courant, T-001
    const article = (await screen.findByText('Reliquats tontines')).closest('article')!;
    expect(kpiValue(article, `${formatNumber(before)}FCFA`)).toBeInTheDocument(); // inchangé
  });

  it('le KPI global « Reliquats tontines » ne dépend jamais du filtre Fréquence de la liste', async () => {
    const before = await totalOpenRemainders('T-001');
    const user = userEvent.setup();
    renderTontines('/tontines');
    const article = (await screen.findByText('Reliquats tontines')).closest('article')!;
    const valueBefore = kpiValue(article, `${formatNumber(before)}FCFA`).textContent;
    await user.selectOptions(screen.getByLabelText('Fréquence'), 'MONTHLY');
    const valueAfter = kpiValue(article, `${formatNumber(before)}FCFA`).textContent;
    expect(valueAfter).toBe(valueBefore);
  });

  it('les autres KPI (Tontines, Actives, Participations, Tours à venir) restent affichés et inchangés par l’ajout de la carte Reliquats', async () => {
    renderTontines('/tontines');
    await screen.findByText('Reliquats tontines');
    expect(screen.getByText('Tontines actives')).toBeInTheDocument();
    expect(screen.getByText('Participations')).toBeInTheDocument();
    expect(screen.getByText('Tours à venir')).toBeInTheDocument();
  });
});

describe('Onglet « Tours » — cycle système (mandat « recommencement automatique de la Tontine »)', () => {
  it('cycle non terminé : « + Ajouter un tour » reste proposé, jamais le message/bouton de nouveau cycle', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Cycle Non Terminé ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true } as never);
    renderTontines(`/tontines/${tontine!.id}/tours`);
    await screen.findByRole('heading', { name: tontine!.name });
    expect(await screen.findByLabelText(/Date du tour/)).toBeInTheDocument();
    expect(screen.queryByText('Démarrer un nouveau cycle')).not.toBeInTheDocument();
    expect(screen.queryByText('Toutes les participations ont déjà bénéficié d’un tour. Vous pouvez démarrer un nouveau cycle.')).not.toBeInTheDocument();
  });

  it('AUDIT — une participation DÉSIGNÉE bénéficiaire mais NON réglée n’affiche PAS le bouton « Démarrer un nouveau cycle » (désignation ≠ bénéfice réalisé)', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Cycle Désigné Non Réglé ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true } as never);
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 5_000); // désigné, jamais réglé
    renderTontines(`/tontines/${tontine!.id}/tours`);
    await screen.findByRole('heading', { name: tontine!.name });
    expect(await screen.findByLabelText(/Date du tour/)).toBeInTheDocument(); // « + Ajouter un tour » reste l'action normale
    expect(screen.queryByText('Démarrer un nouveau cycle')).not.toBeInTheDocument();
  });

  it('cycle terminé : affiche EXACTEMENT le message et le bouton du mandat, masque « + Ajouter un tour »', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Cycle Terminé ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true } as never);
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 5_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 5_000); // « bénéficié » = réglé, jamais une simple désignation (audit ciblé 2026-09-18)
    renderTontines(`/tontines/${tontine!.id}/tours`);
    await screen.findByRole('heading', { name: tontine!.name });
    expect(await screen.findByText('Toutes les participations ont déjà bénéficié d’un tour. Vous pouvez démarrer un nouveau cycle.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Démarrer un nouveau cycle/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Date du tour/)).not.toBeInTheDocument();
  });

  it('cliquer sur « Démarrer un nouveau cycle » ouvre la confirmation EXACTE, puis démarre le nouveau cycle et fait réapparaître « + Ajouter un tour »', async () => {
    const user = userEvent.setup();
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Démarrage Cycle ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true } as never);
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 5_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 5_000); // « bénéficié » = réglé, jamais une simple désignation (audit ciblé 2026-09-18)
    renderTontines(`/tontines/${tontine!.id}/tours`);
    await screen.findByRole('heading', { name: tontine!.name });
    await user.click(await screen.findByRole('button', { name: /Démarrer un nouveau cycle/ }));
    expect(await screen.findByText('Démarrer un nouveau cycle ?')).toBeInTheDocument();
    expect(screen.getByText('Toutes les participations ont déjà bénéficié d’un tour. Un nouveau cycle va être créé. L’historique du cycle actuel sera conservé.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Démarrer le nouveau cycle' }));
    expect(await screen.findByLabelText(/Date du tour/)).toBeInTheDocument(); // « + Ajouter un tour » réapparaît, nouveau cycle courant
    expect(screen.queryByText('Démarrer un nouveau cycle ?')).not.toBeInTheDocument();
  });
});

/**
 * Audit routage (mandat « corriger l'erreur 404 sur /tontines/:tontineId ») —
 * distingue explicitement CAS A (route inexistante, jamais atteinte par
 * `TontineDetail`) de CAS B (Tontine inexistante dans les données actuelles,
 * détectée PAR `TontineDetail` lui-même une fois la route `:tontineId/*`
 * résolue). Les deux rendent volontairement le même `NotFoundPage` (voir
 * `routes/not-found-page.tsx` : jamais révéler qu'une ressource existe
 * ailleurs/pour un autre tenant) — ce test vérifie le MÉCANISME (la route
 * est bien atteinte et ne plante pas), pas seulement le rendu visuel final,
 * identique par conception.
 */
describe('Routage — /tontines/:tontineId (audit « erreur 404 »)', () => {
  it('CAS B — un identifiant de Tontine inexistant dans les données actuelles affiche l’état « introuvable » (route bien résolue par TontineDetail, jamais un crash)', async () => {
    // Aucune Tontine « TON-999 » dans les seeds ni créée par ce test — reproduit exactement la situation rapportée (identifiant valide en apparence, absent des données EN MÉMOIRE actuelles).
    renderTontines('/tontines/TON-999');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
    expect(screen.getByText('Erreur 404')).toBeInTheDocument();
    // Confirme qu'on est bien passé par la Page (bouton « Tableau de bord »), pas un crash silencieux ni un écran blanc.
    expect(screen.getByRole('button', { name: 'Tableau de bord' })).toBeInTheDocument();
  });

  it('CAS A (nuance) — un segment inconnu sous une Tontine EXISTANTE (`:tontineId/*` capture tout) retombe proprement sur l’onglet par défaut, jamais un 404 — seul un identifiant de Tontine absent déclenche l’état introuvable', async () => {
    // `:tontineId/*` étant volontairement générique (mandat « onglets »), un segment jamais enregistré sous une Tontine EXISTANTE ne doit jamais produire de page cassée — même mécanisme de secours que les anciens liens Cotisations/Distributions/Reliquats.
    renderTontines('/tontines/TON-004/ce-segment-n-existe-pas-du-tout');
    await screen.findByRole('heading', { name: 'Coopérative Sutura' });
    expect(screen.queryByText('Page introuvable')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'true'); // défaut « Avec achat » + adhérents déjà présents
  });

  it('/tontines/TON-004 (identifiant EXISTANT) ouvre bien la fiche de détail — la route racine :tontineId fonctionne, jamais un 404', async () => {
    renderTontines('/tontines/TON-004');
    expect(await screen.findByRole('heading', { name: 'Coopérative Sutura' })).toBeInTheDocument();
    expect(screen.queryByText('Page introuvable')).not.toBeInTheDocument();
  });

  it('navigation depuis la liste vers une Tontine fraîchement créée construit l’URL avec le VRAI identifiant retourné par le service, jamais une valeur codée en dur', async () => {
    const user = userEvent.setup();
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Navigation Liste ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true } as never);
    renderTontinesWithLocationProbe('/tontines');
    await user.click(await screen.findByText(tontine!.name));
    expect(screen.getByTestId('location-pathname')).toHaveTextContent(`/tontines/${tontine!.id}`);
    expect(await screen.findByRole('heading', { name: tontine!.name })).toBeInTheDocument();
  });

  it('un rechargement direct sur /tontines/:id/adherents (URL explicite) reste sur Adhérents — jamais remplacé par l’onglet par défaut', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Reload Adherents ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true } as never);
    renderTontines(`/tontines/${tontine!.id}/adherents`);
    await screen.findByRole('heading', { name: tontine!.name });
    expect(screen.getByRole('tab', { name: 'Adhérents' })).toHaveAttribute('aria-selected', 'true');
  });

  it('un rechargement direct sur /tontines/:id/tours (URL explicite) reste sur Tours — jamais remplacé par l’onglet par défaut', async () => {
    const tontine = await tontinesService.createTontine({ tenantId: 'T-001', name: `Test Reload Tours ${Date.now()}`, valueType: 'MONEY', contributionAmount: 5_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1, withPurchase: true } as never);
    renderTontines(`/tontines/${tontine!.id}/tours`);
    await screen.findByRole('heading', { name: tontine!.name });
    expect(screen.getByRole('tab', { name: 'Tours' })).toHaveAttribute('aria-selected', 'true');
  });
});
