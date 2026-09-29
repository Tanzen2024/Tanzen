import { forwardRef, useLayoutEffect, useRef, useState, type ClipboardEvent, type ChangeEvent } from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import { useOrganizationCurrency } from '@/hooks/use-organization-currency';
import { getCurrencyDecimals } from '@/constants/currencies';
import { amountInputToCanonical, canonicalToAmountText, decimalSeparatorChar, formatAmountInput, getActiveRegionalFormat, parsePastedAmount } from '@/lib/number-format';

export type AmountInputProps = Omit<InputProps, 'value' | 'defaultValue' | 'onChange' | 'type'> & {
  /** Valeur CANONIQUE (« 2000000.5 », « » si vide) — jamais une chaîne avec séparateurs de milliers. */
  value: string;
  onValueChange: (value: string) => void;
};

/** Nombre de caractères « significatifs » (chiffres + séparateur décimal) avant `position` — sert à replacer le curseur après reformatage. */
function significantBefore(text: string, position: number, decimal: string): number {
  let count = 0;
  for (const char of text.slice(0, position)) if ((char >= '0' && char <= '9') || char === decimal || char === '-') count += 1;
  return count;
}

function positionAfterSignificant(text: string, count: number, decimal: string): number {
  if (count === 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if ((char >= '0' && char <= '9') || char === decimal || char === '-') seen += 1;
    if (seen === count) return index + 1;
  }
  return text.length;
}

/**
 * CHAMP MONTANT (mandat « Formatage des montants », 2026-09-27) : affiche et reformate la saisie
 * selon le FORMAT RÉGIONAL DE L'ASSOCIATION (`lib/number-format`, Paramètres → Organisation) et
 * les décimales de SA devise (`getCurrencyDecimals`) — aucun format propre au champ. Même rendu
 * que `Input` (hauteur, bordure, typographie) ; seul `type="text"` + `inputMode="decimal"`.
 *
 * Le formulaire ne voit que la valeur canonique (`value` / `onValueChange`) : validations,
 * comparaisons et `Number()` à l'enregistrement restent inchangés.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(({ value, onValueChange, onFocus, onBlur, ...props }, forwardedRef) => {
  const currency = useOrganizationCurrency();
  const decimals = getCurrencyDecimals(currency);
  const maxFractionDigits = Math.max(decimals, 2);
  const format = getActiveRegionalFormat();
  const decimalChar = decimalSeparatorChar(format);
  /** Texte en cours de frappe (champ focalisé) ; hors focus, l'affichage dérive toujours de `value`. */
  const [draft, setDraft] = useState<string | null>(null);
  const innerRef = useRef<HTMLInputElement | null>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !innerRef.current) return;
    innerRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  const commit = (text: string, caretSignificant: number | null) => {
    const next = formatAmountInput(text, format, maxFractionDigits);
    setDraft(next);
    if (caretSignificant !== null) pendingCaret.current = positionAfterSignificant(next, caretSignificant, decimalChar);
    const canonical = amountInputToCanonical(next, format);
    if (canonical !== value) onValueChange(canonical);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    commit(raw, significantBefore(raw, event.target.selectionStart ?? raw.length, decimalChar));
  };

  // Collage : format libre (« 2,000,000.50 », « 2 000 000,50 »…) interprété puis réécrit au format de l'association.
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const current = input.value;
    const pasted = event.clipboardData.getData('text');
    const start = input.selectionStart ?? current.length;
    const end = input.selectionEnd ?? current.length;
    const whole = start === 0 && end === current.length;
    const canonical = whole ? parsePastedAmount(pasted, format) : null;
    event.preventDefault();
    if (whole) { if (canonical !== null) commit(canonical.replace('.', decimalChar), null); return; }
    const raw = current.slice(0, start) + pasted + current.slice(end);
    commit(raw, significantBefore(raw, start + pasted.length, decimalChar));
  };

  return <Input
    {...props}
    ref={(node) => { innerRef.current = node; if (typeof forwardedRef === 'function') forwardedRef(node); else if (forwardedRef) forwardedRef.current = node; }}
    type="text"
    inputMode="decimal"
    autoComplete="off"
    value={draft ?? canonicalToAmountText(value, format, decimals)}
    onChange={handleChange}
    onPaste={handlePaste}
    onFocus={(event) => { setDraft(formatAmountInput(canonicalToAmountText(value, format, 0), format, maxFractionDigits)); onFocus?.(event); }}
    onBlur={(event) => { setDraft(null); onBlur?.(event); }}
  />;
});
AmountInput.displayName = 'AmountInput';
