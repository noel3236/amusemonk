import type { Db } from '@/db';
import { activeCredentials } from '@/features/api-keys/server';
import { createUapiClient, type UapiClient, type UapiCredentials } from '@/gateway/client';
import { CircuitBreaker } from './circuit';
import type { WorkerConfig } from './config';

export type GatewayPort = Pick<
  UapiClient,
  'availableBalancePaise' | 'balance' | 'findByClientReference' | 'findByPayoutId' | 'createPayout'
>;

export interface WorkerDeps {
  db: Db;
  config: WorkerConfig;
  circuit: CircuitBreaker;
  // Injected so tests can run the real worker logic against an in-memory gateway.
  clientFor: (creds: UapiCredentials) => GatewayPort;
  credentialsFor: (userId: string) => Promise<(UapiCredentials & { id: string }) | null>;
}

export function productionDeps(db: Db, config: WorkerConfig): WorkerDeps {
  return { db, config, circuit: new CircuitBreaker(), clientFor: createUapiClient, credentialsFor: activeCredentials };
}
