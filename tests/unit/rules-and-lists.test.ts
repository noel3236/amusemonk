import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeParams, RULE_PARAMS } from '@/features/rules/catalog';
import { FILES_SPEC, PAYOUTS_SPEC } from '@/features/files/specs';
import { pageHref, parseListQuery } from '@/lib/list-params';

describe('rule settings', () => {
  it('validates each kind', () => {
    expect(RULE_PARAMS.amount_range.safeParse({ min_inr: '500', max_inr: '100' }).success).toBe(false);
    expect(RULE_PARAMS.amount_range.safeParse({ min_inr: '1.00', max_inr: '50.00' }).success).toBe(true);
    expect(RULE_PARAMS.max_file_size.safeParse({ max_mb: 21 }).success).toBe(false);
    expect(RULE_PARAMS.column_pattern.safeParse({ column: 'ifsc_code', pattern: '([', mode: 'must_match' }).success).toBe(false);
    expect(RULE_PARAMS.value_list.safeParse({ column: 'bank_account', values: [], mode: 'block' }).success).toBe(false);
  });

  it('summarises settings with Indian grouping', () => {
    expect(describeParams('amount_range', { min_inr: '1.00', max_inr: '200000.00' })).toBe('₹1.00 – ₹2,00,000.00');
    expect(describeParams('value_list', { column: 'bank_account', values: ['1', '2', '3', '4'], mode: 'block' })).toBe('bank_account: not 1, 2, 3 +1');
  });
});

describe('list query parsing', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps only what the spec allows', () => {
    const q = parseListQuery({ status: 'paid', q: 'abc', by: 'utr', sort: 'nope', min: '10', max: 'x', page: '3' }, PAYOUTS_SPEC);
    expect(q).toMatchObject({ status: 'paid', q: 'abc', by: 'utr', sort: undefined, minPaise: 1000n, maxPaise: undefined, page: 3 });
    expect(parseListQuery({ status: 'bogus', by: 'utr' }, PAYOUTS_SPEC)).toMatchObject({ status: undefined, by: undefined });
    expect(parseListQuery({ gw: 'rejected', nope: 'x', rows_min: '5' }, PAYOUTS_SPEC)).toMatchObject({ selects: { gw: 'rejected' }, minRows: undefined });
    expect(parseListQuery({ failed: '1', rows_min: '2', rows_max: '-1' }, FILES_SPEC)).toMatchObject({ toggles: { failed: true }, minRows: 2, maxRows: undefined });
  });

  it('turns IST days into UTC instants', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T02:00:00Z')); // 07:30 IST on 29 Oct
    const today = parseListQuery({ range: 'today' }, PAYOUTS_SPEC);
    expect(today.from?.toISOString()).toBe('2026-10-28T18:30:00.000Z');
    expect(today.to?.toISOString()).toBe('2026-10-29T18:30:00.000Z');
    expect(today.dateOn).toBe('updated');
    const custom = parseListQuery({ from: '2026-10-01', to: '2026-10-02', date_on: 'completed' }, PAYOUTS_SPEC);
    expect([custom.from?.toISOString(), custom.to?.toISOString(), custom.dateOn]).toEqual([
      '2026-09-30T18:30:00.000Z',
      '2026-10-02T18:30:00.000Z',
      'completed',
    ]);
  });

  it('builds pager links that keep filters', () => {
    expect(pageHref('/payouts', { status: 'paid', page: '2', q: 'x' }, 3)).toBe('/payouts?status=paid&q=x&page=3');
    expect(pageHref('/payouts', { status: 'paid', page: '2' }, 1)).toBe('/payouts?status=paid');
  });
});
