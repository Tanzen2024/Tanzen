import { Loader2 } from 'lucide-react';

export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
      <Loader2 size={22} className="animate-spin" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
