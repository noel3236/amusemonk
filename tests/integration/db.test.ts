import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { isDuplicateKey } from '@/db';
import { upsertUserOnLogin } from '@/db/users';
import { activeCredentials, activeKeySummary, generatedKids, revokeKey, storeNewKey } from '@/features/api-keys/server';
import { db, makeUser, ruleId, run, requireTestDatabase } from '../helpers/db';

requireTestDatabase();

const code = async (p: Promise<unknown>) => p.then(() => 'no error', (e: { code?: string }) => e.code);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('schema guarantees', () => {
  it('locked rules can never be switched off or deleted, whatever the app does', async () => {
    const q = (set: object, key: string) => db().updateTable('upload_rules').set(set).where('rule_key', '=', key).execute();
    expect(await code(q({ enabled: false }, 'duplicate_reference'))).toBe('ER_CHECK_CONSTRAINT_VIOLATED');
    expect(await code(q({ deleted_at: new Date() }, 'duplicate_payment'))).toBe('ER_CHECK_CONSTRAINT_VIOLATED');
  });

  it('reads booleans, JSON and timestamps as the app expects', async () => {
    const r = await db().selectFrom('upload_rules').selectAll().where('id', '=', await ruleId('amount_range')).executeTakeFirstOrThrow();
    expect(typeof r.enabled).toBe('boolean');
    expect(r.params_json).toMatchObject({ max_inr: expect.any(String) });
    expect(r.created_at).toBeInstanceOf(Date);
    const tz = await sql<{ tz: string }>`SELECT @@session.time_zone AS tz`.execute(db());
    expect(tz.rows[0]?.tz).toBe('+00:00');
  });

  it('login upsert keeps the user id and refreshes email and role', async () => {
    const uid = `IDUP${run}`;
    const a = await upsertUserOnLogin({ gatekeeperUid: uid, email: 'a@example.com', gatekeeperRole: 'member' });
    const b = await upsertUserOnLogin({ gatekeeperUid: uid, email: 'b@example.com', gatekeeperRole: 'super_admin' });
    expect(b.id).toBe(a.id);
    const u = await db().selectFrom('users').selectAll().where('id', '=', a.id).executeTakeFirstOrThrow();
    expect(u).toMatchObject({ email: 'b@example.com', gatekeeper_role: 'super_admin' });
    expect(Math.abs(u.created_at.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('payouts: one per reference (any case), one per payment, positive amounts, exact types', async () => {
    const u = await makeUser('DBP');
    const fileId = randomUUID();
    await db()
      .insertInto('payout_files')
      .values({
        id: fileId, user_id: u.id, original_filename: 'f.csv', normalized_filename: 'f.csv', raw_sha256: sha('raw' + run),
        canonical_sha256: sha('can' + run), s3_key: 'k', size_bytes: 10, row_count: 1, total_amount_paise: '10000',
        warnings_json: '[]', rules_snapshot_json: '[]',
      })
      .execute();
    const base = { file_id: fileId, user_id: u.id, bank_account: '012345678901', ifsc_code: 'HDFC0000044', beneficiary_name: 'Test Name', transaction_date: '2026-10-29' };
    const ref = `REF${run}`;
    const insert = (row: number, reference: string, fp: string, amount: string) =>
      db().insertInto('payouts').values({ ...base, id: randomUUID(), file_row: row, client_reference_id: reference, content_fingerprint: sha(fp + run), amount_paise: amount }).execute();

    await insert(2, ref, 'fp1', '10000');
    expect(await code(insert(3, ref.toLowerCase(), 'fp2', '1'))).toBe('ER_DUP_ENTRY');
    expect(await code(insert(4, ref + 'B', 'fp1', '1'))).toBe('ER_DUP_ENTRY');
    expect(await code(insert(5, ref + 'C', 'fp3', '0'))).toBe('ER_CHECK_CONSTRAINT_VIOLATED');
    expect(isDuplicateKey({ code: 'ER_DUP_ENTRY' })).toBe(true);

    const p = await db().selectFrom('payouts').selectAll().where('client_reference_id', '=', ref).executeTakeFirstOrThrow();
    expect(p).toMatchObject({ amount_paise: '10000', transaction_date: '2026-10-29', bank_account: '012345678901' });
  });

  it('FOR UPDATE SKIP LOCKED: two transactions claim different rows', async () => {
    const u = await makeUser('DBS');
    const fileId = randomUUID();
    await db()
      .insertInto('payout_files')
      .values({
        id: fileId, user_id: u.id, original_filename: 's.csv', normalized_filename: 's.csv', raw_sha256: sha('sraw' + run),
        canonical_sha256: sha('scan' + run), s3_key: 'k', size_bytes: 1, row_count: 2, total_amount_paise: '2',
        warnings_json: '[]', rules_snapshot_json: '[]',
      })
      .execute();
    for (const i of [2, 3]) {
      await db()
        .insertInto('payouts')
        .values({
          id: randomUUID(), file_id: fileId, user_id: u.id, file_row: i, client_reference_id: `SKIP${run}${i}`, content_fingerprint: sha(`skip${run}${i}`),
          bank_account: '0123456789', ifsc_code: 'HDFC0000044', beneficiary_name: 'Test Name', amount_paise: '1', transaction_date: '2026-10-29',
        })
        .execute();
    }
    const claim = (tx: ReturnType<typeof db>) =>
      tx.selectFrom('payouts').select('client_reference_id').where('file_id', '=', fileId).orderBy('file_row').limit(1).forUpdate().skipLocked().executeTakeFirst();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let first: string | undefined;
    const t1 = db().transaction().execute(async (tx) => {
      first = (await claim(tx))?.client_reference_id;
      await held;
    });
    await new Promise((r) => setTimeout(r, 300));
    const second = await db().transaction().execute(async (tx) => (await claim(tx))?.client_reference_id);
    release();
    await t1;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });
});

describe('API key storage', () => {
  it('stores secrets encrypted, one active key per user, replaceable and revocable', async () => {
    const u = await makeUser('KEY', { key: false });
    await storeNewKey({ userId: u.id, kid: `kidA${run}`, secret: 'secretA-0000000000', scope: null, origin: 'pasted' });
    expect(await activeCredentials(u.id)).toMatchObject({ kid: `kidA${run}`, secret: 'secretA-0000000000' });
    const row = await db().selectFrom('user_api_keys').select('secret_enc').where('kid', '=', `kidA${run}`).executeTakeFirstOrThrow();
    expect(row.secret_enc).not.toContain('secretA');

    const second = db().insertInto('user_api_keys').values({ id: randomUUID(), user_id: u.id, kid: `kidX${run}`, secret_enc: 'x' }).execute();
    expect(await code(second)).toBe('ER_DUP_ENTRY');

    await storeNewKey({ userId: u.id, kid: `kidB${run}`, secret: 'secretB-0000000000', scope: null, origin: 'pasted' });
    const active = await activeCredentials(u.id);
    expect(active?.kid).toBe(`kidB${run}`);
    expect(await revokeKey(active!.id)).toBe(true);
    expect(await revokeKey(active!.id)).toBe(false);
    expect(await activeKeySummary(u.id)).toBeUndefined();
  });

  it('remembers whether a key was generated here or pasted', async () => {
    const u = await makeUser('KO', { key: false });
    await storeNewKey({ userId: u.id, kid: `kidG${run}`, secret: 'secretG-0000000000', scope: 'uapi', origin: 'generated' });
    expect(await activeKeySummary(u.id)).toMatchObject({ kid: `kidG${run}`, scope: 'uapi', origin: 'generated' });
    await storeNewKey({ userId: u.id, kid: `kidP${run}`, secret: 'secretP-0000000000', scope: null, origin: 'pasted' });
    expect(await generatedKids(u.id)).toEqual([`kidG${run}`]);
  });

  it('a key connected to one account cannot be connected to another', async () => {
    const a = await makeUser('KA', { key: false });
    const b = await makeUser('KB', { key: false });
    await storeNewKey({ userId: a.id, kid: `kidShared${run}`, secret: 'secret-0000000000', scope: null, origin: 'pasted' });
    expect(await code(storeNewKey({ userId: b.id, kid: `kidShared${run}`, secret: 'secret-0000000000', scope: null, origin: 'pasted' }))).toBe('ER_DUP_ENTRY');
  });
});
