import { runMigrations } from '../../src/db/migrate';

// Brings the test database to the current schema before any test file runs.
export default async function setup() {
  if (!process.env.TEST_DATABASE_URL) {
    console.warn('[tests] TEST_DATABASE_URL not set: integration tests will fail fast; unit tests still run.');
    return;
  }
  const applied = await runMigrations();
  if (applied.length) console.log(`[tests] migrated test database: ${applied.join(', ')}`);
}
