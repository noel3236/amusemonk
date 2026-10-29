import { createHmac } from 'node:crypto';

// Guide p.5–6 / gatekeeper ApiKeyAuthService: nonce = ms timestamp, signature = HMAC-SHA256(secret, nonce + kid) hex.
export function authHeaders(kid: string, secret: string, nowMs = Date.now()): Record<string, string> {
  const nonce = String(nowMs);
  const signature = createHmac('sha256', secret).update(nonce + kid).digest('hex');
  return { 'X-Auth-Apikey': kid, 'X-Auth-Nonce': nonce, 'X-Auth-Signature': signature };
}

