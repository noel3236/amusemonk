import { db } from '@/db';
import { workerConfig } from './config';
import { productionDeps } from './deps';
import { dispatchOnce } from './dispatcher';
import { pollOnce } from './poller';
import { reconcileOnce } from './reconciler';

// The long-running payout worker: `pnpm worker` locally, its own container in production. Any number of these can
// run at once; FOR UPDATE SKIP LOCKED keeps them from claiming the same payout.
const config = workerConfig();
const deps = productionDeps(db(), config);
const timers: NodeJS.Timeout[] = [];
let running = 0;
let stopping = false;

function every(seconds: number, name: string, job: () => Promise<Record<string, number>>) {
  let busy = false;
  timers.push(
    setInterval(async () => {
      if (busy || stopping) return;
      busy = true;
      running += 1;
      try {
        const r = await job();
        if (Object.values(r).some((v) => v > 0)) console.info(`[worker] ${name}`, JSON.stringify(r));
      } catch (e) {
        console.error(`[worker] ${name} crashed:`, e);
      } finally {
        running -= 1;
        busy = false;
      }
    }, seconds * 1000)
  );
}

every(config.DISPATCH_INTERVAL_SECONDS, 'dispatch', () => dispatchOnce(deps));
every(config.POLL_INTERVAL_SECONDS, 'poll', () => pollOnce(deps));
every(config.RECONCILE_INTERVAL_SECONDS, 'reconcile', () => reconcileOnce(deps));
console.info(`[worker] started as ${config.workerId}`);

async function shutdown(signal: string) {
  stopping = true;
  for (const t of timers) clearInterval(t);
  console.info(`[worker] ${signal}: finishing in-flight jobs`);
  const deadline = Date.now() + 25_000;
  while (running > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  await db().destroy();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
