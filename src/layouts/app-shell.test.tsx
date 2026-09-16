import { describe, it, expect } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { AppShell } from './app-shell';
import { tenants } from '@/mocks/organization/tenants';
import { useUiStore } from '@/stores/ui-store';

/**
 * Mandat "Refonte navigation/contexte" (2026-09-16, révisé le même jour pour
 * retirer le breadcrumb du bloc tenant) : le tenant courant et l'exercice
 * fiscal ne vivent plus QUE dans le header (`TenantBreadcrumb` +
 * `FiscalYearSelector`) — plus aucune instance dans le sidebar, à aucune
 * largeur d'écran. Le sidebar ne porte plus que le branding TANZEN ("TANZEN
 * ENTERPRISE", jamais "Plateforme") et la navigation. Le bloc tenant
 * n'affiche plus, depuis ce mandat, qu'une seule information : le tenant
 * courant — plus aucun fil de navigation fusionné.
 */
function renderShell(route: string) {
  return renderWithProviders(
    <Routes><Route path="/*" element={<AppShell><div>Contenu de page</div></AppShell>} /></Routes>,
    { route },
  );
}

describe('AppShell — un seul emplacement pour le tenant et l’exercice : le header, jamais le sidebar', () => {
  it('le header affiche le bloc tenant (tenant uniquement) et le sélecteur d’exercice', async () => {
    renderShell('/finance/accounts');

    const tenantBlock = await screen.findByTestId('tenant-current');
    expect(within(tenantBlock).getByText('Coopérative Sutura')).toBeInTheDocument();
    expect(within(tenantBlock).getByText('Tenant actuel')).toBeInTheDocument();
    expect(await screen.findByText('Exercice 2026', { exact: false })).toBeInTheDocument();
  });

  it('le sidebar ne contient plus aucune carte Tenant ni Exercice — uniquement le branding et la navigation', async () => {
    const { container } = renderShell('/finance/accounts');
    await screen.findByText('Exercice 2026', { exact: false });

    const aside = container.querySelector('aside');
    expect(aside).toBeTruthy();
    expect(within(aside!).queryByText('Tenant actuel')).not.toBeInTheDocument();
    expect(within(aside!).queryByText('Exercice', { exact: false })).not.toBeInTheDocument();
    // Exactement une seule instance dans tout le DOM (le header) — pas une deuxième planquée ailleurs.
    expect(screen.getAllByText('Tenant actuel')).toHaveLength(1);
  });

  it('le sidebar affiche « TANZEN / TANZEN ENTERPRISE » — jamais « Plateforme »', async () => {
    const { container } = renderShell('/finance/accounts');
    await screen.findByText('TANZEN');

    const aside = container.querySelector('aside');
    expect(within(aside!).getByText('TANZEN ENTERPRISE')).toBeInTheDocument();
    expect(screen.queryByText('Plateforme')).not.toBeInTheDocument();
  });
});

describe('AppShell — bandeau de branding pleine largeur, fond bleu/navy (mandat "Alignement et fond complet du bloc TANZEN Enterprise", 2026-09-16)', () => {
  it('le fond du bandeau compense le padding du sidebar (bleed) au lieu d’une carte flottante avec marges, et est bleu/navy (bg-primary), pas un fond clair', async () => {
    renderShell('/finance/accounts');
    await screen.findByText('TANZEN');

    const brandingText = screen.getByText('TANZEN ENTERPRISE');
    const band = brandingText.closest('div')?.parentElement;
    expect(band).toBeTruthy();
    expect(band).toHaveClass('-mx-3');
    expect(band).toHaveClass('bg-primary');
  });

  it('le bandeau démarre au sommet du sidebar et a la même hauteur que le header (h-16) — même niveau vertical que « Tenant actuel », par construction et pas par un padding calculé à la main', async () => {
    const { container } = renderShell('/finance/accounts');
    await screen.findByText('TANZEN');

    const band = screen.getByText('TANZEN ENTERPRISE').closest('div')?.parentElement;
    expect(band).toBeTruthy();
    // `-mt-4` annule le padding-top de l'<aside> (py-4) : le bandeau démarre à y=0, comme le header.
    expect(band).toHaveClass('-mt-4');
    // Même hauteur que `ShellHeader` (`h-16`), où vit le bloc « Tenant actuel ».
    expect(band).toHaveClass('h-16');
    const header = container.querySelector('header')!;
    expect(header).toHaveClass('h-16');
  });

  it('le padding de contenu du bandeau (px-3) est identique à celui de TenantBreadcrumb dans le header', async () => {
    renderShell('/finance/accounts');
    await screen.findByText('TANZEN');

    const band = screen.getByText('TANZEN ENTERPRISE').closest('div')?.parentElement;
    expect(band).toBeTruthy();
    expect(band).toHaveClass('px-3');

    const tenantCard = screen.getByTestId('tenant-current');
    expect(tenantCard).toHaveClass('px-3');
  });

  it('la largeur globale du sidebar reste inchangée (276px)', async () => {
    const { container } = renderShell('/finance/accounts');
    await screen.findByText('TANZEN');

    const aside = container.querySelector('aside')!;
    expect(aside.className).toContain('w-[276px]');
  });

  it('en mode réduit : le logo "T" et le bandeau restent, le texte TANZEN/TANZEN ENTERPRISE disparaît, sans débordement', async () => {
    // `useUiStore` est un singleton de module (zustand) — sa valeur fuiterait sinon vers les
    // autres tests de ce fichier ; on la restaure explicitement après ce test.
    renderShell('/finance/accounts');
    await screen.findByText('TANZEN');

    fireEvent.click(screen.getByRole('button', { name: 'Réduire le menu' }));

    expect(screen.queryByText('TANZEN')).not.toBeInTheDocument();
    expect(screen.queryByText('TANZEN ENTERPRISE')).not.toBeInTheDocument();
    // Le logo "T" du branding reste présent (seul élément dont le texte exact est "T").
    expect(screen.getByText('T')).toBeInTheDocument();
    useUiStore.setState({ sidebarCollapsed: false });
  });

  it('le bloc tenant affiche le tenant courant, jamais « TANZEN Enterprise »', async () => {
    renderShell('/finance/accounts');

    const tenantBlock = await screen.findByTestId('tenant-current');
    expect(within(tenantBlock).getByText('Coopérative Sutura')).toBeInTheDocument();
    expect(screen.queryByText('TANZEN Enterprise')).not.toBeInTheDocument();
  });

  it.each([
    ['/tontines', ['Tontines']],
    ['/organization/members', ['Organisation', 'Membres']],
    ['/finance/accounts', ['Finances', 'Comptes']],
    ['/finance/transactions', ['Finances', 'Transactions']],
  ])('page %s : branding, tenant et exercice cohabitent sans duplication, sans fil de navigation dans le bloc tenant', async (route, trailLabels) => {
    const { container } = renderShell(route);

    const tenantBlock = await screen.findByTestId('tenant-current');
    expect(within(tenantBlock).getByText('Coopérative Sutura')).toBeInTheDocument();
    trailLabels.forEach((label) => expect(within(tenantBlock).queryByText(label, { exact: false })).not.toBeInTheDocument());
    expect(await screen.findByText('Exercice 2026', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('TANZEN')).toBeInTheDocument();
    expect(within(container.querySelector('aside')!).queryByText('Tenant actuel')).not.toBeInTheDocument();
  });
});

describe('AppShell — header final (mandat "Finalisation header/layout", 2026-09-16) : plus de Recherche, Aide ni Système', () => {
  it('n’affiche plus l’icône/le contrôle de recherche', async () => {
    renderShell('/finance/accounts');
    await screen.findByText('Exercice 2026', { exact: false });

    expect(screen.queryByLabelText('Recherche globale')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Rechercher dans TANZEN/)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('n’affiche plus l’icône/le popover d’aide dans le header (le sidebar garde le sien)', async () => {
    const { container } = renderShell('/finance/accounts');
    await screen.findByText('Exercice 2026', { exact: false });

    const header = container.querySelector('header')!;
    expect(within(header).queryByLabelText('Aide')).not.toBeInTheDocument();
    // Le sidebar conserve sa propre affordance d'aide ("Besoin d'aide ?") — fonctionnalité non cassée.
    const aside = container.querySelector('aside')!;
    expect(within(aside).getByText("Besoin d'aide ?")).toBeInTheDocument();
  });

  it('ne propose plus « Système » — uniquement Clair/Sombre', async () => {
    const { container } = renderShell('/finance/accounts');
    await screen.findByText('Exercice 2026', { exact: false });

    const header = container.querySelector('header')!;
    expect(within(header).queryByText('Système', { exact: false })).not.toBeInTheDocument();
    expect(header.querySelector('#theme-switcher')).toBeNull();
    expect(within(header).getByRole('button', { name: 'Clair' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Sombre' })).toBeInTheDocument();
  });

  it('le thème bascule Clair → Sombre → Clair via le contrôle du header, sans option cachée', async () => {
    const { container } = renderShell('/finance/accounts');
    await screen.findByText('Exercice 2026', { exact: false });
    const header = container.querySelector('header')!;
    const lightButton = within(header).getByRole('button', { name: 'Clair' });
    const darkButton = within(header).getByRole('button', { name: 'Sombre' });

    expect(lightButton).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fireEvent.click(darkButton);
    expect(darkButton).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fireEvent.click(lightButton);
    expect(lightButton).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('AppShell — tenant.id reste l’identifiant technique, tenant.name seulement un libellé', () => {
  it('deux tenants distincts peuvent partager un nom sans collision d’identifiant', () => {
    const withDuplicateName = [...tenants, { ...tenants[0], id: 'T-DUPLICATE-NAME', name: tenants[0].name }];
    const ids = new Set(withDuplicateName.map((tenant) => tenant.id));
    expect(ids.size).toBe(withDuplicateName.length);
    expect(withDuplicateName.filter((tenant) => tenant.name === tenants[0].name)).toHaveLength(2);
  });
});
