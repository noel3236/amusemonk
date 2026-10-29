import 'server-only';
import { cookies, headers } from 'next/headers';
import { getToken } from 'next-auth/jwt';
import { env } from '@/lib/env';

// Gatekeeper credentials for server-side calls. Read from the JWT directly because the session
// object deliberately never carries them.
export async function getGatekeeperCredentials(): Promise<{ gkCookie: string; csrf: string } | null> {
  const h = await headers();
  const token = await getToken({
    req: { headers: Object.fromEntries(h.entries()) },
    secret: env.AUTH_SECRET,
    secureCookie: (await cookies()).has('__Secure-authjs.session-token'),
  });
  if (!token?.gkCookie || !token.csrf) return null;
  return { gkCookie: token.gkCookie, csrf: token.csrf };
}
