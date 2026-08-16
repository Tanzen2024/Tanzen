import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function DetailPanel({ open, title, description, onClose, children }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl" aria-label={title}><header className="flex items-start justify-between border-b border-border p-5"><div><h2 className="text-lg font-semibold text-foreground">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div><button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fermer"><X size={18} /></button></header><div className="flex-1 overflow-y-auto p-5">{children}</div></aside>;
}
