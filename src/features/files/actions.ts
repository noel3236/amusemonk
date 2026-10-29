'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/db';
import { workerConfig } from '@/worker/config';
import { productionDeps } from '@/worker/deps';
import { refreshPayout } from '@/worker/refresh';
import { approveFile, cancelFile } from './approval';

type Result = { error?: string };

const PAYOUT_STATUS_WORDS: Record<string, string> = {
  PROCESSING: 'processing',
  SUCCEEDED: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

function touched(fileId: string) {
  revalidatePath(`/files/${fileId}`);
  revalidatePath('/files');
  revalidatePath('/dashboard');
  revalidatePath('/payouts');
}

export async function confirmPaymentAction(fileId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { error: 'Your session has expired. Sign in again.' };
  const r = await approveFile(fileId, session.user.id);
  if (!r.ok) return { error: r.reason };
  touched(fileId);
  return {};
}

export async function cancelFileAction(fileId: string, reason: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { error: 'Your session has expired. Sign in again.' };
  const r = await cancelFile(fileId, session.user.id, reason.trim());
  if (!r.ok) return { error: r.reason };
  touched(fileId);
  return {};
}

// Read-only against the gateway: asks for the payout's current status and records it.
export async function fetchPayoutStatusAction(payoutId: string): Promise<Result & { status?: string }> {
  const session = await auth();
  if (!session?.user) return { error: 'Your session has expired. Sign in again.' };
  const p = await db().selectFrom('payouts').select(['user_id', 'file_id']).where('id', '=', payoutId).executeTakeFirst();
  if (!p || p.user_id !== session.user.id) return { error: 'Payout not found.' };
  const r = await refreshPayout(productionDeps(db(), workerConfig()), payoutId);
  if (!r.ok) return { error: r.reason };
  touched(p.file_id);
  return { status: PAYOUT_STATUS_WORDS[r.after] ?? r.after.toLowerCase() };
}
