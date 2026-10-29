import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeCredentials, activeKeySummary, revokeKey, storeNewKey } from '@/features/api-keys/server';
import { rejectFileByAdmin } from '@/features/files/admin';
import { approveFile, cancelFile } from '@/features/files/approval';
import { ingestFile } from '@/features/ingest/service';
import { CircuitBreaker } from '@/worker/circuit';
import { workerConfig } from '@/worker/config';
import type { WorkerDeps } from '@/worker/deps';
import { dispatchOnce } from '@/worker/dispatcher';
import { pollOnce } from '@/worker/poller';
import { reconcileOnce } from '@/worker/reconciler';
import { refreshPayout } from '@/worker/refresh';
import { csv, HEADER, row, today } from '../helpers/csv';
import { acct, db, makeUser, run, setRule, requireTestDatabase } from '../helpers/db';
import { FakeGateway } from '../helpers/fake-gateway';

requireTestDatabase();

const gw = new FakeGateway();
const deps = (workerId: string, circuit = new CircuitBreaker()): WorkerDeps => ({
  db: db(),
  config: workerConfig({ ...process.env, WORKER_ID: workerId }),
  circuit,
  clientFor: (c) => gw.clientFor(c.kid),
  credentialsFor: activeCredentials,
});
const W1 = deps('w1');
const RICH = async () => ({ ok: true as const, balancePaise: (10n ** 12n).toString() });
const balanceOf = (paise: bigint | null) => async () =>
  paise === null ? { ok: false as const, error: 'down' } : { ok: true as const, balancePaise: paise.toString() };

let n = 0;
async function upload(userId: string, rows: [account: string, amount: string][]) {
  const refs = rows.map(() => `WK${run}${String(++n).padStart(4, '0')}`);
  const r = await ingestFile({ userId, filename: `w-${run}-${n}.csv`, buffer: csv(rows.map(([a, amt], i) => row(refs[i]!, a, amt, today, 'HDFC0000044', 'Test Payee'))) });
  if (r.outcome !== 'ACCEPTED') throw new Error('upload rejected: ' + JSON.stringify(r.errors));
  return { fileId: r.fileId, refs };
}
const statuses = async (fileId: string) =>
  (await db().selectFrom('payouts').select('status').where('file_id', '=', fileId).orderBy('file_row').execute()).map((p) => p.status).join(',');
const fileStatus = async (fileId: string) => (await db().selectFrom('payout_files').select('status').where('id', '=', fileId).executeTakeFirstOrThrow()).status;
const due = (fileId: string) =>
  db().updateTable('payouts').set({ next_poll_at: sql`CURRENT_TIMESTAMP(3)` }).where('file_id', '=', fileId).where('status', '!=', 'CANCELLED').execute();
const creates = (refs: string[]) => refs.map((r) => gw.creates.get(r) ?? 0);
const confirm = async (fileId: string, userId: string) => expect((await approveFile(fileId, userId, RICH)).ok).toBe(true);

let A: { id: string; kid: string };
let B: { id: string; kid: string };

beforeAll(async () => {
  // Earlier runs leave payouts in flight on purpose (stuck-processing cases). This run's fake gateway has never heard
  // of them, and enough of them would crowd this run's rows out of the poll/reconcile batches. Test database only.
  await db()
    .updateTable('payouts')
    .set({ status: 'FAILED', failure_reason: 'retired by tests', next_poll_at: new Date('9999-12-31T00:00:00Z') })
    .where('status', 'in', ['PROCESSING', 'UNKNOWN', 'DISPATCHING'])
    .execute();
  A = await makeUser('WA');
  B = await makeUser('WB');
  await setRule('balance_check', false, A.id);
});
afterAll(async () => {
  await setRule('balance_check', true, A.id);
});

describe('confirm payment (approval)', () => {
  it('nothing is sent before the owner confirms; only the owner can, once, with enough balance', async () => {
    const f = await upload(A.id, [['0100000001', '10.00']]);
    await due(f.fileId);
    await dispatchOnce(W1, 50);
    expect(await statuses(f.fileId)).toBe('PENDING');
    expect(creates(f.refs)).toEqual([0]);

    expect((await approveFile(f.fileId, B.id, RICH)).ok).toBe(false);
    const short = await approveFile(f.fileId, A.id, balanceOf(500n));
    expect(short.ok === false && short.reason).toMatch(/Not enough balance/);
    expect((await approveFile(f.fileId, A.id, balanceOf(null))).ok).toBe(false);
    await confirm(f.fileId, A.id);
    expect(await fileStatus(f.fileId)).toBe('ACCEPTED');
    expect((await approveFile(f.fileId, A.id, RICH)).ok).toBe(false);
  });
});

describe('dispatch and poll', () => {
  it('happy path: sent once, polled to paid, file completed, attempt recorded', async () => {
    const f = await upload(A.id, [['0110000001', '10.00'], ['1110000002', '20.00'], ['2110000003', '30.00']]);
    await confirm(f.fileId, A.id);
    await dispatchOnce(W1, 50);
    expect(await statuses(f.fileId)).toBe('PROCESSING,PROCESSING,PROCESSING');
    await due(f.fileId);
    await pollOnce(W1);
    const ps = await db().selectFrom('payouts').selectAll().where('file_id', '=', f.fileId).orderBy('file_row').execute();
    expect(ps.every((p) => p.status === 'SUCCEEDED' && p.bank_transaction_id && p.gateway_payout_id)).toBe(true);
    expect(await fileStatus(f.fileId)).toBe('COMPLETED');
    expect(creates(f.refs)).toEqual([1, 1, 1]);
    const att = await db().selectFrom('payout_attempts').selectAll().where('payout_id', '=', ps[0]!.id).execute();
    expect(att).toHaveLength(1);
    expect(att[0]).toMatchObject({ outcome: 'CREATED', client_reference_id: f.refs[0] });
    expect((att[0]!.request_json as { client_reference_id: string }).client_reference_id).toBe(f.refs[0]);
  });

  it('mixed outcomes roll the file up correctly', async () => {
    const f = await upload(A.id, [['0120000001', '10.00'], ['4120000002', '10.00'], ['3120000003', '10.00']]);
    await confirm(f.fileId, A.id);
    await dispatchOnce(W1, 50);
    await due(f.fileId);
    await pollOnce(W1);
    expect(await statuses(f.fileId)).toBe('SUCCEEDED,FAILED,PROCESSING');
    expect(await fileStatus(f.fileId)).toBe('PROCESSING');
    const g = await upload(A.id, [['0130000001', '10.00'], ['5130000002', '10.00']]);
    await confirm(g.fileId, A.id);
    await dispatchOnce(W1, 50);
    await due(g.fileId);
    await pollOnce(W1);
    expect(await fileStatus(g.fileId)).toBe('COMPLETED_WITH_FAILURES');
  });
});

describe('never paid twice', () => {
  it('500 but created: UNKNOWN, then adopted by the reconciler, created once', async () => {
    const f = await upload(A.id, [['0140000001', '11.00']]);
    await confirm(f.fileId, A.id);
    gw.queue.push('500-created');
    await dispatchOnce(W1, 50);
    expect(await statuses(f.fileId)).toBe('UNKNOWN');
    await due(f.fileId);
    await reconcileOnce(W1);
    await dispatchOnce(W1, 50);
    // Adopted from the gateway's view, which by now says the payout settled.
    expect(await statuses(f.fileId)).toBe('SUCCEEDED');
    expect(creates(f.refs)).toEqual([1]);
  });

  it('timeout and not created: re-queued and re-sent under the same reference, created once', async () => {
    const f = await upload(A.id, [['0150000001', '12.00']]);
    await confirm(f.fileId, A.id);
    gw.queue.push('timeout-not-created');
    await dispatchOnce(W1, 50);
    await due(f.fileId);
    await reconcileOnce(W1);
    expect(await statuses(f.fileId)).toBe('PENDING');
    await dispatchOnce(W1, 50);
    expect(await statuses(f.fileId)).toBe('PROCESSING');
    expect(creates(f.refs)).toEqual([1]);
  });

  it('process dies right after the POST: left DISPATCHING, then adopted once stuck long enough', async () => {
    const f = await upload(A.id, [['0160000001', '13.00']]);
    await confirm(f.fileId, A.id);
    gw.queue.push('crash-after-create');
    await dispatchOnce(W1, 50);
    expect(await statuses(f.fileId)).toBe('DISPATCHING');
    await reconcileOnce(W1);
    expect(await statuses(f.fileId)).toBe('DISPATCHING');
    await db().updateTable('payouts').set({ locked_at: sql`DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 10 MINUTE)` }).where('file_id', '=', f.fileId).execute();
    await reconcileOnce(W1);
    await dispatchOnce(W1, 50);
    expect(['PROCESSING', 'SUCCEEDED']).toContain(await statuses(f.fileId));
    expect(creates(f.refs)).toEqual([1]);
  });

  it('two workers at once on 30 payouts: each created exactly once', async () => {
    const f = await upload(A.id, Array.from({ length: 30 }, (_, i) => ['1' + String(900000000 + i), '1.00'] as [string, string]));
    await confirm(f.fileId, A.id);
    const W2 = deps('w2');
    for (let i = 0; i < 4; i++) await Promise.all([dispatchOnce(W1, 8), dispatchOnce(W2, 8)]);
    expect(creates(f.refs).every((c) => c === 1)).toBe(true);
    expect((await statuses(f.fileId)).split(',').every((s) => s === 'PROCESSING')).toBe(true);
  });
});

describe('balance', () => {
  it('short at dispatch: waits without sending or adding attempts, then sends once after a top-up', async () => {
    const f = await upload(B.id, [['0170000001', '500.00']]);
    await confirm(f.fileId, B.id);
    gw.balance.set(B.kid, 10_000n);
    await dispatchOnce(W1, 50);
    await due(f.fileId);
    await dispatchOnce(W1, 50);
    const attempts = await db().selectFrom('payout_attempts').select('outcome').where('client_reference_id', '=', f.refs[0]!).execute();
    expect(await statuses(f.fileId)).toBe('PENDING');
    expect(creates(f.refs)).toEqual([0]);
    expect(attempts).toEqual([{ outcome: 'DEFERRED' }]);
    gw.balance.set(B.kid, 10n ** 9n);
    await due(f.fileId);
    await dispatchOnce(W1, 50);
    expect(await statuses(f.fileId)).toBe('PROCESSING');
    expect(creates(f.refs)).toEqual([1]);
  });

  it('gateway says insufficient after our check: FAILED, reference consumed, never retried', async () => {
    const f = await upload(B.id, [['0180000001', '14.00']]);
    await confirm(f.fileId, B.id);
    gw.queue.push('gateway-insufficient');
    await dispatchOnce(W1, 50);
    await due(f.fileId);
    await dispatchOnce(W1, 50);
    await reconcileOnce(W1);
    const p = await db().selectFrom('payouts').selectAll().where('file_id', '=', f.fileId).executeTakeFirstOrThrow();
    expect(p).toMatchObject({ status: 'FAILED', failure_reason: 'account.payout.insufficient_balance' });
    expect(creates(f.refs)).toEqual([0]);
  });

  it('within one batch, what was already sent counts against the balance', async () => {
    const f = await upload(B.id, [['0190000001', '100.00'], ['0190000002', '100.00']]);
    await confirm(f.fileId, B.id);
    gw.balance.set(B.kid, 15_000n);
    await dispatchOnce(W1, 50);
    expect(await statuses(f.fileId)).toBe('PROCESSING,PENDING');
    gw.balance.set(B.kid, 10n ** 9n);
  });
});

describe('keys and circuit breaker', () => {
  it('an auth error pauses only that user', async () => {
    const fa = await upload(A.id, [['0200000001', '15.00']]);
    const fb = await upload(B.id, [['0200000002', '15.00']]);
    await confirm(fa.fileId, A.id);
    await confirm(fb.fileId, B.id);
    gw.authFail.add(A.kid);
    const W3 = deps('w3');
    try {
      await dispatchOnce(W3, 50);
      expect(W3.circuit.isOpen(A.id)).toBe(true);
      expect(W3.circuit.isOpen(B.id)).toBe(false);
      expect([await statuses(fa.fileId), await statuses(fb.fileId)]).toEqual(['PENDING', 'PROCESSING']);
      await due(fa.fileId);
      await dispatchOnce(W3, 50);
      expect(creates(fa.refs)).toEqual([0]);
    } finally {
      gw.authFail.delete(A.kid);
    }
  });

  it('a revoked key makes payouts wait, not fail; a new key sends them', async () => {
    const C = await makeUser('WC');
    const f = await upload(C.id, [['0210000001', '16.00']]);
    await confirm(f.fileId, C.id);
    await revokeKey((await activeKeySummary(C.id))!.id);
    await dispatchOnce(W1, 50);
    const p = await db().selectFrom('payouts').selectAll().where('file_id', '=', f.fileId).executeTakeFirstOrThrow();
    expect(p.status).toBe('PENDING');
    expect(p.attempt_count).toBe(0);
    expect(p.next_poll_at.getTime()).toBeGreaterThan(Date.now() + 60_000);
    await storeNewKey({ userId: C.id, kid: `kidC2${run}`, secret: 'secret-0000000000', scope: null, origin: 'pasted' });
    await due(f.fileId);
    await dispatchOnce(W1, 50);
    expect(await statuses(f.fileId)).toBe('PROCESSING');
  });
});

describe('cancel, reject, refund, fetch', () => {
  it('the owner cancels before confirming; references stay consumed', async () => {
    const f = await upload(A.id, [['0220000001', '17.00']]);
    expect((await cancelFile(f.fileId, B.id, 'x')).ok).toBe(false);
    expect((await cancelFile(f.fileId, A.id, 'wrong batch')).ok).toBe(true);
    expect([await statuses(f.fileId), await fileStatus(f.fileId)]).toEqual(['CANCELLED', 'CANCELLED']);
    expect((await approveFile(f.fileId, A.id, RICH)).ok).toBe(false);
    const again = await ingestFile({ userId: A.id, filename: `retry-${run}.csv`, buffer: Buffer.from([HEADER, [f.refs[0], acct('0220000009'), 'HDFC0000044', '17.00', today, 'Test Payee'].join(',')].join('\n')) });
    expect(again.outcome === 'REJECTED' && again.errors.map((e) => e.code)).toContain('DUPLICATE_REFERENCE');
  });

  it('an admin rejects only before confirmation, and a rejected file is never sent', async () => {
    const admin = await makeUser('WADM');
    const f = await upload(A.id, [['0230000001', '18.00']]);
    expect((await rejectFileByAdmin(f.fileId, admin.id, 'Duplicate of last week')).ok).toBe(true);
    expect([await fileStatus(f.fileId), await statuses(f.fileId)]).toEqual(['REJECTED', 'CANCELLED']);
    expect((await approveFile(f.fileId, A.id, RICH)).ok).toBe(false);
    await due(f.fileId);
    await dispatchOnce(W1, 50);
    expect(creates(f.refs)).toEqual([0]);
    const g = await upload(A.id, [['0230000002', '19.00']]);
    await confirm(g.fileId, A.id);
    expect((await rejectFileByAdmin(g.fileId, admin.id, 'too late')).ok).toBe(false);
  });

  it('a success that turns into a refund is caught by the refund watch', async () => {
    const f = await upload(A.id, [['0240000001', '20.00']]);
    await confirm(f.fileId, A.id);
    await dispatchOnce(W1, 50);
    await due(f.fileId);
    await pollOnce(W1);
    expect(await statuses(f.fileId)).toBe('SUCCEEDED');
    gw.payouts.get(f.refs[0]!)!.payout_status = 'refunded';
    await due(f.fileId);
    await pollOnce(W1);
    expect([await statuses(f.fileId), await fileStatus(f.fileId)]).toEqual(['REFUNDED', 'FAILED']);
  });

  it('fetch status reads the gateway for sent payouts and refuses unsent ones', async () => {
    const f = await upload(A.id, [['3250000001', '21.00'], ['0250000002', '22.00']]);
    const p = await db().selectFrom('payouts').select(['id', 'file_row']).where('file_id', '=', f.fileId).orderBy('file_row').execute();
    expect((await refreshPayout(W1, p[0]!.id)).ok).toBe(false);
    await confirm(f.fileId, A.id);
    await dispatchOnce(W1, 50);
    expect(await refreshPayout(W1, p[0]!.id)).toMatchObject({ ok: true, after: 'PROCESSING' });
  });
});

describe('the invariant', () => {
  it('across every scenario above, no reference reached create twice', () => {
    expect(gw.creates.size).toBeGreaterThan(40);
    expect([...gw.creates.values()].every((c) => c === 1)).toBe(true);
  });
});
