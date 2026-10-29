import { randomUUID } from 'node:crypto';
import type { AttemptOutcome } from '@/db/schema';
import { uapiEndpoint, type UapiCredentials } from '@/gateway/client';
import { GatewayHttpError, type PayoutCreateRequest } from '@/gateway/types';
import { paiseToInr } from '@/lib/money';
import { refreshBalance } from '@/features/balance/server';
import type { GatewayPort, WorkerDeps } from './deps';
import { applyGatewayPayout, inSeconds, NEVER, now, recomputeFileStatus } from './status';

interface Claimed {
  id: string;
  file_id: string;
  user_id: string;
  client_reference_id: string;
  bank_account: string;
  ifsc_code: string;
  beneficiary_name: string;
  amount_paise: string;
  attempt_id: string;
}

export type DispatchResult = {
  claimed: number;
  created: number;
  adopted: number;
  deferred: number;
  failed: number;
  unknown: number;
};

// CONTEXT §6.1 step 1. FOR UPDATE OF p: lock only payout rows, never the file row, or a second worker would skip
// every payout of a file the first worker is working on. Only confirmed files that nobody cancelled or rejected.
// READ COMMITTED: under InnoDB's default REPEATABLE READ the SKIP LOCKED scan takes gap locks on the status
// index, and two workers flipping their rows to DISPATCHING deadlock on each other's gaps.
async function claim(deps: WorkerDeps, limit: number): Promise<Claimed[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await claimOnce(deps, limit);
    } catch (e) {
      // A lost deadlock rolled back before anything was sent, so claiming again is safe.
      if ((e as { code?: string }).code !== 'ER_LOCK_DEADLOCK' || attempt >= 3) throw e;
    }
  }
}

async function claimOnce(deps: WorkerDeps, limit: number): Promise<Claimed[]> {
  const blocked = deps.circuit.openUsers();
  return deps.db.transaction().setIsolationLevel('read committed').execute(async (tx) => {
    let q = tx
      .selectFrom('payouts as p')
      .innerJoin('payout_files as f', 'f.id', 'p.file_id')
      .select([
        'p.id',
        'p.file_id',
        'p.user_id',
        'p.client_reference_id',
        'p.bank_account',
        'p.ifsc_code',
        'p.beneficiary_name',
        'p.amount_paise',
        'p.attempt_count',
        'p.current_attempt_id',
      ])
      .where('p.status', '=', 'PENDING')
      .where('p.next_poll_at', '<=', now())
      .where('f.approved_at', 'is not', null)
      .where('f.status', 'not in', ['CANCELLED', 'REJECTED']);
    if (blocked.length) q = q.where('p.user_id', 'not in', blocked);
    const rows = await q.orderBy('p.created_at').orderBy('p.file_row').limit(limit).forUpdate('p').skipLocked().execute();
    if (!rows.length) return [];

    const keys = await tx
      .selectFrom('user_api_keys')
      .select(['id', 'user_id'])
      .where('status', '=', 'active')
      .where('user_id', 'in', [...new Set(rows.map((r) => r.user_id))])
      .execute();
    const keyOf = new Map(keys.map((k) => [k.user_id, k.id]));

    // No active key (revoked, not replaced): wait for the user to reconnect rather than fail the payout.
    const keyless = rows.filter((r) => !keyOf.has(r.user_id)).map((r) => r.id);
    if (keyless.length) {
      await tx.updateTable('payouts').set({ next_poll_at: inSeconds(deps.config.BALANCE_BACKOFF_SECONDS) }).where('id', 'in', keyless).execute();
      console.warn(`[worker] ${keyless.length} payout(s) waiting: their owner has no active gateway key`);
    }
    const ready = rows.filter((r) => keyOf.has(r.user_id));
    if (!ready.length) return [];

    await tx
      .updateTable('payouts')
      .set({ status: 'DISPATCHING', locked_at: now(), locked_by: deps.config.workerId })
      .where('id', 'in', ready.map((r) => r.id))
      .execute();

    const out: Claimed[] = [];
    const reusable = ready.filter((r) => r.current_attempt_id);
    const open = new Set(
      reusable.length
        ? (
            await tx
              .selectFrom('payout_attempts')
              .select('id')
              .where('id', 'in', reusable.map((r) => r.current_attempt_id!))
              .where('outcome', 'in', ['STARTED', 'DEFERRED'])
              .execute()
          ).map((a) => a.id)
        : []
    );
    for (const r of ready) {
      const apiKeyId = keyOf.get(r.user_id)!;
      let attemptId = r.current_attempt_id;
      // An attempt that never reached the gateway's create call is reused, so balance waits don't pile up rows.
      if (attemptId && open.has(attemptId)) {
        await tx
          .updateTable('payout_attempts')
          .set({ outcome: 'STARTED', api_key_id: apiKeyId, error_code: null, finished_at: null })
          .where('id', '=', attemptId)
          .execute();
      } else {
        attemptId = randomUUID();
        await tx
          .insertInto('payout_attempts')
          .values({
            id: attemptId,
            payout_id: r.id,
            attempt_no: r.attempt_count + 1,
            client_reference_id: r.client_reference_id,
            api_key_id: apiKeyId,
            gateway_endpoint: uapiEndpoint(),
          })
          .execute();
        await tx
          .updateTable('payouts')
          .set({ attempt_count: r.attempt_count + 1, current_attempt_id: attemptId, api_key_id: apiKeyId })
          .where('id', '=', r.id)
          .execute();
      }
      out.push({ ...r, attempt_id: attemptId });
    }
    return out;
  });
}

async function finishAttempt(
  deps: WorkerDeps,
  attemptId: string,
  outcome: AttemptOutcome,
  httpStatus: number | null,
  response: unknown,
  errorCode: string | null
) {
  await deps.db
    .updateTable('payout_attempts')
    .set({
      outcome,
      http_status: httpStatus,
      response_json: response === undefined ? null : JSON.stringify(response),
      error_code: errorCode?.slice(0, 128) ?? null,
      finished_at: now(),
    })
    .where('id', '=', attemptId)
    .execute();
}

// Back to PENDING after a delay. Only while the row is still ours.
async function defer(deps: WorkerDeps, p: Claimed, seconds: number, note: string) {
  await deps.db
    .updateTable('payouts')
    .set({ status: 'PENDING', locked_at: null, locked_by: null, next_poll_at: inSeconds(seconds) })
    .where('id', '=', p.id)
    .where('status', '=', 'DISPATCHING')
    .where('locked_by', '=', deps.config.workerId)
    .execute();
  await finishAttempt(deps, p.attempt_id, 'DEFERRED', null, { note }, null);
}

async function markUnknown(deps: WorkerDeps, p: Claimed, seconds: number, reason: string, httpStatus: number | null) {
  await deps.db
    .updateTable('payouts')
    .set({ status: 'UNKNOWN', locked_at: null, locked_by: null, next_poll_at: inSeconds(seconds) })
    .where('id', '=', p.id)
    .execute();
  await finishAttempt(deps, p.attempt_id, 'UNKNOWN', httpStatus, null, reason);
}

async function markFailed(deps: WorkerDeps, p: Claimed, reason: string, httpStatus: number | null, response: unknown) {
  await deps.db
    .updateTable('payouts')
    .set({
      status: 'FAILED',
      failure_reason: reason.slice(0, 255),
      completed_at: now(),
      locked_at: null,
      locked_by: null,
      next_poll_at: NEVER,
    })
    .where('id', '=', p.id)
    .execute();
  await finishAttempt(deps, p.attempt_id, 'FAILED', httpStatus, response, reason);
}

// Check-before-create (CONTEXT §6.1 step 2): true when the gateway already has this reference and we adopted it.
async function adoptIfExists(deps: WorkerDeps, gw: GatewayPort, p: Claimed): Promise<boolean> {
  const existing = await gw.findByClientReference(p.client_reference_id);
  if (!existing) return false;
  await applyGatewayPayout(deps.db, p.id, existing, deps.config.REFUND_WATCH_DAYS);
  await finishAttempt(deps, p.attempt_id, 'ADOPTED_EXISTING', 200, existing, null);
  console.warn(`[worker] adopted existing gateway payout for ${p.client_reference_id} (${existing.payout_status}); not re-created`);
  return true;
}

export async function dispatchOnce(deps: WorkerDeps, limit = deps.config.DISPATCH_BATCH_SIZE): Promise<DispatchResult> {
  const result: DispatchResult = { claimed: 0, created: 0, adopted: 0, deferred: 0, failed: 0, unknown: 0 };
  const batch = await claim(deps, limit);
  result.claimed = batch.length;

  const creds = new Map<string, UapiCredentials | null>();
  // What this batch has already sent per user: the gateway's balance can lag behind our own creates.
  const spent = new Map<string, bigint>();

  for (const p of batch) {
    try {
      if (deps.circuit.isOpen(p.user_id)) {
        await defer(deps, p, 60, 'circuit open for this user (auth error on an earlier payout)');
        result.deferred += 1;
        continue;
      }
      if (!creds.has(p.user_id)) creds.set(p.user_id, await deps.credentialsFor(p.user_id));
      const c = creds.get(p.user_id);
      if (!c) {
        await defer(deps, p, deps.config.BALANCE_BACKOFF_SECONDS, 'owner has no active gateway key');
        result.deferred += 1;
        continue;
      }
      const gw = deps.clientFor(c);

      try {
        if (await adoptIfExists(deps, gw, p)) {
          result.adopted += 1;
          await recomputeFileStatus(deps.db, p.file_id);
          continue;
        }
      } catch (e) {
        // Nothing has been sent, so trying again later is safe.
        if (e instanceof GatewayHttpError && (e.status === 401 || e.status === 403)) {
          deps.circuit.open(p.user_id, `HTTP ${e.status} on status check`);
          await defer(deps, p, 60, `auth error ${e.status} on status check`);
        } else {
          await defer(deps, p, 30, `status check failed: ${(e as Error).message}`);
        }
        result.deferred += 1;
        continue;
      }

      // Does not consume the reference.
      const amount = BigInt(p.amount_paise);
      const balance = await refreshBalance(p.user_id, gw);
      if (!balance.ok || balance.balancePaise === null) {
        await defer(deps, p, 30, `balance check failed: ${balance.ok ? 'no balance' : balance.error}`);
        result.deferred += 1;
        continue;
      }
      const available = BigInt(balance.balancePaise) - (spent.get(p.user_id) ?? 0n);
      if (available < amount) {
        await defer(
          deps,
          p,
          deps.config.BALANCE_BACKOFF_SECONDS,
          `insufficient balance: available ${paiseToInr(available)} < ${paiseToInr(amount)}`
        );
        result.deferred += 1;
        continue;
      }

      const req: PayoutCreateRequest = {
        bank_currency: 'inr',
        amount: paiseToInr(amount),
        account_holder_name: p.beneficiary_name,
        client_reference_id: p.client_reference_id,
        bank_ifsc_code: p.ifsc_code,
        account_number: p.bank_account,
        penny_drop_required: deps.config.PENNY_DROP_REQUIRED,
      };
      await deps.db
        .updateTable('payout_attempts')
        .set({ request_json: JSON.stringify(req) })
        .where('id', '=', p.attempt_id)
        .execute();
      const out = await gw.createPayout(req);

      switch (out.kind) {
        case 'created':
          spent.set(p.user_id, (spent.get(p.user_id) ?? 0n) + amount);
          await applyGatewayPayout(deps.db, p.id, out.payout, deps.config.REFUND_WATCH_DAYS);
          await finishAttempt(deps, p.attempt_id, 'CREATED', 201, out.payout, null);
          result.created += 1;
          break;
        case 'duplicate_reference': {
          // The gateway has it (perhaps from a lost response). Adopt it; never create it again.
          let adopted = false;
          try {
            adopted = await adoptIfExists(deps, gw, p);
          } catch {
            adopted = false;
          }
          if (adopted) result.adopted += 1;
          else {
            await markUnknown(deps, p, 10, 'duplicate_reference_but_not_found', 422);
            result.unknown += 1;
          }
          break;
        }
        case 'in_processing':
          await markUnknown(deps, p, 10, 'account.payout.create_in_processing', 422);
          result.unknown += 1;
          break;
        case 'insufficient_balance':
          // The gateway consumed the reference; it can never be sent again (D-18). Re-upload with a new one.
          await markFailed(deps, p, 'account.payout.insufficient_balance', 422, null);
          result.failed += 1;
          break;
        case 'validation_failed':
          await markFailed(deps, p, out.codes.join('; '), 422, { errors: out.codes });
          result.failed += 1;
          break;
        case 'rate_limited':
          await defer(deps, p, 2, 'rate limited (503)');
          result.deferred += 1;
          break;
        case 'auth_error':
          // Rejected before the API: nothing was created. Pause this user's key.
          deps.circuit.open(p.user_id, `HTTP ${out.status}: ${out.codes.join(',')}`);
          await defer(deps, p, 60, `auth error ${out.status}: ${out.codes.join(',')}`);
          result.deferred += 1;
          break;
        default:
          // 500 / timeout / network: the payout MAY exist. Never POST again blindly; the reconciler asks.
          await markUnknown(deps, p, 10, out.reason, null);
          result.unknown += 1;
      }
      await recomputeFileStatus(deps.db, p.file_id);
    } catch (e) {
      // Our own bug or a DB error after claiming. The row stays DISPATCHING; the reconciler resolves it.
      console.error(`[worker] dispatch of ${p.id} failed unexpectedly; leaving it for reconcile:`, e);
      result.unknown += 1;
    }
  }
  return result;
}
