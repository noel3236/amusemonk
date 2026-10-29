import { sql } from 'kysely';
import { db } from '@/db';
import type { FileStatus, PayoutStatus } from '@/db/schema';
import type { ListQuery } from '@/lib/list-params';
import { FILE_GROUPS, PAYOUT_GROUPS } from './specs';

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

function groupCounts<S extends string>(rows: { status: S; n: number }[], groups: Record<string, S[]>) {
  const counts: Record<string, number> = { '': 0 };
  for (const r of rows) {
    counts['']! += Number(r.n);
    for (const [g, statuses] of Object.entries(groups)) if (statuses.includes(r.status)) counts[g] = (counts[g] ?? 0) + Number(r.n);
  }
  for (const g of Object.keys(groups)) counts[g] ??= 0;
  return counts;
}

const PAYOUT_SEARCH = {
  reference: 'p.client_reference_id',
  account: 'p.bank_account',
  name: 'p.beneficiary_name',
  utr: 'p.bank_transaction_id',
  gateway: 'p.gateway_payout_id',
} as const;
const PAYOUT_DATES = { updated: 'p.updated_at', created: 'p.created_at', completed: 'p.completed_at' } as const;

export const payoutColumns = [
  'p.id',
  'p.file_id',
  'p.file_row',
  'p.client_reference_id',
  'p.beneficiary_name',
  'p.bank_account',
  'p.ifsc_code',
  'p.amount_paise',
  'p.transaction_date',
  'p.status',
  'p.failure_reason',
  'p.gateway_payout_id',
  'p.bank_transaction_id',
  'p.gateway_status',
  'p.gateway_status_code',
  'p.gateway_status_message',
  'p.attempt_count',
  'p.updated_at',
  'f.status as file_status',
  'f.original_filename',
] as const;

// One query shape for every payouts list (all of a user's, or one file's): the page of rows, the filtered
// count and amount (for the totals row), and per-quick-chip counts under every other filter.
export async function listPayouts(scope: { userId?: string; fileId?: string }, q: ListQuery, pageSize = 50) {
  const base = () => {
    let b = db().selectFrom('payouts as p').innerJoin('payout_files as f', 'f.id', 'p.file_id');
    if (scope.userId) b = b.where('p.user_id', '=', scope.userId);
    if (scope.fileId) b = b.where('p.file_id', '=', scope.fileId);
    if (q.q && q.by && q.by in PAYOUT_SEARCH) b = b.where(PAYOUT_SEARCH[q.by as keyof typeof PAYOUT_SEARCH], 'like', like(q.q));
    if (q.dateOn && q.dateOn in PAYOUT_DATES) {
      const col = PAYOUT_DATES[q.dateOn as keyof typeof PAYOUT_DATES];
      if (q.from) b = b.where(col, '>=', q.from);
      if (q.to) b = b.where(col, '<', q.to);
    }
    if (q.minPaise !== undefined) b = b.where('p.amount_paise', '>=', q.minPaise.toString());
    if (q.maxPaise !== undefined) b = b.where('p.amount_paise', '<=', q.maxPaise.toString());
    return b;
  };
  const filtered = () => (q.status && PAYOUT_GROUPS[q.status] ? base().where('p.status', 'in', PAYOUT_GROUPS[q.status]!) : base());
  const sort = q.sort ?? (scope.fileId ? 'row_asc' : 'updated_desc');

  let rowsQ = filtered().select(payoutColumns);
  if (sort === 'amount_desc') rowsQ = rowsQ.orderBy('p.amount_paise', 'desc');
  else if (sort === 'amount_asc') rowsQ = rowsQ.orderBy('p.amount_paise', 'asc');
  else if (sort === 'created_desc') rowsQ = rowsQ.orderBy('p.created_at', 'desc').orderBy('p.file_row');
  else if (sort === 'row_asc') rowsQ = rowsQ.orderBy('p.file_row');
  else rowsQ = rowsQ.orderBy('p.updated_at', 'desc');

  const [rows, totals, byStatus] = await Promise.all([
    rowsQ.orderBy('p.id').limit(pageSize).offset((q.page - 1) * pageSize).execute(),
    filtered()
      .select([sql<number>`COUNT(*)`.as('n'), sql<string>`COALESCE(SUM(p.amount_paise), 0)`.as('paise')])
      .executeTakeFirstOrThrow(),
    base().select(['p.status', sql<number>`COUNT(*)`.as('n')]).groupBy('p.status').execute(),
  ]);
  return {
    rows,
    total: Number(totals.n),
    totalPaise: totals.paise,
    pages: Math.max(1, Math.ceil(Number(totals.n) / pageSize)),
    counts: groupCounts<PayoutStatus>(byStatus, PAYOUT_GROUPS),
  };
}

export type PayoutRow = Awaited<ReturnType<typeof listPayouts>>['rows'][number];

const FILE_SEARCH = { filename: 'f.original_filename', user: 'u.email' } as const;
const FILE_DATES = { created: 'f.created_at', approved: 'f.approved_at' } as const;
const count = (statuses: PayoutStatus[]) =>
  sql<number>`(SELECT COUNT(*) FROM payouts p WHERE p.file_id = f.id AND p.status IN (${sql.join(statuses)}))`;

export async function listFiles(scope: { userId?: string }, q: ListQuery, pageSize = 50) {
  const base = () => {
    let b = db().selectFrom('payout_files as f').innerJoin('users as u', 'u.id', 'f.user_id');
    if (scope.userId) b = b.where('f.user_id', '=', scope.userId);
    if (q.q && q.by && q.by in FILE_SEARCH) b = b.where(FILE_SEARCH[q.by as keyof typeof FILE_SEARCH], 'like', like(q.q));
    if (q.dateOn && q.dateOn in FILE_DATES) {
      const col = FILE_DATES[q.dateOn as keyof typeof FILE_DATES];
      if (q.from) b = b.where(col, '>=', q.from);
      if (q.to) b = b.where(col, '<', q.to);
    }
    if (q.minPaise !== undefined) b = b.where('f.total_amount_paise', '>=', q.minPaise.toString());
    if (q.maxPaise !== undefined) b = b.where('f.total_amount_paise', '<=', q.maxPaise.toString());
    return b;
  };
  const filtered = () => (q.status && FILE_GROUPS[q.status] ? base().where('f.status', 'in', FILE_GROUPS[q.status]!) : base());

  let rowsQ = filtered().select([
    'f.id',
    'f.original_filename',
    'f.status',
    'f.row_count',
    'f.total_amount_paise',
    'f.created_at',
    'f.approved_at',
    'f.cancel_reason',
    'u.email',
    'u.gatekeeper_uid',
    count(['SUCCEEDED']).as('paid'),
    count(['FAILED', 'REFUNDED']).as('failed'),
  ]);
  if (q.sort === 'created_asc') rowsQ = rowsQ.orderBy('f.created_at', 'asc');
  else if (q.sort === 'total_desc') rowsQ = rowsQ.orderBy('f.total_amount_paise', 'desc');
  else rowsQ = rowsQ.orderBy('f.created_at', 'desc');

  const [rows, totals, byStatus] = await Promise.all([
    rowsQ.orderBy('f.id').limit(pageSize).offset((q.page - 1) * pageSize).execute(),
    filtered()
      .select([sql<number>`COUNT(*)`.as('n'), sql<string>`COALESCE(SUM(f.total_amount_paise), 0)`.as('paise')])
      .executeTakeFirstOrThrow(),
    base().select(['f.status', sql<number>`COUNT(*)`.as('n')]).groupBy('f.status').execute(),
  ]);
  return {
    rows,
    total: Number(totals.n),
    totalPaise: totals.paise,
    pages: Math.max(1, Math.ceil(Number(totals.n) / pageSize)),
    counts: groupCounts<FileStatus>(byStatus, FILE_GROUPS),
  };
}

export type FileListRow = Awaited<ReturnType<typeof listFiles>>['rows'][number];

// Every row of one file in file order, for the status CSV.
export async function filePayoutsForExport(fileId: string) {
  return db()
    .selectFrom('payouts as p')
    .innerJoin('payout_files as f', 'f.id', 'p.file_id')
    .select(payoutColumns)
    .where('p.file_id', '=', fileId)
    .orderBy('p.file_row')
    .execute();
}
