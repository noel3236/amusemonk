import 'server-only';
import { gatekeeperCall, type GatekeeperReply } from '@/auth/gatekeeper';
import { getGatekeeperCredentials } from '@/auth/session';
import { ERROR_CODES } from '@/lib/errors';

export type GatekeeperResult<T = null> = { ok: true; value: T } | { ok: false; error: string };

const SESSION_ENDED = 'Your gateway session has ended. Sign out and sign in again.';
const CODE_MISMATCH = 'That code didn’t match. Enter the current code from your authenticator app.';

const MESSAGES: Record<string, string> = {
  [ERROR_CODES.SESSION_EXPIRED]: SESSION_ENDED,
  [ERROR_CODES.TWO_FACTOR_REQUIRED]: 'Turn on two-factor authentication first.',
  [ERROR_CODES.KEY_CODE_INVALID]: CODE_MISMATCH,
  [ERROR_CODES.TOTP_CODE_INVALID]: CODE_MISMATCH,
  [ERROR_CODES.TOTP_ALREADY_ON]: 'Two-factor authentication is already on. Reload the page.',
  [ERROR_CODES.TOTP_ALREADY_OFF]: 'Two-factor authentication is already off. Reload the page.',
  [ERROR_CODES.PASSWORD_INVALID]: 'Your current password is wrong.',
};

// Gatekeeper answers with dotted codes, or with model validation sentences ("Password is too weak") worth showing.
export function gatekeeperMessage(status: number, codes: string[]): string {
  if (status === 0) return 'Couldn’t reach the gateway. Try again shortly.';
  for (const c of codes) if (MESSAGES[c]) return MESSAGES[c];
  if (status === 401) return SESSION_ENDED;
  return codes.find((c) => !/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(c)) ?? 'The gateway refused this. Try again shortly.';
}

async function call(
  method: Parameters<typeof gatekeeperCall>[1],
  path: string,
  body?: Record<string, unknown>
): Promise<GatekeeperReply> {
  const creds = await getGatekeeperCredentials();
  if (!creds) return { ok: false, status: 401, codes: [ERROR_CODES.SESSION_EXPIRED] };
  return gatekeeperCall(creds, method, path, body);
}

function fail(r: Extract<GatekeeperReply, { ok: false }>): { ok: false; error: string } {
  return { ok: false, error: gatekeeperMessage(r.status, r.codes) };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export type GatewayAccount = { email: string; uid: string; role: string; twoFactor: boolean };

export async function gatewayAccount(): Promise<GatekeeperResult<GatewayAccount>> {
  const r = await call('GET', '/resource/users/me');
  if (!r.ok) return fail(r);
  const u = (r.json ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    value: { email: str(u.email), uid: str(u.uid), role: str(u.role), twoFactor: Boolean(u.totp_enabled ?? u.otp) },
  };
}

export async function startTwoFactor(): Promise<GatekeeperResult<{ qr: string | null; secret: string }>> {
  const r = await call('POST', '/resource/totp');
  if (!r.ok) return fail(r);
  const j = (r.json ?? {}) as { barcode?: unknown; url?: unknown; data?: { barcode?: unknown; url?: unknown } };
  const barcode = str(j.barcode ?? j.data?.barcode);
  const secret = /secret=([A-Z2-7]+)/i.exec(str(j.url ?? j.data?.url))?.[1] ?? '';
  if (!secret) return { ok: false, error: 'The gateway didn’t return a setup key. Try again.' };
  return { ok: true, value: { qr: barcode ? `data:image/png;base64,${barcode}` : null, secret } };
}

export async function setTwoFactor(enable: boolean, code: string): Promise<GatekeeperResult> {
  const r = await call('PATCH', `/resource/totp/${enable ? 'enable' : 'disable'}`, { totp_code: code });
  return r.ok ? { ok: true, value: null } : fail(r);
}

export async function changePassword(current: string, next: string): Promise<GatekeeperResult> {
  const r = await call('PUT', '/resource/users/password', { old_password: current, new_password: next });
  return r.ok ? { ok: true, value: null } : fail(r);
}

// Same shape as D-23: payouts only, from any address (VPN exits rotate).
export async function createGatewayKey(code: string): Promise<GatekeeperResult<{ kid: string; secret: string }>> {
  const r = await call('POST', '/resource/api_keys', { otp_code: code, scope: 'uapi', whitelisted_ips: ['*'] });
  if (!r.ok) return fail(r);
  const k = (r.json ?? {}) as Record<string, unknown>;
  const kid = str(k.kid);
  const secret = str(k.secret ?? k.api_secret);
  if (!kid || !secret) return { ok: false, error: 'The gateway created a key but didn’t return its secret.' };
  return { ok: true, value: { kid, secret } };
}

export type GatewayKey = { kid: string; scope: string; ips: string[]; status: string; createdAt: Date | null };

// Every key on the user's gateway account, newest first (D-40), so stray ones can be found and deleted.
export async function listGatewayKeys(): Promise<GatekeeperResult<GatewayKey[]>> {
  const r = await call('GET', '/resource/api_keys?limit=100&ordering=desc');
  if (!r.ok) return fail(r);
  const rows = Array.isArray(r.json) ? (r.json as Record<string, unknown>[]) : [];
  return {
    ok: true,
    value: rows.map((k) => ({
      kid: str(k.kid),
      scope: str(k.scope),
      ips: Array.isArray(k.whitelisted_ips) ? k.whitelisted_ips.map(String) : [],
      status: str(k.status),
      createdAt: str(k.created_at) ? new Date(str(k.created_at)) : null,
    })),
  };
}

export async function deleteGatewayKey(kid: string, code?: string): Promise<GatekeeperResult> {
  const r = await call('DELETE', `/resource/api_keys/${encodeURIComponent(kid)}`, code ? { otp_code: code } : undefined);
  if (r.ok || r.status === 404) return { ok: true, value: null };
  return fail(r);
}
