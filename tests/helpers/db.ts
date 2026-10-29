import { afterAll } from 'vitest';
import { db, type Db } from '@/db';
import { upsertUserOnLogin } from '@/db/users';
import { storeNewKey } from '@/features/api-keys/server';
import { listRules, setRuleEnabled } from '@/features/rules/server';

// Refuses to run anywhere but the test database: these tests toggle global rules and retire payouts.
export function requireTestDatabase() {
  if (!process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
    throw new Error('Integration tests need TEST_DATABASE_URL (and run only against it). Set it in .env.local.');
  }
  afterAll(async () => {
    const g = globalThis as { amusemonkDb?: Db };
    await g.amusemonkDb?.destroy();
    delete g.amusemonkDb;
  });
}

// Unique per run, so suites repeat against a database that keeps earlier runs' rows.
export const run = Date.now().toString(36).toUpperCase();
const seed = Date.now() % 1_000_000;
// Same account in, same account out within a run; the first digit (it decides the sandbox outcome) is kept.
export const acct = (a: string) =>
  /^\d{10}$/.test(a) ? a.slice(0, 4) + String((Number(a.slice(4)) * 7 + seed) % 1_000_000).padStart(6, '0') : a;

export async function makeUser(tag: string, opts: { key?: boolean } = { key: true }) {
  const u = await upsertUserOnLogin({ gatekeeperUid: `ID${tag}${run}`, email: `${tag.toLowerCase()}-${run}@example.com`, gatekeeperRole: 'member' });
  const kid = `kid${tag}${run}`;
  if (opts.key !== false) await storeNewKey({ userId: u.id, kid, secret: `secret-${tag}-0000000000`, scope: null, origin: 'pasted' });
  return { id: u.id, kid };
}

export async function ruleId(key: string) {
  return (await listRules()).find((r) => r.rule_key === key)!.id;
}

export async function setRule(key: string, enabled: boolean, by: string) {
  await setRuleEnabled(await ruleId(key), enabled, by);
}

export { db };
