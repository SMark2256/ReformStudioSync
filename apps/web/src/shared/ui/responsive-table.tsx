import * as React from 'react';

import { useIsMobile } from '@/shared/lib/hooks';
import { cn } from '@/shared/lib/utils';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from './table';

export interface ResponsiveTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** A fejléc csak képernyőolvasónak (pl. a soron belüli művelet oszlopa). */
  srOnlyHeader?: boolean;
  /** Számok: jobbra igazítva, `tabular-nums`. */
  align?: 'left' | 'right';
  hideOnMobile?: boolean;
  /** A sor fejléccellája (`th scope="row"`), jellemzően a név. */
  rowHeader?: boolean;
  className?: string;
}

export interface ResponsiveTableProps<T> {
  /** Rejtett `<caption>` (mobilon a lista neve). */
  caption: string;
  columns: ResponsiveTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Kattintás, Enter vagy szóköz a soron. */
  onRowOpen?: (row: T) => void;
  selectedRowId?: string | null;
  emptyText: string;
  className?: string;
}

// A soron belüli vezérlő (gomb, link, mező) a saját műveletét végzi, nem nyitja meg a sort.
// A sorból nyitott, portált elemek (menü, modál) eseményei a React-fán át ide is
// felbuborékolnak; ezek sem nyitják meg a sort.
function isFromNestedControl(event: React.SyntheticEvent<HTMLElement>) {
  if (!event.currentTarget.contains(event.target as Node)) return true;
  const control = (event.target as HTMLElement).closest(
    'a, button, input, select, textarea, [role="button"], [role="checkbox"], [role="combobox"], [role="switch"]',
  );
  return control !== null && control !== event.currentTarget;
}

function rowOpenHandlers<T>(row: T, onRowOpen?: (row: T) => void) {
  if (!onRowOpen) return {};
  return {
    tabIndex: 0,
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      if (!isFromNestedControl(event)) onRowOpen(row);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (isFromNestedControl(event)) return;
      event.preventDefault();
      onRowOpen(row);
    },
  };
}

const openableRowClassName =
  'cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

/**
 * Lista adatokkal (UI-specifikáció 5.6, 9.): `md` felett táblázat, alatta kártyasor
 * `címke: érték` párokkal, vízszintes görgetés nélkül.
 */
export function ResponsiveTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  onRowOpen,
  selectedRowId,
  emptyText,
  className,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    const mobileColumns = columns.filter((column) => !column.hideOnMobile);
    if (rows.length === 0) {
      return (
        <p
          className={cn(
            'py-7 text-center text-[13px] text-muted-foreground',
            className,
          )}
        >
          {emptyText}
        </p>
      );
    }
    return (
      <ul
        aria-label={caption}
        className={cn('divide-y divide-border', className)}
      >
        {rows.map((row) => {
          const id = getRowId(row);
          return (
            <li
              key={id}
              data-state={id === selectedRowId ? 'selected' : undefined}
              className={cn(
                'px-3.5 py-3 data-[state=selected]:bg-primary-soft',
                onRowOpen && openableRowClassName,
              )}
              {...rowOpenHandlers(row, onRowOpen)}
            >
              <dl className="grid gap-1.5">
                {mobileColumns.map((column) => (
                  <div
                    key={column.key}
                    className="flex items-baseline justify-between gap-3"
                  >
                    {column.srOnlyHeader ? (
                      <dt className="sr-only">{column.header}</dt>
                    ) : (
                      <dt className="shrink-0 text-xs font-semibold text-muted-foreground">
                        {column.header}
                      </dt>
                    )}
                    <dd
                      className={cn(
                        'min-w-0 text-right text-[13px] text-foreground',
                        column.align === 'right' && 'tabular-nums',
                        column.srOnlyHeader && 'ml-auto',
                      )}
                    >
                      {column.cell(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Table className={className}>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead
              key={column.key}
              className={cn(
                column.align === 'right' && 'text-right',
                column.className,
              )}
            >
              {column.srOnlyHeader ? (
                <span className="sr-only">{column.header}</span>
              ) : (
                column.header
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="py-7 text-center text-muted-foreground"
            >
              {emptyText}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const id = getRowId(row);
            return (
              <TableRow
                key={id}
                data-state={id === selectedRowId ? 'selected' : undefined}
                className={cn(onRowOpen && openableRowClassName)}
                {...rowOpenHandlers(row, onRowOpen)}
              >
                {columns.map((column) => {
                  const Cell = column.rowHeader ? TableRowHeader : TableCell;
                  return (
                    <Cell
                      key={column.key}
                      className={cn(
                        column.align === 'right' && 'text-right tabular-nums',
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </Cell>
                  );
                })}
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
