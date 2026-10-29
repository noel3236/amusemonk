import { sql } from 'kysely';
import { db } from '@/db';
import { activeCredentials } from '@/features/api-keys/server';
import { refreshBalance } from '@/features/balance/server';
import { createUapiClient, type UapiCredentials } from '@/gateway/client';
import { formatRupees } from '@/lib/format';
import { IN_FLIGHT, NEVER, now, recomputeFileStatus } from '@/worker/status';

export type ApprovalResult = { ok: true } | { ok: false; reason: string };

type BalanceReader = (userId: string, creds: UapiCredentials) => ReturnType<typeof refreshBalance>;
const liveBalance: BalanceReader = (userId, creds) => refreshBalance(userId, createUapiClient(creds));

// The uploader approves their own file (user decision, D-29): it's their money, from their own gateway account.
// Approval re-checks the balance against everything of theirs already approved and in flight.
export async function approveFile(
  fileId: string,
  userId: string,
  readBalance: BalanceReader = liveBalance
): Promise<ApprovalResult> {
  return db()
    .transaction()
    .execute(async (tx) => {
      const f = await tx
        .selectFrom('payout_files')
        .select(['id', 'user_id', 'status', 'total_amount_paise', 'original_filename'])
        .where('id', '=', fileId)
        .forUpdate()
        .executeTakeFirst();
      if (!f || f.user_id !== userId) return { ok: false, reason: 'File not found.' };
      if (f.status !== 'AWAITING_APPROVAL') return { ok: false, reason: 'This file is no longer waiting for confirmation.' };

      const creds = await activeCredentials(userId);
      if (!creds) return { ok: false, reason: 'Connect your API key before confirming payment.' };
      const balance = await readBalance(userId, creds);
      if (!balance.ok || balance.balancePaise === null) {
        return { ok: false, reason: 'Couldn’t read your gateway balance, so payment wasn’t confirmed rather than risk failed payouts. Try again shortly.' };
      }
      const inFlight = await tx
        .selectFrom('payouts as p')
        .innerJoin('payout_files as pf', 'pf.id', 'p.file_id')
        .select(sql<string>`COALESCE(SUM(p.amount_paise), 0)`.as('s'))
        .where('p.user_id', '=', userId)
        .where('p.status', 'in', IN_FLIGHT)
        .where('pf.approved_at', 'is not', null)
        .executeTakeFirstOrThrow();
      const room = BigInt(balance.balancePaise) - BigInt(inFlight.s);
      const need = BigInt(f.total_amount_paise);
      if (room < need) {
        return {
          ok: false,
          reason: `Not enough balance: ${formatRupees(room < 0n ? 0n : room)} is free after approved payouts in flight, and this file needs ${formatRupees(need)}. Top up, then confirm payment.`,
        };
      }

      await tx.updateTable('payout_files').set({ status: 'ACCEPTED', approved_at: now(), approved_by: userId }).where('id', '=', fileId).execute();
      await tx.updateTable('payouts').set({ next_poll_at: now() }).where('file_id', '=', fileId).where('status', '=', 'PENDING').execute();
      await recomputeFileStatus(tx, fileId);
      console.warn(`[files] APPROVED ${f.original_filename} (${fileId}) for ${formatRupees(need)} by ${userId}`);
      return { ok: true };
    });
}

// Only before approval. References stay consumed (D-15): a corrected file must carry new ones.
export async function cancelFile(fileId: string, userId: string, reason: string): Promise<ApprovalResult> {
  return db()
    .transaction()
    .execute(async (tx) => {
      const f = await tx
        .selectFrom('payout_files')
        .select(['id', 'user_id', 'status', 'original_filename'])
        .where('id', '=', fileId)
        .forUpdate()
        .executeTakeFirst();
      if (!f || f.user_id !== userId) return { ok: false, reason: 'File not found.' };
      if (f.status !== 'AWAITING_APPROVAL') return { ok: false, reason: 'Only a file waiting for confirmation can be cancelled.' };
      await tx
        .updateTable('payouts')
        .set({ status: 'CANCELLED', completed_at: now(), next_poll_at: NEVER, failure_reason: 'cancelled before confirmation' })
        .where('file_id', '=', fileId)
        .where('status', '=', 'PENDING')
        .execute();
      await tx
        .updateTable('payout_files')
        .set({ status: 'CANCELLED', cancelled_at: now(), cancelled_by: userId, cancel_reason: reason.slice(0, 500) || null, completed_at: now() })
        .where('id', '=', fileId)
        .execute();
      console.warn(`[files] cancelled ${f.original_filename} (${fileId}) by ${userId}`);
      return { ok: true };
    });
}
