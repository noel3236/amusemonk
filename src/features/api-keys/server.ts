import { randomUUID } from 'node:crypto';
import { db } from '@/db';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import type { UapiCredentials } from '@/gateway/client';

// Shared by the web app and the worker, so no `server-only` here.

const aad = (kid: string) => `user_api_keys:${kid}`;

export async function activeKeySummary(userId: string) {
  return db()
    .selectFrom('user_api_keys')
    .select(['id', 'kid', 'scope', 'origin', 'created_at'])
    .where('user_id', '=', userId)
    .where('status', '=', 'active')
    .executeTakeFirst();
}

// Every key amusemonk generated for this user, connected or long revoked (D-43 labels them in the key list).
export async function generatedKids(userId: string): Promise<string[]> {
  const rows = await db().selectFrom('user_api_keys').select('kid').where('user_id', '=', userId).where('origin', '=', 'generated').execute();
  return rows.map((r) => r.kid);
}

export async function activeCredentials(userId: string): Promise<(UapiCredentials & { id: string }) | null> {
  const row = await db()
    .selectFrom('user_api_keys')
    .select(['id', 'kid', 'secret_enc'])
    .where('user_id', '=', userId)
    .where('status', '=', 'active')
    .executeTakeFirst();
  if (!row) return null;
  return { id: row.id, kid: row.kid, secret: decryptSecret(row.secret_enc, aad(row.kid)) };
}

export async function storeNewKey(input: {
  userId: string;
  kid: string;
  secret: string;
  scope: string | null;
  origin: 'pasted' | 'generated';
}) {
  const id = randomUUID();
  await db()
    .transaction()
    .execute(async (tx) => {
      await tx
        .updateTable('user_api_keys')
        .set({ status: 'revoked', revoked_at: new Date() })
        .where('user_id', '=', input.userId)
        .where('status', '=', 'active')
        .execute();
      await tx
        .insertInto('user_api_keys')
        .values({
          id,
          user_id: input.userId,
          kid: input.kid,
          secret_enc: encryptSecret(input.secret, aad(input.kid)),
          scope: input.scope,
          origin: input.origin,
        })
        .execute();
    });
  return id;
}

export async function revokeKey(id: string) {
  const r = await db()
    .updateTable('user_api_keys')
    .set({ status: 'revoked', revoked_at: new Date() })
    .where('id', '=', id)
    .where('status', '=', 'active')
    .executeTakeFirst();
  return Number(r.numUpdatedRows) === 1;
}
