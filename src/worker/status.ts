import { sql } from 'kysely';
import type { Db } from '@/db';
import type { PayoutStatus } from '@/db/schema';
import type { GatewayPayout } from '@/gateway/types';

export const TERMINAL: PayoutStatus[] = ['SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED'];
export const IN_FLIGHT: PayoutStatus[] = ['PENDING', 'DISPATCHING', 'PROCESSING', 'UNKNOWN'];
// Rows that must never be picked up again.
export const NEVER = new Date('9999-12-31T00:00:00Z');

export const now = () => sql<Date>`CURRENT_TIMESTAMP(3)`;
export const inSeconds = (s: number) => sql<Date>`DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ${Math.round(s)} SECOND)`;
// 30 s, doubling per consecutive failure, capped at 10 min. MySQL evaluates SET left to right, so when
// poll_failures is set earlier in the same UPDATE this sees the new value.
export const backoff = () =>
  sql<Date>`DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL LEAST(600, 30 * POW(2, LEAST(poll_failures, 5))) SECOND)`;

export function mapGatewayStatus(gatewayStatus: string | null | undefined): PayoutStatus {
  switch ((gatewayStatus ?? '').toLowerCase()) {
    case 'succeed':
    case 'succeeded':
    case 'success':
      return 'SUCCEEDED';
    case 'rejected':
    case 'failed':
      return 'FAILED';
    case 'refunded':
      return 'REFUNDED';
    default:
      return 'PROCESSING';
  }
}

const cut = (v: unknown, n: number) => (v === null || v === undefined ? null : String(v).slice(0, n));

// The gateway's view is the truth. Safe from any worker at any time: it never creates anything.
export async function applyGatewayPayout(
  q: Db,
  payoutId: string,
  gp: GatewayPayout,
  refundWatchDays: number
): Promise<PayoutStatus> {
  const status = mapGatewayStatus(gp.payout_status);
  const done = status === 'SUCCEEDED' || status === 'FAILED' || status === 'REFUNDED';
  const nextPoll =
    status === 'SUCCEEDED' && refundWatchDays > 0 ? inSeconds(86_400) : TERMINAL.includes(status) ? NEVER : null;
  await q
    .updateTable('payouts')
    .set({
      status,
      gateway_payout_id: sql`COALESCE(${cut(gp.payout_id, 64)}, gateway_payout_id)`,
      bank_transaction_id: sql`COALESCE(${cut(gp.bank_transaction_id, 64)}, bank_transaction_id)`,
      gateway_status: cut(gp.payout_status, 32),
      gateway_status_code: cut(gp.status_code, 32),
      gateway_status_message: cut(gp.status_message ?? gp.remark, 500),
      gateway_response_json: JSON.stringify(gp),
      failure_reason:
        status === 'FAILED' || status === 'REFUNDED' ? cut(gp.status_code ?? gp.payout_status, 255) : sql`failure_reason`,
      completed_at: done ? sql`COALESCE(completed_at, CURRENT_TIMESTAMP(3))` : null,
      last_polled_at: now(),
      poll_failures: 0,
      locked_at: null,
      locked_by: null,
      next_poll_at: nextPoll ?? backoff(),
    })
    .where('id', '=', payoutId)
    .execute();
  return status;
}

export async function recordPollFailure(q: Db, payoutId: string) {
  await q
    .updateTable('payouts')
    .set({ poll_failures: sql`poll_failures + 1`, last_polled_at: now(), next_poll_at: backoff() })
    .where('id', '=', payoutId)
    .execute();
}

// CONTEXT §7: a file's status is derived from its payouts.
export async function recomputeFileStatus(q: Db, fileId: string): Promise<void> {
  await sql`
    UPDATE payout_files f
    JOIN (
      SELECT file_id,
             COUNT(*) AS total,
             SUM(status IN ('SUCCEEDED','FAILED','REFUNDED','CANCELLED')) AS terminal,
             SUM(status = 'SUCCEEDED') AS ok,
             SUM(status = 'PENDING' AND attempt_count = 0) AS untouched
        FROM payouts WHERE file_id = ${fileId} GROUP BY file_id
    ) a ON a.file_id = f.id
    SET f.completed_at = CASE WHEN a.terminal = a.total THEN COALESCE(f.completed_at, CURRENT_TIMESTAMP(3)) ELSE NULL END,
        f.status = CASE
          WHEN f.status IN ('AWAITING_APPROVAL', 'CANCELLED', 'REJECTED') THEN f.status
          WHEN a.terminal < a.total AND a.untouched = a.total THEN 'ACCEPTED'
          WHEN a.terminal < a.total THEN 'PROCESSING'
          WHEN a.ok = a.total THEN 'COMPLETED'
          WHEN a.ok = 0 THEN 'FAILED'
          ELSE 'COMPLETED_WITH_FAILURES' END
    WHERE f.id = ${fileId}`.execute(q);
}
