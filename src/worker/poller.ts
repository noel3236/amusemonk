import { sql } from 'kysely';
import type { UapiCredentials } from '@/gateway/client';
import type { WorkerDeps } from './deps';
import { applyGatewayPayout, now, recomputeFileStatus, recordPollFailure } from './status';

// In-flight payouts, plus recently SUCCEEDED ones (a success can still turn into a refund).
export async function pollOnce(deps: WorkerDeps, limit = 100) {
  const rows = await deps.db
    .selectFrom('payouts')
    .select(['id', 'file_id', 'user_id', 'status', 'client_reference_id', 'gateway_payout_id'])
    .where('next_poll_at', '<=', now())
    .where((eb) =>
      eb.or([
        eb('status', '=', 'PROCESSING'),
        eb.and([
          eb('status', '=', 'SUCCEEDED'),
          eb('completed_at', '>', sql<Date>`DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ${deps.config.REFUND_WATCH_DAYS} DAY)`),
        ]),
      ])
    )
    .orderBy('next_poll_at')
    .limit(limit)
    .execute();

  const out = { polled: 0, changed: 0, errors: 0 };
  const creds = new Map<string, UapiCredentials | null>();
  for (const row of rows) {
    if (deps.circuit.isOpen(row.user_id)) continue;
    out.polled += 1;
    try {
      if (!creds.has(row.user_id)) creds.set(row.user_id, await deps.credentialsFor(row.user_id));
      const c = creds.get(row.user_id);
      if (!c) {
        await recordPollFailure(deps.db, row.id);
        continue;
      }
      const gw = deps.clientFor(c);
      const gp =
        (await gw.findByClientReference(row.client_reference_id)) ??
        (row.gateway_payout_id ? await gw.findByPayoutId(row.gateway_payout_id) : null);
      if (!gp) {
        // An in-flight payout the gateway no longer reports: never guess a status. Back off and shout.
        console.error(`[worker] gateway has no record of in-flight payout ${row.id} (${row.client_reference_id})`);
        await recordPollFailure(deps.db, row.id);
        out.errors += 1;
        continue;
      }
      const after = await applyGatewayPayout(deps.db, row.id, gp, deps.config.REFUND_WATCH_DAYS);
      if (after !== row.status) {
        out.changed += 1;
        console.info(`[worker] payout ${row.id} ${row.status} -> ${after} (${gp.status_code})`);
        await recomputeFileStatus(deps.db, row.file_id);
      }
    } catch (e) {
      out.errors += 1;
      await recordPollFailure(deps.db, row.id);
      console.warn(`[worker] poll of ${row.id} failed: ${(e as Error).message}`);
    }
  }
  return out;
}
