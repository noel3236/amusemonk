import os from 'node:os';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  WORKER_ID: z.string().optional(),
  DISPATCH_INTERVAL_SECONDS: z.coerce.number().positive().default(5),
  DISPATCH_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  POLL_INTERVAL_SECONDS: z.coerce.number().positive().default(30),
  RECONCILE_INTERVAL_SECONDS: z.coerce.number().positive().default(60),
  STUCK_AFTER_SECONDS: z.coerce.number().positive().default(120),
  BALANCE_BACKOFF_SECONDS: z.coerce.number().positive().default(300),
  REFUND_WATCH_DAYS: z.coerce.number().nonnegative().default(3),
  PENNY_DROP_REQUIRED: bool.default(true),
});

export type WorkerConfig = z.infer<typeof schema> & { workerId: string };

export function workerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const c = schema.parse(env);
  return { ...c, workerId: c.WORKER_ID || `${os.hostname()}:${process.pid}` };
}
