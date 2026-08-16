import { CardSkeleton, Skeleton, TableSkeleton } from '@/components/skeleton';

/**
 * Suspense fallback for lazy-loaded domain routes. Mirrors the page shell
 * (`mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7`, see e.g. tontines-module.tsx)
 * so there's no layout jump once the real page mounts.
 */
export function RouteLoadingFallback() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7" role="status" aria-live="polite" aria-busy="true">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <CardSkeleton count={3} />
      <TableSkeleton />
    </div>
  );
}
