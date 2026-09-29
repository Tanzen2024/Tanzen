import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { SettingsModule } from './settings-module';
import { organizationSettingsList } from '@/mocks/settings/organization-settings';
import { tenants } from '@/mocks/organization/tenants';
import { settingsService } from '@/services/settings.service';
import { organizationService } from '@/services/organization.service';
import { DEFAULT_COUNTRY } from '@/constants/countries';
import { DEFAULT_CURRENCY_CODE } from '@/constants/currencies';

/**
 * Valeurs par défaut de l'Organisation (mandat du 2026-09-27) : pays « Cameroun », devise XAF
 * (« Franc CFA d’Afrique centrale (XAF) ») — de vraies valeurs du modèle, appliquées à la
 * création / quand la valeur est absente, jamais en écrasement d'une valeur déjà enregistrée.
 */
const SETTINGS_SEED = structuredClone(organizationSettingsList);
const TENANTS_SEED = structuredClone(tenants);
const restore = () => {
  organizationSettingsList.splice(0, organizationSettingsList.length, ...structuredClone(SETTINGS_SEED));
  tenants.splice(0, tenants.length, ...structuredClone(TENANTS_SEED));
};
beforeEach(restore);
afterEach(restore);

const XAF_LABEL = 'Franc CFA d’Afrique centrale (XAF)';
const t001 = () => tenants.find((tenant) => tenant.id === 'T-001')!;
const settingsOf = (tenantId: string) => organizationSettingsList.find((item) => item.tenantId === tenantId);
function renderOrganization() {
  return renderWithProviders(<Routes><Route path="/settings/*" element={<SettingsModule />} /></Routes>, { route: '/settings/organization' });
}
const selectedLabel = (select: HTMLSelectElement) => select.options[select.selectedIndex]?.textContent;

describe('Organisation — valeurs par défaut (Cameroun / XAF)', () => {
  it('les constantes par défaut : pays « Cameroun », devise XAF', () => {
    expect(DEFAULT_COUNTRY).toBe('Cameroun');
    expect(DEFAULT_CURRENCY_CODE).toBe('XAF');
  });

  it('configuration initiale : une association sans paramètres est initialisée en XAF (valeur ENREGISTRÉE, pas seulement affichée)', async () => {
    organizationSettingsList.splice(organizationSettingsList.findIndex((item) => item.tenantId === 'T-001'), 1);
    expect(await settingsService.getOrganizationSettings('T-001')).toMatchObject({ tenantId: 'T-001', currency: 'XAF', thousandsSeparator: 'space', decimalSeparator: 'comma', dateFormat: 'DD/MM/YYYY' });
    expect(settingsOf('T-001')?.currency).toBe('XAF');
  });

  it('pays absent : « Cameroun » est enregistré sur l’organisation', async () => {
    t001().country = '';
    expect((await organizationService.getTenant('T-001', 'T-001'))?.country).toBe('Cameroun');
    expect(t001().country).toBe('Cameroun');
  });

  it('devise absente : complétée en XAF, les autres paramètres conservés', async () => {
    Object.assign(settingsOf('T-001')!, { currency: '', thousandsSeparator: 'period', decimalSeparator: 'comma' });
    expect(await settingsService.getOrganizationSettings('T-001')).toMatchObject({ currency: 'XAF', thousandsSeparator: 'period' });
  });

  it('écran : Pays « Cameroun » et Devise « Franc CFA d’Afrique centrale (XAF) »', async () => {
    renderOrganization();
    const section = await screen.findByTestId('regional-format');
    const currency = within(section).getByLabelText('Devise') as HTMLSelectElement;
    await vi.waitFor(() => expect(currency.value).toBe('XAF'));
    expect(selectedLabel(currency)).toBe(XAF_LABEL);
    expect(screen.getByText('Cameroun')).toBeInTheDocument();
  });

  it('organisation existante avec un autre pays / une autre devise : rien n’est écrasé', async () => {
    t001().country = 'Sénégal';
    settingsOf('T-001')!.currency = 'XOF';
    expect((await organizationService.getTenant('T-001', 'T-001'))?.country).toBe('Sénégal');
    expect((await settingsService.getOrganizationSettings('T-001'))?.currency).toBe('XOF');
    renderOrganization();
    const currency = within(await screen.findByTestId('regional-format')).getByLabelText('Devise') as HTMLSelectElement;
    await vi.waitFor(() => expect(currency.value).toBe('XOF'));
    expect(screen.getByText('Sénégal')).toBeInTheDocument();
    expect(screen.queryByText('Cameroun')).not.toBeInTheDocument();
    expect(t001().country).toBe('Sénégal');
  });

  it('la devise reste modifiable : XAF → XOF enregistrée', async () => {
    const user = userEvent.setup();
    renderOrganization();
    const currency = within(await screen.findByTestId('regional-format')).getByLabelText('Devise') as HTMLSelectElement;
    await vi.waitFor(() => expect(currency.value).toBe('XAF'));
    await user.selectOptions(currency, 'XOF');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await vi.waitFor(() => expect(settingsOf('T-001')?.currency).toBe('XOF'));
  });
});
