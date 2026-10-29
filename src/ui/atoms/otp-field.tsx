'use client';

import * as React from 'react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../primitives/input-otp';
import { Field } from './field';

export function OtpField({
  value,
  onChange,
  onComplete,
  autoFocus,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: () => void;
  autoFocus?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Field label="Authenticator code" hint="The 6-digit code from your authenticator app">
      {children}
      <InputOTP
        maxLength={6}
        value={value}
        onChange={(v) => onChange(v.replace(/\D/g, ''))}
        onComplete={onComplete}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        containerClassName="w-full"
      >
        <InputOTPGroup className="w-full">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </Field>
  );
}
