import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export function StatCard({ label, value, detail, delta, icon: Icon, tone = 'info' }: { label: string; value: string; detail?: string; delta?: string; icon: LucideIcon; tone?: 'info' | 'success' | 'warning' | 'neutral' }) {
  const positive = delta?.startsWith('+');
  return <article className="rounded-xl border border-border bg-card p-5 shadow-sm"><div className={`mb-5 grid size-9 place-items-center rounded-lg ${tone === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950' : tone === 'warning' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950' : tone === 'neutral' ? 'bg-muted text-muted-foreground' : 'bg-blue-50 text-blue-700 dark:bg-blue-950'}`}><Icon size={18} /></div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p><div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">{delta && <span className={positive ? 'flex items-center text-emerald-700' : 'flex items-center text-rose-700'}>{positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{delta}</span>}{detail && <span>{detail}</span>}</div></article>;
}
