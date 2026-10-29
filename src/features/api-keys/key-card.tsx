'use client';

import { useActionState, useState } from 'react';
import { revokeOwnKeyAction, type SaveKeyState } from './actions';
import { ConnectKeyPanel } from './connect-card';
import {
  Badge,
  Button,
  Card,
  Copyable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  ErrorBanner,
  KeyRound,
  OtpField,
  toast,
} from '@/ui';

export type ConnectedKey = { kid: string; origin: 'pasted' | 'generated'; connectedAt: string };

function RevokeKeyButton({ apiKey, twoFactor }: { apiKey: ConnectedKey; twoFactor: boolean | null }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const generated = apiKey.origin === 'generated';
  const needsCode = generated && twoFactor !== false;
  const [state, action, pending] = useActionState<SaveKeyState, FormData>(async (prev, formData) => {
    const r = await revokeOwnKeyAction(prev, formData);
    if (r.done) {
      setOpen(false);
      toast.success(generated ? 'Key revoked and deleted from your gateway account' : 'Key disconnected');
    }
    return r;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Revoke Key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Revoke this API key?</DialogTitle>
          <DialogDescription>
            {generated
              ? 'It’s deleted from your gateway account. Payouts not yet sent wait until a new key is connected.'
              : 'amusemonk stops using it. It stays active on your gateway account: delete it in the gateway portal if nothing else uses it. Payouts not yet sent wait until a new key is connected.'}
          </DialogDescription>
        </div>
        <form action={action} className="flex flex-col gap-4">
          {needsCode && (
            <>
              <OtpField value={code} onChange={setCode} autoFocus />
              <input type="hidden" name="code" value={code} />
            </>
          )}
          {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? 'Revoking…' : generated ? 'Revoke and Delete Key' : 'Disconnect Key'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeyCard({ apiKey, twoFactor }: { apiKey: ConnectedKey | null; twoFactor: boolean | null }) {
  return (
    <Card id="api-key" className="flex scroll-mt-20 flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md">
          <KeyRound className="size-4" />
        </span>
        <h2 className="text-sm font-bold tracking-tight">Payout API key</h2>
        <Badge tone={apiKey ? 'ok' : 'warn'} className="ml-auto">
          {apiKey ? 'Connected' : 'Not connected'}
        </Badge>
      </div>
      {apiKey ? (
        <>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-muted-foreground">Key</dt>
            <dd>
              <Copyable value={apiKey.kid} label="API key" mono />
            </dd>
            <dt className="text-muted-foreground">Made</dt>
            <dd>{apiKey.origin === 'generated' ? 'Generated here, payouts only' : 'Pasted from the gateway portal'}</dd>
            <dt className="text-muted-foreground">Connected</dt>
            <dd>{apiKey.connectedAt}</dd>
          </dl>
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <p className="text-muted-foreground text-xs">To use a different key, revoke this one, then connect the new one.</p>
            <RevokeKeyButton apiKey={apiKey} twoFactor={twoFactor} />
          </div>
        </>
      ) : (
        <div className="bg-sunken/60 rounded-lg border p-4">
          <ConnectKeyPanel twoFactor={twoFactor} />
        </div>
      )}
    </Card>
  );
}
