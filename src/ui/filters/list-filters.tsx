'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import { CalendarRange, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { DATE_RANGES, LIST_PARAMS, type ListSpec, type Tone } from '@/lib/list-spec';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { NativeSelect } from '../primitives/native-select';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '../primitives/sheet';
import { useUrlFilters } from './use-url-filters';

const DOT: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/60',
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  info: 'bg-info',
};

// The most-used filter, always in view: one segmented control over `status`, with live counts.
function QuickChips({ spec, counts }: { spec: NonNullable<ListSpec['quick']>; counts?: Record<string, number> }) {
  const { get, setParams } = useUrlFilters();
  const current = get('status');
  const items = [{ value: '', label: 'All', tone: undefined }, ...spec.options];
  return (
    <div role="group" aria-label={spec.label} className="bg-sunken flex flex-wrap items-center gap-0.5 rounded-lg p-0.5">
      {items.map((o) => {
        const active = current === o.value;
        const n = counts?.[o.value];
        return (
          <button
            key={o.value || 'all'}
            type="button"
            aria-pressed={active}
            onClick={() => setParams({ status: o.value || null })}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
              active ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.tone && <span aria-hidden className={cn('size-1.5 rounded-full', DOT[o.tone])} />}
            {o.label}
            {n !== undefined && <span className="tabular text-muted-foreground min-w-[2ch] text-right text-xs font-medium">{formatCount(n)}</span>}
          </button>
        );
      })}
    </div>
  );
}

// "Search by [field ▾]": the box always says what it searches.
function SearchBy({ fields }: { fields: NonNullable<ListSpec['search']> }) {
  const { get, setParams } = useUrlFilters();
  const [by, setBy] = useState(get('by') || fields[0]!.value);
  const [value, setValue] = useState(get('q'));
  const urlQ = get('q');
  const last = useRef(urlQ);
  useEffect(() => {
    if (urlQ !== last.current) {
      last.current = urlQ;
      setValue(urlQ);
    }
  }, [urlQ]);
  useEffect(() => {
    if (value === last.current) return;
    const t = setTimeout(() => {
      last.current = value;
      setParams({ q: value.trim() || null, by: value.trim() ? by : null });
    }, 350);
    return () => clearTimeout(t);
  }, [value, by, setParams]);
  const label = fields.find((f) => f.value === by)?.label ?? '';

  return (
    <div className="border-field bg-surface focus-within:border-ring focus-within:ring-ring/30 flex h-8 w-80 items-center overflow-hidden rounded-md border focus-within:ring-[3px]">
      {fields.length > 1 && (
        <>
          <NativeSelect
            aria-label="Search by"
            value={by}
            onChange={(e) => {
              setBy(e.target.value);
              if (value.trim()) setParams({ by: e.target.value });
            }}
            className="text-muted-foreground h-full w-auto shrink-0 rounded-none border-0 bg-transparent pr-6 text-xs font-semibold focus-visible:ring-0"
          >
            {fields.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
          <span className="bg-line h-4 w-px shrink-0" />
        </>
      )}
      <div className="relative min-w-0 flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Search by ${label.toLowerCase()}…`}
          aria-label={`Search by ${label}`}
          className="placeholder:text-muted-foreground h-full w-full bg-transparent pr-2 pl-7 text-sm outline-none"
        />
      </div>
    </div>
  );
}

function useActiveChips(spec: ListSpec) {
  const { get } = useUrlFilters();
  const chips: { key: string; label: string; params: string[] }[] = [];
  const range = get('range');
  if (spec.dates && (range || get('from') || get('to'))) {
    const on = spec.dates.find((d) => d.value === get('date_on'))?.label ?? spec.dates[0]!.label;
    const named = DATE_RANGES.find((r) => r.value === range)?.label;
    const fmt = (v: string) => DateTime.fromISO(v).toFormat('d LLL yyyy');
    const span = named ?? [get('from') && `from ${fmt(get('from'))}`, get('to') && `to ${fmt(get('to'))}`].filter(Boolean).join(' ');
    chips.push({ key: 'date', label: `${on}: ${span}`, params: ['date_on', 'range', 'from', 'to'] });
  }
  if (spec.amount && (get('min') || get('max'))) {
    const min = get('min');
    const max = get('max');
    const label = min && max ? `₹${min} – ₹${max}` : min ? `≥ ₹${min}` : `≤ ₹${max}`;
    chips.push({ key: 'amount', label: `Amount ${label}`, params: ['min', 'max'] });
  }
  if (spec.sort && get('sort')) {
    const s = spec.sort.find((o) => o.value === get('sort'));
    if (s) chips.push({ key: 'sort', label: `Sort: ${s.label}`, params: ['sort'] });
  }
  return chips;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        active ? 'border-primary/40 bg-primary/10 text-primary' : 'bg-surface text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-muted-foreground text-[11px] font-bold tracking-[0.12em] uppercase">{title}</h3>
      {children}
    </section>
  );
}

// Everything that isn't a quick chip or the search box. Edits a draft; nothing reaches the URL until Apply.
function FilterPanel({ spec, activeCount }: { spec: ListSpec; activeCount: number }) {
  const { get, setParams } = useUrlFilters();
  const [open, setOpen] = useState(false);
  const keys = ['date_on', 'range', 'from', 'to', 'min', 'max', 'sort'] as const;
  const fromUrl = () => Object.fromEntries(keys.map((k) => [k, get(k)])) as Record<(typeof keys)[number], string>;
  const [d, setD] = useState(fromUrl);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  if (!spec.dates && !spec.amount && !spec.sort) return null;

  const apply = (e?: FormEvent) => {
    e?.preventDefault();
    setParams(Object.fromEntries(keys.map((k) => [k, d[k] || null])));
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => (setOpen(o), o && setD(fromUrl()))}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal />
          Filters
          {activeCount > 0 && (
            <span className="bg-primary text-primary-foreground tabular rounded-full px-1.5 text-[11px] leading-4">{activeCount}</span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <div className="flex h-12 shrink-0 items-center border-b px-4">
          <SheetTitle className="text-sm font-bold">Filters</SheetTitle>
        </div>
        <form onSubmit={apply} className="flex min-h-0 flex-1 flex-col">
          <div className="bg-sunken/40 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
            {spec.dates && (
              <PanelSection title="Date">
                {spec.dates.length > 1 && (
                  <NativeSelect aria-label="Date field" value={d.date_on || spec.dates[0]!.value} onChange={(e) => set({ date_on: e.target.value })} className="bg-surface">
                    {spec.dates.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Pill active={!d.range && !d.from && !d.to} onClick={() => set({ range: '', from: '', to: '' })}>
                    Any time
                  </Pill>
                  {DATE_RANGES.map((r) => (
                    <Pill key={r.value} active={d.range === r.value} onClick={() => set({ range: r.value, from: '', to: '' })}>
                      {r.label}
                    </Pill>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <CalendarRange className="text-muted-foreground size-4 shrink-0" />
                  <Input type="date" aria-label="From" value={d.from} onChange={(e) => set({ from: e.target.value, range: '' })} className="bg-surface" />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input type="date" aria-label="To" value={d.to} onChange={(e) => set({ to: e.target.value, range: '' })} className="bg-surface" />
                </div>
              </PanelSection>
            )}
            {spec.amount && (
              <PanelSection title="Amount (INR)">
                <div className="flex items-center gap-2">
                  <Input inputMode="decimal" placeholder="Min" aria-label="Minimum amount" value={d.min} onChange={(e) => set({ min: e.target.value })} className="bg-surface tabular" />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input inputMode="decimal" placeholder="Max" aria-label="Maximum amount" value={d.max} onChange={(e) => set({ max: e.target.value })} className="bg-surface tabular" />
                </div>
              </PanelSection>
            )}
            {spec.sort && (
              <PanelSection title="Sort">
                <div className="flex flex-wrap gap-1.5">
                  {spec.sort.map((o, i) => (
                    <Pill key={o.value} active={(d.sort || spec.sort![0]!.value) === o.value} onClick={() => set({ sort: i === 0 ? '' : o.value })}>
                      {o.label}
                    </Pill>
                  ))}
                </div>
              </PanelSection>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t p-4">
            <Button type="button" variant="ghost" onClick={() => setD(Object.fromEntries(keys.map((k) => [k, ''])) as typeof d)}>
              Reset
            </Button>
            <div className="flex gap-2">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </SheetClose>
              <Button type="submit">Apply Filters</Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function ListFilters({
  spec,
  counts,
  actions,
}: {
  spec: ListSpec;
  counts?: Record<string, number>;
  actions?: ReactNode;
}) {
  const { clear, get } = useUrlFilters();
  const chips = useActiveChips(spec);
  const anything = LIST_PARAMS.some((p) => get(p));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {spec.quick && <QuickChips spec={spec.quick} counts={counts} />}
        {spec.search && <SearchBy fields={spec.search} />}
        {chips.map((c) => (
          <span key={c.key} className="bg-surface flex h-7 max-w-72 items-center gap-1 rounded-md border pr-1 pl-2 text-xs font-medium">
            <span className="truncate">{c.label}</span>
            <button
              type="button"
              aria-label={`Remove ${c.label}`}
              onClick={() => clear(c.params)}
              className="text-muted-foreground hover:text-foreground flex size-5 items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {anything && (
          <button
            type="button"
            onClick={() => clear(LIST_PARAMS)}
            className="text-muted-foreground hover:text-foreground rounded px-1 text-xs font-semibold underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <FilterPanel spec={spec} activeCount={chips.length} />
        {actions}
      </div>
    </div>
  );
}
