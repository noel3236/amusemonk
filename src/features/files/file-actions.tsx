'use client';

import { useState, useTransition } from 'react';
import { cancelFileAction, confirmPaymentAction, fetchPayoutStatusAction } from './actions';
import {
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
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
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
            <Button variant="ghost">Not yet</Button>
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
