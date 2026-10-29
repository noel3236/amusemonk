import fs from 'node:fs';
import path from 'node:path';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import { dbConfig } from './config';
import { poolOptions } from './pool';

const LOCK = 'amusemonk_migrate';

export function migrationsDir(): string {
  const dir = path.resolve(process.cwd(), 'migrations');
  if (!fs.existsSync(dir)) throw new Error(`migrations directory not found at ${dir}`);
  return dir;
}

// MySQL commits each DDL statement on its own, so a file that fails halfway is NOT rolled back.
// Files are recorded only after every statement in them succeeded; a failed one must be repaired by hand
// before re-running.
export async function runMigrations(): Promise<string[]> {
  const conn = await createConnection({ ...poolOptions(dbConfig()), multipleStatements: true });
  try {
    await conn.query("SET time_zone = '+00:00'");
    const [[lock]] = await conn.query<RowDataPacket[]>('SELECT GET_LOCK(?, 60) AS ok', [LOCK]);
    // BIGINTs arrive as strings (bigNumberStrings), so GET_LOCK's 1 is '1'.
    if (String(lock?.ok) !== '1') throw new Error('Another migration is running (lock not acquired in 60s)');

    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))`);
    const [rows] = await conn.query<RowDataPacket[]>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => String(r.name)));

    const applied: string[] = [];
    for (const file of fs.readdirSync(migrationsDir()).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir(), file), 'utf8');
      try {
        await conn.query(sql);
      } catch (e) {
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      applied.push(file);
    }
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK]);
    return applied;
  } finally {
    await conn.end();
  }
}

// CLI entry (`pnpm migrate`). `__filename` is undefined when imported as an ES module (the test runner).
if (typeof __filename === 'string' && process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runMigrations()
    .then((a) => console.log(a.length ? `Applied: ${a.join(', ')}` : 'Nothing to migrate'))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
