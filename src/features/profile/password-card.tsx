'use client';

import { useActionState, useState } from 'react';
import { changePasswordAction, type FormState } from './actions';
import { Button, Card, ErrorBanner, Field, Lock, PasswordInput, toast } from '@/ui';

const EMPTY = { current: '', next: '', confirm: '' };

export function PasswordCard() {
  // Controlled, so a refused change doesn't wipe what was typed.
  const [values, setValues] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const r = await changePasswordAction(prev, formData);
    if (r.done) {
      setValues(EMPTY);
      toast.success('Password changed. Your other sessions were signed out.');
    }
    return r;
  }, {});

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md">
          <Lock className="size-4" />
        </span>
        <h2 className="text-sm font-bold tracking-tight">Password</h2>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Current password" htmlFor="pw-current">
            <PasswordInput id="pw-current" name="current" autoComplete="current-password" value={values.current} onChange={set('current')} />
          </Field>
          <Field label="New password" htmlFor="pw-next">
            <PasswordInput id="pw-next" name="next" autoComplete="new-password" value={values.next} onChange={set('next')} />
          </Field>
          <Field label="Repeat new password" htmlFor="pw-confirm">
            <PasswordInput id="pw-confirm" name="confirm" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} />
          </Field>
        </div>
        {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            It’s your gateway password: it changes there too, and your other sessions are signed out.
          </p>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Changing password…' : 'Change Password'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
