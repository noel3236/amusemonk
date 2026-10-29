import { db } from '@/db';
import { NEVER, now } from '@/worker/status';

// Only while the file waits for its owner's Confirm Payment (D-32): after that, payouts may already be at the
// gateway. References stay consumed, as with a cancel (D-15).
export async function rejectFileByAdmin(fileId: string, adminId: string, reason: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  return db()
    .transaction()
    .execute(async (tx) => {
      const f = await tx
        .selectFrom('payout_files')
        .select(['id', 'status', 'original_filename'])
        .where('id', '=', fileId)
        .forUpdate()
        .executeTakeFirst();
      if (!f) return { ok: false, reason: 'File not found.' };
      if (f.status !== 'AWAITING_APPROVAL') {
        return { ok: false, reason: 'Only a file still waiting for its owner to confirm payment can be rejected.' };
      }
      await tx
        .updateTable('payouts')
        .set({ status: 'CANCELLED', completed_at: now(), next_poll_at: NEVER, failure_reason: 'rejected by admin' })
        .where('file_id', '=', fileId)
        .where('status', '=', 'PENDING')
        .execute();
      await tx
        .updateTable('payout_files')
        .set({ status: 'REJECTED', cancelled_at: now(), cancelled_by: adminId, cancel_reason: reason.slice(0, 500), completed_at: now() })
        .where('id', '=', fileId)
        .execute();
      console.warn(`[files] REJECTED by admin ${adminId}: ${f.original_filename} (${fileId}): ${reason}`);
      return { ok: true };
    });
}
