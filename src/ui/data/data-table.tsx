'use client';

import * as React from 'react';
import { GripVertical, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useColumnPrefs } from './use-column-prefs';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  // Columns without a header (row actions) can't be pinned or moved.
}

const FROZEN_CELL =
  'sticky z-[1] bg-surface before:pointer-events-none before:absolute before:inset-0 before:-z-10 group-hover/row:before:bg-hover/50';
const FROZEN_EDGE = 'shadow-[inset_-1px_0_0_var(--color-line)]';

// One table for every list: a sticky header, columns the viewer can pin to the left (frozen while the rest
// scrolls sideways) and move (drag the grip, or ←/→ on it). Pins and order are remembered per `tableId`.
export function DataTable<T>({
  tableId,
  columns,
  rows,
  rowKey,
  defaultPinned = [],
  footer,
  maxHeight = 'max-h-[calc(100dvh-12rem)]',
  empty,
}: {
  tableId: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  defaultPinned?: readonly string[];
  // A totals row: content per column key.
  footer?: Partial<Record<string, React.ReactNode>>;
  maxHeight?: string;
  empty?: React.ReactNode;
}) {
  const { pinned, togglePin, order, saveOrder } = useColumnPrefs(tableId, defaultPinned);
  const isPinned = (c: Column<T>) => !!c.header && pinned.includes(c.key);
  const rank = (c: Column<T>) => {
    const i = order.indexOf(c.key);
    return i < 0 ? order.length + columns.indexOf(c) : i;
  };
  const arranged = order.length ? [...columns].sort((a, b) => rank(a) - rank(b)) : columns;
  const ordered = [...arranged.filter(isPinned), ...arranged.filter((c) => !isPinned(c))];
  const keys = ordered.map((c) => c.key);

  const [dragKey, setDragKey] = React.useState<string | null>(null);
  const [dropKey, setDropKey] = React.useState<string | null>(null);
  const headRef = React.useRef<HTMLTableRowElement>(null);
  // Re-ordering moves the header cell in the DOM, which drops focus; put it back on the moved grip.
  const [moved, setMoved] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (moved) headRef.current?.querySelector<HTMLButtonElement>(`[data-grip="${moved}"]`)?.focus();
  }, [moved, order]);
  const moveTo = (key: string, target: string) => {
    if (key === target) return;
    const next = keys.filter((k) => k !== key);
    next.splice(next.indexOf(target) + (keys.indexOf(key) < keys.indexOf(target) ? 1 : 0), 0, key);
    saveOrder(next);
  };
  const step = (key: string, by: -1 | 1) => {
    const neighbour = keys[keys.indexOf(key) + by];
    if (neighbour) moveTo(key, neighbour);
  };

  // Each frozen column sits at the summed live widths of the frozen columns before it.
  const frozen = ordered.filter(isPinned).map((c) => c.key);
  const [widths, setWidths] = React.useState<Record<string, number>>({});
  const measure = (key: string) => (el: HTMLTableCellElement | null) => {
    if (!el || !frozen.includes(key)) return;
    const ro = new ResizeObserver(() => setWidths((w) => (w[key] === el.offsetWidth ? w : { ...w, [key]: el.offsetWidth })));
    ro.observe(el);
    return () => ro.disconnect();
  };
  const frozenStyle = (key: string, header: boolean) => {
    const i = frozen.indexOf(key);
    if (i < 0) return { style: undefined, className: undefined };
    return {
      style: { left: frozen.slice(0, i).reduce((s, k) => s + (widths[k] ?? 0), 0) },
      className: cn(header ? 'bg-sunken sticky z-20' : FROZEN_CELL, key === frozen[frozen.length - 1] && FROZEN_EDGE),
    };
  };
  const align = (c: Column<T>) => (c.align === 'right' ? 'text-right' : 'text-left');

  if (!rows.length) return <>{empty}</>;

  return (
    <div className={cn('bg-surface relative overflow-auto rounded-lg border', maxHeight)}>
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10">
          <tr ref={headRef}>
            {ordered.map((c) => {
              const f = frozenStyle(c.key, true);
              const pin = isPinned(c);
              return (
                <th
                  key={c.key}
                  ref={measure(c.key)}
                  style={f.style}
                  onDragOver={dragKey ? (e) => (e.preventDefault(), dropKey !== c.key && setDropKey(c.key)) : undefined}
                  onDragLeave={() => dropKey === c.key && setDropKey(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragKey) moveTo(dragKey, c.key);
                    setDragKey(null);
                    setDropKey(null);
                  }}
                  className={cn(
                    'group/th bg-sunken text-muted-foreground h-9 border-b px-3 align-middle text-[11px] font-bold tracking-wide whitespace-nowrap uppercase',
                    align(c),
                    f.className,
                    dragKey === c.key && 'opacity-50',
                    dropKey === c.key && dragKey !== c.key && 'bg-primary/10'
                  )}
                >
                  <span className={cn('inline-flex items-center gap-1', c.align === 'right' && 'flex-row-reverse')}>
                    {c.header && (
                      <button
                        type="button"
                        data-grip={c.key}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', c.key);
                          setDragKey(c.key);
                        }}
                        onDragEnd={() => (setDragKey(null), setDropKey(null))}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                            e.preventDefault();
                            setMoved(c.key);
                            step(c.key, e.key === 'ArrowLeft' ? -1 : 1);
                          }
                        }}
                        aria-label={`Move ${c.header}: drag, or use the left and right arrow keys`}
                        title="Drag to move the column"
                        className="hover:text-foreground flex size-4 cursor-grab items-center justify-center rounded opacity-0 outline-none group-hover/th:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
                      >
                        <GripVertical className="size-3" />
                      </button>
                    )}
                    {c.header}
                    {c.header && (
                      <button
                        type="button"
                        aria-pressed={pin}
                        aria-label={pin ? `Unpin ${c.header}` : `Pin ${c.header}`}
                        title={pin ? 'Unpin column' : 'Pin column: keep it in view while scrolling'}
                        onClick={() => togglePin(c.key)}
                        className={cn(
                          'hover:text-foreground flex size-4 items-center justify-center rounded outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40',
                          pin ? 'text-primary' : 'opacity-0 group-hover/th:opacity-100'
                        )}
                      >
                        {pin ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                      </button>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="group/row hover:bg-hover/50">
              {ordered.map((c) => {
                const f = frozenStyle(c.key, false);
                return (
                  <td
                    key={c.key}
                    style={f.style}
                    className={cn('h-10 border-b px-3 py-1.5 align-middle whitespace-nowrap', align(c), c.className, f.className)}
                  >
                    {c.render(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className="sticky bottom-0 z-10">
            <tr>
              {ordered.map((c) => {
                const f = frozenStyle(c.key, true);
                return (
                  <td
                    key={c.key}
                    style={f.style}
                    className={cn('bg-sunken h-9 border-t px-3 text-sm font-bold whitespace-nowrap', align(c), f.className)}
                  >
                    {footer[c.key]}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
