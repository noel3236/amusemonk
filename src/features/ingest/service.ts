import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db, isDuplicateKey, type Db } from '@/db';
import type { UploadError, UploadWarning } from '@/db/schema';
import { activeCredentials } from '@/features/api-keys/server';
import { refreshBalance } from '@/features/balance/server';
import { loadRuleset, RuleConfigError } from '@/features/rules/server';
import { UPLOAD_HARD_LIMIT_MB } from '@/lib/limits';
import { createUapiClient } from '@/gateway/client';
import { formatRupees } from '@/lib/format';
import { storage, uploadKey } from '@/lib/storage';
import { IN_FLIGHT } from '@/worker/status';
import { normalizeFilename, sha256Hex } from './fingerprint';
import { parseUpload, ParseError } from './parse';
import { todayIst, validateParsedFile, type ParsedPayout, type Ruleset } from './validate';

export type IngestResult =
  | { outcome: 'ACCEPTED'; fileId: string; rowCount: number; totalPaise: string }
  | { outcome: 'REJECTED'; errors: UploadError[]; errorCount: number };

const MAX_REPORTED_ERRORS = 500;
// One upload at a time per user (D-26, D-41): their duplicate and balance checks see every file they committed.
const ingestLock = (userId: string) => `amusemonk_ingest:${userId}`;
const CONTENT_TYPES: Record<string, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

async function crossFileErrors(
  q: Db,
  userId: string,
  rules: Ruleset,
  normalizedFilename: string,
  rawSha: string,
  canonicalSha: string,
  payouts: ParsedPayout[]
): Promise<UploadError[]> {
  const errors: UploadError[] = [];
  const checks = [
    rules.duplicateFilename && sql<boolean>`normalized_filename = ${normalizedFilename}`,
    rules.duplicateFile && sql<boolean>`raw_sha256 = ${rawSha}`,
    rules.duplicateContent && sql<boolean>`canonical_sha256 = ${canonicalSha}`,
  ].filter((c) => c !== false);

  if (checks.length) {
    const files = await q
      .selectFrom('payout_files')
      .select(['original_filename', 'normalized_filename', 'raw_sha256', 'canonical_sha256', 'accepted_at'])
      .where('user_id', '=', userId)
      .where(sql<boolean>`(${sql.join(checks, sql` OR `)})`)
      .limit(20)
      .execute();
    for (const f of files) {
      const when = f.accepted_at.toISOString().slice(0, 10);
      if (rules.duplicateFilename && f.normalized_filename === normalizedFilename) {
        errors.push({ rule: 'duplicate_filename', code: 'DUPLICATE_FILENAME', message: `A file named "${f.original_filename}" was already accepted on ${when}. Rename the file if this is a new batch.` });
      }
      if (rules.duplicateFile && f.raw_sha256 === rawSha) {
        errors.push({ rule: 'duplicate_file', code: 'DUPLICATE_FILE', message: `This exact file was already accepted as "${f.original_filename}" on ${when}.` });
      } else if (rules.duplicateContent && f.canonical_sha256 === canonicalSha) {
        errors.push({ rule: 'duplicate_content', code: 'DUPLICATE_CONTENT', message: `The rows in this file are the same as "${f.original_filename}", accepted on ${when}.` });
      }
    }
  }

  // Locked: never skipped.
  const hits = await q
    .selectFrom('payouts as p')
    .innerJoin('payout_files as f', 'f.id', 'p.file_id')
    .select(['p.client_reference_id', 'p.content_fingerprint', 'p.status', 'p.file_row', 'f.original_filename'])
    .where('p.user_id', '=', userId)
    .where((eb) =>
      eb.or([
        eb('p.client_reference_id', 'in', payouts.map((p) => p.clientReferenceId)),
        eb('p.content_fingerprint', 'in', payouts.map((p) => p.fingerprint)),
      ])
    )
    .execute();
  const byRef = new Map(hits.map((h) => [h.client_reference_id.toLowerCase(), h]));
  const byFp = new Map(hits.map((h) => [h.content_fingerprint, h]));
  for (const p of payouts) {
    const ref = byRef.get(p.clientReferenceId.toLowerCase());
    if (ref) {
      errors.push({
        row: p.fileRow,
        column: 'client_reference_id',
        rule: 'duplicate_reference',
        code: 'DUPLICATE_REFERENCE',
        message: `client_reference_id "${p.clientReferenceId}" was already used in "${ref.original_filename}" (row ${ref.file_row}, ${ref.status})`,
      });
    }
    const fp = byFp.get(p.fingerprint);
    if (fp && fp.client_reference_id.toLowerCase() !== p.clientReferenceId.toLowerCase()) {
      errors.push({
        row: p.fileRow,
        rule: 'duplicate_payment',
        code: 'DUPLICATE_PAYMENT',
        message: `The same account, IFSC, amount and date were already paid as "${fp.client_reference_id}" in "${fp.original_filename}" (${fp.status})`,
      });
    }
  }
  return errors;
}

// D-44: a warning, not a rejection. The user's other recent files with the same payout count and total.
async function similarFileWarnings(q: Db, userId: string, windowDays: number, rowCount: number, totalPaise: bigint): Promise<UploadWarning[]> {
  const files = await q
    .selectFrom('payout_files')
    .select(['id', 'original_filename', 'created_at'])
    .where('user_id', '=', userId)
    .where('row_count', '=', rowCount)
    .where('total_amount_paise', '=', totalPaise.toString())
    .where('status', 'not in', ['CANCELLED', 'REJECTED'])
    .where('created_at', '>=', sql<Date>`CURRENT_TIMESTAMP(3) - INTERVAL ${windowDays} DAY`)
    .orderBy('created_at', 'desc')
    .limit(3)
    .execute();
  if (!files.length) return [];
  return [
    {
      rule: 'similar_files',
      code: 'SIMILAR_FILES',
      message: `Same number of payouts (${rowCount}) and the same total (${formatRupees(totalPaise)}) as ${files.length === 1 ? 'a file' : `${files.length} files`} you uploaded in the last ${windowDays} days.`,
      files: files.map((f) => ({ id: f.id, name: f.original_filename, uploadedAt: f.created_at.toISOString() })),
    },
  ];
}

async function inFlightPaise(q: Db, userId: string): Promise<bigint> {
  const r = await q
    .selectFrom('payouts')
    .select(sql<string>`COALESCE(SUM(amount_paise), 0)`.as('s'))
    .where('user_id', '=', userId)
    .where('status', 'in', IN_FLIGHT)
    .executeTakeFirstOrThrow();
  return BigInt(r.s);
}

export async function ingestFile(input: { userId: string; filename: string; buffer: Buffer }): Promise<IngestResult> {
  const attemptId = randomUUID();
  const { userId, filename, buffer } = input;
  const rawSha = buffer.length ? sha256Hex(buffer) : null;
  let s3Key: string | null = null;

  const finish = async (errors: UploadError[], fileId: string | null): Promise<void> => {
    await db()
      .insertInto('upload_attempts')
      .values({
        id: attemptId,
        user_id: userId,
        original_filename: filename.slice(0, 255),
        raw_sha256: rawSha,
        size_bytes: buffer.length,
        s3_key: s3Key,
        outcome: fileId ? 'ACCEPTED' : 'REJECTED',
        file_id: fileId,
        errors_json: JSON.stringify(errors.slice(0, MAX_REPORTED_ERRORS)),
      })
      .execute();
  };
  const reject = async (errors: UploadError[]): Promise<IngestResult> => {
    await finish(errors, null);
    return { outcome: 'REJECTED', errors: errors.slice(0, MAX_REPORTED_ERRORS), errorCount: errors.length };
  };

  if (buffer.length === 0) return reject([{ rule: 'row_format', code: 'EMPTY_FILE', message: 'The uploaded file is empty' }]);
  if (buffer.length > UPLOAD_HARD_LIMIT_MB * 1024 * 1024) {
    return reject([{ rule: 'max_file_size', code: 'FILE_TOO_LARGE', message: `Files over ${UPLOAD_HARD_LIMIT_MB} MB are never accepted` }]);
  }

  let loaded: Awaited<ReturnType<typeof loadRuleset>>;
  try {
    loaded = await loadRuleset(userId);
  } catch (e) {
    if (e instanceof RuleConfigError) return reject([{ code: 'RULES_MISCONFIGURED', message: `${e.message}. Ask an admin to fix it in Upload rules.` }]);
    throw e;
  }
  const { ruleset, snapshot } = loaded;

  if (ruleset.maxFileSize && buffer.length > ruleset.maxFileSize.max_mb * 1024 * 1024) {
    return reject([{ rule: 'max_file_size', code: 'FILE_TOO_LARGE', message: `File is ${(buffer.length / 1048576).toFixed(1)} MB; the limit is ${ruleset.maxFileSize.max_mb} MB` }]);
  }

  const creds = await activeCredentials(userId);
  if (!creds) return reject([{ code: 'NO_GATEWAY_KEY', message: 'Connect your gateway account on the Overview page before uploading.' }]);

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  try {
    s3Key = uploadKey(userId, attemptId, filename);
    await storage().put(s3Key, buffer, CONTENT_TYPES[ext] ?? 'application/octet-stream');
  } catch (e) {
    console.error('[ingest] storage put failed:', e);
    s3Key = null;
    return reject([{ code: 'STORAGE_UNAVAILABLE', message: 'Couldn’t store the file. Nothing was accepted; please try again.' }]);
  }

  let parsed;
  try {
    parsed = await parseUpload(buffer, filename);
  } catch (e) {
    return reject([{ rule: 'columns', code: e instanceof ParseError ? e.code : 'PARSE_ERROR', message: (e as Error).message }]);
  }

  const v = validateParsedFile(parsed, ruleset, todayIst());
  if (v.errors.length) return reject(v.errors);
  const normalizedFilename = normalizeFilename(filename);
  const canonicalSha = v.canonicalHash!;

  const outcome = await db()
    .connection()
    .execute(async (conn): Promise<{ errors: UploadError[] } | { fileId: string }> => {
      const [lock] = (await sql<{ ok: string | null }>`SELECT GET_LOCK(${ingestLock(userId)}, 30) AS ok`.execute(conn)).rows;
      if (String(lock?.ok) !== '1') {
        return { errors: [{ code: 'BUSY', message: 'Another of your uploads is being checked. Try again in a moment.' }] };
      }
      try {
        const cross = await crossFileErrors(conn, userId, ruleset, normalizedFilename, rawSha!, canonicalSha, v.payouts);
        if (cross.length) return { errors: cross };

        if (ruleset.balanceCheck) {
          const client = createUapiClient(creds);
          const balance = await refreshBalance(userId, client);
          if (!balance.ok || balance.balancePaise === null) {
            return { errors: [{ rule: 'balance_check', code: 'BALANCE_UNAVAILABLE', message: 'Couldn’t read your gateway balance, so the file was refused rather than risk failed payouts. Try again shortly.' }] };
          }
          const room = BigInt(balance.balancePaise) - (await inFlightPaise(conn, userId));
          if (room < v.totalPaise) {
            return {
              errors: [{
                rule: 'balance_check',
                code: 'INSUFFICIENT_BALANCE',
                message: `File total ${formatRupees(v.totalPaise)} is more than your available ${formatRupees(room < 0n ? 0n : room)} after payouts already in flight. Top up and upload again.`,
              }],
            };
          }
        }

        const warnings = ruleset.similarFiles
          ? await similarFileWarnings(conn, userId, ruleset.similarFiles.window_days, v.payouts.length, v.totalPaise)
          : [];
        const fileId = randomUUID();
        try {
          await conn.transaction().execute(async (tx) => {
            await tx
              .insertInto('payout_files')
              .values({
                id: fileId,
                user_id: userId,
                original_filename: filename.slice(0, 255),
                normalized_filename: normalizedFilename.slice(0, 255),
                raw_sha256: rawSha!,
                canonical_sha256: canonicalSha,
                s3_key: s3Key!,
                size_bytes: buffer.length,
                row_count: v.payouts.length,
                total_amount_paise: v.totalPaise.toString(),
                warnings_json: JSON.stringify(warnings),
                rules_snapshot_json: JSON.stringify(snapshot),
              })
              .execute();
            for (let i = 0; i < v.payouts.length; i += 500) {
              await tx
                .insertInto('payouts')
                .values(
                  v.payouts.slice(i, i + 500).map((p) => ({
                    id: randomUUID(),
                    file_id: fileId,
                    user_id: userId,
                    file_row: p.fileRow,
                    client_reference_id: p.clientReferenceId,
                    content_fingerprint: p.fingerprint,
                    bank_account: p.bankAccount,
                    ifsc_code: p.ifscCode,
                    beneficiary_name: p.beneficiaryName,
                    amount_paise: p.amountPaise.toString(),
                    transaction_date: p.transactionDate,
                  }))
                )
                .execute();
            }
          });
        } catch (e) {
          // The unique keys are the guarantee; reaching here means the code checks above were bypassed.
          if (isDuplicateKey(e)) {
            const again = await crossFileErrors(conn, userId, ruleset, normalizedFilename, rawSha!, canonicalSha, v.payouts);
            return { errors: again.length ? again : [{ code: 'DUPLICATE', message: 'The database rejected this file as a duplicate of an accepted one.' }] };
          }
          throw e;
        }
        return { fileId };
      } finally {
        await sql`SELECT RELEASE_LOCK(${ingestLock(userId)})`.execute(conn);
      }
    });

  if ('errors' in outcome) return reject(outcome.errors);
  await finish([], outcome.fileId);
  return { outcome: 'ACCEPTED', fileId: outcome.fileId, rowCount: v.payouts.length, totalPaise: v.totalPaise.toString() };
}
