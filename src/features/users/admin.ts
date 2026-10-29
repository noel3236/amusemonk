import { sql } from 'kysely';
import { db } from '@/db';
import type { ListQuery } from '@/lib/list-params';

// Only people who have signed in to amusemonk: the gateway's other users never appear here.
export async function listUsersForAdmin(q: ListQuery) {
  const files = sql<number>`(SELECT COUNT(*) FROM payout_files f WHERE f.user_id = u.id)`;
  const base = () => {
    let b = db()
      .selectFrom('users as u')
      .leftJoin('user_api_keys as k', (j) => j.onRef('k.user_id', '=', 'u.id').on('k.status', '=', 'active'));
    if (q.q && q.by === 'uid') b = b.where('u.gatekeeper_uid', 'like', `%${q.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    else if (q.q) b = b.where('u.email', 'like', `%${q.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    return b;
  };
  let rowsQ = base();
  if (q.status === 'with_key') rowsQ = rowsQ.where('k.id', 'is not', null);
  if (q.status === 'no_key') rowsQ = rowsQ.where('k.id', 'is', null);
  const [rows, counts] = await Promise.all([
    rowsQ
      .select(['u.id', 'u.email', 'u.gatekeeper_uid', 'u.last_login_at', 'k.id as key_id', 'k.kid', 'k.created_at as key_created_at', files.as('files')])
      .orderBy(q.sort === 'files_desc' ? files : sql`u.last_login_at`, 'desc')
      .limit(200)
      .execute(),
    base()
      .select([sql<number>`COUNT(*)`.as('all'), sql<number>`SUM(k.id IS NOT NULL)`.as('with_key')])
      .executeTakeFirstOrThrow(),
  ]);
  const all = Number(counts.all);
  const withKey = Number(counts.with_key ?? 0);
  return { rows, counts: { '': all, with_key: withKey, no_key: all - withKey } };
}

export async function allActiveOverrides() {
  return db()
    .selectFrom('user_rule_overrides')
    .select(['user_id', 'rule_id', 'params_json'])
    .where('cleared_at', 'is', null)
    .execute();
}
