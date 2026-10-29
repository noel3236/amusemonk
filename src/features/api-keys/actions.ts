'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/auth/roles';
import { isDuplicateKey } from '@/db';
import { createUapiClient } from '@/gateway/client';
import { GatewayHttpError, GatewayNetworkError } from '@/gateway/types';
import { recordBalance } from '@/features/balance/server';
import { revokeKey, storeNewKey } from './server';

export type SaveKeyState = { error?: string; done?: boolean };

const KID_RE = /^[A-Za-z0-9]{8,64}$/;

// Users generate their key on the gateway platform and paste it here (D-34). Nothing is stored until a signed
// balance call proves the key and secret work from this server.
export async function saveApiKeyAction(_prev: SaveKeyState, formData: FormData): Promise<SaveKeyState> {
  const session = await auth();
  if (!session?.user) return { error: 'Your session has expired. Sign in again.' };

  const kid = String(formData.get('kid') ?? '').trim();
  const secret = String(formData.get('secret') ?? '').trim();
  if (!KID_RE.test(kid)) return { error: 'Paste the API key exactly as the gateway shows it (letters and digits).' };
  if (secret.length < 16 || secret.length > 128) return { error: 'Paste the full secret key.' };

  const client = createUapiClient({ kid, secret });
  let balance;
  try {
    balance = await client.balance();
  } catch (e) {
    if (e instanceof GatewayHttpError && (e.status === 401 || e.status === 403)) {
      return {
        error:
          'The gateway didn’t accept this key. Check the key and secret, that the key is enabled, and that it allows any IP address (*).',
      };
    }
    if (e instanceof GatewayNetworkError) return { error: 'Couldn’t reach the gateway to check the key. Try again shortly.' };
    console.error('[keys] verification failed:', e);
    return { error: 'The gateway gave an unexpected answer while checking the key. Try again shortly.' };
  }

  try {
    await storeNewKey({ userId: session.user.id, kid, secret, scope: null });
  } catch (e) {
    if (isDuplicateKey(e)) return { error: 'This key is already connected to another amusemonk account.' };
    throw e;
  }
  await recordBalance(session.user.id, balance);
  revalidatePath('/dashboard');
  revalidatePath('/files');
  return { done: true };
}

export async function revokeKeyAction(id: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!isSuperAdmin(session?.user.role)) return { error: 'Only a super admin can revoke keys.' };
  if (!(await revokeKey(id))) return { error: 'That key is already revoked.' };
  revalidatePath('/admin/users');
  revalidatePath('/dashboard');
  return {};
}
