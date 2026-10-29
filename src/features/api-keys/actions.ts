'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/auth/roles';
import { userExists } from '@/db/users';
import { createUapiClient } from '@/gateway/client';
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

// D-40: created on the user's gateway account and connected at once; the secret never leaves the server.
export async function generateKeyAction(_prev: SaveKeyState, formData: FormData): Promise<SaveKeyState> {
  const session = await auth();
  if (!session?.user) return { error: 'Your session has expired. Sign in again.' };
  const code = String(formData.get('code') ?? '').trim();
  if (!CODE_RE.test(code)) return { error: 'Enter the 6-digit code from your authenticator app.' };
  if (await activeKeySummary(session.user.id)) return { error: 'A key is already connected. Revoke it first.' };
  if (!(await userExists(session.user.id))) return { error: 'Your sign-in is out of date. Sign in again, then generate the key.' };

  const created = await createGatewayKey(code);
  if (!created.ok) return { error: created.error };
  const { kid, secret } = created.value;
  try {
    await storeNewKey({ userId: session.user.id, kid, secret, scope: 'uapi', origin: 'generated' });
  } catch (e) {
    // Only the message: the error object carries the SQL, encrypted secret included.
    console.error(`[keys] generated ${kid} on the gateway but couldn't store it:`, e instanceof Error ? e.message : e);
    // Not deleted here: atlas wants a fresh 2FA code to delete a key, and the one just used for creating it is spent.
    return {
      error: `The new key couldn’t be saved, so key ${kid} is on your gateway account but not connected. Nobody has its secret, so it can’t be used. Try again.`,
    };
  }
  try {
    await recordBalance(session.user.id, await createUapiClient({ kid, secret }).balance());
  } catch (e) {
    console.warn(`[keys] first balance read with ${kid} failed:`, e instanceof Error ? e.message : e);
  }
  revalidateKeyPages();
  return { done: true };
}

// Any key on the user's gateway account except the one in use, which is revoked instead (D-43).
export async function deleteKeyAction(_prev: SaveKeyState, formData: FormData): Promise<SaveKeyState> {
  const session = await auth();
  if (!session?.user) return { error: 'Your session has expired. Sign in again.' };
  const kid = String(formData.get('kid') ?? '');
  const code = String(formData.get('code') ?? '').trim();
  if (!KID_RE.test(kid)) return { error: 'That key id isn’t valid.' };
  if (code && !CODE_RE.test(code)) return { error: 'Enter the 6-digit code from your authenticator app.' };
  if ((await activeKeySummary(session.user.id))?.kid === kid) return { error: 'This key is in use. Revoke it first.' };
  const r = await deleteGatewayKey(kid, code || undefined);
  if (!r.ok) return { error: r.error };
  revalidateKeyPages();
  return { done: true };
}

// The key in use: a generated one is deleted on the gateway too; a pasted one may serve other integrations, so it's
// only disconnected.
export async function revokeKeyInUseAction(_prev: SaveKeyState, formData: FormData): Promise<SaveKeyState> {
  const session = await auth();
  if (!session?.user) return { error: 'Your session has expired. Sign in again.' };
  const key = await activeKeySummary(session.user.id);
  if (!key) return { error: 'No key is in use.' };
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
