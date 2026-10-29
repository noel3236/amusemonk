// Grape returns `{ errors: [code, ...] }`, occasionally `{ error: string }`; both are normalized.
export const ERROR_CODES = {
  OTP_REQUIRED: 'identity.session.missing_otp',
  OTP_INVALID: 'identity.session.invalid_otp',
} as const;

export function extractCodes(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as { errors?: unknown; error?: unknown };
  if (Array.isArray(b.errors)) return b.errors.map(String);
  if (typeof b.error === 'string') return [b.error];
  return [];
}
