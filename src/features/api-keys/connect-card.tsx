'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { generateKeyAction, type SaveKeyState } from './actions';
import {
  Button,
  Card,
  ErrorBanner,
  KeyRound,
  Link2,
  OtpField,
  ShieldCheck,
} from '@/ui';

const FACTS = [
  'Payouts only: the key can’t act on the rest of your gateway account',
  'Works from any IP address, since payouts leave from rotating addresses',
  'Stored encrypted. Nobody, admins included, can read the secret',
];

export function GenerateKeyForm({ onDone }: { onDone?: () => void }) {
  const [code, setCode] = useState('');
  const [state, action, pending] = useActionState<SaveKeyState, FormData>(async (prev, formData) => {
    const r = await generateKeyAction(prev, formData);
    if (r.done) onDone?.();
    return r;
  }, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <OtpField value={code} onChange={setCode} />
      <input type="hidden" name="code" value={code} />
      {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
      <Button type="submit" disabled={pending} className="w-full">
        <KeyRound />
        {pending ? 'Generating key…' : 'Generate and Connect Key'}
      </Button>
    </form>
  );
}

export function TwoFactorFirst({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <span className="bg-warn-soft text-warn flex size-8 items-center justify-center rounded-md">
        <ShieldCheck className="size-4" />
      </span>
      <p className="text-sm">
        Generating a key needs two-factor authentication on your gateway account. It takes a minute with any
        authenticator app.
      </p>
      {children}
    </div>
  );
}

export function ConnectKeyPanel({ twoFactor, onDone }: { twoFactor: boolean | null; onDone?: () => void }) {
  return twoFactor === false ? (
    <TwoFactorFirst>
      <Button asChild variant="outline" size="sm">
        <Link href="/profile#two-factor">Set Up Two-Factor Authentication</Link>
      </Button>
    </TwoFactorFirst>
  ) : (
    <GenerateKeyForm onDone={onDone} />
  );
}

export function ConnectGatewayCard({ twoFactor }: { twoFactor: boolean | null }) {
  return (
    <Card className="grid gap-6 p-5 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md">
          <Link2 className="size-4" />
        </span>
        <div className="flex flex-col gap-1.5">
          <span className="text-primary text-xs font-bold tracking-[0.14em] uppercase">Step 1</span>
          <h2 className="text-base font-bold tracking-tight">Connect a gateway API key</h2>
          <p className="text-muted-foreground max-w-lg text-sm">
            Payouts are sent from your own gateway account and signed with an API key. Generate one here with your
            authenticator code and it’s connected straight away.
          </p>
        </div>
        <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
          {FACTS.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <ShieldCheck className="text-ok mt-0.5 size-4 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-sunken/60 rounded-lg border p-4">
        <ConnectKeyPanel twoFactor={twoFactor} />
      </div>
    </Card>
  );
}
