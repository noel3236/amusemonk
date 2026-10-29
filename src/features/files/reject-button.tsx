'use client';

import { useState, useTransition } from 'react';
import { rejectFileAction } from './admin-actions';
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
  Textarea,
  toast,
} from '@/ui';

export function RejectFileButton({ fileId, filename, owner }: { fileId: string; filename: string; owner: string | null }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setReason(''), setError(null)))}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Reject {filename}?</DialogTitle>
          <DialogDescription>
            {owner ?? 'The owner'} won’t be able to confirm payment for it. None of its payouts have been sent. Its
            references can’t be reused, so a corrected file needs new ones.
          </DialogDescription>
        </div>
        <Field label="Reason shown to the user" htmlFor="reject-reason">
          <Textarea id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Beneficiary list not signed off by finance" />
        </Field>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await rejectFileAction(fileId, reason);
                if (r.error) setError(r.error);
                else {
                  toast.success(`${filename} rejected`);
                  setOpen(false);
                }
              })
            }
          >
            {pending ? 'Rejecting…' : 'Reject File'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
