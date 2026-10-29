import { z } from 'zod';

// Shared by the web app, the worker and the migrate CLI, so no `server-only` here.
const schema = z.object({
  DATABASE_URL: z.string().startsWith('mysql://'),
  // `rds` verifies the server against the Amazon RDS CA bundle shipped with mysql2.
  DB_SSL: z.enum(['off', 'rds']).default('off'),
  DB_POOL_SIZE: z.coerce.number().int().positive().default(10),
});

export type DbConfig = z.infer<typeof schema>;

export function dbConfig(env: NodeJS.ProcessEnv = process.env): DbConfig {
  return schema.parse(env);
}
