'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { changePassword, setTwoFactor, startTwoFactor } from './server';

export type FormState = { error?: string; done?: boolean };

const CODE_RE = /^\d{6}$/;

export async function startTwoFactorAction(): Promise<{ error?: string; qr?: string | null; secret?: string }> {
  if (!(await auth())?.user) return { error: 'Your session has expired. Sign in again.' };
  const r = await startTwoFactor();
  return r.ok ? r.value : { error: r.error };
}

export async function twoFactorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await auth())?.user) return { error: 'Your session has expired. Sign in again.' };
  const code = String(formData.get('code') ?? '').trim();
  if (!CODE_RE.test(code)) return { error: 'Enter the 6-digit code from your authenticator app.' };
  const r = await setTwoFactor(formData.get('mode') === 'enable', code);
  if (!r.ok) return { error: r.error };
  revalidatePath('/profile');
  revalidatePath('/dashboard');
  return { done: true };
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await auth())?.user) return { error: 'Your session has expired. Sign in again.' };
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  if (!current) return { error: 'Enter your current password.' };
  if (!next) return { error: 'Enter a new password.' };
  if (next !== String(formData.get('confirm') ?? '')) return { error: 'The two new passwords don’t match.' };
  if (next === current) return { error: 'Choose a password different from the current one.' };
  const r = await changePassword(current, next);
  return r.ok ? { done: true } : { error: r.error };
}
