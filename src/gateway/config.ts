import { z } from 'zod';

// Shared by the web app and the worker, so no `server-only` here.
const schema = z.object({
  GATEWAY_BASE_URL: z.url().transform((u) => u.replace(/\/+$/, '')),
  GATEWAY_MAX_RPS: z.coerce.number().positive().max(20).default(5),
  GATEWAY_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
});

export const SERVICES = {
  gatekeeper: '/api/v3/gatekeeper',
  uapi: '/uapi/v1/peatio',
} as const;

let cached: z.infer<typeof schema> | undefined;

export function gatewayConfig() {
  cached ??= schema.parse(process.env);
  return cached;
}
