'use client';

import { useActionState, useState } from 'react';
import { deleteKeyAction, revokeKeyInUseAction, type SaveKeyState } from './actions';
import { GenerateKeyForm, TwoFactorFirst } from './connect-card';
import {
  Badge,
  Button,
  Copyable,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  ErrorBanner,
  KeyRound,
  OtpField,
  Plus,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Time,
  Trash2,
  toast,
} from '@/ui';

export type GatewayKeyRow = { kid: string; scope: string; ips: string[]; active: boolean; createdAt: Date | null };
export type ConnectedKey = { kid: string; origin: 'pasted' | 'generated' };

function GenerateKeyButton({ twoFactor }: { twoFactor: boolean | null }) {
  const [open, setOpen] = useState(false);
  const done = () => {
    setOpen(false);
    toast.success('Key generated and connected');
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Generate Key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Generate a payout key</DialogTitle>
          <DialogDescription>
            A payouts-only key, allowed from any IP address, is made on your gateway account and connected here. Its
            secret is stored encrypted and never shown.
          </DialogDescription>
        </div>
        {twoFactor === false ? (
          <TwoFactorFirst>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Close
              </Button>
            </DialogClose>
          </TwoFactorFirst>
        ) : (
          <GenerateKeyForm onDone={done} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevokeKeyButton({ connected, twoFactor }: { connected: ConnectedKey; twoFactor: boolean | null }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const generated = connected.origin === 'generated';
  const [state, action, pending] = useActionState<SaveKeyState, FormData>(async (prev, formData) => {
    const r = await revokeKeyInUseAction(prev, formData);
    if (r.done) {
      setOpen(false);
      toast.success(generated ? 'Key revoked and deleted' : 'Key disconnected');
    }
    return r;
  }, {});
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Revoke key {connected.kid}?</DialogTitle>
          <DialogDescription>
            {generated
              ? 'amusemonk stops paying with it and it’s deleted from your gateway account.'
              : 'amusemonk stops paying with it. It stays on your gateway account, since it wasn’t made here.'}{' '}
            Payouts not yet sent wait until a new key is connected.
          </DialogDescription>
        </div>
        <form action={action} className="flex flex-col gap-4">
          {generated && twoFactor !== false && (
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

function DeleteKeyButton({ kid, madeHere, twoFactor }: { kid: string; madeHere: boolean; twoFactor: boolean | null }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [state, action, pending] = useActionState<SaveKeyState, FormData>(async (prev, formData) => {
    const r = await deleteKeyAction(prev, formData);
    if (r.done) {
      setOpen(false);
      toast.success(`Key ${kid} deleted`);
    }
    return r;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Delete key ${kid}`}>
          <Trash2 />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Delete key {kid}?</DialogTitle>
          <DialogDescription>
            {madeHere
              ? 'It’s deleted from your gateway account. This can’t be undone.'
              : 'Made outside amusemonk. Something else may be using it, and it stops working. This can’t be undone.'}
          </DialogDescription>
        </div>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="kid" value={kid} />
          {twoFactor !== false && (
            <>
              <OtpField value={code} onChange={setCode} autoFocus />
              <input type="hidden" name="code" value={code} />
            </>
          )}
          {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? 'Deleting…' : 'Delete Key'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GatewayKeys({
  keys,
  error,
  connected,
  madeHere,
  twoFactor,
}: {
  keys: GatewayKeyRow[];
  error: string | null;
  connected: ConnectedKey | null;
  madeHere: string[];
  twoFactor: boolean | null;
}) {
  return (
    <section id="api-keys" className="flex scroll-mt-20 flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold tracking-tight">API keys</h2>
        {!error && <Badge>{keys.length}</Badge>}
        {!connected && (
          <div className="ml-auto flex items-center gap-2">
            <GenerateKeyButton twoFactor={twoFactor} />
          </div>
        )}
      </div>
      {!connected && (
        <p className="bg-warn-soft text-warn rounded-lg px-4 py-2.5 text-sm font-semibold">
          No key is connected for payouts yet. Generate one, or paste one you already have.
        </p>
      )}
      {error ? (
        <ErrorBanner>
          Couldn’t list your keys: {error}
          {connected && <> Paying with {connected.kid}.</>}
        </ErrorBanner>
      ) : keys.length === 0 ? (
        <EmptyState icon={<KeyRound />} title="No API keys on your gateway account" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Can do</TableHead>
              <TableHead>Allowed IPs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => {
              const inUse = k.kid === connected?.kid;
              const made = madeHere.includes(k.kid);
              return (
                <TableRow key={k.kid}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Copyable value={k.kid} label="API key" mono />
                      {inUse && <Badge tone="info">In use</Badge>}
                      {made && <Badge>Made by amusemonk</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>{k.scope === 'uapi' ? 'Payouts only' : k.scope || 'Everything'}</TableCell>
                  <TableCell className="font-mono text-xs">{k.ips.length ? k.ips.join(', ') : 'None'}</TableCell>
                  <TableCell>
                    <Badge tone={k.active ? 'ok' : 'neutral'}>{k.active ? 'Active' : 'Disabled'}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    <Time at={k.createdAt} inline />
                  </TableCell>
                  <TableCell>
                    <span className="flex justify-end">
                      {inUse ? (
                        <RevokeKeyButton connected={connected!} twoFactor={twoFactor} />
                      ) : (
                        <DeleteKeyButton kid={k.kid} madeHere={made} twoFactor={twoFactor} />
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
