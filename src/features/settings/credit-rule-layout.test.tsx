import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { SettingsModule } from './settings-module';
import { loanRules } from '@/mocks/finance/loan-rules';

/**
 * Disposition du formulaire « Règle de crédit » (mandat UX du 2026-09-27, 2e révision) : les deux
 * colonnes indépendantes produisaient des cartes décalées (hauteurs de contenu trop différentes).
 * Désormais : une pile de cartes PLEINE LARGEUR dans l'ordre métier (Général, Conditions de prêt,
 * Garanties, Approbation), toutes sur la MÊME grille de champs 1 → 2 → 4 colonnes — colonnes alignées
 * d'une carte à l'autre, hauteurs naturelles, boutons juste sous la dernière carte.
 */
function renderCreditRule() {
  return renderWithProviders(<Routes><Route path="/settings/*" element={<SettingsModule />} /></Routes>, { route: '/settings/loan-rules' });
}
const FIELD_GRID = ['grid', 'gap-4', 'sm:grid-cols-2', 'lg:grid-cols-4'];
const sectionOf = (title: string) => screen.getByText(title, { selector: 'legend' }).closest('fieldset') as HTMLElement;
const cellOf = (label: string) => screen.getByLabelText(label).closest('.grid > *') as HTMLElement;

describe('Règle de crédit — disposition', () => {
  it('cartes pleine largeur empilées dans l’ordre métier, sans étirement, chacune sur la même grille de champs', async () => {
    renderCreditRule();
    await screen.findByDisplayValue('Politique Trésorerie Sutura');
    const sections = ['Général', 'Conditions de prêt', 'Garanties', 'Approbation'].map(sectionOf);
    const stack = sections[0].parentElement!;
    for (const section of sections) expect(section.parentElement).toBe(stack);
    expect(stack.className.split(' ')).toEqual(['grid', 'gap-6']); // une seule colonne : aucune carte à côté d'une autre
    for (let index = 1; index < sections.length; index += 1) expect(sections[index - 1].compareDocumentPosition(sections[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const section of sections) {
      expect(section.className).not.toMatch(/\b(min-h-|h-\d|h-full)/);
      expect(section.querySelector('.grid')!.className.split(' ')).toEqual(FIELD_GRID);
    }
  });

  it('Général : Nom et Mode sur les deux moitiés, « Autorise les prêts » sur toute la ligne', async () => {
    renderCreditRule();
    await screen.findByDisplayValue('Politique Trésorerie Sutura');
    expect(cellOf('Nom de la règle').className).toContain('lg:col-span-2');
    expect(cellOf('Mode de prêt').className).toContain('lg:col-span-2');
    expect(cellOf('Autorise les prêts').className).toContain('lg:col-span-4');
  });

  it('Conditions de prêt : « Plafond d’endettement » complète sa ligne (aucune demi-ligne vide)', async () => {
    renderCreditRule();
    await screen.findByDisplayValue('Politique Trésorerie Sutura');
    expect(cellOf("Plafond d'endettement").className).toContain('sm:col-span-2');
  });

  it('Garanties : ON → les deux interrupteurs sur les deux moitiés ; OFF → l’interrupteur seul sur toute la ligne', async () => {
    const user = userEvent.setup();
    // LR-001 est OFF dans les données DEMO : on part d'une règle « Garant requis » ON pour tester les deux dispositions.
    const rule = loanRules.find((item) => item.id === 'LR-001')!;
    const seeded = rule.requiresGuarantor;
    rule.requiresGuarantor = true;
    try {
    renderCreditRule();
    await screen.findByDisplayValue('Politique Trésorerie Sutura');
    expect(cellOf('Garant requis').className).toContain('lg:col-span-2');
    expect(cellOf('Auto-caution autorisée').className).toContain('lg:col-span-2');
    expect(cellOf('Garant requis').parentElement).toBe(cellOf('Garants min.').parentElement);
    await user.click(screen.getByRole('switch', { name: 'Garant requis' }));
    expect(cellOf('Garant requis').className).toContain('lg:col-span-4');
    expect(sectionOf('Garanties').querySelectorAll('.grid > *')).toHaveLength(1);
    } finally { rule.requiresGuarantor = seeded; }
  });

  it('Approbation : interrupteur sur toute la ligne, niveau de la même largeur que « Nom de la règle »', async () => {
    renderCreditRule();
    await screen.findByDisplayValue('Politique Trésorerie Sutura');
    expect(cellOf('Approbation requise').className).toContain('lg:col-span-4');
    expect(cellOf('Niveau d’approbation').className).toBe(cellOf('Nom de la règle').className);
  });

  it('les boutons forment leur propre ligne, alignés à droite, juste sous la pile de cartes', async () => {
    renderCreditRule();
    const save = await screen.findByRole('button', { name: 'Soumettre la modification' });
    const actions = save.parentElement!;
    expect(actions.className).toContain('justify-end');
    expect(actions.previousElementSibling).toBe(sectionOf('Général').parentElement);
  });
});
