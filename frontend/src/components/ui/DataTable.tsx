import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Accessible / tooltip name when the header is an icon or abbreviation. */
  title?: string;
  render: (row: T, index: number) => ReactNode;
  sortValue?: (row: T) => number | string | null;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
  /** Hide below a breakpoint. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  /** Controlled sort; when given, sorting is applied by the caller. */
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
  onSortChange?: (s: { key: string; dir: 'asc' | 'desc' }) => void;
  className?: string;
  stickyHeader?: boolean;
  label: string;
  rowStyle?: (row: T) => React.CSSProperties | undefined;
}

const HIDE: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'max-sm:hidden',
  md: 'max-md:hidden',
  lg: 'max-lg:hidden',
  xl: 'max-xl:hidden',
  '2xl': 'max-2xl:hidden',
};

/** Shared, sortable, keyboard-selectable data table. Row height follows the density setting. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  selectedKey,
  defaultSort,
  sort: controlled,
  onSortChange,
  className,
  stickyHeader = true,
  label,
  rowStyle,
}: DataTableProps<T>) {
  const [internal, setInternal] = useState(defaultSort ?? null);
  const sort = controlled !== undefined ? controlled : internal;

  const sorted = useMemo(() => {
    if (!sort || controlled !== undefined) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, columns, sort, controlled]);

  const toggle = (key: string) => {
    const next = sort?.key === key ? { key, dir: sort.dir === 'asc' ? ('desc' as const) : ('asc' as const) } : { key, dir: 'asc' as const };
    if (onSortChange) onSortChange(next);
    if (controlled === undefined) setInternal(next);
  };

  const align = (a?: Column<T>['align']) => (a === 'right' ? 'text-right justify-end' : a === 'center' ? 'text-center justify-center' : 'text-left');

  return (
    <div className={cn('min-w-0 overflow-auto', className)}>
      <table className="w-full border-collapse text-[12px]" aria-label={label}>
        <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
          <tr className="bg-surface">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  title={c.title}
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('h-8 border-b border-line px-2 font-medium whitespace-nowrap text-fg-3 first:pl-pad last:pr-pad', align(c.align), c.hideBelow && HIDE[c.hideBelow], c.headerClassName)}
                >
                  {c.sortValue ? (
                    <button type="button" onClick={() => toggle(c.key)} className={cn('inline-flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase hover:text-fg-2', active && 'text-fg')}>
                      {c.header}
                      {active ? sort!.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                    </button>
                  ) : (
                    <span className="text-[11px] tracking-wide uppercase">{c.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const key = rowKey(row);
            const selected = selectedKey === key;
            return (
              <tr
                key={key}
                tabIndex={onRowClick ? 0 : undefined}
                aria-selected={onRowClick ? selected : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(row)) : undefined}
                style={rowStyle?.(row)}
                className={cn(
                  'h-row border-b border-line/70 transition-colors last:border-b-0',
                  onRowClick && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
                  selected && 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]',
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-2 whitespace-nowrap first:pl-pad last:pr-pad', align(c.align), c.hideBelow && HIDE[c.hideBelow], c.className)}>
                    {c.render(row, i)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
