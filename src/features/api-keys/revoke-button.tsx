'use client';

import { useState, useTransition } from 'react';
import { revokeKeyAction } from './actions';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  toast,
} from '@/ui';

export function RevokeKeyButton({ id, kid, email }: { id: string; kid: string; email: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const revoke = () =>
    start(async () => {
      const r = await revokeKeyAction(id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Key ${kid} revoked`);
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-2">
          <DialogTitle>Revoke key {kid}?</DialogTitle>
          <DialogDescription>
            amusemonk stops signing payouts for {email ?? 'this user'} with this key immediately. Payouts
            already sent keep their status. The key stays enabled at the gateway — disable it there too.
          </DialogDescription>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="danger" onClick={revoke} disabled={pending}>
            {pending ? 'Revoking…' : 'Revoke Key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
