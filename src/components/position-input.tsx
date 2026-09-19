import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

/**
 * Champ de position directement modifiable (refonte UX Planification tontines
 * §3/§7 — remplace le glisser-déposer) — état local non contrôlé pendant la
 * frappe, ne commet qu'au blur/Entrée. Une valeur non entière ou vide revient
 * silencieusement à la dernière position CONNUE — jamais de position
 * inventée affichée, jamais l'UI seule responsable de la validité.
 *
 * Hors bornes : par défaut (`clampOutOfRange` absent/`false`, ex. `PlanSection`
 * — position déjà PERSISTÉE côté service) refusé et reverté, cohérent avec le
 * refus explicite de `setPlanPosition`. Avec `clampOutOfRange: true` (ex.
 * `AddAdherentsDialog` — ordre encore LOCAL, rien n'est persisté avant
 * validation du Dialog), normalisé vers la borne la plus proche (mandat
 * « Ajouter des adhérents + position » : `10` sur 4 membres sélectionnés
 * devient `4`) — toujours une séquence valide, jamais une position rejetée
 * pour un simple dépassement le temps de composer sa sélection.
 *
 * Partagé entre `PlanSection` (position persistée immédiatement via
 * `setPlanPosition`) et `AddAdherentsDialog` (ordre encore local, non
 * persisté avant validation du Dialog) — même composant, jamais deux
 * implémentations divergentes du même besoin.
 */
export function PositionInput({ value, min, max, disabled, onCommit, clampOutOfRange = false, 'aria-label': ariaLabel }: { value: number; min: number; max: number; disabled: boolean; onCommit: (next: number) => void; clampOutOfRange?: boolean; 'aria-label'?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isInteger(parsed)) { setDraft(String(value)); return; }
    let next = parsed;
    if (next < min || next > max) {
      if (!clampOutOfRange) { setDraft(String(value)); return; }
      next = Math.min(Math.max(next, min), max);
    }
    if (next !== value) onCommit(next); else setDraft(String(value));
  };
  return <Input
    type="number" inputMode="numeric" min={min} max={max} step={1} disabled={disabled} value={draft}
    aria-label={ariaLabel}
    className="h-8 w-16 shrink-0 text-center font-mono text-xs"
    onChange={(event) => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
  />;
}
