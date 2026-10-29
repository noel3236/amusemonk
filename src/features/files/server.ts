import { sql } from 'kysely';
import { db } from '@/db';
import type { FileStatus, PayoutStatus } from '@/db/schema';
import { IN_FLIGHT } from '@/worker/status';

const count = (statuses: PayoutStatus[]) =>
  sql<number>`(SELECT COUNT(*) FROM payouts p WHERE p.file_id = f.id AND p.status IN (${sql.join(statuses)}))`;

export async function listFilesForUser(userId: string, opts: { limit?: number; status?: FileStatus } = {}) {
  return db()
    .selectFrom('payout_files as f')
    .select([
      'f.id',
      'f.original_filename',
      'f.status',
      'f.row_count',
      'f.total_amount_paise',
      'f.created_at',
      'f.approved_at',
      'f.completed_at',
      count(['SUCCEEDED']).as('paid'),
      count(['FAILED', 'REFUNDED']).as('failed'),
    ])
    .where('f.user_id', '=', userId)
    .$if(!!opts.status, (q) => q.where('f.status', '=', opts.status!))
    .orderBy('f.created_at', 'desc')
    .limit(opts.limit ?? 100)
    .execute();
}

export async function getFile(fileId: string) {
  return db()
    .selectFrom('payout_files as f')
    .innerJoin('users as u', 'u.id', 'f.user_id')
    .leftJoin('users as c', 'c.id', 'f.cancelled_by')
    .selectAll('f')
    .select(['u.email as owner_email', 'c.email as cancelled_by_email'])
    .where('f.id', '=', fileId)
    .executeTakeFirst();
}

export type FileRow = NonNullable<Awaited<ReturnType<typeof getFile>>>;

export async function fileSummary(fileId: string) {
  const rows = await db()
    .selectFrom('payouts')
    .select(['status', sql<number>`COUNT(*)`.as('n'), sql<string>`COALESCE(SUM(amount_paise), 0)`.as('paise')])
    .where('file_id', '=', fileId)
    .groupBy('status')
    .execute();
  const by = (statuses: PayoutStatus[]) =>
    rows
      .filter((r) => statuses.includes(r.status))
      .reduce((a, r) => ({ n: a.n + Number(r.n), paise: a.paise + BigInt(r.paise) }), { n: 0, paise: 0n });
  return {
    paid: by(['SUCCEEDED']),
    failed: by(['FAILED', 'REFUNDED']),
    inFlight: by(IN_FLIGHT),
    cancelled: by(['CANCELLED']),
  };
}

// Today in IST, as a UTC instant: payouts are judged by the day the user lives in.
const istMidnight = sql<Date>`CONVERT_TZ(DATE(CONVERT_TZ(CURRENT_TIMESTAMP(3), '+00:00', '+05:30')), '+05:30', '+00:00')`;

export async function dashboardStats(userId: string) {
  const agg = (statuses: PayoutStatus[], extra: 'today' | 'confirmed' | 'unconfirmed') =>
    db()
      .selectFrom('payouts as p')
      .innerJoin('payout_files as f', 'f.id', 'p.file_id')
      .select([sql<number>`COUNT(*)`.as('n'), sql<string>`COALESCE(SUM(p.amount_paise), 0)`.as('paise')])
      .where('p.user_id', '=', userId)
      .where('p.status', 'in', statuses)
      .$if(extra === 'today', (q) => q.where('p.completed_at', '>=', istMidnight))
      .$if(extra === 'confirmed', (q) => q.where('f.approved_at', 'is not', null))
      .$if(extra === 'unconfirmed', (q) => q.where('f.status', '=', 'AWAITING_APPROVAL'))
      .executeTakeFirstOrThrow();
  const [inFlight, paidToday, failedToday, toConfirm] = await Promise.all([
    agg(IN_FLIGHT, 'confirmed'),
    agg(['SUCCEEDED'], 'today'),
    agg(['FAILED', 'REFUNDED'], 'today'),
    agg(['PENDING'], 'unconfirmed'),
  ]);
  const norm = (r: { n: number; paise: string }) => ({ n: Number(r.n), paise: r.paise });
  return { inFlight: norm(inFlight), paidToday: norm(paidToday), failedToday: norm(failedToday), toConfirm: norm(toConfirm) };
}
