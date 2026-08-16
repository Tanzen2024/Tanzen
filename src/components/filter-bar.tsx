import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';

export function FilterBar({ search, onSearchChange, placeholder = 'Rechercher', filters, onClear }: { search?: string; onSearchChange?: (value: string) => void; placeholder?: string; filters?: ReactNode; onClear?: () => void }) {
  return <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm text-muted-foreground"><Search size={16} /><input value={search ?? ''} onChange={(event) => onSearchChange?.(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" /></label><div className="flex flex-wrap items-center gap-2">{filters}{onClear && <button type="button" onClick={onClear} className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><X size={14} /> Effacer</button>}</div></div>;
}
