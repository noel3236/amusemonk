import { createPool, type Pool, type PoolOptions } from 'mysql2';
import { dbConfig, type DbConfig } from './config';

export function poolOptions(c: DbConfig): PoolOptions {
  return {
    uri: c.DATABASE_URL,
    connectionLimit: c.DB_POOL_SIZE,
    ssl: c.DB_SSL === 'rds' ? 'Amazon RDS' : undefined,
    // BIGINT / DECIMAL arrive as strings, never lossy floats; DATE stays 'YYYY-MM-DD'.
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: ['DATE'],
    timezone: 'Z',
    typeCast(field, next) {
      if (field.type === 'TINY' && field.length === 1) {
        const v = field.string();
        return v === null ? null : v === '1';
      }
      return next();
    },
  };
}

export function createDbPool(c: DbConfig = dbConfig()): Pool {
  const pool = createPool(poolOptions(c));
  // DATETIME columns hold UTC; CURRENT_TIMESTAMP follows the session zone, so pin it.
  pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));
  return pool;
}
