import { describe, expect, it } from 'vitest';
import { classifyCreateResponse } from '@/gateway/client';
import { authHeaders } from '@/gateway/signing';
import { mapGatewayStatus } from '@/worker/status';

describe('UAPI signing', () => {
  it('signs HMAC-SHA256(secret, nonce + kid), as gatekeeper verifies it', () => {
    // Expected value computed independently: printf '17932700000004f1c9a07b2d8e653' | openssl dgst -sha256 -hmac 'test-secret-not-real'
    expect(authHeaders('4f1c9a07b2d8e653', 'test-secret-not-real', 1793270000000)).toEqual({
      'X-Auth-Apikey': '4f1c9a07b2d8e653',
      'X-Auth-Nonce': '1793270000000',
      'X-Auth-Signature': '51f741c281675059406ffbd07e1b91b9f12579a9e6b5242602a64c1a97afe19c',
    });
  });
});

describe('classifyCreateResponse', () => {
  const payout = { payout_id: 'TID1', client_reference_id: 'r' };
  it.each([
    [201, payout, 'created'],
    [201, {}, 'unknown'],
    [401, { errors: ['authz.invalid_signature'] }, 'auth_error'],
    [403, {}, 'auth_error'],
    [503, {}, 'rate_limited'],
    [422, { errors: ['account.payout.duplicate_reference_id_#abc'] }, 'duplicate_reference'],
    [422, { errors: ['account.payout.create_in_processing'] }, 'in_processing'],
    [422, { errors: ['account.payout.insufficient_balance_#x'] }, 'insufficient_balance'],
    [422, { errors: ['account.payout.invalid_ifsc'] }, 'validation_failed'],
    [400, { error: 'bad' }, 'validation_failed'],
    [500, { error: 'boom' }, 'unknown'],
    [504, null, 'unknown'],
  ])('HTTP %i %j → %s', (status, body, kind) => {
    expect(classifyCreateResponse(status, body).kind).toBe(kind);
  });

  it('a 500 is never "failed": the payout may exist', () => {
    expect(classifyCreateResponse(500, null)).toMatchObject({ kind: 'unknown' });
  });
});

describe('mapGatewayStatus', () => {
  it.each([
    ['succeed', 'SUCCEEDED'],
    ['rejected', 'FAILED'],
    ['refunded', 'REFUNDED'],
    ['processing', 'PROCESSING'],
    ['something-new', 'PROCESSING'],
    [null, 'PROCESSING'],
  ])('%s → %s', (input, out) => {
    expect(mapGatewayStatus(input)).toBe(out);
  });
});
