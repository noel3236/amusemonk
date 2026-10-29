'use client';

import { useActionState, useRef, useState } from 'react';
import { authenticate, type LoginState } from './actions';
import { ArrowRight, Button, ErrorBanner, Field, Input, OtpField, PasswordInput } from '@/ui';

const INITIAL: LoginState = { step: 'password' };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(authenticate, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const isOtp = state.step === 'otp';

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          readOnly={isOtp}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          readOnly={isOtp}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      {isOtp && (
        <OtpField
          value={otp}
          onChange={setOtp}
          onComplete={() => formRef.current?.requestSubmit()}
          autoFocus
        >
          <input type="hidden" name="otp" value={otp} />
        </OtpField>
      )}

      {state.error && <ErrorBanner>{state.error}</ErrorBanner>}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : isOtp ? 'Verify and sign in' : 'Sign in'}
        {!pending && <ArrowRight />}
      </Button>
    </form>
  );
}
