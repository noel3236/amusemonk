'use client';

import { useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import type { UploadWarning } from '@/db/schema';
import { formatDateTime } from '@/lib/format';
import { cancelFileAction, confirmPaymentAction } from './actions';
import {
  Badge,
  Banner,
  Button,
  CircleAlert,
  CircleCheck,
  CircleX,
  Dialog,
  DialogBar,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTrigger,
  ErrorBanner,
  Field,
  FileSpreadsheet,
  Send,
  Textarea,
} from '@/ui';

export interface FileReview {
  fileId: string;
  filename: string;
  rowCount: number;
  total: string;
  balance: { amount: string; asOf: string } | null;
  warnings: UploadWarning[];
}

export type DecisionMode = 'review' | 'cancel';

const lookAlikeOf = (review: FileReview) => review.warnings.find((w) => w.code === 'SIMILAR_FILES');

export function LookAlikeWarning({ warning, linkBase = '/files' }: { warning: UploadWarning; linkBase?: string }) {
  const n = warning.files.length;
  return (
    <Banner tone="warn" icon={<CircleAlert />}>
      <span className="font-bold">Looks like {n === 1 ? 'another of your files' : `${n} of your files`}</span>
      <span>{warning.message} Check it isn’t a repeat before you confirm.</span>
      <span className="flex flex-wrap gap-x-4 gap-y-1">
        {warning.files.map((f) => (
          <Link key={f.id} href={`${linkBase}/${f.id}`} target="_blank" className="font-semibold underline-offset-2 hover:underline">
            {f.name} <span className="text-muted-foreground font-normal">· {formatDateTime(new Date(f.uploadedAt))}</span>
          </Link>
        ))}
      </span>
    </Banner>
  );
}

// Confirm Payment and Cancel File for a waiting file. The upload modal and the file page both drive this one
// state, so the two places behave the same.
export function useFileDecision(initialMode: DecisionMode = 'review') {
  const [mode, setMode] = useState(initialMode);
  const [done, setDone] = useState<'confirmed' | 'cancelled' | null>(null);
  const [notARepeat, setNotARepeat] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const title =
    done === 'confirmed' ? 'Payment confirmed' : done === 'cancelled' ? 'File cancelled' : mode === 'cancel' ? 'Cancel this file?' : 'Review and confirm';

  return {
    initialMode,
    mode,
    done,
    notARepeat,
    setNotARepeat,
    reason,
    setReason,
    error,
    pending,
    title,
    switchMode(m: DecisionMode) {
      setMode(m);
      setError(null);
    },
    reset() {
      setMode(initialMode);
      setDone(null);
      setNotARepeat(false);
      setReason('');
      setError(null);
    },
    confirm(review: FileReview) {
      if (lookAlikeOf(review) && !notARepeat) {
        setError('Tick the box to confirm this isn’t a repeat.');
        return;
      }
      setError(null);
      start(async () => {
        const r = await confirmPaymentAction(review.fileId, notARepeat);
        if (r.error) setError(r.error);
        else setDone('confirmed');
      });
    },
    cancel(review: FileReview) {
      setError(null);
      start(async () => {
        const r = await cancelFileAction(review.fileId, reason);
        if (r.error) setError(r.error);
        else setDone('cancelled');
      });
    },
  };
}

export type FileDecisionState = ReturnType<typeof useFileDecision>;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">{label}</span>
      <span className="tabular text-lg font-extrabold tracking-tight">{value}</span>
      {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
    </div>
  );
}

// The body and footer of the decision, for a dialog that already has its DialogHeader. `children` is extra
// review content (the upload modal's row preview).
export function FileDecision({
  d,
  review,
  onClose,
  fileHref,
  children,
}: {
  d: FileDecisionState;
  review: FileReview;
  onClose: () => void;
  fileHref?: string;
  children?: ReactNode;
}) {
  const lookAlike = lookAlikeOf(review);
  const payouts = `${review.rowCount} ${review.rowCount === 1 ? 'payout' : 'payouts'}`;
  const keep = () => (d.initialMode === 'cancel' ? onClose() : d.switchMode('review'));

  return (
    <>
      <DialogBody>
        {d.done ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            {d.done === 'confirmed' ? <CircleCheck className="text-ok size-8" /> : <CircleAlert className="text-muted-foreground size-8" />}
            <p className="font-bold">{d.done === 'confirmed' ? `${payouts} · ${review.total} are being sent` : 'Nothing from this file was sent'}</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              {d.done === 'confirmed'
                ? 'Each row goes out once under its client_reference_id; statuses update as the gateway answers.'
                : 'The file stays in your list as cancelled.'}
            </p>
          </div>
        ) : d.mode === 'cancel' ? (
          <>
            <p className="text-sm">
              Nothing from {review.filename} has been sent. Its references can’t be used again, so a corrected file needs new ones.
            </p>
            <Field label="Reason (optional)" htmlFor="cancel-reason">
              <Textarea id="cancel-reason" value={d.reason} onChange={(e) => d.setReason(e.target.value)} placeholder="e.g. Wrong amounts for two vendors" />
            </Field>
          </>
        ) : (
          <>
            <div className="bg-surface grid grid-cols-3 gap-4 rounded-lg border px-4 py-3">
              <Stat label="Payouts" value={String(review.rowCount)} />
              <Stat label="File total" value={review.total} />
              <Stat
                label="Your balance"
                value={review.balance?.amount ?? '—'}
                sub={review.balance ? `as of ${review.balance.asOf} · checked again before sending` : 'checked with the gateway before sending'}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Each row is sent once from your gateway account under its client_reference_id, and can’t be undone once it reaches the gateway.
            </p>
            {lookAlike && <LookAlikeWarning warning={lookAlike} />}
            {children}
          </>
        )}
      </DialogBody>

      <DialogBar>
        {d.error && <ErrorBanner className="basis-full">{d.error}</ErrorBanner>}
        {d.done ? (
          <>
            {fileHref && (
              <Button asChild variant="ghost">
                <Link href={fileHref}>Open File Page</Link>
              </Button>
            )}
            <Button className="ml-auto" onClick={onClose}>
              Done
            </Button>
          </>
        ) : d.mode === 'cancel' ? (
          <>
            <Button variant="ghost" disabled={d.pending} onClick={keep}>
              Keep File
            </Button>
            <Button variant="danger" className="ml-auto" disabled={d.pending} onClick={() => d.cancel(review)}>
              <CircleX />
              {d.pending ? 'Cancelling…' : `Cancel ${payouts}`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" disabled={d.pending} onClick={() => d.switchMode('cancel')}>
              <CircleX />
              Cancel File
            </Button>
            {lookAlike ? (
              <label className="ml-auto flex max-w-sm cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={d.notARepeat}
                  onChange={(e) => d.setNotARepeat(e.target.checked)}
                  className="accent-primary mt-0.5 size-4 shrink-0"
                />
                <span>
                  I’ve checked: this isn’t a repeat of{' '}
                  {lookAlike.files.length === 1 ? 'the look-alike file' : `the ${lookAlike.files.length} look-alike files`}.
                </span>
              </label>
            ) : (
              <span className="text-muted-foreground ml-auto text-xs">Close to decide later; the file keeps waiting.</span>
            )}
            <Button disabled={d.pending} onClick={() => d.confirm(review)}>
              <Send />
              {d.pending ? 'Confirming…' : `Confirm Payment · ${review.total}`}
            </Button>
          </>
        )}
      </DialogBar>
    </>
  );
}

// The decision on its own page-level dialog (the file page's Cancel File and Confirm Payment).
export function FileDecisionDialog({ review, initialMode, children }: { review: FileReview; initialMode: DecisionMode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const d = useFileDecision(initialMode);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (d.pending) return;
        setOpen(o);
        if (o) d.reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent pinned className="max-w-2xl">
        <DialogHeader
          icon={<FileSpreadsheet />}
          title={d.title}
          description={review.filename}
          aside={!d.done && <Badge tone="warn">Waiting for confirmation</Badge>}
          closeDisabled={d.pending}
        />
        <FileDecision d={d} review={review} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
