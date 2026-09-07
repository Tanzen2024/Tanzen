import type { ReactNode } from 'react';

export function FormSection({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return <fieldset className={`rounded-xl border border-border bg-card p-5 shadow-sm${className ? ` ${className}` : ''}`}><legend className="px-2 text-sm font-semibold text-foreground">{title}</legend>{description && <p className="mb-5 text-sm leading-6 text-muted-foreground">{description}</p>}<div className="space-y-4">{children}</div></fieldset>;
}
