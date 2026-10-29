// Grape returns `{ errors: [code, ...] }`, occasionally `{ error: string }`; both are normalized.
export const ERROR_CODES = {
  OTP_REQUIRED: 'identity.session.missing_otp',
  OTP_INVALID: 'identity.session.invalid_otp',
  SESSION_EXPIRED: 'authz.invalid_session',
  TWO_FACTOR_REQUIRED: 'resource.api_key.2fa_disabled',
  KEY_CODE_INVALID: 'resource.api_key.invalid_otp',
  TOTP_CODE_INVALID: 'resource.totp.invalid_otp',
  TOTP_ALREADY_ON: 'resource.totp.already_enabled',
  TOTP_ALREADY_OFF: 'resource.totp.not_enabled',
  PASSWORD_INVALID: 'resource.user.invalid_password',
} as const;

export function extractCodes(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as { errors?: unknown; error?: unknown };
  if (Array.isArray(b.errors)) return b.errors.map(String);
  if (typeof b.error === 'string') return [b.error];
  return [];
}
