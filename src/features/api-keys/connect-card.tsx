'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { generateKeyAction, saveApiKeyAction, type SaveKeyState } from './actions';
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  KeyRound,
  Link2,
  OtpField,
  PasswordInput,
  ShieldCheck,
} from '@/ui';

const FACTS = [
  'Payouts only: the key can’t act on the rest of your gateway account',
  'Works from any IP address, since payouts leave from rotating addresses',
  'Stored encrypted. Nobody, admins included, can read the secret',
];

function PasteKeyForm({ onDone }: { onDone?: () => void }) {
  // Controlled, so a failed check doesn't make the user paste the key and secret again.
  const [kid, setKid] = useState('');
  const [secret, setSecret] = useState('');
  const [state, action, pending] = useActionState<SaveKeyState, FormData>(async (prev, formData) => {
    const r = await saveApiKeyAction(prev, formData);
    if (r.done) onDone?.();
    return r;
  }, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="API key" htmlFor="kid" hint="Created in the gateway portal with access from any IP address (*).">
        <Input
          id="kid"
          name="kid"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          placeholder="e.g. 4f1c9a07b2d8e653"
          value={kid}
          onChange={(e) => setKid(e.target.value)}
        />
      </Field>
      <Field label="Secret key" htmlFor="secret" hint="The portal shows it only once. We check it with a balance call.">
        <PasswordInput
          id="secret"
          name="secret"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
      </Field>
      {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
      <Button type="submit" disabled={pending} className="w-full">
        <KeyRound />
        {pending ? 'Checking key…' : 'Connect Key'}
      </Button>
    </form>
  );
}

function GenerateKeyForm({ onDone }: { onDone?: () => void }) {
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

function TwoFactorFirst() {
  return (
    <div className="flex flex-col items-start gap-3">
      <span className="bg-warn-soft text-warn flex size-8 items-center justify-center rounded-md">
        <ShieldCheck className="size-4" />
      </span>
      <p className="text-sm">
        Generating a key needs two-factor authentication on your gateway account. It takes a minute with any
        authenticator app.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/profile#two-factor">Set Up Two-Factor Authentication</Link>
      </Button>
    </div>
  );
}

// Generate is the main path; pasting a key made elsewhere is the alternative. One shows at a time.
export function ConnectKeyPanel({ twoFactor, onDone }: { twoFactor: boolean | null; onDone?: () => void }) {
  const [mode, setMode] = useState<'generate' | 'paste'>('generate');
  return (
    <div className="flex flex-col gap-4">
      {mode === 'paste' ? (
        <PasteKeyForm onDone={onDone} />
      ) : twoFactor === false ? (
        <TwoFactorFirst />
      ) : (
        <GenerateKeyForm onDone={onDone} />
      )}
      <button
        type="button"
        onClick={() => setMode(mode === 'paste' ? 'generate' : 'paste')}
        className="text-primary self-center rounded-sm text-xs font-semibold outline-none hover:underline focus-visible:ring-[3px]"
      >
        {mode === 'paste' ? 'Generate a key here instead' : 'Have a key already? Paste it instead'}
      </button>
    </div>
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
