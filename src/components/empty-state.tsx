import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-8 text-center">{Icon && <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Icon size={20} /></div>}<h2 className="text-sm font-semibold text-foreground">{title}</h2>{description && <p className="max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>}{action}</div>;
}
