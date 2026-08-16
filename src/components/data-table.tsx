import type { ReactNode } from 'react';
import type { TableColumn } from '@/types/ui';

export function DataTable<T extends { id: string | number }>({ columns, rows, empty }: { columns: TableColumn<T>[]; rows: T[]; empty?: ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr>{columns.map((column) => <th key={column.key} scope="col" className={`px-4 py-3 font-semibold ${column.className ?? ''}`}>{column.header}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.id} className="transition-colors hover:bg-muted/30">{columns.map((column) => <td key={column.key} className={`px-4 py-3 text-foreground ${column.className ?? ''}`}>{column.render ? column.render(row) : String(row[column.key as keyof T] ?? '')}</td>)}</tr>)}</tbody></table></div>{rows.length === 0 && empty}</div>;
}
