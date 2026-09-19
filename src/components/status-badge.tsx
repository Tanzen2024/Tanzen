import type { StatusTone } from '@/types/ui';

export function StatusBadge({ label, tone = 'default' }: { label: string; tone?: StatusTone }) {
  const styles: Record<StatusTone, string> = { default: 'bg-muted text-muted-foreground', success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', error: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300', info: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300', orange: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}><span className="mr-1.5 size-1.5 rounded-full bg-current" />{label}</span>;
}
