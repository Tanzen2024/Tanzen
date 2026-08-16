export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex gap-6">{Array.from({ length: columns }).map((_, index) => <Skeleton key={index} className="h-3 w-20" />)}</div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-6 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, column) => <Skeleton key={column} className={`h-3.5 ${column === 0 ? 'w-32' : 'w-16'}`} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <Skeleton className="mb-5 size-9 rounded-lg" />
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-xl" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" /></div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
