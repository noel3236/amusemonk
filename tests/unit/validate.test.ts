import { describe, expect, it } from 'vitest';
import { validateParsedFile, type Ruleset } from '@/features/ingest/validate';
import { COLUMNS } from '@/features/rules/catalog';

const TODAY = '2026-10-28';
const all: Ruleset = {
  maxRows: { max_rows: 5 },
  amountRange: { min_inr: '1.00', max_inr: '200000.00' },
  fileTotalMax: { max_inr: '10000000.00' },
  dateWindow: { max_age_days: 7 },
  maxRowsPerAccount: { max: 2 },
  duplicateFilename: true,
  duplicateFile: true,
  duplicateContent: true,
  balanceCheck: true,
  custom: [],
};
// Only the locked rules: every switchable one off.
const lockedOnly: Ruleset = { duplicateFilename: false, duplicateFile: false, duplicateContent: false, balanceCheck: false, custom: [] };

let n = 0;
const row = (o: Partial<Record<(typeof COLUMNS)[number], string>> = {}) => ({
  client_reference_id: `INV-2026-${String(++n).padStart(6, '0')}`,
  bank_account: String(100000000 + n),
  ifsc_code: 'HDFC0000044',
  inr_amount: '100.00',
  transaction_date: TODAY,
  beneficiary_name: 'Asha Rao',
  ...o,
});
const run = (rows: Record<string, string>[], rules = all, headers: string[] = [...COLUMNS]) => validateParsedFile({ headers, rows }, rules, TODAY);
const codes = (r: ReturnType<typeof run>) => r.errors.map((e) => e.code);

describe('validateParsedFile', () => {
  it('accepts a clean file and produces typed payouts', () => {
    const r = run([row({ inr_amount: '1500.50', ifsc_code: 'hdfc0000044' })]);
    expect(r.errors).toEqual([]);
    expect(r.payouts[0]).toMatchObject({ amountPaise: 150050n, ifscCode: 'HDFC0000044', fileRow: 2 });
    expect(r.totalPaise).toBe(150050n);
    expect(r.canonicalHash).toHaveLength(64);
  });

  it('locked: exact columns, no rows, and every row error at once with its row and rule', () => {
    expect(codes(run([row()], all, ['client_reference_id', 'bank_account']))).toContain('MISSING_COLUMN');
    expect(codes(run([row()], all, [...COLUMNS, 'note']))).toContain('EXTRA_COLUMN');
    expect(codes(run([row()], all, [...COLUMNS, 'ifsc_code']))).toContain('DUPLICATE_COLUMN');
    expect(codes(run([]))).toEqual(['NO_ROWS']);
    const r = run([
      row({ client_reference_id: 'short' }),
      row({ bank_account: '12ab' }),
      row({ ifsc_code: 'HDFC000004' }),
      row({ inr_amount: '12.345' }),
      row({ transaction_date: '28/10/2026' }),
    ]);
    expect(r.errors.map((e) => [e.row, e.code, e.rule])).toEqual(
      expect.arrayContaining([
        [2, 'INVALID_REFERENCE', 'row_format'],
        [3, 'INVALID_BANK_ACCOUNT', 'row_format'],
        [4, 'INVALID_IFSC', 'row_format'],
        [5, 'INVALID_AMOUNT', 'row_format'],
        [6, 'INVALID_DATE', 'row_format'],
      ])
    );
    expect(r.payouts).toEqual([]);
  });

  it('locked: beneficiary names and empty rows', () => {
    for (const name of ['', 'A', 'Bob <script>']) expect(codes(run([row({ beneficiary_name: name })]))).toContain('INVALID_BENEFICIARY_NAME');
    const empty = Object.fromEntries(COLUMNS.map((c) => [c, '']));
    expect(run([row(), empty, row()]).errors.map((e) => [e.row, e.code])).toContainEqual([3, 'EMPTY_ROW']);
  });

  it('locked: duplicate reference (any case) and duplicate payment within a file', () => {
    const dupRef = run([row({ client_reference_id: 'ORDER-DUP-001' }), row({ client_reference_id: 'order-dup-001' })], lockedOnly);
    expect(dupRef.errors.map((e) => [e.row, e.code])).toContainEqual([3, 'DUPLICATE_REFERENCE_IN_FILE']);
    const dupPay = run([row({ bank_account: '123456789' }), row({ bank_account: '123456789' })], lockedOnly);
    expect(dupPay.errors.map((e) => [e.row, e.code])).toContainEqual([3, 'DUPLICATE_PAYMENT_IN_FILE']);
  });

  it('tunable rules apply only when present', () => {
    expect(codes(run([row({ inr_amount: '0.50' })]))).toContain('AMOUNT_BELOW_MIN');
    expect(codes(run([row({ inr_amount: '200000.01' })]))).toContain('AMOUNT_ABOVE_MAX');
    expect(run([row({ inr_amount: '200000.01' })], lockedOnly).errors).toEqual([]);
    expect(codes(run([row({ inr_amount: '0' })], lockedOnly))).toContain('INVALID_AMOUNT');
    expect(codes(run(Array.from({ length: 6 }, () => row())))).toEqual(['TOO_MANY_ROWS']);
    expect(run(Array.from({ length: 6 }, () => row()), lockedOnly).errors).toEqual([]);
  });

  it('date window: future, too old, and real dates', () => {
    expect(codes(run([row({ transaction_date: '2026-10-29' })]))).toContain('DATE_IN_FUTURE');
    expect(codes(run([row({ transaction_date: '2026-10-20' })]))).toContain('DATE_TOO_OLD');
    expect(run([row({ transaction_date: '2026-10-21' })]).errors).toEqual([]);
    expect(codes(run([row({ transaction_date: '2026-02-30' })]))).toContain('INVALID_DATE');
    expect(run([row({ transaction_date: '2026-10-29' })], lockedOnly).errors).toEqual([]);
  });

  it('file total and payouts per account', () => {
    const r = run([row({ inr_amount: '6000.00' }), row({ inr_amount: '5000.00' })], { ...all, fileTotalMax: { max_inr: '10000.00' } });
    expect(codes(r)).toContain('FILE_TOTAL_ABOVE_MAX');
    const acc = run([0, 1, 2].map((i) => row({ bank_account: '111111111', inr_amount: `${10 + i}.00` })));
    expect(codes(acc)).toContain('ACCOUNT_REPEATED_TOO_OFTEN');
  });

  it('custom rules: patterns and allow/block lists, with their own message', () => {
    const custom: Ruleset['custom'] = [
      { key: 'custom_a', name: 'No SBI', kind: 'column_pattern', params: { column: 'ifsc_code', pattern: '^SBIN', mode: 'must_not_match', message: 'SBI paused' } },
      { key: 'custom_b', name: 'Known', kind: 'value_list', params: { column: 'bank_account', values: ['222222222'], mode: 'allow' } },
    ];
    const r = run([row({ ifsc_code: 'SBIN0001234', bank_account: '222222222' }), row({ bank_account: '333333333' })], { ...all, custom });
    expect(r.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, rule: 'custom_a', message: 'SBI paused' }),
        expect.objectContaining({ row: 3, rule: 'custom_b', code: 'CUSTOM_RULE' }),
      ])
    );
    expect(r.errors).toHaveLength(2);
  });
});
