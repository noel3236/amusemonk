import { outboundFetch } from '@/lib/egress';
import { extractCodes } from '@/lib/errors';
import { parseGatewayAmount } from '@/lib/money';
import { gatewayConfig, SERVICES } from './config';
import { bucketFor } from './rate-limiter';
import { authHeaders } from './signing';
import {
  GatewayHttpError,
  GatewayNetworkError,
  type CreateOutcome,
  type GatewayBalance,
  type GatewayPayout,
  type PayoutCreateRequest,
} from './types';

export interface UapiCredentials {
  kid: string;
  secret: string;
}

export function classifyCreateResponse(status: number, body: unknown): CreateOutcome {
  if (status === 200 || status === 201) {
    const p = body as GatewayPayout | null;
    if (!p || typeof p.payout_id !== 'string') {
      return { kind: 'unknown', reason: `2xx without payout_id: ${JSON.stringify(body).slice(0, 200)}` };
    }
    return { kind: 'created', payout: p };
  }
  if (status === 401 || status === 403) return { kind: 'auth_error', status, codes: extractCodes(body) };
  if (status === 503) return { kind: 'rate_limited' };
  if (status === 422 || status === 400) {
    const codes = extractCodes(body);
    const joined = codes.join(' ');
    if (/account\.payout\.duplicate_reference_id/.test(joined)) return { kind: 'duplicate_reference' };
    if (/account\.payout\.create_in_processing/.test(joined)) return { kind: 'in_processing' };
    if (/account\.payout\.insufficient_balance/.test(joined)) return { kind: 'insufficient_balance' };
    return { kind: 'validation_failed', codes: codes.length ? codes : [`http_${status}`] };
  }
  return { kind: 'unknown', reason: `http_${status}:${JSON.stringify(body).slice(0, 200)}` };
}

export function uapiEndpoint(): string {
  return gatewayConfig().GATEWAY_BASE_URL + SERVICES.uapi;
}

export function createUapiClient(creds: UapiCredentials) {
  const { GATEWAY_MAX_RPS, GATEWAY_TIMEOUT_MS } = gatewayConfig();
  const base = uapiEndpoint();
  const bucket = bucketFor(creds.kid, GATEWAY_MAX_RPS);

  async function call(
    method: 'GET' | 'POST',
    path: string,
    query?: Record<string, string>,
    body?: unknown
  ): Promise<{ status: number; body: unknown }> {
    await bucket.take();
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    try {
      const res = await outboundFetch(url.toString(), {
        method,
        // Fresh nonce per request; the gateway accepts it for ~50 s.
        headers: { ...authHeaders(creds.kid, creds.secret), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      });
      const text = await res.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }
      return { status: res.status, body: parsed };
    } catch (e) {
      const err = e as Error;
      throw new GatewayNetworkError(
        err.name === 'TimeoutError' ? `timeout after ${GATEWAY_TIMEOUT_MS}ms` : err.message
      );
    }
  }

  async function getOrThrow(path: string, query?: Record<string, string>): Promise<unknown> {
    let r = await call('GET', path, query);
    if (r.status === 503) {
      await new Promise((res) => setTimeout(res, 1000));
      r = await call('GET', path, query);
    }
    if (r.status < 200 || r.status >= 300) {
      throw new GatewayHttpError(r.status, r.body, `Gateway HTTP ${r.status} on ${path}: ${JSON.stringify(r.body).slice(0, 300)}`);
    }
    return r.body;
  }

  return {
    // Available = `balance` as-is; peatio holds `locked` separately (CONTEXT D-10).
    async balance(): Promise<GatewayBalance> {
      const b = (await getOrThrow('/account/balances/inr')) as GatewayBalance | null;
      if (!b || typeof b.balance !== 'string') throw new GatewayHttpError(200, b, 'Malformed balance response');
      return b;
    },

    async availableBalancePaise(): Promise<bigint> {
      const b = await this.balance();
      const v = parseGatewayAmount(b.balance);
      if (v === null) throw new GatewayHttpError(200, b, 'Malformed balance amount');
      return v;
    },

    // [] from the gateway means no payout exists for the reference: safe to send (guide p.19).
    async findByClientReference(clientReferenceId: string): Promise<GatewayPayout | null> {
      const body = await getOrThrow('/account/payouts/status', { client_reference_id: clientReferenceId });
      const exact = (Array.isArray(body) ? (body as GatewayPayout[]) : []).filter(
        (p) => p.client_reference_id === clientReferenceId
      );
      if (exact.length > 1) {
        console.error(`[uapi] ${exact.length} payouts returned for reference ${clientReferenceId}`);
      }
      return exact[0] ?? null;
    },

    async findByPayoutId(payoutId: string): Promise<GatewayPayout | null> {
      const body = await getOrThrow('/account/payouts/status', { payout_id: payoutId });
      return (Array.isArray(body) ? (body as GatewayPayout[]) : []).find((p) => p.payout_id === payoutId) ?? null;
    },

    // Never throws for HTTP outcomes; network failures come back as `unknown`.
    async createPayout(req: PayoutCreateRequest): Promise<CreateOutcome> {
      try {
        const { status, body } = await call('POST', '/account/payouts/initiate', undefined, req);
        return classifyCreateResponse(status, body);
      } catch (e) {
        return { kind: 'unknown', reason: (e as Error).message };
      }
    },
  };
}

export type UapiClient = ReturnType<typeof createUapiClient>;
