import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';

// AES-256-GCM. Format: v1:<iv>:<tag>:<ciphertext> (base64). `context` is bound in as associated data, so a
// ciphertext copied onto another row (another key id) fails to decrypt instead of silently working there.
const keySchema = z
  .string()
  .transform((s) => Buffer.from(s, 'base64'))
  .refine((b) => b.length === 32, 'SECRETS_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)');

let key: Buffer | undefined;
const secretsKey = () => (key ??= keySchema.parse(process.env.SECRETS_KEY));

export function encryptSecret(plain: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretsKey(), iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), ct].map((p) => (typeof p === 'string' ? p : p.toString('base64'))).join(':');
}

export function decryptSecret(enc: string, context: string): string {
  const [v, iv, tag, ct] = enc.split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('malformed ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', secretsKey(), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}
