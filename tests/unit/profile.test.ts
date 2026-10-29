import { describe, expect, it } from 'vitest';
import { gatekeeperMessage } from '@/features/profile/server';

describe('gatekeeper answers on the profile tab', () => {
  it('name the fix for the codes key, two-factor and password changes can hit', () => {
    expect(gatekeeperMessage(422, ['resource.api_key.2fa_disabled'])).toBe('Turn on two-factor authentication first.');
    expect(gatekeeperMessage(422, ['resource.api_key.invalid_otp'])).toMatch(/code didn’t match/);
    expect(gatekeeperMessage(422, ['resource.totp.invalid_otp'])).toMatch(/code didn’t match/);
    expect(gatekeeperMessage(422, ['resource.user.invalid_password'])).toBe('Your current password is wrong.');
  });

  it('say plainly when the session ended or the gateway is unreachable', () => {
    expect(gatekeeperMessage(401, [])).toMatch(/Sign out and sign in again/);
    expect(gatekeeperMessage(401, ['authz.invalid_session'])).toMatch(/Sign out and sign in again/);
    expect(gatekeeperMessage(0, [])).toMatch(/Couldn’t reach the gateway/);
  });

  it('pass validation sentences through but never a raw code', () => {
    expect(gatekeeperMessage(422, ['Password is too weak'])).toBe('Password is too weak');
    expect(gatekeeperMessage(422, ['resource.something.unknown'])).toBe('The gateway refused this. Try again shortly.');
  });
});
