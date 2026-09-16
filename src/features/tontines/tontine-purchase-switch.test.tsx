import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';
import { tontines } from '@/mocks/tontines/tontines';

/**
 * Mandat « Avec achat » — le formulaire de création/édition d'une tontine
 * MONEY doit utiliser exclusivement le terme « Avec achat » (jamais « Mode
 * achat »/« Mode d'achat »), avec un Switch ON/OFF, plus aucun select
 * « Caisse liée (Finance) » (la caisse « Achat tontine » est désormais
 * résolue automatiquement côté service — voir `tontine-purchase-account.test.ts`
 * pour la couverture métier). Tenant par défaut de `renderWithProviders` : T-001
 * (« Coopérative Sutura »), qui possède une caisse « Achat tontine » seedée
 * (AC-015, cf. mocks/finance/accounts.ts).
 */
function renderTontines(route: string) {
  return renderWithProviders(
    <Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>,
    { route },
  );
}

describe('Créer une tontine — « Avec achat » (switch), jamais « Mode achat »', () => {
  it('affiche le switch « Avec achat », jamais « Mode achat »/« Mode d’achat », et plus de « Caisse liée »', async () => {
    renderTontines('/tontines/create');
    await screen.findByRole('heading', { level: 1, name: 'Créer une tontine' });

    // « Avec achat » apparaît deux fois sur cette page : le libellé du switch ET, plus bas,
    // le résumé (FormSection « Résumé ») qui reprend le même libellé — comportement attendu,
    // pas une duplication accidentelle.
    expect(screen.getAllByText('Avec achat').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Avec achat')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.queryByText('Mode achat')).not.toBeInTheDocument();
    expect(screen.queryByText('Mode d’achat')).not.toBeInTheDocument();
    expect(screen.queryByText('Caisse liée (Finance)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Caisse liée (Finance)')).not.toBeInTheDocument();
  });

  it('OFF (par défaut) : la tontine créée est « Sans achat », sans caisse associée', async () => {
    const user = userEvent.setup();
    renderTontines('/tontines/create');
    await screen.findByRole('heading', { level: 1, name: 'Créer une tontine' });

    await user.type(screen.getByLabelText('Nom de la tontine *'), 'Tontine switch OFF');
    await user.type(screen.getByLabelText('Montant de cotisation *'), '50000');
    await user.selectOptions(screen.getByLabelText('Fréquence *'), 'DAILY');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(tontines.find((item) => item.name === 'Tontine switch OFF')).toBeTruthy());
    const created = tontines.find((item) => item.name === 'Tontine switch OFF');
    expect(created?.purchaseMode).toBe('WITHOUT_PURCHASE');
    expect(created?.purchaseAccountId).toBeUndefined();
  });

  it('ON : la tontine créée est « Avec achat », avec la caisse « Achat tontine » du tenant automatiquement associée', async () => {
    const user = userEvent.setup();
    renderTontines('/tontines/create');
    await screen.findByRole('heading', { level: 1, name: 'Créer une tontine' });

    await user.type(screen.getByLabelText('Nom de la tontine *'), 'Tontine switch ON');
    await user.type(screen.getByLabelText('Montant de cotisation *'), '50000');
    await user.selectOptions(screen.getByLabelText('Fréquence *'), 'DAILY');
    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(tontines.find((item) => item.name === 'Tontine switch ON')).toBeTruthy());
    const created = tontines.find((item) => item.name === 'Tontine switch ON');
    expect(created?.purchaseMode).toBe('WITH_PURCHASE');
    expect(created?.purchaseAccountId).toBe('AC-015'); // « Achat tontine » de T-001, jamais choisie manuellement
  });
});

describe('Fiche Tontine — le libellé « Avec achat » remplace « Mode d’achat » dans l’affichage en lecture seule', () => {
  it('affiche « Avec achat » avec Oui/Non, jamais « Mode achat »/« Mode d’achat »', async () => {
    renderTontines('/tontines/TON-004'); // MONEY, tenant T-001, purchaseMode WITHOUT_PURCHASE (seed)
    await screen.findByRole('heading', { level: 1, name: 'Coopérative Sutura' });

    expect(screen.getByText('Avec achat')).toBeInTheDocument();
    expect(screen.queryByText('Mode achat')).not.toBeInTheDocument();
    expect(screen.queryByText('Mode d’achat')).not.toBeInTheDocument();
  });
});
