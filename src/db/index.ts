import { Kysely, MysqlDialect } from 'kysely';
import { createDbPool } from './pool';
import type { Database } from './schema';

export type Db = Kysely<Database>;

// One pool per process; survives Next dev hot reloads.
const globalForDb = globalThis as unknown as { amusemonkDb?: Db };

export function db(): Db {
  globalForDb.amusemonkDb ??= new Kysely<Database>({
    dialect: new MysqlDialect({ pool: createDbPool() }),
  });
  return globalForDb.amusemonkDb;
}

export function isDuplicateKey(err: unknown): err is { code: 'ER_DUP_ENTRY'; sqlMessage?: string } {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

export type * from './schema';
