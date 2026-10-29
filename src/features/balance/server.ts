import { db } from '@/db';
import { parseGatewayAmount } from '@/lib/money';
import type { UapiClient } from '@/gateway/client';
import type { GatewayBalance } from '@/gateway/types';

export async function recordBalance(userId: string, b: GatewayBalance) {
  const values = {
    balance_paise: parseGatewayAmount(b.balance)?.toString() ?? null,
    locked_paise: parseGatewayAmount(b.locked)?.toString() ?? null,
    fetched_at: new Date(),
    error: null,
    error_at: null,
  };
  await db().insertInto('user_balances').values({ user_id: userId, ...values }).onDuplicateKeyUpdate(values).execute();
  return values.balance_paise;
}

// Every balance read records a snapshot (or the error), so pages never have to call the gateway.
export async function refreshBalance(userId: string, client: Pick<UapiClient, 'balance'>) {
  try {
    return { ok: true as const, balancePaise: await recordBalance(userId, await client.balance()) };
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    await db()
      .insertInto('user_balances')
      .values({ user_id: userId, error: message, error_at: new Date() })
      .onDuplicateKeyUpdate({ error: message, error_at: new Date() })
      .execute();
    return { ok: false as const, error: message };
  }
}

export async function lastBalance(userId: string) {
  return db().selectFrom('user_balances').selectAll().where('user_id', '=', userId).executeTakeFirst();
}
