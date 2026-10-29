'use server';

import { AuthError, CredentialsSignin } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { gatekeeperLogin } from '@/auth/gatekeeper';

export type LoginState = { step: 'password' | 'otp'; error?: string };

const SERVICE_DOWN = 'Couldn’t reach the sign-in service. Please try again.';
const BAD_CREDENTIALS = 'Invalid email or password.';

function safeNext(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path === '/') return '/dashboard';
  return path;
}

// The password step probes gatekeeper for 2FA before any session exists; the OTP is sent once,
// on the verify submit.
export async function authenticate(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const otp = String(formData.get('otp') ?? '').trim();
  const next = safeNext(String(formData.get('next') ?? ''));
  const step = otp ? 'otp' : 'password';

  if (!email || !password) return { step, error: 'Enter your email and password.' };

  if (!otp) {
    const probe = await gatekeeperLogin({ email, password });
    if (!probe.ok) {
      if (probe.code === 'OTP_REQUIRED') return { step: 'otp' };
      if (probe.code === 'SERVICE_ERROR') return { step, error: SERVICE_DOWN };
      return { step, error: BAD_CREDENTIALS };
    }
  }

  try {
    await signIn('credentials', { email, password, otp: otp || undefined, redirect: false });
  } catch (e) {
    if (e instanceof CredentialsSignin) {
      if (e.code === 'SERVICE_ERROR') return { step, error: SERVICE_DOWN };
      if (e.code === 'INACTIVE') return { step, error: 'This account is not active yet.' };
      if (e.code === 'OTP_REQUIRED') return { step: 'otp' };
    }
    if (e instanceof AuthError) {
      return { step, error: otp ? 'That code is incorrect or expired.' : BAD_CREDENTIALS };
    }
    throw e;
  }

  redirect(next);
}
