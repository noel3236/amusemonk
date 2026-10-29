import { existsSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingestFile, type IngestResult } from '@/features/ingest/service';
import {
  createCustomRule,
  deleteCustomRule,
  RuleConfigError,
  setRuleEnabled,
  setUserOverride,
} from '@/features/rules/server';
import { csv, daysAgo, HEADER, row, today } from '../helpers/csv';
import { acct, db, makeUser, ruleId, run, setRule, requireTestDatabase } from '../helpers/db';

requireTestDatabase();

const codes = (r: IngestResult) => (r.outcome === 'REJECTED' ? r.errors.map((e) => e.code) : []);
let USER = '';
const upload = (filename: string, buffer: Buffer, userId = USER) => ingestFile({ userId, filename: `${filename}-${run}.csv`, buffer });

beforeAll(async () => {
  USER = (await makeUser('ING')).id;
  // A crashed earlier run may have left a switch flipped; start from the defaults.
  await setRule('balance_check', true, USER);
  for (const k of ['duplicate_filename', 'duplicate_file', 'duplicate_content']) await setRule(k, true, USER);
});
afterAll(async () => {
  await setRule('balance_check', true, USER);
  for (const k of ['duplicate_filename', 'duplicate_file', 'duplicate_content']) await setRule(k, true, USER);
});

describe('ingest: all or nothing', () => {
  const fileA = csv([row(`REFA${run}01`, '0123456789', '100.00'), row(`REFA${run}02`, '9876543210', '250.50')]);
  let acceptedId = '';

  it('balance check fails closed when the gateway is unreachable, and the rejection consumes nothing', async () => {
    const r = await upload('batch', fileA);
    expect(codes(r)).toEqual(['BALANCE_UNAVAILABLE']);
    const used = await db().selectFrom('payouts').select('id').where('client_reference_id', 'like', `REFA${run}%`).execute();
    expect(used).toEqual([]);
  });

  it('accepts a valid file: rows stored, waiting for confirmation, raw file kept, rule set recorded', async () => {
    await setRule('balance_check', false, USER);
    const r = await upload('batch', fileA);
    expect(r).toMatchObject({ outcome: 'ACCEPTED', rowCount: 2, totalPaise: '35050' });
    if (r.outcome !== 'ACCEPTED') return;
    acceptedId = r.fileId;
    const f = await db().selectFrom('payout_files').selectAll().where('id', '=', r.fileId).executeTakeFirstOrThrow();
    const ps = await db().selectFrom('payouts').selectAll().where('file_id', '=', r.fileId).orderBy('file_row').execute();
    expect(f.status).toBe('AWAITING_APPROVAL');
    expect(ps.map((p) => [p.file_row, p.status, p.bank_account])).toEqual([
      [2, 'PENDING', acct('0123456789')],
      [3, 'PENDING', acct('9876543210')],
    ]);
    expect(existsSync(path.resolve(process.env.LOCAL_STORAGE_DIR!, f.s3_key))).toBe(true);
    expect((f.rules_snapshot_json as unknown[]).length).toBeGreaterThan(0);
    const att = await db().selectFrom('upload_attempts').selectAll().where('file_id', '=', r.fileId).executeTakeFirstOrThrow();
    expect(att).toMatchObject({ outcome: 'ACCEPTED', s3_key: f.s3_key });
  });

  it('the same file again: name, bytes and both references are flagged', async () => {
    const c = codes(await upload('batch', fileA));
    expect(c).toEqual(expect.arrayContaining(['DUPLICATE_FILENAME', 'DUPLICATE_FILE']));
    expect(c.filter((x) => x === 'DUPLICATE_REFERENCE')).toHaveLength(2);
  });

  it('with every switchable duplicate check off, the locked reference rule still stops it', async () => {
    for (const k of ['duplicate_filename', 'duplicate_file', 'duplicate_content']) await setRule(k, false, USER);
    expect(codes(await upload('renamed', fileA))).toEqual(['DUPLICATE_REFERENCE', 'DUPLICATE_REFERENCE']);
    for (const k of ['duplicate_filename', 'duplicate_file', 'duplicate_content']) await setRule(k, true, USER);
  });

  it('a new reference for an already-accepted payment is refused', async () => {
    expect(codes(await upload('regen', csv([row(`REFB${run}01`, '0123456789', '100.00')])))).toEqual(['DUPLICATE_PAYMENT']);
    expect(acceptedId).not.toBe('');
  });

  it('column and row problems are all reported in one pass, each naming its rule and row', async () => {
    expect(codes(await upload('hdr', Buffer.from(`${HEADER.replace('beneficiary_name', 'note')}\nX,1,2,3,4,5\n`))).sort()).toEqual([
      'EXTRA_COLUMN',
      'MISSING_COLUMN',
    ]);
    const r = await upload(
      'rows',
      csv([
        row('short', '0123456789', '10.00'),
        row(`REFC${run}01`, '12', '10.00'),
        row(`REFC${run}02`, '0123456780', '10.00', today, 'HDFC000004'),
        row(`REFC${run}03`, '0123456781', '999999.00'),
        row(`REFC${run}04`, '0123456782', '10.00', daysAgo(-2)),
        row(`REFC${run}05`, '0123456783', '10.00', daysAgo(30)),
        row(`REFC${run}05`, '0123456784', '11.00'),
        row(`REFC${run}06`, '0123456785', '10.123'),
      ])
    );
    expect(new Set(codes(r))).toEqual(
      new Set(['INVALID_REFERENCE', 'INVALID_BANK_ACCOUNT', 'INVALID_IFSC', 'AMOUNT_ABOVE_MAX', 'DATE_IN_FUTURE', 'DATE_TOO_OLD', 'DUPLICATE_REFERENCE_IN_FILE', 'INVALID_AMOUNT'])
    );
    expect(r.outcome === 'REJECTED' && r.errors.every((e) => e.rule && e.row)).toBe(true);
  });

  it('XLSX keeps text accounts with leading zeros and real date cells', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Payouts');
    ws.addRow(HEADER.split(','));
    ws.addRow([`REFF${run}01`, acct('0098765432'), 'ICIC0001234', 1500.5, new Date(`${today}T00:00:00Z`), 'Ravi Kumar']);
    const r = await ingestFile({ userId: USER, filename: `sheet-${run}.xlsx`, buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
    expect(r).toMatchObject({ outcome: 'ACCEPTED', totalPaise: '150050' });
    if (r.outcome !== 'ACCEPTED') return;
    const p = await db().selectFrom('payouts').selectAll().where('file_id', '=', r.fileId).executeTakeFirstOrThrow();
    expect([p.bank_account, p.transaction_date]).toEqual([acct('0098765432'), today]);
  });
});

describe('ingest: concurrency', () => {
  it('two files sharing a reference, uploaded at the same instant: exactly one is accepted', async () => {
    const g1 = csv([row(`REFG${run}01`, '1111111101', '10.00'), row(`REFG${run}02`, '1111111102', '10.00')]);
    const g2 = csv([row(`REFG${run}02`, '1111111103', '10.00'), row(`REFG${run}03`, '1111111104', '10.00')]);
    const results = await Promise.all([upload('g1', g1), upload('g2', g2)]);
    expect(results.filter((r) => r.outcome === 'ACCEPTED')).toHaveLength(1);
  });

  it('the same new file three times at once: exactly one is accepted', async () => {
    const h = csv([row(`REFH${run}01`, '2222222201', '10.00')]);
    const results = await Promise.all([1, 2, 3].map((i) => upload(`h${i}`, h)));
    expect(results.filter((r) => r.outcome === 'ACCEPTED')).toHaveLength(1);
  });
});

describe('ingest: duplicates are per user (D-41)', () => {
  it('another user may send the same file and references; their repeat names only their own file', async () => {
    const other = await makeUser('ING2');
    await setRule('balance_check', false, USER); // global switch; afterAll turns it back on
    const file = csv([row(`REFU${run}01`, '5555555501', '10.00'), row(`REFU${run}02`, '5555555502', '20.00')]);
    expect((await upload('mine', file)).outcome).toBe('ACCEPTED');
    expect((await upload('theirs', file, other.id)).outcome).toBe('ACCEPTED');

    const again = await upload('theirs-again', file, other.id);
    expect(codes(again)).toEqual(expect.arrayContaining(['DUPLICATE_FILE', 'DUPLICATE_REFERENCE']));
    const messages = again.outcome === 'REJECTED' ? again.errors.map((e) => e.message).join(' ') : '';
    expect(messages).toContain(`theirs-${run}.csv`);
    expect(messages).not.toContain(`mine-${run}.csv`);
  });
});

describe('rules: custom, locked, broken, audited', () => {
  it('a custom pattern rule rejects with its own message', async () => {
    const id = await createCustomRule({ kind: 'column_pattern', name: 'No SBI', params: { column: 'ifsc_code', pattern: '^SBIN', mode: 'must_not_match', message: 'SBI payouts are paused' } }, USER);
    try {
      const r = await upload('sbi', csv([row(`REFD${run}01`, '0123456700', '10.00', today, 'SBIN0001234')]));
      expect(r.outcome === 'REJECTED' && r.errors[0]).toMatchObject({ message: 'SBI payouts are paused', rule: expect.stringMatching(/^custom_/) });
    } finally {
      await deleteCustomRule(id, USER);
    }
  });

  it('an allow list rejects only the unlisted account', async () => {
    const id = await createCustomRule({ kind: 'value_list', name: 'Known accounts', params: { column: 'bank_account', values: [acct('0123456701')], mode: 'allow' } }, USER);
    try {
      const r = await upload('allow', csv([row(`REFE${run}01`, '0123456701', '10.00'), row(`REFE${run}02`, '0123456702', '10.00')]));
      expect(r.outcome === 'REJECTED' && r.errors.map((e) => e.row)).toEqual([3]);
    } finally {
      await deleteCustomRule(id, USER);
    }
  });

  it('locked rules refuse to switch off; broken settings stop every upload', async () => {
    await expect(setRuleEnabled(await ruleId('duplicate_reference'), false, USER)).rejects.toBeInstanceOf(RuleConfigError);
    const amountId = await ruleId('amount_range');
    await db().updateTable('upload_rules').set({ params_json: JSON.stringify({ min_inr: 'abc' }) }).where('id', '=', amountId).execute();
    try {
      expect(codes(await upload('cfg', csv([row(`REFI${run}01`, '3333333301', '10.00')])))).toEqual(['RULES_MISCONFIGURED']);
    } finally {
      await db().updateTable('upload_rules').set({ params_json: JSON.stringify({ min_inr: '1.00', max_inr: '200000.00' }) }).where('id', '=', amountId).execute();
    }
  });

  it('every rule change is audited', async () => {
    const actions = (await db().selectFrom('upload_rule_changes').select('action').where('changed_by', '=', USER).execute()).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['disabled', 'enabled', 'created', 'deleted']));
  });
});

describe('per-user limits', () => {
  it('an override applies to that user only, and clearing it restores the global limit', async () => {
    const other = await makeUser('OV');
    const amount = await ruleId('amount_range');
    await setUserOverride(USER, amount, { min_inr: '1.00', max_inr: '50.00' }, USER);
    const capped = await upload('ov-a', csv([row(`REFJ${run}01`, '4444444401', '100.00')]));
    expect(codes(capped)).toEqual(['AMOUNT_ABOVE_MAX']);
    expect(capped.outcome === 'REJECTED' && capped.errors[0]!.message).toContain('₹50.00');

    const free = await upload('ov-b', csv([row(`REFJ${run}02`, '4444444402', '100.00')]), other.id);
    expect(free.outcome).toBe('ACCEPTED');
    if (free.outcome === 'ACCEPTED') {
      const f = await db().selectFrom('payout_files').select('rules_snapshot_json').where('id', '=', free.fileId).executeTakeFirstOrThrow();
      expect((f.rules_snapshot_json as { user_override: boolean }[]).every((x) => !x.user_override)).toBe(true);
    }

    await setUserOverride(USER, amount, null, USER);
    expect((await upload('ov-c', csv([row(`REFJ${run}03`, '4444444403', '100.00')]))).outcome).toBe('ACCEPTED');
    const audit = (await db().selectFrom('upload_rule_changes').select('action').where('target_user_id', '=', USER).execute()).map((a) => a.action);
    expect(audit).toEqual(expect.arrayContaining(['override_set', 'override_cleared']));
  });

  it('locked rules cannot be overridden per user', async () => {
    await expect(setUserOverride(USER, await ruleId('duplicate_reference'), {}, USER)).rejects.toBeInstanceOf(RuleConfigError);
  });
});
