import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AmountInput } from './amount-input';
import { setActiveRegionalFormat } from '@/lib/number-format';

/** Devise de l'association pilotée par le test (source : Paramètres → Organisation). */
const currency = vi.hoisted(() => ({ code: 'XAF' as string | undefined }));
vi.mock('@/hooks/use-organization-currency', () => ({ useOrganizationCurrency: () => currency.code }));

/** Espaces (fine insécable U+202F comprise) ramenés à une espace simple. */
const plain = (text: string) => text.replace(/\s/g, ' ');

/** Formulaire minimal : l'état ne contient que la valeur CANONIQUE, exposée pour vérification. */
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <><label htmlFor="amount">Montant</label><AmountInput id="amount" value={value} onValueChange={setValue} /><output data-testid="canonical">{value}</output><button type="button">Ailleurs</button></>;
}
const field = () => screen.getByLabelText('Montant') as HTMLInputElement;
const canonical = () => screen.getByTestId('canonical').textContent;

afterEach(() => { setActiveRegionalFormat(undefined); currency.code = 'XAF'; });

describe('AmountInput — format de l’association', () => {
  it('saisie formatée en direct (espace / virgule), valeur interne numérique propre', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), '2000000,50');
    expect(plain(field().value)).toBe('2 000 000,50');
    expect(canonical()).toBe('2000000.50');
    expect(field()).toHaveAttribute('type', 'text');
    expect(field()).toHaveAttribute('inputmode', 'decimal');
  });

  it.each([
    ['50000', '50 000'],
    ['2000000', '2 000 000'],
    ['3000000', '3 000 000'],
  ])('XAF (0 décimale) : « %s » affiché « %s » hors saisie', async (typed, shown) => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), typed);
    await user.click(screen.getByRole('button', { name: 'Ailleurs' }));
    expect(plain(field().value)).toBe(shown);
    expect(canonical()).toBe(typed);
  });

  it('devise à 2 décimales (EUR) : « 50 000,00 » ; format virgule / point → « 3,000,000.00 »', () => {
    currency.code = 'EUR';
    const { unmount } = render(<Harness initial="50000" />);
    expect(plain(field().value)).toBe('50 000,00');
    unmount();
    setActiveRegionalFormat({ thousandsSeparator: 'comma', decimalSeparator: 'period' });
    render(<Harness initial="3000000" />);
    expect(field().value).toBe('3,000,000.00');
  });

  it('virgule / point : « 2000000.50 » → « 2,000,000.50 »', async () => {
    setActiveRegionalFormat({ thousandsSeparator: 'comma', decimalSeparator: 'period' });
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), '2000000.50');
    expect(field().value).toBe('2,000,000.50');
    expect(canonical()).toBe('2000000.50');
  });

  it('valeur 0 puis valeur vide', async () => {
    const user = userEvent.setup();
    render(<Harness initial="0" />);
    expect(field().value).toBe('0');
    await user.clear(field());
    expect(field().value).toBe('');
    expect(canonical()).toBe('');
  });

  it('modifier une valeur déjà formatée remplace bien la valeur interne', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2000000" />);
    await user.clear(field());
    await user.type(field(), '2500000');
    expect(plain(field().value)).toBe('2 500 000');
    expect(canonical()).toBe('2500000');
  });

  it('copier / coller d’un montant dans un autre format (« 2,000,000.50 ») : interprété puis réécrit au format de l’association', () => {
    render(<Harness />);
    fireEvent.paste(field(), { clipboardData: { getData: () => '2,000,000.50' } });
    expect(plain(field().value)).toBe('2 000 000,50');
    expect(canonical()).toBe('2000000.50');
  });
});
