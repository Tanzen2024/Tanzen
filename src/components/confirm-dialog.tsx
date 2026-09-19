import { useEffect, type ReactNode } from 'react';

/**
 * `secondaryLabel`/`onSecondary` — extension additive (mandat « ajouter et
 * planifier en une seule étape ») : un second bouton d'action optionnel
 * entre Annuler et le bouton principal, jamais affiché si non fourni —
 * aucun des appels existants (confirm/cancel uniquement) n'est affecté.
 */
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', secondaryLabel, onConfirm, onCancel, onSecondary, children, confirmDisabled = false, secondaryDisabled = false }: { open: boolean; title: string; description?: string; confirmLabel?: string; cancelLabel?: string; secondaryLabel?: string; onConfirm: () => void; onCancel: () => void; onSecondary?: () => void; children?: ReactNode; confirmDisabled?: boolean; secondaryDisabled?: boolean }) {
  /** Fermeture au clavier (Échap) — accessibilité générique à ce composant partagé, jamais un comportement réimplémenté par un des appelants. */
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={onCancel}><div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><h2 id="confirm-title" className="text-lg font-semibold text-foreground">{title}</h2>{description && <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>}{children}<div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">{cancelLabel}</button>{onSecondary && secondaryLabel && <button type="button" onClick={onSecondary} disabled={secondaryDisabled} className="rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">{secondaryLabel}</button>}<button type="button" onClick={onConfirm} disabled={confirmDisabled} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-50">{confirmLabel}</button></div></div></div>;
}
