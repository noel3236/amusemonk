'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/auth/roles';
import { isDuplicateKey } from '@/db';
import { createUapiClient } from '@/gateway/client';
import { GatewayHttpError, GatewayNetworkError } from '@/gateway/types';
import { recordBalance } from '@/features/balance/server';
import { createGatewayKey, deleteGatewayKey } from '@/features/profile/server';
import { activeKeySummary, revokeKey, storeNewKey } from './server';

export type SaveKeyState = { error?: string; done?: boolean };

const KID_RE = /^[A-Za-z0-9]{8,64}$/;
const CODE_RE = /^\d{6}$/;

function revalidateKeyPages() {
  revalidatePath('/dashboard');
  revalidatePath('/files');
  revalidatePath('/profile');
}


// A key the user made elsewhere (D-34). Nothing is stored until a signed balance call proves the key and secret work
// from this server.
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
    await storeNewKey({ userId: session.user.id, kid, secret, scope: null, origin: 'pasted' });
  } catch (e) {
    if (isDuplicateKey(e)) return { error: 'This key is already connected to another amusemonk account.' };
    throw e;
  }
  await recordBalance(session.user.id, balance);
  revalidateKeyPages();
  return { done: true };
}

// D-40: created on the user's gateway account and connected at once; the secret never leaves the server.
export async function generateKeyAction(_prev: SaveKeyState, formData: FormData): Promise<SaveKeyState> {
  const session = await auth();
  if (!session?.user) return { error: 'Your session has expired. Sign in again.' };
  const code = String(formData.get('code') ?? '').trim();
  if (!CODE_RE.test(code)) return { error: 'Enter the 6-digit code from your authenticator app.' };
  if (await activeKeySummary(session.user.id)) return { error: 'A key is already connected. Revoke it first.' };

  const created = await createGatewayKey(code);
  if (!created.ok) return { error: created.error };
  const { kid, secret } = created.value;
  try {
    await storeNewKey({ userId: session.user.id, kid, secret, scope: 'uapi', origin: 'generated' });
  } catch (e) {
    console.error(`[keys] generated ${kid} on the gateway but couldn't store it:`, e);
    return { error: `Key ${kid} was created on the gateway but couldn’t be connected. Delete it in the gateway portal and try again.` };
  }
  try {
    await recordBalance(session.user.id, await createUapiClient({ kid, secret }).balance());
  } catch (e) {
    console.warn(`[keys] first balance read with ${kid} failed:`, e instanceof Error ? e.message : e);
  }
  revalidateKeyPages();
  return { done: true };
}

// A generated key is deleted on the gateway too; a pasted one may serve other integrations, so it's only disconnected.
export async function revokeOwnKeyAction(_prev: SaveKeyState, formData: FormData): Promise<SaveKeyState> {
  const session = await auth();
  if (!session?.user) return { error: 'Your session has expired. Sign in again.' };
  const key = await activeKeySummary(session.user.id);
  if (!key) return { error: 'No key is connected.' };
  if (key.origin === 'generated') {
    const code = String(formData.get('code') ?? '').trim();
    if (code && !CODE_RE.test(code)) return { error: 'Enter the 6-digit code from your authenticator app.' };
    const r = await deleteGatewayKey(key.kid, code || undefined);
    if (!r.ok) return { error: r.error };
  }
  await revokeKey(key.id);
  revalidateKeyPages();
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
