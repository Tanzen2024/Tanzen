import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';

export function ErrorState({ title, description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  const { t } = useLocale();
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-8 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle size={20} /></div>
      <h2 className="text-sm font-semibold text-foreground">{title ?? t('system', 'errorTitle')}</h2>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">{description ?? t('system', 'errorDescription')}</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-1 inline-flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"><RotateCcw size={15} />{t('system', 'retry')}</button>}
    </div>
  );
}
