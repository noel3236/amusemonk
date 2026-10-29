import type { PayoutStatus } from '@/db/schema';
import type { WorkerDeps } from './deps';
import { applyGatewayPayout, recomputeFileStatus } from './status';

export type RefreshResult = { ok: true; before: PayoutStatus; after: PayoutStatus } | { ok: false; reason: string };

// "Fetch status" for one payout. Read-only against the gateway: it never creates anything.
export async function refreshPayout(deps: WorkerDeps, payoutId: string): Promise<RefreshResult> {
  const p = await deps.db
    .selectFrom('payouts')
    .select(['id', 'file_id', 'user_id', 'status', 'client_reference_id', 'gateway_payout_id'])
    .where('id', '=', payoutId)
    .executeTakeFirst();
  if (!p) return { ok: false, reason: 'Payout not found.' };
  if (p.status === 'PENDING' || p.status === 'CANCELLED') {
    return { ok: false, reason: `This payout is ${p.status.toLowerCase()}: it hasn't been sent, so the gateway has nothing to report.` };
  }
  const c = await deps.credentialsFor(p.user_id);
  if (!c) return { ok: false, reason: 'The owner has no active gateway key.' };
  try {
    const gw = deps.clientFor(c);
    const gp =
      (await gw.findByClientReference(p.client_reference_id)) ??
      (p.gateway_payout_id ? await gw.findByPayoutId(p.gateway_payout_id) : null);
    if (!gp) return { ok: false, reason: `The gateway has no record of ${p.client_reference_id}.` };
    const after = await applyGatewayPayout(deps.db, p.id, gp, deps.config.REFUND_WATCH_DAYS);
    await recomputeFileStatus(deps.db, p.file_id);
    return { ok: true, before: p.status, after };
  } catch (e) {
    return { ok: false, reason: `Gateway error: ${(e as Error).message}` };
  }
}
