import { sql } from 'kysely';
import type { UapiCredentials } from '@/gateway/client';
import type { WorkerDeps } from './deps';
import { applyGatewayPayout, inSeconds, now, recomputeFileStatus } from './status';

// Rows whose outcome we don't know: UNKNOWN (500 / timeout / in_processing) once due, and DISPATCHING rows a worker
// abandoned. The status API is the truth: found ⇒ adopt; empty ⇒ nothing was created (guide p.19) ⇒ PENDING again,
// with the SAME reference, so even a late create on the gateway's side is caught by its idempotency.
export async function reconcileOnce(deps: WorkerDeps, limit = 50) {
  const rows = await deps.db
    .selectFrom('payouts')
    .select(['id', 'file_id', 'user_id', 'status', 'client_reference_id', 'gateway_payout_id', 'current_attempt_id'])
    .where((eb) =>
      eb.or([
        eb.and([eb('status', '=', 'UNKNOWN'), eb('next_poll_at', '<=', now())]),
        eb.and([
          eb('status', '=', 'DISPATCHING'),
          eb('locked_at', '<', sql<Date>`DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ${deps.config.STUCK_AFTER_SECONDS} SECOND)`),
        ]),
      ])
    )
    .orderBy('updated_at')
    .limit(limit)
    .execute();

  const out = { processed: 0, adopted: 0, requeued: 0, errors: 0 };
  const creds = new Map<string, UapiCredentials | null>();
  for (const row of rows) {
    if (deps.circuit.isOpen(row.user_id)) continue;
    out.processed += 1;
    try {
      if (!creds.has(row.user_id)) creds.set(row.user_id, await deps.credentialsFor(row.user_id));
      const c = creds.get(row.user_id);
      if (!c) throw new Error('owner has no active gateway key');
      const gw = deps.clientFor(c);
      const existing =
        (await gw.findByClientReference(row.client_reference_id)) ??
        (row.gateway_payout_id ? await gw.findByPayoutId(row.gateway_payout_id) : null);

      if (existing) {
        await applyGatewayPayout(deps.db, row.id, existing, deps.config.REFUND_WATCH_DAYS);
        if (row.current_attempt_id) {
          await deps.db
            .updateTable('payout_attempts')
            .set({ outcome: 'ADOPTED_EXISTING', response_json: JSON.stringify(existing), finished_at: now() })
            .where('id', '=', row.current_attempt_id)
            .execute();
        }
        console.warn(`[worker] reconciled ${row.client_reference_id} from gateway: ${row.status} -> ${existing.payout_status}`);
        out.adopted += 1;
      } else {
        await deps.db
          .updateTable('payouts')
          .set({ status: 'PENDING', locked_at: null, locked_by: null, next_poll_at: now() })
          .where('id', '=', row.id)
          .where('status', '=', row.status)
          .execute();
        if (row.current_attempt_id) {
          await deps.db
            .updateTable('payout_attempts')
            .set({ error_code: 'reconcile:not_found_at_gateway', finished_at: now() })
            .where('id', '=', row.current_attempt_id)
            .execute();
        }
        console.warn(`[worker] gateway has no record of ${row.client_reference_id}; re-queued with the same reference`);
        out.requeued += 1;
      }
      await recomputeFileStatus(deps.db, row.file_id);
    } catch (e) {
      out.errors += 1;
      await deps.db
        .updateTable('payouts')
        .set({ poll_failures: sql`poll_failures + 1`, next_poll_at: inSeconds(30) })
        .where('id', '=', row.id)
        .execute();
      console.warn(`[worker] reconcile of ${row.id} failed: ${(e as Error).message}`);
    }
  }
  return out;
}
