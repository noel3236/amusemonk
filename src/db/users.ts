import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from './index';

export async function upsertUserOnLogin(input: {
  gatekeeperUid: string;
  email: string | null;
  gatekeeperRole: string;
}): Promise<{ id: string }> {
  await db()
    .insertInto('users')
    .values({
      id: randomUUID(),
      gatekeeper_uid: input.gatekeeperUid,
      email: input.email,
      gatekeeper_role: input.gatekeeperRole,
      last_login_at: new Date(),
    })
    .onDuplicateKeyUpdate({
      email: input.email,
      gatekeeper_role: input.gatekeeperRole,
      last_login_at: sql<Date>`CURRENT_TIMESTAMP(3)`,
    })
    .execute();

  const user = await db()
    .selectFrom('users')
    .select('id')
    .where('gatekeeper_uid', '=', input.gatekeeperUid)
    .executeTakeFirstOrThrow();
  return { id: user.id };
}
