import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeCredentials } from '@/features/api-keys/server';
import { approveFile, cancelFile } from '@/features/files/approval';
import { listFiles, listPayouts, payoutFilterOptions } from '@/features/files/lists';
import { ingestFile } from '@/features/ingest/service';
import { listUsersForAdmin } from '@/features/users/admin';
import type { ListQuery } from '@/lib/list-params';
import { CircuitBreaker } from '@/worker/circuit';
import { workerConfig } from '@/worker/config';
import { dispatchOnce } from '@/worker/dispatcher';
import { pollOnce } from '@/worker/poller';
import { csv, row, today } from '../helpers/csv';
import { acct, db, makeUser, run, setRule, requireTestDatabase } from '../helpers/db';
import { FakeGateway } from '../helpers/fake-gateway';

requireTestDatabase();

const gw = new FakeGateway();
const q = (o: Partial<ListQuery> = {}): ListQuery => ({ page: 1, selects: {}, toggles: {}, ...o });
let L: { id: string; kid: string };
const refs = { paid: `LST${run}P`, failed: `LST${run}F`, processing: `LST${run}R`, waiting: `LST${run}W`, cancelled: `LST${run}C` };
const files: Record<string, string> = {};

async function upload(name: string, rows: string[]) {
  const r = await ingestFile({ userId: L.id, filename: `${name}-${run}.csv`, buffer: csv(rows) });
  if (r.outcome !== 'ACCEPTED') throw new Error(JSON.stringify(r.errors));
  return r.fileId;
}

beforeAll(async () => {
  L = await makeUser('LST');
  await setRule('balance_check', false, L.id);
  files.sent = await upload('sent', [
    row(refs.paid, '0300000001', '100.00'),
    row(refs.failed, '4300000002', '200.00'),
    row(refs.processing, '3300000003', '300.00'),
  ]);
  files.waiting = await upload('waiting', [row(refs.waiting, '0310000001', '50.00', today, 'ICIC0000123')]);
  files.cancelled = await upload('cancelled', [row(refs.cancelled, '0320000001', '25.00')]);
  await cancelFile(files.cancelled, L.id, 'test');
  await approveFile(files.sent, L.id, async () => ({ ok: true, balancePaise: (10n ** 12n).toString() }));
  const deps = { db: db(), config: workerConfig({ ...process.env, WORKER_ID: 'lists' }), circuit: new CircuitBreaker(), clientFor: (c: { kid: string }) => gw.clientFor(c.kid), credentialsFor: activeCredentials };
  await dispatchOnce(deps, 50);
  await db().updateTable('payouts').set({ next_poll_at: sql`CURRENT_TIMESTAMP(3)` }).where('file_id', '=', files.sent).execute();
  await pollOnce(deps);
});
afterAll(async () => {
  await setRule('balance_check', true, L.id);
});

describe('listPayouts', () => {
  const mine = { userId: '' };
  beforeAll(() => {
    mine.userId = L.id;
  });

  it('counts each quick chip under the other filters, and totals the filtered amount', async () => {
    const all = await listPayouts(mine, q());
    expect(all.counts).toEqual({ '': 5, in_progress: 2, paid: 1, failed: 1, cancelled: 1 });
    expect([all.total, all.totalPaise]).toEqual([5, '67500']);
    const paid = await listPayouts(mine, q({ status: 'paid' }));
    expect(paid.rows.map((r) => r.client_reference_id)).toEqual([refs.paid]);
    expect(paid.counts['']).toBe(5);
  });

  it('searches the chosen field only, escaping LIKE wildcards', async () => {
    const byRef = await listPayouts(mine, q({ q: refs.failed, by: 'reference' }));
    expect(byRef.rows.map((r) => r.client_reference_id)).toEqual([refs.failed]);
    const byAccount = await listPayouts(mine, q({ q: acct('0310000001'), by: 'account' }));
    expect(byAccount.rows.map((r) => r.client_reference_id)).toEqual([refs.waiting]);
    const utr = (await listPayouts(mine, q({ status: 'paid' }))).rows[0]!.bank_transaction_id!;
    expect((await listPayouts(mine, q({ q: utr, by: 'utr' }))).rows.map((r) => r.client_reference_id)).toEqual([refs.paid]);
    expect((await listPayouts(mine, q({ q: '%', by: 'reference' }))).total).toBe(0);
  });

  it('searches by IFSC and failure reason, and filters by gateway status and file', async () => {
    const ifsc = await listPayouts(mine, q({ q: 'ICIC0000123', by: 'ifsc' }));
    expect(ifsc.rows.map((r) => r.client_reference_id)).toEqual([refs.waiting]);
    const failure = await listPayouts(mine, q({ q: 'invalid_txn', by: 'failure' }));
    expect(failure.rows.map((r) => r.client_reference_id)).toEqual([refs.failed]);
    const rejected = await listPayouts(mine, q({ selects: { gw: 'rejected' } }));
    expect(rejected.rows.map((r) => r.client_reference_id)).toEqual([refs.failed]);
    const raw = await db().selectFrom('payouts').select('gateway_response_json').where('id', '=', rejected.rows[0]!.id).executeTakeFirstOrThrow();
    expect(raw.gateway_response_json).toMatchObject({ payout_status: 'rejected', status_code: 'INVALID_TXN' });
    const oneFile = await listPayouts(mine, q({ selects: { file: files.waiting! } }));
    expect(oneFile.rows.map((r) => r.client_reference_id)).toEqual([refs.waiting]);
    const options = await payoutFilterOptions(L.id);
    expect(options.gw!.map((o) => o.value)).toEqual(['processing', 'rejected', 'succeed']);
    expect(options.file!.map((o) => o.value).sort()).toEqual(Object.values(files).sort());
  });

  it('filters by amount and date, sorts, and pages', async () => {
    const big = await listPayouts(mine, q({ minPaise: 15000n, sort: 'amount_desc' }));
    expect(big.rows.map((r) => r.amount_paise)).toEqual(['30000', '20000']);
    expect(big.totalPaise).toBe('50000');
    const tomorrow = new Date(Date.parse(`${today}T00:00:00+05:30`) + 86_400_000);
    expect((await listPayouts(mine, q({ dateOn: 'updated', from: tomorrow }))).total).toBe(0);
    expect((await listPayouts(mine, q({ dateOn: 'updated', to: tomorrow }))).total).toBe(5);
    const page2 = await listPayouts(mine, q({ page: 2, sort: 'amount_asc' }), 2);
    expect([page2.pages, page2.rows.map((r) => r.amount_paise)]).toEqual([3, ['10000', '20000']]);
  });

  it('a file scope lists that file in file order', async () => {
    const one = await listPayouts({ fileId: files.sent }, q());
    expect(one.rows.map((r) => [r.file_row, r.status])).toEqual([
      [2, 'SUCCEEDED'],
      [3, 'FAILED'],
      [4, 'PROCESSING'],
    ]);
  });
});

describe('listFiles and listUsersForAdmin', () => {
  it('counts files by status group and searches by name', async () => {
    const mine = await listFiles({ userId: L.id }, q());
    expect(mine.counts).toMatchObject({ '': 3, waiting: 1, paying: 1, closed: 1, completed: 0 });
    expect(mine.totalPaise).toBe('67500');
    const found = await listFiles({ userId: L.id }, q({ q: `waiting-${run}`, by: 'filename' }));
    expect(found.rows.map((f) => f.id)).toEqual([files.waiting]);
    const sent = (await listFiles({ userId: L.id }, q({ status: 'paying' }))).rows[0]!;
    expect([sent.paid, sent.failed].map(Number)).toEqual([1, 1]);
  });

  it('filters files by row count and by having failed payouts', async () => {
    const multi = await listFiles({ userId: L.id }, q({ minRows: 2 }));
    expect(multi.rows.map((f) => f.id)).toEqual([files.sent]);
    expect((await listFiles({ userId: L.id }, q({ maxRows: 1 }))).total).toBe(2);
    const withFailures = await listFiles({ userId: L.id }, q({ toggles: { failed: true } }));
    expect(withFailures.rows.map((f) => f.id)).toEqual([files.sent]);
  });

  it('admin: searches by user email across everyone', async () => {
    const found = await listFiles({}, q({ q: `lst-${run}@example.com`, by: 'user' }));
    expect(found.total).toBe(3);
  });

  it('users: search by gatekeeper UID, with key-status counts', async () => {
    const users = await listUsersForAdmin(q({ q: `IDLST${run}`, by: 'uid' }));
    expect(users.rows.map((u) => u.kid)).toEqual([L.kid]);
    expect(users.counts).toEqual({ '': 1, with_key: 1, no_key: 0 });
  });
});
