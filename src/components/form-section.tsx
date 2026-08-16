import type { ReactNode } from 'react';

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <fieldset className="rounded-xl border border-border bg-card p-5 shadow-sm"><legend className="px-2 text-sm font-semibold text-foreground">{title}</legend>{description && <p className="mb-5 text-sm leading-6 text-muted-foreground">{description}</p>}<div className="space-y-4">{children}</div></fieldset>;
}
