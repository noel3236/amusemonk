import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const testDb = process.env.TEST_DATABASE_URL;
// Integration tests reshape data (rule toggles, retired payouts): they only ever see the test database.
if (testDb) process.env.DATABASE_URL = testDb;
else delete process.env.DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      'server-only': path.resolve(root, 'tests/helpers/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/helpers/global-setup.ts'],
    env: {
      ...(testDb ? { DATABASE_URL: testDb, TEST_DATABASE_URL: testDb } : {}),
      STORAGE_DRIVER: 'local',
      LOCAL_STORAGE_DIR: path.join(os.tmpdir(), 'amusemonk-tests'),
      GATEWAY_BASE_URL: process.env.GATEWAY_BASE_URL ?? 'https://sandbox.celestiapayment.com',
      GATEWAY_TIMEOUT_MS: '4000',
      EGRESS_PROXY_URL: process.env.EGRESS_PROXY_URL ?? 'http://127.0.0.1:8888',
      SECRETS_KEY: process.env.SECRETS_KEY ?? Buffer.alloc(32, 7).toString('base64'),
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'test-auth-secret-at-least-32-characters-long',
    },
    // One database, global rule switches: test files run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
