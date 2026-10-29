'use client';

import { useActionState, useState } from 'react';
import { changePasswordAction, type FormState } from './actions';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  ErrorBanner,
  Field,
  PasswordInput,
  toast,
} from '@/ui';

const EMPTY = { current: '', next: '', confirm: '' };

export function PasswordDialog() {
  const [open, setOpen] = useState(false);
  // Controlled, so a refused change doesn't wipe what was typed.
  const [values, setValues] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const r = await changePasswordAction(prev, formData);
    if (r.done) {
      setOpen(false);
      setValues(EMPTY);
      toast.success('Password changed. Your other sessions were signed out.');
    }
    return r;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Change Password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Change your password</DialogTitle>
          <DialogDescription>It’s your gateway password, so it changes there too.</DialogDescription>
        </div>
        <form action={action} className="flex flex-col gap-4">
          <Field label="Current password" htmlFor="pw-current">
            <PasswordInput id="pw-current" name="current" autoComplete="current-password" value={values.current} onChange={set('current')} />
          </Field>
          <Field label="New password" htmlFor="pw-next">
            <PasswordInput id="pw-next" name="next" autoComplete="new-password" value={values.next} onChange={set('next')} />
          </Field>
          <Field label="Repeat new password" htmlFor="pw-confirm">
            <PasswordInput id="pw-confirm" name="confirm" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} />
          </Field>
          {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
          <Button type="submit" disabled={pending}>
            {pending ? 'Changing password…' : 'Change Password'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
