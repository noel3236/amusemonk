import 'server-only';
import { gatewayConfig, SERVICES } from '@/gateway/config';
import { outboundFetch } from '@/lib/egress';
import { ERROR_CODES, extractCodes } from '@/lib/errors';

export type GatekeeperUser = {
  uid: string;
  email: string | null;
  role: string;
  state: string;
};

type LoginResult =
  | { ok: true; user: GatekeeperUser; gkCookie: string; csrf: string }
  | { ok: false; code: 'OTP_REQUIRED' | 'OTP_INVALID' | 'INVALID_CREDENTIALS' | 'SERVICE_ERROR' };

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function gatekeeperLogin(input: {
  email: string;
  password: string;
  otp?: string;
}): Promise<LoginResult> {
  const url = gatewayConfig().GATEWAY_BASE_URL + SERVICES.gatekeeper + '/identity/sessions';
  const body: Record<string, string> = { email: input.email, password: input.password };
  if (input.otp) body.otp_code = input.otp;

  let res: Awaited<ReturnType<typeof outboundFetch>>;
  try {
    res = await outboundFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    console.error(`[auth] gatekeeper unreachable at ${url}:`, e instanceof Error ? e.message : e);
    return { ok: false, code: 'SERVICE_ERROR' };
  }

  const text = await res.text();
  const json = text ? safeJson(text) : null;

  if (!res.ok) {
    const codes = extractCodes(json);
    if (codes.includes(ERROR_CODES.OTP_REQUIRED)) return { ok: false, code: 'OTP_REQUIRED' };
    if (codes.includes(ERROR_CODES.OTP_INVALID)) return { ok: false, code: 'OTP_INVALID' };
    if (res.status === 401) return { ok: false, code: 'INVALID_CREDENTIALS' };
    console.error(`[auth] gatekeeper login ${res.status}: ${codes.join(',') || text.slice(0, 200)}`);
    return { ok: false, code: 'SERVICE_ERROR' };
  }

  const u = (json ?? {}) as Record<string, unknown>;
  const gkCookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');

  return {
    ok: true,
    user: {
      uid: String(u.uid ?? ''),
      email: typeof u.email === 'string' ? u.email : null,
      role: String(u.role ?? ''),
      state: String(u.state ?? ''),
    },
    gkCookie,
    csrf: String(u.csrf_token ?? ''),
  };
}

export type GatekeeperReply = { ok: true; json: unknown } | { ok: false; status: number; codes: string[] };

// Calls gatekeeper as the signed-in user. `status: 0` means it couldn't be reached.
export async function gatekeeperCall(
  creds: { gkCookie: string; csrf: string },
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>
): Promise<GatekeeperReply> {
  let res: Awaited<ReturnType<typeof outboundFetch>>;
  try {
    res = await outboundFetch(gatewayConfig().GATEWAY_BASE_URL + SERVICES.gatekeeper + path, {
      method,
      headers: {
        Cookie: creds.gkCookie,
        'X-CSRF-Token': creds.csrf,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    console.error(`[auth] gatekeeper ${method} ${path} unreachable:`, e instanceof Error ? e.message : e);
    return { ok: false, status: 0, codes: [] };
  }
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  return res.ok ? { ok: true, json } : { ok: false, status: res.status, codes: extractCodes(json) };
}

// Best effort: the local session is cleared regardless of what gatekeeper answers.
export async function gatekeeperLogout(gkCookie: string, csrf: string): Promise<void> {
  try {
    await outboundFetch(gatewayConfig().GATEWAY_BASE_URL + SERVICES.gatekeeper + '/identity/sessions', {
      method: 'DELETE',
      headers: { Cookie: gkCookie, 'X-CSRF-Token': csrf, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error('[auth] gatekeeper logout failed:', e instanceof Error ? e.message : e);
  }
}

