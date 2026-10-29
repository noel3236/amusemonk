'use server';

import { signOut } from '@/auth';
import { gatekeeperLogout } from '@/auth/gatekeeper';
import { getGatekeeperCredentials } from '@/auth/session';

export async function logoutAction() {
  const creds = await getGatekeeperCredentials();
  if (creds) await gatekeeperLogout(creds.gkCookie, creds.csrf);
  await signOut({ redirectTo: '/login' });
}
