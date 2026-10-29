'use client';

import { useState, useTransition } from 'react';
import { cancelFileAction, confirmPaymentAction, fetchPayoutStatusAction, payoutRawAction, type RawExchange } from './actions';
import {
  Braces,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  ErrorBanner,
  Field,
  RefreshCw,
  Send,
  Textarea,
  toast,
} from '@/ui';

export function ConfirmPaymentButton({
  fileId,
  count,
  total,
  balance,
}: {
  fileId: string;
  count: number;
  total: string;
  balance: { amount: string; asOf: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    // Can't be dismissed while confirming: the result (or its error) must be seen.
    <Dialog open={open} onOpenChange={(o) => pending || (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        <Button>
          <Send />
          Confirm Payment · {total}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>
            Pay {count} {count === 1 ? 'beneficiary' : 'beneficiaries'} {total}?
          </DialogTitle>
          <DialogDescription>
            Each row is sent from your gateway account, once, under its client_reference_id. This can’t be undone
            once a payout reaches the gateway.
          </DialogDescription>
        </div>
        <dl className="bg-sunken grid grid-cols-2 gap-3 rounded-lg p-4 text-sm">
          <dt className="text-muted-foreground">File total</dt>
          <dd className="tabular text-right font-bold">{total}</dd>
          <dt className="text-muted-foreground">Your balance</dt>
          <dd className="tabular text-right font-semibold">
            {balance ? balance.amount : '—'}
            {balance && <span className="text-muted-foreground block text-xs font-normal">as of {balance.asOf}</span>}
          </dd>
        </dl>
        <p className="text-muted-foreground text-xs">Your balance is checked again with the gateway before anything is sent.</p>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Not yet
            </Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await confirmPaymentAction(fileId);
                if (r.error) setError(r.error);
                else {
                  toast.success('Payment confirmed. Payouts are being sent.');
                  setOpen(false);
                }
              })
            }
          >
            <Send />
            {pending ? 'Confirming…' : 'Confirm Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelFileButton({ fileId, filename }: { fileId: string; filename: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setReason(''), setError(null)))}>
      <DialogTrigger asChild>
        <Button variant="outline">
          Cancel File
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Cancel {filename}?</DialogTitle>
          <DialogDescription>
            Nothing has been sent. Its references can’t be used again, so a corrected file needs new ones.
          </DialogDescription>
        </div>
        <Field label="Reason (optional)" htmlFor="cancel-reason">
          <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong amounts for two vendors" />
        </Field>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Keep File</Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await cancelFileAction(fileId, reason);
                if (r.error) setError(r.error);
                else {
                  toast.success(`${filename} cancelled`);
                  setOpen(false);
                }
              })
            }
          >
            {pending ? 'Cancelling…' : 'Cancel File'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FetchStatusButton({ payoutId, reference }: { payoutId: string; reference: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Fetch status of ${reference}`}
      title="Fetch status from the gateway"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await fetchPayoutStatusAction(payoutId);
          if (r.error) toast.error(r.error);
          else toast.success(`${reference}: ${r.status}`);
        })
      }
    >
      <RefreshCw className={pending ? 'animate-spin' : undefined} />
    </Button>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-bold tracking-[0.12em] uppercase">{label}</span>
      <pre className="bg-surface max-h-80 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed">
        {value === null || value === undefined ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function RawDataButton({ payoutId, reference }: { payoutId: string; reference: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ error?: string; exchanges?: RawExchange[] } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) start(async () => setData(await payoutRawAction(payoutId)));
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Raw gateway data for ${reference}`} title="Raw UAPI responses">
          <Braces />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl gap-0 overflow-hidden p-0">
        <div className="flex shrink-0 flex-col gap-1 border-b px-5 py-4">
          <DialogTitle className="text-base">Raw UAPI data</DialogTitle>
          <DialogDescription className="font-mono text-xs">{reference}</DialogDescription>
        </div>
        <div className="bg-sunken/40 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          {pending || !data ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : data.error ? (
            <ErrorBanner>{data.error}</ErrorBanner>
          ) : !data.exchanges?.length ? (
            <p className="text-muted-foreground text-sm">Nothing has been sent to the gateway for this payout yet.</p>
          ) : (
            data.exchanges.map((x, i) => (
              <section key={i} className="bg-surface/60 flex flex-col gap-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold">{x.title}</h3>
                  <span className="text-muted-foreground tabular text-xs">{x.at}</span>
                </div>
                {x.meta && <div className="text-muted-foreground font-mono text-xs">{x.meta}</div>}
                {x.request !== undefined && <Json label="Request" value={x.request} />}
                <Json label="Response" value={x.response} />
              </section>
            ))
          )}
        </div>
        <DialogFooter className="shrink-0 border-t px-5 py-3">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
