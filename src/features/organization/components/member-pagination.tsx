import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { MEMBER_PAGE_SIZES } from '../hooks/use-member-directory';

type T = (section: 'organization' | 'nav', key: string, values?: Record<string, string>) => string;

/** Fenêtre de pages à afficher autour de la page courante (style « 1 2 3 4 5 … 20 » de la maquette), jamais toutes les pages à la fois. */
function pageWindow(current: number, count: number): (number | 'ellipsis')[] {
  const pages = new Set([1, count, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= count).sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];
  sorted.forEach((page, index) => { if (index > 0 && page - sorted[index - 1] > 1) result.push('ellipsis'); result.push(page); });
  return result;
}

export function MemberPagination({ t, page, pageCount, pageSize, total, onPageChange, onPageSizeChange }: {
  t: T; page: number; pageCount: number; pageSize: number; total: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{t('organization', 'paginationRange', { from: String(from), to: String(to), total: String(total) })}</span>
      <label className="flex items-center gap-1.5">
        <span className="sr-only">{t('organization', 'perPageLabel')}</span>
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          {MEMBER_PAGE_SIZES.map((size) => <option key={size} value={size}>{t('organization', 'perPage', { count: String(size) })}</option>)}
        </select>
      </label>
    </div>
    {pageCount > 1 && <Pagination className="mx-0 w-auto">
      <PaginationContent>
        <PaginationItem><PaginationPrevious href="#" aria-disabled={page === 1} className={page === 1 ? 'pointer-events-none opacity-50' : ''} onClick={(event) => { event.preventDefault(); onPageChange(Math.max(1, page - 1)); }} /></PaginationItem>
        {pageWindow(page, pageCount).map((entry, index) => entry === 'ellipsis' ? <PaginationItem key={`e-${index}`}><PaginationEllipsis /></PaginationItem> : <PaginationItem key={entry}><PaginationLink href="#" isActive={entry === page} onClick={(event) => { event.preventDefault(); onPageChange(entry); }}>{entry}</PaginationLink></PaginationItem>)}
        <PaginationItem><PaginationNext href="#" aria-disabled={page === pageCount} className={page === pageCount ? 'pointer-events-none opacity-50' : ''} onClick={(event) => { event.preventDefault(); onPageChange(Math.min(pageCount, page + 1)); }} /></PaginationItem>
      </PaginationContent>
    </Pagination>}
  </div>;
}
