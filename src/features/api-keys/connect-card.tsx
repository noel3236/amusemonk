'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveApiKeyAction, type SaveKeyState } from './actions';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  ErrorBanner,
  Field,
  Input,
  KeyRound,
  Link2,
  PasswordInput,
  toast,
} from '@/ui';

const STEPS = [
  'In the gateway portal, open API keys and create a new key',
  'Allow any IP address (*) — payouts leave from rotating addresses',
  'Copy the key and its secret here; the secret is shown only once there',
];

function ApiKeyForm({ submitLabel, onDone }: { submitLabel: string; onDone?: () => void }) {
  const [state, action, pending] = useActionState<SaveKeyState, FormData>(saveApiKeyAction, {});
  // Controlled, so a failed check doesn't make the user paste the key and secret again.
  const [kid, setKid] = useState('');
  const [secret, setSecret] = useState('');
  useEffect(() => {
    if (state.done) onDone?.();
  }, [state, onDone]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="API key" htmlFor="kid">
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
      <Field label="Secret key" htmlFor="secret" hint="Stored encrypted. Nobody, admins included, can see it again.">
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
        {pending ? 'Checking key…' : submitLabel}
      </Button>
    </form>
  );
}

export function ConnectGatewayCard() {
  return (
    <Card className="grid gap-6 p-5 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md">
          <Link2 className="size-4" />
        </span>
        <div className="flex flex-col gap-1.5">
          <span className="text-primary text-xs font-bold tracking-[0.14em] uppercase">Step 1</span>
          <h2 className="text-base font-bold tracking-tight">Connect your gateway API key</h2>
          <p className="text-muted-foreground max-w-lg text-sm">
            Payouts are sent from your own gateway account, signed with your API key. We check the key with a
            balance call before saving it.
          </p>
        </div>
        <ol className="text-muted-foreground flex flex-col gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-start gap-2">
              <span className="bg-sunken text-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </div>
      <div className="bg-sunken/60 rounded-lg border p-4">
        <ApiKeyForm submitLabel="Save API Key" />
      </div>
    </Card>
  );
}

export function ReplaceKeyButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-primary rounded-sm text-xs font-semibold outline-none hover:underline focus-visible:ring-[3px]"
        >
          Replace
        </button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Replace your API key</DialogTitle>
          <DialogDescription>
            The new key is checked first. Once saved, every payout not yet sent is signed with it; the old key stops
            being used here.
          </DialogDescription>
        </div>
        <ApiKeyForm
          submitLabel="Save New Key"
          onDone={() => {
            setOpen(false);
            toast.success('API key replaced');
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
