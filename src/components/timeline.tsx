import type { ReactNode } from 'react';

export function Timeline({ items }: { items: { id: string | number; title: string; date?: string; description?: ReactNode; tone?: 'default' | 'success' | 'warning' | 'error' }[] }) {
  return <ol className="space-y-5">{items.map((item) => <li key={item.id} className="relative flex gap-3"><span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${item.tone === 'success' ? 'bg-emerald-600' : item.tone === 'warning' ? 'bg-amber-600' : item.tone === 'error' ? 'bg-rose-600' : 'bg-primary'}`} /><div className="min-w-0"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-foreground">{item.title}</h3>{item.date && <time className="text-xs text-muted-foreground">{item.date}</time>}</div>{item.description && <div className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</div>}</div></li>)}</ol>;
}
