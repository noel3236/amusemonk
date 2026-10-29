import { DateTime } from 'luxon';
import { DISPLAY_ZONE } from './format';
import type { ListSpec } from './list-spec';
import { parseInrToPaise } from './money';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export interface ListQuery {
  status?: string;
  q?: string;
  by?: string;
  dateOn?: string;
  from?: Date;
  to?: Date;
  minPaise?: bigint;
  maxPaise?: bigint;
  minRows?: number;
  maxRows?: number;
  selects: Record<string, string>;
  toggles: Record<string, boolean>;
  sort?: string;
  page: number;
}

// Days are judged in IST and turned into UTC instants: [from, to).
function dayRange(sp: SP): { from?: Date; to?: Date } {
  const today = DateTime.now().setZone(DISPLAY_ZONE).startOf('day');
  const range = one(sp.range);
  const at = (d: DateTime) => d.toUTC().toJSDate();
  switch (range) {
    case 'today':
      return { from: at(today), to: at(today.plus({ days: 1 })) };
    case 'yesterday':
      return { from: at(today.minus({ days: 1 })), to: at(today) };
    case '7d':
      return { from: at(today.minus({ days: 6 })), to: at(today.plus({ days: 1 })) };
    case '30d':
      return { from: at(today.minus({ days: 29 })), to: at(today.plus({ days: 1 })) };
    case 'month':
      return { from: at(today.startOf('month')), to: at(today.plus({ days: 1 })) };
  }
  const parse = (v: string | undefined) => {
    const d = v ? DateTime.fromISO(v, { zone: DISPLAY_ZONE }) : null;
    return d?.isValid ? d.startOf('day') : null;
  };
  const from = parse(one(sp.from));
  const to = parse(one(sp.to));
  return { from: from ? at(from) : undefined, to: to ? at(to.plus({ days: 1 })) : undefined };
}

// Anything not in the spec, or malformed, is ignored rather than trusted.
export function parseListQuery(sp: SP, spec: ListSpec): ListQuery {
  const pick = <T extends { value: string }>(list: readonly T[] | undefined, v: string | undefined) =>
    v && list?.some((x) => x.value === v) ? v : undefined;
  const q = one(sp.q)?.slice(0, 64);
  const dates = spec.dates ? dayRange(sp) : {};
  const amount = (v: string | undefined) => (spec.amount && v ? parseInrToPaise(v) ?? undefined : undefined);
  const rows = (v: string | undefined) => (spec.rows && v && /^\d{1,7}$/.test(v) ? Number(v) : undefined);
  return {
    status: pick(spec.quick?.options, one(sp.status)),
    q,
    by: q ? pick(spec.search, one(sp.by)) ?? spec.search?.[0]?.value : undefined,
    dateOn: dates.from || dates.to ? pick(spec.dates, one(sp.date_on)) ?? spec.dates?.[0]?.value : undefined,
    ...dates,
    minPaise: amount(one(sp.min)),
    maxPaise: amount(one(sp.max)),
    minRows: rows(one(sp.rows_min)),
    maxRows: rows(one(sp.rows_max)),
    selects: Object.fromEntries(
      (spec.selects ?? []).flatMap((f) => {
        const v = one(sp[f.param])?.slice(0, 64);
        return v ? [[f.param, v]] : [];
      })
    ),
    toggles: Object.fromEntries((spec.toggles ?? []).filter((t) => one(sp[t.param]) === '1').map((t) => [t.param, true])),
    sort: pick(spec.sort, one(sp.sort)),
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
}

// Links for the pager keep every filter and change only the page.
export function pageHref(path: string, sp: SP, page: number): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const x = one(v);
    if (x && k !== 'page') out.set(k, x);
  }
  if (page > 1) out.set('page', String(page));
  const qs = out.toString();
  return qs ? `${path}?${qs}` : path;
}
