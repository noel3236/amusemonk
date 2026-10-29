'use client';

import { useState, useTransition } from 'react';
import { fetchPayoutStatusAction, payoutRawAction, type RawExchange } from './actions';
import { Braces, Button, Dialog, DialogBody, DialogContent, DialogHeader, DialogTrigger, ErrorBanner, RefreshCw, toast } from '@/ui';

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
      <DialogContent pinned className="max-w-3xl">
        <DialogHeader icon={<Braces />} title="Raw UAPI data" description={<span className="font-mono">{reference}</span>} />
        <DialogBody>
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
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
