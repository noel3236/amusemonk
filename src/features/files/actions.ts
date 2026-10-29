'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/db';
import { formatDateTime } from '@/lib/format';
import { workerConfig } from '@/worker/config';
import { productionDeps } from '@/worker/deps';
import { refreshPayout } from '@/worker/refresh';
import { canSee, viewer } from './access';
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

export interface RawExchange {
  title: string;
  at: string;
  meta?: string;
  request?: unknown;
  response: unknown;
}

// What UAPI actually sent back for one payout: its latest status response, then every initiate call.
export async function payoutRawAction(payoutId: string): Promise<{ error?: string; exchanges?: RawExchange[] }> {
  const v = await viewer();
  if (!v) return { error: 'Your session has expired. Sign in again.' };
  const p = await db()
    .selectFrom('payouts')
    .select(['user_id', 'gateway_response_json', 'last_polled_at'])
    .where('id', '=', payoutId)
    .executeTakeFirst();
  if (!p || !canSee(v, p.user_id)) return { error: 'Payout not found.' };
  const attempts = await db()
    .selectFrom('payout_attempts')
    .select(['attempt_no', 'http_status', 'outcome', 'request_json', 'response_json', 'created_at'])
    .where('payout_id', '=', payoutId)
    .orderBy('attempt_no', 'desc')
    .execute();
  const exchanges: RawExchange[] = [];
  if (p.gateway_response_json !== null) {
    exchanges.push({ title: 'Latest status', at: formatDateTime(p.last_polled_at), meta: 'GET /account/payouts/status', response: p.gateway_response_json });
  }
  for (const a of attempts) {
    exchanges.push({
      title: `Initiate · attempt ${a.attempt_no}`,
      at: formatDateTime(a.created_at),
      meta: [`POST /account/payouts/initiate`, a.http_status && `HTTP ${a.http_status}`, a.outcome].filter(Boolean).join(' · '),
      request: a.request_json,
      response: a.response_json,
    });
  }
  return { exchanges };
}
